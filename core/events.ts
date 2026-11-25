// One server-sent event stream for the whole app. Modules publish; the UI and other modules listen.
type Client = (chunk: string) => void;
type Listener = (type: string, data: unknown) => void;
const clients = new Set<Client>();
const listeners = new Set<Listener>();

export function publish(type: string, data: unknown) {
  const chunk = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const send of clients) send(chunk);
  for (const l of listeners) { try { l(type, data); } catch { /* one listener never breaks the others */ } }
}

// Server-side listeners (a module hearing its own events). Returns an unsubscribe.
export function listen(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); }

export function stream(): Response {
  let send: Client;
  let ping: Timer;
  const body = new ReadableStream<string>({
    start(controller) {
      send = (chunk) => controller.enqueue(chunk);
      clients.add(send);
      send(`event: hello\ndata: {}\n\n`);
      ping = setInterval(() => send(`: ping\n\n`), 25_000);
    },
    cancel() { clients.delete(send); clearInterval(ping); },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
