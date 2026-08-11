"""Router-level tests for promptatron.routers.scenarios.

Builds a local FastAPI app (router + the shared exception handlers) rather than
relying on `promptatron.main.create_app`, since router wiring into the main app
happens later, centrally. Upstream calls are respx-mocked with the real fixture
bodies from api/tests/fixtures/.
"""

import json
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
import respx
from fastapi import FastAPI

from promptatron.configstore.client import ConfigStoreClient
from promptatron.errors import register_exception_handlers
from promptatron.routers.scenarios import get_config_store_client, router

BASE_URL = "https://configstore.test"
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "api" / "tests" / "fixtures"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text())


@pytest.fixture
def scenario_app() -> FastAPI:
    application = FastAPI()
    application.include_router(router, prefix="/api/v1")
    register_exception_handlers(application)
    application.dependency_overrides[get_config_store_client] = lambda: ConfigStoreClient(
        base_url=BASE_URL, api_key="test-api-key"
    )
    return application


@pytest.fixture
async def scenario_client(scenario_app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=scenario_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


# --------------------------------------------------------------------------- #
# Round trips
# --------------------------------------------------------------------------- #


@respx.mock
async def test_list_scenarios_round_trip(scenario_client: httpx.AsyncClient):
    fixture = _fixture("scenario-list.json")
    respx.get(f"{BASE_URL}/scenarios").mock(return_value=httpx.Response(200, json=fixture))

    response = await scenario_client.get("/api/v1/scenarios")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert body["items"][0]["id"] == "fraud-detection-comprehensive"
    assert body["nextToken"] == fixture["nextToken"]


@respx.mock
async def test_get_scenario_round_trip(scenario_client: httpx.AsyncClient):
    fixture = _fixture("scenario-hydrated.json")
    respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )

    response = await scenario_client.get(
        "/api/v1/scenarios/fraud-detection-comprehensive"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "fraud-detection-comprehensive"
    assert body["systemPrompts"][0]["id"] == "fraud-analyst"
    assert body["tools"][0]["handlerKey"] == "tools/freezeAccount.freezeAccount"
    assert body["datasets"][0]["id"] == "retail-transactions"


@respx.mock
async def test_create_prompt_round_trip(scenario_client: httpx.AsyncClient):
    respx.post(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/prompts"
    ).mock(return_value=httpx.Response(201, json={"id": "new-prompt"}))

    response = await scenario_client.post(
        "/api/v1/scenarios/fraud-detection-comprehensive/prompts",
        json={"kind": "SYSTEM", "name": "New Prompt", "content": "Be helpful."},
    )

    assert response.status_code == 201
    assert response.json() == {"id": "new-prompt"}


@respx.mock
async def test_get_dataset_content_round_trip(scenario_client: httpx.AsyncClient):
    fixture = _fixture("dataset.json")
    respx.get(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/datasets/retail-transactions"
    ).mock(return_value=httpx.Response(200, json=fixture))

    response = await scenario_client.get(
        "/api/v1/scenarios/fraud-detection-comprehensive/datasets/retail-transactions"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["content"] == fixture["content"]
    assert body["contentType"] == "text/csv"


@respx.mock
async def test_list_tools_adds_handler_registered_false_fallback(
    scenario_client: httpx.AsyncClient,
):
    """promptatron.tools.registry doesn't exist in this package yet, so the router's
    lazy/defensive import must fall back to handler_registered=False rather than error.
    """
    tool_fixture = _fixture("tool.json")
    respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive/tools").mock(
        return_value=httpx.Response(200, json={"items": [tool_fixture], "count": 1})
    )

    response = await scenario_client.get(
        "/api/v1/scenarios/fraud-detection-comprehensive/tools"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["items"][0]["name"] == "flag_suspicious_transaction"
    assert body["items"][0]["handler_registered"] is False


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #


@respx.mock
async def test_not_found_error_envelope(scenario_client: httpx.AsyncClient):
    respx.get(f"{BASE_URL}/scenarios/missing").mock(
        return_value=httpx.Response(404, json={"message": "Scenario not found"})
    )

    response = await scenario_client.get("/api/v1/scenarios/missing")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["message"] == "Scenario not found"


@respx.mock
async def test_bad_request_error_envelope(scenario_client: httpx.AsyncClient):
    respx.post(f"{BASE_URL}/scenarios").mock(
        return_value=httpx.Response(400, json={"message": "name is required"})
    )

    response = await scenario_client.post("/api/v1/scenarios", json={"name": "x"})

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "bad_request"
    assert body["error"]["message"] == "name is required"


async def test_not_configured_error_envelope(scenario_app: FastAPI):
    scenario_app.dependency_overrides[get_config_store_client] = lambda: ConfigStoreClient(
        base_url=None, api_key=None
    )
    transport = httpx.ASGITransport(app=scenario_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        response = await ac.get("/api/v1/scenarios")

    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "upstream_error"
    assert body["error"]["message"] == "config store not configured"
