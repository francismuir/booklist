import { store } from '../store.js';
import { amazonUrl, esc, formatPrice, statusLabel } from '../utils.js';
import { openAttachBooksModal, openCreateSeriesModal, openDeleteSeriesModal } from './seriesModal.js';

const expandedSeries = new Set();
let seriesQuery = '';
let seriesFilter = 'all'; // 'all' | 'in_progress' | 'to_buy'

function seriesStats(books) {
  const total = books.length;
  const read = books.filter((b) => b.status === 'read').length;
  const owned = books.filter((b) => b.ownership === 'owned').length;
  const sorted = [...books].sort((a, b) => (a.series_order ?? 9999) - (b.series_order ?? 9999));
  const nextBook = sorted.find((b) => b.status !== 'read' && b.status !== 'abandoned') || null;
  const pct = total ? Math.round((read / total) * 100) : 0;
  return { total, read, owned, sorted, nextBook, pct };
}

function renderSeriesTable(books, seriesObj) {
  const { sorted, nextBook } = seriesStats(books);
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem">
      <div style="font-size:0.86rem">
        ${
          !books.length
            ? `<span class="muted">No books in this series yet.</span>`
            : nextBook
              ? `Next up: <strong>#${nextBook.series_order ?? '?'} ${esc(nextBook.title)}</strong> (${nextBook.ownership === 'owned' ? 'Owned' : 'Not owned'})`
              : `<span style="color:var(--ok);font-weight:600">All books in series read!</span>`
        }
      </div>
      <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
        <button class="btn btn-xs" data-attach-to-series="${esc(seriesObj.id)}" type="button">+ Add Existing Books</button>
        <button class="btn btn-primary btn-xs" data-add-to-series="${esc(seriesObj.id)}" type="button">+ Add New Book</button>
        <button class="btn btn-danger btn-xs" data-delete-series="${esc(seriesObj.id)}" type="button">Delete Series</button>
      </div>
    </div>
    ${
      sorted.length
        ? `<div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>Author</th>
                  <th class="num">Pub</th>
                  <th>Owned</th>
                  <th>Status</th>
                  <th class="num">Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${sorted
                  .map((b) => {
                    const isNext = nextBook && nextBook.id === b.id;
                    const amz = amazonUrl(b);
                    return `<tr>
                      <td class="mono">${b.series_order ?? '—'}</td>
                      <td>
                        <strong>${esc(b.title)}</strong>
                        ${isNext ? `<span class="badge badge-up_next" style="margin-left:0.35rem">Next</span>` : ''}
                        ${b.list_scope === 'series_backlog' ? `<span class="badge badge-unread" style="margin-left:0.25rem">Backlog</span>` : ''}
                      </td>
                      <td>${esc(b.author)}</td>
                      <td class="num">${b.pub_year ?? '—'}</td>
                      <td>${b.ownership === 'owned' ? '<span class="badge badge-owned">Owned</span>' : '<span class="badge badge-wishlist">Wishlist</span>'}</td>
                      <td><span class="badge badge-${esc(b.status)}">${esc(statusLabel(b.status))}</span></td>
                      <td class="num">${formatPrice(b.current_price)}</td>
                      <td style="white-space:nowrap">
                        ${
                          b.ownership === 'owned'
                            ? `<button class="btn btn-xs btn-owned-done" type="button" disabled title="Already owned">Owned</button>`
                            : `<button class="btn btn-xs" type="button" data-action="owned" data-id="${esc(b.id)}" title="Mark as owned">Owned</button>`
                        }
                        ${b.status !== 'read' ? `<button class="btn btn-ok btn-xs" data-action="finish" data-id="${esc(b.id)}">Read</button>` : ''}
                        ${b.status === 'unread' ? `<button class="btn btn-xs" data-action="start" data-id="${esc(b.id)}">Reading</button>` : ''}
                        ${b.list_scope === 'series_backlog' ? `<button class="btn btn-xs" data-action="promote" data-id="${esc(b.id)}" title="Add to main Book List">Add</button>` : ''}
                        ${amz ? `<a class="btn btn-xs" href="${esc(amz)}" target="_blank" rel="noopener">Kindle ↗</a>` : ''}
                        <button class="btn btn-ghost btn-xs" data-action="edit" data-id="${esc(b.id)}">Edit</button>
                      </td>
                    </tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>`
        : ''
    }
  `;
}

export function renderSeries(container, ctx) {
  const allSeries = store.data.series;
  const books = store.data.books;

  const bySeries = new Map(allSeries.map((s) => [s.id, []]));
  for (const b of books) {
    if (b.series_id && bySeries.has(b.series_id)) {
      bySeries.get(b.series_id).push(b);
    }
  }

  const childrenMap = new Map();
  for (const s of allSeries) {
    if (s.parent_series_id) {
      if (!childrenMap.has(s.parent_series_id)) childrenMap.set(s.parent_series_id, []);
      childrenMap.get(s.parent_series_id).push(s);
    }
  }

  const topSeries = allSeries
    .filter((s) => !s.parent_series_id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const q = seriesQuery.trim().toLowerCase();

  const renderCard = (s) => {
    const children = childrenMap.get(s.id) || [];
    const ownBooks = bySeries.get(s.id) || [];
    const aggregateBooks = [...ownBooks, ...children.flatMap((c) => bySeries.get(c.id) || [])];

    const stats = seriesStats(aggregateBooks);
    if (seriesFilter === 'in_progress' && (stats.total === 0 || stats.read === stats.total)) return '';
    if (seriesFilter === 'to_buy' && (stats.total === 0 || stats.owned === stats.total)) return '';

    if (q) {
      const hay = `${s.name} ${s.author_default || ''} ${aggregateBooks.map((b) => `${b.title} ${b.author}`).join(' ')} ${children.map((c) => c.name).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return '';
    }

    const isOpen = expandedSeries.has(s.id);
    const authorLabel = s.author_default || aggregateBooks[0]?.author || '';

    return `
      <div class="series-card" data-series-card="${esc(s.id)}">
        <button class="series-header" type="button" data-toggle-series="${esc(s.id)}">
          <div>
            <div style="font-weight:700;font-size:1.02rem">
              ${isOpen ? '▾' : '▸'} ${esc(s.name)}
              ${children.length ? `<span class="badge badge-unread" style="margin-left:0.35rem">${children.length} sub-series</span>` : ''}
            </div>
            <div class="muted" style="font-size:0.84rem">
              ${esc(authorLabel)}${stats.nextBook && !children.length ? ` · Next: #${stats.nextBook.series_order ?? '?'} ${esc(stats.nextBook.title)}` : !stats.total && !children.length ? ' · Empty series' : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:0.75rem">
            <div style="text-align:right;font-size:0.82rem">
              <div><strong>${stats.read}/${stats.total}</strong> read</div>
              <div class="muted">${stats.owned}/${stats.total} owned</div>
            </div>
            <div class="progress-track" title="${stats.pct}% read">
              <div class="progress-fill" style="width:${stats.pct}%"></div>
            </div>
          </div>
        </button>
        ${
          isOpen
            ? `<div class="series-body">
                ${ownBooks.length || !children.length ? renderSeriesTable(ownBooks, s) : ''}
                ${
                  children.length && !ownBooks.length
                    ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem">
                        <div class="muted" style="font-size:0.86rem">${children.length} sub-series in ${esc(s.name)}</div>
                        <button class="btn btn-danger btn-xs" data-delete-series="${esc(s.id)}" type="button">Delete Series (+ ${children.length} Sub-Series)</button>
                      </div>`
                    : ''
                }
                ${
                  children.length
                    ? `<div class="subseries-indent">
                        ${children.map((c) => renderCard(c)).join('')}
                      </div>`
                    : ''
                }
              </div>`
            : ''
        }
      </div>
    `;
  };

  const cardsHtml = topSeries.map((s) => renderCard(s)).filter(Boolean).join('');

  container.innerHTML = `<div class="view-root">
    <div class="page-header">
      <div>
        <h1 class="page-title">Series Tracker</h1>
        <p class="page-subtitle">Unified with your Book List — marking a book owned or read updates both views automatically.</p>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button id="btn-new-series" class="btn btn-primary btn-sm" type="button">+ New Series</button>
        <button id="btn-expand-all" class="btn btn-sm" type="button">Expand All</button>
        <button id="btn-collapse-all" class="btn btn-sm" type="button">Collapse All</button>
      </div>
    </div>

    <div class="filters-bar">
      <input id="series-search" class="input search-input" type="search" placeholder="Filter by series, author, or book title…" value="${esc(seriesQuery)}" />
      <select id="series-filter" class="select">
        <option value="all" ${seriesFilter === 'all' ? 'selected' : ''}>All Series</option>
        <option value="in_progress" ${seriesFilter === 'in_progress' ? 'selected' : ''}>Incomplete (Unread remaining)</option>
        <option value="to_buy" ${seriesFilter === 'to_buy' ? 'selected' : ''}>Has Unowned Books</option>
      </select>
    </div>

    <div class="series-stack">
      ${cardsHtml || `<div class="card muted">No series match your filter.</div>`}
    </div>
  </div>`;

  const root = container.firstElementChild;

  root.querySelector('#series-search')?.addEventListener('input', (e) => {
    seriesQuery = e.target.value;
    renderSeries(container, ctx);
    const inp = container.querySelector('#series-search');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  });

  root.querySelector('#series-filter')?.addEventListener('change', (e) => {
    seriesFilter = e.target.value;
    renderSeries(container, ctx);
  });

  root.querySelector('#btn-new-series')?.addEventListener('click', () => {
    openCreateSeriesModal((created) => {
      expandedSeries.add(created.id);
      if (created.parent_series_id) expandedSeries.add(created.parent_series_id);
      renderSeries(container, ctx);
    }, ctx.toast);
  });

  root.querySelector('#btn-expand-all')?.addEventListener('click', () => {
    allSeries.forEach((s) => expandedSeries.add(s.id));
    renderSeries(container, ctx);
  });
  root.querySelector('#btn-collapse-all')?.addEventListener('click', () => {
    expandedSeries.clear();
    renderSeries(container, ctx);
  });

  root.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-series]');
    if (toggle) {
      const sid = toggle.dataset.toggleSeries;
      if (expandedSeries.has(sid)) expandedSeries.delete(sid);
      else expandedSeries.add(sid);
      renderSeries(container, ctx);
      return;
    }

    const attachBtn = e.target.closest('[data-attach-to-series]');
    if (attachBtn) {
      const sid = attachBtn.dataset.attachToSeries;
      openAttachBooksModal(sid, () => renderSeries(container, ctx), ctx.toast);
      return;
    }

    const deleteBtn = e.target.closest('[data-delete-series]');
    if (deleteBtn) {
      const sid = deleteBtn.dataset.deleteSeries;
      openDeleteSeriesModal(
        sid,
        (res) => {
          res.deletedSeriesIds.forEach((id) => expandedSeries.delete(id));
          renderSeries(container, ctx);
        },
        ctx.toast
      );
      return;
    }

    const addBtn = e.target.closest('[data-add-to-series]');
    if (addBtn) {
      const sid = addBtn.dataset.addToSeries;
      const sObj = store.getSeriesMap().get(sid);
      const sBooks = books.filter((b) => b.series_id === sid);
      const maxOrder = sBooks.reduce((m, b) => Math.max(m, Number(b.series_order) || 0), 0);
      ctx.openBookModal(null, {
        series_id: sid,
        series_order: maxOrder + 1,
        author: sObj?.author_default || sBooks[0]?.author || '',
        list_scope: 'series_backlog',
      });
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const { action, id } = actionBtn.dataset;
    if (action === 'owned') {
      store.markOwned(id);
      ctx.toast('Marked as owned & added to Book List', 'ok');
    } else if (action === 'finish') {
      store.markRead(id);
      ctx.toast('Marked as read', 'ok');
    } else if (action === 'start') {
      store.startReading(id);
      ctx.toast('Marked as currently reading', 'ok');
    } else if (action === 'promote') {
      store.promoteToLibrary(id);
      ctx.toast('Added to Book List', 'ok');
    } else if (action === 'edit') {
      ctx.openBookModal(id);
    }
  });
}
