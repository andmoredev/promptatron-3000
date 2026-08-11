"""Read-side REST API for the run/evaluation history store.

Write endpoints (creating runs/evaluations, the evaluation event stream) are a
later work item -- this module is read + delete only.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi import status as http_status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from promptatron.schemas.runs import EvaluationDetail, Page, RunDetail, RunSummary
from promptatron.store import history
from promptatron.store.db import get_engine, get_session

router = APIRouter(tags=["runs"])

NDJSON_MEDIA_TYPE = "application/x-ndjson"


def _export_ndjson(
    model_id: str | None,
    scenario_id: str | None,
    status: str | None,
    since: datetime | None,
) -> Iterator[str]:
    """Stream every matching run as one JSON (``RunDetail``) object per line.

    Opens its own session rather than reusing the request's ``Depends``
    session: FastAPI tears down ``yield``-dependencies once the endpoint
    function returns, which for a ``StreamingResponse`` happens *before* the
    body has actually been sent.
    """
    with Session(get_engine()) as export_session:
        for record in history.iter_runs_export(
            export_session,
            model_id=model_id,
            scenario_id=scenario_id,
            status=status,
            since=since,
        ):
            yield RunDetail.model_validate(record).model_dump_json() + "\n"


@router.get("/runs", response_model=Page[RunSummary])
def list_runs(
    request: Request,
    model_id: str | None = None,
    scenario_id: str | None = None,
    status: str | None = None,
    since: datetime | None = None,
    cursor: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    session: Session = Depends(get_session),
):
    """List runs newest-first (paginated), or export all matches as NDJSON.

    With ``Accept: application/x-ndjson`` this ignores ``cursor``/``limit``
    and streams every run matching the other filters as NDJSON ``RunDetail``
    lines instead of returning a page envelope.
    """
    if request.headers.get("accept") == NDJSON_MEDIA_TYPE:
        return StreamingResponse(
            _export_ndjson(model_id, scenario_id, status, since),
            media_type=NDJSON_MEDIA_TYPE,
        )

    items, next_cursor = history.list_runs(
        session,
        model_id=model_id,
        scenario_id=scenario_id,
        status=status,
        since=since,
        cursor=cursor,
        limit=limit,
    )
    return Page[RunSummary](
        items=[RunSummary.model_validate(record) for record in items],
        next_cursor=next_cursor,
    )


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run(run_id: str, session: Session = Depends(get_session)):
    record = history.get_run(session, run_id)
    return RunDetail.model_validate(record)


@router.delete("/runs/{run_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_run(run_id: str, session: Session = Depends(get_session)) -> Response:
    history.delete_run(session, run_id)
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)


@router.get("/evaluations", response_model=Page[EvaluationDetail])
def list_evaluations(
    kind: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    session: Session = Depends(get_session),
):
    items, next_cursor = history.list_evaluations(
        session, kind=kind, status=status, cursor=cursor, limit=limit
    )
    return Page[EvaluationDetail](
        items=[EvaluationDetail.model_validate(record) for record in items],
        next_cursor=next_cursor,
    )


@router.get("/evaluations/{evaluation_id}", response_model=EvaluationDetail)
def get_evaluation(evaluation_id: str, session: Session = Depends(get_session)):
    record = history.get_evaluation(session, evaluation_id)
    return EvaluationDetail.model_validate(record)
