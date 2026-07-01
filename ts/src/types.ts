// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

export interface MidlVersion { major: number; minor: number; build: number; }

// Optional descriptive metadata carried at document/screen/element level.
// Informational only — renderers and firmware ignore it; it powers library
// search and agent selection of dashboards. Additive and backward-compatible.
export interface Meta {
  title?: string;
  description?: string;
  useCase?: string;
  agentNotes?: string;
  tags?: string[];
}

export type Source =
  | { kind: "signalk"; path: string }
  | { kind: "local"; id: string }
  | { kind: "const"; value: unknown }
  | { kind: "computed"; expr?: string };

export interface Action { kind: "put" | "nav" | "command"; target?: string; value?: unknown; }

// A dial marker (compass/windrose). All fields optional and additive — the
// firmware/renderer ignore unknown ones. `glyph` selects the marker shape,
// `color` a theme token or `#rrggbb`, `dir` a data source whose value gives
// the marker's bow-relative angle, and `kind` distinguishes a rim marker
// (default) from a center vector (e.g. tide/current). The index signature is
// retained for forward-compat so unrecognized keys remain admissible.
export interface Marker {
  glyph?: string;
  color?: string;
  dir?: Source;
  kind?: "rim" | "vector";
  [k: string]: unknown;
}

// Optional visual-style keys understood by the SVG renderer. `style` stays a
// free-form Record (so this is purely documentation; no field is required and
// older docs validate unchanged). The renderer-understood keys are:
//   - range?: [lo, hi]    Gauge/bar value limits in DISPLAY units (post-format).
//                         Fill fraction = (value-lo)/(hi-lo). Semantic pass
//                         requires hi > lo.
//   - zones?: Array<{ lt: number; color: string }>
//       Threshold colour bands for gauge/bar/value: "value < lt -> color"
//       (evaluated low->high), `lt` in display units. A final band with `lt`
//       at/above the range max is the idiomatic top-bucket sentinel.
//   - size?: 'S'|'M'|'L'|'XL'|'Fill' | number   Hero font-size role (auto-fit)
//                         or a literal pixel size (legacy).
//   - color?: string      Accent override: a theme token or `#rrggbb`.
//   - colorRole?: string  Alias for `color` (theme token) also read by renderer.
//   - scale?: 'fixed' | 'metric'   Value scaling mode.
//   - sectors?: Array<{ from: number; to: number; color: string }>
//       Bow-relative angular sectors on a dial (close-hauled / no-go zones).
//       `color` is a theme token or `#rrggbb`. Edges may be data-bound via the
//       element's `bindings` for dynamic laylines.
//   - hull?: boolean      Draw a boat-hull silhouette in the dial center.
//   - shape?: 'round' | 'band'   Dial geometry; default 'round'. 'band' renders
//                                a rolling heading-band compass.
//   - center?: number     Center-zero reference for a `bar` (XTE cross-track
//                         needle); fraction is drawn as deviation around it.
// And the optional formatting keys understood by the renderer:
//   - format.unit?: string     Display unit; value is converted to it + suffixed.
//   - format.decimals?: number Fixed decimal places (`precision` is an alias).
//   - format.side?: boolean    Format a signed angle as magnitude + side suffix
//                             (e.g. 42 -> "42S", -42 -> "42P").
// NOTE: the device push pipeline (midlToV2 -> firmware) currently carries only
// type/path/unit/title; the editor's device-capability lint flags style/format
// keys (and markers/action/dir) that will not reach a given device.
export interface Element {
  type: string;
  name?: string;
  meta?: Meta;
  bindings?: Record<string, Source>;
  // Free-form visual style. See the doc comment above for the optional
  // renderer-understood keys `sectors`, `hull`, `shape`, `center`.
  style?: Record<string, unknown>;
  // Free-form value formatting. See above for the optional `side` key.
  format?: Record<string, unknown>;
  markers?: Marker[];
  action?: Action;
  zoom?: string;
}

export type Node =
  | { element: string; colSpan?: number; rowSpan?: number }
  | { flow: "row" | "col"; children: Node[]; weights?: number[] }
  | { rows: number; cols: number; cells: Node[] }
  | { preset: string; slots?: string[] }
  | { colSpan?: number; rowSpan?: number };   // spacer: no element/flow/rows/preset

export interface Variant { class: string; layout: Node; }

export interface Screen {
  id: string;
  title?: string;
  meta?: Meta;
  elements: Record<string, Element>;
  layout: Node;
  variants?: Variant[];
}

export interface ConfigDoc {
  midl: string;
  meta?: Meta;
  settings?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  screens: Screen[];
  alarms?: unknown[];
  presets?: Record<string, unknown>;
}

export interface DeviceClass {
  id: string;
  width?: number;
  height?: number;
  maxTiles: number;
  maxDepth: number;
  presets?: string[];
  elements?: string[];
}

// Per-element-type capability declaration for a device class. This describes
// what the firmware CAN render for an element type; it is the device's declared
// surface, NOT what the editor→device push pipeline (midlToV2) currently carries
// (which is narrower — only type/path/unit/title survive that bottleneck).
export interface ElementCap {
  type: string;
  // Binding keys this element type accepts (e.g. compass/windrose: ["value","dir"]).
  bindings?: string[];
  // Style/format attribute names the device class honours (e.g. gauge:
  // ["range","zones","color","size","unit","center"]). Used by the editor's
  // capability lint to tell "unsupported by this class" from "dropped by push".
  attrs?: string[];
  // Display units the device can convert/label for this element type.
  units?: string[];
  // Marker glyphs this element type can render.
  glyphs?: string[];
}

export interface Manifest {
  midl: string;
  firmwareVersion?: string;
  board: string;
  classes: DeviceClass[];
  elements: ElementCap[];
  sources?: string[];
  actionKinds?: string[];
  presets?: string[];
  fonts?: number[];
  themes?: string[];
  // Marker glyphs supported across dials (top-level fallback list).
  glyphs?: string[];
  // Maximum authored markers a single dial can render on this device.
  maxMarkersPerDial?: number;
}

// An issue surfaced by a validation pass. `severity` distinguishes hard
// errors (default) from advisory warnings — a config with only warnings is
// still admissible. Omitting `severity` means "error" for backwards
// compatibility with callers that test `issues.length`.
export interface Issue { path: string; message: string; severity?: "error" | "warning"; }
