// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// Binding source — mirrors ConfigDoc's Source union (types.ts).
export interface BindingSource {
  kind: "signalk" | "local" | "const" | "computed";
  path?: string;
  id?: string;
  value?: unknown;
  expr?: string;
}

// Flat projection of a ConfigDoc Element.
export interface EditorElement {
  id: string;
  type: string;
  name?: string;
  bindings?: Record<string, BindingSource>;
  format?: Record<string, unknown>;
  style?: Record<string, unknown>;
  markers?: unknown[];
  action?: unknown;
  zoom?: string;
  meta?: Record<string, unknown>;
}

// Cell in a grid layout — may be empty or reference an element by id.
export interface GridCell {
  element?: string;
}

// Mirrors the Node union from types.ts for grid cells.
// A non-grid layout (flow/preset) is stored verbatim as `raw`.
export type LayoutNode =
  | { rows: number; cols: number; cells: GridCell[] }
  | { flow: "row" | "col"; children: LayoutNode[]; weights?: number[] }
  | { element: string }
  | { preset: string; slots?: string[] };

// Convenience alias used in the task spec.
// When the screen's layout is a grid ({rows, cols, cells}), this shape holds.
export interface GridLayout {
  rows: number;
  cols: number;
  cells: GridCell[];
}

export interface EditorVariant {
  class: string;
  // Full layout node — may be a grid or a flow depending on the source document.
  layout: LayoutNode;
}

export interface EditorModel {
  midl: string;
  // Document-level meta block (ConfigDoc.meta) — preserved verbatim for lossless round-trips.
  // Absent when the source document has no top-level meta.
  docMeta?: {
    title?: string;
    description?: string;
    useCase?: string;
    agentNotes?: string;
    tags?: string[];
    [k: string]: unknown;
  };
  screenId: string;
  title: string;
  // Screen-level meta fields beyond title (e.g. useCase, description, agentNotes).
  // Preserved verbatim for lossless round-trips. Absent when the screen has no extra meta.
  screenMeta?: Record<string, unknown>;
  elements: Record<string, EditorElement>;
  // The screen's default layout node (grid or flow).
  layout: LayoutNode;
  variants: EditorVariant[];
}

export class EditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorError";
  }
}
