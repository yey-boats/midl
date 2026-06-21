// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { Element } from "@yey-boats/midl";
import type { DataProvider } from "./data";
import { formatValue, convert } from "./format";

export type ModelState = "ok" | "stale" | "no-data" | "bad";
export interface ElementModel { state: ModelState; text: string; numeric?: number; fraction?: number; angleDeg?: number; dirDeg?: number; }

const ANGLE_TYPES = new Set(["compass", "windrose"]);
const NUMERIC_TYPES = new Set(["gauge", "bar", "trend", "compass", "windrose"]);

function asDeg(r: { value: unknown; sourceUnit?: string }): number | undefined {
  if (typeof r.value !== "number" || !Number.isFinite(r.value)) return undefined;
  return convert(r.value, r.sourceUnit, "deg");
}

export function resolveElement(el: Element, provider: DataProvider): ElementModel {
  const valueBinding = el.bindings?.value;
  if (!valueBinding) return { state: "no-data", text: "--" };
  const rv = provider.getValue(valueBinding);
  if (!rv.present) return { state: "no-data", text: "--" };

  const fmt = formatValue(rv.value, el.format, rv.sourceUnit);
  const numericRequired = NUMERIC_TYPES.has(el.type);
  if (numericRequired && fmt.numeric == null) return { state: "bad", text: "--" };

  const m: ElementModel = { state: rv.stale ? "stale" : "ok", text: fmt.text, numeric: fmt.numeric };

  if (el.type === "bar" || el.type === "gauge") {
    const range = (el.style?.range as [number, number] | undefined) ?? [0, 1];
    const [lo, hi] = range;
    if (fmt.numeric != null && hi !== lo) m.fraction = Math.max(0, Math.min(1, (fmt.numeric - lo) / (hi - lo)));
  }
  if (ANGLE_TYPES.has(el.type)) {
    m.angleDeg = asDeg(rv);
    const dirBinding = el.bindings?.dir;
    if (dirBinding) { const dr = provider.getValue(dirBinding); if (dr.present) m.dirDeg = asDeg(dr); }
  }
  return m;
}
