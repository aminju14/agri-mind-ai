/**
 * TASK 6 — Document chunking.
 *
 * Rules (TASK 6 §Chunking Rules):
 *   - Chunk size: 800–1200 characters
 *   - Overlap: 100–200 characters
 *   - Preserve semantic meaning; avoid splitting sections arbitrarily.
 *
 * Strategy: accumulate whole paragraphs (split on blank lines) until adding the next
 * paragraph would exceed the max; emit the chunk, then start the next chunk with a
 * character overlap taken from the END of the previous chunk (so context carries over).
 * Paragraphs longer than the max are split on sentence boundaries, then hard-split only
 * as a last resort — never mid-word when avoidable.
 */

export interface ChunkOptions {
  minChars?: number;
  maxChars?: number;
  overlapChars?: number;
}

export interface DocChunk {
  index: number;
  content: string;
}

export const CHUNK_DEFAULTS: Required<ChunkOptions> = {
  minChars: 800,
  maxChars: 1200,
  overlapChars: 150, // within the 100–200 band
};

/** Split text into paragraphs (blank-line separated), trimmed, non-empty. */
function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Split an over-long paragraph into sentence-ish pieces. */
function sentences(p: string): string[] {
  // Split after . ! ? followed by space; keep the delimiter.
  const parts = p.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  return parts ? parts.map((s) => s.trim()).filter(Boolean) : [p];
}

/** Take the last `n` chars of `s`, snapped to a word boundary if reasonable. */
function tailOverlap(s: string, n: number): string {
  if (s.length <= n) return s;
  const tail = s.slice(s.length - n);
  const sp = tail.indexOf(" ");
  return sp > 0 && sp < n * 0.5 ? tail.slice(sp + 1) : tail;
}

/**
 * Chunk a document body into semantic, overlapping chunks per TASK 6 rules.
 * Returns chunks in order with their index.
 */
export function chunkDocument(text: string, options: ChunkOptions = {}): DocChunk[] {
  // minChars is the *target* fullness; the packer fills up to maxChars greedily and only
  // emits a shorter chunk when the next unit would overflow (respecting the hard max).
  const { maxChars, overlapChars } = { ...CHUNK_DEFAULTS, ...options };
  const body = text.trim();
  if (!body) return [];

  // Build a list of "units" that are each <= maxChars (paragraphs, then sentences).
  const units: string[] = [];
  for (const p of paragraphs(body)) {
    if (p.length <= maxChars) {
      units.push(p);
      continue;
    }
    // paragraph too big: break into sentences
    let buf = "";
    for (const s of sentences(p)) {
      if (s.length > maxChars) {
        // very long sentence: hard-split into maxChars windows
        if (buf) {
          units.push(buf);
          buf = "";
        }
        for (let i = 0; i < s.length; i += maxChars) units.push(s.slice(i, i + maxChars));
        continue;
      }
      if ((buf + " " + s).trim().length > maxChars) {
        units.push(buf.trim());
        buf = s;
      } else {
        buf = (buf + " " + s).trim();
      }
    }
    if (buf) units.push(buf.trim());
  }

  // Greedily pack units into chunks, carrying an overlap seed from the previous chunk.
  // INVARIANT: a chunk's content never exceeds maxChars (units are already <= maxChars).
  const chunks: DocChunk[] = [];
  let current = ""; // the in-progress chunk (may begin with an overlap seed)
  let index = 0;

  const push = (content: string) => {
    const c = content.trim();
    if (c) chunks.push({ index: index++, content: c });
  };

  for (const u of units) {
    const candidate = current ? `${current}\n\n${u}` : u;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    // Adding `u` overflows. Flush the current chunk (if any), then start a new one.
    if (current) push(current);
    // Seed the next chunk with an overlap of the just-flushed tail — but only if the seed
    // plus this unit still fits; otherwise start the unit fresh (no overlap) to respect max.
    const seed = current && overlapChars > 0 ? tailOverlap(current.trim(), overlapChars) : "";
    const seeded = seed ? `${seed}\n\n${u}` : u;
    current = seeded.length <= maxChars ? seeded : u;
  }
  if (current.trim()) push(current);

  return chunks;
}

/** Rough token estimate (~4 chars/token) for storage stats. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}
