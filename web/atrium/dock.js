/* The chat dock (plan 8.10, 8.10a): one persistent conversation in a small window that floats over every page.
   It draws no stream of its own: messages come from the chat view's own renderer and a turn runs through
   window.xTurn in bridge.js, so the dock and a chat tab are the same conversation. */
(() => {
  register({ id: 'dock', views: {} });   // it adds no view: it floats over every one
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // the registry test's stub

  const KEY = 'caesar.dock.v1', SOLO = 'hermes:caesar!alone';
  let wasOpen = false;
  const DW = 380, DH = 520, LS = 52, EDGE = 16;   // default window size, launcher size, the gap the launcher keeps from a side
  const D = { open: false, id: null, tabs: [], w: DW, h: DH, r: 24, b: 40, busyIds: new Set(), note: '', sig: '', min: false, menu: false, last: '', seen: {}, cnt: {}, ready: new Set(), tried: new Set(), drafts: {}, latestUn: '', tabsHtml: '' };
  const M = { id: '', d: null, at: 0, key: '', busy: false }, LIM = { d: null, at: 0 };   // context size of the front tab, plan usage
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; wasOpen = s.open === true; if (typeof s.id === 'string') D.id = s.id; if (Array.isArray(s.tabs)) D.tabs = s.tabs.filter((x) => typeof x === 'string').slice(0, 12); if (D.id && !D.tabs.includes(D.id)) D.tabs.push(D.id); if (Number(s.w) >= 320) D.w = Number(s.w); if (Number(s.h) >= 260) D.h = Number(s.h); if (Number.isFinite(+s.r)) D.r = +s.r; if (Number.isFinite(+s.b)) D.b = +s.b; } catch { /* private mode: defaults are fine */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ open: D.open, id: D.id, tabs: D.tabs, w: D.w, h: D.h, r: D.r, b: D.b })); } catch { /* private mode */ } };

  const el = document.createElement('div');
  el.className = 'cdk';
  const ic = (n, z = 16) => `<svg class="icon" width="${z}" height="${z}" aria-hidden="true"><use href="icons/legio.svg#i-${n}"></use></svg>`;
  const SUGGEST = ['Summarise what I am looking at', 'What needs my attention today?', 'Help me plan my next hour'];
  el.innerHTML = `
    <button class="cdk-launch" type="button" aria-label="Quick ask (Ctrl+J)" aria-keyshortcuts="Control+J" aria-expanded="false" aria-controls="cdk-win">
      <img alt="" src="caesar/portrait-neo.png" draggable="false"><span class="cdk-tag" aria-hidden="true">ASK</span><i class="cdk-diamond" aria-hidden="true"></i><em class="cdk-badge" hidden></em>
    </button>
    <section class="cdk-win" id="cdk-win" role="dialog" aria-label="Quick ask" aria-hidden="true">
      <div class="cdk-face">
        <header class="cdk-hd">
          <span class="cdk-av"><img alt="" src="caesar/portrait-neo.png" draggable="false"></span>
          <span class="cdk-id"><b data-no-i18n>Caesar</b><span class="cdk-st"><i aria-hidden="true"></i><span class="cdk-stx" role="status">Ready</span></span></span>
          <span class="cdk-btns">
            <button class="cdk-btn" type="button" data-dk="split" title="Open in split" aria-label="Open in split">${ic('split')}</button>
            <button class="cdk-btn" type="button" data-dk="tab" title="Open in a tab" aria-label="Open in a tab">${ic('expand')}</button>
            <button class="cdk-btn" type="button" data-dk="fold" title="Minimise" aria-label="Minimise" aria-pressed="false">${ic('minus')}</button>
            <button class="cdk-btn" type="button" data-dk="min" title="Close (Esc)" aria-label="Close">${ic('close')}</button>
          </span>
        </header>
        <div class="cdk-tabs" role="tablist" aria-label="Conversations"></div>
        <div class="cdk-live" aria-hidden="true"></div>
        <div class="cdk-body">
          <div class="cdk-thread" tabindex="0" aria-label="Conversation"></div>
          <button class="cdk-latest" type="button" data-dk="latest" hidden>${ic('chevron-down', 14)}<span>Latest</span></button>
        </div>
        <div class="cdk-meter" hidden></div>
        <form class="cdk-comp">
          <div class="cdk-tray" hidden></div>
          <div class="cdk-box">
            <textarea class="cdk-inp" rows="1" placeholder="Ask anything about this page" aria-label="Message Caesar" autocomplete="off"></textarea>
            <div class="cdk-bar">
              <button class="cdk-tb" type="button" data-dk="attach" title="Attach images or text files" aria-label="Attach">${ic('attach')}</button>
              <button class="cdk-tb" type="button" data-dk="mic" title="Microphone: speak instead of typing" aria-label="Microphone" data-state="idle">${ic('mic')}</button>
              <span class="cdk-pm"><button class="cdk-chip" type="button" data-dk="model" aria-haspopup="true" aria-expanded="false" title="The engine and model this conversation talks to">${ic('engine', 14)}<span class="cdk-chip-t">Caesar</span>${ic('chevron-down', 12)}</button><ul class="cdk-menu" role="menu" hidden></ul></span>
              <button class="cdk-send" type="submit" aria-label="Send" title="Send (Enter)">${ic('arrow', 16)}</button>
            </div>
          </div>
        </form>
        <div class="cdk-sweep" aria-hidden="true"></div>
      </div>
      <i class="cdk-nw" aria-hidden="true"></i>
      <div class="cdk-grip" data-dk-edge="n"  tabindex="0" role="separator" aria-label="Resize top edge"></div>
      <div class="cdk-grip" data-dk-edge="s"  tabindex="0" role="separator" aria-label="Resize bottom edge"></div>
      <div class="cdk-grip" data-dk-edge="w"  tabindex="0" role="separator" aria-label="Resize left edge"></div>
      <div class="cdk-grip" data-dk-edge="e"  tabindex="0" role="separator" aria-label="Resize right edge"></div>
      <div class="cdk-grip" data-dk-edge="nw" tabindex="0" role="separator" aria-label="Resize top left corner"></div>
      <div class="cdk-grip" data-dk-edge="ne" tabindex="0" role="separator" aria-label="Resize top right corner"></div>
      <div class="cdk-grip" data-dk-edge="sw" tabindex="0" role="separator" aria-label="Resize bottom left corner"></div>
      <div class="cdk-grip" data-dk-edge="se" tabindex="0" role="separator" aria-label="Resize bottom right corner"></div>
    </section>`;
  document.body.appendChild(el);

  const q = (s) => el.querySelector(s), launch = q('.cdk-launch'), win = q('.cdk-win'), thread = q('.cdk-thread'), inp = q('.cdk-inp'), stx = q('.cdk-stx'), avatar = q('.cdk-av img'), latest = q('.cdk-latest'), tray = q('.cdk-tray'), menu = q('.cdk-menu'), chipT = q('.cdk-chip-t'), strip = q('.cdk-tabs'), meter = q('.cdk-meter'), badge = q('.cdk-badge'), launchImg = q('.cdk-launch img');

  const waiting = () => (S.waiting || []).filter((w) => w.th && w.th === D.id);
  const pageShows = (id) => { const t = S.tabs && S.tabs[S.act]; return !!(id && ((t && t.k === 'chat' && t.id === id) || (S.split && S.cur === id))); };
  const shownInPage = () => pageShows(D.id);
  const busyNow = () => !!(D.id && D.busyIds.has(D.id));

  // ---- unread: replies that arrived while that tab was not in front (window shut, another tab, another page) ----
  const replies = (id) => (MSG[id] || []).filter((m) => !m.me && m.x).length;
  const viewed = (id) => (D.open && !D.min && id === D.id) || pageShows(id);
  const unreadOf = (id) => !D.ready.has(id) ? 0 : Math.max(0, replies(id) - (D.seen[id] ?? replies(id)));
  const unreadAll = () => D.tabs.reduce((n, id) => n + unreadOf(id), 0);
  function track() {
    for (const id of D.tabs) {
      if (!D.ready.has(id)) continue;   // history still loading: its messages are not news
      const n = replies(id);
      if (D.seen[id] === undefined || viewed(id)) D.seen[id] = n;
      else if (n > (D.cnt[id] ?? n)) D.latestUn = id;
      D.cnt[id] = n;
    }
  }
  const addTab = (id) => { if (id && !D.tabs.includes(id) && D.tabs.length < 12) D.tabs.push(id); };
  function dropTab(id) {
    const i = D.tabs.indexOf(id); if (i < 0) return;
    D.tabs.splice(i, 1); delete D.seen[id]; delete D.cnt[id]; D.ready.delete(id); delete D.drafts[id];
    if (D.id === id) { D.id = D.tabs[i] || D.tabs[i - 1] || null; inp.value = D.drafts[D.id || ''] || ''; }   // the next tab comes forward
  }

  // ---- context size and plan limit, as text and a bar (never in a tooltip) ----
  const kk = (n) => n < 1000 ? String(n) : (n < 10000 ? (n / 1000).toFixed(1) : Math.round(n / 1000)) + 'k';
  async function loadMeter(id) {
    if (M.busy || !id) return; M.busy = true; M.at = Date.now();
    try {
      const mo = S.perThread && S.perThread[id] || '';
      const r = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}/context?model=${encodeURIComponent(mo)}`), d = r.ok ? await r.json() : null;
      if (M.id === id) { const k = JSON.stringify(d); if (k !== M.key) { M.key = k; M.d = d; D.sig = ''; } }
    } catch { /* offline: keep the last reading */ }
    M.busy = false;
  }
  async function loadLimits() {
    LIM.at = Date.now();
    try { const r = await fetch('/api/usage/limits'), d = r.ok ? await r.json() : null; const k = JSON.stringify(d); if (k !== LIM.k) { LIM.k = k; LIM.d = d; D.sig = ''; } } catch { /* offline */ }
  }
  function meterHtml() {
    const d = M.d, w = d && d.window, lim = w && (w.set || w.max), pct = lim ? Math.min(100, Math.round(d.tokens / lim * 100)) : 0;
    const hot = (Array.isArray(LIM.d) ? LIM.d : []).filter((t) => t.state !== 'none' && t.weekly && t.weekly.percent >= 90);
    const warn = [];
    if (lim && pct >= 80) warn.push(pct >= 100 ? "This chat is over the model's room. Summarise older messages in the chat tab." : "This chat is nearly at the model's room. Summarise older messages in the chat tab.");
    for (const t of hot) warn.push(`${t.name} has used ${Math.round(t.weekly.percent)}% of its week.`);
    if (!d && !warn.length) return '';
    return (d ? `<div class="cdk-mt"><span class="cdk-mt-t">${lim ? `Chat size ${pct}%` : `Chat size about ${kk(d.tokens)}`}</span>${lim ? `<span class="cdk-mt-bar${pct >= 80 ? ' hot' : ''}" role="img" aria-label="${pct} percent of the model's room used"><i style="width:${pct}%"></i></span>` : ''}</div>` : '')
      + warn.map((t) => `<p class="cdk-mt-w" role="status">${esc(t)}</p>`).join('');
  }
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  function sync() {
    el.dataset.theme = root.dataset.theme === 'neutral' ? 'neutral' : 'caesaros';
    el.classList.toggle('cdk-anim', root.dataset.motion === 'on' && !reduced());
    el.classList.toggle('cdk-simple', !!S.simple);
    el.classList.toggle('cdk-dupe', shownInPage());
    el.classList.toggle('cdk-has-un', unreadAll() > 0);
    if (S.simple && D.open) close2(false);
  }

  function clampSize() {
    D.w = Math.min(Math.max(D.w, 320), Math.max(320, Math.round(innerWidth * 0.9)));
    D.h = Math.min(Math.max(D.h, 260), Math.max(260, Math.round(innerHeight * 0.9)));
    win.style.width = D.w + 'px'; win.style.height = D.h + 'px';
    D.r = Math.min(Math.max(D.r, 8), Math.max(8, innerWidth - LS - 8)); D.b = Math.min(Math.max(D.b, 8), Math.max(8, innerHeight - LS - 8));
    el.style.setProperty('--cdk-r', D.r + 'px'); el.style.setProperty('--cdk-b', D.b + 'px');
    el.style.setProperty('--cdk-wr', Math.min(D.r, Math.max(8, innerWidth - D.w - 8)) + 'px');   // the window never leaves the screen when the launcher sits on the far side
  }

  // the chat renderer leaves ``` fences as text inside one paragraph: split them out into real code blocks (text is already escaped)
  const codeBlocks = (h) => h.replace(/<p>([\s\S]*?)<\/p>/g, (all, t) => {
    if (!t.includes('```') && !/`[^`\n]+`/.test(t)) return all;
    const parts = t.split(/```[^\n`]*\n?([\s\S]*?)```/);
    const inline = (x) => x.replace(/`([^`\n]+)`/g, '<code class="cdk-ic">$1</code>');
    return parts.map((x, i) => i % 2 ? `<pre class="cdk-code"><code>${x.replace(/\n$/, '')}</code></pre>` : (x.trim() ? `<p>${inline(x.trim())}</p>` : '')).join('');
  });
  function msgsHtml(id) {
    const tmp = document.createElement('div'); tmp.innerHTML = chatView(id);
    const got = tmp.querySelector('#msgs'); if (!got) return '';
    // the chat page's own markup; the attribute renames keep the page's document-wide handlers from acting on a dock copy
    return codeBlocks(got.innerHTML).replace(/data-fold=/g, 'data-dk-fold=').replace(/data-ok(?=[\s>])/g, 'data-dk-ok').replace(/data-no(?=[\s>])/g, 'data-dk-no');
  }
  const apprHtml = (wait) => wait.map((w) => `<div class="cdk-ap"><b>Needs your yes</b><p data-no-i18n>${esc(w.t)}</p><div class="cdk-apb">
      <button class="cdk-apb-a" type="button" data-dk-approve="${esc(w.k)}">APPROVE</button>
      <button class="cdk-apb-n" type="button" data-dk-deny="${esc(w.k)}">NOT NOW</button></div></div>`).join('');

  function paint(force) {
    track(); sync();
    const th = D.id ? THR(D.id) : null;
    const wait = waiting();
    const busy = busyNow() || !!(th && C[th.a] && C[th.a].st === 'work');
    if (D.open && D.id && !D.min) {   // keep the size reading fresh for the tab in front
      if (M.id !== D.id) Object.assign(M, { id: D.id, d: null, key: '', at: 0 });
      if (!M.busy && (Date.now() - M.at > 30000 || M.n !== (MSG[D.id] || []).length)) { M.n = (MSG[D.id] || []).length; void loadMeter(D.id); }
      if (Date.now() - LIM.at > 60000) void loadLimits();
    }
    const un = unreadAll();
    const list = D.id && MSG[D.id] ? MSG[D.id] : [];
    const last = list[list.length - 1];
    const sig = [D.id, list.length, last ? String(last.x || '').length : 0, wait.map((w) => w.k).join(','), busy ? 1 : 0, D.note, D.open, D.min, D.menu, D.tabs.join(','), D.tabs.map(unreadOf).join(','), M.key.length, LIM.k ? LIM.k.length : 0, (S.files || []).length, S.perThread && D.id ? S.perThread[D.id] : ''].join('|');
    if (!force && sig === D.sig) return;
    D.sig = sig;
    el.classList.toggle('cdk-busy', !!busy);
    el.classList.toggle('cdk-wait', wait.length > 0);
    el.classList.toggle('cdk-open', D.open);
    win.setAttribute('aria-hidden', D.open ? 'false' : 'true');
    launch.setAttribute('aria-expanded', D.open ? 'true' : 'false');
    stx.textContent = busy ? 'Working' : wait.length ? 'Waiting for you' : D.note ? 'Problem' : 'Ready';
    el.classList.toggle('cdk-err', !!D.note);
    const ut = un && D.latestUn && unreadOf(D.latestUn) ? THR(D.latestUn) : null, uc = ut && C[ut.a];   // the launcher wears the face of whoever answered
    launchImg.src = uc ? uc.img : 'caesar/portrait-neo.png';
    badge.hidden = !un; badge.textContent = un > 9 ? '9+' : String(un);
    launch.setAttribute('aria-label', un ? `Quick ask, ${un} unread ${un === 1 ? 'reply' : 'replies'} (Ctrl+J)` : 'Quick ask (Ctrl+J)');
    el.classList.toggle('cdk-min', D.min);
    q('[data-dk=fold]').setAttribute('aria-pressed', D.min ? 'true' : 'false');
    if (th && C[th.a]) { avatar.src = C[th.a].img; q('.cdk-id b').textContent = C[th.a].n || 'Caesar'; } else { avatar.src = 'caesar/portrait-neo.png'; q('.cdk-id b').textContent = 'Caesar'; }
    if (!D.open) return;
    paintBar(th); paintTabs();
    const mh = D.min ? '' : meterHtml(); if (meter.innerHTML !== mh) meter.innerHTML = mh; meter.hidden = !mh;
    const near = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48, keep = thread.scrollTop;
    const errHtml = D.note ? `<div class="cdk-error" role="alert"><b>Something went wrong</b><p>${esc(D.note)}</p>${D.last ? '<button type="button" data-dk="retry">RETRY</button>' : ''}</div>` : '';
    const empty = !(th && list.length);
    thread.innerHTML = empty
      ? `<div class="cdk-empty"><b>Ask Caesar</b><p>One conversation that stays with you as you move around the app.</p><div class="cdk-sg">${SUGGEST.map((t, i) => `<button type="button" data-dk="sg" data-q="${esc(t)}"><i>0${i + 1}</i><span>${esc(t)}</span></button>`).join('')}</div></div>${errHtml}`
      : msgsHtml(th.id) + apprHtml(wait) + errHtml;
    thread.scrollTop = near || force ? thread.scrollHeight : keep;
    thread.setAttribute('aria-busy', busy ? 'true' : 'false');
    latest.hidden = near || empty;
  }

  function paintTabs() {
    const one = (id) => { const t = THR(id), a = t && C[t.a], u = unreadOf(id), nm = a ? (a.n || 'Caesar') : 'Chat', on = id === D.id;
      return `<div class="cdk-tab${on ? ' on' : ''}${u ? ' un' : ''}"><button type="button" class="cdk-tabb" role="tab" aria-selected="${on}" data-dk="tgo" data-id="${esc(id)}"><img alt="" src="${esc(a ? a.img : 'caesar/portrait-neo.png')}" draggable="false"><span data-no-i18n>${esc(nm)}</span>${u ? `<em class="cdk-un" aria-label="${u} unread">${u > 9 ? '9+' : u}</em>` : ''}</button><button type="button" class="cdk-tabx" data-dk="tx" data-id="${esc(id)}" aria-label="Close ${esc(nm)}">${ic('close', 10)}</button></div>`; };
    const fresh = D.id ? '' : `<div class="cdk-tab on"><button type="button" class="cdk-tabb" role="tab" aria-selected="true" data-dk="tgo" data-id=""><span>New</span></button><button type="button" class="cdk-tabx" data-dk="tx" data-id="" aria-label="Close new tab">${ic('close', 10)}</button></div>`;
    const h = D.tabs.map(one).join('') + fresh + `<button type="button" class="cdk-tabn" data-dk="tnew" aria-label="New conversation" title="New conversation">${ic('plus', 14)}</button>`;
    if (h === D.tabsHtml) return;
    const x = strip.scrollLeft; D.tabsHtml = h; strip.innerHTML = h; strip.scrollLeft = x;
    const on = strip.querySelector('.cdk-tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function go(id) {
    D.drafts[D.id || ''] = inp.value; D.id = id || null; D.menu = false; D.note = ''; inp.value = D.drafts[D.id || ''] || ''; inp.dispatchEvent(new Event('input'));
    D.sig = ''; paint(true); save();
    if (D.id && !D.ready.has(D.id)) void ensure(D.id).then(() => paint(true));
  }
  function closeTab(id) {
    if (!id || !D.tabs.includes(id)) {   // the empty "New" tab: go back to the last real one, or shut
      if (D.tabs.length) return go(D.tabs[D.tabs.length - 1]);
      return close2();
    }
    dropTab(id); D.sig = '';
    if (!D.tabs.length && !D.id) { close2(); return; }   // none left: the window closes
    if (D.id && !D.ready.has(D.id)) void ensure(D.id).then(() => paint(true));
    paint(true); save();
  }

  // the composer's toolbar: attached files, the engine chip and its menu, the mic state
  const kbs = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function paintBar(th) {
    const files = S.files || [], prob = window.xAttProblem ? window.xAttProblem() : '';
    tray.hidden = !files.length && !prob;
    tray.innerHTML = files.map((f, i) => `<span class="cdk-file">${ic('attach', 12)}<b data-no-i18n>${esc(f.name)}</b><small>${kbs(f.size)}</small><button type="button" data-dk="rmfile" data-i="${i}" aria-label="Remove ${esc(f.name)}">${ic('close', 12)}</button></span>`).join('') + (prob ? `<p class="cdk-file-e" role="alert">${esc(prob)}</p>` : '');
    const em = th && window.xEngineOf ? window.xEngineOf(th) : null, models = em ? em.models : [];
    const cur = th && S.perThread && S.perThread[th.id] && models.some((m) => m.id === S.perThread[th.id]) ? S.perThread[th.id] : (models[0] || {}).id;
    chipT.textContent = em ? `${em.label || 'engine'} · ${(models.find((m) => m.id === cur) || {}).label || cur || 'default'}` : 'Caesar · default';
    const mb = q('[data-dk=model]'); mb.disabled = models.length < 2; mb.setAttribute('aria-expanded', D.menu && models.length > 1 ? 'true' : 'false');
    menu.hidden = !(D.menu && models.length > 1);
    let at = '';
    menu.innerHTML = models.map((m) => {
      const g = m.group || em.label || 'Models';
      const head = g === at ? '' : (at = g, `<li class="cdk-mg" role="presentation">${esc(g)}</li>`);
      return head + `<li><button type="button" role="menuitemradio" aria-checked="${m.id === cur}" class="${m.id === cur ? 'on' : ''}" data-dk="pick" data-m="${esc(m.id)}">${esc(m.label)}</button></li>`;
    }).join('');
  }

  async function adopt(session, front = true) { window.xAdopt(session); addTab(session.id); if (front) D.id = session.id; save(); }

  // bring one conversation (the front one by default) into the lists the chat view reads; without an id, start a new one
  async function ensure(id = D.id) {
    if (id && THR(id)) { try { await window.xLoad(id); } catch { /* history shows on the next turn */ } D.ready.add(id); return true; }
    if (id) {   // a remembered conversation
      try {
        const r = await fetch('/api/chat/sessions/' + encodeURIComponent(id)), got = await r.json();
        if (r.ok && got.session) { await adopt(got.session, id === D.id); await window.xLoad(id); D.ready.add(id); return true; }
        const front = id === D.id; dropTab(id); save();
        if (!front) return false;
        D.id = null;
      } catch { D.note = 'The saved conversation could not be reached.'; return false; }
    }
    try {
      const r = await fetch('/api/chat/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engine: SOLO, model: 'default' }) });
      const s = await r.json().catch(() => ({}));
      if (!r.ok || !s.id) throw new Error(s.error || r.status);
      await adopt(s); D.ready.add(s.id); return true;
    } catch { D.note = 'The conversation could not start.'; paint(true); return false; }
  }
  // restore the other tabs quietly, once each, so their unread counts work before the window is ever opened
  function warm() { for (const id of D.tabs) if (!D.ready.has(id) && !D.tried.has(id)) { D.tried.add(id); void ensure(id).then(() => paint(false)); } }

  async function sendMsg(text) {
    const v = (typeof text === 'string' ? text : inp.value).trim(); if (!v || busyNow()) return;
    inp.value = ''; inp.style.height = 'auto'; D.note = ''; D.last = v; D.menu = false;
    if (!(await ensure())) return;
    const id = D.id, th = THR(id); if (!th) return;   // the turn keeps its own id: the tab may change while it runs
    const list = MSG[id] = MSG[id] || [];
    const files = (S.files || []).slice(); S.files = [];
    list.push({ me: 1, x: v, files: files.map(({ name, kind, size }) => ({ name, kind, size })) });
    const reply = { a: th.a, x: '' }; list.push(reply);
    const prev = C[th.a] ? C[th.a].st : 'idle';
    if (C[th.a]) C[th.a].st = 'work';
    D.busyIds.add(id); D.sig = ''; paint(true);
    await window.xTurn(id, v, files, reply, () => { D.sig = ''; paint(true); });
    D.busyIds.delete(id); if (C[th.a]) C[th.a].st = prev;
    if (/could not answer|could not start|did not answer/i.test(reply.x || '')) { list.splice(list.indexOf(reply), 1); D.note = reply.x; }
    paint(true);
  }

  function openDock(quiet) {
    sync();
    if (S.simple) return;
    D.open = true; D.sig = ''; paint(true); save();
    if (D.id) void ensure().then(() => paint(true));   // resume the remembered conversation; a new one waits for the first send
    if (!quiet) setTimeout(() => { try { inp.focus(); } catch { /* not focusable yet */ } }, 20);
  }
  function close2(focus) {
    D.open = false; D.sig = ''; paint(true); save();
    if (focus !== false) { try { launch.focus(); } catch { /* ignore */ } }
  }
  function promote(kind) {
    D.open = false;
    if (kind === 'split') S.split = true;
    open_({ k: 'chat', id: D.id || '' });
    render(); D.sig = ''; paint(true);
  }

  // ---- clicks: the dock's own controls, the reused message markup and the approval card ----
  el.addEventListener('click', (e) => {
    if (D.menu && e.target.closest && !e.target.closest('.cdk-pm')) { D.menu = false; paint(true); }
    const t = e.target.closest ? e.target.closest('[data-dk],[data-dk-approve],[data-dk-deny],[data-dk-fold]') : null;
    if (!t) { if (e.target.closest && e.target.closest('.cdk-launch')) { e.preventDefault(); if (launch.dataset.moved) delete launch.dataset.moved; else openDock(); } return; }
    e.preventDefault(); e.stopPropagation();
    if (t.dataset.dk === 'tab') promote('tab');
    else if (t.dataset.dk === 'split') promote('split');
    else if (t.dataset.dk === 'min') close2();
    else if (t.dataset.dk === 'tgo') { if (t.dataset.id !== (D.id || '')) go(t.dataset.id); }
    else if (t.dataset.dk === 'tx') closeTab(t.dataset.id);
    else if (t.dataset.dk === 'tnew') go('');
    else if (t.dataset.dk === 'fold') { D.min = !D.min; D.menu = false; paint(true); }
    else if (t.dataset.dk === 'latest') { thread.scrollTop = thread.scrollHeight; latest.hidden = true; }
    else if (t.dataset.dk === 'sg') void sendMsg(t.dataset.q);
    else if (t.dataset.dk === 'retry') { const v = D.last; D.note = ''; void sendMsg(v); }
    else if (t.dataset.dk === 'attach') { if (window.xPickFiles) window.xPickFiles(); }
    else if (t.dataset.dk === 'rmfile') { S.files.splice(+t.dataset.i, 1); paint(true); }
    else if (t.dataset.dk === 'model') { D.menu = !D.menu; paint(true); }
    else if (t.dataset.dk === 'pick') { if (D.id) { S.perThread = S.perThread || {}; S.perThread[D.id] = t.dataset.m; const em = window.xEngineOf && THR(D.id) ? window.xEngineOf(THR(D.id)) : null; if (em && em.eng && window.xModelPick) void window.xModelPick(em.eng, t.dataset.m); } D.menu = false; paint(true); }
    else if (t.dataset.dk === 'mic') {
      const b = q('[data-dk=mic]');
      if (window.xAtriumMic) void window.xAtriumMic({ done: (x) => { inp.value = (inp.value ? inp.value + ' ' : '') + x; inp.dispatchEvent(new Event('input')); inp.focus(); }, st: (txt, st) => { b.dataset.state = st || 'idle'; b.title = txt; } });
    }
    else if (t.dataset.dkApprove || t.dataset.dkDeny) { const k = t.dataset.dkApprove || t.dataset.dkDeny; void approve(k, !!t.dataset.dkApprove).then(() => paint(true)); }
    else if (t.dataset.dkFold) {
      const m = (MSG[D.id] || [])[+t.dataset.mi]; if (!m) return;
      const k = t.dataset.dkFold;
      if (k === 'think') m.openThink = !m.openThink;
      else if (k === 'src') m.openSrc = !m.openSrc;
      else if (m.tools && m.tools[+t.dataset.ti]) m.tools[+t.dataset.ti].open = !m.tools[+t.dataset.ti].open;
      paint(true);
    }
  }, true);

  // ---- move: drag the header (or the launcher); on a phone the window is a fixed sheet, the launcher still drags ----
  // the launcher lets go on the nearer side edge and stays inside the screen
  function snap() { D.r = D.r + LS / 2 > innerWidth / 2 ? innerWidth - LS - EDGE : EDGE; clampSize(); }
  launch.addEventListener('keydown', (e) => {   // Shift+arrows move it without a pointer
    const d = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!e.shiftKey || !d) return;
    e.preventDefault(); D.r += d[0] * 24; D.b += d[1] * 24; clampSize(); save();
  });
  strip.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); strip.scrollLeft += e.deltaY; } }, { passive: false });   // a vertical wheel scrolls the strip sideways
  const dragMove = (h, isLaunch) => h.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (!isLaunch && (e.target.closest('button') || innerWidth <= 760))) return;
    const sx = e.clientX, sy = e.clientY, r0 = D.r, b0 = D.b; let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true; el.classList.add('cdk-moving'); D.r = r0 - (ev.clientX - sx); D.b = b0 - (ev.clientY - sy); clampSize();
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      el.classList.remove('cdk-moving'); if (moved) { if (isLaunch) { snap(); h.dataset.moved = '1'; } save(); }
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  dragMove(q('.cdk-hd'), false); dragMove(launch, true);

  q('.cdk-comp').addEventListener('submit', (e) => { e.preventDefault(); void sendMsg(); });
  inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 160) + 'px'; });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMsg(); } else if (e.key === 'Escape') { e.preventDefault(); close2(); } });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'j') { e.preventDefault(); D.open ? close2() : openDock(); }
  }, true);

  // ---- live resize: any edge or corner, following the pointer; arrows on a focused grip ----
  el.querySelectorAll('[data-dk-edge]').forEach((g) => {
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); g.focus();
      const edge = g.dataset.dkEdge, sx = e.clientX, sy = e.clientY, w0 = D.w, h0 = D.h;
      try { g.setPointerCapture(e.pointerId); } catch { /* older pickers */ }
      const mv = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (edge.includes('w')) D.w = w0 - dx;
        if (edge.includes('e')) D.w = w0 + dx;
        if (edge.includes('n')) D.h = h0 - dy;
        if (edge.includes('s')) D.h = h0 + dy;
        clampSize();
      };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); save(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
    g.addEventListener('keydown', (e) => {
      const edge = g.dataset.dkEdge, step = e.shiftKey ? 48 : 16, k = e.key; let used = false;
      // an arrow moves the focused edge the way a drag would: outward grows the window
      if (k === 'ArrowLeft' && edge.includes('w')) { D.w += step; used = true; }
      if (k === 'ArrowRight' && edge.includes('w')) { D.w -= step; used = true; }
      if (k === 'ArrowRight' && edge.includes('e')) { D.w += step; used = true; }
      if (k === 'ArrowLeft' && edge.includes('e')) { D.w -= step; used = true; }
      if (k === 'ArrowUp' && edge.includes('n')) { D.h += step; used = true; }
      if (k === 'ArrowDown' && edge.includes('n')) { D.h -= step; used = true; }
      if (k === 'ArrowDown' && edge.includes('s')) { D.h += step; used = true; }
      if (k === 'ArrowUp' && edge.includes('s')) { D.h -= step; used = true; }
      if (k === 'Home') { D.w = DW; D.h = DH; used = true; }   // back to the default size
      if (used) { e.preventDefault(); clampSize(); save(); }
    });
  });

  addEventListener('resize', () => { clampSize(); paint(true); });
  if (typeof MutationObserver !== 'undefined') new MutationObserver(() => { sync(); paint(false); }).observe(root, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-motion'] });
  setInterval(() => { warm(); paint(false); }, 2000);

  clampSize(); sync(); warm(); paint(true);
  if (wasOpen) openDock(true);   // a reload brings the window and its conversation back
  window.CDK = { open: openDock, minimise: close2, state: D, unread: unreadAll };   // for the browser checks and other modules
})();
