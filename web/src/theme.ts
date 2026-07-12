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
// Red-night: night-vision preservation. Everything is drawn in reds (with the
// warn slot allowed a red-orange) on a true-black ground — no blue or green
// bleed anywhere, so the helm keeps their dark adaptation. Semantic pairs that
// normally split hue (good/bad, port/starboard) split on brightness instead.
const WIDGETS_RED_NIGHT: WidgetColors = {
  gaugeTrack: "#4a1512", gaugeFill: "#ff5a4e", gaugeTick: "#8a2c26",
  windApparent: "#ff7530", windTrue: "#ff5a4e",
  apPillBg: "#2a0b08", btnInk: "#1a0404", barTrack: "#200806",
  hudBand: "#ff4438", dialTick: "#7a2620", dialCardDim: "#571d18",
  dialInk: "#1a0404", cardinalN: "#ff1a10",
};
// Classic: cream/brass analog-instrument look — warm cream faces, dark ink
// numerals, brass bezels/accents, like a varnished-wood chartroom panel.
const WIDGETS_CLASSIC: WidgetColors = {
  gaugeTrack: "#cbbb98", gaugeFill: "#8c6d1f", gaugeTick: "#6b5a40",
  windApparent: "#a86412", windTrue: "#35566b",
  apPillBg: "#d8e2cf", btnInk: "#f8f2e4", barTrack: "#ddd0b2",
  hudBand: "#2b2114", dialTick: "#6b5a40", dialCardDim: "#b3a684",
  dialInk: "#f3ead8", cardinalN: "#b02a20",
};

export const THEMES: Record<"night" | "day" | "high-contrast" | "red-night" | "classic", Theme> = {
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
  // Night-vision-safe: true-black ground, red-only inks (see WIDGETS_RED_NIGHT).
  "red-night": {
    bg: "#000000", panel: "#140303", panel2: "#1c0505", edge: "#401010",
    fg: "#ff4438", dim: "#a03028", accent: "#ff6a5c", accent2: "#e0352b",
    good: "#ff8a50", warn: "#ff7530", bad: "#ff2018", danger: "#ff2018",
    port: "#ff2018", starboard: "#ff8a50", tide: "#c03a30", stale: "#5c211c",
    widgets: WIDGETS_RED_NIGHT,
  },
  // Cream/brass analog look: warm cream surfaces, dark ink, brass accents.
  classic: {
    bg: "#f3ead8", panel: "#efe4cd", panel2: "#e7d9bd", edge: "#b09a6a",
    fg: "#2b2114", dim: "#6b5a40", accent: "#8c6d1f", accent2: "#7a5a14",
    good: "#3f6b3a", warn: "#a86412", bad: "#8c2f24", danger: "#8c2f24",
    port: "#8c2f24", starboard: "#3f6b3a", tide: "#35566b", stale: "#a89878",
    widgets: WIDGETS_CLASSIC,
  },
};

export function theme(name?: string): Theme {
  if (name === "day") return THEMES.day;
  if (name === "high-contrast") return THEMES["high-contrast"];
  if (name === "red-night") return THEMES["red-night"];
  if (name === "classic") return THEMES.classic;
  return THEMES.night;
}
