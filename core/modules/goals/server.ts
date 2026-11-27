import type { Context } from "hono";
import { access } from "../../principal";
import type { PluginContext } from "../../plugins";
import { localDate, make, HORIZONS, carryOver, streak, stateOf, type Goal } from "./model";
const body = async (c: Context) => await c.req.json().catch(() => ({})) as Record<string, unknown>;
export default function ({ routes, store }: PluginContext) {
  routes.use("*", async (c, next) => access.principal(c).kind === "operator" ? next() : c.json({ error: "operator_only" }, 403));
  const load = () => store.get<Goal[]>("goals", []);
  const save = (items: Goal[]) => store.set("goals", items);
  const view = () => { const today = localDate(), goals = load(); return { today, goals, streaks: Object.fromEntries(HORIZONS.map(h => [h, streak(goals, h, today)])), carriable: goals.some(g => g.status === "active" && stateOf(g, today) === "past" && !goals.some(n => n.renewedFrom === g.id)) }; };
  routes.get("/", c => c.json(view()));
  routes.post("/", async c => { const b = await body(c); try { save([...load(), make(b.horizon as typeof HORIZONS[number], String(b.title ?? ""), localDate(), crypto.randomUUID())]); return c.json(view()); } catch (e) { return c.json({ error: (e as Error).message }, 400); } });
  routes.post("/:id", async c => {
    const b = await body(c), all = load(), goal = all.find(g => g.id === c.req.param("id"));
    if (!goal) return c.json({ error: "No such goal." }, 404);
    if (typeof b.title === "string") { const title = b.title.trim().slice(0, 200); if (!title) return c.json({ error: "A goal needs a title." }, 400); goal.title = title; }
    if (typeof b.notes === "string") goal.notes = b.notes.slice(0, 2000);
    if (b.status === "active" || b.status === "done") goal.status = b.status;
    goal.updatedAt = Date.now(); save(all); return c.json(view());
  });
  routes.delete("/:id", c => { save(load().filter(g => g.id !== c.req.param("id"))); return c.json(view()); });
  routes.post("/carry", c => { const all = load(); save([...all, ...carryOver(all, localDate(), () => crypto.randomUUID())]); return c.json(view()); });
}
