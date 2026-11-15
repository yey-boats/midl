# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Trend history window parsing — mirrors ts/src/history.ts.

See docs/specs/2026-11-15-trend-history.md.
"""
from __future__ import annotations

import math
import re
from typing import Any, Optional

HISTORY_AGGS = ("avg", "min", "max", "last")
HISTORY_MIN_WINDOW_S = 60
HISTORY_DEFAULT_MAX_WINDOW_S = 86400

_WINDOW_RE = re.compile(r"^(\d+)([smh])$")
_UNIT_S = {"s": 1, "m": 60, "h": 3600}


def parse_window_s(w: Any) -> Optional[float]:
    """A history window ("10m", "1h", "90s" or a number of seconds) in seconds,
    or None when it is not a duration."""
    if isinstance(w, bool):
        return None
    if isinstance(w, (int, float)):
        return w if math.isfinite(w) and w > 0 else None
    if not isinstance(w, str):
        return None
    m = _WINDOW_RE.fullmatch(w)
    if not m:
        return None
    n = int(m.group(1)) * _UNIT_S[m.group(2)]
    return n if n > 0 else None
