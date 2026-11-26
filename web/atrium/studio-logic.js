/* Studio logic: the pure rules behind Social desk, Reels and Offer Boards. No DOM, no network. studio.js draws it. */
const STL = (() => {
  const LANES = ['Signals', 'Briefs', 'Drafts', 'Approved'];
  const RULES = { max: 280, dash: false, banned: '' };
  const SECRET = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b|\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{8,})/i;
  const ADDR = /\b(100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|127\.0\.0\.1|localhost:\d+)\b/;
  const PATH = /(\/home\/[a-z0-9_-]+\/|~\/[A-Za-z]|[A-Z]:\\Users\\)/;
  /* what must not appear in a public text; the person's own rules add a length cap, the dash rule and banned phrases */
  const lint = (text, rules = RULES) => {
    const t = String(text || ''), out = [], r = { ...RULES, ...rules };
    if (!t.trim()) out.push('The text is empty.');
    if (!r.dash && /[—–]/.test(t)) out.push('Contains a long dash. Use a full stop, a comma or a colon.');
    if (SECRET.test(t)) out.push('Looks like it contains a key, token or password.');
    if (ADDR.test(t)) out.push('Contains a private or tailnet address.');
    if (PATH.test(t)) out.push('Contains a path from this computer.');
    if (r.max > 0 && t.length > r.max) out.push(`Too long: ${t.length} of ${r.max} characters.`);
    for (const b of String(r.banned || '').split('\n').map(x => x.trim().toLowerCase()).filter(Boolean)) if (t.toLowerCase().includes(b)) out.push(`Uses a banned phrase: "${b}".`);
    return out;
  };
  /* a card moves one lane at a time, by a person's click; nothing enters Approved with findings, and nothing is ever posted */
  const socialMove = (item, dir, rules) => {
    const i = LANES.indexOf(item.lane), j = i + dir;
    if (j < 0 || j >= LANES.length) return { ok: false, why: 'There is no lane there.' };
    if (LANES[j] === 'Approved') { const f = lint(item.text, rules); if (f.length) return { ok: false, why: f[0] }; }
    return { ok: true, lane: LANES[j] };
  };

  const STAGES = ['Direction', 'Script', 'Materials', 'Takes', 'Review', 'Delivery'];
  /* measured checks; the numbers are typed in from the file's properties, a failed check blocks review */
  const qc = (m, expected) => {
    const w = +m.w || 0, h = +m.h || 0, d = +m.dur || 0, e = +expected || 0;
    const checks = [
      ['vertical 9:16', h > 0 && Math.abs(w / h - 9 / 16) <= 0.02, `${w}x${h}`],
      ['at least 720x1280', w >= 720 && h >= 1280, `${w}x${h}`],
      ['has sound', !!m.audio, m.audio ? 'sound present' : 'no sound'],
      [e ? `length within 1 s of ${e} s` : 'length is set', e ? Math.abs(d - e) <= 1 : d > 0, d ? d + ' s' : 'not entered'],
    ].map(([name, ok, detail]) => ({ name, ok, detail }));
    return { ok: checks.every(c => c.ok), checks };
  };
  const reelQc = r => (r.qc ? qc(r.qc, r.sec) : null);
  /* the gate: a stage is approved by a person, the next one opens only after it, Review needs a passing QC, Delivery needs everything */
  const reelGate = r => {
    const s = r.stage, i = STAGES.indexOf(s);
    if (!(r.ok || {})[s]) return { ok: false, why: `Approve ${s} first. Only you can.` };
    if (s === 'Review') { const q = reelQc(r); if (!q) return { ok: false, why: 'Run the QC check first.' }; if (!q.ok) return { ok: false, why: 'The QC check failed. Nothing is repaired silently.' }; }
    if (i === STAGES.length - 1) return { ok: false, why: 'This is the last stage.' };
    return { ok: true, stage: STAGES[i + 1] };
  };
  const reelDeliver = r => {
    const miss = STAGES.slice(0, -1).find(s => !(r.ok || {})[s]), q = reelQc(r);
    if (r.stage !== 'Delivery') return { ok: false, why: 'Move the reel to Delivery first.' };
    if (miss) return { ok: false, why: `${miss} was never approved.` };
    if (!q || !q.ok) return { ok: false, why: 'The QC check has not passed.' };
    if (!(r.ok || {}).Delivery) return { ok: false, why: 'Approve Delivery first. Only you can.' };
    return { ok: true };
  };

  const PRESETS = { square: [1080, 1080, '1080 x 1080'], portrait: [1080, 1350, '1080 x 1350'], story: [1080, 1920, '1080 x 1920'] };
  const LAYOUTS = ['Panel right', 'Panel left', 'Panel below'];
  const MARGIN = 56, GAP = 12, MAXP = 12, MAXB = 25 * 1024 * 1024, TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const grid = (b, n, cols) => {
    const rows = Math.ceil(n / cols), ch = (b.h - GAP * (rows - 1)) / rows, out = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols), inRow = row === rows - 1 ? n - row * cols : cols, w = (b.w - GAP * (inRow - 1)) / inRow;
      out.push({ x: Math.round(b.x + (i % cols) * (w + GAP)), y: Math.round(b.y + row * (ch + GAP)), w: Math.floor(w), h: Math.floor(ch) });
    }
    return out;
  };
  const split = (a, n, below) => {
    if (n <= 0) return []; if (n === 1) return [a];
    const k = n - 1, f = k > 4 ? 0.6 : 0.68;
    if (below) { const lh = Math.round((a.h - GAP) * f); return [{ x: a.x, y: a.y, w: a.w, h: lh }, ...grid({ x: a.x, y: a.y + lh + GAP, w: a.w, h: a.h - lh - GAP }, k, Math.min(k, 4))]; }
    const lw = Math.round((a.w - GAP) * f); return [{ x: a.x, y: a.y, w: lw, h: a.h }, ...grid({ x: a.x + lw + GAP, y: a.y, w: a.w - lw - GAP, h: a.h }, k, k > 4 ? 2 : 1)];
  };
  /* the photo rectangles (lead first) and the information panel; all inside the margin, nothing overlaps */
  const layout = (name, count, W, H) => {
    const inner = { x: MARGIN, y: MARGIN, w: W - 2 * MARGIN, h: H - 2 * MARGIN }, n = Math.max(0, Math.min(MAXP, count));
    if (name === 'Panel below') { const ph = Math.round(inner.h * (H > W ? 0.36 : 0.4)); return { photos: split({ ...inner, h: inner.h - ph - GAP }, n, true), panel: { x: inner.x, y: inner.y + inner.h - ph, w: inner.w, h: ph } }; }
    const pw = Math.round(inner.w * 0.36), phw = inner.w - pw - GAP, left = name === 'Panel left';
    return { photos: split({ x: left ? inner.x + pw + GAP : inner.x, y: inner.y, w: phw, h: inner.h }, n, false), panel: { x: left ? inner.x : inner.x + phw + GAP, y: inner.y, w: pw, h: inner.h } };
  };
  /* the part of a photo that fills a rectangle without stretching it */
  const cover = (iw, ih, r) => { const k = Math.max(r.w / iw, r.h / ih), sw = r.w / k, sh = r.h / k; return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh }; };
  const okFile = f => TYPES.includes(f.type) ? (f.size > MAXB ? 'larger than 25 MB' : '') : 'not a JPEG, PNG or WebP';
  return { LANES, RULES, lint, socialMove, STAGES, qc, reelQc, reelGate, reelDeliver, PRESETS, LAYOUTS, MAXP, layout, cover, okFile };
})();
if (typeof module !== 'undefined') module.exports = STL;
