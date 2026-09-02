// Raw-SQL helpers for the pgvector `embedding` column on Chunk.
//
// Prisma does NOT query the `vector` type through its normal model API, so every
// vector insert/search goes through $executeRaw/$queryRaw with the `<=>` cosine
// operator.
//
// HARD RULES (enforced here, flagged by code-reviewer if violated):
//  - searchChunks is ALWAYS tenant-scoped (`WHERE "tenantId" = ...`). No query may
//    read across tenants.
//  - Never SELECT the `embedding` column back into Prisma — it chokes on the
//    unsupported type. Select only id/content and the computed score.
//  - The embedding dimension MUST equal EMBEDDING_DIM (the vector(N) column width).

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "./client.js";

/**
 * Minimal surface we need from a Prisma client: the two raw-query methods. Both
 * the base client and an interactive-transaction client (`tx` inside
 * `$transaction`) satisfy this, so callers can run inserts/searches inside a
 * transaction by passing `tx`.
 */
export type RawExecutor = Pick<PrismaClient, "$executeRaw" | "$queryRaw">;

/**
 * Width of the `vector(N)` column on Chunk. MUST equal the embeddings provider's
 * `dimension`. If you change embeddings providers/models (e.g. Voyage = 1024),
 * change BOTH this constant and the column (raw SQL migration), then re-index.
 */
export const EMBEDDING_DIM = 1536;

/** A retrieved chunk: cosine similarity in [0, 1] (1 = identical direction). */
export interface RetrievedChunk {
  id: string;
  content: string;
  score: number;
}

/**
 * Format a float vector as a pgvector literal: `[0.1,0.2,...]`. Passed as a bound
 * parameter and cast to `::vector` in SQL (never string-interpolated into SQL).
 */
const toVectorLiteral = (v: number[]): string => `[${v.join(",")}]`;

/**
 * Insert one chunk with its embedding via raw SQL (Prisma can't write the vector
 * type). Includes the denormalized `tenantId` so tenant-scoped search needs no
 * join. `id` is caller-generated (crypto.randomUUID) because the raw INSERT
 * bypasses Prisma's cuid default.
 */
export async function insertChunk(
  args: {
    id: string;
    tenantId: string;
    documentId: string;
    content: string;
    embedding: number[];
  },
  // Pass the interactive-transaction client (`tx`) to enroll this insert in a
  // transaction; defaults to the shared client for standalone inserts.
  client: RawExecutor = prisma,
): Promise<void> {
  await client.$executeRaw(
    Prisma.sql`
      INSERT INTO "Chunk" (id, "tenantId", "documentId", content, embedding)
      VALUES (
        ${args.id},
        ${args.tenantId},
        ${args.documentId},
        ${args.content},
        ${toVectorLiteral(args.embedding)}::vector
      )
    `,
  );
}

/**
 * Tenant-scoped cosine nearest-neighbour search — NON-NEGOTIABLE: the
 * `WHERE "tenantId" = ${tenantId}` clause must never be removed. `<=>` is cosine
 * DISTANCE (smaller = closer); `1 - distance` is the similarity score. Only
 * id/content/score are returned (the embedding is never read back into Prisma).
 */
export async function searchChunks(
  tenantId: string,
  queryEmbedding: number[],
  k = 5,
): Promise<RetrievedChunk[]> {
  const q = toVectorLiteral(queryEmbedding);
  return prisma.$queryRaw<RetrievedChunk[]>(
    Prisma.sql`
      SELECT id, content, 1 - (embedding <=> ${q}::vector) AS score
      FROM "Chunk"
      WHERE "tenantId" = ${tenantId}
      ORDER BY embedding <=> ${q}::vector
      LIMIT ${k}
    `,
  );
}
