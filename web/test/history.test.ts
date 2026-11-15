// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Trend history (docs/specs/2026-11-15-trend-history.md §3/§4): time buckets,
// gaps, steady scroll, aggregation, raw storage + draw-time conversion, auto
// range, maxSeries and one-time backfill.
import { describe, test, expect } from "vitest";
import type { Element, Placement, Source } from "@yey-boats/midl";
import { HistoryStore, HistorySeries, TrendBuffers, historyKey, buildChart, trendChartFor, chartRuns } from "../src/history";
import { paintScreenSvg } from "../src/svg/render-svg";
import { paintScreen } from "../src/paint";
import { resolveElement } from "../src/model";
import type { DataProvider, HistoryRequest, ResolvedValue } from "../src/data";
import { theme } from "../src/theme";
import * as pkg from "../src/index";

const TH = theme("night");
const SK: Source = { kind: "signalk", path: "environment.wind.speedTrue" };

/** A provider whose value and clock the test drives. */
function live(opts: { history?: DataProvider["history"] } = {}) {
  const state: { value: unknown; stale: boolean } = { value: undefined, stale: false };
  const p: DataProvider & { set(v: unknown): void } = {
    now: () => 0,
    subscribe: () => () => {},
    getValue(): ResolvedValue {
      return state.value === undefined
        ? { value: undefined, present: false, stale: false }
        : { value: state.value, sourceUnit: "m/s", present: true, stale: state.stale };
    },
    set(v: unknown) { state.value = v; },
    ...(opts.history ? { history: opts.history } : {}),
  };
  return p;
}

const trendEl = (extra: Partial<Element> = {}): Element => ({ type: "trend", name: "TWS", bindings: { value: SK }, ...extra });

describe("HistorySeries", () => {
  test("buckets align to floor(t / step) and the newest bucket holds now", () => {
    const s = new HistorySeries({ windowS: 600, agg: "avg", points: 120 }); // step 5 s
    s.add(1_000_000, 1);
    s.add(1_004_999, 3); // same 5 s bucket (1_000_000 / 5000 = 200)
    s.add(1_005_000, 10); // next bucket
    const v = s.values(1_005_000);
    expect(v).toHaveLength(120);
    expect(v[119]).toBe(10);
    expect(v[118]).toBe(2);
    expect(v[117]).toBeNull();
  });

  test("a bucket without samples is a gap; the chart scrolls each step", () => {
    const s = new HistorySeries({ windowS: 600, agg: "avg", points: 120 });
    s.add(0, 5);
    expect(s.values(0)[119]).toBe(5);
    // one step later with no new sample: the point moved left, the newest is a gap
    const v = s.values(5000);
    expect(v[118]).toBe(5);
    expect(v[119]).toBeNull();
    // past the window the sample is gone
    expect(s.values(600_000).every((x) => x == null)).toBe(true);
  });

  test("agg avg/min/max/last", () => {
    const vals = [4, 1, 9, 6];
    const at = (agg: "avg" | "min" | "max" | "last") => {
      const s = new HistorySeries({ windowS: 60, agg, points: 12 });
      vals.forEach((v, i) => s.add(i * 100, v));
      return s.values(0)[11];
    };
    expect(at("avg")).toBe(5);
    expect(at("min")).toBe(1);
    expect(at("max")).toBe(9);
    expect(at("last")).toBe(6);
  });

  test("backfill fills empty buckets only; live samples win", () => {
    const s = new HistorySeries({ windowS: 600, agg: "avg", points: 120 });
    s.add(100_000, 7);
    s.fill(100_000, 99, 100_000); // bucket already live
    s.fill(95_000, 3, 100_000);
    s.fill(-1_000_000, 3, 100_000); // outside the window
    const v = s.values(100_000);
    expect(v[119]).toBe(7);
    expect(v[118]).toBe(3);
  });
});

describe("HistoryStore + renderer", () => {
  test("steady value keeps drawing (flat line that scrolls, does not stop)", () => {
    let t = 0;
    const store = new HistoryStore({ now: () => t });
    const p = live();
    p.set(5); // 5 m/s
    const el = trendEl();
    for (t = 0; t <= 60_000; t += 1000) trendChartFor(el, resolveElement(el, p), store, p);
    const chart = trendChartFor(el, resolveElement(el, p), store, p)!;
    const present = chart.values.filter((v) => v != null);
    expect(present.length).toBe(13); // 0..60 s in 5 s buckets
    expect(new Set(present).size).toBe(1);
    // flat line: ±1 display unit
    expect(chart.hi - chart.lo).toBeCloseTo(2);
  });

  test("values are stored raw (SI) and converted at draw time", () => {
    const store = new HistoryStore({ now: () => 0 });
    const p = live();
    p.set(10); // m/s
    const el = trendEl({ format: { unit: "kn", decimals: 1 } });
    const chart = trendChartFor(el, resolveElement(el, p), store, p)!;
    expect(store.values(historyKey(SK, "avg", 600), 0)[119]).toBe(10);
    expect(chart.values[119]).toBeCloseTo(19.44, 2);
    expect(chart.hiLabel).toBe("20.4"); // same decimals as the value
    expect(chart.loLabel).toBe("18.4");
  });

  test("auto range pads 10 %; style.range fixes it", () => {
    const c = buildChart([0, null, 10])!;
    expect(c.lo).toBeCloseTo(-1);
    expect(c.hi).toBeCloseTo(11);
    const store = new HistoryStore({ now: () => 0 });
    const p = live(); p.set(3);
    const el = trendEl({ style: { range: [0, 30] } });
    const fixed = trendChartFor(el, resolveElement(el, p), store, p)!;
    expect([fixed.lo, fixed.hi]).toEqual([0, 30]);
    expect([fixed.loLabel, fixed.hiLabel]).toEqual(["0", "30"]);
  });

  test("before any data: empty chart (null), no labels", () => {
    const store = new HistoryStore({ now: () => 0 });
    const p = live();
    const el = trendEl();
    expect(trendChartFor(el, resolveElement(el, p), store, p)).toBeNull();
    expect(trendChartFor(el, resolveElement(el, p), undefined, p)).toBeUndefined();
  });

  test("stale values are not recorded", () => {
    const store = new HistoryStore({ now: () => 0 });
    const p = live();
    const el = trendEl();
    expect(trendChartFor(el, { state: "stale", text: "5", raw: 5 }, store, p)).toBeNull();
  });

  test("history window/agg select the series; two tiles with one key share it", () => {
    const store = new HistoryStore({ now: () => 0 });
    const p = live(); p.set(4);
    const a = trendEl({ history: { window: "1h", agg: "max" } });
    trendChartFor(a, resolveElement(a, p), store, p);
    expect(store.has(historyKey(SK, "max", 3600))).toBe(true);
    const step = (3600 * 1000) / 120;
    expect(new HistorySeries({ windowS: 3600, agg: "max", points: 120 }).stepMs).toBe(step);
  });

  test("backfill is requested once per key with window/step/agg; rows fill buckets", async () => {
    const calls: Array<[string, HistoryRequest]> = [];
    const p = live({
      history: async (path, req) => { calls.push([path, req]); return [[-10_000, 2], [-5000, 3]]; },
    });
    let updates = 0;
    const store = new HistoryStore({ now: () => 0, onUpdate: () => updates++ });
    const el = trendEl({ history: { window: "10m", agg: "min" } });
    trendChartFor(el, resolveElement(el, p), store, p);
    trendChartFor(el, resolveElement(el, p), store, p);
    expect(calls).toEqual([["environment.wind.speedTrue", { window_s: 600, step_s: 5, agg: "min" }]]);
    await new Promise((r) => setTimeout(r, 0));
    expect(updates).toBe(1);
    const v = store.values(historyKey(SK, "min", 600), 0);
    expect(v[117]).toBe(2);
    expect(v[118]).toBe(3);
  });

  test("a rejected backfill leaves the series empty", async () => {
    const p = live({ history: () => Promise.reject(new Error("501")) });
    const store = new HistoryStore({ now: () => 0 });
    const el = trendEl();
    expect(trendChartFor(el, resolveElement(el, p), store, p)).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.values(historyKey(SK, "avg", 600), 0).every((x) => x == null)).toBe(true);
  });

  test("manifest points/maxSeries: tiles past maxSeries show the number only", () => {
    const store = new HistoryStore({ now: () => 0 });
    store.configure({ points: 90, maxSeries: 1 });
    expect(store.points).toBe(90);
    const p = live(); p.set(4);
    const els: Record<string, Element> = {
      a: trendEl(),
      b: { type: "trend", bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } } },
    };
    const P = (id: string, x: number): Placement => ({ elementId: id, rect: { x, y: 0, w: 240, h: 240 } });
    const svg = paintScreenSvg([P("a", 0), P("b", 240)], els, p, TH, store);
    expect((svg.match(/<polyline /g) ?? []).length).toBe(1);
    expect(store.has(historyKey(els.b.bindings!.value, "avg", 600))).toBe(false);
  });

  test("chart runs break at gaps; a lone bucket spans its width", () => {
    const runs = chartRuns({ values: [1, 2, null, 3], lo: 0, hi: 4, loLabel: "0", hiLabel: "4" }, 0, 0, 40, 40);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveLength(2);
    expect(runs[1]).toEqual([[30, 10], [40, 10]]);
  });

  test("SVG draws the min/max labels at the chart's left edge", () => {
    const store = new HistoryStore({ now: () => 0 });
    const p = live(); p.set(5);
    const el = trendEl({ style: { range: [0, 30] }, format: { unit: "kn" } });
    const svg = paintScreenSvg([{ elementId: "t", rect: { x: 0, y: 0, w: 240, h: 240 } }], { t: el }, p, TH, store);
    expect(svg).toMatch(/text-anchor="start"[^>]*>30</);
    expect(svg).toMatch(/text-anchor="start"[^>]*>0</);
  });

  test("Canvas draws a line per run and the labels", () => {
    const calls: string[] = [];
    const texts: string[] = [];
    const ctx = new Proxy({}, {
      get(_t, k: string) {
        return (...a: unknown[]) => { calls.push(k); if (k === "fillText") texts.push(String(a[0])); };
      },
      set() { return true; },
    }) as unknown as CanvasRenderingContext2D;
    let t = 0;
    const store = new HistoryStore({ now: () => t });
    const p = live(); p.set(5);
    const el = trendEl({ style: { range: [0, 20] } });
    const P: Placement = { elementId: "t", rect: { x: 0, y: 0, w: 240, h: 240 } };
    paintScreen(ctx, [P], { t: el }, p, TH, store);
    t = 5000; p.set(6);
    paintScreen(ctx, [P], { t: el }, p, TH, store);
    expect(calls.filter((c) => c === "stroke").length).toBeGreaterThanOrEqual(2);
    expect(texts).toContain("20");
    expect(texts).toContain("0");
  });

  test("TrendBuffers stays a constructible alias with the legacy API", () => {
    const tb = new TrendBuffers();
    expect(tb).toBeInstanceOf(HistoryStore);
    tb.push("x", 1);
    expect(tb.series("x")).toEqual([1]);
    expect(pkg.TrendBuffers).toBe(TrendBuffers);
    expect(pkg.HistoryStore).toBe(HistoryStore);
  });
});
