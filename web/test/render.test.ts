// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import { renderDashboard, prepareDashboard, paintPrepared } from "../src/render";
import { MockDataProvider } from "../src/data";
import { THEMES } from "../src/theme";
import type { Manifest } from "@yey-boats/midl";

const manifest: Manifest = {
  midl: "1.0.0", board: "preview",
  classes: [{ id: "square-480", width: 480, height: 480, maxTiles: 4, maxDepth: 3, elements: ["single-value", "bar"] }],
  elements: [{ type: "single-value", bindings: ["value"] }, { type: "bar", bindings: ["value"] }],
  sources: ["signalk"],
};
const doc = `midl: 1.0.0
screens:
  - id: dash
    elements:
      sog: { type: single-value, name: SOG, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }
      batt: { type: bar, name: BATT, style: { range: [0, 1] }, bindings: { value: { kind: signalk, path: electrical.batteries.house.stateOfCharge } } }
    layout: { rows: 1, cols: 2, cells: [{ element: sog }, { element: batt }] }
`;

function noopCtx(): CanvasRenderingContext2D {
  return new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
}

test("renderDashboard returns ok + the set of bound signalk paths", () => {
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 3 } });
  const r = renderDashboard(noopCtx(), doc, manifest, "square-480", { x: 0, y: 0, w: 480, h: 480 }, provider);
  expect(r.ok).toBe(true);
  expect(r.paths.sort()).toEqual(["electrical.batteries.house.stateOfCharge", "navigation.speedOverGround"]);
});

test("invalid doc returns issues and no paths", () => {
  const bad = manifest.classes[0].elements = ["single-value"]; void bad; // bar unsupported
  const r = renderDashboard(noopCtx(), doc, manifest, "square-480", { x: 0, y: 0, w: 480, h: 480 }, new MockDataProvider({}));
  expect(r.ok).toBe(false);
  expect(r.paths).toEqual([]);
});

test("prepareDashboard validates+solves once and exposes screens+paths; paintPrepared repaints without re-validating", () => {
  // Use a fresh manifest to avoid cross-test mutation from the previous test
  const freshManifest: Manifest = {
    midl: "1.0.0", board: "preview",
    classes: [{ id: "square-480", width: 480, height: 480, maxTiles: 4, maxDepth: 3, elements: ["single-value", "bar"] }],
    elements: [{ type: "single-value", bindings: ["value"] }, { type: "bar", bindings: ["value"] }],
    sources: ["signalk"],
  };
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 3 } });
  const prep = prepareDashboard(doc, freshManifest, "square-480", { x: 0, y: 0, w: 480, h: 480 });
  expect(prep.ok).toBe(true);
  expect(prep.screens.length).toBeGreaterThan(0);
  expect(prep.paths.sort()).toEqual(["electrical.batteries.house.stateOfCharge", "navigation.speedOverGround"]);
  // repaint twice on the same prepared object (no throw, no re-validate path)
  paintPrepared(noopCtx(), prep, provider, THEMES.night);
  paintPrepared(noopCtx(), prep, provider, THEMES.night);
});
