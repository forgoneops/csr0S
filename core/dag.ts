// A plan as a small graph (layer tool caesar_dag, plan 3.3a): every node is one Board card with a brief. The graph is refused,
// never repaired, when it is not sound: cycles, unknown edges, more than 48 nodes, or two nodes that write the same path
// with no edge between them (they would overwrite each other).
export type DagNode = { key: string; task: string; deliverable: string; scope: string[]; verify: string; stop: string; after: string[] };
export const MAX_NODES = 48;
const KEY = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const overlap = (a: string, b: string) => a === b || a.startsWith(b + "/") || b.startsWith(a + "/");

export function parseDag(input: unknown): { nodes: DagNode[] } | { error: string } {
  if (!Array.isArray(input) || !input.length) return { error: "give at least one node" };
  if (input.length > MAX_NODES) return { error: `a plan has at most ${MAX_NODES} nodes` };
  const nodes: DagNode[] = [];
  for (const raw of input) {
    const r = (raw ?? {}) as Record<string, unknown>, key = str(r.key, 32);
    if (!KEY.test(key)) return { error: `node key "${key}" must be lowercase letters, digits, - or _` };
    if (nodes.some((n) => n.key === key)) return { error: `node key "${key}" is used twice` };
    const n: DagNode = { key, task: str(r.task, 200), deliverable: str(r.deliverable, 400), verify: str(r.verify, 400), stop: str(r.stop, 400),
      scope: Array.isArray(r.scope) ? r.scope.map((s) => str(s, 200).replace(/^\.?\//, "").replace(/\/+$/, "")).filter(Boolean).slice(0, 20) : [],
      after: Array.isArray(r.after) ? r.after.map((s) => str(s, 32)).filter(Boolean) : [] };
    for (const f of ["task", "deliverable", "verify", "stop"] as const) if (!n[f]) return { error: `node "${key}" needs ${f}` };
    if (n.scope.some((s) => s.includes("..") || s.startsWith("~"))) return { error: `node "${key}" has a scope outside the project` };
    nodes.push(n);
  }
  const by = new Map(nodes.map((n) => [n.key, n]));
  for (const n of nodes) for (const a of n.after) { if (!by.has(a)) return { error: `node "${n.key}" waits for unknown node "${a}"` }; if (a === n.key) return { error: `node "${n.key}" waits for itself` }; }
  // reachability (also finds cycles: a node that can reach itself)
  const reach = new Map<string, Set<string>>();
  const up = (k: string, seen: string[] = []): Set<string> => {
    if (seen.includes(k)) throw new Error(`there is a cycle through "${k}"`);
    const hit = reach.get(k); if (hit) return hit;
    const s = new Set<string>(); for (const a of by.get(k)!.after) { s.add(a); for (const x of up(a, [...seen, k])) s.add(x); }
    reach.set(k, s); return s;
  };
  try { for (const n of nodes) up(n.key); } catch (e) { return { error: (e as Error).message }; }
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (reach.get(a.key)!.has(b.key) || reach.get(b.key)!.has(a.key)) continue;
    const hit = a.scope.find((x) => b.scope.some((y) => overlap(x, y)));
    if (hit) return { error: `"${a.key}" and "${b.key}" both write ${hit} with no edge between them` };
  }
  return { nodes };
}

/** The brief a node carries in its card note. */
export const briefOf = (n: DagNode) => `TASK: ${n.task}\nDELIVERABLE: ${n.deliverable}\nSCOPE: ${n.scope.join(", ") || "read only"}\nVERIFY: ${n.verify}\nSTOP WHEN: ${n.stop}`;
