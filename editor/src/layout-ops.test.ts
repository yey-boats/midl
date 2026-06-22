// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { describe, it, expect } from "vitest";
import {
  addRow,
  addCol,
  removeRow,
  removeCol,
  assignElementToCell,
  clearCell,
  addElement,
  removeElement,
} from "./layout-ops";
import type { EditorModel, EditorElement } from "./model";
import { EditorError } from "./model";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal grid EditorModel for testing. */
function makeGridModel(rows: number, cols: number): EditorModel {
  const cells = Array.from({ length: rows * cols }, () => ({}));
  return {
    midl: "1.0",
    screenId: "test",
    title: "Test Screen",
    elements: {},
    layout: { rows, cols, cells },
    variants: [],
  };
}

/** Build a model with a flow (non-grid) layout. */
function makeFlowModel(): EditorModel {
  return {
    midl: "1.0",
    screenId: "test",
    title: "Test Screen",
    elements: {},
    layout: { flow: "row", children: [] },
    variants: [],
  };
}

/** Freeze input model deeply enough to catch mutations. */
function frozen(m: EditorModel): EditorModel {
  const layout = m.layout;
  if ("cells" in layout) {
    layout.cells.forEach(Object.freeze);
    Object.freeze(layout.cells);
  }
  Object.freeze(layout);
  Object.freeze(m.elements);
  Object.freeze(m);
  return m;
}

function gridLayout(m: EditorModel) {
  const l = m.layout;
  if (!("rows" in l)) throw new Error("Not a grid layout");
  return l;
}

// ── addRow ────────────────────────────────────────────────────────────────────

describe("addRow", () => {
  it("increments rows and keeps cells.length === rows*cols", () => {
    const m = makeGridModel(2, 3);
    const result = addRow(m);
    const l = gridLayout(result);
    expect(l.rows).toBe(3);
    expect(l.cols).toBe(3);
    expect(l.cells.length).toBe(9);
  });

  it("new cells appended at the end are empty", () => {
    const m = makeGridModel(1, 2);
    const result = addRow(m);
    const l = gridLayout(result);
    expect(l.cells[2]).toEqual({});
    expect(l.cells[3]).toEqual({});
  });

  it("does not mutate input", () => {
    const m = frozen(makeGridModel(2, 2));
    expect(() => addRow(m)).not.toThrow();
    expect(gridLayout(m).rows).toBe(2);
  });

  it("throws EditorError for non-grid layout", () => {
    expect(() => addRow(makeFlowModel())).toThrow(EditorError);
  });
});

// ── addCol ────────────────────────────────────────────────────────────────────

describe("addCol", () => {
  it("increments cols and keeps cells.length === rows*cols", () => {
    const m = makeGridModel(2, 3);
    const result = addCol(m);
    const l = gridLayout(result);
    expect(l.rows).toBe(2);
    expect(l.cols).toBe(4);
    expect(l.cells.length).toBe(8);
  });

  it("inserts one empty cell at the end of each row", () => {
    // 2 rows × 2 cols: cells [0,1,2,3]; after addCol 2×3: cells [0,1,_,2,3,_]
    const m = makeGridModel(2, 2);
    // populate cells with markers
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = {
      element: "a",
    };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[1] = {
      element: "b",
    };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[2] = {
      element: "c",
    };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[3] = {
      element: "d",
    };
    m.elements = { a: { id: "a", type: "t" }, b: { id: "b", type: "t" }, c: { id: "c", type: "t" }, d: { id: "d", type: "t" } };
    const result = addCol(m);
    const l = gridLayout(result);
    // row0: a,b,empty; row1: c,d,empty
    expect(l.cells[0]).toEqual({ element: "a" });
    expect(l.cells[1]).toEqual({ element: "b" });
    expect(l.cells[2]).toEqual({});
    expect(l.cells[3]).toEqual({ element: "c" });
    expect(l.cells[4]).toEqual({ element: "d" });
    expect(l.cells[5]).toEqual({});
  });

  it("does not mutate input", () => {
    const m = frozen(makeGridModel(2, 2));
    expect(() => addCol(m)).not.toThrow();
    expect(gridLayout(m).cols).toBe(2);
  });

  it("throws EditorError for non-grid layout", () => {
    expect(() => addCol(makeFlowModel())).toThrow(EditorError);
  });
});

// ── removeRow ─────────────────────────────────────────────────────────────────

describe("removeRow", () => {
  it("decrements rows and keeps cells.length === rows*cols", () => {
    const m = makeGridModel(3, 2);
    const result = removeRow(m, 1);
    const l = gridLayout(result);
    expect(l.rows).toBe(2);
    expect(l.cols).toBe(2);
    expect(l.cells.length).toBe(4);
  });

  it("removes correct cells for a middle row", () => {
    // 3 rows × 2 cols: indices 0–5; row1 = cells[2],cells[3]
    const m = makeGridModel(3, 2);
    const cells = (m.layout as { rows: number; cols: number; cells: { element?: string }[] })
      .cells;
    cells[0] = { element: "r0c0" };
    cells[1] = { element: "r0c1" };
    cells[2] = { element: "r1c0" };
    cells[3] = { element: "r1c1" };
    cells[4] = { element: "r2c0" };
    cells[5] = { element: "r2c1" };
    m.elements = {
      r0c0: { id: "r0c0", type: "t" },
      r0c1: { id: "r0c1", type: "t" },
      r1c0: { id: "r1c0", type: "t" },
      r1c1: { id: "r1c1", type: "t" },
      r2c0: { id: "r2c0", type: "t" },
      r2c1: { id: "r2c1", type: "t" },
    };
    const result = removeRow(m, 1);
    const l = gridLayout(result);
    expect(l.cells[0]).toEqual({ element: "r0c0" });
    expect(l.cells[1]).toEqual({ element: "r0c1" });
    expect(l.cells[2]).toEqual({ element: "r2c0" });
    expect(l.cells[3]).toEqual({ element: "r2c1" });
  });

  it("orphaned elements stay in elements map", () => {
    const m = makeGridModel(2, 2);
    const cells = (m.layout as { rows: number; cols: number; cells: { element?: string }[] })
      .cells;
    cells[2] = { element: "orphan" };
    m.elements = { orphan: { id: "orphan", type: "t" } };
    const result = removeRow(m, 1);
    expect(result.elements["orphan"]).toBeDefined();
  });

  it("does not mutate input", () => {
    const m = frozen(makeGridModel(3, 2));
    expect(() => removeRow(m, 0)).not.toThrow();
    expect(gridLayout(m).rows).toBe(3);
  });

  it("throws EditorError for non-grid layout", () => {
    expect(() => removeRow(makeFlowModel(), 0)).toThrow(EditorError);
  });

  // I1 — last row / out-of-range
  it("throws EditorError when removing the last row (rows===1)", () => {
    const m = makeGridModel(1, 2);
    expect(() => removeRow(m, 0)).toThrow(EditorError);
  });

  it("throws EditorError for out-of-range row index (negative)", () => {
    const m = makeGridModel(3, 2);
    expect(() => removeRow(m, -1)).toThrow(EditorError);
  });

  it("throws EditorError for out-of-range row index (>= rows)", () => {
    const m = makeGridModel(3, 2);
    expect(() => removeRow(m, 3)).toThrow(EditorError);
  });
});

// ── removeCol ─────────────────────────────────────────────────────────────────

describe("removeCol", () => {
  it("decrements cols and keeps cells.length === rows*cols", () => {
    const m = makeGridModel(2, 3);
    const result = removeCol(m, 1);
    const l = gridLayout(result);
    expect(l.rows).toBe(2);
    expect(l.cols).toBe(2);
    expect(l.cells.length).toBe(4);
  });

  it("removes correct column cells from each row", () => {
    // 2 rows × 3 cols; remove col1 → keep col0,col2 per row
    const m = makeGridModel(2, 3);
    const cells = (m.layout as { rows: number; cols: number; cells: { element?: string }[] })
      .cells;
    cells[0] = { element: "r0c0" };
    cells[1] = { element: "r0c1" };
    cells[2] = { element: "r0c2" };
    cells[3] = { element: "r1c0" };
    cells[4] = { element: "r1c1" };
    cells[5] = { element: "r1c2" };
    m.elements = {
      r0c0: { id: "r0c0", type: "t" },
      r0c1: { id: "r0c1", type: "t" },
      r0c2: { id: "r0c2", type: "t" },
      r1c0: { id: "r1c0", type: "t" },
      r1c1: { id: "r1c1", type: "t" },
      r1c2: { id: "r1c2", type: "t" },
    };
    const result = removeCol(m, 1);
    const l = gridLayout(result);
    expect(l.cells[0]).toEqual({ element: "r0c0" });
    expect(l.cells[1]).toEqual({ element: "r0c2" });
    expect(l.cells[2]).toEqual({ element: "r1c0" });
    expect(l.cells[3]).toEqual({ element: "r1c2" });
  });

  it("orphaned elements stay in elements map", () => {
    const m = makeGridModel(2, 3);
    const cells = (m.layout as { rows: number; cols: number; cells: { element?: string }[] })
      .cells;
    cells[1] = { element: "orphan" }; // col 1, row 0
    m.elements = { orphan: { id: "orphan", type: "t" } };
    const result = removeCol(m, 1);
    expect(result.elements["orphan"]).toBeDefined();
  });

  it("does not mutate input", () => {
    const m = frozen(makeGridModel(2, 3));
    expect(() => removeCol(m, 0)).not.toThrow();
    expect(gridLayout(m).cols).toBe(3);
  });

  it("throws EditorError for non-grid layout", () => {
    expect(() => removeCol(makeFlowModel(), 0)).toThrow(EditorError);
  });

  // I1 — last col / out-of-range
  it("throws EditorError when removing the last column (cols===1)", () => {
    const m = makeGridModel(2, 1);
    expect(() => removeCol(m, 0)).toThrow(EditorError);
  });

  it("throws EditorError for out-of-range col index (negative)", () => {
    const m = makeGridModel(2, 3);
    expect(() => removeCol(m, -1)).toThrow(EditorError);
  });

  it("throws EditorError for out-of-range col index (>= cols)", () => {
    const m = makeGridModel(2, 3);
    expect(() => removeCol(m, 3)).toThrow(EditorError);
  });
});

// ── assignElementToCell ───────────────────────────────────────────────────────

describe("assignElementToCell", () => {
  it("sets element on the specified cell", () => {
    const m = makeGridModel(2, 2);
    m.elements = { el1: { id: "el1", type: "t" } };
    const result = assignElementToCell(m, 2, "el1");
    expect(gridLayout(result).cells[2]).toEqual({ element: "el1" });
  });

  it("does not modify other cells", () => {
    const m = makeGridModel(2, 2);
    m.elements = { el1: { id: "el1", type: "t" } };
    const result = assignElementToCell(m, 0, "el1");
    expect(gridLayout(result).cells[1]).toEqual({});
    expect(gridLayout(result).cells[2]).toEqual({});
  });

  it("throws EditorError when elementId does not exist in elements map", () => {
    const m = makeGridModel(2, 2);
    expect(() => assignElementToCell(m, 0, "nonexistent")).toThrow(EditorError);
  });

  it("throws EditorError for out-of-bounds cellIndex", () => {
    const m = makeGridModel(2, 2);
    m.elements = { el1: { id: "el1", type: "t" } };
    expect(() => assignElementToCell(m, 10, "el1")).toThrow(EditorError);
  });

  it("does not mutate input", () => {
    const base = makeGridModel(2, 2);
    base.elements = { el1: { id: "el1", type: "t" } };
    const m = frozen(base);
    expect(() => assignElementToCell(m, 0, "el1")).not.toThrow();
    expect(gridLayout(m).cells[0]).toEqual({});
  });

  it("throws EditorError for non-grid layout", () => {
    const flow = makeFlowModel();
    flow.elements = { el1: { id: "el1", type: "t" } };
    expect(() => assignElementToCell(flow, 0, "el1")).toThrow(EditorError);
  });
});

// ── clearCell ─────────────────────────────────────────────────────────────────

describe("clearCell", () => {
  it("clears the element reference from the cell", () => {
    const m = makeGridModel(2, 2);
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[1] = {
      element: "el1",
    };
    const result = clearCell(m, 1);
    expect(gridLayout(result).cells[1]).toEqual({});
  });

  it("leaves element in the elements map", () => {
    const m = makeGridModel(2, 2);
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = {
      element: "el1",
    };
    m.elements = { el1: { id: "el1", type: "t" } };
    const result = clearCell(m, 0);
    expect(result.elements["el1"]).toBeDefined();
  });

  it("does not mutate input", () => {
    const m = makeGridModel(2, 2);
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = {
      element: "el1",
    };
    const mf = frozen(m);
    expect(() => clearCell(mf, 0)).not.toThrow();
    expect(gridLayout(mf).cells[0]).toEqual({ element: "el1" });
  });

  it("throws EditorError for non-grid layout", () => {
    expect(() => clearCell(makeFlowModel(), 0)).toThrow(EditorError);
  });
});

// ── addElement ────────────────────────────────────────────────────────────────

describe("addElement", () => {
  it("adds element to the elements map", () => {
    const m = makeGridModel(2, 2);
    const el: EditorElement = { id: "el1", type: "gauge" };
    const result = addElement(m, el);
    expect(result.elements["el1"]).toEqual(el);
  });

  it("does not place the element in any cell", () => {
    const m = makeGridModel(2, 2);
    const el: EditorElement = { id: "el1", type: "gauge" };
    const result = addElement(m, el);
    gridLayout(result).cells.forEach((c) => expect(c.element).toBeUndefined());
  });

  it("throws EditorError when id already exists", () => {
    const m = makeGridModel(2, 2);
    m.elements = { el1: { id: "el1", type: "t" } };
    expect(() => addElement(m, { id: "el1", type: "gauge" })).toThrow(EditorError);
  });

  it("does not mutate input", () => {
    const m = frozen(makeGridModel(2, 2));
    expect(() => addElement(m, { id: "new", type: "t" })).not.toThrow();
    expect(m.elements["new"]).toBeUndefined();
  });

  it("works on a flow-layout model (elements are layout-independent)", () => {
    // M3: addElement no longer requires grid — it only touches the elements map.
    // Cell-mutating ops still require grid.
    const flow = makeFlowModel();
    const result = addElement(flow, { id: "el1", type: "gauge" });
    expect(result.elements["el1"]).toEqual({ id: "el1", type: "gauge" });
    // Layout is unchanged
    expect(result.layout).toEqual(flow.layout);
  });
});

// ── removeElement ─────────────────────────────────────────────────────────────

describe("removeElement", () => {
  it("removes element from elements map", () => {
    const m = makeGridModel(2, 2);
    m.elements = { el1: { id: "el1", type: "t" } };
    const result = removeElement(m, "el1");
    expect(result.elements["el1"]).toBeUndefined();
  });

  it("clears any cell referencing the removed element", () => {
    const m = makeGridModel(2, 2);
    m.elements = { el1: { id: "el1", type: "t" } };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[1] = {
      element: "el1",
    };
    const result = removeElement(m, "el1");
    gridLayout(result).cells.forEach((c) => expect(c.element).toBeUndefined());
  });

  it("only clears the referencing cell, not all cells", () => {
    const m = makeGridModel(2, 2);
    m.elements = {
      el1: { id: "el1", type: "t" },
      el2: { id: "el2", type: "t" },
    };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = {
      element: "el1",
    };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[3] = {
      element: "el2",
    };
    const result = removeElement(m, "el1");
    expect(gridLayout(result).cells[0].element).toBeUndefined();
    expect(gridLayout(result).cells[3]).toEqual({ element: "el2" });
  });

  it("does not mutate input", () => {
    const m = makeGridModel(2, 2);
    m.elements = { el1: { id: "el1", type: "t" } };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = {
      element: "el1",
    };
    const mf = frozen(m);
    expect(() => removeElement(mf, "el1")).not.toThrow();
    expect(mf.elements["el1"]).toBeDefined();
    expect(gridLayout(mf).cells[0]).toEqual({ element: "el1" });
  });

  it("throws EditorError for non-grid layout", () => {
    const flow = makeFlowModel();
    flow.elements = { el1: { id: "el1", type: "t" } };
    expect(() => removeElement(flow, "el1")).toThrow(EditorError);
  });
});
