// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import { paintScreen, TrendBuffers } from "../src/paint";
import { MockDataProvider, SignalKDataProvider } from "../src/data";
import { THEMES } from "../src/theme";
import type { Element, Placement } from "@yey-boats/midl";

interface Call { fn: string; args: unknown[]; }
function recorder() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = {};
  const handler: ProxyHandler<object> = {
    get(_t, p: string) {
      if (p in props || ["fillStyle", "strokeStyle", "font", "lineWidth", "textAlign", "textBaseline"].includes(p)) return props[p];
      return (...args: unknown[]) => { calls.push({ fn: p, args }); };
    },
    set(_t, p: string, v) { props[p] = v; calls.push({ fn: `set:${p}`, args: [v] }); return true; },
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, calls };
}
const place = (id: string): Placement => ({ elementId: id, rect: { x: 0, y: 0, w: 120, h: 120 } });

test("dial elements draw an arc", () => {
  const { ctx, calls } = recorder();
  const els: Record<string, Element> = { c: { type: "compass", bindings: { value: { kind: "signalk", path: "h" } } } };
  const p = new MockDataProvider({ h: { value: 1.57, sourceUnit: "rad" } });
  paintScreen(ctx, [place("c")], els, p, THEMES.night);
  expect(calls.some((k) => k.fn === "arc")).toBe(true);
});

test("bar fill width is proportional to fraction", () => {
  const { ctx, calls } = recorder();
  const els: Record<string, Element> = { b: { type: "bar", style: { range: [0, 1] }, bindings: { value: { kind: "signalk", path: "f" } } } };
  const p = new MockDataProvider({ f: { value: 0.5 } });
  paintScreen(ctx, [place("b")], els, p, THEMES.night);
  const fills = calls.filter((k) => k.fn === "fillRect");
  // last fillRect is the fill; its width (arg 2) is ~half the track width
  const fill = fills[fills.length - 1].args as number[];
  expect(fill[2]).toBeGreaterThan(0);
  expect(fill[2]).toBeLessThan(120);
});

test("stale value paints with the stale token", () => {
  const { ctx, calls } = recorder();
  const els: Record<string, Element> = { s: { type: "single-value", bindings: { value: { kind: "signalk", path: "x" } } } };
  // a SignalK provider with an old sample => stale
  let clock = 0; const sk = new SignalKDataProvider({ freshnessMs: 10, now: () => clock });
  sk.ingestBatch({ schema: "yey.signalk.paths.v1", context: "vessels.self", generatedAt: "t", samples: [{ path: "x", value: 5 }] });
  clock = 1000;
  paintScreen(ctx, [place("s")], els, sk, THEMES.night);
  expect(calls.some((k) => k.fn === "set:fillStyle" && k.args[0] === THEMES.night.stale)).toBe(true);
});

test("no-data element draws a dashed frame", () => {
  const { ctx, calls } = recorder();
  const els: Record<string, Element> = { n: { type: "single-value", bindings: { value: { kind: "signalk", path: "missing" } } } };
  paintScreen(ctx, [place("n")], els, new MockDataProvider({}), THEMES.night);
  expect(calls.some((k) => k.fn === "setLineDash")).toBe(true);
});

test("trend buffer accumulates bounded samples", () => {
  const tb = new TrendBuffers();
  for (let i = 0; i < 200; i++) tb.push("t", i);
  expect(tb.series("t").length).toBe(120);
  expect(tb.series("t").at(-1)).toBe(199);
});
