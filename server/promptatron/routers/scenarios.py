"""Proxy routes for the config store's scenario/prompt/dataset/tool API.

Every route here is a thin 1:1 proxy over :class:`ConfigStoreClient`. Mount this
router under the ``/api/v1`` prefix (see ``promptatron.main``), e.g.::

    from promptatron.routers.scenarios import router as scenarios_router
    app.include_router(scenarios_router, prefix="/api/v1")
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, Query, status

from promptatron.config import Settings, get_settings
from promptatron.configstore.client import ConfigStoreClient
from promptatron.schemas.scenario import (
    Dataset,
    DatasetCreateRequest,
    DatasetListResponse,
    DatasetUpdateRequest,
    IdResponse,
    PromptCreateRequest,
    PromptListResponse,
    PromptUpdateRequest,
    ScenarioCreateRequest,
    ScenarioDetail,
    ScenarioListResponse,
    ScenarioUpdateRequest,
    ToolDefinition,
    ToolUpsertRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


# --------------------------------------------------------------------------- #
# Dependencies
# --------------------------------------------------------------------------- #


@lru_cache(maxsize=8)
def _build_client(base_url: str | None, api_key: str | None) -> ConfigStoreClient:
    """One ``ConfigStoreClient`` per distinct (base_url, api_key) pair.

    Caching the client instance (not just memoizing this function) is what lets the
    client's own 30s GET cache actually pay off across requests, instead of being
    rebuilt empty on every call.
    """
    return ConfigStoreClient(base_url=base_url, api_key=api_key)


def get_config_store_client(settings: Settings = Depends(get_settings)) -> ConfigStoreClient:
    return _build_client(settings.config_api_url, settings.config_api_key)


def _has_handler(scenario_id: str, tool_name: str) -> bool:
    """Consult the local Python tool registry for a registered handler.

    Imported lazily and defensively: any failure to import or call the registry
    degrades to False rather than breaking this endpoint.
    """
    try:
        from promptatron.tools.registry import has_handler
    except ImportError:
        return False
    try:
        return bool(has_handler(scenario_id, tool_name))
    except Exception:
        logger.exception("Tool registry lookup failed for %r", tool_name)
        return False


# --------------------------------------------------------------------------- #
# Scenarios
# --------------------------------------------------------------------------- #


@router.get("")
async def list_scenarios(
    limit: int | None = Query(None, ge=1, le=20),
    next_token: str | None = Query(None, alias="nextToken"),
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> ScenarioListResponse:
    return await client.list_scenarios(limit=limit, next_token=next_token)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_scenario(
    payload: ScenarioCreateRequest,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> ScenarioDetail:
    return await client.create_scenario(payload)


@router.get("/{scenario_id}")
async def get_scenario(
    scenario_id: str,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> ScenarioDetail:
    return await client.get_scenario(scenario_id)


@router.put("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_scenario(
    scenario_id: str,
    payload: ScenarioUpdateRequest,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> None:
    await client.update_scenario(scenario_id, payload)


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: str,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> None:
    await client.delete_scenario(scenario_id)


# --------------------------------------------------------------------------- #
# Prompts
# --------------------------------------------------------------------------- #


@router.get("/{scenario_id}/prompts")
async def list_prompts(
    scenario_id: str,
    limit: int | None = Query(None, ge=1, le=20),
    next_token: str | None = Query(None, alias="nextToken"),
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> PromptListResponse:
    return await client.list_prompts(scenario_id, limit=limit, next_token=next_token)


@router.post("/{scenario_id}/prompts", status_code=status.HTTP_201_CREATED)
async def create_prompt(
    scenario_id: str,
    payload: PromptCreateRequest,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> IdResponse:
    return await client.create_prompt(scenario_id, payload)


@router.put("/{scenario_id}/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_prompt(
    scenario_id: str,
    prompt_id: str,
    payload: PromptUpdateRequest,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> None:
    await client.update_prompt(scenario_id, prompt_id, payload)


@router.delete("/{scenario_id}/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(
    scenario_id: str,
    prompt_id: str,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> None:
    await client.delete_prompt(scenario_id, prompt_id)


# --------------------------------------------------------------------------- #
# Datasets
# --------------------------------------------------------------------------- #


@router.get("/{scenario_id}/datasets")
async def list_datasets(
    scenario_id: str,
    limit: int | None = Query(None, ge=1, le=20),
    next_token: str | None = Query(None, alias="nextToken"),
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> DatasetListResponse:
    return await client.list_datasets(scenario_id, limit=limit, next_token=next_token)


@router.post("/{scenario_id}/datasets", status_code=status.HTTP_201_CREATED)
async def create_dataset(
    scenario_id: str,
    payload: DatasetCreateRequest,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> IdResponse:
    return await client.create_dataset(scenario_id, payload)


@router.get("/{scenario_id}/datasets/{dataset_id}")
async def get_dataset(
    scenario_id: str,
    dataset_id: str,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> Dataset:
    return await client.get_dataset(scenario_id, dataset_id)


@router.put("/{scenario_id}/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_dataset(
    scenario_id: str,
    dataset_id: str,
    payload: DatasetUpdateRequest,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> None:
    await client.update_dataset(scenario_id, dataset_id, payload)


@router.delete("/{scenario_id}/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    scenario_id: str,
    dataset_id: str,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> None:
    await client.delete_dataset(scenario_id, dataset_id)


# --------------------------------------------------------------------------- #
# Tools
# --------------------------------------------------------------------------- #


@router.get("/{scenario_id}/tools")
async def list_tools(
    scenario_id: str,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> dict[str, Any]:
    result = await client.list_tools(scenario_id)
    items = []
    for tool in result.items:
        item = tool.model_dump(by_alias=True)
        item["handler_registered"] = _has_handler(scenario_id, tool.name)
        items.append(item)
    return {"items": items, "count": result.count}


@router.get("/{scenario_id}/tools/{tool_name}")
async def get_tool(
    scenario_id: str,
    tool_name: str,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> ToolDefinition:
    return await client.get_tool(scenario_id, tool_name)


@router.put("/{scenario_id}/tools/{tool_name}")
async def upsert_tool(
    scenario_id: str,
    tool_name: str,
    payload: ToolUpsertRequest,
    client: ConfigStoreClient = Depends(get_config_store_client),
) -> ToolDefinition:
    return await client.upsert_tool(scenario_id, tool_name, payload)
