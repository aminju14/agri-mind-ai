import { describe, it, expect } from "vitest";
import {
  AGENT_REGISTRY,
  getSpecialistPrompt,
  getAgentBadge,
  getAgentDisplay,
  agentRequiresConfidence,
  CANONICAL_AGENTS,
  type AgentKey,
} from "./index";
import { confidenceBand, confidenceLabel } from "./contracts/response-contracts";

describe("TASK 4 — agent badges (§Agent Badge)", () => {
  it("returns supervisor-vocab agent + localized label", () => {
    expect(getAgentBadge("plantdoctor", "en")).toEqual({
      agent: "plant_doctor",
      agentLabel: "Plant Doctor Agent",
    });
    expect(getAgentBadge("plantdoctor", "id")).toEqual({
      agent: "plant_doctor",
      agentLabel: "Agen Dokter Tanaman",
    });
    expect(getAgentBadge("research", "en").agent).toBe("researcher");
    expect(getAgentBadge("farmplanner", "en").agent).toBe("farm_planner");
    expect(getAgentBadge("agronomist", "en").agent).toBe("agronomist");
  });

  it("badge label matches getAgentDisplay (frozen UI names)", () => {
    for (const k of CANONICAL_AGENTS) {
      expect(getAgentBadge(k, "en").agentLabel).toBe(getAgentDisplay(k, "en"));
      expect(getAgentBadge(k, "id").agentLabel).toBe(getAgentDisplay(k, "id"));
    }
  });
});

describe("TASK 4 — every agent feels like a different expert", () => {
  const prompts = (lang: "en" | "id") =>
    Object.fromEntries(CANONICAL_AGENTS.map((k) => [k, getSpecialistPrompt(k, lang)])) as Record<
      AgentKey,
      string
    >;

  it("each persona carries its distinct identity", () => {
    const p = prompts("en");
    expect(p.agronomist).toMatch(/Senior Agronomist/);
    expect(p.agronomist).toMatch(/20 years/);
    expect(p.plantdoctor).toMatch(/Plant Pathology Specialist/);
    expect(p.farmplanner).toMatch(/Planning Consultant/);
    expect(p.research).toMatch(/Research Specialist/);
  });

  it("each persona embeds its thinking framework", () => {
    const p = prompts("en");
    expect(p.agronomist).toMatch(/Identify the crop type/);
    expect(p.plantdoctor).toMatch(/Evaluate Disease/);
    expect(p.farmplanner).toMatch(/Estimate ROI/);
    expect(p.research).toMatch(/priority order/i);
  });

  it("each persona embeds its TASK-4 output structure", () => {
    const p = prompts("en");
    expect(p.agronomist).toMatch(/Assessment → Recommendations → Risks → Next Steps/);
    expect(p.plantdoctor).toMatch(/Most Likely Cause/);
    expect(p.plantdoctor).toMatch(/Alternative Causes/);
    expect(p.farmplanner).toMatch(/Cost Considerations/);
    expect(p.research).toMatch(/Key Findings/);
  });

  it("the four prompts are materially different from each other", () => {
    const p = prompts("en");
    const set = new Set(Object.values(p));
    expect(set.size).toBe(4);
  });
});

describe("TASK 4 — frozen output format pinned in every prompt", () => {
  it("instructs H/P/U/I and forbids markdown (UI frozen)", () => {
    for (const k of CANONICAL_AGENTS) {
      const prompt = getSpecialistPrompt(k, "en");
      expect(prompt).toMatch(/H: heading/);
      expect(prompt).toMatch(/U: action item/);
      expect(prompt).toMatch(/I: insight/);
      expect(prompt).toMatch(/No markdown/i);
    }
  });

  it("includes the shared rules (§Shared Rules)", () => {
    const prompt = getSpecialistPrompt("agronomist", "en");
    expect(prompt).toMatch(/State your assumptions/);
    expect(prompt).toMatch(/State the risks/);
    expect(prompt).toMatch(/Explain your reasoning/);
  });

  it("includes the pesticide safety rule for every agent", () => {
    for (const k of CANONICAL_AGENTS) {
      expect(getSpecialistPrompt(k, "en")).toMatch(/class-level guidance only/);
    }
  });
});

describe("TASK 4 — confidence framework (Plant Doctor)", () => {
  it("only Plant Doctor requires a confidence level", () => {
    expect(agentRequiresConfidence("plantdoctor")).toBe(true);
    expect(agentRequiresConfidence("agronomist")).toBe(false);
    expect(agentRequiresConfidence("farmplanner")).toBe(false);
    expect(agentRequiresConfidence("research")).toBe(false);
  });

  it("Plant Doctor prompt instructs a 0–100 confidence in the paragraphs", () => {
    const prompt = getSpecialistPrompt("plantdoctor", "en");
    expect(prompt).toMatch(/confidence level/i);
    expect(prompt).toMatch(/0–100/);
  });

  it("maps scores to the TASK-4 bands", () => {
    expect(confidenceBand(95)).toBe("strong");
    expect(confidenceBand(80)).toBe("likely");
    expect(confidenceBand(60)).toBe("possible");
    expect(confidenceBand(40)).toBe("insufficient");
  });

  it("localizes band labels", () => {
    expect(confidenceLabel("likely", "en")).toBe("Likely");
    expect(confidenceLabel("likely", "id")).toBe("Kemungkinan besar");
  });
});

describe("TASK 4 — bilingual output (MASTER §1.2)", () => {
  it("each prompt pins the active language", () => {
    for (const k of CANONICAL_AGENTS) {
      expect(getSpecialistPrompt(k, "en")).toMatch(/ONLY in English/);
      expect(getSpecialistPrompt(k, "id")).toMatch(/ONLY in Bahasa Indonesia/);
    }
  });
});

describe("TASK 4 — registry integrity", () => {
  it("covers exactly the four canonical agents", () => {
    expect(Object.keys(AGENT_REGISTRY).sort()).toEqual(
      [...CANONICAL_AGENTS].sort(),
    );
  });
  it("each registry entry's key matches its persona key", () => {
    for (const k of CANONICAL_AGENTS) {
      expect(AGENT_REGISTRY[k].key).toBe(k);
      expect(AGENT_REGISTRY[k].persona.key).toBe(k);
    }
  });
});
