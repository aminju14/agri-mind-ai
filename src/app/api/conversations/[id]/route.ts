/**
 * GET    /api/conversations/:id — lossless thread render payload (UI §6).
 * DELETE /api/conversations/:id — soft delete (DATABASE §11).
 */
import { getSession } from "@/server/auth/session";
import * as conversations from "@/server/persistence/conversations";
import * as messages from "@/server/persistence/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauth() {
  return new Response(JSON.stringify({ error: { code: "unauthenticated", message: "sign in required" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return unauth();
  const { id } = await params;

  const thread = await messages.getThread(session.userId, id);
  // getThread returns [] for a non-owned/empty conversation; RLS guarantees isolation.
  return Response.json({
    messages: thread.map((m) =>
      m.role === "user"
        ? { id: m.id, role: "user", lang: m.lang, text: m.text, createdAt: m.createdAt.toISOString() }
        : {
            id: m.id,
            role: "ai",
            lang: m.lang,
            agentKey: m.agentKey,
            blocks: m.blocks,
            insight: m.insight,
            citations: m.citations,
            createdAt: m.createdAt.toISOString(),
          },
    ),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return unauth();
  const { id } = await params;

  const ok = await conversations.softDeleteConversation(session.userId, id);
  if (!ok) {
    return new Response(JSON.stringify({ error: { code: "forbidden", message: "not found" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return Response.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return unauth();
  const { id } = await params;
  const body = await req.json();

  const data: { isPinned?: boolean; isArchived?: boolean } = {};
  if (typeof body.isPinned === "boolean") data.isPinned = body.isPinned;
  if (typeof body.isArchived === "boolean") data.isArchived = body.isArchived;

  const ok = await conversations.updateConversationStatus(session.userId, id, data);
  if (!ok) {
    return new Response(JSON.stringify({ error: { code: "forbidden", message: "not found" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return Response.json({ ok: true });
}
