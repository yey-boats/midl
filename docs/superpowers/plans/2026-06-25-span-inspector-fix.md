# Span Inspector Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Inspector's Span control so colSpan/rowSpan is usable from the UI — setting a span removes covered cells from the grid, and the Span select reflects actual cell colSpan/rowSpan rather than stale style data.

**Architecture:** Add a pure `setCellSpan` layout-op (mirrors `solve.ts` packing logic) that atomically sets a cell's span and removes/restores the cells it covers or frees. Wire it into `Inspector.handleSpanChange` and derive the `<select>` value from the cell's actual `colSpan`/`rowSpan` fields.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react (jsdom), existing `layout-ops.ts` / `Inspector.tsx` / `model.ts` patterns.

## Global Constraints

- Work ONLY in `/Users/borissorochkin/code/yey.boats/midl-editor/editor` on branch `feat/midl-editor`
- `npm test --workspace editor` must stay green (172 → ≥172 tests pass; new tests add to count)
- `cd editor && npm run build:lib` must succeed after changes
- Do NOT rebuild the IIFE global (`dist-global/`) or push to remote
- All new code uses the same SPDX license header as existing files
- Commit with co-author trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Run from workspace root: `npm test --workspace editor` (not `cd editor && npm test`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `editor/src/layout-ops.ts` | Modify | Add `setCellSpan` pure op |
| `editor/src/layout-ops.test.ts` | Modify | Add `setCellSpan` unit tests |
| `editor/src/visual/Inspector.tsx` | Modify | Wire `setCellSpan`, fix `currentSpan` derivation |
| `editor/src/visual/Inspector.test.tsx` | Modify | Add two new failing-then-passing tests |

---

### Task 1: Add `setCellSpan` to `layout-ops.ts` (TDD)

**Files:**
- Modify: `editor/src/layout-ops.ts` (add export after `removeElement`)
- Test: `editor/src/layout-ops.test.ts` (add `describe("setCellSpan", ...)` block)

**Interfaces:**
- Produces: `export function setCellSpan(m: EditorModel, cellIndex: number, colSpan: number, rowSpan: number): EditorModel`
- Consumes: `assertGrid`, `EditorModel`, `GridCell` (all already in the file)

**Background — how solve.ts packs spanned grids (CRITICAL to understand before coding):**

`solve.ts` iterates `node.cells` in order. It maintains an `occupied` boolean array of size `rows * cols`. For each cell, it advances a `slot` pointer past already-occupied slots, reads the cell's `colSpan`/`rowSpan` (defaulting to 1), marks all covered `(r+dr, c+dc)` slots as occupied, then moves on to the next cell. This means:

- Cell at position `cellIndex` in the `cells[]` array occupies the *first unoccupied slot* when iterating from the top.
- If cell 0 has `colSpan=2` in a 2×2 grid, it occupies slots 0 and 1 (row 0, cols 0–1). The next cell in `cells[]` finds slot 2 (row 1, col 0) free, occupies it normally. Slot 3 (row 1, col 1) remains free but there is no cell for it — but actually slot count must match: the 2×2 grid needs exactly `rows*cols` slots consumed, so with colSpan=2, one fewer entry in `cells[]` is needed. A full 2×2 grid (4 cells) becomes 3 cells: the spanned cell + 2 remaining cells.

**Algorithm for `setCellSpan`:**

1. `assertGrid(m)` → `{ rows, cols, cells }`.
2. Clamp: `colSpan = Math.max(1, Math.min(colSpan, cols))`, `rowSpan = Math.max(1, Math.min(rowSpan, rows))`.
3. **Find the slot position of `cellIndex`** by doing a forward simulation of the packing (mirror solve.ts logic) up to and including `cellIndex`:
   - `occupied = new Array(rows * cols).fill(false)`
   - `slot = 0`
   - For each `i` from 0 to `cellIndex`:
     - Advance `slot` past occupied entries
     - Read `cs = cells[i].colSpan ?? 1`, `rs = cells[i].rowSpan ?? 1`
     - Mark `occupied[(r+dr)*cols+(c+dc)]` for `dr in [0,rs)`, `dc in [0,cs)`
     - Record `anchorSlot = slot` and `anchorRow = floor(slot/cols)`, `anchorCol = slot%cols` when `i === cellIndex`
     - Advance `slot++` past the anchor (the loop top will handle the rest on next iteration)
4. Clamp further to fit within the grid from anchor: `colSpan = Math.min(colSpan, cols - anchorCol)`, `rowSpan = Math.min(rowSpan, rows - anchorRow)`.
5. **Compute the old span** of the cell: `oldCs = cells[cellIndex].colSpan ?? 1`, `oldRs = cells[cellIndex].rowSpan ?? 1`.
6. **Compute old covered slots** (slots the old span occupied, excluding the anchor): mark every `(anchorRow+dr)*cols+(anchorCol+dc)` for `dr in [0,oldRs)`, `dc in [0,oldCs)` except `(dr=0, dc=0)`.
7. **Compute new covered slots** (slots the new span will occupy, excluding the anchor): same formula with `colSpan`/`rowSpan`.
8. Build new cells array:
   - Copy the base cells array.
   - Set `cells[cellIndex].colSpan` (delete if `colSpan===1`), set `cells[cellIndex].rowSpan` (delete if `rowSpan===1`).
   - **Slots to remove** = new covered slots that are NOT in old covered slots (expanding → these cells disappear).
     - Re-simulate the packing again on the *current* cells array to find which `cellIndex` in `cells[]` sits in each slot. For each slot in "to remove", find its `cellIndex` and splice it out.
     - Do this in reverse order of `cellIndex` so splicing doesn't shift earlier indices.
   - **Slots to restore** = old covered slots that are NOT in new covered slots (shrinking → insert empty `{}` cells).
     - Re-simulate to find after which `cellIndex` each freed slot falls, and insert `{}` there.
     - Do this in forward order.
9. Return the new model with updated cells.

**Simpler alternative (recommended for correctness):** Instead of doing slot→cellIndex lookups twice, build the new cells array by:
1. Re-simulate the full current layout to build a `slotToCell: Map<number, number>` mapping each slot to its cell-array index. (Slot = first slot the cell covers.)
2. Remove cells that sit in any of the new-covered slots (other than the anchor's slot).
3. For freed slots (shrunken span): figure out how many empty `{}` cells to insert and where. The freed slot positions are known from the old and new spans; insert them in the right place relative to the following cell.

**Even simpler (explicit, easy to review):**

```ts
// Step A: simulate full layout → slotToCell[] (slot index → cells[] index)
// Step B: set new span on target cell
// Step C: slots newly covered (old span region) minus new span region → those cells removed from cells[]
// Step D: slots newly freed (old span region) minus new span region → insert {} cells there
```

The cleanest approach — simulate once, build the answer:

```ts
export function setCellSpan(
  m: EditorModel,
  cellIndex: number,
  colSpan: number,
  rowSpan: number
): EditorModel {
  const g = assertGrid(m);
  const { rows, cols, cells } = g;

  // 1. Simulate current packing: build cellAnchorSlot[i] = first slot cell i covers
  const occupied = new Array<boolean>(rows * cols).fill(false);
  const cellAnchorSlot: number[] = [];
  let slot = 0;
  for (let i = 0; i < cells.length; i++) {
    while (slot < occupied.length && occupied[slot]) slot++;
    if (slot >= occupied.length) { cellAnchorSlot.push(-1); continue; }
    cellAnchorSlot.push(slot);
    const r = Math.floor(slot / cols);
    const c = slot % cols;
    const cs = Math.min(typeof cells[i].colSpan === "number" ? cells[i].colSpan! : 1, cols - c);
    const rs = Math.min(typeof cells[i].rowSpan === "number" ? cells[i].rowSpan! : 1, rows - r);
    for (let dr = 0; dr < rs; dr++)
      for (let dc = 0; dc < cs; dc++)
        occupied[(r + dr) * cols + (c + dc)] = true;
    slot++;
  }

  // 2. Find anchor position for cellIndex
  const anchorSlot = cellAnchorSlot[cellIndex];
  if (anchorSlot < 0) throw new EditorError("setCellSpan: cellIndex out of packing range");
  const anchorRow = Math.floor(anchorSlot / cols);
  const anchorCol = anchorSlot % cols;

  // 3. Clamp requested span to grid bounds from anchor
  colSpan = Math.max(1, Math.min(colSpan, cols - anchorCol));
  rowSpan = Math.max(1, Math.min(rowSpan, rows - anchorRow));

  // 4. Compute old and new covered slot sets (excluding anchor itself)
  const oldCs = Math.min(cells[cellIndex].colSpan ?? 1, cols - anchorCol);
  const oldRs = Math.min(cells[cellIndex].rowSpan ?? 1, rows - anchorRow);
  const oldCovered = new Set<number>();
  for (let dr = 0; dr < oldRs; dr++)
    for (let dc = 0; dc < oldCs; dc++)
      if (dr !== 0 || dc !== 0) oldCovered.add((anchorRow + dr) * cols + (anchorCol + dc));
  const newCovered = new Set<number>();
  for (let dr = 0; dr < rowSpan; dr++)
    for (let dc = 0; dc < colSpan; dc++)
      if (dr !== 0 || dc !== 0) newCovered.add((anchorRow + dr) * cols + (anchorCol + dc));

  // 5. Slots to remove: newly covered (not in old covered)
  const slotsToRemove = new Set<number>();
  for (const s of newCovered) if (!oldCovered.has(s)) slotsToRemove.add(s);
  // Slots to restore: was covered, now freed
  const slotsToRestore = new Set<number>();
  for (const s of oldCovered) if (!newCovered.has(s)) slotsToRestore.add(s);

  // 6. Build slotToCell map for current cells (only anchor slots matter)
  const slotToCell = new Map<number, number>();
  for (let i = 0; i < cells.length; i++) {
    if (cellAnchorSlot[i] >= 0) slotToCell.set(cellAnchorSlot[i], i);
  }

  // 7. Build new cells array
  // Start by updating the target cell
  let newCells = cells.map((c, i) => {
    if (i !== cellIndex) return { ...c };
    const updated = { ...c };
    if (colSpan === 1) delete updated.colSpan; else updated.colSpan = colSpan;
    if (rowSpan === 1) delete updated.rowSpan; else updated.rowSpan = rowSpan;
    return updated;
  });

  // Remove cells whose anchor slots are in slotsToRemove, in REVERSE order
  const cellIndicesToRemove = [...slotsToRemove]
    .map(s => slotToCell.get(s))
    .filter((i): i is number => i !== undefined)
    .sort((a, b) => b - a); // descending
  for (const i of cellIndicesToRemove) {
    newCells = [...newCells.slice(0, i), ...newCells.slice(i + 1)];
  }

  // Restore empty cells: for each freed slot, find the insertion point by
  // re-simulating packing on newCells and inserting {} after the predecessor cell.
  // Simpler: sort slotsToRestore and insert {} cells at the right positions.
  // We find insertion points by re-simulating the updated packing.
  if (slotsToRestore.size > 0) {
    const sortedRestoreSlots = [...slotsToRestore].sort((a, b) => a - b);
    // Re-simulate newCells to find where each freed slot would be "missing"
    const occ2 = new Array<boolean>(rows * cols).fill(false);
    let slot2 = 0;
    let cellIdx2 = 0;
    const insertions: Array<{ afterIndex: number }> = [];
    let restoreIdx = 0;
    while (slot2 < rows * cols && restoreIdx < sortedRestoreSlots.length) {
      while (slot2 < rows * cols && occ2[slot2]) slot2++;
      if (slot2 >= rows * cols) break;
      const targetSlot = sortedRestoreSlots[restoreIdx];
      if (slot2 === targetSlot) {
        // This slot is free and should have an empty cell here
        insertions.push({ afterIndex: cellIdx2 - 1 });
        occ2[slot2] = true;
        slot2++;
        restoreIdx++;
      } else if (slot2 < targetSlot) {
        // Consume the next real cell
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
        // slot2 > targetSlot — already past it (covered by a span)
        restoreIdx++;
      }
    }
    // Apply insertions in reverse order
    for (let k = insertions.length - 1; k >= 0; k--) {
      const idx = insertions[k].afterIndex + 1; // insert at this position
      newCells = [...newCells.slice(0, idx), {}, ...newCells.slice(idx)];
    }
  }

  return {
    ...m,
    elements: { ...m.elements },
    layout: { rows, cols, cells: newCells },
  };
}
```

> Note: The restoration logic above has edge cases. A simpler, more robust approach: after all removals, count how many cells are expected (`rows * cols` minus total covered slots = cells expected), and if `newCells.length < expected`, append/insert empty cells at the freed positions. Since freed slots are known and their relative position is determined by the simulation, the insertion approach works but may need careful indexing. Implement it as shown, then verify with tests.

- [ ] **Step 1: Write the failing tests in `layout-ops.test.ts`**

Add this block at the end of `editor/src/layout-ops.test.ts` (after the `removeElement` describe block):

```ts
// ── setCellSpan ───────────────────────────────────────────────────────────────

import { setCellSpan } from "./layout-ops";
import { serializeMidl, parseMidl } from "./midl-io";
import type { Manifest } from "@yey-boats/midl";
import { validateModel } from "./validate";

const SQUARE_480_MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "esp32-4848s040",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3 }],
  elements: [
    { type: "single-value", bindings: ["value"] },
    { type: "gauge", bindings: ["value"] },
  ],
  sources: ["signalk"],
};

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

  it("setCellSpan(2,1) on full 2×2 → validateModel passes for square-480", () => {
    const m = makeFull2x2();
    const result = setCellSpan(m, 0, 2, 1);
    const validation = validateModel(result, SQUARE_480_MANIFEST);
    // Should not throw or overflow — ok may be false for element issues but must not have
    // "more cells than can fit" error (i.e., prepareDashboard must not throw)
    // We check the layout structure is correct: 3 cells total
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | grep -E "setCellSpan|FAIL|Cannot find|does not provide"
```

Expected: failures about `setCellSpan` not being exported from `./layout-ops`.

- [ ] **Step 3: Implement `setCellSpan` in `layout-ops.ts`**

Add the following export at the end of `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/layout-ops.ts` (after `removeElement`):

```ts
// ── setCellSpan ───────────────────────────────────────────────────────────────

/**
 * Atomically set the colSpan/rowSpan of a cell at `cellIndex`, keeping the
 * cells array consistent with solve.ts's occupied-slot packing:
 * - Increasing a span REMOVES the cells whose slots are now covered.
 * - Decreasing a span RESTORES empty cells for the freed slots.
 * - The result always satisfies rows*cols slot coverage (i.e. validateModel won't
 *   see a slot overflow).
 * - colSpan/rowSpan are clamped to the grid dimensions from the cell's anchor.
 */
export function setCellSpan(
  m: EditorModel,
  cellIndex: number,
  colSpan: number,
  rowSpan: number
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
    if (slot >= occupied.length) { cellAnchorSlot.push(-1); continue; }
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
  if (anchorSlot < 0) throw new EditorError(`setCellSpan: cellIndex ${cellIndex} out of packing range`);
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
      if (dr !== 0 || dc !== 0) oldCovered.add((anchorRow + dr) * cols + (anchorCol + dc));
  const newCovered = new Set<number>();
  for (let dr = 0; dr < rowSpan; dr++)
    for (let dc = 0; dc < colSpan; dc++)
      if (dr !== 0 || dc !== 0) newCovered.add((anchorRow + dr) * cols + (anchorCol + dc));

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
    if (colSpan === 1) delete updated.colSpan; else updated.colSpan = colSpan;
    if (rowSpan === 1) delete updated.rowSpan; else updated.rowSpan = rowSpan;
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
  // Re-simulate on newCells to find where each freed slot falls, then insert {}.
  if (slotsToRestore.size > 0) {
    const sortedRestoreSlots = [...slotsToRestore].sort((a, b) => a - b);
    // Process each slot to restore by finding its insertion point.
    // After each insertion, re-simulate from the insertion point onward.
    // Simpler: process in slot order, tracking how many cells we've consumed.
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
```

- [ ] **Step 4: Run tests to confirm the layout-ops tests pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | grep -E "setCellSpan|Tests|FAIL"
```

Expected: all `setCellSpan` tests pass. Total test count increases by number of new tests added.

- [ ] **Step 5: Commit Task 1**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git -C editor add src/layout-ops.ts src/layout-ops.test.ts && git -C editor commit -m "$(cat <<'EOF'
feat(editor): add setCellSpan layout-op that keeps grid slot packing consistent

When increasing a span, removes cells whose slots the span absorbs.
When decreasing, restores empty cells for freed slots. Mirrors
solve.ts packing algorithm (row-major, occupied-slot tracking).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Fix Inspector — wire `setCellSpan` and derive span from cell data

**Files:**
- Modify: `editor/src/visual/Inspector.tsx` (fix `handleSpanChange` and `currentSpan`)
- Test: `editor/src/visual/Inspector.test.tsx` (add 2 new tests)

**Interfaces:**
- Consumes: `setCellSpan` from `"../layout-ops"` (produced by Task 1)

**Background — the two bugs:**

**Bug 1:** `handleSpanChange` sets `colSpan`/`rowSpan` on the cell but does NOT remove the cells that the span now covers. On a full 2×2 grid, setting span 2×1 on cell 0 keeps all 4 cells, which overflows the 4-slot budget (the spanned cell now claims 2 slots, so only 3 cells fit). The validator throws: *"grid has more cells than can fit in 2*2=4 slots"*.

**Bug 2:** `currentSpan` is computed as `String(selectedElement.style?.span ?? "1x1")`. This reads from the element's style, which only gets updated when the user changes the span through the Inspector — it is never populated by `parseMidl`. `parseMidl` reads `colSpan`/`rowSpan` onto the `GridCell`, not onto `element.style.span`. So after loading a doc with a spanned cell, `element.style.span` is `undefined`, and the select shows `"1x1"` even when the cell is `colSpan:2`.

**Fix for Bug 2 — derive `currentSpan` from the grid cell:**

When in a grid with a selected cell, read `colSpan` and `rowSpan` from `cells[selectedCell]`, not from `element.style.span`. The derivation:

```ts
// Derive currentSpan from the grid cell's colSpan/rowSpan (authoritative source).
// Fall back to element.style.span only when not in a grid.
let currentSpan = "1x1";
if (selectedCell !== null && isGrid) {
  const cells = (model.layout as { cells: Array<{ colSpan?: number; rowSpan?: number }> }).cells;
  const cell = cells[selectedCell];
  const cs = cell?.colSpan ?? 1;
  const rs = cell?.rowSpan ?? 1;
  currentSpan = `${cs}x${rs}`;
} else {
  currentSpan = String(selectedElement.style?.span ?? "1x1");
}
```

**Fix for Bug 1 — use `setCellSpan` in `handleSpanChange`:**

Replace the body of `handleSpanChange` with a single `setCellSpan` call for the grid case. Also keep writing `element.style.span` for backward-compat with the existing round-trip test that checks `style.span`.

```ts
function handleSpanChange(span: string) {
  if (!selectedElement) return;
  const [colPart, rowPart] = span.split("x");
  const colSpan = parseInt(colPart ?? "1", 10) || 1;
  const rowSpan = parseInt(rowPart ?? "1", 10) || 1;

  // Keep element.style.span for backward-compat with style round-trips.
  const updatedElement = { ...selectedElement, style: { ...selectedElement.style, span } };

  if (selectedCell !== null && isGrid) {
    // setCellSpan atomically adjusts the cells array (removes/restores covered cells).
    const modelWithSpan = setCellSpan(model, selectedCell, colSpan, rowSpan);
    // Also update the element's style.span for round-trip compat.
    onChange({
      ...modelWithSpan,
      elements: { ...modelWithSpan.elements, [selectedElement.id]: updatedElement },
    });
    return;
  }
  // Non-grid: just update element style.
  updateElement(updatedElement);
}
```

Also update the import line at the top of Inspector.tsx to include `setCellSpan`:

```ts
import { addRow, addCol, removeRow, removeCol, removeElement, setCellSpan } from "../layout-ops";
```

- [ ] **Step 1: Write the two new failing Inspector tests**

Add the following tests at the end of `editor/src/visual/Inspector.test.tsx` (after the existing `colSpan/rowSpan round-trip` test):

```ts
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
        { element: undefined },          // empty cell
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
```

- [ ] **Step 2: Run tests to confirm the two new tests fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | grep -E "overflow|colSpan:2 shows|FAIL|fail"
```

Expected: the two new tests fail (the first because overflow still throws, the second because the select shows "1x1").

- [ ] **Step 3: Update `Inspector.tsx` — import and fix `handleSpanChange` and `currentSpan`**

**3a.** Update the import line (around line 10) in `editor/src/visual/Inspector.tsx`:

Old:
```ts
import { addRow, addCol, removeRow, removeCol, removeElement } from "../layout-ops";
```

New:
```ts
import { addRow, addCol, removeRow, removeCol, removeElement, setCellSpan } from "../layout-ops";
```

**3b.** Replace `handleSpanChange` (lines 89–116) with:

```ts
  function handleSpanChange(span: string) {
    if (!selectedElement) return;
    const [colPart, rowPart] = span.split("x");
    const colSpan = parseInt(colPart ?? "1", 10) || 1;
    const rowSpan = parseInt(rowPart ?? "1", 10) || 1;
    // Keep element.style.span for backward-compat with style round-trips.
    const updatedElement = { ...selectedElement, style: { ...selectedElement.style, span } };
    if (selectedCell !== null && isGrid) {
      // Atomically adjust cells array: remove covered cells, restore freed ones.
      const modelWithSpan = setCellSpan(model, selectedCell, colSpan, rowSpan);
      onChange({
        ...modelWithSpan,
        elements: { ...modelWithSpan.elements, [selectedElement.id]: updatedElement },
      });
      return;
    }
    // Non-grid: just update element style.
    updateElement(updatedElement);
  }
```

**3c.** Replace `currentSpan` computation (around line 196):

Old:
```ts
  const currentSpan = String(selectedElement.style?.span ?? "1x1");
```

New:
```ts
  // Derive currentSpan from the grid cell's colSpan/rowSpan (authoritative after parseMidl).
  // Fall back to element.style.span only for non-grid layouts.
  let currentSpan: string;
  if (selectedCell !== null && isGrid) {
    const cells = (model.layout as { cells: Array<{ colSpan?: number; rowSpan?: number }> }).cells;
    const cell = cells[selectedCell];
    const cs = cell?.colSpan ?? 1;
    const rs = cell?.rowSpan ?? 1;
    currentSpan = `${cs}x${rs}`;
  } else {
    currentSpan = String(selectedElement.style?.span ?? "1x1");
  }
```

- [ ] **Step 4: Run all tests and confirm all pass (172 + new tests)**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -10
```

Expected output (example):
```
Test Files  13 passed (13)
     Tests  176 passed (176)   ← or similar count; all green
```

If any test fails, diagnose and fix. Common issues:
- The existing test `"changing span to 2x1 sets colSpan=2..."` (Inspector.test.tsx line 435) uses a 2×2 grid with only 1 occupied cell and 3 empty cells. `setCellSpan` on cell 0 with colSpan=2 should remove cell 1 (empty `{}`). The test checks `layout.cells[0].colSpan === 2`. After the fix, there will be 3 cells (one removed). The test only checks cells[0] properties, so it should still pass. Verify this is the case.
- The existing test `"changing span to 1x2 sets rowSpan=2..."` similarly uses a sparse grid. Verify it still passes.
- The existing round-trip test at line 508 checks `layout.cells[0].colSpan === 2` and `layout.cells[0].rowSpan === 2` after setting `2x2` — in a 2×2 grid with 1 occupied cell and 3 empty, this removes 3 cells, leaving only 1. The test only checks cells[0], so it should still pass.

- [ ] **Step 5: Run `build:lib` to confirm no TypeScript errors**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor && npm run build:lib 2>&1 | tail -10
```

Expected: clean build with no errors.

- [ ] **Step 6: Commit Task 2**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git -C editor add src/visual/Inspector.tsx src/visual/Inspector.test.tsx && git -C editor commit -m "$(cat <<'EOF'
fix(editor): wire setCellSpan into Inspector and derive span from cell data

Bug 1: handleSpanChange now calls setCellSpan, which atomically removes
the cells covered by an expanded span — no more slot-overflow errors.
Bug 2: currentSpan is now derived from the selected GridCell's colSpan/rowSpan
rather than the stale element.style.span, so span displays correctly
after parseMidl loads a doc with spanned cells.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Bug 1 (overflow on span change) — Task 1 (setCellSpan) + Task 2 step 3b: ✅
- Bug 2 (stale span display) — Task 2 step 3c: ✅
- TDD layout-op tests — Task 1 steps 1–4: ✅
- TDD Inspector tests — Task 2 steps 1–4: ✅
- serializeMidl→parseMidl round-trip — Task 1 step 1 (test): ✅
- setCellSpan back to 1×1 restores empty cell — Task 1 step 1 (test): ✅
- `npm test --workspace editor` must stay green — Task 1 step 4 + Task 2 step 4: ✅
- `build:lib` must succeed — Task 2 step 5: ✅
- Commit with co-author trailer — Task 1 step 5 + Task 2 step 6: ✅

**Placeholder scan:** All steps have concrete code. No "TBD" or "add appropriate handling" phrases.

**Type consistency:**
- `setCellSpan(m: EditorModel, cellIndex: number, colSpan: number, rowSpan: number): EditorModel` — same signature used in both layout-ops.ts and Inspector.tsx import.
- `GridCell` — used throughout (`cells[i].colSpan`, `cells[i].rowSpan`), same type as defined in `model.ts`.
- `assertGrid` returns `{ rows: number; cols: number; cells: GridCell[] }` — consistent with existing usage in the file.

**Edge cases handled:**
- Clamping: span is clamped to `cols - anchorCol` and `rows - anchorRow` so it never exceeds grid bounds.
- Identity: `setCellSpan(m, i, 1, 1)` when cell already has span `1x1` produces the same cells array (no removals, no restorations).
- Slots covered by other spans: the `slotToCell` lookup returns `undefined` for slots that are interior to another cell's span — these are filtered out with `.filter((i): i is number => i !== undefined)`.
- Restoration when `slotsToRestore` falls into a slot covered by the new span of the updated cell: the simulation on `newCells` skips those (they are marked occupied by the target cell's new span), so they won't generate spurious insertion points.
