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
