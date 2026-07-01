// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { describe, it, expect } from "vitest";
import { EDITOR_VERSION } from "./index";

describe("EDITOR_VERSION", () => {
  it('equals "0.1.0"', () => {
    expect(EDITOR_VERSION).toBe("0.1.0");
  });
});
