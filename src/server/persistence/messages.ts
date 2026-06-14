/**
 * Message repository — persists the user turn and the lossless AI answer payload
 * (blocks + insight + citations), and reads a thread back into the frozen render shape.
 * User-owned, tenant-scoped via RLS (docs/DATABASE.md §13, §2 "Lossless answers").
 *
 * Insights are stored on `Message.insight` (Frozen MASTER §3.4); citations are a child
 * relation written atomically with the AI message.
 */
import type { Prisma } from "@prisma/client";
import { withTenant, type Tx } from "./tenant";
import type {
  AiMessagePayload,
  CreateAiMessageInput,
  CreateUserMessageInput,
  MessageBlocks,
  RouterScores,
  ThreadMessage,
} from "./types";
import type { Citation as UICitation } from "@/lib/types";

/** Persist the user message (lifecycle step 2). */
export async function insertUserMessage(
  userId: string,
  input: CreateUserMessageInput,
): Promise<{ id: string }> {
  return withTenant(userId, async (tx) => {
    const m = await tx.message.create({
      data: {
        conversationId: input.conversationId,
        role: "user",
        lang: input.lang,
        text: input.text,
      },
      select: { id: true },
    });
    return m;
  });
}

/**
 * Persist the AI message + its citations atomically (lifecycle step 15).
 * Provenance on every citation is enforced here (MASTER §4.1): a citation with neither
 * `chunkId` nor `webUrl` is rejected before the write.
 */
export async function insertAiMessage(
  userId: string,
  input: CreateAiMessageInput,
): Promise<{ id: string }> {
  for (const c of input.citations) {
    if (!c.chunkId && !c.webUrl) {
      throw new Error(
        `insertAiMessage: citation #${c.ordinal} has no provenance (chunkId|webUrl) — MASTER §4.1`,
      );
    }
  }
  return withTenant(userId, async (tx: Tx) => {
    const m = await tx.message.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        conversationId: input.conversationId,
        role: "ai",
        lang: input.lang,
        agentKey: input.agentKey,
        blocks: input.blocks as unknown as Prisma.InputJsonValue,
        insight: input.insight,
        routerReason: input.routerReason,
        routerScores: (input.routerScores ?? undefined) as unknown as Prisma.InputJsonValue,
        usedRag: input.usedRag,
        usedWeb: input.usedWeb,
        promptVersion: input.promptVersion,
        modelId: input.modelId,
        blockRepairs: input.blockRepairs,
        aborted: input.aborted ?? false,
        citations: {
          create: input.citations.map((c) => ({
            ordinal: c.ordinal,
            title: c.title,
            category: c.category,
            source: c.source,
            url: c.url ?? null,
            chunkId: c.chunkId ?? null,
            webUrl: c.webUrl ?? null,
            documentId: c.documentId ?? null,
            similarityScore: c.similarityScore ?? null,
          })),
        },
      },
      select: { id: true },
    });
    return m;
  });
}

/**
 * Mark an AI message as backfill-needed (write failed post-stream) or as aborted.
 * Used by the async retry path (ARCHITECTURE §15.1, MASTER §7).
 */
export async function markMessageSync(
  userId: string,
  messageId: string,
  state: "synced" | "unsynced",
): Promise<void> {
  await withTenant(userId, async (tx) => {
    await tx.message.updateMany({
      where: { id: messageId },
      data: { syncState: state },
    });
  });
}

/**
 * Load a full thread decoded into the frozen render shape (lossless reload — UI §6).
 * AI messages return their `blocks`/`insight`/`citations` exactly as stored.
 */
export async function getThread(
  userId: string,
  conversationId: string,
): Promise<ThreadMessage[]> {
  return withTenant(userId, async (tx) => {
    const rows = await tx.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      include: { citations: { orderBy: { ordinal: "asc" } } },
    });

    return rows.map<ThreadMessage>((m) => {
      if (m.role === "user") {
        return {
          id: m.id,
          role: "user",
          lang: m.lang,
          text: m.text ?? "",
          createdAt: m.createdAt,
        };
      }
      const citations: UICitation[] = m.citations.map((c) => {
        // Web citations link via webUrl; KB via url. Lossless reload of the clickable link.
        const url = c.webUrl ?? c.url ?? undefined;
        return {
          title: c.title,
          category: c.category,
          source: c.source,
          ...(url ? { url } : {}),
        };
      });
      const payload: AiMessagePayload = {
        id: m.id,
        role: "ai",
        agentKey: m.agentKey!,
        lang: m.lang,
        blocks: (m.blocks ?? []) as unknown as MessageBlocks,
        insight: m.insight,
        citations,
        createdAt: m.createdAt,
      };
      return payload;
    });
  });
}

export type { RouterScores };
