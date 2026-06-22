// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import type { EditorModel, EditorElement, GridCell } from "./model";
import { EditorError } from "./model";

// ── Guard helper ─────────────────────────────────────────────────────────────

function assertGrid(m: EditorModel): { rows: number; cols: number; cells: GridCell[] } {
  const l = m.layout;
  if (!("rows" in l) || !("cols" in l) || !("cells" in l)) {
    throw new EditorError("layout-ops require a grid layout");
  }
  return l as { rows: number; cols: number; cells: GridCell[] };
}

// ── addRow ───────────────────────────────────────────────────────────────────

export function addRow(m: EditorModel): EditorModel {
  const g = assertGrid(m);
  const newCells: GridCell[] = Array.from({ length: g.cols }, () => ({}));
  return {
    ...m,
    elements: { ...m.elements },
    layout: {
      rows: g.rows + 1,
      cols: g.cols,
      cells: [...g.cells.map((c) => ({ ...c })), ...newCells],
    },
  };
}

// ── addCol ───────────────────────────────────────────────────────────────────

export function addCol(m: EditorModel): EditorModel {
  const g = assertGrid(m);
  const newCells: GridCell[] = [];
  for (let r = 0; r < g.rows; r++) {
    // Copy existing cells for this row
    for (let c = 0; c < g.cols; c++) {
      newCells.push({ ...g.cells[r * g.cols + c] });
    }
    // Append empty cell at end of row
    newCells.push({});
  }
  return {
    ...m,
    elements: { ...m.elements },
    layout: {
      rows: g.rows,
      cols: g.cols + 1,
      cells: newCells,
    },
  };
}

// ── removeRow ─────────────────────────────────────────────────────────────────

export function removeRow(m: EditorModel, row: number): EditorModel {
  const g = assertGrid(m);
  const start = row * g.cols;
  const end = start + g.cols;
  const newCells = [
    ...g.cells.slice(0, start).map((c) => ({ ...c })),
    ...g.cells.slice(end).map((c) => ({ ...c })),
  ];
  return {
    ...m,
    elements: { ...m.elements },
    layout: {
      rows: g.rows - 1,
      cols: g.cols,
      cells: newCells,
    },
  };
}

// ── removeCol ─────────────────────────────────────────────────────────────────

export function removeCol(m: EditorModel, col: number): EditorModel {
  const g = assertGrid(m);
  const newCells: GridCell[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (c !== col) {
        newCells.push({ ...g.cells[r * g.cols + c] });
      }
    }
  }
  return {
    ...m,
    elements: { ...m.elements },
    layout: {
      rows: g.rows,
      cols: g.cols - 1,
      cells: newCells,
    },
  };
}

// ── assignElementToCell ───────────────────────────────────────────────────────

export function assignElementToCell(
  m: EditorModel,
  cellIndex: number,
  elementId: string
): EditorModel {
  const g = assertGrid(m);
  if (!(elementId in m.elements)) {
    throw new EditorError(`assignElementToCell: element "${elementId}" not found in elements map`);
  }
  if (cellIndex < 0 || cellIndex >= g.cells.length) {
    throw new EditorError(
      `assignElementToCell: cellIndex ${cellIndex} out of bounds (cells.length=${g.cells.length})`
    );
  }
  const newCells = g.cells.map((c, i) =>
    i === cellIndex ? { ...c, element: elementId } : { ...c }
  );
  return {
    ...m,
    elements: { ...m.elements },
    layout: {
      rows: g.rows,
      cols: g.cols,
      cells: newCells,
    },
  };
}

// ── clearCell ─────────────────────────────────────────────────────────────────

export function clearCell(m: EditorModel, cellIndex: number): EditorModel {
  const g = assertGrid(m);
  const newCells = g.cells.map((c, i) => {
    if (i !== cellIndex) return { ...c };
    const copy = { ...c };
    delete copy.element;
    return copy;
  });
  return {
    ...m,
    elements: { ...m.elements },
    layout: {
      rows: g.rows,
      cols: g.cols,
      cells: newCells,
    },
  };
}

// ── addElement ────────────────────────────────────────────────────────────────

export function addElement(m: EditorModel, el: EditorElement): EditorModel {
  assertGrid(m);
  if (el.id in m.elements) {
    throw new EditorError(`addElement: element id "${el.id}" already exists`);
  }
  return {
    ...m,
    elements: { ...m.elements, [el.id]: { ...el } },
    layout: { ...(m.layout as { rows: number; cols: number; cells: GridCell[] }), cells: [...(m.layout as { rows: number; cols: number; cells: GridCell[] }).cells.map(c => ({ ...c }))] },
  };
}

// ── removeElement ─────────────────────────────────────────────────────────────

export function removeElement(m: EditorModel, elementId: string): EditorModel {
  const g = assertGrid(m);
  const newElements = { ...m.elements };
  delete newElements[elementId];
  const newCells = g.cells.map((c) => {
    if (c.element !== elementId) return { ...c };
    const copy = { ...c };
    delete copy.element;
    return copy;
  });
  return {
    ...m,
    elements: newElements,
    layout: {
      rows: g.rows,
      cols: g.cols,
      cells: newCells,
    },
  };
}
