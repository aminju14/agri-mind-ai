/**
 * TASK 8 — Search context builder.
 *
 * Responsibilities (§Search Context Builder): merge search results, preserve metadata,
 * prepare LLM context. Produces the "WEB SEARCH RESULTS" block that is combined with the
 * RAG knowledge block before the specialist prompt (web tagged distinct from KB).
 *
 * Pure & deterministic. Returns "" when there are no results.
 */

import type { Lang } from "@/lib/types";
import type { ProcessedResult } from "./search-processor";

export const WEB_MAX_CONTEXT_CHARS = 4000;

const HEADINGS: Record<Lang, string> = {
  en: "WEB SEARCH RESULTS (recent/real-time; cite these for current facts, note they are external sources)",
  id: "HASIL PENCARIAN WEB (terkini/real-time; gunakan untuk fakta terbaru, ini sumber eksternal)",
};

export interface BuiltWebContext {
  text: string;
  used: ProcessedResult[];
  chars: number;
}

/**
 * Build the web-results context block. Results are assumed pre-ranked (best first).
 * Stops once the max length would be exceeded, preserving each result's source + date.
 */
export function buildWebContext(
  results: ProcessedResult[],
  lang: Lang,
  maxChars: number = WEB_MAX_CONTEXT_CHARS,
): BuiltWebContext {
  if (!results || results.length === 0) return { text: "", used: [], chars: 0 };

  const header = HEADINGS[lang];
  const parts: string[] = [];
  const used: ProcessedResult[] = [];
  let length = header.length + 2;
  let n = 1;

  for (const r of results) {
    const date = r.publishedAt ? ` — ${r.publishedAt.slice(0, 10)}` : "";
    const block = `[Web ${n} — ${r.title} (${r.domain}${date})]\n${r.snippet}`;
    if (length + block.length + 2 > maxChars && used.length > 0) break;
    parts.push(block);
    used.push(r);
    length += block.length + 2;
    n++;
  }

  if (used.length === 0) return { text: "", used: [], chars: 0 };
  const text = `${header}\n\n${parts.join("\n\n")}`;
  return { text, used, chars: text.length };
}

/**
 * Combine the RAG knowledge block and the web-results block into one knowledge section
 * (KB first — authoritative/internal — then recent web), per the agreed inject order
 * [KB] + [WEB] → [Memory] → [Specialist].
 */
export function combineKnowledgeBlocks(ragBlock: string, webBlock: string): string {
  const blocks = [ragBlock, webBlock].filter(Boolean);
  return blocks.join("\n\n---\n\n");
}
