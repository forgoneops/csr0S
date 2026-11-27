/* Computer: Caesar sees and uses this computer, only while you switch it on. The switch is the approval: it expires on its own,
   Stop ends it at once, and every call is written to the activity log. Pointer clicks are not available yet (needs a one-time
   permission on this machine); the page says so. */
(() => {
  const get = async u => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) });
  const K = { st: null, wins: [], audit: [], shot: '', shotFor: '', ttl: 300, msg: '', token: false };
  const hhmm = t => new Date(t).toLocaleTimeString(uiLocale([]), { hour: '2-digit', minute: '2-digit' });
  const left = () => K.st && K.st.armed ? Math.max(0, Math.round((K.st.until - Date.now()) / 1000)) : 0;
  const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  // add the entry to the Work group of the menu, once
  const work = NSIA.find(g => g[0] === 'Work'); if (work && !work[2].some(x => x[0] === 'Computer')) { work[2].unshift(['Computer', 'Machina', 'terminal']); OGS.mods.add('Computer'); }

  async function refresh() {
    K.st = await get('/api/computer/state'); if (!K.st) return;
    if (K.st.armed) { K.wins = (await get('/api/computer/windows')) || []; } else { K.wins = []; }
    K.audit = ((await get('/api/computer/audit')) || []).slice(-12).reverse();
  }
  const on = () => S.tabs[S.act] && S.tabs[S.act].id === 'Computer';

  function view() {
    if (!K.st) { void refresh().then(() => on() && render()); return `<div class="nx-view enter cx">${nsHead('Computer', 'Reading this machine', 'Machina', 'atrium-hero')}<div class="og-wrap">${ARTSKEL(3, 'Loading')}</div></div>`; }
    const armed = K.st.armed, s = left();
    const wins = K.wins.map(w => `<li class="cx-w"><span class="cx-wt"><b>${esc(w.title || w.class)}</b><small>${esc(w.class)} · workspace ${esc(String(w.workspace))} · ${w.width}×${w.height}</small></span><button class="su-btn" data-cx="shot" data-v="${esc(w.address)}">${I('image', 16)}<span>Look</span></button></li>`).join('');
    const audit = K.audit.map(a => `<li class="cx-a"><time>${esc(new Date(a.time).toLocaleTimeString(uiLocale()))}</time><b>${esc(a.action)}</b><span>${esc(a.class || '')} ${esc((a.title || '').slice(0, 40))}</span><em class="${/ok|armed/.test(a.result) ? 'ok' : 'no'}">${esc(a.result)}${a.length != null ? ' · ' + a.length + ' chars' : ''}</em></li>`).join('');
    return `<div class="nx-view enter cx">${nsHead('Computer', 'Caesar can see and use this computer, but only while you switch it on.', 'Machina', 'atrium-hero')}<div class="su-wrap">
      <section class="su-card cx-main ${armed ? 'live' : ''}"><div class="cx-state"><span class="su-dot ${armed ? 'warn' : ''}"></span><div><b>${armed ? 'ON' : 'OFF'}</b><small>${armed ? 'until ' + hhmm(K.st.until) + ' · ' + mmss(s) + ' left' : 'Nothing can look at or type into your computer.'}</small></div></div>
        ${armed ? `<button class="su-btn cx-stop" data-cx="stop">${I('stop', 18)}<span>Stop now</span></button>` : `<div class="cx-on"><span class="su-note">Switch on for</span><div class="cx-ttl">${[[300, '5 min'], [900, '15 min']].map(([v, l]) => `<button class="su-btn ${K.ttl === v ? 'go' : ''}" data-cx="ttl" data-v="${v}"><span>${l}</span></button>`).join('')}</div><button class="su-btn go big" data-cx="arm">${I('power', 18)}<span>Switch on</span></button></div>`}
      </section>
      ${K.msg ? `<p class="cx-msg" role="status">${esc(K.msg)}</p>` : ''}
      <section class="su-card"><h3><span>1</span>What Caesar can do</h3><ul class="cx-can"><li>${I('check', 14)} See which windows are open</li><li>${I('check', 14)} Bring one window to the front</li><li>${I('check', 14)} Type into one named window (never a password or secret prompt)</li><li>${I('check', 14)} Press keys in that window, take a picture of it</li><li class="no">${I('close', 14)} Click with the pointer: not yet. It needs a one-time permission on this machine.</li></ul></section>
      ${armed ? `<section class="su-card"><h3><span>2</span>Windows now</h3><ul class="cx-wl">${wins || '<li class="cx-empty">No windows found.</li>'}</ul>${K.shot ? `<figure class="cx-shot"><img src="${K.shot}" alt="Picture of the chosen window"><figcaption class="su-note">${esc(K.shotFor)}</figcaption></figure>` : ''}</section>` : ''}
      <section class="su-card"><h3><span>${armed ? 3 : 2}</span>Let the crew use it</h3><p class="su-note">An agent only gets what you switch on above, and only through a key you create here. The key lives in this app's data folder.</p>
        <div class="cx-row"><button class="su-btn" data-cx="token">${I('key', 16)}<span>${K.st.hasToken ? 'Renew key' : 'Create key'}</span></button><span class="su-chip ${K.st.hasToken ? 'ok' : 'warn'}">${K.st.hasToken ? 'key ready' : 'no key yet'}</span></div>
        <p class="su-note">Caesar already has the tools. Ask him from here:</p>
        <div class="cx-ask"><input class="su-in" id="cx-task" placeholder="For example: tell me which windows are open" autocomplete="off"><button class="su-btn go" data-cx="ask"><span>Ask Caesar</span></button></div>
        <p class="su-note">To give another Hermes profile the tools: <code class="cx-code">hermes -p NAME mcp add caesar-computer --env CAESAROS_URL=${esc(location.origin)} CAESAROS_DATA=${esc(K.st.dataDir)} --command bun --args ${esc(K.st.mcpScript)}</code></p></section>
      <section class="su-card"><h3><span>${armed ? 4 : 3}</span>Activity</h3><p class="su-note">Every call is written here. Typed text is never recorded, only its length.</p><ul class="cx-al">${audit || '<li class="cx-empty">Nothing yet.</li>'}</ul></section>
    </div></div>`;
  }
  register({ id: 'computer', views: { Computer: view } });

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-cx]'); if (!b) return; e.preventDefault(); e.stopPropagation();
    const a = b.dataset.cx;
    if (a === 'ttl') { K.ttl = +b.dataset.v; render(); return; }
    if (a === 'arm') { const r = await post('/api/computer/arm', { on: true, ttlSeconds: K.ttl }); K.msg = r.ok ? '' : 'Could not switch on.'; await refresh(); render(); return; }
    if (a === 'stop') { await post('/api/computer/stop'); K.shot = ''; K.msg = 'Stopped.'; await refresh(); render(); return; }
    if (a === 'token') { const r = await post('/api/computer/token'); K.msg = r.ok ? 'Key created. It is valid for 7 days.' : 'Could not create the key.'; await refresh(); render(); return; }
    if (a === 'shot') { const r = await post('/api/computer/screenshot', { window: b.dataset.v }); if (r.ok) { K.shot = URL.createObjectURL(await r.blob()); K.shotFor = (K.wins.find(w => w.address === b.dataset.v) || {}).title || ''; } else K.msg = 'Could not take the picture.'; await refresh(); render(); return; }
    if (a === 'ask') {
      const t = ($('#cx-task') || {}).value; if (!t || !t.trim()) return;
      await window.CX.newThread('caesar');
      const i = $('#inp'); if (i) { i.value = 'Use your computer_* tools only if Computer is switched on. Describe what you will do first. Never type into a password or secret prompt. Task: ' + t.trim(); window.CX.send(); }
    }
  }, true);
  setInterval(async () => { if (!on()) return; await refresh(); if (!document.activeElement.matches('input,textarea')) render(); }, 3000);
})();
