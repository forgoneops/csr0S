import { describe, expect, test } from "bun:test";
import ideas from "../core/modules/ideas/server";
import type { PluginContext } from "../core/plugins";

type Handler = (context: any) => unknown | Promise<unknown>;
function setup() {
  const records = new Map<string, unknown>();
  const handlers: { method: string; pattern: string; handler: Handler }[] = [];
  const routes = Object.fromEntries(['get', 'post'].map((method) => [method, (pattern: string, handler: Handler) => handlers.push({ method: method.toUpperCase(), pattern, handler })]));
  const store = { get<T>(key: string, fallback: T): T { return (records.has(key) ? records.get(key) : fallback) as T; }, set(key: string, value: unknown) { records.set(key, value); }, delete(key: string) { records.delete(key); } };
  ideas({ routes, store } as unknown as PluginContext);
  return async (method: string, path: string, data?: unknown): Promise<Response> => {
    const actual = path.split('/').filter(Boolean);
    const match = handlers.map((route) => {
      const expected = route.pattern.split('/').filter(Boolean), params: Record<string, string> = {};
      if (route.method !== method || expected.length !== actual.length) return null;
      for (let i = 0; i < expected.length; i++) {
        if (expected[i].startsWith(':')) params[expected[i].slice(1)] = actual[i];
        else if (expected[i] !== actual[i]) return null;
      }
      return { route, params };
    }).find(Boolean);
    if (!match) return new Response('Not found', { status: 404 });
    const context = {
      req: { json: async () => data, param: (name: string) => match.params[name] },
      json: (body: unknown, status = 200) => Response.json(body, { status }),
      text: (body: string, status = 200, headers?: HeadersInit) => new Response(body, { status, headers }),
    };
    return (await match.route.handler(context)) as Response;
  };
}

describe("Ideas module", () => {
  test("captures ideas in Inbox and preserves them through moves", async () => {
    const request = setup();
    const added = await request('POST', '/ideas', { title: '  Write a plan  ', note: 'first draft' });
    expect(added.status).toBe(201);
    const { idea } = await added.json() as { idea: { id: string; title: string } };
    expect(idea.title).toBe('Write a plan');
    expect((await request('POST', `/ideas/${idea.id}/move`, { lane: 'parked', trigger: 'after review' })).status).toBe(200);
    const board = await (await request('GET', '/board')).json() as { lanes: Record<string, { id: string; trigger: string }[]> };
    expect(board.lanes.inbox).toHaveLength(0);
    expect(board.lanes.parked[0].trigger).toBe('after review');
  });

  test("enforces drop reason and Now capacity, and exports Markdown", async () => {
    const request = setup();
    const a = await (await request('POST', '/ideas', { title: 'one' })).json() as { idea: { id: string } };
    const b = await (await request('POST', '/ideas', { title: 'two' })).json() as { idea: { id: string } };
    expect((await request('POST', `/ideas/${a.idea.id}/move`, { lane: 'dropped' })).status).toBe(400);
    expect((await request('POST', `/ideas/${a.idea.id}/move`, { lane: 'now' })).status).toBe(200);
    expect((await request('POST', `/ideas/${b.idea.id}/move`, { lane: 'now' })).status).toBe(409);
    const markdown = await (await request('GET', '/export.md')).text();
    expect(markdown).toContain('## Now');
    expect(markdown).toContain('one');
  });
});
