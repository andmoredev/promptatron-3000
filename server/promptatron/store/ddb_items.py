"""One place where a run or an evaluation *is* a DynamoDB item.

Three components speak the item shapes in ``docs/cloud-evals.md``: the
AgentCore worker writes them (:mod:`promptatron.worker.ddb`), the server reads
them for the cloud lane (:mod:`promptatron.evals.ddb_reader` /
:mod:`promptatron.evals.cloud`), and -- once the history backend is DynamoDB --
the server writes them too (:mod:`promptatron.store.ddb_history`). This module
is the single definition all three import, so "verbatim the same shapes" is a
property of the code rather than of three docstrings agreeing.

Everything here is expressed in **plain Python values**: strings, ints, ``None``
for the nullable columns. That is exactly what a ``boto3`` resource ``Table``
takes and returns. The worker, which deliberately uses the low-level client so
its tests can assert on AttributeValue dicts, serializes the same plain items
with a ``TypeSerializer`` -- ``None`` becomes ``{"NULL": True}``, ``str``
becomes ``{"S": ...}``, ``int`` becomes ``{"N": ...}`` -- so both sides emit
byte-identical items.

Two conventions carried over verbatim from the contract:

* **JSON columns are JSON strings**, matching the SQLite ``TEXT`` columns they
  mirror (``config``, ``tool_transcript``, ``metrics``, ``guardrail_trace``,
  ``error``, ``result``, ``progress``, ``run_ids``).
* **Nullable fields are present-and-null, never absent**, so a reader never has
  to tell "the writer omitted it" from "it is null".
"""

from __future__ import annotations

import base64
import json
import time
from collections.abc import Mapping
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
from typing import Any

from promptatron.errors import BadRequestError
from promptatron.store.history import EvaluationRecord, RunRecord

# --------------------------------------------------------------------------- #
# Keys, indexes, TTL
# --------------------------------------------------------------------------- #

META_SK = "META"
CANCEL_SK = "CANCEL"
EVENT_SK_PREFIX = "EVENT#"
#: ``EVENT#{seq:08d}`` -- zero-padded so lexicographic ``sk`` order is sequence
#: order. Eight digits covers 100M events per evaluation.
EVENT_SEQ_WIDTH = 8

#: The listing index on the shared config-store table.
GSI1_INDEX_NAME = "GSI1"
GSI1_PK = "GSI1PK"
GSI1_SK = "GSI1SK"

EVAL_PARTITION = "EVAL"
RUN_PARTITION = "RUN"

#: TTL horizon for every item written through this module (the contract's 90
#: days), on the ``expiresAt`` attribute the table's TTL is configured for.
TTL_DAYS = 90
TTL_SECONDS = TTL_DAYS * 24 * 60 * 60
TTL_ATTRIBUTE = "expiresAt"

TERMINAL_STATUSES = frozenset({"completed", "error", "cancelled"})

#: Run fields stored as plain strings, in the order the item is built.
RUN_TEXT_FIELDS = (
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
#: Run fields JSON-encoded on the way in, matching the SQLite ``runs`` table's
#: TEXT-holding-JSON columns exactly (see :mod:`promptatron.store.models`).
RUN_JSON_FIELDS = ("config", "tool_transcript", "metrics", "guardrail_trace", "error")

#: Evaluation-meta fields stored as plain strings.
EVAL_TEXT_FIELDS = ("id", "ts", "kind", "status")
#: Evaluation-meta fields JSON-encoded on the way in. ``config`` and ``run_ids``
#: are handled separately: they are never null (``"{}"`` / ``"[]"`` instead).
EVAL_JSON_FIELDS = ("result", "progress", "error")


def eval_pk(evaluation_id: str) -> str:
    """Partition key for an evaluation's meta/event/cancel items."""
    return f"{EVAL_PARTITION}#{evaluation_id}"


def run_pk(run_id: str) -> str:
    """Partition key for a run record."""
    return f"{RUN_PARTITION}#{run_id}"


def event_sk(seq: int) -> str:
    """Sort key for progress event ``seq``."""
    return f"{EVENT_SK_PREFIX}{seq:0{EVENT_SEQ_WIDTH}d}"


def expires_at(now: float | None = None) -> int:
    """The ``expiresAt`` (epoch seconds) every item carries for TTL."""
    return int((now if now is not None else time.time()) + TTL_SECONDS)


def is_terminal(status: str | None) -> bool:
    """Whether an evaluation status is one it can never leave."""
    return status in TERMINAL_STATUSES


def now_iso() -> str:
    """The timestamp format every item's ``ts``/``GSI1SK`` uses."""
    return datetime.now(UTC).isoformat()


# --------------------------------------------------------------------------- #
# Cursors
# --------------------------------------------------------------------------- #


def encode_cursor(gsi1sk: str, pk: str) -> str:
    """A page cursor: base64url of ``"{GSI1SK}|{pk}"``.

    Enough to rebuild an ``ExclusiveStartKey`` because every listed item's
    ``sk`` is ``META``.
    """
    return base64.urlsafe_b64encode(f"{gsi1sk}|{pk}".encode()).decode("ascii")


def decode_cursor(cursor: str, partition: str) -> dict[str, str]:
    """Rebuild an ``ExclusiveStartKey`` from a cursor. 400s on a malformed one."""
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        gsi1sk, pk = raw.split("|", 1)
    except Exception as exc:
        raise BadRequestError("Invalid pagination cursor", detail={"cursor": cursor}) from exc
    if not gsi1sk or not pk:
        raise BadRequestError("Invalid pagination cursor", detail={"cursor": cursor})
    return {"pk": pk, "sk": META_SK, GSI1_PK: partition, GSI1_SK: gsi1sk}


# --------------------------------------------------------------------------- #
# Value encoding
# --------------------------------------------------------------------------- #


def text(value: Any) -> str | None:
    """A nullable string column: ``None`` stays ``None`` (a DynamoDB ``NULL``)."""
    return None if value is None else str(value)


def dump_json(value: Any) -> str | None:
    """A nullable JSON-string column (matching the SQLite TEXT columns).

    ``default=str`` is what lets a stray non-JSON-native value (a ``datetime``
    that slipped into a result payload) serialize instead of raising.
    """
    return None if value is None else json.dumps(value, default=str)


def parse_json(raw: Any, default: Any = None) -> Any:
    """A JSON-string column, parsed. Absent/null/``""`` -> ``default``."""
    if raw is None or raw == "":
        return default
    if isinstance(raw, str):
        return json.loads(raw)
    return raw  # already a native map/list (a permissive writer)


def parse_json_lenient(raw: Any, default: Any = None) -> Any:
    """:func:`parse_json`, but malformed JSON reads as ``default`` rather than raising.

    Used on the record-mapping path, where one corrupt column should not make an
    otherwise-readable run unreadable.
    """
    try:
        return parse_json(raw, default)
    except json.JSONDecodeError:
        return default


def parse_ts(value: Any) -> datetime:
    """A ``ts`` attribute as a ``datetime``; anything unparseable reads as now."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now(UTC)


def normalize_ts(value: Any) -> str:
    """A ``ts`` attribute as the ISO string every item stores."""
    if value is None:
        return now_iso()
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _fields(record: Any) -> Mapping[str, Any]:
    """A record as a mapping, whether it arrived as a dataclass or a dict."""
    if isinstance(record, Mapping):
        return record
    if is_dataclass(record) and not isinstance(record, type):
        return asdict(record)
    raise TypeError(f"expected a mapping or a dataclass, got {type(record).__name__}")


# --------------------------------------------------------------------------- #
# Runs
# --------------------------------------------------------------------------- #


def run_item(
    run: RunRecord | Mapping[str, Any],
    *,
    evaluation_id: str | None = None,
    ttl: int | None = None,
) -> dict[str, Any]:
    """Build the ``RUN#{id}/META`` item for one run record.

    Mirrors the SQLite ``runs`` row field-for-field (JSON columns as JSON
    strings) and adds ``evaluation_id`` plus the GSI1 ``RUN`` projection, so
    ``GET /runs/{id}`` can read it back and ``GET /runs`` can list it by ``ts``
    descending. ``evaluation_id`` is ``None`` for a run this server executed
    outside any evaluation -- present and null, like every other nullable field.
    """
    data = _fields(run)
    run_id = data.get("id")
    if not run_id:
        raise ValueError("run record has no id")

    ts = normalize_ts(data.get("ts"))
    item: dict[str, Any] = {
        "pk": run_pk(str(run_id)),
        "sk": META_SK,
        "evaluation_id": text(evaluation_id),
        GSI1_PK: RUN_PARTITION,
        GSI1_SK: ts,
        TTL_ATTRIBUTE: expires_at() if ttl is None else ttl,
    }
    for field in RUN_TEXT_FIELDS:
        item[field] = text(ts if field == "ts" else data.get(field))
    for field in RUN_JSON_FIELDS:
        item[field] = dump_json(data.get(field))
    return item


def run_record(item: Mapping[str, Any]) -> RunRecord:
    """Read a ``RUN#{id}/META`` item back as a :class:`RunRecord`.

    Every caller gets the same dataclass the SQLite repository returns, so code
    above this layer never branches on where a run came from.
    """
    return RunRecord(
        id=str(item.get("id") or ""),
        ts=parse_ts(item.get("ts")),
        model_id=str(item.get("model_id") or ""),
        scenario_id=item.get("scenario_id"),
        system_prompt=str(item.get("system_prompt") or ""),
        user_prompt=str(item.get("user_prompt") or ""),
        dataset_id=item.get("dataset_id"),
        dataset_hash=item.get("dataset_hash"),
        config=parse_json_lenient(item.get("config"), {}) or {},
        output=item.get("output"),
        tool_transcript=parse_json_lenient(item.get("tool_transcript")),
        metrics=parse_json_lenient(item.get("metrics")),
        guardrail_trace=parse_json_lenient(item.get("guardrail_trace")),
        status=str(item.get("status") or "completed"),
        error=parse_json_lenient(item.get("error")),
    )


# --------------------------------------------------------------------------- #
# Evaluations
# --------------------------------------------------------------------------- #


def evaluation_item(
    evaluation: EvaluationRecord | Mapping[str, Any],
    *,
    seq_count: int = 0,
    ttl: int | None = None,
) -> dict[str, Any]:
    """Build the ``EVAL#{id}/META`` item for one evaluation record.

    ``run_ids`` is a JSON *string* rather than a native DynamoDB list, matching
    the SQLite ``evaluations.run_ids`` TEXT column and the rest of the row's
    JSON-as-string convention. ``seq_count`` is the reader's event-count hint;
    an evaluation this server created has emitted nothing yet.
    """
    data = _fields(evaluation)
    evaluation_id = data.get("id")
    if not evaluation_id:
        raise ValueError("evaluation record has no id")

    ts = normalize_ts(data.get("ts"))
    item: dict[str, Any] = {
        "pk": eval_pk(str(evaluation_id)),
        "sk": META_SK,
        GSI1_PK: EVAL_PARTITION,
        GSI1_SK: ts,
        TTL_ATTRIBUTE: expires_at() if ttl is None else ttl,
        "config": json.dumps(data.get("config") or {}, default=str),
        "run_ids": json.dumps(list(data.get("run_ids") or []), default=str),
        "seq_count": seq_count,
    }
    for field in EVAL_TEXT_FIELDS:
        item[field] = text(ts if field == "ts" else data.get(field))
    for field in EVAL_JSON_FIELDS:
        item[field] = dump_json(data.get(field))
    return item


def evaluation_record(item: Mapping[str, Any]) -> EvaluationRecord:
    """Read an ``EVAL#{id}/META`` item back as an :class:`EvaluationRecord`."""
    return EvaluationRecord(
        id=str(item.get("id") or ""),
        ts=parse_ts(item.get("ts")),
        kind=str(item.get("kind") or ""),
        status=str(item.get("status") or "pending"),
        config=parse_json_lenient(item.get("config"), {}) or {},
        run_ids=list(parse_json_lenient(item.get("run_ids"), []) or []),
        result=parse_json_lenient(item.get("result")),
        progress=parse_json_lenient(item.get("progress")),
        error=parse_json_lenient(item.get("error")),
    )
