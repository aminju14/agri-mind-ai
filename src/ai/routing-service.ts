/**
 * Routing service (TASK 3 §Response Pipeline) — the orchestration layer between the
 * user and the specialist agents. It decides WHICH specialist handles the turn and
 * hands back the specialist prompt to inject into the final Claude request. It does NOT
 * answer the user.
 *
 * Precedence (decided for this repo — see the Q&A in TASK 3 run):
 *   1. promptKey present  → deterministic, free (matches the frozen suggested-prompt
 *                           routing in src/lib/data.ts).
 *   2. deterministic PREFILTER with a confident keyword hit → skip the LLM call.
 *   3. LLM Supervisor (Claude) classifies intent → canonical agent.
 *   4. LLM failed/unmappable → deterministic FALLBACK (keyword router).
 *   5. deterministic produced nothing meaningful → SUPERVISOR_FALLBACK_AGENT (research,
 *      TASK 3 §Error Handling). Never breaks the chat flow.
 */

import type { Lang } from "@/lib/types";
import type { ClassifierClient } from "./llm/classifier-client";
import { runSupervisor } from "./supervisor/supervisor-agent";
import { SUPERVISOR_PROMPT_VERSION } from "./supervisor/supervisor-prompt";
import { routeDeterministic } from "./router/deterministic-router";
import { getSpecialistPrompt, REGISTRY_PROMPT_VERSION } from "./agents/registry";
import {
  SUPERVISOR_FALLBACK_AGENT,
  type AgentKey,
  type RouteInput,
  type RoutingDecision,
} from "./types";

/**
 * Prefilter threshold: the deterministic router wins WITHOUT an LLM call when one agent
 * has a strong hit (≥ this) AND no rival agent matched at all (a clean single-domain
 * classification). This avoids a Claude call on the easy, unambiguous cases.
 */
const PREFILTER_TOP_SCORE = 1.0;

/** Maps a suggested-prompt key to its agent (frozen mapping — src/lib/data.ts PROMPTS). */
const PROMPT_KEY_AGENT: Record<string, AgentKey> = {
  learn: "agronomist",
  crops: "agronomist",
  diagnose: "plantdoctor",
  planning: "farmplanner",
  market: "research",
};

/** Optional sink for analytics (TASK 3 §Logging). Defaults to structured console. */
export interface RouteLogger {
  routed(entry: {
    agent: AgentKey;
    reason: string;
    source: RoutingDecision["source"];
    confidence?: number;
    promptVersion: string;
    lang: Lang;
    textPreview: string;
  }): void;
}

const defaultLogger: RouteLogger = {
  routed(entry) {
    // Structured, single line for analytics. TASK 4 §Logging: selected agent, intent,
    // timestamp. No full message body beyond a short preview (PII, MASTER §13).
    console.info(
      JSON.stringify({
        event: "route",
        timestamp: new Date().toISOString(),
        agent: entry.agent,
        intent: entry.reason, // the classification intent/reason
        source: entry.source,
        confidence: entry.confidence,
        promptVersion: entry.promptVersion,
        lang: entry.lang,
      }),
    );
  },
};

export interface RoutingServiceDeps {
  classifier: ClassifierClient;
  logger?: RouteLogger;
  /** Disable the LLM and use deterministic-only (tests / degraded mode). */
  deterministicOnly?: boolean;
}

export interface RouteResult extends RoutingDecision {
  /** The specialist system prompt to inject into the final Claude request. */
  specialistPrompt: string;
  /** Combined prompt-version tag for the message record (MASTER §16.2). */
  promptVersion: string;
}

export class RoutingService {
  private classifier: ClassifierClient;
  private logger: RouteLogger;
  private deterministicOnly: boolean;

  constructor(deps: RoutingServiceDeps) {
    this.classifier = deps.classifier;
    this.logger = deps.logger ?? defaultLogger;
    this.deterministicOnly = deps.deterministicOnly ?? false;
  }

  /**
   * Decide the agent for a turn and return the specialist prompt to inject.
   * Guaranteed to resolve to a valid agent; never throws (TASK 3 §Error Handling).
   */
  async route(input: RouteInput, signal?: AbortSignal): Promise<RouteResult> {
    const decision = await this.decide(input, signal);
    const promptVersion = `${decision.source === "supervisor" ? SUPERVISOR_PROMPT_VERSION : "router@v1"}+${REGISTRY_PROMPT_VERSION}`;

    this.logger.routed({
      agent: decision.agent,
      reason: decision.reason,
      source: decision.source,
      confidence: decision.confidence,
      promptVersion,
      lang: input.lang,
      textPreview: input.text.slice(0, 60),
    });

    return {
      ...decision,
      specialistPrompt: getSpecialistPrompt(decision.agent, input.lang),
      promptVersion,
    };
  }

  /** The decision logic (no logging/prompt-injection) — pure-ish, testable. */
  private async decide(input: RouteInput, signal?: AbortSignal): Promise<RoutingDecision> {
    // 1. prompt-card origin wins (deterministic, free)
    if (input.promptKey && PROMPT_KEY_AGENT[input.promptKey]) {
      const agent = PROMPT_KEY_AGENT[input.promptKey];
      return { agent, reason: `prompt-card:${input.promptKey}`, source: "prompt_card", confidence: 1 };
    }

    // 2. deterministic prefilter — a clean single-domain keyword hit skips the LLM call
    const det = routeDeterministic(input.text, input.lang);
    if (!this.deterministicOnly && det.cleanWinner && det.topScore >= PREFILTER_TOP_SCORE) {
      return { agent: det.agent, reason: `prefilter:${det.reason}`, source: "deterministic", confidence: 0.8 };
    }

    // 3. LLM supervisor
    if (!this.deterministicOnly) {
      const llm = await runSupervisor(this.classifier, input.text, input.lang, { signal });
      if (llm) return llm;
    }

    // 4. deterministic fallback (LLM failed/unmappable, or deterministicOnly)
    if (det.reason !== "default:no-signal") {
      return { agent: det.agent, reason: `fallback-router:${det.reason}`, source: "deterministic", confidence: 0.5 };
    }

    // 5. last-resort fallback agent — never break the chat flow (TASK 3 §Error Handling)
    return {
      agent: SUPERVISOR_FALLBACK_AGENT,
      reason: "fallback:no-signal",
      source: "fallback",
      confidence: 0,
    };
  }
}

/** Convenience factory. */
export function createRoutingService(deps: RoutingServiceDeps): RoutingService {
  return new RoutingService(deps);
}
