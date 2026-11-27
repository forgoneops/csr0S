/* System notifications on this device: when a reply arrives or something waits for approval while CaesarOS is not in
   front. Off until switched on. Local only: no push service, so nothing arrives once the app is closed. The text never
   carries chat content, because it can show on a lock screen. */
(() => {
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // test stubs
  const KEY = 'caesaros-notify';
  const N = { msg: '' };
  const supported = () => 'Notification' in window;
  const wanted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  const on = () => supported() && wanted() && Notification.permission === 'granted';
  const away = () => document.hidden || !document.hasFocus();

  async function show(body, chat) {
    const opts = { body, icon: '/icons/icon-192.png', tag: 'caesaros-' + (chat || 'approval') };
    try {
      const n = new Notification('CaesarOS', opts);
      n.onclick = () => { window.focus(); if (chat && THR(chat)) { open_({ k: 'chat', id: chat }); render(); } n.close(); };
      return true;
    } catch {   // some phones only let the service worker show one
      try { const reg = await navigator.serviceWorker.ready; await reg.showNotification('CaesarOS', opts); return true; } catch { return false; }
    }
  }

  document.addEventListener('cx:turn-done', e => { if (on() && away()) void show('A reply has arrived.', e.detail && e.detail.id); });
  let seen = null;   // approvals already waiting when the page opened are not news
  setInterval(() => {
    if (!on()) { seen = null; return; }
    const ids = S.waiting.map(w => w.k);
    if (seen && away() && ids.some(k => !seen.has(k))) void show('Something is waiting for your approval.');
    seen = new Set(ids);
  }, 5000);

  window.xNotify = {
    card() {
      if (!supported()) return `<p class="su-note">${window.isSecureContext ? 'This browser cannot show system notifications.' : 'System notifications need a secure address: open CaesarOS on this machine or over https.'}</p>`;
      const blocked = Notification.permission === 'denied';
      return `<div class="gx gx-perm"><p class="su-note">A notice from this device when a reply arrives or something waits for your approval while CaesarOS is in the background. It works while the app is open; nothing is pushed through an outside service.</p>
        <div class="og-row"><button type="button" class="su-btn" data-notify="toggle" aria-pressed="${on()}" ${blocked ? 'disabled' : ''}>${on() ? 'Notifications: on' : 'Notifications: off'}</button><button type="button" class="su-btn" data-notify="test" ${on() ? '' : 'disabled'}>Send a test</button></div>
        ${blocked ? '<p class="gx-warn" role="alert">This browser has blocked notifications for CaesarOS. Allow them in its site settings, then come back.</p>' : ''}${N.msg ? `<p class="su-note" role="status">${esc(N.msg)}</p>` : ''}</div>`;
    },
  };
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-notify]'); if (!b || b.disabled) return;
    e.preventDefault(); e.stopPropagation(); N.msg = '';
    if (b.dataset.notify === 'test') N.msg = (await show('This is a test.')) ? 'Sent. If nothing appeared, check the system settings for notifications.' : 'This browser refused to show it.';
    else {
      const turnOn = !on();
      if (turnOn && Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') N.msg = 'Permission was not given, so notifications stay off.';
      try { localStorage.setItem(KEY, turnOn && Notification.permission === 'granted' ? '1' : '0'); } catch { N.msg = 'This browser does not keep the choice.'; }
    }
    render();
  }, true);
})();
