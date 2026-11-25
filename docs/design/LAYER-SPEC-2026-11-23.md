# The Caesar orchestration layer: Oh My Hermes, rebuilt and improved for every agent

Author: claude-b, 2026-11-23. Konrad's orders: the layer is based on Oh My Hermes (the best of the lot) and expanded, not a cut-down copy; everything we build on gets improved; it works with every agent (Hermes, Claude Code, Codex, local models); Jev is optional (choice: Local or Provider Jev); the research from the VPS on using Jev feeds the design; one product, not glued pieces. CaesarOS is open source: our own implementation of behaviours, no copied code, authors credited (oh-my-hermes maintainers, plugin 4.0.2; ideas also from oh-my-claudecode and oh-my-codex, read before use).

Source read: the plugin's own tool descriptions (24 tools, 10 hooks, memory provider). The plugin code itself was not copied or run for this spec. Behaviours below come from those descriptions; each must be confirmed in use before its build step.

## What omh gets right, and we keep as principles
1. **Prepared is not done.** Every tool says that preparing, recommending or recording is not execution, review, CI or merge evidence. We keep a hard line between *planned*, *started*, *observed* and *verified*, and the UI shows only what was observed.
2. **Metadata only.** Status and HUD carry no raw requests or secrets. Ours too.
3. **Checks run by the system, not claimed by the agent.** Team parts count as done only when the system runs the check command and it exits 0. Ours too, for every engine.
4. **Consent for outside services.** Jev is asked only when the person asked, with their own key; otherwise nothing is sent.
5. **Bounded and refusing.** DAGs refuse cycles, unknown edges, shared write scopes without an edge, more than 48 nodes. Ours keeps the limits.

## Naming: everything is `caesar`
Caesar is the system, so the layer carries its name and nothing of the source. One prefix, one rule:
- **Tools and calls:** `caesar_<name>`, e.g. `caesar_memory`, `caesar_decision_gate`, `caesar_delegate_route`. The tools are: `caesar_memory`, `caesar_context`, `caesar_resume`, `caesar_todo`, `caesar_dag`, `caesar_team`, `caesar_loop`, `caesar_delegate_route`, `caesar_recommend`, `caesar_route_answer`, `caesar_role`, `caesar_agent_board`, `caesar_decision_gate`, `caesar_gather_evidence`, `caesar_probe`, `caesar_source_trust`, `caesar_document_plan`, `caesar_search`, `caesar_status`, `caesar_hud`, `caesar_run_summary`, `caesar_capabilities`, `caesar_jev_ask`, `caesar_interact`, `caesar_chat`.
- **MCP servers:** `caesar-layer` (this layer), `caesar-brain`, `caesar-computer`, `caesar-board`, all sharing one registry in the core, so a new tool is added once and every engine sees it.
- **Skills:** `caesar-*` (one set for the whole crew). **Routes:** `/api/layer/*`. **Settings keys:** `layer.*`. **Events and records:** `caesar.run/v1` style names.
- **No `omh` string** in code, routes, settings, UI or file names. The credit to the oh-my-hermes maintainers lives in the README and this document only.
- **Hermes compatibility:** an optional shim maps the old names to ours for people who already use the Hermes plugin; it is not part of the core.

## Skill packs and the capability map
A skill pack (for example the adapted pstack) is stored once in a neutral format and projected into every connected agent by its adapter. Skill text names tools of the agent it was written for; the **capability map** translates them: ask-the-person question to the approval and ask card, subagent to `caesar_delegate_route`, todo list to `caesar_todo`, model panel to `caesar_panel`, role-to-model rules to Settings, "after opening a PR, babysit" to an autonomy loop (11.x). A tool with no equivalent is marked on the pack card as "partly supported" instead of being left to fail. Packs pass the install gate before they are projected.

## Positioning and why the layer owns its tools
CaesarOS is the improved take on agent mission-control apps, mainly built around Hermes (hence the agent marketplace) but able to run with any agent. That is why the layer ships its own tools and calls (the `caesar-layer` MCP server and the core's own wrapping of turns): everything works with Hermes and without it, with Jev and without it. Positioning stays internal: public text (README, Settings) describes the product, not other products.

## Caesar is the control plane above the agents' harnesses (corrected 2026-11-23)
Konrad's framing: Caesar orchestrates; Hermes (or Claude Code, Codex) is itself a harness, the runtime that runs the model loop, its tools and its context handling; Caesar is the layer you connect through, a cockpit for AI. The earlier wording of this section said Caesar replaces the agent's harness; that was too strong and is withdrawn.
- **Two levels.** The agent's harness runs a turn: model loop, its own tools, compaction, its own subagents. Caesar is the control plane: it starts and configures agents, gives them shared tools and memory, picks skills per task, holds approvals and policy, routes work between agents, and records and shows everything.
- **Attach through the agent's own extension points** and do not edit its internals: the agent's MCP configuration (`caesar-layer` tools), its hooks or permission mechanism (approvals), its profile or settings (context brief, chosen skills), its command line or API (start, stop, events). Where an agent has none, the core wraps the turn. Each recipe is verified against the real agent before it is listed.
- **Capability levels, shown honestly in the UI:** level 0 observe (the core wraps the turn: transcript, stop, cost), level 1 tools (MCP: memory, evidence, status), level 2 gates (hooks or permission callbacks: approvals, policy), level 3 full attach (context and skill injection, events). Each agent card says which level it has; a missing level is "not supported", never faked.
- **Nested orchestration boundary:** Caesar assigns work at task level to an agent or profile; what the agent does inside (its own subagents, its own todo list) is its business and arrives as events. Caesar does not micromanage inside a turn, so two orchestrators never fight over one step.
- **Do not switch off the agent's own layers by default.** For Hermes this means the oh-my-hermes plugin and its memory stay as they are. They are turned off for a Caesar session only where a conflict is shown (two memories answering one question, two routers choosing a model) and only by an explicit, visible, reversible setting. Harnesses update; replacing their internals is fragile.
- **The universal claim is earned by tests:** the same scripted task on two agents (Hermes first, then one more) gives the same run record, evidence and approval card before the product says "any agent".

## One layer, any agent (Hermes first-class, not the only one)
The layer belongs to CaesarOS, not to Hermes. Konrad loves Hermes and it stays the best-integrated agent, but anyone may run something else, so nothing in the layer may need Hermes to exist.
- **Engine adapter contract** (small, the same for all): start a turn, stream events (text, thinking, tool call, approval request, done), stop, report capabilities (tools, vision, thinking, MCP). Adapters exist for the core's engines: Hermes profiles, Claude Code, Codex, other CLIs, Ollama and OpenAI-compatible servers.
- **Two doors in:** engines that speak MCP get `caesar-layer` as a tool server (memory, approvals, evidence, status, routing); engines that do not get the same behaviour from the core wrapping their turn (events in, approvals and evidence recorded by the core).
- **Hermes first-class** means extras, not exclusivity: profiles as the crew, its native delegation and Kanban wired to our Tasks, its memory provider kept in sync with the Brain.
- **Operator role is a setting, not a fixed agent.** The operator (the CEO that plans, routes and delegates) is whichever agent the owner picks. In the owner's instance that is Caesar running on Hermes; in the clean product it is the first agent the person connects and can be changed any time. Every other connected agent is a worker the operator can route to. The layer's logic (routing, briefs, checks, approvals) is the same whoever holds the role.
- **Hot-plug, on the go.** Adapters load and unload at runtime: connect, swap or remove an agent, or install an item (with its bridge), and it is usable in the next turn with no restart of the core. Running turns finish on the adapter they started with. A failing adapter is isolated, marked unhealthy in the status object and skipped by the router, never taking the core down.
- **Test of universality:** the same scripted task runs on Hermes, Claude Code and a local model and produces the same run record, evidence and approval card.

## Tool by tool: what omh does, what ours does better

| omh tool | What it does (from its description) | Our version, improved |
|---|---|---|
| `memory`, `resume`, `context` | durable memory captured by the agent on its own, a dossier of earlier sessions, compact operating context before tools | One memory over **Brain** (notes, proposals, per-agent access) and the core's sessions, shared by every engine; capture proposals go through the Brain policy, never overwrite the owner's notes; resume shows what any engine did last |
| `todo`, `dag` | checkpoints per project; a DAG of small nodes with a brief per node (TASK, DELIVERABLE, SCOPE, VERIFY, STOP WHEN) | One **Tasks** model (cards, plans, runs, schedules): a node is a Board card with the six-field brief; the graph is drawn live; write scopes enforced by path; works across engines |
| `team` | accepted plan run as parallel parts, each done only when its check exits 0, command list approved by the person | Same, with the approval as a **card in chat** and the check output stored as evidence; parts can run on different engines |
| `loop` | one durable, permission-scoped loop per session | Loops are visible runs with a stop condition, budget and a Stop everything switch |
| `delegate_route` | routes the next delegation to one of 12 model categories by writing model and effort | Routes to a real **engine and model** (Claude Code, Codex, a Hermes profile, a local model) by category and cost; the pick and its outcome are logged so it improves; advisory first |
| `recommend`, `route_answer`, `role` | workflow recommendation, an answer to an undecidable route question, role context for sub-agents | One router with the question shown to the person when it cannot decide; roles = the crew (Vitruvius, Varro, ...) as real profiles |
| `agent_board` | prepare a durable Kanban action, with lane role skills filled in | Board cards created through the layer, with lane roles (builder, verifier, reviewer, docs, qa) and their skills |
| `decision_gate` | one authenticated decision on one open gate | The **approval card** in chat and on the phone; decisions authenticated as the operator, recorded with the session |
| `gather_evidence`, `probe`, `source_trust` | bounded allow-listed local checks; capability probes; a ceiling on what a class of source can support | Evidence store per run (command, exit code, output length), source trust shown next to claims in chat |
| `document_plan`, `search` | split a long document into read ranges before reading; plan and merge bounded search data | Document ranges for the Library and Knowledge, resumable and fan-out; search planned over Brain, knowledge, sessions and the web with provenance |
| `status`, `hud`, `run_summary`, `capabilities` | metadata-only status, HUD, end-of-run summary with time and tokens, manifest of what exists | One status object feeding the live bar and HUD, a receipt per run with real cost, a capability list per engine (vision, tools, thinking) |
| `jev_ask` | typed questions (yes/no, choice, score) with the person's own key, only when asked | **Jev as an option**: Local (rules plus a local model as judge) or Provider Jev; same typed question either way |
| `interact`, `chat` | an envelope for a chat request, recorded as wrapper-session evidence | The core's chat turn already is that envelope; add the evidence record |

## Jev: optional, and never the only gate (from the owner's research on the VPS)
Modes in Settings: **Off** (rules only), **Local** (a local model answers the typed questions), **Provider Jev** (the person's own key, text sent outward only as claims and short excerpts, never secrets or whole files).
Where Jev replaces a guess: done-check of a claim against verify output; "does this command match what the person asked, is it reversible" before an approval; who runs a piece; handoff risk scan (missing verify, vague done-when, protected paths, outward or irreversible asks); health words when a timer fires. Hard rules stay deterministic: sandbox, scope paths, budgets, argv only. Jev may object; it never approves an irreversible action. Raw probabilities are stored; thresholds are tuned on a small labelled sample before anything blocks; advisory first. Daily cost cap, default 0.50 USD, shown under Outside services.

## Build order (scope is the full layer; this is only what comes first)
1. The core part: run records with the planned, started, observed, verified line; evidence store; status and HUD object.
2. MCP server `caesar-layer` exposing memory, context, resume, decision gate, evidence, status to any engine. Check: Claude Code and a Hermes profile read the same note and raise an approval that appears in chat.
3. Tasks: DAG and team with the six-field brief, check commands, scopes.
4. Router with logged outcomes; loops; document plan.
5. Jev modes (Off, Local, Provider).
6. HUD, receipts, capability list.

## Rules
Every call logged (length only). The layer never edits the owner's notes without consent. Works with the network off for everything that needs no model. Open source clean: no owner data, no third-party code, authors credited in the README.
