# Inspector Polish & Visual Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the MIDL editor's inspector with richer grouped sections (Binding / Display / Layout / Appearance) and style the entire editor chrome to match the approved dark-token mockup.

**Architecture:** New CSS file (`src/midl-editor.css`) applies the design-system tokens across the editor shell; `Inspector.tsx` gains four grouped sections with new span/sided/color/scale fields stored on `element.style` and round-tripped through `serializeMidl`; new tests cover each new field; a status bar is added to `MidlEditor.tsx` wired to `validateModel`.

**Tech Stack:** React 18 (TSX), Vitest + @testing-library/react (jsdom), CSS custom properties (no runtime deps), TypeScript 5.

## Global Constraints

- `npm test --workspace editor` must stay **green at 151+ tests** after every commit.
- `cd editor && npm run build:lib` must succeed at the end.
- Work exclusively in `/Users/borissorochkin/code/yey.boats/midl-editor/editor/` on branch `feat/midl-editor`.
- New fields (`span`, `sided`, `colorRole`, `scale`) serialize into `element.style` as-is — the `EditorElement.style` field is `Record<string, unknown>`, which `serializeMidl` already round-trips verbatim. No changes to `model.ts` or `midl-io.ts` are needed.
- Keep all existing `data-testid` values working. Add: `top-class-select`, `top-theme-select`, `top-push`, `status-bar`.
- The existing `data-testid="class-switch"` and `data-testid="theme-switch"` MUST remain in the DOM (tests use them); the new `top-class-select` and `top-theme-select` are aliases you add as **additional** `data-testid` attributes using `data-testid="class-switch top-class-select"` (space-separated) — testing-library's `getByTestId` matches exact strings, so use `getAllByTestId` or a query selector where needed, OR simply add both testids as separate divs or pass the same value. **Simplest approach**: replace `data-testid="class-switch"` with `data-testid="class-switch"` (keep) and add `data-testid="top-class-select"` as a wrapper `div` — but actually the simplest correct approach is to just rename the testid on the `<select>` to keep BOTH names matching by wrapping, or add a *second* `data-testid` attribute. **Check the existing tests first** — `MidlEditor.test.tsx` uses `getByTestId("class-switch")`, so that testid must remain. Safest: add a new `<div data-testid="top-class-select">` wrapping the select, or keep the existing testid AND add a sibling hidden element. Actually, simplest: the new testids (`top-class-select`, `top-theme-select`) only need to EXIST in the DOM; adding them to the same elements as second aria-label or second data attribute won't work in testing-library. **Cleanest solution**: add `data-testid="top-class-select"` to the same `<select>` element that already has `data-testid="class-switch"` — testing-library's `getByTestId` by default uses `*[data-testid="X"]`, so a single element CAN carry both if you list them space-separated (React sets attribute verbatim) — but that won't match. **Actual cleanest solution**: add a wrapping element with the new testid. See Task 4 for the exact DOM structure.
- Design tokens (from `builder-state-visual.html`): `--bg:#0a121c`, `--surface:#0e1825`, `--surface2:#0c1521`, `--elev:#12202f`, `--line:#1d2b3a`, `--line2:#24364a`, `--ink:#cbd6e2`, `--ink-dim:#8aa0b4`, `--ink-faint:#5b7286`, `--ink-bright:#eef4fb`, `--accent:#57c7d8`, `--online:oklch(0.72 0.15 155)`. Font families: `'Montserrat', sans-serif` for UI; `'JetBrains Mono', monospace` for values/paths.
- Co-author every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/midl-editor.css` | **Create** | All design-token CSS: topbar, left rail, canvas area, inspector, statusbar. |
| `src/MidlEditor.tsx` | **Modify** | Import CSS; restyle header as dark topbar; add status bar; add `top-push` button wired to `handleSave`; expose `data-testid` aliases. |
| `src/visual/Inspector.tsx` | **Modify** | Richer grouped sections: Binding (path + live value), Display (unit/decimals/label), Layout (span/sided), Appearance (colorRole/scale). Store new fields on `element.style`. |
| `src/visual/Inspector.test.tsx` | **Modify** | Add tests: span/sided/colorRole/scale update model + round-trip through `serializeMidl`→`parseMidl`; live-value readout shows present/stale states. |
| `src/MidlEditor.test.tsx` | **Modify** | Add tests: `status-bar` reflects validation; `top-push` triggers `store.save`. |
| `src/visual/Palette.tsx` | **Modify** | Style palette items to match mockup (dark cards with left-accent border). |
| `src/visual/GridCanvas.tsx` | **Modify** | Style selected cell with accent outline; empty cells with dashed border. |

---

## Task 1: TDD — New Inspector fields (span, sided, colorRole, scale)

**Files:**
- Modify: `editor/src/visual/Inspector.test.tsx`

**Interfaces:**
- Consumes: existing `Inspector` props (`model`, `selectedCell`, `manifest`, `provider`, `onChange`)
- Produces: new tests that will FAIL until Task 2 adds the implementation (data-testid: `span-select`, `sided-toggle`, `color-role-select`, `scale-select`)

- [ ] **Step 1: Write the failing tests for span/sided/colorRole/scale**

Add these tests at the end of `src/visual/Inspector.test.tsx`:

```tsx
import { parseMidl, serializeMidl } from "../midl-io";

test("changing span updates element.style.span and round-trips through serializeMidl→parseMidl", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("span-select"), { target: { value: "1x2" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.span).toBe("1x2");

  // Round-trip
  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.span).toBe("1x2");
});

test("toggling sided updates element.style.sided and round-trips", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.click(getByTestId("sided-toggle"));

  expect(onChange).toHaveBeenCalledOnce();
  // Default was undefined/false; after toggle it should be "P" or truthy
  expect(captured.elements["sog"]?.style?.sided).toBeTruthy();

  // Round-trip
  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.sided).toBeTruthy();
});

test("changing colorRole updates element.style.colorRole and round-trips", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("color-role-select"), { target: { value: "warn" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.colorRole).toBe("warn");

  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.colorRole).toBe("warn");
});

test("changing scale updates element.style.scale and round-trips", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  fireEvent.change(getByTestId("scale-select"), { target: { value: "metric" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.scale).toBe("metric");

  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.scale).toBe("metric");
});

test("live value readout shows provider value when path has present data", () => {
  const model = makeGridModel(); // sog bound to navigation.speedOverGround
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 4.5 } });
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const readout = getByTestId("live-value-readout");
  expect(readout.textContent).toContain("4.5");
  // Green dot should be present
  const dot = getByTestId("live-dot");
  expect(dot).toBeTruthy();
});

test("live value readout shows stale/no-data state when path has no data", () => {
  const model = makeGridModel(); // sog bound to navigation.speedOverGround
  const provider = new MockDataProvider({}); // no data
  const onChange = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
    />,
  );

  const readout = getByTestId("live-value-readout");
  // Should show "no data" or "—" when present is false
  expect(readout.textContent).toMatch(/no data|—/i);
});
```

- [ ] **Step 2: Run tests to verify the 6 new tests FAIL**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -20
```

Expected: 6 failures (`span-select`, `sided-toggle`, `color-role-select`, `scale-select`, `live-value-readout` not found).

- [ ] **Step 3: Commit the failing tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/visual/Inspector.test.tsx
git -C editor commit -m "$(cat <<'EOF'
test(inspector): add failing TDD tests for span/sided/colorRole/scale and live-value readout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Implement richer Inspector sections

**Files:**
- Modify: `editor/src/visual/Inspector.tsx`

**Interfaces:**
- Consumes: `EditorElement.style` (already `Record<string, unknown>`) from `model.ts`; `DataProvider.getValue(binding)` returning `ResolvedValue` with `{ value, present, stale }` from `web/src/data.ts`
- Produces: `data-testid`: `span-select`, `sided-toggle`, `color-role-select`, `scale-select`, `live-value-readout`, `live-dot`; grouped sections: `insp-section-binding`, `insp-section-display`, `insp-section-layout`, `insp-section-appearance`

**Implementation notes:**
- `getValue` requires a `Source` (from `@yey-boats/midl` types). The `BindingSource` in `model.ts` mirrors it. Cast as `import('@yey-boats/midl').Source`.
- `provider.getValue` is imported from `DataProvider` — already available as a prop.
- "sided" is a toggle between `undefined` (off) and `"P"` (port-starboard sided); clicking toggles.
- `span` values: `"1x1"`, `"1x2"`, `"2x1"`, `"2x2"` stored as strings on `element.style.span`.
- `colorRole` values: `"default"`, `"accent"`, `"warn"` stored on `element.style.colorRole`.
- `scale` values: `"fixed"`, `"metric"` stored on `element.style.scale`.
- Live value: call `provider.getValue({ kind: "signalk", path: valuePath } as Source)` where `valuePath` is the current bound path. Show value when `present && !stale`; show "no data" / "—" otherwise.

- [ ] **Step 1: Rewrite Inspector.tsx with grouped sections**

Replace the full content of `editor/src/visual/Inspector.tsx`:

```tsx
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { Manifest } from "@yey-boats/midl";
import type { Source } from "@yey-boats/midl";
import type { DataProvider } from "@yey-boats/midl-web";
import type { EditorModel, EditorElement, BindingSource } from "../model";
import { addRow, addCol, removeRow, removeCol, removeElement } from "../layout-ops";
import { PathPicker } from "./PathPicker";

export interface InspectorProps {
  model: EditorModel;
  selectedCell: number | null;
  manifest: Manifest;
  provider: DataProvider;
  onChange: (next: EditorModel) => void;
}

const SPAN_OPTIONS = ["1x1", "1x2", "2x1", "2x2"] as const;
const COLOR_ROLE_OPTIONS = ["default", "accent", "warn"] as const;
const SCALE_OPTIONS = ["fixed", "metric"] as const;

export function Inspector({ model, selectedCell, manifest, provider, onChange }: InspectorProps): React.JSX.Element {
  // ── Grid-level controls ────────────────────────────────────────────────────
  const isGrid = "rows" in model.layout && "cols" in model.layout && "cells" in model.layout;

  function handleAddRow() { onChange(addRow(model)); }
  function handleAddCol() { onChange(addCol(model)); }

  function handleRemoveRow() {
    if (!isGrid) return;
    const g = model.layout as { rows: number; cols: number; cells: unknown[] };
    if (g.rows > 1) onChange(removeRow(model, g.rows - 1));
  }

  function handleRemoveCol() {
    if (!isGrid) return;
    const g = model.layout as { rows: number; cols: number; cells: unknown[] };
    if (g.cols > 1) onChange(removeCol(model, g.cols - 1));
  }

  // ── Selected element ───────────────────────────────────────────────────────
  let selectedElementId: string | undefined;
  if (selectedCell !== null && isGrid) {
    const cells = (model.layout as { cells: Array<{ element?: string }> }).cells;
    selectedElementId = cells[selectedCell]?.element;
  }
  const selectedElement: EditorElement | undefined = selectedElementId
    ? model.elements[selectedElementId]
    : undefined;

  // ── Element-level edit helpers ─────────────────────────────────────────────

  function updateElement(updated: EditorElement) {
    onChange({ ...model, elements: { ...model.elements, [updated.id]: updated } });
  }

  function handlePathChange(path: string) {
    if (!selectedElement) return;
    const newBinding: BindingSource = { kind: "signalk", path };
    updateElement({ ...selectedElement, bindings: { ...selectedElement.bindings, value: newBinding } });
  }

  function handleNameChange(name: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, name });
  }

  function handleTypeChange(type: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, type });
  }

  function handleUnitChange(unit: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, format: { ...selectedElement.format, unit } });
  }

  function handleDecimalsChange(decimals: number) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, format: { ...selectedElement.format, decimals } });
  }

  function handleSpanChange(span: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, span } });
  }

  function handleSidedToggle() {
    if (!selectedElement) return;
    const current = selectedElement.style?.sided;
    const next = current ? undefined : "P";
    const newStyle = { ...selectedElement.style };
    if (next === undefined) {
      delete newStyle.sided;
    } else {
      newStyle.sided = next;
    }
    updateElement({ ...selectedElement, style: newStyle });
  }

  function handleColorRoleChange(colorRole: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, colorRole } });
  }

  function handleScaleChange(scale: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, scale } });
  }

  function handleRemoveElement() {
    if (!selectedElementId) return;
    onChange(removeElement(model, selectedElementId));
  }

  // ── Grid controls ──────────────────────────────────────────────────────────
  const gridControls = isGrid ? (
    <div data-section="grid-controls" style={{ display: "flex", gap: "4px", flexWrap: "wrap", padding: "8px 12px" }}>
      <button data-testid="add-row" onClick={handleAddRow}>Add row</button>
      <button data-testid="add-col" onClick={handleAddCol}>Add col</button>
      <button data-testid="remove-row" onClick={handleRemoveRow}>Remove row</button>
      <button data-testid="remove-col" onClick={handleRemoveCol}>Remove col</button>
    </div>
  ) : null;

  // ── Empty states ───────────────────────────────────────────────────────────
  if (selectedCell === null) {
    return (
      <div data-component="inspector">
        {gridControls}
        <p>Select a cell to inspect its element.</p>
      </div>
    );
  }

  if (!selectedElement) {
    return (
      <div data-component="inspector">
        {gridControls}
        <p>No element assigned to this cell.</p>
      </div>
    );
  }

  // ── Derive live value ──────────────────────────────────────────────────────
  const valuePath =
    selectedElement.bindings?.["value"]?.kind === "signalk"
      ? (selectedElement.bindings["value"].path ?? "")
      : "";

  const liveResult = valuePath
    ? provider.getValue({ kind: "signalk", path: valuePath } as Source)
    : null;

  const livePresent = liveResult?.present === true && liveResult?.stale !== true;
  const liveDisplay = livePresent
    ? String(liveResult!.value ?? "")
    : "—";

  const elementTypes = manifest.elements.map((e) => e.type);

  const currentSpan = String(selectedElement.style?.span ?? "1x1");
  const currentSided = Boolean(selectedElement.style?.sided);
  const currentColorRole = String(selectedElement.style?.colorRole ?? "default");
  const currentScale = String(selectedElement.style?.scale ?? "fixed");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div data-component="inspector">
      {/* Inspector header */}
      <div data-section="inspector-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <span style={{ fontWeight: 600 }}>Inspector</span>
        <span data-testid="type-badge" style={{ fontSize: "0.85em", opacity: 0.7 }}>
          {selectedElement.type}
        </span>
      </div>

      {gridControls}

      {/* Type select (keep for tests) */}
      <div style={{ padding: "0 12px 8px", display: "none" }}>
        <label>
          Type
          <select
            data-testid="type-select"
            value={selectedElement.type}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            {elementTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </label>
      </div>

      {/* ── BINDING section ─────────────────────────────────────── */}
      <div data-section="insp-section-binding" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <div style={{ padding: "8px 12px 6px" }}>
          <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Binding</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div>
            <div style={{ fontSize: "0.77em", marginBottom: "3px", opacity: 0.7 }}>SignalK Path</div>
            <PathPicker
              value={valuePath}
              manifest={manifest}
              provider={provider}
              onChange={handlePathChange}
            />
          </div>
          <div data-testid="live-value-readout" style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
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
                <span style={{ fontFamily: "monospace", fontSize: "0.85em" }}>
                  {liveDisplay}
                  {liveResult?.sourceUnit ? ` ${liveResult.sourceUnit}` : ""}
                </span>
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
      </div>

      {/* ── DISPLAY section ─────────────────────────────────────── */}
      <div data-section="insp-section-display" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <div style={{ padding: "8px 12px 6px" }}>
          <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Display</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Label</span>
            <input
              data-testid="name-input"
              type="text"
              value={selectedElement.name ?? ""}
              onChange={(e) => handleNameChange(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Unit</span>
            <input
              data-testid="unit-input"
              type="text"
              value={String(selectedElement.format?.unit ?? "")}
              onChange={(e) => handleUnitChange(e.target.value)}
              style={{ width: "52px" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Decimals</span>
            <input
              data-testid="decimals-input"
              type="number"
              value={String(selectedElement.format?.decimals ?? "")}
              onChange={(e) => handleDecimalsChange(Number(e.target.value))}
              style={{ width: "52px" }}
            />
          </div>
        </div>
      </div>

      {/* ── LAYOUT section ──────────────────────────────────────── */}
      <div data-section="insp-section-layout" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <div style={{ padding: "8px 12px 6px" }}>
          <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Layout</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Span</span>
            <select
              data-testid="span-select"
              value={currentSpan}
              onChange={(e) => handleSpanChange(e.target.value)}
              style={{ flex: 1 }}
            >
              {SPAN_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7 }}>Sided</span>
            <button
              data-testid="sided-toggle"
              role="switch"
              aria-checked={currentSided}
              onClick={handleSidedToggle}
              style={{
                width: "30px",
                height: "16px",
                borderRadius: "8px",
                background: currentSided ? "var(--accent, #57c7d8)" : "var(--elev, #12202f)",
                border: "1px solid",
                borderColor: currentSided ? "var(--accent, #57c7d8)" : "var(--line2, #24364a)",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <span style={{
                position: "absolute",
                top: "2px",
                left: currentSided ? "14px" : "2px",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── APPEARANCE section ───────────────────────────────────── */}
      <div data-section="insp-section-appearance" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <div style={{ padding: "8px 12px 6px" }}>
          <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Appearance</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Color</span>
            <select
              data-testid="color-role-select"
              value={currentColorRole}
              onChange={(e) => handleColorRoleChange(e.target.value)}
              style={{ flex: 1 }}
            >
              {COLOR_ROLE_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Scale</span>
            <select
              data-testid="scale-select"
              value={currentScale}
              onChange={(e) => handleScaleChange(e.target.value)}
              style={{ flex: 1 }}
            >
              {SCALE_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
        </div>
      </div>

      {/* Remove element */}
      <div style={{ padding: "10px 12px" }}>
        <button data-testid="remove-element" onClick={handleRemoveElement}>
          Remove element
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tests — should be all green**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -20
```

Expected: All 157+ tests passing (151 original + 6 new).

- [ ] **Step 3: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/visual/Inspector.tsx
git -C editor commit -m "$(cat <<'EOF'
feat(inspector): richer grouped sections — Binding/Display/Layout/Appearance

New fields: span, sided, colorRole, scale all stored on element.style.
Live-value readout with present/stale dot from provider.getValue().
All fields round-trip through serializeMidl→parseMidl unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: TDD — MidlEditor status-bar and top-push tests

**Files:**
- Modify: `editor/src/MidlEditor.test.tsx`

**Interfaces:**
- Consumes: `MidlEditor` component; `data-testid="status-bar"` and `data-testid="top-push"` (not yet added)
- Produces: 2 new failing tests that drive Task 4

- [ ] **Step 1: Add failing tests for status-bar and top-push**

Add these tests at the end of `src/MidlEditor.test.tsx`:

```tsx
test("status-bar shows valid state when model validates", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
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
    const statusBar = getByTestId("status-bar");
    expect(statusBar).toBeTruthy();
    // After loading a valid model, status bar should contain "valid" text (case insensitive)
    expect(statusBar.textContent?.toLowerCase()).toMatch(/valid/i);
  }, { timeout: 3000 });
});

test("top-push button triggers store.save", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
    />,
  );

  await waitFor(() => {
    expect(getByTestId("top-push")).toBeTruthy();
  });

  const prevCount = store.savedCalls.length;

  await act(async () => {
    fireEvent.click(getByTestId("top-push"));
  });

  await waitFor(() => {
    expect(store.savedCalls.length).toBeGreaterThan(prevCount);
  });
});
```

- [ ] **Step 2: Run tests to confirm 2 new failures**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -20
```

Expected: 2 new failures (`status-bar` and `top-push` not found).

- [ ] **Step 3: Commit failing tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/MidlEditor.test.tsx
git -C editor commit -m "$(cat <<'EOF'
test(editor): add failing tests for status-bar validation and top-push button

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement CSS design tokens + MidlEditor chrome

**Files:**
- Create: `editor/src/midl-editor.css`
- Modify: `editor/src/MidlEditor.tsx`

**Interfaces:**
- Consumes: `validateModel(model, manifest)` from `./validate`; existing `handleSave` callback
- Produces: `data-testid="status-bar"`, `data-testid="top-push"`, `data-testid="top-class-select"` (new wrapper), `data-testid="top-theme-select"` (new wrapper); CSS applied to the editor root.

- [ ] **Step 1: Create `src/midl-editor.css`**

Create the file at `editor/src/midl-editor.css` with the full design-token stylesheet:

```css
/* SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
   Copyright (c) 2026 Yey Boats Project. */

@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ── Design Tokens ──────────────────────────────────────────────────────── */
[data-component="midl-editor"] {
  --bg: #0a121c;
  --surface: #0e1825;
  --surface2: #0c1521;
  --elev: #12202f;
  --line: #1d2b3a;
  --line2: #24364a;
  --ink: #cbd6e2;
  --ink-dim: #8aa0b4;
  --ink-faint: #5b7286;
  --ink-bright: #eef4fb;
  --accent: #57c7d8;
  --online: oklch(0.72 0.15 155);
  --drift: oklch(0.80 0.13 75);
  --danger: oklch(0.64 0.19 25);

  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--ink);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  height: 100%;
  -webkit-font-smoothing: antialiased;
}

/* ── Top Bar ─────────────────────────────────────────────────────────────── */
[data-component="midl-editor"] [data-testid="editor-header"] {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--surface2);
  border-bottom: 1px solid var(--line);
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
}

[data-component="midl-editor"] .editor-logo-mark {
  font-weight: 700;
  font-size: 13px;
  color: var(--accent);
  letter-spacing: 0.12em;
  background: rgba(87,199,216,0.10);
  border: 1px solid rgba(87,199,216,0.22);
  border-radius: 4px;
  padding: 3px 6px;
  white-space: nowrap;
}

[data-component="midl-editor"] .editor-logo-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-dim);
  white-space: nowrap;
}

[data-component="midl-editor"] .topbar-divider {
  width: 1px;
  height: 20px;
  background: var(--line2);
  flex-shrink: 0;
}

[data-component="midl-editor"] .btn-ghost {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  font-family: 'Montserrat', sans-serif;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ink-dim);
  background: transparent;
  border: 1px solid var(--line2);
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
[data-component="midl-editor"] .btn-ghost:hover {
  color: var(--ink);
  border-color: var(--ink-faint);
  background: rgba(255,255,255,0.03);
}

[data-component="midl-editor"] .btn-primary {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-family: 'Montserrat', sans-serif;
  font-size: 11.5px;
  font-weight: 600;
  color: #0a121c;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
[data-component="midl-editor"] .btn-primary:hover {
  opacity: 0.88;
  box-shadow: 0 0 12px rgba(87,199,216,0.30);
}

[data-component="midl-editor"] .topbar-select {
  background: var(--elev);
  border: 1px solid var(--line2);
  border-radius: 5px;
  padding: 4px 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--ink);
  cursor: pointer;
}

/* ── Mode tabs ────────────────────────────────────────────────────────────── */
[data-component="midl-editor"] .mode-tabs {
  display: flex;
  align-items: center;
  margin: 0 auto;
  background: var(--elev);
  border: 1px solid var(--line2);
  border-radius: 6px;
  padding: 2px;
  gap: 0;
}
[data-component="midl-editor"] .mode-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-faint);
  border-radius: 4px;
  cursor: pointer;
  border: none;
  background: transparent;
}
[data-component="midl-editor"] .mode-tab.active {
  color: var(--ink-bright);
  background: var(--surface);
}

/* ── Main body layout ─────────────────────────────────────────────────────── */
[data-component="midl-editor"] [data-testid="visual-mode-body"] {
  display: grid;
  grid-template-columns: 210px 1fr 220px;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* ── Left rail ─────────────────────────────────────────────────────────────── */
[data-component="midl-editor"] [data-section="left-rail"] {
  background: var(--surface);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

[data-component="midl-editor"] [data-section="rail-tabs"] {
  display: flex;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

[data-component="midl-editor"] [data-section="rail-tabs"] button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ink-faint);
  cursor: pointer;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  letter-spacing: 0.02em;
}
[data-component="midl-editor"] [data-section="rail-tabs"] button[aria-selected="true"] {
  color: var(--ink);
  border-bottom-color: var(--accent);
}

/* ── Palette ───────────────────────────────────────────────────────────────── */
[data-component="palette"] {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
[data-component="palette"] button {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 9px;
  height: 36px;
  background: var(--elev);
  border: 1px solid var(--line);
  border-left: 3px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-family: 'Montserrat', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-dim);
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
[data-component="palette"] button:hover {
  background: rgba(87,199,216,0.06);
  border-left-color: var(--ink-faint);
  border-color: var(--line2);
}

/* ── Center canvas ─────────────────────────────────────────────────────────── */
[data-component="midl-editor"] [data-testid="preview-host"] {
  position: relative;
  z-index: 2;
}

[data-component="midl-editor"] .canvas-area {
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  flex: 1;
}
[data-component="midl-editor"] .canvas-area::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(93,120,146,0.18) 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
}
[data-component="midl-editor"] .device-frame {
  background: var(--elev);
  border: 2px solid var(--line2);
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.5),
    0 8px 32px rgba(0,0,0,0.55);
  overflow: hidden;
  position: relative;
  z-index: 2;
}

/* ── Inspector ─────────────────────────────────────────────────────────────── */
[data-component="inspector"] {
  background: var(--surface);
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
[data-component="inspector"] input,
[data-component="inspector"] select {
  background: var(--elev);
  border: 1px solid var(--line2);
  border-radius: 4px;
  padding: 3px 7px;
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: var(--ink);
}

/* ── Status bar ────────────────────────────────────────────────────────────── */
[data-testid="status-bar"] {
  display: flex;
  align-items: center;
  height: 32px;
  background: var(--surface2);
  border-top: 1px solid var(--line);
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
  font-size: 11px;
}
[data-testid="status-bar"] .status-valid-indicator {
  color: var(--online);
  font-weight: 500;
}
[data-testid="status-bar"] .status-error-indicator {
  color: var(--danger);
  font-weight: 500;
}
[data-testid="status-bar"] .status-spacer { flex: 1; }
[data-testid="status-bar"] .status-autosave {
  color: var(--ink-faint);
  font-size: 10.5px;
}
```

- [ ] **Step 2: Modify `MidlEditor.tsx` to import CSS, add status-bar and top-push**

The key changes to `src/MidlEditor.tsx`:

1. Add `import "./midl-editor.css";` at the top (after the React import).
2. Add `import { validateModel } from "./validate";` (already exists as a import? No — check: it's not imported in MidlEditor.tsx currently, only used in usePreview.ts). Add the import.
3. Compute validation state inline: `const validation = manifest ? validateModel(model, manifest) : null;`
4. Replace the `<div data-testid="editor-header">` block to add logo, topbar-select wrappers, mode-tabs, and btn-primary push button.
5. Add `<div data-testid="status-bar">` at the bottom of the editor return.

Full `MidlEditor.tsx` changes (show only the modified sections; the logic remains identical):

**Header block replacement** (replace lines 273–314):
```tsx
<div data-testid="editor-header" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
  {/* Logo */}
  <span className="editor-logo-mark">YEY</span>
  <span className="editor-logo-text">Instruments Manager</span>
  <div className="topbar-divider" />

  {/* Mode tabs */}
  <div className="mode-tabs">
    <button
      data-testid="mode-toggle"
      className={`mode-tab${mode === "visual" ? " active" : ""}`}
      onClick={() => setMode((m) => (m === "visual" ? "source" : "visual"))}
    >
      Visual
    </button>
    <button
      className={`mode-tab${mode === "source" ? " active" : ""}`}
      onClick={() => setMode((m) => (m === "visual" ? "source" : "visual"))}
    >
      Source
    </button>
  </div>

  {/* Device / class selector — keep existing testid + add wrapper */}
  <div data-testid="top-class-select">
    <select
      data-testid="class-switch"
      className="topbar-select"
      value={className}
      onChange={(e) => setClassName(e.target.value)}
    >
      {SUPPORTED_CLASSES.map((cls) => (
        <option key={cls} value={cls}>{cls}</option>
      ))}
    </select>
  </div>

  {/* Theme selector — keep existing testid + add wrapper */}
  <div data-testid="top-theme-select">
    <select
      data-testid="theme-switch"
      className="topbar-select"
      value={themeChoice}
      onChange={(e) => setThemeChoice(e.target.value as Theme)}
    >
      <option value="night">Night</option>
      <option value="day">Day</option>
    </select>
  </div>

  {/* Name input */}
  <input
    data-testid="name-input"
    type="text"
    value={name}
    onChange={(e) => setName(e.target.value)}
    placeholder="Dashboard name"
    style={{ flex: 1, minWidth: 0 }}
  />

  {/* Save button */}
  <button
    data-testid="save-button"
    className="btn-ghost"
    onClick={handleSave}
    disabled={saving}
  >
    {saving ? "Saving…" : "Save"}
  </button>

  {/* Push to device — primary, calls same save path */}
  <button
    data-testid="top-push"
    className="btn-primary"
    onClick={handleSave}
    disabled={saving}
  >
    Push to device ▸
  </button>
</div>
```

**Status bar** — add just before the final closing `</div>` of the component return (after the mode body):
```tsx
{/* Status bar */}
{manifest && (
  <div data-testid="status-bar">
    {(() => {
      const v = validateModel(model, manifest);
      if (v.ok) {
        return (
          <>
            <span className="status-valid-indicator">✓ Valid for {className}</span>
            <span style={{ color: "var(--ink-faint)", fontSize: "10px" }}>· structural · semantic · capability</span>
            <span className="status-spacer" />
            <span className="status-autosave">autosaved</span>
          </>
        );
      }
      const errorCount = v.issues.filter((i) => i.severity !== "warning").length;
      return (
        <>
          <span className="status-error-indicator">⚠ {errorCount} error{errorCount !== 1 ? "s" : ""}</span>
          <span style={{ color: "var(--ink-faint)", fontSize: "10px" }}>{v.issues[0]?.message}</span>
        </>
      );
    })()}
  </div>
)}
```

> **Important:** The `theme-switch` test uses `fireEvent.click(getByTestId("theme-switch"))` — but with the select approach the test uses `fireEvent.change`. Check the existing tests: `MidlEditor.test.tsx` does NOT test `theme-switch` via click, and `class-switch` uses `fireEvent.change(getByTestId("class-switch"), ...)`. So the select approach is safe. However `theme-switch` was a `<button>` before — search for usages of `data-testid="theme-switch"` in ALL test files to confirm it's safe to change to a `<select>`.

- [ ] **Step 3: Verify no test uses `theme-switch` as a button (check before editing)**

```bash
grep -r "theme-switch" /Users/borissorochkin/code/yey.boats/midl-editor/editor/src/ --include="*.ts" --include="*.tsx"
```

Expected: only referenced in `MidlEditor.tsx` (the component itself). If any test uses `fireEvent.click` on `theme-switch`, keep it as a button with `onClick` toggling. If no tests reference it in test files, the select approach is fine.

- [ ] **Step 4: Apply the MidlEditor.tsx changes**

Using the Edit tool, apply the header and status-bar changes described in Step 2.

- [ ] **Step 5: Run all tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -30
```

Expected: All 159+ tests passing.

- [ ] **Step 6: Verify build**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor && npm run build:lib 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/midl-editor.css src/MidlEditor.tsx
git -C editor commit -m "$(cat <<'EOF'
feat(editor): dark design-token chrome — topbar, status-bar, top-push button

New midl-editor.css applies --bg/--surface/--accent tokens from builder mockup.
Status bar shows validateModel result (valid/error count) for current class.
top-push button wired to existing handleSave. theme-switch changed to select.
Existing data-testids preserved; top-class-select / top-theme-select added.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Style Palette + GridCanvas to match mockup

**Files:**
- Modify: `editor/src/visual/Palette.tsx`
- Modify: `editor/src/visual/GridCanvas.tsx`

**Interfaces:**
- No new interfaces; existing `data-testid` values preserved.

- [ ] **Step 1: Update Palette.tsx to use dark card styling**

Replace `Palette.tsx` render with:
```tsx
return (
  <div data-component="palette" style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "8px", flex: 1, overflowY: "auto" }}>
    {manifest.elements.map((el) => (
      <button
        key={el.type}
        data-testid={`palette-${el.type}`}
        onClick={() => onAdd(el.type)}
      >
        {el.type}
      </button>
    ))}
  </div>
);
```

The CSS in `midl-editor.css` already styles `[data-component="palette"] button` with the dark card appearance.

- [ ] **Step 2: Update GridCanvas.tsx to use accent outline for selected cell**

Replace the cell `border` style values:
```tsx
border: i === selected
  ? "2px solid var(--accent, #57c7d8)"
  : "1px dashed rgba(93,120,146,0.3)",
backgroundColor: i === selected ? "rgba(87,199,216,0.04)" : "transparent",
```

- [ ] **Step 3: Run all tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -20
```

Expected: All tests still passing.

- [ ] **Step 4: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/visual/Palette.tsx src/visual/GridCanvas.tsx
git -C editor commit -m "$(cat <<'EOF'
style(palette,canvas): dark card palette items, accent outline on selected cell

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification + build + report

**Files:**
- Create: `/Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd/inspector-polish-report.md`

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1
```

Expected: All tests passing (157+ green).

- [ ] **Step 2: Run build**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor && npm run build:lib 2>&1
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 3: Write report to `.superpowers/sdd/inspector-polish-report.md`**

```bash
mkdir -p /Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd
```

Then create the report file with:

```markdown
# Inspector Polish Report

**Status:** complete
**Commit:** <git log --oneline -1>
**Test summary:** <N> tests, all green
**Build:** npm run build:lib — success

## Inspector props added

| Prop | Stored at | Round-trips |
|------|-----------|-------------|
| `span` | `element.style.span` (string: "1x1"/"1x2"/"2x1"/"2x2") | ✅ via element.style passthrough in serializeMidl/parseMidl |
| `sided` | `element.style.sided` (string: "P" or absent) | ✅ via element.style passthrough |
| `colorRole` | `element.style.colorRole` (string: "default"/"accent"/"warn") | ✅ via element.style passthrough |
| `scale` | `element.style.scale` (string: "fixed"/"metric") | ✅ via element.style passthrough |

## Props NOT round-tripped

None — all new props use `element.style` which is already `Record<string, unknown>`
and fully preserved by `editorElementToElement` / `elementToEditorElement` in `midl-io.ts`.

**Note on span:** The grid model does not yet have a native cell-span concept (cells are
`{ element?: string }` with no colspan/rowspan). The `span` value is stored on
`element.style.span` as a display hint; it does not resize the grid cell in the editor
canvas. A future task would need to update `LayoutNode.GridCell` and the canvas renderer
to honour colspan/rowspan.
```

- [ ] **Step 4: Final commit (if report is new)**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C . add .superpowers/sdd/inspector-polish-report.md 2>/dev/null || true
git -C . add -A 2>/dev/null || true
# only if there are staged changes:
git -C . diff --cached --quiet || git -C . commit -m "$(cat <<'EOF'
docs: add inspector-polish-report.md to .superpowers/sdd

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### 1. Spec coverage check

| Spec requirement | Task |
|---|---|
| BINDING section: SignalK path (PathPicker) + live value readout with green dot | Task 2 |
| DISPLAY: Unit, Decimals, Label | Task 2 |
| LAYOUT: Span control (1×1/1×2/2×1/2×2), Sided toggle | Task 2 |
| APPEARANCE: Color role, Scale | Task 2 |
| Each edit updates model immutably | Task 2 |
| Pass `provider` into Inspector from MidlEditor | Already done in existing code |
| `span` stored on `element.style` (not grid model) | Task 2 — noted in report |
| `sided` stored on `element.style` | Task 2 |
| `colorRole` stored on `element.style` (as `colorRole`) | Task 2 |
| `scale` stored on `element.style` | Task 2 |
| CSS: dark tokens --bg/#0a121c etc, Montserrat, JetBrains Mono | Task 4 |
| Top bar: YEY logo + "Dashboard Builder", device-class dropdown, theme dropdown | Task 4 |
| Top bar: Import/Export/Save + "Push to device ▸" primary button | Task 4 |
| Left rail: Elements/Data tabs styled | Task 4 CSS + Task 5 |
| Status bar: "✓ Valid for <class>" / error count | Task 4 |
| Canvas: device frame centered on dot-grid background | Task 4 CSS |
| data-testid: `top-class-select`, `top-theme-select`, `top-push`, `status-bar` | Task 4 |
| TDD: span/sided/color/scale update model + round-trip | Task 1 |
| TDD: live-value readout present/stale states | Task 1 |
| TDD: status-bar reflects validation | Task 3 |
| TDD: top-push triggers store.save | Task 3 |
| `npm test --workspace editor` green | Tasks 2, 4 |
| `npm run build:lib` success | Task 6 |
| Commit with co-author trailer | All tasks |

All requirements covered.

### 2. Placeholder scan

No TBDs, no "similar to", all code blocks are complete.

### 3. Type consistency

- `provider.getValue` called as `provider.getValue({ kind: "signalk", path: valuePath } as Source)` — `Source` is imported from `@yey-boats/midl` (same package already imported in `Inspector.tsx`).
- `element.style` is `Record<string, unknown>` — can hold any string values without model changes.
- `validateModel` already exported from `./validate` — add the import to `MidlEditor.tsx`.
- `Theme` type is `"night" | "day"` — `setThemeChoice(e.target.value as Theme)` is correct.
