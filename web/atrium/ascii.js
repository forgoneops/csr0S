// ASCII background: a tonal picture made of characters (ascii-scene.js, built from the lair art), not scrolling text.
// One WebGL2 pass, one full-screen triangle, a glyph atlas and a scene texture. It sits UNDER the WebGL lines and is nearly
// invisible at rest (alpha only breathes). A small light grid, fed by background.js with the line segments and the travelling
// pulses, tints and brightens the glyphs next to a line, so the lines read as lighting the picture.
(function () {
  const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~░▒▓█▪┌┐└┘├┤┬┴┼─│═║◆◇▸▴▾";
  const GC = 14, GS = 12; // atlas columns, light-grid cell in css px
  // The picture: rows of ramp glyphs from ascii-scene.js (generated at build time by tools/make-ascii-scene.ts). Texture: R = atlas glyph, G = tone level 0..255.
  const SCENE = window.caesarosAsciiScene || { ramp: " .:-=+*#%@", cols: 1, rows: [" "] };
  const COLS = SCENE.cols, ROWS = SCENE.rows.length, CW = .6; // scene cells; glyph cell width : height
  const buildScene = () => {
    const a = new Uint8Array(COLS * ROWS * 2), n = SCENE.ramp.length - 1;
    SCENE.rows.forEach((row, y) => { for (let x = 0; x < COLS; x++) { const lv = Math.max(0, SCENE.ramp.indexOf(row[x] || " ")); a[(y * COLS + x) * 2] = Math.max(0, CHARS.indexOf(SCENE.ramp[lv])); a[(y * COLS + x) * 2 + 1] = Math.round(lv / n * 255); } });
    return a;
  };
  // Cover-fit of the scene on the screen, in css px: cell height k, scene origin (Caesar, right of centre, stays in view on a phone).
  const fit = (w, h) => { const k = Math.max(w / (COLS * CW), h / ROWS); return { k, x0: (w - COLS * CW * k) * .62, y0: (h - ROWS * k) * .5 }; };
  // alpha of a glyph: barely there at rest, up to ~25% where a line lights it
  const A_BASE = [.03, .045], A_LIT = [.2, .26]; // [calm, rich]

  // Light grid: R = ember, G = cyan; static glow from the traces, moving glow from the pulses, short afterglow. Shared by the WebGL and the 2D renderer.
  const lightGrid = () => {
    let gw = 0, gh = 0, base, mem, out;
    const splat = (x, y, ch, v, R) => {
      const gx = Math.floor(x / GS), gy = Math.floor(y / GS), R2 = (R * GS) ** 2 * .6; // cheap bell, no exp
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const X = gx + i, Y = gy + j; if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
        const dx = (X + .5) * GS - x, dy = (Y + .5) * GS - y, q = 1 - (dx * dx + dy * dy) / R2; if (q <= 0) continue;
        const val = v * q * q, k = (Y * gw + X) * 2 + ch; if (val > mem[k]) mem[k] = val;
      }
    };
    return {
      dims: () => [gw, gh], out: () => out,
      build(w, h, net) {
        gw = Math.ceil(w / GS); gh = Math.ceil(h / GS); base = new Float32Array(gw * gh * 2); mem = new Float32Array(gw * gh * 2); out = new Uint8Array(gw * gh * 2);
        for (const p of net) for (let i = 1; i < p.pts.length; i++) { // static glow: distance of each nearby cell to the segment
          const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i], ch = p.live ? 1 : 0, R = 3;
          const x0 = Math.max(0, Math.floor((Math.min(ax, bx)) / GS) - R), x1 = Math.min(gw - 1, Math.floor(Math.max(ax, bx) / GS) + R), y0 = Math.max(0, Math.floor(Math.min(ay, by) / GS) - R), y1 = Math.min(gh - 1, Math.floor(Math.max(ay, by) / GS) + R);
          const dx = bx - ax, dy = by - ay, l2 = Math.max(1e-4, dx * dx + dy * dy);
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const cx = (x + .5) * GS, cy = (y + .5) * GS, t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / l2)), d = Math.hypot(cx - ax - dx * t, cy - ay - dy * t);
            const v = .3 * Math.exp(-(d * d) / (2 * 16 * 16)), k = (y * gw + x) * 2 + ch; if (v > base[k]) base[k] = v;
          }
        }
      },
      step(s) {
        for (let i = 0; i < mem.length; i++) mem[i] = Math.max(base[i] * (s.rich ? 1.6 : 1), mem[i] * (s.animating ? (s.rich ? .955 : .9) : 1));
        if (s.animating) for (const p of s.net) {
          const head = (p.at + s.phase * p.speed) % (p.total + 90), ch = p.live ? 1 : 0;
          const N = s.rich ? 18 : 10; for (let k = 0; k < N; k += k ? 3 : 1) { const d = head - k * 6; if (d < 0 || d > p.total) continue; const [x, y] = s.pointAt(p, d); splat(x, y, ch, k ? .55 * (1 - k / N) : 1, k ? 3 : (s.rich ? 5 : 4)); }
        }
        for (let i = 0; i < mem.length; i++) out[i] = Math.min(255, mem[i] * 255);
      },
    };
  };

  // 2D renderer for when WebGL2 is missing or the context was lost: the same picture, lit by the same light grid.
  const ascii2d = (canvas) => {
    const c = canvas.getContext("2d"); if (!c) return null;
    const lg = lightGrid(), scene = buildScene(); let w = 0, h = 0, dpr = 1, at = 0;
    const hex = (v) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(v.trim()); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [204, 112, 66]; };
    return {
      resize(W, H, net) { w = W; h = H; dpr = Math.min(devicePixelRatio || 1, 1.25); canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); lg.build(w, h, net); },
      render(s) {
        const now = performance.now(); if (s.animating && now - at < 100) return; at = now; // ~10 fps: a glyph grid is costly in 2D
        c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
        if (!s.on || !lg.dims()[0]) return;
        lg.step(s);
        const [gw, gh] = lg.dims(), o = lg.out(), ac = hex(s.accent), sg = hex(s.signal), { k, x0, y0 } = fit(w, h), cw = k * CW, R = s.rich ? 1 : 0;
        c.font = `${k}px "CaesarOS Mono", ui-monospace, monospace`; c.textBaseline = "top";
        for (let y = 0; y < ROWS; y++) { const py = y0 + y * k; if (py + k < 0 || py > h) continue;
          for (let x = 0; x < COLS; x++) {
            const px = x0 + x * cw; if (px + cw < 0 || px > w) continue;
            const i = (y * COLS + x) * 2, lv = scene[i + 1] / 255, k2 = (Math.min(gh - 1, Math.max(0, Math.floor((py + k / 2) / GS))) * gw + Math.min(gw - 1, Math.max(0, Math.floor((px + cw / 2) / GS)))) * 2;
            const r = o[k2] / 255, b = o[k2 + 1] / 255, lit = Math.min(1, r + b);
            let g = scene[i]; if (!g && lit > .15) g = CHARS.indexOf("."); if (!g) continue;
            const col = b > r ? sg : ac, a = (A_BASE[R] * (.5 + lv) + lit * A_LIT[R] * (.4 + .6 * lv)) * .9;
            c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`; c.fillText(CHARS[g], px, py);
          } }
      },
    };
  };

  window.caesarosAscii = function (canvas, opts) {
    const gl = opts?.force2d ? null : canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    if (!gl) return ascii2d(canvas);
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    try {
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, `#version 300 es
        void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position=vec4(p*2.-1.,0.,1.); }`));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `#version 300 es
        precision highp float; precision highp sampler2D;
        uniform sampler2D uAtlas, uLight, uText; uniform vec2 uRes; uniform float uScale, uT, uOn, uRich; uniform vec4 uMask[16]; uniform float uMaskN, uMaskK;
        uniform vec3 uAccent, uSignal; uniform vec2 uHole; uniform vec3 uFit; out vec4 o;
        float hash(vec2 p){ p=fract(p*vec2(.1031,.1030)); p+=dot(p,p.yx+33.33); return fract((p.x+p.y)*p.x); }
        void main(){
          vec2 px=vec2(gl_FragCoord.x, uRes.y*uScale-gl_FragCoord.y)/uScale; // css px, top-left origin
          float k=uFit.x, cw=k*${CW};
          vec2 q=(px-uFit.yz)/vec2(cw,k), id=floor(q), f=fract(q);
          if(id.x<0.||id.y<0.||id.x>=${COLS}.||id.y>=${ROWS}.){ o=vec4(0.); return; }
          vec2 tx=texelFetch(uText, ivec2(id),0).rg*255.+.5; int gi=int(tx.r); float lv=floor(tx.g)/255.;
          vec2 cc=uFit.yz+(id+.5)*vec2(cw,k);
          vec2 lt=texture(uLight, cc/uRes).rg; float lit=clamp(lt.r+lt.g,0.,1.);
          if(gi==0 && lit>.15) gi=${CHARS.indexOf(".")}; // a lit gap still shows a dot
          vec2 au=(vec2(float(gi%${GC}),float(gi/${GC}))+f)/vec2(${GC}.,${Math.ceil(CHARS.length / GC)}.);
          float cov=gi==0?0.:texture(uAtlas,au).a;
          // colour: warm stone (accent toned down), ember/cyan where a line lights it
          vec3 col=mix(uAccent,vec3(.78,.74,.7),.45);
          col=mix(col,mix(uAccent,vec3(1.,.86,.7),.25),smoothstep(0.,.6,lt.r));
          col=mix(col,mix(uSignal,vec3(.8,1.,1.),.25),smoothstep(0.,.6,lt.g)*step(lt.r,lt.g+.15));
          float breathe=.9+.1*sin(uT*.2*uOn+hash(id)*6.283); // alpha only, no movement
          float ba=mix(${A_BASE[0]},${A_BASE[1]},uRich)*(.5+lv), la=mix(${A_LIT[0]},${A_LIT[1]},uRich)*(.4+.6*lv);
          float al=cov*breathe*(ba+lit*la);
          // keep the centre (mark, title) and the content panels quiet
          vec2 d=abs(px-uHole)/vec2(210.,260.); al*=mix(mix(.35,1.,smoothstep(.8,1.3,max(d.x,d.y))),mix(.7,1.,smoothstep(.8,1.3,max(d.x,d.y))),uRich);
          for(int m=0;m<16;m++){ if(float(m)>=uMaskN) break; vec4 r=uMask[m]; vec2 e=min(px-r.xy,r.zw-px); al*=1.-uMaskK*smoothstep(-6.,10.,min(e.x,e.y)); }
          o=vec4(col*al,al);
        }`));
      gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    } catch (e) { console.warn("CaesarOS ascii layer unavailable", e); return null; }
    gl.useProgram(pr);
    const U = {}; for (const n of ["uAtlas", "uLight", "uText", "uRes", "uScale", "uT", "uOn", "uMask", "uMaskN", "uMaskK", "uRich", "uAccent", "uSignal", "uHole", "uFit"]) U[n] = gl.getUniformLocation(pr, n);
    const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    // scene: glyph index and tone level per cell
    tex(2); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, COLS, ROWS, 0, gl.RG, gl.UNSIGNED_BYTE, buildScene());
    // atlas: monospace glyphs, white on transparent, mipmapped so the far layer does not shimmer
    const atlasTex = tex(0);
    const buildAtlas = () => {
      const rows = Math.ceil(CHARS.length / GC), cw = 24, ch = 40, c = document.createElement("canvas"); c.width = GC * cw; c.height = rows * ch;
      const x = c.getContext("2d"); x.font = '500 30px "CaesarOS Mono", ui-monospace, monospace'; x.textAlign = "center"; x.textBaseline = "alphabetic"; x.fillStyle = "#fff";
      [...CHARS].forEach((g, i) => x.fillText(g, (i % GC) * cw + cw / 2, Math.floor(i / GC) * ch + 30));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    buildAtlas(); document.fonts?.load('500 30px "CaesarOS Mono"').then(buildAtlas, () => {});
    // light grid: R = ember, G = cyan; static part from the traces, moving part from the pulses, with a short afterglow
    const lightTex = tex(1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const lg = lightGrid(); let w = 0, h = 0, scale = 1, maskRects = [], maskAt = 0, cpuMs = 0, jsMs = 0, frames = 0;
    const setup = (W, H, net) => {
      w = W; h = H; scale = Math.min(devicePixelRatio || 1, 1.25);
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      lg.build(w, h, net); const [gw, gh] = lg.dims();
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lightTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, gw, gh, 0, gl.RG, gl.UNSIGNED_BYTE, lg.out());
    };
    const refreshMask = () => { // content panels: ASCII stays a quiet texture behind them
      const bars = [...document.querySelectorAll(".atrium-top,.live-bar,.ns-side")]; // listed twice: the bars and the rail keep text clear of a passing wake
      maskRects = [...bars, ...bars, ...document.querySelectorAll(".nx-bar,main :is(.card,.act-card,section,form,table,pre),dialog[open] ,header,aside")].slice(0, 16).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 40 && r.height > 24).map((r) => [r.left, r.top, r.right, r.bottom]);
    };
    const hex = (c) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c.trim()); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : [.8, .44, .26]; };
    let tClock = 40, lastNow = 0, lastS = null;
    const api = {
      resize(W, H, net) { setup(W, H, net); },
      // s: { net, phase, pointAt, accent, signal, animating, on }
      render(s) {
        lastS = s; const t0 = performance.now();
        if (!s.on) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return; }
        if (!lg.dims()[0]) return;
        const dt = lastNow ? Math.min((t0 - lastNow) / 1000, .1) : 0; lastNow = t0;
        if (s.animating) tClock += dt;
        lg.step(s);
        jsMs += performance.now() - t0; // CPU work only (decay, splats, quantise); uploads and draw are GPU-side
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lightTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ...lg.dims(), gl.RG, gl.UNSIGNED_BYTE, lg.out());
        if (t0 - maskAt > 600) { refreshMask(); maskAt = t0; }
        const mk = new Float32Array(64); maskRects.forEach((r, i) => mk.set(r, i * 4));
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1i(U.uAtlas, 0); gl.uniform1i(U.uLight, 1); gl.uniform1i(U.uText, 2);
        gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uScale, scale); gl.uniform1f(U.uT, tClock); gl.uniform1f(U.uOn, s.animating ? 1 : 0);
        gl.uniform4fv(U.uMask, mk); gl.uniform1f(U.uMaskN, maskRects.length); gl.uniform1f(U.uMaskK, s.rich ? .68 : .7); gl.uniform1f(U.uRich, s.rich ? 1 : 0);
        gl.uniform3fv(U.uAccent, hex(s.accent)); gl.uniform3fv(U.uSignal, hex(s.signal)); gl.uniform2f(U.uHole, w / 2, h * .46); { const f = fit(w, h); gl.uniform3f(U.uFit, f.k, f.x0, f.y0); }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        cpuMs += performance.now() - t0; frames++;
      },
      // measurement helper: CPU-side cost per frame (GPU time cannot be read from the page)
      // GPU frame time: draw plus gl.finish() (the draw has really run), n frames, mean ms
      bench(n = 300, rich = true) { if (!lastS) return -1; const st = { ...lastS, animating: true, on: true, rich }; const t = performance.now(); for (let i = 0; i < n; i++) { api.render(st); gl.finish(); } return +((performance.now() - t) / n).toFixed(3); },
      stats() { return { cpuPerFrameMs: +(jsMs / Math.max(1, frames)).toFixed(3), submitPerFrameMs: +(cpuMs / Math.max(1, frames)).toFixed(3), frames, grid: lg.dims() }; },
    };
    window.__asciiStats = api.stats; window.__asciiBench = api.bench;
    return api;
  };
})();
