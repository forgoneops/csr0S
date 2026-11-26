/* Setup (Start): the first thing a person does. About you, the tools you sign in to, your accounts, and the local models
   that let CaesarOS work offline. Everything saves on this machine as you go; nothing is sent anywhere. */
(() => {
  const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
  const put = (u, b) => fetch(u, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const PLATFORMS = [['x', 'X (Twitter)', '@handle'], ['youtube', 'YouTube', '@channel or link'], ['instagram', 'Instagram', '@handle'], ['tiktok', 'TikTok', '@handle'], ['linkedin', 'LinkedIn', 'profile or page link'], ['facebook', 'Facebook', 'page link'], ['threads', 'Threads', '@handle'], ['bluesky', 'Bluesky', 'handle.bsky.social'], ['mastodon', 'Mastodon', '@name@server'], ['reddit', 'Reddit', 'u/name'], ['github', 'GitHub', 'name'], ['pinterest', 'Pinterest', '@handle']];
  const TOOLS = { claude: ['Claude Code', 'Uses your Claude subscription. Run it once and sign in.', 'claude'], codex: ['Codex', 'Uses your ChatGPT subscription. Sign in once.', 'codex login'], hermes: ['Hermes', 'Runs your crew. Choose its model and sign in.', 'hermes model'], gemini: ['Gemini CLI', 'Uses your Google account.', 'gemini'], ollama: ['Ollama', 'Local models: they work with no internet.', 'sudo pacman -S ollama && sudo systemctl enable --now ollama'] };
  const D = { set: null, detect: [], targets: [], hw: null, pull: null, ollama: null, loaded: false, term: false, ex: null, exBusy: false, exErr: '', exHost: '', exPort: '', signing: '', signErr: '' };
  const EXERR = { host_is_required: 'Type the address first, like user@host.', host_invalid: 'That address does not look right. Use user@host or a host name.', tailscale_not_available: 'Tailscale is not running on this machine. Install it and run tailscale up first.', ssh_failed: 'SSH did not accept this machine\'s key. Add your key to the VPS first.', socat_failed: 'socat could not be installed on the VPS (it needs passwordless sudo, or install socat yourself).', unit_failed: 'The forward service did not start on the VPS.', busy: 'A connection is already running.', operator_only: 'Only the person using this machine can connect a VPS.', loopback_only: 'Open CaesarOS on this machine to connect a VPS.' };

  async function load() {
    try {
      const [set, det, tg, hw, pull, term, ex] = await Promise.all([get('/api/settings'), get('/api/detect'), get('/api/chat-targets'), get('/api/hardware'), get('/api/models/pull'), get('/api/terminal').catch(() => ({ enabled: false })), get('/api/expose').catch(() => null)]);
      D.term = !!term.enabled && !!(window.CX && window.CX.runInTerminal); D.ex = ex;
      D.set = set; D.detect = det.engines; D.targets = tg; D.hw = hw; D.pull = pull; D.ollama = tg.find(t => t.id === 'ollama'); D.loaded = true;
    } catch (e) { D.loaded = 'error'; }
  }
  const stateOf = id => {
    const d = D.detect.find(x => x.id === id); const t = D.targets.find(x => x.id === id) || D.targets.find(x => x.id === 'hermes:caesar');
    if (!d || !d.found) return ['off', 'Not installed'];
    if (id === 'hermes') return ['ok', 'Ready'];
    return t && t.ok ? ['ok', 'Ready'] : ['warn', 'Not signed in'];
  };
  const toolRow = id => {
    const [name, why, cmd] = TOOLS[id]; const [cls, label] = stateOf(id);
    return `<li class="su-tool"><span class="su-dot ${cls}"></span><span class="su-tt"><b>${esc(name)}</b><small>${esc(why)}</small>${cls === 'ok' ? '' : `<code>${esc(cmd)}</code>`}${cls === 'warn' && !D.term ? '<small>The terminal is off in this edition, so run this command in your own terminal.</small>' : ''}${D.signing === id && D.signErr ? `<small role="alert">${esc(D.signErr)}</small>` : ''}</span>
      <span class="su-chip ${cls}">${D.signing === id && cls !== 'ok' ? 'Waiting' : label}</span>${cls === 'warn' && D.term ? `<button class="su-btn go" data-su="signin" data-v="${id}">${I('terminal', 16)}<span>Sign in</span></button>` : ''}${cls === 'ok' ? '' : `<button class="su-btn" data-su="copy" data-v="${esc(cmd)}">${I('copy', 16)}<span>Copy command</span></button>`}</li>`;
  };
  const accountVal = p => ((D.set.profile.accounts || []).find(a => a.platform === p) || {}).handle || '';
  const pullBox = (m) => {
    const st = D.pull && D.pull.model === m.model ? D.pull : null; const ready = D.ollama && D.ollama.ok;
    const pct = st && st.total ? Math.round(100 * st.completed / st.total) : 0;
    return `<div class="su-tier"><div><b>${{ quick: 'Quick start', balanced: 'Balanced', max: 'Best quality' }[m.tier] || m.tier}</b><small>${esc(m.model)} · ${m.sizeGb} GB · ${esc(m.why)}</small></div>
      ${st && !st.done && !st.error ? `<div class="su-bar"><i style="width:${pct}%"></i></div><span class="su-chip warn">${pct}%</span><button class="su-btn" data-su="cancel">Cancel</button>`
        : st && st.done ? '<span class="su-chip ok">Installed</span>'
        : st && st.error ? `<span class="su-chip warn" title="${esc(st.error)}">Failed</span><button class="su-btn" data-su="pull" data-v="${esc(m.model)}">Try again</button>`
        : `<button class="su-btn go" data-su="pull" data-v="${esc(m.model)}" ${ready ? '' : 'disabled title="Install Ollama first"'}>${I('download', 16)}<span>Download</span></button>`}</div>`;
  };
  const stepRows = a => `<ul class="su-tools">${a.map(x => `<li class="su-tool"><span class="su-dot ${x.ok ? 'ok' : 'warn'}"></span><span class="su-tt"><b>${esc(x.label)}</b><small>${esc(x.detail)}</small></span></li>`).join('')}</ul>`;
  const vpsCard = () => {
    const x = D.ex; const head = '<h3><span>5</span>Connect to a VPS</h3>';
    if (!x) return `<section class="su-card">${head}<p class="su-note">Open CaesarOS on this machine to connect a VPS.</p></section>`;
    const live = x.configured, steps = D.exBusy || D.exErr ? (x.progress || []) : live ? x.steps : [];
    const err = D.exErr ? `<div class="su-warn" role="alert"><b>${esc(EXERR[D.exErr] || D.exErr)}</b></div>` : '';
    const form = `<form class="su-grid" data-su-vps><label class="su-f"><span>VPS address</span><input class="su-in" data-su-exf="exHost" value="${esc(D.exHost)}" placeholder="user@host" autocomplete="off" autocapitalize="none" spellcheck="false" ${D.exBusy ? 'disabled' : ''}></label>
        <label class="su-f"><span>Port (optional)</span><input class="su-in" data-su-exf="exPort" value="${esc(D.exPort)}" placeholder="${x.localPort}" inputmode="numeric" autocomplete="off" ${D.exBusy ? 'disabled' : ''}></label>
        <button class="su-btn go" type="submit" ${D.exBusy ? 'disabled' : ''}>${I('system', 16)}<span>${D.exBusy ? 'Connecting' : 'Connect'}</span></button></form>`;
    return `<section class="su-card">${head}
      <p class="su-note">Optional. Reach this CaesarOS from your phone or another computer through a VPS you own. It needs Tailscale here and your own SSH key on the VPS. Only the address you type is contacted, and nothing is installed here.</p>
      ${live ? `<p class="su-note" role="status">Connected to ${esc(x.host)} on port ${x.localPort}. Health: <b>${esc(x.health || 'unknown')}</b></p>` : form}
      ${err}${steps.length ? stepRows(steps) : ''}
      ${live ? `<button class="su-btn" data-su="vps-off">${I('stop', 16)}<span>Disconnect</span></button>` : ''}
    </section>`;
  };
  function setupView() {
    if (!D.loaded) { void load().then(() => { if (S.tabs[S.act] && S.tabs[S.act].id === 'Start') render(); }); return `<div class="nx-view enter su">${scene('atrium-hero', 100)}<div class="su-wrap"><p class="su-lead">Loading…</p></div></div>`; }
    if (D.loaded === 'error') return `<div class="nx-view enter su"><div class="su-wrap"><p class="su-lead">The core did not answer. Is it running?</p></div></div>`;
    const p = D.set.profile, olReady = D.ollama && D.ollama.ok;
    return `<div class="nx-view enter su">${scene('atrium-hero', 100)}<div class="su-wrap">
      <header class="su-head su-guide"><div class="su-chibi" aria-hidden="true"><img src="art/caesaros-chibi-guide.webp" alt="" width="132" height="132" decoding="async"></div>
        <div class="su-guide-text"><span class="label">FIRST RUN</span><h2>Set up CaesarOS</h2><p class="su-lead">Ave. I am Caesar. Choose your language, then ask me anything. Everything below is optional, stays on this machine, and you can change it later.</p>
        <div class="st-seg su-langs" role="group" aria-label="Language"><button type="button" class="${(D.set && D.set.language) === 'pl' ? '' : 'on'}" data-su="lang" data-v="en" aria-pressed="${(D.set && D.set.language) !== 'pl'}">English</button><button type="button" class="${(D.set && D.set.language) === 'pl' ? 'on' : ''}" data-su="lang" data-v="pl" aria-pressed="${(D.set && D.set.language) === 'pl'}" lang="pl">Polski</button></div></div></header>

      <section class="su-card"><h3>Ask anything</h3>
        <p class="su-note">Caesar is here now. The setup below is optional and stays while you talk.</p>
        <form class="su-askbar" data-su-ask><input class="su-in" id="su-ask" placeholder="Ask anything" autocomplete="off" aria-label="Ask anything"><button class="su-btn go" type="submit">${I('send', 16)}<span>Send</span></button></form>
      </section>

      <section class="su-card"><h3><span>1</span>About you</h3>
        <label class="su-f"><span>How should I call you?</span><input class="su-in" data-su-save="callMe" value="${esc(p.callMe)}" placeholder="Your name or nickname" autocomplete="off"></label>
        <label class="su-f"><span>What is your business, or what do you work on?</span><input class="su-in" data-su-save="business" value="${esc(p.business || '')}" placeholder="For example: a web studio, a YouTube channel, a clinic" autocomplete="off"></label>
        <label class="su-f"><span>Anything else I should know about you?</span><textarea class="su-in" rows="3" data-su-save="about" placeholder="How you like to work, what you care about, what to avoid">${esc(p.about)}</textarea></label>
      </section>

      <section class="su-card"><h3><span>2</span>Sign in to your tools</h3>
        <p class="su-note">Use the subscriptions you already pay for. Press Sign in: the terminal opens and runs the command, and the row turns Ready by itself when you are done.</p>
        <ul class="su-tools">${['claude', 'codex', 'hermes', 'gemini'].map(toolRow).join('')}</ul>
        <button class="su-btn" data-su="recheck">${I('refresh', 16)}<span>Check again</span></button>
      </section>

      <section class="su-card"><h3><span>3</span>Your accounts</h3>
        <p class="su-note">Where you publish. Saved on this machine only. Posting and live numbers need each service's own key, which you add later under System.</p>
        <div class="su-grid">${PLATFORMS.map(([id, name, ph]) => `<label class="su-f"><span>${esc(name)}</span><input class="su-in" data-su-acct="${id}" value="${esc(accountVal(id))}" placeholder="${esc(ph)}" autocomplete="off"></label>`).join('')}</div>
      </section>

      <section class="su-card"><h3><span>4</span>Work offline</h3>
        <p class="su-note">Local models run on this machine with no internet. This one has ${D.hw.machine.ramGb} GB of memory, ${D.hw.machine.freeDiskGb} GB free disk${D.hw.machine.gpu !== 'none' ? ', ' + D.hw.machine.gpu.toUpperCase() + ' graphics' : ''}.</p>
        ${olReady ? '' : `<div class="su-warn"><b>Ollama is not installed.</b> It runs the local models. Install it once, then come back and download.<code>${esc(TOOLS.ollama[2])}</code><button class="su-btn" data-su="copy" data-v="${esc(TOOLS.ollama[2])}">${I('copy', 16)}<span>Copy command</span></button><button class="su-btn" data-su="recheck">${I('refresh', 16)}<span>Check again</span></button></div>`}
        <div class="su-tiers">${D.hw.advice.map(pullBox).join('')}</div>
      </section>

      ${vpsCard()}

      <footer class="su-foot"><button class="su-btn go big" data-su="finish">${I('check', 18)}<span>Finish and open the Atrium</span></button><small>You can come back to this page any time from Start.</small></footer>
    </div></div>`;
  }
  register({ id: 'setup', views: { Start: setupView } });

  let timer = 0;
  const poll = () => { clearInterval(timer); timer = setInterval(async () => { try { D.pull = await get('/api/models/pull'); } catch { return; } const on = S.tabs[S.act] && S.tabs[S.act].id === 'Start'; if (on && !document.activeElement.matches('input,textarea')) render(); if (!D.pull || D.pull.done || D.pull.error) clearInterval(timer); }, 1500); };

  const onStart = () => S.tabs[S.act] && S.tabs[S.act].id === 'Start';
  const idle = () => !document.activeElement || !document.activeElement.matches('input,textarea');
  // sign-in watch: after Sign in, look again until the row is Ready (or about five minutes pass); coming back to the page looks at once
  let watch = 0, watchEnd = 0;
  const recheck = async () => { await load(); if (D.signing && stateOf(D.signing)[0] === 'ok') { D.signing = ''; D.signErr = ''; clearInterval(watch); } if (onStart() && idle()) render(); };
  const watchSignIn = () => { clearInterval(watch); watchEnd = Date.now() + 300000; watch = setInterval(() => { if (!D.signing || Date.now() > watchEnd) { D.signing = ''; clearInterval(watch); return; } void recheck(); }, 4000); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && D.signing) void recheck(); });
  // VPS: while a connect runs, and while one is live, read /api/expose so each step and the health show as they happen
  let exTimer = 0;
  const watchVps = () => { clearInterval(exTimer); exTimer = setInterval(async () => { if (!D.ex || (!D.exBusy && !D.ex.configured)) { clearInterval(exTimer); return; } try { const x = await get('/api/expose'); D.ex = x; } catch { return; } if (onStart() && idle()) render(); }, D.exBusy ? 1500 : 10000); };
  async function vpsConnect() {
    const host = D.exHost.trim(), port = parseInt(D.exPort, 10);
    D.exErr = ''; D.exBusy = true; D.ex = { ...D.ex, progress: [] }; render(); watchVps();
    try {
      const r = await post('/api/expose', { host, ...(port > 0 ? { port } : {}) }); const b = await r.json().catch(() => ({}));
      if (!r.ok) D.exErr = b.error || 'failed';
    } catch { D.exErr = 'The core did not answer.'; }
    D.exBusy = false; try { D.ex = await get('/api/expose'); } catch { /* keep the last answer */ }
    render(); if (D.ex && D.ex.configured) watchVps();
  }

  // the composer on the Start tab: type and send, and the first answer is two steps from the first screen
  async function ask() {
    const el = document.getElementById('su-ask'); const text = el ? el.value.trim() : '';
    if (!text || !window.CX || !window.CX.ask) return;
    await window.CX.ask(text);
  }
  document.addEventListener('submit', e => {
    if (!e.target.closest || !e.target.closest('[data-su-ask]')) return;
    e.preventDefault(); e.stopPropagation(); void ask();
  }, true);

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-su]'); if (!b) return; e.preventDefault(); e.stopPropagation();
    const a = b.dataset.su;
    if (a === 'copy') { try { await navigator.clipboard.writeText(b.dataset.v); b.querySelector('span').textContent = 'Copied'; setTimeout(() => { if (b.isConnected) b.querySelector('span').textContent = 'Copy command'; }, 1400); } catch { /* clipboard refused */ } }
    else if (a === 'signin') {
      const id = b.dataset.v, cmd = (TOOLS[id] || [])[2]; if (!cmd || id === 'ollama') return;
      D.signing = id; D.signErr = ''; render();
      if (!await window.CX.runInTerminal(cmd)) D.signErr = 'The terminal did not start. Copy the command and run it yourself.'; else watchSignIn();
      render();
    }
    else if (a === 'vps-off') { b.disabled = true; await fetch('/api/expose', { method: 'DELETE' }); D.exErr = ''; try { D.ex = await get('/api/expose'); } catch { /* keep */ } render(); }
    else if (a === 'lang') { await put('/api/settings', { language: b.dataset.v }); if (window.I18N?.setLanguage) await window.I18N.setLanguage(b.dataset.v); try { localStorage.setItem('caesaros-language-choice', b.dataset.v); } catch {} if (D.set) D.set.language = b.dataset.v; document.documentElement.lang = b.dataset.v; render(); }
    else if (a === 'recheck') { b.disabled = true; await load(); render(); }
    else if (a === 'pull') { await post('/api/models/pull', { model: b.dataset.v }); D.pull = await get('/api/models/pull'); render(); poll(); }
    else if (a === 'cancel') { await fetch('/api/models/pull', { method: 'DELETE' }); D.pull = await get('/api/models/pull'); render(); }
    else if (a === 'finish') { await put('/api/settings', { setupDone: true }); S.tabs = [{ k: 'ws' }]; S.act = 0; render(); }
  }, true);
  document.addEventListener('input', e => { const f = e.target.closest && e.target.closest('[data-su-exf]'); if (f) D[f.dataset.suExf] = f.value; });
  document.addEventListener('submit', e => {
    if (!e.target.closest || !e.target.closest('[data-su-vps]')) return;
    e.preventDefault(); e.stopPropagation(); if (!D.exBusy) void vpsConnect();
  }, true);
  document.addEventListener('change', async e => {
    const f = e.target.closest('[data-su-save]'), ac = e.target.closest('[data-su-acct]'); if (!f && !ac || !D.set) return;
    const prof = { ...D.set.profile };
    if (f) prof[f.dataset.suSave] = f.value.trim();
    else { const rest = (prof.accounts || []).filter(x => x.platform !== ac.dataset.suAcct); prof.accounts = ac.value.trim() ? [...rest, { platform: ac.dataset.suAcct, handle: ac.value.trim() }] : rest; }
    const r = await put('/api/settings', { profile: prof }); if (r.ok) D.set = await r.json();
  });

  // the first run opens Start by itself, once, and never traps: Finish or any other page leaves it
  (async () => { try { const s = await get('/api/settings'); if (!s.setupDone && !sessionStorage.getItem('caesaros-setup-seen')) { sessionStorage.setItem('caesaros-setup-seen', '1'); setTimeout(() => { open_({ k: 'app', id: 'Start' }); render(); }, 900); } } catch { /* the core is not up yet */ } })();
})();
