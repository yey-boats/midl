// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { ConfigDoc, HistoryAgg, Source } from "@yey-boats/midl";

// Generic renderer data seam. The renderer pulls values through `DataProvider`;
// it has no transport knowledge. Transport-specific providers (e.g. a
// SignalK provider that ingests `yey.signalk.paths.v1` batches) live
// PLATFORM-SIDE and implement this interface — they are NOT part of the generic
// `@yey-boats/midl-web` renderer.

export interface ResolvedValue {
  value: unknown;
  sourceUnit?: string;
  updatedAt?: number;
  /** True when the value is older than the provider's freshness ceiling. */
  stale: boolean;
  /** False when the bound path has never produced a value (distinct no-data state). */
  present: boolean;
}

/** A trend series' backfill request (docs/specs/2026-11-15-trend-history.md §4). */
export interface HistoryRequest {
  /** Chart window in seconds. */
  window_s: number;
  /** Bucket width in seconds (window / points). */
  step_s: number;
  /** How the server should aggregate each step (SignalK History API method:
   *  avg -> average, min, max, last). */
  agg: HistoryAgg;
}

export interface DataProvider {
  getValue(binding: Source): ResolvedValue;
  /** Notify `cb` when any of `paths` updates; returns an unsubscribe. */
  subscribe(paths: string[], cb: () => void): () => void;
  now(): number;
  /** Optional trend backfill: past values of a SignalK `path` over the last
   *  `window_s`, as [epoch ms, raw SI value] rows. Called once per series per
   *  history store; reject / resolve [] when there is no history. */
  history?(path: string, req: HistoryRequest): Promise<Array<[number, number]>>;
}

const NO_DATA: ResolvedValue = { value: undefined, stale: false, present: false };

/** A provider backed by a fixed value map — used by the standalone demo and by tests. */
export class MockDataProvider implements DataProvider {
  constructor(private values: Record<string, { value: unknown; sourceUnit?: string }>) {}
  now(): number { return 0; }
  getValue(binding: Source): ResolvedValue {
    if (binding.kind === "const") return { value: binding.value, stale: false, present: true };
    if (binding.kind !== "signalk") return NO_DATA;
    const v = this.values[binding.path];
    return v ? { value: v.value, sourceUnit: v.sourceUnit, updatedAt: 0, present: true, stale: false } : NO_DATA;
  }
  subscribe(_paths: string[], _cb: () => void): () => void { return () => {}; }
}

/** Deduplicated `kind:"signalk"` paths a document (or one screen) binds. `signalk` is a
 *  MIDL source kind, so this is generic MIDL — not transport-specific. */
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
