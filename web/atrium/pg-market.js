/* Evolved pages for Marketplace, Search and Notifications. Pure renderers: real.js owns the data and the clicks and
   hands plain values in. Uses ogHead (art header), vzTiles (stat tiles) and vzEmpty from viz.js. Styles: pg-market.css, all under .pgm. */
(() => {
  const E = s => (typeof OGE === 'function' ? OGE(s) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const ico = (n, s = 16) => (typeof I === 'function' ? I(n, s) : '');
  const btn = (k, label, cls = '') => `<button class="btn ${cls}" data-rd="${k}">${E(label)}</button>`;
  const head = (name, sub, la) => (typeof ogHead === 'function' ? ogHead(name, sub, la) : `<h2>${E(name)}</h2>`);
  const tile = (l, v, s, t) => (typeof vzTile === 'function' ? vzTile(l, v, s, t) : `<div><small>${E(l)}</small><b>${E(v)}</b></div>`);
  const tiles = a => (typeof vzTiles === 'function' ? vzTiles(a) : a.join(''));
  const empty = (t, x) => (typeof vzEmpty === 'function' ? vzEmpty(t, x) : `<div class="og-card"><p>${E(t)}</p></div>`);
  const wrap = (name, sub, la, body) => `<div class="nx-view enter pgm">${head(name, sub, la)}<div class="og-wrap">${body}</div></div>`;
  /* skeleton while data loads: a tile row and a few ghost rows or cards */
  const skel = (cards = false) => `<div class="pgm-sk" role="status" aria-label="Loading"><div class="pgm-sk-t">${'<i></i>'.repeat(4)}</div><div class="${cards ? 'pgm-grid' : 'pgm-sk-r'}">${'<i></i>'.repeat(cards ? 6 : 4)}</div></div>`;
  const loading = (name, sub, la, cards) => wrap(name, sub, la, skel(cards));

  const failCard = (text, k) => `<div class="og-card pgm-err" role="alert"><h4>Could not read this from the core</h4><p>${E(text)}</p>${btn(k, 'Try again')}</div>`;
  const catName = c => (/^\.*$/.test(c) ? 'other' : c);

  /* Marketplace: c = { skills, q, cat, itemCount, review } ; review is the package card and registry HTML from real.js */
  function market(c) {
    const q = (c.q || '').toLowerCase(), all = c.skills.map(s => ({ ...s, category: catName(s.category) })), cats = {};
    all.forEach(s => { cats[s.category] = (cats[s.category] || 0) + 1; });
    const list = all.filter(s => (!q || (s.name + ' ' + s.description + ' ' + s.category).toLowerCase().includes(q)) && (!c.cat || s.category === c.cat));
    const flagged = all.filter(s => s.flags.length).length;
    const chips = `<div class="pgm-chips" role="group" aria-label="Category">${[['', 'All', all.length], ...Object.entries(cats).sort().map(([k, n]) => [k, k, n])].map(([k, l, n]) => `<button class="og-chip ${(c.cat || '') === k ? 'on' : ''}" data-rd="mkcat:${E(k)}" aria-pressed="${(c.cat || '') === k}">${E(l)} <b>${n}</b></button>`).join('')}</div>`;
    const card = s => `<div class="pgm-card ${s.flags.length ? 'look' : ''}"><div class="pgm-ct">${ico('plugin', 16)}<b>${E(s.name)}</b></div><p>${E(s.description)}</p>${s.flags.length ? `<small class="pgm-look">Look at: ${s.flags.map(E).join('; ')}</small>` : ''}<div class="pgm-cf"><span class="og-tag">${E(s.category)}</span><span class="og-tag ${s.flags.length ? '' : 'sig'}">${s.flags.length ? 'Installed · review' : 'Installed'}</span></div></div>`;
    if (c.failed) return wrap('Marketplace', 'Review a local skill package before it enters CaesarOS.', 'Mercatus', failCard('The skill list or the package registry did not answer. Nothing was changed.', 'mkretry') + c.review);
    const grid = !all.length ? empty('No skills on this computer yet', 'Review a package below or add a skill folder to an agent. Installed skills show up here.')
      : !list.length ? empty('No skill matches', q ? `Nothing for "${c.q}"${c.cat ? ' in ' + c.cat : ''}. Try fewer words.` : 'Nothing in this category.')
      : `<div class="pgm-grid">${list.map(card).join('')}</div>`;
    return wrap('Marketplace', 'Review a local skill package before it enters CaesarOS.', 'Mercatus', `
      ${tiles([tile('Installed', all.length, 'skills on this computer', 'a'), tile('Categories', Object.keys(cats).length, 'shelves', 's'), tile('Worth a look', flagged, flagged ? 'scanner notes' : 'all clean', flagged ? 'm' : 'g'), tile('In review', c.itemCount, 'packages in quarantine or registry', 'a')])}
      <div class="pg-bar"><input class="og-input" id="rd-skq" type="search" placeholder="Search skills" aria-label="Search skills" value="${E(c.q || '')}" style="flex:1">${btn('skgo', 'Search')}</div>
      ${chips}<div class="pgm-count">${list.length} of ${all.length} skills</div>${grid}${c.review}`);
  }

  /* Search: s = { q, hits (null before a search), busy }, kinds = { kind: label } */
  function search(s, kinds, openIdx) {
    const bar = `<div class="pg-bar"><input class="og-input" id="rd-sq" type="search" placeholder="Search everything" aria-label="Search everything" value="${E(s.q)}" style="flex:1">${btn('sgo', 'Search')}</div>`;
    let body;
    if (s.busy) body = skel();
    else if (s.failed) body = failCard('The search did not answer.', 'sgo');
    else if (s.hits === null) body = empty('Search everything', 'Notes, library, chats, tasks and events in one box. Type at least two letters.');
    else if (!s.hits.length) body = empty(`Nothing found for "${s.q}"`, 'Try fewer or different words. Search reads this device only.');
    else {
      const by = {}; s.hits.forEach((h, i) => (by[h.kind] = by[h.kind] || []).push([h, i]));
      const ks = Object.keys(by);
      body = tiles([tile('Results', s.hits.length, 'across ' + ks.length + (ks.length === 1 ? ' place' : ' places'), 'a'), ...ks.map((k, n) => tile(kinds[k] || k, by[k].length, '', ['s', 'g', 'm', 'a'][n % 4]))])
        + ks.map(k => `<div class="pgm-grp"><div class="og-sec">${E(kinds[k] || k)} <b>${by[k].length}</b></div><div class="og-list">${by[k].map(([h, i]) => `<div>${ico('search', 16)}<span><span data-no-i18n>${E(h.title)}</span> <small>${E(kinds[h.kind] || h.kind)} · <span data-no-i18n>${E(h.text)}</span></small></span><span class="og-row">${btn('sopen:' + i, 'Open')}</span></div>`).join('')}</div></div>`).join('');
    }
    return wrap('Search', 'One search over your notes, library, chats, tasks and events.', 'Quaero', bar + body);
  }

  /* Notifications: rows = [type, title, sub, app, action, key]; read = Set of keys */
  function notifs(rows, read, failed) {
    const unread = rows.filter(r => !read.has(r[5])).length;
    const by = {}; rows.forEach(r => (by[r[0]] = by[r[0]] || []).push(r));
    const types = Object.keys(by);
    const top = `<div class="pgm-bell ${unread ? 'on' : ''}"><i aria-hidden="true"></i><b>${unread ? unread + ' unread' : 'All read'}</b><span>${rows.length} in total</span><span class="pgm-sp"></span>${unread ? btn('nfall', 'Mark all read') : ''}${btn('nfrefresh', 'Refresh')}</div>`
      + (failed ? failCard('Some sources did not answer, so this list may be incomplete.', 'nfrefresh') : '');
    if (!rows.length) return wrap('Notifications', 'What needs you, read from this device. Nothing is sent anywhere.', 'Nuntii', top + (failed ? '' : empty('Nothing needs you right now', 'Approvals, tasks, failures and today\'s events show up here.')));
    return wrap('Notifications', 'What needs you, read from this device. Nothing is sent anywhere.', 'Nuntii', top
      + tiles([tile('Unread', unread, unread ? 'waiting' : 'nothing new', unread ? 'm' : 'g'), ...types.slice(0, 3).map((t, n) => tile(t, by[t].length, '', ['a', 's', 'g'][n]))])
      + types.map(t => `<div class="pgm-grp"><div class="og-sec">${E(t)} <b>${by[t].length}</b></div><div class="og-list">${by[t].map(r => { const u = !read.has(r[5]); return `<div class="${u ? 'unread' : ''}"><i class="pgm-dot ${u ? 'on' : ''}" aria-label="${u ? 'Unread' : 'Read'}"></i><span><span data-i18n-own="${E(r[6] || '')}">${E(r[1])}</span> <small>${E(r[2])}</small></span><span class="og-row"><button class="btn" data-open-app="${E(r[3])}">${E(r[4])}</button>${u ? btn('nfread:' + E(r[5]), 'Mark read') : ''}</span></div>`; }).join('')}</div></div>`).join(''));
  }
  window.xPG = { market, search, notifs, loading };
})();
