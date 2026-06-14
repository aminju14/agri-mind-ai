/**
 * TASK 8 — Search router (tool decision).
 *
 * Decides whether a turn NEEDS web search, deterministically (no extra LLM call). Web
 * search fires only on recency/real-time signals (latest prices, news, regulations,
 * current research, weather alerts). Evergreen/educational questions ("how to cultivate
 * chili") use RAG only.
 *
 * Knowledge-first (§Search Philosophy): Memory → RAG → Web; this only gates the Web step.
 */

import type { AgentKey } from "@/ai/types";
import type { SearchCategory, SearchDecision } from "./search-types";

/** Recency signals (EN + ID) — presence triggers web search. */
const RECENCY = /\b(latest|recent|current|today|this week|this month|right now|up to date|newest|breaking|terkini|terbaru|saat ini|hari ini|minggu ini|bulan ini|sekarang)\b/i;

/** Category lexicons (EN + ID). */
const CATEGORY_SIGNALS: Array<{ category: SearchCategory; re: RegExp }> = [
  {
    category: "commodity_prices",
    re: /\b(price|prices|cost of|market price|harga|berapa harga)\b/i,
  },
  {
    category: "agricultural_news",
    re: /\b(news|announcement|program|regulation|regulations|policy|policies|law|laws|berita|pengumuman|peraturan|regulasi|kebijakan)\b/i,
  },
  // Weather is checked BEFORE market_trends so "weather forecast" classifies as weather.
  {
    category: "weather",
    re: /\b(weather|rainfall|drought|flood|el ni|la ni|climate|cuaca|prakiraan cuaca|curah hujan|kekeringan|banjir|iklim)\b/i,
  },
  {
    category: "market_trends",
    re: /\b(market trend|supply|demand|export|import|outlook|forecast|tren pasar|pasokan|permintaan|ekspor|impor|prospek)\b/i,
  },
  {
    category: "scientific_updates",
    re: /\b(study|studies|research|finding|innovation|breakthrough|penelitian|studi|riset|temuan|inovasi)\b/i,
  },
];

/** Strong evergreen/how-to signals that should stay RAG-only even if a keyword overlaps. */
const EVERGREEN = /\b(how to|how do i|how can i|cara|bagaimana cara|what causes|why do|step by step|tutorial|guide to)\b/i;

export interface SearchRouteInput {
  text: string;
  agent: AgentKey;
}

/**
 * Decide whether web search is needed for this turn.
 * Rule: a recency signal (or a price/news/trends ask) that is NOT purely a how-to triggers
 * search. The Research agent is the most search-prone; others search only on clear signals.
 */
export function decideWebSearch(input: SearchRouteInput): SearchDecision {
  const t = input.text;

  // Category first (also doubles as a signal).
  const matchedCategory = CATEGORY_SIGNALS.find((c) => c.re.test(t))?.category;
  const hasRecency = RECENCY.test(t);
  const isEvergreen = EVERGREEN.test(t);

  // Price / news / trends / weather questions are inherently time-sensitive even without an
  // explicit "latest" — but a pure how-to ("how to check chili prices") stays RAG-only.
  const timeSensitiveCategory =
    matchedCategory === "commodity_prices" ||
    matchedCategory === "agricultural_news" ||
    matchedCategory === "market_trends" ||
    matchedCategory === "weather";

  if (isEvergreen && !hasRecency) {
    return { needsWebSearch: false, reason: "evergreen/how-to → RAG only" };
  }

  if (hasRecency || timeSensitiveCategory) {
    return {
      needsWebSearch: true,
      category: matchedCategory ?? "general_recent",
      reason: hasRecency ? `recency signal${matchedCategory ? " + " + matchedCategory : ""}` : `time-sensitive: ${matchedCategory}`,
    };
  }

  // Scientific "latest research" without recency word: only search for the research agent.
  if (matchedCategory === "scientific_updates" && input.agent === "research") {
    return { needsWebSearch: true, category: "scientific_updates", reason: "research agent + scientific updates" };
  }

  return { needsWebSearch: false, reason: "no recency/market signal → RAG only" };
}
