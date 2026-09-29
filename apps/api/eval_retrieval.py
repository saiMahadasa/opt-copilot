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
# expected_source uses source_id from sources.yml (e.g. "ecfr_8cfr214_2_f"), not filename.
# Legacy hand-written files use source_id = stem of filename (e.g. "opt", "stem-opt", "cpt").
#
# A covered question passes when:  top_score >= MIN_SIMILARITY AND top_source_id == expected_source
# A not_covered question passes when: top_score < MIN_SIMILARITY
QUESTIONS = [
    # ── original covered (legacy hand-written files) ──────────────────────────
    {"question": "What is the 90 day rule?",
     "expected": "covered", "expected_source": "opt"},
    {"question": "Does my employer need E-Verify for STEM OPT?",
     "expected": "covered", "expected_source": "stem-opt"},
    {"question": "Can I do CPT before my program ends?",
     "expected": "covered", "expected_source": "cpt"},
    {"question": "When can I file for OPT?",
     "expected": "covered", "expected_source": "opt"},
    {"question": "What is the Form I-983?",
     "expected": "covered", "expected_source": "stem-opt"},
    {"question": "Does part-time CPT affect OPT eligibility?",
     "expected": "covered", "expected_source": "cpt"},
    {"question": "Can I travel while my OPT application is pending?",
     "expected": "covered", "expected_source": "opt"},

    # ── STEM OPT reporting (official eCFR source) ─────────────────────────────
    {"question": "How often do I need to report to my DSO while on STEM OPT?",
     "expected": "covered", "expected_source": "ecfr_8cfr214_2_f"},
    {"question": "What are the STEM OPT validation report requirements?",
     "expected": "covered", "expected_source": "ecfr_8cfr214_2_f"},
    {"question": "Does the 12-month STEM OPT report require a self-evaluation?",
     "expected": "covered", "expected_source": "ecfr_8cfr214_2_f"},

    # ── original not-covered ──────────────────────────────────────────────────
    {"question": "My EAD card is late, who do I contact?",
     "expected": "not_covered"},
    {"question": "How do I renew my F-1 visa stamp?",
     "expected": "not_covered"},
    {"question": "How do I report a change of address?",
     "expected": "not_covered"},
    {"question": "How do I bake a cake?",
     "expected": "not_covered"},

    # ── short / casual / typo variants ───────────────────────────────────────
    {"question": "90 days unemployed on OPT?",
     "expected": "covered", "expected_source": "opt"},
    {"question": "do i need eveerify for stem opt",           # typo: eveerify
     "expected": "covered", "expected_source": "stem-opt"},
    {"question": "cpt authorization before graduation",
     "expected": "covered", "expected_source": "cpt"},
    {"question": "opt application timing",
     "expected": "covered", "expected_source": "opt"},
    {"question": "i-983 training plan form",
     "expected": "covered", "expected_source": "stem-opt"},

    # ── known gaps ────────────────────────────────────────────────────────────
    {"question": "How long does the OPT EAD take to arrive?",
     "expected": "not_covered",
     "known_gap": "no EAD timing content yet"},
    {"question": "Can I work off campus on F-1 in my first year?",
     "expected": "not_covered",
     "known_gap": "no off-campus work content yet"},
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
    known_gaps: list[dict] = []

    for item in QUESTIONS:
        q = item["question"]
        expected = item["expected"]
        expected_source = item.get("expected_source")
        known_gap = item.get("known_gap")

        try:
            vector = embed_query(gemini_client, q)
            chunks = retrieve(db, vector)
        except Exception as exc:
            print(f"ERROR on question: {q!r}\n  {exc}")
            sys.exit(1)

        top_score = round(chunks[0]["similarity"], 2) if chunks else 0.0
        # Use source_id when available; fall back to source filename for old rows
        top_source = (
            chunks[0].get("source_id") or chunks[0].get("source", "(none)")
        ) if chunks else "(none)"
        top_authority = chunks[0].get("authority") or "?" if chunks else "(none)"

        # summary_only: chunks retrieved but none are official
        OFFICIAL = {"regulation", "policy", "guidance"}
        has_official = any(c.get("authority") in OFFICIAL for c in chunks)
        summary_only = bool(chunks) and not has_official

        # Determine pass/fail
        if expected == "covered":
            passed = top_score >= MIN_SIMILARITY and top_source == expected_source
        else:
            passed = top_score < MIN_SIMILARITY

        if passed:
            verdict = "PASS"
        elif known_gap:
            verdict = "KNOWN GAP"
        else:
            verdict = "FAIL"

        # Per-question line
        summary_tag = "  [summary-only]" if summary_only else ""
        if expected == "covered":
            print(f"[{verdict}]{summary_tag} {q}")
            for c in chunks:
                sid  = c.get("source_id") or c.get("source", "?")
                auth = c.get("authority") or "?"
                marker = " <-- expected" if sid == expected_source else ""
                print(f"       {round(c['similarity'], 2):.2f}  {sid}  ({auth}){marker}")
        else:
            gap_note = f"  ({known_gap})" if known_gap and not passed else ""
            print(f"[{verdict}]{gap_note}{summary_tag} {q}")
            for c in chunks:
                sid  = c.get("source_id") or c.get("source", "?")
                auth = c.get("authority") or "?"
                print(f"       {round(c['similarity'], 2):.2f}  {sid}  ({auth})")

        if passed:
            passes.append(q)
        elif known_gap:
            known_gaps.append({
                "question": q,
                "known_gap": known_gap,
                "top_score": top_score,
                "top_source_id": top_source,
                "top_authority": top_authority,
            })
        else:
            failures.append({
                "question": q,
                "expected": expected,
                "expected_source": expected_source,
                "top_score": top_score,
                "top_source_id": top_source,
                "top_authority": top_authority,
                "summary_only": summary_only,
            })

    # Summary
    print(f"\n{'='*60}")
    print(
        f"RESULTS: {len(passes)} passed, {len(failures)} failed, "
        f"{len(known_gaps)} known gap(s)  (out of {len(QUESTIONS)})"
    )
    print(f"{'='*60}")

    if known_gaps:
        print(f"\nKNOWN GAPS ({len(known_gaps)} remaining):")
        for g in known_gaps:
            print(
                f"  - {g['question']!r}\n"
                f"    gap: {g['known_gap']}  |  "
                f"top source_id={g['top_source_id']} score={g['top_score']}"
            )

    if failures:
        print("\nFAILURES:")
        for f in failures:
            if f["expected"] == "covered":
                summary_note = "  [summary-only — no official chunk]" if f.get("summary_only") else ""
                print(
                    f"  - {f['question']!r}\n"
                    f"    expected source_id={f['expected_source']} score>={MIN_SIMILARITY}, "
                    f"got source_id={f['top_source_id']} authority={f['top_authority']} "
                    f"score={f['top_score']}{summary_note}"
                )
            else:
                print(
                    f"  - {f['question']!r}\n"
                    f"    expected score<{MIN_SIMILARITY} (not covered), "
                    f"got source_id={f['top_source_id']} authority={f['top_authority']} "
                    f"score={f['top_score']}"
                )
        sys.exit(1)


if __name__ == "__main__":
    main()
