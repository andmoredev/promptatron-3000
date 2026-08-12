"""Guardrail CRUD + versioning endpoints, backed by AWS Bedrock Guardrails."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, status

from promptatron.config import Settings, get_settings
from promptatron.errors import BadRequestError
from promptatron.guardrails.schemas import (
    GuardrailConfig,
    GuardrailVersionCreate,
    validate_business_rules,
)
from promptatron.guardrails.service import DRAFT_VERSION, GuardrailService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["guardrails"])


def get_guardrail_service(settings: Settings = Depends(get_settings)) -> GuardrailService:
    """Dependency: a GuardrailService bound to the configured AWS region."""
    return GuardrailService(region_name=settings.aws_region)


def _validate_or_raise(body: GuardrailConfig) -> None:
    errors = validate_business_rules(body)
    if errors:
        raise BadRequestError("Invalid guardrail configuration", detail={"errors": errors})


@router.get("/guardrails")
async def list_guardrails(
    max_results: int = 50,
    service: GuardrailService = Depends(get_guardrail_service),
) -> dict[str, Any]:
    """List guardrails in the configured account/region."""
    summaries = service.list_guardrails(max_results=max_results)
    return {"guardrails": [s.model_dump(mode="json", by_alias=True) for s in summaries]}


@router.post("/guardrails", status_code=status.HTTP_201_CREATED)
async def create_guardrail(
    body: GuardrailConfig,
    service: GuardrailService = Depends(get_guardrail_service),
) -> dict[str, Any]:
    """Create a new guardrail (DRAFT working copy) from a simplified configuration."""
    _validate_or_raise(body)
    detail = service.create_guardrail(body)
    return detail.model_dump(mode="json", by_alias=True)


@router.get("/guardrails/{guardrail_id}")
async def get_guardrail(
    guardrail_id: str,
    version: str = DRAFT_VERSION,
    service: GuardrailService = Depends(get_guardrail_service),
) -> dict[str, Any]:
    """Fetch a guardrail's full detail (defaults to the DRAFT working copy)."""
    detail = service.get_guardrail(guardrail_id, version=version)
    return detail.model_dump(mode="json", by_alias=True)


@router.put("/guardrails/{guardrail_id}")
async def update_guardrail(
    guardrail_id: str,
    body: GuardrailConfig,
    service: GuardrailService = Depends(get_guardrail_service),
) -> dict[str, Any]:
    """Update a guardrail's DRAFT working copy from a simplified configuration."""
    _validate_or_raise(body)
    detail = service.update_guardrail(guardrail_id, body)
    return detail.model_dump(mode="json", by_alias=True)


@router.delete("/guardrails/{guardrail_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_guardrail(
    guardrail_id: str,
    version: str = DRAFT_VERSION,
    service: GuardrailService = Depends(get_guardrail_service),
) -> None:
    """Delete a guardrail (or a specific numbered version of it)."""
    service.delete_guardrail(guardrail_id, version=version)


@router.get("/guardrails/{guardrail_id}/versions")
async def list_versions(
    guardrail_id: str,
    service: GuardrailService = Depends(get_guardrail_service),
) -> dict[str, Any]:
    """List all versions (including DRAFT) of a guardrail."""
    versions = service.list_versions(guardrail_id)
    return {"versions": [v.model_dump(mode="json", by_alias=True) for v in versions]}


@router.post("/guardrails/{guardrail_id}/versions", status_code=status.HTTP_201_CREATED)
async def create_version(
    guardrail_id: str,
    body: GuardrailVersionCreate = GuardrailVersionCreate(),
    service: GuardrailService = Depends(get_guardrail_service),
) -> dict[str, Any]:
    """Publish the current DRAFT as a new immutable numbered version."""
    version = service.create_version(guardrail_id, description=body.description)
    return version.model_dump(mode="json", by_alias=True)
