// Entry of the compiled core (package-linux.sh). It names the shipped modules by literal path so `bun build --compile`
// embeds them in the executable, hands them to the loader through a global, then starts the core. From source the core
// never imports a module: it reads manifests and imports server.ts from disk. tests/embedded-modules.test.ts keeps this list whole.
(globalThis as { __CAESAROS_EMBEDDED?: Record<string, () => Promise<{ default: (ctx: never) => unknown }>> }).__CAESAROS_EMBEDDED = {
  "plugins/business": () => import("../plugins/business/server"),
  "plugins/fleet": () => import("../plugins/fleet/server"),
  "plugins/hello": () => import("../plugins/hello/server"),
  "plugins/leads": () => import("../plugins/leads/server"),
  "core/modules/finance": () => import("../core/modules/finance/server"),
  "core/modules/goals": () => import("../core/modules/goals/server"),
  "core/modules/ideas": () => import("../core/modules/ideas/server"),
  "core/modules/scheduling": () => import("../core/modules/scheduling/server"),
  "core/modules/toolgraph": () => import("../core/modules/toolgraph/server"),
};
await import("../core/server");
export {};
