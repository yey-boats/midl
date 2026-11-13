// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// midl#29: `style.color` (a theme token or #hex literal, allowlisted by
// resolveColor, midl#28) is honoured on every tile kind, not only on
// single-value / bar / trend.
import { test, expect, describe } from "vitest";
import type { Element, Placement } from "@yey-boats/midl";
import { paintScreenSvg } from "../src/svg/render-svg";
import { paintScreen } from "../src/paint";
import { MockDataProvider } from "../src/data";
import { theme } from "../src/theme";

const TH = theme("night");
const HEX = "#123456";
const provider = new MockDataProvider({
  hdg: { value: 1.0, sourceUnit: "rad" },
  awa: { value: -0.5, sourceUnit: "rad" },
  load: { value: 40 },
  pos: { value: "41°23.16'N" },
  ap: { value: "auto" },
});
const sk = (path: string) => ({ kind: "signalk", path });

function el(type: string, path: string, style: Record<string, unknown> = {}): Element {
  const base: Record<string, unknown> = { type, bindings: { value: sk(path) }, style };
  if (type === "gauge") base.style = { range: [0, 100], ...style };
  return base as unknown as Element;
}
const PATH: Record<string, string> = { gauge: "load", compass: "hdg", windrose: "awa", text: "pos", autopilot: "ap" };

function svgFor(type: string, style: Record<string, unknown>, size = 240): string {
  const p: Placement = { elementId: "t", rect: { x: 0, y: 0, w: size, h: size } };
  return paintScreenSvg([p], { t: el(type, PATH[type], style) }, provider, TH);
}

describe("SVG: style.color applies to gauge, compass, windrose, text, autopilot", () => {
  for (const type of ["gauge", "compass", "windrose", "text", "autopilot"]) {
    test(`${type}: #hex literal is drawn`, () => {
      expect(svgFor(type, {})).not.toContain(HEX);
      expect(svgFor(type, { color: HEX })).toContain(HEX);
    });
    test(`${type}: theme token resolves through the palette`, () => {
      const svg = svgFor(type, { color: "tide" });
      expect(svg).toContain(TH.tide);
    });
    test(`${type}: hostile colour renders exactly like no colour`, () => {
      expect(svgFor(type, { color: '#fff"/><img src=x>' })).toBe(svgFor(type, {}));
    });
  }

  test("compass: large round HUD and band shapes honour style.color", () => {
    expect(svgFor("compass", { color: HEX }, 400)).toContain(HEX);
    expect(svgFor("compass", { color: HEX, shape: "band" }, 400)).toContain(HEX);
    expect(svgFor("windrose", { color: HEX }, 400)).toContain(HEX);
  });

  test("gauge: a zone colour still wins over style.color", () => {
    const svg = svgFor("gauge", { color: HEX, zones: [{ lt: 50, color: "bad" }] });
    expect(svg).toContain(TH.bad);
    expect(svg).not.toContain(HEX);
  });

  test("gauge: stale value draws the arc and centre text stale, not the override", () => {
    const stale = {
      now: () => 0, subscribe: () => () => {},
      getValue: () => ({ value: 40, stale: true, present: true, updatedAt: 0 }),
    };
    const p: Placement = { elementId: "t", rect: { x: 0, y: 0, w: 240, h: 240 } };
    const svg = paintScreenSvg([p], { t: el("gauge", "load", { color: HEX }) }, stale, TH);
    expect(svg).not.toContain(HEX);
    expect(svg).toMatch(new RegExp(`<path [^>]*stroke="${TH.stale}"`));
    expect(svg).toMatch(new RegExp(`<text [^>]*fill="${TH.stale}"[^>]*>40`));
  });

  test("alias token 'alarm' and legacy colorRole resolve on the newly covered tiles", () => {
    expect(svgFor("gauge", { color: "alarm" })).toContain(TH.bad);
    expect(svgFor("text", { colorRole: "tide" })).toContain(TH.tide);
    expect(svgFor("compass", { colorRole: HEX })).toContain(HEX);
  });
});

// ── Canvas painter (MidlDashboard / renderDashboard) ─────────────────────────
function recorder() {
  const sets: Array<[string, unknown]> = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy({}, {
    get(_t, p: string) { return p in props ? props[p] : () => {}; },
    set(_t, p: string, v) { props[p] = v; sets.push([p, v]); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, sets };
}

describe("Canvas: style.color applies on every tile kind", () => {
  const kinds: Array<[string, string]> = [
    ["single-value", "load"], ["gauge", "load"], ["bar", "load"], ["trend", "load"],
    ["compass", "hdg"], ["windrose", "awa"], ["text", "pos"], ["autopilot", "ap"],
  ];
  for (const [type, path] of kinds) {
    test(`${type}: #hex literal is painted, hostile colour is not`, () => {
      const p: Placement = { elementId: "t", rect: { x: 0, y: 0, w: 160, h: 160 } };
      const styled = recorder();
      paintScreen(styled.ctx, [p], { t: el(type, path, { color: HEX, range: [0, 100] }) }, provider, TH);
      expect(styled.sets.some(([, v]) => v === HEX)).toBe(true);
      const hostile = recorder();
      paintScreen(hostile.ctx, [p], { t: el(type, path, { color: "#fff;x", range: [0, 100] }) }, provider, TH);
      const plain = recorder();
      paintScreen(plain.ctx, [p], { t: el(type, path, { range: [0, 100] }) }, provider, TH);
      expect(hostile.sets).toEqual(plain.sets);
    });
  }

  test("a zone colour wins over style.color, as in SVG", () => {
    const p: Placement = { elementId: "t", rect: { x: 0, y: 0, w: 160, h: 160 } };
    const r = recorder();
    paintScreen(r.ctx, [p], { t: el("gauge", "load", { color: HEX, zones: [{ lt: 50, color: "bad" }] }) }, provider, TH);
    expect(r.sets.some(([, v]) => v === TH.bad)).toBe(true);
    expect(r.sets.some(([, v]) => v === HEX)).toBe(false);
  });
});
