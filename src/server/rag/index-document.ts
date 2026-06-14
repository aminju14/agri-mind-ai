/**
 * TASK 6 — Index (store) an embedded document into Postgres + pgvector.
 *
 * Delegates the atomic write to the persistence repo (documents.ingestDocument), which
 * upserts the document by (source, checksum) and stores chunks + vector embeddings in one
 * transaction. Idempotent: re-indexing unchanged content is a no-op.
 */

import { ingestDocument } from "@/server/persistence/documents";
import { estimateTokens } from "./chunk-document";
import type { EmbeddedChunk } from "./embed-document";
import type { Lang } from "@/lib/types";

export interface DocumentMeta {
  title: string;
  source: string; // e.g. "agrimind.ai", "fao.org"
  category: string; // rice | corn | diseases | fertilization | ...
  lang: Lang;
  origin?: string; // kb | manual
  uri?: string | null;
  checksum: string;
}

export interface IndexResult {
  documentId: string;
  chunkCount: number;
  skipped: boolean;
}

/** Store an embedded document (doc + chunks + vectors) atomically. */
export async function indexDocument(
  meta: DocumentMeta,
  chunks: EmbeddedChunk[],
): Promise<IndexResult> {
  return ingestDocument(
    {
      title: meta.title,
      source: meta.source,
      category: meta.category,
      lang: meta.lang,
      origin: meta.origin ?? "kb",
      uri: meta.uri ?? null,
      checksum: meta.checksum,
    },
    chunks.map((c) => ({
      ordinal: c.index,
      lang: meta.lang,
      text: c.content,
      tokens: estimateTokens(c.content),
      embedding: c.embedding,
      model: c.model,
    })),
  );
}
