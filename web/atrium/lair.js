/* The Lair and the Praetorium: two live scenes of the crew, and the crew keeper that fills every empty state.
   Crew page: the troop around the fire, wall consoles that light when someone works, a spark from Caesar to whoever gets
   work, and sheets to hire, rename and retire. Command page (Praetorium): the same troop around the orders table, what waits
   on you as scrolls on it, and an Admin tab with the disks and the machine. The scene is a small pixel canvas (one 4 px cell
   per square, about 30 frames a second, stopped when the page leaves or Motion is off); colours are read from the palette
   tokens and re-read when the palette changes. Everything is also reachable without the scene: cards, lists and buttons. */
(() => {
  const E = s => (typeof OGE === 'function' ? OGE(s) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const J = { 'content-type': 'application/json' };
  const g = async (u, d) => { try { const r = await fetch(u); if (r.status === 401) { location.href = '/login'; return d; } return r.ok ? await r.json() : d; } catch { return d; } };
  const send = async (u, m, b) => { try { const r = await fetch(u, { method: m, headers: J, body: JSON.stringify(b || {}) }); if (r.status === 401) location.href = '/login'; return { ok: r.ok, j: await r.json().catch(() => ({})) }; } catch { return { ok: false, j: {} }; } };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private window: the tab simply is not remembered */ } return null; };
  const crewList = () => (typeof CREW === 'undefined' ? [] : CREW);
  const again = () => { if (typeof render === 'function') render(); };
  const head = (n, s, l) => (typeof ogHead === 'function' ? ogHead(n, s, l) : `<h2>${E(n)}</h2><p>${E(s)}</p>`);

  const L = { tab: { Crew: store('lr-tab-Crew') || 'Troop', Command: store('lr-tab-Command') || 'Overview' }, sheet: null, retired: null, adm: null, orch: null, ap: null, err: '', busy: false, at: { adm: 0, orch: 0 } };
  const TABS = { Crew: ['Troop', 'Retired'], Command: ['Overview', 'Admin', 'Prompts'] };

  /* ---------- where each figure stands: pure, so a test can check it ---------- */
  /** Positions in percent of the stage. The lair: Caesar at the top of a ring, the rest evenly round the fire.
   *  The Praetorium: the same ring round the orders table, a little lower. */
  const place = (n, mode, lead) => {
    const cx = 50, cy = mode === 'table' ? 55 : 60, rx = mode === 'table' ? 40 : 38, ry = mode === 'table' ? 30 : 30;
    return Array.from({ length: n }, (_, i) => { const k = (i - lead + n) % n, a = (-90 + 360 * k / n) * Math.PI / 180; return { x: +(cx + rx * Math.cos(a)).toFixed(1), y: +(cy + ry * Math.sin(a)).toFixed(1) }; });
  };
  window.xLairPlace = place;

  /* ---------- the crew keeper: a crew figure with one line, for every empty state ---------- */
  const KEEP = {
    library: ['varro', 'Varro', 'art/caesaros-crew-varro.webp', 'Bring me something to keep and I will shelve it.'],
    board: ['balbus', 'Balbus', 'art/caesaros-crew-balbus.webp', 'Nothing on the board. Give me the first task and I will keep count.'],
    media: ['agrippa', 'Agrippa', 'art/caesaros-crew-agrippa.webp', 'No pictures yet. Import some, or ask me to draw one.'],
    notes: ['calpurnia', 'Calpurnia', 'art/caesaros-crew-calpurnia.webp', 'No notes yet. Say the first thing and I will write it down.'],
    crew: ['caesar', 'Caesar', 'art/caesaros-caesar-neo.webp', 'The troop is not here yet. Hire the first one.'],
  };
  /** An empty state with a crew figure and a line. `extra` is trusted markup for a button. */
  window.xKeeper = (kind, title, text = '', extra = '') => {
    const k = KEEP[kind] || KEEP.library, m = crewList().find(c => c.id === k[0]);
    return `<div class="lr lr-keeper" role="status"><span class="lr-kp" aria-hidden="true" style="--im:url(${E(k[2])})"></span><div class="lr-kb"><small>${E(m ? m.n : k[1])}</small><q>${E(k[3])}</q>${title ? `<b>${E(title)}</b>` : ''}${text ? `<p>${E(text)}</p>` : ''}${extra}</div></div>`;
  };

  /* ---------- the scene ---------- */
  const figHtml = (m, pos, st, cae, mode) => `<button class="lr-fig ${st}" type="button" data-lr="${mode === 'table' ? 'talk' : 'edit'}:${E(m.id)}" data-x="${pos.x}" data-y="${pos.y}" data-i18n-own data-st="${st}" data-caesar="${cae ? 1 : 0}" style="left:${pos.x}%;top:${pos.y}%" aria-label="${E(m.n)}, ${E(m.r)}, ${st === 'work' ? 'working' : st === 'wait' ? 'waits for you' : 'idle'}. ${mode === 'table' ? 'Talk to them' : 'Open'}"><span class="lr-pt"><i style="--im:url(${E(m.img)})"></i></span><span class="lr-dot"></span><b data-no-i18n>${E(m.n)}</b></button>`;
  const stageHtml = (mode, members, waits, label) => {
    const lead = Math.max(0, members.findIndex(m => m.id === 'caesar')), pos = place(members.length, mode, lead);
    return `<div class="lr lr-stage ${mode}" data-mode="${mode}" data-waits="${waits}" data-n="${members.length}" role="group" aria-label="${E(label)}"><span class="lr-bg" aria-hidden="true" style="--im:url(art/${mode === 'table' ? 'caesaros-scenes/praetorium' : 'lair-ember'}.webp)"></span><canvas class="lr-cv" aria-hidden="true"></canvas>${members.map((m, i) => figHtml(m, pos[i], m.st, i === lead && m.id === 'caesar', mode)).join('')}</div>`;
  };

  const css = el => getComputedStyle(document.documentElement).getPropertyValue(el).trim();
  const tokens = () => { const p1 = css('--p1') || css('--accent'), p2 = css('--p2') || css('--signal') || p1; return { p1, p2, gold: css('--gold') || css('--cx-gold') || p2, mag: css('--tint-magenta') || p1, ink: css('--ink') || css('--text') || p2, bg: css('--bg') || css('--bg-0') || '#000' }; };
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

  /** Runs the scene on one stage until it leaves the page. Motion off: one still frame. */
  function run(st) {
    const cv = st.querySelector('canvas'), ctx = cv.getContext('2d'), CELL = 4, table = st.dataset.mode === 'table';
    const figs = [...st.querySelectorAll('.lr-fig')].map(f => ({ x: +f.dataset.x / 100, y: +f.dataset.y / 100, st: f.dataset.st, cae: f.dataset.caesar === '1' }));
    const waits = Math.min(10, +st.dataset.waits || 0), lead = figs.find(f => f.cae);
    let W = 0, H = 0, T = tokens(), raf = 0, last = 0, spark = null, nextAt = 0, turn = 0, on = false;
    const embers = Array.from({ length: 22 }, (_, i) => ({ x: .5, y: .7, v: .2 + hash(i, 1) * .3, l: hash(i, 2) }));
    const size = () => { const r = st.getBoundingClientRect(); W = Math.max(40, Math.ceil(r.width / CELL)); H = Math.max(40, Math.ceil(r.height / CELL)); cv.width = W; cv.height = H; };
    const px = (x, y, w, h, c, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    const glow = (cx, cy, r, c, a) => { for (let d = -r; d <= r; d++) { const half = Math.round((r - Math.abs(d) * .55) * 1.5); if (half > 0) px(cx - half, cy + d, half * 2, 1, c, a); } };
    const pts = { work: figs.filter(f => f.st === 'work' && !f.cae), wait: figs.filter(f => f.st === 'wait') };
    const hub = table ? { x: .5, y: .55 } : { x: .5, y: .66 };
    const at = (f, t) => ({ x: f.x * W, y: f.y * H });

    function draw(t, dt, live) {
      ctx.clearRect(0, 0, W, H);
      const hx = hub.x * W, hy = hub.y * H;
      /* wall consoles: one per member along the back wall, lit when that member works, a gold mark when one waits for you */
      const n = figs.length, cw = Math.max(6, Math.min(24, Math.floor(W * .8 / n) - 2));
      figs.forEach((f, i) => {
        const x = W * (.1 + .8 * (i + .5) / n) - cw / 2, y = 3, h = 9, w = f.st === 'work', q = f.st === 'wait';
        px(x, y, cw, h, T.p2, w ? .30 : .08); px(x, y, cw, 1, T.p2, .5); px(x, y + h - 1, cw, 1, T.p2, .5); px(x, y, 1, h, T.p2, .5); px(x + cw - 1, y, 1, h, T.p2, .5);
        for (let r = 0; r < 3; r++) { const len = w ? 3 + Math.floor(hash(i * 7 + r, Math.floor(t * 1.6)) * (cw - 7)) : 3 + Math.floor(hash(i, r) * (cw - 9)); px(x + 2, y + 2 + r * 2, len, 1, w ? T.p1 : T.ink, w ? .85 : .16); }
        if (q) { const a = live ? .55 + .45 * Math.sin(t * 2.4 + i) : .9; px(x + cw - 5, y + 2, 3, 3, T.gold, a); }
        px(x + cw / 2 - 1, y + h, 2, 3, T.ink, .18);   // the bracket to the wall
      });
      if (table) {
        /* the orders table: a slab, and one gold scroll for each thing that waits on you */
        const tw = Math.round(W * .26), tx = hx - tw / 2, ty = hy - 5;
        glow(hx, ty + 2, 16, T.p2, .05); px(tx, ty, tw, 9, T.ink, .12); px(tx, ty, tw, 1, T.p1, .8); px(tx, ty + 9, tw, 1, T.p1, .4); px(tx, ty, 1, 9, T.p1, .5); px(tx + tw - 1, ty, 1, 9, T.p1, .5);
        for (let i = 0; i < waits; i++) { const sx = tx + 4 + i * Math.floor((tw - 8) / 10), a = live ? .6 + .4 * Math.sin(t * 1.8 + i * .9) : .9; px(sx, ty + 2, 4, 4, T.gold, a); px(sx + 1, ty + 1, 2, 1, T.gold, a * .6); }
        if (!waits) px(hx - 1, ty + 3, 3, 3, T.ink, .25 + (live ? .12 * Math.sin(t * 1.2) : 0));
      } else {
        /* the fire: a few columns of squares, gold at the root, the lead colour in the middle, the second at the tips */
        const base = hy + 6;
        glow(hx, base - 5, 26, T.p1, .06); glow(hx, base - 4, 15, T.p1, .09); px(hx - 9, base, 18, 2, T.ink, .35); px(hx - 7, base + 2, 14, 2, T.ink, .25);
        for (let dx = -6; dx <= 6; dx++) { const top = Math.max(1, Math.round((9 - Math.abs(dx) * 1.2) * (.55 + .6 * hash(dx + 9, live ? Math.floor(t * 8) : 3)))); for (let k = 0; k < top; k++) { const f = k / Math.max(1, top - 1); px(hx + dx * 2 - 1, base - 2 - k * 2, 2, 2, f < .3 ? T.gold : f < .7 ? T.p1 : T.p2, f > .85 ? .6 : .95); } }
        for (const e of embers) {
          if (live) { e.y -= e.v * dt * .18; e.x += Math.sin(t * 2 + e.l * 9) * dt * .01; e.l += dt * .35; if (e.l > 1 || e.y < .2) { e.l = 0; e.y = hy / H - .03; e.x = .5 + (hash(Math.floor(t * 10), 5) - .5) * .06; e.v = .2 + hash(Math.floor(t * 10), 6) * .3; } }
          px(e.x * W, e.y * H, 1, 1, e.l < .5 ? T.gold : T.p1, Math.max(0, 1 - e.l));
        }
      }
      /* a ring round whoever works, and one more, gold and slower, round whoever waits for you */
      for (const f of figs) {
        if (f.st === 'idle') continue;
        const p = at(f), r = 10 + (live ? 1.6 * (1 + Math.sin(t * 3)) : 1), c = f.st === 'work' ? T.p1 : T.gold;
        px(p.x - r, p.y - r, r * 2, 1, c, .35); px(p.x - r, p.y + r, r * 2, 1, c, .35); px(p.x - r, p.y - r, 1, r * 2, c, .35); px(p.x + r, p.y - r, 1, r * 2 + 1, c, .35);
      }
      /* the spark: Caesar to whoever gets work (the lair), the one who waits to the table (the Praetorium) */
      if (live) {
        const list = table ? pts.wait : pts.work;
        if (!spark && list.length && t > nextAt) { const to = list[turn++ % list.length], from = table ? to : (lead || { x: hub.x, y: hub.y }); spark = { from: table ? at(to) : at(from), to: table ? { x: hx, y: hy } : at(to), t0: t, d: 1.2 }; }
        if (spark) {
          const u = (t - spark.t0) / spark.d;
          if (u >= 1) { ring(spark.to, u - 1); if (u > 1.5) { spark = null; nextAt = t + 1.1; } }
          else for (let k = 0; k < 7; k++) { const v = Math.max(0, u - k * .035), cx = (spark.from.x + spark.to.x) / 2, cy = Math.min(spark.from.y, spark.to.y) - 14, x = (1 - v) * (1 - v) * spark.from.x + 2 * (1 - v) * v * cx + v * v * spark.to.x, y = (1 - v) * (1 - v) * spark.from.y + 2 * (1 - v) * v * cy + v * v * spark.to.y; px(x - 1, y - 1, k ? 2 : 3, k ? 2 : 3, k < 2 ? T.gold : T.p2, 1 - k * .13); }
        }
      }
      ctx.globalAlpha = 1;
    }
    function ring(p, u) { const r = 4 + u * 16, a = Math.max(0, .8 - u * 1.6); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4 + .4; px(p.x + Math.cos(an) * r, p.y + Math.sin(an) * r, 2, 2, T.gold, a); } }

    const motionOn = () => document.documentElement.dataset.motion === 'on';
    function frame(ts) {
      raf = 0;
      if (!cv.isConnected) { obs.disconnect(); ro.disconnect(); return; }
      if (!motionOn()) { draw(1.3, 0, false); on = false; return; }
      if (ts - last >= 33) { const dt = Math.min(.1, (ts - last) / 1000); last = ts; draw(ts / 1000, dt, true); }
      raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const obs = new MutationObserver(() => { T = tokens(); kick(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-pal', 'data-theme', 'data-accent', 'data-motion', 'style'] });
    const ro = new ResizeObserver(() => { size(); kick(); });
    ro.observe(st); size(); kick();
  }
  const mount = () => document.querySelectorAll('.lr-stage:not([data-on])').forEach(s => { s.dataset.on = '1'; run(s); });

  /* ---------- sheets: hire, rename, retire ---------- */
  const field = (id, label, val, max, ph = '') => `<label class="lr-f"><span>${E(label)}</span><input class="og-input" id="lr-${id}" value="${E(val)}" maxlength="${max}" placeholder="${E(ph)}" autocomplete="off"></label>`;
  const sheetHtml = () => {
    const s = L.sheet; if (!s) return '';
    const v = s.vals || {};   // what was typed survives a repaint (busy state, an error)
    let inner = '';
    if (s.k === 'hire') inner = `<h3>Hire a member</h3><p>This creates a new Hermes profile on this machine. It starts with no memory of its own; give it a name and a role line.</p>${field('id', 'Profile name (lowercase letters, digits, - or _)', v.id || '', 32, 'scribe')}${field('name', 'Name shown', v.name || '', 40, 'Scribe')}${field('role', 'Role', v.role || '', 60, 'Notes and minutes')}<div class="lr-act"><button class="btn" data-lr="hirego" type="button" ${L.busy ? 'disabled' : ''}>${L.busy ? 'Hiring…' : 'Hire'}</button><button class="btn ghost" data-lr="close" type="button">Cancel</button></div>`;
    else { const m = crewList().find(c => c.id === s.id) || (L.retired || []).find(c => c.id === s.id); if (!m) return ''; const mm = { n: m.n || m.name, r: m.r || m.role };
      inner = `<h3 data-no-i18n>${E(mm.n)}</h3><p data-no-i18n>${E(m.does || '')}</p>${field('name', 'Name shown', v.name != null ? v.name : mm.n, 40)}${field('role', 'Role', v.role != null ? v.role : mm.r, 60)}<p class="lr-note">Renaming changes what CAESAR shows. The Hermes profile keeps its own name.</p><div class="lr-act"><button class="btn" data-lr="save:${E(s.id)}" type="button" ${L.busy ? 'disabled' : ''}>Save</button><button class="btn ghost" data-lr="talk:${E(s.id)}" type="button">Talk</button>${s.id === 'caesar' ? '' : s.sure ? `<button class="btn" data-lr="retirego:${E(s.id)}" type="button">Retire now</button>` : `<button class="btn ghost" data-lr="retire:${E(s.id)}" type="button">Retire</button>`}<button class="btn ghost" data-lr="close" type="button">Close</button></div>${s.sure ? '<p class="lr-note" role="status">Retiring takes them off the roster. Nothing is deleted and you can restore them from the Retired tab.</p>' : ''}`; }
    return `<div class="lr lr-sheet" data-lr="shade"><div class="lr-panel" role="dialog" aria-modal="true" aria-label="${s.k === 'hire' ? 'Hire a member' : 'Edit a member'}">${inner}${L.err ? `<p class="lr-err" role="alert">${E(L.err)}</p>` : ''}</div></div>`;
  };
  const paintSheet = () => {
    let el = document.getElementById('lr-sheet-host'); if (!el) { el = document.createElement('div'); el.id = 'lr-sheet-host'; document.body.appendChild(el); }
    el.innerHTML = sheetHtml(); const f = el.querySelector('input'); if (f && L.sheet && !L.sheet.focused) { L.sheet.focused = true; f.focus(); }
  };

  /* ---------- the Crew page ---------- */
  const tabs = (view, extra = '') => `<div class="lr lr-bar"><div class="og-seg" role="tablist">${TABS[view].map(t => `<button class="${t === L.tab[view] ? 'on' : ''}" role="tab" aria-selected="${t === L.tab[view]}" data-lr="tab:${view}|${t}" type="button">${E(t)}</button>`).join('')}</div>${extra}</div>`;
  const stWord = s => s === 'work' ? 'working' : s === 'wait' ? 'waits for you' : 'idle';
  window.xCrewHtml = () => {
    const members = crewList(), working = members.filter(m => m.st === 'work').length, wait = members.filter(m => m.st === 'wait').length;
    const hire = `<button class="btn" data-lr="hire" type="button">${I('plus', 14)}<span>Hire</span></button>`;
    let body;
    if (L.tab.Crew === 'Retired') {
      if (L.retired === null) { void loadRetired(); body = typeof ARTSTATE === 'function' ? ARTSTATE('loading', 'Reading the roster…') : ''; }
      else body = L.retired.length ? `<div class="lr lr-list">${L.retired.map(m => `<div><img alt="" src="${E(m.img)}"><span data-no-i18n><b>${E(m.name)}</b><small>${E(m.role)}</small></span><button class="btn" data-lr="restore:${E(m.id)}" type="button">Restore</button></div>`).join('')}</div>` : (typeof vzEmpty === 'function' ? vzEmpty('Nobody is retired', 'A member you retire waits here until you bring them back.') : '');
    } else if (!members.length) body = xKeeper('crew', 'No crew found', 'Crew members are Hermes profiles on this machine. Hire one here, or install Hermes first.', hire);
    else body = `${stageHtml('lair', members, 0, 'The crew around the fire')}${vzTiles([vzTile('Working', working, 'right now', 'a'), vzTile('Waiting for you', wait, 'need an answer', 'g'), vzTile('Idle', members.length - working - wait, 'ready', 's')])}
      <div class="lr lr-cards">${members.map(m => `<div class="lr-card ${m.st}"><span class="lr-pt"><i style="--im:url(${E(m.img)})"></i></span><div><h4 data-no-i18n>${E(m.n)}</h4><p><span data-no-i18n>${E(m.r)}</span> · <span>${stWord(m.st)}</span></p><p data-no-i18n>${E(m.st === 'work' && m.doing ? m.doing : m.does || '')}</p></div><button class="btn ghost" data-lr="edit:${E(m.id)}" type="button">Edit</button></div>`).join('')}</div>`;
    return `<div class="nx-view enter">${head('Crew', `${members.length || 'No'} ${members.length === 1 ? 'agent' : 'agents'}, one troop. Who works, who waits for you, and what each one does.`, 'The Lair')}<div class="og-wrap">${tabs('Crew', members.length ? hire : '')}${L.err && !L.sheet ? `<p class="lr-err lr" role="alert">${E(L.err)}</p>` : ''}${body}</div></div>`;
  };
  async function loadRetired() { L.retired = (await g('/api/crew/retired', [])) || []; again(); }

  /* ---------- the Command page (Praetorium) ---------- */
  const took = ms => ms == null ? '' : ms < 60000 ? Math.max(1, Math.round(ms / 1000)) + ' s' : ms < 3600000 ? Math.round(ms / 60000) + ' min' : Math.round(ms / 3600000) + ' h';
  async function loadCmd(force) {
    const now = Date.now(); if (!force && now - L.at.orch < 8000) return; L.at.orch = now;
    const [o, a] = await Promise.all([g('/api/orchestration', null), g('/api/approvals', { pending: [] })]);
    L.orch = o || { members: [], needsYou: 0 }; L.ap = (a && a.pending) || []; again();
  }
  async function loadAdm() { L.at.adm = Date.now(); L.adm = (await g('/api/admin', null)) || { disks: [], machine: null, failed: true }; again(); }
  const cmdMembers = () => {   // the scene's figures: the orchestration states win over the plain crew status
    const by = new Map(((L.orch && L.orch.members) || []).map(m => [m.id, m]));
    return crewList().map(m => { const o = by.get(m.id), st = o ? (o.state === 'needs-you' ? 'wait' : o.state === 'running' ? 'work' : 'idle') : m.st; return { ...m, st }; });
  };
  const cmdOverview = () => {
    const mem = cmdMembers(), ap = L.ap || [], waiting = ((L.orch && L.orch.members) || []).filter(m => m.state === 'needs-you'), n = ap.length || (L.orch ? L.orch.needsYou : 0);
    const scene = mem.length ? stageHtml('table', mem, n, 'The crew round the orders table') : xKeeper('crew', 'No crew yet', 'When crew members exist they sit round this table.');
    const tiles = vzTiles([vzTile('Waiting for you', n, n ? 'approvals and answers' : 'nothing waits', n ? 'g' : 's'), vzTile('Working', mem.filter(m => m.st === 'work').length, 'right now', 'a'), vzTile('In the troop', mem.length, 'agents', 's')]);
    const list = (ap.length || waiting.length) ? `<div class="lr lr-list">${ap.map(p => `<div><span class="lr-sq"></span><span><b data-no-i18n>${E(p.title)}</b><small>approval</small></span><span class="lr-two"><button class="btn" data-lr="ok:${E(p.id)}" type="button">Approve</button><button class="btn ghost" data-lr="no:${E(p.id)}" type="button">Not now</button></span></div>`).join('')}${waiting.map(m => `<div><span class="lr-sq"></span><span><b data-no-i18n>${E(m.name)}</b><small${m.doing ? ' data-no-i18n' : ''}>${E(m.doing || 'waits for your answer')} · ${took(m.ms)}</small></span><button class="btn" data-lr="answer:${E(m.sessionId || '')}" type="button">Answer</button></div>`).join('')}</div>` : (typeof vzEmpty === 'function' ? vzEmpty('Nothing waits on you', 'Approvals and questions from the crew land here, and as scrolls on the table above.') : '');
    return scene + tiles + `<div class="og-sec">What waits on you</div>` + list;
  };
  const cmdAdmin = () => {
    if (!L.adm) { void loadAdm(); return typeof ARTSTATE === 'function' ? ARTSTATE('loading', 'Reading the machine…') : ''; }
    if (L.adm.hidden) return vzEmpty('Machine details are hidden', 'This copy runs on a throwaway data folder, so it does not read this computer.');
    if (L.adm.failed || !L.adm.machine) return typeof ARTSTATE === 'function' ? ARTSTATE('error', 'The machine could not be read', 'The core did not answer. Open this tab again in a moment.') : '';
    const m = L.adm.machine, tone = p => p >= 90 ? 'd' : p >= 75 ? 'g' : 'a', up = m.uptimeH < 48 ? m.uptimeH + ' h' : Math.round(m.uptimeH / 24) + ' days';
    return `${vzTiles([vzTile('Cores', m.cores, m.os, 'a'), vzTile('Memory', m.ramGb + ' GB', m.freeRamGb + ' GB free', 's'), vzTile('Load', m.load[0], '5 min ' + m.load[1] + ' · 15 min ' + m.load[2], m.load[0] > m.cores ? 'd' : 'g'), vzTile('Up for', up, 'since the last start', 'm')])}
      <div class="og-sec">Disks</div>${L.adm.disks.length ? vzBars(L.adm.disks.map(d => [d.mount, d.pct, `${d.usedGb} of ${d.totalGb} GB`, tone(d.pct), true])) : (typeof vzEmpty === 'function' ? vzEmpty('No disks reported', 'This system did not list any real file systems.') : '')}
      <div class="lr lr-bar"><button class="btn ghost" data-lr="admrefresh" type="button">${I('refresh', 14)}<span>Read again</span></button></div>`;
  };
  window.xCommandHtml = () => {
    if (!L.orch) void loadCmd(true);
    const t = L.tab.Command;
    const body = t === 'Admin' ? cmdAdmin() : t === 'Prompts' ? (window.xPromptsBody ? window.xPromptsBody() : '') : (L.orch ? cmdOverview() : (typeof ARTSTATE === 'function' ? ARTSTATE('loading', 'Reading the troop…') : ''));
    return `<div class="nx-view enter">${head('Command', 'Your command post. A live scene of the troop and everything that waits on you, the machine under it, and the prompts you keep.', 'Praetorium')}<div class="og-wrap">${tabs('Command')}${body}</div></div>`;
  };
  setInterval(() => { if (document.querySelector('.lr-stage.table') || (L.tab.Command === 'Admin' && document.querySelector('.lr-bar'))) { void loadCmd(true); if (L.tab.Command === 'Admin') void loadAdm(); } }, 12000);

  /* ---------- clicks ---------- */
  const val = id => { const e = document.getElementById('lr-' + id); return e ? e.value.trim() : ''; };
  const MSG = { hermes_missing: 'Hermes is not installed here, so a new profile cannot be made.', exists: 'A member with that profile name already exists.', id: 'Use lowercase letters, digits, - or _ for the profile name.', failed: 'Hermes could not make the profile.', caesar_stays: 'Caesar stays on the roster.', operator_only: 'Only the owner can change the crew.' };
  const fail = j => { L.err = MSG[j && j.error] || 'That did not work. Try again.'; L.busy = false; paintSheet(); again(); };
  const done = async () => { L.sheet = null; L.err = ''; L.busy = false; L.retired = null; paintSheet(); if (window.xCrewReload) await window.xCrewReload(); again(); };
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-lr]'); if (!t) return;
    const [k, v] = t.dataset.lr.split(/:(.*)/s);
    if (k === 'shade') { if (e.target !== t) return; L.sheet = null; L.err = ''; paintSheet(); return; }
    e.stopPropagation();
    if (k === 'tab') { const [view, tab] = v.split('|'); L.tab[view] = tab; store('lr-tab-' + view, tab); if (tab === 'Retired') L.retired = null; if (tab === 'Admin') L.adm = null; }
    else if (k === 'hire') { L.sheet = { k: 'hire' }; L.err = ''; paintSheet(); return; }
    else if (k === 'edit') { L.sheet = { k: 'edit', id: v }; L.err = ''; paintSheet(); return; }
    else if (k === 'close') { L.sheet = null; L.err = ''; paintSheet(); return; }
    else if (k === 'talk') { L.sheet = null; paintSheet(); const b = document.createElement('button'); b.dataset.ns = 'crew:' + v; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); return; }
    else if (k === 'hirego') { L.sheet.vals = { id: val('id'), name: val('name'), role: val('role') }; L.busy = true; L.err = ''; paintSheet(); const r = await send('/api/crew', 'POST', { id: val('id'), name: val('name'), role: val('role') }); return r.ok ? done() : fail(r.j); }
    else if (k === 'save') { L.sheet.vals = { name: val('name'), role: val('role') }; L.busy = true; paintSheet(); const r = await send('/api/crew/' + encodeURIComponent(v), 'PATCH', { name: val('name'), role: val('role') }); return r.ok ? done() : fail(r.j); }
    else if (k === 'retire') { L.sheet.sure = true; paintSheet(); return; }
    else if (k === 'retirego') { const r = await send('/api/crew/' + encodeURIComponent(v), 'PATCH', { retired: true }); return r.ok ? done() : fail(r.j); }
    else if (k === 'restore') { const r = await send('/api/crew/' + encodeURIComponent(v), 'PATCH', { retired: false }); if (!r.ok) { L.err = MSG[r.j.error] || 'That did not work.'; } else { L.retired = null; if (window.xCrewReload) await window.xCrewReload(); } }
    else if (k === 'ok' || k === 'no') { const r = await send('/api/approvals/' + encodeURIComponent(v) + '/decision', 'POST', { decision: k === 'ok' ? 'approved' : 'denied' }); if (!r.ok) L.err = 'That decision did not go through.'; await loadCmd(true); return; }
    else if (k === 'answer') { if (v && typeof open_ === 'function') open_({ k: 'chat', id: v }); }
    else if (k === 'admrefresh') { L.adm = null; }
    else if (k === 'talkfig') { /* handled by the shell */ }
    again();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && L.sheet) { L.sheet = null; L.err = ''; paintSheet(); } });

  /* ---------- wiring ---------- */
  register({ id: 'lair', views: { Crew: () => window.xCrewHtml(), Command: () => window.xCommandHtml() } });
  const drawn = render;
  render = function () { drawn(); mount(); decorate(); };
  /* notes.js belongs to the Brain lane: its empty line gets a keeper from here, not by editing that file */
  function decorate() { document.querySelectorAll('.nt-empty').forEach(p => { if (p.dataset.kp || !/^No notes yet\b/.test(p.textContent.trim())) return; p.dataset.kp = '1'; p.insertAdjacentHTML('beforebegin', window.xKeeper('notes')); }); }
  /* notes draw their list after the page is up, so the keeper also follows later changes (one pass per frame at most) */
  let soon = 0; new MutationObserver(() => { if (!soon) soon = requestAnimationFrame(() => { soon = 0; decorate(); }); }).observe(document.body, { childList: true, subtree: true });
  mount(); decorate();
  window.xLair = { L };
})();
