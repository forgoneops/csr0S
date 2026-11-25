// Vault: notes the browser encrypts before they reach this core. The core stores only the ciphertext, the salt and the
// nonce it is given; the passphrase and the plaintext never leave the browser, so a copy of the database holds nothing
// readable. Losing the passphrase loses the note, by design; there is no recovery.
import type { Hono } from "hono";
import { db } from "./db";

db.exec(`CREATE TABLE IF NOT EXISTS vault_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, iv TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);`);

export type VaultItem = { id: string; name: string; salt: string; iv: string; data: string; created: number; updated: number };
export const MAX_ITEMS = 200, MAX_B64 = 1_400_000;   // about 1 MB of text once encrypted and encoded
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ok = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && B64.test(v);

export const listVault = () => db.query<Omit<VaultItem, "data">, []>("SELECT id, name, salt, iv, created, updated FROM vault_items ORDER BY updated DESC").all();
export const getVault = (id: string) => db.query<VaultItem, [string]>("SELECT * FROM vault_items WHERE id = ?").get(id) ?? null;

export function saveVault(i: { id?: unknown; name?: unknown; salt?: unknown; iv?: unknown; data?: unknown }): { id: string } | { error: "name" | "format" | "too_many" | "not_found" } {
  const name = typeof i.name === "string" ? i.name.trim().slice(0, 80) : "";
  if (!name) return { error: "name" };
  if (!ok(i.salt, 64) || !ok(i.iv, 32) || !ok(i.data, MAX_B64)) return { error: "format" };
  const now = Date.now();
  if (typeof i.id === "string") {
    const r = db.query("UPDATE vault_items SET name=?, salt=?, iv=?, data=?, updated=? WHERE id=?").run(name, i.salt, i.iv, i.data, now, i.id);
    return r.changes ? { id: i.id } : { error: "not_found" };
  }
  if (db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM vault_items").get()!.n >= MAX_ITEMS) return { error: "too_many" };
  const id = crypto.randomUUID();
  db.query("INSERT INTO vault_items (id, name, salt, iv, data, created, updated) VALUES (?,?,?,?,?,?,?)").run(id, name, i.salt, i.iv, i.data, now, now);
  return { id };
}
export const removeVault = (id: string) => db.query("DELETE FROM vault_items WHERE id = ?").run(id).changes > 0;

export function vaultApi(app: Hono, isOperator: (c: import("hono").Context) => boolean) {
  const g = (c: import("hono").Context) => (isOperator(c) ? null : c.json({ error: "operator_only" }, 403));
  app.get("/api/vault", (c) => g(c) ?? c.json(listVault()));
  app.get("/api/vault/:id", (c) => g(c) ?? (getVault(c.req.param("id")) ? c.json(getVault(c.req.param("id"))) : c.json({ error: "not_found" }, 404)));
  app.post("/api/vault", async (c) => { const x = g(c); if (x) return x; const r = saveVault(await c.req.json().catch(() => ({}))); return "error" in r ? c.json(r, 400) : c.json(r, 201); });
  app.put("/api/vault/:id", async (c) => { const x = g(c); if (x) return x; const b = await c.req.json().catch(() => ({})) as object; const r = saveVault({ ...b, id: c.req.param("id") }); return "error" in r ? c.json(r, r.error === "not_found" ? 404 : 400) : c.json(r); });
  app.delete("/api/vault/:id", (c) => g(c) ?? (removeVault(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404)));
}
