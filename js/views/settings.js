import { exportFullLibraryCsv } from '../csv.js';
import { testGithubConnection } from '../github.js';
import { store } from '../store.js';
import { downloadTextFile, esc, todayIso } from '../utils.js';

export function renderSettings(container, ctx) {
  const cfg = store.githubConfig;
  const hasCreds = store.hasGithubCredentials();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sync &amp; Data Management</h1>
        <p class="page-subtitle">Connect your private GitHub data repository or import/export local backups.</p>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:1.1rem">
      <section class="card">
        <h2 class="card-title">Private GitHub Data Repo Sync</h2>
        <p class="muted" style="margin-top:0;font-size:0.88rem">
          This app lives on public GitHub Pages, while your personal <code>library.json</code> stays safely in a separate <strong>private</strong> GitHub repository.
          Your token is stored only in this browser's <code>localStorage</code>.
        </p>

        <form id="gh-form" class="form-grid" style="margin-bottom:0.85rem">
          <div class="form-field">
            <label class="form-label" for="gh-owner">GitHub Username / Owner</label>
            <input id="gh-owner" class="input" placeholder="e.g. francismuir" value="${esc(cfg.owner || '')}" />
          </div>
          <div class="form-field">
            <label class="form-label" for="gh-repo">Private Data Repo Name</label>
            <input id="gh-repo" class="input" placeholder="e.g. booklist-data" value="${esc(cfg.repo || '')}" />
          </div>
          <div class="form-field">
            <label class="form-label" for="gh-branch">Branch</label>
            <input id="gh-branch" class="input" value="${esc(cfg.branch || 'main')}" />
          </div>
          <div class="form-field">
            <label class="form-label" for="gh-path">File Path</label>
            <input id="gh-path" class="input" value="${esc(cfg.path || 'library.json')}" />
          </div>
          <div class="form-field span-2">
            <label class="form-label" for="gh-token">Fine-Grained Personal Access Token (scoped to Contents: Read &amp; Write on that repo only)</label>
            <input id="gh-token" class="input mono" type="password" placeholder="github_pat_…" value="${esc(cfg.token || '')}" />
          </div>
          <div class="form-field span-2">
            <label style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.88rem">
              <input id="gh-autosave" type="checkbox" ${cfg.autoSave ? 'checked' : ''} />
              Auto-commit edits to GitHub after 1.5s
            </label>
          </div>
          <div class="form-field span-2" style="flex-direction:row;flex-wrap:wrap;gap:0.5rem">
            <button class="btn btn-primary btn-sm" type="submit">Save Settings</button>
            <button id="btn-test-gh" class="btn btn-sm" type="button">Test Connection</button>
            <button id="btn-pull-gh" class="btn btn-sm" type="button" ${!hasCreds ? 'disabled' : ''}>⬇ Pull from GitHub</button>
            <button id="btn-push-gh" class="btn btn-ok btn-sm" type="button" ${!hasCreds ? 'disabled' : ''}>⬆ Push Local Data to GitHub</button>
          </div>
        </form>

        <div id="gh-status-msg" class="muted" style="font-size:0.85rem">
          Mode: <strong>${esc(store.mode)}</strong> · Books loaded: <strong>${store.data.books.length}</strong>
          ${store.syncError ? `<div style="color:var(--danger);margin-top:0.25rem">Last error: ${esc(store.syncError)}</div>` : ''}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">How to Set Up Your Private Repo (2 mins)</h2>
        <ol style="padding-left:1.2rem;margin:0;font-size:0.89rem;line-height:1.6">
          <li>Create a new <strong>Private</strong> repository on GitHub (e.g. <code>booklist-data</code>) and upload your migrated <code>Data/library.json</code> as <code>library.json</code> (or push it straight from here using <strong>Push Local Data to GitHub</strong>!).</li>
          <li>In GitHub → <strong>Settings → Developer settings → Fine-grained tokens</strong>, click <strong>Generate new token</strong>.</li>
          <li>Under <strong>Repository access</strong>, select <strong>Only select repositories</strong> → choose <code>booklist-data</code>.</li>
          <li>Under <strong>Repository permissions</strong>, set <strong>Contents</strong> to <strong>Read and write</strong> (leave everything else as No access).</li>
          <li>Paste the token on the left on your Mac and phone. Every edit creates a clean Git commit with full history.</li>
        </ol>
      </section>
    </div>

    <section class="card">
      <h2 class="card-title">Local Import, Export &amp; Theme</h2>
      <div style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:center">
        <button id="btn-export-json" class="btn btn-sm" type="button">⬇ Download library.json</button>
        <button id="btn-export-csv" class="btn btn-sm" type="button">⬇ Export Full CSV Backup</button>
        <label class="btn btn-sm" style="cursor:pointer">
          ⬆ Import library.json
          <input id="input-import-json" type="file" accept=".json,application/json" class="hidden" />
        </label>
        <button id="btn-reset-local" class="btn btn-danger btn-sm" type="button">Reset Browser Cache</button>
      </div>
    </section>
  `;

  const readFormCfg = () => ({
    owner: container.querySelector('#gh-owner').value.trim(),
    repo: container.querySelector('#gh-repo').value.trim(),
    branch: container.querySelector('#gh-branch').value.trim() || 'main',
    path: container.querySelector('#gh-path').value.trim() || 'library.json',
    token: container.querySelector('#gh-token').value.trim(),
    autoSave: container.querySelector('#gh-autosave').checked,
  });

  container.querySelector('#gh-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    store.saveGithubConfig(readFormCfg());
    ctx.toast('GitHub settings saved', 'ok');
    renderSettings(container, ctx);
  });

  container.querySelector('#btn-test-gh')?.addEventListener('click', async () => {
    const c = readFormCfg();
    store.saveGithubConfig(c);
    try {
      const info = await testGithubConnection(c);
      ctx.toast(
        `Connected to ${info.fullName} (${info.isPrivate ? 'Private' : 'Public'}). ${info.fileExists ? 'library.json found.' : 'library.json not yet created — click Push Local Data.'}`,
        'ok'
      );
    } catch (err) {
      ctx.toast(err.message, 'error');
    }
  });

  container.querySelector('#btn-pull-gh')?.addEventListener('click', async () => {
    store.saveGithubConfig(readFormCfg());
    if (store.dirty && !window.confirm('You have unsaved local changes. Pulling will replace them. Continue?')) return;
    try {
      await store.pullFromGithub();
      ctx.toast(`Pulled ${store.data.books.length} books from GitHub`, 'ok');
    } catch (err) {
      ctx.toast(`Pull failed: ${err.message}`, 'error');
    }
  });

  container.querySelector('#btn-push-gh')?.addEventListener('click', async () => {
    store.saveGithubConfig(readFormCfg());
    try {
      await store.pushToGithub();
      ctx.toast('Pushed library.json to GitHub!', 'ok');
    } catch (err) {
      ctx.toast(`Push failed: ${err.message}`, 'error');
    }
  });

  container.querySelector('#btn-export-json')?.addEventListener('click', () => {
    downloadTextFile(`library_${todayIso()}.json`, JSON.stringify(store.data, null, 2), 'application/json');
  });

  container.querySelector('#btn-export-csv')?.addEventListener('click', () => {
    const csv = exportFullLibraryCsv(store.data.books, store.data.series);
    downloadTextFile(`booklist_full_${todayIso()}.csv`, csv, 'text/csv;charset=utf-8');
  });

  container.querySelector('#input-import-json')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      store.replaceAllData(parsed, store.hasGithubCredentials() ? 'github' : 'local_draft');
      ctx.toast(`Imported ${parsed.books.length} books from ${file.name}`, 'ok');
    } catch (err) {
      ctx.toast(`Import failed: ${err.message}`, 'error');
    }
  });

  container.querySelector('#btn-reset-local')?.addEventListener('click', async () => {
    if (!window.confirm('Clear browser-cached library edits and reload from source?')) return;
    await store.resetToLocalOrDemo();
    ctx.toast('Browser cache reset', 'ok');
  });
}
