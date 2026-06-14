/**
 * Database-facing types.
 *
 * Re-exports Prisma's generated model/enum types and defines the typed shapes for the
 * `Json` columns. The Json shapes intentionally reuse the FROZEN UI contracts from
 * `src/lib/types.ts` so the persisted payload renders losslessly (docs/DATABASE.md §2).
 *
 * This module is the single source of truth for "what is actually stored" and must not
 * drift from either the Prisma schema or the frozen UI types.
 */
import type {
  AgentKey as PAgentKey,
  Citation as PCitation,
  Conversation as PConversation,
  Document as PDocument,
  Chunk as PChunk,
  ChunkEmbedding as PChunkEmbedding,
  LearningPath as PLearningPath,
  Lang as PLang,
  Message as PMessage,
  MessageRole as PMessageRole,
  PanelSnapshot as PPanelSnapshot,
  SyncState as PSyncState,
  UsageEvent as PUsageEvent,
  User as PUser,
} from "@prisma/client";

// Frozen UI contracts (the Json columns conform to these).
import type { Block, Citation as UICitation, PanelData } from "@/lib/types";

// ---- Prisma model/enum re-exports (canonical names for the server) ----
export type {
  PAgentKey as AgentKey,
  PCitation as CitationRow,
  PConversation as ConversationRow,
  PDocument as DocumentRow,
  PChunk as ChunkRow,
  PChunkEmbedding as ChunkEmbeddingRow,
  PLearningPath as LearningPathRow,
  PLang as Lang,
  PMessage as MessageRow,
  PMessageRole as MessageRole,
  PPanelSnapshot as PanelSnapshotRow,
  PSyncState as SyncState,
  PUsageEvent as UsageEventRow,
  PUser as UserRow,
};

// ---- Typed Json column shapes (Prisma stores these as Json) ----
/** `Message.blocks` — the frozen answer body (MASTER §3.2). */
export type MessageBlocks = Block[];
/** `Message.routerScores` — per-agent routing scores (AGENTS §13). */
export type RouterScores = Partial<Record<PAgentKey, number>>;
/** `PanelSnapshot.data` — the frozen right-panel payload (MASTER §3.5). */
export type PanelSnapshotData = PanelData;

// ---- Repository DTOs ----------------------------------------------------------

/** Input for persisting the user turn (lifecycle step 2). */
export interface CreateUserMessageInput {
  conversationId: string;
  text: string;
  lang: PLang;
}

/** Input for persisting the AI turn (lifecycle step 15) — lossless payload. */
export interface CreateAiMessageInput {
  /** Optional explicit id so the persisted row matches the id emitted in `meta`/`done`
   *  (SSE message identity, MASTER §3.6). When omitted, Prisma generates a cuid. */
  id?: string;
  conversationId: string;
  lang: PLang;
  agentKey: PAgentKey;
  blocks: MessageBlocks;
  insight: string | null;
  citations: CreateCitationInput[];
  routerReason: string | null;
  routerScores: RouterScores | null;
  usedRag: boolean;
  usedWeb: boolean;
  promptVersion: string | null;
  modelId: string | null;
  blockRepairs: number;
  aborted?: boolean;
}

/** A citation to persist; provenance (chunkId | webUrl) is mandatory (MASTER §4.1). */
export interface CreateCitationInput {
  ordinal: number;
  title: string;
  category: string;
  source: string;
  url?: string | null;
  chunkId?: string | null;
  webUrl?: string | null;
  /** TASK 7 — provenance/ranking for auditing. */
  documentId?: string | null;
  similarityScore?: number | null;
}

/** Sidebar history row (UI §4.1). */
export interface ConversationSummary {
  id: string;
  title: string;
  lang: PLang;
  updatedAt: Date;
  isPinned: boolean;
  isArchived: boolean;
}

/** A fully-hydrated AI message decoded back into the frozen render shape. */
export interface AiMessagePayload {
  id: string;
  role: "ai";
  agentKey: PAgentKey;
  lang: PLang;
  blocks: MessageBlocks;
  insight: string | null;
  citations: UICitation[];
  createdAt: Date;
}

export interface UserMessagePayload {
  id: string;
  role: "user";
  lang: PLang;
  text: string;
  createdAt: Date;
}

export type ThreadMessage = UserMessagePayload | AiMessagePayload;

/** KB ingestion DTOs (docs/DATABASE.md §14). */
export interface UpsertDocumentInput {
  title: string;
  source: string;
  category: string;
  lang: PLang;
  origin?: string; // kb | web_ingest | manual
  uri?: string | null;
  checksum: string;
}

export interface CreateChunkInput {
  ordinal: number;
  lang: PLang;
  text: string;
  tokens: number;
  /** Embedding vector; length MUST equal EMBED_DIM (docs/DATABASE.md §12.3). */
  embedding: number[];
  model: string;
}

/** A retrieved chunk with provenance + similarity (RAG, docs/DATABASE.md §6). */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  title: string;
  category: string;
  source: string;
  lang: PLang;
  text: string;
  score: number; // 1 - cosine_distance
}
