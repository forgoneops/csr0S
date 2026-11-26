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

  const EMBER = 0xff8a3d, GOLD = 0xc79a52;
  const BRAZIER_COLOR = EMBER;
  const stats = { running: false, frames: 0, avgMs: 0, hover: -1, ready: false };

  const reduced = () => {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch { /* no matchMedia */ }
    const m = document.documentElement.dataset.motion;
    return m === 'off' || m === 'reduced';
  };
  const simple = () => document.documentElement.classList.contains('nx-simple');

  const S = { el: null, cv: null, rnd: null, scene: null, cam: null, statues: [], nl: [], nls: [], light: [],
    brazierPivots: [], flames: [], embers: { pos: null, vel: null, n: 0 }, dust: null, spot: null, still: '', legend: null,
    sx: [], tx: 0, ty: 0, px: 0, py: 0, cz: 0.86, cx: 0, hov: -1, he: 0, t0: 0, t: 0,
    dpr: 1, aspect: 1.7777, io: null, ro: null, wanted: false, lost: false, bad: false, raf: 0 };

  // the browser checks' handle: scene state, framerate, which keeper is lit
  window.HF3 = { stats: () => ({ running: stats.running, frames: stats.frames, avgMs: Math.round(stats.avgMs * 100) / 100, hover: stats.hover, ready: S.ready }) };

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
    const c = col !== null ? new THREE.Color(col) : new THREE.Color('#6b6258').lerp(new THREE.Color('#7d6e5c'), (Math.random() - 0.4) * 0.3);
    c.multiplyScalar(0.34);   // the hall is the dark around the projections, not a lit room
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0.05 });
  }
  const goldMat = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(GOLD).multiplyScalar(0.55), roughness: 0.52, metalness: 0.55 });

  /* ---------------- the temple ---------------- */
  function mosaicTex() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#141009'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
      const v = 20 + ((i * 7 + j * 13) % 5) * 5;
      x.fillStyle = `rgb(${v + 9},${v + 4},${v - 3})`;
      x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30);
    }
    x.strokeStyle = '#8a6a3a'; x.lineWidth = 5; x.strokeRect(9, 9, 494, 494);
    x.strokeStyle = '#a5814a'; x.lineWidth = 3;
    x.beginPath(); x.arc(256, 256, 96, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(256, 256, 74, 0, Math.PI * 2); x.stroke();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      x.beginPath(); x.moveTo(256 + Math.cos(a) * 96, 256 + Math.sin(a) * 96);
      x.lineTo(256 + Math.cos(a) * 118, 256 + Math.sin(a) * 118); x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
    return t;
  }

  function bannerTex(flip) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 384;
    const x = c.getContext('2d');
    x.fillStyle = '#3a1812'; x.fillRect(0, 0, 128, 384);
    x.fillStyle = '#2a100c'; x.fillRect(0, 0, 128, 44);
    x.strokeStyle = '#b08248'; x.lineWidth = 4; x.strokeRect(6, 6, 116, 372);
    x.fillStyle = '#c79a52';
    x.beginPath(); x.moveTo(64, 120); x.lineTo(96, 190); x.lineTo(64, 260); x.lineTo(32, 190); x.closePath(); x.fill();
    x.fillStyle = '#3a1812';
    x.beginPath(); x.moveTo(64, 150); x.lineTo(82, 190); x.lineTo(64, 230); x.lineTo(46, 190); x.closePath(); x.fill();
    x.fillStyle = '#c79a52'; x.font = '600 20px ui-monospace, monospace'; x.textAlign = 'center';
    x.fillText(flip ? 'S·P·Q·C' : 'LEGIO', 64, 330);
    return new THREE.CanvasTexture(c);
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
    const flameMat = new THREE.MeshBasicMaterial({ color: BRAZIER_COLOR, transparent: true, opacity: 0.92 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.028 * big, 0.07 * big, 8), flameMat);
    flame.position.y = 0.14 * big; flame.userData.flame = flame;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTex(), color: BRAZIER_COLOR, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(0.3 * big, 0.3 * big, 1); glow.position.y = 0.15 * big;
    const ghost = new THREE.Mesh(new THREE.ConeGeometry(0.018 * big, 0.05 * big, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.5 }));
    ghost.position.set(0.012 * big, 0.155 * big, 0.006 * big);
    g.add(foot, stem, bowl, flame, ghost, glow);
    g.userData.flame = flame; g.userData.glow = glow;
    return g;
  }

  function makeGlowTex() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(32, 32, 2, 32, 32, 28);
    grd.addColorStop(0, 'rgba(255,180,100,1)'); grd.addColorStop(0.4, 'rgba(255,120,50,0.5)'); grd.addColorStop(1, 'rgba(255,90,40,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /* ---------------- a monkey general ---------------- */
  /* Ten keepers, each with its own helmet crest, cloak, weapon and relic; all share the ape face, the lorica
     and the curved tail, so the hall reads as one troop and not ten copies. */
  /* one keeper: an ape general projected as a hologram. Many small parts, so the silhouette reads at a
     glance — helmet and crest, pauldrons, banded lorica, arms with a spear or a shield, and a cloak —
     then lit by its own rim light and drifting scanlines. */
  const HOLO_U = { uTime: { value: 0 } };
  function holoMaterial(c, extra) {
    const m = new THREE.MeshStandardMaterial(Object.assign({
      color: new THREE.Color(c).multiplyScalar(0.38), emissive: c, emissiveIntensity: 0.5,
      roughness: 0.36, metalness: 0.08,
    }, extra || {}));
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = HOLO_U.uTime;
      sh.vertexShader = 'varying vec3 vHp; varying vec3 vHn;\n' + sh.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vHp = position; vHn = normalize(normalMatrix * normal);');
      sh.fragmentShader = 'uniform float uTime; varying vec3 vHp; varying vec3 vHn;\n' + sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n' +
        '  float rim = pow(1.0 - abs(clamp(vHn.z, -1.0, 1.0)), 2.0);\n' +
        '  float scan = 0.5 + 0.5 * sin(vHp.y * 230.0 - uTime * 2.6);\n' +
        '  gl_FragColor.rgb += vec3(rim * 0.42 + scan * 0.045);\n');
    };
    return m;
  }

  function general(i, ux) {
    const g = new THREE.Group();
    const seed = Math.sin(i * 12.9898 + 78.233) * 43758.5453, f = seed - Math.floor(seed);
    const sc = 0.94 + f * 0.12;

    const TINT = [0x7fd8ff, 0x8ce8c6, 0xffc46b, 0xc39bff, 0x6fd0ff][i % 5];
    const mat = holoMaterial(TINT);
    const trim = holoMaterial(0xffe7bd, { emissiveIntensity: 0.8 });
    const dark = holoMaterial(new THREE.Color(TINT).multiplyScalar(0.45).getHex(), { emissiveIntensity: 0.3 });
    const cloak = holoMaterial([0x2f8f8a, 0x3a4f9e, 0x6a3f9e, 0x2f7f5e][i % 4], { side: THREE.DoubleSide, emissiveIntensity: 0.34 });
    const crest = holoMaterial([0xff6a3d, 0x4fd0e0, 0xffc46b, 0xb07bff][i % 4], { emissiveIntensity: 0.72 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xfff3cf });

    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const me = new THREE.Mesh(geo, m);
      me.position.set(x * sc, y * sc, z * sc); me.rotation.set(rx, ry, rz); g.add(me); return me;
    };
    const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => add(new THREE.BoxGeometry(w * sc, h * sc, d * sc), m, x, y, z, rx, ry, rz);
    const ball = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const me = add(new THREE.SphereGeometry(r * sc, 14, 10), m, x, y, z); me.scale.set(sx, sy, sz); return me; };
    const cyl = (rt, rb, h, m, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => add(new THREE.CylinderGeometry(rt * sc, rb * sc, h * sc, seg), m, x, y, z, rx, ry, rz);

    /* ---- the plinth: three steps, a cartouche, and the projection ring in the animate loop ---- */
    cyl(0.105, 0.118, 0.022, dark, 0, 0.011, 0, 0, 0, 0, 10);
    cyl(0.09, 0.102, 0.028, mat, 0, 0.036, 0, 0, 0, 0, 10);
    cyl(0.074, 0.082, 0.01, trim, 0, 0.055, 0, 0, 0, 0, 10);
    box(0.104, 0.016, 0.006, trim, 0, 0.044, 0.077);

    /* ---- legs: sandals, greaves, knees, thighs under the skirt ---- */
    for (const s of [-1, 1]) {
      box(0.048, 0.018, 0.078, dark, s * 0.031, 0.068, 0.012);          // sole
      box(0.044, 0.02, 0.05, mat, s * 0.031, 0.08, 0.018);              // foot
      cyl(0.021, 0.024, 0.075, mat, s * 0.031, 0.118, 0.002, 0, 0, 0, 10); // shin
      cyl(0.024, 0.026, 0.016, trim, s * 0.031, 0.152, 0.002, 0, 0, 0, 10); // knee guard
      ball(0.017, dark, s * 0.031, 0.152, 0.004);
      cyl(0.023, 0.021, 0.06, dark, s * 0.031, 0.192, 0, 0, 0, 0, 9);   // thigh
    }

    /* ---- skirt of pteruges over the hips ---- */
    cyl(0.052, 0.078, 0.075, dark, 0, 0.244, 0, 0, 0, 0, 14);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      box(0.018, 0.07, 0.008, mat, Math.sin(a) * 0.066, 0.238, Math.cos(a) * 0.066, 0, a, 0);
    }

    /* ---- torso: banded lorica over a narrow waist ---- */
    cyl(0.05, 0.058, 0.1, dark, 0, 0.3, 0, 0, 0, 0, 14);
    for (let k = 0; k < 4; k++) {
      cyl(0.056 + k * 0.001, 0.06 + k * 0.001, 0.019, mat, 0, 0.272 + k * 0.026, 0, 0, 0, 0, 16);
      cyl(0.057 + k * 0.001, 0.057 + k * 0.001, 0.003, trim, 0, 0.286 + k * 0.026, 0, 0, 0, 0, 16);
    }
    // belt and buckle
    add(new THREE.TorusGeometry(0.055 * sc, 0.006 * sc, 6, 20), trim, 0, 0.258, 0, Math.PI / 2, 0, 0);
    box(0.02, 0.016, 0.008, trim, 0, 0.258, 0.056);
    // chest emblem
    add(new THREE.TorusGeometry(0.016 * sc, 0.004 * sc, 6, 16), crest, 0, 0.318, 0.052);
    ball(0.008, eye, 0, 0.318, 0.052);

    /* ---- shoulders, pauldrons, arms; the right hand carries the weapon ---- */
    for (const s of [-1, 1]) {
      ball(0.021, mat, s * 0.056, 0.348, 0);
      ball(0.028, mat, s * 0.062, 0.352, 0, 1, 0.62, 1);         // pauldron
      add(new THREE.TorusGeometry(0.026 * sc, 0.0035 * sc, 6, 14), trim, s * 0.062, 0.336, 0, Math.PI / 2, 0, 0);
      ball(0.011, dark, s * 0.058, 0.362, 0.014);                 // rivet
    }
    // upper arms angled out, elbows, forearms
    cyl(0.014, 0.016, 0.07, mat, -0.076, 0.314, 0.006, 0, 0, 0.22, 9);
    ball(0.015, dark, -0.086, 0.281, 0.014);
    cyl(0.013, 0.014, 0.088, mat, -0.093, 0.242, 0.032, -0.5, 0, 0.12, 9);
    box(0.026, 0.022, 0.022, dark, -0.099, 0.2, 0.055);            // left hand, holding the shield or relic
    cyl(0.014, 0.016, 0.07, mat, 0.076, 0.318, 0.006, 0, 0, -0.16, 9);
    ball(0.015, dark, 0.084, 0.286, 0.01);
    cyl(0.014, 0.013, 0.098, mat, 0.096, 0.246, 0.022, -0.15, 0, -0.05, 9);
    box(0.024, 0.024, 0.024, dark, 0.101, 0.198, 0.028);          // right hand, on the shaft

    /* ---- neck and head: skull, brow, muzzle, ears, jaw, eyes ---- */
    cyl(0.018, 0.021, 0.022, dark, 0, 0.378, 0, 0, 0, 0, 10);
    const hy = 0.404;
    ball(0.044, mat, 0, hy, 0, 1.06, 1.02, 0.98);                  // skull
    ball(0.031, mat, 0, hy - 0.016, 0.034, 1.05, 0.92, 1.0);         // muzzle
    ball(0.018, dark, 0, hy - 0.008, 0.056, 1, 0.7, 0.55);        // mouth
    ball(0.014, mat, 0, hy + 0.002, 0.05, 1.15, 0.78, 0.9);         // nose
    box(0.062, 0.012, 0.016, dark, 0, hy + 0.016, 0.038);         // brow ridge
    for (const s of [-1, 1]) {
      ball(0.014, mat, s * 0.042, hy + 0.002, 0.002, 1, 1.25, 0.55); // ears
      ball(0.0068, eye, s * 0.017, hy + 0.004, 0.042);            // eyes, set low under the brow
      box(0.015, 0.036, 0.026, dark, s * 0.033, hy - 0.026, 0.016); // jaw
    }

    /* ---- helmet: dome, rim, cheek guards, crest and plume ---- */
    const dome = add(new THREE.SphereGeometry(0.048 * sc, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat, 0, hy + 0.01, 0);
    dome.scale.set(1.04, 1.0, 1.02);
    add(new THREE.TorusGeometry(0.047 * sc, 0.0045 * sc, 6, 18), trim, 0, hy + 0.008, 0, Math.PI / 2, 0, 0);
    for (const s of [-1, 1]) box(0.014, 0.034, 0.028, mat, s * 0.042, hy - 0.014, 0.008, 0, 0, s * 0.12);
    box(0.008, 0.03, 0.078, crest, 0, hy + 0.056, -0.004);          // crest ridge
    for (let k = 0; k < 8; k++) {                                   // plume along the ridge
      const t = k / 7;
      add(new THREE.ConeGeometry((0.012 - t * 0.008) * sc, 0.03 * sc, 6), crest, 0, hy + 0.056 + t * 0.012, 0.03 - t * 0.075, -0.5 + t * 0.9, 0, 0);
    }

    /* ---- cloak: two curved panels behind, a fold on the left, a pin at the shoulder ---- */
    const cape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05 * sc, 0.098 * sc, 0.245 * sc, 14, 1, true, Math.PI * 0.18, Math.PI * 1.1), cloak);
    cape.position.set(0, 0.3 * sc, -0.018 * sc); cape.rotation.y = (f - 0.5) * 0.5; g.add(cape);
    box(0.04, 0.13, 0.012, cloak, -0.052, 0.3, 0.018, 0.1, 0.35, 0.24);
    box(0.012, 0.012, 0.012, trim, 0.05, 0.352, 0.02);

    /* ---- weapon in the right hand and shield or relic in the left ---- */
    const ox = -0.096, oy = 0.213;
    if (i % 3 === 0) {
      // spear: shaft, leaf blade, butt
      cyl(0.004, 0.004, 0.44, dark, 0.1, 0.28, 0.03, 0, 0, 0.03, 6);
      ball(0.012, trim, 0.107, 0.5, 0.032, 0.7, 1.8, 0.4);
      box(0.008, 0.02, 0.008, trim, 0.098, 0.06, 0.03);
    } else if (i % 3 === 1) {
      // standard with an eagle
      cyl(0.004, 0.004, 0.4, dark, 0.1, 0.3, 0.03, 0, 0, 0.02, 6);
      box(0.03, 0.02, 0.006, trim, 0.106, 0.49, 0.03, 0, 0, 0.2);
      box(0.018, 0.03, 0.004, crest, 0.104, 0.52, 0.03);
    } else {
      // axe
      cyl(0.0045, 0.0045, 0.3, dark, 0.1, 0.32, 0.03, 0, 0, 0.02, 6);
      box(0.05, 0.03, 0.008, trim, 0.128, 0.45, 0.03, 0, 0, 0.35);
    }
    if (i % 2 === 0) {
      const sh = add(new THREE.CylinderGeometry(0.044 * sc, 0.044 * sc, 0.008 * sc, 16), mat, ox, oy, 0.055, Math.PI / 2, 0, 0.2);
      add(new THREE.TorusGeometry(0.044 * sc, 0.004 * sc, 6, 18), trim, ox, oy, 0.058, Math.PI / 2, 0, 0.2);
      ball(0.012, trim, ox, oy, 0.066);
      sh.material = mat;
    } else {
      if (i === 1) { box(0.03, 0.045, 0.014, dark, ox, oy, 0.055, 0, 0.2, 0); box(0.03, 0.004, 0.016, trim, ox, oy + 0.014, 0.062); }
      else if (i === 3) { add(new THREE.CylinderGeometry(0.026 * sc, 0.026 * sc, 0.006 * sc, 18), trim, ox, oy, 0.055, Math.PI / 2, 0, 0.3); }
      else if (i === 5) { add(new THREE.TorusGeometry(0.022 * sc, 0.006 * sc, 6, 14), trim, ox, oy, 0.055); }
      else if (i === 7) { ball(0.02, crest, ox, oy, 0.055, 1, 1, 0.6); }
      else { ball(0.016, eye, ox, oy, 0.055); }
    }

    /* ---- the projection itself: a lit ring at the feet and a drifting scanline shell ---- */
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095 * sc, 0.0035 * sc, 8, 48),
      new THREE.MeshBasicMaterial({ color: TINT, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.002 * sc; g.add(ring);
    if (!S.scanTex) S.scanTex = scanTexture();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * sc, 0.1 * sc, 0.56 * sc, 22, 1, true),
      new THREE.MeshBasicMaterial({ map: S.scanTex, color: TINT, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    shell.position.y = 0.3 * sc; g.add(shell);
    g.userData.ring = ring; g.userData.shell = shell;
    g.position.x = ux;
    g.rotation.y = (f - 0.5) * 0.2;   // each keeper stands a little differently
    return g;
  }

  /* the glowing nameplate under each keeper: a canvas texture so the handle stays crisp */
  function nameplate(name) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 72;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 320, 72);
    x.fillStyle = '#0a0806d9'; x.fillRect(0, 0, 320, 72);
    x.strokeStyle = '#c79a52'; x.lineWidth = 2; x.strokeRect(1.5, 1.5, 317, 69);
    x.strokeStyle = '#ff8a3d55'; x.strokeRect(7, 7, 306, 58);
    x.font = '600 34px ui-monospace, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffd9a0'; x.shadowColor = '#ff8a3d'; x.shadowBlur = 16;
    x.fillText('@' + name, 160, 37);
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.renderOrder = 10;   // a nameplate is a label: never hidden by a helmet
    sp.scale.set(0.17, 0.038, 1);
    sp.position.y = 0.005;
    return sp;
  }

  /* ---------------- the hall ---------------- */
  function buildScene() {
    const W = 0.95;                    // half-width of the line: ten keepers inside a close camera
    const scene = new THREE.Scene();
    scene.background = null;   // the generated temple backdrop sits behind the glyphs
    scene.fog = new THREE.Fog(0x070503, 3.0, 7.2);

    const cam = new THREE.PerspectiveCamera(50, S.aspect, 0.1, 24);
    cam.position.set(0, 0.3, 1.16); cam.lookAt(0, 0.24, -0.55);   // close to the line: a keeper fills half the frame

    scene.add(new THREE.AmbientLight(0x3a3026, 0.16));
    const key = new THREE.DirectionalLight(0xffd9a0, 0.45); key.position.set(1.6, 1.6, 1.4); scene.add(key);   // a hard key makes the glyphs model volume
    const fill = new THREE.DirectionalLight(0x2f4a55, 0.22); fill.position.set(-2.2, 0.4, 1.0); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff8a3d, 0.62); rim.position.set(0, 0.8, -2.0); scene.add(rim);

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
      plate.position.set(0, 0.5, 0.03);   // child of the statue: never add the hall offset twice
      plate.scale.set(0.22, 0.0495, 1);
      plate.material.opacity = 0.38;
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
      const l = new THREE.PointLight(BRAZIER_COLOR, 1.5, 3.0, 2);
      l.position.copy(p.position); l.position.y = 0.22;
      scene.add(l); S.light.push({ l, b: i, base: 1.5 });
    }
    const spot = new THREE.PointLight(0xffc98a, 0, 2.4, 2);
    spot.position.set(0, 0.7, 0.4); scene.add(spot); S.spot = spot;

    // god rays behind the keepers
    for (const x of [-1.1, 0.2, 1.3]) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.9, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb877, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ray.position.set(x, 1.05, -0.35); ray.rotation.z = 0.12; scene.add(ray);
    }

    // dust in the light
    const nD = 120, dp = new Float32Array(nD * 3), dv = new Float32Array(nD);
    for (let i = 0; i < nD; i++) { dp[i * 3] = (Math.random() - 0.5) * 4.4; dp[i * 3 + 1] = Math.random() * 1.5; dp[i * 3 + 2] = (Math.random() - 0.5) * 0.9; dv[i] = 0.01 + Math.random() * 0.02; }
    const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0xffcf9a, size: 0.005, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(dust); S.dust = { pos: dp, vel: dv, n: nD, pts: dust };

    // embers rising from the central fire
    const nE = 140, pos = new Float32Array(nE * 3), vel = new Float32Array(nE);
    for (let i = 0; i < nE; i++) { pos[i * 3] = (Math.random() - 0.5) * 0.08; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0.16; vel[i] = 0.4 + Math.random() * 0.8; }
    const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ePts = new THREE.Points(eGeo, new THREE.PointsMaterial({ color: 0xffb864, size: 0.009, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    ePts.position.set(0, 0.02, 0); scene.add(ePts);
    S.embers = { pos, vel, n: nE, pts: ePts };

    // Caesar, the small ape, on a low seat at the centre of the hall, looking up at the keepers
    const ape = new THREE.Group();
    const aMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 1 });
    const aBody = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), aMat); aBody.scale.set(1, 1.15, 0.8); aBody.position.y = 0.03;
    const aHead = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), aMat); aHead.position.set(0, 0.06, 0.02);
    const aSeat = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.09), stone('#4a4034')); aSeat.position.y = 0.008;
    ape.add(aSeat, aBody, aHead);
    const dais = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.2), stone('#4a4034')); dais.position.set(0, 0.05, -0.42); scene.add(dais);
    ape.position.set(0, 0.11, -0.42); ape.rotation.y = Math.PI; scene.add(ape);

    Object.assign(S, { scene, cam });
    return true;
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
    S.cz += ((S.hov >= 0 ? 0.12 : 1.16) - S.cz) * 0.10;
    S.cx += (live * 0.9 - S.cx) * 0.10;
    S.cam.position.x = S.cx + S.px * 0.22;
    S.cam.position.y = 0.3 + S.py * 0.05;
    S.cam.position.z = S.cz;
    S.cam.lookAt(S.cx, S.hov >= 0 ? 0.34 : 0.24, -0.55);
    S.cam.lookAt(S.px * 0.1, 0.2, 0);

    // the lit keeper steps forward, its nameplate brightens
    for (let i = 0; i < S.statues.length; i++) {
      const lit = i === S.hov ? S.he : 0;
      const st = S.statues[i];
      st.position.z = lit * 0.055;
      st.position.y = lit * 0.004;
      if (!S.nls[i]) continue;
      S.nls[i].scale.set(0.22 + 0.26 * lit, 0.0495 + 0.058 * lit, 1);
      S.nls[i].material.opacity = 0.38 + 0.62 * lit;
      S.nls[i].material.color.setRGB(1, 0.9 + 0.1 * lit, 0.72 + 0.28 * lit);
    }
    if (S.spot) {
      S.spot.intensity = S.he * 0.85;   // a lift on the keeper, not a blackout of the hall
      if (S.hov >= 0 && S.statues[S.hov]) S.spot.position.set(S.statues[S.hov].position.x, 0.72, 0.42);
    }

    for (const L of S.light) L.l.position.intensity = L.base * flicker(t, L.b);
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

    if (S.scanTex) S.scanTex.offset.y = (t * 0.06) % 1;
    HOLO_U.uTime.value = t;
    for (let i = 0; i < S.statues.length; i++) {
      const st = S.statues[i], ring = st.userData.ring, shell = st.userData.shell;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + i * 0.9);
      if (ring) ring.material.opacity = 0.42 + 0.3 * pulse;
      if (shell) shell.material.opacity = 0.09 + 0.06 * pulse + (i === S.hov ? 0.05 : 0);
    }
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
  function measure() {
    if (!S.el) return;
    const hb = S.el.getBoundingClientRect();
    if (!hb.width || !hb.height) return;
    S.aspect = hb.width / hb.height;
    const spots = [...S.el.querySelectorAll('.hof-spot')];
    S.sx = spots.map(a => { const r = a.getBoundingClientRect(); return (r.left - hb.left + r.width / 2) / hb.width; });
    if (S.cam) { S.cam.aspect = S.aspect; S.cam.updateProjectionMatrix(); }
    if (S.rnd) { S.rnd.setSize(hb.width, hb.height); }
    if (S.ascii) S.ascii.size(hb.width, hb.height);
  }
  function bind() {
    // Delegated on the hall itself: the Settings page redraws its cards, so the links under the pointer are new nodes.
    S.el.addEventListener('click', (e) => {
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

  /* ---------------- the ASCII film ----------------
     The hall is rendered into a small target, one texel per character cell, and a
     full-screen pass replaces every cell with the glyph whose weight matches that
     cell's light. Statues, columns and fire then read as carved ASCII instead of
     smooth primitives, and it costs one small extra draw, no extra geometry. */
  function scanTexture() {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64;
    const x = cv.getContext('2d');
    for (let y = 0; y < 64; y++) { const a = y % 8 < 2 ? 0.55 : 0.06; x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(0, y, 4, 1); }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 5); t.minFilter = THREE.LinearFilter;
    return t;
  }

  const GLYPHS = ' .:-=+*#%@';
  function makeAscii(rnd) {
    const cs = 64, n = GLYPHS.length;
    const gc = document.createElement('canvas'); gc.width = n * cs; gc.height = cs;
    const gx = gc.getContext('2d');
    gx.fillStyle = '#000'; gx.fillRect(0, 0, gc.width, gc.height);
    gx.fillStyle = '#fff';
    gx.font = '600 54px ui-monospace, "Martian Mono", "DejaVu Sans Mono", monospace';
    gx.textAlign = 'center'; gx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) gx.fillText(GLYPHS[i], i * cs + cs / 2, cs / 2 + 3);
    const atlas = new THREE.CanvasTexture(gc);
    atlas.minFilter = THREE.LinearFilter; atlas.magFilter = THREE.LinearFilter;
    atlas.generateMipmaps = false; atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;

    const rt = new THREE.WebGLRenderTarget(160, 90, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: true, stencilBuffer: false
    });

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: rt.texture },
        tGlyph: { value: atlas },
        res: { value: new THREE.Vector2(160, 90) },
        gn: { value: n },
        tint: { value: new THREE.Color(0xe9d6ae) },
        gain: { value: 2.35 }
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D tScene, tGlyph;',
        'uniform vec2 res; uniform float gn; uniform vec3 tint; uniform float gain;',
        'void main(){',
        '  vec2 c = floor(vUv * res);',
        '  vec2 cu = (c + 0.5) / res;',
        '  vec3 col = texture2D(tScene, cu).rgb;',
        '  float l = dot(col, vec3(0.299, 0.587, 0.114)) * gain + 0.05;   // a floor of dim glyphs keeps the architecture',
        '  l = pow(clamp(l, 0.0, 1.0), 0.72);',
        '  float idx = floor(l * (gn - 1.0) + 0.5);',
        '  vec2 f = fract(vUv * res);',
        '  float g = texture2D(tGlyph, vec2((idx + f.x) / gn, f.y)).r;',
        '  vec3 nb = texture2D(tScene, cu + vec2(1.6 / res.x, 0.0)).rgb + texture2D(tScene, cu - vec2(1.6 / res.x, 0.0)).rgb',
        '          + texture2D(tScene, cu + vec2(0.0, 1.6 / res.y)).rgb + texture2D(tScene, cu - vec2(0.0, 1.6 / res.y)).rgb;',
        '  vec3 ink = col * 2.35 + tint * 0.12 + nb * 0.10;   // the cell keeps its own colour: cloaks, bronze, fire',
        '  gl_FragColor = vec4(ink * g, g);   // transparent where no glyph: the backdrop shows through',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const scene = new THREE.Scene(); scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
      rt, scene, cam, mat, atlas,
      size(w, h) {
        const cell = 10;                       // one glyph every ten CSS pixels: dense enough for armour, still legible as ASCII
        const cw = Math.max(40, Math.ceil(w / cell)), ch = Math.max(24, Math.ceil(h / cell));
        if (cw === rt.width && ch === rt.height) return;
        rt.setSize(cw, ch); mat.uniforms.res.value.set(cw, ch);
      },
      dispose() { rt.dispose(); atlas.dispose(); mat.dispose(); quad.geometry.dispose(); }
    };
  }

  function draw() {
    if (!S.rnd || !S.scene) return;
    if (!S.ascii) { S.rnd.render(S.scene, S.cam); return; }
    S.rnd.setRenderTarget(S.ascii.rt);
    S.rnd.clear();
    S.rnd.render(S.scene, S.cam);
    S.rnd.setRenderTarget(null);
    S.rnd.render(S.ascii.scene, S.ascii.cam);
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
      rnd.setClearColor(0x000000, 0);
      rnd.toneMapping = THREE.ACESFilmicToneMapping;   // holograms are bright: roll the highlights off instead of clipping
      rnd.toneMappingExposure = 0.62;
      rnd.outputEncoding = THREE.sRGBEncoding;
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.lost = true; setRunning(false); });
      cv.addEventListener('webglcontextrestored', () => { S.lost = false; });
      S.cv = cv; S.rnd = rnd; S.gl2 = !!gl2; S.ascii = null;   // holograms are drawn directly; the ASCII film stays in makeAscii for the ASCII skin
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
      S.ready = true; stats.ready = true;
    }
    watch(el);
    S.wanted = true;
    if (S.ready) { S.cam.aspect = S.aspect; S.cam.updateProjectionMatrix(); draw(); captureStill(); }
    setRunning(true);
  }
  function destroy() {
    closeLegend();
    setRunning(false);
    if (S.io) S.io.disconnect(); if (S.ro) S.ro.disconnect();
    S.io = null; S.ro = null;
    if (S.cv && S.cv.parentNode) S.cv.parentNode.removeChild(S.cv);
    if (S.ascii) { S.ascii.dispose(); S.ascii = null; }
    if (S.rnd) { S.rnd.dispose(); S.rnd = null; }
    S.cv = null;
    Object.assign(S, { el: null, scene: null, cam: null, statues: [], nl: [], nls: [], light: [], brazierPivots: [], flames: [], embers: { pos: null, vel: null, n: 0, pts: null }, dust: null, spot: null, scanTex: null, hov: -1, he: 0, sx: [], tx: 0, ty: 0, px: 0, py: 0, cz: 0.86, cx: 0, wanted: false, ready: false, lost: false });
    stats.hover = -1; stats.ready = false;
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
    new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-motion'] });
  }
  addEventListener('scroll', later, { passive: true, capture: true });
  addEventListener('resize', () => { if (S.el) { measure(); S.wanted = inView(S.el); setRunning(S.wanted); } });
  document.addEventListener('visibilitychange', () => document.hidden ? setRunning(false) : setRunning(S.wanted));
  sync();
})();
