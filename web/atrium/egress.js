/* "Where it can connect" in Settings: each outbound destination this install has, from /api/egress. */
(() => {
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // test stubs
  const E = { d: null, err: '', busy: false, at: 0 };
  async function load() {
    if (E.busy) return;
    E.busy = true;
    try {
      const r = await fetch('/api/egress');
      if (r.ok) { E.d = await r.json(); E.err = ''; } else E.err = r.status === 403 ? 'Only the owner of this app can see this.' : 'The list could not be read.';
    } catch { E.err = 'The core did not answer.'; }
    E.busy = false; E.at = Date.now(); render();
  }
  const ORDER = ['internet', 'set by the tool', 'your network', 'this machine'];
  const TITLE = { internet: 'On the internet', 'set by the tool': 'Through a tool you use', 'your network': 'On your own network', 'this machine': 'On this machine' };
  window.xEgress = {
    card() {
      if (Date.now() - E.at > 30000) setTimeout(load, 0);
      const again = `<button type="button" class="su-btn" data-egress="again" ${E.busy ? 'disabled' : ''}>${E.busy ? 'Reading…' : 'Read again'}</button>`;
      if (E.err) return `<div class="gx gx-perm"><p class="gx-warn" role="alert">${esc(E.err)}</p><div class="og-row">${again}</div></div>`;
      if (!E.d) return '<p class="su-note" role="status">Reading what is set up…</p>';
      const group = reach => {
        const rows = E.d.destinations.filter(x => x.reach === reach);
        return rows.length ? `<h4>${TITLE[reach]} <small>${rows.length}</small></h4><ul class="gx-out">${rows.map(x => `<li><b>${x.what.includes(': ') ? `<span>${esc(x.what.split(': ')[0])}</span>: <span data-no-i18n>${esc(x.what.slice(x.what.indexOf(': ') + 2))}</span>` : esc(x.what)}</b><code data-no-i18n>${esc(x.host)}</code><span>${esc(x.when)}</span></li>`).join('')}</ul>` : '';
      };
      return `<div class="gx gx-perm"><p class="su-note">The addresses CaesarOS has saved, and the services it calls when you press something. It is a list of destinations, not a record of traffic. Not listed: an SSH host you enter to set up forwarding. Tools you run yourself, in the terminal or as an engine, can connect elsewhere.</p>
        <p class="su-note">${E.d.localOnly ? 'Local only is on: chat answers stay on local engines. The other entries here still work when you use them.' : 'Local only is off: chat may use cloud engines.'}</p>${ORDER.map(group).join('')}<div class="og-row">${again}</div></div>`;
    },
  };
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-egress]'); if (!b) return; e.preventDefault(); e.stopPropagation(); void load(); render(); }, true);
})();
