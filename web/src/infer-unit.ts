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
  // midl#27: key the physical-quantity rules on the LEAF segment.  A parent
  // segment such as `navigation.courseGreatCircle.` says nothing about the
  // quantity — its children are distances (m), speeds (m/s), bearings (rad)
  // and times.  Matching the whole path read every course* child as an angle.
  const leaf = p.slice(p.lastIndexOf(".") + 1);

  // ── Dimensionless ratio (ratio) ───────────────────────────────────────────
  // Checked first so *SpeedRatio / *VelocityMadeGoodRatio leaves stay ratios.
  // Leaves: *ratio, stateOfCharge, currentLevel; tanks.*.level
  if (
    /ratio$/.test(leaf) ||
    leaf === "stateofcharge" ||
    leaf === "currentlevel" ||
    /(?:^|\.)tanks\..*\.level$/.test(p)
  ) {
    return "ratio";
  }

  // ── Distance / depth (m) ──────────────────────────────────────────────────
  // Leaves: distance*, crossTrackError, below(Keel|Transducer|Surface),
  //         arrivalCircle, *radius; anything under environment.depth.
  if (
    /^distance/.test(leaf) ||
    leaf === "crosstrackerror" ||
    /^below(keel|transducer|surface)$/.test(leaf) ||
    leaf === "arrivalcircle" ||
    /radius$/.test(leaf) ||
    /(?:^|\.)environment\.depth\./.test(p)
  ) {
    return "m";
  }

  // ── Speed (m/s) ───────────────────────────────────────────────────────────
  // Leaves: speed*, *speed (targetSpeed, beatAngleTargetSpeed), *velocity*
  //         (velocityMadeGood, beatAngleVelocityMadeGood), vmg*;
  //         path current.drift.  Checked before angles: a leaf such as
  //         beatAngleTargetSpeed is a speed, not an angle.
  if (
    /^speed/.test(leaf) ||
    /speed$/.test(leaf) ||
    /velocity/.test(leaf) ||
    /^vmg/.test(leaf) ||
    /(?:^|\.)current\.drift$/.test(p)
  ) {
    return "m/s";
  }

  // ── Angle / heading (rad) ─────────────────────────────────────────────────
  // Leaves: heading*, bearing*, courseOverGround*, direction*, magnetic
  //         (variation|deviation), any leaf containing "angle" (angleApparent,
  //         rudderAngle, beatAngle, leewayAngle, windAngleApparent);
  //         paths attitude.(roll|pitch|yaw), current.set(True|Magnetic)
  if (
    /^(heading|bearing|courseoverground|direction)/.test(leaf) ||
    /^magnetic(variation|deviation)$/.test(leaf) ||
    /angle/.test(leaf) ||
    /(?:^|\.)attitude\.(roll|pitch|yaw)$/.test(p) ||
    /(?:^|\.)current\.set(true|magnetic)$/.test(p)
  ) {
    return "rad";
  }

  // ── Duration (s) ──────────────────────────────────────────────────────────
  // Leaves: timeTo* (timeToGo, timeToStart)
  if (/^timeto/.test(leaf)) {
    return "s";
  }

  // ── Temperature (K) ───────────────────────────────────────────────────────
  // Leaves: temperature, *Temperature (oilTemperature, dewPointTemperature…);
  //         children of a temperature segment (temperature.warnUpper…)
  if (/temperature$/.test(leaf) || /(?:^|\.)temperature\.[^.]+$/.test(p)) {
    return "K";
  }

  // ── Pressure (Pa) ─────────────────────────────────────────────────────────
  if (/pressure/.test(p)) {
    return "Pa";
  }

  // ── Revolutions (Hz) ─────────────────────────────────────────────────────
  if (/\.revolutions/.test(p)) {
    return "Hz";
  }

  return undefined;
}
