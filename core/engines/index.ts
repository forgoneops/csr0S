// Importing this registers the shipped engines. Anything else registers itself with registerEngine.
import { setDefaultEngines } from "./registry";
import { ollama } from "./ollama";
import { cliEngines } from "./cli";
import { hermesCrewEngines } from "../crew";
import { createEchoEngine } from "./echo";

setDefaultEngines(() => [ollama, ...cliEngines(), ...hermesCrewEngines(), ...(process.env.CAESAROS_TEST_ENGINE === "1" ? [createEchoEngine()] : [])]);

export { registerEngine, unregisterEngine, getEngine, listEngines, resetEngines } from "./registry";
export type { ChatRole, ChatMessage, EngineModel, EngineHealth, EngineEvent, EngineAdapter } from "./types";
