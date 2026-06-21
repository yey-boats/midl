// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { parseDoc } from "@yey-boats/midl";
import type { ConfigDoc, Manifest, Rect, Issue } from "@yey-boats/midl";
import { previewConfig } from "./preview";
import { paintScreen, TrendBuffers } from "./paint";
import { theme } from "./theme";
import { collectBindings, type DataProvider } from "./data";

export interface RenderResult { ok: boolean; issues: Issue[]; paths: string[]; }

export function renderDashboard(
  ctx: CanvasRenderingContext2D,
  text: string,
  manifest: Manifest,
  className: string,
  viewport: Rect,
  provider: DataProvider,
  opts: { theme?: string; trends?: TrendBuffers } = {},
): RenderResult {
  const res = previewConfig(text, manifest, className, viewport);
  if (!res.ok) return { ok: false, issues: res.issues as Issue[], paths: [] };
  const th = theme(opts.theme);
  for (const sp of res.screens) paintScreen(ctx, sp.placements, res.elements[sp.screenId], provider, th, opts.trends);
  const doc = parseDoc(text) as ConfigDoc;
  return { ok: true, issues: [], paths: collectBindings(doc) };
}

export { TrendBuffers } from "./paint";
