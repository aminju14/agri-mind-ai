# ROADMAP.md — AgriMind AI Implementation Roadmap

> Derived from `MASTER_PROMPT.md`, `ARCHITECTURE.md`, `AGENTS.md`, `DATABASE.md`,
> `UI_SYSTEM.md`. The approved UI and all Frozen Contracts are immutable; this roadmap
> builds the backend **beneath** them without changing a rendered pixel. Every phase
> ends in a shippable, demoable increment that keeps `npm run build` green and the
> visual-regression gate passing.
>
> **Note (web search provider):** Phase 5 originally planned the **Brave** Search API.
> The shipped implementation uses **Tavily** instead (`src/ai/tools/web-search/`). Where
> older sections below say "Brave", read "Tavily" — the provider-interface design
> (swappable adapter, timeout/retry/degrade) is unchanged.

---

## 0. How to read this roadmap

- Phases are **strictly ordered**: each depends on the prior. Do not start a phase
  until the previous phase's **Exit criteria** are met.
- Each phase lists **Objectives / Deliverables / Folder Structure / APIs / Database
  Changes / Testing Strategy / Risks**, plus **Dependencies** and **Exit criteria**.
- "Frozen" means the contract is already defined in the docs; implement to it exactly.
- Section references like `MASTER §5` point into the approved docs.
- The module layout target is `ARCHITECTURE.md §1.2`; phases fill it in incrementally.

### 0.1 Guiding sequencing principle

Build the **skeleton that streams** before the **intelligence that grounds**. Phase 2
delivers a real end-to-end SSE chat with a single hardcoded-prompt agent and **no RAG/
web** — proving the frozen UI binding and the streaming reveal first. Phases 3–6 then
layer routing, retrieval, search, and insight onto a working spine. Phase 7 hardens.

### 0.2 Cross-phase invariants (hold from Phase 2 onward)

1. The SSE event protocol (`MASTER §3.6`) and HTTP envelope (`MASTER §3.7`) are honored
   exactly from the first streaming commit; later phases only add data to existing
   events, never change their shape.
2. Tenancy (`userId` scoping) and the moderation gates (`MASTER §14`) are present from
   Phase 2 even if minimal; they are not "added later".
3. Every turn emits one `turn` log with a `traceId` (`MASTER §12`) from Phase 2.
4. No phase mutates a Frozen Contract; any pressure to do so triggers a re-approval task.

### 0.3 Milestone map

| Phase | Theme | Demo at exit |
|-------|-------|--------------|
| 1 | Core Infrastructure | Auth, DB, health, typed config, CI gates green |
| 2 | Chat Engine | Real streaming chat in the frozen UI (single agent, no grounding) |
| 3 | Multi-Agent System | Correct agent routed per turn; 4 agents; strip/bubble identity coherent |
| 4 | RAG System | Answers grounded in bilingual KB with truthful citation cards |
| 5 | Web Search | Research agent uses live Tavily data with web citations |
| 6 | Insight Generator | Per-answer insight + dynamic right panel |
| 7 | Production Hardening | SLOs, abuse/cost guards, eval gate, DR, launch-ready |

---

## Phase 1 — Core Infrastructure

### Objectives
Stand up the durable, secure foundation everything else builds on: authenticated
per-user tenancy, Postgres+pgvector via Prisma, typed/validated config, the server↔
client import boundary, observability primitives, and the CI release gates. **No chat
logic yet.**

### Deliverables
- Auth.js v5 (session strategy) with the standard adapter tables; sign-in works; a
  session resolves to a `userId`.
- Prisma schema for the **non-vector** core (`User`, `Conversation`, `Message`,
  `Citation`, `LearningPath`, `UsageEvent`, `PanelSnapshot`, Auth tables) migrated.
- pgvector extension enabled; `Document`, `Chunk`, `ChunkEmbedding`,
  `QueryEmbeddingCache` tables created with `vector(1536)` columns + HNSW index (empty).
- `config/env.ts` (zod) — fails boot on missing/invalid secrets (`ARCHITECTURE §12`).
- `observability/{logger,metrics,trace}.ts` — structured logger with `traceId`,
  hashed `userId`; `/api/health` returning dependency checks.
- Server/client import-boundary ESLint rule (`@/server/*` not importable from
  `"use client"`).
- CI pipeline: typecheck, lint (incl. boundary + orphaned-`// DECISION:` checks),
  `prisma validate` + drift check, visual-regression baseline captured from the
  approved UI.
- Seed script scaffold (idempotent) creating the demo user "Tani Wijaya" (Pro plan)
  and seed `LearningPath`/`PanelSnapshot` matching `data.ts` (`DATABASE §9.2`).

### Folder Structure (created this phase)
```
src/
  app/api/
    auth/[...nextauth]/route.ts
    health/route.ts
  server/
    config/{env.ts, limits.ts}
    persistence/{prisma.ts, conversations.ts, messages.ts, usage.ts}
    observability/{logger.ts, metrics.ts, trace.ts}
  lib/                         # EXISTING frozen UI data/types (untouched)
prisma/
  schema.prisma
  migrations/                  # model migrations + paired raw-SQL (vector/index/RLS)
  seed.ts
.eslintrc / eslint rules for import boundary
```

### APIs
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/auth/[...nextauth]` | Auth.js handler |
| GET | `/api/health` | `{status, deps:{db,embeddings,claude,brave}, sha}` (shallow; provider checks may be `skip` until keys wired) |

No `/api/chat` yet.

### Database Changes
- Initial Prisma migration: all non-vector models (`DATABASE §4`).
- Raw-SQL migrations (paired): `CREATE EXTENSION vector`; add `vector(1536)` columns to
  `chunk_embeddings` + `query_embedding_cache`; HNSW cosine index (`DATABASE §5`).
- RLS migration: enable + `tenant_isolation` policies on user-owned tables; app sets
  `app.user_id` per transaction (`DATABASE §13`).
- Pooled `DATABASE_URL` + direct `DIRECT_URL` wired (`DATABASE §16.1`).

### Testing Strategy
- **Unit:** `env.ts` rejects missing keys; logger redacts message bodies; `userId` hash
  is stable+salted.
- **Integration:** migrations apply cleanly to a fresh DB; RLS canary — user A cannot
  read user B's rows even with the app filter removed (`DATABASE §13.2`).
- **CI:** all gates wired and green on an empty app; visual baseline matches approved UI.
- **Smoke:** `/api/health` returns 200 with `db: ok`.

### Risks
| Risk | Mitigation |
|------|-----------|
| pgvector 1536-dim/HNSW setup friction on the target Postgres | Verify pgvector ≥0.7 + HNSW support in the chosen host early; `DATABASE §5.3` dimension decision pre-resolves the >2000-dim trap |
| Auth.js v5 + App Router + Node runtime wiring | Pin versions; keep the chat route on `runtime="nodejs"` from the start (`ARCHITECTURE §2`) |
| RLS breaking ordinary queries (missing `set_config`) | Wrap every request in a tx that sets `app.user_id`; integration test covers it |
| Windows client-manifest issue resurfacing | Keep `page.tsx` a Server Component wrapper (already done); document in CONTRIBUTING |

### Dependencies
None (greenfield backend on top of the existing frozen UI).

### Exit criteria
Auth works; migrations apply; RLS canary passes; `/api/health` green; all CI gates
green; visual baseline locked. **No chat yet, by design.**

---

## Phase 2 — Chat Engine

### Objectives
Deliver a **real end-to-end streaming chat** wired to the frozen UI: `POST /api/chat`
opens an SSE stream, a single agent (fixed system prompt, **no RAG/web**) generates a
frozen-shape answer via Claude, the client reveals it byte-identically to the reference
animation, and the turn persists losslessly. This proves the spine: orchestrator, SSE,
block parser/repair, persistence, moderation gates, observability — before any
intelligence is added.

### Deliverables
- Orchestrator (`ARCHITECTURE §3`) implementing the lifecycle (`MASTER §5`) for the
  no-grounding path: GATE → MODERATE-IN → PERSIST-USER → (fixed agent) EMIT-META →
  GENERATE → STREAM → VALIDATE → MODERATE-OUT → PERSIST-AI → DONE.
- SSE encoder (`sse.ts`) emitting the frozen event set with heartbeats + ordering
  invariants (`MASTER §3.6`).
- Claude streaming client (`llm/claude.ts`) with timeout/retry/breaker (`ARCHITECTURE
  §9`); the `H:/P:/U:` notation prompt (`AGENTS §14.1`, single generic agent for now).
- Block parser + deterministic repair (`AGENTS §15`) producing the frozen `Block[]` and
  per-block streaming granularity (`AGENTS §14.4`).
- Budget enforcement (`budget.ts`) for tokens/time/output (`MASTER §8`).
- Minimal in/out moderation gates (`MASTER §14`) — wired, even if rules are basic.
- Idempotency + per-user rate limit (basic) before stream opens (`ARCHITECTURE §15.4`,
  `§9.3`).
- Conversations API (list/create/get/delete) returning the **lossless render payload**
  so history reloads identically (`DATABASE §2`, `UI §6`).
- **SSE client reducer** in `use-agrimind.ts` (`UI §13`): replace the in-memory
  generator with the network stream while preserving the reveal cadence exactly.
- Cancellation: client disconnect / `newChat` aborts the turn and stops Claude billing
  (`ARCHITECTURE §15.1`).

### Folder Structure (added)
```
src/
  app/api/
    chat/route.ts                     # SSE streaming endpoint (runtime=nodejs)
    conversations/route.ts            # GET list, POST create
    conversations/[id]/route.ts       # GET messages, DELETE (soft)
  server/
    orchestrator/{orchestrator.ts, sse.ts, budget.ts}
    llm/{claude.ts, block-parser.ts, repair.ts}
    agents/{base-agent.ts, registry.ts}   # one generic agent stub for now
    agents/prompts/base-prompt.ts
    moderation/{inbound.ts, outbound.ts}  # minimal
    ratelimit/{limiter.ts, idempotency.ts}
  hooks/use-agrimind.ts               # EXTENDED: SSE reducer (UI §13)
```

### APIs
| Method | Path | Contract |
|--------|------|----------|
| POST | `/api/chat` | `MASTER §3.7` request → SSE (`meta→block*→blockEnd*→done|error`). No `citations`/`insight` events yet (additive later). |
| GET | `/api/conversations` | paged `ConversationSummary[]` |
| POST | `/api/conversations` | create, returns `{conversation}` |
| GET | `/api/conversations/:id` | `{conversation, messages[]}` lossless |
| DELETE | `/api/conversations/:id` | soft delete |

### Database Changes
- No schema changes (Phase 1 schema covers it). First real writes to `Message`
  (`role=user` and `role=ai` with `blocks`, `routerReason="fixed:generic"`,
  `promptVersion`, `modelId`, `usage`).
- `UsageEvent` rows for the generation call (`kind="generation"`).

### Testing Strategy
- **Unit:** block-parser maps `H:/P:/U:` → `Block[]`; repair coerces every malformed
  case in `AGENTS §15.2` (missing H, multiple H, leaked markdown, empty) to a renderable
  answer; SSE encoder ordering invariant holds.
- **Integration:** full turn against a mocked Claude stream → exact SSE sequence; client
  reducer produces the same `reveal` states as the reference; lossless reload equals the
  streamed render.
- **Contract:** 400/401/409/413/429 paths return the frozen error envelope **before** the
  stream opens; cancellation aborts the mock generation.
- **Visual:** streamed answer at `showExtras` and thinking state match baselines (still
  no citations/insight cards).
- **Manual (`/run`):** type a question, watch it stream in the real app in both themes.

### Risks
| Risk | Mitigation |
|------|-----------|
| Reveal cadence drifts from the approved animation when fed by SSE | Drive the **existing** `reveal:{block,char}` model unchanged; golden test compares reducer output to reference (`UI §13.3`) |
| SSE through proxies/Next runtime buffering | Node runtime + explicit flush + 15s heartbeat; verify on the deploy target early |
| Claude stream cancellation leaks cost | `AbortController` per turn threaded to the SDK; test asserts abort stops token consumption |
| Block-shape violations reach the client | Incremental repair as blocks complete (lifecycle step 11), not only at end |

### Dependencies
Phase 1 (auth, DB, config, observability).

### Exit criteria
A user can hold a streaming conversation in the frozen UI, indistinguishable visually
from the reference reveal; history reloads losslessly; all error/cancel paths behave;
one `turn` log per turn with a `traceId`. Still single generic agent, no grounding.

---

## Phase 3 — Multi-Agent System

### Objectives
Replace the single generic agent with the **four frozen specialist agents** and the
deterministic router, so each turn is handled by the correct agent and the UI's
agent-status strip, thinking bubble, and AI bubble all show the same identity
(`MASTER §3.1`, `AGENTS §1–§6, §13`). Still no RAG/web — agents answer from method-level
knowledge within their domain prompts.

### Deliverables
- Router (`router/router.ts` + `rules.ts`) implementing the scoring algorithm and
  bilingual lexicon (`AGENTS §13`): prompt-card precedence → lexicon scoring →
  specificity tiebreak → agronomist default. Persists `routerReason`+`routerScores`.
- Four agents (`agronomist/plantdoctor/farmplanner/research.ts`) each with its
  assembled system prompt (`AGENTS §14`) — identity, mission, output spec, lang lock,
  safety obligations, scope. Per-agent tool allowlist defined (tools are stubs this
  phase).
- `meta` event now carries the **routed** `agentKey` (drives strip/bubble identity).
- Agent registry + `Agent` interface (`ARCHITECTURE §5`) wired into the orchestrator.
- Safety obligations + escalation **content behavior** active (`AGENTS §7–§8`): pesticide
  qualifier, low-grounding/deferral lines, scope-narrowing — purely prompt-driven for now.
- `promptVersion` recorded per agent on each message (`MASTER §16.2`).

### Folder Structure (added/expanded)
```
src/server/
  router/{router.ts, rules.ts}                 # lexicon as DATA in rules.ts
  agents/
    agronomist.ts plantdoctor.ts farmplanner.ts research.ts
    registry.ts                                # AgentKey -> agent
    prompts/{agronomist.ts, plantdoctor.ts, farmplanner.ts, research.ts, segments.ts}
```

### APIs
No new endpoints. `/api/chat` behavior changes: `meta.agentKey` is now routed, not
fixed. SSE shape unchanged (additive-safe).

### Database Changes
- No schema change. `Message.agentKey`, `routerReason`, `routerScores`, `promptVersion`
  now populated with real routing data.

### Testing Strategy
- **Unit (deterministic):** the 5 suggested prompts route to their declared agents
  (`learn,crops→agronomist; diagnose→plantdoctor; planning→farmplanner; market→
  research`); lexicon scoring + tiebreak cases; router never throws (falls back to
  agronomist).
- **Golden (`AGENTS §12, §17`):** per-agent block shape, lang fidelity (EN→EN, ID→ID),
  safety qualifier on a pesticide prompt, scope-narrowing on out-of-scope.
- **Integration:** strip/thinking/bubble all render the same routed agent (`UI §12.3`).
- **Visual:** thinking state per agent matches baselines (4 agent colors/emojis).

### Risks
| Risk | Mitigation |
|------|-----------|
| Router misclassification feels wrong | Lexicon is tunable DATA; eval set (Phase 7 formalizes) tracks routing accuracy; tiebreak prefers specificity |
| Agents drift from frozen block shape under varied prompts | Repair pass (Phase 2) backstops; golden tests gate |
| Mixed-language output (esp. ID) | Mandatory `LANG_LOCK` segment, non-droppable; lang-fidelity test |
| Safety qualifier missing on chemical advice | Outbound moderation check + golden safety test (P1 gate) |

### Dependencies
Phase 2 (orchestrator, generation, SSE, parser).

### Exit criteria
Every turn routes to the correct one of four agents with explainable
`routerReason/scores`; UI identity is coherent; safety/scope behaviors present; golden
agent tests green. Grounding still absent (answers are method-level).

---

## Phase 4 — RAG System

### Objectives
Make answers **grounded and citable**: ingest a bilingual KB, embed with OpenAI
`text-embedding-3-large` @ 1536-d, retrieve language-filtered chunks via pgvector, and
emit **truthful** citation cards (`MASTER §3.3, §4.1`). The `citations` SSE event and
the frozen Citation Cards go live.

### Deliverables
- KB ingestion pipeline (`DATABASE §14`): normalize → dedupe → chunk (~280–320 tok) →
  embed (batched) → store atomically per document → verify → index. Idempotent;
  provenance-mandatory; lang-detected.
- Seed KB (EN+ID) covering the five canonical domains so the suggested prompts retrieve
  real grounding matching the approved sample answers (`DATABASE §9.2`).
- RAG service (`rag/rag-service.ts`, `embed.ts`, `rank.ts`): embed query (cache-aware)
  → pgvector cosine top-k (lang-filtered) → cross-lingual fallback when sparse → MMR
  rerank to top-8, per-doc cap 3 → sentence-boundary trim ≤1,200 chars (`ARCHITECTURE
  §6`, `DATABASE §6`).
- Context assembler (`context/assembler.ts`) assigning `S1..Sn`, enforcing the token
  budget by dropping lowest-rank sources, never trimming user text/safety
  (`ARCHITECTURE §8`).
- Citation mapper (`context/citations.ts`): parse+validate the `USED:` trailer against
  available `S#`, build `Citation[]` with provenance (`chunkId`) — truthful only.
- Agents' `plan()` now requests RAG per allowlist; `usedRag` recorded.
- `citations` SSE event emitted (lifecycle step 13); Citation Cards render.
- Embedding cache (`query_embedding_cache`, 24h) + persistent chunk embeddings.

### Folder Structure (added)
```
src/server/
  rag/{rag-service.ts, embed.ts, rank.ts}
  context/{assembler.ts, citations.ts}
  ingest/{pipeline.ts, chunk.ts, ingest-cli.ts}   # KB ingestion + admin CLI
prisma/seed-kb.ts                                  # bilingual seed corpus
```

### APIs
- No new public endpoint. `/api/chat` now emits the `citations` event and persists
  citations.
- Internal/admin: an ingestion CLI/script (`ingest-cli.ts`), not a public route in v1.
- OpenAI embeddings client added behind `embed.ts` with timeout/retry/breaker
  (`ARCHITECTURE §9`).

### Database Changes
- No new tables (created in Phase 1). First real population of `documents`, `chunks`,
  `chunk_embeddings`, `query_embedding_cache`.
- HNSW index built **after** the seed bulk load (`DATABASE §15.1, §15.3`).
- `Citation` rows persisted with `chunkId` provenance; `Message.usedRag=true`.

### Testing Strategy
- **Unit:** chunker respects sentence boundaries + size; embedding cache hit/miss;
  ranker applies per-doc cap + MMR; assembler drops lowest-rank first and never trims
  user/safety text; citation mapper rejects `USED:` ids not in context.
- **Integration:** the 5 suggested prompts (EN+ID) retrieve real chunks and produce
  citation cards; `SOURCES · N` == rendered cards == used sources (`UI §12.5`);
  cross-lingual fallback triggers only when same-lang is sparse.
- **Retrieval quality:** golden-set recall ≥ 0.85 (`MASTER §13.2`).
- **Safety (P0):** assert no `Citation` exists without a real provenance (fabrication
  guard, `MASTER §4.1`).
- **Visual:** citation grid at N=2 (`1fr 1fr`) and N≥3 (`auto-fit`) match baselines.

### Risks
| Risk | Mitigation |
|------|-----------|
| Sparse/poor KB → weak grounding or empty cards | Seed a real bilingual corpus for the 5 domains; 0-chunk path degrades to method-level answer with **no fabricated cites** |
| Embedding dim/model drift vs DB column | CI asserts EMBED_DIM == column dim == model output (`DATABASE §12.3`) |
| Truncation discarding chunk meaning | Chunk size aligned to the 1,200-char injection cap (`DATABASE §14.1` — fixed in review) |
| Cross-lingual fallback hurting precision | Fallback only when same-lang < MIN_HITS; ranked after same-lang |
| Citation fabrication | `USED:` validation + provenance-mandatory DB check + P0 test |

### Dependencies
Phase 3 (agents request tools), Phase 1 (vector tables/index).

### Exit criteria
Suggested prompts produce grounded answers with truthful citation cards in both
languages; recall ≥ 0.85; fabrication guard tests pass; visual citation states match.

---

## Phase 5 — Web Search

### Objectives
Give the Research agent (and selectively others) **live, citable** evidence via Brave
for time-sensitive questions (markets, advisories), merged with KB grounding and cited
with web provenance (`ARCHITECTURE §7`, `AGENTS §6.4`).

### Deliverables
- `WebSearchProvider` interface + **Brave adapter** as default (`ARCHITECTURE §7.2`);
  swappable (Tavily/Bing later).
- Fetcher (`search/fetcher.ts`): readability extraction, markup/script stripping
  (injection defense), ≤2 full fetches, 6s/url timeout, dedupe by registrable domain.
- Web evidence enters the assembler tagged `[WEB]` vs `[KB]`; agents weight freshness
  vs authority (`ARCHITECTURE §8`).
- Citations from web results carry `webUrl` provenance + inferred `category`
  ("Market Data"/"Advisory"/"News"); bare-domain `source`. No fabricated domains.
- Agent `plan()` requests web per allowlist with a justification (`AGENTS §5`); Research
  requires ≥2 corroborating sources for price claims (`AGENTS §6.4`).
- Breaker: web open → degrade to RAG/KB-only, lowered confidence (`ARCHITECTURE §7.5`).

### Folder Structure (added)
```
src/server/
  search/{web-search.ts, brave-adapter.ts, fetcher.ts}
```

### APIs
- No new public endpoint. Brave client behind `brave-adapter.ts` with timeout/retry/
  breaker. `/api/chat` may now emit web-sourced citations (same `citations` event).
- `/api/health` now actually checks `brave`.

### Database Changes
- No schema change. `Citation.webUrl` populated for web sources; optionally persist
  fetched web pages as `documents(origin="web_ingest")` for audit/reuse (`DATABASE §14`
  path), with staleness expiry.
- `Message.usedWeb=true`; `UsageEvent(kind="search")` rows.

### Testing Strategy
- **Unit:** dedupe by domain; fetcher strips scripts/markup and truncates; web result →
  Citation mapping has real `webUrl`; injection-laced snippet does not alter agent
  instructions (`AGENTS §16`).
- **Integration:** a market prompt ("is chili worth growing?") triggers Brave, fetches,
  and cites ≥2 web sources; web-breaker-open path degrades to KB-only with lowered
  confidence and still emits `done`.
- **Safety (P0):** no fabricated domains; injection case in the eval set passes
  (does not follow embedded instructions).
- **Resilience:** Brave 429/5xx and fetch timeouts degrade, never crash the turn.

### Risks
| Risk | Mitigation |
|------|-----------|
| Web content prompt-injection | Sources delimited as untrusted; fetcher strips markup; outbound moderation scans for executed injection (`AGENTS §16`, `MASTER §14.2`) |
| Latency blowout from fetching | ≤2 full fetches, 6s/url, snippet-only for the rest; counts against turn budget |
| Stale/junk results cited | ≥2-source corroboration for price claims; junk → KB-only fallback |
| Cost from over-searching | Web gated by allowlist + `plan()` justification; breaker + per-turn tool cap (`MASTER §8`) |
| ToS/robots compliance | Descriptive UA, respect robots, rate-limited; documented |

### Dependencies
Phase 4 (assembler, citation mapper, agents' tool planning).

### Exit criteria
Research agent answers a market question with live, truthful web citations corroborated
≥2×; degradation and injection-defense tests pass; `/api/health` checks Brave.

---

## Phase 6 — Insight Generator

### Objectives
Complete the answer experience: exactly **one** per-answer insight (`MASTER §3.4`,
`AGENTS §9`) and the **dynamic right Insight Panel** (`PanelData`, `AGENTS §10`,
`UI §4.5`). The `insight` SSE event and the per-answer Insight card go live; the panel
becomes context-aware.

### Deliverables
- Insight Generator (`insight/insight-generator.ts`): separate cheap Claude call
  (`max_tokens ≤120`, may use a smaller model), input = finalized blocks + compressed
  context; output = one non-summary sentence in active lang (`AGENTS §9`).
- `insight` SSE event (lifecycle step 14, best-effort); Insight card renders; graceful
  omission on failure (still emit `done`).
- Panel context generator (`insight/panel.ts`): recompute `topics/knowledge/learning`
  from the turn's retrieved-chunk taxonomy; persist a `PanelSnapshot`; async/
  non-blocking (`AGENTS §10`, lifecycle step 17). New/empty conversations serve seed
  `PANEL[lang]`.
- Per-user `LearningPath` progress wired to the panel (seeded in Phase 1).

### Folder Structure (added)
```
src/server/
  insight/{insight-generator.ts, panel.ts}
```

### APIs
- `/api/chat` now emits the `insight` event and triggers async panel recompute.
- `/api/conversations/:id` returns the latest `PanelSnapshot` so the panel renders on
  load (or a `panel` payload; v1 may recompute lazily on load).

### Database Changes
- No new tables. First real `PanelSnapshot` writes per conversation; `LearningPath`
  reads for the panel; `UsageEvent(kind="insight")` rows; `Message.insight` populated.

### Testing Strategy
- **Unit:** insight is exactly one sentence; cosine similarity to the answer below the
  summary threshold (not a summary); multi-sentence output repaired to first sentence;
  empty/failed insight omitted gracefully.
- **Integration:** answer renders Insight card after `showExtras`; panel reflects the
  conversation's dominant topics; empty conversation shows seed panel; panel recompute
  failure falls back to last snapshot and never blocks `done`.
- **Visual:** Insight card + full Insight Panel (all four sections) match baselines in
  both themes; learning-path bars render.

### Risks
| Risk | Mitigation |
|------|-----------|
| Insight reads as a summary | Rubric prompt + similarity gate in tests; eval LLM-judge for non-obviousness (`AGENTS §17`) |
| Panel recompute adds latency | Strictly async/non-blocking after `done`; best-effort with snapshot fallback |
| Extra Claude call raises cost | Cheap model + ≤120 tokens + per-turn budget; insight is droppable under cost pressure |
| Panel data drifts from frozen `PanelData` shape | Zod-validate against the frozen shape on write/read (`UI §4.5`) |

### Dependencies
Phase 4 (chunk taxonomy for topics/knowledge), Phase 2 (generation), Phase 1 (panel/
learning tables).

### Exit criteria
Every answer carries one non-summary insight; the right panel is context-aware and
matches baselines; insight/panel failures degrade gracefully without blocking the turn.

---

## Phase 7 — Production Hardening

### Objectives
Take the feature-complete system to **launch-ready**: meet the SLOs, enforce abuse/cost
ceilings cross-instance, pass the formal eval gate, wire full observability/alerting,
prove DR, and lock the release gates (`MASTER §13–§17`, `ARCHITECTURE §15–§20`).

### Deliverables
- Shared-state store (Redis) for cross-instance rate limits, spend meters, concurrency
  caps, idempotency (`ARCHITECTURE §16.2`); **fail-safe** to conservative in-process
  limits on Redis loss.
- Full abuse/cost protection (`MASTER §15`): per-min/day turn limits, per-user
  concurrency (2), daily spend cap with degrade-then-429, global cost breaker, anomaly
  throttle.
- Concurrency/backpressure: per-instance generation semaphore (50), SSE buffer caps,
  graceful SIGTERM drain (`ARCHITECTURE §15`).
- Full content moderation (`MASTER §14`) inbound/outbound with localized refusals;
  `content_blocked` path.
- Resilience config finalized across all providers (timeouts/retries/breakers,
  `ARCHITECTURE §9`); circuit-breaker behaviors verified.
- Observability: canonical `turn` log schema, metrics, traces, alert thresholds
  (`ARCHITECTURE §20`); `X-Trace-Id` surfaced in client error UI (`UI §13`).
- **Evaluation harness** (`AGENTS §17`): ≥60-case bilingual golden set; deterministic
  hard gates (routing, block shape, citation truthfulness, lang, insight count) + LLM-
  judge quality gate (mean ≥0.85, no safety/citation case <0.6); per-`promptVersion`
  tracking.
- Performance: first-token p95<2.5s, full-turn p95<18s validated under load
  (`MASTER §13.2`); Web Vitals (CLS≈0, no layout shift during reveal) (`UI §17`).
- A11y: live region, focus trapping, reduced-motion, axe pass on the story matrix
  (`UI §15–§16`).
- DR: PITR backups (RPO≤5m/RTO≤1h), restore drill, KB re-embed runbook validated
  (`ARCHITECTURE §19`, `DATABASE §17`); deploy/rollback via expand-contract + canary
  (`ARCHITECTURE §17`).
- Secrets rotation (dual-key windows) + leak runbook (`ARCHITECTURE §18`).
- Rate-limit/spend dashboards; SLO error-budget tracking.

### Folder Structure (added/expanded)
```
src/server/
  ratelimit/{limiter.ts, spend-meter.ts, concurrency.ts}   # Redis-backed
  moderation/{inbound.ts, outbound.ts}                     # full rules
  observability/{alerts.ts, metrics.ts}                    # expanded
evals/
  cases/*.json                       # ≥60 bilingual golden cases
  harness.ts judge.ts                # deterministic + LLM-judge runners
ops/
  runbooks/{re-embed.md, dr-restore.md, key-rotation.md}
```

### APIs
- No new product endpoints. Hardened: `/api/chat` enforces all limits **before** the
  stream; `/api/health` reports `draining` during SIGTERM; `429` carries `Retry-After`;
  all error codes from the frozen enum exercised.

### Database Changes
- Index maintenance jobs (REINDEX/recall checks), autovacuum tuning for append-heavy
  tables, retention/purge job for soft-deleted conversations (`DATABASE §11, §15`).
- Re-embed/backfill machinery present and rehearsed (no live dim change required, but
  the runbook is validated) (`DATABASE §17`).
- Connection-pool + statement-timeout config finalized (`DATABASE §16`).

### Testing Strategy
- **Load/latency:** sustained concurrent streams hit SLO targets; semaphore load-sheds
  to 429 not OOM; backpressure handles slow clients.
- **Abuse/cost:** limits enforced before provider spend; global cost breaker degrades
  then 429; Redis-down falls back to conservative limits (not open).
- **Eval gate:** full harness green; routing accuracy, citation truthfulness (must be
  1.0), safety pass-rate gate the release; regression on any hard metric blocks merge.
- **Chaos:** each provider breaker open → documented degrade; SIGTERM drains in-flight;
  DB pool exhaustion degrades the turn.
- **Security:** cross-tenant canary (P0), prompt-injection eval cases, secret-leak
  runbook dry run, RLS still enforced under load.
- **DR drill:** restore from backup to scratch env, checksum golden rows; re-embed
  runbook executes end-to-end on a copy.
- **A11y/visual:** axe + visual-regression across both themes × three breakpoints, all
  story-matrix states, green.

### Risks
| Risk | Mitigation |
|------|-----------|
| Limits "fail open" if Redis is down | Explicit fail-safe to conservative in-process limiter (`ARCHITECTURE §16.2`) — tested |
| Eval gate flakiness (LLM-judge variance) | Deterministic checks are the hard gates; judge uses a fixed rubric + thresholds; track per-version trend |
| Cost overrun under real traffic | Hard per-turn/day budgets, global breaker, spend dashboards, anomaly throttle |
| First-token SLO missed under load | Per-instance semaphore + capacity model (`ARCHITECTURE §16.3`); scale on concurrent-stream count |
| Single-region outage (accepted v1 risk) | Documented; DR runbook + backups; multi-region noted as future work |
| Migration risk at scale | Expand-contract + canary + pre-deploy `migrate deploy` halt-on-fail |

### Dependencies
Phases 1–6 (full feature set must exist to harden it).

### Exit criteria
SLOs met under load; abuse/cost guards enforced cross-instance and fail-safe; full
moderation + eval gate green (citation truthfulness 1.0, safety pass); observability/
alerting live; DR + re-embed runbooks rehearsed; release gate (`MASTER §17`) fully
operational. **Launch-ready.**

---

## Appendix A — Phase dependency graph

```
P1 Core Infra
   └─> P2 Chat Engine
          └─> P3 Multi-Agent
                 └─> P4 RAG ──> P5 Web Search ─┐
                        └───────> P6 Insight ──┴─> P7 Hardening
```
P5 and P6 both depend on P4 (assembler/citations + chunk taxonomy) and may proceed in
parallel once P4 exits; P7 requires all prior phases.

## Appendix B — Frozen-contract checkpoints (must hold every phase from P2)

| Contract | Source | First enforced |
|----------|--------|----------------|
| 4 agents, fixed identity | `MASTER §3.1` | P3 |
| `Block[]` shape (`h/p/ul`) | `MASTER §3.2` | P2 |
| Citation card shape | `MASTER §3.3` | P4 |
| One insight | `MASTER §3.4` | P6 |
| `PanelData` shape | `MASTER §3.5` | P6 |
| SSE protocol + ordering | `MASTER §3.6` | P2 |
| HTTP envelope + error enum | `MASTER §3.7` | P2 |
| Frozen UI pixels | `UI_SYSTEM.md` | P1 (baseline) → every phase |

## Appendix C — Definition of "phase complete"

A phase is complete only when: its Exit criteria are met; `npm run build`, typecheck,
lint, and the visual-regression gate pass; the phase's tests are green; one `turn` log
with a `traceId` is emitted per turn (P2+); and **no Frozen Contract was mutated**
(`MASTER §17` release gate).
