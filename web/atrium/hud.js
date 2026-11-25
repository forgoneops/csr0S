/* The HUD (plan 8.14): the same Atrium page opened as /?hud=1 inside the shell's small always-on-top window. A chat strip, like Spotlight: the bar is
   all you see until you talk; the answer hangs below it for a moment and goes. It can read WHICH window you are in (app, title, place; never pixels),
   only when you switch "Window" on, and says so on a line while it does. It steps back to a faint strip when something is fullscreen. Approvals show
   as two buttons. Esc closes it. The shell reads this page's title as its only channel back ("CaesarOS HUD", then "·h<px>" to size the window, "·close",
   "·open" to bring the main window), so the page needs no access to the shell. Own text only; everything here is data-no-i18n. */
(() => {
  if (!/[?&]hud=1\b/.test(location.search) || typeof document === 'undefined' || !document.body) return;
  // the rest of the Atrium writes the page title (a greeting); here the title belongs to the shell channel, so other writes are ignored
  const td = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  Object.defineProperty(document, 'title', { configurable: true, get() { return td.get.call(document); }, set(v) { if (String(v).startsWith('CaesarOS HUD')) td.set.call(document, v); } });
  const H = { say: false, rec: null, note: '', sid: null, busy: false, text: '', user: '', ctx: false, win: null, over: '', ap: [], hold: 0, err: '' };
  try { H.ctx = localStorage.getItem('caesaros-hud-ctx') === 'on'; H.sid = localStorage.getItem('caesaros-hud-session'); H.say = localStorage.getItem('caesaros-hud-say') === 'on'; } catch { /* private window */ }
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
  const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
  const post = (u, b, m = 'POST') => fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) });
  const SAY = { en: { ask: 'Ask Caesar…', win: 'Window', winTip: 'Let Caesar see which window you are in (app and title, never the screen)', reading: 'Reading the window', open: 'Open CaesarOS', close: 'Close', yes: 'Approve', no: 'Not now', away: 'Stepped back: something is fullscreen', none: 'No engine can answer yet.', sorry: 'It did not answer.', mic: 'Mic', micTip: 'Speak instead of typing (local speech recognition)', listening: 'Listening\u2026 press Mic again to stop', working: 'Transcribing\u2026', nospeech: 'Local speech recognition is not set up yet.', nomic: 'No microphone is available here.', speak: 'Speak', speakTip: 'Read the answers aloud' },
    pl: { ask: 'Zapytaj Caesara…', win: 'Okno', winTip: 'Pozwól Caesarowi zobaczyć, w jakim oknie jesteś (aplikacja i tytuł, nigdy ekran)', reading: 'Czytam okno', open: 'Otwórz CaesarOS', close: 'Zamknij', yes: 'Zatwierdź', no: 'Nie teraz', away: 'Wycofany: coś jest na pełnym ekranie', none: 'Żaden silnik nie może jeszcze odpowiedzieć.', sorry: 'Brak odpowiedzi.', mic: 'Mikrofon', micTip: 'Mów zamiast pisać (lokalne rozpoznawanie mowy)', listening: 'Słucham\u2026 naciśnij Mikrofon, by skończyć', working: 'Zamieniam na tekst\u2026', nospeech: 'Lokalne rozpoznawanie mowy nie jest jeszcze skonfigurowane.', nomic: 'Mikrofon jest tu niedostępny.', speak: 'Czytaj', speakTip: 'Czytaj odpowiedzi na głos' } };
  const L = () => SAY[document.documentElement.lang === 'pl' ? 'pl' : 'en'];

  const root = el('div', 'hud'); root.id = 'hud'; root.setAttribute('data-no-i18n', ''); root.dataset.state = 'idle';
  root.innerHTML = `<div class="hud-bar"><span class="su-chibi hud-chibi" aria-hidden="true"><img src="art/caesaros-chibi-guide.webp" alt="" width="132" height="132"></span>
    <textarea id="hud-in" rows="1" autocomplete="off" aria-label="Message"></textarea>
    <button type="button" class="hud-b" data-hud="mic" aria-pressed="false"></button><button type="button" class="hud-b" data-hud="say" aria-pressed="false"></button><button type="button" class="hud-b" data-hud="ctx" aria-pressed="false"></button><button type="button" class="hud-b" data-hud="open"></button><button type="button" class="hud-b hud-x" data-hud="close"></button></div>
    <p class="hud-line" role="status" hidden></p><div class="hud-thread" hidden></div><div class="hud-ap"></div>`;
  document.documentElement.classList.add('hud-mode'); document.body.appendChild(root);
  const $q = s => root.querySelector(s);

  function labels() { const w = L(); $q('#hud-in').placeholder = w.ask; const c = $q('[data-hud=ctx]'); c.textContent = w.win; c.title = w.winTip; c.setAttribute('aria-pressed', String(H.ctx)); const m = $q('[data-hud=mic]'); m.textContent = w.mic; m.title = w.micTip; const sp = $q('[data-hud=say]'); sp.textContent = w.speak; sp.title = w.speakTip; sp.hidden = !(window.xSpeak || 'speechSynthesis' in window); sp.setAttribute('aria-pressed', String(H.say)); $q('[data-hud=open]').textContent = w.open; const x = $q('[data-hud=close]'); x.textContent = '×'; x.setAttribute('aria-label', w.close); x.title = w.close; }
  function size() {
    // the shell sizes its window from the page title: the bar plus whatever hangs below it
    const h = Math.ceil(root.getBoundingClientRect().height) + 6, t = 'CaesarOS HUD ·h' + h; if (document.title !== t) document.title = t;
  }
  function paint() {
    const w = L(), thread = $q('.hud-thread'), line = $q('.hud-line'), recent = H.busy || Date.now() < H.hold || document.activeElement === $q('#hud-in');
    const showThread = (H.text || H.user || H.err) && recent;
    thread.hidden = !showThread; if (showThread) thread.innerHTML = (H.user ? `<p class="hud-me">${E(H.user)}</p>` : '') + (H.err ? `<p class="hud-err">${E(H.err)}</p>` : `<p class="hud-it">${E(H.text) || '…'}</p>`);
    thread.scrollTop = thread.scrollHeight;
    const note = H.note; const reading = H.ctx && H.win ? `${w.reading}: ${H.win.app}${H.win.title ? ' — ' + H.win.title : ''}` : '', away = H.over ? `${w.away} (${H.over})` : '';
    line.hidden = !(note || reading || away); line.textContent = note || away || reading; $q('[data-hud=mic]').setAttribute('aria-pressed', String(!!H.rec));
    $q('.hud-ap').innerHTML = H.ap.map(a => `<div class="hud-a"><span>${E(a.title)}</span><button type="button" class="hud-b go" data-hud-ok="${E(a.id)}">${w.yes}</button><button type="button" class="hud-b" data-hud-no="${E(a.id)}">${w.no}</button></div>`).join('');
    root.dataset.state = H.ap.length ? 'wait' : H.busy ? 'work' : 'idle'; root.dataset.over = H.over ? '1' : '';
    $q('[data-hud=ctx]').setAttribute('aria-pressed', String(H.ctx)); size();
  }

  async function ensureSession() {
    if (H.sid) { try { await get('/api/chat/sessions/' + H.sid); return H.sid; } catch { H.sid = null; } }
    const d = await get('/api/chat-targets/default').catch(() => ({ id: '' }));
    if (!d.id) { H.err = d.message || L().none; return null; }
    const eng = d.id, model = (['claude', 'codex', 'gemini'].includes(eng) || eng.startsWith('hermes:')) ? 'default' : '';
    const r = await post('/api/chat/sessions', { engine: eng, model, title: 'HUD' }); if (!r.ok) { H.err = L().none; return null; }
    H.sid = (await r.json()).id; try { localStorage.setItem('caesaros-hud-session', H.sid); } catch { /* ignored */ } return H.sid;
  }
  async function winNow() { try { H.win = (await get('/api/hud/window')).window; } catch { H.win = null; } return H.win; }
  async function send() {
    const box = $q('#hud-in'), v = box.value.trim(); if (!v || H.busy) return;
    if (window.xSpeakStop) window.xSpeakStop();
    box.value = ''; H.user = v; H.text = ''; H.err = ''; H.busy = true; paint();
    try {
      const sid = await ensureSession(); if (!sid) { H.busy = false; return paint(); }
      let content = v; if (H.ctx) { const w = await winNow(); if (w) content = `[The person is in the window "${w.title.replace(/"/g, "'")}" of ${w.app}. Use it only if it helps.]\n${v}`; }
      const res = await post(`/api/chat/sessions/${sid}/turns`, { content, model: '' });
      if (!res.ok || !res.body) { const b = await res.json().catch(() => ({})); H.err = b.message || b.error || L().sorry; H.busy = false; return paint(); }
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n'); let at;
        while ((at = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, at); buf = buf.slice(at + 2); let ev = 'message', data = [];
          for (const l of raw.split('\n')) { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) data.push(l.slice(5).replace(/^ /, '')); }
          let d; try { d = JSON.parse(data.join('\n')); } catch { continue; }
          if (ev === 'delta' && d.text) { H.text += d.text; paint(); } else if (ev === 'error') { H.err = d.message || L().sorry; paint(); }
        }
      }
    } catch { H.err = H.err || L().sorry; }
    H.busy = false; H.hold = Date.now() + 9000; paint(); if (H.say && H.text && window.xSpeak) void window.xSpeak(H.text);
  }
  async function mic() {
    const w = L();
    if (H.rec) { H.rec.stop(); return; }                                              // second press: stop and transcribe
    if (!navigator.mediaDevices || !window.MediaRecorder) { H.note = w.nomic; return paint(); }
    try { const st = await get('/api/transcribe/status'); if (!st.ready) { H.note = w.nospeech; return paint(); } } catch { H.note = w.nospeech; return paint(); }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { H.note = w.nomic; return paint(); }
    const chunks = [], rec = new MediaRecorder(stream); H.rec = rec; H.note = w.listening; paint();
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); H.rec = null; H.note = w.working; paint();
      try { const r = await fetch('/api/transcribe', { method: 'POST', body: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) }), j = await r.json().catch(() => ({})); const box = $q('#hud-in'); if (r.ok && j.text) { box.value = (box.value ? box.value + ' ' : '') + j.text.trim(); H.note = ''; box.focus(); } else H.note = j.error || w.sorry; } catch { H.note = w.sorry; }
      paint();
    };
    rec.start();
  }
  async function poll() {
    try { H.ap = ((await get('/api/approvals')).pending || []).map(p => ({ id: p.id, title: String(p.title || '').slice(0, 80) })); } catch { /* keep */ }
    try { const w = await get('/api/hud/window'); H.over = w.fullscreenOver || ''; if (H.ctx) H.win = w.window; } catch { H.over = ''; }
    paint();
  }
  const go = cmd => { if (window.xSpeakStop) window.xSpeakStop(); document.title = 'CaesarOS HUD ·' + cmd; };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-hud],[data-hud-ok],[data-hud-no]'); if (!b) return;
    if (b.dataset.hud === 'ctx') { H.ctx = !H.ctx; try { localStorage.setItem('caesaros-hud-ctx', H.ctx ? 'on' : 'off'); } catch { /* ignored */ } if (H.ctx) void winNow().then(paint); else H.win = null; paint(); }
    else if (b.dataset.hud === 'mic') void mic();
    else if (b.dataset.hud === 'say') { H.say = !H.say; try { localStorage.setItem('caesaros-hud-say', H.say ? 'on' : 'off'); } catch { /* ignored */ } if (!H.say && window.xSpeakStop) window.xSpeakStop(); paint(); }
    else if (b.dataset.hud === 'open') go('open'); else if (b.dataset.hud === 'close') go('close');
    else { const id = b.dataset.hudOk || b.dataset.hudNo; void post('/api/approvals/' + encodeURIComponent(id) + '/decision', { decision: b.dataset.hudOk ? 'approved' : 'denied' }).then(poll); }
  });
  $q('#hud-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } });
  $q('#hud-in').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; size(); });
  $q('#hud-in').addEventListener('focus', paint); $q('#hud-in').addEventListener('blur', () => { H.hold = Date.now() + 1100; setTimeout(paint, 1200); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') go('close'); }, true);
  new MutationObserver(labels).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  labels(); paint(); void poll(); setInterval(poll, 2500); setInterval(() => { if (Date.now() > H.hold && !H.busy) paint(); }, 1000);
  setTimeout(() => $q('#hud-in').focus(), 200);
})();
