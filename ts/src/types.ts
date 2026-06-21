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
// older docs validate unchanged), but the marine-instrument additions are:
//   - sectors?: Array<{ from: number; to: number; color: string }>
//       Bow-relative angular sectors on a dial (close-hauled / no-go zones).
//       `color` is a theme token or `#rrggbb`. Edges may be data-bound via the
//       element's `bindings` for dynamic laylines.
//   - hull?: boolean      Draw a boat-hull silhouette in the dial center.
//   - shape?: 'round' | 'band'   Dial geometry; default 'round'. 'band' renders
//                                a rolling heading-band compass.
//   - center?: number     Center-zero reference for a `bar` (XTE cross-track
//                         needle); fraction is drawn as deviation around it.
// And the optional formatting key understood by the renderer:
//   - format.side?: boolean   Format a signed angle as magnitude + side suffix
//                             (e.g. 42 -> "42S", -42 -> "42P").
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
  | { element: string }
  | { flow: "row" | "col"; children: Node[]; weights?: number[] }
  | { rows: number; cols: number; cells: Node[] }
  | { preset: string; slots?: string[] };

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

export interface ElementCap {
  type: string;
  bindings?: string[];
  attrs?: string[];
  units?: string[];
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
}

// An issue surfaced by a validation pass. `severity` distinguishes hard
// errors (default) from advisory warnings — a config with only warnings is
// still admissible. Omitting `severity` means "error" for backwards
// compatibility with callers that test `issues.length`.
export interface Issue { path: string; message: string; severity?: "error" | "warning"; }
