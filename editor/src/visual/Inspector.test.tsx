// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import { MockDataProvider } from "@yey-boats/midl-web";
import type { EditorModel } from "../model";
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
