// The smallest real module: it answers on /api/p/hello/ and keeps a counter in its own store.
// Nothing here is special-cased by the core; disable it and every route answers 404.
import type { PluginContext } from "../../core/plugins";

export default function hello(ctx: PluginContext) {
  ctx.routes.get("/", (c) => c.json({ module: ctx.manifest.id, version: ctx.manifest.version, pings: ctx.store.get<number>("pings", 0) }));
  ctx.routes.post("/ping", (c) => {
    const next = ctx.store.get<number>("pings", 0) + 1;
    ctx.store.set("pings", next);
    ctx.publish("ping", { pings: next });
    return c.json({ pings: next });
  });
  ctx.onStop(() => ctx.log("stopped"));
}
