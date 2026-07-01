# Data Browser + Font Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three editor UX fixes — always-populated SignalK data browser, browse-and-pick path binding in Inspector, and font-size control that round-trips through the model.

**Architecture:**
- `src/signalk-catalog.ts` — static catalog of ~50 curated SignalK paths + `mergeCatalogWithLive` merge helper.
- `DataTree.tsx` — consume the merged set so the browser is never empty.
- `PathPicker.tsx` — replace the `<datalist>` with a searchable combobox (controlled input + dropdown list); add "Browse data ▸" button that calls an `onBrowse` callback.
- `Inspector.tsx` — wire `onBrowse` from PathPicker; add "Size" `<select>` to the APPEARANCE section, reading `manifest.fonts` (fallback `[14,20,28,48]`), storing in `element.style.size` (numeric).
- `MidlEditor.tsx` — thread `onBrowseData` callback from Inspector → tab-switch to "data".

**Tech Stack:** TypeScript, React 18, Vitest/jsdom, `@testing-library/react`.

## Global Constraints

- Repo root: `/Users/borissorochkin/code/yey.boats/midl-editor`
- All implementation lives under `editor/` (workspace `@yey-boats/midl-editor`).
- Branch: `feat/midl-editor`
- `npm test --workspace editor` must stay green (currently 182 tests).
- `cd editor && npm run build:lib` must succeed.
- Do NOT rebuild the IIFE global (`build:global`). Do NOT push.
- License header on every new file: `// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0\n// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.`
- All test files must start with `// @vitest-environment jsdom` (React tests).
- `size` field serializes into `element.style.size` (a number) — the renderer reads `style.size` in `render-svg.ts` via `numv(style.size)` and passes it to every tile builder as `opts.size`.
- Co-author trailer on the commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `editor/src/signalk-catalog.ts` | **Create** | `SIGNALK_CATALOG` array + `mergeCatalogWithLive()` |
| `editor/src/visual/DataTree.tsx` | **Modify** | consume merged catalog instead of bare `knownPaths()` |
| `editor/src/visual/PathPicker.tsx` | **Modify** | combobox with dropdown + "Browse data ▸" button |
| `editor/src/visual/Inspector.tsx` | **Modify** | accept `onBrowseData?`, wire PathPicker, add Size select |
| `editor/src/MidlEditor.tsx` | **Modify** | thread `onBrowseData` callback from Inspector to tab-switch |
| `editor/src/signalk-catalog.test.ts` | **Create** | catalog + merge unit tests |
| `editor/src/visual/DataTree.test.tsx` | **Modify** | add catalog-with-zero-live-data tests |
| `editor/src/visual/Inspector.test.tsx` | **Modify** | add combobox, onBrowse, and Size select tests |

---

### Task 1: `signalk-catalog.ts` — static catalog + merge helper

**Files:**
- Create: `editor/src/signalk-catalog.ts`
- Create: `editor/src/signalk-catalog.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CatalogEntry {
    path: string;          // full SignalK path, vessels.self-relative (no prefix)
    label: string;         // human-readable short name
    group: string;         // first segment of the path (navigation, environment, …)
    unit?: string;         // display unit (not SI source unit)
    live?: boolean;        // true when the live provider knows this path
    value?: unknown;       // live value if live === true
    sourceUnit?: string;   // live source unit if live === true
    injected?: boolean;    // true when value was set by inject()
  }

  export const SIGNALK_CATALOG: CatalogEntry[];

  export function mergeCatalogWithLive(
    catalog: CatalogEntry[],
    liveEntries: import("./adapters").PathInfo[],
  ): CatalogEntry[];
  ```

- [ ] **Step 1: Write the failing tests**

Create `editor/src/signalk-catalog.test.ts`:

```ts
// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect } from "vitest";
import { SIGNALK_CATALOG, mergeCatalogWithLive } from "./signalk-catalog";
import type { PathInfo } from "./adapters";

test("SIGNALK_CATALOG has at least 40 entries", () => {
  expect(SIGNALK_CATALOG.length).toBeGreaterThanOrEqual(40);
});

test("all catalog entries have path, label, group, and group equals path.split('.')[0]", () => {
  for (const e of SIGNALK_CATALOG) {
    expect(typeof e.path).toBe("string");
    expect(e.path.length).toBeGreaterThan(0);
    expect(typeof e.label).toBe("string");
    expect(e.label.length).toBeGreaterThan(0);
    expect(typeof e.group).toBe("string");
    expect(e.group).toBe(e.path.split(".")[0]);
  }
});

test("catalog contains navigation group entries (speedOverGround, courseOverGroundTrue, headingTrue)", () => {
  const paths = new Set(SIGNALK_CATALOG.map((e) => e.path));
  expect(paths.has("navigation.speedOverGround")).toBe(true);
  expect(paths.has("navigation.courseOverGroundTrue")).toBe(true);
  expect(paths.has("navigation.headingTrue")).toBe(true);
});

test("catalog contains environment group entries", () => {
  const paths = new Set(SIGNALK_CATALOG.map((e) => e.path));
  expect(paths.has("environment.wind.speedApparent")).toBe(true);
  expect(paths.has("environment.depth.belowTransducer")).toBe(true);
});

test("catalog contains electrical, propulsion, tanks, steering, performance groups", () => {
  const groups = new Set(SIGNALK_CATALOG.map((e) => e.group));
  expect(groups.has("electrical")).toBe(true);
  expect(groups.has("propulsion")).toBe(true);
  expect(groups.has("tanks")).toBe(true);
  expect(groups.has("steering")).toBe(true);
  expect(groups.has("performance")).toBe(true);
});

test("mergeCatalogWithLive with no live data returns catalog entries all with live:false/undefined", () => {
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, []);
  // All entries present (catalog unchanged)
  expect(merged.length).toBeGreaterThanOrEqual(SIGNALK_CATALOG.length);
  // No live flags set
  const liveEntries = merged.filter((e) => e.live === true);
  expect(liveEntries.length).toBe(0);
});

test("mergeCatalogWithLive overlays live value onto matching catalog entry", () => {
  const live: PathInfo[] = [
    { path: "navigation.speedOverGround", value: 3.5, sourceUnit: "m/s", updatedAt: Date.now() },
  ];
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, live);
  const entry = merged.find((e) => e.path === "navigation.speedOverGround");
  expect(entry).toBeDefined();
  expect(entry!.live).toBe(true);
  expect(entry!.value).toBe(3.5);
  expect(entry!.sourceUnit).toBe("m/s");
});

test("mergeCatalogWithLive marks injected=true from live PathInfo.injected", () => {
  const live: PathInfo[] = [
    { path: "navigation.headingTrue", value: 1.57, updatedAt: Date.now(), injected: true },
  ];
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, live);
  const entry = merged.find((e) => e.path === "navigation.headingTrue");
  expect(entry?.injected).toBe(true);
});

test("mergeCatalogWithLive appends live-only paths not in catalog", () => {
  const live: PathInfo[] = [
    { path: "custom.exotic.path", value: 99, updatedAt: Date.now() },
  ];
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, live);
  const entry = merged.find((e) => e.path === "custom.exotic.path");
  expect(entry).toBeDefined();
  expect(entry!.live).toBe(true);
  // group is first segment
  expect(entry!.group).toBe("custom");
});

test("mergeCatalogWithLive catalog entries without live data still appear", () => {
  // Verify catalog paths are present even when zero live data
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, []);
  const paths = new Set(merged.map((e) => e.path));
  expect(paths.has("navigation.speedOverGround")).toBe(true);
  expect(paths.has("environment.wind.speedApparent")).toBe(true);
  expect(paths.has("electrical.batteries.0.voltage")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|signalk-catalog"
```

Expected: FAIL with "Cannot find module './signalk-catalog'" or similar.

- [ ] **Step 3: Implement `signalk-catalog.ts`**

Create `editor/src/signalk-catalog.ts`:

```ts
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import type { PathInfo } from "./adapters";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  path: string;
  label: string;
  group: string;
  unit?: string;
  live?: boolean;
  value?: unknown;
  sourceUnit?: string;
  injected?: boolean;
}

// ── Catalog ────────────────────────────────────────────────────────────────────

export const SIGNALK_CATALOG: CatalogEntry[] = [
  // navigation
  { path: "navigation.speedOverGround", label: "Speed Over Ground", group: "navigation", unit: "kn" },
  { path: "navigation.speedThroughWater", label: "Speed Through Water", group: "navigation", unit: "kn" },
  { path: "navigation.courseOverGroundTrue", label: "Course Over Ground (True)", group: "navigation", unit: "deg" },
  { path: "navigation.headingTrue", label: "Heading True", group: "navigation", unit: "deg" },
  { path: "navigation.headingMagnetic", label: "Heading Magnetic", group: "navigation", unit: "deg" },
  { path: "navigation.position", label: "Position (lat/lon)", group: "navigation" },
  { path: "navigation.attitude.roll", label: "Roll", group: "navigation", unit: "deg" },
  { path: "navigation.attitude.pitch", label: "Pitch", group: "navigation", unit: "deg" },
  { path: "navigation.courseGreatCircle.nextPoint.distance", label: "Distance to Waypoint", group: "navigation", unit: "nm" },
  { path: "navigation.courseGreatCircle.nextPoint.bearingTrue", label: "Bearing to Waypoint (True)", group: "navigation", unit: "deg" },
  { path: "navigation.courseGreatCircle.crossTrackError", label: "Cross-Track Error (GC)", group: "navigation", unit: "m" },
  { path: "navigation.courseRhumbline.nextPoint.distance", label: "Distance to Waypoint (RL)", group: "navigation", unit: "nm" },
  { path: "navigation.courseRhumbline.nextPoint.bearingTrue", label: "Bearing to Waypoint (RL)", group: "navigation", unit: "deg" },
  { path: "navigation.courseRhumbline.crossTrackError", label: "Cross-Track Error (RL)", group: "navigation", unit: "m" },
  { path: "navigation.state", label: "Vessel State", group: "navigation" },
  // environment
  { path: "environment.wind.speedApparent", label: "Apparent Wind Speed", group: "environment", unit: "kn" },
  { path: "environment.wind.angleApparent", label: "Apparent Wind Angle", group: "environment", unit: "deg" },
  { path: "environment.wind.speedTrue", label: "True Wind Speed", group: "environment", unit: "kn" },
  { path: "environment.wind.angleTrueWater", label: "True Wind Angle (Water)", group: "environment", unit: "deg" },
  { path: "environment.wind.directionTrue", label: "True Wind Direction", group: "environment", unit: "deg" },
  { path: "environment.depth.belowTransducer", label: "Depth Below Transducer", group: "environment", unit: "m" },
  { path: "environment.depth.belowKeel", label: "Depth Below Keel", group: "environment", unit: "m" },
  { path: "environment.water.temperature", label: "Water Temperature", group: "environment", unit: "C" },
  { path: "environment.outside.temperature", label: "Outside Temperature", group: "environment", unit: "C" },
  { path: "environment.outside.pressure", label: "Barometric Pressure", group: "environment", unit: "hPa" },
  { path: "environment.outside.humidity", label: "Humidity", group: "environment", unit: "%" },
  // electrical
  { path: "electrical.batteries.0.voltage", label: "Battery Voltage", group: "electrical", unit: "V" },
  { path: "electrical.batteries.0.current", label: "Battery Current", group: "electrical", unit: "A" },
  { path: "electrical.batteries.0.capacity.stateOfCharge", label: "State of Charge", group: "electrical", unit: "%" },
  { path: "electrical.batteries.0.temperature", label: "Battery Temperature", group: "electrical", unit: "C" },
  { path: "electrical.solar.0.panelPower", label: "Solar Panel Power", group: "electrical", unit: "W" },
  // propulsion
  { path: "propulsion.main.revolutions", label: "Engine RPM", group: "propulsion", unit: "Hz" },
  { path: "propulsion.main.temperature", label: "Engine Temperature", group: "propulsion", unit: "C" },
  { path: "propulsion.main.oilPressure", label: "Oil Pressure", group: "propulsion", unit: "Pa" },
  { path: "propulsion.main.fuel.rate", label: "Fuel Rate", group: "propulsion" },
  // tanks
  { path: "tanks.fuel.0.currentLevel", label: "Fuel Level", group: "tanks", unit: "%" },
  { path: "tanks.freshWater.0.currentLevel", label: "Fresh Water Level", group: "tanks", unit: "%" },
  { path: "tanks.blackWater.0.currentLevel", label: "Black Water Level", group: "tanks", unit: "%" },
  // steering
  { path: "steering.rudderAngle", label: "Rudder Angle", group: "steering", unit: "deg" },
  { path: "steering.autopilot.state", label: "Autopilot State", group: "steering" },
  { path: "steering.autopilot.target.headingTrue", label: "Autopilot Target Heading", group: "steering", unit: "deg" },
  // performance
  { path: "performance.velocityMadeGood", label: "VMG", group: "performance", unit: "kn" },
  { path: "performance.polarSpeed", label: "Polar Speed", group: "performance", unit: "kn" },
  { path: "performance.targetAngle", label: "Target Angle", group: "performance", unit: "deg" },
];

// ── Merge helper ───────────────────────────────────────────────────────────────

/**
 * Merge the static catalog with live path data from the provider.
 * - Catalog entries always present.
 * - Live data overlaid onto matching catalog entries (live:true, value, sourceUnit, injected).
 * - Live-only paths (not in catalog) appended at the end.
 */
export function mergeCatalogWithLive(
  catalog: CatalogEntry[],
  liveEntries: PathInfo[],
): CatalogEntry[] {
  // Build a lookup of live entries by path
  const liveByPath = new Map<string, PathInfo>();
  for (const e of liveEntries) {
    liveByPath.set(e.path, e);
  }

  // Start with catalog entries, overlay live data where available
  const result: CatalogEntry[] = catalog.map((entry) => {
    const live = liveByPath.get(entry.path);
    if (live) {
      return {
        ...entry,
        live: true,
        value: live.value,
        sourceUnit: live.sourceUnit,
        injected: live.injected,
      };
    }
    return { ...entry };
  });

  // Append live-only paths not already in the catalog
  const catalogPaths = new Set(catalog.map((e) => e.path));
  for (const live of liveEntries) {
    if (!catalogPaths.has(live.path)) {
      result.push({
        path: live.path,
        label: live.path,
        group: live.path.split(".")[0] ?? live.path,
        live: true,
        value: live.value,
        sourceUnit: live.sourceUnit,
        injected: live.injected,
      });
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests — expect green**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "signalk-catalog|Tests"
```

Expected: All `signalk-catalog.test.ts` tests PASS. Total count increases from 182 to 191.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/signalk-catalog.ts src/signalk-catalog.test.ts
git -C editor commit -m "$(cat <<'EOF'
feat: add SIGNALK_CATALOG static path catalog with mergeCatalogWithLive helper

~50 curated SignalK paths grouped by segment; merge overlays live values
and appends live-only paths, so the data browser is never empty.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: DataTree — render merged catalog (Fix 1)

**Files:**
- Modify: `editor/src/visual/DataTree.tsx`
- Modify: `editor/src/visual/DataTree.test.tsx`

**Interfaces:**
- Consumes: `mergeCatalogWithLive`, `CatalogEntry` from `../signalk-catalog`
- Produces: unchanged `DataTreeProps` — no interface change, behavior change only

The DataTree must:
1. Import and use `mergeCatalogWithLive(SIGNALK_CATALOG, provider.knownPaths())` to build the entries to render.
2. Group by `entry.group` (not re-derived — already set).
3. Show a green dot + value where `entry.live === true`; grey dot where not live.
4. Show a purple dot where `entry.injected === true` (matches existing behavior).
5. Show no dot / grey dot for catalog-only (non-live) entries.
6. `data-live` attribute on live leaves, so tests can assert.

- [ ] **Step 1: Write failing tests (add to `DataTree.test.tsx`)**

Append these tests to the existing `editor/src/visual/DataTree.test.tsx`:

```ts
// ── Catalog-integration tests (Fix 1) ────────────────────────────────────────

import { SIGNALK_CATALOG } from "../signalk-catalog";

test("DataTree renders catalog entries even with zero live paths", () => {
  // Provider with NO live data
  const provider = makeProviderStub([]);
  const { getByText } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // Catalog groups should be visible
  expect(getByText(/navigation/i)).toBeTruthy();
  expect(getByText(/environment/i)).toBeTruthy();
  expect(getByText(/electrical/i)).toBeTruthy();
});

test("DataTree renders catalog leaf for navigation.speedOverGround even with zero live data", () => {
  const provider = makeProviderStub([]);
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // The leaf for SOG must be present from the catalog
  expect(getByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
});

test("clicking a catalog leaf with no live data calls onBindPath", () => {
  const provider = makeProviderStub([]);
  const onBindPath = vi.fn();
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId="some-element" onBindPath={onBindPath} />,
  );
  fireEvent.click(getByTestId("data-leaf-navigation-speedOverGround"));
  expect(onBindPath).toHaveBeenCalledWith("navigation.speedOverGround");
});

test("DataTree overlays live value onto catalog entry when provider streams it", async () => {
  const provider = makeProviderStub([
    { path: "navigation.speedOverGround", value: 5.5, sourceUnit: "m/s", updatedAt: Date.now() },
  ]);
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  const leaf = getByTestId("data-leaf-navigation-speedOverGround");
  // The leaf should show the live value
  expect(leaf.textContent).toContain("5.5");
  // The leaf should have data-live attribute
  expect(leaf.getAttribute("data-live")).toBe("true");
});

test("DataTree appends live-only path not in catalog after merging", async () => {
  const provider = makeProviderStub([
    { path: "custom.exotic.sensor", value: 42, updatedAt: Date.now() },
  ]);
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // Must appear even though "custom.exotic.sensor" is not in SIGNALK_CATALOG
  expect(getByTestId("data-leaf-custom-exotic-sensor")).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "DataTree|FAIL"
```

Expected: New catalog tests FAIL (leaf not found, etc.).

- [ ] **Step 3: Modify `DataTree.tsx`**

Replace the entire `DataTree.tsx` content. Key changes:
1. Import `SIGNALK_CATALOG`, `mergeCatalogWithLive`, `CatalogEntry`.
2. Replace `PathInfo[]` state with merged entries from catalog.
3. Render `data-live="true"` on live leaves and `data-injected="true"` on injected leaves (keep existing injected behavior).
4. Dot color: green for live, purple for injected, grey/dim for catalog-only.

```ts
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React, { useState, useEffect, useCallback } from "react";
import type { LivePathSource } from "../adapters";
import { SIGNALK_CATALOG, mergeCatalogWithLive } from "../signalk-catalog";
import type { CatalogEntry } from "../signalk-catalog";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataProvider = LivePathSource;

export interface DataTreeProps {
  provider: DataProvider;
  selectedElementId: string | null;
  onBindPath: (path: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function leafTestId(path: string): string {
  return `data-leaf-${path.replace(/\./g, "-")}`;
}

function groupEntries(entries: CatalogEntry[]): Map<string, CatalogEntry[]> {
  const map = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    if (!map.has(e.group)) map.set(e.group, []);
    map.get(e.group)!.push(e);
  }
  return map;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    const abs = Math.abs(value);
    if (abs === 0) return "0";
    if (abs >= 1000) return value.toFixed(0);
    if (abs >= 10) return value.toFixed(1);
    return value.toFixed(3);
  }
  if (typeof value === "object") return "[obj]";
  return String(value);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DataTree({ provider, selectedElementId, onBindPath }: DataTreeProps): React.JSX.Element {
  const [entries, setEntries] = useState<CatalogEntry[]>(() =>
    mergeCatalogWithLive(SIGNALK_CATALOG, provider.knownPaths()),
  );
  const [search, setSearch] = useState("");
  const [injectOpen, setInjectOpen] = useState(false);
  const [injectPath, setInjectPath] = useState("");
  const [injectValue, setInjectValue] = useState("");
  const [injectUnit, setInjectUnit] = useState("");

  useEffect(() => {
    const unsub = provider.onChange(() => {
      setEntries(mergeCatalogWithLive(SIGNALK_CATALOG, provider.knownPaths()));
    });
    return unsub;
  }, [provider]);

  const filtered = search
    ? entries.filter((e) => e.path.includes(search) || e.label.toLowerCase().includes(search.toLowerCase()))
    : entries;

  const grouped = groupEntries(filtered);

  const handleInjectSubmit = useCallback(() => {
    if (!injectPath) return;
    const unit = injectUnit || undefined;
    provider.inject(injectPath, injectValue, unit);
    setInjectPath("");
    setInjectValue("");
    setInjectUnit("");
    setInjectOpen(false);
  }, [provider, injectPath, injectValue, injectUnit]);

  return (
    <div data-testid="data-tree" data-component="data-tree">
      {/* Search */}
      <div style={{ padding: "8px 8px 6px" }}>
        <input
          data-testid="data-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter paths…"
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      </div>

      {/* No-selection hint */}
      {!selectedElementId && (
        <div style={{ padding: "4px 10px", fontSize: "11px", color: "#5b7286" }}>
          Select a tile first to bind a path.
        </div>
      )}

      {/* Path tree */}
      <div data-section="path-tree">
        {[...grouped.entries()].map(([group, groupEntries]) => (
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
              <div
                key={e.path}
                data-testid={leafTestId(e.path)}
                data-injected={e.injected ? "true" : undefined}
                data-live={e.live ? "true" : undefined}
                onClick={() => onBindPath(e.path)}
                style={{
                  padding: "3px 8px 3px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {/* Dot: purple=injected, green=live, grey=catalog-only */}
                <span
                  data-section="dot"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: e.injected ? "#c8a0ff" : e.live ? "#4ac36e" : "#3a4f62",
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                {/* Short path (strip the group prefix) */}
                <span style={{ fontFamily: "monospace", fontSize: "10.5px", flex: 1 }}>
                  {e.path.replace(`${e.group}.`, "")}
                </span>
                {/* Live value (only when live) */}
                {e.live && (
                  <span style={{ fontFamily: "monospace", fontSize: "10px", opacity: 0.8 }}>
                    {formatValue(e.value)}
                    {e.sourceUnit ? ` ${e.sourceUnit}` : ""}
                  </span>
                )}
                {e.injected && (
                  <span style={{ fontSize: "9px", opacity: 0.7 }}>inj</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Inject form toggle */}
      <div style={{ padding: "8px 8px 0" }}>
        <button
          data-testid="data-inject-toggle"
          onClick={() => setInjectOpen((v) => !v)}
          style={{ fontSize: "11px" }}
        >
          {injectOpen ? "Cancel" : "Inject a value…"}
        </button>
      </div>

      {/* Inject form */}
      {injectOpen && (
        <div data-section="inject-form" style={{ padding: "6px 8px 8px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <input
            data-testid="data-inject-path"
            type="text"
            value={injectPath}
            onChange={(e) => setInjectPath(e.target.value)}
            placeholder="path.to.inject"
            style={{ fontSize: "11px", fontFamily: "monospace" }}
          />
          <input
            data-testid="data-inject-value"
            type="text"
            value={injectValue}
            onChange={(e) => setInjectValue(e.target.value)}
            placeholder="value"
            style={{ fontSize: "11px" }}
          />
          <input
            data-testid="data-inject-unit"
            type="text"
            value={injectUnit}
            onChange={(e) => setInjectUnit(e.target.value)}
            placeholder="unit (optional)"
            style={{ fontSize: "11px" }}
          />
          <button
            data-testid="data-inject-submit"
            onClick={handleInjectSubmit}
            style={{ fontSize: "11px" }}
          >
            Inject
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Audit existing DataTree tests for compatibility**

The existing tests pass a `makeProviderStub` with specific paths and check `data-testid` leaves by those paths. Since the catalog also contains `navigation.speedOverGround`, those leaves will still render, so existing tests should still pass.

The test "tree re-renders when provider.onChange fires (new path appears)" uses path `navigation.speedOverGround` which is already in the catalog — this means the leaf renders immediately from catalog (not just after onChange). Update that test:

In `DataTree.test.tsx`, find the test `"tree re-renders when provider.onChange fires (new path appears)"` and update it to use a path NOT in the catalog:

```ts
test("tree re-renders when provider.onChange fires (new live-only path appears)", async () => {
  const provider = makeProviderStub([]);

  const { queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  // This custom path is NOT in the catalog — so no leaf yet
  expect(queryByTestId("data-leaf-custom-live-only-sensor")).toBeNull();

  // Simulate new delta arriving
  await act(async () => {
    provider.pushPaths([
      { path: "custom.live.only.sensor", value: 5.0, updatedAt: Date.now() },
    ]);
  });

  // Leaf should now be rendered (appended as live-only)
  expect(queryByTestId("data-leaf-custom-live-only-sensor")).toBeTruthy();
});
```

Also update `"search clears filter and shows all leaves again after clearing"` — it starts with zero live paths now but the catalog provides SOG and wind, so those leaves ARE visible from the start. Change the test to use catalog paths directly:

```ts
test("search clears filter and shows all leaves again after clearing", () => {
  const provider = makeProviderStub([]);
  // SOG and wind are in the catalog — visible without live data

  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  const search = getByTestId("data-search");
  fireEvent.change(search, { target: { value: "heading" } });

  // SOG should be filtered out — "heading" not in its path
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();
  // headingTrue should be visible
  expect(queryByTestId("data-leaf-navigation-headingTrue")).toBeTruthy();

  // Clear the filter
  fireEvent.change(search, { target: { value: "" } });

  // Both now visible
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
  expect(queryByTestId("data-leaf-navigation-headingTrue")).toBeTruthy();
});
```

- [ ] **Step 5: Run all tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -15
```

Expected: All tests pass. Total ≥ 196.

- [ ] **Step 6: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/visual/DataTree.tsx src/visual/DataTree.test.tsx
git -C editor commit -m "$(cat <<'EOF'
feat: DataTree renders catalog entries always (Fix 1)

Merges SIGNALK_CATALOG with live provider paths so the data browser
is populated even with zero live data. Live overlay shows green dot +
value; catalog-only entries show grey dot.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: PathPicker combobox + "Browse data" (Fix 2a)

**Files:**
- Modify: `editor/src/visual/PathPicker.tsx`

**Interfaces:**
- Consumes: `SIGNALK_CATALOG`, `mergeCatalogWithLive`, `CatalogEntry` from `../signalk-catalog`
- Consumes: `DataProvider` from `@yey-boats/midl-web` (for `knownPaths()` via duck-typing as `LivePathSource`)
- Produces:
  ```ts
  export interface PathPickerProps {
    value: string;
    manifest: Manifest;
    provider: DataProvider;
    onChange: (path: string) => void;
    onBrowse?: () => void;  // NEW: called when "Browse data ▸" is clicked
  }
  ```

The combobox:
- Controlled `<input data-testid="path-picker">` (keeps existing testid).
- A dropdown `<ul data-testid="path-picker-dropdown">` below the input, hidden when not focused.
- Dropdown shows catalog entries + live entries (via `mergeCatalogWithLive`), filtered by the current input value.
- Clicking an item selects it and calls `onChange`.
- "Browse data ▸" button below the input calls `onBrowse?.()`.
- Custom text input still works (user types freely, `onChange` fires on each keystroke as before).

> Note: Keep `data-testid="path-picker"` on the `<input>` so the 21 existing Inspector tests that fire `fireEvent.change(picker, ...)` continue to work unchanged.

- [ ] **Step 1: Write tests (new test file)**

Create `editor/src/visual/PathPicker.test.tsx`:

```ts
// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import { MockDataProvider } from "@yey-boats/midl-web";
import { PathPicker } from "./PathPicker";

afterEach(() => cleanup());

const MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "test",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3 }],
  elements: [{ type: "single-value", bindings: ["value"] }],
  sources: ["navigation.speedOverGround"],
};

test("PathPicker renders the controlled input with data-testid path-picker", () => {
  const { getByTestId } = render(
    <PathPicker value="navigation.speedOverGround" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} />,
  );
  const input = getByTestId("path-picker") as HTMLInputElement;
  expect(input.value).toBe("navigation.speedOverGround");
});

test("typing in PathPicker calls onChange with the typed value", () => {
  const onChange = vi.fn();
  const { getByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={onChange} />,
  );
  fireEvent.change(getByTestId("path-picker"), { target: { value: "navigation.heading" } });
  expect(onChange).toHaveBeenCalledWith("navigation.heading");
});

test("PathPicker shows dropdown with catalog entries when input is focused", async () => {
  const { getByTestId, queryByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} />,
  );
  const input = getByTestId("path-picker");
  await act(async () => { fireEvent.focus(input); });
  // Dropdown should be visible
  expect(queryByTestId("path-picker-dropdown")).toBeTruthy();
});

test("PathPicker dropdown lists catalog paths (speedOverGround is present)", async () => {
  const { getByTestId, queryAllByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} />,
  );
  await act(async () => { fireEvent.focus(getByTestId("path-picker")); });
  const items = queryAllByTestId(/path-picker-option-/);
  const paths = items.map((el) => el.getAttribute("data-path"));
  expect(paths).toContain("navigation.speedOverGround");
});

test("typing filters dropdown to matching paths only", async () => {
  const onChange = vi.fn();
  const { getByTestId, queryAllByTestId } = render(
    <PathPicker value="heading" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={onChange} />,
  );
  await act(async () => { fireEvent.focus(getByTestId("path-picker")); });
  const items = queryAllByTestId(/path-picker-option-/);
  const paths = items.map((el) => el.getAttribute("data-path") ?? "");
  // All displayed options must contain "heading"
  expect(paths.every((p) => p.includes("heading"))).toBe(true);
  // speedOverGround does NOT contain "heading"
  expect(paths).not.toContain("navigation.speedOverGround");
});

test("clicking a dropdown option calls onChange with the full path", async () => {
  const onChange = vi.fn();
  const { getByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={onChange} />,
  );
  await act(async () => { fireEvent.focus(getByTestId("path-picker")); });
  // Click the first option for SOG
  const sogOption = getByTestId("path-picker-option-navigation-speedOverGround");
  await act(async () => { fireEvent.mouseDown(sogOption); });
  expect(onChange).toHaveBeenCalledWith("navigation.speedOverGround");
});

test("Browse data button calls onBrowse when clicked", async () => {
  const onBrowse = vi.fn();
  const { getByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} onBrowse={onBrowse} />,
  );
  fireEvent.click(getByTestId("path-picker-browse"));
  expect(onBrowse).toHaveBeenCalledOnce();
});

test("Browse data button is not rendered when onBrowse is not provided", () => {
  const { queryByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} />,
  );
  expect(queryByTestId("path-picker-browse")).toBeNull();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "PathPicker|FAIL"
```

Expected: All 8 new PathPicker tests FAIL (dropdown not implemented).

- [ ] **Step 3: Implement the combobox in `PathPicker.tsx`**

Replace the entire `PathPicker.tsx`:

```ts
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React, { useState, useCallback, useRef } from "react";
import type { Manifest } from "@yey-boats/midl";
import type { DataProvider } from "@yey-boats/midl-web";
import type { LivePathSource } from "../adapters";
import { SIGNALK_CATALOG, mergeCatalogWithLive } from "../signalk-catalog";

export interface PathPickerProps {
  value: string;
  manifest: Manifest;
  provider: DataProvider;
  onChange: (path: string) => void;
  onBrowse?: () => void;
}

function optionTestId(path: string): string {
  return `path-picker-option-${path.replace(/\./g, "-")}`;
}

export function PathPicker({ value, manifest: _manifest, provider, onChange, onBrowse }: PathPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build merged catalog entries using the live provider
  const liveSource = provider as unknown as LivePathSource;
  const livePaths = typeof liveSource.knownPaths === "function" ? liveSource.knownPaths() : [];
  const allEntries = mergeCatalogWithLive(SIGNALK_CATALOG, livePaths);

  // Filter by current input value
  const query = value.toLowerCase();
  const filtered = query
    ? allEntries.filter((e) => e.path.toLowerCase().includes(query) || e.label.toLowerCase().includes(query))
    : allEntries;

  const handleSelect = useCallback((path: string) => {
    onChange(path);
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        data-testid="path-picker"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay close so mouseDown on option fires first
          setTimeout(() => setOpen(false), 150);
        }}
        placeholder="SignalK path"
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      {open && (
        <ul
          data-testid="path-picker-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "var(--panel, #0e1b27)",
            border: "1px solid var(--line, #1d2b3a)",
            borderRadius: "4px",
            margin: 0,
            padding: 0,
            listStyle: "none",
            maxHeight: "240px",
            overflowY: "auto",
            fontSize: "11px",
            fontFamily: "monospace",
          }}
        >
          {filtered.slice(0, 80).map((e) => (
            <li
              key={e.path}
              data-testid={optionTestId(e.path)}
              data-path={e.path}
              onMouseDown={() => handleSelect(e.path)}
              style={{
                padding: "4px 8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: "50%", flexShrink: 0, display: "inline-block",
                background: e.injected ? "#c8a0ff" : e.live ? "#4ac36e" : "#3a4f62",
              }} />
              <span style={{ flex: 1 }}>{e.path}</span>
              {e.unit && <span style={{ opacity: 0.55, fontSize: "9px" }}>{e.unit}</span>}
            </li>
          ))}
        </ul>
      )}
      {onBrowse && (
        <button
          data-testid="path-picker-browse"
          onClick={onBrowse}
          style={{ fontSize: "10px", marginTop: "3px", opacity: 0.7 }}
        >
          Browse data ▸
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -15
```

Expected: All tests pass. Total ≥ 204.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/visual/PathPicker.tsx src/visual/PathPicker.test.tsx
git -C editor commit -m "$(cat <<'EOF'
feat: PathPicker combobox with searchable catalog dropdown (Fix 2a)

Replaces datalist with a controlled combobox: typing filters catalog +
live paths, clicking a dropdown item selects the binding. "Browse data ▸"
button fires onBrowse callback for tab-switch integration.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Inspector — wire onBrowse + add Size select (Fixes 2b + 3)

**Files:**
- Modify: `editor/src/visual/Inspector.tsx`
- Modify: `editor/src/visual/Inspector.test.tsx`

**Interfaces:**
- Consumes: `PathPicker` with new `onBrowse` prop
- Produces (new prop on InspectorProps):
  ```ts
  export interface InspectorProps {
    model: EditorModel;
    selectedCell: number | null;
    manifest: Manifest;
    provider: DataProvider;
    onChange: (next: EditorModel) => void;
    onBrowseData?: () => void;  // NEW: fires when PathPicker "Browse data ▸" is clicked
  }
  ```
- Size serializes to `element.style.size` (number, e.g. 14 | 20 | 28 | 48)

The renderer reads `style.size` from `render-svg.ts`:
```ts
const opts = { size: numv(style.size), ... };  // style is el.style ?? {}
```
Setting `element.style.size = 28` makes `opts.size = 28`, which tiles use as the hero font-size.

- [ ] **Step 1: Write failing tests (append to `Inspector.test.tsx`)**

```ts
// ── Fix 2b: Browse data callback wiring ───────────────────────────────────────

test("clicking 'Browse data' in PathPicker calls onBrowseData on Inspector", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});
  const onChange = vi.fn();
  const onBrowseData = vi.fn();

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={onChange}
      onBrowseData={onBrowseData}
    />,
  );

  fireEvent.click(getByTestId("path-picker-browse"));
  expect(onBrowseData).toHaveBeenCalledOnce();
});

test("Inspector renders PathPicker without Browse button when onBrowseData is not provided", () => {
  const model = makeGridModel();
  const provider = new MockDataProvider({});

  const { queryByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={MANIFEST}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  // No browse button when onBrowseData is absent
  expect(queryByTestId("path-picker-browse")).toBeNull();
});

// ── Fix 3: Size select ────────────────────────────────────────────────────────

test("Inspector renders a size-select in the APPEARANCE section", () => {
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

  expect(getByTestId("size-select")).toBeTruthy();
});

test("size-select options include manifest.fonts values when present", () => {
  const manifestWithFonts: typeof MANIFEST = {
    ...MANIFEST,
    fonts: [14, 20, 28, 48],
  };
  const model = makeGridModel();
  const provider = new MockDataProvider({});

  const { getByTestId } = render(
    <Inspector
      model={model}
      selectedCell={0}
      manifest={manifestWithFonts}
      provider={provider}
      onChange={vi.fn()}
    />,
  );

  const select = getByTestId("size-select") as HTMLSelectElement;
  const values = Array.from(select.options).map((o) => Number(o.value));
  expect(values).toContain(14);
  expect(values).toContain(20);
  expect(values).toContain(28);
  expect(values).toContain(48);
});

test("size-select defaults to fallback [14,20,28,48] when manifest has no fonts", () => {
  const model = makeGridModel(); // MANIFEST has no fonts field
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

  const select = getByTestId("size-select") as HTMLSelectElement;
  const values = Array.from(select.options).map((o) => Number(o.value));
  expect(values).toEqual([14, 20, 28, 48]);
});

test("changing size-select updates element.style.size with a number", () => {
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

  fireEvent.change(getByTestId("size-select"), { target: { value: "28" } });

  expect(onChange).toHaveBeenCalledOnce();
  expect(captured.elements["sog"]?.style?.size).toBe(28);
});

test("element.style.size round-trips through serializeMidl → parseMidl", () => {
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

  fireEvent.change(getByTestId("size-select"), { target: { value: "48" } });

  const yaml = serializeMidl(captured, "yaml");
  const reparsed = parseMidl(yaml);
  expect(reparsed.elements["sog"]?.style?.size).toBe(48);
});

test("size-select shows element's current style.size as selected value", () => {
  const model = makeGridModel({
    elements: {
      sog: {
        id: "sog",
        type: "single-value",
        name: "SOG",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
        format: { unit: "kn", decimals: 1 },
        style: { size: 28 },
      },
    },
  });
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

  const select = getByTestId("size-select") as HTMLSelectElement;
  expect(Number(select.value)).toBe(28);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "Inspector|FAIL"
```

Expected: 8 new Inspector tests FAIL.

- [ ] **Step 3: Modify `Inspector.tsx`**

Make these targeted changes to `Inspector.tsx`:

**a) Add `onBrowseData?` to `InspectorProps`:**
```ts
export interface InspectorProps {
  model: EditorModel;
  selectedCell: number | null;
  manifest: Manifest;
  provider: DataProvider;
  onChange: (next: EditorModel) => void;
  onBrowseData?: () => void;  // NEW
}
```

**b) Destructure `onBrowseData` in the function signature:**
```ts
export function Inspector({ model, selectedCell, manifest, provider, onChange, onBrowseData }: InspectorProps): React.JSX.Element {
```

**c) Add `handleSizeChange` before the grid controls:**
```ts
const FONT_SIZE_FALLBACK = [14, 20, 28, 48];
const fontSizes: number[] = manifest.fonts && manifest.fonts.length > 0 ? manifest.fonts : FONT_SIZE_FALLBACK;

function handleSizeChange(size: number) {
  if (!selectedElement) return;
  updateElement({ ...selectedElement, style: { ...selectedElement.style, size } });
}

const currentSize: number | "" = typeof selectedElement?.style?.size === "number"
  ? selectedElement.style.size as number
  : "";
```

**d) Pass `onBrowse` to `PathPicker`:**
```tsx
<PathPicker
  value={valuePath}
  manifest={manifest}
  provider={provider}
  onChange={handlePathChange}
  onBrowse={onBrowseData}
/>
```

**e) Add Size select to the APPEARANCE section (after the Scale select):**
```tsx
<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
  <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Size</span>
  <select
    data-testid="size-select"
    value={String(currentSize)}
    onChange={(e) => handleSizeChange(Number(e.target.value))}
    style={{ flex: 1 }}
  >
    <option value="">—</option>
    {fontSizes.map((s) => (<option key={s} value={String(s)}>{s}px</option>))}
  </select>
</div>
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -15
```

Expected: All tests pass. Total ≥ 213.

- [ ] **Step 5: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/visual/Inspector.tsx src/visual/Inspector.test.tsx
git -C editor commit -m "$(cat <<'EOF'
feat: Inspector wires onBrowseData + adds Size select (Fixes 2b + 3)

PathPicker Browse button fires onBrowseData callback for tab-switch.
Size select reads manifest.fonts (fallback [14,20,28,48]) and stores
the chosen value as element.style.size (number), which the SVG renderer
picks up via style.size → opts.size → hero font-size.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: MidlEditor — thread onBrowseData → tab-switch (Fix 2c)

**Files:**
- Modify: `editor/src/MidlEditor.tsx`
- Modify: `editor/src/MidlEditor.data-tab.test.tsx`

**Interfaces:**
- Consumes: `Inspector` with `onBrowseData` prop
- Produces: no new exported types

Wire `onBrowseData` from Inspector to a handler in MidlEditor that sets `setLeftTab("data")`.

- [ ] **Step 1: Write failing tests (append to `MidlEditor.data-tab.test.tsx`)**

```ts
test("clicking 'Browse data' in Inspector's PathPicker switches left rail to Data tab", async () => {
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

  // Wait for editor to load
  await waitFor(() => {
    expect(getByTestId("tab-elements")).toBeTruthy();
  }, { timeout: 3000 });

  // Select cell 0 (which has the sog element with a path binding)
  await act(async () => {
    fireEvent.click(getByTestId("cell-0"));
  });

  // The Browse data button should now be visible in the inspector's PathPicker
  await waitFor(() => {
    expect(getByTestId("path-picker-browse")).toBeTruthy();
  }, { timeout: 3000 });

  // Click Browse data
  await act(async () => {
    fireEvent.click(getByTestId("path-picker-browse"));
  });

  // The left rail should now show the DataTree (Data tab active)
  await waitFor(() => {
    expect(queryByTestId("data-tree")).toBeTruthy();
  }, { timeout: 3000 });
});
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor -- --reporter=verbose 2>&1 | grep -E "Browse data|data-tree|FAIL"
```

Expected: The new test FAIL (data-tree not shown after clicking Browse).

- [ ] **Step 3: Modify `MidlEditor.tsx`**

In `MidlEditor.tsx`, inside the `MidlEditor` function, add a callback handler:

```ts
const handleBrowseData = useCallback(() => {
  setLeftTab("data");
}, []);
```

Then pass it to Inspector:
```tsx
<Inspector
  model={model}
  selectedCell={selectedCell}
  manifest={manifest}
  provider={provider}
  onChange={setModel}
  onBrowseData={handleBrowseData}
/>
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -15
```

Expected: All tests pass.

- [ ] **Step 5: Build lib to confirm no type errors**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor
npm run build:lib 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C editor add src/MidlEditor.tsx src/MidlEditor.data-tab.test.tsx
git -C editor commit -m "$(cat <<'EOF'
feat: MidlEditor threads Browse-data callback to switch left rail to Data tab (Fix 2c)

Clicking "Browse data ▸" in the Inspector's PathPicker now activates
the Data tab in the left rail, so path selection is browse-and-pick.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Write the report + final verification

**Files:**
- Create: `/Users/borissorochkin/code/yey.boats/midl-editor/.superpowers/sdd/data-browser-fontsize-report.md`

- [ ] **Step 1: Final test run**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
npm test --workspace editor 2>&1 | tail -15
```

Expected: All tests pass; count ≥ 214.

- [ ] **Step 2: Final build:lib**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor/editor
npm run build:lib 2>&1 | tail -10
```

Expected: Succeeds with `dist/` artifacts.

- [ ] **Step 3: Write report to `.superpowers/sdd/data-browser-fontsize-report.md`**

```
# Data Browser + Font Size Report

## Status
COMPLETE

## Commit hash
<run: git -C /Users/borissorochkin/code/yey.boats/midl-editor/editor log --oneline -1>

## Test result
<paste: Tests N passed (N)>

## Build result
build:lib SUCCESS

## How path-pick works
PathPicker renders a searchable dropdown (catalog + live paths merged via
mergeCatalogWithLive); clicking a dropdown item fires onChange with the full
path; "Browse data ▸" fires onBrowseData → MidlEditor switches the left rail
to the Data tab. Typing still works for custom paths.

## How font-size works / what field it serializes to
Inspector reads manifest.fonts (fallback [14,20,28,48]) for the Size select;
selecting a size calls handleSizeChange(n) → updateElement with
element.style.size = n (number). serializeMidl writes it as style.size in
the MIDL YAML. parseMidl reads it back. The SVG renderer (render-svg.ts)
reads style.size via numv(style.size) → opts.size → hero font-size in
singleValueSvg / barSvg / trendSvg / gaugeSvg / autopilotSvg / buttonSvg.

## Concerns
None.
```

- [ ] **Step 4: Final commit (if report is committed)**

```bash
cd /Users/borissorochkin/code/yey.boats/midl-editor
git -C . add .superpowers/sdd/data-browser-fontsize-report.md
git -C . commit -m "$(cat <<'EOF'
docs: add data-browser-fontsize implementation report

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)" 2>/dev/null || echo "Report in editor git only"
# If the .superpowers dir is in the editor git:
git -C editor add ../.superpowers/sdd/data-browser-fontsize-report.md 2>/dev/null || true
git -C editor commit --allow-empty -m "docs: add implementation report" 2>/dev/null || true
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `SIGNALK_CATALOG` with ~50 curated paths, grouped | Task 1 |
| `mergeCatalogWithLive` overlay + live-only append | Task 1 |
| DataTree renders merged set (catalog always shown) | Task 2 |
| Catalog groups visible, searchable, green dot + value where live | Task 2 |
| Injected paths flagged | Task 2 (preserved) |
| Clicking leaf binds (onBindPath unchanged) | Task 2 (preserved) |
| PathPicker: searchable combobox listing catalog + live | Task 3 |
| Typing FILTERS, clicking SELECTS | Task 3 |
| "Browse data ▸" switches left rail to Data tab | Tasks 3, 4, 5 |
| Custom entry still possible (free text) | Task 3 |
| Inspector Size select offering manifest.fonts | Task 4 |
| Fallback [14,20,28,48] when no manifest.fonts | Task 4 |
| Setting size updates element.style.size | Task 4 |
| Round-trip serializeMidl→parseMidl | Task 4 test |
| Preview/render size changes | Task 4 (style.size → opts.size in renderer) |
| TDD (jsdom): catalog merge tests | Task 1 |
| TDD: DataTree renders catalog groups with zero live | Task 2 |
| TDD: clicking catalog leaf calls onBindPath | Task 2 |
| TDD: Inspector path combobox lists catalog + selecting | Task 3 |
| TDD: Browse data triggers tab-switch | Task 5 |
| TDD: Size select changes element size, round-trips | Task 4 |
| 182 tests stay green | All tasks |
| build:lib success | Task 5 |
| No IIFE rebuild, no push | All tasks |
| Report to .superpowers/sdd/ | Task 6 |

### Placeholder scan
No placeholders found.

### Type consistency
- `CatalogEntry` defined in Task 1 and consumed in Tasks 2, 3.
- `PathPickerProps.onBrowse?: () => void` — defined in Task 3, consumed in Task 4.
- `InspectorProps.onBrowseData?: () => void` — defined in Task 4, wired in Task 5.
- `element.style.size: number` — set in Task 4, read by renderer as `numv(style.size)`.
- `leafTestId` / `optionTestId` — consistent naming throughout.
