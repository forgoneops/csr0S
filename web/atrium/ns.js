/* CaesarOS new shell: grouped left menu, Start/setup, Engines, Settings, Search, Notifications. DEMO DATA, NOT THE PRODUCT.
   Inspired by the behaviour of a local-first AI desktop app. Own design, own words, our look. */
const NSIA = [
  ['Talk', 'chat', [['Chat', 'Audience', 'chat'], ['Conversations', 'Colloquia', 'archive'], ['Crew', 'The Lair', 'crew'], ['Grill me', 'Quaestio', 'sparkle'], ['Social', 'Agora', 'news']]],
  ['Day', 'calendar', [['Board', 'Album', 'planner'], ['Daily review', 'Dream', 'dream'], ['Goals', 'Proposita', 'check'], ['Mail', 'Tabellae', 'inbox'], ['Schedule', 'Fasti', 'calendar'], ['Scheduling', 'Fasti', 'calendar'], ['Watchers', 'Vigiles', 'search'], ['Weather', 'Auguria', 'planner']]],
  ['Knowledge', 'brain', [['Memory', 'Tabularium', 'brain'], ['Search', 'Quaero', 'search'], ['Meetings', 'Commentarii', 'mic'], ['Folders', 'Armarium', 'folder'], ['Reading', 'Lectio', 'book'], ['Library', 'Bibliotheca', 'library'], ['Media Gallery', 'Archive', 'image'], ['Editor', 'Scriptorium', 'book'], ['News', 'Acta diurna', 'news']]],
  ['Work', 'missions', [['Missions', 'Expeditiones', 'missions'], ['Builds', 'Forge', 'forge'], ['Horde desk', 'Castra', 'crew'], ['Command', 'Praetorium', 'crown'], ['Business', 'Negotium', 'usage'], ['Finance', 'Ledger', 'usage'], ['Evidence', 'Acta', 'check'], ['Ideas', 'Forum', 'sparkle']]],
  ['Make', 'design', [['Image Studio', 'Pictorium', 'image'], ['Reels', 'Cinema', 'video'], ['Web tools', 'Officina', 'design'], ['Offer Boards', '', 'design'], ['Leads', 'Venatio', 'search'], ['Mirror', 'Speculum', 'plugin']]],
  ['Private Data', 'lock', [['Vault', 'Arca', 'lock'], ['Clipboard', 'Fasces', 'folder'], ['Devices', 'Castra', 'crew']]],
  ['System', 'system', [['Integrations', 'Connexio', 'plugin'], ['Models', 'Armamentarium', 'engine'], ['Engines', 'Machinae', 'system'], ['Gateway', 'Porta', 'system'], ['Marketplace', 'Mercatus', 'plugin'], ['Usage', 'Rations', 'usage'], ['Cost', 'Computus', 'usage'], ['Fleet', '', 'system'], ['Health', 'Vitals', 'health'], ['Storage', 'Horreum', 'folder'], ['Skills', '', 'skills'], ['Terminal', 'Armilla', 'terminal'], ['Notifications', 'Nuntii', 'alert'], ['Updates', '', 'arrow'], ['Tool graph', 'Rete', 'tools']]]
];
// Optional tools are grouped by the workspace they surface in. Keep core tools out of this list.
const MODULE_GROUPS = [
  { id: 'day', title: 'Plan your day', workspace: 'Planning', apps: ['Schedule', 'Scheduling', 'Mail', 'Goals', 'Daily review', 'Watchers', 'Weather'], defaults: ['Schedule', 'Goals', 'Daily review'] },
  { id: 'knowledge', title: 'Keep what you know', workspace: 'Knowledge', apps: ['Memory', 'Search', 'Meetings', 'Folders', 'Reading', 'Library', 'Media Gallery', 'Editor', 'News'], defaults: ['Memory', 'Search', 'Library', 'Media Gallery', 'Folders', 'Editor'] },
  { id: 'studio', title: 'Make things', workspace: 'Business', apps: ['Studio', 'Image Studio', 'Reels', 'Web tools', 'Offer Boards'], defaults: [] },
  { id: 'business', title: 'Run a business', workspace: 'Business', apps: ['Business', 'Finance', 'Leads', 'Social', 'Fleet'], defaults: [] },
  { id: 'crew', title: 'Run the crew', workspace: 'Crew', apps: ['Grill me', 'Missions', 'Builds', 'Horde desk', 'Command', 'Evidence', 'Ideas', 'Mirror'], defaults: ['Command'] },
  { id: 'system', title: 'Look after the machine', workspace: 'System', apps: ['Usage', 'Cost', 'Health', 'Storage', 'Devices', 'Updates', 'Skills', 'Engines', 'Vault', 'Clipboard', 'Computer', 'Tool graph'], defaults: ['Usage', 'Health', 'Storage', 'Devices', 'Skills', 'Engines'] },
];
window.MODULE_GROUPS = MODULE_GROUPS;
window.applyOptionalModules = settings => {
  const disabled = new Set(settings?.disabledModules || []), enabled = new Set(settings?.enabledModules || []);
  OGS.mods = new Set(MODULE_GROUPS.flatMap(g => g.apps).filter(name => {
    const key = 'app-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const group = MODULE_GROUPS.find(g => g.apps.includes(name));
    const plugin = key.slice(4);   // a module's own switch (Settings) saves its bare plugin id, Setup saves app-<name>
    return !disabled.has(key) && !disabled.has(plugin) && (enabled.has(key) || enabled.has(plugin) || group.defaults.includes(name));
  }));
};
const NS = { open: { Talk: true, Day: true, Knowledge: false, Work: false, Make: false, 'Private Data': false, System: false }, pin: false };
try { if (localStorage.getItem('caesaros-menu-pin') === '1') { NS.pin = true; document.documentElement.classList.add('ns-pinned'); } } catch (_) {}
/* Beginner first: a fresh install shows Start, Home, Chat, Notes, Settings and More. A group the person opened
   stays in the menu, remembered on this device; More reveals the rest for this session. */
const NXG = (() => { try { return new Set(JSON.parse(localStorage.getItem('caesaros-menu-groups') || '[]')); } catch { return new Set(); } })();
const NXMORE = { on: false };
const nxKeep = g => { NXG.add(g); try { localStorage.setItem('caesaros-menu-groups', JSON.stringify([...NXG])); } catch (_) {} };
/* Start with the explicit defaults; saved settings replace this in hubs.js. */
OGS.mods = new Set(MODULE_GROUPS.flatMap(g => g.defaults));
/* routing: which engine answers each job (a policy, never an on/off for cloud tools) */
const ENGROWS = [['Chat', 'chat'], ['Vision', 'vis'], ['Image', 'img'], ['Video', 'vid'], ['Speech to text', 'stt'], ['Text to speech', 'tts'], ['Brain recall (embeddings)', 'emb'], ['Crew runs', 'crew']];
OGS.eng = {};
function ogPreset(m) {
  const P = { local: { chat: 'dev', vis: 'dev', img: 'dev', vid: 'dev', stt: 'dev', tts: 'dev', emb: 'dev', crew: 'tool' }, vps: { chat: 'vps', vis: 'vps', img: 'dev', vid: 'dev', stt: 'vps', tts: 'dev', emb: 'vps', crew: 'tool' }, off: { chat: 'dev', vis: 'dev', img: 'dev', vid: 'dev', stt: 'dev', tts: 'dev', emb: 'dev', crew: 'dev' } };
  OGS.eng = Object.assign({}, P[m]);
}
ogPreset('vps');

const nsModeName = () => OGS.mode === 'vps' ? 'VPS · Shared Brain' : OGS.mode === 'local' ? 'Local' : 'Offline';

function railHtml() {
  const act = S.tabs[S.act] || { k: 'ws' }, on = n => act.k === 'app' && act.id === n;
  const wait = S.waiting.length;
  const item = ([n, la, ic]) => {
    if (!ogEnabled(n) && !['Start', 'Settings'].includes(n)) return '';
    const attr = n === 'Chat' ? 'data-ns="chat"' : `data-app="${OGE(n)}"`;
    const sel = n === 'Chat' ? act.k === 'chat' || on('Chat') : on(n);
    const bd = n === 'Chat' && wait ? `<i class="bd">${wait}</i>` : n === 'Notifications' && wait ? `<i class="bd">${wait}</i>` : '';
    return `<button class="ns-it ${sel ? 'on' : ''}" ${attr} title="${OGE(n)}">${I(ic, 20)}${bd}<span class="ns-lab">${OGE(n)}</span>${la ? `<small class="ns-lab">${OGE(la)}</small>` : ''}</button>`;
  };
  const plain = (n, ic, attr, sel, bd = '') => `<button class="ns-it ${sel ? 'on' : ''}" ${attr} title="${OGE(n)}">${I(ic, 20)}${bd}<span class="ns-lab">${OGE(n)}</span></button>`;
  const crew = `<div class="ns-crew">${CREW.map(m => `<button data-ns="crew:${m.id}" title="${OGE(m.n)} · ${OGE(m.r)}" style="background-image:url(${m.img})"><i class="${m.st === 'work' ? 'work' : m.st === 'wait' ? 'wait' : ''}"></i></button>`).join('')}</div>`;
  const groups = NSIA.filter(([g]) => NXMORE.on || NXG.has(g)).map(([g, gi, items]) => {
    const vis = items.filter(([n]) => ogEnabled(n)); if (!vis.length) return '';
    const open = NS.open[g];
    return `<button class="ns-gh ${open ? 'open' : ''}" data-ns="grp:${OGE(g)}">${I(gi, 20)}<span class="ns-lab">${OGE(g)}</span><i class="ns-lab">${vis.length}</i><em class="ns-lab">›</em></button><div class="ns-gl ${open ? 'open' : ''}">${g === 'Talk' ? crew : ''}${items.map(item).join('')}</div>`;
  }).join('');
  return `<div class="ns-wrap" id="rail"><aside class="ns-side" aria-label="Primary navigation">
    <div class="ns-brand">${CXLOGO(30)}<b class="ns-lab">CAESAR OS</b><button class="ns-pin ns-lab ${NS.pin ? 'on' : ''}" data-ns="pin" title="Keep the menu open">${I('crossroads', 16)}</button></div>
    <div class="ns-scroll">
      ${plain('Start', 'home', 'data-app="Start"', on('Start'))}
      ${window.GS && GS.inMenu() ? plain('Get started', 'check', 'data-app="Get started"', on('Get started')) : ''}
      ${plain('Home', 'crown', 'data-ns="home"', act.k === 'ws')}
      ${plain('Chat', 'chat', 'data-ns="chat"', act.k === 'chat', wait ? `<i class="bd">${wait}</i>` : '')}
      ${plain('Notes', 'brain', 'data-app="Memory"', on('Memory'))}
      ${plain('Settings', 'settings', 'data-app="Settings"', on('Settings'))}
      <div class="ns-sep"></div>
      ${groups}
      ${NXMORE.on ? '' : `<button class="ns-it" data-ns="more" title="More">${I('plus', 20)}<span class="ns-lab">More</span><em class="ns-lab">›</em></button>`}
    </div>
    <div class="ns-foot">
      <div class="ns-chip"><span class="d ${OGS.mode === 'off' ? 'off' : OGS.mode === 'local' ? 'loc' : ''}"></span><span class="ns-lab"><b>${nsModeName()}</b>${OGS.mode === 'local' ? ' · this device' : ''}</span></div>
      <button class="ns-it" data-ns="theme" title="Theme">${I('flame', 20)}<span class="ns-lab">Theme: ${document.documentElement.dataset.theme === 'neutral' ? 'Neutral' : 'CaesarOS'}</span></button>
      <button class="ns-it" data-app="Mobile app" title="Mobile app">${I('chat', 20)}<span class="ns-lab">Mobile app</span></button>
    </div></aside></div>`;
}
function flyHtml() {
  // The Sessions strip in the footer and the rail both land here: a real list of open conversations,
  // each a button that opens that thread. Empty state says so instead of rendering nothing.
  if (typeof S === 'undefined' || S.flyout !== 'ses') return '';
  const E = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = (typeof THREADS !== 'undefined' ? THREADS : []).slice(0, 14)
    .map((t) => `<button type="button" class="fly-row" data-ses="${E(t.id)}"><span class="fly-t"><b>${E(t.t === 'New conversation' ? uiText(t.t) : t.t)}</b><small>${E(((typeof C !== 'undefined' && C[t.a]) || {}).n || '')} · ${E(uiText(t.s))}</small></span><span class="fly-go" aria-hidden="true">›</span></button>`).join('');
  return `<div class="fly" role="dialog" aria-label="Sessions"><div class="fly-head"><span class="label">Sessions</span><button type="button" class="fly-x" data-nx="fly-ses" aria-label="Close sessions">×</button></div>
    <div class="fly-body">${rows || '<p class="su-note">No conversations yet. Start one from Chat.</p>'}</div></div>`;
}

/* ---------- pages ---------- */
const nsHead = (name, sub, la, sc) => `${typeof ARTHEAD === 'function' ? ARTHEAD(name, sc) : ''}<div class="nx-phead"><h2>${OGE(name.toUpperCase())}</h2><span class="label">${OGE(la || '')}</span></div><p style="margin:6px 0 0;color:var(--muted);font-size:13px;max-width:820px">${OGE(sub)}</p>`;

function nsStart() {
  const groups = [['Talk', 'Chat with Caesar and the crew', 'chat'], ['Day', 'Plan the day: board, mail, schedule, goals', 'calendar'], ['Knowledge', 'The Brain: notes, meetings, search, files', 'brain'], ['Work', 'Missions, builds, business, evidence', 'missions'], ['Make', 'Images, films, sites, leads', 'design'], ['Private Data', 'Vault, clipboard, devices, Shared Brain', 'lock'], ['System', 'Integrations, models, engines, gateway', 'system']];
  return `<div class="nx-view enter">${nsHead('Start here', 'CaesarOS begins bare and grows with you. Set it up once, add what you use, and make it yours.', 'Incipit', 'atrium-hero')}
  <div class="og-wrap">${ogModeBanner()}
   ${ogSetupList()}
   <div class="og-sec">What it does for you</div>
   <div class="og-grid">${groups.map(([g, d, ic]) => `<div class="og-card"><div class="og-row">${I(ic, 18)}<h4>${g}</h4></div><p>${d}</p><div class="og-act"><span class="og-tag mut">${(NSIA.find(x => x[0] === g)[2].filter(x => ogEnabled(x[0]))).length} apps</span><button class="btn ghost" style="height:28px;padding:0 10px" data-ns="open-grp:${g}">Open</button></div></div>`).join('')}</div>
   <div class="og-sec">Make it yours</div>
   <div class="og-grid"><div class="og-card"><h4>Workspaces</h4><p>Eight workspaces along the top, each with its own live widgets. Rename, reorder, add more.</p></div><div class="og-card"><h4>Windows</h4><p>Open chats and apps as tabs or split them into up to four windows. Save a layout and call it back.</p></div><div class="og-card"><h4>Add and remove</h4><p>Start with the core, add apps, plugins and connectors one group at a time.</p><div class="og-act"><span></span><button class="btn ghost" style="height:28px;padding:0 10px" data-ogopen="Marketplace">Add apps</button></div></div></div>
   <div class="og-row"><button class="btn" data-obopen="1">Replay first-run setup</button><button class="btn ghost" data-og="fresh:1">Show a fresh install</button><span class="label">A fresh install shows the menu as it grows</span></div>
  </div></div>`;
}

/* Engines: only what the machine reports. /api/engines lists every engine it detected and whether it answers. */
const NSENG = { list: null, busy: false };
async function nsLoadEngines() {
  if (NSENG.busy) return; NSENG.busy = true;
  try { const r = await fetch('/api/engines'); NSENG.list = r.ok ? (await r.json()).engines || [] : []; } catch (_) { NSENG.list = []; }
  NSENG.busy = false; render();
}
function nsEngines() {
  if (!NSENG.list) { void nsLoadEngines(); return `<div class="nx-view enter">${nsHead('Engines', 'The engines CaesarOS found on this machine.', 'Machinae', 'forge')}<div class="og-wrap">${ARTSKEL(3, 'Looking for engines')}</div></div>`; }
  const modes = [['local', 'Local first', 'Use engines on this device whenever they can do the job. Your cloud tools and public providers keep working as before.'], ...(window.REMOTE ? [['vps', 'VPS first', 'Engines and the Shared Brain on your paired server, local engines where it has none.']] : []), ['off', 'Offline', 'Local engines only and nothing leaves this device. Agent tools that need the network pause until it returns.']];
  const row = e => `<div>${I('engine', 16)}<span>${OGE(e.label)} <small>${e.health.ok ? ((e.models || []).length ? (e.models.length === 1 ? '1 model' : e.models.length + ' models') : 'Ready') : OGE(e.health.detail || 'Not answering')}</small></span><span class="og-tag ${e.health.ok ? 'sig' : 'mut'}">${e.health.ok ? 'Answering' : 'Not answering'}</span></div>`;
  return `<div class="nx-view enter">${nsHead('Engines', 'The engines CaesarOS found on this machine. Choose where work runs first; it is a routing choice, never an on/off switch for your cloud tools.', 'Machinae', 'forge')}
  <div class="og-wrap">${ogModeBanner()}
   <div class="og-grid" style="grid-template-columns:repeat(${modes.length},minmax(0,1fr))">${modes.map(([k, n, d]) => `<div class="ns-mode ${OGS.mode === k ? 'on' : ''}" data-og="mode:${k}"><h4>${n}</h4><p>${d}</p></div>`).join('')}</div>
   <div class="og-sec">Detected engines</div>
   ${NSENG.list.length ? `<div class="og-list">${NSENG.list.map(row).join('')}</div>` : `<div class="og-empty"><span class="label">No engine found</span><p>Install Ollama or sign in to an agent tool, then look again. Models are added on the Models page.</p></div>`}
   <div class="og-row"><button class="btn ghost" data-ogopen="Models">Models</button><button class="btn ghost" data-ogopen="Integrations">Integrations</button><button class="btn ghost" data-ns="engrefresh:1">Look again</button></div>
   <div class="og-banner"><b>Good to know</b> Choosing Local does not switch off Claude Code, Codex, Hermes or public providers. Offline is the one mode that pauses them, because there is no network.</div>
  </div></div>`;
}

NS.sc = new Set(['Engines']); NS.opt = { share: true, auto: true, accept: false, pointer: true, scenes: true, field: true, gpu: 'Auto', bk: 'Daily', mo: 'Full', th: document.documentElement.dataset.theme === 'neutral' ? 'Neutral' : 'CaesarOS', hold: true, tele: false };
const PALS = [['j', 'Ember and Cyan', '#ff8a3d', '#33e8ff'], ['e', 'Crimson Magenta', '#ff3fd0', '#ff2d4f'], ['d', 'Scar and Ember', '#b04dff', '#ff7a3d'], ['f', 'Violet Rain', '#a45cff', '#33e8ff'], ['g', 'Royal', '#9b5cff', '#f2c46b'], ['a', 'Synthwave', '#ff3fd0', '#33e8ff'], ['b', 'Cyan Gold', '#33e8ff', '#6a8cff'], ['c', 'Imperial', '#ff3fd0', '#f2c46b'], ['h', 'Night City', '#fcee0a', '#00f0ff'], ['i', 'Rain Amber', '#ffb000', '#2fd6c8']];
NS.pal = document.documentElement.dataset.pal || 'j';
const NSOPT = {
  'Engines': [['Keep engines current', 'Check the engine list when you ask, update after a backup', 'sw', 'auto'], ['GPU components', 'Which processor runs local engines', 'seg', 'gpu', ['Auto', 'Vulkan', 'CPU']], ['Keep the chat model loaded', 'Faster first answer, uses more memory', 'sw', 'hold']],
  'Brain and memory': [['Share the Brain with the VPS', 'Back it up and sync it to your devices', 'sw', 'share'], ['Backup', 'How often the VPS takes a copy', 'seg', 'bk', ['Hourly', 'Daily', 'Weekly']], ['Restore', 'Bring the Brain back from the VPS', 'btn', 'Restore from VPS']],
  'Approvals': [['Caesar may accept build approvals for you', 'Never for deploys, restarts, releases or anything outward', 'sw', 'accept'], ['Always ask for', 'Messages, purchases, deletes, deploys', 'btn', 'Edit list']],
  'Look and motion': [['Theme', 'The look of CaesarOS', 'seg', 'th', ['CaesarOS', 'Neutral']], ['Colours', 'Two neon colours drive the whole interface and the living background', 'pal', 'pal'], ['Motion', 'One switch for every effect', 'seg', 'mo', ['Full', 'Reduced', 'Off']], ['Pointer light', 'Glass surfaces catch the cursor', 'sw', 'pointer'], ['Scenes per page', 'Banner art and ember flicker', 'sw', 'scenes'], ['Living background', 'The breathing field under every screen', 'sw', 'field']],
  'Data and privacy': [['Anonymous usage stats', 'Off by default, never includes your content', 'sw', 'tele'], ['See and delete data', 'Per category or everything', 'btn', 'Open']],
  'Keyboard shortcuts': [['Command palette', 'Find anything, run any command', 'kbd', 'Ctrl K'], ['Terminal', 'Show or hide the terminal pane', 'kbd', 'Ctrl `'], ['Pin the menu', 'Keep the left menu open', 'kbd', 'Ctrl B'], ['Windows', 'Split into up to four windows', 'kbd', 'Ctrl \\']]
};
function nsSettings() {
  const cards = [['Setup and health', 'Models, storage, live component health.'], ['Engines', 'Where each job runs. Keep engines current.'], ['Brain and memory', 'What is remembered, what is shared, backup and restore.'], ['Crew and models', 'Profiles, models, limits, failover.'], ['Approvals', 'What needs your yes, what Caesar may accept for you.'], ['Computer use', 'Screen detail, task context, recovery.'], ['Devices and sync', 'Pair devices, choose what stays in step.'], ['You', 'Who you are, so the crew can tell your messages apart.'], ['What Caesar learned', 'Preferences distilled from your choices.'], ['AI activity', 'Every call: model, tokens, cost, time.'], ['Data and privacy', 'See and delete data, per category or all.'], ['Backup and restore', 'A portable copy of everything.'], ['Look and motion', 'Theme, motion Full, Reduced, Off, per-effect switches.'], ['Keyboard shortcuts', 'Every hotkey in one place.'], ['Software update', 'Check, back up first, one tap back.']];
  const ctl = o => o[2] === 'pal' ? `<div class="og-seg pals">${PALS.map(p => `<button class="${NS.pal === p[0] ? 'on' : ''}" data-ns="pal:${p[0]}" title="${p[1]}" aria-label="${p[1]}" style="background:linear-gradient(135deg,${p[2]} 50%,${p[3]} 50%)"></button>`).join('')}</div>` : o[2] === 'sw' ? ogSwNs(o[3]) : o[2] === 'seg' ? `<div class="og-seg">${o[4].map(v => `<button class="${NS.opt[o[3]] === v ? 'on' : ''}" data-ns="opt:${o[3]}:${OGE(v)}">${OGE(v)}</button>`).join('')}</div>` : o[2] === 'kbd' ? `<span class="og-tag mut">${OGE(o[3])}</span>` : `<button class="btn ghost" style="height:26px;padding:0 10px">${OGE(o[3])}</button>`;
  const card = ([n, d]) => { const open = NS.sc.has(n), opts = NSOPT[n] || [['Open ' + n.toLowerCase(), d, 'btn', 'Open']]; return `<div class="og-card" style="${open ? 'grid-column:1/-1;border-color:var(--accent)' : 'cursor:pointer'}"><div class="og-row" style="justify-content:space-between;cursor:pointer" data-ns="sc:${OGE(n)}"><div><h4>${n}</h4><p>${d}</p></div><span style="color:var(--accent);font-size:18px;transform:rotate(${open ? 90 : 0}deg);transition:transform .2s">›</span></div>${open ? `<div class="og-list" style="margin-top:8px">${opts.map(o => `<div style="grid-template-columns:1fr auto"><span>${OGE(o[0])} <small>${OGE(o[1])}</small></span>${ctl(o)}</div>`).join('')}</div>` : ''}</div>`; };
  return `<div class="nx-view enter">${nsHead('Settings', 'Press a header to open its options. Everything grouped, nothing buried.', 'Ordo', 'system')}<div class="og-wrap"><div class="og-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${cards.map(card).join('')}</div><span class="label">CaesarOS · prototype · demo data</span></div></div>`;
}
const ogSwNs = k => `<span class="og-sw ${NS.opt[k] ? 'on' : ''}" data-ns="optt:${k}" role="switch" aria-checked="${!!NS.opt[k]}"></span>`;

function nsNotifications() {
  return `<div class="nx-view enter">${nsHead('Notifications', 'Plans and results waiting for you, and agents asking for approval. Each source on or off.', 'Nuntii', 'praetorium')}<div class="og-wrap">${ogSeg('x', ['All', 'Approvals', 'Runs', 'Devices'], 'All')}
  ${S.waiting.length ? `<div class="og-list">${S.waiting.map((w, i) => `<div>${I('alert', 16)}<span>${OGE(w.t)} <small>Waiting for your yes · origin ${OGE(w.t.split(':')[0])}</small></span><span class="og-row"><button class="btn" style="height:26px;padding:0 8px" data-ns="appr:${i}">Approve</button><button class="btn ghost" style="height:26px;padding:0 8px" data-ns="appr:${i}">Not now</button></span></div>`).join('')}</div>` : `<div class="og-empty"><span class="label">All caught up</span><p>Approvals and device notices appear here when they need you.</p></div>`}</div></div>`;
}

function nsSearch() {
  const res = [['Note', 'Sessions/2026-11-21-ui-research', 'Brain'], ['Chat', 'Promo opening: traces and fire', 'Caesar'], ['Meeting', 'Standup with Agrippa', 'Meetings'], ['Board', 'Crew chat fixes (handoff 103)', 'Board'], ['Mail', 'Quote for the reel edit', 'Mail']];
  return `<div class="nx-view enter">${nsHead('Search', 'One search over the Brain, chats, runs, meetings, mail and files.', 'Quaero', 'brain')}<div class="og-wrap"><input class="og-input" style="width:100%;box-sizing:border-box" placeholder="Search everything you have seen, said and saved…"><div class="og-row">${ogSeg('x', ['All sources', 'Brain', 'Chats', 'Runs', 'Meetings', 'Mail', 'Files'], 'All sources')}${ogSeg('x', ['Relevant', 'Recent'], 'Relevant')}</div><div class="og-list">${res.map(r => `<div>${I('search', 14)}<span>${r[1]} <small>${r[2]}</small></span><span class="og-tag mut">${r[0]}</span></div>`).join('')}</div></div></div>`;
}
register({ id: 'ns', views: { Start: nsStart, Engines: nsEngines, Settings: nsSettings, Notifications: nsNotifications, Search: nsSearch } });
register({ id: 'ns-mobile', views: { 'Mobile app': () => `<div class="nx-view enter">${nsHead('Mobile app', 'The same CaesarOS on your phone.', 'Telephonum', 'atrium-hero')}<div class="og-wrap"><div class="og-card"><h4>Your phone</h4><p>The phone has no CaesarOS of its own: it opens this one in its browser, as an app you can add to the home screen. Open the address of a running CaesarOS (this device on your network, or a server) on the phone. Pair it once with a code from Devices to sync notes.</p><div class="og-act"><button class="btn ghost" data-ogopen="Devices" style="height:28px;padding:0 10px">Devices</button></div></div></div></div>` } });

/* ---------- events ---------- */
document.addEventListener('keydown', e => { if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); const b = document.querySelector('[data-ns="pin"]'); if (b) b.click(); } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-ns]'); if (!t) return;
  const [k, a, b] = t.dataset.ns.split(':');
  if (k === 'pin') { NS.pin = !NS.pin; document.documentElement.classList.toggle('ns-pinned', NS.pin); try { localStorage.setItem('caesaros-menu-pin', NS.pin ? '1' : '0'); } catch (_) {} t.classList.toggle('on', NS.pin); return; }
  if (k === 'grp') { nxKeep(a); NS.open[a] = !NS.open[a]; t.classList.toggle('open', NS.open[a]); t.nextElementSibling.classList.toggle('open', NS.open[a]); return; }
  if (k === 'more') { NXMORE.on = true; }
  else if (k === 'home') { S.act = Math.max(0, S.tabs.findIndex(x => x.k === 'ws')); }
  else if (k === 'chat') { open_({ k: 'chat', id: S.cur || (THREADS[0] || {}).id || '' }); }
  else if (k === 'crew') { const th = THREADS.find(x => x.a === a) || THREADS[0]; S.cur = th.id; open_({ k: 'chat', id: th.id }); }
  else if (k === 'open-grp') { NS.open[a] = true; const first = NSIA.find(x => x[0] === a)[2].find(x => ogEnabled(x[0])); if (first) open_({ k: 'app', id: first[0] }); }
  else if (k === 'engrefresh') { NSENG.list = null; }
  else if (k === 'appr') { S.waiting.splice(+a, 1); }
  else if (k === 'sc') { NS.sc.has(a) ? NS.sc.delete(a) : NS.sc.add(a); }
  else if (k === 'pal') { NS.pal = a; document.documentElement.dataset.pal = a; try { localStorage.setItem('cx-pal', a); } catch (_) {} ['--p1', '--p1r', '--p2', '--p2r'].forEach(v => document.documentElement.style.removeProperty(v)); try { localStorage.removeItem('caesaros-pack-pal'); } catch (_) {} /* the shell palette's own CSS rules take over from a Settings pack colour */ render(); return; }
  else if (k === 'opt') { NS.opt[a] = b; if (a === 'mo') setMotion(b.toLowerCase()); if (a === 'th') window.caesarosTheme.set(b === 'Neutral' ? 'neutral' : 'caesaros'); }
  else if (k === 'optt') { NS.opt[a] = !NS.opt[a]; }
  else if (k === 'theme') { window.caesarosTheme.toggle(); NS.opt.th = document.documentElement.dataset.theme === 'neutral' ? 'Neutral' : 'CaesarOS'; }
  else return;
  e.stopPropagation(); render();
}, true);

render();

/* ---------- Gateway: our foundation is the Hermes gateway with shared sessions; the model API is a second layer ---------- */
function nsGateway() {
  const off = OGS.mode === 'off';
  const gw = [['VPS', 'https://your-vps.example', 'Remote', off ? ['No network', 'No network', '—'] : ['OK', 'OK', '38 ms'], !off], ['This device', 'http://127.0.0.1:4400', 'Local', ['OK', 'OK', '2 ms'], true]];
  const leg = (n, v) => `<span class="og-tag ${v === 'OK' ? 'sig' : 'mut'}">${n} ${v}</span>`;
  const full = ogGateway(); const i = full.indexOf('<div class="og-grid two">'); const inner = full.slice(i, full.lastIndexOf('</div></div>'));
  return `<div class="nx-view enter">${nsHead('Gateway', 'How CaesarOS connects. Sessions are shared across the Desktop app, the Web app and your phone through the Hermes gateway.', 'Porta', 'herdr')}
  <div class="og-wrap">${ogModeBanner()}
   <div class="og-sec">Session gateways</div>
   <div class="og-list">${gw.map(g => `<div>${I(g[2] === 'Remote' ? 'system' : 'home', 16)}<span>${g[0]} <small>${g[1]} · ${g[2]}</small></span><span class="og-row">${leg('HTTP', g[3][0])}${leg('WebSocket', g[3][1])}<span class="label">${g[3][2]}</span><button class="btn ghost" style="height:26px;padding:0 8px">Test</button></span></div>`).join('')}</div>
   <div class="og-grid two"><div class="og-card"><h4>Shared sessions</h4><p>One list of sessions, grouped by gateway and then by profile. What you start on the Desktop continues on the Web app and the phone.</p><div class="og-kv"><span>Caesar</span><span>6 sessions</span><span>Crew</span><span>14 sessions</span><span>Claude A and B</span><span>5 sessions</span></div></div>
    <div class="og-card"><h4>Connected clients</h4><div class="og-list" style="border:0"><div>${I('terminal', 14)}<span>Desktop app <small>Tauri</small></span><span class="og-tag sig">Live</span></div><div>${I('home', 14)}<span>Web app <small>Browser · tailnet</small></span><span class="og-tag sig">Live</span></div><div>${I('chat', 14)}<span>Phone <small>Your phone · PWA</small></span><span class="og-tag ${off ? 'mut' : 'sig'}">${off ? 'Paused' : 'Live'}</span></div></div></div></div>
   <div class="og-sec">Model API · local engines (second layer)</div>
   <div class="og-banner"><b>Optional</b> An OpenAI-compatible endpoint for the engines on this device, for your own tools. Loopback only and a key by default. It does not replace the session gateway.</div>
   ${inner}
  </div></div>`;
}
register({ id: 'ns-gateway', views: { Gateway: nsGateway } });
render();

/* ---------- first run: nine steps, one idea each (inspired by how the study app leads a new user) ---------- */
const OB = { open: false, step: 0, lvl: 'Balanced', brain: 'new', share: true, conn: new Set(['GitHub']), agents: new Set(['Claude Code A', 'Claude Code B', 'Hermes']), packs: new Set(['Day', 'Knowledge', 'Work']) };
const OBST = ['Welcome', 'Where', 'Engines', 'Brain', 'Connect', 'Agents', 'Apps', 'Devices', 'Ready'];
const obPick = (key, id, title, desc, on, tag) => `<div class="ob-pick ${on ? 'on' : ''}" data-ob="${key}:${OGE(id)}"><span class="ck">${on ? '✓' : ''}</span><div class="og-row"><h4>${OGE(title)}</h4>${tag ? `<span class="og-tag">${OGE(tag)}</span>` : ''}</div><p>${desc}</p></div>`;
function obBody() {
  const s = OB.step;
  if (s === 0) return `${CXLOGO(104)}<h1 class="ob-h">Caesar OS<small>Evolve</small></h1><p class="ob-p">Your troop. Your Brain. Your machines. <b>Local first</b>, and yours: nothing is installed or connected without your yes.</p>`;
  if (s === 1) return `<h1 class="ob-h">Where does it run?</h1><p class="ob-p">Pick a home for your engines and your Brain. You can change it any time, and <b>choosing Local never switches off Claude Code, Codex or Hermes</b>.</p><div class="ob-grid" style="grid-template-columns:repeat(3,1fr)">${obPick('mode', 'local', 'Local', 'Everything on this device. Private, offline-capable, one machine.', OGS.mode === 'local')}${obPick('mode', 'vps', 'VPS and Shared Brain', 'Engines and a backed-up Brain on your server. Work from any device.', OGS.mode === 'vps', 'Recommended')}${obPick('mode', 'off', 'Offline', 'Local engines only and nothing leaves this device.', OGS.mode === 'off')}</div>`;
  if (s === 2) return `<h1 class="ob-h">Your engines</h1><p class="ob-p">CaesarOS looks at this computer and suggests models that fit it. You see every model and its size <b>before anything downloads</b>. Nothing is picked for you.</p><div class="og-card" style="width:100%;text-align:left"><p>Open <b>Models</b> after setup to see what this machine can hold, and <b>Engines</b> to see what answers.</p></div>`;
  if (s === 3) return `<h1 class="ob-h">Start your Brain</h1><p class="ob-p">Notes, memory and recall, shared by you and the crew. Plain markdown files you own.</p><div class="ob-grid" style="grid-template-columns:repeat(2,1fr)">${obPick('brain', 'new', 'A new Brain', 'Start empty here. The crew adds proposals, you accept them.', OB.brain === 'new')}${obPick('brain', 'open', 'Open an existing vault', 'Point it at an Obsidian vault. Files stay where they are.', OB.brain === 'open')}</div><div class="og-card" style="width:100%;text-align:left"><div class="og-row" style="justify-content:space-between"><div><h4>Back it up to the VPS</h4><p>The Shared Brain: a copy on your server, in step with your devices.</p></div><span class="og-sw ${OB.share ? 'on' : ''}" data-ob="share:1"></span></div></div>`;
  if (s === 4) { const C = [['Google', 'Gmail, Calendar, Drive'], ['Microsoft', 'Outlook, Calendar'], ['GitHub', 'Repos and issues'], ['Notion', 'Pages and docs'], ['Linear', 'Issues and cycles'], ['Obsidian', 'Local vaults']]; return `<h1 class="ob-h">Connect your tools</h1><p class="ob-p">Our own tools are already built in. Add the ones you use, or your own server. <b>Accounts are read live and never copied into the Brain.</b> Actions always ask first.</p><div class="ob-grid" style="grid-template-columns:repeat(3,1fr)">${C.map(([n, d]) => obPick('conn', n, n, d, OB.conn.has(n))).join('')}</div><span class="label">Add your own (MCP) and more later in Integrations</span>`; }
  if (s === 5) { const A = [['Claude Code A', 'signed in · 5h window 17%'], ['Claude Code B', 'signed in · 5h window 17%'], ['Codex', 'limit reached · resets in 3 h'], ['Hermes', 'v0.23.2 · gateway running'], ['Local engines', 'ready after setup']]; return `<h1 class="ob-h">Your agents are already here</h1><p class="ob-p">CaesarOS found these on this machine. They keep their own login and network. <b>Nothing here changes them.</b></p><div class="ob-grid" style="grid-template-columns:repeat(2,1fr)">${A.map(([n, d]) => obPick('agent', n, n, d, OB.agents.has(n))).join('')}</div>`; }
  if (s === 6) { const P = [['Day', 'Board, Mail, Schedule, Goals, Daily review'], ['Knowledge', 'Search, Meetings, Folders, Reading, Editor'], ['Work', 'Missions, Builds, Command, Business, Evidence'], ['Make', 'Image Studio, Web tools, Leads'], ['Studio', 'Social desk, Reels, Offer Boards'], ['Private Data', 'Vault, Clipboard, Devices']]; return `<h1 class="ob-h">Start bare. Add what you use.</h1><p class="ob-p">The core is always on: <b>Chat, Crew, Board, Brain, Terminal, Integrations, Models</b>. Add groups now or any time from Add apps.</p><div class="ob-grid" style="grid-template-columns:repeat(2,1fr)">${P.map(([n, d]) => obPick('pack', n, n, d, OB.packs.has(n))).join('')}</div>`; }
  if (s === 7) return `<h1 class="ob-h">Pair your phone</h1><p class="ob-p">Scan the code from the CaesarOS app on your phone, or enter it. Sessions are then shared across Desktop, Web and Phone.</p><div class="ob-qr"></div><div class="og-code" style="font-size:20px;letter-spacing:.3em">CSR-4K7M-2QXA</div><span class="label">You can do this later in Devices</span>`;
  return `<h1 class="ob-h">Ready<small>The troop is listening</small></h1><p class="ob-p">Here is what you chose.</p><div class="og-list" style="width:100%;text-align:left">${[['Runs', OGS.mode === 'vps' ? 'VPS and Shared Brain' : OGS.mode === 'local' ? 'Local' : 'Offline'], ['Engines', 'Models are picked on the Models page, never before you say yes'], ['Brain', (OB.brain === 'new' ? 'New Brain' : 'Existing vault') + (OB.share ? ' · backed up to the VPS' : ' · not backed up')], ['Connected', [...OB.conn].join(', ') || 'Nothing yet'], ['Agents', [...OB.agents].join(', ') || 'None'], ['Apps', 'Core + ' + ([...OB.packs].join(', ') || 'nothing else')]].map(r => `<div style="grid-template-columns:110px 1fr auto"><span class="label">${r[0]}</span><span>${OGE(r[1])}</span><span class="og-tag sig">Set</span></div>`).join('')}</div>`;
}
function obRender() {
  let el = document.getElementById('ob'); if (!el) { el = document.createElement('div'); el.id = 'ob'; document.body.appendChild(el); }
  el.classList.toggle('open', OB.open); if (!OB.open) { el.innerHTML = ''; return; }
  const last = OB.step === OBST.length - 1;
  el.innerHTML = `<div class="ob-top">${OB.step ? CXBRAND : '<span></span>'}<button class="btn ghost" data-ob="skip:1">Skip setup</button></div><div class="ob-main"><div class="ob-col">${obBody()}</div></div><div class="ob-foot"><div class="ob-prog">${OBST.map((n, i) => `<i class="${i === OB.step ? 'on' : i < OB.step ? 'done' : ''}"></i>`).join('')}</div><span class="ob-step">Step ${OB.step + 1} of ${OBST.length} · ${OBST[OB.step]}</span><div class="ob-btns">${OB.step ? '<button class="btn ghost" data-ob="back:1">Back</button>' : ''}<button class="btn" data-ob="next:1">${last ? 'Enter the Atrium' : OB.step === 0 ? 'Begin' : 'Continue'}</button></div></div>`;
}
function obFinish() {
  OB.open = false;
  OGS.setup = { where: true, models: true, brain: true, tool: OB.conn.size > 0, apps: true, device: false };
  ogPreset(OGS.mode); S.act = 0; obRender(); render();
}
document.addEventListener('click', e => {
  const t = e.target.closest('#ob [data-ob]'); if (!t) return;
  const [k, v] = t.dataset.ob.split(/:(.*)/s);
  if (k === 'next') { if (OB.step === OBST.length - 1) return obFinish(); OB.step++; }
  else if (k === 'back') OB.step--;
  else if (k === 'skip') return obFinish();
  else if (k === 'mode') { OGS.mode = v; ogPreset(v); }
  else if (k === 'ob-lvl') OB.lvl = v;
  else if (k === 'brain') OB.brain = v;
  else if (k === 'share') OB.share = !OB.share;
  else if (k === 'conn') OB.conn.has(v) ? OB.conn.delete(v) : OB.conn.add(v);
  else if (k === 'agent') OB.agents.has(v) ? OB.agents.delete(v) : OB.agents.add(v);
  else if (k === 'pack') OB.packs.has(v) ? OB.packs.delete(v) : OB.packs.add(v);
  e.stopPropagation(); obRender();
}, true);
/* replay from Start here */
document.addEventListener('click', e => { if (e.target.closest('[data-obopen]')) { OB.open = true; OB.step = 0; obRender(); } }, true);
obRender();

/* splash: the evolved mark replaces the old portrait; entering the splash starts the first run once */
(function () {
  const bm = document.querySelector('.boot-mark'); if (!bm) return;
  const im = bm.querySelector('img'); if (im) im.outerHTML = CXLOGO(110);
  const w = document.querySelector('#boot .word'); if (w) w.innerHTML = 'CAESAR OS<small style="display:block;margin-top:8px;font:500 10px var(--font-mono);letter-spacing:.4em;color:var(--accent)">EVOLVE</small>';
  const st = document.querySelector('#boot .status-line'); if (st) st.textContent = 'TOUCH TO ENTER';
  let first = true;
  bm.addEventListener('click', () => { if (first) { first = false; setTimeout(() => { OB.open = true; OB.step = 0; obRender(); }, 700); } });
})();
