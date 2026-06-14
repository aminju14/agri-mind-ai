/**
 * TASK 4 — Specialist response contracts.
 *
 * Each specialist "feels like a different expert": its persona shapes reasoning,
 * decision-making, output structure, recommendations, and confidence. BUT the rendered
 * answer MUST stay inside the FROZEN block model (H/P/U/I) so the approved UI is never
 * broken (MASTER §3.2). Therefore each agent's distinct "Output Structure" from TASK 4 is
 * realized as a MAPPING onto the frozen blocks — the section names guide the *content and
 * order* of the H/P/U/I lines, not new UI sections.
 *
 * This file is the single source of truth for: each agent's persona identity, thinking
 * framework, the section→block mapping, the confidence framework, the shared rules, and
 * the agent badge metadata returned to the UI.
 */

import type { Lang } from "@/lib/types";
import type { AgentKey, SupervisorAgentName } from "../types";

// ---------------------------------------------------------------------------
// Agent badge (TASK 4 §Agent Badge) — metadata for the UI.
// ---------------------------------------------------------------------------

export interface AgentBadge {
  /** Supervisor-vocabulary key (snake_case), e.g. "plant_doctor". */
  agent: SupervisorAgentName;
  /** Human label shown in the UI, localized. */
  agentLabel: string;
}

// ---------------------------------------------------------------------------
// Confidence framework (TASK 4 — Plant Doctor 0–100, generalized to all agents).
// ---------------------------------------------------------------------------

export type ConfidenceBand = "strong" | "likely" | "possible" | "insufficient";

export interface ConfidenceLevel {
  /** 0–100 numeric confidence. */
  score: number;
  band: ConfidenceBand;
}

/** Map a 0–100 score to the TASK-4 bands. */
export function confidenceBand(score: number): ConfidenceBand {
  if (score >= 90) return "strong";
  if (score >= 70) return "likely";
  if (score >= 50) return "possible";
  return "insufficient";
}

/** Localized label for a confidence band (for in-text phrasing & logs). */
export function confidenceLabel(band: ConfidenceBand, lang: Lang): string {
  const en: Record<ConfidenceBand, string> = {
    strong: "Strong evidence",
    likely: "Likely",
    possible: "Possible",
    insufficient: "Need more information",
  };
  const id: Record<ConfidenceBand, string> = {
    strong: "Bukti kuat",
    likely: "Kemungkinan besar",
    possible: "Mungkin",
    insufficient: "Perlu informasi lebih",
  };
  return (lang === "id" ? id : en)[band];
}

// ---------------------------------------------------------------------------
// Output structure → frozen block mapping.
// ---------------------------------------------------------------------------

/**
 * How a persona's TASK-4 "Output Structure" maps onto the frozen H/P/U/I blocks.
 * Each entry documents what goes into the heading, paragraphs, the checklist, and the
 * single insight, so the prompt can instruct the model precisely while the UI stays frozen.
 */
export interface BlockMapping {
  /** What the single H: heading should convey. */
  heading: string;
  /** What the P: paragraph(s) should cover, in order. */
  paragraphs: string;
  /** What the U: checklist items should be. */
  checklist: string;
  /** What the single I: insight should be. */
  insight: string;
}

/** A persona's TASK-4 output structure as a labeled section list (for the prompt + docs). */
export interface OutputStructure {
  /** The TASK-4 section names, in order (e.g. ["Assessment","Recommendations","Risks","Next Steps"]). */
  sections: string[];
  /** Mapping of those sections onto the frozen blocks. */
  blocks: BlockMapping;
}

// ---------------------------------------------------------------------------
// Persona definition (the full TASK-4 expert spec for one agent).
// ---------------------------------------------------------------------------

export interface AgentPersona {
  key: AgentKey;
  /** Supervisor-vocabulary name for the badge. */
  badgeAgent: SupervisorAgentName;
  /** Localized display label (matches src/lib/data.ts AGENTS + UI). */
  label: Record<Lang, string>;
  /** Identity line (the expert role). */
  identity: string;
  /** Ordered reasoning framework the agent must follow before answering. */
  thinkingFramework: string[];
  /** Domain responsibilities. */
  responsibilities: string[];
  /** TASK-4 output structure + its frozen-block mapping. */
  output: OutputStructure;
  /** Whether this agent must always state a confidence level (Plant Doctor: yes). */
  requiresConfidence: boolean;
}

// ---------------------------------------------------------------------------
// Shared rules (TASK 4 §Shared Rules) — every agent obeys these.
// ---------------------------------------------------------------------------

export const SHARED_RULES: string[] = [
  "Be practical and actionable.",
  "Be concise but complete.",
  "Explain your reasoning.",
  "State your assumptions.",
  "State the risks.",
];

// ---------------------------------------------------------------------------
// The structured decision a specialist contributes for logging/analytics
// (TASK 4 §Logging: selected agent, intent, timestamp; + confidence).
// ---------------------------------------------------------------------------

export interface SpecialistMeta {
  agent: AgentKey;
  badge: AgentBadge;
  /** Optional confidence the agent assessed for this turn (Plant Doctor especially). */
  confidence?: ConfidenceLevel;
}
