// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import { SignalKDataProvider, MockDataProvider, collectBindings, type PathSampleBatch } from "../src/data";
import type { ConfigDoc } from "@yey-boats/midl";

function batch(samples: PathSampleBatch["samples"], at = "2026-06-21T00:00:00Z"): PathSampleBatch {
  return { schema: "yey.signalk.paths.v1", context: "vessels.self", generatedAt: at, samples };
}

test("signalk provider returns present value + unit after ingest", () => {
  let clock = 1000;
  const p = new SignalKDataProvider({ freshnessMs: 5000, now: () => clock });
  p.ingestBatch(batch([{ path: "navigation.speedOverGround", value: 3.1, sourceUnit: "m/s" }]));
  const r = p.getValue({ kind: "signalk", path: "navigation.speedOverGround" });
  expect(r).toMatchObject({ value: 3.1, sourceUnit: "m/s", present: true, stale: false });
});

test("never-seen path is no-data (not present, not stale)", () => {
  const p = new SignalKDataProvider({ now: () => 0 });
  const r = p.getValue({ kind: "signalk", path: "environment.depth.belowTransducer" });
  expect(r).toMatchObject({ present: false, stale: false });
});

test("value past the freshness ceiling is present but stale", () => {
  let clock = 1000;
  const p = new SignalKDataProvider({ freshnessMs: 5000, now: () => clock });
  p.ingestBatch(batch([{ path: "navigation.speedOverGround", value: 3.1 }]));
  clock = 1000 + 5001;
  const r = p.getValue({ kind: "signalk", path: "navigation.speedOverGround" });
  expect(r).toMatchObject({ present: true, stale: true });
});

test("const source resolves; local/computed are no-data", () => {
  const p = new SignalKDataProvider({ now: () => 0 });
  expect(p.getValue({ kind: "const", value: 42 })).toMatchObject({ value: 42, present: true, stale: false });
  expect(p.getValue({ kind: "local", id: "gpio1" }).present).toBe(false);
  expect(p.getValue({ kind: "computed", expr: "a+b" }).present).toBe(false);
});

test("subscribe fires on ingest of a subscribed path and unsubscribe stops it", () => {
  const p = new SignalKDataProvider({ now: () => 0 });
  let hits = 0;
  const off = p.subscribe(["navigation.speedOverGround"], () => { hits++; });
  p.ingestBatch(batch([{ path: "navigation.speedOverGround", value: 1 }]));
  expect(hits).toBe(1);
  p.ingestBatch(batch([{ path: "environment.depth.belowTransducer", value: 2 }])); // not subscribed
  expect(hits).toBe(1);
  off();
  p.ingestBatch(batch([{ path: "navigation.speedOverGround", value: 3 }]));
  expect(hits).toBe(1);
});

test("MockDataProvider resolves by path", () => {
  const p = new MockDataProvider({ "navigation.speedOverGround": { value: 4.0, sourceUnit: "m/s" } });
  expect(p.getValue({ kind: "signalk", path: "navigation.speedOverGround" })).toMatchObject({ value: 4.0, present: true });
  expect(p.getValue({ kind: "signalk", path: "missing" }).present).toBe(false);
});

test("collectBindings dedupes signalk paths and ignores non-signalk", () => {
  const doc: ConfigDoc = {
    midl: "1.0.0",
    screens: [{
      id: "dash",
      elements: {
        a: { type: "single-value", bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } } },
        b: { type: "compass", bindings: { value: { kind: "signalk", path: "navigation.headingTrue" }, dir: { kind: "signalk", path: "navigation.speedOverGround" } } },
        c: { type: "text", bindings: { value: { kind: "const", value: "x" } } },
      },
      layout: { rows: 1, cols: 3, cells: [{ element: "a" }, { element: "b" }, { element: "c" }] },
    }],
  };
  expect(collectBindings(doc).sort()).toEqual(["navigation.headingTrue", "navigation.speedOverGround"]);
});
