// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import { MockDataProvider, collectBindings } from "../src/data";
import type { ConfigDoc } from "@yey-boats/midl";

// SignalK-transport providers are platform-side; the generic renderer ships only
// MockDataProvider + the generic DataProvider seam. The SignalKDataProvider
// implementation + its freshness/subscribe tests live in the platform repo.

test("MockDataProvider resolves signalk paths and const; missing is no-data", () => {
  const p = new MockDataProvider({ "navigation.speedOverGround": { value: 4.0, sourceUnit: "m/s" } });
  expect(p.getValue({ kind: "signalk", path: "navigation.speedOverGround" })).toMatchObject({ value: 4.0, present: true, stale: false });
  expect(p.getValue({ kind: "const", value: 42 })).toMatchObject({ value: 42, present: true });
  expect(p.getValue({ kind: "signalk", path: "missing" }).present).toBe(false);
  expect(p.getValue({ kind: "local", id: "gpio1" }).present).toBe(false);
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
