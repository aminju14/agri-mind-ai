import { describe, it, expect, vi } from "vitest";
import { generateRawInsights, extractJsonArray } from "./insight-generator";
import { buildInsights, applyInsightsToPanel, categoryLabel } from "./insight-builder";
import { resolveCategory, orderByAgentPreference } from "./insight-classifier";
import { AGENT_INSIGHT_PREFERENCES, INSIGHT_LENGTH, MAX_INSIGHTS, type RawInsight } from "./insight-types";
import type { ClassifierClient } from "@/ai/llm/classifier-client";
import { PANEL } from "@/lib/data";

function fakeClassifier(text: string | Error): ClassifierClient {
  return {
    classify: vi.fn(async () => {
      if (text instanceof Error) throw text;
      return { text };
    }),
  };
}

const input = {
  agent: "agronomist" as const,
  lang: "en" as const,
  userMessage: "How do I cultivate chili?",
  assistantAnswer: "Chili needs warm weather, well-drained soil...",
};

describe("TASK 9 — agent category preferences (§Agent Specific Rules)", () => {
  it("matches the spec", () => {
    expect(AGENT_INSIGHT_PREFERENCES.agronomist).toEqual(["learning", "planning", "risk"]);
    expect(AGENT_INSIGHT_PREFERENCES.plantdoctor).toEqual(["risk", "learning", "planning"]);
    expect(AGENT_INSIGHT_PREFERENCES.farmplanner).toEqual(["opportunity", "planning", "risk"]);
    expect(AGENT_INSIGHT_PREFERENCES.research).toEqual(["research", "learning", "opportunity"]);
  });
});

describe("TASK 9 — classifier", () => {
  it("trusts a valid provided category", () => {
    expect(resolveCategory("agronomist", "risk", "anything")).toBe("risk");
  });
  it("infers category from text when missing/invalid", () => {
    expect(resolveCategory("agronomist", "bogus", "watch out for disease and pest risk")).toBe("risk");
    expect(resolveCategory("research", undefined, "market demand is increasing, an opportunity")).toBe("opportunity");
    expect(resolveCategory("farmplanner", null, "create a planting schedule and budget")).toBe("planning");
  });
  it("falls back to the agent's top preference", () => {
    expect(resolveCategory("plantdoctor", "x", "neutral text with no signal word")).toBe("risk");
  });
  it("orders insights by agent preference then confidence", () => {
    const ordered = orderByAgentPreference("research", [
      { category: "risk" as const, confidence: 0.9 },
      { category: "research" as const, confidence: 0.7 },
      { category: "learning" as const, confidence: 0.8 },
    ]);
    expect(ordered[0].category).toBe("research"); // research agent prefers research first
  });
});

describe("TASK 9 — builder (validate/length/count/dedup)", () => {
  it("drops insights below the confidence gate", () => {
    const out = buildInsights("agronomist", [
      { title: "A", content: "good insight content here", category: "learning", confidence: 0.9 },
      { title: "B", content: "weak insight content here", category: "risk", confidence: 0.4 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("A");
  });

  it("caps at MAX_INSIGHTS (2)", () => {
    const raw: RawInsight[] = Array.from({ length: 4 }, (_, i) => ({
      title: `T${i}`,
      content: "content content content",
      category: "learning",
      confidence: 0.9,
    }));
    expect(buildInsights("agronomist", raw)).toHaveLength(MAX_INSIGHTS);
  });

  it("dedups by title", () => {
    const out = buildInsights("agronomist", [
      { title: "Same", content: "first", category: "learning", confidence: 0.9 },
      { title: "same", content: "second", category: "risk", confidence: 0.9 },
    ]);
    expect(out).toHaveLength(1);
  });

  it("clamps primary content to the max word length", () => {
    const long = Array(200).fill("word").join(" ");
    const out = buildInsights("agronomist", [{ title: "X", content: long, category: "learning", confidence: 0.9 }]);
    expect(out[0].content.split(/\s+/).length).toBeLessThanOrEqual(INSIGHT_LENGTH.primary.max);
  });

  it("returns [] for empty / all-invalid input", () => {
    expect(buildInsights("agronomist", [])).toEqual([]);
    expect(buildInsights("agronomist", [{ title: "", content: "", category: "learning", confidence: 0.9 }])).toEqual([]);
  });
});

describe("TASK 9 — panel mapping (UI frozen, §UI Integration)", () => {
  it("maps primary content to panel.insight and insights to topics (name=title, tag=category)", () => {
    const insights = buildInsights("agronomist", [
      { title: "Learn about anthracnose", content: "Anthracnose is a key chili disease...", category: "learning", confidence: 0.9 },
      { title: "Plan fertilization", content: "Set up an NPK schedule...", category: "planning", confidence: 0.8 },
    ]);
    const panel = applyInsightsToPanel(PANEL.en, insights, "en");
    expect(panel.insight).toMatch(/Anthracnose/);
    expect(panel.insightTitle).toBe("Learn about anthracnose");
    expect(panel.topics).toEqual([
      { name: "Learn about anthracnose", tag: "Learning" },
      { name: "Plan fertilization", tag: "Planning" },
    ]);
    // other panel sections preserved
    expect(panel.knowledge).toEqual(PANEL.en.knowledge);
  });

  it("returns the panel unchanged when there are no insights", () => {
    expect(applyInsightsToPanel(PANEL.en, [], "en")).toEqual(PANEL.en);
  });

  it("localizes category badges", () => {
    expect(categoryLabel("risk", "en")).toBe("Risk");
    expect(categoryLabel("risk", "id")).toBe("Risiko");
  });
});

describe("TASK 9 — generator (parse + resilience)", () => {
  it("parses a JSON array of insights", () => {
    expect(extractJsonArray('[{"title":"T","content":"C","category":"learning","confidence":0.9}]')).toHaveLength(1);
  });

  it("returns at most MAX_INSIGHTS raw insights", async () => {
    const client = fakeClassifier(
      JSON.stringify([
        { title: "A", content: "x", category: "learning", confidence: 0.9 },
        { title: "B", content: "y", category: "risk", confidence: 0.8 },
        { title: "C", content: "z", category: "planning", confidence: 0.7 },
      ]),
    );
    expect(await generateRawInsights(client, input)).toHaveLength(MAX_INSIGHTS);
  });

  it("returns [] (never throws) on classifier error or junk", async () => {
    expect(await generateRawInsights(fakeClassifier(new Error("down")), input)).toEqual([]);
    expect(await generateRawInsights(fakeClassifier("no json"), input)).toEqual([]);
    expect(await generateRawInsights(fakeClassifier("[]"), input)).toEqual([]);
  });
});
