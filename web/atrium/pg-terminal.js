/* Terminal page header: state tiles, the session list and launchers for installed CLI tools, drawn above the xterm pane
   by bridge.js's termHtml (tab mode only). A launcher types the tool's name into the live shell through CX.runInTerminal. */
(() => {
  const PT = { d: null, at: 0, busy: false, err: false };
  const E = s => (typeof OGE === 'function' ? OGE(s) : String(s == null ? '' : s));
  const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
  const BIN = { claude: 'claude', codex: 'codex', gemini: 'gemini' };   // the CLI tools the core detects (core/engines/cli.ts)
  async function load() {
    if (PT.busy) return; PT.busy = true;
    try {
      const [st, ss, en] = await Promise.all([get('/api/terminal'), get('/api/terminal/sessions').catch(() => ({ sessions: [], recoverable: [] })), get('/api/engines').catch(() => ({ engines: [] }))]);
      PT.d = { st, ss: (ss.sessions || []).filter(x => !x.parked), rec: (ss.recoverable || []).length, tools: (en.engines || []).filter(e => BIN[e.id]) }; PT.err = false;
    } catch { PT.err = true; }
    PT.busy = false; PT.at = Date.now(); fill();
    // the shell attaches just after the tab first draws, so look once more soon
    if (!PT.looked) { PT.looked = true; setTimeout(() => { PT.at = 0; fill(); }, 2500); }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ptl]'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); const id = b.dataset.ptl;
    if (!BIN[id] || !window.CX || !CX.runInTerminal) return;
    const drawer = S.term; const run = CX.runInTerminal(BIN[id]); S.term = drawer; render();   // runInTerminal opens the bottom drawer; the tab already shows the shell
    void run.then(ok => { PT.note = ok ? '' : 'No shell came up. Press a key in the pane below, then try again.'; PT.at = 0; fill(); });
  }, true);
  const view = () => {
    const art = typeof ARTHEAD === 'function' ? ARTHEAD('Terminal', 'terminal', 72) : '';
    const top = `${art}<div class="nx-phead"><h2>TERMINAL</h2><span class="label">Armilla</span></div>`;
    if (!PT.d) return `<div class="pgt">${top}${PT.err ? ARTSTATE('error', 'The terminal state could not load', 'The shell below may still work. It tries again in a moment.') : `<div class="vz-tiles" aria-busy="true" role="status">${[1, 2, 3].map(() => '<div class="pg-slot"></div>').join('')}</div>`}</div>`;
    const { st, ss, rec, tools } = PT.d;
    const sess = ss.length ? `<div class="pgt-tabs" role="list">${ss.map((s, i) => `<span class="pgt-s ${s.attached ? 'on' : ''}" role="listitem"><i class="pgt-px ${s.attached ? '' : 'gold'}" aria-hidden="true"></i>Shell ${i + 1} <small>${s.cols}x${s.rows} · ${s.attached ? 'attached' : 'kept alive'}</small></span>`).join('')}</div>` : '<p class="og-note">No shell yet. It starts when you press a key in the pane below.</p>';
    const launch = tools.length ? tools.map(t => { const ok = t.health && t.health.ok; return `<button class="btn" data-ptl="${E(t.id)}" ${ok ? '' : 'disabled'} title="${ok ? 'Type ' + E(BIN[t.id]) + ' in the shell' : E((t.health && t.health.detail) || 'not ready')}">${E(t.label)}</button>`; }).join('') : '<span class="og-note">No CLI tool found on this machine. Install Claude Code, Codex or Gemini and it shows here.</span>';
    return `<div class="pgt">${top}${PT.err ? '<p class="og-note" role="status">Showing the last answer; the core did not reply just now.</p>' : ''}
      ${vzTiles([vzTile('Terminal', st.enabled ? 'On' : 'Off', st.edition, st.enabled ? 's' : 'd'), vzTile('Shells', ss.length + ' / ' + st.maxSessions, rec ? rec + ' to recover' : 'open now', 'a'), vzTile('Idle limit', Math.round(st.idleMs / 60000) + ' min', 'then it ends', 'g')])}
      <div class="pgt-row"><div class="pgt-col"><div class="og-sec">Sessions</div>${sess}</div><div class="pgt-col"><div class="og-sec">Launch in the shell</div><div class="og-row">${launch}</div><p class="og-note" role="status">${E(PT.note || 'Types the command into the open shell.')}</p></div></div></div>`;
  };
  // A constant slot, filled here: a refresh never rewrites the shell, so the xterm pane below is left alone.
  function fill() {
    const el = document.getElementById('pgt-slot'); if (!el || typeof vzTiles !== 'function') return;
    if (Date.now() - PT.at > 9000) void load();
    const h = view(); if (el.pgHtml !== h) { el.innerHTML = h; el.pgHtml = h; }
  }
  window.pgTerminal = () => '<div id="pgt-slot" class="pgt-slot"></div>';
  const drawn = render; render = function () { const r = drawn(); fill(); return r; };
  setInterval(fill, 10000);
})();
