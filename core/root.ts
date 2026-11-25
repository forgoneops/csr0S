// Where the app's own files live (web, packs, locales, plugins). From source it is the repository; an installed app sets
// CAESAROS_ROOT to its resource folder, because a compiled core has no source tree to read from.
import { join } from "node:path";
export const ROOT = process.env.CAESAROS_ROOT ?? join(import.meta.dir, "..");
