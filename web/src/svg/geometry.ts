// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Pure SVG geometry helpers, lifted from device-hud.js. All angles are degrees
// with -90 = up (12 o'clock), increasing clockwise — the marine convention used
// throughout the dial drawing.

/** Point on a circle: `deg` measured with 0 = up, clockwise positive. */
export function polar(cx: number, cy: number, deg: number, r: number): [number, number] {
  const t = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
}

/** SVG arc path command from t0 to t1 (degrees) at radius r, sweeping clockwise. */
export function arc(cx: number, cy: number, t0: number, t1: number, r: number): string {
  const [x0, y0] = polar(cx, cy, t0, r);
  const [x1, y1] = polar(cx, cy, t1, r);
  const large = Math.abs(t1 - t0) > 180 ? 1 : 0;
  return `M ${f(x0)} ${f(y0)} A ${f(r)} ${f(r)} 0 ${large} 1 ${f(x1)} ${f(y1)}`;
}

/** XML-escape text destined for an SVG <text> node or attribute value. */
export function esc(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Trim float noise from coordinates for compact, stable SVG output. */
export function f(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "0";
}
