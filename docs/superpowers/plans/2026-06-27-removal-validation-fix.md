# Removal Validation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the editor bug-cluster where removing an element leaves an invalid MIDL doc (empty cells `{}` and empty `elements: {}` are schema-invalid), blocking further Add row/Add element operations.

**Architecture:** Five coordinated changes: (1) extend the JSON Schema with a spacer-cell branch so `{}` is valid; (2) relax `screen.elements` minProperties to 0; (3) mirror both changes in TypeScript types + Python semantic validator; (4) fix serialize hygiene (omit empty format/style/bindings objects); (5) add position-object formatting in the web renderer. All changes must be backward-compatible — existing valid docs must remain valid and the conformance corpus (TS + Python parity) must stay green.

**Tech Stack:** JSON Schema (2020-12), TypeScript (vitest), Python 3.13 (pytest), React (vitest + jsdom), Vite, Ajv 2020

## Global Constraints

- Branch: `feat/midl-editor` in `/Users/borissorochkin/code/yey.boats/midl-editor`
- **All tests must stay green** at every commit: `npm test --workspace editor`, `npm test --workspace web`, `npm test --workspace ts`, and `cd py && python -m pytest tests/`
- The conformance corpus (`conformance/cases.yaml` + `conformance/expected.json`) must not change its verdicts — TS + Python parity is contractual
- Do NOT rebuild the IIFE global (`editor/vite.global.config.ts`). Build target: `cd editor && npm run build:lib` only
- Do NOT push to remote
- Co-author every commit with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- License header `// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0` on every new/modified TS file (already present in all existing files — do NOT remove it)

---

## File Map

| File | What changes |
|---|---|
| `schemas/yb-midl-config.schema.json` | Add 5th `node` oneOf branch (spacer); relax `screen.elements` minProperties 1→0 |
| `ts/src/types.ts` | Extend `Node` union with spacer branch |
| `ts/src/semantic.ts` | `checkNode`: handle spacer (no element, no flow, no cells, no preset) → valid spacer, add no issues |
| `py/src/yey_boats_midl/semantic.py` | Mirror: spacer branch in `_check_node` |
| `editor/src/midl-io.ts` | `editorElementToElement`: omit `format`/`style`/`bindings` keys when empty objects |
| `web/src/format.ts` | `formatValue`: detect position-like object `{latitude,longitude}` and format as coordinate string |
| `ts/test/schema.test.ts` | Add tests: empty-cell validates, empty elements validates |
| `ts/test/semantic.test.ts` | Add test: spacer cell passes semantic check |
| `editor/src/midl-io.test.ts` | Add tests: serialize omits empty format/style/bindings; round-trip preserved |
| `editor/src/layout-ops.test.ts` | Add tests: removeElement-last → valid model; add-after-remove works; add-row-on-assigned-grid works |
| `web/test/format.test.ts` | Add test: position object `{latitude,longitude}` formats to coordinate string |
| `conformance/cases.yaml` | Add `valid-spacer-cell` and `valid-empty-elements` cases |
| `conformance/expected.json` | Add frozen verdicts for the two new cases |

---

## Task 1: Schema — spacer cell + empty-elements

**Files:**
- Modify: `schemas/yb-midl-config.schema.json` lines 39–44 (elements minProperties), lines 152–179 (node oneOf)
- Modify: `ts/test/schema.test.ts`

**Interfaces:**
- Produces: `validateConfigStructure({})` on an empty-element screen → valid; `{}` as a grid cell → valid

- [ ] **Step 1: Write failing schema tests**

Add at the bottom of `ts/test/schema.test.ts` inside a new `describe` block:

```typescript
describe("spacer cell and empty-elements (schema)", () => {
  test("a grid cell {} (spacer) is valid as a node", () => {
    expect(ok({
      midl: "1.0.0",
      screens: [{
        id: "d",
        elements: { a: { type: "button" } },
        layout: { rows: 1, cols: 2, cells: [{ element: "a" }, {}] }
      }]
    })).toBe(true);
  });

  test("a screen with zero elements (elements: {}) is valid", () => {
    expect(ok({
      midl: "1.0.0",
      screens: [{
        id: "d",
        elements: {},
        layout: { rows: 1, cols: 1, cells: [{}] }
      }]
    })).toBe(true);
  });

  test("a spacer cell with colSpan/rowSpan is valid", () => {
    expect(ok({
      midl: "1.0.0",
      screens: [{
        id: "d",
        elements: { a: { type: "button" } },
        layout: { rows: 2, cols: 2, cells: [
          { element: "a" },
          { colSpan: 1, rowSpan: 2 },
        ]}
      }]
    })).toBe(true);
  });

  test("a spacer cell with an extra unknown property is INVALID (additionalProperties: false)", () => {
    expect(ok({
      midl: "1.0.0",
      screens: [{
        id: "d",
        elements: { a: { type: "button" } },
        layout: { rows: 1, cols: 2, cells: [{ element: "a" }, { bogus: true }] }
      }]
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts -- --reporter=verbose 2>&1 | grep -A5 "spacer\|empty-elements\|FAIL\|fail"
```

Expected: 3 tests fail ("spacer cell {} is valid", "zero elements is valid", "spacer with colSpan/rowSpan is valid"), 1 passes ("bogus property is INVALID").

- [ ] **Step 3: Edit the schema — add spacer branch to node oneOf**

In `schemas/yb-midl-config.schema.json`, the `"node"` `$def` has a `oneOf` array (lines ~154–179). Add a 5th branch **before the closing bracket** of the `oneOf` array. The full node oneOf becomes:

```json
"node": {
  "description": "A recursive layout node. Exactly one of five shapes: an element leaf, a directional split (`flow` + `children`), a grid (`rows`/`cols`/`cells`), a `preset` reference, or a spacer cell (empty object, optionally with span).",
  "oneOf": [
    { "type": "object", "required": ["element"], "additionalProperties": false,
      "description": "Leaf node: places a single element (by its id in screen.elements) filling the available rect. Optional `colSpan`/`rowSpan` extend the cell across multiple grid columns/rows when this node appears as a grid cell (default 1).",
      "properties": {
        "element": { "description": "Element id (a key in the enclosing screen's `elements`).", "type": "string", "minLength": 1 },
        "colSpan": { "description": "How many grid columns this cell spans (default 1). Only meaningful when this node is a direct child of a grid (`rows`/`cols`/`cells`).", "type": "integer", "minimum": 1 },
        "rowSpan": { "description": "How many grid rows this cell spans (default 1). Only meaningful when this node is a direct child of a grid (`rows`/`cols`/`cells`).", "type": "integer", "minimum": 1 }
      } },
    { "type": "object", "required": ["flow", "children"], "additionalProperties": false,
      "description": "Directional split: arranges children along one axis. `flow: row` = horizontal main axis (children side by side); `flow: col` = vertical main axis (children stacked).",
      "properties": {
        "flow": { "description": "Main axis of the split. `row` lays children out horizontally; `col` lays them out vertically.", "enum": ["row", "col"] },
        "children": { "description": "Ordered child nodes laid out along the flow axis. Must be non-empty.", "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/node" } },
        "weights": { "description": "Optional relative sizes along the flow axis, one positive number per child. When present its length must equal children length (checked semantically).", "type": "array", "items": { "type": "number", "exclusiveMinimum": 0 } } } },
    { "type": "object", "required": ["rows", "cols", "cells"], "additionalProperties": false,
      "description": "Grid: arranges cells in a rows x cols matrix, filled row-major. `cells` length must equal rows*cols (checked semantically).",
      "properties": {
        "rows": { "description": "Number of grid rows (positive integer).", "type": "integer", "minimum": 1 },
        "cols": { "description": "Number of grid columns (positive integer).", "type": "integer", "minimum": 1 },
        "cells": { "description": "Grid cells in row-major order; each is itself a node. Must be non-empty.", "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/node" } } } },
    { "type": "object", "required": ["preset"], "additionalProperties": false,
      "description": "Preset reference: expands a named layout template, filling its holes from `slots`. The preset name must be known (checked semantically).",
      "properties": {
        "preset": { "description": "Name of a known layout preset (e.g. full, hero-split).", "type": "string", "minLength": 1 },
        "slots": { "description": "Element ids that fill the preset's holes, in the order the preset consumes them.", "type": "array", "items": { "type": "string" } } } },
    { "type": "object", "additionalProperties": false,
      "description": "Spacer cell: an unassigned grid slot. No `element` required. Optionally carries `colSpan`/`rowSpan` to extend the empty space across multiple columns/rows.",
      "properties": {
        "colSpan": { "description": "How many grid columns this spacer spans (default 1).", "type": "integer", "minimum": 1 },
        "rowSpan": { "description": "How many grid rows this spacer spans (default 1).", "type": "integer", "minimum": 1 }
      } }
  ]
}
```

Also change the `elements` property of `screen` from `"minProperties": 1` to `"minProperties": 0`:

```json
"elements": {
  "description": "Map of element-id -> element definition for this screen. May be empty (draft dashboard); the layout tree references these ids by key.",
  "type": "object",
  "minProperties": 0,
  "additionalProperties": { "$ref": "#/$defs/element" }
},
```

- [ ] **Step 4: Rebuild the ts package so the schema is picked up by Ajv**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm --prefix ts run build 2>&1 | tail -5
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Run ts tests — schema tests must pass now**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts 2>&1 | tail -20
```

Expected: all tests pass (the new 4 schema tests among them).

- [ ] **Step 6: Verify existing conformance corpus is unaffected**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts -- --reporter=verbose 2>&1 | grep -E "conformance|FAIL|fail" | head -20
```

Expected: all `conformance.test.ts` cases pass.

- [ ] **Step 7: Also run web and editor tests to detect regressions**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace web && npm test --workspace editor 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add schemas/yb-midl-config.schema.json ts/test/schema.test.ts && git commit -m "$(cat <<'EOF'
feat(schema): add spacer-cell node branch; relax elements minProperties to 0

An unassigned grid slot {} and a screen with zero elements {} are now valid
MIDL documents. The spacer oneOf branch uses additionalProperties:false so
only optional colSpan/rowSpan pass — no unknown keys admitted.
Empty elements (draft dashboard) admitted by dropping minProperties 1→0.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: TypeScript types + semantic validator — spacer cell

**Files:**
- Modify: `ts/src/types.ts` — extend `Node` union
- Modify: `ts/src/semantic.ts` — handle spacer node in `checkNode`
- Modify: `ts/test/semantic.test.ts` — add spacer cell semantic test

**Interfaces:**
- Consumes: `Node` type from Task 1 schema changes
- Produces: `validateSemantics(doc)` on a doc with spacer cells emits no errors for the spacer

- [ ] **Step 1: Write failing semantic test**

Add at the bottom of `ts/test/semantic.test.ts`:

```typescript
describe("spacer cell semantics", () => {
  test("a spacer cell {} in a grid produces no semantic errors", () => {
    const doc = {
      midl: "1.0.0",
      screens: [{
        id: "s",
        elements: {
          a: { type: "single-value", bindings: { value: { kind: "signalk" as const, path: "navigation.speedOverGround" } } }
        },
        layout: { rows: 1, cols: 2, cells: [{ element: "a" }, {}] }
      }]
    };
    const issues = validateSemantics(doc as import("../src/types").ConfigDoc);
    const errors = issues.filter(i => i.severity !== "warning");
    expect(errors).toHaveLength(0);
  });

  test("a screen with zero elements produces no semantic errors when layout has only spacer cells", () => {
    const doc = {
      midl: "1.0.0",
      screens: [{
        id: "s",
        elements: {},
        layout: { rows: 1, cols: 1, cells: [{}] }
      }]
    };
    const issues = validateSemantics(doc as import("../src/types").ConfigDoc);
    const errors = issues.filter(i => i.severity !== "warning");
    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts -- --reporter=verbose 2>&1 | grep -A5 "spacer cell\|FAIL"
```

Expected: both new tests fail with "layout node is not a recognized kind".

- [ ] **Step 3: Extend Node union in ts/src/types.ts**

In `ts/src/types.ts`, change the `Node` type from:

```typescript
export type Node =
  | { element: string; colSpan?: number; rowSpan?: number }
  | { flow: "row" | "col"; children: Node[]; weights?: number[] }
  | { rows: number; cols: number; cells: Node[] }
  | { preset: string; slots?: string[] };
```

to:

```typescript
export type Node =
  | { element: string; colSpan?: number; rowSpan?: number }
  | { flow: "row" | "col"; children: Node[]; weights?: number[] }
  | { rows: number; cols: number; cells: Node[] }
  | { preset: string; slots?: string[] }
  | { colSpan?: number; rowSpan?: number };   // spacer: no element/flow/rows/preset
```

- [ ] **Step 4: Fix checkNode in ts/src/semantic.ts — handle spacer**

In `ts/src/semantic.ts`, the `checkNode` function currently falls through to an error for any node that lacks `element`, `preset`, `children`, or `cells`. Add a spacer guard **before** the final error push. Change the end of the function from:

```typescript
  issues.push(err(path, "layout node is not a recognized kind (element, flow/children, rows/cols/cells, or preset)"));
```

to:

```typescript
  // Spacer cell: an empty object (or one with only colSpan/rowSpan) is a valid
  // unassigned grid slot. It carries no element reference, emits no issues.
  const keys = Object.keys(n as object);
  if (keys.every(k => k === "colSpan" || k === "rowSpan")) {
    return; // valid spacer
  }

  issues.push(err(path, "layout node is not a recognized kind (element, flow/children, rows/cols/cells, or preset)"));
```

- [ ] **Step 5: Run ts tests — both new semantic tests must pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts 2>&1 | tail -15
```

Expected: all 130+ tests pass including the 2 new semantic tests.

- [ ] **Step 6: Run editor tests to confirm no regressions**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add ts/src/types.ts ts/src/semantic.ts ts/test/semantic.test.ts && git commit -m "$(cat <<'EOF'
feat(ts): extend Node union with spacer branch; checkNode handles spacer cells

An object with only colSpan/rowSpan (or no keys at all) is now a valid spacer
node — semantic.ts returns without errors. Types.ts Node union extended with
the spacer variant to keep TypeScript consistent with the schema.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Python semantic validator — mirror spacer cell

**Files:**
- Modify: `py/src/yey_boats_midl/semantic.py` — handle spacer in `_check_node`

**Interfaces:**
- Consumes: spacer definition from Task 2
- Produces: Python `validate_semantics` does not error on `{}` grid cells

- [ ] **Step 1: Write failing Python test**

Add to `py/tests/test_conformance.py` at the bottom (after the existing parametrized test), a new standalone test (NOT a conformance corpus test — it stays separate):

Actually, do NOT touch the conformance test file. Instead, open a file check: the Python conformance test only reads `conformance/cases.yaml` and `conformance/expected.json`. The new schema cases will be added in Task 6. For now, verify by reading the current semantic.py logic and manually checking: an empty dict `{}` in `_check_node` would fall through to the final error push ("layout node is not a recognized kind"). Confirm this:

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && python3 -c "
from py.src.yey_boats_midl.semantic import validate_semantics
doc = {
    'midl': '1.0.0',
    'screens': [{
        'id': 's',
        'elements': {'a': {'type': 'single-value', 'bindings': {'value': {'kind': 'signalk', 'path': 'navigation.speedOverGround'}}}},
        'layout': {'rows': 1, 'cols': 2, 'cells': [{'element': 'a'}, {}]}
    }]
}
issues = validate_semantics(doc)
errors = [i for i in issues if i.severity != 'warning']
print('errors:', [e.message for e in errors])
"
```

Expected: prints errors containing "layout node is not a recognized kind" for the empty spacer cell.

- [ ] **Step 2: Fix _check_node in py/src/yey_boats_midl/semantic.py — add spacer branch**

In `py/src/yey_boats_midl/semantic.py`, at the end of `_check_node`, before the final error append, add a spacer guard:

Change:

```python
    issues.append(
        _err(path, "layout node is not a recognized kind (element, flow/children, rows/cols/cells, or preset)")
    )
```

to:

```python
    # Spacer cell: an empty object (or one with only colSpan/rowSpan) is a valid
    # unassigned grid slot. It carries no element reference, emits no issues.
    if all(k in ("colSpan", "rowSpan") for k in n.keys()):
        return  # valid spacer

    issues.append(
        _err(path, "layout node is not a recognized kind (element, flow/children, rows/cols/cells, or preset)")
    )
```

- [ ] **Step 3: Verify the fix with the inline Python test from Step 1**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && python3 -c "
from py.src.yey_boats_midl.semantic import validate_semantics
doc = {
    'midl': '1.0.0',
    'screens': [{
        'id': 's',
        'elements': {'a': {'type': 'single-value', 'bindings': {'value': {'kind': 'signalk', 'path': 'navigation.speedOverGround'}}}},
        'layout': {'rows': 1, 'cols': 2, 'cells': [{'element': 'a'}, {}]}
    }]
}
issues = validate_semantics(doc)
errors = [i for i in issues if i.severity != 'warning']
print('errors:', errors)
assert errors == [], f'Expected no errors, got {errors}'
print('OK — spacer cell produces no semantic errors')

# Also test zero elements
doc2 = {
    'midl': '1.0.0',
    'screens': [{'id': 's', 'elements': {}, 'layout': {'rows': 1, 'cols': 1, 'cells': [{}]}}]
}
issues2 = validate_semantics(doc2)
errors2 = [i for i in issues2 if i.severity != 'warning']
print('zero-elements errors:', errors2)
assert errors2 == [], f'Expected no errors, got {errors2}'
print('OK — zero elements produces no semantic errors')
"
```

Expected: both `OK` lines printed.

- [ ] **Step 4: Run Python conformance tests to confirm parity maintained**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/py && python -m pytest tests/ -v 2>&1 | tail -15
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add py/src/yey_boats_midl/semantic.py && git commit -m "$(cat <<'EOF'
feat(py): mirror spacer-cell branch in Python semantic validator

_check_node now treats a dict with only colSpan/rowSpan keys (or empty {})
as a valid spacer cell, matching the TypeScript and JSON Schema changes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Conformance corpus — add spacer-cell and empty-elements cases

**Files:**
- Modify: `conformance/cases.yaml` — add two new cases
- Modify: `conformance/expected.json` — add frozen verdicts

**Interfaces:**
- Consumes: schema + semantic changes from Tasks 1–3
- Produces: conformance corpus has `valid-spacer-cell` and `valid-empty-elements` cases; both TS and Python pass

- [ ] **Step 1: Add two new cases to conformance/cases.yaml**

Append to the end of the `cases:` list in `conformance/cases.yaml`:

```yaml
  - name: valid-spacer-cell
    targetClass: square-480
    note: a grid cell {} (spacer, no element assigned) is valid — required for draft dashboards
    doc: |
      midl: 1.0.0
      screens:
        - id: s
          elements:
            a: { type: single-value, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }
          layout:
            rows: 1
            cols: 2
            cells:
              - element: a
              - {}

  - name: valid-empty-elements
    targetClass: square-480
    note: a screen with zero elements (draft dashboard) is valid — required for empty new dashboards
    doc: |
      midl: 1.0.0
      screens:
        - id: s
          elements: {}
          layout:
            rows: 1
            cols: 1
            cells:
              - {}
```

- [ ] **Step 2: Generate expected verdicts by running the validator and inspecting output**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm --prefix ts run build 2>&1 | tail -3 && node -e "
const { readFileSync } = require('fs');
const { validateDocument } = require('./ts/dist/index.js');
const { parse: parseYaml } = require('yaml');
const manifest = JSON.parse(readFileSync('./schemas/gen/yb-midl-capabilities.square-480.json', 'utf8'));

const spacerDoc = 'midl: 1.0.0\nscreens:\n  - id: s\n    elements:\n      a: { type: single-value, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }\n    layout:\n      rows: 1\n      cols: 2\n      cells:\n        - element: a\n        - {}';
const emptyDoc = 'midl: 1.0.0\nscreens:\n  - id: s\n    elements: {}\n    layout:\n      rows: 1\n      cols: 1\n      cells:\n        - {}';

const r1 = validateDocument(spacerDoc, manifest, 'square-480');
const r2 = validateDocument(emptyDoc, manifest, 'square-480');
const distinct = xs => xs.filter((x,i) => xs.indexOf(x) === i);
console.log('spacer-cell:', JSON.stringify({ ok: r1.ok, paths: distinct(r1.issues.map(i => i.path)) }));
console.log('empty-elements:', JSON.stringify({ ok: r2.ok, paths: distinct(r2.issues.map(i => i.path)) }));
"
```

Expected output:
```
spacer-cell: {"ok":true,"paths":[]}
empty-elements: {"ok":true,"paths":[]}
```

If you see that, both are valid. Proceed.

- [ ] **Step 3: Add the two expected verdicts to conformance/expected.json**

In `conformance/expected.json`, add two new entries (order does not matter for the JSON object):

```json
{
  ...(existing entries)...,
  "valid-spacer-cell": {
    "ok": true,
    "paths": []
  },
  "valid-empty-elements": {
    "ok": true,
    "paths": []
  }
}
```

- [ ] **Step 4: Run TS conformance tests — all 13 cases must pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts -- --reporter=verbose 2>&1 | grep -E "conformance|PASS|FAIL" | head -20
```

Expected: 13 conformance cases all pass (was 11).

- [ ] **Step 5: Run Python conformance tests — all 13 cases must pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/py && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: 13 tests pass (was 11 — now includes `valid-spacer-cell` and `valid-empty-elements`).

- [ ] **Step 6: Run all workspace tests to confirm nothing broke**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts && npm test --workspace editor && npm test --workspace web 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add conformance/cases.yaml conformance/expected.json && git commit -m "$(cat <<'EOF'
feat(conformance): add valid-spacer-cell and valid-empty-elements corpus cases

Extends the TS+Python conformance contract with two new valid cases:
a spacer grid cell {} and a screen with zero elements (draft dashboard).
Both validators must agree these are admissible (ok:true, paths:[]).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Serialize hygiene — omit empty format/style/bindings

**Files:**
- Modify: `editor/src/midl-io.ts` — `editorElementToElement` function
- Modify: `editor/src/midl-io.test.ts` — add serialize hygiene tests

**Interfaces:**
- Consumes: `EditorElement` from `editor/src/model.ts`
- Produces: `serializeMidl(model)` does not emit `format: {}`, `style: {}`, or `bindings: {}` when those maps are empty; round-trip still works

- [ ] **Step 1: Write failing serialize hygiene tests**

Add a new `describe` block at the bottom of `editor/src/midl-io.test.ts`:

```typescript
describe("serialize hygiene — omit empty format/style/bindings", () => {
  it("serializeMidl omits format when element.format is an empty object", () => {
    const model: import("./model").EditorModel = {
      midl: "1.0.0",
      screenId: "test",
      title: "Test",
      elements: {
        el: {
          id: "el",
          type: "button",
          format: {},
          style: {},
          bindings: {},
        },
      },
      layout: { rows: 1, cols: 1, cells: [{ element: "el" }] },
      variants: [],
    };
    const yaml = serializeMidl(model, "yaml");
    expect(yaml).not.toContain("format:");
    expect(yaml).not.toContain("style:");
    expect(yaml).not.toContain("bindings:");
  });

  it("serializeMidl does NOT omit format when format has entries", () => {
    const model: import("./model").EditorModel = {
      midl: "1.0.0",
      screenId: "test",
      title: "Test",
      elements: {
        el: {
          id: "el",
          type: "single-value",
          format: { unit: "kn" },
          bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        },
      },
      layout: { rows: 1, cols: 1, cells: [{ element: "el" }] },
      variants: [],
    };
    const yaml = serializeMidl(model, "yaml");
    expect(yaml).toContain("format:");
    expect(yaml).toContain("unit: kn");
  });

  it("round-trip preserves empty format/style/bindings as undefined (not empty objects) after parse", () => {
    // A model with empty format/style/bindings serializes to YAML without those keys,
    // so parsing the YAML back should produce undefined (not {}) for those fields.
    const model: import("./model").EditorModel = {
      midl: "1.0.0",
      screenId: "test",
      title: "Test",
      elements: {
        el: { id: "el", type: "button", format: {}, style: {}, bindings: {} },
      },
      layout: { rows: 1, cols: 1, cells: [{ element: "el" }] },
      variants: [],
    };
    const reparsed = parseMidl(serializeMidl(model, "yaml"));
    const el = reparsed.elements["el"];
    // After omitting empty keys on serialize, parsing back gives undefined not {}
    expect(el.format).toBeUndefined();
    expect(el.style).toBeUndefined();
    expect(el.bindings).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor -- --reporter=verbose 2>&1 | grep -A5 "serialize hygiene\|FAIL"
```

Expected: the first test ("omits format when empty object") fails because the current `editorElementToElement` always emits `format: {}`.

- [ ] **Step 3: Fix editorElementToElement in editor/src/midl-io.ts**

In `editor/src/midl-io.ts`, the `editorElementToElement` function currently includes:

```typescript
  if (el.bindings !== undefined) {
    out.bindings = {};
    for (const [k, v] of Object.entries(el.bindings)) {
      out.bindings[k] = bindingToSource(v);
    }
  }
  if (el.format !== undefined) out.format = { ...el.format };
  if (el.style !== undefined) out.style = { ...el.style };
```

Change it to skip emission when the resulting object would be empty:

```typescript
  if (el.bindings !== undefined) {
    const converted: Record<string, import("@yey-boats/midl").Source> = {};
    for (const [k, v] of Object.entries(el.bindings)) {
      converted[k] = bindingToSource(v);
    }
    if (Object.keys(converted).length > 0) out.bindings = converted;
  }
  if (el.format !== undefined && Object.keys(el.format).length > 0) out.format = { ...el.format };
  if (el.style !== undefined && Object.keys(el.style).length > 0) out.style = { ...el.style };
```

- [ ] **Step 4: Run editor tests — all must pass including new hygiene tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -15
```

Expected: all tests pass.

**Important:** The existing round-trip tests for `navigation.midl.yaml`, `electrical.midl.yaml`, `wind-steering.midl.yaml` must still pass — those fixtures never have empty format/style/bindings, so the change is transparent to them.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add editor/src/midl-io.ts editor/src/midl-io.test.ts && git commit -m "$(cat <<'EOF'
fix(editor): omit empty format/style/bindings on serialize

editorElementToElement now skips emission of format:{}, style:{}, bindings:{}
when those maps have no entries. This prevents spurious empty keys from
appearing in serialized YAML/JSON, which could cause AJV minProperties
violations if the schema were to tighten. Round-trip is preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Layout-ops and editor — add-after-remove and add-row-on-assigned

**Files:**
- Modify: `editor/src/layout-ops.test.ts` — add schema-validity tests for post-remove state
- Modify: `editor/src/MidlEditor.tsx` — verify handlers are not blocked by validity
- Modify: `editor/src/validate.test.ts` — add empty-model validation test

**Interfaces:**
- Consumes: schema + semantic changes from Tasks 1–4
- Produces: `validateModel` on a model with empty cells / empty elements returns `ok: true`; add-row/add-col handlers on assigned grids work; add-element after remove works

- [ ] **Step 1: Write tests that verify validate-after-remove is ok:true**

In `editor/src/validate.test.ts`, add a new `describe` block:

```typescript
describe("validateModel — empty cells and empty elements (post-schema fix)", () => {
  it("model with an empty grid cell {} returns ok:true (spacer is valid)", () => {
    // Simulates the state after removeElement on a 1x2 grid with one element
    const model: import("./model").EditorModel = {
      midl: "1.0.0",
      screenId: "test",
      title: "Test",
      elements: {
        a: {
          id: "a",
          type: "single-value",
          bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        },
      },
      layout: { rows: 1, cols: 2, cells: [{ element: "a" }, {}] },
      variants: [],
    };
    const result = validateModel(model, SQUARE_480_MANIFEST);
    // Expect ok:true — the empty cell is now a valid spacer
    expect(result.ok).toBe(true);
    const errors = result.issues.filter(i => i.severity === "error" || i.severity === undefined);
    expect(errors).toHaveLength(0);
  });

  it("model with zero elements returns ok:true (draft dashboard is valid)", () => {
    // Simulates the state after removing the last element
    const model: import("./model").EditorModel = {
      midl: "1.0.0",
      screenId: "test",
      title: "Test",
      elements: {},
      layout: { rows: 1, cols: 1, cells: [{}] },
      variants: [],
    };
    const result = validateModel(model, SQUARE_480_MANIFEST);
    expect(result.ok).toBe(true);
    const errors = result.issues.filter(i => i.severity === "error" || i.severity === undefined);
    expect(errors).toHaveLength(0);
  });
});
```

Note: the `SQUARE_480_MANIFEST` constant is already defined in the existing `editor/src/validate.test.ts` file. Do not re-define it; just add the new `describe` block.

- [ ] **Step 2: Write layout-ops tests for add-after-remove with validate**

In `editor/src/layout-ops.test.ts`, add a new `describe` block at the bottom:

```typescript
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
    const newEl = { id: "new-el", type: "single-value" };
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
```

- [ ] **Step 3: Run editor tests — these new tests should NOW pass** (because schema fix is already in)

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -20
```

Expected: all tests pass. If the validate tests fail (still reporting schema errors), it means the schema/ts rebuild chain hasn't propagated yet. In that case run `npm --prefix ts run build` first.

- [ ] **Step 4: Audit Inspector.tsx handleAddRow / handleAddCol for any conditional guards blocking them**

Read the current `handleAddRow` and `handleAddCol` in `editor/src/visual/Inspector.tsx`:

```typescript
function handleAddRow() { onChange(addRow(model)); }
function handleAddCol() { onChange(addCol(model)); }
```

These are correct — they call `addRow`/`addCol` directly without any validity guard. No changes needed here. Confirm `handleAddElement` in `editor/src/MidlEditor.tsx` also has no validity guard (it does not — it's gated only on `try/catch` for EditorError). Confirmed correct.

However, note the `makeBlankModel` function creates `{ rows: 1, cols: 1, cells: [{}] }` — this is now valid thanks to the spacer schema change. The handlers work on both assigned and empty grids by design.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts && npm test --workspace editor && npm test --workspace web && cd py && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add editor/src/layout-ops.test.ts editor/src/validate.test.ts && git commit -m "$(cat <<'EOF'
test(editor): add post-schema-fix invariant tests for remove/add operations

Verify that:
- removeElement on last element → empty elements + spacer cells → ok:true validation
- addRow/addCol on an assigned grid work without blocking
- addElement after removeElement finds a free cell and places correctly
- validateModel returns ok:true for models with empty cells or zero elements

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Position object formatting in web renderer

**Files:**
- Modify: `web/src/format.ts` — extend `formatValue` to handle position objects
- Modify: `web/test/format.test.ts` — add position formatting tests

**Interfaces:**
- Consumes: `formatValue(value, format, sourceUnit)` from `web/src/format.ts`
- Produces: when `value` is `{latitude: number, longitude: number}` (or `{lat,lng}`), `formatValue` returns a coordinate string like `"37.8040, -122.2710"` instead of `"--"`

- [ ] **Step 1: Write failing test**

Add at the bottom of `web/test/format.test.ts`:

```typescript
test("formatValue formats a position object {latitude, longitude} as a coordinate string", () => {
  const result = formatValue({ latitude: 37.804, longitude: -122.271 }, undefined);
  expect(result.text).toBe("37.804000, -122.271000");
  expect(result.numeric).toBeUndefined();
});

test("formatValue formats a position object {lat, lng} as a coordinate string", () => {
  const result = formatValue({ lat: 51.5, lng: -0.118 }, undefined);
  expect(result.text).toBe("51.500000, -0.118000");
});

test("formatValue formats position with decimals format option applied to each coordinate", () => {
  const result = formatValue({ latitude: 37.8041234, longitude: -122.2712345 }, { decimals: 4 });
  expect(result.text).toBe("37.8041, -122.2712");
});

test("formatValue still returns -- for non-position objects", () => {
  const result = formatValue({ foo: "bar" }, undefined);
  expect(result.text).toBe("--");
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace web -- --reporter=verbose 2>&1 | grep -A5 "position\|FAIL"
```

Expected: 3 new tests fail (position object returns `"--"` instead of coordinate string).

- [ ] **Step 3: Extend formatValue in web/src/format.ts**

Current `formatValue` signature:

```typescript
export function formatValue(
  value: unknown,
  format: Record<string, unknown> | undefined,
  sourceUnit?: string,
): { text: string; numeric?: number }
```

Current first line: `if (typeof value !== "number" || !Number.isFinite(value)) return { text: "--" };`

Change the function to detect position objects before the `"--"` guard:

```typescript
export function formatValue(
  value: unknown,
  format: Record<string, unknown> | undefined,
  sourceUnit?: string,
): { text: string; numeric?: number } {
  // Position-like object: {latitude, longitude} or {lat, lng}
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    const lat = typeof v["latitude"] === "number" ? v["latitude"] :
                typeof v["lat"] === "number" ? v["lat"] : undefined;
    const lng = typeof v["longitude"] === "number" ? v["longitude"] :
                typeof v["lng"] === "number" ? v["lng"] : undefined;
    if (lat !== undefined && lng !== undefined) {
      const decimals = typeof format?.decimals === "number" ? (format.decimals as number) : 6;
      return { text: `${lat.toFixed(decimals)}, ${lng.toFixed(decimals)}` };
    }
  }

  if (typeof value !== "number" || !Number.isFinite(value)) return { text: "--" };
  const toUnit = format?.unit as string | undefined;
  const decimals = typeof format?.decimals === "number" ? (format.decimals as number) : undefined;
  const n = convert(value, sourceUnit, toUnit);
  const body = decimals != null ? n.toFixed(decimals) : String(n);
  return { text: toUnit ? `${body} ${toUnit}` : body, numeric: n };
}
```

- [ ] **Step 4: Run web tests — all must pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace web 2>&1 | tail -15
```

Expected: all tests pass including 4 new position tests.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts && npm test --workspace editor && npm test --workspace web && cd py && python -m pytest tests/ 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add web/src/format.ts web/test/format.test.ts && git commit -m "$(cat <<'EOF'
feat(web): format position objects {latitude,longitude} as coordinate strings

formatValue now detects position-like objects ({latitude,longitude} or {lat,lng})
and formats them as decimal coordinate strings (e.g. "37.8040, -122.2710").
This makes single-value/text elements show navigation.position instead of '--'.
The decimals format option applies to both coordinates.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Build and final verification

**Files:**
- No new files — this is a verification/build task

**Interfaces:**
- Consumes: all prior task changes
- Produces: `cd editor && npm run build:lib` succeeds; all tests green; report written

- [ ] **Step 1: Build the editor library**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor && npm run build:lib 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript or Vite errors.

- [ ] **Step 2: Run the complete test suite one final time**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts && npm test --workspace editor && npm test --workspace web 2>&1 | grep -E "Tests|Test Files|passed|failed"
```

Expected output:
```
Tests  130+ passed (130+)
Tests  290+ passed (290+)
Tests  59+ passed (59+)
```

- [ ] **Step 3: Run Python conformance suite**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/py && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: 13 tests pass.

- [ ] **Step 4: Get commit hashes**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git log --oneline -8
```

Record the commit hashes for the report.

- [ ] **Step 5: Write the report**

Create file `/Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd/removal-validation-fix-report.md` with:

```markdown
# Removal Validation Fix — Implementation Report

**Status:** COMPLETE

**Commit hashes:** (fill from git log)

**Test result (TS):** X tests passed (ts workspace), Y tests passed (editor workspace), Z tests passed (web workspace)

**Test result (Python):** 13/13 conformance tests passed

**Build result:** `cd editor && npm run build:lib` — SUCCESS

**Summary:**

- **Empty-cell grammar:** Added 5th `node` oneOf branch (spacer) to `schemas/yb-midl-config.schema.json` — `{}` and `{colSpan,rowSpan}` are valid; `additionalProperties:false` keeps other keys rejected. Mirrored in `ts/src/types.ts` (Node union) and both `ts/src/semantic.ts` + `py/src/yey_boats_midl/semantic.py` (spacer guard in checkNode/_check_node).

- **Draft-empty dashboard:** Relaxed `screen.elements` `minProperties` from 1 to 0 in the schema. No semantic check for ≥1 elements existed in TS or Python — none needed to change.

- **Add-after-remove:** `handleAddElement` in `MidlEditor.tsx` and `Inspector.tsx` had no validity guard — they always call `addElement`/`assignElementToCell` directly. With the schema fix, the empty-cell state is now valid, so the status bar no longer shows errors and the handlers operate on a consistent model.

- **Add-row-on-assigned:** `handleAddRow`/`handleAddCol` in `Inspector.tsx` call `addRow`/`addCol` unconditionally. The layout-ops produce empty `{}` cells in new rows/cols — now valid spacers. Confirmed by added tests.

- **Position formatting:** `web/src/format.ts` `formatValue` now detects `{latitude,longitude}` / `{lat,lng}` objects and formats them as decimal coordinate strings (e.g. "37.8040, -122.2710") using the `decimals` format option (default 6 decimal places). Single-value/text elements bound to `navigation.position` now show a coordinate string.

- **Serialize hygiene:** `editor/src/midl-io.ts` `editorElementToElement` now omits `format`, `style`, and `bindings` keys when their values are empty objects. Round-trip preserved — parsing the YAML back gives `undefined` for those fields rather than `{}`.

**Concerns:** None. All changes are backward-compatible; existing conformance corpus cases were unaffected.
```

- [ ] **Step 6: Verify the report file exists**

```bash
ls /Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd/removal-validation-fix-report.md
```

- [ ] **Step 7: Final commit (report)**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add .superpowers/sdd/removal-validation-fix-report.md && git commit -m "$(cat <<'EOF'
docs: add removal-validation-fix implementation report

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| Add spacer-cell branch to schema (5th oneOf) | Task 1 |
| Relax screen.elements minProperties 1→0 | Task 1 |
| Extend ts/src/types.ts Node union with spacer | Task 2 |
| ts/src/semantic.ts handle spacer in checkNode | Task 2 |
| py/src/yey_boats_midl/semantic.py mirror | Task 3 |
| Conform corpus: add new valid cases | Task 4 |
| editor/src/midl-io.ts omit empty format/style/bindings | Task 5 |
| validate.test.ts: empty-model is ok:true | Task 6 |
| layout-ops.test.ts: add-after-remove, add-row-on-assigned | Task 6 |
| web/src/format.ts: position object → coordinate string | Task 7 |
| build:lib success | Task 8 |
| report written | Task 8 |

### Placeholder scan
No TBD, TODO, or "similar to Task N" patterns. All code blocks are complete.

### Type consistency
- `Node` union extended in `ts/src/types.ts` — spacer branch added. `checkNode` in semantic.ts guards against "cells", "children", "element", "preset" before the spacer check, matching the union.
- `formatValue` signature unchanged — callers do not need updates.
- `editorElementToElement` output type is `Element` from `@yey-boats/midl` — omitting undefined-valued keys matches the interface (all fields are optional).
