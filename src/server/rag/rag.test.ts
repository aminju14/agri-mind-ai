import { describe, it, expect } from "vitest";
import { chunkDocument, CHUNK_DEFAULTS } from "./chunk-document";
import { buildContext, injectContext, RAG_MAX_CONTEXT_CHARS } from "./context-builder";
import { AGENT_RAG_POLICY } from "./retrieval-middleware";
import type { RetrievedChunk } from "@/server/persistence/types";

function para(n: number, filler = "word"): string {
  // ~ n chars paragraph
  return Array(Math.ceil(n / (filler.length + 1)))
    .fill(filler)
    .join(" ")
    .slice(0, n);
}

describe("TASK 6 — chunking (§Chunking Rules)", () => {
  it("respects the 800–1200 char band for multi-paragraph docs", () => {
    const doc = Array.from({ length: 12 }, () => para(400)).join("\n\n");
    const chunks = chunkDocument(doc);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(CHUNK_DEFAULTS.maxChars + 50); // small slack
    }
    // most chunks should be reasonably full
    const full = chunks.filter((c) => c.content.length >= CHUNK_DEFAULTS.minChars - 200);
    expect(full.length).toBeGreaterThan(0);
  });

  it("produces overlapping chunks (context carries over)", () => {
    const doc = Array.from({ length: 8 }, (_, i) => `Paragraph ${i}. ` + para(380)).join("\n\n");
    const chunks = chunkDocument(doc);
    // consecutive chunks should share some text (overlap)
    let overlaps = 0;
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1].content.slice(-100);
      const firstWords = prevTail.trim().split(" ").slice(-3).join(" ");
      if (firstWords && chunks[i].content.includes(firstWords)) overlaps++;
    }
    expect(overlaps).toBeGreaterThan(0);
  });

  it("returns a single chunk for short docs", () => {
    const chunks = chunkDocument("A short note about chili.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
  });

  it("returns nothing for empty input", () => {
    expect(chunkDocument("   ")).toEqual([]);
  });

  it("hard-splits an over-long single paragraph", () => {
    const chunks = chunkDocument(para(5000, "x"));
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(CHUNK_DEFAULTS.maxChars + 50);
  });
});

function chunk(id: string, text: string, score: number, source = "agrimind.ai"): RetrievedChunk {
  return { chunkId: id, documentId: "d", title: "t", category: "rice", source, lang: "en", text, score };
}

describe("TASK 6 — context builder (§Context Builder)", () => {
  it("merges chunks and preserves source references", () => {
    const ctx = buildContext([chunk("a", "Rice needs water.", 0.9, "fao.org"), chunk("b", "Corn likes sun.", 0.85)], "en");
    expect(ctx.text).toMatch(/RETRIEVED AGRICULTURAL KNOWLEDGE/);
    expect(ctx.text).toMatch(/source: fao.org/);
    expect(ctx.text).toMatch(/source: agrimind.ai/);
    expect(ctx.used).toHaveLength(2);
  });

  it("removes duplicate chunks", () => {
    const ctx = buildContext([chunk("a", "Same text here.", 0.9), chunk("b", "Same text here.", 0.8)], "en");
    expect(ctx.used).toHaveLength(1);
  });

  it("caps total context at the max length", () => {
    const big = Array.from({ length: 20 }, (_, i) => chunk("c" + i, para(1000, "z") + i, 0.9));
    const ctx = buildContext(big, "en", RAG_MAX_CONTEXT_CHARS);
    expect(ctx.chars).toBeLessThanOrEqual(RAG_MAX_CONTEXT_CHARS);
    expect(ctx.used.length).toBeLessThan(big.length);
  });

  it("returns empty for no chunks", () => {
    const ctx = buildContext([], "en");
    expect(ctx.text).toBe("");
    expect(ctx.used).toEqual([]);
  });

  it("localizes the heading", () => {
    expect(buildContext([chunk("a", "x", 0.9)], "id").text).toMatch(/PENGETAHUAN PERTANIAN/);
  });
});

describe("TASK 6 — prompt injection (§Prompt Injection)", () => {
  it("injects retrieved knowledge BEFORE the specialist prompt", () => {
    const out = injectContext("SPECIALIST", "KNOWLEDGE BLOCK");
    expect(out.indexOf("KNOWLEDGE BLOCK")).toBeLessThan(out.indexOf("SPECIALIST"));
  });
  it("returns the prompt unchanged when no context", () => {
    expect(injectContext("SPECIALIST", "")).toBe("SPECIALIST");
  });
});

describe("TASK 6 — per-agent RAG policy (§Agent Integration)", () => {
  it("matches the spec", () => {
    expect(AGENT_RAG_POLICY.agronomist).toBe("always");
    expect(AGENT_RAG_POLICY.plantdoctor).toBe("always");
    expect(AGENT_RAG_POLICY.farmplanner).toBe("when_relevant");
    expect(AGENT_RAG_POLICY.research).toBe("rag_first");
  });
});
