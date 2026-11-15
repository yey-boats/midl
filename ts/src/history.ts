// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// Trend history (docs/specs/2026-11-15-trend-history.md). A `trend` element's
// optional `history: { window, agg }` selects the chart's time span and how the
// samples inside one time bucket are combined. Shared by the validators, the
// web renderer and the editor so they all read a document the same way.

import type { Element, HistoryAgg } from "./types";

export const HISTORY_AGGS: readonly HistoryAgg[] = ["avg", "min", "max", "last"];
// Shortest window any validator admits; the longest is the device manifest's
// history.maxWindowS (HISTORY_DEFAULT_MAX_WINDOW_S when the manifest is silent).
export const HISTORY_MIN_WINDOW_S = 60;
export const HISTORY_DEFAULT_MAX_WINDOW_S = 86400;
export const HISTORY_DEFAULT_WINDOW_S = 600;
export const HISTORY_DEFAULT_POINTS = 120;
export const HISTORY_DEFAULT_AGG: HistoryAgg = "avg";
// Windows offered by the editor when the manifest does not list any.
export const HISTORY_DEFAULT_WINDOWS: readonly string[] = ["10m", "30m", "1h", "6h", "24h"];

const WINDOW_RE = /^(\d+)([smh])$/;
const UNIT_S: Record<string, number> = { s: 1, m: 60, h: 3600 };

/** Parse a history window ("10m", "1h", "90s" or a number of seconds) to
 *  seconds. Returns undefined for anything that is not a duration. */
export function parseWindowS(w: unknown): number | undefined {
  if (typeof w === "number") return Number.isFinite(w) && w > 0 ? w : undefined;
  if (typeof w !== "string") return undefined;
  const m = WINDOW_RE.exec(w);
  if (!m) return undefined;
  const n = Number(m[1]) * UNIT_S[m[2]];
  return n > 0 ? n : undefined;
}

/** Format seconds as the shortest exact duration string ("10m", "1h", "90s"). */
export function formatWindow(s: number): string {
  if (s % 3600 === 0) return `${s / 3600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

export interface ResolvedHistory { windowS: number; agg: HistoryAgg; }

/** The effective history of a trend element, defaults applied
 *  (absent / unparseable -> 10 minutes, avg). */
export function resolveHistory(el: Pick<Element, "history"> | undefined): ResolvedHistory {
  const h = el?.history;
  const windowS = parseWindowS(h?.window) ?? HISTORY_DEFAULT_WINDOW_S;
  const agg = h?.agg && HISTORY_AGGS.includes(h.agg) ? h.agg : HISTORY_DEFAULT_AGG;
  return { windowS, agg };
}
