// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React, { useState, useEffect, useCallback } from "react";
import type { LivePathSource } from "../adapters";
import { SIGNALK_CATALOG, mergeCatalogWithLive } from "../signalk-catalog";
import type { CatalogEntry } from "../signalk-catalog";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataProvider = LivePathSource;

export interface DataTreeProps {
  provider: DataProvider;
  selectedElementId: string | null;
  onBindPath: (path: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function leafTestId(path: string): string {
  return `data-leaf-${path.replace(/\./g, "-")}`;
}

function groupEntries(entries: CatalogEntry[]): Map<string, CatalogEntry[]> {
  const map = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    if (!map.has(e.group)) map.set(e.group, []);
    map.get(e.group)!.push(e);
  }
  return map;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
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
  const [entries, setEntries] = useState<CatalogEntry[]>(() =>
    mergeCatalogWithLive(SIGNALK_CATALOG, provider.knownPaths()),
  );
  const [search, setSearch] = useState("");
  const [injectOpen, setInjectOpen] = useState(false);
  const [injectPath, setInjectPath] = useState("");
  const [injectValue, setInjectValue] = useState("");
  const [injectUnit, setInjectUnit] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = provider.onChange(() => {
      setEntries(mergeCatalogWithLive(SIGNALK_CATALOG, provider.knownPaths()));
    });
    return unsub;
  }, [provider]);

  const filtered = search
    ? entries.filter((e) => e.path.includes(search) || e.label.toLowerCase().includes(search.toLowerCase()))
    : entries;

  const grouped = groupEntries(filtered);

  const handleInjectSubmit = useCallback(() => {
    if (!injectPath) return;
    const unit = injectUnit || undefined;
    provider.inject(injectPath, injectValue, unit);
    setInjectPath("");
    setInjectValue("");
    setInjectUnit("");
    setInjectOpen(false);
  }, [provider, injectPath, injectValue, injectUnit]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) { next.delete(group); } else { next.add(group); }
      return next;
    });
  }, []);

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
        {[...grouped.entries()].map(([group, groupEntries]) => (
          <div key={group} data-section="tree-group">
            <div
              data-testid={`data-group-${group}`}
              data-section="group-header"
              onClick={() => toggleGroup(group)}
              style={{ padding: "4px 8px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: "4px" }}
            >
              <span style={{ fontSize: "9px", opacity: 0.55, fontWeight: 400 }}>
                {collapsedGroups.has(group) ? "▶" : "▼"}
              </span>
              {group}
              <span style={{ marginLeft: "6px", fontWeight: 400, opacity: 0.6 }}>
                ({groupEntries.length})
              </span>
            </div>
            {!collapsedGroups.has(group) && groupEntries.map((e) => (
              <div
                key={e.path}
                data-testid={leafTestId(e.path)}
                data-injected={e.injected ? "true" : undefined}
                data-live={e.live ? "true" : undefined}
                onClick={() => onBindPath(e.path)}
                style={{
                  padding: "3px 8px 3px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {/* Dot: purple=injected, green=live, grey=catalog-only */}
                <span
                  data-section="dot"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: e.injected ? "#c8a0ff" : e.live ? "#4ac36e" : "#3a4f62",
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                {/* Short path (strip the group prefix) */}
                <span style={{ fontFamily: "monospace", fontSize: "10.5px", flex: 1 }}>
                  {e.path.replace(`${e.group}.`, "")}
                </span>
                {/* Live value (only when live) */}
                {e.live && (
                  <span style={{ fontFamily: "monospace", fontSize: "10px", opacity: 0.8 }}>
                    {formatValue(e.value)}
                    {e.sourceUnit ? ` ${e.sourceUnit}` : ""}
                  </span>
                )}
                {e.injected && (
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
