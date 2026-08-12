"""The cloud lane's DynamoDB writer, against the item contract.

Every assertion here traces back to a line in ``docs/cloud-evals.md``: these
tests are the executable form of that contract's "writer rules" section, and the
FastAPI reader is built against the same document. Where a rule is enforced
structurally (a single atomic write rather than two), the test asserts on the
*shape of the calls*, not just the end state -- the end state is identical either
way, and the race only shows up in the ordering.
"""

from __future__ import annotations

import json

import pytest

from promptatron.worker.ddb import (
    CANCEL_SK,
    GSI1_EVAL_PK,
    GSI1_RUN_PK,
    TTL_ATTRIBUTE,
    TTL_DAYS,
    DynamoEvalStore,
    event_sk,
    unwrap,
)
from tests.fake_dynamodb import FakeDynamoDBClient

TABLE = "promptatron-config-ScenariosTable-TEST"
EVAL_ID = "0123456789abcdef0123456789abcdef"
FIXED_NOW = 1_700_000_000.0

REQUEST = {
    "kind": "determinism",
    "n": 3,
    "rubric": "be consistent",
    "grader": {"model_id": "judge-model", "system_prompt": None},
    "run_config": {"model_id": "some-model", "user_prompt": "hi"},
}


@pytest.fixture
def client() -> FakeDynamoDBClient:
    return FakeDynamoDBClient()


@pytest.fixture
def store(client: FakeDynamoDBClient) -> DynamoEvalStore:
    return DynamoEvalStore(TABLE, EVAL_ID, client=client, clock=lambda: FIXED_NOW)


def meta(client: FakeDynamoDBClient) -> dict:
    item = client.item(f"EVAL#{EVAL_ID}", "META")
    assert item is not None, "META item was never written"
    return item


# --------------------------------------------------------------------------- #
# Meta lifecycle
# --------------------------------------------------------------------------- #


def test_begin_writes_pending_meta_with_gsi1_and_ttl(store, client):
    store.begin(REQUEST)

    item = meta(client)
    assert item["pk"] == {"S": f"EVAL#{EVAL_ID}"}
    assert item["sk"] == {"S": "META"}
    assert item["id"] == {"S": EVAL_ID}
    assert item["status"] == {"S": "pending"}
    assert item["kind"] == {"S": "determinism"}
    assert json.loads(item["config"]["S"]) == REQUEST
    assert json.loads(item["run_ids"]["S"]) == []
    assert item["result"] == {"NULL": True}
    assert item["error"] == {"NULL": True}
    assert item["seq_count"] == {"N": "0"}

    # GSI1 projects evaluations into one partition ordered by ts, which is how
    # `GET /evaluations?execution=cloud` lists them.
    assert item["GSI1PK"] == {"S": GSI1_EVAL_PK}
    assert item["GSI1SK"] == item["ts"]


def test_every_item_carries_a_ninety_day_ttl(store, client):
    store.begin(REQUEST)
    store.emit({"type": "eval_start", "evaluation_id": EVAL_ID, "kind": "determinism", "n": 3})
    store.put_run({"id": "run-1", "status": "completed"})
    store.request_cancel()

    expected = int(FIXED_NOW) + TTL_DAYS * 24 * 60 * 60
    written = [kwargs["Item"] for name, kwargs in client.calls if name == "put_item"]
    assert written, "expected at least one put_item"
    for item in written:
        assert item[TTL_ATTRIBUTE] == {"N": str(expected)}


def test_begin_leaves_an_existing_meta_alone(store, client):
    """The server may have written ``pending`` already; whoever is first wins."""
    store.begin(REQUEST)
    client.items[(f"EVAL#{EVAL_ID}", "META")]["status"] = {"S": "running"}

    second = DynamoEvalStore(TABLE, EVAL_ID, client=client, clock=lambda: FIXED_NOW)
    second.begin(REQUEST)  # must not raise, must not clobber

    assert meta(client)["status"] == {"S": "running"}


def test_mark_running_transitions_from_pending(store, client):
    store.begin(REQUEST)
    store.mark_running()
    assert meta(client)["status"] == {"S": "running"}


def test_mark_running_will_not_resurrect_a_terminal_evaluation(store, client):
    """A duplicate invoke must not drag a finished evaluation back to running."""
    store.begin(REQUEST)
    store.mark_running()
    store.complete("completed", result={"grade": "A"})

    replay = DynamoEvalStore(TABLE, EVAL_ID, client=client, clock=lambda: FIXED_NOW)
    replay.mark_running()  # condition fails; swallowed

    assert meta(client)["status"] == {"S": "completed"}


@pytest.mark.parametrize("status", ["completed", "error", "cancelled"])
def test_complete_accepts_each_terminal_status(store, client, status):
    store.begin(REQUEST)
    store.mark_running()
    store.complete(status, result={"grade": "B"} if status == "completed" else None)
    assert meta(client)["status"] == {"S": status}


def test_complete_rejects_a_non_terminal_status(store):
    store.begin(REQUEST)
    with pytest.raises(ValueError, match="not a terminal status"):
        store.complete("running")


# --------------------------------------------------------------------------- #
# save_evaluation -- the EvalStore hook the engine drives
# --------------------------------------------------------------------------- #


def test_save_evaluation_writes_non_terminal_fields_immediately(store, client):
    store.begin(REQUEST)
    store.save_evaluation(status="running")
    assert meta(client)["status"] == {"S": "running"}

    store.save_evaluation(
        run_ids=["run-1", "run-2"],
        progress={"completed": 2, "failed": 0, "total": 3},
    )
    item = meta(client)
    assert json.loads(item["run_ids"]["S"]) == ["run-1", "run-2"]
    assert json.loads(item["progress"]["S"]) == {"completed": 2, "failed": 0, "total": 3}
    # Still mid-flight.
    assert item["status"] == {"S": "running"}


def test_save_evaluation_rejects_an_unknown_status(store):
    store.begin(REQUEST)
    with pytest.raises(ValueError, match="unknown evaluation status"):
        store.save_evaluation(status="halfway")


def test_a_terminal_save_evaluation_is_buffered_until_eval_complete_lands(store, client):
    """The engine settles the row *then* publishes; the store reorders the two.

    Written straight through, the terminal status would become visible before
    the ``eval_complete`` line existed -- and a reader that stops polling on
    terminal status would truncate the stream.
    """
    store.begin(REQUEST)
    result = {"grade": "A", "run_ids": ["run-1"]}

    store.save_evaluation(status="completed", result=result, error=None)

    # Nothing terminal is visible yet.
    assert meta(client)["status"] == {"S": "pending"}

    store.emit({"type": "eval_complete", "status": "completed", "result": result})

    item = meta(client)
    assert item["status"] == {"S": "completed"}
    assert json.loads(item["result"]["S"]) == result
    events = client.items_with_prefix(f"EVAL#{EVAL_ID}", "EVENT#")
    assert json.loads(events[-1]["event"]["S"])["type"] == "eval_complete"


def test_finalize_settles_an_engine_that_never_published(store, client):
    """An engine that saved the row and then died still terminates the stream."""
    store.begin(REQUEST)
    store.save_evaluation(status="error", error={"code": "internal_error", "message": "boom"})

    assert store.finalize() is True

    item = meta(client)
    assert item["status"] == {"S": "error"}
    assert json.loads(item["error"]["S"])["code"] == "internal_error"
    assert json.loads(
        client.items_with_prefix(f"EVAL#{EVAL_ID}", "EVENT#")[-1]["event"]["S"]
    )["type"] == "eval_complete"


def test_finalize_is_a_no_op_with_nothing_buffered(store):
    store.begin(REQUEST)
    assert store.finalize() is False


def test_finalize_is_idempotent(store, client):
    store.begin(REQUEST)
    store.save_evaluation(status="completed", result={"grade": "A"})
    assert store.finalize() is True
    assert store.finalize() is False


def test_save_evaluation_after_terminal_is_refused(store):
    store.begin(REQUEST)
    store.complete("completed", result={})
    with pytest.raises(RuntimeError, match="already terminal"):
        store.save_evaluation(status="running")


def test_complete_is_a_single_write_so_terminal_status_never_precedes_the_result(store, client):
    """The contract's core reader guarantee, enforced by atomicity.

    ``status``, ``result``, ``error`` and ``run_ids`` land in one ``UpdateItem``,
    so no reader can observe a terminal status next to a missing result.
    """
    store.begin(REQUEST)
    store.mark_running()
    store.put_run({"id": "run-a", "status": "completed"})
    client.calls.clear()

    result = {"grade": "A", "score": 0.9, "run_ids": ["run-a"]}
    store.complete("completed", result=result, run_ids=["run-a"])

    updates = [
        kwargs
        for name, kwargs in client.calls
        if name == "update_item" and ":status" in kwargs.get("ExpressionAttributeValues", {})
    ]
    assert len(updates) == 1, "terminal state must be one atomic write"
    values = updates[0]["ExpressionAttributeValues"]
    assert values[":status"] == {"S": "completed"}
    assert json.loads(values[":result"]["S"]) == result
    assert values[":error"] == {"NULL": True}
    assert json.loads(values[":run_ids"]["S"]) == ["run-a"]

    item = meta(client)
    assert item["status"] == {"S": "completed"}
    assert json.loads(item["result"]["S"]) == result


def test_complete_defaults_run_ids_to_the_runs_actually_saved(store, client):
    store.begin(REQUEST)
    store.put_run({"id": "run-1", "status": "completed"})
    store.put_run({"id": "run-2", "status": "completed"})
    store.complete("completed", result={"grade": "A"})

    assert json.loads(meta(client)["run_ids"]["S"]) == ["run-1", "run-2"]


def test_complete_twice_is_refused(store):
    store.begin(REQUEST)
    store.complete("completed", result={})
    with pytest.raises(RuntimeError, match="already terminal"):
        store.complete("error", error={"code": "x", "message": "y"})


# --------------------------------------------------------------------------- #
# Events
# --------------------------------------------------------------------------- #


def test_event_seq_is_monotonic_and_zero_padded(store, client):
    for index in range(12):
        assert store.emit({"type": "run_started", "index": index}) == index

    events = client.items_with_prefix(f"EVAL#{EVAL_ID}", "EVENT#")
    assert [item["sk"]["S"] for item in events] == [f"EVENT#{n:08d}" for n in range(12)]

    # Lexicographic sk order (what an ascending Query returns) equals numeric
    # seq order -- that equivalence is the entire point of the padding.
    assert [int(item["seq"]["N"]) for item in events] == list(range(12))


def test_event_sk_helper_matches_the_written_keys(store, client):
    store.emit({"type": "grading_started"})
    assert client.item(f"EVAL#{EVAL_ID}", event_sk(0)) is not None


def test_event_stores_the_wire_shape_verbatim(store, client):
    """Events are replayed to clients byte-for-byte; nothing may be rewritten."""
    event = {
        "type": "run_completed",
        "index": 2,
        "run_id": "run-xyz",
        "status": "completed",
        "summary": {"output_chars": 41, "tool_calls": 1, "duration_ms": 1234},
    }
    store.emit(event)

    stored = client.item(f"EVAL#{EVAL_ID}", event_sk(0))
    assert json.loads(stored["event"]["S"]) == event


def test_seq_count_is_refreshed_after_each_append(store, client):
    store.begin(REQUEST)
    store.emit({"type": "eval_start"})
    assert meta(client)["seq_count"] == {"N": "1"}
    store.emit({"type": "run_started", "index": 0})
    assert meta(client)["seq_count"] == {"N": "2"}


def test_a_failed_seq_count_refresh_does_not_lose_the_event(store, client):
    """``seq_count`` is a reader *hint*; the event log is the truth."""
    store.begin(REQUEST)
    client.fail_on["update_item"] = RuntimeError("throttled")

    seq = store.emit({"type": "run_started", "index": 0})

    assert seq == 0
    assert client.item(f"EVAL#{EVAL_ID}", event_sk(0)) is not None
    assert store.seq_count == 1


def test_events_after_terminal_are_refused(store):
    store.begin(REQUEST)
    store.complete("completed", result={})
    with pytest.raises(RuntimeError, match="terminal"):
        store.emit({"type": "run_started", "index": 9})


def test_eval_complete_is_appended_before_the_status_flip(store, client):
    """Ordering matters: readers stop polling once ``status`` is terminal.

    An event appended after the flip can be missed; one appended before it
    cannot. ``complete()`` synthesizes ``eval_complete`` when the engine did not
    emit one, so a crashed engine still terminates the client's stream.
    """
    store.begin(REQUEST)
    client.calls.clear()

    store.complete("error", error={"code": "internal_error", "message": "boom"})

    event_puts = [
        index
        for index, (name, kwargs) in enumerate(client.calls)
        if name == "put_item" and kwargs["Item"]["sk"]["S"].startswith("EVENT#")
    ]
    status_updates = [
        index
        for index, (name, kwargs) in enumerate(client.calls)
        if name == "update_item" and ":status" in kwargs.get("ExpressionAttributeValues", {})
    ]
    assert event_puts and status_updates
    assert max(event_puts) < min(status_updates)

    final = client.items_with_prefix(f"EVAL#{EVAL_ID}", "EVENT#")[-1]
    assert json.loads(final["event"]["S"])["type"] == "eval_complete"


def test_an_engine_emitted_eval_complete_is_not_duplicated(store, client):
    store.begin(REQUEST)
    store.emit({"type": "eval_complete", "status": "completed", "result": {"grade": "A"}})
    store.complete("completed", result={"grade": "A"})

    events = client.items_with_prefix(f"EVAL#{EVAL_ID}", "EVENT#")
    completes = [
        item for item in events if json.loads(item["event"]["S"])["type"] == "eval_complete"
    ]
    assert len(completes) == 1


# --------------------------------------------------------------------------- #
# Run records
# --------------------------------------------------------------------------- #

RUN = {
    "id": "run-abc",
    "ts": "2026-08-12T10:00:00+00:00",
    "model_id": "some-model",
    "scenario_id": "scenario-1",
    "system_prompt": "you are helpful",
    "user_prompt": "hello",
    "dataset_id": None,
    "dataset_hash": None,
    "config": {"temperature": 0.0, "tools_enabled": True},
    "output": "hi there",
    "tool_transcript": [{"name": "lookup", "input": {}}],
    "metrics": {"latency_ms": 1200},
    "guardrail_trace": None,
    "status": "completed",
    "error": None,
}


def test_run_item_matches_the_contract_field_for_field(store, client):
    store.put_run(RUN)

    item = client.item("RUN#run-abc", "META")
    assert item is not None
    assert item["pk"] == {"S": "RUN#run-abc"}
    assert item["sk"] == {"S": "META"}

    # Plain-string columns.
    assert item["id"] == {"S": "run-abc"}
    assert item["model_id"] == {"S": "some-model"}
    assert item["scenario_id"] == {"S": "scenario-1"}
    assert item["system_prompt"] == {"S": "you are helpful"}
    assert item["user_prompt"] == {"S": "hello"}
    assert item["output"] == {"S": "hi there"}
    assert item["status"] == {"S": "completed"}

    # JSON columns, encoded exactly as the SQLite TEXT columns are.
    assert json.loads(item["config"]["S"]) == RUN["config"]
    assert json.loads(item["tool_transcript"]["S"]) == RUN["tool_transcript"]
    assert json.loads(item["metrics"]["S"]) == RUN["metrics"]

    # Nullable fields are present-and-null, never absent.
    assert item["dataset_id"] == {"NULL": True}
    assert item["dataset_hash"] == {"NULL": True}
    assert item["guardrail_trace"] == {"NULL": True}
    assert item["error"] == {"NULL": True}

    # Cloud-lane additions.
    assert item["evaluation_id"] == {"S": EVAL_ID}
    assert item["GSI1PK"] == {"S": GSI1_RUN_PK}
    assert item["GSI1SK"] == {"S": RUN["ts"]}


def test_run_item_declares_every_contract_field(store, client):
    store.put_run({"id": "run-min", "status": "running"})

    item = client.item("RUN#run-min", "META")
    expected = {
        "id", "ts", "model_id", "scenario_id", "system_prompt", "user_prompt",
        "dataset_id", "dataset_hash", "config", "output", "tool_transcript",
        "metrics", "guardrail_trace", "status", "error",
    }
    assert expected <= set(item)


def test_put_run_requires_an_id(store):
    with pytest.raises(ValueError, match="no id"):
        store.put_run({"status": "completed"})


def test_save_run_mirrors_the_local_sqlite_row_into_dynamodb(store, client, monkeypatch):
    """The run engine writes SQLite; only this copy is durable or shareable.

    Inside AgentCore that SQLite file is the microVM's own ephemeral disk, so a
    run that is never mirrored disappears with the session.
    """
    monkeypatch.setattr(
        type(store), "_load_local_run", staticmethod(lambda run_id: dict(RUN, id=run_id))
    )

    store.save_run("run-abc")

    item = client.item("RUN#run-abc", "META")
    assert item is not None
    assert item["output"] == {"S": "hi there"}
    assert store.saved_run_ids == ["run-abc"]


def test_save_run_ignores_a_run_that_was_never_local(store, client, monkeypatch):
    """``kind="grade"`` inputs already live in DynamoDB; there is nothing to copy."""
    monkeypatch.setattr(type(store), "_load_local_run", staticmethod(lambda run_id: None))

    store.save_run("run-elsewhere")

    assert client.item("RUN#run-elsewhere", "META") is None
    assert store.saved_run_ids == []


def test_load_run_prefers_the_local_row(store, monkeypatch):
    monkeypatch.setattr(
        type(store), "_load_local_run", staticmethod(lambda run_id: dict(RUN, id=run_id))
    )

    record = store.load_run("run-abc")

    assert record.id == "run-abc"
    assert record.output == "hi there"
    assert record.config == RUN["config"]


def test_load_run_falls_back_to_dynamodb(store, monkeypatch):
    """The same SQLite-then-DynamoDB precedence ``GET /runs/{id}`` uses."""
    store.put_run(RUN)
    monkeypatch.setattr(type(store), "_load_local_run", staticmethod(lambda run_id: None))

    record = store.load_run("run-abc")

    assert record.id == "run-abc"
    assert record.metrics == {"latency_ms": 1200}
    assert record.ts.isoformat() == RUN["ts"]


def test_load_run_raises_when_the_run_is_in_neither_store(store, monkeypatch):
    from promptatron.errors import NotFoundError

    monkeypatch.setattr(type(store), "_load_local_run", staticmethod(lambda run_id: None))

    with pytest.raises(NotFoundError):
        store.load_run("ghost")


def test_get_run_round_trips_json_columns(store):
    store.put_run(RUN)
    loaded = store.get_run("run-abc")

    assert loaded is not None
    assert loaded["config"] == RUN["config"]
    assert loaded["tool_transcript"] == RUN["tool_transcript"]
    assert loaded["metrics"] == RUN["metrics"]
    assert loaded["output"] == "hi there"
    assert loaded["guardrail_trace"] is None


def test_get_run_returns_none_when_missing(store):
    assert store.get_run("nope") is None


def test_unwrap_decodes_attribute_values(store, client):
    store.put_run(RUN)
    record = unwrap(client.item("RUN#run-abc", "META"))
    assert record["id"] == "run-abc"
    assert record["evaluation_id"] == EVAL_ID


# --------------------------------------------------------------------------- #
# Cancellation
# --------------------------------------------------------------------------- #


def test_cancel_requested_is_false_without_the_flag(store):
    assert store.cancel_requested() is False


def test_cancel_requested_detects_the_flag(store, client):
    store.begin(REQUEST)
    assert store.cancel_requested() is False
    store.request_cancel()
    assert store.cancel_requested() is True

    item = client.item(f"EVAL#{EVAL_ID}", CANCEL_SK)
    assert item is not None and "ts" in item


def test_cancel_check_reads_consistently(store):
    """``DELETE`` returns 204 the instant the flag is written.

    An eventually-consistent read could let another run start after the user was
    told the evaluation had stopped.
    """
    store.cancel_requested()
    _, kwargs = store.client.calls[-1]
    assert kwargs["ConsistentRead"] is True


def test_cancel_is_latched_and_stops_re_reading(store, client):
    store.request_cancel()
    assert store.cancel_requested() is True
    before = len([name for name in client.operations() if name == "get_item"])
    assert store.cancel_requested() is True
    after = len([name for name in client.operations() if name == "get_item"])
    assert after == before


def test_a_failed_cancel_read_does_not_cancel_the_evaluation(store, client):
    client.fail_on["get_item"] = RuntimeError("throttled")
    assert store.cancel_requested() is False


# --------------------------------------------------------------------------- #
# Construction
# --------------------------------------------------------------------------- #


def test_table_name_is_required():
    with pytest.raises(ValueError, match="table_name is required"):
        DynamoEvalStore("", EVAL_ID)
