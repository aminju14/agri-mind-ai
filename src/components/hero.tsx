"use client";

import type { Lang, Strings } from "@/lib/types";
import { BrandMark } from "./icons";
import { SuggestedPrompts } from "./suggested-prompts";

interface HeroProps {
  t: Strings;
  lang: Lang;
  isMobile: boolean;
  onPick: (q: string, key: string) => void;
}

export function Hero({ t, lang, isMobile, onPick }: HeroProps) {
  return (
    <div
      style={{
        position: "relative",
        maxWidth: 760,
        margin: "0 auto",
        padding: "16px 26px",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* floating glows */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: -40,
            left: "50%",
            width: 420,
            height: 420,
            transform: "translateX(-50%)",
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--primary-soft), transparent 65%)",
            filter: "blur(20px)",
            animation: "amFloat 9s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 60,
            right: -60,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--secondary-soft), transparent 65%)",
            filter: "blur(20px)",
            animation: "amFloat 11s ease-in-out infinite",
          }}
        />
      </div>

      <div style={{ position: "relative", textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 13px",
            border: "1px solid var(--border)",
            borderRadius: 99,
            background: "var(--card)",
            fontSize: 11.5,
            color: "var(--muted)",
            marginBottom: 26,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }} />
          <span className="font-mono" style={{ letterSpacing: ".08em" }}>
            4 SPECIALIST AGENTS · LIVE
          </span>
        </div>

        <div
          style={{
            position: "relative",
            width: 56,
            height: 56,
            margin: "0 auto 12px",
            borderRadius: 18,
            background: "linear-gradient(140deg, var(--primary), var(--secondary))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 30px rgba(34,197,94,.3)",
          }}
        >
          <BrandMark size={18} ringWidth={4} />
        </div>

        <h1
          className="font-sora"
          style={{ fontWeight: 800, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 8px", lineHeight: 1.1 }}
        >
          {t.heroTitle}
        </h1>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 6px" }}>
          {t.heroSub}
        </p>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 auto", maxWidth: 440, lineHeight: 1.5 }}>
          {t.heroDesc}
        </p>
      </div>

      <div style={{ position: "relative", marginTop: 24 }}>
        <div
          className="font-mono"
          style={{
            fontSize: 10.5,
            letterSpacing: ".13em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 14,
            paddingLeft: 2,
          }}
        >
          {t.suggested}
        </div>
        <SuggestedPrompts lang={lang} isMobile={isMobile} onPick={onPick} />
      </div>
    </div>
  );
}
