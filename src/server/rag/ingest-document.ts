/**
 * TASK 6 — Ingestion pipeline entry point.
 *
 *   raw document → chunk → embed → index (store with vectors)
 *
 * Idempotent by content checksum. Atomic per document (delegated to indexDocument).
 */

import { createHash } from "crypto";
import { createDefaultEmbeddingClient, type EmbeddingClient } from "./embed-client";
import { chunkDocument, type ChunkOptions } from "./chunk-document";
import { embedChunks } from "./embed-document";
import { indexDocument, type IndexResult } from "./index-document";
import type { Lang } from "@/lib/types";

export interface IngestInput {
  title: string;
  source: string;
  category: string;
  lang: Lang;
  body: string;
  uri?: string | null;
  origin?: string;
}

export interface IngestDeps {
  embedder?: EmbeddingClient;
  chunkOptions?: ChunkOptions;
}

/** Content checksum for idempotent dedup. */
export function contentChecksum(input: IngestInput): string {
  return createHash("sha256")
    .update(`${input.source}|${input.title}|${input.lang}|${input.body}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Ingest one document: chunk → embed → index. Returns the index result.
 * Throws if embedding fails (e.g. no OPENAI_API_KEY) — ingestion is an offline/admin job,
 * so failing loudly is correct (unlike the request path, which must never block).
 */
export async function ingestRawDocument(
  input: IngestInput,
  deps: IngestDeps = {},
): Promise<IndexResult> {
  const embedder = deps.embedder ?? createDefaultEmbeddingClient();
  const checksum = contentChecksum(input);

  const chunks = chunkDocument(input.body, deps.chunkOptions);
  if (chunks.length === 0) {
    return { documentId: "", chunkCount: 0, skipped: true };
  }

  const embedded = await embedChunks(embedder, chunks);

  return indexDocument(
    {
      title: input.title,
      source: input.source,
      category: input.category,
      lang: input.lang,
      origin: input.origin ?? "kb",
      uri: input.uri ?? null,
      checksum,
    },
    embedded,
  );
}
