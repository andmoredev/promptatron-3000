"""The AgentCore Runtime entry point for the cloud evaluation lane.

Deployed to Amazon Bedrock AgentCore Runtime as the ``EntryPoint`` of a
``PYTHON_3_12`` CodeZip artifact. See ``docs/cloud-evals-infra.md`` for the
packaging decision, the invoke mechanics, and what remains unproven without a
real deploy.

Shape of an invocation
----------------------
``InvokeAgentRuntime`` delivers ``{"evaluation_id": ..., "request": {...}}`` to
``POST /invocations``, which the ``bedrock-agentcore`` SDK routes to the
``@app.entrypoint`` handler. The handler:

1. validates the envelope (:func:`promptatron.worker.interfaces.validate_payload`),
2. writes ``EVAL#/META`` as ``pending`` then ``running``,
3. **spawns** the evaluation as a background ``asyncio`` task, and
4. returns ``{"status": "accepted", ...}`` — typically in well under a second.

Step 3 is the whole point. ``@app.async_task`` does *not* make a handler return
early: its wrapper ``await``\\ s the wrapped coroutine and only tracks it for
health reporting. Returning fast is the application's job, so the handler calls
``asyncio.create_task`` itself and the *task* carries the ``@app.async_task``
decoration. That decoration is still load-bearing — while a tracked task is
active the SDK's ``/ping`` reports ``HealthyBusy`` instead of ``Healthy``, which
is what stops AgentCore reaping the session under its idle-session timeout while
a long evaluation is still running.

The FastAPI server therefore never holds a connection open for the duration of
an evaluation; it reads progress from DynamoDB, exactly as
``docs/cloud-evals.md`` specifies.

Importability
-------------
``bedrock-agentcore`` is an optional dependency (the ``worker`` extra): it is
installed into the deployment artifact but not into the server's dev
environment. Everything in this module except the last few lines works without
it, so the test suite imports and exercises :func:`dispatch` and :func:`execute`
directly with no SDK present.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable, Coroutine
from typing import Any

from promptatron.worker import interfaces
from promptatron.worker.ddb import DynamoEvalStore

logger = logging.getLogger(__name__)

__all__ = [
    "app",
    "build_store",
    "dispatch",
    "execute",
    "invoke",
]

#: Strong references to in-flight jobs. ``asyncio`` only holds a weak reference
#: to a running task, so a fire-and-forget task that nothing keeps alive can be
#: garbage-collected mid-evaluation.
_BACKGROUND_TASKS: set[asyncio.Task[Any]] = set()


def _spawn(coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
    """Start ``coro`` in the background and keep it referenced until it ends."""
    task = asyncio.create_task(coro)
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    return task


def build_store(evaluation_id: str) -> DynamoEvalStore:
    """Construct the DynamoDB store from the runtime's environment.

    ``TABLE_NAME`` and ``AWS_REGION`` are set as runtime environment variables by
    ``api/template.yaml``; AgentCore always sets ``AWS_REGION`` itself, so the
    fallback only matters when running the artifact locally.
    """
    return DynamoEvalStore(
        table_name=os.environ.get("TABLE_NAME", ""),
        evaluation_id=evaluation_id,
        region_name=os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION"),
    )


def _rejected(code: str, message: str) -> dict[str, Any]:
    """The acknowledgement body for an invocation we refuse to start."""
    logger.warning("rejecting invocation: %s: %s", code, message)
    return {"status": "rejected", "error": {"code": code, "message": message}}


# --------------------------------------------------------------------------- #
# The background job
# --------------------------------------------------------------------------- #


async def execute(
    evaluation_id: str,
    request: dict[str, Any],
    store: DynamoEvalStore,
) -> None:
    """Run one evaluation to a terminal state.

    Never raises: this runs detached from any request, so an escaping exception
    would only surface as an "Task exception was never retrieved" log line while
    the evaluation sat at ``running`` forever. Every path ends in a terminal
    ``META`` write, which is what releases the reader polling ``GET
    /evaluations/{id}/events``.
    """
    try:
        if store.cancel_requested():
            # Cancelled between the server's POST and our first check.
            store.complete("cancelled", run_ids=[])
            return

        outcome = await interfaces.run_evaluation(
            request,
            store.emit,
            store,
            store.cancel_requested,
        )
        # The engine settles the row itself (`save_evaluation(status=...)`), which
        # the store buffers until `eval_complete` is durable; `finalize` flushes
        # it. A `False` return means the engine returned without settling at all,
        # so the worker settles from the outcome instead -- either way the
        # evaluation ends terminal and the reader stops polling.
        if not store.finalize():
            store.complete(
                outcome["status"],
                result=outcome["result"],
                error=outcome["error"],
                run_ids=outcome["run_ids"],
            )
        logger.info("eval %s finished: %s", evaluation_id, outcome["status"])

    except asyncio.CancelledError:
        # The runtime is shutting the task down. Record what we can without
        # awaiting anything -- a suspension point here re-raises immediately.
        _finalize_quietly(store, "cancelled", None)
        raise

    except interfaces.InvalidPayload as exc:
        logger.error("eval %s: unusable request body: %s", evaluation_id, exc)
        _finalize_quietly(store, "error", {"code": "invalid_request", "message": str(exc)})

    except interfaces.EvalEngineUnavailable as exc:
        logger.error("eval %s: evaluation engine unavailable: %s", evaluation_id, exc)
        _finalize_quietly(
            store, "error", {"code": "eval_engine_unavailable", "message": str(exc)}
        )

    except Exception as exc:  # noqa: BLE001 - a detached task must swallow everything
        logger.exception("eval %s failed", evaluation_id)
        _finalize_quietly(
            store,
            "error",
            {"code": "internal_error", "message": str(exc) or exc.__class__.__name__},
        )


def _finalize_quietly(
    store: DynamoEvalStore, status: str, error: dict[str, Any] | None
) -> None:
    """Best-effort terminal write from an error path.

    If even this fails there is nothing useful left to do -- the evaluation will
    read as ``running`` until its TTL expires -- so it is logged and dropped
    rather than allowed to mask the original failure.
    """
    try:
        if not store.finalize():
            store.complete(status, error=error)
    except Exception:  # noqa: BLE001
        logger.exception("failed to write terminal state for eval %s", store.evaluation_id)


#: The tracked form of :func:`execute`. Wrapped with ``@app.async_task`` when the
#: SDK is present so ``/ping`` reports ``HealthyBusy`` for the whole evaluation.
_tracked_execute: Callable[..., Coroutine[Any, Any, None]] = execute


# --------------------------------------------------------------------------- #
# The entry point
# --------------------------------------------------------------------------- #


async def dispatch(
    payload: Any,
    *,
    store_factory: Callable[[str], DynamoEvalStore] = build_store,
    spawn: Callable[[Coroutine[Any, Any, Any]], Any] = _spawn,
) -> dict[str, Any]:
    """Acknowledge one invocation, having started the evaluation in the background.

    The SDK-independent core of the entry point: everything here is plain
    ``asyncio`` so it can be exercised directly in tests, including the
    ack-before-completion behaviour that the whole design rests on.

    Returns the acknowledgement body — ``{"status": "accepted", ...}`` once the
    job is running, or ``{"status": "rejected", "error": {...}}`` if the envelope
    was malformed or the state could not be written. It never reports failures of
    the evaluation itself; those land in DynamoDB.
    """
    try:
        evaluation_id, request = interfaces.validate_payload(payload)
    except interfaces.InvalidPayload as exc:
        return _rejected("invalid_payload", str(exc))

    try:
        store = store_factory(evaluation_id)
        store.begin(request)
        store.mark_running()
    except Exception as exc:  # noqa: BLE001 - surfaces to the caller as a rejection
        logger.exception("eval %s: could not write initial state", evaluation_id)
        return _rejected("store_unavailable", str(exc) or exc.__class__.__name__)

    spawn(_tracked_execute(evaluation_id, request, store))

    return {
        "status": "accepted",
        "evaluation_id": evaluation_id,
        "execution": "cloud",
    }


# --------------------------------------------------------------------------- #
# SDK wiring
#
# Kept last and kept optional. `bedrock-agentcore` is only installed in the
# deployment artifact (the `worker` extra), so importing this module without it
# must still work -- that is what lets the test suite exercise `dispatch` and
# `execute` without pulling the SDK (and its OpenTelemetry/MCP dependency tree)
# into every developer's virtualenv.
# --------------------------------------------------------------------------- #

#: The SDK application, or ``None`` when ``bedrock-agentcore`` is not installed.
app: Any = None
#: The registered ``@app.entrypoint`` handler, or ``None`` without the SDK.
invoke: Any = None

try:
    from bedrock_agentcore.runtime import BedrockAgentCoreApp
except ImportError:  # pragma: no cover - exercised by its absence in dev
    logger.debug("bedrock-agentcore is not installed; AgentCore app not created")
else:  # pragma: no cover - requires the optional `worker` extra
    app = BedrockAgentCoreApp()

    # Track the job for health reporting. The decorator does NOT defer the call
    # (its wrapper awaits the coroutine); it flips `/ping` to `HealthyBusy` for
    # the task's lifetime, which is what keeps the session off the idle reaper.
    _tracked_execute = app.async_task(execute)

    @app.entrypoint
    async def invoke(payload: Any, context: Any = None) -> dict[str, Any]:
        """``POST /invocations`` — acknowledge, then evaluate in the background.

        ``context`` carries the ``runtimeSessionId`` the server invoked with
        (:func:`promptatron.worker.interfaces.session_id_for` derives it from the
        evaluation id). It is logged for correlation only: the evaluation id in
        the payload is the authority, since the session id is padded and could in
        principle be reused.
        """
        session_id = getattr(context, "session_id", None)
        logger.info("invocation received (session=%s)", session_id)
        return await dispatch(payload)


if __name__ == "__main__":  # pragma: no cover - the artifact's boot path
    # AgentCore executes the CodeZip EntryPoint file as a script (the zip's root
    # `agentcore_app.py` shim re-exports this module's `app` and does the same),
    # so serving starts here: uvicorn on :8080 with /invocations and /ping.
    if app is None:
        raise SystemExit(
            "bedrock-agentcore is not installed -- install the 'worker' extra: "
            "uv sync --extra worker"
        )
    app.run()
