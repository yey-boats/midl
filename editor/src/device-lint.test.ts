// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, describe } from "vitest";
import { lintDeviceCapabilities } from "./device-lint";
import type { EditorModel } from "./model";
import type { Manifest } from "@yey-boats/midl";

function model(overrides: Partial<EditorModel> = {}): EditorModel {
  return {
    midl: "1.0.0", screenId: "s", title: "T", titleLoc: "id",
    elements: {},
    layout: { rows: 1, cols: 1, cells: [{ element: "a" }] },
    variants: [],
    ...overrides,
  };
}

describe("lintDeviceCapabilities", () => {
  test("a plain single-value grid produces no device-lint issues", () => {
    const m = model({
      elements: { a: { id: "a", type: "single-value", bindings: { value: { kind: "signalk", path: "x" } } } },
    });
    expect(lintDeviceCapabilities(m)).toEqual([]);
  });

  test("zones, range, markers, sectors, hull, band, color, size, side, dir, action are all flagged", () => {
    const m = model({
      elements: {
        a: {
          id: "a", type: "windrose",
          bindings: { value: { kind: "signalk", path: "x" }, dir: { kind: "signalk", path: "y" } },
          markers: [{ glyph: "triangle", color: "accent" }],
          action: { kind: "put", target: "z", value: "auto" },
          format: { side: "port-stbd", decimals: 1 },
          style: { zones: [{ lt: 10, color: "warn" }], range: [0, 100], sectors: [{ from: -30, to: 30, color: "port" }], hull: true, shape: "band", colorRole: "warn", size: "XL" },
        },
      },
    });
    const features = new Set(lintDeviceCapabilities(m).map((i) => i.feature));
    for (const f of ["zones", "range", "markers", "sectors", "hull", "shape=band", "color", "size", "format.side", "secondary-binding", "action"]) {
      expect(features.has(f)).toBe(true);
    }
  });

  test("trend is flagged as degraded (renders as plain number)", () => {
    const m = model({ elements: { a: { id: "a", type: "trend", bindings: { value: { kind: "signalk", path: "x" } } } } });
    const trend = lintDeviceCapabilities(m).find((i) => i.feature === "trend");
    expect(trend?.kind).toBe("degrade");
  });

  test("a non-grid (flow) base layout is flagged", () => {
    const m = model({ layout: { flow: "row", children: [{ element: "a" }, { element: "b" }] } });
    expect(lintDeviceCapabilities(m).some((i) => i.feature === "layout")).toBe(true);
  });

  test("tile overflow beyond maxTiles is flagged", () => {
    const m = model({ layout: { rows: 1, cols: 5, cells: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }, { element: "e" }] } });
    const overflow = lintDeviceCapabilities(m, 4).find((i) => i.feature === "tile-overflow");
    expect(overflow).toBeDefined();
    expect(overflow!.message).toMatch(/5 tiles/);
  });

  test("variants are flagged as not selected by the device", () => {
    const m = model({ variants: [{ class: "landscape-800x480", layout: { rows: 1, cols: 1, cells: [{ element: "a" }] } }] });
    expect(lintDeviceCapabilities(m).some((i) => i.feature === "variants")).toBe(true);
  });
});

describe("lintDeviceCapabilities — manifest-driven (#4)", () => {
  const MANIFEST: Manifest = {
    midl: "1.0.0", board: "test",
    classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3 }],
    elements: [
      { type: "single-value", bindings: ["value"], attrs: ["size", "color", "unit"] },
      { type: "windrose", bindings: ["value", "dir"], glyphs: ["triangle", "diamond"] },
    ],
    actionKinds: ["nav", "command"],
    glyphs: ["triangle", "diamond"],
    maxMarkersPerDial: 2,
  };

  test("an element type absent from the manifest is flagged unsupported", () => {
    const m = model({ elements: { a: { id: "a", type: "sparkline-xyz" } } });
    const issues = lintDeviceCapabilities(m, 4, MANIFEST);
    expect(issues.some((i) => i.feature === "type" && /not supported by this device class/.test(i.message))).toBe(true);
  });

  test("a put action is flagged because the class only supports nav/command", () => {
    const m = model({ elements: { a: { id: "a", type: "single-value", action: { kind: "put", target: "x", value: "1" } } } });
    const issues = lintDeviceCapabilities(m, 4, MANIFEST);
    expect(issues.some((i) => i.feature === "action-kind" && /action kind "put" is not supported/.test(i.message))).toBe(true);
  });

  test("a marker glyph outside the device glyph set is flagged, and >maxMarkersPerDial overflows", () => {
    const m = model({
      elements: {
        a: { id: "a", type: "windrose", bindings: { value: { kind: "signalk", path: "x" } },
             markers: [{ glyph: "starburst" }, { glyph: "triangle" }, { glyph: "diamond" }] },
      },
    });
    const issues = lintDeviceCapabilities(m, 4, MANIFEST);
    expect(issues.some((i) => i.feature === "glyph" && /"starburst"/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.feature === "marker-overflow" && /at most 2 per dial/.test(i.message))).toBe(true);
  });

  test("an unsupported binding key is flagged (vs dir which the windrose declares)", () => {
    const m = model({
      elements: {
        a: { id: "a", type: "windrose", bindings: { value: { kind: "signalk", path: "x" }, bogus: { kind: "signalk", path: "y" } } },
      },
    });
    const issues = lintDeviceCapabilities(m, 4, MANIFEST);
    expect(issues.some((i) => i.feature === "binding" && /"bogus" binding is not a supported/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.feature === "binding" && /"dir"/.test(i.message))).toBe(false);
  });
});
