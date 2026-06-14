/**
 * TASK 9 — Insight builder.
 *
 * Validates + normalizes raw LLM insights into the final Insight[] (≤2): resolves the
 * category, enforces the confidence gate, trims to the word-length bounds, dedups, and
 * orders by the agent's category preference. Then maps insights onto the existing
 * PanelData (Insights Panel) WITHOUT redesigning the UI:
 *   - panel.insight = the primary insight content
 *   - panel.topics  = [{ name: title, tag: category }]  (the panel's "Recommended Topics")
 */

import type { AgentKey } from "@/ai/types";
import type { Lang, PanelData } from "@/lib/types";
import {
  INSIGHT_LENGTH,
  INSIGHT_MIN_CONFIDENCE,
  MAX_INSIGHTS,
  type Insight,
  type InsightCategory,
  type RawInsight,
} from "./insight-types";
import { orderByAgentPreference, resolveCategory } from "./insight-classifier";

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Trim content to at most `maxWords` words (keeps whole words). */
function clampWords(s: string, maxWords: number): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return s.trim();
  return words.slice(0, maxWords).join(" ");
}

/**
 * Build the final, validated insights from raw LLM output.
 * - drops insights below the confidence gate or with empty title/content,
 * - resolves/normalizes category,
 * - clamps content to the per-slot max length,
 * - dedups by title,
 * - orders by agent preference, caps at MAX_INSIGHTS.
 */
export function buildInsights(agent: AgentKey, raw: RawInsight[]): Insight[] {
  if (!raw || raw.length === 0) return [];

  const seen = new Set<string>();
  const valid: Insight[] = [];
  for (const r of raw) {
    if (!r.title?.trim() || !r.content?.trim()) continue;
    if (r.confidence < INSIGHT_MIN_CONFIDENCE) continue;
    const key = r.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const category: InsightCategory = resolveCategory(agent, r.category, `${r.title} ${r.content}`);
    valid.push({
      title: r.title.trim().slice(0, 80),
      content: r.content.trim(),
      category,
      confidence: Math.max(0, Math.min(1, r.confidence)),
    });
  }

  const ordered = orderByAgentPreference(agent, valid).slice(0, MAX_INSIGHTS);

  // Apply per-slot length caps (0 = primary, 1 = secondary).
  return ordered.map((ins, i) => {
    const max = i === 0 ? INSIGHT_LENGTH.primary.max : INSIGHT_LENGTH.secondary.max;
    return wordCount(ins.content) > max ? { ...ins, content: clampWords(ins.content, max) } : ins;
  });
}

/** Localized category badge label for the panel topic tag. */
export function categoryLabel(category: InsightCategory, lang: Lang): string {
  const en: Record<InsightCategory, string> = {
    learning: "Learning",
    risk: "Risk",
    opportunity: "Opportunity",
    planning: "Planning",
    research: "Research",
  };
  const id: Record<InsightCategory, string> = {
    learning: "Pembelajaran",
    risk: "Risiko",
    opportunity: "Peluang",
    planning: "Perencanaan",
    research: "Riset",
  };
  return (lang === "id" ? id : en)[category];
}

/**
 * Merge generated insights into an existing PanelData (Insights Panel) without redesigning
 * the UI. The primary insight's content goes to `panel.insight`; all insights become
 * `topics` entries (name = title, tag = category badge).
 *
 * `extras` makes the rest of the panel dynamic too:
 *   - knowledge: the turn's real sources (web links + RAG docs) → "Pengetahuan Terkait"
 *   - learning : the user's LearningPath progress → "Jalur Belajar"
 * When an extra is absent, the corresponding seed section is preserved.
 */
export interface PanelExtras {
  knowledge?: { title: string; source: string; cat: string; url?: string }[];
  learning?: { name: string; pct: number }[];
}

export function applyInsightsToPanel(
  panel: PanelData,
  insights: Insight[],
  lang: Lang,
  extras: PanelExtras = {},
): PanelData {
  const next: PanelData = { ...panel };

  if (insights.length > 0) {
    const primary = insights[0];
    next.insight = primary.content;
    next.insightTitle = primary.title || panel.insightTitle;
    // Surface insights as the panel's recommended topics (frozen card renders name + tag).
    next.topics = insights.map((ins) => ({ name: ins.title, tag: categoryLabel(ins.category, lang) }));
  }

  if (extras.knowledge && extras.knowledge.length > 0) {
    next.knowledge = extras.knowledge.slice(0, 4);
  }
  if (extras.learning && extras.learning.length > 0) {
    next.learning = extras.learning.slice(0, 4);
  }

  return next;
}
