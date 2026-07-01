# MIDL SVG Renderer Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.
> Spec: `midl/docs/specs/2026-06-21-midl-svg-renderer-design.md`.

**Goal:** Make `yey.boats/instruments` render MIDL screens with the SignalK
manager preview's polish, via a strict, generic MIDL→SVG renderer.

**Architecture:** Output-agnostic core (`prepareDashboard` → `PreparedDashboard`
of placements + resolved element models) feeding swappable backends; add an SVG
backend (default web output) beside the existing Canvas backend. Extend MIDL
additively for the marine features the preview draws.

**Tech Stack:** TypeScript, Vite (IIFE device bundle), Vitest, React front-shell,
S3+CloudFront deploy via GitHub Actions.

## Global Constraints

- License header on every new file: `// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0` + `// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.`
- Edit only `midl/` (canonical) for renderer/language; never vendored `*/midl`.
- Renderer dispatches ONLY on `element.type` + MIDL fields. Zero per-screen casing.
- MIDL changes additive/backward-compatible; pre-existing docs validate unchanged.
- square-480: maxTiles 4, maxDepth 3, maxMarkersPerDial 12, fonts [14,20,28,48].
- Palette/font parity with manager: Montserrat; tokens bg/panel/panel-2/panel-edge/fg/fg-dim/accent/accent-2/good/warn/bad/port/starboard/tide/stale.

---

### Phase 1 — Model + SVG renderer (`midl/web`)

**Task 1 — Theme to firmware palette.** `src/theme.ts`: extend `Theme` with
`bg, panel2, accent2, good, bad, port, starboard, tide`; add `night`(default),
`day`, `high-contrast`. Keep existing keys (`panel,edge,fg,dim,accent,warn,
danger,stale`) so Canvas backend compiles. Tests: `test/theme.test.ts` asserts
all three themes + token values.

**Task 2 — Model resolution.** `src/model.ts`: extend `ElementModel` with
`markers?: {glyph,color,angleDeg,kind}[]`, `zoneColor?: string`,
`sectors?: {from,to,color}[]`, `side?: 'P'|'S'`. Resolve `el.markers[]`
(each `dir` Source → angle; `color` token passthrough; `kind:'vector'`),
`el.style.zones[]` (numeric threshold `{lt,color}` → `zoneColor`),
`el.style.sectors[]` (static or bound edges), `el.format.side`. Cap markers 12.
Tests: `test/model.test.ts`.

**Task 3 — SVG geometry + glyphs.** `src/svg/geometry.ts` (`polar`,`arc`,
`esc`); `src/svg/glyphs.ts` (10 glyph path builders). Pure-string. Tests snapshot
each glyph + arc.

**Task 4 — SVG dial.** `src/svg/dial.ts`: `dialSvg(rect, m, ring, th, opts)` →
bezel ring, tick ring, cardinal numerals (N=port red), center value block,
markers orbiting at angle, optional sectors + hull + shape:'band'. Shared by
compass/windrose. Snapshot tests.

**Task 5 — SVG tiles + frame.** `src/svg/frame.ts` (panel + accent rail +
no-data dashed + stale dim); `src/svg/tiles.ts` (single-value, text, bar+zones,
gauge+zones, trend, autopilot pill, button, centered/XTE bar). Snapshot tests.

**Task 6 — SVG render entry.** `src/svg/render-svg.ts`:
`paintScreenSvg(placements, elements, provider, th, trends?) → string` and
`renderDashboardSvg(text, manifest, className, viewport, provider, opts) →
{ svg: string } & RenderResult`. Dispatch on `element.type`. Export from
`src/device.ts` + `src/index.ts`. Tests: render all 11 `design/midl/*.json`
screens via `MockDataProvider`, snapshot `<svg>`.

### Phase 2 — MIDL extensions (`midl/ts`, `midl/schemas`)

**Task 7 — Types + schema.** `ts/src/types.ts`: widen `Element.markers` items
(`color?`, `dir?: Source`, `kind?: 'rim'|'vector'`); document `style.sectors`,
`style.hull`, `style.shape`, `style.center`, `format.side`.
`schemas/yb-midl-config.schema.json`: admit them.

**Task 8 — Capabilities + semantic.** `schemas/gen/yb-midl-capabilities.*.json`:
add new attrs/marker fields per element. `ts/src/semantic.ts` + `validate.ts`:
admit per class; keep unknown-attr tolerance. Tests: new attrs validate; legacy
docs validate byte-identical (backward-compat).

### Phase 3 — Webshell integration

**Task 9 — Bundle + page.** `cd midl/web && npm run build:device`; copy
`dist-device/midl-device.global.js` →
`kdcube-s5-webshell/apps/front-shell/public/`. Rewrite
`apps/front-shell/public/instruments-demo.js` to use `renderDashboardSvg` into
an SVG container, cycle the 11 design screens (switcher), live SignalK provider
with sample fallback. Update `src/pages/Instruments.tsx` (SVG mount instead of
`<canvas>`). `npm --prefix apps/front-shell run build` passes.

### Phase 4 — Deploy + verify

**Task 10 — Deploy.** Commit webshell changes; push to `main` → `deploy-cloud.yml`
(`deploy-static` → `deploy-cloudfront`). Watch via `gh run watch`.

**Task 11 — Verify live.** Playwright load `https://yey.boats/instruments`;
assert SVG instruments render with data; screenshot each screen; compare to
manager preview vocabulary. Report.

## Self-review

- Spec coverage: strict renderer (T6), output-agnostic core (T2/T6), SVG default
  + Canvas retained (T1 keeps Canvas keys), 8 extensions (T2/T4/T5/T7/T8), 11
  screens (T6/T9), palette/font (T1), tests (each task), deploy+verify (T10/T11). ✓
- No placeholders: each task names exact files + test files. Code transcribed
  during execution from `device-hud.js` (in-repo source of truth) per element.
- Type consistency: `ElementModel` fields (T2) consumed by SVG dial/tiles (T4/T5);
  `renderDashboardSvg` signature (T6) consumed by webshell (T9).
