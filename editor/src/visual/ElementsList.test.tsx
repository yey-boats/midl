// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import type { EditorModel } from "../model";
import { ElementsList } from "./ElementsList";

afterEach(() => cleanup());

function makeModel(overrides: Partial<EditorModel> = {}): EditorModel {
  return {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {
      sog: { id: "sog", type: "single-value", name: "SOG",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } } },
      hdg: { id: "hdg", type: "gauge" },
    },
    layout: {
      rows: 2,
      cols: 2,
      cells: [{ element: "sog" }, { element: "hdg" }, {}, {}],
    },
    variants: [],
    ...overrides,
  };
}

test("renders elements-list container", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByTestId("elements-list")).toBeTruthy();
});

test("renders a row for each placed element with correct testid", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  // cell 0 has sog, cell 1 has hdg
  expect(getByTestId("element-row-0")).toBeTruthy();
  expect(getByTestId("element-row-1")).toBeTruthy();
});

test("row shows element type", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByTestId("element-row-0").textContent).toContain("single-value");
  expect(getByTestId("element-row-1").textContent).toContain("gauge");
});

test("row shows element name when available", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  // sog has name "SOG"
  expect(getByTestId("element-row-0").textContent).toContain("SOG");
});

test("row shows bound path when name is absent", () => {
  const model = makeModel({
    elements: {
      hdg: { id: "hdg", type: "gauge",
        bindings: { value: { kind: "signalk", path: "navigation.headingTrue" } } },
    },
    layout: { rows: 1, cols: 1, cells: [{ element: "hdg" }] },
  });
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByTestId("element-row-0").textContent).toContain("headingTrue");
});

test("clicking a row calls onSelectCell with the cell index", () => {
  const model = makeModel();
  const onSelectCell = vi.fn();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={onSelectCell} onRemoveElement={vi.fn()} />,
  );
  fireEvent.click(getByTestId("element-row-0"));
  expect(onSelectCell).toHaveBeenCalledWith(0);
});

test("clicking row 1 calls onSelectCell with 1", () => {
  const model = makeModel();
  const onSelectCell = vi.fn();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={onSelectCell} onRemoveElement={vi.fn()} />,
  );
  fireEvent.click(getByTestId("element-row-1"));
  expect(onSelectCell).toHaveBeenCalledWith(1);
});

test("each row has a remove button with correct testid", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByTestId("element-row-remove-0")).toBeTruthy();
  expect(getByTestId("element-row-remove-1")).toBeTruthy();
});

test("clicking remove button calls onRemoveElement with the element id", () => {
  const model = makeModel();
  const onRemoveElement = vi.fn();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={onRemoveElement} />,
  );
  fireEvent.click(getByTestId("element-row-remove-0"));
  expect(onRemoveElement).toHaveBeenCalledWith("sog");
});

test("clicking remove does not also call onSelectCell", () => {
  const model = makeModel();
  const onSelectCell = vi.fn();
  const onRemoveElement = vi.fn();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={onSelectCell} onRemoveElement={onRemoveElement} />,
  );
  fireEvent.click(getByTestId("element-row-remove-0"));
  expect(onSelectCell).not.toHaveBeenCalled();
});

test("shows empty state when no elements are placed", () => {
  const emptyModel = makeModel({
    elements: {},
    layout: { rows: 1, cols: 2, cells: [{}, {}] },
  });
  const { getByText } = render(
    <ElementsList model={emptyModel} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByText(/no elements yet/i)).toBeTruthy();
});

test("does not show empty state when elements are placed", () => {
  const model = makeModel();
  const { queryByText } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(queryByText(/no elements yet/i)).toBeNull();
});

test("non-grid layout shows empty state", () => {
  const flowModel: EditorModel = {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: { sog: { id: "sog", type: "single-value" } },
    layout: { flow: "row", children: [] },
    variants: [],
  };
  const { getByText } = render(
    <ElementsList model={flowModel} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByText(/no elements yet/i)).toBeTruthy();
});
