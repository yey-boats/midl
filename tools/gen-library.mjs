// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Generate library/index.json — the agent-searchable catalog of the standard
// MIDL layout library. Each entry is the layout's id/file plus its
// layoutSummary (meta + classes + element types). Run after building @yey-boats/midl:
//   npm --prefix ts run build && node tools/gen-library.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Load the CJS build: its dependency imports (ajv subpaths) resolve under
// Node's looser CommonJS resolution, where the ESM build trips on extensions.
const require = createRequire(import.meta.url);
const { parseDoc, layoutSummary } = require("../ts/dist/index.cjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "library");
const out = readdirSync(LIB)
  .filter((f) => f.endsWith(".midl.yaml"))
  .sort()
  .map((file) => {
    const doc = parseDoc(readFileSync(join(LIB, file), "utf8"));
    return { id: file.replace(/\.midl\.yaml$/, ""), file, ...layoutSummary(doc) };
  });
writeFileSync(join(LIB, "index.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote library/index.json (${out.length} layouts)`);
