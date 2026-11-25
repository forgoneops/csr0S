// The IMAP side of MailSource, on imapflow. Everything about the wire stays here.
import { ImapFlow, type MailboxLockObject } from "imapflow";
import type { Flags } from "./mail-store";
import type { MailSource, OpenedFolder, RemoteFolder, RemoteMessage } from "./mail-sync";

export type ImapConfig = { host: string; port: number; secure: boolean; user: string; pass: string; allowSelfSigned?: boolean };
const FLAG: Record<keyof Flags, string> = { seen: "\\Seen", flagged: "\\Flagged", answered: "\\Answered" };
const toFlags = (f: Set<string> | undefined): Flags => ({ seen: !!f?.has("\\Seen"), flagged: !!f?.has("\\Flagged"), answered: !!f?.has("\\Answered") });
// Proton Bridge serves a self-signed certificate on the loopback address; allowing that is only ever done for loopback.
const loopback = (h: string) => h === "127.0.0.1" || h === "localhost" || h === "::1";

export function imapSource(cfg: ImapConfig): MailSource {
  let client: ImapFlow | null = null, lock: MailboxLockObject | null = null;
  const connect = async () => {
    if (client?.usable) return client;
    client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: { user: cfg.user, pass: cfg.pass }, logger: false, tls: { rejectUnauthorized: !(cfg.allowSelfSigned && loopback(cfg.host)) }, socketTimeout: 60_000, connectionTimeout: 20_000 });
    client.on("error", () => {});                                      // a dropped socket surfaces on the next call
    await client.connect(); return client;
  };
  return {
    async folders(): Promise<RemoteFolder[]> {
      const c = await connect();
      return (await c.list()).filter((m) => !m.flags.has("\\Noselect")).map((m) => ({ path: m.path, name: m.path === "INBOX" ? "Inbox" : m.name, special: m.path === "INBOX" ? "\\Inbox" : m.specialUse }));
    },
    async open(path): Promise<OpenedFolder> {
      const c = await connect(); lock?.release(); lock = await c.getMailboxLock(path);
      const mb = c.mailbox as { uidValidity: bigint; uidNext: number; exists: number };
      return { uidValidity: Number(mb.uidValidity), uidNext: mb.uidNext, exists: mb.exists };
    },
    async flags() {
      const c = await connect(), out = new Map<number, Flags>(), mb = c.mailbox as { exists: number };
      if (!mb.exists) return out;
      for await (const m of c.fetch("1:*", { uid: true, flags: true })) out.set(m.uid, toFlags(m.flags));
      return out;
    },
    async *fetch(_path, uids): AsyncIterable<RemoteMessage> {
      const c = await connect();
      for await (const m of c.fetch(uids.join(","), { uid: true, flags: true, source: true, size: true }, { uid: true })) if (m.source) yield { uid: m.uid, source: m.source, size: m.size ?? m.source.length, flags: toFlags(m.flags) };
    },
    async setFlag(_path, uid, flag, value) {
      const c = await connect();
      if (value) await c.messageFlagsAdd({ uid: String(uid) }, [FLAG[flag]], { uid: true }); else await c.messageFlagsRemove({ uid: String(uid) }, [FLAG[flag]], { uid: true });
    },
    async append(path, raw, flags) { const c = await connect(); await c.append(path, raw, Object.entries(flags).filter(([, v]) => v).map(([k]) => FLAG[k as keyof Flags])); },
    async close() { try { lock?.release(); lock = null; await client?.logout(); } catch { /* already gone */ } client = null; },
  };
}
