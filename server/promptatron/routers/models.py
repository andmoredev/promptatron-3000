"""Models endpoint: the model picker's whole source of truth.

Returns every model reachable from this server across all four providers, plus
which providers are configured, so the UI can grey out (and explain) the ones
that are not. Each entry's ``source`` is the value to send back as
``provider`` on ``POST /runs``.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends

from promptatron.awscat.catalog import ModelCatalog
from promptatron.config import Settings, get_settings
from promptatron.models_catalog import ProviderCatalog
from promptatron.models_catalog import catalog as provider_catalog_singleton

logger = logging.getLogger(__name__)

router = APIRouter(tags=["models"])

# Module-level singleton catalog instance
_catalog = ModelCatalog()


def _get_catalog() -> ModelCatalog:
    """Dependency to provide the Bedrock model catalog."""
    return _catalog


_provider_catalog = provider_catalog_singleton


def _get_provider_catalog() -> ProviderCatalog:
    """Dependency to provide the multi-provider catalog."""
    return _provider_catalog


@router.get("/models")
async def list_models(
    settings: Settings = Depends(get_settings),
    catalog: ModelCatalog = Depends(_get_catalog),
    provider_catalog: ProviderCatalog = Depends(_get_provider_catalog),
) -> dict[str, Any]:
    """List every available model, across every configured provider.

    Returns:
        ``{"models": [...], "providers": {...}, "cached": bool}``. Each model is
        ``{model_id, name, provider, supports_streaming, kind, source}``;
        ``providers`` reports ``configured`` per provider (plus ``reachable``
        for Ollama); ``cached`` is true only when *every* listing came from
        cache.

    Every provider degrades the same way: a failing listing contributes an
    empty list (with its ``configured`` flag intact) rather than failing the
    request, so this endpoint always returns 200.
    """
    result = await provider_catalog.collect(settings, catalog)

    return {
        "models": result.models,
        "providers": result.providers,
        "cached": result.cached,
    }
