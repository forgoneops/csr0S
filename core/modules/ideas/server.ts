import type { PluginContext } from "../../plugins";

const LANES = ["inbox", "now", "next", "waiting", "parked", "done", "dropped"] as const;
type Lane = typeof LANES[number];
type Idea = { id: string; title: string; note: string; lane: Lane; position: number; createdAt: number; updatedAt: number; reason: string; trigger: string };
type Board = { ideas: Idea[]; limits: Partial<Record<Lane, number>> };
const DEFAULTS: Partial<Record<Lane, number>> = { now: 1, next: 3 };
const clean = (x: unknown, max: number) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const empty = (): Board => ({ ideas: [], limits: { ...DEFAULTS } });

export default function ({ routes, store }: PluginContext) {
  const read = (): Board => {
    const raw = store.get<Board>("board", empty());
    const ideas = Array.isArray(raw.ideas) ? raw.ideas.filter((x) => x && typeof x.id === "string" && LANES.includes(x.lane)) : [];
    return { ideas, limits: { ...DEFAULTS, ...(raw.limits ?? {}) } };
  };
  const save = (board: Board) => store.set("board", board);
  const board = () => {
    const b = read();
    return { lanes: Object.fromEntries(LANES.map((lane) => [lane, b.ideas.filter((i) => i.lane === lane).sort((a, c) => a.position - c.position)])), limits: b.limits, labels: { inbox: "Inbox", now: "Now", next: "Next", waiting: "Waiting", parked: "Parked", done: "Done", dropped: "Dropped" } };
  };
  const fail = (c: any, message: string, status = 400) => c.json({ error: message }, status);
  routes.get("/board", (c) => c.json(board()));
  routes.post("/ideas", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>, title = clean(body.title, 140);
    if (!title) return fail(c, "Add a title first.");
    const b = read(), id = `idea-${crypto.randomUUID()}`, now = Date.now();
    const idea: Idea = { id, title, note: clean(body.note, 1200), lane: "inbox", position: 0, createdAt: now, updatedAt: now, reason: "", trigger: "" };
    b.ideas.unshift(idea); b.ideas.filter((i) => i.lane === "inbox" && i.id !== id).forEach((i, n) => { i.position = n + 1; }); save(b); return c.json({ idea }, 201);
  });
  routes.post("/ideas/:id", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>, b = read(), idea = b.ideas.find((i) => i.id === c.req.param("id"));
    if (!idea) return fail(c, "Idea not found.", 404);
    if (body.title !== undefined) { const title = clean(body.title, 140); if (!title) return fail(c, "Add a title first."); idea.title = title; }
    if (body.note !== undefined) idea.note = clean(body.note, 1200); idea.updatedAt = Date.now(); save(b); return c.json({ idea });
  });
  routes.post("/ideas/:id/move", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>, b = read(), idea = b.ideas.find((i) => i.id === c.req.param("id"));
    if (!idea) return fail(c, "Idea not found.", 404);
    if (!LANES.includes(body.lane as Lane)) return fail(c, "Choose a valid lane.");
    const lane = body.lane as Lane, leaving = b.ideas.filter((i) => i.lane === lane && i.id !== idea.id);
    if (lane === "dropped" && !clean(body.reason, 240)) return fail(c, "Add a reason before dropping an idea.");
    const limit = b.limits[lane]; if (idea.lane !== lane && limit !== undefined && leaving.length >= limit) return c.json({ error: `${lane} is full. Move an existing card first.`, full: true }, 409);
    if (lane === "dropped") idea.reason = clean(body.reason, 240);
    else if (lane === "parked") idea.trigger = clean(body.trigger, 240);
    else if (idea.lane !== lane) { idea.reason = ""; idea.trigger = ""; }
    const index = typeof body.index === "number" && Number.isInteger(body.index) ? Math.max(0, Math.min(body.index, leaving.length)) : leaving.length;
    leaving.splice(index, 0, idea); leaving.forEach((i, n) => { i.lane = lane; i.position = n; }); idea.updatedAt = Date.now(); save(b); return c.json({ idea });
  });
  routes.get("/ideas/:id/history", (c) => c.json([]));
  routes.get("/export.md", (c) => {
    const b = board(), text = LANES.map((lane) => `## ${b.labels[lane]}\n${b.lanes[lane].map((i: Idea) => `- ${i.title}${i.note ? `: ${i.note}` : ""}`).join("\n") || "- Empty"}`).join("\n\n");
    return c.text(`# Ideas\n\n${text}\n`, 200, { "content-type": "text/markdown; charset=utf-8" });
  });
  routes.post("/limits", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const invalid = !LANES.includes(body.lane as Lane) || (body.limit != null && (typeof body.limit !== "number" || !Number.isInteger(body.limit) || body.limit < 1 || body.limit > 99));
    if (invalid) return fail(c, "Limit must be a whole number from 1 to 99, or none.");
    const b = read(); if (body.limit == null) delete b.limits[body.lane as Lane]; else b.limits[body.lane as Lane] = Number(body.limit); save(b); return c.json({ limits: b.limits });
  });
}
