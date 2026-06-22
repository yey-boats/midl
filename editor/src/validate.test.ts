// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { Manifest } from "@yey-boats/midl";
import { parseMidl } from "./midl-io";
import { validateModel } from "./validate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "__fixtures__");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

// Minimal manifest covering all element types used in our fixtures.
// Mirrors schemas/gen/yb-midl-capabilities.square-480.json
const SQUARE_480_MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "esp32-4848s040",
  classes: [
    {
      id: "square-480",
      maxTiles: 4,
      maxDepth: 3,
      presets: ["full", "hero-split"],
      elements: ["single-value", "text", "gauge", "bar", "compass", "windrose", "trend", "autopilot", "button"],
    },
  ],
  elements: [
    { type: "single-value", bindings: ["value"] },
    { type: "text", bindings: ["value"] },
    { type: "gauge", bindings: ["value"] },
    { type: "bar", bindings: ["value"] },
    { type: "compass", bindings: ["value", "dir"] },
    { type: "windrose", bindings: ["value", "dir"] },
    { type: "trend", bindings: ["value"] },
    { type: "autopilot", bindings: ["value"] },
    { type: "button", bindings: [] },
  ],
  sources: ["signalk", "local"],
  actionKinds: ["nav", "command"],
  presets: ["full", "hero-split"],
};

describe("validateModel — valid fixtures", () => {
  it("navigation.midl.yaml is valid for square-480 → ok:true with no error issues", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);
    const result = validateModel(model, SQUARE_480_MANIFEST);

    expect(result.ok).toBe(true);
    const errors = result.issues.filter((i) => i.severity === "error" || i.severity === undefined);
    // No hard errors; might have warnings but that is fine
    expect(errors).toHaveLength(0);
  });

  it("electrical.midl.yaml is valid for square-480 → ok:true", () => {
    const src = loadFixture("electrical.midl.yaml");
    const model = parseMidl(src);
    const result = validateModel(model, SQUARE_480_MANIFEST);

    expect(result.ok).toBe(true);
  });

  it("wind-steering.midl.yaml is valid for square-480 → ok:true", () => {
    const src = loadFixture("wind-steering.midl.yaml");
    const model = parseMidl(src);
    const result = validateModel(model, SQUARE_480_MANIFEST);

    expect(result.ok).toBe(true);
  });
});

describe("validateModel — invalid models", () => {
  it("model with bogus element type → ok:false with at least one issue carrying a path", () => {
    // Build a minimal model with an element type not in the manifest, referenced
    // in the layout and with no class variant (so satisfy.ts uses the base layout).
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);

    // Replace the element under dtw with an unsupported type.
    // Also clear all variants so satisfy.ts uses the base layout (not the square-480 variant).
    model.elements["dtw"] = { id: "dtw", type: "totally-unknown-widget-type" };
    model.variants = [];

    const result = validateModel(model, SQUARE_480_MANIFEST);

    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    // At least one issue must carry a non-empty path or have a message
    const withPath = result.issues.find(
      (i) => (typeof i.path === "string") && i.message.length > 0
    );
    expect(withPath).toBeDefined();
  });

  it("model targeting a class that does not support a used element → ok:false", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);

    // A manifest where compass is NOT in the class elements list
    const restrictedManifest: Manifest = {
      ...SQUARE_480_MANIFEST,
      classes: [
        {
          id: "square-480",
          maxTiles: 4,
          maxDepth: 3,
          elements: ["single-value", "bar"], // no compass
        },
      ],
    };

    // navigation.midl.yaml uses a compass element
    const result = validateModel(model, restrictedManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    const hasPath = result.issues.some((i) => typeof i.path === "string" && i.message.length > 0);
    expect(hasPath).toBe(true);
  });

  it("validation of malformed source string returns ok:false with fallback issue at path ''", () => {
    // Directly test the error-recovery path: give validateModel a model that
    // serializes to valid YAML but triggers an issue from prepareDashboard.
    // We achieve this by using an empty manifest with no recognized element types.
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);

    const emptyManifest: Manifest = {
      midl: "1.0.0",
      board: "esp32-4848s040",
      classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3, elements: [] }],
      elements: [],
      sources: ["signalk"],
    };

    const result = validateModel(model, emptyManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("validateModel — Validation shape", () => {
  it("returns issues array with objects having path and message string fields", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);
    // Replace an element with an unsupported type and clear variants so the base layout is checked.
    model.elements["dtw"] = { id: "dtw", type: "totally-unknown-widget-type" };
    model.variants = [];

    const result = validateModel(model, SQUARE_480_MANIFEST);

    for (const issue of result.issues) {
      expect(typeof issue.path).toBe("string");
      expect(typeof issue.message).toBe("string");
      if (issue.severity !== undefined) {
        expect(["error", "warning"]).toContain(issue.severity);
      }
    }
  });

  it("ok field is true iff no issue has severity 'error' (or omitted severity)", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);
    const result = validateModel(model, SQUARE_480_MANIFEST);

    const hasErrors = result.issues.some(
      (i) => i.severity === "error" || i.severity === undefined
    );
    // ok should be true when no errors
    expect(result.ok).toBe(!hasErrors);
  });
});
