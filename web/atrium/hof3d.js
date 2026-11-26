/* Hall of Fame, alive (plan 8.12): the Credits card is a temple of the Caesar Evolved world.
   A colonnade, a mosaic floor, braziers and banners hold ten standing statues of the monkey generals —
   each one a keeper of the hall with its own armour, crest, cloak, weapon and relic. Hover lights a
   keeper and lifts its nameplate; pressing one opens its legend (epithet, relic, line) with the hand's
   own X page one step away. Built on the locally vendored three.js (r128, global THREE) over WebGL2, so
   it works offline. The clickable links never come from the scene: the real .hof-spot links stay on top.
   Falls back to a still frame of this same scene when WebGL2, motion or a plain browser is what we have. */
(() => {
  register({ id: 'hof3d', views: {} });
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // the registry test's stub
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
  const stats = { running: false, statues: 0, frames: 0, avgMs: 0, hover: -1, ready: false };

  const reduced = () => {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch { /* no matchMedia */ }
    const m = document.documentElement.dataset.motion;
    return m === 'off' || m === 'reduced';
  };
  const simple = () => document.documentElement.classList.contains('nx-simple');

  const S = { el: null, cv: null, rnd: null, scene: null, cam: null, statues: [], nl: [], nls: [], light: [],
    brazierPivots: [], flames: [], embers: { pos: null, vel: null, n: 0 }, dust: null, spot: null, still: '', legend: null,
    sx: [], tx: 0, ty: 0, px: 0, py: 0, pan: 0, drag: null, suppressClick: false, cz: 0.86, cx: 0, hov: -1, he: 0, t0: 0, t: 0,
    gen: 0, dpr: 1, aspect: 1.7777, io: null, ro: null, dragBound: false, wanted: false, lost: false, bad: false, raf: 0 };

  // the browser checks' handle: scene state, framerate, which keeper is lit
  window.HF3 = { stats: () => ({ running: stats.running, frames: stats.frames, avgMs: Math.round(stats.avgMs * 100) / 100, hover: stats.hover, ready: S.ready, statues: stats.statues, tickMax: stats.tickMax }) };

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

  function stone(col = null) {
    const c = new THREE.Color(col !== null ? col : PAL.ink), hsl = {};
    c.getHSL(hsl);
    const shade = Math.max(0.08, Math.min(0.5, hsl.l * 0.72));
    const mat = new THREE.MeshStandardMaterial({ color: PAL.bg.clone().lerp(PAL.ink, shade), roughness: 0.92, metalness: 0.05 });
    mat.userData.hfStone = shade;
    return mat;
  }
  const goldMat = () => { const m = new THREE.MeshStandardMaterial({ color: PAL.gold.clone().multiplyScalar(0.55), roughness: 0.52, metalness: 0.55 }); m.userData.hfGold = true; return m; };

  /* ---------------- the temple ---------------- */
  function mosaicTex() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    const paint = () => {
      x.clearRect(0, 0, 512, 512); x.fillStyle = hex(PAL.bg); x.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
        const v = 20 + ((i * 7 + j * 13) % 5) * 5;
        x.fillStyle = hex(PAL.bg.clone().lerp(PAL.ink, 0.05 + ((v - 20) / 100)));
        x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30);
      }
      x.globalAlpha = 0.6; x.strokeStyle = hex(PAL.gold); x.lineWidth = 5; x.strokeRect(9, 9, 494, 494);
      x.strokeStyle = hex(PAL.gold); x.lineWidth = 3;
      x.beginPath(); x.arc(256, 256, 96, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.arc(256, 256, 74, 0, Math.PI * 2); x.stroke();
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; x.beginPath(); x.moveTo(256 + Math.cos(a) * 96, 256 + Math.sin(a) * 96); x.lineTo(256 + Math.cos(a) * 118, 256 + Math.sin(a) * 118); x.stroke(); }
      x.globalAlpha = 1;
    };
    paint();
    const t = new THREE.CanvasTexture(c);
    t.userData.hfPaint = paint;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
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
    const t = new THREE.CanvasTexture(c); t.userData.hfPaint = paint;
    return t;
  }

  function column(h = 1.5) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, h, 16), stone('#6e6354'));
    body.position.y = h / 2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 12), stone('#5a5044'));
    base.position.y = 0.025;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), stone('#7a6e5c'));
    cap.position.y = h + 0.02;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.075, 0.05, 12), goldMat());
    neck.position.y = h - 0.02;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.008, h * 0.92, 0.008), stone('#574d41'));
      fl.position.set(Math.cos(a) * 0.081, h / 2, Math.sin(a) * 0.081);
      g.add(fl);
    }
    g.add(body, base, cap, neck);
    return g;
  }

  function brazier(big = 1) {
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * big, 0.032 * big, 0.03 * big, 10), stone('#4a4136'));
    bowl.position.y = 0.09 * big;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * big, 0.02 * big, 0.09 * big, 8), stone('#3d352c'));
    stem.position.y = 0.045 * big;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09 * big, 0.014 * big, 0.09 * big), stone('#4a4136'));
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

  /* ---------------- sculpted keepers ----------------
     Each ape general is ONE organic mesh: a signed-distance sculpt (smooth unions of ellipsoids, capsules,
     boxes and rings) polygonised with Naive Surface Nets on a small grid. Every primitive only touches the
     grid cells inside its own bounding box, so one keeper costs a few tens of ms; the ten are built one per
     timer tick so the main thread never blocks. The skin is an ASCII ShaderMaterial (see asciiMaterials). */
  const M_FUR = 0, M_ARM = 1, M_CLOAK = 2, M_STONE = 3, M_CREST = 4, M_RELIC = 5;
  const GRID = { ox: -0.126, oy: 0, oz: -0.13, h: 0.01, nx: 27, ny: 66, nz: 27 };
  const GF = new Float32Array(GRID.nx * GRID.ny * GRID.nz), GM = new Uint8Array(GF.length);
  const POSES = [0, 1, 2, 3, 2, 0, 1, 3, 2, 0], CRESTS = [0, 3, 1, 2, 3, 0, 2, 1, 0, 3];
  const WIDTH = [1.04, 0.9, 0.98, 1.08], HEAD = [0.92, 1.05, 1.0, 0.88];   // four body archetypes: heavy, lean, plain, broad
  /* per-keeper colours of the six material groups, all derived from the palette: fur leads (p1), armour is gold,
     cloak and crest vary between answer, magenta, gold and lead so the ten read as one troop but not ten copies */
  function fillPal(i, arr) {
    const sh = [1, 0.86, 1.06, 0.92][i % 4];
    arr[M_FUR].copy(PAL.bg).lerp(PAL.ink, 0.28 * sh);
    arr[M_ARM].copy(PAL.bg).lerp(PAL.ink, 0.42);
    arr[M_CLOAK].copy(PAL.bg).lerp(PAL.ink, 0.2);
    arr[M_STONE].copy(PAL.bg).lerp(PAL.ink, 0.12);
    arr[M_CREST].copy(PAL.gold);
    arr[M_RELIC].copy(PAL.p2).lerp(WHITE, 0.2);
  }

  function sculpt(i) {
    const L = [], TAU = Math.PI * 2, b = i % 4, W = WIDTH[b], HD = HEAD[b];
    const add = (t, m, k, o) => L.push(Object.assign({ t, m, k }, o));
    const E = (m, k, x, y, z, a, bb, c) => add(0, m, k, { x, y, z, a, b: bb, c });
    const Em = (m, k, x, y, z, a, bb, c) => { E(m, k, x, y, z, a, bb, c); E(m, k, -x, y, z, a, bb, c); };
    const C = (m, k, x0, y0, z0, x1, y1, z1, r0, r1) => add(1, m, k, { x: x0, y: y0, z: z0, x1, y1, z1, a: r0, b: r1 });
    const B = (m, k, x, y, z, a, bb, c, rd) => add(2, m, k, { x, y, z, a, b: bb, c, r: rd });
    const T = (m, k, x, y, z, R, r) => add(3, m, k, { x, y, z, a: R, b: r });
    const SUB = (x, y, z, a, bb, c, k) => add(0, 0, k, { x, y, z, a, b: bb, c, sub: 1 });

    // plinth with a gold nameplate
    B(M_STONE, 0.003, 0, 0.012, 0, 0.11, 0.012, 0.095, 0.004); B(M_STONE, 0.003, 0, 0.036, 0, 0.095, 0.012, 0.082, 0.004);
    B(M_ARM, 0.002, 0, 0.03, 0.09, 0.05, 0.007, 0.004, 0.002);
    // legs, sandals, greaves, kilt strips
    for (const s of [-1, 1]) {
      E(M_FUR, 0.01, s * 0.034, 0.062, 0.018, 0.024, 0.013, 0.038); E(M_ARM, 0.004, s * 0.034, 0.053, 0.018, 0.027, 0.005, 0.041);
      C(M_FUR, 0.014, s * 0.034, 0.065, 0.012, s * 0.038, 0.17, 0.006, 0.021, 0.028);
      C(M_ARM, 0.004, s * 0.034, 0.078, 0.028, s * 0.037, 0.13, 0.024, 0.023, 0.025); E(M_ARM, 0.004, s * 0.037, 0.145, 0.03, 0.022, 0.012, 0.018);
    }
    E(M_ARM, 0.01, 0, 0.2, 0.004, 0.075 * W, 0.04, 0.056);
    for (let j = -2; j <= 2; j++) C(M_ARM, 0.003, j * 0.026 * W, 0.215, 0.054, j * 0.027 * W, 0.168, 0.057, 0.011, 0.009);
    // torso, lorica bands and plate, phalera, shoulders and pauldrons
    E(M_FUR, 0.02, 0, 0.235, 0, 0.058 * W, 0.055, 0.046); E(M_FUR, 0.02, 0, 0.3, 0.004, 0.074 * W, 0.075, 0.056);
    E(M_ARM, 0.006, 0, 0.305, 0.02, 0.066 * W, 0.07, 0.04);
    for (let j = 0; j < 3; j++) E(M_ARM, 0.004, 0, 0.232 + j * 0.022, 0.016, (0.058 + 0.002 * j) * W, 0.0085, 0.05);
    E(M_CREST, 0.002, 0, 0.325, 0.058, 0.011, 0.011, 0.006);
    Em(M_FUR, 0.02, 0.088 * W, 0.345, 0, 0.034, 0.032, 0.036); Em(M_ARM, 0.005, 0.094 * W, 0.358, 0, 0.04, 0.02, 0.042); Em(M_ARM, 0.004, 0.098 * W, 0.342, 0, 0.038, 0.012, 0.04);
    C(M_FUR, 0.02, 0, 0.355, 0, 0, 0.385, 0.02, 0.032, 0.03);
    // head: brow ridge, muzzle, jaw, ears, eye sockets and a mouth line
    const hy = 0.425, hz = 0.028, h = (m, k, x, y, z, a, bb, c) => E(m, k, x * HD, hy + y * HD, hz + z * HD, a * HD, bb * HD, c * HD);
    h(M_FUR, 0.02, 0, 0, 0, 0.05, 0.054, 0.052); h(M_FUR, 0.01, 0, 0.014, 0.044, 0.048, 0.012, 0.02); h(M_FUR, 0.012, 0, -0.022, 0.054, 0.032, 0.026, 0.03); h(M_FUR, 0.01, 0, -0.036, 0.044, 0.028, 0.017, 0.03);
    for (const s of [-1, 1]) {
      h(M_FUR, 0.01, s * 0.054, -0.002, -0.004, 0.012, 0.017, 0.008);
      SUB(s * 0.02 * HD, hy + 0.008 * HD, hz + 0.056 * HD, 0.009 * HD, 0.008 * HD, 0.009 * HD, 0.006);
    }
    SUB(0, hy - 0.034 * HD, hz + 0.07 * HD, 0.02 * HD, 0.003, 0.01 * HD, 0.003);
    // crest style: helmet with a fin, a transverse centurion crest or a swept plume; or a laurel wreath
    const cs = CRESTS[i];
    if (cs < 3) {
      h(M_ARM, 0.006, 0, 0.034, -0.002, 0.056, 0.04, 0.056); h(M_ARM, 0.004, 0, -0.005, -0.052, 0.05, 0.022, 0.012);
      for (const s of [-1, 1]) h(M_ARM, 0.004, s * 0.05, -0.012, 0.012, 0.008, 0.03, 0.03);
      if (cs === 0) h(M_CREST, 0.01, 0, 0.07, 0, 0.007, 0.026, 0.062);
      else if (cs === 1) h(M_CREST, 0.01, 0, 0.066, 0, 0.062, 0.024, 0.01);
      else { C(M_CREST, 0.012, 0, hy + 0.062 * HD, hz + 0.02, 0, hy + 0.07 * HD, hz - 0.07, 0.014, 0.01); C(M_CREST, 0.01, 0, hy + 0.062 * HD, hz + 0.02, 0, hy + 0.1 * HD, hz - 0.01, 0.01, 0.006); }
    } else {
      for (let j = 0; j < 11; j++) { const a = (j / 11) * TAU; h(M_ARM, 0.003, Math.cos(a) * 0.054, 0.03 + 0.004 * Math.sin(j * 2.1), Math.sin(a) * 0.054, 0.012, 0.007, 0.014); }
      h(M_CREST, 0.003, 0, 0.034, 0.056, 0.008, 0.008, 0.006);
    }
    // cloak: full, one-shoulder drape or short cape
    const ck = i % 3;
    if (ck === 0) { E(M_CLOAK, 0.012, 0, 0.27, -0.058, 0.092 * W, 0.135, 0.017); E(M_CLOAK, 0.01, 0, 0.14, -0.064, 0.085, 0.05, 0.015); Em(M_CLOAK, 0.012, 0.078 * W, 0.352, -0.012, 0.036, 0.034, 0.04); }
    else if (ck === 1) { E(M_CLOAK, 0.012, 0, 0.27, -0.056, 0.08 * W, 0.12, 0.016); C(M_CLOAK, 0.012, -0.09 * W, 0.37, 0, -0.07 * W, 0.2, 0.045, 0.03, 0.026); }
    else { E(M_CLOAK, 0.012, 0, 0.31, -0.052, 0.094 * W, 0.085, 0.02); E(M_CLOAK, 0.01, 0, 0.18, -0.056, 0.06, 0.06, 0.014); }
    // tail, curled up behind
    C(M_FUR, 0.012, 0, 0.16, -0.045, 0.03, 0.13, -0.085, 0.013, 0.011); C(M_FUR, 0.012, 0.03, 0.13, -0.085, 0.058, 0.15, -0.11, 0.011, 0.009); C(M_FUR, 0.012, 0.058, 0.15, -0.11, 0.066, 0.19, -0.115, 0.009, 0.007);

    // arms by pose; the right hand carries the relic, the left the weapon
    const arm = (sx, el, ha) => {
      const s = sx * 0.088 * W;
      C(M_FUR, 0.02, s, 0.345, 0, el[0], el[1], el[2], 0.024, 0.02); C(M_FUR, 0.02, el[0], el[1], el[2], ha[0], ha[1], ha[2], 0.019, 0.017);
      C(M_ARM, 0.003, el[0] + (ha[0] - el[0]) * 0.45, el[1] + (ha[1] - el[1]) * 0.45, el[2] + (ha[2] - el[2]) * 0.45, ha[0], ha[1], ha[2], 0.022, 0.021);
      E(M_FUR, 0.01, ha[0], ha[1], ha[2], 0.021, 0.02, 0.022);
    };
    const pose = POSES[i];
    let rx, ry, rz;   // where the relic sits
    if (pose === 0) {
      arm(1, [0.105 * W, 0.26, 0.03], [0.09 * W, 0.29, 0.1]); [rx, ry, rz] = [0.09 * W, 0.3, 0.105];
      arm(-1, [-0.1 * W, 0.26, 0.025], [-0.098 * W, 0.2, 0.07]);
      C(M_ARM, 0.003, -0.098 * W, 0.05, 0.07, -0.098 * W, 0.6, 0.07, 0.0055, 0.0055); E(M_ARM, 0.004, -0.098 * W, 0.585, 0.07, 0.011, 0.03, 0.006); E(M_CREST, 0.003, -0.098 * W, 0.52, 0.07, 0.012, 0.01, 0.012);
    } else if (pose === 1) {
      arm(1, [0.108 * W, 0.33, 0.025], [0.09 * W, 0.43, 0.06]); [rx, ry, rz] = [0.09 * W, 0.45, 0.06];
      arm(-1, [-0.095 * W, 0.26, 0.03], [-0.07 * W, 0.23, 0.085]);
      E(M_ARM, 0.004, -0.062 * W, 0.265, 0.098, 0.036, 0.048, 0.008); T(M_CREST, 0.002, -0.062 * W, 0.265, 0.1, 0.036, 0.004); E(M_CREST, 0.003, -0.062 * W, 0.265, 0.108, 0.011, 0.011, 0.008);
    } else if (pose === 2) {
      arm(1, [0.1 * W, 0.26, 0.045], [0.03, 0.26, 0.1]); arm(-1, [-0.1 * W, 0.26, 0.045], [-0.03, 0.25, 0.1]); [rx, ry, rz] = [0, 0.265, 0.108];
      C(M_ARM, 0.003, -0.088 * W, 0.225, 0.03, -0.082 * W, 0.08, 0.07, 0.008, 0.006); E(M_CREST, 0.003, -0.088 * W, 0.238, 0.03, 0.011, 0.008, 0.011);
    } else {
      arm(1, [0.1 * W, 0.27, 0.03], [0.085 * W, 0.3, 0.06]);
      C(M_ARM, 0.003, 0.085 * W, 0.05, 0.06, 0.085 * W, 0.56, 0.06, 0.0055, 0.0055); T(M_ARM, 0.002, 0.085 * W, 0.53, 0.06, 0.022, 0.004); E(M_CREST, 0.004, 0.085 * W, 0.53, 0.06, 0.016, 0.016, 0.008); B(M_CLOAK, 0.003, 0.085 * W + 0.02, 0.47, 0.06, 0.02, 0.026, 0.004, 0.002);
      arm(-1, [-0.1 * W, 0.26, 0.03], [-0.085 * W, 0.22, 0.085]); [rx, ry, rz] = [-0.085 * W, 0.235, 0.095];
    }
    // the relic of this keeper (LEGENDS order)
    const R = M_RELIC, K = i % 10, hx = rx, hyy = ry, hzz = rz;
    if (K === 0) { E(R, 0.01, hx, hyy + 0.015, hzz, 0.016, 0.016, 0.016); E(R, 0.01, hx, hyy + 0.04, hzz, 0.007, 0.016, 0.007); }
    else if (K === 1) { C(M_ARM, 0.003, hx, hyy - 0.12, hzz, hx, hyy + 0.16, hzz, 0.005, 0.005); T(R, 0.002, hx, hyy + 0.17, hzz, 0.012, 0.004); }
    else if (K === 2) B(R, 0.003, hx, hyy + 0.02, hzz, 0.022, 0.028, 0.005, 0.002);
    else if (K === 3) { T(R, 0.002, hx, hyy + 0.03, hzz, 0.026, 0.005); T(R, 0.002, hx, hyy + 0.03, hzz, 0.014, 0.003); E(R, 0.004, hx, hyy + 0.03, hzz, 0.006, 0.006, 0.006); }
    else if (K === 4) { C(R, 0.003, hx - 0.04, hyy + 0.05, hzz, hx + 0.04, hyy + 0.05, hzz, 0.004, 0.004); C(R, 0.003, hx, hyy, hzz, hx, hyy + 0.05, hzz, 0.004, 0.004); for (const s of [-1, 1]) E(R, 0.004, hx + s * 0.04, hyy + 0.025, hzz, 0.016, 0.003, 0.016); }
    else if (K === 5) { B(R, 0.003, hx, hyy + 0.02, hzz, 0.02, 0.026, 0.009, 0.002); B(M_ARM, 0.002, hx - 0.02, hyy + 0.02, hzz, 0.004, 0.028, 0.011, 0.001); }
    else if (K === 6) { E(R, 0.004, hx, hyy + 0.038, hzz, 0.026, 0.03, 0.004); T(M_ARM, 0.002, hx, hyy + 0.038, hzz, 0.027, 0.004); C(M_ARM, 0.003, hx, hyy, hzz, hx, hyy + 0.012, hzz, 0.005, 0.005); }
    else if (K === 7) { T(R, 0.002, hx, hyy + 0.035, hzz, 0.02, 0.007); B(R, 0.002, hx, hyy + 0.035, hzz, 0.026, 0.004, 0.004, 0.001); B(R, 0.002, hx, hyy + 0.035, hzz, 0.004, 0.026, 0.004, 0.001); E(R, 0.004, hx, hyy + 0.035, hzz, 0.008, 0.008, 0.008); }
    else if (K === 8) { C(M_ARM, 0.003, hx, hyy - 0.02, hzz, hx, hyy + 0.06, hzz, 0.005, 0.005); B(R, 0.003, hx, hyy + 0.06, hzz, 0.022, 0.011, 0.011, 0.002); }
    else { B(M_ARM, 0.002, hx, hyy + 0.03, hzz, 0.014, 0.018, 0.014, 0.002); E(R, 0.006, hx, hyy + 0.03, hzz, 0.01, 0.012, 0.01); C(M_ARM, 0.002, hx, hyy + 0.05, hzz, hx, hyy + 0.075, hzz, 0.003, 0.003); }
    return L.sort((p, q) => (p.sub || 0) - (q.sub || 0));
  }

  const sdf = (p, x, y, z) => {
    const dx = x - p.x, dy = y - p.y, dz = z - p.z;
    switch (p.t) {
      case 0: { const ux = dx / p.a, uy = dy / p.b, uz = dz / p.c, k0 = Math.sqrt(ux * ux + uy * uy + uz * uz); if (k0 < 1e-5) return -Math.min(p.a, p.b, p.c);
        const vx = ux / p.a, vy = uy / p.b, vz = uz / p.c; return k0 * (k0 - 1) / Math.sqrt(vx * vx + vy * vy + vz * vz); }
      case 1: { const bx = p.x1 - p.x, by = p.y1 - p.y, bz = p.z1 - p.z;
        const t = Math.max(0, Math.min(1, (dx * bx + dy * by + dz * bz) / (bx * bx + by * by + bz * bz)));
        const ex = dx - bx * t, ey = dy - by * t, ez = dz - bz * t; return Math.sqrt(ex * ex + ey * ey + ez * ez) - (p.a + (p.b - p.a) * t); }
      case 2: { const qx = Math.abs(dx) - p.a + p.r, qy = Math.abs(dy) - p.b + p.r, qz = Math.abs(dz) - p.c + p.r;
        const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0); return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - p.r; }
      default: { const w = Math.sqrt(dx * dx + dy * dy) - p.a; return Math.sqrt(w * w + dz * dz) - p.b; }
    }
  };
  const bounds = (p) => {
    if (p.t === 1) { const m = Math.max(p.a, p.b); return [[Math.min(p.x, p.x1) - m, Math.max(p.x, p.x1) + m], [Math.min(p.y, p.y1) - m, Math.max(p.y, p.y1) + m], [Math.min(p.z, p.z1) - m, Math.max(p.z, p.z1) + m]]; }
    const r = p.t === 3 ? [p.a + p.b, p.a + p.b, p.b] : [p.a, p.b, p.c];
    return [[p.x - r[0], p.x + r[0]], [p.y - r[1], p.y + r[1]], [p.z - r[2], p.z + r[2]]];
  };

  /* fill the shared field: each primitive only visits the cells inside its own box (plus its blend radius) */
  function fillField(L) {
    const { ox, oy, oz, h, nx, ny, nz } = GRID, o = [ox, oy, oz], dim = [nx, ny, nz];
    GF.fill(1); GM.fill(0);
    for (const p of L) {
      const bb = bounds(p), mg = p.k + 0.004, lo = [], hi = [];
      for (let a = 0; a < 3; a++) { lo[a] = Math.max(1, Math.floor((bb[a][0] - mg - o[a]) / h)); hi[a] = Math.min(dim[a] - 2, Math.ceil((bb[a][1] + mg - o[a]) / h)); }
      const kk = p.k;
      for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
        const d = sdf(p, ox + i * h, oy + j * h, oz + k * h), n = i + nx * (j + ny * k), f = GF[n];
        if (p.sub) { const q = Math.max(kk - Math.abs(f + d), 0) / kk; GF[n] = Math.max(f, -d) + q * q * kk * 0.25; }
        else { if (d < f) GM[n] = p.m; const q = Math.max(kk - Math.abs(f - d), 0) / kk; GF[n] = Math.min(f, d) - q * q * kk * 0.25; }
      }
    }
  }

  /* Naive Surface Nets: one vertex per crossed cell, one quad per crossed grid edge */
  function polygonise() {
    const { ox, oy, oz, h, nx, ny, nz } = GRID, sy = nx, sz = nx * ny;
    const vid = new Int32Array(GF.length).fill(-1), pos = [], col = [], idx = [], VID = vid;
    const CO = [0, 1, sy, sy + 1, sz, sz + 1, sz + sy, sz + sy + 1], CX = [0, 1, 0, 1, 0, 1, 0, 1], CY = [0, 0, 1, 1, 0, 0, 1, 1], CZ = [0, 0, 0, 0, 1, 1, 1, 1];
    const ED = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
    const f = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const n = i + sy * j + sz * k; let mask = 0, lo = 1e9, lc = 0;
      for (let c = 0; c < 8; c++) { f[c] = GF[n + CO[c]]; if (f[c] < 0) mask |= 1 << c; if (f[c] < lo) { lo = f[c]; lc = c; } }
      if (mask === 0 || mask === 255) continue;
      let ax = 0, ay = 0, az = 0, cnt = 0;
      for (let e = 0; e < 24; e += 2) {
        const a = ED[e], bq = ED[e + 1]; if ((f[a] < 0) === (f[bq] < 0)) continue;
        const t = f[a] / (f[a] - f[bq]);
        ax += CX[a] + (CX[bq] - CX[a]) * t; ay += CY[a] + (CY[bq] - CY[a]) * t; az += CZ[a] + (CZ[bq] - CZ[a]) * t; cnt++;
      }
      vid[n] = pos.length / 3;
      pos.push(ox + (i + ax / cnt) * h, oy + (j + ay / cnt) * h, oz + (k + az / cnt) * h);
      col.push(GM[n + CO[lc]]);
    }
    const st = [1, sy, sz];
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const n = i + sy * j + sz * k;
      for (let a = 0; a < 3; a++) {
        const in0 = GF[n] < 0; if (in0 === GF[n + st[a]] < 0) continue;
        const eu = st[(a + 1) % 3], ev = st[(a + 2) % 3];
        const q0 = VID[n - eu - ev], q1 = VID[n - ev], q2 = VID[n], q3 = VID[n - eu];
        if (q0 < 0 || q1 < 0 || q2 < 0 || q3 < 0) continue;
        if (in0) idx.push(q0, q1, q2, q0, q2, q3); else idx.push(q0, q2, q1, q0, q3, q2);
      }
    }
    return { pos, col, idx };
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

  /* The statue skin. The fragment shader snaps to a screen-space glyph cell, extrapolates the normal and the
     position to the cell centre (derivatives), lights that point with a key, a fill, a back rim and the hall's
     braziers, then picks a glyph from the luminance ramp. Tint comes from the vertex colour, the rim is crystal,
     hover (uHot) lifts everything. A back-face shell draws the crisp outline. */
  const ASCII_U = { uOut: { value: new THREE.Color() }, uOutHi: { value: new THREE.Color() }, uP1: { value: new THREE.Color() }, uP2: { value: new THREE.Color() }, uTime: { value: 0 }, uCell: { value: 8 }, uAtlas: { value: null }, uGn: { value: ATLAS_RAMP.length }, uBz: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 0)) }, uCrystal: { value: new THREE.Color() } };
  function asciiMaterials(hot, pal) {
    if (!ASCII_U.uAtlas.value) ASCII_U.uAtlas.value = glyphAtlas();
    const vs = 'attribute float aMat; uniform vec3 uPal[6]; varying vec3 vN, vW, vC; varying float vM;\n' +
      'void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vC = uPal[int(aMat + 0.5)]; vM = aMat; gl_Position = projectionMatrix * viewMatrix * w; }';
    const fs = [
      'uniform sampler2D uAtlas; uniform float uCell, uTime, uGn, uHot; uniform vec4 uBz[12]; uniform vec3 uCrystal, uP1, uP2, uGold;',
      'varying vec3 vN, vW, vC; varying float vM;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main(){',
      '  vec2 fc = gl_FragCoord.xy; vec2 cid = floor(fc / uCell); vec2 d = (cid + 0.5) * uCell - fc;',
      '  vec3 nx = dFdx(vN), ny = dFdy(vN), px = dFdx(vW), py = dFdy(vW);',
      '  vec3 N = vN, P = vW;',
      '  if (dot(nx, nx) + dot(ny, ny) < 0.4) N += nx * d.x + ny * d.y;',
      '  if (dot(px, px) + dot(py, py) < 0.0004) P += px * d.x + py * d.y;',
      '  N = normalize(N);',
      '  vec3 V = normalize(cameraPosition - P);',
      '  float key = max(dot(N, normalize(vec3(0.65, 0.78, 0.55))), 0.0);',
      '  float fill = max(dot(N, normalize(vec3(-0.75, 0.18, 0.62))), 0.0);',
      '  float back = max(dot(N, normalize(vec3(0.0, 0.28, -1.0))), 0.0);',
      '  float fres = 1.0 - max(dot(N, V), 0.0);',
      '  float l = 0.015 + 1.12 * key + 0.045 * fill + 0.52 * back;',
      '  for (int i = 0; i < 12; i++) { vec3 Lv = uBz[i].xyz - P; float dd = length(Lv); l += uBz[i].w * max(dot(N, Lv / dd), 0.0) / (1.0 + 160.0 * dd * dd); }',
      '  l += uHot * (0.32 + 0.12 * sin(uTime * 3.0 + cid.y * 0.5));',
      '  l += 0.32 * pow(fres, 2.0);',
      '  l = clamp(pow(clamp(l, 0.0, 1.65), 0.78) + (hash(cid) - 0.5) * 0.018, 0.0, 1.0);',
      '  float idx = floor(l * (uGn - 1.0) + 0.5);',
      '  vec2 f = fract(fc / uCell);',
      '  float g = texture2D(uAtlas, vec2((idx + f.x) / uGn, f.y)).r;',
      '  vec3 rim = uCrystal * pow(fres, 2.4);',
      '  float accent = 1.0 - step(0.5, abs(vM - 4.0));',
      '  vec3 glyphTint = mix(uP1, uP2, clamp(l * 0.72 + fres * 0.45, 0.0, 1.0));',
      '  vec3 stone = vC * (0.12 + 0.88 * l);',
      '  vec3 col = mix(stone + glyphTint * g * (0.08 + 0.52 * l), vC * (0.18 + 0.72 * l) + uGold * g * 0.35, accent);',
      '  col += rim * (0.18 + 0.72 * pow(fres, 2.0));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'].join('\n');
    const uni = Object.assign({}, ASCII_U, { uHot: hot, uPal: { value: pal }, uGold: { value: PAL.gold } });
    const body = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: vs, fragmentShader: fs, extensions: { derivatives: true } });
    const outline = new THREE.ShaderMaterial({ uniforms: { uHot: hot, uOut: ASCII_U.uOut, uOutHi: ASCII_U.uOutHi },
      vertexShader: 'uniform float uHot; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * (0.0042 + 0.002 * uHot), 1.0); }',
      fragmentShader: 'uniform float uHot; uniform vec3 uOut, uOutHi; void main(){ gl_FragColor = vec4(mix(uOut, uOutHi, uHot), 1.0); }', side: THREE.BackSide });
    return { body, outline };
  }

  /* one keeper: sculpt, polygonise, wrap in a mesh with its ASCII skin and outline shell */
  function sculptMesh(i, hot) {
    const pal = Array.from({ length: 6 }, () => new THREE.Color()); fillPal(i, pal);
    const { pos, col, idx } = polygonise();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aMat', new THREE.Float32BufferAttribute(col, 1));
    geo.setIndex(idx); geo.computeVertexNormals();
    const { body, outline } = asciiMaterials(hot, pal);
    const g = new THREE.Group(); g.add(new THREE.Mesh(geo, body), new THREE.Mesh(geo, outline));
    g.children.forEach(m => { m.frustumCulled = false; });
    g.userData.pal = pal;
    return g;
  }

  /* a keeper's group: position, hover state and nameplate are ready at once, the sculpt arrives later */
  function general(i, ux) {
    const g = new THREE.Group();
    const seed = Math.sin(i * 12.9898 + 78.233) * 43758.5453, f = seed - Math.floor(seed);
    g.position.x = ux; g.userData.yaw = (f - 0.5) * 0.2; g.rotation.y = g.userData.yaw;
    g.userData.hot = { value: 0 };
    return g;
  }
  /* build the ten, one per timer tick, so no single task is long */
  function buildStatues(gen) {
    let i = 0, field = false;
    const next = () => {
      if (S.gen !== gen || !S.scene) return;
      if (i >= S.statues.length) { S.built = true; S.still = ''; captureStill(); return; }
      const st = S.statues[i];
      const t0 = performance.now(), note = () => { stats.tickMax = Math.max(stats.tickMax || 0, Math.round(performance.now() - t0)); };
      if (!field) { fillField(sculpt(i)); field = true; note(); setTimeout(next, 8); return; }   // tick 1: the signed-distance field
      field = false;
      st.userData.mesh = sculptMesh(i, st.userData.hot); st.userData.mesh.scale.setScalar(1.85); st.add(st.userData.mesh);       // tick 2: surface nets and the mesh
      note(); i++; stats.statues = i; draw();
      setTimeout(next, 16);
    };
    setTimeout(next, 0);
  }

  /* the glowing nameplate under each keeper: a canvas texture so the handle stays crisp */
  function drawPlate(c, name) {
    const x = c.getContext('2d');
    x.clearRect(0, 0, 320, 72);
    x.fillStyle = hex(PAL.bg); x.fillRect(0, 0, 320, 72);
    x.strokeStyle = hex(PAL.gold); x.lineWidth = 2; x.strokeRect(1.5, 1.5, 317, 69);
    x.strokeStyle = hex(PAL.p1) + '66'; x.strokeRect(7, 7, 306, 58);
    x.font = '600 34px ui-monospace, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = hex(PAL.ink); x.shadowColor = hex(PAL.p1); x.shadowBlur = 16;
    x.fillText('@' + name, 160, 37);
  }
  function nameplate(name) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 72;
    drawPlate(c, name);
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.renderOrder = 10;   // a nameplate is a label: never hidden by a helmet
    sp.userData = { c, name };
    sp.scale.set(0.17, 0.038, 1);
    sp.position.y = 0.005;
    return sp;
  }

  /* ---------------- the hall ---------------- */
  function buildScene() {
    readPal();
    const W = 0.95;                    // half-width of the line: ten keepers inside a close camera
    const scene = new THREE.Scene();
    scene.background = null;   // the generated temple backdrop sits behind the glyphs
    scene.fog = new THREE.Fog(PAL.bg, 3.0, 7.2);

    const cam = new THREE.PerspectiveCamera(50, S.aspect, 0.1, 24);
    cam.position.set(0, 0.52, 1.72); cam.lookAt(0, 0.45, -0.05);

    scene.add(new THREE.AmbientLight(PAL.bg, 0.38));
    const key = T(new THREE.DirectionalLight(0xffffff, 0.45), 'gold', 0.3); key.position.set(1.6, 1.6, 1.4); scene.add(key);   // a hard key makes the glyphs model volume
    const fill = T(new THREE.DirectionalLight(0xffffff, 0.22), 'p2', 0.0); fill.intensity = 0.16; fill.position.set(-2.2, 0.4, 1.0); scene.add(fill);
    const rim = T(new THREE.DirectionalLight(0xffffff, 0.62), 'p1'); rim.position.set(0, 0.8, -2.0); scene.add(rim);

    // floor: mosaic inlay over flagstones
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.4), new THREE.MeshStandardMaterial({ map: mosaicTex(), roughness: 0.86, metalness: 0.12 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.012, 0.1);
    scene.add(floor);

    // back wall with pilasters and a recessed apse
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.0), stone('#3a3229'));
    wall.position.set(0, 1.0, -0.62); scene.add(wall);
    const apse = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.0, 24, 1, true, Math.PI * 0.15, Math.PI * 0.7), stone('#33291f'));
    apse.position.set(0, 1.0, -0.62); apse.rotation.y = Math.PI; scene.add(apse);
    for (let i = -3; i <= 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.06), stone('#4a4034'));
      p.position.set(i * 0.92, 0.85, -0.585); scene.add(p);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.08), goldMat());
      c.position.set(i * 0.92, 1.72, -0.575); scene.add(c);
    }
    const ent = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.12, 0.16), stone('#574a3b'));
    ent.position.set(0, 1.79, -0.56); scene.add(ent);
    const beamband = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.02, 0.17), goldMat());
    beamband.position.set(0, 1.73, -0.55); scene.add(beamband);

    // colonnade: two columns each side, between camera and wall
    for (const x of [-2.55, -1.95, 1.95, 2.55]) {
      const col = column(1.5); col.position.set(x, 0, -0.34); scene.add(col);
    }
    // banners hanging from the entablature
    for (const [x, flip] of [[-2.28, false], [2.28, true]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1.0), new THREE.MeshStandardMaterial({ map: bannerTex(flip), roughness: 0.95, side: THREE.DoubleSide }));
      b.position.set(x, 1.12, -0.3); b.rotation.y = flip ? -0.12 : 0.12; scene.add(b);
    }

    // a niche and a laurel wreath behind every keeper: the wall belongs to the statue in front of it
    const nicheMat = stone('#2b241c'), wreathMat = goldMat();
    for (let i = 0; i < 10; i++) {
      const ux0 = ((S.sx[i] !== undefined ? S.sx[i] : (i + 0.5) / 10) - 0.5) * 2 * W;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.86, 0.03), nicheMat);
      back.position.set(ux0, 0.45, -0.6); scene.add(back);
      for (const dx of [-0.2, 0.2]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.94, 0.05), stone('#574a3b'));
        pil.position.set(ux0 + dx, 0.47, -0.585); scene.add(pil);
      }
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 16, Math.PI), wreathMat);
      arch.position.set(ux0, 0.88, -0.58); scene.add(arch);
      const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 18), wreathMat);
      wreath.position.set(ux0, 0.9, -0.575); scene.add(wreath);
    }

    // ten standing keepers, each where its clickable link sits
    const n = Math.min(S.sx.length, 10);
    for (let i = 0; i < n; i++) {
      const ux = (S.sx[i] - 0.5) * 2 * W;
      const st = general(i, ux);
      const plate = nameplate(S.nl[i] || '');
      plate.position.set(0, 0.055, 0.03);   // child of the statue: never add the hall offset twice
      plate.scale.set(0.25, 0.056, 1);
      plate.material.opacity = 0.45;
      st.add(plate);
      S.nls.push(plate);
      scene.add(st);
      S.statues.push(st);
    }

    // braziers: two big at the front of the line, four small between keepers
    for (const x of [-2.15, 2.15]) { const b = brazier(1.7); b.position.set(x, -0.01, 0.28); scene.add(b); S.brazierPivots.push(b); S.flames.push(b); }
    for (let i = 0; i < S.sx.length - 1; i++) {
      const ux = ((S.sx[i] + S.sx[i + 1]) / 2 - 0.5) * 2 * W;
      const b = brazier(0.9); b.position.set(ux, -0.01, 0.16); scene.add(b); S.brazierPivots.push(b); S.flames.push(b);
    }

    // fire light from the two big braziers, and one light that follows the hovering keeper
    for (const i of [0, 1]) {
      const p = S.brazierPivots[i]; if (!p) continue;
      const l = T(new THREE.PointLight(0xffffff, 1.5, 3.0, 2), 'p1');
      l.position.copy(p.position); l.position.y = 0.22;
      scene.add(l); S.light.push({ l, b: i, base: 1.5 });
    }
    const spot = T(new THREE.PointLight(0xffffff, 0, 2.4, 2), 'p1', 0.4);
    spot.position.set(0, 0.7, 0.4); scene.add(spot); S.spot = spot;

    // god rays behind the keepers
    for (const x of [-1.1, 0.2, 1.3]) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.9, 16, 1, true), T(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 'p1', 0.3));
      ray.position.set(x, 1.05, -0.35); ray.rotation.z = 0.12; scene.add(ray);
    }

    // dust in the light
    const nD = 120, dp = new Float32Array(nD * 3), dv = new Float32Array(nD);
    for (let i = 0; i < nD; i++) { dp[i * 3] = (Math.random() - 0.5) * 4.4; dp[i * 3 + 1] = Math.random() * 1.5; dp[i * 3 + 2] = (Math.random() - 0.5) * 0.9; dv[i] = 0.01 + Math.random() * 0.02; }
    const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dGeo, T(new THREE.PointsMaterial({ size: 0.005, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }), 'gold', 0.3));
    scene.add(dust); S.dust = { pos: dp, vel: dv, n: nD, pts: dust };

    // embers rising from the central fire
    const nE = 140, pos = new Float32Array(nE * 3), vel = new Float32Array(nE);
    for (let i = 0; i < nE; i++) { pos[i * 3] = (Math.random() - 0.5) * 0.08; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0.16; vel[i] = 0.4 + Math.random() * 0.8; }
    const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ePts = new THREE.Points(eGeo, T(new THREE.PointsMaterial({ size: 0.009, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), 'p1', 0.25));
    ePts.position.set(0, 0.02, 0); scene.add(ePts);
    S.embers = { pos, vel, n: nE, pts: ePts };

    // Caesar, the small ape, on a low seat at the centre of the hall, looking up at the keepers
    const ape = new THREE.Group();
      const aMat = new THREE.MeshStandardMaterial({ color: PAL.bg, roughness: 1 });
    const aBody = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), aMat); aBody.scale.set(1, 1.15, 0.8); aBody.position.y = 0.03;
    const aHead = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), aMat); aHead.position.set(0, 0.06, 0.02);
    const aSeat = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.09), stone('#4a4034')); aSeat.position.y = 0.008;
    ape.add(aSeat, aBody, aHead);
    const dais = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.2), stone('#4a4034')); dais.position.set(0, 0.05, -0.42); scene.add(dais);
    ape.position.set(0, 0.11, -0.42); ape.rotation.y = Math.PI; scene.add(ape);

    Object.assign(S, { scene, cam });
    return true;
  }

  /* the palette moved: recolour tinted lights and materials, statue skins, nameplates and the glyph shader's own colours */
  function recolour() {
    if (!readPal()) return;
    for (const t of TINTS) t.o.color.copy(PAL[t.w]).lerp(WHITE, t.l);
    if (S.scene) S.scene.traverse(o => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m.userData.hfStone !== undefined) m.color.copy(PAL.bg).lerp(PAL.ink, m.userData.hfStone);
        if (m.userData.hfGold) m.color.copy(PAL.gold).multiplyScalar(0.55);
        const map = m.map;
        if (map && map.userData.hfPaint) { map.userData.hfPaint(); map.needsUpdate = true; }
      }
      if (o.isFog) o.color.copy(PAL.bg);
    });
    ASCII_U.uCrystal.value.copy(PAL.mag); ASCII_U.uP1.value.copy(PAL.p1); ASCII_U.uP2.value.copy(PAL.p2); ASCII_U.uOut.value.copy(PAL.p1).multiplyScalar(0.55); ASCII_U.uOutHi.value.copy(PAL.gold);
    S.statues.forEach((st, i) => { if (st.userData.mesh) fillPal(i, st.userData.mesh.userData.pal); });
    S.nls.forEach((p) => { drawPlate(p.userData.c, p.userData.name); p.material.map.needsUpdate = true; });
    if (S.scene && S.built) { S.still = ''; captureStill(); }
    draw();
  }

  /* ---------------- render loop ---------------- */
  function animate(now) {
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    const dt = S.t ? Math.min(50, (now - S.t) * 1000) : 0; S.t = now;
    stats.frames += dt > 0 ? 1 : 0;
    stats.avgMs = stats.frames > 1 ? stats.avgMs * 0.9 + dt * 0.1 : dt;
    const t = (now - (S.t0 || now)) / 1000;

    S.px += (S.tx - S.px) * 0.06; S.py += (S.ty - S.py) * 0.06;
    const he = S.hov >= 0 ? 1 : 0; S.he += (he - S.he) * 0.12;
    stats.hover = S.hov;

    // a slow walk down the hall, never enough to unseat the statues
    // the camera leans toward the keeper under the pointer: the hall stays whole, his armour becomes readable
    // hovering a keeper is a close-up, not a highlight: the camera walks up to the statue so his armour is readable
    const live = S.hov >= 0 && S.statues[S.hov] ? S.statues[S.hov].position.x : 0;
    S.cz += ((S.hov >= 0 ? 1.35 : 1.72) - S.cz) * 0.10;
    S.cx += (live * 0.9 - S.cx) * 0.10;
    S.cam.position.x = S.cx + S.px * 0.22;
    S.cam.position.y = 0.52 + S.py * 0.05;
    S.cam.position.z = S.cz;
    S.cam.lookAt(S.px * 0.1, 0.45, -0.05);

    // the lit keeper steps forward and turns toward the pointer, its glyphs brighten and its nameplate lifts;
    // the others keep a slow idle turn
    ASCII_U.uTime.value = t;
    for (let i = 0; i < S.statues.length; i++) {
      const st = S.statues[i], u = st.userData, hot = u.hot;
      hot.value += ((i === S.hov ? 1 : 0) - hot.value) * 0.14;
      const lit = hot.value;
      st.position.x = (S.sx[i] - 0.5) * 2 * 0.95 + S.pan;
      st.position.z = lit * 0.05;
      st.rotation.y = u.yaw + Math.sin(t * 0.45 + i * 1.7) * 0.11 * (1 - lit) + lit * S.px * 0.3;
      if (!S.nls[i]) continue;
      S.nls[i].position.y = 0.055 + 0.015 * lit;
      S.nls[i].scale.set(0.25 + 0.05 * lit, 0.056 + 0.012 * lit, 1);
      S.nls[i].material.opacity = 0.45 + 0.55 * lit;
      S.nls[i].material.color.copy(PAL.ink);
    }
    if (S.spot) {
      S.spot.intensity = S.he * 0.85;   // a lift on the keeper, not a blackout of the hall
      if (S.hov >= 0 && S.statues[S.hov]) S.spot.position.set(S.statues[S.hov].position.x, 0.72, 0.42);
    }

    for (const L of S.light) L.l.intensity = L.base * flicker(t, L.b);
    for (let i = 0; i < S.flames.length; i++) {
      const g = S.flames[i], fl = g.userData.flame; if (!fl) continue;
      const k = flicker(t, i + 2);
      fl.scale.set(1 + k * 0.35, 1 + k * 0.45, 1);
      const gl = g.userData.glow; if (gl) gl.material.opacity = 0.42 + 0.2 * k;
    }
    if (S.embers.n) {
      const p = S.embers.pos, v = S.embers.vel, n = S.embers.n;
      for (let i = 0; i < n; i++) {
        p[i * 3 + 1] += v[i] * dt / 1000;
        p[i * 3] += Math.sin(t * 3 + i) * 0.0004;
        if (p[i * 3 + 1] > 0.35) { p[i * 3] = (Math.random() - 0.5) * 0.08; p[i * 3 + 1] = 0; }
      }
      S.embers.pts.geometry.attributes.position.needsUpdate = true;
    }
    if (S.dust) {
      const p = S.dust.pos, n = S.dust.n;
      for (let i = 0; i < n; i++) { p[i * 3 + 1] += S.dust.vel[i] * dt / 1000; if (p[i * 3 + 1] > 1.6) p[i * 3 + 1] = 0; }
      S.dust.pts.geometry.attributes.position.needsUpdate = true;
    }

    // the statues' glyph shader reads the nearby braziers: position plus this frame's flicker
    S.flames.forEach((g, i) => { if (i < 12) ASCII_U.uBz.value[i].set(g.position.x, g.position.y + 0.15, g.position.z, (i < 2 ? 0.6 : 0.45) * flicker(t, i + 2)); });
    draw();
    if (S.wanted) S.raf = requestAnimationFrame(animate);
    else stats.running = false;
  }
  function flicker(t, i) { return 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * (0.9 + i * 0.13) + i * 2.1)) * (0.6 + 0.4 * Math.sin(t * (0.5 + i * 0.07) + i * 1.3)); }

  function setRunning(on) {
    if (!S.ready) return;
    if (on && !S.raf && !document.hidden && S.wanted && !reduced() && !simple()) {
      S.t0 = performance.now() - S.t * 1000;
      stats.running = true;
      S.raf = requestAnimationFrame(animate);
    } else if (!on && S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; stats.running = false; }
  }

  /* ---------------- the legend card ---------------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function closeLegend() {
    if (!S.legend) return;
    const { el, back, onKey } = S.legend;
    document.removeEventListener('keydown', onKey, true);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    if (back) back.style.display = 'none';
    S.legend = null;
  }
  function openLegend(i) {
    const spot = S.el ? S.el.querySelectorAll('.hof-spot')[i] : null;
    if (!spot) return;
    closeLegend();
    const name = S.nl[i] || '';
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
    const back = S.el.querySelector('.hof-fallback');
    if (back) back.style.display = 'none';
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
    S.legend = { el: wrap, back, onKey, spot };
    const close = wrap.querySelector('[data-hf="close"]');
    if (close) close.focus();
  }

  /* ---------------- DOM + context ---------------- */
  function syncPan() {
    if (!S.el) return;
    const shift = S.pan * S.el.clientWidth / (2 * 0.95);
    S.el.querySelectorAll('.hof-spot').forEach(a => { a.dataset.hfShift = String(shift); a.style.transform = `translateX(${shift}px)`; });
  }
  function measure() {
    if (!S.el) return;
    const hb = S.el.getBoundingClientRect();
    if (!hb.width || !hb.height) return;
    S.aspect = hb.width / hb.height;
    const spots = [...S.el.querySelectorAll('.hof-spot')];
    S.sx = spots.map(a => { const r = a.getBoundingClientRect(), shift = Number(a.dataset.hfShift || 0); return (r.left - hb.left - shift + r.width / 2) / hb.width; });
    syncPan();
    if (S.cam) { S.cam.aspect = S.aspect; S.cam.updateProjectionMatrix(); }
    if (S.rnd) { S.rnd.setSize(hb.width, hb.height); }
  }
  function bind() {
    // Delegated on the hall itself: the Settings page redraws its cards, so the links under the pointer are new nodes.
    S.el.addEventListener('click', (e) => {
      if (S.suppressClick) { S.suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
      const a = e.target.closest && e.target.closest('.hof-spot');
      if (!a) { if (S.legend) closeLegend(); return; }
      e.preventDefault(); e.stopPropagation();
      const spots = [...S.el.querySelectorAll('.hof-spot')];
      const i = spots.indexOf(a);
      if (i >= 0) openLegend(i);
    });
    S.el.addEventListener('pointermove', (e) => {
      const r = S.el.getBoundingClientRect();
      S.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      S.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      const spots = [...S.el.querySelectorAll('.hof-spot')];
      const i = spots.findIndex(a => { const b = a.getBoundingClientRect(); return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom; });
      S.hov = i; stats.hover = i;
    });
    S.el.addEventListener('pointerdown', (e) => {   // touch has no hover: a press lights the keeper before the tap opens its legend
      const i = [...S.el.querySelectorAll('.hof-spot')].findIndex(a => { const b = a.getBoundingClientRect(); return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom; });
      S.hov = i; stats.hover = i;
      S.drag = { x: e.clientX, pan: S.pan, moved: false };
    });
    if (!S.dragBound) window.addEventListener('pointermove', (e) => {
      if (!S.drag || !S.el) return;
      const dx = e.clientX - S.drag.x;
      if (Math.abs(dx) > 8) S.drag.moved = true;
      if (S.drag.moved) {
        S.pan = Math.max(-1.15, Math.min(1.15, S.drag.pan + dx * (2 * 0.95 / Math.max(1, S.el.clientWidth))));
        syncPan();
      }
    }, { passive: true });
    if (!S.dragBound) window.addEventListener('pointerup', () => {
      if (!S.drag) return;
      if (S.drag.moved) { S.suppressClick = true; setTimeout(() => { S.suppressClick = false; }, 350); }
      S.drag = null;
    }, { passive: true });
    if (!S.dragBound) window.addEventListener('pointercancel', () => { S.drag = null; }, { passive: true });
    S.dragBound = true;
    S.el.addEventListener('pointerleave', () => { S.tx = 0; S.ty = 0; S.hov = -1; stats.hover = -1; });
    S.el.addEventListener('focusin', (e) => {
      const a = e.target.closest && e.target.closest('.hof-spot');
      if (!a) return;
      const spots = [...S.el.querySelectorAll('.hof-spot')];
      S.hov = spots.indexOf(a); stats.hover = S.hov;
    });
    S.el.addEventListener('focusout', () => { S.hov = -1; stats.hover = -1; });
  }

  function captureStill() {
    if (S.still || !S.rnd || !S.scene) return '';
    try {
      draw();
      S.still = S.rnd.domElement.toDataURL('image/png');   // alpha kept: the still sits over the generated backdrop
      const fb = S.el && S.el.querySelector('.hof-fallback');
      if (fb && S.still) { fb.src = S.still; fb.alt = 'The hall of the keepers: ten stone monkey generals in a colonnade, braziers between them.'; }
      return S.still;
    } catch { return ''; }
  }

  function draw() {
    if (!S.rnd || !S.scene) return;
    S.rnd.render(S.scene, S.cam);
  }

  function mount(el) {
    if (S.lost || S.bad) return;
    if (!S.cv) {
      const cv = document.createElement('canvas');
      cv.className = 'hf3';
      cv.setAttribute('aria-hidden', 'true');
      // WebGL2 first: the ASCII pass samples a render target and a glyph atlas per cell,
      // and WebGL2 gives it float-free, non-power-of-two targets and cheaper clears.
      const gl2 = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
      const rnd = gl2
        ? new THREE.WebGLRenderer({ canvas: cv, context: gl2, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true })
        : new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
      rnd.setPixelRatio(S.dpr);
      rnd.setClearColor(PAL.bg, 0);
      rnd.toneMapping = THREE.ACESFilmicToneMapping;   // holograms are bright: roll the highlights off instead of clipping
      rnd.toneMappingExposure = 0.62;
      rnd.outputEncoding = THREE.sRGBEncoding;
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.lost = true; setRunning(false); });
      cv.addEventListener('webglcontextrestored', () => { S.lost = false; });
      S.cv = cv; S.rnd = rnd; S.gl2 = !!gl2; 
    }
    S.cv.hidden = false;
    el.insertBefore(S.cv, el.querySelector('.hof-spots') || null);
    const fb = el.querySelector('.hof-fallback'); if (fb) fb.style.display = 'none';
    S.el = el;
    S.dpr = Math.min(window.devicePixelRatio || 1, 1);   // the hall is 866 px wide: 2x buys nothing and costs frames
    S.rnd.setPixelRatio(S.dpr);
    bind();
    measure();
    if (!S.ready) {
      if (!buildScene()) { S.bad = true; destroy(); return; }
      S.ready = true; stats.ready = true; S.gen++;
      ASCII_U.uCrystal.value.copy(PAL.mag); ASCII_U.uP1.value.copy(PAL.p1); ASCII_U.uP2.value.copy(PAL.p2); ASCII_U.uOut.value.copy(PAL.p1).multiplyScalar(0.55); ASCII_U.uOutHi.value.copy(PAL.gold);
      buildStatues(S.gen);   // the sculpts arrive one per tick, never as one long task
    }
    watch(el);
    S.wanted = true;
    if (S.ready) { S.cam.aspect = S.aspect; S.cam.updateProjectionMatrix(); draw(); }
    setRunning(true);
  }
  function destroy() {
    closeLegend();
    setRunning(false);
    if (S.io) S.io.disconnect(); if (S.ro) S.ro.disconnect();
    S.io = null; S.ro = null;
    if (S.cv && S.cv.parentNode) S.cv.parentNode.removeChild(S.cv);
    if (S.rnd) { S.rnd.dispose(); S.rnd = null; }
    S.cv = null;
    Object.assign(S, { el: null, scene: null, cam: null, statues: [], nl: [], nls: [], light: [], brazierPivots: [], flames: [], embers: { pos: null, vel: null, n: 0, pts: null }, dust: null, spot: null, hov: -1, he: 0, sx: [], tx: 0, ty: 0, px: 0, py: 0, cz: 0.86, cx: 0, wanted: false, ready: false, lost: false });
    stats.hover = -1; stats.ready = false; stats.statues = 0; S.gen++; S.built = false; TINTS = [];
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
  const reducedNow = () => reduced() || simple();

  function sync() {
    if (typeof THREE === 'undefined') return;
    if (S.scene) recolour();
    const el = document.querySelector('.hof');
    if (!el) { if (S.el) destroy(); return; }
    S.nl = [...el.querySelectorAll('.hof-spot span')].map(s => s.textContent.replace(/^@/, ''));
    if (reducedNow()) {
      if (S.el) {
        setRunning(false);
        if (S.cv) S.cv.hidden = true;
        const fb = S.el.querySelector('.hof-fallback');
        if (fb) { if (S.still) fb.src = S.still; fb.style.display = ''; }
      }
      return;
    }
    if (S.cv) S.cv.hidden = false;
    if (S.el && el !== S.el) {
      if (S.ready && S.cv) {
        el.insertBefore(S.cv, el.querySelector('.hof-spots') || null);
        const fb = el.querySelector('.hof-fallback'); if (fb) fb.style.display = 'none';
        S.el = el; bind(); watch(el); measure();
      } else destroy();
    }
    if (!S.el) { if (!S.bad) mount(el); return; }
    S.wanted = inView(S.el);
    setRunning(S.wanted);
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
