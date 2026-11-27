/* Notes save themselves a moment after typing stops, through the same revision-checked save as the Save button, so a
   note changed elsewhere still stops with its conflict choices. "Name from heading" renames the file after the first heading. */
(() => {
  const KEY = 'caesaros-notes-autosave', WAIT = 1200;

  /** The file name the first line offers, kept to what a note name allows; '' when the first line is not a heading. */
  function headingName(content) {
    const line = (String(content).split('\n').find(l => l.trim()) || ''), m = line.match(/^#{1,6}\s+(.+)/);
    if (!m) return '';
    return m[1].normalize('NFC').replace(/[^\p{L}\p{N} _.()-]+/gu, ' ').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 80).replace(/[ .]+$/, '');
  }
  const targetOf = (id, content) => { const name = headingName(content); if (!name) return ''; const to = id.split('/').slice(0, -1).concat(name).join('/'); return to === id ? '' : to; };
  window.xHeadingName = headingName;
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // test stubs

  let on = true; try { on = localStorage.getItem(KEY) !== '0'; } catch { /* private window */ }
  let timer = 0, say = '', sayFor = '';
  const $q = s => document.querySelector(s);
  const state = () => ($q('#nt-state') || {}).textContent || '';
  const later = () => { clearTimeout(timer); timer = setTimeout(flush, WAIT); };
  function flush() {
    clearTimeout(timer);
    if (!on || $q('.nt-conf')) return;                       // a conflict is the person's to settle
    const b = $q('.nt [data-nt="save"]'); if (!b) return;
    if (!b.disabled) b.click();
    else if (state() !== 'Saved') later();                   // a save is on its way; look again when it is done
  }

  async function rename(id) {
    const ed = $q('#nt-editor'); if (ed) ed.readOnly = true;   // nothing may be typed while the file changes its name
    const fail = text => { say = text; sayFor = id; if (ed) ed.readOnly = false; render(); };
    const b = $q('.nt [data-nt="save"]'); if (b && !b.disabled) b.click();
    for (let i = 0; i < 30 && state() !== 'Saved' && !$q('.nt-md'); i++) await new Promise(r => setTimeout(r, 100));
    if (state() !== 'Saved') return fail('Save the note first, then rename it.');
    try {
      const url = '/api/notes/' + encodeURIComponent(id);
      const cur = await fetch(url); if (!cur.ok) throw 0;
      const note = await cur.json(), to = targetOf(id, note.content); if (!to) return fail('The first line is not a heading that can name the file.');
      const r = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: to, content: note.content, rev: note.rev }) });
      if (!r.ok) return fail(r.status === 409 ? 'A note with that name already exists, or the note changed. Nothing was renamed.' : 'The note could not be renamed.');
      say = 'Renamed. Links that use the old name are not changed.'; sayFor = to;
      const open = Object.assign(document.createElement('button'), { hidden: true }); open.dataset.ntNote = to;   // Notes opens from any [data-nt-note] press
      document.body.appendChild(open); open.click(); open.remove();
      const q = $q('#nt-q'); if (q) q.dispatchEvent(new Event('input', { bubbles: true }));                      // and its list reads the new name
    } catch { fail('The core did not answer. Nothing was renamed.'); }
  }

  window.xAutosave = {
    controls(id, content) {
      const to = targetOf(id, content);
      return `<button type="button" class="nt-b" data-autosave="toggle" aria-pressed="${on}" title="Save by itself a moment after you stop typing"><span>Autosave ${on ? 'on' : 'off'}</span></button><button type="button" class="nt-b" data-autosave="rename" data-id="${esc(id)}" title="Rename the file after the first heading" ${to ? '' : 'hidden'}><span>Name from heading</span></button>${say && sayFor === id ? `<p class="nt-msg" role="status" style="flex:1 0 100%;order:9">${esc(say)}</p>` : ''}`;
    },
  };
  document.addEventListener('input', e => {
    if (!e.target || e.target.id !== 'nt-editor') return;
    const r = $q('[data-autosave="rename"]'); if (r) r.hidden = !targetOf(r.dataset.id, e.target.value);
    if (on) later();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-autosave]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.autosave === 'rename') return void rename(b.dataset.id);
    on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private window */ }
    render(); if (on) later();
  }, true);
  // leaving the page saves at once, before the editor is gone
  window.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-app],[data-ns],[data-tab]')) flush(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
})();
