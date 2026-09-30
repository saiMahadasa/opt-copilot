"""Per-IP rate limiting: 10/min and 100/day."""
from unittest.mock import patch
import pytest


@pytest.fixture()
def client_patched():
    import main
    from fastapi.testclient import TestClient

    with patch.object(main, "retrieve_context", return_value=[]), \
         patch.object(main, "_call_gemini_with_tools", return_value=("ok", False)):
        yield TestClient(main.app)


def post(client, n=1):
    responses = []
    for _ in range(n):
        r = client.post("/ask", json={"message": "hello"})
        responses.append(r)
    return responses


def test_under_minute_limit(client_patched):
    responses = post(client_patched, 10)
    assert all(r.status_code == 200 for r in responses)


def test_exceeds_minute_limit(client_patched):
    post(client_patched, 10)
    r = client_patched.post("/ask", json={"message": "hello"})
    assert r.status_code == 429
    assert "Too many requests" in r.json()["detail"]


def test_different_ips_independent(client_patched):
    for _ in range(10):
        client_patched.post("/ask", json={"message": "hello"}, headers={"X-Forwarded-For": "1.1.1.1"})
    # Same IP should be rate-limited
    r = client_patched.post("/ask", json={"message": "hello"}, headers={"X-Forwarded-For": "1.1.1.1"})
    assert r.status_code == 429
    # Different IP should still be allowed
    r2 = client_patched.post("/ask", json={"message": "hello"}, headers={"X-Forwarded-For": "2.2.2.2"})
    assert r2.status_code == 200
