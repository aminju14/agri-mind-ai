/**
 * TASK 5 — Memory service (facade used by the orchestrator).
 *
 * Two responsibilities:
 *   1. RETRIEVE + INJECT: build the "Known User Context" block to prepend to the
 *      specialist prompt before generation.
 *   2. EXTRACT + STORE: after a turn, classify it into memories, store the ones above the
 *      confidence gate (dedup/update, no duplicates), and enforce the 20-active limit.
 *
 * Both paths are resilient: failures are swallowed (logged) so the chat flow is never
 * broken (TASK 5: integrate with the existing chat flow).
 */

import type { Lang } from "@/lib/types";
import type { ClassifierClient } from "@/ai/llm/classifier-client";
import { createAnthropicClassifier } from "@/ai/llm/classifier-client";
import { extractMemories } from "./memory-extractor";
import { buildMemoryBlock, injectMemory } from "./memory-injector";
import {
  activeMemoriesByCategory,
  enforceActiveLimit,
  upsertMemory,
} from "./memory.repository";
import type { ExtractionContext } from "./memory.types";

export interface MemoryServiceDeps {
  /** Injectable classifier seam (real Anthropic, or a fake in tests). */
  classifier?: ClassifierClient;
}

export class MemoryService {
  private classifier: ClassifierClient;

  constructor(deps: MemoryServiceDeps = {}) {
    this.classifier = deps.classifier ?? createAnthropicClassifier();
  }

  /**
   * Build the localized "Known User Context" block for a user. Returns "" if the user has
   * no active memories (or on any error — fail open, never block the turn).
   */
  async getMemoryBlock(userId: string, lang: Lang): Promise<string> {
    try {
      const byCategory = await activeMemoriesByCategory(userId);
      return buildMemoryBlock(byCategory, lang);
    } catch (e) {
      console.warn("[memory] getMemoryBlock failed:", e instanceof Error ? e.message : e);
      return "";
    }
  }

  /** Prepend the memory block to a specialist prompt (TASK 5 §Memory Injection). */
  async injectInto(specialistPrompt: string, userId: string, lang: Lang): Promise<string> {
    const block = await this.getMemoryBlock(userId, lang);
    return injectMemory(specialistPrompt, block);
  }

  /**
   * Extract + store memories from a completed turn, then enforce the active limit.
   * Designed to run ASYNC after `done` — non-blocking, best-effort.
   * Returns the number of memories stored/updated (for logging/tests).
   */
  async rememberFromTurn(
    userId: string,
    ctx: ExtractionContext,
    opts: { signal?: AbortSignal } = {},
  ): Promise<number> {
    try {
      const extracted = await extractMemories(this.classifier, ctx, opts);
      if (extracted.length === 0) return 0;
      for (const m of extracted) {
        await upsertMemory(userId, {
          category: m.memoryType,
          value: m.value,
          confidence: m.confidence,
        });
      }
      await enforceActiveLimit(userId);
      return extracted.length;
    } catch (e) {
      console.warn("[memory] rememberFromTurn failed:", e instanceof Error ? e.message : e);
      return 0;
    }
  }
}

/** Default singleton convenience. */
export function createMemoryService(deps: MemoryServiceDeps = {}): MemoryService {
  return new MemoryService(deps);
}
