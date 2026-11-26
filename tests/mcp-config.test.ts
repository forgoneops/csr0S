import { expect, test } from "bun:test";
import { addMcpConfig, removeMcpConfig, type McpConfigEntry } from "../core/mcp-config";

const entry: McpConfigEntry = {
  name: "caesaros-01234567-89ab-cdef-0123-456789abcdef",
  command: "bun",
  args: ["/tmp/caesaros-mcp/server.ts"],
  env: { CAESAROS_DATA: "/tmp/caesaros-data", CAESAROS_URL: "http://127.0.0.1:4410" },
};

test("Hermes MCP block merges and removes without changing other servers", () => {
  const before = 'model:\n  provider: ollama\nmcp_servers:\n  clock:\n    command: "uvx"\n';
  const installed = addMcpConfig("hermes", before, entry);
  expect(installed.text).toContain(`  ${entry.name}:\n    command: "bun"`);
  expect(addMcpConfig("hermes", installed.text, entry).text).toBe(installed.text);
  expect(removeMcpConfig("hermes", installed.text, entry.name).text).toBe(before);
});

test("Codex MCP block installs and removes while preserving unrelated TOML", () => {
  const before = 'model = "gpt-5"\n\n[mcp_servers.clock]\ncommand = "uvx"\n';
  const installed = addMcpConfig("codex", before, entry);
  expect(installed.text).toContain(`[mcp_servers.${entry.name}]`);
  expect(removeMcpConfig("codex", installed.text, entry.name).text).toBe(before);
});

test("Codex add/remove preserves exact trailing newline count for LF and CRLF", () => {
  for (const eol of ["\n", "\r\n"]) for (const count of [0, 1, 2, 4]) {
    const before = `model = "gpt-5"${eol}${eol}[mcp_servers.clock]${eol}command = "uvx"${eol.repeat(count)}`;
    const installed = addMcpConfig("codex", before, entry);
    expect(removeMcpConfig("codex", installed.text, entry.name).text).toBe(before);
  }
});

test("removal refuses to delete a modified MCP entry and preserves that config", () => {
  const installed = addMcpConfig("hermes", "", entry);
  const edited = installed.text.replace('command: "bun"', 'command: "other"');
  expect(() => removeMcpConfig("hermes", edited, entry.name)).toThrow("changed");
  expect(edited).toContain('command: "other"');
});

test("removal rejects marker indentation that does not belong to the target", () => {
  const installed = addMcpConfig("codex", `model = "gpt-5"\n`, entry);
  const indented = installed.text.replace("# >>> caesaros-install", "  # >>> caesaros-install").replace("# <<< caesaros-install", "  # <<< caesaros-install");
  expect(() => removeMcpConfig("codex", indented, entry.name)).toThrow("target");
});

test("unmarked conflicts, duplicate sections and mixed EOL fail closed", () => {
  expect(() => addMcpConfig("hermes", `mcp_servers:\n  ${entry.name}:\n    command: "other"\n`, entry)).toThrow("unmarked");
  expect(() => addMcpConfig("hermes", "mcp_servers:\n  x: {}\nmcp_servers:\n  y: {}\n", entry)).toThrow("ambiguous");
  expect(() => addMcpConfig("codex", 'model = "x"\r\nother = "y"\n', entry)).toThrow("line endings");
});
