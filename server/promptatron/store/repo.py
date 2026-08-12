"""The history repository as an object, so the backend can be chosen at runtime.

:mod:`promptatron.store.history` is the spec: ten functions over runs and
evaluations, each taking a ``Session`` first. That first argument is the one
thing a DynamoDB implementation cannot honour -- there is no session, and on a
deployed server there is no SQLite file to open one against either. So the
surface is restated here as a :class:`HistoryRepo` protocol with **the same ten
methods, the same keyword arguments, the same return types and the same
errors, minus the session**, and each backend owns its own connection:

* :class:`SqliteHistoryRepo` opens a short session per call (from a factory, so
  the engine runner can still inject one) and delegates to
  ``promptatron.store.history`` verbatim -- that module is untouched and remains
  the definition of the semantics.
* :class:`~promptatron.store.ddb_history.DynamoHistoryRepo` writes the cloud
  lane's DynamoDB items.

Why an object rather than a module of functions that accept-and-ignore a
``session``: the session is not merely unused by the DynamoDB backend, it is
*unbuildable*. ``Depends(get_session)`` calls ``get_engine()``, which creates
``./data/promptatron.db`` -- a read-only filesystem inside Lambda. Handing every
router a repository instead of a session means the SQLite engine is never
constructed unless the SQLite backend is actually selected, which is what makes
the deployed process work at all. It also shrinks the routers: they no longer
open sessions for streaming exports.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager
from datetime import datetime
from typing import Any, Protocol

from fastapi import Depends
from sqlmodel import Session

from promptatron import deployment
from promptatron.config import Settings, get_settings
from promptatron.store import history
from promptatron.store.history import _UNSET, EvaluationRecord, RunRecord

SessionFactory = Callable[[], AbstractContextManager[Session]]


class HistoryRepo(Protocol):
    """Runs and evaluations, however they happen to be stored.

    Every method mirrors the same-named function in
    :mod:`promptatron.store.history` exactly, without its leading ``session``
    argument. ``NotFoundError`` on a missing id, sentinel-based partial updates
    (only the keyword arguments actually passed are written), ``limit`` clamped
    to ``[1, 100]``, listings newest-first with an opaque cursor that is
    ``None`` once there are no more pages.

    The full keyword signatures live on the two implementations (and on
    ``history.py``, which is the spec); this protocol names the surface. The
    contract suite in ``tests/test_history_backends.py`` runs one set of
    scenarios against both, which is what actually holds them to it.
    """

    def create_run(self, **fields: Any) -> RunRecord:
        """Insert a new run and return it."""

    def update_run(self, run_id: str, **fields: Any) -> RunRecord:
        """Partially update a run; ``NotFoundError`` if it doesn't exist."""

    def get_run(self, run_id: str) -> RunRecord:
        """Fetch a run by id; ``NotFoundError`` if it doesn't exist."""

    def delete_run(self, run_id: str) -> None:
        """Delete a run by id; ``NotFoundError`` if it doesn't exist."""

    def list_runs(self, **filters: Any) -> tuple[list[RunRecord], str | None]:
        """A newest-first page of runs plus the next cursor."""

    def iter_runs_export(self, **filters: Any) -> Iterator[RunRecord]:
        """Every run matching the filters, newest-first, unpaginated."""

    def create_evaluation(self, **fields: Any) -> EvaluationRecord:
        """Insert a new evaluation and return it."""

    def update_evaluation(self, evaluation_id: str, **fields: Any) -> EvaluationRecord:
        """Partially update an evaluation; ``NotFoundError`` if it doesn't exist."""

    def get_evaluation(self, evaluation_id: str) -> EvaluationRecord:
        """Fetch an evaluation by id; ``NotFoundError`` if it doesn't exist."""

    def list_evaluations(self, **filters: Any) -> tuple[list[EvaluationRecord], str | None]:
        """A newest-first page of evaluations plus the next cursor."""


def default_session_factory() -> AbstractContextManager[Session]:
    """A store session bound to the process-wide engine, created on first use."""
    from promptatron.store.db import get_engine

    return Session(get_engine())


class SqliteHistoryRepo:
    """The SQLite backend: :mod:`promptatron.store.history`, one session per call.

    A session per call rather than one per request because the interesting
    callers outlive their request -- a streaming NDJSON export, the run engine
    persisting after the endpoint function has returned, an evaluation job that
    started as a background task. Each of those already opened its own session
    before this indirection existed; now there is one place that does it.

    Args:
        session_factory: Overridable so ``execute_run`` can keep taking one
            (its tests point the store at a temporary database that way).
    """

    def __init__(self, session_factory: SessionFactory | None = None) -> None:
        self._session_factory = session_factory or default_session_factory

    def _session(self) -> AbstractContextManager[Session]:
        return self._session_factory()

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
        with self._session() as session:
            return history.create_run(
                session,
                model_id=model_id,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                scenario_id=scenario_id,
                dataset_id=dataset_id,
                dataset_hash=dataset_hash,
                config=config,
                output=output,
                tool_transcript=tool_transcript,
                metrics=metrics,
                guardrail_trace=guardrail_trace,
                status=status,
                error=error,
                id=id,
                ts=ts,
            )

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
        # Passing a sentinel through is identical to omitting the argument:
        # ``history.update_run`` tests each one with ``is not _UNSET``.
        with self._session() as session:
            return history.update_run(
                session,
                run_id,
                model_id=model_id,
                scenario_id=scenario_id,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                dataset_id=dataset_id,
                dataset_hash=dataset_hash,
                config=config,
                output=output,
                tool_transcript=tool_transcript,
                metrics=metrics,
                guardrail_trace=guardrail_trace,
                status=status,
                error=error,
            )

    def get_run(self, run_id: str) -> RunRecord:
        with self._session() as session:
            return history.get_run(session, run_id)

    def delete_run(self, run_id: str) -> None:
        with self._session() as session:
            history.delete_run(session, run_id)

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
        with self._session() as session:
            return history.list_runs(
                session,
                model_id=model_id,
                scenario_id=scenario_id,
                status=status,
                since=since,
                cursor=cursor,
                limit=limit,
            )

    def iter_runs_export(
        self,
        *,
        model_id: str | None = None,
        scenario_id: str | None = None,
        status: str | None = None,
        since: datetime | None = None,
    ) -> Iterator[RunRecord]:
        # A generator function, so the session stays open for the whole
        # iteration and closes when the consumer is done with it.
        with self._session() as session:
            yield from history.iter_runs_export(
                session,
                model_id=model_id,
                scenario_id=scenario_id,
                status=status,
                since=since,
            )

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
        with self._session() as session:
            return history.create_evaluation(
                session,
                kind=kind,
                run_ids=run_ids,
                config=config,
                status=status,
                result=result,
                progress=progress,
                error=error,
                id=id,
                ts=ts,
            )

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
        with self._session() as session:
            return history.update_evaluation(
                session,
                evaluation_id,
                kind=kind,
                status=status,
                config=config,
                run_ids=run_ids,
                result=result,
                progress=progress,
                error=error,
            )

    def get_evaluation(self, evaluation_id: str) -> EvaluationRecord:
        with self._session() as session:
            return history.get_evaluation(session, evaluation_id)

    def list_evaluations(
        self,
        *,
        kind: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: int = 25,
    ) -> tuple[list[EvaluationRecord], str | None]:
        with self._session() as session:
            return history.list_evaluations(
                session, kind=kind, status=status, cursor=cursor, limit=limit
            )


# --------------------------------------------------------------------------- #
# Construction
# --------------------------------------------------------------------------- #

#: Repositories are stateless once built (the SQLite one resolves its engine per
#: call, the DynamoDB one holds a boto3 resource table), so one per resolved
#: backend is enough -- and re-pointing the SQLite engine mid-process (as the
#: tests do) is still picked up.
_repos: dict[tuple[str, str], HistoryRepo] = {}


def build_history_repo(settings: Settings) -> HistoryRepo:
    """The repository these settings resolve to, uncached.

    Raises:
        HistoryBackendMisconfiguredError: when the backend resolves to
            ``dynamodb`` and no table is configured.
    """
    if deployment.history_backend(settings) == "sqlite":
        return SqliteHistoryRepo()

    from promptatron.evals import ddb_reader
    from promptatron.store.ddb_history import DynamoHistoryRepo

    table_name = deployment.history_table(settings)
    return DynamoHistoryRepo(ddb_reader.build_table(table_name, settings.aws_region))


def get_history_repo(settings: Settings) -> HistoryRepo:
    """The (cached) repository for these settings.

    The provider every caller goes through -- routers, the run engine, the
    evaluation engine -- so "which backend is this process using?" is answered
    in exactly one place.
    """
    backend = deployment.history_backend(settings)
    # Resolving the table on every call (not just on a miss) is deliberate: a
    # misconfigured DynamoDB backend must raise every time it is asked for, not
    # only the first time.
    key = (
        backend,
        ""
        if backend == "sqlite"
        else f"{deployment.history_table(settings)}@{settings.aws_region}",
    )
    if key not in _repos:
        _repos[key] = build_history_repo(settings)
    return _repos[key]


def get_repo(settings: Settings = Depends(get_settings)) -> HistoryRepo:
    """FastAPI dependency: the active history repository."""
    return get_history_repo(settings)


def reset_cache() -> None:
    """Forget the cached repositories (tests switching backends)."""
    _repos.clear()
