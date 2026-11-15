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

  test("without a manifest, rich authored features are not flagged (the device renders MIDL natively)", () => {
    const m = model({
      elements: {
        a: {
          id: "a", type: "windrose",
          bindings: { value: { kind: "signalk", path: "x" }, dir: { kind: "signalk", path: "y" } },
          format: { side: "port-stbd", decimals: 1 },
          style: { sectors: [{ from: -30, to: 30, color: "port" }], hull: true, shape: "band", colorRole: "warn", size: "XL" },
        },
        t: { id: "t", type: "trend", bindings: { value: { kind: "signalk", path: "z" } } },
      },
      layout: { flow: "row", children: [{ element: "a" }, { element: "t" }] },
      variants: [{ class: "landscape-800x480", layout: { rows: 1, cols: 1, cells: [{ element: "a" }] } }],
    });
    expect(lintDeviceCapabilities(m)).toEqual([]);
  });

  test("tile overflow beyond maxTiles is flagged", () => {
    const m = model({ layout: { rows: 1, cols: 5, cells: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }, { element: "e" }] } });
    const overflow = lintDeviceCapabilities(m, 4).find((i) => i.feature === "tile-overflow");
    expect(overflow).toBeDefined();
    expect(overflow!.message).toMatch(/5 tiles/);
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
    presets: ["full", "hero-split"],
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

  test("a wind dial with direction, a trend and a spanning grid pass on square-480", () => {
    const real = { ...MANIFEST, elements: [
      ...MANIFEST.elements,
      { type: "trend", bindings: ["value"], attrs: ["title", "size", "unit", "color"] },
    ] } as Manifest;
    const m = model({
      elements: {
        w: { id: "w", type: "windrose", bindings: { value: { kind: "signalk", path: "a" }, dir: { kind: "signalk", path: "b" } } },
        t: { id: "t", type: "trend", bindings: { value: { kind: "signalk", path: "c" } } },
        d: { id: "d", type: "single-value", bindings: { value: { kind: "signalk", path: "e" } } },
      },
      layout: { rows: 2, cols: 2, cells: [{ element: "w", colSpan: 2 }, { element: "t" }, { element: "d" }] },
    });
    expect(lintDeviceCapabilities(m, 4, real)).toEqual([]);
  });

  test("style attrs the type does not declare are flagged; declared ones pass", () => {
    const m = model({
      elements: {
        a: { id: "a", type: "single-value", bindings: { value: { kind: "signalk", path: "x" } },
             format: { side: "port-stbd" }, style: { zones: [{ lt: 1, color: "warn" }], size: "XL", colorRole: "warn" } },
      },
    });
    const features = lintDeviceCapabilities(m, 4, MANIFEST).map((i) => i.feature);
    expect(features).toContain("zones");
    expect(features).toContain("side");
    expect(features).not.toContain("size");
    expect(features).not.toContain("color");
  });

  test("a preset the class does not ship is flagged", () => {
    const m = model({ layout: { preset: "quad-xyz", slots: [{ element: "a" }] } as never });
    const issues = lintDeviceCapabilities(m, 4, MANIFEST);
    expect(issues.some((i) => i.feature === "preset" && /quad-xyz/.test(i.message))).toBe(true);
  });
});
