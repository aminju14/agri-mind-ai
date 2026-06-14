"use client";

import type { CSSProperties } from "react";
import type { Citation, Strings } from "@/lib/types";
import { Hoverable } from "./hoverable";
import { ArrowUpRight, LinkIcon } from "./icons";

interface CitationCardsProps {
  citations: Citation[];
  t: Strings;
}

export function CitationCards({ citations, t }: CitationCardsProps) {
  const cols: CSSProperties["gridTemplateColumns"] =
    citations.length >= 3 ? "repeat(auto-fit, minmax(150px, 1fr))" : "1fr 1fr";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 11px" }}>
        <LinkIcon />
        <span
          className="font-mono"
          style={{
            fontSize: 10.5,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          {t.sources} · {citations.length}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, marginBottom: 16 }}>
        {citations.map((c, i) => {
          // Clickable when the citation carries a real source URL (web sources, or KB docs
          // with a link). KB citations without a URL keep the original non-navigating card.
          const hasLink = typeof c.url === "string" && /^https?:\/\//.test(c.url);
          return (
          <Hoverable
            key={i}
            as="a"
            href={hasLink ? c.url : "#"}
            {...(hasLink
              ? { target: "_blank", rel: "noopener noreferrer", title: c.url }
              : { onClick: (e: React.MouseEvent) => e.preventDefault() })}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: 13,
              background: "var(--card)",
              textDecoration: "none",
              transition: "transform .15s, border-color .2s",
              cursor: "pointer",
            }}
            hoverStyle={{ transform: "translateY(-2px)", borderColor: "var(--secondary)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                className="font-mono"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: "var(--secondary-soft)",
                  color: "var(--secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </span>
              <ArrowUpRight width={13} height={13} />
            </div>
            <div style={{ fontSize: 12.6, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
              {c.title}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="font-mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                {c.source}
              </span>
              <span
                style={{
                  fontSize: 9.5,
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: "var(--card2)",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                {c.category}
              </span>
            </div>
          </Hoverable>
          );
        })}
      </div>
    </>
  );
}
