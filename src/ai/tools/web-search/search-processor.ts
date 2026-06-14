/**
 * TASK 8 — Search processor.
 *
 * Responsibilities (§Search Processor): remove duplicates, rank results, filter irrelevant /
 * low-quality content. Ranking: relevance → authority → freshness (§Result Ranking).
 *
 * Pure & deterministic. Safety: drops blocklisted spam/content-farm sources (§Search Safety).
 */

import {
  domainOf,
  isBlockedSource,
  webAuthorityTier,
  type RawSearchResult,
  type SearchResult,
} from "./search-types";

/** Minimum content length to be useful (filters thin/irrelevant snippets). */
const MIN_CONTENT = 40;
/** Trim each snippet so the assembled web context stays bounded. */
const MAX_SNIPPET = 700;

export interface ProcessedResult extends SearchResult {
  domain: string;
  authority: number;
  /** Days old (Infinity if unknown) — used for freshness ranking. */
  ageDays: number;
}

function ageDays(publishedAt?: string): number {
  if (!publishedAt) return Infinity;
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, (Date.now() - t) / 86_400_000);
}

/** Normalize a raw provider result into a SearchResult. */
function normalize(r: RawSearchResult): SearchResult {
  const snippet = (r.content ?? "").trim().slice(0, MAX_SNIPPET);
  return {
    title: r.title.trim(),
    url: r.url.trim(),
    snippet,
    relevanceScore: typeof r.score === "number" ? r.score : 0.5,
    publishedAt: r.publishedDate,
  };
}

/**
 * Process raw results: filter (blocklist + thin content) → dedup by domain+title →
 * rank by relevance, then authority, then freshness. Returns the top `limit` results.
 */
export function processResults(raw: RawSearchResult[], limit = 5): ProcessedResult[] {
  if (!raw || raw.length === 0) return [];

  // 1. filter unsafe + thin content
  const filtered = raw.filter((r) => r.url && !isBlockedSource(r.url) && (r.content ?? "").trim().length >= MIN_CONTENT);

  // 2. dedup by registrable domain + normalized title (keep first/highest-scoring)
  const seen = new Set<string>();
  const deduped: ProcessedResult[] = [];
  for (const r of filtered) {
    const domain = domainOf(r.url);
    const key = `${domain}|${r.title.trim().toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sr = normalize(r);
    deduped.push({
      ...sr,
      domain,
      authority: webAuthorityTier(r.url),
      ageDays: ageDays(r.publishedDate),
    });
  }

  // 3. rank: relevance (desc) → authority (desc) → freshness (newer first)
  deduped.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    if (b.authority !== a.authority) return b.authority - a.authority;
    return a.ageDays - b.ageDays;
  });

  return deduped.slice(0, limit);
}
