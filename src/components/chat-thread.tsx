"use client";

import { useState } from "react";

import { AGENTS } from "@/lib/data";
import type { AgentKey, AiMessage, Lang, Message, Strings } from "@/lib/types";
import { displayBlocks } from "@/hooks/use-agrimind";
import { CitationCards } from "./citation-cards";
import { Hoverable } from "./hoverable";
import { CheckIcon, CopyIcon, RegenerateIcon, ThumbUpIcon } from "./icons";

interface ChatThreadProps {
  messages: Message[];
  lang: Lang;
  t: Strings;
  panelInsightTitle: string;
  thinking: boolean;
  thinkAgent: AgentKey;
}

/* blinking cursor used during the streaming reveal */
function Cursor({ tall }: { tall?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: tall ? 18 : 16,
        background: "var(--primary)",
        marginLeft: 2,
        verticalAlign: tall ? -3 : -2,
        animation: "amBlink 1s step-end infinite",
      }}
    />
  );
}

function AiBubble({
  m,
  lang,
  t,
  panelInsightTitle,
}: {
  m: AiMessage;
  lang: Lang;
  t: Strings;
  panelInsightTitle: string;
}) {
  const a = AGENTS[m.agentKey];
  const blocks = displayBlocks(m);
  const citations = m.citations;

  const [copied, setCopied] = useState(false);
  const [helpful, setHelpful] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    const text = m.blocks
      .map((b) => (b.type === "ul" ? b.items?.map((i) => "- " + i).join("\n") : b.text))
      .join("\n\n");
    navigator.clipboard.writeText(text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHelpful = (e: React.MouseEvent) => {
    e.preventDefault();
    setHelpful(!helpful);
  };

  const handleRegenerate = (e: React.MouseEvent) => {
    e.preventDefault();
    alert("Fitur regenerasi akan hadir di pembaruan berikutnya.");
  };

  return (
    <div style={{ display: "flex", gap: 13, alignItems: "flex-start", animation: "amFadeUp .4s ease both" }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          background: `color-mix(in srgb, ${a.color} 15%, transparent)`,
          border: `1px solid color-mix(in srgb, ${a.color} 30%, transparent)`,
          flex: "0 0 auto",
          marginTop: 1,
        }}
      >
        {a.emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
          <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: a.color }}>
            {a[lang]}
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".05em" }}
          >
            · AGENT
          </span>
        </div>

        <div style={{ fontSize: 14.6, lineHeight: 1.68, color: "var(--text)" }}>
          {blocks.map((b, i) => {
            if (b.isH) {
              return (
                <div
                  key={i}
                  className="font-sora"
                  style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-.01em", margin: "4px 0 10px", lineHeight: 1.3 }}
                >
                  {b.text}
                  {b.cursor && <Cursor tall />}
                </div>
              );
            }
            if (b.isP) {
              return (
                <p key={i} style={{ margin: "0 0 13px" }}>
                  {b.text}
                  {b.cursor && <Cursor />}
                </p>
              );
            }
            if (b.isUl) {
              return (
                <ul
                  key={i}
                  style={{
                    margin: "0 0 13px",
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                  }}
                >
                  {b.items.map((li, j) => (
                    <li key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          background: "var(--primary-soft)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flex: "0 0 auto",
                          marginTop: 1,
                        }}
                      >
                        <CheckIcon />
                      </span>
                      <span>{li}</span>
                    </li>
                  ))}
                </ul>
              );
            }
            return null;
          })}
        </div>

        {/* citations + insight + actions */}
        {m.showExtras && (
          <div style={{ animation: "amFadeUp .45s ease both" }}>
            <CitationCards citations={citations} t={t} />

            {/* AgriMind Insight */}
            <div
              style={{
                position: "relative",
                padding: "16px 18px",
                borderRadius: 16,
                background: "linear-gradient(135deg, var(--primary-soft), var(--secondary-soft))",
                border: "1px solid color-mix(in srgb, var(--primary) 35%, transparent)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -30,
                  right: -20,
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, var(--primary-soft), transparent 70%)",
                }}
              />
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
                <span style={{ fontSize: 15 }}>💡</span>
                <span
                  className="font-sora"
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    background: "linear-gradient(90deg, var(--primary), var(--secondary))",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {panelInsightTitle}
                </span>
              </div>
              <p
                style={{
                  position: "relative",
                  margin: 0,
                  fontSize: 13.8,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  fontWeight: 500,
                }}
              >
                {m.insight}
              </p>
            </div>

            {/* action row */}
            <div style={{ display: "flex", gap: 6, marginTop: 13 }}>
              <Hoverable
                as="button"
                onClick={handleRegenerate}
                style={actionBtn}
                hoverStyle={{ color: "var(--text)", borderColor: "var(--border2)" }}
              >
                <RegenerateIcon />
                {t.regenerate}
              </Hoverable>
              <Hoverable
                as="button"
                onClick={handleCopy}
                style={{ ...actionBtn, color: copied ? "var(--primary)" : "var(--muted)" }}
                hoverStyle={{ color: copied ? "var(--primary)" : "var(--text)", borderColor: copied ? "var(--primary)" : "var(--border2)" }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? "Tersalin" : t.copy}
              </Hoverable>
              <Hoverable
                as="button"
                onClick={handleHelpful}
                style={{ ...actionBtn, color: helpful ? "var(--primary)" : "var(--muted)", borderColor: helpful ? "var(--primary)" : "var(--border)" }}
                hoverStyle={{ color: "var(--primary)", borderColor: "var(--primary)" }}
              >
                <ThumbUpIcon />
                {t.helpful}
              </Hoverable>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const actionBtn = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 11px",
  border: "1px solid var(--border)",
  borderRadius: 9,
  background: "var(--card)",
  color: "var(--muted)",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  transition: "color .15s, border-color .15s",
} as const;

export function ChatThread({
  messages,
  lang,
  t,
  panelInsightTitle,
  thinking,
  thinkAgent,
}: ChatThreadProps) {
  const ta = AGENTS[thinkAgent];

  return (
    <div
      style={{
        maxWidth: 780,
        margin: "0 auto",
        padding: "28px 26px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 26,
      }}
    >
      {messages.map((m) => {
        if (m.role === "user") {
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: "flex-end", animation: "amFadeUp .35s ease both" }}>
              <div
                style={{
                  maxWidth: "80%",
                  display: "flex",
                  gap: 11,
                  alignItems: "flex-start",
                  flexDirection: "row-reverse",
                }}
              >
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
                    fontSize: 11,
                    color: "#04140a",
                    flex: "0 0 auto",
                    marginTop: 2,
                  }}
                >
                  AM
                </div>
                <div
                  style={{
                    background: "linear-gradient(135deg, var(--primary), #16a34a)",
                    color: "#04140a",
                    padding: "12px 16px",
                    borderRadius: "16px 16px 5px 16px",
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    fontWeight: 600,
                    boxShadow: "0 8px 22px rgba(34,197,94,.22)",
                  }}
                >
                  {m.text}
                </div>
              </div>
            </div>
          );
        }
        return (
          <AiBubble
            key={m.id}
            m={m as AiMessage}
            lang={lang}
            t={t}
            panelInsightTitle={panelInsightTitle}
          />
        );
      })}

      {/* thinking indicator */}
      {thinking && (
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start", animation: "amFadeUp .3s ease both" }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              background: `color-mix(in srgb, ${ta.color} 15%, transparent)`,
              border: `1px solid color-mix(in srgb, ${ta.color} 30%, transparent)`,
              flex: "0 0 auto",
            }}
          >
            {ta.emoji}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, paddingTop: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: ta.color }}>
                {ta[lang]}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 14px",
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--card)",
                width: "fit-content",
              }}
            >
              <span style={{ display: "flex", gap: 4 }}>
                {[0, 0.2, 0.4].map((d) => (
                  <span
                    key={d}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: ta.color,
                      animation: `amDot 1.2s infinite ${d}s`,
                    }}
                  />
                ))}
              </span>
              <span style={{ fontSize: 12.8, color: "var(--muted)" }}>{t.thinking}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
