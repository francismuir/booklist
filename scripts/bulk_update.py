#!/usr/bin/env python3
"""Reusable bulk Excel (.xlsx) updater for BookList's library.json.

Zero third-party dependencies (Python 3 standard library only).

Supports columns (case-insensitive):
  Title, Author, Publication (or Pub Year / Year), owned, source,
  Series, Sub-series (or Subseries), Series Order, Factual, Status,
  Price, Amazon ID, Notes, Category.
"""

from __future__ import annotations

import argparse
import datetime
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

OMNIBUS_TO_PARENT = {
    "the ultimate wodehouse collection": "Wodehouse",
    "the jeeves omnibus vol 1": "Wodehouse",
}

VALID_SOURCES = {"kindle", "google_books", "humble_bundle", "physical", "other"}
VALID_STATUSES = {"unread", "up_next", "reading", "read", "abandoned"}


def clean_str(val: Any) -> str:
    if val is None:
        return ""
    return re.sub(r"\s+", " ", str(val)).strip()


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = s.replace("ü", "u").replace("é", "e").replace("ó", "o")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s or "unknown"


def norm_match(text: str) -> str:
    s = clean_str(text).lower()
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9']+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def base_title_norm(title: str) -> str:
    s = clean_str(title).lower().replace("’", "'").replace("‘", "'")
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", s)
    s = s.split(":", 1)[0]
    s = re.sub(r"[^a-z0-9']+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def author_surname(author: str) -> str:
    a = norm_match(author)
    if not a:
        return ""
    return a.split()[-1]


def flag_set(val: Any) -> bool:
    if val is None:
        return False
    return str(val).strip().lower() in {"1", "true", "yes", "y", "owned"}


def parse_year(val: Any) -> int | None:
    if val is None:
        return None
    m = re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", str(val))
    return int(m.group(1)) if m else None


def parse_float(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip().replace("£", "")
    if not s:
        return None
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def parse_order(val: Any) -> float | None:
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


def normalize_source(val: Any) -> str:
    raw = clean_str(val).lower().replace(" ", "_")
    if raw in VALID_SOURCES:
        return raw
    if "google" in raw:
        return "google_books"
    if "humble" in raw:
        return "humble_bundle"
    if "kindle" in raw:
        return "kindle"
    if "physical" in raw or "paperback" in raw or "hardback" in raw:
        return "physical"
    return "other"


def normalize_asin(code: Any) -> str | None:
    s = clean_str(code).upper()
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


def load_xlsx_rows(path: Path) -> list[dict[str, Any]]:
    with zipfile.ZipFile(path) as z:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared_strings.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {el.attrib["Id"]: el.attrib["Target"] for el in rels}

        all_records: list[dict[str, Any]] = []
        for sh in wb.findall(".//m:sheet", NS):
            rid = next((v for k, v in sh.attrib.items() if k.endswith("}id") or k == "id"), None)
            if not rid or rid not in rel_map:
                continue
            rel_target = rel_map[rid].lstrip("/")
            target = rel_target if rel_target.startswith("xl/") else "xl/" + rel_target
            sroot = ET.fromstring(z.read(target))
            raw_rows: list[list[Any]] = []
            for r_el in sroot.findall(".//m:sheetData/m:row", NS):
                row_dict: dict[int, Any] = {}
                for c_el in r_el.findall("m:c", NS):
                    col_str = re.match(r"[A-Z]+", c_el.attrib["r"]).group(0)
                    ci = col_to_idx(col_str)
                    v_el = c_el.find("m:v", NS)
                    if v_el is not None and v_el.text is not None:
                        t = c_el.attrib.get("t")
                        row_dict[ci] = shared_strings[int(v_el.text)] if t == "s" else v_el.text
                if row_dict:
                    max_c = max(row_dict.keys())
                    raw_rows.append([row_dict.get(i) for i in range(max_c + 1)])
            if not raw_rows:
                continue
            headers = [clean_str(h).lower().replace("-", "_").replace(" ", "_") for h in raw_rows[0]]
            for row in raw_rows[1:]:
                padded = row + [None] * (len(headers) - len(row))
                rec = dict(zip(headers, padded))
                if any(v is not None and str(v).strip() != "" for v in rec.values()):
                    all_records.append(rec)
        return all_records


def pick_col(rec: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in rec and rec[k] is not None and str(rec[k]).strip() != "":
            return rec[k]
    return None


def next_book_id_generator(books: list[dict[str, Any]]) -> int:
    max_num = 0
    for b in books:
        m = re.match(r"^bk_(\d+)$", str(b.get("id", "")))
        if m:
            max_num = max(max_num, int(m.group(1)))
    return max_num + 1


def apply_bulk_update(
    input_path: Path,
    library_path: Path,
    *,
    dry_run: bool = False,
    report_path: Path | None = None,
) -> dict[str, Any]:
    raw_rows = load_xlsx_rows(input_path)
    library = json.loads(library_path.read_text(encoding="utf-8"))
    books: list[dict[str, Any]] = library["books"]
    series_list: list[dict[str, Any]] = library["series"]

    now_iso = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    # 1. Pre-parse and deduplicate rows within the spreadsheet
    parsed_rows: list[dict[str, Any]] = []
    dedup_index: dict[tuple[str, str], dict[str, Any]] = {}
    deduped_in_sheet: list[str] = []

    for row_idx, rec in enumerate(raw_rows, start=2):
        title = clean_str(pick_col(rec, "title"))
        author = clean_str(pick_col(rec, "author"))
        if not title or not author:
            continue

        raw_series = clean_str(pick_col(rec, "series"))
        sub_series = clean_str(pick_col(rec, "sub_series", "subseries"))
        omnibus_note = ""
        parent_series = raw_series
        if raw_series.lower() in OMNIBUS_TO_PARENT:
            omnibus_note = f"In: {raw_series}"
            parent_series = OMNIBUS_TO_PARENT[raw_series.lower()]

        owned = flag_set(pick_col(rec, "owned", "bought"))
        source = normalize_source(pick_col(rec, "source"))
        pub_year = parse_year(pick_col(rec, "publication", "pub_year", "year"))
        series_order = parse_order(pick_col(rec, "series_order", "series_n", "order"))
        factual = flag_set(pick_col(rec, "factual"))
        status_raw = clean_str(pick_col(rec, "status")).lower()
        status = status_raw if status_raw in VALID_STATUSES else "unread"
        price = parse_float(pick_col(rec, "price", "current_price"))
        asin = normalize_asin(pick_col(rec, "amazon_id", "amazon_asin", "asin"))
        category = clean_str(pick_col(rec, "category")) or None
        raw_note = clean_str(pick_col(rec, "notes", "note"))
        notes = "; ".join([x for x in [raw_note, omnibus_note] if x])

        entry = {
            "row_idx": row_idx,
            "title": title,
            "author": author,
            "pub_year": pub_year,
            "owned": owned,
            "source": source,
            "parent_series": parent_series,
            "sub_series": sub_series,
            "series_order": series_order,
            "factual": factual,
            "status": status,
            "price": price,
            "asin": asin,
            "category": category,
            "notes": notes,
        }

        dkey = (author_surname(author), norm_match(title))
        if dkey in dedup_index:
            prev = dedup_index[dkey]
            deduped_in_sheet.append(f"{author} — {title} (rows {prev['row_idx']} & {row_idx})")
            # Prefer owned copy, and merge notes/source/sub-series if needed
            if entry["owned"] and not prev["owned"]:
                merged_notes = "; ".join([x for x in [entry["notes"], prev["notes"]] if x and x not in entry["notes"]])
                entry["notes"] = merged_notes
                idx = parsed_rows.index(prev)
                parsed_rows[idx] = entry
                dedup_index[dkey] = entry
            else:
                if entry["notes"] and entry["notes"] not in prev["notes"]:
                    prev["notes"] = "; ".join([x for x in [prev["notes"], entry["notes"]] if x])
            continue

        dedup_index[dkey] = entry
        parsed_rows.append(entry)

    # 2. Ensure parent and sub-series exist in series_list
    existing_series_by_key = {(s.get("parent_series_id"), s["name"].lower()): s for s in series_list}
    existing_series_ids = {s["id"] for s in series_list}
    created_series: list[dict[str, Any]] = []

    def ensure_series(name: str, parent_id: str | None, author_default: str | None) -> dict[str, Any]:
        key = (parent_id, name.lower())
        if key in existing_series_by_key:
            return existing_series_by_key[key]
        if parent_id:
            parent_slug = parent_id.removeprefix("ser_")
            base_id = f"ser_{parent_slug}__{slugify(name)}"
        else:
            base_id = f"ser_{slugify(name)}"
        sid = base_id
        suffix = 2
        while sid in existing_series_ids:
            sid = f"{base_id}_{suffix}"
            suffix += 1
        obj = {
            "id": sid,
            "name": name,
            "parent_series_id": parent_id,
            "author_default": author_default,
        }
        series_list.append(obj)
        existing_series_ids.add(sid)
        existing_series_by_key[key] = obj
        created_series.append(obj)
        return obj

    # Track current max series_order per series_id
    max_order_by_series: dict[str, float] = defaultdict(float)
    for b in books:
        if b.get("series_id") and b.get("series_order") is not None:
            max_order_by_series[b["series_id"]] = max(
                max_order_by_series[b["series_id"]], float(b["series_order"])
            )

    # Index existing books for matching
    books_by_exact: dict[tuple[str, str], dict[str, Any]] = {}
    books_by_base: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for b in books:
        sur = author_surname(b.get("author", ""))
        books_by_exact[(sur, norm_match(b.get("title", "")))] = b
        books_by_base[(sur, base_title_norm(b.get("title", "")))].append(b)

    next_num = next_book_id_generator(books)
    matched_updates: list[str] = []
    added_books: list[dict[str, Any]] = []

    for entry in parsed_rows:
        target_series_id: str | None = None
        if entry["parent_series"]:
            p_obj = ensure_series(entry["parent_series"], None, entry["author"])
            target_series_id = p_obj["id"]
            if entry["sub_series"]:
                sub_obj = ensure_series(entry["sub_series"], p_obj["id"], entry["author"])
                target_series_id = sub_obj["id"]

        sur = author_surname(entry["author"])
        match = books_by_exact.get((sur, norm_match(entry["title"])))
        if match is None:
            candidates = books_by_base.get((sur, base_title_norm(entry["title"])), [])
            if len(candidates) == 1:
                match = candidates[0]

        if match is not None:
            # Determine series order if attaching to a series
            order_val = entry["series_order"]
            if target_series_id and match.get("series_id") != target_series_id:
                if order_val is None:
                    nxt = int(max_order_by_series[target_series_id]) + 1
                    max_order_by_series[target_series_id] = nxt
                    order_val = nxt
                match["series_id"] = target_series_id
                match["series_order"] = order_val
            elif target_series_id and match.get("series_order") is None:
                if order_val is None:
                    nxt = int(max_order_by_series[target_series_id]) + 1
                    max_order_by_series[target_series_id] = nxt
                    order_val = nxt
                match["series_order"] = order_val

            if entry["pub_year"] and not match.get("pub_year"):
                match["pub_year"] = entry["pub_year"]
                match["pub_year_source"] = "manual"
                match["pub_year_confidence"] = "exact"
            if entry["owned"] and match.get("ownership") != "owned":
                match["ownership"] = "owned"
                match["list_scope"] = "library"
            if entry["notes"] and entry["notes"] not in (match.get("notes") or ""):
                match["notes"] = "; ".join([x for x in [match.get("notes"), entry["notes"]] if x])
            matched_updates.append(
                f"`{match['id']}` {match['author']} — {match['title']} (kept status `{match['status']}`, series={target_series_id})"
            )
            continue

        order_val = entry["series_order"]
        if target_series_id:
            if order_val is None:
                nxt = int(max_order_by_series[target_series_id]) + 1
                max_order_by_series[target_series_id] = nxt
                order_val = nxt
            else:
                max_order_by_series[target_series_id] = max(max_order_by_series[target_series_id], float(order_val))

        ownership = "owned" if entry["owned"] else "not_owned"
        list_scope = "library" if (ownership == "owned" or not target_series_id) else "series_backlog"

        new_book = {
            "id": f"bk_{next_num:04d}",
            "title": entry["title"],
            "author": entry["author"],
            "pub_year": entry["pub_year"],
            "pub_year_source": "manual" if entry["pub_year"] else None,
            "pub_year_confidence": "exact" if entry["pub_year"] else "missing",
            "is_factual": entry["factual"],
            "list_scope": list_scope,
            "ownership": ownership,
            "source": entry["source"],
            "status": entry["status"],
            "date_read": None,
            "reading_sessions": [],
            "series_id": target_series_id,
            "series_order": order_val,
            "amazon_asin": entry["asin"],
            "amazon_legacy_code": None,
            "current_price": entry["price"],
            "target_price": None,
            "price_checked_at": now_iso if entry["price"] is not None else None,
            "price_history": [{"price": entry["price"], "checked_at": now_iso}] if entry["price"] is not None else [],
            "category": entry["category"],
            "recommended_by": None,
            "lent_to": None,
            "abandon_reason": None,
            "notes": entry["notes"],
        }
        next_num += 1
        books.append(new_book)
        added_books.append(new_book)
        books_by_exact[(sur, norm_match(new_book["title"]))] = new_book
        books_by_base[(sur, base_title_norm(new_book["title"]))].append(new_book)

    series_list.sort(key=lambda s: (s.get("parent_series_id") or "", s["name"].lower()))
    library["updated_at"] = now_iso

    if not dry_run:
        library_path.write_text(json.dumps(library, indent=2, ensure_ascii=False), encoding="utf-8")

    summary = {
        "input_rows": len(raw_rows),
        "deduped_in_sheet": deduped_in_sheet,
        "created_series": created_series,
        "matched_updates": matched_updates,
        "added_books_count": len(added_books),
        "added_owned": sum(1 for b in added_books if b["ownership"] == "owned"),
        "added_unowned_backlog": sum(1 for b in added_books if b["list_scope"] == "series_backlog"),
        "added_unowned_library": sum(
            1 for b in added_books if b["ownership"] == "not_owned" and b["list_scope"] == "library"
        ),
        "total_books": len(books),
        "total_series": len(series_list),
    }

    if report_path:
        lines = [
            f"# Bulk Update Report ({now_iso})",
            "",
            f"- Input: `{input_path}` ({len(raw_rows)} rows)",
            f"- Library: `{library_path}` ({'DRY RUN' if dry_run else 'WRITTEN'})",
            f"- Total after update: **{len(books)} books**, **{len(series_list)} series**",
            "",
            "## Summary",
            f"- Deduplicated within spreadsheet: **{len(deduped_in_sheet)}**",
            f"- New series/sub-series created: **{len(created_series)}**",
            f"- Existing books matched & updated: **{len(matched_updates)}**",
            f"- New books added: **{len(added_books)}** (owned={summary['added_owned']}, unowned series backlog={summary['added_unowned_backlog']}, unowned library={summary['added_unowned_library']})",
            "",
        ]
        if deduped_in_sheet:
            lines.append("## Deduplicated Within Spreadsheet")
            lines.extend(f"- {x}" for x in deduped_in_sheet)
            lines.append("")
        if matched_updates:
            lines.append("## Existing Books Matched & Updated")
            lines.extend(f"- {x}" for x in matched_updates)
            lines.append("")
        if created_series:
            lines.append("## Series Created")
            for s in created_series:
                lines.append(f"- `{s['id']}` {s['name']} (parent={s['parent_series_id']})")
            lines.append("")
        report_path.write_text("\n".join(lines), encoding="utf-8")

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply bulk Excel updates to BookList library.json")
    parser.add_argument("--input", type=Path, required=True, help="Path to update .xlsx file")
    parser.add_argument("--library", type=Path, default=Path("Data/booklist-data/library.json"))
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without modifying library.json")
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    s = apply_bulk_update(args.input, args.library, dry_run=args.dry_run, report_path=args.report)
    mode = "DRY RUN" if args.dry_run else "UPDATED"
    print(f"[{mode}] rows={s['input_rows']}, deduped={len(s['deduped_in_sheet'])}, new_series={len(s['created_series'])}, matched={len(s['matched_updates'])}, added={s['added_books_count']} (owned={s['added_owned']}, series_backlog={s['added_unowned_backlog']}, wishlist={s['added_unowned_library']}) -> total: {s['total_books']} books, {s['total_series']} series")
    for x in s["deduped_in_sheet"]:
        print("  deduped:", x)
    for x in s["matched_updates"]:
        print("  matched:", x)
    for cs in s["created_series"]:
        print("  series :", cs["id"], "|", cs["name"], "| parent:", cs["parent_series_id"])


if __name__ == "__main__":
    main()
