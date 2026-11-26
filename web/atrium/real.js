/* Real pages for the Atrium: the prototype's Devices, Models, Gateway and Library on the real core.
   Same look (og-card, og-row, og-tag, btn), real data. Each page loads on first draw, keeps its state in RD, and calls
   the prototype's own render() when something changes. Writes go through the core's own guards (operator only). */
(() => {
  const RD = { marketItems: null, marketErr: '', marketBusy: false, dev: null, hw: null, inst: null, pull: null, ollama: false, keys: null, fresh: null, kb: null, kbq: '', kbhits: null, bk: null, err: {}, join: { url: '', code: '' }, code: null };
  window.xRD = RD;   // the Library halls read the book list from here
  const J = { 'content-type': 'application/json' };
  const toLogin = r => { if (r && r.status === 401) location.href = '/login'; return r; };   // the owner password is on and the session ended
  const g = async (u, d) => { try { const r = toLogin(await fetch(u)); return r.ok ? await r.json() : d; } catch { return d; } };
  const w = async (u, m, b) => { try { return toLogin(await fetch(u, { method: m, headers: J, body: b === undefined ? undefined : JSON.stringify(b) })); } catch { return { ok: false, json: async () => ({}) }; } };
  const E = s => (typeof OGE === 'function' ? OGE(s) : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const ago = t => { if (!t) return '-'; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const sw = (k, on) => `<span class="og-sw ${on ? 'on' : ''}" data-rd="${k}" role="switch" aria-checked="${!!on}" tabindex="0"></span>`;
  const btn = (k, label, extra = '') => `<button class="btn" data-rd="${k}" ${extra}>${E(label)}</button>`;
  const sec = t => `<div class="og-sec">${E(t)}</div>`;
  const head = (name, sub, la) => (typeof ogHead === 'function' ? ogHead(name, sub, la) : `<h2>${E(name)}</h2>`);
  const loadingCard = () => (typeof ARTSKEL === 'function' ? ARTSKEL(3, 'Loading from this device') : '<div class="og-card" role="status"><p>Loading from this device…</p></div>');
  const again = () => render();
  const V = {};   // the views this script provides; registered in one go at the end

  /* ---------- Devices ---------- */
  /* the copies sync makes when two devices changed one thing: listed together, with both texts, so the person picks */
  // the sync check, light: what an incoming copy contains that deserves a look before it replaces anything
  const CHECKS = [[/(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/, 'looks like a key or secret'], [/(curl|wget)[^\n|]*\|\s*(ba)?sh|rm\s+-rf\s+[\/~]|<script\b/i, 'contains a command or script'], [/ignore (all |any )?(previous|prior) instructions|disregard (the )?(system|above)/i, 'looks like a prompt injection']];
  const flagsOf = t => CHECKS.filter(([re]) => re.test(t || '')).map(x => x[1]);
  async function loadCopies() {
    const enc = encodeURIComponent, all = await g('/api/notes', []);
    RD.cop = await Promise.all(all.filter(n => n.id.includes(' (via ')).map(async c => {
      const orig = c.id.replace(/ \(via [^)]*\)$/, ''), [cn, on] = await Promise.all([g('/api/notes/' + enc(c.id), null), g('/api/notes/' + enc(orig), null)]);
      return { id: c.id, orig, from: (c.id.match(/\(via ([^)]*)\)$/) || [])[1] || 'another device', copy: (cn && cn.content) || '', mine: (on && on.content) || '', rev: on && on.rev, hasOrig: !!on, flags: flagsOf(cn && cn.content) };
    }));
    RD.chatcop = (await g('/api/chat/sessions', [])).filter(s => (s.title || '').includes(' (via '));
  }
  async function loadDev() {
    RD.dev = await g('/api/pairing', { visible: false, discover: false, devices: [], name: 'this device', codeActive: false });
    RD.bk = await g('/api/backup', []);
    RD.notes = (await g('/api/notes', [])).length;
    RD.inbox = await g('/api/handoff', []); RD.sync = await g('/api/sync/state', {}); RD.csync = await g('/api/sync/chats/state', {}); RD.sround = (await g('/api/sync/status', { last: null })).last;
    await loadCopies(); RD.held = await g('/api/sync/held', []); RD.feed = (await g('/api/sync/feed', [])).slice(-12).reverse();
    again();
  }
  V.Devices = () => {
    if (!RD.dev) { void loadDev(); return `<div class="nx-view enter">${head('Devices', 'Your devices, paired once with a code, nothing in the open.', 'Castra')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const d = RD.dev, last = (RD.bk || [])[0];
    const codeBox = RD.code ? `<div class="og-card" style="border-color:var(--accent)"><div class="og-row"><h4 style="letter-spacing:.3em;font-size:28px">${E(RD.code.code.slice(0, 3))} ${E(RD.code.code.slice(3))}</h4><span class="og-tag sig" id="rd-left">5:00</span></div><p>Type this on the other device within five minutes. It works once.</p></div>` : '';
    const paired = d.devices.length ? d.devices.map(x => `<div>${I('crew', 16)}<span>${E(x.name)} <small>${x.role === 'i-joined' ? 'You joined it' : 'Joined you'} · last seen ${ago(x.lastSeen)}</small></span><span class="og-row">${x.canSend ? `<input class="og-input" id="rd-send-${E(x.id)}" placeholder="Send a task to this device" style="min-width:180px">${btn('send:' + E(x.id), 'Send')}${btn('pick:' + E(x.id), RD.pick === x.id ? 'Close notes' : 'Send a note')}<span>${sw('syncn:' + E(x.id), (RD.sync || {})[x.id])} <span class="label">Keep notes, tasks and events in sync</span></span>${btn('syncnow:' + E(x.id), 'Sync now')}${x.canSyncChats ? `<span>${sw('syncc:' + E(x.id), (RD.csync || {})[x.id])} <span class="label">Keep conversations in sync (end to end encrypted)</span></span>${btn('synccnow:' + E(x.id), 'Sync chats now')}` : '<small>Conversations: unpair and pair again to create an encryption key.</small>'}` : ''}<button class="btn" data-rd="unpair:${E(x.id)}">Unpair</button></span></div>`).join('') : '<div style=\"display:block\"><span>No device is paired yet. <small>Show a code here, or enter one from the other device below.</small></span></div>';
    return `<div class="nx-view enter">${head('Devices', 'Your devices, paired once with a code, nothing in the open.', 'Castra')}
    <div class="og-wrap">
     <div class="og-card" style="border-color:var(--accent)"><div class="og-row"><h4>Brain</h4><span class="og-tag ${last ? 'sig' : 'mut'}">${last ? 'Backed up' : 'No backup'}</span></div><p>${last ? 'Last backup ' + ago(last.at) + ' · ' + last.sizeMb + ' MB · ' : ''}${RD.notes} ${RD.notes === 1 ? 'note' : 'notes'} on this device.</p><div class="og-row">${btn('bkmake', 'Back up now')}<a class="btn" href="${last ? '/api/backup/' + E(last.name) : '#'}" ${last ? 'download' : 'aria-disabled="true"'}>Download last</a></div></div>
     ${sec('Sync')}
     <div class="og-card"><div class="og-row"><h4>Sync now</h4>${btn('syncall', RD.syncing ? 'Syncing…' : 'Sync now', RD.syncing ? 'disabled' : '')}</div>
      <p>One full round with every paired device that has sync switched on: notes, tasks, events and, where you allowed it, conversations (encrypted). Nothing is overwritten or deleted.</p>
      ${RD.sround ? `<p role="status">Last round ${ago(RD.sround.at)}: ${E(RD.sround.note || RD.sround.devices.map(x => { const nm = ((d.devices.find(y => y.id === x.id) || {}).name || 'device'); const part = (l, p) => p ? (p.error ? l + ' failed (' + p.error + ')' : l + ' ' + p.sent) : ''; return nm + ': ' + [part('notes and tasks', x.notes), part('chats', x.chats)].filter(Boolean).join(', '); }).join(' · '))}${RD.sround.ok ? '' : ' (something failed)'}</p>` : '<p>No round yet.</p>'}</div>
     ${sec('Held for review')}
     <div class="og-list">${(RD.held || []).length ? RD.held.map(h => `<div style="display:block"><span><b>${E(h.name)}</b> <small>from ${E(h.from)} · ${E(h.flags.join(', '))}</small></span><p>${E(h.preview)}</p><div class="og-row">${btn('hrel:' + h.id, 'Release (I looked)')}${btn('hdis:' + h.id, 'Discard')}</div></div>`).join('') : '<div style="display:block"><span>Nothing held. Notes from other devices that contain a key, a run-from-the-net command or an instruction aimed at an agent wait here instead of arriving.</span></div>'}</div>
     ${sec('Sync feed')}
     <div class="og-list">${(RD.feed || []).length ? RD.feed.map(l => `<div style="display:block"><span>${E(l.name)} <small>${l.dir === 'in' ? 'from' : 'to'} ${E(l.device)} · ${E(l.outcome)} · ${ago(l.at)}</small></span></div>`).join('') : '<div style="display:block"><span>Nothing has moved yet.</span></div>'}</div>
     ${sec('Copies from sync')}
     <div class="og-list">${(RD.cop || []).length ? RD.cop.map((c, i) => `<div style="display:block"><span><b>${E(c.orig)}</b> <small>copy from ${E(c.from)}${c.hasOrig ? '' : ' · no version of yours'}</small>${c.flags.length ? ` <span class="og-tag" role="alert">Check first: ${E(c.flags.join(', '))}</span>` : ''}</span>
       <div class="og-grid"><div class="og-card"><h4>Yours</h4><p>${E((c.mine || '(empty)').slice(0, 300))}</p></div><div class="og-card"><h4>From ${E(c.from)}</h4><p>${E((c.copy || '(empty)').slice(0, 300))}</p></div></div>
       <div class="og-row">${RD.cpSure === 'use' + i ? btn('cpusego:' + i, 'Replace mine with this copy') : btn('cpuse:' + i, 'Use the copy')}${RD.cpSure === 'keep' + i ? btn('cpkeepgo:' + i, 'Discard the copy (to trash)') : btn('cpkeep:' + i, 'Keep mine')}</div></div>`).join('') : '<div style="display:block"><span>No note copies. Where another device changed something you also changed, its version would arrive here beside yours.</span></div>'}
     ${(RD.chatcop || []).map(s => `<div><span>${E(s.title)} <small>conversation from another device</small></span>${RD.cpSure === 'chat' + s.id ? btn('cpchatgo:' + s.id, 'Delete for good') : btn('cpchat:' + s.id, 'Delete')}</div>`).join('')}</div>
     ${sec('This device')}
     <div class="og-card"><div class="og-row"><h4>${E(d.name)}</h4><span class="og-tag sig">This device</span></div>
      <div class="og-row"><span>${sw('visible', d.visible)} <span class="label">Visible to new devices</span></span><span>${sw('discover', d.discover)} <span class="label">Look for devices</span></span></div>
      <p>Pairing needs a code from this screen, valid five minutes and used once. Turn visibility off and nobody can pair.</p>
      <div class="og-row">${btn('code', 'Show a pairing code', d.visible ? '' : 'disabled')}</div>${RD.err.dev ? `<p role="alert">${E(RD.err.dev)}</p>` : ''}</div>
     ${codeBox}
     ${sec('Paired')}<div class="og-list">${paired}</div>
     ${RD.pick ? `<div class="og-card"><div class="og-row"><h4>Choose a note to send</h4></div><div class="og-list">${(RD.notesList || []).length ? RD.notesList.slice(0, 10).map(n => `<div>${I('memory', 16)}<span>${E(n.id)} <small>${E(n.snippet || '')}</small></span><span class="og-row">${btn('sendnote:' + E(RD.pick) + '|' + E(n.id), 'Send')}</span></div>`).join('') : '<div style="display:block"><span>No notes yet.</span></div>'}</div><p class="og-note">It arrives in the other device\'s inbox; nothing is saved there until the person there says so.</p></div>` : ''}
     ${sec('Tasks sent to this device')}
     <div class="og-list">${(RD.inbox || []).length ? RD.inbox.map(h => `<div>${I('inbox', 16)}<span>${h.kind === 'note' ? E(h.name) + ' (note)' : E(h.text)} <small>From ${E(h.from)} · ${ago(h.at)}</small></span><span class="og-row">${h.kind === 'note' ? btn('hoaccept:' + E(h.id), 'Save as note') : btn('hochat:' + E(h.id), 'Open in chat')}${btn('hocopy:' + E(h.id), 'Copy')}${btn('hodone:' + E(h.id), 'Dismiss')}</span></div>`).join('') : '<div style="display:block"><span>Nothing waiting. A paired device can send you a task; it lands here and nothing runs until you open it.</span></div>'}</div>
     ${sec('Pair with another device')}
     <div class="og-card"><div class="og-row"><input class="og-input" id="rd-url" placeholder="Address, e.g. http://100.x.y.z:4410" value="${E(RD.join.url)}"><input class="og-input" id="rd-code" inputmode="numeric" maxlength="6" placeholder="Code" value="${E(RD.join.code)}" style="min-width:120px"></div><div class="og-row">${btn('join', 'Pair')}</div><p>Pairing makes the two installs known to each other. Syncing chats and notes between them is the next step and is not done yet.</p></div>
    </div></div>`;
  };

  /* ---------- Models ---------- */
  async function loadModels() {
    RD.hw = await g('/api/hardware', { machine: {}, advice: [] });
    RD.inst = await g('/api/models/installed', []);
    RD.pull = await g('/api/models/pull', null);
    const e = await g('/api/engines', { engines: [] }); RD.ollama = !!(e.engines.find(x => x.id === 'ollama') || { health: {} }).health.ok;
    again();
  }
  let pullTimer = null;
  const watchPull = () => { if (pullTimer) return; pullTimer = setInterval(async () => { RD.pull = await g('/api/models/pull', null); again(); if (!RD.pull || RD.pull.done) { clearInterval(pullTimer); pullTimer = null; RD.inst = await g('/api/models/installed', []); again(); } }, 1200); };
  V.Models = () => {
    if (!RD.hw) { void loadModels(); return `<div class="nx-view enter">${head('Models', 'Models for this machine, picked from what it can hold.', 'Armamentarium')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const m = RD.hw.machine || {}, p = RD.pull;
    const tier = { quick: 'Quick start', balanced: 'Balanced', max: 'Best quality' };
    const rows = RD.hw.advice.map(a => {
      const mine = p && p.model === a.model;
      const act = mine && !p.done ? `<progress max="${p.total || ''}" ${p.total ? `value="${p.completed}"` : ''} style="width:100%"></progress><span class="og-tag sig">${p.total ? Math.round(p.completed / p.total * 100) + '%' : E(p.status)}</span>${btn('pullstop', 'Cancel')}` :
        mine && p.done && !p.error && p.status !== 'cancelled' ? '<span class="og-tag sig">Downloaded</span>' :
        RD.ollama ? btn('pull:' + E(a.model), 'Download (' + a.sizeGb + ' GB)', p && !p.done ? 'disabled' : '') : '<span class="og-tag mut">Start Ollama to download</span>';
      return `<div class="og-card"><div class="og-row"><h4>${tier[a.tier]}</h4><span class="og-tag">${E(a.model)} · ${a.sizeGb} GB</span></div><p>${E(a.why)}.</p><div class="og-act">${act}</div>${mine && p.error ? `<p role="alert">${E(p.error)}</p>` : ''}</div>`;
    }).join('') || '<div class="og-card"><p>This machine does not have enough memory for a local model. Use a tool you are signed in to, or a server.</p></div>';
    const inst = (RD.inst || []).length ? RD.inst.map(x => `<div>${I('engine', 16)}<span>${E(x.name)} <small>${x.sizeGb} GB</small></span><span class="og-row">${RD.sure === x.name ? btn('rmgo:' + E(x.name), 'Delete for good') : btn('rm:' + E(x.name), 'Delete')}</span></div>`).join('') : '<div style=\"display:block\"><span>No local model is installed yet.</span></div>';
    if (p && !p.done) watchPull();
    return `<div class="nx-view enter">${head('Models', 'Models for this machine, picked from what it can hold.', 'Armamentarium')}
    <div class="og-wrap"><div class="og-card"><div class="og-row"><h4>This machine</h4></div><p>${m.ramGb} GB memory · ${m.cores} cores · ${m.freeDiskGb} GB free disk · graphics: ${E(m.gpu || 'unknown')}</p></div>
    ${sec('Recommended')}<div class="og-grid">${rows}</div>
    ${sec('Installed')}<div class="og-list">${inst}</div>
    <p class="og-note">Sizes are approximate. Nothing downloads until you press the button; Ollama does the work.</p></div></div>`;
  };

  /* ---------- Gateway (keys) ---------- */
  async function loadKeys() { RD.keys = await g('/api/tokens', []); again(); }
  V.Gateway = () => {
    if (!RD.keys) { void loadKeys(); return `<div class="nx-view enter">${head('Gateway', 'Other apps on this computer can use your engines.', 'Porta')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const base = location.origin.replace(/\/\/[^/]+/, '//127.0.0.1:' + (location.port || 4410)) + '/v1';
    const ex = `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer ${RD.fresh || 'cae_...'}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"claude/default","messages":[{"role":"user","content":"Hello"}]}'`;
    return `<div class="nx-view enter">${head('Gateway', 'Other apps on this computer can use your engines (Ollama, Claude Code, Codex) through one address.', 'Porta')}
    <div class="og-wrap"><div class="og-card"><div class="og-row"><h4>Local gateway</h4><span class="og-tag sig">This computer only</span></div><p>Address <code>${E(base)}</code>. Every app needs its own key; the gateway answers nothing else.</p></div>
    ${sec('Keys')}<div class="og-list">${RD.keys.length ? RD.keys.map(k => `<div>${I('lock', 16)}<span>${E(k.name)}</span><span class="og-row">${btn('keyrm:' + E(k.name), 'Revoke')}</span></div>`).join('') : '<div style=\"display:block\"><span>No key yet.</span></div>'}</div>
    <div class="og-card"><div class="og-row"><input class="og-input" id="rd-key" placeholder="Name, e.g. my-editor"> ${btn('keymk', 'Make a key')}</div>${RD.err.key ? `<p role="alert">${E(RD.err.key)}</p>` : ''}${RD.fresh ? `<p>Shown once, copy it now: <code>${E(RD.fresh)}</code></p>` : ''}</div>
    ${window.GW ? GW.view() : ''}
    ${sec('Example')}<pre class="og-code">${E(ex)}</pre>
    <p class="og-note">Anyone with a key can use your signed-in tools, so keep keys private and revoke what you do not use.</p></div></div>`;
  };

  /* ---------- Library (knowledge) ---------- */
  async function loadKb() { RD.kb = await g('/api/knowledge', []); again(); }
  V.Library = () => {
    if (!RD.kb) { void loadKb(); return `<div class="nx-view enter">${head('Library', 'Documents you add stay on this computer.', 'Bibliotheca')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const hits = RD.kbhits ? (RD.kbhits.length ? RD.kbhits.map(h => `<div>${I('library', 16)}<span>${E(h.name)} <small>${E(h.passage)}</small></span></div>`).join('') : '<div style=\"display:block\"><span>Nothing found.</span></div>') : '';
    const folders = [...new Set(RD.kb.map(x => x.folder || ''))];
    // the old library's format tabs, made from the folders the person actually uses
    const cols = RD.kb.length > 1 && folders.length > 1 ? `<div class="lib-cols" role="tablist" aria-label="Collections">${[['', 'All'], ...folders.map(f => [f, f || 'Unshelved'])].map(([id, label]) => `<button type="button" class="btn ghost${(RD.kfilter || '') === id ? ' on' : ''}" data-rd="kcol:${encodeURIComponent(id)}" role="tab" aria-selected="${(RD.kfilter || '') === id}">${E(label)} <span class="bd-n">${id ? RD.kb.filter(x => (x.folder || '') === id).length : RD.kb.length}</span></button>`).join('')}</div>` : '';
    return `<div class="nx-view enter">${head('Library', 'Documents you add stay on this computer. Search finds passages in all of them.', 'Bibliotheca')}
    <div class="og-wrap">${cols}${window.xLib ? window.xLib.hall(RD) : ''}<div class="og-card"><div class="og-row"><input class="og-input" id="rd-kq" placeholder="Search your documents" value="${E(RD.kbq)}" style="flex:1">${btn('kbsearch', 'Search')}</div>${hits ? `<div class="og-list">${hits}</div>` : ''}</div>
    ${sec('Add a document')}
    <div class="og-card"><div class="og-row"><input class="og-input" id="rd-kname" placeholder="Name"></div><textarea class="og-input" id="rd-ktext" rows="6" placeholder="Paste text or Markdown" style="width:100%;box-sizing:border-box"></textarea><div class="og-row"><label class="btn" style="cursor:pointer">Choose a text or Markdown file<input type="file" id="rd-kfile" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden></label>${btn('kbadd', 'Add to library')}</div>${RD.err.kb ? `<p role="alert">${E(RD.err.kb)}</p>` : ''}</div>
    ${sec('Your documents' + (RD.kfilter ? ' · folder ' + RD.kfilter : ''))}${RD.kfilter ? `<div class="og-row">${btn('kfall', 'All documents')}</div>` : ''}<div class="og-list">${RD.kb.filter(x => !RD.kfilter || x.folder === RD.kfilter).length ? RD.kb.filter(x => !RD.kfilter || x.folder === RD.kfilter).map(x => `<div>${I('library', 16)}<span>${E(x.name)} <small>${x.chars < 1000 ? x.chars + ' characters' : Math.round(x.chars / 1000) + ' k characters'}</small></span><span class="og-row"><input class="og-input" id="rd-kf-${E(x.id)}" placeholder="Folder" value="${E(x.folder || '')}" style="min-width:110px;max-width:150px" aria-label="Folder of ${E(x.name)}">${btn('kfsave:' + E(x.id), 'Move')}${RD.ksure === x.id ? btn('kbrmgo:' + E(x.id), 'Delete for good') : btn('kbrm:' + E(x.id), 'Delete')}</span></div>`).join('') : '<div style=\"display:block\"><span>No documents yet.</span></div>'}</div></div></div>`;
  };


  /* ---------- Settings: the real cards, added under the prototype's own (nothing of it is removed) ---------- */
  async function loadSet() {
    RD.bk = await g('/api/backup', []); RD.pend = (await g('/api/backup/restore', { pending: false })).pending;
    RD.ms = await g('/api/model-servers', []); const gw = await g('/api/gateways', { gateways: [] }); RD.gw = gw.gateways || [];
    RD.audit = await g('/api/audit', []); RD.set = await g('/api/settings', {}); RD.auth = await g('/api/auth/status', { enabled: false });
    again();
  }
  const prevSettings = OG.Settings;
  V.Settings = () => {
    const base = prevSettings ? prevSettings() : '';
    // Credits is a focused Hall of Fame: never append unrelated system settings beneath the statues.
    if (/data-st="open:credits"\s+aria-expanded="true"/.test(base)) return base;
    if (!RD.bk || !RD.set) { void loadSet(); return base; }
    const rows = [{ to: '127.0.0.1:11434', why: 'Ollama on this machine, for local models. Never leaves the computer.' }]
      .concat(RD.ms.map(x => ({ to: x.url, why: 'Model server "' + x.name + '", added by you.' })), RD.gw.map(x => ({ to: x.url, why: 'Gateway "' + x.name + '", added by you.' })),
        (RD.set.brain && RD.set.brain.location === 'remote' && RD.set.brain.url) ? [{ to: RD.set.brain.url, why: 'The remote Brain you chose.' }] : []);
    const bk = RD.bk.length ? RD.bk.map(b => `<div>${I('memory', 16)}<span>${new Date(b.at).toLocaleString()} <small>${b.sizeMb} MB</small></span><span class="og-row"><a class="btn" href="/api/backup/${E(b.name)}" download>Download</a>${RD.bsure === b.name ? btn('bkrmgo:' + E(b.name), 'Delete for good') : btn('bkrm:' + E(b.name), 'Delete')}</span></div>`).join('') : '<div style="display:block"><span>No backup yet.</span></div>';
    const aud = RD.audit.length ? RD.audit.slice(0, 12).map(a => `<div>${I('lock', 16)}<span>${E(a.actor)} · ${E(a.subjectKind)} <small>${new Date(a.at).toLocaleString()} · ${E(a.claim)}</small></span></div>`).join('') : '<div style="display:block"><span>No tool has read private data yet.</span></div>';
    // the extra sections go INSIDE the view the prototype drew (before its closing tag); a second sibling made the grid give the cards 108 px
    const extra = `<div class="og-wrap" style="margin-top:18px">
     ${sec('Password')}
     <div class="og-card"><div class="og-row"><h4>Owner password</h4><span class="og-tag ${RD.auth && RD.auth.enabled ? 'sig' : 'mut'}">${RD.auth && RD.auth.enabled ? 'On' : 'Off'}</span></div>
      <p>${RD.auth && RD.auth.enabled ? 'The page and the API ask for this password before anything opens. Agents and paired devices keep using their own keys.' : 'Off. On a home network or a tailnet, anyone who can open this page can use it. Set a password to close that. If you forget it, start the core once with CAESAROS_AUTH_RESET=1.'}</p>
      <div class="og-row">${RD.auth && RD.auth.enabled ? '<input class="og-input" id="rd-pwcur" type="password" placeholder="Current password" autocomplete="current-password" style="flex:1">' : ''}<input class="og-input" id="rd-pwnew" type="password" placeholder="${RD.auth && RD.auth.enabled ? 'New password (8 or more)' : 'Password (8 or more)'}" autocomplete="new-password" style="flex:1"></div>
      <div class="og-row">${btn('pwset', RD.auth && RD.auth.enabled ? 'Change password' : 'Turn on')}${RD.auth && RD.auth.enabled ? btn('pwoff', 'Turn off') + btn('pwout', 'Log out') : ''}</div>${RD.err.pw ? `<p role="alert">${E(RD.err.pw)}</p>` : ''}</div>
     ${sec('Restore from a backup')}
     <div class="og-card"><p>Pick a backup file made here. It is checked first and applied the next time CaesarOS starts; your current data is saved first as a backup named pre-restore.</p><div class="og-row"><label class="btn" style="cursor:pointer">Restore from a file<input type="file" id="rd-bkfile" accept=".db,application/octet-stream" hidden></label></div>${RD.pend ? `<p role="status">The backup is checked and waiting. Close and open CaesarOS to apply it. ${btn('bkcancel', 'Cancel')}</p>` : ''}${RD.err.bk ? `<p role="alert">${E(RD.err.bk)}</p>` : ''}</div>
     ${sec('Where this app can connect')}
     <div class="og-list">${rows.map(r => `<div>${I('globe', 16)}<span>${E(r.to)} <small>${E(r.why)}</small></span></div>`).join('')}</div>
     <p class="og-note">This is the complete list. Claude Code, Codex and Gemini CLI use their own connection and sign-in. No telemetry, no analytics, no update check runs by itself.</p>
     ${sec('Report a problem')}
     <div class="og-card"><p>Build a short report of this install, read all of it, then send it yourself if you want to. Nothing is sent from here.</p><textarea class="og-input" id="rd-rnote" rows="3" placeholder="What went wrong?" style="width:100%;box-sizing:border-box"></textarea><div class="og-row">${btn('rbuild', 'Build the report')}</div>${RD.report ? `<textarea class="og-input" id="rd-report" rows="10" style="width:100%;box-sizing:border-box;text-transform:none">${E(RD.report)}</textarea><div class="og-row">${btn('rcopy', 'Copy')}${btn('rsave', 'Save as a file')}</div><p class="og-note">It holds the version, your browser, settings names and what was found on this machine. No chats, notes or keys.</p>` : ''}</div>
    </div>`;
    return /<\/div>\s*$/.test(base) ? base.replace(/<\/div>\s*$/, () => extra + '</div>') : base + extra;
  };
  async function buildReport() {
    const [v, d, h, e] = await Promise.all([g('/api/version', {}), g('/api/detect', { engines: [] }), g('/api/hardware', {}), g('/api/engines', { engines: [] })]);
    const st = RD.set || {};
    RD.report = ['CaesarOS ' + (v.version || '?') + ' (build ' + (v.build || '?') + ')', 'Browser: ' + navigator.userAgent, 'Settings: theme=' + st.theme + ' language=' + st.language + ' motion=' + st.motion + ' engine=' + st.engine,
      'Machine: ' + JSON.stringify(h.machine || {}), 'Tools found: ' + d.engines.map(x => x.id + '=' + (x.found ? (x.probe.ok ? 'ok ' + (x.probe.version || '') : 'not answering') : 'absent')).join(', '),
      'Chat engines: ' + e.engines.map(x => x.id + '=' + (x.health.ok ? 'ok' : (x.health.detail || 'down'))).join(', '), '', 'What happened:', val('rd-rnote') || '(describe it here)'].join('\n');
    again();
  }
  document.addEventListener('change', async e => {
    if (e.target && e.target.id === 'rd-bkfile' && e.target.files[0]) { const r = await fetch('/api/backup/restore', { method: 'POST', body: e.target.files[0] }); RD.err.bk = r.ok ? '' : 'That file is not a CaesarOS backup.'; await loadSet(); }
  });
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-rd]'); if (!t || t.hasAttribute('disabled')) return;
    const [k, v] = t.dataset.rd.split(/:(.*)/s);
    if (k === 'pwset') { const r = await w('/api/auth', 'PUT', { password: val('rd-pwnew'), current: val('rd-pwcur') }); if (r.ok) { RD.err.pw = ''; location.href = '/login'; } else { const j = await r.json().catch(() => ({})); RD.err.pw = j.error === 'short' ? 'The password needs at least 8 characters.' : j.error === 'wrong_current' ? 'The current password is wrong.' : 'It could not be saved.'; again(); } }
    else if (k === 'pwoff') { const r = await w('/api/auth', 'DELETE', { current: val('rd-pwcur') }); RD.err.pw = r.ok ? '' : 'The current password is wrong.'; await loadSet(); }
    else if (k === 'pwout') { await w('/api/logout', 'POST'); location.href = '/login'; }
    else if (k === 'bkrm') { RD.bsure = v; again(); }
    else if (k === 'bkrmgo') { await w('/api/backup/' + encodeURIComponent(v), 'DELETE'); RD.bsure = null; await loadSet(); }
    else if (k === 'bkcancel') { await w('/api/backup/restore', 'DELETE'); await loadSet(); }
    else if (k === 'rbuild') await buildReport();
    else if (k === 'rcopy') { try { await navigator.clipboard.writeText(val('rd-report') || RD.report); } catch {} }
    else if (k === 'rsave') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([val('rd-report') || RD.report], { type: 'text/plain' })); a.download = 'caesaros-report.txt'; a.click(); URL.revokeObjectURL(a.href); }
  });


  /* ---------- Board: its own module, web/atrium/board.js, on /api/board ---------- */


  /* ---------- Schedule (calendar): a month, a day, its events; every control is a button ---------- */
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  async function loadCal() {
    const c = RD.cal || (RD.cal = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: null, ev: null });
    const last = new Date(c.y, c.m + 1, 0).getDate();
    c.ev = await g('/api/calendar?from=' + iso(c.y, c.m, 1) + '&to=' + iso(c.y, c.m, last), []); W && (W.at = 0);
    if (!c.sel) { const t = new Date(); c.sel = (t.getFullYear() === c.y && t.getMonth() === c.m) ? iso(c.y, c.m, t.getDate()) : iso(c.y, c.m, 1); }
    again();
  }
  V.Schedule = () => {
    const c = RD.cal;
    if (!c || !c.ev) { void loadCal(); return `<div class="nx-view enter">${head('Schedule', 'Your days, kept on this device.', 'Fasti')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const first = (new Date(c.y, c.m, 1).getDay() + 6) % 7, days = new Date(c.y, c.m + 1, 0).getDate(), today = iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const count = {}; c.ev.forEach(e => { count[e.date] = (count[e.date] || 0) + 1; });
    let cells = ''; for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) { const k = iso(c.y, c.m, d); cells += `<button class="btn" data-rd="cday:${k}" aria-pressed="${k === c.sel}" aria-label="${d} ${MONTHS[c.m]}${count[k] ? ', ' + count[k] + ' events' : ''}" style="min-height:44px;${k === c.sel ? 'border-color:var(--accent);' : ''}${k === today ? 'text-decoration:underline;' : ''}">${d}${count[k] ? ' <span class="og-tag sig">' + count[k] + '</span>' : ''}</button>`; }
    const dayEv = c.ev.filter(e => e.date === c.sel);
    return `<div class="nx-view enter">${head('Schedule', 'Your days, kept on this device.', 'Fasti')}
    <div class="og-wrap"><div class="og-card"><div class="og-row">${btn('cprev', '←')}<h4 style="flex:1;text-align:center">${MONTHS[c.m]} ${c.y}</h4>${btn('cnext', '→')}${btn('ctoday', 'Today')}</div>
     <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:8px"><span class="og-tag mut">Mon</span><span class="og-tag mut">Tue</span><span class="og-tag mut">Wed</span><span class="og-tag mut">Thu</span><span class="og-tag mut">Fri</span><span class="og-tag mut">Sat</span><span class="og-tag mut">Sun</span>${cells}</div></div>
     ${sec(c.sel)}
     <div class="og-list">${dayEv.length ? dayEv.map(e => `<div>${I('calendar', 16)}<span>${e.time ? E(e.time) + ' · ' : ''}${E(e.title)}${e.note ? ' <small>' + E(e.note) + '</small>' : ''}</span><span class="og-row">${RD.cdel === e.id ? btn('cdelgo:' + E(e.id), 'Delete for good') : btn('cdel:' + E(e.id), 'Delete')}</span></div>`).join('') : '<div style="display:block"><span>Nothing planned for this day.</span></div>'}</div>
     <div class="og-card"><div class="og-row"><input class="og-input" id="rd-ctitle" placeholder="What happens" style="flex:1"><input class="og-input" id="rd-ctime" placeholder="09:30" maxlength="5" style="min-width:90px;max-width:110px">${btn('cadd', 'Add')}</div>${RD.err.cal ? `<p role="alert">${E(RD.err.cal)}</p>` : ''}</div></div></div>`;
  };


  /* ---------- Home widgets on real data: Calendar, Board and Memory (the prototype's demo bodies are replaced) ---------- */
  const W = { at: 0, busy: false, cal: [], board: [], notes: [] };
  let loadW = async function () {
    if (W.busy || Date.now() - W.at < 8000) return; W.busy = true;
    const t = new Date(), a = iso(t.getFullYear(), t.getMonth(), 1), z = iso(t.getFullYear(), t.getMonth(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate());
    [W.cal, W.board, W.notes] = await Promise.all([g('/api/calendar?from=' + a + '&to=' + z, []), g('/api/board', []), g('/api/notes', [])]);
    W.at = Date.now(); W.busy = false; again();
  };
  const refreshW = () => { W.at = 0; return loadW(); };
  if (typeof BODY === 'object') {
    BODY.calendar = () => {
      void loadW();
      const d = new Date(), y = d.getFullYear(), m = d.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate(), today = iso(y, m, d.getDate());
      const has = new Set(W.cal.map(e => e.date)); let cells = ''; for (let i = 0; i < first; i++) cells += '<span></span>';
      for (let i = 1; i <= dim; i++) { const k = iso(y, m, i); cells += `<button class="t-day ${k === today ? 'today' : ''}" data-open-app="Schedule" aria-label="${i}${has.has(k) ? ', has events' : ''}"><span class="n">${i}</span>${has.has(k) ? '<span class="t-ev">•</span>' : ''}</button>`; }
      const up = W.cal.filter(e => e.date >= today).slice(0, 4);
      return `<div class="t-body t-framed t-cal"><div class="t-tools"><span class="t-month">${MONTHS[m]} ${y}</span><div><button class="t-mini go" data-open-app="Schedule">Open schedule</button></div></div><div><div class="t-dow">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<span>${x}</span>`).join('')}</div><div class="t-days">${cells}</div></div>${up.length ? `<ul class="nx-list">${up.map(e => `<li><span class="nx-dot ok"></span><span>${E(e.date.slice(5))} ${e.time ? E(e.time) + ' · ' : ''}${E(e.title)}</span></li>`).join('')}</ul>` : '<ul class="nx-list"><li><span>Nothing planned this month.</span></li></ul>'}</div>`;
    };
    BODY.board = () => {
      void loadW();
      const n = s => W.board.filter(t => t.status === s).length, doing = W.board.filter(t => t.status === 'doing').slice(0, 4);
      return `<div class="t-body t-framed"><div class="t-tools"><span class="t-month">${n('todo')} todo · ${n('doing')} doing · ${n('done')} done</span><button class="t-mini" data-open-app="Board">Open board</button></div><form class="bn-quick" onsubmit="return false"><input class="bn-input" id="rd-wb" maxlength="200" placeholder="Add a task…"><button type="button" class="t-mini go" data-rd="wbadd" aria-label="Add">${I('send', 13)}</button></form>${doing.length ? `<ul class="nx-list">${doing.map(t => `<li><span class="nx-dot work"></span><span>${E(t.title)}</span></li>`).join('')}</ul>` : '<ul class="nx-list"><li><span>Nothing in progress.</span></li></ul>'}</div>`;
    };
    BODY.memory = () => {
      void loadW(); const q = (typeof S !== 'undefined' && S.noteQ || '').toLowerCase();
      const list = W.notes.filter(n => !q || n.id.toLowerCase().includes(q) || (n.snippet || '').toLowerCase().includes(q)).slice(0, 5);
      return `<div class="t-body t-framed"><div class="t-tools"><span class="t-month">${W.notes.length} ${W.notes.length === 1 ? 'note' : 'notes'}</span><button class="t-mini" data-open-app="Memory">Open notes</button></div><ul class="nx-list">${list.map(n => `<li><span class="nx-dot ok"></span><span>${E(n.id)}</span></li>`).join('') || '<li><span>No notes yet.</span></li>'}</ul></div>`;
    };
  }


  /* ---------- What now?: real things from this device (tasks in progress, today's events, tasks sent to you, a missing backup) ---------- */
  W.inbox = []; W.bk = []; W.use = [];
  const loadW0 = loadW;
  loadW = async function () {
    if (W.busy || Date.now() - W.at < 8000) return;
    const [inbox, bk, use] = await Promise.all([g('/api/handoff', []), g('/api/backup', []), g('/api/usage', [])]); W.inbox = inbox; W.bk = bk; W.use = use;
    await loadW0(); if (window.xRefreshFeed) { try { await window.xRefreshFeed(); } catch { /* keeps the old list */ } again(); }
  };
  window.xFeedExtra = () => {
    void loadW();
    const out = [], t = new Date(), today = iso(t.getFullYear(), t.getMonth(), t.getDate());
    W.inbox.slice(0, 3).forEach(h => out.push(['Task', h.kind === 'note' ? 'A note from ' + h.from : 'A task from ' + h.from, h.kind === 'note' ? h.name : h.text.slice(0, 80), 'Devices', 'Open']));
    W.cal.filter(e => e.date === today).slice(0, 3).forEach(e => out.push(['Today', (e.time ? e.time + ' · ' : '') + e.title, 'On your schedule', 'Schedule', 'Open']));
    W.board.filter(x => x.status === 'doing').slice(0, 3).forEach(x => out.push(['Board', 'In progress: ' + x.title, 'Move it to Done when it is finished', 'Board', 'Open']));
    if (W.at && (!W.bk[0] || Date.now() - W.bk[0].at > 7 * 86400000)) out.push(['Backup', 'You have no recent backup', 'A copy of your settings, chats and keys, kept on this computer', 'Settings', 'Open']);
    return out;
  };


  /* ---------- Usage: what this install did (answers per engine), on the Home widget and on its own page ---------- */
  const useRows = (rows) => { const max = Math.max(1, ...rows.map(u => u.week)); return rows.map(u => `<div class="r"><b style="color:var(--text)">${E(u.engine.replace('hermes:', ''))}</b><span>today ${u.today} · week ${u.week}${u.errors ? ' · ' + u.errors + ' failed' : ''}</span></div><div class="nx-meter"><i style="width:${Math.round(u.week / max * 100)}%"></i></div>`).join(''); };
  if (typeof BODY === 'object') BODY.usage = () => { void loadW(); return `<div class="t-body t-framed nx-bars">${W.use.length ? useRows(W.use.slice(0, 5)) : '<div class="r"><span>No answers yet.</span></div>'}<div class="r"><span>Counted from the chats on this device. Your providers show their own limits.</span></div></div>`; };
  const useViz = rows => { const max = Math.max(1, ...rows.map(u => u.week)), t = k => rows.reduce((n, u) => n + (u[k] || 0), 0), tn = ['a', 's', 'g', 'm'];
    return vzTiles([vzTile('Today', t('today'), 'answers', 'a'), vzTile('This week', t('week'), 'answers', 's'), vzTile('Failed', t('errors'), t('errors') ? 'look at the engine' : 'none', t('errors') ? 'd' : 'g'), vzTile('Engines', rows.length, 'used this week', 'm')]) + `<div class="og-sec">Per engine, this week</div>` + vzBars(rows.map((u, i) => [u.engine.replace('hermes:', ''), u.week / max * 100, u.week + ' · today ' + u.today + (u.errors ? ' · ' + u.errors + ' failed' : ''), u.errors ? 'd' : tn[i % 4]])); };
  V.Usage = () => {
    if (!RD.use) { void (async () => { RD.use = await g('/api/usage', []); again(); })(); return `<div class="nx-view enter">${head('Usage', 'What this install did.', 'Rationes')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    setTimeout(async () => { RD.use = null; }, 15000);
    return `<div class="nx-view enter">${head('Usage', 'Answers per engine, from the chats kept on this device.', 'Rationes')}<div class="og-wrap">${RD.use.length ? useViz(RD.use) : vzEmpty('No answers yet', 'Start a conversation and the counts appear here.')}<p class="og-note">This is what this install did. It says nothing about a provider's own limits; those are theirs to show.</p></div></div>`;
  };


  /* ---------- Marketplace: local skills and hash-bound quarantine/approval ---------- */
  async function loadMarketplace() {
    const [skills, data] = await Promise.all([g('/api/skills', []), g('/api/install-gate', { items: [] })]);
    RD.skills = skills; RD.marketItems = data.items || []; again();
  }
  const utf8Base64 = text => { const bytes = new TextEncoder().encode(text); let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); };
  V.Marketplace = () => {
    if (!RD.skills || !RD.marketItems) { void loadMarketplace(); return `<div class="nx-view enter">${head('Marketplace', 'Skills on this computer and reviewed packages.', 'Mercatus')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const q = (RD.skq || '').toLowerCase(), list = RD.skills.filter(s => !q || (s.name + ' ' + s.description + ' ' + s.category).toLowerCase().includes(q));
    const cats = [...new Set(list.map(s => s.category))], flagged = RD.skills.filter(s => s.flags.length).length;
    const targets = [['hermes', 'Hermes'], ['claude-code', 'Claude Code'], ['codex', 'Codex']];
    const items = RD.marketItems.map(item => {
      const existing = item.targets || [];
      const choices = targets.filter(([id]) => !existing.includes(id)).map(([id, label]) => `<label class="og-check" style="display:flex;align-items:center;gap:8px;min-height:44px"><input type="checkbox" data-agent-target="${E(id)}"> ${E(label)}</label>`).join('');
      const installedTargets = existing.length ? existing.map(id => E(targets.find(([key]) => key === id)?.[1] || id)).join(', ') : 'CaesarOS registry only';
      const action = item.scan.verdict === 'red'
        ? '<p role="alert">Blocked: red findings cannot be approved.</p>'
        : `${item.scan.verdict === 'yellow' ? '<p>Yellow findings require an extra confirmation.</p>' : ''}<div class="og-row" style="flex-wrap:wrap">${choices || '<span>No additional agent targets are available.</span>'}</div>${btn('mgapprove:' + E(item.id), item.status === 'installed' ? 'Add to selected agents' : 'Approve selected targets')}`;
      return `<div class="og-card"><div class="og-row"><h4>${E(item.name)} · ${E(item.version)}</h4><span class="og-tag ${item.scan.verdict === 'green' ? 'sig' : ''}">${E(item.scan.verdict)} · ${E(item.status)}</span></div><p>Declared source: ${E(item.source)} · Licence: ${E(item.license)}</p><p>Declared permissions: ${item.needs.map(E).join(', ') || 'none'} · Dependencies (not fetched): ${item.dependencies.map(d => E(d.name + '@' + d.version + ' (' + d.source + ')')).join(', ') || 'none declared'}</p><code style="overflow-wrap:anywhere">SHA-256 ${E(item.scan.sha256 || 'unavailable')}</code>${item.scan.findings.length ? `<div class="og-list">${item.scan.findings.map(f => `<div><span class="og-tag">${E(f.severity)}</span><span>${E(f.file)}:${f.line} · ${E(f.rule)}<small>${E(f.excerpt)}</small></span></div>`).join('')}</div>` : '<p>No scanner findings.</p>'}<p>Installed targets: ${installedTargets}</p>${action}${item.status === 'installed' ? btn('mgremove:' + E(item.id), 'Remove from CaesarOS and selected agents') : ''}</div>`;
    }).join('');
    return `<div class="nx-view enter">${head('Marketplace', 'Review a local skill package before it enters CaesarOS.', 'Mercatus')}
    <div class="og-wrap"><div class="og-card"><h4>Review a skill package</h4><p>Select a JSON package. CaesarOS does not download, extract or run it. The package stays in quarantine until you approve the exact scan hash.</p><details><summary>Package format</summary><pre>{"name":"Skill name","version":"1.0.0","source":"https://…","license":"MIT","needs":[],"dependencies":[],"files":[{"path":"SKILL.md","content":"# Skill\nInstructions…"}]}</pre></details><label class="btn" for="rd-skill-bundle">Choose skill JSON</label><input id="rd-skill-bundle" type="file" accept="application/json,.json" style="display:none">${RD.marketBusy ? '<p role="status">Scanning in quarantine…</p>' : ''}${RD.marketErr ? `<p role="alert">${E(RD.marketErr)}</p>` : ''}</div>
    ${RD.marketItems.length ? `${sec('Review and registry')}${items}` : ''}
    <div class="og-card"><div class="og-row"><input class="og-input" id="rd-skq" placeholder="Search skills already on this computer" value="${E(RD.skq || '')}" style="flex:1">${btn('skgo', 'Search')}</div><p>${RD.skills.length} skills found · ${flagged} with something worth a second look. Existing skills remain read only.</p></div>
    ${cats.map(c => `${sec(c)}<div class="og-list">${list.filter(s => s.category === c).map(s => `<div>${I('plugin', 16)}<span>${E(s.name)} <small>${E(s.description)}</small>${s.flags.length ? `<small style="display:block;color:var(--accent)">Look at: ${s.flags.map(E).join('; ')}</small>` : ''}</span><span class="og-tag ${s.flags.length ? '' : 'sig'}">${s.flags.length ? 'Review' : 'Clean'}</span></div>`).join('')}</div>`).join('') || '<div class="og-card"><p>No skills found on this computer yet.</p></div>'}
    </div></div>`;
  };


  /* ---------- Memory (Notes): plain markdown notes with tags, links and backlinks, autosaved with conflict protection ---------- */
  const NT = { list: null, tags: [], tag: null, q: '', open: null, text: '', status: 'saved', back: [], err: '', timer: null };
  async function loadNotes() {
    const url = NT.tag ? '/api/notes?tag=' + encodeURIComponent(NT.tag) : NT.q.trim().length >= 2 ? '/api/notes?q=' + encodeURIComponent(NT.q.trim()) : '/api/notes';
    NT.list = await g(url, []); NT.tags = await g('/api/notes/tags', []); again();
  }
  async function openNote(id) {
    if (!(await flushNote())) { NT.err = 'Your changes are not saved yet. Save them or resolve the conflict first.'; again(); return; }
    const n = await g('/api/notes/' + encodeURIComponent(id), null); if (!n) return;
    NT.open = n; NT.text = n.content; NT.status = 'saved'; NT.err = ''; NT.back = await g('/api/notes/' + encodeURIComponent(id) + '/backlinks', []); again();
  }
  /** True when nothing typed is at risk: it is saved, or there was nothing to save. A conflict or error keeps the buffer and returns false. */
  async function flushNote() {
    if (NT.timer) { clearTimeout(NT.timer); NT.timer = null; }
    if (!NT.open) return true;
    if (NT.status === 'conflict' || NT.status === 'error') return false;
    if (NT.status !== 'dirty') return true;
    NT.status = 'saving';
    const r = await w('/api/notes/' + encodeURIComponent(NT.open.id), 'PUT', { content: NT.text, rev: NT.open.rev });
    if (r.ok) { NT.open = await r.json(); NT.status = 'saved'; } else if (r.status === 409) { NT.status = 'conflict'; const j = await r.json().catch(() => ({})); NT.theirs = j.current || null; } else NT.status = 'error';
  }
  const MY_NOTES = !document.querySelector('script[src^="notes.js"]');
  const memoryPage = () => {
    if (!NT.list) { void loadNotes(); return `<div class="nx-view enter">${head('Memory', 'Your notes, plain Markdown files on this device.', 'Tabularium')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const stat = { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving…', conflict: 'Changed elsewhere', error: 'Could not save' }[NT.status];
    const list = NT.list.length ? NT.list.map(n => `<div>${I('memory', 16)}<span>${E(n.id)} <small>${E(n.snippet || '')}</small></span><span class="og-row">${btn('nopen:' + E(n.id), NT.open && NT.open.id === n.id ? 'Open ✓' : 'Open')}</span></div>`).join('') : '<div style="display:block"><span>No notes yet. Make the first one.</span></div>';
    const tags = NT.tags.length ? `<div class="og-row">${NT.tag ? btn('ntag:', 'All notes') : ''}${NT.tags.slice(0, 20).map(t => `<button class="btn" data-rd="ntag:${E(t.tag)}" aria-pressed="${NT.tag === t.tag}">#${E(t.tag)} ${t.count}</button>`).join('')}</div>` : '';
    const ed = NT.open ? `<div class="og-card"><div class="og-row"><h4>${E(NT.open.id)}</h4><span class="og-tag ${NT.status === 'saved' ? 'sig' : 'mut'}" role="status">${stat}</span></div>
      <textarea class="og-input" id="rd-note" rows="14" style="width:100%;box-sizing:border-box;text-transform:none">${E(NT.text)}</textarea>
      <div class="og-row">${btn('nsave', 'Save now')}${NT.delsure ? btn('ndelgo', 'Move to trash') : btn('ndel', 'Delete')}${btn('nclose', 'Close')}</div>
      ${NT.status === 'conflict' ? `<p role="alert">This note changed somewhere else. ${btn('ntheirs', 'Load their version')} ${btn('nmine', 'Keep mine')}</p>` : ''}
      ${NT.back.length ? `<div class="og-row"><span class="label">Linked from</span>${NT.back.map(b => btn('nopen:' + E(b), b)).join('')}</div>` : ''}${NT.err ? `<p role="alert">${E(NT.err)}</p>` : ''}</div>` : '<div class="og-card"><p>Pick a note on the left, or make a new one. Notes are plain Markdown files; use #tags and [[links]] and they connect.</p></div>';
    return `<div class="nx-view enter">${head('Memory', 'Your notes, plain Markdown files on this device. Use #tags and [[links]].', 'Tabularium')}
    <div class="og-wrap"><div class="og-card"><div class="og-row"><input class="og-input" id="rd-nq" placeholder="Search notes" value="${E(NT.q)}" style="flex:1">${btn('nsearch', 'Search')}${btn('nnew', 'New note')}</div>${tags}</div>
    <div class="og-grid" style="grid-template-columns:minmax(260px,1fr) minmax(320px,2fr);align-items:start"><div class="og-list" style="align-self:start">${list}</div><div>${ed}</div></div></div></div>`;
  };
  if (MY_NOTES) V.Memory = memoryPage;
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'rd-note' && NT.open) { NT.text = e.target.value; if (NT.status !== 'conflict') NT.status = 'dirty'; if (NT.timer) clearTimeout(NT.timer); NT.timer = setTimeout(async () => { NT.timer = null; await flushNote(); const s = document.querySelector('[role=status]'); if (s) s.textContent = { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving…', conflict: 'Changed elsewhere', error: 'Could not save' }[NT.status]; if (NT.status === 'conflict') again(); }, 1500);
      const s0 = document.querySelector('[role=status]'); if (s0) s0.textContent = 'Unsaved changes'; }
    if (e.target && e.target.id === 'rd-nq') NT.q = e.target.value;
  });


  /* ---------- Search: one box over notes, library, chats, tasks and events ---------- */
  const SK = { q: '', hits: null };
  const kindApp = { note: 'Memory', library: 'Library', chat: 'Chat', board: 'Board', calendar: 'Schedule' };
  const kindName = { note: 'Note', library: 'Library', chat: 'Chat', board: 'Board', calendar: 'Event' };
  V.Search = () => `<div class="nx-view enter">${head('Search', 'One search over your notes, library, chats, tasks and events.', 'Quaero')}
    <div class="og-wrap"><div class="og-card"><div class="og-row"><input class="og-input" id="rd-sq" placeholder="Search everything" value="${E(SK.q)}" style="flex:1">${btn('sgo', 'Search')}</div></div>
    ${SK.hits === null ? '<p class="og-note">Type at least two letters.</p>' : SK.hits.length ? `<div class="og-list">${SK.hits.map((h, i) => `<div>${I('search', 16)}<span>${E(h.title)} <small>${kindName[h.kind]} · ${E(h.text)}</small></span><span class="og-row">${btn('sopen:' + i, 'Open')}</span></div>`).join('')}</div>` : '<div class="og-card"><p>Nothing found.</p></div>'}</div></div>`;
  document.addEventListener('input', e => { if (e.target && e.target.id === 'rd-sq') SK.q = e.target.value; });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'rd-sq') { e.preventDefault(); document.querySelector('[data-rd=sgo]')?.click(); } });
  async function openHit(h) {
    if (h.kind === 'note') { NT.list = null; open_({ k: 'app', id: 'Memory' }); await loadNotes(); await openNote(h.ref); }
    else if (h.kind === 'calendar') { RD.cal = null; open_({ k: 'app', id: 'Schedule' }); }
    else open_({ k: 'app', id: kindApp[h.kind] });
    render();
  }
  /* the Find anything palette (Ctrl K) gets the same results under its own list of apps, threads and actions */
  if (typeof pr === 'function') {
    const prevPr = pr; let seq = 0;
    pr = function (q) {
      prevPr(q); const my = ++seq; if (String(q).trim().length < 2) return;
      g('/api/search?q=' + encodeURIComponent(q), []).then(hits => {
        if (my !== seq || !hits.length) return; const box = document.getElementById('nxres'); if (!box) return;
        const first = pi.length; pi.push(...hits.map(h => ({ l: h.title + ' — ' + h.text.slice(0, 60), k: kindName[h.kind].toUpperCase(), run: () => { void openHit(h); } })));
        if (!first) box.innerHTML = '';
        box.insertAdjacentHTML('beforeend', hits.map((h, i) => `<button class="it ${!first && i === 0 ? 'sel' : ''}" data-x="${first + i}">${E(h.title + ' — ' + h.text.slice(0, 60))}<span>${kindName[h.kind].toUpperCase()}</span></button>`).join(''));
        box.querySelectorAll('.it[data-x]').forEach(b => { b.onclick = () => { pi[b.dataset.x].run(); pal(false); }; });
      });
    };
  }
  async function runSearch() { SK.q = val('rd-sq') || SK.q; SK.hits = SK.q.trim().length >= 2 ? await g('/api/search?q=' + encodeURIComponent(SK.q), []) : null; again(); const i = document.getElementById('rd-sq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }


  /* ---------- Goals, Ideas and Reading: plain checkable lists on this device ---------- */
  const LS = {};
  const listPage = (key, name, sub, la, ph, extra) => {
    V[name] = () => {
      const st = LS[key] || (LS[key] = { items: null });
      if (!st.items) { void (async () => { st.items = await g('/api/lists/' + key, []); again(); })(); return `<div class="nx-view enter">${head(name, sub, la)}<div class="og-wrap">${loadingCard()}</div></div>`; }
      const open = st.items.filter(i => !i.done).length;
      return `<div class="nx-view enter">${head(name, sub, la)}<div class="og-wrap"><div class="og-card"><div class="og-row"><input class="og-input" id="rd-l-${key}" placeholder="${E(ph)}" style="flex:1" maxlength="300">${btn('ladd:' + key, 'Add')}</div></div>
      ${st.items.length ? vzBars([['Done', (st.items.length - open) / st.items.length * 100, (st.items.length - open) + ' of ' + st.items.length, 's']]) : ''}
      ${sec(open + ' open · ' + (st.items.length - open) + ' done')}
      <div class="og-list">${st.items.length ? st.items.map(i => `<div>${I(i.done ? 'check' : 'sparkle', 16)}<span style="${i.done ? 'text-decoration:line-through;opacity:.6' : ''}">${E(i.text)}</span><span class="og-row">${btn('ldone:' + key + '|' + i.id + '|' + (i.done ? '0' : '1'), i.done ? 'Reopen' : 'Done')}${extra ? btn('lboard:' + key + '|' + i.id, 'To Board') : ''}${st.sure === i.id ? btn('ldelgo:' + key + '|' + i.id, 'Delete for good') : btn('ldel:' + key + '|' + i.id, 'Delete')}</span></div>`).join('') : vzEmpty('Nothing here yet', 'Add the first one above.')}</div></div></div>`;
    };
  };
  listPage('goals', 'Goals', 'What you want done, checked off as you go.', 'Proposita', 'A goal', false);
  listPage('ideas', 'Ideas', 'Ideas kept until you decide. Send one to the Board when it is real.', 'Cogitata', 'An idea', true);
  listPage('reading', 'Reading', 'Things to read later.', 'Lectio', 'Something to read', false);


  /* ---------- Clipboard: a shelf of snippets you paste in yourself (nothing watches your clipboard) ---------- */
  V.Clipboard = () => {
    const st = LS.clipboard || (LS.clipboard = { items: null });
    if (!st.items) { void (async () => { st.items = await g('/api/lists/clipboard', []); again(); })(); return `<div class="nx-view enter">${head('Clipboard', 'Snippets you keep, one press away.', 'Fasces')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    return `<div class="nx-view enter">${head('Clipboard', 'Snippets you keep, one press away. Nothing watches your clipboard; you add what you want.', 'Fasces')}<div class="og-wrap"><div class="og-card"><textarea class="og-input" id="rd-clip" rows="3" placeholder="Paste or type a snippet" style="width:100%;box-sizing:border-box"></textarea><div class="og-row">${btn('clpaste', 'Paste from clipboard')}${btn('cladd', 'Keep it')}</div>${RD.err.clip ? `<p role="alert">${E(RD.err.clip)}</p>` : ''}</div>
    <div class="og-list">${st.items.length ? st.items.map(i => `<div>${I('folder', 16)}<span style="white-space:pre-wrap;word-break:break-word">${E(i.text)}</span><span class="og-row">${btn('clcopy:' + E(i.id), 'Copy')}${btn('cldel:' + E(i.id), 'Delete')}</span></div>`).join('') : '<div style="display:block"><span>Nothing kept yet.</span></div>'}</div></div></div>`;
  };

  /* ---------- Vault: notes encrypted in this browser (AES-GCM, key from your passphrase); the core stores ciphertext only ---------- */
  const VT = { items: null, key: null, open: null, text: '', err: '', pass: '' };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }, unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function keyFor(pass, salt) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
  async function seal(pass, text) { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const k = await keyFor(pass, salt); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text))); return { salt: b64(salt), iv: b64(iv), data: b64(ct) }; }
  async function unseal(pass, item) { const k = await keyFor(pass, unb64(item.salt)); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(item.iv) }, k, unb64(item.data))); }
  V.Vault = () => {
    if (!VT.items) { void (async () => { VT.items = await g('/api/vault', []); again(); })(); return `<div class="nx-view enter">${head('Vault', 'Notes only you can read.', 'Arca')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const ed = VT.open ? `<div class="og-card"><div class="og-row"><h4>${E(VT.open.name)}</h4><span class="og-tag sig">Unlocked</span></div><textarea class="og-input" id="rd-vtext" rows="10" style="width:100%;box-sizing:border-box">${E(VT.text)}</textarea><div class="og-row">${btn('vsave', 'Encrypt and save')}${btn('vclose', 'Lock')}${VT.sure ? btn('vdelgo', 'Delete for good') : btn('vdel', 'Delete')}</div></div>` : `<div class="og-card"><h4>New secret note</h4><div class="og-row"><input class="og-input" id="rd-vname" placeholder="Name" style="flex:1"></div><textarea class="og-input" id="rd-vnew" rows="5" placeholder="What to keep secret" style="width:100%;box-sizing:border-box"></textarea><div class="og-row"><input class="og-input" id="rd-vpass" type="password" placeholder="Passphrase" autocomplete="new-password" style="flex:1">${btn('vmake', 'Encrypt and save')}</div></div>`;
    return `<div class="nx-view enter">${head('Vault', 'Notes only you can read. They are encrypted in this browser; the passphrase never leaves it.', 'Arca')}<div class="og-wrap">${ed}${VT.err ? `<p role="alert">${E(VT.err)}</p>` : ''}
    ${sec('Locked notes')}<div class="og-list">${VT.items.length ? VT.items.map(i => `<div>${I('lock', 16)}<span>${E(i.name)} <small>${ago(i.updated)}</small></span><span class="og-row"><input class="og-input" id="rd-vp-${E(i.id)}" type="password" placeholder="Passphrase" autocomplete="off" style="min-width:140px">${btn('vopen:' + E(i.id), 'Unlock')}</span></div>`).join('') : '<div style="display:block"><span>No secret notes yet.</span></div>'}</div>
    <p class="og-note">If you forget the passphrase the note cannot be recovered. That is the point: a copy of this device's data holds nothing readable.</p></div></div>`;
  };


  /* ---------- Daily review: today on one page, from this device; one press saves it as a note ---------- */
  const DR = { d: null };
  async function loadDaily() {
    const t = new Date(), today = iso(t.getFullYear(), t.getMonth(), t.getDate()), start = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const [cal, board, notes, use, lists] = await Promise.all([g('/api/calendar?from=' + today + '&to=' + today, []), g('/api/board', []), g('/api/notes', []), g('/api/usage', []), g('/api/lists/goals', [])]);
    DR.d = { today, cal, board, notes: notes.filter(n => n.updatedAt >= start), use, goals: lists.filter(x => !x.done) };
    again();
  }
  const dailyMd = d => ['# Daily review ' + d.today, '', '## Today', ...(d.cal.length ? d.cal.map(e => '- ' + (e.time ? e.time + ' ' : '') + e.title) : ['- Nothing scheduled']), '', '## Board', ...['doing', 'todo', 'done'].map(s => '- ' + s + ': ' + (d.board.filter(x => x.status === s).map(x => x.title).join(', ') || 'none')), '', '## Notes touched today', ...(d.notes.length ? d.notes.map(n => '- [[' + n.id + ']]') : ['- none']), '', '## Open goals', ...(d.goals.length ? d.goals.map(x => '- ' + x.text) : ['- none']), '', '## Answers today', ...(d.use.length ? d.use.map(u => '- ' + u.engine + ': ' + u.today) : ['- none']), '', '## What I learned', '', ''].join('\n');
  V['Daily review'] = () => {
    if (!DR.d) { void loadDaily(); return `<div class="nx-view enter">${head('Daily review', 'Today on one page.', 'Dream')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const d = DR.d, card = (title, rows) => `<div class="og-card"><div class="og-row"><h4>${E(title)}</h4></div>${rows.length ? '<ul class="nx-list">' + rows.map(x => '<li><span>' + E(x) + '</span></li>').join('') + '</ul>' : '<p>Nothing.</p>'}</div>`;
    return `<div class="nx-view enter">${head('Daily review', 'Today on one page, read from this device. Save it as a note when the day is done.', 'Dream')}<div class="og-wrap">
      ${vzTiles([vzTile('On the schedule', d.cal.length, 'today', 'a'), vzTile('In progress', d.board.filter(x => x.status === 'doing').length, 'on the Board', 's'), vzTile('Done', d.board.filter(x => x.status === 'done').length, 'on the Board', 'g'), vzTile('Open goals', d.goals.length, '', 'm')])}
      ${vzStack([['To do', d.board.filter(x => x.status === 'todo').length, 'a'], ['Doing', d.board.filter(x => x.status === 'doing').length, 's'], ['Done', d.board.filter(x => x.status === 'done').length, 'g']])}
      <div class="og-grid">${card('On the schedule', d.cal.map(e => (e.time ? e.time + ' · ' : '') + e.title))}${card('In progress', d.board.filter(x => x.status === 'doing').map(x => x.title))}${card('Still to do', d.board.filter(x => x.status === 'todo').map(x => x.title))}${card('Done', d.board.filter(x => x.status === 'done').map(x => x.title))}${card('Notes touched today', d.notes.map(n => n.id))}${card('Open goals', d.goals.map(x => x.text))}${card('Answers today', d.use.map(u => u.engine + ': ' + u.today))}</div>
      <div class="og-row">${btn('drsave', 'Save as a note')}${btn('drrefresh', 'Refresh')}</div>${RD.err.dr ? `<p role="alert">${E(RD.err.dr)}</p>` : ''}${DR.saved ? `<p role="status">Saved as the note "${E(DR.saved)}".</p>` : ''}</div></div>`;
  };

  if (window.HUB_CAT) { Object.assign(window.HUB_CAT, { board: { t: 'Board', sub: 'tasks', img: 'hero-ember', w: 4, h: 3, open: 'Board' }, usage: { t: 'Usage', sub: 'answers', img: 'hero-throne-ember', w: 4, h: 2, open: 'Usage' } }); }


  /* ---------- Health, Cost, Updates: this machine, answers per engine, versions (no network involved) ---------- */
  const HL = { d: null };
  async function loadHealth() { const [hw, det, eng, ver, run] = await Promise.all([g('/api/hardware', { machine: {} }), g('/api/detect', { engines: [] }), g('/api/engines', { engines: [] }), g('/api/version', {}), g('/api/running', { count: 0 })]); HL.d = { hw, det, eng, ver, run }; again(); }
  V.Health = () => {
    if (!HL.d) { void loadHealth(); return `<div class="nx-view enter">${head('Health', 'The machine under CaesarOS.', 'Vitals')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const { hw, det, eng, ver, run } = HL.d, m = hw.machine || {};
    const tool = x => `<div>${I('system', 16)}<span>${E(x.label)} <small>${x.found ? (x.probe.ok ? 'answers · ' + E(x.probe.version || '') : 'installed, not answering' + (x.signIn ? ' · sign in with: ' + E(x.signIn) : '')) : 'not installed'}</small></span><span class="og-tag ${x.probe.ok ? 'sig' : 'mut'}">${x.probe.ok ? 'OK' : x.found ? 'Check' : 'Absent'}</span></div>`;
    const en = e => `<div>${I('engine', 16)}<span>${E(e.label)} <small>${e.health.ok ? (e.models.length + ' models') : E(e.health.detail || 'not answering')}</small></span><span class="og-tag ${e.health.ok ? 'sig' : 'mut'}">${e.health.ok ? 'Answering' : 'Down'}</span></div>`;
    return `<div class="nx-view enter">${head('Health', 'The machine under CaesarOS, read live. Nothing here leaves the computer.', 'Vitals')}<div class="og-wrap">
      ${vzTiles([vzTile('Memory', m.ramGb + ' GB', 'installed', 'a'), vzTile('Processor', m.cores + ' cores', '', 's'), vzTile('Free disk', m.freeDiskGb + ' GB', 'on this machine', 'g'), vzTile('Graphics', m.gpu || 'unknown', '', 'm'), vzTile('Running now', run.count, run.count === 1 ? 'turn' : 'turns', run.count ? 'a' : 's'), vzTile('CaesarOS', ver.version || '?', 'build ' + (ver.build || '?'), 'g')])}
      ${sec('Is everything answering')}${vzBars([['Chat engines', eng.engines.length ? eng.engines.filter(e => e.health.ok).length / eng.engines.length * 100 : 0, eng.engines.filter(e => e.health.ok).length + ' of ' + eng.engines.length, 's'], ['Tools found', det.engines.length ? det.engines.filter(x => x.probe.ok).length / det.engines.length * 100 : 0, det.engines.filter(x => x.probe.ok).length + ' of ' + det.engines.length, 'a']])}
      ${sec('Tools found on this machine')}<div class="og-list">${det.engines.map(tool).join('')}</div>
      ${sec('Chat engines')}<div class="og-list">${eng.engines.length ? eng.engines.map(en).join('') : '<div style="display:block"><span>No engine.</span></div>'}</div>
      <div class="og-row">${btn('hlrefresh', 'Refresh')}</div></div></div>`;
  };
  V.Cost = () => {
    if (!RD.use) { void (async () => { RD.use = await g('/api/usage', []); again(); })(); return `<div class="nx-view enter">${head('Cost', 'What this install used.', 'Rationes')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const total = RD.use.reduce((n, u) => n + u.week, 0);
    return `<div class="nx-view enter">${head('Cost', 'Answers this week, per engine. Money is not tracked here: your subscriptions and providers show their own bills.', 'Rationes')}<div class="og-wrap">${RD.use.length ? vzTiles([vzTile('Last 7 days', total, total === 1 ? 'answer' : 'answers', 'a'), vzTile('Today', RD.use.reduce((n, u) => n + u.today, 0), 'answers', 's'), vzTile('Local', RD.use.filter(u => !/claude|codex|gemini/i.test(u.engine)).reduce((n, u) => n + u.week, 0), 'electricity only', 'g')]) + vzStack(RD.use.map((u, i) => [u.engine.replace('hermes:', ''), u.week, ['a', 's', 'g', 'm'][i % 4]])) : vzEmpty('Nothing counted yet', 'Answers appear here as soon as you talk to an engine.')}<div class="og-card"><h4>${total} ${total === 1 ? 'answer' : 'answers'} in the last seven days</h4><p>Local models cost electricity only; tools like Claude Code and Codex draw on your own subscription. Open Usage for the per-engine bars.</p><div class="og-row">${btn('goUsage', 'Open Usage')}</div></div></div></div>`;
  };
  V.Updates = () => {
    if (!HL.d) { void loadHealth(); return `<div class="nx-view enter">${head('Updates', 'Versions on this machine.', 'Novitates')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const { det, ver } = HL.d;
    return `<div class="nx-view enter">${head('Updates', 'The versions on this machine. CaesarOS never checks for updates by itself and never installs one without you.', 'Novitates')}<div class="og-wrap">
      <div class="og-card"><div class="og-row"><h4>CaesarOS</h4><span class="og-tag sig">${E(ver.version || '?')}</span></div><p>Build ${E(ver.build || '?')}. Updating means getting a new build yourself; this page does not contact any server.</p></div>
      ${sec('Tools')}<div class="og-list">${det.engines.map(x => `<div>${I('plugin', 16)}<span>${E(x.label)} <small>${x.found ? E(x.probe.version || 'installed') : 'not installed'}</small></span></div>`).join('')}</div>
      <p class="og-note">Update each tool with its own command (for example your package manager); they keep their own sign-in.</p></div></div>`;
  };


  /* ---------- Notifications: what needs you, from the core's own events (approvals, tasks sent to you, failures, today's events) ---------- */
  const NF = { d: null };
  async function loadNotif() {
    const t = new Date(), today = iso(t.getFullYear(), t.getMonth(), t.getDate());
    const [ap, inbox, fail, cal, bk, board, rules] = await Promise.all([g('/api/approvals', { pending: [] }), g('/api/handoff', []), g('/api/failures', []), g('/api/calendar?from=' + today + '&to=' + today, []), g('/api/backup', []), g('/api/board', []), watchRules()]);
    NF.d = { ap: ap.pending || [], inbox, fail, cal: rules.today.on ? cal : [], bk, board, rules }; again();
  }
  V.Notifications = () => {
    if (!NF.d) { void loadNotif(); return `<div class="nx-view enter">${head('Notifications', 'What needs you.', 'Nuntii')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const d = NF.d, rows = [];
    d.ap.forEach(a => rows.push(['Approval', a.title, 'Waiting for your yes', 'Chat', 'Review']));
    d.inbox.forEach(h => rows.push([h.kind === 'note' ? 'Note' : 'Task', (h.kind === 'note' ? h.name : h.text.slice(0, 80)), 'From ' + h.from + ' · ' + ago(h.at), 'Devices', 'Open']));
    d.fail.forEach(f => rows.push(['Failed', f.engine + ': ' + f.error, ago(f.at), 'Usage', 'Open']));
    d.cal.forEach(e => rows.push(['Today', (e.time ? e.time + ' · ' : '') + e.title, 'On your schedule', 'Schedule', 'Open']));
    if (d.rules.backup.on && (!d.bk[0] || Date.now() - d.bk[0].at > d.rules.backup.days * 86400000)) rows.push(['Backup', 'No backup in the last ' + d.rules.backup.days + ' days', 'A copy of your settings, chats and keys', 'Settings', 'Open']);
    if (d.rules.stale.on) d.board.filter(x => x.status === 'doing' && Date.now() - x.updated > d.rules.stale.days * 86400000).forEach(x => rows.push(['Overdue', 'Still in progress: ' + x.title, 'No change for more than ' + d.rules.stale.days + ' days', 'Board', 'Open']));
    return `<div class="nx-view enter">${head('Notifications', 'What needs you, read from this device. Nothing is sent anywhere.', 'Nuntii')}<div class="og-wrap">
      <div class="og-list">${rows.length ? rows.map(r => `<div>${I('alert', 16)}<span>${E(r[1])} <small>${E(r[0])} · ${E(r[2])}</small></span><span class="og-row"><button class="btn" data-open-app="${E(r[3])}">${E(r[4])}</button></span></div>`).join('') : '<div style="display:block"><span>Nothing needs you right now.</span></div>'}</div>
      <div class="og-row">${btn('nfrefresh', 'Refresh')}</div></div></div>`;
  };


  /* ---------- Skills point at the real page; Integrations lists what is actually connected ---------- */
  const IG = { d: null };
  async function loadInteg() {
    const [det, ms, gw, pair, skills, set] = await Promise.all([g('/api/detect', { engines: [] }), g('/api/model-servers', []), g('/api/gateways', { gateways: [] }), g('/api/pairing', { devices: [] }), g('/api/skills', []), g('/api/settings', {})]);
    IG.d = { det, ms, gw: gw.gateways || [], pair: pair.devices || [], skills, set }; again();
  }
  V.Integrations = () => {
    if (!IG.d) { void loadInteg(); return `<div class="nx-view enter">${head('Integrations', 'What CaesarOS is connected to.', 'Connexio')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const d = IG.d, row = (ic, name, detail, tag, ok) => `<div>${I(ic, 16)}<span>${E(name)} <small>${E(detail)}</small></span><span class="og-tag ${ok ? 'sig' : 'mut'}">${E(tag)}</span></div>`;
    return `<div class="nx-view enter">${head('Integrations', 'Everything CaesarOS is actually connected to, and nothing it is not.', 'Connexio')}<div class="og-wrap">
      ${sec('Tools on this computer (your own sign-in)')}<div class="og-list">${d.det.engines.map(x => row('plugin', x.label, x.found ? (x.probe.ok ? x.probe.version || 'answers' : 'installed, not answering') : 'not installed', x.probe.ok ? 'Connected' : x.found ? 'Sign in' : 'Absent', x.probe.ok)).join('')}</div>
      ${sec('Model servers you added')}<div class="og-list">${d.ms.length ? d.ms.map(x => row('engine', x.name, x.url, 'Added', true)).join('') : '<div style="display:block"><span>None. Add one in the first-run steps or in Settings.</span></div>'}</div>
      ${sec('Gateways and paired devices')}<div class="og-list">${d.gw.map(x => row('globe', x.name, x.url, 'Gateway', true)).join('')}${d.pair.map(x => row('crew', x.name, x.role === 'i-joined' ? 'you joined it' : 'joined you', 'Paired', true)).join('') || (d.gw.length ? '' : '<div style="display:block"><span>None.</span></div>')}</div>
      ${sec('Skills')}<div class="og-list">${row('plugin', d.skills.length + ' skills found', 'Hermes skills on this computer, read only', 'Open Marketplace', d.skills.length > 0)}</div>
      <div class="og-card"><p>Mail, calendars, social accounts and other cloud services are not connected: each needs your account and your yes, and none is built into this version. Nothing here sends your data anywhere.</p><div class="og-row">${btn('goMarket', 'Open Marketplace')}${btn('goDevices', 'Open Devices')}</div></div></div></div>`;
  };


  /* ---------- Meetings: an agenda note per meeting, written as a normal note you can edit in Memory ---------- */
  const MT = { list: null, err: '', tr: { ready: null, busy: false, text: '', err: '', rec: null, recording: false } };
  async function loadMeetings() { MT.tr.ready = (await g('/api/transcribe/status', { ready: false })).ready; const all = await g('/api/notes', []); MT.list = all.filter(n => /^Meeting \d{4}-\d{2}-\d{2}/.test(n.id)); again(); }

  async function mtSend(blob) {
    const t = MT.tr; t.busy = true; t.err = ''; again();
    try { const r = await fetch('/api/transcribe', { method: 'POST', body: blob }); const j = await r.json().catch(() => ({})); if (r.ok) t.text = j.text || ''; else t.err = j.error === 'busy' ? 'Another transcription is running. Try again in a moment.' : j.error === 'bad_size' ? 'That file is too big (40 MB at most).' : 'The recording could not be transcribed.'; } catch { t.err = 'The recording could not be sent.'; }
    t.busy = false; again();
  }
  V.Meetings = () => {
    if (!MT.list) { void loadMeetings(); return `<div class="nx-view enter">${head('Meetings', 'Agenda and notes for each meeting.', 'Commentarii')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    return `<div class="nx-view enter">${head('Meetings', 'One note per meeting, with an agenda to fill in. You can also turn a recording into text on this computer; the audio never leaves it.', 'Commentarii')}<div class="og-wrap">
      <div class="og-card"><div class="og-row"><input class="og-input" id="rd-mtitle" placeholder="Meeting title" style="flex:1"><input class="og-input" id="rd-mdate" type="date" value="${new Date().toISOString().slice(0, 10)}" style="min-width:150px"></div><div class="og-row"><input class="og-input" id="rd-mwho" placeholder="Who is there (optional)" style="flex:1">${btn('mmake', 'Make the note')}</div>${MT.err ? `<p role="alert">${E(MT.err)}</p>` : ''}</div>
      ${sec('Transcribe a recording')}<div class="og-card">${MT.tr.ready ? `<div class="og-row"><input class="og-input" id="rd-maudio" type="file" accept="audio/*,video/*" style="flex:1">${btn('mtfile', MT.tr.busy ? 'Working…' : 'Transcribe file', MT.tr.busy ? 'disabled' : '')}${btn('mtrec', MT.tr.recording ? 'Stop recording' : 'Record', MT.tr.busy ? 'disabled' : '')}</div>` : '<p>Local transcription is not installed on this computer.</p>'}${MT.tr.err ? `<p role="alert">${E(MT.tr.err)}</p>` : ''}${MT.tr.text ? `<textarea class="og-input" id="rd-mtext" rows="8" style="width:100%">${E(MT.tr.text)}</textarea><div class="og-row">${btn('mtsave', 'Save as a note')}</div>` : ''}</div>
      ${sec('Your meeting notes')}<div class="og-list">${MT.list.length ? MT.list.map(n => `<div>${I('mic', 16)}<span>${E(n.id)} <small>${E(n.snippet || '')}</small></span><span class="og-row">${btn('mopen:' + E(n.id), 'Open')}</span></div>`).join('') : '<div style="display:block"><span>No meeting notes yet.</span></div>'}</div></div></div>`;
  };


  /* ---------- Watchers: three rules that raise a notification when something is overdue; each can be switched off or tuned ---------- */
  const RULES = [['stale', 'A task stays in progress too long', 'days', 3], ['backup', 'No backup for too long', 'days', 7], ['today', 'An event is on today', null, 0]];
  const WT = { rules: null, items: [] };
  async function loadWatch() {
    const items = await g('/api/lists/watchers', []); WT.items = items; const cfg = {};
    for (const i of items) { try { const j = JSON.parse(i.text); if (j && j.rule) cfg[j.rule] = { on: j.on !== false, days: Number(j.days) || 0, id: i.id }; } catch { /* a stray line is ignored */ } }
    WT.rules = Object.fromEntries(RULES.map(([k, , , d]) => [k, Object.assign({ on: true, days: d }, cfg[k] || {})])); again();
  }
  async function saveRule(k, patch) {
    const cur = WT.rules[k], next = Object.assign({}, cur, patch);
    if (cur.id) await w('/api/lists/item/' + encodeURIComponent(cur.id), 'DELETE');
    await w('/api/lists/watchers', 'POST', { text: JSON.stringify({ rule: k, on: next.on, days: next.days }) });
    WT.rules = null; await loadWatch(); NF.d = null; W.at = 0;
  }
  V.Watchers = () => {
    if (!WT.rules) { void loadWatch(); return `<div class="nx-view enter">${head('Watchers', 'Rules that tell you when something is overdue.', 'Vigiles')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    return `<div class="nx-view enter">${head('Watchers', 'Rules that raise a notification when something is overdue. They read this device only; nothing is watched elsewhere.', 'Vigiles')}<div class="og-wrap"><div class="og-list">${RULES.map(([k, label, unit]) => { const c = WT.rules[k]; return `<div>${I('search', 16)}<span>${E(label)}</span><span class="og-row">${unit ? `<input class="og-input" id="rd-w-${k}" type="number" min="1" max="365" value="${c.days}" style="min-width:80px;max-width:90px" aria-label="${E(label)}: days"><span class="label">days</span>${btn('wdays:' + k, 'Save')}` : ''}<span>${sw('wtog:' + k, c.on)} <span class="label">${c.on ? 'On' : 'Off'}</span></span></span></div>`; }).join('')}</div><p class="og-note">Where the alerts appear: Notifications and What now on Home.</p></div></div>`;
  };
  const watchRules = async () => { if (!WT.rules) { const items = await g('/api/lists/watchers', []); const cfg = {}; for (const i of items) { try { const j = JSON.parse(i.text); if (j && j.rule) cfg[j.rule] = { on: j.on !== false, days: Number(j.days) || 0 }; } catch { /* ignored */ } } return Object.fromEntries(RULES.map(([k, , , d]) => [k, Object.assign({ on: true, days: d }, cfg[k] || {})])); } return WT.rules; };


  /* ---------- Folders: names you give to library documents; a folder exists while a document is in it ---------- */
  const FD = { f: null, docs: [] };
  async function loadFolders() { FD.f = await g('/api/knowledge-folders', []); FD.docs = await g('/api/knowledge', []); again(); }
  V.Folders = () => {
    if (!FD.f) { void loadFolders(); return `<div class="nx-view enter">${head('Folders', 'Group your library documents.', 'Armarium')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const loose = FD.docs.filter(d => !d.folder).length;
    return `<div class="nx-view enter">${head('Folders', 'Names you give to library documents. Put a document in a folder from the Library; a folder exists while a document is in it.', 'Armarium')}<div class="og-wrap">
      <div class="og-list">${FD.f.length ? FD.f.map(f => `<div>${I('folder', 16)}<span>${E(f.folder)} <small>${f.count} ${f.count === 1 ? 'document' : 'documents'}</small></span><span class="og-row">${btn('fopen:' + E(f.folder), 'Open')}</span></div>`).join('') : '<div style="display:block"><span>No folders yet.</span></div>'}</div>
      <p class="og-note">${loose} ${loose === 1 ? 'document is' : 'documents are'} not in a folder. ${btn('fgoLib', 'Open Library')}</p></div></div>`;
  };


  /* ---------- Grill me: Caesar questions you, one question at a time, on a topic you give; the text lands in the composer and you press Send ---------- */
  const GR = { err: '' };
  V['Grill me'] = () => `<div class="nx-view enter">${head('Grill me', 'Caesar questions you on a topic, one question at a time, and tells you where your answers are thin.', 'Quaestio')}<div class="og-wrap">
    <div class="og-card"><div class="og-row"><input class="og-input" id="rd-gtopic" placeholder="A topic, a plan or a decision" value="${E(GR.topic || '')}" style="flex:1" maxlength="200"></div>
     <div class="og-row"><span class="label">Style</span>${['Friendly', 'Strict', "Devil's advocate"].map((s, i) => `<button class="btn" data-rd="gstyle:${i}" aria-pressed="${(GR.style || 0) === i}">${E(s)}</button>`).join('')}</div>
     <div class="og-row">${btn('ggo', 'Start')}</div>${GR.err ? `<p role="alert">${E(GR.err)}</p>` : ''}<p>It opens a conversation with Caesar and puts the request in the message box. Nothing is sent until you press Send.</p></div></div></div>`;
  document.addEventListener('input', e => { if (e.target && e.target.id === 'rd-gtopic') GR.topic = e.target.value; });
  const GSTYLE = ['Be friendly and encouraging.', 'Be strict and precise.', 'Argue the opposite side and look for holes.'];


  /* ---------- Missions: a goal with steps and a progress bar; each mission is one list item holding its steps as JSON ---------- */
  const MS = { items: null, open: null };
  const parseM = it => { try { const j = JSON.parse(it.text); if (j && typeof j.title === 'string' && Array.isArray(j.steps)) return { id: it.id, title: j.title, steps: j.steps.filter(s => s && typeof s.t === 'string').map(s => ({ t: s.t, done: !!s.done })) }; } catch { /* a stray line is ignored */ } return null; };
  async function loadMissions() { MS.items = (await g('/api/lists/missions', [])).map(parseM).filter(Boolean); again(); }
  async function saveMission(m) { if (m.id) await w('/api/lists/item/' + encodeURIComponent(m.id), 'DELETE'); const r = await w('/api/lists/missions', 'POST', { text: JSON.stringify({ title: m.title, steps: m.steps }) }); const j = await r.json().catch(() => ({})); MS.open = j.id || null; await loadMissions(); }
  V.Missions = () => {
    if (!MS.items) { void loadMissions(); return `<div class="nx-view enter">${head('Missions', 'Bigger goals, broken into steps.', 'Expeditiones')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const pct = m => m.steps.length ? Math.round(m.steps.filter(s => s.done).length / m.steps.length * 100) : 0;
    const open = MS.items.find(m => m.id === MS.open);
    const detail = open ? `<div class="og-card"><div class="og-row"><h4>${E(open.title)}</h4><span class="og-tag ${pct(open) === 100 ? 'sig' : 'mut'}">${pct(open)}%</span></div>${vzSeg(pct(open), pct(open) === 100 ? 's' : 'a', 30)}
      <div class="og-list">${open.steps.length ? open.steps.map((s, i) => `<div>${I(s.done ? 'check' : 'sparkle', 16)}<span style="${s.done ? 'text-decoration:line-through;opacity:.6' : ''}">${E(s.t)}</span><span class="og-row">${btn('mstep:' + i, s.done ? 'Reopen' : 'Done')}${btn('mstepdel:' + i, 'Remove')}</span></div>`).join('') : '<div style="display:block"><span>No steps yet. Add the first one.</span></div>'}</div>
      <div class="og-row"><input class="og-input" id="rd-mstep" placeholder="A step" style="flex:1" maxlength="200">${btn('mstepadd', 'Add step')}</div>
      <div class="og-row">${btn('mclose', 'Back')}${MS.sure ? btn('mdelgo', 'Delete for good') : btn('mdel', 'Delete mission')}</div></div>` : '';
    return `<div class="nx-view enter">${head('Missions', 'Bigger goals, broken into steps with a progress bar. They stay on this device.', 'Expeditiones')}<div class="og-wrap">
      ${detail || `<div class="og-card"><div class="og-row"><input class="og-input" id="rd-mtitle2" placeholder="A new mission" style="flex:1" maxlength="120">${btn('mmk', 'Start the mission')}</div></div>
      <div class="og-list">${MS.items.length ? MS.items.map(m => `<div>${I('missions', 16)}<span>${E(m.title)} <small>${m.steps.filter(s => s.done).length} of ${m.steps.length} steps · ${pct(m)}%</small>${vzSeg(pct(m), pct(m) === 100 ? 's' : 'a', 20)}</span><span class="og-row">${btn('mopen2:' + E(m.id), 'Open')}</span></div>`).join('') : vzEmpty('No missions yet', 'Name a bigger goal above and break it into steps.')}</div>`}</div></div>`;
  };


  /* ---------- Command: your own prompts, one press away; "Use in chat" opens Caesar with the text in the box (you press Send) ---------- */
  const PR = { items: null, err: '' };
  const parseP = it => { try { const j = JSON.parse(it.text); if (j && typeof j.title === 'string' && typeof j.body === 'string') return { id: it.id, title: j.title, body: j.body }; } catch { /* ignored */ } return null; };
  async function loadPrompts() { PR.items = (await g('/api/lists/prompts', [])).map(parseP).filter(Boolean); again(); }
  /* the prompts are the Command page's third tab (lair.js draws the page); this is their body */
  window.xPromptsBody = () => {
    if (!PR.items) { void loadPrompts(); return loadingCard(); }
    return `<div class="og-wrap">
      <div class="og-card"><div class="og-row"><input class="og-input" id="rd-ptitle" placeholder="A name for it" style="flex:1" maxlength="80"></div><textarea class="og-input" id="rd-pbody" rows="4" placeholder="The prompt" style="width:100%;box-sizing:border-box" maxlength="3000"></textarea><div class="og-row">${btn('padd', 'Keep it')}</div>${PR.err ? `<p role="alert">${E(PR.err)}</p>` : ''}</div>
      <div class="og-list">${PR.items.length ? PR.items.map(p => `<div>${I('command', 16)}<span>${E(p.title)} <small>${E(p.body.slice(0, 100))}</small></span><span class="og-row">${btn('puse:' + E(p.id), 'Use in chat')}${PR.sure === p.id ? btn('pdelgo:' + E(p.id), 'Delete for good') : btn('pdel:' + E(p.id), 'Delete')}</span></div>`).join('') : vzEmpty('No prompts yet', 'Keep the prompts you reuse; one press opens them in a chat.')}</div></div>`;
  };


  /* ---------- Tool graph: which tools the engines called in your conversations, how often, how long, how many failed ---------- */
  const TG = { d: null };
  V['Tool graph'] = () => {
    if (!TG.d) { void (async () => { TG.d = await g('/api/toolstats', []); setTimeout(() => { TG.d = null; }, 20000); again(); })(); return `<div class="nx-view enter">${head('Tool graph', 'What the tools did.', 'Instrumenta')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const max = Math.max(1, ...TG.d.map(t => t.calls)), total = TG.d.reduce((n, t) => n + t.calls, 0), bad = TG.d.reduce((n, t) => n + t.errors, 0);
    return `<div class="nx-view enter">${head('Tool graph', 'Tool calls recorded in your conversations over the last 30 days, grouped by tool. Counted from this device.', 'Instrumenta')}<div class="og-wrap">
      ${vzTiles([vzTile('Calls', total, '30 days', 'a'), vzTile('Failed', bad, bad ? 'check the tool' : 'none', bad ? 'd' : 's'), vzTile('Tools', TG.d.length, 'used', 'g')])}
      ${TG.d.length ? vzBars(TG.d.map((t, i) => [t.name, t.calls / max * 100, t.calls + (t.errors ? ' · ' + t.errors + ' failed' : '') + (t.avgMs != null ? ' · avg ' + (t.avgMs < 1000 ? t.avgMs + ' ms' : (t.avgMs / 1000).toFixed(1) + ' s') : ''), t.errors ? 'd' : ['a', 's', 'g'][i % 3]])) : `<div class="og-card"><p>No tool calls recorded. In this version no engine reports them yet: Caesar and the crew answer in one shot, and Claude Code and Codex run with their own tools switched off inside chat. This page fills as soon as an engine reports tool calls.</p></div>`}</div></div>`;
  };


  /* ---------- Orchestration (plan 7.11): one honest state per crew member, and what waits for you ---------- */
  const STATE = { 'needs-you': ['Needs you', 'needs'], running: ['Running', 'work'], failed: ['Failed', 'bad'], done: ['Done', 'ok'], idle: ['Idle', ''] };
  const took = ms => ms == null ? '' : ms < 60000 ? Math.max(1, Math.round(ms / 1000)) + ' s' : ms < 3600000 ? Math.round(ms / 60000) + ' min' : Math.round(ms / 3600000) + ' h';
  const chip = st => { const [word, cls] = STATE[st] || STATE.idle; return `<span class="nx-st ${cls}">${word}</span>`; };
  const stateOf = (orch, id) => ((orch && orch.members || []).find(m => m.id === id) || {}).state || '';
  const needsRow = m => `<button class="nx-need" data-rd="orchgo:${E(m.sessionId || '')}"><i></i><span><b>${E(m.name)}</b> <span data-no-i18n>${E(m.doing) || 'waits for your answer'}</span></span><em>${took(m.ms)}</em></button>`;
  const needsStrip = d => {
    const waiting = d.members.filter(m => m.state === 'needs-you'), running = d.members.filter(m => m.state === 'running').length;
    if (!d.needsYou) return `<div class="nx-needs quiet"><span class="label">NEEDS YOU</span><span>Nothing needs you.${running ? ' ' + running + ' working.' : ''}</span></div>`;
    return `<div class="nx-needs"><div class="nx-needs-head"><span class="label">NEEDS YOU</span><b>${d.needsYou}</b></div>${waiting.map(needsRow).join('')}</div>`;
  };

  /* ---------- Horde desk: who is working right now, what they did lately, and one button to stop everything ---------- */
  const HD = { d: null, t: null };
  async function loadHorde() { const [crew, run, tools, orch] = await Promise.all([g('/api/crew', []), g('/api/running', { count: 0 }), g('/api/recent-tools', []), g('/api/orchestration', null)]); HD.d = { crew, run: run.count }; HD.tools = tools; HD.orch = orch; HD.t = setTimeout(() => { HD.d = null; again(); }, 6000); again(); }
  V['Horde desk'] = () => {
    if (!HD.d) { void loadHorde(); return `<div class="nx-view enter">${head('Horde desk', 'The crew at a glance.', 'Castra')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const { crew, run } = HD.d, working = crew.filter(c => c.status === 'work');
    return `<div class="nx-view enter">${head('Horde desk', 'Who is working right now, what they did lately, and a stop button. Refreshes by itself every few seconds.', 'Castra')}<div class="og-wrap">
      ${HD.orch ? needsStrip(HD.orch) : ''}
      ${window.xLimitsHtml ? window.xLimitsHtml() : ''}
      ${vzTiles([vzTile('Working', working.length, 'of ' + crew.length + ' in the crew', 'a'), vzTile('Turns running', run, run ? 'right now' : 'all quiet', 's'), vzTile('Needs you', HD.orch ? HD.orch.needsYou : 0, 'waiting for your answer', HD.orch && HD.orch.needsYou ? 'g' : 's')])}
      ${vzBars(crew.map(c => [c.name, c.status === 'work' ? 100 : 0, c.status === 'work' ? 'working' : 'idle', c.status === 'work' ? 'a' : 's']))}
      <div class="og-card"><div class="og-row"><h4>${working.length} of ${crew.length} working · ${run} ${run === 1 ? 'turn' : 'turns'} running</h4>${btn('hdstop', 'Stop everything', run ? '' : 'disabled')}</div>${HD.msg ? `<p role="status">${E(HD.msg)}</p>` : ''}</div>
      ${sec('The crew')}<div class="og-list">${crew.map(c => `<div>${I('crew', 16)}<span>${E(c.name)} <small>${E(c.role)}${c.status === 'work' && c.doing ? ' · <span data-no-i18n>' + E(c.doing) + '</span>' : ''}</small></span>${stateOf(HD.orch, c.id) ? chip(stateOf(HD.orch, c.id)) : `<span class="og-tag ${c.status === 'work' ? 'sig' : 'mut'}">${c.status === 'work' ? 'Working' : 'Idle'}</span>`}</div>`).join('')}</div>
      ${sec('Latest tool calls')}<div class="og-list">${(HD.tools || []).length ? HD.tools.map(t => `<div>${I('system', 16)}<span>${E(t.name)} <small>${E(t.engine.replace('hermes:', '').replace('!alone', ' (alone)'))} · ${ago(t.at)}${t.ms != null ? ' · ' + (t.ms < 1000 ? t.ms + ' ms' : (t.ms / 1000).toFixed(1) + ' s') : ''}</small></span><span class="og-tag ${t.status === 'error' ? '' : 'sig'}">${t.status === 'error' ? 'Failed' : 'OK'}</span></div>`).join('') : '<div style="display:block"><span>No tool calls in the last day.</span></div>'}</div></div></div>`;
  };


  /* ---------- Evidence, Leads, Offer Boards: small record lists on this device (each record is one list item holding JSON) ---------- */
  const REC = {};
  const recPage = (key, name, sub, la, fields, stages, summary) => {
    const st = REC[key] = { items: null, err: '', sure: null };
    const parse = it => { try { const j = JSON.parse(it.text); return j && typeof j === 'object' ? Object.assign({ _id: it.id, _at: it.created }, j) : null; } catch { return null; } };
    const load = async () => { st.items = (await g('/api/lists/' + key, [])).map(parse).filter(Boolean); again(); };
    st.load = load; st.fields = fields; st.stages = stages;
    V[name] = () => {
      if (!st.items) { void load(); return `<div class="nx-view enter">${head(name, sub, la)}<div class="og-wrap">${loadingCard()}</div></div>`; }
      const TN = ['s', 'a', 'g', 'm', 'a', 'g'], cnt = stages ? stages.map((s, i) => [s, st.items.filter(x => x._stage === s).length, TN[i % TN.length]]) : [], un = stages ? st.items.filter(x => !stages.includes(x._stage)).length : 0;
      const viz = summary ? summary(st.items) : stages ? vzStack(un ? [...cnt, ['Not sorted', un, 'd']] : cnt) : '';
      return `<div class="nx-view enter">${head(name, sub, la)}<div class="og-wrap">${viz}<div class="og-card">${fields.map(f => `<div class="og-row"><input class="og-input" id="rd-${key}-${f[0]}" placeholder="${E(f[1])}" style="flex:1" maxlength="${f[2] || 300}"></div>`).join('')}<div class="og-row">${btn('radd:' + key, 'Add')}</div>${st.err ? `<p role="alert">${E(st.err)}</p>` : ''}</div>
      <div class="og-list">${st.items.length ? st.items.map(x => `<div>${I('folder', 16)}<span>${E(x[fields[0][0]] || '')} <small>${fields.slice(1).map(f => x[f[0]] ? E(f[1]) + ': ' + E(x[f[0]]) : '').filter(Boolean).join(' · ')}${x._stage ? ' · ' + E(x._stage) : ''} · ${ago(x._at)}</small></span><span class="og-row">${stages ? stages.map(s => `<button class="btn" data-rd="rstage:${key}|${E(x._id)}|${E(s)}" aria-pressed="${x._stage === s}">${E(s)}</button>`).join('') : ''}${st.sure === x._id ? btn('rdelgo:' + key + '|' + E(x._id), 'Delete for good') : btn('rdel:' + key + '|' + E(x._id), 'Delete')}</span></div>`).join('') : vzEmpty('Nothing here yet', 'Add the first one above.')}</div></div></div>`;
    };
  };
  recPage('evidence', 'Evidence', 'A log of proof that things were done: what, and where to find it.', 'Acta', [['what', 'What was done'], ['where', 'Where the proof is (a note, a link, a file)']]);
  recPage('leads', 'Leads', 'People and companies you may work with, and where each stands.', 'Venatio', [['name', 'Name or company'], ['contact', 'How to reach them'], ['note', 'A note']], ['New', 'Contacted', 'Talking', 'Won', 'Lost']);
  recPage('builds', 'Builds', 'A log of builds: what was built, which version, and how it went.', 'Forge', [['what', 'What was built'], ['version', 'Version or commit'], ['note', 'A note']], ['Planned', 'Building', 'Passed', 'Failed']);
  const num = s => { const n = Number(String(s || '').replace(',', '.').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
  recPage('business', 'Business', 'A plain ledger of money in and out. Amounts are yours to read; nothing is connected to a bank.', 'Negotium', [['what', 'What it was for'], ['amount', 'Amount (a number)'], ['note', 'A note']], ['Income', 'Expense'], items => { const inc = items.filter(x => x._stage === 'Income').reduce((n, x) => n + num(x.amount), 0), exp = items.filter(x => x._stage === 'Expense').reduce((n, x) => n + num(x.amount), 0); return vzTiles([vzTile('Income', inc.toFixed(2), 'recorded', 's'), vzTile('Expense', exp.toFixed(2), 'recorded', 'm'), vzTile('Balance', (inc - exp).toFixed(2), inc >= exp ? 'in the black' : 'in the red', inc >= exp ? 'g' : 'd')]) + vzStack([['Income', Math.round(inc), 's'], ['Expense', Math.round(exp), 'm']]); });
  recPage('designs', 'Web tools', 'Design systems and site notes as plain text the agents read: tokens, rules, motion, one entry per system.', 'Officina', [['name', 'Name (e.g. Canon, Neutral)', 120], ['rules', 'The rules in plain text (colours, type, corners, motion)', 2000], ['note', 'Where it is used']], ['Draft', 'In use', 'Retired']);


  /* ---------- Mirror: what each crew profile keeps for itself (sizes and counts only; the text of a memory is never read out) ---------- */
  const MR = { d: null };
  V.Mirror = () => {
    if (!MR.d) { void (async () => { [MR.d, MR.k, MR.c] = await Promise.all([g('/api/mirror', []), g('/api/mirror/kanban', []), g('/api/mirror/curator', { enabled: false, lines: [] })]); setTimeout(() => { MR.d = null; }, 30000); again(); })(); return `<div class="nx-view enter">${head('Mirror', 'What each crew member keeps for itself.', 'Speculum')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const kb = n => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB', skills = MR.d.reduce((n, x) => n + x.skills, 0);
    return `<div class="nx-view enter">${head('Mirror', 'What each crew profile keeps for itself, read only. You see sizes, ages and counts, never the text of a memory.', 'Speculum')}<div class="og-wrap">
      <div class="og-grid"><div class="og-card"><h4>Profiles</h4><p>${MR.d.length}</p></div><div class="og-card"><h4>Skills carried</h4><p>${skills}</p></div><div class="og-card"><h4>Memory kept</h4><p>${kb(MR.d.reduce((n, x) => n + x.memoryBytes, 0))}</p></div></div>
      ${sec('Per profile')}<div class="og-list">${MR.d.length ? MR.d.map(x => `<div>${I('memory', 16)}<span>${E(x.name)} <small>memory ${kb(x.memoryBytes)}${x.memoryAt ? ' · changed ' + ago(x.memoryAt) : ''} · about you ${kb(x.userBytes)} · ${x.skills} skills</small></span></div>`).join('') : '<div style="display:block"><span>No Hermes profiles found on this computer.</span></div>'}</div>
      ${sec('Curator (skill upkeep)')}<div class="og-list">${MR.c.lines.length ? MR.c.lines.slice(0, 10).map(l => `<div style="display:block"><span>${E(l)}</span></div>`).join('') : '<div style="display:block"><span>The curator reports nothing on this computer.</span></div>'}</div>
      ${sec('Kanban (crew task board)')}<div class="og-list">${MR.k.length ? MR.k.map(t => `<div>${I('board', 16)}<span>${E(t.title)} <small>${t.assignee ? E(t.assignee) + ' · ' : ''}${t.at ? ago(t.at * (t.at < 1e12 ? 1000 : 1)) : ''}</small></span><span class="og-tag ${t.status === 'done' ? 'sig' : 'mut'}">${E(t.status)}</span></div>`).join('') : '<div style="display:block"><span>The board is empty.</span></div>'}</div></div></div>`;
  };


  /* ---------- Weather: a city you type; only the name goes out, only when you press Look up ---------- */
  const WX = { w: null, err: '', busy: false };
  const wxCity = () => { try { return localStorage.getItem('caesaros.wxcity') || ''; } catch { return ''; } };
  V.Weather = () => `<div class="nx-view enter">${head('Weather', 'The forecast for a city you type. Only the city name is sent, to the public Open-Meteo service, when you press Look up. Nothing is stored there.', 'Auguria')}<div class="og-wrap">
    <div class="og-card"><div class="og-row"><input class="og-input" id="rd-wx-city" placeholder="City" value="${E(wxCity())}" maxlength="80" style="flex:1">${btn('wxgo', WX.busy ? 'Looking…' : 'Look up', WX.busy ? 'disabled' : '')}</div>${WX.err ? `<p role="alert">${E(WX.err)}</p>` : ''}</div>
    ${WX.w ? `${vzTiles([vzTile(WX.w.place, WX.w.now.temp + '°C', WX.w.now.sky, 'a'), vzTile('Wind', WX.w.now.wind + ' km/h', '', 's'), vzTile('Today', WX.w.days[0].min + '° / ' + WX.w.days[0].max + '°', WX.w.days[0].sky, 'g')])}${sec('The week, one bar per day')}${vzRange(WX.w.days.map(d => [d.date, d.min, d.max, d.min + '° / ' + d.max + '° · ' + d.sky]))}` : vzEmpty('No forecast yet', 'Type a city and press Look up.')}</div></div>`;


  /* ---------- News: feeds you add; fetched only when you press Refresh, public hosts only (the core refuses the rest) ---------- */
  const NW = { feeds: null, items: {}, err: '', busy: false };
  async function nwLoad() { NW.feeds = await g('/api/lists/feeds', []); again(); }
  V.News = () => {
    if (!NW.feeds) { void nwLoad(); return `<div class="nx-view enter">${head('News', 'Your own feeds.', 'Acta diurna')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    return `<div class="nx-view enter">${head('News', 'Headlines from RSS or Atom feeds you add. They are fetched only when you press Refresh, and only from public addresses.', 'Acta diurna')}<div class="og-wrap">
      <div class="og-card"><div class="og-row"><input class="og-input" id="rd-nw-url" placeholder="https://example.org/feed.xml" style="flex:1" maxlength="400">${btn('nwadd', 'Add feed')}${btn('nwgo', NW.busy ? 'Loading…' : 'Refresh', NW.busy || !NW.feeds.length ? 'disabled' : '')}</div>${NW.err ? `<p role="alert">${E(NW.err)}</p>` : ''}</div>
      ${NW.feeds.length ? NW.feeds.map(f => `${sec(f.text.replace(/^https?:\/\//, '').slice(0, 60))}<div class="og-list">${NW.items[f.id] === undefined ? '<div style="display:block"><span>Press Refresh to load.</span></div>' : NW.items[f.id] === null ? '<div style="display:block"><span>This feed could not be loaded (or its address is not public).</span></div>' : NW.items[f.id].map(i => `<div>${I('news', 16)}<span>${i.link ? `<a href="${E(i.link)}" target="_blank" rel="noopener noreferrer">${E(i.title)}</a>` : E(i.title)} <small>${E(i.at)}</small></span></div>`).join('') || '<div style="display:block"><span>No items.</span></div>'}</div><div class="og-row">${btn('nwdel:' + f.id, 'Remove feed')}</div>`).join('') : '<div class="og-list"><div style="display:block"><span>No feeds yet. Add an RSS or Atom address above.</span></div></div>'}</div></div>`;
  };


  /* ---------- Image Studio: a local engine draws it; one picture at a time; pictures are kept on this computer ---------- */
  const IM = { d: null, size: 512, err: '', t: null, sure: null, prompt: '' };
  async function imLoad() { IM.d = await g('/api/image', { ready: false, job: null, pics: [] }); clearTimeout(IM.t); if (IM.d.job && IM.d.job.status === 'running') IM.t = setTimeout(() => { void imLoad(); }, 3000); again(); }
  V['Image Studio'] = () => {
    if (!IM.d) { void imLoad(); return `<div class="nx-view enter">${head('Image Studio', 'Describe a picture.', 'Pictorium')}<div class="og-wrap">${loadingCard()}</div></div>`; }
    const d = IM.d, run = d.job && d.job.status === 'running';
    return `<div class="nx-view enter">${head('Image Studio', 'Describe a picture, pick a size, and a local engine draws it on this computer. One picture at a time; the first one can take a minute or two.', 'Pictorium')}<div class="og-wrap">
      ${d.ready ? `<div class="og-card"><div class="og-row"><input class="og-input" id="rd-impr" placeholder="Describe the picture…" maxlength="400" value="${E(IM.prompt)}" style="flex:1"></div><div class="og-row">${[256, 384, 512].map(s => `<button class="btn" data-rd="imsize:${s}" aria-pressed="${IM.size === s}">${s} px</button>`).join('')}${btn('imgo', run ? 'Drawing…' : 'Make it', run ? 'disabled' : '')}</div>${IM.err ? `<p role="alert">${E(IM.err)}</p>` : ''}${run ? `<p role="status">Drawing "${E(d.job.prompt)}"… this page updates by itself.</p>` : ''}${d.job && d.job.status === 'error' ? '<p role="alert">The last picture could not be made.</p>' : ''}</div>` : '<div class="og-card"><p>Local image generation is not installed on this computer.</p></div>'}
      ${sec('Your pictures')}${d.pics.length ? `<div class="og-grid">${d.pics.map(p => `<div class="og-card"><img src="/api/image/${E(p.id)}/file" alt="${E(p.prompt)}" style="width:100%;height:auto;display:block"><p><small>${E(p.prompt)} · ${p.size} px · ${ago(p.at)}</small></p><div class="og-row">${IM.sure === p.id ? btn('imdelgo:' + p.id, 'Delete for good') : btn('imdel:' + p.id, 'Delete')}</div></div>`).join('')}</div>` : '<div class="og-list"><div style="display:block"><span>No pictures yet.</span></div></div>'}</div></div>`;
  };

  /* ---------- events ---------- */
  async function refreshSyncChip() {
    const [p, s] = await Promise.all([g('/api/pairing', { devices: [] }), g('/api/sync/status', { last: null })]);
    const l = s.last, names = Object.fromEntries((p.devices || []).map(x => [x.id, x.name]));
    window.xSync = { paired: (p.devices || []).length, at: l ? l.at : 0, line: !l ? 'Not synced yet.' : 'Last round ' + ago(l.at) + (l.note ? ': ' + l.note : l.ok ? ', all fine.' : ', something failed.'), ok: !l || l.ok };
    again();
  }
  window.xRefreshSync = refreshSyncChip;
  // the chip on the top bar: a dot and one word; a tap forces a round
  window.xSyncChip = () => {
    const s = window.xSync; if (!s || !s.paired) return '';
    const age = s.at ? Date.now() - s.at : Infinity;
    const st = RD.syncing ? ['syncing', 'SYNCING'] : !s.ok ? ['failed', 'SYNC FAILED'] : !s.at ? ['idle', 'NOT SYNCED'] : age > 900000 ? ['stale', 'SYNCED ' + ago(s.at).toUpperCase()] : ['ok', 'SYNCED'];
    return `<button type="button" class="sync-chip ${st[0]}" data-rd="syncall" title="Sync now" aria-label="${E(st[1].toLowerCase())}, press to sync now"><i></i><span>${E(st[1])}</span></button>`;
  };
  setTimeout(() => { void refreshSyncChip(); }, 1500);
  setInterval(() => { void refreshSyncChip(); }, 60000);
  const val = id => (document.getElementById(id) || {}).value || '';
  document.addEventListener('change', async e => {
    if (!e.target || e.target.id !== 'rd-skill-bundle' || !e.target.files || !e.target.files[0]) return;
    RD.marketErr = ''; RD.marketBusy = true; again();
    try {
      const pack = JSON.parse(await e.target.files[0].text());
      if (!pack || typeof pack !== 'object' || !Array.isArray(pack.files) || pack.files.some(f => !f || typeof f.path !== 'string' || typeof f.content !== 'string')) throw new Error('The JSON must contain a files list with path and text content.');
      const files = pack.files.map(f => ({ path: f.path, base64: utf8Base64(f.content) }));
      const r = await w('/api/install-gate/quarantine', 'POST', { ...pack, kind: 'skill', files });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'The package could not be scanned.');
      RD.marketItems = [data, ...(RD.marketItems || [])];
    } catch (err) { RD.marketErr = err && err.message ? err.message : 'The package could not be read.'; }
    RD.marketBusy = false; e.target.value = ''; again();
  });
  document.addEventListener('change', async e => {
    if (e.target && e.target.id === 'rd-kfile' && e.target.files[0]) { const f = e.target.files[0]; const t = await f.text(); const n = document.getElementById('rd-kname'); const x = document.getElementById('rd-ktext'); if (x) x.value = t; if (n && !n.value) n.value = f.name.replace(/\.[^.]+$/, ''); }
  });
  document.addEventListener('input', e => { if (e.target && e.target.id === 'rd-url') RD.join.url = e.target.value; if (e.target && e.target.id === 'rd-code') RD.join.code = e.target.value.replace(/\D/g, ''); if (e.target && e.target.id === 'rd-kq') RD.kbq = e.target.value; });
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-rd]'); if (!t || t.hasAttribute('disabled')) return;
    const [k, v] = t.dataset.rd.split(/:(.*)/s); RD.err = {};
    if (k === 'visible' || k === 'discover') { await w('/api/pairing', 'PUT', { [k]: !RD.dev[k] }); if (k === 'visible' && RD.dev.visible) RD.code = null; await loadDev(); }
    else if (k === 'code') { const r = await w('/api/pairing/code', 'POST'); if (r.ok) { RD.code = await r.json(); tick(); } else RD.err.dev = 'Turn on Visible to new devices first.'; again(); }
    else if (k === 'unpair') { await w('/api/pairing/devices/' + encodeURIComponent(v), 'DELETE'); await loadDev(); }
    else if (k === 'join') { const r = await w('/api/pairing/join', 'POST', { url: RD.join.url, code: RD.join.code }); if (r.ok) { RD.join = { url: '', code: '' }; await loadDev(); } else { const j = await r.json().catch(() => ({})); RD.err.dev = j.error === 'unreachable' ? 'That address did not answer.' : j.error === 'bad_url' ? 'That is not a valid address.' : 'The code was wrong, expired or already used.'; again(); } }
    else if (k === 'ladd') { const t = val('rd-l-' + v).trim(); if (t) { await w('/api/lists/' + v, 'POST', { text: t }); LS[v].items = null; again(); } }
    else if (k === 'ldone') { const [lk, id, d] = v.split('|'); await w('/api/lists/item/' + encodeURIComponent(id), 'PUT', { done: d === '1' }); LS[lk].items = null; again(); }
    else if (k === 'lboard') { const [lk, id] = v.split('|'); const it = LS[lk].items.find(x => x.id === id); if (it) { const r = await w('/api/board', 'POST', { title: it.text }); if (r.ok) { await w('/api/lists/item/' + encodeURIComponent(id), 'DELETE'); W.at = 0; } } LS[lk].items = null; again(); }
    else if (k === 'ldel') { const [lk, id] = v.split('|'); LS[lk].sure = id; again(); }
    else if (k === 'ldelgo') { const [lk, id] = v.split('|'); await w('/api/lists/item/' + encodeURIComponent(id), 'DELETE'); LS[lk].sure = null; LS[lk].items = null; again(); }
    else if (k === 'clpaste') { try { const t = await navigator.clipboard.readText(); const x = document.getElementById('rd-clip'); if (x) x.value = t; } catch { RD.err.clip = 'The browser did not allow reading the clipboard; paste into the box instead.'; again(); } }
    else if (k === 'cladd') { const t = val('rd-clip').trim(); if (t) { await w('/api/lists/clipboard', 'POST', { text: t }); LS.clipboard.items = null; again(); } }
    else if (k === 'clcopy') { const it = LS.clipboard.items.find(x => x.id === v); try { await navigator.clipboard.writeText(it ? it.text : ''); } catch {} }
    else if (k === 'cldel') { await w('/api/lists/item/' + encodeURIComponent(v), 'DELETE'); LS.clipboard.items = null; again(); }
    else if (k === 'vmake') { const name = val('rd-vname').trim(), text = val('rd-vnew'), pass = val('rd-vpass'); if (!name || !text || pass.length < 6) { VT.err = 'A name, some text and a passphrase of at least six characters are needed.'; again(); } else { const s = await seal(pass, text); const r = await w('/api/vault', 'POST', { name, ...s }); VT.err = r.ok ? '' : 'It could not be saved.'; VT.items = null; again(); } }
    else if (k === 'vopen') { const pass = val('rd-vp-' + v); const item = await g('/api/vault/' + encodeURIComponent(v), null); if (!item) return; try { VT.text = await unseal(pass, item); VT.open = item; VT.pass = pass; VT.err = ''; } catch { VT.err = 'That passphrase does not open this note.'; } again(); }
    else if (k === 'vsave') { const s = await seal(VT.pass, val('rd-vtext')); const r = await w('/api/vault/' + encodeURIComponent(VT.open.id), 'PUT', { name: VT.open.name, ...s }); VT.err = r.ok ? '' : 'It could not be saved.'; VT.text = val('rd-vtext'); VT.items = null; again(); }
    else if (k === 'vclose') { VT.open = null; VT.text = ''; VT.pass = ''; VT.sure = false; VT.items = null; again(); }
    else if (k === 'vdel') { VT.sure = true; again(); }
    else if (k === 'vdelgo') { await w('/api/vault/' + encodeURIComponent(VT.open.id), 'DELETE'); VT.open = null; VT.text = ''; VT.pass = ''; VT.sure = false; VT.items = null; again(); }
    else if (k === 'drrefresh') { DR.d = null; DR.saved = ''; again(); }
    else if (k === 'drsave') { const d = DR.d; let name = 'Daily review ' + d.today; let r = await w('/api/notes', 'POST', { name, content: dailyMd(d) }); if (!r.ok) { name += ' (' + new Date().toTimeString().slice(0, 5).replace(':', '.') + ')'; r = await w('/api/notes', 'POST', { name, content: dailyMd(d) }); } if (r.ok) { DR.saved = name; RD.err.dr = ''; } else RD.err.dr = 'The note could not be saved.'; again(); }
    else if (k === 'hlrefresh') { HL.d = null; again(); }
    else if (k === 'goUsage') { open_({ k: 'app', id: 'Usage' }); render(); }
    else if (k === 'wtog') { await saveRule(v, { on: !WT.rules[v].on }); }
    else if (k === 'wdays') { const n = Math.max(1, Math.min(365, Number(val('rd-w-' + v)) || 1)); await saveRule(v, { days: n }); }
    else if (k === 'kfsave') { await w('/api/knowledge/' + encodeURIComponent(v) + '/folder', 'PUT', { folder: val('rd-kf-' + v) }); FD.f = null; await loadKb(); }
    else if (k === 'kfall') { RD.kfilter = ''; again(); }
    else if (k === 'fopen') { RD.kfilter = v; RD.kb = null; open_({ k: 'app', id: 'Library' }); render(); }
    else if (k === 'fgoLib') { open_({ k: 'app', id: 'Library' }); render(); }
    else if (k === 'gstyle') { GR.style = Number(v); again(); }
    else if (k === 'ggo') { const topic = val('rd-gtopic').trim(); if (!topic) { GR.err = 'Give it a topic first.'; again(); return; } GR.err = ''; if (!window.xNewThread) { GR.err = 'The chat is not ready yet.'; again(); return; } await window.xNewThread('caesar-alone'); await new Promise(r => setTimeout(r, 200)); const i = document.getElementById('inp'); if (i) { i.value = 'Grill me on this: ' + topic + '\n\nAsk me one question at a time and wait for my answer. ' + GSTYLE[GR.style || 0] + ' After five questions, tell me where my answers were thin.'; i.focus(); } }
    else if (k === 'mmk') { const t = val('rd-mtitle2').trim(); if (t) await saveMission({ title: t, steps: [] }); }
    else if (k === 'mopen2') { MS.open = v; MS.sure = false; again(); }
    else if (k === 'mclose') { MS.open = null; MS.sure = false; again(); }
    else if (k === 'mstepadd') { const t = val('rd-mstep').trim(), m = MS.items.find(x => x.id === MS.open); if (t && m) { m.steps.push({ t, done: false }); await saveMission(m); } }
    else if (k === 'mstep') { const m = MS.items.find(x => x.id === MS.open); if (m && m.steps[Number(v)]) { m.steps[Number(v)].done = !m.steps[Number(v)].done; await saveMission(m); } }
    else if (k === 'mstepdel') { const m = MS.items.find(x => x.id === MS.open); if (m) { m.steps.splice(Number(v), 1); await saveMission(m); } }
    else if (k === 'mdel') { MS.sure = true; again(); }
    else if (k === 'mdelgo') { await w('/api/lists/item/' + encodeURIComponent(MS.open), 'DELETE'); MS.open = null; MS.sure = false; await loadMissions(); }
    else if (k === 'padd') { const title = val('rd-ptitle').trim(), body = val('rd-pbody').trim(); if (!title || !body) { PR.err = 'A name and the prompt text are needed.'; again(); } else { PR.err = ''; await w('/api/lists/prompts', 'POST', { text: JSON.stringify({ title, body }) }); await loadPrompts(); } }
    else if (k === 'puse') { const p = PR.items.find(x => x.id === v); if (p && window.xNewThread) { await window.xNewThread('caesar-alone'); await new Promise(r => setTimeout(r, 200)); const i = document.getElementById('inp'); if (i) { i.value = p.body; i.focus(); } } }
    else if (k === 'pdel') { PR.sure = v; again(); }
    else if (k === 'pdelgo') { await w('/api/lists/item/' + encodeURIComponent(v), 'DELETE'); PR.sure = null; await loadPrompts(); }
    else if (k === 'hdstop') { const r = await w('/api/running/stop', 'POST'); const j = await r.json().catch(() => ({})); HD.msg = r.ok ? 'Stopped ' + j.stopped + '.' : 'It could not be stopped.'; HD.d = null; again(); }
    else if (k === 'radd') { const st = REC[v], rec = {}; for (const f of st.fields) rec[f[0]] = val('rd-' + v + '-' + f[0]).trim(); if (!rec[st.fields[0][0]]) { st.err = 'Fill in the first field.'; again(); } else { st.err = ''; if (st.stages) rec._stage = st.stages[0]; await w('/api/lists/' + v, 'POST', { text: JSON.stringify(rec) }); await st.load(); } }
    else if (k === 'rstage') { const [lk, id, stage] = v.split('|'), st = REC[lk], it = st.items.find(x => x._id === id); if (it) { const rec = {}; for (const f of st.fields) rec[f[0]] = it[f[0]]; rec._stage = stage; await w('/api/lists/item/' + encodeURIComponent(id), 'DELETE'); await w('/api/lists/' + lk, 'POST', { text: JSON.stringify(rec) }); await st.load(); } }
    else if (k === 'rdel') { const [lk, id] = v.split('|'); REC[lk].sure = id; again(); }
    else if (k === 'rdelgo') { const [lk, id] = v.split('|'); await w('/api/lists/item/' + encodeURIComponent(id), 'DELETE'); REC[lk].sure = null; await REC[lk].load(); }
    else if (k === 'wxgo') { const city = val('rd-wx-city').trim(); if (!city) { WX.err = 'Type a city.'; again(); } else { try { localStorage.setItem('caesaros.wxcity', city); } catch {} WX.busy = true; WX.err = ''; again(); const r = await fetch('/api/weather?city=' + encodeURIComponent(city)); WX.busy = false; if (r.ok) WX.w = await r.json(); else { WX.w = null; WX.err = r.status === 404 ? 'No such place found.' : 'The weather service could not be reached.'; } again(); } }
    else if (k === 'nwadd') { const u = val('rd-nw-url').trim(); if (!/^https?:\/\/[^ ]+$/.test(u)) { NW.err = 'Enter a full http or https address.'; again(); } else { NW.err = ''; await w('/api/lists/feeds', 'POST', { text: u }); await nwLoad(); } }
    else if (k === 'nwdel') { await w('/api/lists/item/' + encodeURIComponent(v), 'DELETE'); delete NW.items[v]; await nwLoad(); }
    else if (k === 'nwgo') { NW.busy = true; again(); for (const f of NW.feeds) { const r = await fetch('/api/news?url=' + encodeURIComponent(f.text)); NW.items[f.id] = r.ok ? await r.json() : null; } NW.busy = false; again(); }
    else if (k === 'mtfile') { const f = (document.getElementById('rd-maudio') || {}).files?.[0]; if (!f) { MT.tr.err = 'Choose an audio or video file first.'; again(); } else await mtSend(f); }
    else if (k === 'mtrec') {
      const t = MT.tr;
      if (t.recording && t.rec) { t.rec.stop(); }
      else { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), chunks = []; const rec = new MediaRecorder(stream); rec.ondataavailable = e => chunks.push(e.data); rec.onstop = () => { stream.getTracks().forEach(x => x.stop()); t.recording = false; t.rec = null; void mtSend(new Blob(chunks, { type: rec.mimeType })); }; rec.start(); t.rec = rec; t.recording = true; t.err = ''; again(); } catch { t.err = 'The microphone is not available here.'; again(); } }
    }
    else if (k === 'mtsave') { const text = val('rd-mtext').trim(); if (text) { const d = new Date(), name = 'Transcript ' + d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 5).replace(':', '.'); const r = await w('/api/notes', 'POST', { name, content: text }); MT.tr.err = r.ok ? '' : 'The note could not be saved.'; if (r.ok) { MT.tr.text = ''; MT.list = null; } again(); } }
    else if (k === 'imsize') { IM.prompt = val('rd-impr'); IM.size = Number(v); again(); }
    else if (k === 'imgo') { const prompt = val('rd-impr').trim(); IM.prompt = prompt; if (prompt.length < 3) { IM.err = 'Describe the picture in a few words.'; again(); } else { IM.err = ''; const r = await w('/api/image', 'POST', { prompt, size: IM.size }); if (!r.ok) { const j = await r.json().catch(() => ({})); IM.err = j.error === 'busy' ? 'A picture is already being drawn.' : 'The picture could not be started.'; again(); } else await imLoad(); } }
    else if (k === 'imdel') { IM.prompt = val('rd-impr'); IM.sure = v; again(); }
    else if (k === 'imdelgo') { await w('/api/image/' + encodeURIComponent(v), 'DELETE'); IM.sure = null; await imLoad(); }
    else if (k === 'nfrefresh') { NF.d = null; again(); }
    else if (k === 'goMarket') { open_({ k: 'app', id: 'Marketplace' }); render(); }
    else if (k === 'goDevices') { open_({ k: 'app', id: 'Devices' }); render(); }
    else if (k === 'orchgo') { open_({ k: 'chat', id: v }); render(); }
    else if (k === 'mmake') { const title = val('rd-mtitle').trim(), date = val('rd-mdate'), who = val('rd-mwho').trim(); if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { MT.err = 'A title and a date are needed.'; again(); } else { const name = ('Meeting ' + date + ' ' + title).replace(/[^\p{L}\p{N} _.()-]/gu, '').slice(0, 80).trim(); const body = ['# ' + title, '', 'Date: ' + date, who ? 'With: ' + who : 'With:', '', '## Agenda', '- ', '', '## Notes', '', '## Decisions', '- ', '', '## Actions', '- [ ] ', ''].join('\n'); const r = await w('/api/notes', 'POST', { name, content: body }); MT.err = r.ok ? '' : 'A note with that name already exists, or the name is not allowed.'; if (r.ok) { MT.list = null; } again(); } }
    else if (k === 'mopen') { open_({ k: 'app', id: 'Memory' }); render(); for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 250)); const el = [...document.querySelectorAll('[data-nt-note]')].find(x => x.dataset.ntNote === v); if (el) { el.click(); break; } if (typeof NT !== 'undefined' && MY_NOTES) { await openNote(v); break; } } }
    else if (k === 'sgo') await runSearch();
    else if (k === 'sopen') { const h = SK.hits[Number(v)]; if (h) await openHit(h); }
    else if (k === 'nopen') await openNote(v);
    else if (k === 'nsearch') { if (!(await flushNote())) { NT.err = 'Your changes are not saved yet.'; again(); return; } NT.tag = null; NT.q = val('rd-nq'); await loadNotes(); }
    else if (k === 'ntag') { if (!(await flushNote())) { NT.err = 'Your changes are not saved yet.'; again(); return; } NT.tag = v || null; NT.q = ''; await loadNotes(); }
    else if (k === 'nnew') { if (!(await flushNote())) { NT.err = 'Your changes are not saved yet.'; again(); return; } const r = await w('/api/notes', 'POST', {}); if (r.ok) { const n = await r.json(); NT.tag = null; NT.q = ''; await loadNotes(); await openNote(n.id); } else { NT.err = 'The note could not be created.'; again(); } }
    else if (k === 'nsave') { await flushNote(); await loadNotes(); }
    else if (k === 'nclose') { if (!(await flushNote())) { NT.err = 'Your changes are not saved yet. Save them or resolve the conflict first.'; again(); return; } NT.open = null; NT.delsure = false; await loadNotes(); }
    else if (k === 'ndel') { NT.delsure = true; again(); }
    else if (k === 'ndelgo') { await w('/api/notes/' + encodeURIComponent(NT.open.id), 'DELETE'); NT.open = null; NT.delsure = false; await loadNotes(); }
    else if (k === 'ntheirs') { if (NT.theirs) { NT.open = NT.theirs; NT.text = NT.theirs.content; NT.status = 'saved'; again(); } }
    else if (k === 'nmine') { if (NT.theirs) { NT.open = NT.theirs; NT.status = 'dirty'; await flushNote(); await loadNotes(); } }
    else if (k === 'skgo') { RD.skq = val('rd-skq'); again(); }
    else if (k === 'mgapprove') {
      const item = (RD.marketItems || []).find(x => x.id === v); if (!item) return;
      const confirmYellow = item.scan.verdict === 'yellow';
      if (confirmYellow && !window.confirm('This scan has yellow findings. Review the exact findings and hash before continuing. Approve this hash?')) return;
      const card = t.closest('.og-card'); const targets = card ? [...card.querySelectorAll('[data-agent-target]:checked')].map(x => x.dataset.agentTarget) : [];
      if (!targets.length) { RD.marketErr = 'Select at least one agent before approving.'; again(); return; }
      const r = await w('/api/install-gate/' + encodeURIComponent(v) + '/approve', 'POST', { sha256: item.scan.sha256, confirmYellow, targets });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { if (data.item) { RD.marketItems = RD.marketItems.map(x => x.id === v ? data.item : x); RD.skills = await g('/api/skills', []); } RD.marketErr = data.error === 'scan_changed' ? 'The package changed. Review the new scan before approving.' : data.error === 'agent_projection_failed' ? 'Some selected agents were updated. Select the remaining agents and retry.' : 'The package could not be added (' + (data.error || 'failed') + ').'; }
      else { RD.marketItems = RD.marketItems.map(x => x.id === v ? data : x); RD.skills = await g('/api/skills', []); }
      again();
    }
    else if (k === 'mgremove') {
      if (!window.confirm('Remove this unchanged skill from CaesarOS?')) return;
      const r = await w('/api/install-gate/' + encodeURIComponent(v), 'DELETE');
      if (!r.ok) RD.marketErr = 'Some unchanged agent copies may already be removed. Modified files were preserved; resolve the change and retry to finish.';
      else { RD.marketItems = RD.marketItems.filter(x => x.id !== v); RD.skills = await g('/api/skills', []); }
      again();
    }
    else if (k === 'wbadd') { const i = document.getElementById('rd-wb'); const title = i ? i.value.trim() : ''; if (title) { await w('/api/board', 'POST', { title }); await refreshW(); } }
    else if (k === 'cprev' || k === 'cnext') { const c = RD.cal; c.m += k === 'cnext' ? 1 : -1; if (c.m < 0) { c.m = 11; c.y--; } if (c.m > 11) { c.m = 0; c.y++; } c.sel = null; await loadCal(); }
    else if (k === 'ctoday') { const t = new Date(); RD.cal.y = t.getFullYear(); RD.cal.m = t.getMonth(); RD.cal.sel = null; await loadCal(); }
    else if (k === 'cday') { RD.cal.sel = v; again(); }
    else if (k === 'cadd') { const r = await w('/api/calendar', 'POST', { title: val('rd-ctitle'), time: val('rd-ctime').trim(), date: RD.cal.sel }); if (!r.ok) { const j = await r.json().catch(() => ({})); RD.err.cal = j.error === 'time' ? 'Time must look like 09:30.' : 'Write a title first.'; again(); } else await loadCal(); }
    else if (k === 'cdel') { RD.cdel = v; again(); }
    else if (k === 'cdelgo') { await w('/api/calendar/' + encodeURIComponent(v), 'DELETE'); RD.cdel = null; await loadCal(); }
    else if (k === 'syncn') { await w('/api/sync/state/' + encodeURIComponent(v), 'PUT', { notes: !(RD.sync || {})[v] }); await loadDev(); }
    else if (k === 'syncall') { RD.syncing = true; again(); await w('/api/sync/all', 'POST'); RD.syncing = false; await loadDev(); void refreshSyncChip(); }
    else if (k === 'hrel' || k === 'hdis') { await w('/api/sync/held/' + encodeURIComponent(v) + '/' + (k === 'hrel' ? 'release' : 'discard'), 'POST'); await loadDev(); }
    else if (k === 'cpuse' || k === 'cpkeep') { RD.cpSure = (k === 'cpuse' ? 'use' : 'keep') + v; again(); }
    else if (k === 'cpusego') { const c = RD.cop[+v]; if (c) { if (c.hasOrig) await w('/api/notes/' + encodeURIComponent(c.orig), 'PUT', { content: c.copy, rev: c.rev }); else await w('/api/notes', 'POST', { name: c.orig, content: c.copy }); await w('/api/notes/' + encodeURIComponent(c.id), 'DELETE'); } RD.cpSure = null; await loadDev(); }
    else if (k === 'cpkeepgo') { const c = RD.cop[+v]; if (c) await w('/api/notes/' + encodeURIComponent(c.id), 'DELETE'); RD.cpSure = null; await loadDev(); }
    else if (k === 'cpchat') { RD.cpSure = 'chat' + v; again(); }
    else if (k === 'cpchatgo') { await w('/api/chat/sessions/' + encodeURIComponent(v), 'DELETE'); RD.cpSure = null; await loadDev(); }
    else if (k === 'syncc') { await w('/api/sync/chats/state/' + encodeURIComponent(v), 'PUT', { on: !(RD.csync || {})[v] }); await loadDev(); }
    else if (k === 'synccnow') { const r = await w('/api/sync/chats/now/' + encodeURIComponent(v), 'POST'); const j = await r.json().catch(() => ({})); RD.err.dev = j.error ? 'Chat sync did not reach the other device (' + j.error + ').' : 'Sent ' + j.sent + ' conversation' + (j.sent === 1 ? '' : 's') + ', encrypted.'; await loadDev(); }
    else if (k === 'syncnow') { const r = await w('/api/sync/now/' + encodeURIComponent(v), 'POST'); const j = await r.json().catch(() => ({})); RD.err.dev = j.error ? 'Sync did not reach the other device (' + j.error + ').' : 'Sent ' + j.sent + ' changed ' + (j.sent === 1 ? 'item' : 'items') + '. Differing notes arrive there as copies; a task changed on both sides keeps the newer edit.'; await loadDev(); }
    else if (k === 'send') { const text = val('rd-send-' + v).trim(); if (text) { const r = await w('/api/handoff/send', 'POST', { deviceId: v, text }); RD.err.dev = r.ok ? '' : 'The task could not be delivered. Is the other device on?'; await loadDev(); } }
    else if (k === 'hochat') { const h = (RD.inbox || []).find(x => x.id === v); if (h && window.xNewThread) { await window.xNewThread('caesar-alone'); await new Promise(r => setTimeout(r, 150)); const i = document.getElementById('inp'); if (i) { i.value = h.text; i.focus(); } await w('/api/handoff/' + encodeURIComponent(v), 'DELETE'); RD.inbox = (RD.inbox || []).filter(x => x.id !== v); } }
    else if (k === 'pick') { RD.pick = RD.pick === v ? null : v; if (RD.pick) RD.notesList = await g('/api/notes', []); again(); }
    else if (k === 'sendnote') { const [dev, note] = v.split('|'); const r = await w('/api/handoff/send', 'POST', { deviceId: dev, noteId: note }); RD.err.dev = r.ok ? '' : 'The note could not be delivered. Is the other device on?'; RD.pick = null; await loadDev(); }
    else if (k === 'hoaccept') { const r = await w('/api/handoff/' + encodeURIComponent(v) + '/accept', 'POST'); RD.err.dev = r.ok ? '' : 'The note could not be saved.'; await loadDev(); }
    else if (k === 'hodone') { await w('/api/handoff/' + encodeURIComponent(v), 'DELETE'); await loadDev(); }
    else if (k === 'hocopy') { const h = (RD.inbox || []).find(x => x.id === v); try { await navigator.clipboard.writeText(h ? h.text : ''); } catch {} }
    else if (k === 'bkmake') { await w('/api/backup', 'POST'); await loadDev(); RD.set && await loadSet(); }
    else if (k === 'pull') { await w('/api/models/pull', 'POST', { model: v }); RD.pull = { model: v, status: 'starting', completed: 0, total: 0, done: false, error: null }; again(); watchPull(); }
    else if (k === 'pullstop') { await w('/api/models/pull', 'DELETE'); }
    else if (k === 'rm') { RD.sure = v; again(); }
    else if (k === 'rmgo') { await w('/api/models/installed', 'DELETE', { name: v }); RD.sure = null; RD.inst = await g('/api/models/installed', []); again(); }
    else if (k === 'keymk') { const name = val('rd-key').trim().toLowerCase(); const r = await w('/api/tokens', 'POST', { name }); const j = await r.json().catch(() => ({})); if (r.ok && j.token) RD.fresh = j.token; else RD.err.key = j.error || 'The key could not be made.'; await loadKeys(); }
    else if (k === 'keyrm') { await w('/api/tokens/' + encodeURIComponent(v), 'DELETE'); RD.fresh = null; await loadKeys(); }
    else if (k === 'kbsearch') { RD.kbq = val('rd-kq'); RD.kbhits = RD.kbq.trim() ? await g('/api/knowledge/search?q=' + encodeURIComponent(RD.kbq), []) : null; again(); }
    else if (k === 'kcol') { RD.kfilter = decodeURIComponent(v) || null; RD.kbsel = null; again(); }
    else if (k === 'lib') { const doc = (RD.kb || []).find(x => x.id === v); if (doc) { RD.kbsel = doc.id; RD.kbq = doc.name; RD.kbhits = await g('/api/knowledge/search?q=' + encodeURIComponent(doc.name), []); } again(); }
    else if (k === 'kbadd') { const r = await w('/api/knowledge', 'POST', { name: val('rd-kname'), text: val('rd-ktext') }); if (!r.ok) RD.err.kb = 'The document could not be added.'; await loadKb(); }
    else if (k === 'kbrm') { RD.ksure = v; again(); }
    else if (k === 'kbrmgo') { await w('/api/knowledge/' + encodeURIComponent(v), 'DELETE'); RD.ksure = null; RD.kbhits = null; await loadKb(); }
  });
  function tick() { const id = setInterval(() => { if (!RD.code) return clearInterval(id); const l = Math.max(0, Math.round((RD.code.expiresAt - Date.now()) / 1000)); const el = document.getElementById('rd-left'); if (el) el.textContent = Math.floor(l / 60) + ':' + String(l % 60).padStart(2, '0'); if (l === 0) { RD.code = null; clearInterval(id); loadDev(); } }, 500); const chk = setInterval(async () => { if (!RD.code) return clearInterval(chk); const s = await g('/api/pairing', null); if (s && !s.codeActive) { RD.code = null; clearInterval(chk); RD.err.dev = 'That code stopped working (too many wrong tries or it expired). Show a new one.'; loadDev(); } }, 3000); }
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('[data-rd][role=switch]')) { e.preventDefault(); e.target.click(); } });
  /* the Home page is drawn by the prototype shell, so its Needs-you slot is filled here: only when that view is on screen,
     only from the core's own answer (no strip is shown before one arrives) */
  async function fillNeeds() {
    if (!document.getElementById('nx-needs')) return;
    const d = await g('/api/orchestration', null), slot = document.getElementById('nx-needs');
    if (d && slot) slot.innerHTML = needsStrip(d);
  }
  const drawn = render; let needsSoon = 0;
  render = function () { drawn(); clearTimeout(needsSoon); needsSoon = setTimeout(() => { void fillNeeds(); }, 60); };
  setInterval(() => { void fillNeeds(); }, 15000);
  void fillNeeds();

  register({ id: 'real', views: V });
})();
