/**
 * TASK 8 — Web search service (facade / middleware used by the orchestrator).
 *
 * Pipeline: decide (router) → search (provider) → process (dedup/rank/filter) → build
 * context + web citation sources. Knowledge-first: only runs when the router says a turn
 * needs recent/real-time info AND a provider key is present.
 *
 * Resilient (§Error Handling): if Tavily fails or no key, returns an empty result so the
 * turn falls back to RAG-only — never breaks response generation, never leaks raw errors.
 * Target latency < 2s (§Performance). Logs query/duration/results/errors (§Logging).
 */

import type { AgentKey } from "@/ai/types";
import type { Lang } from "@/lib/types";
import type { WebCitationSource } from "@/ai/citations";
import {
  createDefaultWebSearchProvider,
  hasWebSearchKey,
} from "./tavily.service";
import { decideWebSearch } from "./search-router";
import { processResults, type ProcessedResult } from "./search-processor";
import { buildWebContext, WEB_MAX_CONTEXT_CHARS } from "./search-context-builder";
import { webAuthorityTier, type WebSearchProvider } from "./search-types";

const SEARCH_TIMEOUT_MS = 4000; // Tavily typical latency ~2–3s; 4s allows headroom
const MAX_RESULTS = 5;

export interface WebSearchResult {
  /** Whether web search ran this turn. */
  searched: boolean;
  /** Why (router reason / skip reason) — logging. */
  reason: string;
  /** The "WEB SEARCH RESULTS" context block ("" if none). */
  contextBlock: string;
  /** Web citation sources to merge with RAG citations. */
  citationSources: WebCitationSource[];
  /** Processed results actually used. */
  used: ProcessedResult[];
  /** Search wall-clock in ms. */
  searchMs: number;
}

const EMPTY = (reason: string, searchMs = 0): WebSearchResult => ({
  searched: false,
  reason,
  contextBlock: "",
  citationSources: [],
  used: [],
  searchMs,
});

export interface WebSearchServiceDeps {
  provider?: WebSearchProvider;
  maxContextChars?: number;
}

export class WebSearchService {
  private provider: WebSearchProvider | null;
  private maxContextChars: number;

  constructor(deps: WebSearchServiceDeps = {}) {
    // Only build the provider if a key is configured (else web search is disabled).
    this.provider = deps.provider ?? (hasWebSearchKey() ? createDefaultWebSearchProvider() : null);
    this.maxContextChars = deps.maxContextChars ?? WEB_MAX_CONTEXT_CHARS;
  }

  /**
   * Run web search for a turn if the router decides it's needed. Never throws.
   */
  async searchForTurn(
    agent: AgentKey,
    query: string,
    lang: Lang,
    traceId?: string,
    signal?: AbortSignal,
  ): Promise<WebSearchResult> {
    const decision = decideWebSearch({ text: query, agent });
    if (!decision.needsWebSearch) return EMPTY(decision.reason);
    if (!this.provider) return EMPTY("no web search provider (TAVILY_API_KEY missing)");

    const t0 = Date.now();
    try {
      const raw = await this.provider.search(query, lang, {
        maxResults: MAX_RESULTS + 3,
        recent: true,
        signal: timeoutSignal(signal),
      });
      const used = processResults(raw, MAX_RESULTS);
      const searchMs = Date.now() - t0;

      if (used.length === 0) {
        this.log(query, lang, [], searchMs, decision.reason, traceId);
        return { ...EMPTY(decision.reason, searchMs), searched: true };
      }

      const ctx = buildWebContext(used, lang, this.maxContextChars);
      const citationSources: WebCitationSource[] = used.map((r) => ({
        title: r.title,
        url: r.url,
        domain: r.domain,
        relevanceScore: r.relevanceScore,
        authority: webAuthorityTier(r.url),
        publishedAt: r.publishedAt,
      }));

      this.log(query, lang, used, searchMs, decision.reason, traceId);
      return {
        searched: true,
        reason: decision.reason,
        contextBlock: ctx.text,
        citationSources,
        used,
        searchMs,
      };
    } catch (e) {
      // Tavily failed → fall back to RAG-only. Never expose raw errors.
      const searchMs = Date.now() - t0;
      console.warn("[web-search] failed, falling back to RAG-only:", e instanceof Error ? e.message : e);
      this.log(query, lang, [], searchMs, "error", traceId, true);
      return { ...EMPTY("web search error → RAG-only", searchMs), searched: true };
    }
  }

  private log(
    query: string,
    lang: Lang,
    used: ProcessedResult[],
    ms: number,
    reason: string,
    traceId?: string,
    error = false,
  ) {
    console.info(
      JSON.stringify({
        event: "web_search",
        traceId,
        lang,
        queryPreview: query.slice(0, 80),
        reason,
        searchMs: ms,
        error,
        resultsSelected: used.length,
        results: used.map((r) => ({ domain: r.domain, score: Number(r.relevanceScore.toFixed(3)), authority: r.authority })),
      }),
    );
  }
}

/** Build an AbortSignal that fires on the caller's signal OR our timeout. */
function timeoutSignal(parent?: AbortSignal): AbortSignal {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SEARCH_TIMEOUT_MS);
  parent?.addEventListener("abort", () => ac.abort(), { once: true });
  ac.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return ac.signal;
}

export function createWebSearchService(deps: WebSearchServiceDeps = {}): WebSearchService {
  return new WebSearchService(deps);
}
