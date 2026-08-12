"""REST API for the run/evaluation history store, plus run execution.

Reads (list/detail/NDJSON export) and deletes serve the history store;
``POST /runs`` executes a run through the engine
(:func:`promptatron.engine.runner.execute_run`) and presents its single event
pipeline either as an NDJSON stream or as the finished ``RunDetail``.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from contextlib import aclosing
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi import status as http_status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from promptatron.config import Settings, get_settings
from promptatron.configstore.client import ConfigStoreClient
from promptatron.engine.events import ErrorEvent, RunEvent, RunStartEvent
from promptatron.engine.model_factory import ModelFactory, build_model
from promptatron.engine.runner import execute_run
from promptatron.engine.schemas import RunRequest
from promptatron.errors import InternalError, UpstreamError
from promptatron.routers.scenarios import get_config_store_client
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


def get_model_factory(settings: Settings = Depends(get_settings)) -> ModelFactory:
    """The model provider builder used by ``POST /runs``.

    A FastAPI dependency purely so tests can override it with a scripted
    ``FakeModel`` without touching settings or the environment.
    """
    return lambda request: build_model(request, settings)


async def _run_ndjson(first: RunEvent, rest: AsyncIterator[RunEvent]) -> AsyncIterator[str]:
    """Serialize the (already primed) engine stream as NDJSON lines.

    ``aclosing`` matters here: when the client disconnects, Starlette closes this
    generator, and only an explicit ``aclose`` propagates that promptly to the
    engine generator (otherwise it waits on async-generator GC finalization) --
    which is what lets the run be persisted as ``cancelled``.
    """
    async with aclosing(rest):
        yield first.to_json_line()
        async for event in rest:
            yield event.to_json_line()


@router.post("/runs", status_code=http_status.HTTP_200_OK)
async def create_run(
    payload: RunRequest,
    settings: Settings = Depends(get_settings),
    config_client: ConfigStoreClient = Depends(get_config_store_client),
    model_factory: ModelFactory = Depends(get_model_factory),
):
    """Execute a run; stream it as NDJSON, or return the finished ``RunDetail``.

    The generator is primed once here so that setup failures (an invalid
    dataset reference, an unreachable config store) still surface as ordinary
    HTTP error envelopes. Once ``run_start`` has been produced the run row
    exists, and every later failure travels in-band on a 200 stream.
    """
    events = execute_run(
        payload,
        config_client=config_client,
        settings=settings,
        model_factory=model_factory,
    )
    first = await anext(events)

    if payload.stream:
        return StreamingResponse(_run_ndjson(first, events), media_type=NDJSON_MEDIA_TYPE)

    assert isinstance(first, RunStartEvent)
    failure: ErrorEvent | None = None
    async for event in events:
        if isinstance(event, ErrorEvent):
            failure = event

    if failure is not None:
        error_cls = UpstreamError if failure.retryable else InternalError
        raise error_cls(
            failure.message,
            detail={"run_id": first.run_id, "code": failure.code, "retryable": failure.retryable},
        )

    with Session(get_engine()) as session:
        return RunDetail.model_validate(history.get_run(session, first.run_id))


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
