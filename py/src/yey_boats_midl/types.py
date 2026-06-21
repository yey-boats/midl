# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Issue dataclass and version tuple — mirrors ts/src/types.ts.

An Issue carries a JSON-Pointer ``path``, a human ``message`` and an optional
``severity`` ("error" by default, "warning" for advisory problems). Only the
path SET and the overall ok verdict are contractual across languages; messages
and severities are advisory.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import NamedTuple, Optional


@dataclass
class Issue:
    path: str
    message: str
    severity: str = "error"


class MidlVersion(NamedTuple):
    major: int
    minor: int
    build: int
