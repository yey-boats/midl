// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect } from "vitest";
import { validateDocument, expand } from "@yey-boats/midl";

test("can import @yey-boats/midl via the vite alias", () => {
  expect(typeof validateDocument).toBe("function");
  expect(expand({ preset: "full", slots: ["x"] })).toEqual({ element: "x" });
});
