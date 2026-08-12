"""Tests for the emitter/store seam the two evaluation lanes share.

The point of the seam is that the local lane is *nothing but* an adapter over
:func:`promptatron.evals.engine.execute_evaluation_with_seam`, so most of these
tests are equivalence tests: drive the core directly with recording doubles,
drive the local lane through its real job + SQLite adapter, and assert the two
produce the same events, in the same order, with the same persistence calls.
"""

import asyncio
from typing import Any

import pytest
from sqlmodel import Session

from promptatron.config import Settings
from promptatron.engine.fake_model import FakeModel, Text
from promptatron.errors import NotFoundError
from promptatron.evals import engine as evals_engine
from promptatron.evals import jobs as evals_jobs
from promptatron.evals.judge import FakeJudgeModel
from promptatron.evals.schemas import EvaluationRequest
from promptatron.store import db, history

ANSWER = "Order B456 is delayed; escalate to the carrier."


@pytest.fixture
def initialized_db(tmp_path):
    return db.init_db(str(tmp_path / "seam.db"))


@pytest.fixture(autouse=True)
def instant_retries(monkeypatch):
    monkeypatch.setattr(evals_engine, "RETRY_BACKOFF_SECONDS", (0.0, 0.0))


def models(_request) -> FakeModel:
    return FakeModel(script=[Text(ANSWER)])


def deps() -> evals_engine.EvalDeps:
    return evals_engine.EvalDeps(
        settings=Settings(),
        model_factory=models,
        judge_factory=lambda _model_id: FakeJudgeModel(),
    )


def determinism(n: int = 3) -> EvaluationRequest:
    return EvaluationRequest.model_validate(
        {
            "kind": "determinism",
            "n": n,
            "run_config": {"model_id": "anthropic.claude-3-sonnet", "user_prompt": "Assess B456"},
        }
    )


class RecordingStore:
    """An :class:`~promptatron.evals.engine.EvalStore` that remembers everything.

    ``load_run`` still delegates to SQLite -- that is where ``execute_run``
    wrote the row -- which is exactly the split the cloud worker's store has,
    only with DynamoDB on the far side of ``save_run``.
    """

    def __init__(self, evaluation_id: str = "eval-seam") -> None:
        self.evaluation_id = evaluation_id
        self.saved_evaluations: list[dict[str, Any]] = []
        self.saved_runs: list[str] = []
        self._sqlite = evals_engine.SqliteEvalStore(evaluation_id)

    def save_evaluation(self, **fields: Any) -> None:
        self.saved_evaluations.append(fields)

    def load_run(self, run_id: str) -> history.RunRecord:
        return self._sqlite.load_run(run_id)

    def save_run(self, run_id: str) -> None:
        self.saved_runs.append(run_id)


class Recorder:
    """An ``emit`` that keeps every event dict, plus a scriptable ``cancelled``."""

    def __init__(self, cancel_after: int | None = None) -> None:
        self.events: list[dict[str, Any]] = []
        self.cancel_after = cancel_after
        self.store: RecordingStore | None = None

    def emit(self, entry: dict[str, Any]) -> None:
        self.events.append(entry)

    def cancelled(self) -> bool:
        if self.cancel_after is None:
            return False
        completed = [event for event in self.events if event["type"] == "run_completed"]
        return len(completed) >= self.cancel_after

    @property
    def types(self) -> list[str]:
        return [event["type"] for event in self.events]


def normalized(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Events with the run-to-run varying bits (ids, timings) blanked out."""
    shaped: list[dict[str, Any]] = []
    for event in events:
        copy = dict(event)
        copy.pop("evaluation_id", None)
        if "run_id" in copy:
            copy["run_id"] = "<run>"
        if "summary" in copy:
            copy["summary"] = {**copy["summary"], "duration_ms": 0}
        if copy["type"] in ("grading_completed", "eval_complete") and copy.get("result"):
            result = dict(copy["result"])
            result["run_ids"] = ["<run>"] * len(result["run_ids"])
            metrics = dict(result["metrics"])
            metrics.pop("mean_latency_ms", None)
            metrics.pop("latency_variance", None)
            result["metrics"] = metrics
            copy["result"] = result
        shaped.append(copy)
    return shaped


# --------------------------------------------------------------------------- #
# The core, driven directly
# --------------------------------------------------------------------------- #


async def test_the_seam_runs_and_grades_a_determinism_batch(initialized_db):
    recorder = Recorder()
    store = RecordingStore()

    terminal = await evals_engine.execute_evaluation_with_seam(
        determinism(3), recorder.emit, store, recorder.cancelled, deps=deps()
    )

    assert terminal["status"] == "completed"
    assert terminal["evaluation_id"] == "eval-seam"
    assert len(terminal["run_ids"]) == 3
    assert terminal["error"] is None
    assert terminal["result"]["metrics"]["runs_analyzed"] == 3
    assert terminal["result"]["metrics"]["unique_outputs"] == 1

    assert recorder.types[0] == "eval_start"
    assert recorder.types[-1] == "eval_complete"
    assert recorder.types.count("run_started") == 3
    assert recorder.types.count("run_completed") == 3
    assert recorder.types.count("grading_started") == 1
    assert recorder.events[0] == {
        "type": "eval_start",
        "evaluation_id": "eval-seam",
        "kind": "determinism",
        "n": 3,
    }


async def test_the_seam_takes_its_evaluation_id_from_the_store(initialized_db):
    """The worker calls this with four positional arguments and nothing else."""
    recorder = Recorder()
    store = RecordingStore("eval-from-store")

    terminal = await evals_engine.execute_evaluation_with_seam(
        determinism(2), recorder.emit, store, recorder.cancelled, deps=deps()
    )

    assert terminal["evaluation_id"] == "eval-from-store"
    assert recorder.events[0]["evaluation_id"] == "eval-from-store"


async def test_every_finished_run_is_saved_before_its_run_completed_event(initialized_db):
    """The contract's writer rule: the ``RUN#`` item lands first."""
    recorder = Recorder()
    saved_at: list[int] = []

    class OrderedStore(RecordingStore):
        def save_run(self, run_id: str) -> None:
            saved_at.append(len(recorder.events))
            super().save_run(run_id)

    store = OrderedStore()
    await evals_engine.execute_evaluation_with_seam(
        determinism(3), recorder.emit, store, recorder.cancelled, deps=deps()
    )

    assert len(store.saved_runs) == 3
    completed_at = [
        index for index, event in enumerate(recorder.events) if event["type"] == "run_completed"
    ]
    assert saved_at == completed_at  # each save is immediately before its event


async def test_the_store_sees_the_expected_evaluation_updates(initialized_db):
    recorder = Recorder()
    store = RecordingStore()

    await evals_engine.execute_evaluation_with_seam(
        determinism(2), recorder.emit, store, recorder.cancelled, deps=deps()
    )

    assert store.saved_evaluations[0] == {"status": "running"}
    assert store.saved_evaluations[1]["progress"] == {"completed": 2, "failed": 0, "total": 2}
    assert len(store.saved_evaluations[1]["run_ids"]) == 2
    assert store.saved_evaluations[-1]["status"] == "completed"
    assert store.saved_evaluations[-1]["error"] is None


async def test_a_cooperative_cancellation_settles_without_grading(initialized_db):
    """``cancelled()`` before grading is as terminal as an asyncio cancel."""
    recorder = Recorder(cancel_after=1)
    store = RecordingStore()

    terminal = await evals_engine.execute_evaluation_with_seam(
        determinism(2), recorder.emit, store, recorder.cancelled, deps=deps()
    )

    assert terminal["status"] == "cancelled"
    assert terminal["result"] is None
    assert "grading_started" not in recorder.types
    assert recorder.types[-1] == "eval_complete"
    assert recorder.events[-1]["status"] == "cancelled"
    assert store.saved_evaluations[-1]["status"] == "cancelled"


async def test_a_cancellation_between_runs_stops_starting_new_ones(initialized_db):
    """A repeat that finds the flag set never emits ``run_started``."""
    recorder = Recorder(cancel_after=1)
    store = RecordingStore()

    await evals_engine.execute_evaluation_with_seam(
        determinism(8), recorder.emit, store, recorder.cancelled, deps=deps()
    )

    # The MAX_CONCURRENT_RUNS window is already in flight when the flag flips.
    assert recorder.types.count("run_started") <= evals_engine.MAX_CONCURRENT_RUNS
    assert recorder.types[-1] == "eval_complete"


async def test_a_store_failure_becomes_an_error_evaluation(initialized_db):
    recorder = Recorder()

    class BrokenStore(RecordingStore):
        def save_evaluation(self, **fields: Any) -> None:
            super().save_evaluation(**fields)
            if fields.get("status") == "running":
                raise RuntimeError("table gone")

    terminal = await evals_engine.execute_evaluation_with_seam(
        determinism(2), recorder.emit, BrokenStore(), recorder.cancelled, deps=deps()
    )

    assert terminal["status"] == "error"
    assert terminal["error"]["code"] == "internal_error"
    assert "table gone" in terminal["error"]["message"]
    assert recorder.types == ["eval_complete"]


async def test_grade_kind_reads_its_runs_through_the_store(initialized_db):
    with Session(db.get_engine()) as session:
        stored = [
            history.create_run(
                session,
                model_id="m",
                system_prompt="",
                user_prompt="Assess B456",
                output=text,
                status="completed",
            ).id
            for text in ("first answer", "second answer")
        ]

    recorder = Recorder()
    store = RecordingStore()
    request = EvaluationRequest.model_validate({"kind": "grade", "run_ids": stored})

    terminal = await evals_engine.execute_evaluation_with_seam(
        request, recorder.emit, store, recorder.cancelled, deps=deps()
    )

    assert terminal["status"] == "completed"
    assert terminal["run_ids"] == stored
    assert store.saved_runs == []  # grading re-publishes nothing
    assert recorder.types.count("run_completed") == 2


async def test_a_run_that_vanished_mid_grade_is_reported_not_raised(initialized_db):
    recorder = Recorder()

    class MissingRunStore(RecordingStore):
        def load_run(self, run_id: str) -> history.RunRecord:
            raise NotFoundError(f"Run {run_id!r} not found")

    request = EvaluationRequest.model_validate({"kind": "grade", "run_ids": ["gone"]})
    terminal = await evals_engine.execute_evaluation_with_seam(
        request, recorder.emit, MissingRunStore(), recorder.cancelled, deps=deps()
    )

    assert terminal["status"] == "error"
    assert recorder.types.count("run_failed") == 1
    assert recorder.events[1]["error"]["code"] == "not_found"


# --------------------------------------------------------------------------- #
# The local lane is a thin adapter over the same core
# --------------------------------------------------------------------------- #


async def test_the_local_lane_produces_the_same_events_as_the_raw_seam(initialized_db):
    """Equivalence: same request, same fakes, same event stream either way."""
    recorder = Recorder()
    await evals_engine.execute_evaluation_with_seam(
        determinism(3), recorder.emit, RecordingStore(), recorder.cancelled, deps=deps()
    )

    with Session(db.get_engine()) as session:
        record = history.create_evaluation(
            session, kind="determinism", run_ids=[], config={}, status="pending"
        )
    job = evals_jobs.EvalJob(record.id)
    await evals_engine.run_evaluation(job, record.id, determinism(3), deps())

    assert [event["type"] for event in job.log] == recorder.types
    assert normalized(job.log) == normalized(recorder.events)
    assert job.finished  # the adapter still closes the job


async def test_the_local_lane_persists_through_sqlite_and_closes_the_job(initialized_db):
    with Session(db.get_engine()) as session:
        record = history.create_evaluation(
            session, kind="determinism", run_ids=[], config={}, status="pending"
        )

    job = evals_jobs.EvalJob(record.id)
    await evals_engine.run_evaluation(job, record.id, determinism(2), deps())

    with Session(db.get_engine()) as session:
        stored = history.get_evaluation(session, record.id)
    assert stored.status == "completed"
    assert len(stored.run_ids) == 2
    assert stored.result["metrics"]["runs_analyzed"] == 2
    assert job.finished


async def test_an_asyncio_cancellation_still_settles_and_re_raises(initialized_db):
    """The local cancel path: persist, announce, then let the cancel propagate."""
    with Session(db.get_engine()) as session:
        record = history.create_evaluation(
            session, kind="determinism", run_ids=[], config={}, status="pending"
        )

    started = asyncio.Event()
    gate = asyncio.Event()

    def gated_models(request):
        model = models(request)
        inner = model.stream

        def gated(*args, **kwargs):
            events = inner(*args, **kwargs)

            async def wait_then_stream():
                started.set()
                await gate.wait()
                async for event in events:
                    yield event

            return wait_then_stream()

        model.stream = gated  # type: ignore[method-assign]
        return model

    gated_deps = evals_engine.EvalDeps(
        settings=Settings(),
        model_factory=gated_models,
        judge_factory=lambda _model_id: FakeJudgeModel(),
    )
    job = evals_jobs.EvalJob(record.id)
    job.task = asyncio.create_task(
        evals_engine.run_evaluation(job, record.id, determinism(6), gated_deps)
    )
    await asyncio.wait_for(started.wait(), timeout=5)

    await evals_jobs.cancel(job)

    with Session(db.get_engine()) as session:
        assert history.get_evaluation(session, record.id).status == "cancelled"
    assert [event["type"] for event in job.log][-1] == "eval_complete"
    assert job.log[-1]["status"] == "cancelled"
    assert job.task.cancelled()
    gate.set()


def test_default_deps_uses_the_settings_it_is_given():
    built = evals_engine.default_deps(Settings(fake_model=True))

    assert built.settings.fake_model is True
    assert isinstance(built.judge_factory("amazon.nova-pro-v1:0"), FakeJudgeModel)


# --------------------------------------------------------------------------- #
# The cloud worker's calling convention
# --------------------------------------------------------------------------- #


class HostOwnedStore(RecordingStore):
    """A store bound to its own id, the way the worker's DynamoEvalStore is."""

    def __init__(self, evaluation_id: str = "eval-cloud") -> None:
        super().__init__(evaluation_id)


async def test_the_seam_accepts_the_workers_call_shape(initialized_db, monkeypatch):
    """Keyword arguments, a plain-dict request, and a store with no eval record."""
    monkeypatch.setattr(evals_engine, "default_deps", deps)
    recorder = Recorder()
    store = HostOwnedStore()

    terminal = await evals_engine.execute_evaluation_with_seam(
        request={
            "kind": "determinism",
            "n": 2,
            "run_config": {"model_id": "m", "user_prompt": "Assess B456"},
        },
        emit=recorder.emit,
        store=store,
        cancelled=lambda: False,
    )

    assert terminal["status"] == "completed"
    assert terminal["evaluation_id"] == "eval-cloud"
    assert len(terminal["run_ids"]) == 2
    assert len(store.saved_runs) == 2
    assert recorder.types[-1] == "eval_complete"


async def test_the_seam_matches_the_workers_outcome_envelope(initialized_db, monkeypatch):
    """What comes back is what ``interfaces.normalize_outcome`` expects."""
    from promptatron.worker import interfaces

    monkeypatch.setattr(evals_engine, "default_deps", deps)
    recorder = Recorder()
    store = HostOwnedStore()

    terminal = await evals_engine.execute_evaluation_with_seam(
        request=determinism(2).model_dump(),
        emit=recorder.emit,
        store=store,
        cancelled=lambda: False,
    )
    normalized_outcome = interfaces.normalize_outcome(terminal)

    assert normalized_outcome["status"] == terminal["status"] == "completed"
    assert normalized_outcome["result"] == terminal["result"]
    assert normalized_outcome["run_ids"] == terminal["run_ids"]
    assert normalized_outcome["error"] is None


async def test_an_invalid_request_dict_is_an_error_outcome(initialized_db, monkeypatch):
    """Validation is the engine's, and a bad body is a terminal state, not a raise."""
    monkeypatch.setattr(evals_engine, "default_deps", deps)
    recorder = Recorder()

    terminal = await evals_engine.execute_evaluation_with_seam(
        request={"kind": "determinism"},  # no run_config
        emit=recorder.emit,
        store=HostOwnedStore(),
        cancelled=lambda: False,
    )

    assert terminal["status"] == "error"
    assert terminal["error"]["code"] == "internal_error"
    assert recorder.types == ["eval_complete"]
