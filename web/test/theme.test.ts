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

test("THEMES declares exactly five themes", () => {
  expect(Object.keys(THEMES).sort()).toEqual(
    ["classic", "day", "high-contrast", "night", "red-night"].sort(),
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
