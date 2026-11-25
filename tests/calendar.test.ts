import { expect, test } from "bun:test";
import { addEvent, listEvents, removeEvent, validDate, type Event } from "../core/calendar";

test("dates are real calendar dates", () => {
  expect(validDate("2026-11-22")).toBe(true);
  expect(validDate("2026-02-30")).toBe(false); expect(validDate("2026-13-01")).toBe(false); expect(validDate("22-11-2026")).toBe(false);
});
test("an event is added, listed by range in time order, and removed", () => {
  const a = addEvent({ title: "Review", date: "2031-01-05", time: "15:00" }) as Event;
  const b = addEvent({ title: "Standup", date: "2031-01-05", time: "09:30" }) as Event;
  const c = addEvent({ title: "Later", date: "2031-02-01" }) as Event;
  expect(listEvents("2031-01-01", "2031-01-31").map((e) => e.title)).toEqual(["Standup", "Review"]);
  for (const e of [a, b, c]) expect(removeEvent(e.id)).toBe(true);
  expect(removeEvent(a.id)).toBe(false);
});
test("a title, a real date and a valid time are required", () => {
  expect(addEvent({ title: " ", date: "2031-01-05" })).toEqual({ error: "title" });
  expect(addEvent({ title: "x", date: "nope" })).toEqual({ error: "date" });
  expect(addEvent({ title: "x", date: "2031-01-05", time: "25:00" })).toEqual({ error: "time" });
});
