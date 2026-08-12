"""Tests for the cloud evaluation lane: submit, read, stream, cancel.

Nothing here reaches AWS. DynamoDB is a :class:`FakeTable` -- an in-memory
stand-in for a ``boto3`` resource ``Table`` that really does evaluate the
``Key(...)`` conditions :mod:`promptatron.evals.ddb_reader` builds, so the key
schema and the query shapes are under test and not just mocked away. The one
place the *real* AWS API shape matters, ``InvokeAgentRuntime``, is exercised
through botocore's ``Stubber``, which validates parameters against the shipped
service model.
"""

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3
import httpx
import pytest
from botocore.stub import Stubber
from fastapi import FastAPI

from promptatron.config import Settings, get_settings
from promptatron.errors import register_exception_handlers
from promptatron.evals import cloud
from promptatron.evals import jobs as evals_jobs
from promptatron.evals.ddb_reader import GSI1_PK, GSI1_SK, EvalTable
from promptatron.routers import health as health_router
from promptatron.routers import runs
from promptatron.store import db
from promptatron.worker.interfaces import session_id_for

RUNTIME_ARN = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/promptatron-evals-abc"
TABLE_NAME = "promptatron-config-store"


# --------------------------------------------------------------------------- #
# An in-memory DynamoDB table
# --------------------------------------------------------------------------- #


def _matches(condition: Any, item: dict[str, Any]) -> bool:
    """Evaluate a real ``boto3.dynamodb.conditions`` key condition against an item."""
    expression = condition.get_expression()
    operator = expression["operator"]
    values = expression["values"]
    if operator == "AND":
        return all(_matches(value, item) for value in values)
    actual = item.get(values[0].name)
    if operator == "=":
        return actual == values[1]
    if operator == "begins_with":
        return isinstance(actual, str) and actual.startswith(values[1])
    if operator == "BETWEEN":
        return actual is not None and values[1] <= actual <= values[2]
    raise AssertionError(f"unsupported key operator {operator!r}")


class FakeTable:
    """The subset of the DynamoDB resource Table API the reader actually uses."""

    def __init__(self, items: list[dict[str, Any]] | None = None) -> None:
        self.items: list[dict[str, Any]] = [dict(item) for item in (items or [])]
        self.puts: list[dict[str, Any]] = []

    # -- seeding ---------------------------------------------------------- #

    def add(self, *items: dict[str, Any]) -> None:
        for item in items:
            self.items = [
                existing
                for existing in self.items
                if (existing["pk"], existing["sk"]) != (item["pk"], item["sk"])
            ]
            self.items.append(dict(item))

    # -- the API ---------------------------------------------------------- #

    def get_item(self, Key: dict[str, str]) -> dict[str, Any]:  # noqa: N803 - boto3 spelling
        for item in self.items:
            if item["pk"] == Key["pk"] and item["sk"] == Key["sk"]:
                return {"Item": dict(item)}
        return {}

    def put_item(self, Item: dict[str, Any]) -> dict[str, Any]:  # noqa: N803 - boto3 spelling
        self.add(Item)
        self.puts.append(dict(Item))
        return {}

    def query(  # noqa: N803 - boto3 spelling
        self,
        KeyConditionExpression: Any,
        IndexName: str | None = None,
        ScanIndexForward: bool = True,
        Limit: int | None = None,
        ExclusiveStartKey: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if IndexName is not None:
            rows = [item for item in self.items if GSI1_PK in item]

            def sort_key(item: dict[str, Any]) -> tuple[str, str]:
                return (str(item[GSI1_SK]), str(item["pk"]))
        else:
            rows = list(self.items)

            def sort_key(item: dict[str, Any]) -> tuple[str, str]:
                return (str(item["pk"]), str(item["sk"]))

        rows = [item for item in rows if _matches(KeyConditionExpression, item)]
        rows.sort(key=sort_key, reverse=not ScanIndexForward)

        if ExclusiveStartKey is not None:
            keys = [sort_key(item) for item in rows]
            start = sort_key(ExclusiveStartKey)
            assert start in keys, "ExclusiveStartKey must name a real row"
            rows = rows[keys.index(start) + 1 :]

        response: dict[str, Any] = {}
        if Limit is not None and len(rows) > Limit:
            rows = rows[:Limit]
            last = rows[-1]
            response["LastEvaluatedKey"] = {
                "pk": last["pk"],
                "sk": last["sk"],
                GSI1_PK: last.get(GSI1_PK),
                GSI1_SK: last.get(GSI1_SK),
            }
        response["Items"] = [dict(item) for item in rows]
        return response


# --------------------------------------------------------------------------- #
# Item builders (the contract's shapes)
# --------------------------------------------------------------------------- #

TS = datetime(2026, 8, 12, 9, 0, 0, tzinfo=UTC)


def eval_meta(
    evaluation_id: str,
    *,
    status: str = "running",
    kind: str = "determinism",
    ts: datetime = TS,
    result: dict | None = None,
    error: dict | None = None,
    run_ids: list[str] | None = None,
    seq_count: int = 0,
) -> dict[str, Any]:
    return {
        "pk": f"EVAL#{evaluation_id}",
        "sk": "META",
        "id": evaluation_id,
        "ts": ts.isoformat(),
        "kind": kind,
        "status": status,
        "config": json.dumps({"kind": kind, "n": 2, "run_config": None, "rubric": None}),
        "run_ids": json.dumps(run_ids or []),
        "result": json.dumps(result) if result is not None else None,
        "error": json.dumps(error) if error is not None else None,
        "seq_count": seq_count,
        GSI1_PK: "EVAL",
        GSI1_SK: ts.isoformat(),
        "expiresAt": 1_000_000,
    }


def eval_event(evaluation_id: str, seq: int, event: dict[str, Any]) -> dict[str, Any]:
    return {
        "pk": f"EVAL#{evaluation_id}",
        "sk": f"EVENT#{seq:08d}",
        "seq": seq,
        "ts": TS.isoformat(),
        "event": json.dumps(event),
        "expiresAt": 1_000_000,
    }


def run_meta(
    run_id: str, *, evaluation_id: str = "eval-1", ts: datetime = TS, status: str = "completed"
) -> dict[str, Any]:
    return {
        "pk": f"RUN#{run_id}",
        "sk": "META",
        "id": run_id,
        "ts": ts.isoformat(),
        "model_id": "anthropic.claude-3-sonnet",
        "scenario_id": "shipping-logistics",
        "system_prompt": "",
        "user_prompt": "Assess order B456",
        "dataset_id": None,
        "dataset_hash": None,
        "config": json.dumps({"tools_enabled": False}),
        "output": "Delayed; escalate.",
        "tool_transcript": json.dumps([]),
        "metrics": json.dumps({"latency_ms": 120}),
        "guardrail_trace": None,
        "status": status,
        "error": None,
        "evaluation_id": evaluation_id,
        GSI1_PK: "RUN",
        GSI1_SK: ts.isoformat(),
        "expiresAt": 1_000_000,
    }


COMPLETE_EVENT = {"type": "eval_complete", "status": "completed", "result": {"grade": "A"}}
START_EVENT = {"type": "eval_start", "evaluation_id": "eval-1", "kind": "determinism", "n": 1}


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #


class RecordingInvoker:
    """A stand-in for AgentCore: remembers every submission."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def invoke(self, evaluation_id: str, payload: dict[str, Any]) -> None:
        self.calls.append((evaluation_id, payload))


@pytest.fixture
def initialized_db(tmp_path):
    return db.init_db(str(tmp_path / "cloud.db"))


@pytest.fixture(autouse=True)
def clean_job_registry():
    evals_jobs.clear()
    yield
    evals_jobs.clear()


@pytest.fixture(autouse=True)
def instant_polling(monkeypatch):
    """The events stream, minus the waiting."""
    monkeypatch.setattr(cloud, "POLL_INTERVAL_SECONDS", 0.0)


@pytest.fixture
def table() -> FakeTable:
    return FakeTable()


@pytest.fixture
def invoker() -> RecordingInvoker:
    return RecordingInvoker()


@pytest.fixture
def cloud_settings() -> Settings:
    return Settings(eval_runtime_arn=RUNTIME_ARN, eval_table=TABLE_NAME)


@pytest.fixture
def app(initialized_db, table, invoker, cloud_settings) -> FastAPI:
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(runs.router, prefix="/api/v1")
    application.include_router(health_router.router, prefix="/api/v1")
    application.dependency_overrides[get_settings] = lambda: cloud_settings
    application.dependency_overrides[cloud.get_eval_table] = lambda: EvalTable(table)
    application.dependency_overrides[cloud.get_invoker] = lambda: invoker
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.fixture
def unconfigured_app(initialized_db) -> FastAPI:
    """The same router with the lane switched off (the default settings)."""
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(runs.router, prefix="/api/v1")
    application.include_router(health_router.router, prefix="/api/v1")
    application.dependency_overrides[get_settings] = lambda: Settings()
    return application


@pytest.fixture
async def unconfigured_client(unconfigured_app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=unconfigured_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


def determinism_body(**overrides) -> dict:
    payload: dict[str, Any] = {
        "kind": "determinism",
        "n": 4,
        "execution": "cloud",
        "run_config": {
            "model_id": "anthropic.claude-3-sonnet",
            "user_prompt": "Assess order B456",
        },
    }
    payload.update(overrides)
    return payload


# --------------------------------------------------------------------------- #
# Submit
# --------------------------------------------------------------------------- #


async def test_submitting_a_cloud_evaluation_invokes_the_runtime(client, invoker):
    accepted = await client.post("/api/v1/evaluations", json=determinism_body())

    assert accepted.status_code == 202
    body = accepted.json()
    assert body["status"] == "pending"
    assert body["kind"] == "determinism"
    assert body["execution"] == "cloud"
    assert body["run_ids"] == []
    assert body["config"]["n"] == 4

    assert len(invoker.calls) == 1
    evaluation_id, payload = invoker.calls[0]
    assert evaluation_id == body["id"]
    assert payload["evaluation_id"] == body["id"]
    # The worker gets the request verbatim, minus the lane selector itself.
    assert "execution" not in payload["request"]
    assert payload["request"]["kind"] == "determinism"
    assert payload["request"]["n"] == 4
    assert payload["request"]["run_config"]["user_prompt"] == "Assess order B456"
    assert payload["request"]["run_config"]["stream"] is False
    assert payload["request"]["grader"]["model_id"] == "amazon.nova-pro-v1:0"


async def test_a_cloud_submission_writes_nothing_locally(client, invoker):
    accepted = await client.post("/api/v1/evaluations", json=determinism_body())

    listing = await client.get("/api/v1/evaluations")
    assert listing.json()["items"] == []
    # ...and the local detail route only finds it via the DynamoDB fallback.
    missing = await client.get(f"/api/v1/evaluations/{accepted.json()['id']}")
    assert missing.status_code == 404


async def test_a_cloud_grade_submission_carries_its_run_ids(client, invoker):
    accepted = await client.post(
        "/api/v1/evaluations",
        json={"kind": "grade", "run_ids": ["run-a", "run-b"], "execution": "cloud"},
    )

    assert accepted.status_code == 202
    assert accepted.json()["run_ids"] == ["run-a", "run-b"]
    # Unlike the local lane, unknown ids are not a 404 here: they may live in DDB.
    assert invoker.calls[0][1]["request"]["run_ids"] == ["run-a", "run-b"]


async def test_the_cloud_lane_is_400_when_unconfigured(unconfigured_client):
    response = await unconfigured_client.post("/api/v1/evaluations", json=determinism_body())

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "cloud_lane_unavailable"


async def test_a_local_submission_is_unaffected_by_the_cloud_settings(client, invoker):
    """``execution`` defaults to local, and local still means local."""
    response = await client.post(
        "/api/v1/evaluations",
        json={"kind": "grade", "run_ids": ["nope"]},
    )

    assert response.status_code == 404  # the local lane validates its run ids
    assert invoker.calls == []


def test_the_runtime_session_id_clears_the_api_minimum():
    """32-char uuid hex ids are always one short of ``SessionType``'s min of 33."""
    session_id = session_id_for("0123456789abcdef0123456789abcdef")

    assert len(session_id) >= 33
    assert session_id.startswith("0123456789abcdef0123456789abcdef")
    # Deterministic: a retried invoke lands on the same runtime session.
    assert session_id == session_id_for("0123456789abcdef0123456789abcdef")


def test_the_real_invoker_calls_invoke_agent_runtime_with_contract_params():
    """Validated against botocore's shipped ``bedrock-agentcore`` service model."""
    client = boto3.client("bedrock-agentcore", region_name="us-east-1")
    payload = {"evaluation_id": "e" * 32, "request": {"kind": "determinism"}}

    with Stubber(client) as stubber:
        stubber.add_response(
            "invoke_agent_runtime",
            {"contentType": "application/json"},
            expected_params={
                "agentRuntimeArn": RUNTIME_ARN,
                "runtimeSessionId": session_id_for("e" * 32),
                "contentType": "application/json",
                "accept": "application/json",
                "payload": json.dumps(payload).encode("utf-8"),
            },
        )
        invoker = cloud.AgentCoreInvoker(RUNTIME_ARN, "us-east-1", client=client)
        invoker.invoke("e" * 32, payload)
        stubber.assert_no_pending_responses()


# --------------------------------------------------------------------------- #
# Detail, listing, run fallback
# --------------------------------------------------------------------------- #


async def test_getting_a_cloud_evaluation_falls_back_to_dynamodb(client, table):
    table.add(
        eval_meta(
            "eval-1",
            status="completed",
            run_ids=["run-a"],
            result={"grade": "A", "score": 95},
        )
    )

    response = await client.get("/api/v1/evaluations/eval-1")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "eval-1"
    assert body["status"] == "completed"
    assert body["execution"] == "cloud"
    assert body["run_ids"] == ["run-a"]
    assert body["result"] == {"grade": "A", "score": 95}
    assert body["config"]["n"] == 2


async def test_an_unknown_evaluation_is_still_a_404_with_the_lane_on(client):
    response = await client.get("/api/v1/evaluations/nope")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_listing_cloud_evaluations_reads_the_gsi1_partition(client, table):
    for index in range(3):
        table.add(
            eval_meta(f"eval-{index}", ts=TS + timedelta(minutes=index), status="completed")
        )
    table.add(run_meta("run-a"))  # the RUN partition must not leak into it

    response = await client.get("/api/v1/evaluations?execution=cloud")

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["id"] for item in items] == ["eval-2", "eval-1", "eval-0"]  # ts desc
    assert {item["execution"] for item in items} == {"cloud"}


async def test_the_cloud_listing_paginates_by_cursor(client, table):
    for index in range(3):
        table.add(eval_meta(f"eval-{index}", ts=TS + timedelta(minutes=index)))

    first = await client.get("/api/v1/evaluations?execution=cloud&limit=2")
    assert [item["id"] for item in first.json()["items"]] == ["eval-2", "eval-1"]
    cursor = first.json()["next_cursor"]
    assert cursor

    second = await client.get(f"/api/v1/evaluations?execution=cloud&limit=2&cursor={cursor}")
    assert [item["id"] for item in second.json()["items"]] == ["eval-0"]
    assert second.json()["next_cursor"] is None


async def test_a_malformed_cloud_cursor_is_a_400(client, table):
    response = await client.get("/api/v1/evaluations?execution=cloud&cursor=!!!not-base64!!!")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_request"


async def test_the_cloud_listing_can_be_narrowed_by_kind_and_status(client, table):
    table.add(eval_meta("eval-0", kind="determinism", status="completed"))
    table.add(eval_meta("eval-1", kind="grade", status="completed", ts=TS + timedelta(minutes=1)))

    response = await client.get("/api/v1/evaluations?execution=cloud&kind=grade")

    assert [item["id"] for item in response.json()["items"]] == ["eval-1"]


async def test_the_default_listing_stays_local(client, table):
    table.add(eval_meta("eval-1"))

    response = await client.get("/api/v1/evaluations")

    assert response.json()["items"] == []


async def test_cloud_listings_are_400_when_the_lane_is_off(unconfigured_client):
    response = await unconfigured_client.get("/api/v1/evaluations?execution=cloud")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "cloud_lane_unavailable"


async def test_getting_a_run_falls_back_to_dynamodb(client, table):
    table.add(run_meta("run-a"))

    response = await client.get("/api/v1/runs/run-a")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "run-a"
    assert body["output"] == "Delayed; escalate."
    assert body["metrics"] == {"latency_ms": 120}
    assert body["tool_transcript"] == []
    assert body["config"] == {"tools_enabled": False}


async def test_an_unknown_run_is_still_a_404(client):
    response = await client.get("/api/v1/runs/nope")

    assert response.status_code == 404


async def test_listing_cloud_runs_reads_the_run_gsi1_partition(client, table):
    for index in range(2):
        table.add(run_meta(f"run-{index}", ts=TS + timedelta(minutes=index)))
    table.add(eval_meta("eval-1"))  # the EVAL partition must not leak into it

    response = await client.get("/api/v1/runs?execution=cloud")

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["id"] for item in items] == ["run-1", "run-0"]
    assert items[0]["metrics"] == {"latency_ms": 120}
    assert items[0]["model_id"] == "anthropic.claude-3-sonnet"


async def test_the_default_run_listing_stays_local(client, table):
    table.add(run_meta("run-a"))

    response = await client.get("/api/v1/runs")

    assert response.json()["items"] == []


# --------------------------------------------------------------------------- #
# Cancellation
# --------------------------------------------------------------------------- #


async def test_cancelling_a_cloud_evaluation_puts_the_cancel_item(client, table):
    table.add(eval_meta("eval-1", status="running"))

    response = await client.delete("/api/v1/evaluations/eval-1")

    assert response.status_code == 204
    assert [(item["pk"], item["sk"]) for item in table.puts] == [("EVAL#eval-1", "CANCEL")]
    assert table.puts[0]["expiresAt"] > 0
    assert table.puts[0]["ts"]


async def test_cancelling_a_finished_cloud_evaluation_is_a_409(client, table):
    table.add(eval_meta("eval-1", status="completed"))

    response = await client.delete("/api/v1/evaluations/eval-1")

    assert response.status_code == 409
    assert response.json()["error"]["detail"]["status"] == "completed"
    assert table.puts == []


async def test_cancelling_an_unknown_evaluation_is_a_404(client):
    response = await client.delete("/api/v1/evaluations/nope")

    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# The event stream
# --------------------------------------------------------------------------- #


async def read_events(client: httpx.AsyncClient, evaluation_id: str) -> list[dict]:
    async with client.stream("GET", f"/api/v1/evaluations/{evaluation_id}/events") as response:
        assert response.status_code == 200
        assert "application/x-ndjson" in response.headers["content-type"]
        return [json.loads(line) async for line in response.aiter_lines() if line]


async def test_a_finished_cloud_evaluation_replays_its_event_log(client, table):
    table.add(eval_meta("eval-1", status="completed", seq_count=4))
    table.add(
        eval_event("eval-1", 0, START_EVENT),
        eval_event("eval-1", 1, {"type": "run_started", "index": 0}),
        eval_event("eval-1", 2, {"type": "grading_started"}),
        eval_event("eval-1", 3, COMPLETE_EVENT),
    )

    events = await read_events(client, "eval-1")

    assert [event["type"] for event in events] == [
        "eval_start",
        "run_started",
        "grading_started",
        "eval_complete",
    ]
    # Nothing is synthesized: the worker's own final event is passed through.
    assert events[-1] == COMPLETE_EVENT


async def test_the_stream_follows_new_events_then_stops_on_eval_complete(table):
    """Driven one event at a time so the follow loop is deterministic."""
    fake = table
    fake.add(eval_meta("eval-1", status="running"))
    fake.add(
        eval_event("eval-1", 0, START_EVENT),
        eval_event("eval-1", 1, {"type": "run_started", "index": 0}),
    )
    stream = cloud.stream_events(EvalTable(fake), "eval-1")

    assert json.loads(await anext(stream))["type"] == "eval_start"
    assert json.loads(await anext(stream))["type"] == "run_started"

    # A new event lands while the reader is parked: the next pull picks it up.
    fake.add(eval_event("eval-1", 2, {"type": "run_completed", "index": 0, "run_id": "r"}))
    assert json.loads(await anext(stream))["type"] == "run_completed"

    fake.add(eval_meta("eval-1", status="completed"), eval_event("eval-1", 3, COMPLETE_EVENT))
    assert json.loads(await anext(stream)) == COMPLETE_EVENT

    with pytest.raises(StopAsyncIteration):
        await anext(stream)


async def test_the_stream_gives_up_on_a_terminal_meta_with_no_final_event(client, table):
    """A worker that died after writing its status must not hang the reader."""
    table.add(eval_meta("eval-1", status="error", seq_count=1))
    table.add(eval_event("eval-1", 0, START_EVENT))

    events = await read_events(client, "eval-1")

    assert [event["type"] for event in events] == ["eval_start"]


async def test_events_for_an_unknown_cloud_evaluation_are_a_404(client):
    response = await client.get("/api/v1/evaluations/nope/events")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_events_only_read_the_event_range(table):
    """``CANCEL`` and ``META`` share the partition and must never be streamed."""
    fake = table
    fake.add(eval_meta("eval-1", status="completed"))
    fake.add({"pk": "EVAL#eval-1", "sk": "CANCEL", "ts": TS.isoformat()})
    fake.add(eval_event("eval-1", 0, COMPLETE_EVENT))

    items = EvalTable(fake).events_after("eval-1")

    assert [item["sk"] for item in items] == ["EVENT#00000000"]


async def test_events_after_a_sequence_number_are_exclusive(table):
    fake = table
    for seq in range(3):
        fake.add(eval_event("eval-1", seq, {"type": "run_started", "index": seq}))

    items = EvalTable(fake).events_after("eval-1", after_seq=1)

    assert [int(item["seq"]) for item in items] == [2]


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #


async def test_health_reports_the_cloud_lane_as_configured(client):
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["cloud_evals"] == {"configured": True}


async def test_health_reports_the_cloud_lane_as_unconfigured(unconfigured_client):
    response = await unconfigured_client.get("/api/v1/health")

    assert response.json()["cloud_evals"] == {"configured": False}


async def test_a_half_configured_lane_is_not_configured():
    assert cloud.is_configured(Settings(eval_runtime_arn=RUNTIME_ARN)) is False
    assert cloud.is_configured(Settings(eval_table=TABLE_NAME)) is False
    assert cloud.is_configured(Settings(eval_runtime_arn=RUNTIME_ARN, eval_table=TABLE_NAME))


# --------------------------------------------------------------------------- #
# Item -> response mapping edge cases
# --------------------------------------------------------------------------- #


async def test_the_cloud_listing_can_be_narrowed_by_status_alone(client, table):
    table.add(eval_meta("eval-0", kind="determinism", status="completed"))
    table.add(eval_meta("eval-1", kind="determinism", status="error", ts=TS + timedelta(minutes=1)))

    response = await client.get("/api/v1/evaluations?execution=cloud&status=error")

    assert [item["id"] for item in response.json()["items"]] == ["eval-1"]


async def test_a_native_json_value_in_config_is_passed_through_unparsed(client, table):
    """A permissive writer may store config/result as a native map instead of a
    JSON string; ``_json`` must accept both instead of only ``json.loads``-ing."""
    item = eval_meta("eval-native", status="completed", result={"grade": "A"})
    item["config"] = {"kind": "determinism", "n": 1, "run_config": None, "rubric": None}
    table.add(item)

    response = await client.get("/api/v1/evaluations/eval-native")

    assert response.json()["config"]["n"] == 1


def test_get_invoker_reuses_the_same_instance_for_the_same_settings():
    settings = Settings(eval_runtime_arn=RUNTIME_ARN, aws_region="us-east-1")

    first = cloud.get_invoker(settings)
    second = cloud.get_invoker(settings)

    assert first is not None
    assert first is second


def test_get_invoker_builds_a_distinct_instance_per_runtime_arn():
    settings_a = Settings(eval_runtime_arn=RUNTIME_ARN, aws_region="us-east-1")
    other_arn = RUNTIME_ARN.replace("promptatron-evals-abc", "promptatron-evals-xyz")
    settings_b = Settings(eval_runtime_arn=other_arn, aws_region="us-east-1")

    first = cloud.get_invoker(settings_a)
    second = cloud.get_invoker(settings_b)

    assert first is not second


def test_get_invoker_is_none_when_unconfigured():
    assert cloud.get_invoker(Settings()) is None
