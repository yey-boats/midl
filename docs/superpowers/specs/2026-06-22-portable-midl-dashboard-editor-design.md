# Portable MIDL Dashboard Editor — Design

**Status:** Approved (design); decomposition into per-surface plans pending.
**Date:** 2026-06-22

**Goal:** A single, portable WYSIWYG MIDL dashboard editor — a shared mountable component with a
live preview — deployed across **four surfaces**: (1) the cloud front-shell, (2) the device firmware's
flash-served web UI, (3) the SignalK plugin webapp, and (4) (transitively) anywhere the renderer runs.
It is a *complete builder*: grid/layout authoring, per-class variants, validation-gated save, and
clone/revision/conflict handling. Each surface differs only in three thin adapters (storage, live data,
auth) — the editor core, model, and UI are shared.

**Architecture:** Keystone is a new shared package **`@yey-boats/midl-editor`** in the `midl` repo,
consuming `@yey-boats/midl-web` (`renderDashboardSvg` + `prepareDashboard`) for preview/validation. It
exposes a framework-native mountable `<MidlEditor>` plus a headless editor model. Surfaces inject
adapters; the editor never talks to a network or storage directly. This mirrors the renderer's
transport-agnostic design (the data provider lives outside `midl-web`).

**Tech Stack:** TypeScript; `@yey-boats/midl-web` renderer (SVG); React for the mountable component
(consistent with `MidlDashboard.tsx` and the front-shell); per-surface host code in
navigator-tg-bot (front-shell), `instruments` (C++ firmware web server), `Instruments-manager`
(SignalK Node plugin).

---

## Global Constraints

- **Canonical format is MIDL** (`{ midl, screens:[{ id, title, elements, layout:{rows,cols,cells}, variants[] }] }`).
  The device/plugin "v2 layout JSON" (`{version,settings,screens[],tiles[]}`) is **adapter-only** — the
  existing `Instruments-manager/lib/midl-adapter.js` (`v2ToMidl`/`midlToV2`) is the reference mapping and
  must round-trip. No new canonical format is introduced.
- **Validation parity:** save is gated by the canonical MIDL validation pipeline. Server surfaces use the
  Python validator (`yey_boats_midl`); client gives fast inline feedback via `midl-web` `prepareDashboard`.
  The TS/Python parity corpus in `midl` is authoritative.
- **Editor core is transport/storage/auth agnostic.** Any network, persistence, auth, or live-data access
  is behind an injected adapter interface. The core has zero `fetch`/socket calls.
- **User-authored MIDL is untrusted.** Any path that renders user content to `innerHTML` must sanitize the
  SVG (whitelist; strip `<script>`/`<foreignObject>`/event-handler attrs/`javascript:` URLs) — see §6.
- **Bundle size budget for the device surface:** the editor web bundle served from device flash must fit
  the SPIFFS partition budget (4 MB total on `default_16MB.csv`; target editor assets ≤ ~512 KB gzipped).
  A size check is part of the device plan.

---

## 1. Multi-surface integration (the section-1 requirement)

The editor is **one component, four mounts**. What already exists (consume, don't rebuild — Hybrid):

| Surface | Repo | Today | Mount target |
|---|---|---|---|
| **Cloud front-shell** | navigator-tg-bot `apps/front-shell` | viewer only; no editor; S3 store **not wired** | new `/instruments/builder[/:id]` route, auth-gated |
| **Device firmware** | `instruments` | HTTP API (`/api/dashboard/config.json\|yaml`, `/api/sk`, `/api/screenshot.png`, `/api/midl/manifest`), NVS storage, **no editor UI**; design exists (`2026-06-17-device-mirrored-layout-editor-design.md`, SP4 push-live in `2026-06-12-dashboard-program-design.md`) | static editor bundle served from flash/SPIFFS by `src/web.cpp`; live preview via `/api/sk`+`/api/screenshot.png` |
| **SignalK plugin** | `Instruments-manager` | **mature editor already**: `public/layout-editor.html`, `field-editor.js`, `live-preview.js`, `device-hud.js`, `lib/field-schema.js`, `midl-adapter.js`, routes `/devices/:id/editor/*`, `/capabilities`, `/presets/*` | converge existing editor onto shared `<MidlEditor>` via a plugin store adapter |
| **(transitive) renderer** | `midl` `web/` | `renderDashboardSvg`, `prepareDashboard`, `MidlDashboard.tsx` | dependency of the editor core |

**Adapter contract** (the only surface-specific surface area):

```ts
// @yey-boats/midl-editor — injected by each host
interface DashboardStoreAdapter {
  list(opts?: { targetClass?: string }): Promise<DashboardSummary[]>;
  get(id: string): Promise<{ ref: DashboardRef; doc: string; metadata: Meta }>;
  save(input: { id?: string; source: string; name: string; targetClass: string;
                expectedRevision?: string }): Promise<{ ref: DashboardRef; validation: Validation }>;
  remove(input: { id: string; expectedRevision: string }): Promise<{ id: string }>;
  clone(input: { from: DashboardRef; name: string }): Promise<{ ref: DashboardRef }>;
  readonly capabilities: 'full' | 'single';   // device = single screen/4 tiles; cloud/plugin = full
}
interface LiveDataProvider { /* getValue/subscribe — already defined by midl-web's provider shape */ }
interface ManifestSource { get(targetClass: string): Promise<Manifest>; }
interface EditorAuth { whoami(): Promise<Principal | null>; }
```

Per-surface adapter implementations:
- **Cloud:** `DashboardStoreAdapter` → S3 store RPC (`dashboards_list`/`dashboard_get`/`dashboard_save`/
  `dashboard_delete`/`dashboard_clone`) per `contracts/midl-kdcube-api.md`, `credentials:'include'`,
  `Idempotency-Key` on mutations, `expectedRevision` precondition. Live data → SignalK relay. Auth → Google session.
- **Device:** `DashboardStoreAdapter` → `GET/PUT /api/dashboard/config.json`; `capabilities:'single'`;
  manifest → `/api/midl/manifest`; live data → `/api/sk` (poll) + `/api/screenshot.png` fallback.
  v2↔MIDL via the shared adapter. Persists to NVS/flash (device plan also adds reboot-survival per SP4).
- **Plugin:** `DashboardStoreAdapter` → existing `/devices/:id/editor/*` routes + `lib/store.js`;
  manifest → `/devices/:id/capabilities`; live data → SignalK server + screenshot proxy.

**Reconciliation seams (Hybrid):** `midl-editor`'s MIDL⇄model serialize/parse is the single format adapter;
`Palette`/`GridCanvas`/`Inspector` are the restyle points for the Claude Design spec and the
`chore/midl-design-screens-migrate` branch (not yet pushed as of 2026-06-22; design does not block on it).

## 2. Editor model (single source of truth)

Normalized in-memory model of `screens[0]`: `elements` map, `layout` grid `{rows,cols,cells:[{element}]}`,
`variants[]`. `model.ts` does **lossless MIDL ⇄ model** serialize/parse (the reconciliation point).
`layoutOps.ts`: add/remove rows/cols/cells, assign element→cell, move element.

## 3. Two synchronized modes

- **Visual (primary):** palette (element types from manifest) · grid canvas with a **clickable cell overlay
  computed from the layout+viewport math** (no SVG hit-testing — the editor owns the grid) · inspector for
  the selected element (type, SignalK path picker, format unit/decimals, style zones/range, fonts from
  manifest) · add/remove-cell controls.
- **Source:** MIDL text/structured editor + inline validation (line-referenced issues).
- Both edit the same model; switching serializes/parses (lossless round-trip is the contract between them).

## 4. Live preview

Reuses `renderDashboardSvg(...)`, rAF-throttled, repaints on every model change. Data via an injected
`LiveDataProvider` (cloud relay / device `/api/sk` / plugin SignalK) with sample fallback. Device-class
switcher (`square-480` / `landscape-800x480` / `landscape-1024x600`) drives variant editing; theme
switch (night/day). Renders guarded by `prepareDashboard` — invalid intermediate docs show an error state,
never crash the canvas. The front-shell extracts a **lifecycle-safe `useSignalKProvider()` hook** (fixes
the S5 WS-teardown leak, review I2), shared with the Instruments viewer.

## 5. Persistence, validation gating, revisions

Through `DashboardStoreAdapter`. Mutations carry `Idempotency-Key`; `save`/`remove` carry
`expectedRevision`; `revision_conflict` → conflict UI (reload vs overwrite). Catalogue/repo dashboards are
read-only → "edit a library dashboard" performs `clone` first. Save runs server-side validation; `issues`
block, warnings shown; `prepareDashboard` gives pre-flight client feedback. Front-shell **also lists the
signed-in user's owned dashboards** in the Instruments page (closes review I1) with New/Edit entry points.

## 6. Security

- User-authored MIDL → SVG → `innerHTML` is an XSS surface (review C3). `sanitizeSvg.ts` whitelist pass
  before injection + CSP header in each surface's web server config.
- Front-shell `/instruments/builder` is auth-gated via `ProtectedRoute` (fixes review C1; the builder mutates).
- Flag (separate hardening, not in this build): front-shell session cookie is JS-readable/client-set
  (review C2) — recommend server-set `HttpOnly`; mutations depend on the cookie.

## 7. Testing

- **Core (midl):** MIDL⇄model round-trip (lossless), layout ops, SVG sanitizer, validation-gating logic,
  v2↔MIDL adapter round-trip against the plugin's reference mapping.
- **Cloud:** store client vs contract error codes + `Idempotency-Key`/`expectedRevision`; component
  (inspector edit→model→preview repaint; mode-switch preserves model); e2e (login→new→bind→save→appears
  in Instruments→reopen).
- **Device:** capability-gated editing; config PUT applies live; size-budget check on the flash bundle.
- **Plugin:** existing editor still green after converging onto the shared core; adapter parity.

---

## Decomposition (each is its own writing-plans plan)

1. **P0 — `@yey-boats/midl-editor` core (midl):** model + layoutOps + MIDL⇄model round-trip + adapter
   interfaces + `sanitizeSvg` + validation orchestration + mountable `<MidlEditor>` (Palette/GridCanvas/
   Inspector/SourceEditor/PathPicker) using `midl-web`. Seed UI by extracting from the plugin's existing
   `field-editor.js`/`live-preview.js` where it accelerates. **Keystone — blocks the rest.**
2. **P1 — Front-shell integration (navigator-tg-bot):** S3 `DashboardStoreAdapter`, `useSignalKProvider`
   hook, `ProtectedRoute`, `/instruments/builder[/:id]`, Instruments owned-dashboard list (I1), CSP.
3. **P2 — Device integration (instruments):** serve editor bundle from flash/SPIFFS via `web.cpp`,
   device `DashboardStoreAdapter` (`/api/dashboard/config`, `/api/sk`, `/api/midl/manifest`),
   `capabilities:'single'`, flash reboot-survival (SP4), size budget.
4. **P3 — Plugin convergence (Instruments-manager):** replace bespoke editor internals with the shared
   `<MidlEditor>` + plugin `DashboardStoreAdapter` over existing `/devices/:id/editor/*`; keep current UX
   and tests green.

**Build order:** P0 first; P1/P3 can proceed in parallel after P0 (both already have most infra); P2 last
(largest unknowns: flash hosting + size). Each plan ends with working, testable software on its surface.

## Risks / open items (resolved in plan Task-1s, not blockers)

- Whether `midl-web` exposes layout geometry (else compute cell rects from grid+viewport — already planned).
- Live SignalK path discovery for the picker (manifest sources + streaming paths + device `/api/sk` keys).
- Device flash bundle size vs SPIFFS budget; whether a trimmed build variant is needed.
- Exact reuse boundary of the plugin's existing editor JS when extracting the shared core (P0 Task-1 audit).
