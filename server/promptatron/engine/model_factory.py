"""Model construction for a run, plus error classification for the stream.

``build_model`` turns a :class:`~promptatron.engine.schemas.RunRequest` into a
Strands model provider, branching on ``request.provider``: a ``BedrockModel``,
``AnthropicModel``, ``OpenAIModel`` or ``OllamaModel``, or the scripted
``FakeModel`` when ``PROMPTATRON_FAKE_MODEL`` is set (no network calls anywhere
in the test suite). The fake-model check comes first and short-circuits
everything, provider included.

Mapping ``InferenceConfig``
---------------------------
The four SDKs spell the same three knobs three different ways, so each branch
translates rather than splats:

===========  ======================================================================
Provider     ``temperature`` / ``top_p`` / ``max_tokens``
===========  ======================================================================
bedrock      top-level model-config keys (``BedrockModel`` names them identically)
anthropic    ``max_tokens`` is a top-level key **and is mandatory** -- Anthropic's
             Messages API has no default, so an unset value becomes
             :data:`ANTHROPIC_DEFAULT_MAX_TOKENS`. The other two go in ``params``.
openai       all three go in ``params``, forwarded verbatim into the chat
             completions body
ollama       all three are top-level ``OllamaConfig`` keys (Strands rewrites
             ``max_tokens`` to ``options.num_predict``)
===========  ======================================================================

Nothing in ``InferenceConfig`` is unmappable, so nothing is silently dropped.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from strands.models.model import Model
from strands.types.exceptions import (
    ContextWindowOverflowException,
    MaxTokensReachedException,
    ModelThrottledException,
)

from promptatron.config import Settings
from promptatron.engine.fake_model import FakeModel, Text
from promptatron.engine.schemas import RunRequest
from promptatron.errors import AppError, BadRequestError
from promptatron.providers import CREDENTIAL_ENV_VARS, Provider

ModelFactory = Callable[[RunRequest], Model]

#: Anthropic's Messages API requires ``max_tokens`` on every request and defines
#: no default, so a request that did not set one still needs a number here.
ANTHROPIC_DEFAULT_MAX_TOKENS = 4096

# Bedrock error codes worth retrying, beyond throttling itself.
_RETRYABLE_AWS_CODES = frozenset(
    {
        "ThrottlingException",
        "throttlingException",
        "TooManyRequestsException",
        "ServiceUnavailableException",
        "InternalServerException",
        "ModelTimeoutException",
        "ModelNotReadyException",
        "RequestTimeout",
    }
)


def default_fake_script(request: RunRequest) -> list[Text]:
    """The canned reply ``PROMPTATRON_FAKE_MODEL`` runs produce.

    Deterministic and visibly fake, streamed as several deltas so a dev server
    exercises the whole NDJSON path. Tests script their own ``FakeModel`` and
    inject it through the engine's ``model_factory`` seam instead of this.
    """
    return [
        Text("[fake-model] "),
        Text(f"echoing {len(request.user_prompt)} prompt characters "),
        Text(f"for {request.model_id}."),
    ]


def require_credential(provider: Provider, credential: str | None) -> str:
    """Return ``credential``, or refuse the run with ``provider_not_configured``."""
    if credential:
        return credential
    raise BadRequestError(
        f"Provider {provider!r} is not configured on this server; "
        f"set {CREDENTIAL_ENV_VARS[provider]}",
        detail={"provider": provider},
        code="provider_not_configured",
    )


def build_model(request: RunRequest, settings: Settings) -> Model:
    """Build the model provider for ``request``, branching on ``request.provider``."""
    if settings.fake_model:
        return FakeModel(
            script=default_fake_script(request),
            model_id=request.model_id,
            **request.inference.as_model_config(),
        )

    match request.provider:
        case "anthropic":
            return _build_anthropic(request, settings)
        case "openai":
            return _build_openai(request, settings)
        case "ollama":
            return _build_ollama(request, settings)
        case _:
            return _build_bedrock(request, settings)


def _build_bedrock(request: RunRequest, settings: Settings) -> Model:
    """A ``BedrockModel``, optionally wired to a guardrail.

    Guardrails are passed through as Bedrock's ``guardrail_*`` model config keys;
    the request's boolean ``trace`` maps onto Bedrock's ``"enabled"``/``"disabled"``
    trace mode. (``RunRequest`` has already rejected guardrails on every other
    provider, so this is the only branch that looks at them.)
    """
    # Imported lazily so a fake-model run never constructs a boto session.
    from strands.models.bedrock import BedrockModel

    model_config: dict[str, Any] = {
        "model_id": request.model_id,
        "streaming": True,
        **request.inference.as_model_config(),
    }
    if request.guardrail is not None:
        model_config["guardrail_id"] = request.guardrail.id
        model_config["guardrail_version"] = request.guardrail.version
        model_config["guardrail_trace"] = "enabled" if request.guardrail.trace else "disabled"

    return BedrockModel(region_name=settings.aws_region, **model_config)


def _build_anthropic(request: RunRequest, settings: Settings) -> Model:
    """An ``AnthropicModel``. Always streams -- the SDK has no non-streaming mode."""
    from strands.models.anthropic import AnthropicModel

    api_key = require_credential("anthropic", settings.anthropic_api_key)
    inference = request.inference
    params = {
        key: value
        for key, value in (("temperature", inference.temperature), ("top_p", inference.top_p))
        if value is not None
    }
    return AnthropicModel(
        client_args={"api_key": api_key},
        model_id=request.model_id,
        max_tokens=inference.max_tokens or ANTHROPIC_DEFAULT_MAX_TOKENS,
        params=params,
    )


def _build_openai(request: RunRequest, settings: Settings) -> Model:
    """An ``OpenAIModel``. ``params`` is forwarded verbatim into the request body.

    Note that OpenAI's reasoning families (``o1``/``o3``/``o4``) reject
    ``temperature``/``top_p`` and want ``max_completion_tokens`` rather than
    ``max_tokens``; we forward what the caller asked for rather than guessing
    per-family, so the API's own 400 is what surfaces.
    """
    from strands.models.openai import OpenAIModel

    api_key = require_credential("openai", settings.openai_api_key)
    return OpenAIModel(
        client_args={"api_key": api_key},
        model_id=request.model_id,
        stream=True,
        params=request.inference.as_model_config(),
    )


def _build_ollama(request: RunRequest, settings: Settings) -> Model:
    """An ``OllamaModel`` pointed at the configured server. Always streams."""
    from strands.models.ollama import OllamaModel

    base_url = require_credential("ollama", settings.ollama_base_url)
    return OllamaModel(
        base_url,
        model_id=request.model_id,
        **request.inference.as_model_config(),
    )


def classify_error(exc: BaseException) -> tuple[str, str, bool]:
    """Map an exception onto ``(code, message, retryable)`` for the error event."""
    match exc:
        case ModelThrottledException():
            return "model_throttled", str(exc), True

        case AppError():
            # A refusal we raised ourselves (e.g. `provider_not_configured` from
            # build_model). Keep its own code rather than flattening it to
            # `internal_error` -- the client can act on it.
            return exc.code, exc.message, False

        case ClientError():
            aws_code = exc.response.get("Error", {}).get("Code", "ClientError")
            retryable = aws_code in _RETRYABLE_AWS_CODES
            throttled = aws_code in ("ThrottlingException", "throttlingException")
            code = "model_throttled" if throttled else "model_error"
            return code, str(exc), retryable

        case BotoCoreError():
            return "model_error", str(exc), True

        case ContextWindowOverflowException():
            return "context_window_overflow", str(exc), False

        case MaxTokensReachedException():
            return "max_tokens_reached", str(exc), False

        case _:
            return "internal_error", str(exc) or exc.__class__.__name__, False
