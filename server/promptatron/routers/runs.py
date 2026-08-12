"""REST API for the run/evaluation history store, plus run and evaluation execution.

Reads (list/detail/NDJSON export) and deletes serve the history store;
``POST /runs`` executes a run through the engine
(:func:`promptatron.engine.runner.execute_run`) and presents its single event
pipeline either as an NDJSON stream or as the finished ``RunDetail``.

``POST /evaluations`` accepts a determinism experiment or a grading request,
answers ``202`` with the ``pending`` row, and hands the work to a background
task (:mod:`promptatron.evals.engine`). Progress is followed through
``GET /evaluations/{id}/events`` and stopped through ``DELETE /evaluations/{id}``.
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
from promptatron.errors import ConflictError, InternalError, UpstreamError
from promptatron.evals import engine as evals_engine
from promptatron.evals import jobs as evals_jobs
from promptatron.evals.events import EvalCompleteEvent
from promptatron.evals.judge import JudgeFactory, get_judge_factory
from promptatron.evals.schemas import EvaluationRequest
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


@router.post(
    "/evaluations",
    status_code=http_status.HTTP_202_ACCEPTED,
    response_model=EvaluationDetail,
)
async def create_evaluation(
    payload: EvaluationRequest,
    settings: Settings = Depends(get_settings),
    config_client: ConfigStoreClient = Depends(get_config_store_client),
    model_factory: ModelFactory = Depends(get_model_factory),
    judge_factory: JudgeFactory = Depends(get_judge_factory),
    session: Session = Depends(get_session),
):
    """Accept an evaluation and run it in the background.

    Everything that can be decided synchronously is decided here -- an unknown
    ``run_id`` is a 404 rather than a job that fails a second later -- and the
    row exists as ``pending`` before the response is sent, so the id in the body
    is immediately usable against ``/evaluations/{id}`` and its event stream.
    """
    if payload.kind == "grade":
        for run_id in payload.run_ids:
            history.get_run(session, run_id)

    record = history.create_evaluation(
        session,
        kind=payload.kind,
        run_ids=payload.run_ids if payload.kind == "grade" else [],
        config=payload.stored_config(),
        status="pending",
    )
    evals_engine.start(
        record.id,
        payload,
        evals_engine.EvalDeps(
            settings=settings,
            model_factory=model_factory,
            judge_factory=judge_factory,
            config_client=config_client,
        ),
    )
    return EvaluationDetail.model_validate(record)


@router.get("/evaluations/{evaluation_id}", response_model=EvaluationDetail)
def get_evaluation(evaluation_id: str, session: Session = Depends(get_session)):
    record = history.get_evaluation(session, evaluation_id)
    return EvaluationDetail.model_validate(record)


def _replay_finished(record: history.EvaluationRecord) -> Iterator[str]:
    """The event stream of an evaluation whose job is gone (e.g. a restart).

    The job registry is in-process, so a row can outlive its event log. One
    synthetic ``eval_complete`` built from the row keeps the stream's contract
    (always terminated by ``eval_complete``) instead of 404-ing a real
    evaluation. A row still marked pending/running here lost its job, which is
    terminal -- it is reported as ``error``.
    """
    status = record.status if record.status in ("completed", "cancelled") else "error"
    yield evals_jobs.to_json_line(
        EvalCompleteEvent(status=status, result=record.result).as_log_entry()
    )


@router.get("/evaluations/{evaluation_id}/events")
def stream_evaluation_events(evaluation_id: str, session: Session = Depends(get_session)):
    """Follow an evaluation as NDJSON: replay what happened, then live events.

    A subscriber that connects mid-run gets every event already emitted before
    the live ones; a subscriber that connects after the job finished gets the
    whole log and then EOF.
    """
    job = evals_jobs.get(evaluation_id)
    if job is not None:
        return StreamingResponse(job.follow(), media_type=NDJSON_MEDIA_TYPE)

    record = history.get_evaluation(session, evaluation_id)
    return StreamingResponse(_replay_finished(record), media_type=NDJSON_MEDIA_TYPE)


@router.delete("/evaluations/{evaluation_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def cancel_evaluation(
    evaluation_id: str, session: Session = Depends(get_session)
) -> Response:
    """Cancel a running evaluation (204); a finished one is a 409.

    The response is sent only once the job has persisted ``cancelled`` and
    emitted its final event, so a client that immediately re-reads the row sees
    the cancellation. Runs that already completed keep their ids on the row.
    """
    record = history.get_evaluation(session, evaluation_id)
    job = evals_jobs.get(evaluation_id)

    if job is not None and not job.finished:
        await evals_jobs.cancel(job)
        return Response(status_code=http_status.HTTP_204_NO_CONTENT)

    if record.status in ("pending", "running"):
        # An orphaned row (its job died with the process): settle it as cancelled.
        history.update_evaluation(session, evaluation_id, status="cancelled")
        return Response(status_code=http_status.HTTP_204_NO_CONTENT)

    raise ConflictError(
        f"Evaluation {evaluation_id!r} already finished",
        detail={"status": record.status},
    )
