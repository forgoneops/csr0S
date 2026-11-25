// The engine registry: a Map of adapters by id. No I/O here; registering replaces by id.
// `resetEngines` is the test seam: it drops everything and puts the shipped defaults back.
import type { EngineAdapter } from "./types";

const engines = new Map<string, EngineAdapter>();
let defaults: () => EngineAdapter[] = () => [];

export function registerEngine(adapter: EngineAdapter): void { engines.set(adapter.id, adapter); }
export function unregisterEngine(id: string): void { engines.delete(id); }
export function getEngine(id: string): EngineAdapter | undefined { return engines.get(id); }
export function listEngines(): EngineAdapter[] { return [...engines.values()]; }

/** index.ts hands over the shipped defaults once; the registry itself stays free of product names. */
export function setDefaultEngines(make: () => EngineAdapter[]): void { defaults = make; resetEngines(); }

export function resetEngines(): void {
  engines.clear();
  for (const adapter of defaults()) engines.set(adapter.id, adapter);
}
