// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Bless conformance/expected.json from the canonical TS validator. Dev tool:
//   npm --prefix ts run build && node conformance/gen-expected.mjs
// Each verdict = { ok, paths: [ORDERED DISTINCT issue paths, first-occurrence] }.
// Order is contractual; per-pointer multiplicity is normalized out (a JSON-Schema
// engine artifact). Hand-review the diff before committing — a changed verdict is
// a contract change.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateDocument } = require("../ts/dist/index.cjs");
const YAML = require("../ts/node_modules/yaml");

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const manifest = (cls) =>
  JSON.parse(readFileSync(join(ROOT, "schemas", "gen", `yb-midl-capabilities.${cls}.json`), "utf8"));

/** First-occurrence order, duplicates removed. */
const orderedDistinct = (xs) => xs.filter((x, i) => xs.indexOf(x) === i);

const cases = YAML.parse(readFileSync(join(HERE, "cases.yaml"), "utf8")).cases;
const out = {};
for (const c of cases) {
  const res = validateDocument(c.doc, manifest(c.targetClass), c.targetClass);
  out[c.name] = { ok: res.ok, paths: orderedDistinct((res.issues ?? []).map((i) => i.path)) };
}
writeFileSync(join(HERE, "expected.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote conformance/expected.json (${cases.length} cases)`);
for (const [n, v] of Object.entries(out)) console.log(`  ${v.ok ? "ok " : "ERR"} ${n}  [${v.paths.join(", ")}]`);
