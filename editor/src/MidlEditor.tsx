// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Manifest } from "@yey-boats/midl";
import type { DataProvider } from "@yey-boats/midl-web";
import type { DashboardStoreAdapter, ManifestSource, DashboardRef } from "./adapters";
import { RevisionConflict } from "./adapters";
import type { EditorModel, EditorElement } from "./model";
import { parseMidl, serializeMidl } from "./midl-io";
import { SIGNALK_CATALOG, applyCatalogDefaults } from "./signalk-catalog";
import { usePreview } from "./usePreview";
import { validateModel } from "./validate";
import { addElement, assignElementToCell, removeElement } from "./layout-ops";
import { Palette } from "./visual/Palette";
import { GridCanvas } from "./visual/GridCanvas";
import { Inspector } from "./visual/Inspector";
import { DataTree } from "./visual/DataTree";
import { ElementsList } from "./visual/ElementsList";
import { SourceEditor } from "./source/SourceEditor";
import type { LivePathSource } from "./adapters";
import midlEditorCss from "./midl-editor.css?inline";

// ── Self-contained style injection ────────────────────────────────────────────
// The IIFE global build (midl-editor.global.js) is loaded with a single
// <script> tag — no companion stylesheet. Inject the CSS once into <head> so
// the editor is fully styled even when there is no external style.css.
function injectEditorStyles(): void {
  if (typeof document === "undefined") return; // SSR guard
  if (document.getElementById("midl-editor-styles")) return; // already injected
  const style = document.createElement("style");
  style.id = "midl-editor-styles";
  style.textContent = midlEditorCss;
  document.head.appendChild(style);
}
injectEditorStyles();

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
type LeftTab = "elements" | "data" | "layout";

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
  const [leftTab, setLeftTab] = useState<LeftTab>("elements");

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

  // ── Derive selected element id from selected cell ─────────────────────────────

  const selectedElementId: string | null = useCallback((): string | null => {
    if (selectedCell === null) return null;
    const isGrid = "rows" in model.layout && "cols" in model.layout && "cells" in model.layout;
    if (!isGrid) return null;
    const cells = (model.layout as { cells: Array<{ element?: string }> }).cells;
    return cells[selectedCell]?.element ?? null;
  }, [model, selectedCell])();

  // ── Visual mode: bind path from DataTree to selected element ─────────────────

  const handleBindPath = useCallback(
    (path: string) => {
      if (!selectedElementId) return;
      const element = model.elements[selectedElementId];
      if (!element) return;
      const updatedWithBinding: EditorElement = {
        ...element,
        bindings: {
          ...element.bindings,
          value: { kind: "signalk" as const, path },
        },
      };
      const catalogEntry = SIGNALK_CATALOG.find((e) => e.path === path);
      const finalElement = catalogEntry
        ? applyCatalogDefaults(updatedWithBinding, catalogEntry)
        : updatedWithBinding;
      setModel({
        ...model,
        elements: {
          ...model.elements,
          [selectedElementId]: finalElement,
        },
      });
    },
    [model, selectedElementId],
  );

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
          selectedCell !== null &&
          selectedCell < layout.cells.length &&
          !layout.cells[selectedCell]?.element
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

  // ── Visual mode: browse data button (PathPicker) ───────────────────────────

  const handleBrowseData = useCallback(() => {
    setLeftTab("data");
  }, []);

  // ── Visual mode: remove element from elements-list ─────────────────────────
  const handleRemoveFromList = useCallback(
    (elementId: string) => {
      try { setModel((m) => removeElement(m, elementId)); } catch { /* ignore */ }
    },
    [],
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div data-component="midl-editor">
      {/* Header bar */}
      <div data-testid="editor-header" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {/* Logo */}
        <span className="editor-logo-mark">YEY</span>
        <span className="editor-logo-text">Instruments Manager</span>
        <div className="topbar-divider" />

        {/* Mode tabs */}
        <div className="mode-tabs">
          <button
            data-testid="mode-toggle"
            className={`mode-tab${mode === "visual" ? " active" : ""}`}
            onClick={() => setMode((m) => (m === "visual" ? "source" : "visual"))}
          >
            Visual
          </button>
          <button
            className={`mode-tab${mode === "source" ? " active" : ""}`}
            onClick={() => setMode((m) => (m === "visual" ? "source" : "visual"))}
          >
            Source
          </button>
        </div>

        {/* Device / class selector — keep existing testid, wrap with new alias */}
        <div data-testid="top-class-select">
          <select
            data-testid="class-switch"
            className="topbar-select"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
          >
            {SUPPORTED_CLASSES.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>

        {/* Theme selector — keep existing testid, wrap with new alias */}
        <div data-testid="top-theme-select">
          <select
            data-testid="theme-switch"
            className="topbar-select"
            value={themeChoice}
            onChange={(e) => setThemeChoice(e.target.value as Theme)}
          >
            <option value="night">Night</option>
            <option value="day">Day</option>
          </select>
        </div>

        {/* Name input */}
        <input
          data-testid="name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dashboard name"
          style={{ flex: 1, minWidth: 0 }}
        />

        {/* Save button */}
        <button
          data-testid="save-button"
          className="btn-ghost"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {/* Push to device — primary CTA, wired to same save path */}
        <button
          data-testid="top-push"
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          Push to device ▸
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

      {/* Row 2: Body */}
      <div data-testid="mode-body" data-mode={mode} className="body-row">
        {/* Mode label for tests / accessibility */}
        <span style={{ display: "none" }}>{mode}</span>

        {mode === "visual" && manifest ? (
          <div data-testid="visual-mode-body" className="visual-body">
            {/* Left rail */}
            <div data-section="left-rail">
              <div data-section="rail-tabs" style={{ display: "flex", gap: "0" }}>
                <button
                  data-testid="tab-elements"
                  aria-selected={leftTab === "elements"}
                  onClick={() => setLeftTab("elements")}
                  style={{ fontWeight: leftTab === "elements" ? 700 : 400 }}
                >
                  Elements
                </button>
                <button
                  data-testid="tab-data"
                  aria-selected={leftTab === "data"}
                  onClick={() => setLeftTab("data")}
                  style={{ fontWeight: leftTab === "data" ? 700 : 400 }}
                >
                  Data
                </button>
                <button
                  data-testid="tab-layout"
                  aria-selected={leftTab === "layout"}
                  onClick={() => setLeftTab("layout")}
                  style={{ fontWeight: leftTab === "layout" ? 700 : 400 }}
                >
                  Layout
                </button>
              </div>
              {leftTab === "elements" ? (
                <Palette manifest={manifest} onAdd={handleAddElement} />
              ) : leftTab === "data" ? (
                <DataTree
                  provider={provider as unknown as LivePathSource}
                  selectedElementId={selectedElementId}
                  onBindPath={handleBindPath}
                />
              ) : (
                <ElementsList
                  model={model}
                  onSelectCell={setSelectedCell}
                  onRemoveElement={handleRemoveFromList}
                />
              )}
            </div>

            {/* Center canvas */}
            <div className="canvas-area">
              <div className="device-frame">
                <div
                  data-testid="preview-host"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
                <div style={{ position: "absolute", inset: 0 }}>
                  <GridCanvas
                    model={model}
                    viewport={{ w: 480, h: 480 }}
                    selected={selectedCell}
                    onSelect={setSelectedCell}
                  />
                </div>
              </div>
            </div>

            {/* Right inspector */}
            <Inspector
              model={model}
              selectedCell={selectedCell}
              manifest={manifest}
              provider={provider}
              onChange={setModel}
              onBrowseData={handleBrowseData}
            />
          </div>
        ) : mode === "source" && manifest ? (
          <SourceEditor
            model={model}
            manifest={manifest}
            onModelChange={setModel}
          />
        ) : (
          <>{mode}</>
        )}
      </div>

      {/* Preview error indicator */}
      {previewError && (
        <div data-testid="preview-error">{previewError}</div>
      )}

      {/* Status bar — shown once manifest is available */}
      {manifest && (
        <div data-testid="status-bar">
          {(() => {
            const v = validateModel(model, manifest);
            if (v.ok) {
              return (
                <>
                  <span className="status-valid-indicator">✓ Valid for {className}</span>
                  <span style={{ color: "var(--ink-faint, #5b7286)", fontSize: "10px" }}>· structural · semantic · capability</span>
                  <span className="status-spacer" />
                  <span className="status-autosave">autosaved</span>
                </>
              );
            }
            const errorCount = v.issues.filter((i) => i.severity !== "warning").length;
            return (
              <>
                <span className="status-error-indicator">⚠ {errorCount} error{errorCount !== 1 ? "s" : ""}</span>
                <span style={{ color: "var(--ink-faint, #5b7286)", fontSize: "10px" }}>{v.issues[0]?.message}</span>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
