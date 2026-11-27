/* CAESAR date picker: replaces the stock date input (the owner's rule: no native controls). Same button-and-pop pattern as the mode
   switch, own icons, cut corners, colours from tokens. Use CSDATE(id, 'YYYY-MM-DD') in markup; a hidden input with that id keeps the value,
   so val(id) reads it like any field. Touch: 44px day buttons. Keyboard: arrows move by day and week, PageUp/PageDown by month,
   Home/End to the row ends, Enter or Space picks, Escape closes. */
const CSDATE = (id, value) => {
  const v = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : new Date().toISOString().slice(0, 10);
  return `<div class="cs-date" data-cs-date><input type="hidden" id="${id}" value="${v}"><button type="button" class="cs-date-cur" aria-haspopup="dialog" aria-expanded="false" aria-label="Pick a date">${I('calendar', 16)}<span>${v}</span>${I('chevron-down', 14)}</button><div class="cs-date-pop" role="dialog" aria-label="Choose a date" hidden></div></div>`;
};
(() => {
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const iso = (y, m, d) => y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const today = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
  const close = (root, back) => { const p = root.querySelector('.cs-date-pop'), b = root.querySelector('.cs-date-cur'); p.hidden = true; b.setAttribute('aria-expanded', 'false'); if (back) b.focus(); };
  const paint = (root, y, m, focus) => {
    const pop = root.querySelector('.cs-date-pop'), val = root.querySelector('input').value, t = today();
    root.dataset.y = y; root.dataset.m = m;
    const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const cells = Array.from({ length: first }, () => '<i></i>').concat(Array.from({ length: days }, (_, i) => { const d = iso(y, m, i + 1); return `<button type="button" class="cs-d${d === val ? ' on' : ''}${d === t ? ' now' : ''}" data-d="${d}" aria-pressed="${d === val}" aria-label="${i + 1} ${MON[m]} ${y}">${i + 1}</button>`; }));
    pop.innerHTML = `<div class="cs-date-hd"><button type="button" class="cs-nav" data-cs-m="-1" aria-label="Previous month">${I('chevron-right', 14)}</button><b aria-live="polite">${MON[m]} ${y}</b><button type="button" class="cs-nav r" data-cs-m="1" aria-label="Next month">${I('chevron-right', 14)}</button></div><div class="cs-date-dow" aria-hidden="true">${DOW.map(x => `<span>${x}</span>`).join('')}</div><div class="cs-date-grid">${cells.join('')}</div><div class="cs-date-ft"><button type="button" class="cs-today" data-d="${t}">Today</button></div>`;
    if (focus) { const f = pop.querySelector(focus === 'sel' ? '.cs-d.on, .cs-d.now, .cs-d' : `[data-d="${focus}"]`) || pop.querySelector('.cs-d'); if (f) f.focus(); }
  };
  const pick = (root, d) => { root.querySelector('input').value = d; root.querySelector('.cs-date-cur span').textContent = d; close(root, true); };
  document.addEventListener('click', e => {
    const root = e.target.closest && e.target.closest('[data-cs-date]');
    document.querySelectorAll('[data-cs-date]').forEach(r => { if (r !== root && !r.querySelector('.cs-date-pop').hidden) close(r); });
    if (!root) return;
    const cur = e.target.closest('.cs-date-cur'), nav = e.target.closest('[data-cs-m]'), day = e.target.closest('[data-d]');
    if (cur) {
      const pop = root.querySelector('.cs-date-pop');
      if (!pop.hidden) return close(root, true);
      const [y, m] = root.querySelector('input').value.split('-').map(Number); pop.hidden = false; cur.setAttribute('aria-expanded', 'true'); paint(root, y, m - 1, 'sel');
    } else if (nav) { const d = new Date(+root.dataset.y, +root.dataset.m + +nav.dataset.csM, 1); paint(root, d.getFullYear(), d.getMonth()); nav.focus(); }
    else if (day) pick(root, day.dataset.d);
  });
  document.addEventListener('keydown', e => {
    const root = e.target.closest && e.target.closest('[data-cs-date]'); if (!root || root.querySelector('.cs-date-pop').hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(root, true); }
    const d = e.target.closest && e.target.closest('.cs-d'); if (!d) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key], [y, m, n] = d.dataset.d.split('-').map(Number);
    let to = null;
    if (step) to = new Date(y, m - 1, n + step); else if (e.key === 'PageUp') to = new Date(y, m - 2, n); else if (e.key === 'PageDown') to = new Date(y, m, n);
    else if (e.key === 'Home') to = new Date(y, m - 1, n - ((new Date(y, m - 1, n).getDay() + 6) % 7)); else if (e.key === 'End') to = new Date(y, m - 1, n + 6 - ((new Date(y, m - 1, n).getDay() + 6) % 7));
    if (!to) return;
    e.preventDefault(); paint(root, to.getFullYear(), to.getMonth(), iso(to.getFullYear(), to.getMonth(), to.getDate()));
  });
})();
