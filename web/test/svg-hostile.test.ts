// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Hostile document values must never become SVG markup. The validators reject
// bad colours, but hosts insert this SVG with innerHTML, so the renderer must be
// safe on its own: colours go through a strict allowlist, text through esc().
import { test, expect, describe } from "vitest";
import type { Element, Placement } from "@yey-boats/midl";
import { resolveColor, isSafeColor } from "../src/svg/color";
import { glyphPath } from "../src/svg/glyphs";
import { paintScreenSvg, renderDashboardSvg } from "../src/svg/render-svg";
import { MockDataProvider } from "../src/data";
import { theme } from "../src/theme";

const TH = theme("night");
const X = '#fff"/><img src=x onerror=alert(1)><script>alert(2)</script>';
const ATTR = '#fff" onmouseover="alert(1)';
const HOSTILE = [X, ATTR, "#fff;fill:url(javascript:alert(1))", "#ggg", "#ff", "red", "constructor", "__proto__", "toString"];

function assertInert(svg: string) {
  const low = svg.toLowerCase();
  expect(low).not.toContain("<img");
  expect(low).not.toContain("<script");
  // no event-handler attribute inside any real tag (text content is escaped, so
  // `&lt;img onerror=…&gt;` there is inert)
  expect(low).not.toMatch(/<[^>]*\son[a-z]+\s*=/);
  for (const tag of low.match(/<[^>]*>/g) ?? []) expect(tag).not.toContain("javascript:");
  // every colour attribute holds a plain hex literal or `none`
  for (const m of svg.matchAll(/\s(fill|stroke)="([^"]*)"/g)) {
    expect(m[2], `${m[1]}=${m[2]}`).toMatch(/^(none|rgba\(87,199,216,0\.06\)|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8})$/);
  }
}

describe("resolveColor allowlist", () => {
  test("hex literals and tokens resolve", () => {
    expect(resolveColor("#abc", TH, "#000")).toBe("#abc");
    expect(resolveColor("#AABBCC", TH, "#000")).toBe("#AABBCC");
    expect(resolveColor("#aabbcc80", TH, "#000")).toBe("#aabbcc80");
    expect(resolveColor("warn", TH, "#000")).toBe(TH.warn);
    expect(resolveColor("alarm", TH, "#000")).toBe(TH.bad);
  });
  test("hostile and malformed values fall back", () => {
    for (const c of HOSTILE) expect(resolveColor(c, TH, "#000"), c).toBe("#000");
    expect(resolveColor(42 as unknown as string, TH, "#000")).toBe("#000");
  });
  test("isSafeColor only accepts hex literals", () => {
    expect(isSafeColor("#fff")).toBe(true);
    for (const c of HOSTILE) expect(isSafeColor(c), c).toBe(false);
  });
});

describe("glyphPath", () => {
  test("drops an unsafe colour", () => {
    for (const c of HOSTILE) assertInert(glyphPath("triangle", 10, 10, 8, c));
  });
  test("prototype keys are not glyph builders", () => {
    for (const g of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(glyphPath(g, 10, 10, 8, "#fff")).toMatch(/^<circle /);
    }
  });
});

describe("paintScreenSvg with hostile values (validation bypassed)", () => {
  const provider = new MockDataProvider({
    "a": { value: 1 }, "d": { value: 0.5 }, "s": { value: X },
  });
  const v = { kind: "signalk", path: "a" };
  function els(c: string): Record<string, Element> {
    const markers = [
      { glyph: "triangle", color: c, dir: { kind: "signalk", path: "d" } },
      { glyph: X, color: c, dir: { kind: "signalk", path: "d" } },
      { glyph: "triangle", color: c, kind: "vector", dir: { kind: "signalk", path: "d" } },
    ];
    const style = { title: X, color: c, colorRole: c, zones: [{ lt: 99, color: c }], sectors: [{ from: -30, to: 30, color: c }], range: [0, 10] };
    return {
      sv: { type: "single-value", name: X, style, format: { unit: X }, bindings: { value: v } },
      tx: { type: "text", style, bindings: { value: { kind: "signalk", path: "s" } } },
      ga: { type: "gauge", style, format: { unit: X }, bindings: { value: v } },
      ba: { type: "bar", style, bindings: { value: v } },
      tr: { type: "trend", style, bindings: { value: v } },
      ap: { type: "autopilot", style, bindings: { value: { kind: "signalk", path: "s" } } },
      bu: { type: "button", style, name: X },
      cm: { type: "compass", style, markers, bindings: { value: v } },
      cmb: { type: "compass", style: { ...style, shape: "band" }, markers, bindings: { value: v } },
      wr: { type: "windrose", style, markers, bindings: { value: v } },
    } as unknown as Record<string, Element>;
  }
  const small = (id: string): Placement => ({ elementId: id, rect: { x: 0, y: 0, w: 200, h: 200 } } as Placement);
  const big = (id: string): Placement => ({ elementId: id, rect: { x: 0, y: 0, w: 480, h: 480 } } as Placement);

  for (const c of HOSTILE) {
    test(`colour ${JSON.stringify(c)} renders inert on every tile kind and dial size`, () => {
      const e = els(c);
      const ids = Object.keys(e);
      assertInert(paintScreenSvg(ids.map(small), e, provider, TH));
      assertInert(paintScreenSvg(ids.map(big), e, provider, TH));
    });
  }
});

describe("renderDashboardSvg rejects hostile colours at validation", () => {
  test("marker colour starting with # is refused, error text escaped", () => {
    const doc = JSON.stringify({ midl: "1.0.0", screens: [{ id: "m", elements: { c: { type: "compass", markers: [{ glyph: "triangle", color: X }], bindings: { value: { kind: "signalk", path: "a" } } } }, layout: { element: "c" } }] });
    const manifest = { midl: "1.0.0", board: "b", classes: [{ id: "k", width: 480, height: 480, maxTiles: 4, maxDepth: 3, presets: [], elements: ["compass"] }], elements: [{ type: "compass", bindings: ["value", "dir"], attrs: ["title"], glyphs: ["triangle"] }], sources: ["signalk"], actionKinds: [], presets: [], glyphs: ["triangle"], themes: ["night"], fonts: [14] };
    const r = renderDashboardSvg(doc, manifest as never, "k", { x: 0, y: 0, w: 480, h: 480 }, new MockDataProvider({ a: { value: 1 } }));
    expect(r.ok).toBe(false);
    assertInert(r.svg);
  });
});
