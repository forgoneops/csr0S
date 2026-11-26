/* Skills: what the crew can do, as one map. Every skill on this computer, which agent holds it, its tags and its install-gate
   status, as a constellation (canvas), a tree or cards, with search, filters and a drawer that shows SKILL.md.
   Read only: nothing here installs, edits or runs a skill (the Marketplace does the gated part). Touch first: tap a star or a row. */
(() => {
  const E = s => (typeof OGE === 'function' ? OGE(s) : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const g = async (u, d) => { try { const r = await fetch(u); if (r.status === 401) { location.href = '/login'; return d; } return r.ok ? await r.json() : d; } catch { return d; } };
  const SK = { skills: null, gate: [], err: false, q: '', tag: 'all', agent: 'all', stat: 'all', group: 'all', view: 'map', sel: null, bodies: {}, open: new Set() };
  const TAGS = ['all', 'pack', 'owner-only', 'dev'];
  const GROUPS = [['Brain and memory', /brain|vault|decision-log|folders|lectio|commentarii|last30days|scriptorium/], ['Interviews', /grill/], ['Method', /method|findings|spike|sweep|goal|build-loop|verify/],
    ['Interface and motion', /ui-|motion|touch|icons|legio|pixel|no-slop|look|expo|swift/], ['Build and release', /atrium|plugin|modules|update|harden|isolation|premium|install-tools|skillset|two-instances|track-sync|web-/],
    ['Connect', /connectors|reach|webtools|hermes|mail|model-providers|speech|vox|terminal|codegraph|watchers/], ['Studio', /studio|media/], ['Work', /board|fasti|computus|token|ledger|public-copy|saas|training|grow/]];
  const groupOf = s => { if (s.id.includes('/') && s.category !== 'general') return s.category[0].toUpperCase() + s.category.slice(1); const m = GROUPS.find(([, re]) => re.test(s.name)); return m ? m[0] : 'Other'; };
  const status = s => (!s.enabled ? 'disabled' : s.flags.length ? 'review' : 'clean');
  const load = async () => {
    const [skills, gate] = await Promise.all([g('/api/skills', null), g('/api/install-gate', { items: [] })]);
    SK.err = skills === null; SK.skills = (skills || []).map(s => ({ ...s, group: groupOf(s), st: status(s), tags: s.tags || [], agents: s.agents || [] }));
    SK.gate = (gate && gate.items) || []; if (typeof render === 'function') render();
  };
  const list = () => { const q = SK.q.toLowerCase(); return (SK.skills || []).filter(s => (SK.tag === 'all' || s.tags.includes(SK.tag)) && (SK.agent === 'all' || s.agents.includes(SK.agent)) && (SK.stat === 'all' || s.st === SK.stat) && (SK.group === 'all' || s.group === SK.group) && (!q || (s.name + ' ' + s.description + ' ' + s.group + ' ' + s.tags.join(' ')).toLowerCase().includes(q))); };
  const chip = (k, v, label, cur, n) => `<button type="button" class="sk-chip${cur === v ? ' on' : ''}" data-sk="${k}:${E(v)}" aria-pressed="${cur === v}">${E(label)}${n === undefined ? '' : `<i>${n}</i>`}</button>`;
  const md = text => {
    const keep = [], hold = h => '\u0000' + (keep.push(h) - 1) + '\u0000';
    const s = E(String(text).replace(/\u0000/g, '')).replace(/```[^\n]*\n([\s\S]*?)```/g, (_, c) => hold(`<pre><code>${c}</code></pre>`)).replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${c}</code>`));
    const out = []; let para = [], ul = [];
    const flush = () => { if (para.length) out.push('<p>' + para.join(' ') + '</p>'); para = []; if (ul.length) out.push('<ul>' + ul.join('') + '</ul>'); ul = []; };
    for (const l of s.split('\n')) { let m;
      if (!l.trim()) flush(); else if ((m = l.match(/^(#{1,6}) +(.+)$/))) { flush(); out.push(`<h5>${m[2]}</h5>`); }
      else if ((m = l.match(/^\s*([-*+]|\d+[.)]) +(.+)$/))) { if (para.length) flush(); ul.push(`<li>${m[2]}</li>`); }
      else if (/^\u0000\d+\u0000$/.test(l)) { flush(); out.push(l); } else { if (ul.length) flush(); para.push(l); } }
    flush();
    return out.join('').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  };
  const tagPills = s => s.tags.map(t => `<span class="og-tag mut">${E(t)}</span>`).join('');
  const stPill = s => `<span class="og-tag ${s.st === 'clean' ? 'sig' : s.st === 'review' ? '' : 'mut'}">${s.st === 'review' ? 'Review' : s.st === 'clean' ? 'Clean' : 'Disabled'}</span>`;
  const agentsOf = a => a.map(x => `<span class="sk-ag">${E(x)}</span>`).join('');

  /* ---------- views ---------- */
  const tree = L => {
    const byA = {}; for (const s of L) for (const a of s.agents) (byA[a] = byA[a] || []).push(s);
    return `<div class="sk-tree">${Object.keys(byA).sort().map(a => {
      const open = SK.open.has(a), gs = {}; byA[a].forEach(s => (gs[s.group] = gs[s.group] || []).push(s));
      return `<div class="sk-node"><button type="button" class="sk-row sk-a" data-sk="open:${E(a)}" aria-expanded="${open}"><span class="sk-sq"></span><b>${E(a)}</b><i>${byA[a].length}</i></button>${open || SK.q ? Object.keys(gs).sort().map(gr => {
        const k = a + '/' + gr, o2 = SK.open.has(k) || !!SK.q;
        return `<div class="sk-node sk-in"><button type="button" class="sk-row sk-g" data-sk="open:${E(k)}" aria-expanded="${o2}"><span class="sk-sq"></span>${E(gr)}<i>${gs[gr].length}</i></button>${o2 ? gs[gr].map(s => `<button type="button" class="sk-row sk-leaf${SK.sel === s.id ? ' on' : ''}" data-sk="pick:${E(s.id)}"><span class="sk-sq ${s.st}"></span><span data-no-i18n>${E(s.name)}</span>${stPill(s)}</button>`).join('') : ''}</div>`;
      }).join('') : ''}</div>`; }).join('')}</div>`;
  };
  const cards = L => `<div class="sk-cards">${L.map(s => `<button type="button" class="sk-card${SK.sel === s.id ? ' on' : ''}" data-sk="pick:${E(s.id)}"><span class="sk-art" aria-hidden="true" style="--m:url(art/caesaros-scenes/${E(artFor(s))}.webp)"></span><b data-no-i18n>${E(s.name)}</b><small>${E(s.description.slice(0, 110))}</small><span class="sk-meta">${stPill(s)}${tagPills(s)}</span><span class="sk-meta">${agentsOf(s.agents)}</span></button>`).join('') || ''}</div>`;
  const ART = { 'Brain and memory': 'brain', Interviews: 'grill', Method: 'evidence', 'Interface and motion': 'studio', 'Build and release': 'forge', Connect: 'hermes-marketplace', Studio: 'media', Work: 'board' };
  const artFor = s => ART[s.group] || 'skills';
  const drawer = () => {
    const s = (SK.skills || []).find(x => x.id === SK.sel); if (!s) return '';
    const body = SK.bodies[s.id];
    const gate = SK.gate.filter(i => i.name === s.name).map(i => `${E(i.status)} · ${E(i.scan.verdict)}`).join(', ');
    return `<aside class="sk-drawer" role="dialog" aria-label="Skill details"><div class="sk-dh"><h3 data-no-i18n>${E(s.name)}</h3><button type="button" class="btn ghost" data-sk="close" aria-label="Close">${typeof I === 'function' ? I('close', 16) : 'x'}</button></div>
      <p>${E(s.description)}</p><div class="sk-meta">${stPill(s)}${tagPills(s)}</div><div class="sk-meta">${agentsOf(s.agents)}</div>
      <p class="sk-small">Group: ${E(s.group)} · Install gate: ${gate || (s.agents.includes('Installed') ? 'installed through the gate' : 'not added through the gate')}</p>
      ${s.flags.length ? `<div class="og-card"><h4>Worth a second look</h4><ul>${s.flags.map(f => `<li>${E(f)}</li>`).join('')}</ul></div>` : ''}
      <div class="sk-body" data-no-i18n>${body === undefined ? '<p>Loading SKILL.md…</p>' : body === null ? '<p>SKILL.md could not be read.</p>' : md(body)}</div></aside>`;
  };
  const main = () => {
    if (SK.skills === null) return ARTSTATE('loading', 'Reading skills on this computer…');
    if (SK.err) return ARTSTATE('error', 'Skills could not be read', 'The core did not answer. Check that it is running, then reopen this page.');
    if (!SK.skills.length) return ARTSTATE('empty', 'No skills found yet', 'Add a skill folder to an agent, or review a package in the Marketplace.');
    const all = SK.skills, L = list(), agents = [...new Set(all.flatMap(s => s.agents))].sort(), groups = [...new Set(all.map(s => s.group))].sort();
    const n = (f) => all.filter(f).length;
    return `<div class="sk-stats">${[['Skills', all.length, 'on this computer'], ['Agents', agents.length, agents.join(', ')], ['Groups', groups.length, 'by purpose'], ['To review', n(s => s.st === 'review'), 'static scan findings'], ['Disabled', n(s => s.st === 'disabled'), 'enabled: false']].map(([l, v, d]) => `<div class="pg-tile"><small>${l}</small><b>${v}</b><i data-no-i18n>${E(d)}</i></div>`).join('')}</div>
    <div class="sk-bar"><div class="og-seg">${[['map', 'Map'], ['tree', 'Tree'], ['cards', 'Cards']].map(([k, l]) => `<button type="button" class="${SK.view === k ? 'on' : ''}" data-sk="view:${k}">${l}</button>`).join('')}</div><span class="sk-count">${L.length} of ${all.length}</span></div>
    <div class="sk-filters" role="group" aria-label="Filters"><span class="label">Tag</span>${TAGS.map(t => chip('tag', t, t === 'all' ? 'All' : t, SK.tag, t === 'all' ? undefined : n(s => s.tags.includes(t)))).join('')}
      <span class="label">Agent</span>${['all', ...agents].map(a => chip('agent', a, a === 'all' ? 'All' : a, SK.agent, a === 'all' ? undefined : n(s => s.agents.includes(a)))).join('')}
      <span class="label">Status</span>${['all', 'clean', 'review', 'disabled'].map(a => chip('stat', a, a === 'all' ? 'All' : a, SK.stat)).join('')}</div>
    <div class="sk-filters" role="group" aria-label="Groups"><span class="label">Group</span>${['all', ...groups].map(a => chip('group', a, a === 'all' ? 'All' : a, SK.group, a === 'all' ? undefined : n(s => s.group === a))).join('')}</div>
    ${!L.length ? ARTSTATE('empty', 'Nothing matches', 'Clear a filter or the search to see more.') : SK.view === 'map' ? `<div class="sk-map"><canvas id="sk-cv" role="img" aria-label="Skill constellation: ${L.length} skills grouped by purpose and linked to the agents that hold them. The Tree and Cards views list the same skills."></canvas><div class="sk-legend"><span><i class="c1"></i>clean</span><span><i class="c3"></i>review</span><span><i class="c4"></i>disabled</span><span><i class="c2"></i>agent</span><span class="sk-hint">Tap a star to open it, tap a group to filter</span></div></div>` : SK.view === 'tree' ? tree(L) : cards(L)}
    ${drawer()}`;
  };
  const paint = () => { const m = document.getElementById('sk-main'); if (!m) return; m.innerHTML = main(); queueMicrotask(mountMap); };

  /* ---------- the constellation ---------- */
  let M = null;   // { cv, nodes, edges, raf, dirty, col }
  const tok = () => { const cs = getComputedStyle(document.documentElement), v = (n, d) => (cs.getPropertyValue(n).trim() || d); return { p1: v('--p1', '#ff8a3d'), p2: v('--p2', '#33e8ff'), gold: v('--gold', '#f2c46b'), ink: v('--ink', '#e8ecff'), bg: v('--bg', '#05060d'), mut: v('--muted', '#8d8a85') }; };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  function mountMap() {
    const cv = document.getElementById('sk-cv'); if (M && M.raf) cancelAnimationFrame(M.raf); M = null; if (!cv) return;
    const L = list(), box = cv.parentElement, W = Math.max(280, box.clientWidth), H = W < 600 ? 460 : 540, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2, nodes = [], edges = [], at = {};
    nodes.push({ id: 'caesar', k: 'c', x: cx, y: cy, r: 13 });
    const agents = [...new Set(L.flatMap(s => s.agents))].sort(), groups = [...new Set(L.map(s => s.group))].sort();
    agents.forEach((a, i) => { const t = (i / agents.length) * 6.283 - 1.57; at[a] = { id: 'a:' + a, k: 'a', label: a, x: cx + Math.cos(t) * W * 0.09, y: cy + Math.sin(t) * H * 0.15, r: 9 }; nodes.push(at[a]); edges.push([nodes[0], at[a], 0.5]); });
    groups.forEach((gr, i) => {
      const t = (i / groups.length) * 6.283 - 1.2, hub = { id: 'g:' + gr, k: 'g', label: gr, x: cx + Math.cos(t) * W * 0.34, y: cy + Math.sin(t) * H * 0.34, r: 8 }; nodes.push(hub);
      const mine = L.filter(s => s.group === gr), held = new Set(mine.flatMap(s => s.agents));
      held.forEach(a => edges.push([at[a], hub, 0.28]));
      const step = Math.min(20, (R * 0.3) / Math.sqrt(Math.max(mine.length, 1)));
      mine.forEach((s, j) => { const a2 = j * 2.39996 + hash(s.id) * 0.4, rr = 18 + step * Math.sqrt(j + 1) * 1.1, sn = { id: s.id, k: 's', s, x: hub.x + Math.cos(a2) * rr, y: hub.y + Math.sin(a2) * rr, r: 4, ph: hash(s.name) * 6.283 }; nodes.push(sn); edges.push([hub, sn, 0.16]); });
    });
    M = { cv, nodes, edges, W, H, dpr, col: tok(), dirty: true, raf: 0, hit: null };
    const ro = new ResizeObserver(() => { if (document.getElementById('sk-cv') === cv && Math.abs(box.clientWidth - W) > 20) mountMap(); else ro.disconnect(); }); ro.observe(box);
    cv.onpointerdown = e => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, reach = e.pointerType === 'mouse' ? 12 : 22; let best = null, bd = reach * reach;
      for (const n of M.nodes) { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = n; } }
      if (!best) return; if (best.k === 's') pick(best.s.id); else if (best.k === 'g') { SK.group = SK.group === best.label ? 'all' : best.label; paint(); } else if (best.k === 'a') { SK.agent = SK.agent === best.label ? 'all' : best.label; paint(); } };
    const frame = t => {
      if (!M || M.cv !== cv || !cv.isConnected) return;
      const live = document.documentElement.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (live || M.dirty) draw(t); M.dirty = false; M.raf = requestAnimationFrame(frame);
    };
    M.raf = requestAnimationFrame(frame);
  }
  function draw(t) {
    const { cv, nodes, edges, W, H, dpr } = M, c = cv.getContext('2d'), k = M.col; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const glow = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.6); glow.addColorStop(0, k.p1 + '30'); glow.addColorStop(1, 'transparent'); c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.lineWidth = 1; for (const [a, b, al] of edges) { c.globalAlpha = al; c.strokeStyle = a.k === 'c' || a.k === 'a' ? k.p2 : k.p1; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    c.globalAlpha = 1; c.font = '11px ui-monospace, monospace'; c.textBaseline = 'middle';
    for (const n of nodes) {
      const sel = n.k === 's' && n.s.id === SK.sel, tw = n.k === 's' ? 0.65 + 0.35 * Math.sin(t / 700 + n.ph) : 1;
      const col = n.k === 'c' ? k.gold : n.k === 'a' ? k.p2 : n.k === 'g' ? k.ink : n.s.st === 'review' ? k.gold : n.s.st === 'disabled' ? k.mut : k.p1;
      const r = n.r + (sel ? 3 : 0); c.globalAlpha = tw; c.fillStyle = col;
      if (n.k === 'c') { c.shadowColor = k.gold; c.shadowBlur = 18; }
      const x = Math.round(n.x - r), y = Math.round(n.y - r), z = r * 2, q = Math.max(2, Math.floor(z / 4));   // a square with cut corners
      c.beginPath(); c.moveTo(x + q, y); c.lineTo(x + z, y); c.lineTo(x + z, y + z - q); c.lineTo(x + z - q, y + z); c.lineTo(x, y + z); c.lineTo(x, y + q); c.closePath();
      if (n.k === 'g') { c.strokeStyle = col; c.lineWidth = 2; c.stroke(); } else c.fill();
      c.shadowBlur = 0; if (sel) { c.globalAlpha = 1; c.strokeStyle = k.ink; c.lineWidth = 1; c.strokeRect(x - 4, y - 4, z + 8, z + 8); }
      if (n.label) { c.globalAlpha = 0.9; c.fillStyle = k.ink; c.textAlign = 'center'; c.fillText(n.label, n.x, n.y + r + 11); }
    }
    c.globalAlpha = 1;
  }
  if (typeof MutationObserver === 'function') new MutationObserver(() => { if (M) { M.col = tok(); M.dirty = true; } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pal', 'style', 'data-theme', 'data-skin'] });

  /* ---------- events ---------- */
  async function pick(id) {
    SK.sel = id; paint();
    if (SK.bodies[id] === undefined) { const r = await g('/api/skills/body?id=' + encodeURIComponent(id), null); SK.bodies[id] = r ? r.body : null; if (SK.sel === id) paint(); }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-sk]'); if (!b || !document.getElementById('sk-main')) return;
    const [k, ...r] = b.dataset.sk.split(':'), v = r.join(':');
    if (k === 'pick') { void pick(v); return; }
    if (k === 'close') SK.sel = null; else if (k === 'open') SK.open.has(v) ? SK.open.delete(v) : SK.open.add(v); else SK[k] = v;
    paint();
  });
  document.addEventListener('input', e => { if (e.target && e.target.id === 'sk-q') { SK.q = e.target.value; paint(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && SK.sel && document.getElementById('sk-main')) { SK.sel = null; paint(); } });

  const Skills = () => {
    if (SK.skills === null && !SK.err) void load();
    queueMicrotask(mountMap);
    return `<div class="nx-view enter sk">${typeof ogHead === 'function' ? ogHead('Skills', 'Everything the crew can do: every agent’s skills as one map, a tree or cards. Read only; adding a skill goes through the Marketplace.', 'Arbor') : ''}
    <div class="og-wrap"><div class="pg-bar"><input class="og-input" id="sk-q" type="search" placeholder="Search skills…" aria-label="Search skills" value="${E(SK.q)}" style="flex:1"></div><div id="sk-main">${main()}</div></div></div>`;
  };
  register({ id: 'skills', owns: ['Skills'], views: { Skills } });
})();
