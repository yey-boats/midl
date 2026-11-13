// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Tile chrome: panel background, 1px edge border, and the top-left chrome
// caption (title). Device tiles have NO accent rail. no-data -> dashed border;
// stale -> dimmed treatment. Round instruments (round:true) skip the caption —
// the dial owns its own centre caption.
import type { Rect } from "@yey-boats/midl";
import type { Theme } from "../theme";
import { FONT_FAMILY } from "../theme";
import { esc, f } from "./geometry";

export interface FrameOpts { noData: boolean; stale: boolean; round?: boolean; }

/** Chrome caption size. The firmware draws every tile caption in
 *  lv_font_montserrat_20 (build_tile, ui_layouts.cpp); small tiles scale down
 *  to a 12px floor so the caption never crowds the value (#37). */
export function captionFontSize(rect: Rect): number {
  return Math.max(12, Math.min(20, Math.min(rect.w, rect.h) * 0.11));
}

/** Vertical band the chrome caption occupies from the top of the tile. */
export function captionBand(rect: Rect): number {
  return Math.round(captionFontSize(rect) * 1.45);
}

export function frameSvg(rect: Rect, title: string, th: Theme, opts: FrameOpts): string {
  const { x, y, w, h } = rect;
  const x0 = x + 2, y0 = y + 2, ww = w - 4, hh = h - 4;
  const out: string[] = [];
  const op = opts.stale ? ` fill-opacity="0.6"` : "";

  out.push(`<rect x="${f(x0)}" y="${f(y0)}" width="${f(ww)}" height="${f(hh)}" rx="8" fill="${th.panel}"${op}/>`);
  out.push(`<rect x="${f(x0)}" y="${f(y0)}" width="${f(ww)}" height="${f(hh)}" rx="8" fill="none" stroke="${th.edge}" stroke-width="1"${opts.noData ? ` stroke-dasharray="4 4"` : ""}/>`);

  // top-left chrome caption (round instruments draw their own centre caption)
  if (title && !opts.round) {
    const fill = opts.stale ? th.stale : th.dim;
    const fs = captionFontSize(rect);
    out.push(`<text x="${f(x0 + 10)}" y="${f(y0 + 4 + fs * 0.9)}" font-family="${FONT_FAMILY}" font-size="${f(fs)}" font-weight="500" letter-spacing="0.04em" fill="${fill}">${esc(title.toUpperCase())}</text>`);
  }
  return out.join("");
}
