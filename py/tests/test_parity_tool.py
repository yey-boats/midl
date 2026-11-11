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


# midl#16: an empty corpus must FAIL parity, not pass vacuously (0 == 0 == 0).
def test_empty_corpus_fails(tmp_path, monkeypatch):
    empty_cases = tmp_path / "cases.yaml"
    empty_cases.write_text("cases: []\n", encoding="utf-8")
    empty_expected = tmp_path / "expected.json"
    empty_expected.write_text("{}\n", encoding="utf-8")
    ts = tmp_path / "ts.json"
    ts.write_text("{}\n", encoding="utf-8")
    monkeypatch.setattr(parity, "CASES", empty_cases)
    monkeypatch.setattr(parity, "EXPECTED", empty_expected)
    assert parity.main(["--ts", str(ts)]) != 0


def test_empty_ts_verdicts_fail(tmp_path):
    ts = tmp_path / "ts.json"
    ts.write_text("{}\n", encoding="utf-8")
    assert parity.main(["--ts", str(ts)]) != 0


# midl#16: action-kind satisfaction must be exercised by the corpus (a mutated
# Python action-kind path once went undetected): flipping the Python action
# check must change at least one verdict.
def test_corpus_detects_action_kind_mutation(monkeypatch):
    from yey_boats_midl import satisfy

    baseline = parity.python_verdicts()
    original = satisfy._check_element

    def no_action_check(el, path, types, caps, sources, actions, issues):
        return original(el, path, types, caps, sources, set(), issues)

    monkeypatch.setattr(satisfy, "_check_element", no_action_check)
    assert parity.python_verdicts() != baseline
