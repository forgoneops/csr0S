/* Hall of Fame, alive (plan 8.12): the Credits card's statues rendered in raw WebGL2 over the same
   picture. One flat photo, so life comes from light, depth, fire and particles: layered parallax,
   flickering braziers that light the plaques, rising embers, Caesar breathing, a soft spot on the
   statue under the pointer. The statues cannot move their limbs; true 3D would need modelled assets.
   Decoration only: aria-hidden canvas, pointer-events none, the real .hof-spot links stay on top.
   Falls back to the still picture when WebGL2, motion or a plain browser is what we have. */
(() => {
  register({ id: 'hof3d', views: {} });
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // the registry test's stub

  const SRC = 'art/caesaros-thanks-statues.webp';
  const BRAZIERS = [0.12, 0.24, 0.36, 0.49, 0.63, 0.77, 0.87];   // the seven fires between the statues
  const BRAZIER_Y = 0.615, PLATE_Y = 0.565, EMBERS = 140;

  // rect in picture uv, camera depth, mask (0 box, 1 ellipse, 2 none), soft edge in uv
  const LAYERS = [
    { r: [0, 0, 1, 1], depth: 0.06, mask: 2 },
    { r: [0, 0.02, 1, 0.56], depth: 0.28, mask: 0, feather: 0.045 },
    { r: [0, 0.50, 1, 0.50], depth: 0.18, mask: 0, feather: 0.05, shimmer: 1 },
    { r: [0.34, 0.44, 0.26, 0.42], depth: 0.55, mask: 1, feather: 0.03, breathe: 1 },
  ];

  const stats = { running: false, frames: 0, avgMs: 0, hover: -1 };

  const reduced = () => {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch { /* no matchMedia */ }
    const m = document.documentElement.dataset.motion;
    return m === 'off' || m === 'reduced';
  };
  const simple = () => document.documentElement.classList.contains('nx-simple');

  const VERT = `#version 300 es
in vec2 a_uv;
out vec2 v_uv;
void main(){ v_uv = a_uv; gl_Position = vec4(a_uv.x * 2.0 - 1.0, 1.0 - a_uv.y * 2.0, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D uTex;
uniform int uKind;            // 0 picture layer, 1 soft glow
uniform int uMaskKind;        // 0 box, 1 ellipse, 2 none
uniform vec4 uMask;           // centre x, centre y, half width, half height (uv)
uniform vec2 uCenter, uOffset;
uniform vec3 uColor;
uniform float uFeather, uAspect, uRadius, uIntensity, uTime, uShimmer;
out vec4 outC;

float maskAt(vec2 uv) {
  if (uMaskKind == 2) return 1.0;
  vec2 d = (uv - uMask.xy) / uMask.zw;
  float gap = uMaskKind == 1 ? (1.0 - length(d)) : (1.0 - max(abs(d.x), abs(d.y)));
  return smoothstep(0.0, uFeather, gap * min(uMask.z, uMask.w));
}

void main() {
  if (uKind == 1) {
    float d = length((v_uv - uCenter) * vec2(uAspect, 1.0)) / uRadius;
    float g = 1.0 - smoothstep(0.0, 1.0, d);
    outC = vec4(uColor * (g * g * uIntensity), 1.0);
    return;
  }
  vec2 uv = v_uv + uOffset;
  if (uShimmer > 0.5) {   // a faint warm wobble in the band the flames rise through
    float w = smoothstep(0.50, 0.60, v_uv.y) * (1.0 - smoothstep(0.68, 0.78, v_uv.y));
    uv.x += w * 0.0012 * sin(v_uv.y * 120.0 + uTime * 1.7) * sin(v_uv.x * 37.0 - uTime * 1.1);
  }
  vec4 c = texture(uTex, uv);
  float m = maskAt(v_uv);
  outC = vec4(c.rgb * m, m);
}`;

  const EVERT = `#version 300 es
in vec4 a_seed;    // x, y, speed, phase
uniform float uTime, uDpr;
out float v_a;
void main() {
  float life = fract(uTime * a_seed.z * 0.12 + a_seed.w);
  float x = a_seed.x + sin(uTime * 0.7 + a_seed.w * 20.0) * 0.006 * life;
  float y = a_seed.y - life * 0.30;
  gl_Position = vec4(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  float a = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.55, 1.0, life));
  v_a = a * (0.45 + 0.25 * sin(uTime * 1.3 + a_seed.w * 9.0));
  gl_PointSize = (1.5 + 3.5 * a) * uDpr;
}`;

  const EFRAG = `#version 300 es
precision mediump float;
in float v_a;
uniform vec3 uColor;
out vec4 outC;
void main() {
  float r = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
  outC = vec4(uColor * (r * r * v_a), r * v_a);
}`;

  const S = { el: null, cv: null, gl: null, img: null, spots: [], sx: [], ready: false, bad: false,
    raf: 0, t0: 0, t: 0, px: 0, py: 0, tx: 0, ty: 0, hov: -1, he: 0, dpr: 1, aspect: 1.78, io: null, ro: null,
    wanted: false, lost: false, f: [0, 0, 0, 0, 0, 0, 0] };

  // the browser checks' handle: frames drawn, frame time, which statue is lit
  window.HF3 = { stats: () => ({ running: stats.running, frames: stats.frames, avgMs: Math.round(stats.avgMs * 100) / 100, hover: stats.hover, ready: S.ready, img: !!S.img, wanted: S.wanted }) };

  /* ---------- GL ---------- */
  function build(gl) {
    const make = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
      return s;
    };
    const prog = (vs, fs, attr) => {
      const a = make(gl.VERTEX_SHADER, vs), b = make(gl.FRAGMENT_SHADER, fs);
      if (!a || !b) return null;
      const p = gl.createProgram();
      gl.attachShader(p, a); gl.attachShader(p, b); gl.bindAttribLocation(p, 0, attr); gl.linkProgram(p);
      gl.deleteShader(a); gl.deleteShader(b);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return null; }
      const u = {};
      for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        u[info.name] = gl.getUniformLocation(p, info.name);
      }
      return { p, u };
    };
    const pic = prog(VERT, FRAG, 'a_uv'), em = prog(EVERT, EFRAG, 'a_seed');
    if (!pic || !em) return false;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, S.img);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    const seeds = new Float32Array(EMBERS * 4);
    for (let i = 0; i < EMBERS; i++) {
      seeds[i * 4] = BRAZIERS[i % BRAZIERS.length] + (Math.random() - 0.5) * 0.03;
      seeds[i * 4 + 1] = BRAZIER_Y - 0.01 + Math.random() * 0.02;
      seeds[i * 4 + 2] = 0.6 + Math.random() * 0.8;
      seeds[i * 4 + 3] = Math.random();
    }
    const points = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, points);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

    Object.assign(S, { gl, tex, quad, points, pic, em, ready: true });
    return true;
  }

  // delete every resource we allocated; the context itself is kept and reused on the next open, so a
  // card the owner opens and closes does not burn a new WebGL context each time
  function free() {
    const gl = S.gl; if (!gl) return;
    if (S.tex) gl.deleteTexture(S.tex);
    for (const k of ['quad', 'points']) if (S[k]) gl.deleteBuffer(S[k]);
    for (const k of ['pic', 'em']) if (S[k]) gl.deleteProgram(S[k].p);
    Object.assign(S, { tex: null, quad: null, points: null, pic: null, em: null, ready: false });
  }

  // measured on mount and on resize only: reading clientWidth per frame forces a layout in the loop
  function size() {
    const gl = S.gl; if (!gl || !S.cv) return;
    const w = Math.max(2, Math.round(S.cv.clientWidth * S.dpr)), h = Math.max(2, Math.round(S.cv.clientHeight * S.dpr));
    if (S.cv.width !== w || S.cv.height !== h) { S.cv.width = w; S.cv.height = h; gl.viewport(0, 0, w, h); }
    S.aspect = w / h;
  }

  function glow(cx, cy, radius, intensity) {
    const gl = S.gl, U = S.pic.u;
    // the glow fades to nothing at its radius, so only its own box needs shading
    const rx = radius / Math.max(0.2, S.aspect);
    clipBox(cx - rx, cy - radius, rx * 2, radius * 2, 0);
    gl.uniform1i(U.uKind, 1);
    gl.uniform2f(U.uCenter, cx, cy);
    gl.uniform1f(U.uRadius, radius);
    gl.uniform1f(U.uIntensity, intensity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // a draw only shades inside this picture-space box: four full-layer passes plus the glows would
  // otherwise cost a screen of fill each, which is what an integrated GPU notices
  function clipBox(x, y, w, h, pad) {
    const gl = S.gl;
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const x0 = Math.max(0, Math.floor((x - pad) * W)), x1 = Math.min(W, Math.ceil((x + w + pad) * W));
    const y0 = Math.max(0, Math.floor((1 - (y + h + pad)) * H)), y1 = Math.min(H, Math.ceil((1 - (y - pad)) * H));
    gl.scissor(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
  }

  // calm fire: three slow sines, nothing near the 2 Hz photosensitivity line, amplitude kept small
  function flicker(t, i) {
    return 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * (0.9 + i * 0.13) + i * 2.1)) * (0.6 + 0.4 * Math.sin(t * (0.5 + i * 0.07) + i * 1.3));
  }

  function draw(now) {
    const gl = S.gl; if (!gl || !S.ready) return;
    const t = (now - S.t0) / 1000;
    const dt = S.t ? Math.min(50, (t - S.t) * 1000) : 0;
    S.t = t;
    stats.avgMs = stats.frames ? stats.avgMs * 0.9 + dt * 0.1 : dt;
    stats.frames++;

    // pointer and focus ease toward their targets, ~200 ms
    S.px += (S.tx - S.px) * 0.08; S.py += (S.ty - S.py) * 0.08;
    const he = S.hov >= 0 ? 1 : 0; S.he += (he - S.he) * 0.12;
    stats.hover = S.hov;

    const dx = Math.sin(t * 0.11) * 0.0035, dy = Math.cos(t * 0.083) * 0.0035;   // a slow camera drift, ~0.02 Hz
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);

    const U = S.pic.u;
    gl.useProgram(S.pic.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, S.tex);
    gl.uniform1i(U.uTex, 0);
    gl.uniform1f(U.uAspect, S.aspect);
    gl.uniform1f(U.uTime, t);

    // ---- the picture, split by depth
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const L of LAYERS) {
      const r = L.r;
      const ox = L.depth * (S.px * 0.010 + dx);
      const oy = L.depth * (S.py * 0.007 + dy);
      gl.uniform1i(U.uKind, 0);
      gl.uniform1i(U.uMaskKind, L.mask);
      gl.uniform4f(U.uMask, r[0] + r[2] / 2, r[1] + r[3] / 2, r[2] / 2, r[3] / 2);
      gl.uniform1f(U.uFeather, L.feather || 0.001);
      gl.uniform1f(U.uShimmer, L.shimmer || 0);
      // Caesar (the ape cut-out) breathes: ~2 px lift on a 4.7 s cycle, never more
      gl.uniform2f(U.uOffset, ox, oy + (L.breathe ? Math.sin(t * 1.35) * 0.0015 : 0));
      clipBox(r[0], r[1], r[2], r[3], 0.012);   // nothing outside its own rect is ever shaded
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ---- fire and the light it throws, additive
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform3f(U.uColor, 1.0, 0.55, 0.22);
    const f = S.f;   // seven numbers a frame: a fixed array, nothing allocated in the loop
    for (let i = 0; i < BRAZIERS.length; i++) {
      f[i] = flicker(t, i);
      glow(BRAZIERS[i], BRAZIER_Y, 0.10, 0.06 + 0.14 * f[i]);
    }
    for (let i = 0; i < S.sx.length; i++) {
      const near = (f[Math.max(0, i - 1)] + f[Math.min(f.length - 1, i)]) * 0.5;
      const lit = i === S.hov ? S.he : 0;
      glow(S.sx[i].x, PLATE_Y, 0.055, 0.03 + 0.05 * near + 0.22 * lit);
      if (lit > 0.01) glow(S.sx[i].x, 0.32, 0.16, 0.10 * lit);
    }

    // ---- embers (points scatter up out of the box, so the scissor goes off first)
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(S.em.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.points);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.uniform1f(S.em.u.uTime, t);
    gl.uniform1f(S.em.u.uDpr, S.dpr);
    gl.uniform3f(S.em.u.uColor, 1.0, 0.62, 0.3);
    gl.drawArrays(gl.POINTS, 0, EMBERS);
  }

  /* ---------- the loop ---------- */
  function tick(now) {
    S.raf = 0;
    if (!S.ready) { stats.running = false; return; }
    draw(now);
    if (S.wanted) S.raf = requestAnimationFrame(tick);
    else stats.running = false;
  }
  function start() {
    if (!S.ready || S.raf || document.hidden || !S.wanted) return;
    S.t0 = performance.now() - S.t * 1000;
    stats.running = true;
    S.raf = requestAnimationFrame(tick);
  }
  function stop() { if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; stats.running = false; }

  /* ---------- DOM ---------- */
  function measure() {
    if (!S.el) return;
    const hb = S.el.getBoundingClientRect();
    if (!hb.width || !hb.height) return;
    S.sx = S.spots.map((a) => {
      const r = a.getBoundingClientRect();
      return { x: (r.left - hb.left + r.width / 2) / hb.width };
    });
  }

  function bind() {
    S.spots = [...S.el.querySelectorAll('.hof-spot')];
    S.spots.forEach((a, i) => {
      const set = (v) => { S.hov = v; stats.hover = v; };
      a.addEventListener('pointerenter', () => set(i));
      a.addEventListener('pointerleave', () => { if (S.hov === i) set(-1); });
      a.addEventListener('focus', () => set(i));
      a.addEventListener('blur', () => { if (S.hov === i) set(-1); });
    });
    S.el.addEventListener('pointermove', (e) => {
      const r = S.el.getBoundingClientRect();
      S.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      S.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    });
    S.el.addEventListener('pointerleave', () => { S.tx = 0; S.ty = 0; });
  }

  // a phone's gyro, when the browser hands it over without asking (iOS wants a gesture: there we just do not)
  addEventListener('deviceorientation', (e) => {
    if (typeof e.gamma !== 'number' || typeof e.beta !== 'number') return;
    S.tx = Math.max(-1, Math.min(1, e.gamma / 30));
    S.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  });

  function glEvents(cv) {
    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); S.lost = true; stop(); S.ready = false; S.gl = null; cv.hidden = true;   // the still picture underneath is the fallback
    });
    cv.addEventListener('webglcontextrestored', () => {
      const g2 = cv.getContext('webgl2');
      if (!g2 || !S.img) return;
      S.lost = false; S.gl = g2; cv.hidden = false;
      if (build(g2)) { size(); start(); }
    });
  }

  function mount(el) {
    if (S.lost) return;   // a lost context stays down until the browser restores it
    if (!S.cv || !S.gl) {
      if (S.cv && S.cv.parentNode) S.cv.parentNode.removeChild(S.cv);
      S.cv = null;
      const cv = document.createElement('canvas');
      cv.className = 'hf3';
      cv.setAttribute('aria-hidden', 'true');
      cv.width = 2; cv.height = 2;
      // ?hofdebug keeps the drawing buffer so a browser check can read the scene back with toDataURL
      const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: true, powerPreference: 'low-power', preserveDrawingBuffer: /hofdebug/.test(location.search) });
      if (!gl) return;   // no WebGL2 here: the still picture stays
      S.cv = cv; S.gl = gl;
      glEvents(cv);
    }
    S.cv.hidden = false;
    el.insertBefore(S.cv, el.querySelector('.hof-spots'));
    S.el = el;
    S.wanted = true;
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    bind();
    measure();
    size();

    watch(el);
    if (!S.img) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        S.img = img;
        if (!S.gl) return;
        if (!build(S.gl)) { destroy(); return; }   // a picture we cannot draw is a still picture, never a blank card
        size(); start();
      };
      img.onerror = () => { S.bad = true; destroy(); };   // the picture itself is missing: stop asking
      img.src = SRC;
      return;
    }
    if (!build(S.gl)) { destroy(); return; }
    start();
  }

  // the observers follow the element, not the module: the Settings page replaces its cards
  function watch(el) {
    if (S.io) S.io.disconnect();
    if (S.ro) S.ro.disconnect();
    if (typeof IntersectionObserver !== 'undefined') {
      S.io = new IntersectionObserver((es) => {
        S.wanted = es.some((x) => x.isIntersecting);
        S.wanted ? start() : stop();
      }, { threshold: 0.05 });
      S.io.observe(el);
    }
    if (typeof ResizeObserver !== 'undefined') {
      S.ro = new ResizeObserver(() => { measure(); size(); });
      S.ro.observe(el);
    }
  }

  function destroy() {
    stop();
    if (S.io) { S.io.disconnect(); S.io = null; }
    if (S.ro) { S.ro.disconnect(); S.ro = null; }
    free();
    if (S.cv) { if (S.cv.parentNode) S.cv.parentNode.removeChild(S.cv); S.cv.hidden = false; }
    Object.assign(S, { el: null, spots: [], sx: [], hov: -1, he: 0, tx: 0, ty: 0, px: 0, py: 0, wanted: false, lost: false });
    stats.hover = -1;
  }

  function inView(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || 0) && r.right > 0 && r.left < (window.innerWidth || 0);
  }

  function sync() {
    const el = document.querySelector('.hof');
    if (!el) { if (S.el) destroy(); return; }
    if (reduced() || simple()) { if (S.el) destroy(); return; }
    if (S.el && el !== S.el) {
      if (S.ready && S.cv) {
        // the Settings page redrew its cards: move the live canvas instead of rebuilding it
        el.insertBefore(S.cv, el.querySelector('.hof-spots'));
        S.el = el; bind(); watch(el); measure(); size();
      } else destroy();
    }
    if (!S.el) { if (!S.bad) mount(el); return; }
    S.wanted = inView(S.el);   // reconcile: an observer state must never leave the scene stuck
    S.wanted ? start() : stop();
  }

  // the Settings page redraws its cards on every change, so follow the nodes that come and go
  let queued = false;
  const later = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; sync(); }, 0);   // not rAF: a motion switch must take effect even in a slow tab
  };
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-motion'] });
  }
  addEventListener('scroll', later, { passive: true, capture: true });   // the card lives in a scroller, not the page
  addEventListener('resize', () => {
    if (!S.el) return;
    measure(); size();
    S.wanted = inView(S.el);
    S.wanted ? start() : stop();
  });
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  sync();
})();
