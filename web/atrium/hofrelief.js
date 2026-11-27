/* Hall of Fame, relief style (opt-in: localStorage 'hof-style' = 'relief'). Approach B to the same card as hof3d.js:
   the ten keepers are 2.5D reliefs made from the painted ape generals already in art/. A height map is derived once
   per keeper on a canvas (luminance, edge-aware blur, a vertical swell), a high-resolution plane is displaced by it
   in three.js (r128, WebGL2), lit by a key light and a rim from a normal map read off the height, graded to stone
   in the theme tokens, and shaded with ASCII glyphs that burn bright on the edges and melt into smooth engraved stone in
   the lit areas. The pointer or the phone's tilt turns the plaques; hover or a press lifts the keeper; the crystal and
   the scar glow. Decoration only: the real .hof-spot links stay on top. Offline, no model, no download. */
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
  const myHF3 = { stats: () => ({ running: stats.running, frames: stats.frames, avgMs: Math.round(stats.avgMs * 100) / 100, hover: stats.hover, ready: stats.ready, statues: stats.statues, style: 'relief' }) };
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

  /* The troop: ten distinct painted generals. flip turns the outer ranks inward; mix leans a plaque toward the lead or the answer colour. */
  const SRC = [
    ['caesaros-caesar-portrait', 1, 0.0, 0.5], ['caesaros-crew-balbus', 0, 0.2, 0.5], ['caesaros-crew-vitruvius', 0, 0.8, 0.5], ['caesaros-crew-varro', 1, 0.5, 0.5], ['caesaros-crew-annona', 0, 1.0, 0.5],
    ['caesaros-crew-calpurnia', 1, 0.15, 0.5], ['caesaros-crew-agrippa', 1, 0.7, 0.5], ['caesaros-tool-claudius', 1, 0.3, 0.5], ['caesaros-crew-clientdev', 1, 0.9, 0.5], ['caesaros-caesar-neo', 1, 0.5, 0.5],
  ];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const TW = 256, TH = 312, PLINTH = 44, AREA = TH - PLINTH;   // plaque texture: art on top, a keeper's plinth below

  /* ---------------- the relief maths (pure: also unit-tested) ---------------- */
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
  /* height 0..1 from RGBA pixels of the painted area: luminance, edge-aware blur (strong edges keep their detail),
     a vertical swell so the bust leans toward the viewer, and a rounded rim so the plaque has a bevel. */
  function heightMap(rgba, w, h) {
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = Math.pow((0.3 * rgba[i * 4] + 0.59 * rgba[i * 4 + 1] + 0.11 * rgba[i * 4 + 2]) / 255, 0.7);
    const b = blur(lum, w, h, 4), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, d = lum[i] - b[i];
      const edge = sstep(0.05, 0.22, Math.abs(d));
      const base = b[i] + d * edge * 0.9 + d * 0.15;                      // edge-aware: flat areas smooth, strong edges stay sharp
      const swell = 0.32 * (y / h) + 0.22 * (1 - Math.pow(Math.hypot((x / w - 0.5) * 1.6, (y / h - 0.55) * 1.1), 1.2));
      const rim = sstep(0, 10, Math.min(x, w - 1 - x, y));                // bevel at the plaque edge
      out[i] = Math.max(0, Math.min(1, (0.5 * base + swell) * rim));
    }
    return out;
  }

  /* ---------------- plaques: colour + height canvases per keeper, built once and kept ---------------- */
  const plates = [];   // { col: CanvasTexture, dep: CanvasTexture, ok }
  function plinthPath(x, ctx, k, cx, cy, s) {   // the relic mark: a cut-corner shape, one per keeper kind
    ctx.beginPath();
    const t = k % 5;
    if (t === 0) { ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy); }
    else if (t === 1) { ctx.rect(cx - s * .8, cy - s * .8, s * 1.6, s * 1.6); }
    else if (t === 2) { ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy + s * .8); ctx.lineTo(cx - s, cy + s * .8); }
    else if (t === 3) { const q = s * .38; ctx.moveTo(cx - q, cy - s); ctx.lineTo(cx + q, cy - s); ctx.lineTo(cx + q, cy - q); ctx.lineTo(cx + s, cy - q); ctx.lineTo(cx + s, cy + q); ctx.lineTo(cx + q, cy + q); ctx.lineTo(cx + q, cy + s); ctx.lineTo(cx - q, cy + s); ctx.lineTo(cx - q, cy + q); ctx.lineTo(cx - s, cy + q); ctx.lineTo(cx - s, cy - q); ctx.lineTo(cx - q, cy - q); }
    else { ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s * .4, cy - s); ctx.lineTo(cx + s, cy - s * .4); ctx.lineTo(cx + s, cy + s); ctx.lineTo(cx - s * .4, cy + s); ctx.lineTo(cx - s, cy + s * .4); }
    ctx.closePath();
  }
  function buildPlate(i, img) {
    const [, flip, fx] = SRC[i];
    const c = document.createElement('canvas'); c.width = TW; c.height = TH;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#05050a'; x.fillRect(0, 0, TW, TH);
    // cover-crop the square painting into the art area; fx slides the crop sideways toward the face
    const sw = img.naturalWidth * (TW / AREA > 1 ? 1 : TW / AREA), sh = sw * (AREA / TW), sx = (img.naturalWidth - sw) * fx, sy = 0;
    x.save();
    if (flip) { x.translate(TW, 0); x.scale(-1, 1); }
    x.drawImage(img, sx, sy, sw, Math.min(sh, img.naturalHeight), 0, 0, TW, AREA);
    x.restore();
    const art = x.getImageData(0, 0, TW, AREA);
    const hm = heightMap(art.data, TW, AREA);
    const d = document.createElement('canvas'); d.width = TW; d.height = TH;
    const dx = d.getContext('2d'), out = dx.createImageData(TW, TH);
    for (let p = 0; p < TW * TH; p++) {
      const y = (p / TW) | 0, xx = p % TW;
      let v;
      if (y < AREA) v = hm[p];
      else { const k = (y - AREA) / PLINTH; v = 0.7 + 0.1 * Math.min(1, k * 4) * sstep(0, 6, Math.min(xx, TW - 1 - xx)); }   // the plinth is a raised block
      out.data[p * 4] = out.data[p * 4 + 1] = out.data[p * 4 + 2] = Math.round(v * 255); out.data[p * 4 + 3] = 255;
    }
    dx.putImageData(out, 0, 0);
    // plinth colour: dark stone, gold rule, the numeral and the relic mark
    const g = x.createLinearGradient(0, AREA, 0, TH); g.addColorStop(0, '#4a4034'); g.addColorStop(1, '#1b160f');
    x.fillStyle = g; x.fillRect(0, AREA, TW, PLINTH);
    x.fillStyle = '#d9b26a'; x.fillRect(0, AREA, TW, 2);
    x.font = '700 22px ui-monospace, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(ROMAN[i], TW / 2 + 14, AREA + PLINTH / 2 + 2);
    plinthPath(x, x, i, TW / 2 - 24, AREA + PLINTH / 2 + 1, 9); x.fill();
    const col = new THREE.CanvasTexture(c), dep = new THREE.CanvasTexture(d);
    col.minFilter = dep.minFilter = THREE.LinearFilter; col.generateMipmaps = dep.generateMipmaps = false;
    plates[i] = { col, dep };
  }
  function loadPlate(i) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => { try { buildPlate(i, img); } catch { /* one keeper missing, the rest stand */ } res(); };
      img.onerror = () => res();
      img.src = 'art/' + SRC[i][0] + '.webp';
    });
  }

  /* ---------------- shaders ---------------- */
  const VERT = `
    uniform sampler2D uDep; uniform float uAmp;
    varying vec2 vUv; varying vec3 vTx; varying vec3 vTy; varying vec3 vTz;
    void main(){
      vUv = uv;
      float d = texture2D(uDep, uv).r;
      vec3 p = position; p.z += (d - 0.35) * uAmp;
      vTx = normalize(normalMatrix * vec3(1.,0.,0.)); vTy = normalize(normalMatrix * vec3(0.,1.,0.)); vTz = normalize(normalMatrix * vec3(0.,0.,1.));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
    }`;
  const FRAG = `
    precision highp float;
    uniform sampler2D uCol, uDep, uGlyph;
    uniform vec2 uTex, uSize; uniform float uCell, uGlyphN, uCut, uT, uLift, uDim, uMix, uReveal, uSeed, uAscii;
    uniform vec3 uP1, uP2, uGold, uMag, uBg, uInk; uniform vec2 uTilt;
    varying vec2 vUv; varying vec3 vTx; varying vec3 vTy; varying vec3 vTz;
    float gEdge, gMag;
    float hgt(vec2 uv){ return texture2D(uDep, uv).r; }
    // the lit, graded stone colour at a texture position; also fills the edge and crystal masks
    vec4 shade(vec2 uv){
      vec3 src = texture2D(uCol, uv).rgb;
      float L0 = dot(src, vec3(.3,.59,.11));
      vec2 e = uTex;
      float dx = hgt(uv + vec2(e.x,0.)) - hgt(uv - vec2(e.x,0.));
      float dy = hgt(uv + vec2(0.,e.y)) - hgt(uv - vec2(0.,e.y));
      vec3 nO = normalize(vec3(-dx * 7., -dy * 7., 1.));
      vec3 n = normalize(nO.x * vTx + nO.y * vTy + nO.z * vTz);
      vec3 Ld = normalize(vec3(-.5 + uTilt.x * .7, .6 + uTilt.y * .5, .75));
      float breath = .9 + .1 * sin(uT * .9 + uSeed * 2.1);
      float diff = max(dot(n, Ld), 0.);
      float spec = pow(max(dot(n, normalize(Ld + vec3(0.,0.,1.))), 0.), 22.);
      float rim = pow(1. - max(n.z, 0.), 2.4);
      gEdge = smoothstep(.35, .9, length(vec2(dx, dy)) * 9.);
      // crystal and scar: strong magenta in the painting
      gMag = smoothstep(.28, .5, (src.r + src.b) * .5 - src.g * 1.15) * step(.55, src.r) * step(.5, src.b);
      float paint = pow(L0, .85);
      float lit = (.16 + diff * .95 * breath) * (.35 + 1.05 * paint) + spec * .35 * (.3 + paint);
      lit = pow(clamp(lit, 0., 1.), .95) * .92 * uDim * (1. + uLift * .35);
      vec3 stone = mix(uBg * 1.5, uInk, clamp(lit, 0., 1.));
      vec3 tint = mix(uP1, uP2, uMix);
      stone = mix(stone, stone * (.3 + tint * .95), .6);
      stone = mix(stone, vec3(dot(src, vec3(.33))) * tint * 1.4 + stone * .5, .18);     // a little of the painted colour survives
      stone += rim * mix(uP2, uGold, .35) * (.5 + .4 * uLift);
      stone += uMag * gMag * (1.7 + .45 * sin(uT * 1.7 + uSeed));
      return vec4(stone, clamp(lit, 0., 1.));
    }
    void main(){
      vec2 px = vUv * uSize;
      vec2 q = min(px, uSize - px);
      if (q.x + q.y < uCut) discard;                                        // cut corners, no round shapes
      vec2 fc = gl_FragCoord.xy / uCell;
      vec2 cellC = (floor(fc) + .5) * uCell;
      vec2 ddx = dFdx(vUv), ddy = dFdy(vUv);
      vec2 uvC = vUv + ddx * (cellC.x - gl_FragCoord.x) + ddy * (cellC.y - gl_FragCoord.y);
      vec4 smooth_ = shade(vUv); float eS = gEdge, mS = gMag;
      vec4 cellv = shade(uvC);   float eC = gEdge, mC = gMag;
      float L = cellv.a;
      // glyph: density follows luminance; edges and the crystal jump a few steps up
      float idx = floor(clamp(L * .9 + eC * .45 + mC * .5, 0., .999) * uGlyphN);
      vec2 loc = fract(fc);
      float cov = texture2D(uGlyph, vec2((idx + loc.x) / uGlyphN, loc.y)).r;
      // lit areas melt into smooth engraved stone; shadow, mids and every edge stay ASCII
      float a = clamp((1. - smoothstep(.16, .46, L)) * .9 + eC * 1.1 + mC, 0., 1.) * uAscii;
      vec3 gcol = mix(mix(uP1, uP2, uMix) * 1.25, mix(uGold, vec3(1.), .3), clamp(eC * 1.2, 0., 1.));
      gcol = mix(gcol, uMag * 1.6, mC);
      vec3 cellBg = smooth_.rgb * .42;
      vec3 ascii = mix(cellBg, gcol * (.55 + L * .9) * uDim, cov);
      vec3 col = mix(smooth_.rgb, ascii, a);
      // engraved frame: a thin gold bevel following the cut corners
      float fr = min(min(q.x, q.y), (q.x + q.y - uCut) * .7071);
      float line = 1. - smoothstep(1., 2.6, fr);
      col = mix(col, mix(uGold, uP1, .35) * (.55 + .5 * uLift), line * .85);
      float edgeFade = smoothstep(0., 1.2, fr);
      gl_FragColor = vec4(col * uReveal, edgeFade);
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
  const S = { el: null, cv: null, rnd: null, scene: null, cam: null, meshes: [], glyph: null, spots: [], rects: [], pan: 0, panMax: 0, tx: 0, ty: 0, ax: 0, ay: 0, hov: -1, lift: [], w: 0, h: 0,
    drag: null, suppress: false, wanted: false, raf: 0, t0: 0, last: 0, io: null, ro: null, bad: false, lost: false, legend: null, still: '', loading: null, cell: 6, bound: false, gyro: false };

  /* layout: two ranks (back and front) so ten keepers read large; on a narrow hall they are wider than the card and pan sideways */
  function layout() {
    const { w, h } = S, n = 10, narrow = w < 700;
    const pw = narrow ? w * 0.5 : w * 0.185, ph = pw * (TH / TW), pitch = narrow ? pw * 0.56 : w * 0.0865;
    const total = pitch * (n - 1) + pw, margin = narrow ? 0 : (w - (pitch * (n - 1) + pw)) / 2;
    S.panMax = Math.max(0, total - w);
    const rowDy = ph * 0.66, span = ph + rowDy, top0 = Math.max(6, (h - span) / 2);
    S.rects = [];
    for (let i = 0; i < n; i++) {
      const front = i % 2 === 1, sc = front ? 1 : 0.92;
      const cw = pw * sc, ch = ph * sc, left = margin + i * pitch + (pw - cw) / 2;
      S.rects.push({ x: left, y: top0 + (front ? rowDy : 0) + (ph - ch) / 2, w: cw, h: ch, front, sc });
    }
    S.cell = 5;
    S.pan = Math.max(-S.panMax, Math.min(0, S.pan));
    applyPan();
  }
  function applyPan() {
    S.spots.forEach((a, i) => {
      const r = S.rects[i]; if (!r) return;
      a.style.left = (r.x + S.pan) + 'px'; a.style.top = r.y + 'px'; a.style.width = r.w + 'px'; a.style.height = r.h + 'px';
    });
  }
  function placeMeshes() {
    S.meshes.forEach((m, i) => {
      const r = S.rects[i]; if (!r) return;
      const lift = S.lift[i] || 0;
      m.scale.setScalar(r.w / m.userData.pw * (1 + lift * 0.05));
      m.position.set(r.x + S.pan + r.w / 2 - S.w / 2, S.h / 2 - (r.y + r.h / 2) + lift * 9, (r.front ? 40 : 0) + lift * 45);
      m.rotation.y = S.ax * 0.3 + (i % 2 ? -0.03 : 0.03); m.rotation.x = -S.ay * 0.16;
      m.renderOrder = r.front ? 1 : 0;
      m.material.uniforms.uLift.value = lift;
    });
  }

  function buildScene() {
    const { w, h } = S, D = 1500;
    S.cam = new THREE.PerspectiveCamera(2 * Math.atan(h / 2 / D) * 180 / Math.PI, w / h, 100, 4000);
    S.cam.position.set(0, 0, D);
    S.scene = new THREE.Scene();
    S.glyph = glyphAtlas(10, 16);
    S.meshes = [];
    for (let i = 0; i < 10; i++) {
      const p = plates[i]; if (!p) continue;
      const pw = 100, ph = pw * (TH / TW);
      const U = {
        uCol: { value: p.col }, uDep: { value: p.dep }, uGlyph: { value: S.glyph }, uTex: { value: new THREE.Vector2(1 / TW, 1 / TH) }, uSize: { value: new THREE.Vector2(1, 1) },
        uCell: { value: 6 }, uGlyphN: { value: 10 }, uCut: { value: 14 }, uT: { value: 0 }, uLift: { value: 0 }, uDim: { value: i % 2 ? 1 : 0.8 }, uMix: { value: [0, 1, 0.5, 0.2, 0.8][i % 5] },
        uReveal: { value: 0 }, uSeed: { value: i }, uAscii: { value: 1 }, uAmp: { value: 0.16 * pw }, uTilt: { value: new THREE.Vector2() },
        uP1: { value: PAL.p1 }, uP2: { value: PAL.p2 }, uGold: { value: PAL.gold }, uMag: { value: PAL.mag }, uBg: { value: PAL.bg }, uInk: { value: PAL.ink },
      };
      const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: true });
      const geo = new THREE.PlaneGeometry(pw, ph, 96, 120);
      const m = new THREE.Mesh(geo, mat); m.userData.pw = pw; m.userData.i = i;
      S.scene.add(m); S.meshes[i] = m;
    }
    stats.statues = S.meshes.filter(Boolean).length;
    return stats.statues > 0;
  }
  function sizeUniforms() {   // pixel size of a plaque so the corner cut and frame stay a fixed few pixels
    S.meshes.forEach((m, i) => { const r = S.rects[i]; if (m && r) { m.material.uniforms.uSize.value.set(r.w, r.h); m.material.uniforms.uCut.value = Math.max(10, r.w * 0.085); m.material.uniforms.uCell.value = S.cell * (S.rnd ? S.rnd.getPixelRatio() : 1); } });
  }

  function measure() {
    if (!S.el) return;
    const b = S.el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    S.w = b.width; S.h = b.height;
    S.spots = [...S.el.querySelectorAll('.hof-spot')];
    if (S.rnd) S.rnd.setSize(S.w, S.h);
    if (S.cam) { S.cam.fov = 2 * Math.atan(S.h / 2 / 1500) * 180 / Math.PI; S.cam.aspect = S.w / S.h; S.cam.updateProjectionMatrix(); }
    layout(); sizeUniforms(); placeMeshes();
    if (S.rnd && S.scene) draw();
  }
  function draw() { if (S.rnd && S.scene && !S.lost) S.rnd.render(S.scene, S.cam); }

  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    if (!S.t0) S.t0 = now;
    const t = (now - S.t0) / 1000, dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now;
    readPal();
    const k = 1 - Math.exp(-dt * 6);
    S.ax += (S.tx - S.ax) * k; S.ay += (S.ty - S.ay) * k;
    S.meshes.forEach((m, i) => {
      const goal = i === S.hov ? 1 : 0;
      S.lift[i] = (S.lift[i] || 0) + (goal - (S.lift[i] || 0)) * (1 - Math.exp(-dt * 9));
      const u = m.material.uniforms;
      u.uT.value = t; u.uTilt.value.set(S.ax, S.ay);
      u.uReveal.value = Math.min(1, (now - S.t0) / 900);   // wall clock: a slow GPU still fades in on time
    });
    placeMeshes(); draw();
    stats.frames++;
    const ms = performance.now() - t0; stats.avgMs = stats.avgMs ? stats.avgMs * 0.9 + ms * 0.1 : ms;
  }
  function setRunning(v) {
    if (v && !S.raf && S.rnd && S.scene && !calm()) { S.last = 0; S.raf = requestAnimationFrame(frame); stats.running = true; }
    else if (!v && S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; stats.running = false; }
  }

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
  function hit(e) {   // front rank first: it is drawn on top
    const order = [...S.rects.keys()].sort((a, b) => (S.rects[b].front | 0) - (S.rects[a].front | 0));
    const r = S.el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const i of order) { const q = S.rects[i]; if (x >= q.x + S.pan && x <= q.x + S.pan + q.w && y >= q.y && y <= q.y + q.h) return i; }
    return -1;
  }
  function bind() {
    const el = S.el;
    el.addEventListener('click', (e) => {
      if (S.suppress) { S.suppress = false; e.preventDefault(); e.stopPropagation(); return; }
      const a = e.target.closest && e.target.closest('.hof-spot');
      if (!a) { closeLegend(); return; }
      e.preventDefault(); e.stopPropagation();
      const i = S.spots.indexOf(a); if (i >= 0) openLegend(i);
    });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      S.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)); S.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      S.hov = hit(e); stats.hover = S.hov;
      if (calm()) draw();
    });
    el.addEventListener('pointerdown', (e) => { S.hov = hit(e); stats.hover = S.hov; S.drag = { x: e.clientX, pan: S.pan, moved: false }; });   // touch has no hover: a press lifts the keeper
    el.addEventListener('pointerleave', () => { S.tx = 0; S.ty = 0; S.hov = -1; stats.hover = -1; });
    el.addEventListener('focusin', (e) => {
      const a = e.target.closest && e.target.closest('.hof-spot'); if (!a) return;
      S.hov = S.spots.indexOf(a); stats.hover = S.hov;
      const r = S.rects[S.hov]; if (r) { S.pan = Math.max(-S.panMax, Math.min(0, S.w / 2 - (r.x + r.w / 2))); applyPan(); }   // a keeper past the edge comes to the middle
      if (calm()) still(S.hov);
    });
    el.addEventListener('focusout', () => { S.hov = -1; stats.hover = -1; if (calm()) still(); });
    if (S.bound) return;
    S.bound = true;
    addEventListener('pointermove', (e) => {
      if (!S.drag || !S.el) return;
      const dx = e.clientX - S.drag.x;
      if (Math.abs(dx) > 8) S.drag.moved = true;
      if (S.drag.moved) { S.pan = Math.max(-S.panMax, Math.min(0, S.drag.pan + dx)); applyPan(); if (calm()) { placeMeshes(); draw(); } }
    }, { passive: true });
    const up = () => { if (!S.drag) return; if (S.drag.moved) { S.suppress = true; setTimeout(() => { S.suppress = false; }, 350); } S.drag = null; };
    addEventListener('pointerup', up, { passive: true }); addEventListener('pointercancel', () => { S.drag = null; }, { passive: true });
    addEventListener('deviceorientation', (e) => {   // a phone's own tilt turns the plaques; no permission prompt, silent where denied
      if (e.gamma == null || !S.el || calm()) return;
      S.tx = Math.max(-1, Math.min(1, e.gamma / 30)); S.ty = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 30));
    }, { passive: true });
  }

  /* ---------------- mount / still frame ---------------- */
  function still(lit = -1) {
    if (!S.rnd) return;
    S.meshes.forEach((m, i) => { m.material.uniforms.uReveal.value = 1; m.material.uniforms.uT.value = 2; S.lift[i] = i === lit ? 1 : 0; });
    S.tx = S.ty = S.ax = S.ay = 0; S.hov = lit; placeMeshes(); draw();
    try {
      S.still = S.rnd.domElement.toDataURL('image/png');
      const fb = S.el.querySelector('.hof-fallback');
      if (fb) { fb.src = S.still; fb.alt = 'The hall of the keepers: ten relief plaques of ape generals in ASCII-engraved stone.'; }
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
  async function mount(el) {
    if (S.bad || S.loading) return;
    const cv = document.createElement('canvas');
    cv.className = 'hf3'; cv.setAttribute('aria-hidden', 'true');
    const gl = cv.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
    if (!gl) { S.bad = true; return; }   // WebGL2 or the still picture
    const rnd = new THREE.WebGLRenderer({ canvas: cv, context: gl, antialias: true, alpha: true, preserveDrawingBuffer: true });
    rnd.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1)); rnd.setClearColor(0x000000, 0);
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.lost = true; setRunning(false); });
    cv.addEventListener('webglcontextrestored', () => { S.lost = false; setRunning(S.wanted); });
    S.cv = cv; S.rnd = rnd; S.el = el;
    el.insertBefore(cv, el.querySelector('.hof-spots') || null);
    const gen = ++S.gen;
    S.loading = (async () => {
      for (let i = 0; i < 10; i++) { if (!plates[i]) { await loadPlate(i); await new Promise((r) => setTimeout(r, 0)); } if (gen !== S.gen) return; }   // one keeper per tick, never one long task
    })();
    await S.loading; S.loading = null;
    if (gen !== S.gen || S.el !== el) return;
    readPal();
    bind(); measure();
    if (!buildScene()) { S.bad = true; destroy(); return; }
    stats.ready = true;
    measure(); watch(el); S.wanted = inView(el);
    applyCalm();
    if (!calm()) { draw(); setRunning(S.wanted); }
  }
  S.gen = 0;
  function destroy() {
    closeLegend(); setRunning(false);
    if (S.io) S.io.disconnect(); if (S.ro) S.ro.disconnect(); S.io = S.ro = null;
    S.meshes.forEach((m) => { if (m) { m.geometry.dispose(); m.material.dispose(); } });
    if (S.glyph) S.glyph.dispose();
    if (S.cv && S.cv.parentNode) S.cv.parentNode.removeChild(S.cv);
    if (S.rnd) S.rnd.dispose();
    Object.assign(S, { el: null, cv: null, rnd: null, scene: null, cam: null, meshes: [], glyph: null, spots: [], rects: [], lift: [], hov: -1, wanted: false, gen: S.gen + 1, loading: null });
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
