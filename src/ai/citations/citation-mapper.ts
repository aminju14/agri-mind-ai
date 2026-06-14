/**
 * TASK 7 — Citation mapper.
 *
 * Maps ranked citations onto the shapes the rest of the system needs, WITHOUT redesigning
 * the UI. The frozen citation card renders {title, category, source}; we map:
 *   - title    ← sourceTitle
 *   - source   ← bare domain / origin
 *   - category ← relevance label ("92% match")  [the pill slot, no new UI]
 *   - url      ← sourceUrl (the card's link target)
 *
 * Also produces the persistence rows (with documentId + similarityScore provenance) and the
 * minimal CitationDTO contract.
 */

import type { Citation as UICitation } from "@/lib/types";
import type { CreateCitationInput } from "@/server/persistence/types";
import { createId } from "@/server/persistence/id";
import type { CitationDTO, RankedCitation } from "./citation-types";

/** A relevance label for the card's category pill, e.g. "92% match". */
export function relevanceLabel(similarity: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, similarity)) * 100);
  return `${pct}% match`;
}

/** Frozen UI citation card payload (title/category/source/url). */
export function toUICitation(c: RankedCitation): UICitation {
  // Web citations link to their result URL; KB citations link to sourceUrl when present.
  const url = c.kind === "web" ? (c.webUrl ?? c.sourceUrl) : c.sourceUrl;
  return {
    title: c.sourceTitle,
    category: relevanceLabel(c.similarityScore),
    source: c.source,
    ...(url ? { url } : {}),
  };
}

/** Persistence row (lossless provenance for auditing). `ordinal` = render order (1..N).
 *  Provenance is mandatory (MASTER §4.1): KB → chunkId, Web → webUrl. */
export function toCitationRow(c: RankedCitation, ordinal: number): CreateCitationInput {
  const isWeb = c.kind === "web";
  return {
    ordinal,
    title: c.sourceTitle,
    category: relevanceLabel(c.similarityScore),
    source: c.source,
    url: c.sourceUrl ?? null,
    chunkId: isWeb ? null : c.chunkId, // KB provenance
    webUrl: isWeb ? (c.webUrl ?? c.sourceUrl ?? null) : null, // web provenance
    documentId: isWeb ? null : c.documentId,
    similarityScore: c.similarityScore,
  };
}

/** Minimal frontend contract (TASK 7 §Citation Contracts). */
export function toCitationDTO(c: RankedCitation): CitationDTO {
  return {
    id: createId(),
    sourceTitle: c.sourceTitle,
    sourceUrl: c.sourceUrl,
    similarityScore: c.similarityScore,
  };
}
