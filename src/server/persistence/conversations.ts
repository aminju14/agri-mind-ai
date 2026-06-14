/**
 * Conversation repository — user-owned, tenant-scoped (docs/DATABASE.md §13).
 * Every method takes `userId` and runs inside `withTenant` so RLS applies.
 */
import { withTenant } from "./tenant";
import type { ConversationSummary, Lang } from "./types";

const HISTORY_PAGE_SIZE = 50;

/** Create a conversation for the user. Title defaults; derive from first message later. */
export async function createConversation(
  userId: string,
  lang: Lang,
  title?: string,
): Promise<{ id: string; title: string; lang: Lang }> {
  return withTenant(userId, async (tx) => {
    const c = await tx.conversation.create({
      data: { userId, lang, ...(title ? { title } : {}) },
      select: { id: true, title: true, lang: true },
    });
    return c;
  });
}

/**
 * Ensure a conversation exists and belongs to the user. If `conversationId` is given,
 * verify ownership (RLS already guarantees it, but we return null if not visible);
 * otherwise create a new one. Used at lifecycle step 2.
 */
export async function ensureConversation(
  userId: string,
  conversationId: string | undefined,
  lang: Lang,
): Promise<{ id: string; lang: Lang } | null> {
  return withTenant(userId, async (tx) => {
    if (conversationId) {
      const existing = await tx.conversation.findFirst({
        where: { id: conversationId, deletedAt: null },
        select: { id: true, lang: true },
      });
      return existing ?? null; // null => not owned/visible (RLS) or deleted
    }
    const created = await tx.conversation.create({
      data: { userId, lang },
      select: { id: true, lang: true },
    });
    return created;
  });
}

/** Touch updatedAt so the conversation rises to the top of history. */
export async function touchConversation(userId: string, conversationId: string): Promise<void> {
  await withTenant(userId, async (tx) => {
    await tx.conversation.updateMany({
      where: { id: conversationId, deletedAt: null },
      data: { updatedAt: new Date() },
    });
  });
}

/** Set the title (derived from the first user message, <=48 chars — DATABASE §7). */
export async function setTitleIfDefault(
  userId: string,
  conversationId: string,
  derived: string,
): Promise<void> {
  const title = derived.trim().slice(0, 48) || "New Chat";
  await withTenant(userId, async (tx) => {
    await tx.conversation.updateMany({
      where: { id: conversationId, title: "New Chat", deletedAt: null },
      data: { title },
    });
  });
}

/** Paged history list, newest first, excluding soft-deleted (UI §4.1). */
export async function listConversations(
  userId: string,
  opts: { cursor?: string; take?: number } = {},
): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  const take = Math.min(opts.take ?? HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE);
  return withTenant(userId, async (tx) => {
    const rows = await tx.conversation.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: take + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      select: { id: true, title: true, lang: true, updatedAt: true, isPinned: true, isArchived: true },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  });
}

/** Soft delete (reversible within retention — DATABASE §11). */
export async function softDeleteConversation(userId: string, conversationId: string): Promise<boolean> {
  return withTenant(userId, async (tx) => {
    const res = await tx.conversation.updateMany({
      where: { id: conversationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return res.count > 0;
  });
}

/** Toggle pin or archive status for a conversation. */
export async function updateConversationStatus(
  userId: string,
  conversationId: string,
  data: { isPinned?: boolean; isArchived?: boolean },
): Promise<boolean> {
  return withTenant(userId, async (tx) => {
    const res = await tx.conversation.updateMany({
      where: { id: conversationId, deletedAt: null },
      data,
    });
    return res.count > 0;
  });
}
