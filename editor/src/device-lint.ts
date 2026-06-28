// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Device capability lint.
//
// The web preview (the SVG renderer) is far richer than what actually reaches a
// boat display. The push pipeline projects MIDL → v2 via `midlToV2`
// (Instruments-manager/lib/midl-adapter.js), which carries only `type`, `path`
// (bindings.value), `unit` (format.unit) and `title` (name) per element, plus a
// flat grid layout. Everything else — zones, range, markers, sectors, hull,
// band shape, secondary bindings, colour/size roles, actions, flow/preset
// layouts and variants — is SILENTLY dropped or degraded on the device.
//
// This lint inspects an EditorModel and reports, per authored feature, what the
// device will not render, so the author is warned instead of surprised. It is
// advisory: nothing here blocks a save. It is intentionally model-only (no
// firmware path whitelist) — path coverage is the manifest/capability pass's job.
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

function lintElement(id: string, el: EditorElement, issues: DeviceLintIssue[]): void {
  const style = (el.style ?? {}) as Record<string, unknown>;
  const format = (el.format ?? {}) as Record<string, unknown>;

  if (el.type === "trend") {
    issues.push({ elementId: id, feature: "trend", kind: "degrade",
      message: `"${id}": the device shows the value as a plain number — the sparkline/history is not rendered.` });
  }

  if (Array.isArray(el.markers) && el.markers.length > 0) {
    issues.push({ elementId: id, feature: "markers", kind: "drop",
      message: `"${id}": ${el.markers.length} authored marker(s) are dropped — the device uses its built-in compass/windrose markers only.` });
  }

  if (Array.isArray(style.sectors) && (style.sectors as unknown[]).length > 0) {
    issues.push({ elementId: id, feature: "sectors", kind: "drop",
      message: `"${id}": dial sectors (no-go / layline arcs) are not drawn on the device.` });
  }

  if (style.hull) {
    issues.push({ elementId: id, feature: "hull", kind: "drop",
      message: `"${id}": the hull silhouette is not drawn on the device.` });
  }

  if (style.shape === "band") {
    issues.push({ elementId: id, feature: "shape=band", kind: "degrade",
      message: `"${id}": the rolling heading-band shape renders as a plain round dial on the device.` });
  }

  if (Array.isArray(style.zones) && (style.zones as unknown[]).length > 0) {
    issues.push({ elementId: id, feature: "zones", kind: "drop",
      message: `"${id}": threshold colour zones are dropped — the device shows a single fixed colour (no warn/danger colouring).` });
  }

  if (Array.isArray(style.range)) {
    issues.push({ elementId: id, feature: "range", kind: "degrade",
      message: `"${id}": the authored gauge/bar range is dropped — the device uses a fixed per-metric scale, so the fill fraction may differ.` });
  }

  if (style.colorRole !== undefined || style.color !== undefined) {
    issues.push({ elementId: id, feature: "color", kind: "drop",
      message: `"${id}": the colour override is dropped — the device draws every tile in its single accent colour.` });
  }

  if (typeof style.size === "string") {
    issues.push({ elementId: id, feature: "size", kind: "drop",
      message: `"${id}": the size role is dropped — the device picks the font size from the tile geometry.` });
  }

  if (format.side) {
    issues.push({ elementId: id, feature: "format.side", kind: "drop",
      message: `"${id}": the port/starboard suffix is not author-controllable on the device (it is hardcoded per metric).` });
  }

  if (el.bindings) {
    const extra = Object.keys(el.bindings).filter((k) => k !== "value");
    if (extra.length > 0) {
      issues.push({ elementId: id, feature: "secondary-binding", kind: "drop",
        message: `"${id}": the ${extra.join(", ")} binding(s) are dropped — the device only consumes the primary value binding.` });
    }
  }

  if (el.action !== undefined) {
    issues.push({ elementId: id, feature: "action", kind: "drop",
      message: `"${id}": the action is dropped — tapping this element does nothing on the device (autopilot buttons are firmware-defined).` });
  }
}

// Manifest-authoritative checks: things the device CLASS does not support at all
// (distinct from the push-pipeline drops above, which apply regardless of class).
// These only run when a manifest is supplied.
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

    // Binding keys the class does not declare (beyond the dropped-by-push note).
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

/**
 * Inspect a model and return the authored features that the device push pipeline
 * (`midlToV2` → firmware) will drop or degrade. `maxTiles` is the device class's
 * tile cap (default 4); excess tiles are silently truncated on the device.
 *
 * When `manifest` is supplied, additional manifest-authoritative checks run
 * (element type / binding / glyph / marker-count / action-kind support for the
 * device class) — these describe what the class cannot render at all, distinct
 * from the push-pipeline drops which apply regardless of class.
 */
export function lintDeviceCapabilities(model: EditorModel, maxTiles = 4, manifest?: Manifest): DeviceLintIssue[] {
  const issues: DeviceLintIssue[] = [];

  for (const [id, el] of Object.entries(model.elements)) {
    lintElement(id, el, issues);
  }

  // Layout-level: non-grid base layout, tile overflow, and variants.
  if (!isGrid(model.layout)) {
    issues.push({ feature: "layout", kind: "drop",
      message: `The base layout is a flow/preset layout — the device only renders a flat grid, so this layout is not reproduced on the device.` });
  } else {
    const tiles = countTiles(model.layout);
    if (tiles > maxTiles) {
      issues.push({ feature: "tile-overflow", kind: "drop",
        message: `${tiles} tiles authored but the device shows at most ${maxTiles} — the extra tile(s) are dropped.` });
    }
  }

  if (model.variants && model.variants.length > 0) {
    issues.push({ feature: "variants", kind: "degrade",
      message: `Per-class variant layouts are not selected by the device — it renders whatever layout is pushed, regardless of its screen class.` });
  }

  if (manifest) lintAgainstManifest(model, manifest, issues);

  return issues;
}
