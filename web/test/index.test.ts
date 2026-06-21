// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect } from "vitest";
import * as midlWeb from "../src/index";

test("public surface is exported", () => {
  for (const name of ["MidlDashboard", "renderDashboard", "TrendBuffers", "MockDataProvider", "collectBindings", "THEMES", "theme", "resolveElement", "formatValue", "convert"]) {
    expect(midlWeb).toHaveProperty(name);
  }
});
