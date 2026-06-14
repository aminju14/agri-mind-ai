/**
 * TASK 5 — Conversation memory types.
 *
 * Memory is selective, useful, and concise: only facts that improve FUTURE agricultural
 * conversations are stored (crop interests, learning interests, goals, challenges).
 */

import type { MemoryCategory as PMemoryCategory, MemoryEntry as PMemoryEntry } from "@prisma/client";

export type { PMemoryCategory as MemoryCategory, PMemoryEntry as MemoryEntryRow };

/** The four allowed categories (TASK 5 §Memory Categories). */
export const MEMORY_CATEGORIES = [
  "crop_interest",
  "learning_interest",
  "goal",
  "challenge",
] as const;

/** Confidence gate: only store memories above this (TASK 5 §Memory Rules). */
export const MEMORY_CONFIDENCE_THRESHOLD = 0.8;

/** Max active (non-archived) memories per user (TASK 5 §Memory Limits). */
export const MAX_ACTIVE_MEMORIES = 20;

/** A single extracted-memory candidate (the LLM extractor output, TASK 5 §Memory Extraction). */
export interface ExtractedMemory {
  /** category, named `memoryType` to match the TASK-5 JSON contract. */
  memoryType: PMemoryCategory;
  /** Normalized value, e.g. "chili", "disease diagnosis". */
  value: string;
  /** 0..1 confidence. */
  confidence: number;
}

/** Input to persist/update a memory (after the confidence gate). */
export interface UpsertMemoryInput {
  category: PMemoryCategory;
  value: string;
  confidence: number;
}

/** A retrieved active memory (subset used for injection/retrieval). */
export interface ActiveMemory {
  category: PMemoryCategory;
  value: string;
  confidence: number;
}

/** The inputs to the extraction step (TASK 5 §Memory Extraction). */
export interface ExtractionContext {
  /** Prior turns as compact text (most recent last). May be empty. */
  history: string;
  userMessage: string;
  assistantResponse: string;
  lang: "en" | "id";
}
