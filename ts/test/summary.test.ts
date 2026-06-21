// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { describe, it, expect } from "vitest";
import { layoutSummary, parseDoc } from "../src";
import type { ConfigDoc } from "../src";

describe("layoutSummary", () => {
  it("summarizes meta, classes and element types", () => {
    const doc = parseDoc(`
midl: 1.0.0
meta: { title: Wind, useCase: upwind, tags: [sailing, wind] }
screens:
  - id: s
    meta: { tags: [steering] }
    elements:
      w: { type: windrose, bindings: { value: { kind: signalk, path: environment.wind.speedApparent }, dir: { kind: signalk, path: environment.wind.angleApparent } } }
      v: { type: single-value, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }
    layout: { flow: row, children: [{ element: w }, { element: v }] }
    variants:
      - { class: square-480, layout: { element: w } }`) as ConfigDoc;
    const s = layoutSummary(doc);
    expect(s.title).toBe("Wind");
    expect(s.useCase).toBe("upwind");
    expect(s.tags).toEqual(expect.arrayContaining(["sailing", "wind", "steering"]));
    expect(s.elements).toEqual(expect.arrayContaining(["windrose", "single-value"]));
    expect(s.classes).toContain("square-480");
  });

  it("handles a doc with no meta", () => {
    const doc = parseDoc(`
midl: 1.0.0
screens:
  - id: s
    elements: { a: { type: text, bindings: { value: { kind: signalk, path: navigation.state } } } }
    layout: { element: a }`) as ConfigDoc;
    const s = layoutSummary(doc);
    expect(s.tags).toEqual([]);
    expect(s.elements).toEqual(["text"]);
  });
});
