"use client";

import { useState, type CSSProperties } from "react";
import { STRINGS, disclaimerText } from "@/lib/data";
import { useAgrimind } from "@/hooks/use-agrimind";
import { Sidebar } from "@/components/sidebar";
import { AgentStatus } from "@/components/agent-status";
import { Hero } from "@/components/hero";
import { ChatThread } from "@/components/chat-thread";
import { InsightPanel } from "@/components/insight-panel";
import { Hoverable } from "@/components/hoverable";
import { BrandMark, MenuIcon, PaperclipIcon, SendArrowIcon, SparkIcon } from "@/components/icons";

export function AgrimindApp() {
  const app = useAgrimind();
  const { bp, lang, theme } = app;
  const { isMobile, isTablet, isDesktop } = bp;

  const t = STRINGS[lang];
  const panel = app.panel; // dynamic Insights Panel (seed until a conversation populates it)

  // ---- layout geometry (mirrors renderVals) ----
  // Desktop can collapse the sidebar to a slim icon rail; tablet/mobile use the drawer.
  const railW = 64;
  const collapsed = isDesktop && app.sidebarCollapsed;
  const panelCollapsed = isDesktop && app.panelCollapsed;
  const Wl = collapsed ? railW : isTablet ? 248 : 280;
  const Wr = isDesktop ? (panelCollapsed ? railW : 340) : isTablet ? 360 : 0;
  const leftShown = !isMobile || app.drawerOpen;
  const rightShown = isDesktop || app.sheetOpen;

  const leftWrap: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: Wl,
    zIndex: isMobile ? 70 : 40,
    transform: leftShown ? "translateX(0)" : "translateX(-100%)",
    transition: "transform .3s cubic-bezier(.4,0,.2,1), width .25s cubic-bezier(.4,0,.2,1)",
  };

  let rightWrap: CSSProperties;
  if (isDesktop) {
    rightWrap = {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      width: Wr,
      zIndex: 40,
      transition: "width .25s cubic-bezier(.4,0,.2,1)",
    };
  } else if (isTablet) {
    rightWrap = {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      width: 360,
      maxWidth: "86vw",
      zIndex: 60,
      boxShadow: "-16px 0 50px rgba(0,0,0,.35)",
      transform: rightShown ? "translateX(0)" : "translateX(110%)",
      transition: "transform .3s cubic-bezier(.4,0,.2,1)",
    };
  } else {
    rightWrap = {
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      height: "78vh",
      zIndex: 60,
      borderRadius: "22px 22px 0 0",
      overflow: "hidden",
      boxShadow: "0 -16px 50px rgba(0,0,0,.4)",
      transform: rightShown ? "translateY(0)" : "translateY(110%)",
      transition: "transform .32s cubic-bezier(.4,0,.2,1)",
    };
  }

  const mainStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    marginLeft: isMobile ? 0 : Wl,
    marginRight: isDesktop ? Wr : 0,
    transition: "margin .25s",
  };

  const canSend = app.input.trim().length > 0 && !app.thinking;

  return (
    <div
      style={{
        position: "relative",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--text)",
        WebkitFontSmoothing: "antialiased",
        transition: "background .35s, color .35s",
      }}
    >
      {/* ===== LEFT SIDEBAR ===== */}
      <aside style={leftWrap}>
        <Sidebar
          t={t}
          history={app.historyGroups}
          activeId={app.activeId}
          theme={theme}
          lang={lang}
          collapsed={collapsed}
          canCollapse={isDesktop}
          onToggleCollapse={app.toggleSidebar}
          newChat={app.newChat}
          loadChat={app.loadChat}
          toggleTheme={app.toggleTheme}
          toggleLang={app.toggleLang}
          deleteChat={app.deleteChat}
          togglePinStatus={app.togglePinStatus}
          toggleArchiveStatus={app.toggleArchiveStatus}
        />
      </aside>

      {/* ===== MAIN ===== */}
      <main style={mainStyle}>
        {/* topbar (tablet/mobile) */}
        {!isDesktop && (
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: "color-mix(in srgb, var(--bg) 86%, transparent)",
              backdropFilter: "blur(12px)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {isMobile && (
              <button
                onClick={app.openDrawer}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--card)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <MenuIcon />
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: "linear-gradient(140deg, var(--primary), var(--secondary))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BrandMark size={11} ringWidth={2.2} />
              </div>
              <span className="font-sora" style={{ fontWeight: 700, fontSize: 14 }}>
                AgriMind<span style={{ color: "var(--primary)" }}> AI</span>
              </span>
            </div>
            <button
              onClick={app.openSheet}
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 13px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--card)",
                color: "var(--text)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <SparkIcon />
              {t.insights}
            </button>
          </div>
        )}

        {/* agent status strip */}
        <AgentStatus t={t} lang={lang} thinking={app.thinking} thinkAgent={app.thinkAgent} />

        {/* thread / hero */}
        <div ref={app.threadRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative" }}>
          {app.view === "hero" ? (
            <Hero t={t} lang={lang} isMobile={isMobile} onPick={app.send} />
          ) : (
            <ChatThread
              messages={app.messages}
              lang={lang}
              t={t}
              panelInsightTitle={panel.insightTitle}
              thinking={app.thinking}
              thinkAgent={app.thinkAgent}
            />
          )}
        </div>

        {/* composer */}
        <Composer
          value={app.input}
          placeholder={t.composer}
          disclaimer={disclaimerText[lang]}
          canSend={canSend}
          onChange={app.setInput}
          onSend={app.onSend}
        />
      </main>

      {/* ===== RIGHT INSIGHTS ===== */}
      <aside style={rightWrap}>
        <InsightPanel
          panel={panel}
          t={t}
          showGrabber={isMobile}
          showClose={!isDesktop}
          onClose={app.closeSheet}
          collapsed={panelCollapsed}
          canCollapse={isDesktop}
          onToggleCollapse={app.togglePanel}
        />
      </aside>

      {/* backdrops */}
      {isMobile && app.drawerOpen && (
        <div
          onClick={app.closeDrawer}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 65,
            background: "rgba(2,6,12,.55)",
            backdropFilter: "blur(2px)",
            animation: "amFadeIn .2s ease both",
          }}
        />
      )}
      {!isDesktop && app.sheetOpen && (
        <div
          onClick={app.closeSheet}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 55,
            background: "rgba(2,6,12,.55)",
            backdropFilter: "blur(2px)",
            animation: "amFadeIn .2s ease both",
          }}
        />
      )}
    </div>
  );
}

/* ---- Composer ---- */
function Composer({
  value,
  placeholder,
  disclaimer,
  canSend,
  onChange,
  onSend,
}: {
  value: string;
  placeholder: string;
  disclaimer: string;
  canSend: boolean;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{
        padding: "14px 26px 22px",
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
            padding: "9px 9px 9px 16px",
            border: `1px solid ${focused ? "var(--primary)" : "var(--border2)"}`,
            borderRadius: 18,
            background: "var(--card)",
            boxShadow: "var(--shadow)",
            transition: "border-color .2s",
          }}
        >
          <button
            onClick={(e) => e.preventDefault()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              border: "none",
              borderRadius: 10,
              background: "var(--card2)",
              color: "var(--muted)",
              cursor: "pointer",
              flex: "0 0 auto",
              marginBottom: 1,
            }}
          >
            <PaperclipIcon />
          </button>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            rows={1}
            placeholder={placeholder}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              resize: "none",
              color: "var(--text)",
              fontSize: 14.5,
              lineHeight: 1.5,
              padding: "8px 0",
              maxHeight: 120,
            }}
          />
          <Hoverable
            as="button"
            onClick={onSend}
            disabled={!canSend}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 38,
              height: 38,
              border: "none",
              borderRadius: 12,
              background: canSend ? "linear-gradient(135deg, var(--primary), #16a34a)" : "var(--card2)",
              color: canSend ? "#04140a" : "var(--muted)",
              cursor: canSend ? "pointer" : "default",
              flex: "0 0 auto",
              transition: "background .2s, transform .15s",
            }}
            hoverStyle={{ transform: "scale(1.05)" }}
          >
            <SendArrowIcon />
          </Hoverable>
        </div>
        <div
          className="font-mono"
          style={{
            textAlign: "center",
            marginTop: 9,
            fontSize: 10.5,
            color: "var(--muted)",
            letterSpacing: ".03em",
          }}
        >
          {disclaimer}
        </div>
      </div>
    </div>
  );
}
