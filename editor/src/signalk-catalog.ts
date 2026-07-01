// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import type { PathInfo } from "./adapters";
import type { EditorElement } from "./model";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  path: string;
  label: string;
  group: string;
  unit?: string;
  live?: boolean;
  value?: unknown;
  sourceUnit?: string;
  injected?: boolean;
}

// ── Catalog ────────────────────────────────────────────────────────────────────

export const SIGNALK_CATALOG: CatalogEntry[] = [
  // navigation
  { path: "navigation.speedOverGround", label: "Speed Over Ground", group: "navigation", unit: "kn" },
  { path: "navigation.speedThroughWater", label: "Speed Through Water", group: "navigation", unit: "kn" },
  { path: "navigation.courseOverGroundTrue", label: "Course Over Ground (True)", group: "navigation", unit: "deg" },
  { path: "navigation.headingTrue", label: "Heading True", group: "navigation", unit: "deg" },
  { path: "navigation.headingMagnetic", label: "Heading Magnetic", group: "navigation", unit: "deg" },
  { path: "navigation.position", label: "Position (lat/lon)", group: "navigation" },
  { path: "navigation.attitude.roll", label: "Roll", group: "navigation", unit: "deg" },
  { path: "navigation.attitude.pitch", label: "Pitch", group: "navigation", unit: "deg" },
  { path: "navigation.courseGreatCircle.nextPoint.distance", label: "Distance to Waypoint", group: "navigation", unit: "nm" },
  { path: "navigation.courseGreatCircle.nextPoint.bearingTrue", label: "Bearing to Waypoint (True)", group: "navigation", unit: "deg" },
  { path: "navigation.courseGreatCircle.crossTrackError", label: "Cross-Track Error (GC)", group: "navigation", unit: "m" },
  { path: "navigation.courseRhumbline.nextPoint.distance", label: "Distance to Waypoint (RL)", group: "navigation", unit: "nm" },
  { path: "navigation.courseRhumbline.nextPoint.bearingTrue", label: "Bearing to Waypoint (RL)", group: "navigation", unit: "deg" },
  { path: "navigation.courseRhumbline.crossTrackError", label: "Cross-Track Error (RL)", group: "navigation", unit: "m" },
  { path: "navigation.state", label: "Vessel State", group: "navigation" },
  // environment
  { path: "environment.wind.speedApparent", label: "Apparent Wind Speed", group: "environment", unit: "kn" },
  { path: "environment.wind.angleApparent", label: "Apparent Wind Angle", group: "environment", unit: "deg" },
  { path: "environment.wind.speedTrue", label: "True Wind Speed", group: "environment", unit: "kn" },
  { path: "environment.wind.angleTrueWater", label: "True Wind Angle (Water)", group: "environment", unit: "deg" },
  { path: "environment.wind.directionTrue", label: "True Wind Direction", group: "environment", unit: "deg" },
  { path: "environment.depth.belowTransducer", label: "Depth Below Transducer", group: "environment", unit: "m" },
  { path: "environment.depth.belowKeel", label: "Depth Below Keel", group: "environment", unit: "m" },
  { path: "environment.water.temperature", label: "Water Temperature", group: "environment", unit: "C" },
  { path: "environment.outside.temperature", label: "Outside Temperature", group: "environment", unit: "C" },
  { path: "environment.outside.pressure", label: "Barometric Pressure", group: "environment", unit: "hPa" },
  { path: "environment.outside.humidity", label: "Humidity", group: "environment", unit: "%" },
  // electrical
  { path: "electrical.batteries.0.voltage", label: "Battery Voltage", group: "electrical", unit: "V" },
  { path: "electrical.batteries.0.current", label: "Battery Current", group: "electrical", unit: "A" },
  { path: "electrical.batteries.0.capacity.stateOfCharge", label: "State of Charge", group: "electrical", unit: "%" },
  { path: "electrical.batteries.0.temperature", label: "Battery Temperature", group: "electrical", unit: "C" },
  { path: "electrical.solar.0.panelPower", label: "Solar Panel Power", group: "electrical", unit: "W" },
  // propulsion
  { path: "propulsion.main.revolutions", label: "Engine RPM", group: "propulsion", unit: "Hz" },
  { path: "propulsion.main.temperature", label: "Engine Temperature", group: "propulsion", unit: "C" },
  { path: "propulsion.main.oilPressure", label: "Oil Pressure", group: "propulsion", unit: "Pa" },
  { path: "propulsion.main.fuel.rate", label: "Fuel Rate", group: "propulsion" },
  // tanks
  { path: "tanks.fuel.0.currentLevel", label: "Fuel Level", group: "tanks", unit: "%" },
  { path: "tanks.freshWater.0.currentLevel", label: "Fresh Water Level", group: "tanks", unit: "%" },
  { path: "tanks.blackWater.0.currentLevel", label: "Black Water Level", group: "tanks", unit: "%" },
  // steering
  { path: "steering.rudderAngle", label: "Rudder Angle", group: "steering", unit: "deg" },
  { path: "steering.autopilot.state", label: "Autopilot State", group: "steering" },
  { path: "steering.autopilot.target.headingTrue", label: "Autopilot Target Heading", group: "steering", unit: "deg" },
  // performance
  { path: "performance.velocityMadeGood", label: "VMG", group: "performance", unit: "kn" },
  { path: "performance.polarSpeed", label: "Polar Speed", group: "performance", unit: "kn" },
  { path: "performance.targetAngle", label: "Target Angle", group: "performance", unit: "deg" },
];

// ── Unit → default decimals map ────────────────────────────────────────────────

const UNIT_DECIMALS: Record<string, number> = {
  "kn": 1,
  "m/s": 1,
  "deg": 0,
  "%": 0,
  "V": 1,
  "A": 1,
  "m": 1,
  "ft": 0,
  "nm": 2,
  "C": 1,
  "°C": 1,
  "hPa": 0,
  "Pa": 0,
  "Hz": 0,
  "ratio": 2,
  "W": 1,
};

export function defaultDecimalsForUnit(unit: string | undefined): number {
  if (!unit) return 1;
  return UNIT_DECIMALS[unit] ?? 1;
}

// ── Ranged element types ───────────────────────────────────────────────────────

/** Element types that use style.range + style.zones (gauge / bar). */
export const RANGED_TYPES = new Set(["gauge", "bar"]);

// ── Path → natural range + zone defaults ──────────────────────────────────────

interface RangeDefaults {
  range: [number, number];
  zones?: Array<{ lt: number; color: string }>;
}

/**
 * Natural display-unit range defaults for well-known SignalK paths.
 * Zones are in the same display unit as range.
 * Colors use theme tokens (warn/good/#hex).
 */
const PATH_RANGE_DEFAULTS: Record<string, RangeDefaults> = {
  // electrical
  "electrical.batteries.0.capacity.stateOfCharge": {
    range: [0, 100],
    zones: [
      { lt: 20, color: "warn" },
      { lt: 50, color: "#e0a020" },
      { lt: 101, color: "good" },
    ],
  },
  // tanks
  "tanks.fuel.0.currentLevel": {
    range: [0, 100],
    zones: [
      { lt: 20, color: "warn" },
      { lt: 101, color: "good" },
    ],
  },
  "tanks.freshWater.0.currentLevel": {
    range: [0, 100],
    zones: [
      { lt: 20, color: "warn" },
      { lt: 101, color: "good" },
    ],
  },
  "tanks.blackWater.0.currentLevel": {
    range: [0, 100],
    zones: [
      { lt: 80, color: "good" },
      { lt: 101, color: "warn" },
    ],
  },
  // steering
  "steering.rudderAngle": {
    range: [-40, 40],
    // no zones — centered deviation gauge
  },
};

// ── Apply catalog defaults to a fresh element ─────────────────────────────────

/**
 * Auto-populate element fields from a catalog entry.
 * Only fills fields that are not already set (fresh / unset / empty).
 * Does NOT clobber existing user-set values.
 */
export function applyCatalogDefaults(
  element: EditorElement,
  entry: CatalogEntry,
): EditorElement {
  let updated = { ...element };

  // name ← catalog label (only if name is falsy/unset)
  if (!updated.name) {
    updated = { ...updated, name: entry.label };
  }

  // format.unit ← catalog unit (only if not already set)
  const currentUnit = updated.format?.unit;
  const currentDecimals = updated.format?.decimals;
  const needsUnit = Boolean(entry.unit && !currentUnit);
  const needsDecimals = typeof currentDecimals !== "number";

  if (needsUnit || needsDecimals) {
    const effectiveUnit = needsUnit ? entry.unit : (currentUnit as string | undefined);
    const newFormat: Record<string, unknown> = { ...updated.format };
    if (needsUnit) newFormat.unit = entry.unit;
    if (needsDecimals) newFormat.decimals = defaultDecimalsForUnit(effectiveUnit);
    updated = { ...updated, format: newFormat };
  }

  // style.size ← "L" (large, auto-fit) for single-value elements (only if not already set).
  if (!updated.style?.size) {
    updated = { ...updated, style: { ...updated.style, size: "L" } };
  }

  // style.range + style.zones ← path defaults for ranged element types (gauge/bar only).
  // Only applies when the element type is ranged AND the user hasn't set a range yet.
  if (RANGED_TYPES.has(updated.type)) {
    const pathDefaults = PATH_RANGE_DEFAULTS[entry.path];
    if (pathDefaults) {
      const currentRange = updated.style?.range;
      const currentZones = updated.style?.zones;
      const needsRange = !Array.isArray(currentRange);
      const needsZones = !Array.isArray(currentZones) && pathDefaults.zones !== undefined;
      if (needsRange || needsZones) {
        const newStyle: Record<string, unknown> = { ...updated.style };
        if (needsRange) newStyle.range = pathDefaults.range;
        if (needsZones) newStyle.zones = pathDefaults.zones;
        updated = { ...updated, style: newStyle };
      }
    }
  }

  return updated;
}

// ── Merge helper ───────────────────────────────────────────────────────────────

/**
 * Merge the static catalog with live path data from the provider.
 * - Catalog entries always present.
 * - Live data overlaid onto matching catalog entries (live:true, value, sourceUnit, injected).
 * - Live-only paths (not in catalog) appended at the end.
 */
export function mergeCatalogWithLive(
  catalog: CatalogEntry[],
  liveEntries: PathInfo[],
): CatalogEntry[] {
  // Build a lookup of live entries by path
  const liveByPath = new Map<string, PathInfo>();
  for (const e of liveEntries) {
    liveByPath.set(e.path, e);
  }

  // Start with catalog entries, overlay live data where available
  const result: CatalogEntry[] = catalog.map((entry) => {
    const live = liveByPath.get(entry.path);
    if (live) {
      return {
        ...entry,
        live: true,
        value: live.value,
        sourceUnit: live.sourceUnit,
        injected: live.injected,
      };
    }
    return { ...entry };
  });

  // Append live-only paths not already in the catalog
  const catalogPaths = new Set(catalog.map((e) => e.path));
  for (const live of liveEntries) {
    if (!catalogPaths.has(live.path)) {
      result.push({
        path: live.path,
        label: live.path,
        group: live.path.split(".")[0] ?? live.path,
        live: true,
        value: live.value,
        sourceUnit: live.sourceUnit,
        injected: live.injected,
      });
    }
  }

  return result;
}
