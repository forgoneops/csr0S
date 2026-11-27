/* Hall of Fame, alive (plan 8.12): the Credits card is a temple of the Caesar Evolved world.
   A colonnade, a mosaic floor, braziers and banners hold ten standing statues of the monkey generals,
   each a keeper of the hall with its own face, armour, crest, cloak, weapon and relic, and between them
   Caesar himself with his two marks: the burning scar through his left eye and the crystal on his breast. Hover lights a
   keeper and lifts its nameplate; pressing one opens its legend (epithet, relic, line) with the hand's
   own X page one step away. Built on the locally vendored three.js (r128, global THREE) over WebGL2, so
   it works offline. The clickable links never come from the scene: the real .hof-spot links stay on top.
   Reduced motion, Simple mode and a software renderer get a still frame of this same scene; without WebGL the
   temple backdrop and the named links remain. */
(() => {
  register({ id: 'hof3d', views: {} });
  const relief = () => true;   // hofrelief.js draws the hall instead
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // the registry test's stub
  /* From a focused keeper, in either style: previous, next, first, last. The style's own focusin brings it into view. */
  document.addEventListener('keydown', (e) => {
    const a = e.target.closest && e.target.closest('.hof-spot');
    if (!a || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const all = [...a.parentNode.querySelectorAll('.hof-spot')], i = all.indexOf(a);
    const to = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: all.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); e.stopPropagation();
    all[Math.max(0, Math.min(all.length - 1, to))].focus();
  });
  if (typeof THREE === 'undefined') return;    // vendor script missing: the still picture stays

  /* Colours come from the theme tokens (--p1 lead, --p2 answer, --gold, --tint-magenta) and are re-read when the palette
     changes, so a palette switch recolours the whole hall live. The literals are only the fallbacks for a page without the tokens. */
  const PAL = { p1: new THREE.Color(), p2: new THREE.Color(), gold: new THREE.Color(), mag: new THREE.Color(), bg: new THREE.Color(), ink: new THREE.Color(), key: '' };
  const WHITE = new THREE.Color(1, 1, 1);
  const tok = (n, d) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; } catch { return d; } };
  function readPal() {
    const v = [tok('--p1', '#aaa'), tok('--p2', '#aaa'), tok('--gold', '#aaa'), tok('--tint-magenta', '#aaa'), tok('--bg', '#090812'), tok('--ink', '#ddd')], key = v.join('|');
    if (key === PAL.key) return false;
    PAL.key = key; PAL.p1.set(v[0]); PAL.p2.set(v[1]); PAL.gold.set(v[2]); PAL.mag.set(v[3]); PAL.bg.set(v[4]); PAL.ink.set(v[5]);
    return true;
  }
  const hex = (c) => '#' + c.getHexString();
  let TINTS = [];
  /* T(obj, which, lighten): obj (a material or a light) follows palette colour `which`, lightened toward white */
  const T = (o, w, l = 0) => { TINTS.push({ o, w, l }); o.color.copy(PAL[w]).lerp(WHITE, l); return o; };
  const stats = { running: false, statues: 0, fine: 0, frames: 0, avgMs: 0, cpuMs: 0, tickMax: 0, hover: -1, ready: false, soft: false };

  const reduced = () => {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch { /* no matchMedia */ }
    const m = document.documentElement.dataset.motion;
    return m === 'off' || m === 'reduced';
  };
  const simple = () => document.documentElement.classList.contains('nx-simple');

  const S = { el: null, cv: null, gl: null, rnd: null, scene: null, cam: null, statues: [], flames: [], dust: null, frame: null, beam: null, shafts: null, halo: null, eyeGlow: null, legend: null,
    tx: 0, ty: 0, px: 0, py: 0, pan: 0, vel: 0, cf: -1, w: 0, h: 0, spots: null, drag: null, suppressClick: false, cz: 2.1, cx: 0, hov: -1, he: 0, t: 0, last: 0,
    gen: 0, dpr: 1, aspect: 1.7777, io: null, ro: null, dragBound: false, wanted: false, lost: false, bad: false, soft: false, warm: false, ready: false, raf: 0 };

  // the browser checks' handle: scene state, framerate, which keeper is lit
  window.HF3 = { shot: () => { try { draw(); return S.cv ? S.cv.toDataURL('image/png') : ''; } catch { return ''; } }, stats: () => ({ ...stats, avgMs: Math.round(stats.avgMs * 100) / 100, cpuMs: Math.round(stats.cpuMs * 100) / 100, ready: S.ready, keepers: S.statues.length, pan: Math.round(S.pan * 100) / 100 }) };

  /* In-world epithets for the ten keepers of the hall. They describe the statue, not the person; the X link is theirs. */
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

  /* The hall has one small material of its own: no scene lights, so it compiles fast and shades cheaply. A key from
     the upper right, Caesar's crystal pooling magenta on the dais and the wall, warm pools above the braziers, the
     light that follows the lit keeper, and a vault that falls into shadow. */
  const HALL_U = { uSpot: { value: new THREE.Vector4(0, 0.3, 0.45, 0) }, uBg: { value: new THREE.Color() } };
  const HALL_VS = 'varying vec3 vW, vN; varying vec2 vUv; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }';
  const HALL_FS = ['uniform sampler2D uMap; uniform vec2 uRep; uniform vec3 uCol, uBg, uP1, uMag, uGold; uniform float uMetal, uOp, uUseMap; uniform vec4 uSpot;',
    'varying vec3 vW, vN; varying vec2 vUv;', 'void main(){',
    '  vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), base = mix(uCol, texture2D(uMap, vUv * uRep).rgb, uUseMap);',
    '  float k = max(dot(N, vec3(0.57, 0.66, 0.49)), 0.0);',
    '  vec3 col = base * (0.5 + 0.1 * N.y + 0.62 * k * mix(vec3(1.0), uGold, 0.35));',
    '  vec3 g = vW - vec3(0.0, 0.5, -0.12); col += uMag * (0.1 + base * 0.7) * 0.34 / (1.0 + 11.0 * dot(g, g));',
    '  float warm = exp(-pow((vW.y - 0.12) * 3.4, 2.0)) * (0.55 + 0.45 * cos((vW.x - 0.17) * 10.134)) * step(0.42, abs(vW.x));',
    '  col += uP1 * (0.05 + base) * warm * 0.2;',
    '  vec3 sd = vW - uSpot.xyz; col += uP1 * (0.08 + base) * uSpot.w / (1.0 + 16.0 * dot(sd, sd));',
    '  vec3 V = normalize(cameraPosition - vW); col += uMetal * mix(base, uGold, 0.5) * (pow(max(dot(reflect(-V, N), vec3(0.57, 0.66, 0.49)), 0.0), 12.0) * 0.9 + smoothstep(0.2, 1.0, N.y) * 0.25);',
    '  col *= 1.0 - smoothstep(0.82, 1.5, vW.y) * 0.62;',
    '  col = mix(col, uBg, smoothstep(2.7, 5.6, distance(cameraPosition, vW)));',
    '  gl_FragColor = vec4(col, uOp);', '}'].join('\n');
  let WHITE_TEX = null;
  function hallMat(o = {}) {
    if (!WHITE_TEX) { WHITE_TEX = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); WHITE_TEX.needsUpdate = true; }
    const m = new THREE.ShaderMaterial({
      uniforms: { uSpot: HALL_U.uSpot, uBg: HALL_U.uBg, uP1: ASCII_U.uP1, uMag: ASCII_U.uMag, uGold: ASCII_U.uGold, uCol: { value: new THREE.Color() }, uMap: { value: o.map || WHITE_TEX },
        uRep: { value: new THREE.Vector2(...(o.rep || [1, 1])) }, uUseMap: { value: o.map ? 1 : 0 }, uMetal: { value: o.metal || 0 }, uOp: { value: o.op === undefined ? 1 : o.op } },
      vertexShader: HALL_VS, fragmentShader: HALL_FS, transparent: o.op !== undefined, side: o.side || THREE.FrontSide,
    });
    m.color = m.uniforms.uCol.value;   // recolour() paints it like any other material
    m.map = o.map || null;
    return m;
  }
  function stone(shade = 0.2) {
    const mat = hallMat(); mat.color.copy(PAL.bg).lerp(PAL.ink, shade);
    mat.userData.hfStone = shade;
    return mat;
  }
  const goldMat = () => { const m = hallMat({ metal: 1 }); m.color.copy(PAL.gold).multiplyScalar(0.5); m.userData.hfGold = true; return m; };

  /* ---------------- the temple ---------------- */
  function mosaicTex() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    const oct = (r, k = 0.42) => { x.beginPath(); [[-k, -1], [k, -1], [1, -k], [1, k], [k, 1], [-k, 1], [-1, k], [-1, -k]].forEach(([u, v], i) => x[i ? 'lineTo' : 'moveTo'](256 + u * r, 256 + v * r)); x.closePath(); };
    const paint = () => {
      x.fillStyle = hex(PAL.bg); x.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = hex(PAL.bg.clone().lerp(PAL.ink, 0.045 + ((i * 7 + j * 13) % 5) * 0.012 + ((i + j) & 1) * 0.04)); x.fillRect(i * 64 + 1, j * 64 + 1, 62, 62); }
      x.globalAlpha = 0.55; x.strokeStyle = hex(PAL.gold); x.lineWidth = 4; x.strokeRect(9, 9, 494, 494);
      x.lineWidth = 3; oct(150); x.stroke(); oct(120); x.stroke(); x.globalAlpha = 0.28; oct(196); x.stroke();
      x.globalAlpha = 1;
    };
    paint();
    const t = new THREE.CanvasTexture(c);
    t.hfPaint = paint;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }
  /* dressed stone for the wall: running courses of blocks with a lit upper lip, speckled, falling into shadow toward the vault */
  function ashlarTex() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    const paint = () => {
      let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      x.fillStyle = hex(PAL.bg); x.fillRect(0, 0, 512, 512);
      for (let r = 0; r < 8; r++) for (let k = -1; k < 4; k++) {
        const bx = k * 160 + (r % 2) * 80, by = r * 64;
        x.fillStyle = hex(PAL.bg.clone().lerp(PAL.ink, 0.1 + rnd() * 0.07)); x.fillRect(bx + 2, by + 2, 156, 60);
        x.fillStyle = hex(PAL.bg.clone().lerp(PAL.ink, 0.27)); x.fillRect(bx + 2, by + 2, 156, 1.5);
      }
      for (let k = 0; k < 5000; k++) { x.globalAlpha = 0.1 + rnd() * 0.25; x.fillStyle = hex(rnd() < 0.5 ? PAL.bg : PAL.ink.clone().lerp(PAL.bg, 0.6)); x.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 2); }
      x.globalAlpha = 1;
    };
    paint();
    const t = new THREE.CanvasTexture(c); t.hfPaint = paint; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function bannerTex(flip) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 384;
    const x = c.getContext('2d');
    const paint = () => {
    x.clearRect(0, 0, 128, 384); x.fillStyle = hex(PAL.bg.clone().lerp(PAL.p2, 0.18)); x.fillRect(0, 0, 128, 384);
    x.fillStyle = hex(PAL.bg); x.fillRect(0, 0, 128, 44);
    x.strokeStyle = hex(PAL.gold); x.lineWidth = 4; x.strokeRect(6, 6, 116, 372);
    x.fillStyle = hex(PAL.gold);
    x.beginPath(); x.moveTo(64, 120); x.lineTo(96, 190); x.lineTo(64, 260); x.lineTo(32, 190); x.closePath(); x.fill();
    x.fillStyle = hex(PAL.bg);
    x.beginPath(); x.moveTo(64, 150); x.lineTo(82, 190); x.lineTo(64, 230); x.lineTo(46, 190); x.closePath(); x.fill();
    x.fillStyle = hex(PAL.gold); x.font = '600 20px ui-monospace, monospace'; x.textAlign = 'center';
    x.fillText(flip ? 'S·P·Q·C' : 'LEGIO', 64, 330);
    };
    paint();
    const t = new THREE.CanvasTexture(c); t.hfPaint = paint;
    return t;
  }

  /* one fluted shaft, tapered with a slight swell: the flutes are in the geometry, so the light rakes them */
  function column(h = 1.5) {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(1, 1, h, 120, 8, true), P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), a = Math.atan2(z, x), t = P.getY(i) / h + 0.5;
      const r = (0.087 - 0.014 * t + 0.004 * Math.sin(Math.PI * t)) * (1 - 0.1 * Math.pow(Math.abs(Math.sin(a * 10)), 0.6));
      P.setX(i, Math.cos(a) * r); P.setZ(i, Math.sin(a) * r);
    }
    geo.computeVertexNormals();
    const body = new THREE.Mesh(geo, stone(0.27)); body.position.y = h / 2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.112, 0.055, 8), stone(0.2)); base.position.y = 0.0275;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), stone(0.3)); cap.position.y = h + 0.02;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.075, 0.05, 20), goldMat()); neck.position.y = h - 0.02;
    g.add(body, base, cap, neck);
    return g;
  }

  function brazier(big = 1) {
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * big, 0.032 * big, 0.03 * big, 10), stone(0.17));
    bowl.position.y = 0.09 * big;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * big, 0.02 * big, 0.09 * big, 8), stone(0.13));
    stem.position.y = 0.045 * big;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09 * big, 0.014 * big, 0.09 * big), stone(0.17));
    foot.position.y = 0.007 * big;
    const flameMat = T(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92 }), 'p1');
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.028 * big, 0.07 * big, 8), flameMat);
    flame.position.y = 0.14 * big; flame.userData.flame = flame;
    const glow = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: makeGlowTex(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), 'p1'));
    glow.scale.set(0.3 * big, 0.3 * big, 1); glow.position.y = 0.15 * big;
    const ghost = new THREE.Mesh(new THREE.ConeGeometry(0.018 * big, 0.05 * big, 6), T(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }), 'p1', 0.6));
    ghost.position.set(0.012 * big, 0.155 * big, 0.006 * big);
    g.add(foot, stem, bowl, flame, ghost, glow);
    g.userData.flame = flame; g.userData.glow = glow;
    return g;
  }

  function makeGlowTex() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(32, 32, 2, 32, 32, 28);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /* ---------------- the sculptor ----------------
     hofKernel() is self-contained: it runs inside an inline Blob worker (no build step) and, as a fallback, on
     the main thread at a coarse grid. It sculpts one ape general as a signed-distance field (smooth unions for
     flesh, near-sharp unions for armour, bevelled boxes, a folded drape, a faceted crystal), then polygonises it
     with Naive Surface Nets. The head and the two hands are separate, much finer grids (a nostril or a finger is
     thinner than one body voxel), merged into one mesh. Normals come from the field gradient; ambient occlusion
     and surface curvature (for the polished bevels) are baked per vertex by sampling the field. */
  function hofKernel() {
    const M_SKIN = 0, M_ARM = 1, M_CLOAK = 2, M_STONE = 3, M_CREST = 4, M_RELIC = 5, M_GLOW = 6, M_FUR = 7, M_GEM = 8;
    const CAESAR = 10;
    const SCAR = [
      [[0.0075, 0.037], [0.0135, 0.027], [0.0115, 0.019], [0.0185, 0.009], [0.0155, -0.002], [0.0215, -0.013], [0.0185, -0.023]],
      [[0.0205, 0.043], [0.025, 0.029], [0.0215, 0.021], [0.0285, 0.012], [0.026, 0.0], [0.033, -0.013], [0.03, -0.031]],
      [[0.033, 0.032], [0.0345, 0.022], [0.032, 0.016], [0.0385, 0.006], [0.0355, -0.004], [0.041, -0.014]],
    ];
    const POSES = [0, 1, 2, 3, 2, 0, 1, 3, 2, 0, 4], CRESTS = [0, 3, 1, 2, 3, 0, 2, 1, 0, 3, 3];
    const WIDTH = [1.04, 0.9, 0.98, 1.08], HEAD = [0.97, 1.04, 1.0, 0.95];

    /* each keeper's own face: brow weight and height, muzzle width and reach, jaw, nose, how far the lids fall, the pull of
       the mouth, ear size, beard length, moustache, cheek pads (the old bulls have them) and the lines of age */
    const face = (brow, browY, mw, ml, jaw, nose, lid, frown, ear, beard, tache, pads, age) => ({ brow, browY, mw, ml, jaw, nose, lid, frown, ear, beard, tache, pads, age });
    const FACES = [
      face(1.12, -0.001, 1.08, 0.001, 1.18, 1.06, 0.45, 1.1, 0.95, 0.7, 0, 0, 0),   // the Emberwright: broad and square
      face(0.86, 0.002, 0.88, -0.003, 0.84, 0.88, 0.2, 0.7, 1.12, 2.3, 0, 0, 1),   // the Weaver: narrow, long beard
      face(0.94, 0.001, 0.92, 0.007, 0.9, 0.94, 0.55, 0.9, 1.0, 0.45, 0, 0, 0),    // the Architect: long clean muzzle
      face(1.0, -0.002, 0.96, -0.002, 0.95, 1.0, 0.95, 1.25, 1.18, 1.6, 1, 0, 3),  // the Far-Sighted: old, heavy lids, moustache
      face(0.9, 0.0, 1.14, -0.004, 1.12, 1.12, 0.5, 0.45, 0.9, 0.9, 0, 1, 1),      // the Steward: round, cheek pads
      face(0.98, 0.0025, 0.86, 0.002, 0.86, 0.9, 0.8, 1.35, 1.15, 2.7, 1, 0, 3),   // the Chronicler: gaunt elder
      face(0.8, 0.003, 0.94, -0.006, 0.88, 0.92, 0.1, 0.6, 1.08, 0.3, 0, 0, 0),    // the Image-Smith: young, open eyes
      face(1.28, -0.003, 1.16, 0.003, 1.08, 1.26, 0.75, 1.3, 0.86, 1.0, 0, 0, 1),  // the Engine-Tender: massive brow
      face(1.18, -0.001, 1.1, 0.0, 1.2, 1.14, 0.6, 1.0, 0.88, 1.2, 0, 1, 2),       // the Builder: a bull with pads
      face(1.04, 0.001, 0.98, 0.004, 0.98, 0.98, 0.7, 1.5, 1.0, 1.8, 1, 0, 2),     // the Watcher: long whiskers
      face(1.08, -0.0015, 1.0, 0.002, 1.04, 1.02, 0.55, 1.15, 0.96, 0.8, 0, 0, 0), // Caesar
    ];
    const headScale = (i) => (i === CAESAR ? 1.06 : HEAD[i % 4]);
    function sculpt(i) {
      const parts = [], TAU = Math.PI * 2, caesar = i === CAESAR, b = i % 4, W = caesar ? 1.04 : WIDTH[b], HD = headScale(i);
      let L;
      const part = (res) => { L = []; parts.push({ res, L }); };
      const add = (t, m, k, o) => { o.t = t; o.m = m; o.k = k; o.st = o.st || 0; L.push(o); return o; };
      const E = (m, k, x, y, z, a, bb, c) => add(0, m, k, { x, y, z, a, b: bb, c });
      const Em = (m, k, x, y, z, a, bb, c) => { E(m, k, x, y, z, a, bb, c); E(m, k, -x, y, z, a, bb, c); };
      const C = (m, k, x0, y0, z0, x1, y1, z1, r0, r1) => add(1, m, k, { x: x0, y: y0, z: z0, x1, y1, z1, a: r0, b: r1 });
      const chain = (m, k, pts, r0, r1) => { const n = pts.length - 1, made = []; for (let j = 0; j < n; j++) made.push(C(m, k, pts[j][0], pts[j][1], pts[j][2], pts[j + 1][0], pts[j + 1][1], pts[j + 1][2], r0 + (r1 - r0) * j / n, r0 + (r1 - r0) * (j + 1) / n)); return made; };
      const B = (m, k, x, y, z, a, bb, c, rd) => add(2, m, k, { x, y, z, a, b: bb, c, r: rd });
      const T = (m, k, x, y, z, R, r) => add(3, m, k, { x, y, z, a: R, b: r });
      const DR = (m, k, o) => add(4, m, k, o);
      const GEM = (m, k, x, y, z, a, bb) => add(5, m, k, { x, y, z, a, b: bb });
      const stage = (n) => (o) => { for (const q of [].concat(o)) q.st = n; }, cut = stage(1), late = stage(2), etch = stage(3);   // order: add, carve, add detail, carve detail

      /* ---- body ---- */
      part(1);
      // plinth: two steps, a carved name band with a gold inlay, a fillet
      B(M_STONE, 0.001, 0, 0.012, 0, 0.118, 0.012, 0.102, 0.003); B(M_STONE, 0.001, 0, 0.036, 0, 0.1, 0.012, 0.087, 0.003);
      B(M_CREST, 0.0005, 0, 0.0495, 0, 0.104, 0.003, 0.091, 0.001);
      cut(B(M_STONE, 0.001, 0, 0.012, 0.102, 0.086, 0.0065, 0.004, 0.001));
      // feet with separate toes, sandals, calves, greaves with a knee cop and a raised shin ridge
      for (const s of [-1, 1]) {
        E(M_SKIN, 0.008, s * 0.034, 0.062, 0.016, 0.025, 0.014, 0.036); E(M_ARM, 0.001, s * 0.034, 0.0535, 0.018, 0.029, 0.004, 0.043);
        for (let j = -2; j <= 1; j++) E(M_SKIN, 0.0015, s * 0.034 + (j + 0.5) * 0.0105, 0.0605, 0.05, 0.0056, 0.0064, 0.012);
        C(M_SKIN, 0.014, s * 0.034, 0.066, 0.01, s * 0.038, 0.17, 0.006, 0.02, 0.027);
        C(M_ARM, 0.001, s * 0.034, 0.078, 0.018, s * 0.037, 0.138, 0.016, 0.022, 0.027);
        C(M_CREST, 0.001, s * 0.034, 0.08, 0.0405, s * 0.037, 0.135, 0.044, 0.0026, 0.0038);
        E(M_ARM, 0.0008, s * 0.037, 0.15, 0.033, 0.019, 0.015, 0.014); E(M_CREST, 0.0008, s * 0.037, 0.151, 0.047, 0.0065, 0.0065, 0.004);
        chain(M_CREST, 0.0006, [[s * 0.034 - 0.022, 0.078, 0.026], [s * 0.034, 0.077, 0.041], [s * 0.034 + 0.022, 0.078, 0.026]], 0.0032, 0.0032);
      }
      // pteruges: two rows of leather strips with gaps and studded gold tips, then the belt with rivets
      E(M_SKIN, 0.014, 0, 0.19, 0.0, 0.056 * W, 0.04, 0.044);
      for (let j = -5; j <= 5; j++) {
        const a = j * 0.3, x = Math.sin(a) * 0.072 * W, z = Math.cos(a) * 0.056 + 0.002, y1 = 0.162 + (j & 1) * 0.006;
        for (let q = 0; q < 4; q++) { const t = (q + 0.5) / 4; B(M_ARM, 0.0016, x * (1 + 0.15 * t), 0.216 + (y1 - 0.216) * t, z * (1 + 0.18 * t), 0.0082 * (0.55 + 0.45 * Math.abs(Math.cos(a))), 0.0078, 0.0048 + 0.0036 * Math.abs(Math.sin(a)), 0.0016); }   // a flat leather strap
        B(M_CREST, 0.0004, x * 1.165, y1 - 0.002, z * 1.2, 0.0066 * (0.55 + 0.45 * Math.abs(Math.cos(a))), 0.0042, 0.0056, 0.0012);
        const a2 = a + 0.15; C(M_ARM, 0.0004, Math.sin(a2) * 0.064 * W, 0.216, Math.cos(a2) * 0.05, Math.sin(a2) * 0.078 * W, 0.186, Math.cos(a2) * 0.062, 0.0062, 0.0068);
      }
      E(M_ARM, 0.001, 0, 0.222, 0.002, 0.073 * W, 0.0115, 0.057);
      for (let j = -5; j <= 5; j++) { const a = j * 0.27; E(M_CREST, 0.0005, Math.sin(a) * 0.073 * W, 0.222, Math.cos(a) * 0.057 + 0.002, 0.0042, 0.0042, 0.0042); }
      // torso: ribcage, then a muscle cuirass with sculpted pecs, sternum groove, six abdominals and gold trim
      E(M_ARM, 0.012, 0, 0.3, 0.004, 0.071 * W, 0.07, 0.05); E(M_ARM, 0.014, 0, 0.248, 0.002, 0.057 * W, 0.045, 0.044);
      Em(M_ARM, 0.01, 0.029 * W, 0.32, 0.027, 0.036, 0.027, 0.021);
      cut(C(M_ARM, 0.0025, 0, 0.345, 0.062, 0, 0.232, 0.052, 0.0032, 0.0032));
      for (let j = 0; j < 3; j++) {   // three overlapping girdle plates, each with a bright lower lip and a rivet at either end
        const y = 0.276 - j * 0.0172, w = (0.064 - j * 0.003) * W, z = 0.0535 - j * 0.0012;
        late(chain(M_ARM, 0.0004, [[-w, y, 0.016], [-w * 0.66, y, z - 0.012], [0, y, z], [w * 0.66, y, z - 0.012], [w, y, 0.016]], 0.0074, 0.0074));
        late(chain(M_CREST, 0.0003, [[-w, y - 0.0072, 0.019], [-w * 0.66, y - 0.0072, z - 0.0072], [0, y - 0.0072, z + 0.0052], [w * 0.66, y - 0.0072, z - 0.0072], [w, y - 0.0072, 0.019]], 0.0019, 0.0019));
        for (const s of [-1, 1]) late(E(M_CREST, 0.0004, s * w * 0.66, y + 0.001, z - 0.0048, 0.0034, 0.0034, 0.0034));
      }
      for (const s of [-1, 1]) late(chain(M_CREST, 0.0004, [[s * 0.062 * W, 0.347, 0.024], [s * 0.036 * W, 0.318, 0.0555], [0, 0.291, 0.0585]], 0.0023, 0.0023));   // a gold chevron falling to the girdle
      late(C(M_CREST, 0.0004, 0, 0.346, 0.055, 0, 0.292, 0.0585, 0.0021, 0.0021));
      chain(M_CREST, 0.0006, [[-0.052 * W, 0.358, 0.026], [-0.024, 0.349, 0.05], [0, 0.346, 0.056], [0.024, 0.349, 0.05], [0.052 * W, 0.358, 0.026]], 0.0036, 0.0036);
      E(M_ARM, 0.002, 0, 0.358, 0.01, 0.048, 0.012, 0.036);
      // shoulders: three overlapping lames, each with a groove under it and a gold lip, and a rivet boss
      Em(M_SKIN, 0.018, 0.086 * W, 0.343, 0, 0.032, 0.03, 0.034);
      for (const s of [-1, 1]) {
        for (let j = 0; j < 3; j++) {
          const x = s * (0.091 + j * 0.0075) * W, y = 0.368 - j * 0.0165, rx = 0.038 + j * 0.002, rz = 0.044 + j * 0.002;
          E(M_ARM, 0.0004, x, y, 0, rx, 0.0095, rz);
          chain(M_CREST, 0.0004, [[x - s * 0.012, y - 0.005, rz * 0.93], [x + s * rx * 0.68, y - 0.006, rz * 0.7], [x + s * rx * 0.98, y - 0.006, 0], [x + s * rx * 0.68, y - 0.006, -rz * 0.7]], 0.0027, 0.0027);
        }
        E(M_CREST, 0.0006, s * 0.094 * W, 0.378, 0.012, 0.0075, 0.005, 0.0075);
      }
      C(M_SKIN, 0.016, 0, 0.355, 0, 0, 0.39, 0.016, 0.033, 0.029);
      if (caesar) {
        // the trademark: a tall faceted crystal in a gold bezel, two laurel sprigs, a chain between two brooches
        cut(E(M_ARM, 0.002, 0, 0.309, 0.066, 0.017, 0.044, 0.01));
        late(GEM(M_GEM, 0.0002, 0, 0.309, 0.0705, 0.0172, 0.052));
        late(chain(M_CREST, 0.0003, [[0, 0.368, 0.06], [0.0215, 0.329, 0.064], [0.0215, 0.29, 0.063], [0, 0.251, 0.058], [-0.0215, 0.29, 0.063], [-0.0215, 0.329, 0.064], [0, 0.368, 0.06]], 0.0028, 0.0028));
        for (const s of [-1, 1]) {
          for (let j = 0; j < 5; j++) { const t = j / 4, x = s * (0.027 + 0.024 * t), y = 0.284 + 0.03 * t * t, z = 0.062 - 0.011 * t * t; C(M_CREST, 0.0005, x, y, z, x + s * 0.004, y + 0.016, z - 0.001, 0.0034, 0.0012); C(M_CREST, 0.0005, x, y, z, x + s * 0.014, y + 0.001, z - 0.004, 0.0032, 0.001); }
          E(M_CREST, 0.0006, s * 0.056, 0.352, 0.044, 0.0165, 0.0165, 0.0065); late(T(M_ARM, 0.0003, s * 0.056, 0.352, 0.0505, 0.0095, 0.0022)); late(E(M_CREST, 0.0005, s * 0.056, 0.352, 0.051, 0.0042, 0.0042, 0.004));
          for (let j = 1; j <= 5; j++) { const t = j / 6.4; late(E(M_CREST, 0.0003, s * 0.056 * (1 - t * 1.05), 0.348 - 0.016 * Math.sin(t * 2.2), 0.052 + 0.014 * Math.sin(t * 2.4), 0.0044, 0.0032, 0.003)); }
        }
      } else {
        E(M_CREST, 0.0008, 0, 0.322, 0.058, 0.0125, 0.0125, 0.0045); late(GEM(M_CREST, 0.0004, 0, 0.322, 0.0625, 0.0078, 0.0095));   // a faceted gold boss
      }
      // the cloak: gathered at the shoulders, falling in deepening folds; each keeper wears it a little differently
      const ck = caesar ? 0 : i % 3;
      DR(M_CLOAK, 0.004, { x: 0, y0: 0.372, y1: ck === 2 ? 0.17 : 0.062, w0: 0.095 * W, w1: (ck === 2 ? 0.118 : ck === 1 ? 0.12 : 0.142) * W, z0: -0.04, z1: -0.074, c: 0.0055, amp: caesar ? 0.017 : 0.0135, freq: 95 + (i % 4) * 9, ph: i * 1.7 });
      Em(M_CLOAK, 0.006, 0.062 * W, 0.372, -0.018, 0.03, 0.016, 0.03);
      if (ck === 1) { for (let j = 0; j < 4; j++) chain(M_CLOAK, 0.0022, [[-0.085 * W, 0.37 - j * 0.006, 0.024 + j * 0.004], [-0.04, 0.318 - j * 0.017, 0.062 + j * 0.0015], [0.012, 0.272 - j * 0.017, 0.06], [0.06 * W, 0.236 - j * 0.009, 0.044]], 0.0082, 0.0072); }
      if (caesar) for (const s of [-1, 1]) for (let j = 0; j < 3; j++) chain(M_CLOAK, 0.003, [[s * (0.058 + j * 0.012), 0.372 - j * 0.004, 0.03 - j * 0.016], [s * (0.104 + j * 0.012) * W, 0.33 - j * 0.014, 0.004 - j * 0.018], [s * (0.112 + j * 0.013), 0.22, -0.034 - j * 0.012], [s * (0.108 + j * 0.016), 0.075, -0.048 - j * 0.008]], 0.0115, 0.0135);
      // tail, curled up behind
      chain(M_FUR, 0.01, [[0, 0.16, -0.04], [0.04, 0.12, -0.092], [0.09, 0.115, -0.1], [0.124, 0.16, -0.095], [0.118, 0.19, -0.085]], 0.013, 0.006);

      // arms: deltoid, biceps, forearm and a ridged bracer, ending at the wrist; the hands are their own fine grids
      const hands = [];
      const arm = (sx, el, ha, kind) => {
        const s = sx * 0.088 * W;
        const wr = kind === 'wrap' ? [ha[0] + sx * 0.015, ha[1], ha[2] - 0.017] : [ha[0] + sx * 0.004, ha[1] - 0.012, ha[2] - 0.022];
        C(M_SKIN, 0.016, s, 0.343, 0, el[0], el[1], el[2], 0.023, 0.019); E(M_SKIN, 0.01, (s + el[0]) / 2 + sx * 0.004, (0.343 + el[1]) / 2 + 0.008, (el[2]) / 2 + 0.008, 0.021, 0.027, 0.021);
        C(M_SKIN, 0.012, el[0], el[1], el[2], wr[0], wr[1], wr[2], 0.019, 0.0135);
        const at = (t) => [el[0] + (wr[0] - el[0]) * t, el[1] + (wr[1] - el[1]) * t, el[2] + (wr[2] - el[2]) * t];
        const p0 = at(0.32), p1 = at(0.88);
        C(M_ARM, 0.001, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.0215, 0.017);
        for (const [t, r] of [[0.33, 0.0222], [0.86, 0.0181]]) { const q = at(t), q2 = at(t + 0.012); late(C(M_CREST, 0.0002, q[0], q[1], q[2], q2[0], q2[1], q2[2], r, r)); }
        hands.push({ sx, ha, kind, wr });
      };
      const pose = POSES[i];
      let rx, ry, rz;
      const pole = (x, z, y1) => { C(M_ARM, 0.0008, x, 0.05, z, x, y1, z, 0.0058, 0.0058); E(M_CREST, 0.001, x, 0.056, z, 0.009, 0.007, 0.009); };
      if (pose === 0) {
        arm(1, [0.118 * W, 0.262, 0.03], [0.098 * W, 0.288, 0.1], 'cradle'); [rx, ry, rz] = [0.098 * W, 0.297, 0.106];
        arm(-1, [-0.122 * W, 0.265, 0.02], [-0.112 * W, 0.222, 0.076], 'wrap');
        pole(-0.112 * W, 0.076, 0.6);
        GEM(M_ARM, 0.001, -0.112 * W, 0.63, 0.076, 0.013, 0.038); B(M_CREST, 0.0006, -0.112 * W, 0.592, 0.076, 0.018, 0.0035, 0.007, 0.0015); E(M_CREST, 0.001, -0.112 * W, 0.52, 0.076, 0.0115, 0.009, 0.0115);
      } else if (pose === 1) {
        arm(1, [0.128 * W, 0.34, 0.025], [0.112 * W, 0.428, 0.064], 'cradle'); [rx, ry, rz] = [0.112 * W, 0.437, 0.07];
        arm(-1, [-0.112 * W, 0.262, 0.03], [-0.082 * W, 0.236, 0.076], 'wrap');
        const sx = -0.082 * W, sy = 0.262;
        E(M_ARM, 0.001, sx, sy, 0.1, 0.044, 0.056, 0.0085); chain(M_CREST, 0.0004, Array.from({ length: 9 }, (_, j) => [sx + Math.cos(j * TAU / 8) * 0.0405, sy + Math.sin(j * TAU / 8) * 0.052, 0.106]), 0.0034, 0.0034);
        E(M_CREST, 0.001, sx, sy, 0.109, 0.0125, 0.0125, 0.0085);
        for (let j = 0; j < 8; j++) { const a = j * TAU / 8 + 0.39; late(C(M_CREST, 0.0004, sx + Math.cos(a) * 0.016, sy + Math.sin(a) * 0.019, 0.1085, sx + Math.cos(a) * 0.031, sy + Math.sin(a) * 0.04, 0.107, 0.0022, 0.0012)); }
      } else if (pose === 2) {
        arm(1, [0.112 * W, 0.258, 0.04], [0.025, 0.256, 0.106], 'cradle'); arm(-1, [-0.112 * W, 0.258, 0.04], [-0.025, 0.256, 0.106], 'cradle'); [rx, ry, rz] = [0, 0.268, 0.114];
        C(M_ARM, 0.001, -0.088 * W, 0.225, 0.03, -0.096 * W, 0.075, 0.07, 0.0085, 0.0045); E(M_CREST, 0.001, -0.088 * W, 0.24, 0.03, 0.011, 0.009, 0.011);
      } else if (pose === 3) {
        arm(1, [0.124 * W, 0.272, 0.025], [0.108 * W, 0.306, 0.07], 'wrap');
        pole(0.108 * W, 0.07, 0.56); T(M_CREST, 0.0008, 0.108 * W, 0.532, 0.07, 0.022, 0.0042); GEM(M_CREST, 0.001, 0.108 * W, 0.532, 0.07, 0.012, 0.022);
        DR(M_CLOAK, 0.001, { x: 0.108 * W + 0.027, y0: 0.505, y1: 0.43, w0: 0.022, w1: 0.024, z0: 0.07, z1: 0.07, c: 0.003, amp: 0.004, freq: 190, ph: i });
        arm(-1, [-0.118 * W, 0.262, 0.03], [-0.086 * W, 0.226, 0.092], 'cradle'); [rx, ry, rz] = [-0.086 * W, 0.235, 0.098];
      } else {   // Caesar: the right hand rests on a grounded staff with an eagle finial, the left holds the orb of the hall
        arm(-1, [-0.122 * W, 0.268, 0.022], [-0.118 * W, 0.262, 0.074], 'wrap');
        pole(-0.118 * W, 0.074, 0.55); GEM(M_CREST, 0.001, -0.118 * W, 0.575, 0.074, 0.013, 0.027);
        for (const s of [-1, 1]) for (let j = 0; j < 3; j++) C(M_CREST, 0.0006, -0.118 * W, 0.558, 0.074, -0.118 * W + s * (0.03 - j * 0.006), 0.58 - j * 0.012, 0.074, 0.0044, 0.0012);
        arm(1, [0.118 * W, 0.262, 0.03], [0.096 * W, 0.268, 0.098], 'cradle'); [rx, ry, rz] = [0.096 * W, 0.277, 0.104];
        E(M_CREST, 0.001, rx, ry + 0.017, rz, 0.018, 0.018, 0.018); late(T(M_ARM, 0.0003, rx, ry + 0.017, rz + 0.016, 0.0085, 0.0016));
      }
      // the relic of this keeper, in LEGENDS order: ember, staff, tablet, astrolabe, balance, chronicle, mirror, gear, hammer, lantern
      const R = M_RELIC, K = i, hx = rx, hyy = ry, hzz = rz;
      if (K === 0) { E(R, 0.008, hx, hyy + 0.018, hzz, 0.017, 0.017, 0.017); chain(R, 0.006, [[hx, hyy + 0.03, hzz], [hx + 0.006, hyy + 0.046, hzz], [hx - 0.002, hyy + 0.064, hzz]], 0.011, 0.002); C(R, 0.004, hx - 0.009, hyy + 0.024, hzz, hx - 0.014, hyy + 0.046, hzz, 0.007, 0.0015); }
      else if (K === 1) { C(M_ARM, 0.001, hx, hyy - 0.06, hzz, hx, hyy + 0.13, hzz, 0.0055, 0.0055); T(R, 0.001, hx, hyy + 0.146, hzz, 0.016, 0.0045); GEM(R, 0.001, hx, hyy + 0.146, hzz, 0.0085, 0.016); }
      else if (K === 2) { B(R, 0.001, hx, hyy + 0.026, hzz, 0.025, 0.031, 0.0055, 0.0015); for (let j = 0; j < 4; j++) cut(B(R, 0.0008, hx, hyy + 0.012 + j * 0.0095, hzz + 0.0065, 0.017 - (j % 2) * 0.004, 0.0019, 0.0035, 0.0008)); }
      else if (K === 3) { T(R, 0.001, hx, hyy + 0.034, hzz, 0.03, 0.0045); T(R, 0.001, hx, hyy + 0.034, hzz, 0.018, 0.0032); E(R, 0.002, hx, hyy + 0.034, hzz, 0.007, 0.007, 0.007); C(R, 0.001, hx - 0.028, hyy + 0.018, hzz, hx + 0.028, hyy + 0.05, hzz, 0.0028, 0.0028); }
      else if (K === 4) { C(M_CREST, 0.001, hx - 0.044, hyy + 0.06, hzz, hx + 0.044, hyy + 0.06, hzz, 0.004, 0.004); C(M_CREST, 0.001, hx, hyy, hzz, hx, hyy + 0.066, hzz, 0.0045, 0.0035); for (const s of [-1, 1]) { E(R, 0.001, hx + s * 0.044, hyy + 0.028, hzz, 0.018, 0.0042, 0.018); for (const q of [-1, 1]) C(M_ARM, 0.0006, hx + s * 0.044, hyy + 0.06, hzz, hx + s * 0.044 + q * 0.013, hyy + 0.03, hzz, 0.0019, 0.0019); } }
      else if (K === 5) { B(R, 0.001, hx, hyy + 0.026, hzz, 0.022, 0.029, 0.0095, 0.0015); B(M_ARM, 0.0006, hx - 0.022, hyy + 0.026, hzz, 0.005, 0.031, 0.012, 0.0015); for (const s of [-1, 1]) B(M_CREST, 0.0004, hx + 0.002, hyy + 0.026 + s * 0.022, hzz + 0.009, 0.022, 0.0028, 0.002, 0.0006); GEM(M_CREST, 0.0004, hx + 0.002, hyy + 0.026, hzz + 0.01, 0.007, 0.012); }
      else if (K === 6) { E(R, 0.002, hx, hyy + 0.045, hzz, 0.025, 0.031, 0.0042); chain(M_CREST, 0.0005, Array.from({ length: 11 }, (_, j) => [hx + Math.cos(j * TAU / 10) * 0.028, hyy + 0.045 + Math.sin(j * TAU / 10) * 0.034, hzz]), 0.0045, 0.0045); C(M_CREST, 0.001, hx, hyy, hzz, hx, hyy + 0.012, hzz, 0.0055, 0.0055); }
      else if (K === 7) { T(R, 0.001, hx, hyy + 0.038, hzz, 0.022, 0.0068); for (let j = 0; j < 8; j++) { const a = j * TAU / 8; C(R, 0.001, hx + Math.cos(a) * 0.024, hyy + 0.038 + Math.sin(a) * 0.024, hzz, hx + Math.cos(a) * 0.035, hyy + 0.038 + Math.sin(a) * 0.035, hzz, 0.0058, 0.0038); } B(R, 0.001, hx, hyy + 0.038, hzz, 0.024, 0.0035, 0.0035, 0.001); B(R, 0.001, hx, hyy + 0.038, hzz, 0.0035, 0.024, 0.0035, 0.001); E(M_CREST, 0.001, hx, hyy + 0.038, hzz, 0.009, 0.009, 0.009); }
      else if (K === 8) { C(M_ARM, 0.001, hx, hyy - 0.03, hzz, hx, hyy + 0.062, hzz, 0.0058, 0.0052); B(R, 0.001, hx, hyy + 0.066, hzz, 0.027, 0.0135, 0.0135, 0.002); for (const s of [-1, 1]) B(M_CREST, 0.0005, hx + s * 0.017, hyy + 0.066, hzz, 0.003, 0.0152, 0.0152, 0.001); }
      else if (K === 9) { B(M_ARM, 0.0006, hx, hyy + 0.012, hzz, 0.017, 0.0035, 0.017, 0.001); B(M_ARM, 0.0006, hx, hyy + 0.052, hzz, 0.018, 0.0035, 0.018, 0.001); E(R, 0.002, hx, hyy + 0.032, hzz, 0.012, 0.017, 0.012); for (const [u, v] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) C(M_ARM, 0.0005, hx + u * 0.0135, hyy + 0.012, hzz + v * 0.0135, hx + u * 0.0135, hyy + 0.052, hzz + v * 0.0135, 0.0023, 0.0023); GEM(M_CREST, 0.0008, hx, hyy + 0.065, hzz, 0.013, 0.014); T(M_ARM, 0.0006, hx, hyy + 0.083, hzz, 0.0065, 0.0019); }

      /* ---- hands: a palm, four three-jointed fingers with knuckles, and an opposed thumb ---- */
      for (const H of hands) {
        part(0.36);
        const { sx, ha, kind, wr } = H, P = (x, y, z) => [ha[0] + x, ha[1] + y, ha[2] + z];
        const mid = [(wr[0] + ha[0]) / 2, (wr[1] + ha[1]) / 2, (wr[2] + ha[2]) / 2];
        C(M_SKIN, 0.004, wr[0], wr[1], wr[2], mid[0], mid[1], mid[2], 0.0145, 0.0125);
        const finger = (pts, r) => { chain(M_SKIN, 0.0006, pts, r, r * 0.84); for (let j = 1; j < pts.length - 1; j++) E(M_SKIN, 0.0012, pts[j][0], pts[j][1], pts[j][2], r * 1.07, r * 1.02, r * 1.07); const e = pts[pts.length - 1]; late(E(M_ARM, 0.0006, e[0], e[1], e[2], r * 0.62, r * 0.62, r * 0.62)); };
        if (kind === 'wrap') {   // a fist round an upright shaft: four stacked fingers curl from the outside, over the front, to the inside
          const around = (th, y, r) => P(sx * Math.cos(th) * r, y, Math.sin(th) * r);
          C(M_SKIN, 0.004, ...around(-0.55, 0.012, 0.014), ...around(-0.55, -0.014, 0.013), 0.0105, 0.0095);
          C(M_SKIN, 0.004, mid[0], mid[1], mid[2], ...around(-0.7, 0, 0.015), 0.0125, 0.0115);
          for (let k = 0; k < 4; k++) { const y = 0.0165 - k * 0.011, r = 0.0125 - (k === 3 ? 0.0006 : 0); finger([around(-0.45, y, r), around(0.62, y, r + 0.0022), around(1.78, y - 0.001, r + 0.0008), around(2.72, y - 0.002, r - 0.0012)], k === 3 ? 0.0046 : 0.0053); }
          finger([around(-1.15, 0.006, 0.0145), around(-2.2, 0.021, 0.0148), around(-3.05, 0.025, 0.012), around(-3.65, 0.0245, 0.0105)], 0.0062);
        } else {   // an open palm under the relic, the fingers curling up in front of it
          E(M_SKIN, 0.004, ha[0], ha[1] - 0.0065, ha[2] - 0.002, 0.0215, 0.0085, 0.0165);
          C(M_SKIN, 0.004, mid[0], mid[1], mid[2], ha[0], ha[1] - 0.008, ha[2] - 0.006, 0.0125, 0.012);
          for (let k = 0; k < 4; k++) { const x = (k - 1.5) * 0.0112, len = k === 0 || k === 3 ? 0.86 : 1; finger([P(x * 0.92, -0.006, 0.008), P(x, -0.0065, 0.022 * len), P(x * 1.04, 0.004, 0.0285 * len), P(x * 1.05, 0.017 * len, 0.025 * len)], k === 0 || k === 3 ? 0.0047 : 0.0053); }
          finger([P(-sx * 0.016, -0.008, -0.008), P(-sx * 0.0285, -0.001, 0.002), P(-sx * 0.0285, 0.012, 0.012), P(-sx * 0.0225, 0.021, 0.015)], 0.0062);
        }
      }

      /* ---- head ---- */
      part(0.42);
      const hy = 0.428, hz = 0.026;
      const X = (v) => v * HD, Y = (v) => hy + v * HD, Z = (v) => hz + v * HD;
      const he = (m, k, x, y, z, a, bb, c) => E(m, k * HD, X(x), Y(y), Z(z), a * HD, bb * HD, c * HD);
      const hc = (m, k, p, q, r0, r1) => C(m, k * HD, X(p[0]), Y(p[1]), Z(p[2]), X(q[0]), Y(q[1]), Z(q[2]), r0 * HD, r1 * HD);
      const hch = (m, k, pts, r0, r1) => { const n = pts.length - 1; return pts.slice(1).map((q, j) => hc(m, k, pts[j], q, r0 + (r1 - r0) * j / n, r0 + (r1 - r0) * (j + 1) / n)); };
      const mir = (fn) => { fn(1); fn(-1); };
      const F = FACES[i], mw = F.mw, ml = F.ml;
      C(M_FUR, 0.012, 0, 0.362, -0.004, 0, 0.4, 0.014, 0.036, 0.031);   // thick neck
      he(M_FUR, 0.012, 0, 0.006, -0.008, 0.047, 0.049, 0.048);            // cranium
      he(M_SKIN, 0.008, 0, -0.006, 0.022, 0.037, 0.04, 0.033);            // face plane
      mir((s) => {
        he(M_SKIN, 0.007, s * 0.029, -0.009, 0.039, 0.014, 0.011, 0.0145);                                   // cheekbone
        const by = F.browY, br = F.brow;
        hch(M_SKIN, 0.007, [[0, 0.0178 + by, 0.058], [s * 0.013, 0.0238 + by, 0.0575], [s * 0.027, 0.0228 + by, 0.0508], [s * 0.039, 0.0116 + by, 0.036]], 0.0092 * br, 0.0067 * br);   // heavy brow ridge
        he(M_SKIN, 0.012, s * 0.016, 0.031 + by, 0.033, 0.021, 0.012 * br, 0.018);                          // the forehead running into it
        if (F.pads) { he(M_SKIN, 0.012, s * 0.047, -0.018, 0.024, 0.0155, 0.029, 0.0085); cut(hc(M_SKIN, 0.004, [s * 0.04, 0.004, 0.039], [s * 0.043, -0.034, 0.037], 0.0022, 0.002)); }
      });
      he(M_SKIN, 0.01, 0, 0.029 + F.browY, 0.04, 0.013, 0.0105, 0.0135);          // the middle of the forehead, up under the helmet
      he(M_SKIN, 0.008, 0, -0.032, 0.05 + ml, 0.031 * mw, 0.0215, 0.028);           // muzzle
      he(M_SKIN, 0.006, 0, -0.046, 0.03, 0.037 * F.jaw, 0.02, 0.032);             // jaw
      he(M_SKIN, 0.004, 0, -0.058, 0.056 + ml * 0.6, 0.019 * F.jaw, 0.0105, 0.015);          // chin
      mir((s) => cut(he(M_SKIN, 0.0035, s * 0.0178, 0.0065, 0.0585, 0.0128, 0.0092, 0.0135)));   // eye sockets, deep under the brow
      mir((s) => cut(hch(M_SKIN, 0.003, [[s * 0.004, 0.0335, 0.0545], [s * 0.016, 0.037, 0.0505], [s * 0.029, 0.034, 0.042]], 0.0013, 0.0012)));
      mir((s) => {
        late(he(M_SKIN, 0.0008, s * 0.0175, 0.0052, 0.0475, 0.0082, 0.0076, 0.0082));                  // eyeball
        late(hch(M_SKIN, 0.0012, [[s * 0.0075, 0.0056, 0.0525], [s * 0.014, 0.0116 - F.lid * 0.0033, 0.0558], [s * 0.0232, 0.0114 - F.lid * 0.0025, 0.0546], [s * 0.029, 0.006, 0.0495]], 0.0025 + F.lid * 0.0006, 0.0023));   // upper lid
        late(hch(M_SKIN, 0.0012, [[s * 0.008, 0.0022, 0.052], [s * 0.0172, -0.003, 0.0536], [s * 0.028, 0.0022, 0.0495]], 0.0019, 0.0018));   // lower lid
        late(he(M_SKIN, 0.0003, s * 0.017, 0.0052, 0.0538, 0.0047, 0.0047, 0.0027));              // the iris dome, painted by the shader
        cut(hch(M_SKIN, 0.0025, [[s * 0.009, -0.0035, 0.0615], [s * 0.022, -0.007, 0.057], [s * 0.032, -0.0015, 0.047]], 0.0016, 0.0012));   // under-eye furrow
      });
      const nw = F.nose, fr = F.frown;
      late(hc(M_SKIN, 0.0035, [0, 0.0145, 0.0595], [0, -0.0125, 0.0725 + ml], 0.0055, 0.0068 * nw));   // nose bridge
      late(he(M_SKIN, 0.004, 0, -0.0175, 0.0722 + ml, 0.0155 * nw, 0.0095, 0.0105));                     // broad nose pad
      mir((s) => {
        late(he(M_SKIN, 0.0022, s * 0.0128 * nw, -0.0205, 0.0716 + ml, 0.0075 * nw, 0.0068, 0.0082));                              // flared wing
        etch(hc(M_SKIN, 0.0009, [s * 0.0062 * nw, -0.0195, 0.0832 + ml], [s * 0.0128 * nw, -0.023, 0.0786 + ml], 0.0034 * nw, 0.0037 * nw));       // nostril
        etch(hch(M_SKIN, 0.0022, [[s * 0.0175 * nw, -0.012, 0.0735 + ml], [s * 0.026 * mw, -0.024, 0.07 + ml], [s * 0.0295 * mw, -0.0365, 0.0625 + ml], [s * 0.029 * mw, -0.047, 0.057 + ml]], 0.0026, 0.0019));   // nasolabial fold
        etch(hch(M_SKIN, 0.0016, [[0, -0.0415, 0.0795 + ml], [s * 0.012 * mw, -0.0418, 0.0765 + ml], [s * 0.022 * mw, -0.0415 - 0.0035 * fr, 0.069 + ml], [s * 0.028 * mw, -0.0425 - 0.009 * fr, 0.058 + ml]], 0.0027, 0.0019));        // mouth
        hch(M_SKIN, 0.0022, [[0, -0.0368, 0.0762 + ml], [s * 0.012 * mw, -0.0372, 0.0738 + ml], [s * 0.0225 * mw, -0.0378 - 0.0027 * fr, 0.0668 + ml]], 0.0036, 0.0027);   // upper lip
        late(hch(M_SKIN, 0.0018, [[0, -0.0478, 0.073 + ml], [s * 0.011 * mw, -0.0482 - 0.0003 * fr, 0.0708 + ml], [s * 0.02 * mw, -0.049 - 0.0025 * fr, 0.0635 + ml]], 0.0042, 0.0028));   // lower lip
        if (F.tache) for (let j = 0; j < 3; j++) late(hch(M_FUR, 0.002, [[s * 0.003, -0.0295 - j * 0.002, 0.0805 + ml], [s * (0.022 + j * 0.002) * mw, -0.035 - j * 0.003, 0.072 + ml - j * 0.002], [s * (0.034 + j * 0.003), -0.055 - j * 0.006, 0.056 - j * 0.003], [s * (0.036 + j * 0.004), -0.074 - j * 0.008, 0.052 - j * 0.004]], 0.004, 0.0012));
        for (let j = 0; j < F.age; j++) {                                                                      // crow's feet and cheek lines
          etch(hc(M_SKIN, 0.0008, [s * 0.0305, 0.006 - j * 0.005, 0.0505], [s * 0.043, 0.008 - j * 0.008, 0.036], 0.0014, 0.001));
          etch(hc(M_SKIN, 0.001, [s * (0.012 + j * 0.004), -0.0085 - j * 0.0045, 0.066], [s * (0.033 + j * 0.002), -0.016 - j * 0.006, 0.052], 0.0013, 0.001));
        }
      });
      if (F.age > 1) etch(hch(M_SKIN, 0.001, [[-0.026, 0.0375, 0.047], [0, 0.0395, 0.0535], [0.026, 0.0375, 0.047]], 0.0015, 0.0015));
      etch(hc(M_SKIN, 0.001, [0, -0.0268, 0.0808 + ml], [0, -0.0355, 0.0795 + ml], 0.0014, 0.0017));   // philtrum
      etch(hc(M_SKIN, 0.0008, [0, -0.0105, 0.0826 + ml], [0, -0.0165, 0.0835 + ml], 0.0009, 0.0011));   // nose midline
      // ears: a rolled outer rim round a hollow bowl, turned half toward the front, and the tragus
      mir((s) => {
        const e = F.ear, at = (o, v, d) => [s * (0.056 * Math.max(1, F.jaw * 0.97) + o * 0.86 * e + d * 0.5), 0.002 + v * e, -0.003 - o * 0.5 * e + d * 0.86];
        const ring = []; for (let j = 0; j <= 10; j++) { const a = -2.25 + j * 0.45; ring.push(at(0.004 + Math.cos(a) * 0.0135, Math.sin(a) * 0.0225, 0.002)); }
        hc(M_SKIN, 0.004, [s * 0.043, 0, 0], at(0.002, 0, -0.002), 0.01, 0.008);
        he(M_SKIN, 0.003, ...at(0.004, 0.001, -0.0035), 0.0125 * e, 0.019 * e, 0.006);
        hch(M_SKIN, 0.0014, ring, 0.0045, 0.0036);
        cut(he(M_SKIN, 0.0016, ...at(0.0045, 0.002, 0.0045), 0.0085 * e, 0.0135 * e, 0.0065));
        late(hch(M_SKIN, 0.0014, [at(-0.006, -0.009, 0.001), at(0.001, -0.001, 0.0005), at(0.0045, 0.009, -0.001)], 0.0034, 0.002));
      });
      // fur: carved locks. A lock is a tapered stroke laid on the skull, swept back and down.
      const lock = (x, y, z, dx, dy, dz, r) => hch(M_FUR, 0.0036, [[x, y, z], [x + dx * 0.55 + dz * 0.16, y + dy * 0.55, z + dz * 0.55], [x + dx, y + dy, z + dz]], r, 0.0022);
      mir((s) => {
        for (let j = 0; j < 8; j++) { const t = j / 7, a = -0.25 - t * 1.28, x = s * Math.cos(a) * 0.045 * F.jaw * (1 - 0.25 * t * t), y = -0.002 + Math.sin(a) * 0.052, g = 0.55 + F.beard * 0.5 * t; lock(x, y, 0.014 + 0.026 * t, s * 0.012 * (1 - t), -0.016 * g, -0.008, 0.0068); lock(x * 0.96, y + 0.004, 0.002 + 0.022 * t, s * 0.015 * (1 - t), -0.012 * g, -0.012, 0.0062); }   // beard ruff along the jaw
        for (let j = 0; j < 4; j++) lock(s * (0.044 - j * 0.002), 0.012 + j * 0.008, 0.024 - j * 0.003, s * 0.006, -0.014, -0.016, 0.0058);   // temples
      });
      for (let j = -3; j <= 3; j++) lock(j * 0.0062, -0.063 - (3 - Math.abs(j)) * 0.001, 0.052 + ml * 0.5 - j * j * 0.0016, j * 0.0014, -0.012 * F.beard * (1 - Math.abs(j) * 0.16), -0.002, 0.0054);
      const cs = CRESTS[i];
      if (cs < 3) {   // a fitted helmet: dome, gold brim, a nape guard, and one of three crests
        he(M_ARM, 0.001, 0, 0.0385, -0.004, 0.0535, 0.0325, 0.059);
        he(M_ARM, 0.002, 0, 0.002, -0.048, 0.047, 0.027, 0.015);
        mir((s) => late(hch(M_CREST, 0.0007, [[0, 0.0385, 0.0558], [s * 0.025, 0.0355, 0.048], [s * 0.045, 0.029, 0.022], [s * 0.052, 0.024, -0.012], [s * 0.043, 0.02, -0.04], [0, 0.017, -0.062]], 0.0038, 0.0036)));
        mir((s) => late(hch(M_ARM, 0.0006, [[s * 0.047, 0.022, 0.022], [s * 0.051, -0.002, 0.026], [s * 0.044, -0.024, 0.034]], 0.0062, 0.0036)));   // cheek guards
        mir((s) => he(M_CREST, 0.0007, s * 0.049, 0.036, 0.001, 0.0058, 0.0075, 0.0075));
        if (cs === 0) { for (let j = 0; j < 17; j++) { const t = j / 16, z = 0.036 - 0.094 * t, y = 0.0665 - 0.028 * Math.pow(Math.abs(t - 0.4) * 1.5, 2); hc(M_CREST, 0.0004, [0, y - 0.006, z], [0, y + 0.021 + 0.006 * Math.sin(Math.PI * t), z - 0.006 - 0.008 * t], 0.0034, 0.0017); } hch(M_ARM, 0.001, [[0, 0.062, 0.034], [0, 0.072, -0.008], [0, 0.056, -0.05]], 0.006, 0.006); }
        else if (cs === 1) { for (let j = -8; j <= 8; j++) { const a = j * 0.115; hc(M_CREST, 0.0004, [Math.sin(a) * 0.05, 0.034 + Math.cos(a) * 0.032, -0.006], [Math.sin(a) * 0.083, 0.034 + Math.cos(a) * 0.062, -0.012], 0.0036, 0.0017); } hch(M_ARM, 0.001, [[-0.042, 0.054, -0.006], [-0.022, 0.067, -0.006], [0, 0.071, -0.006], [0.022, 0.067, -0.006], [0.042, 0.054, -0.006]], 0.0055, 0.0055); }
        else { for (let j = 0; j < 9; j++) { const t = j / 8, x = (j % 3 - 1) * 0.006; hch(M_CREST, 0.001, [[x * 0.4, 0.066, 0.02 - t * 0.032], [x, 0.092 - t * 0.012, -0.012 - t * 0.05], [x * 1.6, 0.078 - t * 0.038, -0.05 - t * 0.048]], 0.0056, 0.0014); } E(M_CREST, 0.001, 0, Y(0.067), Z(0.012), 0.008 * HD, 0.007 * HD, 0.008 * HD); }
      } else {   // bare head: swept locks over the crown, then the laurel: paired pointed leaves meeting over the brow
        for (let j = 0; j < 46; j++) { const t = (j + 0.5) / 46, el = 0.28 + 1.22 * t, az = j * 2.39996, x = Math.cos(el) * Math.sin(az) * 0.0452, y = 0.005 + Math.sin(el) * 0.0465, z = -0.008 + Math.cos(el) * Math.cos(az) * 0.046; if (z > 0.026 && y < 0.036) continue; lock(x * 0.96, y - 0.003, z + 0.003, x * 0.2, -0.019, -0.027, 0.0058); }
        for (let j = -3; j <= 3; j++) lock(j * 0.0085, 0.043 - j * j * 0.0007, 0.032 - j * j * 0.0018, j * 0.006, 0.0045, -0.026, 0.0052);   // the forelock, swept back
        mir((s) => {
          const at = (t) => { const a = 0.16 + t * 2.35; return [s * Math.sin(a) * 0.0535, 0.034 - 0.017 * t, -0.002 + Math.cos(a) * 0.0545]; };
          for (let j = 0; j < 9; j++) {
            const p0 = at(j / 9), p1 = at((j + 1.75) / 9), out = 1.045;
            for (const up of [1, -0.62]) { const q = [p1[0] * out, p1[1] + 0.0105 * up, p1[2] * out], m = [(p0[0] + q[0]) / 2 * 1.035, (p0[1] + q[1]) / 2 + 0.0034 * up, (p0[2] + q[2]) / 2 * 1.035]; hc(M_CREST, 0.0003, p0, m, 0.0012, 0.0034); hc(M_CREST, 0.0003, m, q, 0.0034, 0.0005); }
          }
          hch(M_CREST, 0.0006, [at(0), at(0.25), at(0.5), at(0.75), at(1)], 0.0021, 0.0021);
        });
        if (!caesar) late(he(M_CREST, 0.0008, 0, 0.0345, 0.0525, 0.0062, 0.008, 0.0045));
      }
      // the scar: three jagged cuts running through Caesar's left eye, brow to cheek
      const scar = !caesar ? null : SCAR.map(p => p.map(q => [X(q[0]), Y(q[1])]));
      parts[parts.length - 1].scar = scar && { lines: scar, z: Z(0.026), w: 0.0024 * HD };

      for (const p of parts) p.L.sort((p, q) => p.st - q.st);
      return parts;
    }

    function sd(p, x, y, z) {
      const dx = x - p.x, dy = y - p.y, dz = z - p.z;
      switch (p.t) {
        case 0: { const ux = dx / p.a, uy = dy / p.b, uz = dz / p.c, k0 = Math.sqrt(ux * ux + uy * uy + uz * uz); if (k0 < 1e-5) return -Math.min(p.a, p.b, p.c);
          const vx = ux / p.a, vy = uy / p.b, vz = uz / p.c; return k0 * (k0 - 1) / Math.sqrt(vx * vx + vy * vy + vz * vz); }
        case 1: { const bx = p.x1 - p.x, by = p.y1 - p.y, bz = p.z1 - p.z;
          const t = Math.max(0, Math.min(1, (dx * bx + dy * by + dz * bz) / (bx * bx + by * by + bz * bz)));
          const ex = dx - bx * t, ey = dy - by * t, ez = dz - bz * t; return Math.sqrt(ex * ex + ey * ey + ez * ez) - (p.a + (p.b - p.a) * t); }
        case 2: { const qx = Math.abs(dx) - p.a + p.r, qy = Math.abs(dy) - p.b + p.r, qz = Math.abs(dz) - p.c + p.r;
          const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0); return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - p.r; }
        case 3: { const w = Math.sqrt(dx * dx + dy * dy) - p.a; return Math.sqrt(w * w + dz * dz) - p.b; }
        case 4: {   // a hanging drape: a thin sheet whose folds deepen and spread toward a scalloped hem, edges wrapping forward
          const t = Math.max(0, Math.min(1, (p.y0 - y) / (p.y0 - p.y1))), w = p.w0 + (p.w1 - p.w0) * Math.pow(t, 0.65), u = dx / w;
          const ph = dx * p.freq * (1.15 - 0.3 * t) + Math.sin(t * 3.1 + p.ph) * 0.9 + p.ph, s = Math.sin(ph), fold = (1 - 2 * Math.sqrt(s * s + 0.03)) * 0.8 + 0.34 * Math.sin(ph * 2.3 + t * 5);
          const zs = p.z0 + (p.z1 - p.z0) * t + 0.03 * u * u * u * u + p.amp * (0.25 + 0.75 * t) * fold;
          return Math.max((Math.abs(z - zs) - p.c) * 0.62, Math.abs(dx) - w, y - p.y0, p.y1 + p.amp * 0.5 * (1 + Math.sin(ph + 1)) - y); }
        default: {   // a hexagonal bipyramid: the faceted crystal
          const ax = Math.abs(dx), az = Math.abs(dz) * 1.35, r = Math.max(ax * 0.866 + az * 0.5, az);
          return (r / p.a + Math.abs(dy) / p.b - 1) / Math.sqrt(1 / (p.a * p.a) + 1 / (p.b * p.b)); }
      }
    }
    function bounds(p) {
      if (p.t === 1) { const m = Math.max(p.a, p.b); return [[Math.min(p.x, p.x1) - m, Math.max(p.x, p.x1) + m], [Math.min(p.y, p.y1) - m, Math.max(p.y, p.y1) + m], [Math.min(p.z, p.z1) - m, Math.max(p.z, p.z1) + m]]; }
      if (p.t === 4) { const g = p.amp * 1.2 + p.c; return [[p.x - p.w1, p.x + p.w1], [p.y1, p.y0], [Math.min(p.z0, p.z1) - g, Math.max(p.z0, p.z1) + g + 0.03]]; }
      const r = p.t === 3 ? [p.a + p.b, p.a + p.b, p.b] : p.t === 5 ? [p.a * 1.2, p.b, p.a] : [p.a, p.b, p.c];
      return [[p.x - r[0], p.x + r[0]], [p.y - r[1], p.y + r[1]], [p.z - r[2], p.z + r[2]]];
    }

    function polygonise(part, h, out) {
      const L = part.L;
      // adaptive bounds: the grid covers exactly the union of the primitives, so a thin keeper wastes nothing
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      const bb = L.map(p => { const b = bounds(p); if (p.st !== 1 && p.st !== 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], b[a][0] - p.k); hi[a] = Math.max(hi[a], b[a][1] + p.k); } return b; });
      const o = lo.map(v => v - 3 * h), dim = hi.map((v, a) => Math.ceil((v + 3 * h - o[a]) / h) + 1), nx = dim[0], ny = dim[1], nz = dim[2];
      const N = nx * ny * nz, F = new Float32Array(N).fill(1), Mt = new Uint8Array(N), sy = nx, sz = nx * ny;
      for (let q = 0; q < L.length; q++) {
        const p = L[q], bq = bb[q], sub = p.st === 1 || p.st === 3, kk = Math.max(p.k, 1e-5), mg = p.k + 2 * h, a0 = [], a1 = [];
        for (let a = 0; a < 3; a++) { a0[a] = Math.max(1, Math.floor((bq[a][0] - mg - o[a]) / h)); a1[a] = Math.min(dim[a] - 2, Math.ceil((bq[a][1] + mg - o[a]) / h)); }
        for (let k = a0[2]; k <= a1[2]; k++) for (let j = a0[1]; j <= a1[1]; j++) for (let ii = a0[0]; ii <= a1[0]; ii++) {
          const n = ii + sy * j + sz * k, f = F[n];
          if (sub ? f > mg : f < -mg) continue;   // already far outside (for a carve) or deep inside (for an add): nothing can change the surface
          const d = sd(p, o[0] + ii * h, o[1] + j * h, o[2] + k * h);
          if (sub) { const t = Math.max(kk - Math.abs(f + d), 0) / kk; F[n] = Math.max(f, -d) + t * t * kk * 0.25; }
          else { if (d < f) Mt[n] = p.m; const t = Math.max(kk - Math.abs(f - d), 0) / kk; F[n] = Math.min(f, d) - t * t * kk * 0.25; }
        }
      }
      // Naive Surface Nets
      const vid = new Int32Array(N).fill(-1), pos = [], mat = [], base = out.pos.length / 3;
      const CO = [0, 1, sy, sy + 1, sz, sz + 1, sz + sy, sz + sy + 1], CX = [0, 1, 0, 1, 0, 1, 0, 1], CY = [0, 0, 1, 1, 0, 0, 1, 1], CZ = [0, 0, 0, 0, 1, 1, 1, 1];
      const ED = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7], f8 = new Float32Array(8);
      for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let ii = 0; ii < nx - 1; ii++) {
        const n = ii + sy * j + sz * k, in0 = F[n] < 0;
        if ((F[n + 1] < 0) === in0 && (F[n + sy] < 0) === in0 && (F[n + sy + 1] < 0) === in0 && (F[n + sz] < 0) === in0 && (F[n + sz + 1] < 0) === in0 && (F[n + sz + sy] < 0) === in0 && (F[n + sz + sy + 1] < 0) === in0) continue;   // almost every cell: no surface here
        let low = 1e9, lc = 0;
        for (let c = 0; c < 8; c++) { const v = F[n + CO[c]]; f8[c] = v; if (v < low) { low = v; lc = c; } }
        let ax = 0, ay = 0, az = 0, cnt = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = ED[e], b2 = ED[e + 1]; if ((f8[a] < 0) === (f8[b2] < 0)) continue;
          const t = f8[a] / (f8[a] - f8[b2]);
          ax += CX[a] + (CX[b2] - CX[a]) * t; ay += CY[a] + (CY[b2] - CY[a]) * t; az += CZ[a] + (CZ[b2] - CZ[a]) * t; cnt++;
        }
        vid[n] = pos.length / 3;
        pos.push(o[0] + (ii + ax / cnt) * h, o[1] + (j + ay / cnt) * h, o[2] + (k + az / cnt) * h); mat.push(Mt[n + CO[lc]]);
      }
      const st = [1, sy, sz];
      for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let ii = 1; ii < nx - 1; ii++) {
        const n = ii + sy * j + sz * k;
        if (vid[n] < 0) continue;   // an edge from this corner can only cross when its own cell holds a vertex
        for (let a = 0; a < 3; a++) {
          const in0 = F[n] < 0; if (in0 === F[n + st[a]] < 0) continue;
          const eu = st[(a + 1) % 3], ev = st[(a + 2) % 3];
          const q0 = vid[n - eu - ev], q1 = vid[n - ev], q2 = vid[n], q3 = vid[n - eu];
          if (q0 < 0 || q1 < 0 || q2 < 0 || q3 < 0) continue;
          if (in0) out.idx.push(base + q0, base + q1, base + q2, base + q0, base + q2, base + q3); else out.idx.push(base + q0, base + q2, base + q1, base + q0, base + q3, base + q2);
        }
      }
      // per vertex: normal from the field gradient, ambient occlusion along the normal, curvature for the polished edges
      const fs = (x, y, z) => {
        const fx = (x - o[0]) / h, fy = (y - o[1]) / h, fz = (z - o[2]) / h;
        if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return 1;
        const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), tx = fx - ix, ty = fy - iy, tz = fz - iz, n = ix + sy * iy + sz * iz;
        const c00 = F[n] * (1 - tx) + F[n + 1] * tx, c10 = F[n + sy] * (1 - tx) + F[n + sy + 1] * tx, c01 = F[n + sz] * (1 - tx) + F[n + sz + 1] * tx, c11 = F[n + sz + sy] * (1 - tx) + F[n + sz + sy + 1] * tx;
        return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
      };
      const AD = [0.0035, 0.0075, 0.013, 0.022, 0.036], AW = [0.3, 0.27, 0.21, 0.13, 0.09], sc = part.scar;
      for (let v = 0; v < pos.length / 3; v++) {
        let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        const m = mat[v];
        const e = h * 0.9;
        let gx = fs(x + e, y, z) - fs(x - e, y, z), gy = fs(x, y + e, z) - fs(x, y - e, z), gz = fs(x, y, z + e) - fs(x, y, z - e);
        const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1; gx /= gl; gy /= gl; gz /= gl;
        let occ = 0;
        for (let s = 0; s < 5; s++) { const need = Math.max(AD[s], h * 1.5); occ += AW[s] * Math.max(0, Math.min(1, (need - fs(x + gx * need, y + gy * need, z + gz * need)) / need)); }
        const c = 0.0042, f0 = fs(x, y, z), curv = (fs(x + c, y, z) + fs(x - c, y, z) + fs(x, y + c, z) + fs(x, y - c, z) + fs(x, y, z + c) + fs(x, y, z - c) - 6 * f0) / (2 * c);
        if (sc && z > sc.z && gz > -0.2) {
          let best = 1e9;
          for (const line of sc.lines) for (let q = 0; q < line.length - 1; q++) {
            const ax = line[q][0], ay = line[q][1], bx = line[q + 1][0] - ax, by = line[q + 1][1] - ay;
            const t = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by))), taper = 0.35 + 0.65 * Math.sin(Math.PI * (q + t) / (line.length - 1));
            best = Math.min(best, Math.hypot(x - ax - bx * t, y - ay - by * t) / (sc.w * taper));
          }
          if (best < 1) { x -= gx * 0.0014 * (1 - best); y -= gy * 0.0014 * (1 - best); z -= gz * 0.0014 * (1 - best); }
        }
        out.pos.push(x, y, z); out.nor.push(gx, gy, gz); out.mat.push(m); out.ao.push(Math.max(0, 1 - occ)); out.cv.push(Math.max(-1, Math.min(1, curv * 0.75)));
      }
    }

    function build(i, h) {
      const out = { pos: [], nor: [], mat: [], ao: [], cv: [], idx: [] };
      for (const part of sculpt(i)) polygonise(part, Math.max(h * part.res, part.res < 1 ? 0.0016 : 0), out);
      return { pos: new Float32Array(out.pos), nor: new Float32Array(out.nor), mat: new Float32Array(out.mat), ao: new Float32Array(out.ao), cv: new Float32Array(out.cv), idx: new Uint32Array(out.idx) };
    }
    // the same lines for the shader, as segments in the statue's own space (hy, hz, HD of Caesar's head)
    const scarSegments = () => { const out = []; for (const line of SCAR) for (let q = 0; q < line.length - 1; q++) out.push([line[q][0] * 1.06, 0.428 + line[q][1] * 1.06, line[q + 1][0] * 1.06, 0.428 + line[q + 1][1] * 1.06, (q + 0.5) / (line.length - 1)]); return out; };
    return { build, scarSegments, headScale };
  }

  /* ---------------- the keepers on screen ----------------
     Progressive build: every keeper first arrives as a coarse mesh (fast), then refines to the fine grid, all in a
     small pool of Blob workers, so the main thread only wraps typed arrays into geometry (a few ms each). The fine
     meshes are cached in IndexedDB under HOF_VERSION, so the next visit shows every keeper at full detail at once. */
  const HOF_VERSION = 'hof-v4.5', COARSE = 0.0085, FINE = 0.0038, KEEP_SCALE = 1.5, CAESAR = 10;
  const M_SKIN = 0, M_ARM = 1, M_CLOAK = 2, M_STONE = 3, M_CREST = 4, M_RELIC = 5, M_GLOW = 6, M_FUR = 7, M_GEM = 8;
  const KERNEL = hofKernel();   // the main-thread fallback, coarse only

  /* runs in the worker, so copying a fine mesh into the cache never touches the page's thread; older versions go.
     put() clones the arrays on the spot, so done() (which transfers them away) only runs after it. */
  function hofKeep(r, key, done) {
    try {
      const q = indexedDB.open('hof3d', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('m');
      q.onerror = () => done();
      q.onsuccess = () => {
        try { const st = q.result.transaction('m', 'readwrite').objectStore('m'); st.put(r, key); const all = st.getAllKeys(); all.onsuccess = () => all.result.forEach((k) => { if (String(k).split(':')[0] !== key.split(':')[0]) st.delete(k); }); } catch (_) { /* cache is optional */ }
        q.result.close(); done();
      };
    } catch (_) { done(); }
  }
  let WKS = null; const jobs = [];
  function workers() {
    if (WKS) return WKS;
    WKS = [];
    try {
      const src = '(function(){var K=(' + hofKernel.toString() + ')(),keep=(' + hofKeep.toString() + ');self.onmessage=function(e){var d=e.data,r=K.build(d.i,d.h);' +
        'var send=function(){self.postMessage({r:r},[r.pos.buffer,r.nor.buffer,r.mat.buffer,r.ao.buffer,r.cv.buffer,r.idx.buffer]);};if(d.key)keep(r,d.key,send);else send();};})()';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));   // leave cores for the page itself
      for (let k = 0; k < n; k++) {
        const w = new Worker(url);
        w.onmessage = (e) => { const j = w.job; w.job = null; if (j) j.done(e.data.r); pump(); };
        w.onerror = () => { const j = w.job; w.job = null; WKS = WKS.filter(x => x !== w); w.terminate(); if (j) j.done(null); pump(); };
        WKS.push(w);
      }
    } catch { /* no workers: the coarse fallback below */ }
    return WKS;
  }
  function pump() { for (const w of WKS) if (!w.job && jobs.length) { w.job = jobs.shift(); w.postMessage({ i: w.job.i, h: w.job.h, key: w.job.h === FINE ? HOF_VERSION + ':' + w.job.i : '' }); } }
  const build = (i, h) => new Promise((res) => {
    if (workers().length) { jobs.push({ i, h, done: res }); pump(); }
    else setTimeout(() => res(h >= COARSE ? KERNEL.build(i, h) : null), 8);   // no worker: coarse on the main thread, one keeper per tick
  });

  const idb = () => new Promise((res) => {
    try { const q = indexedDB.open('hof3d', 1); q.onupgradeneeded = () => q.result.createObjectStore('m'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch { res(null); }
  });
  const idbGet = async (i) => { const db = await idb(); if (!db) return null; return new Promise((res) => { try { const r = db.transaction('m').objectStore('m').get(HOF_VERSION + ':' + i); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch { res(null); } }); };

  /* the nine material groups, all from the theme tokens: warm-grey marble for skin and a darker stone for fur, basalt
     plates, tinted stone cloaks, gold for crest and trim. Caesar is carved apart: obsidian, a crimson-magenta mantle */
  function fillPal(i, arr) {
    // each keeper is cut from its own block: [lightness, warmth toward gold, fur lightness (the elders are silver)]
    const caesar = i === CAESAR, [sh, warm, fur] = [[1, 0.16, 0.42], [0.84, 0, 0.62], [1.1, 0.05, 0.4], [0.92, 0, 1.05], [1.04, 0.26, 0.5], [0.7, 0.06, 1.35], [1.16, 0.1, 0.55], [0.62, 0, 0.36], [0.9, 0.3, 0.5], [0.78, 0.04, 0.9], [1, 0, 0.5]][i];
    const marble = PAL.ink.clone().lerp(PAL.p2, 0.05).lerp(PAL.gold, warm).multiplyScalar(0.7 * sh);
    arr[M_SKIN].copy(marble);
    arr[M_FUR].copy(marble).multiplyScalar(fur);
    arr[M_ARM].copy(PAL.bg).lerp(PAL.ink, 0.2).lerp(PAL.p2, 0.06);
    arr[M_CLOAK].copy(PAL.bg).lerp([PAL.p1, PAL.mag, PAL.p2][i % 3], 0.36);
    arr[M_STONE].copy(marble).multiplyScalar(0.42);
    arr[M_CREST].copy(PAL.gold).multiplyScalar(0.82);
    arr[M_RELIC].copy(PAL.p2).lerp(WHITE, 0.12);
    arr[M_GLOW].copy(PAL.mag);
    arr[M_GEM].copy(PAL.mag);
    if (caesar) {
      arr[M_SKIN].copy(PAL.bg).lerp(PAL.ink, 0.42).lerp(PAL.gold, 0.14);
      arr[M_FUR].copy(PAL.bg).lerp(PAL.ink, 0.13).lerp(PAL.gold, 0.1);
      arr[M_ARM].copy(PAL.bg).lerp(PAL.ink, 0.12).lerp(PAL.gold, 0.05);
      arr[M_CLOAK].copy(PAL.bg).lerp(PAL.mag, 0.46).multiplyScalar(0.8);
      arr[M_CREST].copy(PAL.gold);
    }
  }

  const ATLAS_RAMP = ' .:-=+*#%@';
  function glyphAtlas() {
    const cs = 16, n = ATLAS_RAMP.length, c = document.createElement('canvas'); c.width = n * cs; c.height = cs;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, cs);
    x.fillStyle = '#fff'; x.font = '700 15px ui-monospace, "Martian Mono", "DejaVu Sans Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < n; i++) x.fillText(ATLAS_RAMP[i], i * cs + cs / 2, cs / 2 + 1);
    const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }
  /* one tiling noise tile, made here, so the stone costs a few texture reads per pixel instead of a hundred hashes.
     R: grain (fbm), G: fine speckle, B: the slow field the veins follow, A: fur strands (stretched along v) */
  function noiseData(N) {
    const px = new Uint8Array(N * N * 4);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const lattice = (nx, ny) => { const g = Float32Array.from({ length: nx * ny }, rnd); return (u, v) => { const x = u * nx, y = v * ny, ix = x | 0, iy = y | 0, tx = x - ix, ty = y - iy, a = tx * tx * (3 - 2 * tx), b = ty * ty * (3 - 2 * ty), at = (i, j) => g[(j % ny) * nx + (i % nx)];
      return (at(ix, iy) * (1 - a) + at(ix + 1, iy) * a) * (1 - b) + (at(ix, iy + 1) * (1 - a) + at(ix + 1, iy + 1) * a) * b; }; };
    const layers = [[[8, 8, .5], [16, 16, .28], [32, 32, .14], [64, 64, .08]], [[128, 128, .7], [64, 64, .3]], [[4, 4, .62], [8, 8, .25], [16, 16, .13]], [[64, 8, .65], [128, 24, .35]]].map(l => l.map(([a, b, w]) => [lattice(a, b), w]));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 4; c++) { let v = 0; for (const [f, w] of layers[c]) v += f(x / N, y / N) * w; px[(y * N + x) * 4 + c] = Math.round(v * 255); }
    return px;
  }
  let NOISE = null, NOISE_PX = null;
  function noiseTex() {
    if (NOISE) return NOISE;
    const t = new THREE.DataTexture(NOISE_PX || (NOISE_PX = noiseData(64)), Math.sqrt(NOISE_PX.length / 4), Math.sqrt(NOISE_PX.length / 4), THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return (NOISE = t);
  }
  /* a quarter of a second of arithmetic, so it runs in a throwaway worker; without workers a smaller tile is made in place */
  const noiseReady = () => new Promise((res) => {
    if (NOISE_PX) return res();
    try {
      const url = URL.createObjectURL(new Blob(['var f=(' + noiseData.toString() + ');var d=f(256);self.postMessage(d,[d.buffer]);'], { type: 'text/javascript' }));
      const w = new Worker(url);
      const end = (d) => { NOISE_PX = d; w.terminate(); URL.revokeObjectURL(url); res(); };
      w.onmessage = (e) => end(e.data); w.onerror = () => end(null);
    } catch { res(); }
  });

  /* The stone shader. Shaded marble first (object-space grain and bump from the noise tile, baked AO, polished bevels
     from the baked curvature, a hard warm key, two coloured rims, the flanking braziers, thin ember and magenta veins,
     the glowing relic, scar and crystal), then the ASCII skin on top: glyph cells quantised in screen space, engraved
     in shadow and along the silhouette, thinned over the face, and thickened on the keeper you point at. */
  const ASCII_U = {
    uTime: { value: 0 }, uCell: { value: 6 }, uAtlas: { value: null }, uNoise: { value: null }, uGn: { value: ATLAS_RAMP.length }, uAscii: { value: 1 },
    uP1: { value: new THREE.Color() }, uP2: { value: new THREE.Color() }, uMag: { value: new THREE.Color() }, uGold: { value: new THREE.Color() },
  };
  const VS = [
    'attribute float aMat; attribute float aAo; attribute float aCv; uniform vec3 uPal[9];',
    'varying vec3 vNo, vN, vW, vO, vC; varying float vAo, vCv, vEm, vMetal, vGem, vFur;',
    'void main(){',
    '  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vO = position; vNo = normal; vN = normalize(mat3(modelMatrix) * normal);',
    '  int id = int(aMat + 0.5); vC = uPal[id]; vAo = aAo; vCv = aCv;',
    '  vEm = id == 5 ? 0.34 : (id == 6 ? 1.0 : (id == 8 ? 0.85 : 0.0)); vGem = id == 8 ? 1.0 : 0.0; vFur = id == 7 ? 1.0 : 0.0;',
    '  vMetal = id == 4 ? 1.0 : (id == 1 ? 0.6 : 0.0);',
    '  gl_Position = projectionMatrix * viewMatrix * w;',
    '}'].join('\n');
  const SCARS = KERNEL.scarSegments(), num = (v) => v.toFixed(5);
  /* distance to the nearest cut, in cut half-widths, tapering to a point at both ends */
  const SCAR_GLSL = 'float scarAt(vec2 p){ float d = 9.0; vec2 a, b; float t, w;' + SCARS.map(([ax, ay, bx, by, u]) => `a = vec2(${num(ax)}, ${num(ay)}); b = vec2(${num(bx - ax)}, ${num(by - ay)}); t = clamp(dot(p - a, b) / dot(b, b), 0.0, 1.0); w = 0.0021 * (0.2 + 0.8 * sin(3.14159 * (${num(u)} + (t - 0.5) * 0.16))); d = min(d, length(p - a - b * t) / w);`).join('') + ' return d; }';
  const FS = [
    SCAR_GLSL,
    'uniform sampler2D uAtlas, uNoise; uniform float uCell, uTime, uGn, uHot, uDim, uAscii, uCaesar, uHead; uniform vec4 uBz[2]; uniform vec3 uP1, uP2, uMag, uGold, uGemAt;',
    'varying vec3 vNo, vN, vW, vO, vC; varying float vAo, vCv, vEm, vMetal, vGem, vFur;',
    'vec4 tri(vec3 p, vec3 w){ return texture2D(uNoise, p.zy) * w.x + texture2D(uNoise, p.xz) * w.y + texture2D(uNoise, p.xy) * w.z; }',
    'void main(){',
    '  vec3 gn = normalize(vN);',
    '#ifdef REFL',
    '  float rk = max(dot(gn, normalize(vec3(0.55, 0.75, 0.6))), 0.0);',
    '  vec3 rc = vC * vAo * (0.18 + 1.1 * rk) + vC * vEm * 0.9 + uP1 * pow(1.0 - abs(gn.z), 3.0) * 0.12;',
    '  gl_FragColor = vec4(pow(clamp(rc * uDim * 1.25, 0.0, 1.0), vec3(0.68)), clamp(0.94 + vW.y * 1.25, 0.0, 0.94));',
    '#else',
    '  vec3 tw = vNo * vNo; tw *= tw; tw /= (tw.x + tw.y + tw.z);',
    '  vec4 fine = tri(vO * 12.0, tw), slow = tri(vO * 2.1, tw);',
    '  float height = fine.r * 0.7 + fine.g * 0.3 * (1.0 - vMetal * 0.7);',
    '  if (vFur > 0.5) height = tri(vO * vec3(9.0, 5.0, 9.0), tw).a * 2.6;',
    // screen-space bump: the height field tilts the normal, no extra texture reads
    '  vec3 dpx = dFdx(vW), dpy = dFdy(vW), r1 = cross(dpy, gn), r2 = cross(gn, dpx);',
    '  float det = dot(dpx, r1);',
    '  vec3 N = normalize(abs(det) * gn - sign(det) * (dFdx(height) * r1 + dFdy(height) * r2) * mix(0.00095, 0.00045, vMetal));',
    '  if (vGem > 0.5) N = normalize(cross(dpx, dpy));',                                   // crystals keep hard facets
    '  vec3 V = normalize(cameraPosition - vW);',
    '  float hot = uHot, stoneK = (1.0 - vMetal) * (1.0 - min(vEm * 2.0, 1.0));',
    '  vec3 base = vC * (1.0 + (fine.r - 0.5) * 0.5 * stoneK + (fine.g - 0.5) * 0.34 * stoneK + (slow.r - 0.5) * 0.3);',
    '  float convex = smoothstep(0.16, 0.62, vCv), hollow = smoothstep(0.04, 0.55, -vCv);',
    '  float ao = mix(0.05, 1.0, vAo * vAo) * (1.0 - hollow * 0.5);',
    '  vec3 Lk = normalize(vec3(0.62, 0.78, 0.55));',
    '  float nk = dot(N, Lk), key = pow(clamp((nk + 0.08) / 1.08, 0.0, 1.0), 1.6);',
    '  vec3 keyC = mix(vec3(1.0), uGold, 0.3) * (2.15 + 0.55 * hot);',
    '  float fr = 1.0 - max(dot(N, V), 0.0);',
    '  float rimA = pow(fr, 2.2) * smoothstep(-0.15, 0.75, dot(N, normalize(vec3(-0.85, 0.3, -0.45))));',
    '  float rimB = pow(fr, 2.4) * smoothstep(0.05, 0.85, dot(N, normalize(vec3(0.9, 0.15, -0.5))));',
    '  vec3 lit = mix(uP2 * 0.03, vec3(0.1, 0.1, 0.13), 0.5 + 0.5 * N.y) + keyC * key * mix(0.35, 1.0, ao);',
    '  lit += uP2 * max(dot(N, normalize(vec3(-0.8, -0.1, 0.6))), 0.0) * 0.1;',
    '  for (int i = 0; i < 2; i++) { vec3 Lv = uBz[i].xyz - vW; float dd = length(Lv); lit += uP1 * uBz[i].w * max(dot(N, Lv / dd), 0.0) / (1.0 + 20.0 * dd * dd); }',
    '  vec3 gemV = uGemAt - vW; float gd = length(gemV);',
    '  lit += uMag * uCaesar * (0.7 + 0.25 * sin(uTime * 1.7)) * max(dot(N, gemV / gd), 0.0) / (1.0 + 300.0 * gd * gd) * 1.9;',
    '  vec3 col = base * lit * ao;',
    '  col += (uP2 * rimA * 1.5 + mix(uP1, uMag, 0.35) * rimB * 1.15) * (1.0 + 0.5 * hot) * mix(0.3, 1.0, ao);',
    '  vec3 H = normalize(Lk + V); float nh = max(dot(N, H), 0.0);',
    '  col += mix(vec3(1.0), uGold, vMetal) * pow(nh, mix(26.0, 70.0, vMetal)) * mix(0.1, 1.15, vMetal * vMetal) * ao * keyC * 0.45;',
    // metal mirrors the hall: a warm clerestory above, the coloured floor glow below
    '  vec3 R = reflect(-V, N);',
    '  col += vMetal * mix(base, uGold, 0.25) * (smoothstep(0.1, 0.9, R.y) * 0.75 + smoothstep(0.3, -0.8, R.y) * 0.18 * uP1) * ao;',
    // polished bevels catch light on every plate edge; stone gets a softer worn highlight
    '  col += convex * mix(base * 0.5, mix(uGold, vec3(1.0), 0.35) * 0.55, vMetal) * (0.25 + key) * ao * (1.0 - min(vEm, 1.0));',
    // ember and magenta veins: a thin ridge of the slow field, only where the grain allows it, with a carved lip around it
    '  float ridge = 1.0 - abs(2.0 * fract(slow.b * 2.6 + fine.r * 0.22) - 1.0);',
    '  float veinOn = smoothstep(0.5, 0.68, slow.r) * stoneK * step(vMetal, 0.3) * (1.0 - uCaesar * 0.7) * (1.0 - smoothstep(0.385, 0.405, vO.y) * 0.75);',
    '  float vein = smoothstep(0.93, 0.995, ridge) * veinOn;',
    '  col *= 1.0 - smoothstep(0.72, 0.93, ridge) * veinOn * 0.3;',
    '  col += mix(uP1, uMag, smoothstep(0.35, 0.65, slow.g)) * vein * (0.5 + 0.2 * sin(uTime * 1.3 + vO.y * 17.0) + 0.4 * hot);',
    '  if (vEm > 0.0) {',
    '    float pulse = 0.9 + 0.1 * sin(uTime * 2.1 + vO.y * 40.0), facet = abs(dot(N, normalize(vec3(0.6, 0.35, 0.72))));',
    '    vec3 glow = vGem > 0.5 ? vC * (0.25 + 1.5 * facet * facet) + vec3(pow(facet, 14.0)) * 0.8 + vC * fr * 0.8 : vC * 1.7 + vec3(0.22);',
    '    col = mix(col, glow * pulse, min(vEm * 1.25, 1.0));',
    '  }',
    '  if (vO.y > 0.405 && vO.y < 0.455 && vO.z > 0.026 + 0.043 * uHead && vO.z < 0.026 + 0.062 * uHead && vMetal < 0.1 && vFur < 0.5) {',
    '    vec2 eye = (vec2(abs(vO.x), vO.y - 0.428) / uHead - vec2(0.017, 0.0051)) * vec2(vO.x < 0.0 ? -1.0 : 1.0, 1.0);',
    '    if (uCaesar > 0.5 && vO.x > 0.0) {',                                                      // the burning eye: no pupil, a white-hot almond
    '      float almond = length(eye * vec2(1.0, 1.85) / 0.0092);',
    '      col = mix(col, mix(uMag * 2.0, vec3(1.6), 1.0 - smoothstep(0.12, 0.8, almond)), 1.0 - smoothstep(0.8, 1.02, almond));',
    '      col += uMag * 0.5 * (1.0 - smoothstep(0.9, 2.1, almond));',
    '    } else {',
    '      float ir = length(eye) / 0.0043;',
    '      col = mix(col, col * 0.2 + uGold * 0.05, 1.0 - smoothstep(0.9, 1.08, ir));',
    '      col *= 1.0 - (1.0 - smoothstep(0.36, 0.5, ir)) * 0.8;',
    '      col += (mix(uP2, vec3(1.0), 0.65) * (1.0 + hot)) * (1.0 - smoothstep(0.12, 0.27, length(eye - vec2(-0.0013, 0.0014)) / 0.0043));',
    '    }',
    '  }',
    '  if (uCaesar > 0.5 && vO.y > 0.38 && vO.z > 0.048) {',                                  // the scar: a burning core in a dark carved lip
    '    float sd = scarAt(vO.xy);',
    '    col *= 1.0 - (1.0 - smoothstep(1.0, 2.3, sd)) * 0.7;',
    '    col = mix(col, mix(uMag * 1.9, vec3(1.0), 0.55 * (1.0 - smoothstep(0.1, 0.5, sd))) * (0.92 + 0.08 * sin(uTime * 2.3)), 1.0 - smoothstep(0.72, 1.04, sd));',
    '    col += uMag * 0.22 * (1.0 - smoothstep(1.0, 3.4, sd));',
    '  }',
    '  col = 1.0 - exp(-col * 1.35);',
    // the ASCII skin
    '  float cell = uCell * (hot > 0.5 ? 1.5 : 1.0);',                                      // bigger cells on the lit keeper, so the characters read as characters
    '  vec2 fc = gl_FragCoord.xy;',
    '  float lum = dot(col, vec3(0.3, 0.59, 0.11)), face = smoothstep(0.372, 0.4, vO.y) * (1.0 - step(0.075, abs(vO.x))) * step(0.02, vO.z);',
    '  float gi = floor(clamp(1.0 - lum * 1.25 + 0.2 * hot + 0.25 * fr, 0.0, 1.0) * (uGn - 1.0) + 0.5);',
    '  float g = texture2D(uAtlas, vec2((gi + fract(fc.x / cell)) / uGn, fract(fc.y / cell))).r;',
    '  float a = (0.5 * (1.0 - smoothstep(0.16, 0.62, lum)) + 0.7 * smoothstep(0.42, 0.9, fr) + 0.5 * hot) * uAscii * (1.0 - min(vEm, 1.0)) * (1.0 - face * 0.72 * (1.0 - 0.5 * hot));',
    '  a = clamp(a, 0.0, 1.0);',
    '  vec3 gt = mix(uP1, uP2, smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(vO.y * 11.0 - uTime * (0.25 + 1.6 * hot))));',
    '  col = col * (1.0 - (1.0 - g) * a * (0.16 + 0.1 * hot)) + gt * g * a * (0.2 + 0.1 * hot + 0.3 * smoothstep(0.5, 0.9, fr));',
    '  gl_FragColor = vec4(pow(clamp(col * uDim, 0.0, 1.0), vec3(0.86)), 1.0);',
    '#endif',
    '}'].join('\n');

  function statueMaterials(i, st, pal) {
    if (!ASCII_U.uAtlas.value) ASCII_U.uAtlas.value = glyphAtlas();
    ASCII_U.uNoise.value = noiseTex();
    const u = st.userData;
    const uni = Object.assign({}, ASCII_U, { uHot: u.hot, uDim: u.dim, uPal: { value: pal }, uCaesar: { value: i === CAESAR ? 1 : 0 }, uHead: { value: KERNEL.headScale(i) }, uBz: { value: u.bz }, uGemAt: { value: u.gemAt } });
    const body = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VS, fragmentShader: FS, extensions: { derivatives: true } });
    const refl = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VS, fragmentShader: FS, defines: { REFL: 1 }, transparent: true, depthWrite: false });
    return { body, refl };
  }

  /* wrap one worker result into a geometry */
  function geoOf(r) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(r.mat, 1));
    g.setAttribute('aAo', new THREE.BufferAttribute(r.ao, 1));
    g.setAttribute('aCv', new THREE.BufferAttribute(r.cv, 1));
    g.setIndex(new THREE.BufferAttribute(r.idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.34, 0), 0.46);   // known by construction: off-screen keepers are culled without a vertex pass
    return g;
  }
  function applyMesh(i, r, fine) {
    const st = S.statues[i]; if (!st || !r) return;
    const u = st.userData, t0 = performance.now(), geo = geoOf(r);
    if (!u.mesh) {
      const pal = Array.from({ length: 9 }, () => new THREE.Color()); fillPal(i, pal);
      const { body, refl } = statueMaterials(i, st, pal);
      const m = new THREE.Mesh(geo, body), rf = new THREE.Mesh(geo, refl);
      m.scale.setScalar(KEEP_SCALE); rf.scale.set(KEEP_SCALE, -KEEP_SCALE, KEEP_SCALE); rf.position.y = -2 * st.position.y; rf.renderOrder = -1;
      m.userData.pal = pal; u.mesh = m; u.refl = rf; st.add(rf, m);
      stats.statues++;
    } else {
      if (u.mesh.geometry !== u.refl.geometry) u.mesh.geometry.dispose();   // the reflection keeps the first, lighter mesh
      u.mesh.geometry = geo;
    }
    if (fine) { u.fine = true; stats.fine++; }
    stats.tickMax = Math.max(stats.tickMax, +(performance.now() - t0).toFixed(1));
    redraw();
  }
  function buildStatues(gen) {
    const alive = () => S.gen === gen && S.scene;
    // Caesar first, then outward from the middle of the hall: what is on screen is what arrives
    const order = S.statues.map((_, i) => i).sort((a, b) => Math.abs(S.statues[a].position.x) - Math.abs(S.statues[b].position.x));
    const breathe = () => new Promise((res) => setTimeout(res, 24));   // one upload per tick, with room for a frame between
    (async () => {
      const need = [];
      for (const i of order) {
        const c = await idbGet(i);
        if (!alive()) return;
        if (c && c.cv) { applyMesh(i, c, true); await breathe(); } else need.push(i);
      }
      await Promise.all(need.map(async (i) => { const r = await build(i, COARSE); if (r && alive() && !S.statues[i].userData.fine) { await breathe(); if (alive()) applyMesh(i, r, false); } }));
      if (!alive()) return;
      if (workers().length) await Promise.all(need.map(async (i) => { const r = await build(i, FINE); if (r && alive()) { await breathe(); if (!alive()) return; applyMesh(i, r, true); } }));
      if (alive()) { S.built = true; redraw(); }
    })();
  }

  /* a keeper's group: its state is ready at once, the sculpt arrives later */
  function general(i, ux) {
    const g = new THREE.Group();
    const seed = Math.sin(i * 12.9898 + 78.233) * 43758.5453, f = seed - Math.floor(seed);
    g.position.x = ux; Object.assign(g.userData, { yaw: i === CAESAR ? 0 : (f - 0.5) * 0.34, spin: 0, base: i === CAESAR ? 0.085 : 0, z: i === CAESAR ? -0.1 : 0 });
    g.position.y = g.userData.base; g.position.z = g.userData.z; g.rotation.y = g.userData.yaw;
    g.userData.hot = { value: 0 }; g.userData.dim = { value: 1 };
    g.userData.bz = [new THREE.Vector4(ux - 0.3, 0.22, 0.06, 0.6), new THREE.Vector4(ux + 0.3, 0.22, 0.06, 0.6)];
    g.userData.gemAt = new THREE.Vector3(ux, g.userData.base + 0.311 * KEEP_SCALE, g.userData.z + 0.095 * KEEP_SCALE);
    return g;
  }

  /* ---------------- the hall ---------------- */
  const SP = 0.62, BAY = 0.17, HX = (i) => (i === CAESAR ? 0 : (i - 4.5) * SP + (i < 5 ? -BAY : BAY));   // ten keepers in a row with a wider middle bay: Caesar stands in it
  function shadowTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.55, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  }
  /* volumetric light: an additive sheet whose streaks drift through the noise tile, soft at both edges and fading to the floor */
  function shaft(tint, light, w, h) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uNoise: { value: noiseTex() }, uTime: ASCII_U.uTime, uCol: { value: new THREE.Color() }, uOp: { value: 0.3 }, uSeed: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: ['uniform sampler2D uNoise; uniform float uTime, uOp, uSeed; uniform vec3 uCol; varying vec2 vUv;', 'void main(){',
        '  float spread = mix(0.9, 0.42, vUv.y), u = (vUv.x - 0.5) / spread;',
        '  float body = pow(clamp(1.0 - u * u * 4.0, 0.0, 1.0), 1.7);',
        '  float streak = texture2D(uNoise, vec2(u * 0.55 + uSeed + uTime * 0.006, 0.37 + uSeed)).r * 0.65 + texture2D(uNoise, vec2(u * 1.7 - uTime * 0.011 + uSeed, vUv.y * 0.06)).r * 0.35;',
        '  float a = body * smoothstep(0.34, 0.72, streak) * pow(vUv.y, 0.85) * (1.0 - smoothstep(0.9, 1.0, vUv.y));',
        '  gl_FragColor = vec4(uCol * a * uOp, 1.0);', '}'].join('\n'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    TINTS.push({ o: { color: m.uniforms.uCol.value }, w: tint, l: light });
    m.uniforms.uCol.value.copy(PAL[tint]).lerp(WHITE, light);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  }
  const glowSprite = (tint, size, opacity, light = 0) => { const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: makeGlowTex(), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }), tint, light)); s.scale.set(size, size, 1); return s; };
  /* a flat cut-corner frame laid on the floor: the ring that marks the keeper you point at */
  function floorFrame(w, d, t) {
    const pts = (a, b) => { const k = 0.28; return [[-a + a * k, -b], [a - a * k, -b], [a, -b + b * k], [a, b - b * k], [a - a * k, b], [-a + a * k, b], [-a, b - b * k], [-a, -b + b * k]].map(([x, y]) => new THREE.Vector2(x, y)); };
    const sh = new THREE.Shape(pts(w, d)); sh.holes.push(new THREE.Path(pts(w - t, d - t)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), T(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 'p1', 0.15));
    m.rotation.x = -Math.PI / 2; return m;
  }
  async function buildScene(alive) {
    readPal();
    const scene = new THREE.Scene();
    S.statues = []; S.flames = [];
    scene.background = null;   // the generated temple backdrop sits behind the architecture

    const cam = new THREE.PerspectiveCamera(36, S.aspect, 0.1, 30);
    cam.position.set(0, 0.62, 2.1); cam.lookAt(0, 0.52, 0);

    // floor: a polished mosaic; the mirrored keepers show through it
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(13, 5), hallMat({ map: mosaicTex(), rep: [9, 3.5], op: 0.46 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.003, 0.1); floor.renderOrder = 1;
    scene.add(floor);

    await tick(); if (!alive()) return false;
    // back wall of dressed stone, pilasters between the keepers, an entablature with dentils
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.8), hallMat({ map: ashlarTex(), rep: [9, 2] }));
    wall.position.set(0, 1.3, -0.64); scene.add(wall);
    const edges = []; for (let i = 0; i <= 10; i++) edges.push(i < 5 ? HX(i) - SP / 2 : i === 5 ? 0 : HX(i - 1) + SP / 2);
    const ent = new THREE.Mesh(new THREE.BoxGeometry(13, 0.1, 0.16), stone(0.2)); ent.position.set(0, 1.46, -0.56); scene.add(ent);
    const beamband = new THREE.Mesh(new THREE.BoxGeometry(13, 0.016, 0.17), goldMat()); beamband.position.set(0, 1.4, -0.55); scene.add(beamband);
    const tooth = new THREE.BoxGeometry(0.035, 0.035, 0.05).toNonIndexed(), teeth = new THREE.BufferGeometry();
    for (const n of ['position', 'normal', 'uv']) { const a = tooth.attributes[n], all = new Float32Array(a.array.length * 120); for (let i = 0; i < 120; i++) { all.set(a.array, i * a.array.length); if (n === 'position') for (let v = 0; v < a.count; v++) { const o = i * a.array.length + v * 3; all[o] += -4.2 + i * 0.07; all[o + 1] += 1.372; all[o + 2] -= 0.52; } } teeth.setAttribute(n, new THREE.BufferAttribute(all, a.itemSize)); }
    scene.add(new THREE.Mesh(teeth, stone(0.24)));
    await tick(); if (!alive()) return false;
    // banners hanging from the entablature at both ends of the row
    for (const [x, flip] of [[HX(0) - 0.5, false], [HX(9) + 0.5, true]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 1.0), hallMat({ map: bannerTex(flip), side: THREE.DoubleSide }));
      b.position.set(x, 0.86, -0.32); b.rotation.y = flip ? -0.12 : 0.12; scene.add(b);
    }

    // a dark niche with a cut-corner gold arch behind every keeper, a taller one behind Caesar
    const nicheMat = stone(0.035), archMat = stone(0.24);
    const lineMat = goldMat();
    const niche = (x, w, h) => {
      const a = w / 2, k = a * 0.5, outline = (aw, ht, kk) => [[-aw, 0], [-aw, ht - kk], [-aw + kk, ht], [aw - kk, ht], [aw, ht - kk], [aw, 0]].map(([u, v]) => new THREE.Vector2(u, v));
      const back = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(outline(a, h, k))), nicheMat); back.position.set(x, 0, -0.625); scene.add(back);
      const rim = new THREE.Shape(outline(a + 0.028, h + 0.028, k + 0.006)); rim.holes.push(new THREE.Path(outline(a, h, k - 0.007)));
      const arch = new THREE.Mesh(new THREE.ShapeGeometry(rim), archMat); arch.position.set(x, 0, -0.615); scene.add(arch);
      const inlay = new THREE.Shape(outline(a + 0.005, h + 0.005, k - 0.001)); inlay.holes.push(new THREE.Path(outline(a, h, k - 0.007)));
      const line = new THREE.Mesh(new THREE.ShapeGeometry(inlay), lineMat); line.position.set(x, 0, -0.612); scene.add(line);
    };
    for (let i = 0; i < 10; i++) niche(HX(i), 0.42, 1.14);
    niche(0, 0.62, 1.3);

    // Caesar's dais: two cut steps with a gold lip
    for (const [w, d, y, ht] of [[0.5, 0.36, 0.02, 0.04], [0.42, 0.3, 0.062, 0.045]]) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, ht, d), stone(0.17)); step.position.set(0, y, -0.1); scene.add(step);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.008, 0.006, d + 0.008), goldMat()); lip.position.set(0, y + ht / 2, -0.1); scene.add(lip);
    }

    await tick(); if (!alive()) return false;
    // the keepers, each at its place in the row, and Caesar in the middle; the sculpts arrive from the workers
    const shMap = shadowTex();
    for (let i = 0; i <= CAESAR; i++) {
      const st = general(i, HX(i));
      scene.add(st);
      S.statues.push(st);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshBasicMaterial({ map: shMap, transparent: true, depthWrite: false, opacity: 0.85 }));
      sh.rotation.x = -Math.PI / 2; sh.position.set(HX(i), 0.002, st.position.z + 0.02); sh.renderOrder = 2; scene.add(sh);
    }
    // the trademark burns: a halo on the crystal and on the scarred eye, turning with the statue, and their light on the dais
    const caesar = S.statues[CAESAR];
    const halo = glowSprite('mag', 0.2, 0.5); halo.position.set(0, 0.309 * KEEP_SCALE, 0.097 * KEEP_SCALE); caesar.add(halo);
    const eye = glowSprite('mag', 0.062, 0.8, 0.2); eye.position.set(0.018 * KEEP_SCALE, 0.4335 * KEEP_SCALE, 0.095 * KEEP_SCALE); caesar.add(eye);
    S.halo = halo; S.eyeGlow = eye;

    // braziers between the keepers (none in the middle bay, where Caesar stands), each with a warm pool on the floor
    const spotsB = [HX(0) - 0.5, HX(9) + 0.5, -0.46, 0.46];
    for (let i = 0; i < 9; i++) if (i !== 4) spotsB.push((HX(i) + HX(i + 1)) / 2);
    for (const x of spotsB) {
      const b = brazier(1.15); b.position.set(x, -0.01, -0.06); scene.add(b); S.flames.push(b);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), T(new THREE.MeshBasicMaterial({ map: makeGlowTex(), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }), 'p1'));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.004, -0.04); pool.renderOrder = 3; scene.add(pool);
    }

    // one light, one frame on the floor and one beam follow the keeper you point at
    S.frame = floorFrame(0.24, 0.2, 0.016); S.frame.position.y = 0.007; S.frame.renderOrder = 4; scene.add(S.frame);
    S.beam = shaft('p1', 0.35, 0.6, 1.6); S.beam.position.set(0, 0.78, -0.2); S.beam.material.uniforms.uOp.value = 0; scene.add(S.beam);

    await tick(); if (!alive()) return false;
    // shafts falling from the clerestory: one on Caesar, brightest, and one behind every other gap
    S.shafts = [];
    for (const [x, w, op, tint] of [[0, 0.86, 1.0, 'gold'], [-0.92, 0.54, 0.7, 'gold'], [0.92, 0.54, 0.7, 'gold'], [-2.2, 0.6, 0.55, 'p2'], [2.2, 0.6, 0.55, 'p2']]) {
      const sh = shaft(tint, 0.25, w, 1.9); sh.position.set(x + (x ? 0.08 : 0), 0.9, -0.34); sh.rotation.z = x ? -0.24 : 0;
      sh.material.uniforms.uSeed.value = S.shafts.length * 0.231; sh.userData.op = op; scene.add(sh); S.shafts.push(sh);
    }

    // dust in the light
    const nD = 220, dp = new Float32Array(nD * 3), dv = new Float32Array(nD);
    for (let i = 0; i < nD; i++) { dp[i * 3] = (i % 3 === 0 ? (Math.random() - 0.5) * 0.7 : (Math.random() - 0.5) * 7); dp[i * 3 + 1] = Math.random() * 1.5; dp[i * 3 + 2] = (Math.random() - 0.5) * 0.7 - 0.1; dv[i] = 0.008 + Math.random() * 0.018; }
    const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dGeo, T(new THREE.PointsMaterial({ size: 0.006, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), 'gold', 0.3));
    dust.frustumCulled = false; scene.add(dust); S.dust = { pos: dp, vel: dv, n: nD, pts: dust };

    Object.assign(S, { scene, cam });
    setStoneColours();
    return true;
  }

  /* the glyph shader's own colours, from the palette */
  function setStoneColours() {
    HALL_U.uBg.value.copy(PAL.bg);
    ASCII_U.uP1.value.copy(PAL.p1); ASCII_U.uP2.value.copy(PAL.p2); ASCII_U.uMag.value.copy(PAL.mag); ASCII_U.uGold.value.copy(PAL.gold);
  }

  /* the palette moved: recolour tinted lights and materials, statue skins, nameplates and the glyph shader's own colours */
  function recolour() {
    if (!readPal()) return;
    for (const t of TINTS) t.o.color.copy(PAL[t.w]).lerp(WHITE, t.l);
    if (S.scene) S.scene.traverse(o => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m.userData.hfStone !== undefined) m.color.copy(PAL.bg).lerp(PAL.ink, m.userData.hfStone);
        if (m.userData.hfGold) m.color.copy(PAL.gold).multiplyScalar(0.5);
        const map = m.map;
        if (map && map.hfPaint) { map.hfPaint(); map.needsUpdate = true; }
      }
      if (o.isFog) o.color.copy(PAL.bg);
    });
    setStoneColours();
    S.statues.forEach((st, i) => { if (st.userData.mesh) fillPal(i, st.userData.mesh.userData.pal); });
    redraw();
  }

  /* ---------------- render loop ---------------- */
  const STILL_T = 2.4;   // the moment a still frame shows: shafts and veins mid-breath
  /* advance the scene by nf frames (60 per second). snap jumps every ease to its end: that is the still frame. */
  function step(nf, t, snap) {
    const ease = (r) => (snap ? 1 : Math.min(1, r * nf)), TAU = Math.PI * 2, dt = snap ? 0 : nf / 60;
    S.px += (S.tx - S.px) * (snap ? 0 : ease(0.06)); S.py += (S.ty - S.py) * (snap ? 0 : ease(0.06));
    const at = S.cf >= 0 ? S.cf : S.hov, lit = at >= 0 && S.statues[at] ? S.statues[at] : null;
    S.he += ((lit ? 1 : 0) - S.he) * ease(0.1);
    stats.hover = S.hov;

    // the camera: a drag (with inertia), the buttons or the wheel move S.pan; keyboard focus or a touch centres a keeper and pushes in,
    // a mouse hover pushes in a little (the row never moves under the pointer)
    if (!S.drag && !snap) { S.pan += S.vel * nf; S.vel *= Math.pow(0.9, nf); if (Math.abs(S.vel) < 0.0002) S.vel = 0; }
    S.pan = Math.max(HX(0), Math.min(HX(9), S.pan));
    const cf = S.cf >= 0 && S.statues[S.cf] ? S.statues[S.cf].position.x : null;
    S.cx += ((cf !== null ? cf : S.pan) - S.cx) * ease(0.09);
    S.cz += ((cf !== null ? 1.62 : S.hov >= 0 ? 1.98 : 2.1) - S.cz) * ease(0.08);
    S.cam.position.set(S.cx + S.px * 0.12, 0.62 - S.py * 0.04, S.cz);
    S.cam.lookAt(S.cx + S.px * 0.05, 0.52, 0);

    // the lit keeper lifts off its plinth, steps forward and turns, its glyphs thicken and light up, its nameplate
    // rises (CSS, .hf-hot); the others fall back into shadow
    ASCII_U.uTime.value = t;
    for (let i = 0; i < S.statues.length; i++) {
      const st = S.statues[i], u = st.userData, on = st === lit;
      u.hot.value += ((on ? 1 : 0) - u.hot.value) * ease(0.13);
      const k = u.hot.value;
      u.dim.value = 1 - 0.46 * S.he * (1 - k);
      st.position.y = u.base + 0.06 * k; st.position.z = u.z + 0.13 * k;
      if (snap) u.spin = 0;
      else if (k > 0.5) u.spin += nf * 0.0105;   // one turn in ten seconds
      else u.spin += (Math.round(u.spin / TAU) * TAU - u.spin) * ease(0.05);
      st.rotation.y = u.yaw * (1 - k) + (snap ? 0 : Math.sin(t * 0.45 + i * 1.7) * 0.045 * (1 - k)) + u.spin;
    }
    if (lit) { HALL_U.uSpot.value.x = lit.position.x; S.frame.position.x = S.beam.position.x = lit.position.x; S.frame.position.z = lit.userData.z + 0.12; }
    HALL_U.uSpot.value.w = S.he * 0.9; S.frame.material.opacity = S.he * (0.75 + 0.2 * Math.sin(t * 2.4)); S.beam.material.uniforms.uOp.value = S.he * 0.55;
    const spots = S.spots || [];
    for (let i = 0; i < spots.length; i++) spots[i].classList.toggle('hf-hot', i === at);

    for (const sh of S.shafts) sh.material.uniforms.uOp.value = sh.userData.op * (0.86 + 0.14 * Math.sin(t * 0.35 + sh.position.x * 1.7));
    const beat = 0.5 + 0.5 * Math.sin(t * 1.7);
    S.halo.material.opacity = 0.3 + 0.2 * beat; S.eyeGlow.material.opacity = 0.55 + 0.25 * beat;
    for (let i = 0; i < S.flames.length; i++) {
      const g = S.flames[i], fl = g.userData.flame; if (!fl) continue;
      const k = flicker(t, i + 2);
      fl.scale.set(1 + k * 0.35, 1 + k * 0.45, 1);
      const gl = g.userData.glow; if (gl) gl.material.opacity = 0.42 + 0.2 * k;
    }
    for (let i = 0; i < S.statues.length; i++) { const bz = S.statues[i].userData.bz; bz[0].w = 0.55 * flicker(t, i + 2); bz[1].w = 0.55 * flicker(t, i + 3); }
    if (S.dust && dt) {
      const p = S.dust.pos, n = S.dust.n;
      for (let i = 0; i < n; i++) { p[i * 3 + 1] += S.dust.vel[i] * dt; if (p[i * 3 + 1] > 1.5) p[i * 3 + 1] = 0; }
      S.dust.pts.geometry.attributes.position.needsUpdate = true;
    }
    layoutSpots();
  }
  /* nothing moving but flames and dust: half rate is indistinguishable and leaves the GPU alone */
  const busyScene = () => S.hov >= 0 || S.cf >= 0 || !!S.drag || S.vel !== 0 || S.he > 0.01 || Math.abs(S.pan - S.cx) > 0.002 || Math.abs(S.cz - 2.1) > 0.004 || Math.abs(S.tx - S.px) > 0.01;
  function animate(ms) {
    S.raf = S.wanted ? requestAnimationFrame(animate) : 0;
    if (!S.raf) stats.running = false;
    if (!S.warm) return;
    const gap = S.last ? ms - S.last : 34;
    if (gap < 30 && !busyScene()) return;
    S.last = ms; S.t += Math.min(80, gap) / 1000;
    stats.frames++;
    stats.avgMs = stats.frames > 1 ? stats.avgMs * 0.9 + gap * 0.1 : gap;
    const t0 = performance.now();
    step(Math.min(80, gap) / 16.7, S.t, false);
    draw();
    const cpu = performance.now() - t0;
    stats.cpuMs = stats.cpuMs ? stats.cpuMs * 0.9 + cpu * 0.1 : cpu;
  }
  /* repaint when the loop is not running: calm mode shows exactly this frame */
  function redraw() {
    if (S.raf || !S.warm || !S.scene) return;
    step(1, calmNow() ? STILL_T : S.t, true);
    draw();
  }
  function flicker(t, i) { return 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * (0.9 + i * 0.13) + i * 2.1)) * (0.6 + 0.4 * Math.sin(t * (0.5 + i * 0.07) + i * 1.3)); }

  function setRunning(on) {
    if (!S.ready) return;
    if (on && !S.raf && !document.hidden && S.wanted && !calmNow()) {
      S.last = 0; stats.running = true;
      S.raf = requestAnimationFrame(animate);
    } else if (!on && S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; stats.running = false; }
  }

  /* ---------------- the legend card ---------------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function closeLegend() {
    if (!S.legend) return;
    const { el, onKey } = S.legend;
    document.removeEventListener('keydown', onKey, true);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    S.legend = null;
  }
  function openLegend(i) {
    const spot = S.el ? S.el.querySelectorAll('.hof-spot')[i] : null;
    if (!spot) return;
    closeLegend();
    const name = ((spot.querySelector('span') || {}).textContent || '').replace(/^@/, '');
    const L = LEGENDS[i % LEGENDS.length];
    const href = spot.getAttribute('href') || '#';   // the link settings.js already drew: one source for the address
    const wrap = document.createElement('div');
    wrap.className = 'hof-legend';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', `${name}, ${L.epithet}`);
    wrap.innerHTML = `<div class="hf-card" data-no-i18n>
      <span class="hf-eyebrow">Keeper ${String(i + 1).padStart(2, '0')} · Hall of Fame</span>
      <h4>${esc(name)}</h4>
      <p class="hf-epithet">${esc(L.epithet)}</p>
      <p class="hf-relic"><span>Relic</span> ${esc(L.relic)}</p>
      <p class="hf-line">${esc(L.line)}</p>
      <div class="hf-acts"><a class="btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open on X</a><button class="btn ghost" type="button" data-hf="close">Close</button></div>
    </div>`;
    document.body.appendChild(wrap);   // fixed overlay: a re-render of the Settings card must not remove the card
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeLegend(); if (spot) spot.focus(); }
      if (e.key === 'Tab') {
        const f = [...wrap.querySelectorAll('a,button')];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-hf="close"]') || e.target === wrap) { closeLegend(); if (spot) spot.focus(); } });
    document.addEventListener('keydown', onKey, true);
    S.legend = { el: wrap, onKey, spot };
    const close = wrap.querySelector('[data-hf="close"]');
    if (close) close.focus();
  }

  /* ---------------- DOM + context ---------------- */
  /* The real .hof-spot links follow the statues on screen: each frame they are placed over the projected keeper, so
     hover, focus, click and tap always hit the link that sits on the figure, however the row is panned. */
  const PV = new THREE.Vector3();
  function layoutSpots() {
    const cam = S.cam; if (!S.el || !cam || !S.w) return;
    const spots = S.spots || (S.spots = [...S.el.querySelectorAll('.hof-spot')]);
    const visH = 2 * cam.position.z * Math.tan(cam.fov * Math.PI / 360), px = S.h / visH;
    for (let i = 0; i < spots.length; i++) {
      const st = S.statues[i], a = spots[i]; if (!st || !a) continue;
      PV.set(st.position.x, 0, 0).project(cam);
      const cx = (PV.x * 0.5 + 0.5) * S.w, base = (-PV.y * 0.5 + 0.5) * S.h, wd = 0.56 * px, ht = 1.0 * px;
      const box = [(cx - wd / 2).toFixed(1), (base - ht).toFixed(1), wd.toFixed(1), ht.toFixed(1)], k = box.join();
      if (a.hfBox === k) continue;   // style writes only when the figure moved
      a.hfBox = k;
      a.style.left = box[0] + 'px'; a.style.top = box[1] + 'px'; a.style.width = box[2] + 'px'; a.style.height = box[3] + 'px';
    }
  }
  function navButtons(el) {
    if (el.querySelector('.hf3-nav')) return;
    for (const d of [-1, 1]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hf3-nav ' + (d < 0 ? 'hf3-prev' : 'hf3-next'); b.dataset.hfNav = String(d);
      b.setAttribute('aria-label', d < 0 ? 'Previous keepers' : 'Next keepers');
      b.innerHTML = '<svg viewBox="0 0 12 20" width="12" height="20" aria-hidden="true"><path d="M10 1 2 10l8 9"/></svg>';
      el.appendChild(b);
    }
  }
  const worldPerPx = () => 2 * (S.cam ? S.cam.position.z : 2.1) * Math.tan(36 * Math.PI / 360) / Math.max(1, S.h);
  const panBy = (d) => { S.cf = -1; S.pan = Math.max(HX(0), Math.min(HX(9), S.pan + d)); S.vel = 0; };
  function measure() {
    if (!S.el) return;
    const hb = S.el.getBoundingClientRect();
    if (!hb.width || !hb.height) return;
    S.aspect = hb.width / hb.height; S.w = hb.width; S.h = hb.height; S.spots = [...S.el.querySelectorAll('.hof-spot')];
    for (const a of S.spots) a.hfBox = '';
    // a pixel budget, not a flat ratio: a phone's small hall gets its sharpness, the wide desktop one stays at 1x
    S.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(480000 / (hb.width * hb.height))));
    ASCII_U.uCell.value = 6 * S.dpr;
    if (S.cam) { S.cam.aspect = S.aspect; S.cam.updateProjectionMatrix(); layoutSpots(); }
    const bw = Math.floor(hb.width * S.dpr), bh = Math.floor(hb.height * S.dpr);
    if (!S.gl) { S.cv.width = bw; S.cv.height = bh; return; }
    if (S.rnd && (S.rnd.getPixelRatio() !== S.dpr || S.cv.width !== bw || S.cv.height !== bh)) { S.rnd.setDrawingBufferSize(hb.width, hb.height, S.dpr); redraw(); }
  }
  const spotAt = (e) => (S.spots || []).findIndex(a => { const b = a.getBoundingClientRect(); return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom; });
  function bind() {
    navButtons(S.el);
    if (S.el._hfBound) return;
    S.el._hfBound = true;
    // Delegated on the hall itself: the Settings page redraws its cards, so the links under the pointer are new nodes.
    S.el.addEventListener('click', (e) => {
      const nb = e.target.closest && e.target.closest('[data-hf-nav]');
      if (nb) { e.preventDefault(); e.stopPropagation(); panBy(Number(nb.dataset.hfNav) * SP * 2); redraw(); return; }
      if (S.suppressClick) { S.suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
      const a = e.target.closest && e.target.closest('.hof-spot');
      if (!a) { if (S.legend) closeLegend(); return; }
      e.preventDefault(); e.stopPropagation();
      const i = [...S.el.querySelectorAll('.hof-spot')].indexOf(a);
      if (i >= 0) openLegend(i);
    });
    S.el.addEventListener('pointermove', (e) => {
      const r = S.el.getBoundingClientRect();
      S.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      S.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      if (e.pointerType && e.pointerType !== 'mouse') return;   // touch lights a keeper on press, not on hover
      if (S.drag && S.drag.moved) return;
      const i = spotAt(e); if (i === S.hov) return; S.hov = i; stats.hover = i; if (i >= 0) S.cf = -1; redraw();
    });
    S.el.addEventListener('pointerdown', (e) => {   // touch has no hover: a press lights the keeper and centres it before the tap opens its legend
      if (e.target.closest && e.target.closest('[data-hf-nav]')) return;
      const i = spotAt(e);
      S.hov = i; stats.hover = i;
      if (e.pointerType && e.pointerType !== 'mouse' && i >= 0) S.cf = i;
      redraw();
      S.drag = { x: e.clientX, pan: S.pan, moved: false, last: e.clientX };
    });
    if (!S.dragBound) window.addEventListener('pointermove', (e) => {
      if (!S.drag || !S.el) return;
      const dx = e.clientX - S.drag.x;
      if (Math.abs(dx) > 8) { S.drag.moved = true; S.cf = -1; if (e.pointerType !== 'mouse') { S.hov = -1; stats.hover = -1; } }
      if (S.drag.moved) {
        const w = worldPerPx();
        S.vel = -(e.clientX - S.drag.last) * w * 0.8;
        S.pan = Math.max(HX(0), Math.min(HX(9), S.drag.pan - dx * w));
        S.drag.last = e.clientX;
        redraw();
      }
    }, { passive: true });
    if (!S.dragBound) window.addEventListener('pointerup', () => {
      if (!S.drag) return;
      if (S.drag.moved) { S.suppressClick = true; setTimeout(() => { S.suppressClick = false; }, 350); } else S.vel = 0;
      S.drag = null;
    }, { passive: true });
    if (!S.dragBound) window.addEventListener('pointercancel', () => { S.drag = null; }, { passive: true });
    S.dragBound = true;
    S.el.addEventListener('wheel', (e) => {   // a sideways scroll pans the row; a plain vertical scroll still scrolls the page
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault(); panBy(e.deltaX * worldPerPx()); redraw();
    }, { passive: false });
    S.el.addEventListener('pointerleave', () => { S.tx = 0; S.ty = 0; S.hov = -1; stats.hover = -1; redraw(); });
    S.el.addEventListener('focusin', (e) => {
      const a = e.target.closest && e.target.closest('.hof-spot');
      if (!a) return;
      const i = [...S.el.querySelectorAll('.hof-spot')].indexOf(a);
      S.hov = i; stats.hover = i; S.cf = i; S.vel = 0; S.pan = HX(i); redraw();   // keyboard focus brings the keeper to the middle
    });
    S.el.addEventListener('focusout', () => { S.hov = -1; stats.hover = -1; S.cf = -1; redraw(); });
  }

  function draw() {
    if (!S.rnd || !S.scene || !S.warm || S.lost) return;
    S.rnd.render(S.scene, S.cam);
  }

  const tick = () => new Promise((res) => setTimeout(res, 16));   // the next task, with room for a frame between
  /* The warm-up is cut into tasks so the page never freezes: context, renderer, noise, scene, then one shader program
     per task. compile() in this three.js waits for each link, so it is handed one material at a time. */
  async function raise(gen) {
    const alive = () => S.gen === gen && S.cv;
    await noiseReady(); await tick(); if (!alive()) return;
    // a context is the one step the browser will not split: it gets a task to itself, at its final size
    S.gl = S.cv.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'low-power' }) || S.cv.getContext('webgl', { antialias: true, alpha: true });
    if (!S.gl) { noScene(); return; }   // no WebGL at all
    await tick(); if (!alive()) return;
    S.gl.getParameter(S.gl.VERSION); S.gl.getSupportedExtensions();   // the first round trip to the GPU gets its own task
    await tick(); if (!alive()) return;
    if (!renderer()) return;
    await tick(); if (!alive()) return;
    if (!await buildScene(alive)) return;
    await tick(); if (!alive()) return;
    // a one-triangle stand-in carries the two statue programs into the warm-up
    const stand = general(0, 0), mats = statueMaterials(0, stand, Array.from({ length: 9 }, () => new THREE.Color()));
    const tri = new THREE.BufferGeometry(); for (const [n, k] of [['position', 3], ['normal', 3], ['aMat', 1], ['aAo', 1], ['aCv', 1]]) tri.setAttribute(n, new THREE.BufferAttribute(new Float32Array(3 * k), k));
    const seen = new Set(), kinds = [new THREE.Mesh(tri, mats.body), new THREE.Mesh(tri, mats.refl)];
    S.scene.traverse((o) => { if (o.material) kinds.push(o); });
    for (const o of kinds) {
      const m = o.material, kind = [m.type, m.fragmentShader ? m.fragmentShader.length : '', !!m.map, m.side, JSON.stringify(m.defines || 0)].join('|');
      if (seen.has(kind)) continue;
      seen.add(kind);
      const one = { isScene: true, fog: null, environment: null, traverseVisible: () => {}, traverse: (f) => f(o) };
      await prime(one); if (!alive()) return;
      S.rnd.compile(one, S.cam);
      await tick(); if (!alive()) return;
    }
    tri.dispose();
    // and one texture upload per task, so the first frame has nothing heavy left to do
    const maps = new Set([noiseTex(), ASCII_U.uAtlas.value]);
    S.scene.traverse((o) => { const t = o.material && o.material.map; if (t) maps.add(t); });
    for (const t of maps) { S.rnd.initTexture(t); await tick(); if (!alive()) return; }
    S.el.classList.add('hf3-live');
    await tick(); if (!alive()) return;
    S.warm = true; S.ready = true; stats.ready = true;
    measure();
    await tick(); if (!alive()) return;
    redraw();
    setRunning(S.wanted);
    buildStatues(gen);   // the sculpts arrive one per tick, never as one long task
  }

  /* compile() waits for the link, which can take far longer than a frame. So first let three.js write the program and
     start its link, stop it right there, and wait in the background: the real compile that follows asks the driver for
     the same source again and gets it from the program cache. Without the parallel-compile extension this is skipped. */
  async function prime(one) {
    const gl = S.gl, par = gl.getExtension('KHR_parallel_shader_compile');
    if (!par) return;
    const link = gl.linkProgram, STOP = {};
    let started = null;
    gl.linkProgram = (p) => { link.call(gl, p); started = p; throw STOP; };
    try { S.rnd.compile(one, S.cam); } catch (e) { if (e !== STOP) throw e; } finally { gl.linkProgram = link; }
    for (let n = 0; started && n < 400 && !gl.getProgramParameter(started, par.COMPLETION_STATUS_KHR); n++) await new Promise((res) => setTimeout(res, 20));
  }

  function renderer() {
    try {
      const cv = S.cv;
      const rnd = new THREE.WebGLRenderer({ canvas: cv, context: S.gl, antialias: true, alpha: true });
      rnd.setDrawingBufferSize(S.w, S.h, S.dpr);   // the same pixels the canvas already has
      rnd.debug.checkShaderErrors = false;
      rnd.setClearColor(PAL.bg, 0);
      rnd.outputEncoding = THREE.LinearEncoding;   // every material here writes display colours itself
      cv.addEventListener('webglcontextlost', (e) => { if (S.cv !== cv) return; e.preventDefault(); S.lost = true; setRunning(false); });   // destroy() drops its own context: not a loss
      cv.addEventListener('webglcontextrestored', () => { if (S.cv !== cv) return; S.lost = false; setRunning(S.wanted); redraw(); });
      // a software renderer cannot hold a frame rate: it gets the still frame, redrawn only when something changes
      const info = S.gl.getExtension('WEBGL_debug_renderer_info');
      S.soft = /swiftshader|llvmpipe|software/i.test(String(S.gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : S.gl.RENDERER)));
      stats.soft = S.soft;
      S.rnd = rnd;
      return true;
    } catch { noScene(); return false; }
  }
  /* no scene to show: the backdrop and the named links stay, without arrows that would pan nothing */
  function noScene() {
    const el = S.el;
    S.bad = true; destroy();
    if (el) el.classList.add('hf3-still');
  }
  function mount(el) {
    if (S.bad) el.classList.add('hf3-still');   // a redrawn card has new nodes
    if (S.lost || S.bad) return;
    const fb = el.querySelector('.hof-fallback'); if (fb) fb.style.display = 'none';   // it has no picture of its own: the temple backdrop and the named links stay
    const cv = document.createElement('canvas');
    cv.className = 'hf3';
    cv.setAttribute('aria-hidden', 'true');
    S.cv = cv;
    el.insertBefore(S.cv, el.querySelector('.hof-spots') || null);
    S.el = el;
    bind();
    measure();
    watch(el);
    S.wanted = true;
    void raise(++S.gen);
  }
  function destroy() {
    closeLegend();
    setRunning(false);
    if (S.io) S.io.disconnect(); if (S.ro) S.ro.disconnect();
    S.io = null; S.ro = null;
    S.gl = null;
    if (S.el) S.el.classList.remove('hf3-live');
    if (S.cv && S.cv.parentNode) S.cv.parentNode.removeChild(S.cv);
    if (S.scene) S.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    if (S.rnd) { S.rnd.dispose(); S.rnd.forceContextLoss(); S.rnd = null; }
    if (NOISE) { NOISE.dispose(); NOISE = null; }
    if (WHITE_TEX) { WHITE_TEX.dispose(); WHITE_TEX = null; }
    if (ASCII_U.uAtlas.value) { ASCII_U.uAtlas.value.dispose(); ASCII_U.uAtlas.value = null; }
    S.cv = null;
    Object.assign(S, { el: null, scene: null, cam: null, statues: [], flames: [], dust: null, frame: null, beam: null, halo: null, eyeGlow: null, hov: -1, he: 0, tx: 0, ty: 0, px: 0, py: 0, pan: 0, vel: 0, cf: -1, spots: null, shafts: null, cz: 2.1, cx: 0, wanted: false, ready: false, warm: false, lost: false });
    Object.assign(stats, { hover: -1, ready: false, statues: 0, fine: 0 }); S.gen++; S.built = false; TINTS = [];
    jobs.length = 0;
  }
  function watch(el) {
    if (S.io) S.io.disconnect(); if (S.ro) S.ro.disconnect();
    if (typeof IntersectionObserver !== 'undefined') {
      S.io = new IntersectionObserver((es) => { S.wanted = es.some(x => x.isIntersecting); setRunning(S.wanted); }, { threshold: 0.05 });
      S.io.observe(el);
    }
    if (typeof ResizeObserver !== 'undefined') { S.ro = new ResizeObserver(() => measure()); S.ro.observe(el); }
  }
  function inView(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || 0) && r.right > 0 && r.left < (window.innerWidth || 0);
  }
  const calmNow = () => reduced() || simple() || S.soft;

  function sync() {
    if (typeof THREE === 'undefined') return;
    if (relief()) { if (S.el) destroy(); return; }
    if (S.scene) recolour();
    const el = document.querySelector('.hof');
    if (!el) { if (S.el) destroy(); return; }
    if (S.el && el !== S.el) {
      if (S.ready && S.cv) {
        el.insertBefore(S.cv, el.querySelector('.hof-spots') || null);
        const fb = el.querySelector('.hof-fallback'); if (fb) fb.style.display = 'none';
        S.el = el; el.classList.add('hf3-live'); bind(); watch(el); measure();
      } else destroy();
    }
    if (!S.el) { mount(el); return; }
    S.wanted = inView(S.el);
    if (S.spots && S.spots.some(a => !a.isConnected)) measure();
    if (calmNow()) { setRunning(false); redraw(); } else setRunning(S.wanted);
  }

  let queued = false;
  const later = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; sync(); }, 0); };
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-motion', 'style', 'data-pal', 'data-skin', 'data-theme'] });
  }
  addEventListener('scroll', later, { passive: true, capture: true });
  addEventListener('resize', () => { if (S.el) { measure(); S.wanted = inView(S.el); setRunning(S.wanted); } });
  document.addEventListener('visibilitychange', () => document.hidden ? setRunning(false) : setRunning(S.wanted));
  sync();
})();
