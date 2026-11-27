import { describe, expect, test } from "bun:test";
import { carryOver, make, periodOf, stateOf, streak } from "../core/modules/goals/model";

describe("Goals planning periods", () => {
  test("groups dates into Monday-based week, calendar month and quarter", () => {
    expect(periodOf("week", "2026-11-26")).toEqual({start:"2026-11-23",end:"2026-11-29"});
    expect(periodOf("month", "2026-11-26")).toEqual({start:"2026-11-01",end:"2026-11-30"});
    expect(periodOf("quarter", "2026-11-26")).toEqual({start:"2026-10-01",end:"2026-12-31"});
  });
  test("trims titles and rejects empty outcomes", () => {
    expect(make("day", "  Ship the release  ", "2026-11-26", "g1").title).toBe("Ship the release");
    expect(() => make("day", "  ", "2026-11-26", "g2")).toThrow("A goal needs a title.");
  });
  test("carries past active goals once and keeps their source unchanged", () => {
    const old = make("week", "Finish the draft", "2026-11-09", "old");
    const carried = carryOver([old], "2026-11-26", () => "new");
    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({id:"new", renewedFrom:"old", start:"2026-11-23", end:"2026-11-29", status:"active"});
    expect(carryOver([old, ...carried], "2026-11-26", () => "again")).toHaveLength(0);
    expect(stateOf(old,"2026-11-26")).toBe("past");
  });
  test("counts only consecutive completed periods with at least one goal", () => {
    const a = {...make("day", "a", "2026-11-25", "a"), status:"done" as const};
    const b = {...make("day", "b", "2026-11-26", "b"), status:"done" as const};
    expect(streak([a,b],"day","2026-11-26")).toBe(2);
    expect(streak([a],"day","2026-11-26")).toBe(1);
  });
});
