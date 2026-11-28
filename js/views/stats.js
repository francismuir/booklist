import { lookupPubYearForBook } from '../openlibrary.js';
import { store } from '../store.js';
import { amazonUrl, esc } from '../utils.js';

function renderYearlyChart(readBooks) {
  const countsByYear = new Map();
  for (const b of readBooks) {
    const yr = String(b.date_read || '').slice(0, 4);
    if (!/^\d{4}$/.test(yr)) continue;
    if (!countsByYear.has(yr)) countsByYear.set(yr, { fiction: 0, factual: 0 });
    const entry = countsByYear.get(yr);
    if (b.is_factual) entry.factual += 1;
    else entry.fiction += 1;
  }

  const years = [...countsByYear.keys()].sort();
  if (!years.length) return `<p class="muted">No dated read records yet.</p>`;

  const maxTotal = Math.max(1, ...years.map((y) => countsByYear.get(y).fiction + countsByYear.get(y).factual));
  const barW = 36;
  const gap = 14;
  const padL = 32;
  const padB = 28;
  const chartH = 160;
  const width = padL + years.length * (barW + gap) + 20;
  const height = chartH + padB + 22;

  const bars = years
    .map((y, idx) => {
      const { fiction, factual } = countsByYear.get(y);
      const total = fiction + factual;
      const x = padL + idx * (barW + gap);
      const ficH = Math.round((fiction / maxTotal) * chartH);
      const facH = Math.round((factual / maxTotal) * chartH);
      const ficY = 14 + chartH - ficH;
      const facY = ficY - facH;
      return `
        <g>
          <rect x="${x}" y="${ficY}" width="${barW}" height="${ficH}" rx="3" fill="var(--fic)" />
          <rect x="${x}" y="${facY}" width="${barW}" height="${facH}" rx="3" fill="var(--fact)" />
          <text x="${x + barW / 2}" y="${facY - 4}" text-anchor="middle" font-size="11" fill="var(--text)">${total}</text>
          <text x="${x + barW / 2}" y="${14 + chartH + 16}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${y}</text>
        </g>
      `;
    })
    .join('');

  return `
    <div style="display:flex;gap:1rem;font-size:0.82rem;margin-bottom:0.4rem">
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--fic);border-radius:2px"></span> Fiction</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--fact);border-radius:2px"></span> Factual</span>
    </div>
    <div class="chart-wrap">
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Books read per year">
        <line x1="${padL - 4}" y1="${14 + chartH}" x2="${width - 8}" y2="${14 + chartH}" stroke="var(--border-strong)" />
        ${bars}
      </svg>
    </div>
  `;
}

export function renderStats(container, ctx) {
  const books = store.data.books;
  const readBooks = books.filter((b) => b.status === 'read');
  const abandonedBooks = books.filter((b) => b.status === 'abandoned');
  const ownedUnread = books.filter((b) => b.ownership === 'owned' && (b.status === 'unread' || b.status === 'up_next'));
  const factualRead = readBooks.filter((b) => b.is_factual).length;
  const finishRateBase = readBooks.length + abandonedBooks.length;
  const abandonRate = finishRateBase ? Math.round((abandonedBooks.length / finishRateBase) * 100) : 0;

  // Recommenders table
  const recMap = new Map();
  for (const b of books) {
    if (!b.recommended_by) continue;
    if (!recMap.has(b.recommended_by)) recMap.set(b.recommended_by, { name: b.recommended_by, total: 0, read: 0, abandoned: 0 });
    const r = recMap.get(b.recommended_by);
    r.total += 1;
    if (b.status === 'read') r.read += 1;
    if (b.status === 'abandoned') r.abandoned += 1;
  }
  const recList = [...recMap.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // Lent / Read Again
  const lentBooks = books.filter((b) => b.lent_to);
  const readAgain = books.filter((b) => b.category === 'READ AGAIN');

  // Maintenance counts
  const missingPubYear = books.filter((b) => b.pub_year === null || b.pub_year === undefined);
  const unresolvedEu = books.filter((b) => b.amazon_legacy_code && !b.amazon_asin);

  // Top authors
  const authMap = new Map();
  for (const b of books) {
    if (!b.author) continue;
    if (!authMap.has(b.author)) authMap.set(b.author, { author: b.author, total: 0, read: 0 });
    const a = authMap.get(b.author);
    a.total += 1;
    if (b.status === 'read') a.read += 1;
  }
  const topAuthors = [...authMap.values()].sort((a, b) => b.read - a.read || b.total - a.total).slice(0, 18);

  container.innerHTML = `<div class="view-root">
    <div class="page-header">
      <div>
        <h1 class="page-title">Reading Analytics &amp; Maintenance</h1>
        <p class="page-subtitle">Insights from ${books.length} books across ${authMap.size} authors</p>
      </div>
    </div>

    <div class="grid-4" style="margin-bottom:1.1rem">
      <div class="kpi-card">
        <div class="kpi-value">${readBooks.length}</div>
        <div class="kpi-label">Books Read (${factualRead} Factual · ${readBooks.length - factualRead} Fiction)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${ownedUnread.length}</div>
        <div class="kpi-label">Owned TBR Backlog</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${abandonRate}%</div>
        <div class="kpi-label">Abandonment Rate (${abandonedBooks.length} books)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${books.length - missingPubYear.length}/${books.length}</div>
        <div class="kpi-label">Have Publication Year</div>
      </div>
    </div>

    <section class="card" style="margin-bottom:1.1rem">
      <h2 class="card-title">Books Read per Year</h2>
      ${renderYearlyChart(readBooks)}
    </section>

    <div class="grid-2" style="margin-bottom:1.1rem">
      <section class="card">
        <h2 class="card-title">Recommenders (${recList.length})</h2>
        ${
          recList.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Recommended By</th><th class="num">Total</th><th class="num">Read</th><th class="num">Abandoned</th></tr></thead>
                <tbody>
                  ${recList
                    .map(
                      (r) => `<tr>
                        <td><a href="#/books?recommender=${encodeURIComponent(r.name)}">${esc(r.name)}</a></td>
                        <td class="num">${r.total}</td>
                        <td class="num">${r.read}</td>
                        <td class="num">${r.abandoned}</td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table></div>`
            : `<p class="muted">No recommenders recorded yet.</p>`
        }
      </section>

      <section class="card">
        <h2 class="card-title">Most Read Authors</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Author</th><th class="num">Read</th><th class="num">Total in DB</th></tr></thead>
          <tbody>
            ${topAuthors
              .map(
                (a) => `<tr>
                  <td><a href="#/books?q=${encodeURIComponent(a.author)}">${esc(a.author)}</a></td>
                  <td class="num">${a.read}</td>
                  <td class="num">${a.total}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table></div>
      </section>
    </div>

    <div class="grid-2" style="margin-bottom:1.1rem">
      <section class="card">
        <h2 class="card-title">Lent Out (${lentBooks.length}) &amp; Read Again (${readAgain.length})</h2>
        ${
          lentBooks.length
            ? `<p style="margin-top:0"><strong>Lent out:</strong> ${lentBooks
                .map((b) => `<a href="#" data-edit-book="${esc(b.id)}">${esc(b.title)}</a> (${esc(b.lent_to)})`)
                .join(', ')}</p>`
            : ''
        }
        ${
          readAgain.length
            ? `<div class="muted" style="font-size:0.88rem"><strong>Marked READ AGAIN:</strong> ${readAgain
                .map((b) => `<a href="#" data-edit-book="${esc(b.id)}">${esc(b.title)}</a>`)
                .join(' · ')}</div>`
            : ''
        }
      </section>

      <section class="card">
        <h2 class="card-title">Legacy <code>amzn.eu</code> Links (${unresolvedEu.length})</h2>
        <p class="muted" style="margin-top:0;font-size:0.86rem">
          Books that still use short <code>amzn.eu</code> codes without a 10-character <code>/dp/ASIN</code>. Open the link and paste the resolved <code>amazon.co.uk/dp/...</code> URL in Edit.
        </p>
        <div style="max-height:200px;overflow-y:auto">
          ${
            unresolvedEu.length
              ? unresolvedEu
                  .map((b) => {
                    const url = amazonUrl(b);
                    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.3rem 0;border-bottom:1px solid var(--border);font-size:0.85rem">
                      <span>${esc(b.author)} — <strong>${esc(b.title)}</strong></span>
                      <span style="white-space:nowrap">
                        ${url ? `<a class="btn btn-xs" href="${esc(url)}" target="_blank" rel="noopener">amzn.eu ↗</a>` : ''}
                        <button class="btn btn-ghost btn-xs" data-edit-book="${esc(b.id)}">Edit</button>
                      </span>
                    </div>`;
                  })
                  .join('')
              : `<div class="muted">All books have canonical DP ASINs!</div>`
          }
        </div>
      </section>
    </div>

    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.6rem">
        <div>
          <h2 class="card-title" style="margin:0">Books Missing Publication Year (${missingPubYear.length})</h2>
          <div class="muted" style="font-size:0.85rem">Click Lookup to query Open Library / Google Books directly from your browser.</div>
        </div>
        ${missingPubYear.length ? `<button id="btn-batch-pubyear" class="btn btn-sm" type="button">Lookup First 15 Automatically</button>` : ''}
      </div>
      <div style="max-height:280px;overflow-y:auto">
        ${
          missingPubYear.length
            ? missingPubYear
                .slice(0, 80)
                .map((b) => {
                  const directUrl = amazonUrl(b);
                  const amzHref =
                    directUrl ||
                    `https://www.amazon.co.uk/s?k=${encodeURIComponent(`${b.title || ''} ${b.author || ''}`.trim())}`;
                  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.35rem 0;border-bottom:1px solid var(--border);font-size:0.86rem;gap:0.5rem">
                    <span>${esc(b.author)} — <strong>${esc(b.title)}</strong></span>
                    <span style="white-space:nowrap;display:inline-flex;align-items:center;gap:0.35rem">
                      <button class="btn btn-xs" data-lookup-pub="${esc(b.id)}">Lookup Year</button>
                      <a class="btn btn-xs" href="${esc(amzHref)}" target="_blank" rel="noopener" title="${esc(directUrl ? 'Open Amazon UK book page' : 'Search for this book on Amazon UK')}">Amazon ↗</a>
                      <input
                        class="input"
                        type="number"
                        min="1400"
                        max="2100"
                        step="1"
                        placeholder="Year"
                        aria-label="Publication year for ${esc(b.title)}"
                        data-pubyear-input="${esc(b.id)}"
                        style="width:78px;padding:0.2rem 0.4rem;font-size:0.82rem"
                      />
                      <button class="btn btn-primary btn-xs" type="button" data-save-pubyear="${esc(b.id)}">Update</button>
                    </span>
                  </div>`;
                })
                .join('')
            : `<div class="muted">Every book has a publication year!</div>`
        }
      </div>
    </section>
  </div>`;

  const root = container.firstElementChild;

  const saveInlinePubYear = (id) => {
    const inp = [...root.querySelectorAll('[data-pubyear-input]')].find((el) => el.dataset.pubyearInput === id);
    const raw = inp?.value.trim() || '';
    const year = Number(raw);
    if (!/^\d{4}$/.test(raw) || year < 1400 || year > 2100) {
      ctx.toast('Enter a valid 4-digit publication year (1400–2100).', 'error');
      inp?.focus();
      return;
    }
    const b = store.getBook(id);
    if (!b) return;
    store.saveBook({ pub_year: year, pub_year_source: 'manual', pub_year_confidence: 'exact' }, id);
    ctx.toast(`Saved ${year} for "${b.title}"`, 'ok');
  };

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const inp = e.target.closest('[data-pubyear-input]');
    if (!inp) return;
    e.preventDefault();
    saveInlinePubYear(inp.dataset.pubyearInput);
  });

  root.addEventListener('click', async (e) => {
    const editEl = e.target.closest('[data-edit-book]');
    if (editEl) {
      e.preventDefault();
      ctx.openBookModal(editEl.dataset.editBook);
      return;
    }

    const saveBtn = e.target.closest('[data-save-pubyear]');
    if (saveBtn) {
      saveInlinePubYear(saveBtn.dataset.savePubyear);
      return;
    }

    const lookupBtn = e.target.closest('[data-lookup-pub]');
    if (lookupBtn) {
      const id = lookupBtn.dataset.lookupPub;
      const b = store.getBook(id);
      if (!b) return;
      lookupBtn.disabled = true;
      lookupBtn.textContent = 'Searching…';
      const hit = await lookupPubYearForBook(b.title, b.author);
      if (hit) {
        store.saveBook({ pub_year: hit.pub_year, pub_year_source: hit.source, pub_year_confidence: 'medium' }, id);
        ctx.toast(`Found ${hit.pub_year} for "${b.title}"`, 'ok');
      } else {
        lookupBtn.textContent = 'Not found';
        ctx.toast(`No publication year found for "${b.title}"`, 'error');
      }
    }
  });

  root.querySelector('#btn-batch-pubyear')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const targets = missingPubYear.slice(0, 15);
    let found = 0;
    for (let i = 0; i < targets.length; i += 1) {
      btn.textContent = `Looking up ${i + 1}/${targets.length}…`;
      const b = targets[i];
      const hit = await lookupPubYearForBook(b.title, b.author);
      if (hit) {
        store.saveBook({ pub_year: hit.pub_year, pub_year_source: hit.source, pub_year_confidence: 'medium' }, b.id);
        found += 1;
      }
    }
    ctx.toast(`Found publication years for ${found} of ${targets.length} books`, found ? 'ok' : 'error');
    renderStats(container, ctx);
  });
}
