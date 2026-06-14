/**
 * GET  /api/conversations — paged history list (sidebar).
 * POST /api/conversations — create a conversation.
 * Tenant-scoped via the session userId (MASTER §3.7).
 */
import { getSession } from "@/server/auth/session";
import * as conversations from "@/server/persistence/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauth() {
  return new Response(JSON.stringify({ error: { code: "unauthenticated", message: "sign in required" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return unauth();

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const { items, nextCursor } = await conversations.listConversations(session.userId, { cursor });

  return Response.json({
    conversations: items.map((c) => ({
      id: c.id,
      title: c.title,
      lang: c.lang,
      updatedAt: c.updatedAt.toISOString(),
      isPinned: c.isPinned,
      isArchived: c.isArchived,
    })),
    nextCursor,
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return unauth();

  let lang: "en" | "id" = "en";
  try {
    const body = (await req.json()) as { lang?: unknown };
    if (body.lang === "id") lang = "id";
  } catch {
    /* default lang */
  }

  const c = await conversations.createConversation(session.userId, lang);
  return Response.json({ conversation: { id: c.id, title: c.title, lang: c.lang } }, { status: 201 });
}
