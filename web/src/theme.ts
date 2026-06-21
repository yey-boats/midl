// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
export interface Theme { panel: string; edge: string; fg: string; dim: string; accent: string; warn: string; danger: string; stale: string; }

export const THEMES: Record<"day" | "night", Theme> = {
  night: { panel: "#11161d", edge: "#2a3a4a", fg: "#dce6f0", dim: "#7b8aa0", accent: "#3fa7ff", warn: "#ffb547", danger: "#ff5d5d", stale: "#4a5666" },
  day:   { panel: "#f2f5f8", edge: "#c3ccd6", fg: "#10202f", dim: "#5b6f82", accent: "#0a6fd0", warn: "#b06a00", danger: "#c02626", stale: "#9aa7b4" },
};

export function theme(name?: string): Theme {
  return name === "day" ? THEMES.day : THEMES.night;
}
