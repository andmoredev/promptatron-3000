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

The item *shapes* (keys, field lists, JSON columns, TTL) come from
:mod:`promptatron.store.ddb_items`, shared with the server-side reader and with
the DynamoDB history backend. Only the AttributeValue encoding is this module's
own: :func:`_serialize` turns one of those plain-Python items into exactly the
dicts this module has always written.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from boto3.dynamodb.types import TypeDeserializer, TypeSerializer

from promptatron.store import ddb_items
from promptatron.store.ddb_items import (
    CANCEL_SK,
    EVENT_SEQ_WIDTH,
    META_SK,
    TTL_ATTRIBUTE,
    TTL_DAYS,
    TTL_SECONDS,
    eval_pk,
    event_sk,
    run_pk,
)
from promptatron.store.ddb_items import EVAL_PARTITION as GSI1_EVAL_PK
from promptatron.store.ddb_items import RUN_PARTITION as GSI1_RUN_PK

logger = logging.getLogger(__name__)

__all__ = [
    "CANCEL_SK",
    "EVENT_SEQ_WIDTH",
    "GSI1_EVAL_PK",
    "GSI1_RUN_PK",
    "TTL_ATTRIBUTE",
    "TTL_DAYS",
    "TTL_SECONDS",
    "DynamoEvalStore",
    "eval_pk",
    "event_sk",
    "run_pk",
]

#: Terminal statuses. ``complete()`` refuses anything else.
_TERMINAL_STATUSES = frozenset({"completed", "error", "cancelled"})

#: Run fields that are JSON-encoded on the way in, matching the SQLite ``runs``
#: table's TEXT-holding-JSON columns exactly (see ``promptatron.store.models``).
_RUN_JSON_FIELDS = ddb_items.RUN_JSON_FIELDS

#: Meta fields that are JSON-encoded on the way in, matching the SQLite
#: ``evaluations`` table. ``progress`` is not in the contract's table but is a
#: SQLite column the engine writes mid-flight; carrying it costs nothing and
#: keeps the two lanes' rows comparable.
_META_JSON_FIELDS = frozenset({*ddb_items.EVAL_JSON_FIELDS, "run_ids"})

#: DynamoDB reserved words among the meta attribute names, which have to be
#: aliased in an UpdateExpression.
_RESERVED_META_WORDS = frozenset({"status", "result", "error", "config", "ts"})

_serializer = TypeSerializer()
_deserializer = TypeDeserializer()


# --------------------------------------------------------------------------- #
# Attribute helpers
# --------------------------------------------------------------------------- #


def _av(value: Any) -> dict[str, Any]:
    """Serialize one Python value to a DynamoDB AttributeValue."""
    return _serializer.serialize(value)


def _text(value: Any) -> dict[str, Any]:
    """A nullable string attribute: ``None`` becomes ``NULL``, never absent."""
    return _av(ddb_items.text(value))


def _json(value: Any) -> dict[str, Any]:
    """A nullable JSON-string attribute (matching the SQLite TEXT columns)."""
    return _av(ddb_items.dump_json(value))


def _serialize(item: dict[str, Any]) -> dict[str, Any]:
    """A plain-Python item (from :mod:`promptatron.store.ddb_items`) as AttributeValues.

    ``None`` becomes ``{"NULL": True}``, ``str`` becomes ``{"S": ...}``, ``int``
    becomes ``{"N": ...}`` — the same encoding a resource ``Table`` applies to
    the identical item, which is what makes both writers byte-compatible.
    """
    return {key: _av(value) for key, value in item.items()}


def _now_iso() -> str:
    return ddb_items.now_iso()


def _meta_attribute(field: str, value: Any) -> dict[str, Any]:
    """Encode one evaluation-meta field the way the contract declares it.

    ``run_ids`` is a JSON *string* rather than a native DynamoDB list, matching
    the SQLite ``evaluations.run_ids`` TEXT column and the rest of the row's
    JSON-as-string convention. The reader decodes it with the same
    ``json.loads`` it uses for ``config`` and ``result``.
    """
    if field == "run_ids":
        return {"S": json.dumps(list(value or []), default=str)}
    if field in _META_JSON_FIELDS:
        return _json(value)
    return _text(value)


def unwrap(item: dict[str, Any]) -> dict[str, Any]:
    """Deserialize a raw DynamoDB item into plain Python values.

    Exposed for the reader side and for tests; the writer only uses it for
    ``get_run``.
    """
    return {key: _deserializer.deserialize(value) for key, value in item.items()}


def _to_run_record(record: dict[str, Any]) -> Any:
    """Build a ``history.RunRecord`` from a plain run dict.

    The engine's :class:`~promptatron.evals.engine.EvalStore` protocol hands
    back the same dataclass in both lanes, so the outcome-building code does not
    branch on where the run came from — and it is the same mapping the server's
    DynamoDB history backend reads runs through.
    """
    return ddb_items.run_record(record)


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
        self._pending_terminal: dict[str, Any] | None = None
        self._finalizing = False
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

    def save_evaluation(self, **fields: Any) -> None:
        """Partially update the evaluation record (the :class:`EvalStore` hook).

        Called by ``promptatron.evals.engine.execute_evaluation_with_seam``
        exactly as the local lane's ``SqliteEvalStore`` is — the engine does not
        know which lane it is running in.

        **Terminal updates are buffered, not written.** The engine settles the
        row and *then* publishes ``eval_complete``:

        .. code-block:: python

            seam.store.save_evaluation(status=status, result=result, error=error)
            seam.publish(EvalCompleteEvent(status=status, result=result))

        Writing the terminal status straight through would open exactly the race
        the contract's reader rules cannot tolerate: a reader that stops polling
        on terminal status could cut the NDJSON stream before ``eval_complete``
        was appended. So a terminal ``save_evaluation`` is held here and flushed
        by :meth:`emit` the moment ``eval_complete`` lands (or by
        :meth:`finalize` if it never does). That reorders the two writes without
        the engine having to know about DynamoDB's read semantics.
        """
        if self._terminal:
            raise RuntimeError(f"eval {self.evaluation_id} is already terminal")

        status = fields.get("status")
        if status in _TERMINAL_STATUSES:
            self._pending_terminal = dict(fields)
            return

        if status is not None and status not in {"pending", "running"}:
            raise ValueError(f"unknown evaluation status {status!r}")
        if fields:
            self._write_meta_fields(fields)

    def complete(
        self,
        status: str,
        *,
        result: dict[str, Any] | None = None,
        error: dict[str, Any] | None = None,
        run_ids: list[str] | None = None,
    ) -> None:
        """Settle the evaluation terminally, right now.

        The worker's own path to a terminal state, for the cases the engine
        never reaches: a cancel observed before execution started, an engine
        crash, a missing seam. Equivalent to a terminal
        :meth:`save_evaluation` followed by :meth:`finalize`.
        """
        if status not in _TERMINAL_STATUSES:
            raise ValueError(f"{status!r} is not a terminal status {sorted(_TERMINAL_STATUSES)}")
        self.save_evaluation(status=status, result=result, error=error, run_ids=run_ids)
        self.finalize()

    def finalize(self) -> bool:
        """Flush a buffered terminal update, synthesizing ``eval_complete`` if needed.

        Returns whether anything was written. Idempotent and safe to call on
        every path — the worker calls it after the engine returns, which covers
        an engine that settled the row but died before publishing.
        """
        if self._terminal or self._finalizing or self._pending_terminal is None:
            return False

        # Guard against re-entry: the synthesized eval_complete below goes
        # through `emit`, which flushes a pending terminal update itself.
        self._finalizing = True

        pending = self._pending_terminal
        status = pending["status"]
        result = pending.get("result")
        error = pending.get("error")

        if not self._emitted_complete:
            # The engine never published its own eval_complete. The reader's
            # stream ends on this line, so one has to exist -- and it has to
            # land before the status flip, not after.
            self.emit({"type": "eval_complete", "status": status, "result": result})

        run_ids = pending.get("run_ids")
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
        self._pending_terminal = None
        self._finalizing = False
        self._terminal = True
        return True

    def _write_meta_fields(self, fields: dict[str, Any]) -> None:
        """Write a non-terminal partial update to the meta item."""
        assignments: list[str] = []
        names: dict[str, str] = {}
        values: dict[str, Any] = {}
        for index, (field, value) in enumerate(fields.items()):
            placeholder = f":v{index}"
            if field in _RESERVED_META_WORDS:
                alias = f"#n{index}"
                names[alias] = field
                assignments.append(f"{alias} = {placeholder}")
            else:
                assignments.append(f"{field} = {placeholder}")
            values[placeholder] = _meta_attribute(field, value)

        kwargs: dict[str, Any] = {
            "TableName": self.table_name,
            "Key": self._meta_key(),
            "UpdateExpression": "SET " + ", ".join(assignments),
            "ExpressionAttributeValues": values,
        }
        if names:
            kwargs["ExpressionAttributeNames"] = names
        self.client.update_item(**kwargs)

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

        if self._emitted_complete and self._pending_terminal is not None:
            # The engine settled the row before publishing this event; now that
            # the last line is durable, the status may safely go terminal.
            self.finalize()
        return seq

    # -- runs -------------------------------------------------------------- #

    def save_run(self, run_id: str) -> None:
        """Publish a just-finished run (the :class:`EvalStore` hook).

        The engine executes runs through the ordinary run engine, which writes
        each row to the process-local SQLite database — inside AgentCore that is
        the microVM's own ephemeral disk, invisible to anyone else. This copies
        the row to DynamoDB, which is what makes it durable and readable from
        another machine.

        Called before the run's ``run_completed`` event, per the contract.
        A run that is not in SQLite came from DynamoDB in the first place
        (``kind="grade"`` over an earlier cloud evaluation's runs), so there is
        nothing to mirror.
        """
        record = self._load_local_run(str(run_id))
        if record is None:
            logger.debug("run %s is not in the local store; nothing to mirror", run_id)
            return
        self.put_run(record)

    def load_run(self, run_id: str) -> Any:
        """Read a run back as a ``history.RunRecord`` (the :class:`EvalStore` hook).

        Local SQLite first, then the DynamoDB item — the same precedence
        ``GET /runs/{id}`` uses. Determinism runs are found locally (this process
        just executed them); ``kind="grade"`` inputs from an earlier cloud
        evaluation are found in DynamoDB.

        Raises:
            NotFoundError: if the run is in neither store.
        """
        from promptatron.errors import NotFoundError

        run_id = str(run_id)
        record = self._load_local_run(run_id)
        if record is not None:
            return _to_run_record(record)

        stored = self.get_run(run_id)
        if stored is None:
            raise NotFoundError("Run not found", detail={"run_id": run_id})
        return _to_run_record(stored)

    @staticmethod
    def _load_local_run(run_id: str) -> dict[str, Any] | None:
        """The run's row from the process-local SQLite store, if it has one.

        Imported lazily: the worker's module-import path should not construct a
        SQLModel engine, and a runtime that only ever grades DynamoDB-resident
        runs never touches SQLite at all.
        """
        from dataclasses import asdict

        from sqlmodel import Session

        from promptatron.errors import NotFoundError
        from promptatron.store import history
        from promptatron.store.db import get_engine

        try:
            with Session(get_engine()) as session:
                return asdict(history.get_run(session, run_id))
        except NotFoundError:
            return None
        except Exception:  # noqa: BLE001 - a missing local DB is not fatal
            logger.warning("run %s: local store lookup failed", run_id, exc_info=True)
            return None

    def put_run(self, run: dict[str, Any]) -> None:
        """Persist one run record as ``RUN#{run_id}/META``.

        Mirrors the SQLite ``runs`` row field-for-field (JSON columns as JSON
        strings) and adds ``evaluation_id`` plus the GSI1 ``RUN`` projection, so
        ``GET /runs/{id}`` can fall back to this item and
        ``GET /runs?execution=cloud`` can list them by ``ts`` desc.
        """
        item = ddb_items.run_item(
            run, evaluation_id=self.evaluation_id, ttl=self._expires_at()
        )
        self.client.put_item(TableName=self.table_name, Item=_serialize(item))
        run_id = str(run["id"])
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
