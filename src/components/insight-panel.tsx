"use client";

import type { PanelData, Strings } from "@/lib/types";
import { Hoverable } from "./hoverable";
import { ArrowUpRight, BulbIcon, CloseIcon } from "./icons";

interface InsightPanelProps {
  panel: PanelData;
  t: Strings;
  showGrabber: boolean;
  showClose: boolean;
  onClose: () => void;
}

export function InsightPanel({ panel, t, showGrabber, showClose, onClose }: InsightPanelProps) {
  const learning = panel.learning.map((l) => ({ ...l, width: l.pct + "%" }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg2)",
        borderLeft: "1px solid var(--border)",
        overflowY: "auto",
      }}
    >
      {showGrabber && (
        <div style={{ display: "flex", justifyContent: "center", padding: "9px 0 2px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--border2)" }} />
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 18px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <BulbIcon />
          <span className="font-sora" style={{ fontWeight: 700, fontSize: 15 }}>
            {t.insights}
          </span>
        </div>
        {showClose && (
          <button
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              border: "1px solid var(--border)",
              borderRadius: 9,
              background: "var(--card)",
              color: "var(--muted)",
              cursor: "pointer",
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div style={{ padding: "0 16px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* ai insight feature card */}
        <div
          style={{
            position: "relative",
            padding: 16,
            borderRadius: 16,
            background: "linear-gradient(150deg, var(--primary-soft), var(--secondary-soft))",
            border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -26,
              right: -24,
              width: 110,
              height: 110,
              borderRadius: "50%",
              background: "radial-gradient(circle, var(--secondary-soft), transparent 70%)",
            }}
          />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 14 }}>💡</span>
            <span
              className="font-sora"
              style={{
                fontWeight: 700,
                fontSize: 12.5,
                background: "linear-gradient(90deg, var(--primary), var(--secondary))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {panel.insightTitle}
            </span>
          </div>
          <p style={{ position: "relative", margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text)", fontWeight: 500 }}>
            {panel.insight}
          </p>
        </div>

        {/* recommended topics */}
        <div>
          <div
            className="font-mono"
            style={{ fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 11 }}
          >
            {panel.topicsTitle}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {panel.topics.map((tp, i) => (
              <Hoverable
                key={i}
                as="button"
                onClick={(e: React.MouseEvent) => e.preventDefault()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "var(--card)",
                  cursor: "pointer",
                  transition: "transform .15s, border-color .2s",
                }}
                hoverStyle={{ transform: "translateX(2px)", borderColor: "var(--primary)" }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--primary)", flex: "0 0 auto" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", flex: 1, textAlign: "left" }}>
                  {tp.name}
                </span>
                <span className="font-mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                  {tp.tag}
                </span>
              </Hoverable>
            ))}
          </div>
        </div>

        {/* related knowledge */}
        <div>
          <div
            className="font-mono"
            style={{ fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 11 }}
          >
            {panel.knowledgeTitle}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {panel.knowledge.map((k, i) => {
              // Clickable when the source has a real URL (web); internal KB docs stay non-navigating.
              const hasLink = typeof k.url === "string" && /^https?:\/\//.test(k.url);
              return (
              <Hoverable
                key={i}
                as="a"
                href={hasLink ? k.url : "#"}
                {...(hasLink
                  ? { target: "_blank", rel: "noopener noreferrer", title: k.url }
                  : { onClick: (e: React.MouseEvent) => e.preventDefault() })}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "var(--card)",
                  textDecoration: "none",
                  transition: "border-color .2s",
                }}
                hoverStyle={{ borderColor: "var(--secondary)" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 9.5,
                      padding: "2px 8px",
                      borderRadius: 99,
                      background: "var(--secondary-soft)",
                      color: "var(--secondary)",
                      fontWeight: 600,
                    }}
                  >
                    {k.cat}
                  </span>
                  <ArrowUpRight width={13} height={13} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
                  {k.title}
                </span>
                <span className="font-mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                  {k.source}
                </span>
              </Hoverable>
              );
            })}
          </div>
        </div>

        {/* learning path */}
        <div>
          <div
            className="font-mono"
            style={{ fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 11 }}
          >
            {panel.learningTitle}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 14,
              border: "1px solid var(--border)",
              borderRadius: 14,
              background: "var(--card)",
            }}
          >
            {learning.map((ls, i) => (
              <div key={i}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{ls.name}</span>
                  <span className="font-mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                    {ls.pct}%
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: "var(--card2)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: ls.width,
                      borderRadius: 99,
                      background: "linear-gradient(90deg, var(--primary), var(--secondary))",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
