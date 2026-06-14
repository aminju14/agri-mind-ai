/**
 * SSE encoder for the chat stream (frozen protocol — MASTER §3.6).
 *
 * Event set + ordering invariant:
 *   meta (exactly one, first) then block / blockEnd (>=1) then citations? then insight?
 *   then exactly one terminal done | error
 *
 * Framing: `event: <name>\n` then one `data: <minified-json>\n\n`. A `: ping` comment is
 * sent every 15s of silence so proxies keep the stream open.
 */

import type { Citation } from "@/lib/types";
import type { AgentKey } from "@/ai/types";

export interface MetaPayload {
  messageId: string;
  agentKey: AgentKey;
  /** Localized badge label for the selected agent (TASK 4 §Agent Badge). Additive. */
  agentLabel: string;
  lang: "en" | "id";
  conversationId: string;
}
export interface BlockPayload {
  index: number;
  type?: "h" | "p" | "ul";
  textDelta?: string;
  item?: string;
}
export interface DonePayload {
  messageId: string;
  usage?: { inputTokens: number; outputTokens: number };
  traceId: string;
}
export interface ErrorPayload {
  code: string;
  retryable: boolean;
  message: string;
  traceId?: string;
}

const HEARTBEAT_MS = 15_000;

export interface SseEmitter {
  meta(p: MetaPayload): void;
  blockStart(index: number, type: "h" | "p" | "ul"): void;
  blockDelta(index: number, textDelta: string): void;
  blockItem(index: number, item: string): void;
  blockEnd(index: number): void;
  citations(items: Citation[]): void;
  insight(insight: string): void;
  done(p: DonePayload): void;
  error(p: ErrorPayload): void;
}

/**
 * Build an SSE ReadableStream and an emitter to drive it. `run(emit)` is invoked with the
 * emitter; when it resolves/rejects the stream is closed. Closing is idempotent and a
 * terminal `done`/`error` is guaranteed exactly once.
 */
export function createSseStream(
  run: (emit: SseEmitter) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  let terminal = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* controller already closed */
        }
      };
      const send = (event: string, data: unknown) => {
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const ping = () => write(`: ping\n\n`);

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      heartbeat = setInterval(ping, HEARTBEAT_MS);

      const emit: SseEmitter = {
        meta: (p) => send("meta", p),
        blockStart: (index, type) => send("block", { index, type } satisfies BlockPayload),
        blockDelta: (index, textDelta) => send("block", { index, textDelta } satisfies BlockPayload),
        blockItem: (index, item) => send("block", { index, item } satisfies BlockPayload),
        blockEnd: (index) => send("blockEnd", { index }),
        citations: (items) => send("citations", { citations: items }),
        insight: (insight) => send("insight", { insight }),
        done: (p) => {
          if (terminal) return;
          terminal = true;
          send("done", p);
          close();
        },
        error: (p) => {
          if (terminal) return;
          terminal = true;
          send("error", p);
          close();
        },
      };

      run(emit)
        .catch((e) => {
          // Last-resort: if run() threw without emitting a terminal event.
          if (!terminal) {
            emit.error({
              code: "internal",
              retryable: true,
              message: e instanceof Error ? e.message : "internal error",
            });
          }
        })
        .finally(() => {
          // Guarantee the stream closes even if run() forgot a terminal event.
          if (!terminal) {
            emit.error({ code: "internal", retryable: true, message: "stream ended without terminal event" });
          }
          close();
        });
    },
    cancel() {
      // Client disconnected — stop heartbeat; the orchestrator's AbortController
      // (passed into run) handles cancelling generation.
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
    },
  });
}
