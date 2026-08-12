"""Application settings, sourced from the environment (PROMPTATRON_ prefix)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the promptatron server.

    All fields are overridable via environment variables prefixed with
    ``PROMPTATRON_`` (e.g. ``PROMPTATRON_AWS_REGION=us-west-2``).
    """

    model_config = SettingsConfigDict(
        env_prefix="PROMPTATRON_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    aws_region: str = "us-east-1"
    config_api_url: str | None = None
    config_api_key: str | None = None
    db_path: str = "./data/promptatron.db"
    cors_origins: list[str] = ["http://localhost:3000"]
    fake_model: bool = False

    # -- the cloud evaluation lane (docs/cloud-evals.md) -------------------- #
    #: AgentCore Runtime ARN of the evaluation worker. None = lane unavailable.
    eval_runtime_arn: str | None = None
    #: DynamoDB table holding cloud evaluation state (the config-store table).
    eval_table: str | None = None


def get_settings() -> Settings:
    """Return a fresh Settings instance (re-reads the environment)."""
    return Settings()
