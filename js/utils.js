export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPrice(price) {
  if (price === null || price === undefined || price === '') return '—';
  const n = Number(price);
  if (Number.isNaN(n)) return '—';
  return `£${n.toFixed(2)}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowIsoUtc() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function authorSurname(author) {
  const s = String(author || '').trim();
  if (!s) return '';
  const parts = s.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

export function sortableTitle(title, ignoreArticles = true) {
  const s = String(title || '').trim();
  if (!ignoreArticles) return s;
  return s.replace(/^(?:the|a|an)\s+/i, '').trim() || s;
}

export function normText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function amazonUrl(book) {
  if (!book) return null;
  if (book.amazon_asin) {
    return `https://www.amazon.co.uk/dp/${encodeURIComponent(book.amazon_asin)}`;
  }
  if (book.amazon_legacy_code) {
    return `https://amzn.eu/${encodeURIComponent(book.amazon_legacy_code)}`;
  }
  return null;
}

export function amazonDisplayId(book) {
  if (!book) return '';
  return book.amazon_asin || book.amazon_legacy_code || '';
}

export function parseAmazonInput(raw) {
  let s = String(raw || '').trim();
  // Strip surrounding quotes/commas when pasting directly from JSON
  s = s.replace(/^["'\s,]+|["'\s,]+$/g, '');
  if (!s) return { asin: null, legacy: null };
  // Direct 10-char ASIN
  if (/^[A-Z0-9]{10}$/i.test(s)) {
    return { asin: s.toUpperCase(), legacy: null };
  }
  // 9-digit ISBN/ASIN
  if (/^\d{9}$/.test(s)) {
    return { asin: s.padStart(10, '0'), legacy: null };
  }
  // URL containing /dp/, /gp/product/, /gp/aw/d/, or /gp/offer-listing/
  const dpMatch = s.match(/\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing)\/([A-Z0-9]{10})/i);
  if (dpMatch) {
    return { asin: dpMatch[1].toUpperCase(), legacy: null };
  }
  // ASIN:B00... format
  const paramMatch = s.match(/ASIN:([A-Z0-9]{10})/i);
  if (paramMatch) {
    return { asin: paramMatch[1].toUpperCase(), legacy: null };
  }
  // amzn.eu/<code>
  const euMatch = s.match(/amzn\.eu\/(?:d\/)?([A-Za-z0-9]+)/i);
  if (euMatch) {
    return { asin: null, legacy: euMatch[1] };
  }
  return { asin: null, legacy: null };
}

export function generateId(prefix = 'bk') {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'series';
}

export function debounce(fn, ms = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function statusLabel(status) {
  const map = {
    unread: 'Unread',
    up_next: 'Up Next',
    reading: 'Reading',
    read: 'Read',
    abandoned: 'Abandoned',
  };
  return map[status] || status;
}

export function sourceLabel(source) {
  const map = {
    kindle: 'Kindle',
    google_books: 'Google Books',
    humble_bundle: 'Humble Bundle',
    physical: 'Physical',
    other: 'Other',
  };
  return map[source] || source || 'Kindle';
}
