/* The notes graph: a canvas view of the notes and their [[links]], read-only.
   notes.js puts a <canvas class="nt-gc"> on screen and sets window.ntGraphData = { nodes, edges, cur, q, demo, open(id) }.
   Drag or one finger pans, wheel or two fingers zoom, a tap opens the note, the search box lights the matches.
   Colours come from the theme tokens (--p1, --p2, --gold ...) and are re-read when the palette changes. Nodes are diamonds, never circles. */
(() => {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;   // the registry test's stub has no DOM observers
  const css = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
  const calm = () => { try { return document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const W = 1000, H = 640;
  const KEY = 'caesaros-brain-graph-view';
  const saved = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return s && typeof s === 'object' ? s : {}; } catch { return {}; } };
  const persist = (v, selected) => { try { localStorage.setItem(KEY, JSON.stringify({ x: v.x, y: v.y, k: v.k, selected })); } catch { /* private window */ } };

  function mount(cv) {
    const ctx = cv.getContext('2d'); let pal = null, dirty = true, alive = true, hover = null, raf = 0;
    const initial = saved(), hasSaved = Number.isFinite(+initial.k) && +initial.k >= .3 && +initial.k <= 8 && Number.isFinite(+initial.x) && Number.isFinite(+initial.y), v = { x: hasSaved ? +initial.x : 0, y: hasSaved ? +initial.y : 0, k: hasSaved ? +initial.k : 1 }, ptrs = new Map(); let moved = 0, pinch = 0, hit0 = null, selected = initial.selected || null;
    const D = () => window.ntGraphData || { nodes: [], edges: [] };
    const readPal = () => { pal = { p1: css('--p1', 'currentColor'), p2: css('--p2', 'currentColor'), gold: css('--gold', 'currentColor'), mag: css('--tint-magenta', 'currentColor'), ink: css('--ink', 'currentColor'), muted: css('--muted', 'currentColor'), line: css('--line', 'currentColor') }; dirty = true; };
    const folderCol = (f, folders) => [pal.p2, pal.p1, pal.gold, pal.mag][Math.max(0, folders.indexOf(f)) % 4];
    // Fit the drawn nodes (not the nominal W x H) into the canvas with margins; labels sit right of a node, so the right edge gets extra room.
    const fit = () => {
      const w = cv.clientWidth, h = cv.clientHeight, ns = D().nodes; if (!w || !h) return;
      let x0 = 0, y0 = 0, x1 = W, y1 = H;
      if (ns.length) { x0 = Math.min(...ns.map(n => n.x - rad(n))); x1 = Math.max(...ns.map(n => n.x + rad(n) + 7 + Math.min(String(n.title).length, 18) * 6.6)); y0 = Math.min(...ns.map(n => n.y - rad(n) - 3)); y1 = Math.max(...ns.map(n => n.y + rad(n) + 3)); }
      const m = Math.min(40, w / 10), bw = Math.max(x1 - x0, 80), bh = Math.max(y1 - y0, 80), k = Math.max(.3, Math.min(1.6, (w - 2 * m) / bw, (h - 2 * m) / bh));
      v.k = k; v.x = (w - bw * k) / 2 - x0 * k; v.y = (h - bh * k) / 2 - y0 * k; dirty = true;
    };
    let touched = false;
    const size = () => { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); if (!hasSaved && !touched) fit(); dirty = true; };
    const rad = n => 5 + Math.min(n.degree, 10);
    const toW = (px, py) => [(px - v.x) / v.k, (py - v.y) / v.k];
        const matches = () => { const q = (D().q || '').trim().toLowerCase(); return q ? new Set(D().nodes.filter(n => n.id.toLowerCase().includes(q)).map(n => n.id)) : null; };
    const pick = (px, py) => { const [wx, wy] = toW(px, py); let best = null, bd = 1e9; for (const n of D().nodes) { const d = Math.hypot(n.x - wx, n.y - wy) * v.k, lim = Math.max(rad(n) * v.k, 16); if (d < lim && d < bd) { best = n; bd = d; } } return best; };

    function draw(t) {
      if (!pal) readPal();
      const d = Math.min(devicePixelRatio || 1, 2), { nodes, edges, cur } = D(), hit = matches(), at = new Map(nodes.map(n => [n.id, n]));
      const folders = [...new Set(nodes.map(n => n.folder))].sort(), focus = hover || cur || null, now = Date.now();
      ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.save(); ctx.translate(v.x, v.y); ctx.scale(v.k, v.k);
      ctx.lineWidth = 1 / v.k;
      for (const e of edges) {
        const a = at.get(e.from), b = at.get(e.to); if (!a || !b) continue;
        const on = focus && (e.from === focus || e.to === focus);
        ctx.globalAlpha = hit ? (hit.has(a.id) || hit.has(b.id) ? .6 : .08) : on ? .95 : .5;
        ctx.strokeStyle = on ? pal.p1 : pal.p2; ctx.lineWidth = (on ? 2 : 1) / v.k;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      const pulse = calm() ? 0 : (Math.sin(t / 1400) + 1) / 2;   // slow breathing, about 0.2 Hz: alive, never strobing
      for (const n of nodes) {
        const r = rad(n), age = now - n.updated, col = folderCol(n.folder, folders), isHit = hit && hit.has(n.id), dim = hit && !isHit;
        ctx.globalAlpha = dim ? .18 : 1;
        if (!dim && age < 36e5) { ctx.globalAlpha = .18 + .22 * pulse; ctx.fillStyle = pal.gold; dia(n.x, n.y, r + 7 + 3 * pulse); ctx.globalAlpha = 1; }
        else if (!dim && age < 6048e5) { ctx.globalAlpha = .16; ctx.fillStyle = pal.gold; dia(n.x, n.y, r + 5); ctx.globalAlpha = 1; }
        ctx.fillStyle = col; dia(n.x, n.y, r);
        if (n.id === cur || n.id === hover || n.id === selected || isHit) { ctx.strokeStyle = isHit ? pal.gold : pal.ink; ctx.lineWidth = 2 / v.k; dia(n.x, n.y, r + 3, true); }
      }
      ctx.globalAlpha = 1; ctx.font = `${11 / v.k}px ui-monospace, monospace`; ctx.textBaseline = 'middle';
      for (const n of nodes) {
        const show = v.k > 0.9 || nodes.length <= 40 || n.degree >= 3 || n.id === cur || n.id === hover || (hit && hit.has(n.id)); if (!show || (hit && !hit.has(n.id))) continue;
        ctx.fillStyle = n.id === cur || n.id === hover ? pal.ink : pal.muted; ctx.fillText(n.title, n.x + rad(n) + 5, n.y);
      }
      ctx.restore();
      // A quiet orientation map keeps large graphs navigable without competing with the notes.
      if (nodes.length > 5 && cv.clientWidth > 420) {
        const mw = 132, mh = 86, mx = cv.clientWidth - mw - 12, my = cv.clientHeight - mh - 12;
        const sx = mw / W, sy = mh / H;
        ctx.setTransform(d, 0, 0, d, 0, 0); ctx.globalAlpha = .88; ctx.fillStyle = pal.ink; ctx.fillRect(mx, my, mw, mh);
        ctx.globalAlpha = .9; ctx.fillStyle = css('--bg', 'transparent'); ctx.fillRect(mx + 1, my + 1, mw - 2, mh - 2);
        for (const n of nodes) { ctx.globalAlpha = .85; ctx.fillStyle = folderCol(n.folder, folders); ctx.fillRect(mx + n.x * sx - 1, my + n.y * sy - 1, 3, 3); }
        ctx.globalAlpha = 1; ctx.strokeStyle = pal.gold; ctx.lineWidth = 1; ctx.strokeRect(mx + (-v.x / v.k) * sx, my + (-v.y / v.k) * sy, cv.clientWidth / v.k * sx, cv.clientHeight / v.k * sy);
      }
    }
    function dia(x, y, r, stroke) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); stroke ? ctx.stroke() : ctx.fill(); }

    function loop(t) {
      if (!alive) return; if (!cv.isConnected) { stop(); return; }
      const hot = !calm() && D().nodes.some(n => Date.now() - n.updated < 36e5);
      if (dirty || hot) { if (!document.hidden && (dirty || t - (loop.last || 0) > 66)) { draw(t); loop.last = t; dirty = false; } }
      raf = requestAnimationFrame(loop);
    }
    function stop() { alive = false; cancelAnimationFrame(raf); mo.disconnect(); ro.disconnect(); }
    const mo = new MutationObserver(readPal); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-pal', 'data-theme', 'data-skin', 'data-motion'] });
    const ro = new ResizeObserver(size); ro.observe(cv);

    const at = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const saveView = () => persist(v, selected);
    const zoomAt = (px, py, f) => { touched = true; const k = Math.max(0.3, Math.min(8, v.k * f)), [wx, wy] = toW(px, py); v.k = k; v.x = px - wx * k; v.y = py - wy * k; dirty = true; saveView(); };
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, at(e)); moved = 0; hit0 = ptrs.size === 1 ? pick(...at(e)) : null; pinch = 0; });
    cv.addEventListener('pointermove', e => {
      const p = at(e);
      if (!ptrs.has(e.pointerId)) { const h = pick(...p); const id = h ? h.id : null; if (id !== hover) { hover = id; cv.style.cursor = id ? 'pointer' : 'grab'; dirty = true; } return; }
      const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
      if (ptrs.size === 1) { touched = true; moved += Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]); v.x += p[0] - prev[0]; v.y += p[1] - prev[1]; dirty = true; }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); moved = 99; if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dd / pinch); pinch = dd; }
    });
    const up = e => { const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (was && ptrs.size === 0 && moved < 8 && hit0) { const data = D(); selected = hit0.id; if (!data.demo) saveView(); dirty = true; if (!data.demo && data.open) data.open(hit0.id); } else if (was && ptrs.size === 0) saveView(); if (ptrs.size < 2) pinch = 0; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = 0; });
    cv.addEventListener('pointerleave', () => { if (hover) { hover = null; dirty = true; } });
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(...at(e), e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    cv.addEventListener('keydown', e => {
      const s = 40, m = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key];
      if (m) { v.x += m[0]; v.y += m[1]; dirty = true; saveView(); e.preventDefault(); } else if (e.key === '+' || e.key === '=') zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1.25); else if (e.key === '-') zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, .8); else if (e.key === '0') { fit(); saveView(); }
    });
    cv.ntg = { fit: () => { fit(); saveView(); }, zoom: f => zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, f), redraw: () => { dirty = true; },
      focus: () => { const hs = matches(); if (!hs || !hs.size) return; const n = D().nodes.find(x => hs.has(x.id)); v.k = Math.max(v.k, 1.6); v.x = cv.clientWidth / 2 - n.x * v.k; v.y = cv.clientHeight / 2 - n.y * v.k; dirty = true; saveView(); } };
    size(); raf = requestAnimationFrame(loop);
  }

  // Bind each canvas the notes view draws; a repaint of the view replaces the canvas, and the old loop ends itself.
  const bind = () => document.querySelectorAll('canvas.nt-gc:not([data-bound])').forEach(c => { c.dataset.bound = '1'; mount(c); });
  new MutationObserver(bind).observe(document.body, { childList: true, subtree: true }); bind();

  // A clearly labelled sample, so an empty instance can show what the map does. It never touches the notes.
  window.ntDemoGraph = () => {
    const names = ['Home', 'Projects/Atrium', 'Projects/Brain', 'Decisions/Local first', 'Ideas', 'Agents/Alpha', 'Agents/Beta', 'Research/Graphs', 'Research/Recall', 'Journal/Monday', 'Journal/Tuesday', 'Unfiled'];
    const links = [[0, 1], [0, 3], [1, 3], [1, 4], [2, 1], [2, 0], [4, 2], [5, 0], [6, 0], [5, 6], [7, 2], [8, 2], [7, 8], [9, 0], [10, 9], [10, 8]];
    const ang = i => i / names.length * Math.PI * 2, deg = names.map((_, i) => links.filter(l => l.includes(i)).length);
    return { nodes: names.map((id, i) => ({ id, title: id.split('/').pop(), folder: id.includes('/') ? id.split('/')[0] : '', degree: deg[i], updated: Date.now() - i * 9e7, x: 500 + Math.cos(ang(i)) * (i === 0 ? 0 : 130 + (i % 3) * 70) * 1.5, y: 320 + Math.sin(ang(i)) * (i === 0 ? 0 : 130 + (i % 3) * 70) }))
      , edges: links.map(([a, b]) => ({ from: names[a], to: names[b] })) };
  };
})();
