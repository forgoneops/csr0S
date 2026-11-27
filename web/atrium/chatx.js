/* Keep a conversation: "Save to Notes" and "Download .md" above the message box. The markdown and the note's
   name come from the core (core/chat-export.ts); this file only asks and says what happened. */
(() => {
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // the registry test's stub
  const X = { id: null, open: false, busy: '', text: '', bad: false, note: '' };
  const WHY = {
    empty: 'Nothing to save yet. Send a message first.',
    too_large: 'This conversation is too long for one note. Use Download .md instead.',
    too_many: 'Notes is full, so no new note was made. Use Download .md instead.',
    not_found: 'This conversation no longer exists.',
    operator_only: 'Only the owner of this app can do this.',
  };
  const btn = (act, icon, label, off) => `<button type="button" class="pk-ctx" data-xp="${act}"${off ? ' disabled' : ''}>${I(icon, 16)}<span>${label}</span></button>`;
  function panel(id) {
    const empty = !!MSG[id] && !MSG[id].some((m) => m.x || (m.files && m.files.length));
    const text = X.text || (empty ? WHY.empty : '');
    return `<div class="xp" role="group" aria-label="Export conversation">${btn('note', 'brain', X.busy === 'note' ? 'Saving…' : 'Save to Notes', empty || X.busy)}${btn('md', 'download', X.busy === 'md' ? 'Preparing…' : 'Download .md', empty || X.busy)}
      <p class="xp-line${X.bad ? ' bad' : ''}" role="${X.bad ? 'alert' : 'status'}">${esc(text)}</p>${X.note && ogEnabled('Memory') ? btn('open', 'arrow', 'Open note') : ''}</div>`;
  }
  const _chatView = chatView;
  chatView = function (id) {
    const v = _chatView(id); if (!THR(id)) return v;
    const on = X.open && X.id === id;
    return v.replace('</div><div class="nx-box">', () => `<button type="button" class="pk-ctx${on ? ' on' : ''}" data-xp="toggle" aria-expanded="${on}">${I('upload', 16)}<span>Export</span></button>${on ? panel(id) : ''}</div><div class="nx-box">`);
  };

  async function run(act) {
    const id = X.id; if (!id || X.busy) return;
    Object.assign(X, { busy: act, text: '', bad: false, note: '' }); render();
    let out = { text: 'The app could not be reached. Nothing was saved.', bad: true, note: '' };
    try {
      const r = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}/export/${act === 'note' ? 'note' : 'markdown'}`, { method: act === 'note' ? 'POST' : 'GET' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !(act === 'note' ? d.id : d.markdown)) out.text = WHY[d.error] || (act === 'note' ? 'The note could not be saved.' : 'The file could not be made.');
      else if (act === 'note') out = { text: `Saved as ${d.id}`, bad: false, note: d.id };
      else {
        const url = URL.createObjectURL(new Blob([d.markdown], { type: 'text/markdown;charset=utf-8' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: d.filename });
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        out = { text: `Download started: ${d.filename}`, bad: false, note: '' };
      }
    } catch { /* the line above says it */ }
    if (X.id !== id) { X.busy = ''; return; }
    Object.assign(X, out, { busy: '' }); render();
  }

  // Notes opens a note from any [data-nt-note] press; typing into its search box makes its list read the new file.
  function openNote(note) {
    open_({ k: 'app', id: 'Memory' }); render();
    const b = Object.assign(document.createElement('button'), { hidden: true }); b.dataset.ntNote = note;
    document.body.appendChild(b); b.click(); b.remove();
    const q = document.getElementById('nt-q'); if (q) q.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-xp]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const act = b.dataset.xp;
    if (act === 'toggle') {
      const open = !(X.open && X.id === S.cur);
      if (X.id !== S.cur) Object.assign(X, { id: S.cur, text: '', bad: false, note: '' });
      X.open = open; render();
    } else if (act === 'open') openNote(X.note);
    else void run(act);
  }, true);
})();
