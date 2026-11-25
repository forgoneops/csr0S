# Trailer scenes 04–06: screen-by-screen reconstruction notes (2026-11-22)

Source: `~/Downloads/caesar-promo-v4/caesar-v4-main-1080p.mp4` (1920x1080, 30 fps, 91.3 s). Frames were extracted full-resolution with `ffmpeg -ss <s> -i … -frames:v 1` into `docs/design/captures/trailer-2026-11-22/` (27 PNG, 42–68 s). Text was transcribed from those full-resolution frames with OCR and cross-checked against the prototype source where the trailer matches it (`~/apps/cockpit/docs/design/prototype/caesaros-new/og.js:99-108,148-168`). Nothing was changed in the source of either repo.

## Timecode correction

The older `TRAILER-ANALYSIS-AND-ATRIUM-PORT-2026-11-22.md` timeline is shifted. The scene callouts inside the video itself read:

| scene | callout | actual range |
|---|---|---|
| 04 | `> 04 / DEVICES . FASTI` | 42–47 s |
| 05 | `> 05 / MOBILE . VITA` | 48–54 s |
| 06 | `> 06 / MARKETPLACE . MERCATUS` | 55–68 s |

Frame 47 is the transition out of 04; frame 55 is the transition into 06. Use these ranges, not the older 49–57 / 58–67 / 68–80 table.

## Shared desktop chrome (frames 42–47 and 55–68)

All desktop shots use the same frame:

- Top bar (y≈0–66): logo block `CAESAR OS` with small orange `EVOLVE`; workspace tabs `I Main`, `II Daily`, `III Content Studio`, `IV Web Studio`, `V Dev`, `VI Knowledge`, `VII Team Ops`, `VIII System`, then a right arrow and a `+`; `VPS` chip with diamond icon and caret; search field `Find anything` with `CTRL K`; microphone button; warning/activity button; `MOTION` control showing `Full`. A thin Greek-key pattern runs along the bottom edge of the bar.
- Second tab strip (y≈84–126): `Main` tab, the active tab (`Devices` in scene 04, `Marketplace` in scene 06) with an `×`, a `+`, then `TERMINAL` and `SPLIT` buttons at the right.
- Left icon rail (x≈45–108): portrait avatar at top, then roughly 20 icon buttons; in scene 06 the puzzle-piece Marketplace icon carries an orange badge `2`.
- Bottom live/status bar (y≈1054–1080), left to right: `STOP EVERYTHING` (`STOP` orange), `TERMINAL`, `SESSIONS`, `2 TURNS RUNNING`, `2 WAITING FOR YOU`, `CLAUDE A 17% · B 17%`, `VPS OK · SHARED BRAIN SYNCED · LENOVO AWAKE · CPU 13%`, and `Security advisory: GnuPG GPGME, update when convenient` at the far right.
- Watermark on the later frames: `PROTOTYPE DEMONSTRATION · NOT THE PRODUCT`.

## Scene 04 — DEVICES . FASTI (42–47 s)

Shot progression: 42 s establishes the Atrium with the callout; 43 s opens the `Devices` tab; 44–46 s hold the Devices page while the callout stays; 47 s is the same page with the prototype watermark before the cut.

Page heading and subtitle:

- `DEVICES | CASTERA` reads `DEVICES | CASTRA` in the frame (OCR: `D EV I CES I CASTRA`); `og.js:101` uses `Castra` as the Latin label.
- `Your devices and the VPS, paired once, encrypted, nothing in the open.`

Cards and controls, in visual order:

1. `Shared Brain` card with a green status tag that reads `[synced]` in the frame (OCR resolves `Shared Brain [synced]`). Beside it: `Engine online on VPS-NODE · The Brain is backed up there and shared with your devices. Last backup 14 min ago.` Then `Last backup 14 min ago · 2,418 notes · 31 MB`. Three buttons in one row: `BACK UP NOW`, `RESTORE FROM VPS`, `CHOOSE WHAT IS SHARED`.
2. `This device` section. Card: `Lenovo · this-device` with a `THIS DEVICE` tag. One row of three controls: a switch `VISIBLE TO NEW DEVICES`, a switch `LOOK FOR DEVICES`, and the static label `PAIRING CODE ON REQUEST`.
3. `PAIRED` section, three rows:
   - `VPS · vps-node` / `Connected through the tailnet` / status `ONLINE`.
   - `iPhone 15 Pro Max` / `Last connected 2 hours ago` / status `CONNECTED`.
   - `Old tablet` / `This device no longer holds the pairing. Enter the code it shows to pair again.` / button `PAIR`.
4. Cyan callout card at x≈1228–1600, y≈334–430: `> 04 / DEVICES . FASTI` then `A task starts on the phone and lands on the PC.` A cyan leader line points from the card to the paired-device list.

Recreation inputs: a VPS-backed Shared Brain card with backup/restore/share actions; a this-device card with two live switches and a pairing-code label; a paired list with two status tags and one re-pair action; the callout is a trailer annotation, not a product control.

## Scene 05 — MOBILE . VITA (48–54 s)

The whole UI is shown as a tall phone mockup centered around x≈710–1210. Top of the mockup: small portrait avatar, `VPS` chip with `+`, search icon, microphone button, and a Greek-key divider. The phone has no desktop top-right control cluster.

Shot progression and visible states:

- 48 s: `Start` / `INCIPIT` stepper view with `HOME`, `TALK`, `Chat`, `Crew / THE LAIR`, `Grill me / QUAESTIO`, `Social / AGORA`, `ALBUM`, `DREAM`, and a `3 TO LOOK AT` review list with `REVIEW` buttons.
- 49 s: Atrium hero `GOOD EVENING, OPERATOR`, left rail `AUDIENCE / THE LAIR / QUAESTIO / AGORA / ALBUM / DREAM`, operator feed with `Sessions/2026-11-20-device-sync` and a `REVIEW` button.
- 50 s: hero `Good evening, operator. The troop is listening.`; `BRAIN · OPERATOR FEED`, `WHAT NOW?`, `3 TO LOOK AT`, `PROPOSAL`, note `Sessions/2026-11-20-device-sync`.
- 51 s: tab strip `Main`, `Caesar` (active, with `×`), `+`, `TERMINAL`; scene banner; profile `Caesar` / `Commander · working` / `PROMO OPENING: TRACES AND FIRE`; message `The voice line and the roar are not recorded yet. I need your go-ahead to re-render the opening with the corrected portrait.`; approval card `NEEDS YOUR APPROVAL` / `Re-render the opening with the corrected portrait (square ornaments)?` with buttons `APPROVE` and `NOT NOW`.
- 52 s: same chat with the approval still pending; a small side note `Read promo-out/v6 · 4 files`.
- 53–54 s: approved state. The card becomes `APPROVED. THE RUN CONTINUES.`; earlier assistant text reads `I sent a correction: square ornaments, then a re-render.` with `Read promo-out/v6 · 4 files`; a `TASKS 3 / 5` disclosure appears; composer placeholder `Message Caesar, @crew or /command` with a send button.

Persistent phone chrome in every shot of the scene:

- Cyan callout at x≈249–777, y≈712–918: `> 05 / MOBILE . VITA`, `PWA now, native app later.`, `Approve from your phone.` Cyan leader line points into the artwork card (at 49–50 s) or the approval card (at 51 s).
- Live strip: small orange diamond, then `STOP EVERYTHING · TERMINAL · SESSIONS · 2`.
- Bottom navigation, four icon buttons: `HOME`, `APPS`, `SESSIONS`, `CHAT`; `CHAT` active in orange with an orange underline when the chat is shown, `HOME` active on the Atrium frames.

Recreation inputs: the phone Home/Atrium, a Caesar chat tab with an approval card whose two buttons change the card to an approved state, a `TASKS 3 / 5` disclosure, a composer with `@crew` and `/command` hints, and the four-button bottom bar.

## Scene 06 — MARKETPLACE . MERCATUS (55–68 s)

Shot progression:

- 55 s: desktop Atrium with the `> 06 / MARKETPLACE . MERCATUS` callout arriving; 56 s expands the System group in the left rail (`Integrations`, `Models`, `Engines`, `Gateway`, `Marketplace`, `Usage`, …).
- 57 s: the Marketplace page opens. Heading `ADD APPS` with Latin label `MERCATUS`; intro `CaesarOS starts bare. Add only what you use. Our own built-ins, Hermes plugins and connectors all grow it the same way. Nothing is installed without your yes.`
- 58 s: counter `12 OF 25 OPTIONAL APPS ADDED` and button `SHOW A FRESH INSTALL`; the Setup card and grouped app cards appear.
- 59–62 s: setup steps are ticked and app cards are toggled; the counter changes. Categories visible: `TALK` (Grill me, Social), `DAY` (Mail, Schedule, Goals), `KNOWLEDGE` (Folders, Reading, Library).
- 63 s: counter `11 OF 25 OPTIONAL APPS ADDED` after the toggles.
- 64–68 s: the `Hermes plugins` source view with the `Community` banner and five plugin cards.

Exact elements:

- Segment tabs (defined by the prototype source, shown across the frames): `Apps`, `Caesar built-ins`, `Hermes plugins`, `Connectors`.
- Setup card: `Setup`, progress `n of 6 done`, a progress bar, and six rows: `Choose where it runs` / `Local, VPS or Offline`; `Set up your models` / `Configure it for me`; `Start the Brain` / `Notes, memory, recall`; `Connect a tool` / `Mail, Notion, GitHub or your own`; `Add apps you need` / `Only what you use`; `Pair a device` / `Phone, laptop, the VPS`. Each unfinished row has a `DO IT` button; finished rows show `DONE`.
- Optional app cards with descriptions and a `NOT ADDED` / `ADDED` tag plus `ADD` or `REMOVE` button:
  - TALK: `Grill me` — `Interview that sharpens a plan`; `Social` — `Posts and replies, drafted for you`.
  - DAY: `Mail` — `Inbox with drafts you approve`; `Schedule` — `Calendar and reminders`; `Goals` — `What you want this quarter`.
  - KNOWLEDGE: `Folders` — `Your files, organised`; `Reading` — `A reading queue`; `Library` — `Books and papers`.
- Community banner: `Community — Plugins and skills from the Hermes catalog. Each one is scanned first and shown with its findings. Installing needs your yes.`
- Five plugin cards, each with a scan tag, description, `HERMES PLUGIN` tag and `REVIEW AND ADD` button:
  - `Foreman` — `Scan: Clean` — `Checks test evidence before Git actions.`
  - `Preflight` — `Scan: Clean` — `Runs every command in a throwaway copy first.`
  - `Plan Mode` — `Scan: Needs review` — `Gates edits until you approve.`
  - `Memory Wiki` — `Scan: Clean` — `Turns chat history into browsable pages.`
  - `Fish Audio` — `Scan: Clean` — `Voice that talks back.`
- Cyan callout card at x≈1180–1700, y≈300–470: `> 06 / MARKETPLACE · MERCATUS`, then `Hermes skills and plugins, scanned first, installed on your yes` followed by a solid cyan block cursor. Cyan leader line ends in a diamond to the right.
- A small floating control near the bottom center has a globe button and a four-corner expand button.

## Legibility limits

- The paired VPS name appears as `vps-node` in the video and in the prototype source; likewise the this-device label reads `this-device` in both. The report transcribes the video.
- The Shared Brain status tag is small; OCR resolves it as `[synced]`, not 100% visually certain.
- The `Plan Mode` scan tag reads `Scan: Needs review`; OCR alone rendered the middle word approximately as `NEEDS REVIEW`, confirmed by the prototype source.
- Individual rail icon glyphs are not named here because they are unlabelled icons; their count and position are described.
- Frames 42–68 only. Frames 69 s onward (scene 07 and close) were captured during exploration but deleted from the deliverable directory to keep this audit to the requested scenes.
