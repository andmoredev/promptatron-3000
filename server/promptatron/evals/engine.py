"""The body of an evaluation: execute, grade, persist, report.

The execution core is :func:`execute_evaluation_with_seam`, which knows how to
run and grade an evaluation but nothing at all about *where* progress events go
or *where* records are persisted. Those two capabilities are injected:

``emit(event_dict)``
    Publish one progress event, already in its NDJSON wire shape (the dict
    :meth:`promptatron.evals.events._Event.as_log_entry` produces). Synchronous.
``store``
    An :class:`EvalStore` -- evaluation-row updates plus run load/save.
``cancelled()``
    Polled between runs and once more before grading; ``True`` settles the
    evaluation as ``cancelled`` exactly as an ``asyncio`` cancellation would.

Two lanes share that core:

*local*
    ``POST /evaluations`` with ``execution="local"`` (the default). One
    ``asyncio`` task per evaluation; ``emit`` is the in-process job's event log
    (:mod:`promptatron.evals.jobs`) and ``store`` is the SQLite history
    repository (:class:`SqliteEvalStore`). :func:`run_evaluation` is the whole
    adapter.
*cloud*
    An AgentCore Runtime worker outside this process, whose ``emit`` appends
    DynamoDB ``EVENT#`` items and whose ``store`` writes DynamoDB ``META`` /
    ``RUN#`` items. See ``docs/cloud-evals.md`` and
    :mod:`promptatron.evals.cloud`; the worker imports
    :func:`execute_evaluation_with_seam` directly.

Determinism
-----------
The same ``run_config`` is executed ``n`` times through the ordinary run engine
(:func:`promptatron.engine.runner.execute_run`) -- each repetition persists its
own run row, so every repeat is inspectable in ``/runs`` afterwards. At most
:data:`MAX_CONCURRENT_RUNS` repeats are in flight at once.

A repeat whose in-band error is throttle-classified (``model_throttled``, from
``engine.model_factory.classify_error``) is retried, sleeping
:data:`RETRY_BACKOFF_SECONDS` between attempts -- a module-level tuple so tests
can shorten it. Retries keep the repeat's index; only the successful attempt's
run id is kept. Anything still failing after the last attempt is reported as
``run_failed``, excluded from grading, listed in ``result.failed_runs``, and the
other repeats carry on.

Statuses
--------
``completed``
    The batch finished. The judge may still have failed -- that shows up as
    ``result.judge_error`` next to the (always present) local metrics.
``error``
    Not a single repeat succeeded, or the job itself blew up.
``cancelled``
    ``DELETE /evaluations/{id}`` arrived mid-flight. Whatever had already
    completed is persisted, no further repeats start.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from contextlib import aclosing, contextmanager
from dataclasses import dataclass
from typing import Any, Protocol

from sqlmodel import Session

from promptatron.config import Settings
from promptatron.configstore.client import ConfigStoreClient
from promptatron.engine.events import ErrorEvent, RunCompleteEvent, RunStartEvent
from promptatron.engine.model_factory import ModelFactory, build_model, classify_error
from promptatron.engine.runner import execute_run
from promptatron.errors import AppError
from promptatron.evals import grader, jobs
from promptatron.evals.events import (
    EvalCompleteEvent,
    EvalEvent,
    EvalStartEvent,
    GradingCompletedEvent,
    GradingStartedEvent,
    RunCompletedEvent,
    RunFailedEvent,
    RunStartedEvent,
    RunSummary,
)
from promptatron.evals.jobs import EvalJob
from promptatron.evals.judge import JudgeFactory, build_judge_model
from promptatron.evals.metrics import local_metrics
from promptatron.evals.outcomes import RunOutcome
from promptatron.evals.schemas import EvaluationRequest
from promptatron.providers import DEFAULT_PROVIDER
from promptatron.store import history
from promptatron.store.db import get_engine

logger = logging.getLogger(__name__)

MAX_CONCURRENT_RUNS = 3
#: Sleep between throttle retries; index 0 is used after the first failure.
RETRY_BACKOFF_SECONDS: tuple[float, ...] = (5.0, 10.0)
THROTTLE_ERROR_CODE = "model_throttled"


@dataclass
class EvalDeps:
    """Everything the job needs from the request that started it.

    The model/judge factories are the same dependency-injection seams the run
    router uses, so the whole pipeline can be driven by scripted fakes.
    """

    settings: Settings
    model_factory: ModelFactory
    judge_factory: JudgeFactory
    config_client: ConfigStoreClient | None = None


def default_deps(settings: Settings | None = None) -> EvalDeps:
    """The real (non-injected) dependency set: Bedrock models, Bedrock judge.

    The local lane always gets these through FastAPI's ``Depends``; the cloud
    worker has no request to hang them off, so it builds them from its own
    environment through this helper.
    """
    settings = settings or Settings()
    return EvalDeps(
        settings=settings,
        model_factory=lambda request: build_model(request, settings),
        judge_factory=lambda model_id, provider=DEFAULT_PROVIDER: build_judge_model(
            model_id, settings, provider
        ),
    )


# --------------------------------------------------------------------------- #
# The emitter/store seam
# --------------------------------------------------------------------------- #

#: One progress event in its NDJSON wire shape.
EventDict = dict[str, Any]
#: Publish one progress event. Must not block for long; must not be awaited.
EmitFn = Callable[[EventDict], Any]
#: Polled between runs and before grading. ``True`` means "stop, settle as cancelled".
CancelledFn = Callable[[], bool]


class EvalStore(Protocol):
    """Where an evaluation's durable records go.

    Deliberately tiny: the engine only ever needs to update *its own*
    evaluation row, read a run back after it has been executed (or, for
    ``kind="grade"``, read one that already existed), and publish a finished
    run. The local lane backs all three with SQLite (:class:`SqliteEvalStore`);
    the cloud worker backs them with DynamoDB items
    (:class:`promptatron.worker.ddb.DynamoEvalStore`, restated for that side as
    :class:`promptatron.worker.interfaces.RunStore`).
    """

    #: The evaluation this store is bound to -- every ``save_evaluation`` targets it.
    evaluation_id: str

    def save_evaluation(self, **fields: Any) -> None:
        """Partially update the evaluation record (``status``, ``result``, ...)."""
        ...

    def load_run(self, run_id: str) -> Any:
        """Read a run record back. Raises ``NotFoundError`` if it is gone.

        Returns anything with the :class:`~promptatron.store.history.RunRecord`
        attributes the engine reads (``id``, ``status``, ``output``,
        ``user_prompt``, ``tool_transcript``, ``metrics``, ``error``).
        """
        ...

    def save_run(self, run_id: str) -> None:
        """Publish a just-finished run, before its ``run_completed`` event.

        A no-op for the local lane, where ``execute_run`` has already written
        the row to the same SQLite database the reader uses; a copy of that row
        into a ``RUN#`` item in the cloud lane.
        """
        ...


@contextmanager
def _session():
    """A short store session bound to the process-wide engine.

    The job outlives the request that started it, so it can never borrow the
    request's ``Depends`` session -- FastAPI closes those when the endpoint
    returns.
    """
    with Session(get_engine()) as session:
        yield session


class SqliteEvalStore:
    """The local lane's :class:`EvalStore`: the SQLite history repository."""

    def __init__(self, evaluation_id: str = "") -> None:
        self.evaluation_id = evaluation_id

    def save_evaluation(self, **fields: Any) -> None:
        with _session() as session:
            history.update_evaluation(session, self.evaluation_id, **fields)

    def load_run(self, run_id: str) -> history.RunRecord:
        with _session() as session:
            return history.get_run(session, run_id)

    def save_run(self, run_id: str) -> None:
        """Nothing to do: ``execute_run`` wrote the row as it executed."""


class _CooperativeCancel(Exception):
    """Raised internally when ``cancelled()`` reports a cancellation request."""


@dataclass
class _Seam:
    """The four injected capabilities, bundled so helpers take one argument."""

    evaluation_id: str
    emit: EmitFn
    store: EvalStore
    cancelled: CancelledFn
    deps: EvalDeps

    def publish(self, event: EvalEvent) -> None:
        """Serialize an event to its wire shape and hand it to ``emit``."""
        self.emit(event.as_log_entry())


# --------------------------------------------------------------------------- #
# Executing the repeats
# --------------------------------------------------------------------------- #


async def _execute_once(
    index: int,
    request: EvaluationRequest,
    deps: EvalDeps,
    store: EvalStore | None = None,
) -> RunOutcome:
    """Run ``run_config`` once, consuming the engine's event stream internally.

    ``store`` defaults to the local SQLite repository -- which is where
    ``execute_run`` has just written the row in *either* lane, the cloud store's
    ``load_run`` simply preferring that same local row.
    """
    store = store or SqliteEvalStore()
    assert request.run_config is not None
    outcome = RunOutcome(index=index, user_prompt=request.run_config.user_prompt)
    started = time.perf_counter()

    events = execute_run(
        request.run_config,
        config_client=deps.config_client,
        settings=deps.settings,
        model_factory=deps.model_factory,
    )
    try:
        async with aclosing(events):
            async for event in events:
                match event:
                    case RunStartEvent():
                        outcome.run_id = event.run_id
                    case ErrorEvent():
                        outcome.error = {
                            "code": event.code,
                            "message": event.message,
                            "retryable": event.retryable,
                        }
                    case RunCompleteEvent():
                        outcome.status = event.status
                        outcome.output = event.final_text
                    case _:
                        pass
    except asyncio.CancelledError:
        raise
    except AppError as exc:
        # Setup failures (an unresolvable dataset, an unreachable config store)
        # never reach the stream -- they are raised before ``run_start``.
        outcome.error = {"code": exc.code, "message": exc.message, "retryable": False}
    except Exception as exc:  # pragma: no cover - defensive
        code, message, retryable = classify_error(exc)
        outcome.error = {"code": code, "message": message, "retryable": retryable}

    outcome.duration_ms = int((time.perf_counter() - started) * 1000)
    if outcome.run_id is not None:
        record = store.load_run(outcome.run_id)
        outcome.tool_transcript = list(record.tool_transcript or [])
        if outcome.status != "completed":
            outcome.error = outcome.error or record.error
    return outcome


def _is_throttle(outcome: RunOutcome) -> bool:
    return bool(outcome.error) and outcome.error.get("code") == THROTTLE_ERROR_CODE


async def _execute_with_retries(
    index: int,
    request: EvaluationRequest,
    deps: EvalDeps,
    store: EvalStore | None = None,
) -> RunOutcome:
    """Execute one repeat, retrying throttled attempts with backoff."""
    outcome = await _execute_once(index, request, deps, store)
    for attempt, backoff in enumerate(RETRY_BACKOFF_SECONDS, start=1):
        if outcome.succeeded or not _is_throttle(outcome):
            break
        logger.info("eval run %d throttled, retrying in %.1fs", index, backoff)
        await asyncio.sleep(backoff)
        outcome = await _execute_once(index, request, deps, store)
        outcome.attempts = attempt + 1
    return outcome


async def _execute_batch(
    seam: _Seam, request: EvaluationRequest, collected: list[RunOutcome]
) -> None:
    """Execute the batch, at most :data:`MAX_CONCURRENT_RUNS` at a time.

    Finished repeats are appended to ``collected`` as they land rather than
    returned in one go: a cancellation mid-batch has to be able to persist the
    repeats that *did* complete, and the gather never returns in that case.

    ``cancelled()`` is polled once per repeat, after the concurrency slot is
    acquired and before anything is emitted, so a cancellation stops the batch
    at the next slot rather than mid-run.
    """
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_RUNS)

    async def one(index: int) -> None:
        async with semaphore:
            if seam.cancelled():
                return
            seam.publish(RunStartedEvent(index=index))
            outcome = await _execute_with_retries(index, request, seam.deps, seam.store)
        collected.append(outcome)
        _publish_run(seam, outcome)

    await asyncio.gather(*(one(index) for index in range(request.n)))
    collected.sort(key=lambda outcome: outcome.index)


def _publish_run(seam: _Seam, outcome: RunOutcome) -> None:
    """Hand the finished run to the store, *then* announce it.

    That order is the contract's writer rule: a client that reacts to
    ``run_completed`` by fetching the run must always find it.
    """
    if outcome.run_id is not None:
        seam.store.save_run(outcome.run_id)
    _emit_run_result(seam, outcome)


def _emit_run_result(seam: _Seam, outcome: RunOutcome) -> None:
    if outcome.succeeded:
        assert outcome.run_id is not None
        seam.publish(
            RunCompletedEvent(
                index=outcome.index,
                run_id=outcome.run_id,
                status=outcome.status,
                summary=RunSummary(**outcome.summary()),
            )
        )
    else:
        seam.publish(RunFailedEvent(index=outcome.index, error=outcome.error))


def _load_stored_runs(seam: _Seam, run_ids: list[str]) -> list[RunOutcome]:
    """Turn already-stored runs into outcomes (``kind="grade"``).

    Missing ids are rejected by the router before the job starts, so anything
    unreadable here is a genuine mid-flight deletion.
    """
    outcomes: list[RunOutcome] = []
    for index, run_id in enumerate(run_ids):
        try:
            record = seam.store.load_run(run_id)
        except AppError as exc:
            outcome = RunOutcome(
                index=index,
                run_id=run_id,
                error={"code": exc.code, "message": exc.message, "retryable": False},
            )
            outcomes.append(outcome)
            _emit_run_result(seam, outcome)
            continue
        outcome = RunOutcome(
            index=index,
            run_id=record.id,
            status=record.status,
            output=record.output or "",
            user_prompt=record.user_prompt,
            tool_transcript=list(record.tool_transcript or []),
            duration_ms=int((record.metrics or {}).get("latency_ms", 0)),
            error=record.error,
        )
        outcomes.append(outcome)
        _emit_run_result(seam, outcome)
    return outcomes


# --------------------------------------------------------------------------- #
# Result assembly
# --------------------------------------------------------------------------- #


def _build_result(
    outcomes: list[RunOutcome],
    judged: grader.JudgeResult,
    request: EvaluationRequest,
) -> dict[str, Any]:
    successes = [outcome for outcome in outcomes if outcome.succeeded]
    metrics = local_metrics(
        [outcome.output for outcome in successes],
        [outcome.tool_transcript for outcome in successes],
    )
    metrics.update(judged.metrics)

    result: dict[str, Any] = {
        "grade": judged.grade,
        "score": judged.score,
        "reasoning": judged.reasoning,
        "judge": {
            "model_id": request.grader.model_id,
            "system_prompt_used": request.grader.system_prompt is not None,
            "rubric_used": request.rubric is not None,
        },
        "metrics": metrics,
        "run_ids": [outcome.run_id for outcome in successes],
        "failed_runs": [
            {"index": outcome.index, "error": outcome.error}
            for outcome in outcomes
            if not outcome.succeeded
        ],
    }
    if judged.error is not None:
        result["judge_error"] = judged.error
    return result


def _terminal(
    seam: _Seam,
    status: str,
    outcomes: list[RunOutcome],
    result: dict[str, Any] | None,
    error: dict[str, Any] | None,
) -> dict[str, Any]:
    """The value :func:`execute_evaluation_with_seam` returns: the final state."""
    return {
        "evaluation_id": seam.evaluation_id,
        "status": status,
        "result": result,
        "error": error,
        "run_ids": [outcome.run_id for outcome in outcomes if outcome.succeeded],
    }


def _settle_cancelled(seam: _Seam, outcomes: list[RunOutcome]) -> dict[str, Any]:
    """Persist + announce a cancellation. Deliberately contains no ``await``.

    On the ``asyncio`` cancellation path the task is *already* cancelled, so any
    suspension point here would re-raise before the state was saved.
    """
    successes = [outcome for outcome in outcomes if outcome.succeeded]
    seam.store.save_evaluation(
        status="cancelled",
        run_ids=[outcome.run_id for outcome in successes],
    )
    seam.publish(EvalCompleteEvent(status="cancelled", result=None))
    return _terminal(seam, "cancelled", outcomes, None, None)


# --------------------------------------------------------------------------- #
# The execution core
# --------------------------------------------------------------------------- #


async def execute_evaluation_with_seam(
    request: EvaluationRequest | dict[str, Any],
    emit: EmitFn,
    store: EvalStore,
    cancelled: CancelledFn | None = None,
    *,
    deps: EvalDeps | None = None,
    evaluation_id: str | None = None,
) -> dict[str, Any]:
    """Execute + grade one evaluation against an injected emitter and store.

    This is the whole evaluation, lane-agnostic. ``emit`` publishes each
    progress event as a plain dict, ``store`` publishes finished runs and reads
    stored ones, and ``cancelled`` is polled between runs and before grading.

    ``request`` may be an :class:`EvaluationRequest` or the plain dict an
    out-of-process caller received on the wire -- validation belongs to the
    engine either way. ``evaluation_id`` defaults to ``store.evaluation_id``
    and ``deps`` to :func:`default_deps`, so a host can call this with just the
    four documented arguments.

    Returns the terminal state::

        {"evaluation_id", "status", "result", "error", "run_ids"}

    An ``asyncio`` cancellation is persisted and announced, then re-raised (the
    local lane's cancel path); a cooperative ``cancelled()`` is persisted,
    announced, and *returned* as ``status="cancelled"``.
    """
    seam = _Seam(
        evaluation_id=evaluation_id or getattr(store, "evaluation_id", ""),
        emit=emit,
        store=store,
        cancelled=cancelled or (lambda: False),
        deps=deps or default_deps(),
    )
    outcomes: list[RunOutcome] = []
    try:
        if not isinstance(request, EvaluationRequest):
            request = EvaluationRequest.model_validate(request)

        seam.store.save_evaluation(status="running")
        seam.publish(
            EvalStartEvent(
                evaluation_id=seam.evaluation_id, kind=request.kind, n=request.planned_runs
            )
        )

        if request.kind == "determinism":
            await _execute_batch(seam, request, outcomes)
        else:
            outcomes.extend(_load_stored_runs(seam, request.run_ids))

        successes = [outcome for outcome in outcomes if outcome.succeeded]
        seam.store.save_evaluation(
            run_ids=[outcome.run_id for outcome in successes],
            progress={
                "completed": len(successes),
                "failed": len(outcomes) - len(successes),
                "total": request.planned_runs,
            },
        )

        if seam.cancelled():
            raise _CooperativeCancel

        seam.publish(GradingStartedEvent())
        judged = await grader.judge(
            successes,
            kind=request.kind,
            rubric=request.rubric,
            grader=request.grader,
            judge_factory=seam.deps.judge_factory,
        )
        result = _build_result(outcomes, judged, request)
        seam.publish(GradingCompletedEvent(result=result))

        status = "completed" if successes else "error"
        error = (
            None if successes else {"code": "no_successful_runs", "message": "Every run failed"}
        )
        seam.store.save_evaluation(status=status, result=result, error=error)
        seam.publish(EvalCompleteEvent(status=status, result=result))
        return _terminal(seam, status, outcomes, result, error)

    except asyncio.CancelledError:
        logger.info("evaluation %s cancelled", seam.evaluation_id)
        _settle_cancelled(seam, outcomes)
        raise

    except _CooperativeCancel:
        logger.info("evaluation %s cancelled", seam.evaluation_id)
        return _settle_cancelled(seam, outcomes)

    except Exception as exc:
        logger.exception("evaluation %s failed", seam.evaluation_id)
        error = {"code": "internal_error", "message": str(exc) or exc.__class__.__name__}
        seam.store.save_evaluation(status="error", error=error)
        seam.publish(EvalCompleteEvent(status="error", result=None))
        return _terminal(seam, "error", outcomes, None, error)


# --------------------------------------------------------------------------- #
# The local lane: one asyncio task, an in-process job log, SQLite
# --------------------------------------------------------------------------- #


async def run_evaluation(
    job: EvalJob, evaluation_id: str, request: EvaluationRequest, deps: EvalDeps
) -> None:
    """Run one evaluation locally: job log as emitter, SQLite as store.

    The whole local lane is this adapter -- everything else lives in
    :func:`execute_evaluation_with_seam`.
    """
    try:
        await execute_evaluation_with_seam(
            request,
            job.emit_entry,
            SqliteEvalStore(evaluation_id),
            lambda: job.cancelled,
            deps=deps,
            evaluation_id=evaluation_id,
        )
    finally:
        job.close()


def start(evaluation_id: str, request: EvaluationRequest, deps: EvalDeps) -> EvalJob:
    """Register the job for ``evaluation_id`` and start it in the background."""
    job = jobs.register(evaluation_id)
    job.task = asyncio.create_task(run_evaluation(job, evaluation_id, request, deps))
    return job
