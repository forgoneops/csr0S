// News: the owner adds feed addresses (RSS or Atom) and presses Refresh. Only then does the core fetch them, one by one, and
// only public hosts: an address that resolves to this computer, the home network or the tailnet is refused, so a feed
// cannot be used to reach other things. Titles and links come back; nothing is stored.
import type { Context, Hono } from "hono";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type Item = { title: string; link: string; at: string };

/** True for an address that is not on the public internet (loopback, private, link-local, tailnet CGNAT, unique-local). */
export function isPrivateAddress(a: string): boolean {
  if (a.includes(":")) { const l = a.toLowerCase(); return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || (l.startsWith("::ffff:") && isPrivateAddress(l.slice(7))); }
  const [p, q] = a.split(".").map(Number);
  return p === 0 || p === 10 || p === 127 || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 100 && q >= 64 && q <= 127) || p >= 224;
}

const strip = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/** Items from an RSS or Atom document: title, link and date, newest first as the feed lists them. */
export function parseFeed(xml: string, limit = 8): Item[] {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) ?? [];
  return blocks.slice(0, limit).map((b) => {
    const title = strip(b.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const link = strip(b.match(/<link[^>]*>([^<]+)<\/link>/)?.[1] ?? "") || (b.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "");
    const at = strip(b.match(/<(?:pubDate|updated|published)[^>]*>([\s\S]*?)<\/(?:pubDate|updated|published)>/)?.[1] ?? "");
    return { title, link: /^https?:\/\//.test(link) ? link : "", at };
  }).filter((i) => i.title);
}

export async function fetchFeed(url: string): Promise<Item[]> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((x) => x.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error("private");
  const r = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { accept: "application/rss+xml, application/atom+xml, text/xml" } });
  if (!r.ok) throw new Error(String(r.status));
  return parseFeed((await r.text()).slice(0, 1_000_000));
}

export const newsApi = (app: Hono, isOperator: (c: Context) => boolean) => app.get("/api/news", async (c: Context) => {
  if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
  const url = (c.req.query("url") ?? "").trim().slice(0, 500);
  try { return c.json(await fetchFeed(url)); } catch (e) { const m = (e as Error).message; return c.json({ error: m === "private" ? "private_address" : "unreachable" }, m === "private" ? 400 : 502); }
});
