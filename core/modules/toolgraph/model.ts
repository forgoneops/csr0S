export type ToolStep = { id: string; kind: string; label: string; status: string; startedAt?: number; endedAt?: number; elapsedMs?: number };
export type ToolRun = { id: string; agent: string; status: string; startedAt: number; steps: ToolStep[] };
export type ToolMetric = { tool: string; calls: number; errors: number; averageMs: number | null; totalMs: number };
const CALL_KINDS = new Set(["tool", "command", "edit", "read", "search"]);

/** Summarize only tool-like steps. No prompt, output, path, or thread data is exposed. */
export function summarize(runs: ToolRun[]) {
  const metrics = new Map<string, { calls: number; errors: number; totalMs: number; timed: number }>();
  const paths: { agent: string; status: string; calls: number; totalMs: number; chain: string[] }[] = [];
  let totalCalls = 0, totalErrors = 0;
  for (const run of runs) {
    let chain: string[] = [], chainMs = 0;
    for (const step of run.steps) {
      if (!CALL_KINDS.has(step.kind)) continue;
      const tool = step.label.trim() || step.kind;
      const hasTiming = typeof step.elapsedMs === "number" && Number.isFinite(step.elapsedMs) && step.elapsedMs >= 0;
      const duration = hasTiming ? step.elapsedMs! : 0;
      const metric = metrics.get(tool) ?? { calls: 0, errors: 0, totalMs: 0, timed: 0 };
      metric.calls++; metric.totalMs += duration; if (hasTiming) metric.timed++;
      if (step.status === "failed") { metric.errors++; totalErrors++; }
      metrics.set(tool, metric); totalCalls++;
      chain.push(tool); chainMs += duration;
    }
    if (chain.length) paths.push({ agent: run.agent, status: run.status, calls: chain.length, totalMs: chainMs, chain });
  }
  const tools: ToolMetric[] = [...metrics].map(([tool, m]) => ({ tool, calls: m.calls, errors: m.errors, totalMs: m.totalMs, averageMs: m.timed ? Math.round(m.totalMs / m.timed) : null })).sort((a,b) => b.totalMs - a.totalMs || a.tool.localeCompare(b.tool));
  paths.sort((a,b) => b.totalMs - a.totalMs || b.calls - a.calls || a.agent.localeCompare(b.agent));
  return { tools, hottestPath: (paths[0] ?? null) as (typeof paths[number] | null), totals: { calls: totalCalls, errors: totalErrors, runs: paths.length } };
}
