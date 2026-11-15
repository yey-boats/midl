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
// Montserrat first (the manager and the editor load it), then the platform UI
// fonts. With Montserrat alone, any page that does not load the webfont (the
// navigator Mini App, a box offline) fell back to the browser default SERIF
// face for every label and value. Single-quoted: it is interpolated into SVG
// font-family="..." attributes.
export const FONT_FAMILY = "Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

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
// Sun: firmware `use_sun` (instruments src/ui/ui_theme.cpp) for direct
// sunlight on the IPS panel — white ground, black ink, near-black borders.
// Values are the firmware palette fields, mapped by how the firmware itself
// uses them: gauge track = grid, gauge fill / true wind = accent, gauge ticks =
// fg_dim, apparent wind = warn, HUD band = arc_band, in-band ink = band_ink,
// band ticks / dimmed inter-cardinals = band_ink_dim, North = alarm. The AP pill
// and bar track (firmware literals) take the light badge fill so the green
// engaged label and the bar border stay legible on white.
const WIDGETS_SUN: WidgetColors = {
  gaugeTrack: "#444444", gaugeFill: "#0050a0", gaugeTick: "#3a3a3a",
  windApparent: "#a05a00", windTrue: "#0050a0",
  apPillBg: "#eeeeee", btnInk: "#ffffff", barTrack: "#eeeeee",
  hudBand: "#e6e6e6", dialTick: "#555555", dialCardDim: "#555555",
  dialInk: "#000000", cardinalN: "#c00000",
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

export const THEMES: Record<"night" | "day" | "sun" | "high-contrast" | "red-night" | "classic", Theme> = {
  // Manager night palette (source of truth).
  night: {
    bg: "#0a1018", panel: "#101b29", panel2: "#16222f", edge: "#1f2d3d",
    fg: "#eef4fa", dim: "#8fa7bd", accent: "#4fc3f7", accent2: "#36d399",
    good: "#36d399", warn: "#ffb84d", bad: "#ff5252", danger: "#ff5252",
    port: "#ff5252", starboard: "#36d399", tide: "#288cff", stale: "#4a5666",
    widgets: WIDGETS_NIGHT,
  },
  // Daylight-readable variant: light surfaces, darkened semantic hues.
  // Tokens are the firmware `day` palette (instruments include/ui_palette.h,
  // after its WCAG AA pass), mapped as live_tokens() does: panel2 = badge,
  // edge = panel_edge, dim = fg_dim, accent2 = good, bad/danger = alarm.
  day: {
    bg: "#eef1f4", panel: "#ffffff", panel2: "#e7edf2", edge: "#c7d2da",
    fg: "#14211d", dim: "#5a6b78", accent: "#0266a8", accent2: "#1b7a4b",
    good: "#1b7a4b", warn: "#8a5500", bad: "#c62828", danger: "#c62828",
    port: "#c62828", starboard: "#1b7a4b", tide: "#0a5fc0", stale: "#9aa7b4",
    widgets: WIDGETS_DAY,
  },
  // Direct-sunlight variant (firmware `use_sun`), mapped onto tokens exactly as
  // the firmware does in live_tokens(): panel2 = badge, edge = panel_edge,
  // dim = fg_dim, accent2 = good, bad/danger = alarm.
  sun: {
    bg: "#ffffff", panel: "#ffffff", panel2: "#eeeeee", edge: "#1a1a1a",
    fg: "#000000", dim: "#3a3a3a", accent: "#0050a0", accent2: "#007a3d",
    good: "#007a3d", warn: "#a05a00", bad: "#c00000", danger: "#c00000",
    port: "#c00000", starboard: "#007a3d", tide: "#0a5fc0", stale: "#8a8a8a",
    widgets: WIDGETS_SUN,
  },
  // Maximum legibility: pure black ground, saturated primaries.
  "high-contrast": {
    bg: "#000000", panel: "#0a0a0a", panel2: "#141414", edge: "#ffffff",
    fg: "#ffffff", dim: "#bdbdbd", accent: "#00d0ff", accent2: "#00ff88",
    good: "#00ff88", warn: "#ffd000", bad: "#ff3030", danger: "#ff3030",
    port: "#ff3030", starboard: "#00ff88", tide: "#3aa0ff", stale: "#666666",
    widgets: WIDGETS_HC,
  },
  // Night-vision-safe: true-black ground, red/amber inks (see WIDGETS_RED_NIGHT).
  // Tokens are the firmware `red_night` palette, mapped as for day.
  "red-night": {
    bg: "#000000", panel: "#140302", panel2: "#1f0705", edge: "#4a1410",
    fg: "#ff4b3e", dim: "#d84a3a", accent: "#ff7a29", accent2: "#e0921e",
    good: "#e0921e", warn: "#ffa028", bad: "#ff1a1a", danger: "#ff1a1a",
    port: "#ff5252", starboard: "#d9a441", tide: "#c03a30", stale: "#5c211c",
    widgets: WIDGETS_RED_NIGHT,
  },
  // Cream/brass analog look: warm cream surfaces, dark ink, brass accents.
  // Tokens are the firmware `classic` palette, mapped as for day.
  classic: {
    bg: "#e8e1cf", panel: "#f7f1e3", panel2: "#e4dbc4", edge: "#b9ab8c",
    fg: "#2e2a24", dim: "#685d4e", accent: "#7a5a10", accent2: "#3e6b41",
    good: "#3e6b41", warn: "#8a5500", bad: "#9e2f28", danger: "#9e2f28",
    port: "#9e2f28", starboard: "#3e6b41", tide: "#35566b", stale: "#a89878",
    widgets: WIDGETS_CLASSIC,
  },
};

export function theme(name?: string): Theme {
  if (name === "day") return THEMES.day;
  if (name === "sun") return THEMES.sun;
  if (name === "high-contrast") return THEMES["high-contrast"];
  if (name === "red-night") return THEMES["red-night"];
  if (name === "classic") return THEMES.classic;
  return THEMES.night;
}
