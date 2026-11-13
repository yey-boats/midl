// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Round-safe placement (#36). On a round panel the solver still lays tiles
// out in the full square, so corner tiles reach under the bezel. The frame
// (panel background) keeps the whole cell; only the tile CONTENT is moved
// into the part of the cell that lies inside the visible circle:
//   - safeRect:  the largest axis-aligned rect inside cell ∩ disc (caption,
//                values, bars, pills);
//   - fitCircle: the largest circle inside cell ∩ disc that avoids a box
//                (round dials, which need a circle, not a rect).
// Pure geometry; no element knowledge. Not yet in the firmware
// (yey-boats/instruments#50) or the Canvas painter (midl#45).
import type { Rect } from "@yey-boats/midl";

export interface Disc { cx: number; cy: number; r: number; }

/** Visible disc of a round viewport, inset by `margin` px from the bezel. */
export function viewportDisc(vp: Rect, margin = 4): Disc {
  return { cx: vp.x + vp.w / 2, cy: vp.y + vp.h / 2, r: Math.max(0, Math.min(vp.w, vp.h) / 2 - margin) };
}

function inside(d: Disc, x: number, y: number): boolean {
  return (x - d.cx) ** 2 + (y - d.cy) ** 2 <= d.r * d.r + 1e-6;
}

/** True when every corner of `t` lies inside the disc. */
export function rectInDisc(t: Rect, d: Disc): boolean {
  return inside(d, t.x, t.y) && inside(d, t.x + t.w, t.y) && inside(d, t.x, t.y + t.h) && inside(d, t.x + t.w, t.y + t.h);
}

/**
 * Largest-area axis-aligned rect inside `t` ∩ disc. Returns `t` unchanged when
 * it already fits. For a horizontal half-width budget `dx` (the farthest any
 * column may sit from the disc centre) the usable height is the chord at dx,
 * so a 1-D scan over dx finds the optimum.
 */
export function safeRect(t: Rect, d: Disc): Rect {
  if (rectInDisc(t, d)) return t;
  let best: Rect = { x: t.x + t.w / 2, y: t.y + t.h / 2, w: 0, h: 0 };
  const steps = 240;
  for (let i = 1; i <= steps; i++) {
    const half = (d.r * i) / steps;
    const x0 = Math.max(t.x, d.cx - half), x1 = Math.min(t.x + t.w, d.cx + half);
    if (x1 <= x0) continue;
    const dx = Math.max(Math.abs(x0 - d.cx), Math.abs(x1 - d.cx));
    if (dx > d.r) continue;
    const chord = Math.sqrt(d.r * d.r - dx * dx);
    const y0 = Math.max(t.y, d.cy - chord), y1 = Math.min(t.y + t.h, d.cy + chord);
    if (y1 <= y0) continue;
    if ((x1 - x0) * (y1 - y0) > best.w * best.h) best = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return best;
}

function distToBox(px: number, py: number, b: Rect): number {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
  const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * Largest circle inside `t` ∩ disc that does not overlap `avoid` (e.g. the
 * chrome caption). Coarse grid then a local refinement; returns the square
 * rect circumscribing that circle (dials size themselves from min(w, h)).
 */
export function fitCircle(t: Rect, d: Disc, avoid?: Rect): Rect {
  const radiusAt = (px: number, py: number) => Math.min(
    d.r - Math.hypot(px - d.cx, py - d.cy),
    px - t.x, t.x + t.w - px, py - t.y, t.y + t.h - py,
    avoid ? distToBox(px, py, avoid) : Infinity,
  );
  let bx = t.x + t.w / 2, by = t.y + t.h / 2, br = radiusAt(bx, by);
  const n = 32;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const px = t.x + (t.w * i) / n, py = t.y + (t.h * j) / n;
      const r = radiusAt(px, py);
      if (r > br) { br = r; bx = px; by = py; }
    }
  }
  for (let step = Math.max(t.w, t.h) / n; step > 0.25; step /= 2) {
    for (const [ox, oy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const r = radiusAt(bx + ox, by + oy);
      if (r > br) { br = r; bx += ox; by += oy; }
    }
  }
  br = Math.max(0, br);
  return { x: bx - br, y: by - br, w: 2 * br, h: 2 * br };
}
