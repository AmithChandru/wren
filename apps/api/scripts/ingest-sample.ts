// /ingest-sample acceptance: ingest seed/content/* into the demo tenant, then run
// a test retrieval to prove the RAG pipeline end to end and that search is
// tenant-scoped. Reproducible + idempotent (safe to re-run).
//
// Run via: pnpm --filter api ingest:sample
// (the package script bridges the repo-root .env with dotenv-cli).

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getEmbeddings } from "@wren/shared/providers";

import { prisma } from "../src/db/client.js";
import { DEMO_TENANT_ID } from "../src/db/constants.js";
import { ingestDocument } from "../src/services/ingest.js";
import { retrieve } from "../src/services/rag.js";

// seed/content lives at the repo root: this file is apps/api/scripts/ingest-sample.ts,
// so the repo root is three directories up.
const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, "../../../seed/content");

const TEST_QUERY = "how do plants make food?";
const TOP_K = 5;

/** Derive a human-readable title from a filename (strip extension, tidy separators). */
function titleFromFilename(filename: string): string {
  return path.basename(filename, path.extname(filename)).replace(/[-_]+/g, " ").trim();
}

/** Truncate content for readable console output. */
function preview(text: string, max = 160): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

async function main(): Promise<void> {
  const embeddings = getEmbeddings();
  console.log(`Embeddings provider: ${embeddings.name} (dimension ${embeddings.dimension})`);
  if (embeddings.name === "mock") {
    console.log(
      "  NOTE: mock embeddings are deterministic but not semantic — the pipeline " +
        "is exercised end to end, but relevance/ranking is approximate.",
    );
  }
  console.log("");

  // Idempotent: clear this tenant's existing chunks then documents before
  // re-ingesting, so re-runs don't accumulate duplicates. Both deletes are
  // tenant-scoped (no cross-tenant writes). Chunks first (FK -> Document).
  const deletedChunks = await prisma.chunk.deleteMany({ where: { tenantId: DEMO_TENANT_ID } });
  const deletedDocs = await prisma.document.deleteMany({ where: { tenantId: DEMO_TENANT_ID } });
  console.log(
    `Cleared existing demo-tenant data: ${deletedChunks.count} chunk(s), ` +
      `${deletedDocs.count} document(s).`,
  );

  // Ingest every file in seed/content/ (skip subdirectories).
  const entries = await readdir(CONTENT_DIR, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort();
  if (files.length === 0) {
    throw new Error(`No files found in ${CONTENT_DIR}`);
  }

  let totalChunks = 0;
  console.log(`\nIngesting ${files.length} file(s) from ${CONTENT_DIR}:`);
  for (const file of files) {
    const text = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const result = await ingestDocument({
      tenantId: DEMO_TENANT_ID,
      title: titleFromFilename(file),
      text,
      source: file,
    });
    totalChunks += result.chunks;
    console.log(`  - ${file}: ${result.chunks} chunk(s) (documentId ${result.documentId})`);
  }
  console.log(`\nIngested ${totalChunks} chunk(s) total across ${files.length} document(s).`);

  // Test retrieval (tenant-scoped).
  console.log(`\nRetrieval for "${TEST_QUERY}" (top ${TOP_K}, tenant "${DEMO_TENANT_ID}"):`);
  const hits = await retrieve(DEMO_TENANT_ID, TEST_QUERY, TOP_K);
  if (hits.length === 0) {
    console.log("  (no results)");
  }
  hits.forEach((hit, i) => {
    console.log(`  ${i + 1}. score=${hit.score.toFixed(4)}  ${preview(hit.content)}`);
  });

  // Prove tenant scoping: the SAME query against a tenant with no data returns 0.
  const crossTenant = await retrieve("nonexistent-tenant", TEST_QUERY, TOP_K);
  console.log(
    `\nCross-tenant check: retrieve("nonexistent-tenant", ...) returned ` +
      `${crossTenant.length} row(s) (expected 0).`,
  );

  // Total chunk count for the demo tenant (tenant-scoped count).
  const demoChunkCount = await prisma.chunk.count({ where: { tenantId: DEMO_TENANT_ID } });
  console.log(`Demo-tenant total chunk count: ${demoChunkCount}.`);

  if (crossTenant.length !== 0) {
    throw new Error("Tenant isolation FAILED: cross-tenant query returned rows.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error("ingest-sample failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
