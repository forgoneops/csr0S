/* Storage and device: how much room CaesarOS takes (local models, app data by area, caches) and what this machine is.
   Sizes and the clearable list come from the core (core/storage.ts); models, machine and version reuse the routes the
   Models and Health pages already read. No path, host name or user name is ever received here. */
(() => {
  const ST = { d: null, at: 0, loading: false, sure: null, busy: false, msg: '', err: '' };
  const E = s => OGE(String(s == null ? '' : s));
  const get = async u => { const r = await fetch(u); if (r.status === 401) location.href = '/login'; if (!r.ok) throw new Error(String(r.status)); return r.json(); };
  const size = b => { if (b < 1024) return `${Math.round(b)} B`; let n = b / 1024, u = 0; while (n >= 1024 && u < 2) { n /= 1024; u++; } return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${['KB', 'MB', 'GB'][u]}`; };
  const sum = a => a.reduce((n, x) => n + x.bytes, 0);
  const btn = (k, label, extra = '') => `<button type="button" class="btn" data-sto="${k}" ${extra}>${E(label)}</button>`;
  const sec = t => `<div class="og-sec">${E(t)}</div>`;
  const row = (icon, name, note, tag) => `<div>${I(icon, 16)}<span><span data-no-i18n>${E(name)}</span>${note ? ` <small>${E(note)}</small>` : ''}</span><span class="og-tag mut">${E(tag)}</span></div>`;
  const OSN = { linux: 'Linux', darwin: 'macOS', win32: 'Windows', android: 'Android' };

  async function load() {
    if (ST.loading) return;
    ST.loading = true;
    try {
      const [sto, models, hw, ver] = await Promise.all([get('/api/storage'), get('/api/models/installed'), get('/api/hardware'), get('/api/version')]);
      ST.d = { sto, models, m: hw.machine, ver }; ST.err = '';
    } catch (e) { ST.err = e.message === '403' ? 'Only the owner of this install can see its storage.' : 'The core did not answer.'; }
    ST.loading = false; ST.at = Date.now(); render();
  }

  const frame = body => `<div class="nx-view enter">${ARTHEAD('Storage', 'folders')}<div class="nx-phead"><h2>STORAGE</h2><span class="label">Horreum</span></div><p style="margin:6px 0 0;color:var(--muted);font-size:13px;max-width:760px">What takes room on this machine, and what the machine is. Read on the spot; nothing here leaves the computer.</p><div class="og-wrap">${body}</div></div>`;

  function view() {
    if (Date.now() - ST.at > 60000) void load();
    if (ST.err) return frame(`${ARTSTATE('error', 'Storage could not be read', ST.err)}<div class="og-row">${btn('refresh', 'Try again')}</div>`);
    if (!ST.d) return frame(`${ARTSTATE('loading', 'Measuring this device…')}<div class="vz-tiles" aria-hidden="true">${'<div class="pg-slot"></div>'.repeat(4)}</div><div class="pg-slot" aria-hidden="true"></div>`);
    const { sto, models, m, ver } = ST.d, GB = 1024 ** 3;
    const modelBytes = models.reduce((n, x) => n + x.sizeGb * GB, 0) + sum(sto.engines);
    const data = sum(sto.areas), cache = sum(sto.caches), all = data + cache;
    const used = m && m.diskTotalGb ? (m.diskTotalGb - m.freeDiskGb) / m.diskTotalGb * 100 : 0;
    const modelRows = [
      ...models.map(x => row('engine', x.name, 'Chat model in Ollama', `${x.sizeGb} GB`)),
      ...sto.engines.map(x => row('system', x.name, 'Whole engine folder', size(x.bytes))),
      ...sto.voices.map(x => row('mic', x.name, 'Reading voice, counted in the speech engine', size(x.bytes)))
    ].join('');
    const caches = sto.caches.map(c => `<div class="og-card"><div class="og-row"><h4>${E(c.name)}</h4><span class="og-tag ${c.bytes ? 'sig' : 'mut'}">${c.bytes ? size(c.bytes) : 'Empty'}</span></div><p>${E(c.note)}</p>${ST.sure === c.id
      ? `<div role="group" aria-label="Confirm clearing"><p><b>Clear ${size(c.bytes)} of ${E(c.name.toLowerCase())}?</b></p><div class="og-row">${btn('go:' + c.id, ST.busy ? 'Clearing…' : 'Yes, clear', ST.busy ? 'disabled' : '')}${btn('keep', 'Keep them', ST.busy ? 'disabled' : '')}</div></div>`
      : `<div class="og-row">${btn('ask:' + c.id, 'Clear', c.bytes ? '' : 'disabled style="opacity:.5"')}</div>`}</div>`).join('');
    const unread = !m && !modelRows;   // a throwaway copy never looked for models, so it shows no count of them
    return frame(`
      ${vzTiles([...(unread ? [] : [vzTile('Local models', size(modelBytes), models.length === 1 ? '1 chat model' : `${models.length} chat models`, 'a')]), vzTile('App data', size(data), 'yours, never cleared here', 's'), vzTile('Cache', size(cache), cache ? 'can be made again' : 'nothing to clear', 'g'), ...(m ? [vzTile('Free disk', `${m.freeDiskGb} GB`, m.diskTotalGb ? `of ${m.diskTotalGb} GB` : '', 'm')] : [])])}
      ${m && m.diskTotalGb ? vzBars([['Disk used', used, `${Math.round(used)}%`, used > 90 ? 'd' : 's']]) : ''}
      ${unread ? '' : `${sec('Local models')}${modelRows ? `<div class="og-list">${modelRows}</div>` : vzEmpty('No local model found', 'If you use Ollama, start it and press Refresh. Models you download are listed here with their size.')}
      ${typeof ogEnabled !== 'function' || ogEnabled('Models') ? `<div class="og-row">${btn('models', 'Manage models')}</div>` : ''}`}
      ${sec('App data by area')}${vzBars(sto.areas.map((a, i) => [a.name, data ? a.bytes / data * 100 : 0, size(a.bytes), ['a', 's', 'g', 'm'][i % 4]]))}
      ${sec('Cache')}${caches}
      ${ST.msg ? `<p role="status">${E(ST.msg)}</p>` : ''}
      ${sec('This device')}
      ${!m ? vzEmpty('Machine details are hidden', 'This copy runs on a throwaway data folder, so it does not read this computer.') : vzTiles([vzTile('System', OSN[m.os] || m.os, m.arch || '', 'a'), vzTile('Processors', m.cores, 'logical CPUs', 's'), vzTile('Memory', `${m.ramGb} GB`, 'installed', 'g'), vzTile('Graphics', m.gpu === 'unknown' ? 'Unknown' : m.gpu === 'none' ? 'None found' : m.gpu.toUpperCase(), '', 'm'), vzTile('CaesarOS', ver.version, `#${ver.build}`, 'a', true)])}
      <div class="og-row">${btn('refresh', ST.loading ? 'Reading…' : 'Refresh', ST.loading ? 'disabled' : '')}</div>`);
  }

  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-sto]'); if (!t || t.hasAttribute('disabled')) return;
    const [k, v] = t.dataset.sto.split(/:(.*)/s);
    if (k === 'refresh') { ST.err = ''; ST.msg = ''; ST.sure = null; void load(); render(); }
    else if (k === 'models') { open_({ k: 'app', id: 'Models' }); render(); }
    else if (k === 'ask') { ST.sure = v; ST.msg = ''; render(); }
    else if (k === 'keep') { ST.sure = null; render(); }
    else if (k === 'go') {
      ST.busy = true; render();
      try {
        const r = await fetch('/api/storage/clear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: v }) });
        const j = await r.json();
        ST.msg = r.ok ? `Cleared ${size(j.freed)}.` : j.error === 'busy' ? 'A preview is being made right now. Try again in a moment.' : 'It could not be cleared. Nothing of yours was touched.';
      } catch { ST.msg = 'The core did not answer.'; }
      ST.busy = false; ST.sure = null; await load();
    }
  });

  register({ id: 'storage', views: { Storage: view } });
})();
