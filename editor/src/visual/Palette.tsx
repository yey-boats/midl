// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { Manifest } from "@yey-boats/midl";

export interface PaletteProps {
  manifest: Manifest;
  onAdd: (type: string) => void;
}

export function Palette({ manifest, onAdd }: PaletteProps): React.JSX.Element {
  return (
    <div data-component="palette" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
      {manifest.elements.map((el) => (
        <button
          key={el.type}
          data-testid={`palette-${el.type}`}
          onClick={() => onAdd(el.type)}
        >
          {el.type}
        </button>
      ))}
    </div>
  );
}
