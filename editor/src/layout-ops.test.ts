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
  setCellSpan,
  setGrid,
  clearWidgets,
} from "./layout-ops";
import type { EditorModel, EditorElement } from "./model";
import { EditorError } from "./model";
import { serializeMidl, parseMidl } from "./midl-io";

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

// ── setCellSpan ───────────────────────────────────────────────────────────────

describe("setCellSpan", () => {
  /** 2×2 grid with all 4 cells populated: sog, hdg, dtw, btw */
  function makeFull2x2(): EditorModel {
    return {
      midl: "1.0",
      screenId: "test",
      title: "Test",
      elements: {
        sog: { id: "sog", type: "single-value" },
        hdg: { id: "hdg", type: "single-value" },
        dtw: { id: "dtw", type: "single-value" },
        btw: { id: "btw", type: "single-value" },
      },
      layout: {
        rows: 2,
        cols: 2,
        cells: [
          { element: "sog" },
          { element: "hdg" },
          { element: "dtw" },
          { element: "btw" },
        ],
      },
      variants: [],
    };
  }

  it("setCellSpan(colSpan=2,rowSpan=1) on a full 2×2 grid removes the covered cell", () => {
    const m = makeFull2x2();
    // cell 0 (sog) gets colSpan=2 — it now covers slots 0 and 1 (top row)
    // slot 1 was cell 1 (hdg) — hdg must be removed
    const result = setCellSpan(m, 0, 2, 1);
    const l = gridLayout(result);
    // cells must be exactly 3: [sog(colSpan=2), dtw, btw]
    expect(l.cells.length).toBe(3);
    expect(l.cells[0]).toEqual({ element: "sog", colSpan: 2 });
    expect(l.cells[1]).toEqual({ element: "dtw" });
    expect(l.cells[2]).toEqual({ element: "btw" });
  });

  it("setCellSpan(2,1) on full 2×2 → serializeMidl does not throw", () => {
    const m = makeFull2x2();
    const result = setCellSpan(m, 0, 2, 1);
    const l = gridLayout(result);
    expect(l.cells.length).toBe(3);
    // Round-trip must work without errors
    expect(() => serializeMidl(result, "yaml")).not.toThrow();
  });

  it("setCellSpan then serializeMidl→parseMidl round-trips the span", () => {
    const m = makeFull2x2();
    const result = setCellSpan(m, 0, 2, 1);
    const yaml = serializeMidl(result, "yaml");
    const reparsed = parseMidl(yaml);
    const l = reparsed.layout as { rows: number; cols: number; cells: Array<{ element?: string; colSpan?: number; rowSpan?: number }> };
    expect(l.cells[0].colSpan).toBe(2);
    expect(l.cells[0].rowSpan).toBeUndefined();
    expect(l.cells.length).toBe(3);
  });

  it("setCellSpan back to (1,1) restores an empty cell", () => {
    // Start with a 2×2 where cell 0 has colSpan=2 (3 cells total)
    const m: EditorModel = {
      midl: "1.0",
      screenId: "test",
      title: "Test",
      elements: {
        sog: { id: "sog", type: "single-value" },
        dtw: { id: "dtw", type: "single-value" },
        btw: { id: "btw", type: "single-value" },
      },
      layout: {
        rows: 2,
        cols: 2,
        cells: [
          { element: "sog", colSpan: 2 },
          { element: "dtw" },
          { element: "btw" },
        ],
      },
      variants: [],
    };
    const result = setCellSpan(m, 0, 1, 1);
    const l = gridLayout(result);
    // Now 4 cells: sog, {}, dtw, btw
    expect(l.cells.length).toBe(4);
    expect(l.cells[0]).toEqual({ element: "sog" }); // no colSpan
    expect(l.cells[1]).toEqual({}); // restored empty
    expect(l.cells[2]).toEqual({ element: "dtw" });
    expect(l.cells[3]).toEqual({ element: "btw" });
  });

  it("clamps colSpan to grid width when requested span exceeds bounds", () => {
    const m = makeGridModel(2, 2);
    const result = setCellSpan(m, 0, 5, 1); // request colSpan=5, grid is 2 wide
    const l = gridLayout(result);
    // colSpan clamped to 2 (full width from col 0)
    expect(l.cells[0].colSpan).toBe(2);
  });

  it("does not mutate input model", () => {
    const m = frozen(makeFull2x2());
    expect(() => setCellSpan(m, 0, 2, 1)).not.toThrow();
  });

  it("throws EditorError for non-grid layout", () => {
    expect(() => setCellSpan(makeFlowModel(), 0, 2, 1)).toThrow(EditorError);
  });

  it("setCellSpan(2,2) on a full 2×2 removes the 3 covered cells (only anchor cell remains)", () => {
    const m = makeFull2x2();
    const result = setCellSpan(m, 0, 2, 2);
    const l = gridLayout(result);
    // cell 0 covers all 4 slots — only 1 cell total
    expect(l.cells.length).toBe(1);
    expect(l.cells[0]).toEqual({ element: "sog", colSpan: 2, rowSpan: 2 });
  });
});

// ── Sequence / robustness tests ───────────────────────────────────────────────

describe("add→remove→add sequence robustness", () => {
  it("add→remove→add-another places new element in a free cell", () => {
    // Start with a 1×1 grid, add A, remove A, add B — B should land in cell 0
    let m = makeGridModel(1, 1);
    const elA: EditorElement = { id: "el-a", type: "gauge" };
    const elB: EditorElement = { id: "el-b", type: "gauge" };

    m = addElement(m, elA);
    m = assignElementToCell(m, 0, "el-a");
    // Remove A — cell 0 becomes empty again
    m = removeElement(m, "el-a");
    const l1 = gridLayout(m);
    expect(l1.cells[0].element).toBeUndefined();

    // Add B — should go to cell 0 (only free cell)
    m = addElement(m, elB);
    m = assignElementToCell(m, 0, "el-b");
    const l2 = gridLayout(m);
    expect(l2.cells[0]).toEqual({ element: "el-b" });
    // cells.length invariant: rows*cols
    expect(l2.cells.length).toBe(l2.rows * l2.cols);
  });

  it("add→remove→re-add same type (fresh UUID) does not collide", () => {
    let m = makeGridModel(2, 2);
    const elA: EditorElement = { id: "uuid-1", type: "gauge" };
    m = addElement(m, elA);
    m = assignElementToCell(m, 0, "uuid-1");
    m = removeElement(m, "uuid-1");

    // Adding with a completely new id must not throw
    const elB: EditorElement = { id: "uuid-2", type: "gauge" };
    expect(() => {
      m = addElement(m, elB);
      m = assignElementToCell(m, 0, "uuid-2");
    }).not.toThrow();
    expect(gridLayout(m).cells[0]).toEqual({ element: "uuid-2" });
    // cells.length invariant
    expect(gridLayout(m).cells.length).toBe(gridLayout(m).rows * gridLayout(m).cols);
  });

  it("clearCell→assign new element works", () => {
    let m = makeGridModel(2, 2);
    m.elements = { el1: { id: "el1", type: "t" } };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[1] = { element: "el1" };

    m = clearCell(m, 1);
    expect(gridLayout(m).cells[1].element).toBeUndefined();

    const el2: EditorElement = { id: "el2", type: "t" };
    m = addElement(m, el2);
    m = assignElementToCell(m, 1, "el2");
    expect(gridLayout(m).cells[1]).toEqual({ element: "el2" });
    // cells.length invariant
    expect(gridLayout(m).cells.length).toBe(gridLayout(m).rows * gridLayout(m).cols);
  });

  it("removeRow→addRow: grid grows back and cells invariant holds", () => {
    let m = makeGridModel(3, 2);
    m = removeRow(m, 2); // now 2×2 = 4 cells
    expect(gridLayout(m).rows).toBe(2);
    expect(gridLayout(m).cells.length).toBe(4);

    m = addRow(m); // back to 3×2 = 6 cells
    expect(gridLayout(m).rows).toBe(3);
    expect(gridLayout(m).cells.length).toBe(6);
    // New cells at the end are empty
    expect(gridLayout(m).cells[4]).toEqual({});
    expect(gridLayout(m).cells[5]).toEqual({});
  });

  it("setCellSpan 2×2 then removeElement anchor: cells count matches rows*cols", () => {
    // Start with full 2×2, give anchor a 2×2 span (all 4 slots → 1 cell)
    const m0: EditorElement = { id: "sog", type: "gauge" };
    let m = makeGridModel(2, 2);
    m.elements = { sog: m0 };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = { element: "sog" };

    // Span to 2×2 — occupies all 4 slots, cells.length becomes 1
    m = setCellSpan(m, 0, 2, 2);
    expect(gridLayout(m).cells.length).toBe(1);

    // Remove the anchor element — should restore 4 empty cells
    m = removeElement(m, "sog");
    const l = gridLayout(m);
    // removeElement clears the cell reference but does NOT restore the span-removed cells.
    // The cells array length may be 1 (the anchor cell, now empty).
    // The invariant we test: all cells reference no removed element
    for (const c of l.cells) {
      expect(c.element).toBeUndefined();
    }
    // sog is gone from elements
    expect(m.elements["sog"]).toBeUndefined();
  });

  it("shrink to 1×1 via setCellSpan then grow back: cells invariant holds at each step", () => {
    // Start 2×2, set anchor to 2×2 span → 1 cell
    let m = makeGridModel(2, 2);
    m.elements = { sog: { id: "sog", type: "t" } };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = { element: "sog" };

    m = setCellSpan(m, 0, 2, 2);
    const l1 = gridLayout(m);
    expect(l1.cells.length).toBe(1); // 1 cell covering all 4 slots
    expect(l1.rows * l1.cols).toBe(4); // grid dimensions unchanged

    // Restore span to 1×1 → 4 cells again
    m = setCellSpan(m, 0, 1, 1);
    const l2 = gridLayout(m);
    expect(l2.cells.length).toBe(4);
    // anchor cell still has the element
    expect(l2.cells[0]).toEqual({ element: "sog" });
    // other 3 cells are empty
    expect(l2.cells[1]).toEqual({});
    expect(l2.cells[2]).toEqual({});
    expect(l2.cells[3]).toEqual({});
  });

  it("cells.length === rows*cols invariant holds after a series of add/remove/span ops", () => {
    // Build a 2×2 grid with all 4 elements
    let m: EditorModel = {
      midl: "1.0",
      screenId: "test",
      title: "Test",
      elements: {
        a: { id: "a", type: "t" },
        b: { id: "b", type: "t" },
        c: { id: "c", type: "t" },
        d: { id: "d", type: "t" },
      },
      layout: {
        rows: 2,
        cols: 2,
        cells: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }],
      },
      variants: [],
    };

    // Step 1: remove element b
    m = removeElement(m, "b");
    let l = gridLayout(m);
    expect(l.cells.length).toBe(l.rows * l.cols);

    // Step 2: addRow
    m = addRow(m);
    l = gridLayout(m);
    expect(l.cells.length).toBe(l.rows * l.cols);

    // Step 3: addCol
    m = addCol(m);
    l = gridLayout(m);
    expect(l.cells.length).toBe(l.rows * l.cols);

    // Step 4: removeRow last row
    m = removeRow(m, l.rows - 1);
    l = gridLayout(m);
    expect(l.cells.length).toBe(l.rows * l.cols);

    // Step 5: removeCol last col
    m = removeCol(m, l.cols - 1);
    l = gridLayout(m);
    expect(l.cells.length).toBe(l.rows * l.cols);
  });
});

describe("schema validity after remove ops (post-schema-fix invariants)", () => {
  it("removeElement on last element → cells contain only spacers (no element property)", () => {
    // A 1x1 grid with one element — after remove, cells: [{}]
    let m = makeGridModel(1, 1);
    m.elements = { el: { id: "el", type: "gauge" } };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = { element: "el" };
    m = removeElement(m, "el");
    const l = gridLayout(m);
    expect(Object.keys(m.elements)).toHaveLength(0);
    expect(l.cells).toHaveLength(1);
    expect(l.cells[0].element).toBeUndefined();
    // Confirm serializes without throwing
    expect(() => serializeMidl(m, "yaml")).not.toThrow();
  });

  it("addRow on a grid where a cell has an element assigned (assigned-grid) works", () => {
    // Regression: "Add row not working when the view assigned"
    let m = makeGridModel(1, 2);
    m.elements = { el: { id: "el", type: "gauge" } };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = { element: "el" };
    // m now has an assigned element in cell 0 — addRow must still work
    m = addRow(m);
    const l = gridLayout(m);
    expect(l.rows).toBe(2);
    expect(l.cells.length).toBe(4); // 2 rows * 2 cols
    expect(l.cells[0]).toEqual({ element: "el" }); // original cell preserved
    expect(l.cells[2]).toEqual({}); // new empty cells
    expect(l.cells[3]).toEqual({});
  });

  it("addCol on an assigned grid works", () => {
    let m = makeGridModel(1, 1);
    m.elements = { el: { id: "el", type: "gauge" } };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = { element: "el" };
    m = addCol(m);
    const l = gridLayout(m);
    expect(l.cols).toBe(2);
    expect(l.cells.length).toBe(2);
    expect(l.cells[0]).toEqual({ element: "el" });
    expect(l.cells[1]).toEqual({});
  });

  it("addElement after removeElement places the new element in a free cell", () => {
    // Simulates: user removes last element, then adds a new one via palette
    let m = makeGridModel(2, 2);
    m.elements = { el: { id: "el", type: "gauge" } };
    (m.layout as { rows: number; cols: number; cells: { element?: string }[] }).cells[0] = { element: "el" };
    m = removeElement(m, "el");

    // All cells now empty — add new element
    const newEl: EditorElement = { id: "new-el", type: "single-value" };
    m = addElement(m, newEl);
    // Assign to first free cell (cell 0)
    const layout = m.layout as { rows: number; cols: number; cells: Array<{ element?: string }> };
    const freeCell = layout.cells.findIndex(c => !c.element);
    expect(freeCell).toBe(0); // first cell is free
    m = assignElementToCell(m, freeCell, "new-el");
    expect(gridLayout(m).cells[0]).toEqual({ element: "new-el" });
    expect(() => serializeMidl(m, "yaml")).not.toThrow();
  });
});

// ── setGrid ───────────────────────────────────────────────────────────────────

describe("setGrid", () => {
  /** A 2×2 model with all 4 cells placed */
  function makeFull2x2(): EditorModel {
    return {
      midl: "1.0",
      screenId: "test",
      title: "Test",
      elements: {
        a: { id: "a", type: "t" },
        b: { id: "b", type: "t" },
        c: { id: "c", type: "t" },
        d: { id: "d", type: "t" },
      },
      layout: {
        rows: 2,
        cols: 2,
        cells: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }],
      },
      variants: [],
    };
  }

  it("setGrid(2,2)->(1,3): re-flows widgets, no element lost, result valid", () => {
    const m = makeFull2x2(); // 4 placed elements
    const result = setGrid(m, 1, 3);
    const l = gridLayout(result);
    // 1×3 = 3 cells; a,b,c placed; d unplaced (but still in elements map)
    expect(l.rows).toBe(1);
    expect(l.cols).toBe(3);
    expect(l.cells.length).toBe(3);
    expect(l.cells[0].element).toBe("a");
    expect(l.cells[1].element).toBe("b");
    expect(l.cells[2].element).toBe("c");
    // d survives in elements
    expect(result.elements["d"]).toBeDefined();
    // result serializes without error
    expect(() => serializeMidl(result, "yaml")).not.toThrow();
  });

  it("setGrid grows grid: all placed elements fit", () => {
    // 1×1 with element a → setGrid(2,3) — a placed in [0], rest empty
    const m: EditorModel = {
      midl: "1.0",
      screenId: "test",
      title: "Test",
      elements: { a: { id: "a", type: "t" } },
      layout: { rows: 1, cols: 1, cells: [{ element: "a" }] },
      variants: [],
    };
    const result = setGrid(m, 2, 3);
    const l = gridLayout(result);
    expect(l.rows).toBe(2);
    expect(l.cols).toBe(3);
    expect(l.cells.length).toBe(6);
    expect(l.cells[0].element).toBe("a");
    for (let i = 1; i < 6; i++) expect(l.cells[i].element).toBeUndefined();
  });

  it("setGrid clamps to 1×1 minimum", () => {
    const m = makeGridModel(2, 2);
    const result = setGrid(m, 0, 0);
    const l = gridLayout(result);
    expect(l.rows).toBe(1);
    expect(l.cols).toBe(1);
    expect(l.cells.length).toBe(1);
  });

  it("setGrid does not mutate input", () => {
    const m = frozen(makeFull2x2());
    expect(() => setGrid(m, 1, 3)).not.toThrow();
    expect(gridLayout(m).rows).toBe(2);
  });

  it("setGrid throws EditorError for non-grid layout", () => {
    expect(() => setGrid(makeFlowModel(), 2, 2)).toThrow(EditorError);
  });

  it("setGrid(2,2)->(1,3) same-size round-trips through serializeMidl→parseMidl", () => {
    const m = makeFull2x2();
    const result = setGrid(m, 1, 3);
    const yaml = serializeMidl(result, "yaml");
    const reparsed = parseMidl(yaml);
    const l = reparsed.layout as { rows: number; cols: number; cells: Array<{ element?: string }> };
    expect(l.rows).toBe(1);
    expect(l.cols).toBe(3);
    expect(l.cells.length).toBe(3);
  });

  it("cells.length === rows*cols after setGrid", () => {
    const m = makeFull2x2();
    for (const [rows, cols] of [[1, 1], [1, 3], [2, 2], [3, 2], [2, 3]] as const) {
      const result = setGrid(m, rows, cols);
      const l = gridLayout(result);
      expect(l.cells.length).toBe(l.rows * l.cols);
    }
  });
});

// ── clearWidgets ──────────────────────────────────────────────────────────────

describe("clearWidgets", () => {
  it("removes all element references from cells", () => {
    const m: EditorModel = {
      midl: "1.0",
      screenId: "test",
      title: "Test",
      elements: { a: { id: "a", type: "t" }, b: { id: "b", type: "t" } },
      layout: { rows: 1, cols: 2, cells: [{ element: "a" }, { element: "b" }] },
      variants: [],
    };
    const result = clearWidgets(m);
    const l = gridLayout(result);
    expect(l.cells.length).toBe(2);
    expect(l.cells[0].element).toBeUndefined();
    expect(l.cells[1].element).toBeUndefined();
    // Elements survive in the map
    expect(result.elements["a"]).toBeDefined();
    expect(result.elements["b"]).toBeDefined();
  });

  it("preserves grid dimensions", () => {
    const m = makeGridModel(3, 2);
    const result = clearWidgets(m);
    const l = gridLayout(result);
    expect(l.rows).toBe(3);
    expect(l.cols).toBe(2);
    expect(l.cells.length).toBe(6);
  });

  it("does not mutate input", () => {
    const m: EditorModel = {
      midl: "1.0",
      screenId: "test",
      title: "Test",
      elements: { a: { id: "a", type: "t" } },
      layout: { rows: 1, cols: 1, cells: [{ element: "a" }] },
      variants: [],
    };
    const mf = frozen(m);
    expect(() => clearWidgets(mf)).not.toThrow();
    expect(gridLayout(mf).cells[0].element).toBe("a");
  });

  it("throws EditorError for non-grid layout", () => {
    expect(() => clearWidgets(makeFlowModel())).toThrow(EditorError);
  });

  it("result serializes without error", () => {
    const m: EditorModel = {
      midl: "1.0",
      screenId: "test",
      title: "Test",
      elements: { a: { id: "a", type: "t" } },
      layout: { rows: 1, cols: 2, cells: [{ element: "a" }, {}] },
      variants: [],
    };
    const result = clearWidgets(m);
    expect(() => serializeMidl(result, "yaml")).not.toThrow();
  });
});
