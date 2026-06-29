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
import { lintDeviceCapabilities } from "./device-lint";
import { addElement, assignElementToCell, removeElement, setGrid, clearWidgets } from "./layout-ops";
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
type MobileSheet = "elements" | "data" | "layout" | "inspector" | null;

// Supported class values for the class-switch dropdown
const SUPPORTED_CLASSES = ["square-480", "landscape-800x480", "landscape-1024x600"];

// ── Blank model factory ────────────────────────────────────────────────────────

function makeBlankModel(targetClass: string): EditorModel {
  return {
    midl: "1.0.0",
    screenId: "screen",
    title: "New Dashboard",
    titleLoc: "meta",
    elements: {},
    layout: { rows: 1, cols: 1, cells: [{}] },
    variants: [],
  };
}

// ── Device dimension helper ───────────────────────────────────────────────────

function getDeviceDimensions(cls: string): { w: number; h: number } {
  const sq = /^square-(\d+)$/.exec(cls);
  if (sq) { const n = parseInt(sq[1], 10); return { w: n, h: n }; }
  const ls = /^landscape-(\d+)x(\d+)$/.exec(cls);
  if (ls) return { w: parseInt(ls[1], 10), h: parseInt(ls[2], 10) };
  return { w: 480, h: 480 };
}

// ── Grid presets ──────────────────────────────────────────────────────────────

const GRID_PRESETS: Array<{ label: string; rows: number; cols: number }> = [
  { label: "1×1", rows: 1, cols: 1 },
  { label: "2×1", rows: 2, cols: 1 },
  { label: "1×2", rows: 1, cols: 2 },
  { label: "2×2", rows: 2, cols: 2 },
  { label: "3×1", rows: 3, cols: 1 },
  { label: "2×3", rows: 2, cols: 3 },
];

// ── LayoutControls — shown in the "Layout" left tab ───────────────────────────

interface LayoutControlsProps {
  model: EditorModel;
  onSelectCell: (cellIndex: number) => void;
  onRemoveElement: (elementId: string) => void;
  onSetGrid: (rows: number, cols: number) => void;
  onClearWidgets: () => void;
}

function LayoutControls({
  model,
  onSelectCell,
  onRemoveElement,
  onSetGrid,
  onClearWidgets,
}: LayoutControlsProps): React.JSX.Element {
  const isGrid = "rows" in model.layout && "cols" in model.layout && "cells" in model.layout;
  const currentRows = isGrid ? (model.layout as { rows: number }).rows : 1;
  const currentCols = isGrid ? (model.layout as { cols: number }).cols : 1;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {/* Grid size controls */}
      <div style={{ padding: "10px 10px 6px", borderBottom: "1px solid var(--line, #1d2b3a)", flexShrink: 0 }}>
        <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.6, marginBottom: "8px" }}>Grid Size</div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
          <span style={{ fontSize: "11px", opacity: 0.7, minWidth: "36px" }}>Rows</span>
          <button
            onClick={() => onSetGrid(Math.max(1, currentRows - 1), currentCols)}
            style={{ width: 22, height: 22, padding: 0, fontSize: "14px", lineHeight: 1, background: "var(--elev)", border: "1px solid var(--line2)", borderRadius: "3px", cursor: "pointer", color: "var(--ink-dim)" }}
          >−</button>
          <span data-testid="layout-rows" style={{ fontFamily: "monospace", fontSize: "12px", minWidth: "20px", textAlign: "center" }}>{currentRows}</span>
          <button
            onClick={() => onSetGrid(currentRows + 1, currentCols)}
            style={{ width: 22, height: 22, padding: 0, fontSize: "14px", lineHeight: 1, background: "var(--elev)", border: "1px solid var(--line2)", borderRadius: "3px", cursor: "pointer", color: "var(--ink-dim)" }}
          >+</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
          <span style={{ fontSize: "11px", opacity: 0.7, minWidth: "36px" }}>Cols</span>
          <button
            onClick={() => onSetGrid(currentRows, Math.max(1, currentCols - 1))}
            style={{ width: 22, height: 22, padding: 0, fontSize: "14px", lineHeight: 1, background: "var(--elev)", border: "1px solid var(--line2)", borderRadius: "3px", cursor: "pointer", color: "var(--ink-dim)" }}
          >−</button>
          <span data-testid="layout-cols" style={{ fontFamily: "monospace", fontSize: "12px", minWidth: "20px", textAlign: "center" }}>{currentCols}</span>
          <button
            onClick={() => onSetGrid(currentRows, currentCols + 1)}
            style={{ width: 22, height: 22, padding: 0, fontSize: "14px", lineHeight: 1, background: "var(--elev)", border: "1px solid var(--line2)", borderRadius: "3px", cursor: "pointer", color: "var(--ink-dim)" }}
          >+</button>
        </div>
        {/* Presets */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {GRID_PRESETS.map((p) => (
            <button
              key={p.label}
              data-testid={`layout-preset-${p.rows}x${p.cols}`}
              onClick={() => onSetGrid(p.rows, p.cols)}
              style={{
                padding: "3px 7px",
                fontSize: "10px",
                fontFamily: "monospace",
                background: (currentRows === p.rows && currentCols === p.cols) ? "rgba(87,199,216,0.15)" : "var(--elev)",
                border: "1px solid",
                borderColor: (currentRows === p.rows && currentCols === p.cols) ? "var(--accent)" : "var(--line2)",
                borderRadius: "4px",
                cursor: "pointer",
                color: (currentRows === p.rows && currentCols === p.cols) ? "var(--accent)" : "var(--ink-dim)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Elements list */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        <ElementsList
          model={model}
          onSelectCell={onSelectCell}
          onRemoveElement={onRemoveElement}
        />
      </div>

      {/* Clear widgets */}
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--line, #1d2b3a)", flexShrink: 0 }}>
        <button
          data-testid="clear-widgets"
          onClick={onClearWidgets}
          style={{
            width: "100%",
            padding: "6px",
            fontSize: "11px",
            background: "transparent",
            border: "1px solid var(--danger, oklch(0.64 0.19 25))",
            borderRadius: "4px",
            cursor: "pointer",
            color: "var(--danger, oklch(0.64 0.19 25))",
          }}
        >
          Clear widgets
        </button>
      </div>
    </div>
  );
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

  // Dirty tracking — the serialized source as of the last successful save/load.
  // `dirty` is true when the current model differs, so the status bar can show an
  // honest "Unsaved changes" state and a beforeunload guard can warn on navigation.
  // (There is no real autosave; the previous static "autosaved" label was a lie.)
  const savedSourceRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // ── Zoom state ───────────────────────────────────────────────────────────────

  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [computedScale, setComputedScale] = useState(1);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // ── Mobile state ─────────────────────────────────────────────────────────────

  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);

  // ── Data flyout state (right-side inspector adjacent flyout) ─────────────────
  const [dataFlyoutOpen, setDataFlyoutOpen] = useState(false);

  // ── Device-capability lint (expand/collapse) ─────────────────────────────────
  const [deviceLintOpen, setDeviceLintOpen] = useState(false);

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
          // Baseline for dirty tracking: serialize the parsed model so comparisons
          // are apples-to-apples (the stored `doc` may differ only in formatting).
          savedSourceRef.current = serializeMidl(parsed, "yaml") + " " + parsed.title;
          setDirty(false);
        } catch {
          // If load fails, start from blank
        }
      }
    }

    void init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dirty tracking: recompute when the model OR the dashboard name changes. The
  // name is persisted separately (store.save's `name`), so a rename also counts
  // as unsaved. A new (never-saved) blank dashboard baselines itself on mount.
  useEffect(() => {
    const cur = serializeMidl(model, "yaml") + " " + name;
    if (savedSourceRef.current === null) {
      savedSourceRef.current = cur; // establish baseline for the initial/blank model
      setDirty(false);
      return;
    }
    setDirty(cur !== savedSourceRef.current);
  }, [model, name]);

  // beforeunload guard: warn before navigating away with unsaved edits.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = ""; // required for the native confirmation prompt
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Re-fetch manifest when className changes (after initial mount)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    manifestSource.get(className).then(setManifest).catch(() => {});
  }, [className, manifestSource]);

  // ── Zoom: sync computedScale when zoom is numeric ────────────────────────────

  useEffect(() => {
    if (zoom !== "fit") setComputedScale(zoom as number);
  }, [zoom]);

  // ── Zoom: ResizeObserver for fit mode ────────────────────────────────────────

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    function recompute() {
      if (zoom !== "fit") return;
      const { w: dw, h: dh } = getDeviceDimensions(className);
      const cw = container!.clientWidth - 32;
      const ch = container!.clientHeight - 80; // leave room for zoom strip
      const scale = Math.min(cw / dw, ch / dh, 1);
      setComputedScale(Math.max(0.1, isFinite(scale) ? scale : 1));
    }

    recompute();

    // ResizeObserver may not be available in jsdom
    if (typeof ResizeObserver === "undefined") return;

    const obs = new ResizeObserver(recompute);
    obs.observe(container);
    return () => obs.disconnect();
  }, [zoom, className]);

  // ── Zoom handlers ─────────────────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const current = prev === "fit" ? computedScale : prev;
      return Math.min(4, current * 1.25);
    });
  }, [computedScale]);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const current = prev === "fit" ? computedScale : prev;
      return Math.max(0.1, current / 1.25);
    });
  }, [computedScale]);

  const handleZoomFit = useCallback(() => {
    setZoom("fit");
  }, []);

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
        // Saved successfully — this serialized source + name is the clean baseline.
        savedSourceRef.current = source + " " + name;
        setDirty(false);
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
    // C2: gate the push on validation. If the model has hard errors, warn and
    // require confirmation before persisting invalid MIDL to the device. Warnings
    // do not block. If no confirm dialog is available, proceed (don't hard-fail).
    if (manifest) {
      const v = validateModel(model, manifest);
      const errorCount = v.ok ? 0 : v.issues.filter((i) => i.severity !== "warning").length;
      if (errorCount > 0) {
        const msg = `This dashboard has ${errorCount} validation error${errorCount !== 1 ? "s" : ""}:\n\n` +
          v.issues.filter((i) => i.severity !== "warning").slice(0, 5).map((i) => `• ${i.message}`).join("\n") +
          `\n\nPush to device anyway?`;
        let proceed = true;
        try {
          if (typeof window !== "undefined" && typeof window.confirm === "function") {
            proceed = window.confirm(msg);
          }
        } catch {
          proceed = true; // confirm unavailable (headless) → don't block
        }
        if (!proceed) return;
      }
    }
    void doSave(false);
  }, [doSave, model, manifest]);

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
      savedSourceRef.current = serializeMidl(parsed, "yaml") + " " + parsed.title;
      setDirty(false);
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
  // Opens the right-side data flyout so the user can pick a path next to the inspector.

  const handleBrowseData = useCallback(() => {
    setDataFlyoutOpen(true);
  }, []);

  const handleFlyoutBindPath = useCallback(
    (path: string) => {
      handleBindPath(path);
      setDataFlyoutOpen(false);
    },
    [handleBindPath],
  );

  // ── Layout tab: setGrid handler ───────────────────────────────────────────────
  const handleSetGrid = useCallback(
    (rows: number, cols: number) => {
      try { setModel((m) => setGrid(m, rows, cols)); } catch { /* ignore */ }
    },
    [],
  );

  const handleClearWidgets = useCallback(() => {
    try { setModel((m) => clearWidgets(m)); } catch { /* ignore */ }
  }, []);

  // ── Visual mode: remove element from elements-list ─────────────────────────
  const handleRemoveFromList = useCallback(
    (elementId: string) => {
      try { setModel((m) => removeElement(m, elementId)); } catch { /* ignore */ }
    },
    [],
  );

  // ── Derived device dimensions ─────────────────────────────────────────────────

  const deviceDims = getDeviceDimensions(className);

  // ── Zoom level display ────────────────────────────────────────────────────────

  const zoomLevelText = zoom === "fit" ? "Fit" : `${Math.round((zoom as number) * 100)}%`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div data-component="midl-editor" style={{ position: "relative" }}>
      {/* Header bar */}
      <div data-testid="editor-header" style={{ display: "flex", gap: "8px", alignItems: "center", position: "relative" }}>
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

        {/* Topbar overflow menu — mobile only, hidden on desktop via CSS */}
        <button
          data-testid="topbar-overflow"
          className="topbar-overflow"
          onClick={() => setOverflowMenuOpen(v => !v)}
        >
          <span /><span /><span />
        </button>
        {overflowMenuOpen && (
          <div className="overflow-menu">
            <div className="overflow-item" onClick={() => { handleSave(); setOverflowMenuOpen(false); }}>Save</div>
            <div className="overflow-item primary" onClick={() => { handleSave(); setOverflowMenuOpen(false); }}>Push to device</div>
          </div>
        )}
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
              ) : leftTab === "layout" ? (
                <LayoutControls
                  model={model}
                  onSelectCell={setSelectedCell}
                  onRemoveElement={handleRemoveFromList}
                  onSetGrid={handleSetGrid}
                  onClearWidgets={handleClearWidgets}
                />
              ) : null}
            </div>

            {/* Center canvas */}
            <div className="canvas-area" ref={canvasContainerRef}>
              {(() => {
                // F1: the visual grid editor only edits grid layouts. A preset/flow
                // base layout can be previewed but not edited here — say so plainly
                // and offer Source mode, instead of letting grid ops silently no-op.
                const baseIsGrid = "rows" in model.layout && "cols" in model.layout && "cells" in model.layout;
                // F2: the class switcher changes the PREVIEW class only; visual edits
                // always target the base layout. If this class has its own variant,
                // warn that edits won't touch it (variants are edited in Source mode).
                const classVariant = model.variants.find((v) => v.class === className);
                if (baseIsGrid && !classVariant) return null;
                const msg = !baseIsGrid
                  ? "This screen uses a preset/flow layout. The visual grid editor can't edit it — open Source mode to change the layout."
                  : `The "${className}" class has its own variant layout. Visual edits apply to the base layout only; edit this variant in Source mode.`;
                return (
                  <div data-testid="layout-notice" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: "rgba(255,184,77,0.12)", borderBottom: "1px solid var(--line, #1d2b3a)", fontSize: "11px", color: "var(--warn, #ffb84d)" }}>
                    <span style={{ flex: 1 }}>{msg}</span>
                    <button
                      data-testid="layout-notice-source"
                      onClick={() => setMode("source")}
                      style={{ fontSize: "11px", padding: "2px 8px", cursor: "pointer" }}
                    >
                      Open Source mode
                    </button>
                  </div>
                );
              })()}
              {(() => {
                // Placement hint: the select-a-cell-then-pick-an-element flow is not
                // self-evident, so spell it out and reflect the current step. Only
                // for grid layouts (the non-grid case is covered by layout-notice).
                const g = model.layout as { cells?: Array<{ element?: string }> };
                if (!("rows" in model.layout && "cols" in model.layout && "cells" in model.layout)) return null;
                let msg: string;
                if (selectedCell === null) {
                  msg = "Select a cell on the canvas, then click an element in the palette to place it.";
                } else if (!g.cells?.[selectedCell]?.element) {
                  msg = `Cell ${selectedCell + 1} selected — click an element in the palette to place it here.`;
                } else {
                  msg = `Cell ${selectedCell + 1} selected — edit it in the Inspector (binding, limits, appearance).`;
                }
                return (
                  <div data-testid="placement-hint" style={{ padding: "6px 12px", borderBottom: "1px solid var(--line, #1d2b3a)", fontSize: "11px", color: "var(--ink-dim, #8fa7bd)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ opacity: 0.7 }}>{selectedCell === null ? "①" : "②"}</span>
                    <span>{msg}</span>
                  </div>
                );
              })()}
              <div className="canvas-scroll">
                <div
                  className="device-frame"
                  style={{
                    width: `${deviceDims.w}px`,
                    height: `${deviceDims.h}px`,
                    transform: `scale(${computedScale})`,
                    transformOrigin: "center center",
                  }}
                >
                  <div
                    data-testid="preview-host"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                  />
                  <div style={{ position: "absolute", inset: 0 }}>
                    <GridCanvas
                      model={model}
                      viewport={{ w: deviceDims.w, h: deviceDims.h }}
                      selected={selectedCell}
                      onSelect={setSelectedCell}
                    />
                  </div>
                </div>
              </div>
              <div className="zoom-strip">
                <button data-testid="zoom-fit" className="zoom-fit" onClick={handleZoomFit}>Fit</button>
                <div className="zoom-sep" />
                <button data-testid="zoom-out" className="zoom-btn" onClick={handleZoomOut}>−</button>
                <span data-testid="zoom-level" className="zoom-pct">{zoomLevelText}</span>
                <button data-testid="zoom-in" className="zoom-btn" onClick={handleZoomIn}>+</button>
              </div>
            </div>

            {/* Right inspector + data flyout wrapper */}
            <div className="right-rail-wrap">
              {/* Data flyout — right-anchored, slides in over the inspector */}
              {dataFlyoutOpen && (
                <div data-testid="data-flyout" className="data-flyout">
                  <div className="data-flyout-header">
                    <span className="data-flyout-title">Bind Path</span>
                    <button
                      data-testid="data-flyout-close"
                      className="data-flyout-close"
                      onClick={() => setDataFlyoutOpen(false)}
                    >×</button>
                  </div>
                  <DataTree
                    provider={provider as unknown as LivePathSource}
                    selectedElementId={selectedElementId}
                    onBindPath={handleFlyoutBindPath}
                  />
                </div>
              )}
              <Inspector
                model={model}
                selectedCell={selectedCell}
                manifest={manifest}
                provider={provider}
                onChange={setModel}
                onBrowseData={handleBrowseData}
              />
            </div>
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

      {/* Mobile bottom tab bar — only visible <768px via CSS */}
      <div data-testid="mobile-tabbar" className="mobile-tabbar">
        {(["elements", "data", "layout", "inspector"] as const).map(tab => (
          <button
            key={tab}
            className={`mobile-tab-btn${mobileSheet === tab ? " active" : ""}`}
            onClick={() => setMobileSheet(prev => prev === tab ? null : tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Mobile bottom sheet */}
      {mobileSheet && (
        <div data-testid="mobile-sheet" data-mobile-sheet={mobileSheet} className="mobile-sheet">
          <div className="sheet-handle-bar"><div className="sheet-handle" /></div>
          <div className="sheet-header">
            <span className="sheet-title">{mobileSheet.charAt(0).toUpperCase() + mobileSheet.slice(1)}</span>
            <button className="sheet-close" onClick={() => setMobileSheet(null)}>×</button>
          </div>
          <div className="sheet-body">
            {mobileSheet === "elements" && manifest ? <Palette manifest={manifest} onAdd={handleAddElement} /> : null}
            {mobileSheet === "data" ? <DataTree provider={provider as unknown as LivePathSource} selectedElementId={selectedElementId} onBindPath={handleBindPath} /> : null}
            {mobileSheet === "layout" && manifest ? <ElementsList model={model} onSelectCell={setSelectedCell} onRemoveElement={handleRemoveFromList} /> : null}
            {mobileSheet === "inspector" && manifest ? <Inspector model={model} selectedCell={selectedCell} manifest={manifest} provider={provider} onChange={setModel} onBrowseData={handleBrowseData} /> : null}
          </div>
        </div>
      )}

      {/* Preview error indicator */}
      {previewError && (
        <div data-testid="preview-error">{previewError}</div>
      )}

      {/* Status bar — shown once manifest is available */}
      {manifest && (() => {
        const maxTiles = manifest.classes.find((c) => c.id === className)?.maxTiles ?? 4;
        const lint = lintDeviceCapabilities(model, maxTiles, manifest);
        return (
          <>
            <div data-testid="status-bar">
              {(() => {
                const v = validateModel(model, manifest);
                if (v.ok) {
                  return (
                    <>
                      <span className="status-valid-indicator">✓ Valid for {className}</span>
                      <span style={{ color: "var(--ink-faint, #5b7286)", fontSize: "10px" }}>· structural · semantic · capability</span>
                      <span className="status-spacer" />
                      {lint.length > 0 && (
                        <button
                          data-testid="device-lint-toggle"
                          onClick={() => setDeviceLintOpen((o) => !o)}
                          title="Features that will not reach the device display"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--warn, #ffb84d)", fontSize: "11px", padding: "0 6px" }}
                        >
                          ▲ {lint.length} won&apos;t reach device {deviceLintOpen ? "▾" : "▸"}
                        </button>
                      )}
                      <span className="status-autosave" data-testid="save-state">
                        {saving ? "saving…" : dirty ? "unsaved changes" : "saved"}
                      </span>
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
            {deviceLintOpen && lint.length > 0 && (
              <div data-testid="device-lint" style={{ padding: "6px 12px", borderTop: "1px solid var(--line, #1d2b3a)", fontSize: "11px", maxHeight: "160px", overflow: "auto" }}>
                <div style={{ opacity: 0.6, marginBottom: "4px" }}>
                  These authored features render in the preview but are dropped or degraded on the boat display:
                </div>
                <ul style={{ margin: 0, paddingLeft: "16px" }}>
                  {lint.map((iss, i) => (
                    <li key={i} data-testid={`device-lint-item-${i}`} style={{ marginBottom: "2px", color: iss.kind === "drop" ? "var(--danger, #ff5252)" : "var(--warn, #ffb84d)" }}>
                      {iss.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
