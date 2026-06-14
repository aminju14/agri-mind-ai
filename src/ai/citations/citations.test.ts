import { describe, it, expect } from "vitest";
import { buildCitations } from "./citation-builder";
import { toUICitation, toCitationRow, relevanceLabel } from "./citation-mapper";
import { sourceQualityTier, SOURCE_QUALITY } from "./citation-types";
import { createCitationService } from "./citation-service";
import type { RetrievedChunk } from "@/server/persistence/types";

function chunk(
  chunkId: string,
  documentId: string,
  title: string,
  source: string,
  score: number,
  category = "rice",
): RetrievedChunk {
  return { chunkId, documentId, title, category, source, lang: "en", text: "...", score };
}

describe("TASK 7 — source quality ranking (§Source Quality Ranking)", () => {
  it("ranks government > university > journal > research > org > internal > web", () => {
    expect(sourceQualityTier("usda.gov")).toBe(SOURCE_QUALITY.GOVERNMENT);
    expect(sourceQualityTier("cornell.edu")).toBe(SOURCE_QUALITY.UNIVERSITY);
    expect(sourceQualityTier("sciencedirect.com")).toBe(SOURCE_QUALITY.JOURNAL);
    expect(sourceQualityTier("irri.org-research")).toBe(SOURCE_QUALITY.RESEARCH_INSTITUTION);
    expect(sourceQualityTier("fao.org")).toBe(SOURCE_QUALITY.ORGANIZATION);
    expect(sourceQualityTier("agrimind.ai")).toBe(SOURCE_QUALITY.INTERNAL_KB);
    expect(sourceQualityTier("randomblog.com")).toBe(SOURCE_QUALITY.GENERIC_WEB);
  });
});

describe("TASK 7 — citation builder (dedup + rank)", () => {
  it("merges multiple chunks of the same document into ONE citation (§Deduplication)", () => {
    const chunks = [
      chunk("c1", "doc1", "Chili Cultivation Handbook", "agrimind.ai", 0.7),
      chunk("c2", "doc1", "Chili Cultivation Handbook", "agrimind.ai", 0.9),
      chunk("c3", "doc1", "Chili Cultivation Handbook", "agrimind.ai", 0.6),
    ];
    const cites = buildCitations(chunks);
    expect(cites).toHaveLength(1);
    expect(cites[0].sourceTitle).toBe("Chili Cultivation Handbook");
    expect(cites[0].chunkIds).toHaveLength(3); // all chunks recorded
    expect(cites[0].similarityScore).toBe(0.9); // best chunk score
  });

  it("ranks by similarity first", () => {
    const cites = buildCitations([
      chunk("a", "d1", "Low", "agrimind.ai", 0.4),
      chunk("b", "d2", "High", "agrimind.ai", 0.8),
    ]);
    expect(cites[0].sourceTitle).toBe("High");
    expect(cites[0].rank).toBe(1);
  });

  it("breaks similarity ties by source quality", () => {
    const cites = buildCitations([
      chunk("a", "d1", "Internal", "agrimind.ai", 0.7),
      chunk("b", "d2", "Government", "usda.gov", 0.7),
    ]);
    expect(cites[0].sourceTitle).toBe("Government"); // higher quality wins the tie
  });

  it("breaks similarity+quality ties by retrieval order", () => {
    const cites = buildCitations([
      chunk("a", "d1", "First", "agrimind.ai", 0.7),
      chunk("b", "d2", "Second", "agrimind.ai", 0.7),
    ]);
    expect(cites[0].sourceTitle).toBe("First");
  });

  it("returns [] for no chunks and skips malformed chunks", () => {
    expect(buildCitations([])).toEqual([]);
    const cites = buildCitations([
      { chunkId: "", documentId: "", title: "bad", category: "x", source: "y", lang: "en", text: "", score: 0.9 },
      chunk("ok", "d1", "Good", "agrimind.ai", 0.8),
    ]);
    expect(cites).toHaveLength(1);
    expect(cites[0].sourceTitle).toBe("Good");
  });
});

describe("TASK 7 — mapper (frozen UI + persistence)", () => {
  const ranked = buildCitations([chunk("c1", "doc1", "Rice Guide", "fao.org", 0.834)])[0];

  it("relevanceLabel formats as N% match", () => {
    expect(relevanceLabel(0.834)).toBe("83% match");
    expect(relevanceLabel(1)).toBe("100% match");
  });

  it("maps to the frozen UI citation card (title/category/source)", () => {
    const ui = toUICitation(ranked);
    expect(ui.title).toBe("Rice Guide");
    expect(ui.source).toBe("fao.org");
    expect(ui.category).toBe("83% match");
  });

  it("maps to a persistence row with provenance + ordinal", () => {
    const row = toCitationRow(ranked, 1);
    expect(row.ordinal).toBe(1);
    expect(row.documentId).toBe("doc1");
    expect(row.chunkId).toBe("c1");
    expect(row.similarityScore).toBeCloseTo(0.834);
    expect(row.title).toBe("Rice Guide");
  });
});

describe("TASK 7 — citation service (build + telemetry + resilience)", () => {
  const svc = createCitationService();

  it("builds UI citations + persistence rows from used chunks", () => {
    const built = svc.build("research", [
      chunk("c1", "d1", "Doc A", "agrimind.ai", 0.8),
      chunk("c2", "d1", "Doc A", "agrimind.ai", 0.9), // same doc → merged
      chunk("c3", "d2", "Doc B", "fao.org", 0.7),
    ]);
    expect(built.ui).toHaveLength(2); // 2 documents
    expect(built.rows).toHaveLength(2);
    expect(built.rows[0].ordinal).toBe(1);
    expect(built.buildMs).toBeLessThan(100); // §Performance < 100ms
  });

  it("returns empty when no chunks (no RAG → no citations)", () => {
    const built = svc.build("agronomist", []);
    expect(built.ui).toEqual([]);
    expect(built.rows).toEqual([]);
  });
});
