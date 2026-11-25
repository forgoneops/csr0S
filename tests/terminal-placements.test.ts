// S4 placement state machine: one terminal, three placements, kept alive when hidden, and the zone
// rule that a tool may never open the pane by itself. Pure functions, so this is the same reducer the
// shell runs.
import { describe, expect, test } from "bun:test";
import { INITIAL, PLACEMENTS, fitPlacement, placementClass, reduce, type TerminalState } from "../web/src/terminal/machine";

const open = (placement: TerminalState["placement"]): TerminalState => ({ open: true, placement });

describe("terminal placements", () => {
  test("it starts hidden, docked at the bottom", () => {
    expect(INITIAL).toEqual({ open: false, placement: "bottom" });
  });

  test("toggle opens and closes and remembers the last placement", () => {
    let s = reduce(INITIAL, { type: "toggle" });
    expect(s).toEqual({ open: true, placement: "bottom" });
    s = reduce(s, { type: "place", placement: "right" });
    expect(s).toEqual(open("right"));
    s = reduce(s, { type: "hide" });
    expect(s).toEqual({ open: false, placement: "right" });
    expect(reduce(s, { type: "show" })).toEqual(open("right"));
  });

  test("every placement is reachable from the pane header", () => {
    for (const p of PLACEMENTS) expect(reduce(INITIAL, { type: "place", placement: p })).toEqual(open(p));
  });

  test("next-placement walks bottom, right, tab and back", () => {
    let s = open("bottom");
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { s = reduce(s, { type: "next-placement" }); seen.push(s.placement); }
    expect(seen).toEqual(["right", "tab", "bottom", "right"]);
  });

  test("a tool never opens, moves, hides or toggles the pane", () => {
    const closed = INITIAL;
    for (const action of [
      { type: "show" as const, from: "tool" as const },
      { type: "toggle" as const, from: "tool" as const },
      { type: "place" as const, placement: "tab" as const, from: "tool" as const },
      { type: "next-placement" as const, from: "tool" as const },
    ]) expect(reduce(closed, action)).toBe(closed);
    const up = open("bottom");
    for (const action of [
      { type: "hide" as const, from: "tool" as const },
      { type: "place" as const, placement: "right" as const, from: "tool" as const },
    ]) expect(reduce(up, action)).toBe(up);
  });

  test("a phone turns the right side into the bottom drawer and leaves the rest alone", () => {
    expect(fitPlacement(open("right"), true)).toEqual(open("bottom"));
    expect(fitPlacement(open("bottom"), true)).toEqual(open("bottom"));
    expect(fitPlacement(open("tab"), true)).toEqual(open("tab"));
    expect(fitPlacement(open("right"), false)).toEqual(open("right"));
  });

  test("the one host carries a class per state, and hiding never closes it", () => {
    expect(placementClass(open("tab"))).toBe("term-host place-tab open");
    expect(placementClass({ open: false, placement: "right" })).toBe("term-host place-right hidden");
    expect(placementClass(reduce(open("bottom"), { type: "hide" }))).toContain("hidden");
  });
});
