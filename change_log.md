# BookList Development Change Log

Chronological log of the development of the BookList app, recording the date and time (UTC), prompt, and a summary of actions taken. Routine repository sync/commit/push requests are omitted.

---

## 2026-11-24

### 2026-11-24 12:31:28 UTC — Initial Architecture & Feature Design

**Prompt:**
> Read my notes in the App_notes.txt file. Put together a design for a system that will do all this. Suggest features that I have not thought of.

**Actions:**
- Reviewed `App_notes.txt` and inspected `Data/BookList.xlsx` (`503` Books rows, `220` Series rows, `71` overlapping titles).
- Designed a unified single-table `books` schema with `list_scope` (`library` vs `series_backlog`), nested `series` (`parent_series_id`), orthogonal `ownership`/`status` states, `reading_sessions`, and `price_history`, captured in `Recommendation.md`.
- Proposed workflow views (**On the Go**, **Random Book Picker**, **Book List**, **Series Tracker**, **Wishlist & Prices**, and **Add Book Modal**), publication-year backfill via Open Library/Google Books, Amazon UK price-check approaches, and 10 extra features (price-drop target alerts, structured `recommended_by` / `lent_to` fields, re-read tracking, reading analytics, series-order randomizer guard, abandonment reasons, non-Amazon format tracking, author views, new-release checking, and bookmarklet quick-add).

---

### 2026-11-24 12:39:09 UTC — Adapting Architecture for GitHub Pages

**Prompt:**
> I intend to host it with all my other sites on Github pages so that will limit my technology options.

**Actions:**
- Adapted the architecture for static GitHub Pages hosting using a split **public app repository (`booklist`) + private data repository (`booklist-data`)** connected directly from the browser via a Fine-Grained Personal Access Token and the GitHub REST API, with `localStorage` caching and hash routing.
- Compared storage alternatives (private GitHub `library.json`, Firebase Firestore, local-only `IndexedDB`), confirmed Open Library/Google Books CORS lookup works directly from the browser, and proposed bookmarklet/guided price checking alongside static Excel/CSV export.

---

### 2026-11-24 15:04:29 UTC — Data Migration Pipeline & Initial Web App Build

**Prompt:**
> 1. Go ahead with option 1 as this seems the easiest option.
> 2. For price checking I would prefer some sort of file update. Download a file with Amazon i.d., title and author and I can then add the price and upload to update the database.
> 3. Go ahead

**Actions:**
- Created `scripts/migrate_booklist.py` (zero-dependency Python 3) to merge `Books` and `Series` from `Data/BookList.xlsx` into `library.json` (`603` books, `37` series including 10 Discworld sub-series), resolve 28 `amzn.eu` short links to canonical `/dp/ASIN` codes (`593/603` populated), backfill `510/603` publication years (`211` from Series + `299` via Open Library), clean data anomalies, and generate `migration_report.md`.
- Built the zero-build-step ES module web application (`index.html`, `manifest.json`, `css/styles.css`, `js/app.js`, `js/store.js`, `js/github.js`, `js/csv.js`, `js/randomizer.js`, `js/openlibrary.js`, `js/utils.js`) and all core views (`dashboard.js`, `books.js`, `series.js`, `wishlist.js`, `stats.js`, `bookModal.js`, `settings.js`), including the CSV Price Check Round-Trip workflow.
- Verified JSON data integrity, ES module imports/exports, and unit tests in JavaScriptCore (`jsc`).

---

## 2026-11-25

### 2026-11-25 10:36:55 UTC — Diagnosing Local Dev Server Directory Listing

**Prompt:**
> when i navigate to http://localhost:8000 I get a directory listing.

**Actions:**
- Identified that the HTTP server was running from a parent directory rather than the `BookList` workspace folder (or colliding on port `8000`) and provided the explicit `python3 -m http.server 8000 --directory ...` launch command.

---

### 2026-11-25 10:39:22 UTC — Fixing Case-Consistent Data Paths

**Prompt:**
> Make that change for me.

**Actions:**
- Moved the sample fallback library to `assets/sample-library.json` (tracked outside the ignored `Data/` folder) so paths behave consistently across macOS and Linux/GitHub Pages.
- Updated `js/store.js` to load `./Data/library.json` locally and fall back to `./assets/sample-library.json` on GitHub Pages, and aligned `scripts/migrate_booklist.py`, `README.md`, `.gitignore`, and `js/views/settings.js` to use `Data/`.

---

### 2026-11-25 14:55:51 UTC — Wishlist Compare, Bulk Target Prices, Series Management, Clickable KPIs & Listener Bug Fix

**Prompt:**
> Wishlist tab:
> 1. I keep this synchronised with my Amazon wishlist (this is where I find the prices) at https://www.amazon.co.uk/hz/wishlist/ls/12LA6VRK0EH8U?type=wishlist&filter=unpurchased&sort=price-asc&viewType=list
> 2. All the books in the wishlist here should also be on the wishlist on Amazon. Put a link to the wishlist at the top of the wishlist tab.
> 3. Is there any way to view the Amazon wishlist and compare it with the app wishlist without making the app too complex. I want to know if books are missing from either list.
> 4. Give the option to set a target price on all books. 
>
> Series tab:
> 1. When I click a series it does not expand to see the books in the series. The very first time I clicked it expanded the series but despite refreshing the page, it no longer expands. The expand all button works but clicking on a series does not collapse it.
> 2. Add functionality to create a new series and add existing and new books to that series.
>
> On the Go tab (home page):
> 1. Clicking on any of the boxes should take me to the book list page with the relevant filters set similarly to the Up next queue box. So clicking on 'Owned & Unread (TBR)' would open the Book page with filters Owned/Bought and Unread set.
> 2. Remove the existing two buttons that perform this functionality.

**Actions:**
- **Root-cause click bug fix:** Fixed duplicate event listener accumulation across all view modules (`dashboard.js`, `books.js`, `series.js`, `wishlist.js`, `stats.js`) by binding delegated handlers onto a fresh `.view-root` wrapper inside the persistent container, restoring reliable single-click series expand/collapse.
- **Wishlist tab (`js/views/wishlist.js`, `js/amazonWishlist.js`, `js/store.js`, `js/views/settings.js`):** Added the **Open Amazon UK Wishlist ↗** header link (configurable in Settings), the **Compare with Amazon Wishlist** panel (1-click bookmarklet + HTML/JSON/ASIN input showing missing items and price changes), and the **Bulk Target Price** bar across configurable book scopes.
- **Series tab (`js/views/series.js`, `js/views/seriesModal.js`):** Added **+ New Series**, **+ Add Existing Books** (searchable multi-select modal with auto-incrementing order numbers), and **+ Add New Book** workflows, keeping newly created empty series visible.
- **On the Go tab (`js/views/dashboard.js`, `js/views/books.js`, `css/styles.css`):** Removed the two redundant header buttons and made all 4 KPI summary cards navigate to **Book List** with matching status/ownership/read-year filters applied.

---

### 2026-11-25 15:46:43 UTC — Fixing Amazon Wishlist Matching for Cross-Edition ISBN/ASIN & Subtitle Variants

**Prompt:**
> On the compare with Amazon wishlist. All match except two books:
> 1. Ricky's Hand
> 2. Under the Eagle (Eagles of the Empire 1)
> These in the missing from Amazon box. Both are on the Amazon wishlist.

**Actions:**
- Upgraded `js/amazonWishlist.js` (both parser and bookmarklet) to extract ASINs from `/dp/`, `/gp/product/`, `/gp/offer-listing/`, and `data-reposition-action-params` (`ASIN:...`), keep title-only items without a URL, and match symmetrically across **exact ASIN → exact title → normalized base title + author surname**.
- Added `applyAsinUpdates` in `js/store.js` and an **"Update N ASIN(s) from Amazon"** banner in `js/views/wishlist.js` so cross-edition matches (such as paperback ISBN vs Kindle ASIN) can be synced with one click.

---

### 2026-11-25 16:04:24 UTC — Live Wishlist Re-Comparison, Quoted ASIN Parsing & Title/Byline Normalization

**Prompt:**
> The two books are still marked as in the App Wishlist but missing from Amazon. 
>
> I notice that the two books have different a Amazon UK i.d. to the one in the JSON file downloaded from the Amazon wishlist.
>
> I manually updated one of the books with the Amazon id from the JSON file by editing the book in the book list but this did not work. It is still marked as missing.
>
> Is this an issue with the update or is there still an issue with the comparison.

**Actions:**
- Fixed stale comparison caching in `js/views/wishlist.js` so `compareAmazonWishlist` recomputes live from `store.data.books` on every render and displays the parsed Amazon item count.
- Hardened `parseAmazonInput` in `js/utils.js` (stripping surrounding quotes/commas and handling `/gp/aw/d/`, `/gp/offer-listing/`, and `ASIN:...`) and added validation warnings in `js/views/bookModal.js` so invalid pasted IDs don't silently clear saved ASINs.
- Improved `baseTitleNorm`, byline cleanup (`by `, `| Format:...`, `(Author)`), and Tier-4 prefix + author-surname fallback matching in `js/amazonWishlist.js`.

---

## 2026-11-26

### 2026-11-26 09:47:42 UTC — Designing Local Backup & Online Sync Conflict Protection

**Prompt:**
> As I make changes in the book and series lists I want to keep a local copy of the new version. I assume all changes are stored in the file library.json in the github repsoitory booklist-data. I am worried that if I make changes locally and push to github this will overwrite changes I have made online. Is there an easy way to keep these in sync.

**Actions:**
- Explained the separation between app code and `booklist-data/library.json` and proposed two complementary safeguards: a read-only one-way local backup script on macOS and automatic pull-on-focus + conflict detection inside the web app.

---

### 2026-11-26 09:49:26 UTC — Implementing Local Backup Sync & Automatic Pull-on-Focus Conflict Protection

**Prompt:**
> I would like both of those.

**Actions:**
- Set up `Data/booklist-data` and created the executable `Data/Sync_BookList_Backup.command` script to pull `library.json` cleanly and export an Excel-ready CSV snapshot (`Data/booklist_backup.csv`).
- Added `checkForRemoteUpdates()` in `js/store.js` and `visibilitychange` / `focus` listeners in `js/app.js` so the app automatically pulls remote updates when there are no unsaved local edits, and shows a non-destructive conflict banner (**Download Local Copy** / **Pull Latest**) if both local and online versions changed.

---

### 2026-11-26 10:03:17 UTC — Adding Leading-Article Title Sort Toggle

**Prompt:**
> When I sort the books by title I would like to ignore 'The' and 'A'. So 'The Ghost Files' is sorted on G. However, I want this to be a toggle as sometimes I want a true sort. Is this possible?

**Actions:**
- Added `sortableTitle(title, ignoreArticles)` in `js/utils.js` to strip leading `The `, `A `, and `An ` when enabled.
- Added an **Ignore "The" / "A" / "An"** checkbox (persisted in `localStorage`) whenever **Sort: Title** is active in `js/views/books.js` and `js/views/wishlist.js`.

---

## 2026-11-27

### 2026-11-27 09:57:59 UTC — Formatting & Documenting Wishlist Bookmarklet

**Prompt:**
> I have pasted the javascript from the toolbar button you created for copying the contents of my Amazon wishlist in to the document. I want to understand this. Will you format it as normal javascript and add commenting.

**Actions:**
- Decoded the minified URL bookmarklet in `javascript_button.js` into readable, indented JavaScript with inline comments explaining the IIFE scope, `li[data-itemid]` discovery, ASIN/title/author/price extraction fallbacks, and clipboard copy logic, and verified execution in JavaScriptCore (`jsc`).

---

### 2026-11-27 10:06:24 UTC — Rewriting & Documenting Amazon ASIN Copy Bookmarklet

**Prompt:**
> I created this javascript shortcut for displaying the Amazon DP code for any loaded book. It is fairly basic and does not work for every book. Will you rewrite it so that it is more robust and instead of displaying the DP code in a text box it copies it to the clipboard.
>
> Give me two versions, one for the Safari shortcut (javascript:) and one readable javascript version so that I can understand what you have done.

**Actions:**
- Rewrote `get_dp.js` with both a URL-encoded Safari `javascript:` bookmarklet and a commented readable JavaScript version.
- Added 4-tier ASIN extraction (`input#ASIN` / edition selector, `location.href` across all Amazon URL formats, `link[rel="canonical"]`, and `[data-asin]` attributes), toast notifications, clipboard copy with `execCommand`/`window.prompt` Safari fallback, and verified in `jsc`.

---

### 2026-11-27 10:16:16 UTC — Renaming "Bought" to "Owned" & Consistent Owned Buttons

**Prompt:**
> Change all occurences of 'bought' to 'owned'. Change the filter Owned / Bought to just Owned.
>
> It is not very clear as to which books I own and which I do not own. At the moment this is simply the existence or absense of the bought (owned) button. I would like a bought (owned) button against every book with the button disabled for books that I own. This will make the list look neater and make it clearer which books I already own.

**Actions:**
- Renamed `markBought` → `markOwned` in `js/store.js` and updated all UI copy, filter options, badges, and buttons across `books.js`, `series.js`, `wishlist.js`, `bookModal.js`, and `dashboard.js` from *Bought/Unbought* to *Owned/Not Owned/Unowned*.
- Styled `.btn-owned-done` in `css/styles.css` and rendered a disabled **Owned** button on owned rows in **Book List** and **Series** so action columns stay aligned and ownership is immediately visible.

---

### 2026-11-27 10:31:01 UTC — Adding Series & Sub-Series Deletion with Selective Book Removal

**Prompt:**
> I want to be able to delete a series or sub-series. If I delete a series that contains sub-series then delete those as well.
>
> When I do this I want to be able to select the books in that series that I want to delete at the same time. Show a list of the books in that series with checkboxes set to selected. I will unselect the books I do not want to delete. The books that I don't delete will have their series tag removed. The books that I select to delete will be removed from the book list.
>
> Add a delete button that is visible when I expand the series or sub-series.

**Actions:**
- Added `deleteSeries(seriesId, bookIdsToDelete)` in `js/store.js` to recursively remove the series and descendant sub-series, delete selected books, and clear `series_id`/`series_order` (moving kept `series_backlog` books to `library`) on unselected books.
- Added `openDeleteSeriesModal` in `js/views/seriesModal.js` (with sub-series warning, all-checked default checkboxes, Select All / Unselect All, and live counts) and **Delete Series** buttons inside expanded series/sub-series in `js/views/series.js`.

---

### 2026-11-27 10:38:33 UTC — Diagnosing Cached ES Module Link Error on Localhost

**Prompt:**
> After that update my localhost site (http://localhost:8000/#/books) stopped loading the library. I have checked the terminal and this is the last message '::1 - - [27/Nov/2026 10:37:25] "GET /favicon.ico HTTP/1.1" 404 -'

**Actions:**
- Verified the full `js/app.js` module graph and all 5 views rendered cleanly against `Data/library.json` in `jsc`.
- Identified a browser HTTP cache mismatch between the updated `series.js` and cached `seriesModal.js` missing the new `openDeleteSeriesModal` export, and provided hard-reload instructions (`Option + Cmd + R` / `Cmd + Shift + R`).

---

### 2026-11-27 12:17:49 UTC — Creating Reusable Bulk Excel Importer & Importing Update Sheet

**Prompt:**
> I have created a new folder called data_update. If I want to make bulk updates I will place an Excel file here. There is one file in there with books that I want to add to my book list. I have left owned and source blank when I do not own a book.

**Actions:**
- Created `scripts/bulk_update.py` (zero-dependency `.xlsx` reader/importer) and excluded `data_update/` in `.gitignore`.
- Synced the latest `library.json` from `booklist-data` (`606` books, `37` series) and imported `data_update/20261127-update.xlsx`: deduplicated 1 row, attached 2 existing books to `Wodehouse → Jeeves`, created `Sherlock Holmes` (6 sub-series) and `Wodehouse` (10 sub-series), added `120` books (`87` owned, `33` unowned backlog) bringing totals to `726` books and `55` series, and refreshed local backups (`Data/library.json`, `Data/booklist_backup.csv`).

---

### 2026-11-27 14:56:07 UTC — Clarifying Series Visibility & `Next` Book Handling

**Prompt:**
> I am unclear on how the series are being handled. The top unowned book (labelled Next) in every series should be on the main booklist. I noticed that the next Aurelio Zen book was not on the main booklist.

**Actions:**
- Audited `Data/booklist-data/library.json` and explained why books labelled `Next` inside Series remained in `series_backlog` until promoted (noting the unowned wishlist books on the main Book List vs `series_backlog` items across the 26 series) and offered automatic or manual options.

---

### 2026-11-27 15:00:48 UTC — Renaming "Promote" Button to "Add to Book List"

**Prompt:**
> That is fine. Now I understand how the Promote button works I am happy to use that to add it to the book list. I don't  want it to happen automatically. I. had not understood that functionality as the term promote is a bit misleading. I am not sure what it is supposed to mean. Should be labelled add to book list?

**Actions:**
- Renamed the `Promote` button to **Add to Book List** (with updated tooltip and toast `"Added to Book List"`) in `js/views/series.js` and `js/views/wishlist.js`.

---

### 2026-11-27 15:03:57 UTC — Shortening Series Action Button Label to "Add"

**Prompt:**
> That label is too long. Just label it 'Add' and leave the tooltip as add to main booklist.

**Actions:**
- Shortened the button label in `js/views/series.js` and `js/views/wishlist.js` to **Add** while retaining `title="Add to main Book List"`.

---

### 2026-11-27 15:20:05 UTC — Diagnosing Missing Match in Amazon Wishlist Compare

**Prompt:**
> The wishlist compare was working but now it fails to find one book in the Amazon Wishlist - 'The Yiddish Policeman's Union'.

**Actions:**
- Checked `bk_0106` (*The Yiddish Policemen’s Union*, ASIN `B009BZ6BUS`) in `library.json` (which had matched earlier) and provided diagnostic steps covering Amazon lazy-load scrolling and ASIN/title matching checks; confirmed resolved in the user's follow-up (`15:24:30 UTC`).

---

### 2026-11-27 15:26:31 UTC — Automatically Updating New Prices During Wishlist Compare

**Prompt:**
> When I compare the book list with the Amazon wishlist and you find new prices. Please update these automatically and notify me. No confirmation necessary.

**Actions:**
- Updated `runComparison` in `js/views/wishlist.js` to call `store.applyPriceUpdates` automatically whenever matched Amazon wishlist prices differ from stored prices, record `lastAutoPriceUpdates` (including **Target Hit!** badges) for display in a summary banner, and show an immediate toast notification with no confirmation step.

---

### 2026-11-27 15:30:41 UTC — Simplifying Wishlist & Price Check Page

**Prompt:**
> I only use Option A on the compare with Amazon wishlist box. In order to simplify this page remove 'CSV Price Check Round-Trip' and 'Option B — Saved Amazon HTML File'. The 'Compare with Amazon wishlist' box should always be open with no option to collapse it.

**Actions:**
- Removed the **CSV Price Check Round-Trip** card and its handlers (`#csv-scope`, `#btn-download-csv`, `#csv-dropzone`, `#csv-file-input`, `#btn-apply-csv`, and unused CSV imports) from `js/views/wishlist.js` while leaving `js/csv.js` intact for full library CSV export in Settings.
- Removed **Option B — Saved Amazon HTML File** (`#amz-html-input`) and converted `<details id="amazon-compare-details">` into an always-open `<section class="card">` featuring a full-width **1-Click Bookmarklet** instruction box, paste textarea, and comparison results.

---

### 2026-11-27 15:43:43 UTC — Fixing Hierarchical Ordering in Series Dropdowns

**Prompt:**
> The series dropdown lists is not working correctly. On the book list page, when I click to search on series all sub-series for all the series appear at the end of the list under Wodehouse. They should appear under their main series (e.g. Sherlock Holmes > The Adventures of Sherlock Holmes).
>
> The same issue occurs in the Edit book series box.

**Actions:**
- Added `getOrderedSeriesOptions(seriesList)` in `js/utils.js` to sort top-level series alphabetically with each parent's sorted sub-series placed directly underneath and formatted as `Parent > Sub-series` (with orphan and cycle protection).
- Updated `#filter-series` in `js/views/books.js` (plus multi-level descendant filtering in `getSeriesAndDescendantIds`) and `#f-series` in `js/views/bookModal.js` to render using `getOrderedSeriesOptions`, and sorted top-level/child series lists alphabetically in `js/views/seriesModal.js` and `js/views/series.js`.

---

### 2026-11-27 16:25:14 UTC — Reorganizing Series Under Author Parent Series

**Prompt:**
> I am looking at the series and want to make these more manageable. I want them to behave in the same way as the Wodehouse series work.
>
> Create the following new top level Series:
> 1. Stephenson
> 2. Lyall
> 3. Doctorow
> 4. Banks
>
> For each of these create sub-series and move the books with the current top level series of that name as follows:
>
> Stephenson:
> 1. Bomb Light
> 2. D.O.D.O.
> 3. Forewold Saga
> 4. The Baroque Cycle
> 5. Deighton
>
> Lyall:
> 1. Honour
> 2. Major Harry Maxim
>
> Doctorow:
> 1. Little Brother
> 2. Martin Hench
>
> Banks:
> 1. Non fiction
> 2. SF Culture
> 3. SF Other
>
> Deighton:
> 1. Palmer
> 2. Sampson

**Actions:**
- Created 5 top-level parent series in `Data/booklist-data/library.json` (`Banks`, `Deighton` as its own top-level parent rather than nested under `Stephenson`, `Doctorow`, `Lyall`, and `Stephenson`) and re-parented all 13 corresponding existing series in place via `parent_series_id` (keeping `Foreworld Saga` spelling and preserving all book links).
- Updated local backups (`Data/library.json`, `Data/booklist_backup.csv`) and verified data integrity (`726` books, `60` series) plus `renderSeries` / `getOrderedSeriesOptions` rendering in `jsc`.

---

### 2026-11-27 16:55:05 UTC — Adding "No Unread on Main Book List" Filter on Series Page

**Prompt:**
> On the series page, add an option on the Filter drop down list for any series that don't have any unread books on the main book list.

**Actions:**
- Added `<option value="no_unread_main">No Unread on Main Book List</option>` to `#series-filter` in `js/views/series.js` along with `isUnreadBook`, `hasNoUnreadOnMainBookList`, and recursive `matchesFilter` logic so parent and leaf series with remaining unread/backlog books but none active on the main Book List are filtered cleanly (showing `X of Y sub-series` counts on filtered parent cards and excluding completed/abandoned series).
- Fixed a test-mock re-render loop during verification and confirmed all assertions pass in `jsc` against `library.json`.

---

### 2026-11-27 17:31:43 UTC — Replacing Sherlock Holmes Short Stories with Collections & Removing Sherlock Series

**Prompt:**
> The Sherlock Holmes books are messing up my book list because they are all short stories. 
>
> Delete all the books in the following sub-series of Sherlock Holmes:
> 1. The Adventures of Sherlock Holmes
> 2. His Last Bow
> 3. The Case-Book of Sherlock Holmes
> 4. The Memoirs of Sherlock Holmes
> 5. The Return of Sherlock Holmes
>
> Create the following new books. They are not in any series and they are all owned.
> 1. The Adventures of Sherlock Holmes (published 1892)
> 2. His Last Bow (published 1917)
> 3. The Case-Book of Sherlock Holmes (published 1927)
> 4. The Memoirs of Sherlock Holmes (published 1894)
> 5. The Return of Sherlock Holmes (published 1905)
>
> Remove the following books from the Novel sub-series so that they have no series:
> 1. A Study in Scarlet (published 1887)
> 2. The Hound of the Baskervilles (published 1902)
> 3. The Sign of Four (published 1890)
> 3. The Valley of Fear (published 1915)
>
> Delete the Sherlock Holmes series and all its sub-series.

**Actions:**
- Deleted the `56` individual short-story entries across the 5 short-story sub-series in `Data/booklist-data/library.json` (preserving `bk_0414` *SHERLOCK HOLMES - Complete Collection*).
- Created the 5 owned standalone short-story collection books (`Sir Arthur Conan Doyle`, `list_scope: "library"`, `status: "unread"`, `series_id: null`), cleared `series_id` and `series_order` on the 4 novels (*A Study in Scarlet*, *The Sign of the Four*, *The Hound of the Baskervilles*, *The Valley of Fear*), and deleted the `Sherlock Holmes` series and all 6 sub-series (`675` books, `53` series).
- Refreshed `Data/library.json` and `Data/booklist_backup.csv` and verified integrity and `renderSeries` in `jsc`.

---

## 2026-11-28

### 2026-11-28 11:49:00 UTC — Keeping Series Books Off Main Book List Until Added & Adding Remove Controls

**Prompt:**
> Books that are in a series or sub-series should only appear in the book list if:
> 1. They are marked as read
> 2. I have added them using the add button
> The series list of books is intended for books that I want to be able to see on the series tab but that I may never buy or read and I don’t want in the main book list even if I own them. When I add a book from the series list to the book list that means that I intend to read that book at some time so I want it to appear in the main book list. 
>
> Change the app:
> 1. Do not show books that are part of a series or sub-series in the book list unless I add them to the book list. This includes books that I own.
> 2. Provide functionality that allows me to remove a series book from the book list.

**Actions:**
- **`js/store.js`:** Updated `markOwned(id)` so marking a series book owned keeps its `list_scope` unchanged, defaulted newly created non-read series books in `saveBook` to `series_backlog` (while forcing `read` or standalone books to `library`), and added `removeFromLibrary(id)` to move non-read series books back to `series_backlog`.
- **`js/views/books.js` & `js/views/series.js`:** Kept `read` books visible regardless of scope while hiding non-read `series_backlog` books unless *Include Series Backlog* is checked; added a **Remove** button on non-read series books in both **Book List** and **Series** (alongside a **Book List** badge in Series and **Add** on backlog items).
- **`js/views/bookModal.js`, `js/views/wishlist.js`, & `scripts/bulk_update.py`:** Relabeled scope to *Series Only (Not on Book List)* with smart series/read scope defaults, prevented owned `series_backlog` items from showing a wishlist **Add** button, and kept bulk-imported owned series books in `series_backlog`.
- **Data update (`library.json`):** Migrated `19` existing owned `unread` series books from `library` to `series_backlog` (leaving `read`, `reading`, `up_next`, `abandoned`, and unowned wishlist books untouched), refreshed `Data/library.json` and `Data/booklist_backup.csv`, and verified all rules in Python and `jsc`.

---

### 2026-11-28 12:28:35 UTC — Creating Development Change Log (`change_log.md`)

**Prompt:**
> I want to keep track of the development of this app. Create a markup document that includes:
> 1. Date and time
> 2. My prompt
> 3. A summary of your actions
> Do not include git push / commits. Store this document in the root folder. Name it change_log.md.

**Actions:**
- Compiled the chronological development history from the workspace session logs into `change_log.md` in the repository root, recording UTC timestamps, prompts, and concise summaries of app and data changes while excluding git commit/push requests and operations.
