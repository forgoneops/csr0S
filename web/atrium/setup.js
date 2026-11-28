/* Setup (Start): the first thing a person does. About you, the tools you sign in to, your accounts, and the local models
   that let CaesarOS work offline. Everything saves on this machine as you go; nothing is sent anywhere. */
(() => {
  const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
  const put = (u, b) => fetch(u, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const PLATFORMS = [['x', 'X (Twitter)', '@handle'], ['youtube', 'YouTube', '@channel or link'], ['instagram', 'Instagram', '@handle'], ['tiktok', 'TikTok', '@handle'], ['linkedin', 'LinkedIn', 'profile or page link'], ['facebook', 'Facebook', 'page link'], ['threads', 'Threads', '@handle'], ['bluesky', 'Bluesky', 'handle.bsky.social'], ['mastodon', 'Mastodon', '@name@server'], ['reddit', 'Reddit', 'u/name'], ['github', 'GitHub', 'name'], ['pinterest', 'Pinterest', '@handle']];
  const groups = () => window.MODULE_GROUPS || [];
  const moduleKey = name => 'app-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const PLUGIN_OF = { Business: 'business', Fleet: 'fleet', Leads: 'leads', Ideas: 'ideas', Scheduling: 'scheduling', 'Tool graph': 'toolgraph', Finance: 'finance', Goals: 'goals' };
  const moduleOn = (name, settings) => {
    const group = groups().find(g => g.apps.includes(name));
    return !(settings.disabledModules || []).includes(moduleKey(name)) && ((settings.enabledModules || []).includes(moduleKey(name)) || !!(group && group.defaults.includes(name)));
  };
  const moduleCard = settings => `<section class="su-card su-modules"><h3><span>6</span>Choose your tools</h3><p class="su-note">Each switch adds or removes tools from its workspace. Turn on only what you need. Business tools start empty.</p>${groups().map(g => `<fieldset class="su-module-group"><legend>${esc(g.title)}</legend><div class="su-module-grid">${g.apps.map(name => `<label class="su-module"><span><b>${esc(name)}</b><small>${esc(name === 'Fleet' || ['Finance', 'Leads', 'Social'].includes(name) ? 'Code only, no imported data' : 'Adds this tool to ' + g.workspace)}</small></span><input type="checkbox" role="switch" data-su-module="${esc(name)}" ${moduleOn(name, settings) ? 'checked' : ''}><i aria-hidden="true"></i></label>`).join('')}</div></fieldset>`).join('')}</section>`;
  const TOOLS = { claude: ['Claude Code', 'Uses your Claude subscription. Run it once and sign in.', 'claude'], codex: ['Codex', 'Uses your ChatGPT subscription. Sign in once.', 'codex login'], hermes: ['Hermes', 'Runs your crew. Choose its model and sign in.', 'hermes model'], gemini: ['Gemini CLI', 'Uses your Google account.', 'gemini'], ollama: ['Ollama', 'Local models: they work with no internet.', 'sudo pacman -S ollama && sudo systemctl enable --now ollama'] };
  const D = { set: null, detect: [], targets: [], hw: null, pull: null, ollama: null, loaded: false, term: false, signing: '', signErr: '' };

  async function load() {
    try {
      const [set, det, tg, hw, pull, term] = await Promise.all([get('/api/settings'), get('/api/detect'), get('/api/chat-targets'), get('/api/hardware'), get('/api/models/pull'), get('/api/terminal').catch(() => ({ enabled: false }))]);
      D.term = !!term.enabled && !!(window.CX && window.CX.runInTerminal);
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
    return `<div class="su-tier"><div><b>${{ quick: 'Quick start', balanced: 'Balanced', max: 'Best quality' }[m.tier] || m.tier}</b><small><span data-no-i18n>${esc(m.model)} · ${m.sizeGb} GB</span> · <span>${esc(m.why)}</span></small></div>
      ${st && !st.done && !st.error ? `<div class="su-bar"><i style="width:${pct}%"></i></div><span class="su-chip warn">${pct}%</span><button class="su-btn" data-su="cancel">Cancel</button>`
        : st && st.done ? '<span class="su-chip ok">Installed</span>'
        : D.pull && D.pull.queue && D.pull.queue.includes(m.model) ? '<span class="su-chip">In line</span>'
        : st && st.error ? `<span class="su-chip warn" title="${esc(st.error)}">Failed</span><button class="su-btn" data-su="pull" data-v="${esc(m.model)}">Try again</button>`
        : `<button class="su-btn go" data-su="pull" data-v="${esc(m.model)}" ${ready ? '' : 'disabled title="Install Ollama first"'}>${I('download', 16)}<span>Download</span></button>`}</div>`;
  };
  // Optional and short: the gateway lets this same running app be opened from a phone or another computer. Nothing is set up here.
  const devicesCard = () => `<section class="su-card"><h3><span>5</span>Use it from other devices</h3>
      <p class="su-note">Optional. The gateway lets this same app open as a web app on your phone or another computer, only when you turn it on, with its own access key.</p>
      <button class="su-btn" data-su="gateway">${I('system', 16)}<span>Open the Gateway page</span></button></section>`;
  function setupView() {
    if (!D.loaded) { void load().then(() => { if (S.tabs[S.act] && S.tabs[S.act].id === 'Start') render(); }); return `<div class="nx-view enter su">${scene('atrium-hero', 100)}<div class="su-wrap"><p class="su-lead">Loading…</p></div></div>`; }
    if (D.loaded === 'error') return `<div class="nx-view enter su"><div class="su-wrap"><p class="su-lead">The core did not answer. Is it running?</p></div></div>`;
    const p = D.set.profile, olReady = D.ollama && D.ollama.ok;
    return `<div class="nx-view enter su">${scene('atrium-hero', 100)}<div class="su-wrap">
      <header class="su-head su-guide"><div class="su-chibi" aria-hidden="true"><img src="art/caesaros-chibi-guide.webp" alt="" width="132" height="132" decoding="async"></div>
        <div class="su-guide-text"><span class="label">FIRST RUN</span><h2>Set up CaesarOS</h2><p class="su-lead">Ave. I am Caesar. Choose your language, then ask me anything. Everything below is optional, stays on this machine, and you can change it later.</p>
        <div class="st-seg su-langs" role="group" aria-label="Language"><button type="button" class="${document.documentElement.lang === 'pl' ? '' : 'on'}" data-su="lang" data-v="en" aria-pressed="${document.documentElement.lang !== 'pl'}" lang="en" data-no-i18n>English</button><button type="button" class="${document.documentElement.lang === 'pl' ? 'on' : ''}" data-su="lang" data-v="pl" aria-pressed="${document.documentElement.lang === 'pl'}" lang="pl" data-no-i18n>Polski</button></div></div></header>

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
        <p class="su-note"><span>Local models run on this machine with no internet.</span> ${D.hw.machine ? `<span>Memory: ${D.hw.machine.ramGb} GB</span> · <span>Free disk: ${D.hw.machine.freeDiskGb} GB</span>${D.hw.machine.gpu !== 'none' ? ` · <span>${D.hw.machine.gpu.toUpperCase()} graphics</span>` : ''}` : '<span>Machine details are hidden</span>'}</p>
        ${olReady ? '' : `<div class="su-warn"><b>Ollama is not installed.</b> It runs the local models. Install it once, then come back and download.<code>${esc(TOOLS.ollama[2])}</code><button class="su-btn" data-su="copy" data-v="${esc(TOOLS.ollama[2])}">${I('copy', 16)}<span>Copy command</span></button><button class="su-btn" data-su="recheck">${I('refresh', 16)}<span>Check again</span></button></div>`}
        <div class="su-tiers">${D.hw.advice.map(pullBox).join('')}</div>
      </section>

      ${devicesCard()}

      ${moduleCard(D.set)}

      <section class="su-card"><h3>Optional modules</h3><p class="su-note">Add only the apps you want. Turning Ideas off hides its page and stops its routes without deleting saved cards.</p><div class="st-rowline"><span class="st-tool"><b>Ideas</b><small>Planning board with Inbox, Now, Next, Waiting, Parked, Done and Dropped lanes.</small></span><span style="flex:1"></span><button type="button" class="su-btn" data-ideas-toggle role="switch" aria-checked="${!!(window.ideasModule && window.ideasModule.enabled())}">${window.ideasModule && window.ideasModule.enabled() ? 'On' : 'Off'}</button></div></section>
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
    else if (a === 'gateway') { open_({ k: 'app', id: 'Gateway' }); render(); }
    else if (a === 'lang') { window.__langPick = b.dataset.v; await put('/api/settings', { language: b.dataset.v }); if (window.I18N?.setLanguage) await window.I18N.setLanguage(b.dataset.v); try { localStorage.setItem('caesaros-language-choice', b.dataset.v); } catch {} if (D.set) D.set.language = b.dataset.v; document.documentElement.lang = b.dataset.v; render(); }
    else if (a === 'module') { /* handled by change event */ }
    else if (a === 'recheck') { b.disabled = true; await load(); render(); }
    else if (a === 'pull') { await post('/api/models/pull', { model: b.dataset.v }); D.pull = await get('/api/models/pull'); render(); poll(); }
    else if (a === 'cancel') { await fetch('/api/models/pull', { method: 'DELETE' }); D.pull = await get('/api/models/pull'); render(); }
    else if (a === 'finish') { await put('/api/settings', { setupDone: true }); S.tabs = [{ k: 'ws' }]; S.act = 0; render(); }
  }, true);
  document.addEventListener('change', async e => {
    const sw = e.target.closest('[data-su-module]');
    if (sw && D.set) {
      const name = sw.dataset.suModule, key = moduleKey(name), dis = new Set(D.set.disabledModules || []), ena = new Set(D.set.enabledModules || []);
      if (sw.checked) { dis.delete(key); ena.add(key); } else { ena.delete(key); dis.add(key); }
      const r = await put('/api/settings', { disabledModules: [...dis], enabledModules: [...ena] });
      if (r.ok) {
        // A switch that has a server module starts or pauses it now, so the page and its routes agree without a restart.
        const pid = PLUGIN_OF[name];
        if (pid) { const m = await put('/api/plugins/' + pid + '/enabled', { enabled: sw.checked }); if (m.ok) { const fresh = await fetch('/api/settings'); if (fresh.ok) { D.set = await fresh.json(); } else D.set = await r.json(); } else D.set = await r.json(); }
        else D.set = await r.json();
        window.applyOptionalModules?.(D.set); await window.reloadWorkspaces?.(); render();
      }
      return;
    }
    const f = e.target.closest('[data-su-save]'), ac = e.target.closest('[data-su-acct]'); if (!f && !ac || !D.set) return;
    const prof = { ...D.set.profile };
    if (f) prof[f.dataset.suSave] = f.value.trim();
    else { const rest = (prof.accounts || []).filter(x => x.platform !== ac.dataset.suAcct); prof.accounts = ac.value.trim() ? [...rest, { platform: ac.dataset.suAcct, handle: ac.value.trim() }] : rest; }
    const r = await put('/api/settings', { profile: prof }); if (r.ok) D.set = await r.json();
  });

  // the first run opens Start by itself, once, and never traps: Finish or any other page leaves it
  (async () => { try { const s = await get('/api/settings'); if (!s.setupDone && !sessionStorage.getItem('caesaros-setup-seen')) { sessionStorage.setItem('caesaros-setup-seen', '1'); setTimeout(() => { open_({ k: 'app', id: 'Start' }); render(); }, 900); } } catch { /* the core is not up yet */ } })();
})();
