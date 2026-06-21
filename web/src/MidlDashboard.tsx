// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { useEffect, useRef } from "react";
import type { Issue, Manifest, Rect } from "@yey-boats/midl";
import { renderDashboard, TrendBuffers } from "./render";
import type { DataProvider } from "./data";

export interface MidlDashboardProps {
  text: string;
  manifest: Manifest;
  className: string;
  viewport: Rect;
  provider: DataProvider;
  theme?: string;
  onIssues?: (issues: Issue[]) => void;
}

export function MidlDashboard(props: MidlDashboardProps) {
  const { text, manifest, className, viewport, provider, theme, onIssues } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trends = useRef(new TrendBuffers());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = viewport.w;
    canvas.height = viewport.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let unsub: () => void = () => {};
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const r = renderDashboard(ctx, text, manifest, className, viewport, provider, { theme, trends: trends.current });
      onIssues?.(r.issues);
      if (!unsubBound && r.ok) { unsub = provider.subscribe(r.paths, schedule); unsubBound = true; }
    };
    let unsubBound = false;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    draw();

    return () => { cancelAnimationFrame(raf); unsub(); };
  }, [text, manifest, className, viewport.w, viewport.h, provider, theme, onIssues]);

  return <canvas ref={canvasRef} style={{ width: viewport.w, height: viewport.h, maxWidth: "100%" }} />;
}
