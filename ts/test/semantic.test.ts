// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, describe } from "vitest";
import { validateSemantics, semanticErrors } from "../src/semantic";
import type { ConfigDoc } from "../src/types";

// The acceptance "valid" config from the task spec (dir -> flow).
const validDoc: ConfigDoc = {
  midl: "1.0.0",
  screens: [
    {
      id: "dash",
      elements: {
        wind: { type: "windrose", bindings: { value: { kind: "signalk", path: "environment.wind.speedApparent" } } },
        sog: { type: "single-value", name: "SOG", format: { unit: "kn" }, bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } } },
        depth: { type: "single-value", name: "DEPTH", format: { unit: "m" }, bindings: { value: { kind: "signalk", path: "environment.depth.belowTransducer" } } },
      },
      layout: {
        flow: "row",
        children: [
          { element: "wind" },
          { flow: "col", children: [{ element: "sog" }, { element: "depth" }] },
        ],
      },
    },
  ],
};

test("the acceptance valid config has no semantic errors", () => {
  expect(semanticErrors(validDoc)).toEqual([]);
  expect(validateSemantics(validDoc)).toEqual([]);
});

describe("element reference resolution (check #1)", () => {
  test("layout referencing a missing element errors with a clear message", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "single-value", bindings: { value: { kind: "signalk", path: "x" } } } }, layout: { element: "missing" } }],
    };
    const errs = semanticErrors(doc);
    expect(errs.some((i) => /layout\.element "missing" does not exist in screen\.elements/.test(i.message))).toBe(true);
  });

  test("missing reference nested in a split is caught with a path", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "single-value", bindings: { value: { kind: "signalk", path: "x" } } } }, layout: { flow: "row", children: [{ element: "a" }, { element: "nope" }] } }],
    };
    const errs = semanticErrors(doc);
    expect(errs.some((i) => i.path === "/screens/0/layout/children/1/element")).toBe(true);
  });
});

describe("duplicate ids (checks #2, #3)", () => {
  test("duplicate screen.id is rejected", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [
        { id: "dup", elements: { a: { type: "button" } }, layout: { element: "a" } },
        { id: "dup", elements: { b: { type: "button" } }, layout: { element: "b" } },
      ],
    };
    expect(semanticErrors(doc).some((i) => /duplicate screen\.id "dup"/.test(i.message))).toBe(true);
  });

  test("duplicate alarm.id is rejected", () => {
    const doc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { element: "a" } }],
      alarms: [
        { id: "a1", source: { kind: "signalk", path: "x" }, level: "warn", gt: 1, message: "m" },
        { id: "a1", source: { kind: "signalk", path: "y" }, level: "warn", gt: 2, message: "m" },
      ],
    } as unknown as ConfigDoc;
    expect(semanticErrors(doc).some((i) => /duplicate alarm\.id "a1"/.test(i.message))).toBe(true);
  });
});

describe("layout arithmetic (checks #4, #5)", () => {
  test("weights length must match children length", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "button" }, b: { type: "button" } }, layout: { flow: "row", children: [{ element: "a" }, { element: "b" }], weights: [1] } }],
    };
    expect(semanticErrors(doc).some((i) => /weights length must match children length/.test(i.message))).toBe(true);
  });

  test("grid cells length must equal rows * cols", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { rows: 2, cols: 2, cells: [{ element: "a" }] } }],
    };
    expect(semanticErrors(doc).some((i) => /grid cells length must equal rows \* cols/.test(i.message))).toBe(true);
  });

  test("matching weights / grids produce no error", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{
        id: "d",
        elements: { a: { type: "button" }, b: { type: "button" }, c: { type: "button" }, d: { type: "button" } },
        layout: { rows: 2, cols: 2, cells: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }] },
      }],
    };
    expect(semanticErrors(doc)).toEqual([]);
  });
});

describe("preset resolution (check #6)", () => {
  test("known preset resolves and its slot refs are checked", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { preset: "full", slots: ["a"] } }],
    };
    expect(semanticErrors(doc)).toEqual([]);
  });

  test("unknown preset errors clearly, not silently accepted", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { preset: "nope", slots: ["a"] } }],
    };
    expect(semanticErrors(doc).some((i) => /preset "nope" is not a known preset/.test(i.message))).toBe(true);
  });

  test("preset slot referencing a missing element errors", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { preset: "full", slots: ["ghost"] } }],
    };
    expect(semanticErrors(doc).some((i) => /"ghost" does not exist in screen\.elements/.test(i.message))).toBe(true);
  });
});

describe("variants (check #7)", () => {
  test("variant layout refs are resolved against the screen's elements", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{
        id: "d",
        elements: { a: { type: "button" }, b: { type: "button" } },
        layout: { element: "a" },
        variants: [{ class: "square-480", layout: { element: "b" } }],
      }],
    };
    expect(semanticErrors(doc)).toEqual([]);
  });

  test("variant referencing a missing element errors", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{
        id: "d",
        elements: { a: { type: "button" } },
        layout: { element: "a" },
        variants: [{ class: "square-480", layout: { element: "ghost" } }],
      }],
    };
    expect(semanticErrors(doc).some((i) => i.path.startsWith("/screens/0/variants/0/layout"))).toBe(true);
  });

  test("variant without a class errors", () => {
    const doc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { element: "a" }, variants: [{ layout: { element: "a" } }] }],
    } as unknown as ConfigDoc;
    expect(semanticErrors(doc).some((i) => /variant must declare a non-empty class/.test(i.message))).toBe(true);
  });
});

describe("element binding requirements (check #8)", () => {
  test("single-value without a value binding errors", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "single-value" } }, layout: { element: "a" } }],
    };
    expect(semanticErrors(doc).some((i) => /requires a "value" binding/.test(i.message))).toBe(true);
  });

  test("button requires no bindings", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "button" } }, layout: { element: "a" } }],
    };
    expect(semanticErrors(doc)).toEqual([]);
  });

  test("unknown element type produces a warning, not an error", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "future-widget" } }, layout: { element: "a" } }],
    };
    const all = validateSemantics(doc);
    expect(all.some((i) => i.severity === "warning" && /unregistered type "future-widget"/.test(i.message))).toBe(true);
    expect(semanticErrors(doc)).toEqual([]);
  });
});

describe("source sanity (check #9)", () => {
  test("signalk binding with an empty path errors", () => {
    const doc: ConfigDoc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "single-value", bindings: { value: { kind: "signalk", path: "" } } } }, layout: { element: "a" } }],
    };
    expect(semanticErrors(doc).some((i) => /source\.kind "signalk" requires a non-empty path/.test(i.message))).toBe(true);
  });

  test("computed binding with an empty expr errors", () => {
    const doc = {
      midl: "1.0.0",
      screens: [{ id: "d", elements: { a: { type: "single-value", bindings: { value: { kind: "computed", expr: "  " } } } }, layout: { element: "a" } }],
    } as unknown as ConfigDoc;
    expect(semanticErrors(doc).some((i) => /source\.kind "computed" requires a non-empty expr/.test(i.message))).toBe(true);
  });
});
