"""The one record the execution half hands to the grading half."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RunOutcome:
    """One executed (or one previously stored) run, as the grader sees it.

    ``index`` is the run's position in the batch -- it is what the ``run_started``
    / ``run_completed`` / ``run_failed`` events and ``failed_runs`` entries refer
    to, and it survives retries (a throttled run keeps its index across attempts).
    """

    index: int
    run_id: str | None = None
    status: str = "error"
    output: str = ""
    user_prompt: str = ""
    tool_transcript: list[Any] = field(default_factory=list)
    duration_ms: int = 0
    attempts: int = 1
    error: dict[str, Any] | None = None

    @property
    def succeeded(self) -> bool:
        return self.status == "completed" and self.run_id is not None

    def summary(self) -> dict[str, int]:
        """The ``summary`` block of a ``run_completed`` event."""
        return {
            "output_chars": len(self.output),
            "tool_calls": len(self.tool_transcript),
            "duration_ms": self.duration_ms,
        }
