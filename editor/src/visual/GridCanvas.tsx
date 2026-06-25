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
  const layout = model.layout;

  // Guard: only render grid overlay when layout is a grid
  if (!("rows" in layout) || !("cols" in layout) || !("cells" in layout)) {
    return (
      <div data-component="grid-canvas">
        <p>Flow layout — edit in source mode</p>
      </div>
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

        return (
          <div
            key={i}
            data-testid={`cell-${i}`}
            aria-selected={i === selected}
            onClick={() => onSelect(i)}
            style={{
              position: "absolute",
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
              boxSizing: "border-box",
              border: i === selected ? "2px solid var(--accent, #57c7d8)" : "1px dashed rgba(93,120,146,0.3)",
              backgroundColor: i === selected ? "rgba(87,199,216,0.04)" : "transparent",
              cursor: "pointer",
            }}
          >
            {cell.element ?? ""}
          </div>
        );
      })}
    </div>
  );
}
