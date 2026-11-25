// Fake IMAP and SMTP servers on 127.0.0.1 for tests and screenshots. Never a real account.
import { createServer, type Server } from "node:net";

export type FakeMsg = { uid: number; raw: string; seen?: boolean };
export const servers: Server[] = [];
export const closeAll = () => { for (const s of servers.splice(0)) s.close(); };
const listen = (onLine: (line: string, w: (s: string) => void, st: any) => void, greeting: string, port = 0): Promise<number> => new Promise((ok) => {
  const s = createServer((sock) => {
    const st: any = { data: false, buf: "" }, w = (t: string) => sock.write(t, "latin1");
    w(greeting);
    sock.on("data", (d) => { st.buf += d.toString("latin1"); let i: number; while ((i = st.buf.indexOf("\r\n")) >= 0) { const l = st.buf.slice(0, i); st.buf = st.buf.slice(i + 2); onLine(l, w, st); } });
    sock.on("error", () => {});
  });
  servers.push(s); s.listen(port, "127.0.0.1", () => ok((s.address() as { port: number }).port));
});

/** IMAP with LOGIN, LIST (INBOX and Sent), SELECT, FETCH (flags, and whole messages) and STORE: enough for a real sync. */
export const fakeImap = (pass: string, msgs: FakeMsg[], port = 0) => listen((line, w, st) => {
  const [tag, cmd = "", ...rest] = line.split(" "), up = cmd.toUpperCase(), args = rest.join(" ");
  const fetchLine = (m: FakeMsg, i: number, body: boolean) => `* ${i + 1} FETCH (UID ${m.uid} FLAGS (${m.seen ? "\\Seen" : ""}) RFC822.SIZE ${Buffer.byteLength(m.raw, "latin1")}${body ? ` BODY[] {${Buffer.byteLength(m.raw, "latin1")}}\r\n${m.raw}` : ""})\r\n`;
  const doFetch = (set: string, items: string) => {
    const want = set.includes(":") ? msgs.map((m) => m.uid) : set.split(",").map(Number);
    return msgs.flatMap((m, i) => (want.includes(m.uid) ? [fetchLine(m, i, /BODY|RFC822(?!\.SIZE)/i.test(items))] : [])).join("");
  };
  if (up === "CAPABILITY") w(`* CAPABILITY IMAP4rev1\r\n${tag} OK done\r\n`);
  else if (up === "ID") w(`* ID NIL\r\n${tag} OK done\r\n`);
  else if (up === "LOGIN") w(rest[1]?.replace(/"/g, "") === pass ? `${tag} OK [CAPABILITY IMAP4rev1] logged in\r\n` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
  else if (up === "LIST") w(args.startsWith('"" ""') ? `* LIST (\\Noselect) "/" ""\r\n${tag} OK done\r\n` : `* LIST (\\HasNoChildren) "/" "INBOX"\r\n* LIST (\\HasNoChildren \\Sent) "/" "Sent"\r\n${tag} OK done\r\n`);
  else if (up === "SELECT" || up === "EXAMINE") { st.folder = args.replace(/"/g, ""); const n = st.folder === "INBOX" ? msgs.length : 0; w(`* FLAGS (\\Seen \\Answered \\Flagged)\r\n* ${n} EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 7] ok\r\n* OK [UIDNEXT ${Math.max(0, ...msgs.map((m) => m.uid)) + 1}] ok\r\n${tag} OK [READ-WRITE] done\r\n`); }
  else if (up === "FETCH") { const m = /^(\S+)\s+\((.*)\)$/.exec(args); w(`${m ? doFetch(m[1], m[2]) : ""}${tag} OK done\r\n`); }
  else if (up === "UID") { const [sub, ...r2] = rest; if (sub.toUpperCase() === "FETCH") { const m = /^(\S+)\s+\((.*)\)/.exec(r2.join(" ")); w(`${m ? doFetch(m[1], m[2]) : ""}${tag} OK done\r\n`); } else w(`${tag} OK done\r\n`); }
  else if (up === "LOGOUT") w(`* BYE bye\r\n${tag} OK done\r\n`);
  else w(`${tag} OK done\r\n`);
}, "* OK [CAPABILITY IMAP4rev1] fake ready\r\n", port);

export type SmtpSeen = { raw: string; to: string[]; from: string };
export const fakeSmtp = (pass: string, seen: SmtpSeen[], port = 0) => listen((line, w, st) => {
  if (st.data) { if (line === ".") { st.data = false; seen.push({ raw: st.msg.join("\r\n"), to: st.to, from: st.from }); w("250 queued\r\n"); } else st.msg.push(line.startsWith("..") ? line.slice(1) : line); return; }
  const up = line.toUpperCase();
  if (up.startsWith("EHLO") || up.startsWith("HELO")) w("250-fake\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n");
  else if (up.startsWith("AUTH PLAIN")) { const [, user, p] = Buffer.from(line.split(" ")[2] ?? "", "base64").toString().split("\0"); w(p === pass && user ? "235 2.7.0 ok\r\n" : "535 5.7.8 bad credentials\r\n"); }
  else if (up.startsWith("MAIL FROM")) { st.from = line.slice(10).replace(/[<>]|\s.*$/g, ""); st.to = []; w("250 ok\r\n"); }
  else if (up.startsWith("RCPT TO")) { st.to.push(line.slice(8).replace(/[<>]/g, "")); w("250 ok\r\n"); }
  else if (up === "DATA") { st.data = true; st.msg = []; w("354 go\r\n"); }
  else if (up === "QUIT") w("221 bye\r\n");
  else w("250 ok\r\n");
}, "220 fake ESMTP ready\r\n", port);
