// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import type { Element } from "@yey-boats/midl";
import type { Placement } from "./solve";

type Ctx = CanvasRenderingContext2D;

// Sample value provider for the preview (no live SignalK in the browser yet).
export type ValueFn = (el: Element) => string;

const COLORS = { panel: "#11161d", edge: "#2a3a4a", fg: "#dce6f0", dim: "#7b8aa0", accent: "#3fa7ff", warn: "#ffb547" };

function frame(ctx: Ctx, p: Placement, title: string): void {
  const { x, y, w, h } = p.rect;
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = COLORS.edge;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = COLORS.dim;
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(title.toUpperCase(), x + 10, y + 18);
}

function centerText(ctx: Ctx, p: Placement, text: string, size: number, color: string): void {
  const { x, y, w, h } = p.rect;
  ctx.fillStyle = color;
  ctx.font = `${size}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 6);
  ctx.textBaseline = "alphabetic";
}

function dial(ctx: Ctx, p: Placement, value: string, ringColor: string): void {
  const { x, y, w, h } = p.rect;
  const cx = x + w / 2, cy = y + h / 2 + 6, r = Math.min(w, h) * 0.32;
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  centerText(ctx, p, value, 26, COLORS.fg);
}

function bar(ctx: Ctx, p: Placement, frac: number): void {
  const { x, y, w, h } = p.rect;
  const bx = x + 14, bw = w - 28, by = y + h / 2, bh = 14;
  ctx.strokeStyle = COLORS.edge;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(bx, by, Math.max(0, Math.min(1, frac)) * bw, bh);
}

// Paint one screen's placements. `valueFn` supplies display strings.
export function paintScreen(
  ctx: Ctx,
  placements: Placement[],
  elements: Record<string, Element>,
  valueFn: ValueFn,
): void {
  for (const p of placements) {
    const el = elements[p.elementId];
    if (!el) continue;
    const title = el.name ?? p.elementId;
    frame(ctx, p, title);
    const val = valueFn(el);
    switch (el.type) {
      case "compass": dial(ctx, p, val, COLORS.accent); break;
      case "windrose": dial(ctx, p, val, COLORS.warn); break;
      case "gauge": dial(ctx, p, val, COLORS.accent); break;
      case "bar": bar(ctx, p, 0.6); break;
      case "button": centerText(ctx, p, title, 18, COLORS.accent); break;
      default: centerText(ctx, p, val, 34, COLORS.fg); break; // single-value, text, trend, autopilot
    }
  }
}
