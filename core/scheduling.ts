// Optional Hermes cron scheduling API. Every operation uses argv (never a shell) and reads
// the cron list afresh before mutations. Tests must not call the run endpoint.
import type { PluginContext } from "./plugins";
import { hermesAllowed } from "./host";
import { parseScheduleList } from "./scheduling-model";
export { parseScheduleList } from "./scheduling-model";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TEXT = /[\x00-\x1f\x7f]/;

async function invoke(args: string[]): Promise<string> {
  const bin = hermesAllowed() ? Bun.which("hermes") : null;
  if (!bin) throw new Error("Hermes is not installed.");
  const proc = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...process.env, NO_COLOR: "1" } });
  const timer = setTimeout(() => proc.kill(), 20_000);
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited; clearTimeout(timer);
  if (code !== 0) throw new Error((err || out).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim().slice(0, 300) || `Hermes exited ${code}.`);
  return out;
}
const list = async () => parseScheduleList(await invoke(["cron", "list", "--all"]));
const clean = (v: unknown, max: number) => typeof v === "string" && v.trim() && v.trim().length <= max && !TEXT.test(v) ? v.trim() : null;

export default function schedulingModule(ctx: PluginContext) {
  const routes = ctx.routes;
  const workspaces = () => ctx.store.get<Record<string, string>>("workspaces", {});
  const grouped = (jobs: Awaited<ReturnType<typeof list>>) => jobs.map(job => ({ ...job, workspace: workspaces()[job.id] ?? "Planning" })).sort((a, b) => a.workspace.localeCompare(b.workspace) || a.nextRun.localeCompare(b.nextRun));
  routes.get("/jobs", async c => {
    try { return c.json({ jobs: grouped(await list()), fetchedAt: Date.now() }); }
    catch (e) { return c.json({ error: e instanceof Error ? e.message : "Could not read schedules." }, 502); }
  });
  routes.post("/jobs", async c => {
    const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const name = clean(b.name, 80), when = clean(b.when, 100), prompt = clean(b.what, 10_000), workspace = clean(b.workspace, 60) ?? "Planning";
    if (!name || !when || !prompt) return c.json({ error: "Name, what, and when are required." }, 400);
    try {
      const created = await invoke(["cron", "create", "--name", name, "--deliver", "local", "--paused", "--paused-reason", "Created paused in the CaesarOS Scheduling module; review before resuming.", "--", when, prompt]);
      const id = /^\s*Created job:\s*([A-Za-z0-9][A-Za-z0-9_-]{0,63})\s*$/m.exec(created)?.[1];
      const jobs = await list(); const job = jobs.find(x => x.id === id);
      if (!id || !job || job.state !== "paused") return c.json({ error: "Could not verify the new job is paused; inspect Hermes before retrying.", jobs: grouped(jobs) }, 502);
      ctx.store.set("workspaces", { ...workspaces(), [id]: workspace });
      return c.json({ job: { ...job, workspace }, jobs: grouped(jobs) }, 201);
    } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Could not create schedule." }, 502); }
  });
  routes.patch("/jobs/:id", async c => {
    const id = c.req.param("id");
    const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const when = clean(b.when, 100);
    if (!ID.test(id) || !when) return c.json({ error: "A valid task id and new schedule are required." }, 400);
    try {
      const before = await list();
      if (!before.some(j => j.id === id)) return c.json({ error: "Schedule not found." }, 404);
      await invoke(["cron", "edit", id, "--schedule", when]);
      const jobs = await list();
      if (jobs.find(j => j.id === id)?.schedule !== when) return c.json({ error: "Hermes did not confirm the new schedule.", jobs: grouped(jobs) }, 502);
      return c.json({ jobs: grouped(jobs), message: "Schedule updated." });
    } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Could not reschedule task." }, 502); }
  });
  routes.post("/jobs/:id/:action", async c => {
    const { id, action } = c.req.param();
    if (!ID.test(id) || !["pause", "resume", "run"].includes(action)) return c.json({ error: "Invalid job or action." }, 400);
    try {
      const before = await list(); const job = before.find(j => j.id === id);
      if (!job) return c.json({ error: "Schedule not found." }, 404);
      if (action === "run") {
        const b = await c.req.json().catch(() => ({})) as { acknowledge?: unknown };
        if (b.acknowledge !== true) return c.json({ error: "Confirm that this job may run and cause its configured effects." }, 400);
      }
      await invoke(["cron", action, id]);
      const jobs = await list();
      if (action !== "run" && jobs.find(j => j.id === id)?.state !== (action === "pause" ? "paused" : "active")) return c.json({ error: "Hermes did not confirm the requested state.", jobs: grouped(jobs) }, 502);
      return c.json({ jobs: grouped(jobs), message: action === "run" ? "Job queued with Hermes." : `Job ${action}d.` });
    } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Schedule operation failed." }, 502); }
  });
}

