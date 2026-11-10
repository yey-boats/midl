# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""midl#15: conformance/parity.py must fail on ANY TS/Python verdict difference."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SPEC = importlib.util.spec_from_file_location("parity", _REPO_ROOT / "conformance" / "parity.py")
parity = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(parity)

_EXPECTED = json.loads((_REPO_ROOT / "conformance" / "expected.json").read_text(encoding="utf-8"))


def test_python_verdicts_cover_the_corpus():
    py = parity.python_verdicts()
    assert set(py) == set(_EXPECTED)


def test_identical_verdicts_have_no_diff():
    assert parity.compare(_EXPECTED, dict(_EXPECTED)) == []


def test_ok_flip_is_a_diff():
    name = next(iter(_EXPECTED))
    other = {**_EXPECTED, name: {**_EXPECTED[name], "ok": not _EXPECTED[name]["ok"]}}
    diffs = parity.compare(_EXPECTED, other)
    assert len(diffs) == 1 and name in diffs[0]


def test_path_order_is_a_diff():
    name = next(n for n, v in _EXPECTED.items() if len(v["paths"]) >= 2) if any(
        len(v["paths"]) >= 2 for v in _EXPECTED.values()) else next(iter(_EXPECTED))
    v = _EXPECTED[name]
    swapped = list(reversed(v["paths"])) if len(v["paths"]) >= 2 else v["paths"] + ["/extra"]
    diffs = parity.compare(_EXPECTED, {**_EXPECTED, name: {**v, "paths": swapped}})
    assert len(diffs) == 1 and name in diffs[0]


def test_missing_case_is_a_diff():
    name = next(iter(_EXPECTED))
    partial = {k: v for k, v in _EXPECTED.items() if k != name}
    assert any(name in d for d in parity.compare(_EXPECTED, partial))
    assert any(name in d for d in parity.compare(partial, _EXPECTED))
