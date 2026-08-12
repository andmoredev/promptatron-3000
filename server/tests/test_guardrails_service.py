"""Tests for promptatron.guardrails.service.GuardrailService.

Uses botocore's Stubber against a real boto3 "bedrock" client so requests
are validated against the actual service model, and error mapping is
exercised by injecting ClientErrors.
"""

from datetime import UTC, datetime

import boto3
import pytest
from botocore.stub import ANY, Stubber

from promptatron.errors import BadRequestError, NotFoundError, UpstreamError
from promptatron.guardrails.schemas import ContentFilter, ContentPolicy, GuardrailConfig
from promptatron.guardrails.service import GuardrailService

NOW = datetime(2026, 1, 1, tzinfo=UTC)


@pytest.fixture
def stubbed_service():
    client = boto3.client("bedrock", region_name="us-east-1")
    stubber = Stubber(client)
    service = GuardrailService(client=client)
    with stubber:
        yield service, stubber
        stubber.assert_no_pending_responses()


def _guardrail_config(name: str = "svc-test") -> GuardrailConfig:
    return GuardrailConfig(
        name=name, content_policy=ContentPolicy(filters=[ContentFilter(type="HATE")])
    )


def _list_entry(**overrides):
    entry = {
        "id": "gr-123",
        "arn": "arn:aws:bedrock:us-east-1:111122223333:guardrail/gr-123",
        "status": "READY",
        "name": "svc-test",
        "version": "DRAFT",
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    entry.update(overrides)
    return entry


def _get_response(**overrides):
    response = {
        "name": "svc-test",
        "guardrailId": "gr-123",
        "guardrailArn": "arn:aws:bedrock:us-east-1:111122223333:guardrail/gr-123",
        "version": "DRAFT",
        "status": "READY",
        "createdAt": NOW,
        "updatedAt": NOW,
        "blockedInputMessaging": "This content violates our content policy.",
        "blockedOutputsMessaging": "I cannot provide that type of content.",
        "contentPolicy": {
            "filters": [
                {
                    "type": "HATE",
                    "inputStrength": "HIGH",
                    "outputStrength": "LOW",
                    "inputAction": "BLOCK",
                    "outputAction": "NONE",
                    "inputEnabled": True,
                    "outputEnabled": True,
                }
            ]
        },
    }
    response.update(overrides)
    return response


def test_list_guardrails(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_response(
        "list_guardrails", {"guardrails": [_list_entry()]}, {"maxResults": ANY}
    )
    summaries = service.list_guardrails(max_results=10)
    assert len(summaries) == 1
    assert summaries[0].id == "gr-123"
    assert summaries[0].name == "svc-test"


def test_get_guardrail(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_response(
        "get_guardrail",
        _get_response(),
        {"guardrailIdentifier": "gr-123", "guardrailVersion": "DRAFT"},
    )
    detail = service.get_guardrail("gr-123")
    assert detail.id == "gr-123"
    assert detail.content_policy.filters[0].type == "HATE"
    assert detail.status == "READY"


def test_create_guardrail_then_fetches_detail(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_response(
        "create_guardrail",
        {
            "guardrailId": "gr-123",
            "guardrailArn": "arn:aws:bedrock:us-east-1:111122223333:guardrail/gr-123",
            "version": "DRAFT",
            "createdAt": NOW,
        },
        {
            "name": "svc-test",
            "blockedInputMessaging": ANY,
            "blockedOutputsMessaging": ANY,
            "contentPolicyConfig": ANY,
            "tags": ANY,
        },
    )
    stubber.add_response(
        "get_guardrail",
        _get_response(),
        {"guardrailIdentifier": "gr-123", "guardrailVersion": "DRAFT"},
    )
    detail = service.create_guardrail(_guardrail_config())
    assert detail.id == "gr-123"
    assert detail.name == "svc-test"


def test_update_guardrail_then_fetches_detail(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_response(
        "update_guardrail",
        {
            "guardrailId": "gr-123",
            "guardrailArn": "arn:aws:bedrock:us-east-1:111122223333:guardrail/gr-123",
            "version": "DRAFT",
            "updatedAt": NOW,
        },
        {
            "guardrailIdentifier": "gr-123",
            "name": "svc-test",
            "blockedInputMessaging": ANY,
            "blockedOutputsMessaging": ANY,
            "contentPolicyConfig": ANY,
        },
    )
    stubber.add_response(
        "get_guardrail",
        _get_response(),
        {"guardrailIdentifier": "gr-123", "guardrailVersion": "DRAFT"},
    )
    detail = service.update_guardrail("gr-123", _guardrail_config())
    assert detail.id == "gr-123"


def test_delete_guardrail(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_response(
        "delete_guardrail",
        {},
        {"guardrailIdentifier": "gr-123", "guardrailVersion": "DRAFT"},
    )
    service.delete_guardrail("gr-123")


def test_create_version(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_response(
        "create_guardrail_version",
        {"guardrailId": "gr-123", "version": "1"},
        {"guardrailIdentifier": "gr-123", "description": "first release"},
    )
    result = service.create_version("gr-123", description="first release")
    assert result.version == "1"
    assert result.description == "first release"


def test_list_versions(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_response(
        "list_guardrails",
        {"guardrails": [_list_entry(version="DRAFT"), _list_entry(version="1")]},
        {"guardrailIdentifier": "gr-123"},
    )
    versions = service.list_versions("gr-123")
    assert [v.version for v in versions] == ["DRAFT", "1"]


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------


def test_resource_not_found_maps_to_not_found_error(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_client_error(
        "get_guardrail",
        service_error_code="ResourceNotFoundException",
        service_message="Guardrail gr-missing not found",
    )
    with pytest.raises(NotFoundError):
        service.get_guardrail("gr-missing")


def test_validation_exception_maps_to_bad_request_error(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_client_error(
        "create_guardrail",
        service_error_code="ValidationException",
        service_message="Invalid configuration",
    )
    with pytest.raises(BadRequestError):
        service.create_guardrail(_guardrail_config())


def test_other_client_error_maps_to_upstream_error(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_client_error(
        "delete_guardrail",
        service_error_code="InternalServerException",
        service_message="AWS is having a bad day",
    )
    with pytest.raises(UpstreamError):
        service.delete_guardrail("gr-123")


def test_throttling_exception_maps_to_upstream_error(stubbed_service):
    service, stubber = stubbed_service
    stubber.add_client_error(
        "list_guardrails",
        service_error_code="ThrottlingException",
        service_message="Rate exceeded",
    )
    with pytest.raises(UpstreamError):
        service.list_guardrails()
