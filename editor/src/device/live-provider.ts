// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// DataProvider fed by the display's `GET /api/midl/live` endpoint.
//
//   GET /api/midl/live?paths=<p1,p2,...>&locals=<id1,id2,...>
//   -> { t, values: { "<path>": number|string|null }, locals: { "<id>": ... } }
//
// Values are raw SignalK SI (no sourceUnit is attached: the renderer infers the
// SI unit from the path and applies `format.unit`, exactly like the device).
// Local ids come back in display units / as text and are shown as-is.
//
// The set of keys polled = the keys collected from the open document
// (setDoc / want) plus every binding the renderer asks for (getValue), so a
// binding added while editing starts polling on the next tick. Polls ~1 Hz
// while the page is visible, pauses when hidden, and backs off exponentially on
// errors (401 included: the page then asks the user to sign in).

import type { Source } from "@yey-boats/midl";
import type { DataProvider, ResolvedValue } from "@yey-boats/midl-web";
import type { LivePathSource, PathInfo } from "../adapters";
import { DeviceApi, DeviceApiError } from "./device-api";

const STALE_MS = 10_000;

/** Every SignalK path and local id bound anywhere in a MIDL document
 *  (element bindings, marker sources, variants...). Sorted, de-duplicated. */
export function collectLiveKeys(doc: unknown): { paths: string[]; locals: string[] } {
  const paths = new Set<string>();
  const locals = new Set<string>();
  const seen = new Set<unknown>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    const o = v as Record<string, unknown>;
    if (o.kind === "signalk" && typeof o.path === "string" && o.path) paths.add(o.path);
    else if (o.kind === "local" && typeof o.id === "string" && o.id) locals.add(o.id);
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(doc);
  return { paths: [...paths].sort(), locals: [...locals].sort() };
}

export type LiveState = "idle" | "ok" | "error" | "auth" | "paused";

export interface LiveStatus {
  state: LiveState;
  failures: number;
  /** Delay before the next poll (ms). */
  nextInMs: number;
  lastError?: string;
  /** Device clock of the last good answer. */
  deviceT?: number;
}

export interface DeviceLiveProviderOpts {
  api: DeviceApi;
  intervalMs?: number;
  maxBackoffMs?: number;
  /** Page visibility (defaults to document.visibilityState). */
  isVisible?: () => boolean;
  /** Hook to be told about visibility changes; returns an unsubscribe. */
  onVisibilityChange?: (cb: () => void) => () => void;
}

interface Stored {
  value: number | string;
  updatedAt: number;
}

function defaultVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function defaultVisibilityHook(cb: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

export class DeviceLiveProvider implements DataProvider, LivePathSource {
  private api: DeviceApi;
  private intervalMs: number;
  private maxBackoffMs: number;
  private isVisible: () => boolean;
  private unVis: (() => void) | null = null;
  private onVis: DeviceLiveProviderOpts["onVisibilityChange"];

  private docPaths = new Set<string>();
  private docLocals = new Set<string>();
  private seenPaths = new Set<string>();
  private seenLocals = new Set<string>();

  private values = new Map<string, Stored>();
  private locals = new Map<string, Stored>();
  private injected = new Map<string, { value: unknown; sourceUnit?: string; updatedAt: number }>();

  private subs = new Set<{ paths: Set<string>; cb: () => void }>();
  private changeListeners = new Set<() => void>();
  private statusListeners = new Set<(s: LiveStatus) => void>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;
  private running = false;
  private status: LiveStatus = { state: "idle", failures: 0, nextInMs: 0 };

  constructor(opts: DeviceLiveProviderOpts) {
    this.api = opts.api;
    this.intervalMs = opts.intervalMs ?? 1000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 30_000;
    this.isVisible = opts.isVisible ?? defaultVisible;
    this.onVis = opts.onVisibilityChange ?? defaultVisibilityHook;
  }

  // ── Wanted keys ────────────────────────────────────────────────────────────

  /** Replace the keys of the open document (also forgets keys seen via getValue). */
  setDoc(doc: unknown): void {
    const k = collectLiveKeys(doc);
    this.want(k.paths, k.locals);
  }

  want(paths: string[], locals: string[]): void {
    this.docPaths = new Set(paths);
    this.docLocals = new Set(locals);
    this.seenPaths.clear();
    this.seenLocals.clear();
  }

  /** The keys the next poll asks for (sorted for a stable URL). */
  wanted(): { paths: string[]; locals: string[] } {
    return {
      paths: [...new Set([...this.docPaths, ...this.seenPaths])].sort(),
      locals: [...new Set([...this.docLocals, ...this.seenLocals])].sort(),
    };
  }

  // ── DataProvider ───────────────────────────────────────────────────────────

  now(): number {
    return Date.now();
  }

  getValue(binding: Source): ResolvedValue {
    if (binding.kind === "const") return { value: binding.value, stale: false, present: true };
    if (binding.kind === "signalk") {
      if (!this.docPaths.has(binding.path)) this.seenPaths.add(binding.path);
      const inj = this.injected.get(binding.path);
      if (inj) return { value: inj.value, sourceUnit: inj.sourceUnit, updatedAt: inj.updatedAt, present: true, stale: false };
      return this.resolve(this.values.get(binding.path));
    }
    if (binding.kind === "local") {
      if (!this.docLocals.has(binding.id)) this.seenLocals.add(binding.id);
      return this.resolve(this.locals.get(binding.id));
    }
    return { value: undefined, stale: false, present: false };
  }

  private resolve(s: Stored | undefined): ResolvedValue {
    if (!s) return { value: undefined, stale: false, present: false };
    return { value: s.value, updatedAt: s.updatedAt, present: true, stale: Date.now() - s.updatedAt > STALE_MS };
  }

  subscribe(paths: string[], cb: () => void): () => void {
    const e = { paths: new Set(paths), cb };
    this.subs.add(e);
    return () => { this.subs.delete(e); };
  }

  // ── LivePathSource (the editor's Data tab) ────────────────────────────────

  knownPaths(): PathInfo[] {
    const out = new Map<string, PathInfo>();
    for (const [path, s] of this.values) out.set(path, { path, value: s.value, updatedAt: s.updatedAt });
    for (const [path, s] of this.injected) out.set(path, { path, value: s.value, sourceUnit: s.sourceUnit, updatedAt: s.updatedAt, injected: true });
    return [...out.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  inject(path: string, value: unknown, sourceUnit?: string): void {
    this.injected.set(path, { value, sourceUnit, updatedAt: Date.now() });
    this.emitChange();
  }

  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb);
    return () => { this.changeListeners.delete(cb); };
  }

  onStatus(cb: (s: LiveStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => { this.statusListeners.delete(cb); };
  }

  getStatus(): LiveStatus {
    return this.status;
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.unVis = this.onVis ? this.onVis(() => this.onVisibility()) : null;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    this.unVis?.();
    this.unVis = null;
  }

  /** Poll now (e.g. after opening a record) instead of waiting for the tick. */
  kick(): void {
    if (!this.running || this.inflight) return;
    this.schedule(0);
  }

  private onVisibility(): void {
    if (!this.running) return;
    if (this.isVisible()) this.schedule(0);
    else {
      this.clearTimer();
      this.setStatus({ ...this.status, state: "paused", nextInMs: 0 });
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(ms: number): void {
    this.clearTimer();
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, ms);
  }

  private backoff(failures: number): number {
    return Math.min(this.intervalMs * 2 ** failures, this.maxBackoffMs);
  }

  /** One poll. Exposed for tests; normally driven by the timer. */
  async tick(): Promise<void> {
    if (!this.running) return;
    if (!this.isVisible()) {
      this.setStatus({ ...this.status, state: "paused", nextInMs: 0 });
      return; // resumed by the visibilitychange hook
    }
    const { paths, locals } = this.wanted();
    if (paths.length === 0 && locals.length === 0) {
      this.schedule(this.intervalMs);
      return;
    }
    this.inflight = true;
    try {
      const snap = await this.api.live(paths, locals);
      if (!this.running) return;
      this.ingest(snap?.values ?? {}, snap?.locals ?? {});
      this.setStatus({ state: "ok", failures: 0, nextInMs: this.intervalMs, deviceT: snap?.t });
      this.schedule(this.intervalMs);
    } catch (err) {
      if (!this.running) return;
      const failures = this.status.failures + 1;
      const auth = err instanceof DeviceApiError && err.code === "auth";
      const nextInMs = this.backoff(failures);
      this.setStatus({
        state: auth ? "auth" : "error",
        failures,
        nextInMs,
        lastError: err instanceof Error ? err.message : String(err),
      });
      this.schedule(nextInMs);
    } finally {
      this.inflight = false;
    }
  }

  private ingest(values: Record<string, unknown>, locals: Record<string, unknown>): void {
    const now = Date.now();
    const changed = new Set<string>();
    const apply = (map: Map<string, Stored>, src: Record<string, unknown>, tag: (k: string) => string) => {
      for (const k of Object.keys(src)) {
        const v = src[k];
        const ok = (typeof v === "number" && Number.isFinite(v)) || typeof v === "string";
        const prev = map.get(k);
        if (ok) {
          if (!prev || prev.value !== v) changed.add(tag(k));
          map.set(k, { value: v as number | string, updatedAt: now });
        } else if (prev) {
          // null: the device has no value (yet / any more) -> render "no data".
          map.delete(k);
          changed.add(tag(k));
        }
      }
    };
    apply(this.values, values, (k) => k);
    apply(this.locals, locals, (k) => `local:${k}`);
    if (changed.size === 0) return;
    this.subs.forEach((s) => {
      for (const p of s.paths) if (changed.has(p)) { s.cb(); return; }
    });
    this.emitChange();
  }

  private emitChange(): void {
    this.changeListeners.forEach((cb) => cb());
  }

  private setStatus(s: LiveStatus): void {
    this.status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }
}
