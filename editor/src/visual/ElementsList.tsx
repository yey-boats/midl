// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { EditorModel, EditorElement } from "../model";

export interface ElementsListProps {
  model: EditorModel;
  onSelectCell: (cellIndex: number) => void;
  onRemoveElement: (elementId: string) => void;
}

// Small inline SVG icons keyed by element type
const TYPE_ICONS: Record<string, string> = {
  "single-value": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><text x="1" y="11" font-size="10" fill="currentColor" font-family="monospace">42</text></svg>`,
  "text": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><text x="1" y="11" font-size="10" fill="currentColor" font-family="sans-serif">T</text></svg>`,
  "gauge": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10 A5 5 0 0 1 12 10" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="7" y1="10" x2="10" y2="5" stroke="currentColor" stroke-width="1.2"/></svg>`,
  "bar": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="3" width="10" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="3" width="6" height="3" rx="1" fill="currentColor" opacity="0.7"/></svg>`,
  "compass": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="3" x2="7" y2="7" stroke="currentColor" stroke-width="1.5"/></svg>`,
  "windrose": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1"/><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1"/></svg>`,
  "trend": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="2,10 5,7 8,8 12,3" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>`,
  "autopilot": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>`,
  "button": `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="4" width="10" height="6" rx="2" stroke="currentColor" stroke-width="1.2"/></svg>`,
};

function getIcon(type: string): string {
  return TYPE_ICONS[type] ?? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.2"/></svg>`;
}

function getLabel(el: EditorElement): string {
  if (el.name) return el.name;
  const path = el.bindings?.["value"]?.path;
  if (path) {
    // Show the last segment for readability e.g. "navigation.speedOverGround" → "speedOverGround"
    const parts = path.split(".");
    return parts[parts.length - 1] ?? path;
  }
  return el.id;
}

export function ElementsList({ model, onSelectCell, onRemoveElement }: ElementsListProps): React.JSX.Element {
  const isGrid = "rows" in model.layout && "cols" in model.layout && "cells" in model.layout;

  if (!isGrid) {
    return (
      <div data-testid="elements-list" style={{ padding: "16px 12px", fontSize: "11px", color: "var(--ink-faint, #5b7286)" }}>
        No elements yet — add one from the Elements tab.
      </div>
    );
  }

  const cells = (model.layout as { cells: Array<{ element?: string }> }).cells;
  const placed: Array<{ cellIndex: number; el: EditorElement }> = [];
  for (let i = 0; i < cells.length; i++) {
    const elementId = cells[i].element;
    if (elementId && model.elements[elementId]) {
      placed.push({ cellIndex: i, el: model.elements[elementId]! });
    }
  }

  if (placed.length === 0) {
    return (
      <div data-testid="elements-list" style={{ padding: "16px 12px", fontSize: "11px", color: "var(--ink-faint, #5b7286)" }}>
        No elements yet — add one from the Elements tab.
      </div>
    );
  }

  return (
    <div
      data-testid="elements-list"
      style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}
    >
      {placed.map(({ cellIndex, el }) => (
        <div
          key={cellIndex}
          data-testid={`element-row-${cellIndex}`}
          onClick={() => onSelectCell(cellIndex)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "6px 10px",
            cursor: "pointer",
            borderBottom: "1px solid var(--line, #1d2b3a)",
          }}
        >
          {/* Type icon — content is always from the hardcoded TYPE_ICONS map above;
               no user-supplied data ever flows into __html, so XSS is not a concern. */}
          <span
            style={{ color: "var(--ink-dim, #8aa0b4)", flexShrink: 0, lineHeight: 0 }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: getIcon(el.type) }}
          />
          {/* Type badge */}
          <span style={{ fontSize: "9px", fontFamily: "monospace", color: "var(--ink-faint, #5b7286)", flexShrink: 0, opacity: 0.8 }}>
            {el.type}
          </span>
          {/* Label / name / path */}
          <span style={{ flex: 1, fontSize: "11px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {getLabel(el)}
          </span>
          {/* Cell position */}
          <span style={{ fontSize: "9px", color: "var(--ink-faint, #5b7286)", fontFamily: "monospace", flexShrink: 0 }}>
            [{cellIndex}]
          </span>
          {/* Remove button */}
          <button
            data-testid={`element-row-remove-${cellIndex}`}
            onClick={(e) => { e.stopPropagation(); onRemoveElement(el.id); }}
            style={{
              flexShrink: 0,
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "1px solid var(--line2, #24364a)",
              borderRadius: "3px",
              cursor: "pointer",
              color: "var(--ink-faint, #5b7286)",
              fontSize: "11px",
              lineHeight: 1,
              padding: 0,
            }}
            aria-label="Remove element"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
