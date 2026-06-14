/**
 * Agent registry — the canonical AgentKey → SpecialistAgent map (TASK 4).
 *
 * The supervisor selects an AgentKey (TASK 3); the registry resolves it to a full
 * persona-driven specialist (TASK 4) and provides the system prompt to inject into the
 * final Claude request, plus the badge metadata for the UI.
 *
 * The public API (getSpecialistPrompt / getAgentDisplay / REGISTRY_PROMPT_VERSION) is
 * unchanged so the orchestrator and routing service keep working; getAgentBadge is added.
 * Scope: still NO RAG/web/citations/insight-generator (those are later phases).
 */

import type { Lang } from "@/lib/types";
import type { AgentKey } from "../types";
import type { AgentBadge } from "../contracts/response-contracts";
import type { SpecialistAgent } from "./base-agent";
import { agronomistAgent } from "./agronomist";
import { plantDoctorAgent } from "./plant-doctor";
import { farmPlannerAgent } from "./farm-planner";
import { researcherAgent } from "./researcher";
import { PERSONA_PROMPT_VERSION } from "../prompts/prompt-builder";

/** Version tag recorded on the message for bisecting (MASTER §16.2). */
export const REGISTRY_PROMPT_VERSION = PERSONA_PROMPT_VERSION;

export const AGENT_REGISTRY: Record<AgentKey, SpecialistAgent> = {
  agronomist: agronomistAgent,
  plantdoctor: plantDoctorAgent,
  farmplanner: farmPlannerAgent,
  research: researcherAgent,
};

/** Get the specialist system prompt to inject into the final Claude request. */
export function getSpecialistPrompt(agent: AgentKey, lang: Lang): string {
  return AGENT_REGISTRY[agent].buildPrompt(lang);
}

/** Display name for an agent (matches the frozen UI). */
export function getAgentDisplay(agent: AgentKey, lang: Lang): string {
  return AGENT_REGISTRY[agent].persona.label[lang];
}

/** Badge metadata for the UI (TASK 4 §Agent Badge). */
export function getAgentBadge(agent: AgentKey, lang: Lang): AgentBadge {
  return AGENT_REGISTRY[agent].badge(lang);
}

/** Whether this agent must state a confidence level (Plant Doctor). */
export function agentRequiresConfidence(agent: AgentKey): boolean {
  return AGENT_REGISTRY[agent].persona.requiresConfidence;
}
