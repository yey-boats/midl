# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
"""Version parse + compatibility — mirrors ts/src/version.ts."""
from __future__ import annotations

import re

from .types import MidlVersion

_VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def parse_version(s: str) -> MidlVersion:
    m = _VERSION_RE.match(s) if isinstance(s, str) else None
    if not m:
        raise ValueError(f"bad MIDL version: {s}")
    return MidlVersion(int(m.group(1)), int(m.group(2)), int(m.group(3)))


def compatible(config: MidlVersion, device: MidlVersion) -> bool:
    """Admissible iff majors match and config.minor <= device.minor.

    Forward compat: an old config on a newer build is allowed; a newer config
    on an older build is not.
    """
    return config.major == device.major and config.minor <= device.minor
