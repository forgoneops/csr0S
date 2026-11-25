---
name: caesar-two-instances
description: "Use when running, patching or releasing CaesarOS across the clean instance and the owner's connected instance, or when anything might leak personal data into the repo. Also: 'dwie instancje', 'czysta wersja', 'wyciek danych', 'patch both', 'leak check'."
---

# Two instances, one code base

- **Clean**: the product. No personal data, standard edition, no owner layer. `tools/run-instance.sh clean` (port 4480).
- **Mine**: the owner's. Same code, his data folder and his private owner layer. `tools/run-instance.sh mine` (port 4479; the owner layer is a separate private repo at `~/caesaros-owner` or `CAESAROS_OWNER_DIR`).
- **Data never lives in this repo.** The runner refuses a data folder inside the repo. `CAESAROS_MODULE_DIRS` may hold absolute paths, which is how the private owner layer is mounted.

## The rule that stops leaks
Run `bun tools/leak-check.ts` before every commit (`tools/install-hooks.sh` installs it as a pre-commit hook). It flags email addresses, home paths, tailnet and private addresses, secret-shaped strings, the owner's names, and forbidden paths (`data/`, `owner/`, `docs/reference/`, `docs/handoff/`, key and database files). Exit 1 means do not commit.

## Patch flow
1. Fix once, in the clean code, on a `shell/*` or `fix/*` branch.
2. Tests pass and the leak check exits 0.
3. Restart both instances; both pick the patch up because only the data differs.
4. Anything that is only the owner's (crew art, the Lair, private studios, his handles) goes in the owner layer repo, never here.

## Needs the owner's yes, every time
Creating the new private repo, pushing the clean tree, merging his data into his instance, restarting his running core (4410), any client update. Back up first; never force-push.
