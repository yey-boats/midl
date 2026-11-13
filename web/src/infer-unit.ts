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

  // ── Distance / depth (m) ──────────────────────────────────────────────────
  // Leaves: distance*, crossTrackError, belowKeel, belowTransducer,
  //         belowSurface; anything under environment.depth.*
  if (
    /^distance/.test(leaf) ||
    leaf === "crosstrackerror" ||
    /^below(keel|transducer|surface)$/.test(leaf) ||
    /(?:^|\.)depth\./.test(p)
  ) {
    return "m";
  }

  // ── Speed (m/s) ───────────────────────────────────────────────────────────
  // Leaves: speed* (speedOverGround, speedThroughWater, wind speedApparent…),
  //         *velocity* (velocityMadeGood), vmg*, polarSpeed;
  //         path current.drift
  if (
    /^speed/.test(leaf) ||
    /velocity/.test(leaf) ||
    /^vmg/.test(leaf) ||
    leaf === "polarspeed" ||
    /(?:^|\.)current\.drift$/.test(p)
  ) {
    return "m/s";
  }

  // ── Angle / heading (rad) ─────────────────────────────────────────────────
  // Leaves: heading*, bearing*, courseOverGround*, direction*, and any leaf
  //         containing "angle" (angleApparent, rudderAngle, targetAngle,
  //         windAngleApparent); path attitude.(roll|pitch|yaw)
  if (
    /^(heading|bearing|courseoverground|direction)/.test(leaf) ||
    /angle/.test(leaf) ||
    /(?:^|\.)attitude\.(roll|pitch|yaw)$/.test(p)
  ) {
    return "rad";
  }

  // ── Temperature (K) ───────────────────────────────────────────────────────
  if (/\.temperature/.test(p)) {
    return "K";
  }

  // ── Pressure (Pa) ─────────────────────────────────────────────────────────
  if (/pressure/.test(p)) {
    return "Pa";
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
