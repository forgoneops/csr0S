// Mounts the ambient background for the life of the app and restarts it when the pack or Motion changes.
import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { initBackground } from "./background";

export function Background() {
  const { settings } = useStore();
  const ref = useRef<HTMLCanvasElement | null>(null);
  const motion = settings.motion;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (motion === "off") return;                 // hidden by CSS, and no loop runs at all
    const stop = initBackground(canvas, { animate: () => document.documentElement.dataset.motion !== "off" });
    return stop;
  }, [motion, settings.theme]);

  return <canvas ref={ref} className="bg" aria-hidden="true" />;
}
