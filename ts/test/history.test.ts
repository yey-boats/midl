// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
// Trend history (docs/specs/2026-11-15-trend-history.md §1/§2).
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseWindowS, formatWindow, resolveHistory, validateSemantics, satisfies, validateDocument,
  validateConfigStructure, validateManifestStructure,
} from "../src/index";
import type { ConfigDoc, Manifest } from "../src/index";

const ROOT = join(__dirname, "..", "..");
const manifest = (cls: string): Manifest =>
  JSON.parse(readFileSync(join(ROOT, "schemas", "gen", `yb-midl-capabilities.${cls}.json`), "utf8"));

const doc = (el: Record<string, unknown>): ConfigDoc => ({
  midl: "1.0.0",
  screens: [{ id: "s", elements: { t: { bindings: { value: { kind: "signalk", path: "a.b" } }, ...el } as never }, layout: { element: "t" } }],
});

describe("window parsing", () => {
  test("durations and seconds", () => {
    expect(parseWindowS("10m")).toBe(600);
    expect(parseWindowS("90s")).toBe(90);
    expect(parseWindowS("24h")).toBe(86400);
    expect(parseWindowS(3600)).toBe(3600);
    for (const bad of ["10", "10min", " 10m", "1.5h", "", -5, 0, null, true]) expect(parseWindowS(bad)).toBeUndefined();
  });
  test("formatWindow picks the largest exact unit", () => {
    expect(formatWindow(600)).toBe("10m");
    expect(formatWindow(7200)).toBe("2h");
    expect(formatWindow(90)).toBe("90s");
  });
  test("defaults: 10 minutes, avg", () => {
    expect(resolveHistory({})).toEqual({ windowS: 600, agg: "avg" });
    expect(resolveHistory({ history: { window: "1h", agg: "max" } })).toEqual({ windowS: 3600, agg: "max" });
  });
});

describe("validation", () => {
  test("schema: window pattern or integer, agg enum, no extra keys", () => {
    expect(validateConfigStructure(doc({ type: "trend", history: { window: "10m", agg: "last" } }))).toEqual([]);
    expect(validateConfigStructure(doc({ type: "trend", history: { window: 600 } }))).toEqual([]);
    expect(validateConfigStructure(doc({ type: "trend", history: { window: "10 min" } })).length).toBeGreaterThan(0);
    expect(validateConfigStructure(doc({ type: "trend", history: { agg: "median" } })).length).toBeGreaterThan(0);
    expect(validateConfigStructure(doc({ type: "trend", history: { points: 50 } })).length).toBeGreaterThan(0);
  });
  test("semantic: window >= 60 s; history only on trend", () => {
    expect(validateSemantics(doc({ type: "trend", history: { window: "60s" } }))).toEqual([]);
    expect(validateSemantics(doc({ type: "trend", history: { window: "59s" } })).map((i) => i.path))
      .toEqual(["/screens/0/elements/t/history/window"]);
    expect(validateSemantics(doc({ type: "gauge", history: { window: "10m" } })).map((i) => i.path))
      .toEqual(["/screens/0/elements/t/history"]);
  });
  test("satisfy: window <= manifest history.maxWindowS", () => {
    const m = manifest("square-480");
    expect(satisfies(doc({ type: "trend", history: { window: "24h" } }), m, "square-480")).toEqual([]);
    expect(satisfies(doc({ type: "trend", history: { window: "25h" } }), m, "square-480").map((i) => i.path))
      .toEqual(["/screens/0/elements/t/history/window"]);
    const tight = { ...m, history: { ...m.history, maxWindowS: 3600 } };
    expect(satisfies(doc({ type: "trend", history: { window: "2h" } }), tight, "square-480")).toHaveLength(1);
  });
  test("generated manifests carry the history capability and validate", () => {
    for (const cls of ["square-480", "landscape-800x480", "landscape-1024x600", "round-360"]) {
      const m = manifest(cls);
      expect(validateManifestStructure(m)).toEqual([]);
      expect(m.history).toMatchObject({ maxWindowS: 86400, windows: ["10m", "30m", "1h", "6h", "24h"], backfill: true });
      expect(m.elements.find((e) => e.type === "trend")?.attrs).toEqual(["title", "format", "size", "unit", "color", "range", "history"]);
    }
    expect(manifest("square-480").history).toMatchObject({ points: 120, maxSeries: 6 });
    expect(manifest("round-360").history).toMatchObject({ points: 90, maxSeries: 2 });
  });
  test("an old document without history still validates", () => {
    const text = JSON.stringify(doc({ type: "trend" }));
    expect(validateDocument(text, manifest("round-360"), "round-360").ok).toBe(true);
  });
});
