"""Tests for the ``/evaluations`` resource: POST, the event stream, and cancel.

Builds a standalone app around ``runs.router`` (the shared-tree convention),
points the store at a tmp_path sqlite file, and overrides both model seams --
the run model factory and the judge factory -- with scripted fakes. Nothing here
touches AWS.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlmodel import Session
from strands.types.exceptions import ModelThrottledException

from promptatron.engine.fake_model import Error, FakeModel, Text, ToolUseStep
from promptatron.errors import register_exception_handlers
from promptatron.evals import engine as evals_engine
from promptatron.evals import jobs as evals_jobs
from promptatron.evals.judge import FakeJudgeModel, get_judge_factory
from promptatron.routers import runs
from promptatron.store import db, history

STABLE_ANSWER = "Order B456 is delayed; escalate to the carrier."


class ScriptedModels:
    """A run-model factory that hands out a *fresh* ``FakeModel`` per attempt.

    Each repetition of a determinism batch is a separate agent invocation, so
    every attempt needs its own model instance (a ``FakeModel``'s script is
    consumed as it plays). ``rules`` maps a 1-based call number onto a script,
    which is what lets a test say "the first two model calls throttle".
    """

    def __init__(self) -> None:
        self.default: list[Any] = [Text(STABLE_ANSWER)]
        self.rules: dict[int, list[Any]] = {}
        self.created: list[FakeModel] = []

    def __call__(self, _request) -> FakeModel:
        script = self.rules.get(len(self.created) + 1, self.default)
        model = FakeModel(script=list(script))
        self.created.append(model)
        return model

    @property
    def call_count(self) -> int:
        return len(self.created)


class GatedModels(ScriptedModels):
    """Models that block mid-stream until the test opens the gate."""

    def __init__(self) -> None:
        super().__init__()
        self.gate = asyncio.Event()
        self.started = asyncio.Event()

    def __call__(self, _request) -> FakeModel:
        model = super().__call__(_request)
        inner_stream = model.stream

        def gated(*args, **kwargs):
            events = inner_stream(*args, **kwargs)

            async def wait_then_stream():
                self.started.set()
                await self.gate.wait()
                async for event in events:
                    yield event

            return wait_then_stream()

        model.stream = gated  # type: ignore[method-assign]
        return model


@pytest.fixture
def initialized_db(tmp_path):
    return db.init_db(str(tmp_path / "evals.db"))


@pytest.fixture(autouse=True)
def clean_job_registry():
    evals_jobs.clear()
    yield
    evals_jobs.clear()


@pytest.fixture(autouse=True)
def instant_retries(monkeypatch):
    """Throttle backoff, minus the waiting."""
    monkeypatch.setattr(evals_engine, "RETRY_BACKOFF_SECONDS", (0.0, 0.0))


@pytest.fixture
def models() -> ScriptedModels:
    return ScriptedModels()


@pytest.fixture
def judge_model() -> FakeJudgeModel:
    return FakeJudgeModel()


@pytest.fixture
def app(initialized_db, models, judge_model) -> FastAPI:
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(runs.router, prefix="/api/v1")
    application.dependency_overrides[runs.get_model_factory] = lambda: models
    application.dependency_overrides[get_judge_factory] = lambda: (lambda _id: judge_model)
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


def determinism_body(**overrides) -> dict:
    payload: dict[str, Any] = {
        "kind": "determinism",
        "n": 4,
        "run_config": {
            "model_id": "anthropic.claude-3-sonnet",
            "user_prompt": "Assess order B456",
        },
    }
    payload.update(overrides)
    return payload


async def wait_for_terminal(client: httpx.AsyncClient, evaluation_id: str) -> dict:
    """Poll the detail route until the evaluation stops being pending/running."""
    for _ in range(200):
        response = await client.get(f"/api/v1/evaluations/{evaluation_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] not in ("pending", "running"):
            return payload
        await asyncio.sleep(0)
    raise AssertionError("evaluation never reached a terminal status")


async def read_events(client: httpx.AsyncClient, evaluation_id: str) -> list[dict]:
    async with client.stream("GET", f"/api/v1/evaluations/{evaluation_id}/events") as response:
        assert response.status_code == 200
        assert "application/x-ndjson" in response.headers["content-type"]
        return [json.loads(line) async for line in response.aiter_lines() if line]


def stored_run(run_id: str):
    with Session(db.get_engine()) as session:
        return history.get_run(session, run_id)


# --------------------------------------------------------------------------- #
# Determinism, end to end
# --------------------------------------------------------------------------- #


async def test_determinism_runs_n_times_and_completes(client, models, judge_model):
    accepted = await client.post("/api/v1/evaluations", json=determinism_body())

    assert accepted.status_code == 202
    created = accepted.json()
    assert created["status"] == "pending"
    assert created["kind"] == "determinism"

    finished = await wait_for_terminal(client, created["id"])

    assert finished["status"] == "completed"
    assert len(finished["run_ids"]) == 4
    assert models.call_count == 4
    assert {stored_run(run_id).status for run_id in finished["run_ids"]} == {"completed"}

    result = finished["result"]
    assert result["grade"] == "A"
    assert result["score"] == 95
    assert result["run_ids"] == finished["run_ids"]
    assert result["failed_runs"] == []
    assert result["judge"] == {
        "model_id": "amazon.nova-pro-v1:0",
        "system_prompt_used": False,
        "rubric_used": False,
    }

    metrics = result["metrics"]
    assert metrics["runs_analyzed"] == 4
    assert metrics["exact_match_count"] == 4
    assert metrics["unique_outputs"] == 1
    assert metrics["output_length_variance"] == 0.0
    assert metrics["tool_sequence_consistency"] == 1.0
    assert metrics["judge_overall_score"] == pytest.approx(0.95)
    assert len(judge_model.calls) == 4


async def test_n_is_clamped_into_the_supported_range(client):
    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=99))
    finished = await wait_for_terminal(client, accepted.json()["id"])

    assert finished["config"]["n"] == 25
    assert len(finished["run_ids"]) == 25


async def test_custom_grader_prompt_and_rubric_reach_the_judge(client, judge_model):
    accepted = await client.post(
        "/api/v1/evaluations",
        json=determinism_body(
            n=2,
            rubric="RUBRIC-SENTINEL: only tool calls matter",
            grader={"model_id": "amazon.nova-pro-v1:0", "system_prompt": "SYSTEM-SENTINEL"},
        ),
    )
    finished = await wait_for_terminal(client, accepted.json()["id"])

    assert finished["status"] == "completed"
    assert set(judge_model.system_prompts) == {"SYSTEM-SENTINEL"}
    assert all("RUBRIC-SENTINEL" in prompt for prompt in judge_model.prompts)
    assert finished["result"]["judge"]["system_prompt_used"] is True
    assert finished["result"]["judge"]["rubric_used"] is True


async def test_tool_runs_are_graded_for_tool_consistency(client, models, judge_model):
    models.default = [
        Text("Checking. "),
        ToolUseStep("getCarrierStatus", {"order_id": "B456"}),
        Text("Delayed."),
    ]

    accepted = await client.post(
        "/api/v1/evaluations",
        json=determinism_body(
            n=2,
            run_config={
                "model_id": "anthropic.claude-3-sonnet",
                "user_prompt": "Assess order B456",
                "scenario_id": "shipping-logistics",
                "tools_enabled": True,
            },
        ),
    )
    finished = await wait_for_terminal(client, accepted.json()["id"])

    metrics = finished["result"]["metrics"]
    assert metrics["tool_sequence_consistency"] == 1.0
    assert metrics["modal_tool_sequence"] == ['getCarrierStatus({"order_id": "B456"})']
    assert "tool_consistency_judge_score" in metrics
    # Output judge + trajectory judge, for each of the two runs.
    assert len(judge_model.calls) == 4


# --------------------------------------------------------------------------- #
# Retries and failures
# --------------------------------------------------------------------------- #


async def test_throttled_runs_are_retried_and_still_count(client, models):
    models.rules = {
        1: [Error(ModelThrottledException("slow down"))],
        2: [Error(ModelThrottledException("slow down"))],
    }

    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=2))
    finished = await wait_for_terminal(client, accepted.json()["id"])

    assert finished["status"] == "completed"
    assert len(finished["run_ids"]) == 2
    assert finished["result"]["failed_runs"] == []
    assert models.call_count == 4  # two throttled attempts, two successful ones


async def test_a_run_that_keeps_throttling_is_reported_as_failed(client, models):
    models.default = [Error(ModelThrottledException("slow down"))]

    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=2))
    finished = await wait_for_terminal(client, accepted.json()["id"])

    # Two repeats x three attempts each (the initial one plus two retries).
    assert models.call_count == 6
    assert finished["status"] == "error"
    assert finished["run_ids"] == []
    assert len(finished["result"]["failed_runs"]) == 2
    assert finished["result"]["failed_runs"][0]["error"]["code"] == "model_throttled"


async def test_a_permanently_failed_run_is_excluded_but_the_eval_completes(client, models):
    models.rules = {1: [Text("partial "), Error(RuntimeError("kaboom"))]}

    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=2))
    finished = await wait_for_terminal(client, accepted.json()["id"])

    assert finished["status"] == "completed"
    assert len(finished["run_ids"]) == 1
    assert models.call_count == 2  # a non-throttle failure is not retried

    failed = finished["result"]["failed_runs"]
    assert len(failed) == 1
    assert failed[0]["error"]["code"] == "internal_error"
    assert "kaboom" in failed[0]["error"]["message"]
    # Only the surviving run was graded.
    assert finished["result"]["metrics"]["runs_analyzed"] == 1


async def test_judge_failure_still_completes_with_local_metrics(app, client, models):
    def broken_judge(_model_id):
        raise RuntimeError("judge unavailable")

    app.dependency_overrides[get_judge_factory] = lambda: broken_judge

    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=2))
    finished = await wait_for_terminal(client, accepted.json()["id"])

    assert finished["status"] == "completed"
    result = finished["result"]
    assert result["grade"] is None
    assert result["score"] is None
    assert result["judge_error"] == "judge unavailable"
    assert result["metrics"]["exact_match_count"] == 2
    assert result["metrics"]["unique_outputs"] == 1


# --------------------------------------------------------------------------- #
# The event stream
# --------------------------------------------------------------------------- #


async def test_a_mid_run_subscriber_sees_the_whole_event_sequence(client):
    accepted = await client.post("/api/v1/evaluations", json=determinism_body())
    evaluation_id = accepted.json()["id"]

    # Let the first repeats land before subscribing: the replay must cover them.
    for _ in range(3):
        await asyncio.sleep(0)

    events = await read_events(client, evaluation_id)
    kinds = [event["type"] for event in events]

    assert kinds[0] == "eval_start"
    assert kinds[-1] == "eval_complete"
    assert kinds.count("run_started") == 4
    assert kinds.count("run_completed") == 4
    assert kinds.count("grading_started") == 1
    assert kinds.count("grading_completed") == 1

    start = events[0]
    assert start == {"type": "eval_start", "evaluation_id": evaluation_id, "kind": "determinism", "n": 4}

    completed = [event for event in events if event["type"] == "run_completed"]
    assert sorted(event["index"] for event in completed) == [0, 1, 2, 3]
    assert all(event["status"] == "completed" for event in completed)
    summary = completed[0]["summary"]
    assert summary["output_chars"] == len(STABLE_ANSWER)
    assert summary["tool_calls"] == 0
    assert set(summary) == {"output_chars", "tool_calls", "duration_ms"}

    assert events[-1]["status"] == "completed"
    assert events[-1]["result"]["grade"] == "A"


async def test_a_late_subscriber_replays_a_finished_evaluation_then_hits_eof(client):
    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=2))
    evaluation_id = accepted.json()["id"]
    await wait_for_terminal(client, evaluation_id)

    first = await read_events(client, evaluation_id)
    second = await read_events(client, evaluation_id)

    assert [event["type"] for event in first][0] == "eval_start"
    assert [event["type"] for event in first][-1] == "eval_complete"
    assert first == second  # replay is idempotent, and each one terminates


async def test_events_for_an_evaluation_whose_job_is_gone_are_synthesized(client):
    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=2))
    evaluation_id = accepted.json()["id"]
    finished = await wait_for_terminal(client, evaluation_id)

    evals_jobs.clear()  # what a process restart looks like
    events = await read_events(client, evaluation_id)

    assert [event["type"] for event in events] == ["eval_complete"]
    assert events[0]["status"] == "completed"
    assert events[0]["result"] == finished["result"]


async def test_events_for_an_unknown_evaluation_are_a_404(client):
    response = await client.get("/api/v1/evaluations/nope/events")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# --------------------------------------------------------------------------- #
# Cancellation
# --------------------------------------------------------------------------- #


async def test_cancel_mid_run_stops_the_batch(app, client, judge_model):
    gated = GatedModels()
    app.dependency_overrides[runs.get_model_factory] = lambda: gated

    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=8))
    evaluation_id = accepted.json()["id"]
    await asyncio.wait_for(gated.started.wait(), timeout=5)

    cancelled = await client.delete(f"/api/v1/evaluations/{evaluation_id}")
    assert cancelled.status_code == 204

    detail = await client.get(f"/api/v1/evaluations/{evaluation_id}")
    assert detail.json()["status"] == "cancelled"

    events = await read_events(client, evaluation_id)
    kinds = [event["type"] for event in events]
    assert kinds[-1] == "eval_complete"
    assert events[-1]["status"] == "cancelled"
    assert events[-1]["result"] is None
    # Only the concurrency window ever started, and nothing started afterwards.
    assert kinds.count("run_started") <= evals_engine.MAX_CONCURRENT_RUNS
    assert "grading_started" not in kinds
    assert kinds.index("eval_complete") == len(kinds) - 1

    gated.gate.set()


async def test_cancelling_a_finished_evaluation_is_a_409(client):
    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=2))
    evaluation_id = accepted.json()["id"]
    await wait_for_terminal(client, evaluation_id)

    conflict = await client.delete(f"/api/v1/evaluations/{evaluation_id}")

    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "conflict"
    assert conflict.json()["error"]["detail"]["status"] == "completed"


async def test_cancelling_an_unknown_evaluation_is_a_404(client):
    response = await client.delete("/api/v1/evaluations/nope")

    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# kind="grade"
# --------------------------------------------------------------------------- #


def store_run(output: str, status: str = "completed") -> str:
    with Session(db.get_engine()) as session:
        record = history.create_run(
            session,
            model_id="anthropic.claude-3-sonnet",
            system_prompt="",
            user_prompt="Assess order B456",
            output=output,
            status=status,
        )
    return record.id


async def test_grading_stored_runs(client, models, judge_model):
    run_ids = [store_run("first answer"), store_run("second answer")]

    accepted = await client.post(
        "/api/v1/evaluations", json={"kind": "grade", "run_ids": run_ids}
    )
    assert accepted.status_code == 202
    finished = await wait_for_terminal(client, accepted.json()["id"])

    assert finished["status"] == "completed"
    assert finished["run_ids"] == run_ids
    assert finished["result"]["grade"] == "A"
    assert finished["result"]["metrics"]["runs_analyzed"] == 2
    assert len(judge_model.calls) == 2
    assert models.call_count == 0  # grading never executes a model run


async def test_grading_reports_progress_events_for_each_stored_run(client):
    run_ids = [store_run("first answer"), store_run("second answer")]

    accepted = await client.post(
        "/api/v1/evaluations", json={"kind": "grade", "run_ids": run_ids}
    )
    evaluation_id = accepted.json()["id"]
    await wait_for_terminal(client, evaluation_id)

    events = await read_events(client, evaluation_id)
    kinds = [event["type"] for event in events]

    assert kinds[0] == "eval_start"
    assert events[0]["n"] == 2
    assert kinds.count("run_completed") == 2
    assert kinds[-1] == "eval_complete"


async def test_grading_a_missing_run_is_a_404(client):
    existing = store_run("first answer")

    response = await client.post(
        "/api/v1/evaluations", json={"kind": "grade", "run_ids": [existing, "missing"]}
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_a_stored_run_that_failed_is_excluded_from_grading(client):
    run_ids = [store_run("good answer"), store_run("", status="error")]

    accepted = await client.post(
        "/api/v1/evaluations", json={"kind": "grade", "run_ids": run_ids}
    )
    finished = await wait_for_terminal(client, accepted.json()["id"])

    assert finished["status"] == "completed"
    assert finished["result"]["run_ids"] == [run_ids[0]]
    assert [failed["index"] for failed in finished["result"]["failed_runs"]] == [1]


# --------------------------------------------------------------------------- #
# Request validation
# --------------------------------------------------------------------------- #


async def test_determinism_without_a_run_config_is_a_400(client):
    response = await client.post("/api/v1/evaluations", json={"kind": "determinism", "n": 3})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_request"


async def test_grade_without_run_ids_is_a_400(client):
    response = await client.post("/api/v1/evaluations", json={"kind": "grade"})

    assert response.status_code == 400


async def test_an_unknown_kind_is_a_422(client):
    response = await client.post("/api/v1/evaluations", json={"kind": "vibes"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_evaluations_appear_in_the_history_listing(client):
    accepted = await client.post("/api/v1/evaluations", json=determinism_body(n=2))
    await wait_for_terminal(client, accepted.json()["id"])

    listing = await client.get("/api/v1/evaluations?kind=determinism")

    assert [item["id"] for item in listing.json()["items"]] == [accepted.json()["id"]]
