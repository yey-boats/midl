// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// Firmware / manager palette parity. Keys split in two groups:
//  - legacy keys (panel, edge, fg, dim, accent, warn, danger, stale) keep the
//    Canvas backend (paint.ts) compiling unchanged.
//  - new keys (bg, panel2, accent2, good, bad, port, starboard, tide) carry the
//    full marine palette the SVG backend draws with.
export interface Theme {
  // legacy (Canvas backend)
  panel: string;
  edge: string;
  fg: string;
  dim: string;
  accent: string;
  warn: string;
  danger: string;
  stale: string;
  // marine palette (SVG backend)
  bg: string;
  panel2: string;
  accent2: string;
  good: string;
  bad: string;
  port: string;
  starboard: string;
  tide: string;
}

/** Default web/UI font family, matching the manager and firmware typography. */
export const FONT_FAMILY = "Montserrat";

export const THEMES: Record<"night" | "day" | "high-contrast", Theme> = {
  // Manager night palette (source of truth).
  night: {
    bg: "#0a1018", panel: "#101b29", panel2: "#16222f", edge: "#1f2d3d",
    fg: "#eef4fa", dim: "#8fa7bd", accent: "#4fc3f7", accent2: "#36d399",
    good: "#36d399", warn: "#ffb84d", bad: "#ff5252", danger: "#ff5252",
    port: "#ff5252", starboard: "#36d399", tide: "#288cff", stale: "#4a5666",
  },
  // Daylight-readable variant: light surfaces, darkened semantic hues.
  day: {
    bg: "#e7edf3", panel: "#f4f7fa", panel2: "#e9eef4", edge: "#c3ccd6",
    fg: "#10202f", dim: "#5b6f82", accent: "#0a6fd0", accent2: "#0a8f5e",
    good: "#0a8f5e", warn: "#b06a00", bad: "#c02626", danger: "#c02626",
    port: "#c02626", starboard: "#0a8f5e", tide: "#0a5fc0", stale: "#9aa7b4",
  },
  // Maximum legibility: pure black ground, saturated primaries.
  "high-contrast": {
    bg: "#000000", panel: "#0a0a0a", panel2: "#141414", edge: "#ffffff",
    fg: "#ffffff", dim: "#bdbdbd", accent: "#00d0ff", accent2: "#00ff88",
    good: "#00ff88", warn: "#ffd000", bad: "#ff3030", danger: "#ff3030",
    port: "#ff3030", starboard: "#00ff88", tide: "#3aa0ff", stale: "#666666",
  },
};

export function theme(name?: string): Theme {
  if (name === "day") return THEMES.day;
  if (name === "high-contrast") return THEMES["high-contrast"];
  return THEMES.night;
}

// Widget-literal (non-token) colours from the Claude Design style guide. These
// are intentionally NOT theme tokens — they belong to specific widgets (gauges,
// wind dials, AP pill, buttons, HUD band) and are referenced directly by name.
export const GAUGE_TRACK = "#52736f";   // gauge arc track
export const GAUGE_CYAN = "#57c7d8";    // gauge fill + percent + ticks-text
export const GAUGE_TICK = "#8fa59d";    // gauge tick marks
export const WIND_APPARENT = "#ff8800"; // apparent-wind marker
export const WIND_TRUE = "#2bd4e8";     // true-wind marker
export const AP_PILL_BG = "#143b2a";    // engaged autopilot pill background
export const BTN_INK = "#001218";       // text on accent-filled button
export const BAR_TRACK = "#001a20";     // bar track
export const HUD_BAND = "#f2f6fb";      // HUD white heading band
export const DIAL_TICK = "#5a6b78";     // round-HUD dial tick ring
export const DIAL_CARD_DIM = "#44546a"; // round-HUD dimmed inter-cardinals
export const DIAL_INK = "#16222f";      // in-dial dark ink (cardinals/ticks)
