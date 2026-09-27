"""
Standalone ingestion script — run manually after filling in knowledge/*.md.

Before running, execute this SQL in your Supabase SQL editor:

    create extension if not exists vector;

    create table document_chunks (
      id        bigserial primary key,
      source    text      not null,
      content   text      not null,
      embedding vector(768)
    );

    create index on document_chunks
      using ivfflat (embedding vector_cosine_ops)
      with (lists = 100);

Usage:
    python ingest.py
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from supabase import create_client, Client

load_dotenv()

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
EMBED_MODEL = "text-embedding-004"
MAX_WORDS = 500


def chunk_text(text: str, max_words: int = MAX_WORDS) -> list[str]:
    """Split text at paragraph boundaries into chunks of ~max_words words."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_count = 0

    for para in paragraphs:
        word_count = len(para.split())
        if current_count + word_count > max_words and current:
            chunks.append("\n\n".join(current))
            current = [para]
            current_count = word_count
        else:
            current.append(para)
            current_count += word_count

    if current:
        chunks.append("\n\n".join(current))

    return chunks


def embed(client: genai.Client, text: str) -> list[float]:
    response = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
    )
    return response.embeddings[0].values


def main() -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        sys.exit("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")

    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("Error: GEMINI_API_KEY must be set in .env")

    db: Client = create_client(supabase_url, supabase_key)
    gemini = genai.Client()

    md_files = sorted(KNOWLEDGE_DIR.glob("*.md"))
    if not md_files:
        print("No .md files found in knowledge/ — nothing to ingest.")
        return

    total_inserted = 0

    for md_file in md_files:
        source = md_file.name
        text = md_file.read_text(encoding="utf-8")
        chunks = chunk_text(text)
        print(f"\n{source}: {len(chunks)} chunk(s)")

        for i, chunk in enumerate(chunks, 1):
            try:
                vector = embed(gemini, chunk)
            except Exception as exc:
                print(f"  WARNING: skipping chunk {i}/{len(chunks)} — {exc}")
                continue

            db.table("document_chunks").insert(
                {"source": source, "content": chunk, "embedding": vector}
            ).execute()

            print(f"  [+] chunk {i}/{len(chunks)}  ({len(chunk.split())} words)")
            total_inserted += 1

    print(f"\nDone. {total_inserted} chunk(s) inserted across {len(md_files)} file(s).")


if __name__ == "__main__":
    main()
