#!/usr/bin/env python3
"""Migrate Data/BookList.xlsx into unified library.json for the BookList web app.

Zero third-party dependencies (Python 3 standard library only).
Supports optional cached network enrichment:
  --resolve-eu     Follow amzn.eu redirects to extract canonical /dp/<ASIN>
  --enrich-dates   Backfill missing pub_year via Open Library & Google Books
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import difflib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

DISCWORLD_SUBSERIES = {
    "City Watch",
    "Death",
    "Djelibeybi",
    "Industrial Revolution",
    "Moist von Lipwig",
    "Omnia",
    "Rincewind",
    "Tiffany Aching",
    "Witches",
    "Überwald",
}

SERIES_TYPO_MAP = {
    "Railway Dective": "Railway Detective",
}

RECOMMENDER_NORMALIZATION = {
    "nige": "Nige",
    "jack": "Jack",
    "steve thomas": "Steve Thomas",
    "charles arthur": "Charles Arthur",
    "cory doctorow": "Cory Doctorow",
    "neil gaiman": "Neil Gaiman",
    "john mccarthy": "John McCarthy",
    "john naughton": "John Naughton",
    "chris t": "Chris T",
    "boagworld": "Boagworld",
    "numberphile": "Numberphile",
    "stuart heritage": "Stuart Heritage",
    "david ward (ctc)": "David Ward (CTC)",
    "allen (stamps)": "Allen (Stamps)",
}


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = s.replace("ü", "u").replace("é", "e").replace("ó", "o")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s or "unknown"


def clean_str(val: Any) -> str:
    if val is None:
        return ""
    return re.sub(r"\s+", " ", str(val)).strip()


def norm_match(text: str) -> str:
    s = clean_str(text).lower()
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9']+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def author_surname(author: str) -> str:
    a = norm_match(author)
    if not a:
        return ""
    parts = a.split()
    return parts[-1]


def excel_serial_to_iso(val: Any) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    try:
        n = float(s)
        if 10000 < n < 80000:
            d = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(round(n)))
            return d.isoformat()
    except ValueError:
        pass
    return None


def parse_price(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip().replace("£", "")
    if not s:
        return None
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def parse_year(val: Any) -> int | None:
    if val is None:
        return None
    m = re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", str(val))
    if m:
        return int(m.group(1))
    return None


def parse_series_order(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def normalize_asin(code: Any) -> str | None:
    if code is None:
        return None
    s = str(code).strip().upper()
    if not s:
        return None
    if re.match(r"^[A-Z0-9]{10}$", s):
        return s
    if re.match(r"^\d{9}$", s):
        return s.zfill(10)
    return None


def col_to_idx(col: str) -> int:
    idx = 0
    for ch in col:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def load_xlsx_sheets(path: Path) -> dict[str, list[dict[str, Any]]]:
    with zipfile.ZipFile(path) as z:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared_strings.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {el.attrib["Id"]: el.attrib["Target"] for el in rels}

        sheets: dict[str, list[dict[str, Any]]] = {}
        for sh in wb.findall(".//m:sheet", NS):
            name = sh.attrib["name"]
            rid = sh.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = "xl/" + rel_map[rid].lstrip("/")
            sroot = ET.fromstring(z.read(target))
            raw_rows: list[list[Any]] = []
            for r_el in sroot.findall(".//m:sheetData/m:row", NS):
                row_dict: dict[int, Any] = {}
                for c_el in r_el.findall("m:c", NS):
                    ref = c_el.attrib["r"]
                    col_str = re.match(r"[A-Z]+", ref).group(0)
                    ci = col_to_idx(col_str)
                    v_el = c_el.find("m:v", NS)
                    if v_el is not None and v_el.text is not None:
                        t = c_el.attrib.get("t")
                        row_dict[ci] = shared_strings[int(v_el.text)] if t == "s" else v_el.text
                if row_dict:
                    max_c = max(row_dict.keys())
                    raw_rows.append([row_dict.get(i) for i in range(max_c + 1)])
            if not raw_rows:
                sheets[name] = []
                continue
            headers = [clean_str(h) for h in raw_rows[0]]
            records: list[dict[str, Any]] = []
            for row in raw_rows[1:]:
                padded = row + [None] * (len(headers) - len(row))
                rec = dict(zip(headers, padded))
                if any(v is not None and str(v).strip() != "" for v in rec.values()):
                    records.append(rec)
            sheets[name] = records
        return sheets


def normalize_series_name(name: str) -> str:
    s = clean_str(name)
    return SERIES_TYPO_MAP.get(s, s)


def extract_note_metadata(note: str, has_amazon: bool) -> tuple[str | None, str | None, str]:
    n = clean_str(note)
    if not n:
        return None, None, "kindle" if has_amazon else "other"

    recommended_by = None
    lent_to = None
    source = "kindle" if has_amazon else "other"

    low = n.lower()
    if "google books" in low:
        source = "google_books"
    elif "humble bundle" in low:
        source = "humble_bundle"

    m_has = re.match(r"^(.+?)\s+has this book$", n, flags=re.IGNORECASE)
    if m_has:
        lent_to = clean_str(m_has.group(1))

    patterns = [
        r"^Recommended\s+by\s+(.+)$",
        r"^Recommended\s+(.+)$",
        r"^(.+?)\s+recommends$",
        r"^(.+?)\s+recommended$",
    ]
    for pat in patterns:
        m = re.match(pat, n, flags=re.IGNORECASE)
        if m:
            raw_rec = clean_str(m.group(1))
            recommended_by = RECOMMENDER_NORMALIZATION.get(raw_rec.lower(), raw_rec)
            break

    return recommended_by, lent_to, source


def compute_status(
    *,
    is_now: bool,
    is_abandoned: bool,
    is_read: bool,
    is_next: bool,
) -> tuple[str, bool]:
    """Return (status, had_read_and_abandoned_conflict)."""
    conflict = bool(is_read and is_abandoned)
    if is_now:
        return "reading", conflict
    if is_abandoned:
        return "abandoned", conflict
    if is_read:
        return "read", conflict
    if is_next:
        return "up_next", conflict
    return "unread", conflict


def flag_set(val: Any) -> bool:
    if val is None:
        return False
    s = str(val).strip().lower()
    return s in {"1", "true", "yes", "y"}


def titles_match(book_title: str, series_title: str) -> bool:
    bt = norm_match(book_title)
    st = norm_match(series_title)
    if not bt or not st:
        return False
    if bt == st:
        return True
    if bt.startswith(st + " ") or st.startswith(bt + " "):
        # Check prefix boundary in original cleaned string (colon or parenthesis)
        raw_bt = clean_str(book_title).lower().replace("’", "'")
        raw_st = clean_str(series_title).lower().replace("’", "'")
        if raw_bt.startswith(raw_st + ":") or raw_bt.startswith(raw_st + " ("):
            return True
    return difflib.SequenceMatcher(None, bt, st).ratio() >= 0.90


def resolve_eu_links(books: list[dict[str, Any]], cache_path: Path) -> dict[str, Any]:
    cache: dict[str, Any] = {}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text(encoding="utf-8"))

    targets = [b for b in books if b["amazon_legacy_code"] and not b["amazon_asin"]]
    stats = {"attempted": len(targets), "resolved": 0, "failed": 0, "from_cache": 0}

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "en-GB,en;q=0.9",
    }

    def fetch_code(code: str) -> dict[str, Any]:
        url = f"https://amzn.eu/{code}"
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                final_url = resp.geturl()
                m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})", final_url, re.IGNORECASE)
                if m:
                    return {"asin": m.group(1).upper(), "final_url": final_url, "status": "ok"}
                body = resp.read(32768).decode("utf-8", errors="ignore")
                m2 = re.search(r"/dp/([A-Z0-9]{10})", body, re.IGNORECASE)
                if m2:
                    return {"asin": m2.group(1).upper(), "final_url": final_url, "status": "ok_body"}
                return {"asin": None, "final_url": final_url, "status": "no_asin"}
        except urllib.error.HTTPError as e:
            final_url = getattr(e, "url", "") or ""
            m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})", final_url, re.IGNORECASE)
            if m:
                return {"asin": m.group(1).upper(), "final_url": final_url, "status": f"http_{e.code}_asin"}
            return {"asin": None, "final_url": final_url, "status": f"http_{e.code}"}
        except Exception as e:
            return {"asin": None, "final_url": "", "status": f"err:{type(e).__name__}"}

    for b in targets:
        code = b["amazon_legacy_code"]
        if code in cache:
            stats["from_cache"] += 1
            res = cache[code]
        else:
            res = fetch_code(code)
            cache[code] = res
            time.sleep(0.2)
        if res.get("asin"):
            b["amazon_asin"] = res["asin"]
            stats["resolved"] += 1
        else:
            stats["failed"] += 1

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")
    return stats


def strip_subtitle(title: str) -> str:
    # Remove trailing "(Series Name, Book 1)" or ": Subtitle" for fallback API queries
    t = re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()
    if ":" in t:
        t = t.split(":", 1)[0].strip()
    return t or title


def lookup_pub_year_online(title: str, author: str) -> dict[str, Any]:
    clean_title = strip_subtitle(title)
    surname = author_surname(author)

    # 1. Open Library
    try:
        qs = urllib.parse.urlencode(
            {
                "title": clean_title,
                "author": author,
                "fields": "title,author_name,first_publish_year",
                "limit": 6,
            }
        )
        url = f"https://openlibrary.org/search.json?{qs}"
        req = urllib.request.Request(url, headers={"User-Agent": "BookListMigrator/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        docs = payload.get("docs") or []
        best = None
        best_score = 0.0
        for doc in docs:
            yr = doc.get("first_publish_year")
            if not yr or not (1400 <= int(yr) <= datetime.date.today().year + 1):
                continue
            d_title = doc.get("title") or ""
            d_authors = " ".join(doc.get("author_name") or [])
            if surname and surname not in norm_match(d_authors):
                continue
            t_sim = difflib.SequenceMatcher(None, norm_match(clean_title), norm_match(d_title)).ratio()
            if t_sim > best_score:
                best_score = t_sim
                best = int(yr)
        if best and best_score >= 0.65:
            return {
                "pub_year": best,
                "source": "openlibrary",
                "confidence": "high" if best_score >= 0.82 else "medium",
            }
    except Exception:
        pass

    # 2. Google Books fallback
    try:
        q = f'intitle:"{clean_title}" inauthor:"{surname or author}"'
        qs = urllib.parse.urlencode({"q": q, "maxResults": 5, "printType": "books"})
        url = f"https://www.googleapis.com/books/v1/volumes?{qs}"
        req = urllib.request.Request(url, headers={"User-Agent": "BookListMigrator/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        items = payload.get("items") or []
        years: list[tuple[float, int]] = []
        for item in items:
            info = item.get("volumeInfo") or {}
            yr = parse_year(info.get("publishedDate"))
            if not yr:
                continue
            g_title = info.get("title") or ""
            g_authors = " ".join(info.get("authors") or [])
            if surname and surname not in norm_match(g_authors):
                continue
            t_sim = difflib.SequenceMatcher(None, norm_match(clean_title), norm_match(g_title)).ratio()
            if t_sim >= 0.65:
                years.append((t_sim, yr))
        if years:
            # Prefer earliest matched year among decent matches to avoid modern reprint dates
            best_sim = max(s for s, _ in years)
            earliest_yr = min(y for s, y in years if s >= best_sim - 0.1)
            return {
                "pub_year": earliest_yr,
                "source": "google_books",
                "confidence": "medium",
            }
    except Exception:
        pass

    return {"pub_year": None, "source": None, "confidence": "missing"}


def enrich_pub_dates(books: list[dict[str, Any]], cache_path: Path, max_workers: int = 4) -> dict[str, Any]:
    cache: dict[str, Any] = {}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text(encoding="utf-8"))

    missing = [b for b in books if b["pub_year"] is None]
    stats = {"needed": len(missing), "from_cache": 0, "openlibrary": 0, "google_books": 0, "still_missing": 0}

    to_fetch: list[tuple[str, dict[str, Any]]] = []
    for b in missing:
        key = f"{norm_match(b['author'])}||{norm_match(b['title'])}"
        if key in cache and cache[key].get("pub_year") is not None:
            stats["from_cache"] += 1
            res = cache[key]
            b["pub_year"] = res["pub_year"]
            b["pub_year_source"] = res["source"]
            b["pub_year_confidence"] = res["confidence"]
            stats[res["source"]] += 1
        elif key in cache and cache[key].get("confidence") == "missing":
            stats["from_cache"] += 1
            stats["still_missing"] += 1
        else:
            to_fetch.append((key, b))

    def worker(item: tuple[str, dict[str, Any]]) -> tuple[str, dict[str, Any]]:
        key, b = item
        res = lookup_pub_year_online(b["title"], b["author"])
        return key, res

    if to_fetch:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
            for idx, (key, res) in enumerate(pool.map(worker, to_fetch), 1):
                cache[key] = res
                if idx % 25 == 0:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")
                time.sleep(0.05)

        for key, b in to_fetch:
            res = cache[key]
            if res.get("pub_year"):
                b["pub_year"] = res["pub_year"]
                b["pub_year_source"] = res["source"]
                b["pub_year_confidence"] = res["confidence"]
                stats[res["source"]] += 1
            else:
                stats["still_missing"] += 1

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")
    return stats


def migrate(
    input_path: Path,
    output_path: Path,
    report_path: Path | None,
    resolve_eu: bool,
    enrich_dates: bool,
    cache_dir: Path,
) -> dict[str, Any]:
    sheets = load_xlsx_sheets(input_path)
    raw_books = sheets.get("Books", [])
    raw_series = sheets.get("Series", [])

    now_iso = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    # 1. Build series catalog (ensuring Discworld parent exists)
    series_by_name: dict[str, dict[str, Any]] = {}

    def ensure_series(name: str, author_default: str | None = None) -> dict[str, Any]:
        norm_name = normalize_series_name(name)
        if norm_name not in series_by_name:
            sid = "ser_" + slugify(norm_name)
            parent_id = "ser_discworld" if norm_name in DISCWORLD_SUBSERIES else None
            if parent_id and "Discworld" not in series_by_name:
                series_by_name["Discworld"] = {
                    "id": "ser_discworld",
                    "name": "Discworld",
                    "parent_series_id": None,
                    "author_default": "Terry Pratchett",
                }
            series_by_name[norm_name] = {
                "id": sid,
                "name": norm_name,
                "parent_series_id": parent_id,
                "author_default": author_default or ("Terry Pratchett" if parent_id else None),
            }
        elif author_default and not series_by_name[norm_name]["author_default"]:
            series_by_name[norm_name]["author_default"] = author_default
        return series_by_name[norm_name]

    # Seed Discworld first
    ensure_series("Discworld", "Terry Pratchett")

    # Track report metrics
    anomalies: list[str] = []
    merged_in_books = 0
    matched_series_rows = 0
    added_series_rows = 0

    # 2. Convert Books sheet
    books: list[dict[str, Any]] = []
    seen_book_keys: dict[tuple[str, str], dict[str, Any]] = {}

    for row in raw_books:
        author = clean_str(row.get("Author"))
        title = clean_str(row.get("Title"))
        if not title:
            continue

        amz_code_type = clean_str(row.get("Amazon code")).upper()
        amz_id_raw = clean_str(row.get("Amazon ID"))
        asin = normalize_asin(amz_id_raw) if amz_code_type == "DP" else None
        legacy_code = amz_id_raw if amz_code_type == "EU" and amz_id_raw else None
        if not asin and not legacy_code and amz_id_raw:
            asin = normalize_asin(amz_id_raw)

        price = parse_price(row.get("Price"))
        bought = flag_set(row.get("Bought"))
        is_read = flag_set(row.get("Read"))
        is_now = flag_set(row.get("Now"))
        is_next = flag_set(row.get("Next"))
        is_abandoned = flag_set(row.get("Abandoned"))
        is_factual = flag_set(row.get("Factual"))
        date_read = excel_serial_to_iso(row.get("Date read"))
        series_nm = normalize_series_name(clean_str(row.get("Series nm")))
        series_order = parse_series_order(row.get("Series n"))
        note = clean_str(row.get("Note"))
        category = clean_str(row.get("Category")) or None

        status, conflict = compute_status(
            is_now=is_now,
            is_abandoned=is_abandoned,
            is_read=is_read,
            is_next=is_next,
        )
        if conflict:
            anomalies.append(
                f"Resolved Read+Abandoned conflict on `{author} - {title}` (`Date read`={date_read}) -> `abandoned`."
            )

        ownership = "owned" if (bought or status in {"reading", "read", "abandoned"}) else "not_owned"
        recommended_by, lent_to, source = extract_note_metadata(note, bool(asin or legacy_code))

        series_id = None
        if series_nm:
            s_obj = ensure_series(series_nm, author)
            series_id = s_obj["id"]

        key = (norm_match(author), norm_match(title))
        if key in seen_book_keys:
            existing = seen_book_keys[key]
            merged_in_books += 1
            anomalies.append(
                f"Merged duplicate row in Books sheet: `{author} - {title}` (kept read status & combined notes/category)."
            )
            if ownership == "owned":
                existing["ownership"] = "owned"
            # Prefer read > reading > abandoned > up_next > unread
            rank = {"read": 5, "reading": 4, "abandoned": 3, "up_next": 2, "unread": 1}
            if rank[status] > rank[existing["status"]]:
                existing["status"] = status
            if date_read and not existing["date_read"]:
                existing["date_read"] = date_read
            if note and note not in existing["notes"]:
                existing["notes"] = f"{existing['notes']}; {note}".strip("; ")
            if category and not existing["category"]:
                existing["category"] = category
            if lent_to and not existing["lent_to"]:
                existing["lent_to"] = lent_to
            if recommended_by and not existing["recommended_by"]:
                existing["recommended_by"] = recommended_by
            if price is not None and existing["current_price"] is None:
                existing["current_price"] = price
                existing["price_checked_at"] = now_iso
                existing["price_history"] = [{"price": price, "checked_at": now_iso}]
            continue

        sessions: list[dict[str, Any]] = []
        if status == "read":
            sessions.append({"started_at": None, "finished_at": date_read, "outcome": "finished", "note": ""})
        elif status == "reading":
            sessions.append({"started_at": None, "finished_at": None, "outcome": "reading", "note": ""})
        elif status == "abandoned":
            sessions.append({"started_at": None, "finished_at": date_read, "outcome": "abandoned", "note": ""})

        book_rec: dict[str, Any] = {
            "id": f"bk_{len(books) + 1:04d}",
            "title": title,
            "author": author,
            "pub_year": None,
            "pub_year_source": None,
            "pub_year_confidence": "missing",
            "is_factual": is_factual,
            "list_scope": "library",
            "ownership": ownership,
            "source": source,
            "status": status,
            "date_read": date_read,
            "reading_sessions": sessions,
            "series_id": series_id,
            "series_order": series_order,
            "amazon_asin": asin,
            "amazon_legacy_code": legacy_code,
            "current_price": price,
            "target_price": None,
            "price_checked_at": now_iso if price is not None else None,
            "price_history": [{"price": price, "checked_at": now_iso}] if price is not None else [],
            "category": category,
            "recommended_by": recommended_by,
            "lent_to": lent_to,
            "abandon_reason": None,
            "notes": note,
        }
        books.append(book_rec)
        seen_book_keys[key] = book_rec

    # Flag duplicate ASINs with different titles in Books
    asin_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in books:
        if b["amazon_asin"]:
            asin_groups[b["amazon_asin"]].append(b)
    for asin_val, grp in asin_groups.items():
        if len(grp) > 1:
            desc = ", ".join(f"{x['author']} - {x['title']}" for x in grp)
            anomalies.append(f"Duplicate ASIN `{asin_val}` in Books sheet across distinct titles (kept separate): {desc}")

    # 3. Merge Series sheet
    for row in raw_series:
        author = clean_str(row.get("Author"))
        title = clean_str(row.get("Title"))
        if not title:
            continue
        series_nm = normalize_series_name(clean_str(row.get("Series")))
        series_order = parse_series_order(row.get("Series_ID"))
        pub_year = parse_year(row.get("Date"))
        owned_flag = flag_set(row.get("Owned"))
        read_flag = flag_set(row.get("Read"))
        raw_amzn = clean_str(row.get("Amzn_ID"))
        asin = normalize_asin(raw_amzn)
        if raw_amzn and re.match(r"^\d{9}$", raw_amzn):
            anomalies.append(f"Zero-padded 9-digit ASIN `{raw_amzn}` -> `{asin}` for `{author} - {title}`.")

        s_obj = ensure_series(series_nm, author if author.lower() != "unknown" else None)

        # Try matching existing book in Books
        match: dict[str, Any] | None = None
        s_surname = author_surname(author)

        # 3a. Match by ASIN + author surname (or title similarity)
        if asin:
            for b in books:
                if b["amazon_asin"] == asin:
                    if (
                        (s_surname and s_surname == author_surname(b["author"]))
                        or titles_match(b["title"], title)
                        or s_surname == "unknown"
                    ):
                        match = b
                        break

        # 3b. Match by author surname + title match
        if match is None:
            for b in books:
                if s_surname and s_surname != "unknown" and s_surname != author_surname(b["author"]):
                    continue
                if titles_match(b["title"], title):
                    match = b
                    break

        if match is not None:
            matched_series_rows += 1
            # Prefer specific sub-series over generic Discworld
            existing_series = next((s for s in series_by_name.values() if s["id"] == match["series_id"]), None)
            if existing_series is None or existing_series["name"] == "Discworld":
                match["series_id"] = s_obj["id"]
            if series_order is not None and (match["series_order"] is None or existing_series and existing_series["name"] == "Discworld"):
                match["series_order"] = series_order
            if pub_year is not None and match["pub_year"] is None:
                match["pub_year"] = pub_year
                match["pub_year_source"] = "series_sheet"
                match["pub_year_confidence"] = "exact"
            if asin and not match["amazon_asin"]:
                match["amazon_asin"] = asin
            if owned_flag:
                match["ownership"] = "owned"
            if read_flag and match["status"] == "unread":
                match["status"] = "read"
                if not match["reading_sessions"]:
                    match["reading_sessions"].append(
                        {"started_at": None, "finished_at": match["date_read"], "outcome": "finished", "note": ""}
                    )
            if series_nm == "Non fiction":
                match["is_factual"] = True
        else:
            added_series_rows += 1
            status = "read" if read_flag else "unread"
            ownership = "owned" if (owned_flag or read_flag) else "not_owned"
            list_scope = "library" if (ownership == "owned" or status == "read") else "series_backlog"
            sessions = (
                [{"started_at": None, "finished_at": None, "outcome": "finished", "note": ""}]
                if status == "read"
                else []
            )
            books.append(
                {
                    "id": f"bk_{len(books) + 1:04d}",
                    "title": title,
                    "author": author,
                    "pub_year": pub_year,
                    "pub_year_source": "series_sheet" if pub_year else None,
                    "pub_year_confidence": "exact" if pub_year else "missing",
                    "is_factual": series_nm == "Non fiction",
                    "list_scope": list_scope,
                    "ownership": ownership,
                    "source": "kindle" if asin else "other",
                    "status": status,
                    "date_read": None,
                    "reading_sessions": sessions,
                    "series_id": s_obj["id"],
                    "series_order": series_order,
                    "amazon_asin": asin,
                    "amazon_legacy_code": None,
                    "current_price": None,
                    "target_price": None,
                    "price_checked_at": None,
                    "price_history": [],
                    "category": None,
                    "recommended_by": None,
                    "lent_to": None,
                    "abandon_reason": None,
                    "notes": "",
                }
            )

    # 4. Optional network enrichment
    eu_stats = None
    if resolve_eu:
        eu_stats = resolve_eu_links(books, cache_dir / "eu_links.json")

    date_stats = None
    if enrich_dates:
        date_stats = enrich_pub_dates(books, cache_dir / "pub_dates.json")

    series_list = sorted(series_by_name.values(), key=lambda s: (s["parent_series_id"] or "", s["name"].lower()))

    output_payload = {
        "schema_version": 1,
        "updated_at": now_iso,
        "series": series_list,
        "books": books,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output_payload, indent=2, ensure_ascii=False), encoding="utf-8")

    # 5. Migration report
    if report_path:
        status_counts = Counter(b["status"] for b in books)
        scope_counts = Counter(b["list_scope"] for b in books)
        own_counts = Counter(b["ownership"] for b in books)
        with_year = sum(1 for b in books if b["pub_year"] is not None)
        with_asin = sum(1 for b in books if b["amazon_asin"])
        eu_remaining = [b for b in books if b["amazon_legacy_code"] and not b["amazon_asin"]]
        missing_year_books = [b for b in books if b["pub_year"] is None]

        lines = [
            "# BookList Migration Report",
            "",
            f"- Generated: `{now_iso}`",
            f"- Input: `{input_path}` ({len(raw_books)} Books rows, {len(raw_series)} Series rows)",
            f"- Output: `{output_path}` ({len(books)} unified books, {len(series_list)} series)",
            "",
            "## Merge Summary",
            f"- Deduplicated within Books sheet: **{merged_in_books}**",
            f"- Series rows matched to existing Books entries: **{matched_series_rows}**",
            f"- Series rows added as new entries: **{added_series_rows}**",
            f"- `list_scope`: `library`={scope_counts['library']}, `series_backlog`={scope_counts['series_backlog']}",
            f"- `ownership`: `owned`={own_counts['owned']}, `not_owned`={own_counts['not_owned']}",
            f"- `status`: " + ", ".join(f"`{k}`={v}" for k, v in sorted(status_counts.items())),
            f"- Amazon ASIN present: **{with_asin}/{len(books)}** (unresolved `amzn.eu` only: **{len(eu_remaining)}**)",
            f"- Publication year populated: **{with_year}/{len(books)}** (still missing: **{len(missing_year_books)}**)",
            "",
        ]
        if eu_stats:
            lines.extend(
                [
                    "## `amzn.eu` Redirect Resolution",
                    f"- Attempted: {eu_stats['attempted']}, Resolved to ASIN: {eu_stats['resolved']}, Failed: {eu_stats['failed']}, Cache hits: {eu_stats['from_cache']}",
                    "",
                ]
            )
        if date_stats:
            lines.extend(
                [
                    "## Publication Date Enrichment",
                    f"- Needed: {date_stats['needed']}, Open Library: {date_stats['openlibrary']}, Google Books: {date_stats['google_books']}, Still missing: {date_stats['still_missing']}, Cache hits: {date_stats['from_cache']}",
                    "",
                ]
            )
        if anomalies:
            lines.append("## Data Anomalies Handled")
            for a in anomalies:
                lines.append(f"- {a}")
            lines.append("")
        if eu_remaining:
            lines.append(f"## Unresolved `amzn.eu` Links ({len(eu_remaining)})")
            for b in eu_remaining[:40]:
                lines.append(f"- `{b['id']}` {b['author']} — {b['title']} (`https://amzn.eu/{b['amazon_legacy_code']}`)")
            lines.append("")
        if missing_year_books:
            lines.append(f"## Sample Books Still Missing Publication Year ({len(missing_year_books)} total)")
            for b in missing_year_books[:30]:
                lines.append(f"- `{b['id']}` {b['author']} — {b['title']}")
            lines.append("")

        report_path.write_text("\n".join(lines), encoding="utf-8")

    return output_payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate BookList.xlsx to library.json")
    parser.add_argument("--input", type=Path, default=Path("Data/BookList.xlsx"))
    parser.add_argument("--output", type=Path, default=Path("Data/library.json"))
    parser.add_argument("--report", type=Path, default=Path("migration_report.md"))
    parser.add_argument("--resolve-eu", action="store_true", help="Follow amzn.eu redirects to get canonical ASINs")
    parser.add_argument("--enrich-dates", action="store_true", help="Fetch missing publication years from Open Library / Google Books")
    parser.add_argument("--cache-dir", type=Path, default=Path("scripts/.cache"))
    args = parser.parse_args()

    payload = migrate(
        input_path=args.input,
        output_path=args.output,
        report_path=args.report,
        resolve_eu=args.resolve_eu,
        enrich_dates=args.enrich_dates,
        cache_dir=args.cache_dir,
    )
    print(f"Migrated {len(payload['books'])} books and {len(payload['series'])} series -> {args.output}")
    if args.report:
        print(f"Report written -> {args.report}")


if __name__ == "__main__":
    main()
