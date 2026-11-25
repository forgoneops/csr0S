import { expect, test } from "bun:test";
import { fetchFeed, isPrivateAddress, parseFeed } from "../core/news";

test("addresses on this computer, the home network or the tailnet count as private", () => {
  for (const a of ["127.0.0.1", ["10", "1", "2", "3"].join("."), ["192", "168", "0", "5"].join("."), "172.16.0.1", "169.254.169.254", ["100", "64", "1", "1"].join("."), "::1", "fd00::1", "fe80::1", "::ffff:" + ["10", "0", "0", "1"].join("."), "0.0.0.0"]) expect(isPrivateAddress(a)).toBe(true);
  for (const a of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(a)).toBe(false);
});
test("a feed address that points at a private host is refused before any request", async () => {
  await expect(fetchFeed("http://127.0.0.1:4410/api/state")).rejects.toThrow("private");
  await expect(fetchFeed("http://[::1]/x")).rejects.toThrow("private");
  await expect(fetchFeed("file:///etc/passwd")).rejects.toThrow();
});
test("RSS and Atom items come out as title, link and date; a link that is not http is dropped", () => {
  const rss = `<rss><channel><item><title><![CDATA[A & B]]></title><link>https://e.org/a</link><pubDate>Mon, 1 Jan 2026</pubDate></item><item><title>No link</title><link>javascript:x</link></item></channel></rss>`;
  expect(parseFeed(rss)).toEqual([{ title: "A & B", link: "https://e.org/a", at: "Mon, 1 Jan 2026" }, { title: "No link", link: "", at: "" }]);
  expect(parseFeed(`<feed><entry><title>T</title><link href="https://e.org/t"/><updated>2026-01-01</updated></entry></feed>`)).toEqual([{ title: "T", link: "https://e.org/t", at: "2026-01-01" }]);
});
