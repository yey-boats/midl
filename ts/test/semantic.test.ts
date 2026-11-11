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

describe("spacer cell semantics", () => {
  test("a spacer cell {} in a grid produces no semantic errors", () => {
    const doc = {
      midl: "1.0.0",
      screens: [{
        id: "s",
        elements: {
          a: { type: "single-value", bindings: { value: { kind: "signalk" as const, path: "navigation.speedOverGround" } } }
        },
        layout: { rows: 1, cols: 2, cells: [{ element: "a" }, {}] }
      }]
    };
    const issues = validateSemantics(doc as import("../src/types").ConfigDoc);
    const errors = issues.filter(i => i.severity !== "warning");
    expect(errors).toHaveLength(0);
  });

  test("a screen with zero elements produces no semantic errors when layout has only spacer cells", () => {
    const doc = {
      midl: "1.0.0",
      screens: [{
        id: "s",
        elements: {},
        layout: { rows: 1, cols: 1, cells: [{}] }
      }]
    };
    const issues = validateSemantics(doc as import("../src/types").ConfigDoc);
    const errors = issues.filter(i => i.severity !== "warning");
    expect(errors).toHaveLength(0);
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

describe("limits arithmetic (range / zones, check D1)", () => {
  function gaugeDoc(style: Record<string, unknown>): ConfigDoc {
    return {
      midl: "1.0.0",
      screens: [{
        id: "d",
        elements: { g: { type: "gauge", style, bindings: { value: { kind: "signalk", path: "x" } } } },
        layout: { element: "g" },
      }],
    };
  }

  test("inverted range [hi <= lo] is a hard error", () => {
    const errs = semanticErrors(gaugeDoc({ range: [100, 0] }));
    expect(errs.some((i) => /range \[100, 0\] is invalid/.test(i.message))).toBe(true);
    expect(errs.some((i) => i.path === "/screens/0/elements/g/style/range")).toBe(true);
  });

  test("zero-width range [n, n] is a hard error", () => {
    expect(semanticErrors(gaugeDoc({ range: [5, 5] })).length).toBeGreaterThan(0);
  });

  test("a valid range produces no error", () => {
    expect(semanticErrors(gaugeDoc({ range: [0, 100] }))).toEqual([]);
  });

  test("a zone threshold at/below the range floor is an advisory warning, not an error", () => {
    const doc = gaugeDoc({ range: [0, 100], zones: [{ lt: -5, color: "warn" }] });
    const all = validateSemantics(doc);
    expect(semanticErrors(doc)).toEqual([]);
    expect(all.some((i) => i.severity === "warning" && /at or below the range floor 0/.test(i.message))).toBe(true);
  });

  test("the idiomatic top-bucket sentinel (lt above hi) produces no issue", () => {
    // e.g. lt:101 for a 0..100 range = 'everything from the last band up to the top'.
    expect(validateSemantics(gaugeDoc({ range: [0, 100], zones: [{ lt: 20, color: "bad" }, { lt: 50, color: "warn" }, { lt: 101, color: "good" }] }))).toEqual([]);
  });
});

// midl#22: a `put` target must be a SignalK path (instruments midl_kinds.h
// put_target_ok): 2+ segments of [A-Za-z0-9_-] separated by single dots, no
// leading/trailing dot, at most 95 chars (ACTION_TARGET_MAX). Anything else
// could reach the console-command funnel or escape the PUT URL on the device.
describe("put action targets (midl#22)", () => {
  const putDoc = (target: unknown): ConfigDoc =>
    ({
      midl: "1.0.0",
      screens: [
        {
          id: "d",
          elements: { b: { type: "button", action: { kind: "put", target, value: 1 } } },
          layout: { element: "b" },
        },
      ],
    }) as ConfigDoc;
  const targetErrs = (target: unknown) =>
    semanticErrors(putDoc(target)).filter((i) => i.path === "/screens/0/elements/b/action/target");

  test.each([
    "steering.autopilot.state",
    "electrical.switches.anchorLight.state",
    "a.b",
    "propulsion.port-engine.state",
    "tanks.fuel_0.currentLevel",
    "a." + "b".repeat(93), // exactly 95 chars
  ])("accepts SignalK path %s", (t) => {
    expect(targetErrs(t)).toEqual([]);
  });

  test.each([
    ["single segment", "autopilot"],
    ["leading dot", ".a.b"],
    ["trailing dot", "a.b."],
    ["empty segment", "a..b"],
    ["slash (URL escape)", "../../x.y"],
    ["path separator", "a/b.c"],
    ["space", "a.b c"],
    ["percent", "a.b%2F"],
    ["empty", ""],
    ["96 chars", "a." + "b".repeat(94)],
  ])("rejects %s", (_label, t) => {
    expect(targetErrs(t)).toHaveLength(1);
  });

  test("nav and command targets are not held to the SignalK path rule", () => {
    for (const kind of ["nav", "command"] as const) {
      const doc = {
        midl: "1.0.0",
        screens: [
          { id: "d", elements: { b: { type: "button", action: { kind, target: "tack port" } } }, layout: { element: "b" } },
        ],
      } as ConfigDoc;
      expect(semanticErrors(doc)).toEqual([]);
    }
  });
});
