"""REST API for the run/evaluation history store, plus run and evaluation execution.

Reads (list/detail/NDJSON export) and deletes serve the history store;
``POST /runs`` executes a run through the engine
(:func:`promptatron.engine.runner.execute_run`) and presents its single event
pipeline either as an NDJSON stream or as the finished ``RunDetail``.

``POST /evaluations`` accepts a determinism experiment or a grading request,
answers ``202`` with the ``pending`` row, and hands the work to a background
task (:mod:`promptatron.evals.engine`). Progress is followed through
``GET /evaluations/{id}/events`` and stopped through ``DELETE /evaluations/{id}``.

Two lanes
---------
``POST /evaluations`` branches on ``execution``: ``"local"`` (the default) is the
in-process background task described above, ``"cloud"`` hands the work to an
AgentCore Runtime worker with state in DynamoDB (:mod:`promptatron.evals.cloud`,
contract in ``docs/cloud-evals.md``).

**Lane detection on reads is "history store first, then the cloud lane".** A
cloud evaluation has no local row at all -- the id is minted at submit time and
only the worker writes it anywhere -- so a local miss is unambiguous:
``get_evaluation``,
``stream_evaluation_events``, ``cancel_evaluation`` and ``get_run`` fall through
to the cloud reader (and re-raise the local ``404`` when the lane is
unconfigured). No lane hint is carried in the id or the URL, so a stale
bookmark keeps working after the lane is turned on. *Listings* are the one
exception, because there is nothing to miss on: cloud rows appear only under
``?execution=cloud``, which reads the GSI1 partition instead of the history
store.

The history store itself is whichever backend the deployment resolved
(:mod:`promptatron.store.repo`): SQLite locally, DynamoDB in a deployed server.
On the DynamoDB backend the two read paths converge -- the repository reads the
very ``RUN#{id}/META`` item the cloud fallback would have -- which is exactly
the "one code path" ``docs/serverless-deploy.md`` asks for.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from contextlib import aclosing
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi import status as http_status
from fastapi.responses import StreamingResponse

from promptatron import deployment
from promptatron.config import Settings, get_settings
from promptatron.configstore.client import ConfigStoreClient
from promptatron.engine.events import ErrorEvent, RunEvent, RunStartEvent
from promptatron.engine.model_factory import ModelFactory, build_model
from promptatron.engine.runner import execute_run
from promptatron.engine.schemas import RunRequest
from promptatron.errors import ConflictError, InternalError, NotFoundError, UpstreamError
from promptatron.evals import cloud as evals_cloud
from promptatron.evals import engine as evals_engine
from promptatron.evals import jobs as evals_jobs
from promptatron.evals.cloud import Invoker, get_eval_table, get_invoker
from promptatron.evals.ddb_reader import EvalTable
from promptatron.evals.events import EvalCompleteEvent
from promptatron.evals.judge import JudgeFactory, get_judge_factory
from promptatron.evals.schemas import EvaluationRequest
from promptatron.routers.scenarios import get_config_store_client
from promptatron.schemas.runs import EvaluationDetail, Page, RunDetail, RunSummary
from promptatron.store import history
from promptatron.store.repo import HistoryRepo, get_history_repo, get_repo

router = APIRouter(tags=["runs"])

NDJSON_MEDIA_TYPE = "application/x-ndjson"


def _export_ndjson(
    repo: HistoryRepo,
    model_id: str | None,
    scenario_id: str | None,
    status: str | None,
    since: datetime | None,
) -> Iterator[str]:
    """Stream every matching run as one JSON (``RunDetail``) object per line.

    The repository owns whatever connection it needs for the whole iteration --
    which matters here because FastAPI tears down ``yield``-dependencies once
    the endpoint function returns, and for a ``StreamingResponse`` that happens
    *before* the body has actually been sent.
    """
    for record in repo.iter_runs_export(
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

    The history repository is resolved from ``settings`` here rather than taken
    as a dependency: the run outlives the request (a streaming body is still
    being written after this function returns), so the repository is handed to
    the engine, which owns it for the life of the stream.
    """
    repo = get_history_repo(settings)
    events = execute_run(
        payload,
        config_client=config_client,
        settings=settings,
        model_factory=model_factory,
        repo=repo,
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

    return RunDetail.model_validate(repo.get_run(first.run_id))


@router.get("/runs", response_model=Page[RunSummary])
def list_runs(
    request: Request,
    model_id: str | None = None,
    scenario_id: str | None = None,
    status: str | None = None,
    since: datetime | None = None,
    cursor: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    execution: str | None = None,
    repo: HistoryRepo = Depends(get_repo),
    table: EvalTable | None = Depends(get_eval_table),
):
    """List runs newest-first (paginated), or export all matches as NDJSON.

    With ``Accept: application/x-ndjson`` this ignores ``cursor``/``limit``
    and streams every run matching the other filters as NDJSON ``RunDetail``
    lines instead of returning a page envelope.

    ``?execution=cloud`` lists the DynamoDB GSI1 ``RUN`` partition instead of
    SQLite; the other filters do not apply there (the index is keyed on time
    alone) and the NDJSON export stays local-only.
    """
    if execution == "cloud":
        return evals_cloud.list_runs(
            evals_cloud.require_table(table), cursor=cursor, limit=limit
        )

    if request.headers.get("accept") == NDJSON_MEDIA_TYPE:
        return StreamingResponse(
            _export_ndjson(repo, model_id, scenario_id, status, since),
            media_type=NDJSON_MEDIA_TYPE,
        )

    items, next_cursor = repo.list_runs(
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
def get_run(
    run_id: str,
    repo: HistoryRepo = Depends(get_repo),
    table: EvalTable | None = Depends(get_eval_table),
):
    """A run from the history store, falling back to the cloud lane's ``RUN#{id}/META``."""
    try:
        record = repo.get_run(run_id)
    except NotFoundError:
        if table is None:
            raise
        return evals_cloud.get_run(table, run_id)
    return RunDetail.model_validate(record)


@router.delete("/runs/{run_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_run(run_id: str, repo: HistoryRepo = Depends(get_repo)) -> Response:
    repo.delete_run(run_id)
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)


@router.get("/evaluations", response_model=Page[EvaluationDetail])
def list_evaluations(
    kind: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    execution: str | None = None,
    repo: HistoryRepo = Depends(get_repo),
    table: EvalTable | None = Depends(get_eval_table),
):
    """List evaluations newest-first.

    The default listing is SQLite (local evaluations only). ``?execution=cloud``
    reads the DynamoDB GSI1 ``EVAL`` partition instead; the two are never mixed.
    """
    if execution == "cloud":
        return evals_cloud.list_evaluations(
            evals_cloud.require_table(table),
            kind=kind,
            status=status,
            cursor=cursor,
            limit=limit,
        )

    items, next_cursor = repo.list_evaluations(
        kind=kind, status=status, cursor=cursor, limit=limit
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
    repo: HistoryRepo = Depends(get_repo),
    invoker: Invoker | None = Depends(get_invoker),
):
    """Accept an evaluation and run it in the background.

    Everything that can be decided synchronously is decided here -- an unknown
    ``run_id`` is a 404 rather than a job that fails a second later -- and the
    row exists as ``pending`` before the response is sent, so the id in the body
    is immediately usable against ``/evaluations/{id}`` and its event stream.

    ``execution="cloud"`` short-circuits all of that: the work goes to the
    AgentCore worker and the ``202`` is synthesized from the request, with no
    local row written at all (400 ``cloud_lane_unavailable`` when the lane is
    not configured).

    The mirror case is a deployment with no local lane (``PROMPTATRON_LOCAL_EVALS``,
    off inside Lambda by default): ``execution="local"`` -- explicit *or*
    defaulted -- is a 400 ``local_lane_unavailable`` rather than a silent
    upgrade to the cloud lane, because where an evaluation runs is the caller's
    decision to make.
    """
    if payload.execution == "cloud":
        return await evals_cloud.submit(payload, settings=settings, invoker=invoker)

    deployment.require_local_lane(settings)

    if payload.kind == "grade":
        for run_id in payload.run_ids:
            repo.get_run(run_id)

    record = repo.create_evaluation(
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
            repo=repo,
        ),
    )
    return EvaluationDetail.model_validate(record)


@router.get("/evaluations/{evaluation_id}", response_model=EvaluationDetail)
def get_evaluation(
    evaluation_id: str,
    repo: HistoryRepo = Depends(get_repo),
    table: EvalTable | None = Depends(get_eval_table),
):
    """An evaluation from the history store, falling back to the cloud ``META`` item."""
    try:
        record = repo.get_evaluation(evaluation_id)
    except NotFoundError:
        if table is None:
            raise
        return evals_cloud.get_evaluation(table, evaluation_id)
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
def stream_evaluation_events(
    evaluation_id: str,
    repo: HistoryRepo = Depends(get_repo),
    table: EvalTable | None = Depends(get_eval_table),
):
    """Follow an evaluation as NDJSON: replay what happened, then live events.

    A subscriber that connects mid-run gets every event already emitted before
    the live ones; a subscriber that connects after the job finished gets the
    whole log and then EOF.

    A cloud evaluation has neither a job nor a row, so it falls through to the
    DynamoDB event log -- read here rather than inside the generator so an
    unknown id is still a 404 envelope instead of an empty 200 stream.
    """
    job = evals_jobs.get(evaluation_id)
    if job is not None:
        return StreamingResponse(job.follow(), media_type=NDJSON_MEDIA_TYPE)

    try:
        record = repo.get_evaluation(evaluation_id)
    except NotFoundError:
        if table is None:
            raise
        evals_cloud.get_evaluation(table, evaluation_id)  # 404s before streaming
        return StreamingResponse(
            evals_cloud.stream_events(table, evaluation_id), media_type=NDJSON_MEDIA_TYPE
        )
    return StreamingResponse(_replay_finished(record), media_type=NDJSON_MEDIA_TYPE)


@router.delete("/evaluations/{evaluation_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def cancel_evaluation(
    evaluation_id: str,
    repo: HistoryRepo = Depends(get_repo),
    table: EvalTable | None = Depends(get_eval_table),
) -> Response:
    """Cancel a running evaluation (204); a finished one is a 409.

    The response is sent only once the job has persisted ``cancelled`` and
    emitted its final event, so a client that immediately re-reads the row sees
    the cancellation. Runs that already completed keep their ids on the row.

    A cloud evaluation cannot be waited on that way: the ``CANCEL`` item goes
    into DynamoDB and the 204 is immediate, with the worker noticing between
    runs.
    """
    try:
        record = repo.get_evaluation(evaluation_id)
    except NotFoundError:
        if table is None:
            raise
        evals_cloud.cancel_evaluation(table, evaluation_id)
        return Response(status_code=http_status.HTTP_204_NO_CONTENT)

    job = evals_jobs.get(evaluation_id)

    if job is not None and not job.finished:
        await evals_jobs.cancel(job)
        return Response(status_code=http_status.HTTP_204_NO_CONTENT)

    if record.status in ("pending", "running"):
        # An orphaned row (its job died with the process): settle it as cancelled.
        repo.update_evaluation(evaluation_id, status="cancelled")
        return Response(status_code=http_status.HTTP_204_NO_CONTENT)

    raise ConflictError(
        f"Evaluation {evaluation_id!r} already finished",
        detail={"status": record.status},
    )
