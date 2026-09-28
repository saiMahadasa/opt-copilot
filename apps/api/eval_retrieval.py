"""
Retrieval evaluation script — runs against the real Supabase + Gemini APIs.

Usage:
    python eval_retrieval.py

Requires .env with GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY set.
Never prints any env values or API keys.
"""

import os
import sys
from dotenv import load_dotenv
from google import genai
from supabase import create_client

load_dotenv()

EMBED_MODEL = "gemini-embedding-001"
MATCH_COUNT = 3

COVERED = [
    "What is the 90 day rule?",
    "Does my employer need E-Verify for STEM OPT?",
    "Can I do CPT before my program ends?",
    "When can I file for OPT?",
    "What is the Form I-983?",
    "Does part-time CPT affect OPT eligibility?",
    "Can I travel while my OPT application is pending?",
]

NOT_COVERED = [
    "My EAD card is late, who do I contact?",
    "How do I renew my F-1 visa stamp?",
    "How do I report a change of address?",
    "How do I bake a cake?",
]


def embed_query(client: genai.Client, text: str) -> list[float]:
    response = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
        config={"output_dimensionality": 768, "task_type": "RETRIEVAL_QUERY"},
    )
    return response.embeddings[0].values


def retrieve(db, vector: list[float]) -> list[dict]:
    result = db.rpc(
        "match_document_chunks",
        {"query_embedding": vector, "match_count": MATCH_COUNT},
    ).execute()
    return result.data or []


def run_questions(gemini_client, db, questions: list[str], label: str) -> list[float]:
    print(f"\n{'='*60}")
    print(f"{label}")
    print(f"{'='*60}")

    top_scores: list[float] = []

    for question in questions:
        print(f"\nQ: {question}")
        try:
            vector = embed_query(gemini_client, question)
            chunks = retrieve(db, vector)
        except Exception as exc:
            print(f"  ERROR: {exc}")
            sys.exit(1)

        if not chunks:
            print("  (no chunks returned)")
            top_scores.append(0.0)
            continue

        top = max(chunks, key=lambda c: c["similarity"])
        top_scores.append(round(top["similarity"], 2))

        for c in chunks:
            score = round(c["similarity"], 2)
            print(f"  {score:.2f}  {c['source']}")

        print(f"  top score: {round(top['similarity'], 2)}")

    return top_scores


def main() -> None:
    for var in ("GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"):
        if not os.environ.get(var):
            sys.exit(f"Error: {var} must be set in .env")

    gemini_client = genai.Client()
    db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    covered_scores = run_questions(gemini_client, db, COVERED, "COVERED (expect high scores)")
    not_covered_scores = run_questions(gemini_client, db, NOT_COVERED, "NOT COVERED (expect lower scores)")

    lowest_covered = min(covered_scores)
    highest_not_covered = max(not_covered_scores)

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Lowest top score among COVERED questions:     {lowest_covered:.2f}")
    print(f"Highest top score among NOT COVERED questions:{highest_not_covered:.2f}")

    if lowest_covered > highest_not_covered:
        midpoint = round((lowest_covered + highest_not_covered) / 2, 2)
        print(f"\nRanges do not overlap.")
        print(f"Suggested MIN_SIMILARITY: {midpoint}")
    else:
        suggested = round(lowest_covered - 0.03, 2)
        print(f"\nRanges OVERLAP (lowest covered {lowest_covered:.2f} <= highest not-covered {highest_not_covered:.2f}).")
        print(f"Suggested MIN_SIMILARITY: {suggested}  (lowest covered minus 0.03)")


if __name__ == "__main__":
    main()
