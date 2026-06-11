// Retrieval: embed the user query -> tenant-scoped cosine nearest-neighbour search.
// This is what the Phase 5 chat flow will call to ground answers in client content.
//
// Tenant isolation: `retrieve` requires a tenantId and forwards it to searchChunks,
// whose SQL filters `WHERE "tenantId" = ...`. There is no code path that searches
// across tenants.

import { getEmbeddings } from "@wren/shared/providers";

import { EMBEDDING_DIM, searchChunks, type RetrievedChunk } from "../db/vector.js";

export type { RetrievedChunk } from "../db/vector.js";

/**
 * Retrieve the top-k chunks most similar to `query` for a single tenant.
 *
 * Embeds the query with the active provider, asserts the dimension matches the
 * vector column (fail loud, not at query time), then runs the tenant-scoped search.
 */
export async function retrieve(
  tenantId: string,
  query: string,
  k = 5,
): Promise<RetrievedChunk[]> {
  const embeddings = getEmbeddings();
  if (embeddings.dimension !== EMBEDDING_DIM) {
    throw new Error(
      `retrieve: embeddings provider "${embeddings.name}" has dimension ` +
        `${embeddings.dimension}, but the Chunk column is vector(${EMBEDDING_DIM}).`,
    );
  }

  const [queryEmbedding] = await embeddings.embed([query]);
  if (queryEmbedding === undefined) {
    throw new Error("retrieve: embeddings provider returned no vector for the query");
  }

  return searchChunks(tenantId, queryEmbedding, k);
}
