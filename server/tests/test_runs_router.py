"""Tests for the run/evaluation history read-side REST API (promptatron.routers.runs).

Builds its own standalone FastAPI app (per shared-tree test conventions): includes
only ``runs.router``, wires up the existing error handlers, and points the store at
a tmp_path sqlite file.
"""

import json
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI
from sqlmodel import Session

from promptatron.errors import register_exception_handlers
from promptatron.routers import runs
from promptatron.schemas.runs import RunDetail
from promptatron.store import db, history


@pytest.fixture
def initialized_db(tmp_path):
    """Point the store at a fresh sqlite file for this test."""
    return db.init_db(str(tmp_path / "runs_router.db"))


@pytest.fixture
def app(initialized_db) -> FastAPI:
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(runs.router, prefix="/api/v1")
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.fixture
def make_run(initialized_db):
    def _make(**overrides):
        kwargs = {
            "model_id": "anthropic.claude-3-sonnet",
            "system_prompt": "sys",
            "user_prompt": "hi",
            "config": {"temperature": 0.1},
        }
        kwargs.update(overrides)
        with Session(db.get_engine()) as session:
            return history.create_run(session, **kwargs)

    return _make


@pytest.fixture
def make_evaluation(initialized_db):
    def _make(**overrides):
        kwargs = {"kind": "determinism", "run_ids": ["run-1"], "config": {}}
        kwargs.update(overrides)
        with Session(db.get_engine()) as session:
            return history.create_evaluation(session, **kwargs)

    return _make


# --------------------------------------------------------------------------- #
# GET /api/v1/runs
# --------------------------------------------------------------------------- #


async def test_list_runs_page_envelope_and_summary_shape(client, make_run):
    for i in range(3):
        make_run(user_prompt=f"p{i}")

    response = await client.get("/api/v1/runs")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"items", "next_cursor"}
    assert len(body["items"]) == 3
    for item in body["items"]:
        assert set(item.keys()) == {
            "id",
            "ts",
            "model_id",
            "scenario_id",
            "dataset_id",
            "status",
            "metrics",
        }


async def test_list_runs_pagination_walks_all_pages(client, make_run):
    for i in range(25):
        make_run(user_prompt=f"p{i}")

    seen = set()
    cursor = None
    while True:
        params = {"limit": 10}
        if cursor:
            params["cursor"] = cursor
        response = await client.get("/api/v1/runs", params=params)
        assert response.status_code == 200
        body = response.json()
        seen.update(item["id"] for item in body["items"])
        cursor = body["next_cursor"]
        if cursor is None:
            break

    assert len(seen) == 25


async def test_list_runs_filters_by_model_id(client, make_run):
    make_run(model_id="model-a")
    make_run(model_id="model-b")

    response = await client.get("/api/v1/runs", params={"model_id": "model-a"})
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["model_id"] == "model-a"


async def test_list_runs_filters_by_status(client, make_run):
    make_run(status="completed")
    make_run(status="error")

    response = await client.get("/api/v1/runs", params={"status": "error"})
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["status"] == "error"


async def test_runs_ndjson_export_streams_matching_runs_as_run_detail(client, make_run):
    for i in range(12):
        make_run(model_id="export-model", user_prompt=f"p{i}")
    make_run(model_id="other-model")

    async with client.stream(
        "GET",
        "/api/v1/runs",
        params={"model_id": "export-model"},
        headers={"Accept": "application/x-ndjson"},
    ) as response:
        assert response.status_code == 200
        assert "application/x-ndjson" in response.headers["content-type"]
        lines = [line async for line in response.aiter_lines() if line]

    assert len(lines) == 12
    for line in lines:
        detail = RunDetail.model_validate(json.loads(line))
        assert detail.model_id == "export-model"


async def test_runs_ndjson_export_ignores_pagination_and_streams_all(client, make_run):
    for i in range(30):
        make_run(user_prompt=f"p{i}")

    async with client.stream(
        "GET",
        "/api/v1/runs",
        params={"limit": 5},
        headers={"Accept": "application/x-ndjson"},
    ) as response:
        lines = [line async for line in response.aiter_lines() if line]

    assert len(lines) == 30


# --------------------------------------------------------------------------- #
# GET/DELETE /api/v1/runs/{id}
# --------------------------------------------------------------------------- #


async def test_get_run_detail(client, make_run):
    created = make_run(metrics={"score": 0.9})

    response = await client.get(f"/api/v1/runs/{created.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == created.id
    assert body["system_prompt"] == "sys"
    assert body["user_prompt"] == "hi"
    assert body["metrics"] == {"score": 0.9}


async def test_get_run_detail_404_envelope(client):
    response = await client.get("/api/v1/runs/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert isinstance(body["error"]["message"], str)


async def test_delete_run_then_404(client, make_run):
    created = make_run()

    response = await client.delete(f"/api/v1/runs/{created.id}")
    assert response.status_code == 204
    assert response.content == b""

    response = await client.get(f"/api/v1/runs/{created.id}")
    assert response.status_code == 404


async def test_delete_run_missing_returns_404_envelope(client):
    response = await client.delete("/api/v1/runs/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# --------------------------------------------------------------------------- #
# GET /api/v1/evaluations, GET /api/v1/evaluations/{id}
# --------------------------------------------------------------------------- #


async def test_evaluation_list_filters_and_detail(client, make_evaluation):
    created = make_evaluation(kind="grade", status="completed", result={"pass": True})
    make_evaluation(kind="determinism")

    response = await client.get("/api/v1/evaluations", params={"kind": "grade"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["id"] == created.id

    response = await client.get(f"/api/v1/evaluations/{created.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["result"] == {"pass": True}
    assert body["run_ids"] == ["run-1"]


async def test_evaluation_detail_404_envelope(client):
    response = await client.get("/api/v1/evaluations/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
