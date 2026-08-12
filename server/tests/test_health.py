"""Tests for GET /api/v1/health."""

import httpx
import respx


class _FakeCredentials:
    pass


async def test_health_ok_shape(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "aws" in body
    assert "config_store" in body


async def test_health_aws_credentials_present(client, monkeypatch):
    monkeypatch.setattr(
        "botocore.session.Session.get_credentials", lambda self: _FakeCredentials()
    )
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["aws"]["credentials"] == "ok"


async def test_health_aws_credentials_missing(client, monkeypatch):
    monkeypatch.setattr("botocore.session.Session.get_credentials", lambda self: None)
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["aws"]["credentials"] == "missing"


async def test_health_aws_credentials_error(client, monkeypatch):
    def _raise(self):
        raise RuntimeError("boom")

    monkeypatch.setattr("botocore.session.Session.get_credentials", _raise)
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["aws"]["credentials"] == "error"


async def test_health_aws_region_reported(client, monkeypatch):
    monkeypatch.setenv("PROMPTATRON_AWS_REGION", "eu-west-1")
    response = await client.get("/api/v1/health")
    assert response.json()["aws"]["region"] == "eu-west-1"


async def test_health_config_store_unconfigured(client, monkeypatch):
    monkeypatch.delenv("PROMPTATRON_CONFIG_API_URL", raising=False)
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["config_store"] == {"configured": False, "reachable": None}


@respx.mock
async def test_health_config_store_reachable(client, monkeypatch):
    monkeypatch.setenv("PROMPTATRON_CONFIG_API_URL", "https://config.example.com")
    route = respx.get("https://config.example.com/scenarios").mock(
        return_value=httpx.Response(200, json=[])
    )
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["config_store"] == {"configured": True, "reachable": True}
    assert route.called


@respx.mock
async def test_health_config_store_unreachable(client, monkeypatch):
    monkeypatch.setenv("PROMPTATRON_CONFIG_API_URL", "https://config.example.com")
    respx.get("https://config.example.com/scenarios").mock(
        side_effect=httpx.ConnectError("connection refused")
    )
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["config_store"] == {"configured": True, "reachable": False}


async def test_health_never_raises_on_unexpected_error(client, monkeypatch):
    def _raise(self):
        raise ValueError("unexpected")

    monkeypatch.setattr("botocore.session.Session.get_credentials", _raise)
    response = await client.get("/api/v1/health")
    assert response.status_code == 200


@respx.mock
async def test_health_config_store_check_sends_the_api_key_header(client, monkeypatch):
    monkeypatch.setenv("PROMPTATRON_CONFIG_API_URL", "https://config.example.com")
    monkeypatch.setenv("PROMPTATRON_CONFIG_API_KEY", "secret-key")
    route = respx.get("https://config.example.com/scenarios").mock(
        return_value=httpx.Response(200, json=[])
    )

    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert route.calls.last.request.headers["x-api-key"] == "secret-key"


async def test_health_survives_an_unexpected_credentials_orchestration_failure(
    client, monkeypatch
):
    """Not the AWS SDK call itself (which has its own internal fallback to
    "error") -- a failure in the health endpoint's own dispatch of that check."""
    import promptatron.routers.health as health_module

    def _raise():
        raise RuntimeError("orchestration exploded")

    monkeypatch.setattr(health_module, "_check_aws_credentials", _raise)

    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["aws"]["credentials"] == "error"


async def test_health_survives_an_unexpected_config_store_check_failure(client, monkeypatch):
    import promptatron.routers.health as health_module

    async def _raise(_settings):
        raise RuntimeError("orchestration exploded")

    monkeypatch.setattr(health_module, "_check_config_store", _raise)

    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["config_store"]["reachable"] is False


async def test_health_survives_an_unexpected_provider_check_failure(client, monkeypatch):
    import promptatron.routers.health as health_module

    async def _raise(_settings):
        raise RuntimeError("orchestration exploded")

    monkeypatch.setattr(health_module, "_check_providers", _raise)

    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    # The fallback block derives bedrock's configured flag from the credentials
    # check that already ran, and reports every other provider as unconfigured.
    assert body["providers"] == {
        "bedrock": {"configured": body["aws"]["credentials"] == "ok"},
        "anthropic": {"configured": False},
        "openai": {"configured": False},
        "ollama": {"configured": False, "reachable": None},
    }
