// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// The two MIDL schemas (2020-12 dialect: $defs / oneOf) are PRECOMPILED to
// standalone validators at build time — see ts/scripts/gen-validators.mjs. We
// import those instead of calling ajv.compile() at runtime, because the
// front-shell serves a strict CSP without 'unsafe-eval' and Ajv's runtime
// compilation uses `new Function`, which that CSP blocks (blank-screen crash).
// Regenerate the module (`npm run gen:validators`) whenever the schemas change.
import type { ValidateFunction } from "ajv";
import { validateConfig as vConfig, validateCaps as vCaps } from "./generated/midl-validators.cjs";
import type { Issue } from "./types";

function toIssues(v: ValidateFunction): Issue[] {
  return (v.errors ?? []).map((e) => ({ path: e.instancePath || "/", message: e.message ?? "invalid" }));
}

export function validateConfigStructure(doc: unknown): Issue[] {
  return vConfig(doc) ? [] : toIssues(vConfig);
}

export function validateManifestStructure(doc: unknown): Issue[] {
  return vCaps(doc) ? [] : toIssues(vCaps);
}
