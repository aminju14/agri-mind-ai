/**
 * TASK 8 — Web Search System types.
 *
 * Web search complements RAG: RAG holds evergreen internal knowledge; web search fetches
 * RECENT/real-time agricultural information (prices, news, regulations, weather, studies).
 * Knowledge-first: Memory → RAG → Web. Never search unnecessarily.
 *
 * Provider-agnostic: a WebSearchProvider abstracts Tavily (default), Serper, Exa, etc.
 */

/** Raw, normalized search result (TASK 8 §Search Result Schema). */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
  /** ISO date string when available (for freshness ranking). */
  publishedAt?: string;
}

/** What the provider returns before ranking/dedup. */
export interface RawSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
}

/** Options passed to a provider. */
export interface WebSearchOptions {
  /** Max results to request. */
  maxResults?: number;
  /** Bias toward recent results when the query is time-sensitive. */
  recent?: boolean;
  signal?: AbortSignal;
}

/** The provider seam — implementations: Tavily (default), Serper, Exa, or a fake in tests. */
export interface WebSearchProvider {
  readonly name: string;
  /** Returns raw results, or throws on hard failure (caller falls back to RAG-only). */
  search(query: string, lang: "en" | "id", opts: WebSearchOptions): Promise<RawSearchResult[]>;
}

/** Search categories the system supports (TASK 8 §Search Categories). */
export type SearchCategory =
  | "agricultural_news"
  | "commodity_prices"
  | "market_trends"
  | "scientific_updates"
  | "weather"
  | "general_recent";

/** The router's decision for a turn (TASK 8 §Search Routing / §Tool Selection). */
export interface SearchDecision {
  needsWebSearch: boolean;
  category?: SearchCategory;
  /** Why the decision was made (logging/explainability). */
  reason: string;
}

// ---------------------------------------------------------------------------
// Authority ranking (TASK 8 §Authority Ranking) — higher tier = more authoritative.
// ---------------------------------------------------------------------------

export const WEB_AUTHORITY = {
  GOVERNMENT: 6,
  UNIVERSITY: 5,
  RESEARCH_INSTITUTION: 4,
  JOURNAL: 3,
  ORGANIZATION: 2,
  TRUSTED_PUBLICATION: 1,
  LOW_AUTHORITY: 0,
} as const;

export type WebAuthorityTier = (typeof WEB_AUTHORITY)[keyof typeof WEB_AUTHORITY];

/** Sites we never want to cite (TASK 8 §Search Safety). */
const BLOCKLIST = /pinterest|quora|reddit|facebook|tiktok|answers\.|ehow|wikihow|blogspot|wordpress\.com|medium\.com/;

/** Trusted news/agricultural publications. */
const TRUSTED_PUBLICATIONS =
  /reuters|bloomberg|apnews|bbc|jakartapost|kompas|tempo|antaranews|thejakartapost|agfax|agriculture\.com|farmprogress/;

/** Classify a result URL's domain into an authority tier (TASK 8 §Authority Ranking). */
export function webAuthorityTier(url: string): WebAuthorityTier {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }
  if (/\.gov(\.|$)|\.go\.[a-z]{2}$|usda/.test(host)) return WEB_AUTHORITY.GOVERNMENT;
  if (/\.edu(\.|$)|\.ac\.[a-z]{2}$|university|univ/.test(host)) return WEB_AUTHORITY.UNIVERSITY;
  if (/cgiar|irri|icrisat|embrapa|cabi|research|institute|cirad/.test(host))
    return WEB_AUTHORITY.RESEARCH_INSTITUTION;
  if (/journal|sciencedirect|springer|wiley|elsevier|mdpi|doi\.org|ncbi|pubmed|nature\.com/.test(host))
    return WEB_AUTHORITY.JOURNAL;
  if (/\.org(\.|$)|extension/.test(host)) return WEB_AUTHORITY.ORGANIZATION;
  if (TRUSTED_PUBLICATIONS.test(host)) return WEB_AUTHORITY.TRUSTED_PUBLICATION;
  return WEB_AUTHORITY.LOW_AUTHORITY;
}

/** True if a URL is a known spam/content-farm/low-quality site (TASK 8 §Search Safety). */
export function isBlockedSource(url: string): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }
  return BLOCKLIST.test(host);
}

/** Bare registrable-ish domain for display/citation source. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
