import { searchBookMetadata } from '../openlibrary.js';
import { store } from '../store.js';
import { amazonUrl, esc, formatDate, formatPrice, getOrderedSeriesOptions, parseAmazonInput, todayIso } from '../utils.js';

export function openBookModal(bookId = null, prefill = {}, onSaved = null, toast = () => {}) {
  const modalRoot = document.getElementById('modal-root');
  const existing = bookId ? store.getBook(bookId) : null;
  const book = existing
    ? structuredClone(existing)
    : {
        title: '',
        author: '',
        pub_year: '',
        is_factual: false,
        list_scope: 'library',
        ownership: 'not_owned',
        source: 'kindle',
        status: 'unread',
        date_read: '',
        reading_sessions: [],
        series_id: '',
        series_order: '',
        amazon_asin: '',
        amazon_legacy_code: '',
        current_price: '',
        target_price: '',
        category: '',
        recommended_by: '',
        lent_to: '',
        abandon_reason: '',
        notes: '',
        price_history: [],
        ...prefill,
      };

  const orderedSeries = getOrderedSeriesOptions(store.data.series);
  const amzInputVal = book.amazon_asin || (book.amazon_legacy_code ? `https://amzn.eu/${book.amazon_legacy_code}` : '');

  modalRoot.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">${existing ? 'Edit Book' : 'Add New Book'}</h2>
        <button id="modal-close" class="btn btn-ghost btn-sm" type="button" aria-label="Close">✕</button>
      </div>
      <form id="book-form">
        <div class="modal-body">
          ${
            !existing
              ? `<div style="margin-bottom:0.9rem;padding:0.75rem;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
                  <div class="form-label" style="margin-bottom:0.35rem">Quick Metadata Search (Open Library &amp; Google Books)</div>
                  <div style="display:flex;gap:0.45rem">
                    <input id="ol-query" class="input" style="flex:1" type="search" placeholder="Search by title or author to auto-fill…" />
                    <button id="btn-ol-search" class="btn btn-sm" type="button">Search</button>
                  </div>
                  <div id="ol-results" class="ol-results hidden"></div>
                </div>`
              : ''
          }

          <div class="form-grid">
            <div class="form-field span-2">
              <label class="form-label" for="f-title">Title *</label>
              <input id="f-title" class="input" required value="${esc(book.title)}" />
            </div>

            <div class="form-field">
              <label class="form-label" for="f-author">Author *</label>
              <input id="f-author" class="input" required value="${esc(book.author)}" />
            </div>

            <div class="form-field">
              <label class="form-label" for="f-pub-year">Publication Year</label>
              <input id="f-pub-year" class="input" type="number" min="1400" max="2100" placeholder="e.g. 2018" value="${esc(book.pub_year ?? '')}" />
            </div>

            <div class="form-field">
              <label class="form-label" for="f-status">Reading Status</label>
              <select id="f-status" class="select">
                <option value="unread" ${book.status === 'unread' ? 'selected' : ''}>Unread</option>
                <option value="up_next" ${book.status === 'up_next' ? 'selected' : ''}>Up Next</option>
                <option value="reading" ${book.status === 'reading' ? 'selected' : ''}>Currently Reading</option>
                <option value="read" ${book.status === 'read' ? 'selected' : ''}>Read</option>
                <option value="abandoned" ${book.status === 'abandoned' ? 'selected' : ''}>Abandoned</option>
              </select>
            </div>

            <div class="form-field">
              <label class="form-label" for="f-ownership">Ownership</label>
              <select id="f-ownership" class="select">
                <option value="owned" ${book.ownership === 'owned' ? 'selected' : ''}>Owned</option>
                <option value="not_owned" ${book.ownership === 'not_owned' ? 'selected' : ''}>Not Owned (Wishlist)</option>
                <option value="borrowed" ${book.ownership === 'borrowed' ? 'selected' : ''}>Borrowed</option>
              </select>
            </div>

            <div class="form-field">
              <label class="form-label" for="f-date-read">Date Read</label>
              <input id="f-date-read" class="input" type="date" value="${esc(book.date_read ?? '')}" />
            </div>

            <div class="form-field">
              <label class="form-label" for="f-source">Source / Format</label>
              <select id="f-source" class="select">
                <option value="kindle" ${book.source === 'kindle' ? 'selected' : ''}>Kindle</option>
                <option value="google_books" ${book.source === 'google_books' ? 'selected' : ''}>Google Books</option>
                <option value="humble_bundle" ${book.source === 'humble_bundle' ? 'selected' : ''}>Humble Bundle</option>
                <option value="physical" ${book.source === 'physical' ? 'selected' : ''}>Physical</option>
                <option value="other" ${book.source === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>

            <div class="form-field">
              <label class="form-label" for="f-series">Series</label>
              <select id="f-series" class="select">
                <option value="">— None —</option>
                ${orderedSeries
                  .map(
                    (opt) =>
                      `<option value="${esc(opt.id)}" ${book.series_id === opt.id ? 'selected' : ''}>${esc(opt.label)}</option>`
                  )
                  .join('')}
                <option value="__new__">+ Create New Series…</option>
              </select>
              <input id="f-new-series" class="input hidden" style="margin-top:0.35rem" placeholder="New series name" />
            </div>

            <div class="form-field">
              <label class="form-label" for="f-series-order">Series Order #</label>
              <input id="f-series-order" class="input" type="number" step="0.5" min="0" value="${esc(book.series_order ?? '')}" />
            </div>

            <div class="form-field span-2">
              <label class="form-label" for="f-amazon">Amazon UK URL, ASIN, or <code>amzn.eu</code> code</label>
              <div style="display:flex;gap:0.4rem">
                <input id="f-amazon" class="input mono" style="flex:1" placeholder="e.g. B00E2RG3U8 or https://www.amazon.co.uk/dp/B00E2RG3U8" value="${esc(amzInputVal)}" />
                ${amazonUrl(book) ? `<a class="btn btn-sm" href="${esc(amazonUrl(book))}" target="_blank" rel="noopener">Open ↗</a>` : ''}
              </div>
            </div>

            <div class="form-field">
              <label class="form-label" for="f-price">Current Price (£)</label>
              <input id="f-price" class="input" type="number" step="0.01" min="0" placeholder="e.g. 4.99" value="${esc(book.current_price ?? '')}" />
            </div>

            <div class="form-field">
              <label class="form-label" for="f-target-price">Target Deal Price (£)</label>
              <input id="f-target-price" class="input" type="number" step="0.01" min="0" placeholder="e.g. 2.99" value="${esc(book.target_price ?? '')}" />
            </div>

            <div class="form-field">
              <label class="form-label" for="f-scope">Visibility Scope</label>
              <select id="f-scope" class="select">
                <option value="library" ${book.list_scope === 'library' ? 'selected' : ''}>Main Book List</option>
                <option value="series_backlog" ${book.list_scope === 'series_backlog' ? 'selected' : ''}>Series Only (Not on Book List)</option>
              </select>
            </div>

            <div class="form-field">
              <label class="form-label" for="f-category">Category</label>
              <input id="f-category" class="input" list="category-suggestions" placeholder="e.g. READ AGAIN, OTHER" value="${esc(book.category ?? '')}" />
              <datalist id="category-suggestions">
                <option value="READ AGAIN"></option>
                <option value="OTHER"></option>
              </datalist>
            </div>

            <div class="form-field">
              <label class="form-label" for="f-rec">Recommended By</label>
              <input id="f-rec" class="input" value="${esc(book.recommended_by ?? '')}" />
            </div>

            <div class="form-field">
              <label class="form-label" for="f-lent">Lent To</label>
              <input id="f-lent" class="input" value="${esc(book.lent_to ?? '')}" />
            </div>

            <div class="form-field span-2">
              <label style="display:inline-flex;align-items:center;gap:0.45rem;font-weight:600;font-size:0.9rem">
                <input id="f-factual" type="checkbox" ${book.is_factual ? 'checked' : ''} />
                Factual / Non-fiction book
              </label>
            </div>

            <div class="form-field span-2">
              <label class="form-label" for="f-abandon-reason">Abandon Reason (optional)</label>
              <input id="f-abandon-reason" class="input" placeholder="e.g. Wrong mood — retry later" value="${esc(book.abandon_reason ?? '')}" />
            </div>

            <div class="form-field span-2">
              <label class="form-label" for="f-notes">Notes</label>
              <textarea id="f-notes" class="textarea" rows="2">${esc(book.notes ?? '')}</textarea>
            </div>
          </div>

          ${
            existing
              ? `<div style="margin-top:0.9rem;padding-top:0.75rem;border-top:1px solid var(--border)">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
                    <span class="form-label" style="margin:0">Reading Sessions (${(book.reading_sessions || []).length})</span>
                    <button id="btn-add-reread" class="btn btn-xs" type="button">+ Log Re-read Today</button>
                  </div>
                  <div id="sessions-list" style="font-size:0.84rem" class="muted">
                    ${
                      (book.reading_sessions || []).length
                        ? book.reading_sessions
                            .map((s) => `<div>• ${esc(s.outcome)} ${s.finished_at ? `on ${formatDate(s.finished_at)}` : s.started_at ? `started ${formatDate(s.started_at)}` : ''}</div>`)
                            .join('')
                        : 'No reading sessions logged.'
                    }
                  </div>
                  ${
                    (book.price_history || []).length
                      ? `<div class="form-label" style="margin-top:0.65rem">Price History</div>
                         <div class="muted" style="font-size:0.82rem">${book.price_history
                           .slice(-6)
                           .map((p) => `${formatPrice(p.price)} (${formatDate(p.checked_at)})`)
                           .join(' → ')}</div>`
                      : ''
                  }
                </div>`
              : ''
          }
        </div>
        <div class="modal-footer">
          <div>
            ${existing ? `<button id="btn-delete-book" class="btn btn-danger btn-sm" type="button">Delete</button>` : ''}
          </div>
          <div style="display:flex;gap:0.5rem">
            <button id="btn-cancel-modal" class="btn" type="button">Cancel</button>
            <button class="btn btn-primary" type="submit">${existing ? 'Save Changes' : 'Add Book'}</button>
          </div>
        </div>
      </form>
    </div>
  `;

  modalRoot.classList.remove('hidden');
  modalRoot.setAttribute('aria-hidden', 'false');

  const close = () => {
    modalRoot.classList.add('hidden');
    modalRoot.setAttribute('aria-hidden', 'true');
    modalRoot.innerHTML = '';
  };

  modalRoot.querySelector('#modal-close')?.addEventListener('click', close);
  modalRoot.querySelector('#btn-cancel-modal')?.addEventListener('click', close);
  modalRoot.addEventListener('click', (e) => {
    if (e.target === modalRoot) close();
  });

  // Series select -> show new series input & auto-adjust default visibility for new books
  const seriesSel = modalRoot.querySelector('#f-series');
  const newSeriesInp = modalRoot.querySelector('#f-new-series');
  const statusSel = modalRoot.querySelector('#f-status');
  const dateReadInp = modalRoot.querySelector('#f-date-read');
  const scopeSel = modalRoot.querySelector('#f-scope');
  let scopeTouched = false;
  scopeSel?.addEventListener('change', () => {
    scopeTouched = true;
  });

  seriesSel?.addEventListener('change', () => {
    if (seriesSel.value === '__new__') {
      newSeriesInp.classList.remove('hidden');
      newSeriesInp.focus();
    } else {
      newSeriesInp.classList.add('hidden');
    }
    if (!existing && !scopeTouched && scopeSel) {
      scopeSel.value = seriesSel.value !== '' && statusSel.value !== 'read' ? 'series_backlog' : 'library';
    }
  });

  // Status -> Read auto-populates today's date if blank and moves to Main Book List
  statusSel?.addEventListener('change', () => {
    if (statusSel.value === 'read') {
      if (!dateReadInp.value) dateReadInp.value = todayIso();
      if (scopeSel) scopeSel.value = 'library';
    }
  });

  // Open Library lookup
  const olBtn = modalRoot.querySelector('#btn-ol-search');
  const olQuery = modalRoot.querySelector('#ol-query');
  const olResults = modalRoot.querySelector('#ol-results');
  const runOlSearch = async () => {
    const q = olQuery.value.trim();
    if (!q) return;
    olBtn.disabled = true;
    olBtn.textContent = '…';
    const hits = await searchBookMetadata(q);
    olBtn.disabled = false;
    olBtn.textContent = 'Search';
    if (!hits.length) {
      olResults.innerHTML = `<div class="ol-item muted">No results found.</div>`;
    } else {
      olResults.innerHTML = hits
        .map(
          (h, idx) => `<div class="ol-item" data-ol-idx="${idx}">
            <span><strong>${esc(h.title)}</strong> — ${esc(h.author)}</span>
            <span class="muted">${h.pub_year ?? '—'}</span>
          </div>`
        )
        .join('');
      olResults.querySelectorAll('[data-ol-idx]').forEach((el) => {
        el.addEventListener('click', () => {
          const hit = hits[Number(el.dataset.olIdx)];
          modalRoot.querySelector('#f-title').value = hit.title;
          if (hit.author) modalRoot.querySelector('#f-author').value = hit.author;
          if (hit.pub_year) modalRoot.querySelector('#f-pub-year').value = hit.pub_year;
          olResults.classList.add('hidden');
        });
      });
    }
    olResults.classList.remove('hidden');
  };
  olBtn?.addEventListener('click', runOlSearch);
  olQuery?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runOlSearch();
    }
  });

  // Re-read button
  modalRoot.querySelector('#btn-add-reread')?.addEventListener('click', () => {
    const d = todayIso();
    book.reading_sessions = [...(book.reading_sessions || []), { started_at: null, finished_at: d, outcome: 'finished', note: 'Re-read' }];
    modalRoot.querySelector('#sessions-list').innerHTML = book.reading_sessions
      .map((s) => `<div>• ${esc(s.outcome)} ${s.finished_at ? `on ${formatDate(s.finished_at)}` : ''}</div>`)
      .join('');
    toast('Added re-read session (click Save Changes to persist)', 'ok');
  });

  // Delete
  modalRoot.querySelector('#btn-delete-book')?.addEventListener('click', () => {
    if (window.confirm(`Delete "${book.title}" from your library?`)) {
      store.deleteBook(existing.id);
      close();
      toast('Book deleted', 'ok');
      onSaved?.();
    }
  });

  // Submit
  modalRoot.querySelector('#book-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = modalRoot.querySelector('#f-title').value.trim();
    const author = modalRoot.querySelector('#f-author').value.trim();
    if (!title || !author) return;

    let seriesId = seriesSel.value || null;
    if (seriesId === '__new__') {
      const sName = newSeriesInp.value.trim();
      seriesId = sName ? store.ensureSeriesByName(sName, null, author).id : null;
    }

    const amzRaw = modalRoot.querySelector('#f-amazon').value.trim();
    const parsedAmz = parseAmazonInput(amzRaw);
    if (amzRaw && !parsedAmz.asin && !parsedAmz.legacy) {
      toast('Could not parse Amazon ID/URL — please check the format.', 'error');
      return;
    }

    const numOrNull = (val) => (val === '' || val === null ? null : Number(val));
    const pubYrRaw = modalRoot.querySelector('#f-pub-year').value.trim();
    const pubYear = pubYrRaw ? Number(pubYrRaw) : null;
    const priceRaw = modalRoot.querySelector('#f-price').value.trim();
    const targetRaw = modalRoot.querySelector('#f-target-price').value.trim();
    const sOrderRaw = modalRoot.querySelector('#f-series-order').value.trim();

    const payload = {
      title,
      author,
      pub_year: pubYear,
      ...(pubYear && (!existing || existing.pub_year !== pubYear)
        ? { pub_year_source: 'manual', pub_year_confidence: 'exact' }
        : {}),
      status: statusSel.value,
      ownership: modalRoot.querySelector('#f-ownership').value,
      date_read: dateReadInp.value || null,
      source: modalRoot.querySelector('#f-source').value,
      series_id: seriesId,
      series_order: numOrNull(sOrderRaw),
      amazon_asin: parsedAmz.asin,
      amazon_legacy_code: parsedAmz.legacy,
      current_price: priceRaw === '' ? null : Math.round(Number(priceRaw) * 100) / 100,
      target_price: targetRaw === '' ? null : Math.round(Number(targetRaw) * 100) / 100,
      list_scope: !seriesId || statusSel.value === 'read' ? 'library' : scopeSel.value,
      category: modalRoot.querySelector('#f-category').value.trim() || null,
      recommended_by: modalRoot.querySelector('#f-rec').value.trim() || null,
      lent_to: modalRoot.querySelector('#f-lent').value.trim() || null,
      is_factual: modalRoot.querySelector('#f-factual').checked,
      abandon_reason: modalRoot.querySelector('#f-abandon-reason').value.trim() || null,
      notes: modalRoot.querySelector('#f-notes').value.trim(),
      ...(existing ? { reading_sessions: book.reading_sessions } : {}),
    };

    store.saveBook(payload, existing ? existing.id : null);
    close();
    toast(existing ? 'Book updated' : 'Book added', 'ok');
    onSaved?.();
  });
}
