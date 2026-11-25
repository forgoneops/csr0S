// The chat's `/` menu: only Hermes' read-only commands that answer in one turn are offered, and they come from Hermes' own registry.
import { expect, test } from "bun:test";
import { SAFE, menuCommands } from "../core/commands";
import snapshot from "../core/hermes-commands.json";

test("every offered command exists in the Hermes snapshot and is not terminal-only", () => {
  const got = menuCommands();
  expect(got.length).toBeGreaterThan(5);
  for (const c of got) { const s = snapshot.commands.find((x) => `/${x.name}` === c.name); expect(s).toBeTruthy(); expect(s!.cli_only).toBe(false); expect(c.kind).toBe("hermes"); }
  expect(got.map((c) => c.name)).toContain("/usage");
});
test("nothing that changes Hermes itself is offered", () => {
  for (const bad of ["yolo", "update", "restart", "config", "approvals", "new", "undo", "rollback", "reload", "plugins"]) expect((SAFE as readonly string[]).includes(bad)).toBe(false);
});
test("a command missing from the registry is dropped, not invented", () => {
  expect(menuCommands({ commands: [{ name: "usage", description: "d", args: "" }] }).map((c) => c.name)).toEqual(["/usage"]);
});
