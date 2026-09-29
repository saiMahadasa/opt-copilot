"""
process_manual_pdfs.py — convert PDFs in knowledge/manual/ into snapshots.

For each <id>.pdf in knowledge/manual/:
  1. Looks up <id> in knowledge/sources.yml.
     If no entry is found the PDF is listed and skipped.
  2. Creates knowledge/manual/<id>.yml sidecar (id, url, title, retrieved_at)
     if one does not already exist.
  3. Extracts text via pdfminer and strips page furniture: repeated header /
     footer lines (appearing on ≥50 % of pages), bare page numbers, and
     browser print-date lines at the top or bottom of each page.
  4. Writes knowledge/snapshots/<id>.md with the standard front matter so
     ingest.py will pick it up on the next run.

PDFs with no matching sources.yml entry are listed and skipped.
A sources.yml entry does not need to be marked approved — the snapshot is
written regardless, but only approved entries are re-fetched by fetch_sources.py.

Usage
-----
    python process_manual_pdfs.py              # all PDFs in knowledge/manual/
    python process_manual_pdfs.py ice_i983_pdf # one file by id (no .pdf suffix)

After this script succeeds, run:
    python ingest.py
"""

import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import yaml

from fetch_sources import (
    MANUAL,
    SNAPSHOTS,
    SOURCES_YML,
    _write_snapshot,
)

try:
    from pdfminer.high_level import extract_pages as _pm_extract_pages
    from pdfminer.layout import LTTextContainer
    HAS_PDFMINER = True
except ImportError:
    HAS_PDFMINER = False


# ── Raw page extraction ───────────────────────────────────────────────────────

def _extract_pages_raw(data: bytes) -> list[str]:
    """Return raw text per page (list of strings, one per page)."""
    import io
    pages: list[str] = []
    for page_layout in _pm_extract_pages(io.BytesIO(data)):
        chunks: list[str] = []
        for element in page_layout:
            if isinstance(element, LTTextContainer):
                chunks.append(element.get_text())
        pages.append("".join(chunks))
    return pages


# ── Furniture detection ───────────────────────────────────────────────────────

# Bare page numbers: "1", "2 of 6", "Page 3", "- 4 -"
_PAGE_NUM_RE = re.compile(
    r"^\s*(?:-\s*)?\d+(?:\s*-\s*|\s+of\s+\d+)?\s*$"
    r"|^\s*page\s+\d+(?:\s+of\s+\d+)?\s*$",
    re.I,
)

# Browser / OS print headers/footers: "9/28/2026", "September 28, 2026",
# optionally followed by a URL.
_PRINT_DATE_RE = re.compile(
    r"^\s*(?:\d{1,2}/\d{1,2}/\d{2,4}|[A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})"
    r"(?:\s+https?://\S+)?\s*$"
)

# Trailing URL-only lines (sometimes printed at bottom by browser)
_URL_LINE_RE = re.compile(r"^\s*https?://\S+\s*$")


def _norm(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip().lower()


def _strip_page_furniture(pages: list[str]) -> str:
    """Remove repeated headers/footers, page numbers and print-date artefacts."""
    n = len(pages)
    if n == 0:
        return ""

    page_lines: list[list[str]] = [p.splitlines() for p in pages]

    # Count how many pages each normalised line appears on
    counts: Counter[str] = Counter()
    for lines in page_lines:
        seen: set[str] = set()
        for raw in lines:
            nk = _norm(raw)
            if nk and nk not in seen:
                seen.add(nk)
                counts[nk] += 1

    # Line is furniture if it appears on >= threshold pages
    threshold = max(2, int(n * 0.5)) if n >= 4 else (n if n <= 2 else 2)
    repeated: set[str] = {k for k, v in counts.items() if v >= threshold}

    def _is_furniture(raw: str) -> bool:
        stripped = raw.strip()
        if not stripped:
            return True
        nk = _norm(stripped)
        if nk in repeated:
            return True
        if _PAGE_NUM_RE.match(stripped):
            return True
        if _PRINT_DATE_RE.match(stripped):
            return True
        if _URL_LINE_RE.match(stripped):
            return True
        return False

    sections: list[str] = []
    for lines in page_lines:
        kept: list[str] = []
        prev_blank = False
        for raw in lines:
            if _is_furniture(raw):
                continue
            is_blank = not raw.strip()
            if is_blank and prev_blank:
                continue
            kept.append(raw)
            prev_blank = is_blank

        text = "\n".join(kept).strip()
        if text:
            sections.append(text)

    return "\n\n".join(sections)


# ── Per-PDF processing ────────────────────────────────────────────────────────

def _process_one(pdf_path: Path, sources_by_id: dict[str, dict]) -> bool:
    """Extract pdf_path and write snapshot. Returns True on success."""
    sid = pdf_path.stem
    entry = sources_by_id.get(sid)
    if not entry:
        print(f"  [skip] {sid!r} — no sources.yml entry (add one then retry)")
        return False

    title = entry.get("title", sid)
    url   = entry.get("url", "")

    # Create .yml sidecar if missing
    yml_path = MANUAL / f"{sid}.yml"
    if not yml_path.exists():
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        sidecar: dict = {"id": sid, "url": url, "title": title, "retrieved_at": now}
        yml_path.write_text(
            yaml.dump(sidecar, allow_unicode=True, default_flow_style=False),
            encoding="utf-8",
        )
        print(f"  [sidecar] created {yml_path.name}")
    else:
        sidecar = yaml.safe_load(yml_path.read_text(encoding="utf-8")) or {}

    # Extract text
    data = pdf_path.read_bytes()
    try:
        pages = _extract_pages_raw(data)
    except Exception as exc:
        print(f"  [error] pdfminer extraction failed: {exc}")
        return False

    if not pages:
        print(f"  [warn] pdfminer returned 0 pages — is the file a valid PDF?")
        return False

    body = _strip_page_furniture(pages)
    if not body.strip():
        print(f"  [warn] extraction produced empty body after furniture stripping")
        return False

    words = len(body.split())
    _write_snapshot(sid, sidecar, body)
    snap = SNAPSHOTS / f"{sid}.md"
    print(f"  [ok] {len(pages)} page(s), {words} words → {snap.name}")
    return True


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if not HAS_PDFMINER:
        sys.exit(
            "Error: pdfminer.six is not installed.\n"
            "Run: pip install pdfminer.six"
        )

    if not SOURCES_YML.exists():
        sys.exit(f"Error: {SOURCES_YML} not found")

    manifest = yaml.safe_load(SOURCES_YML.read_text(encoding="utf-8")) or {}
    sources_by_id = {s["id"]: s for s in manifest.get("sources", [])}

    # Resolve targets
    args = sys.argv[1:]
    if args:
        pdf_paths = [MANUAL / f"{a}.pdf" for a in args]
        missing = [p for p in pdf_paths if not p.exists()]
        if missing:
            sys.exit("Error: not found: " + ", ".join(str(p) for p in missing))
    else:
        pdf_paths = sorted(MANUAL.glob("*.pdf"))

    if not pdf_paths:
        print(
            "No PDF files found in knowledge/manual/.\n"
            "Place <id>.pdf files there (where <id> matches a sources.yml entry),\n"
            "then re-run this script."
        )
        return

    print(f"Processing {len(pdf_paths)} PDF(s) in knowledge/manual/ ...\n")

    ok: list[str] = []
    skipped: list[str] = []

    for pdf in pdf_paths:
        print(f"[{pdf.stem}]")
        if _process_one(pdf, sources_by_id):
            ok.append(pdf.stem)
        else:
            skipped.append(pdf.stem)

    print(f"\n{'=' * 60}")
    print(f"Written:  {len(ok)} snapshot(s) — {', '.join(ok) or 'none'}")
    if skipped:
        print(f"Skipped:  {len(skipped)} — {', '.join(skipped)}")
    if ok:
        print("\nNext step: python ingest.py")
    if skipped:
        print(
            "\nFor skipped PDFs, add a matching sources.yml entry with the same id\n"
            "as the PDF filename stem, then re-run."
        )


if __name__ == "__main__":
    main()
