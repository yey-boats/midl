// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Manifest } from "@yey-boats/midl";
import type { DataProvider } from "@yey-boats/midl-web";
import type { DashboardStoreAdapter, ManifestSource, DashboardRef } from "./adapters";
import { RevisionConflict } from "./adapters";
import type { EditorModel } from "./model";
import { parseMidl, serializeMidl } from "./midl-io";
import { usePreview } from "./usePreview";
import { addElement, assignElementToCell } from "./layout-ops";
import { Palette } from "./visual/Palette";
import { GridCanvas } from "./visual/GridCanvas";
import { Inspector } from "./visual/Inspector";
import { SourceEditor } from "./source/SourceEditor";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MidlEditorProps {
  store: DashboardStoreAdapter;
  provider: DataProvider;
  manifest: ManifestSource;
  initialId?: string;
  targetClass?: string;
  onSaved?: (ref: DashboardRef) => void;
}

type Mode = "visual" | "source";
type Theme = "night" | "day";

// Supported class values for the class-switch dropdown
const SUPPORTED_CLASSES = ["square-480", "landscape-800x480", "landscape-1024x600"];

// ── Blank model factory ────────────────────────────────────────────────────────

function makeBlankModel(targetClass: string): EditorModel {
  return {
    midl: "1.0.0",
    screenId: "screen",
    title: "New Dashboard",
    elements: {},
    layout: { rows: 1, cols: 1, cells: [{}] },
    variants: [],
  };
}

// ── MidlEditor component ───────────────────────────────────────────────────────

export function MidlEditor(props: MidlEditorProps): React.JSX.Element {
  const { store, provider, manifest: manifestSource, initialId, onSaved } = props;
  const defaultClass = props.targetClass ?? "square-480";

  // ── State ────────────────────────────────────────────────────────────────────

  const [model, setModel] = useState<EditorModel>(() => makeBlankModel(defaultClass));
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [name, setName] = useState("New Dashboard");
  const [mode, setMode] = useState<Mode>("visual");
  const [themeChoice, setThemeChoice] = useState<Theme>("night");
  const [className, setClassName] = useState(defaultClass);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  // Revision tracking for optimistic concurrency
  const revisionRef = useRef<string | undefined>(undefined);
  const idRef = useRef<string | undefined>(initialId);

  // Save UI state
  const [saving, setSaving] = useState(false);
  const [conflictVisible, setConflictVisible] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Init on mount ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Load manifest
      const mf = await manifestSource.get(className);
      if (cancelled) return;
      setManifest(mf);

      // Load existing dashboard
      if (initialId) {
        try {
          const { doc, metadata } = await store.get(initialId);
          if (cancelled) return;
          const parsed = parseMidl(doc);
          setModel(parsed);
          setName(parsed.title);
          revisionRef.current = metadata.revision;
          idRef.current = initialId;
        } catch {
          // If load fails, start from blank
        }
      }
    }

    void init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch manifest when className changes (after initial mount)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    manifestSource.get(className).then(setManifest).catch(() => {});
  }, [className, manifestSource]);

  // ── Preview ──────────────────────────────────────────────────────────────────

  const previewManifest = manifest ?? {
    midl: "1.0.0",
    board: "preview",
    classes: [{ id: className, width: 480, height: 480, maxTiles: 4, maxDepth: 3, elements: [] }],
    elements: [],
    sources: [],
  };

  const previewOpts = { theme: themeChoice, className };
  const { svg: previewSvg, error: previewError } = usePreview(
    model,
    provider,
    previewManifest,
    previewOpts,
  );

  // ── Save ─────────────────────────────────────────────────────────────────────

  const doSave = useCallback(
    async (overwrite: boolean) => {
      setSaving(true);
      setSaveError(null);
      try {
        const source = serializeMidl(model, "yaml");
        const result = await store.save({
          id: idRef.current,
          source,
          name,
          targetClass: className,
          expectedRevision: overwrite ? undefined : revisionRef.current,
        });
        // Update tracking state on success
        const savedId = result.ref.id;
        idRef.current = savedId;
        // Refresh revision so the next save can send expectedRevision (optimistic concurrency).
        // Attempt to get the latest revision from the store; if not available, keep the last
        // known revision rather than nulling it (nulling would lose optimistic concurrency).
        try {
          const { metadata } = await store.get(savedId);
          revisionRef.current = metadata.revision;
        } catch {
          // TODO: if store.get fails here, revisionRef.current retains its pre-save value
          // (better than undefined — at least the next save sends *something*).
        }
        setConflictVisible(false);
        onSaved?.(result.ref);
      } catch (err) {
        if (err instanceof RevisionConflict) {
          setConflictVisible(true);
        } else {
          setSaveError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setSaving(false);
      }
    },
    [model, name, className, store, onSaved],
  );

  const handleSave = useCallback(() => {
    setConflictVisible(false);
    void doSave(false);
  }, [doSave]);

  const handleOverwrite = useCallback(() => {
    void doSave(true);
  }, [doSave]);

  const handleReload = useCallback(async () => {
    if (!idRef.current) return;
    try {
      const { doc, metadata } = await store.get(idRef.current);
      const parsed = parseMidl(doc);
      setModel(parsed);
      setName(parsed.title);
      revisionRef.current = metadata.revision;
      setConflictVisible(false);
    } catch {
      // Ignore reload errors
    }
  }, [store]);

  // ── Visual mode: add element from palette ────────────────────────────────────

  const handleAddElement = useCallback(
    (type: string) => {
      try {
        const id = crypto.randomUUID();
        const newEl = { id, type };
        const withEl = addElement(model, newEl);
        // Assign to selected cell or first empty cell (only meaningful for grid layouts)
        const isGrid =
          "rows" in withEl.layout && "cols" in withEl.layout && "cells" in withEl.layout;
        if (!isGrid) {
          setModel(withEl);
          return;
        }
        const layout = withEl.layout as { rows: number; cols: number; cells: Array<{ element?: string }> };
        const targetCell =
          selectedCell !== null && !layout.cells[selectedCell]?.element
            ? selectedCell
            : layout.cells.findIndex((c) => !c.element);
        const finalModel = targetCell >= 0
          ? assignElementToCell(withEl, targetCell, id)
          : withEl;
        setModel(finalModel);
        if (targetCell >= 0) setSelectedCell(targetCell);
      } catch {
        // Ignore element-add errors (e.g. duplicate id — should not happen with UUID)
      }
    },
    [model, selectedCell],
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div data-component="midl-editor">
      {/* Header bar */}
      <div data-testid="editor-header" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          data-testid="mode-toggle"
          onClick={() => setMode((m) => (m === "visual" ? "source" : "visual"))}
        >
          {mode === "visual" ? "Source" : "Visual"}
        </button>

        <button
          data-testid="theme-switch"
          onClick={() => setThemeChoice((t) => (t === "night" ? "day" : "night"))}
        >
          {themeChoice === "night" ? "Day" : "Night"}
        </button>

        <select
          data-testid="class-switch"
          value={className}
          onChange={(e) => setClassName(e.target.value)}
        >
          {SUPPORTED_CLASSES.map((cls) => (
            <option key={cls} value={cls}>{cls}</option>
          ))}
        </select>

        <input
          data-testid="name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dashboard name"
        />

        <button
          data-testid="save-button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Conflict banner */}
      {conflictVisible && (
        <div data-testid="conflict-banner" role="alert">
          <span>Revision conflict — the dashboard was updated elsewhere.</span>
          <button data-action="reload" onClick={() => void handleReload()}>Reload</button>
          <button data-action="overwrite" onClick={handleOverwrite}>Overwrite</button>
        </div>
      )}

      {/* Save error banner */}
      {saveError && (
        <div data-testid="save-error-banner" role="alert">
          {saveError}
        </div>
      )}

      {/* Preview pane with grid overlay */}
      <div style={{ position: "relative" }}>
        <div
          data-testid="preview-host"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: previewSvg }}
        />
        {mode === "visual" && (
          <div style={{ position: "absolute", inset: 0 }}>
            <GridCanvas
              model={model}
              viewport={{ w: 480, h: 480 }}
              selected={selectedCell}
              onSelect={setSelectedCell}
            />
          </div>
        )}
      </div>

      {/* Preview error indicator */}
      {previewError && (
        <div data-testid="preview-error">{previewError}</div>
      )}

      {/* Mode body */}
      <div data-testid="mode-body" data-mode={mode}>
        {/* Mode label for tests / accessibility */}
        <span style={{ display: "none" }}>{mode}</span>
        {mode === "visual" && manifest ? (
          <div data-testid="visual-mode-body" style={{ display: "flex", gap: "16px" }}>
            <Palette manifest={manifest} onAdd={handleAddElement} />
            <Inspector
              model={model}
              selectedCell={selectedCell}
              manifest={manifest}
              provider={provider}
              onChange={setModel}
            />
          </div>
        ) : mode === "source" && manifest ? (
          <SourceEditor
            model={model}
            manifest={manifest}
            onModelChange={setModel}
          />
        ) : (
          mode
        )}
      </div>
    </div>
  );
}
