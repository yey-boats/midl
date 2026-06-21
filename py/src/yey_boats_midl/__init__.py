# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Pure MIDL validator (Python) — mirrors ts/src/index.ts validateDocument.

Pipeline (ordered; first failing stage returns):
  1. manifest well-formedness (issues under /manifest…)
  2. structural (JSON Schema 2020-12 against the shared config schema)
  3. semantic (errors halt; warnings do not)
  4. version compatibility (same major AND doc.minor <= manifest.minor; -> /midl)
  5. capability satisfaction against the target class

Parity with the TypeScript reference is enforced by the frozen conformance
corpus (conformance/cases.yaml + conformance/expected.json). Only the overall
`ok` and the set of issue paths are contractual; messages/severities advisory.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import yaml

from .presets import PRESETS, count_tiles, depth, expand
from .satisfy import satisfies
from .semantic import semantic_errors, validate_semantics
from .types import Issue, MidlVersion
from .validate import validate_config_structure, validate_manifest_structure
from .version import compatible, parse_version

__all__ = [
    "Issue",
    "MidlVersion",
    "ValidationResult",
    "validate_document",
    "parse_doc",
    "validate_config_structure",
    "validate_manifest_structure",
    "validate_semantics",
    "semantic_errors",
    "satisfies",
    "compatible",
    "parse_version",
    "expand",
    "count_tiles",
    "depth",
    "PRESETS",
]


@dataclass
class ValidationResult:
    ok: bool
    issues: List[Issue]


def parse_doc(text: str) -> Any:
    """Parse YAML or JSON input (YAML is a JSON superset) — mirrors parseDoc."""
    return yaml.safe_load(text)


def validate_document(doc: Dict[str, Any], manifest: Dict[str, Any], class_name: str) -> List[Issue]:
    """Run the full pipeline; return the first failing stage's issues.

    Returns a list of Issue. A document is admissible iff every returned issue
    is a warning (i.e. there are no error-severity issues). Surviving semantic
    warnings are merged into the result on an otherwise-ok document.
    """
    manifest_issues = validate_manifest_structure(manifest)
    if manifest_issues:
        return [
            Issue(f"/manifest{'' if i.path == '/' else i.path}", i.message, i.severity)
            for i in manifest_issues
        ]

    structural = validate_config_structure(doc)
    if structural:
        return structural

    semantic = validate_semantics(doc)
    semantic_errs = [i for i in semantic if i.severity != "warning"]
    if semantic_errs:
        return semantic
    warnings = [i for i in semantic if i.severity == "warning"]

    if not compatible(parse_version(doc["midl"]), parse_version(manifest["midl"])):
        return [
            *warnings,
            Issue("/midl", f"incompatible MIDL {doc['midl']} vs device {manifest['midl']}"),
        ]

    sat = satisfies(doc, manifest, class_name)
    return [*warnings, *sat]


def verdict(issues: List[Issue]) -> ValidationResult:
    """Wrap pipeline issues into the {ok, issues} verdict shape."""
    ok = all(i.severity == "warning" for i in issues)
    return ValidationResult(ok=ok, issues=issues)
