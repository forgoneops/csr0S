// Module registry: modules/<id>/plugin.json (validated) + optional server.ts, mounted at /api/p/<id>/.
// Modules live in `plugins/` (core extras) and, when the person has them, in `owner/` (their own layer).
// The core never imports from either: it only reads manifests and mounts what is there. A root that
// does not exist is skipped, so deleting `owner/` leaves the core untouched (R45).
import { Hono } from "hono";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { PluginManifest, visibleContributions, type ModuleInfo } from "./schema";
import { kv, DATA, type KV } from "./db";
import { listen, publish } from "./events";
import { Life } from "./plugin-life";
import { ROOT } from "./root";

export type PluginContext = {
  manifest: PluginManifest;
  routes: Hono;            // mounted at /api/p/<id>
  store: KV;               // namespaced to the module
  dataDir: string;         // DATA/modules/<id>, for files
  publish: (type: string, data: unknown) => void;
  listen: (fn: (type: string, data: unknown) => void) => () => void;
  interval: (fn: () => void, ms: number) => void;
  onStop: (fn: () => void) => void;
  log: (...args: unknown[]) => void;
};

/** The folders a module can come from. `CAESAROS_MODULE_DIRS` overrides the list. Missing folders are fine. */
export const moduleRoots = (env = process.env.CAESAROS_MODULE_DIRS): string[] =>
  (env ?? "plugins,owner").split(",").map((s) => s.trim()).filter(Boolean).map((d) => (isAbsolute(d) ? d : join(ROOT, d)));   // an absolute path is a private owner layer kept outside this repo

type Entry = { manifest: PluginManifest; life: Life | null; running: boolean; root: string };
export type Plugins = {
  active(): PluginManifest[];        // what the app may show: enabled and running
  all(): ModuleInfo[];               // everything found, for Settings
  setEnabled(id: string, enabled: boolean): "now" | "restart" | "unknown" | "unavailable";
};

/** A consumer build (CAESAROS_EDITION=standard) never starts a module whose manifest edition is "owner".
 *  A manifest without an edition counts as owner, so a new module cannot leak into a consumer build. */
export const leftOutOfEdition = (edition: "owner" | "standard", env: string | undefined = process.env.CAESAROS_EDITION) => (env === "standard" || env === "consumer") && edition === "owner";

/** Finds the modules, starts the enabled ones and returns a handle to switch them on and off. A module
 *  switched off at start is not initialised at all. Switched off later it is paused: its routes answer
 *  404, its timers and listeners stop, its data stays. One that was never started needs a restart.
 *  `disabled` = the person's off list; `enabled` = the ids they switched on explicitly, so a manifest with
 *  `defaultOff` (a dev fixture, an optional extra) stays off until it is named there. */
export async function loadPlugins(app: Hono, disabled: string[] = [], enabledIds: string[] = []): Promise<Plugins> {
  const entries = new Map<string, Entry>();
  const isOn = (id: string, defaultOff: boolean) => !disabled.includes(id) && !(defaultOff && !enabledIds.includes(id));
  for (const root of moduleRoots()) {
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root).sort()) {
      const dir = join(root, id), file = join(dir, "plugin.json");
      if (!existsSync(file)) continue;
      if (entries.has(id)) { console.error(`module ${id}: already loaded from another folder, ignoring ${dir}`); continue; }
      let raw: unknown;
      try { raw = JSON.parse(readFileSync(file, "utf8")); }
      catch (e) { console.error(`module ${id}: plugin.json is not valid JSON and was skipped`, (e as Error).message); continue; }
      const parsed = PluginManifest.safeParse(raw);
      if (!parsed.success || parsed.data.id !== id) { console.error(`module ${id}: invalid plugin.json`, parsed.error?.issues ?? "id mismatch"); continue; }
      const manifest = parsed.data;
      if (!isOn(id, manifest.defaultOff) || leftOutOfEdition(manifest.edition)) { entries.set(id, { manifest, life: null, running: false, root }); console.log(`module ${id} is switched off`); continue; }
      const routes = new Hono(), life = new Life(listen), entry: Entry = { manifest, life, running: true, root };
      routes.use("*", async (c, next) => (entry.running ? next() : c.json({ error: `${manifest.name} is switched off` }, 404)));
      const server = join(dir, "server.ts");
      if (existsSync(server)) {
        const dataDir = join(DATA, "modules", id);
        mkdirSync(dataDir, { recursive: true });
        const ctx: PluginContext = {
          manifest, routes, store: kv(`module.${id}`), dataDir,
          publish: (type, data) => publish(`${id}.${type}`, data), listen: (fn) => life.listen(fn),
          interval: (fn, ms) => life.interval(fn, ms), onStop: (fn) => life.onStop(fn),
          log: (...args) => console.log(`[${id}]`, ...args),
        };
        // one module failing to start is logged and skipped; the app and the other modules keep running
        try { await (await import(server)).default(ctx); }
        catch (e) { console.error(`module ${id} failed to start and was skipped:`, e instanceof Error ? e.message : e); continue; }
      }
      app.route(`/api/p/${id}`, routes);
      entries.set(id, entry);
      console.log(`module ${id} ${manifest.version} loaded`);
    }
  }
  return {
    active: () => [...entries.values()].filter((e) => e.running).map((e) => e.manifest),
    all: () => [...entries.values()].map((e) => ({
      id: e.manifest.id, name: e.manifest.name, description: e.manifest.description, version: e.manifest.version,
      group: e.manifest.group, kind: e.manifest.kind, edition: e.manifest.edition, tags: e.manifest.tags,
      nav: e.manifest.nav, enabled: isOn(e.manifest.id, e.manifest.defaultOff) && !leftOutOfEdition(e.manifest.edition), running: e.running,
      defaultOff: e.manifest.defaultOff, available: !leftOutOfEdition(e.manifest.edition),
      // Never a disabled or an edition-left-out module: the shell renders only what is allowed right now.
      contributions: visibleContributions(e.manifest, e.running),
    })),
    setEnabled(id, enabled) {
      const e = entries.get(id); if (!e) return "unknown";
      // A module this edition never starts cannot be switched on here; saying so beats a switch that does nothing.
      if (leftOutOfEdition(e.manifest.edition)) return "unavailable";
      const i = disabled.indexOf(id);
      if (enabled) { if (i >= 0) disabled.splice(i, 1); if (!enabledIds.includes(id)) enabledIds.push(id); }
      else { if (i < 0) disabled.push(id); const j = enabledIds.indexOf(id); if (j >= 0) enabledIds.splice(j, 1); }
      if (!e.life) return enabled ? "restart" : "now";           // never started in this run
      if (enabled) { e.running = true; e.life.resume(); } else { e.running = false; e.life.pause(); }
      return "now";
    },
  };
}
