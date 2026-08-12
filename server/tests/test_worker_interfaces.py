"""The evals seam: late binding, and tolerance of what the engine returns.

The worker host and the evaluation engine are built independently, so these
tests pin down the two properties that make that safe: the worker imports
cleanly whether or not the seam exists yet, and it reaches a terminal state no
matter what the engine hands back.
"""

from __future__ import annotations

import subprocess
import sys

import pytest

from promptatron.worker import interfaces


def test_importing_the_worker_does_not_import_the_evals_engine():
    """The seam is resolved at call time, never at import time.

    Two things depend on this. The evals refactor is concurrent with this
    package, so a module-scope import of ``promptatron.evals.engine`` would make
    the whole worker un-importable until the seam lands; and an AgentCore cold
    start should not pay for the run engine (boto3 clients, strands, the SQLite
    store) before an invocation has even arrived.

    Checked in a subprocess because the assertion is about a *fresh*
    interpreter's module table, which this one has already polluted.
    """
    probe = (
        "import sys; import promptatron.worker.agentcore_app;"
        " assert 'promptatron.evals.engine' not in sys.modules, sorted(sys.modules)"
    )
    subprocess.run([sys.executable, "-c", probe], check=True)


def test_load_seam_raises_when_the_engine_has_not_exposed_it(monkeypatch):
    import promptatron.evals.engine as engine

    monkeypatch.delattr(engine, interfaces.SEAM_FUNCTION_NAME, raising=False)

    with pytest.raises(interfaces.EvalEngineUnavailable, match=interfaces.SEAM_FUNCTION_NAME):
        interfaces.load_seam()


def test_load_seam_finds_the_function_once_the_engine_exposes_it(monkeypatch):
    import promptatron.evals.engine as engine

    def seam(request, emit, store, cancelled=None):  # pragma: no cover - never called
        return {}

    monkeypatch.setattr(engine, interfaces.SEAM_FUNCTION_NAME, seam, raising=False)
    assert interfaces.load_seam() is seam


GRADE_REQUEST = {"kind": "grade", "run_ids": ["r1", "r2"]}


async def test_run_evaluation_passes_the_four_seam_arguments(monkeypatch):
    seen: dict = {}

    def seam(request, emit, store, cancelled=None, **_kwargs):
        seen.update(request=request, emit=emit, store=store, cancelled=cancelled)
        return {"status": "completed", "result": {"grade": "A"}, "run_ids": ["r1"]}

    monkeypatch.setattr(interfaces, "load_seam", lambda: seam)

    emit, store, cancelled = (lambda _e: None), object(), (lambda: False)
    outcome = await interfaces.run_evaluation(GRADE_REQUEST, emit, store, cancelled)

    # The seam takes the validated model, so the worker never has to know the
    # eval schema -- only that the bridge from JSON to model happens here.
    assert seen["request"].kind == "grade"
    assert seen["request"].run_ids == ["r1", "r2"]
    assert seen["emit"] is emit and seen["store"] is store and seen["cancelled"] is cancelled
    assert outcome["status"] == "completed"


async def test_run_evaluation_accepts_a_synchronous_engine(monkeypatch):
    """The engine may be sync or async; the worker's task is async either way."""

    def sync_seam(*_args, **_kwargs):
        return {"status": "completed", "result": {"grade": "B"}, "run_ids": []}

    monkeypatch.setattr(interfaces, "load_seam", lambda: sync_seam)
    outcome = await interfaces.run_evaluation(
        GRADE_REQUEST, lambda _e: None, object(), lambda: False
    )
    assert outcome["result"] == {"grade": "B"}


def test_parse_request_builds_the_evaluation_model():
    parsed = interfaces.parse_request(GRADE_REQUEST)
    assert parsed.kind == "grade"
    assert parsed.planned_runs == 2


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"kind": "nonsense"},
        {"kind": "grade"},  # run_ids is required for grade
        {"kind": "determinism"},  # run_config is required for determinism
    ],
)
def test_parse_request_rejects_an_unusable_body(body):
    with pytest.raises(interfaces.InvalidPayload):
        interfaces.parse_request(body)


# --------------------------------------------------------------------------- #
# Outcome normalization
# --------------------------------------------------------------------------- #


def test_normalize_accepts_the_full_envelope():
    outcome = interfaces.normalize_outcome(
        {
            "status": "cancelled",
            "result": None,
            "error": None,
            "run_ids": ["a", "b"],
        }
    )
    assert outcome == {"status": "cancelled", "result": None, "error": None, "run_ids": ["a", "b"]}


def test_normalize_reads_a_bare_result_as_completed():
    """Tolerance for the concurrent build-out.

    An engine that simply returns its ``result`` payload -- the shape the local
    lane already builds -- still produces a well-formed outcome.
    """
    result = {"grade": "A", "score": 0.9, "run_ids": ["r1", "r2"], "metrics": {}}
    outcome = interfaces.normalize_outcome(result)

    assert outcome["status"] == "completed"
    assert outcome["result"] == result
    assert outcome["run_ids"] == ["r1", "r2"]
    assert outcome["error"] is None


def test_normalize_recovers_run_ids_from_the_result():
    outcome = interfaces.normalize_outcome(
        {"status": "completed", "result": {"run_ids": ["x"]}, "error": None}
    )
    assert outcome["run_ids"] == ["x"]


def test_normalize_turns_a_nonsense_return_into_a_terminal_error():
    """A misbehaving engine must still let the evaluation finish."""
    outcome = interfaces.normalize_outcome("not a dict")

    assert outcome["status"] == "error"
    assert outcome["error"]["code"] == "invalid_engine_result"
    assert outcome["result"] is None


def test_normalize_carries_an_error_outcome_through():
    outcome = interfaces.normalize_outcome(
        {"status": "error", "error": {"code": "no_successful_runs", "message": "all failed"}}
    )
    assert outcome["status"] == "error"
    assert outcome["error"]["code"] == "no_successful_runs"
    assert outcome["run_ids"] == []


def test_the_dynamodb_store_satisfies_both_store_protocols():
    """The worker's restated protocol and the engine's real one must agree."""
    from promptatron.evals.engine import EvalStore
    from promptatron.worker.ddb import DynamoEvalStore

    store = DynamoEvalStore("table", "eval-1", client=object())
    assert isinstance(store, interfaces.RunStore)
    for method in ("save_evaluation", "load_run", "save_run"):
        assert callable(getattr(store, method)), method
    assert hasattr(store, "evaluation_id")
    assert set(EvalStore.__annotations__) <= set(dir(store)) | {"evaluation_id"}
