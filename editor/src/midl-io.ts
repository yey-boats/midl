// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { parseDoc, toYaml, toCanonicalJson } from "@yey-boats/midl";
import type { ConfigDoc, Screen, Element, Source, Node, Variant } from "@yey-boats/midl";
import {
  EditorModel,
  EditorElement,
  EditorVariant,
  LayoutNode,
  BindingSource,
  EditorError,
} from "./model";

// ── Parsing (ConfigDoc → EditorModel) ─────────────────────────────────────────

function sourceToBinding(src: Source): BindingSource {
  // Source is a discriminated union; spread safely by kind.
  switch (src.kind) {
    case "signalk":
      return { kind: "signalk", path: src.path };
    case "local":
      return { kind: "local", id: src.id };
    case "const":
      return { kind: "const", value: src.value };
    case "computed":
      return { kind: "computed", expr: src.expr };
    default: {
      // Forward-compat: preserve unknown kinds verbatim.
      const fallback = src as Record<string, unknown>;
      return { kind: fallback["kind"] as BindingSource["kind"], ...fallback };
    }
  }
}

function elementToEditorElement(id: string, el: Element): EditorElement {
  const out: EditorElement = { id, type: el.type };
  if (el.name !== undefined) out.name = el.name;
  if (el.bindings !== undefined) {
    out.bindings = {};
    for (const [k, v] of Object.entries(el.bindings)) {
      out.bindings[k] = sourceToBinding(v);
    }
  }
  if (el.format !== undefined) out.format = { ...el.format };
  if (el.style !== undefined) out.style = { ...el.style };
  if (el.markers !== undefined) out.markers = el.markers;
  if (el.action !== undefined) out.action = el.action;
  if (el.zoom !== undefined) out.zoom = el.zoom;
  if (el.meta !== undefined) out.meta = { ...(el.meta as Record<string, unknown>) };
  return out;
}

function nodeToLayoutNode(node: Node): LayoutNode {
  // Node is a discriminated union from types.ts:
  //   { element: string }
  //   { flow: "row"|"col"; children: Node[]; weights?: number[] }
  //   { rows: number; cols: number; cells: Node[] }
  //   { preset: string; slots?: string[] }
  const n = node as Record<string, unknown>;
  if ("element" in n) {
    return { element: n["element"] as string };
  }
  if ("flow" in n) {
    const children = (n["children"] as Node[]).map(nodeToLayoutNode);
    const result: { flow: "row" | "col"; children: LayoutNode[]; weights?: number[] } = {
      flow: n["flow"] as "row" | "col",
      children,
    };
    if (n["weights"] !== undefined) result.weights = n["weights"] as number[];
    return result;
  }
  if ("rows" in n) {
    const cells = (n["cells"] as Node[]).map((c) => {
      const cell = c as Record<string, unknown>;
      const gc: import("./model").GridCell = {};
      if ("element" in cell) gc.element = cell["element"] as string;
      if (typeof cell["colSpan"] === "number" && cell["colSpan"] !== 1) gc.colSpan = cell["colSpan"] as number;
      if (typeof cell["rowSpan"] === "number" && cell["rowSpan"] !== 1) gc.rowSpan = cell["rowSpan"] as number;
      return gc;
    });
    return { rows: n["rows"] as number, cols: n["cols"] as number, cells };
  }
  if ("preset" in n) {
    const result: { preset: string; slots?: string[] } = { preset: n["preset"] as string };
    if (n["slots"] !== undefined) result.slots = n["slots"] as string[];
    return result;
  }
  // Fallback: return verbatim cast
  return n as unknown as LayoutNode;
}

// Known top-level screen keys defined by the ConfigDoc/Screen type.
// Any key NOT in this set is treated as "extra" and preserved verbatim.
const KNOWN_SCREEN_KEYS = new Set([
  "id",
  "title",
  "meta",
  "elements",
  "layout",
  "variants",
]);

function screenToEditorModel(doc: ConfigDoc, screen: Screen): EditorModel {
  const elements: Record<string, EditorElement> = {};
  for (const [id, el] of Object.entries(screen.elements)) {
    elements[id] = elementToEditorElement(id, el);
  }

  const layout = nodeToLayoutNode(screen.layout);

  const variants: EditorVariant[] = (screen.variants ?? []).map((v: Variant) => ({
    class: v.class,
    layout: nodeToLayoutNode(v.layout),
  }));

  // Determine where the title lives and what its value is.
  let title: string;
  let titleLoc: "screen" | "meta" | "id";
  if (screen.title !== undefined) {
    title = screen.title;
    titleLoc = "screen";
  } else if (screen.meta?.title !== undefined) {
    title = screen.meta.title;
    titleLoc = "meta";
  } else {
    title = screen.id;
    titleLoc = "id";
  }

  const model: EditorModel = {
    midl: doc.midl,
    screenId: screen.id,
    title,
    titleLoc,
    elements,
    layout,
    variants,
  };
  if (doc.meta !== undefined) {
    model.docMeta = { ...(doc.meta as Record<string, unknown>) };
  }
  // Preserve all screen-level meta fields beyond title so they survive round-trips.
  if (screen.meta !== undefined) {
    const { title: _title, ...rest } = screen.meta as Record<string, unknown>;
    if (Object.keys(rest).length > 0) {
      model.screenMeta = rest;
    }
  }
  // Preserve unknown top-level screen fields (e.g. _note) verbatim.
  const screenRaw = screen as unknown as Record<string, unknown>;
  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(screenRaw)) {
    if (!KNOWN_SCREEN_KEYS.has(key)) {
      extra[key] = screenRaw[key];
    }
  }
  if (Object.keys(extra).length > 0) {
    model.screenExtra = extra;
  }
  return model;
}

// ── parseMidl ─────────────────────────────────────────────────────────────────

export function parseMidl(source: string): EditorModel {
  const doc = parseDoc(source) as ConfigDoc;

  if (!doc.screens || doc.screens.length !== 1) {
    throw new EditorError(
      `parseMidl: expected exactly 1 screen, got ${doc.screens?.length ?? 0}`
    );
  }

  return screenToEditorModel(doc, doc.screens[0]);
}

// ── Serialization (EditorModel → ConfigDoc) ───────────────────────────────────

function bindingToSource(b: BindingSource): Source {
  switch (b.kind) {
    case "signalk":
      return { kind: "signalk", path: b.path! };
    case "local":
      return { kind: "local", id: b.id! };
    case "const":
      return { kind: "const", value: b.value };
    case "computed":
      return { kind: "computed", expr: b.expr };
    default: {
      // Forward-compat: return verbatim
      return b as unknown as Source;
    }
  }
}

function layoutNodeToNode(node: LayoutNode): Node {
  const n = node as Record<string, unknown>;
  if ("element" in n) return { element: n["element"] as string } as Node;
  if ("flow" in n) {
    const children = (n["children"] as LayoutNode[]).map(layoutNodeToNode);
    const result: Record<string, unknown> = { flow: n["flow"], children };
    if (n["weights"] !== undefined) result["weights"] = n["weights"];
    return result as unknown as Node;
  }
  if ("rows" in n) {
    const cells = (n["cells"] as Array<import("./model").GridCell>).map((c) => {
      const out: Record<string, unknown> = {};
      if (c.element !== undefined) out["element"] = c.element;
      if (c.colSpan !== undefined && c.colSpan !== 1) out["colSpan"] = c.colSpan;
      if (c.rowSpan !== undefined && c.rowSpan !== 1) out["rowSpan"] = c.rowSpan;
      return out as unknown as Node;
    });
    return { rows: n["rows"] as number, cols: n["cols"] as number, cells } as unknown as Node;
  }
  if ("preset" in n) {
    const result: Record<string, unknown> = { preset: n["preset"] };
    if (n["slots"] !== undefined) result["slots"] = n["slots"];
    return result as unknown as Node;
  }
  return n as unknown as Node;
}

function editorElementToElement(el: EditorElement): Element {
  const out: Element = { type: el.type };
  if (el.name !== undefined) out.name = el.name;
  if (el.bindings !== undefined) {
    const converted: Record<string, import("@yey-boats/midl").Source> = {};
    for (const [k, v] of Object.entries(el.bindings)) {
      converted[k] = bindingToSource(v);
    }
    if (Object.keys(converted).length > 0) out.bindings = converted;
  }
  if (el.format !== undefined && Object.keys(el.format).length > 0) out.format = { ...el.format };
  if (el.style !== undefined && Object.keys(el.style).length > 0) out.style = { ...el.style };
  if (el.markers !== undefined) out.markers = el.markers as import("@yey-boats/midl").Marker[];
  if (el.action !== undefined) out.action = el.action as import("@yey-boats/midl").Action;
  if (el.zoom !== undefined) out.zoom = el.zoom;
  if (el.meta !== undefined) out.meta = el.meta as import("@yey-boats/midl").Meta;
  return out;
}

function editorModelToConfigDoc(model: EditorModel): ConfigDoc {
  const elements: Record<string, Element> = {};
  for (const [id, el] of Object.entries(model.elements)) {
    elements[id] = editorElementToElement(el);
  }

  // Build the base screen object.
  const screenBase: Record<string, unknown> = { id: model.screenId };

  // Write title back to the SAME location it was read from. Never relocate.
  const titleLoc = model.titleLoc ?? "meta"; // default to meta for backwards compat
  if (titleLoc === "screen") {
    screenBase["title"] = model.title;
  }

  // Rebuild meta — only include if we have a meta-located title or extra meta fields.
  if (titleLoc === "meta" || model.screenMeta !== undefined) {
    const meta: Record<string, unknown> = { ...(model.screenMeta ?? {}) };
    if (titleLoc === "meta") {
      meta["title"] = model.title;
    }
    screenBase["meta"] = meta;
  }

  // Restore unknown top-level screen fields verbatim.
  if (model.screenExtra !== undefined) {
    for (const [k, v] of Object.entries(model.screenExtra)) {
      screenBase[k] = v;
    }
  }

  screenBase["elements"] = elements;
  screenBase["layout"] = layoutNodeToNode(model.layout);

  if (model.variants.length > 0) {
    screenBase["variants"] = model.variants.map((v) => ({
      class: v.class,
      layout: layoutNodeToNode(v.layout),
    }));
  }

  const screen = screenBase as unknown as Screen;

  const doc: ConfigDoc = {
    midl: model.midl,
    screens: [screen],
  };

  if (model.docMeta !== undefined) {
    doc.meta = model.docMeta as import("@yey-boats/midl").Meta;
  }

  return doc;
}

// ── serializeMidl ─────────────────────────────────────────────────────────────

export function serializeMidl(model: EditorModel, fmt: "yaml" | "json" = "yaml"): string {
  const doc = editorModelToConfigDoc(model);
  return fmt === "json" ? toCanonicalJson(doc) : toYaml(doc);
}
