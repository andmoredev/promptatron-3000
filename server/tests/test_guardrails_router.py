"""Tests for promptatron.routers.guardrails: envelope shapes and status codes.

Builds a standalone FastAPI app wiring only the guardrails router and the
shared error handlers (register_exception_handlers), per the shared-tree
testing convention -- it does not depend on promptatron.main.create_app.
"""

from collections.abc import AsyncIterator
from datetime import UTC, datetime

import httpx
import pytest
from fastapi import FastAPI

from promptatron.errors import NotFoundError, register_exception_handlers
from promptatron.guardrails.schemas import (
    ContentFilter,
    ContentPolicy,
    GuardrailDetail,
    GuardrailSummary,
    GuardrailVersionSummary,
)
from promptatron.routers import guardrails

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _summary(**overrides) -> GuardrailSummary:
    data = {
        "id": "gr-123",
        "arn": "arn:aws:bedrock:us-east-1:111122223333:guardrail/gr-123",
        "name": "router-test",
        "description": None,
        "version": "DRAFT",
        "status": "READY",
        "created_at": NOW,
        "updated_at": NOW,
    }
    data.update(overrides)
    return GuardrailSummary(**data)


def _detail(**overrides) -> GuardrailDetail:
    data = _summary().model_dump()
    data.update(
        {
            "content_policy": ContentPolicy(filters=[ContentFilter(type="HATE")]),
            "denied_topics": [],
            "word_policy": None,
            "pii_policy": None,
            "contextual_grounding": None,
            "blocked_input_message": "This content violates our content policy.",
            "blocked_output_message": "I cannot provide that type of content.",
        }
    )
    data.update(overrides)
    return GuardrailDetail(**data)


class FakeGuardrailService:
    """Test double standing in for GuardrailService via dependency override."""

    def __init__(self):
        self.created_with = None
        self.updated_with = None
        self.deleted = None
        self.version_created_with = None

    def list_guardrails(self, max_results: int = 50):
        return [_summary()]

    def get_guardrail(self, guardrail_id: str, version: str = "DRAFT"):
        if guardrail_id == "missing":
            raise NotFoundError(
                f"Guardrail {guardrail_id} not found", detail={"guardrail_id": guardrail_id}
            )
        return _detail(id=guardrail_id, version=version)

    def create_guardrail(self, config):
        self.created_with = config
        return _detail(name=config.name)

    def update_guardrail(self, guardrail_id: str, config):
        self.updated_with = (guardrail_id, config)
        return _detail(id=guardrail_id, name=config.name)

    def delete_guardrail(self, guardrail_id: str, version: str = "DRAFT"):
        self.deleted = (guardrail_id, version)

    def list_versions(self, guardrail_id: str):
        return [_summary(version="DRAFT"), _summary(version="1")]

    def create_version(self, guardrail_id: str, description: str | None = None):
        self.version_created_with = (guardrail_id, description)
        return GuardrailVersionSummary(id=guardrail_id, version="1", description=description)


@pytest.fixture
def fake_service() -> FakeGuardrailService:
    return FakeGuardrailService()


@pytest.fixture
def app(fake_service: FakeGuardrailService) -> FastAPI:
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(guardrails.router, prefix="/api/v1")
    application.dependency_overrides[guardrails.get_guardrail_service] = lambda: fake_service
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


def _valid_config_body(name: str = "router-test") -> dict:
    return {
        "name": name,
        "contentPolicy": {"filters": [{"type": "HATE"}]},
    }


async def test_list_guardrails_envelope(client: httpx.AsyncClient):
    response = await client.get("/api/v1/guardrails")
    assert response.status_code == 200
    body = response.json()
    assert "guardrails" in body
    assert body["guardrails"][0]["id"] == "gr-123"
    assert body["guardrails"][0]["name"] == "router-test"


async def test_create_guardrail_returns_201_with_detail(
    client: httpx.AsyncClient, fake_service: FakeGuardrailService
):
    response = await client.post("/api/v1/guardrails", json=_valid_config_body("new-guardrail"))
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "new-guardrail"
    assert body["contentPolicy"]["filters"][0]["type"] == "HATE"
    assert fake_service.created_with.name == "new-guardrail"


async def test_create_guardrail_missing_required_field_returns_422(client: httpx.AsyncClient):
    response = await client.post("/api/v1/guardrails", json={})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"


async def test_create_guardrail_business_rule_violation_returns_400(client: httpx.AsyncClient):
    response = await client.post("/api/v1/guardrails", json={"name": "no-policies-at-all"})
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "bad_request"
    assert any("at least one policy" in e.lower() for e in body["error"]["detail"]["errors"])


async def test_get_guardrail_returns_detail(client: httpx.AsyncClient):
    response = await client.get("/api/v1/guardrails/gr-123")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "gr-123"
    assert body["version"] == "DRAFT"


async def test_get_guardrail_not_found_returns_404_envelope(client: httpx.AsyncClient):
    response = await client.get("/api/v1/guardrails/missing")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["detail"]["guardrail_id"] == "missing"


async def test_update_guardrail_returns_detail(
    client: httpx.AsyncClient, fake_service: FakeGuardrailService
):
    response = await client.put(
        "/api/v1/guardrails/gr-123", json=_valid_config_body("updated-name")
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "updated-name"
    assert fake_service.updated_with[0] == "gr-123"
    assert fake_service.updated_with[1].name == "updated-name"


async def test_delete_guardrail_returns_204(
    client: httpx.AsyncClient, fake_service: FakeGuardrailService
):
    response = await client.delete("/api/v1/guardrails/gr-123")
    assert response.status_code == 204
    assert response.content == b""
    assert fake_service.deleted == ("gr-123", "DRAFT")


async def test_list_versions_envelope(client: httpx.AsyncClient):
    response = await client.get("/api/v1/guardrails/gr-123/versions")
    assert response.status_code == 200
    body = response.json()
    assert [v["version"] for v in body["versions"]] == ["DRAFT", "1"]


async def test_create_version_returns_201(
    client: httpx.AsyncClient, fake_service: FakeGuardrailService
):
    response = await client.post(
        "/api/v1/guardrails/gr-123/versions", json={"description": "release 1"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["version"] == "1"
    assert body["description"] == "release 1"
    assert fake_service.version_created_with == ("gr-123", "release 1")


async def test_create_version_with_empty_body(client: httpx.AsyncClient):
    response = await client.post("/api/v1/guardrails/gr-123/versions", json={})
    assert response.status_code == 201
    body = response.json()
    assert body["description"] is None
