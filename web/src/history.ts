// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Time-windowed trend history (docs/specs/2026-11-15-trend-history.md §3/§4),
// the web twin of the firmware's per-screen series:
//   - a series is keyed by binding + agg + window (two tiles with the same key
//     share one series);
//   - the chart spans exactly `window`; its `points` buckets are fixed time
//     slots aligned to floor(t / step), step = window / points, right edge = now;
//   - every sample lands in the bucket of its time (running avg/min/max/last);
//     a bucket without samples is a gap; the chart moves one bucket per step
//     even when the value is steady;
//   - values are stored raw (SI, as received) and converted at draw time;
//   - an optional DataProvider.history() backfills each series once per store.
import type { Element, HistoryAgg, HistoryCap, Source } from "@yey-boats/midl";
import { HISTORY_DEFAULT_POINTS, resolveHistory } from "@yey-boats/midl";
import type { DataProvider, HistoryRequest } from "./data";
import type { ElementModel } from "./model";
import { convert } from "./format";

interface Bucket { n: number; sum: number; min: number; max: number; last: number; }

export interface SeriesConfig { windowS: number; agg: HistoryAgg; points: number; }

/** One time-bucketed series. Times are epoch milliseconds. */
export class HistorySeries {
  readonly stepMs: number;
  private buckets = new Map<number, Bucket>();
  constructor(readonly cfg: SeriesConfig) {
    this.stepMs = (cfg.windowS * 1000) / cfg.points;
  }
  private index(t: number): number { return Math.floor(t / this.stepMs); }
  private prune(newest: number): void {
    const oldest = newest - this.cfg.points + 1;
    for (const k of this.buckets.keys()) if (k < oldest) this.buckets.delete(k);
  }
  /** Fold a live sample into the bucket of time `t`. */
  add(t: number, v: number): void {
    if (!Number.isFinite(v) || !Number.isFinite(t)) return;
    const i = this.index(t);
    const b = this.buckets.get(i);
    if (b) { b.n++; b.sum += v; b.min = Math.min(b.min, v); b.max = Math.max(b.max, v); b.last = v; }
    else this.buckets.set(i, { n: 1, sum: v, min: v, max: v, last: v });
    this.prune(i);
  }
  /** Backfill one already-aggregated row; live samples win over backfill. */
  fill(t: number, v: number, now: number): void {
    if (!Number.isFinite(v) || !Number.isFinite(t)) return;
    const i = this.index(t), newest = this.index(now);
    if (i > newest || i < newest - this.cfg.points + 1 || this.buckets.has(i)) return;
    this.buckets.set(i, { n: 1, sum: v, min: v, max: v, last: v });
  }
  /** `points` raw values, oldest first, the last bucket containing `now`;
   *  null marks a gap. */
  values(now: number): Array<number | null> {
    const newest = this.index(now);
    this.prune(newest);
    const out: Array<number | null> = [];
    for (let i = newest - this.cfg.points + 1; i <= newest; i++) {
      const b = this.buckets.get(i);
      if (!b) { out.push(null); continue; }
      switch (this.cfg.agg) {
        case "min": out.push(b.min); break;
        case "max": out.push(b.max); break;
        case "last": out.push(b.last); break;
        default: out.push(b.sum / b.n);
      }
    }
    return out;
  }
}

export interface HistoryStoreOptions {
  /** Clock in epoch ms (tests inject one). Default Date.now. */
  now?: () => number;
  /** Buckets per chart. Default: the manifest's history.points, else 120. */
  points?: number;
  /** Most recorded trend series per screen. Default: the manifest's
   *  history.maxSeries, else unlimited. */
  maxSeries?: number;
  /** Called after a backfill landed, so the host can repaint. */
  onUpdate?: () => void;
}

/** Stable series key: binding + agg + window (spec §4). */
export function historyKey(binding: Source, agg: HistoryAgg, windowS: number): string {
  let src: string;
  switch (binding.kind) {
    case "signalk": src = `signalk:${binding.path}`; break;
    case "local": src = `local:${binding.id}`; break;
    case "const": src = `const:${JSON.stringify(binding.value)}`; break;
    default: src = `${binding.kind}:${(binding as { expr?: string }).expr ?? ""}`;
  }
  return `${src}|${agg}|${windowS}`;
}

/**
 * Time-bucket history for trend tiles. Hosts that keep a chart across
 * re-renders (builder preview, Display Manager, /instruments) keep ONE store
 * instance and pass it as the `trends` option on every paint.
 */
export class HistoryStore {
  onUpdate?: () => void;
  private clock: () => number;
  private explicitPoints?: number;
  private explicitMaxSeries?: number;
  private capPoints?: number;
  private capMaxSeries?: number;
  private map = new Map<string, HistorySeries>();
  private backfilled = new Set<string>();
  // Legacy count-based buffers (TrendBuffers.push/series before 2026-11-15).
  private legacy = new Map<string, number[]>();

  constructor(opts: HistoryStoreOptions = {}) {
    this.clock = opts.now ?? (() => Date.now());
    this.explicitPoints = opts.points;
    this.explicitMaxSeries = opts.maxSeries;
    this.onUpdate = opts.onUpdate;
  }

  now(): number { return this.clock(); }
  get points(): number { return this.explicitPoints ?? this.capPoints ?? HISTORY_DEFAULT_POINTS; }
  get maxSeries(): number { return this.explicitMaxSeries ?? this.capMaxSeries ?? Infinity; }

  /** Adopt a device manifest's history capability (explicit options win). */
  configure(cap: HistoryCap | undefined): void {
    this.capPoints = cap?.points && cap.points > 0 ? cap.points : undefined;
    this.capMaxSeries = typeof cap?.maxSeries === "number" ? cap.maxSeries : undefined;
  }

  /** The series for `key`, created (or reset when its config changed). */
  seriesFor(key: string, cfg: SeriesConfig): HistorySeries {
    let s = this.map.get(key);
    if (!s || s.cfg.windowS !== cfg.windowS || s.cfg.agg !== cfg.agg || s.cfg.points !== cfg.points) {
      s = new HistorySeries(cfg);
      this.map.set(key, s);
      this.backfilled.delete(key);
    }
    return s;
  }

  has(key: string): boolean { return this.map.has(key); }

  record(key: string, cfg: SeriesConfig, v: number, t = this.now()): void {
    this.seriesFor(key, cfg).add(t, v);
  }

  values(key: string, now = this.now()): Array<number | null> {
    return this.map.get(key)?.values(now) ?? [];
  }

  /** Ask the provider for a series' past once per key (per store). */
  backfill(key: string, cfg: SeriesConfig, binding: Source, provider: DataProvider): void {
    if (this.backfilled.has(key) || typeof provider.history !== "function" || binding.kind !== "signalk") return;
    this.backfilled.add(key);
    const series = this.seriesFor(key, cfg);
    const req: HistoryRequest = { window_s: cfg.windowS, step_s: cfg.windowS / cfg.points, agg: cfg.agg };
    let p: Promise<Array<[number, number]>>;
    try { p = provider.history(binding.path, req); }
    catch { return; }
    Promise.resolve(p).then((rows) => {
      if (this.map.get(key) !== series || !Array.isArray(rows)) return; // reset meanwhile
      const now = this.now();
      for (const r of rows) if (Array.isArray(r)) series.fill(Number(r[0]), Number(r[1]), now);
      this.onUpdate?.();
    }, () => { /* no history provider data: start empty */ });
  }

  /** Drop every series (e.g. the host switched dashboards). */
  clear(): void { this.map.clear(); this.backfilled.clear(); this.legacy.clear(); }

  /** @deprecated count-based buffer kept for callers of the old TrendBuffers API. */
  push(id: string, n: number): void {
    const a = this.legacy.get(id) ?? [];
    a.push(n);
    if (a.length > HISTORY_DEFAULT_POINTS) a.shift();
    this.legacy.set(id, a);
  }
  /** @deprecated see push(). */
  series(id: string): number[] { return this.legacy.get(id) ?? []; }
}

/** Backwards-compatible name: `new TrendBuffers()` is a HistoryStore. */
export class TrendBuffers extends HistoryStore {}

/** What a backend needs to draw a trend chart. Values are display units. */
export interface TrendChart {
  values: Array<number | null>;
  lo: number;
  hi: number;
  loLabel: string;
  hiLabel: string;
}

function decimalsOf(format: Record<string, unknown> | undefined): number | undefined {
  const d = format?.decimals ?? format?.precision;
  return typeof d === "number" && d >= 0 ? d : undefined;
}

function label(n: number, decimals: number | undefined): string {
  if (decimals != null) return n.toFixed(decimals);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fixedRange(el: Element): [number, number] | undefined {
  const r = el.style?.range;
  if (Array.isArray(r) && r.length === 2 && typeof r[0] === "number" && typeof r[1] === "number" && r[1] > r[0])
    return [r[0], r[1]];
  return undefined;
}

/** Y range + labels for display-unit values: `range` when given, else auto
 *  (min/max padded 10 %; a flat line gets ±1 display unit). Null before any
 *  data (empty chart, no labels). */
export function buildChart(values: Array<number | null>, range?: [number, number], decimals?: number): TrendChart | null {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (present.length === 0) return null;
  if (!range) {
    const mn = Math.min(...present), mx = Math.max(...present);
    const pad = (mx - mn) * 0.1;
    range = mx > mn ? [mn - pad, mx + pad] : [mn - 1, mx + 1];
  }
  return { values, lo: range[0], hi: range[1], loLabel: label(range[0], decimals), hiLabel: label(range[1], decimals) };
}

/** buildChart with the element's style.range and format decimals. */
export function chartFor(values: Array<number | null>, el: Element): TrendChart | null {
  return buildChart(values, fixedRange(el), decimalsOf(el.format));
}

/**
 * Per-paint trend bookkeeping shared by the Canvas and SVG backends: record
 * the current sample, kick off a one-time backfill, and build the chart in
 * display units. Returns undefined when there is no store or the tile is past
 * the screen's maxSeries (number only), null while the series is empty.
 */
export function trendChartFor(
  el: Element,
  m: ElementModel,
  store: HistoryStore | undefined,
  provider: DataProvider,
  allowed = true,
): TrendChart | null | undefined {
  const binding = el.bindings?.value;
  if (!store || !binding || !allowed) return undefined;
  const h = resolveHistory(el);
  const cfg: SeriesConfig = { windowS: h.windowS, agg: h.agg, points: store.points };
  const key = historyKey(binding, h.agg, h.windowS);
  store.seriesFor(key, cfg);
  store.backfill(key, cfg, binding, provider);
  const now = store.now();
  if (m.state === "ok" && m.raw != null) store.record(key, cfg, m.raw, now);
  const unit = el.format?.unit as string | undefined;
  const values = store.values(key, now).map((v) => (v == null ? null : convert(v, m.sourceUnit, unit)));
  return chartFor(values, el);
}

/** Series keys of the trend tiles on one screen, in paint order; tiles past
 *  `maxSeries` distinct keys are not recorded. */
export function allowedTrendKeys(ids: string[], elements: Record<string, Element>, maxSeries: number): Set<string> {
  const keys = new Set<string>();
  for (const id of ids) {
    const el = elements[id];
    const b = el?.type === "trend" ? el.bindings?.value : undefined;
    if (!b) continue;
    const h = resolveHistory(el);
    const k = historyKey(b, h.agg, h.windowS);
    if (keys.has(k)) continue;
    if (keys.size >= maxSeries) continue;
    keys.add(k);
  }
  return keys;
}

/** Whether a trend element's series is within the screen's allowance. */
export function trendAllowed(el: Element, allowed: Set<string> | undefined): boolean {
  if (!allowed) return true;
  const b = el.bindings?.value;
  if (!b) return false;
  const h = resolveHistory(el);
  return allowed.has(historyKey(b, h.agg, h.windowS));
}

/** Chart polyline runs: consecutive present buckets as [x, y] lists. A lone
 *  bucket between gaps spans its own width so it stays visible. */
export function chartRuns(chart: TrendChart, x0: number, y0: number, w: number, h: number): Array<Array<[number, number]>> {
  const n = chart.values.length;
  const bw = w / Math.max(1, n);
  const span = chart.hi - chart.lo || 1;
  const yOf = (v: number) => y0 + h - (Math.max(chart.lo, Math.min(chart.hi, v)) - chart.lo) / span * h;
  const runs: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  chart.values.forEach((v, i) => {
    if (v == null) { if (cur.length) runs.push(cur); cur = []; return; }
    cur.push([x0 + (i + 0.5) * bw, yOf(v)]);
  });
  if (cur.length) runs.push(cur);
  return runs.map((r) => (r.length === 1 ? [[r[0][0] - bw / 2, r[0][1]], [r[0][0] + bw / 2, r[0][1]]] : r));
}
