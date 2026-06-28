// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// Firmware / manager palette parity. Keys split in two groups:
//  - legacy keys (panel, edge, fg, dim, accent, warn, danger, stale) keep the
//    Canvas backend (paint.ts) compiling unchanged.
//  - new keys (bg, panel2, accent2, good, bad, port, starboard, tide) carry the
//    full marine palette the SVG backend draws with.
// Widget-literal (non-token) colours from the Claude Design style guide. These
// belong to specific widgets (gauges, wind dials, AP pill, buttons, HUD band)
// rather than to the semantic token set. They were previously module-level
// constants tuned for the night theme, which made them illegible (or fully
// invisible) on the light `day` and `high-contrast` surfaces. They are now part
// of the Theme so each theme supplies legible values for its own surfaces.
export interface WidgetColors {
  gaugeTrack: string;   // gauge arc track (recessed, behind the fill)
  gaugeFill: string;    // gauge fill + percent + ticks-text (the active hue)
  gaugeTick: string;    // gauge tick marks
  windApparent: string; // apparent-wind marker (token 'warn' on dials)
  windTrue: string;     // true-wind marker (token 'accent' on dials)
  apPillBg: string;     // engaged autopilot pill background
  btnInk: string;       // text on an accent-filled button
  barTrack: string;     // bar track
  hudBand: string;      // HUD heading band ring (the prominent contrasting band)
  dialTick: string;     // round-HUD tick ring (drawn on the dial face)
  dialCardDim: string;  // round-HUD dimmed inter-cardinal labels (on the band)
  dialInk: string;      // in-band ink: cardinals/ticks/numerals drawn ON the band
  cardinalN: string;    // the red North cardinal + lubber convention colour
}

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
  // widget-literal palette (per-theme; see WidgetColors)
  widgets: WidgetColors;
}

/** Default web/UI font family, matching the manager and firmware typography. */
export const FONT_FAMILY = "Montserrat";

// Per-theme widget palettes. Night keeps the original Claude-Design literals
// (already legible on dark surfaces). Day uses a DARK band with light in-band
// ink so the band still reads against the near-white face, and darkened gauge/
// wind hues. High-contrast uses a pure-white band on black plus a visible bar
// track (the old #001a20 was 1.2:1 on black — effectively invisible).
const WIDGETS_NIGHT: WidgetColors = {
  gaugeTrack: "#52736f", gaugeFill: "#57c7d8", gaugeTick: "#8fa59d",
  windApparent: "#ff8800", windTrue: "#2bd4e8",
  apPillBg: "#143b2a", btnInk: "#001218", barTrack: "#001a20",
  hudBand: "#f2f6fb", dialTick: "#5a6b78", dialCardDim: "#44546a",
  dialInk: "#16222f", cardinalN: "#d32f2f",
};
const WIDGETS_DAY: WidgetColors = {
  gaugeTrack: "#aab8c4", gaugeFill: "#0e7490", gaugeTick: "#5b6f82",
  windApparent: "#b85c00", windTrue: "#0e7490",
  apPillBg: "#cfe9db", btnInk: "#ffffff", barTrack: "#d2dae2",
  hudBand: "#1c2b3a", dialTick: "#5b6f82", dialCardDim: "#aebfce",
  dialInk: "#eef4fa", cardinalN: "#ff6b6b",
};
const WIDGETS_HC: WidgetColors = {
  gaugeTrack: "#3a5a5a", gaugeFill: "#00d0ff", gaugeTick: "#9a9a9a",
  windApparent: "#ff8800", windTrue: "#00e0ff",
  apPillBg: "#0a3a26", btnInk: "#000000", barTrack: "#1a1a1a",
  hudBand: "#ffffff", dialTick: "#888888", dialCardDim: "#333333",
  dialInk: "#000000", cardinalN: "#ff3030",
};

export const THEMES: Record<"night" | "day" | "high-contrast", Theme> = {
  // Manager night palette (source of truth).
  night: {
    bg: "#0a1018", panel: "#101b29", panel2: "#16222f", edge: "#1f2d3d",
    fg: "#eef4fa", dim: "#8fa7bd", accent: "#4fc3f7", accent2: "#36d399",
    good: "#36d399", warn: "#ffb84d", bad: "#ff5252", danger: "#ff5252",
    port: "#ff5252", starboard: "#36d399", tide: "#288cff", stale: "#4a5666",
    widgets: WIDGETS_NIGHT,
  },
  // Daylight-readable variant: light surfaces, darkened semantic hues.
  day: {
    bg: "#e7edf3", panel: "#f4f7fa", panel2: "#e9eef4", edge: "#c3ccd6",
    fg: "#10202f", dim: "#5b6f82", accent: "#0a6fd0", accent2: "#0a8f5e",
    good: "#0a8f5e", warn: "#b06a00", bad: "#c02626", danger: "#c02626",
    port: "#c02626", starboard: "#0a8f5e", tide: "#0a5fc0", stale: "#9aa7b4",
    widgets: WIDGETS_DAY,
  },
  // Maximum legibility: pure black ground, saturated primaries.
  "high-contrast": {
    bg: "#000000", panel: "#0a0a0a", panel2: "#141414", edge: "#ffffff",
    fg: "#ffffff", dim: "#bdbdbd", accent: "#00d0ff", accent2: "#00ff88",
    good: "#00ff88", warn: "#ffd000", bad: "#ff3030", danger: "#ff3030",
    port: "#ff3030", starboard: "#00ff88", tide: "#3aa0ff", stale: "#666666",
    widgets: WIDGETS_HC,
  },
};

export function theme(name?: string): Theme {
  if (name === "day") return THEMES.day;
  if (name === "high-contrast") return THEMES["high-contrast"];
  return THEMES.night;
}
