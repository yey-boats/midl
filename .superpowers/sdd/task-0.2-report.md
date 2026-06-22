# Task 0.2 Report — Editor model + lossless MIDL⇄model round-trip

## Files created

- `editor/src/model.ts` — EditorElement, GridLayout, LayoutNode (union), EditorVariant, EditorModel, EditorError
- `editor/src/midl-io.ts` — parseMidl(source): EditorModel, serializeMidl(model, fmt): string
- `editor/src/__fixtures__/navigation.midl.yaml` — copied from midl/library
- `editor/src/__fixtures__/electrical.midl.yaml` — copied from midl/library
- `editor/src/__fixtures__/wind-steering.midl.yaml` — copied from midl/library
- `editor/src/midl-io.test.ts` — 16 TDD tests (written first, verified RED, then GREEN)

## Test command and output

```
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor && npx vitest run
```

```
 RUN  v1.6.1 /Users/borissorochkin/code/yey.boats/midl-editor/editor

 ✓ src/index.test.ts  (1 test) 1ms
 ✓ src/midl-io.test.ts  (16 tests) 120ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
   Start at  15:32:08
   Duration  1.11s (transform 147ms, setup 0ms, collect 341ms, tests 121ms, environment 952ms, prepare 119ms)
```

## Real ConfigDoc field names mapped

From `midl/ts/src/types.ts`:

| ConfigDoc field | EditorModel field | Notes |
|---|---|---|
| `doc.midl` | `model.midl` | Version string e.g. "1.0.0" |
| `screen.id` | `model.screenId` | e.g. "nav", "power", "dash" |
| `screen.meta.title` | `model.title` | Falls back to screenId if absent |
| `screen.elements` | `model.elements` | Record<string, Element> → Record<string, EditorElement> |
| `element.type` | `EditorElement.type` | e.g. "single-value", "compass", "trend" |
| `element.name` | `EditorElement.name` | Optional display name |
| `element.bindings` | `EditorElement.bindings` | Record<string, Source> → Record<string, BindingSource> |
| `element.format` | `EditorElement.format` | Record<string, unknown> e.g. `{unit: "nm"}` |
| `element.style` | `EditorElement.style` | Record<string, unknown> |
| `element.markers` | `EditorElement.markers` | Marker[] |
| `element.action` | `EditorElement.action` | Action |
| `element.zoom` | `EditorElement.zoom` | string |
| `element.meta` | `EditorElement.meta` | Meta object |
| `screen.layout` | `model.layout` | Node union — see below |
| `screen.variants` | `model.variants` | Variant[] → EditorVariant[] |
| `variant.class` | `EditorVariant.class` | e.g. "square-480" |
| `variant.layout` | `EditorVariant.layout` | Node → LayoutNode |

### Source union mapping

| Source kind | BindingSource fields |
|---|---|
| `{kind:"signalk", path:string}` | `{kind:"signalk", path}` |
| `{kind:"local", id:string}` | `{kind:"local", id}` |
| `{kind:"const", value:unknown}` | `{kind:"const", value}` |
| `{kind:"computed", expr?:string}` | `{kind:"computed", expr}` |

### Node / LayoutNode union

The `Node` type in ConfigDoc is a union:
- `{element: string}` — leaf reference to an element by id
- `{flow: "row"|"col", children: Node[], weights?: number[]}` — flow container
- `{rows: number, cols: number, cells: Node[]}` — grid container
- `{preset: string, slots?: string[]}` — preset reference

`EditorModel.layout` and `EditorVariant.layout` store a `LayoutNode` (mirrors the Node union verbatim). The spec requested `GridLayout {rows; cols; cells}` but the fixture files use BOTH grid and flow layouts — wind-steering.midl.yaml uses `flow: row`. Storing the raw Node shape losslessly is the only way to achieve a true fixed-point round-trip across all fixtures.

## Concerns

1. **GridLayout vs LayoutNode**: The task spec defines `GridLayout {rows; cols; cells}` but real fixtures have flow-based layouts. `model.ts` exports `GridLayout` as a separate interface (for callers that know they have grid layouts), but `EditorModel.layout` and `EditorVariant.layout` are typed as `LayoutNode` (the full union) to allow lossless round-trips. A future editor UI will likely restrict editing to grid layouts — the `GridLayout` interface is ready for that narrowing.

2. **Screen title fallback**: `screen.meta.title` is optional. When absent the model uses `screen.id` as title. On serialization we always write `meta: { title: model.title }`. This means a document without `screen.meta` will gain a `meta` block on first round-trip, which is a minor additive change but not a semantic loss.

3. **Top-level doc.meta**: The source MIDL files have top-level `meta` (e.g. `title: Navigation`, `tags`). This is NOT preserved in `EditorModel` (only screens[0] is in scope per the task spec). A round-trip serializes back without top-level meta. This is a known lossy boundary — the task scope is screens[0] only.

4. **Empty cells in grid**: Cells that are NOT `{element: string}` (e.g. empty `{}`) are preserved as `{}` in EditorModel and reconstructed as `{}` on serialization. Current fixtures don't have empty cells but the code handles them.

5. **TypeScript import of Marker/Action/Meta**: Uses inline `import type` in return position casts in midl-io.ts — works fine under bundler module resolution.

## Fix note (post-commit patch, 2026-06-22)

**Concern 3 resolved — doc-level `meta` now preserved losslessly.**

`EditorModel` gained a `docMeta?` field (typed as the `Meta` shape plus index signature for forward-compat). `parseMidl` copies `doc.meta` into `model.docMeta` when present; `serializeMidl` writes it back to `ConfigDoc.meta` when present and omits it when absent — no spurious empty meta on round-trip. Five new tests cover: (1) docMeta captured from navigation fixture, (2) yaml round-trip deep-equal for navigation, (3) json round-trip deep-equal for electrical, (4) no-meta doc stays stable, (5) full wind-steering model round-trip. All 22 tests pass.
