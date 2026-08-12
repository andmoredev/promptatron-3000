"""DynamoDB persistence for the cloud evaluation lane.

Implements the writer half of the item contract in ``docs/cloud-evals.md``
against the existing single-table config store (``pk``/``sk`` + ``GSI1``). The
FastAPI server implements the reader half; the item shapes written here are the
only thing the two share.

Items
-----
=================  ======================  ==============================
Item               pk / sk                 Written by
=================  ======================  ==============================
Evaluation meta    ``EVAL#{id}`` ``META``  :meth:`DynamoEvalStore.begin`,
                                           :meth:`~DynamoEvalStore.mark_running`,
                                           :meth:`~DynamoEvalStore.complete`
Progress event     ``EVAL#{id}``           :meth:`~DynamoEvalStore.emit`
                   ``EVENT#{seq:08d}``
Cancel flag        ``EVAL#{id}``           the FastAPI server
                   ``CANCEL``              (read here by
                                           :meth:`~DynamoEvalStore.cancel_requested`)
Run record         ``RUN#{run_id}``        :meth:`~DynamoEvalStore.save_run`
                   ``META``
=================  ======================  ==============================

Ordering guarantees
-------------------
Two rules from the contract are enforced structurally rather than by
convention, because a reader that trusts them and a writer that only *usually*
honours them is a race waiting to happen:

* **Terminal status is never visible before the result.** ``complete()`` writes
  ``status``, ``result``, ``error`` and ``run_ids`` in a *single* ``UpdateItem``,
  so there is no window in which a reader can see ``status="completed"`` and a
  missing ``result``.
* **``eval_complete`` is always the last event.** ``complete()`` appends the
  ``eval_complete`` event *before* flipping ``META.status``, and synthesizes one
  if the engine did not emit it (a crashed engine must still terminate the
  reader's stream). Because the reader stops polling on terminal status, an
  event appended after the flip could be missed; one appended before it cannot.

Serialization
-------------
Deliberately the low-level ``dynamodb`` client with an explicit
:class:`~boto3.dynamodb.types.TypeSerializer` rather than the resource API. The
attribute *types* are part of the cross-language contract here (the Node config
store functions write the same table), so making them explicit keeps them
testable — the tests assert on the AttributeValue dicts themselves.

Every attribute the contract declares is always present: fields documented as
nullable are written as ``NULL`` rather than omitted, so the reader never has to
distinguish "absent" from "null".
"""

from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime
from typing import Any

from boto3.dynamodb.types import TypeDeserializer, TypeSerializer

logger = logging.getLogger(__name__)

__all__ = [
    "CANCEL_SK",
    "EVENT_SEQ_WIDTH",
    "GSI1_EVAL_PK",
    "GSI1_RUN_PK",
    "TTL_ATTRIBUTE",
    "TTL_DAYS",
    "DynamoEvalStore",
    "eval_pk",
    "event_sk",
    "run_pk",
]

#: TTL horizon for every item this module writes. The table's TTL is configured
#: on ``expiresAt`` (see ``api/template.yaml``).
TTL_DAYS = 90
TTL_SECONDS = TTL_DAYS * 24 * 60 * 60
TTL_ATTRIBUTE = "expiresAt"

#: ``EVENT#{seq:08d}`` — zero-padded so lexicographic ``sk`` ordering (which is
#: what ``begins_with`` Query returns) matches numeric ``seq`` ordering. Eight
#: digits covers 100M events per evaluation against a hard ceiling of 25 runs.
EVENT_SEQ_WIDTH = 8

META_SK = "META"
CANCEL_SK = "CANCEL"
EVENT_SK_PREFIX = "EVENT#"

GSI1_EVAL_PK = "EVAL"
GSI1_RUN_PK = "RUN"

#: Terminal statuses. ``complete()`` refuses anything else.
_TERMINAL_STATUSES = frozenset({"completed", "error", "cancelled"})

#: Run fields that are JSON-encoded on the way in, matching the SQLite ``runs``
#: table's TEXT-holding-JSON columns exactly (see ``promptatron.store.models``).
_RUN_JSON_FIELDS = ("config", "tool_transcript", "metrics", "guardrail_trace", "error")

#: Run fields stored as plain strings.
_RUN_TEXT_FIELDS = (
    "id",
    "ts",
    "model_id",
    "scenario_id",
    "system_prompt",
    "user_prompt",
    "dataset_id",
    "dataset_hash",
    "output",
    "status",
)

_serializer = TypeSerializer()
_deserializer = TypeDeserializer()


# --------------------------------------------------------------------------- #
# Key helpers (importable so the reader side can share them)
# --------------------------------------------------------------------------- #


def eval_pk(evaluation_id: str) -> str:
    """Partition key for an evaluation's meta/event/cancel items."""
    return f"EVAL#{evaluation_id}"


def run_pk(run_id: str) -> str:
    """Partition key for a run record."""
    return f"RUN#{run_id}"


def event_sk(seq: int) -> str:
    """Sort key for progress event ``seq``."""
    return f"{EVENT_SK_PREFIX}{seq:0{EVENT_SEQ_WIDTH}d}"


# --------------------------------------------------------------------------- #
# Attribute helpers
# --------------------------------------------------------------------------- #


def _av(value: Any) -> dict[str, Any]:
    """Serialize one Python value to a DynamoDB AttributeValue."""
    return _serializer.serialize(value)


def _text(value: Any) -> dict[str, Any]:
    """A nullable string attribute: ``None`` becomes ``NULL``, never absent."""
    return {"NULL": True} if value is None else {"S": str(value)}


def _json(value: Any) -> dict[str, Any]:
    """A nullable JSON-string attribute (matching the SQLite TEXT columns)."""
    return {"NULL": True} if value is None else {"S": json.dumps(value, default=str)}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def unwrap(item: dict[str, Any]) -> dict[str, Any]:
    """Deserialize a raw DynamoDB item into plain Python values.

    Exposed for the reader side and for tests; the writer only uses it for
    ``get_run``.
    """
    return {key: _deserializer.deserialize(value) for key, value in item.items()}


# --------------------------------------------------------------------------- #
# The store
# --------------------------------------------------------------------------- #


class DynamoEvalStore:
    """Writer for one evaluation's DynamoDB state.

    One instance per evaluation: it owns that evaluation's event sequence
    counter, so ``seq`` monotonicity is a property of the object rather than of
    a read-modify-write against the table.

    Args:
        table_name: The shared config-store table.
        evaluation_id: The evaluation this store writes for.
        client: A ``boto3`` ``dynamodb`` client. Created lazily from
            ``region_name`` when omitted, so constructing a store in a test does
            not require credentials.
        region_name: Region for the lazily-created client.
        ttl_days: TTL horizon, overridable for tests.
        clock: ``() -> float`` epoch-seconds source, overridable for tests.
    """

    def __init__(
        self,
        table_name: str,
        evaluation_id: str,
        *,
        client: Any | None = None,
        region_name: str | None = None,
        ttl_days: int = TTL_DAYS,
        clock: Any = time.time,
    ) -> None:
        if not table_name:
            raise ValueError("table_name is required (set TABLE_NAME on the runtime)")
        self.table_name = table_name
        self.evaluation_id = evaluation_id
        self._client = client
        self._region_name = region_name
        self._ttl_seconds = ttl_days * 24 * 60 * 60
        self._clock = clock

        self._pk = eval_pk(evaluation_id)
        self._seq = 0
        self._saved_runs: list[str] = []
        self._emitted_complete = False
        self._terminal = False
        self._cancelled = False
        self._ts = _now_iso()

    # -- plumbing ---------------------------------------------------------- #

    @property
    def client(self) -> Any:
        """The DynamoDB client, created on first use."""
        if self._client is None:
            import boto3  # imported here so tests never need credentials

            self._client = boto3.client("dynamodb", region_name=self._region_name)
        return self._client

    @property
    def seq_count(self) -> int:
        """How many events have been appended so far."""
        return self._seq

    @property
    def saved_run_ids(self) -> list[str]:
        """Run ids persisted through :meth:`save_run`, in write order."""
        return list(self._saved_runs)

    def _expires_at(self) -> int:
        return int(self._clock()) + self._ttl_seconds

    def _meta_key(self) -> dict[str, Any]:
        return {"pk": {"S": self._pk}, "sk": {"S": META_SK}}

    # -- meta lifecycle ---------------------------------------------------- #

    def begin(self, request: dict[str, Any], *, kind: str | None = None) -> None:
        """Write the ``pending`` meta item.

        Idempotent by condition rather than by read: the FastAPI server may have
        already written ``pending`` when it accepted ``POST /evaluations``, in
        which case the conditional put fails and we leave its item alone. Either
        side may go first and the result is the same.
        """
        item = {
            "pk": {"S": self._pk},
            "sk": {"S": META_SK},
            "id": {"S": self.evaluation_id},
            "ts": {"S": self._ts},
            "kind": _text(kind if kind is not None else request.get("kind")),
            "status": {"S": "pending"},
            "config": {"S": json.dumps(request, default=str)},
            "run_ids": {"S": json.dumps([])},
            "result": {"NULL": True},
            "error": {"NULL": True},
            "seq_count": _av(0),
            "GSI1PK": {"S": GSI1_EVAL_PK},
            "GSI1SK": {"S": self._ts},
            TTL_ATTRIBUTE: _av(self._expires_at()),
        }
        try:
            self.client.put_item(
                TableName=self.table_name,
                Item=item,
                ConditionExpression="attribute_not_exists(pk)",
            )
        except Exception as exc:  # noqa: BLE001 - narrowed below
            if _is_conditional_check_failure(exc):
                logger.info(
                    "eval %s meta already exists; keeping the existing item",
                    self.evaluation_id,
                )
                return
            raise

    def mark_running(self) -> None:
        """Transition ``pending`` → ``running``.

        Conditioned on the current status being ``pending`` so a duplicate
        invoke of an already-finished evaluation cannot resurrect it into
        ``running``.
        """
        try:
            self.client.update_item(
                TableName=self.table_name,
                Key=self._meta_key(),
                UpdateExpression="SET #status = :running",
                ConditionExpression="attribute_not_exists(#status) OR #status = :pending",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":running": {"S": "running"},
                    ":pending": {"S": "pending"},
                },
            )
        except Exception as exc:  # noqa: BLE001 - narrowed below
            if _is_conditional_check_failure(exc):
                logger.warning(
                    "eval %s was not pending; not transitioning to running",
                    self.evaluation_id,
                )
                return
            raise

    def complete(
        self,
        status: str,
        *,
        result: dict[str, Any] | None = None,
        error: dict[str, Any] | None = None,
        run_ids: list[str] | None = None,
    ) -> None:
        """Write the terminal state, appending ``eval_complete`` first if needed.

        The single ``UpdateItem`` is what makes "terminal status only after
        result/error and all run items" true by construction: there is no
        intermediate item version in which ``status`` is terminal and ``result``
        is not yet set.
        """
        if status not in _TERMINAL_STATUSES:
            raise ValueError(f"{status!r} is not a terminal status {sorted(_TERMINAL_STATUSES)}")
        if self._terminal:
            raise RuntimeError(f"eval {self.evaluation_id} is already terminal")

        if not self._emitted_complete:
            # The engine did not emit its own eval_complete (it crashed, or was
            # never reached). The reader's stream ends on this line, so one must
            # exist -- and it must land before the status flip.
            self.emit({"type": "eval_complete", "status": status, "result": result})

        effective_run_ids = self._saved_runs if run_ids is None else [str(r) for r in run_ids]

        self.client.update_item(
            TableName=self.table_name,
            Key=self._meta_key(),
            UpdateExpression=(
                "SET #status = :status, #result = :result, #error = :error, "
                "run_ids = :run_ids, seq_count = :seq_count"
            ),
            ExpressionAttributeNames={
                "#status": "status",
                "#result": "result",
                "#error": "error",
            },
            ExpressionAttributeValues={
                ":status": {"S": status},
                ":result": _json(result),
                ":error": _json(error),
                ":run_ids": {"S": json.dumps(effective_run_ids)},
                ":seq_count": _av(self._seq),
            },
        )
        self._terminal = True

    # -- events ------------------------------------------------------------ #

    def emit(self, event: dict[str, Any]) -> int:
        """Append one progress event and refresh ``META.seq_count``.

        ``seq`` comes from this object's counter, not from the table, so it is
        strictly increasing from 0 with no read-modify-write race. The
        ``seq_count`` refresh is best-effort by contract (readers treat it as a
        hint), so a failure there is logged rather than propagated — losing the
        hint is survivable, losing the event is not.
        """
        if self._terminal:
            raise RuntimeError(
                f"eval {self.evaluation_id} is terminal; no further events may be appended"
            )
        if not isinstance(event, dict):
            raise TypeError(f"event must be a dict, got {type(event).__name__}")

        seq = self._seq
        self.client.put_item(
            TableName=self.table_name,
            Item={
                "pk": {"S": self._pk},
                "sk": {"S": event_sk(seq)},
                "seq": _av(seq),
                "ts": {"S": _now_iso()},
                "event": {"S": json.dumps(event, default=str)},
                TTL_ATTRIBUTE: _av(self._expires_at()),
            },
        )
        self._seq = seq + 1
        if event.get("type") == "eval_complete":
            self._emitted_complete = True

        try:
            self.client.update_item(
                TableName=self.table_name,
                Key=self._meta_key(),
                UpdateExpression="SET seq_count = :seq_count",
                ExpressionAttributeValues={":seq_count": _av(self._seq)},
            )
        except Exception:  # noqa: BLE001 - the hint is explicitly best-effort
            logger.warning(
                "eval %s: failed to refresh seq_count at seq=%d",
                self.evaluation_id,
                seq,
                exc_info=True,
            )
        return seq

    # -- runs -------------------------------------------------------------- #

    def save_run(self, run: dict[str, Any]) -> None:
        """Persist one run record as ``RUN#{run_id}/META``.

        Mirrors the SQLite ``runs`` row field-for-field (JSON columns as JSON
        strings) and adds ``evaluation_id`` plus the GSI1 ``RUN`` projection, so
        ``GET /runs/{id}`` can fall back to this item and
        ``GET /runs?execution=cloud`` can list them by ``ts`` desc.
        """
        run_id = run.get("id")
        if not run_id:
            raise ValueError("run record has no id")
        run_id = str(run_id)

        ts = run.get("ts") or _now_iso()
        if isinstance(ts, datetime):
            ts = ts.isoformat()
        ts = str(ts)

        item: dict[str, Any] = {
            "pk": {"S": run_pk(run_id)},
            "sk": {"S": META_SK},
            "evaluation_id": {"S": self.evaluation_id},
            "GSI1PK": {"S": GSI1_RUN_PK},
            "GSI1SK": {"S": ts},
            TTL_ATTRIBUTE: _av(self._expires_at()),
        }
        for field in _RUN_TEXT_FIELDS:
            item[field] = _text(ts if field == "ts" else run.get(field))
        for field in _RUN_JSON_FIELDS:
            item[field] = _json(run.get(field))

        self.client.put_item(TableName=self.table_name, Item=item)
        if run_id not in self._saved_runs:
            self._saved_runs.append(run_id)

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        """Read back a run record, decoding its JSON columns.

        Used by ``kind="grade"`` evaluations, whose inputs are runs a previous
        cloud evaluation wrote.
        """
        response = self.client.get_item(
            TableName=self.table_name,
            Key={"pk": {"S": run_pk(str(run_id))}, "sk": {"S": META_SK}},
        )
        item = response.get("Item")
        if not item:
            return None
        record = unwrap(item)
        for field in _RUN_JSON_FIELDS:
            raw = record.get(field)
            if isinstance(raw, str):
                try:
                    record[field] = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning("run %s: %s is not valid JSON", run_id, field)
                    record[field] = None
        return record

    # -- cancellation ------------------------------------------------------ #

    def cancel_requested(self) -> bool:
        """Whether a ``CANCEL`` item exists for this evaluation.

        Latched: once true it stays true without further reads. Read
        consistently, because ``DELETE /evaluations/{id}`` returns 204 the moment
        it writes the flag and an eventually-consistent read could let another
        run start after the user was told it stopped.

        A failed read returns ``False``: a transient DynamoDB error must not
        cancel a running evaluation.
        """
        if self._cancelled:
            return True
        try:
            response = self.client.get_item(
                TableName=self.table_name,
                Key={"pk": {"S": self._pk}, "sk": {"S": CANCEL_SK}},
                ConsistentRead=True,
            )
        except Exception:  # noqa: BLE001 - never cancel on a read failure
            logger.warning(
                "eval %s: cancel check failed; assuming not cancelled",
                self.evaluation_id,
                exc_info=True,
            )
            return False
        self._cancelled = bool(response.get("Item"))
        return self._cancelled

    def request_cancel(self) -> None:
        """Write the ``CANCEL`` flag.

        The FastAPI server owns this in production (``DELETE /evaluations/{id}``);
        it lives here so the flag's shape is defined next to the reader that
        depends on it, and so tests can exercise cancellation end to end.
        """
        self.client.put_item(
            TableName=self.table_name,
            Item={
                "pk": {"S": self._pk},
                "sk": {"S": CANCEL_SK},
                "ts": {"S": _now_iso()},
                TTL_ATTRIBUTE: _av(self._expires_at()),
            },
        )


def _is_conditional_check_failure(exc: Exception) -> bool:
    """Whether ``exc`` is DynamoDB's ConditionalCheckFailedException.

    Matched by error code rather than by class so the module does not import
    ``botocore.exceptions`` just for an isinstance check, and so hand-rolled
    fakes in tests can raise a look-alike.
    """
    code = getattr(exc, "response", {}).get("Error", {}).get("Code")
    return code == "ConditionalCheckFailedException" or (
        exc.__class__.__name__ == "ConditionalCheckFailedException"
    )
