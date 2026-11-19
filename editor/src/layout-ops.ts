// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import type { EditorModel, EditorElement, GridCell } from "./model";
import { EditorError } from "./model";
import { placeCells } from "./grid-placement";

// ── Guard helper ─────────────────────────────────────────────────────────────

function assertGrid(m: EditorModel): { rows: number; cols: number; cells: GridCell[] } {
  const l = m.layout;
  if (!("rows" in l) || !("cols" in l) || !("cells" in l)) {
    throw new EditorError("layout-ops require a grid layout");
  }
  return l as { rows: number; cols: number; cells: GridCell[] };
}

/** Preserve rendered cell positions when a grid dimension changes. Removing a
 * line through a span shrinks it; its element is unplaced only if no area remains.
 * Empty slots must be emitted too, since the renderer packs at the next free slot.
 * Cells that did not fit the old grid (a hand-authored overflow) are not dropped
 * (#61): they take the first free slots of the new grid, keeping their span when
 * it fits there, else as 1x1.
 */
function resizeGrid(m: EditorModel, axis: "row" | "col", remove?: number): EditorModel {
  const g = assertGrid(m);
  const rows = g.rows + (axis === "row" ? (remove === undefined ? 1 : -1) : 0);
  const cols = g.cols + (axis === "col" ? (remove === undefined ? 1 : -1) : 0);
  const anchors = new Map<number, GridCell>();
  const overflow: GridCell[] = [];
  placeCells(g.rows, g.cols, g.cells).forEach((at, i) => {
    if (!at) {
      if (g.cells[i].element) overflow.push({ ...g.cells[i] });
      return;
    }
    let { row, col, rowSpan, colSpan } = at;
    if (remove !== undefined) {
      const start = axis === "row" ? row : col;
      const span = axis === "row" ? rowSpan : colSpan;
      if (start <= remove && remove < start + span) {
        if (span === 1) return;
        if (axis === "row") rowSpan--;
        else colSpan--;
      } else if (start > remove) {
        if (axis === "row") row--;
        else col--;
      }
    }
    const cell = { ...g.cells[i] };
    if (rowSpan > 1) cell.rowSpan = rowSpan;
    else delete cell.rowSpan;
    if (colSpan > 1) cell.colSpan = colSpan;
    else delete cell.colSpan;
    anchors.set(row * cols + col, cell);
  });
  const occupied = new Array<boolean>(rows * cols).fill(false);
  const cells: GridCell[] = [];
  const anchorSlots = new Set<number>();
  anchors.forEach((cell, slot) => {
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    for (let dr = 0; dr < (cell.rowSpan ?? 1); dr++)
      for (let dc = 0; dc < (cell.colSpan ?? 1); dc++) anchorSlots.add((row + dr) * cols + col + dc);
  });
  const fits = (cell: GridCell, slot: number) => {
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    const rs = cell.rowSpan ?? 1;
    const cs = cell.colSpan ?? 1;
    if (row + rs > rows || col + cs > cols) return false;
    for (let dr = 0; dr < rs; dr++)
      for (let dc = 0; dc < cs; dc++) {
        const s = (row + dr) * cols + col + dc;
        if (occupied[s] || (s !== slot && anchorSlots.has(s))) return false;
      }
    return true;
  };
  for (let slot = 0; slot < occupied.length; slot++) {
    if (occupied[slot]) continue;
    let cell = anchors.get(slot);
    if (!cell && !anchorSlots.has(slot) && overflow.length > 0) {
      cell = overflow.shift()!;
      if (!fits(cell, slot)) {
        cell = { ...cell };
        delete cell.rowSpan;
        delete cell.colSpan;
      }
    }
    cell = cell ?? {};
    cells.push(cell);
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    for (let dr = 0; dr < (cell.rowSpan ?? 1); dr++)
      for (let dc = 0; dc < (cell.colSpan ?? 1); dc++)
        occupied[(row + dr) * cols + col + dc] = true;
  }
  return { ...m, elements: { ...m.elements }, layout: { rows, cols, cells } };
}

/**
 * Resize the grid to rows×cols (at least 1×1) through the span-preserving
 * line ops (#61): rows/cols are added or removed at the end one at a time, so
 * spans survive a grow and shrink (rather than vanish) on a shrink; an element
 * left with no area becomes unplaced but stays in the elements map. The Layout
 * tab's grid controls use this; setGrid (1×1 re-flow) remains for callers that
 * want a clean grid.
 */
export function resizeGridTo(m: EditorModel, rows: number, cols: number): EditorModel {
  const wantRows = Math.max(1, Math.floor(rows));
  const wantCols = Math.max(1, Math.floor(cols));
  let out = m;
  let g = assertGrid(out);
  while (g.rows < wantRows) { out = addRow(out); g = assertGrid(out); }
  while (g.rows > wantRows) { out = removeRow(out, g.rows - 1); g = assertGrid(out); }
  while (g.cols < wantCols) { out = addCol(out); g = assertGrid(out); }
  while (g.cols > wantCols) { out = removeCol(out, g.cols - 1); g = assertGrid(out); }
  if (out === m) {
    return { ...m, elements: { ...m.elements }, layout: { ...g, cells: g.cells.map((c) => ({ ...c })) } };
  }
  return out;
}

export function addRow(m: EditorModel): EditorModel {
  return resizeGrid(m, "row");
}

export function addCol(m: EditorModel): EditorModel {
  return resizeGrid(m, "col");
}

export function removeRow(m: EditorModel, row: number): EditorModel {
  const g = assertGrid(m);
  if (g.rows <= 1) throw new EditorError("removeRow: cannot remove the last row");
  if (!Number.isInteger(row) || row < 0 || row >= g.rows)
    throw new EditorError(`removeRow: row index ${row} out of bounds (rows=${g.rows})`);
  return resizeGrid(m, "row", row);
}

export function removeCol(m: EditorModel, col: number): EditorModel {
  const g = assertGrid(m);
  if (g.cols <= 1) throw new EditorError("removeCol: cannot remove the last column");
  if (!Number.isInteger(col) || col < 0 || col >= g.cols)
    throw new EditorError(`removeCol: col index ${col} out of bounds (cols=${g.cols})`);
  return resizeGrid(m, "col", col);
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
