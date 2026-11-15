// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Trend history in the editor (docs/specs/2026-11-15-trend-history.md §5):
// inspector Window / Combine / Range controls, device lint (maxSeries,
// maxWindowS), lossless round-trip, and a preview that keeps one HistoryStore.
import { describe, test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, renderHook, act } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import { HistoryStore, MockDataProvider, type DataProvider, type ResolvedValue } from "@yey-boats/midl-web";
import type { EditorModel, EditorElement } from "./model";
import { Inspector } from "./visual/Inspector";
import { lintDeviceCapabilities } from "./device-lint";
import { parseMidl, serializeMidl } from "./midl-io";
import { usePreview } from "./usePreview";
import square480 from "../../schemas/gen/yb-midl-capabilities.square-480.json";
import round360 from "../../schemas/gen/yb-midl-capabilities.round-360.json";

globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as never;
globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as never;

afterEach(() => cleanup());

const SQUARE = square480 as unknown as Manifest;
const ROUND = round360 as unknown as Manifest;

const trend = (id: string, path: string, extra: Partial<EditorElement> = {}): EditorElement => ({
  id, type: "trend", name: id.toUpperCase(), bindings: { value: { kind: "signalk", path } }, ...extra,
});

function model(elements: Record<string, EditorElement>, cells: Array<{ element?: string }>, cols = 2): EditorModel {
  return {
    midl: "1.0.0", screenId: "s", title: "T", titleLoc: "id",
    elements, layout: { rows: Math.ceil(cells.length / cols), cols, cells }, variants: [],
  };
}

describe("Inspector: trend history controls", () => {
  const one = () => model({ t: trend("t", "environment.wind.speedTrue") }, [{ element: "t" }, {}], 2);

  function mount(m: EditorModel, onChange = vi.fn()) {
    const r = render(<Inspector model={m} selectedCell={0} manifest={SQUARE} provider={new MockDataProvider({})} onChange={onChange} />);
    return { ...r, onChange };
  }

  test("Window offers the manifest windows; default 10m; choosing one writes history.window", () => {
    const { getByTestId, onChange } = mount(one());
    const sel = getByTestId("history-window") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(["10m", "30m", "1h", "6h", "24h"]);
    expect(sel.value).toBe("10m");
    fireEvent.change(sel, { target: { value: "1h" } });
    expect(onChange.mock.calls[0][0].elements.t.history).toEqual({ window: "1h" });
  });

  test("choosing the defaults removes the keys (minimal document)", () => {
    const m = one();
    m.elements.t.history = { window: "1h", agg: "max" };
    const { getByTestId, onChange } = mount(m);
    fireEvent.change(getByTestId("history-agg"), { target: { value: "avg" } });
    expect(onChange.mock.calls[0][0].elements.t.history).toEqual({ window: "1h" });
    cleanup();
    const m2 = one();
    m2.elements.t.history = { window: "1h" };
    const r2 = mount(m2);
    fireEvent.change(r2.getByTestId("history-window"), { target: { value: "10m" } });
    expect(r2.onChange.mock.calls[0][0].elements.t.history).toBeUndefined();
  });

  test("Combine writes history.agg", () => {
    const { getByTestId, onChange } = mount(one());
    fireEvent.change(getByTestId("history-agg"), { target: { value: "max" } });
    expect(onChange.mock.calls[0][0].elements.t.history).toEqual({ agg: "max" });
  });

  test("an authored non-listed window (seconds) is shown", () => {
    const m = one();
    m.elements.t.history = { window: 5400 };
    const { getByTestId } = mount(m);
    expect((getByTestId("history-window") as HTMLSelectElement).value).toBe("90m");
  });

  test("Range auto/fixed toggles style.range", () => {
    const { getByTestId, queryByTestId, onChange } = mount(one());
    expect(queryByTestId("range-min")).toBeNull();
    fireEvent.change(getByTestId("trend-range-mode"), { target: { value: "fixed" } });
    expect(onChange.mock.calls[0][0].elements.t.style).toEqual({ range: [0, 30] });
    cleanup();
    const m = one();
    m.elements.t.style = { range: [0, 30] };
    const r = mount(m);
    expect((r.getByTestId("range-max") as HTMLInputElement).value).toBe("30");
    fireEvent.change(r.getByTestId("trend-range-mode"), { target: { value: "auto" } });
    expect(r.onChange.mock.calls[0][0].elements.t.style).toBeUndefined();
  });

  test("no history section for other element types", () => {
    const m = model({ v: { id: "v", type: "single-value", bindings: { value: { kind: "signalk", path: "x.y" } } } }, [{ element: "v" }, {}]);
    const { queryByTestId } = render(<Inspector model={m} selectedCell={0} manifest={SQUARE} provider={new MockDataProvider({})} onChange={vi.fn()} />);
    expect(queryByTestId("history-window")).toBeNull();
  });
});

describe("device lint: trend history", () => {
  test("series over maxSeries are flagged; tiles sharing a key count once", () => {
    const m = model({
      a: trend("a", "p.a"), b: trend("b", "p.b"), c: trend("c", "p.c"), a2: trend("a2", "p.a"),
    }, [{ element: "a" }, { element: "a2" }, { element: "b" }, { element: "c" }]);
    const issues = lintDeviceCapabilities(m, 4, ROUND).filter((i) => i.feature === "history-series");
    expect(issues.map((i) => i.elementId)).toEqual(["c"]);
    expect(lintDeviceCapabilities(m, 9, SQUARE).some((i) => i.feature === "history-series")).toBe(false);
  });

  test("a window over maxWindowS is flagged", () => {
    const m = model({ a: trend("a", "p.a", { history: { window: "25h" } }) }, [{ element: "a" }, {}]);
    const issues = lintDeviceCapabilities(m, 4, SQUARE);
    expect(issues.find((i) => i.feature === "history-window")?.elementId).toBe("a");
  });

  test("format/range/history are trend attrs: no drop warnings on the current manifests", () => {
    const m = model({ a: trend("a", "p.a", { format: { unit: "kn", decimals: 1 }, style: { range: [0, 30] }, history: { window: "1h", agg: "max" } }) }, [{ element: "a" }, {}]);
    expect(lintDeviceCapabilities(m, 4, SQUARE)).toEqual([]);
  });
});

describe("midl-io: history round-trips", () => {
  test("parse -> serialize keeps history", () => {
    const yaml = `midl: 1.0.0
screens:
  - id: s
    elements:
      t:
        type: trend
        history: { window: 30m, agg: min }
        bindings: { value: { kind: signalk, path: environment.depth.belowTransducer } }
    layout: { rows: 1, cols: 1, cells: [{ element: t }] }
`;
    const m = parseMidl(yaml);
    expect(m.elements.t.history).toEqual({ window: "30m", agg: "min" });
    expect(serializeMidl(m, "yaml")).toMatch(/history:\s*\n\s+window: 30m\s*\n\s+agg: min/);
  });
});

describe("usePreview keeps one HistoryStore", () => {
  test("a live preview draws a growing trend line (not a plain number)", async () => {
    let value = 5;
    const subs: Array<() => void> = [];
    const provider: DataProvider = {
      now: () => Date.now(),
      getValue: (): ResolvedValue => ({ value, sourceUnit: "m/s", stale: false, present: true }),
      subscribe: (_p, cb) => { subs.push(cb); return () => {}; },
    };
    let t = 1_000_000;
    const store = new HistoryStore({ now: () => t });
    const m = model({ t: trend("t", "environment.wind.speedTrue") }, [{ element: "t" }], 1);
    const { result } = renderHook(() => usePreview(m, provider, SQUARE, { theme: "night", className: "square-480", history: store }));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    for (let i = 0; i < 3; i++) {
      t += 5000; value += 1;
      await act(async () => { subs.forEach((cb) => cb()); await new Promise((r) => setTimeout(r, 30)); });
    }
    const svg = result.current.svg;
    const poly = /<polyline [^>]*points="([^"]+)"/.exec(svg);
    expect(poly).not.toBeNull();
    expect(poly![1].trim().split(/\s+/).length).toBe(4); // four 5 s buckets
  });
});
