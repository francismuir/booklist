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
  s = s.replace(/\s*\|\s*Format:.*$/i, '');
  s = s.replace(/\s*\((?:Author|Kindle Edition|Paperback|Hardcover|Audio[^)]*|Edition)\)\s*/gi, ' ');
  return s.replace(/\s+/g, ' ').trim();
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
  const s = String(str || '');
  const m = s.match(/\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing)\/([A-Z0-9]{10})/i);
  if (m) return m[1].toUpperCase();
  const paramMatch = s.match(/ASIN:([A-Z0-9]{10})/i);
  if (paramMatch) return paramMatch[1].toUpperCase();
  const direct = s.trim().match(/\b([A-Z0-9]{10})\b/);
  return direct ? direct[1].toUpperCase() : null;
}

/** Normalize title down to its core base title (strips apostrophes, parentheticals, subtitles). */
export function baseTitleNorm(title) {
  let s = normText(title);
  s = s.replace(/['’‘]/g, '');
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  s = s.split(/:|\s+-\s+|\s+—\s+/)[0];
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function surnameNorm(author) {
  const cleaned = cleanAuthorByline(author);
  const s = normText(cleaned).replace(/['’‘]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
  if (!s) return '';
  const parts = s.split(/\s+/);
  return parts[parts.length - 1];
}

function authorsCompatible(bookAuthor, itemAuthor, requireBoth = false) {
  const s1 = surnameNorm(bookAuthor);
  const s2 = surnameNorm(itemAuthor);
  if (!s1 || !s2) return !requireBoth;
  return s1 === s2 || normText(bookAuthor).includes(s2) || normText(itemAuthor).includes(s1);
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
    const blocks = text.includes('data-itemid')
      ? text.split(/<li\b[^>]*data-itemid=/i).slice(1)
      : text.split(/id=["']itemName_/i).slice(1);

    for (const blk of blocks) {
      const slice = blk.slice(0, 12000);
      const linkMatch =
        slice.match(/<a[^>]*id=["']itemName_[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
        slice.match(/<a[^>]*href=["']([^"']*\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing)\/[A-Z0-9]{10}[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>/i) ||
        slice.match(/<a[^>]*href=["']([^"']*\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing)\/[A-Z0-9]{10}[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);

      let asin = null;
      let title = '';
      if (linkMatch) {
        asin = extractAsinFromText(linkMatch[1]);
        title = stripTags(linkMatch[2]);
      }
      if (!title) {
        const titleOnlyMatch = slice.match(/<[^>]*id=["']itemName_[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
        if (titleOnlyMatch) title = stripTags(titleOnlyMatch[1]);
      }
      if (!asin) {
        asin = extractAsinFromText(slice);
      }
      if (!asin && !title) continue;

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
 * Uses symmetric 4-tier matching: ASIN -> exact title -> base title + author -> safe prefix + explicit author.
 */
export function compareAmazonWishlist(amazonItems, appBooks) {
  const appWishlist = appBooks.filter((b) => b.ownership === 'not_owned' && b.list_scope === 'library');

  const appWishlistByAsin = new Map();
  for (const b of appWishlist) {
    const aid = amazonDisplayId(b).toUpperCase();
    if (aid && /^[A-Z0-9]{10}$/.test(aid)) {
      if (!appWishlistByAsin.has(aid)) appWishlistByAsin.set(aid, []);
      appWishlistByAsin.get(aid).push(b);
    }
  }

  const allByAsin = new Map();
  const allByTitle = new Map();
  const allByBaseTitle = new Map();
  for (const b of appBooks) {
    const aid = amazonDisplayId(b).toUpperCase();
    if (aid && /^[A-Z0-9]{10}$/.test(aid)) {
      if (!allByAsin.has(aid)) allByAsin.set(aid, []);
      allByAsin.get(aid).push(b);
    }
    const tKey = normText(b.title);
    if (tKey && !allByTitle.has(tKey)) allByTitle.set(tKey, b);
    const btKey = baseTitleNorm(b.title);
    if (btKey) {
      if (!allByBaseTitle.has(btKey)) allByBaseTitle.set(btKey, []);
      allByBaseTitle.get(btKey).push(b);
    }
  }

  const matchedBookIds = new Set();
  const missingFromApp = [];
  const matched = [];
  const priceChanges = [];
  const asinUpdates = [];

  for (const item of amazonItems) {
    let appWishBook = null;

    // Tier 1: Exact ASIN match
    if (item.asin) {
      const hits = (appWishlistByAsin.get(item.asin) || []).filter((b) => !matchedBookIds.has(b.id));
      if (hits.length) appWishBook = hits[0];
    }

    // Tier 2: Exact normalized title
    if (!appWishBook && item.title) {
      const tNorm = normText(item.title);
      appWishBook = appWishlist.find((b) => !matchedBookIds.has(b.id) && normText(b.title) === tNorm) || null;
    }

    // Tier 3: Base title + compatible author surname
    const btNorm = item.title ? baseTitleNorm(item.title) : '';
    if (!appWishBook && btNorm) {
      appWishBook =
        appWishlist.find(
          (b) =>
            !matchedBookIds.has(b.id) &&
            baseTitleNorm(b.title) === btNorm &&
            authorsCompatible(b.author, item.author)
        ) || null;
    }

    // Tier 4: Safe prefix match (min 6 chars) with explicit matching author surname on both sides
    if (!appWishBook && btNorm.length >= 6 && surnameNorm(item.author)) {
      appWishBook =
        appWishlist.find((b) => {
          if (matchedBookIds.has(b.id)) return false;
          const bBase = baseTitleNorm(b.title);
          if (bBase.length < 6) return false;
          if (!authorsCompatible(b.author, item.author, true)) return false;
          return btNorm.startsWith(bBase + ' ') || bBase.startsWith(btNorm + ' ');
        }) || null;
    }

    if (appWishBook) {
      matchedBookIds.add(appWishBook.id);
      matched.push({ amazonItem: item, book: appWishBook });
      if (item.price !== null && item.price !== undefined && item.price !== appWishBook.current_price) {
        priceChanges.push({
          book: appWishBook,
          oldPrice: appWishBook.current_price,
          newPrice: item.price,
        });
      }
      if (item.asin && /^[A-Z0-9]{10}$/.test(item.asin) && item.asin !== appWishBook.amazon_asin) {
        asinUpdates.push({
          book: appWishBook,
          oldAsin: amazonDisplayId(appWishBook) || null,
          newAsin: item.asin,
        });
      }
      continue;
    }

    // Check if present elsewhere in appBooks (e.g. owned or series_backlog)
    const otherAsinHits = item.asin ? allByAsin.get(item.asin) || [] : [];
    let existingOther = otherAsinHits[0] || (item.title ? allByTitle.get(normText(item.title)) : null) || null;
    if (!existingOther && btNorm) {
      const btHits = allByBaseTitle.get(btNorm) || [];
      existingOther = btHits.find((b) => authorsCompatible(b.author, item.author)) || null;
    }

    missingFromApp.push({
      amazonItem: item,
      existingBook: existingOther,
    });
  }

  const missingFromAmazon = appWishlist.filter((b) => !matchedBookIds.has(b.id));

  return {
    appWishlistCount: appWishlist.length,
    amazonCount: amazonItems.length,
    missingFromAmazon,
    missingFromApp,
    matched,
    priceChanges,
    asinUpdates,
  };
}

export function getWishlistBookmarkletCode() {
  const fnBody = `(function(){var els=document.querySelectorAll('li[data-itemid]');if(!els.length){alert('Open your Amazon UK Wishlist and scroll down so items load first.');return;}var out=[];els.forEach(function(li){var a=li.querySelector('a[id^="itemName_"]')||li.querySelector('a[href*="/dp/"]')||li.querySelector('a[href*="/gp/"]');var href=a?(a.getAttribute('href')||''):'';var m=href.match(/\\/(?:dp|gp\\/product|gp\\/aw\\/d|gp\\/offer-listing)\\/([A-Z0-9]{10})/i);if(!m){var rp=li.getAttribute('data-reposition-action-params')||'';m=rp.match(/ASIN:([A-Z0-9]{10})/i);}var titleEl=a||li.querySelector('[id^="itemName_"]');var title=titleEl?(titleEl.getAttribute('title')||titleEl.textContent||'').replace(/\\s+/g,' ').trim():'';if(!m&&!title)return;var by=li.querySelector('[id^="item-byline-"]');var dp=li.getAttribute('data-price');var pr=dp?parseFloat(dp):null;if(pr===null||isNaN(pr)){var pe=li.querySelector('.a-price .a-offscreen');if(pe){var pm=pe.textContent.replace(/,/g,'').match(/(\\d+(?:\\.\\d{1,2})?)/);if(pm)pr=parseFloat(pm[1]);}}out.push({asin:m?m[1].toUpperCase():'',title:title,author:by?by.textContent.replace(/^by\\s+/i,'').replace(/\\s*\\|\\s*Format:.*$/i,'').replace(/\\s*\\([^)]*(?:Edition|Author)[^)]*\\)/gi,'').trim():'',price:pr});});var json=JSON.stringify(out);if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(json).then(function(){alert('Copied '+out.length+' wishlist items! Paste them into BookList Compare.');},function(){window.prompt('Copy this JSON ('+out.length+' items):',json);});}else{window.prompt('Copy this JSON ('+out.length+' items):',json);}})();`;
  return 'javascript:' + encodeURIComponent(fnBody);
}
