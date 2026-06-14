/**
 * Supervisor / routing types.
 *
 * The Supervisor decides WHICH specialist handles a turn. It never answers the user.
 *
 * Vocabulary note (important): TASK 3 specifies the JSON values
 *   agronomist | plant_doctor | farm_planner | researcher
 * but the FROZEN system (src/lib/data.ts, the UI, the Prisma `AgentKey` enum) uses
 *   agronomist | plantdoctor | farmplanner | research        (MASTER §3.1)
 * which the UI and DB are already wired to. We therefore let the Supervisor speak the
 * TASK-3 vocabulary at its boundary, then normalize to the canonical `AgentKey` before
 * anything touches the UI or DB. Nothing frozen changes. See `normalizeAgentKey`.
 */

import type { Lang } from "@/lib/types";

/** Canonical, frozen agent identity used everywhere downstream (UI + DB). */
export type AgentKey = "agronomist" | "plantdoctor" | "farmplanner" | "research";

/** The vocabulary the Supervisor emits in its JSON (TASK 3 §Intent Classification). */
export type SupervisorAgentName =
  | "agronomist"
  | "plant_doctor"
  | "farm_planner"
  | "researcher";

/** Where a routing decision came from — for logging/analytics (TASK 3 §Logging). */
export type RouteSource =
  | "prompt_card" // user clicked a suggested prompt; agent is implied (deterministic)
  | "supervisor" // Claude supervisor classified the intent
  | "deterministic" // keyword router prefilter/fallback (AGENTS §13)
  | "fallback"; // classification failed → default agent (TASK 3 §Error Handling)

/** The structured decision the Supervisor returns. The Supervisor does NOT answer. */
export interface RoutingDecision {
  /** Canonical agent that will handle the turn. */
  agent: AgentKey;
  /** Short human-readable classification reason (stored for analytics). */
  reason: string;
  /** How the decision was reached (observability). */
  source: RouteSource;
  /** Optional confidence in [0,1] when available (supervisor/deterministic). */
  confidence?: number;
  /** The raw JSON the supervisor produced, if any (debugging/audit). */
  rawAgent?: SupervisorAgentName | string;
}

/** Exact JSON shape the supervisor prompt instructs Claude to output. */
export interface SupervisorJson {
  agent: SupervisorAgentName;
  reason: string;
}

/** Input to the routing service for one turn. */
export interface RouteInput {
  text: string;
  lang: Lang;
  /** Present when the turn came from a suggested prompt card (deterministic shortcut). */
  promptKey?: string;
}

// --------------------------------------------------------------------------
// Mapping between the Supervisor vocabulary and the canonical AgentKey.
// --------------------------------------------------------------------------

const SUPERVISOR_TO_CANONICAL: Record<SupervisorAgentName, AgentKey> = {
  agronomist: "agronomist",
  plant_doctor: "plantdoctor",
  farm_planner: "farmplanner",
  researcher: "research",
};

const CANONICAL_TO_SUPERVISOR: Record<AgentKey, SupervisorAgentName> = {
  agronomist: "agronomist",
  plantdoctor: "plant_doctor",
  farmplanner: "farm_planner",
  research: "researcher",
};

/** Canonical agents, in the frozen UI display order (AGENTS §1). */
export const CANONICAL_AGENTS: readonly AgentKey[] = [
  "agronomist",
  "plantdoctor",
  "farmplanner",
  "research",
] as const;

/**
 * TASK 3 fallback agent is "researcher" → canonical "research"
 * (TASK 3 §Error Handling). Note this differs from the system-wide FALLBACK.agent
 * (agronomist) used by the deterministic router; the Supervisor's *own* fallback is
 * research, applied only when LLM classification fails AND the deterministic prefilter
 * produced nothing. See routing-service.ts for the precedence.
 */
export const SUPERVISOR_FALLBACK_AGENT: AgentKey = "research";

/**
 * Normalize any agent string (supervisor vocab, canonical, or noisy LLM output) to a
 * canonical `AgentKey`, or null if unrecognizable. Tolerant of casing/spacing/hyphens
 * so a slightly-off LLM token (e.g. "Plant-Doctor", "farmPlanner") still maps.
 */
export function normalizeAgentKey(raw: string | undefined | null): AgentKey | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");

  // exact supervisor vocab
  if (k in SUPERVISOR_TO_CANONICAL) {
    return SUPERVISOR_TO_CANONICAL[k as SupervisorAgentName];
  }
  // canonical spellings (no separators)
  switch (k.replace(/_/g, "")) {
    case "agronomist":
      return "agronomist";
    case "plantdoctor":
      return "plantdoctor";
    case "farmplanner":
      return "farmplanner";
    case "research":
    case "researcher":
      return "research";
    default:
      return null;
  }
}

/** Convert a canonical key back to the supervisor vocabulary (for prompts/logs). */
export function toSupervisorName(agent: AgentKey): SupervisorAgentName {
  return CANONICAL_TO_SUPERVISOR[agent];
}
