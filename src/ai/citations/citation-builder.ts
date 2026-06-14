/**
 * TASK 7 — Citation builder.
 *
 * Responsibilities (§Citation Builder Responsibilities):
 *   1. Receive retrieved chunks.
 *   2. Extract source metadata.
 *   3. Remove duplicate citations (collapse multiple chunks of the same document → one).
 *   4. Rank citations (similarity → source quality → retrieval order).
 *   5/6 are the service's job (store + return).
 *
 * Pure & deterministic. Never throws on odd input — bad chunks are skipped.
 */

import type { RetrievedChunk } from "@/server/persistence/types";
import {
  sourceQualityTier,
  type CitationMeta,
  type RankedCitation,
  type WebCitationSource,
} from "./citation-types";

/** Extract citation metadata from a retrieved chunk (TASK 7 §Citation Metadata). */
export function toCitationMeta(chunk: RetrievedChunk): CitationMeta {
  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    sourceTitle: chunk.title,
    source: chunk.source,
    category: chunk.category,
    similarityScore: chunk.score,
  };
}

/**
 * Build ranked, de-duplicated, document-level citations from retrieved chunks.
 * Chunks are assumed in retrieval order (best first). Multiple chunks from the same
 * document merge into one citation whose score is the document's best chunk score.
 */
export function buildCitations(chunks: RetrievedChunk[]): RankedCitation[] {
  if (!chunks || chunks.length === 0) return [];

  // 1–3. group by document, keeping retrieval order + best score + all chunk ids.
  const byDoc = new Map<
    string,
    { meta: CitationMeta; chunkIds: string[]; bestScore: number; firstSeen: number }
  >();

  chunks.forEach((chunk, retrievalIndex) => {
    if (!chunk || !chunk.documentId || !chunk.chunkId) return; // skip malformed
    const meta = toCitationMeta(chunk);
    const existing = byDoc.get(chunk.documentId);
    if (existing) {
      existing.chunkIds.push(chunk.chunkId);
      if (meta.similarityScore > existing.bestScore) {
        existing.bestScore = meta.similarityScore;
        existing.meta = meta; // representative = best-scoring chunk
      }
    } else {
      byDoc.set(chunk.documentId, {
        meta,
        chunkIds: [chunk.chunkId],
        bestScore: meta.similarityScore,
        firstSeen: retrievalIndex,
      });
    }
  });

  // 4. rank: similarity (desc) → source quality (desc) → retrieval order (asc).
  const ranked = [...byDoc.values()]
    .map((g) => ({
      ...g,
      quality: sourceQualityTier(g.meta.source),
    }))
    .sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      if (b.quality !== a.quality) return b.quality - a.quality;
      return a.firstSeen - b.firstSeen;
    });

  return ranked.map<RankedCitation>((g, i) => ({
    kind: "kb",
    documentId: g.meta.documentId,
    sourceTitle: g.meta.sourceTitle,
    sourceUrl: g.meta.sourceUrl,
    source: g.meta.source,
    category: g.meta.category,
    similarityScore: g.bestScore,
    chunkIds: g.chunkIds,
    chunkId: g.meta.chunkId,
    qualityTier: g.quality,
    rank: i + 1,
  }));
}

/**
 * TASK 8 — build citations from WEB search sources (provenance = webUrl, not chunkId).
 * Dedup by URL. Score = the provider's relevance; qualityTier = web authority.
 */
export function buildWebCitations(sources: WebCitationSource[]): RankedCitation[] {
  if (!sources || sources.length === 0) return [];
  const seen = new Set<string>();
  const out: RankedCitation[] = [];
  for (const s of sources) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push({
      kind: "web",
      documentId: "", // web has no KB document
      sourceTitle: s.title,
      sourceUrl: s.url,
      source: s.domain,
      similarityScore: s.relevanceScore,
      chunkIds: [],
      chunkId: "",
      webUrl: s.url,
      qualityTier: s.authority,
      rank: 0,
    });
  }
  return out;
}

/**
 * TASK 8 — merge KB + Web citations into one ranked list (web + RAG appear together).
 * Rank: relevance/similarity (desc) → quality/authority (desc) → KB before Web on ties.
 * Re-assigns 1..N ranks.
 */
export function mergeCitations(kb: RankedCitation[], web: RankedCitation[]): RankedCitation[] {
  const merged = [...kb, ...web].sort((a, b) => {
    if (b.similarityScore !== a.similarityScore) return b.similarityScore - a.similarityScore;
    if (b.qualityTier !== a.qualityTier) return b.qualityTier - a.qualityTier;
    // KB (internal, authoritative) before web on a full tie.
    if (a.kind !== b.kind) return a.kind === "kb" ? -1 : 1;
    return 0;
  });
  return merged.map((c, i) => ({ ...c, rank: i + 1 }));
}
