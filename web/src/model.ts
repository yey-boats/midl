// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { Element, Source } from "@yey-boats/midl";
import type { DataProvider } from "./data";
import { formatValue, convert } from "./format";

export type ModelState = "ok" | "stale" | "no-data" | "bad";

/** A resolved dial marker: a glyph orbiting the rim (kind 'rim') or a centre
 *  vector (kind 'vector'). `angleDeg` is the bow/north-relative bearing; markers
 *  whose `dir` source has no value are dropped (no angle). */
export interface ResolvedMarker {
  glyph: string;
  color: string;
  angleDeg?: number;
  kind: "rim" | "vector";
}

export interface ElementModel {
  state: ModelState;
  text: string;
  numeric?: number;
  fraction?: number;
  angleDeg?: number;
  dirDeg?: number;
  /** Dial markers resolved from `el.markers` (capped at MAX_MARKERS). */
  markers?: ResolvedMarker[];
  /** Threshold colour picked from `el.style.zones` for the current value. */
  zoneColor?: string;
  /** Bow-relative coloured arcs from `el.style.sectors`. */
  sectors?: Array<{ from: number; to: number; color: string }>;
  /** Port/Starboard side from a signed angle when `el.format.side` is set. */
  side?: "P" | "S";
}

/** square-480 capability: maxMarkersPerDial. */
export const MAX_MARKERS = 12;

const ANGLE_TYPES = new Set(["compass", "windrose"]);
const NUMERIC_TYPES = new Set(["gauge", "bar", "trend", "compass", "windrose"]);

function asDeg(r: { value: unknown; sourceUnit?: string }): number | undefined {
  if (typeof r.value !== "number" || !Number.isFinite(r.value)) return undefined;
  return convert(r.value, r.sourceUnit, "deg");
}

function norm360(d: number): number { return ((d % 360) + 360) % 360; }

function isHex(s: string): boolean { return /^#[0-9a-fA-F]{3,8}$/.test(s); }

// A marker/zone/sector "color" in MIDL is either a theme token name (passed
// through verbatim for the backend to resolve against the theme, e.g.
// 'accent'|'good'|'warn'|'fg') or a literal `#rrggbb`. We keep it a string here;
// the SVG backend maps tokens to theme colours.
function colorToken(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

// format.side is enabled by any truthy value: the boolean `true` or a string
// such as the design's "port-stbd". Only an explicit false/absent disables it.
function sideEnabled(v: unknown): boolean {
  return v === true || (typeof v === "string" && v.length > 0);
}

// A SignalK navigation.position value: { latitude, longitude } in decimal deg.
function isPosition(v: unknown): v is { latitude: number; longitude: number } {
  return typeof v === "object" && v !== null
    && typeof (v as { latitude?: unknown }).latitude === "number"
    && typeof (v as { longitude?: unknown }).longitude === "number";
}

// Render a position as two lines of degrees + decimal minutes with a hemisphere
// suffix, e.g. "41°23.16'N\n2°10.43'E" — matching the design's text-position
// widget. The renderer's text widget splits on "\n" into stacked lines.
function formatPosition(p: { latitude: number; longitude: number }): string {
  const fmt = (val: number, pos: string, neg: string): string => {
    const hemi = val >= 0 ? pos : neg;
    const a = Math.abs(val);
    const deg = Math.floor(a);
    const min = (a - deg) * 60;
    return `${deg}°${min.toFixed(2)}'${hemi}`;
  };
  return `${fmt(p.latitude, "N", "S")}\n${fmt(p.longitude, "E", "W")}`;
}

function resolveMarkers(el: Element, provider: DataProvider): ResolvedMarker[] | undefined {
  const raw = el.markers;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ResolvedMarker[] = [];
  for (const mk of raw) {
    if (out.length >= MAX_MARKERS) break;
    const glyph = typeof mk.glyph === "string" ? mk.glyph : "triangle";
    const color = colorToken(mk.color, "accent");
    const kind = mk.kind === "vector" ? "vector" : "rim";
    let angleDeg: number | undefined;
    const dir = mk.dir as Source | undefined;
    if (dir && typeof (dir as { kind?: unknown }).kind === "string") {
      const dr = provider.getValue(dir);
      if (dr.present) angleDeg = asDeg(dr);
    }
    out.push({ glyph, color, kind, angleDeg });
  }
  return out;
}

// style.zones: ordered thresholds [{ lt, color }]. Pick the first whose `lt`
// exceeds the current value (fraction when available, else the numeric value),
// mirroring the device's "value below threshold -> this colour" semantics.
function resolveZoneColor(el: Element, fraction: number | undefined, numeric: number | undefined): string | undefined {
  const zones = el.style?.zones as Array<{ lt?: unknown; color?: unknown }> | undefined;
  if (!Array.isArray(zones)) return undefined;
  const probe = fraction != null ? fraction : numeric;
  if (probe == null || !Number.isFinite(probe)) return undefined;
  for (const z of zones) {
    if (typeof z.lt === "number" && probe < z.lt && typeof z.color === "string") return z.color;
  }
  return undefined;
}

function resolveSectors(el: Element): Array<{ from: number; to: number; color: string }> | undefined {
  const raw = el.style?.sectors as Array<{ from?: unknown; to?: unknown; color?: unknown }> | undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: Array<{ from: number; to: number; color: string }> = [];
  for (const s of raw) {
    if (typeof s.from === "number" && typeof s.to === "number") {
      out.push({ from: s.from, to: s.to, color: colorToken(s.color, "accent") });
    }
  }
  return out.length ? out : undefined;
}

export function resolveElement(el: Element, provider: DataProvider): ElementModel {
  const valueBinding = el.bindings?.value;
  if (!valueBinding) return { state: "no-data", text: "--" };
  const rv = provider.getValue(valueBinding);
  if (!rv.present) return { state: "no-data", text: "--" };

  const fmt = formatValue(rv.value, el.format, rv.sourceUnit);
  const numericRequired = NUMERIC_TYPES.has(el.type);

  // State priority: no-data (above) -> stale -> bad -> ok.
  let state: ModelState;
  if (rv.stale) state = "stale";
  else if (numericRequired && fmt.numeric == null) state = "bad";
  else state = "ok";

  // Non-numeric values (e.g. autopilot.state "auto", text/status fields) keep
  // their string — formatValue only renders numbers and would otherwise show "--".
  // A SignalK position object {latitude, longitude} is rendered as a two-line
  // lat/lon text block so a `text` widget bound to navigation.position shows
  // coordinates instead of "--".
  let text: string;
  if (fmt.numeric == null && isPosition(rv.value)) {
    text = formatPosition(rv.value as { latitude: number; longitude: number });
    if (state === "bad") state = "ok"; // position is a valid non-numeric value
  } else {
    text = fmt.numeric == null && typeof rv.value === "string" && rv.value.length > 0 ? rv.value : fmt.text;
  }
  const m: ElementModel = { state, text, numeric: fmt.numeric };

  if (el.type === "bar" || el.type === "gauge") {
    const range = (el.style?.range as [number, number] | undefined) ?? [0, 1];
    const [lo, hi] = range;
    if (fmt.numeric != null && hi !== lo) m.fraction = Math.max(0, Math.min(1, (fmt.numeric - lo) / (hi - lo)));
  }
  if (ANGLE_TYPES.has(el.type)) {
    m.angleDeg = asDeg(rv);
    const dirBinding = el.bindings?.dir;
    if (dirBinding) { const dr = provider.getValue(dirBinding); if (dr.present) m.dirDeg = asDeg(dr); }
    // A compass' value IS the heading angle; show whole degrees when the screen
    // didn't set an explicit display unit. (A windrose value is a speed, so it
    // keeps its format and is left untouched.)
    if (el.type === "compass" && !el.format?.unit && m.angleDeg != null) {
      m.text = `${Math.round(m.angleDeg)}°`;
    }
  }

  // format.side: present a signed angle/distance as magnitude + Port/Starboard
  // suffix. Convention (device): positive = Starboard, negative = Port. Accept
  // any truthy value (e.g. `true` or the design's `"port-stbd"` string), not
  // only the boolean `true`, so XTE screens authored with side:"port-stbd"
  // resolve. For angle types the signed value is wrapped into -180..180; for
  // plain numerics (XTE distance) the sign is taken as-is.
  if (sideEnabled(el.format?.side) && typeof rv.value === "number" && Number.isFinite(rv.value)) {
    const unit = el.format?.unit as string | undefined;
    const isAngle = ANGLE_TYPES.has(el.type) || unit === "deg" || unit === "rad" || unit == null;
    if (isAngle) {
      const deg = convert(rv.value, rv.sourceUnit, "deg");
      const signed = norm360(deg + 180) - 180; // -180..180
      m.side = signed >= 0 ? "S" : "P";
      m.text = String(Math.round(Math.abs(signed)));
    } else {
      // Distance/offset (e.g. XTE in nm): keep the formatted magnitude + unit,
      // record the side from the sign. fmt.numeric is the display-unit value.
      const dv = m.numeric ?? convert(rv.value, rv.sourceUnit, unit);
      m.side = dv >= 0 ? "S" : "P";
      const mag = formatValue(Math.abs(rv.value), el.format, rv.sourceUnit);
      m.text = mag.text;
      m.numeric = mag.numeric;
    }
  }

  const markers = resolveMarkers(el, provider);
  if (markers) m.markers = markers;
  const zoneColor = resolveZoneColor(el, m.fraction, m.numeric);
  if (zoneColor) m.zoneColor = zoneColor;
  const sectors = resolveSectors(el);
  if (sectors) m.sectors = sectors;

  return m;
}
