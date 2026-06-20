// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect } from "vitest";
import { validateManifestStructure, validateDocument } from "../dist/index.js";

const manifest = {
  midl: "1.0.0", board: "x",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3, elements: ["single-value"] }],
  elements: [{ type: "single-value", bindings: ["value"] }],
  sources: ["signalk"],
};

test("built dist exposes a working validator with inlined schemas", () => {
  expect(validateManifestStructure(manifest)).toEqual([]);
  const r = validateDocument(
    '{"midl":"1.0.0","screens":[{"id":"d","elements":{"a":{"type":"single-value"}},"layout":{"element":"a"}}]}',
    manifest, "square-480",
  );
  expect(r.ok).toBe(true);
});
