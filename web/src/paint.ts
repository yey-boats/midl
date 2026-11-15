// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { Element, Placement } from "@yey-boats/midl";
import type { DataProvider } from "./data";
import type { Theme } from "./theme";
import { resolveElement, type ElementModel } from "./model";
import { resolveOptionalColor } from "./svg/color";
import { captionFontSize } from "./svg/frame";
import { HistoryStore, trendChartFor, allowedTrendKeys, trendAllowed, chartRuns, type TrendChart } from "./history";

type Ctx = CanvasRenderingContext2D;

// The old count-based TrendBuffers is now the time-bucket HistoryStore
// (same constructor, same `trends` option); both names stay exported.
export { TrendBuffers, HistoryStore } from "./history";

// `custom` is the element's resolved style.color (allowlisted hex) or undefined.
function fg(m: ElementModel, th: Theme, custom?: string): string {
  if (m.state === "stale") return th.stale;
  if (m.state === "bad") return th.danger;
  return custom ?? th.fg;
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
  const fs = captionFontSize(p.rect, title); // firmware caption size, as the SVG frame (#37)
  ctx.font = `${fs}px system-ui`;
  ctx.textAlign = "left";
  ctx.fillText(title.toUpperCase(), x + 12, y + 6 + fs * 0.9);
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

function dial(ctx: Ctx, p: Placement, m: ElementModel, ringColor: string, th: Theme, custom?: string): void {
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
  centerText(ctx, p, m.text, 22, fg(m, th, custom));
}

// Bar, as the firmware and the SVG backend: the number takes style.color
// (default accent) and the fill theme good. Once the element declares zones
// the firmware zone block owns both: active zone colour, else theme good.
// style.center draws the deviation needle from the middle (XTE).
function bar(ctx: Ctx, p: Placement, m: ElementModel, th: Theme, zoned: boolean, zone?: string, styleColor?: string, center?: boolean): void {
  const { x, y, w, h } = p.rect;
  const bx = x + 14, bw = w - 28, by = y + h / 2, bh = 14;
  ctx.fillStyle = fg(m, th, zoned ? zone ?? th.good : styleColor ?? th.accent);
  ctx.font = "24px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(m.text + (m.side ?? ""), x + w / 2, by - 12);
  ctx.strokeStyle = th.edge;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = m.state === "stale" ? th.stale : zone ?? th.good;
  if (center) {
    const nx = bx + bw / 2 + ((m.fraction ?? 0.5) - 0.5) * bw;
    ctx.fillRect(nx - 2, by - 2, 4, bh + 4);
  } else {
    ctx.fillRect(bx, by, (m.fraction ?? 0) * bw, bh);
  }
}

function gauge(ctx: Ctx, p: Placement, m: ElementModel, th: Theme, custom?: string): void {
  const { x, y, w, h } = p.rect;
  const cx = x + w / 2, cy = y + h * 0.62, r = Math.min(w, h) * 0.32;
  ctx.strokeStyle = th.edge;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = m.state === "stale" ? th.stale : custom ?? th.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, Math.PI + (m.fraction ?? 0) * Math.PI);
  ctx.stroke();
  ctx.lineWidth = 1;
  centerText(ctx, p, m.text, 20, fg(m, th, custom));
}

// Trend tile (spec §3): with history, the number sits in the upper half and
// the time chart fills the lower half, y-range max/min as dim labels at its
// left edge; without a history store the number is centred (no chart).
function trend(ctx: Ctx, p: Placement, m: ElementModel, chart: TrendChart | null | undefined, th: Theme, custom?: string): void {
  const { x, y, w, h } = p.rect;
  if (chart === undefined) { centerText(ctx, p, m.text, 26, fg(m, th, custom ?? th.accent)); return; }
  ctx.fillStyle = fg(m, th, custom ?? th.accent);
  ctx.font = "24px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(m.text, x + w / 2, y + h * 0.3);
  ctx.textBaseline = "alphabetic";
  if (!chart) return;
  const fs = Math.max(9, Math.min(13, h * 0.07));
  const gutter = Math.max(chart.hiLabel.length, chart.loLabel.length) * fs * 0.6 + 6;
  const top = y + h * 0.52, bottom = y + h - 10;
  const x0 = x + 10 + gutter, cw = Math.max(1, w - 20 - gutter), ch = Math.max(1, bottom - top);
  ctx.strokeStyle = m.state === "stale" ? th.stale : custom ?? th.accent;
  ctx.lineWidth = 2;
  for (const run of chartRuns(chart, x0, top, cw, ch)) {
    ctx.beginPath();
    run.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.fillStyle = th.dim;
  ctx.font = `${fs}px system-ui`;
  ctx.textAlign = "left";
  ctx.fillText(chart.hiLabel, x + 10, top + fs * 0.8);
  ctx.fillText(chart.loLabel, x + 10, bottom);
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
  /** Trend history store; keep one instance across paints. */
  trends?: HistoryStore,
): void {
  const allowed = trends && Number.isFinite(trends.maxSeries)
    ? allowedTrendKeys(placements.map((p) => p.elementId), elements, trends.maxSeries) : undefined;
  for (const p of placements) {
    const el = elements[p.elementId];
    if (!el) continue;
    let m: ElementModel;
    try { m = resolveElement(el, provider); }
    catch { m = { state: "bad", text: "--" }; } // one bad binding never stops the loop
    const title = el.name ?? p.elementId;
    frame(ctx, p, title, th, m.state === "no-data");
    if (m.state === "no-data") { centerText(ctx, p, "—", 30, th.dim); continue; }
    // style.color (or legacy colorRole), allowlisted like the SVG backend.
    // Zone colour wins over style.color, as in the SVG backend.
    const style = (el.style ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const zone = resolveOptionalColor(m.zoneColor, th);
    const styleColor = resolveOptionalColor(str(style.color) ?? str(style.colorRole), th);
    const custom = zone ?? styleColor;
    switch (el.type) {
      case "compass": dial(ctx, p, m, custom ?? th.accent, th, custom); break;
      case "windrose":
      case "windsteer": dial(ctx, p, m, custom ?? th.warn, th, custom); break; // windsteer: windrose stand-in
      case "gauge": gauge(ctx, p, m, th, custom); break;
      case "bar": bar(ctx, p, m, th, Array.isArray(style.zones) && style.zones.length > 0, zone, styleColor, typeof style.center === "number"); break;
      case "trend": {
        // trend has no zones in the firmware: line and number follow style.color only
        trend(ctx, p, m, trendChartFor(el, m, trends, provider, trendAllowed(el, allowed)), th, styleColor);
        break;
      }
      case "autopilot": pill(ctx, p, m.text || "STBY", custom ?? th.accent, th); break;
      case "button": centerText(ctx, p, title, 16, custom ?? th.accent); break;
      case "text": centerText(ctx, p, m.text, 20, fg(m, th, custom)); break;
      // TODO(firmware-parity-wave5): `clinometer` (heel/pitch attitude dial,
      // catalog wave5) has no dedicated Canvas painter yet — it falls through
      // to the generic numeric readout below. Model an arc widget on `dial()`
      // (heel arc + port/stbd bands + pitch secondary) when a Canvas preview
      // of it is needed; the SVG backend has the matching TODO in render-svg.ts.
      default: centerText(ctx, p, m.text, 32, fg(m, th, custom)); break; // single-value, clinometer
    }
  }
}
