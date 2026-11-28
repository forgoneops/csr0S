// The contract between the core and any model engine. An engine is a module behind this interface:
// the chat code asks it three things (is it answering, which models, stream a reply) and nothing else.
export type ChatRole = "system" | "user" | "assistant";
export type ChatImage = { mime: string; data: string };   // base64, for this turn only
export type ChatMessage = { role: ChatRole; content: string; images?: ChatImage[] };
export type EngineModel = { id: string; label: string; group?: string };   // group: the provider the menu files it under
export type EngineHealth = { ok: boolean; detail: string | null };
/** One tool call, as an engine reports it. The same id again updates the same row. approvalId ties it to an approval. */
export type ToolCall = { id: string; name: string; status: "running" | "waiting" | "ok" | "error"; input?: string; output?: string; ms?: number; approvalId?: string };
export type EngineEvent = { type: "tool"; call: ToolCall } | { type: "delta"; text: string } | { type: "thinking"; text: string } | { type: "done" };

export interface EngineAdapter {
  readonly id: string;
  /** True when the engine can be handed images (the model may still not be able to read them). */
  readonly vision?: boolean;
  readonly label: string;
  /** Where its model runs (see core/scope.ts). Missing means cloud. */
  scope?(): "local" | "cloud";
  health(opts?: { signal?: AbortSignal }): Promise<EngineHealth>;
  models(opts?: { signal?: AbortSignal }): Promise<EngineModel[]>;
  stream(messages: ChatMessage[], opts: { model: string; signal?: AbortSignal; think?: boolean }): AsyncIterable<EngineEvent>;
}
