// A force-directed layout (Fruchterman-Reingold) for the notes map, deterministic: the same notes always land in the same
// places, so the map does not reshuffle on every visit. Ported from the old cockpit's brain map (behaviour only). Notes with
// no links go to a tidy strip at the bottom instead of being pushed to the edges by the forces.
export type Pos = { x: number; y: number };
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

export function layout(allIds: string[], edges: { from: string; to: string }[], w = 1000, h = 640): Map<string, Pos> {
  const MX = 70, MY = 30, pos = new Map<string, Pos>(), known = new Set(allIds), linked = new Set<string>();
  for (const e of edges) if (e.from !== e.to && known.has(e.from) && known.has(e.to)) { linked.add(e.from); linked.add(e.to); }
  const lone = allIds.filter((id) => !linked.has(id)).sort(), ids = allIds.filter((id) => linked.has(id));
  const gx = Math.min(110, Math.max(46, (w - 2 * MX) / 8)), cols = Math.max(1, Math.floor((w - 2 * MX) / gx) + 1), rows = Math.ceil(lone.length / cols);
  const stripTop = lone.length ? h - 30 - (rows - 1) * 54 : h;
  lone.forEach((id, i) => pos.set(id, { x: MX + (i % cols) * gx, y: stripTop + Math.floor(i / cols) * 54 }));
  if (lone.length) h = Math.max(120, stripTop - 40);
  const n = ids.length, idx = new Map(ids.map((id, i) => [id, i]));
  if (!n) return pos;
  const x = new Float64Array(n), y = new Float64Array(n), dx = new Float64Array(n), dy = new Float64Array(n);
  ids.forEach((id, i) => { const a = hash(id) * Math.PI * 2, r = (0.15 + 0.35 * hash(id + "r")) * Math.min(w, h); x[i] = w / 2 + Math.cos(a) * r; y[i] = h / 2 + Math.sin(a) * r; });
  const E = edges.flatMap((e) => { const a = idx.get(e.from), b = idx.get(e.to); return a === undefined || b === undefined || a === b ? [] : [[a, b] as const]; });
  const k = Math.sqrt((w * h) / n) * 0.8, iters = n > 400 ? 60 : n > 200 ? 120 : 200;
  let t = Math.min(w, h) / 8;
  for (let it = 0; it < iters; it++) {
    dx.fill(0); dy.fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let ex = x[i] - x[j], ey = y[i] - y[j], d2 = ex * ex + ey * ey;
      if (d2 < 0.01) { ex = hash(ids[i] + j) - 0.5; ey = hash(ids[j] + i) - 0.5; d2 = ex * ex + ey * ey + 0.01; }
      const f = (k * k) / d2; dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f;
    }
    for (const [a, b] of E) { const ex = x[a] - x[b], ey = y[a] - y[b], d = Math.sqrt(ex * ex + ey * ey) || 0.01, f = d / k; dx[a] -= ex * f; dy[a] -= ey * f; dx[b] += ex * f; dy[b] += ey * f; }
    for (let i = 0; i < n; i++) {
      dx[i] += (w / 2 - x[i]) * 0.01; dy[i] += (h / 2 - y[i]) * 0.01;
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01, m = Math.min(d, t);
      x[i] = Math.max(MX, Math.min(w - MX, x[i] + (dx[i] / d) * m)); y[i] = Math.max(MY, Math.min(h - MY, y[i] + (dy[i] / d) * m));
    }
    t *= 0.97;
  }
  ids.forEach((id, i) => pos.set(id, { x: x[i], y: y[i] }));
  return pos;
}
