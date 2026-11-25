// Where the terminal sits (S4): one terminal, three placements, kept alive when hidden.
// This is the whole placement model as pure data, so the test drives the same reducer the shell uses.
//
// The zone rule: a placement is changed and opened by the person. Anything that is not the person
// ("tool", a module, an automation) may never open the pane by itself; its request is dropped.
export type Placement = "bottom" | "right" | "tab";
export type Origin = "person" | "tool";

export type TerminalState = { open: boolean; placement: Placement };

export type TerminalAction =
  | { type: "show"; from?: Origin }
  | { type: "hide"; from?: Origin }
  | { type: "toggle"; from?: Origin }
  | { type: "place"; placement: Placement; from?: Origin }
  | { type: "next-placement"; from?: Origin };

export const PLACEMENTS: readonly Placement[] = ["bottom", "right", "tab"] as const;

export const INITIAL: TerminalState = { open: false, placement: "bottom" };

export const isPlacement = (value: unknown): value is Placement => value === "bottom" || value === "right" || value === "tab";

const byPerson = (from: Origin | undefined) => (from ?? "person") === "person";

export function reduce(state: TerminalState, action: TerminalAction): TerminalState {
  if (!byPerson(action.from)) return state; // a tool can never bring the pane up, move it or take it away
  switch (action.type) {
    case "show": return state.open ? state : { ...state, open: true };
    case "hide": return state.open ? { ...state, open: false } : state;
    case "toggle": return { ...state, open: !state.open };
    case "place": return { open: true, placement: action.placement };
    case "next-placement": {
      const i = PLACEMENTS.indexOf(state.placement);
      return { open: true, placement: PLACEMENTS[(i + 1) % PLACEMENTS.length] };
    }
    default: return state;
  }
}

/** Phones have one column: "right" becomes the bottom drawer. The pane stays the same host, so the
 *  shell and its scrollback survive the change; only its geometry moves. "tab" stays full height. */
export function fitPlacement(state: TerminalState, phone: boolean): TerminalState {
  if (phone && state.placement === "right") return { ...state, placement: "bottom" };
  return state;
}

/** The class the one host carries; CSS turns it into a bottom pane, a side dock or a full tab. */
export function placementClass(state: TerminalState): string {
  return `term-host place-${state.placement}${state.open ? " open" : " hidden"}`;
}
