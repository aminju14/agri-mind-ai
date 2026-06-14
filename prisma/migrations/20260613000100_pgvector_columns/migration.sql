-- pgvector embedding columns + HNSW index
-- Spec: docs/DATABASE.md §5. Prisma cannot express vector(N) natively, so the
-- embedding columns are added here as a paired raw-SQL migration immediately after
-- the init migration that created the owning tables.
--
-- EMBED_DIM = 1536 (text-embedding-3-large @ dimensions=1536) so HNSW is usable
-- (HNSW supports <=2000 dims). Ingestion and query embeddings MUST match this dim.

-- The `vector` extension is already created by the init migration.

-- Add embedding vector columns ------------------------------------------------
ALTER TABLE "chunk_embeddings"      ADD COLUMN "embedding" vector(1536);
ALTER TABLE "query_embedding_cache" ADD COLUMN "embedding" vector(1536);

-- Cosine-distance HNSW index (MUST match the retrieval operator `<=>` /
-- vector_cosine_ops; a mismatch silently disables the index — docs/DATABASE.md §5.3).
CREATE INDEX "chunk_embeddings_hnsw"
  ON "chunk_embeddings"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
