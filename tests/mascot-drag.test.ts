import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "..", "web", "atrium", "mascot.js"), "utf8");

class Node {
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  hidden = false;
  textContent = "";
  className = "";
  listeners = new Map<string, ((event: any) => void)[]>();
  children = new Map<string, Node>();
  attrs = new Map<string, string>();
  classList = { add: (_: string) => {}, remove: (_: string) => {} };
  offsetWidth = 132;
  offsetHeight = 132;
  constructor(public selector = "") {}
  get offsetLeft() { return Number.parseFloat(this.style.left || "0") || 0; }
  get offsetTop() { return Number.parseFloat(this.style.top || "0") || 0; }
  set innerHTML(_: string) {
    this.children.set(".mc-say", new Node(".mc-say"));
    this.children.set(".mc-btn", new Node(".mc-btn"));
    this.children.set(".mc-off", new Node(".mc-off"));
  }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  querySelector(selector: string) { return this.children.get(selector)!; }
  addEventListener(type: string, fn: (event: any) => void) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  dispatch(type: string, event: any = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
  appendChild(_: Node) {}
  remove() {}
}

function mascot() {
  const tasks: (() => void)[] = [];
  const windowListeners = new Map<string, ((event: any) => void)[]>();
  const host = new Node(".mc");
  const document = {
    body: { appendChild: (_: Node) => {} },
    documentElement: { lang: "en" },
    createElement: () => host,
    getElementById: (_: string) => null,
  };
  const window: any = {
    addEventListener(type: string, fn: (event: any) => void) { windowListeners.set(type, [...(windowListeners.get(type) || []), fn]); },
    removeEventListener(type: string, fn: (event: any) => void) { windowListeners.set(type, (windowListeners.get(type) || []).filter(x => x !== fn)); },
  };
  const storage = new Map<string, string>();
  let opens = 0;
  new Function("document", "window", "MutationObserver", "localStorage", "fetch", "setInterval", "setTimeout", "clearTimeout", "location", "innerWidth", "innerHeight", "pal", "Date", source)(
    document, window, function MutationObserver() {},
    { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    async (url: string) => ({ ok: true, json: async () => url.endsWith("/running") ? { count: 0 } : [] }),
    () => 0, (fn: () => void) => { tasks.push(fn); return tasks.length; }, () => {}, { search: "" }, 1000, 800,
    () => { opens++; }, Date,
  );
  tasks.shift()?.(); // run the scheduled show()
  const dispatchWindow = (type: string, event: any) => { for (const fn of windowListeners.get(type) || []) fn(event); };
  const pointer = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y, target: { closest: () => host.children.get(".mc-btn") }, preventDefault() {} });
  return { get button() { return host.children.get(".mc-btn")!; }, dispatchWindow, pointer, tasks, get opens() { return opens; }, storage };
}

describe("Chibi mascot gesture", () => {
  test("slow drag across several small pointer moves does not open the menu", () => {
    const m = mascot();
    m.button.dispatch("pointerdown", m.pointer(10, 10));
    m.dispatchWindow("pointermove", m.pointer(13, 10));
    m.dispatchWindow("pointermove", m.pointer(16, 10));
    m.dispatchWindow("pointermove", m.pointer(19, 10));
    m.dispatchWindow("pointerup", {});
    m.button.dispatch("click", { detail: 1 });
    expect(m.opens).toBe(0);
    expect(m.storage.get("caesaros-mascot-pos")).toBe(JSON.stringify({ x: 9, y: 4 }));
  });

  test("a tap and keyboard activation still open the menu", () => {
    const m = mascot();
    m.button.dispatch("pointerdown", m.pointer(10, 10));
    m.dispatchWindow("pointerup", {});
    m.button.dispatch("click", { detail: 1 });
    m.button.dispatch("click", { detail: 0 });
    expect(m.opens).toBe(2);
  });
});
