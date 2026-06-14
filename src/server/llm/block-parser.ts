/**
 * Streaming block parser + deterministic repair (AGENTS §14.4 + §15, MASTER §3.2).
 *
 * Consumes raw generation text deltas and emits incremental block events that the
 * orchestrator forwards as SSE. The line PREFIX (`H:`/`P:`/`U:`) sets a block's TYPE and
 * BOUNDARY; text within a block streams incrementally (textDelta for h/p; whole item for
 * ul) so the UI reveal stays byte-identical to the reference (UI §13).
 *
 * `USED:` lines are captured (citation provenance, later phases) and NOT rendered.
 * `[S#]` markers are stripped from displayed text but kept for citation mapping.
 *
 * After the stream ends, `finalize()` applies the deterministic repair rules so the
 * result always conforms to the frozen block model (always renderable).
 */

import type { Block } from "@/lib/types";

/** Incremental events the parser emits while streaming. */
export type ParserEvent =
  | { kind: "blockStart"; index: number; type: Block["type"] }
  | { kind: "textDelta"; index: number; text: string }
  | { kind: "item"; index: number; item: string }
  | { kind: "blockEnd"; index: number }
  | { kind: "insight"; insight: string };

type RawType = "h" | "p" | "ul";

interface WorkingBlock {
  type: RawType;
  text: string; // for h/p
  items: string[]; // for ul
}

const PREFIX_RE = /^(H|P|U|I):\s?(.*)$/;
const USED_RE = /^USED:\s*(.*)$/i;
const S_MARKER_RE = /\s*\[S\d+\]/g;

/** Strip inline [S#] citation markers from displayed text (kept for mapping elsewhere). */
function stripMarkers(s: string): string {
  return s.replace(S_MARKER_RE, "");
}

export class BlockStreamParser {
  private buffer = "";
  private blocks: WorkingBlock[] = [];
  private current: WorkingBlock | null = null;
  private currentIndex = -1;
  private usedRaw = "";
  private insightRaw: string | null = null;
  private repairs = 0;
  private emit: (e: ParserEvent) => void;

  constructor(emit: (e: ParserEvent) => void) {
    this.emit = emit;
  }

  /** Feed a raw text delta from the generator. Emits parser events as lines complete. */
  push(delta: string): void {
    this.buffer += delta;
    let nl: number;
    // Process only COMPLETE lines; the partial tail stays buffered.
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      this.consumeLine(line);
    }
    // For an in-progress h/p block, stream the buffered partial as a textDelta so the
    // cursor advances within the line (UI reveal). We only stream the NEW tail.
    this.flushPartial();
  }

  private partialFlushed = 0;
  private flushPartial(): void {
    if (!this.current || this.current.type === "ul") {
      this.partialFlushed = 0;
      return;
    }
    // If the buffer currently looks like it could be a new prefix line OR a USED: trailer,
    // don't stream it as body text yet (wait for the newline to classify it).
    if (
      /^(H|P|U|I):/.test(this.buffer) ||
      this.couldBePrefix(this.buffer) ||
      this.couldBeUsed(this.buffer)
    )
      return;
    const tail = this.buffer.slice(this.partialFlushed);
    if (tail.length === 0) return;
    const clean = stripMarkers(tail);
    if (clean.length === 0) {
      this.partialFlushed = this.buffer.length;
      return;
    }
    this.current.text += clean;
    this.emit({ kind: "textDelta", index: this.currentIndex, text: clean });
    this.partialFlushed = this.buffer.length;
  }

  /** Heuristic: a short buffer that might still become a prefix (e.g. "H" before ":"). */
  private couldBePrefix(b: string): boolean {
    return /^[HPUI]$/.test(b);
  }

  /**
   * A buffer that is (a prefix of) a "USED:" trailer — withhold from body text until the
   * newline classifies it. Matches "U","US","USE","USED","USED:", and "USED: …".
   */
  private couldBeUsed(b: string): boolean {
    const low = b.toLowerCase();
    if (low.startsWith("used:")) return true; // full trailer in the tail
    return "used:".startsWith(low); // partial prefix of the trailer
  }

  private consumeLine(rawLine: string): void {
    const line = rawLine.replace(/\r$/, "");
    this.partialFlushed = 0;

    const used = line.match(USED_RE);
    if (used) {
      this.usedRaw = used[1].trim();
      return; // never rendered
    }

    const m = line.match(PREFIX_RE);
    if (m) {
      const kind = m[1];
      const rest = stripMarkers(m[2]).trim();
      if (kind === "I") {
        this.insightRaw = rest;
        this.emit({ kind: "insight", insight: rest });
      } else if (kind === "U") {
        this.ensureUl();
        if (rest.length > 0) {
          this.current!.items.push(rest);
          this.emit({ kind: "item", index: this.currentIndex, item: rest });
        }
      } else {
        const type: RawType = kind === "H" ? "h" : "p";
        this.startBlock(type);
        if (rest.length > 0) {
          this.current!.text = rest;
          this.emit({ kind: "textDelta", index: this.currentIndex, text: rest });
        }
      }
      return;
    }

    // A non-prefixed line: treat as a continuation of the current h/p block (soft wrap),
    // or, if no block yet, start a paragraph (repairable case).
    const clean = stripMarkers(line).trim();
    if (clean.length === 0) return;
    if (this.current && this.current.type !== "ul") {
      const add = (this.current.text ? " " : "") + clean;
      this.current.text += add;
      this.emit({ kind: "textDelta", index: this.currentIndex, text: add });
    } else if (this.current && this.current.type === "ul") {
      // stray prose after a list item -> attach as a new item (keeps it visible)
      this.current.items.push(clean);
      this.emit({ kind: "item", index: this.currentIndex, item: clean });
    } else {
      this.startBlock("p");
      this.current!.text = clean;
      this.emit({ kind: "textDelta", index: this.currentIndex, text: clean });
    }
  }

  private startBlock(type: RawType): void {
    this.endCurrent();
    this.current = { type, text: "", items: [] };
    this.blocks.push(this.current);
    this.currentIndex = this.blocks.length - 1;
    this.emit({ kind: "blockStart", index: this.currentIndex, type });
  }

  private ensureUl(): void {
    if (this.current && this.current.type === "ul") return;
    this.startBlock("ul");
  }

  private endCurrent(): void {
    if (this.current) {
      this.emit({ kind: "blockEnd", index: this.currentIndex });
    }
  }

  /** Flush any buffered tail (no trailing newline), close the last block. */
  private drain(): void {
    if (this.buffer.length > 0) {
      // Treat the remaining buffer as a final line.
      const line = this.buffer;
      this.buffer = "";
      this.consumeLine(line);
    }
    this.endCurrent();
    this.current = null;
  }

  /**
   * Finalize: drain the buffer, apply deterministic repair (AGENTS §15.2), return the
   * frozen Block[], the used-source ids, the parsed insight, and the number of repairs applied.
   */
  finalize(): { blocks: Block[]; used: string[]; insight: string | null; repairs: number } {
    this.drain();
    let working = this.blocks.map((b) => ({ ...b, items: [...b.items] }));

    // 1. exactly one H, first. If none, promote first p (or synthesize).
    const headingIdxs = working.map((b, i) => (b.type === "h" ? i : -1)).filter((i) => i >= 0);
    if (headingIdxs.length === 0) {
      const firstP = working.findIndex((b) => b.type === "p" && b.text.trim());
      if (firstP >= 0) {
        working[firstP].type = "h";
        // move it to front
        const [h] = working.splice(firstP, 1);
        working.unshift(h);
        this.repairs++;
      } else {
        // unparseable/empty -> minimal safe answer
        working = [{ type: "h", text: "I need a bit more detail", items: [] }];
        this.repairs++;
      }
    } else {
      // 2. multiple H -> keep first, demote the rest to p
      if (headingIdxs.length > 1) {
        for (let k = 1; k < headingIdxs.length; k++) {
          working[headingIdxs[k]].type = "p";
        }
        this.repairs++;
      }
      // ensure the (first) heading is at index 0
      const hi = working.findIndex((b) => b.type === "h");
      if (hi > 0) {
        const [h] = working.splice(hi, 1);
        working.unshift(h);
        this.repairs++;
      }
    }

    // 3. coalesce consecutive ul blocks; cap items at 5
    const coalesced: WorkingBlock[] = [];
    for (const b of working) {
      const last = coalesced[coalesced.length - 1];
      if (b.type === "ul" && last && last.type === "ul") {
        last.items.push(...b.items);
        this.repairs++;
      } else {
        coalesced.push(b);
      }
    }
    for (const b of coalesced) {
      if (b.type === "ul" && b.items.length > 5) {
        b.items = b.items.slice(0, 5);
        this.repairs++;
      }
    }

    // 4. order: [H, P*, U?] — heading first, then paragraphs, then a SINGLE list.
    // Merge any non-adjacent ul blocks (e.g. produced by reordering) into one, capped at 5.
    const heading = coalesced.filter((b) => b.type === "h");
    const paras = coalesced.filter((b) => b.type === "p");
    const listBlocks = coalesced.filter((b) => b.type === "ul" && b.items.length > 0);
    const mergedItems = listBlocks.flatMap((b) => b.items).slice(0, 5);
    if (listBlocks.length > 1) this.repairs++;
    const lists: WorkingBlock[] =
      mergedItems.length > 0 ? [{ type: "ul", text: "", items: mergedItems }] : [];
    const ordered = [...heading, ...paras, ...lists];

    const blocks: Block[] = ordered.map((b) =>
      b.type === "ul"
        ? { type: "ul", items: b.items.map((s) => s.trim()).filter(Boolean) }
        : { type: b.type, text: b.text.trim() },
    );

    const used = this.usedRaw
      ? this.usedRaw.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^S\d+$/i.test(s))
      : [];

    return { blocks, used, insight: this.insightRaw, repairs: this.repairs };
  }
}
