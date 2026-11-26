/* Gateway page, part two: "Use it from other devices" (serve this app as a web app), the Connections list, and the optional
   Remote host forward. The core is the source of truth (/api/webgate, /api/gateways, /api/expose); this file only draws and
   calls it. real.js draws the page and asks window.GW.view() for this part. Nothing here is on by default. */
(() => {
  const J = { 'content-type': 'application/json' };
  const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const call = async (u, m, b) => { try { const r = await fetch(u, { method: m || 'GET', headers: J, body: b === undefined ? undefined : JSON.stringify(b) }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j }; } catch { return { ok: false, status: 0, j: {} }; } };
  const REACH = [['device', 'This device only', 'Nothing else can open it. This is the default.'], ['lan', 'Local network', 'Phones and computers on the same Wi-Fi or cable network.'], ['tailnet', 'Tailnet or VPN', 'Devices signed in to your Tailscale network, from anywhere.']];
  const ERR = {
    no_address: 'This machine has no address on that network. Connect to it first (or start Tailscale) and try again.', bind_failed: 'The address is busy or refused. Try again, or stop whatever uses the port.',
    loopback_only: 'Open CaesarOS on the computer that runs it to change this.', operator_only: 'Only the person using this computer can change this.',
    name_required: 'Give the connection a name.', name_long: 'That name is too long.', name_duplicate: 'A connection with that name already exists.', name_reserved: 'That name is used by This device.',
    url_required: 'Type the address.', url_invalid: 'That is not a valid address.', url_scheme: 'The address must start with http:// or https://.', url_credentials: 'Leave the user and password out of the address.', url_extras: 'Leave the query and fragment out of the address.',
    url_duplicate: 'That address is already in the list.', url_plain_http: 'Plain http works only on a home network or a tailnet. Use https for other hosts.', token_invalid: 'The access key looks wrong.', too_many: 'The list is full.',
    host_is_required: 'Type the address first, like user@host.', host_invalid: 'That address does not look right. Use user@host or a host name.', tailscale_not_available: 'Tailscale is not running on this machine. Install it and run tailscale up first.',
    ssh_failed: 'SSH did not accept this machine\'s key. Add your key to the host first.', socat_failed: 'socat could not be installed on the host (it needs passwordless sudo, or install it yourself).', unit_failed: 'The forward service did not start on the host.', busy: 'A connection is already running.',
  };
  const msg = k => ERR[k] || 'It did not work.';
  const G = { st: null, fresh: null, conns: null, ex: null, exOpen: false, exBusy: false, exHost: '', exPort: '', err: {}, copied: '', loaded: false };
  const again = () => { if (typeof render === 'function') render(); };
  const idle = () => !document.activeElement || !document.activeElement.matches('input,textarea');

  async function load() {
    const [st, cn, ex] = await Promise.all([call('/api/webgate'), call('/api/gateways'), call('/api/expose')]);
    G.st = st.ok ? st.j : null; G.conns = cn.ok ? cn.j : { thisDevice: { name: 'This device' }, gateways: [] }; G.ex = ex.ok ? ex.j : null; G.loaded = true;
    again();
  }
  const stat = s => `<span class="og-tag ${s.cls}">${E(s.label)}</span>`;

  function serveCard() {
    const s = G.st;
    if (!s) return `<div class="og-card"><p>Changing who can open CaesarOS is done on the computer that runs it.</p></div>`;
    const on = s.reach !== 'device' && s.listening, f = G.fresh;
    const seg = `<div class="st-seg" role="group" aria-label="Who can open it">${REACH.map(([id, label]) => `<button type="button" class="${s.reach === id ? 'on' : ''}" data-gw="reach:${id}" aria-pressed="${s.reach === id}">${E(label)}</button>`).join('')}</div>`;
    const hint = (REACH.find(r => r[0] === s.reach) || REACH[0])[2];
    const addr = s.address || {};
    const missing = s.reach === 'device' ? '' : '';
    const live = on ? `<div class="gw-live">
        <p>Open this link on the other device:</p>
        <div class="og-row"><code class="gw-url">${E(f ? f.link : s.url)}</code>${f ? `<button type="button" class="btn" data-gw="copy">${E(G.copied === 'link' ? 'Copied' : 'Copy link')}</button>` : ''}</div>
        ${f ? `<div class="gw-qrbox">${window.CaesarQR ? window.CaesarQR.svg(f.link) : ''}<p>Scan it with the phone camera. The access key is inside the link and is shown only now; after you leave this page, make a new one with Rotate key.</p></div>`
            : '<p class="og-note">The access key was shown once, when you turned this on. Press Rotate key to get a new link (the old one stops working).</p>'}
        <div class="og-row">${f ? '' : ''}<button type="button" class="btn" data-gw="rotate">Rotate key</button><button type="button" class="btn" data-gw="stop">Stop</button></div>
        ${sec('Connected devices')}<div class="og-list">${s.devices.length ? s.devices.map(d => `<div>${I('crew', 16)}<span>${E(d.name)} <small>${E(d.ip)} · last seen ${E(new Date(d.lastSeen).toLocaleTimeString())}</small></span></div>`).join('') : '<div style="display:block"><span>None yet.</span></div>'}</div>
        <p class="og-note">Anyone with the link can use CaesarOS as you, including your signed-in tools. Do not share it. The link is plain http, so keep it on a network you trust.</p></div>` : '';
    return `<div class="og-card"><div class="og-row"><h4>Serve as web app</h4>${stat(on ? { cls: 'sig', label: s.reach === 'lan' ? 'Local network' : 'Tailnet' } : { cls: 'mut', label: 'This device only' })}</div>
      <p>The gateway opens this running app in a browser or phone, installable like an app. Nothing leaves this device unless you choose it.</p>
      ${seg}<p class="og-note">${E(hint)}${s.reach !== 'device' && addr[s.reach] ? ' Address ' + E(addr[s.reach]) + '.' : ''}</p>${missing}
      ${G.err.serve ? `<p role="alert">${E(msg(G.err.serve))}</p>` : ''}${s.error && !G.err.serve ? `<p role="alert">${E(msg(s.error))}</p>` : ''}${live}</div>`;
  }
  const sec = t => `<div class="og-sec">${E(t)}</div>`;

  function connCard() {
    const c = G.conns || { gateways: [] };
    const rows = c.gateways.map(x => `<div>${I('globe', 16)}<span>${E(x.name)} <small>${E(x.url)}${x.hasToken ? ' · key saved' : ''}</small></span><span class="og-row"><button type="button" class="btn" data-gw="open:${E(x.id)}">Open</button><button type="button" class="btn" data-gw="rmc:${E(x.id)}">Remove</button></span></div>`).join('');
    return `${sec('Connections')}<div class="og-list"><div>${I('system', 16)}<span>${E((c.thisDevice || {}).name || 'This device')} <small>this app, always here</small></span><span class="og-tag sig">Current</span></div>${rows}</div>
      <div class="og-card"><p>Add another CaesarOS you run, to open it from here. Its address and access key come from its own Gateway page. Keys stay on this computer and are never shown again.</p>
        <div class="og-row"><input class="og-input" id="gw-cname" placeholder="Name" autocomplete="off" style="flex:1"><input class="og-input" id="gw-curl" placeholder="Address, https://..." autocomplete="off" autocapitalize="none" spellcheck="false" style="flex:2"></div>
        <div class="og-row"><input class="og-input" id="gw-ctok" type="password" placeholder="Access key" autocomplete="off" style="flex:1"><button type="button" class="btn" data-gw="addc">Add connection</button></div>
        ${G.err.conn ? `<p role="alert">${E(msg(G.err.conn))}</p>` : ''}</div>`;
  }

  function hostCard() {
    const x = G.ex, live = x && x.configured;
    const steps = a => `<ul class="gw-steps">${a.map(y => `<li><span class="su-dot ${y.ok ? 'ok' : 'warn'}"></span><span><b>${E(y.label)}</b> <small>${E(y.detail)}</small></span></li>`).join('')}</ul>`;
    const body = !x ? '<p class="og-note">Open CaesarOS on this machine to set this up.</p>' : `
      <p class="og-note">For a server you own, reachable over SSH. Needs Tailscale here and your own SSH key there. It forwards one port of this machine to that host. Only the address you type is contacted.</p>
      ${live ? `<p role="status">Connected to ${E(x.host)} on port ${E(x.localPort)}. Health: <b>${E(x.health || 'unknown')}</b></p><div class="og-row"><button type="button" class="btn" data-gw="host-off">Disconnect</button></div>`
        : `<div class="og-row"><input class="og-input" id="gw-hhost" placeholder="user@host" value="${E(G.exHost)}" autocomplete="off" autocapitalize="none" spellcheck="false" ${G.exBusy ? 'disabled' : ''} style="flex:2"><input class="og-input" id="gw-hport" placeholder="${E(x.localPort)}" value="${E(G.exPort)}" inputmode="numeric" autocomplete="off" ${G.exBusy ? 'disabled' : ''} style="flex:1;min-width:90px"><button type="button" class="btn" data-gw="host-on" ${G.exBusy ? 'disabled' : ''}>${G.exBusy ? 'Connecting' : 'Connect'}</button></div>`}
      ${G.err.host ? `<p role="alert">${E(msg(G.err.host))}</p>` : ''}${(G.exBusy || G.err.host || live) && x.steps && (G.exBusy || G.err.host ? x.progress : x.steps).length ? steps(G.exBusy || G.err.host ? x.progress : x.steps) : ''}`;
    return `<div class="og-card"><div class="og-row"><h4>Remote host (optional)</h4><button type="button" class="btn" data-gw="host-toggle" aria-expanded="${G.exOpen}">${G.exOpen ? 'Hide' : 'Show'}</button></div>${G.exOpen ? body : '<p class="og-note">Advanced. Most people never need this.</p>'}</div>`;
  }

  function view() {
    if (!G.loaded) { void load(); return `<div class="og-card"><p>Loading from this device…</p></div>`; }
    return `<div id="gw-root">${sec('Use it from other devices')}${serveCard()}${connCard()}${sec('Advanced')}${hostCard()}</div>`;
  }
  const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };

  async function copy(text, what) { try { await navigator.clipboard.writeText(text); G.copied = what; setTimeout(() => { G.copied = ''; again(); }, 1400); } catch { /* the link is also shown as text */ } again(); }

  document.addEventListener('input', e => { if (e.target.id === 'gw-hhost') G.exHost = e.target.value; if (e.target.id === 'gw-hport') G.exPort = e.target.value; });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-gw]'); if (!b || b.hasAttribute('disabled')) return;
    e.preventDefault(); e.stopPropagation();
    const [k, v] = b.dataset.gw.split(/:(.*)/s); G.err = {};
    if (k === 'reach') {
      if (G.st && G.st.reach === v) return;
      const r = await call('/api/webgate', 'PUT', { reach: v }); G.fresh = null;
      if (r.j && r.j.link) G.fresh = { link: r.j.link, token: r.j.token };
      if (!r.ok && r.j && r.j.error && r.j.error !== 'bind_failed') G.err.serve = r.j.error;
      await load();
    } else if (k === 'rotate') { const r = await call('/api/webgate/rotate', 'POST'); G.fresh = r.j && r.j.link ? { link: r.j.link, token: r.j.token } : null; await load(); }
    else if (k === 'stop') { await call('/api/webgate', 'DELETE'); G.fresh = null; await load(); }
    else if (k === 'copy') { if (G.fresh) await copy(G.fresh.link, 'link'); }
    else if (k === 'addc') {
      const body = { name: val('gw-cname').trim(), url: val('gw-curl').trim() }, tok = val('gw-ctok').trim(); if (tok) body.token = tok;
      const r = await call('/api/gateways', 'POST', body); if (!r.ok) G.err.conn = (r.j && r.j.error) || 'failed'; await load();
    }
    else if (k === 'open') { location.href = '/api/gateways/' + encodeURIComponent(v) + '/open'; }
    else if (k === 'rmc') { await call('/api/gateways/' + encodeURIComponent(v), 'DELETE'); await load(); }
    else if (k === 'host-toggle') { G.exOpen = !G.exOpen; again(); }
    else if (k === 'host-on') {
      const host = G.exHost.trim(), port = parseInt(G.exPort, 10); G.exBusy = true; G.ex = { ...G.ex, progress: [] }; again();
      const t = setInterval(async () => { const x = await call('/api/expose'); if (x.ok && G.exBusy) { G.ex = x.j; if (idle()) again(); } }, 1500);
      const r = await call('/api/expose', 'POST', { host, ...(port > 0 ? { port } : {}) }); clearInterval(t);
      if (!r.ok) G.err.host = (r.j && r.j.error) || 'failed'; G.exBusy = false; await load();
    }
    else if (k === 'host-off') { await call('/api/expose', 'DELETE'); await load(); }
  }, true);
  // devices come and go: look again now and then while the page is on screen
  setInterval(() => { if (document.getElementById('gw-root') && G.st && G.st.listening && idle() && !document.hidden) void load(); }, 10000);

  window.GW = { view, load };
})();
