/**
 * TASK 7 — Citation system types.
 *
 * Citations give every knowledge-based answer source transparency and traceability.
 * Metadata is extracted from RAG-retrieved chunks and MUST survive the whole pipeline
 * (never discarded). Multiple chunks from the same document collapse to ONE citation.
 */

/** Metadata every retrieved chunk carries for citation (TASK 7 §Citation Metadata). */
export interface CitationMeta {
  chunkId: string;
  documentId: string;
  sourceTitle: string;
  sourceUrl?: string;
  /** bare domain / KB origin, e.g. "agrimind.ai", "fao.org". */
  source: string;
  /** KB category (rice/diseases/...), used for source-quality hints + display. */
  category?: string;
  similarityScore: number;
}

/**
 * A document-level, ranked, deduplicated citation produced by the builder.
 * `similarityScore` is the BEST chunk score from that document; `chunkIds` records every
 * contributing chunk for auditing.
 */
export interface RankedCitation {
  /** Provenance kind: a KB document chunk, or an external web result (TASK 8). */
  kind: "kb" | "web";
  documentId: string;
  sourceTitle: string;
  sourceUrl?: string;
  source: string;
  category?: string;
  similarityScore: number;
  /** all chunk ids from this document that contributed (dedup audit). KB only. */
  chunkIds: string[];
  /** the single representative chunk id (best-scoring). KB only; "" for web. */
  chunkId: string;
  /** the web result URL (web provenance, TASK 8). KB citations leave this undefined. */
  webUrl?: string;
  /** computed source-quality tier (higher = more authoritative). */
  qualityTier: number;
  /** rank position assigned by the builder (1 = top). */
  rank: number;
}

/** A web search source the citation builder can ingest (TASK 8 §Search Citations). */
export interface WebCitationSource {
  title: string;
  url: string;
  /** bare domain (display). */
  domain: string;
  /** relevance score from the search provider (0..1). */
  relevanceScore: number;
  /** authority tier from web ranking (mapped onto qualityTier). */
  authority: number;
  publishedAt?: string;
}

/** The minimal citation contract returned to the frontend (TASK 7 §Citation Contracts). */
export interface CitationDTO {
  id: string;
  sourceTitle: string;
  sourceUrl?: string;
  similarityScore: number;
}

// ---------------------------------------------------------------------------
// Source quality ranking (TASK 7 §Source Quality Ranking).
// Higher tier = higher priority. Determined from the source domain/origin.
// ---------------------------------------------------------------------------

export const SOURCE_QUALITY = {
  GOVERNMENT: 6,
  UNIVERSITY: 5,
  JOURNAL: 4,
  RESEARCH_INSTITUTION: 3,
  ORGANIZATION: 2,
  INTERNAL_KB: 1,
  GENERIC_WEB: 0,
} as const;

export type QualityTier = (typeof SOURCE_QUALITY)[keyof typeof SOURCE_QUALITY];

/**
 * Classify a source into a quality tier from its domain/origin.
 * Government > University > Journal > Research institution > Organization > Internal KB >
 * Generic web.
 */
export function sourceQualityTier(source: string): QualityTier {
  const s = source.toLowerCase();
  // government
  if (/\.gov(\.|$)|\.go\.[a-z]{2}$|usda|fda|epa/.test(s)) return SOURCE_QUALITY.GOVERNMENT;
  // agricultural universities / education
  if (/\.edu(\.|$)|\.ac\.[a-z]{2}$|university|univ|cornell|wur|ipb/.test(s))
    return SOURCE_QUALITY.UNIVERSITY;
  // scientific journals
  if (/journal|sciencedirect|springer|wiley|elsevier|mdpi|doi\.org|ncbi|pubmed/.test(s))
    return SOURCE_QUALITY.JOURNAL;
  // research institutions
  if (/cgiar|irri|icrisat|embrapa|cabi|research|institute|cirad/.test(s))
    return SOURCE_QUALITY.RESEARCH_INSTITUTION;
  // agricultural organizations
  if (/fao|\.org(\.|$)|extension/.test(s)) return SOURCE_QUALITY.ORGANIZATION;
  // internal AgriMind knowledge base
  if (/agrimind/.test(s)) return SOURCE_QUALITY.INTERNAL_KB;
  // everything else
  return SOURCE_QUALITY.GENERIC_WEB;
}
