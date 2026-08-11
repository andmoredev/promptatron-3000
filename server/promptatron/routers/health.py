"""Health check endpoint."""

import logging
from typing import Any, Literal

import botocore.session
import httpx
from fastapi import APIRouter, Depends

from promptatron.config import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])

CredentialStatus = Literal["ok", "missing", "error"]


def _check_aws_credentials() -> CredentialStatus:
    """Check whether AWS credentials are resolvable, without making a network call."""
    try:
        session = botocore.session.Session()
        credentials = session.get_credentials()
    except Exception:
        logger.exception("Failed to resolve AWS credentials")
        return "error"
    return "ok" if credentials is not None else "missing"


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


@router.get("/health")
async def health(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Report overall service health. This endpoint should never raise."""
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
    }
