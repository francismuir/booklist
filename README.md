# BookList — Reading, Series & Price Tracker

A zero-build static web application designed for **GitHub Pages**, paired with a **private GitHub data repository** (`library.json`) so your personal reading list and notes stay private while remaining accessible from any device.

## Features
- **On the Go Dashboard**: Tracks Fiction and Factual books currently being read side-by-side, plus an Up Next queue and a smart **Random Book Picker** (with Factual/Fiction balance nudging and a series-order guard).
- **Unified Book List & Series Tracker**: Single source of truth across standalone books and series (with Discworld sub-series grouped under Discworld). Marking a book *Bought*, *Reading*, *Read*, or *Abandoned* updates everywhere at once.
- **CSV Price Check Round-Trip**: Download a CSV (`book_id`, `amazon_id`, `amazon_url`, `author`, `title`, `current_price`, `new_price`), enter updated Kindle prices, and upload it back to preview price drops, target-price hits, and apply updates with price history.
- **Reading Analytics & Maintenance**: Yearly Fiction/Factual reading chart, recommender stats, lent-book tracking, and one-click Open Library / Google Books publication year lookup.

## Local Preview
Run a static HTTP server from this folder:
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000`. When served locally, the app automatically loads `Data/library.json` if present.

## Migrating `Data/BookList.xlsx`
```bash
python3 scripts/migrate_booklist.py --input Data/BookList.xlsx --output Data/library.json --report migration_report.md --resolve-eu --enrich-dates
```
- Merges `Books` and `Series`, cleans whitespace/typos, normalizes `Discworld` sub-series, upgrades `amzn.eu` short links where resolvable, and backfills publication years via Open Library & Google Books (with local caching in `scripts/.cache/`).

## Hosting on GitHub Pages (Private Data Pattern)
1. Push this app repo (without `Data/library.json` — it is in `.gitignore`) to a **public** GitHub repo and enable **Settings → Pages → Deploy from branch (`main`, `/`)**.
2. Create a separate **private** GitHub repo (e.g. `booklist-data`).
3. Create a **Fine-Grained Personal Access Token** scoped *only* to `booklist-data` with **Contents: Read and write**.
4. Open your deployed site → **Sync & Data**, enter your GitHub details + token, and push/pull `library.json`.
