// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import { convert, formatValue } from "../src/format";

test("converts m/s to kn", () => {
  expect(convert(1, "m/s", "kn")).toBeCloseTo(1.94384, 4);
});

test("converts radians to degrees", () => {
  expect(convert(Math.PI, "rad", "deg")).toBeCloseTo(180, 6);
});

test("identity when units unknown or equal", () => {
  expect(convert(5, "widgets", "widgets")).toBe(5);
  expect(convert(5, undefined, "kn")).toBe(5);
});

test("formatValue converts SI then appends the requested unit with decimals", () => {
  const r = formatValue(3.086, { unit: "kn", decimals: 1 }, "m/s");
  expect(r.text).toBe("6.0 kn");
  expect(r.numeric).toBeCloseTo(5.9986, 3);
});

test("formatValue with no format echoes the number", () => {
  expect(formatValue(78, undefined).text).toBe("78");
});

test("non-finite and non-numeric format to placeholder", () => {
  expect(formatValue(Number.NaN, { unit: "kn" }).text).toBe("--");
  expect(formatValue("oops", { unit: "kn" }).text).toBe("--");
  expect(formatValue(null, undefined).text).toBe("--");
});
