"""Cross-implementation round trip: the worker's DynamoDB writer feeding the
server's DynamoDB reader.

The writer (``promptatron.worker.ddb``) and the reader (``promptatron.evals``)
were built independently against ``docs/cloud-evals.md``. Each has its own fake
and its own unit suite; this module is the seam test that proves the items one
side writes are the items the other side expects — attribute names, JSON-string
columns, NULL conventions, zero-padded event keys, and the terminal-status
ordering rule.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from promptatron.evals import cloud
from promptatron.evals.ddb_reader import EvalTable
from promptatron.worker.ddb import DynamoEvalStore, unwrap
from tests.fake_dynamodb import FakeDynamoDBClient
from tests.test_evals_cloud import FakeTable

EVALUATION_ID = "roundtrip0000000000000000000000ab"
RUN_ID = "run00000000000000000000000000cdef"

REQUEST = {
    "kind": "determinism",
    "n": 3,
    "run_config": {"model_id": "fake.model-v1", "user_prompt": "hello"},
    "grader": {"model_id": "amazon.nova-pro-v1:0"},
    "execution": "cloud",
}

RUN_RECORD = {
    "id": RUN_ID,
    "ts": "2026-08-12T12:00:00+00:00",
    "model_id": "fake.model-v1",
    "scenario_id": None,
    "system_prompt": "",
    "user_prompt": "hello",
    "dataset_id": None,
    "dataset_hash": None,
    "config": {"tools_enabled": False},
    "output": "streamed text",
    "tool_transcript": [],
    "metrics": {"input_tokens": 11, "output_tokens": 7, "total_tokens": 18},
    "guardrail_trace": None,
    "status": "completed",
    "error": None,
}

RESULT = {"grade": "A", "score": 97, "reasoning": "identical", "run_ids": [RUN_ID]}


@pytest.fixture()
def stores() -> tuple[DynamoEvalStore, FakeTable]:
    """A worker writer over the worker's fake client, plus a server-side fake
    table hydrated from whatever the writer produced."""
    client = FakeDynamoDBClient()
    writer = DynamoEvalStore(
        "promptatron-config-table",
        EVALUATION_ID,
        client=client,
        clock=lambda: 1_770_000_000.0,
    )

    writer.begin(REQUEST, kind="determinism")
    writer.save_evaluation(status="running")
    writer.emit(
        {"type": "eval_start", "evaluation_id": EVALUATION_ID, "kind": "determinism", "n": 3}
    )
    writer.emit({"type": "run_started", "index": 0})
    writer.put_run(RUN_RECORD)
    writer.emit(
        {
            "type": "run_completed",
            "index": 0,
            "run_id": RUN_ID,
            "status": "completed",
            "summary": {"output_chars": 13, "tool_calls": 0, "duration_ms": 40},
        }
    )
    writer.emit({"type": "grading_started"})
    writer.emit({"type": "grading_completed", "result": RESULT})
    writer.save_evaluation(status="completed", result=RESULT, run_ids=[RUN_ID])
    writer.emit({"type": "eval_complete", "status": "completed", "result": RESULT})
    writer.finalize()

    native_items = [unwrap(item) for item in client.items.values()]
    return writer, FakeTable(native_items)


def test_meta_reads_back_as_evaluation_detail(stores: tuple[DynamoEvalStore, FakeTable]) -> None:
    _, table = stores
    detail = cloud.get_evaluation(EvalTable(table), EVALUATION_ID)
    assert detail.id == EVALUATION_ID
    assert detail.kind == "determinism"
    assert detail.status == "completed"
    assert detail.execution == "cloud"
    assert detail.run_ids == [RUN_ID]
    assert detail.result is not None and detail.result["grade"] == "A"
    assert detail.config["n"] == 3


def test_run_item_reads_back_as_run_detail(stores: tuple[DynamoEvalStore, FakeTable]) -> None:
    _, table = stores
    run = cloud.get_run(EvalTable(table), RUN_ID)
    assert run.id == RUN_ID
    assert run.model_id == "fake.model-v1"
    assert run.output == "streamed text"
    assert run.metrics == RUN_RECORD["metrics"]
    assert run.status == "completed"
    assert run.guardrail_trace is None


def test_listings_surface_both_partitions(stores: tuple[DynamoEvalStore, FakeTable]) -> None:
    _, table = stores
    evals = cloud.list_evaluations(EvalTable(table), limit=10)
    runs = cloud.list_runs(EvalTable(table), limit=10)
    assert [e.id for e in evals.items] == [EVALUATION_ID]
    assert [r.id for r in runs.items] == [RUN_ID]


@pytest.mark.anyio
async def test_event_stream_replays_writer_events_in_order(
    stores: tuple[DynamoEvalStore, FakeTable],
) -> None:
    _, table = stores
    lines: list[dict[str, Any]] = []
    async for line in cloud.stream_events(EvalTable(table), EVALUATION_ID):
        lines.append(json.loads(line))
    types = [entry["type"] for entry in lines]
    assert types == [
        "eval_start",
        "run_started",
        "run_completed",
        "grading_started",
        "grading_completed",
        "eval_complete",
    ]
    assert lines[-1]["status"] == "completed"


def test_terminal_meta_never_precedes_eval_complete(
    stores: tuple[DynamoEvalStore, FakeTable],
) -> None:
    """The ordering rule both sides solved independently: at the moment META
    turned terminal, the eval_complete event must already be durable."""
    writer, table = stores
    meta = next(
        item
        for item in table.items
        if item["pk"] == f"EVAL#{EVALUATION_ID}" and item["sk"] == "META"
    )
    assert meta["status"] == "completed"
    event_keys = sorted(
        item["sk"]
        for item in table.items
        if item["pk"] == f"EVAL#{EVALUATION_ID}" and item["sk"].startswith("EVENT#")
    )
    last_event = json.loads(
        next(
            item
            for item in table.items
            if item["pk"] == f"EVAL#{EVALUATION_ID}" and item["sk"] == event_keys[-1]
        )["event"]
    )
    assert last_event["type"] == "eval_complete"
    assert meta["seq_count"] == len(event_keys)
