/**
 * TASK 5 — Memory injector.
 *
 * Turns the user's active memories into a compact "Known User Context" block that is
 * PREPENDED to the specialist system prompt (TASK 5 §Memory Injection: appended to the
 * system prompt, before the specialist agent prompt). Localized to the active language.
 *
 * Pure & deterministic — no I/O. Returns "" when there is nothing to inject.
 */

import type { Lang } from "@/lib/types";
import type { MemoryCategory } from "./memory.types";

const HEADINGS: Record<Lang, { title: string } & Record<MemoryCategory, string>> = {
  en: {
    title: "KNOWN USER CONTEXT (from previous conversations — use it to personalize, do not repeat it back verbatim)",
    crop_interest: "Interested Crops",
    learning_interest: "Learning Interests",
    goal: "Goals",
    challenge: "Challenges",
  },
  id: {
    title: "KONTEKS PENGGUNA YANG DIKETAHUI (dari percakapan sebelumnya — gunakan untuk personalisasi, jangan diulang mentah)",
    crop_interest: "Tanaman yang Diminati",
    learning_interest: "Minat Belajar",
    goal: "Tujuan",
    challenge: "Tantangan",
  },
};

const CATEGORY_ORDER: MemoryCategory[] = ["crop_interest", "learning_interest", "goal", "challenge"];

/** Title-case a normalized value for display (e.g. "disease diagnosis" → "Disease Diagnosis"). */
function pretty(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build the "Known User Context" block from grouped memories. Returns "" if all groups
 * are empty (no context to inject).
 */
export function buildMemoryBlock(
  byCategory: Record<MemoryCategory, string[]>,
  lang: Lang,
): string {
  const h = HEADINGS[lang];
  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const values = byCategory[cat];
    if (!values || values.length === 0) continue;
    const items = values.map((v) => `- ${pretty(v)}`).join("\n");
    sections.push(`${h[cat]}:\n${items}`);
  }
  if (sections.length === 0) return "";
  return `${h.title}\n\n${sections.join("\n\n")}`;
}

/**
 * Prepend the memory block to the specialist prompt (TASK 5 §Memory Injection).
 * If there is no memory, returns the specialist prompt unchanged.
 */
export function injectMemory(specialistPrompt: string, memoryBlock: string): string {
  if (!memoryBlock) return specialistPrompt;
  return `${memoryBlock}\n\n---\n\n${specialistPrompt}`;
}
