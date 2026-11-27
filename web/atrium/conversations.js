/* Conversations: every chat in date groups, pinned ones first, filtered by words in the title or by who it is with.
   Pin, rename, archive and delete go through /api/chat/sessions; delete asks a second time. */
(() => {
  const NAME = 'Conversations';
  const L = { list: null, err: '', at: 0, busy: false, archived: false, q: '', who: '', edit: null, sure: null, msg: '' };
  const on = () => (S.tabs[S.act] || {}).id === NAME;
  const who = s => s.engine === 'hermes:caesar!alone' ? 'caesar-alone' : s.engine.startsWith('hermes:') ? s.engine.slice(7) : s.engine;
  const nameOf = s => (C[who(s)] || {}).n || who(s);
  const clock = t => new Date(t).toLocaleTimeString(uiLocale([]), { hour: '2-digit', minute: '2-digit' });

  /** Which group a conversation falls in, by the person's own calendar days. */
  function groupOf(s, now = Date.now()) {
    if (s.pinned) return 'Pinned';
    const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const days = Math.round((midnight(now) - midnight(s.updatedAt)) / 864e5);
    return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days <= 7 ? 'Previous 7 days' : days <= 30 ? 'Previous 30 days' : 'Older';
  }
  const GROUPS = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];
  window.xConvGroup = groupOf;

  async function load() {
    if (L.busy) return;
    L.busy = true; const archived = L.archived;
    try {
      const r = await fetch('/api/chat/sessions' + (archived ? '?archived=1' : '')); if (!r.ok) throw 0;
      const list = await r.json(); if (!Array.isArray(list)) throw 0;
      if (archived === L.archived) { L.list = list; L.err = ''; }
    } catch { L.err = 'The core did not answer. Nothing was changed.'; }
    L.busy = false; L.at = Date.now();
    if (archived !== L.archived) return void load();
    if (on()) paint();
  }
  // a redraw that keeps the caret in the search box and in the rename box
  function paint() {
    const a = document.activeElement, id = a && (a.id === 'gx-cq' || a.id === 'gx-ct') ? a.id : '', at = id ? a.selectionStart : 0;
    render();
    const el = id && document.getElementById(id); if (el) { el.focus(); el.setSelectionRange(at, at); }
  }

  const btn = (act, label, id = '', extra = '') => `<button type="button" class="btn ghost" data-cv="${act}" data-id="${esc(id)}" ${extra}>${label}</button>`;
  const icon = (act, ic, label, id, name, extra = '') => `<button type="button" class="gx-ico" data-i18n-own="${esc(name)}" data-cv="${act}" data-id="${esc(id)}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${I(ic, 18)}</button>`;
  function row(s) {
    const title = s.title || 'New conversation', t = `${nameOf(s)} · ${Date.now() - s.updatedAt < 864e5 ? clock(s.updatedAt) : new Date(s.updatedAt).toLocaleDateString(uiLocale())}`;
    if (L.edit === s.id) return `<li class="gx-row"><form class="gx-edit" data-cvform="${esc(s.id)}"><input id="gx-ct" class="og-input" maxlength="200" value="${esc(title)}" aria-label="New name"><button type="submit" class="btn">Save name</button>${btn('cancel', 'Cancel')}</form></li>`;
    const acts = L.sure === s.id
      ? `<span class="gx-sure" role="group" aria-label="Confirm delete"><b>Delete for good?</b>${btn('delgo', 'Delete', s.id)}${btn('cancel', 'Keep')}</span>`
      : `<span class="gx-acts">${L.archived ? '' : icon('pin', 'pin', (s.pinned ? 'Unpin ' : 'Pin ') + title, s.id, title, `aria-pressed="${s.pinned}"`)}${icon('rename', 'edit', 'Rename ' + title, s.id, title)}${icon('archive', L.archived ? 'refresh' : 'archive', (L.archived ? 'Restore ' : 'Archive ') + title, s.id, title)}${icon('del', 'delete', 'Delete ' + title, s.id, title)}</span>`;
    return `<li class="gx-row${s.pinned ? ' pinned' : ''}"><button type="button" class="gx-open" data-cv="open" data-id="${esc(s.id)}"><b data-no-i18n>${esc(title)}</b><small data-no-i18n>${esc(t)}</small></button>${acts}</li>`;
  }
  function listHtml() {
    const needle = L.q.trim().toLowerCase();
    const hits = L.list.filter(s => (!L.who || who(s) === L.who) && (!needle || (s.title || 'New conversation').toLowerCase().includes(needle)));
    if (!hits.length) return L.list.length ? vzEmpty('No conversation matches', 'Change the words or choose Everyone.') : vzEmpty(L.archived ? 'Nothing archived' : 'No conversations yet', L.archived ? 'Archived conversations wait here and can be restored.' : 'Start one from Chat. It is listed here by day.');
    return GROUPS.map(g => { const rows = hits.filter(s => groupOf(s) === g); return rows.length ? `<h3 class="gx-day">${g} <em>${rows.length}</em></h3><ul class="gx-list">${rows.map(row).join('')}</ul>` : ''; }).join('');
  }
  const shell = inner => `<div class="nx-view enter gx">${nsHead(NAME, 'Every conversation, by day. Pin the ones you keep coming back to.', 'Colloquia', 'chat')}<div class="og-wrap">${inner}</div></div>`;
  function view() {
    if (Date.now() - L.at > 5000) setTimeout(load, 0);
    if (!L.list) return shell(L.err ? `${ARTSTATE('error', 'Conversations could not be read', L.err)}<div class="og-row">${btn('retry', 'Try again')}</div>` : ARTSKEL(4, 'Reading your conversations'));
    const people = [...new Map(L.list.map(s => [who(s), nameOf(s)]))];
    const chip = (v, label) => `<button type="button" class="gx-chip${L.who === v ? ' on' : ''}" data-cv="who" data-id="${esc(v)}" aria-pressed="${L.who === v}"${v ? ' data-no-i18n' : ''}>${esc(label)}</button>`;
    return shell(`<div class="gx-bar"><input id="gx-cq" class="og-input" type="search" placeholder="Search titles" aria-label="Search conversation titles" value="${esc(L.q)}" autocomplete="off">
      <div class="gx-chips" role="group" aria-label="Which list">${[['', 'Active'], ['1', 'Archived']].map(([v, label]) => `<button type="button" class="gx-chip${!!v === L.archived ? ' on' : ''}" data-cv="tab" data-id="${v}" aria-pressed="${!!v === L.archived}">${label}</button>`).join('')}</div></div>
      ${people.length > 1 ? `<div class="gx-chips" role="group" aria-label="Who it is with">${chip('', 'Everyone')}${people.map(([v, n]) => chip(v, n)).join('')}</div>` : ''}
      ${L.msg ? `<p class="gx-warn" role="alert">${esc(L.msg)}</p>` : ''}${L.err ? `<p class="gx-warn" role="alert">The last check failed, so this list may be old.</p>` : ''}
      <div id="gx-cl">${listHtml()}</div>`);
  }

  // the shell's own lists follow: an archived or deleted chat leaves them and its tab closes
  function forget(id) {
    const i = THREADS.findIndex(t => t.id === id); if (i >= 0) THREADS.splice(i, 1);
    const cur = S.tabs[S.act]; S.tabs = S.tabs.filter(t => !(t.k === 'chat' && t.id === id)); S.act = Math.max(0, S.tabs.indexOf(cur));
    if (S.cur === id) S.cur = null;
  }
  async function send(id, method, body) {
    L.msg = '';
    try {
      const r = await fetch('/api/chat/sessions/' + encodeURIComponent(id), { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (r.ok) return true;
      L.msg = r.status === 409 ? 'That conversation is still answering. Try again when it is done.' : r.status === 403 ? 'Only the owner of this app can do this.' : 'The change was not saved.';
    } catch { L.msg = 'The core did not answer. Nothing was changed.'; }
    return false;
  }
  async function act(k, id) {
    const s = (L.list || []).find(x => x.id === id);
    if (k === 'open' && s) { if (!THR(id)) window.xAdopt(s); open_({ k: 'chat', id }); render(); return; }
    if (k === 'who') L.who = id;
    else if (k === 'tab') { L.archived = !!id; L.list = null; L.who = ''; L.edit = L.sure = null; void load(); }
    else if (k === 'retry') { L.err = ''; void load(); }
    else if (k === 'cancel') L.edit = L.sure = null;
    else if (k === 'rename') { L.edit = id; L.sure = null; paint(); const el = document.getElementById('gx-ct'); if (el) { el.focus(); el.select(); } return; }
    else if (k === 'del') { L.sure = id; L.edit = null; }
    else if (k === 'pin' && s) { if (await send(id, 'PATCH', { pinned: !s.pinned })) s.pinned = !s.pinned; }
    else if (k === 'archive' && s) { if (await send(id, 'PATCH', { archived: !L.archived })) { L.list = L.list.filter(x => x !== s); if (L.archived) window.xAdopt({ ...s, archived: false }); else forget(id); } }
    else if (k === 'delgo') { L.sure = null; if (await send(id, 'DELETE')) { L.list = L.list.filter(x => x.id !== id); forget(id); } }
    paint();
  }

  register({ id: 'conversations', views: { [NAME]: view } });
  APPS.Talk.push([NAME, 'Colloquia', 'chat']);
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('[data-cv]'); if (!t) return; e.preventDefault(); e.stopPropagation(); void act(t.dataset.cv, t.dataset.id || ''); }, true);
  document.addEventListener('submit', async e => {
    const f = e.target.closest && e.target.closest('[data-cvform]'); if (!f) return;
    e.preventDefault();
    const id = f.dataset.cvform, title = f.querySelector('input').value.trim(); if (!title) return;
    if (await send(id, 'PATCH', { title })) { const s = L.list.find(x => x.id === id); if (s) s.title = title; const t = THR(id); if (t) t.t = title; L.edit = null; }
    paint();
  }, true);
  document.addEventListener('input', e => { if (e.target && e.target.id === 'gx-cq') { L.q = e.target.value; const el = document.getElementById('gx-cl'); if (el && L.list) el.innerHTML = listHtml(); } });
})();
