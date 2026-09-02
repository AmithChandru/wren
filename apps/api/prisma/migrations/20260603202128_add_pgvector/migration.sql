-- pgvector support for the Chunk table.
--
-- Order matters: the `vector` type must exist before the column that uses it, so
-- CREATE EXTENSION runs first. Prisma generated only the ADD COLUMN line; the
-- extension and index are added by hand. All
-- statements use IF NOT EXISTS guards so the migration is safe to re-run.
--
-- The embedding dimension (1536) MUST match the embeddings provider's dimension
-- (OpenAI text-embedding-3-small / the mock default). Changing the provider's
-- dimension requires changing this column and re-indexing.

-- 1. Enable the pgvector extension (provides the `vector` type and operators).
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add the embedding column to Chunk.
ALTER TABLE "Chunk" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- 3. Cosine-distance index (the `<=>` operator). HNSW (pgvector >= 0.5) needs no
--    training and is a good default for v1's small content set.
CREATE INDEX IF NOT EXISTS chunk_embedding_hnsw
  ON "Chunk" USING hnsw (embedding vector_cosine_ops);
