"""The seam between the cloud worker host and the evaluation engine.

The worker host (this package) and the evaluation engine
(:mod:`promptatron.evals`) are built independently, so they meet at exactly one
function with exactly four arguments:

.. code-block:: python

    run_evaluation(
        request: dict,
        emit: Callable[[dict], None],
        store: RunStore,
        cancelled: Callable[[], bool],
    ) -> dict

Everything the engine needs from the outside world arrives through those four
arguments, and nothing else about the host leaks in:

``request``
    An ``EvaluationRequest`` as a plain dict (``execution`` already stripped by
    the caller). The engine validates it — the host only checks that it is a
    non-empty object, because the host has no business knowing the eval schema.
``emit``
    Called once per progress event with the event's plain-dict wire form (the
    exact ``EvalStreamEvent`` shapes in :mod:`promptatron.evals.events`). In the
    local lane this pushes onto an ``asyncio`` queue; here it appends an
    ``EVENT#`` item. Emitting is fire-and-forget from the engine's side.
``store``
    A :class:`RunStore`. The engine calls ``save_run`` as each run finishes
    (before that run's ``run_completed`` event), and ``get_run`` to load
    already-stored runs for ``kind="grade"``.
``cancelled``
    Polled between runs and before grading. ``True`` means a cancel was
    requested; the engine should stop starting work, persist what it has, and
    return a ``cancelled`` outcome.

Return value
------------
An :class:`EvalOutcome` — ``{"status", "result", "error", "run_ids"}``. For
tolerance during the concurrent build-out, :func:`normalize_outcome` also accepts
a bare result dict (no ``status`` key) and reads it as a successful outcome, so
an engine that simply returns its ``result`` payload still works.
"""

from __future__ import annotations

import inspect
import re
from collections.abc import Callable
from typing import Any, Protocol, runtime_checkable

__all__ = [
    "Cancelled",
    "Emit",
    "EvalEngineUnavailable",
    "EvalOutcome",
    "InvalidPayload",
    "RunStore",
    "SEAM_FUNCTION_NAME",
    "SESSION_ID_MIN_LENGTH",
    "load_seam",
    "normalize_outcome",
    "parse_request",
    "run_evaluation",
    "session_id_for",
    "validate_payload",
]

#: The function ``promptatron.evals.engine`` exposes for the cloud lane.
SEAM_FUNCTION_NAME = "execute_evaluation_with_seam"

#: ``InvokeAgentRuntime``'s ``runtimeSessionId`` (``SessionType``) has
#: ``min: 33``. Evaluation ids are 32-char uuid4 hex, so they are *always* one
#: character short and must be padded. See :func:`session_id_for`.
SESSION_ID_MIN_LENGTH = 33

#: Suffix that pads a 32-char evaluation id past ``SESSION_ID_MIN_LENGTH`` while
#: staying inside the response-side ``SessionId`` charset
#: (``[a-zA-Z0-9][a-zA-Z0-9-_]*``).
_SESSION_ID_SUFFIX = "-promptatron-eval"

#: Evaluation ids are uuid4 hex in every code path we control. Constrain the
#: worker to that shape anyway: the id is concatenated into DynamoDB partition
#: keys, so an unconstrained string is an injection surface.
_EVALUATION_ID_RE = re.compile(r"\A[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z")

Emit = Callable[[dict[str, Any]], None]
Cancelled = Callable[[], bool]

#: What the seam returns: a status plus whichever of result/error applies.
EvalOutcome = dict[str, Any]


class InvalidPayload(ValueError):
    """The ``InvokeAgentRuntime`` payload is not something we can act on."""


class EvalEngineUnavailable(RuntimeError):
    """The evaluation engine does not (yet) expose the seam function.

    Raised lazily, at call time, so this module always imports cleanly even
    while ``promptatron.evals`` is mid-refactor.
    """


@runtime_checkable
class RunStore(Protocol):
    """The store surface the engine requires.

    Structurally identical to ``promptatron.evals.engine.EvalStore``, restated
    here so the worker can be type-checked and tested without importing the
    engine (see :func:`load_seam` for why that import stays late). The cloud
    lane's implementation is
    :class:`promptatron.worker.ddb.DynamoEvalStore`; the local lane's is
    ``SqliteEvalStore``.
    """

    #: The evaluation every ``save_evaluation`` call targets.
    evaluation_id: str

    def save_evaluation(self, **fields: Any) -> None:
        """Partially update the evaluation record (``status``, ``result``, ...)."""
        ...

    def load_run(self, run_id: str) -> Any:
        """Read a run record back. Raises ``NotFoundError`` if it is gone."""
        ...

    def save_run(self, run_id: str) -> None:
        """Publish a just-finished run, before its ``run_completed`` event."""
        ...


# --------------------------------------------------------------------------- #
# Payload validation
# --------------------------------------------------------------------------- #


def validate_payload(payload: Any) -> tuple[str, dict[str, Any]]:
    """Split an ``InvokeAgentRuntime`` payload into ``(evaluation_id, request)``.

    The payload contract is ``{"evaluation_id": str, "request": object}``. This
    deliberately validates only the envelope — the ``request`` body belongs to
    :class:`promptatron.evals.schemas.EvaluationRequest`, which the engine
    validates itself and which the worker must not duplicate (and drift from).

    Raises:
        InvalidPayload: if the envelope is malformed.
    """
    if not isinstance(payload, dict):
        raise InvalidPayload(f"payload must be a JSON object, got {type(payload).__name__}")

    evaluation_id = payload.get("evaluation_id")
    if not isinstance(evaluation_id, str) or not _EVALUATION_ID_RE.match(evaluation_id):
        raise InvalidPayload(
            "evaluation_id must be a non-empty identifier matching "
            f"{_EVALUATION_ID_RE.pattern!r}"
        )

    request = payload.get("request")
    if not isinstance(request, dict) or not request:
        raise InvalidPayload("request must be a non-empty JSON object")

    # `execution` is the server's routing switch, not part of the eval schema.
    # Strip it here so the engine never sees a field it would ignore anyway.
    request = {key: value for key, value in request.items() if key != "execution"}
    return evaluation_id, request


def session_id_for(evaluation_id: str) -> str:
    """The ``runtimeSessionId`` to invoke this evaluation with.

    Deterministic on purpose: ``runtimeSessionId`` is modelled as an idempotency
    token, and a stable value means a retried invoke lands on the same runtime
    session rather than starting a second one. Exported here (rather than
    hard-coded in the FastAPI client) so both sides derive it identically.
    """
    session_id = f"{evaluation_id}{_SESSION_ID_SUFFIX}"
    if len(session_id) < SESSION_ID_MIN_LENGTH:  # pragma: no cover - suffix is long enough
        session_id = session_id.ljust(SESSION_ID_MIN_LENGTH, "0")
    return session_id


# --------------------------------------------------------------------------- #
# Reaching the engine
# --------------------------------------------------------------------------- #


def load_seam() -> Callable[..., Any]:
    """Resolve the engine's seam function, importing it as late as possible.

    Lazy for two reasons: importing ``promptatron.evals.engine`` drags in the
    whole run engine (boto3 clients, strands, the SQLite store), which the
    module-import path of an AgentCore cold start should not pay for until an
    invocation actually arrives; and the seam is being built concurrently, so a
    module-scope import would make this package un-importable until it lands.

    Raises:
        EvalEngineUnavailable: if the engine module or the seam is missing.
    """
    # TODO(evals-seam): promptatron.evals.engine is expected to expose
    #   execute_evaluation_with_seam(request, emit, store, cancelled)
    # (sync or async). Until the concurrent evals refactor lands, this raises
    # EvalEngineUnavailable at call time and the module still imports cleanly.
    try:
        from promptatron.evals import engine
    except ImportError as exc:  # pragma: no cover - engine is vendored in the artifact
        raise EvalEngineUnavailable(
            f"promptatron.evals.engine is not importable: {exc}"
        ) from exc

    seam = getattr(engine, SEAM_FUNCTION_NAME, None)
    if not callable(seam):
        raise EvalEngineUnavailable(
            f"promptatron.evals.engine.{SEAM_FUNCTION_NAME} is not available; "
            "the cloud lane cannot execute evaluations until the evals seam lands"
        )
    return seam


def normalize_outcome(returned: Any) -> EvalOutcome:
    """Coerce whatever the seam returned into a well-formed :class:`EvalOutcome`.

    Accepts either the full envelope (``{"status": ..., "result": ...}``) or a
    bare result dict, which is read as a completed evaluation. Anything else is
    a bug in the engine and surfaces as an ``error`` outcome rather than an
    exception, so the evaluation still reaches a terminal state.
    """
    if not isinstance(returned, dict):
        return {
            "status": "error",
            "result": None,
            "error": {
                "code": "invalid_engine_result",
                "message": f"evaluation engine returned {type(returned).__name__}, expected dict",
            },
            "run_ids": [],
        }

    status = returned.get("status")
    if status in {"completed", "error", "cancelled"}:
        result = returned.get("result")
        error = returned.get("error")
        run_ids = returned.get("run_ids")
    else:
        # A bare result payload. `run_ids` lives inside it (see the local lane's
        # `_build_result`), and the presence of a result means it completed.
        status = "completed"
        result = returned
        error = None
        run_ids = returned.get("run_ids")

    if not isinstance(run_ids, list):
        run_ids = list((result or {}).get("run_ids") or []) if isinstance(result, dict) else []

    return {
        "status": status,
        "result": result if isinstance(result, dict) else None,
        "error": error if isinstance(error, dict) else None,
        "run_ids": [str(run_id) for run_id in run_ids if run_id is not None],
    }


def parse_request(request: dict[str, Any]) -> Any:
    """Turn the payload's ``request`` object into an ``EvaluationRequest``.

    The engine's seam takes the validated pydantic model, not a dict — the
    worker receives JSON off the wire, so somebody has to bridge the two, and
    doing it here means the worker never duplicates (or drifts from) the eval
    schema. Imported lazily for the same reason as :func:`load_seam`.

    Raises:
        InvalidPayload: if the body is not a valid ``EvaluationRequest``.
    """
    from promptatron.evals.schemas import EvaluationRequest

    try:
        return EvaluationRequest.model_validate(request)
    except Exception as exc:
        raise InvalidPayload(f"request is not a valid EvaluationRequest: {exc}") from exc


async def run_evaluation(
    request: dict[str, Any],
    emit: Emit,
    store: RunStore,
    cancelled: Cancelled,
) -> EvalOutcome:
    """Execute one evaluation through the engine seam.

    ``request`` arrives as a plain dict and is validated into an
    ``EvaluationRequest`` on the way in. The seam is awaited if it is a
    coroutine function, so the engine is free to be either — the worker's
    background task is async regardless.
    """
    seam = load_seam()
    parsed = parse_request(request)
    returned = seam(parsed, emit, store, cancelled)
    if inspect.isawaitable(returned):
        returned = await returned
    return normalize_outcome(returned)
