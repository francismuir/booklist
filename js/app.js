import { store } from './store.js';
import { openBookModal } from './views/bookModal.js';
import { applyBooksRouteParams, renderBooks } from './views/books.js';
import { renderDashboard } from './views/dashboard.js';
import { renderSeries } from './views/series.js';
import { renderSettings } from './views/settings.js';
import { renderStats } from './views/stats.js';
import { renderWishlist } from './views/wishlist.js';

const mainEl = document.getElementById('app-main');
const syncPill = document.getElementById('btn-sync-github');
const modeBanner = document.getElementById('mode-banner');
const toastRoot = document.getElementById('toast-root');

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const params = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { path, params };
}

function updateNavHighlight(path) {
  document.querySelectorAll('#top-nav a, #mobile-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === path);
  });
}

function updateSyncUi() {
  const labelEl = syncPill.querySelector('.sync-label');
  syncPill.classList.remove('state-synced', 'state-dirty', 'state-error', 'state-syncing');

  if (store.hasGithubCredentials()) {
    if (store.syncState === 'syncing') {
      syncPill.classList.add('state-syncing');
      labelEl.textContent = 'Syncing…';
    } else if (store.syncState === 'error') {
      syncPill.classList.add('state-error');
      labelEl.textContent = 'Sync Error';
    } else if (store.dirty) {
      syncPill.classList.add('state-dirty');
      labelEl.textContent = 'Save to GitHub';
    } else {
      syncPill.classList.add('state-synced');
      labelEl.textContent = 'Synced';
    }
  } else {
    if (store.dirty) {
      syncPill.classList.add('state-dirty');
      labelEl.textContent = 'Unsaved (Local)';
    } else {
      labelEl.textContent = store.mode === 'demo' ? 'Demo Data' : 'Local';
    }
  }

  if (store.mode === 'demo') {
    modeBanner.classList.remove('hidden');
    modeBanner.innerHTML = `
      <span>Showing sample demo data. Connect your private GitHub data repo or import <code>library.json</code> to use your own books.</span>
      <a class="btn btn-sm" href="#/settings">Open Sync &amp; Data</a>
    `;
  } else {
    modeBanner.classList.add('hidden');
    modeBanner.innerHTML = '';
  }
}

const ctx = {
  toast,
  openBookModal: (id = null, prefill = {}) =>
    openBookModal(id, prefill, () => renderCurrentRoute(), toast),
};

function renderCurrentRoute() {
  const { path, params } = parseHash();
  updateNavHighlight(path);
  updateSyncUi();

  switch (path) {
    case '/':
      renderDashboard(mainEl, ctx);
      break;
    case '/books':
      applyBooksRouteParams(params);
      renderBooks(mainEl, ctx);
      break;
    case '/series':
      renderSeries(mainEl, ctx);
      break;
    case '/wishlist':
      renderWishlist(mainEl, ctx);
      break;
    case '/stats':
      renderStats(mainEl, ctx);
      break;
    case '/settings':
      renderSettings(mainEl, ctx);
      break;
    default:
      renderDashboard(mainEl, ctx);
  }
}

document.getElementById('btn-add-book')?.addEventListener('click', () => {
  ctx.openBookModal(null);
});

document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
  const next = store.getTheme() === 'dark' ? 'light' : 'dark';
  store.setTheme(next);
});

syncPill?.addEventListener('click', async () => {
  if (store.hasGithubCredentials() && store.dirty) {
    try {
      await store.pushToGithub();
      toast('Saved changes to GitHub', 'ok');
    } catch (err) {
      toast(`Sync failed: ${err.message}`, 'error');
    }
  } else {
    window.location.hash = '#/settings';
  }
});

window.addEventListener('hashchange', renderCurrentRoute);
store.addEventListener('change', renderCurrentRoute);

store.init().then(renderCurrentRoute);
