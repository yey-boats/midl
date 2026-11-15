# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Trend history validation — mirrors ts/test/history.test.ts."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from yey_boats_midl import satisfies, validate_config_structure, validate_semantics
from yey_boats_midl.history import parse_window_s

ROOT = Path(__file__).resolve().parents[2]


def _manifest(cls: str):
    return json.loads((ROOT / "schemas" / "gen" / f"yb-midl-capabilities.{cls}.json").read_text(encoding="utf-8"))


def _doc(**el):
    return {
        "midl": "1.0.0",
        "screens": [
            {
                "id": "s",
                "elements": {"t": {"bindings": {"value": {"kind": "signalk", "path": "a.b"}}, **el}},
                "layout": {"element": "t"},
            }
        ],
    }


@pytest.mark.parametrize("w,s", [("10m", 600), ("90s", 90), ("24h", 86400), (3600, 3600)])
def test_parse_window(w, s):
    assert parse_window_s(w) == s


@pytest.mark.parametrize("w", ["10", "10min", " 10m", "1.5h", "", -5, 0, None, True])
def test_parse_window_rejects(w):
    assert parse_window_s(w) is None


def test_schema():
    assert validate_config_structure(_doc(type="trend", history={"window": "10m", "agg": "last"})) == []
    assert validate_config_structure(_doc(type="trend", history={"window": 600})) == []
    assert validate_config_structure(_doc(type="trend", history={"window": "10 min"}))
    assert validate_config_structure(_doc(type="trend", history={"agg": "median"}))
    assert validate_config_structure(_doc(type="trend", history={"points": 50}))


def test_semantic():
    assert validate_semantics(_doc(type="trend", history={"window": "60s"})) == []
    assert [i.path for i in validate_semantics(_doc(type="trend", history={"window": "59s"}))] == [
        "/screens/0/elements/t/history/window"
    ]
    assert [i.path for i in validate_semantics(_doc(type="gauge", history={"window": "10m"}))] == [
        "/screens/0/elements/t/history"
    ]


def test_satisfy_max_window():
    m = _manifest("square-480")
    assert satisfies(_doc(type="trend", history={"window": "24h"}), m, "square-480") == []
    assert [i.path for i in satisfies(_doc(type="trend", history={"window": "25h"}), m, "square-480")] == [
        "/screens/0/elements/t/history/window"
    ]
    tight = {**m, "history": {**m["history"], "maxWindowS": 3600}}
    assert len(satisfies(_doc(type="trend", history={"window": "2h"}), tight, "square-480")) == 1
