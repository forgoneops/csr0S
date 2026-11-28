// The tools as they are called inside CAESAR. The product name stays in Settings and in error text, so the operator always knows
// what is behind a name; "plain names" (Settings) turns every alias off. Pure, shared by the server and the web app.
export type ToolAlias = { name: string; product: string; meaning: string };

export const TOOL_ALIASES: Record<string, ToolAlias> = {
  claude: { name: "Claudius", product: "Claude Code", meaning: "Claude is the name of the emperor Claudius; the Fabri were the engineers and craftsmen of the legion: code, video, motion, editing." },
  codex: { name: "Consilium", product: "Codex", meaning: "A codex is a book of laws and a consilium the council of a Caesar: the reasoning behind the crew." },
  gemini: { name: "Dioscuri", product: "Gemini", meaning: "Gemini means the twins; the Dioscuri (Castor and Pollux) ride ahead as scouts: search and research." },
};

export type NameLocale = "en" | "pl";
type NameSettings = { plainNames?: boolean; toolNames?: Record<string, string>; theme?: string; lang?: NameLocale };

// Agentic-only display names: ONE table keyed by identity or role, then by locale. Hexameter (and the client edition's own
// rules) never read it. It changes labels only; ids, signing names and Hermes profiles ("claude", "claude-a", "vitruvius") stay as they are.
export const AGENTIC_NAMES: Record<string, Record<NameLocale, string>> = {
  "tool:claude": { en: "Claude Code", pl: "Claude Code" },
  "tool:codex": { en: "Codex", pl: "Codex" },
  "tool:gemini": { en: "Gemini", pl: "Gemini" },
  "account:claude:1": { en: "Claude A", pl: "Claude A" },
  "account:claude:2": { en: "Claude B", pl: "Claude B" },
  "role:operator": { en: "Operator", pl: "Operator" },
  "role:Leader": { en: "Lead agent", pl: "Agent wiodący" },
  "role:Lead agent": { en: "Lead agent", pl: "Agent wiodący" },
  "role:Coding hands": { en: "Coding hands", pl: "Wykonawca kodu" },
  "role:Developer": { en: "Developer core", pl: "Rdzeń deweloperski" },
  "role:Librarian": { en: "Librarian", pl: "Bibliotekarz" },
  "role:Assistant": { en: "Assistant", pl: "Asystent" },
  "role:Coding agent": { en: "Coding agent", pl: "Agent kodujący" },
};
/** The Agentic theme is saved as "aureum" (and "forum" in older settings). */
export const agenticTheme = (theme?: string): boolean => theme === "aureum" || theme === "forum";
/** The Agentic name for a key (see AGENTIC_NAMES) in a locale; undefined outside Agentic or when the table has no entry. */
export const agenticName = (key: string, s: NameSettings = {}): string | undefined => (agenticTheme(s.theme) ? AGENTIC_NAMES[key]?.[s.lang ?? "en"] : undefined);
/** A role as shown on screen: the Agentic label in Agentic, the role itself everywhere else (and for roles the table does not know). */
export const roleLabel = (role: string, s: NameSettings = {}): string => agenticName(`role:${role}`, s) ?? role;

declare const __EDITION__: string | undefined;   // set by the web build (vite define)
/** The client edition (Polish consumer build) calls the tools by what they are: Claude Code, Codex, Gemini. The owner's own CAESAR keeps the Roman names. */
export const consumerEdition = (): boolean =>
  (typeof __EDITION__ !== "undefined" && __EDITION__ === "consumer") || (typeof process !== "undefined" && /^(consumer|standard)$/.test(process.env?.CAESAR_EDITION ?? ""));

/** The display name of a tool agent; the product name when plain names are on, an operator override first, then the alias (the product name in the client edition). */
export function toolName(id: string, s: NameSettings = {}): string {
  const a = TOOL_ALIASES[id];
  if (!a) return id;
  if (s.plainNames) return a.product;
  if (agenticTheme(s.theme) && !s.toolNames?.[id]?.trim()) return agenticName(`tool:${id}`, s) ?? a.product;
  return s.toolNames?.[id]?.trim() || (consumerEdition() ? a.product : a.name);
}

/** Name of an account of the same tool: "Claudius Primus", "Claudius Secundus", then "Claudius III" ... (1-based). */
export function accountName(id: string, n: number, s: NameSettings = {}): string {
  const base = toolName(id, s);
  if (agenticTheme(s.theme)) return agenticName(`account:${id}:${n}`, s) ?? `${base} ${n}`;   // Agentic: "Claude A", "Claude B" even with plainNames (tools stay plain); Hexameter keeps Primus and Secundus
  if (consumerEdition() && !s.plainNames) return `${base} ${n}`;   // "Claude Code 1", "Claude Code 2": Primus and Secundus mean nothing to a client
  if (n === 1) return `${base} Primus`;
  if (n === 2) return `${base} Secundus`;
  return `${base} ${n}`;
}
