// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import { resolveElement } from "../src/model";
import { MockDataProvider, SignalKDataProvider } from "../src/data";
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

test("stale value keeps its last reading but reports stale state", () => {
  let clock = 0;
  const sk = new SignalKDataProvider({ freshnessMs: 10, now: () => clock });
  sk.ingestBatch({ schema: "yey.signalk.paths.v1", context: "vessels.self", generatedAt: "t", samples: [{ path: "navigation.speedOverGround", value: 3.086, sourceUnit: "m/s" }] });
  clock = 1000;
  const m = resolveElement(sv("navigation.speedOverGround", { unit: "kn", decimals: 1 }), sk);
  expect(m.state).toBe("stale");
  expect(m.text).toBe("6.0 kn");
});
