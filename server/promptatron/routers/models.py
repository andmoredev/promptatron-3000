"""Models endpoint for listing available Bedrock models."""

import logging
import time
from typing import Any

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends

from promptatron.awscat.catalog import CACHE_TTL_SECONDS, ModelCatalog
from promptatron.config import Settings, get_settings
from promptatron.errors import UpstreamError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["models"])

# Module-level singleton catalog instance
_catalog = ModelCatalog()


def _get_catalog() -> ModelCatalog:
    """Dependency to provide the model catalog."""
    return _catalog


@router.get("/models")
async def list_models(
    settings: Settings = Depends(get_settings),
    catalog: ModelCatalog = Depends(_get_catalog),
) -> dict[str, Any]:
    """List available Bedrock models for the configured region.

    Returns:
        {"models": [...], "cached": bool} where models is the list of
        model dicts (model_id, name, provider, supports_streaming, kind)
        and cached indicates whether the result was from cache.
    """
    try:
        # Check if result would be from cache before calling
        region = settings.aws_region
        cached = region in catalog._cache
        if cached:
            cached_time = catalog._cache[region][1]
            if time.time() - cached_time >= CACHE_TTL_SECONDS:
                cached = False

        models = catalog.list_models(region)
        return {"models": models, "cached": cached}
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "unknown")
        message = f"Failed to list models: {error_code}"
        logger.error(f"{message}: {e}")
        raise UpstreamError(message, detail={"error_code": error_code}) from e
