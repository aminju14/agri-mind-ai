"use client";

import {
  useState,
  type CSSProperties,
  type ReactNode,
  type ElementType,
} from "react";

/**
 * Mirrors the original `style-hover` / `style-focus-within` attributes from the
 * approved HTML: a base inline style with an extra patch merged on hover/focus.
 */
interface HoverableProps {
  as?: ElementType;
  style: CSSProperties;
  hoverStyle?: CSSProperties;
  focusWithinStyle?: CSSProperties;
  children?: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  target?: string;
  rel?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}

const BORDER_LONGHANDS = ["borderColor", "borderWidth", "borderStyle"] as const;

/**
 * If a hover/focus patch overrides a single border longhand (e.g. `borderColor`)
 * while the base uses the `border` shorthand, React warns about mixing
 * shorthand and non-shorthand for the same value. Expand the base shorthand
 * (`"1px solid var(--border)"`) into longhands so only longhands are ever set.
 */
function expandBorderShorthand(style: CSSProperties, patches: CSSProperties[]): CSSProperties {
  const touchesBorderLonghand = patches.some((p) =>
    p ? BORDER_LONGHANDS.some((k) => k in p) : false,
  );
  if (!touchesBorderLonghand || typeof style.border !== "string") return style;

  const parts = style.border.trim().split(/\s+(?![^()]*\))/);
  if (parts.length < 3) return style;

  const [borderWidth, borderStyle, ...rest] = parts;
  const { border: _drop, ...withoutShorthand } = style;
  void _drop;
  return {
    ...withoutShorthand,
    borderWidth,
    borderStyle,
    borderColor: rest.join(" "),
  };
}

export function Hoverable({
  as,
  style,
  hoverStyle,
  focusWithinStyle,
  children,
  ...rest
}: HoverableProps) {
  const Tag = (as || "div") as ElementType;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const base = expandBorderShorthand(style, [hoverStyle ?? {}, focusWithinStyle ?? {}]);

  const merged: CSSProperties = {
    ...base,
    ...(hovered && hoverStyle ? hoverStyle : {}),
    ...(focused && focusWithinStyle ? focusWithinStyle : {}),
  };

  return (
    <Tag
      style={merged}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={focusWithinStyle ? () => setFocused(true) : undefined}
      onBlurCapture={focusWithinStyle ? () => setFocused(false) : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
