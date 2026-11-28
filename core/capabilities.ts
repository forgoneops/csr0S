// Capabilities a module can provide to others. Only the Claude accounts one is ported so far (claude-bridge); the rest of the old registry comes with its modules.
export type ClaudeWindows = Record<string, { used: number; resetsAt: number | null; status?: string }>;
export type ClaudeAccountUse = { id: string; label: string; env: Record<string, string> };
export type ClaudeAccounts = {
  /** The account for the next turn, and why. */
  pick(): (ClaudeAccountUse & { reason: string; allLimited: boolean }) | null;
  /** What Claude Code reported for this account with a turn (its windows). */
  report(id: string, windows: ClaudeWindows): void;
  /** This account refused a turn at its limit; it reopens at `until` when known. */
  limited(id: string, until: number | null): void;
  /** Another account that is open right now, for a retry; null when there is none. */
  alternative(excludeId: string): ClaudeAccountUse | null;
};

type Registry = { claudeAccounts: ClaudeAccounts };
const providers: Partial<Registry> = {};
export function provide<K extends keyof Registry>(name: K, impl: Registry[K]): void { providers[name] = impl; }
export function capability<K extends keyof Registry>(name: K): Registry[K] | null { return providers[name] ?? null; }
export function unprovide(name: keyof Registry): void { delete providers[name]; }
