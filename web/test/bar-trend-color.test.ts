// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// #39: bar and trend apply style.color to the same parts in the SVG and the
// Canvas backend, following the firmware (ui_layouts.cpp):
//   bar   — number = style.color ?? accent, fill = theme good; once zones are
//           declared both follow the zone block (active zone ?? theme good)
//   trend — number and sparkline = style.color (default: theme hues)
import { describe, test, expect } from "vitest";
import type { Element, Placement } from "@yey-boats/midl";
import { paintScreenSvg, TrendBuffers } from "../src/svg/render-svg";
import { paintScreen } from "../src/paint";
import { MockDataProvider } from "../src/data";
import { theme } from "../src/theme";

const TH = theme("night");
const HEX = "#123456";
const provider = new MockDataProvider({ load: { value: 40 } });
const P: Placement = { elementId: "t", rect: { x: 0, y: 0, w: 240, h: 240 } };
const el = (type: string, style: Record<string, unknown>) =>
  ({ type, bindings: { value: { kind: "signalk", path: "load" } }, style: { range: [0, 100], ...style } }) as unknown as Element;

const heroFill = (svg: string) => /<text [^>]*fill="([^"]+)"[^>]*>40/.exec(svg)?.[1];
const barFill = (svg: string) => [...svg.matchAll(/<rect [^>]*rx="3" fill="([^"]+)"\/>/g)].pop()?.[1];

describe("SVG bar/trend colour roles", () => {
  test("bar: style.color colours the number, fill stays theme good", () => {
    const svg = paintScreenSvg([P], { t: el("bar", { color: HEX }) }, provider, TH);
    expect(heroFill(svg)).toBe(HEX);
    expect(barFill(svg)).toBe(TH.good);
  });
  test("bar: a zone colours both the number and the fill", () => {
    const svg = paintScreenSvg([P], { t: el("bar", { color: HEX, zones: [{ lt: 50, color: "bad" }] }) }, provider, TH);
    expect(heroFill(svg)).toBe(TH.bad);
    expect(barFill(svg)).toBe(TH.bad);
  });
  test("trend: style.color colours the number and the sparkline", () => {
    const trends = new TrendBuffers();
    paintScreenSvg([P], { t: el("trend", { color: HEX }) }, provider, TH, trends);
    const svg = paintScreenSvg([P], { t: el("trend", { color: HEX }) }, new MockDataProvider({ load: { value: 45 } }), TH, trends);
    expect(svg).toMatch(new RegExp(`<polyline [^>]*stroke="${HEX}"`));
    expect(/<text [^>]*fill="([^"]+)"[^>]*>45/.exec(svg)?.[1]).toBe(HEX);
  });
});

// Canvas: record each draw call with the fill/stroke style active at the time.
function recorder() {
  const props: Record<string, unknown> = {};
  const calls: Array<{ fn: string; fill: unknown; stroke: unknown; args: unknown[] }> = [];
  const ctx = new Proxy({}, {
    get(_t, p: string) {
      if (p in props) return props[p];
      return (...args: unknown[]) => { calls.push({ fn: p, fill: props.fillStyle, stroke: props.strokeStyle, args }); };
    },
    set(_t, p: string, v) { props[p] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe("Canvas bar/trend colour roles match SVG", () => {
  test("bar: number drawn in style.color, fill stays theme good", () => {
    const r = recorder();
    paintScreen(r.ctx, [P], { t: el("bar", { color: HEX }) }, provider, TH);
    const text = r.calls.find((c) => c.fn === "fillText" && String(c.args[0]).startsWith("40"));
    expect(text?.fill).toBe(HEX);
    expect(r.calls.filter((c) => c.fn === "fillRect").pop()?.fill).toBe(TH.good);
  });
  test("bar: a zone colours both the number and the fill", () => {
    const r = recorder();
    paintScreen(r.ctx, [P], { t: el("bar", { color: HEX, zones: [{ lt: 50, color: "bad" }] }) }, provider, TH);
    const text = r.calls.find((c) => c.fn === "fillText" && String(c.args[0]).startsWith("40"));
    expect(text?.fill).toBe(TH.bad);
    expect(r.calls.filter((c) => c.fn === "fillRect").pop()?.fill).toBe(TH.bad);
  });
  test("trend: line and number both in style.color", () => {
    const trends = new TrendBuffers();
    trends.push("t", 30);
    const r = recorder();
    paintScreen(r.ctx, [P], { t: el("trend", { color: HEX }) }, provider, TH, trends);
    expect(r.calls.find((c) => c.fn === "stroke")?.stroke).toBe(HEX);
    expect(r.calls.find((c) => c.fn === "fillText" && String(c.args[0]).startsWith("40"))?.fill).toBe(HEX);
  });
});

describe("#39 review: zones, defaults, centre bars, side (both backends)", () => {
  const zoneIdle = { color: HEX, zones: [{ lt: 10, color: "bad" }] }; // 40 is above every lt
  const canvasText = (r: ReturnType<typeof recorder>, prefix: string) => r.calls.find((c) => c.fn === "fillText" && String(c.args[0]).startsWith(prefix))?.fill;

  test("bar with zones declared but none active: number and fill are theme good", () => {
    const svg = paintScreenSvg([P], { t: el("bar", zoneIdle) }, provider, TH);
    expect(heroFill(svg)).toBe(TH.good);
    expect(barFill(svg)).toBe(TH.good);
    const r = recorder();
    paintScreen(r.ctx, [P], { t: el("bar", zoneIdle) }, provider, TH);
    expect(canvasText(r, "40")).toBe(TH.good);
  });
  test("trend ignores zones in both backends (style.color wins)", () => {
    const style = { color: HEX, zones: [{ lt: 50, color: "bad" }] };
    const trends = new TrendBuffers();
    paintScreenSvg([P], { t: el("trend", style) }, new MockDataProvider({ load: { value: 30 } }), TH, trends);
    const svg = paintScreenSvg([P], { t: el("trend", style) }, provider, TH, trends);
    expect(svg).toMatch(new RegExp(`<polyline [^>]*stroke="${HEX}"`));
    const ct = new TrendBuffers(); ct.push("t", 30);
    const r = recorder();
    paintScreen(r.ctx, [P], { t: el("trend", style) }, provider, TH, ct);
    expect(r.calls.find((c) => c.fn === "stroke")?.stroke).toBe(HEX);
    expect(canvasText(r, "40")).toBe(HEX);
  });
  test("defaults: bar and trend numbers are accent in both backends", () => {
    expect(heroFill(paintScreenSvg([P], { t: el("bar", {}) }, provider, TH))).toBe(TH.accent);
    for (const type of ["bar", "trend"]) {
      const r = recorder();
      paintScreen(r.ctx, [P], { t: el(type, {}) }, provider, TH, new TrendBuffers());
      expect(canvasText(r, "40")).toBe(TH.accent);
    }
  });
  test("legacy colorRole behaves like style.color on the bar number", () => {
    expect(heroFill(paintScreenSvg([P], { t: el("bar", { colorRole: HEX }) }, provider, TH))).toBe(HEX);
  });
  test("Canvas centre bar draws a needle from the middle, like SVG", () => {
    const r = recorder();
    paintScreen(r.ctx, [P], { t: el("bar", { center: 0 }) }, provider, TH);
    const rect = r.calls.filter((c) => c.fn === "fillRect").pop()!;
    expect(rect.args[2]).toBe(4);
    expect(rect.fill).toBe(TH.good);
  });
  test("Canvas bar keeps the side suffix", () => {
    const sided = { type: "bar", bindings: { value: { kind: "signalk", path: "load" } }, format: { side: "P/S" }, style: { range: [-100, 100] } } as unknown as Element;
    const svg = paintScreenSvg([P], { t: sided }, provider, TH);
    const svgText = /<text [^>]*letter-spacing[^>]*>([^<]+)</.exec(svg)![1];
    const r = recorder();
    paintScreen(r.ctx, [P], { t: sided }, provider, TH);
    expect(r.calls.find((c) => c.fn === "fillText" && String(c.args[0]).startsWith("40"))?.args[0]).toBe(svgText);
  });
  test("stale bar and trend dim number and fill/line in both backends", () => {
    const stale = { now: () => 0, subscribe: () => () => {}, getValue: () => ({ value: 40, stale: true, present: true, updatedAt: 0 }) };
    const svg = paintScreenSvg([P], { t: el("bar", { color: HEX }) }, stale, TH);
    expect(heroFill(svg)).toBe(TH.stale);
    expect(barFill(svg)).toBe(TH.stale);
    const r = recorder();
    paintScreen(r.ctx, [P], { t: el("bar", { color: HEX }) }, stale, TH);
    expect(canvasText(r, "40")).toBe(TH.stale);
    expect(r.calls.filter((c) => c.fn === "fillRect").pop()?.fill).toBe(TH.stale);
  });
});
