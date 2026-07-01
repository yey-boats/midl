// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { describe, it, expect } from "vitest";
import { solveLayout, expand, type Rect, type Node } from "../src";

const R: Rect = { x: 0, y: 0, w: 100, h: 100 };

describe("solveLayout", () => {
  it("places a single element to the full rect", () => {
    expect(solveLayout({ element: "a" }, R)).toEqual([{ elementId: "a", rect: R }]);
  });

  it("splits a row by equal weight", () => {
    const node: Node = { flow: "row", children: [{ element: "a" }, { element: "b" }] };
    const p = solveLayout(node, R);
    expect(p.map((x) => x.elementId)).toEqual(["a", "b"]);
    expect(p[0].rect.w).toBe(50);
    expect(p[1].rect.x).toBe(50);
  });

  it("honors explicit weights", () => {
    const node: Node = { flow: "row", children: [{ element: "a" }, { element: "b" }], weights: [3, 1] };
    const p = solveLayout(node, R);
    expect(p[0].rect.w).toBe(75);
    expect(p[1].rect.w).toBe(25);
  });

  it("fills a grid row-major", () => {
    const node: Node = { rows: 2, cols: 2, cells: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }] };
    const p = solveLayout(node, R);
    expect(p[3]).toEqual({ elementId: "d", rect: { x: 50, y: 50, w: 50, h: 50 } });
  });

  it("solves an expanded preset tree", () => {
    const tree = expand({ preset: "full", slots: ["a"] });
    const p = solveLayout(tree, R);
    expect(p.length).toBeGreaterThanOrEqual(1);
    expect(p[0].elementId).toBe("a");
  });

  // ── colSpan / rowSpan tests ───────────────────────────────────────────────

  it("all spans absent or 1 ⇒ output identical to no-span (regression)", () => {
    // 2×2 grid with all cells using default span (1). Output must match the
    // original row-major equal-slot calculation byte-for-byte.
    const withSpan1: Node = {
      rows: 2, cols: 2,
      cells: [
        { element: "a", colSpan: 1, rowSpan: 1 },
        { element: "b", colSpan: 1, rowSpan: 1 },
        { element: "c" },
        { element: "d" },
      ],
    };
    const noSpan: Node = {
      rows: 2, cols: 2,
      cells: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }],
    };
    expect(solveLayout(withSpan1, R)).toEqual(solveLayout(noSpan, R));
  });

  it("colSpan:2 on cell0 spans the full top row of a 2×2 grid", () => {
    // cell0 colSpan:2 → occupies cols 0–1 of row 0 (full width, half height)
    // cell1 → row 1, col 0; cell2 → row 1, col 1
    const node: Node = {
      rows: 2, cols: 2,
      cells: [
        { element: "a", colSpan: 2 },
        { element: "b" },
        { element: "c" },
      ],
    };
    const p = solveLayout(node, R);
    expect(p.map((x) => x.elementId)).toEqual(["a", "b", "c"]);
    // a: full width, top half
    expect(p[0].rect).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    // b: bottom-left
    expect(p[1].rect).toEqual({ x: 0, y: 50, w: 50, h: 50 });
    // c: bottom-right
    expect(p[2].rect).toEqual({ x: 50, y: 50, w: 50, h: 50 });
  });

  it("rowSpan:2 on cell0 spans the full left column of a 2×2 grid", () => {
    // cell0 rowSpan:2 → occupies rows 0–1 of col 0 (half width, full height)
    // cell1 → row 0, col 1; cell2 → row 1, col 1
    const node: Node = {
      rows: 2, cols: 2,
      cells: [
        { element: "a", rowSpan: 2 },
        { element: "b" },
        { element: "c" },
      ],
    };
    const p = solveLayout(node, R);
    expect(p.map((x) => x.elementId)).toEqual(["a", "b", "c"]);
    // a: left column, full height
    expect(p[0].rect).toEqual({ x: 0, y: 0, w: 50, h: 100 });
    // b: top-right
    expect(p[1].rect).toEqual({ x: 50, y: 0, w: 50, h: 50 });
    // c: bottom-right
    expect(p[2].rect).toEqual({ x: 50, y: 50, w: 50, h: 50 });
  });

  it("colSpan + rowSpan: 2×3 grid cell0 spans 2 cols × 2 rows", () => {
    // Grid: 2 rows, 3 cols. cell0 takes top-left 2×2 block.
    // Remaining cells fill the remaining 4 slots:
    //   row0: [a(cs2,rs2), _, _, c]  ← c is (0,2)
    //   row1: [_,          _, _, d]  ← d is (1,2)
    // Wait — 2 rows × 3 cols = 6 total slots.
    // cell0 colSpan:2 rowSpan:2 occupies (0,0),(0,1),(1,0),(1,1) = 4 slots.
    // Remaining: (0,2),(1,2) = 2 slots → 2 more cells needed.
    const node: Node = {
      rows: 2, cols: 3,
      cells: [
        { element: "a", colSpan: 2, rowSpan: 2 },
        { element: "b" },
        { element: "c" },
      ],
    };
    const vp: Rect = { x: 0, y: 0, w: 300, h: 200 };
    const p = solveLayout(node, vp);
    expect(p.map((x) => x.elementId)).toEqual(["a", "b", "c"]);
    // a: cols 0–1 × rows 0–1 → x=0, y=0, w=200, h=200
    expect(p[0].rect).toEqual({ x: 0, y: 0, w: 200, h: 200 });
    // b: col 2, row 0 → x=200, y=0, w=100, h=100
    expect(p[1].rect).toEqual({ x: 200, y: 0, w: 100, h: 100 });
    // c: col 2, row 1 → x=200, y=100, w=100, h=100
    expect(p[2].rect).toEqual({ x: 200, y: 100, w: 100, h: 100 });
  });

  it("colSpan clamped to remaining cols when span would exceed grid", () => {
    // cell0 at col 1 of 2 cols requests colSpan:5 — gets clamped to 1.
    // 1×2 grid: [b, a(clamp)] where a requests colSpan:5 from col 1
    const node: Node = {
      rows: 1, cols: 2,
      cells: [
        { element: "b" },
        { element: "a", colSpan: 5 },
      ],
    };
    const p = solveLayout(node, R);
    // a occupies col 1 only (clamped from 5 to 1)
    expect(p.find((x) => x.elementId === "a")!.rect).toEqual({ x: 50, y: 0, w: 50, h: 100 });
  });
});
