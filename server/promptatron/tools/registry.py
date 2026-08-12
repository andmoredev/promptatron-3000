"""Scenario id -> ported Strands tools lookup.

Keyed by each scenario's actual ``id`` field from its ``scenario.json``
(``fraud-detection-comprehensive`` and ``shipping-logistics``), with the
scenario's folder name also accepted as an alias so callers that only know
the directory name (``fraud-detection``) still resolve correctly. For
shipping-logistics the folder name and the scenario id are already the same
string, so there is only one alias to add (fraud-detection).
"""

from __future__ import annotations

from promptatron.tools import fraud_detection, shipping_logistics

_FRAUD_TOOLS = [
    fraud_detection.freeze_account,
    fraud_detection.flag_suspicious_transaction,
    fraud_detection.create_fraud_alert,
    fraud_detection.update_risk_profile,
]

_SHIPPING_TOOLS = [
    shipping_logistics.get_carrier_status,
    shipping_logistics.get_package_contents,
    shipping_logistics.get_customer_tier,
    shipping_logistics.get_sla,
    shipping_logistics.get_expedite_quote,
    shipping_logistics.list_orders,
    shipping_logistics.expedite_shipment,
    shipping_logistics.hold_for_pickup,
    shipping_logistics.escalate_to_manager,
    shipping_logistics.no_action_required,
]

# scenario.json "id" fields, plus folder-name aliases.
_REGISTRY: dict[str, list] = {
    "fraud-detection-comprehensive": _FRAUD_TOOLS,
    "fraud-detection": _FRAUD_TOOLS,
    "shipping-logistics": _SHIPPING_TOOLS,
}


def get_tools(scenario_id: str) -> list:
    """Return the ``@tool`` callables registered for ``scenario_id``.

    Unknown scenario ids return an empty list.
    """
    return list(_REGISTRY.get(scenario_id, []))


def has_handler(scenario_id: str, tool_name: str) -> bool:
    """Return whether ``scenario_id`` has a tool named ``tool_name``.

    ``tool_name`` is matched against each tool's Strands ``tool_name``
    (the name Strands/scenario.json expose it under, e.g. ``getCarrierStatus``
    or ``freeze_account`` -- not the Python function name).
    """
    return any(tool.tool_name == tool_name for tool in get_tools(scenario_id))


def list_handlers() -> dict[str, list[str]]:
    """Return ``{scenario_id: [tool_name, ...]}`` for every registered scenario id/alias."""
    return {
        scenario_id: [tool.tool_name for tool in tools] for scenario_id, tools in _REGISTRY.items()
    }
