// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Marine dial shared by `compass` and `windrose`. THREE renderings, selected
// generically from the element rect size + opts.shape (Claude Design spec):
//   - MINIMAL TILE   min(w,h) < 300 && shape !== "band": small grid-tile dial,
//                    solid bezel ring + 4 static cardinals + centre hero.
//   - ROUND HUD      min(w,h) >= 300 && shape !== "band": full HUD face with
//                    white band, green rail, tick ring, 8 cardinals, sectors.
//   - BAND HUD       shape === "band": the semicircular rolling heading band.
// Signature stays generic; dispatch only on rect size + MIDL style fields.
import type { Rect } from "@yey-boats/midl";
import type { Theme } from "../theme";
import type { ElementModel } from "../model";
import {
  FONT_FAMILY, HUD_BAND, DIAL_TICK, DIAL_CARD_DIM, DIAL_INK,
  WIND_APPARENT, WIND_TRUE,
} from "../theme";
import { polar, arc, esc, f } from "./geometry";
import { glyphPath } from "./glyphs";
import { resolveColor } from "./color";

export interface DialOpts {
  title?: string;
  size?: number;        // hero value font size
  shape?: "round" | "band";
  hull?: boolean;
}

const FN = FONT_FAMILY;

function txt(x: number, y: number, s: number, fill: string, str: string, weight = 700, anchor = "middle", extra = ""): string {
  return `<text x="${f(x)}" y="${f(y)}" font-family="${FN}" font-weight="${weight}" font-size="${f(s)}" fill="${fill}" text-anchor="${anchor}"${extra}>${esc(str)}</text>`;
}

// Resolve a marker colour, mapping the wind tokens to their literal HUD hues so
// apparent/true wind markers match the spec (token 'warn' -> apparent orange,
// token 'accent' -> true cyan). Any other token/literal passes through.
function markerColor(token: string, th: Theme): string {
  if (token === "warn") return WIND_APPARENT;
  if (token === "accent") return WIND_TRUE;
  return resolveColor(token, th, th.accent);
}

function heroColor(m: ElementModel, th: Theme, base: string): string {
  if (m.state === "stale") return th.stale;
  if (m.state === "bad") return th.bad;
  return base;
}

export function dialSvg(rect: Rect, m: ElementModel, ringColor: string, th: Theme, opts: DialOpts = {}): string {
  if (opts.shape === "band") return bandSvg(rect, m, ringColor, th, opts);
  const D = Math.min(rect.w, rect.h);
  if (D < 300) return minimalSvg(rect, m, ringColor, th, opts);
  return roundHudSvg(rect, m, ringColor, th, opts);
}

// ── MINIMAL TILE ──────────────────────────────────────────────────────────
// A clean grid-tile dial: one solid bezel ring, faint inner wash, 4 STATIC
// cardinals (N white, E/S/W dim), small caption + centre hero. No white band,
// no tick ring, no red N.
function minimalSvg(rect: Rect, m: ElementModel, ringColor: string, th: Theme, opts: DialOpts): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const D = Math.min(w, h);
  const R = D * 0.42;
  const out: string[] = [];

  // faint inner wash + solid 2px bezel ring
  out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R - 2)}" fill="${ringColor}" fill-opacity="0.06"/>`);
  out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}" fill="none" stroke="${ringColor}" stroke-width="2"/>`);

  // 4 static cardinals around the ring (N white, others dim)
  const fCard = Math.max(9, D * 0.07);
  const rCard = R - fCard * 0.9;
  const cards: Array<[string, number]> = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];
  for (const [lab, b] of cards) {
    const [tx, ty] = polar(cx, cy, b, rCard);
    out.push(txt(tx, ty + fCard * 0.34, fCard, lab === "N" ? th.fg : th.dim, lab, 700));
  }

  // markers as glyphs on the rim
  for (const mk of m.markers ?? []) {
    if (mk.angleDeg == null) continue;
    const [mx, my] = polar(cx, cy, mk.angleDeg, R * 0.62);
    out.push(glyphPath(mk.glyph, mx, my, D * 0.07, markerColor(mk.color, th)));
  }

  // small caption above + centre hero
  const hero = opts.size ?? 38;
  if (opts.title) out.push(txt(cx, cy - hero * 0.5, 12, th.dim, opts.title.toUpperCase(), 500));
  out.push(txt(cx, cy + hero * 0.34, hero, heroColor(m, th, ringColor), m.text + (m.side ?? ""), 700, "middle", ` letter-spacing="-0.02em"`));

  return `<g>${out.join("")}</g>`;
}

// ── ROUND HUD ─────────────────────────────────────────────────────────────
// Full HUD face: white band, green rail, tick ring every 45deg, 8 cardinals
// (N red, others dark ink / inter-cardinals dim), close-hauled sectors, optional
// hull silhouette, wind markers, centre hero.
function roundHudSvg(rect: Rect, m: ElementModel, ringColor: string, th: Theme, opts: DialOpts): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const D = Math.min(w, h);
  const R = D * 0.45;
  const rBand = R - R * 0.10;        // white band centre
  const rFace = R - R * 0.22;        // inner face
  const out: string[] = [];

  // full-circle face
  out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rFace)}" fill="${th.panel}" stroke="${th.edge}"/>`);

  // hull silhouette
  if (opts.hull) {
    const s = rFace;
    const hull = `M ${f(cx - 0.18 * s)},${f(cy + 0.40 * s)} L ${f(cx - 0.18 * s)},${f(cy - 0.05 * s)} `
      + `L ${f(cx - 0.14 * s)},${f(cy - 0.27 * s)} L ${f(cx)},${f(cy - 0.58 * s)} `
      + `L ${f(cx + 0.14 * s)},${f(cy - 0.27 * s)} L ${f(cx + 0.18 * s)},${f(cy - 0.05 * s)} `
      + `L ${f(cx + 0.18 * s)},${f(cy + 0.40 * s)}`;
    out.push(`<path d="${hull}" fill="none" stroke="${th.fg}" stroke-opacity="0.3" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  // close-hauled sectors: explicit, else default ±30deg bow sectors for windrose
  const rSector = rBand;
  const sectors = m.sectors ?? (ringColor === th.warn
    ? [{ from: -30, to: 0, color: "port" }, { from: 0, to: 30, color: "starboard" }]
    : []);
  for (const s of sectors) {
    out.push(`<path d="${arc(cx, cy, s.from, s.to, rSector)}" fill="none" stroke="${resolveColor(s.color, th, th.accent)}" stroke-width="6" stroke-opacity="0.7"/>`);
  }

  // white band + green rail just outside
  out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rBand)}" fill="none" stroke="${HUD_BAND}" stroke-width="${f(R * 0.18)}"/>`);
  out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}" fill="none" stroke="${th.good}" stroke-width="${f(R * 0.04)}"/>`);

  // tick ring every 45deg
  const rTick = rBand + R * 0.09;
  for (let d = 0; d < 360; d += 45) {
    const [x1, y1] = polar(cx, cy, d, rTick);
    const [x2, y2] = polar(cx, cy, d, rTick - R * 0.05);
    out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${DIAL_TICK}" stroke-width="2"/>`);
  }

  // 8 cardinals: N red 20, other cardinals dark ink 20, inter-cardinals dim 14
  const rCard = rBand;
  const cards: Array<[string, number]> = [
    ["N", 0], ["NE", 45], ["E", 90], ["SE", 135],
    ["S", 180], ["SW", 225], ["W", 270], ["NW", 315],
  ];
  for (const [lab, b] of cards) {
    const [tx, ty] = polar(cx, cy, b, rCard);
    const inter = b % 90 !== 0;
    const fill = lab === "N" ? "#ff5252" : inter ? DIAL_CARD_DIM : DIAL_INK;
    const fs = inter ? 14 : 20;
    out.push(txt(tx, ty + fs * 0.34, fs, fill, lab, 700));
  }

  // wind markers
  for (const mk of m.markers ?? []) {
    if (mk.angleDeg == null) continue;
    const [mx, my] = polar(cx, cy, mk.angleDeg, rFace * 0.9);
    out.push(glyphPath(mk.glyph, mx, my, D * 0.05, markerColor(mk.color, th)));
  }

  // centre caption + hero (windrose: warn; compass: accent)
  const hero = opts.size ?? 38;
  const base = ringColor === th.warn ? th.warn : th.accent;
  if (opts.title) out.push(txt(cx, cy - hero * 0.5, 12, th.dim, opts.title.toUpperCase(), 500));
  out.push(txt(cx, cy + hero * 0.34, hero, heroColor(m, th, base), m.text + (m.side ?? ""), 700, "middle", ` letter-spacing="-0.02em"`));

  return `<g>${out.join("")}</g>`;
}

// ── BAND HUD ──────────────────────────────────────────────────────────────
// Semicircular rolling heading band (device-hud.js autopilotHud). Scaled to the
// rect: white band across ±90deg, green rail outside, tick ring every 15deg,
// numerals, red lubber triangle, amber bug for a target marker, HDG hero below.
function bandSvg(rect: Rect, m: ElementModel, _ringColor: string, th: Theme, opts: DialOpts): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const D = Math.min(w, h);
  const cy = y + h * 0.62;          // band centre
  const R = D * 0.46;
  const RB = R - D * 0.05;          // white band centre
  // scale band/tick widths from the device 480 baseline.
  const k = D / 480;
  const out: string[] = [];
  const hdg = m.angleDeg ?? 0;

  // green rail just outside + white band
  out.push(`<path d="${arc(cx, cy, -90, 90, R)}" fill="none" stroke="${th.good}" stroke-width="${f(10 * k)}"/>`);
  out.push(`<path d="${arc(cx, cy, -90, 90, RB)}" fill="none" stroke="${HUD_BAND}" stroke-width="${f(44 * k)}"/>`);

  // sectors on the band (no-go / layline), heading-relative
  for (const s of m.sectors ?? []) {
    const a = ((s.from - hdg + 540) % 360) - 180;
    const b = ((s.to - hdg + 540) % 360) - 180;
    if (a < -90 && b < -90) continue;
    if (a > 90 && b > 90) continue;
    out.push(`<path d="${arc(cx, cy, Math.max(-90, a), Math.min(90, b), RB)}" fill="none" stroke="${resolveColor(s.color, th, th.bad)}" stroke-width="${f(40 * k)}" stroke-opacity="0.32"/>`);
  }

  // ticks every 15deg: major every 30 (len 12, w 3), minor (len 7, w 2)
  for (let rel = -90; rel <= 90; rel += 15) {
    const abs = ((Math.round(rel + hdg) % 360) + 360) % 360;
    const major = abs % 30 === 0;
    const [x1, y1] = polar(cx, cy, rel, RB + 22 * k);
    const [x2, y2] = polar(cx, cy, rel, RB + 22 * k - (major ? 12 : 7) * k);
    out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${DIAL_INK}" stroke-width="${major ? 3 : 2}"/>`);
  }

  // numerals along the band (cardinals red-N 20 / others ink 16)
  for (const dd of [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]) {
    const rel = ((dd - hdg + 540) % 360) - 180;
    if (rel < -90 || rel > 90) continue;
    const [tx, ty] = polar(cx, cy, rel, RB - 26 * k);
    const card = dd % 90 === 0;
    const label = dd === 0 ? "N" : dd === 90 ? "E" : dd === 180 ? "S" : dd === 270 ? "W" : String(dd);
    const fs = card ? 20 * k : 16 * k;
    out.push(txt(tx, ty + fs * 0.34, fs, dd === 0 ? "#ff5252" : DIAL_INK, label, 700));
  }

  // amber bug for a target / wind marker (first warn-coloured or any marker)
  const markers = m.markers ?? [];
  const bug = markers.find((mk) => mk.angleDeg != null && (mk.color === "warn"))
    ?? markers.find((mk) => mk.angleDeg != null);
  if (bug && bug.angleDeg != null) {
    const rel = ((bug.angleDeg - hdg + 540) % 360) - 180;
    if (rel >= -90 && rel <= 90) {
      const [bx, by] = polar(cx, cy, rel, RB);
      out.push(glyphPath("triangle", bx, by, 18 * k, "#ffb84d"));
    }
  }

  // red lubber triangle at top centre
  const ly = cy - R - 2 * k;
  out.push(`<path d="M ${f(cx - 10 * k)},${f(ly)} L ${f(cx + 10 * k)},${f(ly)} L ${f(cx)},${f(ly + 16 * k)} Z" fill="#ff5252"/>`);

  // HDG hero below band centre
  const hero = opts.size ?? 64;
  if (opts.title) out.push(txt(cx, cy - 6 * k, 12, th.dim, opts.title.toUpperCase(), 500));
  out.push(txt(cx, cy + hero * 0.7, hero, heroColor(m, th, th.fg), m.text + (m.side ?? ""), 700, "middle", ` letter-spacing="-0.02em"`));

  return `<g>${out.join("")}</g>`;
}
