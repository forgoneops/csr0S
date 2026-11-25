// The ambient background: a quiet Roman-and-tactical field behind the workspaces. Traces with
// travelling pulses, a stone floor and instrument marks; the centre stays clear for the content.
// Colours come from the active theme's --accent and --signal only (R13), so a theme swap repaints it.
// With Motion Off the canvas is hidden by CSS and the loop is not started (R28: no animation at all).
export type BackgroundOptions = { animate: () => boolean };

const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
type Path = { pts: [number, number][]; len: number[]; total: number; at: number; speed: number; live: boolean };

export function initBackground(canvas: HTMLCanvasElement, opts: BackgroundOptions): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let w = 0, h = 0, phase = 0, last = 0, px = -9999, py = -9999, wake = 0;
  let net: Path[] = [];
  let raf = 0;
  let stopped = false;

  const rng = (seed: number) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const buildNet = () => {
    const r = rng(w * 31 + h), step = w < 720 ? 28 : 44, per = w < 720 ? 4 : 11;
    const hx = Math.min(175, w * 0.23), hy = Math.min(250, h * 0.28), cx = w / 2, cy = h * 0.46;
    const inside = (x: number, y: number) => x > cx - hx && x < cx + hx && y > cy - hy && y < cy + hy;
    const crosses = (ax: number, ay: number, bx: number, by: number) => {
      for (let t = 0; t <= 1; t += 0.08) if (inside(ax + (bx - ax) * t, ay + (by - ay) * t)) return true;
      return false;
    };
    net = [];
    for (let side = 0; side < 2; side++) for (let j = 0; j < per; j++) for (let attempt = 0; attempt < 8; attempt++) {
      let x = Math.round((side ? w - 6 : 6) / step) * step;
      let y = Math.round((((j + r()) / per) * (h - 90) + 45) / step) * step;
      let d = r() < 0.45 ? (r() < 0.5 ? 1 : 3) : side ? 2 : 0;
      if (inside(x, y)) continue;
      const pts: [number, number][] = [[x, y]], len = [0];
      for (let k = 0; k < 9 + Math.floor(r() * 10); k++) {
        const run = (1 + Math.floor(r() * 4)) * step;
        if (k > 0) { const turn = r() < 0.5 ? 1 : -1; d = (d + (r() < 0.5 ? 2 : 4) * turn + 8) % 8; if (d > 3 && r() < 0.4) d %= 4; }
        const [dx, dy] = dirs[d], nx = x + dx * run, ny = y + dy * run;
        if (nx < 2 || nx > w - 2 || ny < 4 || ny > h - 4 || crosses(x, y, nx, ny)) break;
        len.push(len[len.length - 1] + Math.hypot(nx - x, ny - y)); pts.push([nx, ny]); x = nx; y = ny;
      }
      if (pts.length > 2) { net.push({ pts, len, total: len[len.length - 1], at: r() * len[len.length - 1], speed: 22 + r() * 34, live: r() < 0.3 }); break; }
    }
  };

  const pointAt = (path: Path, dist: number): [number, number] => {
    const L = path.len; let i = 1;
    while (i < L.length - 1 && L[i] < dist) i++;
    const t = (dist - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]), a = path.pts[i - 1], b = path.pts[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };

  // ---- WebGL layer: the traces and pulses as glow. Falls back to 2D when no context is available.
  const glc = document.createElement("canvas");
  glc.className = "bg-gl";
  glc.setAttribute("aria-hidden", "true");
  canvas.after(glc);
  const gl = glc.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  let useGL = !!gl;
  let segProg: WebGLProgram | null = null, nodeProg: WebGLProgram | null = null;
  let segBuf: WebGLBuffer | null = null, nodeBuf: WebGLBuffer | null = null, pulseBuf: WebGLBuffer | null = null, cornerBuf: WebGLBuffer | null = null;
  let nodeCount = 0, segCount = 0, pulseCount = 0;

  const hex3 = (c: string): number[] => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c.trim());
    return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : [0.8, 0.44, 0.26];
  };
  const compile = (g: WebGL2RenderingContext, type: number, src: string) => {
    const sh = g.createShader(type)!;
    g.shaderSource(sh, src); g.compileShader(sh);
    if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(sh) ?? "shader");
    return sh;
  };
  const program = (g: WebGL2RenderingContext, vs: string, fs: string) => {
    const pr = g.createProgram()!;
    g.attachShader(pr, compile(g, g.VERTEX_SHADER, vs));
    g.attachShader(pr, compile(g, g.FRAGMENT_SHADER, fs));
    g.linkProgram(pr);
    if (!g.getProgramParameter(pr, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(pr) ?? "program");
    return pr;
  };

  if (gl) {
    try {
      const head = "#version 300 es\n";
      segProg = program(gl,
        head + `in vec2 aCorner; in vec4 aSeg; in float aLive; uniform vec2 uRes; out vec2 vP; flat out vec4 vSeg; flat out float vLive;
        void main(){ vec2 a=aSeg.xy, b=aSeg.zw; vec2 p=mix(min(a,b)-30., max(a,b)+30., aCorner); vP=p; vSeg=aSeg; vLive=aLive;
        gl_Position=vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.); }`,
        head + `precision mediump float; in vec2 vP; flat in vec4 vSeg; flat in float vLive; uniform vec2 uPtr; uniform float uWake; uniform vec3 uAccent; uniform vec3 uSignal; out vec4 o;
        float segd(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-4),0.,1.); return length(pa-ba*h); }
        void main(){ float d=segd(vP,vSeg.xy,vSeg.zw); float pk=uWake*smoothstep(210.,0.,distance(vP,uPtr)); float w=3.+6.*pk;
          float I=smoothstep(1.1,.15,d)*(.09+.6*pk)+exp(-d*d/(2.*w*w))*(.05+.5*pk); vec3 c=mix(uAccent,uSignal,vLive); o=vec4(c*I,I); }`);
      nodeProg = program(gl,
        head + `in vec2 aCorner; in vec4 aN; in float aLive; uniform vec2 uRes; uniform vec2 uPtr; uniform float uWake; uniform float uBoost; out vec2 vQ; out float vA; out float vLive;
        void main(){ float k=uBoost*uWake*smoothstep(200.,0.,distance(aN.xy,uPtr)); float size=aN.z*(1.+2.4*k); vQ=(aCorner*2.-1.)*7.; vA=aN.w+.85*k; vLive=aLive;
          vec2 p=aN.xy+vQ*size; gl_Position=vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.); }`,
        head + `precision mediump float; in vec2 vQ; in float vA; in float vLive; uniform vec3 uAccent; uniform vec3 uSignal; out vec4 o;
        void main(){ float l1=abs(vQ.x)+abs(vQ.y); float I=(smoothstep(1.,.55,l1)+exp(-pow(l1/3.4,2.))*.6)*vA; vec3 c=mix(uAccent,uSignal,vLive); o=vec4(c*I,I); }`);
      cornerBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      segBuf = gl.createBuffer(); nodeBuf = gl.createBuffer(); pulseBuf = gl.createBuffer();
    } catch (e) {
      console.warn("background: WebGL unavailable, using 2D", e);
      useGL = false; glc.remove();
    }
  } else glc.remove();

  const attrib = (g: WebGL2RenderingContext, pr: WebGLProgram, name: string, buf: WebGLBuffer | null, size: number, stride: number, offset: number, divisor: number) => {
    const loc = g.getAttribLocation(pr, name);
    if (loc < 0) return;
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc, size, g.FLOAT, false, stride, offset);
    g.vertexAttribDivisor(loc, divisor);
  };

  const uploadStatic = () => {
    if (!useGL || !gl) return;
    const seg: number[] = [], nodes: number[] = [];
    for (const p of net) {
      for (let i = 1; i < p.pts.length; i++) seg.push(p.pts[i - 1][0], p.pts[i - 1][1], p.pts[i][0], p.pts[i][1], p.live ? 1 : 0);
      for (const [x, y] of p.pts) nodes.push(x, y, 2.4, 0.22, p.live ? 1 : 0);
    }
    segCount = seg.length / 5; nodeCount = nodes.length / 5;
    gl.bindBuffer(gl.ARRAY_BUFFER, segBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(seg), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nodes), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, pulseBuf); gl.bufferData(gl.ARRAY_BUFFER, 4 * 5 * (net.length * 10 + 4), gl.DYNAMIC_DRAW);
  };

  const renderGL = (animating: boolean) => {
    if (!useGL || !gl || !segProg || !nodeProg) return;
    const cs = getComputedStyle(document.documentElement);
    const accent = hex3(cs.getPropertyValue("--accent") || "#FF6A2B"), signal = hex3(cs.getPropertyValue("--signal") || "#37DFF5");
    gl.viewport(0, 0, glc.width, glc.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    if (animating) wake *= 0.95; else wake = 0;
    const set = (pr: WebGLProgram) => {
      gl.useProgram(pr);
      gl.uniform2f(gl.getUniformLocation(pr, "uRes"), w, h);
      gl.uniform3fv(gl.getUniformLocation(pr, "uAccent"), accent);
      gl.uniform3fv(gl.getUniformLocation(pr, "uSignal"), signal);
      gl.uniform2f(gl.getUniformLocation(pr, "uPtr"), px, py);
      gl.uniform1f(gl.getUniformLocation(pr, "uWake"), animating && wake > 0.02 ? wake : 0);
    };
    set(segProg);
    attrib(gl, segProg, "aCorner", cornerBuf, 2, 0, 0, 0); attrib(gl, segProg, "aSeg", segBuf, 4, 20, 0, 1); attrib(gl, segProg, "aLive", segBuf, 1, 20, 16, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segCount);
    set(nodeProg);
    gl.uniform1f(gl.getUniformLocation(nodeProg, "uBoost"), 1);
    attrib(gl, nodeProg, "aCorner", cornerBuf, 2, 0, 0, 0); attrib(gl, nodeProg, "aN", nodeBuf, 4, 20, 0, 1); attrib(gl, nodeProg, "aLive", nodeBuf, 1, 20, 16, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nodeCount);
    if (animating) {
      const data: number[] = [];
      for (const p of net) {
        const headAt = (p.at + phase * p.speed) % (p.total + 90);
        for (let k = 0; k < 10; k++) {
          const d = headAt - k * 6;
          if (d < 0 || d > p.total) continue;
          const [x, y] = pointAt(p, d);
          data.push(x, y, k === 0 ? 3.4 : 1.7, (1 - k / 10) * (p.live ? 0.95 : 0.8), p.live ? 1 : 0);
        }
      }
      pulseCount = data.length / 5;
      gl.bindBuffer(gl.ARRAY_BUFFER, pulseBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
      gl.uniform1f(gl.getUniformLocation(nodeProg, "uBoost"), 0);
      attrib(gl, nodeProg, "aN", pulseBuf, 4, 20, 0, 1); attrib(gl, nodeProg, "aLive", pulseBuf, 1, 20, 16, 1);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pulseCount);
    }
  };

  const draw = () => {
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue("--accent").trim() || "#FF6A2B";
    const signal = cs.getPropertyValue("--signal").trim() || "#37DFF5";
    ctx.clearRect(0, 0, w, h);
    const compact = w < 720, margin = compact ? 18 : 42, horizon = h * 0.78;
    ctx.save();
    // distant arch silhouettes at the edges, framing rather than filling the workspace
    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.055;
    for (const side of [0, 1]) {
      const x = side ? w - margin : margin, span = compact ? 30 : 76, top = h * 0.28;
      ctx.beginPath(); ctx.moveTo(x - span, h * 0.68); ctx.lineTo(x - span, top + span * 0.44);
      ctx.quadraticCurveTo(x, top - span * 0.6, x + span, top + span * 0.44);
      ctx.lineTo(x + span, h * 0.68); ctx.moveTo(x - span - 8, top + span * 0.4); ctx.lineTo(x + span + 8, top + span * 0.4);
      ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        const col = x + i * span * 0.56;
        ctx.beginPath(); ctx.moveTo(col, top + span * 0.48); ctx.lineTo(col, h * 0.68); ctx.stroke();
      }
    }
    // perspective lines: a data-lit stone floor, centre kept low contrast
    ctx.globalAlpha = 0.035; ctx.strokeStyle = signal; ctx.lineWidth = 0.7; ctx.beginPath();
    const van = w / 2;
    for (let i = -5; i <= 5; i++) { ctx.moveTo(van, horizon); ctx.lineTo(van + i * w * 0.19, h + 4); }
    for (let i = 1; i <= 5; i++) { const t = i / 5, y = horizon + (h - horizon) * t * t; ctx.moveTo(w * 0.04, y); ctx.lineTo(w * 0.96, y); }
    ctx.stroke();
    // faint instrument marks along both edges
    ctx.fillStyle = accent; ctx.font = `${compact ? 8 : 9}px var(--f-mono), monospace`; ctx.globalAlpha = 0.075;
    const glyphs = ["·", "+", "│", "∴", "⌁", "#"];
    for (let i = 0; i < (compact ? 9 : 20); i++) {
      const y = 32 + i * (h / (compact ? 12 : 22));
      ctx.fillText(glyphs[i % glyphs.length], margin, y);
      if (!compact) ctx.fillText(glyphs[(i + 2) % glyphs.length], w - margin, y);
    }
    if (!useGL) {
      ctx.lineWidth = 1; ctx.strokeStyle = accent; ctx.globalAlpha = 0.07;
      for (const p of net) { ctx.beginPath(); p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
      ctx.fillStyle = accent; ctx.globalAlpha = 0.16;
      for (const p of net) for (const [x, y] of [p.pts[0], p.pts[p.pts.length - 1]]) ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    if (!useGL && !reduce.matches && opts.animate() && wake > 0.02) {
      const R = compact ? 120 : 190; wake *= 0.94;
      for (const p of net) for (const [x, y] of p.pts) {
        const d = Math.hypot(x - px, y - py);
        if (d > R) continue;
        const k = (1 - d / R) * wake, r = 2 + 4 * k;
        ctx.globalAlpha = 0.15 + 0.7 * k; ctx.fillStyle = p.live ? signal : accent;
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
      }
    }
    if (!useGL && !reduce.matches && opts.animate()) {
      for (const p of net) {
        const head = (p.at + phase * p.speed) % (p.total + 90), col = p.live ? signal : accent;
        for (let s = 0; s < 10; s++) {
          const d = head - s * 6;
          if (d < 0 || d > p.total) continue;
          const [x, y] = pointAt(p, d);
          ctx.globalAlpha = (1 - s / 10) * (p.live ? 0.5 : 0.38); ctx.fillStyle = col;
          if (s === 0) { ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill(); }
          else ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
    }
    ctx.restore();
  };

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildNet();
    if (useGL) { glc.width = Math.round(w * dpr); glc.height = Math.round(h * dpr); uploadStatic(); }
    draw(); renderGL(false);
  };

  const touch = (e: PointerEvent) => { px = e.clientX; py = e.clientY; wake = 1; };
  const leave = () => { px = py = -9999; };
  addEventListener("pointermove", touch, { passive: true });
  addEventListener("pointerdown", touch, { passive: true });
  addEventListener("pointerleave", leave, { passive: true });
  addEventListener("resize", resize);

  const frame = (now: number) => {
    if (stopped) return;
    if (opts.animate() && !reduce.matches && !document.hidden && now - last > 33) {
      phase += Math.min((now - last) / 1000, 0.1); last = now;
      if (useGL) renderGL(true); else draw();
    }
    raf = requestAnimationFrame(frame);
  };

  const observer = new MutationObserver(() => { draw(); renderGL(false); });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-motion", "style"] });

  resize();
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    removeEventListener("pointermove", touch);
    removeEventListener("pointerdown", touch);
    removeEventListener("pointerleave", leave);
    removeEventListener("resize", resize);
    glc.remove();
  };
}
