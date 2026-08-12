"""Application settings, sourced from the environment (PROMPTATRON_ prefix)."""

from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the promptatron server.

    All fields are overridable via environment variables prefixed with
    ``PROMPTATRON_`` (e.g. ``PROMPTATRON_AWS_REGION=us-west-2``).

    The three non-Bedrock model providers are the exception to "prefix
    everything": their credentials also have well-known standard env names
    (``ANTHROPIC_API_KEY``, ``OPENAI_API_KEY``, ``OLLAMA_HOST``) that developers
    already have exported, so each one accepts the prefixed name *or* the
    standard one, prefixed winning.
    """

    model_config = SettingsConfigDict(
        env_prefix="PROMPTATRON_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # The aliased provider fields would otherwise be settable only by their
        # env-var names, which makes `Settings(ollama_base_url=...)` in a test
        # silently do nothing.
        populate_by_name=True,
    )

    aws_region: str = "us-east-1"
    config_api_url: str | None = None
    config_api_key: str | None = None
    db_path: str = "./data/promptatron.db"
    #: Name of the deployed ``api/template.yaml`` stack, used to auto-discover
    #: ``config_api_url``/``config_api_key``/``eval_table``/``eval_runtime_arn``
    #: from its outputs when they are not set explicitly (see
    #: ``promptatron.runtime_config``). Change this if you deployed the stack
    #: under a different name than the Makefile default.
    stack_name: str = "promptatron-config"
    #: Set false to disable CloudFormation-stack auto-discovery entirely -- no
    #: ``cloudformation``/``apigateway`` calls are ever made, and the four
    #: settings above behave exactly as before (env-or-unconfigured).
    stack_discovery: bool = True
    cors_origins: list[str] = ["http://localhost:3000"]
    fake_model: bool = False

    # -- non-Bedrock model providers ---------------------------------------- #
    #: Anthropic API key. Presence is what makes the provider "configured".
    anthropic_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("PROMPTATRON_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
    )
    #: OpenAI API key. Presence is what makes the provider "configured".
    openai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("PROMPTATRON_OPENAI_API_KEY", "OPENAI_API_KEY"),
    )
    #: Base URL of an Ollama server, e.g. ``http://localhost:11434``. Deliberately
    #: has no default: an unset value means "the provider is not offered", which
    #: is different from "there might be an Ollama on the usual port".
    ollama_base_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("PROMPTATRON_OLLAMA_BASE_URL", "OLLAMA_HOST"),
    )

    # -- the cloud evaluation lane (docs/cloud-evals.md) -------------------- #
    #: AgentCore Runtime ARN of the evaluation worker. None = lane unavailable.
    eval_runtime_arn: str | None = None
    #: DynamoDB table holding cloud evaluation state (the config-store table).
    eval_table: str | None = None

    # -- deployment shape (docs/serverless-deploy.md) ----------------------- #
    #: Where run/evaluation history lives. ``auto`` picks ``dynamodb`` inside
    #: Lambda and ``sqlite`` everywhere else; see
    #: :mod:`promptatron.deployment` for the full resolution matrix.
    history_backend: Literal["sqlite", "dynamodb", "auto"] = "auto"
    #: Whether ``POST /evaluations`` may execute an evaluation in this process.
    #: ``auto`` means "off inside Lambda, on everywhere else" -- a deployed
    #: server has no durable place to run a multi-minute job.
    local_evals: Literal["auto", "on", "off"] = "auto"

    @field_validator("anthropic_api_key", "openai_api_key")
    @classmethod
    def _blank_key_is_unset(cls, value: str | None) -> str | None:
        """``FOO_API_KEY=`` in a shell profile means unset, not "empty key"."""
        if value is None:
            return None
        return value.strip() or None

    @field_validator("ollama_base_url")
    @classmethod
    def _normalize_ollama_base_url(cls, value: str | None) -> str | None:
        """Accept ``OLLAMA_HOST``'s schemeless ``host:port`` form as a base URL."""
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if "://" not in value:
            value = f"http://{value}"
        return value.rstrip("/")


def get_settings() -> Settings:
    """Return a fresh Settings instance (re-reads the environment)."""
    return Settings()
