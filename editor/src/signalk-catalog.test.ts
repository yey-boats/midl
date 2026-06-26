// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect } from "vitest";
import { SIGNALK_CATALOG, mergeCatalogWithLive } from "./signalk-catalog";
import type { PathInfo } from "./adapters";

test("SIGNALK_CATALOG has at least 40 entries", () => {
  expect(SIGNALK_CATALOG.length).toBeGreaterThanOrEqual(40);
});

test("all catalog entries have path, label, group, and group equals path.split('.')[0]", () => {
  for (const e of SIGNALK_CATALOG) {
    expect(typeof e.path).toBe("string");
    expect(e.path.length).toBeGreaterThan(0);
    expect(typeof e.label).toBe("string");
    expect(e.label.length).toBeGreaterThan(0);
    expect(typeof e.group).toBe("string");
    expect(e.group).toBe(e.path.split(".")[0]);
  }
});

test("catalog contains navigation group entries (speedOverGround, courseOverGroundTrue, headingTrue)", () => {
  const paths = new Set(SIGNALK_CATALOG.map((e) => e.path));
  expect(paths.has("navigation.speedOverGround")).toBe(true);
  expect(paths.has("navigation.courseOverGroundTrue")).toBe(true);
  expect(paths.has("navigation.headingTrue")).toBe(true);
});

test("catalog contains environment group entries", () => {
  const paths = new Set(SIGNALK_CATALOG.map((e) => e.path));
  expect(paths.has("environment.wind.speedApparent")).toBe(true);
  expect(paths.has("environment.depth.belowTransducer")).toBe(true);
});

test("catalog contains electrical, propulsion, tanks, steering, performance groups", () => {
  const groups = new Set(SIGNALK_CATALOG.map((e) => e.group));
  expect(groups.has("electrical")).toBe(true);
  expect(groups.has("propulsion")).toBe(true);
  expect(groups.has("tanks")).toBe(true);
  expect(groups.has("steering")).toBe(true);
  expect(groups.has("performance")).toBe(true);
});

test("mergeCatalogWithLive with no live data returns catalog entries all with live:false/undefined", () => {
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, []);
  // All entries present (catalog unchanged)
  expect(merged.length).toBeGreaterThanOrEqual(SIGNALK_CATALOG.length);
  // No live flags set
  const liveEntries = merged.filter((e) => e.live === true);
  expect(liveEntries.length).toBe(0);
});

test("mergeCatalogWithLive overlays live value onto matching catalog entry", () => {
  const live: PathInfo[] = [
    { path: "navigation.speedOverGround", value: 3.5, sourceUnit: "m/s", updatedAt: Date.now() },
  ];
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, live);
  const entry = merged.find((e) => e.path === "navigation.speedOverGround");
  expect(entry).toBeDefined();
  expect(entry!.live).toBe(true);
  expect(entry!.value).toBe(3.5);
  expect(entry!.sourceUnit).toBe("m/s");
});

test("mergeCatalogWithLive marks injected=true from live PathInfo.injected", () => {
  const live: PathInfo[] = [
    { path: "navigation.headingTrue", value: 1.57, updatedAt: Date.now(), injected: true },
  ];
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, live);
  const entry = merged.find((e) => e.path === "navigation.headingTrue");
  expect(entry?.injected).toBe(true);
});

test("mergeCatalogWithLive appends live-only paths not in catalog", () => {
  const live: PathInfo[] = [
    { path: "custom.exotic.path", value: 99, updatedAt: Date.now() },
  ];
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, live);
  const entry = merged.find((e) => e.path === "custom.exotic.path");
  expect(entry).toBeDefined();
  expect(entry!.live).toBe(true);
  // group is first segment
  expect(entry!.group).toBe("custom");
});

test("mergeCatalogWithLive catalog entries without live data still appear", () => {
  // Verify catalog paths are present even when zero live data
  const merged = mergeCatalogWithLive(SIGNALK_CATALOG, []);
  const paths = new Set(merged.map((e) => e.path));
  expect(paths.has("navigation.speedOverGround")).toBe(true);
  expect(paths.has("environment.wind.speedApparent")).toBe(true);
  expect(paths.has("electrical.batteries.0.voltage")).toBe(true);
});
