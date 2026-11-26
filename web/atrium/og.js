/* CaesarOS v2 mockup: new pages. DEMO DATA, NOT THE PRODUCT.
   Inspired by the behaviour of a local-first AI desktop app (own design, own words, our look). */
const OGS = { mode: 'vps', mtab: 'This device', lvl: 'Balanced', filt: 'All', gtab: 'curl', gcli: 'Just me', keyreq: true, vaultOpen: false, mcp: false, sec: false };
const OGE = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ogSeg = (key, opts, cur) => `<div class="og-seg">${opts.map(o => `<button class="${o === cur ? 'on' : ''}" data-og="${key}:${OGE(o)}">${OGE(o)}</button>`).join('')}</div>`;
const ogSw = (key, on) => `<span class="og-sw ${on ? 'on' : ''}" data-og="tog:${key}" role="switch" aria-checked="${on}"></span>`;

function ogMode() {
  // only what exists: VPS appears once a gateway is paired
  const M = [['local', 'Local', ''], ...(window.REMOTE ? [['vps', 'VPS', '']] : []), ['off', 'Offline', '']];
  const cur = M.find(m => m[0] === OGS.mode) || M[0];
  return `<div class="og-mode" role="group" aria-label="Where CaesarOS runs" tabindex="0"><span class="cur">${cur[1]}<em>▾</em></span><div class="pop">${M.map(([k, n, r]) => `<button class="${OGS.mode === k ? 'on' : ''}" data-og="mode:${k}" title="${k === 'local' ? 'Everything on this device. Nothing leaves it.' : k === 'vps' ? 'Engine and Shared Brain on your VPS. Recommended.' : 'No network at all. Installed models and files only.'}">${n}${r ? `<i>${r}</i>` : ''}</button>`).join('')}</div></div>`;
}

const ogHead = (name, sub, la) => `${typeof ARTHEAD === 'function' ? ARTHEAD(name) : ''}<div class="nx-phead"><h2>${OGE(name.toUpperCase())}</h2><span class="label">${OGE(la)}</span></div><p style="margin:6px 0 0;color:var(--muted);font-size:13px;max-width:760px">${OGE(sub)}</p>`;

const ogModeBanner = () => OGS.mode === 'off'
  ? `<div class="og-banner"><b>Offline</b> No network. Only installed models, local tools and your files work. The Shared Brain waits to sync.</div>`
  : OGS.mode === 'local'
    ? `<div class="og-banner"><b>Local</b> Everything runs on this device. The Shared Brain stays here. Add the VPS any time to back it up and work from other devices.</div>`
    : `<div class="og-banner"><b>VPS · Shared Brain</b> Engine online on <b style="color:var(--text)">vps-node</b>. The Brain is backed up there and shared with your devices. Last backup 14 min ago.</div>`;

/* ---------- Integrations ---------- */
function ogIntegrations() {
  const own = [['Brain', 'Tabularium', 'Notes, memory, recall. Yours.', 'brain'], ['Board', 'Album', 'Tasks and the crew’s work.', 'planner'], ['Terminal', 'Armilla', 'This device or the VPS.', 'terminal'], ['Vault', 'Arca', 'Passwords and files, locked.', 'lock'], ['Local speech', 'Vox', 'Dictation and transcripts, on device.', 'mic'], ['Crew', 'The Lair', 'Eight agents, one troop.', 'crew']];
  const acc = [['Google', 'Gmail, Calendar, Drive, Contacts', 'G'], ['Microsoft', 'Outlook, Calendar, OneDrive', 'M'], ['Obsidian', 'Notes from your local vaults', 'O']];
  const work = [['Notion', 'Pages, databases, docs', 'N'], ['Linear', 'Issues, projects, cycles', 'L'], ['Jira + Confluence', 'Issues and shared pages', 'J'], ['GitHub', 'Repos, pull requests, issues', 'H']];
  const eng = [['Vercel', 'Deploys, projects, logs', 'V'], ['Cloudflare', 'DNS, Workers, tunnels', 'C']];
  const conn = new Set(['Obsidian', 'GitHub']);
  const f = OGS.filt;
  const show = n => f === 'All' || (f === 'Connected' ? conn.has(n) : !conn.has(n));
  const card = ([n, d, l]) => show(n) ? `<div class="og-card"><h4>${typeof ARTLOGO === 'function' ? ARTLOGO(n) : ''}${OGE(n)}</h4><p>${OGE(d)}</p><div class="og-act">${conn.has(n) ? '<span class="og-tag sig">Connected</span>' : '<span class="og-tag mut">Not connected</span>'}<button class="btn ghost" style="height:28px;padding:0 10px">${n === 'Obsidian' ? 'Choose vault' : conn.has(n) ? 'Manage' : 'Connect'}</button></div></div>` : '';
  const grp = (t, a) => { const h = a.map(card).join(''); return h ? `<div class="og-sec">${t}</div><div class="og-grid">${h}</div>` : ''; };
  return `<div class="nx-view enter">${ogHead('Integrations', 'Our own tools first. Connect anything else you use. Actions run only after you approve them.', 'Connexio')}
  <div class="og-wrap">${ogModeBanner()}
   <div class="og-row" style="justify-content:space-between">${ogSeg('filt', ['All', 'Connected', 'Not connected'], f === 'Disconnected' ? 'Not connected' : f)}<button class="btn" data-og="tog:mcp">+ Add your own (MCP)</button></div>
   ${OGS.mcp ? `<div class="og-card"><h4>Add a custom tool</h4><div class="og-row"><input class="og-input" placeholder="Name"> ${ogSeg('x', ['HTTP / SSE', 'stdio (local)'], 'HTTP / SSE')}</div><div class="og-row"><input class="og-input" style="flex:1" placeholder="https://mcp.example.com/endpoint"><button class="btn">Add</button><button class="btn ghost" data-og="tog:mcp">Cancel</button></div><p>Every tool you add is scanned before it is enabled, and every action it takes asks you first.</p></div>` : ''}
   <div class="og-banner"><b>Trust</b> Accounts are read live when you ask. Nothing from them is copied into the Brain unless you say so.</div>
   ${f === 'All' ? `<div class="og-sec">Own tools · built in · always on</div><div class="og-grid">${own.map(([n, la, d, ic]) => `<div class="og-card"><div class="og-row" style="gap:8px">${I(ic, 18)}<h4>${n}</h4><span class="label" style="margin-left:auto">${la}</span></div><p>${d}</p><div class="og-act"><span class="og-tag">Built in</span><span class="og-tag mut">${n === 'Local speech' ? 'On device' : OGS.mode === 'vps' && n !== 'Vault' && n !== 'Local speech' ? 'Synced' : 'Local'}</span></div></div>`).join('')}</div>` : ''}
   ${grp('Accounts and notes', acc)}${grp('Work tools', work)}${grp('Engineering', eng)}
   <div class="og-sec">Plugins and skills</div><div class="og-card"><h4>Marketplace · Mercatus</h4><p>Hundreds of community plugins and skills. Each one is scanned and shown with findings before you decide. Installing always needs your yes.</p><div class="og-act"><span class="og-tag">Scanned first</span><button class="btn ghost" style="height:28px;padding:0 10px">Browse</button></div></div>
  </div></div>`;
}

/* ---------- Models ---------- */
function ogModels() {
  const lv = { Conservative: ['6.2 GB', 'K2 Horizon 3.7B'], Balanced: ['16.4 GB', 'Bonsai 2 27B'], Extreme: ['31.8 GB', 'Qwen 3.8 27B'] }[OGS.lvl];
  const place = OGS.mtab === 'This device' ? 'This device (Lenovo) · 33 GB RAM' : OGS.mtab === 'VPS' ? 'VPS vps-node · 11 GB RAM, no GPU' : 'iPhone 15 Pro Max · 8 GB RAM';
  const m = (n, mk, sz, d, tags = '', st = '') => `<div class="og-card"><div class="og-row"><h4>${n}</h4>${tags}</div><p>${mk} · ${sz}</p><p>${d}</p><div class="og-act">${st || '<span></span>'}<button class="btn ghost" style="height:28px;padding:0 10px">${st ? 'Settings' : 'Download'}</button></div></div>`;
  return `<div class="nx-view enter">${ogHead('Models', 'Download, switch and manage the models that run on each of your places.', 'Armamentarium')}
  <div class="og-wrap">${ogModeBanner()}
   <div class="og-row">${ogSeg('mtab', ['This device', 'VPS', 'Phone'], OGS.mtab)}<span class="label">${place}</span></div>
   <div class="og-card" style="border-color:var(--accent)"><div class="og-row"><h4>Configure it for me</h4><span class="og-tag">Recommended</span></div><p>Pick how much of this place to use. You see every model and its size before anything downloads.</p>
     <div class="og-row">${ogSeg('lvl', ['Conservative', 'Balanced', 'Extreme'], OGS.lvl)}<span class="label">Chat model: ${lv[1]}</span><span style="margin-left:auto" class="label">${lv[0]} to download</span><button class="btn">${OGS.mode === 'off' ? 'Offline: unavailable' : 'Set up'}</button></div></div>
   <div class="og-row">${ogSeg('x', ['Text', 'Image', 'Video', 'Voice', 'Transcription', 'Embedding', 'Storage'], 'Text')}${ogSeg('x', ['Any', '≤4 GB', '≤8 GB', '≤16 GB'], 'Any')}</div>
   <div class="og-sec">For this place</div>
   <div class="og-grid">${m('K2 Horizon 3.7B', 'IFM', '3.2 GB', 'Strongest small reasoning model, text only.', '<span class="og-tag">Fast</span>')}${m('Qwen 3.8 27B', 'Qwen', '18.8 GB', 'Large general and vision model with tool calling.', '<span class="og-tag sig">Best</span>')}</div>
   <div class="og-sec">Installed</div><div class="og-grid">${m('Bonsai 2 27B', 'Prism ML', '7.8 GB', 'Compact reasoning model with optional vision.', '', '<span class="og-tag sig">Active</span>')}</div>
   ${OGS.mode === 'vps' ? `<div class="og-sec">On the VPS · hosted for you</div><div class="og-grid">${m('Caesar default', 'Provider', 'cloud', 'The model your crew uses today. Switch per profile.', '', '<span class="og-tag sig">In use</span>')}</div>` : ''}
   <div class="og-sec">Available to download</div><div class="og-grid">${m('Qwen 3.5 4B', 'Qwen', '3.8 GB', 'Strong small general model.', '<span class="og-tag mut">Faster replies</span>')}${m('Gemma 4 E2B', 'Google', '4.1 GB', 'Fast, reads images and hears audio.')}${m('Qwen 3.5 0.8B', 'Qwen', '740 MB', 'Tiny, runs on almost anything.')}</div>
  </div></div>`;
}

/* ---------- Gateway ---------- */
function ogGateway() {
  const ex = { curl: 'curl http://127.0.0.1:7878/v1/chat/completions \\\n  -H "Authorization: Bearer $CAESAR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"local","messages":[{"role":"user","content":"Hello"}]}\'', Python: 'from openai import OpenAI\nc = OpenAI(base_url="http://127.0.0.1:7878/v1", api_key=KEY)\nc.chat.completions.create(model="local", messages=[...])', JavaScript: 'const c = new OpenAI({ baseURL: "http://127.0.0.1:7878/v1", apiKey: KEY })' }[OGS.gtab];
  return `<div class="nx-view enter">${ogHead('Gateway', 'One API for every model you run, local or on the VPS. Safe by default.', 'Porta')}
  <div class="og-wrap">${ogModeBanner()}
   <div class="og-grid two">
    <div class="og-card"><div class="og-sec">Address</div><div class="og-code">http://127.0.0.1:7878/v1</div><div class="og-row"><span class="og-tag sig">Loopback only</span><span class="og-tag">Key required</span></div><p>Listens on this device only. Other devices reach it through the VPS or a paired link, never by an open port.</p></div>
    <div class="og-card"><div class="og-sec">Who may use it</div>${ogSeg('gcli', ['Just me', 'Crew', 'Devices'], OGS.gcli)}<p>${OGS.gcli === 'Just me' ? 'Only apps on this device with a key.' : OGS.gcli === 'Crew' ? 'Caesar and the crew use it for their runs, through their own keys.' : 'Your paired phone and the VPS, each with its own key.'}</p><div class="og-row"><span class="label">Keep loaded</span><b style="font:13px var(--font-body)">Bonsai 2 27B</b></div></div>
   </div>
   <div class="og-card"><div class="og-sec">Quick start</div>${ogSeg('gtab', ['curl', 'Python', 'JavaScript'], OGS.gtab)}<div class="og-code">${OGE(ex)}</div></div>
   <div class="og-card"><div class="og-row" style="justify-content:space-between"><div class="og-sec" style="margin:0">API keys</div><span>${ogSw('keyreq', OGS.keyreq)} <span class="label">Require a key</span></span></div>
     <div class="og-list"><div><span class="og-dot ok"></span><span>crew-runs <small>Created 3 days ago · expires in 27 days</small></span><button class="btn ghost" style="height:26px;padding:0 8px">Revoke</button></div><div><span class="og-dot ok"></span><span>iphone <small>Last used 2 hours ago · expires in 12 days</small></span><button class="btn ghost" style="height:26px;padding:0 8px">Revoke</button></div></div>
     <div class="og-row"><input class="og-input" placeholder="New key name: phone, laptop or service"><span class="label">Expires in</span>${ogSeg('x', ['7 days', '30 days', '90 days'], '30 days')}<button class="btn">Create key</button></div>${!OGS.keyreq ? '<div class="og-banner" style="border-color:var(--danger)"><b style="color:var(--danger)">Warning</b> Without a key any program on this device can use your models.</div>' : ''}</div>
   <div class="og-card"><div class="og-sec">Recent calls</div><div class="og-list">${[['chat', 'Bonsai 2 27B', '1,204 tokens', '3.1 s', 'crew-runs'], ['embed', 'MiniLM', '96 tokens', '0.1 s', 'brain'], ['speech', 'Whisper base', '41 s audio', '2.4 s', 'voice']].map(r => `<div><span class="og-dot ok"></span><span>${r[0]} · ${r[1]} <small>${r[4]}</small></span><small>${r[2]} · ${r[3]}</small></div>`).join('')}</div><div class="og-row" style="justify-content:space-between"><span class="label">Every call is logged here, with cost on the VPS</span><button class="btn" style="background:var(--danger);border-color:var(--danger)">Stop everything</button></div></div>
   <div class="og-card"><div class="og-sec">Endpoints</div><div class="og-list">${[['POST', 'Chat (text and vision)', '/v1/chat/completions'], ['POST', 'Text to image', '/v1/images'], ['POST', 'Speech to text', '/v1/audio/transcriptions'], ['POST', 'Text to speech', '/v1/audio/speech'], ['POST', 'Embeddings', '/v1/embeddings'], ['GET', 'Models', '/v1/models']].map(e => `<div><span class="og-tag mut">${e[0]}</span><span>${e[1]}</span><small>${e[2]}</small></div>`).join('')}</div></div>
  </div></div>`;
}

/* ---------- Vault ---------- */
function ogVault() {
  return `<div class="nx-view enter">${ogHead('Vault', 'Passwords, cards, notes and files, encrypted on this device. The Brain never reads it.', 'Arca')}
  <div class="og-wrap">${OGS.vaultOpen ? `<div class="og-list">${[['GitHub', 'example-org', 'Login'], ['Hosting panel', 'ops@example.com', 'Login'], ['Backup passphrase', 'Secure note', 'Note'], ['Studio licence', 'File', 'File']].map(r => `<div>${I('lock', 16)}<span>${r[0]} <small>${r[1]}</small></span><span class="og-tag mut">${r[2]}</span></div>`).join('')}</div><div class="og-row"><button class="btn ghost" data-og="vault:lock">Lock</button><span class="label">Opened with your master password · auto-locks in 5 min</span></div>`
    : `<div class="og-lock">${I('lock', 34)}<h3 style="margin:0">Your vault is locked</h3><input class="og-input" type="password" placeholder="Master password"><button class="btn" data-og="vault:open">Unlock</button><p style="margin:0;color:var(--muted);font-size:12px">Stored through the system Secret Service. Not shared with the VPS unless you choose to.</p></div>`}
  </div></div>`;
}

/* ---------- Clipboard ---------- */
function ogClipboard() {
  const rows = [['Text', 'The review is attached, please check section 3 and reply by Friday.', '3 min'], ['Link', 'github.com/example-org/caesaros', '9 min'], ['Image', 'Screenshot 2026-11-21 17:40', '14 min'], ['Skipped', 'Looks like an access key. Not stored.', '21 min']];
  return `<div class="nx-view enter">${ogHead('Clipboard', 'Everything you copy, searchable and ready to paste again. Secrets are never kept.', 'Fasces')}
  <div class="og-wrap"><div class="og-row">${ogSeg('x', ['All', 'Text', 'Rich text', 'Image', 'File'], 'All')}<span class="label" style="margin-left:auto">Ctrl Shift C</span></div>
   <div class="og-list">${rows.map(r => `<div>${I(r[0] === 'Image' ? 'image' : r[0] === 'Skipped' ? 'alert' : 'folder', 16)}<span>${OGE(r[1])} <small>${r[2]} ago · this device</small></span><span class="og-tag ${r[0] === 'Skipped' ? '' : 'mut'}">${r[0]}</span></div>`).join('')}</div>
   <div class="og-banner"><b>Privacy</b> Passwords, keys and tokens are detected and skipped. History stays on this device unless the VPS is on and you turn on sharing.</div></div></div>`;
}

/* ---------- Devices ---------- */
function ogDevices() {
  const brainState = OGS.mode === 'vps' ? ['Synced', 'Last backup 14 min ago · 2,418 notes · 31 MB', 'sig'] : OGS.mode === 'local' ? ['Local only', 'Not backed up. Add the VPS to protect it.', ''] : ['Waiting', 'Offline. Will sync when the network returns.', 'mut'];
  return `<div class="nx-view enter">${ogHead('Devices', 'Your devices and the VPS, paired once, encrypted, nothing in the open.', 'Castra')}
  <div class="og-wrap">${ogModeBanner()}
   <div class="og-card" style="border-color:var(--accent)"><div class="og-row"><h4>Shared Brain</h4><span class="og-tag ${brainState[2]}">${brainState[0]}</span></div><p>${brainState[1]}</p><div class="og-row"><button class="btn" ${OGS.mode === 'vps' ? '' : 'disabled style="opacity:.5"'}>Back up now</button><button class="btn ghost">Restore from VPS</button><button class="btn ghost">Choose what is shared</button></div></div>
   <div class="og-sec">This device</div>
   <div class="og-card"><div class="og-row"><h4>Lenovo · this-device</h4><span class="og-tag sig">This device</span></div><div class="og-row"><span>${ogSw('disc', true)} <span class="label">Visible to new devices</span></span><span>${ogSw('near', true)} <span class="label">Look for devices</span></span><span class="label">Pairing code on request</span></div></div>
   <div class="og-sec">Paired</div>
   <div class="og-list"><div>${I('system', 16)}<span>VPS · vps-node <small>${OGS.mode === 'off' ? 'Offline' : 'Connected through the tailnet'}</small></span><span class="og-tag ${OGS.mode === 'vps' ? 'sig' : 'mut'}">${OGS.mode === 'vps' ? 'Online' : 'Idle'}</span></div><div>${I('chat', 16)}<span>iPhone 15 Pro Max <small>Last connected 2 hours ago</small></span><span class="og-tag sig">Connected</span></div><div>${I('alert', 16)}<span>Old tablet <small>This device no longer holds the pairing. Enter the code it shows to pair again.</small></span><button class="btn ghost" style="height:26px;padding:0 8px">Pair</button></div></div>
  </div></div>`;
}

const OG = { Integrations: ogIntegrations, Models: ogModels, Gateway: ogGateway, Vault: ogVault, Clipboard: ogClipboard, Devices: ogDevices };

document.addEventListener('click', e => {
  const t = e.target.closest('[data-og]'); if (!t) return;
  const [k, v] = t.dataset.og.split(/:(.*)/s);
  if (k === 'mode') { OGS.mode = v; if (typeof ogPreset === 'function') ogPreset(v); } else if (k === 'filt') OGS.filt = v; else if (k === 'mtab') OGS.mtab = v; else if (k === 'lvl') OGS.lvl = v; else if (k === 'gtab') OGS.gtab = v; else if (k === 'gcli') OGS.gcli = v;
  else if (k === 'tog') { if (v.startsWith('bi') && OGS[v] === undefined) OGS[v] = true; OGS[v] = !OGS[v]; } else if (k === 'vault') OGS.vaultOpen = v === 'open'; else return;
  render();
});

/* ---------- workspace widgets ---------- */
function ogWBrain() {
  const on = OGS.mode === 'vps';
  return `<div style="display:grid;gap:8px;padding:2px"><div class="og-row"><span class="og-tag ${on ? 'sig' : OGS.mode === 'off' ? 'mut' : ''}">${on ? 'Synced' : OGS.mode === 'off' ? 'Waiting' : 'Local only'}</span><span class="label">${on ? 'VPS vps-node' : 'This device'}</span></div><div style="font:500 26px var(--font-display)">2,418 <small style="font:11px var(--font-mono);color:var(--muted)">NOTES</small></div><div class="og-kv"><span>Last backup</span><span>${on ? '14 min ago' : 'Never'}</span><span>Devices</span><span>Lenovo, iPhone${on ? ', VPS' : ''}</span></div></div>`;
}
function ogWModels() {
  return `<div style="display:grid;gap:8px;padding:2px"><div class="og-row"><span class="og-tag sig">Active</span><b style="font:13px var(--font-body)">Bonsai 2 27B</b></div><div class="og-kv"><span>Fast pick</span><span>K2 Horizon 3.7B</span><span>Best pick</span><span>Qwen 3.8 27B</span><span>Place</span><span>This device · 33 GB</span></div><div class="og-row"><button class="btn ghost" style="height:28px;padding:0 10px" data-og="mtab:This device">Configure it for me</button></div></div>`;
}
function ogWGateway() {
  return `<div style="display:grid;gap:8px;padding:2px"><div class="og-row"><span class="og-tag sig">Loopback only</span><span class="og-tag">Key required</span></div><div class="og-kv"><span>Calls today</span><span>1,842</span><span>Tokens</span><span>2.1 M</span><span>Cost</span><span>${OGS.mode === 'vps' ? '$0.84 on the VPS' : 'free, local'}</span></div></div>`;
}

/* ---------- start bare, add and add: modules, groups, setup ---------- */
const OGCORE = new Set(['Chat', 'Crew', 'Board', 'Memory', 'Terminal', 'Integrations', 'Models', 'Gateway', 'Marketplace']);
const OGCAT = {
  Talk: [['Grill me', 'Interview that sharpens a plan'], ['Social', 'Posts and replies, drafted for you']],
  Day: [['Mail', 'Inbox with drafts you approve'], ['Schedule', 'Calendar and reminders'], ['Goals', 'What you want this quarter'], ['Daily review', 'A morning brief from your real day'], ['Watchers', 'Pages and feeds, checked by script first']],
  Knowledge: [['Folders', 'Your files, organised'], ['Reading', 'A reading queue'], ['Library', 'Books and papers'], ['Media Gallery', 'Images and video'], ['Meetings', 'Record, transcribe, write up'], ['Editor', 'Write in plain markdown']],
  Work: [['Business', 'Money, clients, goals'], ['Builds', 'The forge: builds and tests'], ['Missions', 'Plan, approve, run, deliver'], ['Evidence', 'Proof for every claim']],
  Make: [['Reels', 'Short films from one sentence'], ['Web tools', 'Small sites and pages'], ['Leads', 'Find people worth writing to']],
  'Private Data': [['Vault', 'Passwords and files, locked'], ['Clipboard', 'Every copy, secrets skipped'], ['Devices', 'Pair devices, Shared Brain']],
  System: [['Fleet', 'Servers you run for others, read only'], ['Usage', 'What your models cost'], ['Health', 'Is everything running'], ['Skills', 'What the crew can do']]
};
OGS.mods = new Set(['Mail', 'Schedule', 'Daily review', 'Meetings', 'Editor', 'Vault', 'Devices', 'Usage', 'Health', 'Skills']);
OGS.setup = { where: true, models: true, brain: true, tool: false, apps: false, device: false };
const ogEnabled = n => OGCORE.has(n) || OGS.mods.has(n);

function ogSetupList() {
  const st = OGS.setup;
  const steps = [['where', 'Choose where it runs', 'Local, VPS or Offline', 'Devices'], ['models', 'Set up your models', 'Configure it for me', 'Models'], ['brain', 'Start the Brain', 'Notes, memory, recall', 'Memory'], ['tool', 'Connect a tool', 'Mail, Notion, GitHub or your own', 'Integrations'], ['apps', 'Add apps you need', 'Only what you use', 'Marketplace'], ['device', 'Pair a device', 'Phone, laptop, the VPS', 'Devices']];
  const done = steps.filter(s => st[s[0]]).length;
  return `<div class="og-card"><div class="og-row" style="justify-content:space-between"><h4>Setup</h4><span class="label">${done} of ${steps.length} done</span></div><div style="height:4px;background:var(--line)"><div style="height:4px;width:${done / steps.length * 100}%;background:var(--accent)"></div></div><div class="og-list">${steps.map(s => `<div><span class="og-dot ${st[s[0]] ? 'ok' : ''}"></span><span>${s[1]} <small>${s[2]}</small></span>${st[s[0]] ? '<span class="og-tag sig">Done</span>' : `<button class="btn ghost" style="height:26px;padding:0 8px" data-ogopen="${s[3]}" data-ogdone="${s[0]}">Do it</button>`}</div>`).join('')}</div></div>`;
}

OGS.msrc = 'Apps';
const OGBUILT = [['Cohors', 'Delegation: the crew works in parallel, three children at a time.', 1], ['Approvals host', 'One place where every approval settles exactly once.', 1], ['Dispatcher', 'Routes work to the right crew member and model.', 1], ['Claude bridge', 'Claude A and B accounts, limits, failover.', 0], ['Shared Brain bridge', 'Backs up and syncs the Brain with the VPS.', 0], ['Notify', 'Tells you when something needs you.', 1], ['Command guard', 'Blocks risky commands before they run.', 1], ['Curator', 'Proposes notes and links; you accept.', 0]];
const OGHERMES = [['Foreman', 'Checks test evidence before Git actions.', 'Clean'], ['Preflight', 'Runs every command in a throwaway copy first.', 'Clean'], ['Plan Mode', 'Gates edits until you approve.', 'Needs review'], ['Memory Wiki', 'Turns chat history into browsable pages.', 'Clean'], ['Fish Audio', 'Voice that talks back.', 'Clean']];
function ogMarketplace() {
  const total = Object.values(OGCAT).flat().length;
  const on = Object.values(OGCAT).flat().filter(([n]) => OGS.mods.has(n)).length;
  const src = OGS.msrc;
  let body = '';
  if (src === 'Apps') body = ogSetupList() + Object.entries(OGCAT).map(([g, l]) => `<div class="og-sec">${g}</div><div class="og-grid">${l.map(([n, d]) => `<div class="og-card"><h4>${n}</h4><p>${d}</p><div class="og-act">${OGS.mods.has(n) ? '<span class="og-tag sig">Added</span>' : '<span class="og-tag mut">Not added</span>'}<button class="btn ${OGS.mods.has(n) ? 'ghost' : ''}" style="height:28px;padding:0 10px" data-og="mod:${OGE(n)}">${OGS.mods.has(n) ? 'Remove' : 'Add'}</button></div></div>`).join('')}</div>`).join('');
  else if (src === 'Caesar built-ins') body = `<div class="og-banner"><b>Built on Hermes</b> These plugins ship with CaesarOS and extend Hermes into Caesar. Core ones cannot be removed.</div><div class="og-grid">${OGBUILT.map(([n, d, c]) => `<div class="og-card"><div class="og-row"><h4>${n}</h4><span class="og-tag ${c ? '' : 'mut'}">${c ? 'Core' : 'Optional'}</span></div><p>${d}</p><div class="og-act"><span class="og-tag sig">Built in</span>${c ? '<span class="label">Always on</span>' : `<span>${ogSw('bi' + n, OGS['bi' + n] !== false)}</span>`}</div></div>`).join('')}</div>`;
  else if (src === 'Hermes plugins') body = `<div class="og-banner"><b>Community</b> Plugins and skills from the Hermes catalog. Each one is scanned first and shown with its findings. Installing needs your yes.</div><div class="og-grid">${OGHERMES.map(([n, d, sc]) => `<div class="og-card"><div class="og-row"><h4>${n}</h4><span class="og-tag ${sc === 'Clean' ? 'sig' : ''}">Scan: ${sc}</span></div><p>${d}</p><div class="og-act"><span class="og-tag mut">Hermes plugin</span><button class="btn ghost" style="height:28px;padding:0 10px">Review and add</button></div></div>`).join('')}</div>`;
  else body = `<div class="og-card"><h4>Connectors (MCP)</h4><p>Accounts, work tools and your own servers live on the Integrations page, next to our own tools.</p><div class="og-act"><span></span><button class="btn" data-ogopen="Integrations">Open Integrations</button></div></div>`;
  return `<div class="nx-view enter"><div class="nx-phead"><h2>ADD APPS</h2><span class="label">Mercatus</span></div><p style="margin:6px 0 0;color:var(--muted);font-size:13px;max-width:780px">CaesarOS starts bare. Add only what you use. Our own built-ins, Hermes plugins and connectors all grow it the same way. Nothing is installed without your yes.</p>
  <div class="og-wrap"><div class="og-row" style="justify-content:space-between">${ogSeg('src', ['Apps', 'Caesar built-ins', 'Hermes plugins', 'Connectors'], src)}${src === 'Apps' ? `<span class="og-row"><span class="label">${on} of ${total} optional apps added</span><button class="btn ghost" data-og="fresh:1">Show a fresh install</button></span>` : ''}</div>${body}</div></div>`;
}
OG.Marketplace = ogMarketplace;

function ogWSetup() {
  const st = OGS.setup, vals = Object.values(st), done = vals.filter(Boolean).length;
  const next = [['tool', 'Connect a tool', 'Integrations'], ['apps', 'Add apps you need', 'Marketplace'], ['device', 'Pair a device', 'Devices']].find(x => !st[x[0]]);
  return `<div style="display:grid;gap:8px;padding:2px"><div style="font:500 26px var(--font-display)">${done}<small style="font:11px var(--font-mono);color:var(--muted)"> OF ${vals.length} STEPS</small></div><div style="height:4px;background:var(--line)"><div style="height:4px;width:${done / vals.length * 100}%;background:var(--accent)"></div></div>${next ? `<div class="og-row"><span class="label">Next</span><b style="font:13px var(--font-body)">${next[1]}</b></div><button class="btn ghost" style="height:28px;padding:0 10px" data-ogopen="${next[2]}" data-ogdone="${next[0]}">Continue</button>` : '<span class="og-tag sig">All set</span>'}</div>`;
}

document.addEventListener('click', e => {
  const o = e.target.closest('[data-ogopen]');
  if (o) { if (o.dataset.ogdone) OGS.setup[o.dataset.ogdone] = true; S.flyout = null; open_({ k: 'app', id: o.dataset.ogopen }); render(); return; }
  const t = e.target.closest('[data-og]'); if (!t) return;
  const [k, v] = t.dataset.og.split(/:(.*)/s);
  if (k === 'src') { OGS.msrc = v; render(); }
  else if (k === 'mod') { OGS.mods.has(v) ? OGS.mods.delete(v) : OGS.mods.add(v); OGS.setup.apps = OGS.mods.size > 0; render(); }
  else if (k === 'fresh') { OGS.mods = new Set(); OGS.setup = { where: true, models: false, brain: false, tool: false, apps: false, device: false }; render(); }
});

/* ---------- Split v2: windows you can arrange, swap, resize, save ---------- */
const OGLAY = {
  '2col': { n: 2, cells: [[1, 1], [1, 1]], cols: 'minmax(0,1fr) minmax(0,1fr)', areas: "'a b'", gut: ['col'], name: 'Two columns' },
  '3col': { n: 3, cells: [[1, 1], [1, 1], [1, 1]], cols: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', areas: "'a b c'", gut: [], name: 'Three columns' },
  '2x2': { n: 4, cells: [[1, 1], [1, 1], [1, 1], [1, 1]], cols: 'minmax(0,1fr) minmax(0,1fr)', areas: "'a b' 'c d'", gut: [], name: 'Four windows' },
  'main': { n: 3, cells: [[1, 2], [1, 1], [1, 1]], cols: 'var(--r,62%) 1fr', areas: "'a b' 'a c'", gut: ['col'], name: 'Main and two' },
  'rows': { n: 2, cells: [[1, 1], [1, 1]], cols: '1fr', areas: "'a' 'b'", gut: ['row'], name: 'Top and bottom' }
};
const OGAREA = ['a', 'b', 'c', 'd'];
OGS.sp = { on: false, layout: '2col', panes: [], act: 0, ratio: 55, menu: null, max: null, saved: [{ n: 'Review', layout: '2col', panes: [{ k: 'chat', id: 't3' }, { k: 'app', id: 'Board' }] }, { n: 'Build', layout: 'main', panes: [{ k: 'chat', id: 't2' }, { k: 'term' }, { k: 'app', id: 'Builds' }] }], drag: null };

const ogName = x => x.k === 'ws' ? 'Workspace · ' + WSN[S.ws] : x.k === 'chat' ? (C[(THR(x.id)||{}).a].n + ' · ' + (THR(x.id)||{t:"New conversation"}).t.slice(0, 26)) : x.k === 'term' ? 'Terminal' : x.k === 'app' ? x.id : 'Empty';
const ogDefaults = () => { const cur = S.tabs[S.act] || { k: 'ws' }; const a = cur.k === 'chat' ? { k: 'ws' } : cur; return [a, { k: 'chat', id: S.cur }, { k: 'app', id: 'Board' }, { k: 'term' }]; };
function ogFill() { const sp = OGS.sp, L = OGLAY[sp.layout], d = ogDefaults(); sp.panes = sp.panes.slice(0, L.n); for (let i = sp.panes.length; i < L.n; i++) sp.panes.push(d[i] || { k: 'empty' }); if (sp.act >= L.n) sp.act = 0; }

function ogTermView() { return `<div class="og-pb"><div class="og-term"><div><span class="p">caesar@vps:~/caesar$</span> git status</div><div>On branch shell/integrate</div><div>nothing to commit, working tree clean</div><div><span class="p">caesar@vps:~/caesar$</span> bun test</div><div>285 pass &nbsp;0 fail &nbsp;988 assertions &nbsp;across 40 files</div><div><span class="p">caesar@vps:~/caesar$</span> <span style="opacity:.6">_</span></div><div style="margin-top:10px;color:var(--muted)">prototype terminal · host: VPS</div></div></div>`; }
function ogPaneBody(x, frac) {
  if (x.k === 'term') return ogTermView();
  if (x.k === 'empty') return `<div class="og-empty"><span class="label">Empty window</span><button class="btn ghost" data-sp="menu:EMPTY">Choose what goes here</button></div>`;
  const cw = ($('.nx-main') && $('.nx-main').clientWidth) || (innerWidth - 292);
  OGS.paneW = Math.max(320, cw * frac - 30);
  const h = viewFor(x); OGS.paneW = 0; return h;
}
function ogMenuHtml(i) {
  const apps = ['Board', 'Mail', 'Schedule', 'Memory', 'Models', 'Integrations', 'Gateway', 'Devices', 'Builds', 'Marketplace'].filter(ogEnabled);
  return `<div class="og-menu" data-menu><div class="og-sec">Put here</div><button data-sp="set:${i}:ws:">Workspace · ${WSN[S.ws]}</button><button data-sp="set:${i}:term:">Terminal</button><div class="og-sec">Chats</div>${THREADS.slice(0, 4).map(t => `<button data-sp="set:${i}:chat:${t.id}">${C[t.a].n}<small style="color:var(--muted)">${OGE(t.t.slice(0, 22))}</small></button>`).join('')}<div class="og-sec">Apps</div>${apps.map(a => `<button data-sp="set:${i}:app:${OGE(a)}">${OGE(a)}</button>`).join('')}</div>`;
}
function ogSplitHtml() {
  const sp = OGS.sp; ogFill(); const L = OGLAY[sp.layout];
  const lay = Object.entries(OGLAY).map(([k, v]) => `<button class="og-lay ${sp.layout === k ? 'on' : ''}" data-sp="layout:${k}" title="${v.name}" style="grid-template-columns:${v.cols.includes('var') ? '2fr 1fr' : v.cols.replace(/var\(--r,\d+%\)/, '2fr')};grid-template-rows:${v.areas.split("' '").length > 1 ? '1fr 1fr' : '1fr'}">${v.cells.map((c, i) => `<i style="${k === 'main' && i === 0 ? 'grid-row:1/3' : ''}"></i>`).join('')}</button>`).join('');
  const frac = L.gut.includes('col') ? sp.ratio / 100 : L.cols.split(' ').length === 3 ? .33 : L.cols.split(' ').length === 2 ? .5 : 1;
  const panes = sp.max != null ? [sp.max] : sp.panes.map((_, i) => i);
  const body = panes.map(i => { const x = sp.panes[i]; return `<section class="og-pane ${sp.act === i ? 'act' : ''}" data-spi="${i}" style="grid-area:${sp.max != null ? 'a' : OGAREA[i]}"><header class="og-ph" draggable="true" data-spdrag="${i}"><b data-sp="menu:${i}">${I(x.k === 'term' ? 'terminal' : x.k === 'chat' ? 'chat' : x.k === 'ws' ? 'home' : 'folder', 14)} ${OGE(ogName(x))} <span style="opacity:.6">▾</span></b><span class="sp"></span><button data-sp="swap:${i}" title="Swap with the next window">⇄</button><button data-sp="max:${i}" title="${sp.max != null ? 'Restore' : 'Maximise'}">${sp.max != null ? '▭' : '⤢'}</button><button data-sp="close:${i}" title="Close window">×</button></header>${sp.menu === i ? ogMenuHtml(i) : ''}<div class="og-pb">${ogPaneBody(x, sp.max != null ? 1 : frac)}</div></section>`; }).join('');
  const gut = sp.max == null ? L.gut.map(g => `<div class="og-gut ${g}" data-gut="${g}" style="${g === 'col' ? `left:calc(${sp.ratio}% + 0px)` : `top:calc(${sp.ratio}% + 0px)`}"></div>`).join('') : '';
  const style = sp.max != null ? 'grid-template-columns:1fr;grid-template-areas:\'a\'' : `grid-template-columns:${L.cols.replace('var(--r,62%)', sp.ratio + '%')};${sp.layout === 'rows' ? `grid-template-rows:${sp.ratio}% 1fr;` : ''}grid-template-areas:${L.areas}`;
  return `<div class="og-splitwrap"><div class="og-spbar"><span class="label">Windows</span>${lay}<span class="label" style="margin-left:6px">Mine</span>${sp.saved.map((s, i) => `<button class="og-chip" data-sp="load:${i}">${OGE(s.n)}</button>`).join('')}<button class="og-chip" data-sp="save:1">+ Save this layout</button><span style="flex:1"></span><span class="label">Drag a title to swap · drag the edge to resize</span><button class="btn ghost" style="height:28px;padding:0 10px" data-sp="off:1">Close split</button></div><div class="nx-views og-split" id="ogsplit" style="${style}">${body}${gut}</div></div>`;
}
document.addEventListener('click', e => {
  const sp0 = e.target.closest('[data-nx="split"]');
  if (sp0) { e.preventDefault(); e.stopImmediatePropagation(); const sp = OGS.sp; sp.on = !sp.on; if (sp.on) { sp.panes = []; sp.max = null; sp.menu = null; ogFill(); } render(); return; }
  const pn = e.target.closest('.og-pane'); const t = e.target.closest('[data-sp]');
  if (!t) { if (pn) { OGS.sp.act = +pn.dataset.spi; if (OGS.sp.menu != null && !e.target.closest('[data-menu]')) { OGS.sp.menu = null; render(); } } else if (OGS.sp.menu != null && !e.target.closest('[data-menu]')) { OGS.sp.menu = null; render(); } return; }
  const sp = OGS.sp, [k, a, b, c] = t.dataset.sp.split(':');
  if (k === 'layout') { sp.layout = a; sp.max = null; ogFill(); }
  else if (k === 'menu') { sp.menu = sp.menu === +a ? null : (a === 'EMPTY' ? (+t.closest('.og-pane').dataset.spi) : +a); }
  else if (k === 'set') { const i = +a; sp.panes[i] = b === 'ws' ? { k: 'ws' } : b === 'term' ? { k: 'term' } : b === 'chat' ? { k: 'chat', id: c } : { k: 'app', id: c }; if (b === 'chat') S.cur = c; sp.menu = null; }
  else if (k === 'swap') { const i = +a, j = (i + 1) % sp.panes.length; [sp.panes[i], sp.panes[j]] = [sp.panes[j], sp.panes[i]]; }
  else if (k === 'max') { sp.max = sp.max != null ? null : +a; }
  else if (k === 'close') { const i = +a; sp.panes[i] = { k: 'empty' }; if (sp.max != null) sp.max = null; }
  else if (k === 'load') { const s = sp.saved[+a]; sp.layout = s.layout; sp.panes = JSON.parse(JSON.stringify(s.panes)); sp.max = null; ogFill(); }
  else if (k === 'save') { sp.saved.push({ n: 'Mine ' + (sp.saved.length - 1), layout: sp.layout, panes: JSON.parse(JSON.stringify(sp.panes)) }); }
  else if (k === 'off') { sp.on = false; }
  e.stopPropagation(); render();
}, true);
/* resize by dragging the edge */
document.addEventListener('mousedown', e => {
  const g = e.target.closest('.og-gut'); if (!g) return; e.preventDefault(); g.classList.add('drag');
  const box = $('#ogsplit').getBoundingClientRect(), col = g.dataset.gut === 'col';
  const mv = ev => { const r = Math.min(80, Math.max(20, ((col ? ev.clientX - box.left : ev.clientY - box.top) / (col ? box.width : box.height)) * 100)); OGS.sp.ratio = Math.round(r); const el = $('#ogsplit'); if (OGS.sp.layout === 'rows') el.style.gridTemplateRows = r + '% 1fr'; else el.style.gridTemplateColumns = r + '% 1fr'; g.style[col ? 'left' : 'top'] = r + '%'; };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); render(); };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
});
/* drag a window title onto another to swap */
document.addEventListener('dragstart', e => { const h = e.target.closest('[data-spdrag]'); if (!h) return; OGS.sp.drag = +h.dataset.spdrag; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'pane'); } catch (_) {} });
document.addEventListener('dragover', e => { const p = e.target.closest('.og-pane'); if (p && OGS.sp.drag != null) { e.preventDefault(); $$('.og-pane.dragover').forEach(x => x.classList.remove('dragover')); p.classList.add('dragover'); } });
document.addEventListener('drop', e => { const p = e.target.closest('.og-pane'); if (!p || OGS.sp.drag == null) return; e.preventDefault(); const i = OGS.sp.drag, j = +p.dataset.spi, a = OGS.sp.panes; [a[i], a[j]] = [a[j], a[i]]; OGS.sp.drag = null; render(); });
document.addEventListener('dragend', () => { OGS.sp.drag = null; $$('.og-pane.dragover').forEach(x => x.classList.remove('dragover')); });
