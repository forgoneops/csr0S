/* Accessibility fixes that apply across every view (audit of 2026-11-23). Runs after all other scripts and re-runs when the page changes.
   1. A control that is off-screen (the phone menu slid away) leaves the Tab order, and returns when it is on screen again.
   2. A switch without a name takes the first line of its row as its name, so a screen reader says what it switches.
   3. The page title follows the open view. */
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
