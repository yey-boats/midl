# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Structural validation (JSON Schema 2020-12) — mirrors ts/src/validate.ts.

Both validators consume the SAME shared schema artifacts under schemas/. AJV's
`instancePath` is a JSON Pointer ("" for the document root); the empty pointer
is rendered as "/" to match. jsonschema's `error.absolute_path` (a deque of
keys/indices) is rendered to the same JSON Pointer form.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, List

from jsonschema import Draft202012Validator

from .types import Issue

# Repo root = three parents up from this file: src/yey_boats_midl -> src -> py -> repo.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCHEMA_DIR = _REPO_ROOT / "schemas"
_CONFIG_SCHEMA = _SCHEMA_DIR / "yb-midl-config.schema.json"
_CAPS_SCHEMA = _SCHEMA_DIR / "yb-midl-capabilities.schema.json"


def _pointer(path) -> str:
    """Render a jsonschema absolute_path (deque of tokens) as a JSON Pointer.

    Mirrors AJV's `instancePath`: the document root is the empty pointer, which
    the pipeline renders as "/".
    """
    parts = []
    for tok in path:
        s = str(tok)
        parts.append(s.replace("~", "~0").replace("/", "~1"))
    return "".join(f"/{p}" for p in parts)


@lru_cache(maxsize=None)
def _validator(schema_path: str) -> Draft202012Validator:
    with open(schema_path, "r", encoding="utf-8") as fh:
        schema = json.load(fh)
    return Draft202012Validator(schema)


def _to_issues(validator: Draft202012Validator, doc: Any) -> List[Issue]:
    issues: List[Issue] = []
    for err in validator.iter_errors(doc):
        path = _pointer(err.absolute_path) or "/"
        issues.append(Issue(path, err.message or "invalid"))
    return issues


def validate_config_structure(doc: Any) -> List[Issue]:
    return _to_issues(_validator(str(_CONFIG_SCHEMA)), doc)


def validate_manifest_structure(doc: Any) -> List[Issue]:
    return _to_issues(_validator(str(_CAPS_SCHEMA)), doc)
