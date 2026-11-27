import type { PluginContext } from "../../plugins";

type Entry = { id: string; date: string; kind: "snapshot" | "income" | "expense"; amount: number; note: string; createdAt: number };
type Target = { period: "day" | "month"; amount: number };
type Ledger = { entries: Entry[]; targets: Target[] };
const empty = (): Ledger => ({ entries: [], targets: [] });
const clean = (x: unknown, max: number) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const amount = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1_000_000_000 ? Math.round(x * 100) / 100 : null;
const cleanEntry = (x: unknown): x is Entry => !!x && typeof x === "object" && typeof (x as Entry).id === "string" && validDate((x as Entry).date) && ["snapshot", "income", "expense"].includes((x as Entry).kind) && amount((x as Entry).amount) !== null;
export function csvRows(source: string): string[][] {
  if (source.length > 1_000_000) throw new Error("CSV is too large. Keep imports under 1 MB.");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) { if (c === '"' && source[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"' && !cell) quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && source[i + 1] === "\n") i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function parseCsv(text: string): Omit<Entry, "id" | "createdAt">[] {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map(x => x.trim().toLowerCase());
  const dateI = header.indexOf("date"), kindI = header.indexOf("type"), amountI = header.indexOf("amount"), noteI = header.indexOf("note");
  if ([dateI, kindI, amountI].some(i => i < 0)) throw new Error("CSV needs date, type and amount columns.");
  if (rows.length > 1001) throw new Error("Import up to 1000 rows at a time.");
  return rows.slice(1).map((r, i) => {
    const date = (r[dateI] ?? "").trim(), kind = (r[kindI] ?? "").trim().toLowerCase(), value = Number((r[amountI] ?? "").trim());
    if (!validDate(date) || !["snapshot", "income", "expense"].includes(kind) || amount(value) === null) throw new Error(`CSV row ${i + 2} has an invalid date, type or amount.`);
    return { date, kind: kind as Entry["kind"], amount: value, note: clean(r[noteI] ?? "", 240) };
  });
}
export default function ({ routes, store }: PluginContext) {
  const read = (): Ledger => { const raw = store.get<Ledger>("ledger", empty()); return { entries: Array.isArray(raw.entries) ? raw.entries.filter(cleanEntry) : [], targets: Array.isArray(raw.targets) ? raw.targets.filter(t => (t.period === "day" || t.period === "month") && amount(t.amount) !== null) : [] }; };
  const save = (l: Ledger) => store.set("ledger", l);
  const fail = (c: any, message: string, status = 400) => c.json({ error: message }, status);
  routes.get("/", c => { const l = read(); return c.json({ entries: l.entries.sort((a,b) => b.date.localeCompare(a.date) || b.createdAt-a.createdAt), targets: l.targets, totals: { cash: l.entries.filter(e => e.kind === "snapshot").sort((a,b)=>b.date.localeCompare(a.date))[0]?.amount ?? 0, income: l.entries.filter(e => e.kind === "income").reduce((n,e)=>n+e.amount,0), expense: l.entries.filter(e => e.kind === "expense").reduce((n,e)=>n+e.amount,0) } }); });
  routes.post("/entries", async c => { const b = await c.req.json().catch(()=>({})) as Record<string,unknown>, date = String(b.date ?? ""), value = amount(b.amount); if (!validDate(date)) return fail(c,"Enter a valid date."); if (!value || value <= 0) return fail(c,"Amount must be greater than zero."); if (!["snapshot","income","expense"].includes(String(b.kind))) return fail(c,"Choose snapshot, income or expense."); const l=read(), entry: Entry={id:crypto.randomUUID(),date,kind:b.kind as Entry["kind"],amount:value,note:clean(b.note,240),createdAt:Date.now()}; l.entries.push(entry);save(l);return c.json({entry},201); });
  routes.delete("/entries/:id", c => { const l=read(), before=l.entries.length;l.entries=l.entries.filter(e=>e.id!==c.req.param("id"));if(l.entries.length===before)return fail(c,"Entry not found.",404);save(l);return c.json({ok:true}); });
  routes.put("/targets", async c => { const b=await c.req.json().catch(()=>({})) as Record<string,unknown>, value=amount(b.amount);if((b.period!=="day"&&b.period!=="month")||value===null)return fail(c,"Choose a daily or monthly target amount.");const l=read(),target={period:b.period,amount:value} as Target;l.targets=[...l.targets.filter(t=>t.period!==target.period),target];save(l);return c.json({targets:l.targets}); });
  routes.post("/import/preview", async c => { const b=await c.req.json().catch(()=>({})) as Record<string,unknown>;if(typeof b.csv!=="string")return fail(c,"Choose a CSV file to preview.");try{return c.json({rows:parseCsv(b.csv)});}catch(e){return fail(c,(e as Error).message);} });
  routes.post("/import", async c => { const b=await c.req.json().catch(()=>({})) as Record<string,unknown>;try{if(!Array.isArray(b.rows)||b.rows.length>1000)throw new Error("Preview up to 1000 rows before saving.");const normalized=b.rows.map((r: any)=>{if(!r||!validDate(String(r.date))||!["snapshot","income","expense"].includes(r.kind)||amount(r.amount)===null)throw new Error("Imported rows are invalid. Preview the CSV again.");return {date:String(r.date),kind:r.kind,amount:amount(r.amount)!,note:clean(r.note,240)};});const l=read(),now=Date.now();l.entries.push(...normalized.map(e=>({...e,id:crypto.randomUUID(),createdAt:now})));save(l);return c.json({imported:normalized.length});}catch(e){return fail(c,(e as Error).message);} });
}
