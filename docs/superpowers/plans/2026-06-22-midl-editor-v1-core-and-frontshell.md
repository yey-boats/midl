# MIDL Editor v1 — Shared Core + Front-Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working first version of the portable MIDL dashboard editor: a shared
`@yey-boats/midl-editor` package (P0) mounted in the cloud front-shell as an authenticated
`/instruments/builder` that loads/saves user dashboards to the S3 store and previews live SignalK (P1).

**Architecture:** `@yey-boats/midl-editor` (new package in `midl/editor/`) holds a transport-agnostic
editor model + a React `<MidlEditor>` consuming `@yey-boats/midl-web` for preview/validation. Hosts inject
a `DashboardStoreAdapter`, a `LiveDataProvider`, and an `EditorAuth`. The front-shell implements those
adapters over the S3 store RPC and the SignalK relay.

**Tech Stack:** TypeScript, React 18, Vite + Vitest (matches `midl/web`), `@yey-boats/midl-web`,
front-shell in `navigator-tg-bot/apps/front-shell`.

**Spec:** `midl/docs/superpowers/specs/2026-06-22-portable-midl-dashboard-editor-design.md`

## Global Constraints

- Canonical format is **MIDL** (`{ midl, screens:[{ id,title,elements,layout:{rows,cols,cells},variants[] }] }`).
- Editor core has **zero** network/storage/socket/auth calls — all behind injected adapters.
- Save is **validation-gated**: server validation `issues` block; client `prepareDashboard` gives pre-flight feedback.
- User MIDL is untrusted: SVG is **sanitized** (whitelist) before any `innerHTML`.
- Mutations send `Idempotency-Key`; `save`/`remove` send `expectedRevision`; `revision_conflict` is surfaced.
- `/instruments/builder` is **auth-gated**.
- Match `midl/web` conventions: SPDX header on every source file, Vitest, `vite build:lib`.

---

## P0 — `@yey-boats/midl-editor` core (in `midl/editor/`)

### Task 0.1: Package scaffold

**Files:**
- Create: `editor/package.json`, `editor/tsconfig.json`, `editor/vite.lib.config.ts`, `editor/vitest.config.ts`, `editor/src/index.ts`
- Test: `editor/src/index.test.ts`

**Interfaces — Produces:** the `@yey-boats/midl-editor` package, depending on `@yey-boats/midl` and `@yey-boats/midl-web` (workspace `*`), peer React 18. Mirror `web/package.json` scripts (`test`, `build:lib`).

- [ ] Step 1: Write `editor/src/index.test.ts` asserting `import { EDITOR_VERSION } from "./index"` equals `"0.1.0"`. Run `npx vitest run` → FAIL.
- [ ] Step 2: Create `package.json` (name `@yey-boats/midl-editor`, deps `@yey-boats/midl-web`:`*`, `@yey-boats/midl`:`*`; peer react/react-dom 18.3.1; devDeps copied from `web/package.json`), `tsconfig.json`, vite/vitest configs copied from `web/` and adjusted, and `src/index.ts` exporting `export const EDITOR_VERSION = "0.1.0";`.
- [ ] Step 3: `npm install` at repo root (or `editor/`); `npx vitest run` → PASS.
- [ ] Step 4: Commit.

### Task 0.2: Editor model + lossless MIDL⇄model round-trip

**Files:**
- Create: `editor/src/model.ts`, `editor/src/midl-io.ts`
- Test: `editor/src/midl-io.test.ts`

**Interfaces — Produces:**
```ts
export interface EditorElement { id: string; type: string; name?: string;
  bindings?: Record<string, { kind: string; path?: string; id?: string; value?: unknown }>;
  format?: { unit?: string; decimals?: number }; style?: Record<string, unknown>; }
export interface GridLayout { rows: number; cols: number; cells: Array<{ element?: string }>; }
export interface EditorVariant { class: string; layout: GridLayout; }
export interface EditorModel { midl: string; screenId: string; title: string;
  elements: Record<string, EditorElement>; layout: GridLayout; variants: EditorVariant[]; }
export function parseMidl(source: string): EditorModel;     // YAML or JSON source -> model
export function serializeMidl(m: EditorModel, fmt?: "yaml"|"json"): string;  // model -> MIDL source
```
**Consumes:** YAML parsing — reuse whatever `@yey-boats/midl` already uses (check `midl/ts`); do not add a new YAML lib if one is present.

- [ ] Step 1: Write `midl-io.test.ts`: for each library fixture (copy 2–3 `*.midl.yaml` from `midl/library` into `editor/src/__fixtures__/`), assert `serializeMidl(parseMidl(src))` re-parses to a deep-equal model (round-trip stable), and that `parseMidl` of a compiled `midl-screens/*.json` (also a fixture) yields the same model shape. Run → FAIL.
- [ ] Step 2: Implement `parseMidl`/`serializeMidl` in `midl-io.ts` and the types in `model.ts`. Normalize `screens[0]` only (multi-screen out of v1 scope; assert single screen, else throw `EditorError`).
- [ ] Step 3: Run → PASS. Add a fuzz-ish case: element with no format, compass with raw binding, trend element.
- [ ] Step 4: Commit.

### Task 0.3: Layout operations

**Files:** Create `editor/src/layout-ops.ts`; Test `editor/src/layout-ops.test.ts`

**Interfaces — Produces:** pure functions returning a new `GridLayout`/`EditorModel` (immutable):
```ts
export function addRow(m: EditorModel): EditorModel;
export function addCol(m: EditorModel): EditorModel;
export function removeRow(m: EditorModel, row: number): EditorModel;   // re-flows cells; orphaned elements dropped from layout, kept in elements map
export function removeCol(m: EditorModel, col: number): EditorModel;
export function assignElementToCell(m: EditorModel, cellIndex: number, elementId: string): EditorModel;
export function clearCell(m: EditorModel, cellIndex: number): EditorModel;
export function addElement(m: EditorModel, el: EditorElement): EditorModel;   // adds to elements map only
export function removeElement(m: EditorModel, elementId: string): EditorModel; // removes from map + any cell
```
- [ ] Step 1: Tests covering: add/remove row keeps `cells.length === rows*cols`; removeRow re-flows; assign/clear; removeElement clears its cell. Run → FAIL.
- [ ] Step 2: Implement immutably. Run → PASS. Step 3: Commit.

### Task 0.4: SVG sanitizer

**Files:** Create `editor/src/sanitize-svg.ts`; Test `editor/src/sanitize-svg.test.ts`

**Interfaces — Produces:** `export function sanitizeSvg(svg: string): string;` — whitelist: strip `<script>`, `<foreignObject>`, any `on*` attribute, `href`/`xlink:href` whose value matches `/^\s*javascript:/i`, and `<a>` with such hrefs. DOMParser-based (jsdom in tests).

- [ ] Step 1: Tests: malicious inputs (`<svg><script>alert(1)</script>`, `<rect onload=...>`, `<a href="javascript:...">`, `<foreignObject>`) are neutralized; a benign renderer SVG passes unchanged (deep structural check on the safe subset). Run → FAIL.
- [ ] Step 2: Implement. Run → PASS. Step 3: Commit.

### Task 0.5: Adapter interfaces + validation orchestration

**Files:** Create `editor/src/adapters.ts`, `editor/src/validate.ts`; Test `editor/src/validate.test.ts`

**Interfaces — Produces:** the adapter contract from the spec §1 (`DashboardStoreAdapter`, `LiveDataProvider` re-exported from midl-web's `DataProvider`, `ManifestSource`, `EditorAuth`, `DashboardRef`, `DashboardSummary`, `Validation`, `Issue`) and:
```ts
export function validateModel(m: EditorModel, manifest: Manifest): Validation; // wraps midl-web prepareDashboard; maps issues+paths
```
- [ ] Step 1: Test `validateModel` returns `{ ok, issues:[{path,message,severity}] }`; an invalid binding/element-type yields `ok:false` with a path. Run → FAIL.
- [ ] Step 2: Implement using `prepareDashboard` from `@yey-boats/midl-web`. Step 3: PASS. Step 4: Commit.

### Task 0.6: `<MidlEditor>` — preview + state shell

**Files:** Create `editor/src/MidlEditor.tsx`, `editor/src/usePreview.ts`; Test `editor/src/MidlEditor.test.tsx`

**Interfaces — Consumes:** `renderDashboardSvg` (midl-web), `sanitizeSvg`, `validateModel`, model/ops.
**Produces:**
```ts
export interface MidlEditorProps { store: DashboardStoreAdapter; provider: DataProvider;
  manifest: ManifestSource; initialId?: string; targetClass?: string;
  onSaved?: (ref: DashboardRef) => void; }
export function MidlEditor(props: MidlEditorProps): JSX.Element;
```
Holds the `EditorModel` in state, a mode toggle (`visual|source`), class + theme switch. `usePreview(model, provider, manifest, {theme,class})` returns sanitized SVG (rAF-throttled, guarded by `validateModel` — invalid → error banner, last good SVG retained).

- [ ] Step 1: Test (RTL + jsdom): mount with a `MockDataProvider` + fixture store; preview host receives sanitized SVG; toggling mode keeps model; switching class re-renders. Run → FAIL.
- [ ] Step 2: Implement the shell, preview pane (`dangerouslySetInnerHTML` with sanitized SVG), mode toggle, class/theme switch, and a save bar (calls `store.save`, surfaces `revision_conflict`). Step 3: PASS. Step 4: Commit.

### Task 0.7: Visual mode — palette, grid overlay, inspector

**Files:** Create `editor/src/visual/Palette.tsx`, `editor/src/visual/GridCanvas.tsx`, `editor/src/visual/Inspector.tsx`, `editor/src/visual/PathPicker.tsx`; Test `editor/src/visual/GridCanvas.test.tsx`, `editor/src/visual/Inspector.test.tsx`

**Interfaces — Consumes:** layout-ops, model, manifest (element types + allowed attrs), provider (live path keys for picker). `GridCanvas` computes cell rects from `layout.{rows,cols}` × viewport and overlays transparent clickable cells on the preview SVG (no SVG hit-testing). `PathPicker` sources options from manifest sources + provider's known paths.

- [ ] Step 1: Tests: clicking a cell selects it (callback fires with cell index); Inspector edits (type/path/unit/decimals) produce the right `layout-ops`/model change; add/remove-cell buttons call the right op. Run → FAIL.
- [ ] Step 2: Implement; wire into `MidlEditor` visual mode. Step 3: PASS. Step 4: Commit.

### Task 0.8: Source mode + library export

**Files:** Create `editor/src/source/SourceEditor.tsx`; modify `editor/src/index.ts` (public exports); Test `editor/src/source/SourceEditor.test.tsx`

**Interfaces — Produces (public API):** export `MidlEditor`, `MidlEditorProps`, all adapter types, `parseMidl`/`serializeMidl`, `EditorModel` from `index.ts`.

- [ ] Step 1: Test: editing source text updates the model on valid parse; invalid source shows inline issues and does not corrupt the model; switching visual→source serializes current model. Run → FAIL.
- [ ] Step 2: Implement textarea-based source editor with `parseMidl` on change (debounced) + `validateModel` issues list. Step 3: PASS. Step 4: Commit. Run `npm run build:lib` to confirm the package builds.

---

## P1 — Front-shell integration (`navigator-tg-bot/apps/front-shell`)

### Task 1.1: S3 store adapter (`dashboardStore.ts`)

**Files:** Create `src/dashboardStore.ts`; Test `src/dashboardStore.test.ts`

**Interfaces — Consumes:** `DashboardStoreAdapter` from `@yey-boats/midl-editor`; `authApiBase(cfg)` from `config.ts`. **Produces:** `export function createS3Store(cfg): DashboardStoreAdapter` implementing the RPC in `contracts/midl-kdcube-api.md`: `dashboards_list` (GET), `dashboard_get` (GET `?id`), `dashboard_save` (POST `{source,name,targetClass,expectedRevision?}`), `dashboard_delete` (POST), `dashboard_clone` (POST). All `credentials:'include'`; mutations set `Idempotency-Key` (crypto.randomUUID); branch on `{ok}`; map error codes; `capabilities:'full'`.

- [ ] Step 1: Tests (fetch mocked): each method hits the right URL/verb/body; mutations include `Idempotency-Key`; `save` with `expectedRevision` → on `{ok:false,error:{code:"revision_conflict"}}` the adapter throws a typed `RevisionConflict`. Run → FAIL.
- [ ] Step 2: Implement. Step 3: PASS. Step 4: Commit.

### Task 1.2: `useSignalKProvider` hook (lifecycle-safe; fixes I2)

**Files:** Create `src/hooks/useSignalKProvider.ts`; Test `src/hooks/useSignalKProvider.test.ts`

**Interfaces — Produces:** `export function useSignalKProvider(): DataProvider` — extracts the WS `SignalkDataProvider` logic from `public/instruments-demo.js` (subscribe, ingest, sample fallback, reconnect+keepalive) into a hook that **opens on mount and tears down WS + all timers on unmount**.

- [ ] Step 1: Test: mount opens a (mocked) socket; unmount closes it and clears keepalive/reconnect timers (assert no open handles / no calls after unmount). Run → FAIL.
- [ ] Step 2: Implement. Step 3: PASS. Step 4: Commit.

### Task 1.3: `ProtectedRoute` (fixes C1)

**Files:** Create `src/components/ProtectedRoute.tsx`; modify `src/main.tsx`; Test `src/components/ProtectedRoute.test.tsx`

**Interfaces — Consumes:** `fetchMe()` from `authClient.ts`. **Produces:** wrapper that renders children when authenticated, else `<Navigate to={"/signin?next="+encodeURIComponent(loc)} />`. Uses the existing `sanitizeNextPath` (export it from `authClient.ts` if not already — see review I4).

- [ ] Step 1: Test: unauth → redirect with sanitized `next`; auth → children. Run → FAIL.
- [ ] Step 2: Implement; wrap the new `/instruments/builder` routes. Step 3: PASS. Step 4: Commit.

### Task 1.4: Builder page + route

**Files:** Create `src/pages/Builder.tsx`; modify `src/main.tsx` (routes `/instruments/builder`, `/instruments/builder/:id`); Test `src/pages/Builder.test.tsx`

**Interfaces — Consumes:** `<MidlEditor>` (midl-editor), `createS3Store`, `useSignalKProvider`, a `ManifestSource` fetching `/midl-screens`-style manifest (reuse the front-shell MANIFEST from `instruments-demo.js`; extract to `src/midlManifest.ts`). **Produces:** the route shell wiring those into `<MidlEditor>` with `initialId` from the route param; `onSaved` navigates to Instruments.

- [ ] Step 1: Test: `/instruments/builder` mounts MidlEditor with a full store; `/:id` passes `initialId`. Run → FAIL.
- [ ] Step 2: Implement. Step 3: PASS. Step 4: Commit.

### Task 1.5: Instruments owned-dashboard list (closes I1) + New/Edit entry points

**Files:** modify `src/pages/Instruments.tsx`; Test `src/pages/Instruments.test.tsx`

**Interfaces — Consumes:** `createS3Store(...).list()`. **Produces:** when authenticated, an "Your dashboards" group in the selector (from `dashboards_list`) plus "New dashboard" and "Edit" buttons linking to `/instruments/builder[/:id]`. Library/design screens stay as-is for guests.

- [ ] Step 1: Test: authenticated render lists owned dashboards + shows New/Edit; guest render unchanged. Run → FAIL.
- [ ] Step 2: Implement (additive; do not regress the existing static selector). Step 3: PASS. Step 4: Commit.

### Task 1.6: CSP header (fixes C3/M1 at the edge)

**Files:** modify `apps/front-shell/nginx.conf`

- [ ] Step 1: Add a `Content-Security-Policy` (and `X-Content-Type-Options: nosniff`, `Referrer-Policy`) allowing self scripts/styles + the SignalK WS origin, disallowing inline `<script>`. Verify the app still loads under the policy (build + `vite preview` smoke). Step 2: Commit.

---

## Out of scope for v1 (fast-follow plans)

- **P2 device (instruments):** serve the editor bundle from flash/SPIFFS, device `DashboardStoreAdapter`, `capabilities:'single'`, flash reboot-survival, size budget.
- **P3 plugin (Instruments-manager):** converge `field-editor.js`/`live-preview.js` onto `<MidlEditor>` via a plugin `DashboardStoreAdapter` over `/devices/:id/editor/*`.
- Server-set `HttpOnly` session cookie (review C2).

## Self-review notes

- Types are consistent across tasks (`EditorModel`/`GridLayout`/`DashboardStoreAdapter` defined in 0.2/0.5, consumed unchanged in 0.6–1.5).
- Every code task is TDD (failing test first). No placeholders; tricky logic (round-trip, ops, sanitizer, store RPC, WS teardown) has concrete contracts. UI-assembly steps lean on RTL behavior tests + the review loop.
- Reconciliation seam (`parseMidl`/`serializeMidl`) is isolated so the migrate branch / Claude Design restyle touch only `midl-io.ts` and `visual/*`.
