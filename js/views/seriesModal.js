import { store } from '../store.js';
import { esc, normText, statusLabel } from '../utils.js';

function showModal(html, bindFn) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = html;
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

  bindFn(modalRoot, close);
}

export function openCreateSeriesModal(onCreated, toast = () => {}) {
  const topSeries = store.data.series.filter((s) => !s.parent_series_id);

  const html = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="series-modal-title">
      <div class="modal-header">
        <h2 id="series-modal-title">Create New Series</h2>
        <button id="modal-close" class="btn btn-ghost btn-sm" type="button" aria-label="Close">✕</button>
      </div>
      <form id="create-series-form">
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-field span-2">
              <label class="form-label" for="s-name">Series Name *</label>
              <input id="s-name" class="input" required placeholder="e.g. Rivers of London" />
            </div>
            <div class="form-field">
              <label class="form-label" for="s-author">Default Author (optional)</label>
              <input id="s-author" class="input" placeholder="e.g. Ben Aaronovitch" />
            </div>
            <div class="form-field">
              <label class="form-label" for="s-parent">Parent Series (optional)</label>
              <select id="s-parent" class="select">
                <option value="">— None (Top-level Series) —</option>
                ${topSeries.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <div></div>
          <div style="display:flex;gap:0.5rem">
            <button id="btn-cancel-modal" class="btn" type="button">Cancel</button>
            <button class="btn btn-primary" type="submit">Create Series</button>
          </div>
        </div>
      </form>
    </div>
  `;

  showModal(html, (modalRoot, close) => {
    modalRoot.querySelector('#s-name')?.focus();
    modalRoot.querySelector('#create-series-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = modalRoot.querySelector('#s-name').value.trim();
      const authorDefault = modalRoot.querySelector('#s-author').value.trim() || null;
      const parentSeriesId = modalRoot.querySelector('#s-parent').value || null;
      try {
        const created = store.createSeries({ name, parentSeriesId, authorDefault });
        close();
        toast(`Created series "${created.name}"`, 'ok');
        onCreated?.(created);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

export function openAttachBooksModal(seriesId, onAttached, toast = () => {}) {
  const seriesMap = store.getSeriesMap();
  const seriesObj = seriesMap.get(seriesId);
  if (!seriesObj) return;

  const existingInSeries = store.data.books.filter((b) => b.series_id === seriesId);
  let nextOrder = existingInSeries.reduce((m, b) => Math.max(m, Number(b.series_order) || 0), 0) + 1;

  // Candidate books = books not already in this series
  const candidates = store.data.books
    .filter((b) => b.series_id !== seriesId)
    .sort((a, b) => a.title.localeCompare(b.title));

  // Map<bookId, orderNum>
  const selected = new Map();
  let query = seriesObj.author_default || '';

  const html = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="attach-modal-title">
      <div class="modal-header">
        <h2 id="attach-modal-title">Add Existing Books to "${esc(seriesObj.name)}"</h2>
        <button id="modal-close" class="btn btn-ghost btn-sm" type="button" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        <div class="filters-bar" style="margin-bottom:0.65rem">
          <input id="attach-search" class="input search-input" type="search" placeholder="Search title or author…" value="${esc(query)}" />
          <span id="attach-count" class="muted" style="font-size:0.85rem">0 selected</span>
        </div>
        <div id="attach-list" class="table-wrap" style="max-height:52vh;overflow-y:auto"></div>
      </div>
      <div class="modal-footer">
        <div class="muted" style="font-size:0.82rem">Order numbers auto-fill starting at #${nextOrder} as you check books.</div>
        <div style="display:flex;gap:0.5rem">
          <button id="btn-cancel-modal" class="btn" type="button">Cancel</button>
          <button id="btn-attach-save" class="btn btn-primary" type="button" disabled>Add Selected Books</button>
        </div>
      </div>
    </div>
  `;

  showModal(html, (modalRoot, close) => {
    const listEl = modalRoot.querySelector('#attach-list');
    const searchEl = modalRoot.querySelector('#attach-search');
    const countEl = modalRoot.querySelector('#attach-count');
    const saveBtn = modalRoot.querySelector('#btn-attach-save');

    const updateSelectionUi = () => {
      const n = selected.size;
      countEl.textContent = `${n} selected`;
      saveBtn.disabled = n === 0;
      saveBtn.textContent = n ? `Add ${n} Selected Book${n === 1 ? '' : 's'}` : 'Add Selected Books';
    };

    const renderRows = () => {
      const q = normText(query);
      const matches = (q
        ? candidates.filter((b) => normText(`${b.title} ${b.author}`).includes(q))
        : candidates
      ).slice(0, 120);

      listEl.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Add</th>
              <th>Title</th>
              <th>Author</th>
              <th>Current Series</th>
              <th style="width:86px">Order #</th>
            </tr>
          </thead>
          <tbody>
            ${
              matches.length
                ? matches
                    .map((b) => {
                      const isChecked = selected.has(b.id);
                      const orderVal = isChecked ? selected.get(b.id) : '';
                      const curSeries = b.series_id ? seriesMap.get(b.series_id)?.name : null;
                      return `<tr>
                        <td><input type="checkbox" data-pick-book="${esc(b.id)}" ${isChecked ? 'checked' : ''} /></td>
                        <td><strong>${esc(b.title)}</strong></td>
                        <td>${esc(b.author)}</td>
                        <td>${curSeries ? `<span class="badge badge-warn">${esc(curSeries)} #${b.series_order ?? '?'}</span>` : '<span class="muted">—</span>'}</td>
                        <td><input class="input" style="width:70px;padding:0.2rem 0.35rem" type="number" step="0.5" min="0" data-order-book="${esc(b.id)}" value="${esc(orderVal)}" ${isChecked ? '' : 'disabled'} /></td>
                      </tr>`;
                    })
                    .join('')
                : `<tr><td colspan="5" class="muted" style="text-align:center;padding:1rem">No matching books found.</td></tr>`
            }
          </tbody>
        </table>
      `;
    };

    renderRows();
    updateSelectionUi();
    searchEl?.focus();

    searchEl?.addEventListener('input', (e) => {
      query = e.target.value;
      renderRows();
    });

    listEl.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-pick-book]');
      if (cb) {
        const bid = cb.dataset.pickBook;
        if (cb.checked) {
          selected.set(bid, nextOrder);
          nextOrder += 1;
        } else {
          selected.delete(bid);
        }
        renderRows();
        updateSelectionUi();
        return;
      }
      const ord = e.target.closest('[data-order-book]');
      if (ord) {
        const bid = ord.dataset.orderBook;
        const val = ord.value.trim();
        selected.set(bid, val === '' ? null : Number(val));
      }
    });

    saveBtn.addEventListener('click', () => {
      const assignments = [...selected.entries()].map(([bookId, seriesOrder]) => ({
        bookId,
        seriesOrder: seriesOrder === '' || Number.isNaN(seriesOrder) ? null : seriesOrder,
      }));
      const count = store.attachBooksToSeries(seriesId, assignments);
      close();
      toast(`Added ${count} book${count === 1 ? '' : 's'} to "${seriesObj.name}"`, 'ok');
      onAttached?.();
    });
  });
}

export function openDeleteSeriesModal(seriesId, onDeleted, toast = () => {}) {
  const seriesMap = store.getSeriesMap();
  const seriesObj = seriesMap.get(seriesId);
  if (!seriesObj) return;

  const targetIds = new Set([seriesId]);
  let added = true;
  while (added) {
    added = false;
    for (const s of store.data.series) {
      if (s.parent_series_id && targetIds.has(s.parent_series_id) && !targetIds.has(s.id)) {
        targetIds.add(s.id);
        added = true;
      }
    }
  }

  const childSeries = store.data.series
    .filter((s) => s.id !== seriesId && targetIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const seriesBooks = store.data.books
    .filter((b) => b.series_id && targetIds.has(b.series_id))
    .sort((a, b) => {
      if (childSeries.length) {
        const sa = seriesMap.get(a.series_id)?.name || '';
        const sb = seriesMap.get(b.series_id)?.name || '';
        const scmp = sa.localeCompare(sb);
        if (scmp !== 0) return scmp;
      }
      return (a.series_order ?? 9999) - (b.series_order ?? 9999) || a.title.localeCompare(b.title);
    });

  // All books in the series are selected for deletion by default; user unchecks books to keep.
  const selectedToDelete = new Set(seriesBooks.map((b) => b.id));

  const html = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-series-title">
      <div class="modal-header">
        <h2 id="delete-series-title">Delete Series "${esc(seriesObj.name)}"</h2>
        <button id="modal-close" class="btn btn-ghost btn-sm" type="button" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        ${
          childSeries.length
            ? `<div style="margin-bottom:0.8rem;padding:0.65rem 0.85rem;border:1px solid var(--danger);border-radius:8px;background:var(--danger-soft);color:var(--danger);font-size:0.88rem">
                <strong>Warning:</strong> Deleting <strong>${esc(seriesObj.name)}</strong> will also delete ${childSeries.length} sub-series:
                ${childSeries.map((c) => esc(c.name)).join(', ')}.
              </div>`
            : ''
        }

        ${
          seriesBooks.length
            ? `<p style="margin-top:0;font-size:0.9rem">
                Select the books to <strong>delete</strong> from your Book List. Any unselected books will be <strong>kept</strong> with their series tag removed.
              </p>
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.6rem">
                <div style="display:flex;gap:0.4rem">
                  <button id="btn-del-select-all" class="btn btn-xs" type="button">Select All</button>
                  <button id="btn-del-unselect-all" class="btn btn-xs" type="button">Unselect All</button>
                </div>
                <div id="del-series-summary" class="muted" style="font-size:0.85rem"></div>
              </div>
              <div id="del-series-list" class="table-wrap" style="max-height:48vh;overflow-y:auto">
                <table>
                  <thead>
                    <tr>
                      <th>Delete</th>
                      ${childSeries.length ? '<th>Sub-Series</th>' : ''}
                      <th>#</th>
                      <th>Title &amp; Author</th>
                      <th>Owned</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${seriesBooks
                      .map((b) => {
                        const sName = seriesMap.get(b.series_id)?.name || '';
                        return `<tr>
                          <td><input type="checkbox" data-del-book="${esc(b.id)}" checked /></td>
                          ${childSeries.length ? `<td class="muted" style="font-size:0.82rem">${esc(sName)}</td>` : ''}
                          <td class="mono">${b.series_order ?? '—'}</td>
                          <td>
                            <strong>${esc(b.title)}</strong>
                            <div class="muted" style="font-size:0.8rem">${esc(b.author)}</div>
                          </td>
                          <td>${b.ownership === 'owned' ? '<span class="badge badge-owned">Owned</span>' : '<span class="badge badge-wishlist">Wishlist</span>'}</td>
                          <td><span class="badge badge-${esc(b.status)}">${esc(statusLabel(b.status))}</span></td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : `<p class="muted" style="margin:0">This ${childSeries.length ? 'series and its sub-series contain' : 'series contains'} no books.</p>`
        }
      </div>
      <div class="modal-footer">
        <div class="muted" style="font-size:0.82rem">Unchecked books stay in your main Book List.</div>
        <div style="display:flex;gap:0.5rem">
          <button id="btn-cancel-modal" class="btn" type="button">Cancel</button>
          <button id="btn-confirm-del-series" class="btn btn-danger" type="button"></button>
        </div>
      </div>
    </div>
  `;

  showModal(html, (modalRoot, close) => {
    const summaryEl = modalRoot.querySelector('#del-series-summary');
    const confirmBtn = modalRoot.querySelector('#btn-confirm-del-series');
    const listEl = modalRoot.querySelector('#del-series-list');

    const updateUi = () => {
      const delCount = selectedToDelete.size;
      const keepCount = seriesBooks.length - delCount;
      if (summaryEl) {
        summaryEl.textContent = `${delCount} selected to delete · ${keepCount} will be kept with series tag removed`;
      }
      if (seriesBooks.length === 0) {
        confirmBtn.textContent = childSeries.length ? 'Delete Series & Sub-Series' : 'Delete Series';
      } else if (delCount === 0) {
        confirmBtn.textContent = 'Delete Series (Keep All Books)';
      } else {
        confirmBtn.textContent = `Delete Series & ${delCount} Book${delCount === 1 ? '' : 's'}`;
      }
    };

    const syncCheckboxes = () => {
      modalRoot.querySelectorAll('[data-del-book]').forEach((cb) => {
        cb.checked = selectedToDelete.has(cb.dataset.delBook);
      });
      updateUi();
    };

    updateUi();

    listEl?.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-del-book]');
      if (!cb) return;
      if (cb.checked) selectedToDelete.add(cb.dataset.delBook);
      else selectedToDelete.delete(cb.dataset.delBook);
      updateUi();
    });

    modalRoot.querySelector('#btn-del-select-all')?.addEventListener('click', () => {
      seriesBooks.forEach((b) => selectedToDelete.add(b.id));
      syncCheckboxes();
    });

    modalRoot.querySelector('#btn-del-unselect-all')?.addEventListener('click', () => {
      selectedToDelete.clear();
      syncCheckboxes();
    });

    confirmBtn.addEventListener('click', () => {
      const res = store.deleteSeries(seriesId, [...selectedToDelete]);
      close();
      const parts = [`Deleted "${seriesObj.name}"`];
      if (res.deletedSeriesCount > 1) parts.push(`(+${res.deletedSeriesCount - 1} sub-series)`);
      if (res.deletedBooksCount > 0) parts.push(`${res.deletedBooksCount} book${res.deletedBooksCount === 1 ? '' : 's'} removed`);
      if (res.keptBooksCount > 0) parts.push(`${res.keptBooksCount} kept without series tag`);
      toast(parts.join(' · '), 'ok');
      onDeleted?.(res);
    });
  });
}
