import { describe, it, expect } from "vitest";
import { createSseStream, type SseEmitter } from "./sse";

/** Drain an SSE ReadableStream to its full text. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

/** Parse SSE text into [event, dataJson] frames (ignoring heartbeats). */
function frames(text: string): Array<{ event: string; data: unknown }> {
  return text
    .split("\n\n")
    .filter((f) => f && !f.startsWith(":"))
    .map((f) => {
      let event = "message";
      let data = "";
      for (const line of f.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      return { event, data: data ? JSON.parse(data) : null };
    });
}

describe("createSseStream", () => {
  it("emits a well-formed ordered stream", async () => {
    const stream = createSseStream(async (e: SseEmitter) => {
      e.meta({ messageId: "m1", agentKey: "agronomist", agentLabel: "Test Agent", lang: "en", conversationId: "c1" });
      e.blockStart(0, "h");
      e.blockDelta(0, "Hello");
      e.blockEnd(0);
      e.done({ messageId: "m1", traceId: "t1" });
    });
    const fr = frames(await drain(stream));
    expect(fr.map((f) => f.event)).toEqual(["meta", "block", "block", "blockEnd", "done"]);
    expect(fr[0].data).toMatchObject({ messageId: "m1", agentKey: "agronomist", lang: "en" });
    expect(fr[1].data).toMatchObject({ index: 0, type: "h" });
    expect(fr[2].data).toMatchObject({ index: 0, textDelta: "Hello" });
    expect(fr[4].data).toMatchObject({ messageId: "m1", traceId: "t1" });
  });

  it("only allows one terminal event (done wins, later error ignored)", async () => {
    const stream = createSseStream(async (e) => {
      e.meta({ messageId: "m", agentKey: "research", agentLabel: "Test Agent", lang: "en", conversationId: "c1" });
      e.done({ messageId: "m", traceId: "t" });
      e.error({ code: "internal", retryable: true, message: "late" }); // ignored
    });
    const fr = frames(await drain(stream));
    expect(fr.filter((f) => f.event === "done").length).toBe(1);
    expect(fr.filter((f) => f.event === "error").length).toBe(0);
  });

  it("emits an error terminal if run() throws without emitting one", async () => {
    const stream = createSseStream(async () => {
      throw new Error("boom");
    });
    const fr = frames(await drain(stream));
    const errs = fr.filter((f) => f.event === "error");
    expect(errs.length).toBe(1);
    expect((errs[0].data as { message: string }).message).toContain("boom");
  });

  it("guarantees a terminal event even if run() emits none", async () => {
    const stream = createSseStream(async (e) => {
      e.meta({ messageId: "m", agentKey: "agronomist", agentLabel: "Test Agent", lang: "en", conversationId: "c1" });
      // forgets done/error
    });
    const fr = frames(await drain(stream));
    const last = fr[fr.length - 1];
    expect(["done", "error"]).toContain(last.event);
  });

  it("serializes item events for list blocks", async () => {
    const stream = createSseStream(async (e) => {
      e.meta({ messageId: "m", agentKey: "agronomist", agentLabel: "Test Agent", lang: "en", conversationId: "c1" });
      e.blockStart(0, "ul");
      e.blockItem(0, "first item");
      e.done({ messageId: "m", traceId: "t" });
    });
    const fr = frames(await drain(stream));
    const itemFrame = fr.find((f) => f.event === "block" && (f.data as { item?: string }).item);
    expect((itemFrame!.data as { item: string }).item).toBe("first item");
  });
});
