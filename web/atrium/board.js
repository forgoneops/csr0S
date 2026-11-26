/* Board: the real tasks on /api/board, three lanes (To do, Doing, Done). A card is added, edited (title and
   note), moved by buttons or drag, and deleted with an undo. On a phone the lanes become tabs. Every control is a
   button with a name; nothing here invents a number. */
(() => {
  const B = { run: 0, drift: [], states: {}, tasks: null, at: 0, view: 'now', raw: {}, editing: null, drag: null, undo: null, err: '', wall: { z: 1, x: 0, y: 0 } };
  // Priority, reminder and whiteboard place of a card live on this device only (the server card has no such fields): shortcut, move to the card record when the API grows them.
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const META = lsGet('bd-meta', {});
  const meta = id => META[id] || (META[id] = {});
  const saveMeta = () => lsSet('bd-meta', META);
  B.view = lsGet('bd-view', 'now'); Object.assign(B.wall, lsGet('bd-wall', {}));
  const PRIO = { high: ['High', 'var(--tint-magenta,#ff38b8)'], mid: ['Medium', 'var(--gold,#f2c46b)'], low: ['Low', 'var(--p2,#33e8ff)'] };
  const REM = [['Tonight', () => { const d = new Date(); d.setHours(20, 0, 0, 0); if (d < Date.now()) d.setDate(d.getDate() + 1); return +d; }], ['Tomorrow', () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return +d; }], ['In a week', () => Date.now() + 7 * 864e5]];
  const remText = r => { const m = r - Date.now(); return m <= 0 ? 'Due now' : m < 36e5 ? `Due in ${Math.ceil(m / 6e4)} min` : m < 864e5 ? `Due in ${Math.round(m / 36e5)} h` : `Due ${new Date(r).toLocaleDateString([], { day: 'numeric', month: 'short' })}`; };
  const chips = t => { const m = META[t.id] || {}, o = []; if (m.p) o.push(`<span class="bd-chip" style="--c:${PRIO[m.p][1]}">${PRIO[m.p][0]}</span>`); if (m.r && t.status !== 'done') o.push(`<span class="bd-chip rem${m.r <= Date.now() ? ' due' : ''}">${remText(m.r)}</span>`); return o.join(''); };
  const colour = id => (META[id] && META[id].p ? PRIO[META[id].p][1] : noteColour(id));
  const J = { 'content-type': 'application/json' };
  const E = s => (typeof OGE === 'function' ? OGE(s) : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const STATE = { planned: 'Planned', started: 'Started', observed: 'Observed', verified: 'Verified', claimed: 'No evidence' };
  /* Sticky-note colours, as in the old board: a card's colour is stable for its whole life, picked from its id. */
  // Colours come from the theme's own tokens, never fixed hex: a note stays inside the system palette when the theme changes.
  const NOTE_C = [
    'color-mix(in srgb, var(--accent) 92%, #6b4a2a 8%)',
    'color-mix(in srgb, var(--accent) 74%, var(--warn,#c98a2b) 26%)',
    'color-mix(in srgb, var(--accent) 64%, #8b6b4a 36%)',
    'color-mix(in srgb, var(--accent) 84%, var(--signal,#79c1c1) 16%)',
    'color-mix(in srgb, var(--warn,#c98a2b) 78%, var(--accent) 22%)',
    'color-mix(in srgb, var(--accent) 58%, var(--warn,#c98a2b) 42%)',
  ];
  const noteColour = id => NOTE_C[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % NOTE_C.length];
  const LANES = [['todo', 'To do', 'Start'], ['doing', 'Doing', 'Finish'], ['done', 'Done', '']];
  // three readable views over the same lanes: Now is what moves, Plan is what is ahead, Done is what was finished (newest first)
  const VIEWS = [['now', 'Now', ['doing']], ['wall', 'Whiteboard', ['todo', 'doing']], ['plan', 'Plan', ['todo', 'doing']], ['done', 'Done', ['done']]];
  const again = () => render();
  const head = (n, s, l) => (typeof ogHead === 'function' ? ogHead(n, s, l) : `<h2>${E(n)}</h2>`);
  const go = async (u, m, b) => { try { const r = await fetch(u, m ? { method: m, headers: J, body: JSON.stringify(b || {}) } : undefined); if (r.status === 401) location.href = '/login'; return r; } catch { return null; } };
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };

  async function load() {
    const r = await go('/api/board');
    if (r && r.ok) { B.tasks = await r.json(); B.err = ''; }
    else if (!B.tasks) { B.tasks = []; B.err = 'The board could not be read from this device.'; }
    const rn = await go('/api/running'); if (rn && rn.ok) B.run = (await rn.json()).count || 0;
    const d = await go('/api/board/drift'); if (d && d.ok) { const j = await d.json(); B.drift = j.drift || []; B.states = j.states || {}; }
    B.at = Date.now(); again();
  }
  async function fix(kind, id) {
    const r = await go('/api/board/drift/fix', 'POST', { kind, taskId: id || '' });
    B.err = r && r.ok ? '' : 'That could not be fixed.'; await load();
  }
  async function add() {
    const title = val('bd-title').trim();
    if (!title) { B.err = 'Write a title first.'; again(); return; }
    const r = await go('/api/board', 'POST', { title });
    B.err = r && r.ok ? '' : 'That card was not saved.';
    await load();
  }
  async function save(id) {
    const title = val('bd-edit-title').trim();
    if (!title) { B.err = 'A card needs a title.'; again(); return; }
    const r = await go('/api/board/' + encodeURIComponent(id), 'PUT', { title, note: val('bd-edit-note'), evidence: val('bd-edit-ev') });
    B.err = r && r.ok ? '' : 'That card was not saved.';
    B.editing = null; await load();
  }
  async function move(id, to) {
    B.editing = null;
    const r = await go('/api/board/' + encodeURIComponent(id), 'PUT', { status: to });
    B.err = r && r.ok ? '' : 'That card was not moved.';
    await load();
  }
  async function del(id) {
    const t = (B.tasks || []).find(x => x.id === id);
    const r = await go('/api/board/' + encodeURIComponent(id), 'DELETE');
    if (r && r.ok) { if (t) B.undo = { title: t.title, note: t.note, status: t.status }; B.err = ''; }
    else B.err = 'That card was not deleted.';
    await load();
  }
  async function undo() {
    const u = B.undo; if (!u) return;
    B.undo = null;
    const r = await go('/api/board', 'POST', u);
    B.err = r && r.ok ? '' : 'The card could not be put back.';
    await load();
  }

  /** Five bullets or fewer, built only from fields the card holds, so a summary cannot claim more than the record says. The full note is one tap deeper. */
  const DAYS = ms => Math.max(0, Math.floor((Date.now() - ms) / 864e5));
  function bullets(t) {
    const b = [], brief = {};
    for (const l of String(t.note || '').split('\n')) { const m = l.match(/^(TASK|DELIVERABLE|SCOPE|VERIFY|STOP WHEN): (.*)$/); if (m) brief[m[1]] = m[2]; }
    const st = B.states[t.id] || 'planned';
    b.push(st === 'planned' ? (DAYS(t.created) ? `Not started, ${DAYS(t.created)} d on the board.` : 'Not started, added today.') : st === 'started' ? `In progress, last change ${DAYS(t.updated)} d ago.` : st === 'verified' ? 'Done and checked.' : st === 'observed' ? 'Done, seen working.' : 'Marked done, but nothing shows it was checked.');
    if (t.after) b.push(`Waits for: ${t.after.split(',').map(i => ((B.tasks || []).find(x => x.id === i) || {}).title || 'a removed card').join(', ')}.`);
    if (brief.DELIVERABLE) b.push(`Delivers: ${brief.DELIVERABLE}`);
    if (brief.VERIFY) b.push(`Checked by: ${brief.VERIFY}`);
    if (t.evidence) b.push(`Evidence: ${t.evidence}`);
    return { list: b.slice(0, 5), more: !!brief.TASK || String(t.note || '').length > 0 };
  }
  // keep what was typed in the edit form while a priority or reminder button redraws it
  function stash(id) { const t = (B.tasks || []).find(x => x.id === id); if (!t) return; t.title = val('bd-edit-title') || t.title; t.note = val('bd-edit-note'); t.evidence = val('bd-edit-ev'); }
  const saveWall = () => lsSet('bd-wall', B.wall);
  const applyWall = () => { const p = document.querySelector('.bd-plane'); if (p) p.style.transform = `translate(${B.wall.x}px,${B.wall.y}px) scale(${B.wall.z})`; };
  function zoom(d, cx, cy) {
    const w = B.wall, z = Math.min(2.5, Math.max(.4, w.z * d)), k = z / w.z, v = document.querySelector('.bd-wall'), r = v ? v.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const px = cx === undefined ? r.width / 2 : cx - r.left, py = cy === undefined ? r.height / 2 : cy - r.top;
    w.x = px - (px - w.x) * k; w.y = py - (py - w.y) * k; w.z = z; saveWall(); applyWall();
  }
  /** A free board: every open card is a sticky on a plane you pan and zoom. Mouse, touch and pinch use the same pointer events; the buttons cover zoom without a wheel. */
  function wall() {
    const open = (B.tasks || []).filter(t => t.status !== 'done');
    const notes = open.map((t, i) => { const m = META[t.id] || {}, x = m.x ?? 24 + (i % 4) * 236, y = m.y ?? 24 + Math.floor(i / 4) * 190;
      return `<article class="bd-sticky" data-id="${E(t.id)}" style="--nc:${colour(t.id)};left:${x}px;top:${y}px"><i class="bd-band" aria-hidden="true"></i><h4 class="bd-title" data-no-i18n>${E(t.title)}</h4><div>${chips(t)}</div><button class="btn ghost" type="button" data-bd="open" data-id="${E(t.id)}" aria-label="Open ${E(t.title)}">Open</button></article>`; }).join('');
    return `<div class="bd-wallbar" role="group" aria-label="Whiteboard view"><button class="btn ghost" type="button" data-bd="zoom" data-v="1.25" aria-label="Zoom in">+</button><button class="btn ghost" type="button" data-bd="zoom" data-v="0.8" aria-label="Zoom out">-</button><button class="btn ghost" type="button" data-bd="fit">Reset view</button><span class="bd-hint">Drag a note to place it, drag the board to pan, pinch or scroll to zoom.</span></div>
      <div class="bd-wall" tabindex="0" aria-label="Whiteboard"><div class="bd-plane" style="transform:translate(${B.wall.x}px,${B.wall.y}px) scale(${B.wall.z})">${notes || '<p class="bd-lane-empty">No open cards. Add one above.</p>'}</div></div>`;
  }
  const pts = new Map();
  let gest = null;
  document.addEventListener('pointerdown', e => {
    const v = e.target.closest && e.target.closest('.bd-wall'); if (!v || e.target.closest('button')) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]); try { v.setPointerCapture(e.pointerId); } catch {}
    const n = e.target.closest('.bd-sticky');
    if (pts.size === 2) { const [a, b] = [...pts.values()]; gest = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), z: B.wall.z }; return; }
    gest = n ? { n, sx: e.clientX, sy: e.clientY, ox: n.offsetLeft, oy: n.offsetTop } : { sx: e.clientX, sy: e.clientY, ox: B.wall.x, oy: B.wall.y };
    if (n) n.classList.add('lift');
  });
  document.addEventListener('pointermove', e => {
    if (!gest || !pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (gest.pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom(gest.z * d / gest.pinch / B.wall.z, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return; }
    if (gest.pinch) return;
    const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
    if (gest.n) { gest.n.style.left = gest.ox + dx / B.wall.z + 'px'; gest.n.style.top = gest.oy + dy / B.wall.z + 'px'; }
    else { B.wall.x = gest.ox + dx; B.wall.y = gest.oy + dy; applyWall(); }
  });
  const endG = e => {
    if (!pts.delete(e.pointerId)) return;
    if (gest && gest.n) { gest.n.classList.remove('lift'); const m = meta(gest.n.dataset.id); m.x = Math.round(gest.n.offsetLeft); m.y = Math.round(gest.n.offsetTop); saveMeta(); }
    else saveWall();
    if (!pts.size) gest = null;
  };
  document.addEventListener('pointerup', endG); document.addEventListener('pointercancel', endG);
  document.addEventListener('wheel', e => { if (e.target.closest && e.target.closest('.bd-wall')) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); } }, { passive: false });

  function card(t, ci) {
    const name = E(t.title);
    const acts = [];
    if (ci > 0) acts.push(`<button class="btn ghost" data-bd="move" data-id="${E(t.id)}" data-to="${LANES[ci - 1][0]}" aria-label="Move ${name} to ${LANES[ci - 1][1]}">Back</button>`);
    if (ci < 2) acts.push(`<button class="btn ghost" data-bd="move" data-id="${E(t.id)}" data-to="${LANES[ci + 1][0]}" aria-label="Move ${name} to ${LANES[ci + 1][1]}">${LANES[ci][2]}</button>`);
    acts.push(`<button class="btn ghost" data-bd="edit" data-id="${E(t.id)}" aria-label="Edit ${name}">Edit</button>`);
    acts.push(`<button class="btn ghost" data-bd="del" data-id="${E(t.id)}" aria-label="Delete ${name}">Delete</button>`);
    const body = B.editing === t.id
      ? `<form class="bd-edit" data-form="edit" data-id="${E(t.id)}">
          <input class="og-input bd-in" id="bd-edit-title" maxlength="200" value="${name}" aria-label="Card title">
          <textarea class="og-input bd-in" id="bd-edit-note" rows="3" maxlength="4000" placeholder="Add a note" aria-label="Card note">${E(t.note)}</textarea>
          <input class="og-input bd-in" id="bd-edit-ev" maxlength="1000" value="${E(t.evidence || '')}" placeholder="Evidence: what shows it works" aria-label="Evidence">
          <div class="bd-pr" role="group" aria-label="Priority">${Object.entries(PRIO).map(([k, [n, c]]) => `<button class="btn ghost${(META[t.id] || {}).p === k ? ' on' : ''}" type="button" data-bd="prio" data-id="${t.id}" data-v="${k}" style="--c:${c}" aria-pressed="${(META[t.id] || {}).p === k}">${n}</button>`).join('')}</div>
          <div class="bd-pr" role="group" aria-label="Reminder">${REM.map(([n], i) => `<button class="btn ghost" type="button" data-bd="rem" data-id="${t.id}" data-v="${i}">${n}</button>`).join('')}<button class="btn ghost" type="button" data-bd="rem" data-id="${t.id}" data-v="-1">No reminder</button>${(META[t.id] || {}).r ? `<span class="bd-chip rem">${remText(META[t.id].r)}</span>` : ''}</div>
          <div class="bd-acts"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-bd="cancel">Cancel</button></div>
        </form>`
      : `<h4 class="bd-title" data-no-i18n>${name}</h4>${chips(t)}<span class="bd-state ${B.states[t.id] || 'planned'}">${STATE[B.states[t.id] || 'planned']}</span>${t.by ? `<span class="bd-by" data-no-i18n>by ${E(t.by)}</span>` : ''}${(() => { const s = bullets(t); return `<ul class="bd-sum">${s.list.map(x => `<li data-no-i18n>${E(x)}</li>`).join('')}</ul>${s.more ? `<button class="btn ghost bd-rawb" type="button" data-bd="raw" data-id="${E(t.id)}" aria-expanded="${!!B.raw[t.id]}">${B.raw[t.id] ? 'Hide full note' : 'Full note'}</button>${B.raw[t.id] ? `<p class="bd-note" data-no-i18n>${E(t.note)}</p>` : ''}` : ''}`; })()}<div class="bd-acts">${acts.join('')}</div>`;
    return `<article class="bd-card" data-id="${E(t.id)}" draggable="true" style="--nc:${colour(t.id)}"><i class="bd-band" aria-hidden="true"></i><i class="bd-pin" aria-hidden="true"></i>${body}</article>`;
  }

  /** Where the plan and reality have come apart, one bullet each with a one-tap fix. */
  // the card title is the person's own text: it sits in its own element, marked data-no-i18n, so it is never sent to the translator
  const qt = t => `\u201c<span data-no-i18n>${E(t)}</span>`;
  const driftText = d => d.kind === 'no-evidence' ? `${qt(d.title)}\u201d is done, but nothing shows it was checked.`
    : d.kind === 'stale' ? `${qt(d.title)}\u201d has been in Doing for ${d.days} days without a change.`
    : d.kind === 'unpicked' ? `${qt(d.title)}\u201d has waited ${d.days} days and nobody picked it up.`
    : d.kind === 'duplicate' ? `${qt(d.title)}\u201d is on the board twice.` : E(d.text);
  /** Now: what is moving this minute and what waits for a decision, in one line, before the lanes. */
  function nowStrip() {
    if (!B.tasks || !B.tasks.length) return '';
    const doing = B.tasks.filter(t => t.status === 'doing').length, wait = (window.S && S.waiting ? S.waiting.length : 0);
    return `<p class="bd-now" role="status"><span><b>${doing}</b> in Doing</span><span><b>${B.run}</b> ${B.run === 1 ? 'turn' : 'turns'} running</span><span><b>${wait}</b> waiting for your yes</span></p>`;
  }
  function driftHtml() {
    if (!B.tasks || !B.tasks.length) return '';
    if (!B.drift.length) return '<p class="bd-sync" role="status">The plan and what you see agree.</p>';
    return `<section class="bd-drift" aria-label="Drift"><h3 class="bd-lane-h">Drift <span class="bd-n">${B.drift.length}</span></h3><ul>${B.drift.map(d => `<li><span>${driftText(d)}</span><button class="btn ghost" type="button" data-bd="fix" data-kind="${E(d.kind)}" data-id="${E(d.taskId || '')}">${E(d.fix.label)}</button></li>`).join('')}</ul></section>`;
  }

  function view() {
    if (!B.tasks) { void load(); return `<div class="nx-view enter bd">${head('Board', 'Your tasks in three views, kept on this device.', 'Album')}<div class="og-wrap">${ARTSKEL(3, 'Loading')}</div></div>`; }
    // a card added from the home widget since this view was drawn is picked up here
    if (Date.now() - B.at > 10000) void load();
    const empty = B.tasks.length === 0;
    const vw = VIEWS.find(v => v[0] === B.view) || VIEWS[0];
    const tabs = empty ? '' : `<nav class="bd-tabs" aria-label="Views">${VIEWS.map(([k, n, ls]) => `<button class="btn ghost ${B.view === k ? 'on' : ''}" type="button" data-bd="view" data-id="${k}" aria-pressed="${B.view === k}">${n} <span class="bd-n">${B.tasks.filter(t => ls.includes(t.status)).length}</span></button>`).join('')}</nav>`;
    const lanes = B.view === 'wall' && !empty ? wall() : empty
      ? `<div class="bd-empty" style="border:0;padding:0">${window.xKeeper ? window.xKeeper('board', '', 'Add your first card above and move it along as you work.') : '<p>Nothing on the board yet. Add your first card above and move it along as you work.</p>'}<button class="btn" type="button" data-bd="focus">Add a card</button></div>`
      : `<div class="bd-lanes" style="--bd-cols:${vw[2].length}">${LANES.map(([k, n], ci) => {
          if (!vw[2].includes(k)) return '';
          const items = B.tasks.filter(t => t.status === k);
          if (k === 'done') items.sort((a, b) => b.updated - a.updated);
          return `<section class="bd-lane" data-lane="${k}" aria-label="${n}">
            <h3 class="bd-lane-h">${n}</h3>
            ${items.length ? items.map(t => card(t, ci)).join('') : `<p class="bd-lane-empty">${k === 'doing' ? 'Nothing is moving right now.' : k === 'done' ? 'Nothing finished yet.' : 'Nothing planned.'}</p>`}
          </section>`;
        }).join('')}</div>`;
    return `<div class="nx-view enter bd">
      ${head('Board', 'Your tasks in three views, kept on this device.', 'Album')}
      <div class="og-wrap">
        <form class="bd-add" data-form="add"><input class="og-input bd-in" id="bd-title" maxlength="200" placeholder="What needs doing?" aria-label="Title of the new card"><button class="btn" type="submit">Add card</button></form>
        ${B.err ? `<p class="bd-err" role="alert">${E(B.err)}</p>` : ''}
        ${B.undo ? `<div class="bd-undo" role="status"><span>Card deleted: ${E(B.undo.title)}</span><button class="btn ghost" type="button" data-bd="undo">Undo</button></div>` : ''}
        ${tabs}
        ${(() => { const d = (B.tasks || []).filter(t => t.status !== 'done' && (META[t.id] || {}).r && META[t.id].r <= Date.now()); return d.length ? `<p class="bd-due" role="status"><b>${d.length}</b> ${d.length === 1 ? 'reminder is' : 'reminders are'} due: ${d.map(t => E(t.title)).join(', ')}</p>` : ''; })()}
        ${B.view === 'now' ? nowStrip() : ''}
        ${B.view === 'done' || B.view === 'wall' ? '' : driftHtml()}
        ${lanes}
      </div></div>`;
  }

  document.addEventListener('submit', e => {
    const f = e.target;
    if (!f || !f.dataset || !f.dataset.form) return;
    e.preventDefault();
    if (f.dataset.form === 'add') void add();
    else if (f.dataset.form === 'edit') void save(f.dataset.id);
  });
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-bd]');
    if (!t) return;
    const k = t.dataset.bd, id = t.dataset.id;
    if (k === 'focus') { const i = document.getElementById('bd-title'); if (i) i.focus(); }
    else if (k === 'raw') { B.raw[id] = !B.raw[id]; again(); }
    else if (k === 'view') { B.view = id; lsSet('bd-view', id); again(); }
    else if (k === 'prio') { stash(id); const m = meta(id); m.p = m.p === t.dataset.v ? undefined : t.dataset.v; saveMeta(); again(); }
    else if (k === 'rem') { stash(id); const m = meta(id), i = +t.dataset.v; m.r = i < 0 ? undefined : REM[i][1](); saveMeta(); again(); }
    else if (k === 'zoom') zoom(+t.dataset.v);
    else if (k === 'fit') { B.wall.z = 1; B.wall.x = 0; B.wall.y = 0; saveWall(); applyWall(); }
    else if (k === 'open') { B.view = 'plan'; lsSet('bd-view', 'plan'); B.editing = id; again(); }
    else if (k === 'edit') { B.editing = id; B.err = ''; again(); }
    else if (k === 'cancel') { B.editing = null; again(); }
    else if (k === 'move') void move(id, t.dataset.to);
    else if (k === 'del') void del(id);
    else if (k === 'undo') void undo();
    else if (k === 'fix') void fix(t.dataset.kind, id);
  });
  // drag between lanes where a pointer is used; the buttons stay the only way on a phone
  document.addEventListener('dragstart', e => {
    const c = e.target.closest && e.target.closest('.bd-card');
    if (!c || e.target.closest('button')) return;
    B.drag = c.dataset.id;
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', B.drag); }
  });
  document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('.bd-lane')) e.preventDefault(); });
  document.addEventListener('drop', e => {
    const l = e.target.closest && e.target.closest('.bd-lane');
    if (!l) return;
    e.preventDefault();
    const id = B.drag || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
    B.drag = null;
    if (id && id !== '-') void move(id, l.dataset.lane);
  });

  register({ id: 'board', views: { Board: view }, owns: ['Board'] });
})();
