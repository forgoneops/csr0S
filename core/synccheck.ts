// The sync check: what an incoming text contains that deserves a person's look before it is created on this device.
export const CHECKS: [RegExp, string][] = [
  [/(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/, "looks like a key or secret"],
  [/(curl|wget)[^\n|]*\|\s*(ba)?sh|rm\s+-rf\s+[/~]|<script\b/i, "contains a command or script"],
  [/ignore (all |any )?(previous|prior) instructions|disregard (the )?(system|above)/i, "looks like a prompt injection"],
];
export const flagsOf = (text: unknown): string[] => (typeof text === "string" ? CHECKS.filter(([re]) => re.test(text)).map((c) => c[1]) : []);
/** A held note's preview for the list: key-like strings are replaced, so a secret never travels to the screen. */
export const maskKeys = (text: string): string => text.replace(new RegExp(CHECKS[0][0].source, "g"), "[hidden key]");
