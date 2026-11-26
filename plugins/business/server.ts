// Business: the one thing it stores is Reach, a list of numbers you or an agent record (followers, visits, replies).
// Overview, Finances and Progress read other parts of the app; Finance figures live in the Finance module, not here.
import type { PluginContext } from "../../core/plugins";

export type ReachPoint = { id: string; label: string; value: number; at: number };
const MAX = 500;

export default function business(ctx: PluginContext) {
  const all = () => ctx.store.get<ReachPoint[]>("reach", []);
  ctx.routes.get("/reach", (c) => c.json(all()));
  ctx.routes.post("/reach", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { label?: unknown; value?: unknown; at?: unknown };
    const label = typeof b.label === "string" ? b.label.trim().slice(0, 40) : "";
    const value = typeof b.value === "number" && Number.isFinite(b.value) ? b.value : NaN;
    if (!label || Number.isNaN(value) || value < 0) return c.json({ error: "A reach number needs a label and a value of 0 or more." }, 400);
    const at = typeof b.at === "number" && Number.isFinite(b.at) ? b.at : Date.now();
    const p: ReachPoint = { id: crypto.randomUUID().slice(0, 8), label, value, at };
    ctx.store.set("reach", [...all(), p].slice(-MAX));
    return c.json(p, 201);
  });
  ctx.routes.delete("/reach/:id", (c) => {
    const rest = all().filter((p) => p.id !== c.req.param("id"));
    ctx.store.set("reach", rest);
    return c.json({ removed: true });
  });
}
