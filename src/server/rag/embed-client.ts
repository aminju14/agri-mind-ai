/**
 * TASK 6 — Embedding client seam.
 *
 * Produces embeddings for RAG ingestion and queries. OpenAI `text-embedding-3-large` at
 * dimensions=1536 (must equal the vector(1536) column / EMBED_DIM — docs/DATABASE.md §12.3).
 *
 * Injectable interface so tests can supply a fake; the real client requires
 * OPENAI_API_KEY and fails with a clear error if it is missing (no silent fallback —
 * embeddings must be consistent across ingest + query).
 */

import { EMBED_DIM } from "@/server/persistence/documents";

export interface EmbeddingClient {
  readonly model: string;
  readonly dim: number;
  /** Embed one text. Returns a vector of length `dim`. */
  embed(text: string): Promise<number[]>;
  /** Embed many texts in one call (batched). Order preserved. */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** Max inputs per OpenAI embeddings request (keep well under provider limits). */
const BATCH_LIMIT = 96;

export function createOpenAiEmbeddingClient(opts?: {
  apiKey?: string;
  model?: string;
  dim?: number;
}): EmbeddingClient {
  const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
  const model = opts?.model ?? process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-large";
  const dim = opts?.dim ?? EMBED_DIM;

  async function client() {
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY missing — RAG embeddings require it (set it in .env). " +
          "Ingestion and query embeddings must use the same model/dim.",
      );
    }
    const { default: OpenAI } = await import("openai");
    return new OpenAI({ apiKey });
  }

  function validate(vecs: number[][]): number[][] {
    for (const v of vecs) {
      if (v.length !== dim) {
        throw new Error(`embedding dim ${v.length} != expected ${dim} (model ${model})`);
      }
    }
    return vecs;
  }

  return {
    model,
    dim,
    async embed(text: string): Promise<number[]> {
      const [v] = await this.embedBatch([text]);
      return v;
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const openai = await client();
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
        const batch = texts.slice(i, i + BATCH_LIMIT);
        const res = await openai.embeddings.create({
          model,
          input: batch,
          dimensions: dim,
        });
        // OpenAI preserves input order in res.data.
        for (const d of res.data) out.push(d.embedding as number[]);
      }
      return validate(out);
    },
  };
}

/** Default embedding client (OpenAI). Throws at call time if no key. */
export function createDefaultEmbeddingClient(): EmbeddingClient {
  return createOpenAiEmbeddingClient();
}
