/* Studio: the optional workspace for Social desk, Reels and Offer Boards. Code only, every page starts empty, each app has its own switch.
   Nothing here posts anything. Records live on this device (localStorage); Offer Board photos live in this tab only and never leave the browser. */
(() => {
  const L = STL, E = OGE, K = 'cx-studio-v1';
  const blank = () => ({ tab: { Social: 'Pipeline' }, social: { items: [], rules: { ...L.RULES } }, reels: [], boards: [], board: '' });
  let S; try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(K) || '{}')); } catch { S = blank(); }
  S.social.rules = { ...L.RULES, ...S.social.rules };
  const save = () => { try { localStorage.setItem(K, JSON.stringify(S)); } catch (_) {} };
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const PH = {};   // board id -> photos held in memory: { name, img, w, h }
  const M = { msg: '', sure: '' };
  const val = i => (document.getElementById(i) || {}).value || '';
  const btn = (k, t, x = '') => `<button class="btn ${x.includes('ghost') ? 'ghost' : ''}" data-sd="${E(k)}" ${x.replace('ghost', '')}>${E(t)}</button>`;
  const note = () => (M.msg ? `<p role="status" class="sd-note">${E(M.msg)}</p>` : '');
  const off = (name, text) => `<div class="og-card"><h4>${E(name)} is off</h4><p>${E(text)}</p><div class="og-act"><span></span><button class="btn" data-og="mod:${E(name)}">Turn on</button></div></div>`;
  const shell = (name, sub, la, sc, body) => `<div class="nx-view enter sdx">${nsHead(name, sub, la, sc)}<div class="og-wrap">${ogEnabled(name) ? body : off(name, 'It starts empty and stores nothing until you use it.')}</div></div>`;
  const tabs = (m, list) => ogSegSt(m, list, S.tab[m] || list[0]);
  const ogSegSt = (m, list, cur) => `<div class="og-seg">${list.map(o => `<button class="${o === cur ? 'on' : ''}" data-sd="tab:${m}|${E(o)}">${E(o)}</button>`).join('')}</div>`;

  /* ---------- Studio overview ---------- */
  const APPS = [['Social', 'Agora', 'A signal becomes a brief, then a draft you approve. Never posts.'], ['Reels', 'Cinema', 'Short vertical video in six stages, each approved by you, with a QC check.'], ['Offer Boards', 'Tabulae', 'Compose a board from your photos in the browser and export a PNG.']];
  const studio = () => `<div class="nx-view enter sdx">${nsHead('Studio', 'Optional tools for making and showing things. Each one has its own switch and starts empty.', 'Officina', 'studio')}<div class="og-wrap"><div class="og-grid">${APPS.map(([n, la, d]) => `<div class="og-card"><div class="og-row"><h4>${n}</h4><span class="label" style="margin-left:auto">${la}</span></div><p>${d}</p><div class="og-act"><button class="btn ghost" data-og="mod:${n}" aria-pressed="${ogEnabled(n)}">${ogEnabled(n) ? 'On' : 'Off'}</button><button class="btn" data-ogopen="${n}" ${ogEnabled(n) ? '' : 'disabled'}>Open</button></div></div>`).join('')}</div></div></div>`;

  /* ---------- Social desk ---------- */
  const social = () => {
    const sc = S.social, t = S.tab.Social || 'Pipeline';
    let b = '';
    if (t === 'Pipeline') {
      b = `<div class="og-card"><div class="og-row"><input class="og-input" id="sd-sig" placeholder="A signal: something worth a post" style="flex:1" maxlength="400"><input class="og-input" id="sd-src" placeholder="Source (a link or a name)" style="flex:1" maxlength="200">${btn('sadd', 'Add signal')}</div>${note()}</div>`
        + (sc.items.length ? '' : vzEmpty('No signals yet', 'Add one above. Signals, briefs, drafts and approved posts sit in four lanes. Nothing is ever posted from here.'))
        + `<div class="pg-lanes">${L.LANES.map(ln => { const cs = sc.items.filter(x => x.lane === ln); return `<div class="pg-lane"><h5>${ln}<span>${cs.length}</span></h5>${cs.length ? '' : '<div class="pg-slot"></div>'}${cs.map(c => card(c)).join('')}</div>`; }).join('')}</div>`;
    } else if (t === 'Roles') {
      b = `<div class="og-grid">${[['Scout', 'Collects signals from sources you name. Adds to Signals only.'], ['Strategist', 'Turns a signal into a brief: angle, audience, one line of why.'], ['Writer', 'Drafts the text from the brief. A draft is never final.'], ['You', 'Approve. The last lane is yours alone, and the only way out of it is copying the text yourself.']].map(([n, d]) => `<div class="og-card"><h4>${n}</h4><p>${d}</p></div>`).join('')}</div>`;
    } else {
      const r = sc.rules;
      b = `<div class="og-card"><h4>Rules every draft is checked against</h4><div class="og-row"><label class="label" for="sd-max">Longest text (characters)</label><input class="og-input" id="sd-max" type="number" min="0" value="${+r.max || 0}" style="width:110px"></div><div class="og-row"><button class="btn ghost" data-sd="dash" aria-pressed="${!!r.dash}">Allow long dashes: ${r.dash ? 'yes' : 'no'}</button></div><label class="label" for="sd-ban">Banned phrases, one per line</label><textarea class="og-input" id="sd-ban" rows="4" maxlength="2000" style="width:100%">${E(r.banned)}</textarea><div class="og-row">${btn('rsave', 'Save rules')}</div>${note()}<p>Always checked, whatever you set: keys and passwords, private addresses, paths from this computer.</p></div>`;
    }
    return `<div class="pg-bar">${tabs('Social', ['Pipeline', 'Roles', 'Rules'])}<span style="flex:1"></span></div>${b}`;
  };
  const card = c => {
    const f = c.lane === 'Drafts' ? L.lint(c.text, S.social.rules) : [], i = L.LANES.indexOf(c.lane), edit = c.lane === 'Briefs' || c.lane === 'Drafts';
    return `<div class="og-card"><h4 style="font-size:13px">${E(c.src || c.lane)}</h4>${edit ? `<textarea class="og-input" id="sd-t-${c.id}" rows="4" maxlength="2000" style="width:100%" aria-label="Text">${E(c.text)}</textarea>` : `<p>${E(c.text)}</p>`}
      ${f.length ? `<ul class="sd-lint">${f.map(x => `<li>${E(x)}</li>`).join('')}</ul>` : c.lane === 'Drafts' && c.text.trim() ? '<span class="og-tag sig">Passes the rules</span>' : ''}
      <div class="og-act">${i > 0 ? btn('smv:' + c.id + '|-1', 'Back', 'ghost') : '<span></span>'}<span class="og-row">${edit ? btn('ssave:' + c.id, 'Save text', 'ghost') : ''}${c.lane === 'Approved' ? btn('scopy:' + c.id, 'Copy text') : i < 3 ? btn('smv:' + c.id + '|1', i === 2 ? 'Approve' : 'To ' + L.LANES[i + 1].toLowerCase().replace(/s$/, '')) : ''}${M.sure === c.id ? btn('sdelgo:' + c.id, 'Delete for good') : btn('sdel:' + c.id, 'Delete', 'ghost')}</span></div></div>`;
  };

  /* ---------- Reels ---------- */
  const reels = () => {
    const q = r => r.stage === 'Review' || r.stage === 'Delivery';
    return `<div class="og-card"><div class="og-row"><input class="og-input" id="sd-rt" placeholder="The reel (a working title)" style="flex:1" maxlength="120"><input class="og-input" id="sd-rs" type="number" min="1" placeholder="Planned seconds" style="width:140px">${btn('radd', 'New reel')}</div>${note()}<p>Agents may prepare a stage. Only you approve it, and nothing is posted from here.</p></div>`
      + (S.reels.length ? S.reels.map(r => { const gate = L.reelGate(r), qr = L.reelQc(r), dl = L.reelDeliver(r);
        return `<div class="og-card"><div class="og-row"><h4>${E(r.title)}</h4><span class="og-tag ${r.delivered ? 'sig' : 'mut'}">${r.delivered ? 'Delivered' : r.stage}</span></div>
          <div class="sd-rail" role="list">${L.STAGES.map(s => `<span role="listitem" class="sd-step ${s === r.stage ? 'on' : ''} ${(r.ok || {})[s] ? 'done' : ''}">${E(s)}${(r.ok || {})[s] ? ' ✓' : ''}</span>`).join('')}</div>
          ${q(r) ? `<div class="sd-qc"><h5 class="label">QC view: measured from the file</h5><div class="og-row"><input class="og-input" id="sd-w-${r.id}" type="number" placeholder="Width" value="${(r.qc || {}).w || ''}" style="width:90px"><input class="og-input" id="sd-h-${r.id}" type="number" placeholder="Height" value="${(r.qc || {}).h || ''}" style="width:90px"><input class="og-input" id="sd-d-${r.id}" type="number" step="0.1" placeholder="Seconds" value="${(r.qc || {}).dur || ''}" style="width:90px"><button class="btn ghost" data-sd="rsnd:${r.id}" aria-pressed="${!!(r.qc || {}).audio}">Sound: ${(r.qc || {}).audio ? 'yes' : 'no'}</button>${btn('rqc:' + r.id, 'Run QC')}</div>${qr ? `<ul class="sd-checks">${qr.checks.map(c => `<li class="${c.ok ? 'ok' : 'bad'}"><b>${c.ok ? 'Pass' : 'Fail'}</b> ${E(c.name)} <small>${E(c.detail)}</small></li>`).join('')}</ul>` : '<p>Not run yet. Review cannot pass without it.</p>'}</div>` : ''}
          <p class="sd-gate">${r.delivered ? 'Delivered. The file is yours to send.' : r.stage === 'Delivery' ? (dl.ok ? 'Everything is approved and QC passed.' : E(dl.why)) : gate.ok ? 'Approved. You can move on.' : E(gate.why)}</p>
          <div class="og-act"><span class="og-row">${btn('rback:' + r.id, 'Back', 'ghost' + (L.STAGES.indexOf(r.stage) ? '' : ' disabled'))}${M.sure === r.id ? btn('rdelgo:' + r.id, 'Delete for good') : btn('rdel:' + r.id, 'Delete', 'ghost')}</span><span class="og-row">${r.delivered ? '' : btn('rok:' + r.id, (r.ok || {})[r.stage] ? 'Take approval back' : 'Approve ' + r.stage, 'ghost')}${r.stage === 'Delivery' ? (r.delivered ? '' : btn('rdone:' + r.id, 'Mark delivered', dl.ok ? '' : 'disabled')) : btn('rnext:' + r.id, 'Next stage', gate.ok ? '' : 'disabled')}</span></div></div>`; }).join('')
        : vzEmpty('No reels yet', 'Name the first one above. It moves through direction, script, materials, takes, review and delivery, and only when you say so.'));
  };

  /* ---------- Offer Boards ---------- */
  const board = () => {
    const bs = S.boards, b = bs.find(x => x.id === S.board) || bs[0];
    const head = `<div class="og-card"><div class="og-row"><input class="og-input" id="sd-bt" placeholder="A board title (e.g. the offer)" style="flex:1" maxlength="80">${btn('badd', 'New board')}</div>${note()}<p>Photos stay in this browser tab. Nothing is uploaded, and they are not kept after you close it.</p></div>`;
    if (!b) return head + vzEmpty('No boards yet', 'Make a board, add photos, pick a layout, export a PNG.');
    const ph = PH[b.id] || [];
    return head + `<div class="pg-bar">${bs.map(x => `<button class="btn ${x.id === b.id ? '' : 'ghost'}" data-sd="bsel:${x.id}" aria-pressed="${x.id === b.id}">${E(x.title || 'Untitled')}</button>`).join('')}</div>
      <div class="sd-ob"><div class="og-card sd-edit"><label class="label" for="sd-ti">Title</label><input class="og-input" id="sd-ti" value="${E(b.title)}" maxlength="80"><label class="label" for="sd-pr">Price</label><input class="og-input" id="sd-pr" value="${E(b.price)}" maxlength="40"><label class="label" for="sd-li">Lines, one per row</label><textarea class="og-input" id="sd-li" rows="5" maxlength="600">${E(b.lines)}</textarea>
        <span class="label">Size</span><div class="og-seg">${Object.entries(L.PRESETS).map(([k, v]) => `<button class="${b.preset === k ? 'on' : ''}" data-sd="bset:preset|${k}">${v[2]}</button>`).join('')}</div>
        <span class="label">Layout</span><div class="og-seg">${L.LAYOUTS.map(k => `<button class="${b.layout === k ? 'on' : ''}" data-sd="bset:layout|${E(k)}">${E(k)}</button>`).join('')}</div>
        <div class="og-row">${btn('bsave', 'Save text')}<label class="btn ghost sd-file">Add photos<input type="file" id="sd-ph" accept="image/jpeg,image/png,image/webp" multiple hidden></label></div>
        ${ph.length ? `<div class="sd-thumbs">${ph.map((p, i) => `<span class="sd-th"><i>${E(p.name)}</i>${btn('bph:' + i, 'Remove', 'ghost')}${i ? btn('bup:' + i, 'Earlier', 'ghost') : ''}</span>`).join('')}</div>` : '<p>No photos yet. The first one becomes the lead.</p>'}
        <div class="og-row">${btn('bexp', 'Export PNG', ph.length ? '' : 'disabled')}${M.sure === b.id ? btn('bdelgo:' + b.id, 'Delete for good') : btn('bdel:' + b.id, 'Delete board', 'ghost')}</div></div>
      <div class="og-card sd-prev"><canvas id="sd-cv" aria-label="Board preview"></canvas></div></div>`;
  };
  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
  const draw = (cv, b, ph) => {
    const [W, H] = L.PRESETS[b.preset] || L.PRESETS.portrait, g = cv.getContext('2d'), lay = L.layout(b.layout, ph.length, W, H);
    cv.width = W; cv.height = H; g.fillStyle = tok('--bg'); g.fillRect(0, 0, W, H);
    lay.photos.forEach((r, i) => { const p = ph[i], c = L.cover(p.w, p.h, r); g.drawImage(p.img, c.sx, c.sy, c.sw, c.sh, r.x, r.y, r.w, r.h); g.strokeStyle = tok('--line'); g.lineWidth = 2; g.strokeRect(r.x, r.y, r.w, r.h); });
    const p = lay.panel, cut = 28; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.w - cut, p.y); g.lineTo(p.x + p.w, p.y + cut); g.lineTo(p.x + p.w, p.y + p.h); g.lineTo(p.x + cut, p.y + p.h); g.lineTo(p.x, p.y + p.h - cut); g.closePath();
    g.fillStyle = tok('--bg2') === '#888' ? tok('--bg') : tok('--bg2'); g.fill(); g.strokeStyle = tok('--p1'); g.lineWidth = 3; g.stroke();
    const fam = tok('--font-display') || 'serif', body = tok('--font-body') || 'sans-serif', pad = 28; let y = p.y + pad + 44;
    const wrap = (t, w, f) => { g.font = f; const out = []; let line = ''; for (const wd of t.split(/\s+/)) { const x = line ? line + ' ' + wd : wd; if (g.measureText(x).width > w && line) { out.push(line); line = wd; } else line = x; } if (line) out.push(line); return out; };
    g.fillStyle = tok('--ink'); for (const l of wrap(b.title || 'Untitled', p.w - 2 * pad, `600 44px ${fam}`).slice(0, 4)) { g.fillText(l, p.x + pad, y); y += 52; }
    if (b.price) { y += 10; g.fillStyle = tok('--gold'); g.font = `600 52px ${fam}`; g.fillText(b.price, p.x + pad, y); y += 60; }
    g.fillStyle = tok('--ink'); for (const t of b.lines.split('\n').filter(Boolean)) for (const l of wrap(t, p.w - 2 * pad, `28px ${body}`)) { if (y < p.y + p.h - pad) g.fillText(l, p.x + pad, y); y += 38; }
    g.fillStyle = tok('--p2'); g.fillRect(p.x + pad, p.y + pad, 36, 6);
  };
  const paint = () => { const cv = document.getElementById('sd-cv'), b = S.boards.find(x => x.id === S.board) || S.boards[0]; if (cv && b) try { draw(cv, b, PH[b.id] || []); } catch (_) {} };
  if (typeof MutationObserver !== 'undefined') new MutationObserver(() => paint()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pal', 'style', 'data-theme'] });
  const later = () => setTimeout(paint, 0);

  /* ---------- actions ---------- */
  const cur = () => S.boards.find(x => x.id === S.board) || S.boards[0];
  const act = (k, a) => {
    const [x, y] = a.split('|'); M.msg = ''; const sc = S.social, it = i => sc.items.find(v => v.id === i), rl = i => S.reels.find(v => v.id === i);
    if (k === 'tab') S.tab[x] = y;
    else if (k === 'sadd') { const t = val('sd-sig').trim(); if (!t) M.msg = 'Write the signal first.'; else sc.items.push({ id: id(), lane: 'Signals', text: t, src: val('sd-src').trim() }); }
    else if (k === 'ssave') { const c = it(x); if (c) c.text = val('sd-t-' + x); }
    else if (k === 'smv') { const c = it(x); if (c) { if (c.lane === 'Briefs' || c.lane === 'Drafts') c.text = val('sd-t-' + x) || c.text; const r = L.socialMove(c, +y, sc.rules); if (r.ok) c.lane = r.lane; else M.msg = r.why; } }
    else if (k === 'scopy') { const c = it(x); if (c) { try { void navigator.clipboard.writeText(c.text); M.msg = 'Copied. Post it yourself where you choose.'; } catch { M.msg = 'Copy is blocked here. Select the text and copy it.'; } } }
    else if (k === 'sdel' || k === 'rdel' || k === 'bdel') M.sure = x;
    else if (k === 'sdelgo') { sc.items = sc.items.filter(v => v.id !== x); M.sure = ''; }
    else if (k === 'dash') sc.rules.dash = !sc.rules.dash;
    else if (k === 'rsave') { sc.rules.max = Math.max(0, +val('sd-max') || 0); sc.rules.banned = val('sd-ban'); M.msg = 'Rules saved.'; }
    else if (k === 'radd') { const t = val('sd-rt').trim(); if (!t) M.msg = 'Give the reel a title.'; else S.reels.push({ id: id(), title: t, sec: +val('sd-rs') || 0, stage: 'Direction', ok: {}, qc: null, delivered: false }); }
    else if (k === 'rok') { const r = rl(x); if (r) { r.ok = r.ok || {}; r.ok[r.stage] = !r.ok[r.stage]; if (!r.ok[r.stage]) r.delivered = false; } }
    else if (k === 'rnext') { const r = rl(x), g = r && L.reelGate(r); if (g && g.ok) r.stage = g.stage; else if (g) M.msg = g.why; }
    else if (k === 'rback') { const r = rl(x); if (r) { r.stage = L.STAGES[Math.max(0, L.STAGES.indexOf(r.stage) - 1)]; r.delivered = false; } }
    else if (k === 'rsnd') { const r = rl(x); if (r) { r.qc = r.qc || {}; r.qc.audio = !r.qc.audio; } }
    else if (k === 'rqc') { const r = rl(x); if (r) { r.qc = { w: +val('sd-w-' + x) || 0, h: +val('sd-h-' + x) || 0, dur: +val('sd-d-' + x) || 0, audio: !!(r.qc || {}).audio }; r.ok = r.ok || {}; r.ok.Review = false; } }
    else if (k === 'rdone') { const r = rl(x), g = r && L.reelDeliver(r); if (g && g.ok) r.delivered = true; else if (g) M.msg = g.why; }
    else if (k === 'rdelgo') { S.reels = S.reels.filter(v => v.id !== x); M.sure = ''; }
    else if (k === 'badd') { const b = { id: id(), title: val('sd-bt').trim() || 'Untitled', price: '', lines: '', preset: 'portrait', layout: 'Panel right' }; S.boards.push(b); S.board = b.id; }
    else if (k === 'bsel') { S.board = x; }
    else if (k === 'bset') { const b = cur(); if (b) b[x] = y; }
    else if (k === 'bsave') { const b = cur(); if (b) { b.title = val('sd-ti'); b.price = val('sd-pr'); b.lines = val('sd-li'); } }
    else if (k === 'bph') { const b = cur(); if (b) PH[b.id].splice(+x, 1); }
    else if (k === 'bup') { const b = cur(), p = b && PH[b.id]; if (p && +x > 0) [p[x - 1], p[x]] = [p[x], p[x - 1]]; }
    else if (k === 'bdelgo') { S.boards = S.boards.filter(v => v.id !== x); delete PH[x]; S.board = ''; M.sure = ''; }
    else if (k === 'bexp') { const b = cur(), cv = document.getElementById('sd-cv'); if (b && cv) { paint(); cv.toBlob(bl => { const u = URL.createObjectURL(bl), a = document.createElement('a'); a.href = u; a.download = (b.title || 'board').replace(/[^\w-]+/g, '-') + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, 'image/png'); } return; }
    save(); render(); later();
  };
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('[data-sd]'); if (!t || t.disabled) return; const [k, ...r] = t.dataset.sd.split(':'); e.preventDefault(); const b = cur(); if (b && ['bsave', 'bset', 'bsel', 'bph', 'bup', 'bexp'].includes(k) && k !== 'bsel' && k !== 'bexp') { b.title = val('sd-ti') || b.title; b.price = (document.getElementById('sd-pr') || {}).value ?? b.price; b.lines = (document.getElementById('sd-li') || {}).value ?? b.lines; } act(k, r.join(':')); });
  document.addEventListener('change', e => {
    if (!e.target || e.target.id !== 'sd-ph') return; const b = cur(); if (!b) return; PH[b.id] = PH[b.id] || []; const bad = [];
    const files = [...e.target.files]; let n = files.length;
    const fin = () => { if (--n > 0) return; M.msg = bad.length ? 'Skipped: ' + bad.join('; ') : ''; render(); later(); };
    if (!n) return;
    for (const f of files) {
      const why = L.okFile(f) || (PH[b.id].length >= L.MAXP ? 'a board holds ' + L.MAXP + ' photos' : '');
      if (why) { bad.push(f.name + ' (' + why + ')'); fin(); continue; }
      const u = URL.createObjectURL(f), img = new Image();
      img.onload = () => { PH[b.id].push({ name: f.name, img, w: img.naturalWidth, h: img.naturalHeight }); fin(); };
      img.onerror = () => { bad.push(f.name + ' (cannot be read)'); fin(); };
      img.src = u;
    }
  });

  register({ id: 'studio', views: {
    Studio: studio,
    Social: () => shell('Social', 'From a sourced signal to a brief to a draft you approve. Nothing is ever posted from here.', 'Agora', 'social', social()),
    Reels: () => shell('Reels', 'A human-gated pipeline for short vertical video: direction, script, materials, takes, review, delivery.', 'Cinema', 'reels', reels()),
    'Offer Boards': () => { later(); return shell('Offer Boards', 'Compose offer boards from photos in the browser and export a PNG. Photos never leave the browser.', 'Tabulae', 'offer-boards', board()); },
  } });
  /* one group for the three apps; a fresh install leaves the group out of the menu until it is added */
  const move = new Set(['Social', 'Reels', 'Offer Boards']);
  for (const g of NSIA) g[2] = g[2].filter(x => !move.has(x[0]));
  NSIA.splice(NSIA.findIndex(g => g[0] === 'Make') + 1, 0, ['Studio', 'design', [['Studio', 'Officina', 'design'], ['Social', 'Agora', 'news'], ['Reels', 'Cinema', 'video'], ['Offer Boards', 'Tabulae', 'design']]]);
  ['Studio', 'Social', 'Reels', 'Offer Boards'].forEach(n => OGS.mods.add(n));
  if (typeof NS !== 'undefined') NS.open.Studio = false;
})();
