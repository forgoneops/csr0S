// Mail (first version): parsing, the local store, sync against a fake server, the account and send flow, and the rules around secrets.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-mail-data-"));
const { htmlToText, parseMessage, threadKey } = await import("../core/mail-parse");
const { createMail, mailApi } = await import("../core/mail");
const { recent } = await import("../core/audit");
type Flags = { seen: boolean; flagged: boolean; answered: boolean };

const eml = (o: { id?: string; from?: string; to?: string; subject?: string; date?: string; body?: string; html?: string; ref?: string }) =>
  Buffer.from([`From: ${o.from ?? "Ada Lovelace <ada@example.org>"}`, `To: ${o.to ?? "me@example.com"}`, `Subject: ${o.subject ?? "Hello"}`, `Date: ${o.date ?? "Mon, 23 Nov 2026 10:00:00 +0000"}`, `Message-ID: <${o.id ?? "m1"}@example.org>`, ...(o.ref ? [`In-Reply-To: <${o.ref}@example.org>`] : []),
    ...(o.html ? ["MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "", o.html] : ["MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", o.body ?? "Plain body."])].join("\r\n"));

/** a mail server in memory: the wire protocol is behind MailSource, so this is all the sync logic needs */
function fakeSource(box: { uidValidity: number; msgs: Map<number, { raw: Buffer; flags: Flags }> }, log: string[] = []) {
  return {
    async folders() { return [{ path: "INBOX", name: "Inbox", special: "\\Inbox" }, { path: "Sent", name: "Sent", special: "\\Sent" }]; },
    async open() { return { uidValidity: box.uidValidity, uidNext: 99, exists: box.msgs.size }; },
    async flags() { return new Map([...box.msgs].map(([u, m]) => [u, m.flags])); },
    async *fetch(_p: string, uids: number[]) { for (const u of uids) { const m = box.msgs.get(u)!; yield { uid: u, source: m.raw, size: m.raw.length, flags: m.flags }; } },
    async setFlag(_p: string, uid: number, flag: keyof Flags, value: boolean) { log.push(`flag ${uid} ${flag}=${value}`); },
    async append() {}, async close() {},
  };
}
const unseen = (): Flags => ({ seen: false, flagged: false, answered: false });
const PASSWORD = "correct horse battery staple 7261";
const setup = (extra: { transport?: any } = {}) => {
  const box = { uidValidity: 1, msgs: new Map<number, { raw: Buffer; flags: Flags }>([[1, { raw: eml({ id: "m1", subject: "Invoice for tomatoes", body: "Please pay 12 euro for tomatoes." }), flags: unseen() }], [2, { raw: eml({ id: "m2", subject: "Re: Invoice for tomatoes", ref: "m1", from: "Bob <bob@example.net>", body: "Paid yesterday." }), flags: { seen: true, flagged: false, answered: false } }]]) };
  const log: string[] = [], sent: { raw: string; to: string[] }[] = [];
  const mail = createMail({ dir: mkdtempSync(join(tmpdir(), "mail-")), makeSource: () => fakeSource(box, log) as any, transport: extra.transport ?? (async (_a: any, _pw: string, raw: Buffer, env: { to: string[] }) => { sent.push({ raw: raw.toString(), to: env.to }); return { accepted: env.to, rejected: [], response: "250 ok" }; }) });
  return { mail, box, log, sent };
};
const NEW = { address: "me@example.com", password: PASSWORD, imap: { host: "imap.example.com", port: 993, secure: true }, smtp: { host: "smtp.example.com", port: 465, secure: true } };

describe("parse", () => {
  test("headers and text come out; an HTML-only mail becomes text, scripts and tags gone", async () => {
    const p = await parseMessage(eml({ html: "<p>Hello <b>there</b></p><script>alert(1)</script><p>Bye&nbsp;now &amp; thanks</p>" }));
    expect(p.from).toEqual({ name: "Ada Lovelace", address: "ada@example.org" }); expect(p.subject).toBe("Hello");
    expect(p.text).not.toContain("alert"); expect(p.text).not.toContain("<"); expect(p.text).toContain("Hello there"); expect(p.text).toContain("Bye now & thanks");
    expect(htmlToText("<style>p{x:1}</style><div>a</div><div>b</div>")).toBe("a\nb");
  });
  test("a reply shares the thread of the message it answers", async () => {
    const a = await parseMessage(eml({ id: "m1" })), b = await parseMessage(eml({ id: "m2", ref: "m1", subject: "Re: Hello" }));
    expect(threadKey(b)).toBe(threadKey({ ...a, messageId: "<m1@example.org>" }));
  });
});

describe("store and sync", () => {
  test("a sync keeps headers and text, finds new mail, drops what the server dropped, and searches offline", async () => {
    const { mail, box } = setup(); const acc = await mail.manager.add(NEW);
    const s1 = await mail.manager.sync(acc.id, { only: ["INBOX"] }); expect(s1).toMatchObject({ added: 2, removed: 0 });
    const list = mail.store.list({ account: acc.id, folder: "INBOX" }); expect(list.map((m) => m.subject)).toEqual(["Re: Invoice for tomatoes", "Invoice for tomatoes"]);   // newest first, same date: by id desc
    expect(list.every((m) => !("body" in m) && !("text" in m))).toBe(true);                                    // the list never carries the text
    expect(mail.store.text(list[1]!.id)).toContain("12 euro");
    expect(mail.store.list({ account: acc.id, q: "tomatoes" }).length).toBe(2); expect(mail.store.list({ account: acc.id, q: "paid" }).length).toBe(1); expect(mail.store.list({ account: acc.id, q: "nothing" })).toEqual([]);
    expect(mail.store.list({ account: acc.id, unread: true }).length).toBe(1);
    box.msgs.delete(1); box.msgs.set(3, { raw: eml({ id: "m3", subject: "New one" }), flags: unseen() });
    expect(await mail.manager.sync(acc.id, { only: ["INBOX"] })).toMatchObject({ added: 1, removed: 1 });
    box.uidValidity = 2; expect((await mail.manager.sync(acc.id, { only: ["INBOX"] })).resynced).toEqual(["INBOX"]);
  });
  test("marking read changes it here at once and on the server when it can be reached", async () => {
    const { mail, log } = setup(); const acc = await mail.manager.add(NEW); await mail.manager.sync(acc.id, { only: ["INBOX"] });
    const m = mail.store.list({ account: acc.id, unread: true })[0]!;
    expect(await mail.manager.setFlag(m.id, "seen", true)).toEqual({ pushed: true }); expect(mail.store.get(m.id)!.seen).toBe(true); expect(log).toContain(`flag ${m.uid} seen=true`);
  });
});

describe("secrets", () => {
  test("the password is only in the secrets file (0600), never in the mail database, an answer or the account list", async () => {
    const { mail } = setup(); const dir = (mail.db as any).filename ? (mail.db as any).filename.replace(/\/mail\.db$/, "") : "";
    const acc = await mail.manager.add(NEW);
    expect(JSON.stringify(acc)).not.toContain(PASSWORD); expect(JSON.stringify(mail.manager.accounts())).not.toContain(PASSWORD);
    for (const f of readdirSync(dir)) if (statSync(join(dir, f)).isFile()) expect(readFileSync(join(dir, f)).includes(Buffer.from(PASSWORD))).toBe(false);   // not in mail.db, not in its WAL, not in the secrets file in the clear
    for (const f of ["mail.key", "secrets.enc"]) { const p = join(dir, "secrets", f); expect(existsSync(p)).toBe(true); expect(statSync(p).mode & 0o777).toBe(0o600); }
    mail.manager.remove(acc.id); expect(mail.manager.accounts()).toEqual([]);
  });
});

describe("routes", () => {
  const app = (mail: ReturnType<typeof setup>["mail"], op: boolean) => { const a = new Hono(); mailApi(a, () => op, () => mail); return a; };
  const call = (a: Hono, m: string, p: string, b?: unknown) => a.request(p, { method: m, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  test("everything is for the operator: an agent token or anyone else gets 403, and nothing is sent", async () => {
    const { mail, sent } = setup(), a = app(mail, false);
    const routes: [string, string][] = [["GET", "/api/mail/accounts"], ["POST", "/api/mail/accounts"], ["DELETE", "/api/mail/accounts/x"], ["POST", "/api/mail/test"], ["POST", "/api/mail/accounts/x/sync"], ["GET", "/api/mail/folders"], ["GET", "/api/mail/messages"], ["GET", "/api/mail/messages/1"], ["POST", "/api/mail/messages/1/seen"], ["GET", "/api/mail/drafts"], ["POST", "/api/mail/drafts"], ["POST", "/api/mail/drafts/x/prepare"], ["POST", "/api/mail/send"], ["GET", "/api/mail/preset"]];
    for (const [m, p] of routes) expect([m + " " + p, (await call(a, m, p, {})).status]).toEqual([m + " " + p, 403]);
    expect(sent).toEqual([]);
  });
  test("add, sync, read, search, draft, prepare, send: the whole path, with the answers free of the password", async () => {
    const { mail, sent } = setup(), a = app(mail, true);
    const add = await call(a, "POST", "/api/mail/accounts", NEW); expect(add.status).toBe(201); const acc = await add.json() as { id: string };
    expect(JSON.stringify(acc)).not.toContain(PASSWORD);
    expect(await (await call(a, "POST", "/api/mail/test", NEW)).json()).toMatchObject({ ok: true });
    expect((await call(a, "POST", `/api/mail/accounts/${acc.id}/sync`)).status).toBe(200);
    const msgs = await (await call(a, "GET", `/api/mail/messages?account=${acc.id}&q=tomatoes`)).json() as { id: number }[]; expect(msgs.length).toBe(2);
    const one = await (await call(a, "GET", `/api/mail/messages/${msgs[0]!.id}`)).json() as { text: string }; expect(one.text.length).toBeGreaterThan(3);
    const draft = await (await call(a, "POST", `/api/mail/drafts/from/${msgs[0]!.id}`, { kind: "reply" })).json() as { id: string; subject: string };
    expect(draft.subject.startsWith("Re:")).toBe(true);
    const upd = await (await call(a, "PUT", `/api/mail/drafts/${draft.id}`, { account: acc.id, text: "Thanks, got it." })).json(); expect((upd as any).text).toBe("Thanks, got it.");
    expect(sent).toEqual([]);                                                                                 // a draft is only a draft
    const prep = await (await call(a, "POST", `/api/mail/drafts/${draft.id}/prepare`)).json() as { sendId: string; hash: string; plan: { to: string[] } };
    expect(sent).toEqual([]); expect(prep.plan.to.length).toBe(1);
    expect((await call(a, "POST", "/api/mail/send", { sendId: prep.sendId, hash: "wrong" })).status).toBe(400); expect(sent).toEqual([]);
    const done = await (await call(a, "POST", "/api/mail/send", { sendId: prep.sendId, hash: prep.hash })).json(); expect(done).toMatchObject({ sent: true });
    expect(sent.length).toBe(1); expect(sent[0]!.raw).toContain("Thanks, got it.");
    expect((await call(a, "POST", "/api/mail/send", { sendId: prep.sendId, hash: prep.hash })).status).toBe(400); expect(sent.length).toBe(1);   // the approval is used up
    const ledger = JSON.stringify(recent(50)); expect(ledger).not.toContain(PASSWORD); expect(ledger).not.toContain("Thanks, got it"); expect(ledger).not.toContain("tomatoes");
  });
  test("a draft changed after it was prepared cannot be sent with the old approval", async () => {
    const { mail, sent } = setup(), a = app(mail, true);
    const acc = await (await call(a, "POST", "/api/mail/accounts", NEW)).json() as { id: string };
    const d = await (await call(a, "POST", "/api/mail/drafts", { account: acc.id, to: "bob@example.net", subject: "Hi", text: "one" })).json() as { id: string };
    const prep = await (await call(a, "POST", `/api/mail/drafts/${d.id}/prepare`)).json() as { sendId: string; hash: string };
    await call(a, "PUT", `/api/mail/drafts/${d.id}`, { account: acc.id, text: "two" });
    expect((await call(a, "POST", "/api/mail/send", { sendId: prep.sendId, hash: prep.hash })).status).toBe(400); expect(sent).toEqual([]);
  });
  test("a plain unencrypted connection is only allowed to this computer", async () => {
    const { mail } = setup(), a = app(mail, true);
    expect((await call(a, "POST", "/api/mail/accounts", { ...NEW, imap: { host: "imap.example.com", port: 143, secure: false } })).status).toBe(400);
    expect((await call(a, "POST", "/api/mail/accounts", { ...NEW, imap: { host: "127.0.0.1", port: 143, secure: false }, smtp: { host: "localhost", port: 25, secure: false } })).status).toBe(201);
  });
  test("a duplicate account, a bad address and a missing password are refused", async () => {
    const { mail } = setup(), a = app(mail, true);
    expect((await call(a, "POST", "/api/mail/accounts", NEW)).status).toBe(201); expect((await call(a, "POST", "/api/mail/accounts", NEW)).status).toBe(400);
    expect((await call(a, "POST", "/api/mail/accounts", { ...NEW, address: "nope" })).status).toBe(400); expect((await call(a, "POST", "/api/mail/accounts", { ...NEW, address: "x@example.org", password: "" })).status).toBe(400);
  });
});
