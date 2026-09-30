"""Similarity threshold filtering, grounding flags, and source ranking."""
from unittest.mock import patch
import pytest


CHUNK_HIGH = {
    "source": "opt.md", "source_id": "uscis_opt", "source_url": "https://uscis.gov/opt",
    "title": "USCIS OPT", "section": "(f)(10)(ii)", "authority": "guidance",
    "retrieved_at": "2026-09-28T00:00:00Z", "content_hash": "abc",
    "similarity": 0.85, "content": "The 90-day rule limits unemployment.",
}
CHUNK_LOW = {
    "source": "cpt.md", "source_id": "uscis_cpt", "source_url": "",
    "title": "USCIS CPT", "section": "", "authority": "guidance",
    "retrieved_at": "", "content_hash": "def",
    "similarity": 0.30, "content": "CPT must be authorized by your DSO.",
}
CHUNK_MID = {
    "source": "stem-opt.md", "source_id": "uscis_stem_opt", "source_url": "",
    "title": "USCIS STEM OPT", "section": "(f)(10)(ii)(C)", "authority": "guidance",
    "retrieved_at": "2026-09-28T00:00:00Z", "content_hash": "ghi",
    "similarity": 0.50, "content": "STEM OPT requires E-Verify.",
}
CHUNK_SUMMARY = {
    "source": "opt.md", "source_id": "opt", "source_url": "",
    "title": "Summary guide (not official text)", "section": "",
    "authority": "summary", "retrieved_at": "", "content_hash": "xyz",
    "similarity": 0.85, "content": "The 90-day rule limits unemployment.",
}


@pytest.fixture()
def client_base():
    import main
    from fastapi.testclient import TestClient
    with patch.object(main, "_call_gemini_with_tools", return_value=("mocked reply", False)):
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
    assert body["summary_only"] is False
    assert len(body["sources"]) == 1
    assert body["sources"][0]["title"] == "USCIS OPT"
    assert body["sources"][0]["url"] == "https://uscis.gov/opt"
    assert body["sources"][0]["section"] == "(f)(10)(ii)"
    assert body["sources"][0]["score"] == 0.85


def test_grounded_false_when_no_chunks(client_base):
    import main
    with patch.object(main, "retrieve_context", _mock_retrieve([])):
        r = client_base.post("/ask", json={"message": "some question"})
    assert r.status_code == 200
    body = r.json()
    assert body["grounded"] is False
    assert body["summary_only"] is False
    assert body["sources"] == []


def test_multiple_sources_returned(client_base):
    import main
    with patch.object(main, "retrieve_context", _mock_retrieve([CHUNK_HIGH, CHUNK_MID])):
        r = client_base.post("/ask", json={"message": "OPT and STEM"})
    body = r.json()
    assert len(body["sources"]) == 2


def test_summary_only_when_only_summary_chunk(client_base):
    """summary chunk alone → grounded=False, summary_only=True."""
    import main
    with patch.object(main, "retrieve_context", _mock_retrieve([CHUNK_SUMMARY])):
        r = client_base.post("/ask", json={"message": "90 day rule"})
    assert r.status_code == 200
    body = r.json()
    assert body["grounded"] is False
    assert body["summary_only"] is True
    assert len(body["sources"]) == 1
    assert body["sources"][0]["title"] == "Summary guide (not official text)"


def test_official_ranked_before_summary(client_base):
    """Official chunk should appear first even when summary has equal or higher score."""
    import main
    # summary chunk comes first in the mock output; endpoint must reorder
    with patch.object(main, "retrieve_context", _mock_retrieve([CHUNK_SUMMARY, CHUNK_HIGH])):
        r = client_base.post("/ask", json={"message": "90 day rule"})
    body = r.json()
    assert body["sources"][0]["title"] == "USCIS OPT"
    assert body["grounded"] is True
    assert body["summary_only"] is False


def test_mixed_official_and_summary_grounded_true(client_base):
    """When official + summary chunks both match, grounded=True, summary_only=False."""
    import main
    with patch.object(main, "retrieve_context", _mock_retrieve([CHUNK_HIGH, CHUNK_SUMMARY])):
        r = client_base.post("/ask", json={"message": "90 day rule"})
    body = r.json()
    assert body["grounded"] is True
    assert body["summary_only"] is False


def test_min_similarity_filters_in_retrieve_context():
    """retrieve_context itself should filter out chunks below MIN_SIMILARITY."""
    import main
    from unittest.mock import MagicMock

    raw_data = [
        {"source": "opt.md",      "source_id": "uscis_opt",      "authority": "guidance", "similarity": 0.80, "content": "text"},
        {"source": "cpt.md",      "source_id": "uscis_cpt",      "authority": "guidance", "similarity": 0.20, "content": "text"},
        {"source": "stem-opt.md", "source_id": "uscis_stem_opt", "authority": "guidance", "similarity": 0.60, "content": "text"},
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


def test_official_sorted_first_in_retrieve_context():
    """retrieve_context sorts official chunks before summary chunks."""
    import main
    from unittest.mock import MagicMock

    raw_data = [
        {"source": "opt.md",     "source_id": "opt",     "authority": "summary",   "similarity": 0.90, "content": "summary text"},
        {"source": "ecfr.md",    "source_id": "ecfr",    "authority": "regulation", "similarity": 0.75, "content": "official text"},
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

    # regulation chunk should be first despite lower similarity
    assert result[0]["source_id"] == "ecfr"
    assert result[1]["source_id"] == "opt"
