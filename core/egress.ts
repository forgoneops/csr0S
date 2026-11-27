// Where this install can connect: every outbound destination that is configured, and the services the core calls when
// the person presses something. Built from the same stores the callers read. Only the host and port leave this file:
// never a path, query, user name or key. It is a list of destinations, not a log of traffic.
import type { Context, Hono } from "hono";
import { plainHttpOk } from "./pairing";

export type Reach = "this machine" | "your network" | "internet" | "set by the tool";
export type Destination = { what: string; host: string; reach: Reach; when: string };

export function reachOf(host: string): Reach {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h)) return "this machine";
  // a name that only starts like a private address is an ordinary public name
  return (/^[\d.]+$/.test(h) || /\.(local|ts\.net)$/.test(h)) && plainHttpOk(h) ? "your network" : "internet";
}

/** The services written into the core itself, each contacted only after a press. */
export const ON_REQUEST: Destination[] = [
  { what: "Weather", host: "api.open-meteo.com", reach: "internet", when: "When you press Look up on Weather. Only the city name is sent." },
  { what: "Weather place search", host: "geocoding-api.open-meteo.com", reach: "internet", when: "When you press Look up on Weather." },
  { what: "News feeds", host: "the feed address you add", reach: "internet", when: "When you press Refresh on News. Private addresses are refused." },
  { what: "Model downloads", host: "registry.ollama.ai", reach: "internet", when: "When you press Download. Ollama makes the connection." },
];

export type Sources = {
  urls: () => { what: string; url: string; when: string }[];
  hosts: () => { what: string; host: string; when: string }[];     // servers stored as a bare host and port
  tools: () => Promise<string[]>;                                  // installed engines that talk to their own provider
};

export async function destinations(s: Sources): Promise<Destination[]> {
  const out: Destination[] = [];
  for (const u of s.urls()) {
    try { const url = new URL(u.url); out.push({ what: u.what, host: url.host, reach: reachOf(url.hostname), when: u.when }); } catch { /* not an address: nothing can be sent to it */ }
  }
  for (const h of s.hosts()) out.push({ what: h.what, host: h.host, reach: reachOf(h.host.replace(/:\d+$/, "")), when: h.when });
  for (const label of await s.tools()) out.push({ what: label, host: "chosen by the tool", reach: "set by the tool", when: "When this engine answers. It uses its own sign-in; CaesarOS does not see its addresses." });
  return [...out, ...ON_REQUEST];
}

export function egressApi(app: Hono, isOperator: (c: Context) => boolean, s: Sources, localOnly: () => boolean) {
  app.get("/api/egress", async (c) => (isOperator(c) ? c.json({ localOnly: localOnly(), destinations: await destinations(s) }) : c.json({ error: "operator_only" }, 403)));
}
