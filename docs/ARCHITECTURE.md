# ARCHITECTURE.md — AgriMind AI System Architecture

> Governed by `MASTER_PROMPT.md`. This document specifies services, data flow,
> resilience, and observability. It does not redefine Frozen Contracts; it implements
> beneath them. UI is authoritative and untouched.

---

## 1. Architectural overview

AgriMind AI is a **single Next.js 15 (App Router) application** that hosts both the
approved client UI and the server-side AI pipeline as Route Handlers. There is no
separate backend service in v1; the "backend" is the set of server modules under
`src/server/**` invoked by API routes. State durability is PostgreSQL (with pgvector)
via Prisma. External intelligence comes from Claude (generation), OpenAI (embeddings
only), and Brave (web search).

### 1.1 Layer diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT (frozen UI)  src/components/* + src/hooks/use-agrimind.ts      │
│   renders blocks/citations/insight, drives SSE reveal                 │
└───────────────▲───────────────────────────────────────────┬──────────┘
                │ SSE (event protocol, MASTER_PROMPT §3.6)    │ fetch POST
┌───────────────┴───────────────────────────────────────────▼──────────┐
│ ROUTE HANDLERS  src/app/api/*                                          │
│   /api/chat (stream)  /api/conversations  /api/auth/*  /api/health     │
└───────────────▲───────────────────────────────────────────┬──────────┘
                │                                             │
┌───────────────┴─────────────────────────────────────────────────────┐
│ SERVER CORE  src/server/*                                             │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐    │
│  │Orchestrator│→ │  Router  │→ │  Agents  │→ │ Context Assembler │    │
│  └─────┬──────┘  └──────────┘  └────┬─────┘  └─────────┬─────────┘    │
│        │                            │                  │              │
│        │             ┌──────────────┼──────────────────┤              │
│        ▼             ▼              ▼                  ▼              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐      ┌──────────────┐      │
│  │ Insight  │  │RAG Service│  │WebSearch │      │ Claude Client│      │
│  │Generator │  │(pgvector) │  │ (Brave)  │      │  (stream)    │      │
│  └──────────┘  └─────┬─────┘  └────┬─────┘      └──────────────┘      │
│                      │             │                                  │
│                ┌─────▼─────┐  ┌────▼─────┐                            │
│                │OpenAI embed│  │ fetcher  │                            │
│                └───────────┘  └──────────┘                            │
└───────────────▲───────────────────────────────────────────┬──────────┘
                │ Prisma                                      │
┌───────────────┴───────────────────────────────────────────▼──────────┐
│ POSTGRES + pgvector   (see DATABASE.md)                                │
│   users, conversations, messages, citations, documents, chunks,       │
│   chunk_embeddings, usage_events, panel_snapshots                      │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.2 Module layout (prescriptive)

```
src/
  app/
    api/
      chat/route.ts                 # POST: SSE streaming chat endpoint
      conversations/route.ts        # GET list, POST create
      conversations/[id]/route.ts   # GET messages, DELETE
      auth/[...nextauth]/route.ts   # Auth.js v5 handler
      health/route.ts               # liveness + dependency checks
    page.tsx                        # server wrapper -> <AgrimindApp/> (existing)
  server/
    orchestrator/
      orchestrator.ts               # lifecycle owner (MASTER_PROMPT §5)
      sse.ts                        # SSE event encoder (Frozen protocol)
      budget.ts                     # token/tool/time budgets (§8 master)
    router/
      router.ts                     # agent selection + reason
      rules.ts                      # keyword/intent heuristics
    agents/
      base-agent.ts                 # shared agent contract
      agronomist.ts plantdoctor.ts farmplanner.ts research.ts
      registry.ts                   # AgentKey -> agent
      prompts/                      # per-agent system prompt builders
    rag/
      rag-service.ts                # retrieve(query,lang) -> RankedChunk[]
      embed.ts                      # OpenAI embeddings (cache-aware)
      rank.ts                       # similarity + MMR rerank
    search/
      web-search.ts                 # Brave adapter (provider interface)
      fetcher.ts                    # url fetch + readability extract
    context/
      assembler.ts                  # merge RAG+web -> grounded context
      citations.ts                  # used-sources -> Citation[]
    llm/
      claude.ts                     # streaming + tool-less generation
      block-parser.ts               # model output -> Block[] (repairable)
      repair.ts                     # coerce invalid output to valid blocks
    insight/
      insight-generator.ts          # one insight per answer
      panel.ts                      # right-panel context computation
    persistence/
      conversations.ts messages.ts usage.ts
    observability/
      logger.ts metrics.ts trace.ts
    config/
      env.ts                        # zod-validated env (fail fast)
      limits.ts                     # budgets from MASTER_PROMPT §8
  lib/                              # EXISTING frozen UI data/types
  components/ hooks/                # EXISTING frozen UI
```

**Rule:** API routes contain no domain logic. They authenticate, validate input
(zod), and delegate to `src/server/orchestrator`. All intelligence lives in
`src/server/*`, which is independently unit-testable without HTTP.

---

## 2. Runtime, boundaries, and rendering strategy

| Concern | Decision | Rationale |
|---------|----------|-----------|
| App Router rendering | `page.tsx` is a Server Component wrapper rendering the client `AgrimindApp` | Already implemented; avoids the Windows client-manifest failure (see project history) |
| Chat endpoint runtime | **Node.js runtime** (`export const runtime = "nodejs"`) | Prisma + pgvector + streaming SDKs need Node, not Edge |
| Streaming | SSE via `ReadableStream` in the Route Handler | Matches Frozen event protocol; no websocket infra |
| Auth | Auth.js v5, JWT session strategy | Per-user tenancy (MASTER_PROMPT decision) |
| Secrets | Server-only env, zod-validated at boot | Fail fast; never expose keys to client |

**Boundary rule:** nothing under `src/server/**` may be imported by a Client
Component. Enforce with an ESLint `no-restricted-imports` rule on `@/server/*` from
`"use client"` files.

---

## 3. Orchestrator — responsibilities, workflow, constraints

### 3.1 Responsibilities
- Own the request lifecycle exactly as defined in `MASTER_PROMPT §5`.
- Authenticate context is present; resolve `userId`, `conversationId`, `lang`.
- Acquire and enforce the per-turn budget (`budget.ts`).
- Drive the SSE stream; guarantee event ordering (`meta` first, `done` last).
- Persist user message before generation, AI message after stream completes.
- Convert any internal failure into a graceful, renderable outcome.

### 3.2 Canonical workflow (pseudocode contract)

```ts
async function handleChat(req): SSEStream {
  const { userId } = await requireSession(req);            // else 401
  const { conversationId, text, lang } = parseChatInput(req); // zod; else 400
  const budget = newBudget(LIMITS);                        // MASTER_PROMPT §8
  const convo = await ensureConversation(userId, conversationId, lang);

  const userMsg = await messages.insertUser(convo.id, text, lang);

  return sse(async (emit) => {
    const t = budget.startTimer();
    try {
      const { agentKey, reason, scores } = router.select(text, lang);
      emit.meta({ messageId: nextId(), agentKey, lang });          // step 3

      const plan = agents.get(agentKey).plan(text, lang, budget);  // step 4
      const rag  = plan.useRag  ? await ragService.retrieve(text, lang, budget) : [];
      const web  = plan.useWeb  ? await webSearch.run(text, lang, budget)       : [];

      const context = assembler.build({ text, lang, rag, web, budget }); // step 7
      const stream  = agents.get(agentKey).generate(context, budget);    // step 8

      const blocks = await pipeBlocks(stream, emit, budget);             // step 9 (reveal)
      const citations = citationsFrom(context.used);                     // step 10
      emit.citations({ citations });

      const insight = await insightGen.run(blocks, context, lang, budget); // step 11
      emit.insight({ insight });

      const aiMsg = await messages.insertAi(convo.id, {
        agentKey, blocks, citations, insight, usage: budget.usage(), routerReason: reason,
      });                                                                // step 12
      await panel.recompute(convo.id, lang).catch(logSwallow);          // step 13 (non-blocking)
      emit.done({ messageId: aiMsg.id, usage: budget.usage() });        // step 14
    } catch (e) {
      await degradeOrFail(e, emit, lang, budget);   // MASTER_PROMPT §7
    } finally { t.stop(); }
  });
}
```

### 3.3 Constraints
- MUST emit `meta` before any `block`. Violation breaks the thinking→bubble agent
  identity in the UI.
- MUST NOT block `done` on panel recompute (step 13 is best-effort/async).
- MUST persist `routerReason` and `scores` for explainability (`MASTER_PROMPT §4.9`).
- MUST close the SSE stream on all paths (success, degrade, abort) — no dangling
  connections.

### 3.4 Failure handling (orchestrator-level)
| Condition | Action |
|-----------|--------|
| No session | Return 401 before opening stream |
| Invalid body | Return 400 before opening stream |
| Exception after stream opened | `degradeOrFail`: emit best-effort `h+p` answer in `lang`, then `error` if nothing renderable, then `done` |
| Hard timeout (60s) | Abort generation, emit partial blocks already sent + `error{retryable:true}` |

---

## 4. Router — agent selection

### 4.1 Responsibilities
Deterministically select one of the four agents and produce an explainable `reason`
and per-agent `scores`. The router is **fast and cheap**: it does not call Claude.

### 4.2 Decision framework (ordered)
1. **Explicit prompt-card origin.** If the turn originated from a suggested prompt
   (`promptKey` present), use that prompt's declared agent (matches existing
   `_agentFor` in `use-agrimind.ts`). This is the highest-precedence signal.
2. **Intent heuristics** (`rules.ts`): weighted keyword/regex signals per agent —
   - plantdoctor: symptom/disease lexicon ("yellow", "spots", "wilting", "rot",
     "pest", "fungus", ID equivalents).
   - farmplanner: planning lexicon ("calendar", "schedule", "season", "rotation",
     "when to plant").
   - research: market/economics lexicon ("price", "market", "profit", "worth",
     "demand", "cost").
   - agronomist: soil/crop/method lexicon and **default**.
3. **Tie/þlow-confidence break:** if top-2 scores are within `0.15`, prefer the more
   specific agent (plantdoctor > research > farmplanner > agronomist) only when its
   lexicon matched at all; else fall back to agronomist.
4. **Fallback:** no signal → `FALLBACK.agent = agronomist` (Frozen, see `data.ts`).

### 4.3 Constraints
- Pure function of `(text, lang, promptKey)`; no I/O, no randomness.
- Output `agentKey` MUST be a valid `AgentKey`.
- `reason` is a short human string persisted with the message.
- The router never selects "no agent"; there is always exactly one.

### 4.4 Escalation
The router does not escalate; it always resolves. Escalation (deferral language) is a
**content** behavior owned by the selected agent (`MASTER_PROMPT §10`).

---

## 5. Agents (architectural view)

Agents are specified behaviorally in `AGENTS.md`. Architecturally, every agent
implements one interface and is otherwise a black box to the orchestrator:

```ts
interface Agent {
  key: AgentKey;
  plan(text: string, lang: Lang, budget: Budget): TurnPlan;     // tool needs
  generate(ctx: GroundedContext, budget: Budget): AsyncIterable<RawDelta>;
  // safety hooks (AGENTS.md §7) applied inside generate/repair
}
interface TurnPlan { useRag: boolean; useWeb: boolean; reason: string }
```

**Constraint:** an agent may only use tools its allowlist permits (`AGENTS.md §5`).
The orchestrator enforces the allowlist; an agent requesting a disallowed tool is a
defect, and the orchestrator drops the request and logs it.

---

## 6. RAG Service (pgvector)

### 6.1 Responsibilities
Turn a query into a ranked, language-appropriate set of grounded chunks with their
source metadata for citation.

### 6.2 Workflow
```
retrieve(query, lang, budget):
  1. normalize(query)                     // trim, collapse ws, lowercase fold
  2. qVec = embed(query)                  // OpenAI text-embedding-3-large, cache-checked
  3. rows = vectorSearch(qVec, lang, k=24)// pgvector cosine, lang-filtered
  4. if rows.length < MIN_HITS (=3):
        rows += vectorSearch(qVec, lang=ANY, k=24)   // cross-lingual fallback (RAG decision)
  5. ranked = mmrRerank(rows, qVec, lambda=0.5, take=8)  // diversity-aware
  6. trim each chunk to <=1200 chars on sentence boundary
  7. return RankedChunk[] (chunkId, docId, title, category, source, lang, score, text)
```

### 6.3 Embedding rules
- Model: **OpenAI `text-embedding-3-large`**, fixed dimensionality across ingestion
  and query (`DATABASE.md §5` defines the column dimension; ingestion and query MUST
  match it exactly).
- **Embedding cache:** hash(normalized text + model + dim) → reuse stored vector. Cache
  both ingestion and query embeddings (`chunk_embeddings` for chunks; a small
  `query_embedding_cache` for hot queries, TTL 24h).
- Query and document embeddings use the **same model**. Never mix models/dims.

### 6.4 Ranking rules
- Primary: cosine similarity (pgvector `<=>`).
- Diversity: MMR rerank to avoid 8 near-duplicate chunks from one document.
- Cap per-document chunks to **3** so one source can't dominate citations.

### 6.5 Constraints
- Language filter is mandatory on the first pass; cross-lingual is fallback only.
- Never inject a chunk whose source can't be turned into a `Citation` (must have
  `title`, `category`, `source`).
- Deterministic given the same DB state and query (no randomness in ranking).

### 6.6 Failure handling
| Failure | Action |
|---------|--------|
| Embedding API error | retry ×2 backoff → skip RAG this turn, log `rag_degraded` |
| 0 chunks after fallback | return `[]`; orchestrator relies on web/method-level answer |
| pgvector query error | log P1, return `[]`, do not crash the turn |

---

## 7. Web Search Service (Brave)

### 7.1 Responsibilities
Provide fresh, citable evidence for time-sensitive questions (markets, current
advisories) that the static KB cannot cover. Used primarily by the Research Agent and
selectively by others.

### 7.2 Provider interface (swappable, Brave is default)
```ts
interface WebSearchProvider {
  search(query: string, lang: Lang, opts: { count: number }): Promise<WebResult[]>;
}
interface WebResult { title: string; url: string; snippet: string; source: string; publishedAt?: string }
```
Default adapter: **Brave Search API** (`GET https://api.search.brave.com/res/v1/web/search`).
Keep the interface so Tavily/Bing can be swapped without touching agents.

### 7.3 Workflow
```
run(query, lang, budget):
  1. results = brave.search(query, lang, {count:5})
  2. dedupe by registrable domain + title similarity
  3. select top 2 by (relevance, recency) for full fetch
  4. fetch(url) -> readability extract -> trim to <=1200 chars
  5. for the rest, keep snippet only
  6. return WebEvidence[] (title, source=domain, url, text, publishedAt)
```

### 7.4 Constraints
- Respect robots/ToS; set a descriptive User-Agent; 6s fetch timeout per URL.
- Never fetch more than 2 full pages per turn (budget §8).
- A web source becomes a `Citation` with `category` inferred ("Market Data",
  "Advisory", "News") and `source` = bare domain. **No fabricated domains.**
- Web evidence is clearly tagged in context as `[WEB]` vs KB `[KB]` so the agent can
  weight freshness vs. authority.

### 7.5 Failure handling
| Failure | Action |
|---------|--------|
| Brave 429/5xx | retry ×1; then continue **RAG-only**, log `web_degraded` |
| Fetch timeout | drop that URL, keep snippet, continue |
| All results junk | return `[]`; agent answers from KB/method only |

---

## 8. Context Assembler & Citations

### 8.1 Responsibilities
Merge KB + web evidence into one grounded context block under the token budget, and
record exactly which sources were *used* so citations are truthful.

### 8.2 Assembly order (priority for trimming)
1. User message (never trimmed).
2. Safety-critical instructions (never trimmed).
3. Top KB chunks (authority) + top web evidence (freshness), interleaved by rank.
4. Lower-rank sources — **first to be dropped** when over budget.

Each injected source carries a stable local id (`S1..Sn`) the model references. After
generation, `citations.ts` maps the source ids the answer actually leaned on (by an
explicit "used sources" trailer the agent emits, validated against available ids) to
`Citation[]`. Unused sources are **not** rendered as cards.

### 8.3 Constraints
- Truthful-citation rule (MASTER_PROMPT §4.1) is enforced here: a `Citation` is only
  produced from a real `S#` that was in context.
- Citation count rendered == sources used (drives "Sources · N" header).
- Ordering of cards = ranking order, numbered `1..N`.

---

## 9. Resilience: retries, timeouts, circuit breakers

### 9.1 Per-dependency policy
| Dependency | Timeout | Retries | Backoff | Breaker |
|------------|---------|---------|---------|---------|
| Claude (stream) | 60s hard | 2 on 429/503 | 0.5s,2s jitter | open 30s after 5 consecutive fails |
| OpenAI embeddings | 10s | 2 | 0.5s,2s | open 30s after 5 fails |
| Brave search | 6s | 1 | 1s | open 60s after 5 fails |
| URL fetch | 6s/url | 0 | — | per-domain soft skip |
| Postgres | 5s/query | 1 on transient | 0.2s | rely on pool health |

### 9.2 Circuit-breaker behavior
- Claude open → return graceful degraded answer for the turn from already-assembled
  context is impossible (Claude is generation); instead emit `error{retryable:true}`
  and surface the inline retry affordance. Do **not** fall back to OpenAI generation
  (OpenAI is embeddings-only per charter decision).
- Embeddings/Brave open → skip that tool (RAG-only or KB-only), continue.

### 9.3 Idempotency & double-send
- Composer is locked while `thinking` (existing UI behavior) — the first line of
  defense against accidental double-send.
- Server-side idempotency dedupes a turn by `Idempotency-Key` (fallback
  `clientNonce`) for a **10-minute** window; the authoritative mechanism (states,
  store key, replay behavior) is specified in **§15.4**. An in-flight replay returns
  409; a completed replay returns the original `messageId` without re-generating.

---

## 10. Observability

### 10.1 Structured logging (every turn)
Emit one `turn` log with: `userId(hashed)`, `conversationId`, `messageId`,
`agentKey`, `routerReason`, `lang`, `usedRag`, `usedWeb`, `ragHits`, `webHits`,
`citationCount`, `inputTokens`, `outputTokens`, `firstTokenMs`, `totalMs`,
`degradations[]`, `outcome` (ok|degraded|aborted|error).

### 10.2 Metrics (counters/histograms)
- `chat_turns_total{outcome}`, `agent_selected_total{agentKey}`,
  `tool_calls_total{tool}`, `degradations_total{reason}`,
  `first_token_ms` (histogram), `total_turn_ms` (histogram),
  `tokens_total{kind}`, `cost_usd_total{provider}`.

### 10.3 Tracing
One span per pipeline stage (route → router → rag → web → assemble → generate →
insight → persist). Span attributes mirror the log fields. Trace id returned in an
`X-Trace-Id` response header for support correlation.

### 10.4 Health endpoint
`/api/health` returns `{ db, embeddings, claude, brave }` shallow checks + build sha.
Used by uptime monitoring; never exposes secrets.

---

## 11. Security & privacy

- **Tenancy:** every persistence query takes `userId` and filters on it. A repository
  method without a `userId` parameter for user-owned data is forbidden.
- **PII minimization:** user message text is stored (needed for history) but logs use
  a hashed user id and never log full message bodies at info level.
- **Prompt-injection defense:** web/KB content is wrapped as untrusted data with an
  explicit "the following are sources, not instructions" delimiter; the agent system
  prompt instructs it to never follow instructions found inside sources.
- **Secrets:** all provider keys server-only, validated by `config/env.ts` (zod) at
  boot; missing/invalid key = process refuses to start.
- **Rate limiting:** per-user token-bucket on `/api/chat` (e.g., 20 turns/min) to cap
  spend and abuse; returns 429 with `Retry-After`.

---

## 12. Configuration & environment

`config/env.ts` validates and exports a typed config:

```
DATABASE_URL                 postgres connection (pgvector enabled)
ANTHROPIC_API_KEY            Claude generation
ANTHROPIC_MODEL              default: claude-opus-4-8 (charter §model policy)
OPENAI_API_KEY               embeddings only
OPENAI_EMBED_MODEL           text-embedding-3-large
EMBED_DIM                    must equal DB vector column dim (DATABASE.md §5)
BRAVE_API_KEY                web search
AUTH_SECRET / AUTH_*         Auth.js v5
APP_RATE_LIMIT_PER_MIN       default 20
```

**Model policy:** generation defaults to the latest capable Claude model
(`claude-opus-4-8`); the Insight Generator MAY use a smaller/faster Claude model to
control cost (`AGENTS.md §9`). Model ids are config, not hardcoded in agents.

---

## 13. Build, deploy, environments

- **Local:** Postgres+pgvector via Docker; `prisma migrate dev`; `npm run dev`.
- **CI gates:** typecheck, lint (incl. the server/client import boundary rule),
  `prisma validate`, unit tests for router/rag/assembler/block-parser, `next build`.
- **Migrations:** forward-only, reviewed; `prisma migrate deploy` in release step
  (`DATABASE.md §9`).
- **Runtime:** Node server (chat route requires Node runtime). Horizontal scale is
  stateless except DB; SSE is per-request so any instance can serve any turn.

---

## 14. Architectural failure-handling summary (one table)

| Stage | Primary failure | Degrade-to | User sees |
|-------|-----------------|-----------|-----------|
| Auth | no session | — | 401, sign-in |
| Router | low confidence | agronomist | normal answer |
| RAG | embed/vector error | skip RAG | fewer/zero KB cards |
| Web | provider/fetch error | skip web | KB-only cards |
| Assemble | over budget | drop low-rank sources | possibly fewer cards |
| Generate | Claude 429/5xx | retry → error event | inline retry |
| Blocks | invalid shape | repair pass → minimal h+p | always renderable |
| Insight | gen error | omit insight gracefully (still emit `done`) | answer w/o extra insight (rare) |
| Persist | write fails | async retry, flag unsynced | answer shown, history backfills |

The invariant across all stages (MASTER_PROMPT §7): **degrade upward, never emit an
un-renderable or un-disclaimed-unsafe answer, always close the stream.**

---

## 15. Concurrency, cancellation & the streaming model

### 15.1 The turn as a cancellable unit
Each turn runs under a single `AbortController` (`turn.signal`) owned by the
orchestrator. Every async leaf (embed, vector query, Brave search, URL fetch, Claude
stream, DB write) receives `turn.signal` and MUST abort promptly when it fires.

**Cancellation sources (any aborts the whole turn):**
- Client disconnects (SSE socket closed) → detected via the response stream's `close`
  event → abort generation immediately (stop Claude billing).
- Hard timeout (60s) → abort, emit best-effort partial + `error{code:timeout}`.
- Server shutdown (SIGTERM) → drain: stop accepting new turns, let in-flight turns
  finish up to a 20s grace, then abort remaining with `error{retryable:true}`.

**Rule:** a cancelled turn MUST release the Claude stream (so we stop paying for
tokens) and MUST NOT persist a partial AI message as `done`; if blocks were already
delivered, persist with `syncState=unsynced` and `aborted=true` for audit, never as a
clean answer.

### 15.2 SSE backpressure & flow control
- The Route Handler writes to a `ReadableStream` controller. If `controller.desiredSize`
  is ≤ 0, the consumer is slow; the producer awaits drain rather than buffering
  unbounded deltas in memory.
- Per-connection outbound buffer cap: 256 KB. Exceeding it (stuck client) aborts the
  turn with `error` and closes — protects server memory.
- Heartbeat `: ping` every 15s (MASTER_PROMPT §3.6) keeps intermediaries open and lets
  the server detect dead sockets via write failure.

### 15.3 Per-instance concurrency limits
- A semaphore caps **concurrent in-flight Claude generations per instance** (default 50)
  to bound memory and provider concurrency. Over the cap → new turns queue ≤2s then
  return `429 rate_limited` (load-shed before opening a stream).
- Per-user concurrency cap (2 in-flight, MASTER_PROMPT §15.1) is enforced via a short
  TTL key in the rate-limit store (§16.2), independent of instance.

### 15.4 Idempotency internals
- Key = `Idempotency-Key` header (fallback `clientNonce`). Stored in the rate-limit
  store as `idemp:{userId}:{key}` → `{state: inflight|done, messageId?}` TTL 10min.
- `inflight` replay → 409. `done` replay → 200 with `{messageId}` reference and no new
  generation. First-seen → set `inflight`, proceed, set `done` on terminal event.

---

## 16. Scalability & capacity

### 16.1 Statelessness & horizontal scale
App instances are stateless except for: (a) Postgres, (b) the shared rate-limit/idemp
store (Redis or equivalent). Any instance serves any turn; SSE is per-request so no
sticky sessions are required. Scale out on CPU + concurrent-stream count.

### 16.2 Shared state store (Redis)
Introduced for cross-instance correctness:
- Rate-limit token buckets (per-user/min, per-day), spend meters, concurrency keys.
- Idempotency records (§15.4).
- Optional hot query-embedding cache (mirrors `query_embedding_cache`, faster).
Failure mode: if Redis is unavailable, **fail safe, not open** — fall back to a
conservative in-process limiter (lower limits) so we never lose abuse/cost protection.

### 16.3 Capacity model (planning inputs)
Per turn (typical): 1 embedding call, 0–1 Brave search, 0–2 URL fetches, 1 Claude
generation (streamed), 1 insight call, ~5 DB statements. Cost/latency dominated by
Claude generation. Plan capacity by **concurrent streams**, not RPS:
`instances ≈ peak_concurrent_streams / 50` (the per-instance cap), rounded up with
headroom. The DB connection pool (§16.4) and provider rate limits are the next
bottlenecks.

### 16.4 Database scaling
- Pooled connections via PgBouncer (transaction pooling); separate `DIRECT_URL` for
  migrations. Pool size sized to `instances × per-instance-pool ≤ Postgres max_conns`.
- Read-heavy history endpoints may use a read replica; chat writes go to primary.
- pgvector retrieval is the heaviest query; keep HNSW `ef_search` tuned (`DATABASE.md`)
  and cap k. If KB grows past a single node's comfort, partition KB by `lang` and/or
  shard by domain category before considering a dedicated vector DB.

### 16.5 Provider quota management
Track provider-side rate limits (Anthropic/OpenAI/Brave) as configured ceilings; the
breaker (§9) + per-instance semaphore keep us under them. A `provider_saturation`
metric drives autoscaling and, at the limit, graceful global degrade (KB-only,
MASTER_PROMPT §15.2).

### 16.6 Caching layers (allowed, must not change rendered output)
- Query-embedding cache (24h) and KB-chunk embeddings (persistent).
- Per-conversation panel snapshot (avoid recompute on every load).
- **No answer caching by default** (answers are user/context specific); if ever added,
  it must key on `(normalizedText, lang, agentKey, kbVersion)` and never serve another
  user's answer.

---

## 17. Deployment, rollout & rollback

### 17.1 Pipeline
`CI (gates, MASTER_PROMPT §17)` → build image → deploy to `staging` → smoke + golden +
visual-regression → promote to `production` (canary → full).

### 17.2 Database migrations vs. code (ordering)
- **Expand/contract pattern.** Additive migrations deploy *before* the code that uses
  them; destructive migrations (drop column) deploy *after* all code that referenced
  them is gone. Never deploy a destructive migration in the same release as the code
  change that stops using it.
- `prisma migrate deploy` runs as a pre-deploy step using `DIRECT_URL`; rollout halts
  if it fails.

### 17.3 Canary & rollback
- Canary a new revision to ~10% of traffic; watch first-token p95, 5xx rate,
  block-repair rate, citation-truthfulness alarms for 15 min before full rollout.
- **Rollback = redeploy previous image.** Because migrations follow expand/contract,
  the previous image is always compatible with the current schema. Prompt/model
  regressions roll back via config (`promptVersion`/`modelId`) without a redeploy.

### 17.4 Zero-downtime & draining
SIGTERM → stop accepting new turns (health goes `draining`) → finish in-flight up to
20s → exit. Load balancer removes draining instances before kill.

---

## 18. Secrets, key management & rotation

- All provider keys and `AUTH_SECRET` live in the platform secret manager, injected as
  env at boot; never in the repo, image, or client bundle.
- `config/env.ts` (zod) validates presence/shape at boot; a missing/invalid secret
  **fails startup** (no degraded boot with placeholder keys).
- **Rotation:** support two valid keys per provider during rotation windows (primary +
  next) so keys roll without downtime; remove the old key after the window.
- `AUTH_SECRET` rotation invalidates sessions gracefully (JWT re-sign on next request).
- Secret access is audited; a suspected leak is a **P0** (MASTER_PROMPT §13.1): rotate
  immediately, invalidate sessions, review access logs.

---

## 19. Disaster recovery & data durability

| Concern | Policy |
|---------|--------|
| Postgres backups | automated daily snapshot + PITR (WAL); **RPO ≤ 5 min, RTO ≤ 1 h** |
| Backup restore drills | quarterly restore to a scratch env; verified by a checksum of seeded golden rows |
| KB/vector rebuild | KB documents are the source of truth; embeddings are derivable — a full re-embed job (`DATABASE.md §9`) reconstructs `chunk_embeddings` from `chunks` |
| Redis loss | non-durable by design; on loss, limiters reset to conservative defaults (§16.2), idempotency window resets (rare double-send absorbed by `clientNonce` dedupe) |
| Region outage | single-region in v1; documented as accepted risk. Multi-region is future work and would require DB replication + a regional vector store strategy |
| Provider outage (Claude) | no generation fallback (charter decision: OpenAI is embeddings-only); surface `upstream_unavailable` + inline retry; status page updated |

**Recovery invariant:** conversations, messages, and citations are fully recoverable
from Postgres backups; the vector store is fully **re-derivable** and is therefore not
on the critical backup path beyond convenience.

---

## 20. Observability deep-dive (operational)

### 20.1 The canonical `turn` log (one per turn, schema)
```
{ ts, level, event:"turn", traceId, userIdHash, conversationId, messageId,
  agentKey, routerReason, routerScores, lang, promptVersion, modelId,
  usedRag, usedWeb, ragHits, webHits, citationCount, blockRepairs,
  moderation:{in:"pass|block", out:"pass|block"},
  inputTokens, outputTokens, insightTokens, costUsd,
  firstTokenMs, totalMs, degradations:[...], outcome:"ok|degraded|aborted|error",
  errorCode? }
```
Message bodies are NOT in this log (PII discipline, MASTER_PROMPT §13). `userIdHash`
is a salted hash.

### 20.2 Alerts (page/ticket thresholds)
| Alert | Condition | Sev |
|-------|-----------|-----|
| Citation-truthfulness breach | any card without a used source (assertion in mapper) | P0 page |
| Cross-tenant access | any query returns a row with foreign userId (test/canary probe) | P0 page |
| Chat 5xx rate | > 2% over 5 min | P1 page |
| First-token p95 | > 4s over 10 min | P1 ticket |
| Block-repair rate | > 5% of turns over 30 min | P2 ticket |
| Provider breaker open | any breaker open > 2 min | P1 ticket |
| Cost-breaker tripped | global spend ceiling hit | P1 page |

### 20.3 Trace correlation
`traceId` is generated at lifecycle step 0, attached to every span and the `turn` log,
returned via `X-Trace-Id` and the `done`/`error` SSE payload, and surfaced in the
client error UI for support correlation.
