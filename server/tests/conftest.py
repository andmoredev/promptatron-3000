"""Shared pytest fixtures for the promptatron test suite."""

from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI

from promptatron import models_catalog
from promptatron.errors import BadRequestError
from promptatron.main import create_app

#: Every env var that can switch a non-Bedrock provider on. Cleared for every
#: test so the suite behaves identically on a laptop that happens to export
#: ANTHROPIC_API_KEY or run an Ollama -- no test may reach the network.
PROVIDER_ENV_VARS = (
    "PROMPTATRON_ANTHROPIC_API_KEY",
    "ANTHROPIC_API_KEY",
    "PROMPTATRON_OPENAI_API_KEY",
    "OPENAI_API_KEY",
    "PROMPTATRON_OLLAMA_BASE_URL",
    "OLLAMA_HOST",
)


@pytest.fixture(autouse=True)
def isolated_providers(monkeypatch):
    """No provider is configured, and no listing is carried between tests."""
    for name in PROVIDER_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    models_catalog.catalog.clear()
    yield
    models_catalog.catalog.clear()


@pytest.fixture(autouse=True)
def isolated_tool_state():
    """Reset the ported tools' module-level "in-memory database" dicts.

    ``fraud_detection._ACCOUNT_RISK`` and ``shipping_logistics._ACTIONS`` are
    intentional process-lifetime state (they mirror what the legacy JS tools
    kept in memory), so a plain single ``pytest`` process never notices: every
    test's account/idempotency-key literal is exercised at most once per run.
    That assumption breaks under anything that re-executes the suite within
    one interpreter without restarting it -- e.g. mutmut's in-process test
    runner, which runs a "gather stats" pass and then a "clean run" pass back
    to back -- surfacing as a test seeing another run's leftover state under
    the same literal id. Clearing both before every test removes the
    dependency on process lifetime entirely.
    """
    from promptatron.tools import fraud_detection, shipping_logistics

    fraud_detection._ACCOUNT_RISK.clear()
    shipping_logistics._ACTIONS.clear()
    yield
    fraud_detection._ACCOUNT_RISK.clear()
    shipping_logistics._ACTIONS.clear()


@pytest.fixture
def app() -> FastAPI:
    """A fresh FastAPI app instance for each test, with a test-only error route."""
    application = create_app()

    @application.get("/api/v1/_test/boom")
    async def _boom():
        raise BadRequestError("deliberate test error", detail={"field": "value"})

    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    """An async HTTP client wired directly to the app via ASGI transport."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
