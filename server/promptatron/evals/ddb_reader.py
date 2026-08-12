"""Every DynamoDB access the cloud evaluation lane makes, in one place.

The server is a *reader* of the cloud lane (the AgentCore worker is the writer)
with one exception: ``DELETE /evaluations/{id}`` puts the ``CANCEL`` flag item.

Item shapes are normative in ``docs/cloud-evals.md``; the constants and key
builders below are the single place they are spelled out on this side:

======================  ==========================  ==============================
item                    pk                          sk
======================  ==========================  ==============================
evaluation meta         ``EVAL#{evaluation_id}``    ``META``
progress event          ``EVAL#{evaluation_id}``    ``EVENT#{seq:08d}``
cancel flag             ``EVAL#{evaluation_id}``    ``CANCEL``
run record              ``RUN#{run_id}``            ``META``
======================  ==========================  ==============================

Listings go through ``GSI1`` (``GSI1PK`` = ``"EVAL"`` / ``"RUN"``, ``GSI1SK`` =
the ISO timestamp), newest first. A page cursor is the base64url encoding of
``"{GSI1SK}|{pk}"``, which is exactly enough to rebuild the ``ExclusiveStartKey``
because every listed item's ``sk`` is ``META``.

Everything here is expressed against a plain ``boto3`` DynamoDB *resource
Table* (``get_item`` / ``put_item`` / ``query``), so tests hand :class:`EvalTable`
an in-memory double instead and never touch AWS.

The keys, cursors, TTL and partition names are not defined here: they are the
same ones the worker writes and the DynamoDB history backend reads, so they live
in :mod:`promptatron.store.ddb_items` and are re-exported below under the names
this module has always used.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

from promptatron import runtime_config
from promptatron.config import Settings
from promptatron.store.ddb_items import (
    CANCEL_SK,
    EVAL_PARTITION,
    EVENT_SEQ_WIDTH,
    EVENT_SK_PREFIX,
    GSI1_INDEX_NAME,
    GSI1_PK,
    GSI1_SK,
    META_SK,
    RUN_PARTITION,
    TERMINAL_STATUSES,
    TTL_SECONDS,
    decode_cursor,
    encode_cursor,
    eval_pk,
    event_sk,
    expires_at,
    is_terminal,
    run_pk,
)

__all__ = [
    "CANCEL_SK",
    "EVAL_PARTITION",
    "EVENT_SEQ_WIDTH",
    "EVENT_SK_PREFIX",
    "GSI1_INDEX_NAME",
    "GSI1_PK",
    "GSI1_SK",
    "META_SK",
    "RUN_PARTITION",
    "TERMINAL_STATUSES",
    "TTL_SECONDS",
    "EvalTable",
    "build_eval_table",
    "build_table",
    "decode_cursor",
    "encode_cursor",
    "eval_pk",
    "event_sk",
    "expires_at",
    "is_terminal",
    "run_pk",
]

#: Upper bound of the ``EVENT#`` range -- every representable sequence number.
_MAX_EVENT_SK = event_sk(10**EVENT_SEQ_WIDTH - 1)


# --------------------------------------------------------------------------- #
# The table
# --------------------------------------------------------------------------- #


class EvalTable:
    """Cloud-lane reads (and the one cancel write) over the shared table."""

    def __init__(self, table: Any) -> None:
        self._table = table

    # -- evaluations ---------------------------------------------------- #

    def get_evaluation(self, evaluation_id: str) -> dict[str, Any] | None:
        """The ``EVAL#{id}/META`` item, or ``None`` if there is no such evaluation."""
        response = self._table.get_item(Key={"pk": eval_pk(evaluation_id), "sk": META_SK})
        return response.get("Item")

    def list_evaluations(
        self, *, limit: int = 25, cursor: str | None = None
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Newest-first page of evaluation ``META`` items from the GSI1 ``EVAL`` partition."""
        return self._list(EVAL_PARTITION, limit=limit, cursor=cursor)

    def request_cancel(self, evaluation_id: str) -> None:
        """Put the ``CANCEL`` flag item; the worker polls for its presence."""
        self._table.put_item(
            Item={
                "pk": eval_pk(evaluation_id),
                "sk": CANCEL_SK,
                "ts": datetime.now(UTC).isoformat(),
                "expiresAt": expires_at(),
            }
        )

    # -- progress events ------------------------------------------------- #

    def events_after(self, evaluation_id: str, after_seq: int = -1) -> list[dict[str, Any]]:
        """Every ``EVENT#`` item with ``seq > after_seq``, ascending.

        Expressed as a ``between`` over the zero-padded ``EVENT#`` range rather
        than ``begins_with`` + a filter: DynamoDB allows one sort-key condition,
        and the padding makes lexicographic order sequence order.
        """
        condition = Key("pk").eq(eval_pk(evaluation_id)) & Key("sk").between(
            event_sk(after_seq + 1), _MAX_EVENT_SK
        )
        items: list[dict[str, Any]] = []
        start_key: dict[str, Any] | None = None
        while True:
            kwargs: dict[str, Any] = {
                "KeyConditionExpression": condition,
                "ScanIndexForward": True,
            }
            if start_key is not None:
                kwargs["ExclusiveStartKey"] = start_key
            response = self._table.query(**kwargs)
            items.extend(response.get("Items", []))
            start_key = response.get("LastEvaluatedKey")
            if not start_key:
                return items

    # -- runs ------------------------------------------------------------ #

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        """The ``RUN#{id}/META`` item, or ``None``."""
        response = self._table.get_item(Key={"pk": run_pk(run_id), "sk": META_SK})
        return response.get("Item")

    def list_runs(
        self, *, limit: int = 25, cursor: str | None = None
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Newest-first page of run ``META`` items from the GSI1 ``RUN`` partition."""
        return self._list(RUN_PARTITION, limit=limit, cursor=cursor)

    # -- shared listing -------------------------------------------------- #

    def _list(
        self, partition: str, *, limit: int, cursor: str | None
    ) -> tuple[list[dict[str, Any]], str | None]:
        kwargs: dict[str, Any] = {
            "IndexName": GSI1_INDEX_NAME,
            "KeyConditionExpression": Key(GSI1_PK).eq(partition),
            "ScanIndexForward": False,  # ts descending
            "Limit": limit,
        }
        if cursor is not None:
            kwargs["ExclusiveStartKey"] = decode_cursor(cursor, partition)
        response = self._table.query(**kwargs)
        items = list(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        next_cursor = (
            encode_cursor(str(last_key[GSI1_SK]), str(last_key["pk"])) if last_key else None
        )
        return items, next_cursor


# --------------------------------------------------------------------------- #
# Construction
# --------------------------------------------------------------------------- #

_tables: dict[tuple[str, str], EvalTable] = {}
_raw_tables: dict[tuple[str, str], Any] = {}


def build_table(table_name: str, region_name: str) -> Any:
    """The raw ``boto3`` resource ``Table``, cached per (table, region).

    Shared with the DynamoDB history backend
    (:mod:`promptatron.store.ddb_history`), which needs the same table with a
    wider surface (``put_item``/``delete_item``) than :class:`EvalTable`
    exposes -- one boto3 resource serves both.
    """
    key = (table_name, region_name)
    if key not in _raw_tables:
        resource = boto3.resource("dynamodb", region_name=region_name)
        _raw_tables[key] = resource.Table(table_name)
    return _raw_tables[key]


def build_eval_table(settings: Settings) -> EvalTable | None:
    """The :class:`EvalTable` for these settings, or ``None`` when unconfigured.

    Cached per (table, region): a ``boto3`` resource is expensive to build and
    entirely stateless once built.
    """
    table_name = runtime_config.eval_table(settings).value
    if not table_name:
        return None
    key = (table_name, settings.aws_region)
    if key not in _tables:
        _tables[key] = EvalTable(build_table(table_name, settings.aws_region))
    return _tables[key]
