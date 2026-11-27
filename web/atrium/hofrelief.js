/* Hall of Fame: a 2.5D hall of real statues. The painted key art art/caesaros-thanks-statues.webp (eight stone statues on
   plinths with torches, Caesar seen from behind) is the plate; two more statues are mirrored from it so ten keepers stand.
   A depth and normal map is derived once from the painting (luminance, silhouette dome, ground ramp), then one fragment
   shader on a full-card quad (three.js r128, WebGL2) does parallax from the pointer or the phone's tilt, relights the
   stone from the torches (slow, bounded flicker) and from the hovered keeper, grades it into the theme tokens, and
   engraves ASCII glyph cells over the shadows and edges. Hover or a press lifts and lights a statue and shows its
   nameplate. Decoration only: the real .hof-spot links stay on top. Offline, no model, no download. */
(() => {
  // no register(): the style is part of the hall module (hof3d), not a module of its own
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // the registry test's stub
  if (typeof THREE === 'undefined') return;
  const isOn = () => true;   // the only Hall style
  const baseHF3 = window.HF3;   // the default style's handle, put back when this style steps aside

  const PAL = { p1: new THREE.Color(), p2: new THREE.Color(), gold: new THREE.Color(), mag: new THREE.Color(), bg: new THREE.Color(), ink: new THREE.Color(), key: '' };
  const tok = (n, d) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; } catch { return d; } };
  function readPal() {
    const v = [tok('--p1', '#aaa'), tok('--p2', '#aaa'), tok('--gold', '#aaa'), tok('--tint-magenta', '#c0c'), tok('--bg', '#090812'), tok('--ink', '#ddd')], key = v.join('|');
    if (key === PAL.key) return;
    PAL.key = key; PAL.p1.set(v[0]); PAL.p2.set(v[1]); PAL.gold.set(v[2]); PAL.mag.set(v[3]); PAL.bg.set(v[4]); PAL.ink.set(v[5]);
  }
  const stats = { running: false, statues: 0, frames: 0, avgMs: 0, hover: -1, ready: false };
  const myHF3 = { bench: (n = 30) => { if (!S.rnd) return -1; const gl = S.rnd.getContext(), t = performance.now(); for (let i = 0; i < n; i++) { draw(); gl.finish(); } return (performance.now() - t) / n; }, shot: () => { try { draw(); return S.cv ? S.cv.toDataURL('image/png') : ''; } catch { return ''; } }, stats: () => ({ running: stats.running, frames: stats.frames, avgMs: Math.round(stats.avgMs * 100) / 100, hover: stats.hover, ready: stats.ready, statues: stats.statues, style: 'relief' }) };
  if (isOn()) window.HF3 = myHF3;

  const reduced = () => {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch { /* no matchMedia */ }
    const m = document.documentElement.dataset.motion;
    return m === 'off' || m === 'reduced';
  };
  const calm = () => reduced() || document.documentElement.classList.contains('nx-simple');

  const LEGENDS = [
    { epithet: 'The Emberwright', relic: 'the first ember', line: 'Kindled the fire this hall still burns on.' },
    { epithet: 'Keeper of the Weave', relic: 'the threaded staff', line: 'Holds the strands every other keeper pulls.' },
    { epithet: 'The Architect', relic: 'the plan tablet', line: 'Drew the colonnade before the first stone was cut.' },
    { epithet: 'The Far-Sighted', relic: 'the astrolabe', line: 'Read the road ahead and marked it for the troop.' },
    { epithet: 'The Steward', relic: 'the balance', line: 'Keeps the stores, so the work never starves.' },
    { epithet: 'The Chronicler', relic: 'the iron chronicle', line: 'Writes what was done, so nothing is claimed twice.' },
    { epithet: 'The Image-Smith', relic: 'the polished mirror', line: 'Shows the work as it is, never as it was promised.' },
    { epithet: 'The Engine-Tender', relic: 'the great gear', line: 'Feeds the engines and knows when one is tired.' },
    { epithet: 'The Builder', relic: 'the mason hammer', line: 'Turns a drawn line into something that stands.' },
    { epithet: 'The Watcher at the Gate', relic: 'the gate lantern', line: 'Lights the way in, and decides who may pass.' },
  ];


  /* ---------------- the plate: the painting, widened by two mirrored statues ---------------- */
  const ART = 'art/caesaros-thanks-statues.webp';
  const SW = 1800, PW = 2203, PH = 880, EXT0 = 222, EXT1 = 625;   // source width; plate size; the span mirrored onto the right
  /* column edges per keeper (plate px): eight painted statues, then the mirrors of the third and second */
  const BOUNDS = [0, 222, 425, 625, 870, 1150, 1365, 1585, 1800, 2000, 2203];
  /* the nameplate of each keeper: x0, y0, x1, y1 (the painted ones carry their own glowing name; the two mirrored ones are redrawn) */
  const PLAQUE = [[39, 522, 171, 595], [260, 555, 390, 613], [465, 562, 593, 622], [668, 570, 782, 625], [953, 570, 1085, 623], [1175, 567, 1313, 623], [1395, 557, 1525, 617], [1612, 525, 1755, 600], [1832, 562, 1960, 622], [2035, 555, 2165, 613]];
  const TORCH = [200, 410, 612, 1135, 1365, 1583, 1813, 2015];   // the braziers between the plinths (plate x), burning at y 600
  const HW = PW >> 1, HH = PH >> 1;                             // the depth map is half resolution

  /* ---------------- the depth maths (pure: also unit-tested) ---------------- */
  function blur(src, w, h, r) {   // separable box blur, two passes ~ a gaussian
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    const pass = (a, b, horiz) => {
      const n = horiz ? w : h, m = horiz ? h : w;
      for (let k = 0; k < m; k++) {
        let acc = 0;
        const at = (i) => a[horiz ? k * w + Math.min(n - 1, Math.max(0, i)) : Math.min(n - 1, Math.max(0, i)) * w + k];
        for (let i = -r; i <= r; i++) acc += at(i);
        for (let i = 0; i < n; i++) { b[horiz ? k * w + i : i * w + k] = acc / (2 * r + 1); acc += at(i + r + 1) - at(i - r); }
      }
    };
    pass(src, tmp, true); pass(tmp, out, false); pass(out, tmp, true); pass(tmp, out, false);
    return out;
  }
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /* RGBA pixels of the painting -> { depth, nx, ny, mask } floats. The stone is a rounded body (a blurred silhouette dome)
     carrying the painted detail (folds, cracks), standing on a floor that rises toward the viewer. */
  function heightMap(rgba, w, h) {
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = (0.3 * rgba[i * 4] + 0.59 * rgba[i * 4 + 1] + 0.11 * rgba[i * 4 + 2]) / 255;
    const fine = blur(lum, w, h, 1), soft = blur(lum, w, h, 5), mask = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = sstep(0.035, 0.1, soft[i]);
    const dome = blur(mask, w, h, 10), wide = blur(mask, w, h, 26), hgt = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, ground = 0.04 + 0.2 * sstep(0.55, 1, y / h);
      hgt[i] = ground + mask[i] * (0.22 * dome[i] + 0.2 * wide[i] + 0.34 * Math.min(1, fine[i] * 2.4) + 0.2 * Math.min(1, (lum[i] - soft[i]) * 6 + 0.5));
    }
    const nx = new Float32Array(w * h), ny = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      nx[i] = hgt[i + 1] - hgt[i - 1]; ny[i] = hgt[i + w] - hgt[i - w];
    }
    return { depth: hgt, nx, ny, mask };
  }

  /* the plate canvas: the painting, the mirrored span, and the two redrawn nameplates */
  function buildPlate(img) {
    const c = document.createElement('canvas'); c.width = PW; c.height = PH;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#05050a'; x.fillRect(0, 0, PW, PH);
    x.drawImage(img, 0, 0, SW, PH, 0, 0, SW, PH);   // the painting is 1800 wide; the plate keeps its top 880
    x.save(); x.translate(SW + EXT1, 0); x.scale(-1, 1);   // mirror of x 222..625 laid to the right of the picture, so the braziers stay between statues
    x.drawImage(img, EXT0, 0, EXT1 - EXT0, PH, EXT0, 0, EXT1 - EXT0, PH);
    x.restore();
    for (let i = 0; i < 10; i++) {   // every plaque becomes a fresh engraved slab: the painted lettering is too small to read, the link's own label carries the name
      const [x0, y0, x1, y1] = PLAQUE[i], g = x.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, '#5a361d'); g.addColorStop(1, '#341e10');
      x.fillStyle = g; x.fillRect(x0, y0, x1 - x0, y1 - y0);
      x.strokeStyle = '#a06a30'; x.lineWidth = 2; x.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
    }
    return c;
  }
  function buildDepth(plate) {   // normal + depth texture: R,G = slope, B = depth, A = silhouette
    const hc = document.createElement('canvas'); hc.width = HW; hc.height = HH;
    const hx = hc.getContext('2d', { willReadFrequently: true });
    hx.drawImage(plate, 0, 0, HW, HH);
    const m = heightMap(hx.getImageData(0, 0, HW, HH).data, HW, HH);
    const data = new Uint8Array(HW * HH * 4);
    for (let y = 0; y < HH; y++) for (let xx = 0; xx < HW; xx++) {
      const s = y * HW + xx, d = ((HH - 1 - y) * HW + xx) * 4;   // texture rows run bottom to top
      data[d] = Math.max(0, Math.min(255, Math.round(128 + m.nx[s] * 900)));
      data[d + 1] = Math.max(0, Math.min(255, Math.round(128 + m.ny[s] * 900)));
      data[d + 2] = Math.round(Math.min(1, m.depth[s]) * 255); data[d + 3] = Math.round(m.mask[s] * 255);
    }
    const t = new THREE.DataTexture(data, HW, HH, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
    return t;
  }

  /* ---------------- the shader ---------------- */
  const VERT = 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }';
  const FRAG = `
    precision highp float;
    uniform sampler2D uAlb, uNrm, uGlyph;
    uniform vec2 uRes; uniform vec4 uView; uniform vec2 uPar, uPlate;
    uniform float uT, uCell, uGlyphN, uReveal, uAscii, uHot, uB[11], uLift[10]; uniform vec3 uTorch[8]; uniform vec4 uPq[10];
    uniform vec3 uP1, uP2, uGold, uMag, uBg, uInk;
    float gEdge, gEm;
    float liftAt(float u){ float l = 0.; for (int i = 0; i < 10; i++) { float a = smoothstep(uB[i] - .004, uB[i] + .004, u) * (1. - smoothstep(uB[i+1] - .004, uB[i+1] + .004, u)); l += a * uLift[i]; } return l; }
    vec3 grade(float v){
      vec3 c = mix(uBg * 1.1, uP1 * .5, smoothstep(0., .3, v));
      c = mix(c, uP1 * 1.0, smoothstep(.28, .62, v));
      return mix(c, mix(uGold, uP1 * 1.5, .3) * .95, smoothstep(.62, 1.1, v));
    }
    // the lit, graded stone at a screen position (0..1); fills gEdge
    vec4 shade(vec2 s){
      vec2 uv = vec2(uView.x + s.x * uView.y, uView.z + s.y * uView.w);
      vec4 n0 = texture2D(uNrm, uv);
      float lift = liftAt(uv.x) * smoothstep(.04, .45, n0.a);   // the light follows the statue, not the column
      vec2 pr = uPar * vec2(.0075, .011) * (1. + lift * .8);
      uv -= pr * (n0.b - .4);
      vec4 nm = texture2D(uNrm, uv);
      vec3 alb = texture2D(uAlb, uv).rgb;
      float L0 = dot(alb, vec3(.3, .59, .11));
      vec3 N = normalize(vec3((nm.xy * 2. - 1.) * 3.2, 1.));
      float lit = .2;
      for (int i = 0; i < 8; i++) {
        float fl = .9 + .1 * sin(uT * 1.7 + float(i) * 2.3) * sin(uT * .6 + float(i));
        vec3 d = vec3((uTorch[i].xy - uv) * uPlate, 70.);
        float a = 1. / (1. + dot(d, d) / 90000.);
        lit += uTorch[i].z * fl * a * (.25 + max(dot(N, normalize(d)), 0.) * 1.1);
      }
      vec3 Ld = normalize(vec3(-.45 + uPar.x * .5, .65 - uPar.y * .4, .6));
      lit += (.06 + .4 * max(dot(N, Ld), 0.)) * (.35 + lift);          // a cool key from above, brighter on the lit keeper
      float rim = pow(1. - clamp(N.z, 0., 1.), 1.6);
      float form = pow(clamp(L0 * 1.9, 0., 1.), .9);
      float v = form * lit * (1. + lift * .7) + rim * lift * .5 + step(.5, L0) * lift * .35;
      v *= mix(.45, 1., smoothstep(.0, .42, uv.y));                      // depth fog: the vault falls into dark
      gEdge = smoothstep(.05, .5, length(nm.xy * 2. - 1.)) * nm.a;
      float inq = 0.; for (int i = 0; i < 10; i++) inq = max(inq, step(uPq[i].x, uv.x) * step(uv.x, uPq[i].z) * step(uPq[i].y, uv.y) * step(uv.y, uPq[i].w));
      gEm = inq;                                   // the glowing plaque lettering is its own light
      v = mix(v, .2 + L0 * .5 + lift * .32 + .03 * sin(uT * 1.3 + uv.x * 40.), gEm);   // a glowing slab behind the engraved name
      vec3 col = grade(clamp(v, 0., 1.4));
      col += uMag * smoothstep(.28, .5, (alb.r + alb.b) * .5 - alb.g * 1.15) * step(.5, alb.b) * 1.2;   // the crystal, if the art holds one
      return vec4(col, clamp(v, 0., 1.));
    }
    void main(){
      vec2 fc = gl_FragCoord.xy / uCell, cellC = (floor(fc) + .5) * uCell / uRes;
      vec4 sm = shade(gl_FragCoord.xy / uRes);
      vec4 ce = shade(cellC); float eC = gEdge, mC = gEm;
      float L = ce.a;
      float idx = floor(clamp(L * .95 + eC * .35, 0., .999) * uGlyphN);
      float cov = texture2D(uGlyph, vec2((idx + fract(fc.x)) / uGlyphN, fract(fc.y))).r;
      float a = (uAscii * (1. - smoothstep(.22, .62, L)) * .75 + uAscii * eC * .25) * (1. - mC);
      vec3 gcol = mix(uP1 * 1.3, mix(uGold, vec3(1.), .25), clamp(eC * 1.2, 0., 1.)) * (.5 + L);
      vec3 col = mix(sm.rgb, mix(sm.rgb * .6, gcol, cov), a);
      vec2 q = gl_FragCoord.xy / uRes - .5;
      col *= 1. - .55 * dot(q, q) * 1.6;                                 // vignette
      gl_FragColor = vec4(col * uReveal, 1.);
    }`;

  function glyphAtlas(n, cellPx) {   // ramp of ten glyphs, dark to dense, white on black, one row
    const ramp = ' .:-=+*#%@', c = document.createElement('canvas');
    c.width = cellPx * n; c.height = cellPx;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = `800 ${Math.round(cellPx * 0.92)}px ui-monospace, monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < n; i++) x.fillText(ramp[i], i * cellPx + cellPx / 2, cellPx / 2 + 1);
    const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }

  /* ---------------- the stage ---------------- */
  const S = { el: null, cv: null, rnd: null, scene: null, cam: null, mat: null, glyph: null, alb: null, nrm: null, spots: [], pan: 0, panMax: 0, pw: 0, ph: 0, tx: 0, ty: 0, ax: 0, ay: 0, hov: -1, lift: new Array(10).fill(0), w: 0, h: 0,
    drag: null, suppress: false, wanted: false, raf: 0, t0: 0, last: 0, io: null, ro: null, bad: false, lost: false, legend: null, still: '', loading: null, bound: false, gen: 0, pr: 1, nav: null, plate: null };
  const colOf = (px) => { const u = (px - S.pan) / S.pw * PW; for (let i = 0; i < 10; i++) if (u >= BOUNDS[i] && u < BOUNDS[i + 1]) return i; return -1; };

  function layout() {
    const { w, h } = S, s = Math.max(w / PW, h / PH) * (w < 700 ? 1.25 : 1);   // a phone shows about three keepers, drag or buttons for the rest
    S.pw = PW * s; S.ph = PH * s; S.panMax = Math.max(0, S.pw - w);
    S.pan = Math.max(-S.panMax, Math.min(0, S.pan));
    S.spots.forEach((a, i) => {
      const x0 = BOUNDS[i] * s, x1 = BOUNDS[i + 1] * s, pq = PLAQUE[i], sp = a.firstElementChild;
      a.style.left = (x0 + S.pan) + 'px'; a.style.width = (x1 - x0) + 'px'; a.style.top = '0px'; a.style.height = '100%';
      if (sp) { const pwid = (pq[2] - pq[0]) * s; sp.style.width = pwid + 'px'; sp.style.fontSize = Math.max(7.5, Math.min(11, pwid / ((sp.textContent || 'x').length * 0.64))) + 'px'; sp.style.left = (((pq[0] + pq[2]) / 2 * s - x0) / (x1 - x0) * 100) + '%'; sp.style.top = ((pq[1] + pq[3]) / 2 * s) + 'px'; sp.style.bottom = 'auto'; }
    });
    if (S.nav) S.nav.forEach((b) => { b.hidden = S.panMax < 2; });
  }
  function applyPan() {
    const s = S.pw / PW;
    S.spots.forEach((a, i) => { a.style.left = (BOUNDS[i] * s + S.pan) + 'px'; });
  }
  function uniforms() {
    const U = S.mat.uniforms, { w, h } = S;
    U.uRes.value.set(w * S.pr, h * S.pr);
    const sy = Math.min(1, h / S.ph);
    U.uView.value.set(-S.pan / S.pw, w / S.pw, 1 - sy, sy);
    U.uPlate.value.set(PW, PH);
    U.uCell.value = (w < 700 ? 5 : 6) * S.pr;
  }
  function buildScene() {
    S.scene = new THREE.Scene(); S.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    S.glyph = glyphAtlas(10, 16);
    const U = {
      uAlb: { value: S.alb }, uNrm: { value: S.nrm }, uGlyph: { value: S.glyph }, uRes: { value: new THREE.Vector2(1, 1) }, uView: { value: new THREE.Vector4(0, 1, 0, 1) }, uPar: { value: new THREE.Vector2() }, uPlate: { value: new THREE.Vector2(PW, PH) },
      uT: { value: 0 }, uCell: { value: 6 }, uGlyphN: { value: 10 }, uReveal: { value: 0 }, uAscii: { value: 1 }, uHot: { value: -1 },
      uB: { value: BOUNDS.map((b) => b / PW) }, uPq: { value: PLAQUE.map(([a, b, c, d]) => new THREE.Vector4(a / PW, 1 - d / PH, c / PW, 1 - b / PH)) }, uLift: { value: new Array(10).fill(0) }, uTorch: { value: TORCH.map((x) => new THREE.Vector3(x / PW, 1 - 600 / PH, 1)) },
      uP1: { value: PAL.p1 }, uP2: { value: PAL.p2 }, uGold: { value: PAL.gold }, uMag: { value: PAL.mag }, uBg: { value: PAL.bg }, uInk: { value: PAL.ink },
    };
    S.mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false });
    S.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), S.mat));
    stats.statues = 10;
    return true;
  }
  function measure() {
    if (!S.el) return;
    const b = S.el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    S.w = b.width; S.h = b.height;
    S.spots = [...S.el.querySelectorAll('.hof-spot')];
    S.pr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (S.rnd) { S.rnd.setPixelRatio(S.pr); S.rnd.setSize(S.w, S.h, false); }
    layout();
    if (S.mat) uniforms();
    if (S.rnd && S.scene) draw();
  }
  function draw() { if (S.rnd && S.scene && !S.lost) S.rnd.render(S.scene, S.cam); }

  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    if (!S.t0) S.t0 = now;
    const t = (now - S.t0) / 1000, dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now;
    readPal();
    const k = 1 - Math.exp(-dt * 5);
    S.ax += (S.tx - S.ax) * k; S.ay += (S.ty - S.ay) * k;
    const U = S.mat.uniforms;
    for (let i = 0; i < 10; i++) { S.lift[i] += ((i === S.hov ? 1 : 0) - S.lift[i]) * (1 - Math.exp(-dt * 8)); U.uLift.value[i] = S.lift[i]; }
    U.uT.value = t; U.uPar.value.set(S.ax, S.ay);
    U.uReveal.value = Math.min(1, (now - S.t0) / 900);   // wall clock: a slow GPU still fades in on time
    draw();
    stats.frames++;
    const ms = performance.now() - t0; stats.avgMs = stats.avgMs ? stats.avgMs * 0.9 + ms * 0.1 : ms;
  }
  function setRunning(v) {
    if (v && !S.raf && S.rnd && S.scene && !calm()) { S.last = 0; S.raf = requestAnimationFrame(frame); stats.running = true; }
    else if (!v && S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; stats.running = false; }
  }
  function mark() { S.spots.forEach((a, i) => a.classList.toggle('hf-hot', i === S.hov)); }

  /* ---------------- legend (same card as the default style) ---------------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function closeLegend() {
    if (!S.legend) return;
    const { el, onKey } = S.legend;
    document.removeEventListener('keydown', onKey, true);
    if (el.parentNode) el.parentNode.removeChild(el);
    S.legend = null;
  }
  function openLegend(i) {
    const spot = S.spots[i]; if (!spot) return;
    closeLegend();
    const name = (spot.querySelector('span') || {}).textContent || '', L = LEGENDS[i % LEGENDS.length], href = spot.getAttribute('href') || '#';
    const wrap = document.createElement('div');
    wrap.className = 'hof-legend'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', `${name}, ${L.epithet}`);
    wrap.innerHTML = `<div class="hf-card" data-no-i18n>
      <span class="hf-eyebrow">Keeper ${String(i + 1).padStart(2, '0')} · Hall of Fame</span><h4>${esc(name.replace(/^@/, ''))}</h4>
      <p class="hf-epithet">${esc(L.epithet)}</p><p class="hf-relic"><span>Relic</span> ${esc(L.relic)}</p><p class="hf-line">${esc(L.line)}</p>
      <div class="hf-acts"><a class="btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open on X</a><button class="btn ghost" type="button" data-hf="close">Close</button></div></div>`;
    document.body.appendChild(wrap);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeLegend(); spot.focus(); }
      if (e.key === 'Tab') {
        const f = [...wrap.querySelectorAll('a,button')], first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-hf="close"]') || e.target === wrap) { closeLegend(); spot.focus(); } });
    document.addEventListener('keydown', onKey, true);
    S.legend = { el: wrap, onKey };
    wrap.querySelector('[data-hf="close"]').focus();
  }

  /* ---------------- input ---------------- */
  function panTo(i) {
    const s = S.pw / PW, mid = (BOUNDS[i] + BOUNDS[i + 1]) / 2 * s;
    S.pan = Math.max(-S.panMax, Math.min(0, S.w / 2 - mid)); applyPan(); uniforms(); if (calm()) draw();
  }
  function bind() {
    const el = S.el;
    el.addEventListener('click', (e) => {
      if (S.suppress) { S.suppress = false; e.preventDefault(); e.stopPropagation(); return; }
      if (e.target.closest && e.target.closest('.hf3-nav')) return;
      const a = e.target.closest && e.target.closest('.hof-spot');
      if (!a) { closeLegend(); return; }
      e.preventDefault(); e.stopPropagation();
      const i = S.spots.indexOf(a); if (i >= 0) openLegend(i);
    });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      S.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)); S.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      S.hov = colOf(e.clientX - r.left); stats.hover = S.hov; mark();
      if (calm()) still(S.hov);
    });
    el.addEventListener('pointerdown', (e) => { S.hov = colOf(e.clientX - el.getBoundingClientRect().left); stats.hover = S.hov; mark(); S.drag = { x: e.clientX, pan: S.pan, moved: false }; });   // touch has no hover: a press lifts the keeper
    el.addEventListener('pointerleave', () => { S.tx = 0; S.ty = 0; S.hov = -1; stats.hover = -1; mark(); if (calm()) still(); });
    el.addEventListener('focusin', (e) => {
      const a = e.target.closest && e.target.closest('.hof-spot'); if (!a) return;
      S.hov = S.spots.indexOf(a); stats.hover = S.hov; mark();
      if (S.hov >= 0) panTo(S.hov);   // a keeper past the edge comes to the middle
      if (calm()) still(S.hov);
    });
    el.addEventListener('focusout', () => { S.hov = -1; stats.hover = -1; mark(); if (calm()) still(); });
    if (S.bound) return;
    S.bound = true;
    addEventListener('pointermove', (e) => {
      if (!S.drag || !S.el) return;
      const dx = e.clientX - S.drag.x;
      if (Math.abs(dx) > 8) S.drag.moved = true;
      if (S.drag.moved) { S.pan = Math.max(-S.panMax, Math.min(0, S.drag.pan + dx)); applyPan(); uniforms(); if (calm()) draw(); }
    }, { passive: true });
    const up = () => { if (!S.drag) return; if (S.drag.moved) { S.suppress = true; setTimeout(() => { S.suppress = false; }, 350); } S.drag = null; };
    addEventListener('pointerup', up, { passive: true }); addEventListener('pointercancel', () => { S.drag = null; }, { passive: true });
    addEventListener('deviceorientation', (e) => {   // a phone's own tilt turns the hall; no permission prompt, silent where denied
      if (e.gamma == null || !S.el || calm()) return;
      S.tx = Math.max(-1, Math.min(1, e.gamma / 30)); S.ty = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 30));
    }, { passive: true });
  }
  function addNav(el) {   // the row is wider than a phone: previous and next keepers by button as well as by drag
    const mk = (cls, dir) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'hf3-nav ' + cls; b.setAttribute('aria-label', dir < 0 ? 'Previous keeper' : 'Next keeper'); b.hidden = true;
      b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><polyline points="15,5 8,12 15,19"/></svg>';
      b.addEventListener('click', (e) => { e.stopPropagation(); const s = S.pw / PW, mid = (-S.pan + S.w / 2) / s; let c = BOUNDS.findIndex((v, i) => i < 10 && mid >= v && mid < BOUNDS[i + 1]); c = Math.max(0, Math.min(9, c + dir)); panTo(c); });
      el.appendChild(b); return b;
    };
    S.nav = [mk('hf3-prev', -1), mk('hf3-next', 1)];
  }

  /* ---------------- mount / still frame ---------------- */
  function still(lit = -1) {
    if (!S.rnd || !S.mat) return;
    const U = S.mat.uniforms;
    for (let i = 0; i < 10; i++) { S.lift[i] = i === lit ? 1 : 0; U.uLift.value[i] = S.lift[i]; }
    U.uReveal.value = 1; U.uT.value = 2; U.uPar.value.set(0, 0); S.tx = S.ty = S.ax = S.ay = 0; S.hov = lit; mark(); draw();
    try {
      S.still = S.rnd.domElement.toDataURL('image/png');
      const fb = S.el.querySelector('.hof-fallback');
      if (fb) fb.src = S.still;   // the alt text stays the translated one from the card
    } catch { /* no still: the card keeps its picture */ }
  }
  function applyCalm() {
    if (!S.el) return;
    const fb = S.el.querySelector('.hof-fallback');
    if (calm()) {
      setRunning(false); still(S.hov);   // a sync must not unlight the keeper the keyboard is on
      if (S.cv) S.cv.hidden = true;
      if (fb && S.still) fb.style.display = '';
    } else { if (S.cv) S.cv.hidden = false; if (fb) fb.style.display = 'none'; }
  }
  const loadImg = () => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = ART; });
  let PLATE = null;   // { alb, nrm } built once and kept across remounts
  async function mount(el) {
    if (S.bad || S.loading) return;
    const cv = document.createElement('canvas');
    cv.className = 'hf3'; cv.setAttribute('aria-hidden', 'true');
    const gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'default', preserveDrawingBuffer: true });
    if (!gl) { S.bad = true; return; }   // WebGL2 or the still picture
    const rnd = new THREE.WebGLRenderer({ canvas: cv, context: gl, antialias: false, alpha: false, preserveDrawingBuffer: true });
    rnd.setClearColor(0x000000, 1);
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.lost = true; setRunning(false); });
    cv.addEventListener('webglcontextrestored', () => { S.lost = false; setRunning(S.wanted); });
    S.cv = cv; S.rnd = rnd; S.el = el;
    el.insertBefore(cv, el.querySelector('.hof-spots') || null);
    const gen = ++S.gen;
    S.loading = (async () => {
      if (!PLATE) {
        const img = await loadImg(); if (!img) return;
        await new Promise((r) => setTimeout(r, 0));   // never one long task: the picture, then the depth
        const c = buildPlate(img);
        await new Promise((r) => setTimeout(r, 0));
        PLATE = { c, nrm: buildDepth(c) };
      }
    })();
    await S.loading; S.loading = null;
    if (gen !== S.gen || S.el !== el) return;
    if (!PLATE) { S.bad = true; destroy(); return; }
    S.alb = new THREE.CanvasTexture(PLATE.c); S.alb.minFilter = THREE.LinearMipmapLinearFilter; S.alb.generateMipmaps = true; S.alb.anisotropy = 4; S.nrm = PLATE.nrm;
    readPal();
    bind(); addNav(el); el.classList.add('hf3-live');
    buildScene(); measure();
    stats.ready = true;
    watch(el); S.wanted = inView(el);
    applyCalm();
    if (!calm()) { draw(); setRunning(S.wanted); }
  }
  function destroy() {
    closeLegend(); setRunning(false);
    if (S.io) S.io.disconnect(); if (S.ro) S.ro.disconnect(); S.io = S.ro = null;
    if (S.mat) S.mat.dispose();
    if (S.glyph) S.glyph.dispose();
    if (S.alb) S.alb.dispose();
    if (S.nav) S.nav.forEach((b) => b.remove());
    if (S.el) S.el.classList.remove('hf3-live');
    if (S.cv && S.cv.parentNode) S.cv.parentNode.removeChild(S.cv);
    if (S.rnd) S.rnd.dispose();
    Object.assign(S, { el: null, cv: null, rnd: null, scene: null, cam: null, mat: null, glyph: null, alb: null, spots: [], nav: null, hov: -1, wanted: false, gen: S.gen + 1, loading: null });
    stats.ready = false; stats.statues = 0; stats.hover = -1;
  }
    function watch(el) {
    if (typeof IntersectionObserver !== 'undefined') { S.io = new IntersectionObserver((es) => { S.wanted = es.some((x) => x.isIntersecting); setRunning(S.wanted); }, { threshold: 0.05 }); S.io.observe(el); }
    if (typeof ResizeObserver !== 'undefined') { S.ro = new ResizeObserver(() => measure()); S.ro.observe(el); }
  }
  function inView(el) { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; }

  function sync() {
    readPal();
    const el = document.querySelector('.hof');
    if (!isOn()) { if (S.el) destroy(); if (window.HF3 === myHF3) window.HF3 = baseHF3; return; }
    window.HF3 = myHF3;
    if (!el) { if (S.el) destroy(); return; }
    if (S.el && el !== S.el) destroy();   // the Settings page redrew its card: new nodes, new stage (plaques are cached)
    if (!S.el) { mount(el); return; }
    if (!S.rnd || !stats.ready) return;
    S.wanted = inView(S.el);
    if (S.spots.some((a) => !a.isConnected)) { measure(); }
    applyCalm();
    if (!calm()) setRunning(S.wanted);
  }
  let queued = false;
  const later = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; sync(); }, 0); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-motion', 'style', 'data-pal', 'data-skin', 'data-theme'] });
  addEventListener('scroll', later, { passive: true, capture: true });
  addEventListener('hof-style', later);
  document.addEventListener('visibilitychange', () => (document.hidden ? setRunning(false) : setRunning(S.wanted)));
  sync();
})();
