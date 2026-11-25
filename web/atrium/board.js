/* Board: the real tasks on /api/board, three lanes (To do, Doing, Done). A card is added, edited (title and
   note), moved by buttons or drag, and deleted with an undo. On a phone the lanes become tabs. Every control is a
   button with a name; nothing here invents a number. */
(() => {
  const B = { run: 0, drift: [], states: {}, tasks: null, at: 0, view: 'now', raw: {}, editing: null, drag: null, undo: null, err: '' };
  const J = { 'content-type': 'application/json' };
  const E = s => (typeof OGE === 'function' ? OGE(s) : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const STATE = { planned: 'Planned', started: 'Started', observed: 'Observed', verified: 'Verified', claimed: 'No evidence' };
  const LANES = [['todo', 'To do', 'Start'], ['doing', 'Doing', 'Finish'], ['done', 'Done', '']];
  // three readable views over the same lanes: Now is what moves, Plan is what is ahead, Done is what was finished (newest first)
  const VIEWS = [['now', 'Now', ['doing']], ['plan', 'Plan', ['todo', 'doing']], ['done', 'Done', ['done']]];
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
          <div class="bd-acts"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-bd="cancel">Cancel</button></div>
        </form>`
      : `<h4 class="bd-title" data-no-i18n>${name}</h4><span class="bd-state ${B.states[t.id] || 'planned'}">${STATE[B.states[t.id] || 'planned']}</span>${t.by ? `<span class="bd-by" data-no-i18n>by ${E(t.by)}</span>` : ''}${(() => { const s = bullets(t); return `<ul class="bd-sum">${s.list.map(x => `<li data-no-i18n>${E(x)}</li>`).join('')}</ul>${s.more ? `<button class="btn ghost bd-rawb" type="button" data-bd="raw" data-id="${E(t.id)}" aria-expanded="${!!B.raw[t.id]}">${B.raw[t.id] ? 'Hide full note' : 'Full note'}</button>${B.raw[t.id] ? `<p class="bd-note" data-no-i18n>${E(t.note)}</p>` : ''}` : ''}`; })()}<div class="bd-acts">${acts.join('')}</div>`;
    return `<article class="bd-card" data-id="${E(t.id)}" draggable="true">${body}</article>`;
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
    if (!B.tasks) { void load(); return `<div class="nx-view enter bd">${head('Board', 'Your tasks in three views, kept on this device.', 'Album')}<div class="og-wrap"><div class="og-card"><p>Loading from this device…</p></div></div></div>`; }
    // a card added from the home widget since this view was drawn is picked up here
    if (Date.now() - B.at > 10000) void load();
    const empty = B.tasks.length === 0;
    const vw = VIEWS.find(v => v[0] === B.view) || VIEWS[0];
    const tabs = empty ? '' : `<nav class="bd-tabs" aria-label="Views">${VIEWS.map(([k, n, ls]) => `<button class="btn ghost ${B.view === k ? 'on' : ''}" type="button" data-bd="view" data-id="${k}" aria-pressed="${B.view === k}">${n} <span class="bd-n">${B.tasks.filter(t => ls.includes(t.status)).length}</span></button>`).join('')}</nav>`;
    const lanes = empty
      ? `<div class="bd-empty"><p>Nothing on the board yet. Add your first card above and move it along as you work.</p><button class="btn" type="button" data-bd="focus">Add a card</button></div>`
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
        ${B.view === 'now' ? nowStrip() : ''}
        ${B.view === 'done' ? '' : driftHtml()}
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
    else if (k === 'view') { B.view = id; again(); }
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
