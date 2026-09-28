"""Input validation: message length and stage enum."""
from unittest.mock import patch, MagicMock
import pytest


@pytest.fixture()
def client_with_mock():
    import main
    from fastapi.testclient import TestClient

    mock_response = {"reply": "ok", "sources": [], "grounded": False}

    with patch.object(main, "retrieve_context", return_value=[]), \
         patch.object(main, "_call_gemini", return_value="ok"):
        yield TestClient(main.app)


def test_empty_message(client_with_mock):
    r = client_with_mock.post("/ask", json={"message": ""})
    assert r.status_code == 422


def test_message_too_long(client_with_mock):
    r = client_with_mock.post("/ask", json={"message": "x" * 1001})
    assert r.status_code == 422


def test_message_max_length_accepted(client_with_mock):
    r = client_with_mock.post("/ask", json={"message": "x" * 1000})
    assert r.status_code == 200


def test_valid_stage(client_with_mock):
    r = client_with_mock.post("/ask", json={"message": "hello", "stage": "on-opt"})
    assert r.status_code == 200


def test_invalid_stage(client_with_mock):
    r = client_with_mock.post("/ask", json={"message": "hello", "stage": "not-a-stage"})
    assert r.status_code == 422


def test_null_stage_accepted(client_with_mock):
    r = client_with_mock.post("/ask", json={"message": "hello", "stage": None})
    assert r.status_code == 200


def test_all_valid_stages(client_with_mock):
    for stage in ("f1-studying", "applied-opt", "on-opt", "on-stem-opt"):
        r = client_with_mock.post("/ask", json={"message": "hello", "stage": stage})
        assert r.status_code == 200, f"stage {stage!r} was rejected"
