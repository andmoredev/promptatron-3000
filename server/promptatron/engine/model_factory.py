"""Model construction for a run, plus error classification for the stream.

``build_model`` turns a :class:`~promptatron.engine.schemas.RunRequest` into a
Strands model provider: a real ``BedrockModel`` normally, or the scripted
``FakeModel`` when ``PROMPTATRON_FAKE_MODEL`` is set (no AWS calls anywhere in
the test suite).
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

ModelFactory = Callable[[RunRequest], Model]

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


def build_model(request: RunRequest, settings: Settings) -> Model:
    """Build the model provider for ``request``.

    Guardrails are passed through as Bedrock's ``guardrail_*`` model config keys;
    the request's boolean ``trace`` maps onto Bedrock's ``"enabled"``/``"disabled"``
    trace mode.
    """
    if settings.fake_model:
        return FakeModel(
            script=default_fake_script(request),
            model_id=request.model_id,
            **request.inference.as_model_config(),
        )

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


def classify_error(exc: BaseException) -> tuple[str, str, bool]:
    """Map an exception onto ``(code, message, retryable)`` for the error event."""
    match exc:
        case ModelThrottledException():
            return "model_throttled", str(exc), True

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
