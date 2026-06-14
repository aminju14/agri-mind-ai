"use client";

import { AGENTS, PROMPTS } from "@/lib/data";
import type { Lang, PromptIcon } from "@/lib/types";
import { Hoverable } from "./hoverable";
import {
  ArrowUpRight,
  BookIcon,
  CalendarIcon,
  ChartIcon,
  LeafIcon,
  SproutIcon,
} from "./icons";

interface SuggestedPromptsProps {
  lang: Lang;
  isMobile: boolean;
  onPick: (q: string, key: string) => void;
}

function PromptGlyph({ icon }: { icon: PromptIcon }) {
  switch (icon) {
    case "book":
      return <BookIcon />;
    case "leaf":
      return <LeafIcon />;
    case "calendar":
      return <CalendarIcon />;
    case "sprout":
      return <SproutIcon />;
    case "chart":
      return <ChartIcon />;
  }
}

export function SuggestedPrompts({ lang, isMobile, onPick }: SuggestedPromptsProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
        gap: 12,
      }}
    >
      {PROMPTS.map((p) => {
        const a = AGENTS[p.agent];
        const tr = p[lang];
        return (
          <Hoverable
            key={p.key}
            as="button"
            onClick={() => onPick(tr.q, p.key)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 10,
              textAlign: "left",
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 16,
              background: "var(--card)",
              cursor: "pointer",
              transition: "transform .16s, border-color .2s, box-shadow .2s",
              position: "relative",
              overflow: "hidden",
            }}
            hoverStyle={{
              transform: "translateY(-3px)",
              borderColor: a.color,
              boxShadow: "0 14px 30px rgba(0,0,0,.18)",
            }}
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in srgb, ${a.color} 14%, transparent)`,
                color: a.color,
              }}
            >
              <PromptGlyph icon={p.icon} />
            </span>
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  marginBottom: 3,
                  letterSpacing: "-.01em",
                  color: "var(--text)",
                }}
              >
                {tr.title}
              </div>
              <div style={{ fontSize: 12.3, color: "var(--muted)", lineHeight: 1.4 }}>
                {tr.desc}
              </div>
            </div>
            <ArrowUpRight style={{ position: "absolute", top: 16, right: 14, opacity: 0.5 }} />
          </Hoverable>
        );
      })}
    </div>
  );
}
