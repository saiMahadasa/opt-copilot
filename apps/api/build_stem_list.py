"""
build_stem_list.py — parse the DHS STEM designated degree program list PDF
into knowledge/stem_cip_codes.json.

Downloads the PDF from ICE (retrying via PowerShell if the Python HTTP client
is blocked) and extracts the two-column table (CIP code, field of study).

Usage:
    python build_stem_list.py

Outputs:
    knowledge/stem_cip_codes.json  -- [{cip_code, field_of_study}, ...]
    knowledge/stem_cip_codes.txt   -- raw pdfminer text for debugging

PDF structure (three-column table, pdfminer reads column-by-column per page):
  Column 1: 2-digit series (01, 03, 04, ...)
  Column 2: 6-digit CIP codes (01.0308, 01.0901, ...)
  Column 3: CIP titles (Agroecology and Sustainable Agriculture, ...)
"""

import io
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

STEM_PDF_URL = "https://www.ice.gov/sites/default/files/documents/stem-list.pdf"
LIST_UPDATED = "2024-07-22"

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
JSON_OUT = KNOWLEDGE_DIR / "stem_cip_codes.json"
TXT_OUT  = KNOWLEDGE_DIR / "stem_cip_codes.txt"

_CIP_CODE_RE = re.compile(r"^\d{2}\.\d{4}$")
_BARE_NUM_RE = re.compile(r"^\d+$")

# Lines to skip in the title section (column headers that can appear per-page)
_HEADER_LINES = frozenset({
    "CIP  Code Title", "CIP Code Title",
    "2020 CIP Code", "2020 CIP  Code",
    "CIP  Code", "CIP Code",
    "Two-Digit", "Series",
})


def download_pdf(url: str) -> bytes:
    """Download the PDF; try stdlib first, fall back to PowerShell on Windows."""
    print(f"Downloading {url} ...")

    # 1. Try stdlib urllib
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept": "application/pdf,*/*",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        print(f"  urllib: {len(data):,} bytes")
        return data
    except Exception as e:
        print(f"  urllib failed ({e}), trying PowerShell...")

    # 2. Fallback: PowerShell Invoke-WebRequest (Windows)
    if sys.platform != "win32":
        sys.exit("Cannot download PDF automatically on this platform. "
                 "Place it at knowledge/stem_cip_codes_raw.pdf and re-run.")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    ps_cmd = (
        f"$r=Invoke-WebRequest -Uri '{url}' -OutFile '{tmp_path}' "
        f"-Headers @{{'User-Agent'='Mozilla/5.0'}} -TimeoutSec 60; "
        f"Write-Output 'ok'"
    )
    result = subprocess.run(
        ["powershell", "-NonInteractive", "-Command", ps_cmd],
        capture_output=True, text=True, timeout=90,
    )
    if result.returncode != 0:
        sys.exit(f"PowerShell download failed:\n{result.stderr}")

    data = Path(tmp_path).read_bytes()
    Path(tmp_path).unlink(missing_ok=True)
    print(f"  PowerShell: {len(data):,} bytes")
    return data


def extract_text(data: bytes) -> str:
    try:
        from pdfminer.high_level import extract_text as pm_extract
    except ImportError:
        sys.exit("pdfminer.six not installed. Run: pip install pdfminer.six")
    text = pm_extract(io.BytesIO(data))
    print(f"  Extracted {len(text):,} characters from PDF")
    return text


def _is_terminal(line: str) -> bool:
    """True if this line ends the current title entry (no continuation on next line)."""
    s = line.rstrip()
    if s.endswith("."):
        return True
    last_word = s.split()[-1] if s.split() else ""
    # "Applied Engineering. New" — trailing annotation word, no more continuation
    if last_word == "New":
        return True
    # "Cyber/Computer Forensics. Moved from 43.0116" — ends with a code ref, no period
    if re.match(r"^\d{2}\.\d{4}$", last_word):
        return True
    return False


def _clean_title(raw: str) -> str:
    t = re.sub(r"\s+", " ", raw).strip()
    # Remove appended "Moved from XX.XXXX." annotation
    t = re.sub(r"\.\s+Moved from \S+\.?\s*$", "", t)
    # Remove trailing ". New" annotation
    t = re.sub(r"\.\s+New\s*$", "", t)
    # Remove trailing period
    t = t.rstrip(".")
    return t.strip()


def parse_cip_entries(text: str) -> list[dict]:
    """
    Parse CIP code + title pairs from the raw PDF text.

    The PDF renders as three columns per page (pdfminer reads them sequentially):
      1. Two-digit series numbers
      2. Six-digit CIP codes
      3. CIP titles

    Strategy per page: collect the 6-digit codes, then collect everything
    after the last code as title lines, then merge wrapped continuations.
    """
    pages = text.split("\x0c")
    entries: list[dict] = []
    warn_count = 0

    for page_num, page in enumerate(pages, 1):
        lines = [ln.strip() for ln in page.splitlines() if ln.strip()]

        code_indices = [i for i, ln in enumerate(lines) if _CIP_CODE_RE.match(ln)]
        if not code_indices:
            continue

        codes = [lines[i] for i in code_indices]
        last_code_idx = code_indices[-1]

        # Title candidates: all lines after the last code
        raw_after = lines[last_code_idx + 1:]

        title_candidates = [
            ln for ln in raw_after
            if not _BARE_NUM_RE.match(ln)
            and ln not in _HEADER_LINES
            and any(c.isalpha() for c in ln)
        ]

        # Merge wrapped continuation lines
        merged: list[str] = []
        for t in title_candidates:
            if merged and not _is_terminal(merged[-1]):
                merged[-1] += " " + t
            else:
                merged.append(t)

        cleaned = [_clean_title(t) for t in merged]

        if len(codes) != len(cleaned):
            warn_count += 1
            print(
                f"  [warn] page {page_num}: {len(codes)} codes vs "
                f"{len(cleaned)} titles — using zip (some may be off)"
            )

        for code, title in zip(codes, cleaned):
            entries.append({"cip_code": code, "field_of_study": title})

    if warn_count:
        print(f"  {warn_count} page(s) had count mismatches — check {TXT_OUT.name}")

    return entries


def main() -> None:
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)

    # Use pre-downloaded file if present (avoids repeated network calls)
    cached = KNOWLEDGE_DIR / "stem_cip_codes_raw.pdf"
    if cached.exists():
        print(f"Using cached PDF: {cached}")
        data = cached.read_bytes()
    else:
        data = download_pdf(STEM_PDF_URL)
        cached.write_bytes(data)

    text = extract_text(data)
    TXT_OUT.write_text(text, encoding="utf-8")
    print(f"  Raw text saved -> {TXT_OUT.name}")

    entries = parse_cip_entries(text)

    if not entries:
        print("\nWARNING: 0 entries parsed. Check the raw text in stem_cip_codes.txt.")
        sys.exit(1)

    JSON_OUT.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"\n{'='*60}")
    print(f"Total CIP entries: {len(entries)}")
    print(f"Saved -> {JSON_OUT.name}")
    print(f"\nFirst 10 entries:")
    for e in entries[:10]:
        print(f"  {e['cip_code']}  {e['field_of_study']}")


if __name__ == "__main__":
    main()
