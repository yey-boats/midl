// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { Element, Placement } from "@yey-boats/midl";
import type { DataProvider } from "./data";
import type { Theme } from "./theme";
import { resolveElement, type ElementModel } from "./model";

type Ctx = CanvasRenderingContext2D;

export class TrendBuffers {
  private cap = 120;
  private map = new Map<string, number[]>();
  push(id: string, n: number): void {
    const a = this.map.get(id) ?? [];
    a.push(n);
    if (a.length > this.cap) a.shift();
    this.map.set(id, a);
  }
  series(id: string): number[] { return this.map.get(id) ?? []; }
}

function fg(m: ElementModel, th: Theme): string {
  if (m.state === "stale") return th.stale;
  if (m.state === "bad") return th.danger;
  return th.fg;
}

function frame(ctx: Ctx, p: Placement, title: string, th: Theme, noData: boolean): void {
  const { x, y, w, h } = p.rect;
  ctx.fillStyle = th.panel;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = th.edge;
  ctx.setLineDash(noData ? [4, 4] : []);
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.setLineDash([]);
  ctx.fillStyle = th.dim;
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

function dial(ctx: Ctx, p: Placement, m: ElementModel, ringColor: string, th: Theme): void {
  const { x, y, w, h } = p.rect;
  const cx = x + w / 2, cy = y + h / 2 + 6, r = Math.min(w, h) * 0.32;
  ctx.strokeStyle = th.edge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (m.angleDeg != null) {
    const a = (m.angleDeg - 90) * Math.PI / 180;
    ctx.strokeStyle = ringColor;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  centerText(ctx, p, m.text, 22, fg(m, th));
}

function bar(ctx: Ctx, p: Placement, m: ElementModel, th: Theme): void {
  const { x, y, w, h } = p.rect;
  const bx = x + 14, bw = w - 28, by = y + h / 2, bh = 14;
  ctx.strokeStyle = th.edge;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = m.state === "stale" ? th.stale : th.accent;
  ctx.fillRect(bx, by, (m.fraction ?? 0) * bw, bh);
}

function gauge(ctx: Ctx, p: Placement, m: ElementModel, th: Theme): void {
  const { x, y, w, h } = p.rect;
  const cx = x + w / 2, cy = y + h * 0.62, r = Math.min(w, h) * 0.32;
  ctx.strokeStyle = th.edge;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = m.state === "stale" ? th.stale : th.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, Math.PI + (m.fraction ?? 0) * Math.PI);
  ctx.stroke();
  ctx.lineWidth = 1;
  centerText(ctx, p, m.text, 20, fg(m, th));
}

function trend(ctx: Ctx, p: Placement, m: ElementModel, series: number[], th: Theme): void {
  const { x, y, w, h } = p.rect;
  if (series.length >= 2) {
    const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
    ctx.strokeStyle = m.state === "stale" ? th.stale : th.accent;
    ctx.beginPath();
    series.forEach((v, i) => {
      const px = x + 10 + (i / (series.length - 1)) * (w - 20);
      const py = y + h - 12 - ((v - lo) / span) * (h - 36);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  ctx.fillStyle = fg(m, th);
  ctx.font = "14px system-ui";
  ctx.textAlign = "right";
  ctx.fillText(m.text, x + w - 10, y + h - 10);
}

function pill(ctx: Ctx, p: Placement, text: string, color: string, th: Theme): void {
  const { x, y, w, h } = p.rect;
  ctx.fillStyle = color;
  ctx.fillRect(x + w / 2 - 34, y + h / 2 - 12, 68, 24);
  centerText(ctx, p, text, 13, th.panel);
}

export function paintScreen(
  ctx: Ctx,
  placements: Placement[],
  elements: Record<string, Element>,
  provider: DataProvider,
  th: Theme,
  trends?: TrendBuffers,
): void {
  for (const p of placements) {
    const el = elements[p.elementId];
    if (!el) continue;
    let m: ElementModel;
    try { m = resolveElement(el, provider); }
    catch { m = { state: "bad", text: "--" }; } // one bad binding never stops the loop
    const title = el.name ?? p.elementId;
    frame(ctx, p, title, th, m.state === "no-data");
    if (m.state === "no-data") { centerText(ctx, p, "—", 30, th.dim); continue; }
    switch (el.type) {
      case "compass": dial(ctx, p, m, th.accent, th); break;
      case "windrose": dial(ctx, p, m, th.warn, th); break;
      case "gauge": gauge(ctx, p, m, th); break;
      case "bar": bar(ctx, p, m, th); break;
      case "trend": {
        if (trends && m.numeric != null) trends.push(p.elementId, m.numeric);
        trend(ctx, p, m, trends?.series(p.elementId) ?? [], th);
        break;
      }
      case "autopilot": pill(ctx, p, m.text || "STBY", th.accent, th); break;
      case "button": centerText(ctx, p, title, 16, th.accent); break;
      case "text": centerText(ctx, p, m.text, 20, fg(m, th)); break;
      default: centerText(ctx, p, m.text, 32, fg(m, th)); break; // single-value
    }
  }
}
