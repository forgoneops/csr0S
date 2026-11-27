// Static scan of an item before it is installed (plan 8.6c): a skill, MCP server or plugin folder.
// Nothing here runs or imports the scanned code: every file is read as bytes and the rules are regexes on
// its text. A symlink is never followed, so a scan cannot read outside the folder either.
import { closeSync, constants, fstatSync, lstatSync, opendirSync, openSync, readlinkSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve, sep } from "node:path";
import { readRegularFileNoFollow } from "./safe-file";

export type Severity = "high" | "medium" | "low";
export type Finding = { file: string; line: number; rule: string; severity: Severity; excerpt: string };
export type Scan = { verdict: "green" | "yellow" | "red"; findings: Finding[]; files: number; bytes: number; sha256: string | null };
type ScanLimits = { maxEntries: number; maxTotalBytes: number; maxDepth: number };

const MAX_TEXT = 2_000_000; // larger files are counted but not scanned
const MAX_EXCERPT = 120;
const MAX_FINDINGS = 1_000;
const MAX_ENTRIES = 10_000;
const MAX_TOTAL_BYTES = 100_000_000;
const MAX_DEPTH = 32;
const boundedLimit = (value: number | undefined, ceiling: number) =>
  Number.isSafeInteger(value) && value! >= 0 ? Math.min(value!, ceiling) : ceiling;
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
  { name: "embedded-credential", severity: "high",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{20,}\b|\bAIza[0-9A-Za-z_-]{30,}\b|\bAWS_(?:SECRET_ACCESS_KEY|SESSION_TOKEN)\b\s*[:=]\s*["']?[A-Za-z0-9/+=]{32,}/i },
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
  let open: { char: string; length: number } | null = null;
  return lines.map((line) => {
    const t = line.replace(/^[\s\u200b\ufeff]*/, "");
    const m = t.match(/^(`{3,}|~{3,})/);
    if (open === null) {
      if (m) { open = { char: m[1][0]!, length: m[1].length }; return true; }
      return false;
    }
    if (m && m[1][0] === open.char && m[1].length >= open.length && t.slice(m[1].length).trim() === "") { open = null; return true; }
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

const DIRECT_ACTION = /^(?:(?:first|then|now)\s*,?\s*)?(?:(?:you|the agent)\s+(?:(?:must|should|need to|can)\s+)?)?(?:read|access|open|use|run|execute|send|upload|download|install|remove|delete|copy|paste|type|print|reveal|exfiltrate|curl|wget|fetch)\b/i;
function directiveFor(line: string, index: number): boolean {
  const prefix = line.slice(0, index);
  const clause = prefix.split(/[.!?;:]\s+/).pop()!.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, "");
  return DIRECT_ACTION.test(clause);
}

function actionableProse(line: string, re: RegExp): boolean {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  for (const m of line.matchAll(new RegExp(re.source, flags))) if (directiveFor(line, m.index!)) return true;
  return false;
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
export function scanTree(dir: string, overrides: Partial<ScanLimits> = {}): Scan {
  const root = realpathSync(dir);
  const limits: ScanLimits = {
    maxEntries: boundedLimit(overrides.maxEntries, MAX_ENTRIES),
    maxTotalBytes: boundedLimit(overrides.maxTotalBytes, MAX_TOTAL_BYTES),
    maxDepth: boundedLimit(overrides.maxDepth, MAX_DEPTH),
  };
  const findings: Finding[] = [];
  let files = 0, entries = 0, bytes = 0;
  let halted = false;
  let complete = true;
  let findingsCapped = false;
  const content: { path: string; kind: "directory" | "file"; size: number; mode: number; sha256: string }[] = [];
  const rootStat = lstatSync(root);
  content.push({ path: "", kind: "directory", size: 0, mode: rootStat.mode & 0o777, sha256: "" });
  const add = (file: string, line: number, rule: string, severity: Severity, excerpt: string) => {
    if (findingsCapped) return;
    if (findings.length >= MAX_FINDINGS - 1) {
      findings.push({ file, line, rule: "scan-finding-limit", severity: "high", excerpt: `finding count reached ${MAX_FINDINGS}` });
      findingsCapped = true; complete = false; halted = true; return;
    }
    findings.push({ file, line, rule, severity, excerpt: redact(excerpt.trim()).slice(0, MAX_EXCERPT) });
  };

  const walk = (abs: string, rel: string, depth: number): void => {
    if (halted) return;
    if (depth > limits.maxDepth) {
      add(rel, 1, "scan-depth-limit", "high", `folder depth exceeds ${limits.maxDepth}`);
      complete = false;
      halted = true;
      return;
    }
    const expectedDir = lstatSync(abs);
    const dirFd = openSync(abs, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
    const openedDir = fstatSync(dirFd);
    const anchored = `/proc/self/fd/${dirFd}`;
    try {
      if (!openedDir.isDirectory() || openedDir.dev !== expectedDir.dev || openedDir.ino !== expectedDir.ino || !inside(realpathSync(anchored), root)) throw new Error("directory changed or escaped scan root");
      const directory = opendirSync(anchored);
      try {
      while (true) {
        const entry = directory.readSync();
        if (entry === null) break;
        if (halted) break;
        const p = join(anchored, entry.name);
        const r = rel ? `${rel}/${entry.name}` : entry.name;
        entries++;
        if (entries > limits.maxEntries) {
          add(r, 1, "scan-entry-limit", "high", `entry count exceeds ${limits.maxEntries}`);
          complete = false;
          halted = true;
          break;
        }
        if (entry.name.includes("\uFFFD")) {
          complete = false;
          add(r, 1, "invalid-path-encoding", "high", "path is not valid UTF-8");
          continue;
        }
        if (entry.isSymbolicLink()) {
          complete = false;
          files++;
          const link = readlinkSync(p);
          let target = resolve(anchored, link);
          try { target = realpathSync(target); } catch { /* dangling: judge the path it names */ }
          if (!inside(target, root)) add(r, 1, "path-escape", "high", `symlink -> ${link}`);
          else add(r, 1, "symbolic-link", "high", "symbolic links are not accepted in installable items");
          continue;
        }
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") { complete = false; add(r, 1, "bundled-dependencies", "high", "preinstalled dependencies are outside the scan"); }
          else if (entry.name === ".git") { complete = false; add(r, 1, "unscanned-vcs-data", "high", "version-control metadata is outside the scan"); }
          else {
            const st = lstatSync(p);
            content.push({ path: r, kind: "directory", size: 0, mode: st.mode & 0o777, sha256: "" });
            if (!SKIP_DIRS.has(entry.name)) { try { walk(p, r, depth + 1); } catch { complete = false; add(r, 1, "unreadable-directory", "high", "directory changed or could not be scanned"); } }
          }
          continue;
        }
        if (!entry.isFile()) {
          files++;
          complete = false;
          add(r, 1, "special-file", "high", "non-regular filesystem objects are not accepted");
          continue;
        }
        files++;
        const st = lstatSync(p);
        bytes += st.size;
        if (bytes > limits.maxTotalBytes) {
          add(r, 1, "scan-size-limit", "high", `total file size exceeds ${limits.maxTotalBytes} bytes`);
          complete = false;
          halted = true;
          break;
        }
        if (st.size > MAX_TEXT) {
          add(r, 1, "oversized-file", "high", `file exceeds ${MAX_TEXT} byte scan limit`);
          complete = false;
          continue;
        }
        let raw: Buffer;
        try { raw = readRegularFileNoFollow(p, st, root, MAX_TEXT); }
        catch { complete = false; add(r, 1, "unreadable-file", "high", "file could not be read during scan"); continue; }
        content.push({ path: r, kind: "file", size: raw.length, mode: st.mode & 0o777, sha256: createHash("sha256").update(raw).digest("hex") });
        const head = raw.subarray(0, 8);
        if (MAGIC.some((m) => m.test(head.toString("latin1")))) { add(r, 1, "executable-binary", "high", "binary file"); continue; }
        if (st.mode & 0o111 && !SCRIPT_EXT.test(entry.name)) add(r, 1, "executable-binary", "high", "executable bit set");

        const text = raw.toString("utf8");

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
          if (halted) return;
          const code = fence === null || fence[i];
          for (const rule of RULES) {
            if (halted) break;
            if (rule.exts && !rule.exts.test(entry.name)) continue;
            if (rule.codeOnly && !code && (!isMd || !actionableProse(line, rule.re!))) continue;
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
      } finally { try { directory.closeSync(); } catch { /* closed at end of directory */ } }
    } finally { closeSync(dirFd); }
  };
  try { walk(root, "", 0); } catch { complete = false; add("", 1, "unreadable-directory", "high", "scan root changed or could not be opened safely"); }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
  const verdict = findings.some((f) => f.severity === "high") ? "red"
    : findings.some((f) => f.severity === "medium") ? "yellow" : "green";
  const sha256 = complete
    ? createHash("sha256").update(JSON.stringify(content.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0))).digest("hex")
    : null;
  return { verdict, findings, files, bytes, sha256 };
}
