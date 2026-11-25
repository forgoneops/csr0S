/* Usage (limits): one line per coding tool (Codex, Claude Code, Hermes): its name, a thin weekly bar, and the time to the reset, as the tool
   itself reports them (core/usage.ts reads Omarchy's usage records). "no record" when nothing was recorded, "stale" when the record is old;
   nothing is ever estimated. Home and the Horde desk call window.xLimitsHtml(); the page repaints once when the numbers change. */
(() => {
  const L = { d: null, at: 0, key: '' };
  const left = ms => { const m = Math.floor(ms / 6e4), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`; };
  async function load() {
    L.at = Date.now();
    try { const r = await fetch('/api/usage/limits'); if (!r.ok) return; const d = await r.json(), key = JSON.stringify(d); if (key !== L.key) { L.key = key; L.d = d; if (typeof render === 'function') render(); } } catch { /* offline: keep what is shown */ }
  }
  const line = t => {
    const w = t.weekly, name = `<span class="lm-n" data-no-i18n>${esc(t.name)}</span>`;
    if (t.state === 'none' || !w) return `<li class="lm none">${name}<span class="lm-bar" aria-hidden="true"></span><span class="lm-t">no record</span></li>`;
    const at = w.resetInMs > 0 ? `Weekly · resets in ${left(w.resetInMs)}` : 'Weekly';
    return `<li class="lm ${t.state}">${name}<span class="lm-bar" role="img" aria-label="${Math.round(w.percent)} percent of the week used"><i style="width:${w.percent}%"></i></span><span class="lm-t">${at}${t.state === 'stale' ? ' · stale' : ''}</span></li>`;
  };
  window.xLimitsHtml = () => {
    if (Date.now() - L.at > 60000) void load();
    if (!L.d) return '';
    return `<section class="lm-box" aria-label="Usage"><span class="label">Usage</span><ul>${L.d.map(line).join('')}</ul></section>`;
  };
})();
