# DATABASE.md — AgriMind AI Data Layer Specification

> Governed by `MASTER_PROMPT.md`. Defines the Prisma schema, pgvector setup, RAG
> storage, retrieval SQL, migrations, and data-integrity rules. All persisted shapes
> must be able to produce the Frozen UI contracts (`MASTER_PROMPT §3`) without
> transformation loss. Stack: **PostgreSQL + pgvector**, accessed via **Prisma**.

---

## 1. Responsibilities

The data layer owns:
- Durable **identity & tenancy** (users, sessions via Auth.js).
- Durable **conversation history** (conversations, messages) scoped per user.
- The **answer payload** (blocks, citations, insight, usage, router reason) persisted
  losslessly so a reloaded conversation renders identically to the live stream.
- The **bilingual knowledge base** (documents, chunks) and their **embeddings**
  (pgvector) for RAG.
- **Panel snapshots** and **learning-path** progress for the right Insight Panel.
- **Usage/cost** accounting per turn.

It does **not** own intelligence (no business logic in SQL beyond retrieval) and never
returns cross-tenant rows.

---

## 2. Core rules & constraints

1. **Tenancy is mandatory.** Every user-owned table carries `userId`; every query for
   user data filters on it. No repository method touches user data without a `userId`.
2. **Lossless answers.** `Message` stores the exact `blocks`, `citations`, and
   `insight` emitted, so history replay == original render. No re-generation on load.
3. **Embedding dimension is fixed & global.** The `vector(N)` column dimension N MUST
   equal `EMBED_DIM` in config and the OpenAI model's output dim. Ingestion and query
   embeddings use the **same** model/dim. Changing N is a migration + full re-embed.
4. **Language is a column, not a convention.** `documents.lang` and `chunks.lang`
   drive RAG language filtering (`MASTER_PROMPT` RAG decision).
5. **Soft-delete conversations** (`deletedAt`) so history "delete" is reversible and
   auditable; hard-delete only via retention job.
6. **Referential integrity** enforced by FKs with explicit `onDelete` rules (below).
7. **Time is UTC** (`timestamptz`), set by DB default, never by the client.

---

## 3. Entity overview

```
User 1───* Conversation 1───* Message 1───* Citation
  │                                  └─────── (blocks, insight: JSON on Message)
  │
  ├─1───* LearningPath           (right-panel progress)
  └─1───* UsageEvent             (per-turn cost)

Conversation 1───* PanelSnapshot (right-panel context over time)

Document 1───* Chunk 1───1 ChunkEmbedding   (vector(N), pgvector)
QueryEmbeddingCache (hot query vectors, TTL)

(Auth.js) Account, Session, VerificationToken  — standard adapter tables
```

---

## 4. Prisma schema (authoritative)

> `vector` is provided via pgvector. Prisma models the embedding as `Unsupported`
> and the raw SQL/migrations create the actual `vector(N)` column and indexes (§5).
> Set `N` = `EMBED_DIM`. AgriMind ships at **1536** for `text-embedding-3-large` (via the
> model's `dimensions` param) so HNSW stays usable — this is the default across schema,
> migrations, and `.env.example`. `text-embedding-3-large` can emit up to **3072**; if you
> raise `EMBED_DIM`, ingestion and query MUST agree and the `vector(N)` column must match.

```prisma
// schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

enum Lang        { en id }
enum MessageRole { user ai }
enum AgentKey    { agronomist plantdoctor farmplanner research }
enum SyncState   { synced unsynced }

model User {
  id            String         @id @default(cuid())
  email         String         @unique
  name          String?
  image         String?
  plan          String         @default("pro")     // mirrors UI "Pro plan"
  locale        Lang           @default(en)
  createdAt     DateTime       @default(now()) @db.Timestamptz
  updatedAt     DateTime       @updatedAt @db.Timestamptz

  conversations Conversation[]
  learning      LearningPath[]
  usage         UsageEvent[]
  accounts      Account[]
  sessions      Session[]

  @@map("users")
}

model Conversation {
  id         String         @id @default(cuid())
  userId     String
  title      String         @default("New Chat")
  lang       Lang           @default(en)
  createdAt  DateTime       @default(now()) @db.Timestamptz
  updatedAt  DateTime       @updatedAt @db.Timestamptz
  deletedAt  DateTime?      @db.Timestamptz

  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages   Message[]
  snapshots  PanelSnapshot[]

  @@index([userId, updatedAt])      // history list ordering
  @@index([userId, deletedAt])
  @@map("conversations")
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  role           MessageRole
  lang           Lang

  // user fields
  text           String?                              // user message body

  // ai fields (lossless render payload)
  agentKey       AgentKey?
  blocks         Json?                                // Block[] (Frozen §3.2)
  insight        String?                              // single insight (Frozen §3.4)
  routerReason   String?                              // explainability (MASTER Rule 9)
  routerScores   Json?                                // per-agent scores
  usedRag        Boolean      @default(false)
  usedWeb        Boolean      @default(false)

  // provenance / observability (MASTER §16.2, ARCHITECTURE §15.1 / §20)
  promptVersion  String?                              // active agent prompt version
  modelId        String?                              // generation model id
  blockRepairs   Int          @default(0)             // # repair passes applied
  aborted        Boolean      @default(false)         // turn aborted mid-stream (audit)
  syncState      SyncState    @default(synced)        // unsynced => async backfill

  createdAt      DateTime     @default(now()) @db.Timestamptz

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  citations      Citation[]
  usage          UsageEvent?

  @@index([conversationId, createdAt])                // thread render order
  @@map("messages")
}

model Citation {
  id        String  @id @default(cuid())
  messageId String
  ordinal   Int                                       // 1..N render order
  title     String                                    // Frozen §3.3
  category  String
  source    String                                    // bare domain / KB origin
  url       String?                                   // link target (not shown on card)
  chunkId   String?                                   // provenance: KB chunk if any
  webUrl    String?                                   // provenance: web result if any

  message   Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@unique([messageId, ordinal])
  @@index([messageId])
  @@map("citations")
}

model Document {
  id        String   @id @default(cuid())
  title     String
  source    String                                    // e.g. "fao.org", "agrimind.ai"
  category  String                                    // e.g. "Agronomy", "Market Data"
  lang      Lang
  origin    String   @default("kb")                  // kb | web_ingest | manual
  uri       String?                                   // canonical URL if external
  checksum  String                                    // dedupe ingest
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt @db.Timestamptz

  chunks    Chunk[]

  @@unique([source, checksum])
  @@index([lang, category])
  @@map("documents")
}

model Chunk {
  id         String   @id @default(cuid())
  documentId String
  ordinal    Int                                      // position within document
  lang       Lang                                     // denormalized for fast filter
  text       String                                   // ~280–320 tokens, ≤~1200 chars (§14.1)
  tokens     Int                                       // token count at ingest
  createdAt  DateTime @default(now()) @db.Timestamptz

  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  embedding  ChunkEmbedding?

  @@unique([documentId, ordinal])
  @@index([lang])
  @@map("chunks")
}

// Embedding vector lives in a dedicated table; the vector column is created via
// raw SQL migration (Prisma cannot express vector(N) natively).
model ChunkEmbedding {
  chunkId   String   @id
  model     String                                    // e.g. text-embedding-3-large
  dim       Int                                       // must equal EMBED_DIM
  // embedding vector(N) -> added by SQL migration (§5)
  createdAt DateTime @default(now()) @db.Timestamptz

  chunk     Chunk    @relation(fields: [chunkId], references: [id], onDelete: Cascade)

  @@map("chunk_embeddings")
}

model QueryEmbeddingCache {
  id        String   @id @default(cuid())
  queryHash String   @unique                          // hash(normText|model|dim)
  model     String
  dim       Int
  // embedding vector(N) -> SQL migration
  expiresAt DateTime @db.Timestamptz
  createdAt DateTime @default(now()) @db.Timestamptz

  @@index([expiresAt])
  @@map("query_embedding_cache")
}

model PanelSnapshot {
  id             String       @id @default(cuid())
  conversationId String
  lang           Lang
  data           Json                                 // PanelData (Frozen §3.5)
  createdAt      DateTime     @default(now()) @db.Timestamptz

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("panel_snapshots")
}

model LearningPath {
  id        String   @id @default(cuid())
  userId    String
  name      String                                    // "Foundations of Soil"
  pct       Int      @default(0)                       // 0..100 (UI progress bar)
  ordinal   Int                                        // display order
  updatedAt DateTime @updatedAt @db.Timestamptz

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, name])
  @@index([userId, ordinal])
  @@map("learning_paths")
}

model UsageEvent {
  id           String   @id @default(cuid())
  userId       String
  messageId    String?  @unique
  provider     String                                 // anthropic | openai | brave
  kind         String                                 // generation | embedding | search | insight
  inputTokens  Int      @default(0)
  outputTokens Int      @default(0)
  costUsd      Decimal  @default(0) @db.Decimal(10, 6)
  latencyMs    Int      @default(0)
  createdAt    DateTime @default(now()) @db.Timestamptz

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  message      Message? @relation(fields: [messageId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@map("usage_events")
}

// ---- Auth.js v5 adapter tables (standard) ----
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime @db.Timestamptz
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime @db.Timestamptz
  @@unique([identifier, token])
  @@map("verification_tokens")
}
```

---

## 5. pgvector setup, vector columns & indexes (raw SQL migrations)

Prisma cannot express `vector(N)` or its indexes; add them via SQL migrations placed
**after** the model migration that creates the owning tables.

### 5.1 Extension
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 5.2 Add vector columns (N = EMBED_DIM; example uses 3072)
```sql
ALTER TABLE chunk_embeddings        ADD COLUMN embedding vector(3072);
ALTER TABLE query_embedding_cache   ADD COLUMN embedding vector(3072);
```

### 5.3 Indexes
> pgvector HNSW supports up to 2000 dims for indexed columns. If `EMBED_DIM > 2000`
> (e.g. 3072), you MUST either (a) ingest at a reduced dimension ≤2000 using the
> embedding model's `dimensions` parameter (recommended: **1536**), or (b) accept
> sequential scans. **Decision:** default `EMBED_DIM = 1536` so HNSW is usable; the
> column is `vector(1536)`. The 3072 example above is illustrative only.

```sql
-- Using EMBED_DIM = 1536 (the operative default):
ALTER TABLE chunk_embeddings      ADD COLUMN embedding vector(1536);
ALTER TABLE query_embedding_cache ADD COLUMN embedding vector(1536);

-- Cosine distance HNSW index (matches retrieval operator <=>)
CREATE INDEX chunk_embeddings_hnsw
  ON chunk_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Tune query-time recall
SET hnsw.ef_search = 80;
```

**Rule:** the retrieval operator (`<=>` cosine) MUST match the index ops class
(`vector_cosine_ops`). Mismatch silently disables the index.

---

## 6. Retrieval SQL (RAG)

Language-filtered cosine search joining provenance for citations. Parameters:
`$1` = query embedding, `$2` = lang, `$3` = k.

```sql
-- Primary pass: same-language retrieval
SELECT c.id        AS chunk_id,
       c.text,
       c.lang,
       d.id        AS document_id,
       d.title,
       d.category,
       d.source,
       1 - (e.embedding <=> $1::vector) AS score
FROM chunk_embeddings e
JOIN chunks    c ON c.id = e.chunk_id
JOIN documents d ON d.id = c.document_id
WHERE c.lang = $2
ORDER BY e.embedding <=> $1::vector       -- ascending distance = most similar
LIMIT $3;
```

**Cross-lingual fallback** (only if primary returns `< MIN_HITS`): same query without
the `WHERE c.lang = $2` clause.

> **Operative RAG parameters (TASK 6 — implemented):** the retrieval service
> (`src/server/rag/rag-search.service.ts`) is the source of truth and uses **Top-K = 5**,
> **minimum cosine similarity = 0.35** (TASK 6 says 0.75, but that gate filters out every
> real match for `text-embedding-3-large`, whose relevant matches score ~0.4–0.65;
> overridable via `RAG_MIN_SIMILARITY`), **max context = 6000 chars** (context-builder),
> and chunking of **800–1200 chars with 100–200 char overlap**
> (`src/server/rag/chunk-document.ts`). These supersede the earlier illustrative
> figures (top-8 / ~280–320-token chunks) in this section. Chunks below the similarity
> threshold are dropped; if none qualify, the turn falls back to LLM knowledge (never
> blocks). Per-agent retrieval policy: agronomist/plantdoctor = always, research =
> rag-first, farmplanner = when-relevant.

**Constraints:**
- Always parameterized; never string-interpolate the embedding.
- Cap chunks per document in app layer, not SQL, to keep the index plan simple.
- `score = 1 - cosine_distance`; persist the score on retrieval logs for tuning.

---

## 7. Data-integrity & lifecycle rules

| Rule | Enforcement |
|------|-------------|
| AI message must have `agentKey`, `blocks`, `insight?` | app validation before insert; DB allows null only for `role=user` |
| `blocks` JSON conforms to Frozen §3.2 | zod parse on write + on read (defensive) |
| Citation `ordinal` unique per message, 1..N contiguous | `@@unique([messageId, ordinal])` + app check |
| Every Citation has a provenance (`chunkId` or `webUrl`) | app check; enforces no-fabrication (MASTER §4.1) |
| Embedding `dim` == EMBED_DIM | app check on ingest; CI asserts column dim |
| Conversation delete is soft | set `deletedAt`; list queries filter it out |
| `title` auto-derived from first user message (≤48 chars) | app on first turn |
| UsageEvent written per provider call | orchestrator finalize step |

---

## 8. Indexing & performance

- **History list:** `conversations(userId, updatedAt DESC)` powers the sidebar groups
  (Today/Yesterday/Last 7 days are derived in app from `updatedAt`, matching
  `HISTORY` grouping in `data.ts`).
- **Thread render:** `messages(conversationId, createdAt ASC)`.
- **Vector:** HNSW (cosine) on `chunk_embeddings.embedding` (§5.3).
- **Usage rollups:** `usage_events(userId, createdAt)` for cost dashboards.
- **Connection pooling:** use a pooler (PgBouncer / platform pooler) with a separate
  **direct** URL for migrations (`DATABASE_URL` pooled, `DIRECT_URL` for `migrate`).

---

## 9. Migrations & seeding

### 9.1 Migration policy
- Forward-only; never edit an applied migration.
- Schema model migrations via `prisma migrate`; vector columns/indexes via paired raw
  SQL migrations committed alongside.
- Release applies `prisma migrate deploy` (CI gate: `prisma validate` + a migration
  drift check).
- Dimension change (`EMBED_DIM`) = new column + backfill re-embed job + index rebuild;
  never an in-place alter of an existing populated vector column.

### 9.2 Seed data (must mirror the approved UI)
The seed script populates, in both `en` and `id`:
- **KB documents/chunks** for the five canonical domains so the suggested prompts
  (`learn/diagnose/planning/crops/market`) retrieve real grounding that matches the
  approved responses in `data.ts` (FAO soil guide, early-blight IPM, wet-season
  calendar, sandy-soil crops, chili market index, etc.).
- **LearningPath** seed rows per new user mirroring `PANEL[lang].learning`
  (Foundations of Soil 72, Plant Disease ID 40, Season Planning 15).
- **Demo user** "Tani Wijaya" (`plan = pro`) to match the UI footer/avatar.
- An initial **PanelSnapshot** equal to `PANEL[lang]` seed for first load.

**Rule:** seeds are idempotent (upsert by natural keys: `documents(source,checksum)`,
`learning_paths(userId,name)`).

---

## 10. Failure handling (data layer)

| Failure | Behavior | Escalation |
|---------|----------|-----------|
| Write of AI message fails post-stream | mark in-memory `syncState=unsynced`; enqueue retry job; user already saw the answer | alert if backfill fails ×3 |
| Embedding insert fails during ingest | skip chunk, record to `ingest_failures` log, continue document | re-run ingest for failed doc |
| Vector index missing/corrupt | retrieval falls back to seq scan (slow); health check flags it | P2 ops ticket |
| Unique conflict on citation ordinal | re-number ordinals app-side and retry once | log P2 if persists |
| Pool exhaustion | queries queue then time out (5s); orchestrator degrades turn | scale pool / investigate leak |
| Cross-tenant row detected in tests | hard fail CI; treat as security incident | block release |

**Invariant:** a data-layer failure after streaming never loses the user's answer
visually; it degrades to async backfill (`MASTER_PROMPT §7`).

---

## 11. Retention, privacy, deletion

- **User-initiated conversation delete:** soft-delete (`deletedAt`), purged by a
  retention job after 30 days.
- **Account deletion:** cascade removes conversations, messages, citations, usage,
  learning, panel snapshots (FK `onDelete: Cascade`); KB documents are **not**
  user-owned and remain.
- **Logs** store hashed `userId` and never full message bodies at info level
  (`ARCHITECTURE.md §11`).
- **KB provenance retained** so any rendered citation can be audited back to its
  `Document`/`Chunk` or web URL.

---

## 12. Acceptance criteria (data layer)

1. Reloading a conversation renders byte-identical blocks/citations/insight to the
   original stream (lossless §2.2).
2. Every persisted `Citation` has a non-null provenance (`chunkId` or `webUrl`).
3. `EMBED_DIM` equals the `vector(N)` column dim and the embedding model output dim;
   CI asserts all three agree.
4. RAG SQL returns same-language chunks first; cross-lingual only when sparse.
5. Deleting a conversation hides it from history but is reversible within retention.
6. No repository function reads user data without a `userId` filter (lint/CI check).
7. Seed produces working RAG for all five suggested prompts in both languages.

---

## 13. Tenancy enforcement & Row-Level Security (defense in depth)

Application-layer `userId` filtering (§2.1) is the primary control; **Postgres RLS is
the backstop** so a missed filter cannot leak data.

### 13.1 RLS policy (raw SQL migration)
```sql
-- Run the app under a non-superuser role that RLS applies to.
ALTER TABLE conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_paths  ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events    ENABLE ROW LEVEL SECURITY;

-- The app sets the current user per request/transaction:
--   SELECT set_config('app.user_id', $userId, true);   -- tx-local
CREATE POLICY tenant_isolation ON conversations
  USING (user_id = current_setting('app.user_id', true));

CREATE POLICY tenant_isolation ON messages
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE user_id = current_setting('app.user_id', true)));
-- analogous policies for citations (via message), panel_snapshots (via conversation),
-- learning_paths (user_id), usage_events (user_id).
```

### 13.2 Rules
- Every request opens a transaction that first runs `set_config('app.user_id', …, true)`
  from the authenticated session; Prisma queries then run inside it. This is implemented
  by `withTenant(userId, fn)` in `src/server/persistence/tenant.ts`.
- **The app MUST connect as a non-superuser role with `NOBYPASSRLS`.** Postgres
  superusers (and roles with `BYPASSRLS`) ignore RLS entirely — even `FORCE ROW LEVEL
  SECURITY` does not constrain a superuser. `DATABASE_URL`/`DIRECT_URL` therefore point
  at a dedicated `agrimind_app` role, never `postgres`. (Verified: as `postgres`, tenant
  B can read tenant A's rows; as `agrimind_app`, it cannot — see §13.3.)
- With no `app.user_id` set, the policies match `current_setting('app.user_id', true) =
  NULL`, which is never true, so the connection sees **zero** user-owned rows
  (fail-closed). Confirmed by the canary.
- KB tables (`documents`, `chunks`, `chunk_embeddings`, `query_embedding_cache`) are
  **global**, not user-scoped; RLS is not applied to them.
- A **canary probe** in CI/production asserts a query as user A cannot read user B's
  rows even with RLS as the only control (drop the app filter in the test).

### 13.3 Verified isolation matrix (non-superuser `agrimind_app`)

| Connection state | `conversations` visible | Result |
|------------------|-------------------------|--------|
| `app.user_id = userA` | userA's only | ✅ owner sees own |
| `app.user_id = userB` | 0 of userA's | ✅ cross-tenant blocked |
| `app.user_id` unset | 0 | ✅ fail-closed |
| connected as `postgres` (superuser) | all | ⚠️ RLS bypassed — never connect as superuser |

---

## 14. Knowledge-base ingestion pipeline

The KB is the grounding substrate; ingestion correctness is a first-class concern.

### 14.1 Stages
```
ingest(documentInput):
  1. NORMALIZE   clean text, detect/confirm lang, compute checksum
  2. DEDUPE      upsert documents by (source, checksum); skip if unchanged
  3. CHUNK       split to ~280–320 tokens (~1,100–1,300 chars), ~60-token overlap,
                 on sentence boundaries; never split mid-sentence; record ordinal.
                 Chunk size is deliberately aligned to the ≤1,200-char injection cap
                 (ARCHITECTURE §6.2) so retrieval injects whole chunks, not truncated
                 fragments. A chunk that still exceeds 1,200 chars after sentence-
                 boundary splitting is trimmed at injection time, not silently here.
  4. EMBED       OpenAI text-embedding-3-large @ EMBED_DIM (batched ≤ 96/req)
  5. STORE       insert chunks + chunk_embeddings in ONE transaction per document
  6. VERIFY      assert every chunk has an embedding of dim == EMBED_DIM
  7. INDEX       (bulk loads) build/refresh HNSW after large batches (§15.3)
```

### 14.2 Rules & constraints
- **Atomicity per document:** a document is either fully ingested (all chunks + all
  embeddings) or rolled back; no partially embedded documents (would yield un-citable
  retrieval). Failures recorded in an `ingest_failures` log with reason.
- **Idempotency:** re-ingesting unchanged content (same checksum) is a no-op.
- **Provenance is mandatory:** every chunk's parent document MUST have `title`,
  `source`, `category`, `lang` so retrieval can always form a `Citation` (§7).
- **Lang correctness:** mis-tagged language poisons retrieval; ingestion runs a
  language detector and flags mismatches between declared and detected lang for review.
- **Web-ingested docs** (`origin = web_ingest`) follow the same path but carry the
  `uri` and a fetch timestamp; they are eligible for staleness expiry.

### 14.3 Ingestion failure handling
| Failure | Action |
|---------|--------|
| Embedding batch error | retry ×2; on persistent fail, roll back the document, log `ingest_failures` |
| Chunk with 0 tokens / junk | skip chunk, continue; if >50% junk, fail the document |
| Dim mismatch vs EMBED_DIM | hard fail ingestion (config/model drift) — never store wrong-dim vectors |
| Duplicate (source,checksum) | skip (idempotent no-op) |

---

## 15. Index maintenance & vacuum

### 15.1 HNSW lifecycle
- Build the HNSW index **after** the initial bulk seed/ingest, not before (faster build,
  better graph). Incremental inserts update the index automatically.
- Periodic `REINDEX` (or rebuild into a new index + swap) after large re-embeds or if
  recall on the golden set drops below 0.85 (`MASTER_PROMPT §13.2`).

### 15.2 Autovacuum & bloat
- `messages`, `usage_events`, and `panel_snapshots` are append-heavy; ensure autovacuum
  is tuned (lower `autovacuum_vacuum_scale_factor` on these) to avoid bloat.
- Soft-deleted conversations are purged by the retention job (§11), then vacuumed.

### 15.3 Bulk-load discipline
For large KB loads: insert chunks/embeddings, then build the index once; do not stream
millions of single inserts through a live HNSW index. Run during a maintenance window;
recall is verified against the golden set before the index is promoted.

---

## 16. Connection management, timeouts & query budgets

### 16.1 Pooling (mirrors ARCHITECTURE.md §16.4)
- App uses a **pooled** `DATABASE_URL` (PgBouncer transaction pooling). Migrations use
  a **direct** `DIRECT_URL`.
- Pool sizing rule: `app_instances × prisma_pool_size ≤ postgres_max_connections − reserve`.
  Keep a reserve (≥10) for migrations/admin.

### 16.2 Statement timeouts (per workload)
| Workload | `statement_timeout` |
|----------|---------------------|
| Interactive read (history list, thread load) | 5s |
| RAG vector query | 3s (bounded k + HNSW; alert if exceeded) |
| Writes (message/citation insert) | 5s |
| Ingestion / re-embed batch | 60s |
Set per-transaction via `SET LOCAL statement_timeout`. A vector query exceeding its
budget is a P2 signal that the index is unhealthy (§15.1).

### 16.3 Hot-path query rules
- The RAG query (§6) and the thread-load query are the two hot paths; both are covered
  by indexes (HNSW; `messages(conversationId, createdAt)`). Any new hot query MUST ship
  with its supporting index in the same migration.

---

## 17. Re-embedding & backfill runbook (operational)

Triggered by: embedding model change, dimension change, or KB-wide re-chunk. This is a
**migration**, never a config swap (`MASTER_PROMPT §16.2`).

### 17.1 Procedure (zero-downtime, expand/contract)
```
1. ADD COLUMN embedding_next vector(NEW_DIM) on chunk_embeddings (nullable).
2. BACKFILL: job re-embeds all chunks with the new model into embedding_next,
   batched, resumable (track last processed chunk id), idempotent.
3. VERIFY: 100% of chunks have embedding_next of NEW_DIM; recall on golden set ≥ 0.85
   using a temporary index on embedding_next.
4. BUILD HNSW index on embedding_next; SET hnsw.ef_search.
5. CUTOVER: switch retrieval to embedding_next + new model (config flag), monitor.
6. CONTRACT: after a soak period, DROP old embedding column + index; rename
   embedding_next -> embedding.
```

### 17.2 Rules
- Retrieval NEVER mixes dims/models: until cutover, queries use the old column with the
  old model; after cutover, the new. The query embedding model is switched atomically
  with the retrieval column.
- The backfill is interruptible/resumable; a crash mid-backfill loses no progress.
- Roll back = keep using the old column (still present until step 6).

### 17.3 Failure handling
| Failure | Action |
|---------|--------|
| Backfill stalls | resume from checkpoint; alert if throughput < threshold |
| Recall regresses post-build | abort cutover, keep old column, investigate chunking/model |
| Cost overrun on re-embed | throttle batch rate; re-embeds are scheduled off-peak |

---

## 18. Migration safety rules (consolidated)

1. Forward-only; never edit an applied migration.
2. Expand/contract for any destructive change (`ARCHITECTURE.md §17.2`): add new, deploy
   code, backfill, verify, then drop old — across separate releases.
3. Every migration that adds a hot query path adds its index in the same migration.
4. Vector columns/indexes are created via paired raw-SQL migrations committed with the
   model migration.
5. `prisma migrate deploy` runs pre-deploy on `DIRECT_URL`; failure halts rollout.
6. A dimension/model change follows the §17 runbook, never an in-place `ALTER` of a
   populated vector column.
7. CI runs `prisma validate` + a drift check (`migrate diff`) and fails on drift.
