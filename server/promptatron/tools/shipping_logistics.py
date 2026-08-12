"""Strands `@tool` port of the legacy JS shipping-logistics scenario handlers.

Source (read-only reference during the port):
    app/src/scenarios/shipping-logistics/scenario.json           (tool defs)
    app/src/scenarios/shipping-logistics/tools/*.js               (handlers)
    app/src/scenarios/shipping-logistics/tool-usage-examples.md   (illustrative
        examples -- used for prose/value guidance only; where it disagreed
        with the actual handler source on response *shape*, the handler
        source won, per the porting brief)
    api/seed/fixtures/shipping-logistics/seed-data.json           (order DB)

Behavior notes / deviations from the JS source
-----------------------------------------------
* Momento caching and in-memory/Momento rate limiting (sharedUtils.js:
  checkRateLimit/checkCache/cacheResponse/flushCache) are dropped entirely,
  as instructed. Effects:
    - ``meta.rate_limit`` is always ``None`` (JS already returns ``null``
      here whenever Momento is unconfigured -- see tool-usage-examples.md's
      "Momento Fallback Behavior" section -- so this is the documented
      fallback path, not a new behavior).
    - ``meta.from_cache`` is always ``False`` for a fresh response (again,
      matching the documented no-Momento fallback). It is still set to
      ``True`` for the *idempotency* replay path below, which is unrelated
      to Momento.
    - No 429 rate-limit responses are produced.
    - No 304-not-modified / ETag-conditional short-circuiting is
      implemented; ``if_none_match`` in ``meta`` is accepted but ignored.
* Idempotency for the four write tools (expediteShipment, holdForPickup,
  escalateToManager, noActionRequired) is the one piece of cross-call state
  that *is* observable in the JS handlers' output (a repeated
  ``idempotency_key`` returns the original stored result with
  ``from_cache``/``idempotent_response``/``original_timestamp`` added). That
  is preserved here via a trivial module-level dict, ``_ACTIONS``.
* The order/customer/carrier/package/SLA data backing the five read tools
  and the order-existence check in the four write tools comes from the
  fixture at api/seed/fixtures/shipping-logistics/seed-data.json (loaded
  lazily, once, on first use -- see ``_load_orders``), rather than from the
  JS handlers' seeded IndexedDB demo record. Both describe the same single
  demo order (B456 / Margaret Thompson / RegionalExpress), so the mapped
  output is equivalent field-for-field; the only intentional difference is
  ``package.contents``, where the fixture's structured item list (sku/name/
  quantity/requiresRefrigeration) is passed through as-is instead of the
  JS demo's flattened display string (``"Wagyu Beef Steaks (qty: 2)"``),
  since the fixture is strictly richer. Any order_id absent from the
  fixture produces the same "Order Not Found" shape the JS produced for an
  unseeded/unknown order_id.
* ``listOrders`` is unaffected by the fixture: the JS handler
  (listOrders.js) never reads the IndexedDB order store, it filters/paginates
  a hardcoded 7-order mock list. That list -- including one upstream data
  bug where order D999 has a corrupted ``r_tier: 'vip'`` key instead of
  ``customer_tier: 'vip'`` (see listOrders.js line 42), meaning D999 has no
  customer_tier -- is reproduced verbatim in ``_MOCK_ORDERS`` below.
* ``getExpediteQuote``'s two canned quotes (cost/eta/carrier/service for
  "overnight" and "same_day") are hardcoded in the JS handler itself
  (independent of any stored order data beyond an existence check), and are
  reproduced verbatim in ``_EXPEDITE_QUOTES``.
* ``expediteShipment``'s JS source calls its sibling ``getExpediteQuote``
  handler for quote data, guarded by a dead check
  (``!quoteResponse.success && quoteResponse.error``) that can never be
  true because ``getExpediteQuote`` never sets a ``success``/``error`` key
  on either its success or error path -- so the guard is a no-op in
  practice. This port therefore reads the same canned quote data directly
  (``_EXPEDITE_QUOTES``) rather than reproducing that dead branch.
* ``noActionRequired``'s JS source formats one ``next_steps`` entry with
  ``new Date(...).toLocaleString()``, which is locale/timezone-dependent
  and therefore not a reproducible API response. This port uses the same
  ISO-8601 timestamp it already computed instead.
* None of the read/write tools' ``etag`` values need to match the JS
  handlers' byte-for-byte (``` `"${Date.now()}-${JSON.stringify(x).length}"` ```
  is itself non-deterministic across runs in the JS version too); the same
  formula is reproduced for shape/type parity, not exact-value parity.
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
from datetime import timedelta
from pathlib import Path
from typing import Any, Literal

from strands import tool

from promptatron.tools._common import generate_id, iso_now, iso_offset

# ---------------------------------------------------------------------------
# Fixture loading (api/seed/fixtures/shipping-logistics/seed-data.json)
# ---------------------------------------------------------------------------

_FIXTURES_DIR_ENV = "PROMPTATRON_FIXTURES_DIR"
_FIXTURE_RELATIVE_PATH = ("api", "seed", "fixtures", "shipping-logistics", "seed-data.json")

_orders_cache: dict[str, dict[str, Any]] | None = None


def _find_repo_root(start: Path) -> Path | None:
    """Walk up from ``start`` looking for the directory that contains an ``api`` dir."""
    for candidate in (start, *start.parents):
        if (candidate / "api").is_dir():
            return candidate
    return None


def _fixture_path() -> Path:
    override = os.environ.get(_FIXTURES_DIR_ENV)
    if override:
        return Path(override) / "seed-data.json"

    repo_root = _find_repo_root(Path(__file__).resolve())
    if repo_root is None:
        raise FileNotFoundError(
            "Could not locate the repo root (a directory containing 'api') by walking up "
            f"from {__file__}. Set {_FIXTURES_DIR_ENV} to override the fixtures directory."
        )
    return repo_root.joinpath(*_FIXTURE_RELATIVE_PATH)


def _load_orders() -> dict[str, dict[str, Any]]:
    global _orders_cache
    if _orders_cache is None:
        with _fixture_path().open(encoding="utf-8") as f:
            data = json.load(f)
        _orders_cache = data.get("orders", {})
    return _orders_cache


def _get_order(order_id: str) -> dict[str, Any] | None:
    return _load_orders().get(order_id)


# ---------------------------------------------------------------------------
# In-memory state (idempotency replay for write tools)
# ---------------------------------------------------------------------------

_ACTIONS: dict[str, dict[str, Any]] = {}

_ORDER_ID_RE = re.compile(r"^[A-Z][0-9]{3,6}$")
_IDEMPOTENCY_KEY_RE = re.compile(r"^[a-z_]+_[A-Z][0-9]{3,6}_[0-9]+$")
_REQUEST_ID_RE = re.compile(r"^req_[a-zA-Z0-9]{6,12}$")


# ---------------------------------------------------------------------------
# RFC 7807-style error responses (sharedUtils.js: createErrorResponse and friends)
# ---------------------------------------------------------------------------


def _error(
    type_: str, title: str, status: int, detail: str, next_steps: str, tool_name: str
) -> dict:
    return {
        "type": type_,
        "title": title,
        "status": status,
        "detail": detail,
        "instance": f"/shipping/{tool_name}/{int(time.time() * 1000)}",
        "next_steps": next_steps,
    }


def _validation_error(title: str, detail: str, next_steps: str, tool_name: str) -> dict:
    return _error("/errors/validation", title, 400, detail, next_steps, tool_name)


def _not_found_error(title: str, detail: str, next_steps: str, tool_name: str) -> dict:
    return _error("/errors/not_found", title, 404, detail, next_steps, tool_name)


def _order_not_found(order_id: str, tool_name: str) -> dict:
    return _not_found_error(
        "Order Not Found",
        f"Order {order_id} does not exist in the system",
        "Verify the order ID and ensure it exists in the system",
        tool_name,
    )


def _validate_order_id(order_id: str, tool_name: str) -> dict | None:
    if not order_id:
        return _validation_error(
            "Missing Order ID",
            "The order_id parameter is required",
            "Provide a valid order_id in the request",
            tool_name,
        )
    if not _ORDER_ID_RE.match(order_id):
        return _validation_error(
            "Invalid Order ID Format",
            f"order_id must match pattern ^[A-Z][0-9]{{3,6}}$. Received: {order_id}",
            "Provide order_id in format: one letter + 3-6 digits (e.g., B456)",
            tool_name,
        )
    return None


def _validate_write_meta(
    meta: dict[str, Any] | None, tool_name: str, key_example: str
) -> dict | None:
    if not meta or not meta.get("idempotency_key") or not meta.get("request_id"):
        return _validation_error(
            "Missing Required Meta Fields",
            "Write operations require meta.idempotency_key and meta.request_id",
            "Provide both idempotency_key and request_id in the meta object",
            tool_name,
        )

    idempotency_key = meta["idempotency_key"]
    if not _IDEMPOTENCY_KEY_RE.match(idempotency_key):
        return _validation_error(
            "Invalid Idempotency Key Format",
            f"idempotency_key must match pattern ^[a-z_]+_[A-Z][0-9]{{3,6}}_[0-9]+$. "
            f"Received: {idempotency_key}",
            f"Use format: action_orderid_timestamp (e.g., {key_example})",
            tool_name,
        )

    request_id = meta["request_id"]
    if not _REQUEST_ID_RE.match(request_id):
        return _validation_error(
            "Invalid Request ID Format",
            f"request_id must match pattern ^req_[a-zA-Z0-9]{{6,12}}$. Received: {request_id}",
            "Use format: req_ followed by 6-12 alphanumeric characters (e.g., req_123456)",
            tool_name,
        )

    return None


def _validate_reason(reason: str, next_steps: str, tool_name: str) -> dict | None:
    length = len(reason) if reason else 0
    if not reason or length < 10 or length > 500:
        return _validation_error(
            "Invalid Reason Length",
            f"reason must be between 10 and 500 characters. Received: {length} characters",
            next_steps,
            tool_name,
        )
    return None


# ---------------------------------------------------------------------------
# Response meta (sharedUtils.js: createResponseMeta / generateEtag)
# ---------------------------------------------------------------------------


def _generate_etag(data: Any) -> str:
    content = json.dumps(data, default=str, sort_keys=True)
    return f'"{int(time.time() * 1000)}-{len(content)}"'


def _response_meta(
    etag_data: Any,
    *,
    timestamp: str | None = None,
    next_steps: str | None = None,
    include_paging: bool = False,
    next_cursor: str | None = None,
    has_more: bool = False,
) -> dict:
    meta: dict[str, Any] = {
        "etag": _generate_etag(etag_data),
        "last_modified": timestamp or iso_now(),
        "from_cache": False,
        "rate_limit": None,
        "next_steps": next_steps,
    }
    if include_paging:
        meta["paging"] = {"next_cursor": next_cursor, "has_more": has_more}
    return meta


def _check_idempotency(idempotency_key: str) -> dict | None:
    existing = _ACTIONS.get(idempotency_key)
    if existing is None:
        return None
    result = dict(existing["result"])
    meta = dict(result.get("meta") or {})
    meta.update(
        {
            "from_cache": True,
            "idempotent_response": True,
            "original_timestamp": existing["timestamp"],
        }
    )
    result["meta"] = meta
    return result


def _store_action(idempotency_key: str, timestamp: str, result: dict) -> None:
    _ACTIONS[idempotency_key] = {"timestamp": timestamp, "result": result}


# ---------------------------------------------------------------------------
# getCarrierStatus (carrierStatus.js)
# ---------------------------------------------------------------------------


@tool(name="getCarrierStatus")
def get_carrier_status(order_id: str, meta: dict[str, Any] | None = None) -> dict:
    """Retrieve current carrier status and delivery exception details for an order.

    Args:
        order_id: Order ID to query - format: one letter followed by 3-6 digits.
        meta: Optional metadata for read operations (request_id, if_none_match, cache_control).
    """
    error = _validate_order_id(order_id, "getCarrierStatus")
    if error:
        return error

    order = _get_order(order_id)
    if order is None:
        return _not_found_error(
            "Order Not Found",
            f"Order {order_id} does not exist in the system. System status: operational.",
            "Verify the order ID format and ensure it exists in the system. "
            "Check that the order ID follows the pattern: one letter + 3-6 digits (e.g., B456). "
            "Check if the order was recently created and may not be in the system yet. "
            "Verify the order exists in the customer portal. "
            "Contact customer service if the order should exist.",
            "getCarrierStatus",
        )

    carrier = order["carrier"]
    business_result = {
        "order_id": order_id,
        "carrier": {
            "name": carrier["name"],
            "tracking_number": carrier["trackingNumber"],
            "status": carrier["currentStatus"],
            "exception_note": carrier["exceptionNote"],
            "last_update": carrier["lastUpdate"],
            "attempts_remaining": carrier["attemptsRemaining"],
        },
    }
    return {
        **business_result,
        "meta": _response_meta(business_result, next_steps="Carrier status retrieved successfully"),
    }


# ---------------------------------------------------------------------------
# getPackageContents (packageContents.js)
# ---------------------------------------------------------------------------


@tool(name="getPackageContents")
def get_package_contents(order_id: str, meta: dict[str, Any] | None = None) -> dict:
    """Retrieve package contents and safety classifications (hazmat, perishable, refrigeration).

    Args:
        order_id: Order ID to query - format: one letter followed by 3-6 digits.
        meta: Optional metadata for read operations (request_id, if_none_match, cache_control).
    """
    error = _validate_order_id(order_id, "getPackageContents")
    if error:
        return error

    order = _get_order(order_id)
    if order is None:
        return _not_found_error(
            "Package Not Found",
            f"Package data for order {order_id} does not exist in the system",
            "Verify the order ID and ensure the package exists in the system",
            "getPackageContents",
        )

    package = order["package"]
    contents = package["contents"]
    requires_refrigeration = any(bool(item.get("requiresRefrigeration")) for item in contents)

    business_result = {
        "order_id": order_id,
        "contents": contents,
        "classification": {
            "is_perishable": package["isPerishable"],
            "is_hazmat": package["isHazmat"],
            "requires_refrigeration": requires_refrigeration,
        },
        "physical_properties": {
            "weight": {"value": package["weight"], "unit": "kg"},
            "declared_value": {"amount": package["declared_value"], "currency": "USD"},
        },
    }
    return {
        **business_result,
        "meta": _response_meta(
            business_result, next_steps="Package contents retrieved successfully"
        ),
    }


# ---------------------------------------------------------------------------
# getCustomerTier (customerTier.js)
# ---------------------------------------------------------------------------


@tool(name="getCustomerTier")
def get_customer_tier(order_id: str, meta: dict[str, Any] | None = None) -> dict:
    """Retrieve customer tier (VIP, premium, standard) and account value.

    Args:
        order_id: Order ID to query - format: one letter followed by 3-6 digits.
        meta: Optional metadata for read operations (request_id, if_none_match, cache_control).
    """
    error = _validate_order_id(order_id, "getCustomerTier")
    if error:
        return error

    order = _get_order(order_id)
    if order is None:
        return _not_found_error(
            "Order Not Found",
            f"Order {order_id} does not exist in the system",
            "Verify the order ID and ensure it exists in the system",
            "getCustomerTier",
        )

    customer = order.get("customer")
    if not customer:
        return _not_found_error(
            "Customer Data Not Found",
            f"Customer data not found for order {order_id}",
            "Contact support to resolve customer data inconsistency",
            "getCustomerTier",
        )

    business_result = {
        "order_id": order_id,
        "customer": {
            "customer_id": customer["customerId"],
            "name": customer["name"],
            "tier": customer["tier"],
            "account_value": {"amount": customer["accountValue"], "currency": "USD"},
            "satisfaction_score": customer["satisfactionScore"],
            "member_since": customer["joinDate"],
        },
    }
    return {
        **business_result,
        "meta": _response_meta(
            business_result, next_steps="Customer tier information retrieved successfully"
        ),
    }


# ---------------------------------------------------------------------------
# getSLA (slaInfo.js)
# ---------------------------------------------------------------------------


@tool(name="getSLA")
def get_sla(order_id: str, meta: dict[str, Any] | None = None) -> dict:
    """Retrieve SLA deadlines, delivery promises, and penalty costs for missed deliveries.

    Args:
        order_id: Order ID to query - format: one letter followed by 3-6 digits.
        meta: Optional metadata for read operations (request_id, if_none_match, cache_control).
    """
    error = _validate_order_id(order_id, "getSLA")
    if error:
        return error

    order = _get_order(order_id)
    if order is None:
        return _not_found_error(
            "SLA Data Not Found",
            f"SLA information for order {order_id} does not exist in the system",
            "Verify the order ID and ensure SLA data exists in the system",
            "getSLA",
        )

    sla = order["sla"]
    business_result = {
        "order_id": order_id,
        "sla": {
            "tier": sla["tier"],
            "promised_delivery_by": sla["promisedDeliveryBy"],
            "hours_until_deadline": sla["hoursUntilDeadline"],
            "status": sla["currentStatus"],
            "penalty": {"amount_per_day": sla["penaltyPerDay"], "currency": "USD"},
        },
    }
    return {
        **business_result,
        "meta": _response_meta(
            business_result, next_steps="SLA information retrieved successfully"
        ),
    }


# ---------------------------------------------------------------------------
# getExpediteQuote (expediteQuote.js)
# ---------------------------------------------------------------------------

_EXPEDITE_QUOTES: dict[str, dict[str, Any]] = {
    "overnight": {
        "cost": 47,
        "eta": "2025-10-01T18:00:00Z",
        "carrier": "PremiumAir",
        "service": "Next-Flight-Out",
    },
    "same_day": {
        "cost": 95,
        "eta": "2025-09-30T15:00:00Z",
        "carrier": "PremiumAir",
        "service": "Rush-Direct",
    },
}


@tool(name="getExpediteQuote")
def get_expedite_quote(
    order_id: str, speed: Literal["overnight", "same_day"], meta: dict[str, Any] | None = None
) -> dict:
    """Get pricing and delivery estimates for overnight or same-day expedited shipping.

    Args:
        order_id: Order ID to query - format: one letter followed by 3-6 digits.
        speed: Expedite speed option.
        meta: Optional metadata for read operations (request_id, if_none_match, cache_control).
    """
    error = _validate_order_id(order_id, "getExpediteQuote")
    if error:
        return error

    if speed not in _EXPEDITE_QUOTES:
        return _validation_error(
            "Invalid Speed Option",
            f"speed must be either 'overnight' or 'same_day'. Received: {speed}",
            'Provide speed as either "overnight" or "same_day"',
            "getExpediteQuote",
        )

    order = _get_order(order_id)
    if order is None:
        return _order_not_found(order_id, "getExpediteQuote")

    quote = _EXPEDITE_QUOTES[speed]
    business_result = {
        "order_id": order_id,
        "quote": {
            "speed": speed,
            "cost": {"amount": quote["cost"], "currency": "USD"},
            "eta": quote["eta"],
            "carrier": {"name": quote["carrier"], "service": quote["service"]},
            "features": {
                "temperature_controlled": True,
                "tracking_enabled": True,
                "signature_required": True,
            },
        },
    }
    return {
        **business_result,
        "meta": _response_meta(business_result, next_steps="Expedite quote retrieved successfully"),
    }


# ---------------------------------------------------------------------------
# listOrders (listOrders.js)
# ---------------------------------------------------------------------------

_MOCK_ORDERS: list[dict[str, Any]] = [
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
    },
    {
        "order_id": "A123",
        "status": "delivery_exception",
        "customer_tier": "standard",
        "has_hazmat": True,
        "is_perishable": False,
        "sla_at_risk": False,
        "exception_note": "Hazmat package - requires special handling",
        "created_date": "2025-09-30",
        "carrier": "SafetyFirst",
    },
    {
        "order_id": "C789",
        "status": "in_transit",
        "customer_tier": "premium",
        "has_hazmat": False,
        "is_perishable": True,
        "sla_at_risk": True,
        "exception_note": None,
        "created_date": "2025-09-29",
        "carrier": "FastTrack",
    },
    {
        "order_id": "D999",
        "status": "held",
        # NOTE: upstream JS source (listOrders.js line 42) has a corrupted
        # property key, `r_tier: 'vip'`, instead of `customer_tier: 'vip'`
        # for this entry -- reproduced here as a missing customer_tier so
        # filtering behavior matches the legacy handler exactly.
        "customer_tier": None,
        "has_hazmat": True,
        "is_perishable": False,
        "sla_at_risk": False,
        "exception_note": "Held for pickup - hazmat restrictions",
        "created_date": "2025-09-29",
        "carrier": "SafetyFirst",
    },
    {
        "order_id": "E555",
        "status": "expedited",
        "customer_tier": "premium",
        "has_hazmat": False,
        "is_perishable": True,
        "sla_at_risk": False,
        "exception_note": "Expedited due to temperature concerns",
        "created_date": "2025-09-30",
        "carrier": "PriorityAir",
    },
    {
        "order_id": "F111",
        "status": "delivery_exception",
        "customer_tier": "standard",
        "has_hazmat": False,
        "is_perishable": False,
        "sla_at_risk": False,
        "exception_note": "Address not found - customer contacted",
        "created_date": "2025-09-30",
        "carrier": "StandardShip",
    },
    {
        "order_id": "G222",
        "status": "delivered",
        "customer_tier": "vip",
        "has_hazmat": False,
        "is_perishable": False,
        "sla_at_risk": False,
        "exception_note": None,
        "created_date": "2025-09-29",
        "carrier": "RegionalExpress",
    },
]


_SIMPLE_FILTER_FIELDS = ("status", "customer_tier", "has_hazmat", "is_perishable", "sla_at_risk")


def _apply_filters(
    orders: list[dict[str, Any]], filters: dict[str, Any] | None
) -> list[dict[str, Any]]:
    if not filters:
        return list(orders)

    def matches(order: dict[str, Any]) -> bool:
        for field in _SIMPLE_FILTER_FIELDS:
            wanted = filters.get(field)
            if wanted is not None and order.get(field) != wanted:
                return False

        date_range = filters.get("date_range")
        if date_range:
            order_date = order["created_date"]
            start = date_range.get("start")
            if start and order_date < start:
                return False
            end = date_range.get("end")
            if end and order_date > end:
                return False
        return True

    return [order for order in orders if matches(order)]


def _encode_cursor(offset: int) -> str:
    payload = json.dumps({"offset": offset}, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(payload).decode("ascii")


def _decode_cursor(cursor: str) -> int:
    try:
        decoded = json.loads(base64.b64decode(cursor))
        return int(decoded.get("offset", 0))
    except Exception:
        return 0


def _paginate(
    orders: list[dict[str, Any]], paging: dict[str, Any] | None
) -> tuple[list[dict[str, Any]], str | None, bool]:
    if not paging:
        page = orders[:20]
        has_more = len(orders) > 20
        return page, (_encode_cursor(20) if has_more else None), has_more

    limit = paging.get("limit") or 20
    offset = _decode_cursor(paging["cursor"]) if paging.get("cursor") else 0

    page = orders[offset : offset + limit]
    has_more = len(orders) > offset + limit
    next_cursor = _encode_cursor(offset + limit) if has_more else None
    return page, next_cursor, has_more


@tool(name="listOrders")
def list_orders(filters: dict[str, Any] | None = None, meta: dict[str, Any] | None = None) -> dict:
    """List orders with delivery exceptions or specific status filters, with pagination.

    Args:
        filters: Optional filters to narrow the order list (status, customer_tier, has_hazmat,
            is_perishable, sla_at_risk, date_range).
        meta: Optional metadata for list operations (request_id, if_none_match, cache_control,
            paging).
    """
    filtered = _apply_filters(_MOCK_ORDERS, filters)
    paging = (meta or {}).get("paging")
    page, next_cursor, has_more = _paginate(filtered, paging)

    business_result = {
        "orders": page,
        "total_count": len(filtered),
        "filters_applied": filters or {},
    }
    tail = "Use next_cursor for additional results." if has_more else "All results returned."
    next_steps = f"Found {len(filtered)} orders matching criteria. {tail}"

    return {
        **business_result,
        "meta": _response_meta(
            {"orders": page, "filters": filters},
            next_steps=next_steps,
            include_paging=True,
            next_cursor=next_cursor,
            has_more=has_more,
        ),
    }


# ---------------------------------------------------------------------------
# expediteShipment (expediteShipment.js)
# ---------------------------------------------------------------------------


@tool(name="expediteShipment")
def expedite_shipment(
    order_id: str,
    speed: Literal["overnight", "same_day"],
    reason: str,
    meta: dict[str, Any],
) -> dict:
    """Execute expedited overnight or same-day shipping to meet SLA commitments.

    Args:
        order_id: Order ID to expedite - format: one letter followed by 3-6 digits.
        speed: Expedite speed option - overnight for next business day, same_day for within hours.
        reason: Brief justification for expediting (10-500 characters).
        meta: Required metadata for write operations (idempotency_key, request_id).
    """
    error = _validate_order_id(order_id, "expediteShipment")
    if error:
        return error

    error = _validate_write_meta(meta, "expediteShipment", "exp_b456_001")
    if error:
        return error

    if speed not in _EXPEDITE_QUOTES:
        return _validation_error(
            "Invalid Speed Option",
            f"speed must be either 'overnight' or 'same_day'. Received: {speed}",
            'Use either "overnight" for next business day or "same_day" for within hours',
            "expediteShipment",
        )

    error = _validate_reason(
        reason,
        "Provide a brief justification between 10-500 characters explaining why expediting "
        "is needed",
        "expediteShipment",
    )
    if error:
        return error

    idempotency_key = meta["idempotency_key"]
    cached = _check_idempotency(idempotency_key)
    if cached is not None:
        return cached

    order = _get_order(order_id)
    if order is None:
        return _order_not_found(order_id, "expediteShipment")

    action_id = generate_id("EXP")
    timestamp = iso_now()
    quote = _EXPEDITE_QUOTES[speed]
    tracking_suffix = str(int(time.time() * 1000))[-8:]
    speed_code = "OVN" if speed == "overnight" else "SD"
    new_tracking_number = f"PA-{speed_code}-{quote['carrier']}-{tracking_suffix}"

    business_result = {
        "success": True,
        "action_id": action_id,
        "order_id": order_id,
        "shipping_details": {
            "new_tracking_number": new_tracking_number,
            "new_carrier": quote["carrier"],
            "new_eta": quote["eta"],
            "cost": {"amount": quote["cost"], "currency": "USD"},
            "temperature_controlled": True,
        },
        "confirmation": f"Expedited {speed} shipping confirmed",
        "next_steps": [
            "Package will be picked up within 1 hour",
            "Customer will receive tracking update",
            "Temperature monitoring enabled",
        ],
    }
    response = {
        **business_result,
        "meta": _response_meta(
            {"actionId": action_id, "order_id": order_id, "timestamp": timestamp},
            timestamp=timestamp,
            next_steps="Expedited shipping action completed successfully",
        ),
    }
    _store_action(idempotency_key, timestamp, response)
    return response


# ---------------------------------------------------------------------------
# holdForPickup (holdForPickup.js)
# ---------------------------------------------------------------------------


@tool(name="holdForPickup")
def hold_for_pickup(order_id: str, reason: str, meta: dict[str, Any]) -> dict:
    """Place order on hold at carrier facility for customer pickup.

    Args:
        order_id: Order ID to hold - format: one letter followed by 3-6 digits.
        reason: Brief justification for holding (10-500 characters).
        meta: Required metadata for write operations (idempotency_key, request_id).
    """
    error = _validate_order_id(order_id, "holdForPickup")
    if error:
        return error

    error = _validate_write_meta(meta, "holdForPickup", "hold_b456_001")
    if error:
        return error

    error = _validate_reason(
        reason,
        "Provide a brief justification between 10-500 characters explaining why holding is needed",
        "holdForPickup",
    )
    if error:
        return error

    idempotency_key = meta["idempotency_key"]
    cached = _check_idempotency(idempotency_key)
    if cached is not None:
        return cached

    order = _get_order(order_id)
    if order is None:
        return _order_not_found(order_id, "holdForPickup")

    action_id = generate_id("HOLD")
    timestamp = iso_now()
    pickup_code = f"P{str(int(time.time() * 1000))[-6:]}"

    business_result = {
        "success": True,
        "action_id": action_id,
        "order_id": order_id,
        "status": "held_for_pickup",
        "facility_information": {
            "pickup_location": "RegionalExpress Depot - 1547 Commerce Dr, Springfield, OR",
            "pickup_hours": "8am-8pm daily",
            "pickup_code": pickup_code,
            "phone_number": "(555) 123-4567",
            "special_instructions": "Bring valid ID and pickup code",
        },
        "pickup_instructions": [
            "Visit the pickup location during business hours",
            "Provide pickup code and valid identification",
            "Package will be held for 5 business days",
            "Contact facility if you need assistance",
        ],
        "confirmation": "Order held for pickup, customer notified",
        "expiration_date": iso_offset(timedelta(days=5)),
        "next_steps": [
            "Customer notification sent via email and SMS",
            "Package secured at pickup facility",
            "Pickup reminder will be sent in 3 days if not collected",
        ],
    }
    response = {
        **business_result,
        "meta": _response_meta(
            {"actionId": action_id, "order_id": order_id, "timestamp": timestamp},
            timestamp=timestamp,
            next_steps="Hold for pickup action completed successfully",
        ),
    }
    _store_action(idempotency_key, timestamp, response)
    return response


# ---------------------------------------------------------------------------
# escalateToManager (escalateToManager.js)
# ---------------------------------------------------------------------------

_ESCALATION_RESPONSE_TIME = {"high": "30 minutes", "medium": "2 hours", "low": "4 hours"}
_ESCALATION_MANAGER = {
    "high": "Senior Manager - Sarah Chen",
    "medium": "Operations Manager - Mike Rodriguez",
    "low": "Supervisor - Alex Johnson",
}
_ESCALATION_QUEUE_POSITION = {"high": 1, "medium": 3, "low": 7}


@tool(name="escalateToManager")
def escalate_to_manager(
    order_id: str,
    reason: str,
    meta: dict[str, Any],
    urgency: Literal["low", "medium", "high"] = "medium",
) -> dict:
    """Escalate complex or high-risk delivery decisions to a human manager for review.

    Args:
        order_id: Order ID to escalate - format: one letter followed by 3-6 digits.
        reason: Why this requires human judgment (10-500 characters).
        meta: Required metadata for write operations (idempotency_key, request_id).
        urgency: Urgency level for manager review - low: routine, medium: time-sensitive,
            high: critical.
    """
    error = _validate_order_id(order_id, "escalateToManager")
    if error:
        return error

    error = _validate_write_meta(meta, "escalateToManager", "esc_b456_001")
    if error:
        return error

    if urgency not in _ESCALATION_RESPONSE_TIME:
        return _validation_error(
            "Invalid Urgency Level",
            f"urgency must be one of: low, medium, high. Received: {urgency}",
            'Use "low" for routine, "medium" for time-sensitive, or "high" for critical situations',
            "escalateToManager",
        )

    error = _validate_reason(
        reason,
        "Provide a detailed explanation between 10-500 characters of why human judgment is needed",
        "escalateToManager",
    )
    if error:
        return error

    idempotency_key = meta["idempotency_key"]
    cached = _check_idempotency(idempotency_key)
    if cached is not None:
        return cached

    order = _get_order(order_id)
    if order is None:
        return _order_not_found(order_id, "escalateToManager")

    action_id = generate_id("ESC")
    timestamp = iso_now()
    expected_response_time = _ESCALATION_RESPONSE_TIME[urgency]
    assigned_manager = _ESCALATION_MANAGER[urgency]

    business_result = {
        "success": True,
        "action_id": action_id,
        "order_id": order_id,
        "escalation_tracking": {
            "ticket_id": f"TICKET-{action_id}",
            "status": "escalated",
            "urgency_level": urgency,
            "assigned_manager": assigned_manager,
            "queue_position": _ESCALATION_QUEUE_POSITION[urgency],
            "expected_response_time": expected_response_time,
        },
        "manager_assignment": {
            "name": assigned_manager,
            "contact_method": "Internal escalation system",
            "notification_sent": True,
            "escalation_time": timestamp,
        },
        "confirmation": "Escalated to management for review",
        "next_steps": [
            f"Manager will review within {expected_response_time}",
            "You will receive notification when manager responds",
            "Order processing is paused pending manager decision",
            "Customer will be notified of any delays if resolution takes longer than expected",
        ],
    }
    response = {
        **business_result,
        "meta": _response_meta(
            {"actionId": action_id, "order_id": order_id, "timestamp": timestamp},
            timestamp=timestamp,
            next_steps="Escalation to manager completed successfully",
        ),
    }
    _store_action(idempotency_key, timestamp, response)
    return response


# ---------------------------------------------------------------------------
# noActionRequired (noActionRequired.js)
# ---------------------------------------------------------------------------


@tool(name="noActionRequired")
def no_action_required(order_id: str, reason: str, meta: dict[str, Any]) -> dict:
    """Document that standard delivery process should continue without intervention.

    Args:
        order_id: Order ID - format: one letter followed by 3-6 digits.
        reason: Why no action is appropriate (10-500 characters).
        meta: Required metadata for write operations (idempotency_key, request_id).
    """
    error = _validate_order_id(order_id, "noActionRequired")
    if error:
        return error

    error = _validate_write_meta(meta, "noActionRequired", "no_action_b456_001")
    if error:
        return error

    error = _validate_reason(
        reason,
        "Provide a clear explanation between 10-500 characters of why no action is needed",
        "noActionRequired",
    )
    if error:
        return error

    idempotency_key = meta["idempotency_key"]
    cached = _check_idempotency(idempotency_key)
    if cached is not None:
        return cached

    order = _get_order(order_id)
    if order is None:
        return _order_not_found(order_id, "noActionRequired")

    action_id = generate_id("NONE")
    timestamp = iso_now()
    next_review_at = iso_offset(timedelta(hours=4))

    business_result = {
        "success": True,
        "action_id": action_id,
        "order_id": order_id,
        "status": "monitoring",
        "documentation_confirmation": {
            "decision_recorded": True,
            "reasoning": reason,
            "decision_time": timestamp,
            "review_scheduled": True,
            "next_review_at": next_review_at,
        },
        "audit_trail": {
            "decision_maker": "Automated Triage System",
            "decision_basis": "Priority directive analysis completed",
            "confidence_level": "high",
            "review_required": False,
        },
        "confirmation": "No action taken, continuing standard delivery process",
        "next_steps": [
            "Order continues through standard delivery process",
            "System will monitor for status changes",
            f"Automatic review scheduled for {next_review_at}",
            "Customer will receive normal delivery updates",
        ],
    }
    response = {
        **business_result,
        "meta": _response_meta(
            {"actionId": action_id, "order_id": order_id, "timestamp": timestamp},
            timestamp=timestamp,
            next_steps="No action decision documented successfully",
        ),
    }
    _store_action(idempotency_key, timestamp, response)
    return response
