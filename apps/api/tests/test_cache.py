"""In-memory response cache: hits, misses, TTL expiry, max-size eviction."""
import time
from unittest.mock import patch, call
import pytest


@pytest.fixture()
def client_patched():
    import main
    from fastapi.testclient import TestClient
    with patch.object(main, "retrieve_context", return_value=[]):
        yield TestClient(main.app)


def test_cache_hit_skips_gemini(client_patched):
    import main
    call_count = {"n": 0}

    def counting_gemini(prompt):
        call_count["n"] += 1
        return "reply"

    with patch.object(main, "_call_gemini", side_effect=counting_gemini):
        client_patched.post("/ask", json={"message": "cache test"})
        client_patched.post("/ask", json={"message": "cache test"})

    assert call_count["n"] == 1, "Gemini should only be called once for the same message"


def test_different_messages_both_call_gemini(client_patched):
    import main
    call_count = {"n": 0}

    def counting_gemini(prompt):
        call_count["n"] += 1
        return "reply"

    with patch.object(main, "_call_gemini", side_effect=counting_gemini):
        client_patched.post("/ask", json={"message": "question one"})
        client_patched.post("/ask", json={"message": "question two"})

    assert call_count["n"] == 2


def test_cache_key_is_case_insensitive(client_patched):
    import main
    call_count = {"n": 0}

    def counting_gemini(prompt):
        call_count["n"] += 1
        return "reply"

    with patch.object(main, "_call_gemini", side_effect=counting_gemini):
        client_patched.post("/ask", json={"message": "OPT rules"})
        client_patched.post("/ask", json={"message": "opt rules"})

    assert call_count["n"] == 1


def test_cache_ttl_expiry():
    import main
    main._cache.clear()
    key = "expired|"
    from main import AskResponse, ChunkSource
    main._cache[key] = (time.time() - main.CACHE_TTL - 1, AskResponse(reply="old", sources=[], grounded=False))
    result = main._cache_get(key)
    assert result is None
    assert key not in main._cache


def test_cache_max_size_evicts_oldest():
    import main
    main._cache.clear()
    from main import AskResponse

    dummy = AskResponse(reply="x", sources=[], grounded=False)
    now = time.time()
    for i in range(main.CACHE_MAX):
        main._cache[f"key{i}"] = (now + i, dummy)

    main._cache_set("new_key", dummy)

    assert len(main._cache) == main.CACHE_MAX
    assert "key0" not in main._cache
    assert "new_key" in main._cache


def test_stage_differentiates_cache(client_patched):
    import main
    call_count = {"n": 0}

    def counting_gemini(prompt):
        call_count["n"] += 1
        return "reply"

    with patch.object(main, "_call_gemini", side_effect=counting_gemini):
        client_patched.post("/ask", json={"message": "hello", "stage": "on-opt"})
        client_patched.post("/ask", json={"message": "hello", "stage": "on-stem-opt"})
        client_patched.post("/ask", json={"message": "hello", "stage": "on-opt"})

    assert call_count["n"] == 2
