import { closeSync, constants, fstatSync, openSync, readSync, realpathSync, lstatSync } from "node:fs";
import { sep } from "node:path";
import type { Stats } from "node:fs";

const inside = (path: string, root: string) => path === root || path.startsWith(root + sep);

/** Read one regular file without following its final symlink, and verify the opened inode stayed stable. */
export function readRegularFileNoFollow(path: string, expected: Stats, root: string, maxBytes: number): Buffer {
  const noFollow = constants.O_NOFOLLOW;
  if (!noFollow || process.platform !== "linux") throw new Error("secure no-follow reads are unavailable");
  const fd = openSync(path, constants.O_RDONLY | noFollow);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.dev !== expected.dev || before.ino !== expected.ino || before.size !== expected.size || before.mode !== expected.mode)
      throw new Error("file changed before it could be scanned");
    // Resolve the actual opened object, not the pathname: parent components may have changed after lstat.
    const openedPath = realpathSync(`/proc/self/fd/${fd}`);
    if (!inside(openedPath, root)) throw new Error("opened file escaped scan root");
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - total + 1));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      total += count;
      if (total > maxBytes) throw new Error("file grew beyond scan limit");
      chunks.push(chunk.subarray(0, count));
    }
    const bytes = Buffer.concat(chunks, total);
    const after = fstatSync(fd);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.mode !== before.mode || bytes.length !== after.size)
      throw new Error("file changed during scan");
    const named = lstatSync(path);
    if (named.isSymbolicLink() || named.dev !== after.dev || named.ino !== after.ino)
      throw new Error("file path changed during scan");
    return bytes;
  } finally {
    closeSync(fd);
  }
}
