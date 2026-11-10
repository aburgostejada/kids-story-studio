// fx module: light, water, pour, motes, fireflies, moth, puff, splash, sparkle, pebble (see CONTRACT.md).
// Pure functions of their inputs (film time comes from st.t). No images, no Math.random, no clocks.
//
// Ground-hugging effects (the water ribbon, the trickle, ripples, splash rings) are cut into short pieces, each its own
// item at its own depth, so stones nearer the camera paint over them and depth of field blurs each piece correctly.
// Inside a piece the true perspective is rebuilt: core.js does not hand the camera to items, so every builder adds two
// invisible "probe" items far away. Their transforms give the lens (cam.z); an item's own transform gives cam.x, cam.y
// and the roll. World points are then projected into the item's local plane (see projector()).
//
// Call order note (documented, not required): fx.fireflies() leaves its camera for fx.lights(), which then adds weak
// green-yellow lights at the fireflies. shots.js builds the items first and the lights after, which is the right order.
(() => {
const P = window.PIP, { clamp, lerp, ss, hash, TAU, W, H } = P;
const fx = P.fx = {};
const fract = v => v - Math.floor(v);
const num = (v, d) => (v === undefined || v === null || Number.isNaN(v)) ? d : v;
const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.round(a * 1000) / 1000})`;
const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const lit3 = (c, x, y, z, emit = 0) => { const m = P.light(x, y, z); return [clamp(c[0] * (m[0] + emit), 0, 255), clamp(c[1] * (m[1] + emit), 0, 255), clamp(c[2] * (m[2] + emit), 0, 255)]; };
const pt3 = p => Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p;
const sgn = v => v < 0 ? -1 : 1;
const easeOut = k => 1 - (1 - clamp(k)) ** 2.2;

const COL = {
  warm: [255, 168, 70], gold: [255, 204, 110], hot: [255, 214, 142], white: [255, 232, 180], amber: [255, 176, 84],
  coolDeep: [14, 36, 66], coolMid: [52, 104, 160], coolHi: [180, 214, 250], sky: [96, 134, 214], skyLow: [34, 56, 120],
  brown: [96, 48, 18], lime: [196, 255, 96],
};

fx.ROOT = { x: 0, y: 0, z: 400 };      // foot of Pip's flower
fx.WATER_HALF = 10;                     // half width of a hand-placed ribbon's water (fx.waterRibbon default is its own o.width)
const CH_HALF = 11.2;                   // the channel's water fills its sunken trench wall to wall (world.js: the bed is 22 wide)
const LIFT = 2.6;                       // ribbons: the surface sits LIFT above the y the ribbon's at() reports
// The channel water sits inside the trench world.js cuts (P.world.waterY(u), below the rim stones), so it is drawn per piece after the
// trench slices it covers and clipped to the trench opening at ground level: the near lip and bank hide what they should.

// ---------------------------------------------------------------- one blur for a whole group of strokes
// A blur filter set on the context costs a full blur pass for every single stroke drawn under it, so a few hundred foam lumps under one
// filter cost seconds a frame. Instead a group of strokes that share one blur is collected (blurGroup().ell / .line), drawn sharp into an
// offscreen layer just big enough for it (with the frame's transform and blend mode) and laid onto the frame once, through the blur. The
// layer reaches up to BLUR_PAD pixels past the frame on every side, so strokes that run off the frame are still drawn there and the blur does
// not fade at the frame's edge. Layers come from a small pool of sizes, so a group far off in a wide only pays for a small one.
const BLUR_PAD = 48, BLUR_POOL = new Map();
const blurLayer = (w, h) => { const bw = Math.ceil(w / 128) * 128, bh = Math.ceil(h / 128) * 128, key = bw + 'x' + bh;
  let L = BLUR_POOL.get(key); if (!L) { const c = P.off(bw, bh); L = { c, x: c.getContext('2d') }; BLUR_POOL.set(key, L); } return L; };
function blurGroup(ctx) {
  const ops = [], m = ctx.getTransform(), comp = ctx.globalCompositeOperation, cap = ctx.lineCap, join = ctx.lineJoin;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (x, y, r) => { if (x - r < x0) x0 = x - r; if (y - r < y0) y0 = y - r; if (x + r > x1) x1 = x + r; if (y + r > y1) y1 = y + r; };
  return {
    // a filled ellipse (local units, as ctx.ellipse)
    ell(x, y, rx, ry, rot, style) { ops.push([0, style, x, y, rx, ry, rot]); ext(x, y, Math.max(rx, ry)); },
    // a stroked polyline through pts ([x0, y0, x1, y1, ...], local units)
    line(pts, lw, style) { ops.push([1, style, pts, lw]); for (let i = 0; i < pts.length; i += 2) ext(pts[i], pts[i + 1], lw / 2); },
    // lay the group onto ctx through blur(px)
    done(px) {
      if (!ops.length) return;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const [u, v] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) { const X2 = m.a * u + m.c * v + m.e, Y2 = m.b * u + m.d * v + m.f;
        if (X2 < bx0) bx0 = X2; if (Y2 < by0) by0 = Y2; if (X2 > bx1) bx1 = X2; if (Y2 > by1) by1 = Y2; }
      const g = Math.ceil(3 * px) + 3, cw = ctx.canvas.width, ch = ctx.canvas.height;   // the blur's reach, plus a pixel of antialiasing
      bx0 = Math.max(-BLUR_PAD, Math.floor(bx0 - g)); by0 = Math.max(-BLUR_PAD, Math.floor(by0 - g));
      bx1 = Math.min(cw + BLUR_PAD, Math.ceil(bx1 + g)); by1 = Math.min(ch + BLUR_PAD, Math.ceil(by1 + g));
      x0 = y0 = Infinity; x1 = y1 = -Infinity;
      const w = bx1 - bx0, h = by1 - by0; if (w <= 0 || h <= 0 || bx1 < 0 || by1 < 0 || bx0 > cw || by0 > ch) { ops.length = 0; return; }
      const L = blurLayer(w, h), X = L.x;
      X.setTransform(1, 0, 0, 1, 0, 0); X.globalAlpha = 1; X.filter = 'none'; X.globalCompositeOperation = 'source-over'; X.clearRect(0, 0, w, h);
      X.setTransform(m.a, m.b, m.c, m.d, m.e - bx0, m.f - by0); X.globalCompositeOperation = comp; X.lineCap = cap; X.lineJoin = join; X.setLineDash([]);
      for (const o of ops) {
        if (o[0] === 0) { X.fillStyle = o[1]; X.beginPath(); X.ellipse(o[2], o[3], o[4], o[5], o[6], 0, TAU); X.fill(); }
        else { const q = o[2]; X.strokeStyle = o[1]; X.lineWidth = o[3]; X.beginPath(); X.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) X.lineTo(q[i], q[i + 1]); X.stroke(); }
      }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = comp; ctx.filter = `blur(${px.toFixed(1)}px)`;
      ctx.drawImage(L.c, 0, 0, w, h, bx0, by0, w, h); ctx.restore();
      ops.length = 0;
    },
  };
}

// Additive cores are capped at amber: no light colour in this module is whiter than about (255, 214, 142), so stacked glows
// climb toward amber and never blow out to flat white.
// ---------------------------------------------------------------- soft light shapes (all gaussian-ish, never a hard edge)
const FALL = [[0, 1], [0.16, 0.82], [0.34, 0.52], [0.54, 0.26], [0.74, 0.09], [0.9, 0.02], [1, 0]];
function disc(ctx, x, y, rx, ry, col, a) {
  if (a < 0.004 || rx < 0.04) return;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [o, k] of FALL) g.addColorStop(o, rgba(col, a * k));
  ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
}
// a feathered ring: transparent centre, soft peak near the rim, soft outside (ry flattens it onto the ground)
function ringGlow(ctx, x, y, rx, ry, col, a, inner = 0.55) {
  if (a < 0.004 || rx < 0.04) return;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1), pk = lerp(inner, 1, 0.62);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(inner, rgba(col, a * 0.1)); g.addColorStop(lerp(inner, pk, 0.55), rgba(col, a * 0.45)); g.addColorStop(pk, rgba(col, a));
  g.addColorStop(lerp(pk, 1, 0.5), rgba(col, a * 0.35)); g.addColorStop(1, rgba(col, 0));
  ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
}
// four-point twinkle with a warm core (concave star, not a flare)
function twinkle(ctx, x, y, r, col, a, rot = 0) {
  if (a < 0.01 || r < 0.05) return;
  disc(ctx, x, y, r * 2.4, r * 2.4, col, a * 0.45);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2, c = Math.cos(an), s = Math.sin(an), c2 = Math.cos(an + Math.PI / 4), s2 = Math.sin(an + Math.PI / 4);
    ctx.lineTo(c * r * 1.5, s * r * 1.5); ctx.lineTo(c2 * r * 0.2, s2 * r * 0.2); }
  ctx.closePath(); ctx.fillStyle = rgba(mix(col, COL.hot, 0.5), a * 0.85); ctx.fill(); ctx.restore();
  disc(ctx, x, y, r * 0.6, r * 0.6, mix(col, COL.white, 0.5), a * 0.8);
}

// ---------------------------------------------------------------- camera probes and projection
// Two far probe items read the frame's transform at two depths: from their scales the camera depth CZ, and from where the frame centre
// falls in each probe's plane the camera's true x, y (CC). A shot's lens shift (a whole-frame translate, e.g. act 2's pitch) moves the
// frame centre off the camera axis by a fixed number of pixels, i.e. by a different number of world units at each depth, so two probes
// separate the two. Without that, each water piece converged on the shifted centre: every piece was right only at its own depth, so a
// pitched frame squashed the pieces into slabs with the dark bed showing between them.
let CZ = null, CC = null;
const PZ = [90000, 120000], PS = [0, 0], PC = [[0, 0], [0, 0]];
const centreOf = m => { const sc = Math.hypot(m.a, m.b), th = Math.atan2(m.b, m.a), dx = W / 2 - m.e, dy = H / 2 - m.f, c = Math.cos(th), sn = Math.sin(th);
  return [(dx * c + dy * sn) / sc, (-dx * sn + dy * c) / sc]; };
const probes = () => PZ.map((z, i) => ({ z, draw(ctx) {
  const m = ctx.getTransform(); PS[i] = Math.hypot(m.a, m.b); PC[i] = centreOf(m);
  if (i === 0 && PS[0] > 0 && PS[1] > 0) { const f = (PZ[1] - PZ[0]) / (1 / PS[1] - 1 / PS[0]); CZ = PZ[0] - f / PS[0];
    const q = 1 / PS[1] - 1 / PS[0]; CC = Math.abs(q) > 1e-12 ? [0, 1].map(j => { const sh = (PC[0][j] - PC[1][j]) / q; return PC[0][j] + sh / PS[0]; }) : null; }
} }));
// pr(x, y, z) -> [X, Y] in the current item's local plane (drawn at depth zm); pr.k(z) = local length per world unit at depth z.
function projector(ctx, zm) {
  if (CZ === null) return null;
  const m = ctx.getTransform(), sc = Math.hypot(m.a, m.b), c0 = centreOf(m), dzm = zm - CZ;
  // the true camera axis (CC, from the probes) when the frame is shifted; otherwise the frame centre is on it
  const cx = CC ? CC[0] : c0[0], cy = CC ? CC[1] : c0[1];
  const pr = (x, y, z) => { const d = z - CZ; if (d < 4) return null; const k = dzm / d; return [cx + (x - cx) * k, cy + (y - cy) * k]; };
  pr.k = z => dzm / Math.max(z - CZ, 4);
  pr.s = sc;
  pr.cx = cx; pr.cy = cy;
  pr.screen = (X, Y) => [m.a * X + m.c * Y + m.e, m.b * X + m.d * Y + m.f];
  pr.off = (X, Y, pad) => { const q = pr.screen(X, Y); return q[0] < -pad || q[0] > W + pad || q[1] < -pad || q[1] > H + pad; };
  // how steeply the camera looks down on the ground at depth z (0 = grazing, 1 = straight down)
  pr.elev = (x, y, z) => { const a = pr(x, y, z), b = pr(x, y, z + 8); if (!a || !b) return 0.2; return clamp(Math.abs(b[1] - a[1]) / (8 * pr.k(z)), 0.06, 1); };
  return pr;
}

// ---------------------------------------------------------------- channel path
// Fallback polyline [x, z] from the spout to the channel end (CONTRACT.md); smoothed with Catmull-Rom, arc-length parametrised.
const FALLBACK = [[-900, 2600], [-700, 2380], [-340, 2200], [-20, 1900], [140, 1500], [-80, 1100], [-260, 780], [-100, 540], [30, 430]];
fx.CHANNEL_FALLBACK = FALLBACK;
const fb = (() => {
  const pts = FALLBACK, n = pts.length, S = [], cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < 40; j++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)], t = j / 40;
    S.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]);
  }
  S.push(pts[n - 1].slice());
  const A = [0]; for (let i = 1; i < S.length; i++) A.push(A[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
  return { S, A, L: A[A.length - 1] };
})();
const fbChan = u => {
  const a = clamp(u) * fb.L; let lo = 0, hi = fb.A.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fb.A[m] <= a) lo = m; else hi = m; }
  const k = (a - fb.A[lo]) / Math.max(fb.A[hi] - fb.A[lo], 1e-6), p = fb.S[lo], q = fb.S[hi];
  return [lerp(p[0], q[0], k), -34 * (1 - ss(0, 0.06, u)), lerp(p[1], q[1], k)];
};
// Sample table: positions, ground-plane direction (downstream) and normal, cumulative arc length.
let TAB = null;
function table() {
  const wo = P.world, ch = wo && typeof wo.chan === 'function' ? wo.chan : fbChan;
  if (TAB && TAB.src === ch) return TAB;
  const N = 260, X = [], Y = [], Z = [], A = [0];
  for (let i = 0; i <= N; i++) { const p = ch(i / N); X.push(p[0]); Y.push(p[1]); Z.push(p[2]); }
  for (let i = 1; i <= N; i++) A.push(A[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]));
  const DX = [], DZ = [];
  for (let i = 0; i <= N; i++) { const a = Math.max(i - 2, 0), b = Math.min(i + 2, N); let dx = X[b] - X[a], dz = Z[b] - Z[a]; const l = Math.hypot(dx, dz) || 1; DX.push(dx / l); DZ.push(dz / l); }
  const L = A[N];
  const idx = a => { let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] <= a) lo = m; else hi = m; } return lo; };
  const at = a => {
    a = clamp(a, 0, L); const i = idx(a), k = (a - A[i]) / Math.max(A[i + 1] - A[i], 1e-6);
    let dx = lerp(DX[i], DX[i + 1], k), dz = lerp(DZ[i], DZ[i + 1], k); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    return { x: lerp(X[i], X[i + 1], k), y: lerp(Y[i], Y[i + 1], k), z: lerp(Z[i], Z[i + 1], k), dx, dz, nx: -dz, nz: dx, u: (i + k) / N };
  };
  const arcOfU = u => { const f = clamp(u) * N, i = Math.min(Math.floor(f), N - 1); return lerp(A[i], A[i + 1], f - i); };
  TAB = { src: ch, L, at, arcOfU };
  return TAB;
}
fx.pathAt = a => table().at(a);                  // a in world units along the channel from the spout
fx.pathLength = () => table().L;
fx.chanU = u => { const T = table(); return T.at(T.arcOfU(u)); };

// Rim stones as [{ a (arc), e (half length), ht, side }], read from P.world.STONES (the cobbles world.js really draws), so ripples and
// lapping foam land where the stones stand. If world.js is not loaded, an approximation of the same cobbles is used.
let RIM = null;
function rimStones() {
  const T = table(); if (RIM && RIM.T === T) return RIM.list;
  const wo = P.world, list = [];
  if (wo && Array.isArray(wo.STONES) && wo.STONES.length) {
    for (const s of wo.STONES) list.push({ a: T.arcOfU(num(s.u, 0)), e: num(s.e, 8), ht: num(s.ht, 8), side: num(s.side, 1) });
  } else for (const side of [-1, 1]) {
    let s = 6, i = 0;
    while (s < T.L - 14) { const k = i * 2 + (side > 0 ? 1 : 0), L = 12 + hash(k, 1) * 14, ht = 2.3 + hash(k, 3) * 2.6;
      list.push({ a: s + L / 2, e: L / 2, ht, side }); s += L + 0.4 + hash(k, 7) * 1.4; i++; }
  }
  list.sort((p, q) => p.a - q.a); RIM = { T, list }; return list;
}
// stones whose arc lies in [a0, a1]
const stonesIn = (a0, a1) => { const L = rimStones(), out = []; let lo = 0, hi = L.length; while (lo < hi) { const m = (lo + hi) >> 1; if (L[m].a < a0 - 14) lo = m + 1; else hi = m; }
  for (let i = lo; i < L.length && L[i].a <= a1 + 14; i++) out.push(L[i]); return out; };

// ---------------------------------------------------------------- fireflies (cam-relative slow loops; see fx.fireflies)
const FF_ZR = 1500;
function ffState(i, t, cam) {
  const h = k => hash(i, k + 400), zf = fract(h(1) + (-cam.z) / FF_ZR + 0.02 * Math.sin(t * 0.05 * (1 + h(2)) + h(3) * TAU)), z = cam.z + 120 + zf * FF_ZR, d = z - cam.z;
  const hx = d / cam.f * W / 2 * 1.05, hy = d / cam.f * H / 2 * 0.8, om = 0.16 + 0.12 * h(4), ph = h(5) * TAU;
  const loopX = Math.sin(t * om + ph) + 0.35 * Math.sin(t * om * 2.3 + h(6) * TAU), loopY = Math.sin(t * om * 1.45 + h(7) * TAU) * 0.6 + 0.25 * Math.sin(t * om * 3.1 + h(8) * TAU);
  const x0 = cam.x + (h(12) * 2 - 1) * hx * 0.78 + loopX * hx * 0.075, y0 = cam.y + (h(13) - 0.22) * hy * 0.8 + loopY * hy * 0.08;
  // one wind for the whole garden (P.wind leans them, P.gust lifts them on a gust): both are smooth in t, so a firefly never jumps
  const x = x0 + P.wind(x0, z, t) * hx * 0.035 * (0.5 + h(19)), y = y0 - P.gust(x0, z, t) * hy * 0.025 * (0.5 + h(20));
  const per = 2.4 + 2.2 * h(14), pp = fract(t / per + h(15)), on = pp < 0.62 ? Math.pow(Math.sin(Math.PI * pp / 0.62), 1.6) : 0;
  return { x, y, z, on, h, per };
}
let FFARGS = null;

// ---------------------------------------------------------------- lights
let LIGHTS = [];
fx.lights = function (st, flowers) {
  const out = [], hero = st.hero || {}, R = fx.ROOT, wo = P.world;
  const fl = clamp(num(hero.flicker, 1), 0, 1.7), climb = clamp(num(hero.climb, 0)), petal = clamp(num(hero.petal, 0)), open = clamp(num(hero.open, petal));
  const s1 = ss(0, 0.32, climb), s2 = ss(0.22, 0.7, climb);
  // The stem lights sit on the stem core (above the root, not at it) with tight radii, so the root stones, soil and stem warm strongly
  // while a friend sitting beside the root (Pip on the resting stone, ~50 units off) gets a warm rim and a moderate fill, not a flood
  // that bleaches his felt to flat yellow ("glow never flattens a face", CONTRACT.md).
  if (s1 > 0.01) out.push({ x: R.x, y: -34, z: R.z - 6, col: [1, 0.6, 0.22], i: 1.0 * s1 * fl, rad: 28, halo: 0, refl: 1 });
  if (s2 > 0.01) out.push({ x: R.x + 4, y: -86, z: R.z - 8, col: [1, 0.64, 0.26], i: 0.85 * s2 * fl, rad: 38, halo: 0, refl: 1 });
  const pet = Math.max(petal, ss(0.85, 1, climb) * 0.2);
  // the petal halo is small and amber: world.js already paints the flower's own bloom, this is only the core of it
  if (pet > 0.01) out.push({ x: R.x, y: -136 - 8 * open, z: R.z - 20, col: [1, 0.72, 0.36], i: 1.4 * pet * fl, rad: 62, halo: 38 * pet, refl: 1 });
  // garden flowers
  const F = flowers || (wo && wo.FLOWERS) || [], cand = [];
  if (typeof st.flower === 'function') for (let i = 0; i < F.length; i++) {
    const s = st.flower(i); if (!s) continue; const f = F[i], pt = clamp(num(s.petal, 0)), cl = clamp(num(s.climb, 0)), fk = clamp(num(s.flicker, 1), 0, 1.7);
    const I = (1.6 * pt + 0.7 * ss(0, 0.7, cl) * (1 - 0.35 * pt)) * fk; if (I < 0.04) continue;
    const h = num(f.h, 80), tint = Array.isArray(f.col) ? f.col.map(v => v / 255) : [1, 0.66, 0.3];
    cand.push({ x: f.x, y: -h * lerp(0.4, 0.82, pt), z: f.z - 10, col: mix([1, 0.64, 0.28], tint, 0.18), i: I, rad: 34 + 0.45 * h, halo: pt > 0.3 ? 10 + 0.14 * h : 0, refl: 1 });
  }
  cand.sort((a, b) => b.i - a.i); for (let i = 0; i < Math.min(cand.length, 8); i++) out.push(cand[i]);
  // water: broad amber pools spaced along the lit stretch (between the tail and the front), anchored on the path so they do not slide
  const w = num(st.water, -1), g = clamp(num(st.waterGlow, 1), 0, 1.4), tl = clamp(num(st.waterTail, 0), 0, 1.14);
  if (w > 0 && g > 0.01) {
    const T = table(), fa = T.arcOfU(Math.min(w, 1)), ta = T.arcOfU(Math.min(tl, 1)), SP = 140, adv = ss(0, 0.012, w) * (1 - ss(0.985, 1, w));
    let used = 0;
    for (let k = Math.floor(ta / SP); k * SP < fa && used < 21; k++) {
      const a = (k + 0.5) * SP; if (a < ta - SP * 0.4 || a > fa) continue;
      const on = ss(0, 50, fa - a) * ss(-SP * 0.4, 30, a - ta); if (on < 0.01) continue; const p = T.at(a);
      // a touch of negative blue cancels the dusk ambient blue near the water, so pale stones go amber instead of lilac
      out.push({ x: p.x, y: p.y - 9, z: p.z - 6, col: [1, 0.58, -0.16], i: 0.2 * g * on, rad: 140, halo: 0 }); used++;
    }
    if (adv > 0.01) { const p = T.at(fa); out.push({ x: p.x, y: p.y - 9, z: p.z - 8, col: [1, 0.7, 0.34], i: 0.8 * g * adv, rad: 70, halo: 0 }); }
  }
  // trapped pond glow behind the dam
  const pd = clamp(num(st.pond, 0), 0, 1.3);
  if (pd > 0.01) out.push({ x: -935, y: -62, z: 2800, col: [1, 0.58, 0.22], i: 0.5 * pd, rad: 230, halo: 0, refl: 1 });   // the soft pool on the dam is painted by world.js behind the stones, not as a screen veil over them
  // fireflies: weak green-yellow lights so they tint the grass around them
  if (FFARGS) {
    const { cam, n } = FFARGS, t = num(st.t, 0), c = [];
    for (let i = 0; i < n; i++) { const f = ffState(i, t, cam); if (f.on > 0.3) c.push(f); }
    c.sort((a, b) => b.on - a.on);
    for (let i = 0; i < Math.min(c.length, 3); i++) { const f = c[i]; out.push({ x: f.x, y: f.y, z: f.z - 4, col: [0.62, 0.9, 0.18], i: 0.34 * f.on, rad: 22 + 12 * f.h(16), halo: 0 }); }
    FFARGS = null;
  }
  LIGHTS = out;
  return out;
};
// the nearest warm light to a point (for backlighting): { L, f } with f = how strongly it reaches the point
function nearestWarm(x, y, z) {
  let best = null, bf = 0.05;
  for (const L of LIGHTS) { if (L.col[0] < 0.8 || L.col[2] > 0.5) continue; const d = Math.hypot(x - L.x, y - L.y, (z - L.z) * 0.6), f = L.i / (1 + (d / L.rad) ** 2); if (f > bf) { bf = f; best = L; } }
  return best ? { L: best, f: bf } : null;
}

// ---------------------------------------------------------------- water ribbon
// One routine draws a piece of any ribbon (the channel, the trickle). The ribbon is described by at(a): world sample at arc a
// with { x, y, z, dx, dz, nx, nz, hw } (hw = half width). Edges are sampled every ~3 units into one continuous smoothed outline;
// neighbouring pieces overlap by a few units and cross-fade their alpha, so no seam or kink shows where pieces meet.
fx.MOON = { x: 5696, y: -3809, z: 40000 };      // where world.js hangs the moon (used only for its reflection)
const FLOW0 = 62, FLOW = FLOW0;                   // world units per second, downstream (a ribbon may set o.flow)
const OV = 2.2;
const WARM_RAY = [255, 150, 56];
// The water palette ("water reads as water", CONTRACT.md): a blue-green body in a dark wet bed, cool glints and ripples on top, and the
// carried light only as small golden particles plus a gentle warm glow inside. Colours are what the water looks like under the nominal
// dusk; a darker night dims the body and the glints, and a strong warm light nearby (a lit flower) warms it a little.
const WATER = { bed: [8, 24, 30], deep: [12, 60, 72], body: [26, 110, 114], mid: [60, 164, 158], sky: [54, 86, 150],
  glint: [146, 206, 220], glintHi: [196, 236, 242], ripple: [136, 206, 214], foam: [214, 240, 236] };
fx.WATER = WATER;
const NOML = 0.3 * 0.30 + 0.59 * 0.38 + 0.11 * 0.65;
// The body glows a little on its own (it carries light), so it never sinks below EMIT of its dusk colour: under the night ambient a running
// stretch still reads teal, as the stream does in the rule shot. A warm light nearby tints it only slightly (it must stay blue-green, never
// slate or brown); the bed under it and the sky reflection still follow the ambient.
const EMIT = 0.92;
function waterPal(x, y, z, cool) {
  const m = P.light(x, y, z), a = P.light(1e7, 0, -1e7), ab = clamp((0.3 * a[0] + 0.59 * a[1] + 0.11 * a[2]) / NOML, 0.5, 1.25), gl = Math.sqrt(Math.max(ab, 0.75)), ae = Math.max(ab, EMIT);
  const we = cool ? 0 : clamp((m[0] - a[0]) * 0.6 - (m[2] - a[2]) * 0.3, 0, 1) * 0.1, warm = c => mix(c, [Math.min(255, c[0] * 1.6 + 30), c[1] * 1.08 + 8, c[2] * 0.8], we);
  const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  return { bed: sc(WATER.bed, ab), deep: warm(sc(WATER.deep, ae)), body: warm(sc(WATER.body, ae)), mid: warm(sc(WATER.mid, ae)), sky: sc(WATER.sky, ab),
    glint: sc(WATER.glint, gl), glintHi: sc(WATER.glintHi, gl), ripple: sc(WATER.ripple, gl), foam: sc(WATER.foam, gl) };
}

function drawRibbon(ctx, pr, o) {
  const { at, t, g } = o, lo = o.lo, hi = o.hi, FLOW = o.flow || FLOW0;
  const sA = Math.max(lo, o.a0 - OV), sB = Math.min(hi, o.a1 + OV); if (sB - sA < 0.3) return;
  const Mp = at((o.a0 + o.a1) / 2), hw0 = Mp.hw, wy = Mp.y - LIFT, Cc = pr(Mp.x, wy, Mp.z); if (!Cc) return;
  const kk = pr.k(Mp.z), s = pr.s, hpx = hw0 * kk * s, lenPx = (o.a1 - o.a0) * kk * s;
  if (pr.off(Cc[0], Cc[1], 220 + lenPx + hpx * 3)) return;
  const far = hpx < 4, mnw = 0.9 / s, minHalf = 1.6 / s, step = far ? 6 : 3, gg = clamp(g, 0, 1), det = o.det !== undefined ? o.det : ss(7, 30, hpx);   // det: how much fine detail (wakes, caps, bank slivers) survives at this distance
  const n = Math.max(2, Math.ceil((sB - sA) / step) + 1), M = [], V = [];
  for (let i = 0; i < n; i++) {
    const p = at(lerp(sA, sB, i / (n - 1))), a = pr(p.x + p.nx * p.hw, p.y - LIFT, p.z + p.nz * p.hw), b = pr(p.x - p.nx * p.hw, p.y - LIFT, p.z - p.nz * p.hw);
    if (!a || !b) return; M.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); V.push([(a[0] - b[0]) / 2, (a[1] - b[1]) / 2]);
  }
  // a minimum on-screen width of ~3 px, measured across the ribbon, so far reaches stay a visible stream
  for (let i = 0; i < n; i++) {
    const a = M[Math.max(i - 1, 0)], b = M[Math.min(i + 1, n - 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty); if (l < 1e-6) continue;
    tx /= l; ty /= l; const nx = -ty, ny = tx, pj = V[i][0] * nx + V[i][1] * ny;
    if (Math.abs(pj) < minHalf) { const k = sgn(pj) * (minHalf - Math.abs(pj)); V[i][0] += nx * k; V[i][1] += ny * k; }
  }
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n - 1; i++) { V[i] = [(V[i - 1][0] + 2 * V[i][0] + V[i + 1][0]) / 4, (V[i - 1][1] + 2 * V[i][1] + V[i + 1][1]) / 4]; }
  const poly = (f, dy = 0) => { ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = M[i][0] + V[i][0] * f, y = M[i][1] + V[i][1] * f + dy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(M[i][0] - V[i][0] * f, M[i][1] - V[i][1] * f + dy); ctx.closePath(); };
  // overlap cross-fade: a gradient along the piece chord whose alpha ramps in over the overlap and out over the next
  const first = o.a0 - OV <= lo + 1e-6, last = o.a1 + OV >= hi - 1e-6, fadeA = first ? (o.tailFade ?? 14) : 2 * OV, fadeB = last ? 0 : 2 * OV;
  // the gradient axis is perpendicular to the cross-section (the ribbon's width direction on screen), so the fade lines run
  // exactly along the cross-sections even at grazing angles where the chord is diagonal
  const mi = n >> 1; let gx = -V[mi][1], gy = V[mi][0]; { const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl; }
  if ((M[n - 1][0] - M[0][0]) * gx + (M[n - 1][1] - M[0][1]) * gy < 0) { gx = -gx; gy = -gy; }
  const g0 = M[0][0] * gx + M[0][1] * gy, glen = (M[n - 1][0] * gx + M[n - 1][1] * gy) - g0;
  const posAt = arc => { const f = clamp((arc - sA) / (sB - sA)) * (n - 1), i = Math.min(n - 2, Math.floor(f)), k = f - i;
    return clamp(((lerp(M[i][0], M[i + 1][0], k) * gx + lerp(M[i][1], M[i + 1][1], k) * gy) - g0) / glen); };
  const useRamp = glen > 3;
  let rA = 0, rB = 1; if (useRamp) { rA = posAt(sA + fadeA); rB = last ? 1 : posAt(sB - fadeB); if (rA > rB) { const m = (rA + rB) / 2; rA = Math.min(m, rA); rB = Math.max(m, rB); } }
  // solid: the opaque base of the body (bed, deep, body). Their stack covers about 99%, so drawing it at full strength through the overlap
  // is invisible, while ramping it (each piece half there) let the dark trench show through as a bar at every joint between pieces
  const rfill = (col, a, solid) => { if (!useRamp || (solid && !first)) return rgba(col, a);
    const gr = ctx.createLinearGradient(M[0][0], M[0][1], M[0][0] + gx * glen, M[0][1] + gy * glen);
    gr.addColorStop(0, rgba(col, fadeA > 0 ? 0 : a)); gr.addColorStop(Math.min(rA, 0.98), rgba(col, a)); gr.addColorStop(Math.max(rB, Math.min(rA, 0.98) + 0.001), rgba(col, a)); gr.addColorStop(1, rgba(col, last ? a : 0)); return gr; };
  const ac = (o.a0 + o.a1) / 2, ld = o.lead ? o.lead(ac) : 0, elev = pr.elev(Mp.x, wy, Mp.z);
  const pal = o.palAt ? waterPal(o.palAt[0], o.palAt[1], o.palAt[2], o.cool) : waterPal(Mp.x, wy, Mp.z, o.cool);
  const band = (f0, f1) => { ctx.beginPath(); for (const sd of [1, -1]) { for (let i = 0; i < n; i++) { const x = M[i][0] + sd * V[i][0] * f1, y = M[i][1] + sd * V[i][1] * f1; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(M[i][0] + sd * V[i][0] * f0, M[i][1] + sd * V[i][1] * f0); ctx.closePath(); } };
  // world point at arc a, v across (-1 bank .. 1 bank), lifted a little above the surface
  const W3 = (arc, v, lift = 0.3) => { const p = at(arc); return pr(p.x + p.nx * v * p.hw, p.y - LIFT - lift, p.z + p.nz * v * p.hw); };
  const inRun = c => c >= o.a0 && c < o.a1 && c <= hi - 0.5 && c >= lo + 1;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // o.clip(ctx) clips everything that lies on the water (a channel in its trench); spray and glow above it are drawn unclipped
  const clipped = !!o.clip; if (clipped) { ctx.save(); o.clip(ctx); }

  // 1. a gentle warm glow on the ground beside the water (the light it carries spills a little onto the banks; never a band)
  if (gg > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    const GS = far ? 14 : 9, R = 3.0 * hw0;
    for (let k = Math.ceil(o.a0 / GS); k * GS < o.a1; k++) { const p = at(k * GS), c = pr(p.x, p.y - 0.4, p.z); if (!c) continue;
      disc(ctx, c[0], c[1], Math.max(R * kk, 16 / s), Math.max(R * kk * elev * 1.1, 5.5 / s), WARM_RAY, 0.04 * gg * (1 + 0.8 * ld)); }
    ctx.globalCompositeOperation = 'source-over';
  }
  // 2. bed pebbles, drawn under the water so the water tints them; only a small wet cap breaks the surface later
  const peb = [];
  if (o.bed && det > 0.05) {
    const SP = 70;
    for (let p = Math.floor((o.a0 - 60) / SP); p <= Math.ceil(o.a1 / SP); p++) {
      const a = 30 + p * SP + 28 * hash(p, 5); if (a < o.a0 || a >= o.a1 || a > hi - 6 || a < lo + 2) continue;
      const q = at(a), v = (hash(p, 6) * 2 - 1) * 0.55, r = 1.5 + 1.7 * hash(p, 7), wx = q.x + q.nx * v * q.hw, wz = q.z + q.nz * v * q.hw;
      const bc = pr(wx, q.y - 0.5, wz); if (!bc) continue; peb.push({ q, p, v, r, wx, wz, bc });
    }
    for (const b of peb) {
      const rr = b.r * kk, col = mix(lit3([70, 84, 96], b.wx, b.q.y - b.r, b.wz, 0.03), [20, 40, 44], 0.3);
      disc(ctx, b.bc[0] + rr * 0.3, b.bc[1] + rr * 0.35, rr * 1.9, rr * 1.0, [4, 8, 14], 0.4);
      ctx.fillStyle = rgba(col, 1); ctx.beginPath(); ctx.ellipse(b.bc[0], b.bc[1] - rr * 0.55, rr * 1.12, rr * 0.9, 0, 0, TAU); ctx.fill();
    }
  }
  // 3. the body: a blue-green body of water over a dark wet bed, deepest (darkest) under the banks, a little clearer in the middle
  if (o.wet) { poly(o.wet); ctx.fillStyle = rfill([6, 12, 16], 0.22); ctx.fill(); poly((1 + o.wet) / 2); ctx.fillStyle = rfill([6, 12, 16], 0.22); ctx.fill(); }   // soaked ground either side
  if (o.sheet) {   // a thin sheet seen face-on: an even body (a lighter middle stripe would model it into a tube)
    poly(1); ctx.fillStyle = rfill(pal.bed, 0.5); ctx.fill();
    poly(0.92); ctx.fillStyle = rfill(pal.deep, 0.62); ctx.fill();
    poly(0.8); ctx.fillStyle = rfill(pal.body, 0.72); ctx.fill();
    poly(0.55); ctx.fillStyle = rfill(mix(pal.body, pal.mid, 0.5), 0.3); ctx.fill();
  } else {   // a teal body wall to wall (darker only in a thin band at the banks), clearer down the middle
  poly(1); ctx.fillStyle = rfill(pal.bed, 0.7, true); ctx.fill();
  poly(0.94); ctx.fillStyle = rfill(pal.deep, 0.8, true); ctx.fill();
  poly(0.8); ctx.fillStyle = rfill(pal.body, 0.82, true); ctx.fill();
  poly(0.45); ctx.fillStyle = rfill(pal.mid, 0.42 * (1 - 0.3 * far)); ctx.fill();
  }
  if (!o.soft) { band(0.86, 1); ctx.fillStyle = rfill([2, 10, 16], 0.24); ctx.fill(); }
  // 4. Fresnel: at grazing angles the surface mirrors the cool dusk sky, most at the banks
  const fres = Math.pow(clamp(1 - elev / 0.6), 1.2);
  if (fres > 0.03) { poly(1); ctx.fillStyle = rfill(pal.sky, 0.16 * fres); ctx.fill();
    band(0.7, 1); ctx.fillStyle = rfill(mix(pal.sky, COL.coolMid, 0.5), 0.2 * fres); ctx.fill(); }
  // 5. the light the water carries: a gentle warm glow inside the body (additive, low: the water stays blue-green)
  ctx.globalCompositeOperation = 'lighter';
  if (gg > 0.02) { poly(0.7); ctx.fillStyle = rfill(WARM_RAY, 0.045 * gg * (1 + 1.2 * ld)); ctx.fill(); poly(0.32); ctx.fillStyle = rfill(COL.amber, 0.05 * gg * (1 + 1.2 * ld)); ctx.fill(); }

  // 6. reflections: the moon and the warm lights, stretched vertically and broken up by ripples
  if (o.refl !== false && (!far || hpx > 1.5)) {
    const srcs = [], MN = (P.world && P.world.MOON) || fx.MOON; srcs.push({ x: MN.x, y: MN.y, z: MN.z, col: [200, 222, 255], a: 0.5, wp: 7 });
    for (const L of LIGHTS) if (L.refl && L.i > 0.25) srcs.push({ x: L.x, y: L.y, z: L.z, col: mix([255, 200, 120], [L.col[0] * 255, L.col[1] * 255, 140], 0.4), a: Math.min(0.5, 0.25 * L.i), wp: 3.2 });
    let ymn = 1e9, ymx = -1e9, xmn = 1e9, xmx = -1e9; for (let i = 0; i < n; i++) for (const sd of [-1, 1]) { const x = M[i][0] + sd * V[i][0], y = M[i][1] + sd * V[i][1]; ymn = Math.min(ymn, y); ymx = Math.max(ymx, y); xmn = Math.min(xmn, x); xmx = Math.max(xmx, x); }
    let clipped = false;
    for (let si = 0; si < srcs.length; si++) {
      const sr = srcs[si], foot = pr(sr.x, wy, sr.z), mir = pr(sr.x, 2 * wy - sr.y, sr.z); if (!foot || !mir) continue;
      const pad = 40 / s; if (foot[0] < xmn - pad || foot[0] > xmx + pad) continue;
      const yt = Math.min(foot[1], mir[1]), yb = Math.max(foot[1], mir[1]); if (yb < ymn - 4 || yt > ymx + 4) continue;
      if (!clipped) { ctx.save(); poly(0.97); ctx.clip(); clipped = true; }
      for (let j = 0; j < 7; j++) {
        const h1 = hash(si * 31 + j, 120), h2 = hash(si * 31 + j, 121), h3 = hash(si * 31 + j, 122), sw = Math.sin(t * (0.9 + h2) + h3 * TAU);
        const x = foot[0] + (h1 - 0.5) * sr.wp * 2.4 / s + sw * 1.4 / s, len = (10 + 36 * h2) / s, y0 = lerp(yt, yb, h3) - len * 0.5, al = sr.a * (0.35 + 0.65 * fres) * (0.5 + 0.5 * sw * sw) * (0.7 + 0.3 * h1);
        disc(ctx, x, y0 + len * 0.5, sr.wp * (0.5 + 0.7 * h1) / s, len * 0.5, sr.col, al * 1.1);
      }
    }
    if (clipped) ctx.restore();
  }

  // 7. flow: tapered cool highlights (thin tail upstream, blunt head downstream) and small ripple crescents, all sliding downstream;
  //    golden particles (the carried light) drift inside the body, slower near the banks
  const streak = (c, v, len, wid, al, col, lift = 0.4) => {
    if (al < 0.02) return; const NP = 6, wpx = Math.max(wid, 0.5 / (kk * s)), Lf = [], Rt = [];
    for (let j = 0; j <= NP; j++) {
      const u = j / NP, arc = c + (u - 0.62) * len, prof = Math.pow(Math.sin(Math.PI * Math.pow(u, 1.5)), 0.85), p = at(arc), vv = v + 0.12 * Math.sin(arc * 0.13 + c), w = wpx * prof;
      const a = pr(p.x + p.nx * (vv * p.hw + w), p.y - LIFT - lift, p.z + p.nz * (vv * p.hw + w)), b = pr(p.x + p.nx * (vv * p.hw - w), p.y - LIFT - lift, p.z + p.nz * (vv * p.hw - w)); if (!a || !b) return;
      Lf.push(a); Rt.push(b);
    }
    ctx.beginPath(); Lf.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); for (let i = NP; i >= 0; i--) ctx.lineTo(Rt[i][0], Rt[i][1]); ctx.closePath(); ctx.fillStyle = rgba(col, al); ctx.fill();
  };
  // a ripple crescent across the flow at arc c, centred at v, bowed downstream (so the flow direction reads in a still frame)
  const crescent = (c, v, wv, bow, al, col, lw) => {
    if (al < 0.02) return; const pts = []; for (let j = 0; j <= 8; j++) { const f = j / 8 * 2 - 1, q = W3(c + bow * (1 - f * f), v + f * wv, 0.35); if (!q) return; pts.push(q); }
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.strokeStyle = rgba(col, al); ctx.lineWidth = Math.max(lw * kk, mnw * 0.9); ctx.stroke();
  };
  // broad soft bands of lighter water sliding downstream across the whole width: the flow reads at a glance, even at phone size
  const bands = () => { const BS = 30, sp = FLOW * 0.9, col = mix(pal.mid, pal.glint, 0.45);
    for (let k = Math.ceil((o.a0 - t * sp) / BS) - 1; k * BS + t * sp < o.a1 + BS; k++) { const c = k * BS + t * sp + 6 * hash(k, 180); if (!inRun(c)) continue;
      const life = 0.6 + 0.4 * Math.sin(t * 1.1 + hash(k, 181) * TAU), v = (hash(k, 182) - 0.5) * 0.3, wv = 0.6 + 0.3 * hash(k, 185), bw = 2.2 + 1.6 * hash(k, 183), lw = 2.4 + 2.2 * hash(k, 184), al = 0.075 * life * (0.5 + 0.5 * det);
      for (const [f, a] of [[1, 0.5], [0.62, 0.7], [0.3, 0.9]]) crescent(c, v, wv, bw, al * a, col, lw * f); } };   // soft-edged: three nested strokes, never a hard stripe
  const goldDot = (q, r, al) => { disc(ctx, q[0], q[1], r * 3.2, r * 3.2 * Math.max(elev, 0.45), COL.gold, al * 0.35); disc(ctx, q[0], q[1], r * 1.1, r * 1.1, COL.hot, al); };
  if (far) {   // far: a few cool glints along the stream and a string of golden sparks riding in it
    for (let k = Math.ceil((o.a0 - t * FLOW) / 30); k * 30 + t * FLOW < o.a1; k++) { const c = k * 30 + t * FLOW; if (!inRun(c) || hash(k, 3) < 0.4) continue; streak(c, (hash(k, 4) - 0.5) * 0.7, 14, 0.5, 0.42, pal.glint); }
    if (gg > 0.02) { const CS = 9, sp = FLOW * 0.9;
      for (let k = Math.ceil((o.a0 - t * sp) / CS); k * CS + t * sp < o.a1; k++) { const c = k * CS + t * sp; if (!inRun(c) || hash(k, 140) < 0.35) continue;
        const q = W3(c, (hash(k, 141) * 2 - 1) * 0.5, 0.5); if (!q) continue; const tw = 0.55 + 0.45 * Math.sin(t * (2 + 3 * hash(k, 142)) + hash(k, 143) * TAU);
        goldDot(q, Math.max(0.6 * kk, 1.0 / s), 0.75 * gg * tw * (1 + 0.6 * ld)); } }
  } else {
    if (!o.sheet) bands();
    const FAM = [{ d: 13, sp: 1, l0: 5, l1: 11, w: 0.28 }, { d: 21, sp: 0.8, l0: 8, l1: 15, w: 0.36 }, { d: 31, sp: 1.25, l0: 10, l1: 20, w: 0.3 }];
    for (let j = 0; j < 3; j++) {
      const F = FAM[j], sp = FLOW * F.sp, k0 = Math.ceil((o.a0 - t * sp) / F.d), k1 = Math.ceil((o.a1 - t * sp) / F.d) - 1;
      for (let k = k0; k <= k1; k++) {
        const c = k * F.d + t * sp, h1 = hash(k, j * 7 + 1), h2 = hash(k, j * 7 + 2), h3 = hash(k, j * 7 + 3);
        if (h1 < 0.3 || !inRun(c)) continue;
        const al = (0.22 + 0.4 * h1) * (0.7 + 0.3 * Math.sin(t * 1.7 + h3 * TAU));
        streak(c, (h3 * 2 - 1) * 0.74, lerp(F.l0, F.l1, h2), F.w * (0.6 + 0.8 * h2), al * 0.8, j === 1 ? pal.glintHi : pal.glint);
      }
    }
    // ripple crescents: rows of small bowed arcs moving with the flow, a little staggered across the stream
    if (det > 0.04) { const RS = 7.5, sp = FLOW * 0.85;
      for (let k = Math.ceil((o.a0 - t * sp) / RS) - 1; k * RS + t * sp < o.a1 + RS; k++) { const c = k * RS + t * sp + 2 * hash(k, 150); if (!inRun(c)) continue;
        const v = (hash(k, 151) * 2 - 1) * 0.55, wv = 0.16 + 0.16 * hash(k, 152), life = Math.sin(Math.PI * fract(t * 0.6 + hash(k, 153)));
        crescent(c, v, wv, 1.0 + 1.2 * hash(k, 154), (0.16 + 0.26 * hash(k, 155)) * life * (0.4 + 0.6 * det), pal.ripple, 0.2 + 0.12 * hash(k, 156)); } }
    // golden particles: the carried light as small warm grains inside the body (the only warm highlights on the water)
    if (gg > 0.02) { const CS = 2.6;
      for (let k = Math.floor((o.a0 - t * FLOW) / CS) - 2; k * CS + t * FLOW < o.a1 + 4; k++) {
        const h1 = hash(k, 160), h2 = hash(k, 161), h3 = hash(k, 162); if (h1 < 0.3) continue;
        const v = (h2 * 2 - 1) * 0.72, spd = FLOW * (0.95 - 0.35 * v * v), c = k * CS * (spd / FLOW) + t * spd + 1.6 * Math.sin(t * 0.9 + h3 * TAU); if (!inRun(c)) continue;
        const q = W3(c, v + 0.06 * Math.sin(t * 1.3 + h1 * 9), 0.45 + 0.25 * h3); if (!q) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * (1.6 + 2.8 * hash(k, 163)) + hash(k, 164) * TAU), r = Math.max((0.3 + 0.35 * h3) * kk * (o.spark || 1), 0.7 / s);
        goldDot(q, r, (0.55 + 0.4 * h3) * gg * tw * (0.8 + 0.6 * ld));
      }
    }
  }
  // 8. bank slivers: broken cool specular slivers where the flow meets the rim stones (detail: fades out with distance)
  const stn = o.bed && o.stones !== false && det > 0.05 ? stonesIn(o.a0, o.a1) : [];
  if (det > 0.08) for (const sd of [-1, 1]) {
    const CS = 2.6, k0 = Math.floor(o.a0 / CS), k1 = Math.ceil(o.a1 / CS);
    for (let k = k0; k <= k1; k++) {
      const c = (k + hash(k, 50 + sd)) * CS; if (!inRun(c)) continue;
      let near = 0; for (const S of stn) if (S.side === sd) near = Math.max(near, Math.exp(-(((c - (S.a - S.e)) / 5) ** 2)));   // the upstream corner of each stone
      const n1 = 0.5 + 0.5 * P.noise(c * 0.11 + sd * 17, 6), th = (o.sheet ? 0.86 : 0.66) - 0.45 * near - 0.2 * n1; if (hash(k, 52 + sd) < th) continue;
      streak(c, sd * (0.9 + 0.05 * hash(k, 53)), 1.6 + 3.4 * hash(k, 54) + 3 * near, 0.15 + 0.06 * hash(k, 55), (0.18 + 0.36 * near + 0.14 * n1) * det, pal.glintHi, 0.55);
    }
  }
  // soft ripples around a wet cap or a stone's foot: feathered rings flattened onto the water, never thin outlines
  const ripple = (wx, wz, y, rad, a) => { if (a < 0.015) return; const c = pr(wx, y, wz); if (c) ringGlow(ctx, c[0], c[1], rad * kk, Math.max(rad * kk * elev, 0.8 / s), pal.ripple, a, 0.5); };
  if (det > 0.12) for (const b of peb) {
    const q = b.q, y = q.y - LIFT, dv = det, sc = pr(b.wx, y, b.wz); if (!sc || b.r < 1.9) continue;
    const ph = fract(t * 0.4 + hash(b.p, 8)); ripple(b.wx + q.dx * b.r * (0.8 + 3 * ph), b.wz + q.dz * b.r * (0.8 + 3 * ph), y, b.r * (1.7 + 3.6 * ph), (1 - ph) * 0.3 * dv);
    ripple(b.wx - q.dx * b.r * 0.9, b.wz - q.dz * b.r * 0.9, y, b.r * 1.4, 0.22 * dv);   // the bow wave piling up against the upstream side
    const cap = Math.min(b.r * 0.8, b.r * 1.6 - LIFT + 0.4); if (cap > 0.45) {   // only a small wet cap breaks the surface: dark stone, bright wet rim on top
      ctx.globalCompositeOperation = 'source-over';
      const cc = lit3([70, 78, 92], b.wx, y - cap, b.wz, 0.03), cw = cap * kk, cx2 = b.r * 0.74 * kk;
      ctx.fillStyle = rgba(cc, 0.96); ctx.beginPath(); ctx.ellipse(sc[0], sc[1], cx2, cw, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(pal.glintHi, 0.45 * det); ctx.lineWidth = Math.max(0.2 * kk, mnw); ctx.beginPath(); ctx.ellipse(sc[0], sc[1], cx2, cw, 0, Math.PI * 1.12, Math.PI * 1.7); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
  }
  if (det > 0.12) for (const S of stn) {   // where the water laps a stone's foot: a short bright sliver and a soft ripple
    if (S.a < o.a0 - 4 || S.a > o.a1 + 4) continue;
    const q = at(S.a), sd = S.side, wx = q.x + q.nx * sd * q.hw * 0.9, wz = q.z + q.nz * sd * q.hw * 0.9, y = q.y - LIFT, dv = det;
    streak(S.a - S.e * 0.3, sd * 0.96, S.e * 1.5, 0.3, 0.36 * dv, pal.glintHi, 0.6);
    ripple(wx - q.dx * S.e * 0.5, wz - q.dz * S.e * 0.5, y, 3.4 + 0.15 * S.e, 0.2 * dv);
  }
  ctx.globalCompositeOperation = 'source-over';
  // 8b. white water (o.churn: arc -> 0..1): foam patches, broken white streaks and a ragged front where the water is fresh and forceful
  if (o.churn) churnDraw(ctx, pr, { at, t, lo, hi, c: o.churn, front: o.churnFront, flow: o.flow, y: p => p.y - LIFT }, o.a0, o.a1);

  if (clipped) ctx.restore();
  // 9. the leading edge: a rounded, bulging tongue of water (darker teal) with a bright foam rim, a dark wet line soaking into the dry bed
  //    just ahead of it, a few ripple arcs piled up behind it, cool droplets hopping off it, and the carried light gathered inside the head
  if (o.nose && last && o.nose > 0.01) {
    const aF = hi, bulge = hw0 * 0.9, F = at(aF), pts = [], nz = o.nose;
    for (let i = 0; i <= 14; i++) { const th = Math.PI * (1 - i / 14), v = Math.cos(th), p = at(aF + bulge * Math.pow(Math.sin(th), 0.85)), q = pr(p.x + p.nx * v * p.hw, p.y - LIFT, p.z + p.nz * v * p.hw); if (q) pts.push(q); }
    const wet = []; for (let i = 0; i <= 14; i++) { const th = Math.PI * (1 - i / 14), v = Math.cos(th) * 1.02, p = at(aF + bulge * 1.5 * Math.pow(Math.sin(th), 0.85)), q = pr(p.x + p.nx * v * p.hw, p.y - 0.2, p.z + p.nz * v * p.hw); if (q) wet.push(q); }
    const fc = pr(F.x - F.dx * bulge * 0.2, F.y - LIFT - 0.4, F.z - F.dz * bulge * 0.2);
    if (pts.length > 8 && fc) {
      const path = (arr) => { ctx.beginPath(); arr.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); };
      if (clipped) { ctx.save(); o.clip(ctx); }
      if (wet.length > 8) { path(wet); ctx.fillStyle = rgba([6, 14, 20], 0.45 * nz); ctx.fill(); }   // the wet line soaking ahead of the water
      ctx.save(); path(pts); ctx.fillStyle = rgba(pal.body, 0.92 * nz); ctx.fill(); ctx.clip();   // the head: brighter than the body behind it, a lit bulging lip
      const R = hw0 * 1.3 * kk, gr = ctx.createRadialGradient(fc[0], fc[1], 0, fc[0], fc[1], Math.max(R, 4 / s));
      gr.addColorStop(0, rgba(mix(pal.mid, pal.glint, 0.35), 0.9 * nz)); gr.addColorStop(0.6, rgba(pal.mid, 0.6 * nz)); gr.addColorStop(1, rgba(pal.body, 0.3 * nz)); ctx.fillStyle = gr; ctx.fill();
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < 3; r++) crescent(aF - 2.2 - r * 2.6, 0, 0.75 - 0.12 * r, 1.4, (0.5 - 0.13 * r) * nz, pal.ripple, 0.3);   // the bore: ripples piled up behind the front
      ctx.lineWidth = Math.max(1.1 * kk, mnw * 1.5); ctx.strokeStyle = rgba(pal.foam, 0.24 * nz); ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
      ctx.lineWidth = Math.max(0.4 * kk, mnw * 1.1); ctx.strokeStyle = rgba(pal.foam, 0.6 * nz); ctx.stroke();
      for (let i = 1; i < pts.length - 1; i += 2) { const q = pts[i], fr = 0.4 + 0.3 * hash(i, 97); disc(ctx, q[0], q[1], fr * kk * 1.6, fr * kk * 1.1, pal.foam, 0.35 * nz * (0.5 + 0.5 * Math.sin(t * 7 + i))); }   // foam beads on the rim
      if (clipped) { ctx.restore(); ctx.restore(); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; }   // drop the opening clip for the glow and spray
      if (gg > 0.02) { disc(ctx, fc[0], fc[1], 18 * kk, 13 * kk * Math.max(elev, 0.5), COL.gold, 0.22 * nz * gg); disc(ctx, fc[0], fc[1], 6 * kk, 4.5 * kk, COL.hot, 0.32 * nz * gg); }
      for (let d = 0; d < 7; d++) {   // droplets hopping off the nose, drawn as small streaks along their flight
        const ph = fract(t * (1 + 0.4 * hash(d, 90)) + hash(d, 91)), arcD = aF + bulge * (0.3 + 1.6 * ph), v = (hash(d, 92) * 2 - 1) * 0.7, hp = Math.sin(ph * Math.PI) * 4.2 * (0.4 + hash(d, 93)), hp0 = Math.sin(Math.max(ph - 0.07, 0) * Math.PI) * 4.2 * (0.4 + hash(d, 93));
        const p = at(arcD), p0 = at(arcD - bulge * 0.11), q = pr(p.x + p.nx * v * p.hw, p.y - LIFT - 0.4 - hp, p.z + p.nz * v * p.hw), q0 = pr(p0.x + p0.nx * v * p0.hw, p0.y - LIFT - 0.4 - hp0, p0.z + p0.nz * v * p0.hw); if (!q || !q0) continue;
        const al = 0.8 * (1 - ph) * nz, r = Math.max((0.22 + 0.2 * hash(d, 94)) * kk, 0.7 / s), dc = hash(d, 95) < 0.3 && gg > 0.02 ? COL.gold : pal.foam;
        ctx.strokeStyle = rgba(dc, al * 0.45); ctx.lineWidth = r * 1.7; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        ctx.fillStyle = rgba(dc, al); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

function glowOver(ctx, pr, o, a0, a1) {
  const { at, g, t } = o, gg = clamp(g, 0, 1), GS = 12;
  const gY = p => p.g ?? p.y;   // the channel's at() lowers y to the water in the trench; these glows sit on the ground and over the rims
  const pm = at((a0 + a1) / 2), cc = pr(pm.x, gY(pm) - 8, pm.z); if (!cc) return;
  const kk = pr.k(pm.z), s = pr.s, hpx = pm.hw * kk * s; if (pr.off(cc[0], cc[1], 160 + (a1 - a0) * kk * s + hpx * 3)) return;
  const elev = pr.elev(pm.x, gY(pm) - 8, pm.z), ld = o.lead ? o.lead((a0 + a1) / 2) : 0, pal = waterPal(pm.x, pm.y, pm.z, o.cool);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (gg > 0.02 && !o.farOnly) for (let k = Math.ceil(Math.max(a0, o.lo) / GS); k * GS < Math.min(a1, o.hi); k++) {   // the warm light spilling over the rim stones: faint and broad
    const p = at(k * GS), c = pr(p.x, gY(p) - 8, p.z); if (!c) continue;
    const on = ss(0, 20, o.hi - k * GS) * ss(0, 12, k * GS - o.lo);
    disc(ctx, c[0], c[1], Math.max(26 * kk, 10 / s), Math.max(26 * kk * (0.35 + elev) * 0.6, 4.5 / s), WARM_RAY, 0.05 * gg * (1 + 0.9 * ld) * on);
  }
  // From a far or low camera the cobbles hide the water itself, so a thin line of the stream is drawn over the near bank: a cool
  // blue-green thread (the water) with golden sparks riding in it (the light). It fades as the real ribbon gets big enough to read alone.
  const far = Math.max(1 - ss(26, 120, hpx), 1 - ss(0.1, 0.4, elev)), line = o.farOnly ? (1 - ss(3, 10, hpx)) : 0.25 + 0.75 * far;
  if (line > 0.02) {
    const R0 = Math.max(pm.hw * 1.3 * kk, 5 / s), ry = Math.max(R0 * clamp(elev, 0.12, 1) * 0.9, 2.2 / s);
    for (let a = Math.max(a0, o.lo); a <= Math.min(a1, o.hi) + 1e-6; a += 4) { const p = at(a), c = pr(p.x, gY(p) - 2, p.z); if (!c) continue; const f = ss(0, 16, o.hi - a) * ss(0, 12, a - o.lo) * line;
      disc(ctx, c[0], c[1], R0, ry, pal.mid, 0.07 * f); disc(ctx, c[0], c[1], R0 * 0.45, ry * 0.5, pal.glint, 0.06 * f); if (gg > 0.02) disc(ctx, c[0], c[1], R0 * 0.6, ry * 0.6, WARM_RAY, 0.03 * f * gg); }
    if (gg > 0.02) { const CS = 7, sp = FLOW * 0.9;
      for (let k = Math.ceil((Math.max(a0, o.lo) - t * sp) / CS); k * CS + t * sp < Math.min(a1, o.hi); k++) { const c0 = k * CS + t * sp; if (hash(k, 170) < 0.4) continue;
        const p = at(c0), v = (hash(k, 171) * 2 - 1) * 0.4, c = pr(p.x + p.nx * v * p.hw, gY(p) - 2.5, p.z + p.nz * v * p.hw); if (!c) continue;
        const f = ss(0, 10, o.hi - c0) * ss(0, 8, c0 - o.lo) * line, tw = 0.55 + 0.45 * Math.sin(t * (2 + 3 * hash(k, 172)) + hash(k, 173) * TAU), r = Math.max(0.7 * kk, 1.1 / s);
        disc(ctx, c[0], c[1], r * 3, r * 3, COL.gold, 0.25 * f * gg * tw); disc(ctx, c[0], c[1], r, r, COL.hot, 0.8 * f * gg * tw); } }
  }
  if (o.nose > 0.01 && a1 >= o.hi - 0.01 && gg > 0.02 && !o.farOnly) { const F = at(o.hi), fc = pr(F.x, gY(F) - 6, F.z); if (fc) { disc(ctx, fc[0], fc[1], 34 * kk, 22 * kk, COL.amber, 0.1 * o.nose * gg); disc(ctx, fc[0], fc[1], 12 * kk, 8 * kk, COL.hot, 0.1 * o.nose * gg); } }   // the front's glow, over the stones
  ctx.restore();
}

// Bank shimmer: lit water throws small warm glints onto the rim stones beside it, the way light off a stream dances on the stones it runs past.
// The glints belong to the stones (P.world.STONES via rimStones): each stone carries a couple on its water-facing face, each wandering along it
// with the flow and twinkling on its own cycle, so the banks read as moving water light, never as a fixed pattern. They scale with the screen:
// a stone shows its glints only once it is big enough on screen to carry one (about 14 px across, full at 40), so in a wide they fade to nothing
// instead of summing into a glowing band, and they are kept small, sparse and below the brightness of the water's own leading edge (which stays
// the clearest thing on the stream). They stay back from the front and the tail; O.g scales them, so an unlit channel has none.
function bankShimmer(ctx, pr, O, a0, a1) {
  const gg = clamp(O.g, 0, 1); if (gg < 0.02) return;
  const { at, t, lo, hi } = O, Pm = at((a0 + a1) / 2), cc = pr(Pm.x, Pm.g, Pm.z); if (!cc) return;
  const kk = pr.k(Pm.z), s = pr.s; if (ss(10, 30, 16 * kk * s) < 0.02) return;   // even the biggest stones here are too small to carry a glint
  if (pr.off(cc[0], cc[1], 60 + (a1 - a0) * kk * s)) return;
  const lim0 = Math.max(a0, lo + 10), lim1 = Math.min(a1, hi - 34); if (lim1 <= lim0) return;
  const sp = FLOW * 0.3;
  for (const S of stonesIn(lim0, lim1)) {
    if (S.a < lim0 || S.a >= lim1) continue;   // each stone belongs to the one piece its middle lies in
    const q0 = at(S.a), k0 = pr.k(q0.z), px = 2 * S.e * k0 * s, vis = ss(14, 40, px); if (vis < 0.02) continue;
    const wt = ss(lim0 - 10, lim0 + 14, S.a) * (1 - ss(lim1 - 14, lim1 + 10, S.a));
    for (let j = 0; j < 2; j++) {
      const id = Math.round(S.a * 7) * 2 + j + (S.side > 0 ? 1 : 0) * 99991, h1 = hash(id, 411), h2 = hash(id, 412), h3 = hash(id, 413);
      const life = Math.pow(Math.sin(Math.PI * fract(t * (0.35 + 0.4 * h3) + h2)), 3); if (life < 0.03) continue;
      const c = S.a + S.e * (fract(h1 + t * sp / (2 * S.e) * (0.6 + 0.6 * h3)) * 1.6 - 0.8), p = at(c), v = S.side * (1.08 + 0.12 * h2);   // on its water-facing face, sliding with the flow
      const q = pr(p.x + p.nx * v * CH_HALF, p.g - S.ht * (0.35 + 0.45 * h1), p.z + p.nz * v * CH_HALF); if (!q) continue;
      const r = Math.max((0.25 + 0.25 * h2) * k0, 0.7 / s), al = gg * vis * wt * life * (0.3 + 0.2 * h3);
      disc(ctx, q[0], q[1], r * 3, r * 2.2, WARM_RAY, al * 0.28); disc(ctx, q[0], q[1], r, r * 0.8, COL.gold, al);
    }
  }
}
// White water: fresh water thrown out under pressure runs broken and foamy for its first stretch. Drawn over a stretch of water (a0..a1 along
// o.at) as patches of white foam lying on the surface and sliding downstream faster than the body, short broken white streaks, and where the
// front is in the stretch a ragged leading edge: a broken band of white churn with dark gaps and flecks thrown ahead of it.
// o: { at, t, lo, hi, c: arc -> 0..1 how white the water is there, front: 0..1 how broken the leading edge is, y: arc -> surface y (world),
// flow: units per second }.
function churnDraw(ctx, pr, o, a0, a1) {
  const { at, t } = o, FLW = (o.flow || FLOW0) * 1.35, Pm = at((a0 + a1) / 2), cc = pr(Pm.x, o.y(Pm), Pm.z); if (!cc) return;
  const kk = pr.k(Pm.z), s = pr.s, el = Math.max(pr.elev(Pm.x, o.y(Pm), Pm.z), 0.18), mnw = 0.9 / s; if (pr.off(cc[0], cc[1], 200 + (a1 - a0) * kk * s)) return;
  const pal = waterPal(Pm.x, o.y(Pm), Pm.z, true), wht = mix(pal.foam, COL.white, 0.25), shade = mix(pal.mid, pal.foam, 0.4);
  const P3 = (arc, v, dy = 0) => { const p = at(arc); return pr(p.x + p.nx * v * p.hw, o.y(p) - dy, p.z + p.nz * v * p.hw); };
  ctx.save(); ctx.lineCap = 'round'; const BPX = clamp(0.12 * kk * s, 0.5, 1.2), G = blurGroup(ctx);   // the streaks, patches and front lumps share one blur
  const fy = Math.max(el, 0.5);   // foam stands up off the water in lumps, so even from a grazing lens it keeps some height
  // broken white streaks along the flow: the aerated body between the patches
  const SS = 1.6;
  for (let k = Math.floor((a0 - t * FLW * 1.1) / SS) - 4; k * SS + t * FLW * 1.1 < a1 + 4; k++) {
    const h1 = hash(k, 311), h2 = hash(k, 312), h3 = hash(k, 313), c0 = k * SS + t * FLW * 1.1, w = o.c(clamp(c0, o.lo, o.hi)); if (h1 > 0.3 + 0.55 * w || c0 < a0 - 4 || c0 > a1 || c0 > o.hi - 1.5 || c0 < o.lo) continue;
    const v = (h2 * 2 - 1) * 0.85, len = 2.5 + 6 * h3, q0 = P3(Math.max(c0 - len, o.lo), v, 0.1), q1 = P3(c0, v + 0.05, 0.1); if (!q0 || !q1) continue;
    G.line([q0[0], q0[1], q1[0], q1[1]], Math.max((0.6 + 0.8 * h1) * kk * fy, mnw), rgba(wht, w * (0.3 + 0.35 * h3)));
  }
  // foam patches: clusters of white lumps riding the surface downstream, each swelling and breaking up on its own cycle, a shaded skirt under each
  const SP = 2.2;
  for (let k = Math.floor((a0 - t * FLW) / SP) - 2; k * SP + t * FLW < a1 + SP; k++) {
    const h1 = hash(k, 301), h2 = hash(k, 302), h3 = hash(k, 303), c0 = k * SP + t * FLW + 2 * h3; if (c0 < a0 - 1 || c0 >= a1 + 1 || c0 > o.hi - 1 || c0 < o.lo) continue;
    const w = o.c(c0), life = Math.pow(Math.sin(Math.PI * fract(t * (0.5 + 0.6 * h2) + h1)), 0.5); if (w * life < 0.04 || h1 < 0.2 * (1 - w)) continue;
    const v = (h2 * 2 - 1) * 0.86, n = 2 + Math.round(4 * h3);
    for (let b = 0; b < n; b++) { const hb = hash(k * 7 + b, 304), q = P3(c0 + (hb - 0.5) * 3.6, v + (hash(k * 7 + b, 305) - 0.5) * 0.3, 0.3 + 0.5 * hb); if (!q) continue;
      const r = (0.6 + 1.1 * hb) * kk * (0.65 + 0.5 * w) * (0.7 + 0.3 * life), al = w * life * (0.6 + 0.35 * hb);
      G.ell(q[0], q[1] + r * fy * 0.4, Math.max(r * 1.45, mnw), Math.max(r * fy * 0.8, mnw * 0.6), 0, rgba(shade, al * 0.6));
      G.ell(q[0], q[1], Math.max(r * 1.25, mnw), Math.max(r * fy * 0.75, mnw * 0.6), 0, rgba(wht, al)); }
  }
  // the ragged leading edge: a broken white band across the front, dark wet gaps between its lumps, flecks of foam thrown ahead
  const fk = clamp(o.front || 0); if (fk > 0.02 && o.hi >= a0 && o.hi <= a1 + 1e-6) {
    const F = o.hi;
    for (let i = 0; i < 26; i++) { const h1 = hash(i, 321), h2 = hash(i, 322), h3 = hash(i, 323), v = (i / 25 * 2 - 1) * 0.95 + (h1 - 0.5) * 0.08;
      if (h2 < 0.22) continue;   // a gap: the front is broken, not a clean line
      const back = 1.5 + 5 * h3 * h3 + 1.2 * Math.sin(t * 9 + i * 1.7), q = P3(F - back, v, 0.6 + 0.8 * h1); if (!q) continue;
      const r = (1.0 + 1.6 * h2) * kk, al = fk * (0.6 + 0.4 * h1) * (0.75 + 0.25 * Math.sin(t * 7 + i));
      G.ell(q[0], q[1] + r * 0.5 * fy, r * 1.6, r * fy * 0.9, 0, rgba(mix(pal.deep, pal.body, 0.4), al * 0.55));
      G.ell(q[0], q[1], r * 1.4, Math.max(r * fy * 0.8, mnw), 0, rgba(wht, al)); }
    G.done(BPX);
    for (let d = 0; d < 12; d++) { const ph = fract(t * (1.3 + 0.6 * hash(d, 331)) + hash(d, 332)), v = (hash(d, 333) * 2 - 1) * 0.85, q = P3(F - 2 + 7 * ph, v, 0.4 + 3.5 * Math.sin(Math.PI * ph) * (0.4 + hash(d, 334))); if (!q) continue;
      const r = Math.max((0.3 + 0.35 * hash(d, 335)) * kk, mnw); ctx.fillStyle = rgba(wht, fk * 0.8 * (1 - ph)); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill(); }
  }
  G.done(BPX); ctx.restore();
}
// How fresh and forceful the water near the spout is: the swollen pond pushing it out. Only while water runs from the spout itself (the tail at
// the spout): before the blockage the pond is low, and while it is blocked the tail has left the spout, so a seep or leak there never churns. 0..1.
const pressure = st => num(st.waterTail, 1) > 0.001 || !(num(st.water, -1) > 0) ? 0 : ss(0.45, 0.95, num(st.pond, 0));
const CHURN_LEN = [70, 230];   // the white-water stretch below the spout (world units along the channel): full to CHURN_LEN[0], gone by [1]

function waterItems(st) {
  const w = num(st.water, -1); if (!(w > 0)) return [];
  const T = table(), fu = Math.min(w, 1), fa = T.arcOfU(fu), ta = T.arcOfU(Math.min(clamp(num(st.waterTail, 0), 0, 1.14), 1)); if (fa - ta < 0.5) return [];
  const t = num(st.t, 0), g = clamp(num(st.waterGlow, 1), 0, 1.4), adv = ss(0, 0.012, w) * (1 - ss(0.985, 1, w));
  const wo = P.world, wyU = wo && wo.waterY ? wo.waterY : () => -LIFT, trench = wo && wo.trench;
  const at = a => { const p = T.at(a); p.hw = CH_HALF; p.g = p.y; p.y += wyU(p.u) + LIFT; return p; };   // p.y - LIFT is the surface, p.g the ground
  const O = { at, t, g, lo: ta, hi: fa, bed: true, nose: adv, lead: a => adv * Math.exp(-(fa - a) / 70) };
  const PRS = pressure(st) * (ta < 1 ? 1 : 0);   // fresh from the spout, the first stretch runs white
  if (PRS > 0.01) { O.churn = a => PRS * (1 - ss(CHURN_LEN[0], CHURN_LEN[1], a)); O.churnFront = PRS * adv * (1 - ss(CHURN_LEN[1] - 40, CHURN_LEN[1] + 60, fa)); }
  // the trench opening (ground level) over the arcs a piece of water can be seen through: from upstream of it to a little downstream
  const opening = (ctx, pr, a0, a1) => { if (!trench) return false; const Lp = [], Rp = [];
    for (let a = Math.max(0, a0 - 44); a <= Math.min(T.L, a1 + 40) + 1e-6; a += 2.5) { const p = T.at(a), tr = trench(p.z); if (!tr) continue;   // generous downstream: the surface lies below the lip, so it projects past the opening's line at the same arc
      const l = pr(tr.xc - tr.w, 0, p.z), r = pr(tr.xc + tr.w, 0, p.z); if (!l || !r) return false; Lp.push(l); Rp.push(r); }
    if (Lp.length < 2) return false; ctx.beginPath(); Lp.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); for (let i = Rp.length - 1; i >= 0; i--) ctx.lineTo(Rp[i][0], Rp[i][1]); ctx.closePath(); ctx.clip(); return true; };
  const SEG = 22, items = [], j0 = Math.floor(ta / SEG), j1 = Math.floor((fa - 1e-6) / SEG);
  for (let j = j0; j <= j1; j++) {
    const a0 = Math.max(j * SEG, ta), a1 = Math.min((j + 1) * SEG, fa); if (a1 - a0 < 0.2) continue;
    const zm = Math.min(T.at(a0).z, T.at(a1).z, T.at(Math.min(a1 + 6, fa)).z) - 0.3;   // drawn after every trench slice it lies over
    items.push({ z: zm, flat: true, draw: ctx => { const pr = projector(ctx, zm); if (!pr) return; drawRibbon(ctx, pr, Object.assign({}, O, { a0, a1, clip: c => opening(c, pr, a0, a1) })); } });
    // light spilling over the rim stones: a soft additive strip a little in front of the near bank, so a low or wide camera that
    // sees mostly stone still reads a glowing stream behind it
    const zh = zm - 24; items.push({ z: zh, flat: true, draw: ctx => { const pr = projector(ctx, zh); if (pr) glowOver(ctx, pr, O, a0, a1); } });
    const zs = zm - 0.4; items.push({ z: zs, flat: true, draw: ctx => { const pr = projector(ctx, zs); if (pr) bankShimmer(ctx, pr, O, a0, a1); } });   // glints on the banks beside the lit water
  }
  return items;
}

// ---------------------------------------------------------------- reusable water bodies for other modules
// P.fx.waterRibbon(points, o) -> items. Draws a stretch of water along a world-space polyline lying on the ground, with exactly the channel's
// look: blue-green body over a dark wet bed, cool ripples and glints flowing from the first point toward the last, golden particles and a
// gentle warm glow for the carried light, and (optionally) a leading edge with a foam rim, a wet line and hopping droplets.
//   points: [[x, z], ...] (on the ground, y = 0) or [[x, y, z], ...], listed upstream first; smoothed with Catmull-Rom.
//   o.t: film time (s) for the motion (or o.st, a story state, whose t and waterGlow are used)
//   o.width: half width in world units (default 4; the channel is 10). o.taper: [k0, k1] width factors at the first and last point.
//   o.from, o.to: 0..1 along the line where the water starts (its tail) and where its front is (default 0 and 1).
//   o.glow: 0..1 how much light it carries (default st.waterGlow or 1). o.cool: true keeps it moonlit, no warm tint at all.
//   o.nose: 0..1 strength of the leading edge (default 1 when o.to < 1, else 0). o.lift: surface height above the points (default 0.4).
//   o.seg: piece length (default 22); o.zBias: added to every piece's depth (negative = drawn in front of things at the same depth).
//   o.thread: false drops the thin far-distance thread (by default a far ribbon keeps a visible line of water with golden sparks).
// P.fx.waterColors(x, y, z, cool) -> the palette at a world point ({ bed, deep, body, mid, sky, glint, glintHi, ripple, foam } as [r, g, b]),
// so hand-drawn water (a seep, a sheet, a cup's contents) matches the stream; P.fx.WATER holds the base colours.
// P.fx.goldSpark(ctx, x, y, r, a): one golden particle of carried light (a soft halo and a hot core) at local (x, y), radius r.
fx.waterColors = (x, y, z, cool) => waterPal(x, y, z, cool);
fx.goldSpark = (ctx, x, y, r, a) => { disc(ctx, x, y, r * 3.2, r * 3.2, COL.gold, a * 0.35); disc(ctx, x, y, r * 1.1, r * 1.1, COL.hot, a); };
fx.waterRibbon = function (points, o = {}) {
  if (!points || points.length < 2) return [];
  const st = o.st || {}, t = num(o.t, num(st.t, 0)), g = clamp(num(o.glow, num(st.waterGlow, 1)), 0, 1.4), HW = num(o.width, 4), lift = num(o.lift, 0.4);
  const raw = points.map(p => p.length >= 3 ? [p[0], p[1], p[2]] : [p[0], 0, p[1]]), m = raw.length, D = [];
  const cr = (a, b, c, d, u) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < 8; j++) { const a = raw[Math.max(i - 1, 0)], b = raw[i], c = raw[i + 1], d = raw[Math.min(i + 2, m - 1)], u = j / 8; D.push([0, 1, 2].map(k => cr(a[k], b[k], c[k], d[k], u))); }
  D.push(raw[m - 1].slice());
  const A = [0]; for (let i = 1; i < D.length; i++) A.push(A[i - 1] + Math.hypot(D[i][0] - D[i - 1][0], D[i][2] - D[i - 1][2]));
  const L = A[A.length - 1]; if (L < 0.5) return [];
  const N = D.length - 1, tp = o.taper || [1, 1];
  const at = a => { a = clamp(a, 0, L); let lo = 0, hi = N; while (hi - lo > 1) { const mm = (lo + hi) >> 1; if (A[mm] <= a) lo = mm; else hi = mm; }
    const k = (a - A[lo]) / Math.max(A[hi] - A[lo], 1e-6), i0 = Math.max(lo - 1, 0), i1 = Math.min(hi + 1, N); let dx = D[i1][0] - D[i0][0], dz = D[i1][2] - D[i0][2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    return { x: lerp(D[lo][0], D[hi][0], k), y: lerp(D[lo][1], D[hi][1], k) + LIFT - lift, z: lerp(D[lo][2], D[hi][2], k), dx, dz, nx: -dz, nz: dx, hw: HW * lerp(tp[0], tp[1], a / L) }; };
  const lo = L * clamp(num(o.from, 0)), hi = L * clamp(num(o.to, 1)); if (hi - lo < 0.3) return [];
  const nose = num(o.nose, num(o.to, 1) < 0.999 ? 1 : 0), SEG = num(o.seg, 22), zb = num(o.zBias, 0), items = [];
  const O = { at, t, g, lo, hi, bed: false, stones: false, cool: !!o.cool, nose, lead: a => nose * Math.exp(-(hi - a) / 40), tailFade: lo > 0.5 ? 8 : 0, flow: o.flow };
  {   // white water: o.churn 0..1 (whole stretch, fading over its last half), or by default the story's own: water within the first stretch below
    // the spout while the swollen pond still pushes it out (after the release) runs white, so a surge laid over the channel there churns too
    const M0 = P.world && P.world.chan ? P.world.chan(0) : [-900, 0, 2600], dS = a => { const p = at(a); return Math.hypot(p.x - M0[0], p.z - M0[2]); };
    let cf = null;
    if (o.churn !== undefined) { const ck = clamp(num(o.churn, 0)); if (ck > 0.01) cf = a => ck * (1 - ss(0.45, 1, (a - lo) / Math.max(hi - lo, 1))); }
    else if (typeof P.state === 'function' && dS(lo) < CHURN_LEN[1]) { const pk = pressure(P.state(t)); if (pk > 0.01) cf = a => pk * (1 - ss(CHURN_LEN[0], CHURN_LEN[1], dS(a))); }
    if (cf) { O.churn = cf; O.churnFront = nose * cf(hi) * 1.2; }
  }
  for (let j = Math.floor(lo / SEG); j * SEG < hi; j++) {
    const a0 = Math.max(j * SEG, lo), a1 = Math.min((j + 1) * SEG, hi); if (a1 - a0 < 0.2) continue;
    // sorted at the nearest point of its centre line (as the channel's pieces are), so the ground and trench under the whole piece are drawn
    // first; sorted at its middle, the trench slices of its near half painted over it and left dark bars at every piece boundary
    let zn = 1e9; for (let q = 0; q <= 4; q++) zn = Math.min(zn, at(lerp(a0, Math.min(a1 + OV, hi), q / 4)).z);
    const zm = zn - 0.3 + zb;
    items.push({ z: zm, flat: true, draw: ctx => { const pr = projector(ctx, zm); if (pr) drawRibbon(ctx, pr, Object.assign({}, O, { a0, a1 })); } });
    if (o.thread !== false) { const zh = zm - 0.6; items.push({ z: zh, flat: true, draw: ctx => { const pr = projector(ctx, zh); if (pr) glowOver(ctx, pr, Object.assign({}, O, { farOnly: true }), a0, a1); } }); }
  }
  return probes().concat(items);
};

// P.fx.waterFace(points, o) -> items. The same water, drawn in the plane of one card at depth o.z instead of on the ground: for water seen
// face-on, where a ground ribbon would be a hairline from a low lens (a runnel over the front of a mound, a seep down the face of a dam).
//   points: [[x, y], ...] in that card's plane (world units at depth o.z, as any item drawn at o.z), upstream first; Catmull-Rom smoothed.
//   o.z (required): the card depth. o.width: half width (default 2). o.taper, o.from, o.to, o.glow, o.cool, o.nose, o.t / o.st as for
//   waterRibbon. o.flow: speed in units per second (default 62, the channel's). o.elev: how flat the ripples lie (0.2 grazing .. 1 face-on,
//   default 0.6). o.palAt: [x, y, z] world point whose light tints it (default the middle of the line at depth o.z). o.wobble: how uneven the
//   banks are (default 0.25). o.wet: width of the soaked margin as a factor of the water's width (default 2, 0 = none). o.det: detail 0..1 (0.8).
//   o.spark: size factor of the golden particles (default 1.4: a narrow runnel needs them a little larger to read).
fx.waterFace = function (points, o = {}) {
  if (!points || points.length < 2 || !(o.z > 0 || o.z < 0)) return [];
  const st = o.st || {}, t = num(o.t, num(st.t, 0)), g = clamp(num(o.glow, num(st.waterGlow, 1)), 0, 1.4), HW = num(o.width, 2), zc = o.z, el = num(o.elev, 0.6), wob = num(o.wobble, 0.25);
  const raw = points.map(p => [p[0], p[1]]), m = raw.length, D = [];
  const cr = (a, b, c, d, u) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < 8; j++) { const a = raw[Math.max(i - 1, 0)], b = raw[i], c = raw[i + 1], d = raw[Math.min(i + 2, m - 1)], u = j / 8; D.push([cr(a[0], b[0], c[0], d[0], u), cr(a[1], b[1], c[1], d[1], u)]); }
  D.push(raw[m - 1].slice());
  const A = [0]; for (let i = 1; i < D.length; i++) A.push(A[i - 1] + Math.hypot(D[i][0] - D[i - 1][0], D[i][1] - D[i - 1][1]));
  const L = A[A.length - 1]; if (L < 0.5) return [];
  const N = D.length - 1, tp = o.taper || [1, 1];
  // the card plane posed as a ground seen from straight above: x -> x, card y -> "z"; drawRibbon's surface lift then nudges points up the card
  const at = a => { a = clamp(a, 0, L); let lo = 0, hi = N; while (hi - lo > 1) { const mm = (lo + hi) >> 1; if (A[mm] <= a) lo = mm; else hi = mm; }
    const k = (a - A[lo]) / Math.max(A[hi] - A[lo], 1e-6), i0 = Math.max(lo - 1, 0), i1 = Math.min(hi + 1, N); let dx = D[i1][0] - D[i0][0], dz = D[i1][1] - D[i0][1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    return { x: lerp(D[lo][0], D[hi][0], k), y: LIFT, z: lerp(D[lo][1], D[hi][1], k), dx, dz, nx: -dz, nz: dx, hw: HW * lerp(tp[0], tp[1], a / L) * (1 + wob * (0.6 * Math.sin(a * 0.8 / HW + 1.3) + 0.4 * Math.sin(a * 2.1 / HW + 0.4 - t * 2.2))) }; };
  const lo = L * clamp(num(o.from, 0)), hi = L * clamp(num(o.to, 1)); if (hi - lo < 0.3) return [];
  const nose = num(o.nose, num(o.to, 1) < 0.999 ? 1 : 0), mid = at(L / 2), palAt = o.palAt || [mid.x, mid.z, zc];
  const O = { at, t, g, lo, hi, a0: lo, a1: hi, bed: false, stones: false, cool: !!o.cool, nose, lead: a => nose * Math.exp(-(hi - a) / 12), tailFade: lo > 0.5 ? 4 : 0, flow: o.flow, palAt, refl: false, soft: true, sheet: true, wet: num(o.wet, 2.0), det: num(o.det, 0.8), spark: num(o.spark, 1.4) };
  return [{ z: zc, draw(ctx) {
    const mt = ctx.getTransform(), sc = Math.hypot(mt.a, mt.b);
    const pr = (x, y, z) => [x, z + y];
    pr.k = () => 1; pr.s = sc; pr.elev = () => el;
    pr.screen = (X, Y) => [mt.a * X + mt.c * Y + mt.e, mt.b * X + mt.d * Y + mt.f];
    pr.off = (X, Y, pad) => { const q = pr.screen(X, Y); return q[0] < -pad || q[0] > W + pad || q[1] < -pad || q[1] > H + pad; };
    drawRibbon(ctx, pr, O);
  } }];
};

// ---------------------------------------------------------------- ribbon polygon helper (local space)
// pts: [[X, Y], ...] local coords, hw: half widths in local units. Builds one polygon path; returns the two edges.
function ribbon(ctx, pts, hw) {
  const n = pts.length; if (n < 2) return null;
  const Lp = [], Rp = [];
  for (let i = 0; i < n; i++) { const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    Lp.push([pts[i][0] - ty * hw[i], pts[i][1] + tx * hw[i]]); Rp.push([pts[i][0] + ty * hw[i], pts[i][1] - tx * hw[i]]); }
  ctx.beginPath(); ctx.moveTo(Lp[0][0], Lp[0][1]); for (let i = 1; i < n; i++) ctx.lineTo(Lp[i][0], Lp[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(Rp[i][0], Rp[i][1]); ctx.closePath();
  return { Lp, Rp };
}

// ---------------------------------------------------------------- wet patch (splash puddle, soaked soil)
// k grows the patch; a darkened, feathered wet area with a thin, broken bright meniscus at its edge.
function wetPatch(ctx, pr, B, R, k, g, el) {
  if (k <= 0.01) return; const c = pr(B.x, B.y, B.z); if (!c) return; const kk = pr.k(B.z), s = pr.s, ry = Math.max(el, 0.2);
  const cool = lit3([40, 50, 90], B.x, B.y, B.z, 0.02), tint = mix(cool, [150, 76, 26], 0.7 * clamp(g, 0, 1));
  ctx.save();
  disc(ctx, c[0], c[1], R * kk * 1.28, R * kk * ry * 1.28, [8, 8, 22], 0.5 * k);
  disc(ctx, c[0], c[1], R * kk * 1.0, R * kk * ry * 1.0, tint, 0.2 * k);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const mc = mix(COL.coolHi, [255, 196, 120], clamp(g, 0, 1)), np = 7;
  for (let j = 0; j < np; j++) { const a0 = j / np * TAU + hash(j, 811) * 0.5, span = 0.32 + 0.42 * hash(j, 812);
    ctx.strokeStyle = rgba(mc, (0.08 + 0.12 * hash(j, 813)) * k); ctx.lineWidth = Math.max(0.28 * kk, 0.9 / s);
    ctx.beginPath(); ctx.ellipse(c[0], c[1], R * kk * 1.04, R * kk * ry * 1.04, 0, a0, a0 + span); ctx.stroke(); }
  ctx.strokeStyle = rgba(mc, 0.07 * k); ctx.lineWidth = Math.max(0.5 * kk, 1.2 / s); ctx.beginPath(); ctx.ellipse(c[0], c[1], R * kk * 1.03, R * kk * ry * 1.03, 0, 0, TAU); ctx.stroke();   // a faint continuous wet edge under the brighter slivers
  disc(ctx, c[0], c[1] - 0.8 * kk, R * kk * 0.7, R * kk * ry * 0.6, COL.warm, 0.1 * k * clamp(g, 0, 1));
  ctx.restore();
}

// ---------------------------------------------------------------- splash: a crown with thrown droplets (one shot or looping)
// ph 0..1: the crown rises as translucent petals of water, collapses; droplets fly outward on parabolic arcs, stretched along their
// velocity; two soft staggered rings fade as they expand. The puddle is drawn separately (it grows with the whole pour).
function splashDraw(ctx, pr, B, ph, sc, pw, seed, g) {
  if (ph <= 0 || ph >= 1) return;
  const c = pr(B.x, B.y, B.z); if (!c) return; const kk = pr.k(B.z), s = pr.s, mnw = 0.9 / s, el = Math.max(pr.elev(B.x, B.y, B.z), 0.2), gg = clamp(g, 0, 1);
  const wc = mix(COL.coolHi, COL.amber, 0.25 + 0.7 * gg), hc = mix(COL.coolHi, COL.hot, 0.35 + 0.6 * gg);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let r = 0; r < 2; r++) {   // soft staggered rings on the ground
    const p2 = (ph - r * 0.2) / 0.8; if (p2 <= 0 || p2 >= 1) continue; const R = (1.8 + 11 * sc * easeOut(p2)) * (0.7 + 0.3 * pw);
    ringGlow(ctx, c[0], c[1], R * kk * 1.2, R * kk * el, wc, Math.pow(1 - p2, 1.5) * 0.4 * pw, 0.6);
  }
  disc(ctx, c[0], c[1] - 1.2 * sc * kk, 6.5 * sc * kk, 4.4 * sc * kk, wc, 0.36 * Math.pow(1 - ph, 2) * pw);
  // the crown
  const crown = ph < 0.6 ? Math.sin(Math.PI * ph / 0.6) : 0, NP = 9;
  if (crown > 0.01) {
    const pet = []; for (let j = 0; j < NP; j++) { const a = (j + 0.5 * hash(j, seed + 1)) / NP * TAU; pet.push({ j, a, d: Math.sin(a) }); }
    pet.sort((p, q) => q.d - p.d);   // far petals first
    for (const { j, a, d } of pet) {
      const h1 = hash(j, seed + 2), h2 = hash(j, seed + 3), Rb = (1.1 + 4.6 * easeOut(ph * 1.3)) * sc * (0.75 + 0.25 * pw), Hj = (2.2 + 5.4 * h1 * h1) * sc * pw * crown, lean = (1 + 0.8 * h2) * sc * crown;
      const ca = Math.cos(a), sa = Math.sin(a), b = pr(B.x + ca * Rb, B.y, B.z + sa * Rb * 0.9), tp = pr(B.x + ca * (Rb + lean), B.y - Hj, B.z + sa * (Rb + lean) * 0.9); if (!b || !tp) continue;
      const wp = (0.8 + 0.4 * h2) * sc * kk * (1 - 0.35 * ph), mx = (b[0] + tp[0]) / 2, my = (b[1] + tp[1]) / 2, back = d > 0 ? 0.65 : 1, al = (0.2 + 0.16 * h1) * (1 - ss(0.4, 1, ph)) * pw * back;
      const gr = ctx.createLinearGradient(b[0], b[1], tp[0], tp[1]); gr.addColorStop(0, rgba(wc, al * 0.25)); gr.addColorStop(1, rgba(hc, al * 1.25));
      ctx.beginPath(); ctx.moveTo(b[0] - wp, b[1]); ctx.bezierCurveTo(b[0] - wp * 1.5, my + (b[1] - my) * 0.2, tp[0] - wp * 0.9, tp[1], tp[0], tp[1]); ctx.bezierCurveTo(tp[0] + wp * 0.9, tp[1], b[0] + wp * 1.5, my + (b[1] - my) * 0.2, b[0] + wp, b[1]); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = rgba(hc, al * 0.55); ctx.lineWidth = Math.max(0.16 * sc * kk, mnw * 0.8); ctx.stroke();
      if (h2 > 0.6) { ctx.fillStyle = rgba(COL.white, al * 0.9); ctx.beginPath(); ctx.arc(tp[0], tp[1], Math.max(0.28 * sc * kk, mnw * 0.7), 0, TAU); ctx.fill(); }   // a specular glint only on some tips
    }
  }
  // droplets thrown outward on parabolic arcs, stretched along their velocity, no bigger than the stream is wide
  for (let d = 0; d < 14; d++) {
    const h1 = hash(d, seed + 11), h2 = hash(d, seed + 12), h3 = hash(d, seed + 13), h4 = hash(d, seed + 14), h5 = hash(d, seed + 15);
    const u = clamp(ph * (0.85 + 0.5 * h4)); if (u <= 0.01 || u >= 1) continue;
    const a = h1 * TAU, vh = (3 + 8 * h2) * sc, Hh = (4 + 11 * h3) * sc * (0.55 + 0.45 * pw);
    const at = f => pr(B.x + Math.cos(a) * vh * f, B.y - 4 * Hh * f * (1 - f), B.z + Math.sin(a) * vh * f * 0.8);
    const q = at(u), q0 = at(Math.max(u - 0.045, 0)); if (!q || !q0) continue;
    const r = Math.max((0.24 + 0.3 * h5) * sc * kk, mnw * 0.8), al = (1 - ss(0.6, 1, u)) * 0.9 * pw;
    ctx.strokeStyle = rgba(wc, al * 0.5); ctx.lineWidth = r * 1.2; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    ctx.fillStyle = rgba(mix(wc, hc, 0.5), al); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
    if (h5 > 0.55) { ctx.fillStyle = rgba(COL.white, al * 0.85); ctx.beginPath(); ctx.arc(q[0] - r * 0.3, q[1] - r * 0.35, r * 0.34, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}
// spray + foam ring at a landing point (the new splash form). t drives the motion (seconds), k 0..1 is the strength
// (0 draws nothing, 1 full). Every droplet runs on its own hashed cycle of t, so any frame is a pure function of t.
function landingDraw(ctx, pr, B, t, k, o, g) {
  const c = pr(B.x, B.y, B.z); if (!c) return; const kk = pr.k(B.z), s = pr.s, mnw = 0.9 / s, el = Math.max(pr.elev(B.x, B.y, B.z), 0.2), gg = clamp(g, 0, 1);
  const sc = num(o.scale, 1), rate = num(o.rate, 1.2), seed = num(o.seed, 0), R0 = num(o.ring, 7) * sc, hgt = num(o.height, 1), lean = num(o.lean, 0), N = Math.round(num(o.drops, 26));
  const wc = mix(COL.coolHi, COL.amber, 0.2 + 0.65 * gg), hc = mix(COL.coolHi, COL.hot, 0.3 + 0.55 * gg), foam = [228, 244, 246];
  ctx.save(); ctx.lineCap = 'round';
  // churned water under the landing: a pale teal mound of froth with a darker skirt, so the ring sits on something
  disc(ctx, c[0], c[1], R0 * kk * 1.35, R0 * kk * el * 1.35, [10, 34, 44], 0.32 * k);
  disc(ctx, c[0], c[1], R0 * kk * 0.95, R0 * kk * el * 0.95, mix([60, 120, 130], wc, 0.3), 0.3 * k);
  ctx.globalCompositeOperation = 'lighter';
  disc(ctx, c[0], c[1] - 0.6 * sc * kk, R0 * kk * 0.7, R0 * kk * el * 0.6 + 1.2 * sc * kk, wc, 0.16 * k);
  // the foam ring: two staggered rings of flattened bubbles that leave the landing and fade as they spread
  for (let r = 0; r < 2; r++) {
    const ph = fract(t * rate * 0.7 + r * 0.5 + 0.13 * seed), R = R0 * (0.55 + 0.75 * easeOut(ph)), a = k * (1 - ph) * ss(0, 0.12, ph);
    for (let f = 0; f < 22; f++) { const th = (f + hash(f, 41 + seed + r * 3)) / 22 * TAU, rr = R * (0.9 + 0.2 * hash(f, 42 + seed)), fr = (0.5 + 0.9 * hash(f, 43 + seed)) * sc * kk;
      const px = c[0] + Math.cos(th) * rr * kk, py = c[1] + Math.sin(th) * rr * kk * el, back = Math.sin(th) < 0 ? 0.6 : 1;
      ctx.fillStyle = rgba(foam, 0.6 * a * back); ctx.beginPath(); ctx.ellipse(px, py, Math.max(fr, mnw), Math.max(fr * 0.5, mnw * 0.6), 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = rgba(foam, 0.22 * a); ctx.lineWidth = Math.max(0.5 * sc * kk, mnw); ctx.beginPath(); ctx.ellipse(c[0], c[1], R * kk, R * kk * el, 0, 0, TAU); ctx.stroke();
  }
  // spray: droplets thrown up and out on parabolic arcs, each a short streak along its motion with a bright head. o.pearl 0..1 (1 = that
  // original look, additive and warm): lower turns it into plain water, round cool drops thrown lower and wider so most of their flight is the
  // fall, each with a faint trail behind it and a pin of highlight, never a rising glowing stick
  const PRL = clamp(num(o.pearl, 1), 0, 1), DM = 1 - PRL;
  if (DM > 0.01) ctx.globalCompositeOperation = 'source-over';
  const wp = DM > 0.01 ? waterPal(B.x, B.y, B.z, true) : null, wd = DM > 0.01 ? mix(mix(wp.glintHi, wp.glint, 0.5), wc, PRL) : wc, body = DM > 0.01 ? mix(mix(wp.glintHi, COL.white, 0.3), wc, PRL) : wc;
  for (let d = 0; d < N; d++) {
    const h1 = hash(d, 61 + seed), h2 = hash(d, 62 + seed), h3 = hash(d, 63 + seed), h4 = hash(d, 64 + seed), h5 = hash(d, 65 + seed);
    const ph = fract(t * rate * (0.8 + 0.6 * h4) + h1); if (ph < 0.02 || ph > 0.98) continue;
    const a = h2 * TAU, vh = (2 + 7 * h3) * sc * (1 + 0.7 * DM), Hh = (3 + 9 * h5) * sc * hgt * (0.6 + 0.4 * k) * (1 - 0.5 * DM), r0 = R0 * 0.35 * h4;
    const fl = ph * (1 - 0.35 * DM) + 0.35 * DM * ph * ph;   // pearl < 1: the drop is past its peak sooner, so it is mostly seen falling
    const at = f => pr(B.x + Math.cos(a) * (r0 + vh * f) + lean * sc * f, B.y - 4 * Hh * f * (1 - f), B.z + Math.sin(a) * (r0 + vh * f) * 0.8);
    const q = at(fl), q0 = at(Math.max(fl - 0.06 * (1 - 0.6 * DM), 0)); if (!q || !q0) continue;
    const rr = Math.max((0.22 + 0.32 * h3) * sc * kk * (1 - 0.45 * DM), mnw * 0.8), al = k * (1 - ss(0.62, 1, ph)) * 0.85;
    if (DM > 0.01) {   // plain water: faint trail, a round drop (teal body, pale rim) and a pin of highlight
      ctx.strokeStyle = rgba(wd, al * 0.22 * DM); ctx.lineWidth = rr * 0.9; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.fillStyle = rgba(body, al * 0.9); ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, TAU); ctx.fill();
      if (PRL < 0.99) { const dc = h1 < 0.18 && gg > 0.05 ? COL.gold : mix(wc, hc, 0.5); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(dc, al * 0.45 * PRL); ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      continue;
    }
    const dc = h1 < 0.18 && gg > 0.05 ? COL.gold : mix(wc, hc, 0.5);
    ctx.strokeStyle = rgba(wc, al * 0.45); ctx.lineWidth = rr * 1.2; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    ctx.fillStyle = rgba(dc, al); ctx.beginPath(); ctx.ellipse(q[0], q[1], rr, rr, Math.atan2(q[1] - q0[1], q[0] - q0[0]), 0, TAU); ctx.fill();
    if (h5 > 0.5) { ctx.fillStyle = rgba(COL.white, al * 0.8); ctx.beginPath(); ctx.arc(q[0] - rr * 0.3, q[1] - rr * 0.35, rr * 0.35, 0, TAU); ctx.fill(); }
  }
  ctx.globalCompositeOperation = 'lighter';
  // a fine mist hanging just over the landing
  for (let m = 0; m < 5; m++) { const ph = fract(t * 0.5 + hash(m, 71 + seed)), mx = c[0] + (hash(m, 72 + seed) - 0.5) * R0 * kk * 1.6, my = c[1] - (1 + 5 * ph) * sc * kk;
    disc(ctx, mx, my, (2.2 + 2 * ph) * sc * kk, (1.4 + 1.2 * ph) * sc * kk, foam, 0.05 * k * Math.sin(Math.PI * ph)); }
  ctx.restore();
}
// The crown of a heavy landing as plain water (fx.splash's t-form with crown and pearl < 1): a heaving boil of white water, soft round lobes that
// swell up out of the landing, roll over and sink back, each on its own hashed cycle of t, with a darker churned skirt under them.
function boilDraw(ctx, pr, B, t, k, o, dm) {
  const c = pr(B.x, B.y, B.z); if (!c) return; const kk = pr.k(B.z), s = pr.s, el = Math.max(pr.elev(B.x, B.y, B.z), 0.2);
  const sc = num(o.scale, 1) * 0.8, rate = num(o.rate, 1.2), seed = num(o.seed, 0), pal = waterPal(B.x, B.y, B.z, true), R = 6 * sc, NL = 30, lob = [];
  for (let i = 0; i < NL; i++) { const h1 = hash(i, 181 + seed), h2 = hash(i, 182 + seed), h3 = hash(i, 183 + seed), ph = fract(t * rate * (0.7 + 0.6 * h3) + h1), th = h2 * TAU, rr = R * Math.sqrt(hash(i, 184 + seed));
    lob.push({ h1, h2, h3, ph, x: B.x + Math.cos(th) * rr * 1.3, z: B.z + Math.sin(th) * rr * 0.7 }); }
  lob.sort((p, q) => q.z - p.z);   // far lobes first
  const top = mix(pal.foam, COL.white, 0.35), under = mix(pal.body, pal.foam, 0.3);
  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  disc(ctx, c[0], c[1], R * 1.6 * kk, R * 1.6 * kk * el, mix(pal.deep, pal.body, 0.5), 0.45 * k * dm);
  const G = blurGroup(ctx);   // the lobes share one blur
  for (const L of lob) { const up = Math.sin(Math.PI * L.ph), q = pr(L.x, B.y - (0.8 + 3.2 * L.h3) * sc * up, L.z); if (!q) continue;
    const r = (0.6 + 1.1 * L.h2) * sc * kk * (0.6 + 0.6 * L.ph), al = k * dm * (0.6 + 0.3 * L.h1) * Math.pow(up, 0.5);
    G.ell(q[0], q[1] + r * 0.3, r * 1.2, r * 0.9, 0, rgba(under, al * 0.8));   // its shaded underside
    G.ell(q[0], q[1] - r * 0.12, r * 1.0, r * 0.78, 0, rgba(top, al)); }
  G.done(clamp(0.08 * sc * kk * s, 0.5, 1)); ctx.restore();
}
// fx.splash has two forms; the 5th argument tells them apart.
//  splash(x, y, z, k, o)      the original: k is one-shot progress 0..1 (nothing outside); o.loop = seconds makes it a continuous
//                             splash instead. o: scale (1 = about 10 units across), power 0..1, glow 0..1, rate (loop cycles per
//                             second), puddle 0..1 (default grows with k).
//  splash(x, y, z, t, k, o)   a landing point that keeps running: spray droplets plus a spreading foam ring where water lands.
//                             t: seconds (any running clock, e.g. seconds since release); k: strength 0..1 (0 draws nothing; ramp it
//                             in and out yourself). o: scale (1 = a ring about 14 units across), ring (base ring radius, 7),
//                             drops (spray droplet count, 26), height (spray height multiplier, 1), lean (units the spray drifts
//                             sideways, e.g. downstream, 0), rate (cycles per second, 1.2), glow 0..1 (warmth and gold in the spray, 0.35),
//                             crown 0..1 (adds the looping crown petals of the old form, 0; with pearl < 1 a heaving boil of white
//                             water instead), pearl 0..1 (1: the spray's original warm, additive look; lower: plain water, round cool
//                             drops mostly seen falling, with a faint trail), seed.
fx.splash = function (x, y, z, k, o = {}) {
  if (typeof o === 'number') {   // the (x, y, z, t, k, opts) form
    const t = k, kk = clamp(o), op = arguments[5] || {}; if (!(kk > 0.004)) return [];
    const B = { x, y, z }, g = clamp(num(op.glow, 0.35), 0, 1.3), zi = z - 0.6, cr = clamp(num(op.crown, 0));
    return probes().concat([{ z: zi, draw(ctx) { const pr = projector(ctx, zi); if (!pr) return;
      landingDraw(ctx, pr, B, t, kk, op, g);
      if (cr > 0) { if (num(op.pearl, 1) < 0.99) boilDraw(ctx, pr, B, t, cr * kk, op, 1 - clamp(num(op.pearl, 1)));
        else for (let i = 0; i < 2; i++) splashDraw(ctx, pr, B, fract(t * num(op.rate, 1.2) + i / 2), num(op.scale, 1) * 0.8, cr * kk, 10 + i * 7 + num(op.seed, 0), g); }
    } }]);
  }
  const B = { x, y, z }, sc = num(o.scale, 1), pw = num(o.power, 1), g = clamp(num(o.glow, 0.9), 0, 1.3), loop = o.loop;
  if (loop === undefined && !(k > 0 && k < 1)) return [];
  const rate = num(o.rate, 1.6), zi = z - 0.6;
  return probes().concat([{ z: zi, draw(ctx) { const pr = projector(ctx, zi); if (!pr) return;
    const pu = o.puddle !== undefined ? o.puddle : loop === undefined ? ss(0.05, 0.7, k) * (1 - ss(0.75, 1, k)) * 0.8 : 0.6;
    wetPatch(ctx, pr, B, (2.5 + 9 * pu) * sc, pu, g, Math.max(pr.elev(B.x, B.y, B.z), 0.2));
    if (loop === undefined) splashDraw(ctx, pr, B, k, sc, pw, 10, g);
    else for (let i = 0; i < 2; i++) splashDraw(ctx, pr, B, fract(loop * rate + i / 2), sc, pw, 10 + i * 7, g);
  } }]);
};

// ---------------------------------------------------------------- the trickle into the hero root
// The creeping runnel starts only when the channel front has actually reached the channel end (st.water = 1) and takes
// until st.water = 1.11 to reach the root. It has the same bulging meniscus nose as the channel front, feathered edges, and
// ends in a soaked, darkened patch that spreads. It drains from its upstream end with st.waterTail.
function trickleItems(st) {
  const w = num(st.water, -1), tlv = num(st.waterTail, 0), rF = ss(1.0, 1.11, w), rT = ss(1.0, 1.14, tlv); if (rF < 0.004 || rT >= rF - 0.003) return [];
  const T = table(), E = T.at(T.L), R = fx.ROOT, t = num(st.t, 0), g = clamp(num(st.waterGlow, 1), 0, 1.4), HW = fx.WATER_HALF;
  const tgt = { x: R.x + 5, y: R.y - 0.3, z: R.z + 4 };
  const P0 = [E.x, E.z], P1 = [E.x + E.dx * 16, E.z + E.dz * 16], P2 = [tgt.x + 9, tgt.z + 12], P3 = [tgt.x, tgt.z];
  const bez = u => { const a = 1 - u; return [a * a * a * P0[0] + 3 * a * a * u * P1[0] + 3 * a * u * u * P2[0] + u * u * u * P3[0], a * a * a * P0[1] + 3 * a * a * u * P1[1] + 3 * a * u * u * P2[1] + u * u * u * P3[1]]; };
  const NB = 40, bp = [], ba = [0]; for (let i = 0; i <= NB; i++) { bp.push(bez(i / NB)); if (i) ba.push(ba[i - 1] + Math.hypot(bp[i][0] - bp[i - 1][0], bp[i][1] - bp[i - 1][1])); }
  const Lb = ba[NB];
  const at = a => {
    a = clamp(a, 0, Lb); let lo = 0, hi = NB; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ba[m] <= a) lo = m; else hi = m; }
    const k = (a - ba[lo]) / Math.max(ba[hi] - ba[lo], 1e-6), x = lerp(bp[lo][0], bp[hi][0], k), z = lerp(bp[lo][1], bp[hi][1], k);
    const i0 = Math.max(lo - 1, 0), i1 = Math.min(hi + 1, NB); let dx = bp[i1][0] - bp[i0][0], dz = bp[i1][1] - bp[i0][1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const f = a / Lb; return { x, z, y: E.y + (tgt.y - E.y) * f, dx, dz, nx: -dz, nz: dx, hw: lerp(HW * 0.94, 2.4, Math.pow(f, 0.8)) * (1 + 0.04 * Math.sin(a * 0.6 - t * 9)) };
  };
  const aF = Lb * rF, aT = Lb * rT, creeping = rF < 0.995, zs = (P0[1] + P3[1]) / 2, items = [];
  const poolK = ss(0.5, 1, rF) * (1 - ss(0.25, 1, rT));
  if (aF - aT > 0.4) items.push({ z: zs, draw(ctx) { const pr = projector(ctx, zs); if (!pr) return;
    drawRibbon(ctx, pr, { at, t, g, lo: aT, hi: aF, a0: aT, a1: aF, bed: false, nose: creeping ? 1 : 0, lead: a => creeping ? Math.exp(-(aF - a) / 22) : 0.14, tailFade: aT > 0.5 ? 8 : 0 });
  } });
  if (poolK > 0.01) {   // soaked soil at the foot of the stem, just behind it so the stem overlaps
    const zp = R.z + 1.5;
    items.push({ z: zp, draw(ctx) {
      const pr = projector(ctx, zp); if (!pr) return; const kk = pr.k(zp), s = pr.s, cx = tgt.x - 2, cz = tgt.z - 2, spread = ss(0.1, 1, poolK), RR = 4 + 10 * spread, c = pr(cx, R.y - 0.4, cz); if (!c) return;
      const el = Math.max(pr.elev(cx, R.y, cz), 0.2), gg = clamp(g, 0, 1);
      wetPatch(ctx, pr, { x: cx, y: R.y - 0.4, z: cz }, RR, poolK, g, el);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let m = 0; m < 2; m++) { const ph = fract(t * 0.5 + m / 2); ringGlow(ctx, c[0], c[1], (2 + (RR - 1) * ph) * kk * 1.25, (2 + (RR - 1) * ph) * kk * el, mix(COL.coolHi, COL.hot, gg), (1 - ph) * 0.3 * poolK, 0.55); }
      ctx.restore();
    } });
  }
  if (!creeping && poolK > 0.3) { const z = tgt.z - 0.5; items.push({ z, draw(ctx) { const pr = projector(ctx, z); if (!pr) return; for (let i = 0; i < 2; i++) splashDraw(ctx, pr, tgt, fract(t * 1.3 + i / 2), 0.4, 0.7 * poolK, 30 + i * 7, g); } }); }
  return items;
}
fx.trickle = st => probes().concat(trickleItems(st));
fx.water = st => { const it = waterItems(st), tr = trickleItems(st); return it.length || tr.length ? probes().concat(it, tr) : []; };

// ---------------------------------------------------------------- pour from the dipper lip
// pour(from, to, k, st): from = dipper lip {x,y,z} or [x,y,z], to = ground point, k = 0..1 pour strength (the stream
// first reaches the ground by k = 0.26 and then the impact splash runs). st.t drives the flow, st.waterGlow the glow.
// The stream wraps over the lip in a curve, necks as it speeds up (width ~ 1/sqrt(speed)), is translucent with two bright
// edge highlights, a darker core and a travelling ripple, and breaks into stretched drops over its last fifth.
fx.pour = function (from, to, k, st = {}) {
  k = clamp(num(k, 0)); if (k <= 0.001) return [];
  const A = pt3(from), B = pt3(to), t = num(st.t, 0), g = clamp(num(st.waterGlow, 0.9), 0, 1.3), gg = clamp(g, 0, 1);
  const reach = ss(0, 0.26, k), amt = 0.4 + 0.6 * ss(0.05, 0.7, k), w0 = (2.6 + 3.0 * amt) * (0.5 + 0.5 * ss(0, 0.16, k)), zi = Math.min(A.z + 0.7, B.z - 0.3);   // just behind the lip's own card, so the rim covers the start
  const dx = B.x - A.x, dz = B.z - A.z, fall = Math.max(B.y - A.y, 1), dir = sgn(dx || 1);
  const pos = f => ({ x: A.x + dx * f + dir * 3.8 * 4 * f * (1 - f) * (1 - f), y: A.y + fall * (0.12 * f + 0.88 * f * f), z: A.z + dz * f });
  const spd = f => { const a = pos(Math.max(f - 0.01, 0)), b = pos(Math.min(f + 0.01, 1)); return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / (Math.min(f + 0.01, 1) - Math.max(f - 0.01, 0)); };
  const vref = spd(0.05), neck = f => clamp(Math.sqrt(vref / spd(f)), 0.56, 1.15);
  const stream = { z: zi, draw(ctx) {
    const pr = projector(ctx, zi); if (!pr) return; const s = pr.s, mnw = 0.9 / s, N = 34, bodyEnd = Math.min(reach, 0.78), brk = reach > 0.8;
    const cA = lit3(COL.coolMid, A.x, A.y, A.z, 0.1), body = mix(cA, [244, 148, 54], 0.92 * gg), deepC = mix(lit3(COL.coolDeep, A.x, A.y, A.z, 0.08), [150, 72, 26], 0.85 * gg), edgeC = mix(COL.coolHi, COL.hot, 0.35 + 0.65 * gg);
    const pts = [], hw = [], P3s = [];
    for (let i = 0; i <= N; i++) {
      const f = bodyEnd * i / N, p = pos(f), q = pr(p.x, p.y, p.z); if (!q) return; pts.push(q); P3s.push(p);
      let wv = w0 * neck(f) * (1 + 0.06 * Math.sin(f * 30 - t * 14)) * Math.sqrt(Math.min(1, f / 0.05 + 0.02));   // rounded at the lip
      if (reach < 0.999) wv *= Math.min(1, Math.sqrt(Math.max((reach - f) / 0.06, 0) + 0.04));                      // rounded head while falling
      if (brk) wv *= (1 - 0.5 * ss(0.62, 0.78, f)) * Math.min(1, Math.sqrt(Math.max((bodyEnd - f) / 0.05, 0) + 0.03));   // the neck pinches where it breaks into drops
      hw.push(Math.max(wv / 2 * pr.k(p.z), mnw * 0.7));
    }
    // translucent body; a gradient along the first strip makes it emerge from the lip instead of starting with a square end
    const ge = pts[Math.min(6, N)], fadeFill = (col, al) => { if (Math.hypot(ge[0] - pts[0][0], ge[1] - pts[0][1]) < 0.05) return rgba(col, al);
      const gr = ctx.createLinearGradient(pts[0][0], pts[0][1], ge[0], ge[1]); gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(1, rgba(col, al)); return gr; };
    ribbon(ctx, pts, hw); ctx.fillStyle = fadeFill(deepC, 0.55); ctx.fill();   // the outer flanks
    ribbon(ctx, pts, hw.map(v => v * 0.8)); ctx.fillStyle = fadeFill(body, 0.55); ctx.fill();
    ribbon(ctx, pts, hw.map(v => v * 0.3)); ctx.fillStyle = fadeFill([176, 78, 20], 0.34); ctx.fill();   // darker, more saturated core
    // two bright edge highlights and a light-carrying glow strip
    ctx.globalCompositeOperation = 'lighter';
    const e = ribbon(ctx, pts, hw.map(v => v * 0.9)); ctx.fillStyle = rgba(COL.amber, 0.16 * gg); ctx.fill();
    for (const side of [0, 1]) {
      const E2 = ribbon(ctx, pts, hw.map(v => v * 0.8)), L = side ? E2.Rp : E2.Lp;
      ctx.beginPath(); L.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.strokeStyle = rgba(edgeC, 0.5); ctx.lineWidth = Math.max(0.07 * w0 * pr.k(A.z), mnw * 0.8); ctx.stroke();
    }
    void e;
    // a travelling ripple: crescents sliding down the stream
    for (let m = 0; m < 6; m++) {
      const ph = fract(t * 1.1 + m / 6 + 0.1 * hash(m, 60)), i = Math.min(Math.floor(ph * N), N - 1); if (i < 3) continue;
      const a = pts[i], b = pts[Math.min(i + 2, N)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l, h = hw[i] * 0.86;
      ctx.beginPath(); ctx.moveTo(a[0] - nx * h, a[1] - ny * h); ctx.quadraticCurveTo(a[0] + tx / l * h * 1.1, a[1] + ty / l * h * 1.1, a[0] + nx * h, a[1] + ny * h);
      ctx.strokeStyle = rgba(COL.hot, 0.26 * (1 - ph * 0.5)); ctx.lineWidth = Math.max(0.06 * w0 * pr.k(A.z), mnw * 0.7); ctx.stroke();
    }
    // the lip: a soft meniscus bead
    const lp = pts[0], lr = Math.max(hw[Math.min(3, N)] * 1.7, 2); disc(ctx, lp[0], lp[1], lr, lr, COL.hot, 0.28 * Math.min(1, reach * 6));
    // the breakup: the last fifth of the fall is a chain of drops stretched along the fall
    if (brk) {
      const nd = 5;
      for (let j = 0; j < nd; j++) {
        const ph = fract(t * 1.3 + j / nd + 0.1 * hash(j, 62)), f = lerp(0.77, reach, Math.pow(ph, 0.85)), p = pos(f), q = pr(p.x, p.y, p.z), p2 = pos(Math.max(f - 0.02, 0)), q2 = pr(p2.x, p2.y, p2.z); if (!q || !q2) continue;
        const rr = Math.max(w0 * 0.5 * (0.7 - 0.25 * ph) * (0.7 + 0.3 * hash(j, 63)) * pr.k(p.z), mnw * 0.9), ang = Math.atan2(q[1] - q2[1], q[0] - q2[0]), ll = rr * (2.4 + 2.2 * ph + 1.2 * hash(j, 64));
        const ex = q[0] - Math.cos(ang) * ll * 0.55, ey = q[1] - Math.sin(ang) * ll * 0.55;   // a stretched teardrop: round head, long tail
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba(body, 0.6); ctx.beginPath(); ctx.ellipse(ex, ey, ll, rr * 0.8, ang, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(edgeC, 0.4); ctx.beginPath(); ctx.ellipse(ex + Math.sin(ang) * rr * 0.25, ey - Math.cos(ang) * rr * 0.25, ll * 0.7, rr * 0.2, ang, 0, TAU); ctx.fill();
        disc(ctx, ex, ey, ll * 1.4, rr * 2.2, COL.amber, 0.1 * gg);
      }
    }
    for (let j = 0; j < 8; j++) {   // small drops peeling off the neck
      const ph = fract(t * (1.2 + 0.5 * hash(j, 71)) + hash(j, 72)), f = lerp(0.3, 1, ph) * reach, p = pos(f), q = pr(p.x, p.y, p.z); if (!q) continue;
      const sd = (hash(j, 73) * 2 - 1) * (w0 * 0.8 + 1.2 * ph) * pr.k(p.z), r = Math.max((0.12 + 0.2 * hash(j, 74)) * pr.k(p.z), mnw * 0.8), al = 0.7 * (1 - ph * 0.6);
      ctx.strokeStyle = rgba(COL.amber, al * 0.5); ctx.lineWidth = r * 1.4; ctx.beginPath(); ctx.moveTo(q[0] + sd, q[1] - r * 3.4); ctx.lineTo(q[0] + sd, q[1]); ctx.stroke();
      ctx.fillStyle = rgba(COL.hot, al); ctx.beginPath(); ctx.arc(q[0] + sd, q[1], r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  } };
  const items = probes().concat([stream]);
  if (reach > 0.97) { const z2 = B.z - 0.4, pu = ss(0.22, 1, k) * (0.45 + 0.55 * amt);
    items.push({ z: z2, draw(ctx) { const pr = projector(ctx, z2); if (!pr) return; wetPatch(ctx, pr, B, 3.5 + 9 * pu, pu, g, Math.max(pr.elev(B.x, B.y, B.z), 0.2));
      for (let i = 0; i < 2; i++) splashDraw(ctx, pr, B, fract(t * 1.5 + i / 2), 0.7 + 0.8 * amt, 0.6 + 0.4 * amt, 50 + i * 7, g); } }); }
  return items;
};

// ---------------------------------------------------------------- motes and fireflies (drifting at varied depth so DOF blurs them)
// Motes live in world space and wrap around the camera box, so a moving camera gets parallax. Three kinds: crisp pinpoints,
// soft glows and big faint bokeh discs, each with its own warmth.
const wrapPos = (base, drift, center, period) => { const f = fract(base + (drift - center) / period); return [center + (f - 0.5) * period, Math.abs(f - 0.5) * 2]; };
fx.motes = function (st, cam, n = 40, warm = 1) {
  const t = num(st.t, 0), items = [], zr = 2300, wm = warm === true ? 1 : warm === false ? 0 : clamp(num(warm, 1));
  for (let i = 0; i < n; i++) {
    const h = k => hash(i, k + 200), vz = (h(9) - 0.5) * 7, dz = t * vz, zf = fract(h(1) + (dz - cam.z) / zr), z = cam.z + 90 + zf * zr, d = z - cam.z;
    const hx = d / cam.f * W / 2 * 1.2, hy = d / cam.f * H / 2 * 1.55;
    const [x0, ex] = wrapPos(h(2), Math.sin(t * 0.21 * (0.6 + h(7)) + h(8) * TAU) * 14 + t * (h(10) - 0.5) * 3, cam.x, hx * 2);
    const [y0, ey] = wrapPos(h(3), -t * (3 + 9 * h(4)), cam.y, hy * 2);
    // the garden's wind leans each mote and a gust lifts it a little (the same wind as the grass and flowers, see core.js)
    const x = x0 + P.wind(x0, z, t) * hx * 0.012 * (0.5 + h(15)), y = y0 - P.gust(x0, z, t) * hy * 0.02 * (0.5 + h(16));
    const fade = (1 - ss(0.8, 1, ex)) * (1 - ss(0.8, 1, ey)) * (1 - ss(0.86, 1, zf)) * ss(0, 0.04, zf);
    const kind = h(13) < 0.3 ? 0 : h(13) < 0.82 ? 1 : 2, rpx = kind === 0 ? 1.1 + 2.2 * h(5) : kind === 1 ? 2.4 + 6 * h(5) * h(5) : 7 + 10 * h(5);
    const col = mix([176, 206, 255], COL.gold, clamp(wm + 0.6 * (h(6) - 0.5))), mixw = mix(col, [255, 140, 60], 0.3 * h(14));
    items.push({ z, draw(ctx, s, tt) {
      // a mote brightens and warms as it passes a glow (the strongest light at its spot, read now, when the scene is being drawn); in moonlight
      // it stays a faint cool speck. The lights are continuous, so it swells in and out of a glow instead of switching on
      const nl = P.nearLight(x, y, z), gl = nl ? clamp(nl.k / 0.5) : 0, cc = mix(col, [255, 200, 116], 0.9 * gl), mc = mix(mixw, COL.hot, 0.6 * gl);
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(tt * (0.7 + 1.5 * h(11)) + h(12) * TAU)), r = rpx / s, a = fade * tw * 0.9 * (0.8 + 0.6 * gl); if (a < 0.02) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (kind === 0) { disc(ctx, x, y, r * 2.2, r * 2.2, cc, a * 0.5); disc(ctx, x, y, r * 0.9, r * 0.9, COL.white, a); }
      else if (kind === 1) { disc(ctx, x, y, r * 3.2, r * 3.2, cc, a * 0.55); disc(ctx, x, y, r * 1.4, r * 1.4, mc, a * 0.55); disc(ctx, x, y, r * 0.6, r * 0.6, COL.white, a * 0.85); }
      else {   // a bokeh disc: pale gold-cream body, a brighter rim and a small glowing heart, so out of focus it reads as light, not a smudge
        const bc = mix(cc, [255, 238, 204], 0.5);
        disc(ctx, x, y, r * 1.3, r * 1.3, bc, a * 0.3);
        disc(ctx, x, y, r * 0.85, r * 0.85, mix(bc, COL.white, 0.3), a * 0.3);   // a filled, softly brighter body (no outline: an outline reads as a hollow ring)
        disc(ctx, x, y, r * 0.45, r * 0.45, mix(bc, COL.white, 0.5), a * 0.35); }
      ctx.restore();
    } });
  }
  return items;
};
// fireflies: a dim body, a larger green-yellow lantern glow, slow looping paths with a short fading trail, and a little
// light on the grass beneath (plus a weak scene light, see fx.lights).
fx.fireflies = function (st, cam, n = 8) {
  const t = num(st.t, 0), items = []; FFARGS = { cam, n };
  for (let i = 0; i < n; i++) {
    const f0 = ffState(i, t, cam), z = f0.z;
    items.push({ z, draw(ctx, s, tt) {
      const f = ffState(i, tt, cam), r = (5 + 5 * f.h(16)) / s, nl = P.nearLight(f.x, f.y, f.z), gl = nl ? clamp(nl.k / 0.5) : 0;
      // the lantern takes a little amber near a glow (the light it passes is the same light), and stays lime in the dark
      const lime = mix(mix([150, 255, 60], [226, 255, 100], f.h(17)), [255, 196, 110], 0.4 * gl);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (f.on > 0.02) disc(ctx, f.x, 0, r * 11, r * 2.4, lime, 0.1 * f.on);   // the grass beneath warms with each pulse
      for (let j = 6; j >= 1; j--) { const q = ffState(i, tt - j * 0.16, cam), a = q.on * (1 - j / 7) * 0.5; if (a > 0.02) disc(ctx, q.x, q.y, r * (2.4 - j * 0.28), r * (2.4 - j * 0.28), lime, a); }
      if (f.on > 0.02) { disc(ctx, f.x, f.y, r * 9, r * 9, lime, 0.3 * f.on); disc(ctx, f.x, f.y, r * 3.6, r * 3.6, lime, 0.55 * f.on); disc(ctx, f.x, f.y, r * 1.2, r * 1.2, [236, 255, 170], 0.7 * f.on); }
      ctx.globalCompositeOperation = 'source-over';
      const bob = Math.sin(tt * 9 + f.h(18) * TAU) * r * 0.06, bc = [40, 34, 38];   // dim body: dark wing covers, small head, an abdomen that lights up
      ctx.fillStyle = rgba(bc, 0.92); ctx.beginPath(); ctx.ellipse(f.x - r * 0.25, f.y + bob, r * 0.62, r * 0.3, 0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(f.x - r * 0.95, f.y + bob - r * 0.05, r * 0.22, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(mix([120, 126, 52], [255, 244, 140], f.on), 0.75 + 0.25 * f.on); ctx.beginPath(); ctx.ellipse(f.x + r * 0.55, f.y + bob + r * 0.08, r * 0.34, r * 0.22, 0.2, 0, TAU); ctx.fill();
      ctx.restore();
    } });
  }
  return items;
};

// ---------------------------------------------------------------- v8 light builders: spill, shafts, bloom wave, spray (each returns items)
// spill(x, y, z, o): the warm pool a glow throws on the ground under it. (x, y, z) is the glow; the pool lies on the ground at its foot.
// o.rad: radius on the ground (default 60), o.k: strength 0..1 (default 0.5), o.col: colour (default warm amber). Drawn in the ground's
// own plane (projector), so it lies flat and foreshortens with the lens; it is additive, so it lightens what is already there.
fx.spill = function (x, y, z, o = {}) {
  const rad = num(o.rad, 60), k = clamp(num(o.k, 0.5), 0, 1.5), col = o.col || WARM_RAY;
  if (k < 0.01 || rad < 0.5) return [];
  const zg = z - 0.5;
  return probes().concat([{ z: zg, flat: true, draw(ctx) { const pr = projector(ctx, zg); if (!pr) return;
    const c = pr(x, 0, z), kk = pr.k(z), el = Math.max(pr.elev(x, 0, z), 0.12); if (pr.off(c[0], c[1], rad * kk * pr.s + 40)) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    disc(ctx, c[0], c[1], rad * kk, rad * kk * el, col, 0.13 * k);            // the wide faint pool
    disc(ctx, c[0], c[1], rad * 0.6 * kk, rad * 0.6 * kk * el, col, 0.16 * k); // a warmer middle
    disc(ctx, c[0], c[1], rad * 0.2 * kk, rad * 0.2 * kk * el, COL.hot, 0.14 * k); // the hot patch right under the glow
    ctx.restore(); } }]);
};
// shafts(st, cam, o): soft light shafts through the night air.
//   o.from: 'moon' (default) for a few wide, faint, cool shafts fanning down from the moon (projected through cam); or a world point
//   [x, y, z] for warm shafts fanning up from a glow (e.g. the trapped glow at the spout).
//   o.k: strength 0..1 (default 0.5). o.n: count (default 3 for the moon, 4 for a glow). o.z: depth of the moon shafts (default 2400, in
//   the air between the hills and the garden). o.h: height of a glow shaft (default 240), o.spread: its fan half-angle (default 0.5 rad).
// They breathe slowly and lean with P.gust. Each shaft is nested translucent wedges that thin toward the edges, never one hard stripe,
// and they are added on top only faintly, so a face is never veiled at full strength.
fx.shafts = function (st, cam, o = {}) {
  const t = num(st.t, 0), k = clamp(num(o.k, 0.5), 0, 1.5);
  if (k < 0.01) return [];
  if (o.from === undefined || o.from === 'moon') {
    // the shafts leave the moon itself (where world.js hangs it, seen through this camera), so a beam never starts above or beside it
    const n = Math.round(num(o.n, 3)), z = num(o.z, 2400), items = [], MN = (P.world && P.world.MOON) || fx.MOON, mp = cam && cam.f ? P.project(cam, MN.x, MN.y, MN.z) : [1440, -140];
    for (let i = 0; i < n; i++) {
      const h1 = hash(i, 501), h2 = hash(i, 502), h3 = hash(i, 503), h4 = hash(i, 504);
      const breathe = k * (0.7 + 0.3 * Math.sin(t * (0.22 + 0.1 * h4) + h1 * TAU)) * (0.7 + 0.5 * P.gust(i * 300, z, t));
      const lean = (P.gust(i * 300, z, t) - 0.5) * 70 + P.wind(i * 300, z, t) * 26;   // the wind moves the shafts a little across the sky
      const dx = -0.42 + 0.5 * (h1 - 0.5), dy = Math.sqrt(1 - dx * dx), sx = mp[0] + lean * 0.4 + 30 * (h2 - 0.5), sy = mp[1], L = 1500 + 300 * h3;
      const ex = sx + dx * L, ey = sy + dy * L, nx = -dy, ny = dx, w0 = 60 + 60 * h2, w1 = w0 * (3.2 + 1.4 * h4);   // wedge: narrow at the moon, wider down the air
      items.push({ z, screen: true, draw(ctx) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(sx, sy, ex, ey), C = [200, 220, 255];   // the beam is brightest where it leaves the moon's side and dies out down the air
        g.addColorStop(0, rgba(C, 0)); g.addColorStop(0.08, rgba(C, breathe * 0.9)); g.addColorStop(0.4, rgba(C, breathe * 0.5)); g.addColorStop(1, rgba(C, 0));   // (clear over the disc itself)
        ctx.fillStyle = g;
        for (let j = 0; j < 6; j++) { const f = 1 - j / 6;   // six nested wedges, each a little fainter: the edge steps down softly
          ctx.globalAlpha = 0.045;
          ctx.beginPath(); ctx.moveTo(sx + nx * w0 * f * 0.5, sy + ny * w0 * f * 0.5); ctx.lineTo(ex + nx * w1 * f * 0.5, ey + ny * w1 * f * 0.5);
          ctx.lineTo(ex - nx * w1 * f * 0.5, ey - ny * w1 * f * 0.5); ctx.lineTo(sx - nx * w0 * f * 0.5, sy - ny * w0 * f * 0.5); ctx.closePath(); ctx.fill(); }
        ctx.restore(); } });
    }
    return items;
  }
  // a glow's shafts: world-space fans in a card at the glow's depth (drawn by the same projector as the ground pieces, so they stand upright)
  const G = o.from, gz = G[2], H = num(o.h, 240), spread = num(o.spread, 0.5), n = Math.round(num(o.n, 4)), items = [];
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, 511), h2 = hash(i, 512), h3 = hash(i, 513);
    const ang = (n === 1 ? 0 : (i / (n - 1) * 2 - 1)) * spread + (h1 - 0.5) * 0.12 + 0.07 * (P.gust(G[0] + i * 60, gz, t) - 0.5);   // fan angle, drifting with the gust
    const breathe = k * (0.6 + 0.4 * Math.sin(t * (0.3 + 0.15 * h2) + h3 * TAU)), len = H * (0.8 + 0.25 * h2), tip = [G[0] + Math.sin(ang) * len, G[1] - Math.cos(ang) * len];
    const bx = Math.cos(ang), by = Math.sin(ang), wb = 5 + 3 * h1, wt = 34 + 18 * h3, z = gz + 1;
    items.push({ z, draw(ctx) {
      const g = ctx.createLinearGradient(G[0], G[1], tip[0], tip[1]); g.addColorStop(0, rgba(WARM_RAY, 0.9 * breathe)); g.addColorStop(0.5, rgba(WARM_RAY, 0.35 * breathe)); g.addColorStop(1, rgba(WARM_RAY, 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;   // the gradient carries the fade along the shaft; the nested wedges step the edge down softly
      for (let j = 0; j < 3; j++) { const f = 1 - j / 3;
        ctx.beginPath(); ctx.moveTo(G[0] - bx * wb * f, G[1] - by * wb * f * 0.2); ctx.lineTo(tip[0] - bx * wt * f, tip[1] - by * wt * f * 0.2); ctx.lineTo(tip[0] + bx * wt * f, tip[1] + by * wt * f * 0.2); ctx.lineTo(G[0] + bx * wb * f, G[1] + by * wb * f * 0.2); ctx.closePath();
        ctx.globalAlpha = 0.09 * (1 - 0.3 * j); ctx.fill(); }
      ctx.restore(); } });
  }
  return probes().concat(items);
};
// Depth-binned soft light: the bloom wave and the spray are made of many small soft pieces at their own world depths. They are sorted into thin
// slices of depth, one item per slice, so the near part of a ring or a fan is drawn in front of a plant that stands behind it and the far part
// behind a nearer plant, and every piece is drawn just in front of whatever stands at its own depth (so a blade or a stone the light reaches is
// washed by it). Each piece is a unit soft disc (FALL) mapped onto an ellipse by two projected axis vectors, so it lies flat on the ground,
// stands upright, or foreshortens with the lens exactly as the world does. One gradient per colour per slice, reused under globalAlpha.
const softGrad = (ctx, col) => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); for (const [o, k] of FALL) g.addColorStop(o, rgba(col, k)); return g; };
// an ellipse with centre c and half axes along (a - c) and (b - c), all already projected into the item's plane
function softEllipse(ctx, g, c, a, b, al) {
  if (al < 0.004 || !c || !a || !b) return;
  const ax = a[0] - c[0], ay = a[1] - c[1], bx = b[0] - c[0], by = b[1] - c[1]; if (Math.abs(ax * by - ay * bx) < 1e-4) return;
  ctx.save(); ctx.transform(ax, ay, bx, by, c[0], c[1]); ctx.globalAlpha = Math.min(1, al); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
}
// bins(pieces, width, draw): one item per slice of depth (width world units). Each piece carries its world z; the slice's item sits just in front of
// the nearest piece in it. draw(ctx, pr, list) paints one slice.
function depthItems(pieces, width, draw, zBias = 1.5) {
  const B = new Map();
  for (const p of pieces) { const k = Math.floor(p.z / width); let b = B.get(k); if (!b) { b = { z: Infinity, list: [] }; B.set(k, b); } b.list.push(p); if (p.z < b.z) b.z = p.z; }
  const items = [];
  for (const b of B.values()) { const zi = b.z - zBias; items.push({ z: zi, flat: true, draw(ctx) { const pr = projector(ctx, zi); if (pr) draw(ctx, pr, b.list); } }); }
  return items;
}

// bloomWave(x, z, k, o): a wave of light that runs out through the garden from (x, ground, z) when a flower relights; k 0..1 over its life.
// The front is a soft bright band of warm light lying in the grass and standing up through it a little (grass height), its radius wobbling with
// P.noise and brighter in clumps, as if more stood up into it there; behind it a long glowing tail falls away toward the centre, and inside that the
// ground keeps a faint warmth (the garden is a little warmer than before it came). Ahead of the front there is nothing. Blades of grass catch it as
// it passes (thin warm strokes that flare and fade), and small warm sparkles lift off behind the front, drift on the wind and fade. All of it is
// additive light, depth-sorted into thin slices (see depthItems), never an outline and never an opaque fill: the turf, grass, small plants and
// stones it reaches simply get brighter and warmer for a moment. It slows as it spreads (a ripple), and fades over the last fifth of k.
//   o.rad: final radius in world units (default 240). o.strength: overall brightness 0..1.5 (default 1). o.col: front colour (default a hot amber).
//   o.height: how high the light stands up through the grass (default 14). o.tail: tail length as a share of rad (default 0.5).
//   o.warmth: the warmth left inside 0..1 (default 0.3). o.wobble: how much the front's radius wanders (default 0.09).
//   o.glints: grass blades that catch it (default 240). o.sparks: sparkles lifting behind it (default 80). o.y: ground height (default 0).
//   o.t: seconds, for the wind on the sparkles (default 3 k). o.seed: varies the wobble, glints and sparkles (default 0).
fx.bloomWave = function (x, z, k, o = {}) {
  k = clamp(num(k, 0));
  const env = ss(0, 0.04, k) * (1 - ss(0.8, 1, k)); if (env < 0.01) return [];
  const rad = num(o.rad, 240), AL = clamp(num(o.strength, 1), 0, 1.5), y0 = num(o.y, 0), HT = num(o.height, 14), seed = num(o.seed, 0), t = num(o.t, 3 * k);
  const tailL = rad * num(o.tail, 0.5), warmth = clamp(num(o.warmth, 0.3)), wob = num(o.wobble, 0.09), NG = Math.round(num(o.glints, 240)), NS = Math.round(num(o.sparks, 80));
  const frontC = o.col || mix(COL.amber, COL.hot, 0.35), tailC = mix(WARM_RAY, COL.amber, 0.5), deepC = WARM_RAY;   // amber, never cream: added to green turf it stays warm
  const RK = kk => rad * (1 - Math.pow(1 - kk, 1.7)), R = RK(k);   // the front: fast out of the flower, slowing as it spreads
  if (R < 0.5) return [];
  const fade = env * (1 - 0.25 * k) * AL;   // the front dims a little as it spreads
  // the front's radius at angle th (periodic in th, so the ring closes) and how bright it is there
  const sd = seed * 13.1, wobAt = th => 0.5 * P.noise(2.6 * Math.cos(th) + 2.4 * k + sd, 611) + 0.3 * P.noise(2.6 * Math.sin(th) - 1.7 * k + sd, 612) + 0.2 * P.noise(7 * Math.cos(th) + 4 * Math.sin(th) + 3 * k + sd, 614);
  const clumpAt = th => 0.42 + 0.58 * clamp(0.5 + 0.7 * (0.6 * P.noise(4.3 * Math.cos(th) + 1.3 * Math.sin(th) + sd + 0.8 * k, 613) + 0.4 * P.noise(9 * Math.sin(th) + 2 * Math.cos(th) + sd - k, 615)));
  const Rth = th => R * (1 + wob * wobAt(th) * ss(0, 0.06, k));
  // tail layers: distance behind the front (share of tailL; negative = the soft fall-off just ahead of it), brightness, and the colour they take
  const LAY = [[-0.05, 0.2, 0, 0.085], [0, 0.85, 0, 0.13], [0.09, 0.6, 0, 0.11], [0.18, 0.36, 1, 0.11], [0.3, 0.2, 1, 0.12], [0.44, 0.11, 1, 0.14], [0.6, 0.065, 2, 0.16], [0.79, 0.04, 2, 0.18], [1, 0.026, 2, 0.2]];   // (the pieces overlap about five deep, so these are small)
  const N = 60, pieces = [], TL = Math.min(tailL, R * 0.85);   // early on the tail is as long as the wave has run
  for (let j = 0; j < LAY.length; j++) {
    const [dj, aj, cj, ww] = LAY[j], step = j >= 6 ? 2 : 1, wj = Math.max(TL, tailL * 0.4) * ww;
    for (let i = 0; i < N; i += step) {
      const th = (i + 0.5 + 0.37 * seed) / N * TAU, r = Rth(th) - dj * TL; if (r < 1) continue;
      const a = aj * fade * (j <= 2 ? clumpAt(th) : 0.75 + 0.25 * clumpAt(th)) * (1 - ss(0.8 * R, R, R - r) * (j > 0 ? 0.6 : 0));
      if (a < 0.006) continue;
      const c = Math.cos(th), s = Math.sin(th), hl = r * Math.PI / N * step * 2.6;   // half length 1.3 times the spacing: neighbours overlap enough that no bead shows
      // sorted at its nearest edge (the ground it covers nearest the lens), so the turf under its near half is drawn before it, not over it
      pieces.push({ kind: 0, z: z + s * r - Math.abs(s) * wj * 2.6 - Math.abs(c) * hl, x: x + c * r, zc: z + s * r, c, s, hl, w: wj, a, col: cj, up: j <= 3 ? [0.5, 1, 0.75, 0.4][j] * clumpAt(th) : 0 });
    }
  }
  // the warmth that stays inside the tail: a few wide, faint pieces over the ground already passed
  const Rin = R - tailL; if (Rin > 4 && warmth > 0.01) for (const f of [0.3, 0.62, 0.9]) { const r = Rin * f, n = Math.max(6, Math.round(N * f / 3));
    for (let i = 0; i < n; i++) { const th = (i + 0.5) / n * TAU + f, c = Math.cos(th), s = Math.sin(th); const hl = r * Math.PI / n * 1.5, w = Rin * 0.22; pieces.push({ kind: 0, z: z + s * r - Math.abs(s) * w * 2.6 - Math.abs(c) * hl, zc: z + s * r, x: x + c * r, c, s, hl, w, a: 0.025 * warmth * fade / 0.3, col: 2, up: 0 }); } }
  // grass blades that catch the front as it passes: each lights when the front reaches it, flares and fades over the tail
  for (let g = 0; g < NG; g++) {
    const h1 = hash(g, 621 + seed), h2 = hash(g, 622 + seed), h3 = hash(g, 623 + seed), th = h1 * TAU, r = rad * (0.06 + 0.94 * Math.sqrt(h2)), behind = Rth(th) - r;
    if (behind < -tailL * 0.02 || behind > tailL * 0.6) continue;
    const u = behind / (tailL * 0.6), a = fade * (u < 0.05 ? ss(-0.03, 0.05, u) : Math.exp(-(u - 0.05) * 5.5)) * (0.55 + 0.45 * h3) * (0.6 + 0.6 * clumpAt(th));
    if (a < 0.02) continue;
    pieces.push({ kind: 1, z: z + Math.sin(th) * r, x: x + Math.cos(th) * r, hb: 5 + 8 * h3, lean: (h1 - 0.5) * 2.4 + 2.2 * P.wind(x + Math.cos(th) * r, z + Math.sin(th) * r, t), a });
  }
  // sparkles: each is born as the front passes its spot, lifts on the warm air, drifts with the wind, twinkles and fades
  for (let i = 0; i < NS; i++) {
    const h1 = hash(i, 631 + seed), h2 = hash(i, 632 + seed), h3 = hash(i, 633 + seed), h4 = hash(i, 634 + seed), rs = rad * (0.08 + 0.86 * h2);
    const kb = 1 - Math.pow(Math.max(1 - rs / rad, 0), 1 / 1.7) + 0.02 * h3, life = 0.24 + 0.16 * h4, age = (k - kb) / life; if (age <= 0 || age >= 1) continue;
    const th = h1 * TAU, rr = rs - 3 - 6 * age, px = x + Math.cos(th) * rr, pz = z + Math.sin(th) * rr, py = y0 - 3 - HT * 0.3 - (10 + 26 * h3) * Math.pow(age, 0.8);
    const tw = 0.6 + 0.4 * Math.sin(t * (7 + 6 * h4) + h1 * 40), a = env * AL * Math.pow(Math.sin(Math.PI * Math.pow(age, 0.6)), 1.2) * tw;
    pieces.push({ kind: 2, z: pz, x: px + 5 * P.wind(px, pz, t) * age, y: py, r: 1.0 + 1.5 * h3 * h3, a, rot: h1 * TAU + age * 2 });
  }
  const items = depthItems(pieces, Math.max(rad / 18, 6), (ctx, pr, list) => {
    const G = [softGrad(ctx, frontC), softGrad(ctx, tailC), softGrad(ctx, deepC)], mnw = 0.9 / pr.s;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const p of list) {
      if (p.kind === 0) {   // a piece of the ring: flat on the ground, and (front layers) a low glow standing up through the grass
        const Z = p.zc, c = pr(p.x, y0, Z); if (!c || pr.off(c[0], c[1], 400)) continue;
        // seen from low the band on the ground foreshortens to a hairline, so it is widened as the view grazes (it must read, not be exact)
        const w = p.w * (1 + 0.9 * (1 - clamp(pr.elev(p.x, y0, Z) / 0.4))), ta = pr(p.x - p.s * p.hl, y0, Z + p.c * p.hl);
        softEllipse(ctx, G[p.col], c, ta, pr(p.x + p.c * w, y0, Z + p.s * w), p.a * 0.4);
        if (p.up > 0.01 && ta) {   // the light standing up through the grass: brightest low, fading upward. Where the ring runs along the view (its
          // sides seen from low) it would stand edge-on as a tall pillar, so it fades out there and the band on the ground carries it
          const u = pr(p.x, y0 - HT * 0.25, Z), v = pr(p.x, y0 - HT, Z); if (!u || !v) continue;
          const hp = Math.hypot(v[0] - u[0], v[1] - u[1]), ax = ta[0] - c[0], ay = ta[1] - c[1], face = clamp(Math.abs(ax) / Math.max(1.4 * hp, 1e-6));
          const big = 1 - 0.9 * ss(30, 100, hp * pr.s);   // right by the lens a curtain of light this tall would veil the frame: it thins there
          softEllipse(ctx, G[p.col], u, [u[0] + ax, u[1] + ay], v, p.a * 0.36 * p.up * face * face * big);
        }
      } else if (p.kind === 1) {   // a blade catching the light: a thin warm stroke brightest toward its tip
        const b = pr(p.x, y0, p.z), tp = pr(p.x + p.lean, y0 - p.hb, p.z); if (!b || !tp) continue; const kk = pr.k(p.z);
        const near = 1 - ss(30, 64, Math.hypot(tp[0] - b[0], tp[1] - b[1]) * pr.s); if (near < 0.02) continue;   // a blade right by the lens would be a long scratch: leave it out
        ctx.globalAlpha = near; ctx.strokeStyle = rgba(tailC, p.a * 0.32); ctx.lineWidth = Math.max(1.1 * kk, mnw * 2.2); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(tp[0], tp[1]); ctx.stroke();
        const mx = lerp(b[0], tp[0], 0.45), my = lerp(b[1], tp[1], 0.45);
        ctx.strokeStyle = rgba(COL.hot, p.a * 0.7); ctx.lineWidth = Math.max(0.36 * kk, mnw * 1.1); ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tp[0], tp[1]); ctx.stroke(); ctx.globalAlpha = 1;
      } else {   // a sparkle: a soft warm halo and a hot core, a faint four-point glint on the brightest
        const q = pr(p.x, p.y, p.z); if (!q) continue; const r = Math.max(p.r * pr.k(p.z), 1.3 / pr.s);
        disc(ctx, q[0], q[1], r * 3.4, r * 3.4, COL.amber, p.a * 0.32); disc(ctx, q[0], q[1], r * 1.1, r * 1.1, COL.hot, p.a * 0.9);
        if (p.r > 1.6) twinkle(ctx, q[0], q[1], r * 0.9, COL.gold, p.a * 0.5, p.rot);
      }
    }
    ctx.restore();
  });
  return probes().concat(items);
};
// spray(x, y, z, k, o): water bursting out of a gap at (x, y, z), thrown along o.dir; k 0..1 over its life (o.dur seconds, default 1.6).
// Four parts, depth-sorted into thin slices (see depthItems) so each sits in the scene at its own depth:
//  (1) the foamy fan: dense white-teal froth torn off the jet in the first moments, many small soft lumps flung out along the fan that spread,
//      slow and break up;
//  (2) the mist body: soft puffs that bloom out of the fan, hang a moment, drift on the wind and thin away; lit from behind by the light the
//      water carries, so warm near the source and cool blue-green further out (additive, low);
//  (3) droplets of mixed size (mostly small) on real ballistic arcs under gravity, launched over the first part of the burst at a spread of
//      speeds, so they never move as one shell; each is a teal body stretched along its speed with a bright rim toward the source (warm close to
//      it, pale cool further out), and each lands: a tiny flash and ring where it meets the ground, then it is gone;
//  (4) a warm burst of light at the gap itself in the first moments.
//   o.dir: [dx, dz] main direction on the ground (default [0.6, 0.8]); o.spread: fan half-angle in radians (default 0.9); o.n: droplets (default
//   200); o.h: peak height of a typical drop (default 40); o.reach: horizontal reach of a typical drop (default 60); o.scale: size factor
//   (default 1); o.mist: mist puffs (default 26); o.foam: froth lumps (default 140); o.ground: ground height (default 0); o.dur: seconds the k
//   range stands for (default 1.6); o.t: seconds, for the wind and the flicker (default k * dur); o.glow: 0..1 how much warm light the water
//   carries (default 1); o.seed.
fx.spray = function (x, y, z, k, o = {}) {
  k = clamp(num(k, 0));
  const env = 1 - ss(0.8, 1, k); if (k <= 0.003 || env < 0.005) return [];
  const sc = num(o.scale, 1), N = Math.round(num(o.n, 200)), H = num(o.h, 40) * sc, reach = num(o.reach, 60) * sc, spread = num(o.spread, 0.9), NM = Math.round(num(o.mist, 26)), NF = Math.round(num(o.foam, 140));
  const dur = num(o.dur, 1.6), S = k * dur, t = num(o.t, S), gy = num(o.ground, 0), gl = clamp(num(o.glow, 1)), seed = num(o.seed, 0);
  const dir = o.dir || [0.6, 0.8], base = Math.atan2(dir[1], dir[0]);
  // a typical drop rises H and lands reach away: gravity from a peak at 0.3 s, so the whole arc takes about 0.7 s
  const TP = 0.3, G = 2 * H / (TP * TP), VY = G * TP, VH = reach * G / (VY + Math.sqrt(VY * VY + 2 * G * Math.max(gy - y, 0)));
  const warmAt = d => gl * Math.exp(-d / (reach * 0.45));   // the light the water carries: warm close to the gap, gone a reach or so away
  const pieces = [];
  // (3) droplets
  for (let d = 0; d < N; d++) {
    const h1 = hash(d, 531 + seed), h2 = hash(d, 532 + seed), h3 = hash(d, 533 + seed), h4 = hash(d, 534 + seed), h5 = hash(d, 535 + seed);
    const t0 = 0.5 * dur * h1 * h1, age = S - t0; if (age <= 0) continue;   // most are thrown at the start, a few keep coming
    const ang = base + (h3 * 2 - 1) * spread * (0.5 + 0.5 * h5), sp = VH * (0.35 + 1.0 * h2), vy = VY * (0.15 + 0.95 * h4 * h4) * (1 - 0.3 * h1);   // mostly flung out, a few lobbed high
    const r = (h5 < 0.65 ? 0.22 + 0.22 * h4 : h5 < 0.92 ? 0.45 + 0.3 * h2 : 0.8 + 0.5 * h3) * sc;   // mostly small, a few large
    const tl = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(gy - y, 0))) / G;   // when it lands
    const ca = Math.cos(ang), sa = Math.sin(ang), at = a => [x + ca * sp * a, y - vy * a + 0.5 * G * a * a, z + sa * sp * a];
    if (age < tl) { const p = at(age), q = at(Math.max(age - 0.03, 0)), dist = Math.hypot(p[0] - x, p[2] - z);
      pieces.push({ kind: 3, x: p[0], y: p[1], z: p[2], px: q[0], py: q[1], pz: q[2], r, a: env * ss(0, 0.04, age) * (0.75 + 0.25 * h3), w: warmAt(dist), big: h5 >= 0.92 }); }
    else if (age < tl + 0.25) { const p = at(tl), u = (age - tl) / 0.25; pieces.push({ kind: 4, x: p[0], y: gy, z: p[2], r: r * (1.5 + 4 * u), a: env * (1 - u) * (1 - u), w: warmAt(Math.hypot(p[0] - x, p[2] - z)) }); }
  }
  // (1) froth torn off the jet: white water flung out in a dense fan at the jet's height, spreading up and down as it goes, slowed hard by the
  //     air (so it piles up and blooms instead of flying off), sinking, swelling and breaking up; most of it in the first half second
  for (let f = 0; f < NF; f++) {
    const h1 = hash(f, 541 + seed), h2 = hash(f, 542 + seed), h3 = hash(f, 543 + seed), h4 = hash(f, 544 + seed), h5 = hash(f, 545 + seed);
    const t0 = 0.3 * dur * h1 * h1, age = S - t0, life = 0.3 + 0.4 * h4; if (age <= 0 || age >= life) continue;
    const ang = base + (h3 * 2 - 1) * spread * 0.8, v0 = VH * (0.6 + 1.1 * h2), dg = 3.2, e = (1 - Math.exp(-dg * age)) / dg, dd = v0 * e;
    const fp = a => { const e = (1 - Math.exp(-dg * a)) / dg; return [x + Math.cos(ang) * v0 * e, Math.min(gy - 0.8, y - VY * (h5 * 1.3 - 0.35) * e + 0.25 * G * a * a), z + Math.sin(ang) * v0 * e]; };
    const [px, py, pz] = fp(age), pv = fp(Math.max(age - 0.05, 0));
    const u = age / life; pieces.push({ kind: 1, id: f + 97 * seed, x: px, y: py, z: pz, pv, r: (1.0 + 2.2 * h2 * h2) * sc * (0.7 + 1.1 * Math.sqrt(u)), a: env * ss(0, 0.05, age) * Math.pow(1 - u, 1.1) * (0.65 + 0.35 * h3), w: warmAt(dd) });
  }
  // (2) mist: blooms out along the fan, hangs, drifts on the wind and thins; centred a little behind the drops' reach
  for (let m = 0; m < NM; m++) {
    const h1 = hash(m, 551 + seed), h2 = hash(m, 552 + seed), h3 = hash(m, 553 + seed), h4 = hash(m, 554 + seed);
    const t0 = 0.3 * dur * h1, age = S - t0, life = 0.7 * dur + 0.3 * dur * h4; if (age <= 0 || age >= life) continue;
    const u = age / life, ang = base + (h3 * 2 - 1) * spread * 0.85, dd = reach * (0.15 + 0.8 * h2) * (1 - Math.exp(-age / 0.25));
    let px = x + Math.cos(ang) * dd, pz = z + Math.sin(ang) * dd; px += 10 * sc * P.wind(px, pz, t) * u;
    const py = Math.min(gy - 2, y - H * (0.15 + 0.5 * h4) * (1 - Math.exp(-age / 0.3)) + H * 0.15 * u);
    pieces.push({ kind: 2, x: px, y: py, z: pz, r: (8 + 10 * h2) * sc * (0.5 + 1.1 * Math.sqrt(u)), a: env * ss(0, 0.12, u) * Math.pow(1 - u, 1.4), w: warmAt(dd) });
  }
  // (4) the burst of light at the gap
  const fl = gl * env * Math.exp(-S / 0.35) * ss(0, 0.04, S); if (fl > 0.01) pieces.push({ kind: 5, x, y, z: z - 1, a: fl });
  const items = depthItems(pieces, Math.max(reach / 8, 4), (ctx, pr, list) => {
    // the palette is read here, while this frame's scene is the one being drawn (read when the items are built it would be the last frame's)
    const mnw = 0.9 / pr.s, wp = waterPal(x, y, z, true), body = mix(wp.body, wp.mid, 0.4), pale = mix(wp.glintHi, COL.white, 0.25), foam = mix(wp.foam, COL.white, 0.2);
    ctx.save(); ctx.lineCap = 'round';
    for (const p of list) {
      const q = pr(p.x, p.y, p.z); if (!q) continue; const kk = pr.k(p.z);
      if (p.kind === 3) {   // a drop, seen against the dark and lit from behind: mostly a bright speck (warm near the gap, pale blue-green further
        // out) with a short soft trail along its flight; a large one also shows a translucent teal body with the bright rim on it
        const q0 = pr(p.px, p.py, p.pz); if (!q0) continue; const r = Math.max(p.r * kk, mnw * 0.7), vx = q[0] - q0[0], vy = q[1] - q0[1], sp = Math.hypot(vx, vy);
        const rimC = mix(mix(pale, wp.glint, 0.45), COL.hot, 0.9 * p.w), tl = Math.min(sp, r * 4) / Math.max(sp, 1e-6);
        if (p.big) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba(body, p.a * 0.55); ctx.beginPath(); ctx.arc(q[0], q[1], r * 1.15, 0, TAU); ctx.fill(); }
        ctx.globalCompositeOperation = 'lighter';
        if (sp > r * 1.5) { ctx.strokeStyle = rgba(rimC, p.a * 0.14); ctx.lineWidth = r * 1.1; ctx.beginPath(); ctx.moveTo(q[0] - vx * tl, q[1] - vy * tl); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
        disc(ctx, q[0], q[1], r * 2.4, r * 2.4, rimC, p.a * 0.3);
        ctx.fillStyle = rgba(mix(rimC, COL.white, 0.25), p.a * 0.85); ctx.beginPath(); ctx.arc(q[0] + (p.big ? r * 0.35 : 0), q[1] - (p.big ? r * 0.35 : 0), r * (p.big ? 0.45 : 0.6), 0, TAU); ctx.fill();
      } else if (p.kind === 1) {   // a clump of froth: a few white lobes with a firm, soft-shouldered edge (not a haze) over a shaded teal underside;
        // warm where the light inside the water is strong
        // the clump is drawn stretched along its flight (spume thrown out, not a puff of smoke)
        const r = Math.max(p.r * kk, mnw * 1.2), wc = mix(mix(foam, wp.glintHi, 0.25), [255, 228, 176], 0.5 * p.w), sh = mix(wp.mid, wp.body, 0.45), q0 = pr(p.pv[0], p.pv[1], p.pv[2]) || q;
        const vx = q[0] - q0[0], vy = q[1] - q0[1], st = 1 + Math.min(Math.hypot(vx, vy) / (r * 1.5), 1.6);
        ctx.globalCompositeOperation = 'source-over'; ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(Math.atan2(vy, vx));
        for (let j = 0; j < 3; j++) { const ox = (hash(p.id, 561 + j) - 0.5) * r * 1.6 * st, oy = (hash(p.id, 564 + j) - 0.5) * r * 0.9, rr = r * (0.55 + 0.45 * hash(p.id, 567 + j));
          lobe(ctx, ox, oy + rr * 0.3, rr * 1.1 * st, rr * 0.85, sh, p.a * 0.45); lobe(ctx, ox, oy, rr * st, rr * 0.75, wc, p.a * 0.85); }
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        if (p.w > 0.05) disc(ctx, q[0], q[1], r * 2, r * 1.6, COL.amber, p.a * 0.28 * p.w);
      } else if (p.kind === 2) {   // a mist puff: additive, warm close to the gap, blue-green further out
        const r = p.r * kk; ctx.globalCompositeOperation = 'lighter';
        disc(ctx, q[0], q[1], r, r * 0.72, mix(mix(wp.glint, wp.mid, 0.5), [255, 196, 118], 0.75 * p.w), p.a * 0.36);
        disc(ctx, q[0], q[1], r * 0.55, r * 0.42, mix(pale, [255, 214, 150], 0.8 * p.w), p.a * 0.22);
      } else if (p.kind === 4) {   // a landing: a small flash and a flattened ring of foam
        const r = Math.max(p.r * kk, mnw), el = Math.max(pr.elev(p.x, p.y, p.z), 0.18); ctx.globalCompositeOperation = 'lighter';
        ringGlow(ctx, q[0], q[1], r, r * el, mix(pale, COL.hot, 0.6 * p.w), p.a * 0.5, 0.55);
        disc(ctx, q[0], q[1], r * 0.4, r * 0.4 * el, pale, p.a * 0.4);
      } else if (p.kind === 5) {   // the light let out of the gap
        ctx.globalCompositeOperation = 'lighter';
        disc(ctx, q[0], q[1], 30 * sc * kk, 22 * sc * kk, COL.amber, p.a * 0.2); disc(ctx, q[0], q[1], 10 * sc * kk, 8 * sc * kk, COL.hot, p.a * 0.22);
      }
    }
    ctx.restore();
  });
  return probes().concat(items);
};
// ---------------------------------------------------------------- moth silhouette (far)
// One opaque dark shape (broad triangular forewings, small hindwings, feathery antennae, flap shown by foreshortening) with a
// faint moonlit rim on its upper edge. Opaque parts never double up; fading (o.alpha) composites the finished shape once.
const MOTHT = P.off(200, 200), MOTHX = MOTHT.getContext('2d');
function mothShape(c, fxs, lift, col, flip) {
  c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'round';
  for (const sd of [1, -1]) {
    c.save(); c.scale(sd, 1);
    c.beginPath(); c.moveTo(1.1, -3.6); c.bezierCurveTo(7 * fxs, -11.5 - lift * 0.4, 17 * fxs, -12.5 - lift * 0.8, 25 * fxs, -9 - lift); c.bezierCurveTo(22 * fxs, -3 - lift * 0.7, 16 * fxs, 3 - lift * 0.2, 9 * fxs, 4.2); c.bezierCurveTo(5 * fxs, 4.6, 2.5, 3.2, 1.1, 2.4); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(1, 1.4); c.bezierCurveTo(6 * fxs, 0.8 - lift * 0.2, 12 * fxs, 2.2 - lift * 0.3, 12.5 * fxs, 6.5 - lift * 0.1); c.bezierCurveTo(10 * fxs, 11.5, 5 * fxs, 11, 1, 6); c.closePath(); c.fill();
    c.lineWidth = 0.42; c.beginPath(); c.moveTo(0.7, -6.2); c.quadraticCurveTo(3.4, -10.4, 6.8, -11.6); c.stroke();   // feathery antenna: shaft plus barbs
    for (let j = 0; j < 6; j++) { const u = (j + 1) / 7, px = lerp(0.7, 6.8, u) + 0.4 * Math.sin(u * 3), py = lerp(-6.2, -11.6, u) + 0.3; c.lineWidth = 0.28; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 0.4, py - 1.5 + 0.4 * u); c.moveTo(px, py); c.lineTo(px + 1.3, py + 0.4); c.stroke(); }
    c.restore();
  }
  c.beginPath(); c.ellipse(0, 1.2, 1.75, 5.6, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(0, -5, 1.75, 0, TAU); c.fill();
  void flip;
}
fx.moth = function (x, y, z, t, o = {}) {
  const sc = num(o.scale, 1), alpha = num(o.alpha, 1);
  return [{ z, draw(ctx, s) {
    const th = 0.95 * Math.sin(t * TAU * 4.6), fxs = 0.32 + 0.68 * Math.abs(Math.cos(th)), lift = Math.sin(th) * 6, bob = Math.sin(t * 2.3) * 1.2 * sc;
    const col = rgba(lit3([30, 26, 62], x, y, z, 0.05), 1), rim = rgba(mix(lit3([30, 26, 62], x, y, z, 0.05), [168, 152, 238], 0.7), 1);
    const paint = c => { mothShape(c, fxs, lift, rim); c.save(); c.translate(-0.55, 0.8); mothShape(c, fxs, lift, col); c.restore(); };
    if (alpha >= 0.999) { ctx.save(); ctx.translate(x, y + bob); ctx.scale(sc, sc); paint(ctx); ctx.restore(); return; }
    const px = clamp(s * sc, 0.6, 3.4);
    MOTHX.setTransform(1, 0, 0, 1, 0, 0); MOTHX.clearRect(0, 0, 200, 200); MOTHX.setTransform(px, 0, 0, px, 100, 100); paint(MOTHX);
    ctx.save(); ctx.globalAlpha = clamp(alpha); ctx.drawImage(MOTHT, 0, 0, 200, 200, x - 100 / px * sc, y + bob - 100 / px * sc, 200 / px * sc, 200 / px * sc); ctx.restore();
  } }];
};

// ---------------------------------------------------------------- puff (breath, dust), sparkle, pebble
// puff / sparkle: k is one-shot progress 0..1 (nothing outside that range).
// puff builds a cloud from many low-alpha soft blobs with broken edges that expand, drift up, curl and fade to nothing, lit by
// the dusk and backlit from the nearest warm light. kind: 'breath' (cool, thin, quick) or 'dust' (sandy, denser, slower);
// by default it is breath when y is above the ground (y < -25) and dust otherwise. o: scale, up, col, n, seed, kind, life.
// Dust hugs the ground: it spreads sideways to both sides in low, flattened lobes, barely rises (up 2.5), and is gone by k = life
// (default 0.6, so a 0.9 s puff fades in about half a second); it never billows up over a character's hips.
const PUFFALL = [[0, 1], [0.5, 0.95], [0.72, 0.74], [0.86, 0.34], [0.95, 0.08], [1, 0]];   // a puffy lobe: a plateau with a soft shoulder, not a smear
function lobe(ctx, x, y, rx, ry, col, a) {
  if (a < 0.004 || rx < 0.04) return; const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [o, k] of PUFFALL) g.addColorStop(o, rgba(col, a * k));
  ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
}
fx.puff = function (x, y, z, k, o = {}) {
  if (!(k > 0 && k < 1)) return [];
  const kind = o.kind || (y < -25 ? 'breath' : 'dust'), br = kind === 'breath', sc = num(o.scale, 1), up = num(o.up, br ? 6 : 2.5), seed = num(o.seed, 0), dir = num(o.dir, 1) < 0 ? -1 : 1, life = clamp(num(o.life, br ? 1 : 0.6), 0.1, 1);
  const col = o.col || (br ? [208, 220, 242] : [196, 178, 152]), n = num(o.n, br ? 10 : 15);
  return [{ z: z - 0.5, draw(ctx) {
    const kl = clamp(k / life), e = Math.pow(br ? k : kl, br ? 0.55 : 0.45), fade = br ? Math.pow(1 - k, 1.8) * ss(0, 0.06, k) : Math.pow(1 - kl, 1.6) * ss(0, 0.05, kl), base = lit3(col, x, y - 4, z, 0.22), nw = nearestWarm(x, y - 4, z);
    let bx = 0, by = 0; if (nw) { const dx = nw.L.x - x, dy = nw.L.y - (y - 4), l = Math.hypot(dx, dy) || 1; bx = dx / l; by = dy / l; }
    const hi = mix(base, [255, 246, 232], 0.34), lo = mix(base, [18, 22, 56], 0.5), warmC = [255, 188, 112], wf = nw ? Math.min(1, nw.f * 1.7) : 0;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const h = j => hash(i, j + 500 + seed), a = -Math.PI * (0.05 + 0.9 * h(1)) + (h(2) - 0.5) * 0.35, ee = clamp(e * (0.7 + 0.5 * h(9)));
      let cx, cy, rx, ry;
      if (br) {   // a breath: a soft plume blown forward, wisps stretched along the blow
        const d = (4 + 22 * h(3)) * sc * ee; cx = x + dir * d + Math.sin(ee * 4 + h(6) * TAU) * 1.4 * sc; cy = y - up * sc * ee * (0.2 + h(5)) * 0.7 + (h(8) - 0.5) * 3 * sc * ee + Math.sin(ee * 3 + h(7) * TAU) * 1.2 * sc;
        const r = (2.2 + 3.8 * h(4)) * sc * (0.45 + 1.1 * ee); rx = r * (1.3 + 0.7 * h(10)); ry = r * 0.8;
      } else {    // dust: a low burst skidding out sideways along the ground to both sides, flattening as it goes
        const sd = h(1) < 0.5 ? -1 : 1, d = (3 + 22 * h(3)) * sc * ee; cx = x + sd * d * (1.1 + 0.4 * h(2)) + Math.sin(ee * 4 + h(6) * TAU) * 1.2 * sc * ee;
        const r = (2.6 + 3.8 * h(4)) * sc * (0.55 + 0.9 * ee); rx = r * (1.25 + 0.6 * ee); ry = r * (0.5 - 0.18 * ee);
        cy = y + 2.2 * sc - ry * 0.5 - up * sc * ee * (0.2 + h(5) * 0.8);   // the lobes sit on the ground line, not around the source point
      }
      const ai = fade * (br ? 0.3 : 0.36) * (0.6 + 0.4 * h(11));
      lobe(ctx, cx + rx * 0.12, cy + ry * 0.3, rx * 1.02, ry * 1.0, lo, ai * 0.95);            // shadowed underside
      lobe(ctx, cx, cy, rx * 0.96, ry * 0.94, base, ai);                                        // the body of the lobe
      lobe(ctx, cx - rx * 0.14, cy - ry * 0.3, rx * 0.62, ry * 0.5, hi, ai * 0.85);              // lit top
      if (nw) lobe(ctx, cx + bx * rx * 0.42, cy + by * ry * 0.42, rx * 0.62, ry * 0.58, warmC, ai * 0.9 * wf);   // warm rim facing the nearest light
    }
    ctx.restore();
  } }];
};
// sparkle(x, y, z, k, o): light arriving at a root. A thick, feathered pulse hugs the ground and fades quickly; several small
// four-point twinkles of different sizes (warm cores) blink around the plant; a few motes rise up the stem.
fx.sparkle = function (x, y, z, k, o = {}) {
  if (!(k > 0 && k < 1)) return [];
  const sc = num(o.scale, 1), col = o.col || COL.gold, seed = num(o.seed, 0);
  return [{ z: z - 0.8, draw(ctx) {
    const env = ss(0, 0.12, k) * (1 - ss(0.62, 1, k)), gy = num(o.ground, 0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const pk = k / 0.5; if (pk < 1) {   // the ground pulse: soft, thick, fast
      const R = (5 + 34 * easeOut(pk)) * sc, a = Math.pow(1 - pk, 1.4);
      ringGlow(ctx, x, gy, R, R * 0.3, col, 0.5 * a, 0.35); disc(ctx, x, gy - 1, R * 0.55, R * 0.18, COL.amber, 0.35 * a);
    }
    disc(ctx, x, y, (14 + 8 * Math.sin(k * 9)) * sc, (14 + 8 * Math.sin(k * 9)) * sc, COL.amber, 0.16 * env);
    const TW = [[-17, -22, 3.3], [13, -40, 2.6], [-6, -58, 1.9], [20, -14, 1.6], [-24, -44, 1.4], [6, -76, 2.2], [-12, -10, 1.2]];
    TW.forEach(([ox, oy, r0], i) => {
      const h = j => hash(i, j + 600 + seed), ph = fract(k * (1.7 + 0.8 * h(1)) + h(2)), a = Math.pow(Math.sin(Math.PI * ph), 2) * env, rise = k * (4 + 10 * h(3));
      twinkle(ctx, x + ox * sc * (0.8 + 0.4 * h(4)), y + (oy - rise) * sc * 0.8, r0 * sc * (0.45 + 0.6 * Math.sin(Math.PI * ph)), mix(col, COL.amber, 0.3 + 0.4 * h(5)), a * 0.8, 0.3 * h(6) + k * 0.6);
    });
    for (let i = 0; i < 9; i++) {   // motes climbing the stem: light visibly arriving into the plant
      const h = j => hash(i, j + 640 + seed), ph = fract(k * 1.5 + h(1)), hh = (18 + 80 * h(2)) * sc, mx = x + Math.sin(ph * 6 + h(3) * TAU) * 2.4 * sc + (h(4) - 0.5) * 3 * sc, my = y - ph * hh, a = Math.sin(Math.PI * ph) * env * (0.55 + 0.45 * h(5));
      disc(ctx, mx, my, (1.5 + 1.5 * h(6)) * sc, (1.5 + 1.5 * h(6)) * sc, mix(col, COL.hot, 0.4), a * 0.9); disc(ctx, mx, my, 0.5 * sc, 0.5 * sc, COL.white, a);
    }
    ctx.restore();
  } }];
};
// pebble(x, y, z, k, o): a pebble let go at (x, y) (y negative = height above the ground at y = 0) that falls, bounces twice and
// rolls dist units along dir, slowing to a stop at k = 1; its contact shadow tracks its height. This is the call shots.js makes:
// pebble(x, -26, z, progress). o: r (radius, 3.4), dir (+1 right / -1 left), dist (38), seed, col, dz (drift toward the camera, 0).
// Legacy form for resting pebbles: pebble(x, groundY, z, rot, r, o) (a number in the fifth position).
function pebbleDraw(ctx, x, gy, z, r, rot, lift, seed, col0) {
  const n = 11, verts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = r * (0.84 + 0.26 * hash(i, 700 + seed)); verts.push([Math.cos(a) * rr * 1.1, Math.sin(a) * rr * 0.9]); }
  const path = c => { const m = verts.map((v, i) => { const q = verts[(i + 1) % n]; return [(v[0] + q[0]) / 2, (v[1] + q[1]) / 2]; });
    c.moveTo(m[n - 1][0], m[n - 1][1]); for (let i = 0; i < n; i++) c.quadraticCurveTo(verts[i][0], verts[i][1], m[i][0], m[i][1]); c.closePath(); };
  const cy = gy - lift - r * 0.78, col = lit3(col0 || [118, 122, 140], x, cy, z, 0.03), dark = mix(col, [14, 16, 36], 0.5), pale = mix(col, [255, 232, 200], 0.3);
  // ambient-occlusion contact shadow: wide soft pool plus a tight dark core that fades as the pebble leaves the ground
  const hh = clamp(lift / (r * 3.2)), ao = 1 - 0.78 * hh;
  ctx.save();
  disc(ctx, x + r * 0.25 * (1 + hh), gy - 0.1, r * (1.7 + 1.2 * hh), r * (0.5 + 0.2 * hh), [3, 5, 14], 0.42 * ao);
  disc(ctx, x + r * 0.1, gy - 0.1, r * (1.0 + 0.5 * hh), r * 0.26, [2, 3, 10], 0.62 * ao);
  ctx.translate(x, cy);
  ctx.save(); ctx.rotate(rot);
  const g = ctx.createLinearGradient(0, -r, 0, r); g.addColorStop(0, rgba(mix(col, pale, 0.3), 1)); g.addColorStop(0.55, rgba(col, 1)); g.addColorStop(1, rgba(dark, 1));
  P.card(ctx, path, g, { lift: Math.max(r * 0.1, 0.3), edge: 0.5, tex: 0.35, shadow: 0 });
  ctx.save(); ctx.beginPath(); path(ctx); ctx.clip();
  for (let i = 0; i < 16; i++) { const lt = hash(i, 705 + seed) < 0.5; ctx.fillStyle = lt ? rgba(pale, 0.3) : rgba(dark, 0.4);   // the same speckle as the cobbles
    ctx.beginPath(); ctx.arc((hash(i, 710 + seed) - 0.5) * r * 1.9, (hash(i, 711 + seed) - 0.5) * r * 1.6, r * (0.05 + 0.07 * hash(i, 712 + seed)), 0, TAU); ctx.fill(); }
  ctx.strokeStyle = rgba(dark, 0.45); ctx.lineWidth = Math.max(r * 0.07, 0.2); ctx.beginPath(); ctx.moveTo(-r, -r * 0.1); ctx.quadraticCurveTo(0, r * 0.28, r, -r * 0.3); ctx.stroke();
  ctx.restore(); ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * 0.92, 0, 0, TAU); ctx.clip();
  const sh = ctx.createRadialGradient(-r * 0.4, -r * 0.45, 0, -r * 0.2, -r * 0.2, r * 1.35); sh.addColorStop(0, 'rgba(255,238,214,0.28)'); sh.addColorStop(0.5, 'rgba(255,238,214,0)'); sh.addColorStop(1, 'rgba(6,8,24,0.4)');
  ctx.fillStyle = sh; ctx.fillRect(-r * 1.4, -r * 1.4, r * 2.8, r * 2.8);
  const ag = ctx.createLinearGradient(0, r * 0.1, 0, r * 0.95); ag.addColorStop(0, 'rgba(6,8,24,0)'); ag.addColorStop(1, 'rgba(6,8,24,0.45)'); ctx.fillStyle = ag; ctx.fillRect(-r * 1.4, 0, r * 2.8, r * 1.2);   // darker where it meets the ground
  ctx.restore();
}
fx.pebble = function (x, y, z, k = 1, o = {}) {
  if (typeof o === 'number') {   // legacy: pebble(x, groundY, z, rot, r, o)
    const rot = k, r = o, oo = arguments[5] || {};
    return [{ z, draw(ctx) { pebbleDraw(ctx, x, y, z, r, rot, 0, num(oo.seed, 0), oo.col); } }];
  }
  const r = num(o.r, 3.4), dir = num(o.dir, 1) < 0 ? -1 : 1, D = num(o.dist, 38), seed = num(o.seed, 0), h0 = Math.max(-y, 0), kk = clamp(num(k, 1));
  let dx, h = 0;
  if (h0 > 0.5) {
    const kf = 0.1 + 0.08 * Math.sqrt(h0 / 26), k1 = kf + 0.13, k2 = k1 + 0.08;
    if (kk < kf) { const u = kk / kf; h = h0 * (1 - u * u); dx = 5 * u; }
    else if (kk < k1) { const u = (kk - kf) / (k1 - kf); h = Math.min(0.26 * h0, 9) * 4 * u * (1 - u); dx = 5 + 7 * u; }
    else if (kk < k2) { const u = (kk - k1) / (k2 - k1); h = Math.min(0.07 * h0, 2.6) * 4 * u * (1 - u); dx = 12 + 4 * u; }
    else { const u = (kk - k2) / (1 - k2); dx = 16 + (D - 16) * (1 - Math.pow(1 - u, 2.3)); }
  } else dx = D * (1 - Math.pow(1 - kk, 2.3));
  const px = x + dir * dx, pz = z + num(o.dz, 0) * dx / Math.max(D, 1), rot = dir * dx / r;
  return [{ z: pz, draw(ctx) { pebbleDraw(ctx, px, 0, pz, r, rot, h, seed, o.col); } }];
};

// ---------------------------------------------------------------- the gush: water leaving the spout cleft when the blockage lets go
// One item (a card at depth zi in front of the garden) that draws a curved sheet of water arcing out of the cleft toward the lens and down
// the channel. It is the same water as the stream (fx.waterColors): a translucent blue-green sheet, darker at its far edge, lighter in the
// middle, with cool streaks sliding along it, a white-teal foam lip, cool droplets, and the carried light as golden sparks riding inside it
// (no cream core, no flare). Where it lands: a teal pool spreading on the channel with a ring of foam. cam: { x, y, z } of the shot's camera;
// rel: seconds since release; zi: depth of the card. o: { from: [x, y, z] mouth, to: [dx, dy, dz] landing offset, power, glow,
// hold (true: keeps running instead of fading out after 2.6-3.4 s), lip (half width at the mouth, default 4), spread (added by the landing, 22),
// width (multiplies lip and spread: 2.5 to 4 makes a wide sheet pouring over a broad lip), soft 0..1 (feathers both edges of the sheet:
// the body is built from nested strips that thin toward the edges, and the hard foam/rim lines fade out; 0 = the original crisp sheet),
// drops (how many droplets are flung off it, 30), fling (how far sideways they go, 30), arc (how high the sheet bows up out of the mouth before
// it falls, 12: higher reads as a curved, heavy sheet), foam 0..1 (a churning white crest across the lip where it leaves the mouth, and a
// thicker ring of foam where it lands)
// }. The returned item carries .foot = [x, y, z], the world point where the sheet lands, for a fx.splash(x, y, z, t, k, o) there.
fx.gush = function (cam, rel, zi, o = {}) {
  if (rel <= 0) return null;
  const M = (P.world && P.world.chan) ? P.world.chan(0) : [-900, 0, 2600], F = o.from || [M[0] + 2, -22, 2688], D = o.to || [34, 22, -112];   // out of the cleft (the dam face is at z about 2690), landing in the channel just in front of the dam
  const pw = ss(0, 0.2, rel) * (1 - 0.3 * ss(0.8, 2.6, rel)) * num(o.power, 1), head = ss(0, 0.62, rel), life = o.hold ? 1 : 1 - ss(2.6, 3.4, rel), gl = clamp(num(o.glow, 1));
  const WID = num(o.width, 1), LIP = num(o.lip, 4) * WID, SPR = num(o.spread, 22) * WID, SOFT = clamp(num(o.soft, 0)), hard = 1 - 0.75 * SOFT;
  if (pw * life < 0.01) return null;
  const tMax = D[2] < 0 ? clamp((F[2] - (cam.z + 30)) / -D[2], 0.15, 1) : 1;   // the landing never comes closer than 30 units to the lens
  const ARC = num(o.arc, 12), at = t0 => { const tau = t0 * tMax; return [F[0] + D[0] * tau, F[1] - ARC * tau + (D[1] + ARC) * tau * tau, F[2] + D[2] * tau]; };   // arcs up out of the cleft, then falls
  const proj = q => { const k = (zi - cam.z) / (q[2] - cam.z); return [cam.x + (q[0] - cam.x) * k, cam.y + (q[1] - cam.y) * k, k]; };
  return { z: zi, foot: at(head), draw(ctx) {
    const N = 40, pts = [], pal = waterPal(F[0], F[1], F[2], false);
    for (let i = 0; i <= N; i++) { const tau = head * i / N, q = proj(at(tau)); pts.push({ tau, x: q[0], y: q[1], k: q[2] }); }
    const nrm = i => { const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, N)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    const hw = (i, m) => { const p = pts[i]; return (LIP + SPR * Math.pow(p.tau, 1.1) + 1.0 * Math.sin(i * 0.45 + rel * 9)) * p.k * m * (0.5 + 0.5 * ss(0, 0.05, p.tau)); };
    const strip = (m, off = 0) => { const L = [], Rr = []; for (let i = 0; i <= N; i++) { const n = nrm(i), w = hw(i, m), c0 = hw(i, 1) * off; L.push([pts[i].x + n[0] * (w + c0), pts[i].y + n[1] * (w + c0)]); Rr.push([pts[i].x - n[0] * (w - c0), pts[i].y - n[1] * (w - c0)]); }
      ctx.beginPath(); L.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); for (let i = N; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]); ctx.closePath(); };
    const edge = (sd, m) => { ctx.beginPath(); for (let i = 0; i <= N; i++) { const n = nrm(i), w = hw(i, m) * sd; i ? ctx.lineTo(pts[i].x + n[0] * w, pts[i].y + n[1] * w) : ctx.moveTo(pts[i].x + n[0] * w, pts[i].y + n[1] * w); } };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const a = pw * life, km = pts[Math.floor(N / 2)].k, FOAM = clamp(num(o.foam, 0)), AER = FOAM, a1 = Math.min(a, 1);   // AER: the sheet is aerated white water (o.foam)
    const sx = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;
    const tang = i => { const n = nrm(i); return Math.atan2(-n[0], n[1]); };   // the flow direction on screen at point i
    const TOP = nrm(N >> 1)[1] < 0 ? 1 : -1;   // which side (+1 / -1 along nrm) is the sheet's upper edge on screen
    // the sheet: deep teal body, a clearer blue-green band, a pale moonlit sheen near the top edge (denser when aerated: white water is not glass)
    if (SOFT > 0) {   // feathered: the body is filled through a blur sized to the sheet, and fades out along its last stretch
      const bpx = clamp(SOFT * 0.3 * hw(Math.round(N * 0.6), 1) * sx, 1, 6 + 10 * SOFT) * (1 - 0.4 * AER);
      const fade = (col, al) => { const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[N].x, pts[N].y); g.addColorStop(0, rgba(col, al)); g.addColorStop(0.82, rgba(col, al)); g.addColorStop(1, rgba(col, al * (1 - 0.7 * SOFT))); return g; };
      ctx.filter = `blur(${bpx.toFixed(1)}px)`;
      ctx.fillStyle = fade(pal.deep, (0.72 + 0.22 * AER) * a); strip(1.0); ctx.fill();
      ctx.filter = `blur(${(bpx * 0.5).toFixed(1)}px)`;
      ctx.fillStyle = fade(pal.body, (0.62 + 0.2 * AER) * a); strip(0.66, 0.12); ctx.fill();
      ctx.filter = 'none';
    } else { ctx.fillStyle = rgba(pal.deep, (0.72 + 0.22 * AER) * a); strip(1.0); ctx.fill();
      ctx.fillStyle = rgba(pal.body, (0.62 + 0.2 * AER) * a); strip(0.66, 0.12); ctx.fill(); }
    ctx.fillStyle = rgba(pal.mid, 0.36 * a); strip(0.3, 0.32); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(WARM_RAY, 0.05 * a * gl); strip(0.5); ctx.fill();   // a gentle glow of the light it carries
    // moving cool streaks along the flow (mostly replaced by the white aeration when the sheet is foamy)
    ctx.setLineDash([14 * km, 9 * km]); ctx.lineDashOffset = -rel * 90 * km; ctx.lineWidth = Math.max(0.5, 1.0 * km);
    const STK = clamp(num(o.streaks, 1), 0, 1) * (1 - 0.75 * AER);   // o.streaks 0..1: how strongly the flow streaks show (1 = the original lines)
    if (STK > 0.01) for (const off of [-0.6, -0.25, 0.2, 0.55]) { ctx.strokeStyle = rgba(pal.glint, 0.36 * a * STK); edge(1, off); ctx.stroke(); }
    ctx.setLineDash([]);
    // the foam lip along the top edge, and a thin bright rim on the near edge (crisp lines: dropped on an aerated sheet, whose edge is spume)
    const hardL = hard * (1 - AER);
    if (hardL > 0.01) { ctx.strokeStyle = rgba(pal.foam, 0.5 * a * hardL); ctx.lineWidth = Math.max(0.8, 1.8 * km); edge(1, 1 - 0.3 * SOFT); ctx.stroke();
      ctx.strokeStyle = rgba(pal.glintHi, 0.3 * a * hardL); ctx.lineWidth = Math.max(0.5, 0.9 * km); edge(-1, 1 - 0.3 * SOFT); ctx.stroke(); }
    // golden sparks of carried light riding inside the sheet
    if (gl > 0.02) for (let d = 0; d < 26; d++) { const ph = fract(rel * (0.8 + 0.5 * hash(d, 31)) + hash(d, 32)), j = Math.min(N, Math.floor(ph * N));
      const n = nrm(j), off = (hash(d, 33) * 2 - 1) * 0.7 * hw(j, 1), x = pts[j].x + n[0] * off, y = pts[j].y + n[1] * off, r = Math.max(0.5 * pts[j].k, 0.6), tw = 0.5 + 0.5 * Math.sin(rel * 9 + d);
      if (pts[j].tau > head - 0.02) continue; fx.goldSpark(ctx, x, y, r * (1 - 0.3 * AER), 0.8 * a * gl * tw * (1 - ss(0.8, 1, ph)) * (1 - 0.35 * AER)); }
    ctx.globalCompositeOperation = 'source-over';
    if (AER > 0.01) {   // white water: soft white streaks of air carried down through the body, thickest near the lip, thinning down the fall, a
      // little more where it hits; each streak slides with the flow and swells and fades on its own cycle. Clipped to the sheet so it stays inside it.
      ctx.save(); strip(1.0); ctx.clip();
      const G = blurGroup(ctx);   // the streaks and veins share one blur, laid down inside the clip
      const NA = 150, foamC = mix(pal.foam, pal.glintHi, 0.3);
      for (let d = 0; d < NA; d++) { const h1 = hash(d, 141), h2 = hash(d, 142), h3 = hash(d, 143), h4 = hash(d, 144);
        const ph = fract(rel * (0.55 + 0.5 * h1) + h2), f = Math.pow(ph, 1.35 - 0.6 * h4), j = Math.min(N, Math.round(f * N)); if (pts[j].tau > head - 0.01) continue;
        const wgt = 1 - 0.68 * ss(0.08, 0.55, f) + 0.25 * ss(0.8, 1, f), n = nrm(j), w = hw(j, 1), off = (h3 * 2 - 1) * 0.92 * w, x = pts[j].x + n[0] * off, y = pts[j].y + n[1] * off;
        const len = (2.2 + 5.5 * h4) * pts[j].k * (0.8 + 0.6 * f), wd = (0.7 + 1.5 * h1) * pts[j].k * (1.1 - 0.4 * f), al = AER * a1 * (0.2 + 0.32 * h4) * wgt * Math.pow(Math.sin(Math.PI * ph), 0.6);
        G.ell(x, y, len, wd, tang(j), rgba(h1 < 0.3 ? COL.white : foamC, al)); }
      // marbling: a few long pale veins down the sheet, broken into pieces
      for (let v = 0; v < 7; v++) { const off = (hash(v, 151) * 2 - 1) * 0.8, sp = 0.5 + 0.4 * hash(v, 152);
        for (let k = 0; k < 5; k++) { const f0 = fract(rel * sp * 0.6 + k / 5 + hash(v, 153)), j0 = Math.min(N - 1, Math.round(f0 * N)), j1 = Math.min(N, j0 + 3 + Math.round(3 * hash(v * 5 + k, 154))); if (pts[j1].tau > head - 0.01) continue;
          const q = []; for (let j = j0; j <= j1; j++) { const n = nrm(j), w = hw(j, 1) * (off + 0.06 * Math.sin(j * 0.7 + v)); q.push(pts[j].x + n[0] * w, pts[j].y + n[1] * w); }
          G.line(q, Math.max(0.6, (0.8 + 0.8 * hash(v, 155)) * km), rgba(foamC, AER * a1 * 0.22 * (1 - 0.5 * f0) * Math.sin(Math.PI * f0))); } }
      G.done(clamp(0.9 * sx * km, 1, 9)); ctx.restore();
    }
    if (FOAM > 0.01) {   // the crest: white water boiling over the lip, across the whole width of the sheet, churning (a soft band of bubbles)
      const G = blurGroup(ctx);   // the bubbles share one blur
      const NC = Math.round(46 + 40 * AER);
      for (let d = 0; d < NC; d++) { const h1 = hash(d, 41), h2 = hash(d, 42), h3 = hash(d, 43), j = Math.min(N, Math.round(N * (0.02 + (0.22 + 0.06 * AER) * h1 * h1))), n = nrm(j), w = hw(j, 1);
        const off = (h2 * 2 - 1) * 0.95 * w, bob = Math.sin(rel * (7 + 4 * h3) + d) * 0.12 * w, x = pts[j].x + n[0] * (off + bob * 0.3), y = pts[j].y + n[1] * (off) - Math.abs(bob) * 0.4;
        const r = (0.9 + 1.6 * h3) * pts[j].k * (1 - 0.5 * h1) * (1 + 0.5 * AER), al = FOAM * a1 * (0.35 + 0.35 * Math.sin(rel * 5 + d * 1.7)) * (1 - 0.6 * h1) * (1 + 0.3 * AER);
        G.ell(x, y, r * 1.5, r, Math.atan2(n[1], n[0]) + Math.PI / 2, rgba(pal.foam, al)); }
      G.done(0.8 + 0.3 * AER);
    }
    if (AER > 0.01) {   // the feathered top edge: no outline; just inside it a broken, soft band of white water (pieces of rolling foam along the curl
      // that slide with the flow), and a fainter one along the underside
      ctx.lineCap = 'round'; const G = blurGroup(ctx);   // the foam pieces share one blur
      for (const [sd, str] of [[TOP, 1], [-TOP, 0.4]]) for (let b = 0; b < 3; b++) for (let k = 0; k < 9; k++) {
        const hk = hash(b * 9 + k, 171 + sd), f0 = fract(k / 9 + hk * 0.08 + rel * (0.16 + 0.05 * b)), len = 0.05 + 0.07 * hash(b * 9 + k, 172 + sd);
        const j0 = Math.round(f0 * N), j1 = Math.min(N, Math.round((f0 + len) * N)); if (j1 - j0 < 1 || pts[j1].tau > head - 0.01 || hk < 0.15) continue;
        const dep = 0.93 - 0.11 * b - 0.04 * hk, al = AER * a1 * str * (0.42 - 0.1 * b) * Math.sin(Math.PI * clamp((f0 + len / 2))) ** 0.4;
        const lw = Math.max(0.8 / sx, hw(Math.round((j0 + j1) / 2), 1) * (0.07 - 0.015 * b));
        const q = []; for (let j = j0; j <= j1; j++) { const n = nrm(j), w = hw(j, 1) * sd * (dep + 0.03 * Math.sin(j * 1.1 + rel * 7 + k)); q.push(pts[j].x + n[0] * w, pts[j].y + n[1] * w); }
        G.line(q, lw, rgba(b === 0 ? mix(pal.foam, COL.white, 0.3) : mix(pal.foam, pal.mid, 0.3), al)); }
      G.done(clamp(0.4 * sx * km, 0.8, 2.2));
    }
    // the darker far side of the sheet, so it reads as a curved body of liquid (soft on an aerated sheet)
    if (hardL > 0.01) { ctx.strokeStyle = rgba([4, 16, 22], 0.45 * a * hardL); ctx.lineWidth = Math.max(0.6, 1.4 * km); edge(-1, 1); ctx.stroke(); }
    // droplets flung off the sheet, each falling on its own arc with a short trail along its motion: pointed teardrops (cool, a few gold), or on
    // an aerated sheet round cool drops with a faint trail and a pin of highlight
    const ND = Math.round(num(o.drops, 30)), FL = num(o.fling, 30);
    const dropAt = (tau, d, h1, h3, side) => { const b = at(tau); return proj([b[0] + side * FL * tau, b[1] - 16 * h1 * Math.sin(Math.PI * Math.min(tau * 1.6, 1)) * FL / 30 + 10 * (h3 - 0.5), b[2]]); };
    for (let d = 0; d < ND; d++) {
      const h1 = hash(d, 1), h2 = hash(d, 2), h3 = hash(d, 3), h4 = hash(d, 4), cyc = rel * (0.9 + 0.5 * h1) + h4;
      if (rel * (0.9 + 0.5 * h1) < h4 * 0.5) continue;
      const ph = cyc % 1, tau = ph * (0.45 + 0.6 * h3) * Math.min(head * 1.2, 1), side = (h2 - 0.5) * 2;
      const q = dropAt(tau, d, h1, h3, side), q0 = dropAt(Math.max(tau - 0.04 * (1 - 0.5 * clamp(2 * AER - 1)), 0), d, h1, h3, side);   // the trail follows the drop's own path
      const r = (0.4 + 0.8 * h3) * q[2], al = (AER > 0.5 ? a1 : a) * (1 - ss(0.65, 1, ph)) * 0.85, dx = q[0] - q0[0], dy = q[1] - q0[1], ang = Math.atan2(dy, dx), dc = hash(d, 5) < 0.25 && gl > 0.02 ? COL.gold : pal.glintHi;
      if (AER > 0.5) {   // aerated: a small round bright drop (a dark-teal body would read as a bubble), a faint trail behind it
        const rr = Math.max(r * 0.42, 0.9 / sx); ctx.strokeStyle = rgba(pal.glint, al * 0.18); ctx.lineWidth = rr * 1.1; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        ctx.fillStyle = rgba(mix(pal.glintHi, COL.white, 0.3), al * 0.9); ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, TAU); ctx.fill(); continue; }
      ctx.strokeStyle = rgba(dc, al * 0.35); ctx.lineWidth = r * 1.1; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.fillStyle = rgba(mix(pal.body, dc, 0.6), al); ctx.beginPath(); ctx.ellipse(q[0], q[1], r * 2.2, r, ang, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(pal.foam, al * 0.7); ctx.beginPath(); ctx.arc(q[0] + Math.cos(ang) * r * 0.3 - r * 0.2, q[1] + Math.sin(ang) * r * 0.3 - r * 0.3, r * 0.35, 0, TAU); ctx.fill();   // a pin of highlight
    }
    // landing: a teal pool spreading on the channel with a ring of white foam (small flattened bubbles) and a little warm light in it
    const L = proj(at(Math.max(head, 0.001))), spread = ss(0.45, 1.3, rel) * a;
    if (spread > 0.01) { ctx.save(); ctx.translate(L[0], L[1]); ctx.scale(1, 0.28);
      const rad = 80 * L[2] * (0.5 + 0.7 * ss(0.45, 1.6, rel)), g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad); g.addColorStop(0, rgba(pal.mid, 0.55 * spread)); g.addColorStop(0.55, rgba(pal.body, 0.4 * spread)); g.addColorStop(1, rgba(pal.deep, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, rad * 0.6); g2.addColorStop(0, rgba(COL.amber, 0.14 * spread * gl)); g2.addColorStop(1, rgba(COL.amber, 0)); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, rad * 0.6, 0, TAU); ctx.fill(); ctx.restore();
      for (let f = 0; f < 16 + Math.round(36 * clamp(num(o.foam, 0))); f++) { const th = hash(f, 20) * TAU, rr = (0.3 + 0.8 * hash(f, 21)) * 34 * L[2] * (0.6 + 0.6 * ss(0.4, 1.4, rel)), fr = (1.2 + 2.2 * hash(f, 22)) * L[2];
        ctx.fillStyle = rgba(pal.foam, 0.5 * spread * (0.6 + 0.4 * Math.sin(rel * 6 + f))); ctx.beginPath(); ctx.ellipse(L[0] + Math.cos(th) * rr, L[1] + Math.sin(th) * rr * 0.28, fr, fr * 0.6, 0, 0, TAU); ctx.fill(); } }
    // the mouth: a short warm flash of the released light where the water leaves the cleft
    { const f0 = proj(F); ctx.globalCompositeOperation = 'lighter'; disc(ctx, f0[0], f0[1], 30 * f0[2] * (0.6 + 0.5 * ss(0, 0.2, rel)), 22 * f0[2] * (0.6 + 0.5 * ss(0, 0.2, rel)), COL.amber, 0.3 * Math.exp(-rel * 1.6) * life * gl); }
    ctx.restore(); } };
};
})();
