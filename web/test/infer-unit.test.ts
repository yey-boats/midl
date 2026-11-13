// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect, describe } from "vitest";
import { inferSourceUnit } from "../src/infer-unit";

/**
 * Corpus of SignalK paths → expected SI source unit (midl#27).
 * Unit inference keys on the leaf: a `navigation.course*` prefix must not turn
 * a distance or a speed into an angle.
 */
const CORPUS: Array<[string, string | undefined]> = [
  // ── course* subtree: the leaf decides ──────────────────────────────────────
  ["navigation.courseGreatCircle.nextPoint.distance", "m"],
  ["navigation.courseRhumbline.nextPoint.distance", "m"],
  ["navigation.course.calcValues.distance", "m"],
  ["navigation.courseGreatCircle.crossTrackError", "m"],
  ["navigation.courseRhumbline.crossTrackError", "m"],
  ["navigation.course.calcValues.crossTrackError", "m"],
  ["navigation.courseGreatCircle.nextPoint.velocityMadeGood", "m/s"],
  ["navigation.courseRhumbline.velocityMadeGood", "m/s"],
  ["navigation.course.calcValues.velocityMadeGood", "m/s"],
  ["performance.vmg", "m/s"],
  ["navigation.courseGreatCircle.nextPoint.bearingTrue", "rad"],
  ["navigation.courseRhumbline.nextPoint.bearingMagnetic", "rad"],
  ["navigation.courseRhumbline.bearingTrackTrue", "rad"],
  ["navigation.course.calcValues.bearingTrue", "rad"],
  ["navigation.courseOverGroundTrue", "rad"],
  ["navigation.courseOverGroundMagnetic", "rad"],
  ["navigation.course.arrivalCircle", "m"],
  ["navigation.course.calcValues.targetSpeed", "m/s"],
  ["navigation.courseGreatCircle.nextPoint.timeToGo", "s"],
  // Course leaves with no numeric SI convention (ISO time, object) → no unit.
  ["navigation.course.calcValues.estimatedTimeOfArrival", undefined],
  ["navigation.courseGreatCircle.nextPoint.position", undefined],
  // ── leaves that match two rules: order matters ─────────────────────────────
  ["performance.beatAngleVelocityMadeGood", "m/s"],
  ["performance.gybeAngleVelocityMadeGood", "m/s"],
  ["performance.beatAngleTargetSpeed", "m/s"],
  ["performance.gybeAngleTargetSpeed", "m/s"],
  ["performance.targetSpeed", "m/s"],
  ["performance.polarSpeedRatio", "ratio"],
  ["performance.polarVelocityMadeGoodRatio", "ratio"],
  ["performance.beatAngle", "rad"],
  ["navigation.leewayAngle", "rad"],
  // ── angles ─────────────────────────────────────────────────────────────────
  ["navigation.headingTrue", "rad"],
  ["navigation.headingMagnetic", "rad"],
  ["steering.autopilot.target.headingTrue", "rad"],
  ["steering.autopilot.target.windAngleApparent", "rad"],
  ["environment.wind.angleApparent", "rad"],
  ["environment.wind.angleTrueWater", "rad"],
  ["environment.wind.directionTrue", "rad"],
  ["steering.rudderAngle", "rad"],
  ["navigation.attitude.roll", "rad"],
  ["navigation.attitude.pitch", "rad"],
  ["navigation.attitude.yaw", "rad"],
  ["performance.targetAngle", "rad"],
  ["environment.current.setTrue", "rad"],
  ["environment.current.setMagnetic", "rad"],
  ["navigation.magneticVariation", "rad"],
  ["navigation.magneticDeviation", "rad"],
  ["navigation.magneticVariationAgeOfService", undefined],
  // ── speeds ─────────────────────────────────────────────────────────────────
  ["navigation.speedOverGround", "m/s"],
  ["navigation.speedThroughWater", "m/s"],
  ["environment.wind.speedApparent", "m/s"],
  ["environment.wind.speedTrue", "m/s"],
  ["environment.current.drift", "m/s"],
  ["performance.polarSpeed", "m/s"],
  ["performance.velocityMadeGood", "m/s"],
  // ── lengths ────────────────────────────────────────────────────────────────
  ["environment.depth.belowTransducer", "m"],
  ["environment.depth.belowKeel", "m"],
  ["environment.depth.belowSurface", "m"],
  ["navigation.anchor.maxRadius", "m"],
  ["navigation.anchor.currentRadius", "m"],
  ["environment.depth.surfaceToTransducer", "m"],
  ["environment.depth.transducerToKeel", "m"],
  ["vessels.self.environment.depth.belowKeel", "m"],
  ["sensors.depth.class", undefined],
  // ── other quantities (unchanged) ───────────────────────────────────────────
  ["environment.water.temperature", "K"],
  ["propulsion.main.oilTemperature", "K"],
  ["propulsion.main.coolantTemperature", "K"],
  ["environment.outside.dewPointTemperature", "K"],
  ["electrical.batteries.house.temperature.warnUpper", "K"],
  ["electrical.solar.0.temperature.faultLower", "K"],
  ["navigation.gnss.geoidalSeparation", undefined],
  ["performance.timeToStart", "s"],
  ["environment.outside.pressure", "Pa"],
  ["electrical.batteries.0.capacity.stateOfCharge", "ratio"],
  ["tanks.fuel.0.currentLevel", "ratio"],
  ["tanks.freshWater.0.level", "ratio"],
  ["vessels.self.tanks.fuel.0.level", "ratio"],
  ["propulsion.main.revolutions", "Hz"],
  ["foo.bar", undefined],
];

describe("inferSourceUnit corpus (midl#27)", () => {
  test.each(CORPUS)("%s → %s", (path, unit) => {
    expect(inferSourceUnit(path)).toBe(unit);
  });
});
