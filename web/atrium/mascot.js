/* The chibi Caesar as the system's mascot (plan 8.13): a small hologram in the corner that shows what the system is doing, like a pet. It reads the same
   things the live bar reads: turns running (/api/running), approvals waiting (S.waiting) and recent failures (/api/failures). States: calm (idle),
   working (a turn is running), waiting (something needs your yes), done (a turn just finished), trouble (a recent failure), asleep (nothing for a while).
   A tap opens what it is pointing at. It is optional (Settings > Help, or the palette), keeps still in Reduced and Off motion, and the line it says is
   shipped text in both languages, so it is marked data-no-i18n. It sees nothing of your screen: only the system's own state. */
(() => {
  if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined') return;     // the registry test stubs the page
  const KEY = 'caesaros-mascot', SAY = {
    en: { idle: 'Ave. I am here.', work: 'Working on it…', wait: n => `${n} waiting for your yes`, done: 'Done.', fail: 'Something failed. Tap to look.', sleep: 'Zzz…' },
    pl: { idle: 'Ave. Jestem tutaj.', work: 'Pracuję nad tym…', wait: n => `${n} czeka na twoje tak`, done: 'Gotowe.', fail: 'Coś się nie udało. Dotknij, by zobaczyć.', sleep: 'Zzz…' },
  };
  const lang = () => (document.documentElement.lang === 'pl' ? 'pl' : 'en');
  const on = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
  const M = { state: 'idle', run: 0, waiting: 0, failAt: 0, seenFail: Date.now(), doneUntil: 0, lastActive: Date.now(), said: '', host: null };

  function decide(now = Date.now()) {
    if (M.waiting > 0) return 'wait';
    if (M.run > 0) return 'work';
    if (M.failAt > M.seenFail) return 'fail';
    if (now < M.doneUntil) return 'done';
    return now - M.lastActive > 10 * 60_000 ? 'sleep' : 'idle';
  }
  function paint() {
    if (!M.host) return;
    const s = decide(), w = SAY[lang()], line = s === 'wait' ? w.wait(M.waiting) : w[s];
    M.host.dataset.state = s; M.host.querySelector('.mc-say').textContent = line;
    M.host.setAttribute('aria-label', lang() === 'pl' ? 'Maskotka Caesar: ' + line : 'Caesar the mascot: ' + line);
    const off = M.host.querySelector('.mc-off'), pl = lang() === 'pl';
    off.title = pl ? 'Ukryj (wróci przez Ustawienia > Pomoc)' : 'Hide (back under Settings > Help)'; off.setAttribute('aria-label', pl ? 'Ukryj maskotkę (wróci przez Ustawienia > Pomoc)' : 'Hide the mascot (back under Settings > Help)');
    M.host.hidden = !!document.getElementById('tour');           // the tour has its own chibi
    M.state = s;
  }
  async function poll() {
    if (!M.host) return;
    try {
      const r = await fetch('/api/running'); if (r.ok) { const c = (await r.json()).count || 0; if (M.run > 0 && c === 0) M.doneUntil = Date.now() + 6000; if (c > 0) M.lastActive = Date.now(); M.run = c; }
      const f = await fetch('/api/failures'); if (f.ok) { const l = await f.json(); M.failAt = l.length ? Math.max(...l.map(x => x.at || 0)) : 0; }
    } catch { /* offline: keep what is shown */ }
    M.waiting = typeof S !== 'undefined' && S.waiting ? S.waiting.length : 0; if (M.waiting) M.lastActive = Date.now();
    paint();
  }
  function point() {
    // a tap opens what the mascot is pointing at
    if (M.state === 'wait' && typeof open_ === 'function') { const t = S.tabs.findIndex(x => x.k === 'ws'); if (t >= 0) { S.act = t; render(); } return; }
    if (M.state === 'fail') { M.seenFail = Date.now(); if (typeof open_ === 'function') { open_({ k: 'app', id: 'Horde desk' }); render(); } paint(); return; }
    if (typeof pal === 'function') pal(true);                     // otherwise the palette: the fastest way to anything
  }
  function show() {
    if (M.host || !on()) return;
    const h = document.createElement('div'); h.className = 'mc'; h.setAttribute('data-no-i18n', ''); h.setAttribute('role', 'status'); h.dataset.state = 'idle';
    h.innerHTML = `<div class="mc-say" aria-hidden="true"></div><button type="button" class="mc-off" aria-label="Hide the mascot (back under Settings > Help)" title="Hide (back under Settings > Help)">\u00d7</button><button type="button" class="mc-btn" aria-label="Caesar"><span class="su-chibi mc-chibi" aria-hidden="true"><img src="art/caesaros-chibi-guide.webp" alt="" width="132" height="132" decoding="async"></span></button>`;
    h.querySelector('.mc-off').addEventListener('click', () => window.xMascot.toggle());
    // Drag to move the mascot anywhere on the screen; the position is kept on this device (reduced/off
    // motion still keeps it fixed). Only the chibi drags, never the tap-to-open.
    let dx = 0, dy = 0, dragging = false, moved = false, pressed = false, suppressClick = false, downAt = 0, startX = 0, startY = 0;
    const pos = () => { try { const p = JSON.parse(localStorage.getItem('caesaros-mascot-pos') || 'null'); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p; } catch { /* bad or missing */ } return null; };
    const btn = h.querySelector('.mc-btn');
    // A tap opens what the mascot points at; a press-and-hold or a drag does not. The click that
    // pointerup always fires is ignored when the pointer moved or the press lasted too long.
    const onTap = (ev) => {
      // Keyboard activation has no pointerdown; keep the mascot accessible without treating a drag as a tap.
      if (ev.detail === 0) { pressed = false; moved = false; point(); return; }
      if (suppressClick) { suppressClick = false; ev.preventDefault?.(); ev.stopPropagation?.(); return; }
      if (!pressed) return;
      const tap = !moved && Date.now() - downAt <= 450;
      pressed = false; moved = false;
      if (tap) point();
    };
    const draw = (x, y) => { const bw = btn.offsetWidth, bh = btn.offsetHeight; const nx = Math.max(4, Math.min(x, innerWidth - bw - 4)); const ny = Math.max(4, Math.min(y, innerHeight - bh - 4)); h.style.left = nx + 'px'; h.style.top = ny + 'px'; h.style.right = 'auto'; h.style.bottom = 'auto'; try { localStorage.setItem('caesaros-mascot-pos', JSON.stringify({ x: nx, y: ny })); } catch { /* private window */ } };
    const p = pos(); if (p) draw(p.x, p.y);
    btn.addEventListener('click', onTap);
    btn.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return; const t = ev.target.closest('.mc-btn'); if (!t) return;
      ev.preventDefault(); dragging = true; moved = false; pressed = true; downAt = Date.now(); startX = ev.clientX; startY = ev.clientY; dx = ev.clientX - h.offsetLeft; dy = ev.clientY - h.offsetTop;
      h.classList.add('mc-dragging');
      const move = (e) => { if (!dragging) return; e.preventDefault(); if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) moved = true; if (moved) draw(e.clientX - dx, e.clientY - dy); };
      const up = () => { dragging = false; h.classList.remove('mc-dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved || Date.now() - downAt > 450) { suppressClick = true; setTimeout(() => { suppressClick = false; pressed = false; moved = false; }, 500); } else setTimeout(() => { pressed = false; moved = false; }, 500); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    document.body.appendChild(h); M.host = h; paint(); void poll();
  }
  function hide() { if (M.host) M.host.remove(); M.host = null; }
  window.xMascot = { toggle() { try { localStorage.setItem(KEY, on() ? 'off' : 'on'); } catch { /* private window */ } on() ? show() : hide(); return on(); }, on, decide };
  setInterval(poll, 3000); setInterval(paint, 1000);
  if (!/[?&]hud=/.test(location.search)) setTimeout(show, 2500);
})();
