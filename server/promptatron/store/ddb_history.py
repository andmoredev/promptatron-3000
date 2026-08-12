"""The DynamoDB history backend: the SQLite repository's surface, on one table.

Same methods, same arguments, same return types, same errors as
:mod:`promptatron.store.history` -- see :class:`promptatron.store.repo.HistoryRepo`
for the surface both backends implement and why the ``session`` argument is not
part of it. The items written here are the cloud lane's items *verbatim*
(:mod:`promptatron.store.ddb_items`), which is the point: a run executed by a
deployed server and a run executed by the AgentCore worker land in the same
``RUN#{id}/META`` shape, in the same GSI1 partition, and read back through one
code path.

Two places where DynamoDB cannot pretend to be SQLite, both deliberate and both
already true of the cloud lane's listings today (``docs/serverless-deploy.md``:
"Filters apply post-page like the existing cloud listing"):

**Filters narrow a page, they do not fill one.** GSI1 is keyed on time alone, so
``model_id``/``scenario_id``/``status``/``since`` (and ``kind``/``status`` for
evaluations) are applied to each page *after* it is read -- exactly what a
DynamoDB ``FilterExpression`` would do. A filtered page can therefore come back
shorter than ``limit`` while ``next_cursor`` is still set.

**The cursor is a GSI1 keyset cursor**, base64url of ``"{GSI1SK}|{pk}"``, not
SQLite's ``"{ts}|{id}"``. Both are opaque to callers; neither is portable to the
other backend, which is fine because a cursor never outlives a deployment's
choice of backend.

Partial updates read-then-write the whole item rather than emitting an
``UpdateExpression``. Merging into the item that is already there preserves
attributes this backend does not own (``evaluation_id`` on a run the worker
mirrored, ``seq_count`` on an evaluation the worker is streaming), and the
writers are single-owner in practice: the engine settles its own run row, and a
cloud evaluation's row is written by the worker alone.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from promptatron.errors import NotFoundError
from promptatron.store import ddb_items
from promptatron.store.ddb_items import (
    EVAL_PARTITION,
    GSI1_INDEX_NAME,
    GSI1_PK,
    GSI1_SK,
    META_SK,
    RUN_PARTITION,
)
from promptatron.store.history import _UNSET, EvaluationRecord, RunRecord

logger = logging.getLogger(__name__)

#: Page size used while walking the whole partition for an NDJSON export.
EXPORT_PAGE_SIZE = 100


def _clamp_limit(limit: int) -> int:
    """The repository's shared limit clamp -- identical to the SQLite backend's."""
    return max(1, min(limit, 100))


def _aware(value: datetime) -> datetime:
    """A datetime as UTC-aware, treating a naive one as already-UTC.

    Records read out of DynamoDB carry the writer's offset-bearing ISO string,
    while a ``?since=`` query parameter routinely arrives naive. Comparing the
    two directly raises ``TypeError``, so both sides are normalized here.
    """
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


class DynamoHistoryRepo:
    """The history repository backed by the shared config-store table.

    Args:
        table: A ``boto3`` DynamoDB *resource* ``Table`` (``get_item`` /
            ``put_item`` / ``delete_item`` / ``query``). A resource table rather
            than the low-level client so items are plain Python values --
            :mod:`promptatron.store.ddb_items` builds exactly those.
    """

    def __init__(self, table: Any) -> None:
        self._table = table

    # -- plumbing ---------------------------------------------------------- #

    def _get(self, pk: str) -> dict[str, Any] | None:
        return self._table.get_item(Key={"pk": pk, "sk": META_SK}).get("Item")

    def _page(
        self, partition: str, *, limit: int, cursor: str | None
    ) -> tuple[list[dict[str, Any]], str | None]:
        """One newest-first page of ``META`` items from a GSI1 partition."""
        kwargs: dict[str, Any] = {
            "IndexName": GSI1_INDEX_NAME,
            "KeyConditionExpression": _key(GSI1_PK).eq(partition),
            "ScanIndexForward": False,  # ts descending
            "Limit": limit,
        }
        if cursor is not None:
            kwargs["ExclusiveStartKey"] = ddb_items.decode_cursor(cursor, partition)
        response = self._table.query(**kwargs)
        items = list(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        next_cursor = (
            ddb_items.encode_cursor(str(last_key[GSI1_SK]), str(last_key["pk"]))
            if last_key
            else None
        )
        return items, next_cursor

    def _put(self, item: dict[str, Any]) -> None:
        self._table.put_item(Item=item)

    # -- runs -------------------------------------------------------------- #

    def create_run(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
        scenario_id: str | None = None,
        dataset_id: str | None = None,
        dataset_hash: str | None = None,
        config: dict[str, Any] | None = None,
        output: str | None = None,
        tool_transcript: Any | None = None,
        metrics: dict[str, Any] | None = None,
        guardrail_trace: Any | None = None,
        status: str = "running",
        error: Any | None = None,
        id: str | None = None,
        ts: datetime | None = None,
    ) -> RunRecord:
        """Write a new ``RUN#{id}/META`` item and return it as a record."""
        record = RunRecord(
            id=id or uuid4().hex,
            ts=ts or datetime.now(UTC),
            model_id=model_id,
            scenario_id=scenario_id,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            dataset_id=dataset_id,
            dataset_hash=dataset_hash,
            config=config or {},
            output=output,
            tool_transcript=tool_transcript,
            metrics=metrics,
            guardrail_trace=guardrail_trace,
            status=status,
            error=error,
        )
        self._put(ddb_items.run_item(record))
        return record

    def update_run(
        self,
        run_id: str,
        *,
        model_id: str = _UNSET,
        scenario_id: str | None = _UNSET,
        system_prompt: str = _UNSET,
        user_prompt: str = _UNSET,
        dataset_id: str | None = _UNSET,
        dataset_hash: str | None = _UNSET,
        config: dict[str, Any] = _UNSET,
        output: str | None = _UNSET,
        tool_transcript: Any = _UNSET,
        metrics: dict[str, Any] | None = _UNSET,
        guardrail_trace: Any = _UNSET,
        status: str = _UNSET,
        error: Any = _UNSET,
    ) -> RunRecord:
        """Partially update a run. Only keyword args actually passed are changed."""
        item = self._get(ddb_items.run_pk(run_id))
        if item is None:
            raise NotFoundError(f"Run {run_id!r} not found")

        updated = dict(item)
        _assign(
            updated,
            ddb_items.text,
            model_id=model_id,
            scenario_id=scenario_id,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            dataset_id=dataset_id,
            dataset_hash=dataset_hash,
            output=output,
            status=status,
        )
        _assign(
            updated,
            ddb_items.dump_json,
            config=config,
            tool_transcript=tool_transcript,
            metrics=metrics,
            guardrail_trace=guardrail_trace,
            error=error,
        )
        self._put(updated)
        return ddb_items.run_record(updated)

    def get_run(self, run_id: str) -> RunRecord:
        """Fetch a run by id. Raises ``NotFoundError`` if it doesn't exist."""
        item = self._get(ddb_items.run_pk(run_id))
        if item is None:
            raise NotFoundError(f"Run {run_id!r} not found")
        return ddb_items.run_record(item)

    def delete_run(self, run_id: str) -> None:
        """Delete a run by id. Raises ``NotFoundError`` if it doesn't exist."""
        pk = ddb_items.run_pk(run_id)
        if self._get(pk) is None:
            raise NotFoundError(f"Run {run_id!r} not found")
        self._table.delete_item(Key={"pk": pk, "sk": META_SK})

    def list_runs(
        self,
        *,
        model_id: str | None = None,
        scenario_id: str | None = None,
        status: str | None = None,
        since: datetime | None = None,
        cursor: str | None = None,
        limit: int = 25,
    ) -> tuple[list[RunRecord], str | None]:
        """List runs newest-first with keyset pagination (filters apply post-page)."""
        items, next_cursor = self._page(
            RUN_PARTITION, limit=_clamp_limit(limit), cursor=cursor
        )
        records = [ddb_items.run_record(item) for item in items]
        return _filter_runs(records, model_id, scenario_id, status, since), next_cursor

    def iter_runs_export(
        self,
        *,
        model_id: str | None = None,
        scenario_id: str | None = None,
        status: str | None = None,
        since: datetime | None = None,
    ) -> Iterator[RunRecord]:
        """Yield every run matching the filters, newest-first, unpaginated."""
        cursor: str | None = None
        while True:
            items, cursor = self._page(
                RUN_PARTITION, limit=EXPORT_PAGE_SIZE, cursor=cursor
            )
            records = [ddb_items.run_record(item) for item in items]
            yield from _filter_runs(records, model_id, scenario_id, status, since)
            if cursor is None:
                return

    # -- evaluations ------------------------------------------------------- #

    def create_evaluation(
        self,
        *,
        kind: str,
        run_ids: list[str],
        config: dict[str, Any] | None = None,
        status: str = "pending",
        result: Any | None = None,
        progress: Any | None = None,
        error: Any | None = None,
        id: str | None = None,
        ts: datetime | None = None,
    ) -> EvaluationRecord:
        """Write a new ``EVAL#{id}/META`` item and return it as a record."""
        record = EvaluationRecord(
            id=id or uuid4().hex,
            ts=ts or datetime.now(UTC),
            kind=kind,
            status=status,
            config=config or {},
            run_ids=list(run_ids),
            result=result,
            progress=progress,
            error=error,
        )
        self._put(ddb_items.evaluation_item(record))
        return record

    def update_evaluation(
        self,
        evaluation_id: str,
        *,
        kind: str = _UNSET,
        status: str = _UNSET,
        config: dict[str, Any] = _UNSET,
        run_ids: list[str] = _UNSET,
        result: Any = _UNSET,
        progress: Any = _UNSET,
        error: Any = _UNSET,
    ) -> EvaluationRecord:
        """Partially update an evaluation. Only keyword args actually passed change."""
        item = self._get(ddb_items.eval_pk(evaluation_id))
        if item is None:
            raise NotFoundError(f"Evaluation {evaluation_id!r} not found")

        updated = dict(item)
        _assign(updated, ddb_items.text, kind=kind, status=status)
        _assign(updated, ddb_items.dump_json, result=result, progress=progress, error=error)
        # Never null: the reader always expects a JSON object/array string here.
        if config is not _UNSET:
            updated["config"] = ddb_items.dump_json(config or {})
        if run_ids is not _UNSET:
            updated["run_ids"] = ddb_items.dump_json(list(run_ids or []))
        self._put(updated)
        return ddb_items.evaluation_record(updated)

    def get_evaluation(self, evaluation_id: str) -> EvaluationRecord:
        """Fetch an evaluation by id. Raises ``NotFoundError`` if it doesn't exist."""
        item = self._get(ddb_items.eval_pk(evaluation_id))
        if item is None:
            raise NotFoundError(f"Evaluation {evaluation_id!r} not found")
        return ddb_items.evaluation_record(item)

    def list_evaluations(
        self,
        *,
        kind: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: int = 25,
    ) -> tuple[list[EvaluationRecord], str | None]:
        """List evaluations newest-first (same shape as :meth:`list_runs`)."""
        items, next_cursor = self._page(
            EVAL_PARTITION, limit=_clamp_limit(limit), cursor=cursor
        )
        records = [ddb_items.evaluation_record(item) for item in items]
        if kind is not None:
            records = [record for record in records if record.kind == kind]
        if status is not None:
            records = [record for record in records if record.status == status]
        return records, next_cursor


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _key(name: str) -> Any:
    """``boto3.dynamodb.conditions.Key``, imported lazily.

    Keeps ``import promptatron.store.ddb_history`` free of boto3 at module
    scope, matching how the rest of the store behaves when the backend is
    SQLite.
    """
    from boto3.dynamodb.conditions import Key

    return Key(name)


def _assign(item: dict[str, Any], encode: Any, **fields: Any) -> None:
    """Write the fields that were actually passed, encoded for storage."""
    for field, value in fields.items():
        if value is not _UNSET:
            item[field] = encode(value)


def _filter_runs(
    records: list[RunRecord],
    model_id: str | None,
    scenario_id: str | None,
    status: str | None,
    since: datetime | None,
) -> list[RunRecord]:
    """Apply the run listing filters to an already-read page."""
    if model_id is not None:
        records = [record for record in records if record.model_id == model_id]
    if scenario_id is not None:
        records = [record for record in records if record.scenario_id == scenario_id]
    if status is not None:
        records = [record for record in records if record.status == status]
    if since is not None:
        cutoff = _aware(since)
        records = [record for record in records if _aware(record.ts) >= cutoff]
    return records
