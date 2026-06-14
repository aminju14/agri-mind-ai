/**
 * Panel snapshot + learning-path repository (right Insight Panel — UI §4.5, AGENTS §10).
 * PanelSnapshot is conversation-scoped (tenant-scoped via RLS); LearningPath is per-user.
 */
import type { Prisma } from "@prisma/client";
import { withTenant } from "./tenant";
import type { Lang, PanelSnapshotData } from "./types";

/** Persist a recomputed panel snapshot (lifecycle step 17, async/best-effort). */
export async function savePanelSnapshot(
  userId: string,
  conversationId: string,
  lang: Lang,
  data: PanelSnapshotData,
): Promise<void> {
  await withTenant(userId, async (tx) => {
    await tx.panelSnapshot.create({
      data: {
        conversationId,
        lang,
        data: data as unknown as Prisma.InputJsonValue,
      },
    });
  });
}

/** Latest panel snapshot for a conversation, or null (caller falls back to seed). */
export async function getLatestPanelSnapshot(
  userId: string,
  conversationId: string,
): Promise<PanelSnapshotData | null> {
  return withTenant(userId, async (tx) => {
    const row = await tx.panelSnapshot.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      select: { data: true },
    });
    return (row?.data ?? null) as PanelSnapshotData | null;
  });
}

/** A user's learning-path rows for the panel, in display order. */
export async function getLearningPaths(
  userId: string,
): Promise<Array<{ name: string; pct: number }>> {
  return withTenant(userId, async (tx) => {
    const rows = await tx.learningPath.findMany({
      where: { userId },
      orderBy: { ordinal: "asc" },
      select: { name: true, pct: true },
    });
    return rows;
  });
}

/** Upsert a learning-path progress row (idempotent by user+name — DATABASE §9.2). */
export async function upsertLearningPath(
  userId: string,
  name: string,
  pct: number,
  ordinal: number,
): Promise<void> {
  await withTenant(userId, async (tx) => {
    await tx.learningPath.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name, pct, ordinal },
      update: { pct, ordinal },
    });
  });
}
