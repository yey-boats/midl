# MIDL: descriptive `meta`, solver extraction & standard layout library — Implementation Plan

> **For the implementing agent:** This branch is scoped to the **`midl` repo only** (Phase A of the
> Yey Boats "MIDL miniapp dashboards" sub-project). Implement the tasks below **in order**, each as a
> TDD cycle ending in a passing test + commit. The full code for every step is given — treat it as the
> source of truth. Do not touch other repos. When all five tasks are green, this PR is ready for review.

**Goal:** Add additive descriptive `meta` to the MIDL config (grammar v1.1.0), extract the layout
solver into the `@yey-boats/midl` package, add a `layoutSummary` helper, and ship a canonical
standard-layout library with a generated, searchable catalog.

**Tech stack:** TypeScript, `@yey-boats/midl` (tsup build + vitest tests, AJV, yaml). Run tests with
`npm --prefix ts install` then `npm --prefix ts test`. Regenerate capability manifests with
`make gen-manifest` (needs a C++17 compiler).

## Global Constraints

- **MIDL version:** bump grammar `1.0.0 -> 1.1.0` (MINOR; major unchanged so devices stay compatible).
  `meta` is OPTIONAL and additive at document/screen/element level.
- **License header:** new `.ts` files start with the two-line `SPDX-License-Identifier:
  PolyForm-Noncommercial-1.0.0` / `Copyright (c) 2026 Yey Boats Project.` header (match existing files).
- **No behavior change for existing 1.0.0 docs:** they must remain valid; the solver output is unchanged.

---

# Phase A — `midl` repo (own worktree)

> Create a midl worktree first: `git -C /Users/borissorochkin/code/yey.boats/midl worktree add -b feat/meta-and-solver ../kdcube-midl-meta main`, then `cd` there. Run tests with `npm --prefix ts test` after `npm --prefix ts install`.

### Task 1: Add `meta` to the config schema (additive, optional)

**Files:**
- Modify: `schemas/yb-midl-config.schema.json` (root `properties`, `$defs/screen`, `$defs/element`, new `$defs/meta`)
- Test: `ts/test/meta.test.ts`

**Interfaces:**
- Produces: schema accepts an optional `meta` object `{title?, description?, useCase?, agentNotes?, tags?:string[]}` at document root, each screen, and each element.

- [ ] **Step 1: Write the failing test**

```ts
// ts/test/meta.test.ts
import { describe, it, expect } from "vitest";
import { validateConfigStructure } from "../src";
import { parseDoc } from "../src";

const withMeta = `
midl: 1.1.0
meta: { title: "Demo", description: "doc", useCase: "demo", agentNotes: "pick for demo", tags: [demo] }
screens:
  - id: s1
    meta: { title: "Screen 1", useCase: "show one value", tags: [nav] }
    elements:
      sog: { type: single-value, meta: { description: "speed over ground" }, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }
    layout: { element: sog }
`;

describe("meta extension", () => {
  it("accepts meta at doc/screen/element", () => {
    const issues = validateConfigStructure(parseDoc(withMeta) as any);
    expect(issues).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix ts test -- meta`
Expected: FAIL (schema rejects unknown `meta` only if a def sets additionalProperties:false; if it passes already, still keep the test and proceed to make `meta` first-class). If it already passes, continue — Step 3 makes `meta` documented/validated rather than silently allowed.

- [ ] **Step 3: Add the `meta` `$def` and references**

In `schemas/yb-midl-config.schema.json`, add to root `properties` (next to `presets`):

```json
"meta": { "$ref": "#/$defs/meta" }
```

Add inside `$defs/screen` `properties` (after `id`):

```json
"meta": { "$ref": "#/$defs/meta" },
```

Add inside `$defs/element` `properties` (after `name`):

```json
"meta": { "$ref": "#/$defs/meta" },
```

Add a new entry to `$defs`:

```json
"meta": {
  "type": "object",
  "description": "Optional descriptive metadata: human- and agent-readable explanation, use case and tags. Informational only — ignored by renderers/firmware; used for library search and agent selection.",
  "properties": {
    "title": { "description": "Short human label.", "type": "string" },
    "description": { "description": "Human-readable explanation (1-2 sentences).", "type": "string" },
    "useCase": { "description": "When/why to use this dashboard/screen/visualization.", "type": "string" },
    "agentNotes": { "description": "Agent-readable hint for selecting/authoring.", "type": "string" },
    "tags": { "description": "Free-form keywords.", "type": "array", "items": { "type": "string" } }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix ts test -- meta`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add schemas/yb-midl-config.schema.json ts/test/meta.test.ts
git commit -m "feat(midl): additive meta (title/description/useCase/agentNotes/tags) in config schema"
```

### Task 2: Add `meta` to TS types and bump grammar to 1.1.0

**Files:**
- Modify: `ts/src/types.ts` (add `Meta`; add `meta?` to doc/screen/element types)
- Modify: `ts/src/migrate.ts` (register 1.0.0→1.1.0 no-op)
- Test: `ts/test/migrate.test.ts` (extend), `ts/test/meta.test.ts` (extend)

**Interfaces:**
- Produces: `Meta` exported type; `ConfigDoc.meta?`, screen `.meta?`, element `.meta?`; `migrateDocument(doc,"1.1.0")` accepts a 1.0.0 doc unchanged but stamps `midl: "1.1.0"`.

- [ ] **Step 1: Write the failing test**

```ts
// append to ts/test/meta.test.ts
import { migrateDocument, parseDoc as pd } from "../src";
it("migrates 1.0.0 -> 1.1.0 without dropping content", () => {
  const doc: any = pd(`midl: 1.0.0\nscreens:\n  - id: s\n    elements: { a: { type: text } }\n    layout: { element: a }`);
  const out: any = migrateDocument(doc, "1.1.0");
  expect(out.midl).toBe("1.1.0");
  expect(out.screens[0].id).toBe("s");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix ts test -- meta`
Expected: FAIL (no 1.1.0 migration registered)

- [ ] **Step 3: Implement**

In `ts/src/types.ts` add and wire the type (place near `ConfigDoc`):

```ts
export interface Meta {
  title?: string;
  description?: string;
  useCase?: string;
  agentNotes?: string;
  tags?: string[];
}
```

Add `meta?: Meta;` to the `ConfigDoc`, `Screen`, and `Element` interfaces in `types.ts`.

In `ts/src/migrate.ts`, register the no-op (follow the existing `registerMigration` pattern):

```ts
registerMigration("1.0.0", "1.1.0", (doc) => ({ ...doc, midl: "1.1.0" }));
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix ts test`
Expected: PASS (all suites)

- [ ] **Step 5: Commit**

```bash
git add ts/src/types.ts ts/src/migrate.ts ts/test/meta.test.ts
git commit -m "feat(midl): Meta type + 1.0.0->1.1.0 no-op migration"
```

### Task 3: Extract the layout solver into `@yey-boats/midl`

**Files:**
- Create: `ts/src/solve.ts` (moved from `web/src/solve.ts`)
- Modify: `ts/src/index.ts` (export `solveLayout`, `Rect`, `Placement`)
- Modify: `web/src/main.ts`, `web/src/preview.ts`, `web/src/paint.ts` (import `Placement`/`solveLayout` from package); delete `web/src/solve.ts`
- Test: `ts/test/solve.test.ts`

**Interfaces:**
- Produces: `solveLayout(node: Node, rect: Rect): Placement[]`; `interface Rect { x; y; w; h }`; `interface Placement { elementId: string; rect: Rect }` — all from `@yey-boats/midl`.

- [ ] **Step 1: Write the failing test**

```ts
// ts/test/solve.test.ts
import { describe, it, expect } from "vitest";
import { solveLayout, expand, type Rect } from "../src";

const R: Rect = { x: 0, y: 0, w: 100, h: 100 };

describe("solveLayout", () => {
  it("places a single element to the full rect", () => {
    expect(solveLayout({ element: "a" } as any, R)).toEqual([{ elementId: "a", rect: R }]);
  });
  it("splits a row by equal weight", () => {
    const p = solveLayout({ flow: "row", children: [{ element: "a" }, { element: "b" }] } as any, R);
    expect(p.map((x) => x.elementId)).toEqual(["a", "b"]);
    expect(p[0].rect.w).toBe(50);
    expect(p[1].rect.x).toBe(50);
  });
  it("fills a grid row-major", () => {
    const p = solveLayout({ rows: 2, cols: 2, cells: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }] } as any, R);
    expect(p[3]).toEqual({ elementId: "d", rect: { x: 50, y: 50, w: 50, h: 50 } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix ts test -- solve`
Expected: FAIL ("solveLayout is not exported")

- [ ] **Step 3: Move the solver into the package**

Create `ts/src/solve.ts` with the existing solver body (no `@yey-boats/midl` self-import — use the local `Node` type):

```ts
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { Node } from "./types";

export interface Rect { x: number; y: number; w: number; h: number; }
export interface Placement { elementId: string; rect: Rect; }

export function solveLayout(node: Node, rect: Rect): Placement[] {
  if ("element" in node) return [{ elementId: node.element, rect }];
  if ("children" in node) {
    const weights = node.weights ?? node.children.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const out: Placement[] = [];
    let off = 0;
    node.children.forEach((child, i) => {
      const frac = weights[i] / total;
      let childRect: Rect;
      if (node.flow === "row") { const w = rect.w * frac; childRect = { x: rect.x + off, y: rect.y, w, h: rect.h }; off += w; }
      else { const h = rect.h * frac; childRect = { x: rect.x, y: rect.y + off, w: rect.w, h }; off += h; }
      out.push(...solveLayout(child, childRect));
    });
    return out;
  }
  if ("cells" in node) {
    const cw = rect.w / node.cols, ch = rect.h / node.rows;
    const out: Placement[] = [];
    node.cells.forEach((child, i) => {
      const r = Math.floor(i / node.cols), c = i % node.cols;
      out.push(...solveLayout(child, { x: rect.x + c * cw, y: rect.y + r * ch, w: cw, h: ch }));
    });
    return out;
  }
  return []; // preset node — expand() before solving
}
```

Add to `ts/src/index.ts`:

```ts
export { solveLayout } from "./solve";
export type { Rect, Placement } from "./solve";
```

Update `web/src/paint.ts` import `import type { Placement } from "@yey-boats/midl";` (was `./solve`), update `web/src/main.ts`/`preview.ts` to `import { solveLayout } from "@yey-boats/midl"`, and `rm web/src/solve.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix ts test -- solve` then `npm --prefix ts run build`
Expected: PASS; build succeeds (DTS includes `solveLayout`).

- [ ] **Step 5: Commit**

```bash
git add ts/src/solve.ts ts/src/index.ts web/src/main.ts web/src/preview.ts web/src/paint.ts
git rm web/src/solve.ts
git commit -m "feat(midl): extract solveLayout into @yey-boats/midl; web consumes it"
```

### Task 4: `layoutSummary` helper

**Files:**
- Create: `ts/src/summary.ts`
- Modify: `ts/src/index.ts` (export `layoutSummary`, `LayoutSummary`)
- Test: `ts/test/summary.test.ts`

**Interfaces:**
- Produces: `layoutSummary(doc: ConfigDoc): LayoutSummary` where `LayoutSummary = { id?:string; title?:string; description?:string; useCase?:string; tags:string[]; classes:string[]; elements:string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// ts/test/summary.test.ts
import { describe, it, expect } from "vitest";
import { layoutSummary, parseDoc } from "../src";

it("summarizes meta, classes and element types", () => {
  const doc: any = parseDoc(`
midl: 1.1.0
meta: { title: Wind, useCase: upwind, tags: [sailing, wind] }
screens:
  - id: s
    elements:
      w: { type: windrose, bindings: { value: { kind: signalk, path: environment.wind.speedApparent } } }
    layout: { element: w }
    variants:
      - { class: square-480, layout: { element: w } }`);
  const s = layoutSummary(doc);
  expect(s.title).toBe("Wind");
  expect(s.tags).toContain("sailing");
  expect(s.elements).toContain("windrose");
  expect(s.classes).toContain("square-480");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix ts test -- summary`
Expected: FAIL ("layoutSummary is not exported")

- [ ] **Step 3: Implement**

```ts
// ts/src/summary.ts
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { ConfigDoc } from "./types";

export interface LayoutSummary {
  title?: string; description?: string; useCase?: string;
  tags: string[]; classes: string[]; elements: string[];
}

export function layoutSummary(doc: ConfigDoc): LayoutSummary {
  const tags = new Set<string>(doc.meta?.tags ?? []);
  const classes = new Set<string>();
  const elements = new Set<string>();
  for (const sc of doc.screens ?? []) {
    for (const t of sc.meta?.tags ?? []) tags.add(t);
    for (const v of sc.variants ?? []) classes.add(v.class);
    for (const el of Object.values(sc.elements ?? {})) if (el?.type) elements.add(el.type);
  }
  return {
    title: doc.meta?.title, description: doc.meta?.description, useCase: doc.meta?.useCase,
    tags: [...tags], classes: [...classes], elements: [...elements],
  };
}
```

Add to `ts/src/index.ts`:

```ts
export { layoutSummary } from "./summary";
export type { LayoutSummary } from "./summary";
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix ts test -- summary`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ts/src/summary.ts ts/src/index.ts ts/test/summary.test.ts
git commit -m "feat(midl): layoutSummary for library catalog + agent search"
```

### Task 5: Standard layout library + generated catalog

**Files:**
- Create: `library/wind-steering.midl.yaml`, `navigation.midl.yaml`, `engine-systems.midl.yaml`, `electrical.midl.yaml`, `anchor-watch.midl.yaml`, `racing-vmg.midl.yaml`
- Create: `tools/gen-library.mjs` (builds `library/index.json`)
- Create: `library/index.json` (generated, checked in)
- Modify: `ts/package.json` (add `"library": "node ../tools/gen-library.mjs"` script) — path relative to `ts/`
- Test: `ts/test/library.test.ts`

**Interfaces:**
- Consumes: `validateDocument`, `layoutSummary` from Task 2/4; class manifests in `schemas/gen/yb-midl-capabilities.*.json`.
- Produces: `library/index.json` = `[{ id, file, ...LayoutSummary }]`; every library doc validates for each class in its `variants`.

- [ ] **Step 1: Write the failing test**

```ts
// ts/test/library.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateDocument } from "../src";

const LIB = join(__dirname, "..", "..", "library");
const files = readdirSync(LIB).filter((f) => f.endsWith(".midl.yaml"));
const manifest = (cls: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "..", "schemas", "gen", `yb-midl-capabilities.${cls}.json`), "utf8"));

describe("standard layout library", () => {
  it("has at least 6 layouts", () => expect(files.length).toBeGreaterThanOrEqual(6));
  for (const f of files) {
    it(`${f} validates against square-480`, () => {
      const text = readFileSync(join(LIB, f), "utf8");
      const res = validateDocument(text, manifest("square-480"), "square-480");
      expect(res.issues).toEqual([]);
      expect(res.ok).toBe(true);
    });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix ts run gen-manifest 2>/dev/null; cd /Users/borissorochkin/code/yey.boats/midl && make gen-manifest; npm --prefix ts test -- library`
Expected: FAIL (no `library/` dir)

- [ ] **Step 3: Author the 6 library docs (each with `meta`, validating for square-480)**

Create `library/wind-steering.midl.yaml` (the others follow the same shape; author each to fit `square-480` `maxTiles`/`maxDepth` and use only catalog element types/`signalk` sources):

```yaml
midl: 1.1.0
meta:
  title: Wind & Steering
  description: Apparent-wind rose with SOG and heading.
  useCase: Trimming and steering upwind on a beat.
  agentNotes: Choose when the user is sailing upwind or asks about wind angle / VMG.
  tags: [sailing, upwind, wind, steering]
screens:
  - id: dash
    meta: { title: Wind, useCase: read wind angle and speed while steering }
    elements:
      wind: { type: windrose, name: WIND, meta: { description: apparent wind angle + speed }, bindings: { value: { kind: signalk, path: environment.wind.speedApparent }, dir: { kind: signalk, path: environment.wind.angleApparent } } }
      sog:  { type: single-value, name: SOG, format: { unit: kn }, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }
      hdg:  { type: compass, name: HDG, bindings: { value: { kind: signalk, path: navigation.headingTrue }, dir: { kind: signalk, path: navigation.headingTrue } } }
    layout:
      flow: row
      children:
        - element: wind
        - flow: col
          children: [{ element: sog }, { element: hdg }]
    variants:
      - { class: square-480, layout: { flow: row, children: [ { element: wind }, { flow: col, children: [ { element: sog }, { element: hdg } ] } ] } }
```

Author the remaining five so that, collectively, all 9 element types appear at least once: `navigation` (single-value DTW/BTW + compass + bar XTE), `engine-systems` (gauge + bar + single-value), `electrical` (bar + gauge + trend), `anchor-watch` (single-value + compass + text), `racing-vmg` (windrose + trend + single-value + autopilot + button). Keep each ≤ `maxTiles` for `square-480`.

- [ ] **Step 4: Write the catalog generator and generate**

```js
// tools/gen-library.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDoc, layoutSummary } from "../ts/dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "library");
const out = readdirSync(LIB).filter((f) => f.endsWith(".midl.yaml")).map((file) => {
  const doc = parseDoc(readFileSync(join(LIB, file), "utf8"));
  return { id: file.replace(/\.midl\.yaml$/, ""), file, ...layoutSummary(doc) };
});
writeFileSync(join(LIB, "index.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote library/index.json (${out.length} layouts)`);
```

Run: `npm --prefix ts run build && node tools/gen-library.mjs`

- [ ] **Step 5: Run to verify it passes**

Run: `make gen-manifest && npm --prefix ts test -- library`
Expected: PASS (≥6 layouts, all validate for square-480)

- [ ] **Step 6: Commit + push midl branch**

```bash
git add library tools/gen-library.mjs ts/package.json ts/test/library.test.ts
git commit -m "feat(midl): standard layout library + generated searchable catalog"
git push -u origin feat/meta-and-solver
```

> After review/merge of the midl branch, note the merged commit SHA — Task 6 pins the widget's vendored submodule to it.

---

