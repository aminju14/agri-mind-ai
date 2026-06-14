/**
 * TASK 9 — Insight repository.
 *
 * Persists generated insights (0–2 per assistant message) and reads them back for auditing.
 * Tenant-scoped via withTenant + RLS, consistent with the rest of the data layer.
 */

import type { Prisma } from "@prisma/client";
import { withTenant } from "@/server/persistence/tenant";
import type { CreateInsightInput, Insight } from "./insight-types";

/** Persist a turn's insights (replaces any existing for that message — idempotent re-runs). */
export async function saveInsights(userId: string, rows: CreateInsightInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const messageId = rows[0].messageId;
  return withTenant(userId, async (tx) => {
    // Idempotent: clear prior insights for this message, then insert the new set.
    await tx.insight.deleteMany({ where: { messageId } });
    await tx.insight.createMany({
      data: rows.map((r) => ({
        conversationId: r.conversationId,
        messageId: r.messageId,
        title: r.title,
        content: r.content,
        category: r.category as Prisma.InsightCreateManyInput["category"],
        confidence: r.confidence,
        ordinal: r.ordinal,
      })),
    });
    return rows.length;
  });
}

/** Read the insights stored for an assistant message (auditing / lossless reload). */
export async function getInsightsForMessage(userId: string, messageId: string): Promise<Insight[]> {
  return withTenant(userId, async (tx) => {
    const rows = await tx.insight.findMany({
      where: { messageId },
      orderBy: { ordinal: "asc" },
      select: { title: true, content: true, category: true, confidence: true },
    });
    return rows.map((r) => ({
      title: r.title,
      content: r.content,
      category: r.category,
      confidence: r.confidence,
    }));
  });
}

/** Count insights on a conversation (analytics). */
export async function countInsightsForConversation(userId: string, conversationId: string): Promise<number> {
  return withTenant(userId, async (tx) => tx.insight.count({ where: { conversationId } }));
}
