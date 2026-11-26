/* The Library, three halls, ported from the old cockpit and redrawn in the Evolve look (cut corners, pixel squares).
   Books    (Codices):  shelves of standing books, a spine per document, sigil and halftone backdrop; click reads the text.
   Documents (Volumina): a heap of scrolls for PDFs and office files, a seal per kind, the first page unrolls, a reader with every page.
   Presentations (Theatrum): a lit screen showing the first slide, a coverflow of reels, "Enter" dims the house and opens the deck.
   real.js draws the page and calls xLib.hall(RD). Files are the owner's own: the shelf starts empty and nothing is seeded. */
(() => {
  const L = { files: null, trash: [], hall: 'book', q: '', hits: null, open: null, book: null, page: 1, pages: null, sure: null, err: '', busy: '', sel: 0, phase: 'idle', showTrash: false, fresh: false, present: false };
  const HALLS = [['book', 'Books', 'Codices'], ['doc', 'Documents', 'Volumina'], ['deck', 'Presentations', 'Theatrum']];
  const ART = { book: '/art/library-codices-1-ink.webp', doc: '/art/library-volumina-1-ink.webp', deck: '/art/library-theatrum-1-ink.webp' };
const SIGILS = [
  ["...........####...........", ".........##....##.........", ".......##........##.......", "......#............#......", ".....#..............#.....", "....#................#....", "...#..................#...", "..#....................#..", "..#....................#..", "...#..................#...", "....#................#....", ".....#..............#.....", "......#............#......", ".......##........##.......", ".........##....##.........", "...........####..........."],
  [".............#............", "............###...........", "...........#####..........", "..........#######.........", ".........#########........", "...........#####..........", "....##......###......##....", "...####.....###.....####...", "..######....###....######..", "...####.....###.....####...", "....##......###......##....", "...........#####..........", "..........#######.........", ".........#########........", "...........#####..........", "..........##...##........."],
  ["............##............", "...........####...........", "..........######..........", ".............##............", "....##.......##.......##...", "....##......####......##...", "....##.....######.....##...", "....##........##......##...", "....##........##......##...", "....##....########....##...", "....##...##########...##...", "....##........##......##...", "....##........##......##...", "....##........##......##...", "....##.......####.....##...", "....##......######....##..."],
  ["...........######.........", "...........######.........", "...........##..##.........", "...........##..##.........", "...........##..##.........", "...........##..##.........", "...........##..##.........", "...........##..##.........", "...........##..##.........", "...........##..##.........", "...........##..##.........", ".........##########.......", ".........##########.......", ".........##......##.......", ".........##......##.......", "........############......"],
  ["...........######.........", "...........##..##.........", "...##......##..##.....##...", "...####....##..##...####...", "....####...######..####....", "......##..########..##......", "........############.......", ".......##.########.##.......", "......##..########..##......", "....####...######...####....", "...####....##..##....####...", "...##......##..##......##...", "...........##..##.........", "...........######.........", ".........##########.......", "...........######........."],
  ["...........##............", "..........####...........", ".........######..........", "........########........", "......##########.......", "....##############.....", "..##################...", "######################..", "....##....##....##....##.", "....##....##....##....##.", "....##....##....##....##.", "....##....##....##....##.", "....##....##....##....##.", "....##....##....##....##.", "....##....##....##....##.", "....##....##....##....##."],
];
  const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hash = s => { let h = 2166136261; for (const c of String(s).normalize('NFKC').toLowerCase()) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const when = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.animReveal !== 'off';
  const refresh = () => { if (typeof render === 'function') render(); };
  const url = id => '/api/library/files/' + encodeURIComponent(id);
  async function load() {
    try { const [a, b] = await Promise.all([fetch('/api/library/files'), fetch('/api/library/files?trash=1')]); L.files = a.ok ? await a.json() : []; L.trash = b.ok ? await b.json() : []; } catch { L.files = []; L.trash = []; }
    refresh();
  }

  /* a pixel sigil as svg squares (the old canvas version, same six marks) */
  function sigil(i, cls = '') {
    const m = SIGILS[((Math.floor(i) % SIGILS.length) + SIGILS.length) % SIGILS.length], rects = [];
    m.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`); }));
    return `<svg class="lx-sigil ${cls}" viewBox="0 0 27 16" shape-rendering="crispEdges" aria-hidden="true" focusable="false" fill="currentColor">${rects.join('')}</svg>`;
  }

  /* the halftone backdrop: the hall's art sampled into squares in the accent colour (port of drawHalftone) */
  const imgs = new Map();
  function paintBackdrops() {
    document.querySelectorAll('canvas.lx-backdrop').forEach(cv => {
      const src = cv.dataset.src; let im = imgs.get(src);
      if (!im) { im = new Image(); im.onload = paintBackdrops; im.src = src; imgs.set(src, im); }
      if (!im.complete || !im.naturalWidth) return;
      const r = cv.getBoundingClientRect(), sc = Math.min(devicePixelRatio || 1, 2), w = Math.max(1, Math.round(r.width * sc)), h = Math.max(1, Math.round(r.height * sc));
      cv.width = w; cv.height = h;
      const x = cv.getContext('2d'), tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
      const t = tmp.getContext('2d', { willReadFrequently: true }), ir = im.naturalWidth / im.naturalHeight, dw = ir > w / h ? h * ir : w, dh = ir > w / h ? h : w / ir;
      t.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
      const px = t.getImageData(0, 0, w, h).data, step = Math.max(4, Math.round(5 * sc));
      x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--p1').trim() || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'currentColor';
      for (let yy = 0; yy < h; yy += step) for (let xx = 0; xx < w; xx += step) {
        const o = (yy * w + xx) * 4, lum = (px[o] * .2126 + px[o + 1] * .7152 + px[o + 2] * .0722) / 255, s = Math.round(step * (.16 + lum * .46));
        if (s > 0) x.fillRect(xx, yy, s, s);
      }
    });
  }
  // a palette switch changes --p1 / data-pal on the root: draw the backdrops again
  if (typeof MutationObserver === 'function') new MutationObserver(() => { clearTimeout(L.rz); L.rz = setTimeout(paintBackdrops, 60); }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-pal', 'data-accent', 'data-theme'] });
  window.addEventListener('resize', () => { clearTimeout(L.rz); L.rz = setTimeout(paintBackdrops, 200); });

  /* ---------- Books: shelves of codices ---------- */
  const TOK = ['var(--p1)', 'var(--p2)', 'var(--gold,#f2c46b)'];   // spines take their colour from the palette, so a switch recolours them
  function codex(b, i) {
    const h = hash(b.name), minutes = b.chars / 1100, hue = TOK[h % 3], shade = 20 + ((h >>> 16) % 14);
    const th = Math.max(4, Math.min(22, 4 + Math.round(minutes * .52))), ht = Math.max(190, Math.min(280, 190 + Math.round(b.chars / 900)));
    const recent = Date.now() - b.added < 14 * 864e5;
    return `<button type="button" class="lx-codex lx-v${(i + h) % 4}${recent ? ' is-recent' : ''}" data-lx="book:${E(b.id)}" aria-label="Read ${E(b.name)}" style="--c:${hue};--s:${shade}%;--th:${th};--ht:${ht}px">
      <span class="lx-spine"><span class="lx-band"></span>${sigil(h, 'lx-cs')}<span class="lx-ttl">${E(b.name)}</span><span class="lx-seal">${Math.max(1, Math.round(minutes))}m</span><span class="lx-band"></span><span class="lx-circuit"></span></span></button>`;
  }
  function booksHall(RD) {
    const books = (RD.kb || []).filter(x => !RD.kfilter || x.folder === RD.kfilter);
    if (!books.length) return empty('The shelves are empty. Add a text document and it stands here as a book.');
    const groups = new Map(); books.forEach(b => { const k = b.folder || 'Unshelved'; (groups.get(k) || groups.set(k, []).get(k)).push(b); });
    return `<div class="lx-shelves">${[...groups].map(([name, list]) => `<section class="lx-shelf-sec"><div class="lx-plaque"><span>${E(name)}</span></div><div class="lx-row" role="group" aria-label="${E(name)} books" tabindex="0">${list.map(codex).join('')}</div><div class="lx-edge" aria-hidden="true"></div></section>`).join('')}</div>`;
  }

  /* ---------- Documents: a heap of scrolls ---------- */
  function scroll(f) {
    const thick = 34 + Math.min(f.bytes / 60000, 40) * 1.1;
    return `<button type="button" class="lx-scroll lx-${f.kind}" style="--thick:${thick.toFixed(0)}px" data-lx="open:${E(f.id)}" aria-label="Open ${E(f.name)}">
      <span class="lx-sbody"><span class="lx-page" aria-hidden="true"><img src="${url(f.id)}/page/1" alt="" loading="lazy" onerror="this.remove()"></span><span class="lx-roll"><i></i></span><span class="lx-wax lx-wax-${f.ext === 'pdf' ? 'pdf' : 'doc'}">${sigil(f.ext === 'pdf' ? 1 : 0)}</span></span>
      <span class="lx-slabel"><b>${E(f.name)}</b><small>${f.ext.toUpperCase()} · ${size(f.bytes)} · ${when(f.added)}</small></span></button>`;
  }
  function docsHall() {
    const docs = L.files.filter(f => f.kind !== 'deck');
    const bar = `<div class="lx-bar2"><label class="lx-search"><input value="${E(L.q)}" id="lx-q" placeholder="Search inside the documents" aria-label="Search inside the documents"></label>
      <button type="button" class="btn ghost${L.showTrash ? ' on' : ''}" data-lx="trashview" aria-pressed="${L.showTrash}">Trash${L.trash.filter(f => f.kind !== 'deck').length ? ' (' + L.trash.filter(f => f.kind !== 'deck').length + ')' : ''}</button></div>`;
    let body;
    if (L.hits) body = `<div class="lx-hits">${L.hits.length ? L.hits.map(h => `<button type="button" class="lx-hit" data-lx="open:${E(h.id)}"><b>${E(h.name)}</b><small>${E(h.snippet)}</small></button>`).join('') : '<p class="lx-note">Nothing found.</p>'}</div>`;
    else if (L.showTrash) { const t = L.trash.filter(f => f.kind !== 'deck'); body = `<div class="lx-trash">${t.length ? t.map(f => `<div class="lx-trow"><span><b>${E(f.name)}</b><small>${f.ext.toUpperCase()} · ${size(f.bytes)}</small></span><span class="lx-acts"><button type="button" class="btn" data-lx="restore:${E(f.id)}">Restore</button>${L.sure === f.id ? `<button type="button" class="btn" data-lx="purge:${E(f.id)}">Delete for good</button>` : `<button type="button" class="btn ghost" data-lx="sure:${E(f.id)}">Delete</button>`}</span></div>`).join('') : '<p class="lx-note">The trash is empty.</p>'}</div>`; }
    else body = docs.length ? `<div class="lx-heap" role="list">${docs.map(f => `<div role="listitem">${scroll(f)}</div>`).join('')}</div>` : empty('No documents yet. Drop a PDF or a Word file here, or use Add.');
    return bar + body;
  }

  /* ---------- Presentations: the Theatrum ---------- */
  const plain = t => String(t).replace(/^CAESAR · /, 'CAESAR: ');
  function screenFor(d) {
    return d.ext === 'html'
      ? `<div class="lx-slide" style="--k:var(--lx-k,.5)" aria-hidden="true"><iframe title="${E(d.name)} first slide" src="${url(d.id)}/raw" sandbox="allow-scripts" loading="lazy" tabindex="-1"></iframe></div>`
      : `<img class="lx-first" src="${url(d.id)}/page/1" alt="" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'lx-note',textContent:'Preparing the first slide…'}))">`;
  }
  function theatre() {
    const decks = L.files.filter(f => f.kind === 'deck');
    if (!decks.length) return empty('No presentations yet. Add a PPTX, an ODP or a self-contained HTML deck.');
    L.sel = Math.min(L.sel, decks.length - 1); const d = decks[L.sel];
    return `<div class="lx-theatre" data-phase="${L.phase}"><section class="lx-stage" aria-label="Screen"><div class="lx-beam" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="lx-screen" id="lx-screen">${screenFor(d)}<button type="button" class="lx-hit2" data-lx="enter" aria-label="Enter ${E(d.name)}"></button></div>
      <div class="lx-caption"><div><span class="lx-kick">${d.ext.toUpperCase()} · ${when(d.added)}</span><h3>${E(plain(d.name))}</h3></div>
        <div class="lx-acts"><button type="button" class="btn" data-lx="enter">Enter</button><a class="btn ghost" href="${url(d.id)}/raw" target="_blank" rel="noopener">Open original</a><a class="btn ghost" href="${url(d.id)}/raw?dl=1" download>Download</a><button type="button" class="btn ghost" data-lx="trash:${E(d.id)}">Trash</button></div></div></section>
      <div class="lx-reels" role="listbox" aria-label="Presentations, arrow keys to choose" tabindex="0" data-lx-reels>${decks.map((x, i) => { const o = i - L.sel, a = Math.abs(o); return `<button type="button" role="option" aria-selected="${o === 0}" tabindex="-1" class="lx-reel${o === 0 ? ' is-on' : ''}${a > 2 ? ' is-far' : ''}" style="--o:${o};--a:${Math.min(a, 4)};z-index:${10 - Math.min(a, 9)}" data-lx="reel:${i}"><span class="lx-disk" aria-hidden="true"><i></i><b></b><em></em></span><span class="lx-rt">${E(plain(x.name))}</span></button>`; }).join('')}</div>
      <div class="lx-pager2"><button type="button" class="btn ghost" data-lx="rprev" aria-label="Previous presentation">Prev</button><span>${L.sel + 1} / ${decks.length}</span><button type="button" class="btn ghost" data-lx="rnext" aria-label="Next presentation">Next</button></div>
      ${L.phase !== 'idle' ? `<div class="lx-dim" data-lx="skip">${L.phase === 'title' ? `<div class="lx-title"><span class="lx-kick">${d.ext.toUpperCase()}</span><b>${E(plain(d.name))}</b><small>tap to skip</small></div>` : ''}</div>` : ''}</div>`;
  }

  const empty = t => (window.xKeeper ? window.xKeeper('library', '', t) : `<div class="lx-blank"><span class="lx-ghost" aria-hidden="true"></span><span class="lx-ghost" aria-hidden="true"></span><span class="lx-ghost" aria-hidden="true"></span><p>${E(t)}</p></div>`);

  /* ---------- the viewer: a file, or a book's text ---------- */
  function viewer() {
    if (L.book) {
      const b = L.book, h = hash(b.name);
      return `<div class="lx-ov" role="dialog" aria-modal="true" aria-label="${E(b.name)}"><div class="lx-win"><div class="lx-bar"><span class="lx-chip">${sigil(h)}</span><b>${E(b.name)}</b><button type="button" class="btn" data-lx="close">Close</button></div>
        <div class="lx-body"><article class="lx-text">${b.text == null ? '<p class="lx-note">Opening…</p>' : b.text.split(/\n{2,}/).map(p => /^#{1,3}\s/.test(p) ? `<h3>${E(p.replace(/^#+\s*/, ''))}</h3>` : `<p>${E(p)}</p>`).join('')}</article></div></div></div>`;
    }
    const f = (L.files || []).find(x => x.id === L.open); if (!f) return '';
    const isDeck = f.kind === 'deck', u = url(f.id);
    let body;
    if (f.ext === 'html') body = `<iframe class="lx-frame" src="${u}/raw" sandbox="allow-scripts" title="${E(f.name)}"></iframe>`;
    else if (L.pages === null) body = '<p class="lx-note">Preparing the preview. Office files are converted once, which can take a moment.</p>';
    else if (!L.pages) body = '<p class="lx-note">No preview on this device (the converter is not installed). The original still opens and downloads.</p>';
    else if (isDeck) body = `<div class="lx-pager"><button type="button" class="btn" data-lx="prev"${L.page <= 1 ? ' disabled' : ''} aria-label="Previous slide">Prev</button><span>${L.page} / ${L.pages}</span><button type="button" class="btn" data-lx="next"${L.page >= L.pages ? ' disabled' : ''} aria-label="Next slide">Next</button><button type="button" class="btn ghost" data-lx="present">Present</button></div><div class="lx-sheet"><img src="${u}/page/${L.page}" alt="${E(f.name)}, slide ${L.page}"></div>`;
    else body = Array.from({ length: L.pages }, (_, i) => `<img class="lx-pg" src="${u}/page/${i + 1}" alt="${E(f.name)}, page ${i + 1} of ${L.pages}" loading="lazy">`).join('');
    const pres = L.present && isDeck && L.pages ? `<div class="lx-pres" role="dialog" aria-label="Presenting ${E(f.name)}"><img src="${u}/page/${L.page}" alt="Slide ${L.page}"><div class="lx-pc"><button type="button" class="btn" data-lx="prev"${L.page <= 1 ? ' disabled' : ''}>Prev</button><span>${L.page} / ${L.pages}</span><button type="button" class="btn" data-lx="next"${L.page >= L.pages ? ' disabled' : ''}>Next</button><button type="button" class="btn ghost" data-lx="unpresent">Exit</button></div></div>` : '';
    return `<div class="lx-ov" role="dialog" aria-modal="true" aria-label="${E(f.name)}"><div class="lx-win"><div class="lx-bar"><span class="lx-chip">${sigil(f.ext === 'pdf' ? 1 : isDeck ? 5 : 0)}</span><b>${E(f.name)}</b><a class="btn" href="${u}/raw" target="_blank" rel="noopener">Open original</a><a class="btn" href="${u}/raw?dl=1" download>Download</a><button type="button" class="btn ghost" data-lx="trash:${E(f.id)}">Trash</button><button type="button" class="btn" data-lx="close">Close</button></div>
      <div class="lx-body">${body}</div></div>${pres}</div>`;
  }

  function hall(RD) {
    if (!L.files) { void load(); return ARTSKEL(4, 'Loading the shelf'); }
    const count = k => k === 'book' ? (RD.kb || []).length : L.files.filter(f => (k === 'deck') === (f.kind === 'deck')).length;
    const tabs = `<div class="lx-halls" role="tablist" aria-label="Halls">${HALLS.map(([k, n, la]) => `<button type="button" role="tab" class="btn ghost${L.hall === k ? ' on' : ''}" aria-selected="${L.hall === k}" data-lx="hall:${k}">${n} <span class="lx-n">${la} · ${count(k)}</span></button>`).join('')}
      <label class="btn lx-up">Add a file<input type="file" id="lx-file" multiple accept=".pdf,.pptx,.ppt,.odp,.html,.docx,.doc,.odt,.rtf" hidden></label></div>${L.err ? `<p role="alert" class="lx-note">${E(L.err)}</p>` : ''}${L.busy ? `<p class="lx-note" role="status">${E(L.busy)}</p>` : ''}`;
    const inner = L.hall === 'book' ? booksHall(RD) : L.hall === 'doc' ? docsHall() : theatre();
    const cls = L.fresh && motion() ? ' lx-in' : ''; L.fresh = false;
    setTimeout(() => { paintBackdrops(); const sc = document.getElementById('lx-screen'); if (sc) sc.style.setProperty('--lx-k', sc.clientWidth / 1280); }, 0);
    return `${tabs}<div class="lx-hallroot${cls}" data-hall="${L.hall}" data-lx-drop><canvas class="lx-backdrop" data-src="${ART[L.hall]}" aria-hidden="true"></canvas><div class="lx-hallbody">${inner}</div></div>${viewer()}`;
  }

  /* ---------- actions ---------- */
  async function openFile(id) {
    L.open = id; L.book = null; L.page = 1; L.pages = null; L.present = false; refresh();
    const f = (L.files || []).find(x => x.id === id); if (!f || f.ext === 'html') return;
    try { const j = await (await fetch(url(id) + '/pages')).json(); if (L.open === id) { L.pages = j.pages || 0; refresh(); } } catch { if (L.open === id) { L.pages = 0; refresh(); } }
  }
  async function openBook(id) {
    const b = (window.xRD && window.xRD.kb || []).find(x => x.id === id); L.open = null; L.book = { name: b ? b.name : '', text: null }; refresh();
    try { const j = await (await fetch('/api/knowledge/' + encodeURIComponent(id) + '/text')).json(); L.book = { name: j.name || L.book.name, text: j.text || '' }; } catch { L.book = { name: L.book.name, text: 'The text could not be read.' }; }
    refresh();
  }
  async function upload(list) {
    L.err = '';
    for (const f of list) {
      L.busy = 'Adding ' + f.name + '…'; refresh();
      try {
        const r = await fetch('/api/library/files?name=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f });
        if (!r.ok) L.err = (await r.json().catch(() => ({}))).error === 'too_large' ? f.name + ' is larger than 80 MB.' : f.name + ' could not be added. PDF, PPTX, PPT, ODP, HTML deck, DOCX, DOC, ODT and RTF are kept.';
        else { const j = await r.json(); L.hall = j.kind === 'deck' ? 'deck' : 'doc'; }
      } catch { L.err = f.name + ' could not be added.'; }
    }
    L.busy = ''; await load();
  }
  let qt = 0;
  document.addEventListener('input', e => {
    if (!e.target || e.target.id !== 'lx-q') return; L.q = e.target.value; clearTimeout(qt);
    qt = setTimeout(async () => { if (L.q.trim().length < 2) L.hits = null; else try { L.hits = await (await fetch('/api/library/files/search?q=' + encodeURIComponent(L.q))).json(); } catch { L.hits = []; } refresh(); setTimeout(() => { const i = document.getElementById('lx-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 260);
  });
  document.addEventListener('change', e => { if (e.target && e.target.id === 'lx-file' && e.target.files.length) { const l = [...e.target.files]; e.target.value = ''; void upload(l); } });
  document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('[data-lx-drop]')) e.preventDefault(); });
  document.addEventListener('drop', e => { if (e.target.closest && e.target.closest('[data-lx-drop]') && e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); void upload([...e.dataTransfer.files]); } });
  const decks = () => (L.files || []).filter(f => f.kind === 'deck');
  const step = d => { const n = decks().length; if (n) { L.sel = (L.sel + d + n) % n; refresh(); } };
  const closeAll = () => { L.open = null; L.book = null; L.present = false; L.phase = 'idle'; clearTimeout(L.t1); clearTimeout(L.t2); refresh(); };
  const enter = () => {
    const d = decks()[L.sel]; if (!d) return;
    if (!motion()) { void openFile(d.id); return; }
    L.phase = 'dim'; refresh(); L.t1 = setTimeout(() => { L.phase = 'title'; refresh(); }, 450); L.t2 = setTimeout(() => { L.phase = 'idle'; void openFile(d.id); }, 1650);
  };
  document.addEventListener('keydown', e => {
    if (L.phase !== 'idle' && e.key === 'Escape') { clearTimeout(L.t1); clearTimeout(L.t2); L.phase = 'idle'; const d = decks()[L.sel]; if (d) void openFile(d.id); return; }
    if (L.open || L.book) {
      if (e.key === 'Escape') { if (L.present) { L.present = false; refresh(); } else closeAll(); }
      else if (L.pages && (e.key === 'ArrowRight' || e.key === 'PageDown') && L.page < L.pages && (L.present || (L.files.find(x => x.id === L.open) || {}).kind === 'deck')) { L.page++; refresh(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && L.page > 1 && (L.present || (L.files.find(x => x.id === L.open) || {}).kind === 'deck')) { L.page--; refresh(); }
      return;
    }
    if (e.target && e.target.matches && e.target.matches('[data-lx-reels]')) {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } else if (e.key === 'Enter') { e.preventDefault(); enter(); }
    }
  });
  let tx = 0;
  document.addEventListener('touchstart', e => { if (e.target.closest && e.target.closest('[data-lx-reels]')) tx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => { if (e.target.closest && e.target.closest('[data-lx-reels]')) { const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); } }, { passive: true });
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('[data-lx]'); if (!t || t.hasAttribute('disabled') || !t.dataset.lx) return;
    const [k, v] = t.dataset.lx.split(/:(.*)/s);
    if (k === 'hall') { if (L.hall !== v) { L.hall = v; L.hits = null; L.showTrash = false; L.fresh = true; } refresh(); }
    else if (k === 'open') void openFile(v);
    else if (k === 'book') void openBook(v);
    else if (k === 'close') closeAll();
    else if (k === 'prev') { L.page = Math.max(1, L.page - 1); refresh(); }
    else if (k === 'next') { L.page = Math.min(L.pages || 1, L.page + 1); refresh(); }
    else if (k === 'present') { L.present = true; refresh(); try { await document.documentElement.requestFullscreen(); } catch { /* the overlay is full window anyway */ } }
    else if (k === 'unpresent') { L.present = false; refresh(); if (document.fullscreenElement) try { await document.exitFullscreen(); } catch { /* ignore */ } }
    else if (k === 'reel') { if (+v === L.sel) enter(); else { L.sel = +v; refresh(); } }
    else if (k === 'rprev') step(-1); else if (k === 'rnext') step(1);
    else if (k === 'enter') enter();
    else if (k === 'skip') { clearTimeout(L.t1); clearTimeout(L.t2); L.phase = 'idle'; const d = decks()[L.sel]; if (d) void openFile(d.id); }
    else if (k === 'trashview') { L.showTrash = !L.showTrash; L.sure = null; refresh(); }
    else if (k === 'trash') { await fetch(url(v) + '/trash', { method: 'POST' }); L.open = null; await load(); }
    else if (k === 'restore') { await fetch(url(v) + '/restore', { method: 'POST' }); await load(); }
    else if (k === 'sure') { L.sure = v; refresh(); }
    else if (k === 'purge') { await fetch(url(v), { method: 'DELETE' }); L.sure = null; await load(); }
  });
  window.xLib = { hall, sigil };
  if (typeof register === 'function') register({ id: 'library', views: {} });   // it adds no view: real.js draws the page and calls xLib.hall
})();
