# Task 0.6 Report — `<MidlEditor>` shell + live preview

## Status
COMPLETE — all tests pass.

## Files created
- `editor/src/usePreview.ts` — RAF-throttled preview hook; viewport derivation from className; last-good-svg holdback on validation errors.
- `editor/src/MidlEditor.tsx` — Editor shell with header bar (mode-toggle, theme-switch, class-switch, name-input, save-button), preview-host, mode-body, conflict-banner, and save-error-banner.
- `editor/src/MidlEditor.test.tsx` — 5 jsdom tests covering all specified behaviors.

## Test summary
81 passed (76 pre-existing + 5 new), 0 failed.

## Implementation notes

### usePreview
- `viewportForClass` parses `square-<N>` and `landscape-<W>x<H>`; falls back to 480×480.
- Uses stable `useRef` cells for all inputs to prevent stale closures in RAF callbacks.
- Cleanup cancels any pending RAF on unmount or dependency change.

### MidlEditor
- Async init: `store.get(initialId)` → `parseMidl` → model state; `manifestSource.get(className)` → manifest state.
- Class-switch triggers a manifest re-fetch via a second `useEffect` (skips first mount to avoid double-fetch).
- `dangerouslySetInnerHTML` is safe: the content is already run through `sanitizeSvg` (strips `<script>`, `<foreignObject>`, `on*` attrs, `javascript:` URIs) before assignment.
- Conflict banner exposes `data-action="overwrite"` and `data-action="reload"` buttons; overwrite retries without `expectedRevision`.

## Concerns
- The class-switch dropdown is pre-populated with three hardcoded classes (`square-480`, `landscape-800x480`, `landscape-1024x600`). A future task should derive this from the manifest.
- `revisionRef` is cleared to `undefined` after a successful save (the server sets the new revision). Future tasks should track the returned revision from the store's response metadata.
- `usePreview` opts object is re-created each render; the effect dependencies use `opts.theme` and `opts.className` primitives (not the object reference) to avoid spurious re-renders.
