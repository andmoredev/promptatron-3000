"""Async HTTP client for the SAM/DynamoDB-backed scenario config store API.

Wraps every operation exposed by ``api/openapi.yaml`` (scenario/prompt/dataset/tool
CRUD), mapping upstream HTTP responses onto the application's error hierarchy
(:mod:`promptatron.errors`) and layering a short-TTL in-process cache over the two
hottest reads: hydrated scenario detail and the scenario list.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from promptatron.errors import BadRequestError, NotFoundError, UpstreamError
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
    ToolListResponse,
    ToolUpsertRequest,
)

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 30.0
_MAX_RETRIES = 2  # additional attempts beyond the first, GETs only
_RETRY_BACKOFF_BASE = 0.1  # seconds


class ConfigStoreClient:
    """Async client for the config store API.

    Not configured
        If ``base_url`` is ``None`` every method raises
        ``UpstreamError("config store not configured")`` before attempting a request.

    Retries
        Idempotent GETs are retried up to twice (with exponential backoff) on network
        errors or 5xx responses. Writes (POST/PUT/DELETE) are never retried.

    Caching
        ``get_scenario`` (hydrated detail) and ``list_scenarios`` responses are cached
        in-process for 30 seconds. Any write scoped to a scenario (update/delete the
        scenario itself, or create/update/delete a prompt/dataset/tool under it)
        invalidates that scenario's detail cache entry and the entire list cache,
        since list entries carry name/description that a scenario update may change
        and scenario create/delete change list membership.
    """

    def __init__(self, base_url: str | None, api_key: str | None, timeout: float = 10.0) -> None:
        self._base_url = base_url.rstrip("/") if base_url else None
        self._api_key = api_key
        self._timeout = timeout
        self._detail_cache: dict[str, tuple[float, ScenarioDetail]] = {}
        self._list_cache: dict[tuple[Any, ...], tuple[float, ScenarioListResponse]] = {}

    # ------------------------------------------------------------------ #
    # Cache helpers
    # ------------------------------------------------------------------ #

    def _cache_get(self, store: dict[Any, tuple[float, Any]], key: Any) -> Any | None:
        entry = store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() >= expires_at:
            store.pop(key, None)
            return None
        return value

    def _cache_set(self, store: dict[Any, tuple[float, Any]], key: Any, value: Any) -> None:
        store[key] = (time.monotonic() + _CACHE_TTL_SECONDS, value)

    def _invalidate_scenario(self, scenario_id: str) -> None:
        """Invalidate cached state for one scenario, plus the whole list cache."""
        self._detail_cache.pop(scenario_id, None)
        self._list_cache.clear()

    # ------------------------------------------------------------------ #
    # Low-level request plumbing
    # ------------------------------------------------------------------ #

    @staticmethod
    def _error_message(response: httpx.Response, default: str) -> str:
        try:
            body = response.json()
        except ValueError:
            return default
        if isinstance(body, dict) and isinstance(body.get("message"), str):
            return body["message"]
        return default

    def _raise_for_status(self, response: httpx.Response) -> None:
        if response.status_code == 404:
            raise NotFoundError(self._error_message(response, "Resource not found"))
        if response.status_code == 400:
            raise BadRequestError(self._error_message(response, "Invalid request"))
        if response.status_code >= 400:
            # Any other 4xx/5xx that slipped past retries is treated as an
            # unreachable/misbehaving upstream.
            raise UpstreamError("config store unreachable")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        retryable: bool = False,
    ) -> httpx.Response:
        if self._base_url is None:
            raise UpstreamError("config store not configured")

        url = f"{self._base_url}{path}"
        headers = {"x-api-key": self._api_key} if self._api_key else {}
        attempts = _MAX_RETRIES + 1 if retryable else 1

        last_exc: Exception | None = None
        for attempt in range(attempts):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as http_client:
                    response = await http_client.request(
                        method, url, params=params, json=json_body, headers=headers
                    )
            except httpx.HTTPError as exc:
                last_exc = exc
                logger.warning("Config store request failed (attempt %d): %s", attempt + 1, exc)
                if attempt < attempts - 1:
                    await asyncio.sleep(_RETRY_BACKOFF_BASE * (2**attempt))
                    continue
                raise UpstreamError("config store unreachable") from exc

            if response.status_code >= 500:
                logger.warning(
                    "Config store returned %d (attempt %d)", response.status_code, attempt + 1
                )
                if attempt < attempts - 1:
                    await asyncio.sleep(_RETRY_BACKOFF_BASE * (2**attempt))
                    continue
                raise UpstreamError("config store unreachable")

            return response

        # Unreachable in practice: the loop above always returns or raises.
        raise UpstreamError("config store unreachable") from last_exc

    @staticmethod
    def _pagination_params(
        limit: int | None, next_token: str | None
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        if next_token is not None:
            params["nextToken"] = next_token
        return params

    # ------------------------------------------------------------------ #
    # Scenarios
    # ------------------------------------------------------------------ #

    async def list_scenarios(
        self, *, limit: int | None = None, next_token: str | None = None
    ) -> ScenarioListResponse:
        cache_key = (limit, next_token)
        cached = self._cache_get(self._list_cache, cache_key)
        if cached is not None:
            return cached

        response = await self._request(
            "GET",
            "/scenarios",
            params=self._pagination_params(limit, next_token),
            retryable=True,
        )
        self._raise_for_status(response)
        result = ScenarioListResponse.model_validate(response.json())
        self._cache_set(self._list_cache, cache_key, result)
        return result

    async def create_scenario(self, payload: ScenarioCreateRequest) -> ScenarioDetail:
        response = await self._request(
            "POST", "/scenarios", json_body=payload.model_dump(by_alias=True, exclude_none=True)
        )
        self._raise_for_status(response)
        self._list_cache.clear()
        return ScenarioDetail.model_validate(response.json())

    async def get_scenario(self, scenario_id: str) -> ScenarioDetail:
        cached = self._cache_get(self._detail_cache, scenario_id)
        if cached is not None:
            return cached

        response = await self._request(
            "GET", f"/scenarios/{scenario_id}", retryable=True
        )
        self._raise_for_status(response)
        result = ScenarioDetail.model_validate(response.json())
        self._cache_set(self._detail_cache, scenario_id, result)
        return result

    async def update_scenario(self, scenario_id: str, payload: ScenarioUpdateRequest) -> None:
        response = await self._request(
            "PUT",
            f"/scenarios/{scenario_id}",
            json_body=payload.model_dump(by_alias=True, exclude_none=True),
        )
        self._raise_for_status(response)
        self._invalidate_scenario(scenario_id)

    async def delete_scenario(self, scenario_id: str) -> None:
        response = await self._request("DELETE", f"/scenarios/{scenario_id}")
        self._raise_for_status(response)
        self._invalidate_scenario(scenario_id)

    # ------------------------------------------------------------------ #
    # Prompts
    # ------------------------------------------------------------------ #

    async def list_prompts(
        self, scenario_id: str, *, limit: int | None = None, next_token: str | None = None
    ) -> PromptListResponse:
        response = await self._request(
            "GET",
            f"/scenarios/{scenario_id}/prompts",
            params=self._pagination_params(limit, next_token),
            retryable=True,
        )
        self._raise_for_status(response)
        return PromptListResponse.model_validate(response.json())

    async def create_prompt(
        self, scenario_id: str, payload: PromptCreateRequest
    ) -> IdResponse:
        response = await self._request(
            "POST",
            f"/scenarios/{scenario_id}/prompts",
            json_body=payload.model_dump(by_alias=True, exclude_none=True),
        )
        self._raise_for_status(response)
        self._invalidate_scenario(scenario_id)
        return IdResponse.model_validate(response.json())

    async def update_prompt(
        self, scenario_id: str, prompt_id: str, payload: PromptUpdateRequest
    ) -> None:
        response = await self._request(
            "PUT",
            f"/scenarios/{scenario_id}/prompts/{prompt_id}",
            json_body=payload.model_dump(by_alias=True, exclude_none=True),
        )
        self._raise_for_status(response)
        self._invalidate_scenario(scenario_id)

    async def delete_prompt(self, scenario_id: str, prompt_id: str) -> None:
        response = await self._request(
            "DELETE", f"/scenarios/{scenario_id}/prompts/{prompt_id}"
        )
        self._raise_for_status(response)
        self._invalidate_scenario(scenario_id)

    # ------------------------------------------------------------------ #
    # Datasets
    # ------------------------------------------------------------------ #

    async def list_datasets(
        self, scenario_id: str, *, limit: int | None = None, next_token: str | None = None
    ) -> DatasetListResponse:
        response = await self._request(
            "GET",
            f"/scenarios/{scenario_id}/datasets",
            params=self._pagination_params(limit, next_token),
            retryable=True,
        )
        self._raise_for_status(response)
        return DatasetListResponse.model_validate(response.json())

    async def create_dataset(
        self, scenario_id: str, payload: DatasetCreateRequest
    ) -> IdResponse:
        response = await self._request(
            "POST",
            f"/scenarios/{scenario_id}/datasets",
            json_body=payload.model_dump(by_alias=True, exclude_none=True),
        )
        self._raise_for_status(response)
        self._invalidate_scenario(scenario_id)
        return IdResponse.model_validate(response.json())

    async def get_dataset(self, scenario_id: str, dataset_id: str) -> Dataset:
        response = await self._request(
            "GET", f"/scenarios/{scenario_id}/datasets/{dataset_id}", retryable=True
        )
        self._raise_for_status(response)
        return Dataset.model_validate(response.json())

    async def update_dataset(
        self, scenario_id: str, dataset_id: str, payload: DatasetUpdateRequest
    ) -> None:
        response = await self._request(
            "PUT",
            f"/scenarios/{scenario_id}/datasets/{dataset_id}",
            json_body=payload.model_dump(by_alias=True, exclude_none=True),
        )
        self._raise_for_status(response)
        self._invalidate_scenario(scenario_id)

    async def delete_dataset(self, scenario_id: str, dataset_id: str) -> None:
        response = await self._request(
            "DELETE", f"/scenarios/{scenario_id}/datasets/{dataset_id}"
        )
        self._raise_for_status(response)
        self._invalidate_scenario(scenario_id)

    # ------------------------------------------------------------------ #
    # Tools
    # ------------------------------------------------------------------ #

    async def list_tools(self, scenario_id: str) -> ToolListResponse:
        response = await self._request(
            "GET", f"/scenarios/{scenario_id}/tools", retryable=True
        )
        self._raise_for_status(response)
        return ToolListResponse.model_validate(response.json())

    async def get_tool(self, scenario_id: str, tool_name: str) -> ToolDefinition:
        response = await self._request(
            "GET", f"/scenarios/{scenario_id}/tools/{tool_name}", retryable=True
        )
        self._raise_for_status(response)
        return ToolDefinition.model_validate(response.json())

    async def upsert_tool(
        self, scenario_id: str, tool_name: str, payload: ToolUpsertRequest
    ) -> ToolDefinition:
        response = await self._request(
            "PUT",
            f"/scenarios/{scenario_id}/tools/{tool_name}",
            json_body=payload.model_dump(by_alias=True, exclude_none=True),
        )
        self._raise_for_status(response)
        self._invalidate_scenario(scenario_id)
        return ToolDefinition.model_validate(response.json())
