// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import type { EditorModel } from "../model";
import { GridCanvas } from "./GridCanvas";

afterEach(() => cleanup());

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeGridModel(rows: number, cols: number, cellElements: (string | undefined)[] = []): EditorModel {
  const cells = Array.from({ length: rows * cols }, (_, i) => {
    const el = cellElements[i];
    return el ? { element: el } : {};
  });
  return {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {},
    layout: { rows, cols, cells },
    variants: [],
  };
}

function makeFlowModel(): EditorModel {
  return {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {},
    layout: { flow: "row", children: [] },
    variants: [],
  };
}

const VIEWPORT = { w: 200, h: 100 };

// ── Tests ─────────────────────────────────────────────────────────────────────

test("a 2x2 grid renders exactly 4 cells with correct % geometry", () => {
  const model = makeGridModel(2, 2);
  const onSelect = vi.fn();

  const { getAllByTestId } = render(
    <GridCanvas model={model} viewport={VIEWPORT} selected={null} onSelect={onSelect} />,
  );

  const cells = [
    getAllByTestId("cell-0")[0],
    getAllByTestId("cell-1")[0],
    getAllByTestId("cell-2")[0],
    getAllByTestId("cell-3")[0],
  ];

  expect(cells).toHaveLength(4);

  // 2 cols → each cell is 50% wide; 2 rows → 50% tall
  // cell-0: row 0, col 0 → left 0%, top 0%, width 50%, height 50%
  const s0 = cells[0].style;
  expect(s0.left).toBe("0%");
  expect(s0.top).toBe("0%");
  expect(s0.width).toBe("50%");
  expect(s0.height).toBe("50%");

  // cell-1: row 0, col 1 → left 50%, top 0%
  const s1 = cells[1].style;
  expect(s1.left).toBe("50%");
  expect(s1.top).toBe("0%");
  expect(s1.width).toBe("50%");
  expect(s1.height).toBe("50%");

  // cell-2: row 1, col 0 → left 0%, top 50%
  const s2 = cells[2].style;
  expect(s2.left).toBe("0%");
  expect(s2.top).toBe("50%");

  // cell-3: row 1, col 1 → left 50%, top 50%
  const s3 = cells[3].style;
  expect(s3.left).toBe("50%");
  expect(s3.top).toBe("50%");
});

test("clicking cell-2 calls onSelect(2)", () => {
  const model = makeGridModel(2, 2);
  const onSelect = vi.fn();

  const { getByTestId } = render(
    <GridCanvas model={model} viewport={VIEWPORT} selected={null} onSelect={onSelect} />,
  );

  fireEvent.click(getByTestId("cell-2"));
  expect(onSelect).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledWith(2);
});

test("selected cell has aria-selected=true; others do not", () => {
  const model = makeGridModel(2, 2);
  const onSelect = vi.fn();

  const { getByTestId } = render(
    <GridCanvas model={model} viewport={VIEWPORT} selected={1} onSelect={onSelect} />,
  );

  expect(getByTestId("cell-1").getAttribute("aria-selected")).toBe("true");
  expect(getByTestId("cell-0").getAttribute("aria-selected")).toBe("false");
  expect(getByTestId("cell-2").getAttribute("aria-selected")).toBe("false");
});

test("filled cell shows its element label; empty cell shows the 'Empty' slot affordance", () => {
  const model = makeGridModel(1, 2, ["sog", undefined]);

  const { getByTestId } = render(
    <GridCanvas model={model} viewport={VIEWPORT} selected={null} onSelect={vi.fn()} />,
  );

  // Filled cell shows a persistent name chip (label = element name||type||id).
  expect(getByTestId("cell-0").textContent).toContain("sog");
  expect(getByTestId("cell-label-0").textContent).toBe("sog");
  // Empty cell shows a clickable slot affordance ("＋ Add element"), not blank
  // space. The body carries the shared `.grid-empty` class for CSS styling.
  const empty1 = getByTestId("cell-empty-1");
  expect(empty1).toBeTruthy();
  expect(empty1.className).toContain("grid-empty");
  expect(getByTestId("cell-1").textContent).toContain("Add element");
});

test("an empty cell still calls onSelect when clicked (affordance is clickable)", () => {
  const model = makeGridModel(1, 2, [undefined, undefined]);
  const onSelect = vi.fn();
  const { getByTestId } = render(
    <GridCanvas model={model} viewport={VIEWPORT} selected={null} onSelect={onSelect} />,
  );
  fireEvent.click(getByTestId("cell-1"));
  expect(onSelect).toHaveBeenCalledWith(1);
});

test("selected cell carries the is-selected class (CSS selection ring); empty selected cell also marks its body", () => {
  // cell-0 filled + selected, cell-1 empty + selected (rendered separately).
  const filled = makeGridModel(1, 1, ["sog"]);
  const { getByTestId: getFilled } = render(
    <GridCanvas model={filled} viewport={VIEWPORT} selected={0} onSelect={vi.fn()} />,
  );
  expect(getFilled("cell-0").className).toContain("is-selected");
  cleanup();

  const empty = makeGridModel(1, 1, [undefined]);
  const { getByTestId: getEmpty } = render(
    <GridCanvas model={empty} viewport={VIEWPORT} selected={0} onSelect={vi.fn()} />,
  );
  expect(getEmpty("cell-0").className).toContain("is-selected");
  // The empty body also gets is-selected so the ring styling can target it.
  expect(getEmpty("cell-empty-0").className).toContain("is-selected");
  expect(getEmpty("cell-empty-0").className).toContain("grid-empty");
});

test("filled cell prefers the element's friendly name over its id", () => {
  const model: EditorModel = {
    midl: "1.0.0", screenId: "s", title: "T", titleLoc: "id",
    elements: { "abc-uuid": { id: "abc-uuid", type: "single-value", name: "Speed" } },
    layout: { rows: 1, cols: 1, cells: [{ element: "abc-uuid" }] },
    variants: [],
  };
  const { getByTestId } = render(
    <GridCanvas model={model} viewport={VIEWPORT} selected={0} onSelect={vi.fn()} />,
  );
  expect(getByTestId("cell-label-0").textContent).toBe("Speed");
  expect(getByTestId("cell-0").textContent).not.toContain("abc-uuid");
});

test("flow layout model renders no editable cells and tags its layout kind", () => {
  const model = makeFlowModel();
  const onSelect = vi.fn();

  const { container, queryByTestId } = render(
    <GridCanvas model={model} viewport={VIEWPORT} selected={null} onSelect={onSelect} />,
  );

  // Non-grid layouts render no interactive cells (the canvas banner explains why);
  // the kind is exposed for the host to drive its source-mode notice.
  const canvas = container.querySelector("[data-component='grid-canvas']");
  expect(canvas?.getAttribute("data-layout-kind")).toBe("flow");
  expect(queryByTestId("cell-0")).toBeNull();
});

// ── Span: colSpan/rowSpan rendering ──────────────────────────────────────────

test("cell with colSpan=2 in a 2-col grid occupies 100% width", () => {
  // 2×2 grid, cell-0 has colSpan=2 → should render at width 100%
  const cells = [{ element: "sog", colSpan: 2 }, {}, {}, {}];
  const model: EditorModel = {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {},
    layout: { rows: 2, cols: 2, cells },
    variants: [],
  };

  const { getByTestId } = render(
    <GridCanvas model={model} viewport={VIEWPORT} selected={null} onSelect={vi.fn()} />,
  );

  // cell-0 colSpan=2: width = 2 * (100/2) = 100%
  expect(getByTestId("cell-0").style.width).toBe("100%");
  // cell-1 (no span): width = 50%
  expect(getByTestId("cell-1").style.width).toBe("50%");
});

test("cell with rowSpan=2 in a 2-row grid occupies 100% height", () => {
  // 2×2 grid, cell-0 has rowSpan=2 → should render at height 100%
  const cells = [{ element: "sog", rowSpan: 2 }, {}, {}, {}];
  const model: EditorModel = {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {},
    layout: { rows: 2, cols: 2, cells },
    variants: [],
  };

  const { getByTestId } = render(
    <GridCanvas model={model} viewport={VIEWPORT} selected={null} onSelect={vi.fn()} />,
  );

  // cell-0 rowSpan=2: height = 2 * (100/2) = 100%
  expect(getByTestId("cell-0").style.height).toBe("100%");
  expect(getByTestId("cell-1").style.height).toBe("50%");
});
