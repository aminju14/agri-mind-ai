/**
 * TASK 9 — Insight classifier.
 *
 * Validates an insight's category, infers a category heuristically when the LLM omits or
 * mislabels it, and orders a set of insights by the agent's category preferences
 * (§Agent Specific Rules). Pure & deterministic.
 */

import type { AgentKey } from "@/ai/types";
import {
  AGENT_INSIGHT_PREFERENCES,
  INSIGHT_CATEGORIES,
  type InsightCategory,
} from "./insight-types";

/** Lightweight signals to infer a category from an insight's text. */
const CATEGORY_SIGNALS: Array<{ category: InsightCategory; re: RegExp }> = [
  { category: "risk", re: /\b(risk|disease|pest|threat|damage|prevent|avoid|warning|monitor|outbreak|rot|blight|wilt)\b/i },
  { category: "opportunity", re: /\b(opportunity|demand|market|price|profit|export|expand|sell|margin|increasing)\b/i },
  { category: "planning", re: /\b(plan|planning|schedule|budget|prepare|before planting|timeline|next step|calendar|rotation)\b/i },
  { category: "research", re: /\b(study|studies|research|finding|evidence|recent|innovation|science)\b/i },
  { category: "learning", re: /\b(learn|topic|understand|explore|read|guide|basics|introduction)\b/i },
];

export function isInsightCategory(v: unknown): v is InsightCategory {
  return typeof v === "string" && (INSIGHT_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Resolve the category for an insight: trust a valid LLM-provided category; otherwise infer
 * from the text; fall back to the agent's top preference.
 */
export function resolveCategory(
  agent: AgentKey,
  provided: unknown,
  text: string,
): InsightCategory {
  if (isInsightCategory(provided)) return provided;
  const inferred = CATEGORY_SIGNALS.find((c) => c.re.test(text))?.category;
  if (inferred) return inferred;
  return AGENT_INSIGHT_PREFERENCES[agent][0];
}

/**
 * Order insights so the agent's preferred categories come first (primary slot), then by
 * confidence. Stable for equal keys.
 */
export function orderByAgentPreference<T extends { category: InsightCategory; confidence: number }>(
  agent: AgentKey,
  insights: T[],
): T[] {
  const prefs = AGENT_INSIGHT_PREFERENCES[agent];
  const rank = (c: InsightCategory) => {
    const i = prefs.indexOf(c);
    return i === -1 ? prefs.length : i; // unpreferred categories sort last
  };
  return [...insights].sort((a, b) => {
    const ra = rank(a.category);
    const rb = rank(b.category);
    if (ra !== rb) return ra - rb;
    return b.confidence - a.confidence;
  });
}
