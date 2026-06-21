// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { parseDoc } from "./canonicalize";
import { validateConfigStructure, validateManifestStructure } from "./validate";
import { validateSemantics } from "./semantic";
import { satisfies } from "./satisfy";
import { parseVersion, compatible } from "./version";
import type { ConfigDoc, Issue, Manifest } from "./types";

export * from "./types";
export { parseVersion, compatible } from "./version";
export { expand, countTiles, depth, PRESETS } from "./presets";
export { parseDoc, toCanonicalJson, toYaml } from "./canonicalize";
export { validateConfigStructure, validateManifestStructure } from "./validate";
export { validateSemantics, semanticErrors } from "./semantic";
export { satisfies } from "./satisfy";
export { migrateDocument, registerMigration } from "./migrate";
export type { Migration } from "./migrate";
export { solveLayout } from "./solve";
export type { Rect, Placement } from "./solve";
export { layoutSummary } from "./summary";
export type { LayoutSummary } from "./summary";

export interface ValidationResult { ok: boolean; issues: Issue[]; }

// Full pipeline: manifest well-formedness -> config structural -> semantic
// (meaning) -> version compat -> capability satisfaction. The three validation
// concerns are kept distinct (structural shape, internal meaning, device
// capability) but composed here in order. Returns the first failing stage's
// issues. The manifest is checked first so a malformed manifest version
// surfaces as an issue rather than throwing out of parseVersion below.
//
// The semantic pass can emit advisory `warning`s (e.g. an unregistered element
// type); warnings never make a document inadmissible. Only `error`-severity
// semantic issues halt the pipeline. Surviving warnings are merged into the
// final result so callers see them alongside an `ok: true`.
export function validateDocument(text: string, manifest: Manifest, className: string): ValidationResult {
  const manifestIssues = validateManifestStructure(manifest);
  if (manifestIssues.length)
    return { ok: false, issues: manifestIssues.map((i) => ({ path: `/manifest${i.path === "/" ? "" : i.path}`, message: i.message })) };

  const doc = parseDoc(text) as ConfigDoc;
  const structural = validateConfigStructure(doc);
  if (structural.length) return { ok: false, issues: structural };

  const semantic = validateSemantics(doc);
  const semanticErrs = semantic.filter((i) => i.severity !== "warning");
  if (semanticErrs.length) return { ok: false, issues: semantic };
  const warnings = semantic.filter((i) => i.severity === "warning");

  if (!compatible(parseVersion(doc.midl), parseVersion(manifest.midl)))
    return { ok: false, issues: [...warnings, { path: "/midl", message: `incompatible MIDL ${doc.midl} vs device ${manifest.midl}` }] };

  const sat = satisfies(doc, manifest, className);
  return { ok: sat.length === 0, issues: [...warnings, ...sat] };
}
