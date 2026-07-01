# MIDL SVG Renderer — Design

Status: approved design, pre-implementation.
Date: 2026-06-21.
Owner: Yey Boats Project.
Repo: `midl` (canonical). Consumed by `kdcube-s5-webshell` (primary deploy
target), `navigator-tg-bot`, `kdcube-s7-serving`, `Instruments-manager`.

## Problem

The "instruments" web view deployed at `https://yey.boats/instruments`
(`kdcube-s5-webshell/apps/front-shell/src/pages/Instruments.tsx`) renders MIDL
dashboards with crude Canvas primitives: a compass is a bare circle plus a
radial line, a windrose is the same, gauges are a plain arc, and values are
`system-ui` text. It looks nothing like the polished preview shown by the
SignalK manager plugin (`Instruments-manager/public/device-hud.js`), which
draws rich SVG marine instruments — bezels, tick rings, cardinal numerals,
glyph markers, and a semantic palette.

Goal: make the deployed instruments view look like the manager preview, but do
it the *right* way — as a **strict, generic MIDL renderer** that draws each
MIDL element type with that polish, driven entirely by the MIDL document. No
bespoke per-screen code.

## Constraints and principles

1. **Strict MIDL.** The renderer consumes a MIDL `ConfigDoc` and renders the
   screen's element tree. It must contain **no per-screen / per-"kind" special
   cases**. The manager's beauty partly comes from bespoke full-screen HUDs
   (`windClassicHud`, `windSteerHud`, `autopilotHud`, `windDial` in
   `device-hud.js`) selected by a "screen kind". **MIDL has no concept of a
   screen kind** — a MIDL screen is a tree of generic widgets. We reproduce the
   manager's *visual vocabulary* per element type, size-adaptively, and nothing
   that cannot be derived from MIDL fields.
2. **Output-agnostic core.** The current public API bakes the output technology
   into the signature (`renderDashboard(ctx: CanvasRenderingContext2D, …)`).
   That coupling is removed. The generic MIDL core (validate → solve layout →
   resolve element models) knows nothing about Canvas or SVG. Rendering happens
   in thin, swappable **backends** that consume a `PreparedDashboard`.
3. **SVG is the default web backend.** Canvas is retained as an alternate
   backend so existing consumers (`navigator`, `s7-serving`) keep working
   unchanged until they migrate.
4. **Firmware is unaffected.** The ESP32 firmware (`instruments/`) renders
   natively in C++/LVGL and never executes this JS bundle. Changing the JS
   render backend cannot break the firmware. MIDL schema extensions in this
   spec are additive and backward-compatible; the firmware's native renderer
   may adopt the new attributes later (tracked as follow-up), and MIDL's
   semantic pass already tolerates unknown attributes.
5. **Reusable.** All renderer code lives in `midl/web` (the canonical package
   `@yey-boats/midl-web`). The standalone IIFE bundle (`midl-device.global.js`,
   built from `src/device.ts`) is the single artifact every web consumer
   embeds. We never edit vendored `*/midl` checkouts directly (root CLAUDE.md
   rule); we edit `midl/`, rebuild, and propagate the bundle.

## Architecture

```
MIDL doc ──▶ [ generic core ]  prepareDashboard(text, manifest, class, viewport)
                 • parse + validate + manifest check         (preview.ts)
                 • solve layout rectangles                   (preview.ts)
                 • resolve ElementModel per element          (model.ts)
                   value, text, fraction, angleDeg, dirDeg,
                   markers[], zones[], sectors[], side
                      │
            PreparedDashboard  (placements + resolved models; no pixels, no ctx)
                      │
        ┌─────────────┴───────────────┐
   renderSvg(prepared, theme)     renderCanvas(ctx, prepared, theme)
     → SVG string (default web)     (existing paint.ts, retained)
```

- `prepareDashboard` already exists in `render.ts` and is the seam. We extend
  the resolved model (`model.ts`) with `markers`, `zones`, `sectors`, and
  `side`, so **both** backends read the same data.
- Backends are pure functions of `(PreparedDashboard, Theme)` (+ `ctx` for
  Canvas). Neither backend re-validates or re-solves.

### New / changed files (all under `midl/web/src`)

| File | Responsibility |
|---|---|
| `svg/geometry.ts` | `polar(deg,r)`, `arc(t0,t1,r)`, viewport math (lifted from `device-hud.js`). Pure. |
| `svg/glyphs.ts` | The 10 MIDL glyphs (`triangle, diamond, circle, bar, cross, chevron_in, chevron_out, chevron_left, chevron_right, chevron_double`) as SVG path builders. |
| `svg/dial.ts` | Round dial: bezel ring, tick ring, cardinal numerals (N/E/S/W + 30/60/90/120/150), center value block, glyph markers, optional sectors. Shared by `compass` + `windrose`. |
| `svg/tiles.ts` | `single-value`, `text`, `bar` (+zones), `gauge` (+zones), `trend` sparkline, `autopilot` state pill, `button`. |
| `svg/frame.ts` | Panel background, 1px semantic border, 4px accent rail (round instruments use the bezel instead), no-data (dashed) + stale (dimmed) states. |
| `svg/render-svg.ts` | `paintScreenSvg(placements, elements, provider, theme)` → SVG `<g>` string; `renderDashboardSvg(text, manifest, class, viewport, provider, opts)` → full `<svg>` string + `RenderResult`. |
| `theme.ts` (edit) | Replace the two thin themes with the firmware palette; add `high-contrast`. |
| `model.ts` (edit) | Resolve `markers[]`, `zones[]`, `sectors[]`, `side`. |
| `device.ts`, `index.ts` (edit) | Export the SVG API alongside the Canvas API. |

### Theme (palette parity with firmware `ui_theme` / manager CSS)

`night` (default), `day`, and `high-contrast`. Tokens (night shown):

```
bg #0a1018  panel #101b29  panel-2 #16222f  panel-edge #1f2d3d
fg #eef4fa  fg-dim #8fa7bd  accent #4fc3f7  accent-2 #36d399
good #36d399  warn #ffb84d  bad #ff5252  port #ff5252
starboard #36d399  tide #288cff  stale #4a5666
```

Font family: **Montserrat** (weights 400/700), matching the manager and the
design-session typography (captions 14, values 20/28, hero 48).

`color`/`zones` tokens in MIDL resolve against this theme (`accent`, `good`,
`warn`, `bad`, `fg`, etc.); a `#rrggbb` literal passes through.

## Drawing spec per element type

All dimensions scale to the element's solved `rect` (size-adaptive), using the
same polar math as `device-hud.js` but centered/scaled within the tile rather
than the full 480×480 frame.

- **compass / windrose (`svg/dial.ts`).** Inner face (`panel`), white band
  bezel, accent outer ring, tick ring, cardinal numerals (N in `port` red,
  others `fg`), center value block (`style.size`, `style.title`, `format`).
  Markers from `markers[]` orbit the rim at each marker's `dir` angle, drawn
  with its `glyph` and `color` (cap `maxMarkersPerDial = 12`). `windrose`
  defaults its primary ring accent to `warn`, `compass` to `accent` (matching
  current code), overridable by `style.color`.
- **single-value (`svg/tiles.ts`).** Caption (`style.title`, dim) + hero value
  (`style.size` → nearest of fonts 14/20/28/48) + unit, `style.color` or `fg`.
- **text.** Caption + multi-line value (e.g. lat/lon DMS), preserves newlines.
- **bar.** Outlined track + fill to `fraction`; fill color from `zones[]`
  threshold match else `accent`; hero value above.
- **gauge.** 180° arc track + accent progress arc to `fraction`; `zones[]`
  recolor; center value.
- **trend.** Sparkline polyline over the sample buffer + current value.
- **autopilot.** State pill: `good` when engaged, `fg-dim` when standby;
  label = `style.title`.
- **button.** Rounded rect + centered label; `action` (`nav`|`command`) carried
  for the host to wire (rendering only).
- **frame (all tiles).** `panel` fill, `panel-edge` border, 4px accent rail
  (design-session); dashed border on `no-data`; dimmed on `stale`.

## MIDL extensions (additive, backward-compatible)

Decision: extend MIDL now so the renderer can express the manager preview's
marine features. Each is **optional**; documents and firmware that ignore them
are unaffected. Changes land in `midl/ts` (types + semantic + validate),
`midl/schemas` (config + per-class capabilities), and the SVG renderer.

| # | Manager feature | Extension | Shape |
|---|---|---|---|
| 1 | Close-hauled port/stbd sectors | `style.sectors[]` on compass/windrose | `[{ from:number, to:number, color:token }]` (deg, bow-relative) |
| 2 | No-go zone + layline tolerance | same `style.sectors[]` (data-driven via `bindings` for dynamic angles) | reuse #1; dynamic edges bind a source |
| 3 | Boat hull silhouette | `style.hull: true` render hint on dial | boolean |
| 4 | Tide/current vector + drift | new marker kind `{ kind:"vector", glyph:"arrow", dir, value }` | center vector, not rim marker |
| 5 | XTE cross-track needle | `style.center: 0` + symmetric `range` on `bar` (centered deviation) | renders a center-zero needle bar |
| 6 | Heading-band (rolling compass) | `style.shape: "round" \| "band"` on compass | enum, default `round` |
| 7 | Wind-angle P/S suffix ("42S") | `format.side: true` | boolean; formats signed angle as magnitude+side |
| 8 | Full-screen HUD "kinds" | none — not added | screens stay element trees; #1–#7 let a MIDL screen *compose* the same look |

Capability manifests (`schemas/gen/yb-midl-capabilities.*.json`) gain the new
attrs/markers per element so validation admits them per device class. The
square-480 class keeps `maxTiles=4`, `maxDepth=3`, `maxMarkersPerDial=12`.

`Element.markers` type widens from `Array<{ glyph?: string }>` to include
`color?`, `dir?: Source`, and the `kind:"vector"` variant. `Element.style`
gains documented optional keys `sectors`, `hull`, `shape`, `center`.
`Element.format` gains optional `side`.

## Strictness guarantees

- The SVG backend dispatches **only** on `element.type` and reads **only**
  MIDL fields (`type`, `name`, `style`, `format`, `bindings`, `markers`). It
  never inspects `screen.id`/`title` to choose a visual.
- Anything the manager preview draws that is *not* expressible after the
  extensions above is **omitted**, not hardcoded. After this pass the known
  remaining non-MIDL items are: the bespoke full-screen HUD compositions
  themselves (#8 — intentionally not modeled), and any future decoration not
  covered by #1–#7. These are documented here as the compatibility boundary.

## The 11 reference screens

`instruments/design/midl/*.json` (dashboard, nav, depth, status, wind,
wind_classic, wind_steer, autopilot, route, steering, trip) are the canonical
inputs and snapshot fixtures. Their `_note` fields already document MIDL
limitations (e.g. wind_classic: "square-480 caps maxTiles=4 … Dropped: AWA,
TWA, COG, STW"), corroborating the boundary above. The renderer must produce a
clean, faithful result for each.

## Testing

- **Unit (vitest):** per element type, snapshot the SVG `<g>` for representative
  models (ok / stale / no-data; with markers; with zones; with sectors).
- **Screen snapshots:** render each of the 11 `design/midl/*.json` screens via
  `MockDataProvider` at `square-480` (480×480) and snapshot the full `<svg>`.
- **Model tests:** `markers[]`, `zones[]`, `sectors[]`, `side` resolution.
- **Schema/semantic tests:** new attrs validate; documents without them still
  validate identically (backward-compat assertion).
- **Existing Canvas + midl/ts tests stay green** (the Canvas backend and the
  generic core are unchanged in contract).

## Deploy & verify (webshell, primary target)

1. `cd midl/web && npm install && npm run build:device` →
   `dist-device/midl-device.global.js`.
2. Copy the bundle to
   `kdcube-s5-webshell/apps/front-shell/public/midl-device.global.js`.
3. Update `kdcube-s5-webshell/apps/front-shell/src/pages/Instruments.tsx` and
   `public/instruments-demo.js` to mount an SVG container and call
   `MidlWeb.renderDashboardSvg(...)` instead of `<canvas>` + `renderDashboard`.
   The demo renders the 11 `instruments/design/midl/*.json` screens with a
   screen switcher, bound to live SignalK data with sample-data fallback (the
   page's existing data-provider behaviour is preserved).
4. `npm --prefix apps/front-shell run build`.
5. Cloud deploy via `scripts/cloud/03-sync-static-to-s3.sh` (S3 + CloudFront
   invalidation). Live at `https://yey.boats/instruments`.
6. **Verify** with Playwright at `https://yey.boats/instruments` and compare
   against the manager preview rendering of the same screens; confirm bezels,
   tick rings, cardinals, markers, palette, and no-data/stale states.

Propagation to other consumers (`navigator-tg-bot`, `kdcube-s7-serving`, and
the vendored `*/midl` submodules) is out of scope for this pass and tracked as
follow-up; they keep working on the retained Canvas backend until migrated.

## Out of scope / follow-up

- Firmware (native LVGL) support for the new MIDL attributes (#1–#7).
- Migrating `navigator-tg-bot` / `kdcube-s7-serving` to the SVG backend.
- Bumping vendored `*/midl` submodule pointers in downstream repos.
- Interactivity (button `action` dispatch) beyond carrying the action through.

## Acceptance

- Renderer dispatches only on `element.type` + MIDL fields; zero per-screen
  special cases (code review + grep for screen ids in the backend).
- All 11 design screens render via the SVG backend with bezel/tick/cardinal/
  marker polish matching the manager preview's vocabulary.
- New MIDL attrs are additive: pre-existing documents validate unchanged.
- `https://yey.boats/instruments` shows the new rendering (Playwright evidence).
- Canvas backend + `midl/ts` + `midl/web` existing tests remain green.
