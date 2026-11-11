// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// midl#25: action target length. The firmware stores put AND command targets in
// a 96-byte buffer (instruments midl::kinds::ACTION_TARGET_MAX = 95) and rejects
// longer ones whole rather than truncating; the validators must agree.
import { describe, expect, test } from "vitest";
import { semanticErrors } from "../src/semantic";
import type { ConfigDoc } from "../src/types";

const TARGET = "/screens/0/elements/b/action/target";

function doc(kind: "put" | "nav" | "command", target: string): ConfigDoc {
  const action = kind === "put" ? { kind, target, value: 1 } : { kind, target };
  return { midl: "1.0.0", screens: [{ id: "d", elements: { b: { type: "button", action } }, layout: { element: "b" } }] };
}
const targetErrs = (kind: "put" | "nav" | "command", target: string) =>
  semanticErrors(doc(kind, target)).filter((i) => i.path === TARGET);

describe("command target length (midl#25)", () => {
  test("a 95-char command target is accepted", () => {
    expect(targetErrs("command", "x".repeat(95))).toEqual([]);
  });
  test("a 96-char command target is rejected at /action/target", () => {
    const errs = targetErrs("command", "x".repeat(96));
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/at most 95 bytes/);
  });
  test("length is counted in UTF-8 bytes, like the firmware's strlen", () => {
    expect(targetErrs("command", "é".repeat(47) + "x")).toEqual([]); // 95 bytes
    expect(targetErrs("command", "é".repeat(48))).toHaveLength(1); // 96 bytes, 48 chars
  });
  test("command targets stay free-form below the limit", () => {
    expect(targetErrs("command", "tack port")).toEqual([]);
  });
  test("put keeps its SignalK-path rule (95 ok, 96 rejected)", () => {
    expect(targetErrs("put", "a." + "b".repeat(93))).toEqual([]);
    expect(targetErrs("put", "a." + "b".repeat(94))).toHaveLength(1);
  });
});
