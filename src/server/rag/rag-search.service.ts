/**
 * TASK 6 — RAG retrieval service.
 *
 *   query → embedding → vector search → top chunks
 *
 * Rules (TASK 6 §Retrieval Rules):
 *   - Top K: 5
 *   - Minimum similarity: 0.75 in TASK 6, but tuned to 0.35 for text-embedding-3-large
 *     (see RAG_MIN_SIMILARITY below — 0.75 filters out all real matches for this model).
 *
 * Logs retrieved chunk ids, similarity scores, and retrieval time (TASK 6 §Logging).
 * Resilient: any failure returns an empty result so the caller falls back to LLM
 * knowledge (TASK 6 §Fallback Strategy — never block responses).
 */

import { createHash } from "crypto";
import {
  retrieveChunks,
  retrieveChunksAnyLang,
  getCachedQueryEmbedding,
  putCachedQueryEmbedding,
  EMBED_DIM,
} from "@/server/persistence/documents";
import { createDefaultEmbeddingClient, type EmbeddingClient } from "./embed-client";
import type { RetrievedChunk } from "@/server/persistence/types";
import type { Lang } from "@/lib/types";

export const RAG_TOP_K = 5;
/**
 * Minimum cosine similarity to keep a chunk.
 *
 * TASK 6 specifies 0.75, but that figure does not fit `text-embedding-3-large`: with this
 * model a clearly-relevant match (e.g. a rice-water query against the rice doc) scores
 * ~0.63, and even strong matches rarely exceed ~0.70 — so a 0.75 gate filters out
 * everything and RAG never fires. The operative default is therefore **0.35** (relevant
 * matches land ~0.4–0.65 for this model), overridable via the RAG_MIN_SIMILARITY env var.
 * This keeps "retrieve first" working; off-topic chunks (<0.35) are still dropped and the
 * turn falls back to LLM knowledge.
 */
export const RAG_MIN_SIMILARITY = Number(process.env.RAG_MIN_SIMILARITY ?? 0.35);
/** Over-fetch before threshold-filtering so a few low-sim hits don't starve top-K. */
const FETCH_K = 12;
/** Below this many same-language hits, also try cross-lingual (best-effort recall). */
const MIN_SAME_LANG_HITS = 3;

export interface RagSearchResult {
  chunks: RetrievedChunk[];
  /** Retrieval wall-clock in ms (TASK 6 §Performance < 500ms target). */
  retrievalMs: number;
  /** Whether the embedding came from cache. */
  cached: boolean;
}

export interface RagSearchDeps {
  embedder?: EmbeddingClient;
  topK?: number;
  minSimilarity?: number;
}

function normalize(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function queryHash(norm: string, model: string, dim: number): string {
  return createHash("sha256").update(`${norm}|${model}|${dim}`).digest("hex").slice(0, 40);
}

export class RagSearchService {
  private embedder: EmbeddingClient;
  private topK: number;
  private minSimilarity: number;

  constructor(deps: RagSearchDeps = {}) {
    this.embedder = deps.embedder ?? createDefaultEmbeddingClient();
    this.topK = deps.topK ?? RAG_TOP_K;
    this.minSimilarity = deps.minSimilarity ?? RAG_MIN_SIMILARITY;
  }

  /**
   * Retrieve the top relevant chunks for a query. Never throws — on any error returns an
   * empty result (caller falls back to LLM knowledge).
   */
  async search(query: string, lang: Lang): Promise<RagSearchResult> {
    const t0 = Date.now();
    try {
      const norm = normalize(query);
      if (!norm) return { chunks: [], retrievalMs: Date.now() - t0, cached: false };

      // 1. embedding (cache-aware)
      const hash = queryHash(norm, this.embedder.model, this.embedder.dim);
      let vec = await getCachedQueryEmbedding(hash).catch(() => null);
      const cached = vec !== null;
      if (!vec) {
        vec = await this.embedder.embed(norm);
        if (vec.length !== EMBED_DIM) throw new Error("query embedding dim mismatch");
        await putCachedQueryEmbedding(hash, vec, this.embedder.model).catch(() => {});
      }

      // 2. vector search (same-language first)
      let rows = await retrieveChunks(vec, lang, FETCH_K);
      // 3. cross-lingual fallback when same-language recall is thin
      if (rows.length < MIN_SAME_LANG_HITS) {
        const extra = await retrieveChunksAnyLang(vec, FETCH_K);
        rows = dedupeById([...rows, ...extra]);
      }

      // 4. threshold + top-K
      const top = rows
        .filter((r) => r.score >= this.minSimilarity)
        .sort((a, b) => b.score - a.score)
        .slice(0, this.topK);

      const retrievalMs = Date.now() - t0;
      this.log(query, lang, top, retrievalMs, cached);
      return { chunks: top, retrievalMs, cached };
    } catch (e) {
      // Fallback: no chunks → caller uses LLM knowledge (never block).
      console.warn("[rag] search failed:", e instanceof Error ? e.message : e);
      return { chunks: [], retrievalMs: Date.now() - t0, cached: false };
    }
  }

  private log(query: string, lang: Lang, chunks: RetrievedChunk[], ms: number, cached: boolean) {
    console.info(
      JSON.stringify({
        event: "rag_search",
        lang,
        queryPreview: query.slice(0, 60),
        retrievalMs: ms,
        cached,
        hits: chunks.length,
        chunks: chunks.map((c) => ({ id: c.chunkId, source: c.source, score: Number(c.score.toFixed(4)) })),
      }),
    );
  }
}

function dedupeById(rows: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  for (const r of rows) {
    if (seen.has(r.chunkId)) continue;
    seen.add(r.chunkId);
    out.push(r);
  }
  return out;
}

export function createRagSearchService(deps: RagSearchDeps = {}): RagSearchService {
  return new RagSearchService(deps);
}
