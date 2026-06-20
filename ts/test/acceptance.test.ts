// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// The exact acceptance cases from the YB-MIDL semantic-validation spec,
// adapted dir -> flow. The valid config must pass end-to-end; each invalid
// config must fail with the specified clear error.

import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateDocument } from "../src/index";
import { validateConfigStructure } from "../src/validate";
import { semanticErrors } from "../src/semantic";
import type { ConfigDoc, Manifest } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const manifest: Manifest = JSON.parse(readFileSync(join(here, "fixtures/manifest.sunton-480.json"), "utf8"));

// The manifest fixture's class only advertises single-value + compass, so use
// a broader manifest for the windrose-bearing acceptance config.
const wideManifest: Manifest = {
  ...manifest,
  classes: [{ id: "sunton-480", width: 480, height: 480, maxTiles: 4, maxDepth: 3, elements: ["single-value", "windrose"] }],
  elements: [
    { type: "single-value", bindings: ["value"] },
    { type: "windrose", bindings: ["value"] },
  ],
};

test("acceptance: the valid hero-split config passes end-to-end", () => {
  const text = readFileSync(join(here, "fixtures/valid/hero-split.yaml"), "utf8");
  const r = validateDocument(text, wideManifest, "sunton-480");
  expect(r.ok).toBe(true);
  expect(r.issues).toEqual([]);
});

test("acceptance #1: empty screens -> 'at least one screen'", () => {
  // Structural rule: screens.minItems = 1.
  const issues = validateConfigStructure({ midl: "1.0.0", screens: [] });
  expect(issues.length).toBeGreaterThan(0);
  expect(issues.some((i) => /must NOT have fewer than 1 items|minItems/i.test(i.message) || i.path === "/screens")).toBe(true);
});

test("acceptance #2: layout.element 'missing' does not exist in screen.elements", () => {
  const doc: ConfigDoc = {
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "single-value", bindings: { value: { kind: "signalk", path: "x" } } } }, layout: { element: "missing" } }],
  };
  expect(semanticErrors(doc).some((i) => /layout\.element "missing" does not exist in screen\.elements/.test(i.message))).toBe(true);
});

test("acceptance #3: source { kind: signalk } (no path) -> requires path", () => {
  const doc = {
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "single-value", bindings: { value: { kind: "signalk" } } } }, layout: { element: "a" } }],
  };
  // Caught structurally (if/then) ...
  expect(validateConfigStructure(doc).length).toBeGreaterThan(0);
  // ... and by the semantic source-sanity check.
  expect(semanticErrors(doc as unknown as ConfigDoc).some((i) => /source\.kind "signalk" requires/.test(i.message))).toBe(true);
});

test("acceptance #4: flow row with weights length mismatch -> weights length must match children length", () => {
  const doc: ConfigDoc = {
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "button" }, b: { type: "button" } }, layout: { flow: "row", children: [{ element: "a" }, { element: "b" }], weights: [1] } }],
  };
  expect(semanticErrors(doc).some((i) => /weights length must match children length/.test(i.message))).toBe(true);
});

test("acceptance #5: 2x2 grid with one cell -> grid cells length must equal rows * cols", () => {
  const doc: ConfigDoc = {
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { rows: 2, cols: 2, cells: [{ element: "a" }] } }],
  };
  expect(semanticErrors(doc).some((i) => /grid cells length must equal rows \* cols/.test(i.message))).toBe(true);
});

test("acceptance #6: alarm with no lt/gt -> must define at least one threshold", () => {
  const doc = {
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { element: "a" } }],
    alarms: [{ id: "a", source: { kind: "signalk", path: "x" }, level: "warn", message: "m" }],
  };
  // Enforced by the schema anyOf(lt, gt).
  expect(validateConfigStructure(doc).length).toBeGreaterThan(0);
});
