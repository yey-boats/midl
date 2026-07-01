# Task 0.3 — Layout Operations Report

## Status: COMPLETE

## Files Created
- `editor/src/layout-ops.test.ts` — 38 tests across 8 `describe` blocks
- `editor/src/layout-ops.ts` — pure/immutable implementation of all 8 ops

## Implementation Notes

### Guard pattern
Every exported function calls `assertGrid(m)` first. It checks for `"rows" in layout && "cols" in layout && "cells" in layout`; throws `EditorError("layout-ops require a grid layout")` otherwise.

### Immutability strategy
All ops spread the input model (`{ ...m }`) and return new `cells` arrays built via `.map(c => ({ ...c }))` — never mutating the original. Tested by freezing input models with `Object.freeze` and asserting no throw + original unchanged.

### addCol cell ordering
Inserts one empty cell at the *end* of each row (i.e., indices `r*(cols+1)+cols`), preserving existing row contents in order.

### removeRow / removeCol orphan policy
Elements referenced by removed cells are kept in `result.elements` verbatim — only the cell reference is dropped.

### Test fix
One test had a logic error: it froze the model *before* assigning `elements`, causing a `TypeError` at test-setup time (not during the op). Fixed by populating elements before the `frozen()` call.

## Test Summary
60 tests total (38 new + 22 existing), all pass. Suite: 3 test files, 0 failures.

## Concerns
- `addElement` is guarded against non-grid layouts (as required by spec: "every op throws EditorError on a non-grid layout"). In practice, `addElement` only touches the `elements` map, so throwing here is a conservative choice — fine for now since the visual editor only surfaces these ops for grid layouts.
- No bounds check in `removeRow`/`removeCol` (e.g., row >= g.rows). Could be added as a follow-up if the UI does not already guard against invalid indices.
