/* Notes: Memory (Tabularium) and Editor (Scriptorium) are one real surface, backed by /api/notes (core/notes.ts).
   Explicit save only, revision-checked: a conflict never loses typed text. */
(() => {
  const NEW = '\u0000new';
  const graphSaved = (() => { try { return JSON.parse(localStorage.getItem('caesaros-brain-graph-view') || '{}') || {}; } catch { return {}; } })();
  const SCROLL_KEY = 'caesaros-brain-view-scroll'; let restoreScrollPending = true;
  const NT = { map: (() => { try { return localStorage.getItem('caesaros-brain-map-open') === '1'; } catch { return false; } })(), focus: false, recall: false, demo: false, sampleInfo: false, gq: '', rq: '', hits: null, mapView: 'net', cut: 1, graph: null, zoom: 1, notes: [], tags: [], q: '', tag: '', cur: null, content: '', rev: '', updatedAt: 0, dirty: false, saved: false, preview: false, loading: false, loaded: false, mobile: (() => { try { return localStorage.getItem('caesaros-brain-map-open') === '1'; } catch { return false; } })(), delAsk: false, pending: null, conflict: null, err: '', back: [], out: [], saving: false, pinned: (() => { try { return new Set(JSON.parse(localStorage.getItem('caesaros-brain-pinned') || '[]')); } catch { return new Set(); } })() };
  const enc = encodeURIComponent;
  const rememberSelection = id => { try { const s = JSON.parse(localStorage.getItem('caesaros-brain-graph-view') || '{}'); localStorage.setItem('caesaros-brain-graph-view', JSON.stringify({ ...s, selected: id })); } catch { /* private window */ } };
  const stashScroll = () => { try { const pick = s => document.querySelector(s)?.scrollTop || 0; localStorage.setItem(SCROLL_KEY, JSON.stringify({ wrap: pick('.nt-wrap'), list: pick('.nt-list'), panel: pick('.nt-ed'), view: pick('.nx-view.nt') })); } catch { /* private window */ } };
  const restoreScroll = () => { if (!restoreScrollPending) return; restoreScrollPending = false; try { const s = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}'); for (const [key, selector] of [['wrap','.nt-wrap'],['list','.nt-list'],['panel','.nt-ed'],['view','.nx-view.nt']]) { const el = document.querySelector(selector); if (el && Number.isFinite(+s[key])) el.scrollTop = +s[key]; } } catch { /* private window */ } };
  const api = async (method, url, body) => {
    try {
      const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
    } catch { return { ok: false, status: 0, data: null }; }
  };
  const onScreen = () => !!$('.nt');
  const when = ms => new Date(ms).toLocaleString(uiLocale());

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
  const tagsHtml = () => NT.tags.length ? NT.tags.map(t => `<button class="nt-tag${t.tag === NT.tag ? ' on' : ''}" data-no-i18n data-nt-tag="${esc(t.tag)}" aria-pressed="${t.tag === NT.tag}">#${esc(t.tag)} <small>${t.count}</small></button>`).join('') : '';
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

  const apply = n => { NT.cur = n.id; rememberSelection(n.id); NT.content = n.content; NT.rev = n.rev; NT.updatedAt = n.updatedAt; NT.dirty = false; NT.saved = false; NT.conflict = null; NT.pending = null; NT.delAsk = false; NT.preview = false; NT.err = ''; NT.mobile = true; };
  async function open(id) {
    const r = await api('GET', '/api/notes/' + enc(id));
    if (!r.ok) { NT.pending = null; NT.err = r.status === 404 ? `No note named ${id}` : 'Could not open the note'; if (r.status === 404 && id === graphSaved.selected) rememberSelection(null); return render(); }
    apply(r.data);
    const b = await api('GET', '/api/notes/' + enc(id) + '/backlinks');
    NT.back = b.ok && Array.isArray(b.data) ? b.data : [];
    const refs = [...String(NT.content).matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim()).filter(Boolean);
    NT.out = [...new Set(refs.map(ref => NT.notes.find(n => n.id.toLowerCase() === ref.toLowerCase() || n.id.split('/').pop().toLowerCase() === ref.toLowerCase())?.id || ref))];
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
      <div class="nt-bar"><button class="nt-b nt-backbtn" data-nt="back">${I('chevron-right', 16)}<span>Back</span></button><h3 class="nt-name">${esc(NT.cur)}</h3><span class="label" id="nt-state" role="status">${stateText()}</span><div class="nt-acts">${window.xAutosave && !NT.pending ? xAutosave.controls(NT.cur, NT.content) : ''}<button class="nt-b" data-nt="pin" aria-pressed="${NT.pinned.has(NT.cur)}"><span>${NT.pinned.has(NT.cur) ? 'Unpin' : 'Pin for recall'}</span></button>${acts}</div></div>
      ${NT.pending ? '<p class="nt-msg">You have unsaved changes. Save them, or discard them to open the other note.</p>' : ''}
      ${NT.conflict ? `<div class="nt-msg nt-conf"><span>This note changed elsewhere: theirs ${esc(when(NT.conflict.updatedAt))}, yours ${esc(when(NT.updatedAt))}</span><span class="nt-acts"><button class="nt-b go" data-nt="keep"><span>Keep mine</span></button><button class="nt-b" data-nt="load"><span>Load theirs</span></button></span></div>` : ''}
      ${NT.err ? `<p class="nt-msg">${esc(NT.err)}</p>` : ''}
      <div class="nt-links"><div class="nt-back"><span class="label">Outgoing links</span>${NT.out.length ? NT.out.map(n => `<button class="nt-tag" data-nt-note="${esc(n)}">${esc(n)}</button>`).join('') : '<span class="nt-empty">None yet</span>'}</div><div class="nt-back"><span class="label">Backlinks</span>${NT.back.length ? NT.back.map(n => `<button class="nt-tag" data-nt-note="${esc(n)}">${esc(n)}</button>`).join('') : '<span class="nt-empty">None yet</span>'}</div></div>
      ${NT.preview ? `<div class="nt-md">${md(NT.content)}</div>` : `<textarea id="nt-editor" class="nt-text" spellcheck="true" aria-label="Note text">${esc(NT.content)}</textarea>`}
    </section>`;
  }

  /** The map: the same notes as the list, drawn by their [[links]] (core/graphlayout.ts places them). Scroll to pan, buttons to zoom; every node opens its note. */
  async function loadGraph() { const r = await api('GET', '/api/notes/graph'); NT.graph = r.ok && r.data ? r.data : { error: true }; if (onScreen()) render(); }
  const diamond = (x, y, r) => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;     // no round shapes: a note is a diamond
  function mapHtml() {
    let g = NT.graph; const sample = NT.demo && g && g.nodes && !g.nodes.length, tree = NT.mapView === 'tree' && !sample;
    if (sample) { const d = window.ntDemoGraph(); g = { nodes: d.nodes, edges: d.edges, total: d.nodes.length, truncated: false, tree: null }; }
    const bar = `<div class="nt-bar"><h3 class="nt-name">${uiText(tree ? 'Tree' : 'Map')}</h3>${sample ? `<button class="nt-b nt-sample" data-nt="sample-info" aria-expanded="${NT.sampleInfo}"><span>Sample, not your notes</span></button>` : `<span class="label">${g && g.nodes ? `${g.total} notes${g.truncated ? ' (the 600 best linked are drawn)' : ''}${tree ? '' : `, ${g.edges.length} links`}` : ''}</span>`}<div class="nt-acts"><button class="nt-b" data-nt="${tree ? 'mvnet' : 'mvtree'}" aria-pressed="${tree}"><span>${tree ? 'Network' : 'Tree'}</span></button><button class="nt-b" data-nt="zout" aria-label="Zoom out"><span>\u2212</span></button><button class="nt-b" data-nt="zin" aria-label="Zoom in"><span>+</span></button><button class="nt-b" data-nt="fit"><span>Fit</span></button><button class="nt-b" data-nt="focus" aria-pressed="${NT.focus}"><span>${NT.focus ? 'Exit focus' : 'Focus'}</span></button><button class="nt-b" data-nt="mapclose"><span>Close map</span></button></div></div>`;
    if (!g) { void loadGraph(); return `<section class="nt-ed panel">${bar}<p class="nt-empty">Reading the notes\u2026</p></section>`; }
    if (!g.nodes) return `<section class="nt-ed panel">${bar}<div class="nt-statecard"><span class="nt-state-mark" aria-hidden="true">!</span><h4>Map unavailable</h4><p class="nt-empty">The notes graph could not be reached. Your notes are unchanged.</p><button class="nt-b" data-nt="retry-map"><span>Try again</span></button></div></section>`;
    if (!g.nodes.length && !NT.demo) return `<section class="nt-ed panel">${bar}<p class="nt-empty">No notes yet. Link notes with [[Name]] and they connect here.</p><button class="nt-b" data-nt="demo"><span>Show a sample map</span></button></section>`;
    const at = new Map(g.nodes.map(n => [n.id, n])), folders = [...new Set(g.nodes.map(n => n.folder))].sort();
    // time travel: the notes as they were on a day; later notes are not there yet
    const lo = Math.min(...g.nodes.map(n => n.updated)), hi = Math.max(...g.nodes.map(n => n.updated), Date.now()), at0 = lo + (hi - lo) * NT.cut;
    const shown = n => NT.cut >= 0.999 || n.updated <= at0, now = Date.now(), recent = [...g.nodes].filter(shown).sort((a, b) => b.updated - a.updated).slice(0, 8);
    const pos = n => tree && g.tree && g.tree.nodes[n.id] ? g.tree.nodes[n.id] : [n.x, n.y];
    const lines = tree ? `<path class="nt-trunk" d="M500 410L500 622"/>` + (g.tree ? g.tree.branches.map(b => `<path class="nt-branch" d="M${b.x1} ${b.y1}L${b.x2} ${b.y2}"/>`).join('') : '')
      : g.edges.map(e => { const a = at.get(e.from), b = at.get(e.to); return a && b && shown(a) && shown(b) ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>` : ''; }).join('');
    const dots = g.nodes.filter(shown).map(n => { const [x, y] = pos(n), age = now - n.updated, heat = age < 36e5 ? ' nt-hot' : age < 6048e5 ? ' nt-warm' : '', pal = ['--p2', '--p1', '--gold', '--tint-magenta'][Math.max(0, folders.indexOf(n.folder)) % 4], r = 5 + Math.min(n.degree, 10);
      return `<g class="nt-node${heat}${n.id === NT.cur ? ' on' : ''}" data-nt-note="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.id)}, ${n.degree} links"><title>${esc(n.id)}</title><path d="${diamond(x, y, r)}" style="fill:var(${pal})"/><text x="${x}" y="${y + r + 12}" text-anchor="middle">${esc(n.title.slice(0, 22))}</text></g>`; }).join('');
    const day = new Date(at0).toLocaleDateString(uiLocale(undefined), { day: 'numeric', month: 'short', year: 'numeric' });
    const slider = `<div class="nt-cutrow"><label class="label" for="nt-cut">The notes as they were on</label><input id="nt-cut" class="nt-cut" type="range" min="0" max="100" value="${Math.round(NT.cut * 100)}"><span class="nt-day" data-no-i18n>${NT.cut >= 0.999 ? 'today' : esc(day)}</span></div>`;
    return `<section class="nt-ed panel">${bar}${sample && NT.sampleInfo ? '<p class="nt-msg">Sample map, not your notes. Write notes with [[links]] and your own map appears here.</p>' : ''}${tree ? `${slider}<div class="nt-map"><svg data-no-i18n viewBox="0 0 1000 640" style="width:${Math.round(100 * NT.zoom)}%" role="group" aria-label="Notes tree"><g class="nt-edges">${lines}</g>${dots}</svg></div>` : netHtml(g, shown, sample, slider)}
      <div class="nt-recent"><span class="label">Recently changed</span>${recent.map(n => `<button class="nt-tag" data-nt-note="${esc(n.id)}" data-no-i18n>${esc(n.title)}</button>`).join('')}</div></section>`;
  }

  /** The network: a canvas drawn by graph.js. Search lights the matches; the Recently changed buttons below are the keyboard and screen-reader route. */
  function netHtml(g, shown, sample, slider) {
    const nodes = g.nodes.filter(shown), ids = new Set(nodes.map(n => n.id));
    window.ntGraphData = { nodes, edges: g.edges.filter(e => ids.has(e.from) && ids.has(e.to)), cur: NT.cur, q: NT.gq, demo: sample, open: id => { NT.map = false; try { localStorage.setItem('caesaros-brain-map-open', '0'); } catch {} void go(id); } };
    return `<div class="nt-tools">${slider}<div class="nt-cutrow"><label class="label" for="nt-gq">Find in the map</label><input id="nt-gq" class="og-input" type="search" placeholder="Note name" value="${esc(NT.gq)}" autocomplete="off"></div></div>
      <div class="nt-clusters"><span class="label">Clusters</span>${[...new Set(nodes.map(n => n.folder || 'Unfiled'))].sort().map((f, i) => `<span class="nt-cluster" style="--cluster:var(${['--p2','--p1','--gold','--tint-magenta'][i % 4]})"><i></i>${f === 'Unfiled' ? f : `<span data-no-i18n>${esc(f)}</span>`}</span>`).join('')}</div>
      <div class="nt-map nt-gcwrap"><canvas class="nt-gc" tabindex="0" data-no-i18n role="img" aria-label="Notes map: drag to move, pinch or scroll to zoom, tap a note to open it"></canvas></div>`;
  }

  /** Recall: ask the notes (and chats, board, library) in plain words; also what is worth a second look. Read-only. */
  let rt = 0;
  async function recallSearch() {
    const q = NT.rq.trim(); if (q.length < 2) { NT.hits = null; NT.searchErr = false; return paintRecall(); }
    const r = await api('GET', '/api/search?q=' + enc(q)); NT.searchErr = !r.ok; NT.hits = r.ok && Array.isArray(r.data) ? r.data : []; paintRecall();
  }
  const paintRecall = () => { const e = $('#nt-rc'); if (e) e.innerHTML = recallBody(); };
  function recallBody() {
    if (NT.hits) return NT.searchErr ? '<div class="nt-statecard"><h4>Search unavailable</h4><p class="nt-empty">Reconnect to search your local Brain.</p></div>' : NT.hits.length ? NT.hits.map(h => `<button class="nt-note" ${h.kind === 'note' ? `data-nt-note="${esc(h.ref)}"` : 'disabled'}><b>${esc(h.title)}</b><small>${esc(h.text)}</small><time>${esc(h.kind)}</time></button>`).join('') : '<p class="nt-empty">Nothing found</p>';
    const g = NT.graph;
    if (!g) { void loadGraph(); return '<p class="nt-empty">Reading the notes\u2026</p>'; }
    if (!g.nodes || !g.nodes.length) return '<p class="nt-empty">No notes yet. What you write here can be recalled by you and by the crew.</p>';
    const list = (t, a) => a.length ? `<div class="nt-recent"><span class="label">${t}</span>${a.map(n => `<button class="nt-tag" data-nt-note="${esc(n.id)}" data-no-i18n>${esc(n.title)}${n.degree ? ` <small>${n.degree}</small>` : ''}</button>`).join('')}</div>` : '';
    const byTime = [...g.nodes].sort((a, b) => b.updated - a.updated), byLinks = [...g.nodes].filter(n => n.degree).sort((a, b) => b.degree - a.degree);
    const pinned = [...NT.pinned].map(id => g.nodes.find(n => n.id === id) || NT.notes.find(n => n.id === id)).filter(Boolean);
    const pinRow = n => `<div class="nt-pinrow"><button class="nt-tag" data-nt-note="${esc(n.id)}">${esc(n.title || n.id)}</button><button class="nt-b nt-unpin" data-i18n-own data-nt-unpin="${esc(n.id)}" data-i18n-own="${esc(n.title || n.id)}" aria-label="Unpin ${esc(n.title || n.id)}">Unpin</button></div>`;
    return (pinned.length ? `<div class="nt-recent"><span class="label">Pinned for recall</span>${pinned.map(pinRow).join('')}</div>` : '') + list('Recently changed', byTime.slice(0, 8)) + list('Most connected', byLinks.slice(0, 8)) + list('Not linked yet', g.nodes.filter(n => !n.degree).slice(0, 12));
  }
  const recallHtml = () => `<section class="nt-ed panel"><div class="nt-bar"><h3 class="nt-name">${uiText('Recall')}</h3><span class="label">Search only, nothing here changes your notes</span></div>
    <div class="nt-cutrow"><label class="label" for="nt-rq">Ask the notes</label><input id="nt-rq" class="og-input" type="search" placeholder="What do you want to remember?" value="${esc(NT.rq)}" autocomplete="off"></div>
    <div class="nt-lb" id="nt-rc">${recallBody()}</div></section>`;

  function notesView() {
    if (!NT.loaded && !NT.loading) { NT.loading = true; void refresh().then(() => { NT.loading = false; NT.loaded = true; if (onScreen()) { render(); if (!NT.map && graphSaved.selected) void open(graphSaved.selected); } }); }
    if (restoreScrollPending) requestAnimationFrame(restoreScroll);
    return `<div class="nx-view enter nt${NT.map && !NT.recall ? ' nt-mapmode' : ''}">${nsHead('Notes', 'Your notes are markdown files on this machine.', 'Tabularium')}
      <div class="nt-wrap${NT.mobile ? ' nt-open' : ''}${NT.focus ? ' nt-focus' : ''}">
        <aside class="nt-list panel">
          <input class="og-input" id="nt-q" type="search" placeholder="Search notes" aria-label="Search notes" value="${esc(NT.q)}" autocomplete="off">
          <button class="nt-b go" data-nt="new">${I('plus', 16)}<span>New note</span></button>
          <div class="nt-acts"><button class="nt-b" data-nt="map" aria-pressed="${NT.map}"><span>Map</span></button><button class="nt-b" data-nt="recall" aria-pressed="${NT.recall}"><span>Recall</span></button></div>
          <div class="nt-tags" id="nt-tags">${tagsHtml()}</div>
          ${NT.err && !NT.cur ? `<p class="nt-msg">${esc(NT.err)}</p>` : ''}
          <div class="nt-lb" id="nt-lb">${NT.loaded ? listHtml() : ARTSKEL(3, 'Loading notes')}</div>
        </aside>
        ${NT.recall ? recallHtml() : NT.map ? mapHtml() : editorHtml()}
      </div></div>`;
  }
  register({ id: 'notes', views: { Memory: notesView, Editor: notesView } });
  window.addEventListener('pagehide', stashScroll);

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-nt],[data-nt-note],[data-nt-tag],[data-nt-wiki],[data-nt-unpin]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const d = b.dataset;
    if (d.ntUnpin !== undefined) { NT.pinned.delete(d.ntUnpin); try { localStorage.setItem('caesaros-brain-pinned', JSON.stringify([...NT.pinned])); } catch {} return paintRecall(); }
    if (d.ntNote !== undefined) { NT.map = false; try { localStorage.setItem('caesaros-brain-map-open', '0'); } catch {} NT.recall = false; return void go(d.ntNote); }
    if (d.ntWiki !== undefined) { NT.map = false; try { localStorage.setItem('caesaros-brain-map-open', '0'); } catch {} NT.recall = false; return void go(d.ntWiki); }
    if (d.ntTag !== undefined) { NT.tag = NT.tag === d.ntTag ? '' : d.ntTag; NT.q = ''; const q = $('#nt-q'); if (q) q.value = ''; return void refresh(); }
    const a = d.nt;
    if (a === 'map') { NT.map = !NT.map; try { localStorage.setItem('caesaros-brain-map-open', NT.map ? '1' : '0'); } catch {} NT.recall = false; NT.graph = null; NT.mobile = NT.map; render(); }
    else if (a === 'recall') { NT.recall = !NT.recall; NT.map = false; NT.graph = null; NT.hits = null; NT.mobile = NT.recall; render(); }
    else if (a === 'demo') { NT.demo = true; render(); }
    else if (a === 'sample-info') { NT.sampleInfo = !NT.sampleInfo; render(); }
    else if (a === 'retry-map') { NT.graph = null; render(); }
    else if (a === 'fit') { const c = $('.nt-gc'); if (c && c.ntg) c.ntg.fit(); }
    else if (a === 'mvtree' || a === 'mvnet') { NT.mapView = a === 'mvtree' ? 'tree' : 'net'; render(); }
    else if (a === 'mapclose') { NT.map = false; try { localStorage.setItem('caesaros-brain-map-open', '0'); } catch {} NT.focus = false; NT.recall = false; NT.mobile = !!NT.cur; render(); }
    else if (a === 'focus') { NT.focus = !NT.focus; render(); }
    else if (a === 'pin') { if (NT.pinned.has(NT.cur)) NT.pinned.delete(NT.cur); else NT.pinned.add(NT.cur); try { localStorage.setItem('caesaros-brain-pinned', JSON.stringify([...NT.pinned])); } catch {} render(); }
    else if ((a === 'zin' || a === 'zout') && $('.nt-gc')) $('.nt-gc').ntg.zoom(a === 'zin' ? 1.4 : 1 / 1.4);
    else if (a === 'zin' || a === 'zout') { NT.zoom = Math.max(1, Math.min(4, NT.zoom + (a === 'zin' ? 0.5 : -0.5))); render(); }
    else if (a === 'new') { NT.map = false; NT.recall = false; go(NEW); }
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
    else if (e.target.id === 'nt-gq') { NT.gq = e.target.value; if (window.ntGraphData) window.ntGraphData.q = NT.gq; const c = $('.nt-gc'); if (c && c.ntg) c.ntg.redraw(); }
    else if (e.target.id === 'nt-rq') { NT.rq = e.target.value; clearTimeout(rt); rt = setTimeout(() => void recallSearch(), 250); }
    else if (e.target.id === 'nt-q') { NT.q = e.target.value; NT.tag = ''; clearTimeout(t); t = setTimeout(() => void refresh(), 250); } // list repaints in place, so focus and caret stay
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'nt-gq') { const c = $('.nt-gc'); if (c && c.ntg) c.ntg.focus(); return; }
    const nd = e.target.closest && e.target.closest('.nt-node'); if (nd && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nd.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || !onScreen() || !NT.cur) return;
    e.preventDefault(); if (NT.dirty && !NT.pending) void save();
  });
})();
