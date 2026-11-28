/* Settings (the real one): grouped cards on the core's own settings. Press a header to open its
   options; every change saves to /api/settings and survives a reload. Real data only: when the
   core has nothing to show, the card says so. Look: nsHead + cards, kit controls (su-in, su-btn). */
(() => {
  const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
  const put = (u, b) => fetch(u, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const post = (u) => fetch(u, { method: 'POST' });
  const PLATFORMS = [['x', 'X (Twitter)', '@handle'], ['youtube', 'YouTube', '@channel or link'], ['instagram', 'Instagram', '@handle'], ['tiktok', 'TikTok', '@handle'], ['linkedin', 'LinkedIn', 'profile or page link'], ['facebook', 'Facebook', 'page link'], ['threads', 'Threads', '@handle'], ['bluesky', 'Bluesky', 'handle.bsky.social'], ['mastodon', 'Mastodon', '@name@server'], ['reddit', 'Reddit', 'u/name'], ['github', 'GitHub', 'name'], ['pinterest', 'Pinterest', '@handle']];
  const D = { set: null, detect: null, targets: [], packs: { themes: [] }, backups: [], audit: [], version: null, open: null, msg: {}, loaded: false, hconf: null, hOpen: null, modules: [] };

  async function load() {
    if (D.loading) return D.loading;
    D.loading = (async () => {
      const [set, det, tg, packs, bk, au, ver, hc, modules] = await Promise.all([
        get('/api/settings'), get('/api/detect'), get('/api/chat-targets'), get('/api/packs'),
        get('/api/backup').catch(() => []), get('/api/audit').catch(() => []), get('/api/version'),
        get('/api/hermes/config').catch(() => null), get('/api/plugins/all').catch(() => []),
      ]);
      Object.assign(D, { set, detect: det, targets: tg, packs, backups: bk, audit: au, version: ver, hconf: hc, modules, loaded: true });
      window.SETTINGS = set;
    })();
    return D.loading;
  }

  const errText = b => Array.isArray(b.error)
    ? b.error.map(x => `${(x.path || []).join('.') || 'value'}: ${x.message}`).join('; ')
    : (b.error || b.message || 'The core refused it.');

  /** The look the core says is on: motion, language, text size, palette. Theme packs are saved but
   *  the Atrium is one skin (neo.css), so choosing another pack does not swap stylesheets here. */
  function applyLook() {
    const s = D.set; if (!s) return;
    // Three states. Authority: what the operator chose (stored), then the core config when it is a real
    // choice (off or reduced), then the system preference, then full. Only a real choice is written back,
    // so a system preference is not frozen into localStorage on the first load.
    let stored = null;
    try { stored = localStorage.getItem('caesaros-motion'); } catch (_) {}
    const system = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const configured = s.motion === 'off' || s.motion === 'reduced';
    const mv = stored === 'off' || stored === 'reduced' || stored === 'on'
      ? stored
      : configured ? s.motion : (system ? 'reduced' : 'on');
    root.dataset.motion = mv;
    if (stored || configured) { try { localStorage.setItem('caesaros-motion', mv); } catch (_) {} }
    { const b = ['rich', 'subtle', 'off'].includes(s.background) ? s.background : 'rich'; root.dataset.bg = b; try { localStorage.setItem('caesaros-bg', b); } catch (_) {} }
    root.lang = window.__langPick || s.language || 'en';   // a choice made on this page beats a settings response that was already in flight
    root.style.fontSize = (16 * (s.textScale || 1)) + 'px';
    try { localStorage.setItem('caesaros-textscale', String(s.textScale || 1)); } catch (_) {}
    const theme = (D.packs.themes || []).find(t => t.id === s.theme);
    void applyPack(theme);
    // a one-letter palette is the shell's own (top bar picker, plain CSS rules): it wins until Settings picks a pack colour
    let kept = ''; try { kept = localStorage.getItem('cx-pal') || ''; } catch (_) {}
    if (window.__palURL) { root.dataset.pal = window.__palURL; return; }   // ?pal= wins for this page load only
    if (/^[a-z]$/.test(kept) && !(window.__packPick)) { root.dataset.pal = kept; return; }
    const pal = ((theme && theme.palettes) || []).find(p => p.id === s.palette) || ((theme && theme.palettes) || [])[0];
    // shortcut: a theme pack with no palettes keeps the last two colours, so --p1/--p2 stay valid
    if (!pal) return;
    root.dataset.pal = pal.id; try { localStorage.setItem('cx-pal', pal.id); localStorage.setItem('caesaros-pack-pal', JSON.stringify([pal.id, pal.p1, pal.p2])); } catch (_) {}
    root.style.setProperty('--p1', pal.p1); root.style.setProperty('--p1r', rgb(pal.p1));
    root.style.setProperty('--p2', pal.p2); root.style.setProperty('--p2r', rgb(pal.p2));
  }
  // Cinder and Lumen are token-only packs: read their :root tokens and map them onto the Atrium's own names; theme-pack.css dresses the materials.
  // Neo Roma is the Atrium's own skin (neo.css + palettes), so it clears the pack. A stale answer (the person clicked again) is dropped.
  const PACK_MAP = { bg: 'bg', surface: 'surface', 'surface-2': 'surface-2', 'surface-3': 'surface-3', line: 'line', ink: 'text', 'ink-2': 'muted', accent: 'accent', 'accent-ink': 'accent-ink', 'accent-2': 'signal' };
  let packSeq = 0;
  async function applyPack(theme) {
    const my = ++packSeq, own = !theme || theme.id === 'neo-roma' || !theme.url;
    if (own) { delete root.dataset.tpack; try { localStorage.removeItem('caesaros-tpack'); } catch (_) {} return clearPack(); }
    let css = ''; try { css = await (await fetch(theme.url)).text(); } catch (_) { return; }
    if (my !== packSeq) return;
    const t = {}; for (const m of (css.match(/:root\s*\{[^}]*\}/) || [''])[0].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) t[m[1]] = m[2].trim();
    const v = {}; for (const [k, to] of Object.entries(PACK_MAP)) if (t[k]) v['--' + to] = t[k];
    const hex = /^#[0-9a-f]{6}$/i;
    if (hex.test(t.accent || '') && hex.test(t['accent-2'] || '')) {
      Object.assign(v, { '--tp1': t.accent, '--tp1r': rgb(t.accent), '--tp2': t['accent-2'], '--tp2r': rgb(t['accent-2']), '--cx-mag': t.accent, '--cx-gold': t['accent-hi'] || t.accent, '--g1': rgb(t.accent), '--g2': rgb(t['accent-2']) });
    }
    clearPack(); root.dataset.tpack = theme.id; for (const k in v) root.style.setProperty(k, v[k]);
    try { localStorage.setItem('caesaros-tpack', JSON.stringify({ id: theme.id, v })); } catch (_) {}
  }
  function clearPack() { for (const k of [...Object.values(PACK_MAP).map(x => '--' + x), '--tp1', '--tp1r', '--tp2', '--tp2r', '--cx-mag', '--cx-gold', '--g1', '--g2']) root.style.removeProperty(k); }
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');

  async function save(card, patch) {
    try {
      if (patch.language) window.__langPick = patch.language;
      const r = await put('/api/settings', patch);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { D.msg[card] = { text: errText(body), bad: true }; render(); return false; }
      D.set = body; window.SETTINGS = body; if (patch.language && window.I18N?.setLanguage) await window.I18N.setLanguage(patch.language); if (patch.language) { try { localStorage.setItem('caesaros-language-choice', patch.language); } catch (_) {} } D.msg[card] = { text: 'Saved' }; applyLook(); render();
      setTimeout(() => {
        if (D.msg[card] && D.msg[card].text === 'Saved') { delete D.msg[card]; if (onPage()) render(); }
      }, 1600);
      return true;
    } catch { D.msg[card] = { text: 'The core did not answer.', bad: true }; render(); return false; }
  }
  const onPage = () => S.tabs[S.act] && S.tabs[S.act].id === 'Settings';
  const msg = id => D.msg[id] ? `<span class="st-msg ${D.msg[id].bad ? 'bad' : ''}" role="status">${esc(D.msg[id].text)}</span>` : '';

  /* ---------- card bodies ---------- */
  const acctVal = p => ((D.set.profile.accounts || []).find(a => a.platform === p) || {}).handle || '';
  function you() {
    const p = D.set.profile || {};
    return `<div class="su-grid">
      <label class="su-f"><span>How should I call you?</span><input class="su-in" data-st-prof="callMe" value="${esc(p.callMe || '')}" placeholder="Your name or nickname" autocomplete="off"></label>
      <label class="su-f"><span>Business, or what you work on</span><input class="su-in" data-st-prof="business" value="${esc(p.business || '')}" placeholder="A studio, a channel, a clinic" autocomplete="off"></label></div>
      <label class="su-f"><span>Anything else I should know</span><textarea class="su-in" rows="3" data-st-prof="about" placeholder="How you like to work, what to avoid">${esc(p.about || '')}</textarea></label>
      <div class="st-row"><span class="st-lbl">Accounts</span><div class="su-grid">${PLATFORMS.map(([id, name, ph]) => `<label class="su-f"><span>${esc(name)}</span><input class="su-in" data-st-acct="${id}" value="${esc(acctVal(id))}" placeholder="${esc(ph)}" autocomplete="off"></label>`).join('')}</div></div>
      <p class="su-note">Saved on this machine only. Posting needs each service's own key, added later under System.</p>`;
  }
  function look() {
    const s = D.set, themes = D.packs.themes || [], theme = themes.find(t => t.id === s.theme), pals = (theme && theme.palettes) || [];
    const curPal = pals.find(p => p.id === s.palette) ? s.palette : (pals[0] || {}).id;
    const pct = Math.round((s.textScale || 1) * 100);
    return `<div class="st-row"><span class="st-lbl">Theme pack</span><div class="st-seg">${themes.length
      ? themes.map(t => `<button type="button" class="${t.id === s.theme ? 'on' : ''}" data-st="theme:${t.id}" aria-pressed="${t.id === s.theme}">${esc(t.name)}</button>`).join('')
      : '<span class="su-note">No theme packs on this machine.</span>'}</div></div>
      <div class="st-row"><span class="st-lbl">Palette</span>${pals.length
        ? `<div class="st-seg pals">${pals.map(p => `<button type="button" class="${p.id === curPal ? 'on' : ''}" data-st="pal:${p.id}" aria-pressed="${p.id === curPal}" aria-label="${esc(p.name)}" title="${esc(p.name)}" style="background:linear-gradient(135deg,${p.p1} 50%,${p.p2} 50%)"></button>`).join('')}</div>`
        : '<span class="su-note">This theme pack has no palettes; it uses its own two colours.</span>'}</div>
      <div class="st-row"><span class="st-lbl">Motion</span><div class="st-seg">
        <button type="button" class="${s.motion !== 'off' && s.motion !== 'reduced' ? 'on' : ''}" data-st="motion:full" aria-pressed="${s.motion !== 'off' && s.motion !== 'reduced'}">Full</button>
        <button type="button" class="${s.motion === 'reduced' ? 'on' : ''}" data-st="motion:reduced" aria-pressed="${s.motion === 'reduced'}">Reduced</button>
        <button type="button" class="${s.motion === 'off' ? 'on' : ''}" data-st="motion:off" aria-pressed="${s.motion === 'off'}">Off</button></div>
        <span class="su-note">One switch for every effect, live.</span></div>
      <div class="st-row"><span class="st-lbl">Background</span><div class="st-seg">${[['rich', 'Rich'], ['subtle', 'Subtle'], ['off', 'Off']].map(([id, l]) => { const on = (s.background || 'rich') === id; return `<button type="button" class="${on ? 'on' : ''}" data-st="bg:${id}" aria-pressed="${on}">${l}</button>`; }).join('')}</div>
        <span class="su-note">Lines and code glyphs behind every page. Rich is the full look, Subtle is quiet, Off is plain.</span></div>
      <div class="st-row"><span class="st-lbl">Text size <b class="st-pct" style="color:var(--text)">${pct}%</b></span>
        <input class="st-range" type="range" min="85" max="140" step="5" value="${pct}" data-st-range aria-label="Text size, percent"></div>`;
  }
  function lang() {
    const s = D.set, cur = document.documentElement.lang === 'pl' ? 'pl' : 'en';   // what the page speaks: the gate may have changed it after D.set was read
    return `<div class="st-seg" data-no-i18n>
      <button type="button" class="${cur === 'en' ? 'on' : ''}" data-st="lang:en" aria-pressed="${cur === 'en'}" lang="en">English</button>
      <button type="button" class="${cur === 'pl' ? 'on' : ''}" data-st="lang:pl" aria-pressed="${cur === 'pl'}" lang="pl">Polski</button></div>
      ${s.language === 'pl' ? `<p class="su-note">Texts without a Polish version yet are shown in English and queued. Press the button and your own model translates them; ${D.i18nLeft ? `<b>${D.i18nLeft}</b> are waiting.` : 'nothing is waiting right now.'}</p>
      <div class="st-row"><button type="button" class="su-btn" data-st="i18n:run" ${D.i18nBusy ? 'disabled' : ''}>${D.i18nBusy ? 'Translating…' : 'Translate what is missing'}</button></div>
      ${D.msg.i18n ? `<p class="su-note" role="status">${D.msg.i18n}</p>` : ''}
      <div class="st-row"><button type="button" class="su-btn" data-st="rv:toggle" aria-expanded="${!!D.rvOpen}">${D.rvOpen ? 'Hide the translations' : 'Review the translations'}</button></div>${D.rvOpen ? reviewHtml() : ''}` : `<p class="su-note">English is the source language. Choose Polski and the interface is translated by your own model, with the names kept in English.</p>`}`;
  }
  /** Review (7.10): the person's own automatic translations next to the English. Cells carry data-no-i18n: they are data, not interface text. */
  const RV_STATE = { auto: 'Automatic', approved: 'Approved', english: 'English kept' };
  function reviewHtml() {
    if (!D.rv) { void loadReview(); return ARTSKEL(2, 'Loading'); }
    if (!D.rv.length) return '<p class="su-note">No automatic translations yet. Press Translate what is missing first.</p>';
    const n = D.rvN || 40, rows = D.rv.slice(0, n).map((r, i) => `<div class="st-rv" data-no-i18n><div class="st-rv-en">${esc(r.en)}</div>
      <input class="og-input st-rv-in" data-rv-in="${i}" value="${esc(r.pl)}" aria-label="Polish for: ${esc(r.en)}" lang="pl">
      <div class="st-rv-act"><span class="st-rv-state ${r.state}">${RV_STATE[r.state]}</span>
        <button type="button" class="su-btn" data-st="rv:save:${i}">Save</button>
        ${r.state === 'auto' ? `<button type="button" class="su-btn" data-st="rv:ok:${i}">Approve</button>` : ''}
        ${r.state === 'english' ? '' : `<button type="button" class="su-btn" data-st="rv:en:${i}">Restore English</button>`}</div></div>`).join('');
    return `<div class="st-rvlist">${D.msg.rv ? `<p class="su-note" role="status">${esc(D.msg.rv)}</p>` : ''}${rows}${D.rv.length > n ? `<div class="st-row"><button type="button" class="su-btn" data-st="rv:more">Show more (${D.rv.length - n} left)</button></div>` : ''}</div>`;
  }
  async function loadReview() { try { D.rv = await get('/api/i18n/pl/review'); } catch { D.rv = []; D.msg.rv = 'Could not load the translations'; } render(); }
  async function reviewAct(act, i) {
    const r = D.rv[i]; if (!r) return;
    const body = act === 'save' ? { en: r.en, pl: (document.querySelector('[data-rv-in="' + i + '"]') || {}).value } : { en: r.en };
    const res = await fetch('/api/i18n/pl/' + (act === 'save' ? 'entry' : act === 'ok' ? 'approve' : 'revert'), { method: act === 'save' ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    D.msg.rv = res.ok ? '' : j.error === 'placeholder' ? 'Keep the number marks of the English text.' : j.error === 'empty' ? 'The text is empty.' : 'Could not save.';
    if (res.ok) { try { D.rv = await get('/api/i18n/pl/review'); } catch { /* keep the old list */ } if (window.I18N) await window.I18N.reload(); }
    render();
  }
  function engines() {
    const det = D.detect || { engines: [] }, targets = D.targets || [];
    const rows = det.engines.map(g => {
      const cls = !g.found ? 'warn' : g.probe.ok ? 'ok' : 'warn';
      const state = !g.found ? 'Not installed' : g.probe.ok ? 'Ready' + (g.probe.version ? ' · ' + g.probe.version : '') : 'Needs a sign-in';
      return `<div class="st-rowline"><span class="su-dot ${cls}"></span><span class="st-tool"><b>${esc(g.label)}</b><small>${esc(state)}</small>${g.signIn ? `<code class="st-code">${esc(g.signIn)}</code>` : ''}</span><span style="flex:1"></span>${g.signIn ? `<button type="button" class="su-btn" data-st-copy="${esc(g.signIn)}">${I('copy', 16)}<span>Copy</span></button>` : ''}</div>`;
    }).join('');
    const off = targets.filter(t => !t.ok && t.detail && t.group !== 'crew').map(t => `<div class="st-rowline"><span class="su-dot warn"></span><span class="st-tool"><b>${esc(t.label)}</b><small>${esc(t.detail)}</small></span></div>`).join('');
    const s = D.set;
    return `<div class="st-row"><span class="st-lbl">Found on this machine</span><div class="st-list">${rows}</div></div>
      ${off ? `<div class="st-row"><span class="st-lbl">Tools that need you</span><div class="st-list">${off}</div></div>` : ''}
      <div class="st-row"><span class="st-lbl">Engine mode</span><div class="st-seg">
        <button type="button" class="${s.engine === 'local' ? 'on' : ''}" data-st="mode:local" aria-pressed="${s.engine === 'local'}">Local</button>
        <button type="button" class="${s.engine === 'vps' ? 'on' : ''}" data-st="mode:vps" aria-pressed="${s.engine === 'vps'}">VPS</button>
        <button type="button" class="${s.engine === 'offline' ? 'on' : ''}" data-st="mode:offline" aria-pressed="${s.engine === 'offline'}">Offline</button></div>
        <span class="su-note">Where jobs run first. Offline is the only mode that pauses tools needing the network.</span></div>`;
  }
  function brain() {
    const b = D.set.brain || { location: 'local', url: '' };
    return `<div class="st-row"><span class="st-lbl">Where the Brain lives</span><div class="st-seg">
      <button type="button" class="${b.location !== 'remote' ? 'on' : ''}" data-st="brainloc:local" aria-pressed="${b.location !== 'remote'}">On this machine</button>
      <button type="button" class="${b.location === 'remote' ? 'on' : ''}" data-st="brainloc:remote" aria-pressed="${b.location === 'remote'}">At an address</button></div></div>
      <label class="su-f"><span>Address (for a remote Brain)</span><input class="su-in" data-st-brain-url value="${esc(b.url || '')}" placeholder="https://…" autocomplete="off"></label>
      <p class="su-note">A remote address must be http or https and carry no credentials. Leaving it empty keeps the Brain local.</p>`;
  }
  function backup() {
    const b = (D.backups || [])[0];
    return `<div class="st-rowline"><span class="st-tool"><b>${b ? esc(b.name) : 'No backup yet'}</b><small>${b ? `${b.sizeMb} MB · ${new Date(b.at).toLocaleString(uiLocale('en'), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Take the first copy of settings, chats and keys.'}</small></span><span style="flex:1"></span>
      <button type="button" class="su-btn go" data-st="backup">${I('download', 16)}<span>Back up now</span></button></div>
      <p class="su-note">A consistent copy in the core's own backup folder. This card only takes copies; it never replaces your data.</p>`;
  }
  function data() {
    const rows = (D.audit || []).slice(0, 12).map(r => `<div class="st-rowline"><span class="st-tool"><b>${esc(r.claim)}</b><small>${esc(r.actor)} · ${esc(r.subject_kind)} · ${esc(r.confidence)} · ${new Date(r.at).toLocaleString(uiLocale('en'), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span></div>`).join('');
    return `<p class="su-note">Nothing leaves this machine unless an engine or server you added is used. The ledger below records private reads and refusals; it holds the claim, never the data.</p>
      ${rows ? `<div class="st-list">${rows}</div>` : '<p class="su-note">Nothing has been read or refused yet.</p>'}`;
  }
  function about() {
    const v = D.version || {};
    return `<div class="st-rowline"><span class="st-tool"><b>CAESAR ${esc(v.version || '')}</b><small>build ${esc(v.build || 'dev')}</small></span></div>`;
  }
  /* Credits, Hall of Fame: the owner's thanks, ten statues with their names, each linking to the person's page on X */
  const HOF = [['Teknium', 'Teknium', 5.2], ['witcheer', 'witcheer', 15.6], ['tonysimons', 'tonysimons', 26.0], ['HermesWatcher', 'HermesWatcher', 36.4], ['BkashJosi', 'BkashJosi', 46.8], ['rlaope', 'rlaope', 57.2], ['tonbistudio', 'tonbistudio', 67.6], ['kommechanic', 'kommechanic', 78.0], ['iamlukethedev', 'iamlukethedev', 88.4], ['BearHuddleston', 'BearHuddleston', 98.0]];
  function credits() {
    const url = h => 'https://x.com/' + encodeURIComponent(h);
    const spots = HOF.map(([n, h, x]) => `<a class="hof-spot" style="left:${Math.max(0, x - 6.2).toFixed(1)}%" href="${url(h)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(n)} on X"><span>${esc(n)}</span></a>`).join('');
    const names = HOF.map(([n, h]) => `<li><a href="${url(h)}" target="_blank" rel="noopener noreferrer">${esc(n)} <small>@${esc(h)}</small></a></li>`).join('');
    return `<p class="su-note">None of this exists without people who share what they know. Thank you. Press a keeper for its legend; its link opens that person's page on X.</p>
      <div class="hof"><img class="hof-fallback" src="" aria-hidden="true" alt="Ten stone statues with glowing nameplates: ${HOF.map(h => esc(h[0])).join(', ')}. Caesar, a small ape in a laurel wreath, looks up at them." loading="lazy"><div class="hof-spots">${spots}</div></div>
      <ul class="hof-list">${names}</ul>
      <p class="su-note">Built on Hermes Agent by Nous Research (MIT) and the ideas of Oh My Hermes by rlaope. Every component and licence is listed in THIRD-PARTY-NOTICES.md.</p>`;
  }
  /* Hermes (read only, 7.8): what each profile runs on and where. Values are data-no-i18n; the labels are ours. */
  function hermes() {
    const h = D.hconf;
    if (!h) return `<p class="su-note">The core did not return the Hermes configuration.</p>`;
    const info = h.hermes || {}, profiles = h.profiles || [];
    const kv = (label, v) => v ? `<div class="st-rowline"><span class="st-tool"><b>${esc(label)}</b><small data-no-i18n>${esc(v)}</small></span></div>` : '';
    const rows = profiles.map(p => {
      const open = D.hOpen === p.profile;
      const model = p.model;
      const cmd = `hermes ${p.profile === 'default' ? '' : `-p ${p.profile} `}config set model.default ${p.model || '<model>'}`;
      const more = !open ? '' : `<div class="st-list">
        ${kv('Provider', p.provider)}
        ${kv('Base URL host', p.baseUrlHost)}
        ${kv('Reasoning effort', p.reasoningEffort)}
        ${kv('Delegation', p.delegation ? `${p.delegation.provider || '?'} / ${p.delegation.model || '?'}` : '')}
        ${kv('Fallback', p.fallback ? `${p.fallback.provider || '?'} / ${p.fallback.model || '?'}` : '')}
        ${kv('Plugins', (p.plugins || []).join(', '))}
        ${kv('Toolsets', (p.toolsets || []).join(', '))}
        ${(p.notRead || []).length ? `<p class="su-note">Not read: ${esc((p.notRead || []).join(', '))}</p>` : ''}
        <code class="st-code" data-no-i18n>${esc(cmd)}</code></div>`;
      return `<div class="st-rowline"><span class="su-dot ${p.scope === 'local' ? 'ok' : 'warn'}"></span>
        <span class="st-tool"><b data-no-i18n>${esc(p.profile)}</b><small data-no-i18n>${esc(model || 'not read')}${p.provider ? ' · ' + esc(p.provider) : ''}</small></span>
        <span class="og-tag ${p.scope === 'local' ? 'sig' : 'mut'}">${p.scope === 'local' ? 'Local' : 'Cloud'}</span>
        <button type="button" class="su-btn" data-st="hconf:${esc(p.profile)}" aria-expanded="${open}">${open ? 'Less' : 'See more'}</button>
        ${more}</div>`;
    }).join('');
    return `<div class="st-rowline"><span class="su-dot ${info.gateway ? 'ok' : 'warn'}"></span><span class="st-tool"><b data-no-i18n>${esc(info.version ? 'Hermes ' + info.version : 'Hermes')}</b><small>${esc((info.installMethod ? 'Installed with ' + info.installMethod + '. ' : '') + (info.version ? '' : 'Version not read. ') + (info.gateway ? 'The gateway answers.' : 'The gateway does not answer.'))}</small></span></div>
      <div class="st-list">${rows || '<p class="su-note">No profiles found.</p>'}</div>
      <p class="su-note">Read only here. To change a value, run the command under See more in a terminal; the crew reads the new value on the next answer.</p>`;
  }

  function modules() {
    const goals = D.modules.find(m => m.id === 'goals');
    const ideas = D.modules.find(m => m.id === 'ideas');
    const scheduling = D.modules.find(m => m.id === 'scheduling');
    const row = (module, title, detail) => {
      if (!module) return `<p class="su-note">${title} module is not present in this build.</p>`;
      const running = module.running;
      return `<div class="st-rowline"><span class="su-dot ${running ? 'ok' : 'warn'}"></span><span class="st-tool"><b>${title}</b><small>${running ? detail : module.enabled ? 'Enabled; restart required to load it.' : 'Off. Saved data is retained.'}</small></span><span style="flex:1"></span><button type="button" class="su-btn" data-st="module:${module.id}:${!module.enabled}" aria-pressed="${module.enabled}" ${module.available ? '' : 'disabled'}>${module.enabled ? 'Turn off' : 'Turn on'}</button></div>`;
    };
    return `${row(goals, 'Goals', 'Available in the Day group.')}<p class="su-note">Planning workspace by horizon. Disabling hides navigation and pauses its routes; saved goals are retained.</p>${row(ideas, 'Ideas', 'Available in the Work group.')}<p class="su-note">The planning board groups ideas into Inbox, Now, Next, Waiting, Parked, Done and Dropped. Turning it off hides the app and stops its routes; saved ideas remain on this device.</p>${row(scheduling, 'Scheduling', 'Hermes cron jobs in the Day group.')}<p class="su-note">Manage what and when, pause, resume, reschedule, or explicitly run now. Existing cron jobs are not deleted when you turn the module off.</p>`;
  }
  const CARDS = [ ['modules', 'Optional modules', 'Turn optional modules on or off.'],    ['you', 'You', 'Your name, business, about and accounts, so the crew knows who it is talking to.'],
    ['look', 'Look and motion', 'Theme pack, palette, motion and text size.'],
    ['lang', 'Language', 'The language you choose, and what is still English for now.'],
    ['help', 'Help', 'A short guide, the guided tour and keyboard shortcuts.'],
    ['voice', 'Voice', 'Read answers aloud, and which voice. Speech to text is local too.'],
    ['engines', 'Engines and tools', 'What this machine has, what needs a sign-in, and where jobs run.'],
    ['hermes', 'Hermes', 'The Hermes your crew runs on: each profile, its model and where it runs. Read only.'],
    ['brain', 'Brain and memory', 'Where the Brain lives: on this machine or at an address you chose.'],
    ['backup', 'Backup and restore', 'A consistent copy of settings, chats and keys. Take one now.'],
    ['updates', 'Updates', 'Check for a newer version, download it and restart into it. Nothing happens without you.'],
    ['notify', 'Notifications on this device', 'A system notice when a reply or an approval is waiting.'],
    ['permissions', 'Permissions', 'What this browser lets CaesarOS use, and what for.'],
    ['egress', 'Where it can connect', 'The outbound addresses this install is set up to use.'],
    ['data', 'Data and privacy', 'What stays here, and what was read or refused.'],
    ['credits', 'Credits · Hall of Fame', 'The people whose work this stands on, in stone.'],
    ['about', 'About', 'Version and build.'],
  ];
  // every line here must be true in the app: tests/atrium-tour.test.ts opens the pages it names
  const GUIDE = [
    ['Home', 'The first workspace, with widgets such as Today, Quick capture, recent conversations and recent notes. On a wide screen, Edit layout moves, resizes, adds and removes them.'],
    ['Six workspaces', 'Home, Planning, Knowledge, Business, System and Crew, each with its own board of widgets. Switch at the top of the screen, or under Workspaces on Home on a phone.'],
    ['Chat dock', 'The Ask button or Ctrl J opens a small chat over any page. It keeps one conversation, and you can open it in a tab. Answers need a signed-in tool or a local model.'],
    ['Choose your tools', 'On the Start page. These switches turn optional tools on and off.'],
    ['Skills map', 'Switch Skills on in Choose your tools, then open it from the menu: More, System, Skills. It shows the skills found on this computer as a map, a tree or cards. Read only.'],
    ['Library', 'Switch Library on in Choose your tools, then open it from the menu: More, Knowledge, Library. It has three halls: Books, Documents and Presentations. Add pasted text or a file.'],
    ['Brain', 'Notes in the menu. Notes are Markdown files on this computer, with [[Name]] links and #tags. Map shows the links. Recall searches what you saved.'],
    ['Gateway', 'From the menu: More, System, Gateway. Make a key so another app on this computer can use your engines. Serve as web app opens CaesarOS from another device. On a new install, only this device can open it.'],
  ];
  const help = () => `${GUIDE.map(([t, d]) => `<div class="st-rowline"><span class="st-tool"><b>${t}</b><small>${d}</small></span></div>`).join('')}<p class="su-note">The guided tour walks through these pages with the small Caesar. Skip it any time with the button or Esc.</p><div class="st-row"><button type="button" class="su-btn" data-st="tour:go">Play the guided tour</button><button type="button" class="su-btn" data-keys-open aria-haspopup="dialog">Keyboard shortcuts</button></div><p class="su-note">The small Caesar in the corner shows what the system is doing: working, waiting for your yes, done, or in trouble.</p><div class="st-row"><button type="button" class="su-btn" data-st="mascot:go" aria-pressed="${window.xMascot ? window.xMascot.on() : true}">${window.xMascot && !window.xMascot.on() ? 'Show the mascot' : 'Hide the mascot'}</button></div>`;
  const voice = () => {
    if (!window.xVoice) return '<p class="su-note">Voice is not loaded.</p>';
    if (!D.vinfo) { void window.xVoice.info().then(i => { D.vinfo = i; if (onPage()) render(); }); return '<p class="su-note">Looking for the local voice…</p>'; }
    const i = D.vinfo, on = window.xVoice.on(), cur = window.xVoice.voiceFor(i);
    const native = !!window.__TAURI_INTERNALS__;
    const list = i.ready ? `<div class="st-seg">${i.voices.map(v => `<button type="button" class="${v.id === cur ? 'on' : ''}" data-st="voice:pick:${v.id}" aria-pressed="${v.id === cur}" data-no-i18n>${esc(v.label)}</button>`).join('')}</div>` : `<p class="su-note">The local voice (Piper) is not installed. ${native ? 'Install the local voice to use speech in the desktop app.' : 'This browser can use its built-in voice where available.'} Install Piper with <code>bash tools/speech/install-tts.sh</code>.</p>`;
    const vl = (window.xVoiceLang && window.xVoiceLang.get()) || 'auto';
    const vm = !!(window.xVoiceMode && window.xVoiceMode.on);
    const langRow = `<div class="st-seg" role="group" aria-label="Dictation language">${[['auto', 'Auto'], ['en', 'English'], ['pl', 'Polski']].map(([v, l]) => `<button type="button" class="${vl === v ? 'on' : ''}" data-st="vtlang:${v}" aria-pressed="${vl === v}">${l}</button>`).join('')}</div>`;
    return `<div class="st-row"><button type="button" class="su-btn" data-st="vmode" aria-pressed="${vm}">${vm ? 'Voice mode: on, I listen after each answer' : 'Voice mode: off'}</button></div>
      <div class="st-row"><span class="su-note">Dictation language</span>${langRow}</div>
      <p class="su-note">Hold <kbd>Alt</kbd>+<kbd>Space</kbd> to talk, release to send. <kbd>Alt</kbd>+<kbd>V</kbd> toggles voice mode. With the mode on, the mic reopens after each answer.</p>
      <div class="st-row"><button type="button" class="su-btn" data-st="voice:on" aria-pressed="${on}">${on ? 'Reading answers aloud: on' : 'Reading answers aloud: off'}</button><button type="button" class="su-btn" data-st="voice:test" ${native && !i.ready ? 'disabled title="Install the local Piper voice first"' : ''}>Hear a sample</button><button type="button" class="su-btn" data-st="voice:stop">Stop</button></div>${list}<p class="su-note">Text goes to a program on this computer; nothing is sent anywhere. Speech to text (Meetings, the HUD microphone) uses the local Whisper.</p>`;
  };
  const notify = () => (window.xNotify ? window.xNotify.card() : '<p class="su-note">Not loaded.</p>');
  const egress = () => (window.xEgress ? window.xEgress.card() : '<p class="su-note">Not loaded.</p>');
  const permissions = () => (window.xPermissions ? window.xPermissions.card() : '<p class="su-note">Not loaded.</p>');
  const UPD_ERR = { no_feed_configured: 'No update address is set yet.', feed_must_be_https: 'The address must start with https://.', feed_url_invalid: 'That is not a valid address.', feed_unreachable: 'The address did not answer.', feed_invalid: 'The address did not return a valid update description.', checksum_mismatch: 'The download did not match its checksum and was refused.', size_mismatch: 'The download had the wrong size and was refused.', up_to_date: 'You are on the latest version.', nothing_staged: 'There is no downloaded update to install.', not_running_as_the_installed_app: 'Restarting into an update works only in the installed app.', package_paths_refused: 'The package was refused: it would unpack outside its folder.', disk_full: 'There is not enough free disk space for the update.', write_failed: 'The update could not be saved on this machine.', unpack_failed: 'The update could not be unpacked.' };
  const updates = () => {
    const u = D.upd || {}, feed = (D.set && D.set.updateFeed) || '';
    const state = u.busy ? '<p class="su-note" role="status">Working…</p>' : u.error ? `<p class="su-note" role="status">${esc(UPD_ERR[u.error] || u.error)}</p>` : u.current ? (u.newer ? `<p class="su-note" role="status">A newer version is available: <b data-no-i18n>${esc(u.latest)}</b> (you have <b data-no-i18n>${esc(u.current)}</b>).</p>` : `<p class="su-note" role="status">You are on the latest version, <b data-no-i18n>${esc(u.current)}</b>.</p>`) : '';
    return `<p class="su-note">Updates are never installed on their own. The package is checked against its checksum before anything is unpacked, and the app you have now is kept as a backup.</p>
      <label class="su-f"><span>Where to look for updates</span><input class="su-in" data-st-feed value="${esc(feed)}" placeholder="https://…/latest.json" inputmode="url" autocomplete="off" spellcheck="false" data-no-i18n></label>
      <div class="st-row"><button type="button" class="su-btn" data-st="upd:check" ${u.busy ? 'disabled' : ''}>Check for an update</button>${u.newer && !u.staged ? '<button type="button" class="su-btn" data-st="upd:apply">Download and verify</button>' : ''}${u.staged ? '<button type="button" class="su-btn" data-st="upd:restart">Restart to install</button>' : ''}</div>
      ${state}${D.updMsg ? `<p class="su-note" role="status">${esc(D.updMsg)}</p>` : ''}`;
  };
  const BODY = { permissions, egress, notify, modules, you, look, lang, help, voice, engines, hermes, brain, backup, updates, data, credits, about };

  function settingsView() {
    if (!D.loaded) {
      void load().then(() => { applyLook(); if (onPage()) render(); }).catch(() => { D.loaded = 'error'; if (onPage()) render(); });
      return `<div class="nx-view enter">${nsHead('Settings', 'Loading what this machine keeps…', 'Ordo', 'system')}<div class="og-wrap">${ARTSKEL(4, 'Reading the core')}</div></div>`;
    }
    if (D.loaded === 'error') return `<div class="nx-view enter">${nsHead('Settings', 'Press a card to open its options.', 'Ordo', 'system')}<div class="og-wrap"><p class="su-note">The core did not answer. Is it running?</p></div></div>`;
    const card = ([id, title, desc]) => {
      const open = D.open === id;
      return `<section class="st-card"><button type="button" class="st-head" data-st="open:${id}" aria-expanded="${open}">
        <span class="st-tt"><b>${esc(title)}</b><small>${esc(desc)}</small></span>
        <span class="st-chev ${open ? 'on' : ''}">${I('chevron-right', 16)}</span></button>
        ${open ? `<div class="st-body">${BODY[id]()}${msg(id)}</div>` : ''}</section>`;
    };
    return `<div class="nx-view enter">${nsHead('Settings', 'Press a card to open its options. Everything here saves to this machine.', 'Ordo', 'system')}
      <div class="og-wrap"><div class="st-wrap">${CARDS.map(card).join('')}</div></div></div>`;
  }
  register({ id: 'settings', views: { Settings: settingsView } });

  /* ---------- events: one delegated capture-phase listener, data attributes only ---------- */
  const copy = async (btn, text) => {
    try { await navigator.clipboard.writeText(text); const s = btn.querySelector('span'); if (!s) return; s.textContent = 'Copied'; setTimeout(() => { if (s.isConnected) s.textContent = 'Copy'; }, 1400); } catch { /* clipboard refused */ }
  };
  const postConfirm = async u => { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) }); return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }; };
  async function updAct(v) {
    D.updMsg = '';
    try {
      if (v === 'check') { D.upd = { busy: true }; render(); D.upd = await get('/api/update/check').catch(() => ({ error: 'feed_unreachable' })); }
      else if (v === 'apply') { D.upd = { ...D.upd, busy: true }; render(); const r = await postConfirm('/api/update/apply'); D.upd = await get('/api/update/check').catch(() => ({ error: 'feed_unreachable' })); D.updMsg = r.ok ? 'Downloaded and verified. Restart to install it.' : (UPD_ERR[r.body.error] || r.body.error || 'Refused.'); }
      else if (v === 'restart') { const r = await postConfirm('/api/update/restart'); D.updMsg = r.ok ? 'Restarting into the new version…' : (UPD_ERR[r.body.error] || r.body.error || 'Refused.'); }
    } catch { D.updMsg = 'The core did not answer.'; }
    render();
  }
  document.addEventListener('click', async e => {
    const c = e.target.closest('[data-st-copy]');
    if (c) { e.preventDefault(); e.stopPropagation(); void copy(c, c.dataset.stCopy); return; }
    const t = e.target.closest('[data-st]'); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    const [k, v] = t.dataset.st.split(':');
    if (k === 'open') { D.open = D.open === v ? null : v; render(); }
    else if (k === 'module') {
      const [, id, requested] = t.dataset.st.split(':');
      const enabled = requested === 'true';
      const r = await fetch(`/api/plugins/${encodeURIComponent(id)}/enabled`, { method: 'PUT', headers: {'content-type':'application/json'}, body: JSON.stringify({enabled}) });
      if (r.ok) {
        const result = await r.json(); D.modules = result.modules || D.modules;
        D.msg.modules = {text: result.applied === 'restart' ? `Saved. Restart CaesarOS to load ${id}.` : 'Saved.'};
        if (id === 'ideas' || id === 'goals') { const mod = D.modules.find(m => m.id === id), app = id === 'ideas' ? 'Ideas' : 'Goals'; if (mod?.running) OGS.mods.add(app); else OGS.mods.delete(app); }
        if (id === 'scheduling') { const mod = D.modules.find(m => m.id === id); window.OGSchedOn = !!mod?.running; if (window.OGSchedOn) OGS.mods.add('Scheduling'); else OGS.mods.delete('Scheduling'); if (!window.OGSchedOn && S.tabs[S.act]?.id === 'Scheduling') { S.tabs[S.act] = {k:'app',id:'Scheduling'}; } }
      } else D.msg.modules = {text: `Could not change the ${id} module.`, bad: true};
      render();
    }
    else if (k === 'theme') { void save('look', { theme: v }); }
    else if (k === 'pal') { window.__packPick = true; void save('look', { palette: v }); }
    else if (k === 'bg') { window.xBackground.set(v); }
    else if (k === 'motion') { void save('look', { motion: v }); }
    else if (k === 'lang') { void save('lang', { language: v }); }
    else if (k === 'voice') {
      const x = window.xVoice; if (!x) return; const arg = t.dataset.st.split(':')[2];
      if (v === 'on') { x.setOn(!x.on()); render(); } else if (v === 'pick') { x.setVoice(arg); render(); void window.xSpeak(document.documentElement.lang === 'pl' ? 'Dzień dobry, tu Caesar.' : 'Hello, this is Caesar.', { voice: arg }); }
      else if (v === 'test') void window.xSpeak(document.documentElement.lang === 'pl' ? 'Dzień dobry. Tak będę czytać odpowiedzi.' : 'Hello. This is how I will read answers.'); else if (v === 'stop') window.xSpeakStop();
    }
    else if (k === 'vtlang') { window.xVoiceLang && window.xVoiceLang.set(v); render(); }
    else if (k === 'vmode') { window.xVoiceMode && window.xVoiceMode.toggle(); render(); }
    else if (k === 'mascot') { if (window.xMascot) window.xMascot.toggle(); render(); }
    else if (k === 'tour') { if (window.xTour) window.xTour.start(); }
    else if (k === 'upd') { void updAct(v); }
    else if (k === 'rv') { if (v === 'toggle') { D.rvOpen = !D.rvOpen; D.rv = null; D.rvN = 40; render(); } else if (v === 'more') { D.rvN = (D.rvN || 40) + 40; render(); } else void reviewAct(v === 'ok' ? 'ok' : v === 'en' ? 'en' : 'save', +(t.dataset.st.split(':')[2])); }
    else if (k === 'i18n') {
      D.i18nBusy = true; D.msg.i18n = ''; render();
      (async () => {
        try { const r = window.I18N ? await window.I18N.translateNow(true) : { error: 'translation is not loaded' }; D.msg.i18n = r.error ? 'Could not translate: ' + r.error : r.done ? r.done + ' texts translated.' + (r.left ? ' ' + r.left + ' still waiting; press again.' : '') : 'Nothing to translate.'; D.i18nLeft = r.left || 0; }
        catch { D.msg.i18n = 'Could not translate: the model did not answer.'; }
        D.i18nBusy = false; render();
      })();
    }
    else if (k === 'mode') { void save('engines', { engine: v }); }
    else if (k === 'hconf') { D.hOpen = D.hOpen === v ? null : v; render(); }
    else if (k === 'brainloc') { void save('brain', { brain: { ...D.set.brain, location: v } }); }
    else if (k === 'backup') {
      t.disabled = true;
      (async () => {
        try {
          const r = await post('/api/backup'); const b = await r.json().catch(() => ({}));
          if (!r.ok) { D.msg.backup = { text: errText(b), bad: true }; }
          else { D.backups = await get('/api/backup').catch(() => D.backups); D.msg.backup = { text: 'Backup created: ' + (b.name || 'done') }; }
        } catch { D.msg.backup = { text: 'The core did not answer.', bad: true }; }
        render();
      })();
    }
  }, true);

  document.addEventListener('change', e => {
    if (!D.set) return;
    const r = e.target.closest('[data-st-range]');
    if (r) { void save('look', { textScale: Number(r.value) / 100 }); return; }
    const fd = e.target.closest('[data-st-feed]');
    if (fd) { D.upd = null; void save('updates', { updateFeed: fd.value.trim() }); return; }
    const f = e.target.closest('[data-st-prof]'), a = e.target.closest('[data-st-acct]'), b = e.target.closest('[data-st-brain-url]');
    if (!f && !a && !b) return;
    if (b) { void save('brain', { brain: { ...D.set.brain, url: b.value.trim() } }); return; }
    const prof = { ...D.set.profile };
    if (f) prof[f.dataset.stProf] = f.value.trim();
    else {
      const rest = (prof.accounts || []).filter(x => x.platform !== a.dataset.stAcct);
      prof.accounts = a.value.trim() ? [...rest, { platform: a.dataset.stAcct, handle: a.value.trim() }] : rest;
    }
    void save('you', { profile: prof });
  });

  document.addEventListener('input', e => {
    const r = e.target.closest('[data-st-range]'); if (!r) return;
    const pct = Number(r.value);
    root.style.fontSize = (16 * pct / 100) + 'px';              // live, before the save lands
    const label = r.closest('.st-row') && r.closest('.st-row').querySelector('.st-pct');
    if (label) label.textContent = pct + '%';
  });

  // The look (language, text size, palette) needs only settings and packs; it must not wait for the slow engine probe.
  // Live at once (data-bg is read by the background without a reload), then saved; palette and buttons share it.
  window.xBackground = { set(v) { if (!['rich', 'subtle', 'off'].includes(v)) return; root.dataset.bg = v; try { localStorage.setItem('caesaros-bg', v); } catch (_) {} if (D.set) D.set.background = v; void put('/api/settings', { background: v }).catch(() => {}); if (onPage()) render(); } };
  window.xLook = patch => { if (D.set) { Object.assign(D.set, patch); applyLook(); } };
  (async () => {
    try { const [set, packs] = await Promise.all([get('/api/settings'), get('/api/packs')]); if (!D.set) { D.set = set; D.packs = packs; window.SETTINGS = window.SETTINGS || set; applyLook(); } } catch { /* the core is down: the saved look stays */ }
    try { await load(); applyLook(); if (onPage()) render(); } catch { D.loaded = 'error'; if (onPage()) render(); }
  })();
})();
