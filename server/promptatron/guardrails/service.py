"""Server-side Bedrock guardrail service.

Consolidates the CRUD/version flows previously spread across the frontend's
``guardrailService.js`` (create/list/get/delete) and
``guardrailConfigurationManager.js`` (update) into a single boto3-backed
service. DRAFT is always the working copy: reads/updates/deletes default to
``guardrailVersion="DRAFT"``, and "publishing" a guardrail is modeled as
``create_version``, which snapshots DRAFT into a new immutable numbered
version (``CreateGuardrailVersion``), matching AWS's own DRAFT semantics.
"""

from __future__ import annotations

import logging
from typing import Any

import boto3
from botocore.exceptions import ClientError

from promptatron.errors import AppError, BadRequestError, NotFoundError, UpstreamError
from promptatron.guardrails.schemas import (
    GuardrailConfig,
    GuardrailDetail,
    GuardrailSummary,
    GuardrailVersionSummary,
)
from promptatron.guardrails.translator import from_bedrock, to_bedrock

logger = logging.getLogger(__name__)

DRAFT_VERSION = "DRAFT"

# Ported from guardrailService.js's generateGuardrailTags (scenario/created-by
# tags are dropped since this service is no longer scenario-scoped).
_DEFAULT_TAGS = [{"key": "source", "value": "promptatron"}]


def _map_client_error(e: ClientError, *, guardrail_id: str | None = None) -> AppError:
    """Map a botocore ClientError to the application's error hierarchy."""
    error = e.response.get("Error", {})
    code = error.get("Code", "")
    message = error.get("Message") or str(e)
    detail: dict[str, Any] = {"error_code": code}
    if guardrail_id is not None:
        detail["guardrail_id"] = guardrail_id

    if code == "ResourceNotFoundException":
        return NotFoundError(message, detail=detail)
    if code == "ValidationException":
        return BadRequestError(message, detail=detail)
    return UpstreamError(message, detail=detail)


def _summary_from_list_entry(entry: dict[str, Any]) -> GuardrailSummary:
    return GuardrailSummary(
        id=entry["id"],
        arn=entry["arn"],
        name=entry["name"],
        description=entry.get("description"),
        version=entry["version"],
        status=entry["status"],
        created_at=entry["createdAt"],
        updated_at=entry.get("updatedAt"),
    )


def _detail_from_get_response(response: dict[str, Any]) -> GuardrailDetail:
    simplified = from_bedrock(response)
    return GuardrailDetail(
        id=response["guardrailId"],
        arn=response["guardrailArn"],
        name=response["name"],
        description=response.get("description"),
        version=response["version"],
        status=response["status"],
        created_at=response["createdAt"],
        updated_at=response.get("updatedAt"),
        content_policy=simplified.content_policy,
        denied_topics=simplified.denied_topics,
        word_policy=simplified.word_policy,
        pii_policy=simplified.pii_policy,
        contextual_grounding=simplified.contextual_grounding,
        blocked_input_message=simplified.blocked_input_message,
        blocked_output_message=simplified.blocked_output_message,
    )


class GuardrailService:
    """CRUD + versioning operations against AWS Bedrock Guardrails."""

    def __init__(self, region_name: str | None = None, client: Any | None = None) -> None:
        self._client = client or boto3.client("bedrock", region_name=region_name)

    def list_guardrails(self, max_results: int = 50) -> list[GuardrailSummary]:
        """List guardrails (each entry is the guardrail's latest/DRAFT summary)."""
        try:
            paginator = self._client.get_paginator("list_guardrails")
            summaries: list[GuardrailSummary] = []
            pagination_config = {"MaxItems": max_results, "PageSize": max_results}
            for page in paginator.paginate(PaginationConfig=pagination_config):
                summaries.extend(_summary_from_list_entry(g) for g in page.get("guardrails", []))
            return summaries
        except ClientError as e:
            raise _map_client_error(e) from e

    def get_guardrail(self, guardrail_id: str, version: str = DRAFT_VERSION) -> GuardrailDetail:
        """Fetch a guardrail's full detail, translated back to simplified form."""
        try:
            response = self._client.get_guardrail(
                guardrailIdentifier=guardrail_id, guardrailVersion=version
            )
        except ClientError as e:
            raise _map_client_error(e, guardrail_id=guardrail_id) from e
        return _detail_from_get_response(response)

    def create_guardrail(self, config: GuardrailConfig) -> GuardrailDetail:
        """Create a new guardrail (DRAFT) from a simplified configuration."""
        kwargs = to_bedrock(config, tags=_DEFAULT_TAGS)
        try:
            response = self._client.create_guardrail(**kwargs)
        except ClientError as e:
            raise _map_client_error(e) from e
        return self.get_guardrail(response["guardrailId"], version=DRAFT_VERSION)

    def update_guardrail(self, guardrail_id: str, config: GuardrailConfig) -> GuardrailDetail:
        """Update a guardrail's DRAFT working copy from a simplified configuration."""
        kwargs = to_bedrock(config)
        kwargs["guardrailIdentifier"] = guardrail_id
        try:
            self._client.update_guardrail(**kwargs)
        except ClientError as e:
            raise _map_client_error(e, guardrail_id=guardrail_id) from e
        return self.get_guardrail(guardrail_id, version=DRAFT_VERSION)

    def delete_guardrail(self, guardrail_id: str, version: str = DRAFT_VERSION) -> None:
        """Delete a guardrail (or a specific numbered version of it)."""
        try:
            self._client.delete_guardrail(
                guardrailIdentifier=guardrail_id, guardrailVersion=version
            )
        except ClientError as e:
            raise _map_client_error(e, guardrail_id=guardrail_id) from e

    def create_version(
        self, guardrail_id: str, description: str | None = None
    ) -> GuardrailVersionSummary:
        """Publish the current DRAFT as a new immutable numbered version."""
        kwargs: dict[str, Any] = {"guardrailIdentifier": guardrail_id}
        if description:
            kwargs["description"] = description
        try:
            response = self._client.create_guardrail_version(**kwargs)
        except ClientError as e:
            raise _map_client_error(e, guardrail_id=guardrail_id) from e
        return GuardrailVersionSummary(
            id=response["guardrailId"], version=response["version"], description=description
        )

    def list_versions(self, guardrail_id: str) -> list[GuardrailSummary]:
        """List all versions (including DRAFT) of a specific guardrail.

        Bedrock has no dedicated ListGuardrailVersions operation; passing
        guardrailIdentifier to ListGuardrails scopes it to that guardrail's
        versions instead of the account's guardrails.
        """
        try:
            paginator = self._client.get_paginator("list_guardrails")
            summaries: list[GuardrailSummary] = []
            for page in paginator.paginate(guardrailIdentifier=guardrail_id):
                summaries.extend(_summary_from_list_entry(g) for g in page.get("guardrails", []))
            return summaries
        except ClientError as e:
            raise _map_client_error(e, guardrail_id=guardrail_id) from e
