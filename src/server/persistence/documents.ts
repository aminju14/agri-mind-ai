/**
 * Knowledge-base repository — documents + chunks + embeddings (RAG).
 *
 * These tables are GLOBAL (no RLS / no tenancy) — docs/DATABASE.md §13.2. The embedding
 * `vector(1536)` column is not modeled by Prisma, so embedding writes and the retrieval
 * query use raw SQL (docs/DATABASE.md §5, §6, §14).
 *
 * Ingestion is atomic per document (all chunks + all embeddings in one tx) so there are
 * never partially-embedded, un-citable documents (docs/DATABASE.md §14.2).
 */
import { prisma } from "./prisma";
import { createId } from "./id";
import type {
  CreateChunkInput,
  Lang,
  RetrievedChunk,
  UpsertDocumentInput,
} from "./types";

/** EMBED_DIM — must equal the vector column dim and the model output dim (DATABASE §12.3). */
export const EMBED_DIM = Number(process.env.EMBED_DIM ?? 1536);

/** Format a JS number[] as a pgvector literal: `[0.1,0.2,...]`. */
function toVectorLiteral(vec: number[]): string {
  if (vec.length !== EMBED_DIM) {
    throw new Error(
      `embedding dim ${vec.length} != EMBED_DIM ${EMBED_DIM} (DATABASE §12.3)`,
    );
  }
  return `[${vec.join(",")}]`;
}

/**
 * Ingest one document atomically: upsert the document (idempotent by source+checksum),
 * then (re)create its chunks + embeddings. Skips work if the checksum is unchanged.
 */
export async function ingestDocument(
  doc: UpsertDocumentInput,
  chunks: CreateChunkInput[],
): Promise<{ documentId: string; chunkCount: number; skipped: boolean }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.document.findUnique({
      where: { source_checksum: { source: doc.source, checksum: doc.checksum } },
      select: { id: true },
    });
    if (existing) {
      // Same content already ingested — idempotent no-op (DATABASE §14.2).
      return { documentId: existing.id, chunkCount: 0, skipped: true };
    }

    const created = await tx.document.create({
      data: {
        title: doc.title,
        source: doc.source,
        category: doc.category,
        lang: doc.lang,
        origin: doc.origin ?? "kb",
        uri: doc.uri ?? null,
        checksum: doc.checksum,
      },
      select: { id: true },
    });

    for (const ch of chunks) {
      const chunk = await tx.chunk.create({
        data: {
          documentId: created.id,
          ordinal: ch.ordinal,
          lang: ch.lang,
          text: ch.text,
          tokens: ch.tokens,
        },
        select: { id: true },
      });
      // vector column is raw SQL (not in the Prisma model).
      const vec = toVectorLiteral(ch.embedding);
      await tx.$executeRaw`
        INSERT INTO "chunk_embeddings" ("chunkId", "model", "dim", "embedding", "createdAt")
        VALUES (${chunk.id}, ${ch.model}, ${EMBED_DIM}, ${vec}::vector, now())
      `;
    }

    return { documentId: created.id, chunkCount: chunks.length, skipped: false };
  });
}

/**
 * Language-filtered cosine retrieval (RAG primary pass — docs/DATABASE.md §6).
 * Returns chunks with provenance + similarity score (1 - cosine_distance).
 * Cross-lingual fallback is the caller's responsibility (RAG service, ARCHITECTURE §6).
 */
export async function retrieveChunks(
  queryEmbedding: number[],
  lang: Lang,
  k: number,
): Promise<RetrievedChunk[]> {
  const vec = toVectorLiteral(queryEmbedding);
  const rows = await prisma.$queryRaw<
    Array<{
      chunk_id: string;
      document_id: string;
      title: string;
      category: string;
      source: string;
      lang: Lang;
      text: string;
      score: number;
    }>
  >`
    SELECT c."id"          AS chunk_id,
           d."id"          AS document_id,
           d."title"       AS title,
           d."category"    AS category,
           d."source"      AS source,
           c."lang"        AS lang,
           c."text"        AS text,
           1 - (e."embedding" <=> ${vec}::vector) AS score
    FROM "chunk_embeddings" e
    JOIN "chunks"    c ON c."id" = e."chunkId"
    JOIN "documents" d ON d."id" = c."documentId"
    WHERE c."lang" = ${lang}::"Lang"
    ORDER BY e."embedding" <=> ${vec}::vector
    LIMIT ${k}
  `;
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    title: r.title,
    category: r.category,
    source: r.source,
    lang: r.lang,
    text: r.text,
    score: Number(r.score),
  }));
}

/** Cross-lingual fallback: same query, no language filter (docs/DATABASE.md §6). */
export async function retrieveChunksAnyLang(
  queryEmbedding: number[],
  k: number,
): Promise<RetrievedChunk[]> {
  const vec = toVectorLiteral(queryEmbedding);
  const rows = await prisma.$queryRaw<
    Array<{
      chunk_id: string;
      document_id: string;
      title: string;
      category: string;
      source: string;
      lang: Lang;
      text: string;
      score: number;
    }>
  >`
    SELECT c."id"          AS chunk_id,
           d."id"          AS document_id,
           d."title"       AS title,
           d."category"    AS category,
           d."source"      AS source,
           c."lang"        AS lang,
           c."text"        AS text,
           1 - (e."embedding" <=> ${vec}::vector) AS score
    FROM "chunk_embeddings" e
    JOIN "chunks"    c ON c."id" = e."chunkId"
    JOIN "documents" d ON d."id" = c."documentId"
    ORDER BY e."embedding" <=> ${vec}::vector
    LIMIT ${k}
  `;
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    title: r.title,
    category: r.category,
    source: r.source,
    lang: r.lang,
    text: r.text,
    score: Number(r.score),
  }));
}

/** Query-embedding cache lookup (hot queries, 24h TTL — DATABASE §5/§6). */
export async function getCachedQueryEmbedding(queryHash: string): Promise<number[] | null> {
  const rows = await prisma.$queryRaw<Array<{ embedding: string }>>`
    SELECT "embedding"::text AS embedding
    FROM "query_embedding_cache"
    WHERE "queryHash" = ${queryHash} AND "expiresAt" > now()
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  // pgvector text form: "[0.1,0.2,...]"
  return rows[0].embedding.replace(/^\[|\]$/g, "").split(",").map(Number);
}

/** Store a query embedding in the cache (DATABASE §6). */
export async function putCachedQueryEmbedding(
  queryHash: string,
  embedding: number[],
  model: string,
  ttlHours = 24,
): Promise<void> {
  const vec = toVectorLiteral(embedding);
  const expires = new Date(Date.now() + ttlHours * 3600_000);
  const id = createId();
  await prisma.$executeRaw`
    INSERT INTO "query_embedding_cache" ("id", "queryHash", "model", "dim", "embedding", "expiresAt", "createdAt")
    VALUES (${id}, ${queryHash}, ${model}, ${EMBED_DIM}, ${vec}::vector, ${expires}, now())
    ON CONFLICT ("queryHash") DO UPDATE
      SET "embedding" = EXCLUDED."embedding", "expiresAt" = EXCLUDED."expiresAt"
  `;
}
