// The real wire, against fake IMAP and SMTP servers on 127.0.0.1: the connection test says what went wrong, and a message really goes out over SMTP.
// Nothing here talks to a real mail account.
import { afterAll, expect, test } from "bun:test";
import { closeAll, fakeImap, fakeSmtp, type SmtpSeen } from "./helpers/fake-mail-servers";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-mail-wire-"));
const { createMail } = await import("../core/mail");
const { smtpTransport } = await import("../core/mail-smtp");

const PASS = "wire-test-password-4417";
afterAll(closeAll);
const mailEml = (id: number, subject: string, body: string) => `From: Ada <ada@example.org>\r\nTo: me@example.com\r\nSubject: ${subject}\r\nDate: Mon, 23 Nov 2026 1${id}:00:00 +0000\r\nMessage-ID: <w${id}@example.org>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;
const imapPort = () => fakeImap(PASS, [{ uid: 5, raw: mailEml(1, "Wire one", "Tomatoes over the wire.") }, { uid: 6, raw: mailEml(2, "Wire two", "Second message."), seen: true }]);
const smtp = (seen: SmtpSeen[]) => fakeSmtp(PASS, seen);

test("the connection test reaches a fake IMAP server, counts its folders, and tells a wrong password apart", async () => {
  const port = await imapPort(), mail = createMail({ dir: mkdtempSync(join(tmpdir(), "mail-wire-")) });
  const ok = await mail.manager.test({ address: "me@example.com", password: PASS, imap: { host: "127.0.0.1", port, secure: false } });
  expect(ok).toEqual({ ok: true, folders: 2 });
  const bad = await mail.manager.test({ address: "me@example.com", password: "nope", imap: { host: "127.0.0.1", port, secure: false } });
  expect(bad).toMatchObject({ ok: false, code: "auth" }); expect((bad as { error: string }).error).toContain("refused the login");
  const gone = await mail.manager.test({ address: "me@example.com", password: PASS, imap: { host: "127.0.0.1", port: 9, secure: false } });
  expect(gone).toMatchObject({ ok: false, code: "network" });
});

test("a message goes out over SMTP with the right envelope; a wrong password is refused and sends nothing", async () => {
  const seen: SmtpSeen[] = [], port = await smtp(seen);
  const acct = { id: "a", label: "", address: "me@example.com", fromName: "Me", user: "me@example.com", imap: { host: "x", port: 1, secure: false }, smtp: { host: "127.0.0.1", port, secure: false }, allowSelfSigned: false, saveSent: false, addedAt: 0 };
  const raw = Buffer.from("From: me@example.com\r\nTo: bob@example.net\r\nSubject: wire\r\n\r\nsent over the wire\r\n");
  const r = await smtpTransport(acct, PASS, raw, { from: "me@example.com", to: ["bob@example.net", "ann@example.net"] });
  expect(r.accepted.sort()).toEqual(["ann@example.net", "bob@example.net"]); expect(seen.length).toBe(1);
  expect(seen[0]!.raw).toContain("sent over the wire"); expect(seen[0]!.from).toBe("me@example.com"); expect(seen[0]!.to.sort()).toEqual(["ann@example.net", "bob@example.net"]);
  await expect(smtpTransport(acct, "wrong", raw, { from: "me@example.com", to: ["bob@example.net"] })).rejects.toThrow(); expect(seen.length).toBe(1);
});

test("a real sync over the wire: folders, the new inbox mail with its text, flags, and a second sync finds nothing new", async () => {
  const port = await imapPort(), mail = createMail({ dir: mkdtempSync(join(tmpdir(), "mail-wire-")) });
  const acc = await mail.manager.add({ address: "me@example.com", password: PASS, imap: { host: "127.0.0.1", port, secure: false }, smtp: { host: "127.0.0.1", port: 1, secure: false } });
  const s1 = await mail.manager.sync(acc.id, { only: ["INBOX"] }); expect(s1.errors).toEqual([]); expect(s1.added).toBe(2);
  const list = mail.store.list({ account: acc.id, folder: "INBOX" }); expect(list.map((m) => m.subject).sort()).toEqual(["Wire one", "Wire two"]);
  expect(mail.store.text(list.find((m) => m.subject === "Wire one")!.id)).toContain("Tomatoes over the wire."); expect(list.find((m) => m.subject === "Wire two")!.seen).toBe(true);
  expect(mail.store.list({ account: acc.id, q: "tomatoes" }).length).toBe(1);
  expect(await mail.manager.sync(acc.id, { only: ["INBOX"] })).toMatchObject({ added: 0, removed: 0 });
});
