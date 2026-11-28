/* In-app dialogs: one component for every question the app asks, so none of them is a browser box.
   askText(title, value, opts) -> Promise<string|null>; askConfirm(text, opts) -> Promise<boolean>.
   A native <dialog> gives the focus trap and the page behind goes inert; Esc is its own cancel, Enter submits the form. */
(() => {
  if (typeof document === 'undefined' || !document.body) return;
  function ask(title, body, { field = false, value = '', ok = 'OK', danger = false, info = false } = {}) {
    return new Promise(resolve => {
      const d = document.createElement('dialog'); d.className = 'ask-dlg'; d.setAttribute('aria-labelledby', 'ask-t');
      const f = document.createElement('form'); f.method = 'dialog'; f.className = 'ask-box';
      const h = document.createElement('h2'); h.id = 'ask-t'; h.textContent = title; f.append(h);
      if (body) { const p = document.createElement('p'); p.textContent = body; f.append(p); }
      let inp = null;
      if (field) { inp = document.createElement('input'); inp.className = 'su-in'; inp.value = value; inp.autocomplete = 'off'; inp.setAttribute('aria-label', title); f.append(inp); }
      const row = document.createElement('div'); row.className = 'ask-row';
      const no = document.createElement('button'); no.type = 'button'; no.className = 'su-btn'; no.textContent = 'Cancel';
      const yes = document.createElement('button'); yes.type = 'submit'; yes.className = 'su-btn go' + (danger ? ' danger' : ''); yes.textContent = ok;
      row.append(...(info ? [yes] : [no, yes])); f.append(row); d.append(f);
      let out = null;
      f.addEventListener('submit', () => { out = field ? inp.value : true; });
      no.onclick = () => d.close();
      d.addEventListener('keydown', e => e.stopPropagation());   // keys typed here belong to the dialog, not the app's shortcuts
      d.addEventListener('click', e => { if (e.target === d) d.close(); });
      d.addEventListener('close', () => { d.remove(); resolve(out === null ? (field ? null : false) : out); });
      document.body.append(d); d.showModal();
      if (inp) { inp.focus(); inp.select(); } else (danger ? no : yes).focus();
    });
  }
  window.askText = (title, value = '', opts) => ask(title, '', { ...opts, field: true, value });
  window.askConfirm = (text, opts) => ask(text, '', opts);
})();
