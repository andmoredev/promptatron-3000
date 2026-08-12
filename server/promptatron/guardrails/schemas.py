"""Pydantic models for the simplified Bedrock guardrail policy schema.

These mirror the "simplified" configuration shape that the legacy
frontend services consumed (see ``app/src/services/guardrailSchemaTranslator.js``),
ported to snake_case with camelCase aliases so the API can accept either
naming convention from clients.

Field constraints (lengths, patterns) are taken directly from the Bedrock
``CreateGuardrail`` service model so validation errors surface locally
instead of round-tripping to AWS.

Cross-field business rules (e.g. "at least one policy must be configured")
are intentionally *not* implemented as pydantic ``model_validator``s. A
validator that raises plain ``ValueError`` makes FastAPI's automatic request
validation attach the raised exception instance itself to the error's
``ctx``; the app's shared ``validation_exception_handler`` (errors.py, not
modifiable here) serializes that with a plain ``json.dumps`` rather than
``jsonable_encoder``, which raises ``TypeError: Object of type ValueError is
not JSON serializable`` for any request that trips such a validator. Instead,
``validate_business_rules`` below returns a list of error strings -- mirroring
``GuardrailSchemaTranslator.validateSimplifiedSchema``'s ``{isValid, errors}``
shape in the legacy JS translator -- for callers (the router) to turn into a
``BadRequestError``.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# Defaults ported from guardrailService.js / guardrailConfigurationManager.js
DEFAULT_BLOCKED_INPUT_MESSAGE = "This content violates our content policy."
DEFAULT_BLOCKED_OUTPUT_MESSAGE = "I cannot provide that type of content."


class _CamelModel(BaseModel):
    """Base model: snake_case fields, camelCase aliases, either accepted."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class ContentFilterType(StrEnum):
    """Bedrock content filter categories (contentPolicyConfig.filtersConfig[].type)."""

    SEXUAL = "SEXUAL"
    VIOLENCE = "VIOLENCE"
    HATE = "HATE"
    INSULTS = "INSULTS"
    MISCONDUCT = "MISCONDUCT"
    PROMPT_ATTACK = "PROMPT_ATTACK"


class GuardrailStrength(StrEnum):
    """Filter strength enum shared by content filters."""

    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class BlockAction(StrEnum):
    """Two-state action used by content filters, words, and topics."""

    BLOCK = "BLOCK"
    NONE = "NONE"


class SensitiveInfoAction(StrEnum):
    """Three-state action used by PII entities."""

    BLOCK = "BLOCK"
    ANONYMIZE = "ANONYMIZE"
    NONE = "NONE"


class ManagedWordListType(StrEnum):
    """Managed word list categories. Bedrock currently only offers PROFANITY."""

    PROFANITY = "PROFANITY"


class PiiEntityType(StrEnum):
    """Bedrock sensitiveInformationPolicyConfig.piiEntitiesConfig[].type values."""

    ADDRESS = "ADDRESS"
    AGE = "AGE"
    AWS_ACCESS_KEY = "AWS_ACCESS_KEY"
    AWS_SECRET_KEY = "AWS_SECRET_KEY"
    CA_HEALTH_NUMBER = "CA_HEALTH_NUMBER"
    CA_SOCIAL_INSURANCE_NUMBER = "CA_SOCIAL_INSURANCE_NUMBER"
    CREDIT_DEBIT_CARD_CVV = "CREDIT_DEBIT_CARD_CVV"
    CREDIT_DEBIT_CARD_EXPIRY = "CREDIT_DEBIT_CARD_EXPIRY"
    CREDIT_DEBIT_CARD_NUMBER = "CREDIT_DEBIT_CARD_NUMBER"
    DRIVER_ID = "DRIVER_ID"
    EMAIL = "EMAIL"
    INTERNATIONAL_BANK_ACCOUNT_NUMBER = "INTERNATIONAL_BANK_ACCOUNT_NUMBER"
    IP_ADDRESS = "IP_ADDRESS"
    LICENSE_PLATE = "LICENSE_PLATE"
    MAC_ADDRESS = "MAC_ADDRESS"
    NAME = "NAME"
    PASSWORD = "PASSWORD"
    PHONE = "PHONE"
    PIN = "PIN"
    SWIFT_CODE = "SWIFT_CODE"
    UK_NATIONAL_HEALTH_SERVICE_NUMBER = "UK_NATIONAL_HEALTH_SERVICE_NUMBER"
    UK_NATIONAL_INSURANCE_NUMBER = "UK_NATIONAL_INSURANCE_NUMBER"
    UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER = "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER"
    URL = "URL"
    USERNAME = "USERNAME"
    US_BANK_ACCOUNT_NUMBER = "US_BANK_ACCOUNT_NUMBER"
    US_BANK_ROUTING_NUMBER = "US_BANK_ROUTING_NUMBER"
    US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER = "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER"
    US_PASSPORT_NUMBER = "US_PASSPORT_NUMBER"
    US_SOCIAL_SECURITY_NUMBER = "US_SOCIAL_SECURITY_NUMBER"
    VEHICLE_IDENTIFICATION_NUMBER = "VEHICLE_IDENTIFICATION_NUMBER"


class GuardrailStatus(StrEnum):
    """Bedrock guardrail lifecycle status values."""

    CREATING = "CREATING"
    UPDATING = "UPDATING"
    VERSIONING = "VERSIONING"
    READY = "READY"
    FAILED = "FAILED"
    DELETING = "DELETING"


class ContentFilter(_CamelModel):
    """A single content filter category with per-direction strength/action.

    Defaults mirror ``GuardrailSchemaTranslator.translateContentPolicy``:
    inputStrength HIGH, outputStrength LOW, inputAction BLOCK, outputAction NONE.
    Note: Bedrock requires PROMPT_ATTACK filters to have NONE output strength;
    this is enforced during translation (see translator.py), not here.
    """

    type: ContentFilterType
    input_strength: GuardrailStrength = GuardrailStrength.HIGH
    output_strength: GuardrailStrength = GuardrailStrength.LOW
    input_action: BlockAction = BlockAction.BLOCK
    output_action: BlockAction = BlockAction.NONE


class ContentPolicy(_CamelModel):
    """Content filter policy (contentPolicyConfig)."""

    filters: list[ContentFilter] = Field(default_factory=list)


class DeniedTopic(_CamelModel):
    """A denied topic definition (topicPolicyConfig.topicsConfig[], type=DENY).

    The legacy JS translator only ever produced a single hardcoded topic
    named 'restricted-topics' with BLOCK/BLOCK actions. This model
    generalizes to a named list (matching Bedrock's real capability) while
    keeping the same BLOCK/BLOCK, always-enabled defaults.
    """

    name: str = Field(min_length=1, max_length=100, pattern=r"^[0-9a-zA-Z-_ !?.]+$")
    definition: str = Field(min_length=1, max_length=200)
    examples: list[str] = Field(default_factory=list, max_length=5)
    input_action: BlockAction = BlockAction.BLOCK
    output_action: BlockAction = BlockAction.BLOCK


class WordPolicy(_CamelModel):
    """Custom words and managed word lists (wordPolicyConfig).

    input_action/output_action apply uniformly to both words and managed
    lists, matching wordPolicy.input/output in the JS translator
    (defaults BLOCK / NONE).
    """

    words: list[str] = Field(default_factory=list)
    managed_word_lists: list[ManagedWordListType] = Field(default_factory=list)
    input_action: BlockAction = BlockAction.BLOCK
    output_action: BlockAction = BlockAction.NONE


class PiiEntity(_CamelModel):
    """A single PII entity detector with one collapsed action.

    The JS translator tracked separate input/output actions (defaulting to
    BLOCK input / ANONYMIZE output) and always sent a dummy 'NONE' legacy
    action. This schema collapses that to a single `action`, applied to
    Bedrock's legacy top-level `action` field so it governs both input and
    output uniformly. See translator.py "not ported" notes.
    """

    type: PiiEntityType
    action: SensitiveInfoAction = SensitiveInfoAction.ANONYMIZE


class PiiPolicy(_CamelModel):
    """Sensitive information (PII) policy (sensitiveInformationPolicyConfig)."""

    entities: list[PiiEntity] = Field(default_factory=list)


class ContextualGrounding(_CamelModel):
    """Contextual grounding/relevance filters (contextualGroundingPolicyConfig)."""

    grounding_threshold: float | None = Field(default=None, ge=0, le=1)
    relevance_threshold: float | None = Field(default=None, ge=0, le=1)


class GuardrailConfig(_CamelModel):
    """The simplified guardrail configuration accepted by create/update.

    Mirrors the shape ``GuardrailSchemaTranslator.translateToAWSFormat``
    consumes: name/description, blocked messaging, and the five policy
    groups (content, denied topics, words, PII, contextual grounding).
    """

    name: str = Field(min_length=1, max_length=50, pattern=r"^[0-9a-zA-Z-_]+$")
    description: str | None = Field(default=None, min_length=1, max_length=200)
    content_policy: ContentPolicy | None = None
    denied_topics: list[DeniedTopic] = Field(default_factory=list)
    word_policy: WordPolicy | None = None
    pii_policy: PiiPolicy | None = None
    contextual_grounding: ContextualGrounding | None = None
    blocked_input_message: str = Field(
        default=DEFAULT_BLOCKED_INPUT_MESSAGE, min_length=1, max_length=500
    )
    blocked_output_message: str = Field(
        default=DEFAULT_BLOCKED_OUTPUT_MESSAGE, min_length=1, max_length=500
    )


class GuardrailSummary(_CamelModel):
    """A list-view summary of a guardrail (ListGuardrails entry)."""

    id: str
    arn: str
    name: str
    description: str | None = None
    version: str
    status: GuardrailStatus
    created_at: datetime
    updated_at: datetime | None = None


class GuardrailDetail(GuardrailSummary):
    """Full guardrail detail: summary metadata plus simplified policies."""

    content_policy: ContentPolicy | None = None
    denied_topics: list[DeniedTopic] = Field(default_factory=list)
    word_policy: WordPolicy | None = None
    pii_policy: PiiPolicy | None = None
    contextual_grounding: ContextualGrounding | None = None
    blocked_input_message: str | None = None
    blocked_output_message: str | None = None


class GuardrailVersionSummary(_CamelModel):
    """Result of publishing a new guardrail version (CreateGuardrailVersion)."""

    id: str
    version: str
    description: str | None = None


class GuardrailVersionCreate(_CamelModel):
    """Request body for POST /guardrails/{id}/versions (publish DRAFT)."""

    description: str | None = Field(default=None, min_length=1, max_length=200)


def validate_business_rules(config: GuardrailConfig) -> list[str]:
    """Validate cross-field business rules, returning human-readable errors.

    Ports GuardrailSchemaTranslator's validateWordPolicy, validateSensitive-
    InformationPolicy, validateContextualGroundingPolicy, and the top-level
    "at least one policy" check from validateSimplifiedSchema. Returns an
    empty list when `config` is valid; see the module docstring for why this
    is a plain function rather than a raising pydantic validator.
    """
    errors: list[str] = []

    if config.word_policy is not None and not (
        config.word_policy.words or config.word_policy.managed_word_lists
    ):
        errors.append("word_policy must have at least one of words or managed_word_lists")

    if config.pii_policy is not None and not config.pii_policy.entities:
        errors.append("pii_policy must have at least one entity")

    if config.contextual_grounding is not None and (
        config.contextual_grounding.grounding_threshold is None
        and config.contextual_grounding.relevance_threshold is None
    ):
        errors.append(
            "contextual_grounding must have at least one of "
            "grounding_threshold or relevance_threshold"
        )

    has_policy = bool(
        (config.content_policy and config.content_policy.filters)
        or config.denied_topics
        or config.word_policy
        or config.pii_policy
        or config.contextual_grounding
    )
    if not has_policy:
        errors.append(
            "At least one policy (content_policy, denied_topics, word_policy, "
            "pii_policy, or contextual_grounding) is required"
        )

    return errors
