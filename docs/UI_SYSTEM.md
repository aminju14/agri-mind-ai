# UI_SYSTEM.md — AgriMind AI UI System Specification

> Governed by `MASTER_PROMPT.md`. **The UI is the authoritative source of truth and
> is frozen.** This document records the approved design system, component contracts,
> placement, and how the backend stream binds to it. It is prescriptive about what may
> **not** change. The reference implementation lives under `src/components/`,
> `src/hooks/use-agrimind.ts`, `src/app/globals.css`, and the approved
> `AgriMindAI.html`. Where this document and the implementation differ, the
> **implementation wins** and this document is corrected — never the reverse.

---

## 1. Freeze policy (read first)

**Do NOT, under any task:**
- Redesign, re-theme, or "modernize" the interface.
- Change layout hierarchy, column order, or component placement.
- Change colors, spacing, radii, typography scale, or animations.
- Simplify, merge, or remove any of the six required components.
- Replace inline-style theming with a different system in a way that changes pixels.

**You MAY:**
- Wire components to real data/SSE provided the **rendered output is unchanged**.
- Add non-visual concerns (a11y attributes, keys, error boundaries) that don't alter
  layout or style.
- Extend the data hook to consume the network while preserving the existing reveal
  animation and state machine.
- Collapse/expand the left sidebar and right insight panel to a slim icon rail on
  desktop (approved change — see §3.3). The expanded layout and all six components are
  unchanged; collapse only swaps a column for its icon rail and is opt-in per user.

Any visual change requires a separate, explicit re-approval task. A PR that alters the
approved pixels without that approval is rejected by definition.

---

## 2. Design tokens (frozen)

Tokens are CSS variables set on `:root`/`[data-theme]` in
[globals.css](../src/app/globals.css) and toggled by `data-theme` on `<html>`.

### 2.1 Dark theme (default)
| Token | Value | Token | Value |
|-------|-------|-------|-------|
| `--bg` | `#0B1220` | `--text` | `#F8FAFC` |
| `--bg2` | `#0E1626` | `--muted` | `#94A3B8` |
| `--card` | `#111827` | `--primary` | `#22C55E` |
| `--card2` | `#0E1525` | `--secondary` | `#38BDF8` |
| `--border` | `#1F2937` | `--primary-soft` | `rgba(34,197,94,.12)` |
| `--border2` | `#263243` | `--secondary-soft` | `rgba(56,189,248,.12)` |
| `--shadow` | `0 18px 50px rgba(0,0,0,.5)` | `--hover` | `rgba(255,255,255,.045)` |

### 2.2 Light theme
| Token | Value | Token | Value |
|-------|-------|-------|-------|
| `--bg` | `#F4F7FB` | `--text` | `#0B1220` |
| `--bg2` | `#FFFFFF` | `--muted` | `#64748B` |
| `--card` | `#FFFFFF` | `--primary` | `#16A34A` |
| `--card2` | `#F6FAFD` | `--secondary` | `#0EA5E9` |
| `--border` | `#E6EBF2` | `--primary-soft` | `rgba(34,197,94,.12)` |
| `--border2` | `#D5DEE9` | `--secondary-soft` | `rgba(56,189,248,.14)` |
| `--shadow` | `0 14px 40px rgba(15,23,42,.1)` | `--hover` | `rgba(15,23,42,.04)` |

**Rule:** components reference tokens only. No hardcoded hex in components except the
brand-specific constants already present (`#16a34a` gradient stop, `#04140a` on-primary
text, `#06120c` brand-mark ring) which are part of the approved design.

### 2.3 Typography (frozen)
| Family | Variable | Usage |
|--------|----------|-------|
| Sora (400–800) | `--font-sora` / `.font-sora` | Brand, hero title, headings, section titles |
| Plus Jakarta Sans (400–700) | `--font-jakarta` / `.font-jakarta` | Body/default (`<body>`) |
| JetBrains Mono (400–600) | `--font-mono` / `.font-mono` | Labels, tags, source domains, eyebrows |

Loaded via `next/font` in [layout.tsx](../src/app/layout.tsx). Font sizes are
per-element literals from the approved HTML (e.g. hero `46px/-.035em`, AI heading
`17px`, body `14.6px/1.68`); they are frozen — do not normalize to a scale.

### 2.4 Animations (frozen keyframes)
Defined in globals.css; do not retime or remove:
`amBlink` (streaming cursor), `amDot` (thinking dots), `amPulse` (online indicator),
`amFadeUp` (message entry), `amFadeIn` (backdrops), `amFloat` (hero glows), `amSpin`.

---

## 3. Layout system (frozen three-column geometry)

Geometry computed in [agrimind-app.tsx](../src/components/agrimind-app.tsx) from the
responsive breakpoints in [use-agrimind.ts](../src/hooks/use-agrimind.ts).

### 3.1 Breakpoints
| Name | Range | Left sidebar | Right panel |
|------|-------|--------------|-------------|
| `isMobile` | `< 720px` | drawer (overlay, 280px, z 70) | bottom sheet (78vh, z 60) |
| `isTablet` | `720–1079px` | fixed 248px | slide-over (360px, max 86vw, z 60) |
| `isDesktop` | `≥ 1080px` | fixed 280px (collapsible → 64px rail) | fixed 340px column (collapsible → 64px rail) |

### 3.2 Column contract (placement is frozen)
```
┌───────────┬───────────────────────────────┬──────────────┐
│  LEFT     │  MAIN                          │  RIGHT       │
│  Sidebar  │  ┌─ Topbar (tablet/mobile)     │  Insight     │
│  280/248  │  ├─ Agent Status strip         │  Panel       │
│           │  ├─ Thread (Hero | Chat)       │  340/360     │
│           │  └─ Composer (sticky bottom)   │              │
└───────────┴───────────────────────────────┴──────────────┘
```
- Left = navigation/history/settings. Right = insights/topics/knowledge/learning.
- `main` margins: `marginLeft = isMobile?0:Wl`, `marginRight = isDesktop?Wr:0`.
- Drawer/sheet transforms and z-indices are frozen (see §3.1). Backdrops use
  `rgba(2,6,12,.55)` + `amFadeIn`.

**Rule:** the order Left → Main → Right and the internal stacking (Topbar → Agent
Status → Thread → Composer) is immutable.

### 3.3 Collapsible columns (desktop only — approved)

On desktop, the left sidebar and the right insight panel can each be collapsed,
independently, to a **64px icon rail**. This gives the centered chat column more room
without removing either component.

- **Geometry:** when collapsed, the column's width (`Wl`/`Wr`) becomes `64`; `main`'s
  `marginLeft`/`marginRight` follow it. Width animates (`.25s cubic-bezier(.4,0,.2,1)`);
  the `main` margin reuses its existing `margin .25s` transition.
- **Toggle:** a `SidebarToggleIcon` button. In the expanded view it sits in the
  sidebar's brand row / the panel header (next to "Insights"). On the rail it appears as
  an icon button that expands the column back.
- **Rail contents (icon-only, with `aria-label`/`title`):**
  - *Sidebar rail:* brand tile, expand toggle, New Chat, then theme + language toggles
    pinned to the bottom. History, search, and the per-item menu are hidden until expanded.
  - *Panel rail:* the bulb glyph (tinted) + expand toggle. The four insight sections are
    hidden until expanded.
- **Scope:** desktop only (`canCollapse = isDesktop`). Tablet/mobile are unaffected —
  they keep the drawer / slide-over / bottom-sheet behavior (§3.1, §8); collapse never
  applies there.
- **Persistence:** each collapse state persists to `localStorage`
  (`am_sidebar_collapsed`, `am_panel_collapsed`; `"1"`/`"0"`) and is restored on mount,
  alongside `am_theme`/`am_lang` (§9).
- **Invariant:** the **expanded** layout, the six components, and the Left→Main→Right
  order are unchanged. Collapse is purely a per-user, reversible space optimization; it
  introduces no new component and removes none.

---

## 4. The six required components (contracts)

Each is implemented and frozen. Below: responsibilities, the props/data it binds, and
the invariants the backend must satisfy.

### 4.1 Sidebar — [sidebar.tsx](../src/components/sidebar.tsx)
**Renders:** brand mark + "AgriMind AI" + "AGRI · INTELLIGENCE"; **New Chat**;
search input; grouped **history** (Today/Yesterday/Last 7 days); footer with theme
toggle, language toggle, user (avatar "AM", name, plan).
**Binds:** `t: Strings`, `history: HistoryGroup[]`, `theme`, `lang`, `newChat`,
`toggleTheme`, `toggleLang`, plus `collapsed`/`canCollapse`/`onToggleCollapse` for the
desktop rail (§3.3).
**Invariants:** history groups come from `conversations(userId, updatedAt)` bucketed
into the same three localized labels. New Chat resets to hero (existing `newChat`).
Theme/lang persist to `localStorage` (`am_theme`, `am_lang`).
**Constraints:** widths 280 (desktop/mobile drawer) / 248 (tablet); footer pinned
bottom; history scrolls. On desktop the column may be collapsed to the 64px icon rail
(§3.3) — the expanded layout is unchanged.

### 4.2 Chat Layout — [agrimind-app.tsx](../src/components/agrimind-app.tsx) + [hero.tsx](../src/components/hero.tsx) + [chat-thread.tsx](../src/components/chat-thread.tsx)
**Two thread states:**
- **Hero** (`view==="hero"`): badge "4 SPECIALIST AGENTS · LIVE", brand tile, hero
  title/sub/desc, "Start with a suggestion" + the 5 suggested prompt cards, floating
  glows.
- **Chat** (`view==="chat"`): max-width 780 column; user bubbles (right, green
  gradient, avatar "AM") and AI bubbles (left, agent-tinted tile); thinking indicator;
  streaming reveal.
**Composer:** sticky bottom; attach button, auto-grow textarea (max 120px),
send button (enabled only when input non-empty and not thinking); disclaimer line.
Enter sends, Shift+Enter newlines (existing `onKey`).
**Invariants:** exactly one agent per AI bubble; the reveal animation (block-by-block,
blinking cursor) is preserved by binding SSE to the existing `reveal` model (§6).

### 4.3 Agent Status — [agent-status.tsx](../src/components/agent-status.tsx)
**Renders:** pulsing online dot + "All agents online"; four agent chips in fixed
order `agronomist, plantdoctor, farmplanner, research`.
**Binds:** `thinking`, `thinkAgent`. When thinking, the active agent chip is full
opacity + colored text; others dim to 0.45. Idle: all at 0.92.
**Invariant:** chip identities (emoji/color/name) come from frozen `AGENTS`. The
active agent MUST equal the `agentKey` from the `meta` SSE event so the strip, the
thinking bubble, and the final AI bubble all show the same agent.

### 4.4 Citation Cards — [citation-cards.tsx](../src/components/citation-cards.tsx)
**Renders:** "SOURCES · N" eyebrow; grid of numbered cards (`1..N`) each with index
chip, external-link glyph, title, mono `source` domain, `category` pill. Grid is
`repeat(auto-fit,minmax(150px,1fr))` for ≥3 sources else `1fr 1fr`.
**Binds:** `citations: Citation[]` from the `citations` SSE event / persisted message.
**Invariants:** N == number of cards == "used sources" (truthful-citation rule,
`MASTER_PROMPT §4.1`). Card contract is frozen (`title/category/source`); the link
target (`url`) is resolved from `Citation.url/webUrl` server-side and is not a card
field. Cards appear only after the body finishes streaming (`showExtras`).

### 4.5 Insight Panel — [insight-panel.tsx](../src/components/insight-panel.tsx)
**Renders (top→bottom, frozen order):** header (bulb + "Insights"); AI insight
feature card (gradient); **Recommended Topics** (dot + name + mono tag); **Related
Knowledge** (category pill + title + source); **Learning Path** (name + pct + gradient
progress bar).
**Binds:** `PanelData` (frozen §3.5 of master) — `insight`, `topics[]`, `knowledge[]`,
`learning[]`.
**Invariants:** section order and the four sections are immutable. Data is
session-scoped (`AGENTS.md §10`); new/empty conversations show the localized seed
`PANEL[lang]`. On tablet/mobile this becomes the slide-over/bottom-sheet (grabber +
close button) without changing internal layout. On desktop the column may be collapsed
to the 64px icon rail (§3.3) via `collapsed`/`canCollapse`/`onToggleCollapse`; the
expanded layout and section order are unchanged.

### 4.6 Suggested Prompt Cards — [suggested-prompts.tsx](../src/components/suggested-prompts.tsx)
**Renders:** 5 cards (Learn Farming, Diagnose Plant Problems, Farm Planning, Crop
Recommendations, Market Research), each with an agent-tinted icon tile, title, desc,
and a top-right arrow; hover lifts and borders in the card's agent color. Grid is
2-col desktop/tablet, 1-col mobile.
**Binds:** frozen `PROMPTS`; click calls `send(p[lang].q, p.key)`.
**Invariant:** each card's `agent`/`icon`/copy is frozen and its `key` drives router
precedence (`AGENTS.md §3.1`): clicking it MUST route to that card's declared agent.

---

## 5. State machine (frozen behavior) — `use-agrimind.ts`

The hook is the UI's state authority. Backend integration MUST preserve this machine.

```
state: theme, lang, view('hero'|'chat'), messages[], input, thinking,
       thinkAgent, width, drawerOpen, sheetOpen,
       sidebarCollapsed, panelCollapsed   // desktop rail (§3.3)
refs:  midx (message counter), threadRef (autoscroll)
```

**Transitions (preserved):**
- `send(text, promptKey)` → push user message, `view=chat`, `thinking=true`,
  `thinkAgent=agentFor(promptKey)` (or from `meta` event when wired), clear input.
- On first `block` event → `thinking=false`, AI message begins revealing.
- Reveal advances `reveal:{block,char}` per tick; on completion → `showExtras=true`
  after the existing ~320ms delay → citations + insight + actions appear.
- `newChat()` → clear messages, `view=hero`, cancel any in-flight stream.
- `toggleTheme/toggleLang` → persist + re-render; theme writes `data-theme`.
- `toggleSidebar/togglePanel` → flip `sidebarCollapsed`/`panelCollapsed` and persist to
  `localStorage` (desktop rail, §3.3); affects column width only, not the state machine.

**Constraint:** the **visual** reveal cadence (heading vs paragraph vs list step
rates, blinking cursor, fade-up entry) is part of the approved design. When binding to
SSE, drive the same `reveal` model so the cadence is indistinguishable from the
in-memory implementation.

---

## 6. Backend ↔ UI binding (SSE → frozen render)

The only sanctioned integration point. Map the Frozen SSE protocol
(`MASTER_PROMPT §3.6`) onto the existing state machine:

| SSE event | UI effect |
|-----------|-----------|
| `meta {agentKey,lang,messageId}` | set `thinkAgent=agentKey`; create pending AI message with that agent (drives strip + bubble identity) |
| `block {index,type,textDelta?,item?}` | on first block: `thinking=false`; append/extend block `index`; advance `reveal` (cursor visible) |
| `blockEnd {index}` | finalize block `index` (cursor off) |
| `citations {citations}` | store on message (rendered when `showExtras`) |
| `insight {insight}` | store on message |
| `done {messageId,usage}` | mark message done → trigger `showExtras` after the existing delay; unlock composer |
| `error {code,retryable,message}` | stop reveal; show inline retry affordance (no layout change); keep partial blocks |

**Rules:**
- `meta` MUST arrive before any `block` (so the right agent renders from the start).
- The client never re-orders blocks; server emits them in final order, `h` first.
- Reconnect/abort: closing the stream cancels reveal (mirror `newChat`'s cancel).
- History load uses the **persisted** message payload (no SSE) and must render
  identically to a freshly streamed answer (lossless, `DATABASE.md §2.2`).

---

## 7. Accessibility & interaction (additive, non-visual)

These may be added because they do not change approved pixels:
- Inputs/buttons get accessible names (`aria-label`) matching visible/localized text.
- The thread is an `aria-live="polite"` region so streamed answers are announced.
- Focus-visible rings use the existing `--primary` without altering layout.
- Drawer/sheet trap focus while open and close on `Esc` (in addition to backdrop
  click already implemented).
- Color is never the sole signal: agent identity also carries emoji + text label
  (already true).
**Constraint:** no a11y change may alter spacing, color, or hierarchy.

---

## 8. Responsive behavior (frozen)

- **Desktop (≥1080):** all three columns fixed; right panel always visible; no topbar.
- **Tablet (720–1079):** left fixed 248; topbar appears with Insights button opening
  the right slide-over; right panel hidden until opened.
- **Mobile (<720):** left becomes a drawer opened from the topbar menu; right becomes
  a bottom sheet (grabber + close) opened from the Insights button; suggested cards go
  single-column; hero scales down.
**Rule:** the same components render in all modes — only their container transform/
position changes. No mobile-specific redesign.

---

## 9. Theming & i18n rules

- Theme is applied by setting `data-theme="dark|light"` on `<html>`; all visuals come
  from tokens (§2). Persisted in `am_theme`.
- Desktop column collapse persists in `am_sidebar_collapsed` / `am_panel_collapsed`
  (`"1"`/`"0"`), restored on mount (§3.3).
- Language toggles `lang` (`en|id`), persisted in `am_lang`. **All** user-facing
  strings come from `STRINGS[lang]`, `PANEL[lang]`, `PROMPTS[*][lang]`, agent display
  names `AGENTS[k][lang]`, and the localized disclaimer. No hardcoded English in
  components.
- The active `lang` is sent to the backend and governs answer language and RAG
  filtering (`MASTER_PROMPT §1.2`). UI lang and answer lang must agree.

---

## 10. Failure & empty states (UI-side)

| Condition | UI behavior (no layout change) |
|-----------|-------------------------------|
| Stream `error` (retryable) | partial blocks stay; inline "try again" control; composer re-enabled |
| Stream `error` (fatal) | minimal `h+p` apology message in active lang (server-provided) renders in the normal bubble |
| 0 citations | "SOURCES" block omitted (no empty grid); answer + insight still render |
| Insight omitted (gen failed) | insight card omitted gracefully; rest of answer unchanged |
| Empty conversation | Hero state with seed panel + suggested prompts |
| History empty | sidebar shows groups with no items (no error) |
| Offline/network drop mid-stream | reveal halts; inline retry; no crash |

**Rule:** every degraded state reuses existing components/space; never introduce a new
modal, banner, or layout to express an error.

---

## 11. Performance budgets (UI)

- First meaningful paint of hero is static/server-rendered (`page.tsx` server wrapper
  → `AgrimindApp`).
- First streamed token target < 2.5s (thinking indicator covers the gap,
  `MASTER_PROMPT §8`).
- Reveal runs on a timer/stream tick; keep it off the main-thread-blocking path
  (no heavy work per character).
- Thread autoscroll uses the existing `threadRef` behavior; do not add layout
  thrash per token.

---

## 12. Acceptance criteria (UI system)

1. **Pixel parity:** rendered output matches the approved `AgriMindAI.html` across the
   three breakpoints and both themes (visual diff gate).
2. **Placement parity:** Left→Main→Right and Topbar→AgentStatus→Thread→Composer order
   unchanged; all six required components present.
3. **Agent identity coherence:** strip, thinking bubble, and AI bubble show the same
   agent (= `meta.agentKey`) for every answer.
4. **Streaming fidelity:** SSE-driven reveal is visually indistinguishable from the
   reference in-memory reveal (block order, cursor, fade-up, delayed extras).
5. **Citation truthfulness:** "SOURCES · N" equals rendered card count equals used
   sources; no empty/duplicated cards.
6. **i18n completeness:** toggling `id` localizes every visible string and routes
   answers in Indonesian; no English leakage.
7. **Lossless history:** a reloaded conversation renders identically to its original
   stream.
8. **No unauthorized visual change:** CI visual-diff blocks any PR that alters approved
   pixels without an explicit re-approval task.

---

## 13. SSE client reducer (the only sanctioned integration code path)

The network layer feeds events into a reducer that drives the **existing** state
machine (`use-agrimind.ts` §5). This is a precise contract so the implementing agent
does not improvise the binding and accidentally change the reveal.

### 13.1 Connection
- `send(text, promptKey)` (existing) is extended to `POST /api/chat` and read the SSE
  body via `fetch` + `ReadableStream` (not `EventSource`, which can't POST/send the
  session cookie + idempotency header cleanly). Parse `event:`/`data:` frames manually.
- An `AbortController` is stored on the in-flight turn; `newChat()` and a new `send()`
  abort the previous controller (mirrors the existing stream-cancel in `newChat`).

### 13.2 Event → state transitions (exhaustive)
```
on "meta"     : thinking=true→ create pending AI message {id, agentKey, blocks:[],
                reveal:{block:0,char:0}, done:false, showExtras:false};
                thinkAgent = agentKey   // strip + bubble identity
on "block"    : if first content: thinking=false;
                ensure block[index] exists with the given type;
                append textDelta (h/p) or push item (ul); advance reveal cursor
on "blockEnd" : mark block[index] complete (cursor off for that block)
on "citations": store on message (NOT shown until showExtras)
on "insight"  : store insight on message
on "done"     : message.done=true; after the existing ~320ms delay set showExtras=true;
                unlock composer; record traceId/usage
on "error"    : stop reveal; keep partial blocks; set message.error={code,retryable};
                unlock composer; show inline retry if retryable
```

### 13.3 Invariants the reducer MUST preserve
- The **reveal cadence is unchanged**: the reducer feeds the same `reveal:{block,char}`
  model; per-character timing/blinking cursor/fade-up/delayed extras are identical to
  the reference in-memory implementation.
- `meta` before any `block` (server-guaranteed); if a `block` arrives with no prior
  `meta`, treat as fatal error (do not guess an agent).
- Unknown event names are ignored (forward-compatible with additive protocol changes,
  `MASTER_PROMPT §16.3`).
- The reducer is pure with respect to the event + prior state; all side effects
  (scroll) stay in the existing effect hooks.

### 13.4 Reconnect & resume policy (v1)
- v1 does **not** resume a dropped stream mid-turn. On disconnect before `done`:
  - keep the partial answer visible, set an inline retryable error,
  - re-send re-runs the turn (idempotency key prevents a duplicate *completed* answer;
    an in-flight original is 409'd and the client adopts the original's result if it
    lands).
- History (`GET /conversations/:id`) is the durable source; a completed answer that the
  client missed the `done` for is recovered on next conversation load (lossless §6).

---

## 14. Error & status UX states (frozen-component, no new chrome)

Every state below reuses existing components and space; **no new modal/banner/toast**
that alters layout.

| State | Trigger | Exact UI |
|-------|---------|---------|
| Sending | composer submit | composer disabled; thinking strip active with routed agent |
| Streaming | first `block` | AI bubble reveals block-by-block, blinking cursor |
| Retryable error | `error{retryable}` / disconnect | partial blocks stay; a small inline "Try again" text-button in the muted action row; composer re-enabled |
| Fatal error | `error{!retryable}` | server-provided minimal `h+p` apology renders in the normal AI bubble; composer re-enabled |
| Rate limited (429) | pre-stream | inline muted line in active lang using `Retry-After`; composer re-enabled after countdown |
| Content blocked | `content_blocked` | neutral localized refusal as a normal `h+p` AI bubble (no scary styling) |
| Empty conversation | `view==="hero"` | hero + seed panel + 5 suggested cards |
| Offline | network down | reveal halts; retry affordance; existing components only |

**Localization:** all of these strings come from the localized string set; add new keys
to `STRINGS[lang]` (do not hardcode). New strings are content additions, not visual
changes, so they pass the freeze policy (§1) as long as they render in existing
elements with existing styles.

---

## 15. Accessibility specification (additive, non-visual)

These are required for production and do not change approved pixels:
- **Live region:** the thread container is `aria-live="polite"`, `aria-busy` true while
  streaming, so screen readers announce the streamed answer once settled (not per
  character — announce on `blockEnd`/`done`, not on every delta).
- **Names:** every icon-only button (attach, send, theme, lang, menu, insights, close)
  has an `aria-label` from the localized string set; the send button is also disabled
  via `aria-disabled` mirroring the visual disabled state.
- **Agent identity** is conveyed by emoji + colored text label (not color alone) —
  already true; do not regress to color-only.
- **Focus management:** opening the mobile drawer / bottom sheet moves focus into it and
  traps focus; `Esc` and backdrop click close it and return focus to the trigger.
- **Keyboard:** Enter sends, Shift+Enter newline (existing); all interactive cards
  (suggested prompts, citations, topics, knowledge) are real `button`/`a` elements,
  focusable and operable by keyboard.
- **Contrast:** token pairs meet WCAG AA for text; the `--muted` on `--bg` pairing is
  verified in both themes (audited in CI, §16).
- **Reduced motion:** honor `prefers-reduced-motion` by shortening/disabling the float
  glow and fade-up animations (the reveal still functions; only decorative motion is
  reduced). This is a behavior toggle, not a layout change.

**Constraint:** no a11y change may alter spacing, color, hierarchy, or component
placement.

---

## 16. Visual-regression & UI CI gating (tooling-level)

The "visual diff gate" referenced throughout is operationalized as:
- **Story matrix:** a fixed set of states captured deterministically — hero (en/dark,
  en/light, id/dark, id/light), chat with a streamed answer at `showExtras`, thinking
  state per agent, citations grid at N=2 and N≥3, insight panel, tablet slide-over,
  mobile drawer + bottom sheet.
- **Capture:** screenshots at the three breakpoints (e.g. 1280, 900, 390 widths) with
  fonts loaded and animations frozen (seek to a fixed frame) for stable diffs.
- **Diff gate:** pixel diff against approved baselines with a near-zero tolerance; any
  diff fails CI and requires either a fix or an explicit baseline re-approval task
  (which is the only sanctioned way to change approved pixels, §1).
- **Token audit:** automated check that components reference CSS variables (no stray
  hex except the approved brand constants) and that contrast pairs pass AA.
- **a11y audit:** automated axe pass on the story matrix; violations block merge.

---

## 17. UI performance instrumentation

- **Web Vitals:** capture LCP (hero), INP, CLS via the Next.js metrics hook; budget
  CLS ≈ 0 (the streaming reveal must not shift layout — blocks grow downward in a
  stable column).
- **First-token (client-measured):** time from `send()` to first `block` event; report
  to the same telemetry as the server `firstTokenMs` for end-to-end correlation via
  `traceId`.
- **Reveal cost:** the per-tick reveal must not do O(n) work over the whole answer each
  tick; it advances only the active block. Long answers must not degrade frame rate.
- **No layout thrash:** autoscroll uses the existing `threadRef` write in an effect;
  do not read layout per token.
- **Bundle discipline:** server-only modules (`@/server/*`) never enter the client
  bundle (enforced by the import-boundary lint rule, `ARCHITECTURE.md §2`); the chat
  client stays lean.

---

## 18. UI ↔ contract change protocol

Because the UI is frozen, any backend change that would alter a rendered shape is a
**Frozen Contract** change (`MASTER_PROMPT §3`, §16.3) and requires:
1. A re-approval task that updates this document and the approved baselines together.
2. A coordinated client+server release (the SSE reducer §13 and the renderers update in
   lockstep).
3. A new visual-regression baseline captured from the approved design.
Absent all three, the change is rejected by the visual-diff and contract gates.
