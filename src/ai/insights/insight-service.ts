/**
 * TASK 9 — Insight service (facade used by the orchestrator).
 *
 *   context → generate (LLM) → build (validate/order) → persist + update Insights Panel
 *
 * Designed to run ASYNC after the answer is delivered (non-blocking). Resilient: any
 * failure returns no insights and never breaks the chat flow (§Error Handling). Logs
 * category/confidence/generation-time/agent (§Logging). Target < 500ms additional.
 */

import type { ClassifierClient } from "@/ai/llm/classifier-client";
import { createAnthropicClassifier } from "@/ai/llm/classifier-client";
import type { PanelData } from "@/lib/types";
import { PANEL } from "@/lib/data";
import * as panelRepo from "@/server/persistence/panel";
import { generateRawInsights } from "./insight-generator";
import { buildInsights, applyInsightsToPanel } from "./insight-builder";
import { saveInsights } from "./insight-repository";
import type { CreateInsightInput, Insight, InsightGenerationInput } from "./insight-types";

export interface InsightServiceDeps {
  classifier?: ClassifierClient;
}

export interface GeneratedInsights {
  insights: Insight[];
  generationMs: number;
}

export class InsightService {
  private classifier: ClassifierClient;

  constructor(deps: InsightServiceDeps = {}) {
    this.classifier = deps.classifier ?? createAnthropicClassifier();
  }

  /**
   * Generate + persist insights for a completed turn, and refresh the Insights Panel
   * snapshot. Best-effort/async: never throws. Returns the built insights (for tests/logs).
   */
  async generateForTurn(
    userId: string,
    conversationId: string,
    messageId: string,
    input: InsightGenerationInput,
    opts: { signal?: AbortSignal } = {},
  ): Promise<GeneratedInsights> {
    const t0 = Date.now();
    try {
      const raw = await generateRawInsights(this.classifier, input, opts);
      const insights = buildInsights(input.agent, raw);
      const generationMs = Date.now() - t0;

      // persist insights (0–2 per message)
      if (insights.length > 0) {
        const rows: CreateInsightInput[] = insights.map((ins, i) => ({
          conversationId,
          messageId,
          title: ins.title,
          content: ins.content,
          category: ins.category,
          confidence: ins.confidence,
          ordinal: i,
        }));
        await saveInsights(userId, rows).catch(() => {});
      }

      // Refresh the Insights Panel snapshot: insights → topics/insight, the turn's real
      // sources → "Related Knowledge" (web links + RAG docs), LearningPath → "Learning Path".
      // We refresh even with 0 insights so knowledge/learning stay current.
      await this.updatePanel(userId, conversationId, input.lang, insights, input.panelSources).catch(() => {});

      if (insights.length > 0) this.log(input.agent, insights, generationMs);
      return { insights, generationMs };
    } catch (e) {
      console.warn("[insight] generateForTurn failed:", e instanceof Error ? e.message : e);
      return { insights: [], generationMs: Date.now() - t0 };
    }
  }

  /** Merge insights + knowledge + learning into the latest panel snapshot, then persist. */
  private async updatePanel(
    userId: string,
    conversationId: string,
    lang: "en" | "id",
    insights: Insight[],
    sources?: InsightGenerationInput["panelSources"],
  ): Promise<void> {
    const current = (await panelRepo.getLatestPanelSnapshot(userId, conversationId)) ?? PANEL[lang];

    // "Related Knowledge" = the turn's actual sources: web results (clickable) first, then RAG docs.
    const knowledge: PanelData["knowledge"] = [];
    const labels = lang === "id"
      ? { web: "Web", kb: "Basis Pengetahuan" }
      : { web: "Web", kb: "Knowledge Base" };
    for (const w of sources?.web ?? []) {
      knowledge.push({ title: w.title, source: w.domain, cat: labels.web, url: w.url });
    }
    for (const r of sources?.rag ?? []) {
      knowledge.push({ title: r.title, source: r.source, cat: labels.kb });
    }

    // "Learning Path" = the user's per-user progress from the DB (seed for new users).
    let learning: PanelData["learning"] | undefined;
    try {
      const paths = await panelRepo.getLearningPaths(userId);
      if (paths.length > 0) learning = paths;
    } catch {
      learning = undefined;
    }

    const next: PanelData = applyInsightsToPanel(current, insights, lang, {
      knowledge: knowledge.length > 0 ? knowledge : undefined,
      learning,
    });
    await panelRepo.savePanelSnapshot(userId, conversationId, lang, next);
  }

  private log(agent: string, insights: Insight[], ms: number) {
    console.info(
      JSON.stringify({
        event: "insights_generated",
        agent,
        generationMs: ms,
        count: insights.length,
        insights: insights.map((i) => ({ category: i.category, confidence: Number(i.confidence.toFixed(3)) })),
      }),
    );
  }
}

export function createInsightService(deps: InsightServiceDeps = {}): InsightService {
  return new InsightService(deps);
}
