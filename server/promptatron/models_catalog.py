"""The multi-provider model catalog behind ``GET /models``.

Four independent listings -- Bedrock (:mod:`promptatron.awscat.catalog`),
Anthropic, OpenAI, Ollama -- merged into one flat list where every entry carries
a ``source``, plus a ``providers`` block saying which are configured.

Degradation
-----------
A provider that is not configured contributes nothing and is not called. A
provider that *is* configured but fails -- expired key, 401, a laptop's Ollama
that isn't running -- contributes an empty list and is logged, never an error:
one dead provider must not take the model picker down for the other three.

The one exception is Bedrock, which keeps its pre-existing behaviour of
surfacing a ``ClientError`` as a ``502`` from the endpoint. Bedrock is the
default provider and a silent empty list there reads as "your account has no
models" rather than "your credentials expired", which is the more expensive
mistake.

Caching
-------
Per provider, so a slow provider is only slow once: 600s for the three remote
catalogs (they change on the order of weeks) and 60s for Ollama, whose list
changes the moment a developer runs ``ollama pull``.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

from promptatron import providers as providers_mod
from promptatron.awscat.catalog import ModelCatalog
from promptatron.config import Settings
from promptatron.providers import Provider

logger = logging.getLogger(__name__)

#: Cache lifetime per provider, in seconds.
CACHE_TTL_SECONDS: dict[Provider, int] = {
    "bedrock": 600,
    "anthropic": 600,
    "openai": 600,
    "ollama": 60,
}

#: How long any single provider listing may take before it counts as failed.
#: Short on purpose: ``GET /models`` fans out and the user is waiting on all of it.
REMOTE_TIMEOUT_SECONDS = 5.0
OLLAMA_TIMEOUT_SECONDS = 3.0

ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models"
#: Required on every Anthropic REST call; unrelated to the model list's contents.
ANTHROPIC_VERSION = "2023-06-01"
#: The endpoint's maximum page size. The catalog is ~dozens of models, so one
#: page is the whole thing and there is no pagination loop to get wrong.
ANTHROPIC_PAGE_LIMIT = 1000

OPENAI_MODELS_URL = "https://api.openai.com/v1/models"

#: ``/v1/models`` lists *every* model on the account -- embeddings, audio,
#: image, moderation -- with no capability flags to filter on, so the families
#: are filtered by name. Chat-capable families start with one of these...
OPENAI_CHAT_PREFIXES = ("gpt-", "chatgpt-", "o1", "o3", "o4")
#: ...minus the non-chat variants that share those prefixes. `instruct` catches
#: `gpt-3.5-turbo-instruct` (completions-only); the rest are modality-specific
#: endpoints that the chat completions API will not accept.
OPENAI_EXCLUDED_TOKENS = (
    "embedding",
    "tts",
    "whisper",
    "dall-e",
    "moderation",
    "audio",
    "realtime",
    "transcribe",
    "image",
    "search",
    "instruct",
)

#: ``kind`` for providers that have exactly one sort of model. Bedrock is the
#: only one that distinguishes (``foundation-model`` vs ``inference-profile``).
PLAIN_MODEL_KIND = "model"

ModelEntry = dict[str, Any]


@dataclass
class Listing:
    """One provider's contribution to the catalog."""

    models: list[ModelEntry] = field(default_factory=list)
    configured: bool = False
    #: Only Ollama reports this; ``None`` means "not configured, so not probed".
    reachable: bool | None = None
    #: Whether this listing was served from cache. ``True`` when nothing was
    #: fetched at all, so an all-unconfigured catalog still reads as cached.
    cached: bool = True


@dataclass
class CatalogResult:
    """The whole ``GET /models`` payload, pre-serialization."""

    models: list[ModelEntry]
    providers: dict[str, dict[str, Any]]
    cached: bool


# --------------------------------------------------------------------------- #
# Per-provider fetchers
# --------------------------------------------------------------------------- #


async def fetch_anthropic_models(api_key: str) -> list[ModelEntry]:
    """List the Anthropic models this key can see. Raises on any failure."""
    async with httpx.AsyncClient(timeout=REMOTE_TIMEOUT_SECONDS) as client:
        response = await client.get(
            ANTHROPIC_MODELS_URL,
            params={"limit": ANTHROPIC_PAGE_LIMIT},
            headers={"x-api-key": api_key, "anthropic-version": ANTHROPIC_VERSION},
        )
    response.raise_for_status()
    return [
        {
            "model_id": item["id"],
            "name": item.get("display_name") or item["id"],
            "provider": providers_mod.DISPLAY_NAMES["anthropic"],
            "supports_streaming": True,
            "kind": PLAIN_MODEL_KIND,
            "source": "anthropic",
        }
        for item in response.json().get("data") or []
        if item.get("id")
    ]


def is_openai_chat_model(model_id: str) -> bool:
    """Whether ``model_id`` is one of the chat-completions families."""
    lowered = model_id.lower()
    if not lowered.startswith(OPENAI_CHAT_PREFIXES):
        return False
    return not any(token in lowered for token in OPENAI_EXCLUDED_TOKENS)


async def fetch_openai_models(api_key: str) -> list[ModelEntry]:
    """List the chat-capable OpenAI models this key can see. Raises on failure."""
    async with httpx.AsyncClient(timeout=REMOTE_TIMEOUT_SECONDS) as client:
        response = await client.get(
            OPENAI_MODELS_URL, headers={"Authorization": f"Bearer {api_key}"}
        )
    response.raise_for_status()
    return [
        {
            "model_id": item["id"],
            "name": item["id"],
            "provider": providers_mod.DISPLAY_NAMES["openai"],
            "supports_streaming": True,
            "kind": PLAIN_MODEL_KIND,
            "source": "openai",
        }
        for item in response.json().get("data") or []
        if item.get("id") and is_openai_chat_model(item["id"])
    ]


async def fetch_ollama_models(base_url: str) -> list[ModelEntry]:
    """List the models pulled onto the Ollama server. Raises on failure."""
    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
        response = await client.get(f"{base_url.rstrip('/')}/api/tags")
    response.raise_for_status()
    return [
        {
            # Ollama identifies a model by its `name:tag` string, which is also
            # the only human-readable label it has.
            "model_id": item["name"],
            "name": item["name"],
            "provider": providers_mod.DISPLAY_NAMES["ollama"],
            "supports_streaming": True,
            "kind": PLAIN_MODEL_KIND,
            "source": "ollama",
        }
        for item in response.json().get("models") or []
        if item.get("name")
    ]


# --------------------------------------------------------------------------- #
# Aggregation
# --------------------------------------------------------------------------- #


class ProviderCatalog:
    """Caches and merges the non-Bedrock listings.

    Bedrock's cache lives in :class:`~promptatron.awscat.catalog.ModelCatalog`
    (which is keyed by region and predates this class); that instance is passed
    in so the router can swap it, and so a fake-credentials test can drive the
    whole aggregate through one boto stub.
    """

    def __init__(self) -> None:
        self._cache: dict[Provider, tuple[list[ModelEntry], float]] = {}

    def clear(self) -> None:
        """Drop every cached listing (tests, and a future cache-bust endpoint)."""
        self._cache.clear()

    def is_cached(self, provider: Provider) -> bool:
        entry = self._cache.get(provider)
        return entry is not None and time.time() - entry[1] < CACHE_TTL_SECONDS[provider]

    async def _listing(
        self,
        provider: Provider,
        credential: str | None,
        fetch: Callable[[str], Awaitable[list[ModelEntry]]],
    ) -> Listing:
        """Fetch (or reuse) one provider's models, degrading to empty on failure."""
        if not credential:
            return Listing(configured=False)

        if self.is_cached(provider):
            return Listing(
                models=list(self._cache[provider][0]),
                configured=True,
                reachable=True,
                cached=True,
            )

        try:
            models = await fetch(credential)
        except Exception:
            # Never fatal: the other providers still have a catalog to show.
            logger.warning("Failed to list %s models", provider, exc_info=True)
            return Listing(configured=True, reachable=False, cached=False)

        self._cache[provider] = (models, time.time())
        return Listing(models=models, configured=True, reachable=True, cached=False)

    async def _listings(self, settings: Settings) -> dict[Provider, Listing]:
        """Every non-Bedrock provider's listing."""
        return {
            "anthropic": await self._listing(
                "anthropic", settings.anthropic_api_key, fetch_anthropic_models
            ),
            "openai": await self._listing(
                "openai", settings.openai_api_key, fetch_openai_models
            ),
            "ollama": await self._listing(
                "ollama", settings.ollama_base_url, fetch_ollama_models
            ),
        }

    async def provider_status(self, settings: Settings) -> dict[str, dict[str, Any]]:
        """The ``providers`` block, shared verbatim by ``/models`` and ``/health``."""
        listings = await self._listings(settings)
        return _provider_block(
            bedrock_configured=providers_mod.is_configured("bedrock", settings),
            listings=listings,
        )

    async def collect(self, settings: Settings, bedrock: ModelCatalog) -> CatalogResult:
        """Build the whole ``GET /models`` payload.

        Raises:
            ClientError: if the Bedrock listing fails (see the module docstring).
        """
        # Bedrock is always listed, configured or not: the credential check is
        # advisory, and a listing that works despite it (an assumed role, say)
        # should still show up.
        bedrock_cached = bedrock.is_cached(settings.aws_region)
        models = list(bedrock.list_models(settings.aws_region))

        listings = await self._listings(settings)
        for provider in ("anthropic", "openai", "ollama"):
            models.extend(listings[provider].models)

        return CatalogResult(
            models=models,
            providers=_provider_block(
                bedrock_configured=providers_mod.is_configured("bedrock", settings),
                listings=listings,
            ),
            cached=bedrock_cached and all(listing.cached for listing in listings.values()),
        )


def _provider_block(
    *, bedrock_configured: bool, listings: dict[Provider, Listing]
) -> dict[str, dict[str, Any]]:
    return {
        "bedrock": {"configured": bedrock_configured},
        "anthropic": {"configured": listings["anthropic"].configured},
        "openai": {"configured": listings["openai"].configured},
        "ollama": {
            "configured": listings["ollama"].configured,
            "reachable": listings["ollama"].reachable,
        },
    }


#: Process-wide catalog, shared by ``GET /models`` and ``GET /health`` so a
#: health poll and a model listing do not each pay for their own Ollama probe.
catalog = ProviderCatalog()
