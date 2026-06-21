// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import * as midl from "../src/index";

test("renderer-relied exports remain on @yey-boats/midl", () => {
  for (const name of ["validateDocument", "parseDoc", "expand", "solveLayout", "layoutSummary", "toYaml"]) {
    expect(midl).toHaveProperty(name);
  }
});
