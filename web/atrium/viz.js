/* Evolve visual kit for the pages: stat tiles, segmented meters, stacked bars, range bars, empty states.
   Cut corners and pixel squares only. Colours come from the palette tokens (--accent = lead, --signal = answer,
   --gold, --tint-magenta, --danger), so every palette and the neutral theme restyle it. Motion follows data-motion. */
(() => {
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TONE = { a: 'var(--accent)', s: 'var(--signal)', g: 'var(--gold,var(--accent))', m: 'var(--tint-magenta,var(--accent))', d: 'var(--danger,#ff5a5a)' };
  const tone = t => TONE[t] || TONE.a;
  const clamp = n => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  /* a row of pixel squares, filled up to pct */
  const vzSeg = (pct, t = 'a', n = 24) => { const on = Math.round(clamp(pct) / 100 * n); return `<span class="vz-seg" role="img" aria-label="${Math.round(clamp(pct))} percent" style="--t:${tone(t)}">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? 'on' : ''}${i === on - 1 ? ' tip' : ''}" style="--i:${i}"></i>`).join('')}</span>`; };
  const vzRow = (label, pct, text, t, own) => `<div class="vz-row"><span class="vz-l"${own ? ' data-no-i18n' : ''}>${E(label)}</span>${vzSeg(pct, t)}<span class="vz-v">${E(text)}</span></div>`;
  const vzBars = rows => `<div class="vz-card">${rows.map(r => vzRow(r[0], r[1], r[2], r[3], r[4])).join('')}</div>`;
  const vzTile = (label, value, sub, t, own) => `<div class="vz-tile" style="--t:${tone(t)}"><small>${E(label)}</small><b>${E(value)}</b>${sub ? `<i${own ? ' data-no-i18n' : ''}>${E(sub)}</i>` : ''}</div>`;
  const vzTiles = a => `<div class="vz-tiles">${a.join('')}</div>`;
  /* one stacked bar made of squares, with a legend: parts = [[label, count, tone]] */
  const vzStack = (parts, n = 40) => {
    const tot = parts.reduce((s, p) => s + p[1], 0) || 1; let used = 0;
    const sq = parts.flatMap((p, k) => { const c = k === parts.length - 1 ? n - used : Math.round(p[1] / tot * n); used += c; return Array.from({ length: Math.max(0, c) }, () => `<i style="--t:${tone(p[2])}"></i>`); }).join('');
    return `<div class="vz-card"><div class="vz-stack">${tot > 1 || parts.some(p => p[1]) ? sq : Array.from({ length: n }, () => '<i class="off"></i>').join('')}</div><div class="vz-leg">${parts.map(p => `<span style="--t:${tone(p[2])}"><i></i>${E(p[0])} <b>${E(p[1])}</b></span>`).join('')}</div></div>`;
  };
  /* floating min..max bars on one shared scale: rows = [[label, min, max, text]] */
  const vzRange = rows => {
    const lo = Math.min(...rows.map(r => r[1])), hi = Math.max(...rows.map(r => r[2])), span = Math.max(1, hi - lo);
    return `<div class="vz-card">${rows.map(r => `<div class="vz-row"><span class="vz-l"${r[4] ? ' data-no-i18n' : ''}>${E(r[0])}</span><span class="vz-rng"><i style="left:${(r[1] - lo) / span * 100}%;width:${Math.max(3, (r[2] - r[1]) / span * 100)}%"></i></span><span class="vz-v">${E(r[3])}</span></div>`).join('')}</div>`;
  };
  /* an empty state with a small pixel arch whose torches flicker; never text on art */
  const vzEmpty = (title, text) => `<div class="vz-empty"><svg viewBox="0 0 48 40" width="72" height="60" aria-hidden="true" shape-rendering="crispEdges"><path d="M4 36h40v4H4zM8 12h6v24H8zM34 12h6v24h-6zM8 8h32v4H8zM16 14h16v4H16zM18 18h4v18h-4zM26 18h4v18h-4z" fill="none" stroke="var(--line)" stroke-width="1"/><path d="M8 8h32v4H8z" fill="var(--accent)" opacity=".55"/><rect class="vz-fl" x="10" y="2" width="3" height="4" fill="var(--accent)"/><rect class="vz-fl f2" x="35" y="2" width="3" height="4" fill="var(--signal)"/><rect x="22" y="22" width="4" height="4" fill="var(--gold,var(--accent))" transform="rotate(45 24 24)"/></svg><b>${E(title)}</b>${text ? `<p>${E(text)}</p>` : ''}</div>`;
  Object.assign(window, { vzSeg, vzRow, vzBars, vzTile, vzTiles, vzStack, vzRange, vzEmpty });

  const css = `
.vz-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}
.vz-tile{position:relative;display:grid;gap:5px;padding:12px 14px;border:1px solid var(--line);background:linear-gradient(160deg,color-mix(in srgb,var(--t) 9%,var(--surface)),var(--surface));--c:12px;clip-path:polygon(0 0,calc(100% - var(--c)) 0,100% var(--c),100% 100%,var(--c) 100%,0 calc(100% - var(--c)))}
.vz-tile:before{content:"";position:absolute;right:9px;top:9px;width:6px;height:6px;background:var(--t);transform:rotate(45deg);box-shadow:0 0 8px var(--t)}
.vz-tile small{font:500 9px var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.vz-tile b{font:500 26px/1.1 var(--font-display);letter-spacing:.02em;overflow-wrap:anywhere}
.vz-tile i{font-style:normal;font-size:11px;color:var(--t)}
.vz-card{display:grid;gap:9px;padding:12px 14px;border:1px solid var(--line);background:var(--surface);--c:12px;clip-path:polygon(0 0,calc(100% - var(--c)) 0,100% var(--c),100% 100%,0 100%)}
.vz-row{display:grid;grid-template-columns:minmax(70px,150px) minmax(0,1fr) minmax(60px,auto);gap:12px;align-items:center;font-size:12px}
.vz-l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vz-v{color:var(--muted);font:500 11px var(--font-mono);text-align:right}
.vz-seg{display:flex;gap:2px;min-width:0}.vz-seg i{flex:1;min-width:2px;height:10px;background:var(--line);opacity:.7}
.vz-seg i.on{background:var(--t);opacity:1}.vz-seg i.tip{box-shadow:0 0 8px var(--t)}
html[data-motion=on] .vz-seg i.on{animation:vzin 420ms var(--ease-out,ease-out) both;animation-delay:calc(var(--i) * 14ms)}
html[data-motion=on] .vz-seg i.tip{animation:vzin 420ms var(--ease-out,ease-out) both,vzpulse 3.4s ease-in-out 600ms infinite;animation-delay:calc(var(--i) * 14ms),0s}
@keyframes vzin{from{opacity:0;transform:scaleY(.2)}}@keyframes vzpulse{50%{opacity:.55}}
.vz-stack{display:flex;gap:2px}.vz-stack i{flex:1;height:16px;background:var(--t)}.vz-stack i.off{background:var(--line);opacity:.6}
.vz-leg{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;color:var(--muted)}.vz-leg span{display:inline-flex;align-items:center;gap:7px}.vz-leg i{width:9px;height:9px;background:var(--t);display:inline-block}.vz-leg b{color:var(--text);font-weight:600}
.vz-rng{position:relative;height:10px;background:var(--line);opacity:.95}.vz-rng i{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,var(--signal),var(--accent))}
.og-list>.vz-empty{grid-template-columns:1fr}
.vz-empty{display:grid;justify-items:center;gap:6px;text-align:center;padding:26px 16px;border:1px dashed var(--line);color:var(--muted)}
.vz-empty b{color:var(--text);font:500 14px var(--font-display);letter-spacing:.06em}.vz-empty p{margin:0;font-size:12.5px;max-width:420px}
.vz-fl{transform-origin:center bottom}
html[data-motion=on] .vz-fl{animation:vzfl 3.1s ease-in-out infinite}html[data-motion=on] .vz-fl.f2{animation-duration:4.3s;animation-delay:-1.2s}
@keyframes vzfl{0%,100%{opacity:.5}30%{opacity:1}55%{opacity:.65}78%{opacity:.95}}
.pg-slot{height:56px;border:1px dashed var(--line);background:repeating-linear-gradient(135deg,transparent 0 6px,color-mix(in srgb,var(--line) 45%,transparent) 6px 7px)}
@media(max-width:640px){.vz-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.vz-tile b{font-size:20px}.vz-row{grid-template-columns:minmax(60px,96px) minmax(0,1fr);row-gap:3px}.vz-v{grid-column:1/-1;text-align:left}.vz-seg i{height:9px}}
`;
  const st = document.createElement('style'); st.id = 'viz-kit'; st.textContent = css; document.head.appendChild(st);
})();
