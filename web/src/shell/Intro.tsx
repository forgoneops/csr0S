// The opening: Caesar assembles out of glowing particles, then waits for a touch. Shown once per browser session,
// never when Motion is off, and any key, click or tap skips it. The picture comes from the theme (it styles
// .intro-art); a theme without art simply has no intro. Canvas 2D only, no extra dependency.
import { useEffect, useRef } from "react";
import { useStore } from "../store";

const GRID = 190, MAX = 22000;
const FREEZE = /[?&]introk=(\d(?:\.\d+)?)/.exec(location.search)?.[1]; // test seam: freeze the assembly at 0..1

export function Intro({ onDone }: { onDone: () => void }) {
  const { t } = useStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const art = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = canvas.current!, ctx = cv.getContext("2d")!;
    let raf = 0, dead = false;
    // The theme stylesheet may still be loading: wait up to two seconds for it to name the picture, then skip.
    const find = () => /url\(["']?(.+?)["']?\)/.exec(getComputedStyle(art.current!).backgroundImage)?.[1];
    let url = find(), waited = 0, poll: ReturnType<typeof setInterval> | null = null;
    if (!url) {
      poll = setInterval(() => { url = find(); waited += 100; if (url || waited >= 2000) { clearInterval(poll!); poll = null; if (url) start(url); else onDone(); } }, 100);
    }
    function start(src: string) {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
      if (dead) return;
      const off = document.createElement("canvas"); off.width = off.height = GRID;
      const o = off.getContext("2d", { willReadFrequently: true })!; o.drawImage(img, 0, 0, GRID, GRID);
      const px = o.getImageData(0, 0, GRID, GRID).data;
      const pts: { x: number; y: number; l: number; hot: boolean }[] = [];
      for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
        const i = (y * GRID + x) * 4, r = px[i]!, g = px[i + 1]!, b = px[i + 2]!, l = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
        const pink = r > 190 && b > 150 && g < 120;                 // the scar and the crystal always glow
        if (pink || Math.random() < Math.min(1, Math.max(0, (l - 0.07) * 2.6))) pts.push({ x: x / GRID, y: y / GRID, l: pink ? 1 : l, hot: pink });
      }
      while (pts.length > MAX) pts.splice((Math.random() * pts.length) | 0, 1);
      const W = () => (cv.width = innerWidth * devicePixelRatio), H = () => (cv.height = innerHeight * devicePixelRatio);
      W(); H();
      const seeds = pts.map(() => ({ a: Math.random() * 6.283, d: 0.4 + Math.random() * 1.1, s: Math.random() }));
      const t0 = performance.now();
      const frame = (now: number) => {
        const k = FREEZE !== undefined ? Number(FREEZE) : Math.min(1, (now - t0) / 3200), e = 1 - Math.pow(1 - k, 3);
        const w = cv.width, h = cv.height, size = Math.min(w, h) * 0.78, ox = (w - size) / 2, oy = (h - size) / 2;
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "lighter";
        pts.forEach((p, i) => {
          const s = seeds[i]!, tx = ox + p.x * size, ty = oy + p.y * size;
          const fx = w / 2 + Math.cos(s.a) * s.d * w * 0.5, fy = h / 2 + Math.sin(s.a) * s.d * h * 0.5;
          const sh = k >= 1 ? Math.sin(now / 900 + s.s * 20) * 0.9 : 0;
          const x = fx + (tx - fx) * e + sh, y = fy + (ty - fy) * e + sh;
          const a = Math.min(1, (0.4 + p.l * 0.9) * (0.35 + 0.65 * e));
          ctx.fillStyle = p.hot ? `rgba(255,240,255,${a})` : `rgba(${150 + 90 * p.l | 0},${60 + 110 * p.l * p.l | 0},${230},${a})`;
          const r = (p.hot ? 2.6 : 1.7) * devicePixelRatio; ctx.fillRect(x, y, r, r);
          if (p.hot || p.l > 0.55) { ctx.fillStyle = `rgba(190,90,255,${a * 0.14})`; ctx.fillRect(x - r * 1.5, y - r * 1.5, r * 4, r * 4); } // soft halo
        });
        ctx.globalCompositeOperation = "source-over";
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    img.onerror = () => onDone();
    img.src = src;
    }
    if (url) start(url);
    return () => { dead = true; cancelAnimationFrame(raf); if (poll) clearInterval(poll); };
  }, [onDone]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); onDone(); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onDone]);

  return (
    <div className="intro" onClick={onDone}>
      <div className="intro-art" ref={art} aria-hidden="true" />
      <canvas ref={canvas} className="intro-canvas" aria-hidden="true" />
      <button className="intro-enter" onClick={onDone}>{t("intro.enter")}</button>
    </div>
  );
}
