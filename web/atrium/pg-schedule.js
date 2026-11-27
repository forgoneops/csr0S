/* Schedule, the Evolved page: month grid (today glow, event chips, keyboard), agenda for the next 14 days, stat tiles
   and a per-week chart. Same API as before (/api/calendar); adding and deleting still go through real.js (data-rd cadd,
   cdel, cdelgo) and share its RD.cal state. Navigation here is its own (data-sc) so it can show a skeleton and an error. */
(() => {
  const RD = window.xRD, E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = n => String(n).padStart(2, '0'), iso = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d), isoD = d => iso(d.getFullYear(), d.getMonth(), d.getDate());
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const btn = (k, label, extra = '') => `<button class="btn" data-rd="${k}" ${extra}>${E(label)}</button>`;
  let tok = 0;
  const cal = () => RD.cal || (RD.cal = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: null, ev: null });
  async function fetchEv(a, z) { try { const r = await fetch('/api/calendar?from=' + a + '&to=' + z); if (r.status === 401) { location.href = '/login'; return null; } return r.ok ? await r.json() : null; } catch { return null; } }
  async function load() {
    const c = cal(), t = ++tok, last = new Date(c.y, c.m + 1, 0).getDate();
    c.busy = true; c.err = false;
    const ev = await fetchEv(iso(c.y, c.m, 1), iso(c.y, c.m, last));
    if (t !== tok) return; c.busy = false;
    if (!ev) c.err = true; else { c.ev = ev; if (!c.sel) { const n = new Date(); c.sel = (n.getFullYear() === c.y && n.getMonth() === c.m) ? isoD(n) : iso(c.y, c.m, 1); } }
    render();
  }
  async function loadAg() {
    const c = cal(), src = c.ev, n = new Date(), e = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 13);
    c.agSrc = src; const ag = await fetchEv(isoD(n), isoD(e)); c.ag = ag || []; render();
  }
  const when = e => (e.time ? E(e.time) + ' ' : '');
  const evRow = (e, del) => `<div class="sc-ev"><i aria-hidden="true"></i><span><b data-no-i18n>${when(e)}${E(e.title)}</b>${e.note ? ' <small data-no-i18n>' + E(e.note) + '</small>' : ''}</span>${del ? `<span class="og-row">${RD.cdel === e.id ? btn('cdelgo:' + E(e.id), 'Delete for good') : btn('cdel:' + E(e.id), 'Delete')}</span>` : ''}</div>`;
  const dayName = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(uiLocale('en-US'), { weekday: 'long', day: 'numeric', month: 'long' }); };

  function skeleton() { return `<div class="sc-grid sc-skel" role="status" aria-label="Loading"><span class="sr-only">Loading from this device</span>${Array.from({ length: 35 }, () => '<i></i>').join('')}</div>`; }
  function stats(ev, ag, today) {
    const all = new Map(); [...ev, ...ag].forEach(e => all.set(e.id || e.date + e.title + (e.time || ''), e));
    const n = new Date(), mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7)), sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6), a = isoD(mon), z = isoD(sun);
    const week = [...all.values()].filter(e => e.date >= a && e.date <= z).length;
    const per = {}; ev.forEach(e => { per[e.date] = (per[e.date] || 0) + 1; });
    const busy = Object.entries(per).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
    const next = [...all.values()].filter(e => e.date >= today).sort((x, y) => (x.date + (x.time || '')).localeCompare(y.date + (y.time || '')))[0];
    const c = cal(), wk = [0, 0, 0, 0, 0, 0], first = (new Date(c.y, c.m, 1).getDay() + 6) % 7;
    ev.forEach(e => { wk[Math.floor((first + Number(e.date.slice(8)) - 1) / 7)]++; });
    const mx = Math.max(1, ...wk), rows = wk.map((v, i) => ['Week ' + (i + 1), v / mx * 100, v + (v === 1 ? ' event' : ' events'), ['a', 's', 'g', 'm'][i % 4]]).filter((r, i) => i < Math.ceil((first + new Date(c.y, c.m + 1, 0).getDate()) / 7));
    return vzTiles([vzTile('This week', week, week === 1 ? 'event' : 'events', 'a'), vzTile('This month', ev.length, MONTHS[c.m], 's'), vzTile('Busiest day', busy ? Number(busy[0].slice(8)) : 'None', busy ? busy[1] + (busy[1] === 1 ? ' event' : ' events') : 'nothing planned', 'g'), vzTile('Next up', next ? (next.time || next.date.slice(5)) : 'None', next ? next.title.slice(0, 24) : 'a clear road', 'm', !!next)]) + `<div class="og-sec">Events per week, ${E(MONTHS[c.m])}</div>` + vzBars(rows);
  }
  function view() {
    const c = cal(), head = (typeof ogHead === 'function' ? ogHead : n => `<h2>${E(n)}</h2>`)('Schedule', 'Your days, kept on this device.', 'Fasti');
    if (!c.ev && !c.busy && !c.err) void load();
    const nav = `<div class="sc-nav"><button class="btn" data-sc="prev" aria-label="Previous month">←</button><h4 aria-live="polite">${MONTHS[c.m]} ${c.y}</h4><button class="btn" data-sc="next" aria-label="Next month">→</button><button class="btn" data-sc="today">Today</button></div>`;
    if (c.err && !c.ev) return `<div class="nx-view enter">${head}<div class="og-wrap">${typeof ARTSTATE === 'function' ? ARTSTATE('error', 'The calendar could not be read', 'Your events are still on this device. Try again.') : '<p role="alert">The calendar could not be read.</p>'}<div class="og-row">${'<button class="btn" data-sc="retry">Try again</button>'}</div></div></div>`;
    if (!c.ev) return `<div class="nx-view enter sc">${head}<div class="og-wrap"><div class="vz-tiles sc-skt"><i></i><i></i><i></i><i></i></div><div class="og-card">${nav}${skeleton()}</div></div></div>`;
    if (c.ev && c.agSrc !== c.ev) void loadAg();
    const ag = c.ag || [], today = isoD(new Date()), first = (new Date(c.y, c.m, 1).getDay() + 6) % 7, days = new Date(c.y, c.m + 1, 0).getDate();
    const by = {}; c.ev.forEach(e => (by[e.date] = by[e.date] || []).push(e));
    let cells = DOW.map(d => `<span class="sc-dow" aria-hidden="true">${d}</span>`).join('') + '<span class="sc-pad"></span>'.repeat(first);
    for (let d = 1; d <= days; d++) {
      const k = iso(c.y, c.m, d), es = (by[k] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || '')), n = es.length;
      cells += `<button class="sc-day${k === today ? ' sc-now' : ''}${k === c.sel ? ' sel' : ''}${n ? ' has' : ''}" data-sc="day" data-k="${k}" aria-pressed="${k === c.sel}"${k === today ? ' aria-current="date"' : ''} aria-label="${d} ${MONTHS[c.m]}${n ? ', ' + n + (n === 1 ? ' event' : ' events') : ''}"><b>${d}</b>${es.slice(0, 2).map(e => `<span class="sc-chip" data-no-i18n>${when(e)}${E(e.title)}</span>`).join('')}${n > 2 ? `<em class="sc-more">+${n - 2}</em>` : ''}${n ? `<span class="sc-dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(n, 3))}</span>` : ''}</button>`;
    }
    const dayEv = by[c.sel] || [], groups = {}; ag.forEach(e => (groups[e.date] = groups[e.date] || []).push(e));
    const agenda = Object.keys(groups).sort().map(k => `<div class="sc-ag"><h5${k === today ? '' : ' data-no-i18n'}>${k === today ? 'Today' : E(dayName(k))}</h5>${groups[k].sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(e => evRow(e, false)).join('')}</div>`).join('');
    const empty = !c.ev.length && !ag.length;
    return `<div class="nx-view enter sc">${head}<div class="og-wrap">
     ${empty ? vzEmpty('Nothing planned yet', 'Pick a day and add an event below. It stays on this device.') : ''}
     <div class="sc-cols"><div class="og-card sc-month">${nav}<div class="sc-grid" role="group" aria-label="${MONTHS[c.m]} ${c.y}">${cells}</div></div>
      <div class="og-card sc-agenda"><div class="og-sec">Next 14 days</div>${agenda || '<p class="sc-none">No events in the next 14 days.</p>'}</div></div>
     ${stats(c.ev, ag, today)}
     <div class="og-sec" data-no-i18n>${E(c.sel ? dayName(c.sel) : '')}</div>
     <div class="og-list sc-list">${dayEv.length ? dayEv.map(e => evRow(e, true)).join('') : '<div style="display:block"><span>Nothing planned for this day.</span></div>'}</div>
     <div class="og-card"><div class="og-row"><input class="og-input" id="rd-ctitle" placeholder="What happens" aria-label="What happens" style="flex:1"><input class="og-input" id="rd-ctime" placeholder="09:30" aria-label="Time" maxlength="5" style="min-width:90px;max-width:110px">${btn('cadd', 'Add')}</div>${RD.err.cal ? `<p role="alert">${E(RD.err.cal)}</p>` : ''}</div></div></div>`;
  }
  const focusSel = () => setTimeout(() => { const el = document.querySelector('.sc-day.sel'); if (el) el.focus(); }, 0);
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('[data-sc]'); if (!t) return;
    const c = cal(), k = t.dataset.sc, shift = d => { c.m += d; if (c.m < 0) { c.m = 11; c.y--; } if (c.m > 11) { c.m = 0; c.y++; } c.sel = null; c.ev = null; c.busy = false; c.err = false; render(); };
    if (k === 'prev') shift(-1); else if (k === 'next') shift(1);
    else if (k === 'today') { const n = new Date(); c.y = n.getFullYear(); c.m = n.getMonth(); c.sel = isoD(n); c.ev = null; c.busy = false; c.err = false; render(); }
    else if (k === 'retry') { c.err = false; render(); }
    else if (k === 'day') { c.sel = t.dataset.k; render(); focusSel(); }
  });
  document.addEventListener('keydown', e => {
    const t = e.target; if (!t || !t.classList || !t.classList.contains('sc-day')) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!step) return;
    const all = [...document.querySelectorAll('.sc-day')], i = all.indexOf(t) + step;
    if (all[i]) { e.preventDefault(); all[i].click(); }
  });

  const css = `
.sc .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.sc-cols{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,1fr);gap:12px;align-items:start}
.sc-nav{display:flex;align-items:center;gap:8px}.sc-nav h4{flex:1;text-align:center;margin:0;font:500 15px var(--font-display);letter-spacing:.08em;text-transform:uppercase}
.sc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:10px}
.sc-dow{font:500 9px var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);text-align:center;padding:2px 0}
.sc-day{position:relative;display:grid;align-content:start;gap:3px;min-height:76px;padding:6px;text-align:left;color:var(--text);cursor:pointer;border:1px solid var(--line);background:var(--surface);font:inherit;overflow:hidden;--c:8px;clip-path:polygon(0 0,calc(100% - var(--c)) 0,100% var(--c),100% 100%,0 100%)}
.sc-day b{font:500 12px var(--font-mono)}
.sc-day:hover{border-color:var(--signal)}.sc-day:focus-visible{outline:2px solid var(--signal);outline-offset:1px}
.sc-day.has{background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 10%,var(--surface)),var(--surface))}
.sc-day.sel{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.sc-day.sc-now{border-color:var(--gold,var(--accent));box-shadow:0 0 14px color-mix(in srgb,var(--gold,var(--accent)) 55%,transparent),inset 0 0 0 1px var(--gold,var(--accent))}
.sc-day.sc-now b{color:var(--gold,var(--accent))}.sc-day.sc-now b:after{content:"";display:inline-block;width:6px;height:6px;margin-left:6px;background:var(--gold,var(--accent));transform:rotate(45deg)}
html[data-motion=on] .sc-day.sc-now{animation:scglow 3.6s ease-in-out infinite}@keyframes scglow{50%{box-shadow:0 0 6px color-mix(in srgb,var(--gold,var(--accent)) 35%,transparent),inset 0 0 0 1px var(--gold,var(--accent))}}
.sc-chip{display:block;font-size:10.5px;line-height:1.3;padding:1px 4px;background:color-mix(in srgb,var(--accent) 24%,transparent);border-left:2px solid var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-more{font:500 10px var(--font-mono);color:var(--muted);font-style:normal}.sc-dots{display:none;gap:2px}.sc-dots i{width:5px;height:5px;background:var(--accent)}
.sc-ag{display:grid;gap:4px;margin-bottom:12px}.sc-ag h5{margin:0;font:500 10px var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--gold,var(--accent))}
.sc-ev{display:flex;align-items:center;gap:8px;padding:6px 8px;border-left:2px solid var(--signal);background:color-mix(in srgb,var(--signal) 7%,transparent);font-size:12.5px}.sc-ev>span:first-of-type{flex:1;min-width:0}.sc-ev i{width:6px;height:6px;background:var(--signal);transform:rotate(45deg);flex:none}
.sc-list>.sc-ev{display:flex}.sc-agenda .og-sec{margin:0 0 8px}
.sc-none{color:var(--muted);font-size:12.5px;margin:0}
.sc-skel i,.sc-skt i{display:block;min-height:76px;background:linear-gradient(90deg,var(--line),color-mix(in srgb,var(--line) 40%,transparent),var(--line));background-size:200% 100%;opacity:.55}
.sc-skt{grid-template-columns:repeat(4,minmax(0,1fr))}.sc-skt i{min-height:72px}
html[data-motion=on] .sc-skel i,html[data-motion=on] .sc-skt i{animation:scsk 1.6s linear infinite}@keyframes scsk{to{background-position:-200% 0}}
@media(max-width:760px){.sc-cols{grid-template-columns:1fr}.sc .sc-month{padding-left:6px;padding-right:6px}.sc-nav .btn{min-width:44px}.sc-grid{gap:3px}.sc-day{min-height:46px;padding:4px;justify-items:center}.sc-chip,.sc-more{display:none}.sc-dots{display:flex}.sc-day b{font-size:11px}.sc-skel i{min-height:46px}.sc-skt{grid-template-columns:repeat(2,minmax(0,1fr))}.sc-day.sc-now b:after{display:none}}
`;
  const st = document.createElement('style'); st.id = 'pg-schedule'; st.textContent = css; document.head.appendChild(st);
  register({ id: 'pg-schedule', views: { Schedule: view } });
})();
