import { describe, it, expect } from "vitest";
import { decideWebSearch } from "./search-router";
import { processResults } from "./search-processor";
import { buildWebContext, combineKnowledgeBlocks } from "./search-context-builder";
import { webAuthorityTier, isBlockedSource, WEB_AUTHORITY, type RawSearchResult } from "./search-types";
import { buildWebCitations, mergeCitations, buildCitations } from "@/ai/citations";

describe("TASK 8 — search router (tool decision)", () => {
  it("triggers web search on recency signals", () => {
    expect(decideWebSearch({ text: "Latest chili prices in Indonesia", agent: "research" }).needsWebSearch).toBe(true);
    expect(decideWebSearch({ text: "Agricultural news this week", agent: "research" }).needsWebSearch).toBe(true);
    expect(decideWebSearch({ text: "harga cabai terkini", agent: "research" }).needsWebSearch).toBe(true);
    expect(decideWebSearch({ text: "New fertilizer regulations in Indonesia", agent: "agronomist" }).needsWebSearch).toBe(true);
  });

  it("does NOT trigger web search for evergreen/how-to questions", () => {
    expect(decideWebSearch({ text: "How to cultivate chili?", agent: "agronomist" }).needsWebSearch).toBe(false);
    expect(decideWebSearch({ text: "How to irrigate rice fields?", agent: "agronomist" }).needsWebSearch).toBe(false);
    expect(decideWebSearch({ text: "What causes yellow leaves?", agent: "plantdoctor" }).needsWebSearch).toBe(false);
    expect(decideWebSearch({ text: "Bagaimana cara menanam padi?", agent: "agronomist" }).needsWebSearch).toBe(false);
  });

  it("classifies the search category", () => {
    expect(decideWebSearch({ text: "current rice prices", agent: "research" }).category).toBe("commodity_prices");
    expect(decideWebSearch({ text: "latest agricultural regulation", agent: "research" }).category).toBe("agricultural_news");
    expect(decideWebSearch({ text: "chili market trends and export demand now", agent: "research" }).category).toBe("market_trends");
    expect(decideWebSearch({ text: "weather forecast and drought alert", agent: "farmplanner" }).category).toBe("weather");
  });
});

describe("TASK 8 — authority ranking (§Authority Ranking)", () => {
  it("ranks government highest, generic web lowest", () => {
    expect(webAuthorityTier("https://pertanian.go.id/news")).toBe(WEB_AUTHORITY.GOVERNMENT);
    expect(webAuthorityTier("https://cornell.edu/study")).toBe(WEB_AUTHORITY.UNIVERSITY);
    expect(webAuthorityTier("https://www.nature.com/articles/x")).toBe(WEB_AUTHORITY.JOURNAL);
    expect(webAuthorityTier("https://fao.org/report")).toBe(WEB_AUTHORITY.ORGANIZATION);
    expect(webAuthorityTier("https://reuters.com/markets")).toBe(WEB_AUTHORITY.TRUSTED_PUBLICATION);
    expect(webAuthorityTier("https://randomblog123.net")).toBe(WEB_AUTHORITY.LOW_AUTHORITY);
  });

  it("blocks spam/content-farm sources (§Search Safety)", () => {
    expect(isBlockedSource("https://pinterest.com/x")).toBe(true);
    expect(isBlockedSource("https://quora.com/x")).toBe(true);
    expect(isBlockedSource("https://pertanian.go.id")).toBe(false);
  });
});

function raw(title: string, url: string, content: string, score?: number, date?: string): RawSearchResult {
  return { title, url, content, score, publishedDate: date };
}

describe("TASK 8 — search processor (dedup/rank/filter)", () => {
  it("filters blocked + thin content, dedups by domain+title, ranks by relevance", () => {
    const out = processResults([
      raw("Spam", "https://pinterest.com/a", "blocked source with enough content here to pass length", 0.99),
      raw("Thin", "https://gov.id/a", "short", 0.9),
      raw("Rice prices rise", "https://reuters.com/x", "Rice prices rose 5% this week amid tight supply across markets.", 0.8),
      raw("Rice prices rise", "https://reuters.com/x", "Duplicate of the same article from the same domain entirely.", 0.7),
      raw("Gov report", "https://pertanian.go.id/r", "Government report on national rice production figures and policy.", 0.6),
    ]);
    expect(out.find((r) => r.domain.includes("pinterest"))).toBeUndefined(); // blocked
    expect(out.find((r) => r.title === "Thin")).toBeUndefined(); // too thin
    expect(out.filter((r) => r.domain === "reuters.com")).toHaveLength(1); // deduped
    expect(out[0].title).toBe("Rice prices rise"); // highest relevance first
  });

  it("breaks relevance ties by authority", () => {
    const out = processResults([
      raw("Blog", "https://someblog.net/a", "content content content content content content", 0.7),
      raw("Gov", "https://pertanian.go.id/a", "government content here long enough to pass filter", 0.7),
    ]);
    expect(out[0].domain).toContain("go.id"); // authority wins the tie
  });

  it("returns [] for empty input", () => {
    expect(processResults([])).toEqual([]);
  });
});

describe("TASK 8 — search context builder", () => {
  it("builds a WEB SEARCH RESULTS block with source + date metadata", () => {
    const processed = processResults([
      raw("Chili price update", "https://reuters.com/x", "Chili prices climbed this week on tight supply nationwide.", 0.9, "2026-06-10"),
    ]);
    const ctx = buildWebContext(processed, "en");
    expect(ctx.text).toMatch(/WEB SEARCH RESULTS/);
    expect(ctx.text).toMatch(/reuters.com/);
    expect(ctx.text).toMatch(/2026-06-10/);
    expect(ctx.used).toHaveLength(1);
  });

  it("combines KB block before web block", () => {
    const combined = combineKnowledgeBlocks("KB BLOCK", "WEB BLOCK");
    expect(combined.indexOf("KB BLOCK")).toBeLessThan(combined.indexOf("WEB BLOCK"));
  });

  it("returns empty for no results / handles empty blocks", () => {
    expect(buildWebContext([], "en").text).toBe("");
    expect(combineKnowledgeBlocks("KB", "")).toBe("KB");
    expect(combineKnowledgeBlocks("", "WEB")).toBe("WEB");
  });
});

describe("TASK 8 — web citations + merge with RAG (§Citation Integration)", () => {
  it("builds web citations with webUrl provenance and dedups by URL", () => {
    const cites = buildWebCitations([
      { title: "Gov report", url: "https://gov.id/r", domain: "gov.id", relevanceScore: 0.8, authority: WEB_AUTHORITY.GOVERNMENT },
      { title: "Gov report dup", url: "https://gov.id/r", domain: "gov.id", relevanceScore: 0.7, authority: WEB_AUTHORITY.GOVERNMENT },
    ]);
    expect(cites).toHaveLength(1);
    expect(cites[0].kind).toBe("web");
    expect(cites[0].webUrl).toBe("https://gov.id/r");
  });

  it("merges KB + web citations into one ranked list (appear together)", () => {
    const kb = buildCitations([
      { chunkId: "c1", documentId: "d1", title: "Rice Handbook", category: "rice", source: "agrimind.ai", lang: "en", text: "...", score: 0.6 },
    ]);
    const web = buildWebCitations([
      { title: "Latest prices", url: "https://reuters.com/x", domain: "reuters.com", relevanceScore: 0.9, authority: WEB_AUTHORITY.TRUSTED_PUBLICATION },
    ]);
    const merged = mergeCitations(kb, web);
    expect(merged).toHaveLength(2);
    expect(merged[0].sourceTitle).toBe("Latest prices"); // higher relevance ranks first
    expect(merged.map((c) => c.rank)).toEqual([1, 2]);
    expect(new Set(merged.map((c) => c.kind))).toEqual(new Set(["kb", "web"]));
  });
});
