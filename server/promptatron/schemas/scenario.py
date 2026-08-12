"""Pydantic models mirroring the upstream config store's scenario/prompt/dataset/tool API.

The upstream API (see ``api/openapi.yaml``) speaks camelCase JSON. Every model here
uses a camelCase alias generator with ``populate_by_name=True`` so instances can be
built either from upstream JSON (camelCase) or from Python keyword arguments
(snake_case), and serialize back to camelCase via ``model_dump(by_alias=True)`` /
FastAPI's default ``response_model_by_alias=True``.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

DatasetContentType = Literal["text/csv", "application/json"]
PromptKind = Literal["SYSTEM", "USER"]


class CamelModel(BaseModel):
    """Base model that (de)serializes camelCase JSON while exposing snake_case attrs."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --------------------------------------------------------------------------- #
# Scenarios
# --------------------------------------------------------------------------- #


class ScenarioSummary(CamelModel):
    id: str
    name: str
    description: str | None = None
    created_at: str
    updated_at: str


class ScenarioCreateRequest(CamelModel):
    id: str | None = None
    name: str
    description: str | None = None


class ScenarioUpdateRequest(CamelModel):
    name: str | None = None
    description: str | None = None


class ScenarioListResponse(CamelModel):
    items: list[ScenarioSummary]
    count: int
    next_token: str | None = None


# --------------------------------------------------------------------------- #
# Prompts
# --------------------------------------------------------------------------- #


class PromptSummary(CamelModel):
    id: str
    name: str
    content: str


class Prompt(PromptSummary):
    kind: PromptKind


class PromptCreateRequest(CamelModel):
    kind: PromptKind
    name: str
    content: str


class PromptUpdateRequest(CamelModel):
    name: str | None = None
    content: str | None = None


class PromptListResponse(CamelModel):
    items: list[Prompt]
    count: int
    next_token: str | None = None


# --------------------------------------------------------------------------- #
# Tools
# --------------------------------------------------------------------------- #


class ToolDefinition(CamelModel):
    name: str
    description: str
    input_schema: dict[str, Any]
    handler_key: str


class ToolUpsertRequest(CamelModel):
    description: str
    input_schema: dict[str, Any]
    handler_key: str


class ToolListResponse(CamelModel):
    items: list[ToolDefinition]
    count: int


# --------------------------------------------------------------------------- #
# Datasets
# --------------------------------------------------------------------------- #


class DatasetMeta(CamelModel):
    id: str
    name: str
    description: str | None = None
    content_type: DatasetContentType


class Dataset(DatasetMeta):
    content: str


class DatasetCreateRequest(CamelModel):
    id: str | None = None
    name: str
    description: str | None = None
    content_type: DatasetContentType
    content: str


class DatasetUpdateRequest(CamelModel):
    name: str | None = None
    description: str | None = None
    content_type: DatasetContentType | None = None
    content: str | None = None


class DatasetListResponse(CamelModel):
    items: list[DatasetMeta]
    count: int
    next_token: str | None = None


# --------------------------------------------------------------------------- #
# Hydrated scenario (metadata + prompts + tools + dataset metadata)
# --------------------------------------------------------------------------- #


class ScenarioDetail(ScenarioSummary):
    system_prompts: list[PromptSummary] = []
    user_prompts: list[PromptSummary] = []
    tools: list[ToolDefinition] = []
    datasets: list[DatasetMeta] = []


class IdResponse(CamelModel):
    id: str
