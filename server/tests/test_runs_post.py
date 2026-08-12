"""Tests for ``POST /api/v1/runs`` (streaming NDJSON and buffered JSON).

Builds a standalone app around ``runs.router`` (per the shared-tree convention),
points the store at a tmp_path sqlite file, and overrides the model-factory
dependency with a scripted ``FakeModel`` -- no AWS calls.
"""

import json
from collections.abc import AsyncIterator

import httpx
import pytest
import respx
from fastapi import FastAPI
from sqlmodel import Session

from promptatron.config import get_settings
from promptatron.configstore.client import ConfigStoreClient
from promptatron.engine.fake_model import Error, FakeModel, Text, ToolUseStep
from promptatron.errors import register_exception_handlers
from promptatron.routers import runs
from promptatron.routers.scenarios import get_config_store_client
from promptatron.store import db, history

CONFIG_BASE_URL = "https://configstore.test"

SHIPPING_SCRIPT = [
    Text("Hello "),
    Text("world"),
    ToolUseStep("getCarrierStatus", {"order_id": "B456"}),
    Text(" done"),
]


@pytest.fixture
def initialized_db(tmp_path):
    return db.init_db(str(tmp_path / "runs_post.db"))


@pytest.fixture
def model_holder() -> dict:
    """Mutable slot holding the FakeModel the app should use for the next run."""
    return {"model": FakeModel(script=[Text("hi")])}


@pytest.fixture
def app(initialized_db, model_holder) -> FastAPI:
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(runs.router, prefix="/api/v1")
    application.dependency_overrides[runs.get_model_factory] = (
        lambda: (lambda _request: model_holder["model"])
    )
    application.dependency_overrides[get_config_store_client] = lambda: ConfigStoreClient(
        base_url=CONFIG_BASE_URL, api_key="test-api-key"
    )
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


def body(**overrides) -> dict:
    payload = {"model_id": "anthropic.claude-3-sonnet", "user_prompt": "hi"}
    payload.update(overrides)
    return payload


async def post_ndjson(client: httpx.AsyncClient, payload: dict) -> list[dict]:
    async with client.stream("POST", "/api/v1/runs", json=payload) as response:
        assert response.status_code == 200
        assert "application/x-ndjson" in response.headers["content-type"]
        return [json.loads(line) async for line in response.aiter_lines() if line]


def stored(run_id: str):
    with Session(db.get_engine()) as session:
        return history.get_run(session, run_id)


# --------------------------------------------------------------------------- #
# stream: true
# --------------------------------------------------------------------------- #


async def test_streaming_run_emits_the_full_ndjson_event_sequence(client, model_holder):
    model_holder["model"] = FakeModel(script=SHIPPING_SCRIPT)

    events = await post_ndjson(
        client, body(scenario_id="shipping-logistics", tools_enabled=True)
    )
    kinds = [event["type"] for event in events]

    assert kinds[0] == "run_start"
    assert kinds[-1] == "run_complete"
    assert kinds.count("text_delta") >= 2
    assert "tool_use_start" in kinds
    assert "tool_input_delta" in kinds
    assert "tool_result" in kinds
    assert "metrics" in kinds

    start = events[0]
    assert set(start) == {"type", "run_id", "model_id", "ts"}
    assert start["model_id"] == "anthropic.claude-3-sonnet"

    tool_result = next(event for event in events if event["type"] == "tool_result")
    assert set(tool_result) == {
        "type",
        "tool_use_id",
        "name",
        "input",
        "output",
        "duration_ms",
        "error",
    }
    assert tool_result["error"] is None

    complete = events[-1]
    assert complete["status"] == "completed"
    assert complete["final_text"] == "Hello world done"

    row = stored(complete["run_id"])
    assert row.status == "completed"
    assert row.output == "Hello world done"
    assert len(row.tool_transcript) == 1


async def test_run_row_is_persisted_before_run_complete_reaches_the_client(client, model_holder):
    model_holder["model"] = FakeModel(script=SHIPPING_SCRIPT)

    observed = None
    async with client.stream(
        "POST",
        "/api/v1/runs",
        json=body(scenario_id="shipping-logistics", tools_enabled=True),
    ) as response:
        async for line in response.aiter_lines():
            if not line:
                continue
            event = json.loads(line)
            if event["type"] == "run_complete":
                observed = stored(event["run_id"])

    assert observed is not None
    assert observed.status == "completed"
    assert observed.output == "Hello world done"
    assert observed.metrics["total_tokens"] > 0


async def test_error_mid_stream_stays_a_200_with_in_band_error(client, model_holder):
    model_holder["model"] = FakeModel(script=[Text("partial "), Error(RuntimeError("kaboom"))])

    events = await post_ndjson(client, body())

    assert [event["type"] for event in events] == [
        "run_start",
        "text_delta",
        "error",
        "run_complete",
    ]
    assert events[-2]["retryable"] is False
    assert "kaboom" in events[-2]["message"]
    assert events[-1]["status"] == "error"
    assert stored(events[-1]["run_id"]).status == "error"


async def test_each_line_is_standalone_json(client, model_holder):
    model_holder["model"] = FakeModel(script=[Text("a"), Text("b")])

    async with client.stream("POST", "/api/v1/runs", json=body()) as response:
        raw = await response.aread()

    lines = [line for line in raw.decode().split("\n") if line]
    assert len(lines) >= 4
    for line in lines:
        assert isinstance(json.loads(line), dict)


# --------------------------------------------------------------------------- #
# stream: false
# --------------------------------------------------------------------------- #


async def test_non_streaming_run_returns_the_stored_run_detail(client, model_holder):
    model_holder["model"] = FakeModel(script=SHIPPING_SCRIPT)

    response = await client.post(
        "/api/v1/runs",
        json=body(scenario_id="shipping-logistics", tools_enabled=True, stream=False),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    payload = response.json()
    assert payload["status"] == "completed"
    assert payload["output"] == "Hello world done"
    assert len(payload["tool_transcript"]) == 1
    assert payload["metrics"]["total_tokens"] > 0
    assert payload["config"]["stream"] is False

    detail = await client.get(f"/api/v1/runs/{payload['id']}")
    assert detail.json() == payload


async def test_non_streaming_and_streaming_agree_on_content(client, model_holder):
    model_holder["model"] = FakeModel(script=SHIPPING_SCRIPT)
    streamed = await post_ndjson(
        client, body(scenario_id="shipping-logistics", tools_enabled=True)
    )

    model_holder["model"] = FakeModel(script=SHIPPING_SCRIPT)
    buffered = await client.post(
        "/api/v1/runs",
        json=body(scenario_id="shipping-logistics", tools_enabled=True, stream=False),
    )

    assert buffered.json()["output"] == streamed[-1]["final_text"]
    assert len(buffered.json()["tool_transcript"]) == 1


async def test_non_streaming_error_becomes_an_http_error_envelope(client, model_holder):
    model_holder["model"] = FakeModel(script=[Text("partial "), Error(RuntimeError("kaboom"))])

    response = await client.post("/api/v1/runs", json=body(stream=False))

    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "internal_error"
    assert error["detail"]["retryable"] is False
    # The row is still persisted with the failure, even though the HTTP call failed.
    assert stored(error["detail"]["run_id"]).status == "error"


async def test_client_disconnect_persists_the_run_as_cancelled(app, model_holder):
    """Closing the response body iterator is what a client disconnect does.

    httpx's ASGITransport has no socket to sever -- it always drives the ASGI app
    to completion -- so the disconnect is simulated at the exact point Starlette
    triggers it: ``StreamingResponse.body_iterator.aclose()``.
    """
    model_holder["model"] = FakeModel(script=[Text("a"), Text("b"), Text("c")])

    response = await runs.create_run(
        payload=runs.RunRequest(model_id="m", user_prompt="hi"),
        settings=get_settings(),
        config_client=None,
        model_factory=lambda _request: model_holder["model"],
    )
    body_iterator = response.body_iterator

    start = json.loads(await anext(body_iterator))
    await anext(body_iterator)  # first text delta
    await body_iterator.aclose()

    row = stored(start["run_id"])
    assert row.status == "cancelled"
    assert row.output == "a"


# --------------------------------------------------------------------------- #
# Datasets and validation
# --------------------------------------------------------------------------- #


@respx.mock
async def test_dataset_content_is_composed_and_hashed(client, model_holder):
    content = "order_id,status\nB456,delayed\n"
    respx.get(
        f"{CONFIG_BASE_URL}/scenarios/shipping-logistics/datasets/orders-csv"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "orders-csv",
                "name": "Orders",
                "contentType": "text/csv",
                "content": content,
            },
        )
    )
    model = FakeModel(script=[Text("ok")])
    model_holder["model"] = model

    response = await client.post(
        "/api/v1/runs",
        json=body(
            user_prompt="Analyze these orders",
            scenario_id="shipping-logistics",
            dataset_id="orders-csv",
            stream=False,
        ),
    )

    assert response.status_code == 200
    assert model.first_user_text == f"Analyze these orders\n\nData to analyze:\n{content}"
    assert response.json()["dataset_hash"]


async def test_dataset_without_scenario_is_a_400_envelope(client):
    response = await client.post("/api/v1/runs", json=body(dataset_id="orders-csv"))

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_request"


async def test_missing_required_fields_is_a_422_envelope(client):
    response = await client.post("/api/v1/runs", json={"user_prompt": "hi"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_unknown_body_fields_are_ignored(client, model_holder):
    model_holder["model"] = FakeModel(script=[Text("ok")])

    response = await client.post(
        "/api/v1/runs",
        json=body(stream=False, mystery_field=42, inference={"temperature": 0.5, "nope": 1}),
    )

    assert response.status_code == 200
    assert response.json()["config"]["inference"] == {"temperature": 0.5}


async def test_out_of_range_inference_values_are_rejected(client):
    response = await client.post(
        "/api/v1/runs", json=body(inference={"temperature": 5.0})
    )

    assert response.status_code == 422


async def test_run_appears_in_the_history_listing(client, model_holder):
    model_holder["model"] = FakeModel(script=[Text("ok")])

    created = await client.post("/api/v1/runs", json=body(stream=False))
    listing = await client.get("/api/v1/runs")

    assert [item["id"] for item in listing.json()["items"]] == [created.json()["id"]]
