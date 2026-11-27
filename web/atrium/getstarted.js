/* Get started: six first steps, ticked from what the core really holds (/api/get-started). One button per step opens
   the page where it happens. "Hide from menu" only removes the menu entry; Find anything always opens the page. */
(() => {
  const NAME = 'Get started';
  const COPY = {
    engine: ['Wake an engine', 'Something on this machine has to be able to answer.', 'Set up an engine', 'Start'],
    model: ['Have a model ready', 'An engine needs a model it can run or reach.', 'Open Models', 'Models'],
    chat: ['Send your first message', 'Say hello. The tick appears once your message is saved.', 'Open Chat', 'Chat'],
    note: ['Write your first note', 'Notes are plain files the crew can read from.', 'Open Notes', 'Memory'],
    device: ['Pair a second device', 'A one-time code joins your phone or another computer.', 'Open Devices', 'Devices'],
    backup: ['Take a backup', 'One consistent copy of settings, chats and keys. Notes stay as their own files.', 'Open backup', 'Devices']
  };
  const D = { data: null, err: false, busy: false, at: 0, saveErr: false };
  const on = () => (S.tabs[S.act] || {}).id === NAME;
  let drawn = '';

  async function load() {
    if (D.busy) return;
    D.busy = true;
    try {
      const r = await fetch('/api/get-started'); if (!r.ok) throw 0;
      const j = await r.json(); if (!Array.isArray(j.steps)) throw 0;
      D.data = j; D.err = false;
    } catch { D.err = true; }
    D.busy = false; D.at = Date.now();
    const now = JSON.stringify([D.data, D.err]);   // redraw only on a change, so a quiet re-check never moves the page
    if (now !== drawn) { drawn = now; render(); }
  }

  const btn = (k, label, ghost) => `<button type="button" class="btn${ghost ? ' ghost' : ''}" data-gs="${k}">${OGE(label)}</button>`;
  const shell = inner => `<div class="nx-view enter gsx">${nsHead(NAME, 'Your first steps. A tick appears only when the thing is really there.', 'Tirocinium', 'atrium-hero')}<div class="og-wrap">${inner}</div></div>`;

  function view() {
    if (Date.now() - D.at > 5000) setTimeout(load, 0);
    if (!D.data) {
      if (D.err) return shell(`${ARTSTATE('error', 'The checklist could not be read', 'The core did not answer. Nothing was changed.')}<div class="og-row">${btn('retry', 'Try again')}</div>`);
      return shell(`<div class="gs-list" role="status" aria-label="Checking this device">${'<i class="vz-skel gs-skel"></i>'.repeat(6)}</div>`);
    }
    const { steps, done, total, allDone, dismissed } = D.data;
    const next = steps.find(s => s.done !== true);
    const rows = steps.map(s => {
      const [title, why, label] = COPY[s.id];
      const state = s.done === true ? 'Done' : s.done === null ? 'Could not check' : 'To do';
      return `<li class="gs-step ${s.done === true ? 'done' : ''} ${next === s ? 'next' : ''}"><span class="gs-tick" aria-hidden="true">${s.done === true ? I('check', 18) : ''}</span><div class="gs-text"><h4>${title}</h4><p>${why}</p></div><span class="gs-state">${state}</span>${btn('go:' + s.id, label, next !== s)}</li>`;
    }).join('');
    return shell(`
      <div class="og-card gs-sum"><div class="og-row"><h4>${done} of ${total} done</h4></div>${vzSeg(done / total * 100, allDone ? 's' : 'a', total * 4)}</div>
      ${D.err ? `<p class="gs-warn" role="alert">The last check failed, so these ticks may be old. ${btn('retry', 'Try again', true)}</p>` : ''}
      ${allDone ? ARTSTATE('empty', 'All six are done', 'CaesarOS is ready for daily work.') : ''}
      <ol class="gs-list">${rows}</ol>
      <div class="gs-foot">${dismissed ? `<p>Hidden from the menu. Find anything still opens this page.</p>${btn('show', 'Show in menu again')}` : `<p>Done with it? Hide it from the menu. Find anything still opens this page.</p>${btn('hide', 'Hide from menu', true)}`}${btn('retry', 'Check again', true)}</div>
      ${D.saveErr ? '<p class="gs-warn" role="alert">That choice could not be saved.</p>' : ''}`);
  }

  // shown only once the core has said it is not dismissed, so a hidden entry never flashes in
  window.GS = { inMenu: () => !!D.data && !D.data.dismissed };
  register({ id: 'get-started', views: { [NAME]: view } });
  APPS.System.push([NAME, 'Tirocinium', 'check']);   // Find anything lists every entry of APPS

  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-gs]'); if (!t) return;
    const [k, id] = t.dataset.gs.split(':');
    if (k === 'go') { open_({ k: 'app', id: COPY[id][3] }); render(); }
    else if (k === 'retry') { drawn = ''; await load(); }
    else {
      const r = await fetch('/api/get-started', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dismissed: k === 'hide' }) }).catch(() => null);
      D.saveErr = !(r && r.ok);
      if (!D.saveErr) D.data.dismissed = k === 'hide';
      render();
    }
  });
  // the menu entry needs the dismissed flag at start
  void load();
})();
