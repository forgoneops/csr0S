/* Media Archive: your own images and video, kept in this browser (IndexedDB). It starts empty. Import copies a file in;
   nothing is uploaded. Delete moves an item to the trash, from where it comes back or is removed for good.
   The hall is a gallery over the Archive scene; the viewer zooms, pans, steps to the next and previous item. */
(() => {
  const E = s => (typeof OGE === 'function' ? OGE(s) : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const A = { items: null, urls: new Map(), tab: ls('md-tab', 'hall'), open: ls('md-open', null), z: 1, x: 0, y: 0, msg: '', mem: new Map() };
  // IndexedDB when the browser allows it; a session-only map when it does not (private window): shortcut, the note below says so.
  let dbp = null;
  const db = () => dbp || (dbp = new Promise(res => { try { const r = indexedDB.open('caesaros-media', 1); r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } }));
  const tx = async (mode, fn) => { const d = await db(); if (!d) return null; return new Promise(res => { try { const t = d.transaction('items', mode), r = fn(t.objectStore('items')); t.oncomplete = () => res(r && r.result !== undefined ? r.result : true); t.onerror = t.onabort = () => res(null); } catch { res(null); } }); };
  const kind = f => (f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : '');
  async function load() {
    const all = await tx('readonly', s => s.getAll()); A.items = (all || [...A.mem.values()]).sort((a, b) => b.added - a.added);
    if (all === null) A.msg = 'This browser blocks local storage, so imports last only until you close the tab.';
    if (A.open && !A.items.some(i => i.id === A.open && !i.trashed)) A.open = null;
    draw();
  }
  async function put(it) { if ((await tx('readwrite', s => s.put(it))) === null) A.mem.set(it.id, it); }
  async function imp(files) {
    const ok = [...files].filter(kind); if (!ok.length) { A.msg = 'Only images and video can be imported.'; return draw(); }
    for (const f of ok) await put({ id: crypto.randomUUID(), name: f.name.slice(0, 120), type: kind(f), blob: f, added: Date.now(), trashed: 0 });
    A.msg = `${ok.length} imported.`; await load();
  }
  const url = it => { if (!A.urls.has(it.id)) A.urls.set(it.id, URL.createObjectURL(it.blob)); return A.urls.get(it.id); };
  const shown = () => (A.items || []).filter(i => !!i.trashed === (A.tab === 'trash'));
  const live = () => (A.items || []).filter(i => !i.trashed);
  const draw = () => { if (document.querySelector('.md') && typeof render === 'function') render(); };
  const tile = i => `<button class="md-tile" type="button" data-md="view" data-id="${i.id}" aria-label="Open ${E(i.name)}">${i.type === 'video' ? `<video src="${url(i)}" preload="metadata" muted playsinline></video><span class="md-play" aria-hidden="true">${I('play', 18)}</span>` : `<img src="${url(i)}" alt="" loading="lazy">`}<span class="md-name" data-no-i18n>${E(i.name)}</span></button>`;
  const trow = i => `<div class="md-trow"><span data-no-i18n>${E(i.name)}</span><button class="btn ghost" type="button" data-md="restore" data-id="${i.id}">Restore</button><button class="btn ghost" type="button" data-md="purge" data-id="${i.id}">Delete for good</button></div>`;
  function viewer() {
    const l = live(), i = l.find(x => x.id === A.open); if (!i) return '';
    const n = l.indexOf(i);
    return `<div class="md-viewer" role="dialog" aria-modal="true" aria-label="${E(i.name)}"><div class="md-vbar"><span data-no-i18n>${E(i.name)} (${n + 1} of ${l.length})</span>
      <button class="btn ghost" type="button" data-md="zoom" data-v="1.25" aria-label="Zoom in">${I('plus', 16)}</button><button class="btn ghost" type="button" data-md="zoom" data-v="0.8" aria-label="Zoom out">${I('minus', 16)}</button><button class="btn ghost" type="button" data-md="fit">Fit</button>
      <button class="btn ghost" type="button" data-md="trash" data-id="${i.id}" aria-label="Move to trash">${I('trash', 16)}<span>Trash</span></button><button class="btn" type="button" data-md="close" aria-label="Close viewer">${I('close', 16)}</button></div>
      <div class="md-stage" data-md-stage>${i.type === 'video' ? `<video class="md-media" src="${url(i)}" controls playsinline style="transform:translate(${A.x}px,${A.y}px) scale(${A.z})"></video>` : `<img class="md-media" src="${url(i)}" alt="${E(i.name)}" draggable="false" style="transform:translate(${A.x}px,${A.y}px) scale(${A.z})">`}</div>
      <button class="btn md-nav prev" type="button" data-md="step" data-v="-1" aria-label="Previous"${n ? '' : ' disabled'}>${I('chevron-right', 20)}</button><button class="btn md-nav next" type="button" data-md="step" data-v="1" aria-label="Next"${n < l.length - 1 ? '' : ' disabled'}>${I('chevron-right', 20)}</button>
      <p class="md-hint">Trash keeps it for restoring. Drag to pan, pinch or scroll to zoom, arrow keys step.</p></div>`;
  }
  function mediaView() {
    const head = nsHead('Media Gallery', 'Browse local images and videos, copy items into the library. Deleting moves to a reversible trash.', 'Archive', 'media');
    if (!A.items) { void load(); return `<div class="nx-view enter md">${head}<div class="og-wrap"><div class="md-hall"><div class="md-grid">${'<i class="vz-skel"></i>'.repeat(6)}</div></div></div></div>`; }
    const l = shown(), tr = (A.items || []).filter(i => i.trashed).length;
    const body = A.tab === 'trash'
      ? (l.length ? `<div class="md-trash">${l.map(trow).join('')}</div>` : vzEmpty('The trash is empty', 'Deleted items wait here until you remove them for good.'))
      : (l.length ? `<div class="md-grid">${l.map(tile).join('')}</div>` : vzEmpty('Your gallery is empty', 'Images and video you import, or the studios save, will appear here. Drop files on this hall or press Import.'));
    return `<div class="nx-view enter md">${head}<div class="og-wrap"><div class="md-bar"><div class="md-tabs" role="group" aria-label="Archive view"><button class="btn ghost${A.tab === 'hall' ? ' on' : ''}" type="button" data-md="tab" data-v="hall" aria-pressed="${A.tab === 'hall'}">Hall</button><button class="btn ghost${A.tab === 'trash' ? ' on' : ''}" type="button" data-md="tab" data-v="trash" aria-pressed="${A.tab === 'trash'}">Trash <span class="md-n">${tr}</span></button></div>
      <label class="btn md-imp">${I('upload', 16)}<span>Import</span><input type="file" id="md-file" accept="image/*,video/*" multiple hidden></label></div>
      ${A.msg ? `<p class="md-msg" role="status">${E(A.msg)}</p>` : ''}<div class="md-hall" data-md-drop>${body}</div></div>${viewer()}</div>`;
  }
  const save = () => { sv('md-tab', A.tab); sv('md-open', A.open); };
  const step = d => { const l = live(), n = l.findIndex(x => x.id === A.open) + d; if (l[n]) { A.open = l[n].id; A.z = 1; A.x = A.y = 0; save(); draw(); } };
  const zoom = (d, cx, cy) => { const s = document.querySelector('.md-stage'); const z = Math.min(8, Math.max(.5, A.z * d)), k = z / A.z; if (s) { const r = s.getBoundingClientRect(), px = (cx ?? r.left + r.width / 2) - r.left - r.width / 2, py = (cy ?? r.top + r.height / 2) - r.top - r.height / 2; A.x = px - (px - A.x) * k; A.y = py - (py - A.y) * k; } A.z = z; paint(); };
  const paint = () => { const m = document.querySelector('.md-media'); if (m) m.style.transform = `translate(${A.x}px,${A.y}px) scale(${A.z})`; };
  async function setTrash(id, t) { const i = A.items.find(x => x.id === id); if (!i) return; i.trashed = t; await put(i); if (t && A.open === id) { const l = live(); A.open = (l[l.findIndex(x => x.id === id) + 1] || l[l.findIndex(x => x.id === id) - 1] || {}).id || null; } A.msg = t ? 'Moved to the trash. Open the Trash tab to restore it.' : 'Restored.'; save(); await load(); }
  async function purge(id) { await tx('readwrite', s => s.delete(id)); A.mem.delete(id); const u = A.urls.get(id); if (u) { URL.revokeObjectURL(u); A.urls.delete(id); } await load(); }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-md]'); if (!b) return;
    const k = b.dataset.md, id = b.dataset.id, v = b.dataset.v;
    if (k === 'tab') { A.tab = v; A.msg = ''; save(); draw(); }
    else if (k === 'view') { A.open = id; A.z = 1; A.x = A.y = 0; save(); draw(); }
    else if (k === 'close') { A.open = null; save(); draw(); }
    else if (k === 'step') step(+v);
    else if (k === 'zoom') zoom(+v);
    else if (k === 'fit') { A.z = 1; A.x = A.y = 0; paint(); }
    else if (k === 'trash') void setTrash(id, Date.now());
    else if (k === 'restore') void setTrash(id, 0);
    else if (k === 'purge') void purge(id);
  });
  document.addEventListener('change', e => { if (e.target && e.target.id === 'md-file') { void imp(e.target.files); e.target.value = ''; } });
  document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('[data-md-drop]')) e.preventDefault(); });
  document.addEventListener('drop', e => { if (e.target.closest && e.target.closest('[data-md-drop]')) { e.preventDefault(); if (e.dataTransfer) void imp(e.dataTransfer.files); } });
  document.addEventListener('keydown', e => { if (!document.querySelector('.md-viewer')) return; if (e.key === 'Escape') { A.open = null; save(); draw(); } else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); });
  // pan with one pointer, pinch with two, wheel zooms toward the cursor
  const P = new Map(); let G = null;
  document.addEventListener('pointerdown', e => { const s = e.target.closest && e.target.closest('[data-md-stage]'); if (!s || e.target.closest('video[controls]') && e.offsetY > e.target.clientHeight - 40) return; P.set(e.pointerId, [e.clientX, e.clientY]); try { s.setPointerCapture(e.pointerId); } catch {} const [a, b] = [...P.values()]; G = P.size === 2 ? { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: A.z } : { sx: e.clientX, sy: e.clientY, ox: A.x, oy: A.y }; });
  document.addEventListener('pointermove', e => { if (!G || !P.has(e.pointerId)) return; P.set(e.pointerId, [e.clientX, e.clientY]); if (G.d && P.size === 2) { const [a, b] = [...P.values()]; zoom(G.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / G.d / A.z, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } else if (!G.d) { A.x = G.ox + e.clientX - G.sx; A.y = G.oy + e.clientY - G.sy; paint(); } });
  const up = e => { if (P.delete(e.pointerId) && !P.size) G = null; }; document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  document.addEventListener('wheel', e => { if (e.target.closest && e.target.closest('[data-md-stage]')) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); } }, { passive: false });
  register({ id: 'media', views: { 'Media Gallery': mediaView }, owns: ['Media Gallery'] });
})();
