// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// createSignalKProvider — factory that opens a SignalK WebSocket, sends a
// subscribe message (the critical step the old plugin code omitted), ingests
// msg.updates[].values[] deltas, and returns a stable DataProvider.
//
// Port of the production useSignalKProvider.ts React hook into a plain
// factory so it can run inside a vanilla-page IIFE bundle (no React lifecycle).
//
// Exact message shapes and value contract match the production hook:
//   • getValue → { value, sourceUnit, updatedAt, present, stale }
//   • subscribe(paths, cb) → unsub fn
//   • Opens ws(s)://host/signalk/v1/stream?subscribe=none
//   • SENDS a subscribe message on open (fix for the plugin "not connecting" bug)
//   • Keepalive re-subscribe every ~25 s to keep the session alive
//   • Reconnect with capped exponential backoff (1 s → 15 s)
//   • sticky/everLive: once live data arrives last values stay on screen during
//     a reconnect; sample-data fallback for paths never yet populated
//   • close() tears down socket + timers

import type { DataProvider, ResolvedValue } from "@yey-boats/midl-web";
import type { Source } from "@yey-boats/midl";
import type { PathInfo, LivePathSource } from "./adapters";

// ── Constants ──────────────────────────────────────────────────────────────────

const STALE_MS = 10_000;
const KEEPALIVE_MS = 25_000; // re-subscribe every 25 s to keep session alive
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

// Default path set: mirrors the SAMPLES map in instruments-demo.js so callers
// that omit `paths` still get live updates for the full demo path set.
const DEFAULT_PATHS: string[] = [
  "navigation.speedOverGround",
  "navigation.headingTrue",
  "navigation.courseOverGroundTrue",
  "navigation.courseGreatCircle.nextPoint.distance",
  "navigation.courseGreatCircle.nextPoint.bearingTrue",
  "navigation.courseGreatCircle.crossTrackError",
  "navigation.courseRhumbline.nextPoint.distance",
  "navigation.courseRhumbline.nextPoint.bearingTrue",
  "navigation.courseRhumbline.bearingTrackTrue",
  "navigation.courseRhumbline.crossTrackError",
  "navigation.courseRhumbline.velocityMadeGood",
  "navigation.state",
  "environment.wind.speedApparent",
  "environment.wind.angleApparent",
  "environment.wind.angleTrueWater",
  "environment.wind.speedTrue",
  "environment.wind.directionTrue",
  "environment.depth.belowTransducer",
  "environment.depth.belowKeel",
  "environment.water.temperature",
  "performance.velocityMadeGood",
  "propulsion.main.revolutions",
  "propulsion.main.temperature",
  "propulsion.main.oilPressure",
  "tanks.fuel.0.currentLevel",
  "electrical.batteries.house.capacity.stateOfCharge",
  "electrical.batteries.house.stateOfCharge",
  "electrical.batteries.house.voltage",
  "electrical.batteries.house.current",
  "electrical.solar.0.panelPower",
  "steering.autopilot.state",
  "steering.autopilot.target.headingTrue",
  "steering.rudderAngle",
  "navigation.position",
  "navigation.speedThroughWater",
  "environment.current.drift",
];

// Sample fallback values (SI source units as SignalK delivers them).
const SAMPLES: Record<string, { value: unknown; sourceUnit?: string }> = {
  "navigation.speedOverGround": { value: 3.1, sourceUnit: "m/s" },
  "navigation.headingTrue": { value: 1.57, sourceUnit: "rad" },
  "navigation.courseOverGroundTrue": { value: 2.0, sourceUnit: "rad" },
  "navigation.courseGreatCircle.nextPoint.distance": { value: 4820, sourceUnit: "m" },
  "navigation.courseGreatCircle.nextPoint.bearingTrue": { value: 1.92, sourceUnit: "rad" },
  "navigation.courseGreatCircle.crossTrackError": { value: -12, sourceUnit: "m" },
  "navigation.courseRhumbline.nextPoint.distance": { value: 4820, sourceUnit: "m" },
  "navigation.courseRhumbline.nextPoint.bearingTrue": { value: 1.92, sourceUnit: "rad" },
  "navigation.courseRhumbline.bearingTrackTrue": { value: 1.95, sourceUnit: "rad" },
  "navigation.courseRhumbline.crossTrackError": { value: -12, sourceUnit: "m" },
  "navigation.courseRhumbline.velocityMadeGood": { value: 2.4, sourceUnit: "m/s" },
  "navigation.state": { value: "sailing" },
  "environment.wind.speedApparent": { value: 6.2, sourceUnit: "m/s" },
  "environment.wind.angleApparent": { value: 0.6, sourceUnit: "rad" },
  "environment.wind.angleTrueWater": { value: 0.95, sourceUnit: "rad" },
  "environment.wind.speedTrue": { value: 5.0, sourceUnit: "m/s" },
  "environment.wind.directionTrue": { value: 2.1, sourceUnit: "rad" },
  "environment.depth.belowTransducer": { value: 18.3, sourceUnit: "m" },
  "environment.depth.belowKeel": { value: 7.4, sourceUnit: "m" },
  "environment.water.temperature": { value: 291.15, sourceUnit: "K" },
  "performance.velocityMadeGood": { value: 2.4, sourceUnit: "m/s" },
  "propulsion.main.revolutions": { value: 30, sourceUnit: "Hz" },
  "propulsion.main.temperature": { value: 350, sourceUnit: "K" },
  "propulsion.main.oilPressure": { value: 350000, sourceUnit: "Pa" },
  "tanks.fuel.0.currentLevel": { value: 0.62, sourceUnit: "ratio" },
  "electrical.batteries.house.capacity.stateOfCharge": { value: 0.78, sourceUnit: "ratio" },
  "electrical.batteries.house.stateOfCharge": { value: 0.82, sourceUnit: "ratio" },
  "electrical.batteries.house.voltage": { value: 12.7, sourceUnit: "V" },
  "electrical.batteries.house.current": { value: 12.4, sourceUnit: "A" },
  "electrical.solar.0.panelPower": { value: 180, sourceUnit: "W" },
  "steering.autopilot.state": { value: "auto" },
  "steering.autopilot.target.headingTrue": { value: 1.6, sourceUnit: "rad" },
  "steering.rudderAngle": { value: 0.08, sourceUnit: "rad" },
  "navigation.position": { value: { latitude: 41.386, longitude: 2.1739 } },
  "navigation.speedThroughWater": { value: 2.9, sourceUnit: "m/s" },
  "environment.current.drift": { value: 0.6, sourceUnit: "m/s" },
  "trip.avgSpeed": { value: 5.4, sourceUnit: "m/s" },
  "trip.maxSpeed": { value: 8.1, sourceUnit: "m/s" },
  "tanks.freshWater.0.currentLevel": { value: 0.55, sourceUnit: "ratio" },
  "tanks.wasteWater.0.currentLevel": { value: 0.18, sourceUnit: "ratio" },
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface StoredValue {
  value: unknown;
  sourceUnit?: string;
  updatedAt: number;
}

interface Subscriber {
  paths: Set<string>;
  cb: () => void;
}

// ── Internal provider implementation ──────────────────────────────────────────

class SignalKProviderImpl implements DataProvider, LivePathSource {
  private values: Record<string, StoredValue> = Object.create(null);
  private injected: Record<string, StoredValue & { injected: true }> = Object.create(null);
  private subs: Set<Subscriber> = new Set();
  private changeListeners: Set<() => void> = new Set();
  /** Pending throttle timer for onChange notifications (16 ms ≈ 1 frame). */
  private changeThrottleTimer: ReturnType<typeof setTimeout> | null = null;

  now(): number {
    return Date.now();
  }

  getValue(binding: Source): ResolvedValue {
    if (binding.kind === "const") {
      return { value: binding.value, stale: false, present: true };
    }
    if (binding.kind === "local") {
      // local ids have no live SignalK source — always use sample fallback
      const s = SAMPLES[binding.id];
      return s
        ? { value: s.value, sourceUnit: s.sourceUnit, present: true, stale: false }
        : { value: undefined, stale: false, present: false };
    }
    if (binding.kind !== "signalk") {
      return { value: undefined, stale: false, present: false };
    }

    // Injected values take precedence over live data
    const inj = this.injected[binding.path];
    if (inj) {
      return {
        value: inj.value,
        sourceUnit: inj.sourceUnit,
        updatedAt: inj.updatedAt,
        present: true,
        stale: false,
      };
    }

    const live = this.values[binding.path];
    if (live) {
      return {
        value: live.value,
        sourceUnit: live.sourceUnit,
        updatedAt: live.updatedAt,
        present: true,
        stale: Date.now() - live.updatedAt > STALE_MS,
      };
    }

    // No live value yet — use sample fallback
    const s = SAMPLES[binding.path];
    if (s) {
      return { value: s.value, sourceUnit: s.sourceUnit, updatedAt: 0, present: true, stale: false };
    }

    return { value: undefined, stale: false, present: false };
  }

  subscribe(paths: string[], cb: () => void): () => void {
    const entry: Subscriber = { paths: new Set(paths), cb };
    this.subs.add(entry);
    return () => { this.subs.delete(entry); };
  }

  /** Ingest one path/value from a live delta. Returns true if stored. */
  ingest(path: string, value: unknown, sourceUnit?: string, ts?: number): boolean {
    // Drop null / undefined
    if (value === undefined || value === null) return false;
    // Drop non-finite numbers
    if (typeof value === "number" && !isFinite(value)) return false;

    this.values[path] = {
      value,
      sourceUnit,
      updatedAt: ts ?? Date.now(),
    };

    // Notify path-matched subscribers
    this.subs.forEach((s) => {
      if (s.paths.has(path)) s.cb();
    });

    // Notify catalogue change listeners (throttled)
    this.notifyChange();
    return true;
  }

  // ── LivePathSource methods ──────────────────────────────────────────────────

  /** All paths seen so far (live deltas + injected), sorted alphabetically by path. */
  knownPaths(): PathInfo[] {
    const result: PathInfo[] = [];

    // Live paths
    for (const path of Object.keys(this.values)) {
      const stored = this.values[path];
      result.push({
        path,
        value: stored.value,
        sourceUnit: stored.sourceUnit,
        updatedAt: stored.updatedAt,
      });
    }

    // Injected paths — merge into live or append
    for (const path of Object.keys(this.injected)) {
      const existing = result.find((r) => r.path === path);
      const inj = this.injected[path];
      if (existing) {
        // Overlay: show injected value in the same entry
        existing.value = inj.value;
        existing.sourceUnit = inj.sourceUnit;
        existing.updatedAt = inj.updatedAt;
        existing.injected = true;
      } else {
        result.push({
          path,
          value: inj.value,
          sourceUnit: inj.sourceUnit,
          updatedAt: inj.updatedAt,
          injected: true,
        });
      }
    }

    // Sort alphabetically by path
    result.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return result;
  }

  /**
   * Set a SESSION value for a path.
   * Overlays live data; getValue returns the injected value.
   * Injected values are ephemeral and never persisted.
   */
  inject(path: string, value: unknown, sourceUnit?: string): void {
    this.injected[path] = {
      value,
      sourceUnit,
      updatedAt: Date.now(),
      injected: true,
    };
    this.notifyChange();
  }

  /**
   * Subscribe to path catalogue changes (throttled per animation frame).
   * Returns an unsubscribe function.
   */
  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb);
    return () => { this.changeListeners.delete(cb); };
  }

  /** Fire change listeners, throttled to ~16 ms. */
  private notifyChange(): void {
    if (this.changeThrottleTimer !== null) return;
    this.changeThrottleTimer = setTimeout(() => {
      this.changeThrottleTimer = null;
      this.changeListeners.forEach((cb) => cb());
    }, 16);
  }
}

// ── Public options ─────────────────────────────────────────────────────────────

export interface CreateSignalKProviderOpts {
  /**
   * WebSocket URL for the SignalK stream endpoint.
   * Default: same-origin `/signalk/v1/stream` (protocol mapped ws:/wss:).
   */
  url?: string;
  /**
   * Paths to subscribe to.
   *   - string[]: subscribe to exactly these paths
   *   - "all": subscribe to all vessels.self deltas (wildcard — useful for an
   *     editor whose dashboard changes as you edit, so ANY bound path renders live)
   * Default: the built-in DEFAULT_PATHS set covering all standard demo paths.
   */
  paths?: string[] | "all";
  /**
   * How long to show sample data before the first live delta arrives (ms).
   * Not used by the provider itself — exposed for callers to implement fallback UI.
   * @deprecated pass-through only; the provider always falls back to sample internally.
   */
  sampleAfterMs?: number;
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Creates a live SignalK DataProvider backed by a WebSocket delta stream.
 *
 * CRITICAL FIX over the old plugin code: this provider SENDS a subscribe message
 * after `onopen` (the old hand-rolled provider opened ws?subscribe=none but never
 * sent a subscribe message, so the server delivered no deltas).
 *
 * Usage:
 *   const provider = createSignalKProvider({ paths: "all" });
 *   MidlEditor.mount(el, { provider, ... });
 *   // when done: provider.close();
 */
export function createSignalKProvider(
  opts?: CreateSignalKProviderOpts,
): DataProvider & LivePathSource & { close(): void } {
  const provider = new SignalKProviderImpl();

  // Resolve paths
  const pathsOpt = opts?.paths ?? DEFAULT_PATHS;

  // Resolve URL (same-origin default, maps http→ws, https→wss)
  function resolveUrl(): string {
    if (opts?.url) return opts.url;
    if (typeof window === "undefined") return "ws://localhost/signalk/v1/stream";
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + window.location.host + "/signalk/v1/stream";
  }

  // Mutable transport state
  let ws: WebSocket | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 0;
  let closed = false; // set by close() to stop reconnects permanently

  function clearKeepalive() {
    if (keepaliveTimer !== null) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  }

  function clearReconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  /** Build and send the SignalK subscribe message.
   *
   *  For paths:"all" we use the wildcard `{"context":"vessels.self","subscribe":[{"path":"*"}]}`
   *  which requests all deltas from the self vessel — so any path bound in the current
   *  editor dashboard receives live updates without needing to re-subscribe on each edit.
   *
   *  For a specific path list we mirror the production hook exactly:
   *  `{ context, subscribe: paths.map(p => ({ path, period:1000, format:"full", policy:"ideal", minPeriod:200 })) }`
   */
  function sendSubscribe(sock: WebSocket): void {
    if (sock.readyState !== WebSocket.OPEN) return;
    let msg: object;
    if (pathsOpt === "all") {
      msg = { context: "vessels.self", subscribe: [{ path: "*" }] };
    } else {
      msg = {
        context: "vessels.self",
        subscribe: pathsOpt.map((path) => ({
          path,
          period: 1000,
          format: "full",
          policy: "ideal",
          minPeriod: 200,
        })),
      };
    }
    sock.send(JSON.stringify(msg));
  }

  function scheduleReconnect(): void {
    if (closed) return;
    clearReconnect();
    reconnectDelay = reconnectDelay
      ? Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
      : RECONNECT_MIN_MS;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!closed) openSocket();
    }, reconnectDelay);
  }

  function openSocket(): void {
    if (closed) return;

    const url = resolveUrl() + "?subscribe=none";
    let sock: WebSocket;
    try {
      sock = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws = sock;

    sock.onopen = () => {
      if (closed) { sock.close(); return; }
      reconnectDelay = 0; // reset backoff on successful connect
      // CRITICAL: send subscribe immediately after open so the server delivers deltas.
      // The old plugin opened the socket but never sent this message.
      sendSubscribe(sock);
      // Keepalive: re-subscribe every KEEPALIVE_MS to keep the session alive
      clearKeepalive();
      keepaliveTimer = setInterval(() => {
        if (!closed && sock.readyState === WebSocket.OPEN) {
          sendSubscribe(sock);
        }
      }, KEEPALIVE_MS);
    };

    sock.onmessage = (evt: MessageEvent) => {
      if (closed || sock !== ws) return;
      let msg: unknown;
      try { msg = JSON.parse(evt.data as string); } catch { return; }
      // Parse SignalK delta: { updates: [{ values: [{path, value, sourceUnit?, timestamp?}], timestamp? }] }
      const delta = msg as {
        updates?: Array<{
          values?: Array<{ path?: string; value?: unknown; sourceUnit?: string; timestamp?: string }>;
          timestamp?: string;
        }>;
      };
      if (!delta || !Array.isArray(delta.updates)) return;
      for (const update of delta.updates) {
        const ts = update.timestamp ? Date.parse(update.timestamp) : Date.now();
        const timestamp = isNaN(ts) ? Date.now() : ts;
        if (!Array.isArray(update.values)) continue;
        for (const item of update.values) {
          if (typeof item.path !== "string") continue;
          provider.ingest(item.path, item.value, item.sourceUnit, timestamp);
        }
      }
    };

    sock.onclose = () => {
      if (sock !== ws) return;
      ws = null;
      clearKeepalive();
      if (!closed) scheduleReconnect();
    };

    sock.onerror = () => {
      // onclose fires after onerror; reconnect is handled there
    };
  }

  // Start the connection immediately
  openSocket();

  // Attach close() to the provider object so callers can tear down cleanly
  const result = provider as unknown as DataProvider & LivePathSource & { close(): void };
  result.close = () => {
    closed = true;
    clearKeepalive();
    clearReconnect();
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }
  };

  return result;
}
