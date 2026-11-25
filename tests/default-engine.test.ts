// Plan 7.9, first slice: who answers a newcomer's first message. The order is fixed, never the order the
// engines were detected in, so a coding tool cannot greet a person by accident.
import { describe, expect, test } from "bun:test";
import { defaultTarget, SOLO_ID } from "../core/crew";
import type { Target } from "../core/crew";

const t = (id: string, group: Target["group"], role: string, ok = true): Target => ({ id, label: id, role, ok, detail: ok ? null : "not installed", group });
const tool = (id: string, role = "Coding tool", ok = true) => t(id, "tools", role, ok);

/** What the core reports on a machine with only Caesar's Hermes profile, targets in detection order: the
 *  coding tool happens to come first, because engines are listed before crew. */
const hermesPresent = [tool("claude"), tool("codex"), t(SOLO_ID, "caesar", "Alone, without the crew"), t("hermes:caesar", "crew", "Commander"), t("hermes:vitruvius", "crew", "Developer")];

describe("who answers the first message", () => {
  test("Caesar alone wins when the main agent exists, whatever the detection order", () => {
    expect(defaultTarget(hermesPresent).target?.id).toBe(SOLO_ID);
    expect(defaultTarget([...hermesPresent].reverse()).target?.id).toBe(SOLO_ID);
    expect(defaultTarget(hermesPresent).message).toBe(null);
  });

  test("without Caesar alone, a Hermes main profile still beats a coding tool listed first", () => {
    const main = [tool("claude"), t("hermes:caesar", "crew", "Commander")];
    expect(defaultTarget(main).target?.id).toBe("hermes:caesar");
    // any Hermes profile is a general assistant; caesar is the main one when both are there
    const two = [t("hermes:vitruvius", "crew", "Developer"), t("hermes:caesar", "crew", "Commander")];
    expect(defaultTarget(two).target?.id).toBe("hermes:caesar");
    expect(defaultTarget([t("hermes:vitruvius", "crew", "Developer")]).target?.id).toBe("hermes:vitruvius");
  });

  test("Hermes absent with Claude Code: Claude Code answers, even if Ollama is detected first", () => {
    const got = defaultTarget([tool("ollama", "Model server"), tool("claude"), tool("codex")]);
    expect(got.target?.id).toBe("claude");
    expect(defaultTarget([tool("codex")]).target?.id).toBe("codex");
  });

  test("only Ollama: the local model answers", () => {
    expect(defaultTarget([tool("ollama", "Model server")]).target?.id).toBe("ollama");
  });

  test("an OpenAI-compatible server is the last resort before giving up, Gemini CLI never jumps the order", () => {
    expect(defaultTarget([tool("lmstudio", "Model server"), tool("gemini")]).target?.id).toBe("lmstudio");
  });

  test("nothing available gives an honest message and no engine", () => {
    const got = defaultTarget([tool("claude", "Coding tool", false), tool("ollama", "Model server", false)]);
    expect(got.target).toBe(null);
    expect(got.message).toContain("No engine can answer yet");
    expect(defaultTarget([]).message).toBe(got.message);
  });
});
