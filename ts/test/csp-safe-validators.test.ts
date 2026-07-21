// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// Issue: the front-shell serves a strict CSP (no 'unsafe-eval'). Ajv compiles
// schemas at runtime via `new Function`, which that CSP blocks — crashing the
// app on load. Fix: precompile the two MIDL schemas to STANDALONE validators at
// build time (no runtime eval), and have validate.ts import those.
//
// This test pins the CSP-safety contract: the generated validator module must
// contain NO runtime code-generation, and validate.ts must still behave.
import { test, expect, describe } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateConfigStructure, validateManifestStructure } from "../src/validate";

const here = path.dirname(fileURLToPath(import.meta.url));
const GENERATED = path.resolve(here, "../src/generated/midl-validators.cjs");

describe("CSP-safe standalone validators", () => {
  test("generated validator module exists and contains NO runtime eval", () => {
    const src = readFileSync(GENERATED, "utf8");
    // The whole point: standalone code, no `new Function(` / `eval(` anywhere.
    expect(/new Function\s*\(/.test(src)).toBe(false);
    expect(/\beval\s*\(/.test(src)).toBe(false);
    // Sanity: it actually exports the two validators we consume.
    expect(/validateConfig/.test(src)).toBe(true);
    expect(/validateCaps/.test(src)).toBe(true);
  });

  test("validateConfigStructure still accepts a well-formed config", () => {
    const doc = { midl: "1.0.0", screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { element: "a" } }] };
    expect(validateConfigStructure(doc)).toEqual([]);
  });

  test("validateConfigStructure still rejects a malformed config (with a path+message)", () => {
    const issues = validateConfigStructure({ midl: "1.0.0", screens: [] }); // empty screens is invalid
    expect(issues.length).toBeGreaterThan(0);
    expect(typeof issues[0].path).toBe("string");
    expect(typeof issues[0].message).toBe("string");
  });

  test("validateManifestStructure still runs (rejects an obviously invalid manifest)", () => {
    expect(validateManifestStructure({ not: "a manifest" }).length).toBeGreaterThan(0);
  });
});
