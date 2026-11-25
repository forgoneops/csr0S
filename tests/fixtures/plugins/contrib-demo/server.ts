// The fixture behind the contribution surfaces: one read path, one declared action, a timer and a listener.
// The timer and the listener run only while the module is on, so a test can prove a disable leaves neither.
import type { PluginContext } from "../../../../core/plugins";

export default function contribDemo(ctx: PluginContext) {
  ctx.routes.get("/status", (c) => c.json({ value: String(ctx.store.get<number>("pings", 0)), tone: "ok" }));
  ctx.routes.get("/ticks", (c) => c.json({ ticks: ctx.store.get<number>("ticks", 0), heard: ctx.store.get<number>("heard", 0) }));
  ctx.routes.post("/bump", (c) => {
    const pings = ctx.store.get<number>("pings", 0) + 1;
    ctx.store.set("pings", pings);
    ctx.publish("bump", { pings });
    return c.json({ pings });
  });
  // A background job and an event subscription: both must stop the moment the module is switched off.
  ctx.interval(() => ctx.store.set("ticks", ctx.store.get<number>("ticks", 0) + 1), 1000);
  ctx.listen((type) => { if (type === "probe") ctx.store.set("heard", ctx.store.get<number>("heard", 0) + 1); });
  ctx.onStop(() => ctx.log("stopped"));
}