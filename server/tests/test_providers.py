"""Tests for promptatron.providers: the per-provider credential/configured dispatch.

``credential_for``/``is_configured`` are a plain ``match`` over the four
providers -- real dispatch logic, not a boto wrapper -- and were previously
only exercised indirectly (and incompletely) through the models catalog.
"""

from promptatron.config import Settings
from promptatron.providers import credential_for, is_configured


def test_credential_for_anthropic_reads_the_anthropic_api_key():
    settings = Settings(anthropic_api_key="sk-ant-1")
    assert credential_for("anthropic", settings) == "sk-ant-1"


def test_credential_for_openai_reads_the_openai_api_key():
    settings = Settings(openai_api_key="sk-openai-1")
    assert credential_for("openai", settings) == "sk-openai-1"


def test_credential_for_ollama_reads_the_ollama_base_url():
    settings = Settings(ollama_base_url="http://localhost:11434")
    assert credential_for("ollama", settings) == "http://localhost:11434"


def test_credential_for_bedrock_is_none_it_is_not_a_credential_lookup():
    settings = Settings()
    assert credential_for("bedrock", settings) is None


def test_credential_for_an_unconfigured_provider_is_none():
    settings = Settings()
    assert credential_for("anthropic", settings) is None
    assert credential_for("openai", settings) is None
    assert credential_for("ollama", settings) is None


def test_is_configured_true_for_each_non_bedrock_provider_with_its_credential():
    assert is_configured("anthropic", Settings(anthropic_api_key="k")) is True
    assert is_configured("openai", Settings(openai_api_key="k")) is True
    assert is_configured("ollama", Settings(ollama_base_url="http://host:11434")) is True


def test_is_configured_false_for_each_non_bedrock_provider_without_its_credential():
    settings = Settings()
    assert is_configured("anthropic", settings) is False
    assert is_configured("openai", settings) is False
    assert is_configured("ollama", settings) is False


def test_is_configured_bedrock_delegates_to_aws_credentials_status(monkeypatch):
    import promptatron.providers as providers_mod

    monkeypatch.setattr(providers_mod, "aws_credentials_status", lambda: "ok")
    assert is_configured("bedrock", Settings()) is True

    monkeypatch.setattr(providers_mod, "aws_credentials_status", lambda: "missing")
    assert is_configured("bedrock", Settings()) is False

    monkeypatch.setattr(providers_mod, "aws_credentials_status", lambda: "error")
    assert is_configured("bedrock", Settings()) is False
