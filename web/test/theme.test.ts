// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import { theme, THEMES } from "../src/theme";

const ALL_KEYS = [
  // legacy (Canvas)
  "panel", "edge", "fg", "dim", "accent", "warn", "danger", "stale",
  // marine palette (SVG)
  "bg", "panel2", "accent2", "good", "bad", "port", "starboard", "tide",
];

test("all three themes expose every token as a string", () => {
  for (const t of [THEMES.night, THEMES.day, THEMES["high-contrast"]]) {
    for (const k of ALL_KEYS) {
      expect(typeof (t as unknown as Record<string, string>)[k]).toBe("string");
    }
  }
  expect(THEMES.day.panel).not.toBe(THEMES.night.panel);
  expect(THEMES["high-contrast"].bg).not.toBe(THEMES.night.bg);
});

test("night palette matches the manager source of truth", () => {
  expect(THEMES.night.bg).toBe("#0a1018");
  expect(THEMES.night.panel).toBe("#101b29");
  expect(THEMES.night.accent).toBe("#4fc3f7");
  expect(THEMES.night.port).toBe("#ff5252");
  expect(THEMES.night.starboard).toBe("#36d399");
  expect(THEMES.night.tide).toBe("#288cff");
});

test("theme() defaults to night and resolves named themes", () => {
  expect(theme("banana")).toBe(THEMES.night);
  expect(theme()).toBe(THEMES.night);
  expect(theme("day")).toBe(THEMES.day);
  expect(theme("high-contrast")).toBe(THEMES["high-contrast"]);
});

// ── red-night + classic (WS1-T7) ──────────────────────────────────────────────

const WIDGET_KEYS = [
  "gaugeTrack", "gaugeFill", "gaugeTick", "windApparent", "windTrue",
  "apPillBg", "btnInk", "barTrack", "hudBand", "dialTick", "dialCardDim",
  "dialInk", "cardinalN",
];

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)!;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

test("THEMES declares exactly six themes", () => {
  expect(Object.keys(THEMES).sort()).toEqual(
    ["classic", "day", "high-contrast", "night", "red-night", "sun"].sort(),
  );
});

test("theme() resolves red-night and classic as distinct themes (not the night fallback)", () => {
  const rn = theme("red-night");
  const cl = theme("classic");
  expect(rn).not.toBe(THEMES.night);
  expect(cl).not.toBe(THEMES.night);
  expect(rn).toBe((THEMES as Record<string, unknown>)["red-night"]);
  expect(cl).toBe((THEMES as Record<string, unknown>)["classic"]);
  expect(rn).not.toBe(cl);
});

test("red-night and classic supply every Theme token and every WidgetColors key", () => {
  for (const t of [theme("red-night"), theme("classic")]) {
    for (const k of ALL_KEYS) {
      expect(typeof (t as unknown as Record<string, string>)[k]).toBe("string");
    }
    for (const k of WIDGET_KEYS) {
      expect(typeof (t.widgets as unknown as Record<string, string>)[k]).toBe("string");
    }
  }
});

test("red-night is night-vision safe: deep-black ground, red-dominant inks, no blue/green bleed", () => {
  const rn = theme("red-night");
  // Deep black background.
  const [br, bg_, bb] = rgb(rn.bg);
  expect(br + bg_ + bb).toBeLessThanOrEqual(30);
  // Red channel strictly dominates on the primary inks/accents.
  for (const c of [rn.fg, rn.accent, rn.accent2, rn.danger, rn.widgets.gaugeFill, rn.widgets.hudBand, rn.widgets.cardinalN]) {
    const [r, g, b] = rgb(c);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    // No blue/green bleed: keep the non-red channels well below the red one.
    expect(g).toBeLessThan(r * 0.7);
    expect(b).toBeLessThan(r * 0.7);
  }
});

test("classic is a cream/brass analog look: warm light ground, dark ink, brass accent", () => {
  const cl = theme("classic");
  // Warm cream ground: light, with warm channel ordering r >= g >= b.
  const [br, bgc, bb] = rgb(cl.bg);
  expect(br + bgc + bb).toBeGreaterThan(560); // light surface
  expect(br).toBeGreaterThanOrEqual(bgc);
  expect(bgc).toBeGreaterThanOrEqual(bb);
  // Dark ink for the foreground.
  const [fr, fgc, fb] = rgb(cl.fg);
  expect(fr + fgc + fb).toBeLessThan(200);
  // Brass accent: warm (r > b) and mid-brightness.
  const [ar, ag, ab] = rgb(cl.accent);
  expect(ar).toBeGreaterThan(ab);
  expect(ag).toBeGreaterThan(ab);
});

test("FONT_FAMILY falls back to a sans-serif stack, never the serif default", async () => {
  const { FONT_FAMILY } = await import("../src/theme");
  expect(FONT_FAMILY.startsWith("Montserrat")).toBe(true);
  expect(FONT_FAMILY.trim().endsWith("sans-serif")).toBe(true);
  // Interpolated into font-family="..." attributes: no double quotes allowed.
  expect(FONT_FAMILY).not.toContain('"');
});

// ── sun (firmware use_sun parity) ─────────────────────────────────────────────

test("theme() resolves sun as a distinct theme (not the night or day fallback)", () => {
  const sun = theme("sun");
  expect(sun).toBe((THEMES as Record<string, unknown>)["sun"]);
  expect(sun).not.toBe(THEMES.night);
  expect(sun).not.toBe(THEMES.day);
});

test("sun supplies every Theme token and every WidgetColors key", () => {
  const sun = theme("sun");
  for (const k of ALL_KEYS) {
    expect(typeof (sun as unknown as Record<string, string>)[k]).toBe("string");
  }
  for (const k of WIDGET_KEYS) {
    expect(typeof (sun.widgets as unknown as Record<string, string>)[k]).toBe("string");
  }
});

test("sun tokens match the firmware use_sun palette (instruments live_tokens mapping)", () => {
  const sun = theme("sun");
  // firmware Palette field -> MIDL token, as in instruments ui_layouts.cpp live_tokens().
  expect(sun.bg).toBe("#ffffff");        // bg
  expect(sun.panel).toBe("#ffffff");     // panel
  expect(sun.panel2).toBe("#eeeeee");    // badge
  expect(sun.edge).toBe("#1a1a1a");      // panel_edge
  expect(sun.fg).toBe("#000000");        // fg
  expect(sun.dim).toBe("#3a3a3a");       // fg_dim
  expect(sun.accent).toBe("#0050a0");    // accent
  expect(sun.accent2).toBe("#007a3d");   // good (firmware has no accent2 slot)
  expect(sun.good).toBe("#007a3d");      // good
  expect(sun.warn).toBe("#a05a00");      // warn
  expect(sun.bad).toBe("#c00000");       // alarm
  expect(sun.danger).toBe("#c00000");    // alarm
  expect(sun.port).toBe("#c00000");      // port
  expect(sun.starboard).toBe("#007a3d"); // starboard
  expect(sun.tide).toBe("#0a5fc0");      // tide
  expect(sun.stale).toBe("#8a8a8a");     // stale
  expect(sun.widgets.hudBand).toBe("#e6e6e6"); // arc_band
  expect(sun.widgets.dialInk).toBe("#000000"); // band_ink
  expect(sun.widgets.dialTick).toBe("#555555"); // band_ink_dim
});
