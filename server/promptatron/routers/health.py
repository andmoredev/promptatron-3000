"""Health check endpoint."""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends

from promptatron import deployment, runtime_config
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
    api_url = runtime_config.config_api_url(settings).value
    if not api_url:
        return None
    url = f"{api_url.rstrip('/')}/scenarios"
    headers = {}
    api_key = runtime_config.config_api_key(settings).value
    if api_key:
        headers["x-api-key"] = api_key
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

    resolved_config_api_url = runtime_config.config_api_url(settings)

    return {
        "status": "ok",
        "aws": {
            "region": settings.aws_region,
            "credentials": credentials,
        },
        "config_store": {
            "configured": resolved_config_api_url.value is not None,
            "reachable": reachable,
            # Where config_api_url came from: an explicit env/setting value, the
            # deployed CloudFormation stack, or (null) nowhere -- unconfigured.
            "source": resolved_config_api_url.source,
        },
        # Which model providers this server can actually run against -- the same
        # object `GET /models` returns, so the UI can read it from either.
        "providers": provider_block,
        # Both an AgentCore runtime ARN and a DynamoDB table are needed before
        # the UI may offer "Cloud — persisted" (docs/cloud-evals.md).
        "cloud_evals": {
            "configured": evals_cloud.is_configured(settings),
            "source": runtime_config.cloud_evals_source(settings),
        },
        # Whether this server may execute an evaluation in its own process. A
        # deployed (Lambda) server cannot, so the UI disables "This machine" and
        # defaults to the cloud lane (docs/serverless-deploy.md).
        "local_evals": {
            "available": deployment.local_evals_available(settings),
        },
    }
