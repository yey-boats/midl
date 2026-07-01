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
import { FONT_FAMILY } from "../theme";
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

export interface TileOpts { title?: string; size?: number | string; center?: number; unit?: string; colorRole?: string; }

/**
 * Resolve a style.colorRole token to a theme accent colour.
 * "warn" → th.warn (amber), "good" → th.good (green), everything else (including
 * "default"/"accent"/undefined) → th.accent (the standard numeric value colour).
 */
export function resolveColorRole(colorRole: string | undefined, th: Theme): string {
  if (colorRole === "warn") return th.warn;
  if (colorRole === "good") return th.good;
  return th.accent; // "default", "accent", or undefined all map to the standard accent
}

// Size roles: fractions of auto-fit hero font size.
export const SIZE_ROLES: Record<string, number> = {
  S: 0.45,
  M: 0.60,
  L: 0.78,
  XL: 0.92,
  Fill: 1.0,
};

/**
 * Compute the hero font size for a numeric value displayed in a cell.
 *
 * Auto-fit: the base font size is derived from the cell height (Fill fraction),
 * then shrunk so the value string does not exceed the cell width (using an
 * approximation of 0.55 * fontSize per character for the condensed bold font).
 *
 * The `size` option is applied as a role multiplier (S/M/L/XL/Fill) or, for
 * legacy backward-compat, treated as an absolute px value when it is a number.
 *
 * Fill uses 0.90× of cell height so the number visually fills the cell.
 * S/M/L/XL are fractional multiples of Fill (see SIZE_ROLES).
 */
export function heroFontSize(rect: { w: number; h: number }, value: string, size?: number | string): number {
  // Legacy: if size is a number, return it as-is (absolute px, backward-compat).
  if (typeof size === "number") return size;

  // Auto-fit: start from 90% of cell height (the un-scaled Fill ceiling).
  // A small label/unit reserve is baked into this fraction; designers can rely
  // on values never touching the very top/bottom edges.
  const maxByHeight = rect.h * 0.90;
  // Approximate max width: characters are ~0.55 * fontSize wide (bold condensed).
  const charCount = Math.max(1, value.replace(/\s/g, "").length);
  const maxByWidth = (rect.w * 0.88) / (charCount * 0.55);
  const autoFit = Math.min(maxByHeight, maxByWidth);

  // Apply role multiplier.
  const role = typeof size === "string" ? size : "L";
  const fraction = SIZE_ROLES[role] ?? SIZE_ROLES["L"]!;
  return Math.max(12, autoFit * fraction);
}

/** Maximum font-size for the "--" no-data placeholder. Keeps it visually small
 *  and bounded regardless of the element's size role. */
const NO_DATA_MAX_FS = 40;

// HERO numeric is ACCENT (per spec), unless a zone colour applies or state
// overrides (stale/bad). The unit (if any) sits at 20/dim to the right.
export function singleValueSvg(rect: Rect, m: ElementModel, th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const unit = opts.unit;
  // formatValue already appends the unit to m.text (e.g. "6.0 kn"); strip it so
  // the dim unit drawn separately below isn't duplicated ("6.0 kn kn").
  let body = m.text;
  if (unit && body.endsWith(unit)) body = body.slice(0, -unit.length).trimEnd();
  const valueFull = body + (m.side ?? "");

  // C1: check if the text is multi-line (e.g. position lat/lon) or non-numeric
  // (e.g. a string state). Non-numeric values get no unit suffix.
  const isMultiLine = valueFull.includes("\n");
  const isNonNumeric = m.numeric == null;
  const suppressUnit = isNonNumeric || isMultiLine;

  // RC8: when the value is the no-data placeholder, cap its font-size to a small
  // bounded size regardless of the element's size role (avoids ~224px "--").
  const isNoData = valueFull === "--";
  // For multi-line, compute hero based on longest line
  const longestLine = isMultiLine
    ? valueFull.split("\n").reduce((a, b) => a.length > b.length ? a : b, "")
    : valueFull;
  const heroRaw = heroFontSize({ w, h: isMultiLine ? h / valueFull.split("\n").length : h }, longestLine, opts.size);
  const hero = isNoData ? Math.min(heroRaw, h * 0.3, NO_DATA_MAX_FS) : heroRaw;

  // Zone colour takes highest precedence; then style.color/colorRole; then accent default.
  // resolveColor handles both #hex literals and token names (accent/warn/good/etc.)
  const accentBase = resolveColor(opts.colorRole, th, th.accent);
  const base = m.zoneColor ? resolveColor(m.zoneColor, th, accentBase) : accentBase;
  const color = valColor(m, th, base);
  const out: string[] = [];

  if (isMultiLine) {
    // C1: render each line as a stacked <tspan>; vertical spacing is ~1.2× hero.
    const lines = valueFull.split("\n");
    const lineSpacing = hero * 1.2;
    const totalH = (lines.length - 1) * lineSpacing;
    const startY = cy - totalH / 2;
    const tspans = lines.map((ln, i) =>
      `<tspan x="${f(cx)}" dy="${i === 0 ? f(startY - cy + hero * 0.34) : f(lineSpacing)}">${esc(ln)}</tspan>`,
    ).join("");
    out.push(`<text x="${f(cx)}" y="${f(cy)}" font-family="${FN}" font-weight="700" font-size="${f(hero)}" fill="${color}" text-anchor="middle" letter-spacing="-0.02em">${tspans}</text>`);
  } else {
    out.push(txt(cx, cy + hero * 0.34, hero, color, valueFull, 700, "middle", ` letter-spacing="-0.02em"`));
    if (unit && !isNoData && !suppressUnit) {
      // F: position unit relative to the value's right edge (approx 0.55em/char * hero).
      // Clamp so unit right edge stays within cell (cell_right - pad).
      const pad = 4;
      const cellRight = x + w - pad;
      // Estimated width of the value text at hero font size (bold condensed ≈ 0.55em/char)
      const valueWidth = longestLine.replace(/\s/g, "").length * 0.55 * hero;
      const valueRight = cx + valueWidth / 2;
      // Unit font: default 20px; shrink if it would bleed past cellRight.
      let unitFs = 20;
      const gap = 4;
      // If unit right edge (valueRight + gap + unitWidth) > cellRight, shrink unit font.
      const unitWidth = unit.length * 0.6 * unitFs;
      if (valueRight + gap + unitWidth > cellRight) {
        const available = Math.max(8, cellRight - valueRight - gap);
        unitFs = Math.max(8, Math.min(20, available / (unit.length * 0.6)));
      }
      const unitX = Math.min(valueRight + gap, cellRight - unit.length * 0.6 * unitFs);
      out.push(txt(unitX, cy + hero * 0.34, unitFs, th.dim, unit, 400, "start"));
    }
  }
  return `<g>${out.join("")}</g>`;
}

export function textSvg(rect: Rect, m: ElementModel, th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const lines = m.text.split("\n");
  const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, "");
  // For multi-line text, divide available height equally across lines.
  const lineH = h / Math.max(1, lines.length);
  const size = heroFontSize({ w, h: lineH }, longestLine, opts.size ?? "M");
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

  // hero percent above the track (accent, optionally overridden by style.color/colorRole)
  const hero = heroFontSize({ w, h }, m.text + (m.side ?? ""), opts.size);
  out.push(txt(cx, by - 14, hero, valColor(m, th, resolveColor(opts.colorRole, th, th.accent)), m.text + (m.side ?? ""), 700, "middle", ` letter-spacing="-0.02em"`));

  // track
  out.push(`<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" rx="3" fill="${th.widgets.barTrack}" stroke="${th.edge}" stroke-width="1"/>`);

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
  out.push(`<path d="${arc(cx, cy, -135, 135, r)}" fill="none" stroke="${th.widgets.gaugeTrack}" stroke-width="${sw}" stroke-linecap="round"/>`);

  // fill — use zone colour when available so the arc reflects threshold state
  const frac = Math.max(0, Math.min(1, m.fraction ?? 0));
  const arcColor = m.zoneColor ? resolveColor(m.zoneColor, th, th.widgets.gaugeFill) : th.widgets.gaugeFill;
  if (frac > 0) {
    out.push(`<path d="${arc(cx, cy, -135, -135 + frac * 270, r)}" fill="none" stroke="${arcColor}" stroke-width="${sw}" stroke-linecap="round"/>`);
  }

  // 5 tick marks at 0/25/50/75/100%
  for (let i = 0; i <= 4; i++) {
    const a = -135 + (i / 4) * 270;
    const [x1, y1] = polar(cx, cy, a, r * 0.9);
    const [x2, y2] = polar(cx, cy, a, r * 0.75);
    out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${th.widgets.gaugeTick}" stroke-width="1"/>`);
  }

  // centre percent — colour follows zone (same as arc) so text and arc agree.
  // Honour string size roles (S/M/L/XL/Fill) like other tile types.
  const gaugeFs = typeof opts.size === "number"
    ? opts.size
    : heroFontSize({ w: r * 2, h: r * 2 }, m.text + (m.side ?? ""), opts.size);
  const centreColor = m.state === "stale" ? th.stale : m.state === "bad" ? th.bad : arcColor;
  out.push(txt(cx, cy + gaugeFs * 0.34, gaugeFs, centreColor, m.text + (m.side ?? ""), 700));
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
    out.push(`<polyline points="${poly}" fill="none" stroke="${th.widgets.gaugeFill}" stroke-opacity="0.22" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  // numeric hero overlaid (accent, optionally overridden by colorRole)
  const trendValue = m.text + (m.side ?? "");
  const isNoDataTrend = trendValue === "--";
  const trendHeroRaw = heroFontSize({ w, h }, trendValue, opts.size);
  const trendHero = isNoDataTrend ? Math.min(trendHeroRaw, h * 0.3, NO_DATA_MAX_FS) : trendHeroRaw;
  out.push(txt(cx, cy + trendHero * 0.34, trendHero, valColor(m, th, resolveColor(opts.colorRole, th, th.accent)), trendValue, 700, "middle", ` letter-spacing="-0.02em"`));
  return `<g>${out.join("")}</g>`;
}

// Autopilot pill: engaged = filled green pill; standby/idle = hollow dim outline pill.
// E2: the two states are visually distinct — standby must not look active.
export function autopilotSvg(rect: Rect, m: ElementModel, th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const out: string[] = [];
  // E1: when no data (no-data state or bare "--" placeholder), treat as standby/idle.
  const rawLabel = m.state === "no-data" || m.text === "--" ? "STBY" : m.text;
  const label = (rawLabel || "STBY").toUpperCase();
  const engaged = /AUTO|TRACK|WIND|ROUTE|NAV|ON/.test(label);
  // style.color overrides the default engaged color (th.good) for both border and label.
  const engagedColor = resolveColor(opts.colorRole, th, th.good);
  // E2: engaged → filled AP_PILL_BG + bright engagedColor border + bright label.
  //     standby  → transparent fill (panel) + dim border + dim label text.
  const pillFill = engaged ? th.widgets.apPillBg : "none";
  const pillStroke = engaged ? engagedColor : th.dim;
  const labelColor = engaged ? engagedColor : th.dim;
  // For string size roles, derive font size from cell geometry; clamp to pill height.
  const ph = Math.max(28, h * 0.3);
  const fsBase = typeof opts.size === "number"
    ? opts.size
    : heroFontSize({ w: w - 24, h: ph }, label, opts.size ?? "M");
  const fs = Math.min(fsBase, ph * 0.6);
  // Size the pill so the label fits: estimate character width at 0.65em each
  // (Montserrat 700 uppercase + 0.04em letter-spacing ≈ 0.69em but 0.65 is safe).
  const textW = label.length * fs * 0.65 + fs * 0.5; // +½em padding per side
  const pw = Math.min(w - 24, Math.max(70, textW));
  out.push(`<rect x="${f(cx - pw / 2)}" y="${f(cy - ph / 2)}" width="${f(pw)}" height="${f(ph)}" rx="4" fill="${pillFill}" stroke="${pillStroke}" stroke-width="1"/>`);
  out.push(txt(cx, cy + fs * 0.34, fs, labelColor, label, 700, "middle", ` letter-spacing="0.04em"`));
  return `<g>${out.join("")}</g>`;
}

// Filled bubble button: accent fill (or style.color override), ink text, radius 20. Label shrinks to fit.
export function buttonSvg(rect: Rect, label: string, th: Theme, opts: TileOpts = {}): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const bw = w - 20, bh = h - 20;
  // Shrink font to fit button width: chars are ~0.55em wide (bold condensed font).
  const fsMax = typeof opts.size === "number" ? opts.size : 16;
  const maxFsByWidth = label.length > 0 ? (bw * 0.88) / (label.length * 0.55) : fsMax;
  const fs = Math.min(fsMax, maxFsByWidth, bh * 0.5);
  // style.color (token or #hex) overrides the default accent fill.
  const fillColor = resolveColor(opts.colorRole, th, th.accent);
  const out: string[] = [];
  out.push(`<rect x="${f(x + 10)}" y="${f(y + 10)}" width="${f(bw)}" height="${f(bh)}" rx="20" fill="${fillColor}"/>`);
  out.push(txt(cx, cy + fs * 0.34, fs, th.widgets.btnInk, label.toUpperCase(), 700, "middle", ` letter-spacing="0.04em"`));
  return `<g>${out.join("")}</g>`;
}

// re-export polar so render-svg can position decorations if needed
export { polar };
