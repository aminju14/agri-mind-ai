/**
 * TASK 6 — RAG (Agricultural Knowledge System) barrel.
 *
 *   import { createRetrievalMiddleware } from "@/server/rag";       // request path
 *   import { ingestRawDocument } from "@/server/rag";               // ingestion (admin)
 *
 * Retrieve first, generate second. Scope: retrieval + grounding only — NO citations,
 * web search, or insights (those are later tasks).
 */

// embedding
export {
  createOpenAiEmbeddingClient,
  createDefaultEmbeddingClient,
  type EmbeddingClient,
} from "./embed-client";

// ingestion pipeline
export { chunkDocument, estimateTokens, CHUNK_DEFAULTS, type DocChunk } from "./chunk-document";
export { embedChunks, embedQuery, type EmbeddedChunk } from "./embed-document";
export { indexDocument, type DocumentMeta, type IndexResult } from "./index-document";
export { ingestRawDocument, contentChecksum, type IngestInput } from "./ingest-document";

// retrieval
export {
  RagSearchService,
  createRagSearchService,
  RAG_TOP_K,
  RAG_MIN_SIMILARITY,
  type RagSearchResult,
} from "./rag-search.service";

// context building
export {
  buildContext,
  injectContext,
  RAG_MAX_CONTEXT_CHARS,
  type BuiltContext,
} from "./context-builder";

// middleware (orchestrator entry point)
export {
  RetrievalMiddleware,
  createRetrievalMiddleware,
  AGENT_RAG_POLICY,
  type RagPolicy,
  type RetrievalResult,
} from "./retrieval-middleware";
