/**
 * TASK 9 — Insight generator (LLM step).
 *
 * Analyzes the turn's context (history → memory → question → answer → RAG/web) and produces
 * 1 primary + optional 1 secondary proactive insight, each categorized with a confidence.
 * Insights must add NEW value: never repeat/summarize the answer or restate the question.
 *
 * Uses the injectable ClassifierClient seam (same as supervisor/memory). Keyless/failed →
 * returns [] so the chat flow is unaffected.
 */

import type { ClassifierClient } from "@/ai/llm/classifier-client";
import {
  AGENT_INSIGHT_PREFERENCES,
  MAX_INSIGHTS,
  type InsightGenerationInput,
  type RawInsight,
} from "./insight-types";

export const INSIGHT_PROMPT_VERSION = "insight-generator@v1";

function memoryLines(input: InsightGenerationInput): string {
  const m = input.memory;
  if (!m) return "";
  const parts: string[] = [];
  if (m.cropInterests.length) parts.push(`Interested crops: ${m.cropInterests.join(", ")}`);
  if (m.learningInterests.length) parts.push(`Learning interests: ${m.learningInterests.join(", ")}`);
  if (m.goals.length) parts.push(`Goals: ${m.goals.join(", ")}`);
  if (m.challenges.length) parts.push(`Challenges: ${m.challenges.join(", ")}`);
  return parts.length ? `KNOWN USER CONTEXT (personalize toward these):\n${parts.join("\n")}` : "";
}

function buildSystemPrompt(input: InsightGenerationInput): string {
  const langName = input.lang === "id" ? "Bahasa Indonesia" : "English";
  const prefs = AGENT_INSIGHT_PREFERENCES[input.agent].join(", ");
  return `You are AgriMind's Proactive Insight Generator. A good advisor doesn't only answer —
it helps the user discover what to learn or do NEXT. Produce proactive insights that add NEW
value beyond the answer.

CATEGORIES: learning | risk | opportunity | planning | research
This answer came from the ${input.agent} agent — prefer these categories: ${prefs}.

RULES
- Generate 1 primary insight, and optionally 1 secondary (max 2 total).
- Primary: 50–120 words. Secondary: 30–80 words.
- Each must be relevant, actionable, concise, personalized, and educational.
- NEVER repeat or summarize the answer. NEVER restate the question. Add new value.
- Personalize using the user's known context (crops/goals/challenges) when present.
- Use retrieved knowledge and web results to ground deeper insights when given.
- Respond ONLY in ${langName}.
- confidence is 0..1 (your certainty the insight is genuinely useful). Omit weak insights.

OUTPUT: ONLY a JSON array (no prose/code fences). Each item:
{"title":"Short title","content":"The insight text","category":"learning","confidence":0.9}
If nothing genuinely useful can be added, output exactly: []`;
}

function buildUserPrompt(input: InsightGenerationInput): string {
  const parts: string[] = [];
  if (input.history?.trim()) parts.push(`CONVERSATION HISTORY:\n${input.history.trim()}`);
  const mem = memoryLines(input);
  if (mem) parts.push(mem);
  parts.push(`CURRENT QUESTION:\n${input.userMessage.trim()}`);
  parts.push(`CURRENT ANSWER:\n${input.assistantAnswer.trim()}`);
  if (input.ragTitles?.length) parts.push(`RETRIEVED KNOWLEDGE (titles):\n- ${input.ragTitles.join("\n- ")}`);
  if (input.webTitles?.length) parts.push(`WEB SEARCH RESULTS (titles):\n- ${input.webTitles.join("\n- ")}`);
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

/**
 * Run the LLM insight generation. Returns up to MAX_INSIGHTS raw insights (unvalidated for
 * length/category — that's the builder's job). NEVER throws: on any failure returns [].
 */
export async function generateRawInsights(
  client: ClassifierClient,
  input: InsightGenerationInput,
  opts: { signal?: AbortSignal } = {},
): Promise<RawInsight[]> {
  let raw: string;
  try {
    const res = await client.classify({
      system: buildSystemPrompt(input),
      user: buildUserPrompt(input),
      maxTokens: 500,
      temperature: 0.5,
      signal: opts.signal,
    });
    raw = res.text;
  } catch {
    return [];
  }

  const arr = extractJsonArray(raw);
  if (!arr) return [];

  const out: RawInsight[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.title !== "string" || typeof o.content !== "string") continue;
    const confidence = typeof o.confidence === "number" ? o.confidence : 0.7;
    out.push({
      title: o.title.trim(),
      content: o.content.trim(),
      category: o.category as RawInsight["category"], // validated/resolved by the builder
      confidence,
    });
    if (out.length >= MAX_INSIGHTS) break;
  }
  return out;
}
