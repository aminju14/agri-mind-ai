/**
 * TASK 6 — Retrieval middleware.
 *
 * The single entry point the orchestrator calls before generation. Applies the per-agent
 * RAG policy (TASK 6 §Agent Integration), runs retrieval, builds context, and returns the
 * injectable block + telemetry. Never throws: on any failure it returns an empty result
 * so generation proceeds on LLM knowledge (TASK 6 §Fallback Strategy).
 *
 *   Agronomist  → always use RAG
 *   Plant Doctor → always use RAG
 *   Farm Planner → use RAG when relevant (best-effort; same retrieval, cheap)
 *   Research     → use RAG first
 */

import type { AgentKey } from "@/ai/types";
import type { Lang } from "@/lib/types";
import type { RetrievedChunk } from "@/server/persistence/types";
import { createRagSearchService, type RagSearchService } from "./rag-search.service";
import { buildContext, injectContext, RAG_MAX_CONTEXT_CHARS } from "./context-builder";

export type RagPolicy = "always" | "when_relevant" | "rag_first" | "off";

/** Per-agent policy (TASK 6 §Agent Integration). */
export const AGENT_RAG_POLICY: Record<AgentKey, RagPolicy> = {
  agronomist: "always",
  plantdoctor: "always",
  farmplanner: "when_relevant",
  research: "rag_first",
};

export interface RetrievalResult {
  /** Injectable "Retrieved Agricultural Knowledge" block ("" if none). */
  contextBlock: string;
  /** Chunks used in the context (after dedup + cap). */
  used: RetrievedChunk[];
  /** Retrieval time in ms. */
  retrievalMs: number;
  /** Whether RAG ran for this turn (policy may skip it). */
  ragApplied: boolean;
}

const EMPTY: RetrievalResult = { contextBlock: "", used: [], retrievalMs: 0, ragApplied: false };

export interface RetrievalMiddlewareDeps {
  search?: RagSearchService;
  maxContextChars?: number;
}

export class RetrievalMiddleware {
  private search: RagSearchService;
  private maxContextChars: number;

  constructor(deps: RetrievalMiddlewareDeps = {}) {
    this.search = deps.search ?? createRagSearchService();
    this.maxContextChars = deps.maxContextChars ?? RAG_MAX_CONTEXT_CHARS;
  }

  /**
   * Retrieve + build context for a turn according to the agent's policy.
   * `query` is the user's message. Returns the injectable block + telemetry.
   */
  async retrieveForTurn(agent: AgentKey, query: string, lang: Lang): Promise<RetrievalResult> {
    const policy = AGENT_RAG_POLICY[agent];
    if (policy === "off") return EMPTY;

    try {
      const { chunks, retrievalMs } = await this.search.search(query, lang);
      if (chunks.length === 0) {
        return { ...EMPTY, retrievalMs, ragApplied: true }; // ran, but nothing → LLM fallback
      }
      const ctx = buildContext(chunks, lang, this.maxContextChars);
      return {
        contextBlock: ctx.text,
        used: ctx.used,
        retrievalMs,
        ragApplied: true,
      };
    } catch (e) {
      console.warn("[rag] middleware failed:", e instanceof Error ? e.message : e);
      return EMPTY; // never block generation
    }
  }

  /** Prepend the retrieved-knowledge block before the specialist prompt. */
  inject(specialistPrompt: string, contextBlock: string): string {
    return injectContext(specialistPrompt, contextBlock);
  }
}

export function createRetrievalMiddleware(deps: RetrievalMiddlewareDeps = {}): RetrievalMiddleware {
  return new RetrievalMiddleware(deps);
}
