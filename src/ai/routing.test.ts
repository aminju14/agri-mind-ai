import { describe, it, expect, vi } from "vitest";
import { createRoutingService } from "./routing-service";
import { extractJsonObject, runSupervisor } from "./supervisor/supervisor-agent";
import { routeDeterministic } from "./router/deterministic-router";
import { normalizeAgentKey } from "./types";
import { getSpecialistPrompt } from "./agents/registry";
import type { ClassifierClient } from "./llm/classifier-client";

/** A fake classifier returning a fixed text, or throwing, for deterministic tests. */
function fakeClassifier(text: string | Error): ClassifierClient {
  return {
    classify: vi.fn(async () => {
      if (text instanceof Error) throw text;
      return { text };
    }),
  };
}

describe("normalizeAgentKey (TASK-3 vocab → canonical AgentKey)", () => {
  it("maps supervisor snake_case to frozen keys", () => {
    expect(normalizeAgentKey("plant_doctor")).toBe("plantdoctor");
    expect(normalizeAgentKey("farm_planner")).toBe("farmplanner");
    expect(normalizeAgentKey("researcher")).toBe("research");
    expect(normalizeAgentKey("agronomist")).toBe("agronomist");
  });
  it("tolerates casing/spacing/hyphens and canonical spellings", () => {
    expect(normalizeAgentKey("Plant-Doctor")).toBe("plantdoctor");
    expect(normalizeAgentKey(" FARM PLANNER ")).toBe("farmplanner");
    expect(normalizeAgentKey("research")).toBe("research");
  });
  it("returns null for junk", () => {
    expect(normalizeAgentKey("weatherman")).toBeNull();
    expect(normalizeAgentKey("")).toBeNull();
    expect(normalizeAgentKey(undefined)).toBeNull();
  });
});

describe("extractJsonObject", () => {
  it("parses clean JSON", () => {
    expect(extractJsonObject('{"agent":"agronomist","reason":"x"}')).toEqual({
      agent: "agronomist",
      reason: "x",
    });
  });
  it("parses JSON inside code fences and prose", () => {
    const t = 'Here you go:\n```json\n{"agent":"researcher","reason":"market"}\n```\nThanks!';
    expect(extractJsonObject(t)).toEqual({ agent: "researcher", reason: "market" });
  });
  it("handles braces inside string values", () => {
    expect(extractJsonObject('{"agent":"farm_planner","reason":"budget {20m}"}')).toEqual({
      agent: "farm_planner",
      reason: "budget {20m}",
    });
  });
  it("returns null when no JSON present", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("routeDeterministic (AGENTS §13)", () => {
  it("routes diagnosis to plantdoctor", () => {
    expect(routeDeterministic("Chili leaves are curling with brown spots", "en").agent).toBe("plantdoctor");
  });
  it("routes economics to farmplanner", () => {
    expect(routeDeterministic("What should I plant with a 20 million budget?", "en").agent).toBe("farmplanner");
  });
  it("routes market to research", () => {
    expect(routeDeterministic("Market outlook for chili prices", "en").agent).toBe("research");
  });
  it("routes cultivation to agronomist", () => {
    expect(routeDeterministic("Best fertilizer for rice and irrigation?", "en").agent).toBe("agronomist");
  });
  it("defaults to agronomist on no signal", () => {
    const r = routeDeterministic("hello there", "en");
    expect(r.agent).toBe("agronomist");
    expect(r.reason).toBe("default:no-signal");
  });
  it("works in Bahasa Indonesia", () => {
    expect(routeDeterministic("Daun cabai keriting dan ada bercak", "id").agent).toBe("plantdoctor");
    expect(routeDeterministic("Harga pasar cabai bagaimana?", "id").agent).toBe("research");
  });
});

describe("runSupervisor (LLM seam)", () => {
  it("maps a valid classification to a canonical decision", async () => {
    const client = fakeClassifier('{"agent":"plant_doctor","reason":"symptom diagnosis"}');
    const d = await runSupervisor(client, "leaves yellowing", "en");
    expect(d?.agent).toBe("plantdoctor");
    expect(d?.source).toBe("supervisor");
    expect(d?.reason).toMatch(/diagnosis/);
  });
  it("returns null (caller falls back) on unmappable agent", async () => {
    const client = fakeClassifier('{"agent":"weatherman","reason":"?"}');
    expect(await runSupervisor(client, "x", "en")).toBeNull();
  });
  it("returns null on classifier error (never throws)", async () => {
    const client = fakeClassifier(new Error("network"));
    expect(await runSupervisor(client, "x", "en")).toBeNull();
  });
  it("returns null on non-JSON output", async () => {
    const client = fakeClassifier("I think you should ask the plant doctor.");
    expect(await runSupervisor(client, "x", "en")).toBeNull();
  });
});

describe("RoutingService (orchestration + fallback)", () => {
  it("prompt-card origin wins without calling the LLM", async () => {
    const client = fakeClassifier(new Error("should not be called"));
    const svc = createRoutingService({ classifier: client, logger: { routed() {} } });
    const r = await svc.route({ text: "anything", lang: "en", promptKey: "diagnose" });
    expect(r.agent).toBe("plantdoctor");
    expect(r.source).toBe("prompt_card");
    expect(client.classify).not.toHaveBeenCalled();
  });

  it("confident deterministic prefilter skips the LLM", async () => {
    const client = fakeClassifier(new Error("should not be called"));
    const svc = createRoutingService({ classifier: client, logger: { routed() {} } });
    const r = await svc.route({ text: "Market price outlook and demand for chili", lang: "en" });
    expect(r.agent).toBe("research");
    expect(r.source).toBe("deterministic");
    expect(client.classify).not.toHaveBeenCalled();
  });

  it("uses the LLM supervisor for ambiguous input", async () => {
    const client = fakeClassifier('{"agent":"farm_planner","reason":"profitability question"}');
    const svc = createRoutingService({ classifier: client, logger: { routed() {} } });
    const r = await svc.route({ text: "Is it worth it for me this year?", lang: "en" });
    expect(r.agent).toBe("farmplanner");
    expect(r.source).toBe("supervisor");
    expect(client.classify).toHaveBeenCalledOnce();
  });

  it("falls back to deterministic when the LLM fails", async () => {
    const client = fakeClassifier(new Error("api down"));
    const svc = createRoutingService({ classifier: client, logger: { routed() {} } });
    // text has a weak agronomy signal -> deterministic fallback, not the last-resort agent
    const r = await svc.route({ text: "some advice about soil please", lang: "en" });
    expect(r.agent).toBe("agronomist");
    expect(r.source).toBe("deterministic");
  });

  it("uses the last-resort fallback agent (research) and never throws on total failure", async () => {
    const client = fakeClassifier(new Error("api down"));
    const svc = createRoutingService({ classifier: client, logger: { routed() {} } });
    const r = await svc.route({ text: "??? ...", lang: "en" });
    expect(r.agent).toBe("research"); // TASK 3 §Error Handling fallback
    expect(r.source).toBe("fallback");
  });

  it("always returns a specialist prompt to inject", async () => {
    const client = fakeClassifier('{"agent":"agronomist","reason":"cultivation"}');
    const svc = createRoutingService({ classifier: client, logger: { routed() {} } });
    const r = await svc.route({ text: "How do I grow chili?", lang: "en" });
    expect(r.specialistPrompt).toContain("Agronomist Agent");
    expect(r.specialistPrompt).toBe(getSpecialistPrompt(r.agent, "en"));
    expect(r.promptVersion).toMatch(/persona@v1/);
  });

  it("logs the selected agent and reason (analytics)", async () => {
    const routed = vi.fn();
    const client = fakeClassifier('{"agent":"plant_doctor","reason":"disease"}');
    const svc = createRoutingService({ classifier: client, logger: { routed } });
    await svc.route({ text: "brown spots on rice", lang: "en", promptKey: undefined });
    expect(routed).toHaveBeenCalledOnce();
    const entry = routed.mock.calls[0][0];
    expect(entry.agent).toBeTruthy();
    expect(entry.reason).toBeTruthy();
  });
});
