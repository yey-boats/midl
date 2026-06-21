// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import { theme, THEMES } from "../src/theme";

test("day and night themes differ and expose all tokens", () => {
  for (const t of [THEMES.day, THEMES.night]) {
    for (const k of ["panel", "edge", "fg", "dim", "accent", "warn", "danger", "stale"]) {
      expect(typeof (t as Record<string, string>)[k]).toBe("string");
    }
  }
  expect(THEMES.day.panel).not.toBe(THEMES.night.panel);
});

test("theme() defaults to night for unknown names", () => {
  expect(theme("banana")).toBe(THEMES.night);
  expect(theme("day")).toBe(THEMES.day);
});
