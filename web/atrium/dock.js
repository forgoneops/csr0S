/* The chat dock (plan 8.10, 8.10a): one persistent conversation in a small window that floats over every page.
   It draws no stream of its own: messages come from the chat view's own renderer and a turn runs through
   window.xTurn in bridge.js, so the dock and a chat tab are the same conversation. */
(() => {
  register({ id: 'dock', views: {} });   // it adds no view: it floats over every one
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // the registry test's stub

  const KEY = 'caesar.dock.v1', SOLO = 'hermes:caesar!alone';
  let wasOpen = false;
  const D = { open: false, id: null, w: 380, h: 520, r: 24, b: 40, busy: false, note: '', sig: '' };
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; wasOpen = s.open === true; if (typeof s.id === 'string') D.id = s.id; if (Number(s.w) >= 320) D.w = Number(s.w); if (Number(s.h) >= 260) D.h = Number(s.h); if (Number.isFinite(+s.r)) D.r = +s.r; if (Number.isFinite(+s.b)) D.b = +s.b; } catch { /* private mode: defaults are fine */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ open: D.open, id: D.id, w: D.w, h: D.h, r: D.r, b: D.b })); } catch { /* private mode */ } };

  const el = document.createElement('div');
  el.className = 'cdk';
  el.innerHTML = `
    <button class="cdk-launch" type="button" aria-label="Quick ask (Ctrl+J)" aria-expanded="false" aria-controls="cdk-win">
      <img alt="" src="caesar/portrait-neo.png" draggable="false"><span class="cdk-tag" aria-hidden="true">ASK</span><i class="cdk-diamond" aria-hidden="true"></i>
    </button>
    <section class="cdk-win" id="cdk-win" role="dialog" aria-label="Quick ask" aria-hidden="true">
      <div class="cdk-face">
        <div class="cdk-meander" aria-hidden="true"></div>
        <i class="cdk-corner cdk-c1" aria-hidden="true"></i><i class="cdk-corner cdk-c2" aria-hidden="true"></i>
        <header class="cdk-hd">
          <span class="cdk-av"><img alt="" src="caesar/portrait-neo.png" draggable="false"></span>
          <span class="cdk-id"><b data-no-i18n>Caesar</b><small>Quick ask</small></span>
          <span class="cdk-st"><i aria-hidden="true"></i><span class="cdk-stx">Ready</span></span>
          <span class="cdk-btns">
            <button class="cdk-btn" type="button" data-dk="tab" title="Open in a tab" aria-label="Open in a tab">&#10530;</button>
            <button class="cdk-btn" type="button" data-dk="split" title="Open in split" aria-label="Open in split">&#9638;</button>
            <button class="cdk-btn" type="button" data-dk="min" title="Minimise" aria-label="Minimise">&#8211;</button>
          </span>
        </header>
        <div class="cdk-thread" tabindex="0" aria-label="Conversation"></div>
        <form class="cdk-comp"><div class="cdk-box">
          <textarea class="cdk-inp" rows="1" placeholder="Ask anything about this page" aria-label="Message Caesar" autocomplete="off"></textarea>
          <button class="cdk-send" type="submit" aria-label="Send">&#10148;</button>
        </div></form>
        <div class="cdk-sweep" aria-hidden="true"></div>
      </div>
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

  const q = (s) => el.querySelector(s), launch = q('.cdk-launch'), win = q('.cdk-win'), thread = q('.cdk-thread'), inp = q('.cdk-inp'), stx = q('.cdk-stx'), avatar = q('.cdk-av img');

  const waiting = () => (S.waiting || []).filter((w) => w.th && w.th === D.id);
  const shownInPage = () => { const t = S.tabs && S.tabs[S.act]; return !!(D.id && ((t && t.k === 'chat' && t.id === D.id) || (S.split && S.cur === D.id))); };
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  function sync() {
    el.dataset.theme = root.dataset.theme === 'neutral' ? 'neutral' : 'caesaros';
    el.classList.toggle('cdk-anim', root.dataset.motion === 'on' && !reduced());
    el.classList.toggle('cdk-simple', !!S.simple);
    el.classList.toggle('cdk-dupe', shownInPage());
    if (S.simple && D.open) close2(false);
  }

  function clampSize() {
    D.w = Math.min(Math.max(D.w, 320), Math.max(320, Math.round(innerWidth * 0.9)));
    D.h = Math.min(Math.max(D.h, 260), Math.max(260, Math.round(innerHeight * 0.9)));
    win.style.width = D.w + 'px'; win.style.height = D.h + 'px';
    D.r = Math.min(Math.max(D.r, 8), Math.max(8, innerWidth - 60)); D.b = Math.min(Math.max(D.b, 8), Math.max(8, innerHeight - 60));
    el.style.setProperty('--cdk-r', D.r + 'px'); el.style.setProperty('--cdk-b', D.b + 'px');
  }

  function msgsHtml(id) {
    const tmp = document.createElement('div'); tmp.innerHTML = chatView(id);
    const got = tmp.querySelector('#msgs'); if (!got) return '';
    // the chat page's own markup; the attribute renames keep the page's document-wide handlers from acting on a dock copy
    return got.innerHTML.replace(/data-fold=/g, 'data-dk-fold=').replace(/data-ok(?=[\s>])/g, 'data-dk-ok').replace(/data-no(?=[\s>])/g, 'data-dk-no');
  }
  const apprHtml = (wait) => wait.map((w) => `<div class="cdk-ap"><b>Needs your yes</b><p data-no-i18n>${esc(w.t)}</p><div class="cdk-apb">
      <button class="cdk-apb-a" type="button" data-dk-approve="${esc(w.k)}">APPROVE</button>
      <button class="cdk-apb-n" type="button" data-dk-deny="${esc(w.k)}">NOT NOW</button></div></div>`).join('');

  function paint(force) {
    sync();
    const th = D.id ? THR(D.id) : null;
    const wait = waiting();
    const busy = D.busy || !!(th && C[th.a] && C[th.a].st === 'work');
    const list = D.id && MSG[D.id] ? MSG[D.id] : [];
    const last = list[list.length - 1];
    const sig = [D.id, list.length, last ? String(last.x || '').length : 0, wait.map((w) => w.k).join(','), busy ? 1 : 0, D.note, D.open].join('|');
    if (!force && sig === D.sig) return;
    D.sig = sig;
    el.classList.toggle('cdk-busy', !!busy);
    el.classList.toggle('cdk-wait', wait.length > 0);
    el.classList.toggle('cdk-open', D.open);
    win.setAttribute('aria-hidden', D.open ? 'false' : 'true');
    launch.setAttribute('aria-expanded', D.open ? 'true' : 'false');
    stx.textContent = busy ? 'Working' : wait.length ? 'Waiting for you' : 'Ready';
    if (th && C[th.a]) { avatar.src = C[th.a].img; q('.cdk-id b').textContent = C[th.a].n || 'Caesar'; } else { avatar.src = 'caesar/portrait-neo.png'; q('.cdk-id b').textContent = 'Caesar'; }
    if (!D.open) return;
    const near = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48;
    thread.innerHTML = th ? msgsHtml(th.id) + apprHtml(wait)
      : `<p class="cdk-empty">${esc(D.note || 'One conversation with Caesar. It stays with you as you move around the app.')}</p>`;
    if (near || force) thread.scrollTop = thread.scrollHeight;
  }

  async function adopt(session) { window.xAdopt(session); D.id = session.id; save(); }

  async function ensure() {
    if (D.id && THR(D.id)) { try { await window.xLoad(D.id); } catch { /* history shows on the next turn */ } return true; }
    if (D.id) {   // a remembered conversation: bring it back into the lists the chat view reads
      try {
        const r = await fetch('/api/chat/sessions/' + encodeURIComponent(D.id)), got = await r.json();
        if (r.ok && got.session) { await adopt(got.session); await window.xLoad(D.id); return true; }
        D.id = null; save();
      } catch { D.note = 'The saved conversation could not be reached.'; return false; }
    }
    try {
      const r = await fetch('/api/chat/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engine: SOLO, model: 'default' }) });
      const s = await r.json().catch(() => ({}));
      if (!r.ok || !s.id) throw new Error(s.error || r.status);
      await adopt(s); return true;
    } catch { D.note = 'The conversation could not start.'; paint(true); return false; }
  }

  async function sendMsg() {
    const v = inp.value.trim(); if (!v || D.busy) return;
    inp.value = ''; inp.style.height = 'auto'; D.note = '';
    if (!(await ensure())) return;
    const th = THR(D.id); if (!th) return;
    const list = MSG[D.id] = MSG[D.id] || [];
    list.push({ me: 1, x: v, files: [] });
    const reply = { a: th.a, x: '' }; list.push(reply);
    const prev = C[th.a] ? C[th.a].st : 'idle';
    if (C[th.a]) C[th.a].st = 'work';
    D.busy = true; D.sig = ''; paint(true);
    await window.xTurn(D.id, v, [], reply, () => { D.sig = ''; paint(true); });
    D.busy = false; if (C[th.a]) C[th.a].st = prev;
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
    const t = e.target.closest ? e.target.closest('[data-dk],[data-dk-approve],[data-dk-deny],[data-dk-fold]') : null;
    if (!t) { if (e.target.closest && e.target.closest('.cdk-launch')) { e.preventDefault(); if (launch.dataset.moved) delete launch.dataset.moved; else openDock(); } return; }
    e.preventDefault(); e.stopPropagation();
    if (t.dataset.dk === 'tab') promote('tab');
    else if (t.dataset.dk === 'split') promote('split');
    else if (t.dataset.dk === 'min') close2();
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
  const dragMove = (h, isLaunch) => h.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (!isLaunch && (e.target.closest('button') || innerWidth <= 760))) return;
    const sx = e.clientX, sy = e.clientY, r0 = D.r, b0 = D.b; let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true; el.classList.add('cdk-moving'); D.r = r0 - (ev.clientX - sx); D.b = b0 - (ev.clientY - sy); clampSize();
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      el.classList.remove('cdk-moving'); if (moved) { save(); if (isLaunch) h.dataset.moved = '1'; }
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
      if (used) { e.preventDefault(); clampSize(); save(); }
    });
  });

  addEventListener('resize', () => { clampSize(); paint(true); });
  if (typeof MutationObserver !== 'undefined') new MutationObserver(() => { sync(); paint(false); }).observe(root, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-motion'] });
  setInterval(() => { if (D.open) paint(false); else sync(); }, 2000);

  clampSize(); sync(); paint(true);
  if (wasOpen) openDock(true);   // a reload brings the window and its conversation back
  window.CDK = { open: openDock, minimise: close2, state: D };   // for the browser checks and other modules
})();
