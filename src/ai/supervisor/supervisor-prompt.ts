/**
 * Supervisor prompt builder (TASK 3 §Intent Classification).
 *
 * The Supervisor's ONLY job is to classify intent and select a specialist. It must
 * NOT answer the user's question. It returns strict JSON: { "agent", "reason" }.
 *
 * Vocabulary is TASK-3's snake_case set (agronomist | plant_doctor | farm_planner |
 * researcher); the routing layer maps it to the canonical AgentKey afterwards.
 */

import type { Lang } from "@/lib/types";
import type { SupervisorAgentName } from "../types";

/** Bump when the prompt changes (records on the turn for bisecting — MASTER §16.2). */
export const SUPERVISOR_PROMPT_VERSION = "supervisor@v1";

interface AgentSpec {
  name: SupervisorAgentName;
  handles: string[];
  examples: string[];
}

/** Specialist catalog exactly as described in TASK 3 §Available Agents. */
const AGENT_CATALOG: AgentSpec[] = [
  {
    name: "agronomist",
    handles: ["Cultivation", "Fertilization", "Irrigation", "Crop management", "Harvesting"],
    examples: ["How do I grow chili?", "Best fertilizer for rice?", "Irrigation strategy for corn?"],
  },
  {
    name: "plant_doctor",
    handles: ["Plant diseases", "Pest attacks", "Nutrient deficiencies", "Environmental stress"],
    examples: ["Chili leaves are curling", "Mango leaves turning yellow", "Brown spots on rice plants"],
  },
  {
    name: "farm_planner",
    handles: ["Planning", "Crop selection", "Cost estimation", "ROI analysis", "Scheduling"],
    examples: ["What should I plant with a 20 million budget?", "Is corn profitable?", "Planting schedule for chili"],
  },
  {
    name: "researcher",
    handles: ["Knowledge retrieval", "Scientific information", "Market trends", "General agricultural research"],
    examples: ["Latest research on rice productivity", "Market outlook for chili", "Agricultural reports"],
  },
];

function renderCatalog(): string {
  return AGENT_CATALOG.map((a) => {
    const handles = a.handles.map((h) => `    - ${h}`).join("\n");
    const examples = a.examples.map((e) => `    - "${e}"`).join("\n");
    return `- ${a.name}\n  Handles:\n${handles}\n  Examples:\n${examples}`;
  }).join("\n\n");
}

/**
 * Build the supervisor system prompt. Deterministic (no interpolation of the user
 * message into the instructions — the user message is sent as the user turn).
 */
export function buildSupervisorSystemPrompt(lang: Lang): string {
  const langName = lang === "id" ? "Bahasa Indonesia" : "English";
  return `You are the AgriMind Supervisor. You route each user message to exactly one
specialist agent. You DO NOT answer the user's agricultural question and you DO NOT
give advice — you only classify intent and select the best specialist.

SPECIALISTS
${renderCatalog()}

DECISION RULES
- Choose the single best specialist for the user's primary intent.
- Diagnosis of a sick/damaged plant (symptoms: spots, curling, yellowing, pests, rot)
  → plant_doctor.
- How-to cultivation, fertilizer, irrigation, crop management, harvesting → agronomist.
- Budget, cost, ROI, profitability, what-to-plant, scheduling/planning → farm_planner.
- Market trends, scientific/research questions, reports, general knowledge → researcher.
- If the message is ambiguous or spans several areas, pick the dominant intent.
- The user writes in ${langName}; classify regardless of language.

OUTPUT FORMAT (STRICT)
Return ONLY a single JSON object and nothing else — no prose, no markdown, no code
fences. The object MUST be exactly:
{"agent":"<one of: agronomist | plant_doctor | farm_planner | researcher>","reason":"<short reason>"}
The "reason" is one short clause (≤ 12 words) explaining the classification.`;
}

/** The user turn passed alongside the system prompt. */
export function buildSupervisorUserPrompt(text: string): string {
  return text;
}
