/* A small QR code encoder, written for CaesarOS (no outside code). Byte mode, error correction L, versions 1 to 6
   (up to 134 bytes: enough for a link with its key), mask 0. window.CaesarQR.svg(text) returns an SVG string, or ''
   when the text is too long. shortcut: one fixed mask, a few readers dislike big flat areas; the link also shows as text. */
(() => {
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const gen = n => { let p = [1]; for (let i = 0; i < n; i++) { const q = new Array(p.length + 1).fill(0); p.forEach((c, j) => { q[j] ^= c; q[j + 1] ^= mul(c, EXP[i]); }); p = q; } return p; };
  const rs = (data, n) => { const g = gen(n), r = new Array(n).fill(0); for (const d of data) { const f = d ^ r[0]; r.shift(); r.push(0); if (f) for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); } return r; };
  // version: [error-correction codewords per block, [[blocks, data codewords per block]], alignment centres]
  const VER = [null, [7, [[1, 19]], []], [10, [[1, 34]], [6, 18]], [15, [[1, 55]], [6, 22]], [20, [[1, 80]], [6, 26]], [26, [[1, 108]], [6, 30]], [18, [[2, 68]], [6, 34]]];

  function svg(text) {
    const bytes = [...new TextEncoder().encode(String(text))];
    let v = 1; const cap = x => VER[x][1].reduce((a, [n, d]) => a + n * d, 0);
    while (v <= 6 && cap(v) < bytes.length + 2) v++;
    if (v > 6) return '';
    const [ecn, blocks, al] = VER[v], total = cap(v);
    // bit stream: mode 0100, 8-bit length, the bytes, terminator, padding
    const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, total * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; data.length < total; pad ^= 0xec ^ 0x11) data.push(pad);
    // split into blocks, add error correction, interleave
    const db = [], eb = []; let at = 0;
    for (const [n, d] of blocks) for (let i = 0; i < n; i++) { const b = data.slice(at, at + d); at += d; db.push(b); eb.push(rs(b, ecn)); }
    const out = []; for (let i = 0; i < Math.max(...db.map(b => b.length)); i++) db.forEach(b => { if (i < b.length) out.push(b[i]); });
    for (let i = 0; i < ecn; i++) eb.forEach(b => out.push(b[i]));
    // the grid
    const size = 17 + 4 * v, m = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { if (x < 0 || y < 0 || x >= size || y >= size) return; m[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
    for (const cx of al) for (const cy of al) { if ((cx === 6 && cy === 6) || (cx === 6 && cy === al[al.length - 1]) || (cx === al[al.length - 1] && cy === 6)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    // format information: level L, mask 0
    let f = 8 << 10; for (let i = 14; i >= 10; i--) if ((f >> i) & 1) f ^= 0x537 << (i - 10);
    const fmt = ((8 << 10) | (f & 0x3ff)) ^ 0x5412, bit = i => ((fmt >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i)); set(8, size - 8, true);
    // data, zigzag from the bottom right, mask 0
    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && k < out.length * 8) { m[y][x] = ((out[k >> 3] >> (7 - (k & 7))) & 1) === 1; k++; }
        if (!fn[y][x] && (x + y) % 2 === 0) m[y][x] = !m[y][x];
      }
    }
    const q = 4; let d = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
    return `<svg class="gw-qr" viewBox="0 0 ${size + 2 * q} ${size + 2 * q}" shape-rendering="crispEdges" role="img" aria-label="QR code of the link"><rect width="100%" height="100%" style="fill:var(--ink,#e8ecff)"/><path d="${d}" style="fill:var(--bg,#05060d)"/></svg>`;
  }
  window.CaesarQR = { svg };
  if (typeof module !== 'undefined') module.exports = { svg };
})();
