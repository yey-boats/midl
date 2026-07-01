// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { EditorModel } from "../model";

export interface GridCanvasProps {
  model: EditorModel;
  viewport: { w: number; h: number };
  selected: number | null;
  onSelect: (cellIndex: number) => void;
}

export function GridCanvas({ model, viewport: _viewport, selected, onSelect }: GridCanvasProps): React.JSX.Element {
  const [hovered, setHovered] = React.useState<number | null>(null);
  const layout = model.layout;

  // Guard: only render the grid overlay when layout is a grid. Flow/preset
  // layouts have no editable cells here — they are edited in Source mode. We
  // render nothing interactive (the canvas banner explains why) rather than
  // throwing, so the preview still shows underneath.
  if (!("rows" in layout) || !("cols" in layout) || !("cells" in layout)) {
    const kind = "preset" in layout ? "preset" : "flow" in layout ? "flow" : "non-grid";
    return (
      <div data-component="grid-canvas" data-layout-kind={kind} />
    );
  }

  const { rows, cols, cells } = layout as { rows: number; cols: number; cells: Array<{ element?: string; colSpan?: number; rowSpan?: number }> };
  const cellW = 100 / cols;
  const cellH = 100 / rows;

  return (
    <div
      data-component="grid-canvas"
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {cells.map((cell, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const leftPct = col * cellW;
        const topPct = row * cellH;
        const colSpan = cell.colSpan ?? 1;
        const rowSpan = cell.rowSpan ?? 1;
        const widthPct = cellW * colSpan;
        const heightPct = cellH * rowSpan;

        const isSelected = i === selected;
        const isHovered = i === hovered;
        const isEmpty = !cell.element;
        // Friendly label: prefer the element's name, fall back to its type, then
        // its id — never show a raw UUID as the primary text.
        const el = cell.element ? model.elements[cell.element] : undefined;
        const label = el?.name || el?.type || cell.element || "";

        // Border: when selected, the CSS `.is-selected` ring takes over, so we
        // emit no inline border (avoid a competing outline). Empty cells get
        // their dashed body border from `.grid-empty`, so only filled,
        // non-selected cells need an inline slot outline (brighter on hover).
        const border = isSelected
          ? "none"
          : isEmpty
            ? "none"
            : isHovered
              ? "1px dashed var(--accent, #57c7d8)"
              : "1px dashed rgba(93,120,146,0.55)";

        // Selection ring + empty-cell affordance are styled by the CSS agent via
        // the shared class vocabulary: `is-selected` on the cell (filled OR
        // empty) drives the selection ring; `grid-empty` drives the dashed
        // empty-slot body. We keep inline positioning (left/top/width/height)
        // so span sizing is unaffected.
        const cellClass = isSelected ? "is-selected" : undefined;

        return (
          <div
            key={i}
            data-testid={`cell-${i}`}
            className={cellClass}
            aria-selected={isSelected}
            onClick={() => onSelect(i)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            style={{
              position: "absolute",
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
              boxSizing: "border-box",
              border,
              backgroundColor: isSelected
                ? "rgba(87,199,216,0.08)"
                : isHovered
                  ? "rgba(87,199,216,0.04)"
                  : "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {isEmpty ? (
              // Empty slot affordance: the SVG preview shows nothing here, so make
              // the slot obviously clickable. The `.grid-empty` class (dashed
              // border, centered glyph, hover) is provided by the CSS agent; we
              // emit the class + the "＋ Add element" hint. Add `is-selected` for
              // the selection ring on empty cells too.
              <div
                data-testid={`cell-empty-${i}`}
                className={isSelected ? "grid-empty is-selected" : "grid-empty"}
              >
                ＋ Add element
              </div>
            ) : (
              // Filled cell: the widget renders in the SVG preview underneath; a
              // small top-left name chip identifies it without obscuring it. The
              // chip is muted by default and brightens on select/hover.
              <span
                data-testid={`cell-label-${i}`}
                style={{
                  position: "absolute",
                  top: "2px",
                  left: "3px",
                  maxWidth: "calc(100% - 6px)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "1px 4px",
                  borderRadius: "3px",
                  background: isSelected || isHovered ? "var(--accent, #57c7d8)" : "rgba(16,32,47,0.6)",
                  color: isSelected || isHovered ? "var(--bg, #0a1018)" : "var(--ink-dim, #8fa7bd)",
                  pointerEvents: "none",
                }}
              >
                {label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
