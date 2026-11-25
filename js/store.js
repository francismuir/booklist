import { fetchLibraryFromGithub, saveLibraryToGithub } from './github.js';
import { generateId, nowIsoUtc, slugify, todayIso } from './utils.js';

const LS_DATA_KEY = 'booklist_library_v1';
const LS_META_KEY = 'booklist_meta_v1';
const LS_GH_KEY = 'booklist_github_cfg_v1';
const LS_THEME_KEY = 'booklist_theme_v1';
export const DEFAULT_AMAZON_WISHLIST_URL =
  'https://www.amazon.co.uk/hz/wishlist/ls/12LA6VRK0EH8U?type=wishlist&filter=unpurchased&sort=price-asc&viewType=list';

class LibraryStore extends EventTarget {
  constructor() {
    super();
    this.data = { schema_version: 1, updated_at: nowIsoUtc(), series: [], books: [] };
    this.mode = 'demo'; // 'github' | 'local_file' | 'local_draft' | 'demo'
    this.syncState = 'idle'; // 'idle' | 'synced' | 'dirty' | 'syncing' | 'error'
    this.syncError = null;
    this.dirty = false;
    this.githubSha = null;
    this.githubConfig = this.loadGithubConfig();
  }

  emitChange() {
    this.dispatchEvent(new CustomEvent('change'));
  }

  loadGithubConfig() {
    try {
      const raw = localStorage.getItem(LS_GH_KEY);
      return raw ? JSON.parse(raw) : { owner: '', repo: '', branch: 'main', path: 'library.json', token: '', autoSave: false };
    } catch {
      return { owner: '', repo: '', branch: 'main', path: 'library.json', token: '', autoSave: false };
    }
  }

  saveGithubConfig(cfg) {
    this.githubConfig = { ...this.githubConfig, ...cfg };
    localStorage.setItem(LS_GH_KEY, JSON.stringify(this.githubConfig));
    this.emitChange();
  }

  hasGithubCredentials() {
    const c = this.githubConfig;
    return Boolean(c?.owner && c?.repo && c?.token);
  }

  getTheme() {
    return localStorage.getItem(LS_THEME_KEY) || 'light';
  }

  setTheme(theme) {
    localStorage.setItem(LS_THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }

  persistLocal(dirty = this.dirty) {
    this.dirty = dirty;
    this.data.updated_at = nowIsoUtc();
    localStorage.setItem(LS_DATA_KEY, JSON.stringify(this.data));
    localStorage.setItem(
      LS_META_KEY,
      JSON.stringify({
        mode: this.mode,
        dirty: this.dirty,
        githubSha: this.githubSha,
      })
    );
    if (this.hasGithubCredentials()) {
      this.syncState = this.dirty ? 'dirty' : 'synced';
    } else {
      this.syncState = this.dirty ? 'dirty' : 'idle';
    }
    this.emitChange();

    if (this.dirty && this.hasGithubCredentials() && this.githubConfig.autoSave) {
      this.scheduleAutoPush();
    }
  }

  scheduleAutoPush() {
    clearTimeout(this._autoTimer);
    this._autoTimer = setTimeout(() => {
      this.pushToGithub().catch(() => {});
    }, 1500);
  }

  async init() {
    this.setTheme(this.getTheme());

    let cachedData = null;
    let cachedMeta = null;
    try {
      const rawD = localStorage.getItem(LS_DATA_KEY);
      const rawM = localStorage.getItem(LS_META_KEY);
      if (rawD) cachedData = JSON.parse(rawD);
      if (rawM) cachedMeta = JSON.parse(rawM);
    } catch {
      // ignore corrupted cache
    }

    if (this.hasGithubCredentials()) {
      if (cachedData) {
        this.data = cachedData;
        this.githubSha = cachedMeta?.githubSha || null;
        this.dirty = Boolean(cachedMeta?.dirty);
        this.mode = 'github';
        this.syncState = this.dirty ? 'dirty' : 'syncing';
        this.emitChange();
      }
      if (!this.dirty) {
        await this.pullFromGithub({ silent: true });
      }
      return;
    }

    if (cachedData && cachedMeta?.mode !== 'demo') {
      this.data = cachedData;
      this.mode = cachedMeta?.mode || 'local_draft';
      this.dirty = Boolean(cachedMeta?.dirty);
      this.syncState = this.dirty ? 'dirty' : 'idle';
      this.emitChange();
      return;
    }

    // Try local Data/library.json when running locally (e.g., localhost)
    try {
      const res = await fetch('./Data/library.json', { cache: 'no-store' });
      if (res.ok) {
        this.data = await res.json();
        this.mode = 'local_file';
        this.dirty = false;
        this.syncState = 'idle';
        this.emitChange();
        return;
      }
    } catch {
      // ignore
    }

    // Fallback to assets/sample-library.json for first-time GitHub Pages visitors
    try {
      const res = await fetch('./assets/sample-library.json', { cache: 'no-store' });
      if (res.ok) {
        this.data = await res.json();
        this.mode = 'demo';
        this.dirty = false;
        this.syncState = 'idle';
        this.emitChange();
      }
    } catch {
      this.emitChange();
    }
  }

  async pullFromGithub({ silent = false } = {}) {
    if (!this.hasGithubCredentials()) throw new Error('GitHub repo credentials are not configured.');
    this.syncState = 'syncing';
    this.syncError = null;
    this.emitChange();
    try {
      const { data, sha } = await fetchLibraryFromGithub(this.githubConfig);
      this.data = data;
      this.githubSha = sha;
      this.mode = 'github';
      this.dirty = false;
      this.syncState = 'synced';
      this.persistLocal(false);
      return data;
    } catch (err) {
      this.syncState = 'error';
      this.syncError = err.message;
      this.emitChange();
      if (!silent) throw err;
      return null;
    }
  }

  async pushToGithub(message) {
    if (!this.hasGithubCredentials()) throw new Error('GitHub repo credentials are not configured.');
    this.syncState = 'syncing';
    this.syncError = null;
    this.emitChange();
    try {
      const { sha } = await saveLibraryToGithub(
        this.githubConfig,
        this.data,
        this.githubSha,
        message || `Update library (${this.data.books.length} books)`
      );
      if (sha) this.githubSha = sha;
      this.mode = 'github';
      this.dirty = false;
      this.syncState = 'synced';
      this.persistLocal(false);
      return sha;
    } catch (err) {
      this.syncState = 'error';
      this.syncError = err.message;
      this.emitChange();
      throw err;
    }
  }

  replaceAllData(newData, mode = 'local_draft') {
    if (!newData || !Array.isArray(newData.books) || !Array.isArray(newData.series)) {
      throw new Error('Invalid library JSON format (expected "books" and "series" arrays).');
    }
    this.data = newData;
    this.mode = mode;
    this.persistLocal(true);
  }

  async resetToLocalOrDemo() {
    localStorage.removeItem(LS_DATA_KEY);
    localStorage.removeItem(LS_META_KEY);
    this.dirty = false;
    this.githubSha = null;
    await this.init();
  }

  getSeriesMap() {
    return new Map(this.data.series.map((s) => [s.id, s]));
  }

  getBook(id) {
    return this.data.books.find((b) => b.id === id) || null;
  }

  ensureSeriesByName(name, parentSeriesId = null, authorDefault = null) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const existing = this.data.series.find((s) => s.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;
    const created = {
      id: `ser_${slugify(clean)}_${Math.random().toString(36).slice(2, 5)}`,
      name: clean,
      parent_series_id: parentSeriesId || null,
      author_default: authorDefault || null,
    };
    this.data.series.push(created);
    this.data.series.sort((a, b) => a.name.localeCompare(b.name));
    return created;
  }

  createSeries({ name, parentSeriesId = null, authorDefault = null }) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Series name is required.');
    const existing = this.data.series.find((s) => s.name.toLowerCase() === clean.toLowerCase());
    if (existing) throw new Error(`Series "${existing.name}" already exists.`);
    const created = {
      id: `ser_${slugify(clean)}_${Math.random().toString(36).slice(2, 5)}`,
      name: clean,
      parent_series_id: parentSeriesId || null,
      author_default: authorDefault ? String(authorDefault).trim() : null,
    };
    this.data.series.push(created);
    this.data.series.sort((a, b) => a.name.localeCompare(b.name));
    this.persistLocal(true);
    return created;
  }

  attachBooksToSeries(seriesId, assignments) {
    if (!seriesId || !Array.isArray(assignments)) return 0;
    let count = 0;
    for (const { bookId, seriesOrder } of assignments) {
      const b = this.getBook(bookId);
      if (!b) continue;
      b.series_id = seriesId;
      b.series_order = seriesOrder ?? null;
      count += 1;
    }
    if (count > 0) this.persistLocal(true);
    return count;
  }

  getAmazonWishlistUrl() {
    return this.data.meta?.amazon_wishlist_url || DEFAULT_AMAZON_WISHLIST_URL;
  }

  setAmazonWishlistUrl(url) {
    const clean = String(url || '').trim();
    this.data.meta = {
      ...(this.data.meta || {}),
      amazon_wishlist_url: clean || DEFAULT_AMAZON_WISHLIST_URL,
    };
    this.persistLocal(true);
  }

  bulkSetTargetPrice(price, { scope = 'wishlist_library', onlyBlank = false } = {}) {
    const targetVal =
      price === null || price === undefined || price === ''
        ? null
        : Math.round(Number(price) * 100) / 100;
    if (targetVal !== null && (Number.isNaN(targetVal) || targetVal < 0)) {
      throw new Error('Target price must be 0 or greater.');
    }
    let count = 0;
    for (const b of this.data.books) {
      if (scope === 'wishlist_library' && !(b.ownership === 'not_owned' && b.list_scope === 'library')) continue;
      if (scope === 'wishlist_all' && b.ownership !== 'not_owned') continue;
      if (onlyBlank && targetVal !== null && b.target_price !== null && b.target_price !== undefined) continue;
      b.target_price = targetVal;
      count += 1;
    }
    if (count > 0) this.persistLocal(true);
    return count;
  }

  saveBook(payload, existingId = null) {
    const now = nowIsoUtc();
    if (existingId) {
      const idx = this.data.books.findIndex((b) => b.id === existingId);
      if (idx === -1) throw new Error('Book not found');
      const prev = this.data.books[idx];
      const next = { ...prev, ...payload };

      if (payload.current_price !== undefined && payload.current_price !== prev.current_price && payload.current_price !== null) {
        next.price_checked_at = now;
        next.price_history = [...(prev.price_history || []), { price: payload.current_price, checked_at: now }];
      }
      this.data.books[idx] = next;
      this.persistLocal(true);
      return next;
    }

    const created = {
      id: generateId('bk'),
      title: '',
      author: '',
      pub_year: null,
      pub_year_source: 'manual',
      pub_year_confidence: 'exact',
      is_factual: false,
      list_scope: 'library',
      ownership: 'not_owned',
      source: 'kindle',
      status: 'unread',
      date_read: null,
      reading_sessions: [],
      series_id: null,
      series_order: null,
      amazon_asin: null,
      amazon_legacy_code: null,
      current_price: null,
      target_price: null,
      price_checked_at: null,
      price_history: [],
      category: null,
      recommended_by: null,
      lent_to: null,
      abandon_reason: null,
      notes: '',
      ...payload,
    };
    if (created.current_price !== null && created.current_price !== undefined) {
      created.price_checked_at = now;
      created.price_history = [{ price: created.current_price, checked_at: now }];
    }
    if (created.status === 'read' && !created.reading_sessions.length) {
      created.reading_sessions = [{ started_at: null, finished_at: created.date_read || todayIso(), outcome: 'finished', note: '' }];
    } else if (created.status === 'reading' && !created.reading_sessions.length) {
      created.reading_sessions = [{ started_at: todayIso(), finished_at: null, outcome: 'reading', note: '' }];
    }
    this.data.books.push(created);
    this.persistLocal(true);
    return created;
  }

  deleteBook(id) {
    this.data.books = this.data.books.filter((b) => b.id !== id);
    this.persistLocal(true);
  }

  startReading(id) {
    const b = this.getBook(id);
    if (!b) return;
    b.status = 'reading';
    b.list_scope = 'library';
    if (b.ownership === 'not_owned') b.ownership = 'owned';
    b.reading_sessions = [...(b.reading_sessions || []), { started_at: todayIso(), finished_at: null, outcome: 'reading', note: '' }];
    this.persistLocal(true);
  }

  markRead(id, finishedDate = todayIso()) {
    const b = this.getBook(id);
    if (!b) return;
    b.status = 'read';
    b.list_scope = 'library';
    if (b.ownership === 'not_owned') b.ownership = 'owned';
    if (!b.date_read) b.date_read = finishedDate;
    const sessions = [...(b.reading_sessions || [])];
    const open = sessions.findLast((s) => s.outcome === 'reading');
    if (open) {
      open.outcome = 'finished';
      open.finished_at = finishedDate;
    } else {
      sessions.push({ started_at: null, finished_at: finishedDate, outcome: 'finished', note: '' });
    }
    b.reading_sessions = sessions;
    this.persistLocal(true);
  }

  markAbandoned(id, reason = '') {
    const b = this.getBook(id);
    if (!b) return;
    b.status = 'abandoned';
    b.list_scope = 'library';
    if (reason) b.abandon_reason = reason;
    const sessions = [...(b.reading_sessions || [])];
    const open = sessions.findLast((s) => s.outcome === 'reading');
    if (open) {
      open.outcome = 'abandoned';
      open.finished_at = todayIso();
      if (reason) open.note = reason;
    } else {
      sessions.push({ started_at: null, finished_at: todayIso(), outcome: 'abandoned', note: reason });
    }
    b.reading_sessions = sessions;
    this.persistLocal(true);
  }

  markBought(id) {
    const b = this.getBook(id);
    if (!b) return;
    b.ownership = 'owned';
    b.list_scope = 'library';
    this.persistLocal(true);
  }

  promoteToLibrary(id) {
    const b = this.getBook(id);
    if (!b) return;
    b.list_scope = 'library';
    this.persistLocal(true);
  }

  applyPriceUpdates(updates) {
    const now = nowIsoUtc();
    let count = 0;
    for (const u of updates) {
      const b = this.getBook(u.bookId);
      if (!b) continue;
      const changed = b.current_price !== u.newPrice;
      b.current_price = u.newPrice;
      b.price_checked_at = now;
      if (changed || !(b.price_history || []).length) {
        b.price_history = [...(b.price_history || []), { price: u.newPrice, checked_at: now }];
      }
      count += 1;
    }
    if (count > 0) this.persistLocal(true);
    return count;
  }
}

export const store = new LibraryStore();
