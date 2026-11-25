import { exportPriceCheckCsv, parsePriceCheckCsv } from '../csv.js';
import { store } from '../store.js';
import { amazonDisplayId, amazonUrl, downloadTextFile, esc, formatDate, formatPrice, todayIso } from '../utils.js';

let csvScope = 'wishlist_library'; // 'wishlist_library' | 'wishlist_all' | 'all_books'
let wishlistSort = 'price_asc'; // 'price_asc' | 'price_desc' | 'title' | 'checked'
let pendingPreview = null; // { items, fileName }

function getScopeBooks(books, scope) {
  if (scope === 'wishlist_library') {
    return books.filter((b) => b.ownership === 'not_owned' && b.list_scope === 'library');
  }
  if (scope === 'wishlist_all') {
    return books.filter((b) => b.ownership === 'not_owned');
  }
  return books;
}

export function renderWishlist(container, ctx) {
  const allBooks = store.data.books;
  const seriesMap = store.getSeriesMap();
  const wishlist = allBooks.filter((b) => b.ownership === 'not_owned' && b.list_scope === 'library');
  const backlogWishlist = allBooks.filter((b) => b.ownership === 'not_owned' && b.list_scope === 'series_backlog');
  const deals = wishlist.filter(
    (b) => b.target_price !== null && b.current_price !== null && b.current_price <= b.target_price
  );

  const sorted = [...wishlist].sort((a, b) => {
    if (wishlistSort === 'price_asc') return (a.current_price ?? 9999) - (b.current_price ?? 9999);
    if (wishlistSort === 'price_desc') return (b.current_price ?? -1) - (a.current_price ?? -1);
    if (wishlistSort === 'checked') return (a.price_checked_at || '').localeCompare(b.price_checked_at || '');
    return a.title.localeCompare(b.title);
  });

  const exportCount = getScopeBooks(allBooks, csvScope).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Wishlist &amp; Price Check</h1>
        <p class="page-subtitle">
          ${wishlist.length} books in main wishlist (${backlogWishlist.length} more in series backlog) ·
          ${deals.length} at or below target price
        </p>
      </div>
    </div>

    <section class="card" style="margin-bottom:1.1rem">
      <h2 class="card-title">CSV Price Check Round-Trip</h2>
      <p class="muted" style="margin-top:0;font-size:0.9rem">
        1. Download a CSV containing <code>book_id</code>, <code>amazon_id</code>, <code>amazon_url</code>, <code>author</code>, <code>title</code>, <code>current_price</code>, and <code>new_price</code>.<br />
        2. Fill in prices in the <code>new_price</code> column (leave unchanged books blank).<br />
        3. Upload the updated CSV below to review price drops and apply updates with full price history.
      </p>

      <div class="filters-bar" style="margin-bottom:0.75rem">
        <select id="csv-scope" class="select">
          <option value="wishlist_library" ${csvScope === 'wishlist_library' ? 'selected' : ''}>Main Wishlist (Not Bought, ${getScopeBooks(allBooks, 'wishlist_library').length} books)</option>
          <option value="wishlist_all" ${csvScope === 'wishlist_all' ? 'selected' : ''}>All Unbought incl. Series Backlog (${getScopeBooks(allBooks, 'wishlist_all').length} books)</option>
          <option value="all_books" ${csvScope === 'all_books' ? 'selected' : ''}>Entire Library (${allBooks.length} books)</option>
        </select>
        <button id="btn-download-csv" class="btn btn-primary" type="button">⬇ Download Price Check CSV (${exportCount})</button>
      </div>

      <div id="csv-dropzone" class="dropzone" tabindex="0">
        <input id="csv-file-input" type="file" accept=".csv,text/csv" class="hidden" />
        <strong>Drop updated CSV here</strong> or <span style="color:var(--accent);text-decoration:underline">choose a file</span>
      </div>

      ${
        pendingPreview
          ? (() => {
              const items = pendingPreview.items;
              const drops = items.filter((i) => i.kind === 'drop').length;
              const rises = items.filter((i) => i.kind === 'increase').length;
              const newlySet = items.filter((i) => i.kind === 'new_price_set').length;
              const selectedCount = items.filter((i) => i.selected && i.book).length;
              return `
                <div style="margin-top:1rem;padding-top:0.85rem;border-top:1px solid var(--border)">
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.65rem">
                    <div>
                      <strong>Preview: ${esc(pendingPreview.fileName)}</strong>
                      <span class="muted" style="font-size:0.85rem;margin-left:0.5rem">
                        ${drops} drops · ${rises} increases · ${newlySet} newly priced
                      </span>
                    </div>
                    <div style="display:flex;gap:0.5rem">
                      <button id="btn-cancel-preview" class="btn btn-sm" type="button">Discard</button>
                      <button id="btn-apply-csv" class="btn btn-ok btn-sm" type="button" ${selectedCount === 0 ? 'disabled' : ''}>
                        Apply ${selectedCount} Selected Update${selectedCount === 1 ? '' : 's'}
                      </button>
                    </div>
                  </div>
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Apply</th>
                          <th>Title</th>
                          <th>Author</th>
                          <th>Amazon ID</th>
                          <th class="num">Old Price</th>
                          <th class="num">New Price</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${
                          items.length
                            ? items
                                .map((it, idx) => {
                                  const badge =
                                    it.kind === 'drop'
                                      ? `<span class="badge badge-drop">↓ Drop (£${(it.oldPrice - it.newPrice).toFixed(2)})</span>`
                                      : it.kind === 'increase'
                                        ? `<span class="badge badge-rise">↑ +£${(it.newPrice - it.oldPrice).toFixed(2)}</span>`
                                        : it.kind === 'new_price_set'
                                          ? `<span class="badge badge-owned">New price</span>`
                                          : it.kind === 'unchanged'
                                            ? `<span class="badge badge-unread">Unchanged</span>`
                                            : `<span class="badge badge-abandoned">${esc(it.reason)}</span>`;
                                  return `<tr>
                                    <td>
                                      ${
                                        it.book
                                          ? `<input type="checkbox" data-preview-idx="${idx}" ${it.selected ? 'checked' : ''} />`
                                          : '—'
                                      }
                                    </td>
                                    <td>
                                      <strong>${esc(it.title)}</strong>
                                      ${it.hitTarget ? `<span class="badge badge-deal" style="margin-left:0.35rem">Target Hit!</span>` : ''}
                                    </td>
                                    <td>${esc(it.author)}</td>
                                    <td class="mono">${esc(it.amazonId)}</td>
                                    <td class="num">${formatPrice(it.oldPrice)}</td>
                                    <td class="num"><strong>${formatPrice(it.newPrice)}</strong></td>
                                    <td>${badge}</td>
                                  </tr>`;
                                })
                                .join('')
                            : `<tr><td colspan="7" class="muted" style="text-align:center">No non-blank prices found in the uploaded CSV.</td></tr>`
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              `;
            })()
          : ''
      }
    </section>

    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem">
        <h2 class="card-title" style="margin:0">Unbought Books (${sorted.length})</h2>
        <select id="wishlist-sort" class="select">
          <option value="price_asc" ${wishlistSort === 'price_asc' ? 'selected' : ''}>Sort: Price (Low → High)</option>
          <option value="price_desc" ${wishlistSort === 'price_desc' ? 'selected' : ''}>Sort: Price (High → Low)</option>
          <option value="checked" ${wishlistSort === 'checked' ? 'selected' : ''}>Sort: Oldest Checked First</option>
          <option value="title" ${wishlistSort === 'title' ? 'selected' : ''}>Sort: Title</option>
        </select>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Type</th>
              <th class="num">Current Price</th>
              <th class="num">Target (£)</th>
              <th>Last Checked</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              sorted.length
                ? sorted
                    .map((b) => {
                      const sObj = b.series_id ? seriesMap.get(b.series_id) : null;
                      const amz = amazonUrl(b);
                      const isDeal =
                        b.target_price !== null && b.current_price !== null && b.current_price <= b.target_price;
                      return `<tr>
                        <td>
                          <strong>${esc(b.title)}</strong>
                          ${isDeal ? `<span class="badge badge-deal" style="margin-left:0.35rem">Deal!</span>` : ''}
                          ${sObj ? `<div class="muted" style="font-size:0.78rem">${esc(sObj.name)}${b.series_order !== null ? ` #${b.series_order}` : ''}</div>` : ''}
                        </td>
                        <td>${esc(b.author)}</td>
                        <td><span class="badge ${b.is_factual ? 'badge-factual' : 'badge-fiction'}">${b.is_factual ? 'Factual' : 'Fiction'}</span></td>
                        <td class="num">
                          <strong>${formatPrice(b.current_price)}</strong>
                          ${(b.price_history || []).length > 1 ? `<div class="muted" style="font-size:0.74rem">${b.price_history.length} checks</div>` : ''}
                        </td>
                        <td class="num">
                          <input class="input" style="width:74px;padding:0.2rem 0.35rem;text-align:right" type="number" step="0.01" min="0" placeholder="—" value="${b.target_price ?? ''}" data-target-id="${esc(b.id)}" />
                        </td>
                        <td>${formatDate(b.price_checked_at)}</td>
                        <td style="white-space:nowrap">
                          ${amz ? `<a class="btn btn-primary btn-xs" href="${esc(amz)}" target="_blank" rel="noopener">Buy on Kindle ↗</a>` : `<span class="muted mono">${esc(amazonDisplayId(b) || 'No ID')}</span>`}
                          <button class="btn btn-ok btn-xs" data-action="bought" data-id="${esc(b.id)}">Mark Bought</button>
                          <button class="btn btn-ghost btn-xs" data-action="edit" data-id="${esc(b.id)}">Edit</button>
                        </td>
                      </tr>`;
                    })
                    .join('')
                : `<tr><td colspan="7" class="muted" style="text-align:center;padding:1.4rem">No unbought books in your main wishlist.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#csv-scope')?.addEventListener('change', (e) => {
    csvScope = e.target.value;
    renderWishlist(container, ctx);
  });

  container.querySelector('#wishlist-sort')?.addEventListener('change', (e) => {
    wishlistSort = e.target.value;
    renderWishlist(container, ctx);
  });

  container.querySelector('#btn-download-csv')?.addEventListener('click', () => {
    const scopeBooks = getScopeBooks(store.data.books, csvScope);
    const csv = exportPriceCheckCsv(scopeBooks);
    downloadTextFile(`booklist_prices_${todayIso()}.csv`, csv, 'text/csv;charset=utf-8');
    ctx.toast(`Downloaded ${scopeBooks.length} books for price checking`, 'ok');
  });

  const handleFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parsePriceCheckCsv(text, store.data.books);
    if (parsed.error) {
      ctx.toast(parsed.error, 'error');
      return;
    }
    pendingPreview = { items: parsed.items, fileName: file.name };
    renderWishlist(container, ctx);
  };

  const dropzone = container.querySelector('#csv-dropzone');
  const fileInput = container.querySelector('#csv-file-input');
  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFile(e.dataTransfer?.files?.[0]);
  });
  fileInput?.addEventListener('change', (e) => handleFile(e.target.files?.[0]));

  container.querySelector('#btn-cancel-preview')?.addEventListener('click', () => {
    pendingPreview = null;
    renderWishlist(container, ctx);
  });

  container.querySelectorAll('[data-preview-idx]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.previewIdx);
      if (pendingPreview?.items[idx]) {
        pendingPreview.items[idx].selected = e.target.checked;
        renderWishlist(container, ctx);
      }
    });
  });

  container.querySelector('#btn-apply-csv')?.addEventListener('click', () => {
    if (!pendingPreview) return;
    const updates = pendingPreview.items
      .filter((it) => it.selected && it.book && it.newPrice !== null)
      .map((it) => ({ bookId: it.book.id, newPrice: it.newPrice }));
    const count = store.applyPriceUpdates(updates);
    pendingPreview = null;
    ctx.toast(`Updated prices on ${count} book${count === 1 ? '' : 's'}`, 'ok');
  });

  container.querySelectorAll('[data-target-id]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const id = e.target.dataset.targetId;
      const raw = e.target.value.trim();
      const val = raw === '' ? null : Math.round(Number(raw) * 100) / 100;
      if (val !== null && (Number.isNaN(val) || val < 0)) return;
      store.saveBook({ target_price: val }, id);
      ctx.toast('Saved target price', 'ok');
    });
  });

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'bought') {
      store.markBought(id);
      ctx.toast('Marked as bought!', 'ok');
    } else if (action === 'edit') {
      ctx.openBookModal(id);
    }
  });
}
