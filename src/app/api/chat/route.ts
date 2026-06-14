/**
 * POST /api/chat — streaming chat endpoint (Phase 2 Chat Engine).
 *
 * Frozen contracts: request/response envelope (MASTER §3.7) + SSE protocol (MASTER §3.6).
 * Node runtime (Prisma + streaming SDKs need Node, not Edge — ARCHITECTURE §2).
 *
 * Step 0 (GATE) runs here before the stream opens, so auth/validation failures are clean
 * HTTP status codes, not mid-stream errors. The orchestrator owns steps 2–16.
 */

import { createId } from "@/server/persistence/id";
import { getSession } from "@/server/auth/session";
import { Orchestrator } from "@/server/orchestrator/orchestrator";
import { createSseStream } from "@/server/orchestrator/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 4000;

interface ChatBody {
  conversationId?: string;
  text?: unknown;
  lang?: unknown;
  promptKey?: string;
}

function errJson(code: string, message: string, status: number, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: { code, message, ...extra } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Single orchestrator instance per server (stateless per request).
const orchestrator = new Orchestrator();

export async function POST(req: Request): Promise<Response> {
  const traceId = createId();

  // step 0 — gate: auth
  const session = await getSession();
  if (!session) return errJson("unauthenticated", "sign in required", 401);

  // step 0 — validate body
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return errJson("bad_request", "invalid JSON body", 400);
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const lang = body.lang === "id" ? "id" : body.lang === "en" ? "en" : null;

  if (!text) return errJson("bad_request", "text is required", 400, { fields: ["text"] });
  if (!lang) return errJson("bad_request", "lang must be 'en' or 'id'", 400, { fields: ["lang"] });
  if (text.length > MAX_TEXT) return errJson("payload_too_large", "message too long", 413);

  // Per-turn AbortController; client disconnect (req.signal) aborts generation.
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort(), { once: true });

  const stream = createSseStream(async (emit) => {
    await orchestrator.runTurn(
      {
        userId: session.userId,
        conversationId: body.conversationId,
        text,
        lang,
        promptKey: body.promptKey,
        traceId,
      },
      emit,
      ac.signal,
    );
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-trace-id": traceId,
    },
  });
}
