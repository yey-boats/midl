// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

export interface CellPlacement { row: number; col: number; colSpan: number; rowSpan: number }

/** Grid slot of each cell, as the renderer's solver assigns it (null when the
 *  grid is already full). Spans are clamped to the grid edge. */
export function placeCells(
  rows: number,
  cols: number,
  cells: Array<{ colSpan?: number; rowSpan?: number }>,
): Array<CellPlacement | null> {
  const occupied = new Array<boolean>(rows * cols).fill(false);
  let slot = 0;
  return cells.map((cell) => {
    while (slot < occupied.length && occupied[slot]) slot++;
    if (slot >= occupied.length) return null;
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    const colSpan = Math.max(1, Math.min(typeof cell.colSpan === "number" ? cell.colSpan : 1, cols - col));
    const rowSpan = Math.max(1, Math.min(typeof cell.rowSpan === "number" ? cell.rowSpan : 1, rows - row));
    for (let dr = 0; dr < rowSpan; dr++) {
      for (let dc = 0; dc < colSpan; dc++) occupied[(row + dr) * cols + col + dc] = true;
    }
    return { row, col, colSpan, rowSpan };
  });
}
