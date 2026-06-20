// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// midl/web/test/solve.test.ts
import { test, expect } from "vitest";
import { solveLayout, type Rect } from "../src/solve";

const vp: Rect = { x: 0, y: 0, w: 480, h: 480 };

test("a leaf fills the whole rect", () => {
  expect(solveLayout({ element: "a" }, vp)).toEqual([{ elementId: "a", rect: vp }]);
});

test("a row split halves the width", () => {
  const out = solveLayout({ dir: "row", children: [{ element: "a" }, { element: "b" }] }, vp);
  expect(out).toEqual([
    { elementId: "a", rect: { x: 0, y: 0, w: 240, h: 480 } },
    { elementId: "b", rect: { x: 240, y: 0, w: 240, h: 480 } },
  ]);
});

test("a col split halves the height", () => {
  const out = solveLayout({ dir: "col", children: [{ element: "a" }, { element: "b" }] }, vp);
  expect(out.map((p) => p.rect.h)).toEqual([240, 240]);
  expect(out[1].rect.y).toBe(240);
});

test("weights distribute proportionally", () => {
  const out = solveLayout({ dir: "row", children: [{ element: "a" }, { element: "b" }], weights: [1, 3] }, vp);
  expect(out[0].rect.w).toBe(120);
  expect(out[1].rect.w).toBe(360);
  expect(out[1].rect.x).toBe(120);
});

test("a 2x2 grid yields four equal cells", () => {
  const out = solveLayout(
    { rows: 2, cols: 2, cells: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }] },
    vp,
  );
  expect(out.map((p) => p.elementId)).toEqual(["a", "b", "c", "d"]);
  expect(out[3].rect).toEqual({ x: 240, y: 240, w: 240, h: 240 });
});

test("nested {1,{2,3}} places three leaves without overlap", () => {
  const out = solveLayout(
    { dir: "row", children: [{ element: "hero" }, { dir: "col", children: [{ element: "b" }, { element: "c" }] }] },
    vp,
  );
  expect(out.map((p) => p.elementId)).toEqual(["hero", "b", "c"]);
  expect(out[0].rect.w).toBe(240);
  expect(out[1].rect).toEqual({ x: 240, y: 0, w: 240, h: 240 });
  expect(out[2].rect).toEqual({ x: 240, y: 240, w: 240, h: 240 });
});
