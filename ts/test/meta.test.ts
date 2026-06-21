// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { describe, it, expect } from "vitest";
import { validateConfigStructure, parseDoc } from "../src";
import type { ConfigDoc } from "../src";

// `meta` is additive and optional at document / screen / element level. It is
// informational (renderers/firmware ignore it) and does NOT require a grammar
// version bump — a 1.0.0 document may carry it.
const withMeta = `
midl: 1.0.0
meta: { title: "Demo", description: "doc", useCase: "demo", agentNotes: "pick for demo", tags: [demo] }
screens:
  - id: s1
    meta: { title: "Screen 1", useCase: "show one value", tags: [nav] }
    elements:
      sog: { type: single-value, meta: { description: "speed over ground" }, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }
    layout: { element: sog }
`;

const withoutMeta = `
midl: 1.0.0
screens:
  - id: s1
    elements:
      sog: { type: single-value, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }
    layout: { element: sog }
`;

describe("meta extension", () => {
  it("accepts meta at doc/screen/element", () => {
    const issues = validateConfigStructure(parseDoc(withMeta) as ConfigDoc);
    expect(issues).toEqual([]);
  });

  it("remains valid without any meta (back-compat)", () => {
    const issues = validateConfigStructure(parseDoc(withoutMeta) as ConfigDoc);
    expect(issues).toEqual([]);
  });
});
