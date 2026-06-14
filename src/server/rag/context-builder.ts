/**
 * TASK 6 — Context builder.
 *
 * Responsibilities (TASK 6 §Context Builder):
 *   - Merge chunks
 *   - Remove duplicates
 *   - Preserve source references
 *
 * Produces the "Retrieved Agricultural Knowledge" block injected BEFORE the specialist
 * prompt (TASK 6 §Prompt Injection). Capped at the maximum context length (6000 chars).
 *
 * NOTE: this is NOT citations (a later task). It only labels each chunk with its source
 * so the model can ground its answer; nothing is rendered as a citation card.
 */

import type { RetrievedChunk } from "@/server/persistence/types";
import type { Lang } from "@/lib/types";

export const RAG_MAX_CONTEXT_CHARS = 6000;

const HEADINGS: Record<Lang, string> = {
  en: "RETRIEVED AGRICULTURAL KNOWLEDGE (use these facts first; if they don't cover the question, use your own knowledge)",
  id: "PENGETAHUAN PERTANIAN YANG DIAMBIL (gunakan fakta ini lebih dulu; jika tidak mencakup pertanyaan, gunakan pengetahuanmu)",
};

export interface BuiltContext {
  /** The injectable text block (empty when no chunks). */
  text: string;
  /** Chunks actually included after dedup + length cap, in order. */
  used: RetrievedChunk[];
  /** Total characters of the block. */
  chars: number;
}

/** Normalize chunk text for near-duplicate detection. */
function dedupeKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
}

/**
 * Build the retrieved-knowledge context block. Chunks are assumed pre-sorted by
 * relevance (best first). Removes exact/near duplicates and stops once the max length
 * would be exceeded, preserving each chunk's source reference.
 */
export function buildContext(
  chunks: RetrievedChunk[],
  lang: Lang,
  maxChars: number = RAG_MAX_CONTEXT_CHARS,
): BuiltContext {
  if (chunks.length === 0) return { text: "", used: [], chars: 0 };

  const seen = new Set<string>();
  const parts: string[] = [];
  const used: RetrievedChunk[] = [];
  const header = HEADINGS[lang];
  let length = header.length + 2;

  let n = 1;
  for (const c of chunks) {
    const key = dedupeKey(c.text);
    if (seen.has(key)) continue; // remove duplicates
    const body = c.text.trim();
    // Preserve source reference on each chunk.
    const block = `[Knowledge ${n} — source: ${c.source}]\n${body}`;
    if (length + block.length + 2 > maxChars && used.length > 0) break; // length cap
    seen.add(key);
    parts.push(block);
    used.push(c);
    length += block.length + 2;
    n++;
  }

  if (used.length === 0) return { text: "", used: [], chars: 0 };
  const text = `${header}\n\n${parts.join("\n\n")}`;
  return { text, used, chars: text.length };
}

/**
 * Inject the retrieved-knowledge block BEFORE the specialist prompt (TASK 6 §Prompt
 * Injection: Retrieved Agricultural Knowledge → Agent Instructions → User Question).
 * Returns the specialist prompt unchanged when there is no context.
 */
export function injectContext(specialistPrompt: string, contextBlock: string): string {
  if (!contextBlock) return specialistPrompt;
  return `${contextBlock}\n\n---\n\n${specialistPrompt}`;
}
