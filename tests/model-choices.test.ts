// The model choices: what each signed-in account offers (Hermes' own ACP answer, Codex's debug list), the pick kept for
// one agent alone, and the model each tool's command line is handed on a turn. No network and no process: the shapes are
// the tools' documented answers, and the command lines are the argv builders their engines really use.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hermesChatArgs } from "../core/crew";
import { argvWithModel } from "../core/engines/cli";
import { chooseModel, effectiveModel, hermesChoice, parseCodexModels, parseHermesModels, pickedModel, withPick } from "../core/model-choices";

describe("what the signed-in accounts offer", () => {
  test("Hermes' ACP answer lists every provider, keeps Hermes' own words and drops a model named twice", () => {
    const list = parseHermesModels({ models: {
      currentModelId: "nous:deepseek/deepseek-v4",
      availableModels: [
        { modelId: "nous:anthropic/claude-opus-5", name: "Nous Portal · anthropic/claude-opus-5" },
        { modelId: "openai-codex:gpt-6.2-sol", name: "ChatGPT or Codex Subscription · gpt-6.2-sol" },
        { modelId: "nous:anthropic/claude-opus-5", name: "the same model, listed again" },
        { name: "no id at all" },
      ],
    } });
    expect(list.map((m) => m.id)).toEqual(["nous:anthropic/claude-opus-5", "openai-codex:gpt-6.2-sol"]);
    expect(list.map((m) => m.group)).toEqual(["Nous Portal", "ChatGPT or Codex Subscription"]);
    expect(list[0]).toEqual({ id: "nous:anthropic/claude-opus-5", label: "Nous Portal · anthropic/claude-opus-5", group: "Nous Portal" });
  });

  test("a model Hermes names without a label still says which provider it comes from, and nothing is invented", () => {
    expect(hermesChoice("nous:qwen/qwen3.8-max")).toEqual({ id: "nous:qwen/qwen3.8-max", label: "Nous Portal · qwen/qwen3.8-max", group: "Nous Portal" });
    expect(hermesChoice("mystery:thing").group).toBe("Mystery");
    expect(parseHermesModels(null)).toEqual([]);
    expect(parseHermesModels({ models: {} })).toEqual([]);
  });

  test("Codex lists the ChatGPT models of this sign-in and hides the ones its own list marks hidden", () => {
    expect(parseCodexModels({ models: [
      { slug: "gpt-6.2-sol", display_name: "GPT-6.2-Sol", visibility: "list" },
      { slug: "internal", display_name: "Hidden", visibility: "hide" },
      { display_name: "no slug" },
    ] })).toEqual([{ id: "gpt-6.2-sol", label: "ChatGPT · GPT-6.2-Sol", group: "ChatGPT" }]);
    expect(parseCodexModels({ nope: true })).toEqual([]);
  });
});

describe("the pick belongs to one agent", () => {
  const offered = [
    { id: "nous:anthropic/claude-opus-5", label: "Nous Portal · anthropic/claude-opus-5" },
    { id: "nous:deepseek/deepseek-v4", label: "Nous Portal · deepseek/deepseek-v4" },
    { id: "local:llama3", label: "llama3:8b" },
  ];

  test("choosing in one agent's chat changes that agent alone, and survives the next look", () => {
    chooseModel("hermes:caesar", "nous:deepseek/deepseek-v4");
    expect(pickedModel("hermes:caesar")).toBe("nous:deepseek/deepseek-v4");
    expect(pickedModel("hermes:varro")).toBe("");                                  // the other agent is untouched
    expect(pickedModel("codex")).toBe("");
    chooseModel("codex", "gpt-6.2-sol");
    expect(pickedModel("hermes:caesar")).toBe("nous:deepseek/deepseek-v4");         // and so is the first one
  });

  test("the pick leads the list a chat with no model opens on, and answers a turn that says default", () => {
    expect(withPick("hermes:caesar", offered).map((m) => m.id)).toEqual(["nous:deepseek/deepseek-v4", "nous:anthropic/claude-opus-5", "local:llama3"]);
    expect(effectiveModel("hermes:caesar", "", offered)).toBe("nous:deepseek/deepseek-v4");
    expect(effectiveModel("hermes:caesar", "default", offered)).toBe("nous:deepseek/deepseek-v4");
    expect(effectiveModel("hermes:caesar", "nous:anthropic/claude-opus-5", offered)).toBe("nous:anthropic/claude-opus-5");   // the chat's own choice wins
  });

  test("a model a thread still names is dropped when the tool no longer offers it, and kept when the list could not be read", () => {
    expect(effectiveModel("hermes:caesar", "nous:gone-for-good", offered)).toBe("");
    expect(effectiveModel("hermes:caesar", "nous:gone-for-good", [])).toBe("nous:gone-for-good");   // nothing read: do not drop the person's choice
  });

  test("Caesar alone and Caesar with the crew are one agent with one pick, never two", () => {
    chooseModel("hermes:caesar!alone", "nous:anthropic/claude-opus-5");
    expect(pickedModel("hermes:caesar")).toBe("nous:anthropic/claude-opus-5");
    expect(withPick("hermes:caesar!alone", offered)[0]!.id).toBe("nous:anthropic/claude-opus-5");
    chooseModel("hermes:caesar", "");
    expect(pickedModel("hermes:caesar!alone")).toBe("");
  });

  test("a pick the tool no longer offers is ignored, and clearing it hands the choice back to the tool", () => {
    chooseModel("hermes:caesar", "nous:gone-for-good");
    expect(effectiveModel("hermes:caesar", "", offered)).toBe("");
    expect(withPick("hermes:caesar", offered).map((m) => m.id)).toEqual(offered.map((m) => m.id));
    chooseModel("hermes:caesar", "");
    expect(pickedModel("hermes:caesar")).toBe("");
    expect(effectiveModel("hermes:caesar", "", offered)).toBe("");
  });
});

describe("the selection reaches the tool", () => {
  test("the Atrium writes a choice with the method the route answers: PUT, never the generic POST", () => {
    const bridge = readFileSync(join(import.meta.dir, "..", "web", "atrium", "bridge.js"), "utf8");
    expect(bridge).toContain("j('/api/models/pick', { method: 'PUT'");
    expect(bridge).not.toContain("post('/api/models/pick'");
  });

  test("Codex gets its model right after the subcommand, before the stdin marker", () => {
    const codex = { id: "codex", args: ["exec", "--sandbox", "read-only", "-"], modelArg: "-m" };
    expect(argvWithModel("/bin/codex", codex, "gpt-6.2-sol")).toEqual(["/bin/codex", "exec", "-m", "gpt-6.2-sol", "--sandbox", "read-only", "-"]);
    expect(argvWithModel("/bin/codex", codex, "")).toEqual(["/bin/codex", "exec", "--sandbox", "read-only", "-"]);   // nothing picked: its own
  });

  test("Hermes gets -m on its chat subcommand, and none at all when the agent kept its own model", () => {
    expect(hermesChatArgs("/bin/hermes", { profile: "caesar", toolsets: "web,file", model: "nous:openai/gpt-6", queryFile: "/tmp/q" }))
      .toEqual(["/bin/hermes", "-p", "caesar", "-t", "web,file", "chat", "-Q", "--oneshot", "--format", "stream-json", "-m", "nous:openai/gpt-6", "--query-file", "/tmp/q"]);
    expect(hermesChatArgs("/bin/hermes", { profile: "caesar", queryFile: "/tmp/q" })).toEqual(
      ["/bin/hermes", "-p", "caesar", "chat", "-Q", "--oneshot", "--format", "stream-json", "--query-file", "/tmp/q"]);
  });
});
