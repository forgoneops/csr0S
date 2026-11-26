// CaesarOS core: a loopback-only server. Auth, settings, events, packs, modules and the built web app.
// It runs on a plain machine with no gateway, no owner services and no network tools:
//   bun core/server.ts            serves web/dist
//   bun core/server.ts --dev      API only (vite serves the UI on :5173 and proxies /api and /packs)
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildIdOf } from "./build-id";
import { join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { DATA, kv } from "./db";
import { isolationStatus } from "./sandbox";
import { stream } from "./events";
import { loadPlugins } from "./plugins";
import { Settings } from "./schema";
import { access, knownHost } from "./principal";
import { CLI_TOOLS } from "./engines/cli";
import { advise, readMachine } from "./hardware";
import { modelPullApi } from "./model-pull";
import { gatewayApi } from "./gateway-api";
import { backupApi } from "./backup";
import { knowledgeApi } from "./knowledge";
import { projectsApi } from "./projects";
import { runningApi } from "./running";
import { pairingApi } from "./pairing";
import { handoffApi } from "./handoff";
import { notesyncApi, startNoteSync } from "./notesync";
import { chatsyncApi, startChatSync } from "./chatsync";
import { syncApi } from "./syncall";
import { feedApi } from "./synclog";
import { authApi, authGate } from "./auth";
import { mirrorApi, mirrorMoreApi } from "./mirror";
import { weatherApi } from "./weather";
import { newsApi } from "./news";
import { speechApi } from "./speech";
import { imageApi } from "./imagegen";
import { boardApi } from "./board";
import { driftApi } from "./drift";
import { hudApi } from "./windowinfo";
import { createTts, ttsApi, ttsPaths, type Tts } from "./tts";
import { createMail, mailApi, type Mail } from "./mail";
import { calendarApi } from "./calendar";
import { usageApi } from "./usage";
import { skillsApi } from "./skills";
import { installGateApi } from "./install-gate";
import { searchApi } from "./search";
import { listsApi } from "./lists";
import { vaultApi } from "./vault";
import { gatewayRoutes, secretStore } from "./gateways";
import { modelServerRoutes, syncModelServers } from "./model-servers";
import { noteRoutes } from "./notes";
import { crossSiteWrite, isWrite } from "./csrf";
import { watchParent } from "./parent-watch";
import { packIndex } from "./packs";
import { recent, record as recordAudit } from "./audit";
import { detect } from "./detect";
import { chatApi } from "./chat";
import { approvalsApi } from "./approvals";
import { crewApi } from "./crew";
import { orchestrationApi } from "./orchestration";
import { i18nApi } from "./i18n";
import { commandsApi } from "./commands";
import { hermesConfApi } from "./hermesconf";
import { engineRun } from "./engine-run";
import { computerApi } from "./computer";
import { exposeApi } from "./expose";
import { createWebGate } from "./webgate";
import { listEngines } from "./engines";
import { terminalSocket, terminals, useTerminal } from "./terminal";
import { ROOT } from "./root";

export const VERSION = "0.1.0";
const STARTED_AT = Date.now();   // lets a launcher tell a core that predates the code on disk from a current one
const PORT = Number(process.env.CAESAROS_PORT ?? 4410);
const HOST = process.env.CAESAROS_HOST ?? "127.0.0.1";
const WEB = join(ROOT, "web", "dist");
/** The Atrium: the app's face (the approved prototype), served at the root. The older React shell still answers /chat, /settings and the other routes. */
const ATRIUM = join(ROOT, "web", "atrium");
const PACKS = join(ROOT, "packs");
const dev = process.argv.includes("--dev");

export const app = new Hono();
const core = kv("core");

// Serve as web app (optional second listener): anything that is not on this machine must carry the gateway token.
const webgate = createWebGate({ store: kv("webgate"), port: Number(process.env.CAESAROS_GATEWAY_PORT ?? PORT), fetch: (req, env) => app.fetch(req, env) });
app.use("*", webgate.gate());
// An optional owner password (off by default): with one set, the page and the API ask for a login first.
app.use("*", authGate());
authApi(app, (c) => access.principal(c).kind === "operator");

// A name that is not this machine's (DNS rebinding) never reaches the API.
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/api/") && !knownHost(c.req.header("host"))) return c.json({ error: "unknown host" }, 421);
  // A write must come from this app's own pages, never from another site the person happens to have open.
  if (path.startsWith("/api/")) {
    const why = crossSiteWrite(c.req.method, { origin: c.req.header("origin"), host: c.req.header("host"), secFetchSite: c.req.header("sec-fetch-site") });
    if (why) return c.json({ error: "cross_site_write_refused", why }, 403);
    // Writes change the control plane (settings, gateways, model servers, agent tokens, module switches). Over the
    // network only the operator's own browser may make them; an agent token may write only to a private module path
    // the module itself guards. In-process calls (tests, boot) have no server object and are not network callers.
    const network = !!(c.env as { server?: unknown } | undefined)?.server;
    if (network && isWrite(c.req.method) && path !== "/api/pair" && path !== "/api/login" && path !== "/api/logout" && path !== "/api/handoff" && path !== "/api/sync/notes" && path !== "/api/sync/chats" && access.principal(c).kind !== "operator" && !access.passesGlobalLock(c, path) && !((path.startsWith("/api/computer/") || path.startsWith("/api/board/agent")) && access.principal(c).kind === "agent"))   // computer calls are gated again by the token scope and the armed switch
      return c.json({ error: "operator_only" }, 403);
  }
  return next();
});

app.get("/api/health", (c) => c.json({ ok: true, name: "CaesarOS", version: VERSION }));
const buildId = () => buildIdOf(WEB, ATRIUM);
app.get("/api/version", (c) => c.json({ version: VERSION, build: buildId(), startedAt: STARTED_AT }));

const settings = () => Settings.parse(core.get("settings", {}));
app.get("/api/settings", (c) => c.json(settings()));
app.put("/api/settings", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const next = Settings.safeParse({ ...settings(), ...(body as object) });
  if (!next.success) return c.json({ error: next.error.issues }, 400);
  core.set("settings", next.data);
  syncModelServers(next.data.modelServers);   // a direct PUT of the list must not leave the engine registry stale
  return c.json(next.data);
});

gatewayRoutes(app, { read: settings, save: (next) => core.set("settings", next), version: VERSION, secrets: secretStore(join(DATA, "gateway-secrets.json")), isOperator: (c) => access.principal(c).kind === "operator" });
modelServerRoutes(app, { read: settings, save: (next) => core.set("settings", next) });
noteRoutes(app);
syncModelServers(settings().modelServers);

app.get("/api/packs", (c) => c.json(packIndex()));
app.get("/api/events", () => stream());
app.get("/api/isolation", (c) => c.json(isolationStatus(DATA, true)));
app.get("/api/audit", (c) => c.json(recent()));

// First run: what this machine actually has. Detection only, no secrets read, no owner default (R47).
// The same function the CLI runs with --check, so the API and the terminal answer alike.
app.get("/api/detect", async (c) => {
  const s = settings();
  // "Model sources" are chat engines that answer right now, not tools that exist on the PATH: a found Claude Code
  // or Codex has no chat adapter in the core, so counting it would tell first run that chat works when it cannot.
  const usable = (await Promise.all(listEngines().map((e) => e.health().then((h) => h.ok, () => false)))).filter(Boolean).length;
  return c.json({
    ...(await detect({ brain: s.brain })),
    modelSources: usable,
    gateways: s.gateways.map((g) => ({ id: g.id, name: g.name, kind: g.kind })),
  });
});

// Chat and the engines behind it. Engines are adapters; health first, models only for one that answers.
app.route("/api/chat", chatApi(() => settings().localOnly));
app.route("/api/approvals", approvalsApi((c) => access.principal(c).kind === "operator"));
modelPullApi(app);
knowledgeApi(app);
crewApi(app, () => settings().localOnly);
orchestrationApi(app, (c) => access.principal(c).kind === "operator");
commandsApi(app, (c) => access.principal(c).kind === "operator");
hermesConfApi(app, (c) => access.principal(c).kind === "operator");
i18nApi(app, (c) => access.principal(c).kind === "operator", () => engineRun(() => settings().localOnly));
computerApi(app, (c) => access.principal(c).kind === "operator", undefined,
  (c) => { const p = access.principal(c); return p.kind === "agent" && !!p.scopes?.includes("computer"); },
  () => { const t = access.issueScoped("computer", ["computer"], 7 * 24 * 60 * 60 * 1000); writeFileSync(join(DATA, "computer-token"), t, { mode: 0o600 }); return t; });
exposeApi(app, (c) => access.principal(c).kind === "operator");
webgate.routes(app, (c) => access.principal(c).kind === "operator");
projectsApi(app);
boardApi(app, (c) => { const p = access.principal(c); return p.kind === "agent" && !!p.scopes?.includes("board"); },
  (who, claim, id) => { try { recordAudit({ source: "tool", actor: who, subjectKind: "board", subjectId: id, confidence: "done", claim }); } catch { /* the card is already saved */ } });
try { writeFileSync(join(DATA, "board-token"), access.issueScoped("agent", ["board"], 7 * 24 * 60 * 60 * 1000), { mode: 0o600 }); } catch { /* no token file: the layer tool says the board is not reachable */ }
driftApi(app, (c) => access.principal(c).kind === "operator");
hudApi(app, (c) => access.principal(c).kind === "operator");
let ttsSvc: Tts | undefined;
ttsApi(app, (c) => access.principal(c).kind === "operator", () => (ttsSvc ??= createTts(ttsPaths())));
// Mail: its own SQLite file and its own secrets folder under DATA/mail, so a backup of the core never carries mail or passwords; created on first use
let mailSvc: Mail | undefined;
mailApi(app, (c) => access.principal(c).kind === "operator", () => (mailSvc ??= createMail({ dir: join(DATA, "mail") })));
notesyncApi(app, (c) => access.principal(c).kind === "operator", (c) => { const p = access.principal(c); return p.kind === "agent" ? p.name : null; });
chatsyncApi(app, (c) => access.principal(c).kind === "operator", (c) => { const p = access.principal(c); return p.kind === "agent" ? p.name : null; });
syncApi(app, (c) => access.principal(c).kind === "operator");
feedApi(app, (c) => access.principal(c).kind === "operator");
calendarApi(app);
usageApi(app);
mirrorApi(app, (c) => access.principal(c).kind === "operator");
mirrorMoreApi(app, (c) => access.principal(c).kind === "operator");
weatherApi(app, (c) => access.principal(c).kind === "operator");
newsApi(app, (c) => access.principal(c).kind === "operator");
speechApi(app, (c) => access.principal(c).kind === "operator");
imageApi(app, (c) => access.principal(c).kind === "operator");
listsApi(app);
vaultApi(app, (c) => access.principal(c).kind === "operator");
searchApi(app, (c) => access.principal(c).kind === "operator");
const agentHome = homedir();
const insideAgentHome = (configured: string | undefined, fallback: string): string => {
  if (!configured) return fallback;
  const candidate = resolve(configured), rel = relative(agentHome, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep)) ? candidate : fallback;
};
const agentRoots = {
  hermes: insideAgentHome(process.env.CAESAROS_SKILLS_DIR?.split(":")[0], join(agentHome, ".hermes", "skills")),
  "claude-code": join(insideAgentHome(process.env.CLAUDE_CONFIG_DIR, join(agentHome, ".claude")), "skills"),
  codex: join(insideAgentHome(process.env.CODEX_HOME, join(agentHome, ".agents")), "skills"),
};
skillsApi(app, (c) => access.principal(c).kind === "operator", [join(DATA, "marketplace", "installed", "skills"), ...Object.values(agentRoots)]);
app.route("/api/install-gate", installGateApi({ root: join(DATA, "marketplace"), store: kv("install-gate"), isOperator: (c) => access.principal(c).kind === "operator", agentRoots, agentBoundary: agentHome }));
runningApi(app, (c) => access.principal(c).kind === "operator");
pairingApi(app, (c) => access.principal(c).kind === "operator", fetch, { issue: (n) => access.issue(n) });
handoffApi(app, (c) => access.principal(c).kind === "operator", (c) => { const p = access.principal(c); return p.kind === "agent" ? p.name : null; });
backupApi(app, (c) => access.principal(c).kind === "operator");
gatewayApi(app, { isAgent: (c) => access.principal(c).kind === "agent", localOnly: () => settings().localOnly });
app.get("/api/hardware", (c) => { const machine = readMachine(process.env.CAESAROS_DATA ?? "."); return c.json({ machine, advice: advise(machine) }); });
app.get("/api/engines", async (c) => c.json({
  engines: await Promise.all(listEngines().map(async (e) => {
    const health = await e.health().catch(() => ({ ok: false, detail: "not answering" as string | null }));
    const models = health.ok ? await e.models().catch(() => []) : [];
    return { id: e.id, label: e.label, health: { ok: health.ok, detail: health.detail }, models };
  })).then((all) => all.filter((e) => !(CLI_TOOLS.has(e.id) && e.health.detail === "not detected"))), // a tool that is not installed is not offered
}));

// Agent tokens: the operator issues one per agent; only the hash is kept and the token is shown once.
app.get("/api/tokens", (c) => c.json(access.inventory()));
app.post("/api/tokens", async (c) => {
  const { name } = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
  try { return c.json({ token: access.issue(String(name ?? "")) }); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});
app.delete("/api/tokens/:name", (c) => c.json({ revoked: access.revoke(c.req.param("name")) }));

// S4 terminal: a pane, not a module page. Off in the client edition, operator only, loopback or
// tailnet only (D5). Its WebSocket upgrade is served by Bun below, so it is wired before the catch-all.
useTerminal(app);

const plugins = await loadPlugins(app, settings().disabledModules, settings().enabledModules);
app.get("/api/plugins", (c) => c.json(plugins.active()));
app.get("/api/plugins/all", (c) => c.json(plugins.all()));
app.put("/api/plugins/:id/enabled", async (c) => {
  const id = c.req.param("id"), body = await c.req.json().catch(() => ({})) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") return c.json({ error: "enabled must be true or false" }, 400);
  const s = settings(), disabled = new Set(s.disabledModules), enabled = new Set(s.enabledModules);
  const result = plugins.setEnabled(id, body.enabled);
  if (result === "unknown") return c.json({ error: "no such module" }, 404);
  // Not an error: this edition never starts the module, so the switch does nothing and settings stay as they are.
  if (result === "unavailable") return c.json({ applied: result, modules: plugins.all() });
  if (body.enabled) { disabled.delete(id); enabled.add(id); } else { disabled.add(id); enabled.delete(id); }
  core.set("settings", { ...s, disabledModules: [...disabled].sort(), enabledModules: [...enabled].sort() });
  return c.json({ applied: result, modules: plugins.all() });
});
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));


// The Atrium's index is served with this build's id on every local script and style, so a webview that
// still holds an older service worker or HTTP cache fetches the new files instead of replaying its copy.
function atriumIndex(build: string): Response {
  let html = readFileSync(join(ATRIUM, "index.html"), "utf8");
  html = html.replace(/(src|href)="([^":?#]+\.(?:js|css|webmanifest))"/g, (_m, attr: string, path: string) =>
    `${attr}="${path}?v=${build}"`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
}

if (!dev) {
  if (!existsSync(WEB)) console.warn("web/dist missing: run `bun run build` first");
  app.use("/packs/*", serveStatic({ root: ROOT }));
  // The service worker is served with this build's id in its cache name; it must never be cached itself.
  // The Atrium owns the root now, so its worker wins; the classic shell's worker is the fallback.
  app.get("/sw.js", (c) => {
    let src = "";
    try { src = readFileSync(join(ATRIUM, "sw.js"), "utf8"); } catch { try { src = readFileSync(join(WEB, "sw.js"), "utf8"); } catch { return c.notFound(); } }
    return new Response(src.replace("__BUILD__", buildId()), { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" } });
  });
  app.use("/*", async (c, next) => { await next(); const p = new URL(c.req.url).pathname; if (p === "/" || /\.(html|js|css|json|webmanifest|webp|png|svg|woff2?|ttf)$/i.test(p)) c.header("Cache-Control", "no-cache"); });   // a desktop app updates in place: revalidate every asset
  app.get("/", (c) => new URL(c.req.url).searchParams.has("classic")
    ? new Response(readFileSync(join(WEB, "index.html")), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } })
    : atriumIndex(buildId()));
  app.use("/*", serveStatic({ root: ATRIUM }));
  app.use("/*", serveStatic({ root: WEB }));
  // App routes (/chat, /settings, …) all load index.html; real files that are missing stay 404.
  app.get("*", (c) => {
    if (/\.[a-z0-9]+$/i.test(new URL(c.req.url).pathname)) return c.notFound();
    return new Response(readFileSync(join(WEB, "index.html")), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
  });
  void PACKS;
}

if (import.meta.main) {
  startNoteSync();
  startChatSync();
  webgate.restore();
  Bun.serve<{ id: string }>({
    hostname: HOST,
    port: PORT,
    // The server object reaches the routes so the terminal can check the peer address and upgrade.
    fetch: (req, server) => app.fetch(req, { server }),
    idleTimeout: 0,
    websocket: terminalSocket(terminals) as unknown as Bun.WebSocketHandler<{ id: string }>,
  });
  console.log(`CaesarOS ${VERSION} on http://${HOST}:${PORT}${dev ? " (API only, dev)" : ""}`);
  // Started by the native shell: stop when it is gone, even if it was killed and could not clean up.
  watchParent({ pid: process.env.CAESAROS_PARENT_PID, onGone: () => { console.log("parent shell is gone, stopping"); process.exit(0); } });
}
