/**
 * TASK 5 — Memory repository.
 *
 * User-owned, tenant-scoped via withTenant + RLS (docs/DATABASE.md §13), consistent with
 * the other repositories. Owns: dedup-aware upsert, active-memory retrieval, and enforcing
 * the 20-active limit by archiving the oldest.
 */

import { withTenant } from "@/server/persistence/tenant";
import {
  MAX_ACTIVE_MEMORIES,
  type ActiveMemory,
  type MemoryCategory,
  type UpsertMemoryInput,
} from "./memory.types";

/**
 * Insert or update a memory. If a memory with the same (category, value) already exists
 * for the user, UPDATE it (raise confidence toward the new signal, refresh lastSeenAt,
 * un-archive if it was archived) — never create a duplicate (TASK 5 §Memory Update).
 *
 * Confidence update rule: keep the max of the existing and new confidence (a repeated,
 * reinforced interest should not lose confidence), and always bump recency.
 */
export async function upsertMemory(userId: string, input: UpsertMemoryInput): Promise<void> {
  await withTenant(userId, async (tx) => {
    const existing = await tx.memoryEntry.findUnique({
      where: { userId_category_value: { userId, category: input.category, value: input.value } },
      select: { id: true, confidence: true },
    });
    if (existing) {
      await tx.memoryEntry.update({
        where: { id: existing.id },
        data: {
          confidence: Math.max(existing.confidence, input.confidence),
          lastSeenAt: new Date(),
          isArchived: false,
        },
      });
    } else {
      await tx.memoryEntry.create({
        data: {
          userId,
          category: input.category,
          value: input.value,
          confidence: input.confidence,
        },
      });
    }
  });
}

/**
 * Enforce the active-memory cap: if more than MAX_ACTIVE_MEMORIES are active, archive the
 * oldest-reinforced ones (lowest lastSeenAt) so only the most-recent 20 stay active
 * (TASK 5 §Memory Limits).
 */
export async function enforceActiveLimit(userId: string): Promise<number> {
  return withTenant(userId, async (tx) => {
    const active = await tx.memoryEntry.findMany({
      where: { isArchived: false },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });
    if (active.length <= MAX_ACTIVE_MEMORIES) return 0;
    const toArchive = active.slice(MAX_ACTIVE_MEMORIES).map((m) => m.id);
    await tx.memoryEntry.updateMany({
      where: { id: { in: toArchive } },
      data: { isArchived: true },
    });
    return toArchive.length;
  });
}

/** Load the user's active memories, newest-reinforced first (for injection/retrieval). */
export async function listActiveMemories(userId: string): Promise<ActiveMemory[]> {
  return withTenant(userId, async (tx) => {
    const rows = await tx.memoryEntry.findMany({
      where: { isArchived: false },
      orderBy: { lastSeenAt: "desc" },
      take: MAX_ACTIVE_MEMORIES,
      select: { category: true, value: true, confidence: true },
    });
    return rows;
  });
}

/** Group active memories by category (for the injector). */
export async function activeMemoriesByCategory(
  userId: string,
): Promise<Record<MemoryCategory, string[]>> {
  const rows = await listActiveMemories(userId);
  const out: Record<MemoryCategory, string[]> = {
    crop_interest: [],
    learning_interest: [],
    goal: [],
    challenge: [],
  };
  for (const r of rows) out[r.category].push(r.value);
  return out;
}
