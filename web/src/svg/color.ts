// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Resolve a MIDL color token to a concrete CSS color against the active theme.
// A `#rrggbb` (or any `#...`) literal passes through; a known token name maps to
// the theme; anything else falls back to the provided default.
import type { Theme } from "../theme";

const TOKENS: Array<keyof Theme> = [
  "panel", "panel2", "edge", "fg", "dim", "accent", "accent2",
  "good", "warn", "bad", "danger", "port", "starboard", "tide", "stale", "bg",
];

export function resolveColor(token: string | undefined, th: Theme, fallback: string): string {
  if (!token) return fallback;
  if (token.startsWith("#")) return token;
  if ((TOKENS as string[]).includes(token)) return th[token as keyof Theme];
  return fallback;
}
