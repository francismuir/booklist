import { compareAmazonWishlist, getWishlistBookmarkletCode, parseAmazonWishlistInput } from '../amazonWishlist.js';
import { store } from '../store.js';
import { amazonDisplayId, amazonUrl, esc, formatDate, formatPrice, sortableTitle } from '../utils.js';

const LS_IGNORE_ARTICLES_KEY = 'booklist_ignore_articles_v1';

function getIgnoreArticles() {
  try {
    const val = localStorage.getItem(LS_IGNORE_ARTICLES_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

let wishlistSort = 'price_asc'; // 'price_asc' | 'price_desc' | 'title' | 'checked'
let amazonRawInput = '';
let amazonParsedItems = null;
let lastAutoPriceUpdates = [];
let bulkTargetScope = 'wishlist_blank'; // 'wishlist_blank' | 'wishlist_all_overwrite' | 'unowned_all' | 'all_books'
let bulkTargetValue = '';

export function renderWishlist(container, ctx) {
  const allBooks = store.data.books;
  const seriesMap = store.getSeriesMap();
  const amazonWishlistUrl = store.getAmazonWishlistUrl();
  const wishlist = allBooks.filter((b) => b.ownership === 'not_owned' && b.list_scope === 'library');
  const backlogWishlist = allBooks.filter((b) => b.ownership === 'not_owned' && b.list_scope === 'series_backlog');
  const deals = wishlist.filter(
    (b) => b.target_price !== null && b.current_price !== null && b.current_price <= b.target_price
  );

  const ignoreArticles = getIgnoreArticles();
  const sorted = [...wishlist].sort((a, b) => {
    if (wishlistSort === 'price_asc') return (a.current_price ?? 9999) - (b.current_price ?? 9999);
    if (wishlistSort === 'price_desc') return (b.current_price ?? -1) - (a.current_price ?? -1);
    if (wishlistSort === 'checked') return (a.price_checked_at || '').localeCompare(b.price_checked_at || '');
    return (
      sortableTitle(a.title, ignoreArticles).localeCompare(sortableTitle(b.title, ignoreArticles)) ||
      a.title.localeCompare(b.title)
    );
  });

  const bookmarkletHref = getWishlistBookmarkletCode();
  const amazonComparison = amazonParsedItems ? compareAmazonWishlist(amazonParsedItems, allBooks) : null;

  container.innerHTML = `<div class="view-root">
    <div class="page-header">
      <div>
        <h1 class="page-title">Wishlist &amp; Price Check</h1>
        <p class="page-subtitle">
          ${wishlist.length} books in main wishlist (${backlogWishlist.length} more in series backlog) ·
          ${deals.length} at or below target price
        </p>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <a class="btn btn-primary btn-sm" href="${esc(amazonWishlistUrl)}" target="_blank" rel="noopener">Open Amazon UK Wishlist ↗</a>
        <a class="btn btn-sm" href="#/settings">Edit Link</a>
      </div>
    </div>

    <section class="card" style="margin-bottom:1.1rem">
      <div style="display:flex;align-items:baseline;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem">
        <h2 class="card-title" style="margin:0">Compare with Amazon Wishlist</h2>
        <span class="muted" style="font-size:0.84rem">
          Find books missing from Amazon or missing from this app
        </span>
      </div>

      <div>
        <div style="padding:0.7rem;border:1px solid var(--border);border-radius:8px;background:var(--bg);margin-bottom:0.75rem">
          <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.3rem">1-Click Bookmarklet</div>
          <div class="muted" style="font-size:0.84rem;margin-bottom:0.45rem">
            Drag this button to your bookmarks bar. Open your <a href="${esc(amazonWishlistUrl)}" target="_blank" rel="noopener">Amazon UK Wishlist</a>, scroll down so all items load, click the bookmarklet, then paste below.
          </div>
          <a class="btn btn-sm" href="${bookmarkletHref}" onclick="event.preventDefault()">📋 Copy Amazon Wishlist</a>
          <span class="muted" style="font-size:0.78rem;margin-left:0.35rem">(drag to bookmarks bar)</span>
        </div>

        <textarea id="amz-compare-text" class="textarea mono" style="width:100%;font-size:0.82rem" rows="3" placeholder="Paste bookmarklet JSON, Amazon URLs, or ASINs here…">${esc(amazonRawInput)}</textarea>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;align-items:center;flex-wrap:wrap">
          <button id="btn-run-amz-compare" class="btn btn-primary btn-sm" type="button">Compare Lists</button>
          ${amazonComparison ? `<button id="btn-clear-amz-compare" class="btn btn-sm" type="button">Clear Comparison</button>` : ''}
        </div>

        ${
          amazonComparison
            ? (() => {
                const c = amazonComparison;
                return `
                  <div style="margin-top:0.95rem;padding-top:0.85rem;border-top:1px solid var(--border)">
                    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.85rem">
                      <span class="badge badge-unread">${c.amazonCount} Amazon items parsed</span>
                      <span class="badge badge-owned">${c.matched.length} matched</span>
                      <span class="badge badge-warn">${c.missingFromAmazon.length} missing from Amazon</span>
                      <span class="badge badge-factual">${c.missingFromApp.length} missing from App wishlist</span>
                      ${lastAutoPriceUpdates.length ? `<span class="badge badge-drop">${lastAutoPriceUpdates.length} price${lastAutoPriceUpdates.length === 1 ? '' : 's'} auto-updated</span>` : ''}
                      ${c.asinUpdates.length ? `<span class="badge badge-unread">${c.asinUpdates.length} ASIN edition difference${c.asinUpdates.length === 1 ? '' : 's'}</span>` : ''}
                    </div>

                    ${
                      lastAutoPriceUpdates.length
                        ? `<div style="margin-bottom:0.9rem;padding:0.65rem 0.85rem;border:1px solid var(--ok);border-radius:8px;background:var(--ok-soft)">
                            <strong>Automatically updated ${lastAutoPriceUpdates.length} price${lastAutoPriceUpdates.length === 1 ? '' : 's'} from Amazon:</strong>
                            <ul style="margin:0.35rem 0 0;padding-left:1.2rem;font-size:0.84rem">
                              ${lastAutoPriceUpdates
                                .map(
                                  (u) =>
                                    `<li><strong>${esc(u.title)}</strong>: ${formatPrice(u.oldPrice)} → <strong>${formatPrice(u.newPrice)}</strong>${u.hitTarget ? ' <span class="badge badge-deal">Target Hit!</span>' : ''}</li>`
                                )
                                .join('')}
                            </ul>
                          </div>`
                        : ''
                    }

                    ${
                      c.asinUpdates.length
                        ? `<div style="margin-bottom:0.9rem;padding:0.65rem 0.85rem;border:1px solid var(--border);border-radius:8px;background:var(--warn-soft)">
                            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
                              <div>
                                <strong>${c.asinUpdates.length} matched book${c.asinUpdates.length === 1 ? '' : 's'} have a different edition ASIN on Amazon</strong>
                                <div class="muted" style="font-size:0.82rem;margin-top:0.2rem">
                                  ${c.asinUpdates.map((u) => `${esc(u.book.title)} (<span class="mono">${esc(u.oldAsin || '—')} → ${esc(u.newAsin)}</span>)`).join(', ')}
                                </div>
                              </div>
                              <button id="btn-apply-amz-asins" class="btn btn-sm" type="button">Update ${c.asinUpdates.length} ASIN${c.asinUpdates.length === 1 ? '' : 's'} from Amazon</button>
                            </div>
                          </div>`
                        : ''
                    }

                    <div class="grid-2">
                      <div>
                        <h3 style="margin:0 0 0.4rem;font-size:0.98rem">In App Wishlist, Missing from Amazon (${c.missingFromAmazon.length})</h3>
                        <div class="table-wrap" style="max-height:280px;overflow-y:auto">
                          <table>
                            <thead><tr><th>Title</th><th>Author</th><th>Actions</th></tr></thead>
                            <tbody>
                              ${
                                c.missingFromAmazon.length
                                  ? c.missingFromAmazon
                                      .map((b) => {
                                        const amz = amazonUrl(b);
                                        return `<tr>
                                          <td><strong>${esc(b.title)}</strong><div class="muted mono" style="font-size:0.75rem">${esc(amazonDisplayId(b) || 'No ASIN')}</div></td>
                                          <td>${esc(b.author)}</td>
                                          <td style="white-space:nowrap">
                                            ${amz ? `<a class="btn btn-xs" href="${esc(amz)}" target="_blank" rel="noopener">Open ↗</a>` : ''}
                                            <button class="btn btn-ok btn-xs" data-action="owned" data-id="${esc(b.id)}">Owned</button>
                                          </td>
                                        </tr>`;
                                      })
                                      .join('')
                                  : `<tr><td colspan="3" class="muted">All app wishlist books are on Amazon!</td></tr>`
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <h3 style="margin:0 0 0.4rem;font-size:0.98rem">On Amazon Wishlist, Not in App Wishlist (${c.missingFromApp.length})</h3>
                        <div class="table-wrap" style="max-height:280px;overflow-y:auto">
                          <table>
                            <thead><tr><th>Book</th><th class="num">Price</th><th>Actions</th></tr></thead>
                            <tbody>
                              ${
                                c.missingFromApp.length
                                  ? c.missingFromApp
                                      .map((m, idx) => {
                                        const it = m.amazonItem;
                                        const ex = m.existingBook;
                                        const note = ex
                                          ? ex.ownership === 'owned'
                                            ? `<span class="badge badge-owned">Already Owned in App</span>`
                                            : ex.list_scope === 'series_backlog'
                                              ? `<span class="badge badge-unread">In Series Backlog</span>`
                                              : ''
                                          : '';
                                        return `<tr>
                                          <td>
                                            <strong>${esc(it.title || it.asin)}</strong>
                                            ${it.author ? `<div class="muted" style="font-size:0.78rem">${esc(it.author)}</div>` : ''}
                                            <div class="muted mono" style="font-size:0.74rem">${esc(it.asin || '')} ${note}</div>
                                          </td>
                                          <td class="num">${formatPrice(it.price)}</td>
                                          <td style="white-space:nowrap">
                                            ${
                                              ex && ex.list_scope === 'series_backlog'
                                                ? `<button class="btn btn-xs" data-promote-id="${esc(ex.id)}" title="Add to main Book List">Add</button>`
                                                : !ex
                                                  ? `<button class="btn btn-primary btn-xs" data-add-amz-idx="${idx}">+ Add</button>`
                                                  : ''
                                            }
                                          </td>
                                        </tr>`;
                                      })
                                      .join('')
                                  : `<tr><td colspan="3" class="muted">Every Amazon wishlist book is already in your app wishlist!</td></tr>`
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              })()
            : ''
        }
      </div>
    </section>

    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem">
        <h2 class="card-title" style="margin:0">Unowned Books (${sorted.length})</h2>
        <div style="display:flex;align-items:center;gap:0.65rem;flex-wrap:wrap">
          ${
            wishlistSort === 'title'
              ? `<label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.84rem">
                  <input type="checkbox" id="wishlist-ignore-articles" ${ignoreArticles ? 'checked' : ''} />
                  Ignore "The" / "A" / "An"
                </label>`
              : ''
          }
          <select id="wishlist-sort" class="select">
            <option value="price_asc" ${wishlistSort === 'price_asc' ? 'selected' : ''}>Sort: Price (Low → High)</option>
            <option value="price_desc" ${wishlistSort === 'price_desc' ? 'selected' : ''}>Sort: Price (High → Low)</option>
            <option value="checked" ${wishlistSort === 'checked' ? 'selected' : ''}>Sort: Oldest Checked First</option>
            <option value="title" ${wishlistSort === 'title' ? 'selected' : ''}>Sort: Title</option>
          </select>
        </div>
      </div>

      <div class="filters-bar" style="padding:0.6rem 0.75rem;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
        <span style="font-size:0.84rem;font-weight:600">Bulk Target Price:</span>
        <input id="bulk-target-input" class="input" style="width:95px" type="number" step="0.01" min="0" placeholder="£ e.g. 2.99" value="${esc(bulkTargetValue)}" />
        <select id="bulk-target-scope" class="select">
          <option value="wishlist_blank" ${bulkTargetScope === 'wishlist_blank' ? 'selected' : ''}>Main Wishlist (blank targets only)</option>
          <option value="wishlist_all_overwrite" ${bulkTargetScope === 'wishlist_all_overwrite' ? 'selected' : ''}>Main Wishlist (all / overwrite)</option>
          <option value="unowned_all" ${bulkTargetScope === 'unowned_all' ? 'selected' : ''}>All Unowned incl. Series Backlog</option>
          <option value="all_books" ${bulkTargetScope === 'all_books' ? 'selected' : ''}>All Books in Library</option>
        </select>
        <button id="btn-bulk-target-set" class="btn btn-sm" type="button">Set Target Price</button>
        <button id="btn-bulk-target-clear" class="btn btn-danger btn-sm" type="button">Clear Targets</button>
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
                          <button class="btn btn-ok btn-xs" data-action="owned" data-id="${esc(b.id)}">Mark Owned</button>
                          <button class="btn btn-ghost btn-xs" data-action="edit" data-id="${esc(b.id)}">Edit</button>
                        </td>
                      </tr>`;
                    })
                    .join('')
                : `<tr><td colspan="7" class="muted" style="text-align:center;padding:1.4rem">No unowned books in your main wishlist.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  </div>`;

  const root = container.firstElementChild;

  root.querySelector('#wishlist-sort')?.addEventListener('change', (e) => {
    wishlistSort = e.target.value;
    renderWishlist(container, ctx);
  });

  root.querySelector('#wishlist-ignore-articles')?.addEventListener('change', (e) => {
    try {
      localStorage.setItem(LS_IGNORE_ARTICLES_KEY, String(e.target.checked));
    } catch {
      // ignore
    }
    renderWishlist(container, ctx);
  });

  // Bulk target price controls
  root.querySelector('#bulk-target-input')?.addEventListener('input', (e) => {
    bulkTargetValue = e.target.value;
  });
  root.querySelector('#bulk-target-scope')?.addEventListener('change', (e) => {
    bulkTargetScope = e.target.value;
  });

  const resolveBulkOpts = () => {
    if (bulkTargetScope === 'wishlist_blank') return { scope: 'wishlist_library', onlyBlank: true };
    if (bulkTargetScope === 'wishlist_all_overwrite') return { scope: 'wishlist_library', onlyBlank: false };
    if (bulkTargetScope === 'unowned_all') return { scope: 'wishlist_all', onlyBlank: false };
    return { scope: 'all_books', onlyBlank: false };
  };

  root.querySelector('#btn-bulk-target-set')?.addEventListener('click', () => {
    const raw = bulkTargetValue.trim();
    if (!raw) {
      ctx.toast('Enter a target price (e.g. 2.99) first.', 'error');
      return;
    }
    try {
      const count = store.bulkSetTargetPrice(raw, resolveBulkOpts());
      ctx.toast(`Set target price £${Number(raw).toFixed(2)} on ${count} book${count === 1 ? '' : 's'}`, 'ok');
    } catch (err) {
      ctx.toast(err.message, 'error');
    }
  });

  root.querySelector('#btn-bulk-target-clear')?.addEventListener('click', () => {
    const opts = resolveBulkOpts();
    if (!window.confirm('Clear target prices for the selected scope?')) return;
    const count = store.bulkSetTargetPrice(null, { scope: opts.scope, onlyBlank: false });
    ctx.toast(`Cleared target prices on ${count} book${count === 1 ? '' : 's'}`, 'ok');
  });

  // Amazon Wishlist comparison
  const runComparison = (raw) => {
    amazonRawInput = raw;
    const parsed = parseAmazonWishlistInput(raw);
    if (!parsed.items.length) {
      ctx.toast('Could not find any Amazon wishlist items in that input.', 'error');
      return;
    }
    amazonParsedItems = parsed.items;

    const cmp = compareAmazonWishlist(amazonParsedItems, store.data.books);
    if (cmp.priceChanges.length > 0) {
      lastAutoPriceUpdates = cmp.priceChanges.map((p) => ({
        title: p.book.title,
        oldPrice: p.oldPrice,
        newPrice: p.newPrice,
        hitTarget:
          p.book.target_price !== null &&
          p.book.target_price !== undefined &&
          p.newPrice <= p.book.target_price,
      }));
      const updates = cmp.priceChanges.map((p) => ({
        bookId: p.book.id,
        newPrice: p.newPrice,
      }));
      const count = store.applyPriceUpdates(updates);
      const hits = lastAutoPriceUpdates.filter((u) => u.hitTarget).length;
      ctx.toast(
        `Updated ${count} price${count === 1 ? '' : 's'} automatically from Amazon${hits ? ` (${hits} hit target price!)` : ''}`,
        'ok'
      );
      return;
    }

    lastAutoPriceUpdates = [];
    ctx.toast('Comparison complete — all matched prices are already up to date.', 'ok');
    renderWishlist(container, ctx);
  };

  root.querySelector('#amz-compare-text')?.addEventListener('input', (e) => {
    amazonRawInput = e.target.value;
  });

  root.querySelector('#btn-run-amz-compare')?.addEventListener('click', () => {
    runComparison(amazonRawInput);
  });

  root.querySelector('#btn-clear-amz-compare')?.addEventListener('click', () => {
    amazonRawInput = '';
    amazonParsedItems = null;
    lastAutoPriceUpdates = [];
    renderWishlist(container, ctx);
  });

  root.querySelector('#btn-apply-amz-asins')?.addEventListener('click', () => {
    if (!amazonComparison?.asinUpdates?.length) return;
    const updates = amazonComparison.asinUpdates.map((u) => ({
      bookId: u.book.id,
      newAsin: u.newAsin,
    }));
    const count = store.applyAsinUpdates(updates);
    ctx.toast(`Updated ASIN on ${count} book${count === 1 ? '' : 's'}`, 'ok');
  });

  root.querySelectorAll('[data-target-id]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const id = e.target.dataset.targetId;
      const raw = e.target.value.trim();
      const val = raw === '' ? null : Math.round(Number(raw) * 100) / 100;
      if (val !== null && (Number.isNaN(val) || val < 0)) return;
      store.saveBook({ target_price: val }, id);
      ctx.toast('Saved target price', 'ok');
    });
  });

  root.addEventListener('click', (e) => {
    const addAmz = e.target.closest('[data-add-amz-idx]');
    if (addAmz && amazonComparison) {
      const item = amazonComparison.missingFromApp[Number(addAmz.dataset.addAmzIdx)]?.amazonItem;
      if (item) {
        ctx.openBookModal(null, {
          title: item.title || '',
          author: item.author || '',
          amazon_asin: item.asin || '',
          current_price: item.price ?? '',
          ownership: 'not_owned',
          list_scope: 'library',
        });
      }
      return;
    }

    const promoteBtn = e.target.closest('[data-promote-id]');
    if (promoteBtn) {
      store.promoteToLibrary(promoteBtn.dataset.promoteId);
      ctx.toast('Added to Book List', 'ok');
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'owned') {
      store.markOwned(id);
      ctx.toast('Marked as owned!', 'ok');
    } else if (action === 'edit') {
      ctx.openBookModal(id);
    }
  });
}
