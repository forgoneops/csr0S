import { expect, test } from "bun:test";
import { addItem, isList, listItems, removeItem, setDone, type Item } from "../core/lists";

test("only the named lists exist", () => { expect(isList("goals")).toBe(true); expect(isList("secrets")).toBe(false); });
test("an item is added, checked off (and sinks below open ones), and removed", () => {
  const a = addItem("goals", "  Ship the app  ") as Item, b = addItem("goals", "Test on a phone") as Item;
  expect(a.text).toBe("Ship the app");
  expect(setDone(a.id, true)).toBe(true);
  const names = listItems("goals").filter((x) => x.id === a.id || x.id === b.id).map((x) => x.text);
  expect(names).toEqual(["Test on a phone", "Ship the app"]);
  expect(removeItem(a.id) && removeItem(b.id)).toBe(true); expect(removeItem(a.id)).toBe(false);
});
test("an empty item is refused and lists are separate", () => {
  expect(addItem("ideas", "   ")).toEqual({ error: "text" });
  const i = addItem("ideas", "An idea") as Item;
  expect(listItems("goals").some((x) => x.id === i.id)).toBe(false); removeItem(i.id);
});
