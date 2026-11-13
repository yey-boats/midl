// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// #39: bar and trend apply style.color to the same parts in the SVG and the
// Canvas backend, following the firmware (ui_layouts.cpp):
//   bar   — number = zone ?? style.color ?? accent; fill = zone ?? theme good
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
