// Pop out (plan 8.11): a tab can leave the window and come back. The popped window is this same page opened as
// /?pop=<chat|app|term>&thread=<id>|app=<name>; state and live data come from the core. The two windows talk through
// a BroadcastChannel: "hello" (popped window opened), "gone" (it closed or was returned), "close" (bring it back).
// Under Tauri the shell opens the window itself, so the result of window.open is not relied on.
(function () {
  'use strict';
  const q = new URLSearchParams(location.search), mine = q.get('pop');
  let bc = null; try { bc = new BroadcastChannel('caesaros-pop'); } catch { /* no channel: pop out still works, the notice just never clears */ }
  const send = m => { try { bc && bc.postMessage(m); } catch { /* closed */ } };
  const keyOf = () => mine === 'chat' ? 'chat:' + q.get('thread') : mine === 'app' ? 'app:' + q.get('app') : 'term:undefined';
  // A window the shell opened cannot be closed by its own script: window.close() does nothing there, so it asks the shell
  // (a navigation to ?pop-close=1 that the shell turns into a close). In a browser window.close() works and the fallback never runs.
  const closeMe = () => { window.close(); setTimeout(() => { location.href = location.origin + '/?pop-close=1'; }, 200); };
  const PO = {};   // keys of tabs that live in another window (main window only)

  if (mine) {   // ---- the popped window
    const tab = mine === 'chat' ? { k: 'chat', id: q.get('thread') } : mine === 'app' ? { k: 'app', id: q.get('app') } : { k: 'term' };
    if (mine === 'chat') S.cur = tab.id;
    S.tabs = [tab]; S.act = 0; S.layout = 'hybrid';
    document.body.classList.add('popped'); const b = document.getElementById('boot'); if (b) b.remove(); document.body.classList.add('booted');
    const btn = document.createElement('button'); btn.className = 'btn pop-return'; btn.textContent = 'Return'; btn.title = 'Put this back in the main window';
    btn.onclick = () => { send({ t: 'gone', key: keyOf() }); closeMe(); };
    document.body.appendChild(btn);
    addEventListener('pagehide', () => send({ t: 'gone', key: keyOf() }));
    if (bc) bc.onmessage = e => { if (e.data && e.data.t === 'close' && e.data.key === keyOf()) { send({ t: 'gone', key: keyOf() }); closeMe(); } };
    send({ t: 'hello', key: keyOf() }); render();
    return;
  }

  // ---- the main window
  const open = x => {
    if (innerWidth <= 900 || !x || x.k === 'ws') return;   // phone: one view at a time; the workspace stays
    const u = x.k === 'chat' ? '?pop=chat&thread=' + encodeURIComponent(x.id) : x.k === 'app' ? '?pop=app&app=' + encodeURIComponent(x.id) : '?pop=term';
    window.open(location.origin + '/' + u, '_blank', 'popup,width=960,height=720');
  };
  window.popOut = open;
  const o = viewFor;
  viewFor = x => PO[tkey(x)]
    ? `<div class="nx-view enter"><div class="og-wrap"><p>This is open in another window.</p><button class="btn" data-poback="${esc(tkey(x))}">Bring back</button></div></div>`
    : o(x);
  if (bc) bc.onmessage = e => {
    const m = e.data || {}; if (!m.key) return;
    if (m.t === 'hello') PO[m.key] = true; else if (m.t === 'gone') delete PO[m.key]; else return;
    render();
  };
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-po]'), back = e.target.closest('[data-poback]');
    if (p) { e.stopPropagation(); open(S.tabs[+p.dataset.po]); }
    else if (back) { send({ t: 'close', key: back.dataset.poback }); delete PO[back.dataset.poback]; render(); }   // cleared here too: the window may be gone already
  }, true);
})();
