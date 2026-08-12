"""Small helpers shared by the ported scenario tool modules.

Not a public module -- only imported from within ``promptatron.tools``.
"""

from __future__ import annotations

import random
import string
import time
from datetime import UTC, datetime, timedelta


def generate_id(prefix: str) -> str:
    """Port of the JS handlers' ``HandlerUtils.generateId``.

    JS: ``${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}``
    """
    timestamp = int(time.time() * 1000)
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{prefix}_{timestamp}_{suffix}"


def iso_now() -> str:
    """Port of JS ``new Date().toISOString()`` (millisecond precision, ``Z`` suffix)."""
    return iso_offset(timedelta())


def iso_offset(delta: timedelta) -> str:
    """``iso_now()`` shifted by ``delta`` -- port of ``new Date(Date.now() + ms).toISOString()``."""
    moment = datetime.now(UTC) + delta
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"
