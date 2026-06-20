// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// Schema-level (structural) validation tests for the tightened JSON Schema.
// These exercise rules enforced by Ajv against yb-midl-config.schema.json,
// distinct from the semantic pass (semantic.test.ts).

import { test, expect, describe } from "vitest";
import { validateConfigStructure } from "../src/validate";

const ok = (doc: unknown) => validateConfigStructure(doc).length === 0;

describe("top-level structure tightening (schema req #2)", () => {
  test("empty screens array is rejected (must contain at least one screen)", () => {
    expect(ok({ midl: "1.0.0", screens: [] })).toBe(false);
  });

  test("a screen with empty elements is rejected", () => {
    expect(ok({ midl: "1.0.0", screens: [{ id: "d", elements: {}, layout: { element: "x" } }] })).toBe(false);
  });

  test("a split with empty children is rejected", () => {
    expect(ok({ midl: "1.0.0", screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { flow: "row", children: [] } }] })).toBe(false);
  });

  test("a grid with empty cells is rejected", () => {
    expect(ok({ midl: "1.0.0", screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { rows: 1, cols: 1, cells: [] } }] })).toBe(false);
  });

  test("non-positive grid rows is rejected", () => {
    expect(ok({ midl: "1.0.0", screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { rows: 0, cols: 1, cells: [{ element: "a" }] } }] })).toBe(false);
  });

  test("a zero/negative weight is rejected", () => {
    expect(ok({ midl: "1.0.0", screens: [{ id: "d", elements: { a: { type: "button" }, b: { type: "button" } }, layout: { flow: "row", children: [{ element: "a" }, { element: "b" }], weights: [1, 0] } }] })).toBe(false);
  });

  test("a minimal well-formed config still passes", () => {
    expect(ok({ midl: "1.0.0", screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { element: "a" } }] })).toBe(true);
  });
});

describe("source.kind conditional requirements (schema req #3)", () => {
  const wrap = (src: unknown) => ({
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "single-value", bindings: { value: src } } }, layout: { element: "a" } }],
  });

  test("signalk without path is rejected", () => {
    expect(ok(wrap({ kind: "signalk" }))).toBe(false);
  });
  test("local without id is rejected", () => {
    expect(ok(wrap({ kind: "local" }))).toBe(false);
  });
  test("const without value is rejected", () => {
    expect(ok(wrap({ kind: "const" }))).toBe(false);
  });
  test("computed without expr is rejected", () => {
    expect(ok(wrap({ kind: "computed" }))).toBe(false);
  });
  test("each kind with its required field passes", () => {
    expect(ok(wrap({ kind: "signalk", path: "navigation.speedOverGround" }))).toBe(true);
    expect(ok(wrap({ kind: "local", id: "gpio4" }))).toBe(true);
    expect(ok(wrap({ kind: "const", value: 42 }))).toBe(true);
    expect(ok(wrap({ kind: "computed", expr: "a+b" }))).toBe(true);
  });
});

describe("action.kind conditional requirements (schema req #4)", () => {
  const wrap = (action: unknown) => ({
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "button", action } }, layout: { element: "a" } }],
  });

  test("put without target+value is rejected", () => {
    expect(ok(wrap({ kind: "put", target: "x" }))).toBe(false);
    expect(ok(wrap({ kind: "put" }))).toBe(false);
  });
  test("nav without target is rejected", () => {
    expect(ok(wrap({ kind: "nav" }))).toBe(false);
  });
  test("command without target is rejected", () => {
    expect(ok(wrap({ kind: "command" }))).toBe(false);
  });
  test("complete actions pass", () => {
    expect(ok(wrap({ kind: "put", target: "x", value: 1 }))).toBe(true);
    expect(ok(wrap({ kind: "nav", target: "next" }))).toBe(true);
    expect(ok(wrap({ kind: "command", target: "tack" }))).toBe(true);
  });
});

describe("alarm tightening (schema req #5)", () => {
  const wrap = (alarm: unknown) => ({
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { element: "a" } }],
    alarms: [alarm],
  });

  test("alarm missing level/message is rejected", () => {
    expect(ok(wrap({ id: "a", source: { kind: "signalk", path: "x" }, gt: 1 }))).toBe(false);
  });
  test("alarm with neither lt nor gt is rejected", () => {
    expect(ok(wrap({ id: "a", source: { kind: "signalk", path: "x" }, level: "warn", message: "m" }))).toBe(false);
  });
  test("alarm with a bad level is rejected", () => {
    expect(ok(wrap({ id: "a", source: { kind: "signalk", path: "x" }, level: "critical", gt: 1, message: "m" }))).toBe(false);
  });
  test("a complete alarm passes", () => {
    expect(ok(wrap({ id: "a", source: { kind: "signalk", path: "x" }, level: "alarm", gt: 1, message: "Over limit" }))).toBe(true);
  });
});
