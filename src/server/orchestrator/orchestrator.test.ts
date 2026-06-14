import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock persistence so the orchestrator runs without a database.
vi.mock("@/server/persistence/conversations", () => ({
  ensureConversation: vi.fn(async () => ({ id: "conv1", lang: "en" })),
  setTitleIfDefault: vi.fn(async () => {}),
}));
vi.mock("@/server/persistence/messages", () => ({
  insertUserMessage: vi.fn(async () => ({ id: "u1" })),
  insertAiMessage: vi.fn(async () => ({ id: "ai1" })),
}));
vi.mock("@/server/persistence/usage", () => ({
  recordUsage: vi.fn(async () => {}),
}));

import { Orchestrator } from "./orchestrator";
import { createSseStream, type SseEmitter } from "./sse";
import { createFakeGenerator } from "@/server/llm/generation-client";
import { createRoutingService } from "@/ai";
import type { ClassifierClient } from "@/ai/llm/classifier-client";
import * as messages from "@/server/persistence/messages";

const fakeClassifier: ClassifierClient = { classify: vi.fn(async () => ({ text: "{}" })) };

function frames(text: string): Array<{ event: string; data: unknown }> {
  return text
    .split("\n\n")
    .filter((f) => f && !f.startsWith(":"))
    .map((f) => {
      let event = "message";
      let data = "";
      for (const line of f.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      return { event, data: data ? JSON.parse(data) : null };
    });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

function runTurn(text: string, promptKey?: string) {
  const orch = new Orchestrator({
    routing: createRoutingService({ classifier: fakeClassifier, logger: { routed() {} } }),
    generator: createFakeGenerator({ delayMs: 0 }),
    // Stub memory so the orchestrator test stays hermetic (no DB / no extraction LLM).
    memory: {
      injectInto: async (prompt: string) => prompt,
      getMemoryBlock: async () => "",
      rememberFromTurn: async () => 0,
    } as unknown as import("@/server/memory").MemoryService,
    // Stub retrieval so the orchestrator test stays hermetic (no embeddings / no DB).
    retrieval: {
      retrieveForTurn: async () => ({ contextBlock: "", used: [], retrievalMs: 0, ragApplied: false }),
      inject: (prompt: string) => prompt,
    } as unknown as import("@/server/rag").RetrievalMiddleware,
    // Stub web search so the orchestrator test stays hermetic (no Tavily / no network).
    webSearch: {
      searchForTurn: async () => ({
        searched: false,
        reason: "stub",
        contextBlock: "",
        citationSources: [],
        used: [],
        searchMs: 0,
      }),
    } as unknown as import("@/ai/tools/web-search").WebSearchService,
    // Stub insights so the orchestrator test stays hermetic (no LLM / no DB; async anyway).
    insights: {
      generateForTurn: async () => ({ insights: [], generationMs: 0 }),
    } as unknown as import("@/ai/insights").InsightService,
  });
  const ac = new AbortController();
  const stream = createSseStream(async (emit: SseEmitter) => {
    await orch.runTurn(
      { userId: "dev", text, lang: "en", promptKey, traceId: "tr1" },
      emit,
      ac.signal,
    );
  });
  return drain(stream);
}

describe("Orchestrator.runTurn (with fake generator, mocked persistence)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits meta first, then blocks, then done", async () => {
    const fr = frames(await runTurn("How do I grow chili?", "learn"));
    expect(fr[0].event).toBe("meta");
    expect(fr[fr.length - 1].event).toBe("done");
    expect(fr.some((f) => f.event === "block")).toBe(true);
  });

  it("messageId is consistent across meta, done, and the persisted row (SSE identity §3.6)", async () => {
    const fr = frames(await runTurn("How do I grow chili?", "learn"));
    const metaId = (fr.find((f) => f.event === "meta")!.data as { messageId: string }).messageId;
    const doneId = (fr.find((f) => f.event === "done")!.data as { messageId: string }).messageId;
    expect(metaId).toBe(doneId);
    const persistArg = (messages.insertAiMessage as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][1] as { id?: string };
    expect(persistArg.id).toBe(metaId);
  });

  it("meta.agentKey reflects routing (prompt-card learn -> agronomist)", async () => {
    const fr = frames(await runTurn("anything", "learn"));
    expect((fr[0].data as { agentKey: string }).agentKey).toBe("agronomist");
  });

  it("routes a diagnosis prompt to plantdoctor", async () => {
    const fr = frames(await runTurn("My chili leaves are curling with brown spots"));
    expect((fr[0].data as { agentKey: string }).agentKey).toBe("plantdoctor");
  });

  it("persists the AI message losslessly", async () => {
    await runTurn("How do I grow chili?", "learn");
    expect(messages.insertAiMessage).toHaveBeenCalledOnce();
    const arg = (messages.insertAiMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as {
      blocks: { type: string }[];
      agentKey: string;
    };
    expect(arg.blocks[0].type).toBe("h");
    expect(arg.agentKey).toBe("agronomist");
  });

  it("streamed blocks reconstruct a valid frozen answer (h first, one ul)", async () => {
    const fr = frames(await runTurn("How do I grow chili?", "learn"));
    const blockFrames = fr.filter((f) => f.event === "block");
    const types = blockFrames
      .map((f) => (f.data as { type?: string }).type)
      .filter(Boolean);
    expect(types[0]).toBe("h");
    expect(types).toContain("ul");
  });

  it("emits an insight event (from the I: line) and persists it", async () => {
    const fr = frames(await runTurn("How do I grow chili?", "learn"));
    const insightFrame = fr.find((f) => f.event === "insight");
    expect(insightFrame).toBeTruthy();
    expect((insightFrame!.data as { insight: string }).insight).toContain("week one on soil");
    // persisted on the AI message
    const arg = (messages.insertAiMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as {
      insight: string | null;
    };
    expect(arg.insight).toContain("week one on soil");
  });

  it("does not leak the I: insight text into the rendered blocks", async () => {
    const fr = frames(await runTurn("How do I grow chili?", "learn"));
    const deltas = fr
      .filter((f) => f.event === "block")
      .map((f) => JSON.stringify(f.data))
      .join(" ");
    expect(deltas).not.toContain("week one on soil");
  });
});
