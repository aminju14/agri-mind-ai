/**
 * TASK 7 — Citation System barrel.
 *
 *   import { createCitationService } from "@/ai/citations";   // request path
 *
 * Source transparency + traceability for knowledge-based answers. Integrates with RAG:
 * the chunks the answer used become deduplicated, ranked, persisted citations rendered in
 * the existing (frozen) citation cards. Scope: citations only — no web search, no insights.
 */
export {
  CitationService,
  createCitationService,
  type BuiltCitations,
} from "./citation-service";
export { buildCitations, buildWebCitations, mergeCitations, toCitationMeta } from "./citation-builder";
export {
  toUICitation,
  toCitationRow,
  toCitationDTO,
  relevanceLabel,
} from "./citation-mapper";
export {
  getCitationsForMessage,
  countCitationsForMessage,
  type StoredCitation,
} from "./citation-repository";
export {
  sourceQualityTier,
  SOURCE_QUALITY,
  type CitationMeta,
  type RankedCitation,
  type CitationDTO,
  type QualityTier,
  type WebCitationSource,
} from "./citation-types";
