"use client";

import { useState, type CSSProperties } from "react";
import type { HistoryGroup, Lang, Strings, Theme } from "@/lib/types";
import { Hoverable } from "./hoverable";
import {
  BrandMark,
  ChatIcon,
  DotsIcon,
  GlobeIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  TrashIcon,
  PinIcon,
  ArchiveIcon,
  SidebarToggleIcon,
} from "./icons";

interface SidebarProps {
  t: Strings;
  history: HistoryGroup[];
  activeId?: string;
  theme: Theme;
  lang: Lang;
  /** Desktop: render the slim icon rail instead of the full sidebar. */
  collapsed?: boolean;
  /** Whether the collapse toggle is available (desktop only). */
  canCollapse?: boolean;
  onToggleCollapse?: () => void;
  newChat: () => void;
  loadChat: (id: string) => void;
  toggleTheme: () => void;
  toggleLang: () => void;
  deleteChat: (id: string) => void;
  togglePinStatus: (id: string, isPinned: boolean) => void;
  toggleArchiveStatus: (id: string, isArchived: boolean) => void;
}

const hoverItem: CSSProperties = { background: "var(--hover)", color: "var(--text)" };

export function Sidebar({
  t,
  history,
  activeId,
  theme,
  lang,
  collapsed = false,
  canCollapse = false,
  onToggleCollapse,
  newChat,
  loadChat,
  toggleTheme,
  toggleLang,
  deleteChat,
  togglePinStatus,
  toggleArchiveStatus,
}: SidebarProps) {
  const isDark = theme === "dark";
  const collapseLabel =
    lang === "en"
      ? collapsed
        ? "Expand sidebar"
        : "Collapse sidebar"
      : collapsed
        ? "Perlebar sidebar"
        : "Ciutkan sidebar";
  const themeLabel = isDark
    ? lang === "en"
      ? "Dark mode"
      : "Mode gelap"
    : lang === "en"
      ? "Light mode"
      : "Mode terang";
  const langLabel = lang === "en" ? "English" : "Bahasa Indonesia";

  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const filteredHistory = history
    .map((grp) => ({
      ...grp,
      items: grp.items.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((grp) => grp.items.length > 0);

  /* ---- collapsed icon rail (desktop) ---- */
  if (collapsed) {
    const railBtn: CSSProperties = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 38,
      height: 38,
      border: "none",
      borderRadius: 11,
      background: "transparent",
      color: "var(--muted)",
      cursor: "pointer",
      transition: "background .15s, color .15s",
    };

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          height: "100%",
          background: "var(--bg2)",
          borderRight: "1px solid var(--border)",
          padding: "16px 0",
          gap: 6,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: "linear-gradient(140deg, var(--primary), var(--secondary))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 16px rgba(34,197,94,.35)",
            marginBottom: 8,
          }}
        >
          <BrandMark size={13} ringWidth={2.5} />
        </div>

        <Hoverable
          as="button"
          onClick={onToggleCollapse}
          title={collapseLabel}
          aria-label={collapseLabel}
          style={railBtn}
          hoverStyle={hoverItem}
        >
          <SidebarToggleIcon />
        </Hoverable>

        <Hoverable
          as="button"
          onClick={newChat}
          title={t.newChat}
          aria-label={t.newChat}
          style={{
            ...railBtn,
            background: "linear-gradient(135deg, var(--primary), #16a34a)",
            color: "#04140a",
            boxShadow: "0 8px 20px rgba(34,197,94,.28)",
          }}
          hoverStyle={{ transform: "translateY(-1px)" }}
        >
          <PlusIcon />
        </Hoverable>

        <div style={{ flex: 1 }} />

        <Hoverable
          as="button"
          onClick={toggleTheme}
          title={themeLabel}
          aria-label={themeLabel}
          style={railBtn}
          hoverStyle={hoverItem}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </Hoverable>
        <Hoverable
          as="button"
          onClick={toggleLang}
          title={langLabel}
          aria-label={langLabel}
          style={railBtn}
          hoverStyle={hoverItem}
        >
          <GlobeIcon />
        </Hoverable>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg2)",
        borderRight: "1px solid var(--border)",
        padding: "16px 14px",
      }}
    >
      {/* brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 6px 14px" }}>
        <div
          style={{
            position: "relative",
            width: 34,
            height: 34,
            borderRadius: 11,
            background: "linear-gradient(140deg, var(--primary), var(--secondary))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 16px rgba(34,197,94,.35)",
          }}
        >
          <BrandMark size={13} ringWidth={2.5} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span className="font-sora" style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-.02em" }}>
            AgriMind<span style={{ color: "var(--primary)" }}> AI</span>
          </span>
          <span className="font-mono" style={{ fontSize: 9.5, color: "var(--muted)", letterSpacing: ".14em", marginTop: 4 }}>
            AGRI · INTELLIGENCE
          </span>
        </div>
        {canCollapse && (
          <Hoverable
            as="button"
            onClick={onToggleCollapse}
            title={collapseLabel}
            aria-label={collapseLabel}
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              border: "none",
              borderRadius: 9,
              background: "transparent",
              color: "var(--muted)",
              cursor: "pointer",
              flex: "0 0 auto",
              transition: "background .15s, color .15s",
            }}
            hoverStyle={hoverItem}
          >
            <SidebarToggleIcon />
          </Hoverable>
        )}
      </div>

      {/* new chat */}
      <Hoverable
        as="button"
        onClick={newChat}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "11px 13px",
          border: "none",
          borderRadius: 12,
          background: "linear-gradient(135deg, var(--primary), #16a34a)",
          color: "#04140a",
          fontWeight: 700,
          fontSize: 13.5,
          cursor: "pointer",
          boxShadow: "0 8px 20px rgba(34,197,94,.28)",
          transition: "transform .15s, box-shadow .2s",
        }}
        hoverStyle={{ transform: "translateY(-1px)", boxShadow: "0 12px 26px rgba(34,197,94,.4)" }}
      >
        <PlusIcon />
        {t.newChat}
      </Hoverable>

      {/* search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginTop: 12,
          padding: "9px 12px",
          border: "1px solid var(--border)",
          borderRadius: 11,
          background: "var(--card2)",
        }}
      >
        <SearchIcon />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.search}
          style={{
            border: "none",
            background: "transparent",
            outline: "none",
            color: "var(--text)",
            fontSize: 12.5,
            width: "100%",
          }}
        />
      </div>

      {/* history */}
      <div style={{ flex: 1, overflowY: "auto", marginTop: 18, paddingRight: 2 }}>
        {filteredHistory.map((grp) => (
          <div key={grp.group} style={{ marginBottom: 16 }}>
            <div
              className="font-mono"
              style={{
                fontSize: 10,
                letterSpacing: ".13em",
                textTransform: "uppercase",
                color: "var(--muted)",
                padding: "0 8px 7px",
              }}
            >
              {grp.group}
            </div>
            {grp.items.map((item) => (
              <div key={item.id} style={{ position: "relative", width: "100%", marginBottom: 2 }}>
                <Hoverable
                  as="button"
                  onClick={() => {
                    setMenuOpenId(null);
                    loadChat(item.id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 32px 8px 10px",
                    border: "none",
                    background: activeId === item.id ? "var(--hover)" : "transparent",
                    color: activeId === item.id ? "var(--text)" : "var(--muted)",
                    borderRadius: 9,
                    fontSize: 12.8,
                    cursor: "pointer",
                    transition: "background .15s, color .15s",
                  }}
                  hoverStyle={hoverItem}
                >
                  <ChatIcon style={{ opacity: 0.7, flex: "0 0 auto" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.title}
                  </span>
                </Hoverable>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === item.id ? null : item.id);
                  }}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "var(--text)",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: menuOpenId === item.id ? 1 : 0.4,
                  }}
                >
                  <DotsIcon />
                </button>

                {menuOpenId === item.id && (
                  <div style={{
                    position: "absolute",
                    right: 8,
                    top: 32,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 4,
                    zIndex: 20,
                    boxShadow: "0 8px 24px rgba(0,0,0,.2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    minWidth: 120,
                  }}>
                    <Hoverable
                      as="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePinStatus(item.id, !item.isPinned);
                        setMenuOpenId(null);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "transparent", border: "none", color: "var(--text)", fontSize: 12, borderRadius: 5, cursor: "pointer", width: "100%", textAlign: "left"
                      }}
                      hoverStyle={{ background: "var(--hover)" }}
                    >
                      <PinIcon /> {item.isPinned ? "Unpin" : "Pin"}
                    </Hoverable>
                    <Hoverable
                      as="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleArchiveStatus(item.id, !item.isArchived);
                        setMenuOpenId(null);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "transparent", border: "none", color: "var(--text)", fontSize: 12, borderRadius: 5, cursor: "pointer", width: "100%", textAlign: "left"
                      }}
                      hoverStyle={{ background: "var(--hover)" }}
                    >
                      <ArchiveIcon /> {item.isArchived ? "Unarchive" : "Archive"}
                    </Hoverable>
                    <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
                    <Hoverable
                      as="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(item.id);
                        setMenuOpenId(null);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "transparent", border: "none", color: "#ef4444", fontSize: 12, borderRadius: 5, cursor: "pointer", width: "100%", textAlign: "left"
                      }}
                      hoverStyle={{ background: "rgba(239, 68, 68, 0.15)" }}
                    >
                      <TrashIcon /> Delete
                    </Hoverable>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* footer */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 12,
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <Hoverable
          as="button"
          onClick={toggleTheme}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "9px 11px",
            border: "none",
            background: "transparent",
            color: "var(--muted)",
            borderRadius: 10,
            fontSize: 12.8,
            cursor: "pointer",
            transition: "background .15s",
          }}
          hoverStyle={hoverItem}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isDark ? <SunIcon /> : <MoonIcon />}
            {themeLabel}
          </span>
          <span
            style={{
              position: "relative",
              width: 34,
              height: 19,
              borderRadius: 99,
              background: "var(--border2)",
              flex: "0 0 auto",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                width: 15,
                height: 15,
                borderRadius: "50%",
                background: "var(--primary)",
                transition: "left .2s",
                left: isDark ? 2 : 17,
              }}
            />
          </span>
        </Hoverable>

        <Hoverable
          as="button"
          onClick={toggleLang}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "9px 11px",
            border: "none",
            background: "transparent",
            color: "var(--muted)",
            borderRadius: 10,
            fontSize: 12.8,
            cursor: "pointer",
            transition: "background .15s",
          }}
          hoverStyle={hoverItem}
        >
          <GlobeIcon />
          <span>{langLabel}</span>
        </Hoverable>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 7px 2px" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: "linear-gradient(135deg, var(--secondary), var(--primary))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 12,
              color: "#04140a",
              flex: "0 0 auto",
            }}
          >
            AM
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, minWidth: 0 }}>
            <span style={{ fontSize: 12.6, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.user}
            </span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{t.plan}</span>
          </div>
          <DotsIcon style={{ marginLeft: "auto" }} />
        </div>
      </div>
    </div>
  );
}
