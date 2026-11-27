// Leads: a pipeline a Scout and an Analyst fill and you decide. Stages: scouted, scored, offer (draft written), approved
// (you said yes), declined. There is no send path anywhere in this module: "approved" only records your yes, and what happens
// next is your own step. The offer draft is plain text written from the lead's own fields, no model call.
import type { PluginContext } from "../../core/plugins";

export const STAGES = ["scouted", "scored", "offer", "approved", "declined"] as const;
export type Stage = (typeof STAGES)[number];
export type Lead = { id: string; name: string; site: string; note: string; score: number | null; stage: Stage; offer: string; by: string; at: number };
const MAX = 500;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** What a draft says, from what is known about the lead. The owner edits it; nothing sends it. */
export function draftOffer(l: Pick<Lead, "name" | "site" | "score" | "note">): string {
  const why = l.score != null && l.score >= 60 ? `Your current site (${l.site || "no site listed"}) looks ready for a rebuild.` : `I had a look at ${l.site || "your online presence"}.`;
  return `Hello ${l.name},\n\n${why}${l.note ? ` ${l.note}` : ""}\n\nI build small, fast sites for local businesses. If you want, I can send a short plan and a price.\n\nBest regards`;
}

export default function leads(ctx: PluginContext) {
  const all = () => ctx.store.get<Lead[]>("leads", []);
  const save = (l: Lead[]) => ctx.store.set("leads", l.slice(-MAX));
  ctx.routes.get("/leads", (c) => c.json(all()));
  ctx.routes.post("/leads", async (c) => {
    const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const name = str(b.name, 80); if (!name) return c.json({ error: "A lead needs a name." }, 400);
    const l: Lead = { id: crypto.randomUUID().slice(0, 8), name, site: str(b.site, 200), note: str(b.note, 400), score: null, stage: "scouted", offer: "", by: str(b.by, 30) || "you", at: Date.now() };
    save([...all(), l]);
    return c.json(l, 201);
  });
  // The Analyst writes a score; the owner (or the Analyst) may edit the offer text. Neither moves a lead to approved.
  ctx.routes.patch("/leads/:id", async (c) => {
    const b = await c.req.json().catch(() => ({})) as Record<string, unknown>, list = all(), l = list.find((x) => x.id === c.req.param("id"));
    if (!l) return c.json({ error: "No such lead." }, 404);
    if (b.score !== undefined) {
      if (typeof b.score !== "number" || !Number.isFinite(b.score) || b.score < 0 || b.score > 100) return c.json({ error: "A score is 0 to 100." }, 400);
      l.score = Math.round(b.score); if (l.stage === "scouted") l.stage = "scored";
    }
    if (b.offer !== undefined) { l.offer = str(b.offer, 4000); if (l.offer && l.stage === "scored") l.stage = "offer"; }
    if (b.note !== undefined) l.note = str(b.note, 400);
    save(list);
    return c.json(l);
  });
  ctx.routes.post("/leads/:id/draft", (c) => {
    const list = all(), l = list.find((x) => x.id === c.req.param("id"));
    if (!l) return c.json({ error: "No such lead." }, 404);
    l.offer = draftOffer(l); if (l.stage === "scored" || l.stage === "scouted") l.stage = "offer";
    save(list);
    return c.json(l);
  });
  // Only these two are your word. Approving needs a draft to exist, so a yes always has something to say yes to.
  ctx.routes.post("/leads/:id/:verdict", (c) => {
    const v = c.req.param("verdict"), list = all(), l = list.find((x) => x.id === c.req.param("id"));
    if (v !== "approve" && v !== "decline" && v !== "reopen") return c.json({ error: "Unknown action." }, 404);
    if (!l) return c.json({ error: "No such lead." }, 404);
    if (v === "approve" && !l.offer) return c.json({ error: "Write an offer draft first." }, 409);
    l.stage = v === "approve" ? "approved" : v === "decline" ? "declined" : l.offer ? "offer" : l.score != null ? "scored" : "scouted";
    save(list);
    return c.json(l);
  });
  ctx.routes.delete("/leads/:id", (c) => { save(all().filter((x) => x.id !== c.req.param("id"))); return c.json({ removed: true }); });
}
