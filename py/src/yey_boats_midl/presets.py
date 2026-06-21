# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Layout presets: expand / countTiles / depth — mirrors ts/src/presets.ts."""
from __future__ import annotations

from typing import Any, Callable, Dict, List

Node = Dict[str, Any]


def _req(slots: List[str], n: int) -> List[str]:
    if len(slots) != n:
        raise ValueError(f"preset expects {n} slots, got {len(slots)}")
    return slots


def _full(s: List[str]) -> Node:
    return {"element": _req(s, 1)[0]}


def _hero_split(s: List[str]) -> Node:
    a, b, c = _req(s, 3)
    return {
        "flow": "row",
        "children": [
            {"element": a},
            {"flow": "col", "children": [{"element": b}, {"element": c}]},
        ],
    }


PRESETS: Dict[str, Callable[[List[str]], Node]] = {
    "full": _full,
    "hero-split": _hero_split,
}


def expand(n: Node) -> Node:
    if "preset" in n:
        fn = PRESETS.get(n["preset"])
        if fn is None:
            raise ValueError(f"unknown preset: {n['preset']}")
        return expand(fn(n.get("slots") or []))
    if "children" in n:
        return {**n, "children": [expand(c) for c in n["children"]]}
    if "cells" in n:
        return {**n, "cells": [expand(c) for c in n["cells"]]}
    return n


def count_tiles(n: Node) -> int:
    if "element" in n:
        return 1
    if "children" in n:
        return sum(count_tiles(c) for c in n["children"])
    if "cells" in n:
        return sum(count_tiles(c) for c in n["cells"])
    return 0  # a preset node (should not appear after expand)


def depth(n: Node) -> int:
    if "element" in n:
        return 1
    kids = n["children"] if "children" in n else n["cells"] if "cells" in n else []
    return 1 + max((depth(k) for k in kids), default=0) if kids else 1
