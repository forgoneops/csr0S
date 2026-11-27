/* Accessibility fixes that apply across every view (audit of 2026-11-23). Runs after all other scripts and re-runs when the page changes.
   1. A control that is off-screen (the phone menu slid away) leaves the Tab order, and returns when it is on screen again.
   2. A switch without a name takes the first line of its row as its name, so a screen reader says what it switches.
   3. The page title follows the open view.
   4. A dialog, sheet or drawer takes focus when the person opens it and gives it back on close; a modal one keeps Tab inside.
   5. A keyboard user keeps their place when a repaint replaces the focused control. */
(() => {
  if (typeof MutationObserver === 'undefined' || !document.body) return;   // not a real page (the module-registry test loads the scripts in a stub)
  const ATTR = 'data-a11y-off';
  const offscreen = el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight); };
  const plain = t => (t === t.toUpperCase() && t.length > 3 ? t[0] + t.slice(1).toLowerCase() : t);        // the styles shout in capitals, the name should not
  const firstLine = el => { const t = (el.innerText || '').split('\n').map(s => s.trim()).find(s => s && !/^(on|off|yes|no|enabled|disabled)$/i.test(s)); return t ? plain(t.slice(0, 60)) : ''; };
  function fix() {
    for (const el of document.querySelectorAll('#rail button, #rail a[href], #rail [tabindex]')) {
      if (offscreen(el)) { if (!el.hasAttribute(ATTR)) { el.setAttribute(ATTR, el.getAttribute('tabindex') ?? ''); el.setAttribute('tabindex', '-1'); } }
      else if (el.hasAttribute(ATTR)) { const was = el.getAttribute(ATTR); was === '' ? el.removeAttribute('tabindex') : el.setAttribute('tabindex', was); el.removeAttribute(ATTR); }
    }
    for (const sw of document.querySelectorAll('[role=switch]:not([aria-label]):not([aria-labelledby])')) {
      let n = sw.parentElement, text = '';
      for (let i = 0; i < 3 && n && !text; i++, n = n.parentElement) text = firstLine(n);
      if (text) sw.setAttribute('aria-label', text);
    }
    const h = document.querySelector('main h1, main h2, #view h1, #view h2, .nx-view h1, .nx-view h2');
    const name = h && plain(h.textContent.trim().slice(0, 60));
    const want = name ? `${name} · CaesarOS` : 'CaesarOS';
    if (document.title !== want) document.title = want;
  }
  let t = 0; const later = () => { clearTimeout(t); t = setTimeout(fix, 120); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  addEventListener('resize', later); later();
})();

/* 4 and 5. One place for every overlay, so each page does not have to remember its own opener. */
(() => {
  if (typeof MutationObserver === 'undefined' || !document.body) return;
  // the native shortcut sheet and the palette already manage focus; the Hall of Fame card (.hf) does too
  // .hub-pick (hubs.js) and the open phone menu are overlays without the role; the picker gets it here
  const DIALOGS = '[role=dialog]:not(#nxov):not(.hf):not(.hf *), .hub-pick, #rail.open';
  const MODAL = '[aria-modal=true], .lv-panel, .hub-pick, #rail.open';   // the notification panel dims the page behind a scrim: modal in all but the attribute
  const CAN = 'button,a[href],input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
  const shown = el => el.isConnected && el.getAttribute('aria-hidden') !== 'true' && el.checkVisibility({ visibilityProperty: true }) && el.getBoundingClientRect().width > 1;
  const inside = d => [...d.querySelectorAll(CAN)].filter(e => !e.disabled && !e.closest('[aria-hidden="true"],[inert]') && e.checkVisibility({ visibilityProperty: true }));
  const nameOf = d => d.id === 'rail' ? 'rail' : d.getAttribute('aria-label') || d.className;
  // a repaint swaps nodes, so a place is remembered as a selector that finds the twin
  const place = el => {
    if (el.id) return '#' + CSS.escape(el.id);
    const data = [...el.attributes].filter(a => a.name.startsWith('data-') && a.value.length < 80).map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
    const label = el.getAttribute('aria-label');
    if (data) return el.tagName.toLowerCase() + data + (label ? `[aria-label="${CSS.escape(label)}"]` : '');
    if (label) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(label)}"]`;
    return el.classList.length ? el.tagName.toLowerCase() + [...el.classList].map(c => '.' + CSS.escape(c)).join('') : '';
  };
  // only an unambiguous twin: focusing a look-alike would make the next Enter press the wrong button
  const twin = (el, sel) => { if (el.isConnected && el.checkVisibility()) return el; const m = sel ? [...document.querySelectorAll(sel)].filter(e => e.checkVisibility()) : []; return m.length === 1 ? m[0] : null; };
  const open = new Map();   // dialog name -> { from, sel }
  let last = null, lastIn = null, key = false, acted = 0;
  const acting = k => () => { key = k; acted = Date.now(); };
  addEventListener('keydown', acting(true), true); addEventListener('pointerdown', acting(false), true);
  document.addEventListener('focusin', e => { const t = e.target; if (t !== document.body && !t.closest(DIALOGS)) last = { el: t, sel: place(t) }; else if (t !== document.body) lastIn = { el: t, sel: place(t) }; });
  const enter = d => { if (!d.isConnected || d.contains(document.activeElement)) return; const first = inside(d)[0]; if (!first) d.tabIndex = -1; (first || d).focus({ preventScroll: true }); };
  function sync() {
    for (const p of document.querySelectorAll('.hub-pick:not([role])')) { p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', 'Add a widget'); }
    const now = new Map([...document.querySelectorAll(DIALOGS)].filter(shown).map(d => [nameOf(d), d]));
    for (const [name, d] of now) {
      if (!open.has(name)) {
        // only after the person did something: a window restored at load must not steal focus
        const mine = Date.now() - acted < 4000;
        open.set(name, { from: mine ? last : null, d });
        // the menu slides in, and its rows rejoin the Tab order only once they are on screen
        if (mine) d.id === 'rail' ? setTimeout(() => enter(d), 400) : enter(d);
      } else if (document.activeElement === document.body && d.matches(MODAL)) (lastIn && twin(lastIn.el, lastIn.sel) || inside(d)[0])?.focus({ preventScroll: true });
    }
    for (const [name, was] of open) {
      if (now.has(name)) continue;
      open.delete(name);
      const a = document.activeElement;
      if (was.from && (!a || a === document.body || was.d.contains(a) || a.closest(DIALOGS))) twin(was.from.el, was.from.sel)?.focus({ preventScroll: true });
    }
    // 5: only for the keyboard, and only when the control that had focus was replaced
    if (!now.size && key && last && !last.el.isConnected && document.activeElement === document.body) { const t = twin(last.el, last.sel); if (t) t.focus({ preventScroll: true }); }
  }
  let t = 0; const later = () => { clearTimeout(t); t = setTimeout(sync, 60); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-hidden', 'hidden'] });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const d = [...document.querySelectorAll(DIALOGS)].filter(x => x.matches(MODAL) && shown(x)).pop(); if (!d) return;
    const f = inside(d); if (!f.length) return;
    const first = f[0], end = f[f.length - 1], at = document.activeElement;
    if (!d.contains(at)) { e.preventDefault(); (e.shiftKey ? end : first).focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && at === end) { e.preventDefault(); first.focus(); }
  }, true);
})();
