# csr0S — CaesarOS

> Apes together strong. **Caesar — Slayer of the Digital Gods.**

CaesarOS is a local-first workspace for AI agents: a **crew you can talk to**, notes with a **Brain**, a **Board** of plans and goals, a terminal, and computer control — all running on your own machine. No account, no cloud, no monthly bill. Your agents work *for* you, on hardware you own.

![CaesarOS](assets/screens/atrium.webp)

## What it is

CaesarOS runs on your machine and serves its own pages on a local address. Every agent profile you already have becomes a **crew member** with its own name, role, memory and tools. Notes, chats, tasks and settings stay in a folder you choose, and nothing leaves the machine unless you add an address and choose to share it.

### The crew
Talk to a whole crew of agents, each with a name, role, its own memory and skills — not a single chatbot. They can hand work to each other and report back in their own voice.

### The Brain
A shared, cross-session memory: facts, decisions, and lessons the crew actually remembers — not a context window you lose. Ask the Brain what you already decided; it answers from what was written down.

### The Board
Plans, goals, and work items that survive. What is running, what needs your approval, what is waiting — the state of your crew's world, not a chat log.

### Computer control
The crew can read your screen, windows and keyboard — with your explicit approval — and act like an operator, not just a text box.

### Local-first, offline
Everything runs locally. Talk to the crew with no internet, no vendor, no tracking. Your data is yours.

## Installation

Requirements:
- 🐧 Our current build ships for **Linux** (a bare-metal machine, or a Linux VM).
- Bun, a few system packages, and ~1–2 GB of disk for the core. The installer checks for you.

### Linux
```bash
# 1. Install the CaesarOS runtime
curl -fsSL https://csr0s.app/install.sh | bash

# 2. Start the core (it binds 127.0.0.1 by default)
caesarcore

# 3. Open the Atrium
# → http://127.0.0.1:PORT     (the installer prints the exact address)
```
That is it. The first run walks you through picking an engine (Ollama, OpenRouter, or a local model), pairs your agent profiles, and opens the room. Nothing leaves your machine.

### Windows · macOS · Android
**Coming soon.** CaesarOS is being built for these platforms. Star the repo and sign up for the waitlist at https://csr0s.app to get the installer the day it lands.

## What makes it different

ChatGPT, Claude, and the like are fine as text boxes — but they are **sessions**, not a workspace. CaesarOS gives you:
- **A crew, not a chatbot** — several named agents with long-lived memory and skills, working together and handing off between themselves.
- **A Brain that remembers** — facts and decisions persist across every session, and the crew actually uses them.
- **Your machine, your data** — local-first, offline-capable, no vendor lock-in.
- **Real actions, with your approval** — the crew reads your screen, runs your terminal, and plans on your Board, always under your control.

## Project status

**Alpha 0.01.** This is an early, working build — the core is functional and tested, the Atrium shell is live, and the crew, Brain, Board and computer control are all real. Platform Windows/macOS/Android and the installer are on the way.

## How it fits together

- `core/` is the server: data folder, auth, event stream, module registry, chat, engines, notes,
  Board, mail, sync, approvals, terminal and computer control. Each concern is one file.
- `web/atrium/` is the shell the person sees, in plain JavaScript and CSS with no framework. It
  talks to the core's API only.
- `plugins/` are modules with their own routes and store, registered through the module interface.
- `skills/` are agent skills as markdown files, ready to be used by the crew.
- `src-tauri/` is the native desktop window around the same pages.

`packs/` holds fonts, icons and themes, each with a manifest. `tools/` holds the scripts, including
the agent layer and the leak check.

## For agents

An attached coding agent can read the Brain and the Board through MCP, and nothing else. The server
is `tools/caesar-layer-mcp.ts` and speaks MCP over standard input and output (`caesar_start`,
`caesar_recent`, `caesar_search`, `caesar_memory`, `caesar_todo`, `caesar_dag`, `caesar_status`).
It reads only what the owner shared, never edits the owner's notes, and can close only cards it
created and only with evidence.

## Privacy and safety

- The core binds to loopback and serves only its own pages. It refuses API writes from another site
  and rejects an unknown hostname.
- No hidden egress. Outbound requests go only to addresses you added (model servers, paired devices,
  gateways), and only when a feature needs them.
- Approvals gate anything outward or irreversible. Stop everything halts every running turn.
- Terminal and computer control are separate switches. Computer control arms for at most 15
  minutes and logs every action.
- Secrets such as API keys and device tokens are kept apart from settings and never returned by the
  API.

## Development

```sh
bun test tests        # the test suite, under tests/
bun run typecheck     # TypeScript, no emit
bun tools/leak-check.ts   # refuses personal data, paths, secrets and private addresses
```

- Run `bun test` and `bun run typecheck` before a push.
- The leak check runs on commit once `bun tools/install-hooks.sh` is installed. It exits 1 when
  something leaks.
- Commit explicit paths, never `git add -A`.

## Acknowledgements

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research: the default crew
  runtime.
- [xterm.js](https://github.com/xtermjs/xterm.js): the terminal.
- [Hono](https://github.com/honojs/hono): the server framework.
- [imapflow](https://github.com/postalsys/imapflow), [mailparser](https://github.com/nodemailer/mailparser)
  and [nodemailer](https://github.com/nodemailer/nodemailer): mail.
- The SIL Open Font License fonts in `packs/fonts/`
  ([OFL](https://openfontlicense.org)).
- [Oh My Hermes](https://github.com/rlaope/oh-my-hermes) by rlaope: ideas for the agent layer,
  rewritten as our own code.

## License

MIT — see [LICENSE](LICENSE). Third-party components and their licences are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
