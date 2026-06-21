# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Cross-language parity is enforced here: the Python validator must reproduce
the frozen verdict (`ok` + sorted unique issue paths) recorded in
conformance/expected.json for every case in conformance/cases.yaml — the same
contract the TypeScript suite asserts. The corpus is the source of truth.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from yey_boats_midl import parse_doc, validate_document, verdict

_REPO_ROOT = Path(__file__).resolve().parents[2]
_CASES = _REPO_ROOT / "conformance" / "cases.yaml"
_EXPECTED = _REPO_ROOT / "conformance" / "expected.json"
_MANIFEST = _REPO_ROOT / "schemas" / "gen" / "yb-midl-capabilities.{cls}.json"


def _load_cases():
    with open(_CASES, "r", encoding="utf-8") as fh:
        return {c["name"]: c for c in yaml.safe_load(fh)["cases"]}


def _load_expected():
    with open(_EXPECTED, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _load_manifest(cls: str):
    with open(str(_MANIFEST).format(cls=cls), "r", encoding="utf-8") as fh:
        return json.load(fh)


CASES = _load_cases()
EXPECTED = _load_expected()


def _run(case):
    doc = parse_doc(case["doc"])
    manifest = _load_manifest(case["targetClass"])
    issues = validate_document(doc, manifest, case["targetClass"])
    res = verdict(issues)
    return {"ok": res.ok, "issues": sorted({i.path for i in res.issues})}


def test_case_set_matches_expected_keys():
    assert set(CASES.keys()) == set(EXPECTED.keys())


@pytest.mark.parametrize("name", sorted(EXPECTED.keys()))
def test_conformance(name):
    actual = _run(CASES[name])
    expected = {"ok": EXPECTED[name]["ok"], "issues": sorted(set(EXPECTED[name]["issues"]))}
    assert actual == expected
