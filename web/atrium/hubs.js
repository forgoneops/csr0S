/* Hubs: each top workspace tab (Main, Daily, Knowledge, ...) is a page of live widgets for that area. Widgets move, resize,
   are removed and added, and the board is saved on this machine. Every widget shows real data or says it has none. */
(() => {
  const get = async (u, f) => { try { const r = await fetch(u); return r.ok ? await r.json() : f; } catch { return f; } };
  const put = (b) => fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const post = (u) => fetch(u, { method: 'POST' });
  const MAIN_WIDGETS = ['crew', 'approvals', 'conversations', 'notes', 'engines', 'backup'];   // the only workspace a fresh install gets
  const CAT = {   // the widgets that exist, each on real data. w and h are grid cells (12 columns).
    crew: { t: 'The crew', sub: 'who is working', img: 'lair-ember', w: 4, h: 3, open: 'Crew' },
    approvals: { t: 'Waiting for you', sub: 'approvals', img: 'hero-ember', w: 4, h: 3, open: 'Chat' },
    conversations: { t: 'Conversations', sub: 'recent', img: 'hero-throne-ember', w: 4, h: 3, open: 'Chat' },
    notes: { t: 'Notes', sub: 'recent', img: 'lair-ember', w: 4, h: 3, open: 'Memory' },
    knowledge: { t: 'Knowledge', sub: 'documents', img: 'hero-ember', w: 4, h: 2, open: 'Memory' },
    engines: { t: 'Tools and engines', sub: 'status', img: 'hero-throne-ember', w: 4, h: 3, open: 'Start' },
    backup: { t: 'Backup', sub: 'your data', img: 'lair-ember', w: 4, h: 2, open: 'Start' },
    machine: { t: 'This machine', sub: 'memory and disk', img: 'hero-ember', w: 4, h: 2, open: 'Start' },
    running: { t: 'Running now', sub: 'turns', img: 'hero-throne-ember', w: 4, h: 2, open: 'Chat' },
    calendar: { t: 'Calendar', sub: 'this month', img: 'lair-ember', w: 8, h: 4, open: 'Schedule' },
  };
  window.HUB_CAT = CAT;                                // real.js adds the Board and Usage widgets to this catalog
  WIDGETS.splice(0, WIDGETS.length);                   // the prototype's invented widgets never show: an empty board until the real one loads
  try { render(); } catch { /* the first paint comes again once the board is loaded */ }
  const H = { notes: [], docs: 0, backups: [], hw: null, running: 0, ws: null, loaded: false };
  let current = '';                                    // the workspace whose widgets are loaded into WIDGETS
  let saveT = 0, savedKey = '';

  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const empty = t => `<div class="t-body t-framed"><p class="hub-empty">${esc(t)}</p></div>`;
  const list = rows => `<div class="t-body t-framed"><ul class="nx-list">${rows.join('')}</ul></div>`;
  const dot = st => `<span class="nx-dot ${st === 'work' ? 'work' : st === 'wait' ? 'wait' : st === 'ok' ? 'ok' : ''}"></span>`;
  BODY.crew = () => CREW.length ? list(CREW.map(m => `<li><button class="hub-li" data-ns="crew:${esc(m.id)}">${dot(m.st)}<span><b>${esc(m.n)}</b> <small>${esc(m.r)}${m.st === 'work' ? ' · working' : ''}</small></span></button></li>`)) : empty('No crew found. Hermes profiles appear here.');
  BODY.approvals = () => S.waiting.length ? list(S.waiting.map(w => `<li class="hub-ap"><span>${esc(w.t)}</span><span class="hub-apb"><button class="su-btn go" data-ph-ok="${esc(w.k)}"><span>Approve</span></button><button class="su-btn" data-ph-no="${esc(w.k)}"><span>Not now</span></button></span></li>`)) : empty('Nothing is waiting for you.');
  BODY.conversations = () => THREADS.length ? list(THREADS.slice(0, 6).map(t => `<li><button class="hub-li" data-ses="${esc(t.id)}">${dot((C[t.a] || {}).st)}<span><b>${esc(t.t)}</b> <small>${esc((C[t.a] || {}).n || '')} · ${esc(t.s)}</small></span></button></li>`)) : empty('No conversations yet.');
  BODY.notes = () => H.notes.length ? list(H.notes.slice(0, 6).map(n => `<li><button class="hub-li" data-open-app="Memory">${dot('ok')}<span><b>${esc(n.id)}</b> <small>${ago(n.updatedAt)}</small></span></button></li>`)) : empty('No notes yet.');
  BODY.knowledge = () => `<div class="t-body t-framed"><p class="hub-big">${H.docs}</p><p class="hub-empty">${H.docs === 1 ? 'document' : 'documents'} you added. Chat can use them as context.</p></div>`;
  BODY.engines = () => { const t = (window.TARGETS_ALL || []); return t.length ? list(t.filter(x => x.group !== 'crew').map(x => `<li><button class="hub-li" data-open-app="Start">${dot(x.ok ? 'ok' : 'wait')}<span><b>${esc(x.label)}</b> <small>${x.ok ? 'ready' : esc(x.detail || 'not available')}</small></span></button></li>`)) : empty('Checking…'); };
  BODY.backup = () => `<div class="t-body t-framed"><p class="hub-empty">${H.backups.length ? 'Last backup ' + ago(H.backups[0].at || H.backups[0].time || Date.now()) : 'No backup yet.'}</p><button class="su-btn go" data-hub-backup>${I('download', 16)}<span>Back up now</span></button></div>`;
  BODY.machine = () => H.hw ? `<div class="t-body t-framed"><p class="hub-big">${H.hw.machine.ramGb} GB</p><p class="hub-empty">memory · ${H.hw.machine.freeDiskGb} GB free disk · ${H.hw.machine.cores} cores${H.hw.machine.gpu !== 'none' ? ' · ' + H.hw.machine.gpu.toUpperCase() : ''}</p></div>` : empty('Reading…');
  BODY.running = () => `<div class="t-body t-framed"><p class="hub-big">${H.running}</p><p class="hub-empty">${H.running === 1 ? 'turn' : 'turns'} running.</p><button class="su-btn" data-nx="stop-all" ${H.running ? '' : 'disabled'}><span>Stop everything</span></button></div>`;

  async function refresh() {
    const [notes, docs, bk, hw, run, targets] = await Promise.all([get('/api/notes', []), get('/api/knowledge', []), get('/api/backup', []), get('/api/hardware', null), get('/api/running', { count: 0 }), get('/api/chat-targets', [])]);
    H.notes = (Array.isArray(notes) ? notes : []).sort((a, b) => b.updatedAt - a.updatedAt); H.docs = Array.isArray(docs) ? docs.length : 0; H.backups = Array.isArray(bk) ? bk : (bk.backups || []); H.hw = hw; H.running = run.count || 0; window.TARGETS_ALL = targets; H.loaded = true;
  }
  async function loadBoard() {
    const set = await get('/api/settings', null); if (!set || !Array.isArray(set.workspaces)) return;
    H.ws = set.workspaces;
    // A fresh install has one workspace, Main; the rest appear when the person creates them.
    if (!H.ws.some(w => w.id === 'main')) { H.ws = [{ id: 'main', name: 'Main', widgets: MAIN_WIDGETS, layout: {} }, ...H.ws]; void put({ workspaces: H.ws }); }
    WSN.splice(0, WSN.length, ...H.ws.map(w => w.name));
  }
  const wsNow = () => H.ws && H.ws[S.ws];

  function loadWorkspace() {     // put the current workspace's widgets and layout where the prototype's grid reads them
    const w = wsNow(); if (!w) return; if (current === w.id) return; current = w.id;
    WIDGETS.splice(0, WIDGETS.length, ...w.widgets.filter(id => CAT[id]).map(id => ({ id, t: CAT[id].t, sub: CAT[id].sub, img: CAT[id].img, w: CAT[id].w, h: CAT[id].h })));
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
    const head = $('.at-workspace-head');
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
    if (cl || (e.target.classList && e.target.classList.contains('hub-pick'))) { e.preventDefault(); document.querySelector('.hub-pick')?.remove(); return; }
    if (rm) { e.preventDefault(); e.stopPropagation(); const id = rm.dataset.hubRm, i = WIDGETS.findIndex(w => w.id === id); if (i >= 0) { WIDGETS.splice(i, 1); delete layout[id]; save(); render(); } return; }
    if (pk) { e.preventDefault(); e.stopPropagation(); const id = pk.dataset.hubPick; WIDGETS.push({ id, t: CAT[id].t, sub: CAT[id].sub, img: CAT[id].img, w: CAT[id].w, h: CAT[id].h }); const rows = Math.max(0, ...Object.values(layout).map(l => l.y + l.h)); layout[id] = { x: 0, y: rows, w: CAT[id].w, h: CAT[id].h }; document.querySelector('.hub-pick')?.remove(); save(); render(); return; }
    if (bk) { e.preventDefault(); e.stopPropagation(); bk.disabled = true; await post('/api/backup'); await refresh(); render(); return; }
    // moving and resizing end with a click or a pointer-up: save what the board looks like then
    if (e.target.closest('[data-size]')) save();
  }, true);
  document.addEventListener('pointerdown', e => { if (e.target.closest('[data-hub-rm]')) e.stopPropagation(); }, true);   // the header starts a drag on pointer-down; the remove button must not
  document.addEventListener('pointerup', () => { if (editing) save(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelector('.hub-pick')?.remove(); });

  (async () => { await loadBoard(); await refresh(); render(); setInterval(async () => { await refresh(); if (!editing && !document.activeElement.matches('input,textarea')) render(); }, 20000); })();
})();
