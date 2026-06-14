/**
 * Client SSE consumer for /api/chat (UI §13).
 *
 * Uses fetch + ReadableStream (not EventSource — we must POST with the session cookie
 * and a JSON body). Parses the frozen event protocol (MASTER §3.6) into typed events and
 * invokes callbacks. Accumulates the answer's blocks so the hook can drive the EXISTING
 * timer-based reveal over fully-known blocks — keeping the reveal cadence byte-identical
 * to the reference in-memory animation.
 */

import type { AgentKey, Block, Citation, Lang } from "./types";

export interface ChatStreamHandlers {
  onMeta?: (m: {
    messageId: string;
    agentKey: AgentKey;
    /** Localized agent badge label (TASK 4). Optional; UI may derive its own. */
    agentLabel?: string;
    lang: Lang;
    conversationId: string;
  }) => void;
  onBlocks?: (blocks: Block[]) => void; // called once at the end with the full answer
  onCitations?: (c: Citation[]) => void;
  onInsight?: (insight: string) => void;
  onDone?: (d: { messageId: string }) => void;
  onError?: (e: { code: string; retryable: boolean; message: string }) => void;
}

interface WorkingBlock {
  type: "h" | "p" | "ul";
  text: string;
  items: string[];
}

/**
 * Start a chat stream. Returns an abort function. Network/parse failures call onError
 * (the hook then falls back to the in-memory generator).
 */
export function streamChat(
  body: { text: string; lang: Lang; promptKey?: string; conversationId?: string },
  handlers: ChatStreamHandlers,
): () => void {
  const ac = new AbortController();
  const blocks: WorkingBlock[] = [];

  const ensureBlock = (index: number, type?: "h" | "p" | "ul") => {
    if (!blocks[index]) blocks[index] = { type: type ?? "p", text: "", items: [] };
    else if (type) blocks[index].type = type;
    return blocks[index];
  };

  const toFrozen = (): Block[] =>
    blocks
      .filter(Boolean)
      .map((b) =>
        b.type === "ul"
          ? ({ type: "ul", items: b.items } as Block)
          : ({ type: b.type, text: b.text } as Block),
      );

  const handleEvent = (event: string, data: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const p = parsed as Record<string, unknown>;
    switch (event) {
      case "meta":
        handlers.onMeta?.({
          messageId: String(p.messageId),
          agentKey: p.agentKey as AgentKey,
          agentLabel: typeof p.agentLabel === "string" ? p.agentLabel : undefined,
          lang: p.lang as Lang,
          conversationId: String(p.conversationId),
        });
        break;
      case "block": {
        const index = Number(p.index);
        if (typeof p.type === "string") ensureBlock(index, p.type as "h" | "p" | "ul");
        else {
          const b = ensureBlock(index);
          if (typeof p.textDelta === "string") b.text += p.textDelta;
          if (typeof p.item === "string") b.items.push(p.item);
        }
        break;
      }
      case "blockEnd":
        break; // boundary only; nothing to do client-side for the timer reveal
      case "citations":
        handlers.onCitations?.((p.citations as Citation[]) ?? []);
        break;
      case "insight":
        handlers.onInsight?.(String(p.insight));
        break;
      case "done":
        handlers.onBlocks?.(toFrozen());
        handlers.onDone?.({ messageId: String(p.messageId) });
        break;
      case "error":
        handlers.onError?.({
          code: String(p.code),
          retryable: Boolean(p.retryable),
          message: String(p.message ?? "error"),
        });
        break;
    }
  };

  (async () => {
    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      handlers.onError?.({ code: "network", retryable: true, message: String(e) });
      return;
    }

    if (!res.ok || !res.body) {
      handlers.onError?.({ code: "http_" + res.status, retryable: res.status >= 500, message: "request failed" });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line.
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          if (frame.startsWith(":")) continue; // heartbeat comment
          let event = "message";
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length) handleEvent(event, dataLines.join("\n"));
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        handlers.onError?.({ code: "stream", retryable: true, message: String(e) });
      }
    }
  })();

  return () => ac.abort();
}
