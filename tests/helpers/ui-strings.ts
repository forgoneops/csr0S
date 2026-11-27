// Reads the interface text out of the plain-JS pages, for the UI translation drift test (tests/ui-catalog-drift.test.ts).
// No JS parser ships here, so this is a small lexer: it only needs to tell strings and templates from comments and regexes.
const HOLE = "\u0001";

/** Every string and template literal of a script; a template's ${…} becomes one HOLE (what is inside is read too). */
export function literals(src: string): string[] {
  const out: string[] = []; let i = 0;
  const esc = () => {
    const c = src[++i]; i++;
    if (c === "n") return "\n"; if (c === "t") return "\t";
    if (c === "u" || c === "x") { const m = /^(\{[0-9a-f]+\}|[0-9a-f]{4}|[0-9a-f]{2})/i.exec(src.slice(i, i + 8)); if (m) { const hex = c === "x" ? m[0].slice(0, 2) : m[0].replace(/[{}]/g, ""); i += c === "x" ? 2 : m[0].length; return String.fromCodePoint(parseInt(hex, 16)); } }
    return c;
  };
  const quoted = (q: string) => { let s = ""; i++; while (i < src.length && src[i] !== q && src[i] !== "\n") s += src[i] === "\\" ? esc() : src[i++]; i++; out.push(s); };
  const template = () => {
    let s = ""; i++;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") s += esc();
      else if (src[i] === "$" && src[i + 1] === "{") { i += 2; code(true); s += HOLE; }
      else s += src[i++];
    }
    i++; out.push(s);
  };
  const code = (inTemplate: boolean) => {
    let depth = 0, prev = "";                    // prev: the last meaningful token, to tell a regex from a division
    while (i < src.length) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; }
      else if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; }
      else if (c === '"' || c === "'") { quoted(c); prev = "x"; }
      else if (c === "`") { template(); prev = "x"; }
      else if (c === "/" && (prev === "" || /^[(,=:[!&|?{};+\-*<>~^%]$|^(return|typeof|case)$/.test(prev))) {
        let cls = false; i++;
        while (i < src.length && src[i] !== "\n" && (cls || src[i] !== "/")) { if (src[i] === "\\") i++; else if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; i++; }
        i++; prev = "x";
      } else if (/[\w$]/.test(c)) { const m = /^[\w$]+/.exec(src.slice(i, i + 80))!; prev = m[0]; i += m[0].length; }
      else { if (c === "{") depth++; else if (c === "}") { if (inTemplate && depth === 0) { i++; return; } depth--; } if (!/\s/.test(c)) prev = c; i++; }
    }
  };
  code(false);
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", middot: "·", hellip: "…", times: "×", rarr: "→", larr: "←" };
const decode = (s: string) => s.replace(/&(\w+);/g, (m, e) => ENT[e] ?? m);

/** A bare string that reads like words for a person, not a selector, a class list, CSS, a path or an identifier. */
function prose(s: string): boolean {
  const t = s.trim();
  if (!/\p{L}{2}/u.test(t) || /^[.#\[\/@:?&=%_\-*>]|^--|[{}]|;\s*$|=['"]|\w\(|:\/\/|^data-|^aria-|^(application|text|image|audio|video)\/|\$\(|\\/.test(t)) return false;
  if (/^[A-Z][A-Za-z]+(-[A-Z][A-Za-z]+)+$/.test(t)) return false;                       // header names
  if (/^\p{Lu}[\p{Ll}'’]/u.test(t) || /^\p{Lu} /u.test(t)) return !/^\S*[a-z][A-Z]\S*$/.test(t);   // "Save", "Open it"; not camelCase
  if (/^\p{Lu}{2,}[ :·]/u.test(t)) return true;
  if (!/\s/.test(t)) return false;                                                       // one lowercase word: an id or a key
  const words = t.split(/\s+/);
  if (words.some((w) => /^btn$|^[a-z0-9]+(-[a-z0-9]+)+$|^[.#\[]|\d(px|%|ms|s|em|rem|fr|vh|vw)\b|^[a-z-]+:[^ ]/.test(w))) return false;   // class lists and CSS
  return words.filter((w) => /^\p{L}{2,}[.,:!?…]?$/u.test(w)).length >= 2 || /[.!?…]$/.test(t);
}

/** The text a literal would put on screen: for markup, its text nodes and the four translated attributes; otherwise the string itself. */
export function uiTexts(lit: string): string[] {
  if (/<\/?[a-zA-Z][\w-]*[\s>\/]|<\/?[a-zA-Z][\w-]*$|^[^<]*"\s*>|^\s*[\w-]+="/.test(lit)) {
    const out: string[] = [];
    for (const m of lit.matchAll(/(?:^|[\s"'])(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) if (!m[1].includes(HOLE)) out.push(decode(m[1]));
    const bare = lit.replace(/<(style|script|code|pre|kbd)\b[\s\S]*?(<\/\1>|$)/g, "<x>")
      .replace(/<\/?[a-zA-Z!](?:"[^"]*"|'[^']*'|[^'">])*>/g, "<>")
      .replace(/^(?:[^<>"]*"(?:\s+[\w-]+(?:="[^"]*")?)*\s*\/?>)/, "<>")             // the tail of a tag opened in an earlier piece
      .replace(/<\/?[a-zA-Z](?:"[^"]*"|'[^']*'|[^'">])*("[^"]*)?$/, "<>");           // a tag left open for a later piece
    for (const node of bare.split("<>")) if (node.trim() && !node.includes(HOLE) && !/^[\s\w-]*="/.test(node) && !/="/.test(node)) out.push(decode(node));
    return out;
  }
  return lit.includes(HOLE) || !prose(lit) ? [] : [lit];
}
