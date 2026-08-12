"""The background body of an evaluation: execute, grade, persist, report.

One job = one ``asyncio`` task, started by ``POST /evaluations`` after the row
has been written as ``pending``, and observable through
:mod:`promptatron.evals.jobs`.

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
from contextlib import aclosing, contextmanager
from dataclasses import dataclass
from typing import Any

from sqlmodel import Session

from promptatron.config import Settings
from promptatron.configstore.client import ConfigStoreClient
from promptatron.engine.events import ErrorEvent, RunCompleteEvent, RunStartEvent
from promptatron.engine.model_factory import ModelFactory, classify_error
from promptatron.engine.runner import execute_run
from promptatron.errors import AppError
from promptatron.evals import grader, jobs
from promptatron.evals.events import (
    EvalCompleteEvent,
    EvalStartEvent,
    GradingCompletedEvent,
    GradingStartedEvent,
    RunCompletedEvent,
    RunFailedEvent,
    RunStartedEvent,
    RunSummary,
)
from promptatron.evals.jobs import EvalJob
from promptatron.evals.judge import JudgeFactory
from promptatron.evals.metrics import local_metrics
from promptatron.evals.outcomes import RunOutcome
from promptatron.evals.schemas import EvaluationRequest
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


@contextmanager
def _store():
    """A short store session bound to the process-wide engine.

    The job outlives the request that started it, so it can never borrow the
    request's ``Depends`` session -- FastAPI closes those when the endpoint
    returns.
    """
    with Session(get_engine()) as session:
        yield session


# --------------------------------------------------------------------------- #
# Executing the repeats
# --------------------------------------------------------------------------- #


async def _execute_once(index: int, request: EvaluationRequest, deps: EvalDeps) -> RunOutcome:
    """Run ``run_config`` once, consuming the engine's event stream internally."""
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
        with _store() as session:
            record = history.get_run(session, outcome.run_id)
        outcome.tool_transcript = list(record.tool_transcript or [])
        if outcome.status != "completed":
            outcome.error = outcome.error or record.error
    return outcome


def _is_throttle(outcome: RunOutcome) -> bool:
    return bool(outcome.error) and outcome.error.get("code") == THROTTLE_ERROR_CODE


async def _execute_with_retries(
    index: int, request: EvaluationRequest, deps: EvalDeps
) -> RunOutcome:
    """Execute one repeat, retrying throttled attempts with backoff."""
    outcome = await _execute_once(index, request, deps)
    for attempt, backoff in enumerate(RETRY_BACKOFF_SECONDS, start=1):
        if outcome.succeeded or not _is_throttle(outcome):
            break
        logger.info("eval run %d throttled, retrying in %.1fs", index, backoff)
        await asyncio.sleep(backoff)
        outcome = await _execute_once(index, request, deps)
        outcome.attempts = attempt + 1
    return outcome


async def _execute_batch(
    job: EvalJob, request: EvaluationRequest, deps: EvalDeps, collected: list[RunOutcome]
) -> None:
    """Execute the batch, at most :data:`MAX_CONCURRENT_RUNS` at a time.

    Finished repeats are appended to ``collected`` as they land rather than
    returned in one go: a cancellation mid-batch has to be able to persist the
    repeats that *did* complete, and the gather never returns in that case.
    """
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_RUNS)

    async def one(index: int) -> None:
        async with semaphore:
            job.emit(RunStartedEvent(index=index))
            outcome = await _execute_with_retries(index, request, deps)
        collected.append(outcome)
        _emit_run_result(job, outcome)

    await asyncio.gather(*(one(index) for index in range(request.n)))
    collected.sort(key=lambda outcome: outcome.index)


def _emit_run_result(job: EvalJob, outcome: RunOutcome) -> None:
    if outcome.succeeded:
        assert outcome.run_id is not None
        job.emit(
            RunCompletedEvent(
                index=outcome.index,
                run_id=outcome.run_id,
                status=outcome.status,
                summary=RunSummary(**outcome.summary()),
            )
        )
    else:
        job.emit(RunFailedEvent(index=outcome.index, error=outcome.error))


def _load_stored_runs(job: EvalJob, run_ids: list[str]) -> list[RunOutcome]:
    """Turn already-stored runs into outcomes (``kind="grade"``).

    Missing ids are rejected by the router before the job starts, so anything
    unreadable here is a genuine mid-flight deletion.
    """
    outcomes: list[RunOutcome] = []
    with _store() as session:
        for index, run_id in enumerate(run_ids):
            try:
                record = history.get_run(session, run_id)
            except AppError as exc:
                outcome = RunOutcome(
                    index=index,
                    run_id=run_id,
                    error={"code": exc.code, "message": exc.message, "retryable": False},
                )
                outcomes.append(outcome)
                _emit_run_result(job, outcome)
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
            _emit_run_result(job, outcome)
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


def _persist(evaluation_id: str, **fields: Any) -> None:
    with _store() as session:
        history.update_evaluation(session, evaluation_id, **fields)


# --------------------------------------------------------------------------- #
# The job body
# --------------------------------------------------------------------------- #


async def run_evaluation(
    job: EvalJob, evaluation_id: str, request: EvaluationRequest, deps: EvalDeps
) -> None:
    """Execute + grade one evaluation, reporting through ``job`` throughout."""
    outcomes: list[RunOutcome] = []
    try:
        _persist(evaluation_id, status="running")
        job.emit(
            EvalStartEvent(
                evaluation_id=evaluation_id, kind=request.kind, n=request.planned_runs
            )
        )

        if request.kind == "determinism":
            await _execute_batch(job, request, deps, outcomes)
        else:
            outcomes.extend(_load_stored_runs(job, request.run_ids))

        successes = [outcome for outcome in outcomes if outcome.succeeded]
        _persist(
            evaluation_id,
            run_ids=[outcome.run_id for outcome in successes],
            progress={
                "completed": len(successes),
                "failed": len(outcomes) - len(successes),
                "total": request.planned_runs,
            },
        )

        job.emit(GradingStartedEvent())
        judged = await grader.judge(
            successes,
            kind=request.kind,
            rubric=request.rubric,
            grader=request.grader,
            judge_factory=deps.judge_factory,
        )
        result = _build_result(outcomes, judged, request)
        job.emit(GradingCompletedEvent(result=result))

        status = "completed" if successes else "error"
        _persist(
            evaluation_id,
            status=status,
            result=result,
            error=(
                None
                if successes
                else {"code": "no_successful_runs", "message": "Every run failed"}
            ),
        )
        job.emit(EvalCompleteEvent(status=status, result=result))

    except asyncio.CancelledError:
        logger.info("evaluation %s cancelled", evaluation_id)
        successes = [outcome for outcome in outcomes if outcome.succeeded]
        # Nothing awaits from here on: the task is already cancelled, so any
        # further suspension point would re-raise before the state is saved.
        _persist(
            evaluation_id,
            status="cancelled",
            run_ids=[outcome.run_id for outcome in successes],
        )
        job.emit(EvalCompleteEvent(status="cancelled", result=None))
        raise

    except Exception as exc:
        logger.exception("evaluation %s failed", evaluation_id)
        _persist(
            evaluation_id,
            status="error",
            error={"code": "internal_error", "message": str(exc) or exc.__class__.__name__},
        )
        job.emit(EvalCompleteEvent(status="error", result=None))

    finally:
        job.close()


def start(evaluation_id: str, request: EvaluationRequest, deps: EvalDeps) -> EvalJob:
    """Register the job for ``evaluation_id`` and start it in the background."""
    job = jobs.register(evaluation_id)
    job.task = asyncio.create_task(run_evaluation(job, evaluation_id, request, deps))
    return job
