// One-shot text from the person's own engine: the prompt goes in, the whole answer comes out. It uses the same choice and the same
// failover as chat (and so respects "Local only"); used by jobs that need a model but no conversation, such as UI translation.
import { getEngine, listEngines } from "./engines";
import { chatTargets, defaultTarget } from "./crew";
import { failoverStream } from "./failover";

export function engineRun(localOnly: () => boolean): (prompt: string) => Promise<string> {
  return async (prompt) => {
    const lo = localOnly();
    const { target, message } = defaultTarget(await chatTargets(lo));
    const primary = target && getEngine(target.id);
    if (!primary) throw new Error(message ?? "no engine can answer");
    const model = (await primary.models().catch(() => []))[0]?.id ?? "default";
    let out = "";
    const signal = AbortSignal.timeout(180_000);                       // a hung engine must not hold the job forever
    for await (const ev of failoverStream(primary, listEngines(), [{ role: "user", content: prompt }], { model, localOnly: lo, signal })) if (ev.type === "delta") out += ev.text;
    if (!out.trim()) throw new Error("the engine returned nothing");
    return out;
  };
}
