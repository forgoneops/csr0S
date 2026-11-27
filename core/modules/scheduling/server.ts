import scheduling from "../../scheduling";
import type { PluginContext } from "../../plugins";

export default function start(ctx: PluginContext) {
  scheduling(ctx);
}
