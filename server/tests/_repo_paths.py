"""Shared helper for locating monorepo-root-relative paths from test files.

A plain ``Path(__file__).resolve().parents[N]`` climb assumes a fixed nesting
depth between the test file and the repo root. That assumption breaks under
mutation testing (``mutmut`` copies ``tests/`` one level deeper, into
``server/mutants/tests/``) and would break equally under any other tool that
relocates or nests the test tree. Searching upward for a directory that
actually contains the marker we need is robust to both.
"""

from __future__ import annotations

from pathlib import Path


def find_upward(*relative_parts: str) -> Path:
    """The first ancestor of this file for which ``ancestor/relative_parts``
    exists, joined with ``relative_parts``.

    Raises ``FileNotFoundError`` if no ancestor has it -- the same failure
    mode a bad fixed-depth ``parents[N]`` guess would eventually hit, just
    with a message that says what was actually being looked for.
    """
    target_suffix = Path(*relative_parts)
    for candidate in Path(__file__).resolve().parents:
        target = candidate / target_suffix
        if target.exists():
            return target
    raise FileNotFoundError(
        f"could not locate {target_suffix} in any ancestor of {__file__}"
    )
