// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import type { Manifest } from "@yey-boats/midl";
import { prepareDashboard } from "@yey-boats/midl-web";
import type { EditorModel } from "./model";
import { serializeMidl } from "./midl-io";
import type { Issue, Validation } from "./adapters";

// Viewport used for validation layout solving — matches the canonical square-480 size.
// prepareDashboard needs a Rect to compute placements; the exact size only matters for
// layout solving (not for structural/semantic issues), so a fixed 480×480 is fine here.
const VALIDATION_VIEWPORT = { x: 0, y: 0, w: 480, h: 480 };

/**
 * Validate an EditorModel against a MIDL manifest.
 *
 * Serializes the model to YAML, runs it through `prepareDashboard` (which applies
 * the full MIDL validation pipeline: structural → semantic → version → capability),
 * maps the resulting issues to our `Issue` shape, and returns a `Validation`.
 *
 * `ok` is true when no issue has severity "error" (or omitted severity, which
 * defaults to "error" per the MIDL spec).
 *
 * If `prepareDashboard` throws on malformed input, the error is caught and returned
 * as a single top-level issue at path "".
 */
export function validateModel(model: EditorModel, manifest: Manifest): Validation {
  let issues: Issue[];
  try {
    const text = serializeMidl(model, "yaml");
    // Use the first class in the manifest, or fall back to "square-480".
    const className = manifest.classes[0]?.id ?? "square-480";
    const result = prepareDashboard(text, manifest, className, VALIDATION_VIEWPORT);
    issues = result.issues.map((i) => ({
      path: i.path,
      message: i.message,
      severity: i.severity,
    }));
  } catch (err) {
    return { ok: false, issues: [{ path: "", message: String(err) }] };
  }

  const ok = issues.every((i) => i.severity === "warning");
  return { ok, issues };
}
