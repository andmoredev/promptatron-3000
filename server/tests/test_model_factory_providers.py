"""Multi-provider model construction: branching, mapping and refusals.

Every provider class is constructed for real (they are all lazy about their
transport, so nothing here touches the network) and its resulting config is
asserted against what the run requested -- the point being that the same
``InferenceConfig`` lands in three differently-shaped provider configs.
"""

import pytest
from pydantic import ValidationError
from strands.models.anthropic import AnthropicModel
from strands.models.bedrock import BedrockModel
from strands.models.ollama import OllamaModel
from strands.models.openai import OpenAIModel

from promptatron.config import Settings
from promptatron.engine.fake_model import FakeModel
from promptatron.engine.model_factory import (
    ANTHROPIC_DEFAULT_MAX_TOKENS,
    build_model,
    classify_error,
)
from promptatron.engine.schemas import RunRequest
from promptatron.errors import BadRequestError

INFERENCE = {"temperature": 0.25, "top_p": 0.9, "max_tokens": 512}


def make_request(**overrides) -> RunRequest:
    payload = {"model_id": "some-model", "user_prompt": "hi", "inference": dict(INFERENCE)}
    payload.update(overrides)
    return RunRequest(**payload)


def settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


# --------------------------------------------------------------------------- #
# Branching
# --------------------------------------------------------------------------- #


def test_default_provider_is_bedrock():
    assert make_request().provider == "bedrock"
    model = build_model(make_request(), settings(aws_region="eu-west-1"))
    assert isinstance(model, BedrockModel)


def test_bedrock_maps_inference_onto_top_level_config():
    model = build_model(make_request(provider="bedrock"), settings())
    config = model.get_config()
    assert config["model_id"] == "some-model"
    assert config["streaming"] is True
    assert (config["temperature"], config["top_p"], config["max_tokens"]) == (0.25, 0.9, 512)


def test_bedrock_still_carries_guardrails():
    request = make_request(guardrail={"id": "gr-1", "version": "2", "trace": False})
    config = build_model(request, settings()).get_config()
    assert config["guardrail_id"] == "gr-1"
    assert config["guardrail_version"] == "2"
    assert config["guardrail_trace"] == "disabled"


def test_anthropic_splits_max_tokens_from_the_sampling_params():
    request = make_request(provider="anthropic", model_id="claude-sonnet-4-5")
    model = build_model(request, settings(anthropic_api_key="sk-ant-test"))
    assert isinstance(model, AnthropicModel)

    config = model.get_config()
    assert config["model_id"] == "claude-sonnet-4-5"
    # max_tokens is top-level for Anthropic; temperature/top_p are not.
    assert config["max_tokens"] == 512
    assert config["params"] == {"temperature": 0.25, "top_p": 0.9}


def test_anthropic_supplies_a_max_tokens_default():
    """The Messages API rejects a request without one, so we must always send it."""
    request = make_request(provider="anthropic", inference={"temperature": 0.1})
    config = build_model(request, settings(anthropic_api_key="sk-ant-test")).get_config()
    assert config["max_tokens"] == ANTHROPIC_DEFAULT_MAX_TOKENS
    assert config["params"] == {"temperature": 0.1}


def test_openai_puts_every_knob_in_params():
    request = make_request(provider="openai", model_id="gpt-4o")
    model = build_model(request, settings(openai_api_key="sk-openai-test"))
    assert isinstance(model, OpenAIModel)

    config = model.get_config()
    assert config["model_id"] == "gpt-4o"
    assert config["stream"] is True
    assert config["params"] == INFERENCE


def test_ollama_maps_every_knob_to_a_top_level_key():
    request = make_request(provider="ollama", model_id="llama3.1:8b")
    model = build_model(request, settings(ollama_base_url="http://localhost:11434"))
    assert isinstance(model, OllamaModel)
    assert model.host == "http://localhost:11434"

    config = model.get_config()
    assert config["model_id"] == "llama3.1:8b"
    assert (config["temperature"], config["top_p"], config["max_tokens"]) == (0.25, 0.9, 512)


def test_unset_inference_values_are_not_forwarded():
    request = make_request(provider="ollama", inference={})
    config = build_model(request, settings(ollama_base_url="http://localhost:11434")).get_config()
    assert "temperature" not in config
    assert "top_p" not in config
    assert "max_tokens" not in config


# --------------------------------------------------------------------------- #
# Refusals
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("provider", ["anthropic", "openai", "ollama"])
def test_unconfigured_provider_is_a_bad_request(provider):
    with pytest.raises(BadRequestError) as exc_info:
        build_model(make_request(provider=provider), settings())

    error = exc_info.value
    assert error.code == "provider_not_configured"
    assert error.status_code == 400
    assert error.detail == {"provider": provider}


def test_a_blank_api_key_counts_as_unconfigured(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "   ")
    with pytest.raises(BadRequestError) as exc_info:
        build_model(make_request(provider="anthropic"), Settings(_env_file=None))
    assert exc_info.value.code == "provider_not_configured"


def test_one_provider_being_configured_does_not_configure_the_others():
    configured = settings(anthropic_api_key="sk-ant-test")
    build_model(make_request(provider="anthropic"), configured)  # fine
    with pytest.raises(BadRequestError):
        build_model(make_request(provider="openai"), configured)


@pytest.mark.parametrize("provider", ["anthropic", "openai", "ollama"])
def test_guardrails_are_rejected_on_non_bedrock_providers(provider):
    with pytest.raises(BadRequestError) as exc_info:
        make_request(provider=provider, guardrail={"id": "gr-1"})

    error = exc_info.value
    assert error.code == "guardrail_requires_bedrock"
    assert error.status_code == 400
    assert error.detail["provider"] == provider


def test_provider_not_configured_keeps_its_code_in_the_run_stream():
    """A refusal must not be flattened into a generic ``internal_error`` event."""
    try:
        build_model(make_request(provider="openai"), settings())
    except BadRequestError as exc:
        code, _message, retryable = classify_error(exc)
    assert (code, retryable) == ("provider_not_configured", False)


# --------------------------------------------------------------------------- #
# The fake model short-circuits everything
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("provider", ["bedrock", "anthropic", "openai", "ollama"])
def test_fake_model_short_circuits_every_provider(provider):
    """PROMPTATRON_FAKE_MODEL wins even for a provider with no credentials."""
    model = build_model(make_request(provider=provider), settings(fake_model=True))
    assert isinstance(model, FakeModel)
    assert model.get_config()["model_id"] == "some-model"


def test_fake_model_still_receives_the_inference_config():
    model = build_model(make_request(provider="openai"), settings(fake_model=True))
    config = model.get_config()
    assert (config["temperature"], config["top_p"], config["max_tokens"]) == (0.25, 0.9, 512)


# --------------------------------------------------------------------------- #
# Persistence / pass-through
# --------------------------------------------------------------------------- #


def test_stored_config_records_the_provider():
    assert make_request(provider="ollama").stored_config()["provider"] == "ollama"
    assert make_request().stored_config()["provider"] == "bedrock"


def test_an_unknown_provider_is_a_validation_error():
    with pytest.raises(ValidationError):
        make_request(provider="cohere")
