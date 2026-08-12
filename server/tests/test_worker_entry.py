"""The AgentCore entry point: envelope validation and ack-before-completion.

The cloud lane's whole shape depends on one behaviour -- the runtime
acknowledges an invocation long before the evaluation finishes, so FastAPI never
holds a connection open and reads progress from DynamoDB instead. That is what
:func:`test_dispatch_acks_before_a_slow_job_completes` pins down, with a job that
cannot possibly have finished by the time the ack is returned.
"""

from __future__ import annotations

import asyncio
import json

import pytest
from tests.fake_dynamodb import FakeDynamoDBClient

from promptatron.worker import agentcore_app, interfaces
from promptatron.worker.ddb import DynamoEvalStore

TABLE = "promptatron-config-ScenariosTable-TEST"
EVAL_ID = "0123456789abcdef0123456789abcdef"
REQUEST = {"kind": "determinism", "n": 2, "run_config": {"model_id": "m", "user_prompt": "p"}}
PAYLOAD = {"evaluation_id": EVAL_ID, "request": REQUEST}


@pytest.fixture
def client() -> FakeDynamoDBClient:
    return FakeDynamoDBClient()


@pytest.fixture
def store_factory(client: FakeDynamoDBClient):
    def factory(evaluation_id: str) -> DynamoEvalStore:
        return DynamoEvalStore(TABLE, evaluation_id, client=client)

    return factory


def meta(client: FakeDynamoDBClient, evaluation_id: str = EVAL_ID) -> dict:
    item = client.item(f"EVAL#{evaluation_id}", "META")
    assert item is not None, "META item was never written"
    return item


def collected(client: FakeDynamoDBClient, evaluation_id: str = EVAL_ID) -> list[dict]:
    return [
        json.loads(item["event"]["S"])
        for item in client.items_with_prefix(f"EVAL#{evaluation_id}", "EVENT#")
    ]


# --------------------------------------------------------------------------- #
# Payload validation
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        ("not a dict", "non-object payload"),
        ({}, "missing everything"),
        ({"request": REQUEST}, "missing evaluation_id"),
        ({"evaluation_id": EVAL_ID}, "missing request"),
        ({"evaluation_id": "", "request": REQUEST}, "empty evaluation_id"),
        ({"evaluation_id": 42, "request": REQUEST}, "non-string evaluation_id"),
        ({"evaluation_id": "EVAL#injected", "request": REQUEST}, "key-injecting id"),
        ({"evaluation_id": EVAL_ID, "request": {}}, "empty request"),
        ({"evaluation_id": EVAL_ID, "request": "nope"}, "non-object request"),
    ],
)
def test_validate_payload_rejects_bad_envelopes(payload, reason):
    with pytest.raises(interfaces.InvalidPayload):
        interfaces.validate_payload(payload)


def test_validate_payload_returns_the_id_and_request():
    evaluation_id, request = interfaces.validate_payload(PAYLOAD)
    assert evaluation_id == EVAL_ID
    assert request == REQUEST


def test_validate_payload_strips_the_execution_switch():
    """``execution`` routes the request; it is not part of the eval schema."""
    _, request = interfaces.validate_payload(
        {"evaluation_id": EVAL_ID, "request": {**REQUEST, "execution": "cloud"}}
    )
    assert "execution" not in request
    assert request == REQUEST


async def test_dispatch_rejects_a_bad_payload_without_touching_dynamodb(client, store_factory):
    response = await agentcore_app.dispatch({"nope": True}, store_factory=store_factory)

    assert response["status"] == "rejected"
    assert response["error"]["code"] == "invalid_payload"
    assert client.calls == []


async def test_dispatch_reports_an_unwritable_store(store_factory):
    def exploding(_evaluation_id: str):
        raise RuntimeError("table is gone")

    response = await agentcore_app.dispatch(PAYLOAD, store_factory=exploding)

    assert response["status"] == "rejected"
    assert response["error"]["code"] == "store_unavailable"


# --------------------------------------------------------------------------- #
# Session ids
# --------------------------------------------------------------------------- #


def test_session_id_clears_the_runtime_minimum():
    """A 32-char uuid4 hex is always one short of ``SessionType``'s ``min: 33``."""
    assert len(EVAL_ID) == 32
    session_id = interfaces.session_id_for(EVAL_ID)
    assert len(session_id) >= interfaces.SESSION_ID_MIN_LENGTH
    assert session_id.startswith(EVAL_ID)


def test_session_id_is_deterministic_and_url_safe():
    import re

    session_id = interfaces.session_id_for(EVAL_ID)
    assert session_id == interfaces.session_id_for(EVAL_ID)
    assert re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]*", session_id)
    assert len(session_id) <= 256


# --------------------------------------------------------------------------- #
# Ack-fast
# --------------------------------------------------------------------------- #


async def test_dispatch_acks_before_a_slow_job_completes(monkeypatch, client, store_factory):
    """The behaviour the whole cloud lane rests on.

    The job blocks on a gate that is not opened until *after* the ack has been
    returned and asserted on, so a dispatch that waited for the job would
    deadlock rather than merely be slow.
    """
    gate = asyncio.Event()
    finished = asyncio.Event()

    async def slow_job(evaluation_id, request, store):
        await gate.wait()
        store.emit({"type": "eval_complete", "status": "completed", "result": {"grade": "A"}})
        store.complete("completed", result={"grade": "A"})
        finished.set()

    monkeypatch.setattr(agentcore_app, "_tracked_execute", slow_job)

    response = await asyncio.wait_for(
        agentcore_app.dispatch(PAYLOAD, store_factory=store_factory), timeout=1.0
    )

    # Acknowledged, and the evaluation is visibly running while still unfinished.
    assert response == {"status": "accepted", "evaluation_id": EVAL_ID, "execution": "cloud"}
    assert meta(client)["status"] == {"S": "running"}
    assert not finished.is_set()

    gate.set()
    await asyncio.wait_for(finished.wait(), timeout=1.0)
    assert meta(client)["status"] == {"S": "completed"}


async def test_dispatch_writes_pending_then_running_before_acking(client, store_factory):
    """The ack means "state is durable", not just "message received"."""
    def discard(coro):
        coro.close()  # the job itself is not under test here

    await agentcore_app.dispatch(PAYLOAD, store_factory=store_factory, spawn=discard)

    statuses = [
        kwargs["Item"]["status"]["S"]
        for name, kwargs in client.calls
        if name == "put_item" and kwargs["Item"]["sk"]["S"] == "META"
    ]
    assert statuses == ["pending"]
    assert meta(client)["status"] == {"S": "running"}


async def test_background_task_is_strongly_referenced(client, store_factory):
    """``asyncio`` only weakly references running tasks; a lost one dies silently."""
    started = asyncio.Event()

    async def job(evaluation_id, request, store):
        started.set()
        await asyncio.sleep(0)
        store.complete("completed", result={})

    task = agentcore_app._spawn(job(EVAL_ID, REQUEST, store_factory(EVAL_ID)))
    assert task in agentcore_app._BACKGROUND_TASKS
    await task
    assert task not in agentcore_app._BACKGROUND_TASKS


# --------------------------------------------------------------------------- #
# The job body
# --------------------------------------------------------------------------- #


async def test_execute_drives_the_engine_and_writes_the_terminal_state(
    monkeypatch, client, store_factory
):
    result = {"grade": "A", "score": 0.95, "run_ids": ["run-1"]}

    async def fake_seam(*, request, emit, store, cancelled):
        assert request == REQUEST
        assert cancelled() is False
        emit({"type": "eval_start", "evaluation_id": EVAL_ID, "kind": "determinism", "n": 2})
        store.save_run({"id": "run-1", "status": "completed"})
        emit({"type": "run_completed", "index": 0, "run_id": "run-1", "status": "completed"})
        emit({"type": "eval_complete", "status": "completed", "result": result})
        return {"status": "completed", "result": result, "error": None, "run_ids": ["run-1"]}

    monkeypatch.setattr(interfaces, "load_seam", lambda: fake_seam)

    store = store_factory(EVAL_ID)
    store.begin(REQUEST)
    store.mark_running()
    await agentcore_app.execute(EVAL_ID, REQUEST, store)

    item = meta(client)
    assert item["status"] == {"S": "completed"}
    assert json.loads(item["result"]["S"]) == result
    assert json.loads(item["run_ids"]["S"]) == ["run-1"]

    events = collected(client)
    assert [event["type"] for event in events] == [
        "eval_start",
        "run_completed",
        "eval_complete",
    ]
    assert client.item("RUN#run-1", "META") is not None


async def test_execute_short_circuits_when_cancelled_before_it_starts(
    monkeypatch, client, store_factory
):
    async def never_called(**_kwargs):  # pragma: no cover - must not run
        raise AssertionError("engine ran despite a pending cancel")

    monkeypatch.setattr(interfaces, "load_seam", lambda: never_called)

    store = store_factory(EVAL_ID)
    store.begin(REQUEST)
    store.request_cancel()
    await agentcore_app.execute(EVAL_ID, REQUEST, store)

    assert meta(client)["status"] == {"S": "cancelled"}
    assert [event["type"] for event in collected(client)] == ["eval_complete"]


async def test_execute_records_an_engine_crash_as_a_terminal_error(
    monkeypatch, client, store_factory
):
    """A detached task that raises would otherwise leave the eval at ``running``."""

    async def exploding(**_kwargs):
        raise ValueError("judge exploded")

    monkeypatch.setattr(interfaces, "load_seam", lambda: exploding)

    store = store_factory(EVAL_ID)
    store.begin(REQUEST)
    await agentcore_app.execute(EVAL_ID, REQUEST, store)  # must not raise

    item = meta(client)
    assert item["status"] == {"S": "error"}
    assert json.loads(item["error"]["S"]) == {
        "code": "internal_error",
        "message": "judge exploded",
    }
    # The reader's stream still terminates.
    assert collected(client)[-1]["type"] == "eval_complete"


async def test_execute_reports_a_missing_engine_seam(monkeypatch, client, store_factory):
    def unavailable():
        raise interfaces.EvalEngineUnavailable("execute_evaluation_with_seam is not available")

    monkeypatch.setattr(interfaces, "load_seam", unavailable)

    store = store_factory(EVAL_ID)
    store.begin(REQUEST)
    await agentcore_app.execute(EVAL_ID, REQUEST, store)

    assert json.loads(meta(client)["error"]["S"])["code"] == "eval_engine_unavailable"


async def test_execute_survives_a_dynamodb_failure_on_the_terminal_write(
    monkeypatch, client, store_factory
):
    async def exploding(**_kwargs):
        raise ValueError("boom")

    monkeypatch.setattr(interfaces, "load_seam", exploding)

    store = store_factory(EVAL_ID)
    store.begin(REQUEST)
    client.fail_on["put_item"] = RuntimeError("table gone")

    await agentcore_app.execute(EVAL_ID, REQUEST, store)  # logged, not raised


async def test_build_store_reads_the_runtime_environment(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", "some-table")
    monkeypatch.setenv("AWS_REGION", "us-west-2")

    store = agentcore_app.build_store(EVAL_ID)

    assert store.table_name == "some-table"
    assert store.evaluation_id == EVAL_ID


async def test_build_store_refuses_an_unconfigured_runtime(monkeypatch):
    monkeypatch.delenv("TABLE_NAME", raising=False)
    with pytest.raises(ValueError, match="TABLE_NAME"):
        agentcore_app.build_store(EVAL_ID)
