// Account passwords: an AES-256-GCM file next to the mail data, key in a 0600 file beside it.
// Be clear about what this is: it stops a copied data folder or a leaked backup from reading the passwords.
// It does not stop someone who controls the running server, because the key must be there for sync to run unattended.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { join } from "node:path";

export function createSecrets(dir: string) {
  mkdirSync(dir, { recursive: true });
  const keyFile = join(dir, "mail.key"), dataFile = join(dir, "secrets.enc");
  const key = (): Buffer => {
    if (!existsSync(keyFile)) { writeFileSync(keyFile, randomBytes(32).toString("base64"), { mode: 0o600 }); chmodSync(keyFile, 0o600); }
    return Buffer.from(readFileSync(keyFile, "utf8").trim(), "base64");
  };
  const read = (): Record<string, string> => {
    if (!existsSync(dataFile)) return {};
    const raw = readFileSync(dataFile), iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), enc = raw.subarray(28);
    const d = createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8"));
  };
  const write = (all: Record<string, string>) => {
    const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv), enc = Buffer.concat([c.update(JSON.stringify(all), "utf8"), c.final()]);
    const tmp = `${dataFile}.tmp`; writeFileSync(tmp, Buffer.concat([iv, c.getAuthTag(), enc]), { mode: 0o600 }); renameSync(tmp, dataFile);
  };
  return { get: (id: string): string | null => read()[id] ?? null, set: (id: string, secret: string) => write({ ...read(), [id]: secret }), delete: (id: string) => { const a = read(); delete a[id]; write(a); }, has: (id: string) => id in read() };
}
export type Secrets = ReturnType<typeof createSecrets>;
