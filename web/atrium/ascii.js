// ASCII code layer under the WebGL lines. One WebGL2 pass, one full-screen triangle, a glyph atlas and a
// code-text texture: no per-glyph geometry. Three depths scroll at different speeds; rows "type" in and fade
// out slowly (alpha only, never a full-frame change). A small light grid, fed by background.js with the line
// segments and the travelling pulses, tints and brightens the glyphs next to a line, so the lines read as lighting the code.
(function () {
  const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~░▒▓█▪┌┐└┘├┤┬┴┼─│═║◆◇▸▴▾";
  const COLS = 96, ROWS = 64, GC = 14, GS = 12; // text texture, atlas columns, light-grid cell in css px
  const FRAGS = ["const ", "let ", "fn ", "async ", "await ", "return ", "if (", "else ", "for (", "=> ", "-> ", "&& ", "|| ", "== ", "!= ", "<= ", "::", "();", "{ }", "[ ]", "null", "true", "0x", "i32", "u8", "/src/core/", "./lib/", "/var/run/", "~/.cfg/", "mod.rs", "index.ts", "node[", "pipe(", "lane.", "sync(", "emit(", "seed=", "ptr+", "len-1", "0.618", "1.0", "┌──┐", "└──┘", "├─", "│ ", "░░", "▒▒", "██", "▪ ", "◆ ", "▸ ", "// ", "#", "<>", "%", "~", "^", "|", "\\", "=", ";"];
  const rng = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const buildText = () => {
    const r = rng(7), a = new Uint8Array(COLS * ROWS);
    for (let y = 0; y < ROWS; y++) {
      let x = r() < .5 ? Math.floor(r() * 12) : 0; // indent
      while (x < COLS) {
        let s = r() < .22 ? Array.from({ length: 2 + Math.floor(r() * 6) }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("") : FRAGS[Math.floor(r() * FRAGS.length)];
        if (r() < .12) s += String(Math.floor(r() * 9999));
        for (const ch of s + (r() < .5 ? " " : "  ")) { if (x >= COLS) break; a[y * COLS + x++] = Math.max(0, CHARS.indexOf(ch)); }
        if (r() < .08) x += 4 + Math.floor(r() * 10); // gaps, so rows do not read as a wall of text
      }
    }
    return a;
  };

  window.caesarosAscii = function (canvas) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    try {
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, `#version 300 es
        void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position=vec4(p*2.-1.,0.,1.); }`));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `#version 300 es
        precision highp float; precision highp sampler2D;
        uniform sampler2D uAtlas, uLight, uText; uniform vec2 uRes; uniform float uScale, uT, uOn; uniform int uLayers; uniform vec4 uMask[8]; uniform float uMaskN, uMaskK;
        uniform vec3 uAccent, uSignal; uniform vec2 uHole; out vec4 o;
        float hash(vec2 p){ p=fract(p*vec2(.1031,.1030)); p+=dot(p,p.yx+33.33); return fract((p.x+p.y)*p.x); }
        void main(){
          vec2 px=vec2(gl_FragCoord.x, uRes.y*uScale-gl_FragCoord.y)/uScale; // css px, top-left origin
          vec4 acc=vec4(0.);
          // layer: cell height, cell aspect, scroll px/s, base alpha, light gain
          for(int L=0;L<3;L++){
            if(L>=uLayers) break;
            float fl=float(L);
            float ch = (L==0?9.:(L==1?13.:19.)) * (uRes.x<720.?1.25:1.);
            float cw=ch*.6, sp=(L==0?1.2:(L==1?2.6:4.6));
            vec2 q=px+vec2(0.,uT*sp*uOn);
            vec2 id=floor(vec2(q.x/cw,q.y/ch)), f=fract(vec2(q.x/cw,q.y/ch));
            float hr=hash(vec2(id.y,fl*7.)), hc=hash(id+fl*31.);
            // slow typing: the row head sweeps right, the row stays, then fades (alpha only)
            float ph=fract(uT*(.012+.01*hr)+hr*3.7+fl*.31);
            float head=ph/.78*(uRes.x/cw+10.);
            float a=clamp((head-id.x)/7.,0.,1.)*(1.-smoothstep(.84,1.,ph));
            float cur=(1.-step(.5,abs(id.x-floor(head))))*step(ph,.78);
            int gi=int(texelFetch(uText, ivec2(int(mod(id.x+fl*13.,${COLS}.)), int(mod(id.y+fl*7.,${ROWS}.))),0).r*255.+.5);
            if(cur>.5) gi=${CHARS.indexOf("█")};
            vec2 cc=(id+.5)*vec2(cw,ch)-vec2(0.,uT*sp*uOn);
            vec2 lt=texture(uLight, cc/uRes).rg; float lit=clamp(lt.r+lt.g,0.,1.);
            vec2 au=(vec2(float(gi%${GC}),float(gi/${GC}))+f)/vec2(${GC}.,${Math.ceil(CHARS.length / GC)}.);
            float cov=texture(uAtlas,au).a;
            vec3 base=hc>.955?vec3(1.,.22,.72):mix(uAccent,vec3(.78,.74,.7),.45); // rare magenta accent
            vec3 col=mix(base,mix(uAccent,vec3(1.,.86,.7),.25),smoothstep(0.,.6,lt.r));
            col=mix(col,mix(uSignal,vec3(.8,1.,1.),.25),smoothstep(0.,.6,lt.g)*step(lt.r,lt.g+.15));
            float ba=(L==0?.07:(L==1?.1:.14))*(.5+.5*hc);
            float al=cov*a*(ba+lit*(L==0?.5:(L==1?.62:.78)));
            // keep the centre (mark, title) and the content panels quiet
            vec2 d=abs(px-uHole)/vec2(210.,260.); al*=mix(.18,1.,smoothstep(.8,1.3,max(d.x,d.y)));
            for(int m=0;m<8;m++){ if(float(m)>=uMaskN) break; vec4 r=uMask[m]; vec2 e=min(px-r.xy,r.zw-px); al*=1.-uMaskK*smoothstep(-6.,10.,min(e.x,e.y)); }
            acc=acc*(1.-al)+vec4(col*al,al);
          }
          o=acc;
        }`));
      gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    } catch (e) { console.warn("CaesarOS ascii layer unavailable", e); return null; }
    gl.useProgram(pr);
    const U = {}; for (const n of ["uAtlas", "uLight", "uText", "uRes", "uScale", "uT", "uOn", "uLayers", "uMask", "uMaskN", "uMaskK", "uAccent", "uSignal", "uHole"]) U[n] = gl.getUniformLocation(pr, n);
    const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    // text: one byte per cell, the glyph index
    tex(2); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, COLS, ROWS, 0, gl.RED, gl.UNSIGNED_BYTE, buildText());
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
    let gw = 0, gh = 0, base, mem, out, w = 0, h = 0, scale = 1, maskRects = [], maskAt = 0, cpuMs = 0, jsMs = 0, frames = 0;
    const setup = (W, H, net) => {
      w = W; h = H; scale = Math.min(devicePixelRatio || 1, 1.25);
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
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
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lightTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, gw, gh, 0, gl.RG, gl.UNSIGNED_BYTE, out);
    };
    const splat = (x, y, ch, v, R) => {
      const gx = Math.floor(x / GS), gy = Math.floor(y / GS), R2 = (R * GS) ** 2 * .6; // cheap bell, no exp
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const X = gx + i, Y = gy + j; if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
        const dx = (X + .5) * GS - x, dy = (Y + .5) * GS - y, q = 1 - (dx * dx + dy * dy) / R2; if (q <= 0) continue;
        const val = v * q * q, k = (Y * gw + X) * 2 + ch; if (val > mem[k]) mem[k] = val;
      }
    };
    const refreshMask = () => { // content panels: ASCII stays a quiet texture behind them
      maskRects = [...document.querySelectorAll("main :is(.card,.act-card,section,form,table,pre),dialog[open] ,header,aside")].slice(0, 8).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 40 && r.height > 24).map((r) => [r.left, r.top, r.right, r.bottom]);
    };
    const hex = (c) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c.trim()); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : [.8, .44, .26]; };
    let tClock = 40, lastNow = 0;
    const api = {
      resize(W, H, net) { setup(W, H, net); },
      // s: { net, phase, pointAt, accent, signal, animating, on }
      render(s) {
        const t0 = performance.now();
        if (!s.on) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return; }
        if (!gw) return;
        const dt = lastNow ? Math.min((t0 - lastNow) / 1000, .1) : 0; lastNow = t0;
        if (s.animating) tClock += dt;
        for (let i = 0; i < mem.length; i++) mem[i] = Math.max(base[i], mem[i] * (s.animating ? .9 : 1));
        if (s.animating) for (const p of s.net) {
          const head = (p.at + s.phase * p.speed) % (p.total + 90), ch = p.live ? 1 : 0;
          for (let k = 0; k < 10; k += k ? 3 : 1) { const d = head - k * 6; if (d < 0 || d > p.total) continue; const [x, y] = s.pointAt(p, d); splat(x, y, ch, k ? .55 * (1 - k / 10) : 1, k ? 3 : 4); }
        }
        for (let i = 0; i < mem.length; i++) out[i] = Math.min(255, mem[i] * 255);
        jsMs += performance.now() - t0; // CPU work only (decay, splats, quantise); uploads and draw are GPU-side
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lightTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gw, gh, gl.RG, gl.UNSIGNED_BYTE, out);
        if (t0 - maskAt > 600) { refreshMask(); maskAt = t0; }
        const mk = new Float32Array(32); maskRects.forEach((r, i) => mk.set(r, i * 4));
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1i(U.uAtlas, 0); gl.uniform1i(U.uLight, 1); gl.uniform1i(U.uText, 2);
        gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uScale, scale); gl.uniform1f(U.uT, tClock); gl.uniform1f(U.uOn, s.animating ? 1 : 0);
        gl.uniform1i(U.uLayers, w < 720 ? 2 : 3); gl.uniform4fv(U.uMask, mk); gl.uniform1f(U.uMaskN, maskRects.length); gl.uniform1f(U.uMaskK, .7);
        gl.uniform3fv(U.uAccent, hex(s.accent)); gl.uniform3fv(U.uSignal, hex(s.signal)); gl.uniform2f(U.uHole, w / 2, h * .46);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        cpuMs += performance.now() - t0; frames++;
      },
      // measurement helper: CPU-side cost per frame (GPU time cannot be read from the page)
      stats() { return { cpuPerFrameMs: +(jsMs / Math.max(1, frames)).toFixed(3), submitPerFrameMs: +(cpuMs / Math.max(1, frames)).toFixed(3), frames, grid: [gw, gh] }; },
    };
    window.__asciiStats = api.stats;
    return api;
  };
})();
