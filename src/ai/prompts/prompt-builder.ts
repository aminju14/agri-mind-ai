/**
 * TASK 4 — Shared persona → system-prompt assembler.
 *
 * Turns an AgentPersona (identity, thinking framework, output structure, confidence) into
 * the full Claude system prompt, while pinning the FROZEN output format (H/P/U/I) so the
 * approved UI is never broken. Each persona's distinct "Output Structure" is injected as
 * guidance for what each block should contain — the blocks themselves stay frozen.
 *
 * Output language always follows the user's active `lang` (MASTER §1.2).
 */

import type { Lang } from "@/lib/types";
import type { AgentPersona } from "../contracts/response-contracts";
import { SHARED_RULES } from "../contracts/response-contracts";

/** Bump when any persona prompt changes (recorded on the message — MASTER §16.2). */
export const PERSONA_PROMPT_VERSION = "persona@v1";

/** The frozen output-format block, shared by every persona. */
function outputFormatBlock(lang: Lang, requiresConfidence: boolean): string {
  const langName = lang === "id" ? "Bahasa Indonesia" : "English";
  const confidenceLine = requiresConfidence
    ? `\n- You MUST state a confidence level (0–100 and a word: Strong evidence / Likely / Possible / Need more information) inside the P: paragraphs, e.g. "likely early blight (confidence ~80%, Likely)."`
    : "";
  return `OUTPUT FORMAT (MANDATORY — the UI renders ONLY these prefixes; never deviate)
- Every line MUST start with exactly one prefix. No markdown, bullets, numbers, headers, or bold.
  H: heading  — EXACTLY ONE, the FIRST line, a one-line conclusion/title.
  P: paragraph — 1–2 sentences each; use 1–3 P: lines.
  U: action item — 3–5 concrete steps the farmer can take.
  I: insight — EXACTLY ONE, the FINAL line, a proactive one-sentence recommendation.
- Order: H: first, then P:, then U:, then a single I: last.${confidenceLine}
- Respond ONLY in ${langName}. Bahasa Indonesia is first-class; never mix languages.`;
}

function numbered(list: string[]): string {
  return list.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

function bulleted(list: string[]): string {
  return list.map((s) => `- ${s}`).join("\n");
}

/**
 * Build the full system prompt for a persona in the given language.
 * Deterministic (no user text interpolated into instructions).
 */
export function buildPersonaPrompt(persona: AgentPersona, lang: Lang): string {
  const o = persona.output;
  return `${persona.identity}

THINKING FRAMEWORK (work through this before answering; never skip a step)
${numbered(persona.thinkingFramework)}

RESPONSIBILITIES
${bulleted(persona.responsibilities)}

ANSWER STRUCTURE (your distinct expert structure — express it THROUGH the blocks below)
Your sections are: ${o.sections.join(" → ")}.
Map them onto the frozen blocks like this:
- H: ${o.blocks.heading}
- P: ${o.blocks.paragraphs}
- U: ${o.blocks.checklist}
- I: ${o.blocks.insight}

${outputFormatBlock(lang, persona.requiresConfidence)}

SHARED RULES
${bulleted(SHARED_RULES)}

SCOPE & SAFETY
- Answer agriculture only. For medical/legal/financial questions, address only the
  agronomic facet and defer the rest to a local expert.
- For any pesticide/fungicide/herbicide or dosage, give class-level guidance only, never
  an exact imperative dose; tell the user to read the product label, follow local
  regulations, and use protection.`;
}
