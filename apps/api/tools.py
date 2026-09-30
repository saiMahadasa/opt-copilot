"""
tools.py — function tools available to the Gemini model in /ask.

Exported callables
------------------
check_stem_eligibility(cip_code)  — exact CIP code lookup
search_stem_by_keyword(keyword)   — substring search over field_of_study

Both functions are pure (read-only, no I/O side-effects) and safe to
call from within the Gemini tool-calling loop.
"""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

LIST_UPDATED = "2024-07-22"
_JSON_PATH = Path(__file__).parent / "knowledge" / "stem_cip_codes.json"
_MAX_KEYWORD_RESULTS = 5

# CIP codes are exactly XX.XXXX
_CIP_RE = re.compile(r"^\d{2}\.\d{4}$")


class StemEntry(TypedDict):
    cip_code: str
    field_of_study: str


@lru_cache(maxsize=1)
def _load_index() -> dict[str, str]:
    """Return {cip_code: field_of_study} mapping, cached after first load."""
    raw: list[StemEntry] = json.loads(_JSON_PATH.read_text(encoding="utf-8"))
    return {e["cip_code"]: e["field_of_study"] for e in raw}


def check_stem_eligibility(cip_code: str) -> dict:
    """
    Return whether a CIP code appears on the DHS STEM designated degree
    program list.

    Parameters
    ----------
    cip_code : str
        Six-digit CIP code in XX.XXXX format, e.g. "14.0901".

    Returns
    -------
    dict with keys:
        eligible       : bool
        field_of_study : str | None  (None when not eligible)
        list_updated   : str         (ISO date the source PDF was published)
    """
    index = _load_index()
    field = index.get(cip_code.strip())
    return {
        "eligible": field is not None,
        "field_of_study": field,
        "list_updated": LIST_UPDATED,
    }


def search_stem_by_keyword(keyword: str) -> list[dict]:
    """
    Case-insensitive substring search over field_of_study names on the
    DHS STEM designated degree program list.

    Parameters
    ----------
    keyword : str
        Term to search for in major / degree names.

    Returns
    -------
    List of up to 5 dicts, each with keys:
        cip_code       : str
        field_of_study : str
        list_updated   : str
    Sorted by cip_code.  Empty list when no matches.
    """
    kw = keyword.strip().lower()
    index = _load_index()
    matches = [
        {"cip_code": code, "field_of_study": name, "list_updated": LIST_UPDATED}
        for code, name in sorted(index.items())
        if kw in name.lower()
    ]
    return matches[:_MAX_KEYWORD_RESULTS]
