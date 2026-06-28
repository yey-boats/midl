# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Limits arithmetic (style.range / style.zones) — parity with ts/src/semantic.ts."""
from __future__ import annotations

from yey_boats_midl import semantic_errors, validate_semantics


def _gauge_doc(style):
    return {
        "midl": "1.0.0",
        "screens": [{
            "id": "d",
            "elements": {"g": {"type": "gauge", "style": style,
                               "bindings": {"value": {"kind": "signalk", "path": "x"}}}},
            "layout": {"element": "g"},
        }],
    }


def test_inverted_range_is_error():
    errs = semantic_errors(_gauge_doc({"range": [100, 0]}))
    assert any("range [100, 0] is invalid" in i.message for i in errs)
    assert any(i.path == "/screens/0/elements/g/style/range" for i in errs)


def test_zero_width_range_is_error():
    assert len(semantic_errors(_gauge_doc({"range": [5, 5]}))) > 0


def test_valid_range_no_error():
    assert semantic_errors(_gauge_doc({"range": [0, 100]})) == []


def test_zone_below_floor_is_warning_not_error():
    doc = _gauge_doc({"range": [0, 100], "zones": [{"lt": -5, "color": "warn"}]})
    assert semantic_errors(doc) == []
    alli = validate_semantics(doc)
    assert any(i.severity == "warning" and "at or below the range floor 0" in i.message for i in alli)


def test_top_bucket_sentinel_no_issue():
    # lt:101 for a 0..100 range is the idiomatic 'everything up to the top' band.
    doc = _gauge_doc({"range": [0, 100], "zones": [
        {"lt": 20, "color": "bad"}, {"lt": 50, "color": "warn"}, {"lt": 101, "color": "good"}]})
    assert validate_semantics(doc) == []
