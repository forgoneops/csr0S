import { Hono, type Context } from "hono";
import { closeSync, constants, existsSync, fchmodSync, fstatSync, lstatSync, mkdirSync, opendirSync, openSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import type { Stats } from "node:fs";
import { scanTree, type Scan } from "./skillscan";
import { readRegularFileNoFollow } from "./safe-file";

const MAX_BODY = 15_000_000, MAX_FILES = 256, MAX_FILE = 2_000_000, MAX_TOTAL = 10_000_000;
const inside = (p: string, root: string) => p === root || p.startsWith(root + sep);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ownedDir(path: string, parent: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const st = lstatSync(path);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error("managed directory is not a regular directory");
  const real = realpathSync(path), realParent = realpathSync(parent);
  if (!inside(real, realParent)) throw new Error("managed directory escaped its parent");
  return real;
}
function isManagedItemName(id: string): boolean {
  return UUID.test(id) || /^caesaros-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
function itemDir(parent: string, id: string): string {
  if (!isManagedItemName(id)) throw new Error("invalid item id");
  const p = join(parent, id), st = lstatSync(p);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error("managed item is not a regular directory");
  const real = realpathSync(p), realParent = realpathSync(parent);
  if (!inside(real, realParent)) throw new Error("managed item escaped its parent");
  return real;
}

type Dependency = { name: string; version: string; source: string };
type InstallItem = {
  id: string; name: string; version: string; source: string; license: string; needs: string[]; dependencies: Dependency[];
  files: string[]; scan: Scan; status: "quarantined" | "installed" | "removed"; installedAt?: number;
  projections?: Partial<Record<AgentTarget, { root: string; name: string; sha256: string }>>;
};
export type AgentTarget = "hermes" | "claude-code" | "codex";
type Store = { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void };
type Options = { root: string; store: Store; isOperator: (c: Context) => boolean; agentRoots?: Partial<Record<AgentTarget, string>>; agentBoundary?: string };

const safeString = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
function validRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || !path || path.length > 240 || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.includes(":")) return false;
  const parts = path.split("/");
  return parts.every((p) => !!p && p !== "." && p !== "..") && !parts.some((p) => p === "node_modules" || p === ".git");
}
async function boundedJson(c: Context): Promise<Record<string, unknown> | null> {
  const reader = c.req.raw.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks.map((x) => Buffer.from(x))).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
function checkedDir(path: string, parent: string): string {
  const st = lstatSync(path);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error("managed item is not a regular directory");
  const real = realpathSync(path), realParent = realpathSync(parent);
  if (!inside(real, realParent)) throw new Error("managed item escaped its parent");
  return real;
}
function sameDir(a: Stats, b: Stats) { return !a.isSymbolicLink() && a.dev === b.dev && a.ino === b.ino; }
function freezeDir(path: string, boundary: string): void {
  const expected = lstatSync(path);
  if (expected.isSymbolicLink() || !expected.isDirectory()) throw new Error("links and special files are not accepted");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd), anchored = `/proc/self/fd/${fd}`;
    if (!sameDir(expected, before) || !inside(realpathSync(anchored), realpathSync(boundary))) throw new Error("directory changed outside quarantine");
    const dir = opendirSync(anchored);
    try {
      while (true) {
        const entry = dir.readSync(); if (!entry) break;
        const child = join(anchored, entry.name), st = lstatSync(child);
        if (st.isSymbolicLink()) throw new Error("links are not accepted in quarantine");
        if (st.isDirectory()) freezeDir(child, boundary);
        else if (st.isFile()) {
          const fileFd = openSync(child, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
          try {
            const f = fstatSync(fileFd);
            if (!f.isFile() || f.dev !== st.dev || f.ino !== st.ino || !inside(realpathSync(`/proc/self/fd/${fileFd}`), realpathSync(boundary))) throw new Error("file changed outside quarantine");
            fchmodSync(fileFd, f.mode & 0o111 ? 0o500 : 0o400);
            const after = fstatSync(fileFd);
            if (after.dev !== f.dev || after.ino !== f.ino || after.size !== f.size || after.mtimeMs !== f.mtimeMs) throw new Error("file changed while freezing quarantine");
          } finally { closeSync(fileFd); }
        } else throw new Error("special files are not accepted in quarantine");
      }
    } finally { try { dir.closeSync(); } catch { /* already closed */ } }
    const afterDir = fstatSync(fd);
    if (afterDir.dev !== before.dev || afterDir.ino !== before.ino || afterDir.mtimeMs !== before.mtimeMs) throw new Error("directory changed while freezing quarantine");
    fchmodSync(fd, 0o500);
    const named = lstatSync(path);
    if (!sameDir(named, afterDir)) throw new Error("directory path changed while freezing quarantine");
  } finally { closeSync(fd); }
}
function frozenTree(root: string, boundary: string): void { freezeDir(root, boundary); }
function walkForRemoval(path: string, boundary: string, makeWritable: boolean): void {
  const expected = lstatSync(path);
  if (expected.isSymbolicLink() || !expected.isDirectory()) throw new Error("refusing to follow a link during removal");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd), anchored = `/proc/self/fd/${fd}`;
    if (!sameDir(expected, before) || !inside(realpathSync(anchored), realpathSync(boundary))) throw new Error("removal path changed outside registry");
    const dir = opendirSync(anchored);
    try {
      while (true) {
        const entry = dir.readSync(); if (!entry) break;
        const child = join(anchored, entry.name), st = lstatSync(child);
        if (st.isSymbolicLink()) throw new Error("refusing to follow a link during removal");
        if (st.isDirectory()) walkForRemoval(child, boundary, makeWritable);
        else if (!st.isFile()) throw new Error("refusing special files during removal");
      }
    } finally { try { dir.closeSync(); } catch { /* already closed */ } }
    const after = fstatSync(fd);
    if (after.dev !== before.dev || after.ino !== before.ino || after.mtimeMs !== before.mtimeMs || !sameDir(lstatSync(path), after)) throw new Error("removal path changed during traversal");
    // In the write pass, make a directory writable only after its entire subtree passed validation.
    if (makeWritable) fchmodSync(fd, 0o700);
  } finally { closeSync(fd); }
}
function openForRemoval(path: string, boundary: string): void {
  walkForRemoval(path, boundary, false);
  walkForRemoval(path, boundary, true);
}
function removeManaged(parent: string, id: string, boundary: string, expectedHash?: string): void {
  if (!UUID.test(id) && !/^caesaros-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) && !/^\.stage-(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|caesaros-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("invalid managed item name");
  const parentReal = ownedDir(parent, boundary), expectedParent = lstatSync(parentReal);
  const parentFd = openSync(parentReal, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
  const anchor = `/proc/self/fd/${parentFd}`, assertParent = () => {
    const opened = fstatSync(parentFd), named = lstatSync(parentReal), actual = realpathSync(anchor);
    if (!sameDir(named, opened) || !inside(actual, realpathSync(boundary))) throw new Error("managed parent changed outside registry");
  };
  const tombName = `.remove-${randomUUID()}`;
  try {
    if (!sameDir(expectedParent, fstatSync(parentFd))) throw new Error("managed parent changed before removal");
    assertParent();
    const source = join(anchor, id), tomb = join(anchor, tombName);
    const sourceStat = lstatSync(source);
    if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) throw new Error("refusing to remove a linked item");
    renameSync(source, tomb);
    try {
      assertParent();
      const safe = checkedDir(tomb, parentReal);
      if (expectedHash && scanTree(safe).sha256 !== expectedHash) throw new Error("installed content changed before removal");
      openForRemoval(safe, parentReal);
      assertParent();
      rmSync(tomb, { recursive: true, force: true });
    } catch (e) {
      try { if (existsSync(tomb)) { assertParent(); renameSync(tomb, source); } } catch { /* keep the unregistered item for manual inspection */ }
      throw e;
    }
  } finally { closeSync(parentFd); }
}
function discardManaged(path: string, parent: string, boundary: string): void {
  if (!existsSync(path)) return;
  const parentReal = ownedDir(parent, boundary), safe = checkedDir(path, parentReal);
  removePathWithin(parentReal, safe, boundary);
}
function removePathWithin(parentReal: string, safe: string, boundary: string): void {
  const name = safe.slice(parentReal.length + 1);
  if (!name || name.includes(sep)) throw new Error("invalid staged removal path");
  removeManaged(parentReal, name, boundary);
}

type OpenDir = { fd: number; path: string; assert: () => void; close: () => void };
function openVerifiedDir(path: string, boundary: string): OpenDir {
  const expected = lstatSync(path);
  if (expected.isSymbolicLink() || !expected.isDirectory()) throw new Error("managed path is not a regular directory");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
  const anchored = `/proc/self/fd/${fd}`;
  const assert = () => {
    const opened = fstatSync(fd), named = lstatSync(path);
    if (!sameDir(named, opened) || !inside(realpathSync(anchored), realpathSync(boundary))) throw new Error("managed directory changed outside its boundary");
  };
  try { assert(); } catch (e) { closeSync(fd); throw e; }
  return { fd, path: anchored, assert, close: () => closeSync(fd) };
}
function openDirectoryWithin(path: string, boundary: string): OpenDir {
  const base = realpathSync(boundary), target = resolve(path), rel = relative(base, target);
  if (rel.startsWith(".." + sep) || rel === ".." || resolve(base, rel) !== target) throw new Error("agent skill root must stay under the configured boundary");
  const chain: OpenDir[] = [openVerifiedDir(base, base)];
  try {
    for (const part of rel ? rel.split(sep) : []) {
      if (!part || part === "." || part === "..") throw new Error("invalid agent skill path");
      const parent = chain.at(-1)!; parent.assert();
      const child = join(parent.path, part);
      try { mkdirSync(child, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
      chain.push(openVerifiedDir(child, base));
    }
    const last = chain.at(-1)!;
    return { fd: last.fd, path: last.path, assert: () => { for (const d of chain) d.assert(); }, close: () => { for (const d of chain.reverse()) d.close(); } };
  } catch (e) { for (const d of chain.reverse()) d.close(); throw e; }
}
function projectSkill(item: InstallItem, from: string, root: string, boundary: string): { root: string; name: string; sha256: string } {
  const parent = openDirectoryWithin(root, boundary), name = `caesaros-${item.id}`, destination = join(parent.path, name), staging = join(parent.path, `.stage-${name}-${randomUUID()}`);
  try {
    parent.assert();
    if (existsSync(destination)) throw new Error("agent skill destination already exists");
    const copied = copyQuarantine(item, from, staging, parent.path, parent.assert);
    if (copied.sha256 !== item.scan.sha256 || copied.verdict !== item.scan.verdict) throw new Error("agent adapter copy changed after review");
    parent.assert(); renameSync(staging, destination); parent.assert();
    return { root: resolve(root), name, sha256: item.scan.sha256! };
  } catch (e) {
    try { parent.assert(); discardManaged(staging, parent.path, boundary); } catch { /* leave an unregistered staging item for inspection */ }
    throw e;
  } finally { parent.close(); }
}
function populateQuarantine(itemRoot: string, files: { path: string; data: Buffer }[], boundary: string, assertParent: () => void): Scan {
  assertParent(); mkdirSync(itemRoot, { mode: 0o700 });
  const rootDir = openVerifiedDir(itemRoot, boundary), dirs = new Map<string, number>([["", rootDir.fd]]), rootReal = realpathSync(rootDir.path);
  const assertTree = () => {
    assertParent(); rootDir.assert();
    for (const fd of dirs.values()) if (!inside(realpathSync(`/proc/self/fd/${fd}`), rootReal)) throw new Error("quarantine child escaped its item root");
  };
  try {
    const names = new Set<string>(); let total = 0;
    for (const file of files) { total += file.data.length; if (total > MAX_TOTAL) throw new Error("quarantine size limit exceeded"); const parts = file.path.split("/"); for (let i = 1; i < parts.length; i++) names.add(parts.slice(0, i).join("/")); }
    for (const name of [...names].sort((a, b) => a.split("/").length - b.split("/").length)) {
      const parts = name.split("/"), leaf = parts.pop()!, parent = parts.join("/"), parentFd = dirs.get(parent);
      if (parentFd === undefined) throw new Error("missing quarantine parent");
      assertTree();
      const path = join(`/proc/self/fd/${parentFd}`, leaf); mkdirSync(path, { mode: 0o700 });
      const fd = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
      try { if (!inside(realpathSync(`/proc/self/fd/${fd}`), rootReal)) throw new Error("quarantine directory escaped its item root"); assertTree(); dirs.set(name, fd); }
      catch (e) { closeSync(fd); throw e; }
    }
    for (const file of files) {
      const parts = file.path.split("/"), leaf = parts.pop()!, parent = parts.join("/"), parentFd = dirs.get(parent);
      if (parentFd === undefined) throw new Error("missing quarantine parent");
      assertTree();
      const fd = openSync(join(`/proc/self/fd/${parentFd}`, leaf), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      try { writeFileSync(fd, file.data); if (fstatSync(fd).size !== file.data.length) throw new Error("short quarantine write"); assertTree(); }
      finally { closeSync(fd); }
    }
    assertTree(); frozenTree(itemRoot, rootReal); assertTree();
    const scan = scanTree(itemRoot);
    assertTree();
    return scan;
  } finally { for (const [name, fd] of [...dirs].reverse()) if (name) closeSync(fd); rootDir.close(); }
}
function copyQuarantine(item: InstallItem, from: string, to: string, boundary: string, assertParent: () => void): Scan {
  const files = item.files.map((rel) => {
    const src = join(from, rel), st = lstatSync(src);
    return { path: rel, data: readRegularFileNoFollow(src, st, from, MAX_FILE) };
  });
  return populateQuarantine(to, files, boundary, assertParent);
}

export function installGateApi({ root, store, isOperator, agentRoots = {}, agentBoundary = homedir() }: Options): Hono {
  const api = new Hono(), busy = new Set<string>();
  const base = resolve(root); mkdirSync(base, { recursive: true, mode: 0o700 }); const baseReal = realpathSync(base), quarantine = join(baseReal, "quarantine"), installed = join(baseReal, "installed", "skills");
  const all = () => store.get<Record<string, InstallItem>>("items", {});
  const save = (items: Record<string, InstallItem>) => store.set("items", items);
  const publicItem = (x: InstallItem) => {
    const { projections, ...visible } = x;
    return { ...visible, targets: Object.keys(projections ?? {}) as AgentTarget[], targetHashes: Object.fromEntries(Object.entries(projections ?? {}).map(([target, projection]) => [target, projection?.sha256])) };
  };
  const auth = (c: Context) => isOperator(c) ? null : c.json({ error: "operator_only" }, 403);
  api.get("/", (c) => { const refused = auth(c); if (refused) return refused; return c.json({ items: Object.values(all()).map(publicItem) }); });
  api.get("/:id", (c) => { const refused = auth(c); if (refused) return refused; const item = all()[c.req.param("id")]; return item ? c.json(publicItem(item)) : c.json({ error: "not_found" }, 404); });
  api.post("/quarantine", async (c) => {
    const refused = auth(c); if (refused) return refused;
    const body = await boundedJson(c);
    if (!body) return c.json({ error: "invalid_or_oversized_json" }, 400);
    const { name, version, source, license, needs, dependencies, files } = body;
    if (body.kind !== undefined && body.kind !== "skill") return c.json({ error: "unsupported_item_kind" }, 400);
    if (!safeString(name, 120) || !safeString(version, 64) || !safeString(source, 500) || !safeString(license, 80) || !Array.isArray(needs) || needs.length > 64 || needs.some((x) => !safeString(x, 100)) || !Array.isArray(dependencies) || dependencies.length > 128 || dependencies.some((x) => !x || !safeString(x.name, 120) || !safeString(x.version, 80) || !safeString(x.source, 500)) || !Array.isArray(files) || files.length < 1 || files.length > MAX_FILES)
      return c.json({ error: "invalid_skill_manifest" }, 400);
    const seen = new Set<string>(); let total = 0;
    const decoded: { path: string; data: Buffer }[] = [];
    for (const entry of files) {
      if (!entry || !validRelativePath(entry.path) || seen.has(entry.path) || typeof entry.base64 !== "string" || entry.base64.length > Math.ceil(MAX_FILE * 4 / 3) + 8 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.base64)) return c.json({ error: "invalid_skill_file" }, 400);
      const data = Buffer.from(entry.base64, "base64");
      if (data.length > MAX_FILE || data.toString("base64") !== entry.base64) return c.json({ error: "invalid_skill_file" }, 400);
      total += data.length; if (total > MAX_TOTAL) return c.json({ error: "skill_too_large" }, 413);
      seen.add(entry.path); decoded.push({ path: entry.path, data });
    }
    if (!seen.has("SKILL.md")) return c.json({ error: "SKILL.md_required" }, 400);
    const id = randomUUID(); let quarantineRoot: OpenDir | undefined, itemRoot = "";
    try {
      const quarantineReal = ownedDir(quarantine, baseReal);
      quarantineRoot = openVerifiedDir(quarantineReal, baseReal);
      itemRoot = join(quarantineRoot.path, id);
      const scan = populateQuarantine(itemRoot, decoded, quarantineRoot.path, quarantineRoot.assert);
      quarantineRoot.assert();
      const item: InstallItem = { id, name: (name as string).trim(), version: (version as string).trim(), source: (source as string).trim(), license: (license as string).trim(), needs: [...new Set(needs as string[])], dependencies: dependencies as Dependency[], files: decoded.map((f) => f.path).sort(), scan, status: "quarantined" };
      const state = all(); state[id] = item; save(state);
      return c.json(publicItem(item), 201);
    } catch {
      if (itemRoot && quarantineRoot) { try { quarantineRoot.assert(); discardManaged(itemRoot, quarantineRoot.path, baseReal); } catch { /* keep unsafe content quarantined; no install record */ } }
      return c.json({ error: "quarantine_failed_closed" }, 422);
    } finally { quarantineRoot?.close(); }
  });
  api.post("/:id/approve", async (c) => {
    const refused = auth(c); if (refused) return refused;
    const id = c.req.param("id"), body = await boundedJson(c), state = all(), item = state[id];
    if (!item) return c.json({ error: "not_found" }, 404);
    if (!body || body.sha256 !== item.scan.sha256 || typeof body.confirmYellow !== "boolean") return c.json({ error: "scan_hash_required" }, 400);
    if (item.scan.verdict === "red" || !item.scan.sha256) return c.json({ error: "red_is_blocked" }, 409);
    if (item.scan.verdict === "yellow" && body.confirmYellow !== true) return c.json({ error: "yellow_confirmation_required" }, 409);
    const requested = body.targets === undefined ? [] : body.targets;
    if (!Array.isArray(requested) || requested.length > 3 || requested.some((t) => typeof t !== "string" || !["hermes", "claude-code", "codex"].includes(t)) || new Set(requested).size !== requested.length)
      return c.json({ error: "invalid_agent_targets" }, 400);
    if (requested.some((t) => !agentRoots[t as AgentTarget])) return c.json({ error: "agent_target_unavailable" }, 400);
    if (item.status === "installed" && requested.every((t) => item.projections?.[t as AgentTarget])) return c.json({ error: "already_installed" }, 409);
    if (busy.has(id)) return c.json({ error: "operation_in_progress" }, 409);
    busy.add(id);
    try {
      let qitem: string; try { qitem = itemDir(ownedDir(quarantine, baseReal), id); } catch { return c.json({ error: "quarantined_item_changed" }, 409); }
      const current = scanTree(qitem);
      if (current.sha256 !== item.scan.sha256 || current.verdict !== item.scan.verdict) {
        item.scan = current; save(state);
        return c.json({ error: "scan_changed", item: publicItem(item) }, 409);
      }
      if (item.status !== "installed") {
        const installedRoot = ownedDir(installed, baseReal), parent = openVerifiedDir(installedRoot, baseReal);
        const destination = join(parent.path, id), staging = join(parent.path, `.stage-${id}-${randomUUID()}`);
        try {
          parent.assert();
          if (existsSync(destination)) return c.json({ error: "destination_exists" }, 409);
          try {
            const copied = copyQuarantine(item, qitem, staging, parent.path, parent.assert);
            if (copied.sha256 !== item.scan.sha256 || copied.verdict !== item.scan.verdict) throw new Error("copy changed after review");
            parent.assert(); renameSync(staging, destination); parent.assert();
          } catch {
            try { parent.assert(); discardManaged(staging, parent.path, baseReal); } catch { /* keep no registry entry */ }
            return c.json({ error: "install_changed_or_failed_closed" }, 409);
          }
        } finally { parent.close(); }
        item.status = "installed"; item.installedAt = Date.now(); item.projections = {}; state[id] = item; save(state);
      }
      for (const target of requested as AgentTarget[]) {
        if (item.projections?.[target]) continue;
        const agentRoot = agentRoots[target]!;
        try {
          const projection = projectSkill(item, qitem, agentRoot, agentBoundary);
          item.projections ??= {}; item.projections[target] = projection; state[id] = item; save(state);
        } catch {
          return c.json({ error: "agent_projection_failed", item: publicItem(item) }, 409);
        }
      }
      return c.json(publicItem(item));
    } finally { busy.delete(id); }
  });
  api.delete("/:id", (c) => {
    const refused = auth(c); if (refused) return refused;
    const id = c.req.param("id"), state = all(), item = state[id];
    if (!item) return c.json({ error: "not_found" }, 404);
    if (busy.has(id)) return c.json({ error: "operation_in_progress" }, 409);
    busy.add(id);
    try {
      if (item.status === "installed") {
        for (const [target, projection] of Object.entries(item.projections ?? {}) as [AgentTarget, { root: string; name: string; sha256: string }][]) {
          const root = agentRoots[target];
          if (!root || resolve(root) !== resolve(projection.root)) return c.json({ error: "agent_target_changed_preserved" }, 409);
          const destination = join(root, projection.name);
          if (!existsSync(destination)) continue;
          let path: string; try { path = itemDir(root, projection.name); } catch { return c.json({ error: "agent_item_changed_preserved" }, 409); }
          if (scanTree(path).sha256 !== projection.sha256) return c.json({ error: "agent_item_changed_preserved" }, 409);
        }
        let installedRoot: string, path: string;
        try { installedRoot = ownedDir(installed, baseReal); path = itemDir(installedRoot, id); }
        catch { return c.json({ error: "installed_item_missing_or_changed" }, 409); }
        const current = scanTree(path);
        if (current.sha256 !== item.scan.sha256) return c.json({ error: "installed_item_changed_preserved" }, 409);
        // Remove projections first. If a concurrent edit makes a later removal fail,
        // the app-owned copy and registry stay available so the operation can be retried.
        for (const [target, projection] of Object.entries(item.projections ?? {}) as [AgentTarget, { root: string; name: string; sha256: string }][]) {
          const root = agentRoots[target]!;
          if (!existsSync(join(root, projection.name))) continue;
          try { removeManaged(root, projection.name, agentBoundary, projection.sha256); }
          catch { return c.json({ error: "agent_item_changed_preserved" }, 409); }
        }
      }
      const qpath = join(quarantine, id);
      if (existsSync(qpath)) {
        let parent: string;
        try { parent = ownedDir(quarantine, baseReal); }
        catch { return c.json({ error: "quarantined_item_changed_preserved" }, 409); }
        try { removeManaged(parent, id, baseReal); }
        catch { return c.json({ error: "quarantined_item_changed_preserved" }, 409); }
      }
      if (item.status === "installed") {
        let installedRoot: string;
        try { installedRoot = ownedDir(installed, baseReal); removeManaged(installedRoot, id, baseReal, item.scan.sha256 ?? undefined); }
        catch { return c.json({ error: "installed_item_changed_preserved" }, 409); }
      }
      delete state[id]; save(state);
      return c.json({ ok: true });
    } finally { busy.delete(id); }
  });
  return api;
}
