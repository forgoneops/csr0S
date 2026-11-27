import { createHash } from "node:crypto";

export type McpConfigTarget = "hermes" | "codex";
export type McpConfigEntry = { name: string; command: string; args: string[]; env: Record<string, string> };
export type McpConfigEdit = { text: string; hash: string; changed: boolean };

const hash = (lines: string[]) => createHash("sha256").update(lines.join("\n")).digest("hex");
const validName = (name: string) => /^caesaros-[0-9a-f-]{36}$/.test(name);
const eolOf = (text: string) => {
  const lfOnly = text.replace(/\r\n/g, "");
  if ((lfOnly.includes("\n") && text.includes("\r\n")) || lfOnly.includes("\r")) throw new Error("mixed or unsupported config line endings");
  return text.includes("\r\n") ? "\r\n" : "\n";
};
const q = (s: string) => JSON.stringify(s);
function validateEntry(entry: McpConfigEntry): void {
  if (!validName(entry.name) || !entry.command || /[\r\n\0]/.test(entry.command) || entry.args.length > 32 || entry.args.some((x) => typeof x !== "string" || /[\r\n\0]/.test(x))) throw new Error("invalid MCP config entry");
  for (const [k, v] of Object.entries(entry.env)) if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(k) || typeof v !== "string" || /[\r\n\0]/.test(v)) throw new Error("invalid MCP environment entry");
}
function markers(lines: string[], name: string, target: McpConfigTarget): [number, number, string, number | undefined] | null {
  const start = `# >>> caesaros-install ${name}`;
  const end = `# <<< caesaros-install ${name}`;
  const starts = lines.flatMap((line, i) => line.trimStart().startsWith(start) ? [i] : []);
  const escaped = start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const validStarts = lines.flatMap((line, i) => new RegExp(`^( *)${escaped} sha256=([a-f0-9]{64})(?: eof=(0|[1-9][0-9]*))?$`).test(line) ? [i] : []);
  const ends = lines.flatMap((line, i) => line.trimStart() === end ? [i] : []);
  if (starts.length !== validStarts.length || starts.length !== ends.length || starts.length > 1 || (starts.length === 1 && ends[0] < starts[0])) throw new Error("owned MCP config markers are invalid");
  if (!starts.length) return null;
  const startMatch = new RegExp(`^( *)${escaped} sha256=([a-f0-9]{64})(?: eof=(0|[1-9][0-9]*))?$`).exec(lines[starts[0]])!;
  const endMatch = /^( *)# <<< caesaros-install [a-z0-9-]+$/.exec(lines[ends[0]]);
  if (!endMatch || endMatch[1] !== startMatch[1] || startMatch[1].includes("\t")) throw new Error("owned MCP config marker indentation is invalid");
  const allowedIndent = target === "hermes" ? ["", "  "] : [""];
  if (!allowedIndent.includes(startMatch[1])) throw new Error("owned MCP config marker indentation does not match the target");
  const expected = startMatch[2], eof = startMatch[3] === undefined ? undefined : Number(startMatch[3]);
  if (eof !== undefined && (!Number.isSafeInteger(eof) || eof > 100000)) throw new Error("owned MCP config marker metadata is invalid");
  if (hash(lines.slice(starts[0] + 1, ends[0])) !== expected) throw new Error("owned MCP config changed; leaving it untouched");
  return [starts[0], ends[0], expected, eof];
}
function markedBlock(name: string, body: string[], indent = "", originalEof?: number): { lines: string[]; hash: string } {
  const h = hash(body), eof = originalEof === undefined ? "" : ` eof=${originalEof}`;
  return { lines: [`${indent}# >>> caesaros-install ${name} sha256=${h}${eof}`, ...body, `${indent}# <<< caesaros-install ${name}`], hash: h };
}
function trailingEolCount(text: string, eol: string): number {
  const suffix = text.match(/(?:\r?\n)*$/)?.[0] ?? "";
  return suffix ? suffix.length / eol.length : 0;
}
function yamlBody(entry: McpConfigEntry, indent: string): string[] {
  const child = indent + "  ";
  return [
    `${indent}${entry.name}:`,
    `${child}command: ${q(entry.command)}`,
    `${child}args: [${entry.args.map(q).join(", ")}]`,
    `${child}env:`,
    ...Object.entries(entry.env).map(([k, v]) => `${child}  ${k}: ${q(v)}`),
  ];
}
function hermesAdd(text: string, entry: McpConfigEntry): McpConfigEdit {
  const eol = eolOf(text), lines = text.split(/\r?\n/), owned = markers(lines, entry.name, "hermes");
  if (owned) return { text, hash: owned[2], changed: false };
  const roots = lines.flatMap((line, i) => /^mcp_servers\s*:\s*(?:#.*)?$/.test(line) ? [i] : []);
  if (roots.length > 1 || lines.some((line) => /^\s+mcp_servers\s*:/.test(line))) throw new Error("Hermes MCP section is ambiguous");
  if (!roots.length) {
    if (lines.some((line) => /^\s*mcp_servers\s*:/.test(line))) throw new Error("Hermes MCP section format is unsupported");
    const block = markedBlock(entry.name, ["mcp_servers:", ...yamlBody(entry, "  ")], "", trailingEolCount(text, eol));
    const prefix = lines.join(eol).replace(/(?:\r?\n)*$/, "");
    return { text: `${prefix}${prefix.trim() ? eol + eol : ""}${block.lines.join(eol)}${eol}`, hash: block.hash, changed: true };
  }
  let end = roots[0] + 1;
  while (end < lines.length && (!lines[end].trim() || lines[end].startsWith(" "))) end++;
  if (lines.slice(roots[0] + 1, end).some((line) => new RegExp(`^\\s{2}${entry.name}:\\s*$`).test(line))) throw new Error("an unmarked MCP server with this name already exists");
  const block = markedBlock(entry.name, yamlBody(entry, "  "), "  ");
  lines.splice(end, 0, ...block.lines);
  return { text: lines.join(eol), hash: block.hash, changed: true };
}
function codexAdd(text: string, entry: McpConfigEntry): McpConfigEdit {
  const eol = eolOf(text), lines = text.split(/\r?\n/), owned = markers(lines, entry.name, "codex");
  if (owned) return { text, hash: owned[2], changed: false };
  if (lines.some((line) => new RegExp(`^\\[mcp_servers\\.${entry.name}(?:\\.env)?\\]$`).test(line.trim()))) throw new Error("an unmarked MCP server with this name already exists");
  const body = [
    `[mcp_servers.${entry.name}]`,
    `command = ${q(entry.command)}`,
    `args = [${entry.args.map(q).join(", ")}]`,
    `[mcp_servers.${entry.name}.env]`,
    ...Object.entries(entry.env).map(([k, v]) => `${k} = ${q(v)}`),
  ];
  const block = markedBlock(entry.name, body, "", trailingEolCount(text, eol)), prefix = lines.join(eol).replace(/(?:\r?\n)*$/, "");
  return { text: `${prefix}${prefix.trim() ? eol + eol : ""}${block.lines.join(eol)}${eol}`, hash: block.hash, changed: true };
}
export function addMcpConfig(target: McpConfigTarget, text: string, entry: McpConfigEntry): McpConfigEdit {
  validateEntry(entry);
  return target === "hermes" ? hermesAdd(text, entry) : codexAdd(text, entry);
}
export function removeMcpConfig(target: McpConfigTarget, text: string, name: string): McpConfigEdit {
  if (!validName(name)) throw new Error("invalid MCP config name");
  const eol = eolOf(text), lines = text.split(/\r?\n/), owned = markers(lines, name, target);
  if (!owned) return { text, hash: "", changed: false };
  lines.splice(owned[0], owned[1] - owned[0] + 1);
  let result = lines.join(eol);
  if (owned[3] !== undefined && lines.slice(owned[0]).every((line) => line === "")) result = result.replace(/(?:\r?\n)+$/, "") + eol.repeat(owned[3]);
  return { text: result, hash: owned[2], changed: true };
}
