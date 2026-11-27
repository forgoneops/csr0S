export type ScheduledTask = { id: string; state: string; name: string; schedule: string; nextRun: string; prompt?: string };

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const HEADER = /^\s{0,3}([A-Za-z0-9][A-Za-z0-9_-]{0,63})\s+\[([A-Za-z]+)\]\s*$/;
const FIELD = /^\s{2,}([A-Za-z][A-Za-z ]*?):[ \t]*(.*)$/;

export function parseScheduleList(raw: string): ScheduledTask[] {
  const lines = raw.replace(ANSI, "").replace(/\r/g, "").split("\n")
    .map(line => line.replace(/\s+$/, ""))
    .filter(line => line.trim() && !/^[┌┐└┘├┤┬┴┼─]+$/u.test(line.trim()))
    .map(line => line.trim().startsWith("│") && line.trim().endsWith("│") ? line.trim().slice(1, -1).replace(/\s+$/, "") : line);
  if (!lines.length) throw new Error("Hermes returned no output for the job list.");
  const first = lines[0].trim();
  if (/^no (?:scheduled |cron )?jobs\b/i.test(first)) {
    if (lines.slice(1).every(line => /^(?:create|add)\b.*(?:hermes cron|\/cron)/i.test(line.trim()))) return [];
    throw new Error("Unrecognised text after the empty-schedule message.");
  }
  if (!/^scheduled jobs\b.*$/i.test(first)) throw new Error(`Unrecognised Hermes output: ${first.slice(0, 120)}`);
  const drafts: { id: string; state: string; fields: Map<string, string> }[] = [];
  for (const line of lines.slice(1)) {
    const h = HEADER.exec(line);
    if (h) { drafts.push({ id: h[1], state: h[2].toLowerCase(), fields: new Map() }); continue; }
    const cur = drafts.at(-1);
    const f = FIELD.exec(line);
    if (!f || !cur) throw new Error(`Unrecognised line in job list: ${line.trim().slice(0, 120)}`);
    cur.fields.set(f[1].trim().toLowerCase(), f[2].trim());
  }
  if (!drafts.length) throw new Error("Hermes returned a job list title but no jobs.");
  const seen = new Set<string>();
  return drafts.map(d => {
    if (seen.has(d.id)) throw new Error(`Duplicate job id ${d.id}.`);
    seen.add(d.id);
    const required = (key: string) => {
      const value = d.fields.get(key);
      if (!value) throw new Error(`Job ${d.id} is missing "${key}".`);
      return value;
    };
    const job: ScheduledTask = { id: d.id, state: d.state, name: required("name"), schedule: required("schedule"), nextRun: required("next run") };
    const prompt = d.fields.get("prompt");
    if (prompt) job.prompt = prompt;
    return job;
  });
}
