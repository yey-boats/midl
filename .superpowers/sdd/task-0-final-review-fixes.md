# Final Code Review Fixes — Summary

Applied 2026-06-22. All fixes land in `editor/` package on branch `feat/midl-editor`.

## C1 (Critical, security) — sanitize-svg.ts: case-insensitive tag removal
**Problem:** `querySelectorAll("script")` / `querySelectorAll("foreignObject")` are case-sensitive in XML/SVG documents, so `<SCRIPT>` / `<ForeignObject>` were not removed.
**Fix:** Replaced the two targeted `querySelectorAll` calls with a single pass over `doc.querySelectorAll("*")` that checks `el.tagName.toLowerCase()` against a `Set(["script","foreignobject"])`.
**Tests added:** `removes <SCRIPT> (uppercase) element`, `removes <ForeignObject> (mixed-case) element`.

## C2 (Critical, data-loss) — midl-io.ts + model.ts: screen-level meta dropped on round-trip
**Problem:** `editorModelToConfigDoc` only emitted `{ title: model.title }` for `screen.meta`, dropping every other field (e.g. `useCase`, `agentNotes`).
**Fix:** Added `screenMeta?: Record<string, unknown>` to `EditorModel`; populate it in `screenToEditorModel` by spreading `screen.meta` and stripping `title`; merge it back in `editorModelToConfigDoc` via `{ ...(model.screenMeta ?? {}), title: model.title }`.
**Tests added:** 4 new tests in `midl-io.test.ts` under "screen-level meta (screenMeta) round-trip".

## I1 (Important) — layout-ops.ts: removeRow/removeCol missing bounds checks
**Problem:** Neither function guarded against removing the last row/col or an out-of-range index.
**Fix:** Added early throws of `EditorError` for `rows <= 1` / `cols <= 1` and for negative or out-of-range indices.
**Tests added:** 6 new tests (3 per function) in `layout-ops.test.ts`.

## I2 (Important) — Inspector.tsx handlePathChange: non-signalk binding clobbers kind
**Problem:** `{ kind: "signalk", ...currentBinding, path }` spreads `currentBinding` after the kind, so a `{ kind: "local", id: "…" }` binding would restore `kind: "local"` and carry the stale `id` field.
**Fix:** Changed to always produce `{ kind: "signalk", path }` with no spread of currentBinding.
**Tests added:** `changing path when current value binding is kind:local produces a signalk binding with new path` in `Inspector.test.tsx`.

## I3 (Important, test quality) — validate.test.ts: tautological "ok iff" test
**Problem:** The test recomputed the same logic as the implementation and could never catch a regression.
**Fix:** Replaced with two concrete tests: `ok:false for a model with an element type that is completely unknown` (hand-crafted invalid model asserting `ok:false` + non-empty issues) and `ok:true for a valid model with zero error-severity issues` (navigation fixture asserting `ok:true` + zero error issues).

## I4 (Important, test quality) — SourceEditor.test.tsx: weak "issues list" tests
**Problem:** Both tests asserted only `toBeTruthy()` on the container element, which always exists.
**Fix 1:** The "semantically-invalid" test now asserts the first issue's message text appears in the list text. Also required initializing `SourceEditor`'s `issues` state from `validateModel` on mount (lazy initializer) so issues are visible immediately.
**Fix 2:** The "valid model" test now asserts `issuesList.querySelectorAll("li").length === 0`.

## M1 (Minor) — MidlEditor.tsx handleAddElement: `Date.now()` collision, uncaught throw
**Fix:** Replaced `` `el-${Date.now()}` `` with `crypto.randomUUID()`. Wrapped the entire handler body in `try/catch` to prevent uncaught throws propagating to React.

## M2 (Minor, security) — sanitize-svg.ts: data: href not stripped on image/use
**Fix:** Added `isDataUri()` helper and `DATA_HREF_STRIP_TAGS = Set(["image","use"])`; strip `data:` href/xlink:href on those elements in both the attribute loop and the explicit namespaced-href check.
**Tests added:** `strips data: href from <image> element`, `strips data: xlink:href from <use> element`.

## M3 (Important) — layout-ops.ts addElement: assertGrid guard removed
**Problem:** `addElement` called `assertGrid(m)` even though it only touches `m.elements`, causing it to throw on flow-layout models.
**Fix:** Removed the `assertGrid` call from `addElement`. Updated the existing test that expected a throw on flow-layout to assert the element is added successfully. Updated `MidlEditor.tsx handleAddElement` to skip cell-assignment on non-grid layouts.

## I6 (Important, concurrency) — MidlEditor.tsx: revisionRef reset to undefined after save
**Problem:** `revisionRef.current = undefined` after save, so the second save omits `expectedRevision`.
**Fix:** After a successful save, calls `store.get(savedId)` and reads `metadata.revision` into `revisionRef.current`. A `try/catch` preserves the pre-save value if the get fails (better than `undefined`). Includes a `// TODO` comment in the catch.
**Tests added:** `second consecutive save sends expectedRevision from the revision refreshed after first save` in `MidlEditor.test.tsx`.

## Results
- Tests: 125 passed (was 108 baseline; +17 new tests)
- Build: `npm run build:lib --workspace editor` succeeds, zero TypeScript errors
- All 9 test files pass
