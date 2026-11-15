// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Device capability lint.
//
// The boat display renders MIDL natively (instruments: midl_render/midl_solve;
// the MIDL->v2 projection is gone since the MIDL-only change, 2026-11-15). What a
// device class can draw is declared by its capability manifest
// (schemas/gen/yb-midl-capabilities.<class>.json): element types, binding keys,
// per-type attrs, glyphs, marker cap, action kinds, presets, tile cap.
//
// This lint checks an EditorModel against that manifest and reports, per
// authored feature, what the device will not render, so the author is warned
// instead of surprised. It is advisory: nothing here blocks a save. Without a
// manifest only the tile cap is checked: there is nothing else to judge by.
import type { Manifest } from "@yey-boats/midl";
import type { EditorModel, EditorElement, LayoutNode } from "./model";

export interface DeviceLintIssue {
  elementId?: string;
  feature: string;
  // "drop" → the feature produces nothing on the device.
  // "degrade" → the element still renders but loses fidelity.
  kind: "drop" | "degrade";
  message: string;
}

function isGrid(n: LayoutNode): n is { rows: number; cols: number; cells: { element?: string }[] } {
  return typeof n === "object" && n !== null && "rows" in n && "cols" in n && "cells" in n;
}

// Count the leaf element placements a layout node would yield (grid cells with an
// element, flow children, a preset's slots, a bare element node).
function countTiles(n: LayoutNode): number {
  if (isGrid(n)) return n.cells.filter((c) => c && c.element).length;
  if ("flow" in n) return (n.children ?? []).reduce((sum, c) => sum + countTiles(c), 0);
  if ("preset" in n) return (n.slots ?? []).length;
  if ("element" in n) return 1;
  return 0;
}

// Authored style/format keys and the manifest attr that declares support.
const STYLE_ATTRS: Array<[string, string]> = [
  ["zones", "zones"], ["range", "range"], ["sectors", "sectors"], ["hull", "hull"],
  ["shape", "shape"], ["color", "color"], ["colorRole", "color"], ["size", "size"],
];

function present(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return false;
  return !(Array.isArray(v) && v.length === 0);
}

// Manifest-authoritative checks: what the device class does not support.
function lintAgainstManifest(model: EditorModel, manifest: Manifest, issues: DeviceLintIssue[]): void {
  const capByType = new Map(manifest.elements.map((c) => [c.type, c]));
  const knownTypes = manifest.elements.length > 0;
  const actionKinds = manifest.actionKinds;
  const topGlyphs = manifest.glyphs;
  const maxMarkers = manifest.maxMarkersPerDial;

  for (const [id, el] of Object.entries(model.elements)) {
    const cap = capByType.get(el.type);

    if (knownTypes && !cap) {
      issues.push({ elementId: id, feature: "type", kind: "drop",
        message: `"${id}": element type "${el.type}" is not supported by this device class.` });
      continue; // further per-attr checks need a cap
    }

    // Authored style/format attrs the type does not declare for this class.
    if (cap?.attrs) {
      const style = (el.style ?? {}) as Record<string, unknown>;
      const format = (el.format ?? {}) as Record<string, unknown>;
      const seen = new Set<string>();
      for (const [key, attr] of STYLE_ATTRS) {
        if (present(style[key]) && !cap.attrs.includes(attr) && !seen.has(attr)) {
          seen.add(attr);
          issues.push({ elementId: id, feature: attr, kind: "drop",
            message: `"${id}": style.${key} is not drawn for "${el.type}" on this device class.` });
        }
      }
      if (present(format.side) && !cap.attrs.includes("side")) {
        issues.push({ elementId: id, feature: "side", kind: "drop",
          message: `"${id}": the port/starboard suffix (format.side) is not shown for "${el.type}" on this device class.` });
      }
    }

    // Binding keys the class does not declare.
    if (el.bindings && cap?.bindings) {
      for (const key of Object.keys(el.bindings)) {
        if (!cap.bindings.includes(key)) {
          issues.push({ elementId: id, feature: "binding", kind: "drop",
            message: `"${id}": the "${key}" binding is not a supported binding for "${el.type}" on this device class.` });
        }
      }
    }

    // Marker glyphs outside the device glyph set, and marker count over the cap.
    if (Array.isArray(el.markers) && el.markers.length > 0) {
      const allowed = cap?.glyphs && cap.glyphs.length > 0 ? cap.glyphs : topGlyphs;
      if (allowed && allowed.length > 0) {
        for (const mk of el.markers as Array<{ glyph?: string }>) {
          if (mk.glyph && !allowed.includes(mk.glyph)) {
            issues.push({ elementId: id, feature: "glyph", kind: "degrade",
              message: `"${id}": marker glyph "${mk.glyph}" is not in this device's glyph set; it falls back to a default shape.` });
          }
        }
      }
      if (typeof maxMarkers === "number" && el.markers.length > maxMarkers) {
        issues.push({ elementId: id, feature: "marker-overflow", kind: "drop",
          message: `"${id}": ${el.markers.length} markers authored but this device renders at most ${maxMarkers} per dial.` });
      }
    }

    // Action kind unsupported by the class.
    const action = el.action as { kind?: string } | undefined;
    if (action?.kind && Array.isArray(actionKinds) && actionKinds.length > 0 && !actionKinds.includes(action.kind)) {
      issues.push({ elementId: id, feature: "action-kind", kind: "drop",
        message: `"${id}": action kind "${action.kind}" is not supported by this device class (supported: ${actionKinds.join(", ")}).` });
    }
  }
}

function presetsIn(n: LayoutNode, out: string[]): string[] {
  if (typeof n !== "object" || n === null) return out;
  if ("preset" in n && typeof n.preset === "string") out.push(n.preset);
  if ("flow" in n) for (const c of n.children ?? []) presetsIn(c, out);
  return out;
}

/**
 * Inspect a model and return the authored features the device will drop or
 * degrade. `maxTiles` is the device class's tile cap (the manifest's
 * `classes[].maxTiles`); tiles past it are not shown.
 *
 * When `manifest` is supplied, the element type / binding / attr / glyph /
 * marker-count / action-kind / preset support of the device class is checked.
 */
export function lintDeviceCapabilities(model: EditorModel, maxTiles = 4, manifest?: Manifest): DeviceLintIssue[] {
  const issues: DeviceLintIssue[] = [];

  const tiles = countTiles(model.layout);
  if (tiles > maxTiles) {
    issues.push({ feature: "tile-overflow", kind: "drop",
      message: `${tiles} tiles authored but the device shows at most ${maxTiles} — the extra tile(s) are dropped.` });
  }

  if (manifest) {
    lintAgainstManifest(model, manifest, issues);
    const known = manifest.presets;
    if (Array.isArray(known) && known.length > 0) {
      for (const p of presetsIn(model.layout, [])) {
        if (!known.includes(p)) {
          issues.push({ feature: "preset", kind: "drop",
            message: `The "${p}" preset layout is not available on this device class (available: ${known.join(", ")}).` });
        }
      }
    }
  }

  return issues;
}
