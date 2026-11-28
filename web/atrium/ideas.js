(() => {
  const LANES = ['inbox', 'now', 'next', 'waiting', 'parked', 'done', 'dropped'];
  const LABELS = { inbox: 'Inbox', now: 'Now', next: 'Next', waiting: 'Waiting', parked: 'Parked', done: 'Done', dropped: 'Dropped' };
  const state = { board: null, error: '', enabled: false };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  async function request(path, data) {
    const response = await fetch(`/api/p/ideas${path}`, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body.error || 'Ideas could not be updated.');
    return body;
  }
  async function load() { state.board = await request('/board'); state.error = ''; }
  function renderIdeas() {
    if (!state.enabled) return `<div class="nx-view enter">${typeof ARTHEAD === 'function' ? ARTHEAD('Ideas', 'ideas') : ''}<div class="nx-phead"><h2>IDEAS</h2></div><p class="idea-disabled" role="status">Ideas is turned off. Enable it in Settings → Optional modules or Setup → Apps.</p></div>`;
    if (!state.board) {
      void load().then(render).catch((error) => { state.error = error.message; render(); });
      return `<div class="nx-view enter">${typeof ARTHEAD === 'function' ? ARTHEAD('Ideas', 'ideas') : ''}<div class="nx-phead"><h2>IDEAS</h2><span class="label">Cogitationes</span></div><div class="og-wrap">${ARTSKEL(3, 'Loading the board')}</div></div>`;
    }
    const board = state.board;
    return `<div class="nx-view enter idea-view"><header class="idea-head"><div><span class="label">PLAN THE WORK</span><h2>Ideas</h2><p>Capture first. Choose what moves forward when you are ready.</p></div><button type="button" class="idea-export" data-idea-export>Copy plan</button></header>${state.error ? `<p role="status" class="idea-error">${escapeHtml(state.error)}</p>` : ''}<form class="idea-add" data-idea-add><input aria-label="New idea" maxlength="140" placeholder="A new idea. It starts in Inbox."><button>Add to Inbox</button></form><div class="idea-lanes">${LANES.map((lane) => `<section class="idea-lane" aria-label="${LABELS[lane]}"><header><h3>${LABELS[lane]}</h3><span>${board.lanes[lane].length}${board.limits[lane] ? ` / ${board.limits[lane]}` : ''}</span></header>${board.lanes[lane].map((idea) => `<article class="idea-card"><h4 data-no-i18n>${escapeHtml(idea.title)}</h4>${idea.note ? `<p data-no-i18n>${escapeHtml(idea.note)}</p>` : ''}${idea.reason && lane === 'dropped' ? `<p>Reason: <span data-no-i18n>${escapeHtml(idea.reason)}</span></p>` : ''}${idea.trigger && lane === 'parked' ? `<p>Wakes when: <span data-no-i18n>${escapeHtml(idea.trigger)}</span></p>` : ''}<div class="idea-actions">${LANES.filter((next) => next !== lane).map((next) => `<button type="button" data-idea-move="${escapeHtml(idea.id)}" data-idea-lane="${next}">${LABELS[next]}</button>`).join('')}</div></article>`).join('') || `<p class="idea-empty">${lane === 'inbox' ? 'New ideas land here.' : 'Nothing here yet.'}</p>`}</section>`).join('')}</div></div>`;
  }
  register({ id: 'ideas', views: { Ideas: renderIdeas } });
  async function syncStatus() {
    try {
      const modules = await (await fetch('/api/plugins/all')).json();
      const module = modules.find((item) => item.id === 'ideas');
      state.enabled = !!(module && module.enabled && module.running);
      if (state.enabled) OGS.mods.add('Ideas'); else OGS.mods.delete('Ideas');
    } catch { state.enabled = false; OGS.mods.delete('Ideas'); }
    render();
  }
  window.ideasModule = {
    enabled: () => state.enabled,
    toggle: async (enabled) => {
      const response = await fetch('/api/plugins/ideas/enabled', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Could not change Ideas.');
      const module = (body.modules || []).find((item) => item.id === 'ideas');
      state.enabled = !!(module && module.enabled && module.running);
      if (state.enabled) OGS.mods.add('Ideas'); else OGS.mods.delete('Ideas');
      if (state.enabled) await load();
      return body;
    },
  };
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-idea-add]');
    if (!form) return;
    event.preventDefault(); event.stopPropagation();
    const title = form.querySelector('input').value.trim();
    if (!title) return;
    try { await request('/ideas', { title }); await load(); render(); }
    catch (error) { state.error = error.message; render(); }
  }, true);
  document.addEventListener('click', async (event) => {
    const move = event.target.closest('[data-idea-move]');
    if (move) {
      event.preventDefault(); event.stopPropagation();
      const lane = move.dataset.ideaLane, payload = { lane };
      if (lane === 'dropped') { payload.reason = await askText('Why are you dropping this idea?') || ''; if (!payload.reason.trim()) return; }
      if (lane === 'parked') { payload.trigger = await askText('What would make you revisit this?') || ''; if (!payload.trigger.trim()) return; }
      try { await request(`/ideas/${encodeURIComponent(move.dataset.ideaMove)}/move`, payload); await load(); render(); }
      catch (error) { state.error = error.message; render(); }
      return;
    }
    if (event.target.closest('[data-idea-export]')) {
      try { const response = await fetch('/api/p/ideas/export.md'); await navigator.clipboard.writeText(await response.text()); state.error = 'Plan copied.'; }
      catch { state.error = 'Could not copy the plan.'; }
      render();
    }
  }, true);
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-st^="module:ideas:"]');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      const enabled = button.dataset.st.endsWith(':true');
      const response = await fetch('/api/plugins/ideas/enabled', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Could not change Ideas.');
      const module = (body.modules || []).find((item) => item.id === 'ideas');
      state.enabled = !!(module && module.enabled && module.running);
      if (state.enabled) OGS.mods.add('Ideas'); else OGS.mods.delete('Ideas');
      if (!state.enabled && S.tabs[S.act]?.id === 'Ideas') S.tabs[S.act] = { k: 'app', id: 'Ideas' };
      window.dispatchEvent(new CustomEvent('caesaros:modules-updated', { detail: body.modules }));
    } catch (error) { state.error = error.message; }
    render();
  }, true);
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-ideas-toggle]');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const enabled = button.getAttribute('aria-checked') !== 'true';
    button.disabled = true;
    try {
      const response = await fetch('/api/plugins/ideas/enabled', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Could not change Ideas.');
      const module = (body.modules || []).find((item) => item.id === 'ideas');
      state.enabled = !!(module && module.enabled && module.running);
      if (state.enabled) OGS.mods.add('Ideas'); else OGS.mods.delete('Ideas');
      button.setAttribute('aria-checked', String(!!module?.enabled));
      button.textContent = module?.enabled && !module?.running ? 'Saved · restart' : module?.enabled ? 'On' : 'Off';
      window.dispatchEvent(new CustomEvent('caesaros:modules-updated', { detail: body.modules }));
    } catch (error) { state.error = error.message; button.textContent = 'Retry'; }
    button.disabled = false;
  }, true);
  void syncStatus();
})();
