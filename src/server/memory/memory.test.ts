import { describe, it, expect, vi } from "vitest";
import { extractMemories, extractJsonArray } from "./memory-extractor";
import { buildMemoryBlock, injectMemory } from "./memory-injector";
import { MEMORY_CONFIDENCE_THRESHOLD, type MemoryCategory } from "./memory.types";
import type { ClassifierClient } from "@/ai/llm/classifier-client";
import type { ExtractionContext } from "./memory.types";

function fakeClassifier(text: string | Error): ClassifierClient {
  return {
    classify: vi.fn(async () => {
      if (text instanceof Error) throw text;
      return { text };
    }),
  };
}

const ctx: ExtractionContext = {
  history: "",
  userMessage: "How do I treat brown spots on my chili?",
  assistantResponse: "Likely a fungal disease...",
  lang: "en",
};

describe("extractJsonArray", () => {
  it("parses a clean JSON array", () => {
    expect(extractJsonArray('[{"memoryType":"crop_interest","value":"chili","confidence":0.9}]')).toEqual([
      { memoryType: "crop_interest", value: "chili", confidence: 0.9 },
    ]);
  });
  it("parses an array inside code fences + prose", () => {
    const t = 'Sure:\n```json\n[{"memoryType":"goal","value":"improve yield","confidence":0.85}]\n```';
    expect(extractJsonArray(t)).toEqual([{ memoryType: "goal", value: "improve yield", confidence: 0.85 }]);
  });
  it("returns null when no array", () => {
    expect(extractJsonArray("nothing here")).toBeNull();
  });
});

describe("extractMemories — gate & validation (TASK 5 §Memory Rules)", () => {
  it("keeps only memories with confidence > 0.8", async () => {
    const client = fakeClassifier(
      JSON.stringify([
        { memoryType: "crop_interest", value: "chili", confidence: 0.92 },
        { memoryType: "challenge", value: "brown spots", confidence: 0.7 }, // below gate
        { memoryType: "learning_interest", value: "disease diagnosis", confidence: 0.81 },
      ]),
    );
    const out = await extractMemories(client, ctx);
    expect(out.map((m) => m.value).sort()).toEqual(["chili", "disease diagnosis"]);
  });

  it("the threshold is strict (> 0.8, not >=)", async () => {
    const client = fakeClassifier(JSON.stringify([{ memoryType: "goal", value: "x", confidence: 0.8 }]));
    expect(await extractMemories(client, ctx)).toEqual([]);
    expect(MEMORY_CONFIDENCE_THRESHOLD).toBe(0.8);
  });

  it("rejects unknown categories", async () => {
    const client = fakeClassifier(JSON.stringify([{ memoryType: "weather", value: "rain", confidence: 0.99 }]));
    expect(await extractMemories(client, ctx)).toEqual([]);
  });

  it("normalizes values to lowercase and de-dups within a turn", async () => {
    const client = fakeClassifier(
      JSON.stringify([
        { memoryType: "crop_interest", value: "Chili", confidence: 0.9 },
        { memoryType: "crop_interest", value: "chili", confidence: 0.95 },
      ]),
    );
    const out = await extractMemories(client, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe("chili");
  });

  it("returns [] (never throws) on classifier error", async () => {
    expect(await extractMemories(fakeClassifier(new Error("down")), ctx)).toEqual([]);
  });

  it("returns [] on empty/garbage output", async () => {
    expect(await extractMemories(fakeClassifier("[]"), ctx)).toEqual([]);
    expect(await extractMemories(fakeClassifier("no json"), ctx)).toEqual([]);
  });
});

describe("memory injector (TASK 5 §Memory Injection)", () => {
  const grouped = (): Record<MemoryCategory, string[]> => ({
    crop_interest: ["chili"],
    learning_interest: ["disease diagnosis"],
    goal: ["improve yield"],
    challenge: [],
  });

  it("builds a Known User Context block with localized headings + title-cased values", () => {
    const block = buildMemoryBlock(grouped(), "en");
    expect(block).toMatch(/KNOWN USER CONTEXT/);
    expect(block).toMatch(/Interested Crops:\n- Chili/);
    expect(block).toMatch(/Learning Interests:\n- Disease Diagnosis/);
    expect(block).toMatch(/Goals:\n- Improve Yield/);
    // empty category omitted
    expect(block).not.toMatch(/Challenges/);
  });

  it("localizes to Bahasa Indonesia", () => {
    const block = buildMemoryBlock(grouped(), "id");
    expect(block).toMatch(/KONTEKS PENGGUNA/);
    expect(block).toMatch(/Tanaman yang Diminati/);
  });

  it("returns empty string when there are no memories", () => {
    const empty: Record<MemoryCategory, string[]> = {
      crop_interest: [],
      learning_interest: [],
      goal: [],
      challenge: [],
    };
    expect(buildMemoryBlock(empty, "en")).toBe("");
  });

  it("prepends the memory block BEFORE the specialist prompt", () => {
    const out = injectMemory("SPECIALIST PROMPT", "MEM BLOCK");
    expect(out.indexOf("MEM BLOCK")).toBeLessThan(out.indexOf("SPECIALIST PROMPT"));
    expect(out).toContain("---");
  });

  it("returns the specialist prompt unchanged when no memory", () => {
    expect(injectMemory("SPECIALIST", "")).toBe("SPECIALIST");
  });
});
