// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { Manifest } from "@yey-boats/midl";
import type { Source } from "@yey-boats/midl";
import type { DataProvider } from "@yey-boats/midl-web";
import { formatValue } from "@yey-boats/midl-web";
import type { EditorModel, EditorElement, BindingSource } from "../model";
import { addRow, addCol, removeRow, removeCol, removeElement } from "../layout-ops";
import { PathPicker } from "./PathPicker";

export interface InspectorProps {
  model: EditorModel;
  selectedCell: number | null;
  manifest: Manifest;
  provider: DataProvider;
  onChange: (next: EditorModel) => void;
}

const SPAN_OPTIONS = ["1x1", "1x2", "2x1", "2x2"] as const;
const COLOR_ROLE_OPTIONS = ["default", "accent", "warn"] as const;
const SCALE_OPTIONS = ["fixed", "metric"] as const;

export function Inspector({ model, selectedCell, manifest, provider, onChange }: InspectorProps): React.JSX.Element {
  // ── Grid-level controls ────────────────────────────────────────────────────
  const isGrid = "rows" in model.layout && "cols" in model.layout && "cells" in model.layout;

  function handleAddRow() { onChange(addRow(model)); }
  function handleAddCol() { onChange(addCol(model)); }

  function handleRemoveRow() {
    if (!isGrid) return;
    const g = model.layout as { rows: number; cols: number; cells: unknown[] };
    if (g.rows > 1) onChange(removeRow(model, g.rows - 1));
  }

  function handleRemoveCol() {
    if (!isGrid) return;
    const g = model.layout as { rows: number; cols: number; cells: unknown[] };
    if (g.cols > 1) onChange(removeCol(model, g.cols - 1));
  }

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
    updateElement({ ...selectedElement, bindings: { ...selectedElement.bindings, value: newBinding } });
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
    // Updated element: keep element.style.span for backward-compat / round-trip.
    const updatedElement = { ...selectedElement, style: { ...selectedElement.style, span } };
    // If in a grid, also write colSpan/rowSpan onto the grid cell for GridCanvas overlay.
    if (selectedCell !== null && isGrid) {
      const g = model.layout as { rows: number; cols: number; cells: import("../model").GridCell[] };
      const newCells = g.cells.map((c, i) => {
        if (i !== selectedCell) return { ...c };
        const updated = { ...c };
        if (colSpan === 1) delete updated.colSpan; else updated.colSpan = colSpan;
        if (rowSpan === 1) delete updated.rowSpan; else updated.rowSpan = rowSpan;
        return updated;
      });
      onChange({
        ...model,
        elements: { ...model.elements, [selectedElement.id]: updatedElement },
        layout: { ...g, cells: newCells },
      });
      return;
    }
    // Non-grid: just update the element style.
    updateElement(updatedElement);
  }

  function handleSidedToggle() {
    if (!selectedElement) return;
    const current = selectedElement.style?.sided;
    const next = current ? undefined : "P";
    const newStyle = { ...selectedElement.style };
    if (next === undefined) {
      delete newStyle["sided"];
    } else {
      newStyle["sided"] = next;
    }
    updateElement({ ...selectedElement, style: newStyle });
  }

  function handleColorRoleChange(colorRole: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, colorRole } });
  }

  function handleScaleChange(scale: string) {
    if (!selectedElement) return;
    updateElement({ ...selectedElement, style: { ...selectedElement.style, scale } });
  }

  function handleRemoveElement() {
    if (!selectedElementId) return;
    onChange(removeElement(model, selectedElementId));
  }

  // ── Grid controls ──────────────────────────────────────────────────────────
  const gridControls = isGrid ? (
    <div data-section="grid-controls" style={{ display: "flex", gap: "4px", flexWrap: "wrap", padding: "8px 12px" }}>
      <button data-testid="add-row" onClick={handleAddRow}>Add row</button>
      <button data-testid="add-col" onClick={handleAddCol}>Add col</button>
      <button data-testid="remove-row" onClick={handleRemoveRow}>Remove row</button>
      <button data-testid="remove-col" onClick={handleRemoveCol}>Remove col</button>
    </div>
  ) : null;

  // ── Empty states ───────────────────────────────────────────────────────────
  if (selectedCell === null) {
    return (
      <div data-component="inspector">
        {gridControls}
        <p>Select a cell to inspect its element.</p>
      </div>
    );
  }

  if (!selectedElement) {
    return (
      <div data-component="inspector">
        {gridControls}
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
  const liveDisplay = livePresent
    ? formatValue(
        liveResult!.value,
        selectedElement.format as Record<string, unknown> | undefined,
        liveResult!.sourceUnit,
      ).text
    : "—";

  const elementTypes = manifest.elements.map((e) => e.type);

  const currentSpan = String(selectedElement.style?.span ?? "1x1");
  const currentSided = Boolean(selectedElement.style?.sided);
  const currentColorRole = String(selectedElement.style?.colorRole ?? "default");
  const currentScale = String(selectedElement.style?.scale ?? "fixed");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div data-component="inspector">
      {/* Inspector header */}
      <div data-section="inspector-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <span style={{ fontWeight: 600 }}>Inspector</span>
        <span data-testid="type-badge" style={{ fontSize: "0.85em", opacity: 0.7 }}>
          {selectedElement.type}
        </span>
      </div>

      {gridControls}

      {/* Type select (kept hidden for backward-compat with tests that use data-testid="type-select") */}
      <div style={{ padding: "0 12px 8px", display: "none" }}>
        <label>
          Type
          <select
            data-testid="type-select"
            value={selectedElement.type}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            {elementTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </label>
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
            />
          </div>
          {/* Live value readout */}
          <div data-testid="live-value-readout" style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
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

      {/* ── DISPLAY section ─────────────────────────────────────── */}
      <div data-section="insp-section-display" style={{ borderBottom: "1px solid var(--line, #1d2b3a)" }}>
        <div style={{ padding: "8px 12px 6px" }}>
          <span style={{ fontSize: "0.75em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6 }}>Display</span>
        </div>
        <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: "7px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.77em", opacity: 0.7, minWidth: "56px" }}>Label</span>
            <input
              data-testid="name-input"
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
        </div>
      </div>

      {/* Remove element */}
      <div style={{ padding: "10px 12px" }}>
        <button data-testid="remove-element" onClick={handleRemoveElement}>
          Remove element
        </button>
      </div>
    </div>
  );
}
