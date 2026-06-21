# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Capability satisfaction against a target class — mirrors ts/src/satisfy.ts."""
from __future__ import annotations

from typing import Any, Dict, List, Set

from .presets import count_tiles, depth, expand
from .types import Issue


def _resolve_layout(screen: Dict[str, Any], class_name: str) -> Any:
    for v in screen.get("variants") or []:
        if v.get("class") == class_name:
            return v["layout"]
    return screen.get("layout")


def _element_ids(n: Any, out: List[str]) -> None:
    if "element" in n:
        out.append(n["element"])
    elif "children" in n:
        for c in n["children"]:
            _element_ids(c, out)
    elif "cells" in n:
        for c in n["cells"]:
            _element_ids(c, out)


def _check_element(
    el: Dict[str, Any],
    path: str,
    allowed_types: Set[str],
    cap_by_type: Dict[str, Dict[str, Any]],
    allowed_sources: Set[str],
    allowed_actions: Set[str],
    issues: List[Issue],
) -> None:
    if el["type"] not in allowed_types:
        issues.append(Issue(f"{path}/type", f"element type not supported: {el['type']}"))
        return
    cap = cap_by_type.get(el["type"])
    bindings = el.get("bindings")
    if bindings:
        for fieldname, src in bindings.items():
            if cap and cap.get("bindings") is not None and fieldname not in cap["bindings"]:
                issues.append(
                    Issue(f"{path}/bindings/{fieldname}", f"binding field not supported by {el['type']}: {fieldname}")
                )
            if src.get("kind") not in allowed_sources:
                issues.append(
                    Issue(f"{path}/bindings/{fieldname}", f"source kind not supported: {src.get('kind')}")
                )
    action = el.get("action")
    if action and len(allowed_actions) > 0 and action.get("kind") not in allowed_actions:
        issues.append(Issue(f"{path}/action", f"action kind not supported: {action.get('kind')}"))


def satisfies(config: Dict[str, Any], manifest: Dict[str, Any], class_name: str) -> List[Issue]:
    issues: List[Issue] = []
    cls = next((c for c in manifest.get("classes", []) if c.get("id") == class_name), None)
    if cls is None:
        return [Issue("/", f"class not supported: {class_name}")]

    allowed_types: Set[str] = set(cls.get("elements") or [e["type"] for e in manifest["elements"]])
    cap_by_type: Dict[str, Dict[str, Any]] = {e["type"]: e for e in manifest["elements"]}
    allowed_sources: Set[str] = set(manifest.get("sources") or ["signalk"])
    allowed_actions: Set[str] = set(manifest.get("actionKinds") or [])

    for si, screen in enumerate(config["screens"]):
        try:
            tree = expand(_resolve_layout(screen, class_name))
        except Exception as e:  # noqa: BLE001 — mirror TS catch
            issues.append(Issue(f"/screens/{si}/layout", str(e)))
            continue

        tiles = count_tiles(tree)
        if tiles > cls["maxTiles"]:
            issues.append(Issue(f"/screens/{si}/layout", f"too many tiles: {tiles} > {cls['maxTiles']}"))
        d = depth(tree)
        if d > cls["maxDepth"]:
            issues.append(Issue(f"/screens/{si}/layout", f"nesting too deep: {d} > {cls['maxDepth']}"))

        ids: List[str] = []
        _element_ids(tree, ids)
        for el_id in ids:
            el = (screen.get("elements") or {}).get(el_id)
            if not el:
                issues.append(Issue(f"/screens/{si}", f"layout references unknown element: {el_id}"))
                continue
            _check_element(el, f"/screens/{si}/elements/{el_id}", allowed_types, cap_by_type, allowed_sources, allowed_actions, issues)

    return issues
