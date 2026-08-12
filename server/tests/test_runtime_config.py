"""Tests for promptatron.runtime_config -- the precedence layer.

Resolution never talks to AWS directly here: :func:`promptatron.stack_discovery.discover`
is monkeypatched to a canned :class:`StackConfig`, so these tests are pure
precedence-logic tests (real discovery has its own coverage in
``test_stack_discovery.py``).
"""

import httpx
import pytest
import respx

from promptatron import runtime_config
from promptatron.config import Settings, get_settings
from promptatron.stack_discovery import StackConfig

STACK = StackConfig(
    config_api_url="https://stack.example.com/api",
    config_api_key="stack-key",
    eval_table="stack-table",
    eval_runtime_arn="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/stack-worker",
)


@pytest.fixture
def stack_returns(monkeypatch):
    """Make ``_stack_config`` (and therefore every resolver) see ``STACK``."""
    monkeypatch.setattr(runtime_config, "discover", lambda settings: STACK)
    return STACK


@pytest.fixture
def discovery_forbidden(monkeypatch):
    """Fail loudly if discovery is ever invoked -- for the "skip entirely" tests."""

    def _boom(settings):
        raise AssertionError("stack discovery should not have been invoked")

    monkeypatch.setattr(runtime_config, "discover", _boom)


# --------------------------------------------------------------------------- #
# Precedence: explicit > stack > unconfigured
# --------------------------------------------------------------------------- #


def test_explicit_value_wins_over_stack(stack_returns):
    settings = Settings(
        stack_discovery=True, config_api_url="https://explicit.example.com/api"
    )

    resolved = runtime_config.config_api_url(settings)

    assert resolved.value == "https://explicit.example.com/api"
    assert resolved.source == "env"


def _pair(resolved: runtime_config.Resolved) -> tuple[str | None, str | None]:
    return (resolved.value, resolved.source)


def test_falls_back_to_the_stack_when_unset(stack_returns):
    settings = Settings(stack_discovery=True)

    assert _pair(runtime_config.config_api_url(settings)) == (STACK.config_api_url, "stack")
    assert _pair(runtime_config.config_api_key(settings)) == (STACK.config_api_key, "stack")
    assert _pair(runtime_config.eval_table(settings)) == (STACK.eval_table, "stack")
    assert _pair(runtime_config.eval_runtime_arn(settings)) == (STACK.eval_runtime_arn, "stack")


def test_unconfigured_when_neither_explicit_nor_discovered(monkeypatch):
    monkeypatch.setattr(runtime_config, "discover", lambda settings: StackConfig())
    settings = Settings(stack_discovery=True)

    resolved = runtime_config.config_api_url(settings)

    assert _pair(resolved) == (None, None)


def test_each_field_resolves_independently(stack_returns):
    """An explicit key alongside a discovered url is a normal, supported mix."""
    settings = Settings(
        stack_discovery=True, config_api_key="hand-rotated-key"
    )

    url = runtime_config.config_api_url(settings)
    key = runtime_config.config_api_key(settings)

    assert (url.value, url.source) == (STACK.config_api_url, "stack")
    assert (key.value, key.source) == ("hand-rotated-key", "env")


# --------------------------------------------------------------------------- #
# stack_discovery=False
# --------------------------------------------------------------------------- #


def test_stack_discovery_false_yields_unconfigured_when_nothing_explicit():
    settings = Settings(stack_discovery=False)

    for accessor in (
        runtime_config.config_api_url,
        runtime_config.config_api_key,
        runtime_config.eval_table,
        runtime_config.eval_runtime_arn,
    ):
        resolved = accessor(settings)
        assert resolved.value is None
        assert resolved.source is None


# --------------------------------------------------------------------------- #
# Skipping discovery entirely once all four are explicit
# --------------------------------------------------------------------------- #


def test_discovery_is_never_invoked_once_all_four_are_explicit(discovery_forbidden):
    settings = Settings(
        stack_discovery=True,
        config_api_url="https://explicit.example.com/api",
        config_api_key="explicit-key",
        eval_table="explicit-table",
        eval_runtime_arn="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/explicit",
    )

    for accessor in (
        runtime_config.config_api_url,
        runtime_config.config_api_key,
        runtime_config.eval_table,
        runtime_config.eval_runtime_arn,
    ):
        resolved = accessor(settings)
        assert resolved.source == "env"


def test_discovery_still_runs_when_only_some_fields_are_explicit(stack_returns):
    """Partial explicit configuration must not suppress discovery for the rest."""
    settings = Settings(stack_discovery=True, config_api_url="https://explicit.example.com/api")

    eval_table = runtime_config.eval_table(settings)

    assert _pair(eval_table) == (STACK.eval_table, "stack")


# --------------------------------------------------------------------------- #
# cloud_evals_source
# --------------------------------------------------------------------------- #


def test_cloud_evals_source_both_from_env():
    settings = Settings(
        stack_discovery=False, eval_runtime_arn="arn:aws:x", eval_table="t"
    )
    assert runtime_config.cloud_evals_source(settings) == "env"


def test_cloud_evals_source_both_from_stack(stack_returns):
    settings = Settings(stack_discovery=True)
    assert runtime_config.cloud_evals_source(settings) == "stack"


def test_cloud_evals_source_mixed_reports_env(stack_returns):
    settings = Settings(stack_discovery=True, eval_runtime_arn="arn:aws:hand-set")
    # eval_runtime_arn explicit ("env"), eval_table falls back to the stack.
    assert runtime_config.cloud_evals_source(settings) == "env"


def test_cloud_evals_source_none_when_only_half_configured(monkeypatch):
    monkeypatch.setattr(
        runtime_config,
        "discover",
        lambda settings: StackConfig(eval_runtime_arn=STACK.eval_runtime_arn),
    )
    settings = Settings(stack_discovery=True)

    assert runtime_config.cloud_evals_source(settings) is None


def test_cloud_evals_source_none_when_unconfigured():
    settings = Settings(stack_discovery=False)
    assert runtime_config.cloud_evals_source(settings) is None


# --------------------------------------------------------------------------- #
# Health endpoint: source reported both ways
# --------------------------------------------------------------------------- #


async def test_health_reports_env_sourced_config(app, monkeypatch):
    app.dependency_overrides[get_settings] = lambda: Settings(
        stack_discovery=False,
        config_api_url="https://env.example.com/api",
        eval_runtime_arn="arn:aws:x",
        eval_table="t",
    )
    transport = httpx.ASGITransport(app=app)
    with respx.mock:
        respx.get("https://env.example.com/api/scenarios").mock(
            return_value=httpx.Response(200, json=[])
        )
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
            response = await ac.get("/api/v1/health")

    body = response.json()
    assert body["config_store"] == {"configured": True, "reachable": True, "source": "env"}
    assert body["cloud_evals"] == {"configured": True, "source": "env"}


async def test_health_reports_stack_sourced_config(app, monkeypatch):
    monkeypatch.setattr(runtime_config, "discover", lambda settings: STACK)
    app.dependency_overrides[get_settings] = lambda: Settings(stack_discovery=True)

    transport = httpx.ASGITransport(app=app)
    with respx.mock:
        respx.get(f"{STACK.config_api_url}/scenarios").mock(
            return_value=httpx.Response(200, json=[])
        )
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
            response = await ac.get("/api/v1/health")

    body = response.json()
    assert body["config_store"] == {"configured": True, "reachable": True, "source": "stack"}
    assert body["cloud_evals"] == {"configured": True, "source": "stack"}
