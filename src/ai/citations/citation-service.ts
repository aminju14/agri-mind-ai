/**
 * TASK 7 — Citation service (facade used by the orchestrator).
 *
 *   retrieved chunks → build (dedup + rank) → map → { UI citations, DB rows }
 *
 * Resilient (TASK 7 §Error Handling): if citation metadata is missing or anything fails,
 * it returns empty citations and the answer proceeds normally. Logs retrieved docs/chunks,
 * similarity scores, citation count, and build time (§Logging). Target < 100ms.
 */

import type { RetrievedChunk } from "@/server/persistence/types";
import type { Citation as UICitation } from "@/lib/types";
import type { CreateCitationInput } from "@/server/persistence/types";
import type { AgentKey } from "@/ai/types";
import { buildCitations, buildWebCitations, mergeCitations } from "./citation-builder";
import { toUICitation, toCitationRow } from "./citation-mapper";
import type { RankedCitation, WebCitationSource } from "./citation-types";

export interface BuiltCitations {
  /** Frozen-UI citation cards (title/category/source) in render order. */
  ui: UICitation[];
  /** Persistence rows (with provenance) to write with the AI message. */
  rows: CreateCitationInput[];
  /** Ranked citations (full metadata) for logging/auditing. */
  ranked: RankedCitation[];
  /** Build wall-clock in ms (§Performance < 100ms target). */
  buildMs: number;
}

const EMPTY: BuiltCitations = { ui: [], rows: [], ranked: [], buildMs: 0 };

export class CitationService {
  /**
   * Build citations for a turn from the chunks the answer actually used.
   * Never throws — returns empty citations on any problem (TASK 7 §Error Handling).
   *
   * @param agent       the answering agent (for logging / agent rules)
   * @param chunks      the retrieved KB chunks that grounded the answer (retrieval.used)
   * @param webSources  TASK 8 — web search sources used this turn (merged + ranked together)
   */
  build(
    agent: AgentKey,
    chunks: RetrievedChunk[],
    traceId?: string,
    webSources: WebCitationSource[] = [],
  ): BuiltCitations {
    const t0 = Date.now();
    try {
      const kb = chunks && chunks.length > 0 ? buildCitations(chunks) : [];
      const web = webSources.length > 0 ? buildWebCitations(webSources) : [];
      if (kb.length === 0 && web.length === 0) return EMPTY;

      // Merge RAG + Web into one ranked list (they appear together — TASK 8 §Citation Integration).
      const ranked = mergeCitations(kb, web);

      const ui = ranked.map(toUICitation);
      const rows = ranked.map((c, i) => toCitationRow(c, i + 1));
      const buildMs = Date.now() - t0;
      this.log(agent, ranked, buildMs, traceId);
      return { ui, rows, ranked, buildMs };
    } catch (e) {
      // Citation metadata unavailable / build error: do NOT fail the response.
      console.warn("[citation] build failed:", e instanceof Error ? e.message : e);
      return { ...EMPTY, buildMs: Date.now() - t0 };
    }
  }

  private log(agent: AgentKey, ranked: RankedCitation[], ms: number, traceId?: string) {
    console.info(
      JSON.stringify({
        event: "citations",
        traceId,
        agent,
        citationCount: ranked.length,
        buildMs: ms,
        documents: ranked.map((c) => ({
          documentId: c.documentId,
          title: c.sourceTitle,
          source: c.source,
          score: Number(c.similarityScore.toFixed(4)),
          chunks: c.chunkIds.length,
          quality: c.qualityTier,
          rank: c.rank,
        })),
      }),
    );
  }
}

export function createCitationService(): CitationService {
  return new CitationService();
}
