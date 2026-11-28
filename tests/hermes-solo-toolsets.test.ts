import { expect, test } from "bun:test";
import { knownToolsets, parseToolsetNames } from "../core/crew";

const LIST = `Built-in toolsets (cli):
  ✓ enabled  web  🔍 Web Search & Scraping
  ✗ disabled  kanban  📌 Kanban
  ✓ enabled  computer_use  🖱️  Computer Use

Plugin toolsets (cli):
  ✓ enabled  omh  🔌 Omh

MCP servers:
  caesar-brain  all tools enabled
`;

test("the names an installed Hermes knows are read from its tool list, MCP servers included", () => {
  expect([...parseToolsetNames(LIST)].sort()).toEqual(["caesar-brain", "computer_use", "kanban", "omh", "web"]);
});

test("the solo list drops what an older Hermes does not know, and stays whole when the list could not be read", () => {
  const known = parseToolsetNames(LIST);
  expect(knownToolsets("web,klieg,omh,caesar-computer,caesar-brain", known)).toBe("web,omh,caesar-brain");
  expect(knownToolsets("web,klieg,omh", new Set())).toBe("web,klieg,omh");
});
