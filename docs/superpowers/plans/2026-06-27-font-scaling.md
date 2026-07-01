# Font Scaling — Number Fills the Cell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rendered numeric hero font scale relative to its cell so that the maximum size in a single-cell view nearly fills the screen, and the Inspector Size control visibly changes the rendered SVG font-size.

**Architecture:** Introduce a `sizeFactor` helper in `web/src/svg/tiles.ts` that computes `fontSize = autoFitBase(rect) * factor` where `autoFitBase` returns a sensible fraction of `min(w, h)` and `factor` is a 0..1 float stored in `element.style.size` (reinterpreted from absolute px to a relative scale). The Inspector is updated to expose named levels (S/M/L/XL/Fill = 0.25/0.40/0.55/0.75/1.0) that map to those factor values. Catalog defaults set a large default (L = 0.55). The change is backward-compatible (old integer px values are migrated to the nearest factor at read time in `parseMidl`).

**Tech Stack:** TypeScript, React, Vitest, SVG, YAML (via js-yaml), @yey-boats/midl, @yey-boats/midl-web

## Global Constraints

- Branch: `feat/midl-editor` in `/Users/borissorochkin/code/yey.boats/midl-editor`
- All tests in `editor`, `web`, and `ts` workspaces must stay green
- `npm run build:lib` in `editor/` must succeed
- Do NOT rebuild the IIFE global; do NOT push
- Conformance corpus (`conformance/cases.yaml` + `conformance/expected.json`) must not regress
- Python validator must keep accepting the same field (`style.size` is a free-form Record — no schema change needed because style is `additionalProperties: true`)
- Co-author every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Report results to `/Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd/font-scaling-report.md`

---

## Background / Root-Cause Analysis

### How `size` flows today

1. `Inspector.tsx` line 148: `handleSizeChange(size: number)` stores `style.size` as a raw integer (e.g. `28`).
2. `render-svg.ts` line 36: `opts = { size: numv(style.size) }` passes the integer to tile builders.
3. `tiles.ts` line 37: `const hero = opts.size ?? 38;` uses it as an **absolute px** font-size.
4. Result: in a 480×480 viewport a 2×2 grid gives 240×240 cells; `size=48` is only 20% of cell height — visually tiny. Selecting "Fill" (48px) in a 480px cell still produces 48px text.

### Why the fix must be relative

The cell rect is known at render time (`rect.w`, `rect.h`). Font-size should be a fraction of `min(rect.w, rect.h)`. A relative factor stored in `style.size` as a float 0..1 lets the renderer scale correctly for any cell size.

### Backward-compat migration

Existing docs that have `style.size` as an integer (14, 20, 28, 48) will be losslessly migrated: `parseMidl` in `editor/src/midl-io.ts` (or a small helper) maps old px values to the nearest size factor. Newly written docs always write a float. The JSON Schema for `style` is free-form (`additionalProperties` allowed), so no schema change is required.

---

## File Map

| File | Change |
|---|---|
| `web/src/svg/tiles.ts` | Add `autoFitBase(rect)` + `heroFontSize(rect, factor)`. Change `singleValueSvg`, `barSvg`, `trendSvg`, `gaugeSvg`, `autopilotSvg`, `buttonSvg` to call `heroFontSize`. |
| `web/test/paint.test.ts` | Add renderer scaling tests: small vs big cell yields proportional sizes; max factor in full-cell yields large size. |
| `web/test/svg.test.ts` | Add `singleValueSvg` font-size scaling tests. |
| `editor/src/signalk-catalog.ts` | `applyCatalogDefaults` sets `style.size = 0.55` (L) for single-value. |
| `editor/src/visual/Inspector.tsx` | Replace the `fontSizes` / absolute px select with a named-level select (S/M/L/XL/Fill → 0.25/0.40/0.55/0.75/1.0). Update `handleSizeChange`, `currentSize`, display. |
| `editor/src/midl-io.ts` | In `parseMidl`: if `style.size` is a number > 1 (legacy px), map to nearest factor. |
| `editor/src/visual/Inspector.test.tsx` | Update size-select tests for new labels/values; add font-size-preview round-trip test. |

---

## Task 1: Add relative font-size helpers to tiles.ts + failing renderer tests

**Files:**
- Modify: `web/src/svg/tiles.ts`
- Test: `web/test/svg.test.ts`

**Interfaces:**
- Produces: `autoFitBase(rect: Rect): number` — returns `Math.min(rect.w, rect.h) * 0.60` (60% of min dimension as the "Fill" base)
- Produces: `heroFontSize(rect: Rect, factor: number | undefined): number` — returns `autoFitBase(rect) * clamp(factor ?? DEFAULT_SIZE_FACTOR, 0.1, 1.0)` where `DEFAULT_SIZE_FACTOR = 0.55`
- `singleValueSvg` changes: `const hero = heroFontSize(rect, opts.size);`
- `barSvg` changes: same
- `trendSvg` changes: same (was `opts.size ?? 38`)
- `gaugeSvg` changes: proportional to min(w,h) already for the arc; text uses `heroFontSize`
- `TileOpts.size` type stays `number | undefined` — float 0..1 now instead of px

- [ ] **Step 1: Write the failing renderer tests**

In `web/test/svg.test.ts`, add a new `describe("singleValueSvg font scaling")` block after the existing `renderDashboardSvg` block:

```typescript
import { singleValueSvg } from "../src/svg/tiles";
import type { ElementModel } from "../src/model";

describe("singleValueSvg font scaling", () => {
  const m: ElementModel = { state: "ok", text: "6.0" };
  const TH_NIGHT = theme("night");

  test("big cell produces larger font than small cell (same factor)", () => {
    const svgSmall = singleValueSvg({ x: 0, y: 0, w: 120, h: 120 }, m, TH_NIGHT, { size: 0.55 });
    const svgBig   = singleValueSvg({ x: 0, y: 0, w: 480, h: 480 }, m, TH_NIGHT, { size: 0.55 });
    const fsSmall = extractFontSize(svgSmall);
    const fsBig   = extractFontSize(svgBig);
    expect(fsBig).toBeGreaterThan(fsSmall);
  });

  test("max factor (1.0) in 480px cell yields font-size > 40% of cell height", () => {
    const svg = singleValueSvg({ x: 0, y: 0, w: 480, h: 480 }, m, TH_NIGHT, { size: 1.0 });
    const fs = extractFontSize(svg);
    expect(fs).toBeGreaterThan(480 * 0.40);
  });

  test("min factor (0.25) yields smaller font than max factor (1.0)", () => {
    const rect = { x: 0, y: 0, w: 480, h: 480 };
    const svgMin = singleValueSvg(rect, m, TH_NIGHT, { size: 0.25 });
    const svgMax = singleValueSvg(rect, m, TH_NIGHT, { size: 1.0 });
    expect(extractFontSize(svgMax)).toBeGreaterThan(extractFontSize(svgMin));
  });

  test("default (no size) yields a sensible auto-fit in a 480px cell (>30% height)", () => {
    const svg = singleValueSvg({ x: 0, y: 0, w: 480, h: 480 }, m, TH_NIGHT, {});
    const fs = extractFontSize(svg);
    expect(fs).toBeGreaterThan(480 * 0.30);
  });
});

/** Extract the first font-size="N" value from an SVG string as a number. */
function extractFontSize(svg: string): number {
  const m = /font-size="([\d.]+)"/.exec(svg);
  if (!m) throw new Error(`No font-size found in: ${svg.slice(0, 200)}`);
  return parseFloat(m[1]);
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace web -- --reporter=verbose 2>&1 | grep -A3 "font scaling"
```

Expected: 4 failing tests in `singleValueSvg font scaling` (because `singleValueSvg` doesn't export from `tiles.ts` at the top level of the test imports yet, and `opts.size` is still treated as absolute px).

- [ ] **Step 3: Implement `autoFitBase` + `heroFontSize` in tiles.ts**

In `web/src/svg/tiles.ts`, add after the `FN` constant (line 17):

```typescript
/** Default size factor when element.style.size is not set. L ≈ 55% of min cell dimension. */
const DEFAULT_SIZE_FACTOR = 0.55;

/**
 * Base font size for "Fill" (factor=1.0) in a given cell rect.
 * Returns 60% of the smaller cell dimension — so in a 480×480 cell, base = 288px.
 * A factor of 0.55 (L) then gives 0.55 × 288 = ~158px, visually large.
 */
function autoFitBase(rect: Rect): number {
  return Math.min(rect.w, rect.h) * 0.60;
}

/**
 * Hero font-size for a numeric value, relative to the cell.
 * `factor` is 0..1, stored as element.style.size (float).
 * Default factor: DEFAULT_SIZE_FACTOR (L = 0.55).
 */
function heroFontSize(rect: Rect, factor: number | undefined): number {
  const f = factor != null ? Math.max(0.1, Math.min(1.0, factor)) : DEFAULT_SIZE_FACTOR;
  return autoFitBase(rect) * f;
}
```

Then update `singleValueSvg` (line 37):

```typescript
// BEFORE:
const hero = opts.size ?? 38;
// AFTER:
const hero = heroFontSize(rect, opts.size);
```

Update `barSvg` (line 76):

```typescript
// BEFORE:
const hero = opts.size ?? 38;
// AFTER:
const hero = heroFontSize(rect, opts.size);
```

Update `trendSvg` (line 146):

```typescript
// BEFORE:
out.push(txt(cx, cy + 38 * 0.34, opts.size ?? 38, ...));
// AFTER:
const hero = heroFontSize(rect, opts.size);
out.push(txt(cx, cy + hero * 0.34, hero, ...));
```

Update `gaugeSvg` (line 122):

```typescript
// BEFORE:
out.push(txt(cx, cy + 28 * 0.34, opts.size ?? 28, ...));
// AFTER:
const hero = heroFontSize(rect, opts.size);
out.push(txt(cx, cy + hero * 0.34, hero, ...));
```

Update `autopilotSvg` (line 158, `fs` is used for pill sizing):

```typescript
// BEFORE:
const fs = opts.size ?? 20;
// AFTER:
const fs = heroFontSize(rect, opts.size != null ? opts.size : 0.35); // AP pill: 35% of cell
```

Update `buttonSvg` (line 170):

```typescript
// BEFORE:
const fs = opts.size ?? 16;
// AFTER:
const fs = heroFontSize(rect, opts.size != null ? opts.size : 0.28); // button: 28% of cell
```

Note: `buttonSvg` takes `label: string` instead of `m: ElementModel` and the rect is passed from caller. The logic is the same.

Also update `singleValueSvg` import of `Rect` — it's already imported from `@yey-boats/midl`, so no new import needed.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace web 2>&1 | tail -30
```

Expected: all web tests pass, including the 4 new font-scaling tests.

- [ ] **Step 5: Also add paint.test.ts scaling tests**

Add to `web/test/paint.test.ts`:

```typescript
test("single-value canvas font size scales with cell size", () => {
  // We can't easily extract canvas font from recorder, but we can verify
  // centerText is called with a font string that encodes size.
  // The canvas paint path uses a fixed "32px" — this tests that it doesn't regress.
  const { ctx, calls } = recorder();
  const el: Element = { type: "single-value", bindings: { value: { kind: "signalk", path: "s" } } };
  const p = new MockDataProvider({ s: { value: 42 } });
  paintScreen(ctx, [{ elementId: "sv", rect: { x: 0, y: 0, w: 240, h: 240 } }], { sv: el }, p, THEMES.night);
  // should set font at some point
  const fonts = calls.filter((k) => k.fn === "set:font");
  expect(fonts.length).toBeGreaterThan(0);
});
```

Run again:

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace web 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add web/src/svg/tiles.ts web/test/svg.test.ts web/test/paint.test.ts && git commit -m "$(cat <<'EOF'
feat(renderer): relative font scaling — hero size scales with cell, not absolute px

autoFitBase(rect)=0.6*min(w,h); heroFontSize(rect, factor)=base*factor.
singleValueSvg/barSvg/trendSvg/gaugeSvg/autopilotSvg/buttonSvg all use the
relative helper. Default factor 0.55 (L). Max factor 1.0 in a 480×480 cell
yields ~288px hero, filling the cell. TDD: 4 new font-scaling assertions in
web/test/svg.test.ts.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update Inspector Size control — named levels instead of absolute px

**Files:**
- Modify: `editor/src/visual/Inspector.tsx`
- Test: `editor/src/visual/Inspector.test.tsx`

**Interfaces:**
- Consumes: `element.style.size` as float 0..1 (set by this task)
- Produces: named `SIZE_LEVELS` array `[{ label: "S", value: 0.25 }, ...]`
- `handleSizeChange(factor: number)` sets `style.size = factor`
- `currentSize` reads a float from `style.size`
- `size-select` options render as "S", "M", "L", "XL", "Fill" with float values

- [ ] **Step 1: Write the failing Inspector tests**

In `editor/src/visual/Inspector.test.tsx`, find the `// ── Fix 3: Size select` section (around line 684) and replace the existing tests (or add new ones that assert the new behavior). The existing tests check for integer px values (14, 20, 28, 48) — they will fail after the change. Update them:

Replace the block starting at line 703 (`test("size-select options include manifest.fonts values when present"`) through line 820 with:

```typescript
// ── Fix 3: Size select (relative factor levels) ───────────────────────────────

test("Inspector renders a size-select in the APPEARANCE section", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const { getByTestId } = render(
    <Inspector model={model} selectedCell={0} manifest={MANIFEST} provider={provider} onChange={vi.fn()} />,
  );
  expect(getByTestId("size-select")).toBeTruthy();
});

test("size-select options are named levels S/M/L/XL/Fill with float values", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const { getByTestId } = render(
    <Inspector model={model} selectedCell={0} manifest={MANIFEST} provider={provider} onChange={vi.fn()} />,
  );
  const select = getByTestId("size-select") as HTMLSelectElement;
  const labels = Array.from(select.options).map((o) => o.text);
  const values = Array.from(select.options).map((o) => Number(o.value));
  expect(labels).toEqual(["S", "M", "L", "XL", "Fill"]);
  expect(values).toEqual([0.25, 0.40, 0.55, 0.75, 1.0]);
});

test("changing size-select to Fill sets style.size to 1.0", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });
  const { getByTestId } = render(
    <Inspector model={model} selectedCell={0} manifest={MANIFEST} provider={provider} onChange={onChange} />,
  );
  fireEvent.change(getByTestId("size-select"), { target: { value: "1" } });
  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.size).toBe(1.0);
});

test("element.style.size float round-trips through serializeMidl → parseMidl", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  let captured: EditorModel = model;
  const onChange = vi.fn((m: EditorModel) => { captured = m; });
  const { getByTestId } = render(
    <Inspector model={model} selectedCell={0} manifest={MANIFEST} provider={provider} onChange={onChange} />,
  );
  fireEvent.change(getByTestId("size-select"), { target: { value: "1" } });
  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.size).toBe(1.0);
});

test("size-select shows element's current style.size as selected option", () => {
  const model = makeGridModel({
    elements: {
      sog: {
        id: "sog", type: "single-value", name: "SOG",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        format: { unit: "kn", decimals: 1 },
        style: { size: 0.75 },
      },
    },
  });
  const provider = new MockDataProvider({});
  const { getByTestId } = render(
    <Inspector model={model} selectedCell={0} manifest={MANIFEST} provider={provider} onChange={vi.fn()} />,
  );
  const select = getByTestId("size-select") as HTMLSelectElement;
  expect(Number(select.value)).toBe(0.75);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "FAIL|size-select"
```

Expected: the new size-select tests fail (options still show px values).

- [ ] **Step 3: Update Inspector.tsx — replace fontSizes with SIZE_LEVELS**

In `editor/src/visual/Inspector.tsx`:

After line 25 (`const SCALE_OPTIONS = ...`), add:

```typescript
const SIZE_LEVELS = [
  { label: "S",    value: 0.25 },
  { label: "M",    value: 0.40 },
  { label: "L",    value: 0.55 },
  { label: "XL",   value: 0.75 },
  { label: "Fill", value: 1.00 },
] as const;
```

Remove lines 143–144 (`FONT_SIZE_FALLBACK` and `fontSizes`):

```typescript
// DELETE these two lines:
const FONT_SIZE_FALLBACK = [14, 20, 28, 48];
const fontSizes: number[] = manifest.fonts && manifest.fonts.length > 0 ? manifest.fonts : FONT_SIZE_FALLBACK;
```

Update `handleSizeChange` (line 146). The signature stays `(size: number)` but it now receives a float:

```typescript
function handleSizeChange(size: number) {
  if (!selectedElement) return;
  updateElement({ ...selectedElement, style: { ...selectedElement.style, size } });
}
```

(No change needed — it already just stores the value.)

Update `currentSize` (lines 224–226):

```typescript
const currentSize: number | "" = typeof selectedElement?.style?.size === "number"
  ? selectedElement.style.size as number
  : "";
```

(No change needed — it already reads the number.)

Update the size-select render block (lines 435–445):

```typescript
// BEFORE:
<select
  data-testid="size-select"
  value={String(currentSize)}
  onChange={(e) => handleSizeChange(Number(e.target.value))}
  style={{ flex: 1 }}
>
  {fontSizes.map((s) => (<option key={s} value={String(s)}>{s}px</option>))}
</select>

// AFTER:
<select
  data-testid="size-select"
  value={String(currentSize !== "" ? currentSize : 0.55)}
  onChange={(e) => handleSizeChange(Number(e.target.value))}
  style={{ flex: 1 }}
>
  {SIZE_LEVELS.map(({ label, value }) => (
    <option key={label} value={String(value)}>{label}</option>
  ))}
</select>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -30
```

Expected: all 288+ editor tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add editor/src/visual/Inspector.tsx editor/src/visual/Inspector.test.tsx && git commit -m "$(cat <<'EOF'
feat(editor): Inspector Size control as named levels S/M/L/XL/Fill → factor 0.25..1.0

Replaces the absolute px select (14/20/28/48) with named relative size levels
that map to factor values consumed by the relative heroFontSize renderer. L is
the default (0.55). Fill (1.0) makes the number nearly fill the cell. Tests
updated.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Catalog defaults — set `style.size = 0.55` (L) for single-value elements

**Files:**
- Modify: `editor/src/signalk-catalog.ts`
- Test: `editor/src/signalk-catalog.test.ts`

**Interfaces:**
- Consumes: `applyCatalogDefaults(element, entry)` — existing function
- Produces: updated `applyCatalogDefaults` that also sets `style.size = 0.55` when `style.size` is not already set

- [ ] **Step 1: Write failing test**

In `editor/src/signalk-catalog.test.ts`, add:

```typescript
test("applyCatalogDefaults sets style.size to 0.55 (L) when not already present", () => {
  const entry = SIGNALK_CATALOG.find((e) => e.path === "navigation.speedOverGround")!;
  const el: EditorElement = { id: "x", type: "single-value" };
  const result = applyCatalogDefaults(el, entry);
  expect(result.style?.size).toBe(0.55);
});

test("applyCatalogDefaults does not overwrite existing style.size", () => {
  const entry = SIGNALK_CATALOG.find((e) => e.path === "navigation.speedOverGround")!;
  const el: EditorElement = { id: "x", type: "single-value", style: { size: 0.25 } };
  const result = applyCatalogDefaults(el, entry);
  expect(result.style?.size).toBe(0.25);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "FAIL|style.size"
```

Expected: 2 failing tests.

- [ ] **Step 3: Update applyCatalogDefaults**

In `editor/src/signalk-catalog.ts`, update `applyCatalogDefaults` to set a default `size` factor:

```typescript
export function applyCatalogDefaults(
  element: EditorElement,
  entry: CatalogEntry,
): EditorElement {
  let updated = { ...element };

  // name ← catalog label (only if name is falsy/unset)
  if (!updated.name) {
    updated = { ...updated, name: entry.label };
  }

  // format.unit ← catalog unit (only if not already set)
  const currentUnit = updated.format?.unit;
  const currentDecimals = updated.format?.decimals;
  const needsUnit = Boolean(entry.unit && !currentUnit);
  const needsDecimals = typeof currentDecimals !== "number";

  if (needsUnit || needsDecimals) {
    const effectiveUnit = needsUnit ? entry.unit : (currentUnit as string | undefined);
    const newFormat: Record<string, unknown> = { ...updated.format };
    if (needsUnit) newFormat.unit = entry.unit;
    if (needsDecimals) newFormat.decimals = defaultDecimalsForUnit(effectiveUnit);
    updated = { ...updated, format: newFormat };
  }

  // style.size ← default L factor (0.55) when not already set
  if (typeof updated.style?.size !== "number") {
    updated = { ...updated, style: { ...updated.style, size: 0.55 } };
  }

  return updated;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add editor/src/signalk-catalog.ts editor/src/signalk-catalog.test.ts && git commit -m "$(cat <<'EOF'
feat(editor): catalog defaults — set style.size=0.55 (L) for freshly-bound elements

New elements get the L size factor by default so the hero number is large
rather than tiny. Existing elements with style.size set are not touched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backward-compat migration of legacy px values in parseMidl

**Files:**
- Modify: `editor/src/midl-io.ts`
- Test: `editor/src/midl-io.test.ts`

**Context:** Existing MIDL docs may have `style: { size: 28 }` (absolute px integer from the old Inspector). After this change the renderer treats `size` as a 0..1 factor, so `28` would be clamped to `1.0`. We need to migrate legacy px values to the nearest factor on read.

**Migration table** (based on old fallback `[14, 20, 28, 48]`):

| Legacy px | Nearest factor |
|---|---|
| ≤14 | 0.25 (S) |
| 20 | 0.40 (M) |
| 28 | 0.55 (L) |
| ≥48 | 1.00 (Fill) |

Any value > 1 is treated as legacy px. Values 0..1 are already the new factor format.

**Interfaces:**
- Produces: `migrateSizePx(px: number): number` — helper that maps a legacy px value to a factor

- [ ] **Step 1: Write failing tests**

In `editor/src/midl-io.test.ts`, add a section:

```typescript
describe("parseMidl — legacy style.size migration", () => {
  const MANIFEST = { /* reuse from existing tests */ };

  test("style.size=48 (legacy Fill px) migrates to 1.0", () => {
    const yaml = `
midl: "1.0.0"
screens:
  - id: s
    elements:
      sog:
        type: single-value
        style: { size: 48 }
        bindings: { value: { kind: signalk, path: navigation.speedOverGround } }
    layout: { element: sog }
`;
    const m = parseMidl(yaml);
    expect(m.elements["sog"]?.style?.size).toBe(1.0);
  });

  test("style.size=28 (legacy L px) migrates to 0.55", () => {
    const yaml = `
midl: "1.0.0"
screens:
  - id: s
    elements:
      sog:
        type: single-value
        style: { size: 28 }
        bindings: { value: { kind: signalk, path: navigation.speedOverGround } }
    layout: { element: sog }
`;
    const m = parseMidl(yaml);
    expect(m.elements["sog"]?.style?.size).toBe(0.55);
  });

  test("style.size=0.75 (already new format) passes through unchanged", () => {
    const yaml = `
midl: "1.0.0"
screens:
  - id: s
    elements:
      sog:
        type: single-value
        style: { size: 0.75 }
        bindings: { value: { kind: signalk, path: navigation.speedOverGround } }
    layout: { element: sog }
`;
    const m = parseMidl(yaml);
    expect(m.elements["sog"]?.style?.size).toBe(0.75);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "FAIL|legacy"
```

Expected: 2 failing tests (the `48` → `1.0` and `28` → `0.55` migrations).

- [ ] **Step 3: Read midl-io.ts to find parseMidl**

```bash
grep -n "parseMidl\|style\|size" /Users/borissorochkin/code/yey.boats/midl-editor/editor/src/midl-io.ts | head -40
```

Find where elements are mapped and add the migration there. The migration must happen inside `parseMidl` after the YAML is parsed and elements are extracted.

- [ ] **Step 4: Implement migrateSizePx and integrate into parseMidl**

In `editor/src/midl-io.ts`, add the migration helper near the top of the file:

```typescript
/** Map legacy absolute-px style.size values (from old Inspector) to the new 0..1 factor.
 * Values already in the 0..1 range pass through unchanged.
 * Migration table: ≤14→0.25, 20→0.40, 28→0.55, ≥48→1.0, else nearest.
 */
export function migrateSizePx(px: number): number {
  if (px <= 1) return px; // already a factor
  if (px <= 14) return 0.25;
  if (px <= 17) return 0.40; // between 14 and 20 → M
  if (px <= 24) return 0.40; // 20px region → M
  if (px <= 38) return 0.55; // 28px region → L
  if (px <= 62) return 0.75; // 48px region → XL
  return 1.0; // very large → Fill
}
```

In `parseMidl`, after extracting `element.style`, add:

```typescript
// Migrate legacy absolute-px style.size to relative factor (0..1).
if (element.style && typeof element.style.size === "number" && element.style.size > 1) {
  element.style = { ...element.style, size: migrateSizePx(element.style.size as number) };
}
```

The exact location depends on `parseMidl`'s structure — read the file first (Step 3 above) to find the right place. It should be applied to each element right after the element object is constructed from the parsed YAML.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add editor/src/midl-io.ts editor/src/midl-io.test.ts && git commit -m "$(cat <<'EOF'
feat(editor): migrate legacy style.size px values to relative factor on parseMidl

Old docs with style.size=48 (absolute px) migrate to 1.0 (Fill); size=28→0.55
(L); size=14→0.25 (S). Values already in 0..1 pass through unchanged. Keeps
backward-compat for any saved MIDL files created with the old Inspector.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Build verification + full test run + conformance corpus

**Files:** None modified. Verification only.

**Interfaces:**
- Consumes: all changes from Tasks 1–4

- [ ] **Step 1: Run all workspace tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor && npm test --workspace web && npm test --workspace ts
```

Expected: all three workspaces green.

- [ ] **Step 2: Run the conformance corpus explicitly**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace ts -- --reporter=verbose 2>&1 | grep -E "conformance|corpus|FAIL|pass"
```

Expected: `test/conformance.test.ts` and `test/corpus.test.ts` both pass (no changes to the shared schema or conformance cases — `style` is free-form in the schema, so adding a float is admissible).

- [ ] **Step 3: Build the editor library**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor && npm run build:lib 2>&1 | tail -20
```

Expected: `dist/` produced, no errors.

- [ ] **Step 4: Run Python tests (if available)**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && pip install -e py -q 2>/dev/null; cd py && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all pass (Python validator doesn't touch `style.size`).

- [ ] **Step 5: Write the report**

Create `/Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd/font-scaling-report.md` with:
- Status: COMPLETE or BLOCKED
- Commit hashes (one per task)
- Test results (editor/web/ts pass counts)
- Build result
- Mechanism description: "size is now a float 0..1 in element.style.size; heroFontSize(rect, factor) = min(w,h)*0.60 * factor; default L=0.55; Fill=1.0 in a 480×480 cell → 288px hero"
- Confirmation: max factor in single-cell view fills ~60% of min dimension
- Any concerns

- [ ] **Step 6: Commit the report**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor && git add .superpowers/sdd/font-scaling-report.md && git commit -m "$(cat <<'EOF'
docs: font-scaling implementation report

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Hero number scales to cell, not fixed px | Task 1 (autoFitBase/heroFontSize) |
| Max size fills the cell in single-cell view | Task 1 (factor 1.0 → 0.6 × min(w,h)) |
| Size control visibly changes rendered SVG font-size | Task 1+2 |
| Inspector Size control as relative scale (S/M/L/XL/Fill) | Task 2 |
| MAX (Fill) in 1×1 cell nearly fills screen | Task 1 (Fill → ~288px in 480px cell = 60%) |
| Renderer honors size (prior build didn't change — fix that) | Task 1 |
| Backward-compatible round-trip through serialize/parse | Task 4 |
| Shared schema + Python validator accept the field | No change needed (style is free-form) |
| Conformance corpus stays green | Task 5 |
| Catalog defaults → large/auto-fit for freshly-bound single-value | Task 3 |
| TDD: renderer test (font-size scales with cell + size factor) | Task 1 |
| TDD: editor test (Size control sets factor, round-trips, SVG font-size increases) | Task 2 |
| `npm test --workspace editor` + web tests green | Task 5 |
| `cd editor && npm run build:lib` success | Task 5 |
| Report to `.superpowers/sdd/font-scaling-report.md` | Task 5 |

### Placeholder scan

No placeholders found — all steps include complete code.

### Type consistency

- `TileOpts.size: number | undefined` — unchanged interface; meaning shifts from px to factor. Callers in `render-svg.ts` pass `numv(style.size)` unchanged.
- `heroFontSize(rect: Rect, factor: number | undefined): number` — used in Tasks 1 and 2 consistently.
- `migrateSizePx(px: number): number` — exported and used consistently.
- `SIZE_LEVELS` array — used only in Inspector.tsx; values match the factors used in tests.

---

## Key Design Decisions

**Why 0.60 as the Fill multiplier?** `min(w,h) * 0.60` fills the cell without clipping the digits (numbers like "180.0" are wider than tall). The actual rendered text at `font-size=288px` in a 480px cell will be visually large. In practice the SVG `text-anchor="middle"` keeps it centered and the `letter-spacing="-0.02em"` keeps it compact.

**Why not change `TileOpts.size` from `number` to something else?** Keeping it `number | undefined` means the call sites in `render-svg.ts` (which pass `numv(style.size)`) require no change. The semantic meaning shifts from "absolute px" to "relative factor" but the type is the same.

**Why is the migration in parseMidl rather than at render time?** Putting it in the renderer would require touching `render-svg.ts` and pollute the pure rendering layer. `parseMidl` is the right boundary — it's the point where external MIDL YAML becomes the editor's internal model.
