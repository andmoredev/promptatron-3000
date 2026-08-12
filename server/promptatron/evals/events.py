"""The evaluation progress event union -- the wire format of
``GET /api/v1/evaluations/{id}/events``.

Same shape and spirit as :mod:`promptatron.engine.events`: field names *are* the
public NDJSON contract, and every event serializes to exactly one line. Unlike
the run stream these events are also **retained** in the job's event log, so a
subscriber that connects late (or after the job has finished) replays the exact
same lines a live subscriber saw.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

EvalStatus = Literal["completed", "error", "cancelled"]


class _Event(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    def as_log_entry(self) -> dict[str, Any]:
        """The plain-dict form appended to a job's event log."""
        return self.model_dump(by_alias=True)


class EvalStartEvent(_Event):
    type: Literal["eval_start"] = "eval_start"
    evaluation_id: str
    kind: str
    n: int


class RunStartedEvent(_Event):
    type: Literal["run_started"] = "run_started"
    index: int


class RunSummary(BaseModel):
    output_chars: int = 0
    tool_calls: int = 0
    duration_ms: int = 0


class RunCompletedEvent(_Event):
    type: Literal["run_completed"] = "run_completed"
    index: int
    run_id: str
    status: str
    summary: RunSummary = Field(default_factory=RunSummary)


class RunFailedEvent(_Event):
    type: Literal["run_failed"] = "run_failed"
    index: int
    error: Any = None


class GradingStartedEvent(_Event):
    type: Literal["grading_started"] = "grading_started"


class GradingCompletedEvent(_Event):
    type: Literal["grading_completed"] = "grading_completed"
    result: dict[str, Any]


class EvalCompleteEvent(_Event):
    type: Literal["eval_complete"] = "eval_complete"
    status: EvalStatus
    result: dict[str, Any] | None = None


EvalEvent = (
    EvalStartEvent
    | RunStartedEvent
    | RunCompletedEvent
    | RunFailedEvent
    | GradingStartedEvent
    | GradingCompletedEvent
    | EvalCompleteEvent
)
