"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AGENTS,
  FALLBACK,
  PANEL,
  PROMPTS,
  RESPONSES,
} from "@/lib/data";
import type {
  AgentKey,
  AiMessage,
  Block,
  Citation,
  HistoryGroup,
  HistoryItem,
  Lang,
  Message,
  PanelData,
  Theme,
  View,
} from "@/lib/types";
import { streamChat } from "@/lib/chat-stream";

export interface Breakpoint {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

/* display block shape the UI renders (mirrors _displayBlocks) */
export interface DisplayBlock {
  isH: boolean;
  isP: boolean;
  isUl: boolean;
  text: string;
  items: string[];
  cursor: boolean;
}

const STREAM_MS = 16;
const THINK_MS = 1300;
const EXTRAS_MS = 320;

function blockLen(b: Block): number {
  if (b.type === "ul") return (b.items || []).join(" ").length;
  return (b.text || "").length;
}

export function displayBlocks(m: AiMessage): DisplayBlock[] {
  const out: DisplayBlock[] = [];
  const rb = m.reveal.block;
  const rc = m.reveal.char;
  for (let i = 0; i < m.blocks.length; i++) {
    const b = m.blocks[i];
    if (m.done || i < rb) {
      out.push({
        isH: b.type === "h",
        isP: b.type === "p",
        isUl: b.type === "ul",
        text: b.text || "",
        items: b.items || [],
        cursor: false,
      });
    } else if (i === rb) {
      if (b.type === "ul") {
        out.push({ isH: false, isP: false, isUl: true, text: "", items: b.items || [], cursor: false });
      } else {
        out.push({
          isH: b.type === "h",
          isP: b.type === "p",
          isUl: false,
          text: (b.text || "").slice(0, rc),
          items: [],
          cursor: true,
        });
      }
    }
  }
  return out;
}

function agentFor(promptKey: string | null): AgentKey {
  if (promptKey) {
    const p = PROMPTS.find((x) => x.key === promptKey);
    if (p) return p.agent;
  }
  return FALLBACK.agent;
}

/** Shape of a conversation summary returned by GET /api/conversations. */
interface ConversationSummaryDTO {
  id: string;
  title: string;
  updatedAt: string;
  isPinned?: boolean;
  isArchived?: boolean;
}

/** Shape of a message returned by GET /api/conversations/:id (lossless payload). */
interface ThreadMessageDTO {
  id: string;
  role: "user" | "ai";
  text?: string;
  agentKey?: AgentKey;
  blocks?: Block[];
  citations?: Citation[];
  insight?: string | null;
}

function groupConversations(conversations: ConversationSummaryDTO[], lang: Lang): HistoryGroup[] {
  const groups: { [key: string]: HistoryItem[] } = {
    pinned: [],
    today: [],
    yesterday: [],
    last7: [],
    older: [],
    archived: [],
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const last7Start = todayStart - 7 * 86400000;

  for (const c of conversations) {
    if (c.isArchived) {
      groups.archived.push(c);
      continue;
    }
    if (c.isPinned) {
      groups.pinned.push(c);
      continue;
    }
    const d = new Date(c.updatedAt).getTime();
    if (d >= todayStart) {
      groups.today.push(c);
    } else if (d >= yesterdayStart) {
      groups.yesterday.push(c);
    } else if (d >= last7Start) {
      groups.last7.push(c);
    } else {
      groups.older.push(c);
    }
  }

  const out: HistoryGroup[] = [];
  if (groups.pinned.length) {
    out.push({ group: lang === "id" ? "Disematkan" : "Pinned", items: groups.pinned });
  }
  if (groups.today.length) {
    out.push({ group: lang === "id" ? "Hari ini" : "Today", items: groups.today });
  }
  if (groups.yesterday.length) {
    out.push({ group: lang === "id" ? "Kemarin" : "Yesterday", items: groups.yesterday });
  }
  if (groups.last7.length) {
    out.push({ group: lang === "id" ? "7 hari terakhir" : "Last 7 days", items: groups.last7 });
  }
  if (groups.older.length) {
    out.push({ group: lang === "id" ? "Lebih lama" : "Older", items: groups.older });
  }
  if (groups.archived.length) {
    out.push({ group: lang === "id" ? "Diarsipkan" : "Archived", items: groups.archived });
  }

  return out;
}

export function useAgrimind() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<View>("hero");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [thinkAgent, setThinkAgent] = useState<AgentKey>("agronomist");
  const [width, setWidth] = useState<number>(1280);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Desktop-only: collapse the left sidebar to a slim icon rail. */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  /** Desktop-only: collapse the right insights panel to a slim icon rail. */
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  /** Dynamic Insights Panel data (seed until a conversation populates it). */
  const [panel, setPanel] = useState<PanelData>(PANEL.en);

  const midx = useRef(0);
  const streamRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extrasRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  /** Aborts an in-flight network chat stream (UI §13.1). */
  const netAbortRef = useRef<(() => void) | null>(null);
  const convoIdRef = useRef<string | undefined>(undefined);

  /* ---- mount: restore prefs + resize listener ---- */
  useEffect(() => {
    try {
      const th = localStorage.getItem("am_theme");
      const lg = localStorage.getItem("am_lang");
      if (th === "dark" || th === "light") setTheme(th);
      if (lg === "en" || lg === "id") setLang(lg);
      if (localStorage.getItem("am_sidebar_collapsed") === "1") setSidebarCollapsed(true);
      if (localStorage.getItem("am_panel_collapsed") === "1") setPanelCollapsed(true);
    } catch { }
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (streamRef.current) clearInterval(streamRef.current);
      if (thinkRef.current) clearTimeout(thinkRef.current);
      if (extrasRef.current) clearTimeout(extrasRef.current);
      if (netAbortRef.current) netAbortRef.current();
    };
  }, []);

  /* ---- apply theme attribute ---- */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  /* ---- fetch history ---- */
  const fetchHistory = useCallback(async (currentLang: Lang) => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setHistoryGroups(groupConversations(data.conversations || [], currentLang));
      }
    } catch (e) {
      console.error("Failed to fetch history", e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  /* ---- fetch the dynamic Insights Panel for the active conversation ---- */
  const fetchPanel = useCallback(async (currentLang: Lang) => {
    const id = convoIdRef.current;
    if (!id) {
      setPanel(PANEL[currentLang]); // no conversation yet → localized seed
      return;
    }
    try {
      const res = await fetch(`/api/conversations/${id}/panel?lang=${currentLang}`);
      if (res.ok) {
        const data = await res.json();
        if (data.panel) setPanel(data.panel as PanelData);
      }
    } catch {
      /* keep current panel on error */
    }
  }, []);

  /* ---- initial fetch & lang change updates history + panel ---- */
  useEffect(() => {
    fetchHistory(lang);
    fetchPanel(lang);
  }, [lang, fetchHistory, fetchPanel]);

  /* ---- autoscroll thread on update (mirrors componentDidUpdate) ---- */
  useEffect(() => {
    if (view === "chat" && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  });

  const bp: Breakpoint = {
    isMobile: width < 720,
    isTablet: width >= 720 && width < 1080,
    isDesktop: width >= 1080,
  };

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const t = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("am_theme", t);
      } catch { }
      return t;
    });
  }, []);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const l = prev === "en" ? "id" : "en";
      try {
        localStorage.setItem("am_lang", l);
      } catch { }
      return l;
    });
  }, []);

  const newChat = useCallback(() => {
    if (streamRef.current) clearInterval(streamRef.current);
    if (thinkRef.current) clearTimeout(thinkRef.current);
    if (extrasRef.current) clearTimeout(extrasRef.current);
    if (netAbortRef.current) netAbortRef.current();
    convoIdRef.current = undefined;
    setMessages([]);
    setView("hero");
    setInput("");
    setThinking(false);
    setDrawerOpen(false);
    setPanel(PANEL[lang]); // new chat → localized seed panel
  }, [lang]);

  const loadChat = useCallback(async (id: string) => {
    if (streamRef.current) clearInterval(streamRef.current);
    if (thinkRef.current) clearTimeout(thinkRef.current);
    if (extrasRef.current) clearTimeout(extrasRef.current);
    if (netAbortRef.current) netAbortRef.current();

    setMessages([]);
    setView("chat");
    setThinking(false);
    setDrawerOpen(false);
    convoIdRef.current = id;
    fetchPanel(lang); // load this conversation's dynamic Insights Panel

    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = (await res.json()) as { messages: ThreadMessageDTO[] };
        const loadedMessages: Message[] = data.messages.map((m): Message => {
          if (m.role === "user") {
            return { id: m.id, role: "user", text: m.text ?? "" };
          } else {
            const blocks = m.blocks || [];
            return {
              id: m.id,
              role: "ai",
              agentKey: m.agentKey || "agronomist",
              blocks,
              citations: m.citations || [],
              insight: m.insight || "",
              reveal: { block: blocks.length, char: 0 },
              done: true,
              showExtras: true,
            };
          }
        });
        setMessages(loadedMessages);
      }
    } catch (e) {
      console.error("Failed to load chat", e);
    }
  }, [lang, fetchPanel]);

  /* ---- streaming tick (mirrors _tick) ---- */
  const tick = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || m.role !== "ai" || m.done) return m;
        const am = m as AiMessage;
        let block = am.reveal.block;
        let char = am.reveal.char;
        const blk = am.blocks[block];
        if (!blk) return { ...am, done: true };
        const len = blockLen(blk);
        const step = blk.type === "ul" ? 14 : 5;
        char += step;
        if (char >= len) {
          block += 1;
          char = 0;
        }
        if (block >= am.blocks.length) {
          if (streamRef.current) clearInterval(streamRef.current);
          extrasRef.current = setTimeout(() => {
            setMessages((cur) =>
              cur.map((mm) =>
                mm.id === msgId && mm.role === "ai" ? { ...mm, showExtras: true } : mm,
              ),
            );
          }, EXTRAS_MS);
          return { ...am, reveal: { block: am.blocks.length, char: 0 }, done: true };
        }
        return { ...am, reveal: { block, char } };
      }),
    );
  }, []);

  /**
   * Begin the timer-based reveal of a fully-known AI message. Shared by the in-memory
   * and the network paths so the reveal cadence is IDENTICAL (UI §13.3).
   */
  const startReveal = useCallback(
    (aiMsg: AiMessage) => {
      setMessages((prev) => [...prev, aiMsg]);
      setThinking(false);
      if (streamRef.current) clearInterval(streamRef.current);
      streamRef.current = setInterval(() => tick(aiMsg.id), STREAM_MS);
    },
    [tick],
  );

  /* ---- respond (mirrors _respond) — in-memory fallback path ---- */
  const respond = useCallback(
    (promptKey: string | null, agentKey: AgentKey) => {
      const payload =
        promptKey && RESPONSES[promptKey] ? RESPONSES[promptKey][lang] : FALLBACK[lang];
      const id = midx.current + 1;
      midx.current = id;
      startReveal({
        id: "a" + id,
        role: "ai",
        agentKey,
        blocks: payload.blocks,
        citations: payload.citations,
        insight: payload.insight,
        reveal: { block: 0, char: 0 },
        done: false,
        showExtras: false,
      });
    },
    [lang, startReveal],
  );

  /**
   * Network path: POST /api/chat, accumulate the answer's blocks from SSE, then run the
   * SAME timer reveal over the fully-known blocks. Falls back to the in-memory `respond`
   * on any network/stream error so the UI still works offline (UI §13.4, §14).
   */
  const respondFromNetwork = useCallback(
    (text: string, promptKey: string | null, fallbackAgent: AgentKey) => {
      let settled = false;
      let netAgent: AgentKey = fallbackAgent;
      let netCitations: Citation[] = [];
      let netInsight = "";

      const fallback = () => {
        if (settled) return;
        settled = true;
        respond(promptKey, fallbackAgent);
      };

      netAbortRef.current = streamChat(
        { text, lang, promptKey: promptKey ?? undefined, conversationId: convoIdRef.current },
        {
          onMeta: (m) => {
            netAgent = m.agentKey;
            setThinkAgent(m.agentKey);
            if (!convoIdRef.current) {
              convoIdRef.current = m.conversationId;
              // Trigger a background refresh of the history list
              fetchHistory(lang);
            }
          },
          onCitations: (c) => {
            netCitations = c;
          },
          onInsight: (i) => {
            netInsight = i;
          },
          onBlocks: (blocks) => {
            if (settled) return;
            settled = true;
            const id = midx.current + 1;
            midx.current = id;
            startReveal({
              id: "a" + id,
              role: "ai",
              agentKey: netAgent,
              blocks: blocks.length ? blocks : FALLBACK[lang].blocks,
              citations: netCitations,
              insight: netInsight,
              reveal: { block: 0, char: 0 },
              done: false,
              showExtras: false,
            });
          },
          onDone: () => {
            // Insights are generated async (~a few seconds after `done`); refetch the
            // Insights Panel a bit later so the sidebar reflects the new answer.
            setTimeout(() => fetchPanel(lang), 5000);
          },
          onError: () => fallback(),
        },
      );
    },
    [lang, respond, startReveal, fetchHistory, fetchPanel],
  );

  /* ---- send (mirrors _send) — network-backed with in-memory fallback ---- */
  const send = useCallback(
    (text: string, promptKey: string | null) => {
      const txt = (text || "").trim();
      if (!txt || thinking) return;
      if (streamRef.current) clearInterval(streamRef.current);
      if (netAbortRef.current) netAbortRef.current();
      const id = midx.current + 1;
      midx.current = id;
      const agentKey = agentFor(promptKey);
      const userMsg: Message = { id: "u" + id, role: "user", text: txt };
      setMessages((prev) => [...prev, userMsg]);
      setView("chat");
      setInput("");
      setThinking(true);
      setThinkAgent(agentKey);
      // Kick off the network request immediately; the thinking indicator stays until the
      // answer's blocks arrive (or the THINK_MS floor for the in-memory fallback).
      thinkRef.current = setTimeout(() => respondFromNetwork(txt, promptKey, agentKey), THINK_MS);
    },
    [thinking, respondFromNetwork],
  );

  const onSend = useCallback(() => send(input, null), [send, input]);

  const deleteChat = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (convoIdRef.current === id) newChat();
        fetchHistory(lang);
      }
    } catch { }
  }, [lang, fetchHistory, newChat]);

  const togglePinStatus = useCallback(async (id: string, isPinned: boolean) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned }),
      });
      if (res.ok) fetchHistory(lang);
    } catch { }
  }, [lang, fetchHistory]);

  const toggleArchiveStatus = useCallback(async (id: string, isArchived: boolean) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived }),
      });
      if (res.ok) {
        if (isArchived && convoIdRef.current === id) newChat();
        fetchHistory(lang);
      }
    } catch { }
  }, [lang, fetchHistory, newChat]);

  return {
    // state
    theme,
    lang,
    view,
    messages,
    input,
    thinking,
    thinkAgent,
    width,
    drawerOpen,
    sheetOpen,
    sidebarCollapsed,
    panelCollapsed,
    bp,
    historyGroups,
    historyLoading,
    activeId: convoIdRef.current,
    panel,
    // refs
    threadRef,
    // setters/actions
    setInput,
    toggleTheme,
    toggleLang,
    newChat,
    loadChat,
    send,
    onSend,
    fetchHistory,
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
    openSheet: () => setSheetOpen(true),
    closeSheet: () => setSheetOpen(false),
    toggleSidebar: () =>
      setSidebarCollapsed((c) => {
        const next = !c;
        try {
          localStorage.setItem("am_sidebar_collapsed", next ? "1" : "0");
        } catch { }
        return next;
      }),
    togglePanel: () =>
      setPanelCollapsed((c) => {
        const next = !c;
        try {
          localStorage.setItem("am_panel_collapsed", next ? "1" : "0");
        } catch { }
        return next;
      }),
    deleteChat,
    togglePinStatus,
    toggleArchiveStatus,
  };
}

export { AGENTS };
