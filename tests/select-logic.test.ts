import { describe, expect, test } from "bun:test";
import { moveIndex, onKey, typeahead } from "../web/src/ui/select-logic";

const opts = ["Alpha", "Beta", "Bravo", "Charlie", "alpine"].map((label) => ({ id: label, label }));

describe("moveIndex", () => {
  test("stays inside the list, never wraps, and is -1 for an empty list", () => {
    expect(moveIndex(0, -1, 3)).toBe(0);
    expect(moveIndex(2, 1, 3)).toBe(2);
    expect(moveIndex(1, 1, 3)).toBe(2);
    expect(moveIndex(0, 1, 0)).toBe(-1);
  });
});

describe("typeahead", () => {
  test("a letter goes to the next option that starts with it, case-insensitively, wrapping around", () => {
    expect(typeahead(opts, 0, "b")).toBe(1);
    expect(typeahead(opts, 1, "b")).toBe(2);               // same letter again: the next one
    expect(typeahead(opts, 2, "b")).toBe(1);               // and around to the first
    expect(typeahead(opts, 3, "a")).toBe(4);               // lowercase "alpine" counts
    expect(typeahead(opts, 4, "a")).toBe(0);
  });
  test("a longer string narrows; no match and empty input keep the current option", () => {
    expect(typeahead(opts, 0, "br")).toBe(2);
    expect(typeahead(opts, 0, "zz")).toBe(0);
    expect(typeahead(opts, 3, "")).toBe(3);
    expect(typeahead([], 0, "a")).toBe(0);
  });
});

describe("onKey", () => {
  test("closed: arrows and Enter or Space open it; Escape, Home and Tab are not ours", () => {
    for (const k of ["ArrowDown", "ArrowUp", "Enter", " "]) expect(onKey(k, false, 0, 3)).toEqual({ open: true, preventDefault: true });
    for (const k of ["Escape", "Home", "End", "Tab", "a"]) expect(onKey(k, false, 0, 3)).toBeNull();
  });
  test("open: arrows move, Home and End jump, Enter and Space commit and close, Escape closes, Tab commits without trapping focus", () => {
    expect(onKey("ArrowDown", true, 0, 3)).toEqual({ active: 1, preventDefault: true });
    expect(onKey("ArrowUp", true, 0, 3)).toEqual({ active: 0, preventDefault: true });
    expect(onKey("Home", true, 2, 3)).toEqual({ active: 0, preventDefault: true });
    expect(onKey("End", true, 0, 3)).toEqual({ active: 2, preventDefault: true });
    expect(onKey("Enter", true, 1, 3)).toEqual({ commit: true, open: false, preventDefault: true });
    expect(onKey(" ", true, 1, 3)).toEqual({ commit: true, open: false, preventDefault: true });
    expect(onKey("Escape", true, 1, 3)).toEqual({ open: false, preventDefault: true });
    expect(onKey("Tab", true, 1, 3)).toEqual({ commit: true, open: false, preventDefault: false });
  });
});
