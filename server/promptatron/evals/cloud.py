"""The cloud evaluation lane: submit to AgentCore, read back from DynamoDB.

``docs/cloud-evals.md`` is the contract; this module is the server's whole half
of it. Nothing here executes an evaluation -- that happens in an AgentCore
Runtime worker which imports
:func:`promptatron.evals.engine.execute_evaluation_with_seam` and backs the seam
with DynamoDB writes. The server:

submit
    Generates the evaluation id, invokes the runtime with
    ``{"evaluation_id", "request"}``, and answers ``202`` with an
    :class:`~promptatron.schemas.runs.EvaluationDetail` synthesized from the
    request. **Nothing is written locally** -- a cloud evaluation has no SQLite
    row at all, which is what makes lane detection on reads a simple "SQLite
    first, then DynamoDB" fallback.
read
    ``META`` items for detail/list, ``EVENT#`` items for the NDJSON stream,
    ``RUN#`` items for run detail/list.
cancel
    Puts the ``CANCEL`` flag item and answers ``204``; the worker notices
    between runs.

All DynamoDB access is delegated to :mod:`promptatron.evals.ddb_reader`, and the
AgentCore call sits behind :class:`Invoker`, so the whole lane is exercised in
tests with an in-memory table and a recording invoker.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import uuid4

import boto3
from fastapi import Depends
from starlette.concurrency import run_in_threadpool

from promptatron import runtime_config
from promptatron.config import Settings, get_settings
from promptatron.errors import BadRequestError, ConflictError, NotFoundError
from promptatron.evals import ddb_reader, jobs
from promptatron.evals.ddb_reader import EvalTable
from promptatron.evals.schemas import EvaluationRequest
from promptatron.schemas.runs import EvaluationDetail, Page, RunDetail, RunSummary

# The worker exports the session-id derivation (rather than each side inventing
# one) so a retried invoke lands on the same AgentCore runtime session.
from promptatron.worker.interfaces import session_id_for

logger = logging.getLogger(__name__)

#: How long the events stream waits between polls for new ``EVENT#`` items.
#: Module-level so tests can shorten it.
POLL_INTERVAL_SECONDS = 1.5
#: Extra polls granted after ``META`` goes terminal, so the worker's own
#: ``eval_complete`` (written *after* the terminal status) is never truncated.
TERMINAL_GRACE_POLLS = 2

JSON_CONTENT_TYPE = "application/json"


class CloudLaneUnavailableError(BadRequestError):
    """The cloud lane was asked for but the server has no runtime/table configured."""

    code = "cloud_lane_unavailable"


def is_configured(settings: Settings) -> bool:
    """The lane needs *both* an AgentCore runtime and a DynamoDB table."""
    return bool(
        runtime_config.eval_runtime_arn(settings).value
        and runtime_config.eval_table(settings).value
    )


def _require_configured(settings: Settings) -> None:
    if not is_configured(settings):
        raise CloudLaneUnavailableError(
            "The cloud evaluation lane is not configured on this server",
            detail={
                "eval_runtime_arn": runtime_config.eval_runtime_arn(settings).value is not None,
                "eval_table": runtime_config.eval_table(settings).value is not None,
            },
        )


def require_table(table: EvalTable | None) -> EvalTable:
    """Unwrap the table dependency, 400ing when the lane is unconfigured."""
    if table is None:
        raise CloudLaneUnavailableError(
            "The cloud evaluation lane is not configured on this server"
        )
    return table


# --------------------------------------------------------------------------- #
# Invoking the AgentCore runtime
# --------------------------------------------------------------------------- #


def worker_payload(evaluation_id: str, request: EvaluationRequest) -> dict[str, Any]:
    """The JSON body handed to the worker: id plus the request minus ``execution``."""
    return {
        "evaluation_id": evaluation_id,
        "request": request.model_dump(mode="json", exclude={"execution"}),
    }


class Invoker(Protocol):
    """Starts one evaluation on the worker. Synchronous (called off the loop)."""

    def invoke(self, evaluation_id: str, payload: dict[str, Any]) -> Any:
        ...


class AgentCoreInvoker:
    """The real invoker: ``bedrock-agentcore`` ``InvokeAgentRuntime``.

    Botocore's ``bedrock-agentcore`` (api version 2024-02-28) models the
    operation as ``invoke_agent_runtime`` with ``agentRuntimeArn`` (uri),
    ``runtimeSessionId`` (the ``X-Amzn-Bedrock-AgentCore-Runtime-Session-Id``
    header; ``SessionType`` is min 33 / max 256 chars, hence
    :func:`~promptatron.worker.interfaces.session_id_for`),
    ``contentType``/``accept`` headers, and ``payload`` -- a blob, so the JSON
    body is encoded here.

    The worker acknowledges immediately and continues as an async task inside
    the runtime, so this call returns long before the evaluation finishes; the
    streamed response body is closed without being read.
    """

    def __init__(
        self, runtime_arn: str, region_name: str, client: Any | None = None
    ) -> None:
        self._runtime_arn = runtime_arn
        self._region_name = region_name
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            self._client = boto3.client("bedrock-agentcore", region_name=self._region_name)
        return self._client

    def invoke(self, evaluation_id: str, payload: dict[str, Any]) -> Any:
        response = self.client.invoke_agent_runtime(
            agentRuntimeArn=self._runtime_arn,
            runtimeSessionId=session_id_for(evaluation_id),
            contentType=JSON_CONTENT_TYPE,
            accept=JSON_CONTENT_TYPE,
            payload=json.dumps(payload).encode("utf-8"),
        )
        body = response.get("response")
        if hasattr(body, "close"):
            body.close()
        return response


_invokers: dict[tuple[str, str], AgentCoreInvoker] = {}


def get_invoker(settings: Settings = Depends(get_settings)) -> Invoker | None:
    """FastAPI dependency: the AgentCore invoker, or ``None`` when unconfigured."""
    runtime_arn = runtime_config.eval_runtime_arn(settings).value
    if not runtime_arn:
        return None
    key = (runtime_arn, settings.aws_region)
    if key not in _invokers:
        _invokers[key] = AgentCoreInvoker(runtime_arn, settings.aws_region)
    return _invokers[key]


def get_eval_table(settings: Settings = Depends(get_settings)) -> EvalTable | None:
    """FastAPI dependency: the DynamoDB reader, or ``None`` when unconfigured."""
    return ddb_reader.build_eval_table(settings)


# --------------------------------------------------------------------------- #
# Submit
# --------------------------------------------------------------------------- #


async def submit(
    request: EvaluationRequest, *, settings: Settings, invoker: Invoker | None
) -> EvaluationDetail:
    """Hand an evaluation to the worker and answer with its ``pending`` detail.

    The id is minted here and travels in the payload, so the ``202`` body is
    immediately usable against ``/evaluations/{id}`` and its event stream even
    though the server itself writes nothing: the worker's first act is the
    ``META`` item under that id.

    ``kind="grade"`` run ids are *not* validated here the way the local lane
    validates them -- the runs they name may live in DynamoDB rather than this
    server's SQLite, so only the worker can resolve them.
    """
    _require_configured(settings)
    if invoker is None:  # pragma: no cover - _require_configured covers this
        raise CloudLaneUnavailableError("The cloud evaluation lane is not configured")

    evaluation_id = uuid4().hex
    payload = worker_payload(evaluation_id, request)
    await run_in_threadpool(invoker.invoke, evaluation_id, payload)
    logger.info("submitted cloud evaluation %s", evaluation_id)

    return EvaluationDetail(
        id=evaluation_id,
        ts=datetime.now(UTC),
        kind=request.kind,
        status="pending",
        config=request.stored_config(),
        run_ids=request.run_ids if request.kind == "grade" else [],
        result=None,
        progress=None,
        error=None,
        execution="cloud",
    )


# --------------------------------------------------------------------------- #
# Item -> response mapping
# --------------------------------------------------------------------------- #


def _json(item: dict[str, Any], key: str, default: Any = None) -> Any:
    """A contract JSON-string attribute, parsed. Absent/null/"" -> ``default``."""
    raw = item.get(key)
    if raw is None or raw == "":
        return default
    if isinstance(raw, str):
        return json.loads(raw)
    return raw  # already a native map/list (a permissive writer)


def _ts(item: dict[str, Any]) -> datetime:
    return datetime.fromisoformat(str(item["ts"]))


def evaluation_detail(item: dict[str, Any]) -> EvaluationDetail:
    """An ``EVAL#/META`` item as an :class:`EvaluationDetail`."""
    return EvaluationDetail(
        id=str(item["id"]),
        ts=_ts(item),
        kind=str(item["kind"]),
        status=str(item["status"]),
        config=_json(item, "config", {}) or {},
        run_ids=_json(item, "run_ids", []) or [],
        result=_json(item, "result"),
        progress=_json(item, "progress"),
        error=_json(item, "error"),
        execution="cloud",
    )


def run_detail(item: dict[str, Any]) -> RunDetail:
    """A ``RUN#/META`` item as a :class:`RunDetail`."""
    return RunDetail(
        id=str(item["id"]),
        ts=_ts(item),
        model_id=str(item["model_id"]),
        scenario_id=item.get("scenario_id"),
        system_prompt=str(item.get("system_prompt") or ""),
        user_prompt=str(item.get("user_prompt") or ""),
        dataset_id=item.get("dataset_id"),
        dataset_hash=item.get("dataset_hash"),
        config=_json(item, "config", {}) or {},
        output=item.get("output"),
        tool_transcript=_json(item, "tool_transcript"),
        metrics=_json(item, "metrics"),
        guardrail_trace=_json(item, "guardrail_trace"),
        status=str(item["status"]),
        error=_json(item, "error"),
    )


def run_summary(item: dict[str, Any]) -> RunSummary:
    """A ``RUN#/META`` item as a listing row."""
    return RunSummary(
        id=str(item["id"]),
        ts=_ts(item),
        model_id=str(item["model_id"]),
        scenario_id=item.get("scenario_id"),
        dataset_id=item.get("dataset_id"),
        status=str(item["status"]),
        metrics=_json(item, "metrics"),
    )


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #


def get_evaluation(table: EvalTable, evaluation_id: str) -> EvaluationDetail:
    """The cloud evaluation, or a 404 identical to the local lane's."""
    item = table.get_evaluation(evaluation_id)
    if item is None:
        raise NotFoundError(f"Evaluation {evaluation_id!r} not found")
    return evaluation_detail(item)


def list_evaluations(
    table: EvalTable,
    *,
    kind: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
    limit: int = 25,
) -> Page[EvaluationDetail]:
    """Newest-first page of cloud evaluations from the GSI1 ``EVAL`` partition.

    ``kind``/``status`` are applied to the page after it is read (the index is
    keyed on time alone), so they narrow a page rather than fill one -- the same
    semantics a DynamoDB ``FilterExpression`` would give.
    """
    items, next_cursor = table.list_evaluations(limit=limit, cursor=cursor)
    details = [evaluation_detail(item) for item in items]
    if kind is not None:
        details = [detail for detail in details if detail.kind == kind]
    if status is not None:
        details = [detail for detail in details if detail.status == status]
    return Page[EvaluationDetail](items=details, next_cursor=next_cursor)


def get_run(table: EvalTable, run_id: str) -> RunDetail:
    """The cloud run record, or a 404 identical to the local lane's."""
    item = table.get_run(run_id)
    if item is None:
        raise NotFoundError(f"Run {run_id!r} not found")
    return run_detail(item)


def list_runs(
    table: EvalTable, *, cursor: str | None = None, limit: int = 25
) -> Page[RunSummary]:
    """Newest-first page of cloud runs from the GSI1 ``RUN`` partition."""
    items, next_cursor = table.list_runs(limit=limit, cursor=cursor)
    return Page[RunSummary](
        items=[run_summary(item) for item in items], next_cursor=next_cursor
    )


def cancel_evaluation(table: EvalTable, evaluation_id: str) -> None:
    """Request cancellation of a running cloud evaluation.

    Best-effort and asynchronous: the ``CANCEL`` item goes in and the caller
    answers ``204`` without waiting for the worker to notice. A *finished*
    evaluation is a ``409``, matching the local lane -- the contract only
    prescribes the running case.
    """
    item = table.get_evaluation(evaluation_id)
    if item is None:
        raise NotFoundError(f"Evaluation {evaluation_id!r} not found")
    status = str(item.get("status") or "")
    if ddb_reader.is_terminal(status):
        raise ConflictError(
            f"Evaluation {evaluation_id!r} already finished", detail={"status": status}
        )
    table.request_cancel(evaluation_id)


# --------------------------------------------------------------------------- #
# The event stream
# --------------------------------------------------------------------------- #


async def stream_events(table: EvalTable, evaluation_id: str) -> AsyncIterator[str]:
    """Replay this evaluation's ``EVENT#`` items as NDJSON, then follow them.

    The loop reads ``META`` *before* the events it then streams, so an event
    written before the terminal status can never be missed. ``eval_complete``
    is written after the terminal status, though, so a terminal ``META`` alone
    does not end the stream: it grants :data:`TERMINAL_GRACE_POLLS` further
    polls, and the stream ends as soon as ``eval_complete`` is seen (or the
    grace runs out, for an evaluation whose worker died before emitting it).

    Nothing is synthesized -- the worker's own ``eval_complete`` is the last
    line, exactly as in the local lane.
    """
    last_seq = -1
    grace = TERMINAL_GRACE_POLLS
    while True:
        meta = await run_in_threadpool(table.get_evaluation, evaluation_id)
        terminal = meta is None or ddb_reader.is_terminal(str(meta.get("status") or ""))

        items = await run_in_threadpool(table.events_after, evaluation_id, last_seq)
        for item in items:
            last_seq = int(item["seq"])
            entry = json.loads(item["event"])
            yield jobs.to_json_line(entry)
            if entry.get("type") == "eval_complete":
                return

        if items:
            continue  # drain greedily; only an empty read costs a poll interval
        if terminal:
            grace -= 1
            if grace <= 0:
                return
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
