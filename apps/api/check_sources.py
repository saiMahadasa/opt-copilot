"""
check_sources.py — re-fetch approved sources and compare against cached snapshots.

For each approved source in knowledge/sources.yml:
  - Re-fetches the content (respects robots.txt, 2-second delay, back-off retry).
  - Compares the sha256 hash of the new content against the stored snapshot.
  - Prints: CHANGED | UNCHANGED | BLOCKED | ERROR.
  - For CHANGED sources, prints a short diff summary (first 400 chars of new content).

Add this as a weekly manual step (cron or calendar reminder):
    python check_sources.py

It does NOT automatically update snapshots or re-ingest. If a source is CHANGED,
review the diff manually, then run:
    python fetch_sources.py --force <source-id>
    python ingest.py
"""

import hashlib
import re
import sys
from pathlib import Path

import yaml

# Reuse fetch helpers from fetch_sources.py
from fetch_sources import (
    SNAPSHOTS,
    SOURCES_YML,
    _fetch_raw,
    _robots_allowed,
    _extract_ecfr_paragraph_f,
    _extract_html_main,
    _extract_pdf,
    _read_snapshot_meta,
)


def _body_from_snapshot(source_id: str) -> str:
    """Return the stored body text from a snapshot (strips front matter)."""
    path = SNAPSHOTS / f"{source_id}.md"
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n.*?\n---\n\n?", text, re.DOTALL)
    return text[m.end():] if m else text


def _fetch_body(entry: dict) -> tuple[str, str]:
    """Fetch fresh body for entry. Returns (body, status_tag).

    status_tag is one of: "ok" | "blocked" | "error:<msg>".
    """
    url = entry.get("url", "")
    fetch_url = entry.get("fetch_url", url)
    src_type = entry.get("type", "html")

    if not _robots_allowed(fetch_url):
        return "", "blocked"

    try:
        status, data, final_url = _fetch_raw(fetch_url)
    except Exception as exc:
        return "", f"error:{exc}"

    if status == 403:
        return "", "blocked"

    if "unblock.federalregister.gov" in final_url or b"Just a moment" in data[:500]:
        return "", "blocked"

    try:
        if src_type == "ecfr":
            body = _extract_ecfr_paragraph_f(data)
        elif src_type == "pdf":
            body = _extract_pdf(data)
        else:
            body = _extract_html_main(data, final_url)
    except Exception as exc:
        return "", f"error:{exc}"

    return body, "ok"


def _short_diff(old: str, new: str, chars: int = 400) -> str:
    """Return a short summary of what changed between old and new text."""
    old_words = set(old.split())
    new_words = set(new.split())
    added   = new_words - old_words
    removed = old_words - new_words
    lines = []
    if added:
        sample = " ".join(list(added)[:20])
        lines.append(f"  + new words: {sample}")
    if removed:
        sample = " ".join(list(removed)[:20])
        lines.append(f"  - removed words: {sample}")
    # Also show first 400 chars of new body for context
    excerpt = new[:chars].replace("\n", " ")
    lines.append(f"  new content (first {chars} chars): {excerpt!r}")
    return "\n".join(lines)


def main() -> None:
    if not SOURCES_YML.exists():
        sys.exit(f"Error: {SOURCES_YML} not found")

    manifest = yaml.safe_load(SOURCES_YML.read_text(encoding="utf-8")) or {}
    approved = [s for s in manifest.get("sources", []) if s.get("status") == "approved"]

    print(f"Checking {len(approved)} approved source(s)...\n")

    results: dict[str, list[str]] = {"CHANGED": [], "UNCHANGED": [], "BLOCKED": [], "ERROR": []}

    for entry in approved:
        sid = entry["id"]
        print(f"[{sid}]")

        stored_meta = _read_snapshot_meta(sid)
        stored_blocked = stored_meta.get("blocked", False)
        stored_sha = stored_meta.get("sha256", "")
        stored_body = _body_from_snapshot(sid)

        new_body, tag = _fetch_body(entry)

        if tag == "blocked":
            if stored_blocked:
                print("  BLOCKED (was already blocked — no change)")
                results["BLOCKED"].append(sid)
            else:
                print("  BLOCKED (newly blocked — was fetchable before!)")
                results["CHANGED"].append(sid)
            continue

        if tag.startswith("error:"):
            print(f"  ERROR: {tag[6:]}")
            results["ERROR"].append(sid)
            continue

        new_sha = hashlib.sha256(new_body.encode()).hexdigest()

        if stored_sha and new_sha == stored_sha:
            print("  UNCHANGED")
            results["UNCHANGED"].append(sid)
        else:
            print("  CHANGED")
            if stored_body:
                print(_short_diff(stored_body, new_body))
            results["CHANGED"].append(sid)

    print(f"\n{'=' * 60}")
    print(f"CHANGED:   {len(results['CHANGED'])} — {', '.join(results['CHANGED']) or 'none'}")
    print(f"UNCHANGED: {len(results['UNCHANGED'])}")
    print(f"BLOCKED:   {len(results['BLOCKED'])}")
    print(f"ERROR:     {len(results['ERROR'])} — {', '.join(results['ERROR']) or 'none'}")

    if results["CHANGED"]:
        print(
            "\nTo update changed sources, run:\n"
            "    python fetch_sources.py --force " + " ".join(results["CHANGED"]) + "\n"
            "    python ingest.py"
        )


if __name__ == "__main__":
    main()
