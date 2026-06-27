// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, describe } from "vitest";
import { SIGNALK_CATALOG, mergeCatalogWithLive, defaultDecimalsForUnit, applyCatalogDefaults } from "./signalk-catalog";
import type { CatalogEntry } from "./signalk-catalog";
import type { EditorElement } from "./model";
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

// ── defaultDecimalsForUnit ────────────────────────────────────────────────────

describe("defaultDecimalsForUnit", () => {
  test("kn → 1", () => {
    expect(defaultDecimalsForUnit("kn")).toBe(1);
  });

  test("deg → 0", () => {
    expect(defaultDecimalsForUnit("deg")).toBe(0);
  });

  test("% → 0", () => {
    expect(defaultDecimalsForUnit("%")).toBe(0);
  });

  test("nm → 2", () => {
    expect(defaultDecimalsForUnit("nm")).toBe(2);
  });

  test("V → 1", () => {
    expect(defaultDecimalsForUnit("V")).toBe(1);
  });

  test("A → 1", () => {
    expect(defaultDecimalsForUnit("A")).toBe(1);
  });

  test("hPa → 0", () => {
    expect(defaultDecimalsForUnit("hPa")).toBe(0);
  });

  test("Pa → 0", () => {
    expect(defaultDecimalsForUnit("Pa")).toBe(0);
  });

  test("Hz → 0", () => {
    expect(defaultDecimalsForUnit("Hz")).toBe(0);
  });

  test("ratio → 2", () => {
    expect(defaultDecimalsForUnit("ratio")).toBe(2);
  });

  test("W → 1", () => {
    expect(defaultDecimalsForUnit("W")).toBe(1);
  });

  test("ft → 0", () => {
    expect(defaultDecimalsForUnit("ft")).toBe(0);
  });

  test("C → 1", () => {
    expect(defaultDecimalsForUnit("C")).toBe(1);
  });

  test("°C → 1", () => {
    expect(defaultDecimalsForUnit("°C")).toBe(1);
  });

  test("undefined → 1 (default)", () => {
    expect(defaultDecimalsForUnit(undefined)).toBe(1);
  });

  test("unknown unit → 1 (default fallback)", () => {
    expect(defaultDecimalsForUnit("furlongs")).toBe(1);
  });
});

// ── applyCatalogDefaults ──────────────────────────────────────────────────────

describe("applyCatalogDefaults", () => {
  const sogEntry: CatalogEntry = {
    path: "navigation.speedOverGround",
    label: "Speed Over Ground",
    group: "navigation",
    unit: "kn",
  };

  const headingEntry: CatalogEntry = {
    path: "navigation.headingTrue",
    label: "Heading True",
    group: "navigation",
    unit: "deg",
  };

  const noUnitEntry: CatalogEntry = {
    path: "navigation.state",
    label: "Vessel State",
    group: "navigation",
    // no unit
  };

  test("fills name from entry.label when element.name is empty", () => {
    const el: EditorElement = { id: "el1", type: "single-value" };
    const result = applyCatalogDefaults(el, sogEntry);
    expect(result.name).toBe("Speed Over Ground");
  });

  test("fills format.unit from entry.unit when not set", () => {
    const el: EditorElement = { id: "el1", type: "single-value" };
    const result = applyCatalogDefaults(el, sogEntry);
    expect(result.format?.unit).toBe("kn");
  });

  test("fills format.decimals based on unit when not set", () => {
    const el: EditorElement = { id: "el1", type: "single-value" };
    const result = applyCatalogDefaults(el, sogEntry);
    // kn → 1
    expect(result.format?.decimals).toBe(1);
  });

  test("does NOT clobber existing name", () => {
    const el: EditorElement = { id: "el1", type: "single-value", name: "My Speed" };
    const result = applyCatalogDefaults(el, sogEntry);
    expect(result.name).toBe("My Speed");
  });

  test("does NOT clobber existing format.unit", () => {
    const el: EditorElement = { id: "el1", type: "single-value", format: { unit: "m/s" } };
    const result = applyCatalogDefaults(el, sogEntry);
    expect(result.format?.unit).toBe("m/s");
  });

  test("does NOT clobber existing format.decimals even when 0", () => {
    const el: EditorElement = { id: "el1", type: "single-value", format: { decimals: 0 } };
    const result = applyCatalogDefaults(el, sogEntry);
    // 0 is a valid number — must not be replaced
    expect(result.format?.decimals).toBe(0);
  });

  test("does not mutate the original element", () => {
    const el: EditorElement = { id: "el1", type: "single-value" };
    const elName = el.name;
    applyCatalogDefaults(el, sogEntry);
    expect(el.name).toBe(elName); // undefined, unchanged
    expect(el.format).toBeUndefined();
  });

  test("defaults decimals to 0 for heading (deg unit)", () => {
    const el: EditorElement = { id: "el1", type: "single-value" };
    const result = applyCatalogDefaults(el, headingEntry);
    expect(result.format?.decimals).toBe(0);
    expect(result.format?.unit).toBe("deg");
  });

  test("when entry has no unit, still sets decimals to default (1)", () => {
    const el: EditorElement = { id: "el1", type: "single-value" };
    const result = applyCatalogDefaults(el, noUnitEntry);
    // No unit to fill
    expect(result.format?.unit).toBeUndefined();
    // decimals still set to defaultDecimalsForUnit(undefined) = 1
    expect(result.format?.decimals).toBe(1);
  });
});
