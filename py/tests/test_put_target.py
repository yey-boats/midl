# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""midl#22: `put` action targets must be SignalK paths — parity with ts/src/semantic.ts.

Mirrors instruments include/midl_kinds.h put_target_ok: 2+ segments of
[A-Za-z0-9_-] separated by single dots, at most 95 chars (ACTION_TARGET_MAX).
"""
from __future__ import annotations

import pytest

from yey_boats_midl import semantic_errors

_TARGET = "/screens/0/elements/b/action/target"


def _doc(kind, target):
    action = {"kind": kind, "target": target}
    if kind == "put":
        action["value"] = 1
    return {
        "midl": "1.0.0",
        "screens": [{"id": "d", "elements": {"b": {"type": "button", "action": action}}, "layout": {"element": "b"}}],
    }


def _target_errs(target):
    return [i for i in semantic_errors(_doc("put", target)) if i.path == _TARGET]


@pytest.mark.parametrize("target", [
    "steering.autopilot.state",
    "electrical.switches.anchorLight.state",
    "a.b",
    "propulsion.port-engine.state",
    "tanks.fuel_0.currentLevel",
    "a." + "b" * 93,  # exactly 95 chars
])
def test_accepts_signalk_paths(target):
    assert _target_errs(target) == []


@pytest.mark.parametrize("target", [
    "autopilot", ".a.b", "a.b.", "a..b", "../../x.y", "a/b.c", "a.b c", "a.b%2F", "", "a." + "b" * 94,
])
def test_rejects_non_paths(target):
    assert len(_target_errs(target)) == 1


@pytest.mark.parametrize("kind", ["nav", "command"])
def test_other_kinds_not_held_to_path_rule(kind):
    assert semantic_errors(_doc(kind, "tack port")) == []
