# Audit: CaesarOS today against Off Grid Pro Desktop, and what is missing

Author: claude-b, 2026-11-22. Requested by Konrad, who asked for Jev to be used. Basis: the 17 Pro features and the clean-room bundle spec (`docs/reference/OGAD-PRO-ANALYSIS-2026-11-21.md`, `OGAD-PRO-BUNDLE-SPEC-2026-11-22.md`), checked against what the app on branch `shell/proto-port` (from `e41c6e2`) actually exposes: its API routes and pages, read in the code. Nothing here comes from running Pro.

## How Jev was used, and what it can and cannot do
Jev (TypeSafe) is a decision model: it answers choice, score and yes/no questions about a text, with a confidence. It writes nothing, so it cannot write this audit. I used it for one thing: for each feature, one question "how important is it for this person's daily use" with four answers (must, soon, later, skip), given a short description of Konrad's use and of the feature's state in our app. 18 calls, USD 0.0004 in total. **Treat its answers as a weak second opinion**: half of them have a confidence under 35 percent, and it does not know our product beyond the text I gave it. Where it and I disagree, the table says so.

## The table
Status: **have** = works and was seen; **part** = exists, narrower than Pro; **missing** = nothing in the app.

| Pro feature | Ours today | Status | Jev (confidence) | My read |
|---|---|---|---|---|
| God: assistant with voice and wake word, acts with web and computer use | Chat with the 8 real Hermes crew members, approval cards, Stop everything. No voice, no computer use | part | later (28%) | The chat half is done. **Computer use is the biggest single Pro function we do not have**, and it is the one you named earlier. Needs its own plan on Wayland |
| Tasks: every active run in one place | `/api/running`, live bar with Sessions and Stop | part | must (71%) | Agree. Only chat turns on this core are listed; crew runs started elsewhere (VPS) are not |
| Day: morning brief from real activity | none in the app (Calpurnia can write one on request) | missing | must (28%) | Low confidence. Cheap to do as a crew action, not a feature |
| Reflect: where time goes | none | missing | soon (32%) | Needs activity capture. Skip until capture exists |
| Replay: rewind the screen | none | missing | later (28%) | Agree: heavy and sensitive, owner-only, far later |
| Meetings: record, transcribe locally, note | none | missing | soon (28%) | **High value for you** (earlier plan put it first). Blocked on local transcription |
| Actions: to-dos from chats and meetings, approval-gated | approval cards, decision record | part | must (45%) | Agree. Nothing proposes actions from conversations yet |
| Entities: people and projects with a graph | notes with tags and backlinks | missing | soon (32%) | Agree. Curator-built, you accept |
| Unified search | keyword search over added documents, screen palette | part | must (76%) | **Agree, top gap.** Chats, notes, runs and documents are not searched together |
| Notifications | waiting counter, approval cards | part | must (51%) | No system or phone notifications. Needed for the phone as an outfield tool |
| Dictation / Voice | none | missing | soon (23%) | Wayland text injection untested |
| Scribe: rewrite in every app | none | missing | soon (32%) | Later, needs a small local model |
| Notes: plain files, versions, open a vault as it is | notes with revisions, trash, tags, backlinks | part | must (84%) | **Agree, close to done.** Missing: open an existing Obsidian vault in place |
| Vault (passwords) | none | skip | not asked | Decision: CAESAR does not hold secrets |
| Clipboard history | none | missing | must (65%) | Jev rates it higher than I would. Local only; the screen was never opened in the RE |
| Devices: sync of chats and settings | pairing code, paired list, join another core; sync not claimed | part | must (79%) | **Agree.** Pairing is there, the sync is not |
| Video | none | skip | not asked | Decision: skip |
| (not Pro) Connectors and MCP | none | missing | must (53%) | **Agree.** Needed for mail, calendar, GitHub from the crew |
| (not Pro) Image generation, gallery | none | missing | later (45%) | Agree |
| (not Pro) Semantic memory | keyword only | missing | must (35%) | Weak signal. Needs local embeddings first |

## What is missing, in the order I would do it
1. **The face**: the app does not look like the prototype yet. This outranks every row above, and it is being rebuilt now (Atrium as the shell, the crew wired in).
2. **Unified search** across notes, chats, documents and runs.
3. **Tasks across machines**: the crew's runs on the VPS in the same list and the same Stop.
4. **Connectors and MCP**: the crew can already use Hermes tools; the app needs a page to see and switch them.
5. **Devices sync** (chats and settings), on top of the pairing that exists.
6. **Notifications** to the phone for approvals.
7. **Meetings with local transcription**, then **computer use**, each with its own plan.

## Not verified
- Our side was read from code and routes, not by walking every screen.
- Pro's behaviour is from the earlier clean-room specs, not re-run today.
- The Atrium wiring (crew, real chat) is in progress and not counted as done here.
