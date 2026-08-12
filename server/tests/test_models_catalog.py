"""The multi-provider ``GET /models`` catalog.

Bedrock is a stubbed boto client (as in ``test_models.py``); the other three are
respx-mocked HTTP. Nothing here touches the network -- respx asserts that by
raising on any unmocked call.
"""

from collections.abc import AsyncIterator
from unittest.mock import MagicMock, patch

import httpx
import pytest
import respx
from fastapi import FastAPI

from promptatron.awscat.catalog import ModelCatalog
from promptatron.config import Settings
from promptatron.errors import register_exception_handlers
from promptatron.models_catalog import (
    ANTHROPIC_MODELS_URL,
    OPENAI_MODELS_URL,
    ProviderCatalog,
    is_openai_chat_model,
)
from promptatron.routers import health, models

OLLAMA_BASE_URL = "http://ollama.test:11434"
OLLAMA_TAGS_URL = f"{OLLAMA_BASE_URL}/api/tags"

ANTHROPIC_PAYLOAD = {
    "data": [
        {"type": "model", "id": "claude-sonnet-4-5", "display_name": "Claude Sonnet 4.5"},
        {"type": "model", "id": "claude-haiku-4-5", "display_name": "Claude Haiku 4.5"},
    ],
    "has_more": False,
}

OPENAI_PAYLOAD = {
    "object": "list",
    "data": [
        {"id": "gpt-4o", "object": "model"},
        {"id": "o3-mini", "object": "model"},
        {"id": "chatgpt-4o-latest", "object": "model"},
        {"id": "text-embedding-3-small", "object": "model"},
        {"id": "whisper-1", "object": "model"},
        {"id": "gpt-4o-audio-preview", "object": "model"},
        {"id": "gpt-3.5-turbo-instruct", "object": "model"},
        {"id": "dall-e-3", "object": "model"},
    ],
}

OLLAMA_PAYLOAD = {
    "models": [
        {"name": "llama3.1:8b", "size": 1},
        {"name": "qwen2.5-coder:7b", "size": 2},
    ]
}


@pytest.fixture
def bedrock_client() -> MagicMock:
    """A minimal Bedrock stub: one foundation model, no inference profiles."""
    client = MagicMock()
    client.list_foundation_models.return_value = {
        "modelSummaries": [
            {
                "modelId": "anthropic.claude-3-sonnet-20240229-v1:0",
                "modelName": "Claude 3 Sonnet",
                "providerName": "Anthropic",
                "inferenceTypesSupported": ["ON_DEMAND"],
                "outputModalities": ["TEXT"],
                "responseStreamingSupported": True,
            }
        ]
    }
    paginator = MagicMock()
    paginator.paginate.return_value = [{"inferenceProfileSummaries": []}]
    client.get_paginator.return_value = paginator
    return client


@pytest.fixture
def stub_bedrock(bedrock_client):
    with patch("promptatron.awscat.catalog.boto3.client", return_value=bedrock_client):
        yield bedrock_client


@pytest.fixture
def catalog() -> ProviderCatalog:
    return ProviderCatalog()


@pytest.fixture
def bedrock_catalog() -> ModelCatalog:
    return ModelCatalog()


def settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


def all_configured() -> Settings:
    return settings(
        anthropic_api_key="sk-ant-test",
        openai_api_key="sk-openai-test",
        ollama_base_url=OLLAMA_BASE_URL,
    )


def mock_all_ok() -> None:
    respx.get(ANTHROPIC_MODELS_URL).mock(return_value=httpx.Response(200, json=ANTHROPIC_PAYLOAD))
    respx.get(OPENAI_MODELS_URL).mock(return_value=httpx.Response(200, json=OPENAI_PAYLOAD))
    respx.get(OLLAMA_TAGS_URL).mock(return_value=httpx.Response(200, json=OLLAMA_PAYLOAD))


def by_source(entries: list[dict], source: str) -> list[dict]:
    return [entry for entry in entries if entry["source"] == source]


# --------------------------------------------------------------------------- #
# Per-provider listings
# --------------------------------------------------------------------------- #


@respx.mock
async def test_anthropic_listing_shape_and_headers(catalog, bedrock_catalog, stub_bedrock):
    route = respx.get(ANTHROPIC_MODELS_URL).mock(
        return_value=httpx.Response(200, json=ANTHROPIC_PAYLOAD)
    )

    result = await catalog.collect(settings(anthropic_api_key="sk-ant-test"), bedrock_catalog)

    request = route.calls.last.request
    assert request.headers["x-api-key"] == "sk-ant-test"
    assert request.headers["anthropic-version"] == "2023-06-01"

    entries = by_source(result.models, "anthropic")
    assert entries[0] == {
        "model_id": "claude-sonnet-4-5",
        "name": "Claude Sonnet 4.5",
        "provider": "Anthropic",
        "supports_streaming": True,
        "kind": "model",
        "source": "anthropic",
    }


@respx.mock
async def test_openai_listing_uses_a_bearer_token_and_filters_to_chat_models(
    catalog, bedrock_catalog, stub_bedrock
):
    route = respx.get(OPENAI_MODELS_URL).mock(
        return_value=httpx.Response(200, json=OPENAI_PAYLOAD)
    )

    result = await catalog.collect(settings(openai_api_key="sk-openai-test"), bedrock_catalog)

    assert route.calls.last.request.headers["authorization"] == "Bearer sk-openai-test"
    assert [entry["model_id"] for entry in by_source(result.models, "openai")] == [
        "gpt-4o",
        "o3-mini",
        "chatgpt-4o-latest",
    ]


@pytest.mark.parametrize(
    "model_id,expected",
    [
        ("gpt-4o", True),
        ("gpt-4.1-mini", True),
        ("o1", True),
        ("o3-mini", True),
        ("o4-mini", True),
        ("chatgpt-4o-latest", True),
        ("text-embedding-3-large", False),
        ("gpt-3.5-turbo-instruct", False),
        ("gpt-4o-audio-preview", False),
        ("gpt-4o-realtime-preview", False),
        ("gpt-4o-search-preview", False),
        ("gpt-image-1", False),
        ("dall-e-3", False),
        ("whisper-1", False),
        ("tts-1", False),
        ("omni-moderation-latest", False),
        ("davinci-002", False),
    ],
)
def test_openai_chat_family_filter(model_id, expected):
    assert is_openai_chat_model(model_id) is expected


@respx.mock
async def test_ollama_listing_uses_the_configured_base_url(
    catalog, bedrock_catalog, stub_bedrock
):
    route = respx.get(OLLAMA_TAGS_URL).mock(
        return_value=httpx.Response(200, json=OLLAMA_PAYLOAD)
    )

    result = await catalog.collect(settings(ollama_base_url=OLLAMA_BASE_URL), bedrock_catalog)

    assert route.called
    assert [entry["model_id"] for entry in by_source(result.models, "ollama")] == [
        "llama3.1:8b",
        "qwen2.5-coder:7b",
    ]
    assert result.providers["ollama"] == {"configured": True, "reachable": True}


# --------------------------------------------------------------------------- #
# Aggregation
# --------------------------------------------------------------------------- #


@respx.mock
async def test_all_four_providers_are_merged_bedrock_first(
    catalog, bedrock_catalog, stub_bedrock
):
    mock_all_ok()

    result = await catalog.collect(all_configured(), bedrock_catalog)

    assert [entry["source"] for entry in result.models] == (
        ["bedrock"] + ["anthropic"] * 2 + ["openai"] * 3 + ["ollama"] * 2
    )
    assert result.providers == {
        "bedrock": {"configured": result.providers["bedrock"]["configured"]},
        "anthropic": {"configured": True},
        "openai": {"configured": True},
        "ollama": {"configured": True, "reachable": True},
    }


@respx.mock
async def test_bedrock_entries_carry_their_vendor_as_provider_and_bedrock_as_source(
    catalog, bedrock_catalog, stub_bedrock
):
    result = await catalog.collect(settings(), bedrock_catalog)

    entry = result.models[0]
    assert entry["provider"] == "Anthropic"
    assert entry["source"] == "bedrock"


@respx.mock
async def test_unconfigured_providers_are_neither_called_nor_listed(
    catalog, bedrock_catalog, stub_bedrock
):
    # respx raises on any unmocked request, so "not called" is enforced by the
    # absence of routes rather than asserted after the fact.
    result = await catalog.collect(settings(), bedrock_catalog)

    assert {entry["source"] for entry in result.models} == {"bedrock"}
    assert result.providers == {
        "bedrock": {"configured": result.providers["bedrock"]["configured"]},
        "anthropic": {"configured": False},
        "openai": {"configured": False},
        "ollama": {"configured": False, "reachable": None},
    }


async def test_bedrock_configured_reflects_resolvable_aws_credentials(
    catalog, bedrock_catalog, stub_bedrock, monkeypatch
):
    monkeypatch.setattr("botocore.session.Session.get_credentials", lambda self: object())
    result = await catalog.collect(settings(), bedrock_catalog)
    assert result.providers["bedrock"] == {"configured": True}

    monkeypatch.setattr("botocore.session.Session.get_credentials", lambda self: None)
    result = await catalog.collect(settings(), bedrock_catalog)
    assert result.providers["bedrock"] == {"configured": False}


# --------------------------------------------------------------------------- #
# Degradation
# --------------------------------------------------------------------------- #


@respx.mock
async def test_an_unreachable_ollama_is_empty_and_unreachable_not_an_error(
    catalog, bedrock_catalog, stub_bedrock
):
    respx.get(ANTHROPIC_MODELS_URL).mock(return_value=httpx.Response(200, json=ANTHROPIC_PAYLOAD))
    respx.get(OPENAI_MODELS_URL).mock(return_value=httpx.Response(200, json=OPENAI_PAYLOAD))
    respx.get(OLLAMA_TAGS_URL).mock(side_effect=httpx.ConnectError("connection refused"))

    result = await catalog.collect(all_configured(), bedrock_catalog)

    assert by_source(result.models, "ollama") == []
    assert result.providers["ollama"] == {"configured": True, "reachable": False}
    # The other providers are untouched by the failure.
    assert len(by_source(result.models, "anthropic")) == 2
    assert len(by_source(result.models, "openai")) == 3


@respx.mock
async def test_an_anthropic_401_degrades_to_configured_but_empty(
    catalog, bedrock_catalog, stub_bedrock
):
    respx.get(ANTHROPIC_MODELS_URL).mock(
        return_value=httpx.Response(401, json={"error": {"message": "invalid x-api-key"}})
    )
    respx.get(OPENAI_MODELS_URL).mock(return_value=httpx.Response(200, json=OPENAI_PAYLOAD))
    respx.get(OLLAMA_TAGS_URL).mock(return_value=httpx.Response(200, json=OLLAMA_PAYLOAD))

    result = await catalog.collect(all_configured(), bedrock_catalog)

    assert by_source(result.models, "anthropic") == []
    # Still "configured": the key exists, it is just not working -- which is a
    # different thing for the UI to say than "no key set".
    assert result.providers["anthropic"] == {"configured": True}
    assert len(by_source(result.models, "openai")) == 3
    assert len(by_source(result.models, "ollama")) == 2


@respx.mock
async def test_an_openai_500_degrades_to_configured_but_empty(
    catalog, bedrock_catalog, stub_bedrock
):
    respx.get(OPENAI_MODELS_URL).mock(return_value=httpx.Response(500, text="boom"))

    result = await catalog.collect(settings(openai_api_key="sk-openai-test"), bedrock_catalog)

    assert by_source(result.models, "openai") == []
    assert result.providers["openai"] == {"configured": True}


@respx.mock
async def test_a_failed_listing_is_retried_rather_than_cached(
    catalog, bedrock_catalog, stub_bedrock
):
    route = respx.get(OLLAMA_TAGS_URL).mock(side_effect=httpx.ConnectError("down"))
    config = settings(ollama_base_url=OLLAMA_BASE_URL)

    await catalog.collect(config, bedrock_catalog)
    route.mock(return_value=httpx.Response(200, json=OLLAMA_PAYLOAD))
    result = await catalog.collect(config, bedrock_catalog)

    assert len(by_source(result.models, "ollama")) == 2
    assert result.providers["ollama"]["reachable"] is True


# --------------------------------------------------------------------------- #
# Caching
# --------------------------------------------------------------------------- #


@respx.mock
async def test_each_provider_is_fetched_once_within_its_ttl(
    catalog, bedrock_catalog, stub_bedrock
):
    mock_all_ok()
    config = all_configured()

    first = await catalog.collect(config, bedrock_catalog)
    second = await catalog.collect(config, bedrock_catalog)

    assert first.cached is False
    assert second.cached is True
    assert second.models == first.models
    for url in (ANTHROPIC_MODELS_URL, OPENAI_MODELS_URL, OLLAMA_TAGS_URL):
        assert respx.get(url).call_count == 1


@respx.mock
async def test_an_expired_ttl_refetches(catalog, bedrock_catalog, stub_bedrock):
    route = respx.get(OLLAMA_TAGS_URL).mock(
        return_value=httpx.Response(200, json=OLLAMA_PAYLOAD)
    )
    config = settings(ollama_base_url=OLLAMA_BASE_URL)

    await catalog.collect(config, bedrock_catalog)
    assert catalog.is_cached("ollama")

    # Ollama's TTL is 60s -- a developer who just ran `ollama pull` should not
    # have to wait ten minutes for the model to appear.
    entries, cached_at = catalog._cache["ollama"]
    catalog._cache["ollama"] = (entries, cached_at - 61)
    assert not catalog.is_cached("ollama")

    result = await catalog.collect(config, bedrock_catalog)

    assert route.call_count == 2
    assert result.cached is False


@respx.mock
async def test_cached_is_false_when_any_single_provider_was_fetched(
    catalog, bedrock_catalog, stub_bedrock
):
    respx.get(ANTHROPIC_MODELS_URL).mock(return_value=httpx.Response(200, json=ANTHROPIC_PAYLOAD))
    anthropic_only = settings(anthropic_api_key="sk-ant-test")

    await catalog.collect(anthropic_only, bedrock_catalog)
    # A second provider turns up configured: the aggregate is no longer cached.
    respx.get(OPENAI_MODELS_URL).mock(return_value=httpx.Response(200, json=OPENAI_PAYLOAD))
    result = await catalog.collect(
        settings(anthropic_api_key="sk-ant-test", openai_api_key="sk-openai-test"),
        bedrock_catalog,
    )

    assert result.cached is False


# --------------------------------------------------------------------------- #
# The endpoints
# --------------------------------------------------------------------------- #


@pytest.fixture
def models_app(monkeypatch, catalog) -> FastAPI:
    monkeypatch.setattr(models, "_catalog", ModelCatalog())
    monkeypatch.setattr(models, "_provider_catalog", catalog)

    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(models.router, prefix="/api/v1")
    application.include_router(health.router, prefix="/api/v1")
    return application


@pytest.fixture
async def models_client(models_app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=models_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@respx.mock
async def test_models_endpoint_returns_models_providers_and_cached(
    models_client, stub_bedrock, monkeypatch
):
    monkeypatch.setenv("PROMPTATRON_ANTHROPIC_API_KEY", "sk-ant-test")
    mock_all_ok()

    response = await models_client.get("/api/v1/models")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"models", "providers", "cached"}
    assert set(body["providers"]) == {"bedrock", "anthropic", "openai", "ollama"}
    assert body["providers"]["anthropic"] == {"configured": True}
    assert body["providers"]["openai"] == {"configured": False}
    assert {entry["source"] for entry in body["models"]} == {"bedrock", "anthropic"}


@respx.mock
async def test_models_endpoint_still_502s_on_a_bedrock_failure(
    models_client, stub_bedrock, monkeypatch
):
    from botocore.exceptions import ClientError

    stub_bedrock.list_foundation_models.side_effect = ClientError(
        {"Error": {"Code": "ExpiredTokenException", "Message": "expired"}},
        "ListFoundationModels",
    )
    monkeypatch.setenv("PROMPTATRON_ANTHROPIC_API_KEY", "sk-ant-test")

    response = await models_client.get("/api/v1/models")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "upstream_error"


@respx.mock
async def test_health_mirrors_the_models_providers_block(models_client, stub_bedrock, monkeypatch):
    monkeypatch.setenv("PROMPTATRON_OLLAMA_BASE_URL", OLLAMA_BASE_URL)
    mock_all_ok()

    from_models = (await models_client.get("/api/v1/models")).json()["providers"]
    from_health = (await models_client.get("/api/v1/health")).json()["providers"]

    assert from_health == from_models
    assert from_health["ollama"] == {"configured": True, "reachable": True}


async def test_health_reports_providers_with_none_configured(models_client):
    response = await models_client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["providers"] == {
        "bedrock": {"configured": response.json()["aws"]["credentials"] == "ok"},
        "anthropic": {"configured": False},
        "openai": {"configured": False},
        "ollama": {"configured": False, "reachable": None},
    }
