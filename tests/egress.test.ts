// The outbound list: hosts only, never what else an address carries, and only for the operator.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-eg-"));
const { ON_REQUEST, egressApi, reachOf } = await import("../core/egress");

const sources = {
  urls: () => [{ what: "Server", url: `https://user:SECRET${"@"}models.example.org:8443/v1?key=SECRET2`, when: "w" }, { what: "Broken", url: "not an address", when: "w" }],
  hosts: () => [{ what: "Mail", host: "imap.example.org:993", when: "w" }],
  tools: async () => ["A coding tool"],
};

describe("outbound destinations", () => {
  test("only the operator reads them; paths, queries and credentials never appear", async () => {
    const app = new Hono();
    egressApi(app, (c) => c.req.header("x-me") === "1", sources, () => true);
    expect((await app.request("/api/egress")).status).toBe(403);
    const text = await (await app.request("/api/egress", { headers: { "x-me": "1" } })).text();
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("/v1");
    const body = JSON.parse(text) as { localOnly: boolean; destinations: { what: string; host: string; reach: string }[] };
    expect(body.localOnly).toBe(true);
    expect(body.destinations.map((d) => d.what)).toEqual(["Server", "Mail", "A coding tool", ...ON_REQUEST.map((d) => d.what)]);
    expect(body.destinations[0]).toMatchObject({ host: "models.example.org:8443", reach: "internet" });
  });
  test("a public name that looks like a private address counts as the internet", () => {
    expect(reachOf("127.0.0.1")).toBe("this machine");
    expect(reachOf("localhost")).toBe("this machine");
    expect(reachOf(["192", "168", "1", "9"].join("."))).toBe("your network");
    expect(reachOf("box.local")).toBe("your network");
    expect(reachOf("10.example.org")).toBe("internet");
    expect(reachOf("127.evil.org")).toBe("internet");
  });
  test("every https address written into a core call is on the list", () => {
    const core = join(import.meta.dir, "..", "core");
    const called = readdirSync(core).filter((f) => f.endsWith(".ts") && f !== "egress.ts")
      .flatMap((f) => [...readFileSync(join(core, f), "utf8").matchAll(/(?:get|fetch)\(`https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]!));
    expect(called.length).toBeGreaterThan(0);
    for (const h of called) expect(ON_REQUEST.map((d) => d.host)).toContain(h);
  });
});
