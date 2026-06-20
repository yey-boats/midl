// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect } from "vitest";
import { migrateDocument, registerMigration, _clearMigrationsForTest } from "../src/migrate";
import type { ConfigDoc } from "../src/types";

function doc(midl: string): ConfigDoc { return { midl, screens: [] }; }

test("same major is a no-op (returns an equal doc)", () => {
  const d = doc("1.3.0");
  expect(migrateDocument(d, "1.9.5").midl).toBe("1.3.0");
});

test("a registered major migration is applied and stamps the new version", () => {
  _clearMigrationsForTest();
  registerMigration(1, (d) => ({ ...d, screens: [...d.screens, { id: "added-by-migration", elements: {}, layout: { element: "x" } }] }));
  const out = migrateDocument(doc("1.0.0"), "2.0.0");
  expect(out.midl.startsWith("2.")).toBe(true);
  expect(out.screens.some((s: any) => s.id === "added-by-migration")).toBe(true);
});

test("a missing major migration throws", () => {
  _clearMigrationsForTest();
  expect(() => migrateDocument(doc("1.0.0"), "2.0.0")).toThrow(/no migration/i);
});

test("downgrade (target major < doc major) throws", () => {
  _clearMigrationsForTest();
  expect(() => migrateDocument(doc("2.0.0"), "1.0.0")).toThrow(/downgrade/i);
});
