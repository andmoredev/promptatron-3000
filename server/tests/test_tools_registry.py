"""Tests for promptatron.tools.registry and Strands tool-spec fidelity.

Cross-checks the registry against the actual scenario.json files so that if
either scenario definition drifts from the ported tools, these tests fail
loudly rather than silently going stale.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from promptatron.tools import registry
from tests._repo_paths import find_upward

FRAUD_SCENARIO = find_upward("api", "seed", "fixtures", "fraud-detection", "scenario.json")
SHIPPING_SCENARIO = find_upward(
    "api", "seed", "fixtures", "shipping-logistics", "scenario.json"
)


def _load_scenario(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def fraud_scenario() -> dict:
    return _load_scenario(FRAUD_SCENARIO)


@pytest.fixture(scope="module")
def shipping_scenario() -> dict:
    return _load_scenario(SHIPPING_SCENARIO)


class TestScenarioIdResolution:
    def test_fraud_scenario_id_from_json(self, fraud_scenario):
        assert fraud_scenario["id"] == "fraud-detection-comprehensive"
        tools = registry.get_tools(fraud_scenario["id"])
        assert len(tools) == len(fraud_scenario["tools"])

    def test_fraud_folder_name_alias(self, fraud_scenario):
        # scenario.json lives under app/src/scenarios/fraud-detection/, but its
        # own "id" field is fraud-detection-comprehensive -- the folder name
        # must also resolve.
        by_id = registry.get_tools(fraud_scenario["id"])
        by_alias = registry.get_tools("fraud-detection")
        assert {t.tool_name for t in by_id} == {t.tool_name for t in by_alias}

    def test_shipping_scenario_id_from_json(self, shipping_scenario):
        assert shipping_scenario["id"] == "shipping-logistics"
        tools = registry.get_tools(shipping_scenario["id"])
        assert len(tools) == len(shipping_scenario["tools"])

    def test_unknown_scenario_returns_empty_list(self):
        assert registry.get_tools("does-not-exist") == []


class TestToolNameSetsMatchScenarioJson:
    def test_fraud_tool_names(self, fraud_scenario):
        expected = {t["name"] for t in fraud_scenario["tools"]}
        actual = {t.tool_name for t in registry.get_tools(fraud_scenario["id"])}
        assert actual == expected

    def test_shipping_tool_names(self, shipping_scenario):
        expected = {t["name"] for t in shipping_scenario["tools"]}
        actual = {t.tool_name for t in registry.get_tools(shipping_scenario["id"])}
        assert actual == expected


class TestHasHandler:
    def test_true_for_registered_tool(self, fraud_scenario, shipping_scenario):
        for tool_def in fraud_scenario["tools"]:
            assert registry.has_handler(fraud_scenario["id"], tool_def["name"])
        for tool_def in shipping_scenario["tools"]:
            assert registry.has_handler(shipping_scenario["id"], tool_def["name"])

    def test_false_for_unknown_tool_or_scenario(self):
        assert registry.has_handler("shipping-logistics", "not_a_real_tool") is False
        assert registry.has_handler("does-not-exist", "getCarrierStatus") is False


class TestListHandlers:
    def test_includes_every_scenario_id_and_alias(self):
        handlers = registry.list_handlers()
        assert set(handlers.keys()) == {
            "fraud-detection-comprehensive",
            "fraud-detection",
            "shipping-logistics",
        }

    def test_tool_name_lists_match_scenario_json(self, fraud_scenario, shipping_scenario):
        handlers = registry.list_handlers()
        assert set(handlers["fraud-detection-comprehensive"]) == {
            t["name"] for t in fraud_scenario["tools"]
        }
        assert set(handlers["shipping-logistics"]) == {
            t["name"] for t in shipping_scenario["tools"]
        }


class TestToolSpecInputSchemaMatchesScenarioJson:
    """Every ported @tool's Strands tool_spec must expose the same top-level
    input parameter names as the corresponding scenario.json inputSchema."""

    def test_fraud_tools(self, fraud_scenario):
        by_name = {t["name"]: t for t in fraud_scenario["tools"]}
        for tool in registry.get_tools(fraud_scenario["id"]):
            scenario_def = by_name[tool.tool_name]
            expected_props = set(scenario_def["inputSchema"]["properties"].keys())
            spec = tool.tool_spec
            assert spec["name"] == tool.tool_name
            actual_props = set(spec["inputSchema"]["json"]["properties"].keys())
            assert actual_props == expected_props, tool.tool_name

    def test_shipping_tools(self, shipping_scenario):
        by_name = {t["name"]: t for t in shipping_scenario["tools"]}
        for tool in registry.get_tools(shipping_scenario["id"]):
            scenario_def = by_name[tool.tool_name]
            expected_props = set(scenario_def["inputSchema"]["properties"].keys())
            spec = tool.tool_spec
            assert spec["name"] == tool.tool_name
            actual_props = set(spec["inputSchema"]["json"]["properties"].keys())
            assert actual_props == expected_props, tool.tool_name

    def test_required_fields_match_for_fraud_tools(self, fraud_scenario):
        by_name = {t["name"]: t for t in fraud_scenario["tools"]}
        for tool in registry.get_tools(fraud_scenario["id"]):
            scenario_def = by_name[tool.tool_name]
            expected_required = set(scenario_def["inputSchema"].get("required", []))
            actual_required = set(tool.tool_spec["inputSchema"]["json"].get("required", []))
            assert actual_required == expected_required, tool.tool_name

    def test_required_fields_match_for_shipping_tools(self, shipping_scenario):
        by_name = {t["name"]: t for t in shipping_scenario["tools"]}
        for tool in registry.get_tools(shipping_scenario["id"]):
            scenario_def = by_name[tool.tool_name]
            expected_required = set(scenario_def["inputSchema"].get("required", []))
            actual_required = set(tool.tool_spec["inputSchema"]["json"].get("required", []))
            assert actual_required == expected_required, tool.tool_name
