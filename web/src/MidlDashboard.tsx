// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { useEffect, useRef } from "react";
import type { Issue, Manifest, Rect } from "@yey-boats/midl";
import { prepareDashboard, paintPrepared } from "./render";
import { HistoryStore } from "./history";
import { theme } from "./theme";
import type { DataProvider } from "./data";

export interface MidlDashboardProps {
  text: string;
  manifest: Manifest;
  className: string;
  viewport: Rect;
  provider: DataProvider;
  theme?: string;
  onIssues?: (issues: Issue[]) => void;
  /** Trend history store to draw into. Pass one instance to keep the charts
   *  across remounts; by default the dashboard keeps its own per mount. */
  history?: HistoryStore;
}

/** Repaint cadence while trend tiles are on screen, so charts scroll one
 *  bucket per step even when no value changes. */
const TREND_TICK_MS = 1000;

export function MidlDashboard(props: MidlDashboardProps) {
  const { text, manifest, className, viewport, provider, theme: themeName, onIssues, history } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const own = useRef<HistoryStore | null>(null);
  if (!own.current) own.current = new HistoryStore();
  const store = history ?? own.current;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = viewport.w;
    canvas.height = viewport.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prep = prepareDashboard(text, manifest, className, viewport);
    onIssues?.(prep.issues);

    const th = theme(themeName);
    let raf = 0;
    let tick: ReturnType<typeof setInterval> | undefined;
    let unsub: () => void = () => {};

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paintPrepared(ctx, prep, provider, th, store);
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };

    if (prep.ok) {
      unsub = provider.subscribe(prep.paths, schedule);
      store.onUpdate = schedule; // a backfill landed
      const hasTrend = Object.values(prep.elements).some((els) => Object.values(els).some((el) => el.type === "trend"));
      if (hasTrend) tick = setInterval(schedule, TREND_TICK_MS);
      draw();
    }

    return () => {
      cancelAnimationFrame(raf);
      if (tick) clearInterval(tick);
      if (store.onUpdate === schedule) store.onUpdate = undefined;
      unsub();
    };
  }, [text, manifest, className, viewport.w, viewport.h, provider, themeName, onIssues, store]);

  return <canvas ref={canvasRef} style={{ width: viewport.w, height: viewport.h, maxWidth: "100%" }} />;
}
