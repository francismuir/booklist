import { store } from '../store.js';
import {
  amazonUrl,
  authorSurname,
  debounce,
  esc,
  formatDate,
  formatPrice,
  getOrderedSeriesOptions,
  normText,
  sortableTitle,
  statusLabel,
} from '../utils.js';

const LS_IGNORE_ARTICLES_KEY = 'booklist_ignore_articles_v1';

function loadIgnoreArticles() {
  try {
    const val = localStorage.getItem(LS_IGNORE_ARTICLES_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

const DEFAULT_FILTERS = {
  q: '',
  status: 'all',
  ownership: 'all',
  type: 'all',
  seriesId: 'all',
  category: 'all',
  recommender: 'all',
  readYear: 'all',
  includeBacklog: false,
  sortBy: 'author',
  sortDir: 'asc',
  ignoreTitleArticles: loadIgnoreArticles(),
  limit: 150,
};

const filterState = { ...DEFAULT_FILTERS };

export function applyBooksRouteParams(params) {
  if (!params || !Object.keys(params).length) return;
  Object.assign(filterState, {
    ...DEFAULT_FILTERS,
    sortBy: filterState.sortBy,
    sortDir: filterState.sortDir,
    ignoreTitleArticles: filterState.ignoreTitleArticles,
  });
  if (params.status) filterState.status = params.status;
  if (params.ownership) filterState.ownership = params.ownership;
  if (params.type) filterState.type = params.type;
  if (params.q !== undefined) filterState.q = params.q;
  if (params.seriesId) filterState.seriesId = params.seriesId;
  if (params.recommender) filterState.recommender = params.recommender;
  if (params.readYear) filterState.readYear = params.readYear;
}

function getSeriesAndDescendantIds(seriesId, seriesList) {
  const ids = new Set([seriesId]);
  let added = true;
  while (added) {
    added = false;
    for (const s of seriesList) {
      if (s.parent_series_id && ids.has(s.parent_series_id) && !ids.has(s.id)) {
        ids.add(s.id);
        added = true;
      }
    }
  }
  return ids;
}

export function renderBooks(container, ctx) {
  const allBooks = store.data.books;
  const seriesList = store.data.series;
  const orderedSeries = getOrderedSeriesOptions(seriesList);
  const seriesMap = store.getSeriesMap();

  const recommenders = [...new Set(allBooks.map((b) => b.recommended_by).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const categories = [...new Set(allBooks.map((b) => b.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const readYears = [
    ...new Set(
      allBooks
        .map((b) => String(b.date_read || '').slice(0, 4))
        .filter((y) => /^\d{4}$/.test(y))
    ),
  ].sort((a, b) => b.localeCompare(a));

  const seriesFilterSet =
    filterState.seriesId !== 'all' ? getSeriesAndDescendantIds(filterState.seriesId, seriesList) : null;

  const qNorm = normText(filterState.q);

  const filtered = allBooks.filter((b) => {
    if (!filterState.includeBacklog && b.list_scope === 'series_backlog') return false;
    if (filterState.status !== 'all' && b.status !== filterState.status) return false;
    if (filterState.ownership !== 'all' && b.ownership !== filterState.ownership) return false;
    if (filterState.type === 'factual' && !b.is_factual) return false;
    if (filterState.type === 'fiction' && b.is_factual) return false;
    if (seriesFilterSet && !seriesFilterSet.has(b.series_id)) return false;
    if (filterState.category !== 'all' && b.category !== filterState.category) return false;
    if (filterState.recommender !== 'all' && b.recommended_by !== filterState.recommender) return false;
    if (filterState.readYear !== 'all' && !String(b.date_read || '').startsWith(filterState.readYear)) return false;
    if (qNorm) {
      const sName = b.series_id ? seriesMap.get(b.series_id)?.name || '' : '';
      const hay = normText(`${b.author} ${b.title} ${sName} ${b.notes || ''} ${b.recommended_by || ''}`);
      if (!hay.includes(qNorm)) return false;
    }
    return true;
  });

  const dir = filterState.sortDir === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    let cmp = 0;
    switch (filterState.sortBy) {
      case 'title': {
        const ta = sortableTitle(a.title, filterState.ignoreTitleArticles);
        const tb = sortableTitle(b.title, filterState.ignoreTitleArticles);
        cmp = ta.localeCompare(tb) || a.title.localeCompare(b.title);
        break;
      }
      case 'price': {
        const pa = a.current_price ?? (dir > 0 ? 999999 : -1);
        const pb = b.current_price ?? (dir > 0 ? 999999 : -1);
        cmp = pa - pb;
        break;
      }
      case 'pub_year': {
        const ya = a.pub_year ?? (dir > 0 ? 99999 : -1);
        const yb = b.pub_year ?? (dir > 0 ? 99999 : -1);
        cmp = ya - yb;
        break;
      }
      case 'date_read': {
        const da = a.date_read || '';
        const db = b.date_read || '';
        cmp = da.localeCompare(db);
        break;
      }
      case 'author':
      default: {
        const sa = authorSurname(a.author);
        const sb = authorSurname(b.author);
        cmp = sa.localeCompare(sb) || a.author.localeCompare(b.author) || a.title.localeCompare(b.title);
        break;
      }
    }
    return cmp * dir;
  });

  const visible = filtered.slice(0, filterState.limit);

  container.innerHTML = `<div class="view-root">
    <div class="page-header">
      <div>
        <h1 class="page-title">Book List</h1>
        <p class="page-subtitle">Showing ${visible.length} of ${filtered.length} matching books (${allBooks.length} total in database)</p>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button id="btn-reset-filters" class="btn btn-sm" type="button">Reset Filters</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:0.9rem">
      <div class="chip-row" id="status-chips">
        ${[
          ['all', 'All Statuses'],
          ['reading', 'Reading'],
          ['up_next', 'Up Next'],
          ['unread', 'Unread'],
          ['read', 'Read'],
          ['abandoned', 'Abandoned'],
        ]
          .map(
            ([val, label]) =>
              `<button class="chip ${filterState.status === val ? 'active' : ''}" data-status="${val}" type="button">${label}</button>`
          )
          .join('')}
      </div>

      <div class="filters-bar" style="margin-bottom:0">
        <input id="books-search" class="input search-input" type="search" placeholder="Search author, title, series, notes…" value="${esc(filterState.q)}" />

        <select id="filter-ownership" class="select">
          <option value="all" ${filterState.ownership === 'all' ? 'selected' : ''}>Owned: All</option>
          <option value="owned" ${filterState.ownership === 'owned' ? 'selected' : ''}>Owned</option>
          <option value="not_owned" ${filterState.ownership === 'not_owned' ? 'selected' : ''}>Not Owned</option>
        </select>

        <select id="filter-type" class="select">
          <option value="all" ${filterState.type === 'all' ? 'selected' : ''}>Factual &amp; Fiction</option>
          <option value="factual" ${filterState.type === 'factual' ? 'selected' : ''}>Factual Only</option>
          <option value="fiction" ${filterState.type === 'fiction' ? 'selected' : ''}>Fiction Only</option>
        </select>

        <select id="filter-series" class="select" style="max-width:280px">
          <option value="all">All Series</option>
          ${orderedSeries
            .map(
              (opt) =>
                `<option value="${esc(opt.id)}" ${filterState.seriesId === opt.id ? 'selected' : ''}>${esc(opt.label)}</option>`
            )
            .join('')}
        </select>

        <select id="filter-category" class="select">
          <option value="all">All Categories</option>
          ${categories.map((c) => `<option value="${esc(c)}" ${filterState.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>

        <select id="filter-recommender" class="select">
          <option value="all">All Recommenders</option>
          ${recommenders.map((r) => `<option value="${esc(r)}" ${filterState.recommender === r ? 'selected' : ''}>Rec: ${esc(r)}</option>`).join('')}
        </select>

        <select id="filter-readyear" class="select">
          <option value="all">Read Year: All</option>
          ${readYears.map((y) => `<option value="${esc(y)}" ${filterState.readYear === y ? 'selected' : ''}>Read: ${esc(y)}</option>`).join('')}
        </select>

        <select id="sort-by" class="select">
          <option value="author" ${filterState.sortBy === 'author' ? 'selected' : ''}>Sort: Author (Surname)</option>
          <option value="title" ${filterState.sortBy === 'title' ? 'selected' : ''}>Sort: Title</option>
          <option value="price" ${filterState.sortBy === 'price' ? 'selected' : ''}>Sort: Price</option>
          <option value="pub_year" ${filterState.sortBy === 'pub_year' ? 'selected' : ''}>Sort: Pub Year</option>
          <option value="date_read" ${filterState.sortBy === 'date_read' ? 'selected' : ''}>Sort: Date Read</option>
        </select>

        <button id="sort-dir" class="btn btn-sm" type="button" title="Toggle sort direction">${filterState.sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}</button>

        ${
          filterState.sortBy === 'title'
            ? `<label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.84rem">
                <input type="checkbox" id="sort-ignore-articles" ${filterState.ignoreTitleArticles ? 'checked' : ''} />
                Ignore "The" / "A" / "An"
              </label>`
            : ''
        }

        <label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.84rem">
          <input type="checkbox" id="filter-backlog" ${filterState.includeBacklog ? 'checked' : ''} />
          Include Series Backlog
        </label>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Author</th>
            <th>Pub</th>
            <th>Type</th>
            <th>Status</th>
            <th>Series</th>
            <th class="num">Price</th>
            <th>Read Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            visible.length
              ? visible
                  .map((b) => {
                    const sObj = b.series_id ? seriesMap.get(b.series_id) : null;
                    const amz = amazonUrl(b);
                    return `<tr>
                      <td>
                        <div style="font-weight:600">${esc(b.title)}</div>
                        ${b.notes ? `<div class="muted" style="font-size:0.78rem">${esc(b.notes)}</div>` : ''}
                      </td>
                      <td>${esc(b.author)}</td>
                      <td class="num">${b.pub_year ?? '<span class="muted">—</span>'}</td>
                      <td><span class="badge ${b.is_factual ? 'badge-factual' : 'badge-fiction'}">${b.is_factual ? 'Factual' : 'Fiction'}</span></td>
                      <td>
                        <span class="badge badge-${esc(b.status)}">${esc(statusLabel(b.status))}</span>
                        ${b.ownership === 'not_owned' ? `<span class="badge badge-wishlist">Wishlist</span>` : ''}
                      </td>
                      <td>${sObj ? `${esc(sObj.name)}${b.series_order !== null ? ` #${b.series_order}` : ''}` : '<span class="muted">—</span>'}</td>
                      <td class="num">${formatPrice(b.current_price)}</td>
                      <td>${formatDate(b.date_read)}</td>
                      <td style="white-space:nowrap">
                        ${
                          b.ownership === 'owned'
                            ? `<button class="btn btn-xs btn-owned-done" type="button" disabled title="Already owned">Owned</button>`
                            : `<button class="btn btn-xs" type="button" data-action="owned" data-id="${esc(b.id)}" title="Mark as owned">Owned</button>`
                        }
                        ${b.status === 'unread' || b.status === 'up_next' ? `<button class="btn btn-xs" data-action="start" data-id="${esc(b.id)}">Read Now</button>` : ''}
                        ${b.status === 'reading' ? `<button class="btn btn-ok btn-xs" data-action="finish" data-id="${esc(b.id)}">Finish</button>` : ''}
                        ${amz ? `<a class="btn btn-xs" href="${esc(amz)}" target="_blank" rel="noopener">Kindle ↗</a>` : ''}
                        <button class="btn btn-ghost btn-xs" data-action="edit" data-id="${esc(b.id)}">Edit</button>
                      </td>
                    </tr>`;
                  })
                  .join('')
              : `<tr><td colspan="9" class="muted" style="text-align:center;padding:1.5rem">No books match these filters.</td></tr>`
          }
        </tbody>
      </table>
    </div>

    ${
      filtered.length > visible.length
        ? `<div style="text-align:center;margin-top:0.9rem">
            <button id="btn-show-more" class="btn" type="button">Show more (${filtered.length - visible.length} remaining)</button>
          </div>`
        : ''
    }
  </div>`;

  const root = container.firstElementChild;

  const searchInput = root.querySelector('#books-search');
  searchInput?.addEventListener(
    'input',
    debounce((e) => {
      filterState.q = e.target.value;
      filterState.limit = 150;
      renderBooks(container, ctx);
      const nextInput = container.querySelector('#books-search');
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
      }
    }, 180)
  );

  root.querySelector('#status-chips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-status]');
    if (!chip) return;
    filterState.status = chip.dataset.status;
    filterState.limit = 150;
    renderBooks(container, ctx);
  });

  const bindSelect = (id, key) => {
    root.querySelector(id)?.addEventListener('change', (e) => {
      filterState[key] = e.target.value;
      filterState.limit = 150;
      renderBooks(container, ctx);
    });
  };
  bindSelect('#filter-ownership', 'ownership');
  bindSelect('#filter-type', 'type');
  bindSelect('#filter-series', 'seriesId');
  bindSelect('#filter-category', 'category');
  bindSelect('#filter-recommender', 'recommender');
  bindSelect('#filter-readyear', 'readYear');
  bindSelect('#sort-by', 'sortBy');

  root.querySelector('#sort-dir')?.addEventListener('click', () => {
    filterState.sortDir = filterState.sortDir === 'asc' ? 'desc' : 'asc';
    renderBooks(container, ctx);
  });

  root.querySelector('#sort-ignore-articles')?.addEventListener('change', (e) => {
    filterState.ignoreTitleArticles = e.target.checked;
    try {
      localStorage.setItem(LS_IGNORE_ARTICLES_KEY, String(filterState.ignoreTitleArticles));
    } catch {
      // ignore
    }
    renderBooks(container, ctx);
  });

  root.querySelector('#filter-backlog')?.addEventListener('change', (e) => {
    filterState.includeBacklog = e.target.checked;
    renderBooks(container, ctx);
  });

  root.querySelector('#btn-reset-filters')?.addEventListener('click', () => {
    Object.assign(filterState, DEFAULT_FILTERS);
    if (window.location.hash.includes('?')) {
      window.history.replaceState(null, '', '#/books');
    }
    renderBooks(container, ctx);
  });

  root.querySelector('#btn-show-more')?.addEventListener('click', () => {
    filterState.limit += 200;
    renderBooks(container, ctx);
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'owned') {
      store.markOwned(id);
      ctx.toast('Marked as owned', 'ok');
    } else if (action === 'start') {
      store.startReading(id);
      ctx.toast('Marked as currently reading', 'ok');
    } else if (action === 'finish') {
      store.markRead(id);
      ctx.toast('Marked as read', 'ok');
    } else if (action === 'edit') {
      ctx.openBookModal(id);
    }
  });
}
