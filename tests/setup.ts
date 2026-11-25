// Tests never see this machine's Hermes profiles: the crew engines would join the default engine list and every
// "fresh install" assertion would depend on who runs the suite. A test that wants a crew sets HERMES_HOME itself.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.HERMES_HOME = process.env.HERMES_HOME_FOR_TESTS ?? mkdtempSync(join(tmpdir(), "caesaros-nohermes-"));
// A test that imports the core before choosing its own data folder would write into the repo's data/ and leak state
// into the next run. Every run gets a throwaway folder unless the test sets one first.
process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-test-data-"));
