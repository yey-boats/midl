// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// The TypeScript half of the cross-language MIDL validation conformance contract.
// The Python validator runs the SAME conformance/cases.yaml against the SAME
// conformance/expected.json — divergence between the two is a parity failure.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { validateDocument } from "../src";
import type { Manifest } from "../src";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cases = (parseYaml(readFileSync(join(root, "conformance", "cases.yaml"), "utf8")) as {
  cases: Array<{ name: string; targetClass: string; doc: string }>;
}).cases;
const expected = JSON.parse(readFileSync(join(root, "conformance", "expected.json"), "utf8")) as Record<
  string,
  { ok: boolean; paths: string[] }
>;
/** First-occurrence order, duplicates removed (per-pointer multiplicity is engine-specific). */
const orderedDistinct = (xs: string[]): string[] => xs.filter((x, i) => xs.indexOf(x) === i);
const manifest = (cls: string): Manifest =>
  JSON.parse(readFileSync(join(root, "schemas", "gen", `yb-midl-capabilities.${cls}.json`), "utf8"));

describe("validation conformance corpus (TS)", () => {
  it("every case has a frozen expected verdict", () => {
    expect(cases.map((c) => c.name).sort()).toEqual(Object.keys(expected).sort());
  });

  for (const c of cases) {
    it(`${c.name}`, () => {
      const res = validateDocument(c.doc, manifest(c.targetClass), c.targetClass);
      const paths = orderedDistinct(res.issues.map((i) => i.path));
      expect({ ok: res.ok, paths }).toEqual(expected[c.name]);
    });
  }
});
