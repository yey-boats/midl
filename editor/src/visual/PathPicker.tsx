// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React, { useState, useCallback, useRef } from "react";
import type { Manifest } from "@yey-boats/midl";
import type { DataProvider } from "@yey-boats/midl-web";
import type { LivePathSource } from "../adapters";
import { SIGNALK_CATALOG, mergeCatalogWithLive } from "../signalk-catalog";

export interface PathPickerProps {
  value: string;
  manifest: Manifest;
  provider: DataProvider;
  onChange: (path: string) => void;
  onBrowse?: () => void;
}

function optionTestId(path: string): string {
  return `path-picker-option-${path.replace(/\./g, "-")}`;
}

export function PathPicker({ value, manifest: _manifest, provider, onChange, onBrowse }: PathPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build merged catalog entries using the live provider
  const liveSource = provider as unknown as LivePathSource;
  const livePaths = typeof liveSource.knownPaths === "function" ? liveSource.knownPaths() : [];
  const allEntries = mergeCatalogWithLive(SIGNALK_CATALOG, livePaths);

  // Filter by current input value
  const query = value.toLowerCase();
  const filtered = query
    ? allEntries.filter((e) => e.path.toLowerCase().includes(query) || e.label.toLowerCase().includes(query))
    : allEntries;

  const handleSelect = useCallback((path: string) => {
    onChange(path);
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        data-testid="path-picker"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay close so mouseDown on option fires first
          setTimeout(() => setOpen(false), 150);
        }}
        placeholder="SignalK path"
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      {open && (
        <ul
          data-testid="path-picker-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "var(--panel, #0e1b27)",
            border: "1px solid var(--line, #1d2b3a)",
            borderRadius: "4px",
            margin: 0,
            padding: 0,
            listStyle: "none",
            maxHeight: "240px",
            overflowY: "auto",
            fontSize: "11px",
            fontFamily: "monospace",
          }}
        >
          {filtered.slice(0, 80).map((e) => (
            <li
              key={e.path}
              data-testid={optionTestId(e.path)}
              data-path={e.path}
              onMouseDown={() => handleSelect(e.path)}
              style={{
                padding: "4px 8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: "50%", flexShrink: 0, display: "inline-block",
                background: e.injected ? "#c8a0ff" : e.live ? "#4ac36e" : "#3a4f62",
              }} />
              <span style={{ flex: 1 }}>{e.path}</span>
              {e.unit && <span style={{ opacity: 0.55, fontSize: "9px" }}>{e.unit}</span>}
            </li>
          ))}
        </ul>
      )}
      {onBrowse && (
        <button
          data-testid="path-picker-browse"
          onClick={onBrowse}
          style={{ fontSize: "10px", marginTop: "3px", opacity: 0.7 }}
        >
          Browse data ▸
        </button>
      )}
    </div>
  );
}
