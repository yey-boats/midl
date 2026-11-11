# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""midl#25: library x device-class conformance (Python validator).

Every standard library layout must validate on every device class the repo
generates a manifest for — parity with ts/test/library.test.ts.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from yey_boats_midl import parse_doc, validate_document, verdict

_ROOT = Path(__file__).resolve().parents[2]
_LIB = _ROOT / "library"
_GEN = _ROOT / "schemas" / "gen"

LAYOUTS = sorted(p.name for p in _LIB.glob("*.midl.yaml"))
CLASSES = sorted(
    m.group(1) for p in _GEN.glob("*.json") if (m := re.fullmatch(r"yb-midl-capabilities\.(.+)\.json", p.name))
)


def test_all_classes_checked():
    assert CLASSES == ["landscape-1024x600", "landscape-800x480", "round-360", "square-480"]
    assert len(LAYOUTS) >= 6


@pytest.mark.parametrize("cls", CLASSES)
@pytest.mark.parametrize("layout", LAYOUTS)
def test_library_layout_validates_on_class(layout, cls):
    manifest = json.loads((_GEN / f"yb-midl-capabilities.{cls}.json").read_text(encoding="utf-8"))
    res = verdict(validate_document(parse_doc((_LIB / layout).read_text(encoding="utf-8")), manifest, cls))
    assert [(i.path, i.message) for i in res.issues if i.severity != "warning"] == []
    assert res.ok
