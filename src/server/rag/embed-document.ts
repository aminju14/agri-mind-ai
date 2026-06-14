/**
 * TASK 6 — Embed document chunks.
 *
 * Turns chunked text into vectors via the EmbeddingClient. Batched for throughput.
 * The embedding model is recorded so retrieval can assert ingest/query consistency.
 */

import type { EmbeddingClient } from "./embed-client";
import type { DocChunk } from "./chunk-document";

export interface EmbeddedChunk extends DocChunk {
  embedding: number[];
  model: string;
}

/** Embed all chunks (batched). Returns chunks with their vectors, order preserved. */
export async function embedChunks(
  client: EmbeddingClient,
  chunks: DocChunk[],
): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) return [];
  const vectors = await client.embedBatch(chunks.map((c) => c.content));
  return chunks.map((c, i) => ({ ...c, embedding: vectors[i], model: client.model }));
}

/** Embed a single query string. */
export async function embedQuery(client: EmbeddingClient, query: string): Promise<number[]> {
  return client.embed(query);
}
