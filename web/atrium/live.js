/* Live strip (ledger 8.23, 8.24): a slow news ticker above the status bar and a notification bell panel.
   Self-contained like the chat dock: its own root nodes on <body>, one observer to keep a bell in the rail.
   Ticker reads the News feeds the owner added (/api/lists/feeds) and never strobes: a plain slow slide,
   paused by hover, focus and press, absent under reduced motion or Motion off. The News module is its on/off switch.
   Bell reads approvals, tasks sent to you and failures; "read" is remembered on this device only. */
(() => {
  register({ id: 'live', views: {} });
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // the registry test's stub

  const RKEY = 'caesar.live.read.v1', FEED_MS = 10 * 60 * 1000, POLL_MS = 60 * 1000;
  const L = { items: [], news: [], open: false, state: 'loading', read: new Set() };
  const loadRead = () => { try { L.read = new Set(JSON.parse(localStorage.getItem(RKEY) || '[]')); } catch { /* private mode */ } };
  loadRead();
  const saveRead = () => { try { localStorage.setItem(RKEY, JSON.stringify([...L.read].slice(-300))); } catch { /* private mode */ } };
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const E = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
  const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - Number(t || 0)) / 60000)); return !t ? '' : m < 1 ? 'now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const newsOn = () => typeof ogEnabled !== 'function' || ogEnabled('News');

  const tick = document.createElement('div'); tick.className = 'lv lv-tick'; tick.hidden = true;
  tick.setAttribute('role', 'region'); tick.setAttribute('aria-label', 'News ticker');
  const panel = document.createElement('div'); panel.className = 'lv lv-wrap';
  panel.innerHTML = '<div class="lv-scrim" data-lv="close"></div><section class="lv-panel" role="dialog" aria-label="Notifications" aria-hidden="true"></section>';
  document.body.append(tick, panel);
  const sheet = panel.querySelector('.lv-panel');

  /* ---------- ticker ---------- */
  const safe = (u) => /^https?:\/\//i.test(u || '');
  function paintTick() {
    const on = newsOn() && !(typeof S !== 'undefined' && S.simple) && !reduced() && root.dataset.motion !== 'off' && L.news.length > 0;
    tick.hidden = !on; root.style.setProperty('--lv-tick-h', on ? '26px' : '0px');
    if (!on) { tick.innerHTML = ''; tick.dataset.sig = ''; return; }
    const sig = L.news.map((n) => n.link).join('|'); if (tick.dataset.sig === sig) return; tick.dataset.sig = sig;
    const row = L.news.map((n) => safe(n.link) ? `<a class="lv-item" href="${E(n.link)}" target="_blank" rel="noopener noreferrer">${E(n.title)}</a>` : `<span class="lv-item">${E(n.title)}</span>`).join('<i class="lv-sep" aria-hidden="true"></i>');
    // ~45 px per second: slow enough to read, never a flash
    tick.innerHTML = `<span class="lv-tag" aria-hidden="true">NEWS</span><div class="lv-view"><div class="lv-track" style="--lv-s:${Math.max(40, Math.round(row.length / 14))}s"><span class="lv-set">${row}</span><span class="lv-set" aria-hidden="true">${row}</span></div></div>`;
  }
  async function loadNews() {
    if (!newsOn()) { L.news = []; return paintTick(); }
    try {
      const feeds = await get('/api/lists/feeds');
      const got = await Promise.all((Array.isArray(feeds) ? feeds : []).slice(0, 6).map((f) => get('/api/news?url=' + encodeURIComponent(f.text)).catch(() => [])));
      // one headline per feed in turn, so no single source fills the line
      const out = []; for (let i = 0; i < 8; i++) for (const g of got) if (Array.isArray(g) && g[i]) out.push(g[i]);
      L.news = out.slice(0, 24);
    } catch { L.news = []; }
    paintTick();
  }
  const pause = (on) => tick.classList.toggle('lv-paused', on);
  tick.addEventListener('pointerdown', () => pause(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) tick.addEventListener(ev, () => { if (!tick.matches(':focus-within')) pause(false); });
  tick.addEventListener('focusin', () => pause(true)); tick.addEventListener('focusout', () => pause(false));

  /* ---------- bell ---------- */
  const unread = () => L.items.filter((x) => !L.read.has(x.id));
  const link = (x) => x.kind === 'Approval' ? { k: 'chat' } : { k: 'app', id: x.app };
  async function loadBell() {
    try {
      const [ap, inbox, fail] = await Promise.all([get('/api/approvals').catch(() => ({ pending: [] })), get('/api/handoff').catch(() => []), get('/api/failures').catch(() => [])]);
      const items = [];
      for (const a of ap.pending || []) items.push({ id: 'ap:' + (a.id || a.title), kind: 'Approval', title: a.title, sub: 'Waiting for your yes', app: 'Notifications', at: a.at });
      for (const h of Array.isArray(inbox) ? inbox : []) items.push({ id: 'ho:' + (h.id || h.at), kind: h.kind === 'note' ? 'Note' : 'Task', title: h.kind === 'note' ? h.name : String(h.text || '').slice(0, 90), sub: 'From ' + (h.from || 'crew'), own: 1, app: 'Devices', at: h.at });
      for (const f of Array.isArray(fail) ? fail : []) items.push({ id: 'fl:' + f.at + f.engine, kind: 'Failed', title: (f.engine || 'Run') + ': ' + f.error, sub: '', app: 'Usage', at: f.at });
      L.items = items.sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).slice(0, 40); L.state = 'ok';
    } catch { L.state = 'error'; }
    paintBell();
  }
  function paintBell() {
    const n = unread().length, urgent = unread().some((x) => x.kind === 'Approval');
    for (const b of document.querySelectorAll('.lv-bell')) {
      b.dataset.state = n ? (urgent ? 'urgent' : 'unread') : 'clear';
      b.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
      let bd = b.querySelector('.lv-badge'); if (!n) { bd?.remove(); } else { if (!bd) { bd = document.createElement('i'); bd.className = 'lv-badge'; bd.setAttribute('aria-hidden', 'true'); b.append(bd); } bd.textContent = n > 99 ? '99+' : String(n); }
    }
    if (L.open) paintPanel();
  }
  function paintPanel() {
    const art = typeof ARTHEAD === 'function' ? ARTHEAD('Notifications', 'praetorium', 72) : '';
    const n = unread().length;
    const body = L.state === 'loading' ? '<div class="lv-skel"></div><div class="lv-skel"></div><div class="lv-skel"></div>'
      : L.state === 'error' ? '<p class="lv-note">Could not read notifications. <button class="lv-btn" data-lv="retry">Retry</button></p>'
      : !L.items.length ? '<p class="lv-note">All clear. Nothing needs you.</p>'
      : L.items.map((x, i) => `<button class="lv-row ${L.read.has(x.id) ? '' : 'new'}" data-lv="go" data-i="${i}"><i class="lv-sq" aria-hidden="true"></i><span class="lv-k">${E(x.kind)}</span><b>${E(x.title)}</b><small${x.own ? ' data-no-i18n' : ''}>${E([x.sub, ago(x.at)].filter(Boolean).join(' · '))}</small></button>`).join('');
    sheet.innerHTML = `<div class="lv-art" aria-hidden="true">${art}</div><header class="lv-hd"><b>Notifications</b><span class="lv-count">${n ? n + ' unread' : 'all read'}</span><button class="lv-btn" data-lv="all" ${n ? '' : 'disabled'}>Mark all read</button><button class="lv-btn" data-lv="close" aria-label="Close">Close</button></header><div class="lv-list">${body}</div>`;
  }
  function setOpen(on) {
    L.open = on; panel.classList.toggle('open', on); sheet.setAttribute('aria-hidden', String(!on));
    if (on) { paintPanel(); void loadBell(); sheet.querySelector('.lv-btn:not([disabled])')?.focus({ preventScroll: true }); }
  }
  function injectBell() {
    const rail = document.getElementById('rail'); if (!rail || rail.querySelector('.lv-bell')) return;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.lv = 'bell'; b.title = 'Notifications';
    b.innerHTML = '<svg class="lv-ico" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M4 15V9l3-5h6l3 5v6l2 2H2z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 18h4" stroke="currentColor" stroke-width="1.6"/></svg>';
    const foot = rail.querySelector('.ns-foot');
    if (foot) { b.className = 'ns-it lv-bell'; b.insertAdjacentHTML('beforeend', '<span class="ns-lab">Notifications</span>'); foot.querySelector('[data-ns="theme"]')?.before(b); if (!b.isConnected) foot.append(b); }
    else if (rail.classList.contains('nx-mini')) { b.className = 'nx-mi lv-bell'; rail.querySelector('.nx-mi-apps')?.after(b); if (!b.isConnected) rail.append(b); }
    else { b.className = 'btn ghost lv-bell lv-bell-wide'; b.insertAdjacentText('beforeend', ' Notifications'); (rail.querySelector('.nx-foot') || rail).prepend(b); }
    paintBell();
  }

  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null; if (!t) return;
    // the top bar bell opens this panel too, in place of the older one-line popover
    const old = t.closest('[data-nx="bell"]');
    const el = old || t.closest('[data-lv]'); if (!el) return;
    const a = old ? 'bell' : el.dataset.lv;
    if (old) { e.preventDefault(); e.stopImmediatePropagation(); }
    if (a === 'bell') setOpen(!L.open);
    else if (a === 'close') setOpen(false);
    else if (a === 'retry') { L.state = 'loading'; paintPanel(); void loadBell(); }
    else if (a === 'all') { L.items.forEach((x) => L.read.add(x.id)); saveRead(); paintBell(); if (typeof render === 'function') render(); }
    else if (a === 'go') { const x = L.items[Number(el.dataset.i)]; if (!x) return; L.read.add(x.id); saveRead(); setOpen(false); if (typeof open_ === 'function') { open_(link(x)); render(); } paintBell(); }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && L.open) setOpen(false); });

  const shell = document.getElementById('shell');
  if (shell) new MutationObserver(() => { injectBell(); paintTick(); }).observe(shell, { childList: true });
  new MutationObserver(paintTick).observe(root, { attributes: true, attributeFilter: ['data-motion', 'class'] });
  injectBell(); paintTick();
  void loadBell(); void loadNews();
  setInterval(() => { if (!document.hidden) void loadBell(); }, POLL_MS);
  setInterval(() => { if (!document.hidden) void loadNews(); }, FEED_MS);
  window.CLIVE = { state: L, refresh: () => Promise.all([loadBell(), loadNews()]), sync: () => { loadRead(); paintBell(); } };
})();
