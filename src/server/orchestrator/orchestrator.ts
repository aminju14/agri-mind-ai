/**
 * Chat orchestrator — owns the per-turn lifecycle (MASTER §5). It is transport-agnostic:
 * it drives an SseEmitter. Wires routing (T3) + personas (T4) + memory (T5) + RAG (T6) +
 * citations (T7) + web search (T8) + proactive insights (T9, async after `done`).
 *
 * Lifecycle implemented here (steps from MASTER §5):
 *   2 PERSIST-USER → 3 ROUTE → 4 EMIT-META → 9 GENERATE → 10 STREAM (blocks)
 *   → 11 VALIDATE/repair → 15 PERSIST-AI → 16 DONE
 * Gating (step 0) and input validation happen in the route handler before this runs.
 *
 * Cancellation: the whole turn runs under one AbortController; client disconnect aborts
 * generation (stops billing) and we persist nothing as a clean answer (MASTER §7).
 */

import { createId } from "@/server/persistence/id";
import * as conversations from "@/server/persistence/conversations";
import * as messages from "@/server/persistence/messages";
import * as usage from "@/server/persistence/usage";
import { createRoutingService, getAgentBadge, type RoutingService } from "@/ai";
import { createAnthropicClassifier } from "@/ai/llm/classifier-client";
import {
  createDefaultGenerator,
  type GenerationClient,
  type GenerationUsage,
} from "@/server/llm/generation-client";
import { BlockStreamParser } from "@/server/llm/block-parser";
import { createMemoryService, type MemoryService } from "@/server/memory";
import type { ExtractionContext } from "@/server/memory";
import { createRetrievalMiddleware, type RetrievalMiddleware } from "@/server/rag";
import { createCitationService, type CitationService } from "@/ai/citations";
import {
  createWebSearchService,
  combineKnowledgeBlocks,
  type WebSearchService,
} from "@/ai/tools/web-search";
import { createInsightService, type InsightService } from "@/ai/insights";
import * as memoryRepo from "@/server/memory/memory.repository";
import type { SseEmitter } from "./sse";
import type { Block, Lang } from "@/lib/types";

export interface TurnRequest {
  userId: string;
  conversationId?: string;
  text: string;
  lang: Lang;
  promptKey?: string;
  traceId: string;
}

export interface OrchestratorDeps {
  routing?: RoutingService;
  generator?: GenerationClient;
  memory?: MemoryService;
  retrieval?: RetrievalMiddleware;
  citations?: CitationService;
  webSearch?: WebSearchService;
  insights?: InsightService;
}

export class Orchestrator {
  private routing: RoutingService;
  private generator: GenerationClient;
  private memory: MemoryService;
  private retrieval: RetrievalMiddleware;
  private citations: CitationService;
  private webSearch: WebSearchService;
  private insights: InsightService;

  constructor(deps: OrchestratorDeps = {}) {
    this.routing =
      deps.routing ??
      createRoutingService({ classifier: createAnthropicClassifier() });
    this.generator = deps.generator ?? createDefaultGenerator();
    this.retrieval = deps.retrieval ?? createRetrievalMiddleware();
    this.memory = deps.memory ?? createMemoryService();
    this.citations = deps.citations ?? createCitationService();
    this.webSearch = deps.webSearch ?? createWebSearchService();
    this.insights = deps.insights ?? createInsightService();
  }

  /**
   * Run one turn, emitting SSE events. `signal` aborts generation on client disconnect.
   * This method guarantees a terminal event (done/error) via the SSE layer, and never
   * throws to the caller — failures become error events or graceful degradations.
   */
  async runTurn(req: TurnRequest, emit: SseEmitter, signal: AbortSignal): Promise<void> {
    const { userId, lang, text, traceId } = req;

    // step 2 — ensure conversation + persist user message
    // Gracefully handle DB unavailability so AI generation still works.
    let convoId: string;
    try {
      const convo = await conversations.ensureConversation(userId, req.conversationId, lang);
      if (!convo) {
        emit.error({ code: "forbidden", retryable: false, message: "conversation not found", traceId });
        return;
      }
      convoId = convo.id;
      await messages.insertUserMessage(userId, { conversationId: convoId, text, lang });
      await conversations.setTitleIfDefault(userId, convoId, text).catch(() => {});
    } catch (e) {
      console.warn("[orchestrator] DB unavailable, skipping persistence:", e instanceof Error ? e.message : e);
      convoId = createId(); // synthetic id so the rest of the pipeline works
    }

    // step 3 — route to a specialist (Task-3 RoutingService)
    const route = await this.routing.route({ text, lang, promptKey: req.promptKey }, signal);
    const messageId = createId();

    // step 4 — meta first (drives the UI agent identity + badge, TASK 4 §Agent Badge)
    const badge = getAgentBadge(route.agent, lang);
    emit.meta({ messageId, agentKey: route.agent, agentLabel: badge.agentLabel, lang, conversationId: convoId });

    // Knowledge-first (TASK 8 §Search Philosophy): Memory → RAG → Web.
    // TASK 6 — retrieve internal agricultural knowledge (per-agent policy). Never blocks.
    const retrieval = await this.retrieval.retrieveForTurn(route.agent, text, lang);

    // TASK 8 — web search for RECENT/real-time info, only when the router says it's needed
    // and a provider key exists. Failures fall back to RAG-only (never blocks).
    const web = await this.webSearch.searchForTurn(route.agent, text, lang, traceId, signal);

    // TASK 5 — inject "Known User Context" before the specialist prompt (best-effort).
    const withMemory = await this.memory.injectInto(route.specialistPrompt, userId, lang);

    // Build the knowledge section: [Retrieved Knowledge (KB)] + [Web Search Results].
    // Then prepend it before [Known User Context] → [Specialist Prompt].
    const knowledgeBlock = combineKnowledgeBlocks(retrieval.contextBlock, web.contextBlock);
    const systemPrompt = this.retrieval.inject(withMemory, knowledgeBlock);

    // step 9/10 — generate + stream blocks incrementally
    const parser = new BlockStreamParser((ev) => {
      switch (ev.kind) {
        case "blockStart":
          emit.blockStart(ev.index, ev.type);
          break;
        case "textDelta":
          emit.blockDelta(ev.index, ev.text);
          break;
        case "item":
          emit.blockItem(ev.index, ev.item);
          break;
        case "blockEnd":
          emit.blockEnd(ev.index);
          break;
        case "insight":
          emit.insight(ev.insight);
          break;
      }
    });

    const usageHolder: { value: GenerationUsage | null } = { value: null };
    let aborted = false;
    try {
      for await (const delta of this.generator.stream(
        { system: systemPrompt, user: text, lang, agentKey: route.agent },
        (u) => {
          usageHolder.value = u;
        },
      )) {
        if (signal.aborted) {
          aborted = true;
          break;
        }
        parser.push(delta);
      }
    } catch (e) {
      // Generation failed mid-stream. If nothing was produced, surface a retryable error.
      const { blocks } = parser.finalize();
      if (blocks.length === 0 || (blocks.length === 1 && !blocks[0])) {
        emit.error({
          code: "upstream_unavailable",
          retryable: true,
          message: e instanceof Error ? e.message : "generation failed",
          traceId,
        });
        return;
      }
      // else fall through to persist what we have (degraded)
    }

    // step 11 — finalize (repair to valid frozen blocks)
    const { blocks, insight, repairs } = parser.finalize();
    const usedRag = retrieval.used.length > 0;
    const usedWeb = web.used.length > 0;

    // TASK 7 — build citations from the chunks the answer used (dedup + rank). Empty when
    // no knowledge was retrieved; never throws (the answer proceeds regardless).
    // TASK 7+8 — build citations from KB chunks AND web sources, merged + ranked together.
    const built = this.citations.build(route.agent, retrieval.used, traceId, web.citationSources);

    if (aborted) {
      // Client disconnected: persist as unsynced/aborted audit, do NOT emit done as clean.
      await messages
        .insertAiMessage(userId, {
          id: messageId,
          conversationId: convoId,
          lang,
          agentKey: route.agent,
          blocks,
          insight: insight || null,
          citations: built.rows,
          routerReason: route.reason,
          routerScores: null,
          usedRag,
          usedWeb,
          promptVersion: route.promptVersion,
          modelId: this.generator.modelId,
          blockRepairs: repairs,
          aborted: true,
        })
        .catch(() => {});
      emit.error({ code: "timeout", retryable: true, message: "turn aborted", traceId });
      return;
    }

    // step 15 — persist the AI message (lossless). Blocks/insight/usedRag are persisted.
    // The DB row id is `messageId` so it matches the id already emitted in `meta` and the
    // one emitted in `done` (SSE identity, §3.6).
    try {
      await messages.insertAiMessage(userId, {
        id: messageId,
        conversationId: convoId,
        lang,
        agentKey: route.agent,
        blocks,
        insight: insight || null,
        citations: built.rows,
        routerReason: route.reason,
        routerScores: null,
        usedRag,
        usedWeb,
        promptVersion: route.promptVersion,
        modelId: this.generator.modelId,
        blockRepairs: repairs,
      });
    } catch {
      // Stream already delivered to the client; flag for async backfill (MASTER §7).
      // We still emit done so the user keeps the answer.
    }

    // TASK 7 — emit citations to the UI (frozen `citations` SSE event). Rendered in the
    // existing citation cards once the answer's blocks finish revealing (showExtras).
    if (built.ui.length > 0) emit.citations(built.ui);

    // usage accounting (best-effort)
    const genUsage = usageHolder.value;
    if (genUsage) {
      await usage
        .recordUsage(userId, {
          messageId,
          provider: "anthropic",
          kind: "generation",
          inputTokens: genUsage.inputTokens,
          outputTokens: genUsage.outputTokens,
        })
        .catch(() => {});
    }

    // step 16 — done
    emit.done({
      messageId,
      usage: genUsage ? { inputTokens: genUsage.inputTokens, outputTokens: genUsage.outputTokens } : undefined,
      traceId,
    });

    const answerText = blocksToText(blocks);

    // TASK 5 — extract + store memory ASYNC after the answer is delivered (non-blocking,
    // best-effort). The user already has the response; memory never blocks or breaks chat.
    const ctx: ExtractionContext = {
      history: "", // Phase 5: prior-turn context can be added when needed; not required.
      userMessage: text,
      assistantResponse: answerText,
      lang,
    };
    void this.memory.rememberFromTurn(userId, ctx).catch(() => {});

    // TASK 9 — generate proactive insights ASYNC after `done` (non-blocking, best-effort).
    // Inputs: question + answer + memory + RAG titles + web titles + agent. Updates the
    // Insights Panel snapshot. Never blocks or breaks chat (§Error Handling).
    void this.generateInsights(userId, convoId, messageId, route.agent, lang, text, answerText, retrieval, web).catch(
      () => {},
    );
  }

  /** Build the insight-generation input from the turn's context and run it (async). */
  private async generateInsights(
    userId: string,
    conversationId: string,
    messageId: string,
    agent: import("@/ai/types").AgentKey,
    lang: Lang,
    userMessage: string,
    assistantAnswer: string,
    retrieval: Awaited<ReturnType<RetrievalMiddleware["retrieveForTurn"]>>,
    web: Awaited<ReturnType<WebSearchService["searchForTurn"]>>,
  ): Promise<void> {
    // Pull the user's active memories to personalize insights (best-effort).
    let memory:
      | { cropInterests: string[]; learningInterests: string[]; goals: string[]; challenges: string[] }
      | undefined;
    try {
      const byCat = await memoryRepo.activeMemoriesByCategory(userId);
      memory = {
        cropInterests: byCat.crop_interest,
        learningInterests: byCat.learning_interest,
        goals: byCat.goal,
        challenges: byCat.challenge,
      };
    } catch {
      memory = undefined;
    }

    // Dedup RAG docs by title for the panel's "Related Knowledge" section.
    const ragSeen = new Set<string>();
    const ragDocs: { title: string; source: string }[] = [];
    for (const c of retrieval.used) {
      if (ragSeen.has(c.title)) continue;
      ragSeen.add(c.title);
      ragDocs.push({ title: c.title, source: c.source });
    }

    await this.insights.generateForTurn(userId, conversationId, messageId, {
      agent,
      lang,
      userMessage,
      assistantAnswer,
      memory,
      ragTitles: ragDocs.map((d) => d.title),
      webTitles: web.used.map((r) => `${r.title} (${r.domain})`),
      panelSources: {
        web: web.used.map((r) => ({ title: r.title, domain: r.domain, url: r.url })),
        rag: ragDocs,
      },
    });
  }
}

/** Flatten frozen blocks into plain text for the memory extractor. */
function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) =>
      b.type === "ul" ? (b.items ?? []).map((i) => `- ${i}`).join("\n") : b.text ?? "",
    )
    .filter(Boolean)
    .join("\n");
}
