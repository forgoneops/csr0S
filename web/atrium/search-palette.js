/* Find anything (Ctrl K): under the screens and actions, one result group per type from /api/search. */
(function () {
  if (typeof pr !== 'function') return;
  const st = document.createElement('style');
  st.textContent = '#nxres .grp{padding:8px 14px 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)}#nxres .srch-note{padding:8px 14px;font-size:12px;color:var(--ink);opacity:.7}';
  document.head.appendChild(st);
  const NAME = { chat: 'Conversations', note: 'Notes', board: 'Board cards', library: 'Documents', calendar: 'Events' };
  const ORDER = ['chat', 'note', 'board', 'library', 'calendar'], CAP = 5;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // library.js and board.js keep their openers private: press what a person would press
  const press = (v) => { const b = document.createElement('button'); b.dataset.lx = v; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); };
  const showCard = (id, tries, views) => {
    const el = document.querySelector(`[data-bd="edit"][data-id="${CSS.escape(id)}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); return; }
    if (!tries) return;
    // the card may sit in another view: once the tabs are drawn, try them one at a time
    const tabs = [...document.querySelectorAll('[data-bd="view"]')].map((t) => t.dataset.id);
    if (!views && tabs.length) views = tabs;
    if (views && views.length) document.querySelector(`[data-bd="view"][data-id="${views.shift()}"]`)?.click();
    setTimeout(() => showCard(id, tries - 1, views), 250);
  };
  const open = async (h) => {
    if (h.kind === 'chat' && typeof THREADS !== 'undefined' && THREADS.some((t) => t.id === h.ref)) { open_({ k: 'chat', id: h.ref }); render(); return; }
    if (window.xOpenHit) await window.xOpenHit(h);
    if (h.kind === 'library') press(h.ref.startsWith('file:') ? 'open:' + h.ref.slice(5) : 'book:' + h.ref);
    if (h.kind === 'board') showCard(h.ref, 15, null);
  };
  const prev = pr; let seq = 0, timer = 0;
  pr = function (q) {
    prev(q); const my = ++seq; clearTimeout(timer);
    const box = document.getElementById('nxres'); if (!box || String(q).trim().length < 2) return;
    const note = (t) => { box.querySelector('.srch-note')?.remove(); box.insertAdjacentHTML('beforeend', `<div class="srch-note" role="status">${t}</div>`); };
    note('Searching…');
    timer = setTimeout(async () => {
      let hits;
      try { const r = await fetch('/api/search?q=' + encodeURIComponent(q)); if (!r.ok) throw 0; hits = await r.json(); } catch { if (my === seq) note('Search is unavailable right now.'); return; }
      if (my !== seq || !document.getElementById('nxres')) return;
      box.querySelector('.srch-note')?.remove();
      if (!Array.isArray(hits) || !hits.length) { if (!pi.length) box.innerHTML = ''; note('Nothing found in chats, notes, cards or documents.'); return; }
      const none = !pi.length; let html = '';
      for (const k of ORDER) {
        const g = hits.filter((h) => h.kind === k).slice(0, CAP); if (!g.length) continue;
        html += `<div class="grp" role="presentation">${NAME[k]}</div>`;
        for (const h of g) { const i = pi.length; pi.push({ l: h.title, k: k.toUpperCase(), run: () => { void open(h); } }); html += `<button class="it ${none && i === 0 ? 'sel' : ''}" data-x="${i}"><em style="font-style:normal" data-no-i18n>${esc(h.title + (h.text ? ' · ' + h.text.slice(0, 60) : ''))}</em><span>${k.toUpperCase()}</span></button>`; }
      }
      if (none) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', html);
      box.querySelectorAll('.it[data-x]').forEach((b) => { b.onclick = () => { pi[b.dataset.x].run(); pal(false); }; });
    }, 180);
  };
})();
