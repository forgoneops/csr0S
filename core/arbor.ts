// The Arbor (plan 8.1): the notes as a tree. A folder is a branch from the trunk, a note is a leaf along it, the oldest nearest the trunk.
// Pure and deterministic (the same notes give the same tree, whatever order they arrive in), so the picture does not move between visits.
export type TreeNote = { id: string; folder: string; updated: number };
export type Branch = { folder: string; x1: number; y1: number; x2: number; y2: number };
const W = 1000, H = 640, TX = W / 2, TY = 410, LEN = 330, MAX_ANGLE = (75 * Math.PI) / 180;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function treeLayout(notes: TreeNote[]): { nodes: Record<string, [number, number]>; branches: Branch[] } {
  const by = new Map<string, TreeNote[]>(); for (const n of notes) (by.get(n.folder) ?? by.set(n.folder, []).get(n.folder)!).push(n);
  const groups = [...by].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])), K = groups.length;
  const nodes: Record<string, [number, number]> = {}, branches: Branch[] = [];
  groups.forEach(([folder, list], k) => {
    const a = K === 1 ? 0 : -MAX_ANGLE + (2 * MAX_ANGLE * k) / (K - 1), dx = Math.sin(a), dy = -Math.cos(a);
    branches.push({ folder, x1: TX, y1: TY, x2: Math.round(TX + dx * LEN), y2: Math.round(TY + dy * LEN) });
    [...list].sort((p, q) => p.updated - q.updated || p.id.localeCompare(q.id)).forEach((n, i, all) => {
      const t = (i + 1) / (all.length + 1), side = i % 2 ? 1 : -1, off = side * (8 + (hash(n.id) % 14));
      nodes[n.id] = [Math.round(clamp(TX + dx * LEN * t - dy * off, 10, W - 10)), Math.round(clamp(TY + dy * LEN * t + dx * off, 10, H - 10))];
    });
  });
  return { nodes, branches };
}
