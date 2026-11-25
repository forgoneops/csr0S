// The live bar along the bottom (the trailer's ticker): Stop everything, Terminal, Sessions and a few live words.
// Every control is a button of at least 44 px. On a phone it appears only while something is running, so the
// screen stays calm and the stop button is still one tap away.
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useTerminalPane } from "../terminal/state";
import { Icon } from "../ui/Icon";

type Live = { running: number; pending: number; answering: number };

export function Ticker() {
  const { t, go } = useStore();
  const term = useTerminalPane();
  const [live, setLive] = useState<Live>({ running: 0, pending: 0, answering: 0 });
  const [stopped, setStopped] = useState<number | null>(null);

  useEffect(() => {
    let on = true;
    const tick = async () => {
      try {
        const [r, a, e] = await Promise.all([
          fetch("/api/running").then((x) => x.json() as Promise<{ count: number }>),
          fetch("/api/approvals").then((x) => x.json() as Promise<{ pending: unknown[] }>),
          fetch("/api/engines").then((x) => x.json() as Promise<{ engines: { health: { ok: boolean } }[] }>),
        ]);
        if (on) setLive({ running: r.count, pending: a.pending.length, answering: e.engines.filter((x) => x.health.ok).length });
      } catch { /* the bar keeps its last words */ }
    };
    void tick(); const id = setInterval(tick, 3000);
    return () => { on = false; clearInterval(id); };
  }, []);

  const stop = async () => { const r = await fetch("/api/running/stop", { method: "POST" }); if (r.ok) setStopped(((await r.json()) as { stopped: number }).stopped); setLive((l) => ({ ...l, running: 0 })); setTimeout(() => setStopped(null), 4000); };

  return (
    <div className="ticker" data-running={live.running > 0 ? "yes" : "no"} role="toolbar" aria-label={t("ticker.label")}>
      <button className="ticker-btn ticker-stop" disabled={live.running === 0} onClick={() => void stop()}>
        <Icon role="pause" size={14} /> {t("ticker.stop")}{live.running > 0 ? ` · ${live.running}` : ""}
      </button>
      <button className="ticker-btn ticker-hide-phone" onClick={() => term.toggle("person")}><Icon role="terminal" size={14} /> {t("ticker.terminal")}</button>
      <button className="ticker-btn ticker-hide-phone" onClick={() => go("/chat")}><Icon role="chat" size={14} /> {t("ticker.sessions")}</button>
      <span className="ticker-words mono small ticker-hide-phone" role="status">
        {stopped !== null ? t("ticker.stopped", { n: stopped }) : t("ticker.words", { engines: live.answering, pending: live.pending })}
      </span>
    </div>
  );
}
