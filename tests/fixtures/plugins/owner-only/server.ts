import type { PluginContext } from "../../../../core/plugins";

export default function ownerOnly(ctx: PluginContext) {
  ctx.routes.get("/status", (c) => c.json({ value: "owner", tone: "ok" }));
}