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

  const { rows, cols, cells } = layout as { rows: number; cols: number; cells: Array<{ element?: string }> };
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
              width: `${cellW}%`,
              height: `${cellH}%`,
              boxSizing: "border-box",
              border: i === selected ? "2px solid #3b82f6" : "1px dashed rgba(255,255,255,0.3)",
              cursor: "pointer",
              backgroundColor: "transparent",
            }}
          >
            {cell.element ?? ""}
          </div>
        );
      })}
    </div>
  );
}
