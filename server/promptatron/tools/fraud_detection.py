"""Strands `@tool` port of the legacy JS fraud-detection scenario handlers.

Source (read-only reference during the port):
    app/src/scenarios/fraud-detection/scenario.json          (tool defs)
    app/src/scenarios/fraud-detection/tools/*.js              (handlers)

Behavior notes / deviations from the JS source
-----------------------------------------------
* None of the four legacy handlers (``createAlert.js``, ``flagTransaction.js``,
  ``freezeAccount.js``, ``updateRisk.js``) perform explicit input validation --
  they trust the caller (the LLM tool-calling layer) to already respect the
  JSON Schema in scenario.json (patterns, enums, minLength, minItems). This
  port preserves that: there is no hand-rolled validation here either, only
  the JSON-schema-shaped surface Strands derives from the type hints below.
* The JS handlers persisted every request to an IndexedDB-backed
  ``HandlerUtils`` store (accounts/transactions/alerts), but *none* of that
  stored data ever flows back into a response -- with exactly one exception:
  ``updateRiskProfile`` reads the account's previously-stored ``risk_level``
  to compute ``previous_risk_level`` / ``risk_change``. That is the only
  place where cross-call state actually matters, so it is the only place we
  keep an in-memory store here (``_ACCOUNT_RISK``, a trivial module-level
  dict). Everything else in ``freezeAccount``, ``flagTransaction`` and
  ``createAlert`` (e.g. ``updateAccountRiskFromTransaction`` in
  flagTransaction.js) mutated storage that no handler ever reads back, so it
  is dropped entirely as dead state.
* Momento caching and rate limiting were never used by these four handlers
  in the first place (that machinery lives only in the shipping-logistics
  scenario's sharedUtils.js), so dropping it here changes nothing.
* IDs and timestamps are generated the same way as the JS
  (``HandlerUtils.generateId`` / ``new Date().toISOString()``); see
  ``promptatron.tools._common``.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Literal

from strands import tool

from promptatron.tools._common import generate_id, iso_now, iso_offset

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

# The only piece of cross-call state that actually affects a response: the
# most recently set risk_level per account, read by update_risk_profile to
# compute previous_risk_level / risk_change. Mirrors the one observable use
# of HandlerUtils' storage across these four handlers.
_ACCOUNT_RISK: dict[str, str] = {}

FraudIndicator = Literal[
    "unusual_amount",
    "unusual_location",
    "unusual_time",
    "velocity_check_failed",
    "merchant_risk",
    "device_fingerprint_mismatch",
    "behavioral_anomaly",
    "blacklist_match",
]

RiskFactor = Literal[
    "high_velocity_transactions",
    "unusual_geographic_activity",
    "new_device_usage",
    "behavioral_changes",
    "merchant_category_changes",
    "time_pattern_changes",
    "amount_pattern_changes",
]


# ---------------------------------------------------------------------------
# freeze_account (freezeAccount.js)
# ---------------------------------------------------------------------------

_RESOLUTION_TIMES: dict[str, dict[str, str]] = {
    "low": {"temporary": "2-4 hours", "pending_review": "1-2 days", "permanent": "5-7 days"},
    "medium": {"temporary": "1-2 hours", "pending_review": "4-8 hours", "permanent": "3-5 days"},
    "high": {"temporary": "30-60 minutes", "pending_review": "2-4 hours", "permanent": "1-3 days"},
    "critical": {
        "temporary": "15-30 minutes",
        "pending_review": "1-2 hours",
        "permanent": "24-48 hours",
    },
}


def _estimated_resolution_time(severity: str, duration: str) -> str:
    return _RESOLUTION_TIMES.get(severity, {}).get(duration, "2-4 hours")


def _freeze_next_steps(severity: str, duration: str) -> list[str]:
    if severity == "critical":
        return [
            "Immediate investigation required",
            "Contact fraud team",
            "Review all recent transactions",
        ]
    if duration == "permanent":
        return ["Legal review required", "Customer notification", "Account closure process"]
    return ["Monitor account activity", "Review in 24 hours", "Customer may contact support"]


@tool(name="freeze_account")
def freeze_account(
    account_id: str,
    transaction_ids: list[str],
    reason: str,
    severity: Literal["low", "medium", "high", "critical"],
    freeze_duration: Literal["temporary", "pending_review", "permanent"],
    notify_customer: bool = True,
) -> dict:
    """Immediately freeze an account to prevent further transactions due to suspected fraud.

    Args:
        account_id: Account ID in format A1234.
        transaction_ids: List of suspicious transaction IDs that triggered this action.
        reason: Detailed reason for account freeze including specific fraud indicators.
        severity: Severity level of the suspected fraud.
        freeze_duration: Duration type for the account freeze.
        notify_customer: Whether to notify the customer about the account freeze.
    """
    freeze_timestamp = iso_now()

    return {
        "success": True,
        "account_id": account_id,
        "freeze_id": generate_id("FREEZE"),
        "status": "frozen",
        "freeze_timestamp": freeze_timestamp,
        "affected_transactions": len(transaction_ids),
        "notification_sent": notify_customer,
        "estimated_resolution_time": _estimated_resolution_time(severity, freeze_duration),
        "next_steps": _freeze_next_steps(severity, freeze_duration),
        "compliance_reference": generate_id("COMP"),
    }


# ---------------------------------------------------------------------------
# flag_suspicious_transaction (flagTransaction.js)
# ---------------------------------------------------------------------------


def _risk_level(score: float) -> str:
    if score >= 90:
        return "critical"
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _review_priority(risk_score: float, confidence: str) -> str:
    if risk_score >= 80 and confidence == "high":
        return "urgent"
    if risk_score >= 60 and confidence != "low":
        return "high"
    if risk_score >= 40:
        return "medium"
    return "low"


_REVIEW_TIMES: dict[str, dict[str, str]] = {
    "high": {
        "monitor": "24 hours",
        "review": "4 hours",
        "block": "1 hour",
        "verify_with_customer": "2 hours",
    },
    "medium": {
        "monitor": "48 hours",
        "review": "8 hours",
        "block": "2 hours",
        "verify_with_customer": "4 hours",
    },
    "low": {
        "monitor": "72 hours",
        "review": "24 hours",
        "block": "4 hours",
        "verify_with_customer": "8 hours",
    },
}


def _estimated_review_time(confidence: str, action: str) -> str:
    return _REVIEW_TIMES.get(confidence, {}).get(action, "24 hours")


@tool(name="flag_suspicious_transaction")
def flag_suspicious_transaction(
    transaction_id: str,
    account_id: str,
    fraud_indicators: list[FraudIndicator],
    risk_score: float,
    confidence_level: Literal["low", "medium", "high"],
    recommended_action: Literal["monitor", "review", "block", "verify_with_customer"],
    notes: str = "",
) -> dict:
    """Flag an individual transaction for review without freezing the entire account.

    Args:
        transaction_id: Transaction ID in format T1234.
        account_id: Associated account ID in format A1234.
        fraud_indicators: Specific fraud indicators detected in this transaction.
        risk_score: Calculated risk score for this transaction (0-100).
        confidence_level: Confidence level in the fraud detection.
        recommended_action: Recommended action for this transaction.
        notes: Additional notes about the suspicious activity.
    """
    flag_timestamp = iso_now()

    return {
        "success": True,
        "transaction_id": transaction_id,
        "flag_id": generate_id("FLAG"),
        "status": "flagged",
        "flag_timestamp": flag_timestamp,
        "risk_assessment": {
            "score": risk_score,
            "level": _risk_level(risk_score),
            "confidence": confidence_level,
            "indicators": fraud_indicators,
        },
        "recommended_action": recommended_action,
        "review_priority": _review_priority(risk_score, confidence_level),
        "estimated_review_time": _estimated_review_time(confidence_level, recommended_action),
    }


# ---------------------------------------------------------------------------
# create_fraud_alert (createAlert.js)
# ---------------------------------------------------------------------------

_RESOLUTION_DEADLINE_HOURS: dict[str, int] = {"critical": 4, "high": 24, "medium": 72, "low": 168}

_INVESTIGATION_TEAMS: dict[str, str] = {
    "account_takeover": "Identity Fraud Team",
    "identity_theft": "Identity Fraud Team",
    "card_testing": "Payment Fraud Team",
    "money_laundering": "AML Investigation Team",
    "organized_fraud": "Complex Fraud Team",
    "synthetic_identity": "Identity Fraud Team",
}


def _estimated_impact(loss: float, account_count: int) -> str:
    if loss > 100000 or account_count > 50:
        return "high"
    if loss > 10000 or account_count > 10:
        return "medium"
    return "low"


def _investigation_team(alert_type: str, priority: str) -> str:
    team = _INVESTIGATION_TEAMS.get(alert_type, "General Fraud Team")
    return f"Senior {team}" if priority == "critical" else team


@tool(name="create_fraud_alert")
def create_fraud_alert(
    alert_type: Literal[
        "account_takeover",
        "identity_theft",
        "card_testing",
        "money_laundering",
        "organized_fraud",
        "synthetic_identity",
    ],
    affected_accounts: list[str],
    priority: Literal["low", "medium", "high", "critical"],
    description: str,
    related_transactions: list[str] | None = None,
    estimated_loss: float = 0,
    investigation_notes: str = "",
) -> dict:
    """Create a fraud alert for patterns requiring immediate investigation-team attention.

    Args:
        alert_type: Type of fraud pattern detected.
        affected_accounts: List of accounts involved in the fraud pattern.
        priority: Priority level for investigation.
        description: Detailed description of the fraud pattern and evidence.
        related_transactions: List of transactions related to this fraud pattern.
        estimated_loss: Estimated financial loss in USD.
        investigation_notes: Initial investigation notes and recommended next steps.
    """
    related = related_transactions or []
    alert_id = generate_id("ALERT")
    created_at = iso_now()
    hours = _RESOLUTION_DEADLINE_HOURS.get(priority, 72)

    return {
        "success": True,
        "alert_id": alert_id,
        "status": "created",
        "created_timestamp": created_at,
        "affected_accounts_count": len(affected_accounts),
        "related_transactions_count": len(related),
        "priority_level": priority,
        "estimated_impact": _estimated_impact(estimated_loss, len(affected_accounts)),
        "resolution_deadline": iso_offset(timedelta(hours=hours)),
        "investigation_team": _investigation_team(alert_type, priority),
        "case_reference": f"CASE_{alert_id}",
    }


# ---------------------------------------------------------------------------
# update_risk_profile (updateRisk.js)
# ---------------------------------------------------------------------------

_RISK_LEVELS = ("very_low", "low", "medium", "high", "very_high")

_RECOMMENDED_ACTIONS: dict[str, list[str]] = {
    "very_high": [
        "Immediate review required",
        "Consider account restrictions",
        "Enhanced monitoring",
    ],
    "high": [
        "Increase monitoring frequency",
        "Review recent transactions",
        "Customer verification",
    ],
    "medium": ["Standard monitoring", "Periodic review", "Watch for patterns"],
    "low": ["Routine monitoring", "Quarterly review"],
    "very_low": ["Minimal monitoring", "Annual review"],
}

_MONITORING_FREQUENCIES: dict[str, str] = {
    "intensive": "Real-time monitoring with immediate alerts",
    "enhanced": "Hourly monitoring with daily reports",
    "standard": "Daily monitoring with weekly reports",
}

_REVIEW_SCHEDULES: dict[str, str] = {
    "very_high": "Weekly review required",
    "high": "Bi-weekly review required",
    "medium": "Monthly review required",
    "low": "Quarterly review required",
    "very_low": "Annual review required",
}


def _risk_change(previous_level: str, new_level: str) -> str:
    prev_index = _RISK_LEVELS.index(previous_level) if previous_level in _RISK_LEVELS else -1
    new_index = _RISK_LEVELS.index(new_level) if new_level in _RISK_LEVELS else -1
    if new_index > prev_index:
        return "increased"
    if new_index < prev_index:
        return "decreased"
    return "unchanged"


def _recommended_actions(risk_level: str) -> list[str]:
    return _RECOMMENDED_ACTIONS.get(risk_level, _RECOMMENDED_ACTIONS["medium"])


def _monitoring_frequency(monitoring_level: str) -> str:
    return _MONITORING_FREQUENCIES.get(monitoring_level, _MONITORING_FREQUENCIES["standard"])


def _review_schedule(risk_level: str, valid_until: str | None) -> str:
    base = _REVIEW_SCHEDULES.get(risk_level, _REVIEW_SCHEDULES["medium"])
    if valid_until:
        return f"{base} (expires {valid_until})"
    return base


@tool(name="update_risk_profile")
def update_risk_profile(
    account_id: str,
    risk_level: Literal["very_low", "low", "medium", "high", "very_high"],
    risk_factors: list[RiskFactor],
    monitoring_level: Literal["standard", "enhanced", "intensive"],
    update_reason: str,
    valid_until: str | None = None,
) -> dict:
    """Update the risk profile for an account based on new information or behavioral changes.

    Args:
        account_id: Account ID to update.
        risk_level: New risk level for the account.
        risk_factors: Risk factors that influenced the profile update.
        monitoring_level: Level of monitoring required for this account.
        update_reason: Reason for updating the risk profile.
        valid_until: Date until which this risk profile is valid (YYYY-MM-DD).
    """
    previous_risk_level = _ACCOUNT_RISK.get(account_id, "medium")
    update_timestamp = iso_now()
    _ACCOUNT_RISK[account_id] = risk_level

    return {
        "success": True,
        "account_id": account_id,
        "profile_update_id": generate_id("RISK"),
        "previous_risk_level": previous_risk_level,
        "new_risk_level": risk_level,
        "risk_change": _risk_change(previous_risk_level, risk_level),
        "monitoring_level": monitoring_level,
        "update_timestamp": update_timestamp,
        "valid_until": valid_until,
        "recommended_actions": _recommended_actions(risk_level),
        "monitoring_frequency": _monitoring_frequency(monitoring_level),
        "review_schedule": _review_schedule(risk_level, valid_until),
    }
