/* Business workspace, three optional modules, code only, empty at start: Business (Overview, Finances, Progress, Reach),
   Fleet (read-only rows for servers you run for others) and Leads (Scout and Analyst pipeline that waits for your yes).
   Each is a module in plugins/ with its own on/off switch (here and in Settings > Apps). Charts come from viz.js. Nothing here
   sends anything anywhere: Fleet only asks a server how it is, Leads only records your yes. Colours are tokens only. */
(() => {
  const E = s => (typeof OGE === 'function' ? OGE(s) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const J = { 'content-type': 'application/json' };
  const call = async (m, u, b) => { try { const r = await fetch(u, { method: m, headers: b === undefined ? undefined : J, body: b === undefined ? undefined : JSON.stringify(b) }); return { ok: r.ok, data: await r.json().catch(() => null) }; } catch { return { ok: false, data: null }; } };
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window: the view just is not remembered */ } } };

  const TABS = ['Overview', 'Finances', 'Progress', 'Reach'];
  const STAGES = [['scouted', 'Scouted'], ['scored', 'Scored'], ['offer', 'Offer drafted'], ['approved', 'Approved'], ['declined', 'Declined']];
  const B = {
    tab: TABS.includes(store.get('cx-biz-tab')) ? store.get('cx-biz-tab') : 'Overview',
    plug: null,                 // ids of the modules the core runs now; null while loading
    board: null, reach: null, servers: null, leads: null, status: null, loadingStatus: false,
    f: {}, sel: null, msg: '', err: ''
  };
  const running = id => !!(B.plug && B.plug.includes(id));
  const again = () => { if (typeof render === 'function') render(); };
  const field = (id, ph, extra = '') => `<input class="og-input" id="bz-${id}" data-bzf="${id}" value="${E(B.f[id] || '')}" placeholder="${E(ph)}" ${extra}>`;
  const act = (k, label, cls = '') => `<button class="btn ${cls}" data-bz="${E(k)}">${E(label)}</button>`;
  const ago = t => { if (!t) return '-'; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const loading = () => ARTSTATE('loading', 'Loading from this device…');
  const failed = t => ARTSTATE('error', t, 'Nothing was changed. Try again in a moment.');
  const note = () => (B.msg ? `<p role="status" class="og-tag mut" style="justify-self:start">${E(B.msg)}</p>` : '');

  /* ---------- loading ---------- */
  async function loadPlug() { const r = await call('GET', '/api/plugins'); B.plug = r.ok && Array.isArray(r.data) ? r.data.map(m => m.id) : []; again(); }
  async function loadFor(name) {
    if (!B.plug) { void loadPlug(); return false; }
    const want = name === 'Business' ? { board: '/api/board', reach: running('business') && '/api/p/business/reach', servers: running('fleet') && '/api/p/fleet/servers', leads: running('leads') && '/api/p/leads/leads' }
      : name === 'Fleet' ? { servers: '/api/p/fleet/servers' } : { leads: '/api/p/leads/leads' };
    let need = false;
    for (const [k, u] of Object.entries(want)) {
      if (!u || B[k] !== null) continue; need = true; B[k] = undefined;
      call('GET', u).then(r => { B[k] = r.ok && Array.isArray(r.data) ? r.data : false; if (k === 'servers' && name === 'Fleet' && B[k]) void loadStatus(); again(); });
    }
    return !need || Object.keys(want).every(k => !want[k] || B[k] !== undefined);
  }
  async function loadStatus() {
    if (B.loadingStatus) return; B.loadingStatus = true; again();
    const r = await call('GET', '/api/p/fleet/status'); B.status = r.ok && Array.isArray(r.data) ? r.data : false; B.loadingStatus = false; B.checked = Date.now(); again();
  }

  /* ---------- the switch: server module plus the menu entry ---------- */
  const off = (id, name, text) => `<div class="nx-view enter">${nsHead(name, text, '', SCN[name])}<div class="og-wrap">${ARTSTATE('empty', name + ' is switched off', 'Its data stays. Switch it on to use it again.')}<div class="og-row">${act('mod:' + id + ':on', 'Switch on')}</div></div></div>`;
  const switcher = (id, label) => `<div class="og-row">${act('mod:' + id + ':off', 'Switch ' + label + ' off', 'ghost')}</div>`;
  const SCN = { Business: 'rations', Fleet: 'fleet', Leads: 'news' };
  const MODNAME = { business: 'Business', fleet: 'Fleet', leads: 'Leads' };
  async function setMod(id, on) {
    const r = await call('PUT', `/api/plugins/${id}/enabled`, { enabled: on });
    if (!r.ok) { B.msg = 'The switch did not work. Try again.'; return again(); }
    if (typeof OGS !== 'undefined' && OGS.mods) on ? OGS.mods.add(MODNAME[id]) : OGS.mods.delete(MODNAME[id]);
    B.plug = null; B[id === 'fleet' ? 'servers' : id === 'leads' ? 'leads' : 'reach'] = null; if (id === 'fleet') B.status = null;
    B.msg = on ? 'Switched on.' : 'Switched off. Its data stays.'; void loadPlug();
  }

  /* ---------- Business ---------- */
  const boardStats = () => { const b = Array.isArray(B.board) ? B.board : []; return { todo: b.filter(t => t.status === 'todo').length, doing: b.filter(t => t.status === 'doing').length, done: b.filter(t => t.status === 'done').length, n: b.length }; };
  /* newest value per label, with the one before it */
  const reachSeries = () => { const m = new Map(); for (const p of (B.reach || [])) { const a = m.get(p.label) || []; a.push(p); m.set(p.label, a); } return [...m].map(([label, a]) => { a.sort((x, y) => x.at - y.at); const last = a[a.length - 1], prev = a[a.length - 2]; return { label, last, prev, min: Math.min(...a.map(p => p.value)), max: Math.max(...a.map(p => p.value)), n: a.length }; }); };
  const fmt = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1e4 ? (n / 1e3).toFixed(1) + ' k' : String(Math.round(n * 100) / 100));

  const overview = () => {
    const s = boardStats(), rs = reachSeries(), lead = Array.isArray(B.leads) ? B.leads : null, srv = Array.isArray(B.servers) ? B.servers : null;
    const tiles = vzTiles([
      vzTile('Open on the board', s.todo + s.doing, s.n ? s.doing + ' in progress' : 'no cards yet', 'a'),
      vzTile('Done', s.done, s.n ? Math.round(s.done / s.n * 100) + ' percent of cards' : '', 's'),
      vzTile('Reach numbers', rs.length, rs.length ? 'newest ' + ago(Math.max(...rs.map(r => r.last.at))) : 'none recorded', 'm'),
      vzTile('Leads', lead ? lead.filter(l => l.stage !== 'declined').length : '-', lead ? lead.filter(l => l.stage === 'approved').length + ' approved by you' : 'module off', 'g'),
      vzTile('Servers', srv ? srv.length : '-', srv ? 'in the fleet' : 'module off', 'a')
    ]);
    const mod = (id, name, sub, openName) => `<div>${I('plugin', 16)}<span>${E(name)} <small>${E(sub)}</small></span><span class="og-row">${running(id) ? `<button class="btn" data-open-app="${E(openName)}">Open</button>${act('mod:' + id + ':off', 'Switch off', 'ghost')}` : act('mod:' + id + ':on', 'Switch on')}</span></div>`;
    return `${tiles}<div class="og-sec">Modules in this workspace</div><div class="og-list">${mod('fleet', 'Fleet', 'Servers you run for others, read only', 'Fleet')}${mod('leads', 'Leads', 'A Scout and an Analyst find people; you decide', 'Leads')}</div>
      ${s.n || rs.length ? '' : vzEmpty('Nothing recorded yet', 'This page fills in as you use the board, record reach numbers and switch on Finance. Nothing is invented here.')}`;
  };

  const finances = () => running('finance')
    ? `<div class="og-card"><h4>Finance</h4><p>Figures, snapshots and reports live in the Finance module. This page never copies them.</p><div class="og-act"><span></span><button class="btn" data-open-app="Finance">Open Finance</button></div></div>`
    : vzEmpty('No finance figures here', 'Income, costs and reports come from the Finance module. Switch it on in Settings, Apps, and open it from here.');

  const progress = () => {
    const s = boardStats();
    if (!s.n) return vzEmpty('No cards on the board', 'Progress is read from the Board: what waits, what is under way and what is done. Add a card there and it shows up here.');
    return vzTiles([vzTile('Done', s.done, Math.round(s.done / s.n * 100) + ' percent', 's'), vzTile('In progress', s.doing, '', 'a'), vzTile('Waiting', s.todo, '', 'g')])
      + vzStack([['Done', s.done, 's'], ['In progress', s.doing, 'a'], ['Waiting', s.todo, 'g']])
      + vzBars([['Finished', s.done / s.n * 100, s.done + ' of ' + s.n, 's']]);
  };

  const reach = () => {
    const rs = reachSeries(), peak = Math.max(1, ...rs.map(r => r.last.value));
    const rows = (B.reach || []).slice().sort((a, b) => b.at - a.at).slice(0, 12);
    return `${rs.length ? vzBars(rs.map(r => [r.label, r.last.value / peak * 100, fmt(r.last.value) + (r.prev ? (r.last.value >= r.prev.value ? ' up ' : ' down ') + fmt(Math.abs(r.last.value - r.prev.value)) : ''), 'm', true])) + (rs.some(r => r.n > 1) ? `<div class="og-sec">Lowest to highest so far</div>` + vzRange(rs.filter(r => r.n > 1).map(r => [r.label, r.min, r.max, fmt(r.min) + ' to ' + fmt(r.max), true])) : '')
      : vzEmpty('No reach numbers yet', 'Record a number you follow, for example visits or followers, now and then. A chart builds from what you record. Nothing is collected for you.')}
      <div class="og-sec">Record a number</div>
      <div class="og-card"><div class="og-row" style="flex-wrap:wrap">${field('rl', 'What it counts, for example Visits', 'maxlength="40" aria-label="What it counts"')}${field('rv', 'Value', 'inputmode="decimal" aria-label="Value" style="max-width:140px"')}${act('reach:add', 'Add')}</div>${note()}</div>
      ${rows.length ? `<div class="og-sec">Latest entries</div><div class="og-list">${rows.map(p => `<div>${I('check', 14)}<span><span data-no-i18n>${E(p.label)}</span> <small>${fmt(p.value)} · ${ago(p.at)}</small></span>${act('reach:rm:' + p.id, 'Remove', 'ghost')}</div>`).join('')}</div>` : ''}`;
  };

  function businessView() {
    const head = nsHead('Business', 'One page for the state of the business: overview, finances, progress and reach. It starts empty and shows only what is recorded.', 'Negotium', 'rations');
    if (B.plug && !running('business')) return off('business', 'Business', 'One page for the state of the business.');
    void loadFor('Business');
    const waiting = !B.plug || B.board === undefined || B.board === null || (running('business') && (B.reach === undefined || B.reach === null));
    const bad = B.board === false;
    const body = waiting ? loading() : bad ? failed('The board could not be read') : B.tab === 'Finances' ? finances() : B.tab === 'Progress' ? progress() : B.tab === 'Reach' ? reach() : overview();
    return `<div class="nx-view enter">${head}<div class="og-wrap"><div class="pg-bar"><div class="og-seg" role="tablist">${TABS.map(t => `<button role="tab" aria-selected="${t === B.tab}" class="${t === B.tab ? 'on' : ''}" data-bz="tab:${t}">${t}</button>`).join('')}</div><span style="flex:1"></span></div>${body}</div></div>`;
  }

  /* ---------- Fleet ---------- */
  const fleetRow = r => `<div class="og-card"><div class="og-row" style="justify-content:space-between"><h4 data-no-i18n>${E(r.name)}</h4><span class="og-tag ${r.reachable ? 'sig' : 'mut'}">${r.reachable ? 'Reachable' : 'No answer'}</span></div>
    <p><small data-no-i18n>${E(r.url)}${r.version ? ' · v' + E(r.version) : ''}${r.ms != null ? ' · ' + r.ms + ' ms' : ''}</small></p>
    ${r.reachable ? `${r.diskPct != null ? vzRow('Disk', r.diskPct, r.diskPct + '% used', r.diskPct > 85 ? 'd' : r.diskPct > 70 ? 'g' : 's') : ''}${r.memPct != null ? vzRow('Memory', r.memPct, r.memPct + '% used', r.memPct > 90 ? 'd' : r.memPct > 75 ? 'g' : 'a') : ''}${r.load != null ? vzRow('Load', Math.min(100, r.load * 100), r.load + ' per core', r.load > 1 ? 'd' : 'a') : ''}${r.diskPct == null && r.memPct == null ? '<p><small>This server only reports that it is up. Switch the Fleet module on there for disk, memory and load.</small></p>' : ''}` : `<p><small>${E(r.error || 'No answer')}. Check the address, or that the server is on.</small></p>`}
    <div class="og-act"><span></span>${act('fleet:rm:' + r.id, 'Remove from the list', 'ghost')}</div></div>`;
  function fleetView() {
    const s = 'The servers where you installed CAESAR for other people: reachable or not, disk, memory, load, version. Read only: it asks how they are and never changes one.';
    if (B.plug && !running('fleet')) return off('fleet', 'Fleet', s);
    void loadFor('Fleet');
    let body;
    if (!B.plug || B.servers === undefined || B.servers === null) body = loading();
    else if (B.servers === false) body = failed('The server list could not be read');
    else if (!B.servers.length) body = vzEmpty('No servers yet', 'Add the address of a server to see whether it answers, and how it is doing. Nothing is checked until you add one.');
    else body = B.loadingStatus || B.status == null ? loading() : B.status === false ? failed('The servers could not be checked')
      : vzTiles([vzTile('Reachable', B.status.filter(r => r.reachable).length + ' / ' + B.status.length, 'checked ' + ago(B.checked), 's'), vzTile('Not answering', B.status.filter(r => !r.reachable).length, '', B.status.some(r => !r.reachable) ? 'd' : 's')]) + `<div class="og-grid">${B.status.map(fleetRow).join('')}</div>`;
    return `<div class="nx-view enter">${nsHead('Fleet', s, 'Classis', 'fleet')}<div class="og-wrap">
      <div class="og-card"><div class="og-row" style="flex-wrap:wrap">${field('fn', 'Name, for example Client A', 'maxlength="40" aria-label="Server name"')}${field('fu', 'https://address', 'inputmode="url" aria-label="Server address"')}${act('fleet:add', 'Add server')}${B.servers && B.servers.length ? act('fleet:refresh', 'Check now', 'ghost') : ''}</div>${note()}</div>
      ${body}${switcher('fleet', 'Fleet')}</div></div>`;
  }

  /* ---------- Leads ---------- */
  const leadCard = l => `<div class="og-card${B.sel === l.id ? '" style="border-color:var(--accent)' : ''}"><h4 style="font-size:13px" data-no-i18n>${E(l.name)}</h4><p${l.site ? ' data-no-i18n' : ''}>${E(l.site || 'no site listed')}</p>
    ${l.score != null ? vzRow('Needs a new site', l.score, l.score + ' of 100', l.score >= 70 ? 'g' : l.score >= 40 ? 'a' : 's') : '<p><small>Not scored yet</small></p>'}
    <div class="og-act"><span class="og-tag mut"><span data-no-i18n>${E(l.by)}</span> · <span>${ago(l.at)}</span></span>${act('lead:open:' + l.id, B.sel === l.id ? 'Close' : 'Open', 'ghost')}</div></div>`;
  const leadPanel = l => `<div class="og-card" style="border-color:var(--accent)"><div class="og-row" style="justify-content:space-between"><h4 data-no-i18n>${E(l.name)}</h4><span class="og-tag">${E((STAGES.find(s => s[0] === l.stage) || [0, l.stage])[1])}</span></div>
    <p><small${l.site || l.note ? ' data-no-i18n' : ''}>${E(l.site || 'no site listed')}${l.note ? ' · ' + E(l.note) : ''}</small></p>
    <div class="og-row" style="flex-wrap:wrap"><input class="og-input" id="bz-sc" data-bzf="sc" inputmode="numeric" placeholder="Score 0 to 100" aria-label="Score" style="max-width:150px" value="${E(B.f.sc != null ? B.f.sc : l.score != null ? l.score : '')}">${act('lead:score:' + l.id, 'Set score', 'ghost')}${act('lead:draft:' + l.id, l.offer ? 'Write a new draft' : 'Write a draft', 'ghost')}</div>
    <textarea class="og-input" id="bz-offer" data-bzf="offer" rows="8" aria-label="Offer draft" placeholder="The offer draft appears here. Edit it freely." style="width:100%;margin-top:8px;clip-path:none">${E(B.f.offer != null ? B.f.offer : l.offer)}</textarea>
    <div class="og-act"><span class="og-tag mut">Nothing is sent from here</span><span class="og-row">${act('lead:save:' + l.id, 'Save text', 'ghost')}${l.stage === 'approved' || l.stage === 'declined' ? act('lead:reopen:' + l.id, 'Reopen', 'ghost') : act('lead:decline:' + l.id, 'Not interested', 'ghost') + act('lead:approve:' + l.id, 'Yes, approve')}</span></div>
    ${l.stage === 'approved' ? '<p role="status"><small>You said yes. What happens next is your own step: CAESAR does not contact anyone.</small></p>' : ''}${note()}</div>`;
  function leadsView() {
    const s = 'Leads for a web studio. A Scout finds people, an Analyst scores how much each site needs replacing, and a draft waits for your yes. Nothing is ever sent from here.';
    if (B.plug && !running('leads')) return off('leads', 'Leads', s);
    void loadFor('Leads');
    let body;
    if (!B.plug || B.leads === undefined || B.leads === null) body = loading();
    else if (B.leads === false) body = failed('The leads could not be read');
    else {
      const sel = B.leads.find(l => l.id === B.sel);
      body = (B.leads.length ? '' : vzEmpty('No leads yet', 'Your Scout agent adds people it finds, your Analyst scores them, and you can add one by hand below. Each lead waits for your yes.'))
        + `<div class="pg-lanes">${STAGES.map(([k, n]) => { const c = B.leads.filter(l => l.stage === k); return `<div class="pg-lane"><h5>${n}<span>${c.length}</span></h5>${c.length ? c.map(leadCard).join('') : '<div class="pg-slot"></div>'}</div>`; }).join('')}</div>${sel ? leadPanel(sel) : ''}`;
    }
    return `<div class="nx-view enter">${nsHead('Leads', s, 'Venatio', 'news')}<div class="og-wrap">
      <div class="og-card"><div class="og-row" style="flex-wrap:wrap">${field('ln', 'Name, for example Baker, Gdansk', 'maxlength="80" aria-label="Lead name"')}${field('ls', 'Website', 'inputmode="url" aria-label="Website"')}${act('lead:add', 'Add lead')}</div>${B.sel ? '' : note()}</div>
      ${body}${switcher('leads', 'Leads')}</div></div>`;
  }

  /* ---------- events ---------- */
  document.addEventListener('input', e => { const k = e.target && e.target.dataset && e.target.dataset.bzf; if (k) B.f[k] = e.target.value; });
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-bz]'); if (!t) return;
    const p = t.dataset.bz.split(':'), k = p[0];
    B.msg = '';
    if (k === 'tab') { B.tab = p[1]; store.set('cx-biz-tab', B.tab); return again(); }
    if (k === 'mod') return void setMod(p[1], p[2] === 'on');
    if (k === 'reach') {
      if (p[1] === 'rm') { await call('DELETE', '/api/p/business/reach/' + encodeURIComponent(p[2])); B.reach = null; return again(); }
      const value = Number(String(B.f.rv || '').replace(',', '.'));
      const r = await call('POST', '/api/p/business/reach', { label: B.f.rl || '', value: B.f.rv === undefined || B.f.rv === '' ? NaN : value });
      if (!r.ok) { B.msg = (r.data && r.data.error) || 'Could not record it.'; return again(); }
      B.f.rv = ''; B.reach = null; B.msg = 'Recorded.'; return again();
    }
    if (k === 'fleet') {
      if (p[1] === 'refresh') return void loadStatus();
      if (p[1] === 'rm') { await call('DELETE', '/api/p/fleet/servers/' + encodeURIComponent(p[2])); B.servers = null; B.status = null; return again(); }
      const r = await call('POST', '/api/p/fleet/servers', { name: B.f.fn || '', url: B.f.fu || '' });
      if (!r.ok) { B.msg = (r.data && r.data.error) || 'Could not add it.'; return again(); }
      B.f.fn = B.f.fu = ''; B.servers = null; B.status = null; return again();
    }
    if (k === 'lead') {
      const id = p[2], base = '/api/p/leads/leads';
      if (p[1] === 'add') { const r = await call('POST', base, { name: B.f.ln || '', site: B.f.ls || '' }); if (!r.ok) B.msg = (r.data && r.data.error) || 'Could not add it.'; else { B.f.ln = B.f.ls = ''; B.sel = r.data.id; } B.leads = null; return again(); }
      if (p[1] === 'open') { B.sel = B.sel === id ? null : id; delete B.f.offer; delete B.f.sc; return again(); }
      let r;
      if (p[1] === 'score') r = await call('PATCH', `${base}/${id}`, { score: Number(B.f.sc) });
      else if (p[1] === 'save') r = await call('PATCH', `${base}/${id}`, { offer: B.f.offer !== undefined ? B.f.offer : '' });
      else r = await call('POST', `${base}/${id}/${p[1]}`);
      if (!r.ok) B.msg = (r.data && r.data.error) || 'That did not work.'; else { B.msg = p[1] === 'approve' ? 'Recorded your yes. Nothing was sent.' : 'Saved.'; delete B.f.offer; delete B.f.sc; }
      B.leads = null; return again();
    }
  });

  register({ id: 'business-modules', views: { Business: businessView, Fleet: fleetView, Leads: leadsView } });
})();
