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
    out.push(`<text x="${f(x0 + 10)}" y="${f(y0 + 16)}" font-family="${FONT_FAMILY}" font-size="12" font-weight="500" letter-spacing="0.04em" fill="${fill}">${esc(title.toUpperCase())}</text>`);
  }
  return out.join("");
}
