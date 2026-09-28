"""
Retrieval evaluation script — runs against the real Supabase + Gemini APIs.

Usage:
    python eval_retrieval.py

Requires .env with GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY set.
Never prints any env values or API keys.

Exit code 0 = all pass, 1 = one or more failures.
"""

import os
import sys
from dotenv import load_dotenv
from google import genai
from supabase import create_client

load_dotenv()

EMBED_MODEL = "gemini-embedding-001"
MATCH_COUNT = 3
MIN_SIMILARITY = float(os.environ.get("MIN_SIMILARITY", "0.66"))

# Each dict: question, expected ("covered"|"not_covered"), expected_source (covered only).
# A covered question passes when:  top_score >= MIN_SIMILARITY AND top_source == expected_source
# A not_covered question passes when: top_score < MIN_SIMILARITY
QUESTIONS = [
    # ── original covered ──────────────────────────────────────────────────────
    {"question": "What is the 90 day rule?",
     "expected": "covered", "expected_source": "opt.md"},
    {"question": "Does my employer need E-Verify for STEM OPT?",
     "expected": "covered", "expected_source": "stem-opt.md"},
    {"question": "Can I do CPT before my program ends?",
     "expected": "covered", "expected_source": "cpt.md"},
    {"question": "When can I file for OPT?",
     "expected": "covered", "expected_source": "opt.md"},
    {"question": "What is the Form I-983?",
     "expected": "covered", "expected_source": "stem-opt.md"},
    {"question": "Does part-time CPT affect OPT eligibility?",
     "expected": "covered", "expected_source": "cpt.md"},
    {"question": "Can I travel while my OPT application is pending?",
     "expected": "covered", "expected_source": "opt.md"},

    # ── original not-covered ──────────────────────────────────────────────────
    {"question": "My EAD card is late, who do I contact?",
     "expected": "not_covered"},
    {"question": "How do I renew my F-1 visa stamp?",
     "expected": "not_covered"},
    {"question": "How do I report a change of address?",
     "expected": "not_covered"},
    {"question": "How do I bake a cake?",
     "expected": "not_covered"},

    # ── new covered: short / casual / typo variants ───────────────────────────
    {"question": "90 days unemployed on OPT?",
     "expected": "covered", "expected_source": "opt.md"},
    {"question": "do i need eveerify for stem opt",           # typo: eveerify
     "expected": "covered", "expected_source": "stem-opt.md"},
    {"question": "cpt authorization before graduation",
     "expected": "covered", "expected_source": "cpt.md"},
    {"question": "opt application timing",
     "expected": "covered", "expected_source": "opt.md"},
    {"question": "i-983 training plan form",
     "expected": "covered", "expected_source": "stem-opt.md"},

    # ── new not-covered: near-miss questions ──────────────────────────────────
    {"question": "How long does the OPT EAD take to arrive?",
     "expected": "not_covered"},
    {"question": "Can I work off campus on F-1 in my first year?",
     "expected": "not_covered"},
    {"question": "What is a cap-gap extension?",
     "expected": "not_covered"},
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


def main() -> None:
    for var in ("GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"):
        if not os.environ.get(var):
            sys.exit(f"Error: {var} must be set in .env")

    gemini_client = genai.Client()
    db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    print(f"MIN_SIMILARITY = {MIN_SIMILARITY}")
    print(f"Running {len(QUESTIONS)} questions...\n")

    passes: list[str] = []
    failures: list[dict] = []

    for item in QUESTIONS:
        q = item["question"]
        expected = item["expected"]
        expected_source = item.get("expected_source")

        try:
            vector = embed_query(gemini_client, q)
            chunks = retrieve(db, vector)
        except Exception as exc:
            print(f"ERROR on question: {q!r}\n  {exc}")
            sys.exit(1)

        top_score = round(chunks[0]["similarity"], 2) if chunks else 0.0
        top_source = chunks[0]["source"] if chunks else "(none)"

        # Determine pass/fail
        if expected == "covered":
            passed = top_score >= MIN_SIMILARITY and top_source == expected_source
        else:
            passed = top_score < MIN_SIMILARITY

        verdict = "PASS" if passed else "FAIL"

        # Per-question line
        source_display = f"{top_source} ({top_score:.2f})"
        if expected == "covered":
            print(f"[{verdict}] {q}")
            for c in chunks:
                marker = " <-- expected" if c["source"] == expected_source else ""
                print(f"       {round(c['similarity'], 2):.2f}  {c['source']}{marker}")
        else:
            print(f"[{verdict}] {q}")
            for c in chunks:
                print(f"       {round(c['similarity'], 2):.2f}  {c['source']}")

        if passed:
            passes.append(q)
        else:
            failures.append({
                "question": q,
                "expected": expected,
                "expected_source": expected_source,
                "top_score": top_score,
                "top_source": top_source,
            })

    # Summary
    print(f"\n{'='*60}")
    print(f"RESULTS: {len(passes)} passed, {len(failures)} failed  (out of {len(QUESTIONS)})")
    print(f"{'='*60}")

    if failures:
        print("\nFAILURES:")
        for f in failures:
            if f["expected"] == "covered":
                print(
                    f"  - {f['question']!r}\n"
                    f"    expected source={f['expected_source']} score>={MIN_SIMILARITY}, "
                    f"got source={f['top_source']} score={f['top_score']}"
                )
            else:
                print(
                    f"  - {f['question']!r}\n"
                    f"    expected score<{MIN_SIMILARITY} (not covered), "
                    f"got source={f['top_source']} score={f['top_score']}"
                )
        sys.exit(1)


if __name__ == "__main__":
    main()
