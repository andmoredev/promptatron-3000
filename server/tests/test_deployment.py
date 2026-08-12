"""Which backend and which lanes a process resolves to, and what it refuses.

Covers ``promptatron.deployment`` (the resolution matrix from
``docs/serverless-deploy.md``), the repository provider built on it, the startup
behaviour of ``main.lifespan``, and the ``POST /evaluations`` local-lane gate
plus its health flag.

``AWS_LAMBDA_FUNCTION_NAME`` is monkeypatched rather than mocked away: it is the
real signal AWS sets, and the resolution helpers read it from the environment
exactly as they do in production.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI

from promptatron import deployment, main
from promptatron.config import Settings, get_settings
from promptatron.errors import register_exception_handlers
from promptatron.evals import cloud as evals_cloud
from promptatron.evals import jobs as evals_jobs
from promptatron.routers import health as health_router
from promptatron.routers import runs
from promptatron.store import db
from promptatron.store import repo as store_repo
from promptatron.store.ddb_history import DynamoHistoryRepo
from promptatron.store.repo import SqliteHistoryRepo
from tests.fake_table import FakeTable

TABLE_NAME = "promptatron-config-store"
RUNTIME_ARN = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/promptatron-evals-abc"


@pytest.fixture(autouse=True)
def not_in_lambda(monkeypatch):
    """No test inherits a stray ``AWS_LAMBDA_FUNCTION_NAME`` from its shell."""
    monkeypatch.delenv(deployment.LAMBDA_ENV_VAR, raising=False)
    store_repo.reset_cache()
    yield
    store_repo.reset_cache()


@pytest.fixture
def in_lambda(monkeypatch):
    monkeypatch.setenv(deployment.LAMBDA_ENV_VAR, "promptatron-server")


# --------------------------------------------------------------------------- #
# The resolution matrix
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("configured", "lambda_", "expected"),
    [
        ("auto", False, "sqlite"),
        ("auto", True, "dynamodb"),
        ("sqlite", False, "sqlite"),
        ("sqlite", True, "sqlite"),
        ("dynamodb", False, "dynamodb"),
        ("dynamodb", True, "dynamodb"),
    ],
)
def test_history_backend_resolution(monkeypatch, configured, lambda_, expected):
    if lambda_:
        monkeypatch.setenv(deployment.LAMBDA_ENV_VAR, "promptatron-server")

    assert deployment.history_backend(Settings(history_backend=configured)) == expected


@pytest.mark.parametrize(
    ("configured", "lambda_", "expected"),
    [
        ("auto", False, True),
        ("auto", True, False),
        ("on", False, True),
        ("on", True, True),
        ("off", False, False),
        ("off", True, False),
    ],
)
def test_local_evals_resolution(monkeypatch, configured, lambda_, expected):
    if lambda_:
        monkeypatch.setenv(deployment.LAMBDA_ENV_VAR, "promptatron-server")

    assert deployment.local_evals_available(Settings(local_evals=configured)) is expected


def test_the_settings_come_from_prefixed_env_vars(monkeypatch):
    monkeypatch.setenv("PROMPTATRON_HISTORY_BACKEND", "dynamodb")
    monkeypatch.setenv("PROMPTATRON_LOCAL_EVALS", "off")

    settings = Settings()

    assert settings.history_backend == "dynamodb"
    assert settings.local_evals == "off"


def test_in_lambda_reads_the_documented_variable(in_lambda):
    assert deployment.in_lambda() is True


def test_history_table_uses_the_resolved_eval_table():
    assert deployment.history_table(Settings(eval_table=TABLE_NAME)) == TABLE_NAME


def test_a_dynamodb_backend_without_a_table_is_a_configuration_error():
    with pytest.raises(deployment.HistoryBackendMisconfiguredError, match="PROMPTATRON_EVAL_TABLE"):
        deployment.history_table(Settings())


# --------------------------------------------------------------------------- #
# The repository provider
# --------------------------------------------------------------------------- #


def test_the_provider_returns_the_sqlite_repository_by_default():
    assert isinstance(store_repo.get_history_repo(Settings()), SqliteHistoryRepo)


def test_the_provider_returns_the_dynamodb_repository_in_lambda(monkeypatch, in_lambda):
    table = FakeTable()
    monkeypatch.setattr(
        "promptatron.evals.ddb_reader.build_table", lambda name, region: table
    )

    built = store_repo.get_history_repo(Settings(eval_table=TABLE_NAME))

    assert isinstance(built, DynamoHistoryRepo)
    # Cached: the same settings resolve to the same object.
    assert store_repo.get_history_repo(Settings(eval_table=TABLE_NAME)) is built


def test_the_provider_refuses_a_dynamodb_backend_with_no_table(in_lambda):
    with pytest.raises(deployment.HistoryBackendMisconfiguredError):
        store_repo.get_history_repo(Settings())


def test_the_dependency_resolves_the_same_repository():
    assert isinstance(store_repo.get_repo(Settings()), SqliteHistoryRepo)


# --------------------------------------------------------------------------- #
# Startup
# --------------------------------------------------------------------------- #


async def test_lifespan_initializes_sqlite_for_the_sqlite_backend(monkeypatch, tmp_path):
    created: list[str] = []
    monkeypatch.setattr(main, "init_db", lambda path: created.append(path))
    monkeypatch.setattr(
        main, "get_settings", lambda: Settings(db_path=str(tmp_path / "h.db"))
    )

    async with main.lifespan(FastAPI()):
        pass

    assert created == [str(tmp_path / "h.db")]


async def test_lifespan_never_touches_sqlite_for_the_dynamodb_backend(monkeypatch):
    """A deployed server has a read-only filesystem; creating ./data would fail."""
    table = FakeTable()
    monkeypatch.setattr(
        "promptatron.evals.ddb_reader.build_table", lambda name, region: table
    )
    monkeypatch.setattr(main, "init_db", lambda path: pytest.fail("init_db was called"))
    monkeypatch.setattr(
        main,
        "get_settings",
        lambda: Settings(history_backend="dynamodb", eval_table=TABLE_NAME),
    )

    async with main.lifespan(FastAPI()):
        pass


async def test_lifespan_fails_fast_when_the_table_is_missing(monkeypatch):
    monkeypatch.setattr(main, "get_settings", lambda: Settings(history_backend="dynamodb"))

    with pytest.raises(deployment.HistoryBackendMisconfiguredError):
        async with main.lifespan(FastAPI()):
            pass


# --------------------------------------------------------------------------- #
# The local-lane gate
# --------------------------------------------------------------------------- #


class RecordingInvoker:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def invoke(self, evaluation_id: str, payload: dict) -> dict:
        self.calls.append((evaluation_id, payload))
        return {}


@pytest.fixture(autouse=True)
def clean_jobs():
    evals_jobs.clear()
    yield
    evals_jobs.clear()


@pytest.fixture
def initialized_db(tmp_path):
    return db.init_db(str(tmp_path / "gating.db"))


@pytest.fixture
def invoker() -> RecordingInvoker:
    return RecordingInvoker()


def build_app(settings: Settings, invoker: RecordingInvoker) -> FastAPI:
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(runs.router, prefix="/api/v1")
    application.include_router(health_router.router, prefix="/api/v1")
    application.dependency_overrides[get_settings] = lambda: settings
    application.dependency_overrides[evals_cloud.get_invoker] = lambda: invoker
    return application


@pytest.fixture
async def gated_client(initialized_db, invoker) -> AsyncIterator[httpx.AsyncClient]:
    """A server with the local lane off but the cloud lane configured."""
    app = build_app(
        Settings(local_evals="off", eval_runtime_arn=RUNTIME_ARN, eval_table=TABLE_NAME),
        invoker,
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


def determinism_body(**overrides) -> dict:
    payload: dict = {
        "kind": "determinism",
        "n": 2,
        "run_config": {"model_id": "m", "user_prompt": "go"},
    }
    payload.update(overrides)
    return payload


async def test_an_explicit_local_evaluation_is_refused_when_the_lane_is_off(gated_client):
    response = await gated_client.post(
        "/api/v1/evaluations", json=determinism_body(execution="local")
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "local_lane_unavailable"


async def test_an_omitted_execution_is_refused_rather_than_upgraded(gated_client, invoker):
    """Explicitness beats magic: the server does not choose the cloud lane for you."""
    response = await gated_client.post("/api/v1/evaluations", json=determinism_body())

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "local_lane_unavailable"
    assert invoker.calls == []


async def test_a_grade_evaluation_is_gated_before_its_run_ids_are_validated(gated_client):
    response = await gated_client.post(
        "/api/v1/evaluations", json={"kind": "grade", "run_ids": ["nope"]}
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "local_lane_unavailable"


async def test_the_cloud_lane_still_works_when_the_local_lane_is_off(gated_client, invoker):
    response = await gated_client.post(
        "/api/v1/evaluations", json=determinism_body(execution="cloud")
    )

    assert response.status_code == 202
    assert response.json()["execution"] == "cloud"
    assert len(invoker.calls) == 1


async def test_health_reports_the_local_lane_as_unavailable(gated_client):
    response = await gated_client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["local_evals"] == {"available": False}


async def test_health_reports_the_local_lane_as_available_by_default(
    initialized_db, invoker
):
    app = build_app(Settings(), invoker)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        response = await ac.get("/api/v1/health")

    assert response.json()["local_evals"] == {"available": True}
