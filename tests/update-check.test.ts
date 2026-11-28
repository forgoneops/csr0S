import { expect, test } from "bun:test";
import { checkUpdate, newerThan } from "../core/update";

const feed = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const SHA = "a".repeat(64);

test("versions compare by number, not as text", () => {
  expect(newerThan("0.1.10", "0.1.9")).toBe(true); expect(newerThan("0.2.0", "0.1.99")).toBe(true);
  expect(newerThan("0.1.0", "0.1.0")).toBe(false); expect(newerThan("0.1", "0.1.0")).toBe(false); expect(newerThan("0.0.9", "0.1.0")).toBe(false);
});

test("nothing is contacted until a feed is set, and only https (or loopback) feeds are read", async () => {
  let called = 0; const f = (async () => { called++; return new Response("{}"); }) as unknown as typeof fetch;
  expect((await checkUpdate(undefined, "0.1.0", f)).error).toBe("no_feed_configured");
  expect((await checkUpdate("http://example.com/latest.json", "0.1.0", f)).error).toBe("feed_must_be_https");
  expect((await checkUpdate("not a url", "0.1.0", f)).error).toBe("feed_url_invalid");
  expect(called).toBe(0);
});

test("a newer feed is reported with its checksum, an equal one is not, and a bad feed is refused", async () => {
  const a = await checkUpdate("https://x.test/latest.json", "0.1.0", feed({ version: "0.2.0", file: "p.tar.gz", sha256: SHA, size: 5, notes: "n" }));
  expect(a.newer).toBe(true); expect(a.feed?.sha256).toBe(SHA); expect(a.latest).toBe("0.2.0");
  expect((await checkUpdate("https://x.test/l.json", "0.2.0", feed({ version: "0.2.0" }))).newer).toBe(false);
  expect((await checkUpdate("https://x.test/l.json", "0.1.0", feed({ version: "latest" }))).error).toBe("feed_invalid");
  expect((await checkUpdate("https://x.test/l.json", "0.1.0", feed({}, 404))).error).toBe("feed_status_404");
  expect((await checkUpdate("https://x.test/l.json", "0.1.0", feed({ version: "0.3.0", sha256: "zz" }))).feed?.sha256).toBeUndefined();   // a malformed checksum is dropped, never trusted
});
