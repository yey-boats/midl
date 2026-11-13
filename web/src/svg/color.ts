// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Resolve a MIDL color token to a concrete CSS color against the active theme.
// Colours are a strict allowlist: a `#rgb`, `#rrggbb` or `#rrggbbaa` literal
// passes through, a known token name maps to the theme, and anything else
// falls back to the provided default. The SVG builders interpolate the result
// straight into attributes and hosts insert the SVG with innerHTML, so a
// document value must never reach the output unless it is a plain hex literal.
import type { Theme } from "../theme";

// Theme keys that map to a concrete colour string (excludes the `widgets`
// sub-object, which is not itself a colour token).
type ColorToken =
  | "panel" | "panel2" | "edge" | "fg" | "dim" | "accent" | "accent2"
  | "good" | "warn" | "bad" | "danger" | "port" | "starboard" | "tide" | "stale" | "bg";

const TOKENS: ReadonlySet<string> = new Set<ColorToken>([
  "panel", "panel2", "edge", "fg", "dim", "accent", "accent2",
  "good", "warn", "bad", "danger", "port", "starboard", "tide", "stale", "bg",
]);

// Firmware aliases (instruments midl_render.cpp: alarm == bad == danger).
const ALIASES: Readonly<Record<string, ColorToken>> = { alarm: "bad" };

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** True for a `#rgb`, `#rrggbb` or `#rrggbbaa` literal and nothing else. */
export function isSafeColor(c: unknown): c is string {
  return typeof c === "string" && HEX.test(c);
}

/**
 * Resolve an optional authored colour (e.g. `style.color`) to a concrete hex
 * colour, or `undefined` when it is absent or not on the allowlist, so the
 * caller keeps its own default. Never returns anything but a hex literal.
 */
export function resolveOptionalColor(token: unknown, th: Theme): string | undefined {
  if (typeof token !== "string" || !token) return undefined;
  if (isSafeColor(token)) return token;
  const key = Object.prototype.hasOwnProperty.call(ALIASES, token) ? ALIASES[token]! : token;
  if (TOKENS.has(key)) {
    const v = th[key as ColorToken];
    if (isSafeColor(v)) return v;
  }
  return undefined;
}

export function resolveColor(token: string | undefined, th: Theme, fallback: string): string {
  const safeFallback = isSafeColor(fallback) ? fallback : "#000";
  return resolveOptionalColor(token, th) ?? safeFallback;
}
