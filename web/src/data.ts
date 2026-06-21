// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { ConfigDoc, Source } from "@yey-boats/midl";

export interface PathSample { path: string; value: unknown; timestamp?: string; source?: string; sourceUnit?: string; }
export interface PathSampleBatch { schema: "yey.signalk.paths.v1"; context: string; generatedAt: string; samples: PathSample[]; }

export interface ResolvedValue { value: unknown; sourceUnit?: string; updatedAt?: number; stale: boolean; present: boolean; }

export interface DataProvider {
  getValue(binding: Source): ResolvedValue;
  subscribe(paths: string[], cb: () => void): () => void;
  now(): number;
}

const NO_DATA: ResolvedValue = { value: undefined, stale: false, present: false };

interface Entry { value: unknown; sourceUnit?: string; updatedAt: number; }

export interface SignalKProviderOptions { freshnessMs?: number; now?: () => number; registry?: Record<string, string>; }

export class SignalKDataProvider implements DataProvider {
  private store = new Map<string, Entry>();
  private subs = new Set<{ paths: Set<string>; cb: () => void }>();
  private freshnessMs: number;
  private clock: () => number;
  private registry: Record<string, string>;

  constructor(opts: SignalKProviderOptions = {}) {
    this.freshnessMs = opts.freshnessMs ?? 10000;
    this.clock = opts.now ?? (() => 0);
    this.registry = opts.registry ?? {};
  }

  now(): number { return this.clock(); }

  ingestBatch(batch: PathSampleBatch): void {
    const t = this.clock();
    const touched = new Set<string>();
    for (const s of batch.samples) {
      this.store.set(s.path, { value: s.value, sourceUnit: s.sourceUnit ?? this.registry[s.path], updatedAt: t });
      touched.add(s.path);
    }
    for (const sub of this.subs) {
      for (const p of touched) if (sub.paths.has(p)) { sub.cb(); break; }
    }
  }

  getValue(binding: Source): ResolvedValue {
    if (binding.kind === "const") return { value: binding.value, stale: false, present: true };
    if (binding.kind !== "signalk") return NO_DATA;
    const e = this.store.get(binding.path);
    if (!e) return NO_DATA;
    return { value: e.value, sourceUnit: e.sourceUnit, updatedAt: e.updatedAt, present: true, stale: this.clock() - e.updatedAt > this.freshnessMs };
  }

  subscribe(paths: string[], cb: () => void): () => void {
    const sub = { paths: new Set(paths), cb };
    this.subs.add(sub);
    return () => { this.subs.delete(sub); };
  }
}

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
