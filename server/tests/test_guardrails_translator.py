"""Tests for promptatron.guardrails.translator: schema <-> Bedrock shape mapping.

Verifies the ported mapping tables against botocore's actual CreateGuardrail
service model (exact key names/casing) and round-trips full-featured and
minimal (single-policy) simplified configs through to_bedrock/from_bedrock.
"""

import boto3
import pytest

from promptatron.guardrails.schemas import (
    ContentFilter,
    ContentPolicy,
    ContextualGrounding,
    DeniedTopic,
    GuardrailConfig,
    PiiEntity,
    PiiPolicy,
    WordPolicy,
)
from promptatron.guardrails.translator import from_bedrock, to_bedrock

# ---------------------------------------------------------------------------
# botocore service-model ground truth
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def create_guardrail_input_shape():
    client = boto3.client("bedrock", region_name="us-east-1")
    return client.meta.service_model.operation_model("CreateGuardrail").input_shape


def test_content_filter_keys_match_service_model(create_guardrail_input_shape):
    filter_shape = create_guardrail_input_shape.members["contentPolicyConfig"].members[
        "filtersConfig"
    ].member
    config = GuardrailConfig(
        name="filter-check",
        content_policy=ContentPolicy(filters=[ContentFilter(type="HATE")]),
    )
    bedrock = to_bedrock(config)
    filter_dict = bedrock["contentPolicyConfig"]["filtersConfig"][0]
    assert set(filter_dict.keys()) <= set(filter_shape.members.keys())
    assert filter_shape.required_members == ["type", "inputStrength", "outputStrength"]
    for required in filter_shape.required_members:
        assert required in filter_dict


def test_pii_entity_keys_match_service_model(create_guardrail_input_shape):
    pii_shape = create_guardrail_input_shape.members["sensitiveInformationPolicyConfig"].members[
        "piiEntitiesConfig"
    ].member
    config = GuardrailConfig(
        name="pii-check", pii_policy=PiiPolicy(entities=[PiiEntity(type="EMAIL")])
    )
    bedrock = to_bedrock(config)
    entity_dict = bedrock["sensitiveInformationPolicyConfig"]["piiEntitiesConfig"][0]
    assert set(entity_dict.keys()) <= set(pii_shape.members.keys())
    for required in pii_shape.required_members:
        assert required in entity_dict


def test_topic_keys_match_service_model(create_guardrail_input_shape):
    topic_shape = create_guardrail_input_shape.members["topicPolicyConfig"].members[
        "topicsConfig"
    ].member
    config = GuardrailConfig(
        name="topic-check",
        denied_topics=[DeniedTopic(name="legal-advice", definition="Requests for legal advice")],
    )
    bedrock = to_bedrock(config)
    topic_dict = bedrock["topicPolicyConfig"]["topicsConfig"][0]
    assert set(topic_dict.keys()) <= set(topic_shape.members.keys())
    for required in topic_shape.required_members:
        assert required in topic_dict
    assert topic_dict["type"] == "DENY"


def test_word_and_managed_list_keys_match_service_model(create_guardrail_input_shape):
    word_shape = create_guardrail_input_shape.members["wordPolicyConfig"].members[
        "wordsConfig"
    ].member
    managed_shape = create_guardrail_input_shape.members["wordPolicyConfig"].members[
        "managedWordListsConfig"
    ].member
    config = GuardrailConfig(
        name="word-check",
        word_policy=WordPolicy(words=["badword"], managed_word_lists=["PROFANITY"]),
    )
    bedrock = to_bedrock(config)
    word_dict = bedrock["wordPolicyConfig"]["wordsConfig"][0]
    managed_dict = bedrock["wordPolicyConfig"]["managedWordListsConfig"][0]
    assert set(word_dict.keys()) <= set(word_shape.members.keys())
    assert set(managed_dict.keys()) <= set(managed_shape.members.keys())
    assert word_dict["text"] == "badword"
    assert managed_dict["type"] == "PROFANITY"


def test_contextual_grounding_keys_match_service_model(create_guardrail_input_shape):
    grounding_shape = create_guardrail_input_shape.members[
        "contextualGroundingPolicyConfig"
    ].members["filtersConfig"].member
    config = GuardrailConfig(
        name="grounding-check",
        contextual_grounding=ContextualGrounding(grounding_threshold=0.5, relevance_threshold=0.6),
    )
    bedrock = to_bedrock(config)
    filters = bedrock["contextualGroundingPolicyConfig"]["filtersConfig"]
    assert {f["type"] for f in filters} == {"GROUNDING", "RELEVANCE"}
    for f in filters:
        assert set(f.keys()) <= set(grounding_shape.members.keys())
        for required in grounding_shape.required_members:
            assert required in f


def test_top_level_required_fields_present(create_guardrail_input_shape):
    config = GuardrailConfig(name="required-check", denied_topics=[DeniedTopic(
        name="topic", definition="def")])
    bedrock = to_bedrock(config)
    for required in create_guardrail_input_shape.required_members:
        assert required in bedrock, f"missing required field {required}"


# ---------------------------------------------------------------------------
# AWS-enforced behavior: PROMPT_ATTACK forces NONE output strength
# ---------------------------------------------------------------------------


def test_prompt_attack_output_strength_forced_to_none():
    config = GuardrailConfig(
        name="prompt-attack",
        content_policy=ContentPolicy(
            filters=[ContentFilter(type="PROMPT_ATTACK", output_strength="HIGH")]
        ),
    )
    bedrock = to_bedrock(config)
    assert bedrock["contentPolicyConfig"]["filtersConfig"][0]["outputStrength"] == "NONE"


def test_tier_config_hardcoded_to_classic():
    config = GuardrailConfig(
        name="tier-check",
        content_policy=ContentPolicy(filters=[ContentFilter(type="HATE")]),
        denied_topics=[DeniedTopic(name="topic", definition="def")],
    )
    bedrock = to_bedrock(config)
    assert bedrock["contentPolicyConfig"]["tierConfig"] == {"tierName": "CLASSIC"}
    assert bedrock["topicPolicyConfig"]["tierConfig"] == {"tierName": "CLASSIC"}


# ---------------------------------------------------------------------------
# Round trip: from_bedrock(to_bedrock(x)) == x
# ---------------------------------------------------------------------------


def _full_featured_config() -> GuardrailConfig:
    return GuardrailConfig(
        name="full-featured",
        description="A fully specified guardrail",
        content_policy=ContentPolicy(
            filters=[
                ContentFilter(
                    type="HATE",
                    input_strength="HIGH",
                    output_strength="MEDIUM",
                    input_action="BLOCK",
                    output_action="BLOCK",
                ),
                ContentFilter(
                    type="PROMPT_ATTACK",
                    input_strength="HIGH",
                    # NONE here, matching the AWS-enforced value, so the
                    # round trip isn't perturbed by the forced override.
                    output_strength="NONE",
                    input_action="BLOCK",
                    output_action="NONE",
                ),
            ]
        ),
        denied_topics=[
            DeniedTopic(
                name="legal-advice",
                definition="Requests for specific legal advice",
                examples=["Should I sue my landlord?"],
                input_action="BLOCK",
                output_action="BLOCK",
            )
        ],
        word_policy=WordPolicy(
            words=["badword", "worseword"],
            managed_word_lists=["PROFANITY"],
            input_action="BLOCK",
            output_action="NONE",
        ),
        pii_policy=PiiPolicy(
            entities=[
                PiiEntity(type="EMAIL", action="ANONYMIZE"),
                PiiEntity(type="US_SOCIAL_SECURITY_NUMBER", action="BLOCK"),
            ]
        ),
        contextual_grounding=ContextualGrounding(grounding_threshold=0.4, relevance_threshold=0.7),
        blocked_input_message="Custom blocked input message.",
        blocked_output_message="Custom blocked output message.",
    )


def test_round_trip_full_featured_config():
    original = _full_featured_config()
    bedrock = to_bedrock(original)
    # from_bedrock expects a GetGuardrail-response-shaped dict; the
    # translator's dual-shape handling accepts the *Config-suffixed
    # to_bedrock output directly (see normalizeForUpdate parity notes).
    reconstructed = from_bedrock(bedrock)
    assert reconstructed == original


@pytest.mark.parametrize(
    "config",
    [
        GuardrailConfig(
            name="content-only",
            content_policy=ContentPolicy(filters=[ContentFilter(type="SEXUAL")]),
        ),
        GuardrailConfig(
            name="topics-only",
            denied_topics=[DeniedTopic(name="restricted-topics", definition="No politics")],
        ),
        GuardrailConfig(
            name="words-only",
            word_policy=WordPolicy(words=["slur"], managed_word_lists=["PROFANITY"]),
        ),
        GuardrailConfig(
            name="pii-only", pii_policy=PiiPolicy(entities=[PiiEntity(type="PHONE")])
        ),
        GuardrailConfig(
            name="grounding-only",
            contextual_grounding=ContextualGrounding(grounding_threshold=0.3),
        ),
    ],
    ids=["content-only", "topics-only", "words-only", "pii-only", "grounding-only"],
)
def test_round_trip_minimal_single_policy_configs(config):
    bedrock = to_bedrock(config)
    reconstructed = from_bedrock(bedrock)
    assert reconstructed == config


def test_from_bedrock_accepts_get_guardrail_response_shape():
    """from_bedrock must also parse the bare (non-Config-suffixed) GetGuardrail shape."""
    response = {
        "name": "legacy-shape",
        "description": None,
        "contentPolicy": {
            "filters": [
                {
                    "type": "VIOLENCE",
                    "inputStrength": "HIGH",
                    "outputStrength": "LOW",
                    "inputAction": "BLOCK",
                    "outputAction": "NONE",
                }
            ]
        },
        "blockedInputMessaging": "This content violates our content policy.",
        "blockedOutputsMessaging": "I cannot provide that type of content.",
    }
    simplified = from_bedrock(response)
    assert simplified.content_policy.filters[0].type == "VIOLENCE"
    assert simplified.name == "legacy-shape"


def test_from_bedrock_defaults_blocked_messages_when_absent():
    response = {
        "name": "no-messages",
        "topicPolicy": {
            "topics": [{"name": "t", "definition": "d", "type": "DENY"}],
        },
    }
    simplified = from_bedrock(response)
    assert simplified.blocked_input_message == "This content violates our content policy."
    assert simplified.blocked_output_message == "I cannot provide that type of content."
