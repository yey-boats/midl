// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { parseDoc } from "@yey-boats/midl";
import type { ConfigDoc, Manifest, Rect, Issue, Element } from "@yey-boats/midl";
import { previewConfig, type ScreenPlan } from "./preview";
import { paintScreen, TrendBuffers } from "./paint";
import { theme, type Theme } from "./theme";
import { collectBindings, type DataProvider } from "./data";

export interface RenderResult { ok: boolean; issues: Issue[]; paths: string[]; }

export interface PreparedDashboard {
  ok: boolean;
  issues: Issue[];
  paths: string[];
  screens: ScreenPlan[];
  elements: Record<string, Record<string, Element>>;
}

// Validate + parse + solve ONCE. Call this when text/class/viewport change, not per frame.
export function prepareDashboard(text: string, manifest: Manifest, className: string, viewport: Rect): PreparedDashboard {
  const res = previewConfig(text, manifest, className, viewport);
  if (!res.ok) return { ok: false, issues: res.issues as Issue[], paths: [], screens: [], elements: {} };
  const doc = parseDoc(text) as ConfigDoc;
  return { ok: true, issues: [], paths: collectBindings(doc), screens: res.screens, elements: res.elements };
}

// Repaint a prepared dashboard with current provider values. Cheap; safe to call per frame.
export function paintPrepared(ctx: CanvasRenderingContext2D, prepared: PreparedDashboard, provider: DataProvider, th: Theme, trends?: TrendBuffers): void {
  for (const sp of prepared.screens) paintScreen(ctx, sp.placements, prepared.elements[sp.screenId], provider, th, trends);
}

export function renderDashboard(
  ctx: CanvasRenderingContext2D,
  text: string,
  manifest: Manifest,
  className: string,
  viewport: Rect,
  provider: DataProvider,
  opts: { theme?: string; trends?: TrendBuffers } = {},
): RenderResult {
  const prep = prepareDashboard(text, manifest, className, viewport);
  if (!prep.ok) return { ok: false, issues: prep.issues, paths: [] };
  paintPrepared(ctx, prep, provider, theme(opts.theme), opts.trends);
  return { ok: true, issues: [], paths: prep.paths };
}

export { TrendBuffers } from "./paint";
