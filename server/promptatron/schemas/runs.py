"""Pydantic response models for the run/evaluation history read API.

Also hosts the evaluation response models (``EvaluationDetail``) since the
read-only ``/evaluations`` endpoints live in ``promptatron/routers/runs.py``
alongside the run endpoints, and this is the one schemas module this work
item is allowed to create.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class Page[T](BaseModel):
    """A cursor-paginated page: {"items": [...], "next_cursor": str | None}."""

    items: list[T]
    next_cursor: str | None = None


class RunSummary(BaseModel):
    """Lightweight run listing row -- no large text blobs."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    ts: datetime
    model_id: str
    scenario_id: str | None = None
    dataset_id: str | None = None
    status: str
    metrics: dict[str, Any] | None = None


class RunDetail(BaseModel):
    """The full run record, including prompts, output, and evaluation artifacts."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    ts: datetime
    model_id: str
    scenario_id: str | None = None
    system_prompt: str
    user_prompt: str
    dataset_id: str | None = None
    dataset_hash: str | None = None
    config: dict[str, Any]
    output: str | None = None
    tool_transcript: Any | None = None
    metrics: dict[str, Any] | None = None
    guardrail_trace: Any | None = None
    status: str
    error: Any | None = None


class EvaluationDetail(BaseModel):
    """The full evaluation record (used for both list rows and detail fetches)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    ts: datetime
    kind: str
    status: str
    config: dict[str, Any]
    run_ids: list[str]
    result: Any | None = None
    progress: Any | None = None
    error: Any | None = None
    #: Which lane ran this evaluation. SQLite rows carry no such column, so a
    #: local row (including every row that predates the cloud lane) falls back
    #: to the default. See ``docs/cloud-evals.md``.
    execution: Literal["local", "cloud"] = "local"
