"""Similarity threshold filtering and grounding flags in the response."""
from unittest.mock import patch
import pytest


CHUNK_HIGH = {"source": "opt.md", "similarity": 0.85, "content": "The 90-day rule limits unemployment."}
CHUNK_LOW  = {"source": "cpt.md", "similarity": 0.30, "content": "CPT must be authorized by your DSO."}
CHUNK_MID  = {"source": "stem-opt.md", "similarity": 0.50, "content": "STEM OPT requires E-Verify."}


@pytest.fixture()
def client_base():
    import main
    from fastapi.testclient import TestClient
    with patch.object(main, "_call_gemini", return_value="mocked reply"):
        yield TestClient(main.app)


def _mock_retrieve(chunks):
    """Return a retrieve_context that yields the given pre-filtered chunks."""
    return lambda _msg: chunks


def test_grounded_true_when_chunk_passes(client_base):
    import main
    with patch.object(main, "retrieve_context", _mock_retrieve([CHUNK_HIGH])):
        r = client_base.post("/ask", json={"message": "90 day rule"})
    assert r.status_code == 200
    body = r.json()
    assert body["grounded"] is True
    assert len(body["sources"]) == 1
    assert body["sources"][0]["source"] == "opt.md"
    assert body["sources"][0]["score"] == 0.85


def test_grounded_false_when_no_chunks(client_base):
    import main
    with patch.object(main, "retrieve_context", _mock_retrieve([])):
        r = client_base.post("/ask", json={"message": "some question"})
    assert r.status_code == 200
    body = r.json()
    assert body["grounded"] is False
    assert body["sources"] == []


def test_multiple_sources_returned(client_base):
    import main
    with patch.object(main, "retrieve_context", _mock_retrieve([CHUNK_HIGH, CHUNK_MID])):
        r = client_base.post("/ask", json={"message": "OPT and STEM"})
    body = r.json()
    assert len(body["sources"]) == 2


def test_min_similarity_filters_in_retrieve_context():
    """retrieve_context itself should filter out chunks below MIN_SIMILARITY."""
    import main
    from unittest.mock import MagicMock

    raw_data = [
        {"source": "opt.md",      "similarity": 0.80, "content": "text"},
        {"source": "cpt.md",      "similarity": 0.20, "content": "text"},
        {"source": "stem-opt.md", "similarity": 0.60, "content": "text"},
    ]

    mock_db = MagicMock()
    mock_db.rpc.return_value.execute.return_value.data = raw_data

    mock_embed_response = MagicMock()
    mock_embed_response.embeddings = [MagicMock(values=[0.1] * 768)]

    mock_client = MagicMock()
    mock_client.models.embed_content.return_value = mock_embed_response

    with patch("main.os.environ.get", side_effect=lambda k, d=None: {
            "SUPABASE_URL": "http://fake", "SUPABASE_KEY": "fake"}.get(k, d)), \
         patch("main.MIN_SIMILARITY", 0.5), \
         patch("google.genai.Client", return_value=mock_client), \
         patch("supabase.create_client", return_value=mock_db):
        result = main.retrieve_context("test")

    sources = [c["source"] for c in result]
    assert "opt.md" in sources
    assert "stem-opt.md" in sources
    assert "cpt.md" not in sources
