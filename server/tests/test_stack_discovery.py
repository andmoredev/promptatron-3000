"""Tests for promptatron.stack_discovery.

Uses botocore's Stubber against real boto3 ``cloudformation``/``apigateway``
clients so requests are validated against the actual service models (the same
pattern as ``test_guardrails_service.py``). ``boto3.client`` is monkeypatched
inside the module under test to hand back the stubbed clients instead of
constructing real ones, so nothing here ever reaches the network -- the
``isolated_stack_discovery`` autouse fixture in ``conftest.py`` also disables
discovery by default, but every test here opts back in explicitly.
"""

import logging

import boto3
import pytest
from botocore.stub import Stubber

from promptatron import stack_discovery
from promptatron.config import Settings
from promptatron.stack_discovery import StackConfig, discover, refresh

STACK_NAME = "promptatron-config"
API_ENDPOINT = "https://abc123.execute-api.us-east-1.amazonaws.com/api"
API_KEY_ID = "apikey123"
API_KEY_VALUE = "secret-key-value"
TABLE_NAME = "promptatron-config-store"
RUNTIME_ARN = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/promptatron-evals-abc"


@pytest.fixture(autouse=True)
def _reset_cache():
    refresh()
    yield
    refresh()


def _settings(**overrides) -> Settings:
    return Settings(stack_discovery=True, stack_name=STACK_NAME, **overrides)


def _stub_clients(monkeypatch, *, cfn_client=None, apigw_client=None):
    """Monkeypatch ``stack_discovery.boto3.client`` to hand back stubbed clients."""

    def _client(service_name, region_name=None):
        if service_name == "cloudformation":
            assert cfn_client is not None, "unexpected cloudformation client request"
            return cfn_client
        if service_name == "apigateway":
            assert apigw_client is not None, "unexpected apigateway client request"
            return apigw_client
        raise AssertionError(f"unexpected boto3 service {service_name!r}")

    monkeypatch.setattr(stack_discovery.boto3, "client", _client)


def _describe_stacks_response(**outputs) -> dict:
    return {
        "Stacks": [
            {
                "StackName": STACK_NAME,
                "StackStatus": "UPDATE_COMPLETE",
                "CreationTime": "2026-01-01T00:00:00Z",
                "Outputs": [
                    {"OutputKey": key, "OutputValue": value}
                    for key, value in outputs.items()
                    if value is not None
                ],
            }
        ]
    }


# --------------------------------------------------------------------------- #
# Happy path
# --------------------------------------------------------------------------- #


def test_discover_resolves_all_four_and_fetches_the_api_key_value(monkeypatch):
    cfn = boto3.client("cloudformation", region_name="us-east-1")
    cfn_stubber = Stubber(cfn)
    cfn_stubber.add_response(
        "describe_stacks",
        _describe_stacks_response(
            ApiEndpoint=API_ENDPOINT,
            ApiKeyId=API_KEY_ID,
            TableName=TABLE_NAME,
            EvalWorkerRuntimeArn=RUNTIME_ARN,
        ),
        {"StackName": STACK_NAME},
    )
    cfn_stubber.activate()

    apigw = boto3.client("apigateway", region_name="us-east-1")
    apigw_stubber = Stubber(apigw)
    apigw_stubber.add_response(
        "get_api_key",
        {"id": API_KEY_ID, "value": API_KEY_VALUE},
        {"apiKey": API_KEY_ID, "includeValue": True},
    )
    apigw_stubber.activate()

    _stub_clients(monkeypatch, cfn_client=cfn, apigw_client=apigw)

    result = discover(_settings())

    assert result == StackConfig(
        config_api_url=API_ENDPOINT,
        config_api_key=API_KEY_VALUE,
        eval_table=TABLE_NAME,
        eval_runtime_arn=RUNTIME_ARN,
    )
    cfn_stubber.assert_no_pending_responses()
    apigw_stubber.assert_no_pending_responses()


def test_discover_without_an_api_key_id_never_calls_apigateway(monkeypatch):
    """No ``ApiKeyId`` output (worker deployed but no key parameter set, e.g.)
    means no ``get_api_key`` call at all -- ``config_api_key`` just stays None."""
    cfn = boto3.client("cloudformation", region_name="us-east-1")
    cfn_stubber = Stubber(cfn)
    cfn_stubber.add_response(
        "describe_stacks",
        _describe_stacks_response(ApiEndpoint=API_ENDPOINT, TableName=TABLE_NAME),
        {"StackName": STACK_NAME},
    )
    cfn_stubber.activate()

    _stub_clients(monkeypatch, cfn_client=cfn)  # no apigw client registered

    result = discover(_settings())

    assert result == StackConfig(
        config_api_url=API_ENDPOINT,
        config_api_key=None,
        eval_table=TABLE_NAME,
        eval_runtime_arn=None,
    )
    cfn_stubber.assert_no_pending_responses()


# --------------------------------------------------------------------------- #
# Degraded paths
# --------------------------------------------------------------------------- #


def test_stack_missing_degrades_to_all_none_with_one_log_line(monkeypatch, caplog):
    cfn = boto3.client("cloudformation", region_name="us-east-1")
    stubber = Stubber(cfn)
    stubber.add_client_error(
        "describe_stacks",
        service_error_code="ValidationError",
        service_message=f"Stack with id {STACK_NAME} does not exist",
        http_status_code=400,
    )
    stubber.activate()
    _stub_clients(monkeypatch, cfn_client=cfn)

    with caplog.at_level(logging.INFO, logger="promptatron.stack_discovery"):
        result = discover(_settings())

    assert result == StackConfig()
    records = [r for r in caplog.records if r.name == "promptatron.stack_discovery"]
    assert len(records) == 1
    assert records[0].exc_info is None  # no traceback -- this is the normal state


def test_no_credentials_degrades_to_all_none_with_one_log_line(monkeypatch, caplog):
    import botocore.exceptions

    def _raise_no_credentials(service_name, region_name=None):
        assert service_name == "cloudformation"
        raise botocore.exceptions.NoCredentialsError()

    monkeypatch.setattr(stack_discovery.boto3, "client", _raise_no_credentials)

    with caplog.at_level(logging.INFO, logger="promptatron.stack_discovery"):
        result = discover(_settings())

    assert result == StackConfig()
    records = [r for r in caplog.records if r.name == "promptatron.stack_discovery"]
    assert len(records) == 1
    assert records[0].exc_info is None


def test_access_denied_degrades_to_all_none(monkeypatch, caplog):
    cfn = boto3.client("cloudformation", region_name="us-east-1")
    stubber = Stubber(cfn)
    stubber.add_client_error(
        "describe_stacks",
        service_error_code="AccessDenied",
        service_message="User is not authorized to perform: cloudformation:DescribeStacks",
        http_status_code=403,
    )
    stubber.activate()
    _stub_clients(monkeypatch, cfn_client=cfn)

    result = discover(_settings())

    assert result == StackConfig()


def test_get_api_key_failure_degrades_only_that_one_field(monkeypatch, caplog):
    cfn = boto3.client("cloudformation", region_name="us-east-1")
    cfn_stubber = Stubber(cfn)
    cfn_stubber.add_response(
        "describe_stacks",
        _describe_stacks_response(
            ApiEndpoint=API_ENDPOINT,
            ApiKeyId=API_KEY_ID,
            TableName=TABLE_NAME,
            EvalWorkerRuntimeArn=RUNTIME_ARN,
        ),
        {"StackName": STACK_NAME},
    )
    cfn_stubber.activate()

    apigw = boto3.client("apigateway", region_name="us-east-1")
    apigw_stubber = Stubber(apigw)
    apigw_stubber.add_client_error(
        "get_api_key",
        service_error_code="AccessDeniedException",
        service_message="not authorized",
        http_status_code=403,
    )
    apigw_stubber.activate()

    _stub_clients(monkeypatch, cfn_client=cfn, apigw_client=apigw)

    with caplog.at_level(logging.WARNING, logger="promptatron.stack_discovery"):
        result = discover(_settings())

    assert result.config_api_key is None
    # The other three fields are unaffected by the API-key lookup failing.
    assert result.config_api_url == API_ENDPOINT
    assert result.eval_table == TABLE_NAME
    assert result.eval_runtime_arn == RUNTIME_ARN
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1


# --------------------------------------------------------------------------- #
# stack_discovery=false / caching
# --------------------------------------------------------------------------- #


def test_stack_discovery_false_never_constructs_boto3(monkeypatch):
    calls = []
    monkeypatch.setattr(
        stack_discovery.boto3, "client", lambda *a, **k: calls.append((a, k)) or object()
    )

    result = discover(Settings(stack_discovery=False, stack_name=STACK_NAME))

    assert result == StackConfig()
    assert calls == []


def test_discover_caches_across_repeated_calls(monkeypatch):
    """describe_stacks is called once no matter how many times discover() runs."""
    cfn = boto3.client("cloudformation", region_name="us-east-1")
    stubber = Stubber(cfn)
    stubber.add_response(
        "describe_stacks",
        _describe_stacks_response(ApiEndpoint=API_ENDPOINT, TableName=TABLE_NAME),
        {"StackName": STACK_NAME},
    )
    stubber.activate()
    _stub_clients(monkeypatch, cfn_client=cfn)

    first = discover(_settings())
    second = discover(_settings())
    third = discover(_settings())

    assert first == second == third
    # Only one response was queued; a second describe_stacks call would raise
    # "No more responses" inside the stubber, which assert_no_pending_responses
    # would not catch on its own -- the fact these three calls succeeded at all
    # is the proof only one real call happened.
    stubber.assert_no_pending_responses()


def test_refresh_forces_a_fresh_lookup(monkeypatch):
    cfn = boto3.client("cloudformation", region_name="us-east-1")
    stubber = Stubber(cfn)
    stubber.add_response(
        "describe_stacks",
        _describe_stacks_response(ApiEndpoint=API_ENDPOINT, TableName=TABLE_NAME),
        {"StackName": STACK_NAME},
    )
    stubber.add_response(
        "describe_stacks",
        _describe_stacks_response(
            ApiEndpoint="https://changed.example.com", TableName=TABLE_NAME
        ),
        {"StackName": STACK_NAME},
    )
    stubber.activate()
    _stub_clients(monkeypatch, cfn_client=cfn)

    first = discover(_settings())
    refresh()
    second = discover(_settings())

    assert first.config_api_url == API_ENDPOINT
    assert second.config_api_url == "https://changed.example.com"
    stubber.assert_no_pending_responses()
