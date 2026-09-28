"""
Standalone ingestion script — run after running fetch_sources.py.

Schema (fresh install — run once in Supabase SQL editor)
---------------------------------------------------------
    create extension if not exists vector;

    create table document_chunks (
      id            bigserial    primary key,
      source        text         not null,
      source_id     text,
      source_url    text,
      title         text,
      section       text,
      authority     text,
      retrieved_at  timestamptz,
      content_hash  text,
      content       text         not null,
      embedding     vector(768)
    );

    create index on document_chunks
      using ivfflat (embedding vector_cosine_ops)
      with (lists = 100);

    create or replace function match_document_chunks(
      query_embedding vector(768),
      match_count     int default 5
    )
    returns table (
      id            bigint,
      source        text,
      source_id     text,
      source_url    text,
      title         text,
      section       text,
      authority     text,
      retrieved_at  timestamptz,
      content_hash  text,
      content       text,
      similarity    float
    )
    language sql stable
    as $$
      select id, source, source_id, source_url, title, section,
             authority, retrieved_at, content_hash, content,
             1 - (embedding <=> query_embedding) as similarity
      from document_chunks
      where 1 - (embedding <=> query_embedding) > 0.5
      order by embedding <=> query_embedding
      limit match_count;
    $$;

Migration (if table already exists)
-------------------------------------
    alter table document_chunks add column if not exists source_id    text;
    alter table document_chunks add column if not exists source_url   text;
    alter table document_chunks add column if not exists title        text;
    alter table document_chunks add column if not exists section      text;
    alter table document_chunks add column if not exists authority    text;
    alter table document_chunks add column if not exists retrieved_at timestamptz;
    alter table document_chunks add column if not exists content_hash text;

Usage
-----
    python ingest.py
"""

import hashlib
import os
import re
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv
from google import genai
from supabase import create_client, Client

load_dotenv()

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
SNAPSHOTS_DIR = KNOWLEDGE_DIR / "snapshots"
SOURCES_YML   = KNOWLEDGE_DIR / "sources.yml"
EMBED_MODEL   = "gemini-embedding-001"
CHUNK_MIN     = 150
CHUNK_MAX     = 350


# ── Snapshot parsing ──────────────────────────────────────────────────────────

def _parse_snapshot(path: Path) -> tuple[dict, str]:
    """Return (front_matter_dict, body) from a snapshot .md file."""
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n\n?", text, re.DOTALL)
    if m:
        meta = yaml.safe_load(m.group(1)) or {}
        body = text[m.end():]
    else:
        meta = {}
        body = text
    return meta, body


# ── Section-aware chunking ────────────────────────────────────────────────────

_HEADING_RE   = re.compile(r"^#{1,6}\s+(.+)$")
# eCFR paragraph labels: (f), (f)(1), (f)(10)(ii), etc.
_ECFR_LABEL_RE = re.compile(r"^\s*(\([a-zA-Z0-9]+\)(?:\([a-zA-Z0-9]+\))*)\s+\S")


def _extract_section_label(para: str) -> tuple[str | None, bool]:
    """Return (label, heading_only).

    heading_only=True means the paragraph is a heading line whose text should
    become the section label but should not itself be added to chunk content.
    """
    m = _HEADING_RE.match(para.strip())
    if m:
        return m.group(1).strip(), True
    m = _ECFR_LABEL_RE.match(para.strip())
    if m:
        return m.group(1), False
    return None, False


def chunk_snapshot(body: str, source_title: str) -> list[dict[str, str]]:
    """Split body into CHUNK_MIN–CHUNK_MAX word chunks with section labels.

    Markdown headings become section labels (not chunk content).
    eCFR paragraph labels at depth <= 2 (e.g. (f)(1)) trigger a new chunk
    boundary once the current buffer is at least CHUNK_MIN words.
    Each chunk's content is prefixed with [{section}] for retrieval context.
    """
    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    chunks: list[dict[str, str]] = []

    section   = source_title
    buf: list[str] = []
    buf_words = 0

    def flush() -> None:
        nonlocal buf, buf_words
        if not buf:
            return
        text = "\n\n".join(buf)
        content = f"[{section}]\n\n{text}"
        if chunks and buf_words < CHUNK_MIN:
            chunks[-1]["content"] += "\n\n" + text
        else:
            chunks.append({"section": section, "content": content})
        buf.clear()
        buf_words = 0

    for para in paragraphs:
        label, heading_only = _extract_section_label(para)
        words = len(para.split())

        if heading_only and label:
            flush()
            section = label
            continue  # heading text → label only, not chunk content

        depth = label.count("(") if label else 0

        # eCFR top-level boundary (depth ≤ 2) — start new chunk if buffer ready
        if label and depth <= 2 and buf_words >= CHUNK_MIN:
            flush()
            section = label

        # Overflow boundary
        if buf_words + words > CHUNK_MAX and buf_words >= CHUNK_MIN:
            flush()

        buf.append(para)
        buf_words += words

    flush()
    return chunks


# ── Embedding ─────────────────────────────────────────────────────────────────

def embed(client: genai.Client, text: str) -> list[float]:
    response = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
        config={"output_dimensionality": 768, "task_type": "RETRIEVAL_DOCUMENT"},
    )
    return response.embeddings[0].values


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        sys.exit("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("Error: GEMINI_API_KEY must be set in .env")

    db: Client = create_client(supabase_url, supabase_key)
    gemini = genai.Client()

    # Load sources.yml for authority metadata
    sources_meta: dict[str, dict] = {}
    if SOURCES_YML.exists():
        manifest = yaml.safe_load(SOURCES_YML.read_text(encoding="utf-8")) or {}
        for s in manifest.get("sources", []):
            sources_meta[s["id"]] = s

    # Primary: read from knowledge/snapshots/ (official-source pipeline)
    snapshot_files = sorted(SNAPSHOTS_DIR.glob("*.md"))

    # Fallback: read legacy knowledge/*.md files that have no YAML front matter
    legacy_files = [
        f for f in sorted(KNOWLEDGE_DIR.glob("*.md"))
        if not f.read_text(encoding="utf-8").startswith("---")
    ]

    all_files: list[tuple[Path, bool]] = (
        [(f, True)  for f in snapshot_files] +
        [(f, False) for f in legacy_files]
    )

    if not all_files:
        print("No files to ingest. Run fetch_sources.py first, or add .md files to knowledge/.")
        return

    total_inserted = 0

    for path, is_snapshot in all_files:
        if is_snapshot:
            meta, body = _parse_snapshot(path)
            if meta.get("blocked"):
                print(f"\n[skip] {path.name} — blocked snapshot, no content")
                continue
            if not body.strip():
                print(f"\n[skip] {path.name} — empty snapshot")
                continue
            source_id    = meta.get("id", path.stem)
            source_url   = meta.get("url", "")
            title        = meta.get("title", path.stem)
            retrieved_at = meta.get("retrieved_at", "")
            authority    = sources_meta.get(source_id, {}).get("authority", "")
        else:
            meta, body = {}, path.read_text(encoding="utf-8")
            source_id    = path.stem
            source_url   = ""
            title        = path.stem.replace("-", " ").title()
            retrieved_at = ""
            authority    = ""

        chunks = chunk_snapshot(body, title)
        print(f"\n{path.name}: {len(chunks)} chunk(s)")

        # Clear existing rows for this source
        db.table("document_chunks").delete().eq("source_id", source_id).execute()
        db.table("document_chunks").delete().eq("source", path.name).execute()
        print(f"  [~] cleared existing rows for {source_id}")

        for i, chunk in enumerate(chunks, 1):
            content_hash = hashlib.sha256(chunk["content"].encode()).hexdigest()
            try:
                vector = embed(gemini, chunk["content"])
            except Exception as exc:
                print(f"  WARNING: skipping chunk {i}/{len(chunks)} — {exc}")
                continue

            db.table("document_chunks").insert({
                "source":       path.name,
                "source_id":    source_id,
                "source_url":   source_url,
                "title":        title,
                "section":      chunk["section"],
                "authority":    authority,
                "retrieved_at": retrieved_at,
                "content_hash": content_hash,
                "content":      chunk["content"],
                "embedding":    vector,
            }).execute()

            print(
                f"  [+] chunk {i}/{len(chunks)}"
                f"  section={chunk['section'][:40]!r}"
                f"  ({len(chunk['content'].split())} words)"
            )
            total_inserted += 1

    print(f"\nDone. {total_inserted} chunk(s) inserted.")


if __name__ == "__main__":
    main()
