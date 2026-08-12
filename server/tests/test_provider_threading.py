"""``provider`` end to end: request -> stored config -> worker payload -> judge.

The provider is a routing key, so what matters is that it survives every hop
without anyone having to know about it: pydantic validation, the persisted run
``config``, the cloud worker's JSON round-trip, and the judge factory.
"""

import json
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI
from sqlmodel import Session
from strands.models.openai import OpenAIModel

from promptatron.config import Settings
from promptatron.configstore.client import ConfigStoreClient
from promptatron.engine.fake_model import FakeModel, Text
from promptatron.engine.schemas import RunRequest
from promptatron.errors import BadRequestError, register_exception_handlers
from promptatron.evals import engine as evals_engine
from promptatron.evals import grader
from promptatron.evals.judge import FakeJudgeModel, build_judge_model, call_judge_factory
from promptatron.evals.outcomes import RunOutcome
from promptatron.evals.schemas import EvaluationRequest, GraderConfig
from promptatron.routers import runs
from promptatron.routers.scenarios import get_config_store_client
from promptatron.store import db, history
from promptatron.worker import interfaces


def settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


# --------------------------------------------------------------------------- #
# POST /runs
# --------------------------------------------------------------------------- #


@pytest.fixture
def initialized_db(tmp_path):
    return db.init_db(str(tmp_path / "provider_threading.db"))


@pytest.fixture
def app(initialized_db) -> FastAPI:
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(runs.router, prefix="/api/v1")
    application.dependency_overrides[runs.get_model_factory] = lambda: (
        lambda _request: FakeModel(script=[Text("hi")])
    )
    application.dependency_overrides[get_config_store_client] = lambda: ConfigStoreClient(
        base_url="https://configstore.test", api_key="test-api-key"
    )
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.mark.parametrize("provider", ["bedrock", "anthropic", "openai", "ollama"])
async def test_the_requested_provider_lands_on_the_stored_run(client, provider, initialized_db):
    response = await client.post(
        "/api/v1/runs",
        json={
            "model_id": "some-model",
            "provider": provider,
            "user_prompt": "hi",
            "stream": False,
        },
    )

    assert response.status_code == 200
    with Session(initialized_db) as session:
        record = history.get_run(session, response.json()["id"])
    assert record.config["provider"] == provider


async def test_an_omitted_provider_is_stored_as_bedrock(client, initialized_db):
    response = await client.post(
        "/api/v1/runs",
        json={"model_id": "some-model", "user_prompt": "hi", "stream": False},
    )

    with Session(initialized_db) as session:
        record = history.get_run(session, response.json()["id"])
    assert record.config["provider"] == "bedrock"


async def test_a_guardrail_on_a_non_bedrock_provider_is_a_400_envelope(client):
    response = await client.post(
        "/api/v1/runs",
        json={
            "model_id": "claude-sonnet-4-5",
            "provider": "anthropic",
            "user_prompt": "hi",
            "guardrail": {"id": "gr-1"},
        },
    )

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "guardrail_requires_bedrock"
    assert error["detail"]["provider"] == "anthropic"


async def test_an_unknown_provider_is_a_422(client):
    response = await client.post(
        "/api/v1/runs",
        json={"model_id": "m", "provider": "cohere", "user_prompt": "hi"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


# --------------------------------------------------------------------------- #
# The cloud worker's JSON round-trip
# --------------------------------------------------------------------------- #


def test_the_worker_payload_preserves_both_providers():
    """`parse_request` must not silently drop fields it does not know about."""
    request = {
        "kind": "determinism",
        "n": 2,
        "execution": "cloud",
        "run_config": {
            "model_id": "llama3.1:8b",
            "provider": "ollama",
            "user_prompt": "hi",
        },
        "grader": {"model_id": "gpt-4o", "provider": "openai"},
    }
    _evaluation_id, body = interfaces.validate_payload(
        json.loads(json.dumps({"evaluation_id": "a" * 32, "request": request}))
    )

    parsed = interfaces.parse_request(body)

    assert parsed.run_config.provider == "ollama"
    assert parsed.grader.provider == "openai"


def test_the_evaluation_config_persists_both_providers():
    request = EvaluationRequest(
        kind="determinism",
        n=2,
        run_config=RunRequest(model_id="gpt-4o", provider="openai", user_prompt="hi"),
        grader=GraderConfig(model_id="claude-haiku-4-5", provider="anthropic"),
    )

    config = request.stored_config()

    assert config["run_config"]["provider"] == "openai"
    assert config["grader"]["provider"] == "anthropic"


def test_the_grader_defaults_to_bedrock():
    assert GraderConfig().provider == "bedrock"


# --------------------------------------------------------------------------- #
# The judge
# --------------------------------------------------------------------------- #


def test_the_judge_can_run_on_a_non_bedrock_provider():
    model = build_judge_model("gpt-4o", settings(openai_api_key="sk-openai-test"), "openai")
    assert isinstance(model, OpenAIModel)
    assert model.get_config()["model_id"] == "gpt-4o"


def test_an_unconfigured_judge_provider_is_refused():
    with pytest.raises(BadRequestError) as exc_info:
        build_judge_model("claude-haiku-4-5", settings(), "anthropic")
    assert exc_info.value.code == "provider_not_configured"


@pytest.mark.parametrize("provider", ["bedrock", "anthropic", "openai", "ollama"])
def test_the_fake_judge_short_circuits_every_provider(provider):
    model = build_judge_model("any-model", settings(fake_model=True), provider)
    assert isinstance(model, FakeJudgeModel)


def test_call_judge_factory_accepts_both_factory_shapes():
    """One-argument overrides predate the provider and must keep working."""
    seen: list[tuple] = []

    def two_arg(model_id, provider):
        seen.append((model_id, provider))
        return FakeJudgeModel()

    def one_arg(model_id):
        seen.append((model_id,))
        return FakeJudgeModel()

    call_judge_factory(two_arg, "m", "openai")
    call_judge_factory(one_arg, "m", "openai")

    assert seen == [("m", "openai"), ("m",)]


def test_call_judge_factory_does_not_swallow_a_factory_type_error():
    def broken(_model_id, _provider):
        raise TypeError("exploded inside the factory")

    with pytest.raises(TypeError, match="exploded inside the factory"):
        call_judge_factory(broken, "m", "bedrock")


def test_the_cloud_lanes_default_judge_factory_takes_a_provider():
    """The worker builds its own deps, so its factory needs the arity too."""
    deps = evals_engine.default_deps(settings(openai_api_key="sk-openai-test"))

    assert isinstance(call_judge_factory(deps.judge_factory, "gpt-4o", "openai"), OpenAIModel)


async def test_the_graders_provider_reaches_the_judge_factory():
    seen: list[str] = []

    def factory(model_id, provider):
        seen.append(provider)
        return FakeJudgeModel()

    result = await grader.judge(
        [
            RunOutcome(
                index=i,
                run_id=f"run-{i}",
                status="completed",
                output="same",
                user_prompt="p",
                tool_transcript=[],
            )
            for i in range(2)
        ],
        kind="determinism",
        rubric=None,
        grader=GraderConfig(model_id="gpt-4o", provider="openai"),
        judge_factory=factory,
    )

    assert result.error is None
    assert seen == ["openai"]
