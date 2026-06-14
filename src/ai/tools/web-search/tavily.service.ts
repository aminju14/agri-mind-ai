/**
 * TASK 8 — Tavily search provider (default WebSearchProvider).
 *
 * Responsibilities (§Search Service): query Tavily, parse results, normalize, handle errors.
 * Provider-agnostic via the WebSearchProvider interface — Serper/Exa drop in as new adapters.
 *
 * Requires TAVILY_API_KEY. Use `hasWebSearchKey()` to decide whether to attempt search at
 * all; when absent the middleware skips web search and falls back to RAG-only (never errors).
 */

import type { RawSearchResult, WebSearchOptions, WebSearchProvider } from "./search-types";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 6000;

export function hasWebSearchKey(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
    published_date?: string;
  }>;
}

export function createTavilyProvider(opts?: { apiKey?: string; timeoutMs?: number }): WebSearchProvider {
  const apiKey = opts?.apiKey ?? process.env.TAVILY_API_KEY;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: "tavily",
    async search(query: string, lang, options: WebSearchOptions): Promise<RawSearchResult[]> {
      if (!apiKey) {
        throw new Error("TAVILY_API_KEY missing — web search unavailable");
      }

      // Honor both the caller's abort signal and our own timeout.
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      options.signal?.addEventListener("abort", () => ac.abort(), { once: true });

      try {
        const res = await fetch(TAVILY_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            // "basic" depth returns in ~1.5s; "advanced" routinely exceeds the <2s target.
            // The `recent` bias is applied via days/topic, not depth, to stay fast.
            search_depth: "basic",
            topic: "general", // "news" topic is broken for non-English/niche queries
            ...(options.recent ? { days: 30 } : {}),
            max_results: options.maxResults ?? 6,
            include_answer: false,
            include_raw_content: false,
          }),
          signal: ac.signal,
        });

        if (!res.ok) {
          throw new Error(`Tavily HTTP ${res.status}`);
        }
        const data = (await res.json()) as TavilyResponse;
        // Parse + normalize into the provider-neutral shape.
        return (data.results ?? [])
          .filter((r) => r.url && r.title)
          .map<RawSearchResult>((r) => ({
            title: String(r.title),
            url: String(r.url),
            content: String(r.content ?? ""),
            score: typeof r.score === "number" ? r.score : undefined,
            publishedDate: r.published_date,
          }));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Default provider (Tavily). */
export function createDefaultWebSearchProvider(): WebSearchProvider {
  return createTavilyProvider();
}
