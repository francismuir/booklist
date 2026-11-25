/** CORS-friendly Open Library & Google Books metadata lookup for the browser. */

export async function searchBookMetadata(query) {
  const q = String(query || '').trim();
  if (!q) return [];

  const results = [];
  try {
    const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=title,author_name,first_publish_year,key&limit=6`;
    const res = await fetch(olUrl);
    if (res.ok) {
      const json = await res.json();
      for (const doc of json.docs || []) {
        results.push({
          title: doc.title || '',
          author: (doc.author_name || [])[0] || '',
          pub_year: doc.first_publish_year || null,
          source: 'openlibrary',
        });
      }
    }
  } catch {
    // ignore network error and fall back to Google Books
  }

  if (results.length < 3) {
    try {
      const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books`;
      const res = await fetch(gbUrl);
      if (res.ok) {
        const json = await res.json();
        for (const item of json.items || []) {
          const info = item.volumeInfo || {};
          const yrMatch = String(info.publishedDate || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
          results.push({
            title: info.title || '',
            author: (info.authors || [])[0] || '',
            pub_year: yrMatch ? Number(yrMatch[1]) : null,
            source: 'google_books',
          });
        }
      }
    } catch {
      // ignore
    }
  }

  // Deduplicate similar title+author pairs
  const seen = new Set();
  return results.filter((r) => {
    const k = `${r.title.toLowerCase()}|${r.author.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return Boolean(r.title);
  });
}

export async function lookupPubYearForBook(title, author) {
  const cleanTitle = String(title || '').replace(/\s*\([^)]*\)\s*$/, '').split(':')[0].trim();
  const hits = await searchBookMetadata(`${cleanTitle} ${author || ''}`);
  const surname = String(author || '').trim().split(/\s+/).pop()?.toLowerCase() || '';
  const match = hits.find(
    (h) => h.pub_year && (!surname || h.author.toLowerCase().includes(surname))
  ) || hits.find((h) => h.pub_year);
  return match ? { pub_year: match.pub_year, source: match.source } : null;
}
