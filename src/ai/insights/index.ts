/**
 * TASK 9 — Proactive Insight Generator barrel.
 *
 *   import { createInsightService } from "@/ai/insights";
 *
 * Makes AgriMind proactive: 1–2 categorized, personalized insights per answer, surfaced in
 * the existing Insights Panel. Integrates Memory + RAG + Web. Scope: insights only.
 */
export {
  InsightService,
  createInsightService,
  type InsightServiceDeps,
  type GeneratedInsights,
} from "./insight-service";
export { generateRawInsights, extractJsonArray, INSIGHT_PROMPT_VERSION } from "./insight-generator";
export {
  buildInsights,
  applyInsightsToPanel,
  categoryLabel,
} from "./insight-builder";
export { resolveCategory, orderByAgentPreference, isInsightCategory } from "./insight-classifier";
export {
  saveInsights,
  getInsightsForMessage,
  countInsightsForConversation,
} from "./insight-repository";
export {
  INSIGHT_CATEGORIES,
  INSIGHT_LENGTH,
  MAX_INSIGHTS,
  INSIGHT_MIN_CONFIDENCE,
  AGENT_INSIGHT_PREFERENCES,
  type Insight,
  type InsightCategory,
  type InsightGenerationInput,
  type RawInsight,
  type CreateInsightInput,
} from "./insight-types";
