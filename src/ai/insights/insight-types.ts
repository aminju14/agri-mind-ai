/**
 * TASK 9 — Proactive Insight Generator types.
 *
 * Insights make AgriMind proactive: beyond answering, it guides the user toward better
 * agricultural decisions. 1 primary + optional 1 secondary insight per answer, each
 * categorized, personalized, actionable, and NEVER a repeat/summary of the answer.
 */

import type { Lang } from "@/lib/types";
import type { AgentKey } from "@/ai/types";

/** Insight categories (TASK 9 §Insight Data Contract). */
export type InsightCategory = "learning" | "risk" | "opportunity" | "planning" | "research";

export const INSIGHT_CATEGORIES: readonly InsightCategory[] = [
  "learning",
  "risk",
  "opportunity",
  "planning",
  "research",
] as const;

/** The insight contract (TASK 9 §Insight Data Contract). */
export interface Insight {
  title: string;
  content: string;
  category: InsightCategory;
  /** 0..1 — internal only, never displayed (TASK 9 §Insight Confidence). */
  confidence: number;
}

/** Length bounds (TASK 9 §Insight Length), measured in words. */
export const INSIGHT_LENGTH = {
  primary: { min: 50, max: 120 },
  secondary: { min: 30, max: 80 },
} as const;

/** Max insights per answer (TASK 9 §Insight Count). */
export const MAX_INSIGHTS = 2;

/** Confidence gate — below this, drop the insight (avoid weak/random output). */
export const INSIGHT_MIN_CONFIDENCE = 0.6;

/**
 * Per-agent category preferences (TASK 9 §Agent Specific Rules). The generator is steered
 * toward these; the classifier uses them to order/validate.
 */
export const AGENT_INSIGHT_PREFERENCES: Record<AgentKey, InsightCategory[]> = {
  // Agronomist: Learning, Planning, Risk
  agronomist: ["learning", "planning", "risk"],
  // Plant Doctor: Risk, Prevention(→risk), Learning
  plantdoctor: ["risk", "learning", "planning"],
  // Farm Planner: Opportunity, Planning, Risk
  farmplanner: ["opportunity", "planning", "risk"],
  // Research: Research, Learning, Opportunity
  research: ["research", "learning", "opportunity"],
};

/** Everything the generator analyzes (TASK 9 §Input Sources / §Generation Strategy). */
export interface InsightGenerationInput {
  agent: AgentKey;
  lang: Lang;
  userMessage: string;
  assistantAnswer: string;
  /** Compact prior-turn context (may be empty). */
  history?: string;
  /** "Known User Context" memory values by category (TASK 9 §Memory Integration). */
  memory?: { cropInterests: string[]; learningInterests: string[]; goals: string[]; challenges: string[] };
  /** RAG document titles that grounded the answer (TASK 9 §RAG Integration). */
  ragTitles?: string[];
  /** Web result titles/domains used this turn (TASK 9 §Web Search Integration). */
  webTitles?: string[];
  /** Real sources of this turn, used to populate the panel's "Related Knowledge" section. */
  panelSources?: {
    web?: { title: string; domain: string; url: string }[];
    rag?: { title: string; source: string }[];
  };
}

/** The raw JSON shape the LLM is asked to emit. */
export interface RawInsight {
  title: string;
  content: string;
  category: InsightCategory;
  confidence: number;
}

/** Persistence input row. `ordinal`: 0=primary, 1=secondary. */
export interface CreateInsightInput {
  conversationId: string;
  messageId: string;
  title: string;
  content: string;
  category: InsightCategory;
  confidence: number;
  ordinal: number;
}
