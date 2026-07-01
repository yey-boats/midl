# Task 0.5 Report — Adapter interfaces + validation orchestration

## Status: COMPLETE

## Files Created

- `editor/src/adapters.ts` — types and interfaces (no implementations)
- `editor/src/validate.ts` — `validateModel` implementation
- `editor/src/validate.test.ts` — 8 TDD tests (all green)

---

## DashboardRef shape (from contract)

The contract at `kdcube-midl-bundle/contracts/midl-kdcube-api.md` treats `DashboardRef` as an
opaque reference used in:
- `dashboard_get` response: `{ ref, doc, metadata }`
- `dashboard_save` response: `{ ref, validation }`
- `dashboard_clone` request body: `{ from: DashboardRef, name }`
- `dashboard_clone` response: `{ ref }`

The contract does not spell out the internal shape of `DashboardRef` explicitly. Based on the
storage note (`{bundle_storage_root}/dashboards/{sha256(user_key)}/{dashboard_id}.midl.json`) and
the list endpoint returning `{ id, title, ... }`, `DashboardRef` is modelled as:

```ts
export interface DashboardRef {
  id: string;
  source?: string; // server-derived storage path prefix
}
```

The `id` is server-generated and opaque. `source` is optional and carries the scoped path prefix.

---

## prepareDashboard signature (from `web/src/render.ts`)

```ts
export function prepareDashboard(
  text: string,
  manifest: Manifest,
  className: string,
  viewport: Rect
): PreparedDashboard
```

Where `PreparedDashboard`:
```ts
export interface PreparedDashboard {
  ok: boolean;
  issues: Issue[];
  paths: string[];
  screens: ScreenPlan[];
  elements: Record<string, Record<string, Element>>;
}
```

`prepareDashboard` calls `previewConfig` (which calls `validateDocument` — the full pipeline:
structural → semantic → version → capability satisfaction). On failure returns `ok: false` with
`issues[]`. Issues from the MIDL validation carry `severity?: "error" | "warning"`. Issues from
`satisfy.ts` (capability check) have no `severity` field (implicitly error).

### Key implementation note

Issues without a `severity` field default to "error" per the MIDL spec (see `ts/src/types.ts` comment:
"Omitting `severity` means 'error' for backwards compatibility"). The `validate.ts` implementation
correctly treats `severity === undefined` as an error:

```ts
const ok = issues.every((i) => i.severity === "warning");
```

---

## Manifest fixture source

The manifest used in tests is constructed inline in `validate.test.ts` (not loaded from a file),
mirroring the content of `schemas/gen/yb-midl-capabilities.square-480.json`. This file was found
at that path and lists 9 element types: `single-value, text, gauge, bar, compass, windrose, trend,
autopilot, button`. The inline manifest is preferred over a file load to avoid coupling the test
to a generated artefact path.

Reference: `web/test/preview.test.ts` also defines manifests inline.

---

## Test summary

8 tests across 4 describe blocks:

1. **valid fixtures** — navigation, electrical, wind-steering all pass with `ok: true`
2. **invalid models** — bogus element type → `ok: false`; restricted manifest (no compass) → `ok: false`; empty manifest → `ok: false`
3. **Validation shape** — issues have `path: string, message: string`, severity is typed
4. **ok semantics** — `ok` is `true` iff no issue has severity "error" or omitted severity

### Key TDD finding

The test for "bogus element type" initially failed when the model still had a `square-480` variant:
`satisfy.ts` uses the variant layout (not the base layout) when a variant matches the target class,
so the bogus element in the base layout was never checked. Fixed by clearing variants in the test,
ensuring the base layout is used.

---

## Concerns

1. `prepareDashboard` requires a `Rect` viewport for layout solving. This is only needed for
   painting, not for structural/semantic validation. A future improvement could expose a
   `validateOnly` path in `@yey-boats/midl-web` that skips layout solving.

2. `DashboardRef.source` is speculative — the contract treats `DashboardRef` as opaque in requests
   but the exact server-side fields are undocumented. Implementations in P1 may need to refine
   this type.

3. The `ok` field semantics follow the MIDL spec: warnings-only = `ok: true`. This differs from
   the store's `validation_failed` error code which blocks saves only on errors (not warnings).
   Consistent with contract behaviour.
