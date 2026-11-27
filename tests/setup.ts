// Tests never see this machine's Hermes profiles: the crew engines would join the default engine list and every
// "fresh install" assertion would depend on who runs the suite. A test that wants a crew sets HERMES_HOME itself.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// One private temp root per run: every `mkdtempSync(join(tmpdir(), ...))` in a test lands inside it and the whole
// tree goes when the run ends (notes, detect, chat, terminal and the rest leaked ~0.5 GB of /tmp per run).
// A parallel run has its own root, so nothing of anyone else's is touched.
const runTmp = mkdtempSync(join(tmpdir(), "caesaros-run-"));
process.env.TMPDIR = runTmp;
process.on("exit", () => { try { rmSync(runTmp, { recursive: true, force: true }); } catch {} });
process.env.HERMES_HOME = process.env.HERMES_HOME_FOR_TESTS ?? mkdtempSync(join(tmpdir(), "caesaros-nohermes-"));
// A test that imports the core before choosing its own data folder would write into the repo's data/ and leak state
// into the next run. Every run gets a throwaway folder unless the test sets one first.
process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-test-data-"));
// Remove the two folders above when the run ends: they leaked thousands of dirs into /tmp, and the per-user tmpfs
// quota running out made later copy and build tests fail with EDQUOT.
const mine = [process.env.HERMES_HOME, process.env.CAESAROS_DATA].filter((d): d is string => !!d && /caesaros-(nohermes|test-data)-/.test(d));
process.on("exit", () => { for (const d of mine) try { rmSync(d, { recursive: true, force: true }); } catch {} });
