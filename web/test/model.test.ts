// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import { resolveElement } from "../src/model";
import { MockDataProvider, type DataProvider } from "../src/data";
import type { Element } from "@yey-boats/midl";

const sv = (path: string, format?: Record<string, unknown>, style?: Record<string, unknown>, type = "single-value"): Element =>
  ({ type, bindings: { value: { kind: "signalk", path } }, format, style });

test("single-value ok state with converted display text", () => {
  const p = new MockDataProvider({ "navigation.speedOverGround": { value: 3.086, sourceUnit: "m/s" } });
  const m = resolveElement(sv("navigation.speedOverGround", { unit: "kn", decimals: 1 }), p);
  expect(m.state).toBe("ok");
  expect(m.text).toBe("6.0 kn");
});

test("missing path is no-data with placeholder text", () => {
  const p = new MockDataProvider({});
  const m = resolveElement(sv("x"), p);
  expect(m.state).toBe("no-data");
  expect(m.text).toBe("--");
});

test("bar fraction derives from style.range", () => {
  const p = new MockDataProvider({ "tanks.fuel.0.currentLevel": { value: 0.25 } });
  const m = resolveElement(sv("tanks.fuel.0.currentLevel", undefined, { range: [0, 1] }, "bar"), p);
  expect(m.fraction).toBeCloseTo(0.25, 6);
});

test("compass angle converts radians to degrees and reads dir binding", () => {
  const el: Element = {
    type: "compass",
    bindings: { value: { kind: "signalk", path: "navigation.headingTrue" }, dir: { kind: "signalk", path: "environment.wind.directionTrue" } },
  };
  const p = new MockDataProvider({
    "navigation.headingTrue": { value: Math.PI / 2, sourceUnit: "rad" },
    "environment.wind.directionTrue": { value: Math.PI, sourceUnit: "rad" },
  });
  const m = resolveElement(el, p);
  expect(m.angleDeg).toBeCloseTo(90, 4);
  expect(m.dirDeg).toBeCloseTo(180, 4);
});

test("markers resolve dir source to angleDeg, cap glyph/color/kind", () => {
  const el: Element = {
    type: "compass",
    bindings: { value: { kind: "signalk", path: "navigation.headingTrue" } },
    markers: [
      { glyph: "diamond", color: "good", dir: { kind: "signalk", path: "environment.wind.directionTrue" } },
      { dir: { kind: "signalk", path: "missing.path" } }, // no value -> no angle, defaults
    ],
  } as unknown as Element;
  const p = new MockDataProvider({
    "navigation.headingTrue": { value: 0, sourceUnit: "rad" },
    "environment.wind.directionTrue": { value: Math.PI, sourceUnit: "rad" },
  });
  const m = resolveElement(el, p);
  expect(m.markers).toHaveLength(2);
  expect(m.markers![0]).toMatchObject({ glyph: "diamond", color: "good", kind: "rim" });
  expect(m.markers![0].angleDeg).toBeCloseTo(180, 4);
  expect(m.markers![1]).toMatchObject({ glyph: "triangle", color: "accent" });
  expect(m.markers![1].angleDeg).toBeUndefined();
});

test("markers cap at 12 per dial", () => {
  const markers = Array.from({ length: 20 }, () => ({ glyph: "circle", color: "fg" }));
  const el = { type: "compass", bindings: { value: { kind: "signalk", path: "x" } }, markers } as unknown as Element;
  const p = new MockDataProvider({ x: { value: 0, sourceUnit: "rad" } });
  expect(resolveElement(el, p).markers).toHaveLength(12);
});

test("zones pick the first threshold above the fraction", () => {
  const el = sv("tanks.fuel.0.currentLevel", undefined, { range: [0, 1], zones: [{ lt: 0.25, color: "bad" }, { lt: 0.5, color: "warn" }] }, "bar");
  const lo = new MockDataProvider({ "tanks.fuel.0.currentLevel": { value: 0.1 } });
  expect(resolveElement(el, lo).zoneColor).toBe("bad");
  const mid = new MockDataProvider({ "tanks.fuel.0.currentLevel": { value: 0.4 } });
  expect(resolveElement(el, mid).zoneColor).toBe("warn");
  const hi = new MockDataProvider({ "tanks.fuel.0.currentLevel": { value: 0.9 } });
  expect(resolveElement(el, hi).zoneColor).toBeUndefined();
});

test("sectors resolve from style.sectors", () => {
  const el = sv("environment.wind.angleApparent", undefined, { sectors: [{ from: -30, to: 0, color: "port" }, { from: 0, to: 30, color: "starboard" }] }, "windrose");
  const p = new MockDataProvider({ "environment.wind.angleApparent": { value: 0.5, sourceUnit: "rad" } });
  const m = resolveElement(el, p);
  expect(m.sectors).toEqual([{ from: -30, to: 0, color: "port" }, { from: 0, to: 30, color: "starboard" }]);
});

test("format.side maps signed angle to magnitude + P/S", () => {
  const stbd = resolveElement(sv("environment.wind.angleApparent", { side: true }), new MockDataProvider({ "environment.wind.angleApparent": { value: 0.7330, sourceUnit: "rad" } }));
  expect(stbd.side).toBe("S");
  expect(stbd.text).toBe("42");
  const port = resolveElement(sv("environment.wind.angleApparent", { side: true }), new MockDataProvider({ "environment.wind.angleApparent": { value: -0.7330, sourceUnit: "rad" } }));
  expect(port.side).toBe("P");
  expect(port.text).toBe("42");
});

test("format.side accepts the design's 'port-stbd' string and keeps a distance magnitude+unit", () => {
  // XTE: a distance in metres displayed as nm with side. -12 m -> Port, magnitude formatted with unit.
  const el = sv("navigation.courseRhumbline.crossTrackError", { unit: "nm", decimals: 2, side: "port-stbd" });
  const m = resolveElement(el, new MockDataProvider({ "navigation.courseRhumbline.crossTrackError": { value: -12, sourceUnit: "m" } }));
  expect(m.side).toBe("P");
  expect(m.text).toBe("0.01 nm");
  const s = resolveElement(el, new MockDataProvider({ "navigation.courseRhumbline.crossTrackError": { value: 12, sourceUnit: "m" } }));
  expect(s.side).toBe("S");
  expect(s.text).toBe("0.01 nm");
});

test("text widget renders a SignalK position object as two lat/lon lines", () => {
  const el = sv("navigation.position", undefined, undefined, "text");
  const m = resolveElement(el, new MockDataProvider({ "navigation.position": { value: { latitude: 41.386, longitude: 2.1738 } } }));
  expect(m.state).toBe("ok");
  expect(m.text).toBe("41°23.16'N\n2°10.43'E");
});

test("stale value keeps its last reading but reports stale state", () => {
  // generic provider returning a stale-but-present value (transport-agnostic stub)
  const stale: DataProvider = {
    now: () => 1000,
    getValue: () => ({ value: 3.086, sourceUnit: "m/s", updatedAt: 0, stale: true, present: true }),
    subscribe: () => () => {},
  };
  const m = resolveElement(sv("navigation.speedOverGround", { unit: "kn", decimals: 1 }), stale);
  expect(m.state).toBe("stale");
  expect(m.text).toBe("6.0 kn");
});

// ── A1: inferred sourceUnit (no sourceUnit from provider) ─────────────────────

test("A1: headingTrue 2.0 rad, no sourceUnit, format.unit 'deg' → '115'", () => {
  // Provider gives NO sourceUnit — path inference must kick in (rad → deg).
  // 2.0 * (180/π) ≈ 114.59°, rounded → 115
  const p = new MockDataProvider({ "navigation.headingTrue": { value: 2.0 } });
  const m = resolveElement(sv("navigation.headingTrue", { unit: "deg", decimals: 0 }), p);
  expect(m.state).toBe("ok");
  expect(m.text).toBe("115 deg");
  expect(m.numeric).toBeCloseTo(114.59, 0);
});

test("A1: stateOfCharge 0.78, no sourceUnit, format.unit '%' → '78 %'", () => {
  // Provider gives NO sourceUnit — path inference must kick in (ratio → %).
  const p = new MockDataProvider({ "electrical.batteries.0.capacity.stateOfCharge": { value: 0.78 } });
  const m = resolveElement(sv("electrical.batteries.0.capacity.stateOfCharge", { unit: "%", decimals: 0 }), p);
  expect(m.state).toBe("ok");
  expect(m.text).toBe("78 %");
  expect(m.numeric).toBeCloseTo(78, 1);
});

test("A1: depth.belowTransducer 3.5, no sourceUnit, format.unit 'ft' → converts m→ft", () => {
  // Provider gives NO sourceUnit — path inference must kick in (m → ft).
  // 3.5 m * 3.2808… ≈ 11.48 ft
  const p = new MockDataProvider({ "environment.depth.belowTransducer": { value: 3.5 } });
  const m = resolveElement(sv("environment.depth.belowTransducer", { unit: "ft", decimals: 1 }), p);
  expect(m.state).toBe("ok");
  expect(m.numeric).toBeCloseTo(11.48, 0);
  expect(m.text).toMatch(/11\.\d ft/);
});

test("A1: provider-supplied sourceUnit wins over inference", () => {
  // Provider explicitly tags sourceUnit:"m/s" on a headingTrue path — artificial
  // but verifies provider value always wins.
  const p = new MockDataProvider({ "navigation.headingTrue": { value: 1.0, sourceUnit: "m/s" } });
  const m = resolveElement(sv("navigation.headingTrue", { unit: "kn", decimals: 2 }), p);
  // Must use "m/s" not "rad": 1.0 m/s → 1.943844 kn
  expect(m.numeric).toBeCloseTo(1.9438, 3);
});

test("A1: unknown path with no sourceUnit → no conversion (value unchanged)", () => {
  // "foo.bar" has no known convention → inferSourceUnit returns undefined → no convert.
  const p = new MockDataProvider({ "foo.bar": { value: 42.5 } });
  const m = resolveElement(sv("foo.bar", { unit: "kn", decimals: 1 }), p);
  // No sourceUnit → convert("kn", undefined, ...) returns value unchanged
  expect(m.numeric).toBeCloseTo(42.5, 1);
});
