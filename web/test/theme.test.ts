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
