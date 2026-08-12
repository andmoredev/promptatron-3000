"""Tests for ConfigStoreClient against fixture-shaped upstream responses."""

import json

import httpx
import pytest
import respx

from promptatron.configstore.client import ConfigStoreClient
from promptatron.errors import BadRequestError, NotFoundError, UpstreamError
from promptatron.schemas.scenario import (
    DatasetCreateRequest,
    DatasetUpdateRequest,
    PromptUpdateRequest,
    ScenarioUpdateRequest,
    ToolUpsertRequest,
)
from tests._repo_paths import find_upward

BASE_URL = "https://configstore.test"
FIXTURES_DIR = find_upward("api", "tests", "fixtures")


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text())


@pytest.fixture
def client() -> ConfigStoreClient:
    return ConfigStoreClient(base_url=BASE_URL, api_key="test-api-key")


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    """Skip real backoff delays so retry tests stay fast."""

    async def _instant_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("promptatron.configstore.client.asyncio.sleep", _instant_sleep)


# --------------------------------------------------------------------------- #
# Not configured
# --------------------------------------------------------------------------- #


async def test_not_configured_raises_upstream_error():
    unconfigured = ConfigStoreClient(base_url=None, api_key=None)
    with pytest.raises(UpstreamError) as exc_info:
        await unconfigured.list_scenarios()
    assert exc_info.value.message == "config store not configured"


# --------------------------------------------------------------------------- #
# Happy paths (fixture bodies verbatim)
# --------------------------------------------------------------------------- #


@respx.mock
async def test_list_scenarios_happy_path(client: ConfigStoreClient):
    fixture = _fixture("scenario-list.json")
    route = respx.get(f"{BASE_URL}/scenarios").mock(
        return_value=httpx.Response(200, json=fixture)
    )

    result = await client.list_scenarios()

    assert route.calls.last.request.headers["x-api-key"] == "test-api-key"
    assert result.count == 2
    assert result.items[0].id == "fraud-detection-comprehensive"
    assert result.items[1].id == "shipping-logistics"
    assert result.next_token == fixture["nextToken"]


@respx.mock
async def test_get_scenario_happy_path(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )

    result = await client.get_scenario("fraud-detection-comprehensive")

    assert result.id == "fraud-detection-comprehensive"
    assert result.system_prompts[0].id == "fraud-analyst"
    assert result.user_prompts[0].id == "analyze-transactions"
    assert result.tools[0].name == "freeze_account"
    assert result.tools[0].handler_key == "tools/freezeAccount.freezeAccount"
    assert result.datasets[0].id == "retail-transactions"


@respx.mock
async def test_list_prompts_happy_path(client: ConfigStoreClient):
    fixture = _fixture("prompt-list.json")
    respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive/prompts").mock(
        return_value=httpx.Response(200, json=fixture)
    )

    result = await client.list_prompts("fraud-detection-comprehensive")

    assert result.count == 3
    kinds = {p.id: p.kind for p in result.items}
    assert kinds["fraud-analyst"] == "SYSTEM"
    assert kinds["analyze-transactions"] == "USER"


@respx.mock
async def test_get_dataset_happy_path(client: ConfigStoreClient):
    fixture = _fixture("dataset.json")
    respx.get(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/datasets/retail-transactions"
    ).mock(return_value=httpx.Response(200, json=fixture))

    result = await client.get_dataset("fraud-detection-comprehensive", "retail-transactions")

    assert result.id == "retail-transactions"
    assert result.content_type == "text/csv"
    assert "T0001" in result.content


@respx.mock
async def test_get_tool_happy_path(client: ConfigStoreClient):
    fixture = _fixture("tool.json")
    respx.get(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/tools/flag_suspicious_transaction"
    ).mock(return_value=httpx.Response(200, json=fixture))

    result = await client.get_tool(
        "fraud-detection-comprehensive", "flag_suspicious_transaction"
    )

    assert result.name == "flag_suspicious_transaction"
    assert result.handler_key == "tools/flagTransaction.flagSuspiciousTransaction"
    assert result.input_schema["required"] == [
        "transaction_id",
        "account_id",
        "fraud_indicators",
        "risk_score",
        "confidence_level",
        "recommended_action",
    ]


# --------------------------------------------------------------------------- #
# Error mapping
# --------------------------------------------------------------------------- #


@respx.mock
async def test_404_maps_to_not_found_error(client: ConfigStoreClient):
    respx.get(f"{BASE_URL}/scenarios/missing").mock(
        return_value=httpx.Response(404, json={"message": "Scenario not found"})
    )

    with pytest.raises(NotFoundError) as exc_info:
        await client.get_scenario("missing")
    assert exc_info.value.message == "Scenario not found"


@respx.mock
async def test_400_maps_to_bad_request_error(client: ConfigStoreClient):
    respx.post(f"{BASE_URL}/scenarios").mock(
        return_value=httpx.Response(400, json={"message": "name is required"})
    )

    from promptatron.schemas.scenario import ScenarioCreateRequest

    with pytest.raises(BadRequestError) as exc_info:
        await client.create_scenario(ScenarioCreateRequest(name="x"))
    assert exc_info.value.message == "name is required"


@respx.mock
async def test_network_error_on_get_retries_then_maps_to_upstream_error(
    client: ConfigStoreClient,
):
    route = respx.get(f"{BASE_URL}/scenarios/x").mock(
        side_effect=httpx.ConnectError("boom")
    )

    with pytest.raises(UpstreamError) as exc_info:
        await client.get_scenario("x")

    assert exc_info.value.message == "config store unreachable"
    # initial attempt + 2 retries = 3 calls for an idempotent GET
    assert route.call_count == 3


@respx.mock
async def test_5xx_on_get_retries_then_maps_to_upstream_error(client: ConfigStoreClient):
    route = respx.get(f"{BASE_URL}/scenarios/x").mock(
        return_value=httpx.Response(503, json={"message": "unavailable"})
    )

    with pytest.raises(UpstreamError):
        await client.get_scenario("x")
    assert route.call_count == 3


@respx.mock
async def test_write_is_not_retried_on_network_error(client: ConfigStoreClient):
    route = respx.put(f"{BASE_URL}/scenarios/x").mock(side_effect=httpx.ConnectError("boom"))

    with pytest.raises(UpstreamError):
        await client.update_scenario("x", ScenarioUpdateRequest(name="new name"))

    assert route.call_count == 1


# --------------------------------------------------------------------------- #
# Caching
# --------------------------------------------------------------------------- #


@respx.mock
async def test_get_scenario_is_cached_across_calls(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )

    first = await client.get_scenario("fraud-detection-comprehensive")
    second = await client.get_scenario("fraud-detection-comprehensive")

    assert first == second
    assert route.call_count == 1


@respx.mock
async def test_get_scenario_cache_expires_after_the_ttl(client: ConfigStoreClient, monkeypatch):
    fixture = _fixture("scenario-hydrated.json")
    route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )

    clock = {"now": 1000.0}
    monkeypatch.setattr(
        "promptatron.configstore.client.time.monotonic", lambda: clock["now"]
    )

    await client.get_scenario("fraud-detection-comprehensive")
    clock["now"] += 31.0  # past the 30s TTL
    await client.get_scenario("fraud-detection-comprehensive")

    assert route.call_count == 2


@respx.mock
async def test_list_scenarios_is_cached_across_calls(client: ConfigStoreClient):
    fixture = _fixture("scenario-list.json")
    route = respx.get(f"{BASE_URL}/scenarios").mock(return_value=httpx.Response(200, json=fixture))

    await client.list_scenarios()
    await client.list_scenarios()

    assert route.call_count == 1


@respx.mock
async def test_cache_invalidated_after_update_scenario(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    get_route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )
    respx.put(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(204)
    )

    await client.get_scenario("fraud-detection-comprehensive")
    assert get_route.call_count == 1

    await client.update_scenario(
        "fraud-detection-comprehensive", ScenarioUpdateRequest(name="Renamed")
    )
    await client.get_scenario("fraud-detection-comprehensive")

    assert get_route.call_count == 2


@respx.mock
async def test_cache_invalidated_after_write_under_scenario(client: ConfigStoreClient):
    """A dataset write under a scenario invalidates that scenario's detail cache."""
    fixture = _fixture("scenario-hydrated.json")
    get_route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )
    respx.put(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/datasets/retail-transactions"
    ).mock(return_value=httpx.Response(204))

    await client.get_scenario("fraud-detection-comprehensive")
    await client.update_dataset(
        "fraud-detection-comprehensive",
        "retail-transactions",
        DatasetUpdateRequest(name="Renamed dataset"),
    )
    await client.get_scenario("fraud-detection-comprehensive")

    assert get_route.call_count == 2


@respx.mock
async def test_list_cache_invalidated_after_create_scenario(client: ConfigStoreClient):
    list_fixture = _fixture("scenario-list.json")
    list_route = respx.get(f"{BASE_URL}/scenarios").mock(
        return_value=httpx.Response(200, json=list_fixture)
    )
    hydrated = _fixture("scenario-hydrated.json")
    respx.post(f"{BASE_URL}/scenarios").mock(return_value=httpx.Response(201, json=hydrated))

    from promptatron.schemas.scenario import ScenarioCreateRequest

    await client.list_scenarios()
    await client.create_scenario(ScenarioCreateRequest(name="New Scenario"))
    await client.list_scenarios()

    assert list_route.call_count == 2


# --------------------------------------------------------------------------- #
# Pagination params
# --------------------------------------------------------------------------- #


@respx.mock
async def test_list_scenarios_sends_both_limit_and_next_token(client: ConfigStoreClient):
    fixture = _fixture("scenario-list.json")
    route = respx.get(f"{BASE_URL}/scenarios").mock(return_value=httpx.Response(200, json=fixture))

    await client.list_scenarios(limit=5, next_token="page-2")

    sent = route.calls.last.request.url.params
    assert sent["limit"] == "5"
    assert sent["nextToken"] == "page-2"


# --------------------------------------------------------------------------- #
# Every write route (delete/update on prompts, datasets, tools)
# --------------------------------------------------------------------------- #


@respx.mock
async def test_delete_scenario_round_trip_and_cache_invalidation(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    get_route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )
    delete_route = respx.delete(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(204)
    )

    await client.get_scenario("fraud-detection-comprehensive")
    await client.delete_scenario("fraud-detection-comprehensive")
    await client.get_scenario("fraud-detection-comprehensive")

    assert delete_route.call_count == 1
    # The detail cache was invalidated by the delete, so the second get_scenario
    # is a real request rather than a cache hit.
    assert get_route.call_count == 2


@respx.mock
async def test_update_prompt_round_trip_and_cache_invalidation(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    get_route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )
    put_route = respx.put(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/prompts/fraud-analyst"
    ).mock(return_value=httpx.Response(204))

    await client.get_scenario("fraud-detection-comprehensive")
    await client.update_prompt(
        "fraud-detection-comprehensive", "fraud-analyst", PromptUpdateRequest(name="Renamed")
    )
    await client.get_scenario("fraud-detection-comprehensive")

    assert put_route.call_count == 1
    assert get_route.call_count == 2


@respx.mock
async def test_delete_prompt_round_trip_and_cache_invalidation(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    get_route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )
    delete_route = respx.delete(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/prompts/fraud-analyst"
    ).mock(return_value=httpx.Response(204))

    await client.get_scenario("fraud-detection-comprehensive")
    await client.delete_prompt("fraud-detection-comprehensive", "fraud-analyst")
    await client.get_scenario("fraud-detection-comprehensive")

    assert delete_route.call_count == 1
    assert get_route.call_count == 2


@respx.mock
async def test_create_prompt_round_trip_and_cache_invalidation(client: ConfigStoreClient):
    from promptatron.schemas.scenario import PromptCreateRequest

    fixture = _fixture("scenario-hydrated.json")
    get_route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )
    post_route = respx.post(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/prompts"
    ).mock(return_value=httpx.Response(201, json={"id": "new-prompt"}))

    await client.get_scenario("fraud-detection-comprehensive")
    result = await client.create_prompt(
        "fraud-detection-comprehensive",
        PromptCreateRequest(kind="SYSTEM", name="New Prompt", content="Be helpful."),
    )
    await client.get_scenario("fraud-detection-comprehensive")

    assert result.id == "new-prompt"
    assert post_route.call_count == 1
    assert get_route.call_count == 2


@respx.mock
async def test_list_tools_round_trip(client: ConfigStoreClient):
    tool_fixture = _fixture("tool.json")
    route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive/tools").mock(
        return_value=httpx.Response(200, json={"items": [tool_fixture], "count": 1})
    )

    result = await client.list_tools("fraud-detection-comprehensive")

    assert result.count == 1
    assert result.items[0].name == tool_fixture["name"]
    assert route.called


@respx.mock
async def test_list_datasets_round_trip(client: ConfigStoreClient):
    fixture = {"items": [], "count": 0}
    route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive/datasets").mock(
        return_value=httpx.Response(200, json=fixture)
    )

    result = await client.list_datasets("fraud-detection-comprehensive", limit=3)

    assert result.count == 0
    assert route.calls.last.request.url.params["limit"] == "3"


@respx.mock
async def test_create_dataset_round_trip_and_cache_invalidation(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    get_route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )
    post_route = respx.post(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/datasets"
    ).mock(return_value=httpx.Response(201, json={"id": "new-dataset"}))

    await client.get_scenario("fraud-detection-comprehensive")
    result = await client.create_dataset(
        "fraud-detection-comprehensive",
        DatasetCreateRequest(name="New", content_type="text/csv", content="a,b\n1,2\n"),
    )
    await client.get_scenario("fraud-detection-comprehensive")

    assert result.id == "new-dataset"
    assert post_route.call_count == 1
    assert get_route.call_count == 2


@respx.mock
async def test_delete_dataset_round_trip_and_cache_invalidation(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    get_route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )
    delete_route = respx.delete(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/datasets/retail-transactions"
    ).mock(return_value=httpx.Response(204))

    await client.get_scenario("fraud-detection-comprehensive")
    await client.delete_dataset("fraud-detection-comprehensive", "retail-transactions")
    await client.get_scenario("fraud-detection-comprehensive")

    assert delete_route.call_count == 1
    assert get_route.call_count == 2


@respx.mock
async def test_upsert_tool_round_trip_and_cache_invalidation(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    tool_fixture = _fixture("tool.json")
    get_route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )
    put_route = respx.put(
        f"{BASE_URL}/scenarios/fraud-detection-comprehensive/tools/new_tool"
    ).mock(return_value=httpx.Response(200, json=tool_fixture))

    await client.get_scenario("fraud-detection-comprehensive")
    result = await client.upsert_tool(
        "fraud-detection-comprehensive",
        "new_tool",
        ToolUpsertRequest(description="x", input_schema={"type": "object"}, handler_key="h.f"),
    )
    await client.get_scenario("fraud-detection-comprehensive")

    assert result.name == tool_fixture["name"]
    assert put_route.call_count == 1
    assert get_route.call_count == 2


# --------------------------------------------------------------------------- #
# Error message parsing edge cases
# --------------------------------------------------------------------------- #


@respx.mock
async def test_a_non_json_error_body_falls_back_to_the_default_message(
    client: ConfigStoreClient,
):
    respx.get(f"{BASE_URL}/scenarios/missing").mock(
        return_value=httpx.Response(404, text="<html>not json</html>")
    )

    with pytest.raises(NotFoundError) as exc_info:
        await client.get_scenario("missing")
    assert exc_info.value.message == "Resource not found"


@respx.mock
async def test_a_json_error_body_without_a_message_key_falls_back_to_the_default(
    client: ConfigStoreClient,
):
    respx.get(f"{BASE_URL}/scenarios/missing").mock(
        return_value=httpx.Response(404, json={"detail": "gone"})
    )

    with pytest.raises(NotFoundError) as exc_info:
        await client.get_scenario("missing")
    assert exc_info.value.message == "Resource not found"


@respx.mock
async def test_create_scenario_actually_sends_the_payload_body(client: ConfigStoreClient):
    """Not just that a POST lands -- that the request carries the payload, not
    an empty/dropped body."""
    hydrated = _fixture("scenario-hydrated.json")
    route = respx.post(f"{BASE_URL}/scenarios").mock(
        return_value=httpx.Response(201, json=hydrated)
    )

    from promptatron.schemas.scenario import ScenarioCreateRequest

    await client.create_scenario(ScenarioCreateRequest(name="New One", description="desc"))

    sent = json.loads(route.calls.last.request.content)
    assert sent == {"name": "New One", "description": "desc"}


@respx.mock
async def test_update_scenario_actually_sends_the_payload_body(client: ConfigStoreClient):
    route = respx.put(f"{BASE_URL}/scenarios/x").mock(return_value=httpx.Response(204))

    await client.update_scenario("x", ScenarioUpdateRequest(name="Renamed"))

    sent = json.loads(route.calls.last.request.content)
    assert sent == {"name": "Renamed"}


@respx.mock
async def test_get_scenario_uses_an_uppercase_get_method(client: ConfigStoreClient):
    fixture = _fixture("scenario-hydrated.json")
    route = respx.get(f"{BASE_URL}/scenarios/fraud-detection-comprehensive").mock(
        return_value=httpx.Response(200, json=fixture)
    )

    await client.get_scenario("fraud-detection-comprehensive")

    assert route.calls.last.request.method == "GET"


@respx.mock
async def test_an_unmapped_4xx_status_is_an_upstream_error(client: ConfigStoreClient):
    """401/403/etc aren't retried and aren't 400/404 -- they surface as upstream_error."""
    respx.get(f"{BASE_URL}/scenarios/x").mock(
        return_value=httpx.Response(401, json={"message": "no api key"})
    )

    with pytest.raises(UpstreamError) as exc_info:
        await client.get_scenario("x")
    assert exc_info.value.message == "config store unreachable"
