"""Tests for the run/evaluation history repository functions (promptatron.store.history)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session

from promptatron.errors import NotFoundError
from promptatron.store import db, history


@pytest.fixture
def session(tmp_path):
    """A SQLModel session bound to a fresh sqlite file per test."""
    engine = db.init_db(str(tmp_path / "history.db"))
    with Session(engine) as s:
        yield s


def _make_run(session, **overrides):
    kwargs = {
        "model_id": "anthropic.claude-3-sonnet",
        "system_prompt": "You are helpful.",
        "user_prompt": "Hello",
        "config": {"temperature": 0.5},
    }
    kwargs.update(overrides)
    return history.create_run(session, **kwargs)


def _make_evaluation(session, **overrides):
    kwargs = {
        "kind": "determinism",
        "run_ids": ["run-1", "run-2"],
        "config": {"n": 3},
    }
    kwargs.update(overrides)
    return history.create_evaluation(session, **kwargs)


# --------------------------------------------------------------------------- #
# Runs: CRUD
# --------------------------------------------------------------------------- #


def test_create_run_sets_id_and_defaults(session):
    record = _make_run(session)
    assert record.id
    assert record.ts is not None
    assert record.status == "running"
    assert record.config == {"temperature": 0.5}
    assert record.output is None
    assert record.metrics is None


def test_get_run_round_trips_json_fields(session):
    created = _make_run(
        session,
        metrics={"latency_ms": 42},
        tool_transcript=[{"tool": "search"}],
        guardrail_trace={"blocked": False},
    )
    fetched = history.get_run(session, created.id)
    assert fetched.metrics == {"latency_ms": 42}
    assert fetched.tool_transcript == [{"tool": "search"}]
    assert fetched.guardrail_trace == {"blocked": False}
    assert fetched.error is None


def test_get_run_missing_raises_not_found(session):
    with pytest.raises(NotFoundError):
        history.get_run(session, "does-not-exist")


def test_update_run_partial_update_only_touches_given_fields(session):
    created = _make_run(session)
    updated = history.update_run(session, created.id, status="completed", output="hi there")
    assert updated.status == "completed"
    assert updated.output == "hi there"
    assert updated.model_id == created.model_id
    assert updated.system_prompt == created.system_prompt
    assert updated.config == created.config


def test_update_run_can_clear_nullable_field_with_explicit_none(session):
    created = _make_run(session, scenario_id="scenario-1")
    updated = history.update_run(session, created.id, scenario_id=None)
    assert updated.scenario_id is None


def test_update_run_missing_raises_not_found(session):
    with pytest.raises(NotFoundError):
        history.update_run(session, "does-not-exist", status="completed")


def test_delete_run(session):
    created = _make_run(session)
    history.delete_run(session, created.id)
    with pytest.raises(NotFoundError):
        history.get_run(session, created.id)


def test_delete_run_missing_raises_not_found(session):
    with pytest.raises(NotFoundError):
        history.delete_run(session, "does-not-exist")


# --------------------------------------------------------------------------- #
# Runs: listing, pagination, filters, export
# --------------------------------------------------------------------------- #


def test_list_runs_pagination_walks_all_rows_no_dupes_no_gaps_stable_order(session):
    created_ids = {_make_run(session, user_prompt=f"prompt {i}").id for i in range(30)}

    seen_ids: list[str] = []
    all_ts: list[datetime] = []
    cursor = None
    pages = 0
    while True:
        items, next_cursor = history.list_runs(session, cursor=cursor, limit=10)
        pages += 1
        seen_ids.extend(r.id for r in items)
        all_ts.extend(r.ts for r in items)
        if next_cursor is None:
            break
        cursor = next_cursor
        assert pages <= 10  # safety valve

    assert pages == 3
    assert len(seen_ids) == 30
    assert len(set(seen_ids)) == 30  # no dupes across pages
    assert set(seen_ids) == created_ids  # no gaps
    assert all_ts == sorted(all_ts, reverse=True)  # newest-first, stable


def test_list_runs_filters_by_model_id(session):
    _make_run(session, model_id="model-a")
    _make_run(session, model_id="model-b")
    items, _ = history.list_runs(session, model_id="model-a")
    assert [r.model_id for r in items] == ["model-a"]


def test_list_runs_filters_by_scenario_id(session):
    _make_run(session, scenario_id="scenario-1")
    _make_run(session, scenario_id="scenario-2")
    _make_run(session)
    items, _ = history.list_runs(session, scenario_id="scenario-1")
    assert [r.scenario_id for r in items] == ["scenario-1"]


def test_list_runs_filters_by_status(session):
    _make_run(session, status="completed")
    _make_run(session, status="error")
    items, _ = history.list_runs(session, status="error")
    assert [r.status for r in items] == ["error"]


def test_list_runs_filters_by_since(session):
    old = _make_run(session, ts=datetime.now(UTC) - timedelta(days=1))
    recent = _make_run(session)
    since = datetime.now(UTC) - timedelta(hours=1)
    items, _ = history.list_runs(session, since=since)
    ids = {r.id for r in items}
    assert recent.id in ids
    assert old.id not in ids


def test_list_runs_limit_is_clamped_to_100(session):
    for i in range(5):
        _make_run(session, user_prompt=f"p{i}")
    items, next_cursor = history.list_runs(session, limit=10_000)
    assert len(items) == 5
    assert next_cursor is None


def test_list_runs_default_limit_is_25(session):
    for i in range(30):
        _make_run(session, user_prompt=f"p{i}")
    items, next_cursor = history.list_runs(session)
    assert len(items) == 25
    assert next_cursor is not None


def test_iter_runs_export_yields_all_matching_rows(session):
    for i in range(7):
        _make_run(session, model_id="export-model", user_prompt=f"p{i}")
    _make_run(session, model_id="other-model")

    exported = list(history.iter_runs_export(session, model_id="export-model"))
    assert len(exported) == 7
    assert all(r.model_id == "export-model" for r in exported)


# --------------------------------------------------------------------------- #
# Evaluations
# --------------------------------------------------------------------------- #


def test_create_and_get_evaluation(session):
    created = _make_evaluation(session)
    fetched = history.get_evaluation(session, created.id)
    assert fetched.kind == "determinism"
    assert fetched.run_ids == ["run-1", "run-2"]
    assert fetched.config == {"n": 3}
    assert fetched.status == "pending"


def test_get_evaluation_missing_raises_not_found(session):
    with pytest.raises(NotFoundError):
        history.get_evaluation(session, "does-not-exist")


def test_update_evaluation_partial_update(session):
    created = _make_evaluation(session)
    updated = history.update_evaluation(
        session, created.id, status="completed", result={"pass_rate": 1.0}
    )
    assert updated.status == "completed"
    assert updated.result == {"pass_rate": 1.0}
    assert updated.kind == "determinism"
    assert updated.run_ids == ["run-1", "run-2"]


def test_update_evaluation_missing_raises_not_found(session):
    with pytest.raises(NotFoundError):
        history.update_evaluation(session, "does-not-exist", status="completed")


def test_list_evaluations_filters_by_kind(session):
    _make_evaluation(session, kind="determinism")
    _make_evaluation(session, kind="grade")
    items, _ = history.list_evaluations(session, kind="grade")
    assert [e.kind for e in items] == ["grade"]


def test_list_evaluations_filters_by_status(session):
    _make_evaluation(session, status="completed")
    _make_evaluation(session, status="pending")
    items, _ = history.list_evaluations(session, status="completed")
    assert [e.status for e in items] == ["completed"]
