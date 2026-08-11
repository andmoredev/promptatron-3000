"""Tests for the uniform JSON error envelope."""


async def test_unknown_route_returns_uniform_404_envelope(client):
    response = await client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == "not_found"
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["detail"] is None


async def test_app_error_returns_uniform_envelope(client):
    response = await client.get("/api/v1/_test/boom")
    assert response.status_code == 400
    body = response.json()
    assert body == {
        "error": {
            "code": "bad_request",
            "message": "deliberate test error",
            "detail": {"field": "value"},
        }
    }
