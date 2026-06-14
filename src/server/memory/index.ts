/**
 * TASK 5 — Conversation memory layer barrel.
 *
 *   import { createMemoryService } from "@/server/memory";
 *
 * Selective long-term memory that personalizes future agricultural conversations without
 * a Farm Profile. Scope: memory only — no Farm Profile / RAG / search / citations / insights.
 */
export { MemoryService, createMemoryService, type MemoryServiceDeps } from "./memory.service";
export { extractMemories, extractJsonArray, MEMORY_EXTRACTOR_VERSION } from "./memory-extractor";
export { buildMemoryBlock, injectMemory } from "./memory-injector";
export {
  upsertMemory,
  enforceActiveLimit,
  listActiveMemories,
  activeMemoriesByCategory,
} from "./memory.repository";
export {
  MEMORY_CATEGORIES,
  MEMORY_CONFIDENCE_THRESHOLD,
  MAX_ACTIVE_MEMORIES,
  type MemoryCategory,
  type ExtractedMemory,
  type ExtractionContext,
  type ActiveMemory,
  type UpsertMemoryInput,
} from "./memory.types";
