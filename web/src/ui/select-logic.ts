// The keyboard rules of the Select, as pure functions so they can be tested without a browser.
export type Option = { id: string; label: string };

/** Move the active index by `delta`, staying inside the list (no wrap: the ends are the ends). */
export const moveIndex = (current: number, delta: number, length: number): number =>
  length === 0 ? -1 : Math.min(length - 1, Math.max(0, current + delta));

/** Type-ahead: the next option, after `current`, whose label starts with what was typed. The same letter pressed
 *  again cycles through the options that start with it; a longer string narrows to the first match. */
export function typeahead(options: Option[], current: number, typed: string): number {
  if (!typed || options.length === 0) return current;
  const q = typed.toLowerCase();
  const allSame = [...q].every((ch) => ch === q[0]);
  const needle = allSame ? q[0] : q;
  const order = [...options.keys()].map((i) => (current + 1 + i) % options.length);   // start after the active one, wrap
  const hit = order.find((i) => options[i].label.toLowerCase().startsWith(needle));
  return hit ?? current;
}

/** What a key does to the open/active state. `null` means the Select does not handle the key. */
export type KeyResult = { open?: boolean; active?: number; commit?: boolean; preventDefault: boolean };
export function onKey(key: string, open: boolean, active: number, length: number): KeyResult | null {
  switch (key) {
    case "ArrowDown": return open ? { active: moveIndex(active, 1, length), preventDefault: true } : { open: true, preventDefault: true };
    case "ArrowUp": return open ? { active: moveIndex(active, -1, length), preventDefault: true } : { open: true, preventDefault: true };
    case "Home": return open ? { active: length ? 0 : -1, preventDefault: true } : null;
    case "End": return open ? { active: length - 1, preventDefault: true } : null;
    case "Enter":
    case " ": return open ? { commit: true, open: false, preventDefault: true } : { open: true, preventDefault: true };
    case "Escape": return open ? { open: false, preventDefault: true } : null;
    case "Tab": return open ? { commit: true, open: false, preventDefault: false } : null;   // leave the field, keep the choice
    default: return null;
  }
}
