"""Repository functions over the run/evaluation history store.

JSON-bearing columns (``config``, ``tool_transcript``, ``metrics``,
``guardrail_trace``, ``error``, ``run_ids``, ``result``, ``progress``) are
serialized to/from JSON text *inside* this module. Every function here takes
and returns plain Python values (dicts/lists/None) for those fields via the
``RunRecord`` / ``EvaluationRecord`` dataclasses — callers never see JSON
strings.

Cursor pagination
------------------
``list_runs`` / ``list_evaluations`` use keyset pagination ordered newest
first (``ts`` desc, ``id`` desc as a tiebreaker). A cursor is the base64url
encoding of ``"<ts.isoformat()>|<id>"`` for the last row of the previous
page; the next page selects rows strictly after that (ts, id) pair in sort
order. ``next_cursor`` is ``None`` once there are no more rows.
"""

from __future__ import annotations

import base64
import json
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import and_, or_
from sqlmodel import Session, select

from promptatron.errors import BadRequestError, NotFoundError
from promptatron.store.models import Evaluation, Run

# Sentinel distinguishing "field not provided" from "field explicitly set to None"
# in the partial-update functions.
_UNSET: Any = object()


@dataclass
class RunRecord:
    """A run, with JSON columns already parsed into Python values."""

    id: str
    ts: datetime
    model_id: str
    scenario_id: str | None
    system_prompt: str
    user_prompt: str
    dataset_id: str | None
    dataset_hash: str | None
    config: dict[str, Any]
    output: str | None
    tool_transcript: Any | None
    metrics: dict[str, Any] | None
    guardrail_trace: Any | None
    status: str
    error: Any | None


@dataclass
class EvaluationRecord:
    """An evaluation, with JSON columns already parsed into Python values."""

    id: str
    ts: datetime
    kind: str
    status: str
    config: dict[str, Any]
    run_ids: list[str]
    result: Any | None
    progress: Any | None
    error: Any | None


# --------------------------------------------------------------------------- #
# JSON (de)serialization + cursor helpers
# --------------------------------------------------------------------------- #


def _dump(value: Any) -> str | None:
    return None if value is None else json.dumps(value)


def _load(value: str | None) -> Any:
    return None if value is None else json.loads(value)


def _encode_cursor(ts: datetime, id_: str) -> str:
    raw = f"{ts.isoformat()}|{id_}".encode()
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        ts_str, id_ = raw.split("|", 1)
        return datetime.fromisoformat(ts_str), id_
    except Exception as exc:
        raise BadRequestError("Invalid pagination cursor", detail={"cursor": cursor}) from exc


def _clamp_limit(limit: int) -> int:
    return max(1, min(limit, 100))


def _run_to_record(run: Run) -> RunRecord:
    return RunRecord(
        id=run.id,
        ts=run.ts,
        model_id=run.model_id,
        scenario_id=run.scenario_id,
        system_prompt=run.system_prompt,
        user_prompt=run.user_prompt,
        dataset_id=run.dataset_id,
        dataset_hash=run.dataset_hash,
        config=_load(run.config) or {},
        output=run.output,
        tool_transcript=_load(run.tool_transcript),
        metrics=_load(run.metrics),
        guardrail_trace=_load(run.guardrail_trace),
        status=run.status,
        error=_load(run.error),
    )


def _evaluation_to_record(evaluation: Evaluation) -> EvaluationRecord:
    return EvaluationRecord(
        id=evaluation.id,
        ts=evaluation.ts,
        kind=evaluation.kind,
        status=evaluation.status,
        config=_load(evaluation.config) or {},
        run_ids=_load(evaluation.run_ids) or [],
        result=_load(evaluation.result),
        progress=_load(evaluation.progress),
        error=_load(evaluation.error),
    )


# --------------------------------------------------------------------------- #
# Runs
# --------------------------------------------------------------------------- #


def create_run(
    session: Session,
    *,
    model_id: str,
    system_prompt: str,
    user_prompt: str,
    scenario_id: str | None = None,
    dataset_id: str | None = None,
    dataset_hash: str | None = None,
    config: dict[str, Any] | None = None,
    output: str | None = None,
    tool_transcript: Any | None = None,
    metrics: dict[str, Any] | None = None,
    guardrail_trace: Any | None = None,
    status: str = "running",
    error: Any | None = None,
    id: str | None = None,
    ts: datetime | None = None,
) -> RunRecord:
    """Insert a new run and return it. ``id``/``ts`` are auto-generated if omitted."""
    run = Run(
        model_id=model_id,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        scenario_id=scenario_id,
        dataset_id=dataset_id,
        dataset_hash=dataset_hash,
        config=json.dumps(config or {}),
        output=output,
        tool_transcript=_dump(tool_transcript),
        metrics=_dump(metrics),
        guardrail_trace=_dump(guardrail_trace),
        status=status,
        error=_dump(error),
    )
    if id is not None:
        run.id = id
    if ts is not None:
        run.ts = ts
    session.add(run)
    session.commit()
    session.refresh(run)
    return _run_to_record(run)


def update_run(
    session: Session,
    run_id: str,
    *,
    model_id: str = _UNSET,
    scenario_id: str | None = _UNSET,
    system_prompt: str = _UNSET,
    user_prompt: str = _UNSET,
    dataset_id: str | None = _UNSET,
    dataset_hash: str | None = _UNSET,
    config: dict[str, Any] = _UNSET,
    output: str | None = _UNSET,
    tool_transcript: Any = _UNSET,
    metrics: dict[str, Any] | None = _UNSET,
    guardrail_trace: Any = _UNSET,
    status: str = _UNSET,
    error: Any = _UNSET,
) -> RunRecord:
    """Partially update a run. Only keyword args actually passed are changed.

    Raises ``NotFoundError`` if ``run_id`` doesn't exist.
    """
    run = session.get(Run, run_id)
    if run is None:
        raise NotFoundError(f"Run {run_id!r} not found")

    if model_id is not _UNSET:
        run.model_id = model_id
    if scenario_id is not _UNSET:
        run.scenario_id = scenario_id
    if system_prompt is not _UNSET:
        run.system_prompt = system_prompt
    if user_prompt is not _UNSET:
        run.user_prompt = user_prompt
    if dataset_id is not _UNSET:
        run.dataset_id = dataset_id
    if dataset_hash is not _UNSET:
        run.dataset_hash = dataset_hash
    if config is not _UNSET:
        run.config = json.dumps(config)
    if output is not _UNSET:
        run.output = output
    if tool_transcript is not _UNSET:
        run.tool_transcript = _dump(tool_transcript)
    if metrics is not _UNSET:
        run.metrics = _dump(metrics)
    if guardrail_trace is not _UNSET:
        run.guardrail_trace = _dump(guardrail_trace)
    if status is not _UNSET:
        run.status = status
    if error is not _UNSET:
        run.error = _dump(error)

    session.add(run)
    session.commit()
    session.refresh(run)
    return _run_to_record(run)


def get_run(session: Session, run_id: str) -> RunRecord:
    """Fetch a run by id. Raises ``NotFoundError`` if it doesn't exist."""
    run = session.get(Run, run_id)
    if run is None:
        raise NotFoundError(f"Run {run_id!r} not found")
    return _run_to_record(run)


def delete_run(session: Session, run_id: str) -> None:
    """Delete a run by id. Raises ``NotFoundError`` if it doesn't exist."""
    run = session.get(Run, run_id)
    if run is None:
        raise NotFoundError(f"Run {run_id!r} not found")
    session.delete(run)
    session.commit()


def list_runs(
    session: Session,
    *,
    model_id: str | None = None,
    scenario_id: str | None = None,
    status: str | None = None,
    since: datetime | None = None,
    cursor: str | None = None,
    limit: int = 25,
) -> tuple[list[RunRecord], str | None]:
    """List runs newest-first with keyset pagination.

    Returns ``(items, next_cursor)``; ``next_cursor`` is ``None`` when there
    are no further pages. ``limit`` is clamped to ``[1, 100]``.
    """
    limit = _clamp_limit(limit)
    stmt = select(Run)
    if model_id is not None:
        stmt = stmt.where(Run.model_id == model_id)
    if scenario_id is not None:
        stmt = stmt.where(Run.scenario_id == scenario_id)
    if status is not None:
        stmt = stmt.where(Run.status == status)
    if since is not None:
        stmt = stmt.where(Run.ts >= since)
    if cursor is not None:
        cursor_ts, cursor_id = _decode_cursor(cursor)
        stmt = stmt.where(
            or_(Run.ts < cursor_ts, and_(Run.ts == cursor_ts, Run.id < cursor_id))
        )
    stmt = stmt.order_by(Run.ts.desc(), Run.id.desc()).limit(limit + 1)

    rows = list(session.exec(stmt))
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = _encode_cursor(rows[-1].ts, rows[-1].id) if has_more and rows else None
    return [_run_to_record(r) for r in rows], next_cursor


def iter_runs_export(
    session: Session,
    *,
    model_id: str | None = None,
    scenario_id: str | None = None,
    status: str | None = None,
    since: datetime | None = None,
) -> Iterator[RunRecord]:
    """Yield every run matching the filters, newest-first, unpaginated."""
    stmt = select(Run)
    if model_id is not None:
        stmt = stmt.where(Run.model_id == model_id)
    if scenario_id is not None:
        stmt = stmt.where(Run.scenario_id == scenario_id)
    if status is not None:
        stmt = stmt.where(Run.status == status)
    if since is not None:
        stmt = stmt.where(Run.ts >= since)
    stmt = stmt.order_by(Run.ts.desc(), Run.id.desc())

    for run in session.exec(stmt):
        yield _run_to_record(run)


# --------------------------------------------------------------------------- #
# Evaluations
# --------------------------------------------------------------------------- #


def create_evaluation(
    session: Session,
    *,
    kind: str,
    run_ids: list[str],
    config: dict[str, Any] | None = None,
    status: str = "pending",
    result: Any | None = None,
    progress: Any | None = None,
    error: Any | None = None,
    id: str | None = None,
    ts: datetime | None = None,
) -> EvaluationRecord:
    """Insert a new evaluation and return it. ``id``/``ts`` are auto-generated if omitted."""
    evaluation = Evaluation(
        kind=kind,
        status=status,
        config=json.dumps(config or {}),
        run_ids=json.dumps(list(run_ids)),
        result=_dump(result),
        progress=_dump(progress),
        error=_dump(error),
    )
    if id is not None:
        evaluation.id = id
    if ts is not None:
        evaluation.ts = ts
    session.add(evaluation)
    session.commit()
    session.refresh(evaluation)
    return _evaluation_to_record(evaluation)


def update_evaluation(
    session: Session,
    evaluation_id: str,
    *,
    kind: str = _UNSET,
    status: str = _UNSET,
    config: dict[str, Any] = _UNSET,
    run_ids: list[str] = _UNSET,
    result: Any = _UNSET,
    progress: Any = _UNSET,
    error: Any = _UNSET,
) -> EvaluationRecord:
    """Partially update an evaluation. Only keyword args actually passed are changed.

    Raises ``NotFoundError`` if ``evaluation_id`` doesn't exist.
    """
    evaluation = session.get(Evaluation, evaluation_id)
    if evaluation is None:
        raise NotFoundError(f"Evaluation {evaluation_id!r} not found")

    if kind is not _UNSET:
        evaluation.kind = kind
    if status is not _UNSET:
        evaluation.status = status
    if config is not _UNSET:
        evaluation.config = json.dumps(config)
    if run_ids is not _UNSET:
        evaluation.run_ids = json.dumps(list(run_ids))
    if result is not _UNSET:
        evaluation.result = _dump(result)
    if progress is not _UNSET:
        evaluation.progress = _dump(progress)
    if error is not _UNSET:
        evaluation.error = _dump(error)

    session.add(evaluation)
    session.commit()
    session.refresh(evaluation)
    return _evaluation_to_record(evaluation)


def get_evaluation(session: Session, evaluation_id: str) -> EvaluationRecord:
    """Fetch an evaluation by id. Raises ``NotFoundError`` if it doesn't exist."""
    evaluation = session.get(Evaluation, evaluation_id)
    if evaluation is None:
        raise NotFoundError(f"Evaluation {evaluation_id!r} not found")
    return _evaluation_to_record(evaluation)


def list_evaluations(
    session: Session,
    *,
    kind: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
    limit: int = 25,
) -> tuple[list[EvaluationRecord], str | None]:
    """List evaluations newest-first with keyset pagination (same shape as ``list_runs``)."""
    limit = _clamp_limit(limit)
    stmt = select(Evaluation)
    if kind is not None:
        stmt = stmt.where(Evaluation.kind == kind)
    if status is not None:
        stmt = stmt.where(Evaluation.status == status)
    if cursor is not None:
        cursor_ts, cursor_id = _decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                Evaluation.ts < cursor_ts,
                and_(Evaluation.ts == cursor_ts, Evaluation.id < cursor_id),
            )
        )
    stmt = stmt.order_by(Evaluation.ts.desc(), Evaluation.id.desc()).limit(limit + 1)

    rows = list(session.exec(stmt))
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = _encode_cursor(rows[-1].ts, rows[-1].id) if has_more and rows else None
    return [_evaluation_to_record(e) for e in rows], next_cursor
