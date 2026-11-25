import { amazonDisplayId, amazonUrl, normText } from './utils.js';

function csvCell(val) {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function serializeCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  // UTF-8 BOM for clean opening in Excel / Numbers
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** RFC 4180 CSV parser supporting BOM, quoted commas/newlines, and escaped quotes. */
export function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

export function exportPriceCheckCsv(books) {
  const headers = [
    'book_id',
    'amazon_id',
    'amazon_url',
    'author',
    'title',
    'current_price',
    'new_price',
  ];
  const sorted = [...books].sort((a, b) => a.title.localeCompare(b.title));
  const rows = sorted.map((b) => [
    b.id,
    amazonDisplayId(b),
    amazonUrl(b) || '',
    b.author,
    b.title,
    b.current_price !== null && b.current_price !== undefined ? Number(b.current_price).toFixed(2) : '',
    '',
  ]);
  return serializeCsv(headers, rows);
}

function parsePriceCell(raw) {
  if (raw === null || raw === undefined) return { empty: true, value: null };
  const s = String(raw).trim().replace(/[£$€,\s]/g, '').replace(/^GBP/i, '');
  if (!s) return { empty: true, value: null };
  const n = Number(s);
  if (Number.isNaN(n) || n < 0 || !Number.isFinite(n)) {
    return { empty: false, invalid: true, value: null, raw };
  }
  return { empty: false, invalid: false, value: Math.round(n * 100) / 100 };
}

/**
 * Parse uploaded price check CSV and match rows to books.
 * Accepts edits in `new_price` (preferred) or modified `current_price`/`price`.
 */
export function parsePriceCheckCsv(csvText, books) {
  const matrix = parseCsv(csvText);
  if (matrix.length < 2) {
    return { error: 'CSV must contain a header row and at least one data row.', items: [] };
  }

  const rawHeaders = matrix[0].map((h) => normText(h).replace(/\s+/g, '_'));
  const idx = {
    book_id: rawHeaders.findIndex((h) => h === 'book_id' || h === 'id'),
    amazon_id: rawHeaders.findIndex((h) => h === 'amazon_id' || h === 'asin' || h === 'amzn_id'),
    author: rawHeaders.findIndex((h) => h === 'author'),
    title: rawHeaders.findIndex((h) => h === 'title'),
    current_price: rawHeaders.findIndex((h) => h === 'current_price' || h === 'old_price'),
    new_price: rawHeaders.findIndex((h) => h === 'new_price' || h === 'price' || h === 'updated_price'),
  };

  if (idx.new_price === -1 && idx.current_price === -1) {
    return { error: 'CSV must include a "new_price" (or "price") column.', items: [] };
  }

  const byId = new Map(books.map((b) => [b.id, b]));
  const byAsin = new Map();
  for (const b of books) {
    const aid = amazonDisplayId(b).toUpperCase();
    if (aid) {
      if (!byAsin.has(aid)) byAsin.set(aid, []);
      byAsin.get(aid).push(b);
    }
  }
  const byAuthorTitle = new Map(
    books.map((b) => [`${normText(b.author)}||${normText(b.title)}`, b])
  );

  const items = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const row = matrix[r];
    const get = (i) => (i >= 0 && i < row.length ? String(row[i] ?? '').trim() : '');

    const rawBookId = get(idx.book_id);
    const rawAmzId = get(idx.amazon_id).toUpperCase();
    const rawAuthor = get(idx.author);
    const rawTitle = get(idx.title);

    // Determine entered price: prefer new_price if non-empty, else check if current_price changed
    const newParsed = idx.new_price >= 0 ? parsePriceCell(get(idx.new_price)) : { empty: true };
    const curParsed = idx.current_price >= 0 ? parsePriceCell(get(idx.current_price)) : { empty: true };

    let book = rawBookId ? byId.get(rawBookId) : null;
    if (!book && rawAuthor && rawTitle) {
      book = byAuthorTitle.get(`${normText(rawAuthor)}||${normText(rawTitle)}`);
    }
    if (!book && rawAmzId) {
      const candidates = byAsin.get(rawAmzId) || [];
      if (candidates.length === 1) {
        book = candidates[0];
      } else if (candidates.length > 1 && rawTitle) {
        book = candidates.find((c) => normText(c.title) === normText(rawTitle)) || null;
      }
    }

    if (!book) {
      if (!newParsed.empty) {
        items.push({
          rowNum: r + 1,
          kind: 'unmatched',
          author: rawAuthor,
          title: rawTitle,
          amazonId: rawAmzId,
          oldPrice: null,
          newPrice: newParsed.value,
          selected: false,
          reason: 'Could not match book in library',
        });
      }
      continue;
    }

    if (newParsed.invalid) {
      items.push({
        rowNum: r + 1,
        kind: 'invalid',
        book,
        author: book.author,
        title: book.title,
        amazonId: amazonDisplayId(book),
        oldPrice: book.current_price,
        newPrice: null,
        selected: false,
        reason: `Invalid price "${newParsed.raw}"`,
      });
      continue;
    }

    let candidate = null;
    if (!newParsed.empty) {
      candidate = newParsed.value;
    } else if (!curParsed.empty && !curParsed.invalid && curParsed.value !== book.current_price) {
      candidate = curParsed.value;
    }

    if (candidate === null) continue; // blank new_price -> skip silently

    const oldPrice = book.current_price;
    let kind = 'unchanged';
    if (oldPrice === null || oldPrice === undefined) {
      kind = 'new_price_set';
    } else if (candidate < oldPrice) {
      kind = 'drop';
    } else if (candidate > oldPrice) {
      kind = 'increase';
    }

    const hitTarget = book.target_price !== null && book.target_price !== undefined && candidate <= book.target_price;

    items.push({
      rowNum: r + 1,
      kind,
      book,
      author: book.author,
      title: book.title,
      amazonId: amazonDisplayId(book),
      oldPrice,
      newPrice: candidate,
      hitTarget,
      selected: kind !== 'unchanged',
      reason: kind === 'unchanged' ? 'Price unchanged (checked_at can still update if selected)' : '',
    });
  }

  return { error: null, items };
}

export function exportFullLibraryCsv(books, series) {
  const seriesMap = new Map(series.map((s) => [s.id, s]));
  const headers = [
    'id',
    'author',
    'title',
    'pub_year',
    'factual',
    'list_scope',
    'ownership',
    'source',
    'status',
    'date_read',
    'series',
    'series_order',
    'amazon_asin',
    'amazon_legacy_code',
    'current_price',
    'target_price',
    'category',
    'recommended_by',
    'lent_to',
    'notes',
  ];
  const rows = books.map((b) => [
    b.id,
    b.author,
    b.title,
    b.pub_year ?? '',
    b.is_factual ? '1' : '',
    b.list_scope,
    b.ownership,
    b.source,
    b.status,
    b.date_read ?? '',
    b.series_id ? seriesMap.get(b.series_id)?.name || '' : '',
    b.series_order ?? '',
    b.amazon_asin ?? '',
    b.amazon_legacy_code ?? '',
    b.current_price ?? '',
    b.target_price ?? '',
    b.category ?? '',
    b.recommended_by ?? '',
    b.lent_to ?? '',
    b.notes ?? '',
  ]);
  return serializeCsv(headers, rows);
}
