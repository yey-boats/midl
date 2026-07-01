// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// The 10 MIDL dial glyphs as SVG snippet builders. Each glyph is centred on
// (cx, cy) and fits within a box of side `size`, drawn in `color`. Unknown
// glyphs fall back to a small filled circle. Mirrors device-hud.js marker shapes.
import { f } from "./geometry";

type Builder = (cx: number, cy: number, s: number, color: string) => string;

// triangle: points UP (toward the rim centre), like the wind-index markers.
const triangle: Builder = (cx, cy, s, c) => {
  const h = s / 2;
  return `<path d="M ${f(cx - h)} ${f(cy + h)} L ${f(cx + h)} ${f(cy + h)} L ${f(cx)} ${f(cy - h)} Z" fill="${c}"/>`;
};

const diamond: Builder = (cx, cy, s, c) => {
  const h = s / 2;
  return `<path d="M ${f(cx)} ${f(cy - h)} L ${f(cx + h)} ${f(cy)} L ${f(cx)} ${f(cy + h)} L ${f(cx - h)} ${f(cy)} Z" fill="${c}"/>`;
};

const circle: Builder = (cx, cy, s, c) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(s / 2)}" fill="${c}"/>`;

const bar: Builder = (cx, cy, s, c) => {
  const w = s * 0.34, h = s;
  return `<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(w / 2)}" fill="${c}"/>`;
};

const cross: Builder = (cx, cy, s, c) => {
  const h = s / 2, w = Math.max(1.5, s * 0.16);
  return `<line x1="${f(cx - h)}" y1="${f(cy - h)}" x2="${f(cx + h)}" y2="${f(cy + h)}" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round"/>`
    + `<line x1="${f(cx - h)}" y1="${f(cy + h)}" x2="${f(cx + h)}" y2="${f(cy - h)}" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round"/>`;
};

// chevron, parameterised by direction unit vector (dx, dy) pointing the apex.
function chevron(cx: number, cy: number, s: number, c: string, dx: number, dy: number): string {
  const h = s / 2, w = Math.max(1.5, s * 0.18);
  // perpendicular to the apex direction
  const px = -dy, py = dx;
  const ax = cx + dx * h, ay = cy + dy * h;       // apex
  const bx = cx - dx * h + px * h, by = cy - dy * h + py * h;
  const ex = cx - dx * h - px * h, ey = cy - dy * h - py * h;
  return `<path d="M ${f(bx)} ${f(by)} L ${f(ax)} ${f(ay)} L ${f(ex)} ${f(ey)}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const chevron_in: Builder = (cx, cy, s, c) => chevron(cx, cy, s, c, 0, 1);   // apex toward centre (down)
const chevron_out: Builder = (cx, cy, s, c) => chevron(cx, cy, s, c, 0, -1); // apex outward (up)
const chevron_left: Builder = (cx, cy, s, c) => chevron(cx, cy, s, c, -1, 0);
const chevron_right: Builder = (cx, cy, s, c) => chevron(cx, cy, s, c, 1, 0);

const chevron_double: Builder = (cx, cy, s, c) => {
  const off = s * 0.28;
  return chevron(cx, cy - off, s * 0.8, c, 0, -1) + chevron(cx, cy + off * 0.2, s * 0.8, c, 0, -1);
};

const BUILDERS: Record<string, Builder> = {
  triangle, diamond, circle, bar, cross,
  chevron_in, chevron_out, chevron_left, chevron_right, chevron_double,
};

export function glyphPath(glyph: string, cx: number, cy: number, size: number, color: string): string {
  const b = BUILDERS[glyph];
  if (b) return b(cx, cy, size, color);
  // Unknown glyph -> small filled circle.
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(size * 0.3)}" fill="${color}"/>`;
}

export const GLYPH_NAMES = Object.keys(BUILDERS);
