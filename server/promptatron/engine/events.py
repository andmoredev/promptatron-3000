"""The engine's internal event union -- the one wire format for a run.

``execute_run`` yields these; the router either serializes them one-per-line as
NDJSON (``stream: true``) or drains them and answers with the persisted
``RunDetail`` (``stream: false``). Field names here *are* the public NDJSON
contract, so they are spelled out explicitly rather than derived.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

RunStatus = Literal["completed", "error", "cancelled"]


class _Event(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    def to_json_line(self) -> str:
        """One NDJSON line (aliases applied, trailing newline included)."""
        return self.model_dump_json(by_alias=True) + "\n"


class RunStartEvent(_Event):
    type: Literal["run_start"] = "run_start"
    run_id: str
    model_id: str
    ts: datetime

    @field_validator("ts")
    @classmethod
    def _as_utc(cls, value: datetime) -> datetime:
        """Stamp UTC on naive timestamps so ``ts`` is always a complete ISO8601 instant.

        The store writes ``datetime.now(UTC)`` but sqlite hands it back naive.
        """
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value


class TextDeltaEvent(_Event):
    type: Literal["text_delta"] = "text_delta"
    text: str


class ReasoningDeltaEvent(_Event):
    type: Literal["reasoning_delta"] = "reasoning_delta"
    text: str


class ToolUseStartEvent(_Event):
    type: Literal["tool_use_start"] = "tool_use_start"
    tool_use_id: str
    name: str


class ToolInputDeltaEvent(_Event):
    type: Literal["tool_input_delta"] = "tool_input_delta"
    tool_use_id: str
    # Named ``json`` on the wire; the attribute is ``json_text`` because a field
    # literally called ``json`` shadows ``BaseModel.json``.
    json_text: str = Field(alias="json")


class ToolResultEvent(_Event):
    type: Literal["tool_result"] = "tool_result"
    tool_use_id: str
    name: str
    input: dict[str, Any] = Field(default_factory=dict)
    output: Any = None
    duration_ms: int = 0
    error: dict[str, Any] | None = None


class MessageEvent(_Event):
    type: Literal["message"] = "message"
    role: str
    content: list[Any] = Field(default_factory=list)


class GuardrailTraceEvent(_Event):
    type: Literal["guardrail_trace"] = "guardrail_trace"
    assessment: dict[str, Any]


class MetricsEvent(_Event):
    type: Literal["metrics"] = "metrics"
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    cycle_count: int = 0


class ErrorEvent(_Event):
    type: Literal["error"] = "error"
    code: str
    message: str
    retryable: bool = False


class RunCompleteEvent(_Event):
    type: Literal["run_complete"] = "run_complete"
    run_id: str
    status: RunStatus
    final_text: str = ""


RunEvent = (
    RunStartEvent
    | TextDeltaEvent
    | ReasoningDeltaEvent
    | ToolUseStartEvent
    | ToolInputDeltaEvent
    | ToolResultEvent
    | MessageEvent
    | GuardrailTraceEvent
    | MetricsEvent
    | ErrorEvent
    | RunCompleteEvent
)
