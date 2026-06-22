// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { Manifest } from "@yey-boats/midl";
import type { DataProvider } from "@yey-boats/midl-web";
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

export function Inspector({ model, selectedCell, manifest, provider, onChange }: InspectorProps): React.JSX.Element {
  // ── Grid-level controls (always visible for grid layouts) ─────────────────
  const isGrid = "rows" in model.layout && "cols" in model.layout && "cells" in model.layout;

  function handleAddRow() {
    onChange(addRow(model));
  }

  function handleAddCol() {
    onChange(addCol(model));
  }

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

  // ── Determine selected element ────────────────────────────────────────────
  let selectedElementId: string | undefined;
  if (selectedCell !== null && isGrid) {
    const cells = (model.layout as { cells: Array<{ element?: string }> }).cells;
    selectedElementId = cells[selectedCell]?.element;
  }
  const selectedElement: EditorElement | undefined = selectedElementId
    ? model.elements[selectedElementId]
    : undefined;

  // ── Element-level edit helpers ────────────────────────────────────────────

  function updateElement(updated: EditorElement) {
    onChange({
      ...model,
      elements: { ...model.elements, [updated.id]: updated },
    });
  }

  function handlePathChange(path: string) {
    if (!selectedElement) return;
    const currentBinding = selectedElement.bindings?.["value"];
    const newBinding: BindingSource = {
      kind: "signalk",
      ...currentBinding,
      path,
    };
    updateElement({
      ...selectedElement,
      bindings: { ...selectedElement.bindings, value: newBinding },
    });
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

  function handleRemoveElement() {
    if (!selectedElementId) return;
    onChange(removeElement(model, selectedElementId));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const gridControls = isGrid ? (
    <div data-section="grid-controls" style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
      <button data-testid="add-row" onClick={handleAddRow}>Add row</button>
      <button data-testid="add-col" onClick={handleAddCol}>Add col</button>
      <button data-testid="remove-row" onClick={handleRemoveRow}>Remove row</button>
      <button data-testid="remove-col" onClick={handleRemoveCol}>Remove col</button>
    </div>
  ) : null;

  // Empty states
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

  const valuePath =
    selectedElement.bindings?.["value"]?.kind === "signalk"
      ? (selectedElement.bindings["value"].path ?? "")
      : "";

  const elementTypes = manifest.elements.map((e) => e.type);

  return (
    <div data-component="inspector">
      {gridControls}

      <div data-section="element-props" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {/* Type */}
        <label>
          Type
          <select
            data-testid="type-select"
            value={selectedElement.type}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            {elementTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        {/* Name */}
        <label>
          Name
          <input
            data-testid="name-input"
            type="text"
            value={selectedElement.name ?? ""}
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </label>

        {/* SignalK path */}
        <label>
          Path
          <PathPicker
            value={valuePath}
            manifest={manifest}
            provider={provider}
            onChange={handlePathChange}
          />
        </label>

        {/* Unit */}
        <label>
          Unit
          <input
            data-testid="unit-input"
            type="text"
            value={String(selectedElement.format?.unit ?? "")}
            onChange={(e) => handleUnitChange(e.target.value)}
          />
        </label>

        {/* Decimals */}
        <label>
          Decimals
          <input
            data-testid="decimals-input"
            type="number"
            value={String(selectedElement.format?.decimals ?? "")}
            onChange={(e) => handleDecimalsChange(Number(e.target.value))}
          />
        </label>

        {/* Remove element */}
        <button data-testid="remove-element" onClick={handleRemoveElement}>
          Remove element
        </button>
      </div>
    </div>
  );
}
