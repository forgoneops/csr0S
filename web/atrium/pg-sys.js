/* System and misc pages as Evolved visuals: Updates, Mirror, Meetings, News, Image Studio (Fleet is business.js).
   Data and actions stay in real.js (its state is shared through window.xSys); this file adds the art-header page look on top:
   stat tiles and bars from viz.js, an honest empty or error state (while loading, real.js's skeleton shows; Updates has its own). Colours come from tokens only. */
(() => {
  const S = window.xSys, E = s => OGE(s);
  const orig = {};
  const NAMES = ['Updates', 'Mirror', 'Meetings', 'News', 'Image Studio'];
  NAMES.forEach(n => { orig[n] = OG[n]; });
  const sk = () => `<div class="ps ps-sk" role="status" aria-label="Loading"><div class="vz-tiles">${[0, 1, 2, 3].map(() => '<div class="ps-skt"><i></i><i></i></div>').join('')}</div><div class="ps-skb"></div></div>`;
  const page = (hd, body) => `<div class="nx-view enter">${hd}<div class="og-wrap">${body}</div></div>`;
  const UPHEAD = () => ogHead('Updates', 'The versions on this machine. CaesarOS never checks for updates by itself and never installs one without you.', 'Novitates');
  /* put `block` right after the page header */
  const SRC = { Mirror: ['/api/mirror', () => { S.MR.d = null; }], Meetings: ['/api/notes', () => { S.MT.list = null; }], News: ['/api/lists/feeds', () => { S.NW.feeds = null; }], 'Image Studio': ['/api/image', () => { S.IM.d = null; }] };
  const seen = {};   // name -> true when its source answers
  const probe = async n => { let ok = false; try { ok = (await fetch(SRC[n][0])).ok; } catch { /* unreachable */ } seen[n] = ok; if (!ok) S.again(); };
  const dress = (name, block, strip) => {
    if (!(name in seen)) { seen[name] = true; void probe(name); }
    let h = orig[name]();
    if (!seen[name]) return h.replace(/<div class="og-wrap">[\s\S]*<\/div><\/div>$/, `<div class="og-wrap"><div class="ps">${err(name + ' could not be loaded', 'This CaesarOS did not answer, or this device is not allowed to read it.')}<div class="og-row"><button class="btn" data-ps="retry:${name}">Try again</button></div></div></div></div>`);
    if (strip) h = h.replace(strip, '');
    return h.replace('<div class="og-wrap">', `<div class="og-wrap"><div class="ps">${block}</div>`);
  };
  /* the build this page opened with; Check only compares against it, Apply (after a confirm) reloads onto the new one */
  const UP = { boot: null, next: null, note: '', sure: false };
  const version = async () => { try { const r = await fetch('/api/version'); return r.ok ? await r.json() : null; } catch { return null; } };
  void version().then(v => { UP.boot = v && v.build; });
  async function check() {
    const v = await version(); UP.sure = false; UP.next = null;
    if (!v) UP.note = 'The check failed: this CaesarOS did not answer.';
    else if (UP.boot && v.build !== UP.boot) { UP.next = v.build; UP.note = 'Build ' + v.build + ' is ready on this computer. Apply reloads this page onto it.'; }
    else UP.note = 'Nothing new on this computer. This page already runs build ' + v.build + '.';
    if (v && S.HL.d) S.HL.d.ver = v;
    S.again();
  }
  const kb = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const err = (t, x) => ARTSTATE('error', t, x);

  const updatesBody = () => {
    const { det, ver } = S.HL.d || { det: { engines: [] }, ver: {} };
    if (!ver.version) return err('Version unknown', 'This CaesarOS did not answer.') + '<div class="og-row"><button class="btn" data-ps="reread">Try again</button></div>';
    const up = ver.startedAt ? Math.max(1, Math.round((Date.now() - ver.startedAt) / 60000)) : 0, found = det.engines.filter(x => x.found).length;
    return vzTiles([vzTile('Installed', ver.version, 'this computer', 'a'), vzTile('Build', String(ver.build || '?').slice(0, 7), 'what is running', 's'), vzTile('Running for', up ? (up < 120 ? up + ' min' : Math.round(up / 60) + ' h') : '-', 'since the last start', 'g'), vzTile('Tools found', found + ' / ' + det.engines.length, 'with their own versions', 'm')])
      + vzBars(det.engines.map(x => [x.label, x.found ? (x.probe.ok ? 100 : 45) : 0, x.found ? (x.probe.ok ? x.probe.version || 'answers' : 'not answering') : 'absent', x.probe.ok ? 's' : 'g']))
      + `<div class="og-card ps-act"><h4>Check and apply</h4><p>Checking is a button, never automatic. It asks only this CaesarOS whether the files it serves changed since this page opened. No release channel is set up, so nothing is downloaded.</p>${UP.note ? `<p role="status">${E(UP.note)}</p>` : ''}<div class="og-row"><button class="btn" data-ps="check">Check only</button>${UP.sure ? '<button class="btn" data-ps="applygo">Confirm: reload now</button><button class="btn ghost" data-ps="cancel">Cancel</button>' : `<button class="btn ghost" data-ps="apply" ${UP.next ? '' : 'disabled'}>Apply</button>`}</div></div>`;
  };
  const updates = () => {
    if (!S.HL.d) { orig.Updates(); return page(UPHEAD(), sk()); }   // the old view starts the one shared load
    return page(UPHEAD(), `<div class="ps">${updatesBody()}<p class="og-note">Update each tool with its own command (for example your package manager); they keep their own sign-in.</p></div>`);
  };

  const V = {
    Updates: updates,
    Mirror: () => dress('Mirror', (() => {
      const d = S.MR.d; if (!d) return '';
      if (!d.length) return vzEmpty('No crew profiles found', 'Hermes keeps one profile per crew member. None exists on this computer yet.');
      const top = Math.max(1, ...d.map(x => x.memoryBytes)), skills = d.reduce((n, x) => n + x.skills, 0), tot = d.reduce((n, x) => n + x.memoryBytes, 0);
      return vzTiles([vzTile('Profiles', d.length, 'crew members', 'a'), vzTile('Skills carried', skills, 'across all profiles', 's'), vzTile('Memory kept', kb(tot), 'sizes only, never the text', 'g'), vzTile('Open tasks', (S.MR.k || []).filter(t => t.status !== 'done').length, 'on the crew kanban', 'm')])
        + vzBars(d.map(x => [x.name, x.memoryBytes / top * 100, kb(x.memoryBytes), 'a']));
    })(), /<div class="og-grid"><div class="og-card"><h4>[^<]*<\/h4><p>[^<]*<\/p><\/div>(?:<div class="og-card"><h4>[^<]*<\/h4><p>[^<]*<\/p><\/div>){2}<\/div>/),
    Meetings: () => dress('Meetings', (() => {
      const l = S.MT.list; if (!l) return '';
      const by = {}; l.forEach(n => { const m = n.id.slice(8, 15); by[m] = (by[m] || 0) + 1; });
      const ms = Object.keys(by).sort().slice(-6), last = l.map(n => n.id.slice(8, 18)).sort().pop();
      return vzTiles([vzTile('Meeting notes', l.length, 'one note each', 'a'), vzTile('Latest', last || '-', last ? 'date of the newest' : 'none yet', 's'), vzTile('Transcription', S.MT.tr.ready ? 'Ready' : 'Missing', S.MT.tr.ready ? 'runs on this computer' : 'not installed here', S.MT.tr.ready ? 'g' : 'd')])
        + (ms.length ? vzBars(ms.map(m => [m, by[m] / Math.max(...ms.map(k => by[k])) * 100, by[m] + (by[m] === 1 ? ' meeting' : ' meetings'), 'a'])) : vzEmpty('No meetings yet', 'Make a note for the next one below, or transcribe a recording.'));
    })(), /<div class="og-sec">Your meeting notes<\/div><div class="og-list"><div style="display:block"><span>No meeting notes yet.<\/span><\/div><\/div>/),
    News: () => dress('News', (() => {
      const f = S.NW.feeds; if (!f) return '';
      if (!f.length) return vzEmpty('No feeds yet', 'Add an RSS or Atom address below. Nothing is fetched until you press Refresh.');
      const n = id => (Array.isArray(S.NW.items[id]) ? S.NW.items[id].length : 0), bad = f.filter(x => S.NW.items[x.id] === null).length, got = f.reduce((a, x) => a + n(x.id), 0);
      return vzTiles([vzTile('Feeds', f.length, 'added by you', 'a'), vzTile('Headlines', got, got ? 'loaded now' : 'press Refresh', 's'), vzTile('Failed', bad, bad ? 'not public or not a feed' : 'none', bad ? 'd' : 'g')])
        + vzBars(f.map(x => [x.text.replace(/^https?:\/\//, '').slice(0, 28), n(x.id) / Math.max(1, ...f.map(y => n(y.id))) * 100, S.NW.items[x.id] === null ? 'failed' : n(x.id) + ' items', S.NW.items[x.id] === null ? 'd' : 'a']));
    })(), /<div class="og-list"><div style="display:block"><span>No feeds yet[^<]*<\/span><\/div><\/div>/),
    'Image Studio': () => dress('Image Studio', (() => {
      const d = S.IM.d; if (!d) return '';
      const run = d.job && d.job.status === 'running', bad = d.job && d.job.status === 'error', sz = {}; d.pics.forEach(p => { sz[p.size] = (sz[p.size] || 0) + 1; });
      return vzTiles([vzTile('Engine', d.ready ? 'Ready' : 'Missing', d.ready ? 'draws on this computer' : 'not installed here', d.ready ? 's' : 'd'), vzTile('Pictures', d.pics.length, 'kept on this computer', 'a'), vzTile('Now', run ? 'Drawing' : bad ? 'Failed' : 'Idle', run ? 'one at a time' : bad ? 'the last picture' : 'nothing queued', run ? 'g' : bad ? 'd' : 'm')])
        + (d.pics.length ? vzStack(Object.keys(sz).sort().map((k, i) => [k + ' px', sz[k], ['a', 's', 'g'][i % 3]])) : '')
        + (run || !d.pics.length ? `<div class="og-grid ps-slots">${run ? '<div class="ps-slot run" role="status" aria-label="Drawing"></div>' : ''}${d.pics.length ? '' : vzEmpty('No pictures yet', d.ready ? 'Describe one below and press Make it.' : 'Local image generation is not installed on this computer.')}</div>` : '');
    })(), /<div class="og-sec">Your pictures<\/div><div class="og-list"><div style="display:block"><span>No pictures yet.<\/span><\/div><\/div>/),
  };

  const mirror = V.Mirror;
  V.Mirror = () => { const h = mirror(); return S.MR.d && !S.MR.d.length && seen.Mirror ? h.replace(/<div class="og-sec">Per profile[\s\S]*?(?=<div class="og-sec">Curator)/, '') : h; };
  /* without an engine the page has one thing to do: look again */
  const studio = V['Image Studio'];
  V['Image Studio'] = () => studio().replace('<div class="og-card"><p>Local image generation is not installed on this computer.</p></div>', '<div class="og-row"><button class="btn" data-ps="imagain">Check again</button></div>');

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ps]'); if (!b) return;
    const k = b.dataset.ps;
    if (k.startsWith('retry:')) { const n = k.slice(6); delete seen[n]; SRC[n][1](); S.again(); }
    else if (k === 'reread') { S.HL.d = null; S.again(); }
    else if (k === 'imagain') { S.IM.d = null; S.again(); }
    else if (k === 'check') void check();
    else if (k === 'apply' || k === 'cancel') { UP.sure = k === 'apply'; S.again(); }
    else if (k === 'applygo') location.reload();
  });
  register({ id: 'pg-sys', views: V });
})();
