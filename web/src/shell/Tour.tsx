// A one-time tour of the desktop shell, drawn as HUD labels: a diamond on the control, a line, and a glass box with open corners.
// It only points; it never moves or opens anything. Skip and Escape always work, and Settings can show it again.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";

const STEPS = [
  { sel: ".rail-apps", key: "apps" },
  { sel: ".rail-settings", key: "settings" },
  { sel: ".term-open", key: "terminal" },
  { sel: ".engine-chip", key: "engine" },
] as const;
const BOX_W = 350, GAP = 90, EDGE = 24, TOP = 72;   // TOP keeps the box under the top bar

type Geo = { tx: number; ty: number; bx: number; by: number; ax: number; ay: number; len: number };
const visible = (sel: string) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; };

export function Tour() {
  const { t, settings, update, route } = useStore();
  const active = settings.setupDone && !settings.tourDone && route !== "/start" && matchMedia("(min-width: 761px)").matches;
  const [steps, setSteps] = useState<typeof STEPS[number][]>([]);
  const [i, setI] = useState(0);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [tick, setTick] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  const next = useRef<HTMLButtonElement | null>(null);

  const finish = () => { void update({ tourDone: true }); };

  useEffect(() => {
    if (!active) return;
    const re = () => setTick((n) => n + 1);
    addEventListener("resize", re);
    return () => removeEventListener("resize", re);
  }, [active]);

  useLayoutEffect(() => {
    if (!active) return;
    const list = STEPS.filter((s) => visible(s.sel));
    setSteps(list);
    const step = list[Math.min(i, list.length - 1)];
    if (!step) { setGeo(null); return; }
    const r = document.querySelector(step.sel)!.getBoundingClientRect();
    const right = r.left + r.width / 2 > innerWidth / 2;          // a control on the right half (top bar) gets its box to the lower left
    // the diamond sits on the control's edge, never on its label: right edge for the rail, bottom edge for the top bar
    const tx = right ? r.left + r.width / 2 : r.right, ty = right ? r.bottom : r.top + r.height / 2;
    const h = box.current?.offsetHeight ?? 160;
    const bx = right ? Math.max(EDGE, r.left - BOX_W - GAP + r.width) : Math.min(innerWidth - BOX_W - EDGE, r.right + GAP);
    const by = Math.max(TOP, Math.min(innerHeight - h - EDGE, right ? r.bottom + 40 : ty - h / 2));
    const ax = bx + (tx < bx ? 0 : BOX_W), ay = by + h / 2;
    setGeo({ tx, ty, bx, by, ax, ay, len: Math.hypot(ax - tx, ay - ty) + 6 });
  }, [active, i, tick, route]);

  useEffect(() => { if (active && geo) next.current?.focus({ preventScroll: true }); }, [active, i, !!geo]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
      else if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [active, steps.length]);

  if (!active || !geo || steps.length === 0) return null;
  const n = steps.length, k = Math.min(i, n - 1), step = steps[k], last = k === n - 1;
  return (
    <div className="tour" role="dialog" aria-label={t("tour.label")} aria-describedby="tour-body" key={step.key}>
      <svg className="tour-svg" width={innerWidth} height={innerHeight} aria-hidden="true">
        <polyline className="tour-line" style={{ ["--len" as string]: geo.len }} points={`${geo.tx},${geo.ty} ${geo.ax},${geo.ay}`} />
      </svg>
      <span className="tour-tgt" style={{ left: geo.tx, top: geo.ty }} aria-hidden="true" />
      <div className="tour-box panel frame" ref={box} style={{ left: geo.bx, top: geo.by, width: BOX_W }}>
        <div className="in">
          <div className="tour-idx mono">{String(k + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</div>
          <h3 className="display">{t(`tour.${step.key}.title`)}</h3>
          <p id="tour-body">{t(`tour.${step.key}.body`)}</p>
          <div className="tour-actions">
            <button className="btn btn-quiet" onClick={finish}>{t("tour.skip")}</button>
            <span className="tour-grow" />
            {k > 0 && <button className="btn btn-secondary" onClick={() => setI(k - 1)}>{t("tour.back")}</button>}
            <button className="btn btn-primary" ref={next} onClick={() => (last ? finish() : setI(k + 1))}>{t(last ? "tour.done" : "tour.next")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
