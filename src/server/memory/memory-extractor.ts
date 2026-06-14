/**
 * TASK 5 — Memory extractor.
 *
 * After every assistant response, classify the turn into selective long-term memories:
 * crop interests, learning interests, goals, challenges. Output is gated at confidence
 * > 0.8 (TASK 5 §Memory Rules). Greetings, small talk, temporary questions, and anything
 * irrelevant are explicitly NOT stored.
 *
 * Uses the injectable ClassifierClient seam (same as the supervisor): a fake/keyless
 * environment yields no memories rather than failing the turn.
 */

import type { ClassifierClient } from "@/ai/llm/classifier-client";
import {
  MEMORY_CATEGORIES,
  MEMORY_CONFIDENCE_THRESHOLD,
  type ExtractedMemory,
  type ExtractionContext,
  type MemoryCategory,
} from "./memory.types";

export const MEMORY_EXTRACTOR_VERSION = "memory-extractor@v1";

function buildSystemPrompt(): string {
  return `You extract LONG-TERM memory from one agricultural chat turn. Only keep facts that
will improve FUTURE conversations. Memory must be selective, useful, and concise.

ALLOWED CATEGORIES (memoryType):
- crop_interest      — a crop the user grows/cares about (e.g. chili, rice, corn, mango, banana, citrus)
- learning_interest  — a topic they want to learn (e.g. disease diagnosis, fertilization, irrigation, crop planning)
- goal               — what they want to achieve (e.g. learning agriculture, starting a farm, improving yield, reducing disease)
- challenge          — a recurring problem (e.g. pest problems, yellow leaves, irrigation issues)

DO NOT store: greetings, small talk, one-off/temporary questions, or anything irrelevant.

VALUE: a short, normalized, lowercase noun phrase (e.g. "chili", "disease diagnosis", "improve yield").
CONFIDENCE: 0..1 — how sure you are this is a durable interest (not a passing mention).

OUTPUT: ONLY a JSON array (no prose, no code fences). Each item:
{"memoryType":"crop_interest","value":"chili","confidence":0.92}
If nothing is worth remembering, output exactly: []`;
}

function buildUserPrompt(ctx: ExtractionContext): string {
  const parts: string[] = [];
  if (ctx.history.trim()) parts.push(`PRIOR CONTEXT:\n${ctx.history.trim()}`);
  parts.push(`USER MESSAGE:\n${ctx.userMessage.trim()}`);
  parts.push(`ASSISTANT RESPONSE:\n${ctx.assistantResponse.trim()}`);
  return parts.join("\n\n");
}

/** Extract the first balanced JSON array from arbitrary model text (fence/prose tolerant). */
export function extractJsonArray(text: string): unknown[] | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(body.slice(start, i + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isCategory(v: unknown): v is MemoryCategory {
  return typeof v === "string" && (MEMORY_CATEGORIES as readonly string[]).includes(v);
}

/** Validate + normalize one raw item into an ExtractedMemory, or null if invalid. */
function coerce(raw: unknown): ExtractedMemory | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isCategory(o.memoryType)) return null;
  if (typeof o.value !== "string") return null;
  const value = o.value.trim().toLowerCase();
  if (!value || value.length > 60) return null;
  const confidence = typeof o.confidence === "number" ? o.confidence : 0;
  if (confidence < 0 || confidence > 1) return null;
  return { memoryType: o.memoryType, value, confidence };
}

/**
 * Run extraction for one turn. Returns memories ABOVE the confidence threshold (the gate).
 * NEVER throws — on any failure (no key, network, junk output) returns [] so the chat
 * flow is unaffected (TASK 5: integrate without breaking the chat).
 */
export async function extractMemories(
  client: ClassifierClient,
  ctx: ExtractionContext,
  opts: { signal?: AbortSignal } = {},
): Promise<ExtractedMemory[]> {
  let raw: string;
  try {
    const res = await client.classify({
      system: buildSystemPrompt(),
      user: buildUserPrompt(ctx),
      maxTokens: 256,
      temperature: 0,
      signal: opts.signal,
    });
    raw = res.text;
  } catch {
    return [];
  }

  const arr = extractJsonArray(raw);
  if (!arr) return [];

  const seen = new Set<string>();
  const out: ExtractedMemory[] = [];
  for (const item of arr) {
    const m = coerce(item);
    if (!m) continue;
    if (m.confidence <= MEMORY_CONFIDENCE_THRESHOLD) continue; // gate (> 0.8)
    const key = `${m.memoryType}:${m.value}`;
    if (seen.has(key)) continue; // de-dup within one extraction
    seen.add(key);
    out.push(m);
  }
  return out;
}
