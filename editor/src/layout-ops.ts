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
  if (g.rows <= 1) {
    throw new EditorError("removeRow: cannot remove the last row");
  }
  if (row < 0 || row >= g.rows) {
    throw new EditorError(`removeRow: row index ${row} out of bounds (rows=${g.rows})`);
  }
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
  if (g.cols <= 1) {
    throw new EditorError("removeCol: cannot remove the last column");
  }
  if (col < 0 || col >= g.cols) {
    throw new EditorError(`removeCol: col index ${col} out of bounds (cols=${g.cols})`);
  }
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
  // No assertGrid here — addElement only touches the elements map, not the layout cells.
  // Cell-mutating ops (assignElementToCell, clearCell, removeElement, addRow/Col, removeRow/Col)
  // still require a grid via assertGrid.
  if (el.id in m.elements) {
    throw new EditorError(`addElement: element id "${el.id}" already exists`);
  }
  return {
    ...m,
    elements: { ...m.elements, [el.id]: { ...el } },
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

// ── setGrid ───────────────────────────────────────────────────────────────────

/**
 * Resize the grid to the requested rows×cols, re-flowing placed widgets in
 * row-major order into the new grid.
 *
 * - Widgets that fit (their ordinal position ≤ newRows*newCols) are placed into
 *   cells in the new grid in row-major order.
 * - Widgets whose position exceeds the new grid size become "unplaced": they
 *   remain in the elements map (no element is lost) but no cell references them.
 * - The resulting cells array always has exactly newRows*newCols entries.
 * - At least 1×1 is enforced.
 */
export function setGrid(m: EditorModel, rows: number, cols: number): EditorModel {
  const g = assertGrid(m);
  const newRows = Math.max(1, rows);
  const newCols = Math.max(1, cols);
  const totalNew = newRows * newCols;

  // Collect placed element ids in current row-major order (skip empty/spanned-away slots).
  const placedIds: string[] = [];
  for (const cell of g.cells) {
    if (cell.element) placedIds.push(cell.element);
  }

  // Build fresh cells — each with no span (1×1).
  const newCells: GridCell[] = Array.from({ length: totalNew }, (_, i) => {
    const elementId = placedIds[i];
    if (elementId && elementId in m.elements) {
      return { element: elementId };
    }
    return {};
  });

  return {
    ...m,
    elements: { ...m.elements },
    layout: { rows: newRows, cols: newCols, cells: newCells },
  };
}

// ── clearWidgets ──────────────────────────────────────────────────────────────

/**
 * Clear all cell→element assignments: every cell becomes an empty spacer.
 * Elements remain in the elements map (they are not deleted).
 */
export function clearWidgets(m: EditorModel): EditorModel {
  const g = assertGrid(m);
  const newCells: GridCell[] = g.cells.map(() => ({}));
  return {
    ...m,
    elements: { ...m.elements },
    layout: { rows: g.rows, cols: g.cols, cells: newCells },
  };
}

// ── setCellSpan ───────────────────────────────────────────────────────────────

/**
 * Atomically set the colSpan/rowSpan of a cell at `cellIndex`, keeping the
 * cells array consistent with solve.ts's occupied-slot packing:
 * - Increasing a span REMOVES the cells whose slots are now covered.
 * - Decreasing a span RESTORES empty cells for the freed slots.
 * - The result always satisfies rows*cols slot coverage.
 * - colSpan/rowSpan are clamped to the grid dimensions from the cell's anchor.
 */
export function setCellSpan(
  m: EditorModel,
  cellIndex: number,
  colSpan: number,
  rowSpan: number,
): EditorModel {
  const g = assertGrid(m);
  const { rows, cols } = g;
  const cells = g.cells;

  // ── Step 1: simulate current packing to find each cell's anchor slot ────────
  const occupied = new Array<boolean>(rows * cols).fill(false);
  const cellAnchorSlot: number[] = [];
  let slot = 0;
  for (let i = 0; i < cells.length; i++) {
    while (slot < occupied.length && occupied[slot]) slot++;
    if (slot >= occupied.length) {
      cellAnchorSlot.push(-1);
      continue;
    }
    cellAnchorSlot.push(slot);
    const r = Math.floor(slot / cols);
    const c = slot % cols;
    const cs = Math.min(cells[i].colSpan ?? 1, cols - c);
    const rs = Math.min(cells[i].rowSpan ?? 1, rows - r);
    for (let dr = 0; dr < rs; dr++)
      for (let dc = 0; dc < cs; dc++)
        occupied[(r + dr) * cols + (c + dc)] = true;
  }

  // ── Step 2: find anchor coords of the target cell ───────────────────────────
  const anchorSlot = cellAnchorSlot[cellIndex];
  if (anchorSlot < 0)
    throw new EditorError(`setCellSpan: cellIndex ${cellIndex} out of packing range`);
  const anchorRow = Math.floor(anchorSlot / cols);
  const anchorCol = anchorSlot % cols;

  // ── Step 3: clamp requested span ────────────────────────────────────────────
  colSpan = Math.max(1, Math.min(colSpan, cols - anchorCol));
  rowSpan = Math.max(1, Math.min(rowSpan, rows - anchorRow));

  // ── Step 4: compute old and new covered slot sets (excluding anchor) ─────────
  const oldCs = Math.min(cells[cellIndex].colSpan ?? 1, cols - anchorCol);
  const oldRs = Math.min(cells[cellIndex].rowSpan ?? 1, rows - anchorRow);
  const oldCovered = new Set<number>();
  for (let dr = 0; dr < oldRs; dr++)
    for (let dc = 0; dc < oldCs; dc++)
      if (dr !== 0 || dc !== 0)
        oldCovered.add((anchorRow + dr) * cols + (anchorCol + dc));
  const newCovered = new Set<number>();
  for (let dr = 0; dr < rowSpan; dr++)
    for (let dc = 0; dc < colSpan; dc++)
      if (dr !== 0 || dc !== 0)
        newCovered.add((anchorRow + dr) * cols + (anchorCol + dc));

  // ── Step 5: slots to remove (newly covered) and restore (newly freed) ────────
  const slotsToRemove = new Set<number>();
  for (const s of newCovered) if (!oldCovered.has(s)) slotsToRemove.add(s);
  const slotsToRestore = new Set<number>();
  for (const s of oldCovered) if (!newCovered.has(s)) slotsToRestore.add(s);

  // ── Step 6: build slotToCell map ─────────────────────────────────────────────
  const slotToCell = new Map<number, number>();
  for (let i = 0; i < cells.length; i++) {
    if (cellAnchorSlot[i] >= 0) slotToCell.set(cellAnchorSlot[i], i);
  }

  // ── Step 7: update target cell span ──────────────────────────────────────────
  let newCells: GridCell[] = cells.map((c, i) => {
    if (i !== cellIndex) return { ...c };
    const updated = { ...c };
    if (colSpan === 1) delete updated.colSpan;
    else updated.colSpan = colSpan;
    if (rowSpan === 1) delete updated.rowSpan;
    else updated.rowSpan = rowSpan;
    return updated;
  });

  // ── Step 8: remove cells in slotsToRemove (descending index order) ───────────
  const cellIndicesToRemove = [...slotsToRemove]
    .map((s) => slotToCell.get(s))
    .filter((i): i is number => i !== undefined)
    .sort((a, b) => b - a);
  for (const idx of cellIndicesToRemove) {
    newCells = [...newCells.slice(0, idx), ...newCells.slice(idx + 1)];
  }

  // ── Step 9: insert empty cells for freed slots ────────────────────────────────
  if (slotsToRestore.size > 0) {
    const sortedRestoreSlots = [...slotsToRestore].sort((a, b) => a - b);
    const occ2 = new Array<boolean>(rows * cols).fill(false);
    let slot2 = 0;
    let cellIdx2 = 0;
    let restoreIdx = 0;
    const insertionPoints: number[] = [];
    while (restoreIdx < sortedRestoreSlots.length && slot2 < rows * cols) {
      // Advance past occupied
      while (slot2 < rows * cols && occ2[slot2]) slot2++;
      if (slot2 >= rows * cols) break;
      const targetSlot = sortedRestoreSlots[restoreIdx];
      if (slot2 === targetSlot) {
        // This slot is unoccupied and needs an empty cell at cellIdx2
        insertionPoints.push(cellIdx2);
        occ2[slot2] = true;
        slot2++;
        restoreIdx++;
      } else if (slot2 < targetSlot) {
        // Consume the next real cell from newCells
        if (cellIdx2 < newCells.length) {
          const r2 = Math.floor(slot2 / cols);
          const c2 = slot2 % cols;
          const cs2 = Math.min(newCells[cellIdx2].colSpan ?? 1, cols - c2);
          const rs2 = Math.min(newCells[cellIdx2].rowSpan ?? 1, rows - r2);
          for (let dr = 0; dr < rs2; dr++)
            for (let dc = 0; dc < cs2; dc++)
              occ2[(r2 + dr) * cols + (c2 + dc)] = true;
          slot2++;
          cellIdx2++;
        } else {
          slot2++;
        }
      } else {
        // slot2 > targetSlot — covered by a previous span, skip
        restoreIdx++;
      }
    }
    // Insert in reverse order so earlier insertions don't shift later indices
    for (let k = insertionPoints.length - 1; k >= 0; k--) {
      const ins = insertionPoints[k];
      newCells = [...newCells.slice(0, ins), {}, ...newCells.slice(ins)];
    }
  }

  return {
    ...m,
    elements: { ...m.elements },
    layout: { rows, cols, cells: newCells },
  };
}
