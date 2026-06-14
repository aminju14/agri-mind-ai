"use client";

import { AGENTS, AGENT_ORDER } from "@/lib/data";
import type { AgentKey, Lang, Strings } from "@/lib/types";

interface AgentStatusProps {
  t: Strings;
  lang: Lang;
  thinking: boolean;
  thinkAgent: AgentKey;
}

export function AgentStatus({ t, lang, thinking, thinkAgent }: AgentStatusProps) {
  const active = thinking ? thinkAgent : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 26px",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--primary)",
            animation: "amPulse 2.4s infinite",
          }}
        />
        <span
          className="font-mono"
          style={{
            fontSize: 10.5,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          {t.online}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        {AGENT_ORDER.map((k) => {
          const a = AGENTS[k];
          const isActive = active === k;
          return (
            <div
              key={k}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px 4px 7px",
                border: "1px solid var(--border)",
                borderRadius: 99,
                background: "var(--card)",
                opacity: active ? (isActive ? 1 : 0.45) : 0.92,
                transition: "opacity .3s",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  background: `color-mix(in srgb, ${a.color} 16%, transparent)`,
                }}
              >
                {a.emoji}
              </span>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: isActive ? a.color : "var(--muted)",
                }}
              >
                {a[lang]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
