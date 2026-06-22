// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { Manifest } from "@yey-boats/midl";
import type { DataProvider } from "@yey-boats/midl-web";

export interface PathPickerProps {
  value: string;
  manifest: Manifest;
  provider: DataProvider;
  onChange: (path: string) => void;
}

export function PathPicker({ value, manifest, onChange }: PathPickerProps): React.JSX.Element {
  // Gather candidate paths from manifest.sources (known SignalK paths)
  const candidates: string[] = [];
  if (manifest.sources) {
    for (const s of manifest.sources) {
      if (typeof s === "string") candidates.push(s);
    }
  }

  const listId = "path-picker-list";

  return (
    <>
      <input
        data-testid="path-picker"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="SignalK path"
        style={{ width: "100%" }}
      />
      <datalist id={listId}>
        {candidates.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}
