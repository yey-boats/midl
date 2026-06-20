// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import type { Node } from "@yey-boats/midl";

export interface Rect { x: number; y: number; w: number; h: number; }
export interface Placement { elementId: string; rect: Rect; }

// Walk an EXPANDED layout tree (no preset nodes) and assign a pixel rect
// to every leaf. Splits divide along their axis by weight (default equal);
// grids divide into rows x cols equal cells, row-major.
export function solveLayout(node: Node, rect: Rect): Placement[] {
  if ("element" in node) return [{ elementId: node.element, rect }];

  if ("children" in node) {
    const weights = node.weights ?? node.children.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const out: Placement[] = [];
    let off = 0;
    node.children.forEach((child, i) => {
      const frac = weights[i] / total;
      let childRect: Rect;
      if (node.flow === "row") {
        const w = rect.w * frac;
        childRect = { x: rect.x + off, y: rect.y, w, h: rect.h };
        off += w;
      } else {
        const h = rect.h * frac;
        childRect = { x: rect.x, y: rect.y + off, w: rect.w, h };
        off += h;
      }
      out.push(...solveLayout(child, childRect));
    });
    return out;
  }

  if ("cells" in node) {
    const cw = rect.w / node.cols;
    const ch = rect.h / node.rows;
    const out: Placement[] = [];
    node.cells.forEach((child, i) => {
      const r = Math.floor(i / node.cols);
      const c = i % node.cols;
      out.push(...solveLayout(child, { x: rect.x + c * cw, y: rect.y + r * ch, w: cw, h: ch }));
    });
    return out;
  }

  return []; // preset node — must be expanded before solving
}
