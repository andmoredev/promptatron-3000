"""Tests for the ported fraud-detection scenario tools.

None of the four legacy JS handlers (createAlert.js, flagTransaction.js,
freezeAccount.js, updateRisk.js) perform explicit input validation -- see
the module docstring in promptatron/tools/fraud_detection.py -- so there is
no "validation error" case to reproduce here; these tests cover happy-path
shape/value parity with the JS handlers' documented computed fields instead.
"""

from __future__ import annotations

from promptatron.tools import fraud_detection as fd


class TestFreezeAccount:
    def test_happy_path(self):
        result = fd.freeze_account(
            account_id="A1234",
            transaction_ids=["T1234", "T5678"],
            reason="Multiple high-risk fraud indicators detected on this account",
            severity="high",
            freeze_duration="temporary",
        )

        assert result["success"] is True
        assert result["account_id"] == "A1234"
        assert result["status"] == "frozen"
        assert result["affected_transactions"] == 2
        assert result["notification_sent"] is True  # default notify_customer=True
        assert result["estimated_resolution_time"] == "30-60 minutes"  # high/temporary
        assert result["next_steps"] == [
            "Monitor account activity",
            "Review in 24 hours",
            "Customer may contact support",
        ]
        assert result["freeze_id"].startswith("FREEZE_")
        assert result["compliance_reference"].startswith("COMP_")
        assert set(result.keys()) == {
            "success",
            "account_id",
            "freeze_id",
            "status",
            "freeze_timestamp",
            "affected_transactions",
            "notification_sent",
            "estimated_resolution_time",
            "next_steps",
            "compliance_reference",
        }

    def test_critical_severity_next_steps(self):
        result = fd.freeze_account(
            account_id="A1234",
            transaction_ids=["T1234"],
            reason="Confirmed account takeover with fraudulent transactions",
            severity="critical",
            freeze_duration="pending_review",
            notify_customer=False,
        )

        assert result["notification_sent"] is False
        assert result["estimated_resolution_time"] == "1-2 hours"
        assert result["next_steps"] == [
            "Immediate investigation required",
            "Contact fraud team",
            "Review all recent transactions",
        ]

    def test_permanent_duration_next_steps(self):
        result = fd.freeze_account(
            account_id="A1234",
            transaction_ids=["T1234"],
            reason="Confirmed fraud requiring permanent account closure",
            severity="medium",
            freeze_duration="permanent",
        )

        assert result["next_steps"] == [
            "Legal review required",
            "Customer notification",
            "Account closure process",
        ]


class TestFlagSuspiciousTransaction:
    def test_happy_path(self):
        result = fd.flag_suspicious_transaction(
            transaction_id="T1234",
            account_id="A1234",
            fraud_indicators=["unusual_amount", "velocity_check_failed"],
            risk_score=85,
            confidence_level="high",
            recommended_action="review",
        )

        assert result["success"] is True
        assert result["transaction_id"] == "T1234"
        assert result["status"] == "flagged"
        assert result["risk_assessment"] == {
            "score": 85,
            "level": "high",
            "confidence": "high",
            "indicators": ["unusual_amount", "velocity_check_failed"],
        }
        assert result["recommended_action"] == "review"
        assert result["review_priority"] == "urgent"  # risk>=80 and confidence high
        assert result["estimated_review_time"] == "4 hours"  # high/review
        assert result["flag_id"].startswith("FLAG_")

    def test_risk_level_boundaries(self):
        assert fd.flag_suspicious_transaction(
            transaction_id="T0001",
            account_id="A0001",
            fraud_indicators=["merchant_risk"],
            risk_score=95,
            confidence_level="low",
            recommended_action="monitor",
        )["risk_assessment"]["level"] == "critical"

        assert fd.flag_suspicious_transaction(
            transaction_id="T0002",
            account_id="A0002",
            fraud_indicators=["merchant_risk"],
            risk_score=30,
            confidence_level="low",
            recommended_action="monitor",
        )["risk_assessment"]["level"] == "low"

    def test_review_priority_and_time_lookup(self):
        result = fd.flag_suspicious_transaction(
            transaction_id="T0003",
            account_id="A0003",
            fraud_indicators=["behavioral_anomaly"],
            risk_score=45,
            confidence_level="medium",
            recommended_action="verify_with_customer",
            notes="Customer contacted for verification",
        )
        assert result["review_priority"] == "medium"  # risk>=40 branch
        assert result["estimated_review_time"] == "4 hours"  # medium/verify_with_customer


class TestCreateFraudAlert:
    def test_happy_path(self):
        result = fd.create_fraud_alert(
            alert_type="account_takeover",
            affected_accounts=["A1234", "A5678"],
            priority="critical",
            description="Coordinated account takeover pattern detected across multiple accounts",
            related_transactions=["T1234"],
            estimated_loss=150000,
        )

        assert result["success"] is True
        assert result["status"] == "created"
        assert result["affected_accounts_count"] == 2
        assert result["related_transactions_count"] == 1
        assert result["priority_level"] == "critical"
        assert result["estimated_impact"] == "high"  # loss > 100000
        assert result["investigation_team"] == "Senior Identity Fraud Team"  # critical bump
        assert result["alert_id"].startswith("ALERT_")
        assert result["case_reference"] == f"CASE_{result['alert_id']}"

    def test_defaults_and_medium_impact(self):
        result = fd.create_fraud_alert(
            alert_type="card_testing",
            affected_accounts=["A0001"],
            priority="medium",
            description="Card testing pattern detected with multiple small-value authorizations",
        )

        assert result["related_transactions_count"] == 0
        assert result["estimated_impact"] == "low"  # loss=0, 1 account
        # not critical priority, so no "Senior" prefix
        assert result["investigation_team"] == "Payment Fraud Team"

    def test_unknown_alert_type_falls_back_to_general_team(self):
        # alert_type is a Literal in the tool signature, but the JS handler's
        # team lookup itself falls back to 'General Fraud Team' for any
        # unrecognized key -- exercise that fallback directly.
        from promptatron.tools.fraud_detection import _investigation_team

        assert _investigation_team("unmapped_type", "low") == "General Fraud Team"


class TestUpdateRiskProfile:
    def test_happy_path_defaults_previous_to_medium(self):
        result = fd.update_risk_profile(
            account_id="A7777",
            risk_level="high",
            risk_factors=["high_velocity_transactions", "new_device_usage"],
            monitoring_level="enhanced",
            update_reason="Elevated transaction velocity observed this week",
        )

        assert result["success"] is True
        assert result["account_id"] == "A7777"
        assert result["previous_risk_level"] == "medium"  # no prior state -> JS default
        assert result["new_risk_level"] == "high"
        assert result["risk_change"] == "increased"
        assert result["monitoring_level"] == "enhanced"
        assert result["valid_until"] is None
        assert result["recommended_actions"] == [
            "Increase monitoring frequency",
            "Review recent transactions",
            "Customer verification",
        ]
        assert result["monitoring_frequency"] == "Hourly monitoring with daily reports"
        assert result["review_schedule"] == "Bi-weekly review required"
        assert result["profile_update_id"].startswith("RISK_")
        assert "update_reason" not in result  # JS result never echoes update_reason

    def test_previous_risk_level_tracked_across_calls(self):
        fd.update_risk_profile(
            account_id="A8888",
            risk_level="low",
            risk_factors=[],
            monitoring_level="standard",
            update_reason="Initial baseline risk assessment for new account",
        )
        second = fd.update_risk_profile(
            account_id="A8888",
            risk_level="very_high",
            risk_factors=["behavioral_changes"],
            monitoring_level="intensive",
            update_reason="Severe behavioral anomaly detected in recent activity",
            valid_until="2026-12-31",
        )

        assert second["previous_risk_level"] == "low"
        assert second["risk_change"] == "increased"
        assert second["review_schedule"] == "Weekly review required (expires 2026-12-31)"

    def test_risk_change_decreased_and_unchanged(self):
        fd.update_risk_profile(
            account_id="A9090",
            risk_level="high",
            risk_factors=[],
            monitoring_level="enhanced",
            update_reason="Elevated risk following suspicious activity report",
        )
        decreased = fd.update_risk_profile(
            account_id="A9090",
            risk_level="low",
            risk_factors=[],
            monitoring_level="standard",
            update_reason="Risk factors resolved after manual investigation",
        )
        assert decreased["risk_change"] == "decreased"

        unchanged = fd.update_risk_profile(
            account_id="A9090",
            risk_level="low",
            risk_factors=[],
            monitoring_level="standard",
            update_reason="Routine reassessment confirms no change in risk profile",
        )
        assert unchanged["risk_change"] == "unchanged"
