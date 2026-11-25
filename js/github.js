const API_BASE = 'https://api.github.com';

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64Utf8(b64) {
  const clean = b64.replace(/\n/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function encodePath(path) {
  return String(path || 'library.json')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

async function ghFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `GitHub API ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) msg = `${res.status}: ${body.message}`;
    } catch {
      // ignore
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function testGithubConnection(cfg) {
  const { owner, repo, branch = 'main', path = 'library.json', token } = cfg;
  if (!owner || !repo || !token) {
    throw new Error('Owner, repository, and Fine-Grained PAT are required.');
  }
  const repoInfo = await ghFetch(`${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
  let fileExists = false;
  let sha = null;
  try {
    const fileUrl = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
    const fileMeta = await ghFetch(fileUrl, token);
    fileExists = true;
    sha = fileMeta.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  return {
    fullName: repoInfo.full_name,
    isPrivate: repoInfo.private,
    fileExists,
    sha,
  };
}

export async function fetchLibraryFromGithub(cfg) {
  const { owner, repo, branch = 'main', path = 'library.json', token } = cfg;
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const meta = await ghFetch(url, token, { cache: 'no-store' });

  let rawText = '';
  if (meta.content) {
    rawText = fromBase64Utf8(meta.content);
  } else if (meta.git_url) {
    // Fallback for files >1MB where GitHub Contents omits inline content
    const blob = await ghFetch(meta.git_url, token);
    rawText = fromBase64Utf8(blob.content);
  }
  const data = JSON.parse(rawText);
  return { data, sha: meta.sha };
}

export async function saveLibraryToGithub(cfg, data, sha, message = 'Update library.json from BookList web app') {
  const { owner, repo, branch = 'main', path = 'library.json', token } = cfg;
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
  const content = toBase64Utf8(JSON.stringify(data, null, 2));
  const payload = {
    message,
    content,
    branch,
    ...(sha ? { sha } : {}),
  };
  const res = await ghFetch(url, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { sha: res.content?.sha || null };
}
