/**
 * GET /api/conversations/:id/panel — the dynamic Insights Panel data for a conversation.
 *
 * Returns the latest PanelSnapshot (updated after each answer by the insight service,
 * TASK 9) — insight + topics + related knowledge (web links + RAG docs) + learning path.
 * Falls back to the localized seed PANEL when no snapshot exists yet (new/empty chat).
 */
import { getSession } from "@/server/auth/session";
import * as panel from "@/server/persistence/panel";
import { PANEL } from "@/lib/data";
import type { Lang } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauth() {
  return new Response(JSON.stringify({ error: { code: "unauthenticated", message: "sign in required" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return unauth();
  const { id } = await params;

  const url = new URL(req.url);
  const lang: Lang = url.searchParams.get("lang") === "id" ? "id" : "en";

  const snapshot = await panel.getLatestPanelSnapshot(session.userId, id).catch(() => null);
  return Response.json({ panel: snapshot ?? PANEL[lang] });
}
