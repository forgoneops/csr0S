/* Permissions in Settings: what this browser or window lets CaesarOS use, what each permission is for, and a button to
   ask for the ones not decided yet. Only the permissions the app really uses are listed. */
(() => {
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // test stubs
  const stopAll = s => s.getTracks().forEach(t => t.stop());
  const ITEMS = [
    { id: 'microphone', name: 'Microphone', why: 'Dictation and voice mode.', have: () => !!navigator.mediaDevices,
      ask: async () => stopAll(await navigator.mediaDevices.getUserMedia({ audio: true })) },   // asked, then switched straight off
    { id: 'notifications', name: 'Notifications', why: 'A notice when a reply or an approval is waiting.', have: () => 'Notification' in window,
      ask: () => Notification.requestPermission() },
    { id: 'persistent-storage', name: 'Keep stored data', why: 'Stops the browser clearing imported gallery items when space runs low.', have: () => !!(navigator.storage && navigator.storage.persist),
      ask: () => navigator.storage.persist() },
  ];
  const P = { states: null, msg: '', busy: '' };
  const WORD = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not asked yet', unknown: 'This browser does not say', none: 'Not available here' };

  async function stateOf(it) {
    if (!it.have()) return 'none';
    if (it.id === 'notifications') return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    try {
      if (it.id === 'persistent-storage' && (await navigator.storage.persisted())) return 'granted';
      return (await navigator.permissions.query({ name: it.id })).state;
    } catch { return 'unknown'; }
  }
  async function load() {
    const next = Object.fromEntries(await Promise.all(ITEMS.map(async it => [it.id, await stateOf(it)])));
    if (JSON.stringify(next) !== JSON.stringify(P.states)) { P.states = next; render(); }
  }

  window.xPermissions = {
    card() {
      setTimeout(load, 0);   // read again on every draw; it redraws only when something changed
      if (!P.states) return '<p class="su-note" role="status">Asking this browser…</p>';
      const rows = ITEMS.map(it => {
        const s = P.states[it.id], can = s === 'prompt' || s === 'unknown';
        return `<li><b>${it.name}</b><span class="gx-state ${s}">${WORD[s]}</span><span>${it.why}${s === 'denied' ? ' To change this, allow it in the settings of your browser or system for this app.' : ''}</span>${can ? `<button type="button" class="su-btn" data-perm="${it.id}" ${P.busy ? 'disabled' : ''}>${P.busy === it.id ? 'Waiting…' : 'Ask now'}<span class="gx-sr"> for ${it.name}</span></button>` : ''}</li>`;
      }).join('');
      return `<div class="gx gx-perm"><p class="su-note">What this browser or window lets CaesarOS use on this device.</p>
        ${window.isSecureContext ? '' : '<p class="gx-warn" role="alert">This address is not secure, so the browser withholds the microphone and notifications. Open CaesarOS on this machine or over https.</p>'}
        <ul class="gx-out">${rows}</ul>${P.msg ? `<p class="su-note" role="status">${esc(P.msg)}</p>` : ''}</div>`;
    },
  };
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-perm]'); if (!b || P.busy) return;
    e.preventDefault(); e.stopPropagation();
    const it = ITEMS.find(x => x.id === b.dataset.perm); if (!it) return;
    P.busy = it.id; P.msg = ''; render();
    try { await it.ask(); } catch { P.msg = `${it.name} was not allowed.`; }
    P.busy = '';
    const now = await stateOf(it); P.states = { ...P.states, [it.id]: now };
    if (!P.msg && now !== 'granted') P.msg = `${it.name} is still not allowed. The browser may decide without asking.`;
    render();
  }, true);
})();
