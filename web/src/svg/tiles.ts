// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// SVG widget builders for the non-dial element types, restyled to the Claude
// Design style guide. Each returns an SVG <g> snippet positioned within the
// element's rect. The frame owns the top-left caption, so tiles render
// value/secondary only (no title caption). Pure functions of (rect, model, theme).
import type { Rect } from "@yey-boats/midl";
import type { Theme } from "../theme";
import type { ElementModel } from "../model";
import {
  FONT_FAMILY, GAUGE_TRACK, GAUGE_CYAN, GAUGE_TICK, AP_PILL_BG, BTN_INK, BAR_TRACK,
} from "../theme";
import { polar, arc, esc, f } from "./geometry";
import { resolveColor } from "./color";

const FN = FONT_FAMILY;

function valColor(m: ElementModel, th: Theme, override?: string): string {
  if (m.state === "stale") return th.stale;
  if (m.state === "bad") return th.bad;
  if (override) return override;
  return th.fg;
}

function txt(x: number, y: number, s: number, fill: string, str: string, weight = 700, anchor = "middle", extra = ""): string {
  return `<text x="${f(x)}" y="${f(y)}" font-family="${FN}" font-weight="${weight}" font-size="${f(s)}" fill="${fill}" text-anchor="${anchor}"${extra}>${esc(str)}</text>`;
}

export interface TileOpts { title?: string; size?: number; center?: number; unit?: string; }

// HERO numeric is ACCENT (per spec), unless a zone colour applies or state
// overrides (stale/bad). The unit (if any) sits at 20/dim to the right.
export function singleValueSvg(rect: Rect, m: ElementModel, th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const hero = opts.size ?? 38;
  const base = m.zoneColor ? resolveColor(m.zoneColor, th, th.accent) : th.accent;
  const color = valColor(m, th, base);
  const out: string[] = [];
  const unit = opts.unit;
  // formatValue already appends the unit to m.text (e.g. "6.0 kn"); strip it so
  // the dim unit drawn separately below isn't duplicated ("6.0 kn kn").
  let body = m.text;
  if (unit && body.endsWith(unit)) body = body.slice(0, -unit.length).trimEnd();
  const value = body + (m.side ?? "");
  out.push(txt(cx, cy + hero * 0.34, hero, color, value, 700, "middle", ` letter-spacing="-0.02em"`));
  if (unit) {
    // place the unit just to the right of the centred value.
    out.push(txt(cx + w * 0.30, cy + hero * 0.34, 20, th.dim, unit, 400, "start"));
  }
  return `<g>${out.join("")}</g>`;
}

export function textSvg(rect: Rect, m: ElementModel, th: Theme, _opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const lines = m.text.split("\n");
  const size = 20;
  const color = valColor(m, th, th.accent);
  const out: string[] = [];
  const top = y + h / 2 - ((lines.length - 1) * size * 0.7) / 2;
  lines.forEach((ln, i) => out.push(txt(cx, top + i * size * 1.2 + size * 0.34, size, color, ln, 600)));
  return `<g>${out.join("")}</g>`;
}

export function barSvg(rect: Rect, m: ElementModel, th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const out: string[] = [];
  const fill = m.state === "stale" ? th.stale : resolveColor(m.zoneColor, th, th.good);
  const bx = x + 16, bw = w - 32, bh = 22;
  const by = y + h * 0.62;

  // hero percent above the track (accent)
  const hero = opts.size ?? 38;
  out.push(txt(cx, by - 14, hero, valColor(m, th, th.accent), m.text + (m.side ?? ""), 700, "middle", ` letter-spacing="-0.02em"`));

  // track
  out.push(`<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" rx="3" fill="${BAR_TRACK}" stroke="${th.edge}" stroke-width="1"/>`);

  if (opts.center != null) {
    // centered deviation needle bar (e.g. XTE): fraction 0..1 maps to -1..1.
    const dev = ((m.fraction ?? 0.5) - 0.5) * 2; // -1..1
    const midX = bx + bw / 2;
    const nx = midX + dev * (bw / 2);
    out.push(`<line x1="${f(midX)}" y1="${f(by)}" x2="${f(midX)}" y2="${f(by + bh)}" stroke="${th.dim}" stroke-width="1"/>`);
    out.push(`<rect x="${f(nx - 2)}" y="${f(by - 2)}" width="4" height="${f(bh + 4)}" rx="2" fill="${fill}"/>`);
  } else {
    const fillW = Math.max(0, Math.min(1, m.fraction ?? 0)) * bw;
    out.push(`<rect x="${f(bx)}" y="${f(by)}" width="${f(fillW)}" height="${f(bh)}" rx="3" fill="${fill}"/>`);
  }
  return `<g>${out.join("")}</g>`;
}

// 270deg sweep gauge (-135..+135): track + cyan fill, 5 ticks, cyan percent.
export function gaugeSvg(rect: Rect, m: ElementModel, th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h * 0.58;
  const r = Math.min(w, h) * 0.40;
  const out: string[] = [];
  const sw = 8;

  // track
  out.push(`<path d="${arc(cx, cy, -135, 135, r)}" fill="none" stroke="${GAUGE_TRACK}" stroke-width="${sw}" stroke-linecap="round"/>`);

  // fill
  const frac = Math.max(0, Math.min(1, m.fraction ?? 0));
  if (frac > 0) {
    out.push(`<path d="${arc(cx, cy, -135, -135 + frac * 270, r)}" fill="none" stroke="${GAUGE_CYAN}" stroke-width="${sw}" stroke-linecap="round"/>`);
  }

  // 5 tick marks at 0/25/50/75/100%
  for (let i = 0; i <= 4; i++) {
    const a = -135 + (i / 4) * 270;
    const [x1, y1] = polar(cx, cy, a, r * 0.9);
    const [x2, y2] = polar(cx, cy, a, r * 0.75);
    out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${GAUGE_TICK}" stroke-width="1"/>`);
  }

  // centre percent (cyan)
  out.push(txt(cx, cy + 28 * 0.34, opts.size ?? 28, m.state === "stale" ? th.stale : m.state === "bad" ? th.bad : GAUGE_CYAN, m.text + (m.side ?? ""), 700));
  return `<g>${out.join("")}</g>`;
}

// Numeric hero with a faint sparkline watermark + filled area pinned to bottom.
export function trendSvg(rect: Rect, m: ElementModel, series: number[], th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const out: string[] = [];
  if (series.length >= 2) {
    const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
    const bottom = y + h - 8;
    const pts = series.map((v, i) => {
      const px = x + 12 + (i / (series.length - 1)) * (w - 24);
      const py = y + h - 12 - ((v - lo) / span) * (h - 40);
      return [px, py] as const;
    });
    const poly = pts.map(([px, py]) => `${f(px)},${f(py)}`).join(" ");
    // filled area
    const area = `${f(pts[0][0])},${f(bottom)} ${poly} ${f(pts[pts.length - 1][0])},${f(bottom)}`;
    out.push(`<polygon points="${area}" fill="rgba(87,199,216,0.06)"/>`);
    out.push(`<polyline points="${poly}" fill="none" stroke="${GAUGE_CYAN}" stroke-opacity="0.22" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  // numeric hero overlaid (accent)
  out.push(txt(cx, cy + 38 * 0.34, opts.size ?? 38, valColor(m, th, th.accent), m.text + (m.side ?? ""), 700, "middle", ` letter-spacing="-0.02em"`));
  return `<g>${out.join("")}</g>`;
}

// Filled AP pill: AP_PILL_BG, 1px good border, label in good 20/700/UPPER.
export function autopilotSvg(rect: Rect, m: ElementModel, th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const out: string[] = [];
  const label = (m.text || "STBY").toUpperCase();
  const engaged = /AUTO|TRACK|WIND|ROUTE|NAV|ON/.test(label);
  const labelColor = engaged ? th.good : th.dim;
  const fs = opts.size ?? 20;
  const pw = Math.min(w - 24, Math.max(70, label.length * fs * 0.8)), ph = Math.max(28, h * 0.3);
  out.push(`<rect x="${f(cx - pw / 2)}" y="${f(cy - ph / 2)}" width="${f(pw)}" height="${f(ph)}" rx="4" fill="${AP_PILL_BG}" stroke="${th.good}" stroke-width="1"/>`);
  out.push(txt(cx, cy + Math.min(fs, ph * 0.6) * 0.34, Math.min(fs, ph * 0.6), labelColor, label, 700, "middle", ` letter-spacing="0.04em"`));
  return `<g>${out.join("")}</g>`;
}

// Filled bubble button: accent fill, ink text, radius 20, 16/700/UPPER.
export function buttonSvg(rect: Rect, label: string, th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const bw = w - 20, bh = h - 20;
  const fs = opts.size ?? 16;
  const out: string[] = [];
  out.push(`<rect x="${f(x + 10)}" y="${f(y + 10)}" width="${f(bw)}" height="${f(bh)}" rx="20" fill="${th.accent}"/>`);
  out.push(txt(cx, cy + fs * 0.34, fs, BTN_INK, label.toUpperCase(), 700, "middle", ` letter-spacing="0.04em"`));
  return `<g>${out.join("")}</g>`;
}

// re-export polar so render-svg can position decorations if needed
export { polar };
