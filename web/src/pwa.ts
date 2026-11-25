// PWA glue: register the offline shell, and keep the browser's install prompt so Settings can offer it.
import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

/** Production only: in dev a cached shell would hide the changes you are making. */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => undefined); });
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPrompt; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

export const isStandalone = (): boolean =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

/** state: "ready" (prompt available), "installed" (already running as an app), "unavailable" (no prompt, say how). */
export function useInstall(): { state: "ready" | "installed" | "unavailable"; install: () => Promise<void> } {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const install = async () => {
    if (!deferred) return;
    const p = deferred; deferred = null; notify();
    await p.prompt(); await p.userChoice.catch(() => undefined);
  };
  return { state: isStandalone() ? "installed" : deferred ? "ready" : "unavailable", install };
}
