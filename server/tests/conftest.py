"""Shared pytest fixtures for the promptatron test suite."""

from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI

from promptatron.errors import BadRequestError
from promptatron.main import create_app


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
