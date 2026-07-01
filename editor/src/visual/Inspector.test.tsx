// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import { MockDataProvider, renderDashboardSvg } from "@yey-boats/midl-web";
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

test("the redundant grid sizing cluster (add/remove row/col) is no longer in the Inspector", () => {
  // #6: grid sizing lives in the Layout tab (steppers + presets) in MidlEditor.
  // The Inspector must not duplicate those raw buttons.
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();

  const { queryByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  expect(queryByTestId("add-row")).toBeNull();
  expect(queryByTestId("add-col")).toBeNull();
  expect(queryByTestId("remove-row")).toBeNull();
  expect(queryByTestId("remove-col")).toBeNull();
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

test("toggling sided writes format.side (not style.sided) so the renderer reads it", () => {
  // The renderer checks el.format?.side (model.ts: sideEnabled(el.format?.side)).
  // The old code incorrectly wrote style.sided; the toggle must write format.side.
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
  // The renderer reads format.side; it should be set after toggle.
  expect(captured.elements["sog"]?.format?.side).toBeTruthy();
  // style.sided must NOT be set (old buggy location).
  expect(captured.elements["sog"]?.style?.sided).toBeUndefined();

  // Round-trip
  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.format?.side).toBeTruthy();
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

test("size-select options are the role tokens S / M / L / XL / Fill", () => {
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

  const select = getByTestId("size-select") as HTMLSelectElement;
  const values = Array.from(select.options).map((o) => o.value);
  expect(values).toEqual(["S", "M", "L", "XL", "Fill"]);
});

test("size-select defaults to 'L' when element has no explicit size", () => {
  const model = makeGridModel(); // no style.size set
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
  expect(select.value).toBe("L");
});

test("changing size-select writes the role string to element.style.size", () => {
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

  fireEvent.change(getByTestId("size-select"), { target: { value: "XL" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.size).toBe("XL");
});

test("element.style.size role token round-trips through serializeMidl → parseMidl", () => {
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

  fireEvent.change(getByTestId("size-select"), { target: { value: "Fill" } });

  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.size).toBe("Fill");
});

test("size-select shows element's current style.size role as selected value", () => {
  const model = makeGridModel({
    elements: {
      sog: {
        id: "sog",
        type: "single-value",
        name: "SOG",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        format: { unit: "kn", decimals: 1 },
        style: { size: "XL" },
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
  expect(select.value).toBe("XL");
});

test("size-select shows 'L' (default) when element has a legacy numeric style.size", () => {
  // Legacy numeric sizes fall back to 'L' in the role select.
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
  // Legacy number 28 has no matching role — Inspector shows 'L' as default.
  expect(select.value).toBe("L");
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

// ── Size role → SVG font-size integration ────────────────────────────────────

const MANIFEST_FULL: Manifest = {
  midl: "1.0.0",
  board: "test",
  classes: [{ id: "square-480", width: 480, height: 480, maxTiles: 4, maxDepth: 3 }],
  elements: [{ type: "single-value", bindings: ["value"] }],
  sources: ["signalk"],
} as unknown as Manifest;

function heroFontSizeFromSvg(svg: string): number {
  // Extract the LARGEST font-size attribute from the SVG (the hero number, not the label).
  const matches = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
  if (matches.length === 0) throw new Error(`No font-size found in SVG: ${svg.slice(0, 300)}`);
  return Math.max(...matches);
}

function buildDocWithSize(sizeRole: string): string {
  return `
midl: "1.0.0"
screens:
  - id: main
    elements:
      sog:
        type: single-value
        name: SOG
        style:
          size: ${sizeRole}
        bindings: { value: { kind: signalk, path: navigation.speedOverGround } }
    layout:
      rows: 1
      cols: 1
      cells:
        - { element: sog }
`;
}

test("changing size role S→Fill produces a larger font-size in the rendered SVG preview", () => {
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 6 } });
  const viewport = { x: 0, y: 0, w: 480, h: 480 };

  const svgS = renderDashboardSvg(buildDocWithSize("S"), MANIFEST_FULL, "square-480", viewport, provider);
  const svgFill = renderDashboardSvg(buildDocWithSize("Fill"), MANIFEST_FULL, "square-480", viewport, provider);

  expect(svgS.ok).toBe(true);
  expect(svgFill.ok).toBe(true);

  const fsS = heroFontSizeFromSvg(svgS.svg);
  const fsFill = heroFontSizeFromSvg(svgFill.svg);

  expect(fsFill).toBeGreaterThan(fsS);
});

test("Fill size role in a 480x480 single-cell produces font-size >= 40% of cell height (192px)", () => {
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 6 } });
  const viewport = { x: 0, y: 0, w: 480, h: 480 };

  const result = renderDashboardSvg(buildDocWithSize("Fill"), MANIFEST_FULL, "square-480", viewport, provider);
  expect(result.ok).toBe(true);

  const fs = heroFontSizeFromSvg(result.svg);
  // 40% of 480 = 192
  expect(fs).toBeGreaterThanOrEqual(192);
});

// ── RC4: LIMITS section (range + zones) ──────────────────────────────────────

function makeGaugeModel(overrides: Partial<EditorModel> = {}): EditorModel {
  return {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {
      soc: {
        id: "soc",
        type: "gauge",
        name: "State of Charge",
        bindings: { value: { kind: "signalk", path: "electrical.batteries.0.capacity.stateOfCharge" } },
        format: { unit: "%", decimals: 0 },
      },
    },
    layout: {
      rows: 2,
      cols: 2,
      cells: [{ element: "soc" }, {}, {}, {}],
    },
    variants: [],
    ...overrides,
  };
}

test("LIMITS section is shown for gauge element type", () => {
  const model = makeGaugeModel();
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

  // range inputs must exist
  expect(getByTestId("range-min")).toBeTruthy();
  expect(getByTestId("range-max")).toBeTruthy();
  // zone-add button must exist
  expect(getByTestId("zone-add")).toBeTruthy();
});

test("LIMITS section is shown for bar element type", () => {
  const model = makeGaugeModel({
    elements: {
      soc: {
        id: "soc",
        type: "bar",
        name: "Fuel Level",
        bindings: { value: { kind: "signalk", path: "tanks.fuel.0.currentLevel" } },
        format: { unit: "%", decimals: 0 },
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

  expect(getByTestId("range-min")).toBeTruthy();
  expect(getByTestId("range-max")).toBeTruthy();
});

test("LIMITS section is NOT shown for single-value element type", () => {
  const model = makeGridModel(); // single-value
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

  expect(queryByTestId("range-min")).toBeNull();
  expect(queryByTestId("range-max")).toBeNull();
  expect(queryByTestId("zone-add")).toBeNull();
});

test("changing range-min writes style.range=[min, current-max]", () => {
  const model = makeGaugeModel({
    elements: {
      soc: {
        id: "soc",
        type: "gauge",
        name: "SOC",
        bindings: { value: { kind: "signalk", path: "electrical.batteries.0.capacity.stateOfCharge" } },
        format: { unit: "%", decimals: 0 },
        style: { range: [0, 100] },
      },
    },
  });
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

  fireEvent.change(getByTestId("range-min"), { target: { value: "-10" } });

  expect(onChange).toHaveBeenCalledOnce();
  const range = captured.elements["soc"]?.style?.range as [number, number] | undefined;
  expect(range).toEqual([-10, 100]);
});

test("changing range-max writes style.range=[current-min, max]", () => {
  const model = makeGaugeModel({
    elements: {
      soc: {
        id: "soc",
        type: "gauge",
        name: "SOC",
        bindings: { value: { kind: "signalk", path: "electrical.batteries.0.capacity.stateOfCharge" } },
        format: { unit: "%", decimals: 0 },
        style: { range: [0, 100] },
      },
    },
  });
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

  fireEvent.change(getByTestId("range-max"), { target: { value: "120" } });

  expect(onChange).toHaveBeenCalledOnce();
  const range = captured.elements["soc"]?.style?.range as [number, number] | undefined;
  expect(range).toEqual([0, 120]);
});

test("zone-add button adds a zone entry to style.zones", () => {
  const model = makeGaugeModel();
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

  fireEvent.click(getByTestId("zone-add"));

  expect(onChange).toHaveBeenCalledOnce();
  const zones = captured.elements["soc"]?.style?.zones as Array<{ lt: number; color: string }> | undefined;
  expect(Array.isArray(zones)).toBe(true);
  expect(zones!.length).toBe(1);
  expect(typeof zones![0]!.lt).toBe("number");
  expect(typeof zones![0]!.color).toBe("string");
});

test("range and zones round-trip through serializeMidl → parseMidl", () => {
  const model = makeGaugeModel({
    elements: {
      soc: {
        id: "soc",
        type: "gauge",
        name: "SOC",
        bindings: { value: { kind: "signalk", path: "electrical.batteries.0.capacity.stateOfCharge" } },
        format: { unit: "%", decimals: 0 },
        style: {
          range: [0, 100],
          zones: [{ lt: 20, color: "warn" }, { lt: 50, color: "#e0a020" }, { lt: 101, color: "good" }],
        },
      },
    },
  });

  const yaml = serializeMidl(model, "yaml");
  const reparsed = parseMidl(yaml);

  const range = reparsed.elements["soc"]?.style?.range as [number, number] | undefined;
  expect(range).toEqual([0, 100]);

  const zones = reparsed.elements["soc"]?.style?.zones as Array<{ lt: number; color: string }> | undefined;
  expect(Array.isArray(zones)).toBe(true);
  expect(zones!.length).toBe(3);
  expect(zones![0]).toEqual({ lt: 20, color: "warn" });
  expect(zones![1]).toEqual({ lt: 50, color: "#e0a020" });
  expect(zones![2]).toEqual({ lt: 101, color: "good" });
});

// ── B1/B2/B3: action, secondary binding, dial marker authoring ────────────────

const DIAL_MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "test",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3 }],
  elements: [
    { type: "windrose", bindings: ["value", "dir"], glyphs: ["triangle", "diamond"] },
    { type: "button", bindings: ["value"] },
  ],
  sources: ["environment.wind.speedApparent", "environment.wind.angleApparent", "steering.autopilot.state"],
};

function makeButtonModel(): EditorModel {
  return {
    midl: "1.0.0", screenId: "screen", title: "T", titleLoc: "id",
    elements: { eng: { id: "eng", type: "button", name: "AUTO" } },
    layout: { rows: 1, cols: 1, cells: [{ element: "eng" }] },
    variants: [],
  };
}

function makeWindroseModel(): EditorModel {
  return {
    midl: "1.0.0", screenId: "screen", title: "T", titleLoc: "id",
    elements: {
      rose: {
        id: "rose", type: "windrose", name: "WIND",
        bindings: { value: { kind: "signalk", path: "environment.wind.speedApparent" } },
      },
    },
    layout: { rows: 1, cols: 1, cells: [{ element: "rose" }] },
    variants: [],
  };
}

test("B1: adding an action then setting kind/target/value writes element.action", () => {
  const model = makeButtonModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();
  const { getByTestId, rerender } = render(
    <Inspector model={model} selectedCell={0} manifest={DIAL_MANIFEST} provider={provider} onChange={onChange} />,
  );

  fireEvent.click(getByTestId("action-add"));
  let next: EditorModel = onChange.mock.calls.at(-1)![0];
  expect((next.elements["eng"]!.action as { kind: string }).kind).toBe("put");

  rerender(<Inspector model={next} selectedCell={0} manifest={DIAL_MANIFEST} provider={provider} onChange={onChange} />);
  fireEvent.change(getByTestId("action-target"), { target: { value: "steering.autopilot.state" } });
  next = onChange.mock.calls.at(-1)![0];
  rerender(<Inspector model={next} selectedCell={0} manifest={DIAL_MANIFEST} provider={provider} onChange={onChange} />);
  fireEvent.change(getByTestId("action-value"), { target: { value: "auto" } });
  next = onChange.mock.calls.at(-1)![0];

  const action = next.elements["eng"]!.action as { kind: string; target?: string; value?: unknown };
  expect(action.target).toBe("steering.autopilot.state");
  expect(action.value).toBe("auto");
});

test("B1: action round-trips through serialize→parse", () => {
  const model = makeButtonModel();
  model.elements["eng"]!.action = { kind: "put", target: "steering.autopilot.state", value: "auto" };
  const reparsed = parseMidl(serializeMidl(model, "yaml"));
  expect(reparsed.elements["eng"]!.action).toEqual({ kind: "put", target: "steering.autopilot.state", value: "auto" });
});

test("B2: dir binding picker is shown for windrose and writes bindings.dir", () => {
  const model = makeWindroseModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();
  const { getByTestId } = render(
    <Inspector model={model} selectedCell={0} manifest={DIAL_MANIFEST} provider={provider} onChange={onChange} />,
  );

  const dirSection = getByTestId("binding-dir");
  expect(dirSection).toBeDefined();
  const picker = dirSection.querySelector("[data-testid='path-picker']") as HTMLElement;
  fireEvent.change(picker, { target: { value: "environment.wind.angleApparent" } });

  const next: EditorModel = onChange.mock.calls.at(-1)![0];
  const dir = next.elements["rose"]!.bindings?.["dir"];
  expect((dir as { kind: string; path: string }).path).toBe("environment.wind.angleApparent");
});

test("B3: adding a marker and a sector writes markers[] and style.sectors[], and round-trips", () => {
  const model = makeWindroseModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();
  const { getByTestId, rerender } = render(
    <Inspector model={model} selectedCell={0} manifest={DIAL_MANIFEST} provider={provider} onChange={onChange} />,
  );

  fireEvent.click(getByTestId("marker-add"));
  let next: EditorModel = onChange.mock.calls.at(-1)![0];
  expect((next.elements["rose"]!.markers as unknown[]).length).toBe(1);

  rerender(<Inspector model={next} selectedCell={0} manifest={DIAL_MANIFEST} provider={provider} onChange={onChange} />);
  fireEvent.click(getByTestId("sector-add"));
  next = onChange.mock.calls.at(-1)![0];
  expect((next.elements["rose"]!.style?.sectors as unknown[]).length).toBe(1);

  const reparsed = parseMidl(serializeMidl(next, "yaml"));
  expect((reparsed.elements["rose"]!.markers as unknown[]).length).toBe(1);
  expect((reparsed.elements["rose"]!.style?.sectors as unknown[]).length).toBe(1);
});

// ── #3: element-label testid is "label-input" (not the colliding "name-input") ──

test("the Inspector element-label input uses data-testid=label-input and edits element.name", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId, queryByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  // The colliding testid must be gone from the Inspector.
  expect(queryByTestId("name-input")).toBeNull();

  const labelInput = getByTestId("label-input") as HTMLInputElement;
  expect(labelInput.value).toBe("SOG");
  fireEvent.change(labelInput, { target: { value: "Boat Speed" } });
  expect(captured.elements["sog"]?.name).toBe("Boat Speed");
});

// ── #4: element Type is a real, visible select wired to handleTypeChange ──────

test("type-select is visible and changing it updates element.type", () => {
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

  const select = getByTestId("type-select") as HTMLSelectElement;
  // Options mirror the manifest element types.
  const values = Array.from(select.options).map((o) => o.value);
  expect(values).toEqual(["single-value", "gauge"]);
  expect(select.value).toBe("single-value");

  fireEvent.change(select, { target: { value: "gauge" } });
  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.type).toBe("gauge");
});

// ── #11: inline "Pick a data path" CTA for unbound binding-requiring elements ──

test("bind-cta is shown for an unbound binding-requiring element and calls onBrowseData", () => {
  const model = makeGridModel({
    elements: {
      sog: { id: "sog", type: "single-value", name: "SOG" }, // no value binding
    },
  });
  const provider = new MockDataProvider({});
  const onBrowseData = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
      onBrowseData={onBrowseData}
    />,
  );

  const cta = getByTestId("bind-cta");
  fireEvent.click(cta);
  expect(onBrowseData).toHaveBeenCalledOnce();
});

test("bind-cta is hidden once the element has a value path", () => {
  const model = makeGridModel(); // sog is bound to navigation.speedOverGround
  const provider = new MockDataProvider({});

  const { queryByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
      onBrowseData={vi.fn()}
    />,
  );

  expect(queryByTestId("bind-cta")).toBeNull();
});

// ── #12: rebinding refreshes a stale auto-derived label & unit ────────────────

test("rebinding updates an auto-derived label & unit to the new path's defaults", () => {
  // sog's name/unit equal the OLD path's catalog defaults ("Speed Over Ground" / "kn"),
  // so rebinding to headingTrue should refresh them to "Heading True" / "deg".
  const model = makeGridModel({
    elements: {
      sog: {
        id: "sog",
        type: "single-value",
        name: "Speed Over Ground",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        format: { unit: "kn", decimals: 1 },
      },
    },
  });
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

  fireEvent.change(getByTestId("path-picker"), { target: { value: "navigation.headingTrue" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.name).toBe("Heading True");
  expect(captured.elements["sog"]?.format?.unit).toBe("deg");
});

test("rebinding never clobbers a hand-customized label", () => {
  const model = makeGridModel({
    elements: {
      sog: {
        id: "sog",
        type: "single-value",
        name: "My Boat Speed", // custom, NOT the catalog default
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        format: { unit: "kn", decimals: 1 },
      },
    },
  });
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

  fireEvent.change(getByTestId("path-picker"), { target: { value: "navigation.headingTrue" } });

  // Custom label preserved.
  expect(captured.elements["sog"]?.name).toBe("My Boat Speed");
});
