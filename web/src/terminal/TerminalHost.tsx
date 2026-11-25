// The one terminal host (S4). It is mounted once in the shell and stays mounted: hiding the pane only
// hides it, so the xterm buffer and the shell keep their state. Its placement (bottom, right, tab)
// comes from the shared machine; this file never decides to open itself.
//
// Rendering is xterm.js (MIT): a real terminal emulator for the shell's ANSI output, with selection,
// copy and paste, and a fit addon that turns the pane's box into columns and rows. The PTY side is
// `core/terminal.ts`; this file only speaks its small protocol.
import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";
import { useTerminalPane } from "./state";
import { PLACEMENTS } from "./machine";

type StatusKind = "idle" | "connecting" | "live" | "reconnecting" | "ended" | "error";
type Status = { kind: StatusKind; note?: string };

const css = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** The terminal palette is the theme's: no colour is written here that the theme does not own. */
function themeFromDocument(): ITheme {
  return {
    background: css("--surface", "#121110"),
    foreground: css("--ink", "#F4EFE8"),
    cursor: css("--accent", "#FF6A2B"),
    cursorAccent: css("--surface", "#121110"),
    selectionBackground: css("--a30", "rgba(255,106,43,.30)"),
    black: css("--bg-deep", "#050505"),
    red: css("--danger", "#FF5468"),
    green: css("--ok", "#43E0A0"),
    yellow: css("--warn", "#FFC24B"),
    blue: css("--signal", "#37DFF5"),
    magenta: css("--accent-hi", "#FF8B52"),
    cyan: css("--signal", "#37DFF5"),
    white: css("--ink", "#F4EFE8"),
    brightBlack: css("--ink-3", "#8A8279"),
    brightRed: css("--danger", "#FF5468"),
    brightGreen: css("--ok", "#43E0A0"),
    brightYellow: css("--warn", "#FFC24B"),
    brightBlue: css("--signal", "#37DFF5"),
    brightMagenta: css("--accent-hi", "#FF8B52"),
    brightCyan: css("--signal", "#37DFF5"),
    brightWhite: css("--ink", "#F4EFE8"),
  };
}

export function TerminalHost() {
  const { t, settings } = useStore();
  const { state, hide, place } = useTerminalPane();
  const [everOpen, setEverOpen] = useState(state.open);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [notice, setNotice] = useState("");

  const boxRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<string | null>(null);
  const openingRef = useRef(false);
  const attemptsRef = useRef(0);
  const openRef = useRef(state.open);
  openRef.current = state.open;

  useEffect(() => { if (state.open) setEverOpen(true); }, [state.open]);
  // The bottom pane overlays the page, so pages that fill the window (chat) read its height from here and stop above it.
  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty("--term-bottom", state.open && state.placement === "bottom" ? "min(42dvh, 340px)" : "0px");
    // The right pane sits beside the page, not on it: the page keeps this much room free, so chat and terminal read as one shell.
    style.setProperty("--term-right", state.open && state.placement === "right" ? "min(460px, 44vw)" : "0px");
    return () => { style.setProperty("--term-bottom", "0px"); style.setProperty("--term-right", "0px"); };
  }, [state.open, state.placement]);

  const fitAndReport = useCallback(() => {
    const term = termRef.current, fit = fitRef.current;
    if (!term || !fit) return;
    try { fit.fit(); } catch { return; } // a hidden or zero-size box: nothing to fit yet
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "resize", cols: term.cols, rows: term.rows }));
  }, []);

  const send = useCallback((data: string) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "in", d: data }));
  }, []);

  const connect = useCallback((id: string) => {
    socketRef.current?.close(4000, "new connection");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/terminal/ws?id=${encodeURIComponent(id)}`);
    ws.binaryType = "arraybuffer";
    socketRef.current = ws;
    setStatus({ kind: attemptsRef.current ? "reconnecting" : "connecting" });

    ws.onopen = () => {
      attemptsRef.current = 0;
      setStatus({ kind: "live" });
      fitAndReport();
      termRef.current?.focus();
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data) as { t: string; reason?: string; id?: string };
          if (msg.t === "ready") fitAndReport();
          if (msg.t === "exit") { sessionRef.current = null; setStatus({ kind: "ended", note: msg.reason }); }
        } catch { /* a frame we do not know: ignore it, never guess */ }
        return;
      }
      termRef.current?.write(new Uint8Array(event.data as ArrayBuffer));
    };
    ws.onerror = () => { if (socketRef.current === ws) setStatus({ kind: "error", note: t("terminal.error.network") }); };
    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      socketRef.current = null;
      const id = sessionRef.current;
      if (!id) return;
      // The shell outlives a dropped socket: the server keeps it and replays a bounded backlog.
      if (attemptsRef.current >= 3) { setStatus({ kind: "error", note: t("terminal.error.dropped") }); return; }
      attemptsRef.current += 1;
      setStatus({ kind: "reconnecting" });
      setTimeout(() => { if (sessionRef.current === id && !socketRef.current) connect(id); }, 800 * attemptsRef.current);
    };
  }, [fitAndReport, t]);

  const openSession = useCallback(async () => {
    if (sessionRef.current) { connect(sessionRef.current); return; }
    if (openingRef.current) return; // two renders must never make two shells
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;
    openingRef.current = true;
    setStatus({ kind: "connecting" });
    const term = termRef.current;
    let response: Response;
    try {
      response = await fetch("/api/terminal/sessions", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ cols: term?.cols ?? 80, rows: term?.rows ?? 24 }),
      });
    } catch { openingRef.current = false; setStatus({ kind: "error", note: t("terminal.error.network") }); return; }
    openingRef.current = false;
    const body = await response.json().catch(() => ({})) as { id?: string; error?: string };
    if (!response.ok || !body.id) { setStatus({ kind: "error", note: body.error ?? t("terminal.error.refused") }); return; }
    sessionRef.current = body.id;
    attemptsRef.current = 0;
    connect(body.id);
  }, [connect, t]);

  const endSession = useCallback(async () => {
    const id = sessionRef.current;
    sessionRef.current = null;
    openingRef.current = false;
    socketRef.current?.close(1000, "ended by the operator");
    socketRef.current = null;
    if (id) await fetch(`/api/terminal/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    termRef.current?.reset();
    setStatus({ kind: "idle" });
    hide();
  }, [hide]);

  // One xterm instance for the life of the shell. It is never recreated on a placement change.
  useEffect(() => {
    if (!everOpen || !boxRef.current || termRef.current) return;
    const term = new XTerm({
      fontFamily: `${css("--f-mono", "monospace")}, monospace`,
      fontSize: Math.round(13 * settings.textScale),
      lineHeight: 1.2,
      cursorBlink: settings.motion !== "off",
      scrollback: 2000,
      theme: themeFromDocument(),
      allowTransparency: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(boxRef.current);
    termRef.current = term;
    fitRef.current = fit;
    const typed = term.onData((data) => send(data));
    return () => { typed.dispose(); term.dispose(); termRef.current = null; fitRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one instance only; motion is updated below
  }, [everOpen, send]);

  // A theme swap repaints the terminal too: colours come from the active theme pack, never from here.
  useEffect(() => {
    const observer = new MutationObserver(() => { if (termRef.current) termRef.current.options.theme = themeFromDocument(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (termRef.current) termRef.current.options.cursorBlink = settings.motion !== "off"; }, [settings.motion]);
  // The Text size setting reaches the terminal too (M-03): xterm takes a pixel size, so it follows the scale, then refits.
  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.fontSize = Math.round(13 * settings.textScale);
    fitAndReport();
  }, [settings.textScale, fitAndReport]);

  // Open a session when the person shows the pane; fit it whenever its box changes.
  useEffect(() => { if (state.open) void openSession(); }, [state.open, openSession]);
  useEffect(() => {
    if (!everOpen) return;
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => { if (openRef.current) fitAndReport(); });
    observer.observe(box);
    if (state.open) requestAnimationFrame(fitAndReport);
    return () => observer.disconnect();
  }, [everOpen, state.open, fitAndReport]);

  const copy = useCallback(async () => {
    const text = termRef.current?.getSelection() ?? "";
    if (!text) { setNotice(t("terminal.copy.empty")); return; }
    try { await navigator.clipboard.writeText(text); setNotice(t("terminal.copied")); }
    catch { setNotice(t("terminal.clipboard.blocked")); }
  }, [t]);

  const paste = useCallback(async () => {
    try { const text = await navigator.clipboard.readText(); if (text) send(text); setNotice(""); }
    catch { setNotice(t("terminal.clipboard.blocked")); }
  }, [send, t]);

  if (!everOpen) return null;

  const stateWord = status.kind === "live" ? t("terminal.state.live")
    : status.kind === "connecting" ? t("terminal.state.connecting")
    : status.kind === "reconnecting" ? t("terminal.state.reconnecting")
    : status.kind === "ended" ? t("terminal.state.ended")
    : status.kind === "error" ? t("terminal.state.error")
    : t("terminal.state.idle");
  const note = status.note ?? notice;

  return (
    <section
      className={`term-host place-${state.placement} ${state.open ? "open" : "hidden"}`}
      aria-label={t("terminal.title")}
      aria-hidden={!state.open}
    >
      <header className="term-head">
        <span className="term-title"><Icon role="terminal" size={16} /><span className="mono">{t("terminal.title")}</span></span>
        <span className={`term-dot ${status.kind}`} aria-hidden="true" />
        <span className="term-state mono" role="status">{stateWord}</span>
        <span className="term-note mono" aria-live="polite">{note}</span>
        <div className="term-actions">
          <div className="seg term-seg" role="tablist" aria-label={t("terminal.placement")}>
            {PLACEMENTS.map((p) => (
              <button key={p} role="tab" className="seg-btn" aria-selected={state.placement === p} onClick={() => place(p)}>
                {t(`terminal.place.${p}`)}
              </button>
            ))}
          </div>
          <button className="term-btn" onClick={() => void copy()}>{t("terminal.copy")}</button>
          <button className="term-btn" onClick={() => void paste()}>{t("terminal.paste")}</button>
          <button className="term-btn" onClick={() => void endSession()}>{t("terminal.end")}</button>
          <button className="icon-btn term-hide" onClick={() => hide()} aria-label={t("terminal.hide")} title={t("terminal.hide.help")}>
            <Icon role="close" size={18} />
          </button>
        </div>
      </header>
      {status.kind === "error" && <p className="term-error" role="alert">{status.note}</p>}
      <div className="term-body" ref={boxRef} />
      <p className="term-hint mono">{t("terminal.hint")}</p>
    </section>
  );
}
