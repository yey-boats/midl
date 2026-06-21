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
});
