"""One set of repository scenarios, run against **both** history backends.

``promptatron.store.history`` (SQLite) is the spec and
``promptatron.store.ddb_history`` (DynamoDB) is the second implementation of it,
so the only honest way to test the second is to run the first one's scenarios
against it: every test in the "contract" section below is parametrized over the
``repo`` fixture and executes twice, once per backend.

Neither backend touches anything real: SQLite gets a fresh file per test,
DynamoDB gets :class:`tests.fake_table.FakeTable` -- the same in-memory resource
``Table`` double the cloud-lane tests use, evaluating real
``boto3.dynamodb.conditions.Key`` expressions.

The two documented divergences are asserted as such rather than smoothed over:

* filters apply post-page on DynamoDB (GSI1 is keyed on time alone), so a
  filtered page can be shorter than ``limit``;
* the cursor is a GSI1 keyset cursor, not SQLite's ``ts|id`` -- both opaque,
  neither portable to the other backend.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest

from promptatron.config import Settings
from promptatron.engine import runner
from promptatron.engine.fake_model import FakeModel, Text
from promptatron.engine.schemas import RunRequest
from promptatron.errors import BadRequestError, NotFoundError
from promptatron.evals import engine as evals_engine
from promptatron.evals.judge import FakeJudgeModel
from promptatron.evals.schemas import EvaluationRequest
from promptatron.store import db, ddb_items
from promptatron.store.ddb_history import DynamoHistoryRepo
from promptatron.store.repo import SqliteHistoryRepo
from tests.fake_table import FakeTable

BASE_TS = datetime(2026, 8, 12, 9, 0, 0, tzinfo=UTC)


@pytest.fixture
def table() -> FakeTable:
    """The in-memory DynamoDB table behind the ``dynamodb`` backend."""
    return FakeTable()


@pytest.fixture(params=["sqlite", "dynamodb"])
def repo(request, tmp_path, table):
    """The repository under test, once per backend."""
    if request.param == "sqlite":
        db.init_db(str(tmp_path / "history.db"))
        return SqliteHistoryRepo()
    return DynamoHistoryRepo(table)


@pytest.fixture
def ddb_repo(table) -> DynamoHistoryRepo:
    """The DynamoDB backend alone, for the shape/lane assertions."""
    return DynamoHistoryRepo(table)


def make_run(repo, **overrides):
    kwargs = {
        "model_id": "anthropic.claude-3-sonnet",
        "system_prompt": "You are helpful.",
        "user_prompt": "Hello",
        "config": {"temperature": 0.5},
    }
    kwargs.update(overrides)
    return repo.create_run(**kwargs)


def make_evaluation(repo, **overrides):
    kwargs = {"kind": "determinism", "run_ids": ["run-1", "run-2"], "config": {"n": 3}}
    kwargs.update(overrides)
    return repo.create_evaluation(**kwargs)


def walk(list_call, limit: int) -> tuple[list, int]:
    """Page through a listing, returning (records, page count)."""
    seen: list = []
    cursor = None
    pages = 0
    while True:
        items, cursor = list_call(cursor=cursor, limit=limit)
        pages += 1
        seen.extend(items)
        if cursor is None:
            return seen, pages
        assert pages <= 10, "pagination did not terminate"


# --------------------------------------------------------------------------- #
# The contract: runs
# --------------------------------------------------------------------------- #


def test_create_run_sets_id_ts_and_defaults(repo):
    record = make_run(repo)

    assert record.id
    assert record.ts is not None
    assert record.status == "running"
    assert record.config == {"temperature": 0.5}
    assert record.output is None
    assert record.metrics is None


def test_get_run_round_trips_every_column(repo):
    created = make_run(
        repo,
        scenario_id="scenario-1",
        dataset_id="dataset-1",
        dataset_hash="abc123",
        output="hi there",
        tool_transcript=[{"tool": "search", "input": {"q": "x"}}],
        metrics={"latency_ms": 42},
        guardrail_trace=[{"action": "NONE"}],
        status="completed",
        error=None,
    )

    fetched = repo.get_run(created.id)

    assert fetched.id == created.id
    assert fetched.model_id == created.model_id
    assert fetched.scenario_id == "scenario-1"
    assert fetched.system_prompt == created.system_prompt
    assert fetched.user_prompt == created.user_prompt
    assert fetched.dataset_id == "dataset-1"
    assert fetched.dataset_hash == "abc123"
    assert fetched.config == {"temperature": 0.5}
    assert fetched.output == "hi there"
    assert fetched.tool_transcript == [{"tool": "search", "input": {"q": "x"}}]
    assert fetched.metrics == {"latency_ms": 42}
    assert fetched.guardrail_trace == [{"action": "NONE"}]
    assert fetched.status == "completed"
    assert fetched.error is None


def test_get_run_raises_not_found(repo):
    with pytest.raises(NotFoundError):
        repo.get_run("does-not-exist")


def test_explicit_id_and_ts_are_honoured(repo):
    record = make_run(repo, id="run-explicit", ts=BASE_TS)

    assert record.id == "run-explicit"
    assert repo.get_run("run-explicit").ts.replace(tzinfo=None) == BASE_TS.replace(tzinfo=None)


def test_update_run_only_touches_the_fields_passed(repo):
    created = make_run(repo, scenario_id="scenario-1", output="draft")

    updated = repo.update_run(created.id, status="completed", metrics={"latency_ms": 7})

    assert updated.status == "completed"
    assert updated.metrics == {"latency_ms": 7}
    # Untouched fields survive.
    assert updated.output == "draft"
    assert updated.scenario_id == "scenario-1"
    assert updated.system_prompt == created.system_prompt
    assert updated.config == {"temperature": 0.5}
    assert repo.get_run(created.id).status == "completed"


def test_update_run_distinguishes_none_from_omitted(repo):
    created = make_run(repo, scenario_id="scenario-1", metrics={"latency_ms": 1})

    updated = repo.update_run(created.id, scenario_id=None, metrics=None)

    assert updated.scenario_id is None
    assert updated.metrics is None
    assert repo.get_run(created.id).scenario_id is None


def test_update_run_raises_not_found(repo):
    with pytest.raises(NotFoundError):
        repo.update_run("does-not-exist", status="completed")


def test_delete_run_removes_it(repo):
    created = make_run(repo)

    repo.delete_run(created.id)

    with pytest.raises(NotFoundError):
        repo.get_run(created.id)


def test_delete_run_raises_not_found(repo):
    with pytest.raises(NotFoundError):
        repo.delete_run("does-not-exist")


def test_list_runs_pagination_walks_all_rows_no_dupes_no_gaps_stable_order(repo):
    created = {
        make_run(repo, user_prompt=f"prompt {i}", ts=BASE_TS + timedelta(seconds=i)).id
        for i in range(30)
    }

    seen, pages = walk(lambda **kw: repo.list_runs(**kw), limit=10)

    assert pages == 3
    ids = [record.id for record in seen]
    assert len(ids) == 30
    assert len(set(ids)) == 30  # no dupes across pages
    assert set(ids) == created  # no gaps
    timestamps = [record.ts for record in seen]
    assert timestamps == sorted(timestamps, reverse=True)  # newest first


def test_list_runs_default_limit_is_25(repo):
    for i in range(30):
        make_run(repo, ts=BASE_TS + timedelta(seconds=i))

    items, next_cursor = repo.list_runs()

    assert len(items) == 25
    assert next_cursor is not None


def test_list_runs_limit_is_clamped(repo):
    for i in range(5):
        make_run(repo, ts=BASE_TS + timedelta(seconds=i))

    items, next_cursor = repo.list_runs(limit=10_000)

    assert len(items) == 5
    assert next_cursor is None


def test_list_runs_filters_by_model_id(repo):
    make_run(repo, model_id="model-a", ts=BASE_TS)
    make_run(repo, model_id="model-b", ts=BASE_TS + timedelta(seconds=1))

    items, _ = repo.list_runs(model_id="model-a")

    assert [record.model_id for record in items] == ["model-a"]


def test_list_runs_filters_by_scenario_id(repo):
    make_run(repo, scenario_id="scenario-1", ts=BASE_TS)
    make_run(repo, scenario_id="scenario-2", ts=BASE_TS + timedelta(seconds=1))
    make_run(repo, ts=BASE_TS + timedelta(seconds=2))

    items, _ = repo.list_runs(scenario_id="scenario-1")

    assert [record.scenario_id for record in items] == ["scenario-1"]


def test_list_runs_filters_by_status(repo):
    make_run(repo, status="completed", ts=BASE_TS)
    make_run(repo, status="error", ts=BASE_TS + timedelta(seconds=1))

    items, _ = repo.list_runs(status="error")

    assert [record.status for record in items] == ["error"]


def test_list_runs_filters_by_since(repo):
    old = make_run(repo, ts=BASE_TS - timedelta(days=1))
    recent = make_run(repo, ts=BASE_TS)

    items, _ = repo.list_runs(since=BASE_TS - timedelta(hours=1))

    ids = {record.id for record in items}
    assert recent.id in ids
    assert old.id not in ids


def test_list_runs_since_accepts_a_naive_cutoff(repo):
    """``?since=`` arrives without an offset; comparing it must not explode."""
    recent = make_run(repo, ts=BASE_TS)

    items, _ = repo.list_runs(since=(BASE_TS - timedelta(hours=1)).replace(tzinfo=None))

    assert recent.id in {record.id for record in items}


def test_list_runs_rejects_a_malformed_cursor(repo):
    with pytest.raises(BadRequestError):
        repo.list_runs(cursor="!!!not-base64!!!")


def test_iter_runs_export_yields_every_matching_row(repo):
    for i in range(7):
        make_run(repo, model_id="export-model", ts=BASE_TS + timedelta(seconds=i))
    make_run(repo, model_id="other-model", ts=BASE_TS + timedelta(seconds=99))

    exported = list(repo.iter_runs_export(model_id="export-model"))

    assert len(exported) == 7
    assert all(record.model_id == "export-model" for record in exported)


def test_iter_runs_export_walks_past_one_page(repo):
    """More rows than a single DynamoDB page: the export must not stop at 100."""
    for i in range(120):
        make_run(repo, ts=BASE_TS + timedelta(seconds=i))

    exported = list(repo.iter_runs_export())

    assert len(exported) == 120
    timestamps = [record.ts for record in exported]
    assert timestamps == sorted(timestamps, reverse=True)


def test_iter_runs_export_filters_by_status_and_since(repo):
    make_run(repo, status="error", ts=BASE_TS - timedelta(days=2))
    wanted = make_run(repo, status="error", ts=BASE_TS)
    make_run(repo, status="completed", ts=BASE_TS + timedelta(seconds=1))

    exported = list(
        repo.iter_runs_export(status="error", since=BASE_TS - timedelta(hours=1))
    )

    assert [record.id for record in exported] == [wanted.id]


def test_iter_runs_export_filters_by_scenario(repo):
    wanted = make_run(repo, scenario_id="scenario-a", ts=BASE_TS)
    make_run(repo, scenario_id="scenario-b", ts=BASE_TS + timedelta(seconds=1))

    exported = list(repo.iter_runs_export(scenario_id="scenario-a"))

    assert [record.id for record in exported] == [wanted.id]


# --------------------------------------------------------------------------- #
# The contract: evaluations
# --------------------------------------------------------------------------- #


def test_create_and_get_evaluation(repo):
    created = make_evaluation(repo)

    fetched = repo.get_evaluation(created.id)

    assert fetched.id == created.id
    assert fetched.kind == "determinism"
    assert fetched.status == "pending"
    assert fetched.config == {"n": 3}
    assert fetched.run_ids == ["run-1", "run-2"]
    assert fetched.result is None
    assert fetched.progress is None
    assert fetched.error is None


def test_get_evaluation_raises_not_found(repo):
    with pytest.raises(NotFoundError):
        repo.get_evaluation("does-not-exist")


def test_explicit_evaluation_id_is_honoured(repo):
    make_evaluation(repo, id="eval-explicit", ts=BASE_TS)

    assert repo.get_evaluation("eval-explicit").id == "eval-explicit"


def test_update_evaluation_only_touches_the_fields_passed(repo):
    created = make_evaluation(repo)

    updated = repo.update_evaluation(
        created.id,
        status="completed",
        result={"grade": "A"},
        run_ids=["run-9"],
        config={"n": 3, "rubric": None},
    )
    assert updated.config == {"n": 3, "rubric": None}

    assert updated.status == "completed"
    assert updated.result == {"grade": "A"}
    assert updated.run_ids == ["run-9"]
    assert updated.kind == "determinism"
    assert repo.get_evaluation(created.id).result == {"grade": "A"}


def test_update_evaluation_writes_progress_and_clears_it(repo):
    created = make_evaluation(repo)

    repo.update_evaluation(created.id, progress={"completed": 1, "total": 3})
    assert repo.get_evaluation(created.id).progress == {"completed": 1, "total": 3}

    repo.update_evaluation(created.id, progress=None)
    assert repo.get_evaluation(created.id).progress is None


def test_update_evaluation_raises_not_found(repo):
    with pytest.raises(NotFoundError):
        repo.update_evaluation("does-not-exist", status="completed")


def test_list_evaluations_pagination(repo):
    created = {
        make_evaluation(repo, ts=BASE_TS + timedelta(seconds=i)).id for i in range(30)
    }

    seen, pages = walk(lambda **kw: repo.list_evaluations(**kw), limit=10)

    assert pages == 3
    ids = [record.id for record in seen]
    assert len(set(ids)) == 30
    assert set(ids) == created
    timestamps = [record.ts for record in seen]
    assert timestamps == sorted(timestamps, reverse=True)


def test_list_evaluations_filters_by_kind_and_status(repo):
    make_evaluation(repo, kind="determinism", ts=BASE_TS)
    graded = make_evaluation(repo, kind="grade", ts=BASE_TS + timedelta(seconds=1))
    repo.update_evaluation(graded.id, status="completed")

    by_kind, _ = repo.list_evaluations(kind="grade")
    by_status, _ = repo.list_evaluations(status="completed")

    assert [record.id for record in by_kind] == [graded.id]
    assert [record.id for record in by_status] == [graded.id]


def test_list_evaluations_limit_is_clamped(repo):
    for i in range(3):
        make_evaluation(repo, ts=BASE_TS + timedelta(seconds=i))

    items, next_cursor = repo.list_evaluations(limit=10_000)

    assert len(items) == 3
    assert next_cursor is None


def test_list_evaluations_rejects_a_malformed_cursor(repo):
    with pytest.raises(BadRequestError):
        repo.list_evaluations(cursor="!!!not-base64!!!")


# --------------------------------------------------------------------------- #
# DynamoDB specifics: the items are the cloud lane's items
# --------------------------------------------------------------------------- #


def test_a_run_lands_in_the_contract_item_shape(ddb_repo, table):
    record = ddb_repo.create_run(
        model_id="some-model",
        system_prompt="you are helpful",
        user_prompt="hello",
        config={"temperature": 0.0},
        output="hi there",
        metrics={"latency_ms": 1200},
        status="completed",
        id="run-abc",
        ts=BASE_TS,
    )

    item = table.get_item(Key={"pk": "RUN#run-abc", "sk": "META"})["Item"]

    assert item["pk"] == "RUN#run-abc"
    assert item["sk"] == "META"
    assert item["GSI1PK"] == "RUN"
    assert item["GSI1SK"] == BASE_TS.isoformat()
    assert item["id"] == "run-abc"
    assert item["ts"] == BASE_TS.isoformat()
    assert item["status"] == "completed"
    assert item["output"] == "hi there"
    # JSON columns are JSON *strings*, exactly like the SQLite TEXT columns.
    assert json.loads(item["config"]) == {"temperature": 0.0}
    assert json.loads(item["metrics"]) == {"latency_ms": 1200}
    # Nullable fields are present-and-null, never absent -- including the
    # cloud-lane-only evaluation_id, which a plain server run does not have.
    for field in ("scenario_id", "dataset_id", "dataset_hash", "guardrail_trace", "error"):
        assert field in item and item[field] is None
    assert item["evaluation_id"] is None
    assert item[ddb_items.TTL_ATTRIBUTE] > 0
    assert record.id == "run-abc"


def test_an_evaluation_lands_in_the_contract_item_shape(ddb_repo, table):
    ddb_repo.create_evaluation(
        kind="grade",
        run_ids=["run-1"],
        config={"n": 1},
        id="eval-abc",
        ts=BASE_TS,
    )

    item = table.get_item(Key={"pk": "EVAL#eval-abc", "sk": "META"})["Item"]

    assert item["GSI1PK"] == "EVAL"
    assert item["GSI1SK"] == BASE_TS.isoformat()
    assert item["kind"] == "grade"
    assert item["status"] == "pending"
    assert json.loads(item["run_ids"]) == ["run-1"]
    assert json.loads(item["config"]) == {"n": 1}
    assert item["result"] is None
    assert item["error"] is None
    assert item["seq_count"] == 0
    assert item[ddb_items.TTL_ATTRIBUTE] > 0


def test_a_run_the_worker_wrote_reads_back_through_the_repository(ddb_repo, table):
    """The whole point of reusing the shapes: one reader for both writers."""
    from promptatron.worker.ddb import DynamoEvalStore, unwrap

    class _Client:
        def put_item(self, TableName, Item, **kwargs):  # noqa: N803 - boto3 spelling
            table.add(unwrap(Item))

    store = DynamoEvalStore("t", "eval-1", client=_Client())
    store.put_run(
        {
            "id": "run-from-worker",
            "ts": BASE_TS.isoformat(),
            "model_id": "some-model",
            "system_prompt": "s",
            "user_prompt": "u",
            "config": {"temperature": 0.0},
            "output": "hi",
            "metrics": {"latency_ms": 5},
            "status": "completed",
        }
    )

    record = ddb_repo.get_run("run-from-worker")
    listed, _ = ddb_repo.list_runs()

    assert record.output == "hi"
    assert record.metrics == {"latency_ms": 5}
    assert record.config == {"temperature": 0.0}
    assert [row.id for row in listed] == ["run-from-worker"]


def test_a_partial_update_keeps_attributes_this_backend_does_not_own(ddb_repo, table):
    ddb_repo.create_run(
        model_id="m", system_prompt="s", user_prompt="u", id="run-x", ts=BASE_TS
    )
    item = table.get_item(Key={"pk": "RUN#run-x", "sk": "META"})["Item"]
    table.add({**item, "evaluation_id": "eval-7"})

    ddb_repo.update_run("run-x", status="completed")

    assert table.get_item(Key={"pk": "RUN#run-x", "sk": "META"})["Item"][
        "evaluation_id"
    ] == "eval-7"


def test_filters_narrow_a_page_rather_than_filling_it(ddb_repo):
    """The documented DynamoDB divergence, asserted rather than smoothed over."""
    for i in range(10):
        ddb_repo.create_run(
            model_id="wanted" if i == 0 else "other",
            system_prompt="s",
            user_prompt="u",
            ts=BASE_TS + timedelta(seconds=i),
        )

    items, next_cursor = ddb_repo.list_runs(model_id="wanted", limit=5)

    # The newest five rows were read; only the ones matching survive.
    assert items == []
    assert next_cursor is not None


def test_a_cursor_is_the_gsi1_keyset_cursor(ddb_repo):
    for i in range(3):
        ddb_repo.create_run(
            model_id="m",
            system_prompt="s",
            user_prompt="u",
            id=f"run-{i}",
            ts=BASE_TS + timedelta(seconds=i),
        )

    _, cursor = ddb_repo.list_runs(limit=1)

    assert cursor is not None
    assert ddb_items.decode_cursor(cursor, "RUN") == {
        "pk": "RUN#run-2",
        "sk": "META",
        "GSI1PK": "RUN",
        "GSI1SK": (BASE_TS + timedelta(seconds=2)).isoformat(),
    }


# --------------------------------------------------------------------------- #
# The engines write through whichever backend is active
# --------------------------------------------------------------------------- #


async def test_the_run_engine_persists_a_streamed_run_into_dynamodb(ddb_repo, table):
    request = RunRequest(model_id="m", user_prompt="hi")
    model = FakeModel(script=[Text("hello "), Text("world")])

    events = [
        event
        async for event in runner.execute_run(
            request, model_factory=lambda _r: model, repo=ddb_repo
        )
    ]

    run_id = events[0].run_id
    assert [event.type for event in events][-1] == "run_complete"

    # Readable through the repository...
    record = ddb_repo.get_run(run_id)
    assert record.status == "completed"
    assert record.output == "hello world"
    assert record.metrics is not None
    # ...and stored as the contract's item, in the listing partition.
    item = table.get_item(Key={"pk": f"RUN#{run_id}", "sk": "META"})["Item"]
    assert item["GSI1PK"] == "RUN"
    assert json.loads(item["config"])["inference"] == request.inference.as_model_config()


async def test_the_evaluation_engine_persists_a_determinism_batch_into_dynamodb(
    ddb_repo, table
):
    evaluation = ddb_repo.create_evaluation(kind="determinism", run_ids=[], config={"n": 2})
    deps = evals_engine.EvalDeps(
        settings=Settings(),
        model_factory=lambda _request: FakeModel(script=[Text("same answer")]),
        judge_factory=lambda _model_id: FakeJudgeModel(),
        repo=ddb_repo,
    )
    request = EvaluationRequest.model_validate(
        {"kind": "determinism", "n": 2, "run_config": {"model_id": "m", "user_prompt": "go"}}
    )
    emitted: list[dict] = []

    terminal = await evals_engine.execute_evaluation_with_seam(
        request,
        emitted.append,
        evals_engine.LocalEvalStore(evaluation.id, ddb_repo),
        deps=deps,
    )

    assert terminal["status"] == "completed"
    assert len(terminal["run_ids"]) == 2

    stored = ddb_repo.get_evaluation(evaluation.id)
    assert stored.status == "completed"
    assert stored.result["metrics"]["unique_outputs"] == 1
    assert stored.result["metrics"]["runs_analyzed"] == 2
    assert sorted(stored.run_ids) == sorted(terminal["run_ids"])
    # Every repeat is a RUN# item in the same partition the listing reads.
    listed, _ = ddb_repo.list_runs()
    assert sorted(record.id for record in listed) == sorted(terminal["run_ids"])
    assert [event["type"] for event in emitted][-1] == "eval_complete"


# --------------------------------------------------------------------------- #
# The shared mapping's edges
# --------------------------------------------------------------------------- #


def test_a_malformed_json_column_reads_as_none_rather_than_exploding():
    """One corrupt column must not make an otherwise-readable run unreadable."""
    record = ddb_items.run_record(
        {"id": "run-1", "status": "completed", "metrics": "{not json", "config": "{oops"}
    )

    assert record.metrics is None
    assert record.config == {}


def test_an_unparseable_ts_reads_as_now():
    assert ddb_items.parse_ts("not-a-timestamp").tzinfo is not None
    assert ddb_items.parse_ts(None).tzinfo is not None
    assert ddb_items.parse_ts(BASE_TS) == BASE_TS


def test_normalize_ts_accepts_a_datetime_a_string_or_nothing():
    assert ddb_items.normalize_ts(BASE_TS) == BASE_TS.isoformat()
    assert ddb_items.normalize_ts("2026-01-01T00:00:00+00:00") == "2026-01-01T00:00:00+00:00"
    assert ddb_items.normalize_ts(None)


def test_an_empty_cursor_half_is_rejected():
    empty = ddb_items.encode_cursor("", "RUN#x")

    with pytest.raises(BadRequestError):
        ddb_items.decode_cursor(empty, "RUN")


def test_items_refuse_a_record_with_no_id():
    with pytest.raises(ValueError, match="no id"):
        ddb_items.run_item({"status": "completed"})
    with pytest.raises(ValueError, match="no id"):
        ddb_items.evaluation_item({"kind": "determinism"})


def test_items_refuse_something_that_is_neither_mapping_nor_dataclass():
    with pytest.raises(TypeError, match="mapping or a dataclass"):
        ddb_items.run_item("not a record")
