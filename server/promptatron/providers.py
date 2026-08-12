"""Model providers: the routing key shared by runs, the catalog and /health.

One vocabulary, used in three places:

``RunRequest.provider`` / ``GraderConfig.provider``
    Which SDK the run (or the judge) is executed through --
    :mod:`promptatron.engine.model_factory` branches on it.
``GET /models``
    Every catalog entry carries ``source``, which is exactly this value; the UI
    sends it straight back as ``provider`` on the next run.
``GET /models`` and ``GET /health``
    Both report a ``providers`` block saying which of the four are configured.

"Configured" is deliberately a *local* check -- a resolvable credential, not a
reachable endpoint -- so it is cheap enough for every health poll. Ollama is the
exception: a base URL says nothing about whether anything is listening, so it
additionally reports ``reachable`` (see :mod:`promptatron.models_catalog`).
"""

from __future__ import annotations

import logging
from typing import Literal

from promptatron.config import Settings

logger = logging.getLogger(__name__)

Provider = Literal["bedrock", "anthropic", "openai", "ollama"]

#: Every provider, in the order they are listed by ``GET /models``.
PROVIDERS: tuple[Provider, ...] = ("bedrock", "anthropic", "openai", "ollama")

DEFAULT_PROVIDER: Provider = "bedrock"

#: Human-facing label -- the ``provider`` field of a catalog entry. (Bedrock
#: entries keep the *model vendor* AWS reports there instead, e.g. "Anthropic"
#: for ``anthropic.claude-*``; ``source`` is what disambiguates the two.)
DISPLAY_NAMES: dict[Provider, str] = {
    "bedrock": "Bedrock",
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "ollama": "Ollama",
}

#: The env var a user is told to set when a provider is not configured.
CREDENTIAL_ENV_VARS: dict[Provider, str] = {
    "bedrock": "AWS_PROFILE",
    "anthropic": "PROMPTATRON_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY)",
    "openai": "PROMPTATRON_OPENAI_API_KEY (or OPENAI_API_KEY)",
    "ollama": "PROMPTATRON_OLLAMA_BASE_URL (or OLLAMA_HOST)",
}

CredentialStatus = Literal["ok", "missing", "error"]


def aws_credentials_status() -> CredentialStatus:
    """Check whether AWS credentials are resolvable, without a network call."""
    # Imported lazily: this module is pulled in by the request schemas, which a
    # fake-model run must be able to load without constructing a boto session.
    import botocore.session

    try:
        session = botocore.session.Session()
        credentials = session.get_credentials()
    except Exception:
        logger.exception("Failed to resolve AWS credentials")
        return "error"
    return "ok" if credentials is not None else "missing"


def credential_for(provider: Provider, settings: Settings) -> str | None:
    """The configured credential (or base URL) for ``provider``, if any."""
    match provider:
        case "anthropic":
            return settings.anthropic_api_key
        case "openai":
            return settings.openai_api_key
        case "ollama":
            return settings.ollama_base_url
        case _:
            return None


def is_configured(provider: Provider, settings: Settings) -> bool:
    """Whether ``provider`` has everything it needs to be selected for a run."""
    if provider == "bedrock":
        return aws_credentials_status() == "ok"
    return bool(credential_for(provider, settings))
