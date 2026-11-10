#!/usr/bin/env python3
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""TS <-> Python validator parity check over conformance/cases.yaml (midl#15).

Runs the Python validator on every case and compares its verdicts with the
TypeScript validator's (produced live by `node conformance/gen-expected.mjs
--out <file>`), and both with the frozen conformance/expected.json. Any
difference in `ok` or in the ORDERED DISTINCT issue-path list fails.

  npm run build -w @yey-boats/midl
  node conformance/gen-expected.mjs --out /tmp/ts.json
  python3 conformance/parity.py --ts /tmp/ts.json

Requires the Python package installed (`pip install -e py`).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CASES = HERE / "cases.yaml"
EXPECTED = HERE / "expected.json"


def _manifest(cls: str):
    p = ROOT / "schemas" / "gen" / f"yb-midl-capabilities.{cls}.json"
    return json.loads(p.read_text(encoding="utf-8"))


def _ordered_distinct(xs):
    return list(dict.fromkeys(xs))


def python_verdicts():
    """{case name: {ok, paths}} from the Python validator, same shape as expected.json."""
    from yey_boats_midl import parse_doc, validate_document, verdict

    cases = yaml.safe_load(CASES.read_text(encoding="utf-8"))["cases"]
    out = {}
    for c in cases:
        issues = validate_document(parse_doc(c["doc"]), _manifest(c["targetClass"]), c["targetClass"])
        res = verdict(issues)
        out[c["name"]] = {"ok": res.ok, "paths": _ordered_distinct([i.path for i in res.issues])}
    return out


def _norm(v):
    return {"ok": bool(v["ok"]), "paths": list(v["paths"])}


def compare(a, b, a_name="ts", b_name="py"):
    """Human-readable differences between two verdict maps ([] == identical)."""
    diffs = []
    for name in sorted(set(a) | set(b)):
        if name not in a:
            diffs.append(f"{name}: missing from {a_name}")
        elif name not in b:
            diffs.append(f"{name}: missing from {b_name}")
        elif _norm(a[name]) != _norm(b[name]):
            diffs.append(f"{name}: {a_name}={json.dumps(_norm(a[name]))} {b_name}={json.dumps(_norm(b[name]))}")
    return diffs


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ts", required=True, type=Path, help="TS verdicts JSON (gen-expected.mjs --out)")
    args = ap.parse_args(argv)

    ts = json.loads(args.ts.read_text(encoding="utf-8"))
    py = python_verdicts()
    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))

    failures = []
    for label, a, b, an, bn in (
        ("TS vs Python", ts, py, "ts", "py"),
        ("TS vs expected.json", ts, expected, "ts", "expected"),
        ("Python vs expected.json", py, expected, "py", "expected"),
    ):
        d = compare(a, b, an, bn)
        if d:
            failures.append(label)
            print(f"::error::{label}: {len(d)} case(s) differ")
            for line in d:
                print(f"  {line}")
    if failures:
        return 1
    print(f"parity ok: TS == Python == expected.json over {len(py)} conformance cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
