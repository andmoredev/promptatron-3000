"""SQLModel table definitions for the run/evaluation history store.

Fields documented as "JSON" are stored as ``TEXT`` columns holding a JSON
string. They are opaque at this layer on purpose — :mod:`promptatron.store.history`
is where serialization/deserialization happens, so callers of the repository
functions work with plain Python dicts/lists instead.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlmodel import Field, SQLModel


def _uuid_hex() -> str:
    return uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Run(SQLModel, table=True):
    """A single model invocation: inputs, output, and evaluation artifacts."""

    id: str = Field(default_factory=_uuid_hex, primary_key=True)
    ts: datetime = Field(default_factory=_utcnow, index=True)
    model_id: str = Field(index=True)
    scenario_id: str | None = Field(default=None, index=True)
    system_prompt: str
    user_prompt: str
    dataset_id: str | None = None
    dataset_hash: str | None = None
    config: str  # JSON: inference params, tools_enabled, guardrail config
    output: str | None = None
    tool_transcript: str | None = None  # JSON
    metrics: str | None = None  # JSON
    guardrail_trace: str | None = None  # JSON
    status: str = Field(default="running", index=True)  # running|completed|error|cancelled
    error: str | None = None  # JSON


class Evaluation(SQLModel, table=True):
    """A determinism or grading evaluation performed over one or more runs."""

    id: str = Field(default_factory=_uuid_hex, primary_key=True)
    ts: datetime = Field(default_factory=_utcnow, index=True)
    kind: str = Field(index=True)  # determinism|grade
    status: str = Field(default="pending", index=True)  # pending|running|completed|error|cancelled
    config: str  # JSON
    run_ids: str  # JSON list[str]
    result: str | None = None  # JSON
    progress: str | None = None  # JSON
    error: str | None = None  # JSON
