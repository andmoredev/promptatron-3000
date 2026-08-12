"""Simplified schema <-> Bedrock CreateGuardrail/GetGuardrail shape translation.

Ports the mapping tables from ``app/src/services/guardrailSchemaTranslator.js``
(``translateToAWSFormat`` and its per-policy helpers) plus the response
normalization logic from ``guardrailConfigurationManager.js``'s
``normalizeForUpdate`` (which accepts both the bare GetGuardrail response
shape - e.g. ``topicPolicy`` - and the *Config-suffixed request shape - e.g.
``topicPolicyConfig`` - interchangeably).

``to_bedrock`` produces kwargs suitable for both ``create_guardrail`` and
``update_guardrail`` (update additionally requires ``guardrailIdentifier``,
added by the service layer). ``from_bedrock`` parses a ``get_guardrail``
response (or a to_bedrock-shaped dict) back into a `GuardrailConfig`.
"""

from __future__ import annotations

from typing import Any

from promptatron.guardrails.schemas import (
    DEFAULT_BLOCKED_INPUT_MESSAGE,
    DEFAULT_BLOCKED_OUTPUT_MESSAGE,
    BlockAction,
    ContentFilter,
    ContentFilterType,
    ContentPolicy,
    ContextualGrounding,
    DeniedTopic,
    GuardrailConfig,
    GuardrailStrength,
    PiiEntity,
    PiiPolicy,
    SensitiveInfoAction,
    WordPolicy,
)

# Bedrock hardcodes the CLASSIC tier for topic/content policies in the
# ported JS translator (translateTopicPolicy/translateContentPolicy always
# set tierConfig.tierName = 'CLASSIC'); tier selection is not exposed in the
# simplified schema, so it is fixed here rather than made configurable.
_TIER_CONFIG = {"tierName": "CLASSIC"}


def _first(d: dict[str, Any], *keys: str) -> Any:
    """Return the value of the first present key, mirroring normalizeForUpdate's
    tolerance for both bare (GetGuardrail) and *Config-suffixed (Create/Update
    input) key names."""
    for key in keys:
        if key in d and d[key] is not None:
            return d[key]
    return None


def to_bedrock(
    config: GuardrailConfig, *, tags: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    """Translate a simplified `GuardrailConfig` into CreateGuardrail/UpdateGuardrail kwargs."""
    kwargs: dict[str, Any] = {
        "name": config.name,
        "blockedInputMessaging": config.blocked_input_message,
        "blockedOutputsMessaging": config.blocked_output_message,
    }

    if config.description is not None:
        kwargs["description"] = config.description

    if config.denied_topics:
        kwargs["topicPolicyConfig"] = _topic_policy_to_bedrock(config.denied_topics)

    if config.content_policy and config.content_policy.filters:
        kwargs["contentPolicyConfig"] = _content_policy_to_bedrock(config.content_policy)

    if config.word_policy and (config.word_policy.words or config.word_policy.managed_word_lists):
        kwargs["wordPolicyConfig"] = _word_policy_to_bedrock(config.word_policy)

    if config.pii_policy and config.pii_policy.entities:
        kwargs["sensitiveInformationPolicyConfig"] = _pii_policy_to_bedrock(config.pii_policy)

    if config.contextual_grounding:
        grounding_cfg = _contextual_grounding_to_bedrock(config.contextual_grounding)
        if grounding_cfg["filtersConfig"]:
            kwargs["contextualGroundingPolicyConfig"] = grounding_cfg

    if tags:
        kwargs["tags"] = tags

    return kwargs


def _topic_policy_to_bedrock(topics: list[DeniedTopic]) -> dict[str, Any]:
    return {
        "topicsConfig": [
            {
                "name": topic.name,
                "definition": topic.definition,
                "examples": list(topic.examples),
                "type": "DENY",
                "inputAction": topic.input_action.value,
                "outputAction": topic.output_action.value,
                "inputEnabled": True,
                "outputEnabled": True,
            }
            for topic in topics
        ],
        "tierConfig": _TIER_CONFIG,
    }


def _content_policy_to_bedrock(policy: ContentPolicy) -> dict[str, Any]:
    return {
        "filtersConfig": [_filter_to_bedrock(f) for f in policy.filters],
        "tierConfig": _TIER_CONFIG,
    }


def _filter_to_bedrock(f: ContentFilter) -> dict[str, Any]:
    # AWS requirement ported from translateContentPolicy: PROMPT_ATTACK filters
    # must have NONE output strength, enforced regardless of the configured value.
    output_strength = (
        GuardrailStrength.NONE if f.type == ContentFilterType.PROMPT_ATTACK else f.output_strength
    )
    return {
        "type": f.type.value,
        "inputStrength": f.input_strength.value,
        "outputStrength": output_strength.value,
        "inputModalities": ["TEXT"],
        "outputModalities": ["TEXT"],
        "inputAction": f.input_action.value,
        "outputAction": f.output_action.value,
        "inputEnabled": True,
        "outputEnabled": True,
    }


def _word_policy_to_bedrock(policy: WordPolicy) -> dict[str, Any]:
    word_cfg: dict[str, Any] = {}

    if policy.words:
        word_cfg["wordsConfig"] = [
            {
                "text": word,
                "inputAction": policy.input_action.value,
                "outputAction": policy.output_action.value,
                "inputEnabled": True,
                "outputEnabled": True,
            }
            for word in policy.words
        ]

    if policy.managed_word_lists:
        word_cfg["managedWordListsConfig"] = [
            {
                "type": managed_list.value,
                "inputAction": policy.input_action.value,
                "outputAction": policy.output_action.value,
                "inputEnabled": True,
                "outputEnabled": True,
            }
            for managed_list in policy.managed_word_lists
        ]

    return word_cfg


def _pii_policy_to_bedrock(policy: PiiPolicy) -> dict[str, Any]:
    return {
        "piiEntitiesConfig": [
            {
                "type": entity.type.value,
                "action": entity.action.value,
                "inputEnabled": True,
                "outputEnabled": True,
            }
            for entity in policy.entities
        ]
    }


def _contextual_grounding_to_bedrock(policy: ContextualGrounding) -> dict[str, Any]:
    filters_config: list[dict[str, Any]] = []

    if policy.grounding_threshold is not None:
        filters_config.append(
            {
                "type": "GROUNDING",
                "threshold": policy.grounding_threshold,
                "action": "BLOCK",
                "enabled": True,
            }
        )

    if policy.relevance_threshold is not None:
        filters_config.append(
            {
                "type": "RELEVANCE",
                "threshold": policy.relevance_threshold,
                "action": "BLOCK",
                "enabled": True,
            }
        )

    return {"filtersConfig": filters_config}


def from_bedrock(response: dict[str, Any]) -> GuardrailConfig:
    """Translate a GetGuardrail response (or a to_bedrock-shaped dict) back
    into a simplified `GuardrailConfig`.

    Accepts either the bare GetGuardrail response key names (topicPolicy,
    contentPolicy, ...) or the *Config-suffixed request shape (topicPolicyConfig,
    contentPolicyConfig, ...) -- and likewise for the nested array keys
    (topics/topicsConfig, filters/filtersConfig, ...) -- mirroring
    guardrailConfigurationManager.js's normalizeForUpdate dual-shape handling.
    """
    return GuardrailConfig(
        name=response["name"],
        description=response.get("description"),
        content_policy=_content_policy_from_bedrock(response),
        denied_topics=_denied_topics_from_bedrock(response),
        word_policy=_word_policy_from_bedrock(response),
        pii_policy=_pii_policy_from_bedrock(response),
        contextual_grounding=_contextual_grounding_from_bedrock(response),
        blocked_input_message=response.get("blockedInputMessaging")
        or DEFAULT_BLOCKED_INPUT_MESSAGE,
        blocked_output_message=response.get("blockedOutputsMessaging")
        or DEFAULT_BLOCKED_OUTPUT_MESSAGE,
    )


def _denied_topics_from_bedrock(response: dict[str, Any]) -> list[DeniedTopic]:
    topic_policy = _first(response, "topicPolicyConfig", "topicPolicy") or {}
    topics = _first(topic_policy, "topicsConfig", "topics") or []
    return [
        DeniedTopic(
            name=t["name"],
            definition=t["definition"],
            examples=list(t.get("examples") or []),
            input_action=t.get("inputAction", BlockAction.BLOCK.value),
            output_action=t.get("outputAction", BlockAction.BLOCK.value),
        )
        for t in topics
    ]


def _content_policy_from_bedrock(response: dict[str, Any]) -> ContentPolicy | None:
    content_policy = _first(response, "contentPolicyConfig", "contentPolicy") or {}
    filters = _first(content_policy, "filtersConfig", "filters") or []
    if not filters:
        return None
    return ContentPolicy(
        filters=[
            ContentFilter(
                type=f["type"],
                input_strength=f.get("inputStrength", GuardrailStrength.HIGH.value),
                output_strength=f.get("outputStrength", GuardrailStrength.LOW.value),
                input_action=f.get("inputAction", BlockAction.BLOCK.value),
                output_action=f.get("outputAction", BlockAction.NONE.value),
            )
            for f in filters
        ]
    )


def _word_policy_from_bedrock(response: dict[str, Any]) -> WordPolicy | None:
    word_policy = _first(response, "wordPolicyConfig", "wordPolicy") or {}
    words = _first(word_policy, "wordsConfig", "words") or []
    managed_lists = _first(word_policy, "managedWordListsConfig", "managedWordLists") or []
    if not words and not managed_lists:
        return None

    # input/output action are uniform across all entries in the simplified
    # model (matching wordPolicy.input/output in the JS translator); take
    # them from whichever entry list is populated first.
    sample = (words or managed_lists)[0]
    return WordPolicy(
        words=[w["text"] for w in words],
        managed_word_lists=[m["type"] for m in managed_lists],
        input_action=sample.get("inputAction", BlockAction.BLOCK.value),
        output_action=sample.get("outputAction", BlockAction.NONE.value),
    )


def _pii_policy_from_bedrock(response: dict[str, Any]) -> PiiPolicy | None:
    sensitive_policy = _first(
        response, "sensitiveInformationPolicyConfig", "sensitiveInformationPolicy"
    ) or {}
    entities = _first(sensitive_policy, "piiEntitiesConfig", "piiEntities") or []
    if not entities:
        return None
    return PiiPolicy(
        entities=[
            PiiEntity(
                type=e["type"],
                action=e.get("action", SensitiveInfoAction.ANONYMIZE.value),
            )
            for e in entities
        ]
    )


def _contextual_grounding_from_bedrock(response: dict[str, Any]) -> ContextualGrounding | None:
    grounding_policy = _first(
        response, "contextualGroundingPolicyConfig", "contextualGroundingPolicy"
    ) or {}
    filters = _first(grounding_policy, "filtersConfig", "filters") or []
    if not filters:
        return None

    thresholds = {f["type"]: f.get("threshold") for f in filters}
    grounding_threshold = thresholds.get("GROUNDING")
    relevance_threshold = thresholds.get("RELEVANCE")
    if grounding_threshold is None and relevance_threshold is None:
        return None
    return ContextualGrounding(
        grounding_threshold=grounding_threshold, relevance_threshold=relevance_threshold
    )
