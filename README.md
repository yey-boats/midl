# MIDL — Marine Instrument Definition Language

**Describe a boat dashboard once; render it on the instrument, in the browser, and (soon) on phones and watches — and know it will work on a given device *before* you send it.**

MIDL (also written **YB-MIDL**) is a small, declarative language for marine
multi-function displays. A dashboard is a plain JSON/YAML document: a set of
**screens**, each laying out **elements** (a compass, a wind rose, a numeric
value, a gauge, an autopilot control…) whose fields are **bound to data
sources** (SignalK paths, onboard sensors, constants). The same document drives
every renderer, and every device publishes a **capability manifest** that says
exactly what it can draw — so a document can be *validated against the real
target* before it is ever posted to hardware.

It is the single source of truth shared across all Yey Boats projects: the
ESP32 firmware, the SignalK manager plugin, the simulator, and the web preview.

---

## Why MIDL exists

Marine displays historically hardcode their screens in firmware. Changing a
layout means a new build and a reflash. MIDL turns the layout into **data**:

- **Author once, render everywhere.** One document → the on-device LVGL
  renderer, a web canvas preview, and future mobile/watch renderers. No
  per-platform reimplementation of "what a wind rose is."
- **The device tells you what it supports.** Each firmware build generates a
  capability manifest *from its own element catalog*, so the manifest can never
  lie about what the hardware can render. The editor only offers — and the
  validator only accepts — what the target device actually does.
- **Catch mistakes before the boat does.** A config is checked in two senses:
  it is *well-formed* (JSON Schema) and *admissible for this device at its
  resolution* (capability satisfaction). Bad documents are rejected with
  path-addressed errors, not silently mis-rendered at sea.
- **Evolve safely.** Versioned `MAJOR.MINOR.BUILD`: old documents keep working
  on newer firmware (minor is forward-compatible); breaking changes are crossed
  with explicit migrations.

---

## How it fits together

```
        include/yb_midl_catalog.h          ← single C++ source of truth
                  │  build-time generator (make gen-manifest)
                  ▼
   schemas/gen/yb-midl-capabilities.<class>.json   (per-resolution manifest)
   schemas/*.schema.json                            (config + manifest grammar)
                  │  generated TS/JS bindings + validator (@yey-boats/midl)
                  ▼
   ┌──────────────┬───────────────┬───────────────┬───────────────┐
   firmware (LVGL)   web (Canvas)    manager (Node)   future: mobile/watch
   embeds + serves   renders +       validates a      (a new bindings target,
   its manifest      previews any    config before     not a new source of
   at /api/midl/     resolution      posting to a      truth)
   manifest          class           device
```

The catalog is upstream; **MIDL is the neutral contract**; everything else is a
generated, never-hand-maintained consumer.

---

## A dashboard, by example

A 3-tile screen — a wind rose beside a stacked speed/depth column. The layout is
a nested split (`{1,{2,3}}`); each element binds a field to a SignalK path:

```yaml
midl: 1.0.0
screens:
  - id: dash
    elements:
      wind:  { type: windrose,     bindings: { value: { kind: signalk, path: environment.wind.speedApparent } } }
      sog:   { type: single-value, name: SOG,   format: { unit: kn }, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }
      depth: { type: single-value, name: DEPTH, format: { unit: m },  bindings: { value: { kind: signalk, path: environment.depth.belowTransducer } } }
    layout:
      dir: row
      children:
        - element: wind
        - dir: col
          children: [{ element: sog }, { element: depth }]
```

The same screen using a named **preset** macro instead of a hand-written tree:

```yaml
layout: { preset: hero-split, slots: [wind, sog, depth] }
```

### Responsive: one document, many resolutions

A screen carries a base layout plus optional **per-resolution-class variants**.
A 480×480 round display and an 800×480 landscape display can show the same
elements arranged differently — the manager resolves the document to the target
device's single class before delivery:

```yaml
screens:
  - id: dash
    elements: { wind: {…}, sog: {…}, depth: {…}, batt: {…} }
    layout: { preset: hero-split, slots: [wind, sog, depth] }   # base (square-480)
    variants:
      - class: landscape-800x480
        layout: { rows: 2, cols: 2, cells: [{element: wind}, {element: sog}, {element: depth}, {element: batt}] }
```

### Controls and alarms

Buttons/autopilot elements carry an **action**; alarms watch a source against
thresholds:

```yaml
elements:
  tack: { type: button, name: TACK, action: { kind: command, target: tack } }
alarms:
  - id: shallow
    source: { kind: signalk, path: environment.depth.belowTransducer }
    level: alarm
    lt: 3.0
    message: SHALLOW WATER
```

---

## The element catalog

The current catalog (generated from the firmware) — every renderer maps these to
its native painter:

| Element | Draws | Key bindings | Notes |
|---|---|---|---|
| `single-value` | big numeric + label | `value` | unit/precision/color |
| `text` | string (position, AP state) | `value` | |
| `gauge` | 270° arc + center % | `value` | `range`, `zones` |
| `bar` | horizontal fill | `value` | `range`, `zones` |
| `compass` | heading dial + markers | `value`, `dir` | glyph markers |
| `windrose` | apparent/true wind dial | `value`, `dir` | glyph markers |
| `trend` | rolling sparkline | `value` | |
| `autopilot` | state pill + nudge buttons | `value` | action |
| `button` | tap target | — | action |

Markers (on dials), glyphs, fonts, themes, and per-class tile/nesting limits are
all advertised by the device manifest.

## The layout grammar

A screen's layout is a recursive tree; **presets are macros** that expand to it:

```
node := { element: <id> }                                   leaf
      | { dir: row|col, children: [node, …], weights?: […] } split
      | { rows: N, cols: M, cells: [node, …] }              grid
      | { preset: <name>, slots: [<id>, …] }                macro
```

Presets cover the common shapes (`full`, `hero-split` = `{1,{2,3}}`, …) while
the raw tree lets power users compose anything within the device's limits.

## Data sources (not SignalK-only)

A binding's `source` can be:

| `kind` | Field | Use |
|---|---|---|
| `signalk` | `path` | live SignalK data (the default) |
| `local` | `id` | a device-local sensor / GPIO |
| `const` | `value` | a fixed literal |
| `computed` | `expr` | a derived value |

The manifest advertises which kinds (and named local sources) a target offers,
so the same pooled element can bind a SignalK path on one device and a local
sensor on another.

---

## Use cases it covers

- **Live dashboard authoring without reflashing** — edit a document, validate
  it, push it; the device re-renders. No firmware build in the loop.
- **Pre-flight validation against a real device** — before posting, check a
  document is admissible for *that* device at *its* resolution (supported
  elements, tile/depth limits, source kinds, action kinds). The manager does
  this with `@yey-boats/midl`; the device serves its manifest at
  `/api/midl/manifest`.
- **Multi-renderer parity** — the web preview, the firmware, and future
  clients render the same document. The web renderer is a live design surface;
  the firmware is the real instrument.
- **Responsive, multi-display fleets** — one document targets many resolution
  classes via variants; the manager resolves per device.
- **Safe schema evolution** — `MAJOR.MINOR.BUILD` with a migration registry, so
  a dashboard authored last season still loads, and breaking changes migrate.
- **Non-SignalK integration** — bind onboard sensors, constants, or computed
  values alongside SignalK paths.
- **Marine-specific instruments out of the box** — compass and wind-rose dials
  with steering/wind markers, gauges with zones, autopilot controls, and
  threshold alarms.

---

## Packages

| Path | What |
|---|---|
| `cpp/` | the element catalog (`include/yb_midl_catalog.h`, **source of truth**) + host generator/checker |
| `schemas/` | JSON Schemas (config + capabilities) and generated per-class manifests (`gen/`) |
| `ts/` | [`@yey-boats/midl`](ts) — the language core: validator, preset expansion, version compatibility + migrations |
| `web/` | web renderer — vanilla TypeScript + Canvas: layout solver + element painters + multi-resolution preview |
| `bindings/` | additional language bindings _(planned: Swift / Kotlin for mobile + watch)_ |

Consumed by **espdisp** (firmware), the **manager** plugin, and the
**simulator** as a git submodule.

## Validate a document

```ts
import { validateDocument } from "@yey-boats/midl";

const result = validateDocument(yamlOrJsonText, deviceManifest, "square-480");
if (!result.ok) {
  for (const issue of result.issues) console.error(`${issue.path}: ${issue.message}`);
}
```

`validateDocument` runs the full pipeline: manifest well-formedness → config
structural validity → version compatibility → capability satisfaction, returning
the first failing stage's path-addressed issues.

## A capability manifest (what a device advertises)

```jsonc
{
  "midl": "1.0.0",
  "board": "esp32-4848s040",
  "classes": [
    { "id": "square-480", "width": 480, "height": 480, "maxTiles": 4, "maxDepth": 3,
      "presets": ["full", "hero-split"],
      "elements": ["single-value", "text", "gauge", "bar", "compass", "windrose", "trend", "autopilot", "button"] }
  ],
  "elements": [ { "type": "compass", "bindings": ["value", "dir"], "glyphs": ["triangle", "diamond", …] }, … ],
  "sources": ["signalk"],
  "actionKinds": ["nav", "command"],
  "themes": ["day", "night", "high-contrast"],
  "fonts": [14, 20, 28, 48]
}
```

This is generated from the C++ catalog, embedded in the firmware, and served
verbatim — so it is always exactly what the hardware can render.

## Build & test

```sh
make gen-manifest     # C++ catalog -> schemas/gen/*.json
make check-catalog    # assert the catalog matches the firmware's painters
cd ts  && npx vitest run    # language-core tests + golden corpus
cd web && npx vite          # open the live preview at http://localhost:5173
```

## License

© 2026 Yey Boats Project. Source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE) — free for noncommercial use;
commercial use requires a separate license (see [COMMERCIAL.md](COMMERCIAL.md),
rights@yey.boats). Consistent with the rest of the Yey Boats project.
