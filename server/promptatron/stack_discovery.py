"""Auto-discover deploy-time settings from the deployed ``api/`` CloudFormation stack.

Four settings that historically had to be hand-copied out of ``sam deploy``
output/``aws apigateway get-api-key`` are all things the stack already knows:

======================  ================================================
setting                 stack source
======================  ================================================
``config_api_url``      Output ``ApiEndpoint``
``config_api_key``      Output ``ApiKeyId`` -> ``apigateway get-api-key --include-value``
``eval_table``          Output ``TableName``
``eval_runtime_arn``    Output ``EvalWorkerRuntimeArn`` (absent until the worker is deployed)
======================  ================================================

:func:`discover` is the only entry point. It is deliberately forgiving: a
missing stack, absent AWS credentials, or an access-denied response are all
the *ordinary* state for fake-mode and local-only users who have never
deployed anything, so none of them raise -- they degrade to an all-``None``
:class:`StackConfig` with a single concise log line. Nothing here is called
at import time; see ``promptatron.runtime_config`` for the lazy, precedence-
aware layer callers actually use.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

import boto3

from promptatron.config import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StackConfig:
    """The four deploy-time settings as read from the stack, or ``None`` each."""

    config_api_url: str | None = None
    config_api_key: str | None = None
    eval_table: str | None = None
    eval_runtime_arn: str | None = None


_EMPTY = StackConfig()

#: Process-lifetime cache, keyed by stack name. A plain dict guarded by a lock
#: is enough for asyncio: FastAPI runs sync dependencies in a threadpool, so
#: concurrent first-callers are a real (if narrow) race without it.
_lock = threading.Lock()
_cache: dict[str, StackConfig] = {}


def discover(settings: Settings) -> StackConfig:
    """The stack's outputs for the four settings, cached per ``settings.stack_name``.

    Safe to call unconditionally and repeatedly -- the first call per stack
    name does the real work (one ``describe_stacks`` plus, if ``ApiKeyId`` is
    present, one ``get_api_key``); every later call for that name is a dict
    lookup until :func:`refresh` clears the cache.

    Returns an all-``None`` :class:`StackConfig` without touching the cache
    when ``settings.stack_discovery`` is false, so disabling discovery also
    guarantees ``boto3`` is never constructed.
    """
    if not settings.stack_discovery:
        return _EMPTY

    with _lock:
        cached = _cache.get(settings.stack_name)
        if cached is not None:
            return cached

    result = _discover_uncached(settings)

    with _lock:
        _cache[settings.stack_name] = result
    return result


def refresh() -> None:
    """Drop the process-lifetime cache so the next :func:`discover` re-queries."""
    with _lock:
        _cache.clear()


def _discover_uncached(settings: Settings) -> StackConfig:
    try:
        cfn = boto3.client("cloudformation", region_name=settings.aws_region)
        response = cfn.describe_stacks(StackName=settings.stack_name)
    except Exception as exc:
        # Missing stack, no credentials, access denied -- all the ordinary
        # state for fake-mode/local-only users. One line, no traceback.
        logger.info(
            "Stack discovery: skipping (stack %r unreachable: %s)",
            settings.stack_name,
            exc,
        )
        return _EMPTY

    stacks = response.get("Stacks") or []
    if not stacks:
        return _EMPTY
    outputs = {
        output["OutputKey"]: output.get("OutputValue")
        for output in stacks[0].get("Outputs", [])
        if output.get("OutputKey")
    }

    return StackConfig(
        config_api_url=outputs.get("ApiEndpoint") or None,
        config_api_key=_fetch_api_key_value(settings, outputs.get("ApiKeyId")),
        eval_table=outputs.get("TableName") or None,
        eval_runtime_arn=outputs.get("EvalWorkerRuntimeArn") or None,
    )


def _fetch_api_key_value(settings: Settings, api_key_id: str | None) -> str | None:
    """The API key's actual value, or ``None`` -- CloudFormation can't output it.

    A failure here (permissions, the key having been deleted out-of-band, ...)
    degrades only this one field; the rest of :class:`StackConfig` is
    unaffected.
    """
    if not api_key_id:
        return None
    try:
        apigw = boto3.client("apigateway", region_name=settings.aws_region)
        response = apigw.get_api_key(apiKey=api_key_id, includeValue=True)
    except Exception as exc:
        logger.warning(
            "Stack discovery: failed to fetch API key value for %r: %s", api_key_id, exc
        )
        return None
    return response.get("value") or None
