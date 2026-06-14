/**
 * TASK 8 — Web Search System barrel.
 *
 *   import { createWebSearchService } from "@/ai/tools/web-search";
 *
 * Complements RAG with recent/real-time agricultural info (prices, news, regulations,
 * weather, studies). Knowledge-first: Memory → RAG → Web. Provider-agnostic (Tavily default).
 * Scope: web search + its citations — no insight generator (Task 9).
 */
export {
  WebSearchService,
  createWebSearchService,
  type WebSearchResult,
  type WebSearchServiceDeps,
} from "./web-search.service";
export { createTavilyProvider, createDefaultWebSearchProvider, hasWebSearchKey } from "./tavily.service";
export { decideWebSearch, type SearchRouteInput } from "./search-router";
export { processResults, type ProcessedResult } from "./search-processor";
export {
  buildWebContext,
  combineKnowledgeBlocks,
  WEB_MAX_CONTEXT_CHARS,
  type BuiltWebContext,
} from "./search-context-builder";
export {
  webAuthorityTier,
  isBlockedSource,
  domainOf,
  WEB_AUTHORITY,
  type SearchResult,
  type SearchDecision,
  type SearchCategory,
  type WebSearchProvider,
  type RawSearchResult,
  type WebSearchOptions,
} from "./search-types";
