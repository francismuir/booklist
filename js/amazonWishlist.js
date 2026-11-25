import { amazonDisplayId, normText } from './utils.js';

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' '));
}

function cleanAuthorByline(raw) {
  let s = decodeHtmlEntities(raw);
  s = s.replace(/^by\s+/i, '');
  s = s.replace(/\s*\((?:Kindle Edition|Paperback|Hardcover|Audio[^)]*|Edition)\)\s*$/i, '');
  return s.trim();
}

function parsePriceValue(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : null;
  }
  const m = String(raw).replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function extractAsinFromText(str) {
  const m = String(str || '').match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (m) return m[1].toUpperCase();
  const direct = String(str || '').trim().match(/\b([A-Z0-9]{10})\b/);
  return direct ? direct[1].toUpperCase() : null;
}

function dedupeByAsin(items) {
  const byAsin = new Map();
  const extras = [];
  for (const it of items) {
    const asin = it.asin ? String(it.asin).toUpperCase() : null;
    if (asin && /^[A-Z0-9]{10}$/.test(asin)) {
      if (!byAsin.has(asin)) {
        byAsin.set(asin, { ...it, asin });
      }
    } else if (it.title) {
      extras.push({ ...it, asin: null });
    }
  }
  return [...byAsin.values(), ...extras];
}

/**
 * Parse Amazon UK wishlist input from:
 * 1) JSON exported by the bookmarklet
 * 2) Saved Amazon UK wishlist HTML ("Webpage, HTML Only")
 * 3) Plain text lines containing Amazon URLs or 10-char ASINs
 */
export function parseAmazonWishlistInput(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return { format: 'empty', items: [] };

  // 1. JSON format
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : null;
      if (arr) {
        const items = arr.map((row) => ({
          asin: extractAsinFromText(row.asin || row.url || row.href || ''),
          title: decodeHtmlEntities(row.title || ''),
          author: cleanAuthorByline(row.author || ''),
          price: parsePriceValue(row.price),
        }));
        return { format: 'json', items: dedupeByAsin(items) };
      }
    } catch {
      // fall through to HTML/text detection
    }
  }

  // 2. Saved Amazon Wishlist HTML
  if (/<(?:html|li|div|a)\b/i.test(text) && (text.includes('data-itemid') || text.includes('itemName_') || text.includes('/dp/'))) {
    const items = [];
    // Split on wishlist list items when present
    const blocks = text.includes('data-itemid')
      ? text.split(/<li\b[^>]*data-itemid=/i).slice(1)
      : text.split(/id=["']itemName_/i).slice(1);

    for (const blk of blocks) {
      // Limit block scan to avoid bleeding across unrelated markup
      const slice = blk.slice(0, 12000);
      const linkMatch =
        slice.match(/<a[^>]*id=["']itemName_[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
        slice.match(/<a[^>]*href=["']([^"']*\/(?:dp|gp\/product)\/[A-Z0-9]{10}[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>/i) ||
        slice.match(/<a[^>]*href=["']([^"']*\/(?:dp|gp\/product)\/[A-Z0-9]{10}[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);

      let asin = null;
      let title = '';
      if (linkMatch) {
        asin = extractAsinFromText(linkMatch[1]);
        title = stripTags(linkMatch[2]);
      } else {
        const dpMatch = slice.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        if (dpMatch) asin = dpMatch[1].toUpperCase();
      }
      if (!asin) continue;

      const bylineMatch = slice.match(/<span[^>]*id=["']item-byline-[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      const author = bylineMatch ? cleanAuthorByline(stripTags(bylineMatch[1])) : '';

      let price = null;
      const dataPriceMatch = slice.match(/data-price=["'](\d+(?:\.\d{1,2})?)["']/i);
      if (dataPriceMatch) {
        price = parsePriceValue(dataPriceMatch[1]);
      } else {
        const offscreenMatch = slice.match(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*£\s*(\d+(?:\.\d{1,2})?)/i);
        if (offscreenMatch) {
          price = parsePriceValue(offscreenMatch[1]);
        } else {
          const gbpMatch = slice.match(/£\s*(\d+\.\d{2})/);
          if (gbpMatch) price = parsePriceValue(gbpMatch[1]);
        }
      }

      items.push({ asin, title, author, price });
    }

    if (items.length) {
      return { format: 'html', items: dedupeByAsin(items) };
    }
  }

  // 3. Plain text / URLs / ASIN lines
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const asin = extractAsinFromText(trimmed);
    if (!asin) continue;
    const rest = trimmed
      .replace(/https?:\/\/\S+/gi, '')
      .replace(new RegExp(`\\b${asin}\\b`, 'i'), '')
      .replace(/^[\s\-|,]+|[\s\-|,]+$/g, '');
    items.push({ asin, title: rest, author: '', price: null });
  }
  return { format: 'text', items: dedupeByAsin(items) };
}

/**
 * Compare parsed Amazon wishlist items against the app's wishlist (not_owned + library).
 * Also checks allBooks so items already owned or in series_backlog are flagged clearly.
 */
export function compareAmazonWishlist(amazonItems, appBooks) {
  const appWishlist = appBooks.filter((b) => b.ownership === 'not_owned' && b.list_scope === 'library');
  const appWishlistByAsin = new Map();
  const allByAsin = new Map();
  const allByTitle = new Map();

  for (const b of appBooks) {
    const aid = amazonDisplayId(b).toUpperCase();
    if (aid && /^[A-Z0-9]{10}$/.test(aid)) {
      if (!allByAsin.has(aid)) allByAsin.set(aid, []);
      allByAsin.get(aid).push(b);
    }
    const tKey = normText(b.title);
    if (tKey && !allByTitle.has(tKey)) allByTitle.set(tKey, b);
  }

  for (const b of appWishlist) {
    const aid = amazonDisplayId(b).toUpperCase();
    if (aid && /^[A-Z0-9]{10}$/.test(aid)) {
      if (!appWishlistByAsin.has(aid)) appWishlistByAsin.set(aid, []);
      appWishlistByAsin.get(aid).push(b);
    }
  }

  const amazonAsins = new Set(amazonItems.map((i) => i.asin).filter(Boolean));
  const amazonTitles = new Set(amazonItems.map((i) => normText(i.title)).filter(Boolean));

  const missingFromAmazon = [];
  for (const b of appWishlist) {
    const aid = amazonDisplayId(b).toUpperCase();
    const matchedByAsin = aid && amazonAsins.has(aid);
    const matchedByTitle = !aid && amazonTitles.has(normText(b.title));
    if (!matchedByAsin && !matchedByTitle) {
      missingFromAmazon.push(b);
    }
  }

  const missingFromApp = [];
  const matched = [];
  const priceChanges = [];

  for (const item of amazonItems) {
    const wishlistHits = item.asin ? appWishlistByAsin.get(item.asin) || [] : [];
    let appWishBook = wishlistHits[0] || null;
    if (!appWishBook && item.title) {
      appWishBook = appWishlist.find((b) => normText(b.title) === normText(item.title)) || null;
    }

    if (appWishBook) {
      matched.push({ amazonItem: item, book: appWishBook });
      if (item.price !== null && item.price !== undefined && item.price !== appWishBook.current_price) {
        priceChanges.push({
          book: appWishBook,
          oldPrice: appWishBook.current_price,
          newPrice: item.price,
        });
      }
      continue;
    }

    const otherMatches = item.asin ? allByAsin.get(item.asin) || [] : [];
    const existingOther = otherMatches[0] || (item.title ? allByTitle.get(normText(item.title)) : null) || null;
    missingFromApp.push({
      amazonItem: item,
      existingBook: existingOther,
    });
  }

  return {
    appWishlistCount: appWishlist.length,
    amazonCount: amazonItems.length,
    missingFromAmazon,
    missingFromApp,
    matched,
    priceChanges,
  };
}

export function getWishlistBookmarkletCode() {
  const fnBody = `(function(){var els=document.querySelectorAll('li[data-itemid]');if(!els.length){alert('Open your Amazon UK Wishlist and scroll down so items load first.');return;}var out=[];els.forEach(function(li){var a=li.querySelector('a[id^="itemName_"]')||li.querySelector('a[href*="/dp/"]');if(!a)return;var m=(a.getAttribute('href')||'').match(/\\/(?:dp|gp\\/product)\\/([A-Z0-9]{10})/i);if(!m)return;var by=li.querySelector('[id^="item-byline-"]');var dp=li.getAttribute('data-price');var pr=dp?parseFloat(dp):null;if(pr===null||isNaN(pr)){var pe=li.querySelector('.a-price .a-offscreen');if(pe){var pm=pe.textContent.replace(/,/g,'').match(/(\\d+(?:\\.\\d{1,2})?)/);if(pm)pr=parseFloat(pm[1]);}}out.push({asin:m[1].toUpperCase(),title:(a.getAttribute('title')||a.textContent||'').replace(/\\s+/g,' ').trim(),author:by?by.textContent.replace(/^by\\s+/i,'').replace(/\\s*\\([^)]*Edition[^)]*\\)/i,'').trim():'',price:pr});});var json=JSON.stringify(out);if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(json).then(function(){alert('Copied '+out.length+' wishlist items! Paste them into BookList Compare.');},function(){window.prompt('Copy this JSON ('+out.length+' items):',json);});}else{window.prompt('Copy this JSON ('+out.length+' items):',json);}})();`;
  return 'javascript:' + encodeURIComponent(fnBody);
}
