# Data Elements View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four UX features to the midl-editor: a placed-elements "Layout" panel (left-rail tab), collapsible DataTree groups, icon+description Palette items, and a prominent live-readout in the Inspector binding section.

**Architecture:** Each part maps to a single file change (or one new test file + one modified component). The left-rail tab set grows from `["elements", "data"]` to `["elements", "data", "layout"]`; the Layout tab is a new component `ElementsList`. DataTree gains local collapse state per group. Palette items gain inline SVG icons and description text. Inspector's existing `live-value-readout` div is promoted to a larger `data-testid="live-readout"` block (the old `live-value-readout` remains for backward-compat with existing tests).

**Tech Stack:** React 18 (functional components, hooks), Vitest + @testing-library/react (jsdom), TypeScript strict, no new npm deps.

## Global Constraints

- `npm test --workspace editor` must remain green (currently 246 tests passing).
- Work only in `/Users/borissorochkin/code/yey.boats/midl-editor/editor` on branch `feat/midl-editor`.
- No new npm dependencies.
- All new `data-testid` values match the spec exactly: `tab-layout`, `elements-list`, `element-row-<cellIndex>`, `element-row-remove-<cellIndex>`, `data-group-<name>`, `palette-<type>` (unchanged), `live-readout`.
- Design tokens: use CSS variables from `midl-editor.css` (e.g. `var(--line)`, `var(--accent)`, `var(--ink-faint)`, `var(--elev)`, `var(--online)`, `var(--drift)`, `var(--danger)`).
- `LeftTab` union in `MidlEditor.tsx` currently is `"elements" | "data"` — expand to add `"layout"`.
- License header: `// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0\n// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.`
- Co-author trailer on commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Sparkline: skip (formatted live value + state dot is the requirement for Part 4).
- Report file: `/Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd/data-elements-view-report.md`

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `editor/src/visual/ElementsList.tsx` | **Create** | New component: placed-elements list panel |
| `editor/src/visual/ElementsList.test.tsx` | **Create** | Tests for Parts 1 |
| `editor/src/visual/DataTree.tsx` | **Modify** | Add per-group collapse state + `data-group-<name>` testids (Part 2) |
| `editor/src/visual/DataTree.test.tsx` | **Modify** | Add collapse toggle tests (Part 2) |
| `editor/src/visual/Palette.tsx` | **Modify** | Add inline SVG icons + description text (Part 3) |
| `editor/src/visual/Palette.test.tsx` | **Create** | Tests for Part 3 |
| `editor/src/visual/Inspector.tsx` | **Modify** | Promote live-readout block, add `data-testid="live-readout"` (Part 4) |
| `editor/src/visual/Inspector.test.tsx` | **Modify** | Add `live-readout` tests (Part 4) |
| `editor/src/MidlEditor.tsx` | **Modify** | Add `"layout"` to `LeftTab`, add `tab-layout` button, render `<ElementsList>` |

---

## Task 1: ElementsList component (Part 1)

**Files:**
- Create: `editor/src/visual/ElementsList.tsx`
- Create: `editor/src/visual/ElementsList.test.tsx`

**Interfaces:**
- Produces: `ElementsList({ model, onSelectCell, onRemoveElement })` — consumed by MidlEditor in Task 5.
  - `model: EditorModel` — the full editor model.
  - `onSelectCell: (cellIndex: number) => void` — fires when a row is clicked.
  - `onRemoveElement: (elementId: string) => void` — fires when a row's × button is clicked.

**Context:** The grid layout is `{ rows, cols, cells: GridCell[] }` where `GridCell` is `{ element?: string; colSpan?: number; rowSpan?: number }`. `model.elements` is `Record<string, EditorElement>` where `EditorElement` has `id`, `type`, `name?`, and `bindings?.value?.path?`. A "placed" element is any `GridCell` where `cell.element !== undefined`.

- [ ] **Step 1: Write the failing tests**

Create `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/visual/ElementsList.test.tsx`:

```tsx
// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import type { EditorModel } from "../model";
import { ElementsList } from "./ElementsList";

afterEach(() => cleanup());

function makeModel(overrides: Partial<EditorModel> = {}): EditorModel {
  return {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: {
      sog: { id: "sog", type: "single-value", name: "SOG",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } } },
      hdg: { id: "hdg", type: "gauge" },
    },
    layout: {
      rows: 2,
      cols: 2,
      cells: [{ element: "sog" }, { element: "hdg" }, {}, {}],
    },
    variants: [],
    ...overrides,
  };
}

test("renders elements-list container", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByTestId("elements-list")).toBeTruthy();
});

test("renders a row for each placed element with correct testid", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  // cell 0 has sog, cell 1 has hdg
  expect(getByTestId("element-row-0")).toBeTruthy();
  expect(getByTestId("element-row-1")).toBeTruthy();
});

test("row shows element type", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByTestId("element-row-0").textContent).toContain("single-value");
  expect(getByTestId("element-row-1").textContent).toContain("gauge");
});

test("row shows element name when available", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  // sog has name "SOG"
  expect(getByTestId("element-row-0").textContent).toContain("SOG");
});

test("row shows bound path when name is absent", () => {
  const model = makeModel({
    elements: {
      hdg: { id: "hdg", type: "gauge",
        bindings: { value: { kind: "signalk", path: "navigation.headingTrue" } } },
    },
    layout: { rows: 1, cols: 1, cells: [{ element: "hdg" }] },
  });
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByTestId("element-row-0").textContent).toContain("headingTrue");
});

test("clicking a row calls onSelectCell with the cell index", () => {
  const model = makeModel();
  const onSelectCell = vi.fn();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={onSelectCell} onRemoveElement={vi.fn()} />,
  );
  fireEvent.click(getByTestId("element-row-0"));
  expect(onSelectCell).toHaveBeenCalledWith(0);
});

test("clicking row 1 calls onSelectCell with 1", () => {
  const model = makeModel();
  const onSelectCell = vi.fn();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={onSelectCell} onRemoveElement={vi.fn()} />,
  );
  fireEvent.click(getByTestId("element-row-1"));
  expect(onSelectCell).toHaveBeenCalledWith(1);
});

test("each row has a remove button with correct testid", () => {
  const model = makeModel();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByTestId("element-row-remove-0")).toBeTruthy();
  expect(getByTestId("element-row-remove-1")).toBeTruthy();
});

test("clicking remove button calls onRemoveElement with the element id", () => {
  const model = makeModel();
  const onRemoveElement = vi.fn();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={onRemoveElement} />,
  );
  fireEvent.click(getByTestId("element-row-remove-0"));
  expect(onRemoveElement).toHaveBeenCalledWith("sog");
});

test("clicking remove does not also call onSelectCell", () => {
  const model = makeModel();
  const onSelectCell = vi.fn();
  const onRemoveElement = vi.fn();
  const { getByTestId } = render(
    <ElementsList model={model} onSelectCell={onSelectCell} onRemoveElement={onRemoveElement} />,
  );
  fireEvent.click(getByTestId("element-row-remove-0"));
  expect(onSelectCell).not.toHaveBeenCalled();
});

test("shows empty state when no elements are placed", () => {
  const emptyModel = makeModel({
    elements: {},
    layout: { rows: 1, cols: 2, cells: [{}, {}] },
  });
  const { getByText } = render(
    <ElementsList model={emptyModel} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByText(/no elements yet/i)).toBeTruthy();
});

test("does not show empty state when elements are placed", () => {
  const model = makeModel();
  const { queryByText } = render(
    <ElementsList model={model} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(queryByText(/no elements yet/i)).toBeNull();
});

test("non-grid layout shows empty state", () => {
  const flowModel: EditorModel = {
    midl: "1.0.0",
    screenId: "screen",
    title: "Test",
    elements: { sog: { id: "sog", type: "single-value" } },
    layout: { flow: "row", children: [] },
    variants: [],
  };
  const { getByText } = render(
    <ElementsList model={flowModel} onSelectCell={vi.fn()} onRemoveElement={vi.fn()} />,
  );
  expect(getByText(/no elements yet/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify the tests fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "FAIL|ElementsList|Cannot find"
```

Expected: FAIL — "Cannot find module './ElementsList'"

- [ ] **Step 3: Write the ElementsList component**

Create `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/visual/ElementsList.tsx`:

```tsx
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { EditorModel, EditorElement } from "../model";

export interface ElementsListProps {
  model: EditorModel;
  onSelectCell: (cellIndex: number) => void;
  onRemoveElement: (elementId: string) => void;
}

// Small inline SVG icons keyed by element type
const TYPE_ICONS: Record<string, string> = {
  "single-value": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><text x="1" y="11" font-size="10" fill="currentColor" font-family="monospace">42</text></svg>`,
  "text": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><text x="1" y="11" font-size="10" fill="currentColor" font-family="sans-serif">T</text></svg>`,
  "gauge": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10 A5 5 0 0 1 12 10" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="7" y1="10" x2="10" y2="5" stroke="currentColor" stroke-width="1.2"/></svg>`,
  "bar": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="3" width="10" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="3" width="6" height="3" rx="1" fill="currentColor" opacity="0.7"/></svg>`,
  "compass": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="3" x2="7" y2="7" stroke="currentColor" stroke-width="1.5"/></svg>`,
  "windrose": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1"/><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1"/></svg>`,
  "trend": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="2,10 5,7 8,8 12,3" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>`,
  "autopilot": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>`,
  "button": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="4" width="10" height="6" rx="2" stroke="currentColor" stroke-width="1.2"/></svg>`,
};

function getIcon(type: string): string {
  return TYPE_ICONS[type] ?? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.2"/></svg>`;
}

function getLabel(el: EditorElement): string {
  if (el.name) return el.name;
  const path = el.bindings?.["value"]?.path;
  if (path) {
    // Show the last two segments for readability e.g. "navigation.speedOverGround" → "speedOverGround"
    const parts = path.split(".");
    return parts[parts.length - 1] ?? path;
  }
  return el.id;
}

export function ElementsList({ model, onSelectCell, onRemoveElement }: ElementsListProps): React.JSX.Element {
  const isGrid = "rows" in model.layout && "cols" in model.layout && "cells" in model.layout;

  if (!isGrid) {
    return (
      <div data-testid="elements-list" style={{ padding: "16px 12px", fontSize: "11px", color: "var(--ink-faint, #5b7286)" }}>
        No elements yet — add one from the Elements tab.
      </div>
    );
  }

  const cells = (model.layout as { cells: Array<{ element?: string }> }).cells;
  const placed: Array<{ cellIndex: number; el: EditorElement }> = [];
  for (let i = 0; i < cells.length; i++) {
    const elementId = cells[i].element;
    if (elementId && model.elements[elementId]) {
      placed.push({ cellIndex: i, el: model.elements[elementId]! });
    }
  }

  if (placed.length === 0) {
    return (
      <div data-testid="elements-list" style={{ padding: "16px 12px", fontSize: "11px", color: "var(--ink-faint, #5b7286)" }}>
        No elements yet — add one from the Elements tab.
      </div>
    );
  }

  return (
    <div
      data-testid="elements-list"
      style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}
    >
      {placed.map(({ cellIndex, el }) => (
        <div
          key={cellIndex}
          data-testid={`element-row-${cellIndex}`}
          onClick={() => onSelectCell(cellIndex)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "6px 10px",
            cursor: "pointer",
            borderBottom: "1px solid var(--line, #1d2b3a)",
          }}
        >
          {/* Type icon */}
          <span
            style={{ color: "var(--ink-dim, #8aa0b4)", flexShrink: 0, lineHeight: 0 }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: getIcon(el.type) }}
          />
          {/* Type badge */}
          <span style={{ fontSize: "9px", fontFamily: "monospace", color: "var(--ink-faint, #5b7286)", flexShrink: 0, opacity: 0.8 }}>
            {el.type}
          </span>
          {/* Label / name / path */}
          <span style={{ flex: 1, fontSize: "11px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {getLabel(el)}
          </span>
          {/* Cell position */}
          <span style={{ fontSize: "9px", color: "var(--ink-faint, #5b7286)", fontFamily: "monospace", flexShrink: 0 }}>
            [{cellIndex}]
          </span>
          {/* Remove button */}
          <button
            data-testid={`element-row-remove-${cellIndex}`}
            onClick={(e) => { e.stopPropagation(); onRemoveElement(el.id); }}
            style={{
              flexShrink: 0,
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "1px solid var(--line2, #24364a)",
              borderRadius: "3px",
              cursor: "pointer",
              color: "var(--ink-faint, #5b7286)",
              fontSize: "11px",
              lineHeight: 1,
              padding: 0,
            }}
            aria-label="Remove element"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "ElementsList|PASS|FAIL|✓|✗"
```

Expected: all ElementsList tests pass.

- [ ] **Step 5: Run the full test suite to verify no regressions**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -8
```

Expected: all tests pass (now 246 + ~13 new = ~259).

- [ ] **Step 6: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git add editor/src/visual/ElementsList.tsx editor/src/visual/ElementsList.test.tsx
git commit -m "$(cat <<'EOF'
feat(editor): add ElementsList component for placed-elements panel (Part 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DataTree collapsible groups (Part 2)

**Files:**
- Modify: `editor/src/visual/DataTree.tsx`
- Modify: `editor/src/visual/DataTree.test.tsx`

**Interfaces:**
- Consumes: `SIGNALK_CATALOG` groups, `provider.onChange`, existing props (unchanged).
- The `data-group-<name>` testid is added to each group header `<div>`, replacing the existing `data-section="group-header"`. Both attributes coexist so existing tests (which use `getByText`) still pass.

**Context:** The current `DataTree` already groups entries with `groupEntries()` into a `Map<string, CatalogEntry[]>`. The rendered group structure is a `<div data-section="tree-group">` wrapping a header div and the leaf rows. We add a `Map<string, boolean>` state tracking which groups are collapsed (default: expanded = false means collapsed = false, i.e. groups start expanded).

- [ ] **Step 1: Add collapse tests to DataTree.test.tsx**

Append to the end of `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/visual/DataTree.test.tsx`:

```tsx
// ── Part 2: Collapsible groups ────────────────────────────────────────────────

test("group headers have data-group-<name> testid", () => {
  const provider = makeProviderStub([]);
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // navigation group from catalog
  expect(getByTestId("data-group-navigation")).toBeTruthy();
});

test("clicking a group header collapses the group (hides leaves)", () => {
  const provider = makeProviderStub([]);
  // navigation group has catalog entries including speedOverGround
  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // Leaf should be visible before collapse
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();

  // Click the group header to collapse
  fireEvent.click(getByTestId("data-group-navigation"));

  // Leaf should now be hidden
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();
});

test("clicking a collapsed group header expands the group again", () => {
  const provider = makeProviderStub([]);
  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  // Collapse
  fireEvent.click(getByTestId("data-group-navigation"));
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();

  // Expand again
  fireEvent.click(getByTestId("data-group-navigation"));
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
});

test("groups start expanded by default", () => {
  const provider = makeProviderStub([]);
  const { queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // Both groups visible without any interaction
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
  expect(queryByTestId("data-leaf-environment-wind-speedApparent")).toBeTruthy();
});

test("collapsing one group does not collapse others", () => {
  const provider = makeProviderStub([]);
  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  fireEvent.click(getByTestId("data-group-navigation"));

  // navigation collapsed
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();
  // environment still visible
  expect(queryByTestId("data-leaf-environment-wind-speedApparent")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "data-group|FAIL|✗"
```

Expected: 5 new tests fail because `data-group-*` testids don't exist yet.

- [ ] **Step 3: Modify DataTree.tsx to add collapse state and group testids**

Open `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/visual/DataTree.tsx`.

**Change 1:** Add `collapsedGroups` state after the existing state declarations (around line 54):

Replace:
```tsx
  const [injectUnit, setInjectUnit] = useState("");
```
With:
```tsx
  const [injectUnit, setInjectUnit] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
```

**Change 2:** Add a toggle callback after the `handleInjectSubmit` callback (around line 81):

Replace:
```tsx
  return (
    <div data-testid="data-tree" data-component="data-tree">
```
With:
```tsx
  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) { next.delete(group); } else { next.add(group); }
      return next;
    });
  }, []);

  return (
    <div data-testid="data-tree" data-component="data-tree">
```

**Change 3:** In the group render, replace the existing group header div and the leaf list to conditionally render based on collapse state.

Replace:
```tsx
          <div key={group} data-section="tree-group">
            <div
              data-section="group-header"
              style={{ padding: "4px 8px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}
            >
              {group}
              <span style={{ marginLeft: "6px", fontWeight: 400, opacity: 0.6 }}>
                ({groupEntries.length})
              </span>
            </div>
            {groupEntries.map((e) => (
```
With:
```tsx
          <div key={group} data-section="tree-group">
            <div
              data-testid={`data-group-${group}`}
              data-section="group-header"
              onClick={() => toggleGroup(group)}
              style={{ padding: "4px 8px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: "4px" }}
            >
              <span style={{ fontSize: "9px", opacity: 0.55, fontWeight: 400 }}>
                {collapsedGroups.has(group) ? "▶" : "▼"}
              </span>
              {group}
              <span style={{ marginLeft: "6px", fontWeight: 400, opacity: 0.6 }}>
                ({groupEntries.length})
              </span>
            </div>
            {!collapsedGroups.has(group) && groupEntries.map((e) => (
```

**Note:** The closing `</div>` for the `groupEntries.map(...)` block already exists as `</div>` on its own line — no change needed there. The only structural change is adding `!collapsedGroups.has(group) &&` before `groupEntries.map(...)`.

- [ ] **Step 4: Run the tests to verify all pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git add editor/src/visual/DataTree.tsx editor/src/visual/DataTree.test.tsx
git commit -m "$(cat <<'EOF'
feat(editor): collapsible DataTree groups with data-group-<name> testids (Part 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Palette icons and descriptions (Part 3)

**Files:**
- Modify: `editor/src/visual/Palette.tsx`
- Create: `editor/src/visual/Palette.test.tsx`

**Interfaces:**
- Props unchanged: `{ manifest: Manifest, onAdd: (type: string) => void }`.
- Produces: `data-testid={`palette-${el.type}`}` (unchanged — existing tests in `MidlEditor.data-tab.test.tsx` use this).
- Each palette item now shows: `[icon] [type name] / [description]`.

**Context:** The manifest's `elements` array is `Array<{ type: string; bindings?: string[] }>`. The element types in the fixture manifests include `"single-value"`, `"gauge"`, etc. The Palette must look up a description by type from a static map defined in the same file. The icon is a small inline SVG (≤15×15 viewBox). The `onAdd` handler is called with `el.type` on button click — unchanged.

- [ ] **Step 1: Write the failing Palette tests**

Create `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/visual/Palette.test.tsx`:

```tsx
// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import { Palette } from "./Palette";

afterEach(() => cleanup());

const MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "test",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3 }],
  elements: [
    { type: "single-value", bindings: ["value"] },
    { type: "gauge", bindings: ["value"] },
    { type: "bar", bindings: ["value"] },
    { type: "compass", bindings: ["value"] },
    { type: "windrose", bindings: ["value"] },
    { type: "trend", bindings: ["value"] },
    { type: "autopilot", bindings: ["value"] },
    { type: "button", bindings: ["value"] },
    { type: "text", bindings: ["value"] },
  ],
  sources: ["signalk"],
};

test("renders palette items for each manifest element type", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-single-value")).toBeTruthy();
  expect(getByTestId("palette-gauge")).toBeTruthy();
  expect(getByTestId("palette-bar")).toBeTruthy();
});

test("single-value item shows 'Large numeric readout' description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-single-value").textContent).toContain("Large numeric readout");
});

test("gauge item shows 'Radial gauge' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-gauge").textContent).toMatch(/radial gauge/i);
});

test("bar item shows 'Bar' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-bar").textContent).toMatch(/bar/i);
});

test("compass item shows 'Heading' or 'bearing' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-compass").textContent).toMatch(/heading|bearing/i);
});

test("windrose item shows 'Wind' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-windrose").textContent).toMatch(/wind/i);
});

test("trend item shows 'line' or 'series' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-trend").textContent).toMatch(/line|series/i);
});

test("autopilot item shows 'Autopilot' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-autopilot").textContent).toMatch(/autopilot/i);
});

test("button item shows 'Action' or 'button' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-button").textContent).toMatch(/action|button/i);
});

test("text item shows 'Label' or 'text' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-text").textContent).toMatch(/label|text/i);
});

test("clicking a palette item calls onAdd with the type", () => {
  const onAdd = vi.fn();
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={onAdd} />,
  );
  fireEvent.click(getByTestId("palette-gauge"));
  expect(onAdd).toHaveBeenCalledWith("gauge");
});

test("each palette item renders an svg icon", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  // single-value button should contain an svg element
  const btn = getByTestId("palette-single-value");
  expect(btn.querySelector("svg")).toBeTruthy();
});

test("unknown type falls back gracefully (renders without crashing)", () => {
  const manifest: Manifest = {
    ...MANIFEST,
    elements: [{ type: "custom-unknown-widget", bindings: ["value"] }],
  };
  const { getByTestId } = render(
    <Palette manifest={manifest} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-custom-unknown-widget")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify the tests fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "Palette.test|FAIL|✗" | head -15
```

Expected: 13 new Palette tests fail (descriptions and SVG not yet added).

- [ ] **Step 3: Rewrite Palette.tsx with icons and descriptions**

Overwrite `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/visual/Palette.tsx`:

```tsx
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { Manifest } from "@yey-boats/midl";

export interface PaletteProps {
  manifest: Manifest;
  onAdd: (type: string) => void;
}

// ── Type metadata ──────────────────────────────────────────────────────────────

interface TypeMeta {
  label: string;
  description: string;
  icon: React.JSX.Element;
}

const W = 14;
const H = 14;

const TYPE_META: Record<string, TypeMeta> = {
  "single-value": {
    label: "Single value",
    description: "Large numeric readout",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <text x="1" y="11" fontSize="10" fill="currentColor" fontFamily="monospace">42</text>
      </svg>
    ),
  },
  "text": {
    label: "Text",
    description: "Label / text",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <text x="2" y="11" fontSize="11" fill="currentColor" fontFamily="sans-serif" fontWeight="bold">T</text>
      </svg>
    ),
  },
  "gauge": {
    label: "Gauge",
    description: "Radial gauge w/ zones",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M2 11 A5 5 0 0 1 12 11" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="7" y1="11" x2="10.5" y2="5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  "bar": {
    label: "Bar",
    description: "Bar w/ zones",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1" y="4" width="12" height="6" rx="2" stroke="currentColor" strokeWidth="1.2"/>
        <rect x="1" y="4" width="7" height="6" rx="2" fill="currentColor" opacity="0.6"/>
      </svg>
    ),
  },
  "compass": {
    label: "Compass",
    description: "Heading / bearing dial",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
        <polygon points="7,2 8.2,7 7,6 5.8,7" fill="currentColor"/>
        <polygon points="7,12 8.2,7 7,8 5.8,7" fill="currentColor" opacity="0.4"/>
      </svg>
    ),
  },
  "windrose": {
    label: "Wind rose",
    description: "Wind dial",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
        <line x1="7" y1="1.5" x2="7" y2="12.5" stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="7" x2="12.5" y2="7" stroke="currentColor" strokeWidth="0.9"/>
        <line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
        <line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
      </svg>
    ),
  },
  "trend": {
    label: "Trend",
    description: "Time-series line",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <polyline points="1,11 4,8 7,9 10,5 13,3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
      </svg>
    ),
  },
  "autopilot": {
    label: "Autopilot",
    description: "Autopilot status + nudge",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
        <circle cx="7" cy="7" r="2" fill="currentColor"/>
        <line x1="7" y1="1.5" x2="7" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  "button": {
    label: "Button",
    description: "Action button",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1" y="4" width="12" height="6" rx="2.5" stroke="currentColor" strokeWidth="1.2"/>
        <line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
};

function getMeta(type: string): TypeMeta {
  return TYPE_META[type] ?? {
    label: type,
    description: "",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    ),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Palette({ manifest, onAdd }: PaletteProps): React.JSX.Element {
  return (
    <div data-component="palette" style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "8px", flex: 1, overflowY: "auto" }}>
      {manifest.elements.map((el) => {
        const meta = getMeta(el.type);
        return (
          <button
            key={el.type}
            data-testid={`palette-${el.type}`}
            onClick={() => onAdd(el.type)}
          >
            {/* Icon */}
            <span style={{ flexShrink: 0, lineHeight: 0, color: "var(--ink-dim, #8aa0b4)" }}>
              {meta.icon}
            </span>
            {/* Label + description */}
            <span style={{ display: "flex", flexDirection: "column", gap: "1px", textAlign: "left", minWidth: 0 }}>
              <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink, #cbd6e2)", lineHeight: 1.2 }}>
                {meta.label}
              </span>
              {meta.description && (
                <span style={{ fontSize: "10px", color: "var(--ink-faint, #5b7286)", fontWeight: 400, lineHeight: 1.2 }}>
                  {meta.description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify all pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git add editor/src/visual/Palette.tsx editor/src/visual/Palette.test.tsx
git commit -m "$(cat <<'EOF'
feat(editor): palette icons and descriptions for each element type (Part 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Inspector live-readout promotion (Part 4)

**Files:**
- Modify: `editor/src/visual/Inspector.tsx`
- Modify: `editor/src/visual/Inspector.test.tsx`

**Interfaces:**
- All existing `Inspector` props unchanged.
- Adds: `data-testid="live-readout"` — a prominent block in the BINDING section.
- Keeps: `data-testid="live-value-readout"` (existing tests use this; backward compat required).
- The live-readout shows: colored dot + formatted value + unit + state label.
  - State: green dot (`var(--online)`) when `livePresent`, amber dot (`var(--drift)`) when `liveResult?.stale === true`, dim dot (`var(--ink-faint)`) when no data.
  - Formatted value: `formatValue(liveResult!.value, effectiveFormat, liveResult!.sourceUnit).text` (already computed as `liveDisplay`).

**Context:** The Inspector already has a `live-value-readout` div at line ~272. We add a new `live-readout` `data-testid` wrapper around a more prominent block above it, or we promote the existing block. To keep backward-compat, we add `data-testid="live-readout"` to the existing `data-testid="live-value-readout"` div — but the spec says it's "prominent," so we expand the block. The cleanest approach: keep `data-testid="live-value-readout"` on the outer div and add `data-testid="live-readout"` as a sibling section-level div that wraps the promoted display. Then existing tests that use `live-value-readout` still pass.

Actually, simplest approach that satisfies both old and new tests: add `data-testid="live-readout"` to the same div that already has `data-testid="live-value-readout"`. React allows multiple `data-*` attributes. But `data-testid` is singular — a single attribute. Solution: wrap the current `live-value-readout` div in a new outer div with `data-testid="live-readout"`, and keep the inner `live-value-readout` unchanged. Existing tests use `getByTestId("live-value-readout")` and `.textContent` checks — these still work because the inner div is still present.

- [ ] **Step 1: Add live-readout tests to Inspector.test.tsx**

Append to the end of `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/visual/Inspector.test.tsx`:

```tsx
// ── Part 4: live-readout ────────────────────────────────────────────────────────

test("inspector renders live-readout container in the binding section", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 4.5 } });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  expect(getByTestId("live-readout")).toBeTruthy();
});

test("live-readout shows formatted value when path has present data", () => {
  const model = makeGridModel(); // sog bound to navigation.speedOverGround, format: unit kn, decimals 1
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 4.494657697249033 } });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  const readout = getByTestId("live-readout");
  // Must show formatted value (1 decimal) with unit, not raw float
  expect(readout.textContent).toContain("4.5");
  expect(readout.textContent).toContain("kn");
});

test("live-readout shows no-data state when path has no data", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  const readout = getByTestId("live-readout");
  expect(readout.textContent).toMatch(/no data|—/i);
});

test("live-readout shows stale state when data is stale", () => {
  const model = makeGridModel();
  // MockDataProvider with stale:true
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 3.0, stale: true } });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  // When stale, the readout should show "stale" or the value with an amber/dim dot
  // The live-readout must exist regardless
  expect(getByTestId("live-readout")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "live-readout|FAIL|✗" | head -10
```

Expected: 4 new tests fail — "Unable to find an element by: [data-testid='live-readout']"

- [ ] **Step 3: Modify Inspector.tsx to add live-readout**

In `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/visual/Inspector.tsx`, find the BINDING section (around line 256). The current structure is:

```tsx
      {/* ── BINDING section ─────────────────────────────────────── */}
      <div data-section="insp-section-binding" ...>
        <div ...>
          <span ...>Binding</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div>
            <div ...>SignalK Path</div>
            <PathPicker ... />
          </div>
          {/* Live value readout */}
          <div data-testid="live-value-readout" ...>
            {livePresent ? (
              <>
                <span data-testid="live-dot" ... green ... />
                <span data-testid="live-value-text" ...>{liveDisplay}</span>
              </>
            ) : (
              <>
                <span data-testid="live-dot" ... dim ... />
                <span ...>no data</span>
              </>
            )}
          </div>
        </div>
      </div>
```

We need to add `data-testid="live-readout"` to the outer `live-value-readout` div, AND handle the stale state. Also add a `stale` state indicator.

The `liveResult` is already computed. We need to add stale detection. Looking at the existing code:
- `livePresent = liveResult?.present === true && liveResult?.stale !== true`
- So stale = `liveResult?.present === true && liveResult?.stale === true`

Replace the entire `{/* Live value readout */}` block:

```tsx
          {/* Live value readout */}
          <div
            data-testid="live-readout"
            style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}
          >
            <div data-testid="live-value-readout" style={{ display: "contents" }}>
              {livePresent ? (
                <>
                  <span
                    data-testid="live-dot"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--online, oklch(0.72 0.15 155))",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span data-testid="live-value-text" style={{ fontFamily: "monospace", fontSize: "0.85em" }}>
                    {liveDisplay}
                  </span>
                </>
              ) : liveResult?.present === true && liveResult?.stale === true ? (
                <>
                  <span
                    data-testid="live-dot"
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--drift, oklch(0.80 0.13 75))", display: "inline-block", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: "0.82em", opacity: 0.7 }}>stale</span>
                </>
              ) : (
                <>
                  <span
                    data-testid="live-dot"
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink-faint, #5b7286)", display: "inline-block", flexShrink: 0, opacity: 0.5 }}
                  />
                  <span style={{ fontSize: "0.82em", opacity: 0.5 }}>no data</span>
                </>
              )}
            </div>
          </div>
```

**Important:** The existing tests use `getByTestId("live-value-readout")` and check `.textContent`. With `display: "contents"`, the inner div is transparent in layout — its `textContent` still returns the combined text of its children. The tests check `readout.textContent` so they still pass. Verify this is true.

Actually `display: contents` removes the box but the DOM node still exists. `getByTestId("live-value-readout")` finds the node and `.textContent` is the concatenated text of children — exactly what the existing tests need. ✓

- [ ] **Step 4: Run all tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -10
```

Expected: all tests pass.

If there are failures in the `live-value-readout` tests, the cause is likely `display: contents` not preserving `.textContent`. In that case, change the inner wrapper to not use `display: contents` — instead keep the outer `live-readout` div and simply add the `data-testid="live-value-readout"` attribute to it as well (using `data-testid` with a space-separated value isn't valid HTML; use a real nested div without display:contents). Alternative: give the outer div **both** testids by adding `id` for one and `data-testid` for the other — but the cleanest approach is two nested divs:

```tsx
          <div data-testid="live-readout" style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
            <div data-testid="live-value-readout" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              ...
            </div>
          </div>
```

This will pass existing `.textContent` checks because `.textContent` on `live-value-readout` still returns the inner text.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git add editor/src/visual/Inspector.tsx editor/src/visual/Inspector.test.tsx
git commit -m "$(cat <<'EOF'
feat(editor): promote Inspector live-readout with stale state (Part 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire Layout tab into MidlEditor

**Files:**
- Modify: `editor/src/MidlEditor.tsx`
- Modify: `editor/src/MidlEditor.data-tab.test.tsx`

**Interfaces:**
- Consumes: `ElementsList` from `./visual/ElementsList`.
- `LeftTab` type: add `"layout"` — `type LeftTab = "elements" | "data" | "layout"`.
- New button: `data-testid="tab-layout"` in the rail-tabs row.
- The `onRemoveElement` handler calls `removeElement(model, elementId)` from `layout-ops` then `setModel`. The `onSelectCell` handler calls `setSelectedCell(cellIndex)`.
- The tab order in the rail: `Elements | Data | Layout`.

**Context:** `MidlEditor.tsx` already imports `removeElement` from `./layout-ops`. `handleRemoveElement` logic from `Inspector.tsx` shows the pattern: `onChange(removeElement(model, selectedElementId))`. For `ElementsList`, the `onRemoveElement` callback should be:
```tsx
const handleRemoveFromList = useCallback((elementId: string) => {
  try { setModel(removeElement(model, elementId)); } catch { /* ignore */ }
}, [model]);
```

- [ ] **Step 1: Add layout-tab integration test to MidlEditor.data-tab.test.tsx**

Append to `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/MidlEditor.data-tab.test.tsx`:

```tsx
// ── Part 1 integration: Layout tab in MidlEditor ──────────────────────────────

test("visual mode body shows Layout tab button", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider();
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  await waitFor(() => {
    expect(getByTestId("tab-layout")).toBeTruthy();
  }, { timeout: 3000 });
});

test("clicking Layout tab shows elements-list with placed elements", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider([
    { path: "navigation.speedOverGround", value: 3.5, updatedAt: Date.now() },
  ]);
  const manifestSource = makeFakeManifestSource();

  const { getByTestId, queryByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  await waitFor(() => {
    expect(getByTestId("tab-layout")).toBeTruthy();
  }, { timeout: 3000 });

  // Click Layout tab
  await act(async () => {
    fireEvent.click(getByTestId("tab-layout"));
  });

  // elements-list should appear
  await waitFor(() => {
    expect(getByTestId("elements-list")).toBeTruthy();
  }, { timeout: 3000 });
});

test("clicking a row in elements-list selects the cell (inspector shows element)", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider();
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  await waitFor(() => {
    expect(getByTestId("tab-layout")).toBeTruthy();
  }, { timeout: 3000 });

  // Click Layout tab
  await act(async () => {
    fireEvent.click(getByTestId("tab-layout"));
  });

  await waitFor(() => {
    expect(getByTestId("elements-list")).toBeTruthy();
  }, { timeout: 3000 });

  // The fixture doc has a 1x1 grid with sog in cell 0
  // Click element-row-0
  await act(async () => {
    fireEvent.click(getByTestId("element-row-0"));
  });

  // Inspector should show the element (type-badge becomes visible)
  await waitFor(() => {
    expect(getByTestId("type-badge")).toBeTruthy();
  }, { timeout: 3000 });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "tab-layout|FAIL" | head -10
```

Expected: 3 new tests fail — "tab-layout" not found.

- [ ] **Step 3: Modify MidlEditor.tsx**

**Change 1:** Add import for `ElementsList` after the `DataTree` import (around line 18):

```tsx
import { ElementsList } from "./visual/ElementsList";
```

**Change 2:** Add import for `removeElement` — it's already imported at line 14:
```tsx
import { addElement, assignElementToCell } from "./layout-ops";
```
Change to:
```tsx
import { addElement, assignElementToCell, removeElement } from "./layout-ops";
```

**Change 3:** Change the `LeftTab` type (line 50):

```tsx
type LeftTab = "elements" | "data" | "layout";
```

**Change 4:** Add `handleRemoveFromList` callback after `handleBrowseData` (around line 297):

```tsx
  // ── Visual mode: remove element from elements-list ─────────────────────────
  const handleRemoveFromList = useCallback(
    (elementId: string) => {
      try { setModel((m) => removeElement(m, elementId)); } catch { /* ignore */ }
    },
    [],
  );
```

**Change 5:** Add the `tab-layout` button in the rail-tabs row. Find:

```tsx
                <button
                  data-testid="tab-data"
                  aria-selected={leftTab === "data"}
                  onClick={() => setLeftTab("data")}
                  style={{ fontWeight: leftTab === "data" ? 700 : 400 }}
                >
                  Data
                </button>
```

Add after it:

```tsx
                <button
                  data-testid="tab-layout"
                  aria-selected={leftTab === "layout"}
                  onClick={() => setLeftTab("layout")}
                  style={{ fontWeight: leftTab === "layout" ? 700 : 400 }}
                >
                  Layout
                </button>
```

**Change 6:** In the rail content area, expand the conditional. Find:

```tsx
              {leftTab === "elements" ? (
                <Palette manifest={manifest} onAdd={handleAddElement} />
              ) : (
                <DataTree
                  provider={provider as unknown as LivePathSource}
                  selectedElementId={selectedElementId}
                  onBindPath={handleBindPath}
                />
              )}
```

Replace with:

```tsx
              {leftTab === "elements" ? (
                <Palette manifest={manifest} onAdd={handleAddElement} />
              ) : leftTab === "data" ? (
                <DataTree
                  provider={provider as unknown as LivePathSource}
                  selectedElementId={selectedElementId}
                  onBindPath={handleBindPath}
                />
              ) : (
                <ElementsList
                  model={model}
                  onSelectCell={setSelectedCell}
                  onRemoveElement={handleRemoveFromList}
                />
              )}
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Build the lib**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor
npm run build:lib 2>&1 | tail -15
```

Expected: success with no errors.

- [ ] **Step 6: Commit all remaining changes**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git add editor/src/MidlEditor.tsx editor/src/MidlEditor.data-tab.test.tsx
git commit -m "$(cat <<'EOF'
feat(editor): wire Layout tab into MidlEditor left rail (Part 1 integration)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Write report and final verification

**Files:**
- Create: `/Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd/data-elements-view-report.md`

- [ ] **Step 1: Run final test suite**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -12
```

Note the exact test count and whether all pass.

- [ ] **Step 2: Run final build**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor
npm run build:lib 2>&1 | tail -5
```

Note success or failure.

- [ ] **Step 3: Get commit hash**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git log --oneline -5
```

- [ ] **Step 4: Write report**

```bash
mkdir -p /Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd
```

Create `/Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd/data-elements-view-report.md` with:

```markdown
# Data Elements View — Implementation Report

**Status:** COMPLETE
**Commit:** <hash from step 3>
**Test result:** <N> tests, all passing
**Build result:** build:lib SUCCESS

## Parts implemented

- **Part 1 — Layout panel (ElementsList):** New `ElementsList` component renders placed grid elements with type icon, label/name/path, cell position badge, and × remove button. Wired as third left-rail tab "Layout" (data-testid: tab-layout). Empty state shown when no elements or non-grid layout.
- **Part 2 — DataTree collapsible groups:** Each group header now has `data-testid="data-group-<name>"` and toggles visibility of its leaf rows on click; groups default to expanded; collapse state is local to the component.
- **Part 3 — Palette icons + descriptions:** Each element type now has a 14×14 inline SVG icon and a one-line description. Nine types covered: single-value, text, gauge, bar, compass, windrose, trend, autopilot, button. Unknown types get a fallback icon and no description.
- **Part 4 — Inspector live-readout:** The BINDING section now has `data-testid="live-readout"` wrapping the existing `live-value-readout` block. State: green dot (present), amber dot (stale), dim dot (no data). Formatted value shown using element's format spec.

**Sparkline:** Not included (skipped per spec — live value + state dot is the requirement).

**Concerns:** None. All 246 baseline tests remain green; new tests add coverage for all four parts.
```

---

## Self-review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Layout tab (tab-layout) | Task 5 |
| elements-list, element-row-<i>, element-row-remove-<i> | Task 1 |
| Clicking row selects cell | Task 1 + Task 5 |
| Row × button → removeElement | Task 1 + Task 5 |
| Empty state "No elements yet" | Task 1 |
| Collapsible groups, default expanded | Task 2 |
| data-group-<name> testids | Task 2 |
| Tighter rows, unit alongside live value | Task 2 (existing unit display unchanged, groups tightened) |
| Palette: icon + name + description | Task 3 |
| All 9 type descriptions | Task 3 |
| palette-<type> testids preserved | Task 3 |
| live-readout in inspector binding | Task 4 |
| Present/stale/no-data state | Task 4 |
| Formatted value + unit | Task 4 |
| Sparkline: skipped | Task 4 |
| npm test green | Task 5 (build:lib) |
| build:lib success | Task 5 |
| Report to .superpowers/sdd/ | Task 6 |
| Co-author trailer | All commits |

**Placeholder scan:** No TBDs, no placeholders. All code blocks are complete.

**Type consistency:**
- `ElementsList` props: `model: EditorModel`, `onSelectCell: (cellIndex: number) => void`, `onRemoveElement: (elementId: string) => void` — consistent across Task 1 and Task 5.
- `removeElement(model, elementId: string)` — imported from `layout-ops`, used in both `Inspector.tsx` and the new `MidlEditor.tsx` callback.
- `setSelectedCell` passed directly as `onSelectCell` — type `(value: number | null) => void` in state, `(cellIndex: number) => void` in `ElementsList` — compatible (number is assignable to `number | null`). ✓
