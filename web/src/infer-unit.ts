// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

/**
 * Infer the SignalK native (SI) source unit from a path when the provider
 * did not supply one.  Returns `undefined` when no convention is known —
 * callers fall back to the existing no-conversion behaviour.
 *
 * Rules follow the SignalK specification: all physical quantities are stored
 * in SI base units (radians, m/s, K, Pa, m, dimensionless ratio, Hz…).
 */
export function inferSourceUnit(path: string): string | undefined {
  const p = path.toLowerCase();

  // ── Angle / heading (rad) ──────────────────────────────────────────────────
  // Matches: *.angle*, heading*, course*, bearing*, direction*,
  //          *.rudderAngle, attitude.(roll|pitch|yaw)
  if (
    /\.angle/.test(p) ||
    /(?:^|\.)heading/.test(p) ||
    /(?:^|\.)course/.test(p) ||
    /(?:^|\.)bearing/.test(p) ||
    /(?:^|\.)direction/.test(p) ||
    /\.rudderangle/.test(p) ||
    /attitude\.(roll|pitch|yaw)/.test(p) ||
    /targetangle/.test(p)
  ) {
    return "rad";
  }

  // ── Speed (m/s) ───────────────────────────────────────────────────────────
  // Matches: speed*, *.speedOverGround, *.speedThroughWater,
  //          *.velocityMadeGood, wind.speed*, current.drift, polarSpeed
  if (
    /(?:^|\.)speed/.test(p) ||
    /(?:^|\.)velocity/.test(p) ||
    /wind\.speed/.test(p) ||
    /current\.drift/.test(p) ||
    /polarspeed/.test(p)
  ) {
    return "m/s";
  }

  // ── Temperature (K) ───────────────────────────────────────────────────────
  if (/\.temperature/.test(p)) {
    return "K";
  }

  // ── Pressure (Pa) ─────────────────────────────────────────────────────────
  if (/pressure/.test(p)) {
    return "Pa";
  }

  // ── Distance / depth (m) ─────────────────────────────────────────────────
  // Matches: depth.*, *.distance, *.crossTrackError, *.belowKeel,
  //          *.belowTransducer
  if (
    /(?:^|\.)depth/.test(p) ||
    /\.distance/.test(p) ||
    /\.crossTrackerror/.test(p) ||
    /\.crosstrackerror/.test(p) ||
    /\.belowkeel/.test(p) ||
    /\.belowtransducer/.test(p)
  ) {
    return "m";
  }

  // ── Dimensionless ratio (ratio) ───────────────────────────────────────────
  // Matches: *.stateOfCharge, *.currentLevel, tanks.*.level, *ratio*
  if (
    /\.stateofcharge/.test(p) ||
    /\.currentlevel/.test(p) ||
    /tanks\..*\.level/.test(p) ||
    /ratio/.test(p)
  ) {
    return "ratio";
  }

  // ── Revolutions (Hz) ─────────────────────────────────────────────────────
  if (/\.revolutions/.test(p)) {
    return "Hz";
  }

  return undefined;
}
