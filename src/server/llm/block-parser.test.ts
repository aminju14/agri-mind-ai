import { describe, it, expect } from "vitest";
import { BlockStreamParser, type ParserEvent } from "./block-parser";
import type { Block } from "@/lib/types";

/** Feed `text` to the parser in `chunkSize` slices and return final blocks + events. */
function run(
  text: string,
  chunkSize = 7,
): { blocks: Block[]; used: string[]; insight: string | null; repairs: number; events: ParserEvent[] } {
  const events: ParserEvent[] = [];
  const p = new BlockStreamParser((e) => events.push(e));
  for (let i = 0; i < text.length; i += chunkSize) p.push(text.slice(i, i + chunkSize));
  const { blocks, used, insight, repairs } = p.finalize();
  return { blocks, used, insight, repairs, events };
}

const GOOD = `H: Start with soil
P: Run a soil test first.
P: Then pick fast crops.
U: Test pH
U: Pick crops
U: Keep a log`;

describe("BlockStreamParser — happy path", () => {
  it("parses H/P/U into the frozen block model", () => {
    const { blocks } = run(GOOD);
    expect(blocks).toEqual<Block[]>([
      { type: "h", text: "Start with soil" },
      { type: "p", text: "Run a soil test first." },
      { type: "p", text: "Then pick fast crops." },
      { type: "ul", items: ["Test pH", "Pick crops", "Keep a log"] },
    ]);
  });

  it("emits blockStart for each block and items for the ul", () => {
    const { events } = run(GOOD);
    const starts = events.filter((e) => e.kind === "blockStart");
    expect(starts.map((s) => (s as { type: string }).type)).toEqual(["h", "p", "p", "ul"]);
    const items = events.filter((e) => e.kind === "item");
    expect(items.length).toBe(3);
  });

  it("is chunk-size independent", () => {
    for (const cs of [1, 3, 13, 999]) {
      const { blocks } = run(GOOD, cs);
      expect(blocks[0]).toEqual({ type: "h", text: "Start with soil" });
      expect(blocks[3]).toEqual({ type: "ul", items: ["Test pH", "Pick crops", "Keep a log"] });
    }
  });
});

describe("BlockStreamParser — repair (AGENTS §15.2)", () => {
  it("promotes first paragraph to heading when no H", () => {
    const { blocks, repairs } = run(`P: This becomes the heading
P: Body text.`);
    expect(blocks[0]).toEqual({ type: "h", text: "This becomes the heading" });
    expect(repairs).toBeGreaterThan(0);
  });

  it("demotes extra headings to paragraphs and keeps one heading first", () => {
    const { blocks } = run(`H: First
H: Second
P: body`);
    expect(blocks.filter((b) => b.type === "h").length).toBe(1);
    expect(blocks[0]).toEqual({ type: "h", text: "First" });
  });

  it("coalesces consecutive ul blocks and caps at 5 items", () => {
    const { blocks } = run(`H: x
U: a
U: b
U: c
U: d
U: e
U: f
U: g`);
    const ul = blocks.find((b) => b.type === "ul") as { type: "ul"; items: string[] };
    expect(ul.items.length).toBe(5);
  });

  it("strips leaked markdown markers", () => {
    const { blocks } = run(`H: Title
P: Some **bold** text and a [S1] marker.`);
    const p = blocks.find((b) => b.type === "p") as { text: string };
    expect(p.text).not.toContain("[S1]");
    expect(p.text).toContain("Some");
  });

  it("orders blocks as [H, P*, U] even if the model emits them out of order", () => {
    const { blocks } = run(`U: item one
P: a paragraph
H: the heading
U: item two`);
    expect(blocks.map((b) => b.type)).toEqual(["h", "p", "ul"]);
  });

  it("produces a minimal safe answer for empty/garbage input", () => {
    const { blocks } = run(`\n\n   \n`);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(blocks[0].type).toBe("h");
  });
});

describe("BlockStreamParser — USED trailer", () => {
  it("captures USED source ids and does not render them", () => {
    const { blocks, used } = run(`H: Title
P: Grounded claim [S1] and [S2].
USED: S1, S2`);
    expect(used).toEqual(["S1", "S2"]);
    // USED line is not a block
    expect(blocks.some((b) => "text" in b && (b.text ?? "").includes("USED"))).toBe(false);
  });
});

describe("BlockStreamParser — I: insight (MASTER §3.4)", () => {
  const WITH_INSIGHT = `H: Start with soil
P: Run a soil test first.
U: Test pH
U: Pick fast crops
U: Keep a log
I: Spend week one on soil, not on seeds.`;

  it("captures the I: line as the insight, not a block", () => {
    const { blocks, insight } = run(WITH_INSIGHT);
    expect(insight).toBe("Spend week one on soil, not on seeds.");
    // The insight text must NOT leak into the rendered blocks.
    expect(blocks.some((b) => "text" in b && (b.text ?? "").includes("Spend week one"))).toBe(false);
    expect(blocks.some((b) => b.type === "ul" && (b.items ?? []).some((it) => it.includes("Spend week one")))).toBe(false);
  });

  it("keeps the frozen block shape [h, p, ul] when an insight is present", () => {
    const { blocks } = run(WITH_INSIGHT);
    expect(blocks.map((b) => b.type)).toEqual(["h", "p", "ul"]);
  });

  it("emits an insight parser event", () => {
    const { events } = run(WITH_INSIGHT);
    const insightEvents = events.filter((e) => e.kind === "insight");
    expect(insightEvents.length).toBe(1);
    expect((insightEvents[0] as { insight: string }).insight).toBe("Spend week one on soil, not on seeds.");
  });

  it("is chunk-size independent for the insight too", () => {
    for (const cs of [1, 3, 17]) {
      const { insight } = run(WITH_INSIGHT, cs);
      expect(insight).toBe("Spend week one on soil, not on seeds.");
    }
  });

  it("returns null insight when no I: line is present", () => {
    const { insight } = run(`H: x\nP: y\nU: a\nU: b\nU: c`);
    expect(insight).toBeNull();
  });
});
