/* The bridge: the Atrium (the approved prototype) talks to the real core. The prototype's invented crew, sessions,
   messages and approvals are replaced by the Hermes profiles on this machine, real chat sessions and real approvals.
   Nothing here draws anything: it fills CREW, THREADS, MSG and S.waiting, and calls the prototype's own render(). */
(() => {
  const j = async (url, init) => { const r = await fetch(url, init); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
  const post = (url, body) => j(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d'; };
  const loaded = new Set();
  const SOLO = 'hermes:caesar!alone';
  const TOOLART = { claude: 'art/caesaros-tool-claudius.webp', gemini: 'art/caesaros-tool-gemini.webp', codex: 'art/caesaros-tool-consilium.webp' };
  let TARGETS = [];
  const aOf = e => e === SOLO ? 'caesar-alone' : e.startsWith('hermes:') ? e.slice(7) : e;       // which person a conversation is with
  const engineOf = a => a === 'caesar-alone' ? SOLO : (CREW.some(m => m.id === a) ? 'hermes:' + a : a);
  S.ctx = true;
  S.think = false; S.model = ''; S.models = [];
  S.files = [];                                                                                    // files picked for the next message
  const LIM = { files: 4, image: 8 * 1024 * 1024, text: 1024 * 1024, total: 16 * 1024 * 1024 };
  const IMG = /^image\/(png|jpeg|webp|gif)$/, TXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|toml|xml|html|css|js|ts|tsx|jsx|py|rs|go|java|c|h|cpp|sh|sql|log|ini|conf)$/i;
  const kb = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  let attProblem = '';
  const b64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
  async function addFiles(list) {
    attProblem = ''; let have = S.files.length, total = S.files.reduce((n, f) => n + f.size, 0);
    for (const f of [...list]) {
      if (have >= LIM.files) { attProblem = 'At most ' + LIM.files + ' files per message.'; break; }
      const img = IMG.test(f.type), txt = !img && (f.type.startsWith('text/') || f.type === 'application/json' || TXT.test(f.name));
      if (!img && !txt) { attProblem = f.name + ' cannot be read yet. Images and text files work; PDF and Office files do not.'; continue; }
      if (f.size > (img ? LIM.image : LIM.text)) { attProblem = f.name + ' is too large (the limit is ' + kb(img ? LIM.image : LIM.text) + ').'; continue; }
      if (total + f.size > LIM.total) { attProblem = 'Together the files are too large for one message.'; break; }
      try {
        if (img) S.files.push({ name: f.name || 'image', kind: 'image', mime: f.type, size: f.size, data: await b64(f), preview: URL.createObjectURL(f) });
        else { const t = await f.text(); if (t.includes('\u0000')) { attProblem = f.name + ' cannot be read yet.'; continue; } S.files.push({ name: f.name, kind: 'text', mime: f.type || 'text/plain', size: f.size, data: t, preview: t.trim().slice(0, 90) }); }
        have++; total += f.size;
      } catch { attProblem = f.name + ' could not be read.'; }
    }
    render();
  }
  const picker = document.createElement('input'); picker.type = 'file'; picker.multiple = true; picker.hidden = true; picker.setAttribute('aria-hidden', 'true'); picker.tabIndex = -1;
  picker.accept = 'image/png,image/jpeg,image/webp,image/gif,text/*,.md,.json,.csv,.yaml,.yml,.log,.py,.ts,.tsx,.js,.rs,.go,.sh,.sql';
  picker.onchange = () => { if (picker.files.length) void addFiles(picker.files); picker.value = ''; }; document.body.appendChild(picker);
  const tray = () => (S.files.length || attProblem) ? `<div class="nx-att">${S.files.length ? `<ul class="nx-att-l">${S.files.map((f, i) => `<li class="nx-att-c">${f.kind === 'image' ? `<img src="${f.preview}" alt="">` : `<span class="nx-att-d">${I('attach', 18)}</span>`}<span class="nx-att-t"><b>${esc(f.name)}</b><small>${kb(f.size)}</small>${f.kind === 'text' && f.preview ? `<small class="nx-att-p">${esc(f.preview)}</small>` : ''}</span><button class="kit-ico sm" data-rmfile="${i}" aria-label="Remove ${esc(f.name)}">${I('close', 14)}</button></li>`).join('')}</ul>` : ''}${attProblem ? `<p class="nx-att-e" role="alert">${esc(attProblem)}</p>` : ''}</div>` : '';                                                                                    // context (the Brain's documents) on by default
  let stat = '';

  async function loadCrew() {
    const crew = await j('/api/crew');
    const key = JSON.stringify(crew.map(m => [m.id, m.status, m.doing]));
    if (key === stat) return false; stat = key;
    CREW.splice(0, CREW.length, ...crew.map(m => ({ id: m.id, n: m.name, r: m.role, img: m.img, st: m.status, doing: m.doing, does: m.does, model: m.model })));
    const keep = Object.entries(C).filter(([k]) => !CREW.some(m => m.id === k) && k !== 'undefined'); for (const k of Object.keys(C)) delete C[k]; CREW.forEach(m => { C[m.id] = m; }); keep.forEach(([k, v]) => { C[k] = v; });
    C.undefined = { id: '', n: 'New conversation', r: 'Pick who to talk to', img: 'caesar/portrait-neo.png', st: 'idle', doing: '' };   // a tab with no conversation yet
    return true;
  }
  async function loadTargets() {
    TARGETS = await j('/api/chat-targets');
    for (const t of TARGETS) if (t.group !== 'crew') C[aOf(t.id)] = { id: aOf(t.id), n: t.label + (t.group === 'caesar' ? ' · alone' : ''), r: t.role, img: t.group === 'caesar' ? 'art/caesaros-caesar-neo.webp' : (TOOLART[t.id] || 'art/caesaros-caesar-neo.webp'), st: t.ok ? 'idle' : 'wait', doing: '' };
  }
  async function loadEngines() { const e = await j('/api/engines'); window.ENGINES = e.engines; }
  const engineLabelOf = th => { const eng = th ? engineOf(th.a) : ''; const e = (window.ENGINES || []).find(x => x.id === eng); return { eng, label: e ? e.label : (C[th && th.a] || {}).n || '', models: e ? e.models : [] }; };
  async function loadSessions() {
    const list = await j('/api/chat/sessions');
    THREADS.splice(0, THREADS.length, ...list.filter(s => C[aOf(s.engine)]).map(s => ({ id: s.id, a: aOf(s.engine), t: s.title || 'New conversation', s: ago(s.updatedAt) })));
  }
  async function loadLive() {
    const e = await j('/api/engines'); const h = await j('/api/health');
    window.LIVE = { engines: e.engines.filter(x => x.health.ok).length, host: (h.name || 'CaesarOS') + ' ' + (h.version || '') + ' · this machine' };
  }
  // the run mode in the bar follows the saved setting (a fresh install is Local), not the prototype's demo value;
  // and the VPS mode is only offered once a gateway is actually paired
  async function loadSettings() {
    window.SETTINGS = await j('/api/settings');
    const gw = await j('/api/gateways').catch(() => ({ gateways: [] }));
    window.REMOTE = !!(gw.gateways || []).length;
    const mode = ({ local: 'local', vps: 'vps', offline: 'off' })[window.SETTINGS.engine] || 'local';
    OGS.mode = mode === 'vps' && !window.REMOTE ? 'local' : mode;
    applyRouting(false);
  }
  // ---- Local only: one switch; while it is on the whole shell takes a calmer colour and every answer stays on local engines ----
  function localOnly() { return !!(window.SETTINGS && window.SETTINGS.localOnly); }
  function applyRouting(sweep) {
    const r = document.documentElement; r.dataset.routing = localOnly() ? 'local' : 'cloud';
    if (sweep) { r.classList.remove('route-sweep'); void r.offsetWidth; r.classList.add('route-sweep'); setTimeout(() => r.classList.remove('route-sweep'), 1100); }
  }
  async function setRoute(on) { if (localOnly() !== !!on) await toggleRoute(); }
  window.xSetRoute = on => { void setRoute(on); };
  // the `/` menu: the shell's own commands, and the read-only Hermes commands that answer in one turn (core/commands.ts)
  window.XCMDS = [['/local', 'keep every answer on this machine', 'route'], ['/cloud', 'let any engine answer', 'route']];
  async function loadCommands() {
    try { const r = await j('/api/chat/commands'); window.XCMDS = window.XCMDS.filter(c => c[2] === 'route').concat((r.commands || []).map(c => [c.name, c.description + (c.args ? ' ' + c.args : ''), 'hermes'])); } catch { /* the menu keeps the shell's own commands */ }
  }
  window.xHermesCmd = cmd => {
    const t = THR(S.cur), eng = t ? engineOf(t.a) : '';
    if (!t || !eng.startsWith('hermes:')) { if (t) { (MSG[S.cur] = MSG[S.cur] || []).push({ a: t.a, x: cmd + ' is a Hermes command. Open a chat with Caesar or a crew member to run it.' }); render(); } return; }
    const box = document.getElementById('inp'); if (box) { box.value = cmd; send(); }
  };
  window.xRouteChip = (cls = '') => `<button type="button" class="route-sw ${cls}" data-route-toggle role="switch" aria-checked="${localOnly()}" aria-label="Local only" title="${localOnly() ? 'Local only is on: answers stay on this machine or your own network. Press to allow cloud engines.' : 'Cloud engines allowed. Press to keep every answer on this machine or your own network.'}"><span class="rs-opt">Cloud</span><span class="rs-opt">${I('lock', 11)}Local</span><i class="rs-thumb"></i></button>`;
  async function toggleRoute() {
    const next = !localOnly();
    try { window.SETTINGS = await j('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ localOnly: next }) }); } catch { return; }
    applyRouting(true); await loadTargets().catch(() => {}); render();
  }
  // "What now?" is real: only things that are true right now
  async function loadFeed() {
    const out = [];
    const set = window.SETTINGS || {};
    if (!set.setupDone) out.push(['Setup', 'Finish setting up CaesarOS', 'About you, your tools, your accounts and offline models', 'Start', 'Open']);
    const dead = TARGETS.filter(t => t.group === 'tools' && !t.ok && t.detail && /sign in/i.test(t.detail));
    for (const t of dead) out.push(['Tool', t.label + ' needs you to sign in', t.detail, 'Start', 'Open']);
    if (!TARGETS.some(t => t.id === 'ollama' && t.ok)) out.push(['Offline', 'No local model yet', 'Install Ollama and download a model to work with no internet', 'Start', 'Open']);
    if (window.xFeedExtra) { try { out.push(...window.xFeedExtra()); } catch { /* the extra items are a convenience */ } }
    FEED.splice(0, FEED.length, ...out);
  }
  async function loadApprovals() {
    const { pending } = await j('/api/approvals');
    S.waiting = pending.map(p => ({ k: p.id, t: p.title, th: p.sessionId || null }));
    return pending;
  }
  async function loadMessages(id) {
    if (loaded.has(id)) return; loaded.add(id);
    const got = await j('/api/chat/sessions/' + id), a = aOf(got.session.engine);
    MSG[id] = got.messages.map(m => m.role === 'user' ? { me: 1, x: m.content, files: m.attachments || [] } : { a, x: m.content || (m.status === 'error' ? (m.error || 'No answer.') : ''), think: m.thinking || '', tools: m.tools || [], sources: m.sources || [] });
    render();
  }

  // the first paint waits for nothing; real data lands a moment later and repaints
  const _render = render;
  // The prototype rebuilds the whole view on every action and replays its entry animation each time, which reads as a
  // reload. The entry animation belongs to changing views, not to pressing Edit layout, so it only plays when the view changes.
  let lastView = '';
  render = function () {
    if (S.cur && !loaded.has(S.cur) && THR(S.cur)) void loadMessages(S.cur);
    const x = S.tabs[S.act] || {}; const view = (x.k || '') + ':' + (x.id || '') + ':' + (OGS && OGS.sp && OGS.sp.on ? 'sp' : '') + (S.split ? 'split' : '');
    const same = view === lastView; lastView = view;
    root.toggleAttribute('data-still', same);
    const r = _render();
    try { mountTerminal(); } catch (e) { console.warn('terminal', e); }
    return r;
  };

  // no conversation yet: pick a crew member to talk to (the prototype always had one, because it was invented)
  const _chatView = chatView;
  const pickCard = t => `<button class="pk" data-newcrew="${esc(t.id === SOLO ? 'caesar-alone' : t.id.replace(/^hermes:/, ''))}" ${t.ok ? '' : 'data-off="1"'}>
      <img src="${t.group === 'crew' ? ((C[t.id.slice(7)] || {}).img || 'art/caesaros-caesar-neo.webp') : (t.group === 'caesar' ? 'art/caesaros-caesar-neo.webp' : (TOOLART[t.id] || 'art/caesaros-caesar-neo.webp'))}" alt="">
      <span class="pk-t"><b>${esc(t.label)}</b><small>${esc(t.role)}</small>${t.ok ? '' : `<em>${esc(t.detail || 'not available')}</em>`}</span></button>`;
  chatView = function (id) {
    if (THR(id)) {
      let v = _chatView(id);
      if (S.waiting.some(w => w.th === id)) v = v.replace(/(<textarea id="inp"[^>]*placeholder=")[^"]*"/, '$1An approval is waiting: type /approve, or reply here"');
      const th = THR(id), em = engineLabelOf(th), cur = S.model && em.models.some(m => m.id === S.model) ? S.model : ((em.models[0] || {}).label || 'default');
      const modelChip = `<span class="pk-menu"><button class="pk-ctx" data-model-chip aria-haspopup="true" aria-expanded="${!!S.modelOpen}" title="The engine and model this conversation talks to">${I('engine', 16)}<span>${esc(em.label || 'engine')} · ${esc(cur)}</span>${em.models.length > 1 ? I('chevron-down', 14) : ''}</button>${S.modelOpen && em.models.length > 1 ? `<ul class="pk-pop" role="menu">${em.models.map(m => `<li><button class="pk-pop-b ${m.id === (S.model || em.models[0].id) ? 'on' : ''}" role="menuitemradio" data-model-pick="${esc(m.id)}">${esc(m.label)}</button></li>`).join('')}</ul>` : ''}</span>`;
      return v.replace('<div class="nx-box">', `${tray()}<div class="nx-ctx">${modelChip}<button class="pk-ctx" data-hist title="Bring back what you sent before (Arrow up and down do the same)">${I('clock', 16)}<span>Earlier</span></button><button class="pk-ctx ${S.think ? 'on' : ''}" data-think aria-pressed="${S.think}" title="Ask the model to reason before it answers (engines that support it)">${I('sparkle', 16)}<span>Thinking ${S.think ? 'on' : 'off'}</span></button><button class="pk-ctx pk-attach" data-attach title="Add images or text files. You can also drop them on the conversation or paste an image.">${I('attach', 16)}<span>Attach</span></button><button class="pk-ctx ${S.ctx ? 'on' : ''}" data-ctx aria-pressed="${S.ctx}" title="Context: your documents are searched and the best passages go to the agent. Off: a clean conversation.">${I('brain', 16)}<span>Context ${S.ctx ? 'on' : 'off'}</span></button></div><div class="nx-box">`);
    }
    const grp = (title, hint, list) => list.length ? `<section class="pk-g"><h3>${title}</h3><p>${hint}</p><div class="pk-row">${list.map(pickCard).join('')}</div></section>` : '';
    return `<div class="nx-view chat enter">${scene('chat', phone() ? 56 : 72)}<div class="nx-chat-in pk-wrap"><h2 class="pk-h">Who do you want to talk to?</h2><div class="pk-route">${window.xRouteChip('big')}</div>
      ${S.pickNotice ? `<p role="alert" style="color:var(--muted);font-size:13px;margin:6px 0 0">${esc(S.pickNotice)}</p>` : ''}
      ${grp('Caesar', 'On his own, no crew, no delegation. Ask him anything.', TARGETS.filter(t => t.group === 'caesar'))}
      ${grp('Coding tools', 'The tools you installed. They use your own sign-in.', TARGETS.filter(t => t.group === 'tools'))}
      ${grp('The crew', 'Hermes profiles with their own memory and skills.', TARGETS.filter(t => t.group === 'crew'))}</div></div>`;
  };

  async function newThread(crewId) {
    // no one named: the core's fixed preference order decides (Caesar alone, a Hermes profile, Claude Code,
    // Codex, Ollama, any model server), never the order the engines were detected in.
    if (!crewId) {
      const d = await j('/api/chat-targets/default').catch(() => ({ id: '', message: '' }));
      if (!d.id) { S.pickNotice = d.message || 'No engine can answer yet.'; S.cur = null; open_({ k: 'chat', id: '' }); render(); return ''; }
      crewId = aOf(d.id);
    }
    S.pickNotice = '';
    const eng = engineOf(crewId); const s = await post('/api/chat/sessions', { engine: eng, model: (['claude', 'codex', 'gemini'].includes(eng) || eng.startsWith('hermes:')) ? 'default' : '' });
    THREADS.unshift({ id: s.id, a: crewId, t: 'New conversation', s: 'just now' }); MSG[s.id] = []; loaded.add(s.id);
    const empty = S.tabs.findIndex(x => x.k === 'chat' && !x.id); if (empty > 0) { S.tabs.splice(empty, 1); S.act = Math.min(S.act, S.tabs.length - 1); }
    open_({ k: 'chat', id: s.id }); S.cur = s.id; render();
    return s.id;
  }

  window.xRefreshFeed = loadFeed;  // real.js asks for a fresh What now after it reads tasks, events and the inbox
  window.xNewThread = newThread;   // real.js opens an incoming task from a paired device in a new conversation

  // the Chat app and the crew buttons open a real conversation (or the picker when there is none yet)
  const _open = open_;
  open_ = function (x) { if (x && x.k === 'app' && x.id === 'Chat') x = { k: 'chat', id: (THR(S.cur) && S.cur) || (THREADS[0] && THREADS[0].id) || '' }; else if (x && x.k === 'chat' && !THR(x.id)) x = { k: 'chat', id: '' }; return _open(x); };

  // ---- what a reply shows besides its text: the reasoning (folded), the tool calls (one row each), the sources ----
  const took = ms => ms == null ? '' : ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s';
  window.xBefore = (x, i) => {
    let h = '';
    if (x.queued) h += `<p class="xf-route" role="status">${I('clock', 12)}<span>Waiting for the answer in progress.</span><button type="button" class="xf-cancel" data-qcancel="${i}">Cancel</button></p>`;
    if (x.sw) h += `<p class="xf-route" role="status">${I('lock', 12)}<span>${x.sw.reason === 'local-only' ? `Local only is on: ${esc(x.sw.label)} answered, on this machine.` : `${esc(x.sw.label)} took over (${esc(x.sw.reason)}) ${x.sw.scope === 'local' ? 'on this machine' : 'in the cloud'}.`}</span></p>`;
    if (x.think && x.think.trim()) h += `<div class="xf-fold ${x.openThink ? 'open' : ''}"><button class="xf-head" data-fold="think" data-mi="${i}" aria-expanded="${!!x.openThink}">${I(x.openThink ? 'chevron-down' : 'chevron-right', 14)}<span>Reasoning</span><em>${x.think.trim().split(/\s+/).length} words</em></button>${x.openThink ? `<p class="xf-body">${esc(x.think)}</p>` : ''}</div>`;
    if (x.tools && x.tools.length) h += `<ul class="xf-tools">${x.tools.map((t, k) => `<li class="xf-tool ${t.status}"><button class="xf-head" data-fold="tool" data-mi="${i}" data-ti="${k}" aria-expanded="${!!t.open}">${I(t.open ? 'chevron-down' : 'chevron-right', 14)}<span>${esc(t.name)}</span><b>${({ running: 'Running', waiting: 'Waiting for your yes', ok: 'Done', error: 'Failed' })[t.status] || ''}</b><em>${took(t.ms)}</em></button>${t.open ? `<div class="xf-body">${t.input != null ? `<small>Input</small><pre>${esc(t.input)}</pre>` : ''}${t.output != null ? `<small>Result</small><pre>${esc(t.output)}</pre>` : ''}</div>` : ''}</li>`).join('')}</ul>`;
    return h;
  };
  window.xAfter = (x, i) => x.sources && x.sources.length ? `<div class="xf-fold ${x.openSrc ? 'open' : ''}"><button class="xf-head" data-fold="src" data-mi="${i}" aria-expanded="${!!x.openSrc}">${I(x.openSrc ? 'chevron-down' : 'chevron-right', 14)}<span>Sources</span><em>${x.sources.length}</em></button>${x.openSrc ? `<ol class="xf-src">${x.sources.map(s => `<li><b>[${s.n}] ${esc(s.name)}</b><span>${esc(s.passage)}</span></li>`).join('')}</ol>` : ''}</div>` : '';

  // ---- the real terminal: one xterm and one shell for the life of the page, moved into whichever pane shows it ----
  const RT = { term: null, fit: null, el: null, ws: null, sid: null, tries: 0, opening: false, state: 'idle' };
  const css = v => getComputedStyle(root).getPropertyValue(v).trim();
  function rtEnsure() {
    if (RT.term) return;
    RT.el = document.createElement('div'); RT.el.className = 'rt';
    RT.term = new Terminal({ fontFamily: (css('--font-mono') || 'monospace') + ', monospace', fontSize: 13, lineHeight: 1.2, cursorBlink: root.dataset.motion !== 'off', scrollback: 2000, allowTransparency: true,
      theme: { background: 'rgba(0,0,0,0)', foreground: css('--text') || '#e8e2d2', cursor: css('--accent') || '#ff8a3d', selectionBackground: 'rgba(255,138,61,.28)' } });
    RT.fit = new FitAddon.FitAddon(); RT.term.loadAddon(RT.fit); RT.term.open(RT.el);
    RT.term.onData(d => { if (!RT.sid && !RT.parked && !RT.opening) { void rtOpen(); return; } if (RT.ws && RT.ws.readyState === 1) RT.ws.send(JSON.stringify({ t: 'in', d })); });
    new ResizeObserver(() => rtFit()).observe(RT.el);
  }
  function rtFit() { if (!RT.term || !RT.el.isConnected) return; try { RT.fit.fit(); } catch { return; } if (RT.ws && RT.ws.readyState === 1) RT.ws.send(JSON.stringify({ t: 'resize', cols: RT.term.cols, rows: RT.term.rows })); }
  function rtConnect() {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/api/terminal/ws?id=' + encodeURIComponent(RT.sid));
    ws.binaryType = 'arraybuffer'; RT.ws = ws;
    ws.onopen = () => { RT.tries = 0; RT.state = 'live'; rtFit(); RT.term.focus(); };
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') { try { const m = JSON.parse(ev.data); if (m.t === 'ready') rtFit(); if (m.t === 'exit') { RT.sid = null; RT.state = 'ended'; RT.term.write('\r\n[the shell ended: press Enter for a new one]\r\n'); } } catch { /* unknown frame */ } return; }
      RT.term.write(new Uint8Array(ev.data));
    };
    ws.onclose = () => { if (RT.ws !== ws || !RT.sid) return; if (RT.tries++ < 3) setTimeout(() => { if (RT.sid && RT.ws === ws) rtConnect(); }, 800 * RT.tries); else RT.state = 'error'; };
  }
  async function rtOpen() {
    if (RT.sid) { if (!RT.ws || RT.ws.readyState > 1) rtConnect(); return; }
    if (RT.opening) return; RT.opening = true;
    try {
      // a shell that survived a page reload is picked up again; after a restart the last lines of the old one come back dimmed
      let live = null, recover = null;
      try { const l = await (await fetch('/api/terminal/sessions')).json(); live = (l.sessions || []).filter(x => !x.parked).sort((a, b) => b.lastSeen - a.lastSeen)[0] || null; recover = !live && (l.recoverable || [])[0] || null; } catch { /* the plain path below */ }
      if (live) { RT.sid = live.id; rtConnect(); return; }
      const r = await fetch('/api/terminal/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cols: RT.term.cols, rows: RT.term.rows, ...(recover ? { recover: recover.id } : {}) }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.id) { RT.term.write('\r\nThe terminal could not start: ' + (body.error || r.status) + '\r\n'); RT.state = 'error'; return; }
      RT.sid = body.id; rtConnect();
    } catch { RT.term.write('\r\nThe terminal could not reach the core.\r\n'); } finally { RT.opening = false; }
  }
  // END closes the shell with a way back: it keeps running, hidden, for 10 seconds; UNDO brings it back
  async function rtEnd() {
    if (!RT.sid) return; const id = RT.sid;
    const r = await fetch('/api/terminal/sessions/' + encodeURIComponent(id) + '/park', { method: 'POST' }).catch(() => null); if (!r || !r.ok) return;
    RT.parked = id; RT.sid = null; if (RT.ws) { try { RT.ws.close(); } catch { /* gone */ } RT.ws = null; }
    const bar = document.createElement('div'); bar.className = 'rt-undo'; bar.setAttribute('role', 'status'); bar.innerHTML = 'Shell closed. <button class="btn" data-rt="undo">Undo</button>'; RT.el.appendChild(bar); RT.bar = bar;
    RT.undoT = setTimeout(() => { RT.parked = null; bar.remove(); RT.term.write('\r\n[the shell ended: press any key for a new one]\r\n'); RT.state = 'ended'; }, 10_000);
  }
  async function rtUndo() {
    const id = RT.parked; if (!id) return; clearTimeout(RT.undoT);
    const r = await fetch('/api/terminal/sessions/' + encodeURIComponent(id) + '/restore', { method: 'POST' }).catch(() => null);
    if (RT.bar) RT.bar.remove(); RT.parked = null;
    if (r && r.ok) { RT.sid = id; rtConnect(); } else { RT.term.write('\r\n[too late: the shell had ended]\r\n'); RT.state = 'ended'; }
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-rt]'); if (!b) return; e.preventDefault(); e.stopPropagation(); if (b.dataset.rt === 'end') void rtEnd(); else if (b.dataset.rt === 'undo') void rtUndo(); }, true);
  // the pane is the prototype's; its fake shell is replaced by the real one
  termHtml = function (tab) {
    return `<section class="nx-term ${tab ? 'open tabmode' : S.term ? 'open' : ''} ${!tab && S.termSide ? 'side' : ''}" id="term" data-nx="term-x"><div class="th"><span>TERMINAL</span><span class="mono rt-host">${esc((window.LIVE && LIVE.host) || 'this machine')}</span><span style="color:var(--muted)">Ctrl+\` toggles · the shell keeps running when hidden</span><span style="flex:1"></span>${tab ? '' : `<button class="btn ghost" data-nx="term-side" style="padding:3px 8px;font-size:11px">${S.termSide ? 'DOCK BOTTOM' : 'DOCK SIDE'}</button><button class="btn ghost" data-nx="term-tab" style="padding:3px 8px;font-size:11px">OPEN AS TAB ↗</button><button class="btn ghost" data-nx="term" style="padding:3px 8px;font-size:11px">HIDE</button>`}<button class="btn ghost" data-rt="end" style="padding:3px 8px;font-size:11px" title="End this shell. You can undo for 10 seconds.">END</button></div><div class="rt-slot" id="to"></div></section>`;
  };
  function mountTerminal() {
    const slot = $('.rt-slot'); if (!slot) return;
    rtEnsure(); if (RT.el.parentNode !== slot) slot.appendChild(RT.el);
    const shown = S.term || (S.tabs[S.act] || {}).k === 'term';   // a shell starts when the pane is first shown, not at page load
    if (shown) requestAnimationFrame(() => { rtFit(); void rtOpen(); RT.term.focus(); });
  }

  // the first message from the Start composer: the core's default engine answers (see newThread), else the
  // picker says honestly that nothing can answer yet. Never a dead end, never a claim about an engine not installed.
  async function firstTalk(text) {
    const id = await newThread('');
    const box = id && document.getElementById('inp'); if (box) { box.value = text; send(); }
  }
  window.CX = { newThread: (a) => newThread(a), send: () => send(), ask: (text) => firstTalk(text) };   // for pages that start a conversation (Computer, Start)

  // ---- the phone: a chat app first, an operational tool second. Same functions, lighter screen. ----
  const _wsView = wsView;
  const stDot = st => st === 'work' ? 'work' : st === 'wait' ? 'wait' : '';
  wsView = function () {
    if (!phone()) return _wsView();
    const d = new Date(), h = d.getHours(), g = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const who = (window.SETTINGS && SETTINGS.profile && SETTINGS.profile.callMe) || '';
    const wait = S.waiting.map(w => `<li class="ph-w"><button class="ph-w-t" data-rd="orchgo:${esc(w.th || '')}" ${w.th ? '' : 'disabled'}>${esc(w.t)}</button><div class="ph-wb"><button class="su-btn go" data-ph-ok="${esc(w.k)}">${I('check', 16)}<span>Approve</span></button><button class="su-btn" data-ph-no="${esc(w.k)}"><span>Not now</span></button></div></li>`).join('');
    const rows = THREADS.slice(0, 12).map(t => `<li><button class="ph-row" data-ses="${esc(t.id)}"><img src="${(C[t.a] || {}).img || 'art/caesaros-caesar-neo.webp'}" alt=""><span class="ph-rt"><b>${esc(t.t)}</b><small>${esc((C[t.a] || {}).n || '')} · ${esc(t.s)}</small></span><i class="nx-dot ${stDot((C[t.a] || {}).st)}"></i></button></li>`).join('');
    const crew = CREW.map(m => `<button class="ph-av" data-ns="crew:${esc(m.id)}" aria-label="${esc(m.n)}, ${esc(m.r)}"><img src="${m.img}" alt=""><i class="nx-dot ${stDot(m.st)}"></i><span>${esc(m.n)}</span></button>`).join('');
    const now = FEED.map(f => `<li class="ph-n"><div><small>${esc(f[0])}</small><b>${esc(f[1])}</b></div><button class="su-btn" data-open-app="${esc(f[3] || 'Start')}"><span>${esc(f[4] || 'Open')}</span></button></li>`).join('');
    return `<div class="nx-view enter ph" id="v-ws"><header class="ph-head"><small>${d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}</small><h1>${g}${who ? ', ' + esc(who) : ''}</h1></header>
      <section class="ph-s"><button class="su-btn go ph-main" data-ph-chat>${I('send', 18)}<span>Chat</span></button>${window.xRouteChip('big')}</section>
      ${S.waiting.length ? `<section class="ph-s"><h2>Waiting for you <em>${S.waiting.length}</em></h2><ul class="ph-wl">${wait}</ul></section>` : ''}
      ${typeof WSN !== 'undefined' && WSN.length > 1 ? `<section class="ph-s"><h2>Workspaces</h2><div class="ph-ws">${WSN.map((n, i) => `<button type="button" class="su-btn ${i === S.ws ? 'go' : ''}" data-ws="${i}" aria-pressed="${i === S.ws}"><span>${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][i] || i + 1} ${esc(n)}</span></button>`).join('')}</div></section>` : ''}
      ${window.xSync && window.xSync.paired ? `<section class="ph-s"><h2>Sync</h2><p class="ph-empty" role="status">${esc(window.xSync.line)}</p><button class="su-btn" data-rd="syncall"><span>Sync now</span></button></section>` : ''}
      <section class="ph-s"><h2>The crew</h2><div class="ph-crew">${crew}</div></section>
      <section class="ph-s"><h2>Conversations</h2>${rows ? `<ul class="ph-list">${rows}</ul>` : '<p class="ph-empty">No conversations yet.</p>'}<button class="su-btn go ph-new" data-nx="new">${I('plus', 16)}<span>New conversation</span></button></section>
      ${FEED.length ? `<section class="ph-s"><h2>What now</h2><ul class="ph-nl">${now}</ul></section>` : ''}${window.xLimitsHtml ? window.xLimitsHtml() : ''}</div>`;
  };

  // the message box grows with what is typed, up to 40 percent of the screen, and shrinks again after sending
  const growBox = () => { const i = $('#inp'); if (!i) return; i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, Math.round(innerHeight * 0.4)) + 'px'; };
  document.addEventListener('input', e => { if (e.target && e.target.id === 'inp') growBox(); });
  document.addEventListener('keydown', e => { if (e.target && e.target.id === 'inp') setTimeout(growBox, 30); });
  document.addEventListener('click', () => setTimeout(growBox, 80));
  // sending: the real turn, streamed into the last message
  send = function () {
    const i = $('#inp'); if (!i) return; const v = i.value.trim(); const id = S.cur; if (!v || !id || !THR(id)) return;
    const th = THR(id), list = (MSG[id] = MSG[id] || []);
    const sendFiles = S.files.slice(); list.push({ me: 1, x: v, files: sendFiles.map(f => ({ name: f.name, kind: f.kind, size: f.size })) }); S.files = []; attProblem = ''; const reply = { a: th.a, x: '' }; list.push(reply); i.value = ''; C[th.a].st = 'work'; render();
    let raf = 0; const paint = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (S.cur === id) { const m = $('#msgs'); const t = document.createElement('div'); t.innerHTML = chatView(id); const n = t.querySelector('#msgs'); if (m && n) { m.innerHTML = n.innerHTML; m.scrollTop = m.scrollHeight; } else render(); } }); };
    void runTurn(id, v, sendFiles, reply, paint);
  };

  // One streamed turn for a session: the chat view and the dock both send through here, so the SSE parsing exists once.
  // A message sent while an answer is still coming waits its turn instead of being refused: it shows as "waiting", can be cancelled,
  // and starts by itself when the running answer ends. shortcut: the queue lives in this tab; a reload forgets what was waiting.
  const RUNNING = new Set(), QUEUE = {};
  window.xQueued = id => (QUEUE[id] || []).length;
  async function runTurn(id, v, sendFiles, reply, paint) {
    if (RUNNING.has(id)) { reply.queued = true; reply.x = ''; (QUEUE[id] = QUEUE[id] || []).push({ v, sendFiles, reply, paint }); if (paint) paint(); return; }
    RUNNING.add(id);
    const th = THR(id);
    try {
      const res = await fetch('/api/chat/sessions/' + id + '/turns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: v, model: S.model || '', think: !!S.think, useKnowledge: !!S.ctx, attachments: sendFiles.map(({ name, mime, data }) => ({ name, mime, data })) }) });
      if (!res.ok || !res.body) { const b = await res.json().catch(() => ({})); reply.x = b.error === 'attachment-refused' ? ({ 'no-vision': 'This engine cannot take images. Choose another engine or remove the image.', unsupported: (b.name || 'A file') + ' cannot be read yet.', 'too-large': (b.name || 'A file') + ' is too large.' }[b.why] || 'A file was refused.') : (b.message || b.error || 'The crew member could not answer.'); return; }
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n'); let at;
        while ((at = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, at); buf = buf.slice(at + 2); let ev = 'message', data = [];
          for (const l of raw.split('\n')) { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) data.push(l.slice(5).replace(/^ /, '')); }
          let d; try { d = JSON.parse(data.join('\n')); } catch { continue; }
          if (ev === 'delta' && d.text) { reply.x += d.text; if (paint) paint(); }
          else if (ev === 'thinking' && d.text) { reply.think = (reply.think || '') + d.text; if (paint) paint(); }
          else if (ev === 'tool' && d.name) { reply.tools = reply.tools || []; const i = reply.tools.findIndex(t => t.id === d.id); if (i >= 0) reply.tools[i] = d; else reply.tools.push(d); if (paint) paint(); }
          else if (ev === 'sources' && Array.isArray(d)) { reply.sources = d; if (paint) paint(); }
          else if (ev === 'switch' && d.to) { reply.sw = d; if (paint) paint(); }
          else if (ev === 'error') { reply.x += (reply.x ? '\n\n' : '') + (d.message || 'Failed.'); if (paint) paint(); }
        }
      }
    } catch (e) { reply.x = reply.x || 'Connection lost.'; }
    finally {
      if (th) th.s = 'just now'; await Promise.all([loadCrew(), loadSessions(), loadApprovals()]).catch(() => {}); render(); if (paint) paint();
      if (window.xVoice && window.xVoice.on() && reply.x && !reply.queued) void window.xSpeak(reply.x);
      RUNNING.delete(id); const nx = (QUEUE[id] || []).shift(); if (nx) { nx.reply.queued = false; void runTurn(id, nx.v, nx.sendFiles, nx.reply, nx.paint); }
    }
  }


  // ---- one box: Arrow up and down bring back what you sent in this conversation; ./name starts a new conversation ----
  // The recalled text is the person's own words, so it is only ever put into the box, never rendered as interface text.
  const HIST = { cur: null, i: -1, draft: '' };
  function recall(el, dir) {
    const mine = (MSG[S.cur] || []).filter(m => m.me && m.x).map(m => m.x);
    if (HIST.cur !== S.cur || !el.value) { HIST.cur = S.cur; HIST.i = -1; }
    if (!mine.length || (HIST.i < 0 && dir > 0)) return false;
    if (HIST.i < 0) { HIST.draft = el.value; HIST.i = mine.length; }
    HIST.i = Math.max(0, Math.min(mine.length, HIST.i + dir));
    el.value = HIST.i === mine.length ? HIST.draft : mine[HIST.i]; if (HIST.i === mine.length) HIST.i = -1;
    el.setSelectionRange(el.value.length, el.value.length); el.dispatchEvent(new Event('input', { bubbles: true })); return true;
  }
  document.addEventListener('keydown', e => {
    const el = e.target; if (!el || el.id !== 'inp' || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    if (typeof sug !== 'undefined' && sug.length) return;                                        // the suggestion list owns the arrows while it is open
    if (e.key === 'ArrowUp' ? el.value.slice(0, el.selectionStart).includes('\n') : el.value.slice(el.selectionEnd).includes('\n')) return;   // inside a longer text the arrows move the caret
    if (recall(el, e.key === 'ArrowUp' ? -1 : 1)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-hist]')) { e.preventDefault(); e.stopPropagation(); const el = document.getElementById('inp'); if (el) { recall(el, -1); el.focus(); } } }, true);
  // $skill anywhere in a message: known skill tokens are lifted to the front as /skill before it goes out (the pill look is not built)
  window.XSKILLS = null;
  j('/api/skills').then(r => { if (Array.isArray(r)) window.XSKILLS = r; }).catch(() => {});
  const lift = v => {
    const ids = new Set((window.XSKILLS || []).map(k => k.id)), got = [];
    const rest = v.replace(/(^|\s)\$([\w-]+)(?=\s|$)/g, (m, sp, id) => ids.has(id) ? (got.push('/' + id), sp) : m).replace(/[ \t]{2,}/g, ' ').trim();
    return got.length ? got.join(' ') + ' ' + rest : v;
  };
  window.xLiftSkills = lift;
  const _send = send;
  send = function () {
    const i0 = $('#inp'); if (i0 && /\$[\w-]/.test(i0.value) && !/^\.\//.test(i0.value.trim())) i0.value = lift(i0.value);
    const i = $('#inp'), m = i && i.value.trim().match(/^\.\/([^\s/][^\s]{0,59})(?:\s+([\s\S]*))?$/), th = m && THR(S.cur);
    if (!m || !th) return _send();
    const title = m[1], rest = (m[2] || '').trim(); i.value = '';
    void (async () => {
      const id = await newThread(th.a); if (!id) return;
      await j('/api/chat/sessions/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) }).catch(() => {});
      const t = THR(id); if (t) t.t = title; render();
      if (rest) { const box = $('#inp'); if (box) { box.value = rest; _send(); } }
    })();
  };

  // A conversation the dock started (or resumed) joins the same lists the chat view reads.
  function adopt(session) {
    const a = aOf(session.engine);
    if (!C[a]) C[a] = { id: a, n: a === 'caesar-alone' ? 'Caesar' : String(session.engine || a), r: a === 'caesar-alone' ? 'Alone' : '', img: 'art/caesaros-caesar-neo.webp', st: 'idle', doing: '' };
    if (!THR(session.id)) THREADS.unshift({ id: session.id, a, t: session.title || 'New conversation', s: ago(session.updatedAt || Date.now()) });
    if (!MSG[session.id]) MSG[session.id] = [];
    return THR(session.id);
  }
  window.xAdopt = adopt; window.xLoad = loadMessages; window.xTurn = runTurn;   // the chat dock speaks through the bridge, never its own stream

  approve = async function (k, ok) {
    const w = S.waiting.find(x => x.k === k);
    try { await post('/api/approvals/' + encodeURIComponent(k) + '/decision', { decision: ok ? 'approved' : 'denied', sessionId: w && w.th || undefined }); S.resolved[k] = ok ? 'Approved.' : 'Not now.'; } catch { S.resolved[k] = 'Could not send your answer.'; }
    await loadApprovals().catch(() => {}); render();
  };

  document.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files') && e.target.closest && e.target.closest('.nx-chat-in,.nx-comp')) { e.preventDefault(); root.setAttribute('data-drop', ''); } });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) root.removeAttribute('data-drop'); });
  document.addEventListener('drop', e => { root.removeAttribute('data-drop'); if (e.dataTransfer && e.dataTransfer.files.length && e.target.closest && e.target.closest('.nx-chat-in,.nx-comp') && THR(S.cur)) { e.preventDefault(); void addFiles(e.dataTransfer.files); } });
  document.addEventListener('paste', e => { const im = [...(e.clipboardData ? e.clipboardData.files : [])].filter(f => f.type.startsWith('image/')); if (im.length && e.target.id === 'inp') { e.preventDefault(); void addFiles(im); } });
  document.addEventListener('click', e => {
    const pok = e.target.closest('[data-ph-ok]'), pno = e.target.closest('[data-ph-no]'); if (pok || pno) { e.preventDefault(); e.stopPropagation(); void approve((pok || pno).dataset.phOk || pno.dataset.phNo, !!pok); return; }
    const qc = e.target.closest('[data-qcancel]');
    if (qc) { e.preventDefault(); e.stopPropagation(); const list = MSG[S.cur] || [], i = +qc.dataset.qcancel, rep = list[i], q = QUEUE[S.cur] || []; const at = q.findIndex(x => x.reply === rep); if (at >= 0) { q.splice(at, 1); rep.queued = false; rep.x = 'Cancelled before it started.'; render(); } return; }
    if (e.target.closest('[data-route-toggle]')) { e.preventDefault(); e.stopPropagation(); void toggleRoute(); return; }
    if (e.target.closest('[data-ph-chat]')) { e.preventDefault(); e.stopPropagation(); const t = THREADS[0]; if (t) { open_({ k: 'chat', id: t.id }); render(); } else void newThread(''); return; }
    if (e.target.closest('[data-think]')) { e.preventDefault(); e.stopPropagation(); S.think = !S.think; render(); return; }
    const mc = e.target.closest('[data-model-chip]'); if (mc) { e.preventDefault(); e.stopPropagation(); S.modelOpen = !S.modelOpen; render(); return; }
    const mp = e.target.closest('[data-model-pick]'); if (mp) { e.preventDefault(); e.stopPropagation(); S.model = mp.dataset.modelPick; S.modelOpen = false; render(); return; }
    if (S.modelOpen && !e.target.closest('.pk-menu')) { S.modelOpen = false; render(); }
    if (e.target.closest('[data-attach]')) { e.preventDefault(); e.stopPropagation(); picker.click(); return; }
    const rm = e.target.closest('[data-rmfile]'); if (rm) { e.preventDefault(); e.stopPropagation(); S.files.splice(+rm.dataset.rmfile, 1); attProblem = ''; render(); return; }
    const fd = e.target.closest('[data-fold]'); if (fd) { e.preventDefault(); e.stopPropagation(); const m = (MSG[S.cur] || [])[+fd.dataset.mi]; if (m) { const k = fd.dataset.fold; if (k === 'think') m.openThink = !m.openThink; else if (k === 'src') m.openSrc = !m.openSrc; else if (m.tools && m.tools[+fd.dataset.ti]) m.tools[+fd.dataset.ti].open = !m.tools[+fd.dataset.ti].open; const box = $('#msgs'), top = box ? box.scrollTop : 0; render(); const nb = $('#msgs'); if (nb) nb.scrollTop = top; } return; }
    if (e.target.closest('[data-ctx]')) { e.preventDefault(); e.stopPropagation(); S.ctx = !S.ctx; render(); return; }
    if (e.target.closest('[data-nx="stop-all"]')) { e.preventDefault(); e.stopPropagation(); fetch('/api/running/stop', { method: 'POST' }).then(() => loadCrew()).then(() => render()).catch(() => {}); return; }
    const cr = e.target.closest('[data-crew], [data-ns^="crew:"]'); if (cr && cr.dataset.crew && cr.dataset.crew.includes(':')) return; const cid = cr && (cr.dataset.crew || cr.dataset.ns.slice(5)); if (cid && !THREADS.some(t => t.a === cid)) { e.preventDefault(); e.stopPropagation(); S.flyout = null; void newThread(cid); return; }
    const n = e.target.closest('[data-newcrew]'); if (n) { e.preventDefault(); void newThread(n.dataset.newcrew); return; }
    const nw = e.target.closest('[data-nx="new"]'); if (nw) { e.preventDefault(); e.stopPropagation(); S.cur = null; S.flyout = null; open_({ k: 'chat', id: '' }); render(); }
  }, true);

  (async () => {
    try { await loadSettings(); await loadEngines(); await loadCrew(); await loadTargets(); await loadCommands(); await loadSessions(); await loadApprovals(); await loadLive(); await loadFeed(); } catch (e) { console.warn('core not reachable', e); }
    render();
    setInterval(async () => { try { root.toggleAttribute('data-busy', CREW.some(c => c.st === 'work') || S.waiting.length > 0); const ch = await loadCrew(); const p = await loadApprovals(); if (ch || p.length !== S.waiting.length) render(); } catch { /* the next tick asks again */ } }, 5000);
  })();
})();
