// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { Manifest } from "@yey-boats/midl";
import type { Source } from "@yey-boats/midl";
import type { DataProvider } from "@yey-boats/midl-web";
import { formatValue } from "@yey-boats/midl-web";
import type { EditorModel, EditorElement, BindingSource } from "../model";
import { removeElement, setCellSpan } from "../layout-ops";
import { SIGNALK_CATALOG, applyCatalogDefaults, defaultDecimalsForUnit, RANGED_TYPES } from "../signalk-catalog";
import { PathPicker } from "./PathPicker";

export interface InspectorProps {
  model: EditorModel;
  selectedCell: number | null;
  manifest: Manifest;
  provider: DataProvider;
  onChange: (next: EditorModel) => void;
  onBrowseData?: () => void;  // NEW: fires when PathPicker "Browse data ▸" is clicked
}

const SPAN_OPTIONS = ["1x1", "1x2", "2x1", "2x2"] as const;
const COLOR_ROLE_OPTIONS = ["default", "accent", "warn"] as const;
const SCALE_OPTIONS = ["fixed", "metric"] as const;
const SIZE_ROLE_OPTIONS = ["S", "M", "L", "XL", "Fill"] as const;
type SizeRole = typeof SIZE_ROLE_OPTIONS[number];

// Zone color palette: theme tokens + common hex colors
const ZONE_COLOR_OPTIONS = [
  { label: "warn (amber)", value: "warn" },
  { label: "good (green)", value: "good" },
  { label: "accent (cyan)", value: "accent" },
  { label: "orange", value: "#e0a020" },
  { label: "red", value: "#e05040" },
  { label: "blue", value: "#4080e0" },
] as const;

interface ZoneEntry { lt: number; color: string; }

// ── Authoring constants for the action / dial sections ──────────────────────
const ACTION_KIND_OPTIONS = ["put", "command", "nav"] as const;
// Element types that carry an action (a tap target). Existing actions are also
// always editable regardless of type (see isActionType below).
const ACTION_TYPES = new Set(["button", "control", "autopilot"]);
// Dial element types that support markers / sectors / hull / shape.
const DIAL_TYPES = new Set(["compass", "windrose"]);
// The 10 MIDL dial glyphs (mirrors web/src/svg/glyphs.ts GLYPH_NAMES).
const MARKER_GLYPH_OPTIONS = [
  "triangle", "diamond", "circle", "bar", "cross",
  "chevron_in", "chevron_out", "chevron_left", "chevron_right", "chevron_double",
] as const;
// Marker / sector colours: theme tokens (resolved by the renderer) + hexes.
const MARKER_COLOR_OPTIONS = [
  { label: "accent (true wind / cyan)", value: "accent" },
  { label: "warn (apparent / amber)", value: "warn" },
  { label: "good (green)", value: "good" },
  { label: "danger (red)", value: "danger" },
  { label: "port (red)", value: "port" },
  { label: "starboard (green)", value: "starboard" },
  { label: "tide (blue)", value: "tide" },
] as const;
const DIAL_SHAPE_OPTIONS = ["round", "band"] as const;

interface MarkerEntry { glyph?: string; color?: string; dir?: BindingSource; kind?: string; [k: string]: unknown; }
interface SectorEntry { from: number; to: number; color: string; }
interface ActionEntry { kind: string; target?: string; value?: unknown; }

export function Inspector({ model, selectedCell, manifest, provider, onChange, onBrowseData }: InspectorProps): React.JSX.Element {
  // ── Grid-level controls ────────────────────────────────────────────────────
  // Grid sizing (rows/cols + presets) lives in the Layout tab in MidlEditor; the
  // Inspector no longer duplicates those controls.
  const isGrid = "rows" in model.layout && "cols" in model.layout && "cells" in model.layout;

  // ── Selected element ───────────────────────────────────────────────────────
  let selectedElementId: string | undefined;
  if (selectedCell !== null && isGrid) {
    const cells = (model.layout as { cells: Array<{ element?: string }> }).cells;
    selectedElementId = cells[selectedCell]?.element;
  }
  const selectedElement: EditorElement | undefined = selectedElementId
    ? model.elements[selectedElementId]
    : undefined;

  // ── Element-level edit helpers ─────────────────────────────────────────────

  function updateElement(updated: EditorElement) {
    onChange({ ...model, elements: { ...model.elements, [updated.id]: updated } });
  }

  function handlePathChange(path: string) {
    if (!selectedElement) return;
    // Always produce a clean signalk binding — do NOT spread currentBinding,
    // as that would let a non-signalk binding's `kind` field clobber the one
    // we are setting here, causing the path to be silently dropped later.
    const newBinding: BindingSource = { kind: "signalk", path };

    // ── #12: refresh stale label/unit on rebind ──────────────────────────────
    // When the element's current name/unit are still the PREVIOUS path's
    // catalog defaults (i.e. auto-derived, never hand-customized), clear them
    // so applyCatalogDefaults can repopulate them from the NEW path. We never
    // clobber a custom label/unit — only ones that exactly match the old default.
    const prevPath =
      selectedElement.bindings?.["value"]?.kind === "signalk"
        ? (selectedElement.bindings["value"].path ?? "")
        : "";
    const prevEntry = prevPath ? SIGNALK_CATALOG.find((e) => e.path === prevPath) : undefined;

    let base: EditorElement = { ...selectedElement };
    if (prevEntry && prevPath !== path) {
      // Name was auto-derived if it still equals the old path's label.
      if (base.name === prevEntry.label) {
        base = { ...base };
        delete base.name;
      }
      // Unit was auto-derived if it still equals the old path's unit.
      if (prevEntry.unit && base.format?.unit === prevEntry.unit) {
        const newFormat = { ...base.format };
        delete newFormat["unit"];
        // Decimals were derived from the (now-removed) default unit; let them be
        // re-derived too so they match the new path's unit.
        delete newFormat["decimals"];
        base = { ...base, format: newFormat };
      }
    }

    const updatedWithBinding: EditorElement = {
      ...base,
      bindings: { ...base.bindings, value: newBinding },
    };
    const catalogEntry = SIGNALK_CATALOG.find((e) => e.path === path);
    const finalElement = catalogEntry
      ? applyCatalogDefaults(updatedWithBinding, catalogEntry)
      : updatedWithBinding;
    updateElement(finalElement);
  }

  function handleNameChange(name: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, name });
  }

  function handleTypeChange(type: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, type });
  }

  function handleUnitChange(unit: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, format: { ...selectedElement.format, unit } });
  }

  function handleDecimalsChange(decimals: number) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, format: { ...selectedElement.format, decimals } });
  }

  function handleSpanChange(span: string) {
    if (!selectedElement) return;
    // "colsXrows" format: "1x2" → colSpan=1, rowSpan=2; "2x1" → colSpan=2, rowSpan=1; etc.
    const [colPart, rowPart] = span.split("x");
    const colSpan = parseInt(colPart ?? "1", 10) || 1;
    const rowSpan = parseInt(rowPart ?? "1", 10) || 1;
    // Keep element.style.span for backward-compat with style round-trips.
    const updatedElement = { ...selectedElement, style: { ...selectedElement.style, span } };
    if (selectedCell !== null && isGrid) {
      // Atomically adjust cells array: remove covered cells, restore freed ones.
      const modelWithSpan = setCellSpan(model, selectedCell, colSpan, rowSpan);
      onChange({
        ...modelWithSpan,
        elements: { ...modelWithSpan.elements, [selectedElement.id]: updatedElement },
      });
      return;
    }
    // Non-grid: just update element style.
    updateElement(updatedElement);
  }

  function handleSidedToggle() {
    if (!selectedElement) return;
    // The renderer reads `format.side` (model.ts: sideEnabled(el.format?.side)).
    // Write there, not to style.sided, so the toggle is not a no-op.
    const current = selectedElement.format?.side;
    const next = current ? undefined : "port-stbd";
    const newFormat = { ...selectedElement.format };
    if (next === undefined) {
      delete newFormat["side"];
    } else {
      newFormat["side"] = next;
    }
    // Also clean up any legacy style.sided written by old versions of the editor.
    const newStyle = { ...selectedElement.style };
    delete newStyle["sided"];
    updateElement({ ...selectedElement, format: newFormat, style: newStyle });
  }

  function handleColorRoleChange(colorRole: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, colorRole } });
  }

  function handleScaleChange(scale: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, scale } });
  }

  function handleSizeChange(sizeRole: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, size: sizeRole } });
  }

  function handleRemoveElement() {
    if (!selectedElementId) return;
    onChange(removeElement(model, selectedElementId));
  }

  // ── Limits (range + zones) handlers ───────────────────────────────────────

  function handleRangeMinChange(val: number) {
    if (!selectedElement) return;
    const current = selectedElement.style?.range as [number, number] | undefined;
    const hi = current?.[1] ?? 100;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, range: [val, hi] } });
  }

  function handleRangeMaxChange(val: number) {
    if (!selectedElement) return;
    const current = selectedElement.style?.range as [number, number] | undefined;
    const lo = current?.[0] ?? 0;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, range: [lo, val] } });
  }

  function handleZoneAdd() {
    if (!selectedElement) return;
    const currentZones = (selectedElement.style?.zones as ZoneEntry[] | undefined) ?? [];
    // Suggest a threshold just above the last one
    const lastLt = currentZones.length > 0 ? (currentZones[currentZones.length - 1]?.lt ?? 0) : 0;
    const newZone: ZoneEntry = { lt: lastLt + 10, color: "warn" };
    const sorted = [...currentZones, newZone].slice().sort((a, b) => a.lt - b.lt);
    updateElement({ ...selectedElement, style: { ...selectedElement.style, zones: sorted } });
  }

  function handleZoneLtChange(index: number, lt: number) {
    if (!selectedElement) return;
    const currentZones = (selectedElement.style?.zones as ZoneEntry[] | undefined) ?? [];
    const updated = currentZones.map((z, i) => i === index ? { ...z, lt } : z);
    const sorted = updated.slice().sort((a, b) => a.lt - b.lt);
    updateElement({ ...selectedElement, style: { ...selectedElement.style, zones: sorted } });
  }

  function handleZoneColorChange(index: number, color: string) {
    if (!selectedElement) return;
    const currentZones = (selectedElement.style?.zones as ZoneEntry[] | undefined) ?? [];
    const updated = currentZones.map((z, i) => i === index ? { ...z, color } : z);
    updateElement({ ...selectedElement, style: { ...selectedElement.style, zones: updated } });
  }

  function handleZoneRemove(index: number) {
    if (!selectedElement) return;
    const currentZones = (selectedElement.style?.zones as ZoneEntry[] | undefined) ?? [];
    const updated = currentZones.filter((_, i) => i !== index);
    updateElement({ ...selectedElement, style: { ...selectedElement.style, zones: updated } });
  }

  // ── Secondary-binding handler (B2) ─────────────────────────────────────────
  // Generic per-key binding setter. An empty path removes the binding so the key
  // is not serialized as a dangling signalk source.
  function handleBindingPathChange(key: string, path: string) {
    if (!selectedElement) return;
    const bindings = { ...selectedElement.bindings };
    if (path) {
      bindings[key] = { kind: "signalk", path };
    } else {
      delete bindings[key];
    }
    updateElement({ ...selectedElement, bindings });
  }

  // ── Action handlers (B1) ───────────────────────────────────────────────────
  function handleActionAdd() {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, action: { kind: "put" } as ActionEntry });
  }

  function handleActionPatch(patch: Partial<ActionEntry>) {
    if (!selectedElement) return;
    const current = (selectedElement.action as ActionEntry | undefined) ?? { kind: "put" };
    updateElement({ ...selectedElement, action: { ...current, ...patch } });
  }

  function handleActionValueChange(raw: string) {
    if (!selectedElement) return;
    const current = (selectedElement.action as ActionEntry | undefined) ?? { kind: "put" };
    const next: ActionEntry = { ...current };
    if (raw === "") {
      delete next.value;
    } else {
      next.value = raw;
    }
    updateElement({ ...selectedElement, action: next });
  }

  function handleActionRemove() {
    if (!selectedElement) return;
    const next: EditorElement = { ...selectedElement };
    delete next.action;
    updateElement(next);
  }

  // ── Dial marker handlers (B3) ──────────────────────────────────────────────
  function handleMarkerAdd() {
    if (!selectedElement) return;
    const markers = (selectedElement.markers as MarkerEntry[] | undefined) ?? [];
    const next: MarkerEntry = { glyph: "triangle", color: "accent", kind: "rim" };
    updateElement({ ...selectedElement, markers: [...markers, next] });
  }

  function handleMarkerPatch(index: number, patch: Partial<MarkerEntry>) {
    if (!selectedElement) return;
    const markers = (selectedElement.markers as MarkerEntry[] | undefined) ?? [];
    const updated = markers.map((mk, i) => (i === index ? { ...mk, ...patch } : mk));
    updateElement({ ...selectedElement, markers: updated });
  }

  function handleMarkerDirPathChange(index: number, path: string) {
    if (!selectedElement) return;
    const markers = (selectedElement.markers as MarkerEntry[] | undefined) ?? [];
    const updated = markers.map((mk, i) => {
      if (i !== index) return mk;
      const copy = { ...mk };
      if (path) copy.dir = { kind: "signalk", path };
      else delete copy.dir;
      return copy;
    });
    updateElement({ ...selectedElement, markers: updated });
  }

  function handleMarkerRemove(index: number) {
    if (!selectedElement) return;
    const markers = (selectedElement.markers as MarkerEntry[] | undefined) ?? [];
    updateElement({ ...selectedElement, markers: markers.filter((_, i) => i !== index) });
  }

  // ── Dial sector handlers (B3) ──────────────────────────────────────────────
  function handleSectorAdd() {
    if (!selectedElement) return;
    const sectors = (selectedElement.style?.sectors as SectorEntry[] | undefined) ?? [];
    const next: SectorEntry = { from: -30, to: 30, color: "port" };
    updateElement({ ...selectedElement, style: { ...selectedElement.style, sectors: [...sectors, next] } });
  }

  function handleSectorPatch(index: number, patch: Partial<SectorEntry>) {
    if (!selectedElement) return;
    const sectors = (selectedElement.style?.sectors as SectorEntry[] | undefined) ?? [];
    const updated = sectors.map((s, i) => (i === index ? { ...s, ...patch } : s));
    updateElement({ ...selectedElement, style: { ...selectedElement.style, sectors: updated } });
  }

  function handleSectorRemove(index: number) {
    if (!selectedElement) return;
    const sectors = (selectedElement.style?.sectors as SectorEntry[] | undefined) ?? [];
    const updated = sectors.filter((_, i) => i !== index);
    updateElement({ ...selectedElement, style: { ...selectedElement.style, sectors: updated } });
  }

  function handleHullToggle() {
    if (!selectedElement) return;
    const current = Boolean(selectedElement.style?.hull);
    const newStyle = { ...selectedElement.style };
    if (current) delete newStyle["hull"];
    else newStyle["hull"] = true;
    updateElement({ ...selectedElement, style: newStyle });
  }

  function handleShapeChange(shape: string) {
    if (!selectedElement) return;
    const newStyle = { ...selectedElement.style };
    if (shape === "round") delete newStyle["shape"]; // round is the default
    else newStyle["shape"] = shape;
    updateElement({ ...selectedElement, style: newStyle });
  }

  // ── Empty states ───────────────────────────────────────────────────────────
  if (selectedCell === null) {
    return (
      <div data-component="inspector">
        <p>Select a cell to inspect its element.</p>
      </div>
    );
  }

  if (!selectedElement) {
    return (
      <div data-component="inspector">
        <p>No element assigned to this cell.</p>
      </div>
    );
  }

  // ── Derive live value ──────────────────────────────────────────────────────
  const valuePath =
    selectedElement.bindings?.["value"]?.kind === "signalk"
      ? (selectedElement.bindings["value"].path ?? "")
      : "";

  const liveResult = valuePath
    ? provider.getValue({ kind: "signalk", path: valuePath } as Source)
    : null;

  const livePresent = liveResult?.present === true && liveResult?.stale !== true;
  const effectiveFormat: Record<string, unknown> = {
    ...selectedElement.format,
  };
  if (typeof effectiveFormat.decimals !== "number") {
    const unit = effectiveFormat.unit as string | undefined;
    effectiveFormat.decimals = defaultDecimalsForUnit(unit);
  }
  const liveDisplay = livePresent
    ? formatValue(liveResult!.value, effectiveFormat, liveResult!.sourceUnit).text
    : "—";

  const elementTypes = manifest.elements.map((e) => e.type);

  // Derive currentSpan from the grid cell's colSpan/rowSpan (authoritative after parseMidl).
  // Fall back to element.style.span only for non-grid layouts.
  let currentSpan: string;
  if (selectedCell !== null && isGrid) {
    const cells = (model.layout as { cells: Array<{ colSpan?: number; rowSpan?: number }> }).cells;
    const cell = cells[selectedCell];
    const cs = cell?.colSpan ?? 1;
    const rs = cell?.rowSpan ?? 1;
    currentSpan = `${cs}x${rs}`;
  } else {
    currentSpan = String(selectedElement.style?.span ?? "1x1");
  }
  // currentSided reflects format.side (what the renderer reads), not style.sided.
  const currentSided = Boolean(selectedElement.format?.side);
  const currentColorRole = String(selectedElement.style?.colorRole ?? "default");
  const currentScale = String(selectedElement.style?.scale ?? "fixed");
  // Derive current size role. String roles (S/M/L/XL/Fill) are used as-is.
  // Legacy numeric sizes are mapped to the nearest role for display.
  const rawSize = selectedElement?.style?.size;
  let currentSizeRole: SizeRole;
  if (typeof rawSize === "string" && (SIZE_ROLE_OPTIONS as readonly string[]).includes(rawSize)) {
    currentSizeRole = rawSize as SizeRole;
  } else {
    // Default: show L (whether rawSize is a legacy number or undefined).
    currentSizeRole = "L";
  }

  // ── LIMITS section values ─────────────────────────────────────────────────
  const isRangedType = RANGED_TYPES.has(selectedElement.type);
  const currentRange = selectedElement.style?.range as [number, number] | undefined;
  const rangeMin = currentRange?.[0] ?? 0;
  const rangeMax = currentRange?.[1] ?? 100;
  const currentZones = (selectedElement.style?.zones as ZoneEntry[] | undefined) ?? [];
  const currentUnit = selectedElement.format?.unit as string | undefined;

  // ── Secondary-binding values (B2) ──────────────────────────────────────────
  // Extra binding keys (beyond "value") declared by the manifest for this element
  // type — e.g. compass/windrose declare ["value","dir"]. Fall back to ["dir"]
  // for dial types so the picker shows even with the preview fallback manifest.
  const cap = manifest.elements.find((e) => e.type === selectedElement.type);
  let extraBindingKeys = (cap?.bindings ?? []).filter((k) => k !== "value");
  if (extraBindingKeys.length === 0 && DIAL_TYPES.has(selectedElement.type)) {
    extraBindingKeys = ["dir"];
  }
  // #11: does this element type require a `value` binding? (the manifest declares
  // a "value" binding for it). When it does and the path is unbound, show a CTA.
  const requiresValueBinding = (cap?.bindings ?? []).includes("value");

  // ── Action values (B1) ─────────────────────────────────────────────────────
  const currentAction = selectedElement.action as ActionEntry | undefined;
  const isActionType = ACTION_TYPES.has(selectedElement.type) || currentAction !== undefined;
  const actionKind = String(currentAction?.kind ?? "put");
  const actionTarget = String(currentAction?.target ?? "");
  const actionValue = currentAction?.value === undefined ? "" : String(currentAction.value);

  // ── Dial values (B3) ───────────────────────────────────────────────────────
  const isDialType = DIAL_TYPES.has(selectedElement.type);
  const currentMarkers = (selectedElement.markers as MarkerEntry[] | undefined) ?? [];
  const currentSectors = (selectedElement.style?.sectors as SectorEntry[] | undefined) ?? [];
  const currentHull = Boolean(selectedElement.style?.hull);
  const currentShape = String(selectedElement.style?.shape ?? "round");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div data-component="inspector">
      {/* Inspector header — the element Type is now a real, visible select (#4). */}
      <div data-section="inspector-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "10px 12px", borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <span style={{ fontWeight: 600 }}>Inspector</span>
        <select
          className="inspector-type-select"
          data-testid="type-select"
          value={selectedElement.type}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          {elementTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
      </div>

      {/* ── BINDING section ─────────────────────────────────────── */}
      <div data-section="insp-section-binding" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <div style={{ padding: "8px 12px 6px" }}>
          <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Binding</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div>
            <div style={{ fontSize: "0.77em", marginBottom: "3px", opacity: 0.7 }}>SignalK Path</div>
            <PathPicker
              value={valuePath}
              manifest={manifest}
              provider={provider}
              onChange={handlePathChange}
              onBrowse={onBrowseData}
            />
          </div>
          {/* #11: prominent inline CTA when a binding-requiring element is unbound. */}
          {requiresValueBinding && !valuePath && onBrowseData && (
            <button
              className="bind-cta"
              data-testid="bind-cta"
              onClick={onBrowseData}
            >
              Pick a data path
            </button>
          )}
          {/* B2: secondary bindings (e.g. compass/windrose `dir` direction pointer) */}
          {extraBindingKeys.map((key) => {
            const b = selectedElement.bindings?.[key];
            const keyPath = b?.kind === "signalk" ? (b.path ?? "") : "";
            return (
              <div key={key} data-testid={`binding-${key}`}>
                <div style={{ fontSize: "0.77em", marginBottom: "3px", opacity: 0.7, textTransform: "capitalize" }}>
                  {key === "dir" ? "Direction path" : `${key} path`}
                </div>
                <PathPicker
                  value={keyPath}
                  manifest={manifest}
                  provider={provider}
                  onChange={(p) => handleBindingPathChange(key, p)}
                  onBrowse={onBrowseData}
                />
              </div>
            );
          })}
          {/* Live value readout */}
          <div
            data-testid="live-readout"
            style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}
          >
            <div data-testid="live-value-readout" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              {livePresent ? (
                <>
                  <span
                    data-testid="live-dot"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--online, oklch(0.72 0.15 155))",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span data-testid="live-value-text" style={{ fontFamily: "monospace", fontSize: "0.85em" }}>
                    {liveDisplay}
                  </span>
                </>
              ) : liveResult?.present === true && liveResult?.stale === true ? (
                <>
                  <span
                    data-testid="live-dot"
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--drift, oklch(0.80 0.13 75))", display: "inline-block", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: "0.82em", opacity: 0.7 }}>stale</span>
                </>
              ) : (
                <>
                  <span
                    data-testid="live-dot"
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink-faint, #5b7286)", display: "inline-block", flexShrink: 0, opacity: 0.5 }}
                  />
                  <span style={{ fontSize: "0.82em", opacity: 0.5 }}>no data</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── DISPLAY section ─────────────────────────────────────── */}
      <div data-section="insp-section-display" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <div style={{ padding: "8px 12px 6px" }}>
          <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Display</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Label</span>
            <input
              data-testid="label-input"
              type="text"
              value={selectedElement.name ?? ""}
              onChange={(e) => handleNameChange(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Unit</span>
            <input
              data-testid="unit-input"
              type="text"
              value={String(selectedElement.format?.unit ?? "")}
              onChange={(e) => handleUnitChange(e.target.value)}
              style={{ width: "52px" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Decimals</span>
            <input
              data-testid="decimals-input"
              type="number"
              value={String(selectedElement.format?.decimals ?? "")}
              onChange={(e) => handleDecimalsChange(Number(e.target.value))}
              style={{ width: "52px" }}
            />
          </div>
        </div>
      </div>

      {/* ── LAYOUT section ──────────────────────────────────────── */}
      <div data-section="insp-section-layout" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <div style={{ padding: "8px 12px 6px" }}>
          <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Layout</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Span</span>
            <select
              data-testid="span-select"
              value={currentSpan}
              onChange={(e) => handleSpanChange(e.target.value)}
              style={{ flex: 1 }}
            >
              {SPAN_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7 }}>Sided</span>
            <button
              data-testid="sided-toggle"
              role="switch"
              aria-checked={currentSided}
              onClick={handleSidedToggle}
              style={{
                width: "30px",
                height: "16px",
                borderRadius: "8px",
                background: currentSided ? "var(--accent, #57c7d8)" : "var(--elev, #12202f)",
                border: "1px solid",
                borderColor: currentSided ? "var(--accent, #57c7d8)" : "var(--line2, #24364a)",
                cursor: "pointer",
                position: "relative",
                padding: 0,
              }}
            >
              <span style={{
                position: "absolute",
                top: "2px",
                left: currentSided ? "14px" : "2px",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
                display: "block",
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── APPEARANCE section ───────────────────────────────────── */}
      <div data-section="insp-section-appearance" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <div style={{ padding: "8px 12px 6px" }}>
          <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Appearance</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Color</span>
            <select
              data-testid="color-role-select"
              value={currentColorRole}
              onChange={(e) => handleColorRoleChange(e.target.value)}
              style={{ flex: 1 }}
            >
              {COLOR_ROLE_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Scale</span>
            <select
              data-testid="scale-select"
              value={currentScale}
              onChange={(e) => handleScaleChange(e.target.value)}
              style={{ flex: 1 }}
            >
              {SCALE_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Size</span>
            <select
              data-testid="size-select"
              value={currentSizeRole}
              onChange={(e) => handleSizeChange(e.target.value)}
              style={{ flex: 1 }}
            >
              {SIZE_ROLE_OPTIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
          </div>
        </div>
      </div>

      {/* ── LIMITS section (gauge / bar only) ───────────────────────── */}
      {isRangedType && (
        <div data-section="insp-section-limits" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
          <div style={{ padding: "8px 12px 6px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>
              Limits
            </span>
            {currentUnit && (
              <span style={{ fontSize: "0.75em", opacity: 0.45 }}>{currentUnit}</span>
            )}
          </div>
          <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
            {/* Range row */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Range</span>
              <input
                data-testid="range-min"
                type="number"
                value={rangeMin}
                onChange={(e) => handleRangeMinChange(Number(e.target.value))}
                style={{ width: "60px" }}
              />
              <span style={{ fontSize: "0.77em", opacity: 0.5 }}>–</span>
              <input
                data-testid="range-max"
                type="number"
                value={rangeMax}
                onChange={(e) => handleRangeMaxChange(Number(e.target.value))}
                style={{ width: "60px" }}
              />
            </div>
            {/* Zone rows */}
            {currentZones.map((zone, i) => (
              <div key={i} data-testid={`zone-row-${i}`} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "0.77em", opacity: 0.5, minWidth: "20px" }}>lt</span>
                <input
                  data-testid={`zone-lt-${i}`}
                  type="number"
                  value={zone.lt}
                  onChange={(e) => handleZoneLtChange(i, Number(e.target.value))}
                  style={{ width: "60px" }}
                />
                <select
                  data-testid={`zone-color-${i}`}
                  value={zone.color}
                  onChange={(e) => handleZoneColorChange(i, e.target.value)}
                  style={{ flex: 1, fontSize: "0.77em" }}
                >
                  {ZONE_COLOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                  {/* If current value not in palette, show it verbatim */}
                  {!ZONE_COLOR_OPTIONS.some((opt) => opt.value === zone.color) && (
                    <option value={zone.color}>{zone.color}</option>
                  )}
                </select>
                <button
                  className="btn-ghost"
                  data-testid={`zone-remove-${i}`}
                  onClick={() => handleZoneRemove(i)}
                >
                  ×
                </button>
              </div>
            ))}
            {/* Add zone button */}
            <div>
              <button className="btn-ghost" data-testid="zone-add" onClick={handleZoneAdd}>
                + Add zone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTION section (B1) — button / control / autopilot or existing action ─ */}
      {isActionType && (
        <div data-section="insp-section-action" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
          <div style={{ padding: "8px 12px 6px" }}>
            <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Action</span>
          </div>
          <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
            {currentAction === undefined ? (
              <button className="btn-ghost" data-testid="action-add" onClick={handleActionAdd}>
                + Add action
              </button>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Kind</span>
                  <select
                    data-testid="action-kind"
                    value={actionKind}
                    onChange={(e) => handleActionPatch({ kind: e.target.value })}
                    style={{ flex: 1 }}
                  >
                    {ACTION_KIND_OPTIONS.map((k) => (<option key={k} value={k}>{k}</option>))}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>
                    {actionKind === "nav" ? "Screen" : "Target"}
                  </span>
                  <input
                    data-testid="action-target"
                    type="text"
                    value={actionTarget}
                    placeholder={actionKind === "nav" ? "screen id" : "signalk path"}
                    onChange={(e) => handleActionPatch({ target: e.target.value })}
                    style={{ flex: 1 }}
                  />
                </div>
                {actionKind === "put" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Value</span>
                    <input
                      data-testid="action-value"
                      type="text"
                      value={actionValue}
                      placeholder="e.g. auto"
                      onChange={(e) => handleActionValueChange(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>
                )}
                <div>
                  <button className="btn-ghost" data-testid="action-remove" onClick={handleActionRemove}>
                    Remove action
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── DIAL section (B3) — markers / sectors / hull / shape (compass, windrose) ─ */}
      {isDialType && (
        <div data-section="insp-section-dial" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
          <div style={{ padding: "8px 12px 6px" }}>
            <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Dial</span>
          </div>
          <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
            {/* Shape + hull */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Shape</span>
              <select
                data-testid="dial-shape"
                value={currentShape}
                onChange={(e) => handleShapeChange(e.target.value)}
                style={{ flex: 1 }}
              >
                {DIAL_SHAPE_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.77em", opacity: 0.7 }}>Hull</span>
              <button
                data-testid="dial-hull-toggle"
                role="switch"
                aria-checked={currentHull}
                onClick={handleHullToggle}
                style={{
                  width: "30px", height: "16px", borderRadius: "8px",
                  background: currentHull ? "var(--accent, #57c7d8)" : "var(--elev, #12202f)",
                  border: "1px solid",
                  borderColor: currentHull ? "var(--accent, #57c7d8)" : "var(--line2, #24364a)",
                  cursor: "pointer", position: "relative", padding: 0,
                }}
              >
                <span style={{
                  position: "absolute", top: "2px", left: currentHull ? "14px" : "2px",
                  width: "10px", height: "10px", borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s", display: "block",
                }} />
              </button>
            </div>

            {/* Markers */}
            <div style={{ fontSize: "0.74em", opacity: 0.6, marginTop: "3px" }}>Markers</div>
            {currentMarkers.map((mk, i) => {
              const dirPath = mk.dir?.kind === "signalk" ? (mk.dir.path ?? "") : "";
              return (
                <div key={i} data-testid={`marker-row-${i}`} style={{ display: "flex", flexDirection: "column", gap: "3px", border: "1px solid var(--line2, #24364a)", borderRadius: "4px", padding: "5px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <select
                      data-testid={`marker-glyph-${i}`}
                      value={String(mk.glyph ?? "triangle")}
                      onChange={(e) => handleMarkerPatch(i, { glyph: e.target.value })}
                      style={{ flex: 1, fontSize: "0.77em" }}
                    >
                      {MARKER_GLYPH_OPTIONS.map((g) => (<option key={g} value={g}>{g}</option>))}
                    </select>
                    <select
                      data-testid={`marker-color-${i}`}
                      value={String(mk.color ?? "accent")}
                      onChange={(e) => handleMarkerPatch(i, { color: e.target.value })}
                      style={{ flex: 1, fontSize: "0.77em" }}
                    >
                      {MARKER_COLOR_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                      {!MARKER_COLOR_OPTIONS.some((c) => c.value === mk.color) && mk.color && (
                        <option value={String(mk.color)}>{String(mk.color)}</option>
                      )}
                    </select>
                    <button className="btn-ghost" data-testid={`marker-remove-${i}`} onClick={() => handleMarkerRemove(i)}>×</button>
                  </div>
                  <PathPicker
                    value={dirPath}
                    manifest={manifest}
                    provider={provider}
                    onChange={(p) => handleMarkerDirPathChange(i, p)}
                    onBrowse={onBrowseData}
                  />
                </div>
              );
            })}
            <div>
              <button className="btn-ghost" data-testid="marker-add" onClick={handleMarkerAdd}>+ Add marker</button>
            </div>

            {/* Sectors */}
            <div style={{ fontSize: "0.74em", opacity: 0.6, marginTop: "3px" }}>Sectors</div>
            {currentSectors.map((s, i) => (
              <div key={i} data-testid={`sector-row-${i}`} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <input
                  data-testid={`sector-from-${i}`}
                  type="number"
                  value={s.from}
                  onChange={(e) => handleSectorPatch(i, { from: Number(e.target.value) })}
                  style={{ width: "48px" }}
                />
                <span style={{ fontSize: "0.77em", opacity: 0.5 }}>→</span>
                <input
                  data-testid={`sector-to-${i}`}
                  type="number"
                  value={s.to}
                  onChange={(e) => handleSectorPatch(i, { to: Number(e.target.value) })}
                  style={{ width: "48px" }}
                />
                <select
                  data-testid={`sector-color-${i}`}
                  value={s.color}
                  onChange={(e) => handleSectorPatch(i, { color: e.target.value })}
                  style={{ flex: 1, fontSize: "0.77em" }}
                >
                  {MARKER_COLOR_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  {!MARKER_COLOR_OPTIONS.some((c) => c.value === s.color) && (
                    <option value={s.color}>{s.color}</option>
                  )}
                </select>
                <button className="btn-ghost" data-testid={`sector-remove-${i}`} onClick={() => handleSectorRemove(i)}>×</button>
              </div>
            ))}
            <div>
              <button className="btn-ghost" data-testid="sector-add" onClick={handleSectorAdd}>+ Add sector</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove element */}
      <div style={{ padding: "10px 12px" }}>
        <button className="btn-danger" data-testid="remove-element" onClick={handleRemoveElement}>
          Remove element
        </button>
      </div>
    </div>
  );
}
