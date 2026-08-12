"""Tests for promptatron.guardrails.schemas validation rules.

Field-level constraints (lengths, patterns, ranges) are enforced by pydantic
directly. Cross-field business rules are enforced by the standalone
`validate_business_rules` function -- not pydantic validators -- so they
never trip the JSON-serialization bug in the shared (read-only) errors.py
validation_exception_handler; see the module docstring in schemas.py.
"""

import pydantic
import pytest

from promptatron.guardrails.schemas import (
    ContentFilter,
    ContentPolicy,
    ContextualGrounding,
    GuardrailConfig,
    PiiPolicy,
    WordPolicy,
    validate_business_rules,
)


def test_guardrail_config_requires_at_least_one_policy():
    config = GuardrailConfig(name="empty-policy")
    errors = validate_business_rules(config)
    assert any("at least one policy" in e.lower() for e in errors)


def test_guardrail_config_accepts_content_policy_only():
    config = GuardrailConfig(
        name="ok", content_policy=ContentPolicy(filters=[ContentFilter(type="HATE")])
    )
    assert config.content_policy.filters[0].type == "HATE"
    assert validate_business_rules(config) == []


def test_guardrail_name_pattern_rejects_invalid_chars():
    with pytest.raises(pydantic.ValidationError):
        GuardrailConfig(
            name="bad name!",
            content_policy=ContentPolicy(filters=[ContentFilter(type="HATE")]),
        )


def test_word_policy_requires_words_or_managed_lists():
    config = GuardrailConfig(name="empty-words", word_policy=WordPolicy())
    errors = validate_business_rules(config)
    assert any("word_policy" in e for e in errors)


def test_pii_policy_requires_at_least_one_entity():
    config = GuardrailConfig(name="empty-pii", pii_policy=PiiPolicy())
    errors = validate_business_rules(config)
    assert any("pii_policy" in e for e in errors)


def test_contextual_grounding_requires_a_threshold():
    config = GuardrailConfig(name="empty-grounding", contextual_grounding=ContextualGrounding())
    errors = validate_business_rules(config)
    assert any("contextual_grounding" in e for e in errors)


def test_contextual_grounding_threshold_out_of_range_rejected():
    with pytest.raises(pydantic.ValidationError):
        ContextualGrounding(grounding_threshold=1.5)


def test_camel_case_input_accepted():
    config = GuardrailConfig.model_validate(
        {
            "name": "camel-case",
            "contentPolicy": {"filters": [{"type": "HATE", "inputStrength": "MEDIUM"}]},
        }
    )
    assert config.content_policy.filters[0].input_strength == "MEDIUM"


def test_camel_case_output_by_alias():
    config = GuardrailConfig(
        name="alias-out", content_policy=ContentPolicy(filters=[ContentFilter(type="HATE")])
    )
    dumped = config.model_dump(by_alias=True)
    assert "contentPolicy" in dumped
    assert "blockedInputMessage" in dumped
