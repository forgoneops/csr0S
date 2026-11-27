/* How full a conversation is, above the message box: an estimate against what the model can hold, and "Summarise
   older messages" (core/chat-context.ts). Nothing is deleted; "Send everything again" drops the summary. */
(() => {
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // the registry test's stub
  const M = { id: null, d: null, err: '', open: false, busy: false, note: '', at: 0, key: '', loading: false };
  const k = n => n < 1000 ? String(n) : (n < 10000 ? (n / 1000).toFixed(1) : Math.round(n / 1000)) + 'k';
  const WHY = { 'too-short': 'There is not enough older text to summarise yet.', busy: 'Wait for the answer in progress.', 'no-summary': 'The engine gave no summary. Nothing was changed.', 'engine-unavailable': 'The engine for this conversation is not available.', operator_only: 'Only the owner of this app can do this.' };
  const model = id => (S.perThread && S.perThread[id]) || '';

  async function load(id) {
    if (M.loading) return;
    M.loading = true;
    let d = null, err = '';
    try { const r = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}/context?model=${encodeURIComponent(model(id))}`); if (!r.ok) throw 0; d = await r.json(); } catch { err = 'The size could not be read.'; }
    M.loading = false; M.at = Date.now();
    if (M.id !== id) return;
    const changed = JSON.stringify([d, err]) !== JSON.stringify([M.d, M.err]);
    M.d = d; M.err = err; if (changed) render();
  }
  async function act(path, method) {
    const id = M.id; if (!id || M.busy) return;
    M.busy = true; M.note = ''; render();
    try {
      const r = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}/${path}`, { method });
      const body = await r.json().catch(() => ({}));
      if (M.id === id) { if (r.ok) M.d = body; else M.note = WHY[body.error] || body.message || 'That did not work. Nothing was changed.'; }
    } catch { M.note = 'The core did not answer. Nothing was changed.'; }
    M.busy = false; render();
  }

  // the window to compare with: what the model file sets, else the most the model can hold
  const limit = w => w && (w.set || w.max);
  // "Chat size", not "Context": the chip beside it that adds the person's notes already has that name
  function label() { const d = M.d; return !d ? 'Chat size' : `Chat size ${limit(d.window) ? Math.min(999, Math.round(d.tokens / limit(d.window) * 100)) + '%' : '≈' + k(d.tokens)}`; }
  function panel() {
    const d = M.d;
    if (!d) return `<div class="gx gx-meter" role="group" aria-label="Conversation size"><p role="status">${esc(M.err || 'Reading the size…')}</p></div>`;
    const w = d.window, pct = limit(w) ? Math.min(100, d.tokens / limit(w) * 100) : 0;
    const room = !w ? 'This engine does not say how much it can hold.' : w.set ? `The model is set to hold ${k(w.set)}.` : `The model can hold up to ${k(w.max)}. Ollama may load it with less.`;
    return `<div class="gx gx-meter" role="group" aria-label="Conversation size"><p><span>About ${k(d.tokens)} tokens of this conversation go with your next message.</span> <span>Messages: ${d.messages}</span>${d.summary ? ' <span>(plus a summary)</span>' : ''} <span>${esc(room)}</span></p>
      ${limit(w) ? vzSeg(pct, pct > 80 ? 'd' : 's', 20) : ''}
      ${d.summary ? `<p>${d.summary.covers} older messages are sent as this summary. They are all still here.</p><pre tabindex="0" data-no-i18n>${esc(d.summary.text)}</pre>` : ''}
      <div class="og-row"><button type="button" class="btn" data-meter="compact" ${d.canCompact && !M.busy ? '' : 'disabled'}>${M.busy ? 'Working…' : 'Summarise older messages'}</button>${d.summary ? `<button type="button" class="btn ghost" data-meter="drop" ${M.busy ? 'disabled' : ''}>Send everything again</button>` : ''}</div>
      ${d.canCompact || d.summary ? '' : '<p class="gx-mut">There is not enough older text to summarise yet.</p>'}
      ${M.note ? `<p class="gx-warn" role="alert">${esc(M.note)}</p>` : ''}</div>`;
  }

  const _chatView = chatView;
  chatView = function (id) {
    const v = _chatView(id); if (!THR(id)) return v;
    if (M.id !== id) Object.assign(M, { id, d: null, err: '', open: false, note: '', at: 0, key: '' });
    const key = `${(MSG[id] || []).length}:${model(id)}:${(THR(id) || {}).s}`;
    if (key !== M.key || Date.now() - M.at > 30000) { M.key = key; setTimeout(() => load(id), 0); }
    return v.replace('</div><div class="nx-box">', () => `<button type="button" class="pk-ctx${M.open ? ' on' : ''}" data-meter="toggle" aria-expanded="${M.open}" title="How much of this conversation goes to the model">${I('usage', 16)}<span>${label()}</span></button>${M.open ? panel() : ''}</div><div class="nx-box">`);
  };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-meter]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.meter === 'toggle') { M.open = !M.open; M.note = ''; if (M.open) void load(M.id); render(); }
    else if (b.dataset.meter === 'compact') void act('compact', 'POST');
    else void act('summary', 'DELETE');
  }, true);
})();
