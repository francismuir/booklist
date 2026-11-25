import { getReadingBalance, pickRandomBook } from '../randomizer.js';
import { store } from '../store.js';
import { amazonUrl, esc, formatPrice, sourceLabel } from '../utils.js';

let pickerState = {
  type: null, // null = auto-nudge
  ownership: 'owned',
  includeBacklog: false,
  seriesOrderGuard: true,
  preferUpNext: true,
  excludeIds: new Set(),
  lastPickId: null,
  lastPoolSize: 0,
};

function renderReadingCard(book, seriesMap) {
  const sObj = book.series_id ? seriesMap.get(book.series_id) : null;
  const amz = amazonUrl(book);
  return `
    <div class="book-card" data-book-id="${esc(book.id)}">
      <div class="book-card-top">
        <div>
          <div class="book-title">${esc(book.title)}</div>
          <div class="book-author">${esc(book.author)}${book.pub_year ? ` · ${book.pub_year}` : ''}</div>
        </div>
        <span class="badge ${book.is_factual ? 'badge-factual' : 'badge-fiction'}">${book.is_factual ? 'Factual' : 'Fiction'}</span>
      </div>
      <div class="book-meta">
        ${sObj ? `<span class="badge badge-unread">${esc(sObj.name)}${book.series_order !== null ? ` #${book.series_order}` : ''}</span>` : ''}
        ${book.source && book.source !== 'kindle' ? `<span class="badge badge-unread">${esc(sourceLabel(book.source))}</span>` : ''}
        ${book.recommended_by ? `<span class="badge badge-unread">Rec: ${esc(book.recommended_by)}</span>` : ''}
      </div>
      <div class="book-actions">
        <button class="btn btn-ok btn-sm" data-action="finish" data-id="${esc(book.id)}">✓ Mark Read</button>
        <button class="btn btn-danger btn-sm" data-action="abandon" data-id="${esc(book.id)}">Abandon</button>
        ${amz ? `<a class="btn btn-sm" href="${esc(amz)}" target="_blank" rel="noopener">Amazon UK ↗</a>` : ''}
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${esc(book.id)}">Edit</button>
      </div>
    </div>
  `;
}

export function renderDashboard(container, ctx) {
  const books = store.data.books;
  const seriesMap = store.getSeriesMap();
  const balance = getReadingBalance(books);
  const factualReading = balance.reading.filter((b) => b.is_factual);
  const fictionReading = balance.reading.filter((b) => !b.is_factual);

  if (pickerState.type === null) {
    pickerState.type = balance.suggestedType;
  }

  const thisYear = String(new Date().getFullYear());
  const readThisYear = books.filter(
    (b) => b.status === 'read' && b.list_scope === 'library' && String(b.date_read || '').startsWith(thisYear)
  ).length;
  const ownedTbr = books.filter(
    (b) => b.ownership === 'owned' && b.status === 'unread' && b.list_scope === 'library'
  ).length;
  const wishlistCount = books.filter((b) => b.ownership === 'not_owned' && b.list_scope === 'library').length;
  const upNextBooks = books.filter((b) => b.status === 'up_next');

  const currentPick = pickerState.lastPickId ? store.getBook(pickerState.lastPickId) : null;

  let balanceMsg = 'Balanced: you have both Fiction and Factual on the go.';
  if (balance.factualCount === 0 && balance.fictionCount === 0) {
    balanceMsg = 'No books currently on the go — roll the picker below to start one.';
  } else if (balance.factualCount === 0) {
    balanceMsg = 'You have no Factual book on the go right now — picker is nudged to Factual.';
  } else if (balance.fictionCount === 0) {
    balanceMsg = 'You have no Fiction book on the go right now — picker is nudged to Fiction.';
  }

  container.innerHTML = `<div class="view-root">
    <div class="page-header">
      <div>
        <h1 class="page-title">On the Go</h1>
        <p class="page-subtitle">${esc(balanceMsg)}</p>
      </div>
    </div>

    <div class="grid-4" style="margin-bottom:1rem">
      <a class="kpi-card kpi-link" href="#/books?status=reading">
        <div class="kpi-value">${balance.reading.length}</div>
        <div class="kpi-label">Currently Reading (${factualReading.length} Factual · ${fictionReading.length} Fiction)</div>
      </a>
      <a class="kpi-card kpi-link" href="#/books?status=unread&ownership=owned">
        <div class="kpi-value">${ownedTbr}</div>
        <div class="kpi-label">Owned &amp; Unread (TBR)</div>
      </a>
      <a class="kpi-card kpi-link" href="#/books?status=read&readYear=${thisYear}">
        <div class="kpi-value">${readThisYear}</div>
        <div class="kpi-label">Read in ${thisYear}</div>
      </a>
      <a class="kpi-card kpi-link" href="#/books?ownership=not_owned">
        <div class="kpi-value">${wishlistCount}</div>
        <div class="kpi-label">Library Wishlist</div>
      </a>
    </div>

    <div class="grid-2" style="margin-bottom:1.1rem">
      <section class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem">
          <h2 class="card-title" style="margin:0">Fiction on the Go</h2>
          <span class="badge badge-fiction">${fictionReading.length} active</span>
        </div>
        <div class="reading-list">
          ${
            fictionReading.length
              ? fictionReading.map((b) => renderReadingCard(b, seriesMap)).join('')
              : `<div class="muted" style="padding:0.75rem 0">No fiction book currently reading. Use the random picker to pick one!</div>`
          }
        </div>
      </section>

      <section class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem">
          <h2 class="card-title" style="margin:0">Factual on the Go</h2>
          <span class="badge badge-factual">${factualReading.length} active</span>
        </div>
        <div class="reading-list">
          ${
            factualReading.length
              ? factualReading.map((b) => renderReadingCard(b, seriesMap)).join('')
              : `<div class="muted" style="padding:0.75rem 0">No factual book currently reading. Use the random picker to pick one!</div>`
          }
        </div>
      </section>
    </div>

    <section class="card picker-card" style="margin-bottom:1.1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.6rem">
        <div>
          <h2 class="card-title" style="margin:0">Choose Next Book (Random Picker)</h2>
          <div class="muted" style="font-size:0.85rem">Replaces manual random number picking — honours series reading order by default.</div>
        </div>
        <button id="btn-roll-book" class="btn btn-primary" type="button">🎲 Pick Random Book</button>
      </div>

      <div class="filters-bar" style="margin-top:0.8rem;margin-bottom:0">
        <select id="pick-type" class="select">
          <option value="all" ${pickerState.type === 'all' ? 'selected' : ''}>Any Type (Factual or Fiction)</option>
          <option value="factual" ${pickerState.type === 'factual' ? 'selected' : ''}>Factual Only</option>
          <option value="fiction" ${pickerState.type === 'fiction' ? 'selected' : ''}>Fiction Only</option>
        </select>
        <select id="pick-ownership" class="select">
          <option value="owned" ${pickerState.ownership === 'owned' ? 'selected' : ''}>Owned Only</option>
          <option value="all" ${pickerState.ownership === 'all' ? 'selected' : ''}>Owned + Wishlist</option>
          <option value="not_owned" ${pickerState.ownership === 'not_owned' ? 'selected' : ''}>Wishlist Only</option>
        </select>
        <label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.86rem">
          <input type="checkbox" id="pick-series-guard" ${pickerState.seriesOrderGuard ? 'checked' : ''} />
          Series-order guard
        </label>
        <label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.86rem">
          <input type="checkbox" id="pick-upnext-boost" ${pickerState.preferUpNext ? 'checked' : ''} />
          Weight "Up Next" 3×
        </label>
        <label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.86rem">
          <input type="checkbox" id="pick-include-backlog" ${pickerState.includeBacklog ? 'checked' : ''} />
          Include Series Backlog
        </label>
      </div>

      ${
        currentPick
          ? (() => {
              const sObj = currentPick.series_id ? seriesMap.get(currentPick.series_id) : null;
              const amz = amazonUrl(currentPick);
              return `
                <div class="picker-result">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;flex-wrap:wrap">
                    <div>
                      <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em">
                        Selected from ${pickerState.lastPoolSize} eligible books
                      </div>
                      <div style="font-family:var(--font-serif);font-size:1.3rem;font-weight:700;margin-top:0.15rem">${esc(currentPick.title)}</div>
                      <div class="book-author">${esc(currentPick.author)}${currentPick.pub_year ? ` · ${currentPick.pub_year}` : ''}</div>
                    </div>
                    <div style="display:flex;gap:0.35rem;flex-wrap:wrap">
                      <span class="badge ${currentPick.is_factual ? 'badge-factual' : 'badge-fiction'}">${currentPick.is_factual ? 'Factual' : 'Fiction'}</span>
                      <span class="badge ${currentPick.ownership === 'owned' ? 'badge-owned' : 'badge-wishlist'}">${currentPick.ownership === 'owned' ? 'Owned' : 'Not Bought'}</span>
                      ${sObj ? `<span class="badge badge-unread">${esc(sObj.name)}${currentPick.series_order !== null ? ` #${currentPick.series_order}` : ''}</span>` : ''}
                      ${currentPick.current_price !== null ? `<span class="badge badge-unread">${formatPrice(currentPick.current_price)}</span>` : ''}
                    </div>
                  </div>
                  ${currentPick.notes ? `<div class="muted" style="margin-top:0.45rem;font-size:0.86rem">Note: ${esc(currentPick.notes)}</div>` : ''}
                  <div class="book-actions">
                    <button class="btn btn-primary btn-sm" id="btn-pick-start" data-id="${esc(currentPick.id)}">Start Reading Now</button>
                    <button class="btn btn-sm" id="btn-pick-upnext" data-id="${esc(currentPick.id)}">Save to Up Next</button>
                    <button class="btn btn-sm" id="btn-pick-reroll">Re-roll 🎲</button>
                    ${amz ? `<a class="btn btn-sm" href="${esc(amz)}" target="_blank" rel="noopener">Amazon UK ↗</a>` : ''}
                    <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${esc(currentPick.id)}">Edit</button>
                  </div>
                </div>
              `;
            })()
          : ''
      }
    </section>

    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <h2 class="card-title" style="margin:0">Up Next Queue (${upNextBooks.length})</h2>
        <a class="btn btn-ghost btn-sm" href="#/books?status=up_next">View in Book List →</a>
      </div>
      ${
        upNextBooks.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Title</th><th>Author</th><th>Type</th><th>Ownership</th><th></th></tr></thead>
              <tbody>
                ${upNextBooks
                  .map(
                    (b) => `<tr>
                      <td><strong>${esc(b.title)}</strong></td>
                      <td>${esc(b.author)}</td>
                      <td><span class="badge ${b.is_factual ? 'badge-factual' : 'badge-fiction'}">${b.is_factual ? 'Factual' : 'Fiction'}</span></td>
                      <td>${b.ownership === 'owned' ? 'Owned' : formatPrice(b.current_price)}</td>
                      <td style="text-align:right">
                        <button class="btn btn-primary btn-xs" data-action="start" data-id="${esc(b.id)}">Start</button>
                        <button class="btn btn-ghost btn-xs" data-action="edit" data-id="${esc(b.id)}">Edit</button>
                      </td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table></div>`
          : `<div class="muted" style="font-size:0.9rem">No books marked "Up Next" yet. Roll the random picker or mark books in your Book List to queue them here.</div>`
      }
    </section>
  </div>`;

  const root = container.firstElementChild;

  function runRoll(resetExcludes = false) {
    if (resetExcludes) pickerState.excludeIds.clear();
    const res = pickRandomBook(store.data.books, pickerState);
    if (!res.pick && pickerState.excludeIds.size > 0) {
      pickerState.excludeIds.clear();
      const retry = pickRandomBook(store.data.books, pickerState);
      if (retry.pick) {
        pickerState.lastPickId = retry.pick.id;
        pickerState.lastPoolSize = retry.poolSize;
        pickerState.excludeIds.add(retry.pick.id);
        renderDashboard(container, ctx);
        return;
      }
    }
    if (!res.pick) {
      pickerState.lastPickId = null;
      pickerState.lastPoolSize = 0;
      ctx.toast('No books match those picker filters.', 'error');
    } else {
      pickerState.lastPickId = res.pick.id;
      pickerState.lastPoolSize = res.poolSize;
      pickerState.excludeIds.add(res.pick.id);
    }
    renderDashboard(container, ctx);
  }

  root.querySelector('#pick-type')?.addEventListener('change', (e) => {
    pickerState.type = e.target.value;
    pickerState.excludeIds.clear();
  });
  root.querySelector('#pick-ownership')?.addEventListener('change', (e) => {
    pickerState.ownership = e.target.value;
    pickerState.excludeIds.clear();
  });
  root.querySelector('#pick-series-guard')?.addEventListener('change', (e) => {
    pickerState.seriesOrderGuard = e.target.checked;
  });
  root.querySelector('#pick-upnext-boost')?.addEventListener('change', (e) => {
    pickerState.preferUpNext = e.target.checked;
  });
  root.querySelector('#pick-include-backlog')?.addEventListener('change', (e) => {
    pickerState.includeBacklog = e.target.checked;
  });

  root.querySelector('#btn-roll-book')?.addEventListener('click', () => runRoll(false));
  root.querySelector('#btn-pick-reroll')?.addEventListener('click', () => runRoll(false));

  root.querySelector('#btn-pick-start')?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    store.startReading(id);
    pickerState.lastPickId = null;
    pickerState.type = null;
    ctx.toast('Marked as currently reading', 'ok');
  });

  root.querySelector('#btn-pick-upnext')?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    store.saveBook({ status: 'up_next', list_scope: 'library' }, id);
    ctx.toast('Added to Up Next queue', 'ok');
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'finish') {
      store.markRead(id);
      ctx.toast('Marked as Read (date set to today)', 'ok');
    } else if (action === 'abandon') {
      const b = store.getBook(id);
      const reason = window.prompt(`Optional reason for abandoning "${b?.title || ''}" (leave blank if none):`, b?.abandon_reason || '');
      if (reason === null) return;
      store.markAbandoned(id, reason.trim());
      ctx.toast('Marked as Abandoned', 'ok');
    } else if (action === 'start') {
      store.startReading(id);
      ctx.toast('Started reading', 'ok');
    } else if (action === 'edit') {
      ctx.openBookModal(id);
    }
  });
}
