# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Semantic (meaning) validation — mirrors ts/src/semantic.ts.

Internal coherence, independent of any device: layout references resolve, ids
are unique, layout weights/grids are arithmetically consistent, presets are
known, sources carry the field their kind requires, and known element types
declare the bindings they need. Errors halt the pipeline; warnings do not.
"""
from __future__ import annotations

from typing import Any, Dict, List

from .presets import PRESETS
from .types import Issue

# Known element types and the bindings they require. `button` binds nothing;
# compass/windrose require value + dir. Types absent here are allowed but warned.
ELEMENT_REQUIRED_BINDINGS: Dict[str, List[str]] = {
    "single-value": ["value"],
    "text": ["value"],
    "gauge": ["value"],
    "bar": ["value"],
    "trend": ["value"],
    "autopilot": ["value"],
    "compass": ["value", "dir"],
    "windrose": ["value", "dir"],
    "button": [],
}


def _err(path: str, message: str) -> Issue:
    return Issue(path, message, "error")


def _warn(path: str, message: str) -> Issue:
    return Issue(path, message, "warning")


def _check_node(n: Any, path: str, refs: List[Dict[str, str]], issues: List[Issue]) -> None:
    if not isinstance(n, dict):
        issues.append(_err(path, "layout node must be an object"))
        return

    if "element" in n:
        refs.append({"id": n["element"], "path": path})
        return

    if "preset" in n:
        if n["preset"] not in PRESETS:
            known = ", ".join(PRESETS.keys())
            issues.append(
                _err(f"{path}/preset", f'preset "{n["preset"]}" is not a known preset; expected one of: {known}')
            )
        for i, sid in enumerate(n.get("slots") or []):
            refs.append({"id": sid, "path": f"{path}/slots/{i}"})
        return

    if "children" in n:
        weights = n.get("weights")
        children = n["children"]
        if weights is not None and len(weights) != len(children):
            issues.append(
                _err(
                    f"{path}/weights",
                    f"weights length must match children length ({len(weights)} weights vs {len(children)} children); "
                    "give one weight per child or omit weights",
                )
            )
        for i, c in enumerate(children):
            _check_node(c, f"{path}/children/{i}", refs, issues)
        return

    if "cells" in n:
        rows, cols = n["rows"], n["cols"]
        total = rows * cols
        cells = n["cells"]
        # When any cell carries colSpan/rowSpan, fewer cells can fill the full
        # grid. Check for span fields to decide which validation path to take.
        has_spans = any(
            isinstance(c, dict) and (
                (c.get("colSpan") is not None and c.get("colSpan") != 1)
                or (c.get("rowSpan") is not None and c.get("rowSpan") != 1)
            )
            for c in cells
        )
        if has_spans:
            # With spans: cells must not overflow the grid.
            occupied = [False] * total
            slot = 0
            overflow = False
            for c in cells:
                while slot < total and occupied[slot]:
                    slot += 1
                if slot >= total:
                    overflow = True
                    break
                r, col = divmod(slot, cols)
                cs = min(c.get("colSpan", 1) if isinstance(c, dict) else 1, cols - col)
                rs = min(c.get("rowSpan", 1) if isinstance(c, dict) else 1, rows - r)
                for dr in range(rs):
                    for dc in range(cs):
                        occupied[(r + dr) * cols + (col + dc)] = True
            if overflow:
                issues.append(
                    _err(
                        f"{path}/cells",
                        f"grid has more cells than can fit in {rows} * {cols} = {total} slots after accounting for spans",
                    )
                )
        else:
            # No spans: classic row-major check — cells.length must equal rows*cols.
            if len(cells) != total:
                issues.append(
                    _err(
                        f"{path}/cells",
                        f"grid cells length must equal rows * cols ({rows} * {cols} = {total}); got {len(cells)} cells",
                    )
                )
        for i, c in enumerate(cells):
            _check_node(c, f"{path}/cells/{i}", refs, issues)
        return

    # Spacer cell: an empty object (or one with only colSpan/rowSpan) is a valid
    # unassigned grid slot. It carries no element reference, emits no issues.
    if all(k in ("colSpan", "rowSpan") for k in n.keys()):
        return  # valid spacer

    issues.append(
        _err(path, "layout node is not a recognized kind (element, flow/children, rows/cols/cells, or preset)")
    )


def _check_refs(refs: List[Dict[str, str]], elements: Dict[str, Any], issues: List[Issue]) -> None:
    for ref in refs:
        if ref["id"] not in elements:
            issues.append(
                _err(f'{ref["path"]}/element', f'layout.element "{ref["id"]}" does not exist in screen.elements')
            )


def _non_empty(v: Any) -> bool:
    return isinstance(v, str) and len(v.strip()) > 0


def _check_source(src: Any, path: str, issues: List[Issue]) -> None:
    if not isinstance(src, dict):
        return
    kind = src.get("kind")
    if kind == "signalk":
        if not _non_empty(src.get("path")):
            issues.append(_err(f"{path}/path", 'source.kind "signalk" requires a non-empty path'))
    elif kind == "local":
        if not _non_empty(src.get("id")):
            issues.append(_err(f"{path}/id", 'source.kind "local" requires a non-empty id'))
    elif kind == "computed":
        if not _non_empty(src.get("expr")):
            issues.append(_err(f"{path}/expr", 'source.kind "computed" requires a non-empty expr'))
    elif kind == "const":
        if "value" not in src:
            issues.append(_err(f"{path}/value", 'source.kind "const" requires a value'))


def _check_element(el_id: str, el: Any, path: str, issues: List[Issue]) -> None:
    required = ELEMENT_REQUIRED_BINDINGS.get(el.get("type"))
    bindings = el.get("bindings") or {}

    if required is None:
        issues.append(
            _warn(
                f"{path}/type",
                f'element "{el_id}" has unregistered type "{el.get("type")}"; required bindings cannot be checked',
            )
        )
    else:
        for fieldname in required:
            if fieldname not in bindings:
                issues.append(
                    _err(
                        f"{path}/bindings/{fieldname}",
                        f'element "{el_id}" of type "{el.get("type")}" requires a "{fieldname}" binding',
                    )
                )

    for fieldname, src in bindings.items():
        _check_source(src, f"{path}/bindings/{fieldname}", issues)

    _check_limits(el_id, el, path, issues)


def _check_limits(el_id: str, el: Any, path: str, issues: List[Issue]) -> None:
    """Validate style.range / style.zones arithmetic — mirrors ts/src/semantic.ts.

    range must be [lo, hi] with hi > lo (a hard error). A zone threshold at or
    below the range floor can never apply (an advisory warning); a threshold
    at/above hi is the idiomatic top-bucket sentinel and is NOT flagged.
    """
    style = el.get("style") or {}
    if not isinstance(style, dict):
        return

    rng = style.get("range")
    lo = hi = None
    if (
        isinstance(rng, list)
        and len(rng) == 2
        and isinstance(rng[0], (int, float))
        and isinstance(rng[1], (int, float))
    ):
        lo, hi = rng[0], rng[1]
        if hi <= lo:
            issues.append(
                _err(
                    f"{path}/style/range",
                    f'element "{el_id}" range [{lo}, {hi}] is invalid: max must be greater than min',
                )
            )

    zones = style.get("zones")
    if isinstance(zones, list) and lo is not None and hi is not None and hi > lo:
        for i, z in enumerate(zones):
            lt = z.get("lt") if isinstance(z, dict) else None
            if isinstance(lt, (int, float)) and lt <= lo:
                issues.append(
                    _warn(
                        f"{path}/style/zones/{i}/lt",
                        f'element "{el_id}" zone threshold {lt} is at or below the range floor {lo}; it will never apply',
                    )
                )


def _check_layout(layout: Any, layout_path: str, screen: Dict[str, Any], issues: List[Issue]) -> None:
    refs: List[Dict[str, str]] = []
    _check_node(layout, layout_path, refs, issues)
    _check_refs(refs, screen.get("elements") or {}, issues)


def validate_semantics(doc: Any) -> List[Issue]:
    issues: List[Issue] = []
    if not isinstance(doc, dict) or not isinstance(doc.get("screens"), list):
        return issues

    seen_screen: Dict[str, int] = {}
    for si, screen in enumerate(doc["screens"]):
        if not isinstance(screen, dict):
            continue
        sid = screen.get("id")
        if isinstance(sid, str):
            prev = seen_screen.get(sid)
            if prev is not None:
                issues.append(
                    _err(f"/screens/{si}/id", f'duplicate screen.id "{sid}" (already used by screens/{prev})')
                )
            else:
                seen_screen[sid] = si

        elements = screen.get("elements") or {}
        for el_id, el in elements.items():
            _check_element(el_id, el, f"/screens/{si}/elements/{el_id}", issues)

        if screen.get("layout") is not None:
            _check_layout(screen["layout"], f"/screens/{si}/layout", screen, issues)

        for vi, v in enumerate(screen.get("variants") or []):
            vpath = f"/screens/{si}/variants/{vi}"
            vclass = v.get("class")
            if not isinstance(vclass, str) or len(vclass.strip()) == 0:
                issues.append(_err(f"{vpath}/class", "variant must declare a non-empty class"))
            if v.get("layout") is None:
                issues.append(_err(f"{vpath}/layout", "variant must declare a layout"))
            else:
                _check_layout(v["layout"], f"{vpath}/layout", screen, issues)

    seen_alarm: Dict[str, int] = {}
    for ai, al in enumerate(doc.get("alarms") or []):
        if isinstance(al, dict) and isinstance(al.get("id"), str):
            prev = seen_alarm.get(al["id"])
            if prev is not None:
                issues.append(
                    _err(f"/alarms/{ai}/id", f'duplicate alarm.id "{al["id"]}" (already used by alarms/{prev})')
                )
            else:
                seen_alarm[al["id"]] = ai

    return issues


def semantic_errors(doc: Any) -> List[Issue]:
    return [i for i in validate_semantics(doc) if i.severity != "warning"]
