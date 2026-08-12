"""Tests for the ported shipping-logistics scenario tools.

Happy-path values are drawn from the fixture at
api/seed/fixtures/shipping-logistics/seed-data.json (order B456) and from
app/src/scenarios/shipping-logistics/tool-usage-examples.md; where the two
disagreed on response *shape*, the actual JS handler source
(app/src/scenarios/shipping-logistics/tools/*.js) is authoritative -- see the
module docstring in promptatron/tools/shipping_logistics.py for specifics.
"""

from __future__ import annotations

import itertools
import uuid

from promptatron.tools import shipping_logistics as sl

ORDER_ID = "B456"

_key_counter = itertools.count(1)


def _write_meta(prefix: str) -> dict:
    """A syntactically valid meta object for write tools, unique per test.

    idempotency_key must match ^[a-z_]+_[A-Z][0-9]{3,6}_[0-9]+$ -- the final
    segment is digits-only, so a monotonically increasing counter is used
    rather than a hex uuid fragment (which could contain a-f letters).
    """
    return {
        "idempotency_key": f"{prefix}_B456_{next(_key_counter)}",
        "request_id": f"req_{uuid.uuid4().hex[:10]}",
    }


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------


class TestGetCarrierStatus:
    def test_happy_path(self):
        result = sl.get_carrier_status(order_id=ORDER_ID)

        assert result["order_id"] == ORDER_ID
        assert result["carrier"] == {
            "name": "RegionalExpress",
            "tracking_number": "RX8829912847",
            "status": "delivery_exception",
            "exception_note": "Box felt warm to touch. Customer not home. Returned to depot.",
            "last_update": "2025-09-30T11:15:00Z",
            "attempts_remaining": 1,
        }
        assert set(result.keys()) == {"order_id", "carrier", "meta"}
        assert result["meta"]["from_cache"] is False
        assert result["meta"]["rate_limit"] is None

    def test_invalid_order_id_format(self):
        result = sl.get_carrier_status(order_id="invalid123")

        assert result["type"] == "/errors/validation"
        assert result["title"] == "Invalid Order ID Format"
        assert result["status"] == 400
        assert "order_id" in result["detail"]
        assert result["instance"].startswith("/shipping/getCarrierStatus/")

    def test_unknown_order_id_not_found(self):
        result = sl.get_carrier_status(order_id="Z999999")

        assert result["type"] == "/errors/not_found"
        assert result["title"] == "Order Not Found"
        assert result["status"] == 404
        assert "Z999999" in result["detail"]


class TestGetPackageContents:
    def test_happy_path(self):
        result = sl.get_package_contents(order_id=ORDER_ID)

        assert result["order_id"] == ORDER_ID
        assert result["classification"] == {
            "is_perishable": True,
            "is_hazmat": False,
            "requires_refrigeration": True,
        }
        assert result["physical_properties"]["weight"] == {"value": 3.2, "unit": "kg"}
        assert result["physical_properties"]["declared_value"] == {"amount": 340, "currency": "USD"}
        assert result["contents"][0]["sku"] == "MEAT-WAGU-8OZ"

    def test_unknown_order_id_not_found(self):
        result = sl.get_package_contents(order_id="Z999999")

        assert result["type"] == "/errors/not_found"
        assert result["title"] == "Package Not Found"


class TestGetCustomerTier:
    def test_happy_path(self):
        result = sl.get_customer_tier(order_id=ORDER_ID)

        assert result["order_id"] == ORDER_ID
        assert result["customer"] == {
            "customer_id": "C8821",
            "name": "Margaret Thompson",
            "tier": "VIP",
            "account_value": {"amount": 12400, "currency": "USD"},
            "satisfaction_score": 4.8,
            "member_since": "2019-03-15",
        }

    def test_unknown_order_id_not_found(self):
        result = sl.get_customer_tier(order_id="Z999999")

        assert result["type"] == "/errors/not_found"
        assert result["title"] == "Order Not Found"


class TestGetSLA:
    def test_happy_path(self):
        result = sl.get_sla(order_id=ORDER_ID)

        assert result["order_id"] == ORDER_ID
        assert result["sla"] == {
            "tier": "2-day",
            "promised_delivery_by": "2025-09-30T20:00:00Z",
            "hours_until_deadline": 8,
            "status": "exception",
            "penalty": {"amount_per_day": 200, "currency": "USD"},
        }

    def test_unknown_order_id_not_found(self):
        result = sl.get_sla(order_id="Z999999")

        assert result["type"] == "/errors/not_found"
        assert result["title"] == "SLA Data Not Found"


class TestGetExpediteQuote:
    def test_happy_path_overnight(self):
        result = sl.get_expedite_quote(order_id=ORDER_ID, speed="overnight")

        assert result["order_id"] == ORDER_ID
        assert result["quote"]["speed"] == "overnight"
        assert result["quote"]["cost"] == {"amount": 47, "currency": "USD"}
        assert result["quote"]["carrier"] == {"name": "PremiumAir", "service": "Next-Flight-Out"}

    def test_happy_path_same_day(self):
        result = sl.get_expedite_quote(order_id=ORDER_ID, speed="same_day")

        assert result["quote"]["cost"] == {"amount": 95, "currency": "USD"}
        assert result["quote"]["carrier"]["service"] == "Rush-Direct"

    def test_invalid_speed(self):
        result = sl.get_expedite_quote(order_id=ORDER_ID, speed="super_fast")

        assert result["type"] == "/errors/validation"
        assert result["title"] == "Invalid Speed Option"
        assert result["status"] == 400


class TestListOrders:
    def test_happy_path_matches_documented_example(self):
        result = sl.list_orders(filters={"status": "delivery_exception", "customer_tier": "vip"})

        assert result["orders"] == [
            {
                "order_id": "B456",
                "status": "delivery_exception",
                "customer_tier": "vip",
                "has_hazmat": False,
                "is_perishable": True,
                "sla_at_risk": True,
                "exception_note": "Box felt warm to touch. Customer not home. Returned to depot.",
                "created_date": "2025-09-30",
                "carrier": "RegionalExpress",
            }
        ]
        assert result["total_count"] == 1
        assert result["meta"]["paging"] == {"next_cursor": None, "has_more": False}

    def test_pagination_matches_documented_cursor(self):
        first_page = sl.list_orders(
            filters={"status": "delivery_exception"}, meta={"paging": {"limit": 2}}
        )

        assert [o["order_id"] for o in first_page["orders"]] == ["B456", "A123"]
        assert first_page["total_count"] == 3
        assert first_page["meta"]["paging"]["has_more"] is True
        assert first_page["meta"]["paging"]["next_cursor"] == "eyJvZmZzZXQiOjJ9"

        next_page = sl.list_orders(
            filters={"status": "delivery_exception"},
            meta={"paging": {"cursor": first_page["meta"]["paging"]["next_cursor"], "limit": 2}},
        )
        assert [o["order_id"] for o in next_page["orders"]] == ["F111"]
        assert next_page["meta"]["paging"] == {"next_cursor": None, "has_more": False}

    def test_default_pagination_limit_is_20(self):
        result = sl.list_orders()
        assert result["total_count"] == len(sl._MOCK_ORDERS)
        assert result["meta"]["paging"]["has_more"] is False

    def test_upstream_data_bug_d999_has_no_customer_tier(self):
        # listOrders.js has a corrupted key (`r_tier` instead of
        # `customer_tier`) for order D999 -- reproduced verbatim.
        result = sl.list_orders(filters={"customer_tier": "vip"})
        order_ids = {o["order_id"] for o in result["orders"]}
        assert "D999" not in order_ids
        assert "B456" in order_ids and "G222" in order_ids


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------


class TestExpediteShipment:
    def test_happy_path(self):
        result = sl.expedite_shipment(
            order_id=ORDER_ID,
            speed="overnight",
            reason="Perishable goods at risk due to temperature control failure",
            meta=_write_meta("exp"),
        )

        assert result["success"] is True
        assert result["order_id"] == ORDER_ID
        assert result["action_id"].startswith("EXP_")
        assert result["shipping_details"]["new_carrier"] == "PremiumAir"
        assert result["shipping_details"]["cost"] == {"amount": 47, "currency": "USD"}
        assert result["confirmation"] == "Expedited overnight shipping confirmed"
        assert result["meta"]["from_cache"] is False

    def test_reason_too_short_is_validation_error(self):
        result = sl.expedite_shipment(
            order_id=ORDER_ID, speed="overnight", reason="too short", meta=_write_meta("exp")
        )

        assert result["type"] == "/errors/validation"
        assert result["title"] == "Invalid Reason Length"
        assert result["status"] == 400

    def test_missing_meta_is_validation_error(self):
        result = sl.expedite_shipment(
            order_id=ORDER_ID,
            speed="overnight",
            reason="Perishable goods at risk due to temperature control failure",
            meta={},
        )

        assert result["type"] == "/errors/validation"
        assert result["title"] == "Missing Required Meta Fields"

    def test_idempotency_key_format_bug_matches_scenario_json_example(self):
        # scenario.json's own documented example ("exp_b456_001") does not
        # actually satisfy its own pattern (^[a-z_]+_[A-Z][0-9]{3,6}_[0-9]+$,
        # which requires an *uppercase* order-id segment) -- the JS source
        # (expediteShipment.js) enforces the same regex, so this legacy
        # mismatch is reproduced here rather than silently "fixed".
        result = sl.expedite_shipment(
            order_id=ORDER_ID,
            speed="overnight",
            reason="Perishable goods at risk due to temperature control failure",
            meta={"idempotency_key": "exp_b456_001", "request_id": "req_123456"},
        )
        assert result["type"] == "/errors/validation"
        assert result["title"] == "Invalid Idempotency Key Format"

    def test_idempotent_replay_returns_original_result(self):
        meta = _write_meta("exp")
        first = sl.expedite_shipment(
            order_id=ORDER_ID,
            speed="same_day",
            reason="SLA at risk, customer is VIP and requires overnight resolution",
            meta=meta,
        )
        second = sl.expedite_shipment(
            order_id=ORDER_ID,
            speed="same_day",
            reason="SLA at risk, customer is VIP and requires overnight resolution",
            meta=meta,
        )

        assert second["action_id"] == first["action_id"]
        assert second["meta"]["from_cache"] is True
        assert second["meta"]["idempotent_response"] is True
        assert second["meta"]["original_timestamp"] == first["meta"]["last_modified"]

    def test_unknown_order_id_not_found(self):
        result = sl.expedite_shipment(
            order_id="Z999999",
            speed="overnight",
            reason="Perishable goods at risk due to temperature control failure",
            meta=_write_meta("exp"),
        )
        assert result["type"] == "/errors/not_found"
        assert result["title"] == "Order Not Found"


class TestHoldForPickup:
    def test_happy_path(self):
        result = sl.hold_for_pickup(
            order_id=ORDER_ID,
            reason="Package contains hazardous materials - cannot be delivered to residence",
            meta=_write_meta("hold"),
        )

        assert result["success"] is True
        assert result["status"] == "held_for_pickup"
        assert result["action_id"].startswith("HOLD_")
        assert result["confirmation"] == "Order held for pickup, customer notified"
        assert "pickup_code" in result["facility_information"]

    def test_reason_too_short_is_validation_error(self):
        result = sl.hold_for_pickup(order_id=ORDER_ID, reason="short", meta=_write_meta("hold"))

        assert result["type"] == "/errors/validation"
        assert result["title"] == "Invalid Reason Length"


class TestEscalateToManager:
    def test_happy_path(self):
        result = sl.escalate_to_manager(
            order_id=ORDER_ID,
            reason="Complex situation involving both hazmat and perishable goods",
            urgency="high",
            meta=_write_meta("esc"),
        )

        assert result["success"] is True
        assert result["escalation_tracking"]["urgency_level"] == "high"
        assert result["escalation_tracking"]["assigned_manager"] == "Senior Manager - Sarah Chen"
        assert result["escalation_tracking"]["queue_position"] == 1
        assert result["action_id"].startswith("ESC_")

    def test_default_urgency_is_medium(self):
        result = sl.escalate_to_manager(
            order_id=ORDER_ID,
            reason="Ambiguous delivery exception requiring manager judgment call",
            meta=_write_meta("esc"),
        )
        assert result["escalation_tracking"]["urgency_level"] == "medium"

    def test_invalid_urgency_is_validation_error(self):
        result = sl.escalate_to_manager(
            order_id=ORDER_ID,
            reason="Ambiguous delivery exception requiring manager judgment call",
            urgency="extreme",
            meta=_write_meta("esc"),
        )

        assert result["type"] == "/errors/validation"
        assert result["title"] == "Invalid Urgency Level"


class TestNoActionRequired:
    def test_happy_path(self):
        result = sl.no_action_required(
            order_id=ORDER_ID,
            reason="Standard delivery process is sufficient - no safety concerns identified",
            meta=_write_meta("no_action"),
        )

        assert result["success"] is True
        assert result["status"] == "monitoring"
        assert result["action_id"].startswith("NONE_")
        assert result["confirmation"] == "No action taken, continuing standard delivery process"
        assert result["documentation_confirmation"]["decision_recorded"] is True

    def test_missing_request_id_is_validation_error(self):
        result = sl.no_action_required(
            order_id=ORDER_ID,
            reason="Standard delivery process is sufficient - no safety concerns identified",
            meta={"idempotency_key": "no_action_B456_001"},
        )

        assert result["type"] == "/errors/validation"
        assert result["title"] == "Missing Required Meta Fields"


# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------


class TestFixtureLoading:
    def test_fixture_loads_real_seed_data_file(self):
        orders = sl._load_orders()
        assert "B456" in orders
        assert orders["B456"]["customer"]["name"] == "Margaret Thompson"

    def test_fixtures_dir_env_override(self, tmp_path, monkeypatch):
        import json

        fixture_file = tmp_path / "seed-data.json"
        fixture_file.write_text(json.dumps({"orders": {"Q123": {"carrier": {}}}}))

        monkeypatch.setenv("PROMPTATRON_FIXTURES_DIR", str(tmp_path))
        monkeypatch.setattr(sl, "_orders_cache", None)

        orders = sl._load_orders()
        assert set(orders.keys()) == {"Q123"}
        # monkeypatch reverts _orders_cache (and the env var) to their
        # pre-test values on teardown, so later tests see the real fixture.
