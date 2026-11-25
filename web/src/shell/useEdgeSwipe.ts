// Phone gesture for app-level history (R2): a horizontal swipe that starts at the screen edge goes Back (from the left edge)
// or Forward (from the right edge). The same two buttons exist in the drawer, so nothing depends on the gesture.
import { useEffect } from "react";

export function useEdgeSwipe(nav: { canBack: boolean; canForward: boolean; back: () => void; forward: () => void }) {
  useEffect(() => {
    let start: { x: number; y: number; edge: "l" | "r" } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const w = innerWidth, edge = e.clientX < 24 ? "l" : e.clientX > w - 24 ? "r" : null;
      start = edge ? { x: e.clientX, y: e.clientY, edge } : null;
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = Math.abs(e.clientY - start.y);
      if (Math.abs(dx) > 80 && dy < 50) {
        if (start.edge === "l" && dx > 0 && nav.canBack) nav.back();
        if (start.edge === "r" && dx < 0 && nav.canForward) nav.forward();
      }
      start = null;
    };
    addEventListener("pointerdown", down); addEventListener("pointerup", up); addEventListener("pointercancel", () => { start = null; });
    return () => { removeEventListener("pointerdown", down); removeEventListener("pointerup", up); };
  }, [nav]);
}
