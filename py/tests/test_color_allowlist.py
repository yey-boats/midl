# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Colour allowlist (parity with ts/test/color-allowlist.test.ts).

Colours must be #rgb, #rrggbb, #rrggbbaa or a named theme token; anything else
is a structural error, so markup can never reach an SVG attribute.
"""
from __future__ import annotations

import pytest

from yey_boats_midl import validate_config_structure

GOOD = ["#fff", "#FFF", "#36d399", "#36D399", "#36d39980", "accent", "warn", "good", "bad",
        "alarm", "danger", "port", "starboard", "fg", "dim", "tide"]
HOSTILE = [
    '#fff"/><img src=x onerror=alert(1)>',
    '#fff" onmouseover="alert(1)',
    "#fff;background:url(javascript:alert(1))",
    "#ff", "#fffff", "#fffffff", "#ggg", "#", " #fff", "#fff ", "#fff\n",
    "red", "Accent", "javascript:alert(1)", "url(#x)", "constructor", "__proto__", "",
]
SITES = {
    "style.color": lambda c: {"type": "single-value", "style": {"color": c}},
    "style.colorRole": lambda c: {"type": "single-value", "style": {"colorRole": c}},
    "style.zones[].color": lambda c: {"type": "gauge", "style": {"zones": [{"lt": 1, "color": c}]}},
    "style.sectors[].color": lambda c: {"type": "compass", "style": {"sectors": [{"from": 0, "to": 30, "color": c}]}},
    "markers[].color": lambda c: {"type": "compass", "markers": [{"glyph": "triangle", "color": c}]},
}


def _doc(el):
    return {"midl": "1.0.0", "screens": [{"id": "d", "elements": {"e": el}, "layout": {"element": "e"}}]}


@pytest.mark.parametrize("site", sorted(SITES))
@pytest.mark.parametrize("color", GOOD)
def test_good_colours_accepted(site, color):
    assert validate_config_structure(_doc(SITES[site](color))) == []


@pytest.mark.parametrize("site", sorted(SITES))
@pytest.mark.parametrize("color", HOSTILE)
def test_hostile_colours_rejected(site, color):
    assert len(validate_config_structure(_doc(SITES[site](color)))) > 0
