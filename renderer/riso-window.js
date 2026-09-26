/* Riso window renderer v17 (8 inks; winter + summer scenes; wet days). Scene -> ink plates (coverage) -> round-dot halftone -> multiply on paper.
   Every data-driven mark reads from the params object; randomness is seeded, so a frame is reproducible. */
(function (global) {
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const KEYS = ['Y', 'O', 'P', 'V', 'A', 'B', 'F', 'G'];   // yellow, orange, fluorescent pink, violet, aqua, blue, federal blue, green
  const INK = { Y: [255, 232, 0], O: [255, 108, 47], P: [255, 72, 176], V: [157, 122, 210], A: [94, 200, 229], B: [0, 120, 191], F: [61, 85, 136], G: [0, 169, 92] };
  const PAPER = [243, 237, 226];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => { const o = {}; for (const k of KEYS) { const x = a[k], y = b[k]; if (x !== undefined || y !== undefined) o[k] = lerp(x || 0, y || 0, t); } return o; };
  const dark = (c, amt) => { const o = {}; for (const k of KEYS) if (c[k] !== undefined) o[k] = clamp(c[k] + amt * (k === 'Y' ? 0.6 : 1), 0, 1); o.V = clamp((o.V || 0) + amt * 0.5, 0, 1); return o; };
  function rng32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, o = 4) { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; } return t / n; }

  // ------------------------------------------------------------------ plates
  function Plates(W, H) {
    this.W = W; this.H = H; this.p = {};
    for (const k of KEYS) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); this.p[k] = g;
    }
  }
  const grayOf = (d) => { const v = Math.round(255 * (1 - clamp(d, 0, 1))); return `rgb(${v},${v},${v})`; };
  function styleFor(g, spec, lift) {
    const col = (d) => (lift ? grayOf(1 - d) : grayOf(d));
    if (typeof spec === 'number') return col(spec);
    const gr = spec.lin ? g.createLinearGradient(...spec.lin) : g.createRadialGradient(...spec.rad);
    for (const [t, d] of spec.stops) gr.addColorStop(t, col(d));
    return gr;
  }
  function grad(kind, args, stops) {
    const out = {};
    for (const k of KEYS) if (stops.some((s) => s[1][k] !== undefined)) out[k] = { [kind]: args, stops: stops.map((s) => [s[0], s[1][k] ?? 0]) };
    return out;
  }
  const lin = (x0, y0, x1, y1, stops) => grad('lin', [x0, y0, x1, y1], stops);
  const rad = (x0, y0, r0, x1, y1, r1, stops) => grad('rad', [x0, y0, r0, x1, y1, r1], stops);
  const full = (c) => { const o = {}; for (const k of KEYS) o[k] = c[k] ?? 0; return o; };   // opaque: knocks out unused inks

  Plates.prototype.paint = function (path, inks, opt = {}) {
    for (const k of KEYS) {
      const spec = inks[k]; if (spec === undefined) continue;
      const g = this.p[k]; g.save();
      if (opt.alpha != null) g.globalAlpha = opt.alpha;
      if (opt.mode === 'add') g.globalCompositeOperation = 'multiply';
      if (opt.mode === 'lift') g.globalCompositeOperation = 'screen';
      for (const cf of [].concat(opt.clip || [], opt.clip2 || [])) { g.beginPath(); cf(g); g.clip(); }
      if (opt.transform) opt.transform(g);
      g.beginPath(); path(g);
      const st = styleFor(g, spec, opt.mode === 'lift');
      if (opt.stroke) { g.strokeStyle = st; g.lineWidth = opt.stroke; g.lineCap = opt.cap || 'round'; g.lineJoin = 'round'; g.stroke(); }
      else { g.fillStyle = st; g.fill(opt.rule || 'nonzero'); }
      g.restore();
    }
  };
  Plates.prototype.text = function (str, x, y, font, inks) {
    for (const k of KEYS) { if (inks[k] === undefined) continue; const g = this.p[k]; g.save(); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = grayOf(inks[k]); g.fillText(str, x, y); g.restore(); }
  };
  Plates.prototype.pixels = function (x0, y0, w, h, fn) {
    const d = {}; for (const k of KEYS) d[k] = this.p[k].getImageData(x0, y0, w, h);
    const cur = {};
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (const k of KEYS) cur[k] = 1 - d[k].data[i] / 255;
      const r = fn(x + x0, y + y0, cur); if (!r) continue;
      for (const k of KEYS) if (r[k] !== undefined) { const v = 255 * (1 - clamp(r[k], 0, 1)); d[k].data[i] = d[k].data[i + 1] = d[k].data[i + 2] = v; }
    }
    for (const k of KEYS) this.p[k].putImageData(d[k], x0, y0);
  };

  // ------------------- print: one round-dot screen per ink, blended with the continuous tone ("texture")
  Plates.prototype.print = function (outCtx, opt = {}) {
    const W = this.W, H = this.H, pitch = opt.pitch || 4.2, tex = opt.texture ?? 0.45;
    const cfg = { Y: [0, 0, 0, 11], O: [15, 0.8, 0.5, 13], P: [75, 1.3, -0.8, 23], V: [45, -0.6, -1.0, 29], A: [60, -1.2, 0.4, 31], B: [30, -0.9, 1.1, 37], F: [105, 0.5, 1.3, 41], G: [82, -0.4, 0.9, 43] };
    const inks = KEYS.map((k) => {
      const [ang, ox, oy, sd] = cfg[k], data = this.p[k].getImageData(0, 0, W, H).data;
      const gw = Math.ceil(W / 24) + 2, gh = Math.ceil(H / 24) + 2, grid = new Float32Array(gw * gh);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) grid[j * gw + i] = 0.9 + 0.1 * fbm(i / 4, j / 4, sd, 3);
      return { data, ca: Math.cos(ang * DEG) / pitch, sa: Math.sin(ang * DEG) / pitch, ox, oy, f: INK[k].map((v) => 1 - v / 255), grid, gw, s: sd };
    });
    const out = outCtx.createImageData(W, H), o = out.data, IP = 1 / Math.PI;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = (hash2(x, y, 5) - 0.5) * 5 + (vnoise(x / 2.3, y / 2.3, 9) - 0.5) * 4;
        let rc = PAPER[0] + n, gc = PAPER[1] + n, bc = PAPER[2] + n, rh = rc, gh = gc, bh = bc;
        for (let q = 0; q < inks.length; q++) {
          const I = inks[q];
          const sx = Math.round(x - I.ox), sy = Math.round(y - I.oy);
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          const d = 1 - I.data[(sy * W + sx) * 4] / 255;
          if (d < 0.008) continue;
          const gx = x / 24, gy = y / 24, gi = gx | 0, gj = gy | 0, fx = gx - gi, fy = gy - gj, G = I.grid, w = I.gw;
          const m = (G[gj * w + gi] * (1 - fx) + G[gj * w + gi + 1] * fx) * (1 - fy) + (G[(gj + 1) * w + gi] * (1 - fx) + G[(gj + 1) * w + gi + 1] * fx) * fy;
          const dm = d * m;
          rc *= 1 - dm * I.f[0]; gc *= 1 - dm * I.f[1]; bc *= 1 - dm * I.f[2];
          const X = x - I.ox, Y = y - I.oy, u = X * I.ca + Y * I.sa, v = -X * I.sa + Y * I.ca;
          const fu = u - Math.floor(u), fv = v - Math.floor(v);
          let cov;
          if (d <= 0.5) { const R = Math.sqrt(d * IP), du = fu - 0.5, dv = fv - 0.5; cov = (R - Math.sqrt(du * du + dv * dv)) * pitch + 0.5; }
          else { const R = Math.sqrt((1 - d) * IP), cu = fu < 0.5 ? fu : 1 - fu, cv = fv < 0.5 ? fv : 1 - fv; cov = 1 - ((R - Math.sqrt(cu * cu + cv * cv)) * pitch + 0.5); }
          if (cov <= 0) continue; if (cov > 1) cov = 1;
          cov *= m;
          if (d > 0.8 && hash2(x, y, I.s) < 0.008) cov *= 0.5;
          rh *= 1 - cov * I.f[0]; gh *= 1 - cov * I.f[1]; bh *= 1 - cov * I.f[2];
        }
        const i = (y * W + x) * 4; o[i] = rc + (rh - rc) * tex; o[i + 1] = gc + (gh - gc) * tex; o[i + 2] = bc + (bh - bc) * tex; o[i + 3] = 255;
      }
    }
    outCtx.putImageData(out, 0, 0);
  };

  // ------------------------------------------------------------ palettes
  const C = {
    wall: { A: 0.14, Y: 0.04 }, casing: { A: 0.7, B: 0.3 }, casingLine: { F: 0.85 }, frameInner: { F: 1, V: 0.2 },
    sillTop: { Y: 0.26 }, sillFront: { B: 0.4, A: 0.3 }, sillShadow: { V: 0.28, B: 0.1 },
    navy: { F: 1, V: 0.3 }, ink: { F: 1 }, needle: { P: 1, O: 0.5 }, band: { O: 0.9, Y: 0.5 }, sock: { O: 1, Y: 0.2 },
    water: { A: 0.75, B: 0.35 }, lamp: { Y: 1, O: 0.35 }, house: { A: 0.06 }, roof: { F: 0.9, V: 0.2 }, barn: { O: 0.95, P: 0.7 }, barnDoor: { P: 0.7, F: 0.4, O: 0.3 },
    darkWin: { F: 0.62, B: 0.18 },
  };
  const WINTER = {
    violet: { F: 0.8, V: 0.5 }, treeline: { V: 0.7, F: 0.5 }, trees: { F: 0.95, V: 0.45 }, litEdge: { O: 0.7, Y: 0.6 },
    snow: { A: 0.05 }, snowShade: { A: 0.6, B: 0.2 }, snowWarm: { Y: 0.25, P: 0.12 },
  };
  const SUMMER = {
    treeline: { G: 0.45, B: 0.3, F: 0.15 }, canopy: { G: 0.8, F: 0.35, Y: 0.1 }, canopyLit: { G: 0.66, Y: 0.48 }, evergreen: { G: 0.7, F: 0.7, B: 0.1 },
    trunk: { F: 0.8, O: 0.3 }, cornRow: { G: 0.85, Y: 0.4 }, cornShade: { G: 0.9, F: 0.3 }, soy: { G: 0.7, Y: 0.5 },
    lawn: { G: 0.7, Y: 0.55 }, blade: { G: 0.85, F: 0.3, Y: 0.3 }, bladeLit: { G: 0.5, Y: 0.62 }, ditch: { G: 0.65, Y: 0.3, F: 0.1 },
    soilDry: { O: 0.35, F: 0.2, V: 0.12, Y: 0.2 }, soilWet: { O: 0.55, F: 0.4, V: 0.2, Y: 0.2 },
    puddle: { A: 0.45, B: 0.25 }, concrete: { V: 0.34, B: 0.16, A: 0.1 }, concreteLit: { Y: 0.1, A: 0.05 }, concreteShade: { V: 0.45, B: 0.3, F: 0.2 },
  };

  // --------------------------------------------------------------- scene
  function renderWindow(outCanvas, S) {
    const W = outCanvas.width, H = outCanvas.height, pl = new Plates(W, H);
    const OY = 30, V = { x: 120, y: 128 + OY, w: 840, h: 648 }, GB = V.y + V.h;
    const HOR = V.y + 0.6 * V.h, PXD = V.w / 180, K = GB - HOR;
    const azX = (az) => V.x + (az - 90) * PXD, altY = (alt) => HOR - alt * PXD, yD = (D) => HOR + K / D;
    const VP = { x: azX(180), y: HOR };
    const viewClip = (g) => g.roundRect(V.x, V.y, V.w, V.h, 36);
    const skyClip = (g) => g.roundRect(V.x, V.y, V.w, HOR - V.y + 2, [36, 36, 0, 0]);
    const groundClip = (g) => g.roundRect(V.x, HOR, V.w, GB - HOR, [0, 0, 36, 36]);
    const R = rng32(S.seed || 7);
    const summer = S.season === 'summer', wet = !!S.wet;
    const sun = { x: azX(S.sun.az), y: altY(S.sun.alt), r: 22 };
    const sunInView = S.sun.az > 90 && S.sun.az < 270 && S.sun.alt > -1;
    const moon = !wet && S.moon && S.moon.alt > 2 ? { x: azX(S.moon.az), y: altY(S.moon.alt), r: 12 } : null;
    const windDown = (S.wind.fromAz + 180) % 360;
    const windX = Math.cos((windDown - 270) * DEG), windZ = Math.cos((windDown - 180) * DEG);   // x: + = west (right); z: + = away (south), - = toward viewer
    const windKt = S.wind.mph / 1.15078;
    const warmK = smooth(20, 0, S.sun.alt) * (wet ? 0.3 : 1);
    const litSide = S.sun.az > 180 ? 1 : -1;
    const green = (c, k = 0.08) => (wet && c.G ? { ...c, G: clamp(c.G + k, 0, 1) } : c);   // wet greens run deeper

    // wall
    pl.paint((g) => g.rect(0, 0, W, H), lin(0, 0, 0, H, [[0, C.wall], [1, dark(C.wall, 0.05)]]));

    // ------------------------------------------------------------- sky
    const skyStops = !summer
      ? [[0, { B: 0.95, F: 0.3 }], [0.25, { B: 0.75, A: 0.35 }], [0.5, { A: 0.7, B: 0.3 }], [0.72, { A: 0.5, V: 0.3 }], [0.88, { V: 0.42, A: 0.2, P: 0.1 }], [1, { V: 0.3, P: 0.22, A: 0.1 }]]
      : wet ? [[0, { B: 0.6, F: 0.35, V: 0.1 }], [0.45, { B: 0.4, A: 0.3, F: 0.15 }], [0.8, { A: 0.35, V: 0.22, B: 0.12 }], [1, { A: 0.28, V: 0.25, B: 0.08 }]]
        : [[0, { B: 0.85, F: 0.12 }], [0.35, { B: 0.55, A: 0.45 }], [0.7, { A: 0.6, B: 0.15 }], [1, { A: 0.3, Y: 0.06 }]];
    pl.paint(skyClip, lin(0, V.y, 0, HOR, skyStops));
    if (warmK > 0.01) {
      pl.paint((g) => g.rect(V.x, HOR - 170, V.w, 170), lin(V.x, 0, V.x + V.w, 0, [[0, { P: 0, V: 0 }], [0.5, { P: 0, V: 0 }], [1, { P: 0.1 * warmK, V: 0.12 * warmK }]]), { mode: 'add', clip: skyClip });
      const glow = (g) => { g.translate(sun.x, sun.y); g.scale(1, 0.4); };
      pl.paint((g) => g.rect(-900, -900, 1800, 1800), rad(0, 0, 0, 0, 0, 360, [[0, { B: 0.97 * warmK, A: 0.95 * warmK, V: 0.9 * warmK, F: 0.97 * warmK }], [0.45, { B: 0.55 * warmK, A: 0.5 * warmK, V: 0.45 * warmK, F: 0.6 * warmK }], [1, { B: 0, A: 0, V: 0, F: 0 }]]), { mode: 'lift', clip: skyClip, transform: glow });
      pl.paint((g) => g.rect(-900, -900, 1800, 1800), rad(0, 0, 0, 0, 0, 340, [[0, { Y: 0.95 * warmK, O: 0.42 * warmK, P: 0 }], [0.3, { Y: 0.6 * warmK, O: 0.26 * warmK, P: 0.18 * warmK }], [0.7, { Y: 0.12 * warmK, O: 0.04 * warmK, P: 0.1 * warmK }], [1, { Y: 0, O: 0, P: 0 }]]), { mode: 'add', clip: skyClip, transform: glow });
    } else {
      const hk = wet ? 0.3 : 0.55;                                  // high sun: the sky pales toward it
      pl.paint((g) => g.rect(V.x, V.y, V.w, HOR - V.y), rad(sun.x, sun.y, 0, sun.x, sun.y, 460, [[0, { Y: hk, O: hk, P: hk, V: hk, A: hk, B: hk, F: hk }], [1, { Y: 0, O: 0, P: 0, V: 0, A: 0, B: 0, F: 0 }]]), { mode: 'lift', clip: skyClip });
    }
    if (sunInView && !wet) {
      pl.paint((g) => g.arc(sun.x, sun.y, sun.r + 30, 0, TAU), rad(sun.x, sun.y, sun.r, sun.x, sun.y, sun.r + 30, [[0, { Y: 0.6, O: 0.1 }], [1, { Y: 0, O: 0 }]]), { mode: 'add', clip: skyClip });
      pl.paint((g) => g.arc(sun.x, sun.y, sun.r, 0, TAU), full(warmK > 0.3 ? { Y: 1, O: 0.6 } : { Y: 0.55 }), { clip: skyClip });
      pl.paint((g) => g.arc(sun.x - 1, sun.y - 1, sun.r - 5, 0, TAU), full(warmK > 0.3 ? { Y: 1, O: 0.15 } : { Y: 0.2 }), { clip: skyClip });
    }

    // clouds: coverage solved to the day's mean cloud fraction (for a wet day: the wet-day mean)
    const m = document.createElement('canvas'); m.width = V.w / 4; m.height = Math.ceil((HOR - V.y) / 4);
    const mg = m.getContext('2d', { willReadFrequently: true });
    const circles = (g, list, dx = 0, dy = 0, s = 1, ox = 0, oy = 0) => { for (const b of list) { const cx = (b[0] + dx - ox) * s, cy = (b[1] + dy - oy) * s, r = b[2] * s; g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, TAU); } };
    const coverage = (cl) => {
      mg.clearRect(0, 0, m.width, m.height); mg.fillStyle = '#000';
      for (const c of cl) { mg.save(); mg.beginPath(); mg.rect(0, 0, m.width, (c.base - V.y) / 4); mg.clip(); mg.beginPath(); circles(mg, c.lobes, 0, 0, 0.25, V.x, V.y); mg.fill(); mg.restore(); }
      const d = mg.getImageData(0, 0, m.width, m.height).data; let on = 0; for (let i = 3; i < d.length; i += 4) on += d[i] > 127; return on / (m.width * m.height);
    };
    let clouds, measured;
    if (!summer) {                                                   // winter: rows of stratocumulus
      const rows = [15, 22, 31, 42, 56, 74];
      const build = (gapF, sizeF = 1) => {
        const RR = rng32(1234), out = [];
        for (const alt0 of rows) {
          const t = clamp((alt0 - 12) / 62, 0, 1);
          let x = V.x - 260 + RR() * 200;
          while (x < V.x + V.w + 260) {
            const w = lerp(160, 580, t) * lerp(0.55, 1.45, RR()), hm = w * lerp(0.17, 0.32, RR()) * sizeF;
            const alt = alt0 + (RR() - 0.5) * lerp(3, 11, t), cx = x + w / 2, base = altY(alt);
            const nb = 5 + Math.floor(RR() * 4), lobes = [];
            for (let j = 0; j < nb; j++) { const f = (j + 0.5) / nb * 2 - 1, r = hm * lerp(0.42, 0.62, RR()) * (1 - 0.55 * f * f) + hm * 0.12; lobes.push([cx + f * (w / 2 - r * 0.6), base - r * lerp(0.42, 0.62, RR()), r]); }
            const blocked = (alt < 24 && Math.abs(cx - sun.x) < 110 + w * 0.5) || (moon && Math.abs(cx - moon.x) < 30 + w * 0.5 && base > moon.y - 20 && base - hm * 1.2 < moon.y + 20);
            if (!blocked) out.push({ x: cx, w, h: hm, alt, base, lobes, ph: RR() * 9 });
            x += w * Math.max(0.3, 1 + gapF * lerp(0.15, 1.85, RR()));
          }
        }
        return out;
      };
      let gLo = -0.6, gHi = 6;
      for (let it = 0; it < 22; it++) { const mid = (gLo + gHi) / 2; if (coverage(build(mid)) > S.cloud) gLo = mid; else gHi = mid; }
      const gapSol = (gLo + gHi) / 2; let fLo = 0.8, fHi = 1.25;
      for (let it = 0; it < 18; it++) { const mid = (fLo + fHi) / 2; if (coverage(build(gapSol, mid)) < S.cloud) fLo = mid; else fHi = mid; }
      clouds = build(gapSol, (fLo + fHi) / 2).sort((a, b) => a.alt - b.alt); measured = coverage(clouds);
      for (const c of clouds) {
        const t = clamp((c.alt - 12) / 62, 0, 1);
        const L = Math.exp(-Math.hypot(c.x - sun.x, (c.base - sun.y) * 1.3) / 250) * warmK, L2 = Math.exp(-Math.hypot(c.x - sun.x, (c.base - sun.y) * 1.2) / 300) * warmK;
        const body = full({ V: lerp(0.56, 0.46, t), B: lerp(0.12, 0.14, t), A: lerp(0.08, 0.2, t), P: 0.08 * L2 });
        const lit = full(mix(mix({ V: 0.55, B: 0.28, A: 0.1 }, { P: 0.8, O: 0.16 }, Math.min(1, L2 * 1.3)), { O: 0.9, Y: 0.6 }, L));
        const rim = full(mix({ A: 0.3, V: 0.22 }, { Y: 0.36, P: 0.2, O: 0.08 }, L2));
        const cut = (g) => g.rect(0, 0, W, c.base), band = c.h * 0.3;
        pl.paint((g) => circles(g, c.lobes), rim, { clip: [skyClip, cut] });
        pl.paint((g) => circles(g, c.lobes, 0, c.h * 0.14), body, { clip: [(g) => circles(g, c.lobes), skyClip, cut] });
        pl.paint((g) => { const x0 = c.x - c.w, x1 = c.x + c.w; g.moveTo(x0, c.base + 2); for (let x = x0; x <= x1; x += 5) g.lineTo(x, c.base - band * (0.8 + 0.22 * Math.sin(x * 0.05 + c.ph) + 0.1 * Math.sin(x * 0.13 + c.ph * 2))); g.lineTo(x1, c.base + 2); g.closePath(); },
          lit, { clip: [(g) => circles(g, c.lobes), skyClip, cut] });
      }
    } else {                                                          // summer: cumulus on a flat base plane, receding to the horizon
      const buildCu = (sizeF) => {
        const RR = rng32(4321), out = [];
        for (let i = 0; i < 420; i++) {
          const e = 1.4 + Math.pow(RR(), 2.1) * 40, base = altY(e);
          const tower = wet ? lerp(0.62, 1.15, RR()) : lerp(0.34, 0.56, RR());
          const w = Math.min(e * lerp(11, 18, RR()), lerp(240, 340, RR())) * sizeF, h = w * tower, x = V.x - 120 + RR() * (V.w + 240);
          const nb = 4 + Math.floor(RR() * 3), lobes = [], rb = w / (2 * nb) * 1.25;
          for (let j = 0; j < nb; j++) { const f = (j + 0.5) / nb * 2 - 1, r = rb * lerp(0.9, 1.25, RR()) * (1 - 0.25 * f * f); lobes.push([x + f * w * 0.4, base - r * 0.75, r]); }
          const levels = wet ? 2 + Math.floor(RR() * 2) : 1 + Math.floor(RR() * 2);
          for (let L = 1; L <= levels; L++) {
            const k = 1 - L / (levels + 1.2), nL = Math.max(1, Math.round(nb * k));
            for (let j = 0; j < nL; j++) { const f = nL === 1 ? 0 : (j + 0.5) / nL * 2 - 1, r = rb * lerp(1.0, 1.35, RR()) * lerp(1, 0.82, L / levels); lobes.push([x + f * w * 0.38 * k + (RR() - 0.5) * w * 0.08, base - (h - rb) * L / levels - rb * 0.6, r]); }
          }
          out.push({ x, w, h, e, base, lobes, tower });
        }
        return out;
      };
      const cand = buildCu(1);
      let lo = 0, hi = cand.length;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (coverage(cand.slice(0, mid)) < S.cloud) lo = mid; else hi = mid; }
      let fLo = 0.75, fHi = 1.05;
      for (let it = 0; it < 16; it++) { const mid = (fLo + fHi) / 2; if (coverage(buildCu(mid).slice(0, hi)) < S.cloud) fLo = mid; else fHi = mid; }
      clouds = buildCu((fLo + fHi) / 2).slice(0, hi).sort((a, b) => a.e - b.e); measured = coverage(clouds);
      const lit0 = wet ? { Y: 0.12, A: 0.08 } : { A: 0.03 }, shade0 = wet ? { V: 0.45, B: 0.35, F: 0.15 } : { V: 0.3, A: 0.25, B: 0.08 }, base0 = wet ? { F: 0.65, V: 0.35, B: 0.2 } : { V: 0.4, B: 0.25, F: 0.1 };
      const horizonCol = skyStops[skyStops.length - 1][1];
      for (const c of clouds) {
        const far = smooth(14, 2, c.e) * 0.7;                        // distant clouds sink into the horizon haze
        const shp = (g) => circles(g, c.lobes), cut = (g) => g.rect(0, 0, W, c.base);
        pl.paint(shp, full(mix(lit0, horizonCol, far)), { clip: [skyClip, cut] });
        pl.paint((g) => circles(g, c.lobes, -litSide * c.w * 0.11, c.h * 0.1), full(mix(shade0, horizonCol, far)), { clip: [shp, skyClip, cut] });
        const bc = full(mix(base0, horizonCol, far)), none = {}; for (const k of KEYS) none[k] = 0;
        pl.paint((g) => g.rect(c.x - c.w, c.base - c.h * 0.42, c.w * 2, c.h * 0.42 + 2), lin(0, c.base - c.h * 0.42, 0, c.base, [[0, none], [0.55, mix(none, bc, 0.45)], [1, bc]]), { clip: [shp, skyClip, cut], mode: 'add' });
        if (wet && c.tower > 1.05 && c.e < 22) {                     // rain shaft under the tallest clouds
          const sx0 = c.x - c.w * 0.32, sw = c.w * 0.64, lean = windX * 0.18;
          pl.paint((g) => { g.moveTo(sx0, c.base - 1); g.lineTo(sx0 + sw, c.base - 1); g.lineTo(sx0 + sw + lean * (HOR - c.base), HOR + 2); g.lineTo(sx0 + lean * (HOR - c.base), HOR + 2); g.closePath(); },
            lin(0, c.base, 0, HOR, [[0, { B: 0.3, F: 0.22, V: 0.1 }], [1, { B: 0.12, F: 0.08, V: 0.04 }]]), { mode: 'add', clip: skyClip, alpha: 0.8 });
          pl.paint((g) => { for (let x = sx0; x < sx0 + sw; x += 3 + R() * 4) { g.moveTo(x, c.base + R() * 6); g.lineTo(x + lean * (HOR - c.base), HOR + 2); } }, { B: 0.25, F: 0.15 }, { stroke: 0.9, mode: 'add', clip: skyClip, alpha: 0.6 });
        }
      }
    }

    // ------------------------------------------------------------ ground
    const bandRect = (d0, d1) => (g) => { const y0 = d0 > 1e8 ? HOR : yD(d0); g.rect(V.x, y0, V.w, yD(d1) - y0 + 0.5); };
    let snowMeasured = 0, pools = [];
    if (!summer) {
      const bands = [
        [1e9, 40, { V: 0.42, A: 0.12 }], [40, 14, { V: 0.3, A: 0.12, P: 0.1 }], [14, 5.2, { V: 0.22, O: 0.14, Y: 0.14 }],
        [5.2, 4.6, { Y: 0.16, V: 0.12, A: 0.06 }], [4.6, 4.3, { V: 0.55, F: 0.3 }],
        [4.3, 2.5, { Y: 0.34, O: 0.12, V: 0.14 }], [2.5, 1.6, { V: 0.5, F: 0.14, O: 0.14, A: 0.06 }], [1.6, 0.9, { Y: 0.36, O: 0.13, V: 0.13 }],
      ];
      for (const [d0, d1, col] of bands) pl.paint(bandRect(d0, d1), full(col), { clip: groundClip });
      pl.paint((g) => g.rect(V.x, HOR, V.w, K), lin(V.x, 0, V.x + V.w, 0, [[0, { Y: 0.16, O: 0.05, V: 0, A: 0 }], [0.4, { Y: 0, O: 0, V: 0, A: 0 }], [1, { Y: 0, O: 0, V: 0.24, A: 0.16 }]]), { mode: 'add', clip: groundClip });
      // snow patches: count solved so they cover the day's odds of 1"+ snow on the ground
      const SR = rng32(777), snowC = [], Dmax = 22, furrow = (D) => K / (D * D) * 0.052;
      for (let i = 0; i < 14000; i++) {
        const D = Math.sqrt(1 + SR() * (Dmax * Dmax - 1)), y = yD(D);
        if (y > GB + 10) continue;
        const lx = (SR() * 2 - 1) * (V.w / 2 + 70) * D / K, x = VP.x + lx * K / D;
        const gs = lerp(0.08, 0.62, Math.pow(SR(), 1.4)), w = gs * K / D, h = w * lerp(0.1, 0.3, (y - HOR) / K) * lerp(0.7, 1.2, SR());
        const parts = [], fs = furrow(D);
        if (h > 3 * fs && fs > 3) {
          for (let yy = y - h / 2 + fs / 2; yy < y + h / 2; yy += fs) { const e = 1 - Math.pow((yy - y) / (h / 2), 2); if (e <= 0) continue; parts.push([x + (SR() - 0.5) * w * 0.16, yy, w * Math.sqrt(e) * lerp(0.6, 1.1, SR()) / 2, fs * lerp(0.42, 0.62, SR())]); }
        } else {
          const np = 1 + Math.floor(SR() * 3);
          for (let j = 0; j < np; j++) parts.push([x + (SR() - 0.5) * w * 0.8, y + (SR() - 0.5) * h * 0.5, w * lerp(0.3, 0.55, SR()), Math.max(0.9, h * lerp(0.35, 0.6, SR()))]);
        }
        snowC.push({ y, parts, D });
      }
      const drifts = [];
      for (let x = V.x - 10; x < V.x + V.w; x += lerp(18, 60, SR())) { const w = lerp(20, 90, SR()), yy = yD(4.45) + lerp(-0.6, 0.8, SR()); drifts.push({ y: yy, parts: [[x + w / 2, yy, w / 2, lerp(1.4, 2.6, SR())]], D: 4.45 }); x += w; }
      for (let i = snowC.length - 1; i > 0; i--) { const j = Math.floor(SR() * (i + 1)); [snowC[i], snowC[j]] = [snowC[j], snowC[i]]; }
      snowC.unshift(...drifts);
      const sm = document.createElement('canvas'); sm.width = V.w / 2; sm.height = Math.ceil((GB - HOR) / 2);
      const smg = sm.getContext('2d', { willReadFrequently: true });
      const blobs = (g, c, dy = 0, sc = 1, ox = 0, oy = 0) => { for (const p of c.parts) { g.moveTo((p[0] - ox + p[2]) * sc, (p[1] + dy - oy) * sc); g.ellipse((p[0] - ox) * sc, (p[1] + dy - oy) * sc, p[2] * sc, p[3] * sc, 0, 0, TAU); } };
      smg.fillStyle = '#000'; let n = 0;
      const covNow = () => { const d = smg.getImageData(0, 0, sm.width, sm.height).data; let on = 0; for (let i = 3; i < d.length; i += 4) on += d[i] > 127; return on / (sm.width * sm.height); };
      while (S.snowGround > 0 && n < snowC.length) { smg.beginPath(); blobs(smg, snowC[n], 0, 0.5, V.x, HOR); smg.fill(); n++; if (n % 25 === 0 || n === snowC.length) { snowMeasured = covNow(); if (snowMeasured >= S.snowGround) break; } }
      for (const c of snowC.slice(0, n).sort((a, b) => a.y - b.y)) {
        const far = smooth(3, 14, c.D), warm = smooth(V.x + 600, V.x, c.parts[0][0]) * warmK;
        pl.paint((g) => blobs(g, c, -Math.max(0.7, c.parts[0][3] * 0.45)), full(mix(WINTER.snowShade, { V: 0.45, A: 0.2 }, far * 0.6)), { clip: groundClip });
        pl.paint((g) => blobs(g, c), full(mix(mix(WINTER.snow, WINTER.snowWarm, warm * (1 - far)), { V: 0.2, A: 0.1, P: 0.08 }, far)), { clip: groundClip });
      }
      pl.paint((g) => {
        for (let D = 0.92; D < 2.1; D += 0.055) { const y = yD(D); if (y > GB) continue; for (let x = V.x; x < V.x + V.w; x += 5 + R() * 9) { if (R() < 0.3) continue; const l = lerp(2, 9, R()) * smooth(2.1, 1.0, D); g.moveTo(x, y); g.lineTo(x + l, y + (R() - 0.5)); } }
      }, full({ O: 0.3, V: 0.5, F: 0.2 }), { stroke: 1.5, cap: 'butt', clip: groundClip, alpha: 0.8 });
    } else {
      const soil = wet ? SUMMER.soilWet : SUMMER.soilDry;
      const bands = [
        [1e9, 40, wet ? { G: 0.28, A: 0.3, B: 0.14, V: 0.08 } : { G: 0.3, A: 0.25, B: 0.1 }], [40, 14, green({ G: 0.5, Y: 0.2, B: 0.15 })], [14, 5.2, green({ G: 0.55, Y: 0.35, O: 0.05 })],
        [5.2, 4.6, wet ? { V: 0.3, F: 0.12, A: 0.1 } : { Y: 0.14, V: 0.14, A: 0.04 }], [4.6, 4.3, green(SUMMER.ditch)],
        [4.3, 2.5, soil], [2.5, 1.6, mix(soil, { Y: 0.2, O: 0.1 }, 0.35)], [1.6, 0.9, green(SUMMER.lawn)],
      ];
      for (const [d0, d1, col] of bands) pl.paint(bandRect(d0, d1), full(col), { clip: groundClip });
      // young corn: east-west rows; the canopy looks more continuous with distance (June: ~90% emerged, USDA 5-yr avg)
      const cornRow = green(SUMMER.cornRow), rowG = 0.11;
      pl.paint((g) => { for (let D = 2.5 + rowG / 2; D < 4.3; D += rowG) { const f = lerp(0.46, 0.8, (D - 2.5) / 1.8), y0 = yD(D + rowG * f / 2), y1 = yD(D - rowG * f / 2); g.rect(V.x, y0, V.w, Math.max(0.6, y1 - y0)); } }, full(cornRow), { clip: groundClip });
      pl.paint((g) => { for (let D = 2.5 + rowG / 2; D < 3.2; D += rowG) { const y1 = yD(D - rowG * 0.23); for (let x = V.x; x < V.x + V.w; x += 3 + R() * 5) { const h = lerp(2, 5, R()) * smooth(3.2, 2.5, D); g.moveTo(x, y1 - h * 0.6); g.lineTo(x + 2.2, y1 - h * 0.6 - h); g.lineTo(x + 4, y1 - h * 0.6); g.closePath(); } } }, full(cornRow), { clip: groundClip });
      pl.paint((g) => { for (let D = 2.5 + rowG / 2; D < 4.3; D += rowG) { const y1 = yD(D - rowG * 0.23); g.rect(V.x, y1 - 0.9, V.w, 0.9); } }, full(SUMMER.cornShade), { clip: groundClip });
      // soybeans: smaller plants in narrow rows, dashed
      pl.paint((g) => { for (let D = 1.6 + 0.03; D < 2.5; D += 0.06) { const y0 = yD(D + 0.011), y1 = yD(D - 0.011); g.moveTo(V.x, y1); for (let x = V.x; x <= V.x + V.w; x += 4) g.lineTo(x, y0 - 0.6 - 1.1 * vnoise(x / 3.5, D * 40, 5)); g.lineTo(V.x + V.w, y1); g.closePath(); } }, full(green(SUMMER.soy)), { clip: groundClip });
      // lawn and ditch grass blades
      const blades = (d0, d1, n, col, lit) => pl.paint((g) => {
        for (let i = 0; i < n; i++) { const D = lerp(d1, d0, Math.pow(R(), 0.7)), y = yD(D); if (y > GB) continue; const x = V.x + R() * V.w, h = lerp(2, 11, R()) / D; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * h * 0.6 + windX * h * 0.3, y - h); }
      }, full(col), { stroke: 1.2, clip: groundClip, alpha: lit ? 0.7 : 0.9 });
      blades(1.6, 0.9, 2600, SUMMER.blade); blades(1.6, 0.9, 900, SUMMER.bladeLit, true); blades(4.6, 4.3, 500, SUMMER.blade);
      // wet: standing water reflects the sky: puddles on the road, slivers between soybean rows
      if (wet) {
        const pud = (x, D, gw, gh) => { const y = yD(D), w = gw * K / D, h = Math.max(1.4, gh * K / (D * D)); return [x, y, w, h]; };
        pools = [pud(210, 1.12, 0.62, 0.05), pud(470, 1.3, 0.4, 0.04), pud(905, 1.18, 0.5, 0.045), pud(250, 4.9, 0.55, 0.12), pud(420, 4.95, 0.3, 0.1), pud(610, 4.85, 0.7, 0.14), pud(820, 4.92, 0.4, 0.1), pud(330, 2.2, 0.35, 0.02), pud(700, 1.95, 0.45, 0.025), pud(520, 2.35, 0.25, 0.018)];
        for (const [x, y, w, h] of pools) {
          pl.paint((g) => g.ellipse(x, y, w / 2 + 2, h / 2 + 1.2, 0, 0, TAU), full(y > yD(1.6) ? { G: 0.9, F: 0.4, Y: 0.2 } : dark(soil, 0.12)), { clip: groundClip });
          pl.paint((g) => g.ellipse(x, y, w / 2, h / 2, 0, 0, TAU), full(SUMMER.puddle), { clip: groundClip });
          pl.paint((g) => g.ellipse(x - w * 0.12, y - h * 0.12, w * 0.28, Math.max(0.6, h * 0.16), 0, 0, TAU), full({ A: 0.08 }), { clip: groundClip });
        }
      }
      // light from the side the sun is on; a cool veil over distance when it's raining
      pl.paint((g) => g.rect(V.x, HOR, V.w, K), lin(V.x, 0, V.x + V.w, 0, litSide > 0 ? [[0, { Y: 0 }], [1, { Y: wet ? 0.04 : 0.12 }]] : [[0, { Y: wet ? 0.04 : 0.12 }], [1, { Y: 0 }]]), { mode: 'add', clip: groundClip });
      if (wet) pl.paint((g) => g.rect(V.x, HOR - 2, V.w, 70), lin(0, HOR - 2, 0, HOR + 68, [[0, { Y: 0.3, O: 0.3, P: 0.3, V: 0.3, A: 0.3, B: 0.3, F: 0.3, G: 0.3 }], [1, { Y: 0, O: 0, P: 0, V: 0, A: 0, B: 0, F: 0, G: 0 }]]), { mode: 'lift', clip: groundClip });
    }

    // ------------------------------------------------ far horizon: windbreaks, farm, elevator, tower
    const ridge = (x0, x1, hmax, seed, col, base = HOR + 1, lumpy = false) => pl.paint((g) => {
      g.moveTo(x0, base);
      for (let x = x0; x <= x1; x += 1.5) { const n = lumpy ? 0.55 + 0.45 * Math.abs(Math.sin(x / 5.3 + seed)) * fbm(x / 11, 0, seed, 2) * 1.6 : 0.3 + 0.7 * fbm(x / 7, 0, seed, 3); g.lineTo(x, base - hmax * n * smooth(x0, x0 + 18, x) * smooth(x1, x1 - 18, x)); }
      g.lineTo(x1, base); g.closePath();
    }, full(col), { clip: viewClip });
    if (summer) { ridge(V.x, 260, 14, 3, SUMMER.treeline, HOR + 1, true); ridge(550, 720, 16, 5, SUMMER.treeline, HOR + 1, true); ridge(815, 960, 12, 8, SUMMER.treeline, HOR + 1, true); }
    else { ridge(V.x, 250, 9, 3, WINTER.treeline); ridge(560, 720, 11, 5, WINTER.treeline); ridge(820, 960, 8, 8, WINTER.treeline); }

    const bld = summer ? { body: SUMMER.concrete, lit: SUMMER.concreteLit, shade: SUMMER.concreteShade } : { body: WINTER.violet, lit: WINTER.litEdge, shade: WINTER.violet };
    const veil = (c) => (wet ? mix(c, { A: 0.3, V: 0.25, B: 0.1 }, 0.35) : c);
    const ex = 732, eb = HOR + 2, edge = (x, w) => (litSide > 0 ? x + w - 3.5 : x);
    pl.paint((g) => { for (let i = 0; i < 4; i++) { g.rect(ex + i * 14, eb - 58, 13, 58); g.ellipse(ex + i * 14 + 6.5, eb - 58, 6.5, 3.5, 0, 0, TAU); } g.rect(ex + 56, eb - 92, 17, 92); g.rect(ex + 59, eb - 101, 11, 10); g.rect(ex + 96, eb - 26, 26, 26); g.rect(ex - 14, eb - 22, 12, 22); }, full(veil(bld.body)));
    pl.paint((g) => { for (let i = 0; i < 4; i++) g.rect(edge(ex + i * 14, 13), eb - 58, 3.5, 58); g.rect(edge(ex + 56, 17), eb - 92, 4, 92); g.rect(edge(ex - 14, 12), eb - 22, 3, 22); }, full(veil(bld.lit)));
    if (summer) pl.paint((g) => { for (let i = 0; i < 4; i++) g.rect(litSide > 0 ? ex + i * 14 : ex + i * 14 + 9.5, eb - 58, 3.5, 58); }, full(veil(bld.shade)));
    pl.paint((g) => { g.moveTo(ex + 68, eb - 86); g.lineTo(ex + 110, eb - 26); }, full(veil(bld.shade)), { stroke: 2 });
    const wx = 906, wb = HOR + 2, wt = wb - 66;
    pl.paint((g) => { for (const lx of [-15, -5, 5, 15]) { g.moveTo(wx + lx * 0.7, wt + 6); g.lineTo(wx + lx, wb); } g.moveTo(wx - 13, wb - 24); g.lineTo(wx + 13, wb - 24); g.moveTo(wx, wt + 8); g.lineTo(wx, wb); }, full(veil(summer ? bld.shade : bld.body)), { stroke: 1.8 });
    pl.paint((g) => { g.ellipse(wx, wt, 25, 12, 0, 0, TAU); g.moveTo(wx - 22, wt - 5); g.lineTo(wx, wt - 19); g.lineTo(wx + 22, wt - 5); g.closePath(); g.rect(wx - 1, wt - 23, 2, 5); }, full(veil(bld.body)));
    pl.paint((g) => g.ellipse(wx + litSide * 13, wt + 1, 9, 12, 0, 0, TAU), full(veil(bld.lit)), { clip: (g) => g.ellipse(wx, wt, 25, 12, 0, 0, TAU) });

    // farmstead: windbreak (bare in winter, in leaf in summer, two evergreens always), house, red barn
    const fx = 404, fb = yD(8.5) + 1;
    if (summer) {
      for (let i = 0; i < 6; i++) {
        const tx = fx - 88 + i * 15 + (R() - 0.5) * 6, th = lerp(26, 40, R()), cr = lerp(9, 13, R());
        pl.paint((g) => { g.moveTo(tx, fb); g.lineTo(tx, fb - th * 0.6); }, full(SUMMER.trunk), { stroke: 1.8 });
        const lobes = []; for (let j = 0; j < 5; j++) lobes.push([tx + (R() - 0.5) * cr * 1.2, fb - th * 0.62 - R() * th * 0.45, cr * lerp(0.6, 0.95, R())]);
        pl.paint((g) => circles(g, lobes), full(veil(green(SUMMER.canopy))));
        pl.paint((g) => circles(g, lobes, -litSide * cr * 0.35, cr * 0.25), full(veil(green(SUMMER.canopyLit))), { clip: (g) => circles(g, lobes) });
        pl.paint((g) => circles(g, lobes, -litSide * cr * 0.18, cr * 0.12), full(veil(green(SUMMER.canopy))), { clip: (g) => circles(g, lobes) });
      }
    } else {
      const branch = (x, y, len, ang, w, depth, col) => {
        if (depth <= 0 || len < 1.6) return;
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        pl.paint((g) => { g.moveTo(x, y); g.lineTo(x2, y2); }, full(col), { stroke: w, clip: viewClip });
        const n = 2 + (R() < 0.35 ? 1 : 0);
        for (let i = 0; i < n; i++) branch(x2, y2, len * lerp(0.66, 0.82, R()), ang + (i - (n - 1) / 2) * lerp(0.35, 0.6, R()) + (R() - 0.5) * 0.25, Math.max(0.7, w * 0.7), depth - 1, col);
      };
      for (let i = 0; i < 8; i++) { const tx = fx - 84 + i * 19 + (R() - 0.5) * 8; branch(tx, fb - 1, lerp(10, 15, R()), -Math.PI / 2 + (R() - 0.5) * 0.12, 2.4, 6, WINTER.trees); }
    }
    for (const [ex2, eh] of [[fx - 104, 44], [fx - 96, 36]]) pl.paint((g) => { for (let k = 0; k < 4; k++) { const yy = fb - k * eh * 0.24, hw = lerp(8, 3, k / 3); g.moveTo(ex2 - hw, yy); g.lineTo(ex2, yy - eh * 0.36); g.lineTo(ex2 + hw, yy); g.closePath(); } }, full(veil(summer ? green(SUMMER.evergreen) : { G: 0.55, F: 0.75, B: 0.1 })));
    const hx = fx - 34, hw = 38, hh = 22;
    pl.paint((g) => g.rect(hx, fb - hh, hw, hh), full(veil(C.house)));
    pl.paint((g) => { g.moveTo(hx - 4, fb - hh); g.lineTo(hx + hw / 2, fb - hh - 15); g.lineTo(hx + hw + 4, fb - hh); g.closePath(); g.rect(hx + 26, fb - hh - 19, 5, 10); }, full(veil(C.roof)));
    const lampOn = !summer || wet;                                    // lit windows at dawn, or on a dark rainy afternoon
    pl.paint((g) => g.rect(hx + 7, fb - 15, 6, 7), full(lampOn ? C.lamp : C.darkWin));
    pl.paint((g) => g.rect(hx + 22, fb - 15, 6, 7), full(!summer ? C.lamp : C.darkWin));
    pl.paint((g) => { g.moveTo(hx, fb - 0.5); g.lineTo(hx + hw, fb - 0.5); }, full(C.roof), { stroke: 1 });
    const bx = fx + 14;
    pl.paint((g) => { g.moveTo(bx, fb); g.lineTo(bx, fb - 24); g.lineTo(bx + 9, fb - 36); g.lineTo(bx + 33, fb - 36); g.lineTo(bx + 42, fb - 24); g.lineTo(bx + 42, fb); g.closePath(); }, full(veil(C.barn)));
    pl.paint((g) => { g.moveTo(bx - 1, fb - 23); g.lineTo(bx + 9, fb - 36); g.lineTo(bx + 33, fb - 36); g.lineTo(bx + 43, fb - 23); }, full(C.roof), { stroke: 3 });
    pl.paint((g) => g.rect(bx + 15, fb - 14, 12, 14), full(veil(C.barnDoor)));
    if (!summer) {
      const bend = clamp(windKt / 15, 0, 1);
      for (let i = 0; i < 26; i++) { const t = i / 25, px = hx + 28.5 + windX * t * 170 * (0.2 + bend), py = fb - hh - 20 - t * lerp(100, 30, bend) - Math.sin(t * 6) * 3; pl.paint((g) => g.arc(px, py, lerp(2, 11, t), 0, TAU), full({ V: 0.42, F: 0.12, P: 0.1 }), { alpha: lerp(0.5, 0, t), clip: skyClip }); }
    }

    // county road power line
    const pD = 5.2, pb = yD(pD) + 0.5, ph = 1.9 * K / pD;
    const poleXs = []; for (let x = V.x + 40; x < V.x + V.w; x += 132) poleXs.push(x + (R() - 0.5) * 8);
    pl.paint((g) => { for (const x of poleXs) { g.moveTo(x, pb); g.lineTo(x, pb - ph); g.moveTo(x - 8, pb - ph + 4); g.lineTo(x + 8, pb - ph + 4); } }, full(C.navy), { stroke: 2.4, cap: 'butt', clip: viewClip });
    pl.paint((g) => { for (const off of [-6, 6]) { g.moveTo(V.x, pb - ph + 3); for (let i = 0; i < poleXs.length - 1; i++) { const a = poleXs[i], b = poleXs[i + 1]; g.lineTo(a + off, pb - ph + 3); g.quadraticCurveTo((a + b) / 2 + off, pb - ph + 14, b + off, pb - ph + 3); } g.lineTo(V.x + V.w, pb - ph + 3); } }, full(C.navy), { stroke: 1, clip: viewClip });

    // windsock on a mast whose top sits near eye level. The sock axis is projected from 3-D: it points downwind and lifts with
    // speed (fully out at 15 kt); pointing at or away from the viewer it foreshortens and shows its tail opening.
    const wsx = 652, wsb = yD(1.02), wsTop = HOR + 16;
    pl.paint((g) => { g.moveTo(wsx, wsb); g.lineTo(wsx, wsTop - 6); }, full(C.navy), { stroke: 3.4, cap: 'butt' });
    pl.paint((g) => g.arc(wsx, wsTop - 7, 3, 0, TAU), full(C.navy));
    const lift = clamp(windKt / 15, 0.05, 1) * 88 * DEG, th0 = (wsTop - HOR) / PXD * DEG, sockAz = 90 + (wsx - V.x) / PXD;
    const wXs = Math.cos((windDown - (sockAz + 90)) * DEG), wZs = Math.cos((windDown - sockAz) * DEG);
    const axv = [Math.sin(lift) * wXs, -Math.cos(lift), Math.sin(lift) * wZs];                 // x west, y up, z south (away)
    const sxs = axv[0], sys = -(axv[1] * Math.cos(th0) + axv[2] * Math.sin(th0)), af = -axv[1] * Math.sin(th0) + axv[2] * Math.cos(th0);
    const plen = Math.hypot(sxs, sys), ax = sxs / (plen || 1), ay = sys / (plen || 1), nx = -ay, ny = ax;
    const len = 104 * Math.max(0.28, plen), r0 = 13, r1 = 8.5, ox = wsx + 2 * Math.sign(ax || 1), oy = wsTop + 3;
    const tipX = ox + ax * len, tipY = oy + ay * len, ratio = Math.abs(af);
    const stripes = () => {
      for (let s2 = 0; s2 < 5; s2++) {
        const t0 = s2 / 5, t1 = (s2 + 1) / 5, ra = lerp(r0, r1, t0), rb = lerp(r0, r1, t1);
        const A = [ox + ax * len * t0, oy + ay * len * t0], B = [ox + ax * len * t1 + (s2 === 4 ? 0 : ax * 0.6), oy + ay * len * t1];
        pl.paint((g) => { g.moveTo(A[0] + nx * ra, A[1] + ny * ra); g.lineTo(B[0] + nx * rb, B[1] + ny * rb); g.ellipse(B[0], B[1], rb, rb * ratio, Math.atan2(ny, nx), 0, Math.PI, af > 0); g.lineTo(A[0] - nx * ra, A[1] - ny * ra); g.closePath(); }, full(s2 % 2 === 0 ? C.sock : { A: 0.03 }));
      }
      pl.paint((g) => { g.moveTo(ox + nx * r0, oy + ny * r0); g.lineTo(tipX + nx * r1, tipY + ny * r1); g.moveTo(ox - nx * r0, oy - ny * r0); g.lineTo(tipX - nx * r1, tipY - ny * r1); }, full(C.navy), { stroke: 1.2 });
    };
    const mouth = () => pl.paint((g) => g.ellipse(ox, oy, r0, Math.max(2.4, r0 * ratio), Math.atan2(ny, nx), 0, TAU), full(C.navy), { stroke: 1.6 });
    const tail = () => { pl.paint((g) => g.ellipse(tipX, tipY, r1, Math.max(1.5, r1 * ratio), Math.atan2(ny, nx), 0, TAU), full({ F: 0.9, O: 0.35 })); pl.paint((g) => g.ellipse(tipX, tipY, r1, Math.max(1.5, r1 * ratio), Math.atan2(ny, nx), 0, TAU), full(C.sock), { stroke: 2 }); };
    if (af < 0) { mouth(); stripes(); if (ratio > 0.2) tail(); } else { stripes(); mouth(); }

    // ----------------------------------------------- room: casing, sill, thermometer, glass
    pl.paint((g) => g.rect(V.x, V.y, V.w, 34), lin(0, V.y, 0, V.y + 34, [[0, { F: 0.35 }], [1, { F: 0 }]]), { mode: 'add', clip: viewClip });
    pl.paint((g) => { g.roundRect(94, 102 + OY, 892, 700, 54); g.roundRect(V.x, V.y, V.w, V.h, 36); }, full(C.casing), { rule: 'evenodd' });
    pl.paint((g) => g.roundRect(V.x - 1, V.y - 1, V.w + 2, V.h + 2, 37), full(C.frameInner), { stroke: 3.5 });
    pl.paint((g) => g.roundRect(94, 102 + OY, 892, 700, 54), full(C.casingLine), { stroke: 1.6 });
    pl.paint((g) => g.rect(48, 800 + OY, 984, 28), full(C.sillTop));
    pl.paint((g) => g.rect(48, 828 + OY, 984, 18), full(C.sillFront));
    pl.paint((g) => g.rect(48, 846 + OY, 984, 40), lin(0, 846 + OY, 0, 886 + OY, [[0, C.sillShadow], [1, { V: 0, B: 0 }]]), { mode: 'add' });

    const th = { x: 868, y: 236 + OY, r: 66 };
    const tAng = (T) => (135 + (clamp(T, -20, 120) + 20) / 140 * 270) * DEG;
    pl.paint((g) => g.arc(th.x, th.y, th.r + 6, 0, TAU), full({ A: 0.35, B: 0.08 }));
    pl.paint((g) => g.arc(th.x, th.y, th.r, 0, TAU), full({}));
    pl.paint((g) => g.arc(th.x, th.y, th.r, 0, TAU), full(C.ink), { stroke: 2.4 });
    pl.paint((g) => g.arc(th.x, th.y, th.r - 11, tAng(S.lo), tAng(S.hi)), full(C.band), { stroke: 8, cap: 'butt' });
    for (let T = -20; T <= 120; T += 10) {
      const a = tAng(T), major = T % 50 === 0, r1 = th.r - 5, r2 = th.r - (major ? 18 : 11);
      pl.paint((g) => { g.moveTo(th.x + Math.cos(a) * r1, th.y + Math.sin(a) * r1); g.lineTo(th.x + Math.cos(a) * r2, th.y + Math.sin(a) * r2); }, full(C.ink), { stroke: major ? 2 : 1.3, cap: 'butt' });
      if (major) { const rr = th.r - 33; pl.text(String(T), th.x + Math.cos(a) * rr, th.y + Math.sin(a) * rr + 1, '600 13px Inter, sans-serif', full(C.ink)); }
    }
    pl.text('°F', th.x, th.y + 28, '600 11px Inter, sans-serif', full(C.ink));
    const na = tAng(S.tempNow);
    pl.paint((g) => { g.moveTo(th.x - Math.cos(na) * 12, th.y - Math.sin(na) * 12); g.lineTo(th.x + Math.cos(na) * (th.r - 8), th.y + Math.sin(na) * (th.r - 8)); }, full(C.needle), { stroke: 2.6 });
    pl.paint((g) => g.arc(th.x, th.y, 5, 0, TAU), full(C.ink));

    const gl = { x: 812, base: 816 + OY, h: 124, wt: 66, wb: 54 };
    const gTop = gl.base - gl.h, frac = clamp(S.ytdRain / S.yearRain, 0, 1);
    const gx = (t, side) => gl.x + side * lerp(gl.wb, gl.wt, t) / 2;
    const glassPath = (g) => { g.moveTo(gx(0, -1), gl.base); g.lineTo(gx(1, -1), gTop); g.lineTo(gx(1, 1), gTop); g.lineTo(gx(0, 1), gl.base); g.closePath(); };
    pl.paint(glassPath, { Y: 0.2, O: 0.2, P: 0.2, V: 0.2, A: 0.2, B: 0.2, F: 0.2, G: 0.2 }, { mode: 'lift' });
    pl.paint(glassPath, { A: 0.12 }, { mode: 'add' });
    const wl = gl.base - 5 - frac * (gl.h - 10), tw = (gl.base - wl) / gl.h;
    pl.paint((g) => { g.moveTo(gx(0, -1) + 2.5, gl.base - 4); g.lineTo(gx(tw, -1) + 2.5, wl); g.lineTo(gx(tw, 1) - 2.5, wl); g.lineTo(gx(0, 1) - 2.5, gl.base - 4); g.closePath(); }, full(C.water));
    pl.paint((g) => { g.moveTo(gx(0, -1), gl.base); g.lineTo(gx(1, -1), gTop); g.moveTo(gx(1, 1), gTop); g.lineTo(gx(0, 1), gl.base); g.moveTo(gx(0, -1) - 1, gl.base); g.lineTo(gx(0, 1) + 1, gl.base); }, full(C.ink), { stroke: 2.2 });
    pl.paint((g) => g.ellipse(gl.x, gTop, gl.wt / 2, 4.6, 0, 0, TAU), full(C.ink), { stroke: 2 });
    pl.paint((g) => g.ellipse(gl.x, wl, lerp(gl.wb, gl.wt, tw) / 2 - 2.5, 3, 0, 0, TAU), full({ A: 0.5, B: 0.2 }));
    for (let i = 1; i <= 4; i++) { const y = gl.base - 5 - (i * 10 / S.yearRain) * (gl.h - 10), t = (gl.base - y) / gl.h; pl.paint((g) => { g.moveTo(gx(t, 1) - 3, y); g.lineTo(gx(t, 1) - (i % 2 ? 9 : 14), y); }, full(C.ink), { stroke: 1.5, cap: 'butt' }); }

    // ------------------------------------------------------------- print
    const ctx = outCanvas.getContext('2d');
    pl.print(ctx, { pitch: S.pitch || 4.2, texture: S.texture ?? 0.45 });

    // paper-white and wet marks printed last
    const paper = `rgb(${PAPER.join(',')})`;
    ctx.save(); ctx.beginPath(); ctx.roundRect(V.x, V.y, V.w, V.h, 36); ctx.clip();
    if (moon) {
      const k = Math.max(S.moon.phase, 0.24), a = Math.atan2(sun.y - moon.y, sun.x - moon.x);
      ctx.save(); ctx.translate(moon.x, moon.y); ctx.rotate(a); ctx.beginPath();
      ctx.arc(0, 0, moon.r, -Math.PI / 2, Math.PI / 2); ctx.ellipse(0, 0, moon.r * (1 - 2 * k), moon.r, 0, Math.PI / 2, -Math.PI / 2, true);
      ctx.fillStyle = 'rgb(250,246,228)'; ctx.fill(); ctx.restore();
    }
    const avoid = (x, y) => Math.hypot(x - th.x, y - th.y) < th.r + 10 || (x > gl.x - 42 && x < gl.x + 42 && y > gTop - 8);
    const nFlakes = Math.round((S.snowFall || 0) * 260);
    for (let i = 0; i < nFlakes; i++) {
      const x = V.x + R() * V.w, y = V.y + R() * V.h, s = lerp(2, 4.2, R() * R());
      if (avoid(x, y)) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(1, windX * 0.7));
      ctx.fillStyle = 'rgba(30,110,150,0.26)'; ctx.beginPath(); ctx.ellipse(1.2, 1.4, s * 1.5, s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = paper; ctx.beginPath(); ctx.ellipse(0, 0, s * 1.5, s, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
    let rainStreaks = 0, drops = 0;
    if (wet) {
      // falling rain: streak count scales with the wet-day rain amount (median wet day = 1x)
      const amt = clamp((S.rainIn || 0.23) / 0.23, 0.3, 3), slant = windX * 0.22;
      rainStreaks = Math.round(620 * amt);
      ctx.lineCap = 'round';
      for (let i = 0; i < rainStreaks; i++) {
        const x = V.x + R() * (V.w + 60) - 30, y = V.y + R() * V.h, len = lerp(14, 42, R()), lw = lerp(0.8, 1.5, R());
        if (avoid(x, y)) continue;
        const light = R() < 0.72;
        ctx.strokeStyle = light ? `rgba(${PAPER.join(',')},${lerp(0.35, 0.7, R()).toFixed(2)})` : `rgba(26,96,150,${lerp(0.3, 0.55, R()).toFixed(2)})`;
        ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + slant * len, y + len); ctx.stroke();
      }
      // drops on the window glass: lens with a dark lower rim and a bright glint; a few running trails
      const DR = rng32(515); drops = Math.round(70 * amt);
      for (let i = 0; i < drops; i++) {
        const x = V.x + 10 + DR() * (V.w - 20), y = V.y + 10 + DR() * (V.h - 20), r = lerp(2, 7.5, Math.pow(DR(), 2.2));
        if (avoid(x, y)) continue;
        if (DR() < 0.12) { ctx.strokeStyle = `rgba(${PAPER.join(',')},0.32)`; ctx.lineWidth = r * 0.7; ctx.beginPath(); ctx.moveTo(x + (DR() - 0.5) * 3, y - lerp(30, 90, DR())); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.fillStyle = `rgba(${PAPER.join(',')},0.28)`; ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.12, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(20,60,110,0.42)'; ctx.lineWidth = Math.max(0.8, r * 0.28); ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.12, 0, 0.15 * Math.PI, 0.95 * Math.PI); ctx.stroke();
        ctx.fillStyle = 'rgba(252,250,244,0.95)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, Math.max(0.8, r * 0.28), 0, TAU); ctx.fill();
      }
      // rings where rain hits the puddles
      ctx.strokeStyle = `rgba(${PAPER.join(',')},0.6)`; ctx.lineWidth = 0.8;
      for (const [px, py, pw, ph2] of pools) for (let i = 0; i < Math.max(1, Math.round(pw / 14)); i++) { const x = px + (R() - 0.5) * pw * 0.7, y = py + (R() - 0.5) * ph2 * 0.4, rr = lerp(0.12, 0.3, R()) * Math.min(pw, 40); ctx.beginPath(); ctx.ellipse(x, y, rr, Math.max(0.8, rr * ph2 / pw), 0, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = 'rgb(252,248,238)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(gx(0.14, -1) + 8, gl.base - 14); ctx.lineTo(gx(0.86, -1) + 9, gTop + 14); ctx.stroke(); ctx.restore();

    return { clouds: clouds.length, cloudCover: +measured.toFixed(3), snowCover: +snowMeasured.toFixed(3), rainStreaks, drops };
  }

  global.RisoWindow = { renderWindow };
})(window);
