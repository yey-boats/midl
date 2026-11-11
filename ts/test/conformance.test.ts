// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// The TypeScript half of the cross-language MIDL validation conformance contract.
// The Python validator runs the SAME conformance/cases.yaml against the SAME
// conformance/expected.json — divergence between the two is a parity failure.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { validateDocument } from "../src";
import type { Manifest } from "../src";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cases = (parseYaml(readFileSync(join(root, "conformance", "cases.yaml"), "utf8")) as {
  cases: Array<{
    name: string;
    targetClass: string;
    doc?: string;
    docFile?: string; // repo-relative library/fixture document instead of inline `doc`
    manifestOverrides?: Partial<Manifest>; // shallow-merged onto the generated class manifest
  }>;
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
  // midl#16: the corpus is the parity contract; keep it from shrinking.
  it("has at least 60 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(60);
  });

  it("every case has a frozen expected verdict", () => {
    expect(cases.map((c) => c.name).sort()).toEqual(Object.keys(expected).sort());
  });

  // midl#25: a case's name states its verdict. `invalid` cases must be rejected;
  // `valid-*` and `library-*` cases must be admissible.
  it("case names agree with their expected verdicts", () => {
    const wrong = Object.entries(expected)
      .filter(([n, v]) => (n.split("-").includes("invalid") ? v.ok : /^(valid|library)-/.test(n) && !v.ok))
      .map(([n]) => n);
    expect(wrong).toEqual([]);
  });

  // midl#25: every standard library layout must validate on every device class.
  it("covers every library layout on every generated device class", () => {
    const libs = readdirSync(join(root, "library")).filter((f) => f.endsWith(".midl.yaml"));
    const classes = readdirSync(join(root, "schemas", "gen"))
      .map((f) => /^yb-midl-capabilities\.(.+)\.json$/.exec(f)?.[1])
      .filter((c): c is string => !!c);
    const have = new Set(cases.filter((c) => c.docFile?.startsWith("library/")).map((c) => `${c.docFile}@${c.targetClass}`));
    const missing = libs.flatMap((f) => classes.map((c) => `library/${f}@${c}`)).filter((k) => !have.has(k));
    expect(missing).toEqual([]);
  });

  for (const c of cases) {
    it(`${c.name}`, () => {
      const doc = c.docFile ? readFileSync(join(root, c.docFile), "utf8") : c.doc!;
      const res = validateDocument(doc, { ...manifest(c.targetClass), ...c.manifestOverrides }, c.targetClass);
      const paths = orderedDistinct(res.issues.map((i) => i.path));
      expect({ ok: res.ok, paths }).toEqual(expected[c.name]);
    });
  }
});
