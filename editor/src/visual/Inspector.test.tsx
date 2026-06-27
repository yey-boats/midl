// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import { MockDataProvider } from "@yey-boats/midl-web";
import type { EditorModel } from "../model";
import { parseMidl, serializeMidl } from "../midl-io";
import { Inspector } from "./Inspector";

afterEach(() => cleanup());

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "test",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3 }],
  elements: [
    { type: "single-value", bindings: ["value"] },
    { type: "gauge", bindings: ["value"] },
  ],
  sources: ["navigation.speedOverGround", "navigation.headingTrue"],
};

function makeGridModel(overrides: Partial<EditorModel> = {}): EditorModel {
  return {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {
      sog: {
        id: "sog",
        type: "single-value",
        name: "SOG",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        format: { unit: "kn", decimals: 1 },
      },
    },
    layout: {
      rows: 2,
      cols: 2,
      cells: [{ element: "sog" }, {}, {}, {}],
    },
    variants: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("changing path via path-picker updates the selected element's value binding path", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const picker = getByTestId("path-picker");
  fireEvent.change(picker, { target: { value: "navigation.headingTrue" } });

  expect(onChange).toHaveBeenCalledOnce();
  const nextModel: EditorModel = onChange.mock.calls[0][0];
  const binding = nextModel.elements["sog"]?.bindings?.["value"];
  expect(binding).toBeDefined();
  expect((binding as { kind: string; path: string }).path).toBe("navigation.headingTrue");
});

test("changing unit updates format.unit on the selected element", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const unitInput = getByTestId("unit-input");
  fireEvent.change(unitInput, { target: { value: "m/s" } });

  expect(onChange).toHaveBeenCalledOnce();
  const nextModel: EditorModel = onChange.mock.calls[0][0];
  expect(nextModel.elements["sog"]?.format?.unit).toBe("m/s");
});

test("changing decimals updates format.decimals on the selected element", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const decimalsInput = getByTestId("decimals-input");
  fireEvent.change(decimalsInput, { target: { value: "2" } });

  expect(onChange).toHaveBeenCalledOnce();
  const nextModel: EditorModel = onChange.mock.calls[0][0];
  expect(nextModel.elements["sog"]?.format?.decimals).toBe(2);
});

test("add-row increases cells.length by cols", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.click(getByTestId("add-row"));

  expect(onChange).toHaveBeenCalledOnce();
  const nextModel: EditorModel = onChange.mock.calls[0][0];
  const layout = nextModel.layout as { rows: number; cols: number; cells: unknown[] };
  // 2x2 → add row → 3x2 = 6 cells
  expect(layout.cells.length).toBe(6);
  expect(layout.rows).toBe(3);
});

test("remove-element drops the element and clears its cell", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.click(getByTestId("remove-element"));

  expect(onChange).toHaveBeenCalledOnce();
  const nextModel: EditorModel = onChange.mock.calls[0][0];
  // element "sog" should be gone
  expect(nextModel.elements["sog"]).toBeUndefined();
  // cell 0 should have no element reference
  const layout = nextModel.layout as { cells: Array<{ element?: string }> };
  expect(layout.cells[0].element).toBeUndefined();
});

test("shows empty state when no cell is selected", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  const { getByText } = render(
    <Inspector
      model={model}
      selectedCell={null}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  // Should show some empty-state text
  expect(getByText(/select a cell/i)).toBeTruthy();
});

// I2 — handlePathChange must produce kind:signalk even when current binding is not signalk
test("changing path when current value binding is kind:local produces a signalk binding with new path", () => {
  const model = makeGridModel({
    elements: {
      sog: {
        id: "sog",
        type: "single-value",
        name: "SOG",
        // start with a local binding, NOT signalk
        bindings: { value: { kind: "local", id: "my-local-source" } },
      },
    },
  });
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const picker = getByTestId("path-picker");
  fireEvent.change(picker, { target: { value: "navigation.headingTrue" } });

  expect(onChange).toHaveBeenCalledOnce();
  const nextModel: EditorModel = onChange.mock.calls[0][0];
  const binding = nextModel.elements["sog"]?.bindings?.["value"];
  expect(binding).toBeDefined();
  // Must be signalk — not local
  expect(binding!.kind).toBe("signalk");
  expect((binding as { kind: string; path: string }).path).toBe("navigation.headingTrue");
  // Must NOT carry the old `id` field from the local binding
  expect((binding as Record<string, unknown>)["id"]).toBeUndefined();
});

test("shows empty state when selected cell is empty (no element)", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  // Select cell 1 which is empty
  const { getByText } = render(
    <Inspector
      model={model}
      selectedCell={1}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  expect(getByText(/no element/i)).toBeTruthy();
});

// ── New inspector fields: span / sided / colorRole / scale / live-value ────────

test("changing span updates element.style.span and round-trips through serializeMidl→parseMidl", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("span-select"), { target: { value: "1x2" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.span).toBe("1x2");

  // Round-trip
  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.span).toBe("1x2");
});

test("toggling sided updates element.style.sided and round-trips", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.click(getByTestId("sided-toggle"));

  expect(onChange).toHaveBeenCalledOnce();
  // Default was undefined/false; after toggle it should be "P" (truthy)
  expect(captured.elements["sog"]?.style?.sided).toBeTruthy();

  // Round-trip
  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.sided).toBeTruthy();
});

test("changing colorRole updates element.style.colorRole and round-trips", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("color-role-select"), { target: { value: "warn" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.colorRole).toBe("warn");

  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.colorRole).toBe("warn");
});

test("changing scale updates element.style.scale and round-trips", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("scale-select"), { target: { value: "metric" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.scale).toBe("metric");

  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.scale).toBe("metric");
});

test("live value readout shows provider value when path has present data", () => {
  const model = makeGridModel(); // sog bound to navigation.speedOverGround
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 4.5 } });
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const readout = getByTestId("live-value-readout");
  expect(readout.textContent).toContain("4.5");
  // Green dot should be present
  const dot = getByTestId("live-dot");
  expect(dot).toBeTruthy();
});

test("live value readout formats the value using element format decimals and unit, not raw float", () => {
  // sog has format: { unit: "kn", decimals: 1 }
  // provider returns a raw float (e.g. 4.494657697249033)
  // Expected display: "4.5 kn" (toFixed(1) + unit via formatValue)
  const model = makeGridModel();
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 4.494657697249033 } });
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const readout = getByTestId("live-value-readout");
  // Must show formatted value with 1 decimal place and unit, NOT the raw float
  expect(readout.textContent).toContain("4.5 kn");
  expect(readout.textContent).not.toContain("4.494657697249033");
  // Green dot should be present
  const dot = getByTestId("live-dot");
  expect(dot).toBeTruthy();
});

test("live value readout shows stale/no-data state when path has no data", () => {
  const model = makeGridModel(); // sog bound to navigation.speedOverGround
  const provider = new MockDataProvider({}); // no data
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const readout = getByTestId("live-value-readout");
  // Should show "no data" or "—" when present is false
  expect(readout.textContent).toMatch(/no data|—/i);
});

// ── Span → colSpan/rowSpan on grid cell ───────────────────────────────────────

test("changing span to 2x1 sets colSpan=2, rowSpan=1 on the selected grid cell", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("span-select"), { target: { value: "2x1" } });

  expect(onChange).toHaveBeenCalledOnce();
  const layout = captured.layout as { rows: number; cols: number; cells: Array<{ element?: string; colSpan?: number; rowSpan?: number }> };
  expect(layout.cells[0].colSpan).toBe(2);
  // rowSpan 1 is default and should not be stored
  expect(layout.cells[0].rowSpan).toBeUndefined();
});

test("changing span to 1x2 sets rowSpan=2, colSpan omitted (default 1) on the selected grid cell", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("span-select"), { target: { value: "1x2" } });

  expect(onChange).toHaveBeenCalledOnce();
  const layout = captured.layout as { rows: number; cols: number; cells: Array<{ element?: string; colSpan?: number; rowSpan?: number }> };
  expect(layout.cells[0].colSpan).toBeUndefined();
  expect(layout.cells[0].rowSpan).toBe(2);
});

test("changing span to 2x2 sets colSpan=2 and rowSpan=2 on the selected grid cell", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("span-select"), { target: { value: "2x2" } });

  expect(onChange).toHaveBeenCalledOnce();
  const layout = captured.layout as { rows: number; cols: number; cells: Array<{ element?: string; colSpan?: number; rowSpan?: number }> };
  expect(layout.cells[0].colSpan).toBe(2);
  expect(layout.cells[0].rowSpan).toBe(2);
});

test("colSpan/rowSpan round-trip through serializeMidl → parseMidl", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("span-select"), { target: { value: "2x2" } });

  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  const layout = reparsed.layout as { rows: number; cols: number; cells: Array<{ element?: string; colSpan?: number; rowSpan?: number }> };
  expect(layout.cells[0].colSpan).toBe(2);
  expect(layout.cells[0].rowSpan).toBe(2);
});

// ── setCellSpan integration: Bug 1 (overflow) and Bug 2 (stale span display) ──

test("setting Span=2x1 on a full 2×2 grid produces a valid model (no overflow) and select shows '2x1'", () => {
  // Full 2×2 grid: 4 cells. Setting colSpan=2 on cell 0 must remove cell 1 (covered).
  const fullModel: EditorModel = {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {
      sog: { id: "sog", type: "single-value", name: "SOG",
             bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
             format: { unit: "kn", decimals: 1 } },
      hdg: { id: "hdg", type: "single-value" },
      dtw: { id: "dtw", type: "single-value" },
      btw: { id: "btw", type: "single-value" },
    },
    layout: {
      rows: 2,
      cols: 2,
      cells: [{ element: "sog" }, { element: "hdg" }, { element: "dtw" }, { element: "btw" }],
    },
    variants: [],
  };
  const provider = new MockDataProvider({});
  let captured: EditorModel = fullModel;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={fullModel}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("span-select"), { target: { value: "2x1" } });

  expect(onChange).toHaveBeenCalledOnce();
  const layout = captured.layout as { rows: number; cols: number; cells: Array<{ element?: string; colSpan?: number }> };
  // Must have 3 cells (one removed — the covered slot 1)
  expect(layout.cells.length).toBe(3);
  expect(layout.cells[0].colSpan).toBe(2);

  // Serialization must NOT throw (no overflow error)
  expect(() => serializeMidl(captured, "yaml")).not.toThrow();

  // Re-render with captured model to verify select shows "2x1"
  cleanup();
  const { getByTestId: getByTestId2 } = render(
    <Inspector
      model={captured}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );
  const spanSelect = getByTestId2("span-select") as HTMLSelectElement;
  expect(spanSelect.value).toBe("2x1");
});

test("loading a model whose cell already has colSpan:2 shows the span select as '2x1' (not '1x1')", () => {
  // Simulate a model that was loaded from a MIDL file with a spanned cell.
  // parseMidl sets colSpan on the GridCell but NOT on element.style.span.
  // The Inspector must derive currentSpan from the GridCell, not element.style.span.
  const spannedModel: EditorModel = {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {
      sog: {
        id: "sog",
        type: "single-value",
        name: "SOG",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        format: { unit: "kn", decimals: 1 },
        // Note: NO style.span set — this is what parseMidl produces
      },
    },
    layout: {
      rows: 2,
      cols: 2,
      cells: [
        { element: "sog", colSpan: 2 }, // colSpan from parseMidl
        {},
        {},
      ],
    },
    variants: [],
  };
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={spannedModel}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const spanSelect = getByTestId("span-select") as HTMLSelectElement;
  // Must show "2x1" — derived from cell.colSpan=2, cell.rowSpan=undefined→1
  expect(spanSelect.value).toBe("2x1");
});

// ── Fix 2b: Browse data callback wiring ───────────────────────────────────────

test("clicking 'Browse data' in PathPicker calls onBrowseData on Inspector", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();
  const onBrowseData = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
      onBrowseData={onBrowseData}
    />,
  );

  fireEvent.click(getByTestId("path-picker-browse"));
  expect(onBrowseData).toHaveBeenCalledOnce();
});

test("Inspector renders PathPicker without Browse button when onBrowseData is not provided", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});

  const { queryByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  // No browse button when onBrowseData is absent
  expect(queryByTestId("path-picker-browse")).toBeNull();
});

// ── Fix 3: Size select ────────────────────────────────────────────────────────

test("Inspector renders a size-select in the APPEARANCE section", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  expect(getByTestId("size-select")).toBeTruthy();
});

test("size-select options include manifest.fonts values when present", () => {
  const manifestWithFonts: typeof MANIFEST = {
    ...MANIFEST,
    fonts: [14, 20, 28, 48],
  };
  const model = makeGridModel();
  const provider = new MockDataProvider({});

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={manifestWithFonts}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  const select = getByTestId("size-select") as HTMLSelectElement;
  const values = Array.from(select.options).map((o) => Number(o.value));
  expect(values).toContain(14);
  expect(values).toContain(20);
  expect(values).toContain(28);
  expect(values).toContain(48);
});

test("size-select defaults to fallback [14,20,28,48] when manifest has no fonts", () => {
  const model = makeGridModel(); // MANIFEST has no fonts field
  const provider = new MockDataProvider({});

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  const select = getByTestId("size-select") as HTMLSelectElement;
  const values = Array.from(select.options).map((o) => Number(o.value));
  expect(values).toEqual([14, 20, 28, 48]);
});

test("changing size-select updates element.style.size with a number", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("size-select"), { target: { value: "28" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.size).toBe(28);
});

test("element.style.size round-trips through serializeMidl → parseMidl", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("size-select"), { target: { value: "48" } });

  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.size).toBe(48);
});

test("size-select shows element's current style.size as selected value", () => {
  const model = makeGridModel({
    elements: {
      sog: {
        id: "sog",
        type: "single-value",
        name: "SOG",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        format: { unit: "kn", decimals: 1 },
        style: { size: 28 },
      },
    },
  });
  const provider = new MockDataProvider({});

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  const select = getByTestId("size-select") as HTMLSelectElement;
  expect(Number(select.value)).toBe(28);
});

// ── Part 4: live-readout ────────────────────────────────────────────────────────

test("inspector renders live-readout container in the binding section", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 4.5 } });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  expect(getByTestId("live-readout")).toBeTruthy();
});

test("live-readout shows formatted value when path has present data", () => {
  const model = makeGridModel(); // sog bound to navigation.speedOverGround, format: unit kn, decimals 1
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 4.494657697249033 } });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  const readout = getByTestId("live-readout");
  // Must show formatted value (1 decimal) with unit, not raw float
  expect(readout.textContent).toContain("4.5");
  expect(readout.textContent).toContain("kn");
});

test("live-readout shows no-data state when path has no data", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  const readout = getByTestId("live-readout");
  expect(readout.textContent).toMatch(/no data|—/i);
});

test("live-readout shows stale state when data is stale", () => {
  const model = makeGridModel();
  // Custom provider that returns stale:true
  const provider = {
    getValue: () => ({ value: 3.0, stale: true, present: true, updatedAt: 0 }),
    subscribe: () => () => {},
    now: () => 0,
  };

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  // When stale, the readout should show "stale" or the value with an amber/dim dot
  // The live-readout must exist regardless
  const readout = getByTestId("live-readout");
  expect(readout).toBeTruthy();
  expect(readout.textContent).toMatch(/stale/i);
});
