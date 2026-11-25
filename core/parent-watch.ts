// When a native shell starts the core for you, the core must not outlive it: a shell that is killed (logout,
// SIGTERM, a crash) cannot run its own cleanup. The shell passes its pid in CAESAROS_PARENT_PID and the core
// exits once that process is gone. Without the variable nothing is watched (a core started by hand runs on).
export function parentGone(pid: number): boolean {
  try { process.kill(pid, 0); return false; } catch (e) { return (e as NodeJS.ErrnoException).code === "ESRCH"; }   // EPERM means it exists
}

export function watchParent(opts: { pid: string | undefined; onGone: () => void; intervalMs?: number; gone?: (pid: number) => boolean }): ReturnType<typeof setInterval> | null {
  const pid = Number(opts.pid);
  if (!opts.pid || !Number.isInteger(pid) || pid <= 1) return null;
  const gone = opts.gone ?? parentGone;
  const timer = setInterval(() => { if (gone(pid)) { clearInterval(timer); opts.onGone(); } }, opts.intervalMs ?? 2000);
  timer.unref?.();
  return timer;
}
