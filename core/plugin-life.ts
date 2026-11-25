// The life of one module: its timers and listeners can be paused and resumed, so a module switched off
// in Settings really stops working in the background (and starts again when switched on) without a
// restart. Durable data is never touched here.
export type Off = () => void;

export class Life {
  private timers: { fn: () => void; ms: number; handle?: ReturnType<typeof setInterval> }[] = [];
  private subs: { fn: (type: string, data: unknown) => void; off?: Off }[] = [];
  private stops: Off[] = [];
  private on = true;
  constructor(private listenTo: (fn: (type: string, data: unknown) => void) => Off) {}
  get active() { return this.on; }

  /** A repeating job. It never keeps the process alive, and it runs only while the module is on. */
  interval(fn: () => void, ms: number): void {
    const t: (typeof this.timers)[number] = { fn, ms };
    this.timers.push(t);
    if (this.on) this.arm(t);
  }
  /** Every module's events, for as long as this module is on. Returns a function that ends the subscription for good. */
  listen(fn: (type: string, data: unknown) => void): Off {
    const s: (typeof this.subs)[number] = { fn };
    this.subs.push(s);
    if (this.on) s.off = this.listenTo(fn);
    return () => { s.off?.(); this.subs = this.subs.filter((x) => x !== s); };
  }
  /** Something to run each time the module is switched off (close a connection, cancel a job). */
  onStop(fn: Off): void { this.stops.push(fn); }

  pause(): void {
    if (!this.on) return;
    this.on = false;
    for (const t of this.timers) { if (t.handle) clearInterval(t.handle); t.handle = undefined; }
    for (const s of this.subs) { s.off?.(); s.off = undefined; }
    for (const stop of this.stops) { try { stop(); } catch { /* one failing cleanup must not block the rest */ } }
  }
  resume(): void {
    if (this.on) return;
    this.on = true;
    for (const t of this.timers) this.arm(t);
    for (const s of this.subs) s.off = this.listenTo(s.fn);
  }
  private arm(t: (typeof this.timers)[number]) {
    t.handle = setInterval(t.fn, t.ms);
    (t.handle as { unref?: () => void }).unref?.();
  }
}
