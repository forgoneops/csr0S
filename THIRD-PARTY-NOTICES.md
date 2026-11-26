# Third-party notices

CaesarOS itself is MIT licensed (see [LICENSE](LICENSE)). This file lists everything third-party
that this repository ships or runs, with the licence read from the package manifests and licence
files in this tree. Where a licence or holder could not be verified from the files here, the entry
says **UNKNOWN** rather than a guess.

Generated from `package.json`, `node_modules/<pkg>/package.json` and `<pkg>/LICENSE*`, the pack
manifests under `packs/`, and the vendored files under `web/atrium/vendor/`.

## Runtime dependencies (JavaScript, installed by `bun install`)

| Package | Version | Licence | Copyright |
|---|---|---|---|
| [hono](https://github.com/honojs/hono) | 4.13.20 | MIT | Copyright (c) 2021 - present, Yusuke Wada and Hono contributors |
| [zod](https://github.com/colinhacks/zod) | 4.6.7 | MIT | Copyright (c) 2025 Colin McDonnell |
| [react](https://github.com/facebook/react) | 19.3.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [react-dom](https://github.com/facebook/react) | 19.3.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [scheduler](https://github.com/facebook/react/tree/main/packages/scheduler) (pulled in by `react-dom`) | 0.28.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [@xterm/xterm](https://github.com/xtermjs/xterm.js) | 6.0.0 | MIT | Copyright (c) 2017-2019, The xterm.js authors; Copyright (c) 2014-2016, SourceLair Private Company |
| [@xterm/addon-fit](https://github.com/xtermjs/xterm.js) | 0.11.0 | MIT | Copyright (c) 2019, The xterm.js authors |
| [imapflow](https://github.com/postalsys/imapflow) | 2.10.0 | MIT | Copyright (c) Postal Systems OÜ |
| [mailparser](https://github.com/nodemailer/mailparser) | 3.14.1 | MIT | Copyright (c) Andris Reinman |
| [nodemailer](https://github.com/nodemailer/nodemailer) | 10.3.1 | MIT-0 | Copyright (c) Andris Reinman |

The first seven declare MIT in their own `LICENSE` files in `node_modules`; `imapflow`, `mailparser` and `nodemailer` (the Mail page's wire libraries) are MIT, MIT and MIT-0. Their own dependencies are MIT, BSD-2-Clause, BSD-3-Clause or ISC (`@zone-eu/mailsplit` is "MIT OR EUPL-1.1+", used here under MIT). `hono` and `zod` have no
runtime dependencies of their own; `react-dom`'s only one is `scheduler`, listed above.

## Vendored files (`web/atrium/vendor/`)

These are unmodified, byte-identical copies of files shipped by the packages above, so the app can
load them without a bundler. Verified by SHA-256 against `node_modules`:

| File | Copied from | Licence |
|---|---|---|
| `web/atrium/vendor/xterm.js` | `@xterm/xterm@6.0.0/lib/xterm.js` | MIT (The xterm.js authors, SourceLair Private Company) |
| `web/atrium/vendor/xterm.css` | `@xterm/xterm@6.0.0/css/xterm.css` | MIT (same) |
| `web/atrium/vendor/addon-fit.js` | `@xterm/addon-fit@0.11.0/lib/addon-fit.js` | MIT (The xterm.js authors) |
| `web/atrium/vendor/three.min.js` | `three.js r128 build/three.min.js` | MIT (three.js authors; full notice in `web/atrium/vendor/THREE-LICENSE.txt`) |

SHA-256: `xterm.js` 14903579ff54664cd72f8e8699e6961a6272c21863ec1c3b118cdc8af5d4a972,
`xterm.css` 854a7c0fb70e8b1a083c16797ab827299fb18744f5ad34f227b48337e33293c6,
`addon-fit.js` ba3ea256ce0620a0992a197d6c9baea64823fc93d8da07a9e366ca9943c18527.

## Fonts (`packs/fonts/`)

| Pack | Fonts | Licence | Notes |
|---|---|---|---|
| `packs/fonts/ds0` | Cinzel, Alegreya Sans, Azeret Mono (WOFF2, latin and latin-ext subsets) | SIL Open Font License 1.1, per `packs/fonts/ds0/manifest.json` | Files fetched from Google Fonts (`fonts.google.com` per the manifest). Copyright: The Cinzel Project Authors; The Alegreya Sans Project Authors; The Azeret Project Authors. Upstream links and full licence texts are bundled in `web/atrium/fonts/CAESAR-LEGIO-{CINZEL,ALEGREYA-SANS,AZERET-MONO}-OFL.txt`. |
| `packs/fonts/plain` | Alegreya Sans, Azeret Mono (the same files as DS0 type, without Cinzel) | SIL Open Font License 1.1, per `packs/fonts/plain/manifest.json` | As above. Copyright: The Alegreya Sans Project Authors and The Azeret Project Authors. Their upstream links and full licence texts are bundled in `web/atrium/fonts/CAESAR-LEGIO-{ALEGREYA-SANS,AZERET-MONO}-OFL.txt`. |
| `packs/fonts/writer` | iA Writer Duospace | SIL Open Font License 1.1, per `packs/fonts/writer/OFL.txt` and the pack manifest | Copyright Information Architects Inc., with Reserved Font Name "iA Writer". Converted from TTF to WOFF2 with unchanged glyphs. |

## Icons and themes (`packs/icons/`, `packs/themes/`)

Project material, not third-party: `legio` and `legio-dot` declare "Own work, CaesarOS"; `ds0`,
`ds0-bold`, `ds0-light` and the theme packs `cinder`, `lumen`, `neo-roma` declare their own geometry
and tokens. They are covered by this project's MIT licence. No third-party font or icon set is
embedded in them per their manifests; nothing here was verified beyond those declarations.

## Bundled art (`web/atrium/art/`)

117 recursively served files (114 `.webp`, 3 `.svg`, 12,510,650 bytes): 29 WebP and 3 SVG files at
the art root, plus 85 WebP files in nested art folders. They include banners, scenes, the Caesar
portrait, crew portraits and tool marks.

**Provenance.** These images were generated for the project owner with an AI image tool (Codex, OpenAI
image generation), from the owner's own prompts and direction, and are not taken from any third party's
artwork. The owner releases them under this project's MIT licence together with the code. Two honest
notes: the copyright status of AI-generated images differs between jurisdictions (in some, purely
machine-generated images carry no copyright at all, in which case they are free to use anyway), and the
tool's own terms apply to the generated files. The prompts and generation dates are not stored in this
tree; the owner keeps the originals.

## Build-time dependencies (`devDependencies`, not shipped in the app)

| Package | Version | Licence |
|---|---|---|
| [vite](https://github.com/vitejs/vite) | 8.3.8 | MIT |
| [typescript](https://github.com/microsoft/TypeScript) | 7.0.2 | Apache-2.0 |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 6.3.0 | MIT |
| [@types/bun](https://github.com/DefinitelyTyped/DefinitelyTyped) | 1.4.5 | MIT |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.3.0 | MIT |
| [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.3.0 | MIT |

Their own transitive dependencies are installed for the build only and none of them is copied into
the shipped tree.

## Programs CaesarOS uses but does not ship

These are separate installations on your machine; each keeps its own licence:

- **Hermes Agent** — MIT, Nous Research (https://github.com/NousResearch/hermes-agent). The default
  crew reads its profiles; no Hermes code is bundled here.
- **Claude Code**, **Codex**, **Gemini CLI**, **Ollama** — used through their own command-line
  interfaces or local HTTP API when installed and signed in by the user. Their licences are their
  own and are not redistributed by this repository.

## Apache-2.0 note

TypeScript is Apache-2.0. It is a build tool only: nothing from it is included in the app or in the
built `web/dist`.
