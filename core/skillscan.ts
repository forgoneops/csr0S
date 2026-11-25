// Static scan of an item before it is installed (plan 8.6c): a skill, MCP server or plugin folder.
// Nothing here runs or imports the scanned code: every file is read as bytes and the rules are regexes on
// its text. A symlink is never followed, so a scan cannot read outside the folder either.
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";

export type Severity = "high" | "medium" | "low";
export type Finding = { file: string; line: number; rule: string; severity: Severity; excerpt: string };
export type Scan = { verdict: "green" | "yellow" | "red"; findings: Finding[]; files: number; bytes: number };

const MAX_TEXT = 2_000_000; // larger files are counted but not scanned
const MAX_EXCERPT = 120;
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const MAGIC = [/^\x7fELF/, /^MZ/, /^\xcf\xfa\xed\xfe/, /^\xfe\xed\xfa/, /^\xca\xfe\xba\xbe/];
const SCRIPT_EXT = /\.(?:md|markdown|txt|sh|bash|zsh|ps1|bat|cmd|py|js|mjs|cjs|ts|tsx|jsx|json|ya?ml|toml)$/i;
const MARKDOWN = /\.(?:md|markdown)$/i;

const INJECTION = /ignore\s+(?:all\s+)?(?:(?:the|your)\s+)?(?:previous|above|prior|earlier)\s+instructions?|disregard\s+(?:all\s+)?(?:previous|prior|the above)|you\s+must\s+now|override\s+(?:the\s+)?system\s+(?:prompt|message)|system\s+prompt\s+override|do\s+not\s+(?:tell|inform|warn)\s+the\s+user|do\s+not\s+mention\s+this\s+to\s+the\s+user|send\s+(?:it|this|them)\s+to\s+(?:https?:|the\s+(?:following\s+)?url)|exfiltrat|reveal\s+(?:your|the)\s+system\s+prompt|you\s+are\s+now\s+(?:in\s+)?(?:developer|god|dan)\s+mode/i;

// codeOnly: the rule describes what a program does, so in markdown it only counts inside a fence.
type Rule = { name: string; severity: Severity; re?: RegExp; exts?: RegExp; codeOnly?: boolean; check?: (line: string) => boolean };
const RULES: Rule[] = [
  { name: "command-execution", severity: "high", codeOnly: true,
    re: /\bchild_process\b|(?<![.\w])(?:exec|execSync|execFile|spawn|spawnSync)\s*\(|\bos\.system\s*\(|\bsubprocess\.(?:run|call|Popen|check_output)|\bBun\.\$\s*`|\bDeno\.run\b|\bRuntime\.getRuntime\(\)/ },
  { name: "command-execution", severity: "high", codeOnly: true,
    re: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/ },
  { name: "command-execution", severity: "high", codeOnly: true,
    re: /`[^`\n]+`|\$\([^)\n]+\)/, exts: /\.(?:sh|bash|zsh)$/i },
  { name: "network", severity: "medium", codeOnly: true,
    re: /\bfetch\s*\(|\bnew\s+WebSocket\b|\bXMLHttpRequest\b|\baxios\b|\bhttps?\.(?:request|get)\s*\(|\bnet\.(?:connect|createConnection)\b|\brequests\.(?:get|post)\s*\(|\burllib\.request\b|\bhttpx\.|\bfrom\s+["']https?["']|hooks\.slack\.com|discord(?:app)?\.com\/api\/webhooks|\/webhooks?\b/i },
  { name: "secret-read", severity: "high", codeOnly: true,
    re: /~\/\.ssh|\/\.ssh\/|\bid_rsa\b|\bid_ed25519\b|\.aws\/credentials|\.netrc\b|\.git-credentials|\.npmrc|\.docker\/config\.json|\.kube\/config|Login Data|Library\/Application Support\/(?:Google|Mozilla)|\bsecurity find-(?:generic|internet)-password\b|\bkeychain\b|process\.env\.[A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD)|os\.environ(?:\.get)?\s*\(\s*["'][A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASS)|getenv\s*\(\s*["'][A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASS)|\/\.env\b/i },
  { name: "dynamic-code", severity: "high", codeOnly: true,
    re: /\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(|(?<![\w.])Function\s*\(\s*["'`]|require\s*\(\s*[^"'`\s]/ },
  { name: "obfuscation", severity: "high",
    re: /[A-Za-z0-9+/]{200,}={0,2}|String\.fromCharCode\s*\((?:[^)\n]*,){4,}|(?:\\x[0-9a-fA-F]{2}){8,}|\batob\s*\([^)]{40,}/ },
  { name: "hidden-unicode", severity: "high", check: hiddenUnicode },
  { name: "prompt-injection", severity: "high", re: INJECTION },
  { name: "broad-permissions", severity: "medium", codeOnly: true,
    re: /--dangerously-skip-permissions|\bbypassPermissions\b|\bdanger-full-access\b|\bchmod\s+777\b|\bsudo\b|full\s+disk\s+access|allow\s+all\s+(?:files|tools|permissions)|"permissions"\s*:\s*\[\s*"\*"|allowed-tools\s*:\s*\*/i },
];

// A whole secret must never reach a report: any long unbroken token is cut to four characters.
function redact(s: string): string {
  return s.replace(/[A-Za-z0-9_\-+/=]{24,}/g, (m) => `${m.slice(0, 4)}…`);
}

const inside = (p: string, root: string) => p === root || p.startsWith(root + sep);

// Line index -> whether it belongs to a fenced code block (fence lines included).
function fencedLines(lines: string[]): boolean[] {
  let open: string | null = null;
  return lines.map((line) => {
    const t = line.replace(/^[\s\u200b\ufeff]*/, "");
    const m = t.match(/^(`{3,}|~{3,})/);
    if (open === null) {
      if (m) { open = m[1][0]; return true; }
      return false;
    }
    if (m && m[1][0] === open) { open = null; return true; }
    return true;
  });
}

// Emoji ZWJ sequences, variation selectors and skin tones are legitimate text; bidi controls, tag
// characters and zero-width characters between normal letters are not.
function hiddenUnicode(line: string): boolean {
  const chars = [...line];
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0)!;
    if (cp >= 0xe0000 && cp <= 0xe007f) return true;
    if ((cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0x061c || cp === 0x200e || cp === 0x200f) return true;
    if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff) {
      const a = chars[i - 1], b = chars[i + 1];
      if (a && b && /[\p{L}\p{N}]/u.test(a) && /[\p{L}\p{N}]/u.test(b)) return true;
    }
  }
  return false;
}

// Spans in quotes or inline code, where a phrase is mentioned rather than spoken to the agent.
function mentioned(line: string, index: number): boolean {
  const spans = /`[^`]*`|"[^"]*"|“[^”]*”|(?<!\w)'[^']*'(?!\w)/g;
  for (const m of line.matchAll(spans)) {
    if (index > m.index! && index < m.index! + m[0].length) return true;
  }
  return false;
}

// A sentence about refusing or ignoring such instructions is a defence, not the attack.
const DEFENCE = /\b(?:refuse|refusing|do not follow|don't follow|never follow|not instructions|inert|steer you|tries to steer|prompt injection|data, not instructions)\b/i;

// In prose a phrase only counts when it opens a clause, i.e. it is addressed to the agent.
function imperative(line: string, index: number): boolean {
  if (/(?:^|[.!?:;)\]>•*-]|\d+[.)])\s*$/.test(line.slice(0, index))) return true;
  return /^you\s+(?:must|are\s+now)/i.test(line.slice(index));
}

function injectionInProse(line: string): boolean {
  for (const m of line.matchAll(new RegExp(INJECTION.source, "gi"))) {
    if (mentioned(line, m.index!)) continue;
    if (DEFENCE.test(line)) continue;
    if (!imperative(line, m.index!)) continue;
    return true;
  }
  return false;
}

/** Scan a folder without running or importing anything from it. Pure reads. */
export function scanTree(dir: string): Scan {
  const root = realpathSync(dir);
  const findings: Finding[] = [];
  let files = 0, bytes = 0;
  const add = (file: string, line: number, rule: string, severity: Severity, excerpt: string) => {
    findings.push({ file, line, rule, severity, excerpt: redact(excerpt.trim()).slice(0, MAX_EXCERPT) });
  };

  const walk = (abs: string, rel: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const p = join(abs, entry.name);
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        files++;
        const link = readlinkSync(p);
        let target = resolve(abs, link);
        try { target = realpathSync(target); } catch { /* dangling: judge the path it names */ }
        if (!inside(target, root)) add(r, 1, "path-escape", "high", `symlink -> ${link}`);
        continue;
      }
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(p, r);
        continue;
      }
      if (!entry.isFile()) continue;
      files++;
      const st = lstatSync(p);
      bytes += st.size;
      let head: Buffer;
      try { head = readFileSync(p).subarray(0, 8); } catch { continue; }
      if (MAGIC.some((m) => m.test(head.toString("latin1")))) { add(r, 1, "executable-binary", "high", "binary file"); continue; }
      if (st.mode & 0o111 && !SCRIPT_EXT.test(entry.name)) add(r, 1, "executable-binary", "high", "executable bit set");

      if (st.size > MAX_TEXT) continue;
      let text: string;
      try { text = readFileSync(p, "utf8"); } catch { continue; }

      // Install-time hooks run on the operator's machine before anyone reads the code.
      if (/^(?:install|setup|preinstall|postinstall)\.(?:sh|bash|zsh|ps1|bat|cmd|py|js|mjs|cjs|ts)$/i.test(entry.name))
        add(r, 1, "install-script", "high", `install script ${entry.name}`);
      const hook = text.match(/"(?:pre|post)?install"\s*:|\"prepare\"\s*:/);
      if (basename(entry.name) === "package.json" && hook && hook.index !== undefined)
        add(r, text.slice(0, hook.index).split("\n").length, "install-script", "high", hook[0]);

      const lines = text.split("\n");
      const isMd = MARKDOWN.test(entry.name);
      const fence = isMd ? fencedLines(lines) : null;
      lines.forEach((line, i) => {
        const code = fence === null || fence[i];
        for (const rule of RULES) {
          if (rule.exts && !rule.exts.test(entry.name)) continue;
          if (rule.codeOnly && !code) continue;
          if (rule.name === "prompt-injection" && !code && !injectionInProse(line)) continue;
          if (rule.check) {
            if (rule.check(line)) add(r, i + 1, rule.name, rule.severity, line);
            continue;
          }
          if (!rule.re) continue;
          rule.re.lastIndex = 0;
          if (rule.re.test(line)) add(r, i + 1, rule.name, rule.severity, line);
        }
      });
    }
  };
  walk(root, "");

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
  const verdict = findings.some((f) => f.severity === "high") ? "red"
    : findings.some((f) => f.severity === "medium") ? "yellow" : "green";
  return { verdict, findings, files, bytes };
}
