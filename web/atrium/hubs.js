/* Hubs: each top workspace tab (Main, Daily, Knowledge, ...) is a page of live widgets for that area. Widgets move, resize,
   are removed and added, and the board is saved on this machine. Every widget shows real data or says it has none. */
(() => {
  const get = async (u, f) => { try { const r = await fetch(u); return r.ok ? await r.json() : f; } catch { return f; } };
  const put = (b) => fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const post = (u) => fetch(u, { method: 'POST' });
  const DEFAULTS = [
    ['home', 'Home', ['today', 'capture', 'goals', 'conversations', 'notes', 'media', 'crew', 'approvals']],
    ['planning', 'Planning', ['calendar', 'running']], ['knowledge', 'Knowledge', ['knowledge', 'notes']],
    ['business', 'Business', ['calendar', 'backup']], ['system', 'System', ['engines', 'machine', 'backup']],
    ['crew', 'Crew', ['crew', 'approvals', 'running']],
  ];
  const CAT = {   // the widgets that exist, each on real data. w and h are grid cells (12 columns).
    crew: { t: 'The crew', sub: 'who is working', img: 'lair-ember', w: 4, h: 3, open: 'Crew' },
    approvals: { t: 'Waiting for you', sub: 'approvals', img: 'hero-ember', w: 4, h: 3, open: 'Chat' },
    conversations: { t: 'Chats', sub: 'recent', img: 'hero-throne-ember', w: 4, h: 3, open: 'Chat' },
    notes: { t: 'Notes', sub: 'recent', img: 'lair-ember', w: 4, h: 3, open: 'Memory' },
    knowledge: { t: 'Knowledge', sub: 'documents', img: 'hero-ember', w: 4, h: 2, open: 'Memory' },
    engines: { t: 'Tools and engines', sub: 'status', img: 'hero-throne-ember', w: 4, h: 3, open: 'Start' },
    backup: { t: 'Backup', sub: 'your data', img: 'lair-ember', w: 4, h: 2, open: 'Start' },
    machine: { t: 'This machine', sub: 'memory and disk', img: 'hero-ember', w: 4, h: 2, open: 'Start' },
    running: { t: 'Running now', sub: 'turns', img: 'hero-throne-ember', w: 4, h: 2, open: 'Chat' },
    calendar: { t: 'Calendar', sub: 'this month', img: 'lair-ember', w: 8, h: 4, open: 'Schedule' },
    today: { t: 'Today', sub: 'brief and next steps', img: 'hero-ember', w: 8, h: 4, open: 'Daily review' },
    capture: { t: 'Capture', sub: 'save a thought', img: 'lair-ember', w: 4, h: 4, open: 'Memory' },
    goals: { t: 'Goals', sub: 'your next milestone', img: 'hero-throne-ember', w: 4, h: 3, open: 'Goals', module: 'Goals' },
    media: { t: 'Media', sub: 'your archive', img: 'hero-ember', w: 4, h: 3, open: 'Media Gallery', module: 'Media Gallery' },
  };
  window.HUB_CAT = CAT;                                // real.js adds the Board and Usage widgets to this catalog
  WIDGETS.splice(0, WIDGETS.length);                   // the prototype's invented widgets never show: an empty board until the real one loads
  try { render(); } catch { /* the first paint comes again once the board is loaded */ }
  const H = { goals: null, wx: null, saved: null, draft: {}, notes: [], docs: 0, backups: [], hw: null, running: 0, ws: null, loaded: false };
  let current = '';                                    // the workspace whose widgets are loaded into WIDGETS
  let saveT = 0, savedKey = '';

  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const empty = t => `<div class="t-body t-framed"><p class="hub-empty">${esc(t)}</p></div>`;
  const list = rows => `<div class="t-body t-framed"><ul class="nx-list">${rows.join('')}</ul></div>`;
  const dot = st => `<span class="nx-dot ${st === 'work' ? 'work' : st === 'wait' ? 'wait' : st === 'ok' ? 'ok' : ''}"></span>`;
  BODY.crew = () => CREW.length ? `<div class="t-body t-framed hm-body"><img class="hm-art" alt="" src="art/caesaros-lair-scene.webp"><p class="hub-empty">${CREW.length} on the crew, ${CREW.filter(m => m.st === 'work').length} working.</p><button class="su-btn go" data-open-app="Crew"><span>Open the crew</span></button></div>` : empty('No crew found. Hermes profiles appear here.');
  BODY.approvals = () => S.waiting.length ? list(S.waiting.map(w => `<li class="hub-ap"><span>${esc(w.t)}</span><span class="hub-apb"><button class="su-btn go" data-ph-ok="${esc(w.k)}"><span>Approve</span></button><button class="su-btn" data-ph-no="${esc(w.k)}"><span>Not now</span></button></span></li>`)) : empty('Nothing is waiting for you.');
  BODY.conversations = () => THREADS.length ? list(THREADS.slice(0, 6).map(t => `<li><button class="hub-li" data-ses="${esc(t.id)}">${dot((C[t.a] || {}).st)}<span><b data-no-i18n>${esc(t.t)}</b> <small>${esc((C[t.a] || {}).n || '')} · ${esc(t.s)}</small></span></button></li>`)) : empty('No conversations yet.');
  BODY.notes = () => H.notes.length ? list(H.notes.slice(0, 6).map(n => `<li><button class="hub-li" data-open-app="Memory">${dot('ok')}<span><b data-no-i18n>${esc(n.id)}</b> <small>${ago(n.updatedAt)}</small></span></button></li>`)) : empty('No notes yet.');
  BODY.knowledge = () => `<div class="t-body t-framed"><p class="hub-big">${H.docs}</p><p class="hub-empty">${H.docs === 1 ? 'document' : 'documents'} you added. Chat can use them as context.</p></div>`;
  BODY.engines = () => { const t = (window.TARGETS_ALL || []); return t.length ? list(t.filter(x => x.group !== 'crew').map(x => `<li><button class="hub-li" data-open-app="Start">${dot(x.ok ? 'ok' : 'wait')}<span><b>${esc(x.label)}</b> <small>${x.ok ? 'ready' : esc(x.detail || 'not available')}</small></span></button></li>`)) : empty('Checking…'); };
  BODY.backup = () => `<div class="t-body t-framed"><p class="hub-empty">${H.backups.length ? 'Last backup ' + ago(H.backups[0].at || H.backups[0].time || Date.now()) : 'No backup yet.'}</p><button class="su-btn go" data-hub-backup>${I('download', 16)}<span>Back up now</span></button></div>`;
  BODY.machine = () => H.hw ? `<div class="t-body t-framed"><p class="hub-big">${H.hw.machine.ramGb} GB</p><p class="hub-empty"><span>memory</span> · <span>Free disk: ${H.hw.machine.freeDiskGb} GB</span> · <span>CPU cores: ${H.hw.machine.cores}</span>${H.hw.machine.gpu !== 'none' ? ' · <span data-no-i18n>' + H.hw.machine.gpu.toUpperCase() + '</span>' : ''}</p></div>` : empty('Reading…');
  BODY.running = () => `<div class="t-body t-framed"><p class="hub-big">${H.running}</p><p class="hub-empty">${H.running === 1 ? 'turn' : 'turns'} running.</p><button class="su-btn" data-nx="stop-all" ${H.running ? '' : 'disabled'}><span>Stop everything</span></button></div>`;
  const sk = l => `<div class="t-body t-framed">${typeof ARTSKEL === 'function' ? ARTSKEL(2, l) : ''}</div>`;
  const field = (key, ph, btn, label) => `<form class="hm-form" data-hm="${key}"><input class="og-input" name="v" maxlength="200" autocomplete="off" placeholder="${esc(ph)}" aria-label="${esc(label || ph)}" value="${esc(H.draft[key] || '')}"><button class="su-btn go" type="submit"><span>${esc(btn)}</span></button></form>`;
  const wxCity = () => { try { return localStorage.getItem('caesaros.wxcity') || ''; } catch { return ''; } };
  BODY.today = () => {
    if (!H.loaded) return sk('Loading today');
    const ready = (window.TARGETS_ALL || []).some(x => x.group !== 'crew' && x.ok);
    const steps = [[ready, 'Set up your tools', 'Start'], ...(H.goals === false ? [] : [[!!(H.goals && H.goals.length), 'Add a goal', 'Goals']]), [H.notes.length > 0, 'Write your first note', 'Memory']];
    const wx = OGS.mods.has('Weather') && H.wx ? `<p class="hm-wx" data-no-i18n>${esc(H.wx.place)} · ${esc(H.wx.now.temp)}°C · ${esc(H.wx.now.sky)}</p>` : '';
    return `<div class="t-body t-framed hm-body"><p class="hm-date" data-no-i18n>${esc(new Date().toLocaleDateString(uiLocale('en'), { weekday: 'long', day: 'numeric', month: 'long' }))}</p>${wx}<ul class="nx-list">${steps.map(([ok, t, app]) => `<li><button class="hub-li" data-open-app="${app}">${dot(ok ? 'ok' : 'wait')}<span><b>${esc(t)}</b> <small>${ok ? 'done' : 'next'}</small></span></button></li>`).join('')}</ul></div>`;
  };
  BODY.capture = () => `<div class="t-body t-framed hm-body">${field('capture', 'Type a thought, press Enter', 'Save', 'Quick note')}${H.saved ? `<p class="hm-saved" role="status">Saved <button class="hub-li hm-link" data-open-app="Memory" data-hm-note="${esc(H.saved)}"><b data-no-i18n>${esc(H.saved)}</b></button></p>` : '<p class="hub-empty">It becomes a note you can find in Notes.</p>'}</div>`;
  BODY.goals = () => {
    if (H.goals === false) return `<div class="t-body t-framed"><p class="hub-empty">Goals is switched off. Turn it on in Setup.</p></div>`;
    if (H.goals === null) return sk('Loading goals');
    const g = H.goals.filter(x => x.status !== 'done').slice(0, 3);
    return `<div class="t-body t-framed hm-body">${field('goal', 'Add a goal for today', 'Add', 'New goal')}${g.length ? `<ul class="nx-list">${g.map(x => `<li><button class="hub-li" data-open-app="Goals">${dot('wait')}<span><b data-no-i18n>${esc(x.title)}</b></span></button></li>`).join('')}</ul>` : '<p class="hub-empty">No goals yet.</p>'}</div>`;
  };
  BODY.conversations = () => `<div class="t-body t-framed hm-body">${field('chat', 'Ask Caesar anything', 'Chat', 'Start a chat')}${THREADS.length ? `<ul class="nx-list">${THREADS.slice(0, 3).map(t => `<li><button class="hub-li" data-ses="${esc(t.id)}">${dot((C[t.a] || {}).st)}<span><b data-no-i18n>${esc(t.t)}</b> <small>${esc((C[t.a] || {}).n || '')} · ${esc(t.s)}</small></span></button></li>`).join('')}</ul>` : '<p class="hub-empty">No conversations yet.</p>'}</div>`;
  BODY.media = () => OGS.mods.has('Media Gallery') ? `<div class="t-body t-framed hm-body"><img class="hm-art" alt="" src="art/caesaros-banner-archive.webp"><p class="hub-empty">Nothing in your archive yet.</p><button class="su-btn go" data-open-app="Media Gallery"><span>Open Media</span></button></div>` : `<div class="t-body t-framed"><p class="hub-empty">Media Gallery is switched off. Turn it on in Setup.</p></div>`;
  async function refresh() {
    const [notes, docs, bk, hw, run, targets] = await Promise.all([get('/api/notes', []), get('/api/knowledge', []), get('/api/backup', []), get('/api/hardware', null), get('/api/running', { count: 0 }), get('/api/chat-targets', [])]);
    H.notes = (Array.isArray(notes) ? notes : []).sort((a, b) => b.updatedAt - a.updatedAt); H.docs = Array.isArray(docs) ? docs.length : 0; H.backups = Array.isArray(bk) ? bk : (bk.backups || []); H.hw = hw; H.running = run.count || 0; window.TARGETS_ALL = targets;
    H.goals = (await get('/api/p/goals', {})).goals || false;   // false: the Goals module is off (its route says so)
    const city = wxCity(); H.wx = OGS.mods.has('Weather') && city ? await get('/api/weather?city=' + encodeURIComponent(city), null) : null; H.loaded = true;
  }
  async function loadBoard() {
    const set = await get('/api/settings', null); if (!set || !Array.isArray(set.workspaces)) return;
    window.applyOptionalModules?.(set);
    H.ws = set.workspaces;
    if (!H.ws.some(w => w.id === 'home')) {
      const fresh = H.ws.length === 1 && H.ws[0].id === 'main';
      H.ws = fresh ? DEFAULTS.map(([id,name,widgets]) => ({ id, name, widgets, layout: {}, modules: [id] })) : [{ id:'home', name:'Home', widgets: H.ws.find(w => w.id === 'main')?.widgets || [], layout:{} }, ...H.ws];
      void put({ workspaces: H.ws });
    }
    WSN.splice(0, WSN.length, ...H.ws.map(w => w.name));
    window.WSI = H.ws.map(w => w.id);
    const active = H.ws.findIndex(w => w.id === set.workspace); if (active >= 0) S.ws = active;
  }
  window.reloadWorkspaces = async () => { current = ''; await loadBoard(); render(); };
  const wsNow = () => H.ws && H.ws[S.ws];

  function loadWorkspace() {     // put the current workspace's widgets and layout where the prototype's grid reads them
    const w = wsNow(); if (!w) return; if (current === w.id) return; current = w.id;
    WIDGETS.splice(0, WIDGETS.length, ...w.widgets.filter(id => CAT[id] && (!CAT[id].module || OGS.mods.has(CAT[id].module))).map(id => ({ id, t: CAT[id].t, sub: CAT[id].sub, img: CAT[id].img, w: CAT[id].w, h: CAT[id].h })));
    layout = null; initLayout(); const saved = w.layout || {};
    for (const id of Object.keys(layout)) if (saved[id]) layout[id] = { ...saved[id] };
    savedKey = JSON.stringify(layout);
  }
  function save() {
    // persist immediately, not after a 400 ms debounce: a later full render must not re-read the
    // saved workspace before the new widget/position was written, which made added widgets vanish
    clearTimeout(saveT); saveT = setTimeout(() => {
      const w = wsNow(); if (!w || !layout) return; const k = JSON.stringify(layout) + '|' + WIDGETS.map(x => x.id).join(',');
      if (k === savedKey) return; savedKey = k;
      w.widgets = WIDGETS.map(x => x.id); w.layout = JSON.parse(JSON.stringify(layout));
      void put({ workspaces: H.ws });
    }, 0);
  }

  // the prototype's render, with the board kept in step with the workspace tab and the extra edit controls added after it
  const _render = render;
  render = function () {
    if (H.ws) loadWorkspace();
    const r = _render();
    if (H.ws) decorate();
    return r;
  };
  function decorate() {
    $$('.dw').forEach(dw => { const id = dw.dataset.widgetId, t = dw.querySelector('.dw-title'); if (t && CAT[id]) t.dataset.openApp = CAT[id].open; });
    const grid = $('.dw-grid'); if (grid && !editing && wsNow()?.id === 'home') grid.classList.add('hm-flow');   // Home flows by content; the free grid is for Edit layout
    const head = $('.at-workspace-head');
    const active = wsNow();
    if (active && !$('.ws-manage')) {
      const bar = $('.ws-bar');
      if (bar) { const controls = document.createElement('div'); controls.className = 'ws-manage'; controls.innerHTML = `<button type="button" data-ws-rename aria-label="Rename workspace">Rename</button><button type="button" data-ws-up aria-label="Move workspace left">←</button><button type="button" data-ws-down aria-label="Move workspace right">→</button><button type="button" data-ws-pin aria-pressed="${!!active.pinned}">${active.pinned ? 'Unpin' : 'Pin'}</button>${active.id === 'home' ? '' : '<button type="button" data-ws-delete>Delete</button>'}`; bar.appendChild(controls); }
    }
    if (head && editing) {
      if (!head.querySelector('[data-hub-add]')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'dw-edit'; b.dataset.hubAdd = ''; b.innerHTML = I('plus', 14) + 'Add widget'; head.appendChild(b); }
      $$('.dw-head').forEach(h => { if (!h.querySelector('[data-hub-rm]')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'kit-ico sm hub-rm'; x.dataset.hubRm = h.closest('.dw').dataset.widgetId; x.setAttribute('aria-label', 'Remove widget'); x.innerHTML = I('close', 14); h.appendChild(x); } });
    }
    const n = $('.at-workspace-head small'); if (n) n.textContent = WIDGETS.length + (WIDGETS.length === 1 ? ' widget' : ' widgets');
    const stage = $('#stage'); if (stage && !WIDGETS.length) stage.innerHTML = `<div class="hub-none"><p>${editing ? 'Add the first widget.' : 'Nothing here yet. This area fills up as its tools arrive, or you can add widgets in Edit layout.'}</p></div>`;
  }
  function adder() {
    const have = new Set(WIDGETS.map(w => w.id)); const left = Object.keys(CAT).filter(id => !have.has(id));
    const box = document.createElement('div'); box.className = 'hub-pick'; box.innerHTML = `<div class="hub-pick-in"><h3>Add a widget</h3>${left.length ? left.map(id => `<button class="su-btn" data-hub-pick="${id}"><span>${esc(CAT[id].t)}</span><small>${esc(CAT[id].sub)}</small></button>`).join('') : '<p class="hub-empty">Every widget is already here.</p>'}<button class="su-btn" data-hub-close><span>Close</span></button></div>`;
    document.body.appendChild(box); box.querySelector('button')?.focus();
  }
  document.addEventListener('click', async e => {
    const add = e.target.closest('[data-hub-add]'), rm = e.target.closest('[data-hub-rm]'), pk = e.target.closest('[data-hub-pick]'), cl = e.target.closest('[data-hub-close]'), bk = e.target.closest('[data-hub-backup]');
    if (add) { e.preventDefault(); e.stopPropagation(); adder(); return; }
    const rename=e.target.closest('[data-ws-rename]'), up=e.target.closest('[data-ws-up]'), down=e.target.closest('[data-ws-down]'), pin=e.target.closest('[data-ws-pin]'), del=e.target.closest('[data-ws-delete]');
    if (rename) { const w=wsNow(), name=prompt('Workspace name',w?.name||''); if(name?.trim()){w.name=name.trim().slice(0,40); WSN.splice(0,WSN.length,...H.ws.map(x=>x.name)); void put({workspaces:H.ws}); render();} return; }
    if (up || down) { const i=S.ws, j=i+(up?-1:1); if(j>=0&&j<H.ws.length){[H.ws[i],H.ws[j]]=[H.ws[j],H.ws[i]]; S.ws=j; WSN.splice(0,WSN.length,...H.ws.map(x=>x.name)); void put({workspaces:H.ws,workspace:wsNow().id}); render();} return; }
    if (pin) { const w=wsNow(); w.pinned=!w.pinned; void put({workspaces:H.ws}); render(); return; }
    if (del) { const w=wsNow(); if(w&&confirm(`Delete ${w.name}?`)){H.ws.splice(S.ws,1); S.ws=0; WSN.splice(0,WSN.length,...H.ws.map(x=>x.name)); void put({workspaces:H.ws,workspace:H.ws[0].id}); current=''; render();} return; }
    if (cl || (e.target.classList && e.target.classList.contains('hub-pick'))) { e.preventDefault(); document.querySelector('.hub-pick')?.remove(); return; }
    if (rm) { e.preventDefault(); e.stopPropagation(); const id = rm.dataset.hubRm, i = WIDGETS.findIndex(w => w.id === id); if (i >= 0) { WIDGETS.splice(i, 1); delete layout[id]; save(); render(); } return; }
    if (pk) { e.preventDefault(); e.stopPropagation(); const id = pk.dataset.hubPick; WIDGETS.push({ id, t: CAT[id].t, sub: CAT[id].sub, img: CAT[id].img, w: CAT[id].w, h: CAT[id].h }); const rows = Math.max(0, ...Object.values(layout).map(l => l.y + l.h)); layout[id] = { x: 0, y: rows, w: CAT[id].w, h: CAT[id].h }; document.querySelector('.hub-pick')?.remove(); save(); render(); return; }
    if (bk) { e.preventDefault(); e.stopPropagation(); bk.disabled = true; await post('/api/backup'); await refresh(); render(); return; }
    // moving and resizing end with a click or a pointer-up: save what the board looks like then
    if (e.target.closest('[data-size]')) save();
  }, true);
  document.addEventListener('pointerdown', e => { if (e.target.closest('[data-hub-rm]')) e.stopPropagation(); }, true);   // the header starts a drag on pointer-down; the remove button must not
  document.addEventListener('pointerup', () => { if (editing) save(); });
  document.addEventListener('input', e => { const f = e.target.closest?.('.hm-form'); if (f) H.draft[f.dataset.hm] = e.target.value; });
  document.addEventListener('submit', async e => {
    const f = e.target.closest?.('.hm-form'); if (!f) return; e.preventDefault();
    const k = f.dataset.hm, v = (new FormData(f).get('v') || '').trim(); if (!v) return;
    f.querySelector('button').disabled = true; H.draft[k] = '';
    if (k === 'chat') { window.CX?.ask?.(v); return; }
    if (k === 'capture') {
      const name = v.replace(/[^\p{L}\p{N} _.()-]/gu, '').trim().slice(0, 40).replace(/^[^\p{L}\p{N}]+/u, '');
      for (let n = 1; n < 6; n++) { const r = await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name ? name + (n > 1 ? ' ' + n : '') : undefined, content: v }) }); if (r.status === 409) continue; if (r.ok) H.saved = (await r.json()).id; break; }
    } else if (k === 'goal') await fetch('/api/p/goals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ horizon: 'day', title: v }) });
    await refresh(); render();
  }, true);
  document.addEventListener('click', e => { const n = e.target.closest?.('[data-hm-note]'); if (n) { try { localStorage.setItem('caesaros-brain-graph-view', JSON.stringify({ ...JSON.parse(localStorage.getItem('caesaros-brain-graph-view') || '{}'), selected: n.dataset.hmNote })); } catch { /* the Notes page opens without the note selected */ } } }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelector('.hub-pick')?.remove(); });

  (async () => { await loadBoard(); await refresh(); render(); setInterval(async () => { await refresh(); if (!editing && !document.activeElement.matches('input,textarea')) render(); }, 20000); })();
})();
