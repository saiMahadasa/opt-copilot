"""
fetch_sources.py — download approved sources from knowledge/sources.yml.

Rules
-----
* Honors robots.txt; never fetches a disallowed URL.
* Waits 2 seconds between requests to the same host.
* Retries up to 3 times with exponential back-off (4 s, 8 s, 16 s).
* Caches responses locally; skips re-fetch if snapshot is < 24 h old unless
  --force is passed.
* If a site returns 403 or is disallowed by robots.txt, records
  blocked: true in the snapshot front matter without any circumvention.
* Supports manual files: knowledge/manual/<id>.md + knowledge/manual/<id>.yml
  (sidecar with url, title, retrieved_at).  Manual entries are copied straight
  to snapshots/ without any HTTP request.

Usage
-----
    python fetch_sources.py             # fetch all approved sources
    python fetch_sources.py --force     # ignore cache, re-fetch everything
    python fetch_sources.py ecfr_8cfr214_2_f  # fetch a single source by id
"""

import argparse
import hashlib
import io
import re
import sys
import textwrap
import time
import urllib.parse
import urllib.robotparser
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import yaml

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # type: ignore

try:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTTextContainer
    HAS_PDFMINER = True
except ImportError:
    HAS_PDFMINER = False

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE = Path(__file__).parent
KNOWLEDGE = BASE / "knowledge"
SOURCES_YML = KNOWLEDGE / "sources.yml"
SNAPSHOTS = KNOWLEDGE / "snapshots"
MANUAL = KNOWLEDGE / "manual"
SNAPSHOTS.mkdir(exist_ok=True)
MANUAL.mkdir(exist_ok=True)

# ── Constants ─────────────────────────────────────────────────────────────────

UA = "Pathwise-bot/1.0 (educational; contact saimahadasa1999@gmail.com)"
DELAY_BETWEEN_HOSTS = 2.0   # seconds
RETRY_DELAYS = [4, 8, 16]   # seconds
CACHE_MAX_AGE = 86_400       # seconds (24 h)

# ── Robots cache ──────────────────────────────────────────────────────────────

_robots_cache: dict[str, urllib.robotparser.RobotFileParser] = {}


def _robots_allowed(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in _robots_cache:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(f"{origin}/robots.txt")
        try:
            rp.read()
        except Exception:
            # If robots.txt is unreachable, be conservative: allow
            pass
        _robots_cache[origin] = rp
    return _robots_cache[origin].can_fetch(UA, url)


# ── HTTP helpers ──────────────────────────────────────────────────────────────

_last_request: dict[str, float] = {}  # host → timestamp


def _wait_for_host(host: str) -> None:
    last = _last_request.get(host, 0.0)
    elapsed = time.time() - last
    if elapsed < DELAY_BETWEEN_HOSTS:
        time.sleep(DELAY_BETWEEN_HOSTS - elapsed)
    _last_request[host] = time.time()


def _fetch_raw(url: str) -> tuple[int, bytes, str]:
    """Fetch url; returns (status_code, body_bytes, final_url).
    Raises on network errors. Returns (403, b"", url) on HTTP 403.
    Retries with back-off on 5xx."""
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc

    for attempt, delay in enumerate([0] + RETRY_DELAYS):
        if delay:
            print(f"    retry in {delay}s (attempt {attempt + 1})")
            time.sleep(delay)
        _wait_for_host(host)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.status, resp.read(), resp.url
        except urllib.error.HTTPError as e:
            if e.code == 403:
                return 403, b"", url
            if e.code < 500:
                raise
            if attempt == len(RETRY_DELAYS):
                raise
        except Exception:
            if attempt == len(RETRY_DELAYS):
                raise
    return 0, b"", url  # unreachable


# ── Content extractors ────────────────────────────────────────────────────────

def _extract_ecfr_paragraph_f(html: bytes) -> str:
    """Extract paragraph (f) from eCFR section 214.2 renderer HTML.

    The renderer API returns divs with id="p-214.2(X)" for each paragraph.
    We keep only those whose id starts with 'p-214.2(f)'.
    Each div contains a <p> with the paragraph text; paragraph-hierarchy
    spans carry the label like (f), (f)(1)(ii)(B).
    """
    if BeautifulSoup is None:
        raise RuntimeError("beautifulsoup4 not installed")
    soup = BeautifulSoup(html, "lxml")

    heading = soup.find("h4")
    heading_text = heading.get_text(" ", strip=True) if heading else "8 CFR 214.2(f)"

    # Divs whose id is exactly "p-214.2(f)" or starts with "p-214.2(f)("
    pattern = re.compile(r"^p-214\.2\(f\)($|\()")
    divs = soup.find_all("div", id=pattern)

    lines = [f"# {heading_text} — paragraph (f)", ""]
    for div in divs:
        did = div.get("id", "")
        label_match = re.search(r"p-214\.2(\(.+\))$", did)
        label = label_match.group(1) if label_match else ""

        # Get text from the paragraph inside the div
        inner_p = div.find("p", recursive=False) or div.find("p")
        if inner_p:
            for span in inner_p.find_all("span", class_="paragraph-hierarchy"):
                span.decompose()
            text = inner_p.get_text(" ", strip=True)
        else:
            text = div.get_text(" ", strip=True)

        if text:
            depth = max(0, label.count("(") - 1)
            indent = "  " * min(depth, 4)
            lines.append(f"{indent}{label} {text}")
            lines.append("")

    return "\n".join(lines)


def _extract_html_main(html: bytes, url: str) -> str:
    """Extract main article content from an HTML page, dropping nav/footer."""
    if BeautifulSoup is None:
        raise RuntimeError("beautifulsoup4 not installed")
    soup = BeautifulSoup(html, "lxml")

    # Remove boilerplate tags
    for tag in soup(["nav", "header", "footer", "script", "style",
                     "aside", "noscript", "form", "button",
                     "[class*='cookie']", "[class*='banner']"]):
        tag.decompose()

    # Try semantic content containers in preference order
    main = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id=re.compile(r"content|main|article", re.I))
        or soup.find(class_=re.compile(r"content|main|article", re.I))
        or soup.find("body")
        or soup
    )

    # Convert headings and paragraphs to markdown-ish text
    lines: list[str] = []
    for el in main.descendants if hasattr(main, "descendants") else []:
        if not hasattr(el, "name"):
            continue
        if el.name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(el.name[1])
            lines.append(f"\n{'#' * level} {el.get_text(strip=True)}\n")
        elif el.name == "p":
            t = el.get_text(" ", strip=True)
            if len(t) > 30:
                lines.append(t + "\n")
        elif el.name == "li":
            t = el.get_text(" ", strip=True)
            if t:
                lines.append(f"- {t}")

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else url
    return f"# {title}\nSource: {url}\n\n" + "\n".join(lines)


def _extract_pdf(data: bytes) -> str:
    """Extract text from a PDF, prefixing each page with 'Page N:'."""
    if not HAS_PDFMINER:
        raise RuntimeError("pdfminer.six not installed")
    pages: list[str] = []
    for page_num, page_layout in enumerate(extract_pages(io.BytesIO(data)), 1):
        page_text = []
        for element in page_layout:
            if isinstance(element, LTTextContainer):
                page_text.append(element.get_text())
        text = "".join(page_text).strip()
        if text:
            pages.append(f"## Page {page_num}\n\n{text}")
    return "\n\n".join(pages)


# ── Snapshot helpers ──────────────────────────────────────────────────────────

def _snapshot_path(source_id: str) -> Path:
    return SNAPSHOTS / f"{source_id}.md"


def _snapshot_age(source_id: str) -> float:
    """Return age in seconds, or inf if no snapshot exists."""
    p = _snapshot_path(source_id)
    if not p.exists():
        return float("inf")
    return time.time() - p.stat().st_mtime


def _write_snapshot(source_id: str, meta: dict, body: str, blocked: bool = False) -> None:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    sha = hashlib.sha256(body.encode()).hexdigest()
    fm = {
        "id":           source_id,
        "url":          meta.get("url", ""),
        "title":        meta.get("title", ""),
        "retrieved_at": now,
        "sha256":       sha,
    }
    if blocked:
        fm["blocked"] = True
    front = yaml.dump(fm, allow_unicode=True, default_flow_style=False).strip()
    _snapshot_path(source_id).write_text(
        f"---\n{front}\n---\n\n{body}", encoding="utf-8"
    )


def _read_snapshot_meta(source_id: str) -> dict:
    p = _snapshot_path(source_id)
    if not p.exists():
        return {}
    text = p.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        return {}
    return yaml.safe_load(m.group(1)) or {}


# ── Manual file support ───────────────────────────────────────────────────────

def _process_manual(source_id: str) -> bool:
    """Copy manual/id.md to snapshots, merging the .yml sidecar. Returns True if found."""
    md_path = MANUAL / f"{source_id}.md"
    yml_path = MANUAL / f"{source_id}.yml"
    if not md_path.exists():
        return False
    sidecar: dict = {}
    if yml_path.exists():
        sidecar = yaml.safe_load(yml_path.read_text(encoding="utf-8")) or {}
    body = md_path.read_text(encoding="utf-8")
    # Strip existing front matter if present
    body = re.sub(r"^---\n.*?\n---\n\n?", "", body, flags=re.DOTALL)
    _write_snapshot(source_id, sidecar, body)
    print(f"  [manual] {source_id} — copied from knowledge/manual/")
    return True


# ── Per-source fetch ──────────────────────────────────────────────────────────

def _fetch_source(entry: dict, force: bool) -> None:
    sid = entry["id"]
    url = entry.get("url", "")
    fetch_url = entry.get("fetch_url", url)
    src_type = entry.get("type", "html")
    title = entry.get("title", sid)

    print(f"\n[{sid}]")

    # 1. Check for manual file first
    if _process_manual(sid):
        return

    # 2. Skip if fresh cache and not forced
    if not force and _snapshot_age(sid) < CACHE_MAX_AGE:
        meta = _read_snapshot_meta(sid)
        if meta.get("blocked"):
            print(f"  [skip] cached blocked snapshot ({_snapshot_age(sid) / 3600:.1f} h old)")
        else:
            print(f"  [skip] cached snapshot ({_snapshot_age(sid) / 3600:.1f} h old)")
        return

    # 3. Check robots.txt
    if not _robots_allowed(fetch_url):
        print(f"  [blocked] robots.txt disallows {urllib.parse.urlparse(fetch_url).netloc}")
        _write_snapshot(sid, {"url": url, "title": title}, "", blocked=True)
        return

    # 4. Fetch
    print(f"  fetching {fetch_url}")
    try:
        status, data, final_url = _fetch_raw(fetch_url)
    except Exception as exc:
        print(f"  [error] fetch failed: {exc}")
        return

    if status == 403:
        print(f"  [blocked] HTTP 403 from {urllib.parse.urlparse(fetch_url).netloc}")
        _write_snapshot(sid, {"url": url, "title": title}, "", blocked=True)
        return

    print(f"  HTTP {status}  final={final_url[:80]}")

    # Cloudflare / JS challenge detection
    if "unblock.federalregister.gov" in final_url or b"Just a moment" in data[:500]:
        print(f"  [blocked] Cloudflare JS challenge at final URL")
        _write_snapshot(sid, {"url": url, "title": title}, "", blocked=True)
        return

    # 5. Extract content
    try:
        if src_type == "ecfr":
            body = _extract_ecfr_paragraph_f(data)
        elif src_type == "pdf":
            body = _extract_pdf(data)
        else:
            body = _extract_html_main(data, final_url)
    except Exception as exc:
        print(f"  [error] extraction failed: {exc}")
        return

    words = len(body.split())
    _write_snapshot(sid, {"url": url, "title": title}, body)
    print(f"  [ok] {words} words -> snapshots/{sid}.md")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ids", nargs="*", help="source id(s) to fetch (default: all approved)")
    parser.add_argument("--force", action="store_true", help="ignore cache, re-fetch")
    args = parser.parse_args()

    if not SOURCES_YML.exists():
        sys.exit(f"Error: {SOURCES_YML} not found")

    manifest = yaml.safe_load(SOURCES_YML.read_text(encoding="utf-8")) or {}
    sources = manifest.get("sources", [])

    approved = [s for s in sources if s.get("status") == "approved"]
    if args.ids:
        id_set = set(args.ids)
        targets = [s for s in approved if s["id"] in id_set]
        missing = id_set - {s["id"] for s in targets}
        if missing:
            print(f"Warning: unknown id(s): {', '.join(sorted(missing))}")
    else:
        targets = approved

    print(f"Fetching {len(targets)} source(s)...\n")

    blocked: list[str] = []
    ok: list[str] = []
    manual: list[str] = []

    for entry in targets:
        sid = entry["id"]
        _fetch_source(entry, args.force)
        meta = _read_snapshot_meta(sid)
        if meta.get("blocked"):
            blocked.append(sid)
        else:
            # Check if it was a manual file
            if (MANUAL / f"{sid}.md").exists():
                manual.append(sid)
            else:
                ok.append(sid)

    print(f"\n{'=' * 60}")
    print(f"Done: {len(ok)} fetched, {len(manual)} manual, {len(blocked)} blocked")
    if blocked:
        print(f"\nBLOCKED (robots.txt Disallow or HTTP 403):")
        for sid in blocked:
            entry = next((s for s in approved if s["id"] == sid), {})
            print(f"  {sid}")
            print(f"    {entry.get('url', '')}")
        print(
            "\nTo add content for blocked sources, create:\n"
            "  knowledge/manual/<id>.md   — the extracted text\n"
            "  knowledge/manual/<id>.yml  — sidecar with url, title, retrieved_at\n"
            "Then re-run fetch_sources.py to copy them into snapshots/."
        )


if __name__ == "__main__":
    main()
