"""Where this process is running, and what that implies about its lanes.

``docs/serverless-deploy.md`` gives the harness two shapes: the local-first
default (uvicorn on a laptop, SQLite history, evaluations in either lane) and
the deployed one (a Lambda function, DynamoDB history, evaluations cloud-lane
only). Two settings choose between them, and both default to ``auto``:

============================  ==========================================
``PROMPTATRON_HISTORY_BACKEND``  ``sqlite`` | ``dynamodb`` | ``auto``
``PROMPTATRON_LOCAL_EVALS``      ``on`` | ``off`` | ``auto``
============================  ==========================================

``auto`` means "look at the environment": AWS sets
``AWS_LAMBDA_FUNCTION_NAME`` inside every Lambda invocation, so its presence is
the single signal both resolutions key off. Nothing else in the codebase asks
"am I deployed?" -- this module is the only place that question is answered, so
the two answers can never drift apart.

Resolution matrix::

    history_backend  AWS_LAMBDA_FUNCTION_NAME  ->  backend
    auto             set                           dynamodb
    auto             unset                         sqlite
    sqlite           (ignored)                     sqlite
    dynamodb         (ignored)                     dynamodb

    local_evals      AWS_LAMBDA_FUNCTION_NAME  ->  available
    auto             set                           False
    auto             unset                         True
    on               (ignored)                     True
    off              (ignored)                     False

The ``dynamodb`` backend additionally needs a table, resolved through
:mod:`promptatron.runtime_config` exactly like the cloud lane's. A server that
resolves to ``dynamodb`` with no table is *misconfigured*, not "running without
history": :func:`history_table` raises rather than falling back to SQLite,
because a deployed server silently writing to a Lambda's ephemeral disk is a
worse outcome than refusing to start.
"""

from __future__ import annotations

import os
from typing import Literal

from promptatron import runtime_config
from promptatron.config import Settings
from promptatron.errors import BadRequestError

#: Set by the Lambda runtime on every invocation (and by nothing else). The
#: contract in ``docs/serverless-deploy.md`` names this variable specifically.
LAMBDA_ENV_VAR = "AWS_LAMBDA_FUNCTION_NAME"

#: The two concrete history backends ``auto`` can resolve to.
HistoryBackend = Literal["sqlite", "dynamodb"]


class HistoryBackendMisconfiguredError(RuntimeError):
    """The resolved history backend cannot be built from these settings.

    A startup-time error rather than an HTTP one: the process is not able to
    serve *any* request that touches history, so failing the lifespan is the
    honest outcome.
    """


class LocalLaneUnavailableError(BadRequestError):
    """An evaluation asked for in-process execution on a deployment without it.

    The mirror image of
    :class:`promptatron.evals.cloud.CloudLaneUnavailableError`, and deliberately
    *not* an implicit upgrade to the cloud lane: a request that says "run this
    on the machine I am talking to" has a different privacy answer than one that
    says "run this in my AWS account", so the server refuses instead of choosing
    for the caller (the UI sends ``execution="cloud"`` explicitly).
    """

    code = "local_lane_unavailable"


def in_lambda() -> bool:
    """Whether this process is running inside an AWS Lambda invocation."""
    return bool(os.environ.get(LAMBDA_ENV_VAR))


def history_backend(settings: Settings) -> HistoryBackend:
    """Which history backend these settings resolve to (never ``"auto"``)."""
    configured = settings.history_backend
    if configured == "auto":
        return "dynamodb" if in_lambda() else "sqlite"
    return configured


def history_table(settings: Settings) -> str:
    """The DynamoDB table the history backend writes to.

    Raises:
        HistoryBackendMisconfiguredError: when no table is resolvable. The
            deployed template injects ``PROMPTATRON_EVAL_TABLE`` directly; a
            local ``dynamodb`` backend can also discover it from the stack.
    """
    resolved = runtime_config.eval_table(settings)
    if not resolved.value:
        raise HistoryBackendMisconfiguredError(
            "history_backend resolves to 'dynamodb' but no DynamoDB table is "
            "configured: set PROMPTATRON_EVAL_TABLE (or enable stack discovery "
            "so it can be read from the deployed stack's outputs)."
        )
    return resolved.value


def local_evals_available(settings: Settings) -> bool:
    """Whether ``POST /evaluations`` may execute an evaluation in this process."""
    configured = settings.local_evals
    if configured == "auto":
        return not in_lambda()
    return configured == "on"


def require_local_lane(settings: Settings) -> None:
    """Raise :class:`LocalLaneUnavailableError` unless the local lane is on."""
    if not local_evals_available(settings):
        raise LocalLaneUnavailableError(
            "In-process ('local') evaluation is not available on this deployment; "
            "submit the evaluation with execution='cloud'",
            detail={"execution": "local", "available": ["cloud"]},
        )
