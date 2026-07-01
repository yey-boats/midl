// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { Node } from "./types";

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
    // Track occupied slots in the rows×cols grid. A cell with colSpan/rowSpan
    // marks multiple slots as occupied; subsequent cells skip occupied slots.
    // When all spans are 1 (or absent) this degenerates to the original
    // row-major index and produces byte-identical output.
    const occupied = new Array<boolean>(node.rows * node.cols).fill(false);
    let slot = 0; // next candidate slot
    for (const child of node.cells) {
      // Advance past any already-occupied slots.
      while (slot < occupied.length && occupied[slot]) slot++;
      if (slot >= occupied.length) break;
      const r = Math.floor(slot / node.cols);
      const c = slot % node.cols;
      // Read optional span from cell; clamp to remaining grid space.
      const raw = child as Record<string, unknown>;
      const cs = Math.min(typeof raw["colSpan"] === "number" ? raw["colSpan"] : 1, node.cols - c);
      const rs = Math.min(typeof raw["rowSpan"] === "number" ? raw["rowSpan"] : 1, node.rows - r);
      // Mark all covered slots as occupied.
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          occupied[(r + dr) * node.cols + (c + dc)] = true;
        }
      }
      const cellRect: Rect = { x: rect.x + c * cw, y: rect.y + r * ch, w: cw * cs, h: ch * rs };
      out.push(...solveLayout(child, cellRect));
    }
    return out;
  }

  return []; // preset node — must be expanded before solving
}
