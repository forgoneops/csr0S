/* Notes: Memory (Tabularium) and Editor (Scriptorium) are one real surface, backed by /api/notes (core/notes.ts).
   Explicit save only, revision-checked: a conflict never loses typed text. */
(() => {
  const NEW = '\u0000new';
  const NT = { map: false, mapView: 'net', cut: 1, graph: null, zoom: 1, notes: [], tags: [], q: '', tag: '', cur: null, content: '', rev: '', updatedAt: 0, dirty: false, saved: false, preview: false, loading: false, loaded: false, mobile: false, delAsk: false, pending: null, conflict: null, err: '', back: [], saving: false };
  const enc = encodeURIComponent;
  const api = async (method, url, body) => {
    try {
      const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
    } catch { return { ok: false, status: 0, data: null }; }
  };
  const onScreen = () => !!$('.nt');
  const when = ms => new Date(ms).toLocaleString();

  // Markdown preview: everything is escaped first, then a small set of patterns becomes tags.
  const md = text => {
    const keep = []; const hold = h => '\u0000' + (keep.push(h) - 1) + '\u0000';
    const s = esc(String(text).replace(/\u0000/g, ''))
      .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, c) => hold(`<pre><code>${c}</code></pre>`))
      .replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${c}</code>`));
    const out = []; let para = [], list = null;
    const flush = () => { if (para.length) out.push('<p>' + para.join('<br>') + '</p>'); para = []; if (list) out.push(`<${list[0]}>${list[1].join('')}</${list[0]}>`); list = null; };
    for (const l of s.split('\n')) {
      let m;
      if (!l.trim()) flush();
      else if ((m = l.match(/^(#{1,6}) +(.+)$/))) { flush(); out.push(`<h${m[1].length}>${m[2]}</h${m[1].length}>`); }
      else if ((m = l.match(/^\s*([-*+]|\d+[.)]) +(.+)$/))) { const k = /\d/.test(m[1]) ? 'ol' : 'ul'; if (para.length || (list && list[0] !== k)) flush(); (list = list || [k, []])[1].push(`<li>${m[2]}</li>`); }
      else if (/^\u0000\d+\u0000$/.test(l)) { flush(); out.push(l); }
      else { if (list) flush(); para.push(l); }
    }
    flush();
    return out.join('\n')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*([^*\n]+)\*/g, '<i>$1</i>').replace(/(^|\W)_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>')
      .replace(/\[\[([^\]\n]+)\]\]/g, '<a href="#" data-nt-wiki="$1">$1</a>')
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, t, u) => /^(https?:\/\/|mailto:)/i.test(u) ? `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>` : t)
      .replace(/\u0000(\d+)\u0000/g, (_, i) => keep[i]);
  };

  const listHtml = () => NT.notes.length
    ? NT.notes.map(n => `<button class="nt-note${n.id === NT.cur ? ' on' : ''}" data-nt-note="${esc(n.id)}"><b>${esc(n.id)}</b><small>${esc(n.snippet)}</small><time>${esc(when(n.updatedAt))}</time></button>`).join('')
    : NT.q.trim() || NT.tag ? '<p class="nt-empty">No notes match</p>'
    : '<p class="nt-empty">No notes yet</p><button class="nt-b go" data-nt="new">' + I('plus', 16) + '<span>New note</span></button>';
  const tagsHtml = () => NT.tags.length ? NT.tags.map(t => `<button class="nt-tag${t.tag === NT.tag ? ' on' : ''}" data-nt-tag="${esc(t.tag)}" aria-pressed="${t.tag === NT.tag}">#${esc(t.tag)} <small>${t.count}</small></button>`).join('') : '';
  const paintList = () => { const a = $('#nt-lb'), b = $('#nt-tags'); if (a) a.innerHTML = listHtml(); if (b) b.innerHTML = tagsHtml(); };
  const stateText = () => NT.saving ? 'Saving…' : NT.dirty ? 'Not saved' : 'Saved';
  const paintState = () => { const s = $('#nt-state'), b = $('[data-nt="save"]'); if (s) s.textContent = stateText(); if (b) b.disabled = !NT.dirty || NT.saving; };

  async function refresh() {
    const url = NT.q.trim() ? '/api/notes?q=' + enc(NT.q.trim()) : NT.tag ? '/api/notes?tag=' + enc(NT.tag) : '/api/notes';
    const [l, t] = await Promise.all([api('GET', url), api('GET', '/api/notes/tags')]);
    if (l.ok && Array.isArray(l.data)) { NT.notes = l.data; if (!NT.cur) NT.err = ''; } else NT.err = 'Could not load notes';
    if (t.ok && Array.isArray(t.data)) NT.tags = t.data;
    paintList();
  }

  const apply = n => { NT.cur = n.id; NT.content = n.content; NT.rev = n.rev; NT.updatedAt = n.updatedAt; NT.dirty = false; NT.saved = false; NT.conflict = null; NT.pending = null; NT.delAsk = false; NT.preview = false; NT.err = ''; NT.mobile = true; };
  async function open(id) {
    const r = await api('GET', '/api/notes/' + enc(id));
    if (!r.ok) { NT.pending = null; NT.err = r.status === 404 ? `No note named ${id}` : 'Could not open the note'; return render(); }
    apply(r.data);
    const b = await api('GET', '/api/notes/' + enc(id) + '/backlinks');
    NT.back = b.ok && Array.isArray(b.data) ? b.data : [];
    render();
  }
  async function create() {
    const r = await api('POST', '/api/notes', { content: '' });
    if (!r.ok) { NT.err = 'Could not create a note'; return render(); }
    apply(r.data); NT.back = []; render(); void refresh();
  }
  const go = id => {
    if (id === NT.cur) return; // the open note is already here; re-opening it would drop typed text
    if (NT.dirty) { NT.pending = id; NT.mobile = true; return render(); } // never drop typed text silently
    return id === NEW ? create() : open(id);
  };

  async function save(rev) {
    if (NT.saving || !NT.cur) return !NT.dirty;
    const sent = NT.content, hadConflict = !!NT.conflict;
    NT.saving = true; paintState();
    const r = await api('PUT', '/api/notes/' + enc(NT.cur), { content: sent, rev: rev || NT.rev });
    NT.saving = false;
    if (r.ok) {
      NT.rev = r.data.rev; NT.updatedAt = r.data.updatedAt; NT.conflict = null; NT.err = '';
      if (NT.content === sent) { NT.dirty = false; NT.saved = true; }
      if (hadConflict) render(); else paintState();
      void refresh();
      return !NT.dirty;
    }
    if (r.status === 409 && r.data && r.data.current) NT.conflict = r.data.current; else NT.err = 'Could not save. Your text is still here.';
    render();
    return false;
  }

  async function loadTheirs() {
    const c = NT.conflict;
    // Park the typed text as a new Untitled note first, so loading theirs never loses it.
    await api('POST', '/api/notes', { content: NT.content });
    NT.content = c.content; NT.rev = c.rev; NT.updatedAt = c.updatedAt; NT.dirty = false; NT.conflict = null;
    render(); void refresh();
  }

  async function del() {
    if (!NT.delAsk) { NT.delAsk = true; return render(); }
    const r = await api('DELETE', '/api/notes/' + enc(NT.cur));
    if (!r.ok && r.status !== 404) { NT.err = 'Could not delete the note'; NT.delAsk = false; return render(); }
    NT.notes = NT.notes.filter(n => n.id !== NT.cur);
    Object.assign(NT, { cur: null, content: '', rev: '', dirty: false, delAsk: false, conflict: null, pending: null, mobile: false, back: [], err: '' });
    render(); void refresh();
  }

  function editorHtml() {
    if (!NT.cur) return `<section class="nt-ed panel"><p class="nt-empty">${NT.err ? esc(NT.err) : 'Select a note, or create a new one.'}</p></section>`;
    const btn = (a, label, cls = '', extra = '') => `<button class="nt-b ${cls}" data-nt="${a}" ${extra}><span>${label}</span></button>`;
    const acts = NT.pending
      ? btn('save-open', 'Save and open', 'go') + btn('discard', 'Discard')
      : btn('preview', NT.preview ? 'Edit' : 'Preview') + btn('save', 'Save', 'go', NT.dirty ? '' : 'disabled') + btn('del', NT.delAsk ? 'Move to trash' : 'Delete');
    return `<section class="nt-ed panel">
      <div class="nt-bar"><button class="nt-b nt-backbtn" data-nt="back">${I('chevron-right', 16)}<span>Back</span></button><h3 class="nt-name">${esc(NT.cur)}</h3><span class="label" id="nt-state" role="status">${stateText()}</span><div class="nt-acts">${acts}</div></div>
      ${NT.pending ? '<p class="nt-msg">You have unsaved changes. Save them, or discard them to open the other note.</p>' : ''}
      ${NT.conflict ? `<div class="nt-msg nt-conf"><span>This note changed elsewhere: theirs ${esc(when(NT.conflict.updatedAt))}, yours ${esc(when(NT.updatedAt))}</span><span class="nt-acts"><button class="nt-b go" data-nt="keep"><span>Keep mine</span></button><button class="nt-b" data-nt="load"><span>Load theirs</span></button></span></div>` : ''}
      ${NT.err ? `<p class="nt-msg">${esc(NT.err)}</p>` : ''}
      ${NT.preview ? `<div class="nt-md">${md(NT.content)}</div>` : `<textarea id="nt-editor" class="nt-text" spellcheck="true" aria-label="Note text">${esc(NT.content)}</textarea>`}
      ${NT.back.length ? `<div class="nt-back"><span class="label">Linked from</span>${NT.back.map(n => `<button class="nt-tag" data-nt-note="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
    </section>`;
  }

  /** The map: the same notes as the list, drawn by their [[links]] (core/graphlayout.ts places them). Scroll to pan, buttons to zoom; every node opens its note. */
  async function loadGraph() { const r = await api('GET', '/api/notes/graph'); NT.graph = r.ok && r.data ? r.data : { error: true }; if (onScreen()) render(); }
  const diamond = (x, y, r) => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;     // no round shapes: a note is a diamond
  function mapHtml() {
    const g = NT.graph, tree = NT.mapView === 'tree';
    const bar = `<div class="nt-bar"><h3 class="nt-name">${tree ? 'Tree' : 'Map'}</h3><span class="label">${g && g.nodes ? `${g.total} notes${g.truncated ? ' (the 600 best linked are drawn)' : ''}${tree ? '' : `, ${g.edges.length} links`}` : ''}</span><div class="nt-acts"><button class="nt-b" data-nt="${tree ? 'mvnet' : 'mvtree'}" aria-pressed="${tree}"><span>${tree ? 'Network' : 'Tree'}</span></button><button class="nt-b" data-nt="zout" aria-label="Zoom out"><span>\u2212</span></button><button class="nt-b" data-nt="zin" aria-label="Zoom in"><span>+</span></button><button class="nt-b" data-nt="mapclose"><span>Close map</span></button></div></div>`;
    if (!g) { void loadGraph(); return `<section class="nt-ed panel">${bar}<p class="nt-empty">Reading the notes\u2026</p></section>`; }
    if (!g.nodes) return `<section class="nt-ed panel">${bar}<p class="nt-empty">Could not load the map</p></section>`;
    if (!g.nodes.length) return `<section class="nt-ed panel">${bar}<p class="nt-empty">No notes yet. Link notes with [[Name]] and they connect here.</p></section>`;
    const at = new Map(g.nodes.map(n => [n.id, n])), folders = [...new Set(g.nodes.map(n => n.folder))].sort();
    // time travel: the notes as they were on a day; later notes are not there yet
    const lo = Math.min(...g.nodes.map(n => n.updated)), hi = Math.max(...g.nodes.map(n => n.updated), Date.now()), at0 = lo + (hi - lo) * NT.cut;
    const shown = n => NT.cut >= 0.999 || n.updated <= at0, now = Date.now(), recent = [...g.nodes].filter(shown).sort((a, b) => b.updated - a.updated).slice(0, 8);
    const pos = n => tree && g.tree && g.tree.nodes[n.id] ? g.tree.nodes[n.id] : [n.x, n.y];
    const lines = tree ? `<path class="nt-trunk" d="M500 410L500 622"/>` + (g.tree ? g.tree.branches.map(b => `<path class="nt-branch" d="M${b.x1} ${b.y1}L${b.x2} ${b.y2}"/>`).join('') : '')
      : g.edges.map(e => { const a = at.get(e.from), b = at.get(e.to); return a && b && shown(a) && shown(b) ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>` : ''; }).join('');
    const dots = g.nodes.filter(shown).map(n => { const [x, y] = pos(n), age = now - n.updated, heat = age < 36e5 ? ' nt-hot' : age < 6048e5 ? ' nt-warm' : '', hue = folders.indexOf(n.folder) * 47 % 360, r = 5 + Math.min(n.degree, 10);
      return `<g class="nt-node${heat}${n.id === NT.cur ? ' on' : ''}" data-nt-note="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.id)}, ${n.degree} links"><title>${esc(n.id)}</title><path d="${diamond(x, y, r)}" style="fill:${n.folder ? `hsl(${hue} 55% 60%)` : 'var(--accent,#e8a33d)'}"/><text x="${x}" y="${y + r + 12}" text-anchor="middle">${esc(n.title.slice(0, 22))}</text></g>`; }).join('');
    const day = new Date(at0).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const slider = `<div class="nt-cutrow"><label class="label" for="nt-cut">The notes as they were on</label><input id="nt-cut" class="nt-cut" type="range" min="0" max="100" value="${Math.round(NT.cut * 100)}"><span class="nt-day" data-no-i18n>${NT.cut >= 0.999 ? 'today' : esc(day)}</span></div>`;
    return `<section class="nt-ed panel">${bar}${slider}<div class="nt-map"><svg data-no-i18n viewBox="0 0 1000 640" style="width:${Math.round(100 * NT.zoom)}%" role="group" aria-label="${tree ? 'Notes tree' : 'Notes map'}"><g class="nt-edges">${lines}</g>${dots}</svg></div>
      <div class="nt-recent"><span class="label">Recently changed</span>${recent.map(n => `<button class="nt-tag" data-nt-note="${esc(n.id)}" data-no-i18n>${esc(n.title)}</button>`).join('')}</div></section>`;
  }

  function notesView() {
    if (!NT.loaded && !NT.loading) { NT.loading = true; void refresh().then(() => { NT.loading = false; NT.loaded = true; if (onScreen()) render(); }); }
    return `<div class="nx-view enter nt">${nsHead('Notes', 'Your notes are markdown files on this machine.', 'Tabularium')}
      <div class="nt-wrap${NT.mobile ? ' nt-open' : ''}">
        <aside class="nt-list panel">
          <input class="og-input" id="nt-q" type="search" placeholder="Search notes" aria-label="Search notes" value="${esc(NT.q)}" autocomplete="off">
          <button class="nt-b go" data-nt="new">${I('plus', 16)}<span>New note</span></button>
          <button class="nt-b" data-nt="map" aria-pressed="${NT.map}"><span>Map</span></button>
          <div class="nt-tags" id="nt-tags">${tagsHtml()}</div>
          ${NT.err && !NT.cur ? `<p class="nt-msg">${esc(NT.err)}</p>` : ''}
          <div class="nt-lb" id="nt-lb">${NT.loaded ? listHtml() : '<p class="nt-empty">Loading…</p>'}</div>
        </aside>
        ${NT.map ? mapHtml() : editorHtml()}
      </div></div>`;
  }
  register({ id: 'notes', views: { Memory: notesView, Editor: notesView } });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-nt],[data-nt-note],[data-nt-tag],[data-nt-wiki]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const d = b.dataset;
    if (d.ntNote !== undefined) { NT.map = false; return void go(d.ntNote); }
    if (d.ntWiki !== undefined) { NT.map = false; return void go(d.ntWiki); }
    if (d.ntTag !== undefined) { NT.tag = NT.tag === d.ntTag ? '' : d.ntTag; NT.q = ''; const q = $('#nt-q'); if (q) q.value = ''; return void refresh(); }
    const a = d.nt;
    if (a === 'map') { NT.map = !NT.map; NT.graph = null; NT.mobile = NT.map; render(); }
    else if (a === 'mvtree' || a === 'mvnet') { NT.mapView = a === 'mvtree' ? 'tree' : 'net'; render(); }
    else if (a === 'mapclose') { NT.map = false; NT.mobile = !!NT.cur; render(); }
    else if (a === 'zin' || a === 'zout') { NT.zoom = Math.max(1, Math.min(4, NT.zoom + (a === 'zin' ? 0.5 : -0.5))); render(); }
    else if (a === 'new') { NT.map = false; go(NEW); }
    else if (a === 'back') { NT.mobile = false; render(); }
    else if (a === 'preview') { NT.preview = !NT.preview; render(); }
    else if (a === 'save') void save();
    else if (a === 'del') void del();
    else if (a === 'keep') void save(NT.conflict.rev);
    else if (a === 'load') void loadTheirs();
    else if (a === 'save-open') { const p = NT.pending; void save().then(ok => { if (ok) { NT.pending = null; return p === NEW ? create() : open(p); } }); }
    else if (a === 'discard') { const p = NT.pending; NT.dirty = false; NT.pending = null; if (p === NEW) void create(); else void open(p); }
  }, true);

  let t = 0;
  document.addEventListener('change', e => { if (e.target && e.target.id === 'nt-cut') { NT.cut = +e.target.value / 100; render(); } });
  document.addEventListener('input', e => {
    if (e.target.id === 'nt-editor') { NT.content = e.target.value; if (!NT.dirty) { NT.dirty = true; NT.saved = false; } paintState(); }
    else if (e.target.id === 'nt-q') { NT.q = e.target.value; NT.tag = ''; clearTimeout(t); t = setTimeout(() => void refresh(), 250); } // list repaints in place, so focus and caret stay
  });
  document.addEventListener('keydown', e => {
    const nd = e.target.closest && e.target.closest('.nt-node'); if (nd && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nd.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || !onScreen() || !NT.cur) return;
    e.preventDefault(); if (NT.dirty && !NT.pending) void save();
  });
})();
