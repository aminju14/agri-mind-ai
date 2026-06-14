/**
 * TASK 4 — Specialist agent module contract.
 *
 * A SpecialistAgent wraps a persona (contracts/response-contracts) and exposes everything
 * the orchestrator needs: the badge metadata for the UI, and the system prompt to inject
 * into the final Claude request for a given language. Reasoning/decision-making/output
 * structure/confidence all live in the persona's prompt (the persona IS the expert).
 */

import type { Lang } from "@/lib/types";
import type { AgentKey } from "../types";
import type { AgentBadge, AgentPersona } from "../contracts/response-contracts";
import { buildPersonaPrompt } from "../prompts/prompt-builder";

export interface SpecialistAgent {
  key: AgentKey;
  persona: AgentPersona;
  /** Localized badge metadata for the UI (TASK 4 §Agent Badge). */
  badge(lang: Lang): AgentBadge;
  /** Full system prompt to inject into the final Claude request. */
  buildPrompt(lang: Lang): string;
}

/** Build a SpecialistAgent from a persona. */
export function makeAgent(persona: AgentPersona): SpecialistAgent {
  return {
    key: persona.key,
    persona,
    badge(lang) {
      return { agent: persona.badgeAgent, agentLabel: persona.label[lang] };
    },
    buildPrompt(lang) {
      return buildPersonaPrompt(persona, lang);
    },
  };
}
