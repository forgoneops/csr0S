/* UI translation (plan 7.10). English is the source text; when the page language is Polish, every visible text, placeholder, title
   and aria-label is looked up by its exact English text. What is missing is reported once, queued by the core, and translated by the
   person's own engine (see core/i18n.ts); the page shows English until the translation arrives, never a blank or a guess.
   Mark an element data-no-i18n to leave it alone (names, code). Switching back to English reloads the page. */
(() => {
  if (typeof MutationObserver === 'undefined' || !document.body) return;     // not a real page (the module-registry test loads the scripts in a stub)
  const root = document.documentElement, ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'KBD', 'SVG', 'OPTION']);    // no text of their own to translate
  const SKIP_ATTR = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'KBD']);      // but an input's placeholder and a title are UI text
  let cat = {}, vals = new Set(), lang = 'en', ready = false, timer = 0, flushT = 0; const sent = new Set(), pending = new Set(), done = new WeakMap();
  const attrMem = {}; const doneAttr = a => attrMem[a] || (attrMem[a] = new WeakMap());
  const originalText = new Map(), originalAttrs = [], seenAttrs = new WeakMap();
  function restoreEnglish() { for (const [node, value] of originalText) if (node.isConnected) node.nodeValue = value; for (const [el, attr, value] of originalAttrs) if (el.isConnected) el.setAttribute(attr, value); }
  const holes = s => { let k = 0; const n = (s.match(/\d+/g) || []).length; return n > 1 ? s.replace(/\d+/g, () => '{n' + (++k) + '}') : s.replace(/\d+/g, '{n}'); };
  const keyOf = raw => { const s = holes(String(raw).replace(/\s+/g, ' ').trim()); return s.length < 2 || s.length > 300 || !/\p{L}{2}/u.test(s) || /^[IVXLCDM]+( [·\/] \{n\})?$/.test(s) || /^(https?:\/\/|www\.)\S+$|^\S+@\S+\.\S+$|^[\w./~-]+\.[a-z]{2,4}$/i.test(s) ? null : s; };
  const fill = (tr, raw) => { const nums = String(raw).match(/\d+/g) || []; return tr.replace(/\{n(\d*)\}/g, (_, k) => nums[k ? +k - 1 : 0] ?? ''); };
  // The person's own words are never read, translated or sent anywhere: chat messages, note titles and bodies, and whatever else a view
  // marks data-no-i18n (a card title, a file name). A view that shows the person's own text MUST carry that attribute.
  const OWN = '#msgs, .nx-bub, .cdk-msgs, [data-nt-note], .nt-name, .nt-note, .nt-md, .nt-node, .lv-set, .lv-row b, .nx-att-c b, .finance-view td[data-label="Note"], .tg-table-wrap tbody th, .tg-hot li, .tg-hot h3, .ph-rt b, .nx-chead > .label, .rt-slot, [data-ses], [data-no-i18n]';
  // data-i18n-own="<their words>": the text or attributes of this one element carry the person's words inside interface text ("Rename <title>").
  // They are cut out as {s} before the lookup, so only "Rename {s}" is ever looked up or reported. With no value, the attributes are left
  // alone and what is inside is still translated.
  const skipped = (el, set = SKIP) => { for (let e = el; e; e = e.parentElement) if (set.has(e.tagName) || e.isContentEditable) return true; // the Hall of Fame card is marked data-no-i18n as a whole, but only the keeper's handle (h4) is a name
    if (el.closest && el.closest('.hf-card') && !el.closest('h4')) return false;
    return !!(el.closest && el.closest(OWN)); };
  // `slot` is the thing that holds the text (a text node, or an element plus attribute name); `mem` remembers what we wrote there
  // their words are cut out as whole words only, so a card called "o" does not break "Open"
  const mask = (raw, own) => (own ? raw.replace(new RegExp('(?<![\\p{L}\\p{N}])' + own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'gu'), '{s}') : raw);
  function text(slot, mem, raw, set, own) {
    if (mem.get(slot) === raw) return;                      // our own write
    const masked = mask(raw, own);
    const k = keyOf(masked); if (!k) return;
    const tr = cat[k];
    if (tr) { const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0], out = lead + fill(tr, masked).split('{s}').join(own || '{s}') + trail; mem.set(slot, out); set(out); }
    else if (!vals.has(k) && !sent.has(k)) { sent.add(k); pending.add(k); }       // already Polish text is not "missing"
  }
  function walk(rootEl) {
    if (lang !== 'pl') return;     // a queued walk, or a slow catalog load, must not repaint Polish after the switch back to English
    const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (!n.parentElement || skipped(n.parentElement)) continue; const node = n; if (!originalText.has(node)) originalText.set(node, node.nodeValue); text(node, done, node.nodeValue, v => { node.nodeValue = v; }, node.parentElement.getAttribute('data-i18n-own')); }
    const els = rootEl.nodeType === 1 ? [rootEl, ...rootEl.querySelectorAll('[placeholder],[title],[aria-label],[alt]')] : [];
    for (const el of els) { const own = el.getAttribute && el.getAttribute('data-i18n-own'); if (skipped(el, SKIP_ATTR) || own === '') continue; for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v) { let seen = seenAttrs.get(el); if (!seen) { seen = new Set(); seenAttrs.set(el, seen); } if (!seen.has(a)) { seen.add(a); originalAttrs.push([el, a, v]); } text(el, doneAttr(a), v, o => el.setAttribute(a, o), own); } } }
    if (pending.size && !flushT) flushT = setTimeout(flush, 2500);
  }
  async function flush() {
    flushT = 0; const strings = [...pending].slice(0, 200); strings.forEach(s => pending.delete(s)); if (!strings.length || lang !== 'pl') return;
    try { await fetch('/api/i18n/pl/missing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ strings }) }); } catch { /* offline: try again on the next change */ strings.forEach(s => sent.delete(s)); }
  }
  async function load() { const r = await fetch('/api/i18n/' + lang); if (!r.ok) return; const j = await r.json(); cat = j.catalog || {}; vals = new Set(Object.values(cat).map(keyOf).filter(Boolean)); window.I18N.missing = j.missing || 0; }
  async function setLang() {
    const l = root.lang === 'pl' ? 'pl' : 'en';
    if (l === lang && ready) return;
    const previous = lang; lang = l; ready = true;
    if (previous === 'pl' && lang === 'en') restoreEnglish();
    if (lang === 'pl') { try { await load(); } catch { return; } walk(document.body); }
    if (previous !== lang && typeof render === 'function') render();     // dates and numbers are formatted by the scripts, so they redraw
  }
  function schedule() { if (lang !== 'pl' || timer) return; timer = setTimeout(() => { timer = 0; walk(document.body); }, 120); }
  window.I18N = {
    missing: 0,
    /** The Polish for one interface string when the page is Polish, else the string itself (the command palette matches on it). */
    t: s => (lang === 'pl' && cat[keyOf(s)]) || s,
    async setLanguage(l) { root.lang = l === 'pl' ? 'pl' : 'en'; await setLang(); if (l === 'pl') walk(document.body); },
    /** Ask the core to translate what is queued (one batch), then apply it. Returns { done, left, error? }. */
    async translateNow(all) { const r = await fetch('/api/i18n/pl/translate' + (all ? '?all=1' : ''), { method: 'POST' }); const j = await r.json().catch(() => ({})); await load().catch(() => {}); walk(document.body); return j; },
    reload: async () => { await load(); walk(document.body); },
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  new MutationObserver(() => { void setLang(); }).observe(root, { attributes: true, attributeFilter: ['lang'] });
  void setLang();
})();
