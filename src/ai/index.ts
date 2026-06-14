/**
 * AgriMind routing layer (TASK 3 — Supervisor Agent).
 *
 *   import { createRoutingService, createAnthropicClassifier } from "@/ai";
 *
 *   const routing = createRoutingService({ classifier: createAnthropicClassifier() });
 *   const r = await routing.route({ text, lang, promptKey });
 *   // r.agent          → canonical AgentKey (UI/DB safe)
 *   // r.specialistPrompt → inject into the final Claude request (Chat Engine)
 *
 * Scope: routing ONLY. No RAG / search / citations / insights (TASK 3 §Deliverables).
 */

export { createRoutingService, RoutingService } from "./routing-service";
export type { RoutingServiceDeps, RouteResult, RouteLogger } from "./routing-service";

export { runSupervisor, extractJsonObject } from "./supervisor/supervisor-agent";
export {
  buildSupervisorSystemPrompt,
  SUPERVISOR_PROMPT_VERSION,
} from "./supervisor/supervisor-prompt";

export { routeDeterministic } from "./router/deterministic-router";

export {
  AGENT_REGISTRY,
  getSpecialistPrompt,
  getAgentDisplay,
  getAgentBadge,
  agentRequiresConfidence,
  REGISTRY_PROMPT_VERSION,
} from "./agents/registry";

export type { SpecialistAgent } from "./agents/base-agent";
export {
  type AgentPersona,
  type AgentBadge,
  type ConfidenceLevel,
  type ConfidenceBand,
  type SpecialistMeta,
  confidenceBand,
  confidenceLabel,
  SHARED_RULES,
} from "./contracts/response-contracts";

export {
  createAnthropicClassifier,
  type ClassifierClient,
  type ClassifyRequest,
  type ClassifyResult,
} from "./llm/classifier-client";

export {
  normalizeAgentKey,
  toSupervisorName,
  CANONICAL_AGENTS,
  SUPERVISOR_FALLBACK_AGENT,
  type AgentKey,
  type SupervisorAgentName,
  type RoutingDecision,
  type RouteInput,
  type RouteSource,
  type SupervisorJson,
} from "./types";
