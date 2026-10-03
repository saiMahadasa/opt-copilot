"""
tools.py — function tools available to the Gemini model in /ask.

Exported callables
------------------
check_stem_eligibility(cip_code)          — exact CIP code lookup
search_stem_by_keyword(keyword)           — substring search over field_of_study
compute_opt_window(program_end_date)      — I-765 filing window from program end date
compute_stem_reporting_schedule(stem_start_date) — four STEM OPT reporting windows
compute_unemployment_status(days_used, on_stem_opt) — remaining unemployment days

All functions are pure (read-only, no I/O side-effects) and safe to
call from within the Gemini tool-calling loop.
"""

import json
import re
from datetime import date, timedelta
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


# ── Date calculator tools ─────────────────────────────────────────────────────


def _add_months(d: date, months: int) -> date:
    """Add months to a date, clamping to the last valid day of the target month."""
    m = d.month - 1 + months
    year = d.year + m // 12
    month = m % 12 + 1
    is_leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    days_in_month = [31, 29 if is_leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return date(year, month, min(d.day, days_in_month))


def compute_opt_window(program_end_date: str) -> dict:
    """
    Compute the OPT I-765 filing window from the student's program end date.

    The filing window opens 90 days before program end and closes 60 days
    after program end. USCIS recommends filing at least 90 days early
    because I-765 processing takes 3-5 months.

    Parameters
    ----------
    program_end_date : str
        Program end date in YYYY-MM-DD format (from the student's I-20).

    Returns
    -------
    dict with window_open, window_close, recommended_file_by, status,
    days_until_open, days_remaining_to_file, and an explanatory note.
    """
    try:
        end = date.fromisoformat(program_end_date.strip())
    except ValueError:
        return {"error": f"Invalid date format '{program_end_date}'. Use YYYY-MM-DD."}

    window_open = end - timedelta(days=90)
    window_close = end + timedelta(days=60)
    recommended_file_by = end - timedelta(days=60)
    today = date.today()

    if today < window_open:
        status = "upcoming"
        days_until_open = (window_open - today).days
        days_remaining_to_file = None
    elif today <= window_close:
        status = "open"
        days_until_open = 0
        days_remaining_to_file = (window_close - today).days
    else:
        status = "closed"
        days_until_open = 0
        days_remaining_to_file = 0

    return {
        "program_end_date": end.isoformat(),
        "window_open": window_open.isoformat(),
        "window_close": window_close.isoformat(),
        "recommended_file_by": recommended_file_by.isoformat(),
        "status": status,
        "days_until_open": days_until_open,
        "days_remaining_to_file": days_remaining_to_file,
        "note": (
            "USCIS I-765 processing typically takes 3-5 months. "
            "File as early as possible once the window opens 90 days before program end. "
            "The filing window closes 60 days after program end — missing this deadline "
            "means waiting until after starting a new program."
        ),
    }


def compute_stem_reporting_schedule(stem_start_date: str) -> dict:
    """
    Compute all four STEM OPT self-evaluation reporting windows.

    STEM OPT students must submit a self-evaluation report to their DSO
    every 6 months. Each report is due within a 10-day window centered
    on the 6, 12, 18, and 24-month marks from the STEM OPT start date.

    Parameters
    ----------
    stem_start_date : str
        STEM OPT start date in YYYY-MM-DD format (from the student's EAD).

    Returns
    -------
    dict with stem_end_date, a list of four report windows (each with
    due_start, due_end, status), and an explanatory note.
    """
    try:
        start = date.fromisoformat(stem_start_date.strip())
    except ValueError:
        return {"error": f"Invalid date format '{stem_start_date}'. Use YYYY-MM-DD."}

    today = date.today()
    reports = []
    for months_offset in (6, 12, 18, 24):
        center = _add_months(start, months_offset)
        due_start = center - timedelta(days=5)
        due_end = center + timedelta(days=5)
        if today > due_end:
            status = "completed_or_overdue"
        elif today >= due_start:
            status = "due_now"
        else:
            status = "upcoming"
        reports.append({
            "period": f"Month {months_offset}",
            "due_start": due_start.isoformat(),
            "due_end": due_end.isoformat(),
            "status": status,
        })

    stem_end = _add_months(start, 24)
    return {
        "stem_start_date": start.isoformat(),
        "stem_end_date": stem_end.isoformat(),
        "reports": reports,
        "note": (
            "Submit each self-evaluation report to your DSO via the SEVP portal "
            "within the 10-day window. Missing a report can result in SEVIS "
            "termination and loss of STEM OPT status."
        ),
    }


def compute_unemployment_status(days_used: int, on_stem_opt: bool = False) -> dict:
    """
    Compute OPT / STEM OPT unemployment days remaining.

    OPT allows 90 cumulative unemployment days. STEM OPT adds 60 more
    (150 total across both OPT and STEM OPT periods combined).

    Parameters
    ----------
    days_used : int
        Number of unemployment days already used (across current and
        prior OPT periods if the student has already been on regular OPT).
    on_stem_opt : bool
        True if the student is currently on STEM OPT (not regular OPT).

    Returns
    -------
    dict with days_remaining, total_limit, status ('ok' / 'warning' /
    'exceeded'), a human-readable message, and an explanatory note.
    """
    try:
        days_used = int(days_used)
    except (TypeError, ValueError):
        return {"error": "days_used must be a non-negative integer."}
    if days_used < 0:
        return {"error": "days_used cannot be negative."}

    opt_limit = 90
    stem_extra = 60 if on_stem_opt else 0
    total_limit = opt_limit + stem_extra
    days_remaining = max(0, total_limit - days_used)

    if days_remaining > 30:
        status = "ok"
        message = "You are within the unemployment limit."
    elif days_remaining > 0:
        status = "warning"
        message = f"Only {days_remaining} day{'s' if days_remaining != 1 else ''} remaining. Start active job search now."
    else:
        status = "exceeded"
        message = "Limit exceeded. OPT status may be at risk. Contact your DSO immediately."

    return {
        "days_used": days_used,
        "days_remaining": days_remaining,
        "total_limit": total_limit,
        "opt_limit": opt_limit,
        "stem_additional_days": stem_extra,
        "on_stem_opt": on_stem_opt,
        "status": status,
        "message": message,
        "note": (
            "Unemployment days are cumulative. "
            "OPT: 90 days max. STEM OPT: 60 additional days (150 total across both periods). "
            "Exceeding the limit can result in USCIS terminating the student's OPT authorization."
        ),
    }
