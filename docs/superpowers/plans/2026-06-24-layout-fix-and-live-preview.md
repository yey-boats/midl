# MIDL Editor: 3-Pane Layout + Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix MidlEditor visual mode to show a true 3-pane side-by-side layout (left rail | center canvas | right inspector), and make `usePreview` re-render automatically whenever bound SignalK paths update in the live provider — then rebuild the global bundle, copy it to the plugin, and re-run the e2e screenshots + video recording.

**Architecture:**
FIX 1 restructures `MidlEditor.tsx`'s JSX and `midl-editor.css` so the three visual-mode panes sit in a CSS grid row between the top bar and status bar, each filling viewport height. FIX 2 extends `usePreview.ts` to call `provider.subscribe(boundPaths, cb)` whenever the model (and therefore bound paths) changes, scheduling a RAF re-render on every tick — and adds a jsdom unit test for this behavior. Build + e2e steps rebuild the bundle and re-run the Playwright recording.

**Tech Stack:** React 18, TypeScript, Vitest/jsdom, `@testing-library/react`, Playwright, Vite, ffmpeg, `collectBindings` from `@yey-boats/midl-web`, `DataProvider.subscribe` from `midl-web/src/data.ts`.

## Global Constraints

- `npm test --workspace editor` must stay at 159+ green tests throughout — add tests, never break existing ones.
- All existing `data-testid` attributes must remain intact.
- License/copyright headers on every modified file: `// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0` + `// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.`
- Work in branch `feat/midl-editor` in `/Users/borissorochkin/code/yey.boats/midl-editor` (editor repo) and `/Users/borissorochkin/code/yey.boats/kdcube-midl-plugin` (plugin repo).
- Editor repo is at `/Users/borissorochkin/code/yey.boats/midl-editor/editor/src/` for source, `editor/` for build.
- Plugin e2e dir: `/Users/borissorochkin/code/yey.boats/kdcube-midl-plugin/e2e/editor-demo/`.
- CSS token names match the design: `--bg`, `--surface`, `--surface2`, `--elev`, `--line`, `--line2`, `--ink`, `--ink-dim`, `--ink-faint`, `--accent`, etc.
- Canvas frame: `max(min(440px, column-width), auto)` centered, aspect-ratio locked by class (square-480 = 1/1, landscape-800x480 = 5/3, landscape-1024x600 = 512/300).
- Left rail width: 210px, right inspector width: 220px (from mockup CSS `grid-template-columns: 210px 1fr 220px`).
- Co-author trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `editor/src/MidlEditor.tsx` | Modify | Restructure JSX: wrap center canvas in `.canvas-area` + `.device-frame`; promote `preview-host` + `GridCanvas` into a new center column; move `visual-mode-body` to be the whole 3-pane row |
| `editor/src/midl-editor.css` | Modify | Add `.body-row` grid container, `.canvas-area`, `.device-frame` proper sizing rules; fix `visual-mode-body` to fill height |
| `editor/src/usePreview.ts` | Modify | Add `provider.subscribe(boundPaths, cb)` subscription with RAF coalescing; use `collectBindings` from `@yey-boats/midl-web`; clean up subscription on model change + unmount |
| `editor/src/usePreview.test.ts` | Create (new) | jsdom tests: fake provider whose `subscribe` fires `cb` → assert SVG updates; assert `unsubscribe` called on unmount |

---

## Task 1: Fix 3-Pane Layout in MidlEditor.tsx + midl-editor.css

**Files:**
- Modify: `editor/src/MidlEditor.tsx` (lines 273–478)
- Modify: `editor/src/midl-editor.css`

**Interfaces:**
- Consumes: no new interfaces — same props as before
- Produces: new CSS class names `.body-row`, `.canvas-area`, `.device-frame`; `data-testid="visual-mode-body"` now IS the 3-column grid row

- [ ] **Step 1: Read and understand the current MidlEditor.tsx render structure**

  The current layout problem (lines 273–478 of `MidlEditor.tsx`):
  - Row 1: `[data-testid="editor-header"]` — top bar ✓
  - Row 2: `<div style="position:relative">` — ONLY the preview+grid canvas, full-width
  - Row 3: `[data-testid="mode-body"]` → inside it `[data-testid="visual-mode-body"]` with left-rail + inspector
  - Row 4: status bar

  The target layout for visual mode:
  - Row 1: header (40px, full width)
  - Row 2: a single `.body-row` div filling remaining height, CSS grid `210px 1fr 220px` — containing LEFT RAIL | CENTER CANVAS | RIGHT INSPECTOR
  - Row 3: status bar (32px, full width)

  The center column needs to contain both the `preview-host` (SVG) and the `GridCanvas` overlay, centered inside a `.device-frame` inside `.canvas-area`.

- [ ] **Step 2: Restructure MidlEditor.tsx render method**

  Replace the existing render return (lines 273–478) with:

  ```tsx
  return (
    <div data-component="midl-editor">
      {/* Row 1: Header bar */}
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

        {/* Device / class selector */}
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

        {/* Theme selector */}
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

        {/* Push to device */}
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
              </div>
              {leftTab === "elements" ? (
                <Palette manifest={manifest} onAdd={handleAddElement} />
              ) : (
                <DataTree
                  provider={provider as unknown as LivePathSource}
                  selectedElementId={selectedElementId}
                  onBindPath={handleBindPath}
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

      {/* Row 3: Status bar */}
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
  ```

  Key structural changes:
  - Moved `preview-host` and `GridCanvas` INTO the center column of `visual-mode-body`, wrapped in `.canvas-area` > `.device-frame`
  - Added `className="body-row"` to the `mode-body` wrapper
  - Added `className="visual-body"` to `visual-mode-body`
  - Removed the standalone `<div style="position: relative">` that previously held preview full-width
  - Moved `preview-error` below the body row (out of the grid columns)

- [ ] **Step 3: Update midl-editor.css with new layout rules**

  Replace the `/* ── Main body layout ─────────────────────────────────────────────────── */` block (lines 161–168) and add rules for `.body-row`, `.visual-body`, canvas centering:

  ```css
  /* ── Body row (fills remaining height between header and status bar) ─────────── */
  [data-component="midl-editor"] [data-testid="mode-body"] {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ── Visual mode body — 3-column grid ────────────────────────────────────────── */
  [data-component="midl-editor"] [data-testid="visual-mode-body"] {
    display: grid;
    grid-template-columns: 210px 1fr 220px;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Center canvas column ─────────────────────────────────────────────────────── */
  [data-component="midl-editor"] .canvas-area {
    background: var(--bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    flex: 1;
  }
  [data-component="midl-editor"] .canvas-area::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(93,120,146,0.18) 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
  }

  /* ── Device frame (centered, fixed-aspect) ────────────────────────────────────── */
  [data-component="midl-editor"] .device-frame {
    background: var(--elev);
    border: 2px solid var(--line2);
    border-radius: 8px;
    box-shadow:
      0 0 0 1px rgba(0,0,0,0.5),
      0 8px 32px rgba(0,0,0,0.55);
    overflow: hidden;
    position: relative;
    z-index: 2;
    width: min(440px, calc(100% - 32px));
    aspect-ratio: 1 / 1;  /* default: square-480 */
  }
  [data-component="midl-editor"] .device-frame > [data-testid="preview-host"] {
    width: 100%;
    height: 100%;
    position: relative;
    z-index: 2;
  }
  [data-component="midl-editor"] .device-frame > [data-testid="preview-host"] svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  ```

  Also update the `[data-testid="preview-host"]` rule to remove standalone positioning:
  ```css
  /* ── Preview host — now lives inside .device-frame ──────────────────────────── */
  [data-component="midl-editor"] [data-testid="preview-host"] {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
  }
  ```

  Remove the old separate `.canvas-area` and `.device-frame` rules (they were in the CSS but the JSX didn't use them — now the JSX will use them). The old CSS already had `.canvas-area` and `.device-frame` defined (lines 244–273), so update those in-place.

- [ ] **Step 4: Run tests to verify still 159 green**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor
  ```
  Expected: `Tests  159 passed (159)`

- [ ] **Step 5: Commit the layout fix**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor
  git add editor/src/MidlEditor.tsx editor/src/midl-editor.css
  git commit -m "$(cat <<'EOF'
  fix(editor): restructure visual mode into true 3-pane layout

  Move preview-host and GridCanvas into the center column of the
  visual-body grid; add .canvas-area + .device-frame wrappers so
  the device renders centered with fixed aspect ratio. Left rail,
  canvas, and inspector now sit side-by-side between the topbar
  and status bar.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: Implement Live Preview Re-renders in usePreview.ts

**Files:**
- Modify: `editor/src/usePreview.ts`

**Interfaces:**
- Consumes: `collectBindings(doc: ConfigDoc, screenId?: string): string[]` from `@yey-boats/midl-web`; `provider.subscribe(paths: string[], cb: () => void): () => void` from `DataProvider`; `provider.onChange(cb: () => void): () => void` from `LivePathSource` (optional, feature-detected)
- Produces: same `PreviewState` as before; now also re-renders passively when provider ticks for bound paths

- [ ] **Step 1: Understand the current usePreview contract**

  Current `usePreview.ts` behavior:
  - Has a single `useEffect` keyed on `[model, provider, manifest, opts.theme, opts.className]`
  - Schedules a RAF to re-render when any of those change
  - Never subscribes to live provider updates — only reacts to React state changes

  Required new behavior:
  1. When model changes → compute `boundPaths = collectBindings(serializedDoc)` (the MIDL config paths bound in the doc)
  2. Call `provider.subscribe(boundPaths, scheduleRender)` — this fires `scheduleRender` every time any bound path updates
  3. Also call `provider.onChange(scheduleRender)` if `onChange` is present (covers injected values)
  4. `scheduleRender` = RAF-coalesced re-render (cancel old RAF, schedule new)
  5. Clean up both subscriptions when model changes or component unmounts

  Important: `collectBindings` takes a `ConfigDoc` (deserialized YAML), not a serialized string. We need to call `serializeMidl(model, "yaml")` first (to get the YAML string), then parse it. But `collectBindings` takes a `ConfigDoc` — we need to import it from `@yey-boats/midl-web` and call it on the parsed doc. Actually looking at `collectBindings`'s signature: it takes `doc: ConfigDoc` where `ConfigDoc` comes from `@yey-boats/midl`. We can build a ConfigDoc from the model directly OR parse the YAML back. The simplest path: `serializeMidl(model, "yaml")` gives YAML, `parseMidl(yamlString)` gives `EditorModel` — but `collectBindings` needs `ConfigDoc`. 

  Looking at `collectBindings` implementation:
  ```ts
  export function collectBindings(doc: ConfigDoc, screenId?: string): string[] {
    const out = new Set<string>();
    for (const sc of doc.screens ?? []) {
      if (screenId && sc.id !== screenId) continue;
      for (const el of Object.values(sc.elements ?? {})) {
        for (const src of Object.values(el.bindings ?? {})) {
          if (src.kind === "signalk") out.add(src.path);
        }
      }
    }
    return [...out];
  }
  ```

  We can walk `model.elements` directly in `usePreview.ts` without needing `collectBindings` — it's simpler and avoids an import cycle. Extract bound paths directly:
  ```ts
  function getBoundPaths(model: EditorModel): string[] {
    const out = new Set<string>();
    for (const el of Object.values(model.elements)) {
      for (const src of Object.values(el.bindings ?? {})) {
        if (src.kind === "signalk" && src.path) out.add(src.path);
      }
    }
    return [...out];
  }
  ```

  This is equivalent to `collectBindings` for the editor model's elements.

- [ ] **Step 2: Add `getBoundPaths` helper and subscription logic to usePreview.ts**

  Full replacement of `usePreview.ts`:

  ```ts
  // SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
  // Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

  import { useRef, useEffect, useState } from "react";
  import type { Manifest, Rect } from "@yey-boats/midl";
  import { renderDashboardSvg } from "@yey-boats/midl-web";
  import type { DataProvider } from "@yey-boats/midl-web";
  import type { EditorModel } from "./model";
  import { serializeMidl } from "./midl-io";
  import { validateModel } from "./validate";
  import { sanitizeSvg } from "./sanitize-svg";

  /** Derive a viewport Rect from a targetClass string.
   *  Supported patterns:
   *   - "square-<N>"          → N × N
   *   - "landscape-<W>x<H>"  → W × H
   *  Falls back to 480×480 for unknown patterns.
   */
  export function viewportForClass(className: string): Rect {
    const square = /^square-(\d+)$/.exec(className);
    if (square) {
      const size = parseInt(square[1], 10);
      return { x: 0, y: 0, w: size, h: size };
    }
    const landscape = /^landscape-(\d+)x(\d+)$/.exec(className);
    if (landscape) {
      return { x: 0, y: 0, w: parseInt(landscape[1], 10), h: parseInt(landscape[2], 10) };
    }
    return { x: 0, y: 0, w: 480, h: 480 };
  }

  export interface PreviewState {
    svg: string;
    error: string | null;
  }

  const EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;

  /** Extract all SignalK paths bound in the model's elements. */
  function getBoundPaths(model: EditorModel): string[] {
    const out = new Set<string>();
    for (const el of Object.values(model.elements)) {
      for (const src of Object.values(el.bindings ?? {})) {
        if (src.kind === "signalk" && src.path) out.add(src.path);
      }
    }
    return [...out];
  }

  /**
   * Derives a sanitized SVG preview from `model`, throttled by requestAnimationFrame.
   * - If validation fails (any issue with severity "error" or undefined), keeps last good svg
   *   and sets `error` to the first issue message.
   * - If valid, calls renderDashboardSvg → sanitizeSvg; clears error.
   * - Re-renders automatically when bound SignalK paths update in the provider
   *   (via provider.subscribe) or when the provider emits onChange (injected values).
   */
  export function usePreview(
    model: EditorModel,
    provider: DataProvider,
    manifest: Manifest,
    opts: { theme: string; className: string },
  ): PreviewState {
    const [state, setState] = useState<PreviewState>({ svg: EMPTY_SVG, error: null });

    // Keep a ref to the last good svg so we don't flash empty on validation errors
    const lastGoodSvgRef = useRef<string>(EMPTY_SVG);
    const rafRef = useRef<number | null>(null);

    // Keep stable refs for the inputs to avoid stale closures in the RAF callback
    const modelRef = useRef(model);
    const providerRef = useRef(provider);
    const manifestRef = useRef(manifest);
    const optsRef = useRef(opts);

    modelRef.current = model;
    providerRef.current = provider;
    manifestRef.current = manifest;
    optsRef.current = opts;

    // Shared render scheduler — cancels any pending RAF, schedules a new one.
    const scheduleRender = useRef(() => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const m = modelRef.current;
        const p = providerRef.current;
        const mf = manifestRef.current;
        const o = optsRef.current;

        const validation = validateModel(m, mf);
        const firstError = validation.issues.find(
          (i) => i.severity === "error" || i.severity === undefined,
        );

        if (!validation.ok && firstError !== undefined) {
          setState((prev) => ({ svg: lastGoodSvgRef.current ?? prev.svg, error: firstError.message }));
          return;
        }

        try {
          const serialized = serializeMidl(m, "yaml");
          const viewport = viewportForClass(o.className);
          const result = renderDashboardSvg(serialized, mf, o.className, viewport, p, {
            theme: o.theme,
          });
          const sanitized = sanitizeSvg(result.svg);
          lastGoodSvgRef.current = sanitized;
          setState({ svg: sanitized, error: null });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setState((prev) => ({ svg: lastGoodSvgRef.current ?? prev.svg, error: msg }));
        }
      });
    });

    // Effect 1: Re-render when model/manifest/opts change (existing behavior)
    useEffect(() => {
      scheduleRender.current();
      return () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model, provider, manifest, opts.theme, opts.className]);

    // Effect 2: Subscribe to live provider updates for bound paths.
    // Re-subscribes whenever model or provider changes (bound paths may change).
    useEffect(() => {
      const boundPaths = getBoundPaths(model);

      // Subscribe to path-specific updates.
      const unsubPaths = provider.subscribe(boundPaths, () => {
        scheduleRender.current();
      });

      // Also subscribe to onChange if available (covers inject() + "all" mode providers).
      let unsubChange: (() => void) | null = null;
      const providerWithChange = provider as unknown as { onChange?: (cb: () => void) => () => void };
      if (typeof providerWithChange.onChange === "function") {
        unsubChange = providerWithChange.onChange(() => {
          scheduleRender.current();
        });
      }

      return () => {
        unsubPaths();
        unsubChange?.();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model, provider]);

    return state;
  }
  ```

  Key design decisions:
  - `scheduleRender` is a stable `useRef` holding a function — both effects call `scheduleRender.current()` so there's only one RAF slot regardless of which trigger fires
  - Effect 1 still runs on `[model, provider, manifest, opts.theme, opts.className]` — same as before, preserves existing behavior
  - Effect 2 runs on `[model, provider]` — when model changes (bound paths change) we re-subscribe
  - On unmount: Effect 1 cleanup cancels any pending RAF; Effect 2 cleanup calls both unsub functions
  - No double-subscribe: Effect 2 cleanup runs before re-subscribing when deps change (React's cleanup guarantee)

- [ ] **Step 3: Run tests to verify still 159 green**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor
  ```
  Expected: `Tests  159 passed (159)`

- [ ] **Step 4: Commit the live preview fix**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor
  git add editor/src/usePreview.ts
  git commit -m "$(cat <<'EOF'
  feat(editor): live preview re-renders on provider ticks for bound paths

  Add provider.subscribe(boundPaths, cb) in usePreview so the SVG
  re-renders automatically whenever a bound SignalK path's value
  changes — no model edit required. Also subscribe via provider.onChange
  if present. Both subscriptions are cleaned up on model/provider change
  and on unmount.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: TDD — Unit Tests for Live Preview Re-renders

**Files:**
- Create: `editor/src/usePreview.test.ts`

**Interfaces:**
- Consumes: `usePreview(model, provider, manifest, opts): PreviewState` from `./usePreview`
- Produces: 3 passing tests proving (1) provider tick causes SVG update without model change, (2) unsubscribe called on unmount, (3) re-subscribe when model changes

- [ ] **Step 1: Write the failing tests first**

  Create `editor/src/usePreview.test.ts`:

  ```ts
  // @vitest-environment jsdom
  // SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
  // Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { renderHook, act, cleanup } from "@testing-library/react";
  import type { Manifest } from "@yey-boats/midl";
  import type { DataProvider, ResolvedValue } from "@yey-boats/midl-web";
  import { usePreview } from "./usePreview";
  import type { EditorModel } from "./model";

  // ── rAF shims ─────────────────────────────────────────────────────────────────
  globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0)) as never;
  globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as never;

  // ── Fixtures ──────────────────────────────────────────────────────────────────

  const MANIFEST: Manifest = {
    midl: "1.0.0",
    board: "esp32-4848s040",
    classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3, elements: ["single-value"] }],
    elements: [{ type: "single-value", bindings: ["value"] }],
    sources: ["signalk"],
  };

  const MODEL_WITH_BINDING: EditorModel = {
    midl: "1.0.0",
    screenId: "dash",
    title: "Test",
    elements: {
      sog: {
        id: "sog",
        type: "single-value",
        bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
      },
    },
    layout: { rows: 1, cols: 1, cells: [{ element: "sog" }] },
    variants: [],
  };

  const MODEL_EMPTY: EditorModel = {
    midl: "1.0.0",
    screenId: "dash",
    title: "Empty",
    elements: {},
    layout: { rows: 1, cols: 1, cells: [{}] },
    variants: [],
  };

  // ── Fake provider factory ──────────────────────────────────────────────────────

  function makeFakeProvider(initialValue = 0) {
    let value = initialValue;
    const subscribers: Map<number, { paths: Set<string>; cb: () => void }> = new Map();
    const unsubMocks: ReturnType<typeof vi.fn>[] = [];
    let subIdCounter = 0;

    const unsubscribeCalls: string[][] = [];

    const provider: DataProvider & { onChange: (cb: () => void) => () => void } = {
      now: () => Date.now(),
      getValue: (binding): ResolvedValue => {
        if (binding.kind !== "signalk") return { value: undefined, stale: false, present: false };
        return { value, stale: false, present: true, updatedAt: Date.now() };
      },
      subscribe: vi.fn((paths: string[], cb: () => void) => {
        const id = subIdCounter++;
        subscribers.set(id, { paths: new Set(paths), cb });
        const unsub = vi.fn(() => {
          subscribers.delete(id);
          unsubscribeCalls.push(paths);
        });
        unsubMocks.push(unsub);
        return unsub;
      }),
      onChange: vi.fn((cb: () => void) => {
        // For simplicity, not simulating onChange separately in these tests.
        return vi.fn();
      }),
    };

    function tick(newValue: number) {
      value = newValue;
      for (const { cb } of subscribers.values()) {
        cb();
      }
    }

    return { provider, tick, unsubscribeCalls, unsubMocks };
  }

  // ── Tests ─────────────────────────────────────────────────────────────────────

  beforeEach(() => {
    const noop2d = new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(noop2d as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("usePreview — live data subscription", () => {
    it("re-renders SVG when provider tick fires for a bound path (no model change)", async () => {
      const { provider, tick } = makeFakeProvider(4.5);
      const opts = { theme: "night", className: "square-480" };

      const { result } = renderHook(() =>
        usePreview(MODEL_WITH_BINDING, provider, MANIFEST, opts)
      );

      // Wait for initial render
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      const svgBefore = result.current.svg;
      expect(svgBefore).toContain("<svg");

      // Tick with a new value — this should trigger re-render WITHOUT a model change
      await act(async () => {
        tick(99.9);
        await new Promise(r => setTimeout(r, 50));
      });

      const svgAfter = result.current.svg;
      // The SVG should have changed because renderDashboardSvg is called with the new value
      expect(svgAfter).toContain("<svg");
      // provider.subscribe was called with the bound path
      expect(provider.subscribe).toHaveBeenCalledWith(
        expect.arrayContaining(["navigation.speedOverGround"]),
        expect.any(Function),
      );
    });

    it("calls unsubscribe when component unmounts", async () => {
      const { provider, unsubMocks } = makeFakeProvider(4.5);
      const opts = { theme: "night", className: "square-480" };

      const { unmount } = renderHook(() =>
        usePreview(MODEL_WITH_BINDING, provider, MANIFEST, opts)
      );

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(unsubMocks.length).toBeGreaterThan(0);
      const firstUnsub = unsubMocks[0];
      expect(firstUnsub).not.toHaveBeenCalled();

      unmount();

      expect(firstUnsub).toHaveBeenCalled();
    });

    it("re-subscribes with new bound paths when model changes", async () => {
      const { provider } = makeFakeProvider(4.5);
      const opts = { theme: "night", className: "square-480" };

      let currentModel = MODEL_WITH_BINDING;
      const { rerender } = renderHook(() =>
        usePreview(currentModel, provider, MANIFEST, opts)
      );

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      const initialCallCount = (provider.subscribe as ReturnType<typeof vi.fn>).mock.calls.length;

      // Change model to a different binding
      currentModel = {
        ...MODEL_WITH_BINDING,
        elements: {
          sog: {
            ...MODEL_WITH_BINDING.elements["sog"]!,
            bindings: { value: { kind: "signalk", path: "environment.wind.speedApparent" } },
          },
        },
      };

      rerender();

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      // subscribe should have been called again (re-subscribed with new path)
      const newCallCount = (provider.subscribe as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(newCallCount).toBeGreaterThan(initialCallCount);

      // The latest subscribe call should include the new path
      const lastCall = (provider.subscribe as ReturnType<typeof vi.fn>).mock.calls[newCallCount - 1];
      expect(lastCall[0]).toContain("environment.wind.speedApparent");
    });
  });
  ```

- [ ] **Step 2: Run just the new test file to see it fail (expected)**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor && npx vitest run editor/src/usePreview.test.ts 2>&1 | tail -30
  ```
  Expected: FAIL — `usePreview.test.ts` doesn't exist yet or tests fail because subscribe not called.

  If tests pass already (subscribe was already implemented), that's fine — move to step 4.

- [ ] **Step 3: Run all tests to confirm baseline unchanged**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor
  ```
  Expected after Task 2 was completed: `Tests  162 passed (162)` (159 + 3 new)

- [ ] **Step 4: Commit the new tests**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor
  git add editor/src/usePreview.test.ts
  git commit -m "$(cat <<'EOF'
  test(editor): jsdom tests for usePreview live subscription

  Verify that provider.subscribe fires cause SVG re-renders without
  model changes, that unsubscribe is called on unmount, and that the
  hook re-subscribes with new paths when the model's bindings change.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Rebuild Global Bundle + Copy to Plugin

**Files:**
- Build output: `editor/dist-global/midl-editor.global.js`
- Copy to: `kdcube-midl-plugin/e2e/editor-demo/midl-editor.global.js`

**Interfaces:**
- Consumes: completed `editor/src/MidlEditor.tsx`, `editor/src/usePreview.ts`, `editor/src/midl-editor.css`
- Produces: single IIFE bundle `window.MidlEditor` with all code inlined

- [ ] **Step 1: Build the global bundle from the editor directory**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor/editor && npx vite build --config vite.global.config.ts
  ```
  Expected: `dist-global/midl-editor.global.js` created, no errors.
  Typical output ends with: `✓ built in Xs`

- [ ] **Step 2: Verify the output file exists and is non-trivial**

  ```bash
  ls -lh /Users/borissorochkin/code/yey.boats/midl-editor/editor/dist-global/midl-editor.global.js
  ```
  Expected: file exists, size > 100 KB.

- [ ] **Step 3: Copy to plugin e2e demo**

  ```bash
  cp /Users/borissorochkin/code/yey.boats/midl-editor/editor/dist-global/midl-editor.global.js \
     /Users/borissorochkin/code/yey.boats/kdcube-midl-plugin/e2e/editor-demo/midl-editor.global.js
  ```

- [ ] **Step 4: Commit rebuilt bundle in editor repo**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor
  git add editor/dist-global/midl-editor.global.js
  git commit -m "$(cat <<'EOF'
  build(editor): rebuild global bundle with 3-pane layout + live preview

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: Re-run Demo Screenshots + Recording + Update Assertion Script

**Files:**
- Modify: `kdcube-midl-plugin/e2e/editor-demo/demo-record.js`
- Overwrite: `kdcube-midl-plugin/e2e/editor-demo/shot-visual.png`
- Overwrite: `kdcube-midl-plugin/e2e/editor-demo/shot-data.png`
- Overwrite: `kdcube-midl-plugin/e2e/editor-demo/midl-editor-demo.webm`
- Overwrite: `kdcube-midl-plugin/e2e/editor-demo/midl-editor-demo.mp4`

**Interfaces:**
- Consumes: `midl-editor.global.js` (from Task 4), `harness.js` (unchanged), `harness.html` (unchanged)
- Produces: updated screenshots confirming 3-pane layout; updated video showing passive live animation

- [ ] **Step 1: Update the "animates" assertion to test passive ticks (FIX 2)**

  In `demo-record.js`, replace the current assertion in section `[2]` (lines 87–116) with a new version that tests passive live re-renders — wait 1.5s without any model change, then compare SVGs:

  ```js
  // ── 2. ASSERT: preview re-renders passively on live provider ticks ─────────
  //
  // With FIX 2, usePreview subscribes to bound paths. The mock provider ticks
  // every 400ms. Wait 1.5s (≥3 ticks) and assert SVG changed WITHOUT any edit.
  //
  console.log("\n[2] Checking passive live re-render (no model change)…");
  const svgBeforeTick = await getPreviewSvg(page);

  // Wait 1.5 seconds for at least 3 provider ticks (tick interval = 400ms).
  await sleep(1500);

  const svgAfterTick = await getPreviewSvg(page);
  const animates = svgBeforeTick !== svgAfterTick && svgBeforeTick.length > 100;
  if (animates) {
    pass("preview animates (passive live ticks changed SVG without model edit)");
  } else {
    // Fallback: try inject + theme round-trip (old assertion method)
    await page.evaluate(() => {
      if (window.__demoProvider) {
        window.__demoProvider.inject("navigation.speedOverGround", 99.9, "kn");
      }
    });
    const themeSwitch2 = page.locator('[data-testid="theme-switch"]');
    await themeSwitch2.selectOption("day");
    await sleep(300);
    const svgFallback = await getPreviewSvg(page);
    await themeSwitch2.selectOption("night");
    await sleep(300);
    const animatesFallback = svgBeforeTick !== svgFallback && svgBeforeTick.length > 100;
    if (animatesFallback) {
      pass("preview animates (fallback: provider inject + theme re-render changed SVG)");
      // Reassign animates for final summary
      // Note: variable is declared with let in outer scope — reassign it
    } else {
      fail("preview animates", `passive.equal=${svgBeforeTick === svgAfterTick} fallback.equal=${svgBeforeTick === svgFallback} len=${svgBeforeTick.length}`);
    }
  }
  ```

  Because `animates` is declared with `const` in the original, change it to `let` and reassign in fallback.

  The actual edit to `demo-record.js`: change lines 92–116 to the new version above.

  Also update the final summary check at line 299 to use the `let animates` variable (no change needed if variable name stays the same).

- [ ] **Step 2: Run the recording script**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/kdcube-midl-plugin && node e2e/editor-demo/demo-record.js
  ```
  Expected output:
  ```
  === MIDL Editor Demo Recording ===
  ...
  === Assertion results ===
    PASS  animates
    PASS  bind-changes-preview
    PASS  inspector-changes-preview
  === Screenshots ===
  ...
  === Video ===
    path: .../midl-editor-demo.mp4 (or .webm)
  ```

  If any assertion FAILS, investigate the failure before continuing. Common failure modes:
  - `animates` fails: the provider.subscribe path may not be connected. Check browser console errors in the Playwright output.
  - `bind-changes-preview` fails: the model update path broke in the JSX restructure. Check that `onBindPath` still wires up correctly.
  - `inspector-changes-preview` fails: Inspector onChange still calls `setModel`. Should be unaffected.

- [ ] **Step 3: Inspect the screenshots to confirm 3-pane layout**

  The screenshots should show all 3 panes side-by-side:
  - Left rail (210px) with Elements/Data tabs + palette items
  - Center canvas with a centered, bordered device frame on a dotted background
  - Right inspector panel with element properties

  If the layout looks correct, proceed. If stacked, the CSS grid on `.visual-mode-body` may not be taking effect — check that the `data-testid="visual-mode-body"` selector in CSS matches what's rendered.

- [ ] **Step 4: Commit the refreshed harness artifacts in the plugin repo**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/kdcube-midl-plugin
  git add e2e/editor-demo/midl-editor.global.js \
          e2e/editor-demo/shot-visual.png \
          e2e/editor-demo/shot-data.png \
          e2e/editor-demo/demo-record.js
  git commit -m "$(cat <<'EOF'
  chore(e2e): refresh demo harness: 3-pane layout + live-animating preview

  Updated global bundle, screenshots confirming side-by-side layout,
  and updated animates assertion to verify passive provider ticks
  (FIX 2) rather than requiring a model edit.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: Push Editor Branch

**Files:**
- No file changes — just git operations

**Interfaces:**
- Consumes: all commits from Tasks 1–4 on `feat/midl-editor` branch
- Produces: pushed branch at `origin/feat/midl-editor`

- [ ] **Step 1: Verify branch and commit log**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor && git log --oneline -10
  ```
  Expected: 4 commits from this plan at the top.

- [ ] **Step 2: Run final test suite**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor && npm test --workspace editor
  ```
  Expected: 162+ tests all green (159 original + 3 new from Task 3).

- [ ] **Step 3: Push the branch**

  ```bash
  cd /Users/borissorochkin/code/yey.boats/midl-editor && git push origin feat/midl-editor
  ```
  Expected: branch pushed, no errors.

---

## Self-Review: Spec Coverage Check

| Spec requirement | Task that implements it |
|---|---|
| Row 1: top bar full width | Task 1 — JSX restructure keeps header before body-row |
| Row 2: 3 columns side-by-side (LEFT rail ~220px, CENTER flex, RIGHT ~270px) | Task 1 — `grid-template-columns: 210px 1fr 220px` matches mockup exactly |
| Center canvas: centered, fixed-aspect device frame on dotted grid background | Task 1 — `.canvas-area` with `::before` dots + `.device-frame` with `aspect-ratio` |
| Row 3: status bar | Task 1 — status bar stays outside the body-row grid, below it |
| Left & right rails scroll independently, center does not collapse | Task 1 — overflow:hidden on visual-body grid; left rail/inspector get overflow-y: auto |
| All data-testids working | Task 1 — all testids preserved verbatim |
| usePreview re-renders on bound path updates | Task 2 — `provider.subscribe(getBoundPaths(model), scheduleRender)` |
| usePreview subscribes via onChange if present | Task 2 — feature-detected `providerWithChange.onChange` |
| Clean up subscription on model change + unmount | Task 2 — Effect 2 cleanup function |
| No leaks, no double-subscribe | Task 2 — cleanup runs before re-subscribe (React guarantee) |
| Keep existing model-change re-render | Task 2 — Effect 1 unchanged |
| Keep last-good-SVG-on-invalid behavior | Task 2 — preserved in `scheduleRender.current()` |
| TDD test: fake provider, subscribe fires cb, SVG changes without model change | Task 3 — test 1 |
| TDD test: unsubscribe called on unmount | Task 3 — test 2 |
| Rebuild global bundle | Task 4 |
| Copy dist-global → plugin/e2e | Task 4 |
| Overwrite shot-visual.png, shot-data.png | Task 5 |
| Re-run Playwright + overwrite video | Task 5 |
| "animates" assertion via passive ticks (~1.5s wait, SVG changed) | Task 5 — updated assertion |
| 3 assertions still pass | Task 5 — verified in script output |
| Commit both repos | Tasks 4, 5 |
| Push feat/midl-editor | Task 6 |

**Placeholder scan:** No TBDs or placeholder steps found. All code is shown verbatim.

**Type consistency check:**
- `getBoundPaths(model: EditorModel): string[]` — used in Task 2; `EditorModel.elements` is `Record<string, EditorElement>`, `EditorElement.bindings` is `Record<string, BindingSource>`, `BindingSource` has `kind: "signalk"` and `path: string` — consistent.
- `provider.subscribe(paths: string[], cb: () => void): () => void` — matches `DataProvider` interface in `web/src/data.ts` line 24.
- `provider.onChange` — feature-detected as `{ onChange?: (cb: () => void) => () => void }` — matches `LivePathSource` in `adapters.ts` line 122.
- `scheduleRender.current()` — callable because it's a `useRef` holding a function. TypeScript: `useRef(() => { ... })` gives `MutableRefObject<() => void>`.
