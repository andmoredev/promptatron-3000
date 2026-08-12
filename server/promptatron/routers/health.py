"""Health check endpoint."""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends

from promptatron.config import Settings, get_settings
from promptatron.evals import cloud as evals_cloud
from promptatron.models_catalog import catalog as provider_catalog
from promptatron.providers import CredentialStatus, aws_credentials_status

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])

#: The same check ``providers.bedrock.configured`` is derived from, kept under
#: its original name because ``aws.credentials`` reports all three states.
_check_aws_credentials = aws_credentials_status


async def _check_config_store(settings: Settings) -> bool | None:
    """Check whether the config store is reachable. None if not configured."""
    if not settings.config_api_url:
        return None
    url = f"{settings.config_api_url.rstrip('/')}/scenarios"
    headers = {}
    if settings.config_api_key:
        headers["x-api-key"] = settings.config_api_key
    try:
        async with httpx.AsyncClient(timeout=1.0) as client:
            response = await client.get(url, params={"limit": 1}, headers=headers)
        return response.status_code < 500
    except Exception:
        logger.exception("Config store reachability check failed")
        return False


async def _check_providers(settings: Settings) -> dict[str, Any]:
    """The ``providers`` block, identical to the one ``GET /models`` returns.

    Shares the catalog singleton, so a health poll reuses (and warms) the same
    per-provider caches rather than re-probing Ollama every few seconds.
    """
    return await provider_catalog.provider_status(settings)


@router.get("/health")
async def health(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Report overall service health. This endpoint should never raise."""
    credentials: CredentialStatus
    try:
        credentials = _check_aws_credentials()
    except Exception:
        logger.exception("Unexpected error during AWS credentials check")
        credentials = "error"

    try:
        reachable = await _check_config_store(settings)
    except Exception:
        logger.exception("Unexpected error during config store check")
        reachable = False

    try:
        provider_block = await _check_providers(settings)
    except Exception:
        logger.exception("Unexpected error during provider check")
        provider_block = {
            "bedrock": {"configured": credentials == "ok"},
            "anthropic": {"configured": False},
            "openai": {"configured": False},
            "ollama": {"configured": False, "reachable": None},
        }

    return {
        "status": "ok",
        "aws": {
            "region": settings.aws_region,
            "credentials": credentials,
        },
        "config_store": {
            "configured": settings.config_api_url is not None,
            "reachable": reachable,
        },
        # Which model providers this server can actually run against -- the same
        # object `GET /models` returns, so the UI can read it from either.
        "providers": provider_block,
        # Both an AgentCore runtime ARN and a DynamoDB table are needed before
        # the UI may offer "Cloud — persisted" (docs/cloud-evals.md).
        "cloud_evals": {"configured": evals_cloud.is_configured(settings)},
    }
