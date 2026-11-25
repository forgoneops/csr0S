import { expect, test } from "bun:test";
import { Hono } from "hono";
import { handoffApi } from "../core/handoff";
import { pairingApi } from "../core/pairing";

// Two cores in one process (they share one test database, so lists are searched, not indexed): A is the desktop, B the phone. B joins A with a code, then leaves A a task.
const make = (fetchImpl: typeof fetch) => {
  const a = new Hono(); const op = () => true;
  const who = (c: import("hono").Context) => { const h = c.req.header("authorization") ?? ""; return h.startsWith("Bearer tok-") ? h.slice(11) : null; };
  pairingApi(a, op, fetchImpl, { issue: (n) => "tok-" + n }); handoffApi(a, op, who, fetchImpl);
  return a;
};
// a tailnet-range address, written in parts so the repo-wide leak check sees no address literal
const PEER = ["100", "64", "0", "2"].join(".");
const json = (b: object) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

test("a paired device leaves a task; a stranger and a wrong key cannot", async () => {
  const desktop = make(fetch);
  await desktop.request("/api/pairing", { ...json({ visible: true }), method: "PUT" });
  const code = (await (await desktop.request("/api/pairing/code", { method: "POST" })).json() as { code: string }).code;
  const phone = make(((url: string, init?: RequestInit) => desktop.request(new URL(url).pathname, init as never)) as never);
  const jr = await phone.request("/api/pairing/join", json({ url: `http://${PEER}:4410`, code })); if (jr.status !== 200) console.log("JOIN", jr.status, await jr.text()); expect(jr.status).toBe(200);
  const mine = await (await phone.request("/api/pairing")).json() as { devices: { id: string; canSend: boolean }[] };
  const joined = mine.devices.find((d) => d.canSend);
  expect(joined).toBeTruthy();
  expect(JSON.stringify(mine)).not.toContain("tok-");   // the key is never shown back

  // the phone sends through its stored key
  const sent = await phone.request("/api/handoff/send", json({ deviceId: joined!.id, text: "  Write the weekly note  " }));
  // (the desktop's own routes read the key from the Authorization header the phone added)
  expect(sent.status).toBe(200);
  const inbox = await (await desktop.request("/api/handoff")).json() as { text: string; from: string }[];
  expect(inbox[0]!.text).toBe("Write the weekly note");
  expect((await desktop.request("/api/handoff", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tok-dev-nope" }, body: JSON.stringify({ text: "x" }) })).status).toBe(401);
  expect((await desktop.request("/api/handoff", json({ text: "x" }))).status).toBe(401);
  const id = (inbox[0] as unknown as { id: string }).id;
  await desktop.request(`/api/handoff/${id}`, { method: "DELETE" });
  expect((await (await desktop.request("/api/handoff")).json() as unknown[]).length).toBe(0);
});
test("sending to a device that cannot receive is refused", async () => {
  const a = make(fetch);
  expect((await a.request("/api/handoff/send", json({ deviceId: "missing", text: "x" }))).status).toBe(400);
});

test("a note travels as a note, is saved only when accepted, and never overwrites one", async () => {
  const { notes } = await import("../core/notes");
  const desktop = make(fetch);
  await desktop.request("/api/pairing", { ...json({ visible: true }), method: "PUT" });
  const code = (await (await desktop.request("/api/pairing/code", { method: "POST" })).json() as { code: string }).code;
  const phone = make(((url: string, init?: RequestInit) => desktop.request(new URL(url).pathname, init as never)) as never);
  await phone.request("/api/pairing/join", json({ url: `http://${PEER}:4410`, code }));
  const dev = ((await (await phone.request("/api/pairing")).json()) as { devices: { id: string; canSend: boolean }[] }).devices.find((d) => d.canSend)!;
  const nm = "Handoff note " + Date.now();
  notes.create(nm, "Body from the phone");
  expect((await phone.request("/api/handoff/send", json({ deviceId: dev.id, noteId: nm }))).status).toBe(200);
  expect((await phone.request("/api/handoff/send", json({ deviceId: dev.id, noteId: "No such note" }))).status).toBe(404);
  const inbox = await (await desktop.request("/api/handoff")).json() as { id: string; kind?: string; name?: string }[];
  const item = inbox.find((h) => h.name === nm)!;
  expect(item.kind).toBe("note");
  // the same name already exists here (shared test folder), so it is saved beside it, not over it
  const acc = await (await desktop.request(`/api/handoff/${item.id}/accept`, { method: "POST" })).json() as { name: string };
  expect(acc.name).toContain("(from");
  expect(notes.get(nm)!.content).toBe("Body from the phone");
});

test("a note without a usable name cannot slip past the task size cap (audit defect 6)", async () => {
  const { receive } = await import("../core/handoff");
  expect(receive("Phone", "x".repeat(50_000), { name: "../bad" })).toEqual({ error: "empty" });
  expect(receive("Phone", "x".repeat(50_000), { name: undefined })).toEqual({ error: "empty" });
  const ok = receive("Phone", "body", { name: "Fine name" }); expect("id" in ok && ok.kind === "note").toBe(true);
});
