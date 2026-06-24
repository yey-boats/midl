// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React, { useState, useEffect, useCallback } from "react";
import type { PathInfo, LivePathSource } from "../adapters";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal interface expected from the provider — duck-typed via feature detection. */
export type DataProvider = LivePathSource;

export interface DataTreeProps {
  provider: DataProvider;
  selectedElementId: string | null;
  onBindPath: (path: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive the data-testid slug for a path (dots → dashes). */
function leafTestId(path: string): string {
  return `data-leaf-${path.replace(/\./g, "-")}`;
}

/** Group paths by their first segment (e.g. "navigation", "environment"). */
function groupPaths(paths: PathInfo[]): Map<string, PathInfo[]> {
  const map = new Map<string, PathInfo[]>();
  for (const p of paths) {
    const group = p.path.split(".")[0] ?? p.path;
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(p);
  }
  return map;
}

/** Format a value compactly for display. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    // Show up to 3 significant digits
    const abs = Math.abs(value);
    if (abs === 0) return "0";
    if (abs >= 1000) return value.toFixed(0);
    if (abs >= 10) return value.toFixed(1);
    return value.toFixed(3);
  }
  if (typeof value === "object") return "[obj]";
  return String(value);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DataTree({ provider, selectedElementId, onBindPath }: DataTreeProps): React.JSX.Element {
  const [paths, setPaths] = useState<PathInfo[]>(() => provider.knownPaths());
  const [search, setSearch] = useState("");
  const [injectOpen, setInjectOpen] = useState(false);
  const [injectPath, setInjectPath] = useState("");
  const [injectValue, setInjectValue] = useState("");
  const [injectUnit, setInjectUnit] = useState("");

  // Subscribe to path catalogue changes
  useEffect(() => {
    const unsub = provider.onChange(() => {
      setPaths(provider.knownPaths());
    });
    return unsub;
  }, [provider]);

  // Filter paths by search substring
  const filtered = search
    ? paths.filter((p) => p.path.includes(search))
    : paths;

  // Group by first segment
  const grouped = groupPaths(filtered);

  const handleInjectSubmit = useCallback(() => {
    if (!injectPath) return;
    const unit = injectUnit || undefined;
    provider.inject(injectPath, injectValue, unit);
    setInjectPath("");
    setInjectValue("");
    setInjectUnit("");
    setInjectOpen(false);
  }, [provider, injectPath, injectValue, injectUnit]);

  return (
    <div data-testid="data-tree" data-component="data-tree">
      {/* Search */}
      <div style={{ padding: "8px 8px 6px" }}>
        <input
          data-testid="data-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter paths…"
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      </div>

      {/* No-selection hint */}
      {!selectedElementId && (
        <div style={{ padding: "4px 10px", fontSize: "11px", color: "#5b7286" }}>
          Select a tile first to bind a path.
        </div>
      )}

      {/* Path tree */}
      <div data-section="path-tree">
        {[...grouped.entries()].map(([group, groupPaths]) => (
          <div key={group} data-section="tree-group">
            <div
              data-section="group-header"
              style={{ padding: "4px 8px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}
            >
              {group}
              <span style={{ marginLeft: "6px", fontWeight: 400, opacity: 0.6 }}>
                ({groupPaths.length})
              </span>
            </div>
            {groupPaths.map((p) => (
              <div
                key={p.path}
                data-testid={leafTestId(p.path)}
                data-injected={p.injected ? "true" : undefined}
                onClick={() => onBindPath(p.path)}
                style={{
                  padding: "3px 8px 3px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {/* Online dot */}
                <span
                  data-section="dot"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: p.injected ? "#c8a0ff" : "#4ac36e",
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                {/* Short path (strip the group prefix) */}
                <span style={{ fontFamily: "monospace", fontSize: "10.5px", flex: 1 }}>
                  {p.path.replace(`${p.path.split(".")[0]}.`, "")}
                </span>
                {/* Live value */}
                <span style={{ fontFamily: "monospace", fontSize: "10px", opacity: 0.8 }}>
                  {formatValue(p.value)}
                  {p.sourceUnit ? ` ${p.sourceUnit}` : ""}
                </span>
                {p.injected && (
                  <span style={{ fontSize: "9px", opacity: 0.7 }}>inj</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Inject form toggle */}
      <div style={{ padding: "8px 8px 0" }}>
        <button
          data-testid="data-inject-toggle"
          onClick={() => setInjectOpen((v) => !v)}
          style={{ fontSize: "11px" }}
        >
          {injectOpen ? "Cancel" : "Inject a value…"}
        </button>
      </div>

      {/* Inject form */}
      {injectOpen && (
        <div data-section="inject-form" style={{ padding: "6px 8px 8px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <input
            data-testid="data-inject-path"
            type="text"
            value={injectPath}
            onChange={(e) => setInjectPath(e.target.value)}
            placeholder="path.to.inject"
            style={{ fontSize: "11px", fontFamily: "monospace" }}
          />
          <input
            data-testid="data-inject-value"
            type="text"
            value={injectValue}
            onChange={(e) => setInjectValue(e.target.value)}
            placeholder="value"
            style={{ fontSize: "11px" }}
          />
          <input
            data-testid="data-inject-unit"
            type="text"
            value={injectUnit}
            onChange={(e) => setInjectUnit(e.target.value)}
            placeholder="unit (optional)"
            style={{ fontSize: "11px" }}
          />
          <button
            data-testid="data-inject-submit"
            onClick={handleInjectSubmit}
            style={{ fontSize: "11px" }}
          >
            Inject
          </button>
        </div>
      )}
    </div>
  );
}
