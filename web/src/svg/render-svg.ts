// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// The SVG backend: a strict, generic, output-agnostic MIDL renderer. It
// dispatches ONLY on `element.type` and reads ONLY MIDL fields (type, name,
// style, format, bindings, markers). No per-screen / per-id special cases.
import type { Element, Placement, Manifest, Rect, Issue } from "@yey-boats/midl";
import type { DataProvider } from "../data";
import type { Theme } from "../theme";
import { theme, FONT_FAMILY } from "../theme";
import { resolveElement, type ElementModel } from "../model";
import { prepareDashboard, type RenderResult } from "../render";
import { TrendBuffers } from "../paint";
import { esc, f } from "./geometry";
import { frameSvg } from "./frame";
import { dialSvg } from "./dial";
import {
  singleValueSvg, textSvg, barSvg, gaugeSvg, trendSvg, autopilotSvg, buttonSvg,
} from "./tiles";

export { TrendBuffers } from "../paint";

const ROUND_TYPES = new Set(["compass", "windrose"]);

function str(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }
function numv(v: unknown): number | undefined { return typeof v === "number" ? v : undefined; }
function boolv(v: unknown): boolean { return v === true; }

function widgetSvg(el: Element, p: Placement, m: ElementModel, th: Theme, trends?: TrendBuffers): string {
  const rect = p.rect;
  const style = el.style ?? {};
  // Widget tiles render value/secondary only — the frame owns the top-left
  // caption. So we do NOT pass `title` into the tile builders. Dials are the
  // exception: they draw their own centre caption from the title.
  const opts = {
    size: numv(style.size),
    center: numv(style.center),
    unit: str(el.format?.unit),
  };
  switch (el.type) {
    case "compass":
      return dialSvg(rect, m, th.accent, th, { title: str(style.title), size: numv(style.size), shape: style.shape === "band" ? "band" : "round", hull: boolv(style.hull) });
    case "windrose":
      return dialSvg(rect, m, th.warn, th, { title: str(style.title), size: numv(style.size), shape: style.shape === "band" ? "band" : "round", hull: boolv(style.hull) });
    case "gauge":
      return gaugeSvg(rect, m, th, opts);
    case "bar":
      return barSvg(rect, m, th, opts);
    case "trend": {
      if (trends && m.numeric != null) trends.push(p.elementId, m.numeric);
      return trendSvg(rect, m, trends?.series(p.elementId) ?? [], th, opts);
    }
    case "autopilot":
      return autopilotSvg(rect, m, th, opts);
    case "button":
      return buttonSvg(rect, str(style.title) ?? el.name ?? "", th, opts);
    case "text":
      return textSvg(rect, m, th, opts);
    default:
      return singleValueSvg(rect, m, th, opts); // single-value
  }
}

// no-data placeholder: an em-dash centred in the rect.
function noDataSvg(rect: Rect, th: Theme): string {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return `<text x="${f(cx)}" y="${f(cy + 10)}" font-family="${FONT_FAMILY}" font-size="30" fill="${th.dim}" text-anchor="middle">—</text>`;
}

export function paintScreenSvg(
  placements: Placement[],
  elements: Record<string, Element>,
  provider: DataProvider,
  th: Theme,
  trends?: TrendBuffers,
): string {
  const out: string[] = [];
  for (const p of placements) {
    const el = elements[p.elementId];
    if (!el) continue;
    let m: ElementModel;
    try { m = resolveElement(el, provider); }
    catch { m = { state: "bad", text: "--" }; } // one bad binding never stops the loop
    const round = ROUND_TYPES.has(el.type);
    // A button carries no value binding (it is an action), so its model is
    // always "no-data" — it must still render its label, never the em-dash.
    const isButton = el.type === "button";
    // The frame draws the top-left caption for NON-round tiles; round dials own
    // their centre caption, so pass "" for them to avoid a double caption.
    const style = el.style ?? {};
    const frameTitle = round || isButton ? "" : (str(style.title) ?? el.name ?? "");
    out.push(frameSvg(p.rect, frameTitle, th, { noData: m.state === "no-data" && !isButton, stale: m.state === "stale", round }));
    if (m.state === "no-data" && !isButton) { out.push(noDataSvg(p.rect, th)); continue; }
    out.push(widgetSvg(el, p, m, th, trends));
  }
  return out.join("");
}

export function renderDashboardSvg(
  text: string,
  manifest: Manifest,
  className: string,
  viewport: Rect,
  provider: DataProvider,
  opts: { theme?: string; trends?: TrendBuffers } = {},
): RenderResult & { svg: string } {
  const th = theme(opts.theme);
  const head = `<svg viewBox="0 0 ${f(viewport.w)} ${f(viewport.h)}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;
  let prep: ReturnType<typeof prepareDashboard>;
  try { prep = prepareDashboard(text, manifest, className, viewport); }
  catch (e) { prep = { ok: false, issues: [{ path: "/", message: e instanceof Error ? e.message : "parse error" }] as Issue[], paths: [], screens: [], elements: {} }; }
  if (!prep.ok) {
    const cx = viewport.w / 2, cy = viewport.h / 2;
    const msg = prep.issues[0]?.message ?? "invalid MIDL document";
    const svg = `${head}<rect width="${f(viewport.w)}" height="${f(viewport.h)}" fill="${th.bg}"/>`
      + `<text x="${f(cx)}" y="${f(cy)}" font-family="${FONT_FAMILY}" font-size="18" fill="${th.bad}" text-anchor="middle">${esc(msg)}</text></svg>`;
    return { ok: false, issues: prep.issues, paths: [], svg };
  }
  const body: string[] = [`<rect width="${f(viewport.w)}" height="${f(viewport.h)}" fill="${th.bg}"/>`];
  for (const sp of prep.screens) {
    body.push(`<g data-screen="${esc(sp.screenId)}">${paintScreenSvg(sp.placements, prep.elements[sp.screenId], provider, th, opts.trends)}</g>`);
  }
  const svg = `${head}${body.join("")}</svg>`;
  return { ok: true, issues: [] as Issue[], paths: prep.paths, svg };
}
