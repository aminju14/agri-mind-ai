/**
 * Supervisor Agent (TASK 3 §Routing Layer).
 *
 * Responsibilities (and ONLY these — it never answers the user):
 *   - Build the supervisor prompt
 *   - Call Claude (via the injectable ClassifierClient seam)
 *   - Parse the JSON output robustly
 *   - Map the supervisor vocabulary → canonical AgentKey
 *   - Return a RoutingDecision (or signal failure so the caller can fall back)
 */

import type { Lang } from "@/lib/types";
import type { ClassifierClient } from "../llm/classifier-client";
import {
  buildSupervisorSystemPrompt,
  buildSupervisorUserPrompt,
  SUPERVISOR_PROMPT_VERSION,
} from "./supervisor-prompt";
import {
  normalizeAgentKey,
  type AgentKey,
  type RoutingDecision,
  type SupervisorJson,
} from "../types";

export { SUPERVISOR_PROMPT_VERSION };

export interface SupervisorOptions {
  /** Abort/timeout from the orchestrator. */
  signal?: AbortSignal;
  /** Override classification token cap. */
  maxTokens?: number;
}

/**
 * Extract the first balanced JSON object from arbitrary model text. Tolerates code
 * fences, leading/trailing prose, and trailing commentary — the supervisor is told to
 * output JSON only, but we never trust that fully.
 */
export function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  // strip code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;

  const start = body.indexOf("{");
  if (start === -1) return null;
  // scan for the matching closing brace, respecting string literals
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = body.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Validate that a parsed object looks like the supervisor JSON contract. */
function asSupervisorJson(obj: unknown): SupervisorJson | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.agent !== "string") return null;
  const reason = typeof o.reason === "string" ? o.reason : "";
  return { agent: o.agent as SupervisorJson["agent"], reason };
}

/**
 * Run the LLM supervisor for one message. Returns a canonical RoutingDecision on
 * success, or null if the call failed or produced an unmappable result (the routing
 * service then falls back — TASK 3 §Error Handling). This function NEVER throws to the
 * caller; classification failure is a null, not an exception.
 */
export async function runSupervisor(
  client: ClassifierClient,
  text: string,
  lang: Lang,
  opts: SupervisorOptions = {},
): Promise<RoutingDecision | null> {
  let raw: string;
  try {
    const res = await client.classify({
      system: buildSupervisorSystemPrompt(lang),
      user: buildSupervisorUserPrompt(text),
      maxTokens: opts.maxTokens ?? 128,
      temperature: 0,
      signal: opts.signal,
    });
    raw = res.text;
  } catch {
    // network/timeout/abort/missing key — let the caller fall back.
    return null;
  }

  const parsed = asSupervisorJson(extractJsonObject(raw));
  if (!parsed) return null;

  const agent: AgentKey | null = normalizeAgentKey(parsed.agent);
  if (!agent) return null; // unmappable agent value → caller falls back

  const reason = parsed.reason?.trim() || `classified as ${agent}`;
  return {
    agent,
    reason,
    source: "supervisor",
    confidence: 0.9,
    rawAgent: parsed.agent,
  };
}
