"""Tests for GET /api/v1/models endpoint."""

from collections.abc import AsyncIterator
from unittest.mock import MagicMock, patch

import httpx
import pytest
from botocore.exceptions import ClientError
from fastapi import FastAPI

from promptatron.awscat.catalog import ModelCatalog
from promptatron.errors import register_exception_handlers
from promptatron.routers import models

# Test fixtures

@pytest.fixture
def app(monkeypatch) -> FastAPI:
    """Create a FastAPI app with the models router with a fresh catalog."""
    # Create a fresh catalog for each test
    fresh_catalog = ModelCatalog()

    # Patch the module-level catalog
    monkeypatch.setattr(models, "_catalog", fresh_catalog)

    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(models.router, prefix="/api/v1")
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    """An async HTTP client wired to the test app."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.fixture
def mock_bedrock_client() -> MagicMock:
    """Create a mock Bedrock client with realistic responses."""
    client = MagicMock()

    # Mock list_foundation_models response
    client.list_foundation_models.return_value = {
        "modelSummaries": [
            {
                "modelId": "anthropic.claude-3-sonnet-20240229-v1:0",
                "modelName": "Claude 3 Sonnet",
                "providerName": "Anthropic",
                "inferenceTypesSupported": ["ON_DEMAND"],
                "outputModalities": ["TEXT"],
                "responseStreamingSupported": True,
            },
            {
                "modelId": "anthropic.claude-3-opus-20240229-v1:0",
                "modelName": "Claude 3 Opus",
                "providerName": "Anthropic",
                "inferenceTypesSupported": ["ON_DEMAND", "PROVISIONED"],
                "outputModalities": ["TEXT"],
                "responseStreamingSupported": True,
            },
            {
                "modelId": "amazon.titan-embed-text-v2:0",
                "modelName": "Titan Embeddings",
                "providerName": "Amazon",
                "inferenceTypesSupported": ["ON_DEMAND"],
                "outputModalities": ["EMBEDDING"],  # Should be filtered out
                "responseStreamingSupported": False,
            },
            {
                "modelId": "meta.llama3-70b-instruct-v1:0",
                "modelName": "Llama 3 70B Instruct",
                "providerName": "Meta",
                "inferenceTypesSupported": ["PROVISIONED"],  # Should be filtered out
                "outputModalities": ["TEXT"],
                "responseStreamingSupported": True,
            },
            {
                "modelId": "cohere.command-r-v1:0",
                "modelName": "Command R",
                "providerName": "Cohere",
                "inferenceTypesSupported": ["ON_DEMAND"],
                "outputModalities": ["TEXT"],
                # responseStreamingSupported missing - should default to True
            },
        ]
    }

    # Mock list_inference_profiles with paginator
    mock_paginator = MagicMock()
    mock_paginator.paginate.return_value = [
        {
            "inferenceProfileSummaries": [
                {
                    "inferenceProfileId": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
                    "inferenceProfileName": "Claude 3.5 Sonnet (US)",
                    "models": [
                        {
                            "modelArn": (
                                "arn:aws:bedrock:us-east-1::foundation-model/"
                                "anthropic.claude-3-5-sonnet-20241022-v2:0"
                            )
                        }
                    ],
                },
                {
                    "inferenceProfileId": "eu.anthropic.claude-3-5-sonnet-20241022-v2:0",
                    "inferenceProfileName": "Claude 3.5 Sonnet (EU)",
                    "models": [],  # No model ARN - should return empty provider
                },
            ]
        }
    ]
    client.get_paginator.return_value = mock_paginator

    return client


# Tests for filtering

async def test_list_models_filters_embedding_only_models(client, mock_bedrock_client):
    """Embedding-only models should be filtered out."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        models_list = body["models"]

        # amazon.titan-embed-text-v2:0 should not be in the list
        model_ids = [m["model_id"] for m in models_list]
        assert "amazon.titan-embed-text-v2:0" not in model_ids


async def test_list_models_filters_provisioned_only_models(client, mock_bedrock_client):
    """PROVISIONED-only models should be filtered out."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        models_list = body["models"]

        # meta.llama3-70b-instruct-v1:0 should not be in the list
        model_ids = [m["model_id"] for m in models_list]
        assert "meta.llama3-70b-instruct-v1:0" not in model_ids


# Tests for mapping

async def test_list_models_response_shape(client, mock_bedrock_client):
    """Response should have correct structure."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()

        assert "models" in body
        assert "cached" in body
        assert isinstance(body["models"], list)
        assert isinstance(body["cached"], bool)


async def test_list_models_model_structure(client, mock_bedrock_client):
    """Each model should have required keys."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        models_list = body["models"]

        assert len(models_list) > 0
        for model in models_list:
            assert "model_id" in model
            assert "name" in model
            assert "provider" in model
            assert "supports_streaming" in model
            assert "kind" in model


async def test_list_models_foundation_model_mapping(client, mock_bedrock_client):
    """Foundation models should be mapped correctly."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        models_list = body["models"]

        # Find Claude 3 Sonnet
        sonnet = next((m for m in models_list if "sonnet" in m["model_id"].lower()), None)
        assert sonnet is not None
        assert sonnet["model_id"] == "anthropic.claude-3-sonnet-20240229-v1:0"
        assert sonnet["name"] == "Claude 3 Sonnet"
        assert sonnet["provider"] == "Anthropic"
        assert sonnet["supports_streaming"] is True
        assert sonnet["kind"] == "foundation-model"


async def test_list_models_default_streaming_support(client, mock_bedrock_client):
    """Models without responseStreamingSupported should default to True."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        models_list = body["models"]

        # Find Command R (missing responseStreamingSupported)
        command_r = next(
            (m for m in models_list if "command-r" in m["model_id"].lower()), None
        )
        assert command_r is not None
        assert command_r["supports_streaming"] is True


async def test_list_models_inference_profile_mapping(client, mock_bedrock_client):
    """Inference profiles should be mapped correctly."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        models_list = body["models"]

        # Find inference profile
        profile = next(
            (m for m in models_list if m.get("kind") == "inference-profile"), None
        )
        assert profile is not None
        assert profile["kind"] == "inference-profile"
        assert profile["supports_streaming"] is True


# Tests for merge order

async def test_list_models_foundation_models_before_profiles(client, mock_bedrock_client):
    """Foundation models should come before inference profiles."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        models_list = body["models"]

        # Find the index of the last foundation model and first profile
        foundation_indices = [
            i for i, m in enumerate(models_list) if m["kind"] == "foundation-model"
        ]
        profile_indices = [
            i for i, m in enumerate(models_list) if m["kind"] == "inference-profile"
        ]

        if foundation_indices and profile_indices:
            assert max(foundation_indices) < min(profile_indices)


# Tests for caching

async def test_list_models_cache_not_hit_on_first_request(client, mock_bedrock_client):
    """First request should not be from cache."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        assert body["cached"] is False


async def test_list_models_cache_hit_on_second_request(client, mock_bedrock_client):
    """Second request should be from cache."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        # First request
        await client.get("/api/v1/models")
        # Second request
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        assert body["cached"] is True


async def test_list_models_boto_client_called_once_across_two_requests(
    client, mock_bedrock_client
):
    """Boto3 client should only be constructed once due to caching."""
    with patch(
        "promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client
    ) as mock_boto_client:
        # First request
        await client.get("/api/v1/models")
        # Second request
        await client.get("/api/v1/models")

        # boto3.client() should only be called once (first request)
        # Subsequent calls come from cache
        assert mock_boto_client.call_count == 1


# Tests for error handling

async def test_list_models_bedrock_error_mapping(client, mock_bedrock_client):
    """ClientError from boto3 should map to UpstreamError."""
    mock_bedrock_client.list_foundation_models.side_effect = ClientError(
        {"Error": {"Code": "ValidationException", "Message": "Invalid region"}},
        "ListFoundationModels",
    )

    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 502
        body = response.json()
        assert body["error"]["code"] == "upstream_error"
        assert "ValidationException" in body["error"]["message"]


async def test_list_models_inference_profile_error(client, mock_bedrock_client):
    """ClientError from inference profiles should map to UpstreamError."""
    mock_paginator = MagicMock()
    mock_paginator.paginate.side_effect = ClientError(
        {"Error": {"Code": "AccessDeniedException", "Message": "Access denied"}},
        "ListInferenceProfiles",
    )
    mock_bedrock_client.get_paginator.return_value = mock_paginator

    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 502
        body = response.json()
        assert body["error"]["code"] == "upstream_error"


# Integration test

async def test_list_models_full_integration(client, mock_bedrock_client):
    """Full integration test with realistic data."""
    with patch("promptatron.awscat.catalog.boto3.client", return_value=mock_bedrock_client):
        response = await client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()

        models_list = body["models"]

        # Should have foundation models (3 valid ones: sonnet, opus, command-r)
        # and inference profiles (2)
        assert len(models_list) == 5

        # Check that we have both types
        kinds = {m["kind"] for m in models_list}
        assert "foundation-model" in kinds
        assert "inference-profile" in kinds

        # Verify filtering worked
        model_ids = [m["model_id"] for m in models_list]
        assert "anthropic.claude-3-sonnet-20240229-v1:0" in model_ids
        assert "anthropic.claude-3-opus-20240229-v1:0" in model_ids
        assert "cohere.command-r-v1:0" in model_ids
        assert "amazon.titan-embed-text-v2:0" not in model_ids
        assert "meta.llama3-70b-instruct-v1:0" not in model_ids
