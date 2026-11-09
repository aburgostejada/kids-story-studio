// world module (see CONTRACT.md): the dusk miniature garden, every pixel drawn by code.
// Static geometry (channel table, stones, flowers, buds) is generated once from P.hash; per-frame builders only
// return item lists whose draw() reads the current shared state. All colours go through P.lit / sh() inside draw().
(() => {
const P = window.PIP;
const { W, H, TAU, clamp, lerp, ss, hash, noise, mixc } = P;
const R = (i, j = 0) => hash(i, j);
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lit = (c, x, y, z, e = 0, a = 1) => P.lit(c, x, y, z, e, a);
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const NOM = [0.30, 0.38, 0.65];
const base = c => [c[0] / NOM[0], c[1] / NOM[1], c[2] / NOM[2]];   // colour that looks like c under nominal dusk
let AMBC = null;                                                     // ambient of the frame being drawn (reset by WD.sky each frame)
const soft = v => v < 175 ? v : 175 + 80 * (1 - Math.exp(-(v - 175) / 80));   // soft shoulder so bright lit surfaces keep their hue
const GAIN = 0.32;                                                   // how strongly warm light adds amber on top of albedo
// sh: the colour a surface really shows ([r,g,b], clamped): albedo * (ambient + glow), plus the warm light as an additive amber
// so glow pools read amber on dark green and grey alike (the signature of the look target).
let XS = 1;                                                          // share of the glow light that sh() lets through (calm dims lit scatter)
const sh = (c, x, y, z, e = 0.12) => { const a = AMBC || (AMBC = P.light(1e7, 0, 1e7)), m0 = P.light(x, y, z), m = XS >= 1 ? m0 : [a[0] + (m0[0] - a[0]) * XS, a[1] + (m0[1] - a[1]) * XS, a[2] + (m0[2] - a[2]) * XS];
  const lumD = c[0] * m[0] * 0.3 + c[1] * m[1] * 0.59 + c[2] * m[2] * 0.11, fac = (0.3 + 0.7 * clamp(lumD / 80, 0, 1)) * 255 * GAIN;   // dark surfaces take less additive amber
  const ex = Math.min(m[0] - a[0], 0.6) * fac, ey = Math.min(m[1] - a[1], 0.5) * fac * 0.62, ez = Math.min(m[2] - a[2], 0.3) * fac * 0.2;
  return [soft(c[0] * (m[0] + e) + ex), soft(c[1] * (m[1] + e) + ey), soft(c[2] * (m[2] + e) + ez)]; };
const rg = (c, a = 1) => a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const HAZE = [40, 54, 120];                                         // deep saturated navy, never milky
// Camera of the frame (set by WD.ground / WD.foreground, which every scene calls): ground-plane mapping and distance cues.
const GC = { x: 0, y: -35, z: -1400, f: 2400 };
const fog = (c, z, k = 0.5) => mixc(c, HAZE, clamp((z - GC.z - 1400) / 8000, 0, 1) * k * 0.62);
const nearK = z => lerp(0.5, 1, ss(70, 1200, z - GC.z));            // near ground is darker so the foreground frames the shot
// Map a world point (x, y, zz) into the card space of an item drawn at depth z0 (so ground-plane shapes get true perspective).
const gp = (z0, x, y, zz) => { const k = (z0 - GC.z) / Math.max(zz - GC.z, 1); return [GC.x + (x - GC.x) * k, GC.y + (y - GC.y) * k]; };
// Is a world box on screen? (reads the item transform: e,f = screen position of world origin)
const vis = (c, s, x0, x1, y0, y1, pad = 40) => { const m = c.getTransform();
  return m.e + x1 * s > -pad && m.e + x0 * s < W + pad && m.f + y1 * s > -pad && m.f + y0 * s < H + pad; };
const CUR = {};                  // current shared state per builder, read by the cached items' draw()
// Calm (st.calm, 0..1, set by scene() from o.calm): an explanatory shot thins the small garden detail and softens the far field so the
// action has one place to look. Each small item has a fixed hash h; at calm k the items with h below about k / 2 fade out over a short
// band of h, so as calm animates they leave one by one and never flicker. calm 0 keeps everything exactly as it was.
const calmKeep = (h, k) => k <= 0 ? 1 : ss(0, 0.06, h + 0.06 - 0.56 * k);
// and what is left of it far from the lens is drawn fainter (lower contrast against the turf)
const calmFar = (d, k) => k <= 0 ? 1 : 1 - 0.38 * k * ss(700, 2600, d);
const WD = P.world = {};
const PAL = [[238, 104, 160], [245, 190, 64], [170, 132, 224], [246, 118, 86], [246, 240, 228]];   // pink gold lilac coral white

// ---------- the channel: a spline from the spout to the hero root, resampled by arc length ----------
// EXT is a short sluice that runs from the dam cleft to the mouth at (-900, 2600); s and u are measured from the mouth.
const EXT = [[-900, 2676], [-900, 2640]];
const CTRL0 = [[-900, 2600], [-760, 2430], [-600, 2290], [-380, 2130], [-300, 1900], [-440, 1700], [-540, 1480], [-420, 1260],
  [-190, 1130], [40, 1010], [220, 860], [180, 690], [70, 540], [30, 430]];
const CTRL = [...EXT, ...CTRL0];
const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
const DENSE = [];
for (let i = 0; i < CTRL.length - 1; i++) {
  const p0 = CTRL[Math.max(i - 1, 0)], p1 = CTRL[i], p2 = CTRL[i + 1], p3 = CTRL[Math.min(i + 2, CTRL.length - 1)];
  for (let k = 0; k < 24; k++) { const t = k / 24; DENSE.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]); }
}
DENSE.push(CTRL[CTRL.length - 1].slice());
const CL = [0]; for (let i = 1; i < DENSE.length; i++) CL.push(CL[i - 1] + Math.hypot(DENSE[i][0] - DENSE[i - 1][0], DENSE[i][1] - DENSE[i - 1][1]));
const S0 = CL[EXT.length * 24], LEN = CL[CL.length - 1] - S0;       // S0: arc length of the sluice (s < 0 is the sluice)
const atA = s => { s = clamp(s, 0, CL[CL.length - 1]); let lo = 0, hi = CL.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (CL[m] <= s) lo = m; else hi = m; }
  const k = (s - CL[lo]) / Math.max(CL[hi] - CL[lo], 1e-6); return [lerp(DENSE[lo][0], DENSE[hi][0], k), lerp(DENSE[lo][1], DENSE[hi][1], k)]; };
const at = s => atA(s + S0);
const tangent = s => { const a = at(s - 7), b = at(s + 7), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
const sAtZ = z => { const n = DENSE.length - 1; if (z >= DENSE[0][1] || z <= DENSE[n][1]) return null; let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (DENSE[m][1] > z) lo = m; else hi = m; }
  return lerp(CL[lo], CL[hi], (DENSE[lo][1] - z) / (DENSE[lo][1] - DENSE[hi][1])) - S0; };
// Cross-section of the channel at depth z: centre x, and the x half-width of a band of normal half-width V.
const bedAt = z => { const s = sAtZ(z); if (s === null) return null; const p = at(s), t = tangent(s), ta = Math.max(Math.abs(t[1]), 0.42);
  return { xc: p[0], ta, w: Math.min(11 / ta, 30), wc: Math.min(31 / ta, 80), u: clamp(s / LEN), s }; };
WD.CHANNEL = []; for (let s = 0; s < LEN; s += 32) WD.CHANNEL.push(at(s)); WD.CHANNEL.push(at(LEN));
WD.CHANNEL[0] = [-900, 2600]; WD.CHANNEL[WD.CHANNEL.length - 1] = [30, 430];
WD.chan = u => { const p = at(clamp(u) * LEN); return [p[0], 0, p[1]]; };
WD.chanDir = u => tangent(clamp(u) * LEN);
// The channel is a sunken trench: the rim stones sit on its lip at ground level (y = 0), the inner banks are soil walls, and the bed lies
// DEPTH units below the turf (y positive is down). It is shallower in the sluice and rises to near the turf at the channel end, where the
// runnel spills to the hero root. Running water fills it nearly to the brim (WATER_Y, just below the lip and the rim stones). Anything that touches the bed
// (a nose, a cup, a damp patch) should use WD.bedY(u) (or BED_Y away from the ends); the water surface is WD.waterY(u).
const DEPTH = 6;
const depthAtS = s => DEPTH * lerp(0.5, 1, ss(-S0, 24, s)) * (1 - 0.82 * ss(LEN - 46, LEN - 2, s));
WD.BED_Y = DEPTH;
WD.WATER_Y = 0.15 * DEPTH;
WD.bedY = u => depthAtS(clamp(u, -1, 1) * LEN);
WD.waterY = u => 0.15 * depthAtS(clamp(u, -1, 1) * LEN);
// WD.trench(z): the opening of the trench at depth z ({ xc, w }: centre x and x half-width, null outside it), for clipping water to it.
WD.trench = z => { const b = bedAt(z); return b && z > 432 && z < 2676 ? { xc: b.xc, w: b.w } : null; };
const nearBed = (x, z, m = 0) => { if (z > 2690 || z < 425) return false; const b = bedAt(z); return !!b && Math.abs(x - b.xc) < b.wc + m; };

// ---------- garden flowers and buds (static tables) ----------
const KINDS = ['tulip', 'star', 'bell', 'tulip', 'star'];
WD.FLOWERS = [];
for (let i = 0; i < 36; i++) {
  const u = 0.025 + 0.95 * (i + R(i, 1) * 0.7) / 36, side = R(i, 2) < 0.5 ? -1 : 1, off = 36 + Math.pow(R(i, 3), 1.4) * 110;
  const s = u * LEN, p = at(s), t = tangent(s), x = p[0] - t[1] * side * off, z = p[1] + t[0] * side * off;
  WD.FLOWERS.push({ u, side, x, z, h: 50 + R(i, 5) * 60, col: PAL[(i * 3 + Math.floor(R(i, 6) * 5)) % 5], kind: KINDS[Math.floor(R(i, 7) * 5)],
    lean: (R(i, 8) - 0.5) * 18, phase: R(i, 9) * TAU });
}
// Buds hug both banks in two dense rows (offset 32+ clears the rim stones), then a looser scatter behind them.
const BUDS = [];
for (let i = 0; i < 560; i++) {
  const u = 0.005 + 0.99 * (i + R(i, 11) * 0.8) / 560, side = i % 2 ? 1 : -1, row = R(i, 12), off = row < 0.4 ? 32 + R(i, 13) * 7 : row < 0.72 ? 43 + R(i, 13) * 9 : 56 + Math.pow(R(i, 13), 1.3) * 60;
  const s = u * LEN, p = at(s), t = tangent(s);
  BUDS.push({ off, cx: p[0], cz: p[1], x: p[0] - t[1] * side * off, z: p[1] + t[0] * side * off, h: 15 + R(i, 15) * 22, col: PAL[Math.floor(R(i, 16) * 5)],
    kind: R(i, 17) < 0.16 ? 'bell' : 'bud', lean: (R(i, 18) - 0.5) * 9, phase: R(i, 19) * TAU, i });
}

// ---------- shape helpers ----------
const smoothPoly = (c, pts) => { const n = pts.length; c.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); } c.closePath(); };
const petalP = (L, Wp) => c => { c.moveTo(0, 0); c.bezierCurveTo(-Wp * 1.1, -L * 0.2, -Wp * 1.05, -L * 0.78, 0, -L); c.bezierCurveTo(Wp * 1.05, -L * 0.78, Wp * 1.1, -L * 0.2, 0, 0); };
const leafP = (L, Wd, bend = 0.3) => c => { c.moveTo(0, 0);
  c.bezierCurveTo(-Wd, -L * 0.22, -Wd * 0.9 + L * bend * 0.3, -L * 0.72, L * bend, -L);
  c.bezierCurveTo(Wd * 0.8 + L * bend * 0.5, -L * 0.7, Wd * 1.15, -L * 0.25, 0, 0); };
const qb = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
// heart-notched clover leaflet pointing up (+y is down, so the tip of the heart's cleft is at -0.84 r)
const heartP = r => k => { k.moveTo(0, 0); k.bezierCurveTo(-0.5 * r, -0.2 * r, -1.0 * r, -0.66 * r, -0.62 * r, -0.96 * r); k.bezierCurveTo(-0.38 * r, -1.12 * r, -0.1 * r, -1.0 * r, 0, -0.76 * r);
  k.bezierCurveTo(0.1 * r, -1.0 * r, 0.38 * r, -1.12 * r, 0.62 * r, -0.96 * r); k.bezierCurveTo(1.0 * r, -0.66 * r, 0.5 * r, -0.2 * r, 0, 0); k.closePath(); };

// A fuzzy moss clump: overlapping pom-poms in three greens along an uneven mound, always sized in screen-aware units.
function mossCap(c, s, cx, topY, w, seed, x, z) {   // a felt cap of moss on a stone: a flat lumpy patch with a soft skirt and a paler crown, plus a few short fibres (no beads)
  const unit = clamp(0.8 / s, 0.2, 1.0), n = 9, top = [], bot = [];
  for (let i = 0; i <= n; i++) { const f = i / n, px = cx + (f - 0.5) * w * 1.7, hump = Math.sin(Math.PI * f); top.push([px, topY - hump * w * 0.2 * (0.55 + 0.7 * R(seed, 500 + i)) + 0.5]); bot.push([px + (R(seed, 540 + i) - 0.5) * w * 0.1, topY + 0.8 + hump * w * 0.06 * R(seed, 580 + i)]); }
  const grow = (k, dy) => [...top.map(p => [cx + (p[0] - cx) * k, p[1] - dy]), ...bot.slice().reverse().map(p => [cx + (p[0] - cx) * k, p[1] + dy * 0.3])];
  for (const [k, dy, col, al] of [[1.12, 0.5, [30, 64, 44], 0.3], [1.0, 0, [36, 76, 48], 0.85], [0.78, 0.5 * w * 0.05, [58, 100, 56], 0.8]]) { c.fillStyle = rg(sh(col, x + cx, topY, z, 0.1), al); c.beginPath(); smoothPoly(c, grow(k, dy)); c.fill(); }
  if (w * s > 9) { c.lineCap = 'round'; c.strokeStyle = rg(sh([104, 146, 70], x + cx, topY, z, 0.1), 0.5); c.lineWidth = Math.max(0.3, unit * 0.6); c.beginPath();
    for (let i = 0; i < Math.min(14, 4 + w * s / 6 | 0); i++) { const f = R(seed, 620 + i), px = cx + (f - 0.5) * w * 1.4, py = topY - Math.sin(Math.PI * f) * w * 0.12 * R(seed, 640 + i), a2 = -0.5 - R(seed, 660 + i) * 2.1; c.moveTo(px, py); c.lineTo(px + Math.cos(a2) * unit * 1.6, py + Math.sin(a2) * unit * 1.6); } c.stroke(); }
}

// A paper-cut stone: smooth silhouette, three stacked cards (body, shoulder, cap) so it has thickness, a lit top edge on the
// upper right, a dark base, drop shadow, grit and optional moss. (Replaces the faceted low-poly rocks.)
function rock(c, s, x, y, z, w, h, seed, col, o = {}) {
  if (!vis(c, s, x - w / 2, x + w / 2, y - h - 4, y + 4, 30)) return;
  const n = o.n || (8 + seed % 3), px = w * s, pts = [], te = o.topEmit ?? 0.1;
  for (let i = 0; i < n; i++) { const a = TAU * (i + 0.4 * R(seed, i + 40)) / n, j = 0.84 + R(seed, i + 3) * 0.26;
    pts.push([Math.cos(a) * w / 2 * j, Math.min(-h / 2 + Math.sin(a) * h / 2 * j * 1.06, 0.3)]); }
  const lay = (sx, sy, dy) => pts.map(p => [p[0] * sx, (p[1] + h / 2) * sy - h / 2 - dy]);
  const body = pts, shoulder = lay(0.93, 0.84, h * 0.08), cap = lay(0.66, 0.5, h * 0.22);
  const C = (b, yy, a = 1) => rg(shD(mul(col, b), x, y + yy, z, 0.04 + (yy < -h * 0.6 ? te * 0.5 : 0)), a);   // col is a display colour (what it looks like at dusk)
  c.save(); c.translate(x, y); c.lineJoin = 'round';
  const pathOf = pp => k => smoothPoly(k, pp);
  let g = c.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, C(0.78, -h)); g.addColorStop(0.6, C(0.52, -h * 0.4)); g.addColorStop(1, C(0.26, 0));
  P.card(c, pathOf(body), g, { lift: Math.max(1.2, h * 0.09), tex: px > 14 ? 0.28 : 0, shadow: o.shadow ?? 0.5, edge: 0 });
  if (px > 5) {
    g = c.createLinearGradient(0, -h * 0.9, 0, -h * 0.2); g.addColorStop(0, C(1.0, -h * 0.9)); g.addColorStop(1, C(0.62, -h * 0.3));
    P.card(c, pathOf(shoulder), g, { lift: Math.max(0.6, h * 0.05), tex: 0, shadow: 0.3, edge: 0 });
    g = c.createLinearGradient(0, -h, 0, -h * 0.4); g.addColorStop(0, C(1.34, -h)); g.addColorStop(1, C(0.9, -h * 0.5));
    P.card(c, pathOf(cap), g, { lift: Math.max(0.5, h * 0.035), tex: 0, shadow: 0.25, edge: 0 });
    // top-edge highlight, strongest on the upper right (light from the moon side), fading round the shoulder
    const hg = c.createLinearGradient(w * 0.3, -h, -w * 0.3, -h * 0.3); hg.addColorStop(0, css([255, 244, 226], 0.62)); hg.addColorStop(0.5, css([255, 244, 226], 0.18)); hg.addColorStop(1, css([255, 244, 226], 0));
    c.strokeStyle = hg; c.lineWidth = Math.max(0.35, 1.1 / s); c.beginPath(); smoothPoly(c, cap); c.stroke();
    c.beginPath(); smoothPoly(c, shoulder); c.strokeStyle = css([255, 244, 226], 0.1); c.lineWidth = Math.max(0.3, 0.8 / s); c.stroke();
    if (px > 22) {
      c.save(); c.beginPath(); smoothPoly(c, body); c.clip();
      for (let i = 0; i < 14; i++) { const a = R(seed, 30 + i) * TAU, r = Math.sqrt(R(seed, 50 + i)) * 0.8, sx = Math.cos(a) * w * 0.45 * r, sy = -h * 0.5 + Math.sin(a) * h * 0.42 * r;
        c.fillStyle = R(seed, 70 + i) < 0.55 ? css([14, 18, 40], 0.2) : css([255, 255, 255], 0.1); c.beginPath(); c.arc(sx, sy, 0.25 + R(seed, 90 + i) * 0.6, 0, TAU); c.fill(); }
      c.strokeStyle = css([8, 10, 30], 0.28); c.lineWidth = Math.max(0.3, 0.8 / s); c.beginPath();
      const cx1 = (R(seed, 4) - 0.5) * w * 0.5; c.moveTo(cx1, -h * 0.74); c.lineTo(cx1 + w * 0.05, -h * 0.5); c.lineTo(cx1 - w * 0.03, -h * 0.3); c.lineTo(cx1 + w * 0.02, -h * 0.1); c.stroke();
      c.restore(); }
    if (o.moss) mossCap(c, s, (R(seed, 110) - 0.5) * w * 0.5, -h * 0.84, w * 0.3, seed, x, z);
  }
  c.restore();
}

// ---------- sky ----------
WD.sky = st => { CUR.sky = st; AMBC = null; return [{ z: 1e6, screen: true, draw(c, tt) {
  AMBC = null;   // again at draw time (the sky is drawn first): a shot that test-draws cards while it builds (act 3's face clearing) would otherwise fix it from the previous frame's light
  const t = tt ?? (CUR.sky.t || 0), g = c.createLinearGradient(0, 0, 0, H);
  [[0, '#050c38'], [0.2, '#0b1a62'], [0.38, '#1a3a94'], [0.48, '#2c48a6'], [0.54, '#4056b0'], [0.58, '#5160b0'], [0.64, '#34408c'], [1, '#1c2660']].forEach(a => g.addColorStop(a[0], a[1]));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const hg = c.createRadialGradient(1300, 560, 0, 1300, 560, 900); hg.addColorStop(0, 'rgba(170,150,225,0.2)'); hg.addColorStop(1, 'rgba(170,150,225,0)');
  c.fillStyle = hg; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 120; i++) { const y = Math.pow(R(i, 1), 1.6) * H * 0.5, x = R(i, 2) * W, a = (0.25 + 0.6 * R(i, 3)) * (1 - y / (H * 0.55)) * (0.75 + 0.25 * Math.sin(t * (0.8 + 2 * R(i, 4)) + i));
    if (a <= 0.02) continue; const r = 0.55 + 0.9 * R(i, 5);
    c.fillStyle = `rgba(235,235,255,${a})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    if (R(i, 6) > 0.9) { c.strokeStyle = `rgba(235,235,255,${a * 0.5})`; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x - r * 4, y); c.lineTo(x + r * 4, y); c.moveTo(x, y - r * 4); c.lineTo(x, y + r * 4); c.stroke(); } }
} }]; };

// ---------- hills (layered paper domes), tree-clump ridge, hedge walls, and the moon ----------
const XREF = -100, ZREF = -1400;
// Each hill layer is a set of big rounded domes (centre a, half-width w, height h as a fraction of distance), softly merged.
// Colours step from near-black teal (near) to lighter blue (far); `top` and `bot` are what they look like under nominal dusk.
const HILLS = [
  { z: 30000, top: [62, 84, 168], bot: [50, 68, 144], sp: 0.34, h0: 0.075, h1: 0.12, sd: 31, rim: 0.3 },
  { z: 21000, top: [44, 66, 146], bot: [34, 52, 120], sp: 0.30, h0: 0.07, h1: 0.11, sd: 41, rim: 0.28 },
  { z: 14500, top: [30, 52, 120], bot: [22, 40, 98], sp: 0.26, h0: 0.062, h1: 0.098, sd: 51, rim: 0.26 },
  { z: 10500, top: [20, 40, 94], bot: [14, 30, 74], sp: 0.23, h0: 0.05, h1: 0.082, sd: 61, rim: 0.24 },
  { z: 8200, top: [12, 30, 66], bot: [8, 22, 52], sp: 0.20, h0: 0.04, h1: 0.066, sd: 71, rim: 0.22 },
  { z: 6900, top: [7, 24, 38], bot: [5, 18, 32], sp: 0.17, h0: 0.03, h1: 0.052, sd: 81, rim: 0.2, bush: 1 }];
const domes = (hl, a) => { const k0 = Math.floor(a / hl.sp); let acc = 0;
  for (let k = k0 - 2; k <= k0 + 3; k++) { const cc = (k + 0.5 + (R(k, hl.sd) - 0.5) * 0.7) * hl.sp, w = hl.sp * (0.4 + 0.32 * R(k, hl.sd + 1)), hh = lerp(hl.h0, hl.h1, R(k, hl.sd + 2)),
      u = (a - cc) / w; if (Math.abs(u) >= 1) continue; acc += Math.pow(hh * Math.pow(1 - u * u, 0.8), 5); }
  return Math.pow(acc, 0.2); };
const clumps = (hl, a) => { const cw = 0.032, i0 = Math.floor(a / cw); let m = 0;
  for (let i = i0 - 2; i <= i0 + 2; i++) { if (R(i, hl.sd + 7) < 0.35) continue; const cx = (i + R(i, hl.sd + 8)) * cw, r = cw * (0.45 + 0.7 * R(i, hl.sd + 9)), u = (a - cx) / r;
    if (Math.abs(u) < 1) m = Math.max(m, r * 0.9 * Math.sqrt(1 - u * u) * (0.5 + R(i, hl.sd + 10))); }
  return m; };
const ridge = (hl, a) => domes(hl, a) + 0.0035 * noise(a * 38, hl.sd + 4) + (hl.bush ? clumps(hl, a) * 0.6 : 0);
// A dark bush or hedge wall (leafy scalloped top, rim-lit lumps). `o`: z, h0..h1 profile height, lump radius, colours.
function bushWall(c, s, z, o) {
  const m = c.getTransform(), xl = (-60 - m.e) / s, xr = (W + 60 - m.e) / s, step = Math.max(1.5, 3.2 / s), pts = [], lumpR = o.lump;
  const top = x => { let y = o.h0 + (o.h1 - o.h0) * (0.5 + 0.5 * noise(x * o.fq, o.sd)) + o.h0 * 0.35 * noise(x * o.fq * 3.1, o.sd + 3), best = 0;
    const cw = lumpR * 1.5, i0 = Math.floor(x / cw);
    for (let i = i0 - 2; i <= i0 + 2; i++) { const cx = (i + R(i, o.sd + 5)) * cw, r = lumpR * (0.55 + 0.8 * R(i, o.sd + 6)), u = (x - cx) / r; if (Math.abs(u) < 1) best = Math.max(best, r * Math.sqrt(1 - u * u) * 0.9); }
    return y + best; };
  for (let x = Math.floor(xl / step) * step; x <= xr + step; x += step) pts.push([x, -top(x)]);
  const yb = 6, path = k => { k.moveTo(pts[0][0], yb); for (const p of pts) k.lineTo(p[0], p[1]); k.lineTo(pts[pts.length - 1][0], yb); k.closePath(); };
  const mid = -o.h1 * 0.55, cT = lit(base(fog(o.top, z, 0.9)), 0, -o.h1, z, 0), cB = lit(base(fog(o.bot, z, 0.9)), 0, 0, z, 0);
  const g = c.createLinearGradient(0, -o.h1 * 1.25, 0, 0); g.addColorStop(0, cT); g.addColorStop(1, cB);
  P.card(c, path, g, { lift: Math.max(0.5, 2 / s), tex: 0.3, shadow: 0.55, edge: 0 });
  c.save(); c.beginPath(); path(c); c.clip();
  const nB = Math.min(260, Math.ceil((xr - xl) * o.h1 / (lumpR * lumpR * 0.9)));      // leaf-clump blotches: lighter and darker teal
  for (let i = 0; i < nB; i++) { const bx = xl + (xr - xl) * R(i, o.sd + 20), tx = -top(bx), by = tx + (0 - tx) * Math.pow(R(i, o.sd + 21), 0.8), r = lumpR * (0.25 + 0.5 * R(i, o.sd + 22)), dk = R(i, o.sd + 23) < 0.5;
    c.fillStyle = dk ? css([2, 8, 20], 0.28) : css(mixc(o.top, [120, 170, 180], 0.4), 0.18 * (1 - (by - tx) / (o.h1 + 1))); c.beginPath(); c.ellipse(bx, by, r * 1.3, r * 0.8, R(i, o.sd + 24) - 0.5, 0, TAU); c.fill(); }
  c.restore();
  c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
  c.strokeStyle = lit(base(mixc(o.top, [150, 200, 230], 0.6)), 0, -o.h1, z, 0.1, o.rim); c.lineWidth = 1.3 / s; c.stroke();
}
const HEDGES = [
  { z: 6300, h0: 70, h1: 150, lump: 46, fq: 0.0042, sd: 910, top: [14, 38, 62], bot: [8, 22, 44], rim: 0.28 },
  { z: 5400, h0: 80, h1: 170, lump: 40, fq: 0.0055, sd: 930, top: [12, 34, 54], bot: [6, 20, 38], rim: 0.28 },
  { z: 4500, h0: 90, h1: 200, lump: 36, fq: 0.0065, sd: 950, top: [10, 30, 46], bot: [5, 17, 32], rim: 0.3 },
  { z: 3700, h0: 70, h1: 190, lump: 32, fq: 0.0085, sd: 970, top: [9, 28, 42], bot: [4, 14, 28], rim: 0.3 }];
// calm softens the far field: a thin dusk-blue veil just in front of the hills lowers their contrast and saturation (the big silhouettes stay)
const CALMVEIL = { z: 5900, screen: true, draw(c) { const k = clamp((CUR.hills && CUR.hills.calm) || 0); if (k <= 0) return;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgba(34,42,84,${0.16 * k})`); g.addColorStop(0.55, `rgba(40,50,88,${0.34 * k})`); g.addColorStop(1, `rgba(40,50,88,${0.3 * k})`);
  c.fillStyle = g; c.fillRect(0, 0, W, H); } };
WD.hills = st => { CUR.hills = st; if (WD._hills) return st && st.calm > 0 ? [...WD._hills, CALMVEIL] : WD._hills;
  const items = HILLS.map(hl => ({ z: hl.z, draw(c, s) {
    const m = c.getTransform(), d = hl.z - ZREF, xl = (-90 - m.e) / s, xr = (W + 90 - m.e) / s, step = 8 / s, pts = [];
    for (let x = xl; x <= xr + step; x += step) pts.push([x, -ridge(hl, (x - XREF) / d) * d]);
    const ytop = -hl.h1 * 1.25 * d, yb = 0.25 * d;
    const g = c.createLinearGradient(0, ytop, 0, 0);
    g.addColorStop(0, lit(base(hl.top), 0, ytop, hl.z, 0)); g.addColorStop(1, lit(base(hl.bot), 0, 0, hl.z, 0));
    const path = c => { c.moveTo(pts[0][0], yb); for (const p of pts) c.lineTo(p[0], p[1]); c.lineTo(pts[pts.length - 1][0], yb); c.closePath(); };
    c.save(); c.shadowColor = 'rgba(4,6,30,0.7)'; c.shadowBlur = 18; c.shadowOffsetY = -6; c.fillStyle = g; c.beginPath(); path(c); c.fill(); c.restore();
    P.card(c, path, g, { lift: 0, tex: 0.5 });
    c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.strokeStyle = lit(base(mixc(hl.top, [190, 200, 245], 0.55)), 0, ytop, hl.z, 0.1, hl.rim); c.lineWidth = 1.6 / s; c.stroke();
  } }));
  const hedges = HEDGES.map(o => ({ z: o.z, draw(c, s) { bushWall(c, s, o.z, o); } }));
  // moon, and a few broken, tapered wisps of cloud near it (some lit on their underside)
  const MX = XREF + 0.14 * (40000 - ZREF), MY = -0.128 * (40000 - ZREF), MR = 0.0325 * (40000 - ZREF);
  const moon = { z: 40000, draw(c) {
    const X = MX, Y = MY, r = MR;
    let g = c.createRadialGradient(X, Y, r * 0.8, X, Y, r * 6); g.addColorStop(0, 'rgba(200,205,255,0.30)'); g.addColorStop(0.3, 'rgba(170,180,245,0.12)'); g.addColorStop(1, 'rgba(170,180,245,0)');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, r * 6, 0, TAU); c.fill();
    g = c.createRadialGradient(X - r * 0.15, Y - r * 0.1, r * 0.1, X, Y, r); g.addColorStop(0, '#f7f6fc'); g.addColorStop(0.8, '#e8e8f6'); g.addColorStop(1, '#cdd0ea');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, r, 0, TAU); c.fill();
    c.save(); c.beginPath(); c.arc(X, Y, r, 0, TAU); c.clip();
    for (let i = 0; i < 11; i++) { const a = R(i, 301) * TAU, rr = Math.sqrt(R(i, 302)) * 0.78 * r, cr2 = r * (0.1 + 0.22 * R(i, 303));
      const cg = c.createRadialGradient(X + Math.cos(a) * rr, Y + Math.sin(a) * rr, 0, X + Math.cos(a) * rr, Y + Math.sin(a) * rr, cr2);
      cg.addColorStop(0, 'rgba(150,158,208,0.34)'); cg.addColorStop(1, 'rgba(150,158,208,0)'); c.fillStyle = cg; c.fillRect(X - r, Y - r, 2 * r, 2 * r); }
    c.restore(); } };
  const WISPS = [[-3.4, 0.95, 3.0, 0.5, -0.06], [-6.0, 1.7, 3.6, 0.6, 0.03], [2.9, 1.2, 2.6, 0.42, 0.07], [5.0, 0.3, 2.0, 0.36, -0.14], [-1.4, -1.8, 3.0, 0.4, 0.1], [7.6, 1.9, 3.4, 0.55, -0.04], [0.5, 0.9, 1.5, 0.22, -0.1]];
  const clouds = { z: 39400, draw(c, s, t) {
    const dr = (t || 0) * 0.012;
    WISPS.forEach((w, i) => { const cx0 = MX + (w[0] + dr * (1 + 0.3 * i)) * MR, cy0 = MY + w[1] * MR, nearMoon = Math.hypot(w[0], w[1]) < 3.4;
      for (let j = 0; j < 3; j++) {   // each wisp is three offset strands, so it is broken and fibrous rather than one clean lens
        const L = w[2] * MR * [1, 0.68, 0.46][j], th = w[3] * MR * [1, 0.7, 0.5][j], ox = (j - 0.8) * L * 0.2 + (R(i, 600 + j) - 0.5) * L * 0.2, oy = (j - 1) * th * 0.5 + (R(i, 610 + j) - 0.5) * th * 0.3;
        c.save(); c.translate(cx0 + ox, cy0 + oy); c.rotate(w[4] + (R(i, 620 + j) - 0.5) * 0.08);
        const prof = (u, k) => Math.pow(Math.sin(Math.PI * clamp(u)), 1.1) * (1 + 0.3 * noise(u * 4 + i * 3 + j, 40 + k));
        for (let l = 0; l < 3; l++) { const f = [1.0, 0.62, 0.32][l], al = [0.05, 0.065, 0.09][l], tp = [], bt = [];
          for (let k = 0; k <= 26; k++) { const u = k / 26, pr = prof(u, l) * th * f * 0.5, bend = Math.sin(u * 3.2 + i + j) * th * 0.45; tp.push([(u - 0.5) * L, bend - pr * 0.85]); bt.push([(u - 0.5) * L, bend + pr * 1.15]); }
          c.fillStyle = css([140, 140, 216], al); c.beginPath(); tp.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); for (let k = bt.length - 1; k >= 0; k--) c.lineTo(bt[k][0], bt[k][1]); c.closePath(); c.fill();
          if (l === 1 && nearMoon && j < 2) { c.strokeStyle = css([228, 222, 255], 0.2); c.lineWidth = th * 0.09; c.beginPath(); bt.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); } }
        c.restore(); } }); } };
  WD._hills = [...items, ...hedges, clouds, moon]; return st && st.calm > 0 ? [...WD._hills, CALMVEIL] : WD._hills; };

// ---------- ground: turf rows by screen row (no gaps), undergrowth clumps, world-anchored scatter ----------
const SOILC = [50, 50, 44], DEEP = [24, 66, 58], MIDG = [48, 102, 64], MOSSG = [92, 124, 58], TEAL = [34, 90, 90];
// 2D value noise (-1..1) on a unit grid, smoothstep-interpolated. The turf tints use it in world x and z, so its patches are blotches lying
// on the ground; a 1D noise of a slanted line (what this used before) made long straight stripes running into the distance that read as paths.
const noise2 = (x, z, sd) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const h = (a, b) => R(a * 7919 + b * 104729 + sd * 31, sd);
  return lerp(lerp(h(i, j), h(i + 1, j), u), lerp(h(i, j + 1), h(i + 1, j + 1), u), v) * 2 - 1; };
const turfCol = (x, z) => { const p = noise2(x / 300, z / 300, 21), q = noise2(x / 130 + 7.3, z / 130, 23), r = noise2(x / 46 - 3.1, z / 46, 29);
  let c = mixc(DEEP, MIDG, ss(-0.5, 0.7, p)); c = mixc(c, MOSSG, ss(0.3, 0.95, q) * 0.7); c = mixc(c, TEAL, ss(0.2, 0.9, -q) * 0.55); return mixc(c, SOILC, ss(0.55, 0.95, r) * 0.3); };
const turfA = (x, z) => sh(fog(mul(turfCol(x, z), nearK(z)), z, 0.8), x, -2, z, 0.04), turfAt = (x, z) => rg(turfA(x, z));
// The turf's colour and light, as one smooth picture of the whole frame (TURFC). Each WD.ground() call makes a key (tm); the first strip
// drawn for it samples turfAt() on a coarse screen grid (every 24 px across, 8 px down, each point mapped back to the ground point it
// shows) and upscales that grid with smoothing, so the light is interpolated in both directions. Every strip then copies its own rows
// out of it. Before, each strip was one flat row of colour stops: the light stepped at every strip boundary (a blocky mosaic in dark
// high views, stair-steps and radial wedges round a glow). A rotated frame (cam.roll) falls back to the per-strip gradient.
const TURFC = P.off(), TURFX = TURFC.getContext('2d'), TG = { cw: 24, rh: 8 };
let TURFK = null;
function turfTex(tm, m, s, z) {
  if (Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9) return false;
  // the lens is read off the strip's own transform (scale s at depth z gives the focal length that actually projects it), so a second
  // ground built with a stand-in lens (act 1's groundFill) shares the same picture; the key is the frame's story state and that lens
  const cam = tm.cam, hh = Math.max(-cam.y, 3), f = s * (z - cam.z), shx = m.e - (W / 2 - cam.x * s), shy = m.f - (H / 2 - cam.y * s);
  if (TURFK && TURFK.st === tm.st && Math.abs(TURFK.f - f) < 0.01 * f && TURFK.cam.x === cam.x && TURFK.cam.y === cam.y && TURFK.cam.z === cam.z && Math.abs(TURFK.shx - shx) < 0.5 && Math.abs(TURFK.shy - shy) < 0.5) return true;
  const { cw, rh } = TG, dz = 6500 - cam.z, y0 = Math.max(0, Math.floor(H / 2 + shy + hh * f / Math.max(dz, 1))) - rh, nC = Math.ceil((W + 4 * cw) / cw) + 1, nR = Math.max(2, Math.ceil((H - y0) / rh) + 2);
  const small = P.off(nC, nR), sx = small.getContext('2d'), img = sx.createImageData(nC, nR);
  for (let j = 0; j < nR; j++) { const Y = y0 + j * rh, dy = Y - shy - H / 2, d = dy > 0 ? Math.min(hh * f / dy, dz) : dz, zz = cam.z + d;
    for (let i = 0; i < nC; i++) { const X = -2 * cw + i * cw, xx = cam.x + (X - shx - W / 2) * d / f, col = turfA(xx, zz), o = (j * nC + i) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255; } }
  sx.putImageData(img, 0, 0);
  TURFX.setTransform(1, 0, 0, 1, 0, 0); TURFX.clearRect(0, 0, W, H); TURFX.imageSmoothingEnabled = true; TURFX.imageSmoothingQuality = 'high';
  TURFX.drawImage(small, 0, 0, nC, nR, -2 * cw - cw / 2, y0 - rh / 2, nC * cw, nR * rh);
  TURFK = { st: tm.st, cam: { x: cam.x, y: cam.y, z: cam.z }, f, shx, shy }; return true;
}
function strip(c, s, z, ext, tm) {
  const m = c.getTransform(), xl = Math.max((-60 - m.e) / s, -9000), xr = Math.min((W + 60 - m.e) / s, 9000);
  const hole = trenchHole(z, ext);
  if (tm && turfTex(tm, m, s, z)) {   // copy this strip's rows out of the smooth turf picture, through the strip's outline (minus the trench opening)
    const ya = Math.max(0, Math.floor(m.f) - 1), yb = Math.min(H, Math.ceil(m.f + ext * s) + 1); if (yb <= ya) return;
    c.save(); c.beginPath(); c.rect(xl, 0, xr - xl, ext); c.clip();
    if (hole) { c.beginPath(); c.rect(xl, -ext, xr - xl, 3 * ext); polyP(c, hole); c.clip('evenodd'); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(TURFC, 0, ya, W, yb - ya, 0, ya, W, yb - ya); c.restore(); return;
  }
  const n = clamp(Math.ceil((xr - xl) * s / 36), 14, 70), g = c.createLinearGradient(xl, 0, xr, 0);
  for (let k = 0; k <= n; k++) { const x = lerp(xl, xr, k / n); g.addColorStop(k / n, turfAt(x, z)); }
  c.fillStyle = g;
  if (!hole) { c.fillRect(xl, 0, xr - xl, ext); return; }
  // the trench opening is cut out of the turf: through it the lens sees down into the channel (its far wall and bed, drawn by the slices)
  c.save(); c.beginPath(); c.rect(xl, 0, xr - xl, ext); c.clip();
  c.beginPath(); c.rect(xl, -ext, xr - xl, 3 * ext); polyP(c, hole); c.fill('evenodd'); c.restore();
}
// The opening of the trench over the rows a turf strip at depth z covers (down to ext below it, i.e. nearer ground), as local points.
function trenchHole(z, ext) {
  if (GC.y > -0.5 || z < 430) return null;
  const k = 1 + ext / (-GC.y), zb = GC.z + (z - GC.z) / k, zt = z + 2, zl = zb - 2; if (zl > 2675 || zt < 433) return null;
  const n = clamp(Math.ceil((zt - zl) / 1.5), 2, 60), L = [], Rr = [];
  for (let i = 0; i <= n; i++) { const zz = lerp(zt, zl, i / n); if (zz < 432.6 || zz > 2675) continue; const b = bedAt(zz); if (!b) continue;
    L.push(gp(z, b.xc - b.w + 0.15, 0, zz)); Rr.push(gp(z, b.xc + b.w - 0.15, 0, zz)); }
  if (L.length < 2) return null;
  return [...L, ...Rr.reverse()];
}
// Dark leafy mounds on far ground: world-anchored rows of rough-topped undergrowth with no edge highlight (they break the plane without terraces).
const RIDGES = []; for (let z = 3200, n = 0; z < 6300; n++) { if (R(n, 403) > 0.55) RIDGES.push({ z, A: 5 + 9 * R(n, 401) + z * 0.006, sd: n * 13 + 5 }); z += 140 + 0.16 * z; }
function ridgeCard(c, s, rd) {
  const m = c.getTransform(); if (m.f > H + 80 + rd.A * s || m.f < -50) return;
  const z = rd.z, xl = Math.max((-60 - m.e) / s, -9000), xr = Math.min((W + 60 - m.e) / s, 9000), bd = bedAt(z), step = Math.max(1.2, 3.2 / s), pts = [];
  for (let x = Math.floor(xl / step) * step; x <= xr + step; x += step) { let y = rd.A * (0.35 + 0.65 * (0.5 + 0.5 * noise(x * 0.012, rd.sd))); y += rd.A * 0.5 * Math.abs(noise(x * 0.23, rd.sd + 1)) * (0.4 + 0.6 * R(Math.floor(x / (step * 2)), rd.sd)); pts.push([x, -y]); }
  const hole = bd ? [bd.xc - bd.wc, bd.xc + bd.wc] : null;
  const g = c.createLinearGradient(0, -rd.A * 1.6, 0, 1), nk = nearK(z);
  g.addColorStop(0, rg(sh(fog(mul(DEEP, 0.85 * nk), z, 0.8), 0, -rd.A, z, 0.05))); g.addColorStop(1, rg(sh(fog(mul(DEEP, 0.5 * nk), z, 0.8), 0, 0, z, 0.02)));
  const sp = hole ? [[xl, hole[0]], [hole[1], xr]] : [[xl, xr]];
  c.fillStyle = g; c.beginPath(); for (const [a, b] of sp) { const seg = pts.filter(p => p[0] >= a && p[0] <= b); if (seg.length < 2) continue;
    c.moveTo(seg[0][0], 1); for (const p of seg) c.lineTo(p[0], p[1]); c.lineTo(seg[seg.length - 1][0], 1); c.closePath(); } c.fill();
}

// ---- undergrowth and scatter pieces (all matte, no specular dots) ----
const GR = { dark: [36, 90, 76], mid: [66, 138, 84], light: [124, 182, 96], teal: [44, 118, 118], dry: [120, 146, 76] };
const tnBase = (col, x, y, z, k = 1, e = 0.1) => rg(sh(mul(fog(col, z, 0.6), k * nearK(z)), x, y, z, e));
const tn = tnBase;
function bushClump(c, s, x, z, sz, seed, o = {}) {
  const n = 5 + (seed % 3) + (sz * s > 30 ? 2 : 0), col = o.col || (seed % 3 === 0 ? GR.teal : seed % 3 === 1 ? GR.mid : GR.dark), px = sz * s, ang = [];
  for (let i = 0; i < n; i++) ang.push(((i + 0.5) / n - 0.5) * 2.3 + (R(seed, i + 3) - 0.5) * 0.4);
  ang.sort((a, b) => Math.abs(b) - Math.abs(a));
  ang.forEach((a, i) => { const L = sz * (1.0 + 1.0 * R(seed, i + 40)) * (1 - 0.3 * Math.abs(a) / 1.15), Wd = L * (0.2 + 0.07 * R(seed, i + 60)), t = 0.75 + 0.45 * R(seed, i + 80), bend = (a > 0 ? 0.3 : -0.3) * (0.4 + R(seed, i + 120));
    c.save(); c.translate(x + a * sz * 0.35, 0); c.rotate(a * 0.8 + (R(seed, i + 100) - 0.5) * 0.2);
    const g = c.createLinearGradient(0, 0, L * bend, -L); g.addColorStop(0, tn(col, x, -L * 0.1, z, 0.42 * t, 0.03)); g.addColorStop(0.6, tn(col, x, -L * 0.5, z, 0.85 * t, 0.1)); g.addColorStop(1, tn(mixc(col, GR.light, 0.35), x, -L, z, 1.2 * t, 0.2));
    c.fillStyle = g; c.beginPath(); leafP(L, Wd, bend)(c); c.fill();
    if (px > 26) { c.strokeStyle = css([190, 225, 190], 0.16); c.lineWidth = Math.max(0.2, 0.6 / s); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * bend * 0.1, -L * 0.55, L * bend, -L * 0.95); c.stroke(); }
    c.restore(); });
}
function fern(c, s, x, z, sz, seed) {
  const H0 = sz * (1.4 + 0.7 * R(seed, 2)), nF = sz * s > 22 ? 7 : 5;
  for (let f = 0; f < 3; f++) { const ox = (f - 1) * sz * 0.3, sc = f === 1 ? 1 : 0.72 + 0.2 * R(seed, 30 + f), dk = f === 1 ? 1 : 0.62, dr = f === 1 ? (R(seed, 3) < 0.5 ? -1 : 1) : (f === 0 ? -1 : 1) * (0.8 + 0.5 * R(seed, 40 + f));
    const xs = t => x + ox + dr * H0 * sc * 0.55 * t * t, ys = t => -H0 * sc * Math.sin(t * 1.35) / Math.sin(1.35);
    c.strokeStyle = tn(GR.dark, x, -H0 * 0.4, z, 0.9 * dk, 0.05); c.lineWidth = Math.max(0.4 / s, sz * 0.04); c.lineCap = 'round'; c.beginPath(); c.moveTo(xs(0), ys(0));
    for (let k = 1; k <= 8; k++) c.lineTo(xs(k / 8), ys(k / 8)); c.stroke();
    for (let i = 1; i <= nF; i++) { const t = 0.16 + 0.8 * i / nF, ll = sz * sc * 0.95 * Math.sin(Math.PI * Math.pow(t, 0.75)) + sz * 0.08, rt = Math.atan2(xs(t + 0.02) - xs(t - 0.02), -(ys(t + 0.02) - ys(t - 0.02)));
      for (const sd of [-1, 1]) { c.save(); c.translate(xs(t), ys(t)); c.rotate(rt + sd * (1.2 - 0.5 * t));
        c.fillStyle = tn(i % 2 ? GR.mid : GR.teal, x, -H0 * t, z, (0.6 + 0.5 * t) * dk, 0.1); c.beginPath(); leafP(ll, ll * 0.16, 0.12 * sd)(c); c.fill(); c.restore(); } }
  }
}
function grassTuft(c, s, x, z, sz, seed) {
  const nb = 9 + (seed % 5); const tones = [GR.dark, GR.mid, GR.light];
  for (let pass = 0; pass < 3; pass++) { c.fillStyle = tn(tones[pass], x, -sz, z, 0.55 + 0.4 * pass, 0.08); c.beginPath();
    for (let i = 0; i < nb; i++) { if (i % 3 !== pass) continue; const a = (R(seed, i + 40) - 0.5) * 2.0, hh = sz * (0.8 + 1.5 * R(seed, i + 50)) * (0.85 + 0.15 * pass), bx = x + (i - nb / 2) * sz * 0.09, wb = sz * 0.09, tx = bx + a * hh * 0.55;
      c.moveTo(bx - wb, 0); c.quadraticCurveTo(bx - wb * 0.3 + a * hh * 0.12, -hh * 0.6, tx, -hh); c.quadraticCurveTo(bx + wb * 0.6 + a * hh * 0.25, -hh * 0.55, bx + wb, 0); c.closePath(); } c.fill(); }
}
// A small three-leaflet clover with heart-notched leaflets. col: leaf tint; lit by position. ang: rotation of the whole trefoil.
function clover3(c, s, cx, cy, r, ang, x, z, o = {}) {
  const dk = o.dark ?? 1, px = r * s, tn = o.disp ? ((col, xx, yy, zz, k, e) => D(mul(col, k), xx, yy, zz, 0, e)) : tnBase;
  for (let i = 0; i < 3; i++) { c.save(); c.translate(cx, cy); c.rotate(ang + i * TAU / 3 + (i === 0 ? 0 : 0.05 * (i - 1))); const rr = r * (0.92 + 0.14 * R(o.seed || 1, i));
    const g = c.createLinearGradient(0, 0, 0, -rr); g.addColorStop(0, tn([22, 56, 50], x, cy, z, dk * 0.9, 0.04)); g.addColorStop(0.7, tn([36, 80, 62], x, cy, z, dk, o.disp ? 0.02 : 0.1)); g.addColorStop(1, tn([54, 104, 72], x, cy - rr, z, dk, o.disp ? 0.04 : 0.18));
    P.card(c, heartP(rr), g, { lift: px > 14 ? 1.2 / Math.max(s, 0.3) : 0, tex: 0, shadow: px > 14 ? 0.3 : 0, edge: 0 });
    if (px > 10) { c.save(); c.beginPath(); heartP(rr)(c); c.clip();
      c.strokeStyle = css([160, 205, 150], 0.3 * dk); c.lineWidth = Math.max(0.3, rr * 0.07); c.beginPath(); c.moveTo(-rr * 0.55, -rr * 0.52); c.lineTo(0, -rr * 0.36); c.lineTo(rr * 0.55, -rr * 0.52); c.stroke();   // pale chevron
      c.lineWidth = Math.max(0.2, rr * 0.022); c.strokeStyle = css([170, 215, 170], 0.22 * dk); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -rr * 0.78);
      for (let j = 1; j <= 4; j++) { const yy = -rr * 0.12 * j; c.moveTo(0, yy); c.quadraticCurveTo(-rr * 0.2, yy - rr * 0.08, -rr * (0.62 - 0.03 * j), yy - rr * (0.2 + 0.05 * j)); c.moveTo(0, yy); c.quadraticCurveTo(rr * 0.2, yy - rr * 0.08, rr * (0.62 - 0.03 * j), yy - rr * (0.2 + 0.05 * j)); } c.stroke(); c.restore();
      c.strokeStyle = css([150, 200, 235], o.rim ?? 0.5); c.lineWidth = Math.max(0.25, rr * 0.035); c.beginPath(); heartP(rr)(c); c.stroke(); }   // cool moonlit rim
    c.restore(); }
}
function scatter(x, z, sz, type, seed, ka = 1) {
  return { z, scat: { x, z, sz, type }, draw(c, s) {   // scat: a shot may lift a plant or pebble out of an action's way
    const tall = type === 3 ? 2.6 : type === 6 || type === 2 ? 2.1 : type === 4 ? 1.5 : 1.3;
    if (!vis(c, s, x - sz * 1.6, x + sz * 1.6, -sz * tall, 2, 20)) return;
    let sa = ka * (type === 0 || type === 1 || type === 7 ? 1 : stageAlpha(c, CUR.ground, x, sz * tall, z, sz * 1.6)); if (sa <= 0.02) return;
    // calm also quiets the plants a glow lights up (the near field round a lit flower): their share of the warm light drops, and the
    // most strongly lit of them thin out further, so the lit channel and the dark front are the strong edges, not a field of bright blades
    const calm = clamp((CUR.ground && CUR.ground.calm) || 0); XS = 1;
    if (calm > 0 && type >= 2 && type <= 6) { const a = AMBC || (AMBC = P.light(1e7, 0, 1e7)), m = P.light(x, -sz, z), lk = clamp(((m[0] - a[0]) + 0.5 * (m[1] - a[1])) / 0.7);
      if (lk > 0.01) { XS = 1 - 0.6 * calm * lk; sa *= (1 - 0.35 * calm * lk) * calmKeep(R(seed, 77), 0.9 * calm * lk); if (sa <= 0.02) { XS = 1; return; } } }
    if (sa < 0.99) { c.save(); c.globalAlpha = sa; }
    if (type === 0) {   // moss clump
      const b = GR.mid, w = sz * 1.3;
      c.fillStyle = css([3, 6, 18], 0.4); c.beginPath(); c.ellipse(x + sz * 0.1, 0.3, w * 0.9, sz * 0.12, 0, 0, TAU); c.fill();
      c.fillStyle = tn([34, 70, 44], x, -sz * 0.2, z, 0.7, 0.05); c.beginPath(); c.ellipse(x, -sz * 0.14, w * 0.78, sz * 0.3, 0, Math.PI, TAU); c.lineTo(x + w * 0.78, 0); c.lineTo(x - w * 0.78, 0); c.closePath(); c.fill();
      const n = sz * s > 12 ? 20 : 8; for (let i = 0; i < n; i++) { const a = R(seed, i + 1), rr = sz * (0.07 + 0.1 * R(seed, i + 9)), px = x + (a - 0.5) * w * 1.5, hump = 1 - ((a - 0.5) * 2) ** 2, py = -sz * (0.08 + 0.3 * hump * (0.4 + R(seed, i + 50))) * 0.9;
        const tone = R(seed, i + 70); c.fillStyle = tn(tone < 0.4 ? [44, 94, 50] : tone < 0.8 ? [68, 120, 54] : [104, 148, 62], x, py, z, 0.8 + 0.4 * R(seed, i + 90), 0.1); c.beginPath(); c.arc(px, py, rr, 0, TAU); c.fill(); }
    } else if (type === 1) {   // pebble: matte, two-tone, with a soft contact shadow
      const col = [[104, 104, 120], [118, 108, 100], [96, 106, 126]][seed % 3], ry = sz * (0.26 + 0.14 * R(seed, 3)), rx = sz * (0.42 + 0.2 * R(seed, 4));
      c.fillStyle = css([3, 5, 16], 0.45); c.beginPath(); c.ellipse(x + sz * 0.1, 0.2, rx * 1.15, ry * 0.4, 0, 0, TAU); c.fill();
      const pp = []; for (let i = 0; i < 8; i++) { const a = TAU * i / 8, j = 0.88 + R(seed, i + 6) * 0.22; pp.push([x + Math.cos(a) * rx * j, -ry + Math.sin(a) * ry * j]); }
      const g = c.createLinearGradient(0, -ry * 2, 0, 0); g.addColorStop(0, tn(col, x, -ry, z, 1.0, 0.08)); g.addColorStop(1, tn(col, x, 0, z, 0.45, 0.02));
      c.fillStyle = g; c.beginPath(); smoothPoly(c, pp); c.fill();
    } else if (type === 2) grassTuft(c, s, x, z, sz, seed);
    else if (type === 3) fern(c, s, x, z, sz, seed);
    else if (type === 4) {   // clover plants on short stalks
      const nk = 1 + (seed % 3);
      for (let i = 0; i < nk; i++) { const hh = sz * (0.45 + 0.5 * R(seed, i + 5)), bx = x + (i - (nk - 1) / 2) * sz * 0.55, tx = bx + (R(seed, i + 9) - 0.5) * sz * 0.4;
        c.strokeStyle = tn(GR.dark, x, -hh / 2, z, 0.8, 0.06); c.lineWidth = Math.max(sz * 0.035, 0.4 / s); c.lineCap = 'round'; c.beginPath(); c.moveTo(bx, 0); c.quadraticCurveTo(bx, -hh * 0.6, tx, -hh); c.stroke();
        clover3(c, s, tx, -hh, sz * 0.38, (R(seed, i + 13) - 0.5) * 1.4, x, z, { seed: seed + i, rim: 0.3 }); }
    } else if (type === 5) {   // tiny flower on a hair stem
      const col = PAL[seed % 5], hh = sz * (1.2 + 0.8 * R(seed, 4)), gg = sh(col, x, -hh, z, 0.22);
      c.strokeStyle = tn(GR.mid, x, -hh * 0.5, z, 0.8, 0.1); c.lineWidth = Math.max(sz * 0.05, 0.4 / s); c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + sz * 0.15, -hh * 0.5, x + sz * 0.05, -hh); c.stroke();
      c.fillStyle = tn(GR.mid, x, -hh * 0.2, z, 0.9, 0.1); c.beginPath(); c.moveTo(x, -hh * 0.08); c.quadraticCurveTo(x - sz * 0.5, -hh * 0.25, x - sz * 0.6, -hh * 0.55); c.quadraticCurveTo(x - sz * 0.2, -hh * 0.2, x, -hh * 0.08); c.fill();
      for (let i = 0; i < 5; i++) { const a = TAU * i / 5; c.fillStyle = rg(gg); c.beginPath(); c.arc(x + sz * 0.05 + Math.cos(a) * sz * 0.17, -hh + Math.sin(a) * sz * 0.17, sz * 0.12, 0, TAU); c.fill(); }
      c.fillStyle = rg(sh([245, 200, 80], x, -hh, z, 0.4)); c.beginPath(); c.arc(x + sz * 0.05, -hh, sz * 0.09, 0, TAU); c.fill();
    } else if (type === 6) bushClump(c, s, x, z, sz, seed);
    else {   // soil / leaf-litter patch lying on the ground
      const ry = sz * clamp(-GC.y / Math.max(z - GC.z, 50), 0.04, 0.5) * 0.9 + 0.15 / s;
      c.fillStyle = tn([52, 38, 34], x, 0, z, 0.8, 0.02); c.beginPath(); c.ellipse(x, -ry * 0.4, sz * 1.1, ry, 0, 0, TAU); c.fill();
      if (sz * s > 10) for (let i = 0; i < 10; i++) { c.fillStyle = tn(R(seed, i) < 0.5 ? [86, 64, 50] : [36, 28, 28], x, 0, z, 0.9, 0.04); c.beginPath(); c.ellipse(x + (R(seed, i + 20) - 0.5) * sz * 1.6, -ry * R(seed, i + 30) * 0.8, sz * 0.08, sz * 0.04, R(seed, i + 40), 0, TAU); c.fill(); }
    }
    if (sa < 0.99) c.restore(); XS = 1; } };
}
const TALL = [1.3, 1, 2.1, 2.9, 1.4, 2.2, 2.1, 1];
const LODS = [{ c: 5, d0: 40, d1: 260, p: 0.30, sz: 3.2 }, { c: 16, d0: 260, d1: 1000, p: 0.40, sz: 9 }, { c: 50, d0: 1000, d1: 3200, p: 0.45, sz: 18 }, { c: 150, d0: 3200, d1: 6500, p: 0.4, sz: 44 }];
WD.ground = (st, cam) => {
  CUR.ground = st; Object.assign(GC, { x: cam.x, y: cam.y, z: cam.z, f: cam.f });
  const out = [], f = cam.f, h = Math.max(-cam.y, 3), dFar = 6500 - cam.z; if (dFar < 120) return out;
  const rFar = 540 + h * f / dFar, rows = [], tm = { st, cam: { x: cam.x, y: cam.y, z: cam.z } };   // tm: this frame's key for the smooth turf picture
  // Rows run well below the frame (to H + 610): a shot may tilt its frame down by a lens shift (act2's pitch() moves every item up by
  // up to ~500 px), and the turf must still reach the bottom edge then, or the backdrop shows as a hard dark band under the subjects.
  for (let r = rFar; r < H + 610; r += 5 + (r - 540) * 0.04) rows.push(r);
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k], d = h * f / (r - 540), z = cam.z + d, s = f / d, gap = (rows[k + 1] ?? H + 650) - r;
    if (d < 4) continue;
    const ext = (gap + 4) / s; out.push({ z, flat: true, draw(c, ss2) { strip(c, ss2, z, ext, tm); } });
  }
  const calm = clamp(st.calm || 0);
  for (const rd of RIDGES) { const d = rd.z - cam.z; if (d < 6 || d > 6500 - cam.z) continue; if (540 + h * f / d > H + 90 + rd.A * f / d) continue;
    const ka = calmKeep(R(rd.sd, 411), calm); if (ka <= 0.02) continue;
    out.push({ z: rd.z, draw(c, ss2) { if (ka < 0.99) { c.save(); c.globalAlpha = ka; ridgeCard(c, ss2, rd); c.restore(); } else ridgeCard(c, ss2, rd); } }); }
  // warm ground pools: a soft amber ellipse lying on the turf under the hero and the lit flowers (drawn as flat light on the ground plane)
  const hs = st.hero || {}, pools = [];
  const hp = Math.max(hs.petal || 0, 0.7 * (hs.climb || 0) * (hs.climb > 0.5 ? 1 : 0)); if (hp > 0.05) pools.push({ x: 0, z: 398, r: 120, a: 0.3 * hp * (hs.flicker ?? 1), deep: true });   // kept below the bloom threshold: the pool is a tint on the turf, not a light source
  if (typeof st.flower === 'function') { const cand = []; WD.FLOWERS.forEach((f, i) => { const fs = st.flower(i); if (fs && fs.petal > 0.3) cand.push({ x: f.x, z: f.z - 6, r: 46 + 0.4 * f.h, a: 0.34 * fs.petal }); }); cand.sort((a, b) => b.a - a.a); pools.push(...cand.slice(0, 8)); }
  for (const pl of pools) { const zn = pl.z - pl.r * 0.75; if (zn - cam.z < 25 || pl.z - cam.z > 5000) continue;
    out.push({ z: zn, flat: true, draw(c, s) {
      const pts = []; for (let i = 0; i < 24; i++) { const th = TAU * i / 24; pts.push(gp(zn, pl.x + Math.cos(th) * pl.r, 0, pl.z + Math.sin(th) * pl.r * 0.9)); }
      const q = gp(zn, pl.x, 0, pl.z), rxp = Math.max(...pts.map(p => Math.abs(p[0] - q[0]))), ryp = Math.max(Math.max(...pts.map(p => Math.abs(p[1] - q[1]))), rxp * 0.07);
      if (!vis(c, s, q[0] - rxp, q[0] + rxp, q[1] - ryp, q[1] + ryp, 20)) return;
      c.save(); c.globalCompositeOperation = 'lighter'; c.translate(q[0], q[1]); c.scale(1, ryp / rxp);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rxp); g.addColorStop(0, pl.deep ? `rgba(230,120,40,${pl.a})` : `rgba(255,160,64,${pl.a})`); g.addColorStop(0.45, `rgba(240,120,44,${pl.a * 0.4})`); g.addColorStop(1, 'rgba(220,100,40,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, rxp, 0, TAU); c.fill(); c.restore(); } }); }
  LODS.forEach((L, li) => {
    const z0 = Math.floor((cam.z + L.d0) / L.c), z1 = Math.ceil((cam.z + L.d1) / L.c);
    for (let iz = z0; iz <= z1; iz++) {
      const dm = (iz + 0.5) * L.c - cam.z; if (dm < 8) continue;
      const sd = f / dm, top = 540 + h * sd - L.sz * 2.4 * sd; if (top > H + 540) continue;
      const band = top > H + 20;   // below the frame unless the shot tilts it down (see the turf rows): only flat scatter there, never a plant in front of a face
      const xh = (W / 2) * dm / f + L.c * 3, i0 = Math.floor((cam.x - xh) / L.c), i1 = Math.ceil((cam.x + xh) / L.c);
      for (let ix = i0; ix <= i1; ix++) {
        const key = ix * 31 + li * 7919, q = R(key, iz); if (q > L.p) continue;
        const px = (ix + R(key, iz + 1000)) * L.c, pz = (iz + R(key, iz + 2000)) * L.c, ty = R(key, iz + 3000), seed = (Math.abs(ix * 7 + iz * 13) | 0) + li * 3;
        const szv = L.sz * (0.6 + 0.8 * R(key, iz + 4000));
        let type = ty < 0.09 ? 0 : ty < 0.13 ? 1 : ty < 0.34 ? 2 : ty < 0.43 ? 3 : ty < 0.5 ? 4 : ty < 0.55 ? 5 : ty < 0.86 ? 6 : 2;
        if (li === 3 && (type === 1 || type === 4 || type === 5)) type = 6; if (li === 0 && type === 3) type = 6;
        if (band && !(type === 0 || type === 1 || type === 7)) continue;
        let sz2 = szv * (type === 3 ? 1.3 : 1);
        if (nearBed(px, pz, 30 + (type === 0 || type === 1 || type === 7 ? 0 : sz2 * (TALL[type] > 2 ? 1.1 : 0.7)) + (type === 0 || type === 1 || type === 7 ? 0 : 30 * (1 - ss(70, 150, h))))) continue;   // taller plants keep further from the bed, so the stream is never buried
        if (pz < 380) sz2 *= clamp(0.34 * h / (sz2 * TALL[type]), 0.18, 1);   // plants between the camera and the garden stay under the eye line, so the garden (and the channel) can be seen
        let ka = 1;   // calm: half the grass, ferns, clover and tiny flowers go (a third of the bushes), and the rest soften with distance
        if (calm > 0 && type >= 2 && type <= 6) { ka = calmKeep(R(key, iz + 5000), type === 6 ? 0.6 * calm : calm) * calmFar(dm, calm); if (ka <= 0.02) continue; }
        out.push(scatter(px, pz, sz2, type, seed, ka));
      }
    }
  });
  return out; };

// ---------- the channel: a dusty cracked bed in thin depth slices over a dark soil underlay, and cobble rims ----------
// Everything flat is drawn in true ground-plane perspective (gp) so a slice, a mud plate or a stone top is the right shape from any camera.
// D: a colour given as what it should look like under nominal dusk (so pale stones stay pale). Light adds only a fraction of its excess
// here (these surfaces are pre-brightened), which keeps stones and sand going peach and amber near a glow instead of clipping to cream.
const GLOWD = 0.2;
const shD = (disp, x, y, z, e, gl = GLOWD) => { const m = P.light(x, y, z), a = AMBC || (AMBC = P.light(1e7, 0, 1e7)), q = [a[0] + (m[0] - a[0]) * gl, a[1] + (m[1] - a[1]) * gl * 0.8, a[2] + (m[2] - a[2]) * gl * 0.45];
  return [soft(disp[0] * (q[0] + e) / NOM[0]), soft(disp[1] * (q[1] + e) / NOM[1]), soft(disp[2] * (q[2] + e) / NOM[2])]; };
const HAZED = HAZE.map((v, i) => v * NOM[i]);
const Da = (disp, x, y, z, k = 0.5, e = 0.04) => shD(mixc(disp, HAZED, clamp((z - GC.z - 1400) / 8000, 0, 1) * k * 0.62), x, y, z, e);
const D = (disp, x, y, z, k = 0.5, e = 0.04) => rg(Da(disp, x, y, z, k, e));
const polyP = (c, pts) => { pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); };
const gSmooth = (c, z0, y, pts) => { const q = pts.map(p => gp(z0, p[0], y, p[1])); smoothPoly(c, q); };
const SLC = [];                                   // slices: [zn, zf] near/far depth, with the channel cross-section at both
for (let zf = 2675.5; zf > 432;) { const dz = 1.0 + (zf - 430) * 0.0009, zn = zf - dz, a = bedAt(zn), b = bedAt(zf); if (!a || !b) break;
  SLC.push({ zn, zf, a, b, i: SLC.length, u: (a.u + b.u) / 2, plates: [], dabs: [], pebs: [] }); zf = zn; }
const sliceAt = z => { let lo = 0, hi = SLC.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (SLC[m].zn > z) lo = m; else hi = m; } return z >= SLC[lo].zn ? SLC[lo] : SLC[hi]; };
const frame = s => { const p = at(s), t = tangent(s); return { p, t, n: [-t[1], t[0]] }; };
// pebbles on the bed, and soil/moss dabs between the rim stones, as world points assigned to the slice they lie in
for (let s = -S0 + 2, k = 0; s < LEN - 4; s += 7.2, k++) {
  for (let q = 0; q < 2; q++) { const j = k * 2 + q; if (R(j, 60) > 0.3) continue; const f = frame(s + R(j, 61) * 7), v = (R(j, 62) - 0.5) * 18, x = f.p[0] + f.n[0] * v, z = f.p[1] + f.n[1] * v;
    if (z > 432 && z < 2676) sliceAt(z).pebs.push({ x, z, r: 0.5 + 1.3 * R(j, 63), j }); }
  for (const side of [-1, 1]) for (let q = 0; q < 3; q++) { const j = k * 6 + q * 2 + (side > 0 ? 1 : 0); if (R(j, 70) > 0.8) continue; const f = frame(s + R(j, 71) * 7), v = side * (11.6 + R(j, 72) * 10), x = f.p[0] + f.n[0] * v, z = f.p[1] + f.n[1] * v;
    if (z > 432 && z < 2676 && !(side < 0 && z > 2538 && z < 2580)) sliceAt(z).dabs.push({ x, z, r: 1.6 + 3.2 * R(j, 73), moss: R(j, 74) < 0.5, j }); }   // (none where the near bank below the mouth is kept clear)
}
// The bed is wet only where water runs: between the upstream tail (st.waterTail) and the front (st.water). Behind the tail the bed is dry.
const bedWet = u => { const ch = CUR.channel; return !!ch && (ch.water ?? -1) >= 0 && u <= (ch.water ?? -1) && u >= (ch.waterTail ?? 0); };
// A trench slice: soil under the rim stones at ground level, the far inner bank as a soil wall (only the wall that faces the lens; the near
// bank is hidden behind its own lip, which the turf in front of it draws), and the bed DEPTH below the turf. A dry bed is dark silt with a
// darker damp line down its middle, a few pebbles and faint dried ripples; a wet bed is near black (the water drawn over it by fx.water).
// The wall is in shadow under the lip (the rim stones overhang it), so its top is the darkest band and it lightens only a little toward the
// bed: from any camera that sees it, the drop reads as a dark slot under the inner edge of the rim row, never as a lit kerb or a plank.
const WALL = [[8, 9, 14], [12, 13, 19], [20, 21, 28], [30, 31, 38], [34, 35, 42], [26, 27, 34], [16, 17, 23]], WALLK = [0, 0.18, 0.36, 0.52, 0.68, 0.86, 1];
const SILT = [[6, 7, 11], [13, 14, 19], [20, 21, 27], [18, 19, 25], [11, 12, 18], [18, 19, 25], [20, 21, 27], [13, 14, 19], [6, 7, 11]], SILTK = [0, 0.12, 0.28, 0.4, 0.5, 0.6, 0.72, 0.88, 1];
// The trench (wall, dry bed, its pebbles, the collar and lip) takes almost none of the warm glow: it stays cool, dark silt beside a lit
// flower, so it never warms into a brown path. (gl 0.03 of the light's excess instead of the default GLOWD 0.2.)
const Dc = (disp, x, y, z, k = 0.5, e = 0.03) => rg(shD(mixc(disp, HAZED, clamp((z - GC.z - 1400) / 8000, 0, 1) * k * 0.62), x, y, z, e, 0.03));
function drawSlice(c, s, sl) {
  const { a, b } = sl, z0 = sl.zn, e = 1.2 / s;
  const lx = Math.min(a.xc - a.wc, b.xc - b.wc), rx = Math.max(a.xc + a.wc, b.xc + b.wc);
  if (!vis(c, s, lx - 4, rx + 4, GC.y * 1.2 - 1000, 40, 20)) return;
  const wet = bedWet(sl.u) ? 1 : 0, da = depthAtS(a.s), db = depthAtS(b.s), zn = sl.zn, zf = sl.zf;
  const fillQ = (q, col) => { c.fillStyle = col; c.beginPath(); polyP(c, q); c.fill(); };
  // a narrow collar of trodden soil along each lip, under the inner edge of the rim stones (the turf runs right up to it, so the gaps
  // between cobbles show grass, never a paved edging)
  for (const sd of [-1, 1]) { const ka = a.w + 3.2 * a.w / 11, kb = b.w + 3.2 * b.w / 11;
    const q = [gp(z0, a.xc + sd * (a.w - 0.2), 0, zn), gp(z0, a.xc + sd * ka, 0, zn), gp(z0, b.xc + sd * kb, 0, zf), gp(z0, b.xc + sd * (b.w - 0.2), 0, zf)]; q[0][1] += e; q[1][1] += e;
    const g = c.createLinearGradient(q[0][0], q[0][1], q[1][0], q[1][1]); g.addColorStop(0, Dc([20, 22, 26], a.xc + sd * a.w, 0, z0)); g.addColorStop(1, D([28, 44, 38], a.xc + sd * ka, 0, z0));
    fillQ(q, g); }
  for (const d of sl.dabs) { if (d.r * s < 1.2) continue; const pp = []; for (let q = 0; q < 8; q++) { const th = TAU * q / 8; pp.push([d.x + Math.cos(th) * d.r * (0.8 + 0.4 * R(d.j, q + 80)), d.z + Math.sin(th) * d.r * 0.8 * (0.8 + 0.4 * R(d.j, q + 90))]); }
    c.fillStyle = d.moss ? D([54, 88, 46], d.x, 0, d.z, 0.5, 0.06) : Dc([22, 22, 24], d.x, 0, d.z); c.beginPath(); gSmooth(c, z0, 0, pp); c.fill();
    if (d.moss && d.r * s > 4) { c.fillStyle = D([68, 112, 62], d.x, -0.4, d.z, 0.5, 0.08); c.beginPath(); gSmooth(c, z0, -0.4, pp.map(p => [d.x + (p[0] - d.x) * 0.62, d.z + (p[1] - d.z) * 0.62])); c.fill(); } }
  // the inner bank that faces the lens: a soil wall from the lip down to the bed, lit by how squarely it faces the camera
  for (const sd of [-1, 1]) {
    const x0 = a.xc + sd * a.w, x1 = b.xc + sd * b.w, dx = x1 - x0, dz = zf - zn, nx = -sd * dz, nz = sd * dx, nl = Math.hypot(nx, nz) || 1;
    const xm = (x0 + x1) / 2, zm = (zn + zf) / 2, tx = GC.x - xm, tz = GC.z - zm, face = (nx * tx + nz * tz) / (nl * (Math.hypot(tx, tz) || 1));
    if (face <= 0.002) continue;
    const ov = 0.45, x0e = x0 - dx * ov, zne = zn - dz * ov;   // a little overlap toward the lens so neighbouring slices never leave a seam
    const T0 = gp(z0, x0e, 0, zne), T1 = gp(z0, x1, 0, zf), B1 = gp(z0, x1, db, zf), B0 = gp(z0, x0e, da, zne), lam = 0.62 + 0.38 * Math.sqrt(face);
    const gy0 = (T0[1] + T1[1]) / 2, gy1 = (B0[1] + B1[1]) / 2, g = c.createLinearGradient(0, gy0, 0, gy1);
    WALL.forEach((col, i) => g.addColorStop(WALLK[i], Dc(mul(wet ? mixc(col, [10, 22, 30], 0.55 + 0.3 * WALLK[i]) : col, lam), xm, WALLK[i] * da, zm, 0.5, 0.02)));
    fillQ([T0, T1, B1, B0], g);
    // the lip: a thin band of turf edge catching the moon, and the shadow it throws just under it
    const lip = (y0, y1, col) => fillQ([gp(z0, x0e, y0, zne), gp(z0, x1, y0, zf), gp(z0, x1, y1, zf), gp(z0, x0e, y1, zne)], col);
    if (da * s > 3) lip(-0.05, 0.3, Dc([58, 76, 66], xm, 0, zm, 0.5, 0.06));   // the cut edge of the turf, cool in the moonlight
    if (wet && da * s > 3) { const wy = 0.15 * da; lip(wy - 0.45, wy, css([150, 196, 214], 0.22)); }   // the wet tide line just above the water
  }
  // the bed, DEPTH below the turf
  const bq = [gp(z0, a.xc - a.w, da, zn), gp(z0, a.xc + a.w, da, zn), gp(z0, b.xc + b.w, db, zf), gp(z0, b.xc - b.w, db, zf)]; bq[0][1] += e; bq[1][1] += e;
  const n2 = 0.08 * noise(sl.zn * 0.03, 5), g = c.createLinearGradient(bq[3][0], 0, bq[1][0], 0), zc = sl.zn;
  const dm = 0.06 * noise(zc * 0.02, 9);   // the damp line wanders a little across the bed
  SILT.forEach((col, i) => { const k = clamp(SILTK[i] + (i > 0 && i < 8 ? dm : 0)), wc = wet ? mixc(col, [8, 20, 28], 0.8) : col; g.addColorStop(k, Dc(mul(wc, 1 + n2), a.xc, da, zc, 0.5, 0.03)); });
  c.fillStyle = g; c.beginPath(); polyP(c, bq); c.fill();
  if (!wet && s > 0.6) {
    for (const pb of sl.pebs) { if (pb.r * s < 1.5) continue; const dp = depthAtS(sAtZ(pb.z) ?? a.s), q = gp(z0, pb.x, dp, pb.z);
      c.fillStyle = css([6, 5, 9], 0.45); c.beginPath(); c.ellipse(q[0] + pb.r * 0.3, q[1], pb.r * 1.1, pb.r * 0.3, 0, 0, TAU); c.fill();
      c.fillStyle = Dc(R(pb.j, 4) < 0.5 ? [64, 66, 74] : [70, 70, 76], pb.x, dp - pb.r * 0.4, pb.z, 0.5, 0.04); c.beginPath(); c.ellipse(q[0], q[1] - pb.r * 0.4, pb.r, pb.r * 0.62, 0, 0, TAU); c.fill();
      if (pb.r * s > 4) { c.fillStyle = css([200, 210, 230], 0.18); c.beginPath(); c.ellipse(q[0] + pb.r * 0.25, q[1] - pb.r * 0.75, pb.r * 0.45, pb.r * 0.2, 0, 0, TAU); c.fill(); } }
  }
}
const STONES = [], TINTS = [[112, 120, 130], [104, 114, 128], [120, 126, 136], [114, 122, 124], [100, 112, 128]];   // cool grey and blue-grey cobbles; warmth comes only from the water light
for (const side of [-1, 1]) { let s = -S0 + 3, i = 0, skipped = false;
  while (s < LEN - 12) { const k = i * 2 + (side > 0 ? 1 : 0), L = 12 + R(k, 1) * 14, Wd = 10 + R(k, 2) * 7.5, Ht = (2.3 + R(k, 3) * 2.6) * (s < 70 ? 0.75 : 1);   // low, flat cobbles: a low camera still sees the stream over them
    const sm = s + L / 2, f = frame(sm), v = side * (11.3 + Wd / 2 - 1.2 + (R(k, 8) - 0.5) * 1.6), cx = f.p[0] + f.n[0] * v, cz = f.p[1] + f.n[1] * v;
    const rot = (R(k, 9) - 0.5) * 0.35, cs = Math.cos(rot), sn = Math.sin(rot), n = 18, off = [];
    for (let q = 0; q < n; q++) { const th = TAU * (q + 0.3 * R(k, 20 + q)) / n, ca = Math.cos(th), sa = Math.sin(th), ee = 0.94 + 0.1 * R(k, 40 + q), lu = Math.sign(ca) * Math.pow(Math.abs(ca), 0.72) * L / 2 * ee, lv = Math.sign(sa) * Math.pow(Math.abs(sa), 0.72) * Wd / 2 * ee;
      const u2 = lu * cs - lv * sn, v2 = lu * sn + lv * cs; off.push([f.t[0] * u2 + f.n[0] * v2, f.t[1] * u2 + f.n[1] * v2]); }
    const ez = Math.max(...off.map(o => Math.abs(o[1])));
    const gap = (R(k, 14) < 0.14 && s > 20 && !(i > 0 && skipped))       // a missing cobble now and then: the bed shows through the bank
      || (side < 0 && cz > 2545 && cz < 2565);                           // and none on the near bank just below the mouth, so the spout shots see the dry mouth floor
    if (!gap) STONES.push({ x: cx, z: cz, off, ez, ht: Ht, tint: TINTS[Math.floor(R(k, 10) * 5)], tone: 0.92 + 0.14 * R(k, 12), seed: k, u: clamp(sm / LEN), moss: R(k, 11) < 0.32, side, L, Wd, e: L / 2, size: L, on: [f.n[0] * side, f.n[1] * side] });
    skipped = gap; s += L * 0.96 + 0.8 + R(k, 7) * 1.6; i++; } }
// P.world.STONES: the rim stones of the channel, sorted along it ({ x, z, u (0 mouth .. 1 end along the channel), e (half length), size, ht, side (-1 / 1), L, Wd }). fx.js reads them so ripples and foam meet real stones.
STONES.sort((a, b) => a.u - b.u);
WD.STONES = STONES;
function drawStone(c, s, st) {
  const z0 = st.z - st.ez - 0.5, ht = st.ht, off = st.off, n = off.length, ex = Math.max(...off.map(o => Math.abs(o[0])));
  if (!vis(c, s, st.x - ex - 4, st.x + ex + 4, GC.y * 1.2 - 600, 6, 40)) return;
  const wetf = bedWet(st.u) ? 1 : 0, px = st.L * s;
  const ring = (sc, y) => off.map(o => gp(z0, st.x + o[0] * sc, y, st.z + o[1] * sc));
  // a domed cobble: the side rises steeply to a rounded shoulder (S, T) and the top keeps rising to a crown (U, C), so it reads as a river
  // stone, not a flat paver disc
  const B = ring(0.9, 0), S = ring(1.0, -ht * 0.5), T = ring(0.86, -ht * 0.92), U = ring(0.62, -ht * 1.14), C = ring(0.32, -ht * 1.26), AO = ring(1.16, 0);
  const DOME = [T, ring(0.76, -ht * 1.04), U, ring(0.48, -ht * 1.21), C];   // the dome's rings, for a smooth crown outline
  const tint = st.tint, hz = clamp((st.z - GC.z - 1400) / 8000, 0, 1) * 0.25 * 0.62, tl = (k, yy, e2 = 0.06) => rg(shD(mixc(mul(tint, Math.min(k, 1.08) * st.tone), HAZED, hz), st.x, -yy, st.z, e2, 0.1));   // the warm water light adds only a little to these grey stones
  c.save(); c.lineJoin = 'round';
  c.fillStyle = css([3, 4, 12], 0.42); c.beginPath(); smoothPoly(c, AO.map(p => [p[0] + 0.5, p[1] + 0.25])); c.fill();     // contact shadow
  if (px < 5) { c.fillStyle = tl(1.0, ht); c.beginPath(); smoothPoly(c, T); c.fill(); c.fillStyle = tl(0.5, 0); c.beginPath(); smoothPoly(c, B.map((p, i) => [p[0], Math.max(p[1], T[i][1])])); c.globalCompositeOperation = 'destination-over'; c.fill(); c.restore(); return; }
  // visible side faces (outward normal toward the camera), from the base ring up the rounded shoulder to the top
  const faces = [];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, mx = st.x + (off[i][0] + off[j][0]) / 2, mz = st.z + (off[i][1] + off[j][1]) / 2, ex2 = off[j][0] - off[i][0], ez2 = off[j][1] - off[i][1];
    let nx = ez2, nz = -ex2; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl; const mid = (off[i][0] + off[j][0]) / 2, midz = (off[i][1] + off[j][1]) / 2; if (nx * mid + nz * midz < 0) { nx = -nx; nz = -nz; }
    const facing = nx * (GC.x - mx) + nz * (GC.z - mz); if (facing > 0) faces.push({ i, j, nx, nz, mz }); }
  faces.sort((p, q) => q.mz - p.mz);
  const vn = off.map(o => o[0] / (Math.hypot(o[0], o[1]) || 1));   // radial normal x at each ring vertex, for smooth shading between facets
  for (const f of faces) { const lam = 0.62 + 0.2 * (vn[f.i] + vn[f.j]) / 2, i = f.i, j = f.j, dI = 0.2 * (vn[i] - (vn[i] + vn[j]) / 2), dJ = 0.2 * (vn[j] - (vn[i] + vn[j]) / 2);
    let g = c.createLinearGradient(0, B[i][1], 0, S[i][1] - 0.01); g.addColorStop(0, tl(0.15 + 0.15 * lam, 0, 0.02)); g.addColorStop(1, tl(0.36 + 0.24 * lam, ht * 0.62, 0.05));
    c.fillStyle = g; c.beginPath(); c.moveTo(B[i][0], B[i][1]); c.lineTo(B[j][0], B[j][1]); c.lineTo(S[j][0], S[j][1]); c.lineTo(S[i][0], S[i][1]); c.closePath(); c.fill();
    if (Math.abs(B[j][0] - B[i][0]) > 0.5) { const tint2 = d => d > 0 ? `rgba(255,246,232,${d * 1.3})` : `rgba(0,0,24,${-d * 1.3})`, g3 = c.createLinearGradient(B[i][0], 0, B[j][0], 0); g3.addColorStop(0, tint2(dI)); g3.addColorStop(1, tint2(dJ));
      c.fillStyle = g3; c.beginPath(); c.moveTo(B[i][0], B[i][1]); c.lineTo(B[j][0], B[j][1]); c.lineTo(S[j][0], S[j][1]); c.lineTo(S[i][0], S[i][1]); c.closePath(); c.fill(); }
    c.strokeStyle = c.fillStyle; c.lineWidth = 0.5 / s; c.stroke();
    g = c.createLinearGradient(0, S[i][1], 0, T[i][1]); g.addColorStop(0, tl(0.46 + 0.22 * lam, ht * 0.62, 0.06)); g.addColorStop(1, tl(0.62 + 0.18 * lam, ht, 0.08));   // ends at the dome's edge tone, so it never reads as a bright rim
    c.fillStyle = g; c.beginPath(); c.moveTo(S[i][0], S[i][1]); c.lineTo(S[j][0], S[j][1]); c.lineTo(T[j][0], T[j][1]); c.lineTo(T[i][0], T[i][1]); c.closePath(); c.fill();
    c.strokeStyle = c.fillStyle; c.stroke(); }
  if (wetf && px > 8) { c.fillStyle = css([40, 80, 130], 0.3); for (const f of faces) { c.beginPath(); c.moveTo(B[f.i][0], B[f.i][1]); c.lineTo(B[f.j][0], B[f.j][1]); c.lineTo(B[f.j][0], B[f.j][1] - 1.4); c.lineTo(B[f.i][0], B[f.i][1] - 1.4); c.closePath(); c.fill(); } }
  // the domed top: one soft radial shade from a crown nudged toward the moon (upper right) down to the shoulder tone at its edge, with
  // no outline, so the top rounds off into the sides instead of ending at a rim
  const tx0 = Math.min(...T.map(p => p[0])), tx1 = Math.max(...T.map(p => p[0])), ty0 = Math.min(...T.map(p => p[1])), ty1 = Math.max(...T.map(p => p[1]));
  { const ccx = C.reduce((a, p) => a + p[0], 0) / C.length, ccy = C.reduce((a, p) => a + p[1], 0) / C.length, cyT = Math.min(...C.map(p => p[1])), rx = Math.max(tx1 - tx0, 0.5) / 2, ry = Math.max(ty1 - ty0, 0.2) / 2;
    const hx = ccx + rx * 0.18, hy = lerp(cyT, ccy, 0.4), tg = c.createRadialGradient(hx, hy, 0, hx, hy, Math.max(rx, ry) * 1.15);
    tg.addColorStop(0, tl(1.2, ht * 1.3, 0.13)); tg.addColorStop(0.45, tl(1.04, ht * 1.15, 0.11)); tg.addColorStop(0.8, tl(0.88, ht, 0.09)); tg.addColorStop(1, tl(0.78, ht, 0.08));
    // the dome's outline is the union of the three rings (each higher and smaller), so from a low lens the crown bulges above the shoulder
    c.fillStyle = tg; c.save(); c.beginPath(); for (const rgp of DOME) smoothPoly(c, rgp); c.clip('nonzero'); c.translate(hx, hy); c.scale(1, Math.max(ry / rx, 0.38)); c.translate(-hx, -hy); c.fillRect(tx0 - rx * 2, hy - rx * 3, rx * 6, rx * 6); c.restore();
    // a soft crescent of moonlight on the upper-right shoulder of the dome (never a full ring)
    if (px > 7) { c.save(); c.beginPath(); smoothPoly(c, T); c.clip(); const mg = c.createRadialGradient(hx + rx * 0.5, hy - ry * 0.3, 0, hx + rx * 0.5, hy - ry * 0.3, rx * 0.8);
      mg.addColorStop(0, css([240, 244, 255], 0.2)); mg.addColorStop(1, css([240, 244, 255], 0)); c.fillStyle = mg; c.fillRect(tx0 - 2, ty0 - 2, tx1 - tx0 + 4, ty1 - ty0 + 4); c.restore(); } }
  if (px > 18) { c.save(); c.beginPath(); smoothPoly(c, T); c.clip();
    const nn = Math.min(50, 8 + (px / 3 | 0)); for (let q = 0; q < nn; q++) {
      const wx = st.x + (R(st.seed, 210 + q) - 0.5) * st.L * 0.75, wz = st.z + (R(st.seed, 310 + q) - 0.5) * st.Wd * 0.75, pp = gp(z0, wx, -ht, wz);
      c.fillStyle = R(st.seed, 70 + q) < 0.55 ? css([30, 30, 56], 0.08) : css([255, 255, 255], 0.05); c.beginPath(); c.arc(pp[0], pp[1], Math.min(0.12 + 0.3 * R(st.seed, 100 + q), 1.6 / s), 0, TAU); c.fill(); }   // fine grit, never gravel
    if (R(st.seed, 4) < 0.6) { c.strokeStyle = css([20, 18, 34], 0.3); c.lineWidth = Math.max(0.3, 0.7 / s); const a0 = gp(z0, st.x - st.L * 0.2, -ht, st.z - st.Wd * 0.2), a1 = gp(z0, st.x + st.L * 0.08, -ht, st.z + st.Wd * 0.05), a2 = gp(z0, st.x + st.L * 0.22, -ht, st.z + st.Wd * 0.25);
      c.beginPath(); c.moveTo(a0[0], a0[1]); c.lineTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]); c.stroke(); }
    c.restore(); }
  if (st.moss && px > 5) {   // moss: a small flat felt patch on the stone's outer shoulder (creeping up from the turf side), soft edged, a few short fibres; never a filling in the middle of the top
    const mx = st.x + st.on[0] * st.Wd * 0.26 + (R(st.seed, 445) - 0.5) * st.L * 0.3, mz = st.z + st.on[1] * st.Wd * 0.26, my = -ht * 1.08;
    const patch = k2 => { const bl = []; for (let q = 0; q < 12; q++) { const th = TAU * q / 12; bl.push(gp(z0, mx + Math.cos(th) * st.L * 0.2 * k2 * (0.85 + 0.35 * R(st.seed, 450 + q)), my - 0.1, mz + Math.sin(th) * st.Wd * 0.16 * k2 * (0.85 + 0.35 * R(st.seed, 470 + q)))); } return bl; };
    c.save(); c.beginPath(); smoothPoly(c, T); c.clip();
    for (const [k2, col, al] of [[1.3, [30, 64, 44], 0.25], [1.0, [34, 72, 46], 0.7], [0.62, [52, 92, 54], 0.75]]) { c.fillStyle = rg(sh(col, st.x, -ht, st.z, 0.08), al); c.beginPath(); smoothPoly(c, patch(k2)); c.fill(); }
    c.restore();
    if (px > 9) { c.lineCap = 'round'; c.lineWidth = Math.max(0.3, 0.55 / s); c.strokeStyle = rg(sh([96, 138, 70], st.x, -ht, st.z, 0.1), 0.5); c.beginPath();
      for (let q = 0; q < Math.min(10, px / 4 | 0); q++) { const ang = R(st.seed, 400 + q) * TAU, rr = 0.15 + 0.7 * Math.sqrt(R(st.seed, 410 + q)), pp = gp(z0, mx + Math.cos(ang) * st.L * 0.2 * rr, my - 0.2, mz + Math.sin(ang) * st.Wd * 0.16 * rr), a2 = R(st.seed, 430 + q) * TAU;
        c.moveTo(pp[0], pp[1]); c.lineTo(pp[0] + Math.cos(a2) * 0.9, pp[1] - Math.abs(Math.sin(a2)) * 0.7); } c.stroke(); } }
  c.restore();
}
WD.channel = st => { CUR.channel = st; if (WD._chan) return WD._chan;
  const items = [];
  for (const sl of SLC) items.push({ z: sl.zn, flat: true, draw(c, s) { drawSlice(c, s, sl); } });
  for (const stn of STONES) items.push({ z: stn.z - stn.ez - 0.5, stone: stn, draw(c, s) { drawStone(c, s, stn); } });   // (.stone: a shot can find a rim stone that hides something)
  WD._chan = items; return items; };

// ---------- clearing the stage ----------
// In a subject shot (the lens focused close, on a character) nothing nearer than the subject may cover the middle of the frame.
// stageAlpha(c, st, x, hgt, z) fades a plant out when it stands in front of the subject plane and its stalk (root to head) crosses the
// central band of the picture where faces are; plants at the frame edges, below the band or behind the subject stay.
const stageAlpha = (c, st, x, hgt, z, reach = 0.5 * hgt) => {
  const cam = st && st.cam; if (!cam || !(cam.focus > cam.z)) return 1;
  const D = cam.focus - cam.z; if (D > 780) return 1;
  const near = ss(cam.focus - 2, cam.focus - 2 - Math.max(18, 0.18 * D), z); if (near <= 0) return 1;
  const m = c.getTransform(), sx = m.a * x + m.e, half = reach * m.a, yRoot = m.f, yHead = m.f - hgt * m.d;   // half: leaves reach out sideways about as far as the plant is tall / 2
  if (yRoot < 0.1 * H || yHead > 0.97 * H) return 1;
  const wxAt = v => ss(0.07 * W, 0.15 * W, v) * ss(0.93 * W, 0.85 * W, v), wx = Math.max(wxAt(sx), wxAt(sx - half), wxAt(sx + half)), wy = ss(0.1 * H, 0.17 * H, yRoot) * ss(1.0 * H, 0.9 * H, yHead);
  return 1 - near * wx * wy;
};
const withAlpha = (c, a, fn) => { if (a >= 0.99) return fn(); if (a <= 0.02) return; c.save(); c.globalAlpha = a; fn(); c.restore(); };

// ---------- flowers ----------
// A meadow in front of the channel (so a low camera never looks over a bare plain). A clear lane leads to the hero.
const MBUDS = [], MFLOW = [];
const inLane = (x, z) => Math.abs(x + 45) < (z > 250 ? 190 : 140);
for (let i = 0; i < 560; i++) { const z = -1250 + 1670 * Math.pow(R(i, 801), 0.78), x = -1100 + 2000 * R(i, 802); if (inLane(x, z)) continue;
  MBUDS.push({ x, z, h: 16 + R(i, 803) * 26, col: PAL[Math.floor(R(i, 804) * 5)], kind: R(i, 805) < 0.2 ? 'bell' : 'bud', lean: (R(i, 806) - 0.5) * 9, phase: R(i, 807) * TAU, i }); }
for (let i = 0; i < 70; i++) { const z = -1250 + 1670 * Math.pow(R(i, 811), 0.8), x = -1100 + 2000 * R(i, 812); if (inLane(x, z)) continue;
  MFLOW.push({ x, z, h: 46 + R(i, 813) * 60, col: PAL[Math.floor(R(i, 814) * 5)], kind: KINDS[Math.floor(R(i, 815) * 5)], lean: (R(i, 816) - 0.5) * 18, phase: R(i, 817) * TAU, k: i }); }

const fstate = (st, i) => Object.assign({ climb: 0, petal: 0, flicker: 1, open: 0.5 }, (st.flower && st.flower(i)) || {});
const GLOW = [255, 176, 70], CORE = [255, 238, 176];
function leafDraw(c, s, L, Wd, bend, ang, ox, oy, x, z, col, glow) {
  c.save(); c.translate(ox, oy); c.rotate(ang);
  const b0 = sh(mul(col, 0.62), x, oy, z, 0.1), b1 = sh(mul(col, 1.1), x, oy - L * 0.5, z, 0.14), g = c.createLinearGradient(0, 0, L * bend, -L); g.addColorStop(0, rg(b0)); g.addColorStop(1, rg(mixc(b1, GLOW, glow * 0.25)));
  P.card(c, leafP(L, Wd, bend), g, { lift: 0.8, tex: 0, shadow: 0.35, edge: 0.16 });
  if (L * s > 10) { c.save(); c.beginPath(); leafP(L, Wd, bend)(c); c.clip(); const fg = c.createLinearGradient(-Wd, 0, Wd * 1.1, 0);
    fg.addColorStop(0, 'rgba(255,255,230,0.10)'); fg.addColorStop(0.5, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,4,16,0.26)'); c.fillStyle = fg; c.fillRect(-Wd * 1.6, -L * 1.1, Wd * 3.4, L * 1.2);
    const hg = c.createLinearGradient(0, 0, 0, -L); hg.addColorStop(0, 'rgba(0,0,0,0.16)'); hg.addColorStop(0.4, 'rgba(0,0,0,0)'); c.fillStyle = hg; c.fillRect(-Wd * 1.6, -L * 1.1, Wd * 3.4, L * 1.2); c.restore(); }
  if (L * s > 18) { c.strokeStyle = glow > 0.1 ? rg(mixc(mul(b1, 1.5), CORE, glow), 0.5) : rg(mul(b1, 1.5), 0.4); c.lineWidth = Math.max(0.3, 0.7 / s);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * bend * 0.1, -L * 0.55, L * bend, -L); c.stroke();
    for (let j = 1; j < 6; j++) { const tj = j / 6.5, mx = qb(0, L * bend * 0.1, L * bend, tj), my = qb(0, -L * 0.55, -L, tj), wv = Wd * 0.85 * (1 - tj * 0.7);
      c.beginPath(); c.moveTo(mx, my); c.quadraticCurveTo(mx - wv * 0.5, my - L * 0.03, mx - wv, my - L * 0.1); c.moveTo(mx, my); c.quadraticCurveTo(mx + wv * 0.5, my - L * 0.03, mx + wv, my - L * 0.1); c.stroke(); } }
  c.restore();
}
// A hanging bell: narrow neck flaring to a scalloped lip, drawn downward from the origin (+y).
function hangBell(c, s, L, Wb, col, k, x, y, z, op = 0.6) {
  const px = L * s, lit0 = sh(col, x, y, z, 0.2), top = mul(lit0, 0.82), lip = mixc(mul(lit0, 1.12), CORE, 0.1 + 0.5 * k), n = 5;
  const body = kk => { kk.moveTo(-Wb * 0.26, 0); kk.bezierCurveTo(-Wb * 0.5, L * 0.3, -Wb * 1.0, L * 0.66, -Wb * 1.2, L * 0.9);
    for (let i = 0; i < n; i++) { const a0 = -Wb * 1.2 + i * (Wb * 2.4 / n), a1 = a0 + Wb * 2.4 / n; kk.quadraticCurveTo((a0 + a1) / 2, L * (1.14 + 0.05 * (i % 2)), a1, L * 0.9); }
    kk.bezierCurveTo(Wb * 1.0, L * 0.66, Wb * 0.5, L * 0.3, Wb * 0.26, 0); kk.closePath(); };
  if (px > 7) { const ig = c.createRadialGradient(0, L * 0.92, 0, 0, L * 0.92, Wb * 1.3); ig.addColorStop(0, rg(mixc(mul(lit0, 0.4), [255, 190, 90], 0.6 * k), 0.55)); ig.addColorStop(1, rg(mul(lit0, 0.4), 0));
    c.fillStyle = ig; c.beginPath(); c.ellipse(0, L * 0.92, Wb * 1.1, Wb * 0.3 + 0.01, 0, 0, TAU); c.fill(); }
  const g = c.createLinearGradient(0, 0, 0, L * 1.1); g.addColorStop(0, rg(top)); g.addColorStop(0.55, rg(mul(lit0, 0.96))); g.addColorStop(1, rg(lip));
  P.card(c, body, g, { lift: 0.5, tex: 0, shadow: 0.3, edge: px > 10 ? 0.2 : 0 });
  if (px > 12) { c.save(); c.beginPath(); body(c); c.clip(); const hg = c.createLinearGradient(-Wb, 0, Wb, 0); hg.addColorStop(0, 'rgba(255,250,240,0.22)'); hg.addColorStop(0.4, 'rgba(255,250,240,0)'); hg.addColorStop(1, 'rgba(0,0,30,0.22)'); c.fillStyle = hg; c.fillRect(-Wb * 1.4, 0, Wb * 2.8, L * 1.3);
    c.strokeStyle = rg(mul(lit0, 0.6), 0.4); c.lineWidth = Math.max(0.2, 0.5 / s); c.beginPath(); for (let i = -1; i <= 1; i++) { c.moveTo(i * Wb * 0.12, L * 0.05); c.quadraticCurveTo(i * Wb * 0.7, L * 0.5, i * Wb * 1.05, L * 0.95); } c.stroke(); c.restore(); }
}
// A closed tulip bud: ovoid, three overlapping petal cards, a soft top highlight and a small calyx.
function budHead(c, s, L, W2, col, x, y, z) {
  const px = L * s, b0 = sh(col, x, y, z, 0.2), oval = (dx, w, hh) => kk => { kk.moveTo(dx, 0.3); kk.bezierCurveTo(dx - w * 1.5, -hh * 0.2, dx - w * 1.15, -hh * 0.82, dx, -hh); kk.bezierCurveTo(dx + w * 1.15, -hh * 0.82, dx + w * 1.5, -hh * 0.2, dx, 0.3); };
  const parts = [[0, W2 * 0.95, L * 1.28, 0.74], [-W2 * 0.5, W2 * 0.8, L * 1.1, 0.98], [W2 * 0.5, W2 * 0.8, L * 1.14, 0.88]];
  for (const [dx, w, hh, dk] of parts) { const g = c.createLinearGradient(0, 0, 0, -hh); g.addColorStop(0, rg(mul(b0, dk * 0.72))); g.addColorStop(0.7, rg(mul(b0, dk))); g.addColorStop(1, rg(mixc(mul(b0, dk * 1.08), [255, 245, 230], 0.16)));
    if (px > 9) P.card(c, oval(dx, w, hh), g, { lift: 0.5, tex: 0, shadow: 0.28, edge: 0 }); else { c.fillStyle = g; c.beginPath(); oval(dx, w, hh)(c); c.fill(); } }
  if (px > 9) { c.strokeStyle = rg(mul(b0, 0.5), 0.5); c.lineWidth = Math.max(0.2, 0.5 / s); c.beginPath(); c.moveTo(-W2 * 0.02, 0); c.quadraticCurveTo(W2 * 0.5, -L * 0.5, W2 * 0.12, -L * 1.1); c.moveTo(-W2 * 0.1, 0); c.quadraticCurveTo(-W2 * 0.55, -L * 0.45, -W2 * 0.3, -L * 1.0); c.stroke();
    c.fillStyle = 'rgba(255,248,236,0.42)'; c.beginPath(); c.ellipse(-W2 * 0.35, -L * 1.0, W2 * 0.22, L * 0.16, -0.5, 0, TAU); c.fill();   // top highlight
    const sp = rg(sh([62, 124, 78], x, y, z, 0.1)); c.fillStyle = sp; c.beginPath(); c.moveTo(0, 0.6); c.quadraticCurveTo(-W2 * 1.9, -L * 0.05, -W2 * 1.5, -L * 0.5); c.quadraticCurveTo(-W2 * 0.7, -L * 0.15, 0, 0.6);
    c.moveTo(0, 0.6); c.quadraticCurveTo(W2 * 1.9, -L * 0.05, W2 * 1.5, -L * 0.5); c.quadraticCurveTo(W2 * 0.7, -L * 0.15, 0, 0.6); c.fill(); }
}
function drawFlower(c, s, t, f, fo) {
  const { x, z, h } = f; if (!vis(c, s, x - h * 0.6, x + h * 0.6, -h * 1.3, 6, 60)) return;
  const g = clamp(fo.petal * fo.flicker, 0, 1.3), k = Math.min(g, 1), op = clamp(fo.open, 0, 1), climb = clamp(fo.climb, 0, 1), small = h * s < 40, dir = f.lean >= 0 ? 1 : -1;
  const sway = Math.sin(t * 0.9 + f.phase) * 0.016 * (0.6 + h / 100), hx = f.lean, hy = -h, HL = h * 0.25, bell = f.kind === 'bell';
  c.save(); c.translate(x, 0); c.rotate(sway);
  // base leaves (lance-shaped, pointing out and up) and a smaller one half way up
  if (!small) { leafDraw(c, s, h * 0.4, h * 0.075, -0.3, -1.05, 0, -h * 0.02, x, z, [56, 124, 76], climb * 0.15); leafDraw(c, s, h * 0.32, h * 0.065, 0.3, 0.95, 0, -h * 0.03, x, z, [48, 112, 70], climb * 0.15);
    leafDraw(c, s, h * 0.2, h * 0.04, 0.25 * dir, 0.7 * dir + (dir > 0 ? 0 : 0), f.lean * 0.15, -h * 0.4, x, z, [64, 132, 80], climb * 0.1); }
  // curved stem: a gentle S, slightly tapering; only a little warm glow in the lower stem when lit
  const w = Math.max(h * 0.036, 1.5), gEdge = sh([20, 58, 44], x, -h * 0.5, z, 0.06), gBody = sh([58, 128, 74], x, -h * 0.5, z, 0.12), gHi = sh([140, 204, 118], x, -h * 0.5, z, 0.22);
  // droop (st.flower(i).droop 0..1, the v5 hook's bell): the top of the stem bows over toward its lean and the head hangs lower
  const dr = clamp(fo.droop || 0, 0, 1);
  const c1x = -f.lean * 0.9 - 3 * dir, c1y = -h * 0.32, c2x = f.lean * 1.7 + 3 * dir, c2y = -h * 0.7, ex = hx + dir * h * 0.2 * dr, ey = (bell ? -h * 0.97 : hy) + h * 0.3 * dr;
  const stemPath = () => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(c1x, c1y, c2x + (bell ? dir * h * 0.16 : 0), bell ? -h * 1.08 : c2y, ex + (bell ? dir * h * 0.1 : 0), ey); };
  c.lineCap = 'round'; stemPath(); c.strokeStyle = rg(gEdge); c.lineWidth = w + 1.0; c.stroke();
  const sg = c.createLinearGradient(0, 0, 0, -h), warm = mixc(gBody, [200, 190, 80], 0.2);
  sg.addColorStop(0, rg(climb > 0.02 ? warm : gBody)); sg.addColorStop(clamp(climb, 0, 1) * 0.9 + 0.05, rg(climb > 0.02 ? warm : gBody)); sg.addColorStop(clamp(climb * 0.9 + 0.2, 0, 1), rg(gBody)); sg.addColorStop(1, rg(gBody));
  stemPath(); c.strokeStyle = sg; c.lineWidth = w; c.stroke();
  stemPath(); c.strokeStyle = rg(gHi, 0.5); c.lineWidth = Math.max(w * 0.26, 0.3); c.stroke();
  const hz = z, lit0 = sh(f.col, x + hx, hy - HL * 0.5, hz, 0.2);
  const cInner = mixc(mul(lit0, 0.78), [255, 196, 104], 0.08 + 0.4 * k), cMid = mixc(lit0, GLOW, 0.3 * k), cTip = mixc(mul(lit0, 1.04), [255, 170, 70], 0.3 * k);   // lit petals keep their hue; the brightest light is on the rims
  c.translate(bell ? ex + dir * h * 0.1 : ex, ey); if (dr > 0) c.rotate(dir * 0.9 * dr);
  if (bell) { c.rotate(dir * 0.22); hangBell(c, s, HL * 1.5, HL * 0.58, f.col, k, x + hx, hy, hz, op); c.restore(); return; }
  if (g > 0.05 && !small) { const gr = c.createRadialGradient(0, -HL * 0.4, 0, 0, -HL * 0.4, HL * 2.0); gr.addColorStop(0, `rgba(255,190,100,${0.26 * k})`); gr.addColorStop(1, 'rgba(255,170,70,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(0, -HL * 0.4, HL * 2.0, 0, TAU); c.fill(); }
  const sepal = rg(sh([70, 128, 76], x, hy, hz, 0.1));
  const grad = (L, dark) => { const gg = c.createLinearGradient(0, 0, 0, -L); gg.addColorStop(0, rg(mul(cInner, dark))); gg.addColorStop(0.55, rg(mul(cMid, dark))); gg.addColorStop(1, rg(mul(cTip, dark))); return gg; };
  const rimC = rg(mixc(mul(lit0, 1.4), CORE, k), 0.45 + 0.4 * k), rimW = 0.8 + 0.9 * k;
  const petal = (L, Wp, ang, dark, vein) => { c.save(); c.rotate(ang);
    P.card(c, petalP(L, Wp), grad(L, dark), { lift: 0.7, tex: 0, shadow: 0.3 });
    if (!small) { c.strokeStyle = rimC; c.lineWidth = Math.max(0.3 * rimW, 0.8 * rimW / s); c.beginPath(); petalP(L, Wp)(c); c.stroke();
      if (vein) { c.strokeStyle = rg(mul(lit0, 0.55), 0.4); c.lineWidth = Math.max(0.25, 0.5 / s); c.beginPath();
        for (let j = -1; j <= 1; j++) { c.moveTo(0, -L * 0.04); c.quadraticCurveTo(j * Wp * 0.5, -L * 0.45, j * Wp * 0.3, -L * 0.88); } c.stroke(); } }
    c.restore(); };
  if (f.kind === 'tulip') {
    const sp = 0.05 + 0.5 * op;
    petal(HL * 1.02, HL * 0.38, -sp * 1.4, 0.7, false); petal(HL * 1.02, HL * 0.38, sp * 1.4, 0.7, false); petal(HL * 1.1, HL * 0.4, 0, 0.82, false);
    if (g > 0.05) { const og = c.createRadialGradient(0, -HL * 0.3, 0, 0, -HL * 0.3, HL * 0.55); og.addColorStop(0, `rgba(255,214,140,${0.45 * k})`); og.addColorStop(1, 'rgba(255,170,70,0)'); c.fillStyle = og; c.beginPath(); c.arc(0, -HL * 0.3, HL * 0.55, 0, TAU); c.fill(); }
    petal(HL * 0.98, HL * 0.36, -sp * 0.55, 1, true); petal(HL * 0.98, HL * 0.36, sp * 0.55, 1, true);
    c.fillStyle = sepal; c.beginPath(); c.ellipse(0, 0, HL * 0.2, HL * 0.12, 0, 0, TAU); c.fill();
  } else {
    c.save(); c.translate(0, -HL * 0.1); c.scale(1, 0.72); const n = 9;
    for (let i = 0; i < n; i++) { const a = TAU * i / n + 0.2; c.save(); c.rotate(a); c.translate(0, -HL * 0.12); const L = HL * (0.86 + 0.12 * R(f.phase * 100 | 0, i)); petal(L, HL * 0.16, 0, i % 2 ? 0.85 : 0.97, true); c.restore(); }
    const dg = c.createRadialGradient(0, 0, 0, 0, 0, HL * 0.2); dg.addColorStop(0, rg(mixc(sh([255, 226, 130], x + hx, hy, hz, 0.4), CORE, 0.3))); dg.addColorStop(1, rg(mixc(sh([226, 150, 50], x + hx, hy, hz, 0.3), GLOW, 0.4 * k)));
    c.fillStyle = dg; c.beginPath(); c.arc(0, 0, HL * 0.19, 0, TAU); c.fill(); c.restore();
  }
  c.restore();
}
function drawBud(c, s, t, b) {
  const { x, z, h } = b; if (!vis(c, s, x - h * 0.55, x + h * 0.55, -h * 1.25, 4, 40)) return;
  const px = h * s, sway = Math.sin(t * 1.1 + b.phase) * 0.02, bell = b.kind === 'bell', dir = b.lean >= 0 ? 1 : -1;
  c.save(); c.translate(x, 0); c.rotate(sway);
  const wst = Math.max(h * 0.05, 0.55), L = h * 0.3, W2 = h * 0.1, ty = -h * (bell ? 0.86 : 0.7);
  c.lineCap = 'round';
  const sp = () => { c.beginPath(); c.moveTo(0, 0); if (bell) c.bezierCurveTo(-b.lean * 0.6 - 2 * dir, -h * 0.4, b.lean * 1.2 + dir * h * 0.35, -h * 1.0, b.lean + dir * h * 0.14, ty); else c.bezierCurveTo(-b.lean * 0.7 - 1.5 * dir, -h * 0.3, b.lean * 1.5 + 1.5 * dir, -h * 0.55, b.lean, ty); };
  sp(); c.strokeStyle = rg(sh([34, 88, 58], x, -h * 0.4, z, 0.08)); c.lineWidth = wst + (px > 14 ? 0.7 : 0.3); c.stroke();
  if (px > 14) { sp(); c.strokeStyle = rg(sh([120, 190, 110], x, -h * 0.4, z, 0.2), 0.55); c.lineWidth = wst * 0.35; c.stroke();
    c.fillStyle = rg(sh([54, 118, 72], x, -h * 0.1, z, 0.1)); c.beginPath(); c.moveTo(0, -h * 0.04); c.quadraticCurveTo(-h * 0.26, -h * 0.16, -h * 0.34, -h * 0.34); c.quadraticCurveTo(-h * 0.1, -h * 0.2, 0, -h * 0.04); c.fill(); }
  if (bell) { c.translate(b.lean + dir * h * 0.14, ty); c.rotate(dir * 0.35); hangBell(c, s, L * 1.1, W2 * 1.15, [236, 232, 244], 0, x, -h, z); }
  else { c.translate(b.lean, ty); c.rotate(b.lean * 0.012); budHead(c, s, L * 1.1, W2 * 1.05, b.col, x, -h, z); }
  c.restore();
}
// A low camera looks across the banks at the stream. Buds that stand between the lens and the channel (on the camera's side, within a band
// of about 30 units beyond the rim cobbles) fade out as the lens drops, so the water ribbon is never buried behind a row of buds.
const clearBand = (st, b) => { const cam = st && st.cam; if (!cam || b.off > 76) return 1; const low = 1 - ss(70, 150, -cam.y); if (low <= 0.01) return 1;
  if (Math.hypot(b.x - cam.x, b.z - cam.z) > Math.hypot(b.cx - cam.x, b.cz - cam.z) - 4) return 1;   // behind the channel: stays
  if (st.calmSnap) return ss(54, 76, b.off) > 0.5 ? 1 : 0;   // (polish: a held calm keeps a bank bud whole or drops it, by its distance from the bed alone, so the choice never flips as the lens moves)
  return 1 - low * (1 - ss(54, 76, b.off)); };
// calm on the small flowers: the story flowers (FLOWERS, which light and go dark) always stay; the minor flowers and the buds thin out
// (st.calmSnap, a shot that holds its calm: each small flower is kept whole or dropped, so no head is drawn half-transparent, its petals
// showing through one another like a double exposure)
const calmFl = (h, x, z) => { const st = CUR.flowers, k = clamp((st && st.calm) || 0); if (k <= 0) return 1; const cam = st.cam, ck = calmKeep(h, k);
  if (st.calmSnap) return ck > 0.5 ? 1 : 0;   // (polish: a held calm draws every small plant whole or not at all; the far-field fade is left out, as it too drew heads see-through)
  return ck * (cam ? calmFar(Math.hypot(x - cam.x, z - cam.z), k) : 1); };
// (polish) under a held calm the stage clearing is whole-or-gone too (and clearBand snaps on its own): a plant it would half fade is either
// kept opaque or dropped, so no head is ever drawn half-transparent
const snapA = a => CUR.flowers && CUR.flowers.calmSnap ? (a > 0.5 ? 1 : 0) : a;
WD.flowers = st => { CUR.flowers = st;
  if (!WD._fl) { WD._fl = []; WD.FLOWERS.forEach((f, i) => WD._fl.push({ z: f.z, draw(c, s, t) { withAlpha(c, snapA(stageAlpha(c, CUR.flowers, f.x, f.h * 1.2, f.z)), () => drawFlower(c, s, t, f, fstate(CUR.flowers, i))); } }));
    MFLOW.forEach(f => WD._fl.push({ z: f.z, draw(c, s, t) { withAlpha(c, snapA(stageAlpha(c, CUR.flowers, f.x, f.h * 1.2, f.z)) * calmFl(R(f.k, 431), f.x, f.z), () => drawFlower(c, s, t, f, fstate(CUR.flowers, (f.k * 7) % WD.FLOWERS.length))); } }));
    BUDS.forEach((b, j) => WD._fl.push({ z: b.z, draw(c, s, t) { withAlpha(c, snapA(stageAlpha(c, CUR.flowers, b.x, b.h * 1.2, b.z)) * clearBand(CUR.flowers, b) * calmFl(R(j, 433), b.x, b.z), () => drawBud(c, s, t, b)); } }));
    MBUDS.forEach((b, j) => WD._fl.push({ z: b.z, draw(c, s, t) { withAlpha(c, snapA(stageAlpha(c, CUR.flowers, b.x, b.h * 1.2, b.z)) * clearBand(CUR.flowers, b) * calmFl(R(j, 437), b.x, b.z), () => drawBud(c, s, t, b)); } })); }
  return WD._fl; };


// ---------- the hero flower ----------
const HR = { x: 0, z: 400, h: 150 };
let DR = 0;                                                   // droop (shots set st.hero.droop): the head flops over toward -x
const stemX = t => 6.2 * Math.sin(t * 5.4) + 4 * t - DR * 40 * t ** 2.2;   // a gentle S that ends near x = 0
const stemDX = t => 6.2 * 5.4 * Math.cos(t * 5.4) + 4 - DR * 88 * t ** 1.2;
const hstate = () => Object.assign({ climb: 0, petal: 0, flicker: 1, open: 0.3 }, CUR.hero || {});
// The big leaves on Pip's flower: cool translucent felt, like the stem. A pale core along the midrib, a lighter backlit margin, pale veins, a
// thin moon edge and a little fibre. As the light arrives (glow) the felt warms toward lit green. They are defocused by depth (see WD.hero).
function feltLeaf(c, s, L, Wd, bend, ang, ox, oy, x, z, glow) {
  c.save(); c.translate(ox, oy); c.rotate(ang);
  const gl = clamp(glow * 2.2), path = leafP(L, Wd, bend);
  // unlit: a dull green-grey felt that takes only a little of a nearby (moon) light; lit: deep green through leafLit (never lime)
  const c0 = mixc(stemTone([30, 48, 44], x, oy, z, 0.02, 0.3), leafLit([18, 62, 36], x, oy, z), gl), c1 = mixc(stemTone([66, 92, 80], x, oy - L * 0.5, z, 0.03, 0.3), leafLit([40, 106, 54], x, oy - L * 0.5, z), gl);
  const g = c.createLinearGradient(0, 0, L * bend, -L); g.addColorStop(0, rg(c0)); g.addColorStop(1, rg(c1));
  P.card(c, path, g, { lift: 0.8, tex: 0.5, shadow: 0.28, edge: 0.2 });
  c.save(); c.beginPath(); path(c); c.clip();
  const mid = (a, wd) => { c.strokeStyle = a; c.lineWidth = wd; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * bend * 0.1, -L * 0.55, L * bend, -L); c.stroke(); };
  mid(rg(mixc([116, 142, 130], [104, 164, 88], gl), 0.14), Wd * 1.1); mid(rg(mixc([132, 156, 144], [126, 184, 104], gl), 0.13), Wd * 0.45);   // paler core along the midrib
  c.strokeStyle = rg(mixc([112, 138, 126], [118, 170, 96], gl), 0.32); c.lineWidth = Math.max(0.7, Wd * 0.18); c.lineJoin = 'round'; c.beginPath(); path(c); c.stroke();   // felt margin: lighter than the body
  const veins = () => { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * bend * 0.1, -L * 0.55, L * bend, -L);
    for (let j = 1; j < 8; j++) { const tj = j / 8.5, mx = qb(0, L * bend * 0.1, L * bend, tj), my = qb(0, -L * 0.55, -L, tj), wv = Wd * 0.9 * (1 - tj * 0.65);
      c.moveTo(mx, my); c.quadraticCurveTo(mx - wv * 0.5, my - L * 0.03, mx - wv, my - L * 0.1 - 0.02 * L * R(j, 3)); c.moveTo(mx, my); c.quadraticCurveTo(mx + wv * 0.5, my - L * 0.03, mx + wv, my - L * 0.1 - 0.02 * L * R(j, 4)); }
    c.stroke(); };
  c.lineWidth = Math.max(0.3, 0.75 / s); c.strokeStyle = rg([6, 22, 14], 0.22 + 0.1 * gl); c.save(); c.translate(0.25, 0.35); veins(); c.restore();   // a dark crease beside each vein: the felt is pressed, not printed
  c.strokeStyle = rg(mixc([156, 178, 166], [156, 206, 130], gl), 0.38 + 0.08 * gl); c.lineWidth = Math.max(0.25, 0.6 / s); veins();   // pale raised veins
  if (L * s > 14) { c.strokeStyle = rg([210, 240, 230], 0.14); c.lineWidth = Math.max(0.2, 0.45 / s); c.beginPath(); for (let i = 0; i < 60; i++) { const tj = R(i, 5), mx = qb(0, L * bend * 0.1, L * bend, tj), my = qb(0, -L * 0.55, -L, tj), sd = R(i, 6) < 0.5 ? -1 : 1, l = Wd * (0.2 + 0.6 * R(i, 7)) * (1 - tj * 0.5); c.moveTo(mx + sd * l * 0.2, my); c.lineTo(mx + sd * l, my - l * 0.5); } c.stroke(); }   // fibre
  c.restore();
  moonRim(c, path, Math.max(0.5, 1.2 / s), 0.5);
  c.restore();
}
function heroLeaf(c, s, side, hs) {
  const { x, z } = HR, g = clamp(hs.climb, 0, 1);
  const L = side < 0 ? 78 : 66, Wd = side < 0 ? 17 : 15, ty = side < 0 ? 0.14 : 0.26, ox = stemX(ty), oy = -HR.h * ty;
  feltLeaf(c, s, L, Wd, side * 0.32, side * 1.02, ox, oy, x, z, g * 0.45);
}
// The stem is a translucent green tube with a narrower amber core that climbs from the root (soft front, not a cut), longitudinal
// fibre striations, cell texture when close, and curved tapered hairs with soft tips. No sheath: the glow is feathered radial light.
// A tone that keeps its hue under any ambient: the colour is given as it should look, scaled a little by how dark the ambient is, plus
// the excess of any nearby light. (sh would tint it blue as the ambient cools from dusk to night.)
// k scales how much of a nearby light's excess the tone takes: the dead (unlit) stem and leaves take little (k 0.3), so a shot's tight moon
// light rims them instead of making the thin felt glow ice-cyan.
const stemTone = (disp, x, y, z, e, k = 0.9) => { const m = P.light(x, y, z), a = AMBC || (AMBC = P.light(1e7, 0, 1e7)), v = 0.84 + 0.16 * clamp((a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11) / (NOM[0] * 0.3 + NOM[1] * 0.59 + NOM[2] * 0.11), 0, 1.2);
  return [soft(disp[0] * (v + (m[0] - a[0]) * k + e)), soft(disp[1] * (v + (m[1] - a[1]) * k + e)), soft(disp[2] * (v + (m[2] - a[2]) * k + e))]; };
// A lit leaf: deep felt green warmed by the light through a capped gain (not sh's open-ended multiply, which pushed a leaf under the relit
// flower to flat lime). The warm excess adds a little amber; the value stays well under the stem core and the petal edges.
const leafLit = (disp, x, y, z) => { const m = P.light(x, y, z), a = AMBC || (AMBC = P.light(1e7, 0, 1e7)), v = 0.84 + 0.16 * clamp((a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11) / (NOM[0] * 0.3 + NOM[1] * 0.59 + NOM[2] * 0.11), 0, 1.2);
  const ex = [Math.max(0, m[0] - a[0]), Math.max(0, m[1] - a[1]), Math.max(0, m[2] - a[2])], w = Math.min(ex[0], 1.2);
  return [disp[0] * (v + Math.min(ex[0] * 0.3, 0.36)) + 16 * w, disp[1] * (v + Math.min(ex[1] * 0.22, 0.26)) + 5 * w, disp[2] * (v + Math.min(ex[2] * 0.18, 0.18))]; };
function heroStem(c, s, t) {
  const hs = hstate(), { x, z } = HR, h = HR.h * (1 - 0.16 * DR), climb = clamp(hs.climb, 0, 1), wAt = tt => 10.2 - 4.4 * tt;
  // While the light drains (before the water is released) the stem keeps a fading amber afterglow above the front, so the glow is
  // seen leaving instead of switching off. Before the front moves (climb 0 or 1) there is no afterglow.
  const draining = (t || 0) < 100 && climb > 0.02 && climb < 0.985;
  const gkAt = tt => Math.max(climb > 0 ? ss(climb + 0.1, climb - 0.12, tt) : 0, draining && tt > climb ? 0.42 * Math.exp(-(tt - climb) / 0.1) : 0);
  const m = c.getTransform(), tLo = clamp(-((H + 120 - m.f) / s) / h), tHi = clamp(-((-120 - m.f) / s) / h), N = clamp(Math.ceil((tHi - tLo) * h * s / 8), 8, 190);
  // one smooth outline clips every slice, so the stem's edge is a single anti-aliased curve (the slices only shade the inside; drawn
  // one by one their own edges stair-stepped where they overlap)
  { const M = clamp(N * 3, 24, 400); c.save(); c.beginPath();
    for (let i = 0; i <= M; i++) { const tt = lerp(tLo, tHi, i / M), xx = stemX(tt) - wAt(tt) / 2; i ? c.lineTo(xx, -h * tt) : c.moveTo(xx, -h * tt); }
    for (let i = M; i >= 0; i--) { const tt = lerp(tLo, tHi, i / M); c.lineTo(stemX(tt) + wAt(tt) / 2, -h * tt); }
    c.closePath(); c.clip(); }
  for (let i = 0; i < N; i++) { const t0 = lerp(tLo, tHi, i / N), t1 = lerp(tLo, tHi, (i + 1) / N), tm = (t0 + t1) / 2, gk = gkAt(tm), w0 = wAt(t0) + 3, w1 = wAt(t1) + 3;
    const x0 = stemX(t0), x1 = stemX(t1), y0 = -h * t0 + 0.5, y1 = -h * t1 - 0.5, ya = -h * tm, xm = stemX(tm), wm = wAt(tm), g = c.createLinearGradient(xm - wm / 2, 0, xm + wm / 2, 0);
    // Unlit, the stem is still the same translucent felt: deep blue-teal at the thin edges, a paler moonlit core where the tube is
    // thickest. The cool tones are given as the colour they should show at dusk (base) plus a small self-lit term for translucency;
    // as the light arrives (gk) they hand over to the original lit palette.
    const gm = clamp(gk * 1.6), mo = 1 - gm * 0.6, amberE = [196, 84, 14], amber = [255, 168, 52], hot = [255, 204, 124];   // the lit core stays amber (never cream)
    // The unlit palette does not depend on the ambient colour (which cools from dusk to night over the dying of the light): one
    // desaturated sage-teal felt in every shot, only dimmed a little when the ambient is darker.
    // Dead (unlit) it is a dull, mostly opaque green-grey with no bright core; a nearby moon light only rims it (k 0.3, and the moon line below).
    const skinD = mixc(stemTone([26, 42, 40], x, ya, z, 0.02, 0.3), sh([16, 52, 46], x, ya, z, 0.05), gm), skin = mixc(stemTone([56, 78, 70], x, ya, z, 0.03, 0.3), sh([44, 108, 84], x, ya, z, 0.14), gm), skinL = mixc(stemTone([76, 100, 88], x, ya, z, 0.03, 0.3), sh([92, 160, 118], x, ya, z, 0.22), gm);
    const e1 = mixc(skinD, mul(amberE, 0.3), gk * 0.22), e2 = mixc(skin, [150, 172, 72], gk * 0.38), e3 = mixc(mixc(skin, skinL, 0.55 + 0.45 * gm), amber, gk * 0.72), e4 = mixc(mixc(skin, skinL, 0.8 + 0.2 * gm), hot, gk);
    g.addColorStop(0, rg(e1)); g.addColorStop(0.1, rg(mixc(e1, e2, 0.6))); g.addColorStop(0.25, rg(e2)); g.addColorStop(0.4, rg(e3)); g.addColorStop(0.5, rg(e4)); g.addColorStop(0.6, rg(e3)); g.addColorStop(0.75, rg(e2)); g.addColorStop(0.9, rg(mixc(e1, e2, 0.6))); g.addColorStop(1, rg(e1));
    c.fillStyle = g; c.beginPath(); c.moveTo(x0 - w0 / 2, y0); c.lineTo(x0 + w0 / 2, y0); c.lineTo(x1 + w1 / 2, y1); c.lineTo(x1 - w1 / 2, y1); c.closePath(); c.fill(); }
  c.restore();
  c.lineCap = 'round'; c.lineJoin = 'round';
  // fibre striations
  const fg = c.createLinearGradient(0, 0, 0, -h); const kc = clamp(climb, 0.001, 0.999);
  fg.addColorStop(0, 'rgba(150,60,10,0.34)'); fg.addColorStop(Math.max(kc - 0.1, 0), 'rgba(150,60,10,0.34)'); fg.addColorStop(Math.min(kc + 0.12, 1), 'rgba(18,52,84,0.3)'); fg.addColorStop(1, 'rgba(18,52,84,0.3)');
  c.strokeStyle = fg; c.lineWidth = Math.max(0.18, 0.55 / s);
  for (const fr of [-0.4, -0.21, 0.04, 0.25, 0.41]) { c.beginPath();
    for (let i = 0; i <= 44; i++) { const tt = i / 44, wob = 0.28 * Math.sin(tt * 38 + fr * 11), xx = stemX(tt) + fr * wAt(tt) + wob * 0.5; i ? c.lineTo(xx, -h * tt) : c.moveTo(xx, 0); } c.stroke(); }
  // moonlight scattering through the thin tube: a soft pale line along the moon-facing edge and two pale inner veins, only where the stem is unlit
  { const mg = c.createLinearGradient(0, 0, 0, -h); mg.addColorStop(0, 'rgba(170,206,232,0)'); mg.addColorStop(Math.max(kc - 0.04, 0), 'rgba(170,206,232,0)'); mg.addColorStop(Math.min(kc + 0.14, 1), 'rgba(170,206,232,0.36)'); mg.addColorStop(1, 'rgba(170,206,232,0.36)');
    c.strokeStyle = mg; c.lineWidth = Math.max(0.35, 0.8 / s);
    for (const [fr, wd] of [[0.44, 1], [-0.1, 0.12], [0.17, 0.12]]) {   // one thin moon rim on the moon-facing edge; the inner veins are barely there c.globalAlpha = wd; c.beginPath();
      for (let i = 0; i <= 44; i++) { const tt = i / 44, xx = stemX(tt) + fr * wAt(tt) + 0.12 * Math.sin(tt * 30 + fr * 9); i ? c.lineTo(xx, -h * tt) : c.moveTo(xx, 0); } c.stroke(); }
    c.globalAlpha = 1; }
  if (s > 5) {   // elongated cells when the lens is close
    for (let i = 0; i < 150; i++) { const tt = R(i, 430) * 0.98 + 0.01, fr = (R(i, 431) - 0.5) * 0.8, cx = stemX(tt) + fr * wAt(tt), cy = -h * tt, lm = gkAt(tt);
      c.fillStyle = lm > 0.4 ? 'rgba(255,214,140,0.05)' : 'rgba(190,230,200,0.05)'; c.beginPath(); c.ellipse(cx, cy, 0.5 + 0.35 * R(i, 432), 1.7 + 1.5 * R(i, 433), Math.atan(stemDX(tt) / h) * -1, 0, TAU); c.fill(); }
  }
  // hairs: curved, tapered, soft tipped; those on the lit stretch pick up the amber
  for (let i = 0; i < 52; i++) { const tt = 0.02 + 0.95 * R(i, 421), sd = i % 2 ? 1 : -1, wd = wAt(tt) / 2, hl = 1.4 + 2.0 * R(i, 422), litH = gkAt(tt), bx = stemX(tt) + sd * wd * 0.92, by = -h * tt;
    const ex = sd * hl * (0.75 + 0.4 * R(i, 423)), q = (R(i, 424) - 0.3) * 0.6, p1 = [bx + ex * 0.8, by - hl * (0.1 + q)], p2 = [bx + ex * 1.25, by - hl * (0.95 + q)];
    const hc = mixc([132, 160, 148], [255, 224, 150], litH), wB = 0.15 * (1 - 0.2 * R(i, 425));
    c.fillStyle = rg(hc, 0.45 + 0.1 * litH); c.beginPath(); c.moveTo(bx, by - wB); c.quadraticCurveTo(p1[0], p1[1] - wB * 0.5, p2[0], p2[1]); c.quadraticCurveTo(p1[0], p1[1] + wB * 0.5, bx, by + wB); c.closePath(); c.fill();
    if (R(i, 426) > 0.45 && s > 1.6) { c.fillStyle = rg(mixc([186, 204, 196], [255, 244, 200], litH), 0.4 + 0.45 * litH); c.beginPath(); c.arc(p2[0], p2[1], 0.22 + 0.14 * R(i, 427), 0, TAU); c.fill(); } }
  if (climb > 0.01) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const nG = Math.ceil(h * climb / 9);   // feathered glow: overlapping radial blobs along the lit stretch (no hard-edged sheath)
    for (let i = 0; i <= nG; i++) { const tt = Math.min(climb, i / nG * climb), gx = stemX(tt), gy = -h * tt, a = 0.05 + 0.05 * (1 - tt), gr = c.createRadialGradient(gx, gy, 0, gx, gy, 17);
      gr.addColorStop(0, `rgba(255,176,70,${a})`); gr.addColorStop(1, 'rgba(255,150,50,0)'); c.fillStyle = gr; c.beginPath(); c.arc(gx, gy, 17, 0, TAU); c.fill(); }
    if (climb < 0.995) { const fx = stemX(climb), fy = -h * climb, gr = c.createRadialGradient(fx, fy, 0, fx, fy, 22); gr.addColorStop(0, 'rgba(255,208,128,0.55)'); gr.addColorStop(0.35, 'rgba(255,180,84,0.28)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); c.fillStyle = gr; c.beginPath(); c.arc(fx, fy, 22, 0, TAU); c.fill(); }
    c.restore();
    for (let i = 0; i < 8; i++) { const ph = (t * 0.28 + i / 8) % 1, tt = (draining ? 1 - ph : ph) * climb, px = stemX(tt) + Math.sin(t * 3 + i * 2) * 0.8, py = -h * tt, rr = 1.1 + 0.7 * R(i, 8);
      const mg = c.createRadialGradient(px, py, 0, px, py, rr * 2); mg.addColorStop(0, 'rgba(255,226,160,0.85)'); mg.addColorStop(0.4, 'rgba(255,200,120,0.55)'); mg.addColorStop(1, 'rgba(255,200,100,0)');
      c.fillStyle = mg; c.beginPath(); c.arc(px, py, rr * 2, 0, TAU); c.fill(); }
  }
}
function heroSoil(c) {
  const { x, z } = HR; c.fillStyle = css([6, 8, 20], 0.5); c.beginPath(); c.ellipse(3, 1.5, 30, 6, 0, 0, TAU); c.fill();
  const g = c.createLinearGradient(0, -10, 0, 2); g.addColorStop(0, lit([120, 84, 58], x, -8, z, 0.2)); g.addColorStop(1, lit([60, 40, 30], x, 0, z, 0));
  c.fillStyle = g; c.beginPath(); c.moveTo(-28, 1); c.bezierCurveTo(-24, -9, -10, -11, 0, -11); c.bezierCurveTo(12, -11, 24, -8, 28, 1); c.closePath(); c.fill();
  for (let i = 0; i < 70; i++) { const a = R(i, 401), cx = (a - 0.5) * 52, ymax = -10 * (1 - (cx / 28) ** 2), cy = ymax * R(i, 402) * 1.05 - 0.4, r = 0.5 + R(i, 403) * 1.6;
    c.fillStyle = lit(R(i, 404) < 0.5 ? [100, 70, 48] : R(i, 404) < 0.8 ? [66, 44, 32] : [140, 100, 70], x + cx, cy, z, 0.12); c.beginPath(); c.ellipse(cx, cy, r, r * 0.75, R(i, 405), 0, TAU); c.fill();
    if (R(i, 406) > 0.8) { c.fillStyle = css([255, 220, 160], 0.3); c.beginPath(); c.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, TAU); c.fill(); } }
}
// Petals: amber-orange cup, paler and more translucent toward the rim, darker amber veins, a bright core with stamens that shows between the
// lower, more transparent front petals, and a backlit glow through the petal bodies.
function heroPetals(c, s, t, front) {
  const hs = hstate(), { x, z } = HR, h = HR.h * (1 - 0.16 * DR), g = clamp(hs.petal * hs.flicker, 0, 1.3), k = Math.min(g, 1), op = clamp(hs.open, 0, 1), hx = stemX(1), hy = -h;
  const sp = 0.08 + 0.62 * op, U0 = sh([158, 134, 168], x + hx, hy, z, 0.1), U1 = sh([176, 148, 178], x + hx, hy - 20, z, 0.1), U2 = sh([206, 178, 202], x + hx, hy - 36, z, 0.1);
  const cHot = mixc(U0, [255, 196, 100], k), cBody = mixc(U1, [246, 150, 44], k), cAmb = mixc(mul(U1, 0.8), [226, 106, 26], k), cEdge = mixc(U2, [255, 214, 150], k), vein = mixc([112, 88, 134], [168, 64, 10], k);
  c.save(); c.translate(hx, hy); c.rotate(-DR * 1.05);
  const petal = (L, Wp, ang, alpha, dy = 0) => { c.save(); c.translate(0, dy); c.rotate(ang);
    const gg = c.createRadialGradient(0, -L * 0.05, 0, 0, -L * 0.05, L * 1.06);
    gg.addColorStop(0, rg(cHot, 0.96 * alpha)); gg.addColorStop(0.28, rg(cBody, 0.95 * alpha)); gg.addColorStop(0.7, rg(cAmb, 0.92 * alpha)); gg.addColorStop(1, rg(cEdge, 0.7 * alpha));
    P.card(c, petalP(L, Wp), gg, { lift: front ? 0.5 : 0.9, tex: 0, shadow: front ? 0.16 : 0.3 });
    c.strokeStyle = rg(vein, 0.5 * alpha); c.lineWidth = Math.max(0.22, 0.5 / s); c.beginPath();
    for (let j = -2; j <= 2; j++) { c.moveTo(0, -L * 0.03); c.quadraticCurveTo(j * Wp * 0.46, -L * 0.45, j * Wp * 0.3, -L * 0.9); } c.stroke();
    c.strokeStyle = rg(mixc(cEdge, [255, 236, 200], 0.4 + 0.3 * k), (0.45 + 0.4 * k) * alpha); c.lineWidth = Math.max(0.3, (0.8 + 1.0 * k) / s, 0.5 * k); c.beginPath(); petalP(L, Wp)(c); c.stroke(); c.restore(); };   // the glowing rim is the brightest part of a lit petal
  if (!front) {
    if (g > 0.02) { const bg = c.createRadialGradient(0, -22, 0, 0, -22, 34); bg.addColorStop(0, `rgba(255,196,96,${0.38 * k})`); bg.addColorStop(1, 'rgba(255,150,40,0)'); c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = bg; c.beginPath(); c.arc(0, -22, 34, 0, TAU); c.fill(); c.restore(); }
    petal(40, 11.5, -sp * 1.25, 1); petal(40, 11.5, sp * 1.25, 1); petal(44, 12.5, 0, 1);
    petal(34, 10.5, -sp * 0.7, 0.92, -2); petal(34, 10.5, sp * 0.7, 0.92, -2);
    const og = c.createRadialGradient(0, -13, 0, 0, -13, 22 + 6 * g); og.addColorStop(0, `rgba(255,232,170,${Math.min(0.8, 0.1 + 0.7 * g)})`); og.addColorStop(0.35, `rgba(255,196,96,${0.6 * k})`); og.addColorStop(1, 'rgba(255,150,40,0)');
    c.fillStyle = og; c.beginPath(); c.arc(0, -13, 24 + 6 * g, 0, TAU); c.fill();
    for (let i = 0; i < 9; i++) { const a = (i - 4) * 0.19 * (0.55 + op), ln = 15 + 6 * R(i, 410), tx = Math.sin(a) * ln, ty = -6 - Math.cos(a) * ln;
      c.strokeStyle = rg(mixc([196, 186, 190], [255, 226, 150], k), 0.85); c.lineWidth = Math.max(0.3, 0.65 / s); c.beginPath(); c.moveTo(Math.sin(a) * 1.5, -5); c.quadraticCurveTo(Math.sin(a) * ln * 0.4, -6 - ln * 0.6, tx, ty); c.stroke();
      c.fillStyle = rg(mixc([196, 160, 120], [255, 190, 70], k)); c.beginPath(); c.ellipse(tx, ty, 1.3, 2.0, a, 0, TAU); c.fill();
      c.fillStyle = rg(mixc([240, 220, 190], [255, 250, 220], k), 0.9); c.beginPath(); c.arc(tx, ty - 0.9, 0.7, 0, TAU); c.fill(); }
  } else {
    petal(30, 10.5, -sp * 0.55, 0.52, 3); petal(30, 10.5, sp * 0.55, 0.52, 3); petal(26, 10, 0, 0.45, 4);
    for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.42 * (0.6 + op), ln = 19 + 4 * R(i, 415); c.strokeStyle = rg(mixc([200, 190, 190], [255, 232, 160], k), 0.9); c.lineWidth = Math.max(0.3, 0.7 / s);
      c.beginPath(); c.moveTo(0, -4); c.quadraticCurveTo(Math.sin(a) * ln * 0.3, -4 - ln * 0.55, Math.sin(a) * ln, -4 - Math.cos(a) * ln); c.stroke();
      c.fillStyle = rg(mixc([210, 170, 120], [255, 196, 80], k)); c.beginPath(); c.ellipse(Math.sin(a) * ln, -4 - Math.cos(a) * ln, 1.4, 2.1, a, 0, TAU); c.fill(); }
    if (g > 0.02) { const R2 = 130, gr = c.createRadialGradient(0, -22, 0, 0, -22, R2); gr.addColorStop(0, `rgba(255,196,110,${0.2 * Math.min(g, 1.1)})`); gr.addColorStop(0.35, `rgba(255,170,80,${0.07 * Math.min(g, 1.1)})`); gr.addColorStop(1, 'rgba(255,150,60,0)');
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = gr; c.beginPath(); c.arc(0, -22, R2, 0, TAU); c.fill(); c.restore(); }
  }
  c.restore();
}
// The big leaves hang a little behind and in front of the stem; to show that in a close shot they are blurred as if 40 units further or nearer than the stem.
const heroLeafBlur = dz => { const cam = CUR.heroCam; if (!cam || !(cam.ap > 0)) return undefined; const zz = HR.z + dz, d = Math.max(zz - cam.z, 1), fd = Math.max(cam.focus - cam.z, 1);
  return Math.min(10, cam.ap * Math.abs(1 / fd - 1 / d) * cam.f * 0.01 * 1.4); };
WD.hero = st => { CUR.hero = st.hero || {}; CUR.heroCam = st.cam; DR = Math.max(0, Math.min(1.2, CUR.hero.droop || 0));
  if (WD._hero) return WD._hero;
  const { x, z } = HR, mk = (zz, fn) => ({ z: zz, draw(c, s, t) { c.save(); c.translate(x, 0); fn(c, s, t); c.restore(); } });
  const feeder = (c, s) => { [[-26, 14, 7, 1], [24, 16, 8, 2], [8, 14, 7, 3], [-16, 13, 6, 4], [34, 12, 6, 5]].forEach(a => rock(c, s, a[0] + x, 0, z, a[1], a[2], 900 + a[3], [150, 148, 164], { moss: a[3] % 2 === 0 })); };
  WD._hero = [
    { z: z + 6, get blur() { return heroLeafBlur(40); }, draw(c, s) { c.save(); c.translate(x, 0); heroLeaf(c, s, -1, hstate()); c.restore(); } },
    mk(z + 3, (c, s, t) => heroPetals(c, s, t, false)),
    { z: z + 2.5, draw(c, s) { feeder(c, s); } },
    mk(z, (c, s, t) => heroStem(c, s, t)),
    { z: z - 0.6, get blur() { return heroLeafBlur(-40); }, draw(c, s) { c.save(); c.translate(x, 0); heroLeaf(c, s, 1, hstate()); c.restore(); } },
    mk(z - 0.8, c => heroSoil(c)),
    mk(z - 2, (c, s, t) => heroPetals(c, s, t, true))];
  return WD._hero; };


// ---------- the spout: pond, stone dam, cleft mouth, dry leaf, pin stone ----------
const SP = { cx: -900, top: -40, mw: 17 };
// ---------- the dry leaf ----------
// A big dry leaf lying on the ground beside the dam. Its pointed tip is drawn out into a tight tongue that is jammed in the cleft;
// the base and the snapped stem (petiole) lie to the right, where the pin stone presses on the stem. The near half of the blade is
// rolled up like a scroll (curl = 1): a thin paper tube with veins wrapping round it, a curled pale lip along the top and a dark open
// end. The far half lies flat: an oval blade with a small, irregular, crinkled margin, a few torn bites, ragged holes and side veins
// that fork. As curl falls the roll does not melt: it unrolls as a travelling curl, opening first at the base and running to the tip,
// the flat blade growing where it has passed while the roll radius shrinks with the paper still left in it.
// Colours are dry ochre and brown with olive, rust and tan; the paler underside shows where the paper turns over.
const LEAF = { Lb: 104, Lp: 40, Wh: 31, fv: 0.8, tongue: 2.5, NS: 160 };
const ROLLR = 6.8;                                                                 // the scroll's radius when rolled tight
const ROLLP = sn => (0.9 + 0.1 * ss(0, 0.1, sn)) * (1 - ss(0.26, 0.6, sn));      // how much of the near half is rolled, along the blade
const leafHH = sn => { const u = Math.pow(clamp(sn), 0.78), tip = ss(0, 0.17, sn);   // oval blade, widest about 40% from the tip, drawn out to a point
  return LEAF.Wh * LEAF.fv * Math.pow(Math.max(Math.sin(Math.PI * u), 0), 0.95) * Math.pow(tip, 0.55) * (1 + 0.05 * Math.sin(sn * 14 + 0.8) + 0.03 * Math.sin(sn * 37 + 1.3)); };
const leafX = sn => -LEAF.Lb * (1 - sn);                                                                  // x of the midrib at s, relative to the base
const Lc = (disp, x, y, z, e = 0.04) => rg(shD(disp, x, y, z, e, 0.1));                                   // leaf colour from a dusk display colour; only a little of the warm light
// Static tables, built once: blade half-height and the crinkled margin offsets (far and near edge), as functions of the sample index.
const LT = (() => {
  const N = LEAF.NS, hh = [], mf = [], mn = [];
  // teeth: irregular widths and heights, each leaning toward the tip; a few torn bites carved out of the far margin
  const margin = side => { const out = new Array(N + 1).fill(0); let sn = 0.02, k = 0;
    while (sn < 1) { const w = (1.5 + 2.2 * R(k, 960 + side)) / LEAF.Lb, h = 0.25 + 1.15 * Math.pow(R(k, 970 + side), 1.4), a = Math.round(sn * N), b = Math.min(N, Math.round((sn + w) * N)), pk = Math.max(a, Math.round((sn + w * 0.18) * N));
      for (let i = a; i <= b; i++) { const q = i <= pk ? (pk > a ? (i - a) / (pk - a) : 1) : 1 - (i - pk) / Math.max(b - pk, 1); out[i] = Math.max(out[i], h * Math.pow(q, 1.2) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(sn * 1.05, 1)))); }
      sn += w * (0.8 + 0.4 * R(k, 980 + side)); k++; }
    return out; };
  const far = margin(-1), near = margin(1);
  const bites = [[0.31, 0.03, 3.4], [0.57, 0.045, 5.2], [0.8, 0.028, 3.0], [0.68, 0.02, 2.2]];
  for (let i = 0; i <= N; i++) { const sn = i / N, H = leafHH(sn); let b = 0;
    for (const [c0, w, d] of bites) { const q = (sn - c0) / w; if (Math.abs(q) < 1) b = Math.max(b, d * (1 - Math.abs(q)) * (0.7 + 0.5 * R(i, 990))); }   // jagged, not smooth
    hh.push(H); mf.push(far[i] * (H > 1 ? 1 : H) - b * Math.min(1, H / 6)); mn.push(near[i] * (H > 1 ? 1 : H)); }
  return { hh, mf, mn, N };
})();
// Veins as polylines in blade coordinates: [sn, v] with v the fraction of the half-height. Side veins come off the midrib at irregular spacing,
// sweep toward the tip, some stop short, most fork once; a few fine branchlets leave each fork.
const VEINS = (() => { const out = [];
  for (let side = -1; side <= 1; side += 2) { let sn = 0.9 - 0.06 * R(side + 3, 1000), i = 0;
    while (sn > 0.2) { const k = i * 2 + (side > 0 ? 1 : 0), len = 0.2 + 0.16 * R(k, 1001), reach = 0.62 + 0.3 * R(k, 1002), se = Math.max(0.03, sn - len), bend = 0.28 + 0.3 * R(k, 1003);
      out.push({ side, w: 1, pts: [[sn, 0], [sn - len * 0.35, reach * bend], [sn - len * 0.7, reach * (0.55 + 0.3 * R(k, 1004))], [se, reach]] });
      if (R(k, 1005) < 0.75) { const t0 = 0.35 + 0.3 * R(k, 1006), bs = sn - len * t0, bv = reach * (0.3 + 0.35 * t0), bl = 0.07 + 0.08 * R(k, 1007), br = R(k, 1008) < 0.5 ? -1 : 1;
        out.push({ side, w: 0.6, pts: [[bs, bv], [bs - bl * 0.5, bv + (0.12 + 0.08 * R(k, 1009)) * br + 0.1], [bs - bl, Math.min(0.92, bv + 0.26 + 0.1 * R(k, 1010))]] }); }
      if (R(k, 1011) < 0.5) { const t0 = 0.55 + 0.3 * R(k, 1012), bs = sn - len * t0, bv = reach * (0.5 + 0.3 * t0);
        out.push({ side, w: 0.45, pts: [[bs, bv], [bs - 0.03, bv + 0.14], [bs - 0.045 - 0.03 * R(k, 1013), Math.min(0.9, bv + 0.22)]] }); }
      sn -= 0.062 + 0.095 * R(k, 1014); i++; } }
  return out; })();
// The geometry of the leaf for a given state: per-sample x, flat blade edges, roll radius and centre. Shared by the drawing and WD.leafGeo.
function leafShape(lf) {
  const N = LT.N, p = 1 - clamp(lf.curl, 0, 1), free = clamp(lf.free ?? 0, 0, 1);
  // the local curl: unrolling starts at the base and runs to the tip (an open front 0.36 of the move wide)
  // the whole roll opens together as curl falls (it shrinks and lies further out, the flat blade widening behind it), so wherever it is held it
  // is the same roll getting smaller; the very tip, jammed in the gap, stays a little tighter
  // v4: only the TIP is rolled (the story's "tip rolled up like a scroll"): the near half is wound into a short fat scroll over the tip
  // third (ROLLP: full up to sn 0.26, gone by sn 0.6); the base half of the blade lies open and flat. The scroll's open end is at the tip.
  const clAt = sn => { const c0 = 1 - p; return (c0 + (1 - c0) * 0.3 * (1 - ss(0, 0.16, sn))) * ROLLP(sn); };
  const rk = lf.rollK ?? 1;   // lf.rollK: the roll loosened (fatter) or wound tighter than its curl alone gives (a shot sets it)
  const x = [], cl = [], yf = [], rr = [];
  for (let i = 0; i <= N; i++) { const sn = i / N, c = clAt(sn), hh = LT.hh[i];
    x.push(leafX(sn)); cl.push(c); yf.push(hh * (1 - 0.78 * c)); rr.push(c > 0.02 ? Math.pow(c, 0.8) * ROLLR * rk * (1 + 0.06 * Math.sin(sn * 23 + 0.6) + 0.04 * Math.sin(sn * 53 + 2.0)) : 0); }
  const tl = LEAF.tongue * (1 - 0.8 * free) * clAt(0), r0 = rr[0], nTo = 6, tx = [], tr = [];   // the tongue: the tip rolled tight, going into the cleft
  for (let i = nTo; i >= 1; i--) { tx.push(leafX(0) - tl * i / nTo); tr.push(r0 * (0.96 + 0.04 * Math.sin(i * 2.1))); }
  return { N, p, x, cl, yf, rr, tx, tr, tl };
}
// Where the pieces of the leaf lie in the leaf's own frame, and the resting height: the lowest point of the tilted leaf touches the ground.
function leafPose(lf, sh) {
  const { N, x, yf, rr } = sh, ang = 0.05 + 0.4 * lf.rot + lf.lift * 0.12 + lf.free * 0.15, ca = Math.cos(ang), sa = Math.sin(ang);
  let low = -1e9; for (let i = 0; i <= 30; i++) { const j = Math.round(i / 30 * N), yy = Math.max(yf[j] + (rr[j] > 0.2 ? rr[j] * 1.6 : 0), 0.5); low = Math.max(low, x[j] * sa + yy * ca); }
  low = Math.max(low, LEAF.Lp * sa + 2 * ca);
  const baseX = lf.x + 2 + LEAF.Lb, baseY = 2 - low + (lf.y + 10);
  return { ang, ca, sa, baseX, baseY };
}
// lf.grip = { sn, lift }: something holds the far edge at sn and pulls it up by lift units; the margin there folds up locally (a pinch).
const gripFold = (lf, sn) => { const g = lf.grip; return g && g.lift ? g.lift * Math.exp(-(((sn - (g.sn ?? 0.62)) / 0.07) ** 2)) : 0; };
// WD.leafEdge(lf, sn) -> [x, y, z]: the world point on the far (top) edge of the dry leaf exactly as it is drawn, for sn 0..1 along the blade
// (0 = the tip, in the cleft; 1 = where the blade meets the stem), including the crinkled margin, torn bites and lf.grip's fold. The
// returned array also carries nx, ny: the unit outward normal of the edge in the picture plane (pointing away from the blade, mostly up),
// so a foot can be put on the edge and a body offset from it. z is the leaf's depth.
WD.leafEdge = (lf, sn) => {
  lf = Object.assign({ curl: 1, x: -900, y: -10, z: 2588, rot: 0.2, free: 0, lift: 0 }, lf || {});
  const sh = leafShape(lf), { N, x } = sh, { ca, sa, baseX, baseY } = leafPose(lf, sh), Wt = (xx, yy) => [baseX + xx * ca - yy * sa, baseY + xx * sa + yy * ca];
  const ed = j => { j = Math.max(0, Math.min(N, j)); return [x[j], -(LT.hh[j] + LT.mf[j]) - gripFold(lf, j / N)]; };
  const f = clamp(sn) * N, i = Math.min(N - 1, Math.floor(f)), k = f - i, a = ed(i), b = ed(i + 1);
  const p = Wt(lerp(a[0], b[0], k), lerp(a[1], b[1], k));
  const p0 = ed(i - 2), p1 = ed(i + 3), tx = p1[0] - p0[0], ty = p1[1] - p0[1], tl = Math.hypot(tx, ty) || 1;   // the normal of the smoothed edge, turned to point away from the blade (local -y side)
  let nx = ty / tl, ny = -tx / tl; if (ny > 0) { nx = -nx; ny = -ny; }
  const out = [p[0], p[1], lf.z]; out.nx = nx * ca - ny * sa; out.ny = nx * sa + ny * ca; return out;
};
// The pin stone over the leaf stem. st.pinStone = { x, z, rot, hide, hw, release }: x, z where the stone sits (world); hide: true when a
// shot draws its own stone (act 2's boulder) and the world must not draw its small one; hw: half width of the stone across the stem
// (default 11.5 for the world's stone, 14 for the boulder); release 0..1 frees the stem (it springs up off the ground) as the stone
// leaves it. Older shots hide the world's stone by moving it to x = -6000: then the boulder is taken to sit where act 2 puts it, at
// (lf.x + 132, lf.z - 15.5), the stem's pinned spot.
const pinOf = (lf, pin) => { pin = pin || {};
  const off = !(pin.x > -5000), hide = off || !!pin.hide, x = off ? lf.x + 132 : pin.x, z = off ? lf.z - 15.5 : (pin.z ?? lf.z - 6), hw = pin.hw ?? (hide ? 14 : 11.5);
  return { x, z, hw, hide, release: clamp(pin.release ?? 0), hold: pin.hold || null, flick: pin.flick || 0, taut: clamp(pin.taut || 0), uncover: pin.uncover, settle: pin.settle || 0 }; };
// The stem (petiole) as its own item, drawn just behind the pin stone's depth so the stone covers it: from the blade's base it runs down and
// toward the stone, lies flattened on the ground under it (a crease where it is pressed at each side) and pokes out past the far side,
// ending in a ragged snapped break with pale fibres. Released, it lifts off the ground in a gentle arch. Points are true 3D, projected
// into the item's plane with the shot's camera (st.cam), so the stem meets the blade and the stone from any angle.
const STEM_FREE = 13;   // v5.1: the freed stem's length past the blade's base (act 3 STEM_FREE_X)
WD.STEM_FREE = STEM_FREE;
function leafStem(lf, pin, cam) {
  // (held: the item comes in front of whoever holds it, so the end shows in their mouth; the projection keeps it in place on screen)
  const sh = leafShape(lf), { ca, sa, baseX, baseY, ang } = leafPose(lf, sh), wx = lf.x + LEAF.Lb * 0.5, wz = lf.z, zi = pin.hold && pin.release > 0.5 && (pin.hold[3] ?? 1) > 0.5 && clamp(lf.free ?? 0) < 0.05 ? Math.min(pin.z + 0.6, pin.hold[2] - 3.2) : pin.z + 0.6;
  const reach = pin.x - baseX, pinned = reach > 10 && reach < 90 && clamp(lf.free ?? 0) < 0.05;
  // v5.1: the freed stem lies shorter than the pinned one (it springs back as the stone tips off it), so Bram holds it close to the leaf and
  // the climax wide can be tight: STEM_FREE (act 3's STEM_FREE_X matches); the pinned stem keeps its old run under the stone and out past it
  const rel = pinned ? pin.release : 1, near = pin.x - pin.hw, far = pin.x + pin.hw, endF = baseX + STEM_FREE * ca + 1, end = pinned ? far + 8 : endF;
  // the stem's centre line as world points [x, y, z] with a thickness, sampled along x from the base
  const N = 34, P0 = [], P1 = [];
  for (let i = 0; i <= N; i++) { const u = i / N, X = lerp(baseX - 4, end, u), XF = lerp(baseX - 4, endF, u);
    // free: straight along the blade's angle until it meets the ground, then along the ground
    const yFree = lerp(baseY, -1.4, Math.pow(ss(baseX - 4, baseX + 14, XF), 0.75)) - 0.3 * Math.sin(Math.PI * clamp((XF - baseX) / (endF - baseX))) * (pinned ? 1 : 0);   // freed: it bends down from the blade's root and lies slack on the ground (flat along it, so open ground shows above it)
    const zFree = lerp(wz, pin.z, ss(baseX, endF, XF) * (pinned ? 1 : 0.4)) - pin.settle * ss(baseX - 4, baseX + 12, XF);   // pin.settle: the freed stem drops this far toward the lens (clear of where the stone sat)
    // pinned: sags down to the ground before the stone, pressed flat under it, lying on the ground beyond it
    const yPin = X < near ? lerp(lerp(baseY, -1.4, ss(baseX - 2, near, X) ** 1.15), lerp(baseY, -0.7, clamp((X - baseX + 4) / (near - baseX + 4))), pin.taut) : X < far ? -0.7 : -1.2 - 2.2 * ss(far + 4, end, X);   // pin.taut: pulled into a straight line   // out past the stone the snapped end lifts a little off the ground
    const zPin = lerp(wz, pin.z, ss(baseX - 4, near, X));
    const th = (X < near - 1 || X > far + 1 || !pinned ? 3.4 : 1.4) * (1 - 0.25 * ss(end - 14, end, X) - 0.3 * ss(end - 5, end, X)) * (0.3 + 0.7 * ss(baseX - 4, baseX + 5, X));   // (tapering to a plain stub at its end)   // flattened under the stone; tapered at its start, where it grows out of the blade's root
    P0.push([X, yPin, zPin, th]); P1.push([XF, yFree, zFree, 3.4 * (1 - 0.25 * ss(endF - 10, endF, XF) - 0.3 * ss(endF - 4, endF, XF)) * (0.3 + 0.7 * ss(baseX - 4, baseX + 5, XF))]); }
  // pin.flick (about -1..1): the freed stem's spring as it comes off, a lift of its outer part that rings down to nothing (the shot drives it)
  if (pin.flick && rel > 0.3) for (let i = 0; i <= N; i++) { const f = clamp((P1[i][0] - baseX) / Math.max(endF - baseX, 1)); P1[i][1] -= pin.flick * 8 * Math.pow(Math.sin(Math.PI * Math.pow(f, 0.85)), 1.3) * ss(0, 0.25, f); }   // (an arch along its free run, the root and the far end staying down)
  // pin.hold = [x, y, z, k]: somebody has the freed stem's snapped end (Bram's jaws). The stem keeps lying on the ground along its own line and
  // only its last stretch rises from the ground to the hold point (never a stiff line through the air); k (default 1) blends it in
  if (pin.hold && rel > 0.5) { const [hx, hy, hz] = pin.hold, k = clamp((rel - 0.5) * 2) * clamp(pin.hold[3] ?? 1), RISE = 9;
    for (let i = 0; i <= N; i++) { const u = i / N, X = lerp(baseX - 4, hx, u), g = lerp(baseY, -1.4, Math.pow(ss(baseX - 4, baseX + 14, X), 0.75)), up = ss(hx - RISE, hx, X);
      const q = [X, lerp(g, Math.min(hy, -1.2), up * up * (3 - 2 * up)), lerp(lerp(wz, pin.z, ss(baseX, hx, X) * 0.4) - pin.settle * ss(baseX - 4, baseX + 12, X), hz, up), P1[i][3]]; P1[i] = P1[i].map((v, j) => lerp(v, q[j], k)); } }
  let pts = P0.map((p, i) => p.map((v, j) => lerp(v, P1[i][j], rel)));
  // once the leaf has let go it takes its stem with it: the stem trails from the blade's root at its own length, along the midrib's line and
  // drooping a little, swinging as the leaf tumbles. It is never tied to a point on the ground.
  const fr = clamp(lf.free ?? 0), tk = ss(0, 0.12, fr);
  if (tk > 0) { const LS = STEM_FREE + 3, sw = 0.35 * Math.sin(fr * 11 + 0.6) * (1 - 0.6 * fr) + 0.25 * fr, a0 = ang + sw;
    pts = pts.map((p, i) => { const f = i / N, d = LS * (1 - 0.15 * P.bump(0.33, 0.16, fr)) * f, th = a0 + 0.55 * f * f * Math.cos(fr * 9) - 0.75 * f * f * P.bump(0.33, 0.16, fr), q = [baseX - 4 * (1 - f) + Math.cos(th) * d, baseY + Math.sin(th) * d + 5 * f * f, wz - 0.5];
      return p.map((v, j) => j < 3 ? lerp(v, q[j], tk) : v); }); }
  return { z: zi, draw(c, s) {
    const prj = (x, y, z) => { if (!cam) return [x, y]; const k = (zi - cam.z) / Math.max(z - cam.z, 1); return [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k]; };
    const ctr = pts.map(p => prj(p[0], p[1], p[2])), top = ctr.map((q, i) => [q[0], q[1] - pts[i][3] * 0.55]), bot = ctr.map((q, i) => [q[0], q[1] + pts[i][3] * 0.45]);
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    // under the stone the stem is not drawn at all: it goes in at the stone's near foot and comes out at its far foot, so the stone's own
    // rounded underside never shows the stem passing in front of it
    // pin.uncover (0..1, default: all at once as the stem is released) lets a shot show the pressed stretch progressively, from its near (left)
    // end, as the stone rolls back off it, so the stem never pops into view in one frame
    const unc = pin.uncover ?? (rel < 0.5 ? 0 : 1), hid0 = near + 3 + (far - near - 6) * clamp(unc);
    const hidden = i => pinned && unc < 1 && pts[i][0] > hid0 && pts[i][0] < far - 3;
    const segs = []; { let a = -1; for (let i = 0; i <= N + 1; i++) { const h = i > N || hidden(i); if (!h && a < 0) a = i; if (h && a >= 0) { segs.push([a, i - 1]); a = -1; } } }
    // its contact shadow on the ground, only where the stem shows (never a see-through band under a stone that is lifting off it)
    c.fillStyle = css([3, 5, 16], 0.4 * (1 - 0.6 * rel));
    for (const [i0, i1] of segs) { if (i1 <= i0) continue; const g0 = prj(pts[i0][0] - (i0 === 0 ? 2 : 0), 0.3, pts[i0][2]), g1 = prj(pts[i1][0] + 2, 0.3, pts[i1][2]); c.beginPath(); c.ellipse((g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2 + 0.6, Math.max(0.5, (g1[0] - g0[0]) / 2 + 1), 1.4, 0, 0, TAU); c.fill(); }
    const body = (kk, i0, i1) => { kk.beginPath(); for (let i = i0; i <= i1; i++) i > i0 ? kk.lineTo(top[i][0], top[i][1]) : kk.moveTo(top[i][0], top[i][1]);
      if (i1 === N) { const e = ctr[N], tt = pts[N][3];   // the snapped end: a plain blunt stub (v5.1: no ragged zigzag)
        kk.quadraticCurveTo(e[0] + 0.9, e[1] - tt * 0.1, e[0] + 0.5, e[1] + tt * 0.45); }
      for (let i = i1; i >= i0; i--) kk.lineTo(bot[i][0], bot[i][1]); kk.closePath(); };
    const pg = c.createLinearGradient(0, ctr[N >> 1][1] - 3, 0, ctr[N >> 1][1] + 3);
    pg.addColorStop(0, Lc([156, 116, 72], wx, -6, wz, 0.08)); pg.addColorStop(0.5, Lc([118, 82, 46], wx, -3, wz, 0.04)); pg.addColorStop(1, Lc([58, 38, 24], wx, 0, wz, 0));
    for (const [i0, i1] of segs) if (i1 > i0) P.card(c, kk => body(kk, i0, i1), pg, { lift: 0.6, tex: 0.4, shadow: 0.35, edge: 0.12 });
    c.strokeStyle = Lc([210, 170, 112], wx, -6, wz, 0.12); c.globalAlpha = 0.6; c.lineWidth = Math.max(0.35, 1.0 / s); c.beginPath(); top.forEach((q, i) => { const y = q[1] + pts[i][3] * 0.18; i && !hidden(i) && !hidden(i - 1) ? c.lineTo(q[0], y) : c.moveTo(q[0], y); }); c.stroke();
    c.strokeStyle = Lc([36, 22, 12], wx, 0, wz, 0); c.globalAlpha = 0.5; c.beginPath(); bot.forEach((q, i) => { const y = q[1] - pts[i][3] * 0.15; i && !hidden(i) && !hidden(i - 1) ? c.lineTo(q[0], y) : c.moveTo(q[0], y); }); c.stroke(); c.globalAlpha = 1;
    if (pinned && rel < 0.5) for (const X of [near + 2, far - 2]) {   // the creases where the stone presses the stem flat
      const j = Math.round(clamp((X - (baseX - 4)) / (end - baseX + 4)) * N), q = ctr[j]; if (!q) continue;
      c.strokeStyle = css([28, 16, 8], 0.7 * (1 - rel)); c.lineWidth = Math.max(0.4, 0.9 / s); c.beginPath(); c.moveTo(q[0] - 0.6, q[1] - 2.0); c.quadraticCurveTo(q[0] + 0.5, q[1], q[0] - 0.3, q[1] + 1.6); c.stroke();
      c.strokeStyle = Lc([226, 190, 132], wx, -3, wz, 0.12); c.globalAlpha = 0.5; c.beginPath(); c.moveTo(q[0] + 0.6, q[1] - 1.9); c.quadraticCurveTo(q[0] + 1.6, q[1], q[0] + 0.8, q[1] + 1.4); c.stroke(); c.globalAlpha = 1; }
    { const e = ctr[N], tt = pts[N][3], dg = c.createLinearGradient(e[0] - 5, 0, e[0] + 1, 0);   // the end a shade darker (dried at the break), with one soft fibre
      dg.addColorStop(0, css([20, 12, 6], 0)); dg.addColorStop(1, css([20, 12, 6], 0.45)); c.fillStyle = dg; c.beginPath(); c.ellipse(e[0] - 1.6, e[1], 3.2, Math.max(0.6, tt * 0.55), 0, 0, TAU); c.fill();
      if (!(zi < pin.z + 0.6)) { c.strokeStyle = Lc([170, 136, 92], wx, -3, wz, 0.06); c.globalAlpha = 0.35; c.lineWidth = Math.max(0.3, 0.6 / s); c.beginPath(); c.moveTo(e[0] - 2.4, e[1] - tt * 0.1); c.quadraticCurveTo(e[0] - 0.4, e[1] - tt * 0.2, e[0] + 1.2, e[1] + tt * 0.05); c.stroke(); c.globalAlpha = 1; } }
    c.restore(); } };
}
// Geometry for other modules (a character that stands on the roll, a moth that grips the tip). Same pose maths as the drawing; world units.
// tip: the tip of the blade; base: where blade meets stem; standAt(x): where feet rest at world x (top of the roll, or the middle of the near half
// once flat); edgeAt(x): the lower edge of the near half; x0, x1: the span of standAt.
// ---- the peel: Pip holding the curl's free edge ----
// lf.peel = { x, y, k, w }: a grip point in world units (x, y, at the leaf's depth) where something holds the free edge of the curl, how far
// that edge has been drawn up off the roll toward it (k 0..1: 0 lying in the roll, 1 at the grip), and the half span along the blade that
// the pull lifts (w, default 13). The world draws the paper between the roll and the grip as part of the leaf: the same dry blade, its
// side veins running from the roll up to the edge, the crinkled margin along the top, the paler underside showing where it turns over the
// roll. The roll itself keeps shrinking with lf.curl, so there is one curl, unrolling toward the hands; nothing else needs to draw a roll.
// peelGeo works in the leaf's own frame (x along the blade, y down toward the near edge) and is shared by the drawing and WD.leafCurlEdge.
function peelGeo(lf, sh, pose) {
  const pl = lf.peel; if (!pl || !(pl.k > 0.005)) return null;
  const { N, x, yf, rr } = sh, { ca, sa, baseX, baseY } = pose, k = clamp(pl.k), w = pl.w ?? 10;
  const dx = pl.x - baseX, dy = pl.y - baseY, gx = dx * ca + dy * sa, gy = -dx * sa + dy * ca;   // the grip in the leaf's frame
  // the hinge the edge comes up from: the top of the roll where the paper is still rolled; where it has already opened flat, a fold line
  // across the near half (so the edge stays something to hold however far the curl has opened)
  const top = i => lerp(yf[i] * 0.45, yf[i] - 0.4 * rr[i] - 0.3, ss(0, 1.5, rr[i]));
  const idx = []; for (let i = 0; i <= N; i++) if (Math.abs(x[i] - gx) < 2.2 * w) idx.push(i);
  if (idx.length < 3) return null;
  const wgt = xx => k * (1 - ss(w * 0.28, w * 1.7, Math.abs(xx - gx)));                          // a short level stretch under the hands, easing down to the roll
  const bot = idx.map(i => [x[i], top(i)]);
  const edge = idx.map((i, j) => { const q = wgt(x[i]); return [x[i] + (gx - x[i]) * q * 0.32, lerp(top(i), gy, q) + LT.mn[i] * 0.35 * (1 - q)]; });
  return { idx, bot, edge, gx, gy, k, w, wgt };
}
WD.leafGeo = lf => {
  lf = Object.assign({ curl: 1, x: -900, y: -10, z: 2588, rot: 0.2, free: 0, lift: 0 }, lf || {});
  const sh = leafShape(lf), { N, x, yf, rr } = sh, pose = leafPose(lf, sh), { ca, sa, baseX, baseY } = pose, Wt = (xx, yy) => [baseX + xx * ca - yy * sa, baseY + xx * sa + yy * ca];
  const stand = [], bottom = [];
  for (let i = 0; i <= N; i++) { const top = yf[i] - 0.4 * rr[i]; stand.push(Wt(x[i], top - 0.45 * yf[i] * (1 - sh.cl[i]))); bottom.push(Wt(x[i], yf[i] + 1.6 * rr[i])); }
  const at = (arr, xx) => { for (let i = 1; i <= N; i++) if (arr[i][0] >= xx) { const a = arr[i - 1], b = arr[i], t = (xx - a[0]) / Math.max(b[0] - a[0], 1e-6); return lerp(a[1], b[1], clamp(t)); } return arr[N][1]; };
  return { tip: Wt(x[0], 0), base: Wt(0, 0), standAt: xx => at(stand, xx), edgeAt: xx => at(bottom, xx), x0: stand[0][0], x1: stand[N][0], ang: pose.ang };
};
// WD.leafCurlEdge(lf) -> where the curl's free edge is, in world units (z is the leaf's depth), for a character that holds it:
//   lipAt(x): the top of the roll at world x, where the paper leaves the roll (the edge lies here when nothing pulls it);
//   edgeAt(x): the free edge at world x with lf.peel applied (on the roll outside the pull, rising to the grip under it);
//   grip: the edge point under the hands ([peel.x, peel.y] once peel.k = 1, on the roll top at peel.k = 0); null without lf.peel;
//   radius: the roll's radius under the grip; span: [x0, x1] world x of the lifted stretch; outline: the free edge as world points.
// Drive it from a shot by setting lf.peel = { x, y, k } (the mitts' point, and how far the edge has come up to them), and draw only the mitts.
// WD.leafScrollEnd(lf) -> { x, y, z, r }: the centre of the scroll's open end (world units, on the leaf's plane) and its radius, as drawn.
// A character holding the curl puts its mitts by it; lf.peel = { x, y, k } (a point on the leaf's plane) draws the free edge off it to there.
WD.leafScrollEnd = lf => {
  lf = Object.assign({ curl: 1, x: -900, y: -10, z: 2588, rot: 0.2, free: 0, lift: 0 }, lf || {});
  const sh = leafShape(lf), ps = leafPose(lf, sh), xx = sh.tx.length ? sh.tx[0] : sh.x[0], r = sh.tx.length ? sh.tr[0] : sh.rr[0], yy = 0.6 * r;
  // ang: the leaf's tilt; rot: where the sheet's outer end lies on the scroll (scrollEnd's rot, turned by a peel the way leaf() turns it), so
  // WD.scrollOutline can follow the spiral's real outline (its outer turn is widest at the end and narrows going back round)
  let rot = 0.55; const pl = lf.peel;
  if (pl && pl.k > 0.005) { const dx = pl.x - ps.baseX, dy = pl.y - ps.baseY, gx = dx * ps.ca + dy * ps.sa, gy = -dx * ps.sa + dy * ps.ca, k = clamp(pl.k), out = [xx + Math.cos(rot) * r * SCROLL_SX, yy + Math.sin(rot) * r];
    const lip = [lerp(out[0], gx, k), lerp(out[1], gy, k)]; rot = lerp(rot, Math.atan2(lip[1] - yy, (lip[0] - xx) / SCROLL_SX) - 0.5, ss(0, 0.3, k)); }
  return { x: ps.baseX + xx * ps.ca - yy * ps.sa, y: ps.baseY + xx * ps.sa + yy * ps.ca, z: lf.z, r: r * 1.04, ang: Math.atan2(ps.sa, ps.ca), rot };
};
// A point on the drawn outline of the scroll's open end (as scrollEnd draws it: the outer turn of a spiral, 1.75 turns, widest at its end),
// at local angle th (y down, before the leaf's tilt), d units outside it. E is WD.leafScrollEnd(lf).
WD.scrollOutline = (E, th, d = 0) => { const TT = 1.75 * TAU, D = (((E.rot ?? 0.55) - th) % TAU + TAU) % TAU, r = E.r * (1 - 0.78 * D / TT) + 0.1 * E.r + d, ca = Math.cos(E.ang || 0), sa = Math.sin(E.ang || 0), lx = Math.cos(th) * r * SCROLL_SX, ly = Math.sin(th) * r;
  return [E.x + lx * ca - ly * sa, E.y + lx * sa + ly * ca]; };
WD.leafCurlEdge = lf => {
  lf = Object.assign({ curl: 1, x: -900, y: -10, z: 2588, rot: 0.2, free: 0, lift: 0 }, lf || {});
  const sh = leafShape(lf), pose = leafPose(lf, sh), { N, x, yf, rr } = sh, { ca, sa, baseX, baseY } = pose, Wt = (xx, yy) => [baseX + xx * ca - yy * sa, baseY + xx * sa + yy * ca, lf.z];
  const toL = wx => (wx - baseX) / Math.max(ca, 0.2);   // world x -> blade x (the blade lies nearly level, so x alone picks the sample)
  const iAt = bx => clamp(Math.round((bx - x[0]) / (x[N] - x[0]) * N), 0, N);
  const hinge = i => lerp(yf[i] * 0.45, yf[i] - 0.4 * rr[i] - 0.3, ss(0, 1.5, rr[i]));
  const lipAt = wx => { const i = iAt(toL(wx)); return Wt(x[i], hinge(i)); };
  const pg = peelGeo(lf, sh, pose);
  const edgeAt = wx => { if (!pg) return lipAt(wx); const bx = toL(wx); let j = 0; while (j < pg.idx.length - 1 && pg.edge[j + 1][0] < bx) j++;
    const a = pg.edge[j], b = pg.edge[Math.min(j + 1, pg.edge.length - 1)], t = b[0] > a[0] ? clamp((bx - a[0]) / (b[0] - a[0])) : 0; return Wt(lerp(a[0], b[0], t), lerp(a[1], b[1], t)); };
  const grip = pg ? Wt(pg.gx, lerp(hinge(iAt(pg.gx)), pg.gy, pg.k)) : null;
  return { lipAt, edgeAt, grip, radius: rr[iAt(pg ? pg.gx : toL(lf.x + 60))], span: pg ? [Wt(pg.edge[0][0], 0)[0], Wt(pg.edge[pg.edge.length - 1][0], 0)[0]] : null,
    outline: pg ? pg.edge.map(q => Wt(q[0], q[1])) : [] };
};
function leaf(c, s, lf) {
  const sh = leafShape(lf), { N, x, cl, yf, rr, tx, tr, tl } = sh, { Lb, Lp } = LEAF, z = lf.z, gx = lf.x, hhM = LEAF.Wh * LEAF.fv;
  const det = clamp((s - 2.5) / 8), poseL = leafPose(lf, sh), { ang, baseX, baseY } = poseL, free = clamp(lf.free ?? 0, 0, 1);
  // v5: st.spoutCalm (0..1, a shot sets it) lowers the contrast of the blade's mottling, veins, creases and holes, so the roll in the gap and the
  // hands on it are the place to look; the roll itself is never calmed
  const qk = clamp((CUR.spout && CUR.spout.spoutCalm) || 0);
  // v5.1: st.spoutHush (0..1, the climax wide sets it) goes further on the flat blade only: a darker, duller blade body with its veins, holes and
  // blotches nearly flat, so the roll, the strip in Pip's mitts and the lifted edge (all lighter) read first; the roll is never hushed
  const qh = clamp((CUR.spout && CUR.spout.spoutHush) || 0), hb = c3 => mixc(c3, [c3[0] * 0.62 + 10, c3[1] * 0.66 + 8, c3[2] * 0.8 + 6], qh);
  const wx = gx + Lb * 0.5, wz = z;       // world position of the leaf centre, for lighting
  c.save();
  { const gl = clamp(1 - free * 1.4) * 0.5; if (gl > 0.02) { c.fillStyle = css([3, 5, 16], gl); c.beginPath(); c.ellipse(baseX - Lb * 0.5, 1.5, (Lb + Lp) * 0.58, 3 + 3 * Math.max(...rr) / 8, 0, 0, TAU); c.fill(); } }   // soft contact shadow on the ground
  c.translate(baseX, baseY); c.rotate(ang);
  const poly = (kk, pts) => { pts.forEach((p, i) => i ? kk.lineTo(p[0], p[1]) : kk.moveTo(p[0], p[1])); };
  const far = [], near = [];
  for (let i = 0; i <= N; i++) { far.push([x[i], -(LT.hh[i] + LT.mf[i]) - gripFold(lf, i / N)]); near.push([x[i], yf[i] + LT.mn[i] * (1 - cl[i])]); }
  const flat = kk => { kk.beginPath(); poly(kk, far); for (let i = N; i >= 0; i--) kk.lineTo(near[i][0], near[i][1]); kk.closePath(); };
  c.lineJoin = 'round'; c.lineCap = 'round';
  // --- petiole (stem): only its root is drawn with the blade; the rest runs to the pin stone and out past it (leafStem, its own item)
  // a short tube that tapers into the blade's narrow base and widens to leafStem's thickness and colours where they meet (th 3.4), with a
  // rounded end tucked under the stem's start, so no flat block shows past the blade's base
  { const pg = c.createLinearGradient(0, -2.4, 0, 2.4); pg.addColorStop(0, Lc([156, 116, 72], wx, -6, wz, 0.08)); pg.addColorStop(0.5, Lc([118, 82, 46], wx, -3, wz, 0.04)); pg.addColorStop(1, Lc([58, 38, 24], wx, 0, wz, 0));
    const root = kk => { kk.beginPath(); kk.moveTo(-7, -0.5); kk.quadraticCurveTo(-4, -0.85, -2.6, -1.35); kk.quadraticCurveTo(-1.6, -1.2, -1.6, -0.1); kk.quadraticCurveTo(-1.6, 1.0, -2.6, 1.1); kk.quadraticCurveTo(-4, 0.95, -7, 0.6); kk.closePath(); };   // (v4.3: it ends inside the stem's start, so no knob shows past the bend when the freed stem drops from the base)
    P.card(c, root, pg, { lift: 0.6, tex: 0.4, shadow: 0.35, edge: 0.12 }); }
  // --- the flat part of the blade (a paper card: drop shadow, fibre, soft top edge)
  const fg = c.createLinearGradient(0, -hhM, 0, hhM * 0.5);
  fg.addColorStop(0, Lc(hb([108, 74, 46]), wx, -22, wz, 0.08)); fg.addColorStop(0.4, Lc(hb([126, 90, 54]), wx, -8, wz, 0.05)); fg.addColorStop(1, Lc(hb([90, 62, 38]), wx, 4, wz, 0.03));
  P.card(c, flat, fg, { lift: 1.3, tex: 0.6, shadow: 0.45, edge: 0.18 });
  c.save(); flat(c); c.clip();
  // mottling: big soft patches of olive, tan, rust and grey, then harder dark brown blotches (stable, from the hash)
  const blot = (xx, yy, rx, ry, rot, col, al) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(0.7, `rgba(${col},${al * 0.55})`); g.addColorStop(1, `rgba(${col},0)`);
    c.save(); c.translate(xx, yy); c.rotate(rot); c.scale(1, ry / rx); c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore(); };
  for (let i = 0; i < 24; i++) { const sn = 0.06 + 0.9 * R(i, 901), xx = leafX(sn) + (R(i, 902) - 0.5) * 12, yy = (R(i, 903) - 0.55) * LT.hh[Math.round(sn * N)] * 1.7, rx = 5 + 11 * R(i, 904), ry = rx * (0.4 + 0.6 * R(i, 905)), m = i % 4;
    blot(xx, yy, rx, ry, R(i, 906) * 3, m === 0 ? '204,168,112' : m === 1 ? '124,62,32' : m === 2 ? '112,112,60' : '150,136,100', (m === 2 ? 0.3 : 0.34) * (1 - 0.45 * qk) * (1 - 0.6 * qh)); }
  for (let i = 0; i < 16; i++) { const sn = 0.1 + 0.85 * R(i, 920), xx = leafX(sn) + (R(i, 921) - 0.5) * 8, yy = (R(i, 922) - 0.5) * LT.hh[Math.round(sn * N)] * 1.5, rx = 1.6 + 5.5 * R(i, 923);
    blot(xx, yy, rx, rx * (0.4 + 0.5 * R(i, 924)), R(i, 925) * 3, i % 3 === 0 ? '28,14,6' : '58,28,12', (0.55 + 0.3 * R(i, 926)) * (1 - 0.6 * qk) * (1 - 0.6 * qh)); }
  { const mg = c.createLinearGradient(0, -hhM, 0, 0); mg.addColorStop(0, css([40, 20, 8], 0.5 * (1 - 0.5 * qk))); mg.addColorStop(0.3, css([40, 20, 8], 0)); c.fillStyle = mg; c.fillRect(-Lb - 20, -hhM - 4, Lb + 24, hhM + 4);   // darker dry band along the far margin
    const og = c.createRadialGradient(-Lb * 0.12, -2, 0, -Lb * 0.12, -2, 28); og.addColorStop(0, css([100, 104, 52], 0.3)); og.addColorStop(1, css([100, 104, 52], 0)); c.fillStyle = og; c.fillRect(-Lb * 0.12 - 28, -30, 56, 56); }   // a last tinge of olive near the base
  // side veins: raised (pale line with a dark shadow side), forking; they follow the blade outline, so they reach the margin only where it is wide
  const vw = Math.max(0.5, 1.2 / s), vpt = (v, sd) => { const sn = clamp(v[0]), i = Math.round(sn * N); return [leafX(sn), sd * v[1] * LT.hh[i]]; };
  for (const vn of VEINS) { const q = vn.pts.map(v => vpt(v, vn.side)); const fine = vn.w < 0.5; if (fine && det < 0.3) continue;
    for (const [col, al, dy, wm] of [[[48, 26, 12], 0.5, 0.55, 0.8], [[198, 154, 98], 0.55, 0, 0.55]]) {
      c.strokeStyle = Lc(col, wx, vn.side * 8, wz, col[0] > 100 ? 0.1 : 0.02); c.globalAlpha = al * (1 - 0.65 * qk) * (1 - 0.7 * qh); c.lineWidth = Math.max(vw * wm * vn.w, 0.3);
      c.beginPath(); c.moveTo(q[0][0], q[0][1] + dy); if (q.length === 4) c.bezierCurveTo(q[1][0], q[1][1] + dy, q[2][0], q[2][1] + dy, q[3][0], q[3][1] + dy); else c.quadraticCurveTo(q[1][0], q[1][1] + dy, q[2][0], q[2][1] + dy); c.stroke(); } }
  c.globalAlpha = 1;
  // fine cross-veins: a loose net between the side veins
  if (det > 0.15) { c.strokeStyle = Lc([70, 42, 20], wx, 0, wz, 0.02); c.lineWidth = Math.max(0.28, 0.5 / s); c.globalAlpha = 0.17 * det * (1 - 0.8 * qk);
    for (let i = 0; i < 70; i++) { const sn = 0.12 + 0.8 * R(i, 1030), sd = R(i, 1031) < 0.5 ? -1 : 1, v = 0.15 + 0.7 * R(i, 1032), q = vpt([sn, v], sd), l = 2 + 4 * R(i, 1033), a = -2.4 + 0.6 * R(i, 1034) * sd;
      c.beginPath(); c.moveTo(q[0], q[1]); c.quadraticCurveTo(q[0] + Math.cos(a) * l * 0.5, q[1] + Math.sin(a) * l * 0.2 * sd, q[0] + Math.cos(a) * l, q[1] + Math.sin(a) * l * 0.4 * sd); c.stroke(); }
    c.globalAlpha = 1; }
  // midrib: raised, slightly wavering, thinning toward the tip
  { const mp = k => { k.moveTo(x[0], 0.6); for (let i = 1; i <= N; i += 4) k.lineTo(x[i], 0.6 + 0.4 * Math.sin(i * 0.11)); k.lineTo(Lp * 0.2, 0.6); };
    c.strokeStyle = Lc([46, 26, 12], wx, 0, wz, 0.02); c.globalAlpha = 0.6 * (1 - 0.4 * qh); c.lineWidth = Math.max(vw * 1.3, 1.6); c.beginPath(); mp(c); c.stroke();
    c.strokeStyle = Lc([208, 168, 110], wx, -4, wz, 0.12); c.globalAlpha = 0.8 * (1 - 0.55 * qh); c.lineWidth = Math.max(vw * 0.9, 1.0); c.translate(0, -0.5); c.beginPath(); mp(c); c.stroke(); c.translate(0, 0.5); c.globalAlpha = 1; }
  // crumple creases: a few long, faint folds across the blade
  for (let i = 0; i < 6; i++) { const sn = 0.15 + 0.7 * R(i, 950), xx = leafX(sn), yy = (R(i, 951) - 0.7) * LT.hh[Math.round(sn * N)], l = 9 + 14 * R(i, 952), a2 = -0.9 + 0.5 * R(i, 953);
    c.strokeStyle = css([36, 20, 10], 0.2 * (1 - 0.7 * qk)); c.lineWidth = Math.max(0.4, 0.9 / s * 1.3); c.beginPath(); c.moveTo(xx, yy); c.quadraticCurveTo(xx + Math.cos(a2) * l * 0.5 + 2, yy + Math.sin(a2) * l * 0.5, xx + Math.cos(a2) * l, yy + Math.sin(a2) * l); c.stroke();
    c.strokeStyle = css([236, 196, 132], 0.13 * (1 - 0.7 * qk)); c.beginPath(); c.moveTo(xx + 0.8, yy + 0.8); c.quadraticCurveTo(xx + Math.cos(a2) * l * 0.5 + 2.8, yy + Math.sin(a2) * l * 0.5 + 0.8, xx + Math.cos(a2) * l + 0.8, yy + Math.sin(a2) * l + 0.8); c.stroke(); }
  // insect-eaten holes: ragged and uneven, a burnt-brown ring round a dark gap that shows the ground
  for (const [sn, fy, rx, ry, sd] of [[0.64, -0.46, 3.3, 2.1, 1], [0.4, -0.3, 2.0, 1.5, 2], [0.8, -0.5, 1.9, 1.2, 3], [0.5, 0.0, 1.2, 0.9, 4], [0.22, -0.4, 1.4, 1.0, 5]]) { const i = Math.round(sn * N), xx = leafX(sn), yy = fy * LT.hh[i], hp = [], nn = 13, rot = R(sd, 941) * 3;
    for (let q = 0; q < nn; q++) { const a2 = TAU * q / nn, j = 0.72 + 0.5 * R(sd, q + 940) + (q % 5 === 0 ? 0.25 : 0), ex = Math.cos(a2) * rx * j, ey = Math.sin(a2) * ry * j; hp.push([xx + ex * Math.cos(rot) - ey * Math.sin(rot), yy + ex * Math.sin(rot) + ey * Math.cos(rot)]); }
    c.fillStyle = css([36, 18, 8], 0.8 * (1 - 0.6 * qk) * (1 - 0.5 * qh)); c.beginPath(); c.save(); c.translate(xx, yy); c.scale(1.5, 1.5); c.translate(-xx, -yy); poly(c, hp); c.closePath(); c.fill(); c.restore();
    c.fillStyle = css(mixc([8, 8, 18], [62, 42, 26], 0.6 * qk + 0.25 * qh), 0.95 * (1 - 0.3 * qk) * (1 - 0.45 * qh)); c.beginPath(); poly(c, hp); c.closePath(); c.fill(); }
  const hushShade = () => { if (qh < 0.01) return; const hg = c.createLinearGradient(-Lb, 0, 0, 0);   // (the shade over the blade away from the roll: the roll end stays bright)
    hg.addColorStop(0, css([10, 8, 18], 0)); hg.addColorStop(0.2, css([10, 8, 18], 0)); hg.addColorStop(0.5, css([10, 8, 18], 0.4 * qh)); hg.addColorStop(1, css([10, 8, 18], 0.48 * qh));
    c.fillStyle = hg; c.fillRect(-Lb - 30, -80, Lb + Lp + 40, 160); };
  hushShade();
  c.restore();
  c.strokeStyle = Lc([60, 34, 16], wx, -8, wz, 0.02); c.lineWidth = Math.max(0.5, 1.0 / s * 1.4); c.beginPath(); poly(c, far); c.stroke();   // dry dark rim on the crinkled margin
  // --- the roll: the near half of the blade turned up and over, a thin paper tube whose radius follows the paper left in the roll
  const rmax = Math.max(...rr, 0);
  if (rmax > 0.6) {
    const top = [], bot = [], cen = [], xs = [];
    for (let i = 0; i < tx.length; i++) { xs.push(tx[i]); cen.push(0.6 * tr[i]); top.push(-0.4 * tr[i]); bot.push(1.6 * tr[i]); }
    for (let i = 0; i <= N; i++) { xs.push(x[i]); const r = rr[i]; cen.push(yf[i] + 0.6 * r); top.push(yf[i] - 0.4 * r); bot.push(yf[i] + 1.6 * r); }
    const NN = xs.length, wob = i => 0.3 * Math.sin(i * 0.9 + 1) + 0.25 * Math.sin(i * 2.3);   // slightly crinkled edges
    const tubeP = kk => { kk.beginPath(); for (let i = 0; i < NN; i++) { const y = top[i] + (top[i] < bot[i] - 0.3 ? wob(i) : 0); i ? kk.lineTo(xs[i], y) : kk.moveTo(xs[i], y); }
      for (let i = NN - 1; i >= 0; i--) kk.lineTo(xs[i], bot[i] + (top[i] < bot[i] - 0.3 ? wob(i + 7) * 0.7 : 0)); kk.closePath(); };
    const rM = rmax, cyM = 0.6 * rM, rL = tr.length ? tr[0] : rr[0], xL = xs[0], capW = 0.34 * rL;
    const tg = c.createLinearGradient(0, cyM - rM, 0, cyM + rM);
    tg.addColorStop(0, Lc([170, 126, 84], wx, -rM, wz, 0.1)); tg.addColorStop(0.24, Lc([138, 98, 58], wx, -rM * 0.4, wz, 0.07)); tg.addColorStop(0.62, Lc([100, 66, 40], wx, rM * 0.3, wz, 0.04)); tg.addColorStop(1, Lc([44, 28, 18], wx, rM, wz, 0));
    P.card(c, tubeP, tg, { lift: 1.2, tex: 0.55, shadow: 0.5, edge: 0.2 });
    c.save(); tubeP(c); c.clip();
    // paper bands: the veins wrap round the tube, so they cross it slantwise (never along it, like grain); irregular spacing and contrast
    const slant = rM * 0.7; let xv = xL + 4; let q = 0;
    while (xv < Lp * 0.2) { const i = Math.max(0, xs.findIndex(v => v >= xv)), r = Math.max(top[i] < bot[i] ? (bot[i] - top[i]) / 2 : 0, 0.0); if (r > 0.8) {
        const y0 = top[i] + r * 0.12, y1 = bot[i] - r * 0.1, bend = (R(q, 1050) - 0.5) * r * 0.7;
        for (const [col, al, dx, dy, wm] of [[[36, 18, 8], 0.26, 0.6, 0.6, 1.1], [[224, 184, 126], 0.3, 0, 0, 0.8]]) { c.strokeStyle = Lc(col, wx, y0, wz, col[0] > 100 ? 0.1 : 0.02); c.globalAlpha = al * (0.55 + 0.45 * R(q, 1051)); c.lineWidth = Math.max(0.35, 0.9 / s * wm * 1.4);
          c.beginPath(); c.moveTo(xv + dx, y0 + dy); c.bezierCurveTo(xv - slant * 0.2 + bend + dx, y0 + (y1 - y0) * 0.35 + dy, xv - slant * 0.6 + bend + dx, y0 + (y1 - y0) * 0.7 + dy, xv - slant + dx, y1 + dy); c.stroke(); } }
      xv += 4.5 + 6 * R(q, 1052); q++; }
    c.globalAlpha = 1;
    // blotches and patches on the outer paper, a darker underside shadow low on the tube
    for (let i = 0; i < 14; i++) { const k = Math.floor(R(i, 932) * (NN - 2)), r = (bot[k] - top[k]) / 2; if (r < 1.5) continue; const m = i % 3, rx = 3 + 5 * R(i, 934);
      blot(xs[k], cen[k] + (R(i, 933) - 0.5) * r, rx, rx * 0.6, 0.2, m === 0 ? '36,18,8' : m === 1 ? '196,154,100' : '120,58,30', m === 0 ? 0.5 : 0.28); }
    { const sg = c.createLinearGradient(0, cyM - rM, 0, cyM + rM); sg.addColorStop(0.55, css([14, 8, 6], 0)); sg.addColorStop(1, css([14, 8, 6], 0.5)); c.fillStyle = sg; c.fillRect(xL - 6, cyM - rM - 2, Lb + 60, 2 * rM + 4); }
    // the curled lip: the free margin of the paper turns over along the top of the roll, showing its paler underside, with a dark crease beneath and a ragged edge
    const lipE = i => 0.35 * noise(i * 0.13, 1061) + 0.15 * noise(i * 0.41, 1062);   // soft irregular lip edge
    const lipW = i => Math.max(0, bot[i] - top[i]) / 2 * (0.2 + 0.5 * (1 - cl[Math.max(0, Math.min(N, i - tx.length))]) + 0.04 * noise(i * 0.07, 1063));
    c.beginPath(); for (let i = 0; i < NN; i++) i ? c.lineTo(xs[i], top[i] + wob(i)) : c.moveTo(xs[i], top[i] + wob(i)); for (let i = NN - 1; i >= 0; i--) c.lineTo(xs[i], top[i] + lipW(i) * 1.5 + lipE(i));
    c.closePath(); { const lg = c.createLinearGradient(0, cyM - rM, 0, cyM - rM * 0.4); lg.addColorStop(0, Lc([232, 202, 150], wx, -rM, wz, 0.14)); lg.addColorStop(1, Lc([196, 160, 108], wx, -rM * 0.6, wz, 0.08)); c.fillStyle = lg; c.fill(); }
    c.strokeStyle = Lc([34, 18, 8], wx, 0, wz, 0); c.globalAlpha = 0.7; c.lineWidth = Math.max(0.4, 1.0 / s * 1.3); c.beginPath(); for (let i = 0; i < NN; i++) { const y = top[i] + lipW(i) * 1.5 + lipE(i); i ? c.lineTo(xs[i], y) : c.moveTo(xs[i], y); } c.stroke(); c.globalAlpha = 1;
    hushShade();
    c.restore();
    // a thin moon-lit edge along the very top of the tube
    if (qh > 0.01) { const eg = c.createLinearGradient(-Lb, 0, 0, 0); eg.addColorStop(0, css([226, 232, 250], 0.34)); eg.addColorStop(0.3, css([226, 232, 250], 0.34)); eg.addColorStop(0.55, css([226, 232, 250], 0.34 * (1 - 0.7 * qh))); c.strokeStyle = eg; }
    else c.strokeStyle = css([226, 232, 250], 0.34);
    c.lineWidth = Math.max(0.4, 0.9 / s); c.beginPath(); for (let i = 0; i < NN; i++) i ? c.lineTo(xs[i], top[i] + wob(i)) : c.moveTo(xs[i], top[i] + wob(i)); c.stroke();
    // the open end of the scroll at the tip: always the one rolled end of this leaf, seen end on at a slant. With lf.peel (somebody holding the
    // free edge) the outer turn runs on as a flat strip of the same blade to the hands (scrollEnd's lip): the more is pulled off, the smaller
    // the scroll (lf.curl, lf.rollK) and the longer the strip.
    if (rL > 0.8) { const L = (col, e = 0.04) => Lc(col, wx, cen[0], wz, e), pl = lf.peel, SX = SCROLL_SX;
      let lip = null, rot = 0.55;
      if (pl && pl.k > 0.005) { const dx = pl.x - baseX, dy = pl.y - baseY, ca2 = Math.cos(ang), sa2 = Math.sin(ang), gx = dx * ca2 + dy * sa2, gy = -dx * sa2 + dy * ca2;
        const k = clamp(pl.k), out = [xL + Math.cos(rot) * rL * SX, cen[0] + Math.sin(rot) * rL];
        lip = [lerp(out[0], gx, k), lerp(out[1], gy, k)]; rot = lerp(rot, Math.atan2(lip[1] - cen[0], (lip[0] - xL) / SX) - 0.5, ss(0, 0.3, k)); }
      scrollEnd(c, s, xL, cen[0], rL * 1.04, rot, L, SX, { lip, lipW: lf.peel && lf.peel.w ? lf.peel.w : Math.max(2.4, rL * 0.9) }); }
  }
  c.restore();
}
// The dipper standing or lying on the ground: the same small copper cup on a short handle that Pip holds (see drawDipper in cast.js),
// at the same scale, so it never changes size when he picks it up or lets go. The handle's foot is at (x, y, z); d.fall tips it from
// standing (0, a slight lean) to lying on its side (1).
const DIPPER_S = 0.93;
// The outline points of the dipper in its own frame (handle corners, cup body and rim), used to sit it on the ground: whatever its tilt,
// its lowest point touches y = 0 (it pivots on the ground as it tips over, and lies on its side with the cup's flank on the turf).
const DIPPER_PTS = (() => { const ox = 4.6, oy = -12.6, rx = 5.0, Hc = 8.2, out = [[-0.4, 1.8], [2.4, 1.8], [1.0, 3.1], [2.4, -5.4], [-0.4, -7.6]];
  for (let i = 0; i <= 12; i++) { const u = i / 12, bz = (a, b, c2, d2) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c2 + u ** 3 * d2;
    out.push([bz(ox - rx, ox - rx - 0.2, ox - 2.6, ox), bz(oy, oy + 4.6, oy + Hc, oy + Hc)], [bz(ox + rx, ox + rx + 0.2, ox + 2.6, ox), bz(oy, oy + 4.6, oy + Hc, oy + Hc)]); }
  for (let i = 0; i < 16; i++) { const a = TAU * i / 16; out.push([ox + Math.cos(a) * (rx + 0.2), oy + Math.sin(a) * 1.95]); }
  return out; })();
const dipperRest = fall => { const an = 0.1 + 1.32 * fall, ca = Math.cos(an), sa = Math.sin(an); let lo = -1e9, x0 = 1e9, x1 = -1e9;
  for (const [px, py0] of DIPPER_PTS) { const py = py0 - 1.5 * fall, X = px * ca - py * sa, Y = px * sa + py * ca; lo = Math.max(lo, Y); x0 = Math.min(x0, X); x1 = Math.max(x1, X); }
  return { dy: -lo, x0, x1 }; };
function dipper(c, s, d) {
  const x = d.x, z = d.z, fall = clamp(d.fall ?? 1, 0, 1), L = (col, yy, e = 0.1) => lit(col, x, yy, z, e), rest = dipperRest(fall);
  c.save(); c.translate(x, d.y || 0); c.scale(-DIPPER_S, DIPPER_S);
  c.fillStyle = css([4, 6, 18], 0.42); c.beginPath(); c.ellipse((rest.x0 + rest.x1) / 2, 0.3, (rest.x1 - rest.x0) * 0.55 + 1, 1.3, 0, 0, TAU); c.fill();   // contact shadow on the ground
  c.translate(0, rest.dy); c.rotate(0.1 + 1.32 * fall); c.translate(0, -1.5 * fall);
  // handle: rounded at the foot, flaring into the bowl
  const hg = c.createLinearGradient(-1, 0, 3, 0); hg.addColorStop(0, L([104, 62, 38], -4)); hg.addColorStop(0.4, L([214, 150, 96], -4, 0.2)); hg.addColorStop(1, L([92, 54, 34], -4));
  P.card(c, k => { k.moveTo(-0.4, 1.8); k.bezierCurveTo(-0.4, 3.5, 2.4, 3.5, 2.4, 1.8); k.lineTo(2.4, -5.4); k.quadraticCurveTo(2.8, -6.1, 3.9, -6.3); k.lineTo(0.3, -11.6); k.quadraticCurveTo(-0.4, -9.5, -0.4, -7.6); k.closePath(); }, hg, { lift: 0.3, tex: 0.1, shadow: 0.3, edge: 0 });
  // cup: a round-bottomed bowl with a dark opening and a rolled rim
  const ox = 4.6, oy = -12.6, rx = 5.0, Hc = 8.2;
  const cg = c.createLinearGradient(ox - rx, 0, ox + rx, 0); cg.addColorStop(0, L([122, 70, 44], -9)); cg.addColorStop(0.3, L([218, 150, 96], -9, 0.25)); cg.addColorStop(0.58, L([176, 108, 66], -9)); cg.addColorStop(1, L([92, 52, 36], -9));
  P.card(c, k => { k.moveTo(ox - rx, oy); k.bezierCurveTo(ox - rx - 0.2, oy + 4.6, ox - 2.6, oy + Hc, ox, oy + Hc); k.bezierCurveTo(ox + 2.6, oy + Hc, ox + rx + 0.2, oy + 4.6, ox + rx, oy); k.closePath(); }, cg, { lift: 0.5, tex: 0.12, shadow: 0.3, edge: 0.3 });
  c.fillStyle = L([40, 24, 22], oy, 0); c.beginPath(); c.ellipse(ox, oy, rx - 0.5, 1.7, 0, 0, TAU); c.fill();
  if ((d.water || 0) > 0.02) { c.fillStyle = L([120, 160, 220], oy, 0.5); c.beginPath(); c.ellipse(ox, oy + 0.3, (rx - 0.7) * d.water, 1.2 * d.water, 0, 0, TAU); c.fill(); }
  c.strokeStyle = L([232, 168, 112], oy, 0.05); c.lineWidth = 0.9; c.beginPath(); c.ellipse(ox, oy, rx + 0.2, 1.95, 0, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(255,238,200,0.6)'; c.lineWidth = 0.4; c.beginPath(); c.ellipse(ox, oy, rx + 0.2, 1.95, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.restore();
}
// Water surface / ground-plane helpers for the pond: ring of points around an ellipse, mapped with true perspective.
function pondSurface(c, z0, cx, y0, zc, rx, rz, bulge, k = 1) { const pts = [];
  for (let i = 0; i < 40; i++) { const th = TAU * i / 40, nz = 1 + 0.07 * noise(i * 0.55, 760) + 0.04 * noise(i * 1.7, 761), x = cx + Math.cos(th) * rx * k * nz, zz = zc + Math.sin(th) * rz * k * nz; pts.push(gp(z0, x, y0 - bulge(x, zz), zz)); }
  return pts; }
// ---------- the dam: stacked river stones ----------
// Display colours (what each stone should look like at dusk): slate, blue-grey, cool grey, a greenish grey and a rare warm grey.
const DAM_COLS = [[84, 92, 98], [104, 110, 112], [120, 124, 124], [86, 102, 98], [70, 78, 84], [110, 112, 108], [126, 124, 116], [96, 102, 106], [76, 90, 82], [98, 108, 100]];
const DAM_GL = 0.07;     // how much of the warm pond light the stone faces take (the warmth belongs on the crest, as backlight)
// How strongly the pond's trapped light is on (0..1.2) and how much of it reaches a stone at x: strongest at the cleft.
// v5: how much a dam stone at x is calmed (st.spoutCalm, a shot sets it): full over the stretch of the dam behind the leaf, the stem and Bram,
// fading out beyond it. A calmed stone keeps its shape and shading but its speckle, bedding, lichen, rim and crest glow lose contrast.
const spCalmAt = x => { const k = clamp((CUR.spout && CUR.spout.spoutCalm) || 0); return k <= 0 ? 0 : k * (1 - ss(170, 330, Math.abs(x - SP.cx - 80))); };
const pondGlow = x => { const sp = CUR.spout || {}; return clamp(sp.pond ?? 0, 0, 1.2) * clamp(sp.waterGlow ?? 0, 0, 1) * (0.4 + 0.6 * Math.exp(-(((x - SP.cx) / 300) ** 2))); };
// A river stone: irregular rounded block, flat enough underneath to sit, soft matt volume (no glossy egg highlight), pale moonlit
// rim on the upper right, a dark gap around it, strata, speckle, lichen and (sometimes) moss. When the pond is full its crest
// catches the trapped amber light from behind.
function damStone(c, s, x, y0, z, w, h, seed, o = {}) {
  if (!vis(c, s, x - w / 2, x + w / 2, y0 - h - 8, y0 + 6, 30)) return;
  const n = 12, px = w * s, col = DAM_COLS[Math.floor(R(seed, 1) * DAM_COLS.length)], bri = 0.84 + 0.32 * R(seed, 2), pts = [];
  const ex1 = o.matte ? 0.95 : 0.7, ex2 = o.matte ? 0.9 : 0.78, jit = o.matte ? 0.3 : 0.22;   // matte: a rounder, lumpier rock (a squared one reads as a jar)
  for (let i = 0; i < n; i++) { const a = TAU * (i + 0.35 * R(seed, i + 40)) / n, ca = Math.cos(a), sa = Math.sin(a), j = 0.86 + jit * R(seed, i + 3);
    pts.push([Math.sign(ca) * Math.pow(Math.abs(ca), ex1) * w / 2 * j, Math.min(-h / 2 + Math.sign(sa) * Math.pow(Math.abs(sa), ex2) * h / 2 * j * 1.04, 0.4)]); }
  const C = (b, yy) => rg(shD(mul(col, b * bri), x, y0 + yy, z, 0.04, DAM_GL)), body = k => smoothPoly(k, pts), qs = spCalmAt(x), bl = o.crest ? pondGlow(x) * (1 - 0.75 * qs) : 0;
  c.save(); c.translate(x, y0); c.lineJoin = 'round';
  c.fillStyle = css([3, 5, 16], 0.32); c.beginPath(); smoothPoly(c, pts.map(p => [p[0] * 1.045 - w * 0.012, (p[1] + h / 2) * 1.05 - h / 2 + h * 0.03])); c.fill();   // soft contact shadow low and to the left (the light is up and right); the wall behind darkens the gaps
  let g = c.createLinearGradient(w * 0.3, -h, -w * 0.35, 0); g.addColorStop(0, C(1.3, -h)); g.addColorStop(0.5, C(0.88, -h * 0.5)); g.addColorStop(1, C(0.44, 0));
  P.card(c, body, g, { lift: Math.max(1, h * 0.06), tex: px > 14 ? (o.matte ? 0.55 : 0.24) : 0, shadow: 0.5, edge: 0 });
  c.save(); c.beginPath(); body(c); c.clip();
  g = c.createRadialGradient(w * 0.16, -h * 0.8, 0, w * 0.16, -h * 0.8, w * 0.55); g.addColorStop(0, css([200, 216, 245], 0.2)); g.addColorStop(1, css([200, 216, 245], 0)); c.fillStyle = g; c.fillRect(-w, -h - 2, 2 * w, h + 4);   // soft moonlit top
  g = c.createLinearGradient(0, -h * 0.3, 0, 0); g.addColorStop(0, css([4, 6, 20], 0)); g.addColorStop(1, css([4, 6, 20], 0.42)); c.fillStyle = g; c.fillRect(-w, -h * 0.3, 2 * w, h * 0.3 + 1);   // dark foot
  c.strokeStyle = css([3, 6, 18], 0.3); c.lineWidth = Math.max(1.2, Math.min(w, h) * 0.2); c.lineJoin = 'round'; c.beginPath(); body(c); c.stroke();   // ambient occlusion: the edges of a stone sit in shadow where it meets its neighbours
  if (o.matte && px > 14) {   // matte rock: soft mottling in darker and paler stone, grain, a crack; opaque, a few specks at most
    for (let i = 0; i < 9; i++) { const a = R(seed, 300 + i) * TAU, rr2 = Math.sqrt(R(seed, 310 + i)) * 0.7, bx = Math.cos(a) * w * 0.45 * rr2, by = -h * 0.5 + Math.sin(a) * h * 0.42 * rr2, br = (0.18 + 0.2 * R(seed, 320 + i)) * Math.min(w, h);
      const mg = c.createRadialGradient(bx, by, 0, bx, by, br); mg.addColorStop(0, css(i % 3 ? [12, 14, 22] : [190, 196, 200], i % 3 ? 0.22 : 0.1)); mg.addColorStop(1, css([0, 0, 0], 0)); c.fillStyle = mg; c.fillRect(bx - br, by - br, 2 * br, 2 * br); }
    for (let i = 0; i < 6; i++) { const a = R(seed, 330 + i) * TAU, rr2 = Math.sqrt(R(seed, 340 + i)) * 0.8; c.fillStyle = css([8, 10, 20], 0.3); c.beginPath(); c.arc(Math.cos(a) * w * 0.44 * rr2, -h * 0.5 + Math.sin(a) * h * 0.42 * rr2, Math.max(0.25, 0.5 / s), 0, TAU); c.fill(); }
    c.strokeStyle = css([8, 10, 24], 0.4); c.lineWidth = Math.max(0.4, 1.0 / s); c.lineCap = 'round'; c.beginPath(); const cx1 = (R(seed, 4) - 0.5) * w * 0.4; c.moveTo(cx1 - w * 0.15, -h * 0.7); c.lineTo(cx1 - w * 0.03, -h * 0.52); c.lineTo(cx1 + w * 0.08, -h * 0.45); c.lineTo(cx1 + w * 0.12, -h * 0.25); c.stroke();
    if (o.wet) { c.fillStyle = css([2, 6, 16], 0.2); c.beginPath(); c.ellipse(-w * 0.1, -h * 0.15, w * 0.3, h * 0.1, 0, 0, TAU); c.fill(); }
  } else if (px > 20) {
    const sn = Math.min(46, 10 + (px / 4 | 0));
    for (let i = 0; i < sn; i++) { const a = R(seed, 30 + i) * TAU, r = Math.sqrt(R(seed, 50 + i)) * 0.85; c.fillStyle = R(seed, 70 + i) < 0.55 ? css([10, 14, 34], 0.22) : css([225, 232, 250], 0.13); c.beginPath(); c.arc(Math.cos(a) * w * 0.46 * r, -h * 0.5 + Math.sin(a) * h * 0.44 * r, 0.25 + R(seed, 90 + i) * 0.7, 0, TAU); c.fill(); }
    c.lineCap = 'round';
    // bedding: soft bands of slightly different tone and a few curved lines along the long axis of the stone (never vertical stripes)
    for (let i = 0; i < 3; i++) { const yb = -h * (0.18 + 0.26 * i + 0.1 * R(seed, 120 + i)), th = h * (0.1 + 0.1 * R(seed, 124 + i)), sl = (R(seed, 127 + i) - 0.5) * 0.12 * h;
      c.fillStyle = css(R(seed, 130 + i) < 0.5 ? [8, 14, 22] : [210, 222, 232], 0.07 + 0.05 * R(seed, 133 + i)); c.beginPath(); c.moveTo(-w * 0.6, yb - sl); c.bezierCurveTo(-w * 0.2, yb + sl * 0.5 - th * 0.2, w * 0.2, yb - sl * 0.4 + th * 0.2, w * 0.6, yb + sl); c.lineTo(w * 0.6, yb + sl + th); c.bezierCurveTo(w * 0.2, yb - sl * 0.4 + th * 1.2, -w * 0.2, yb + sl * 0.5 + th * 0.8, -w * 0.6, yb - sl + th); c.closePath(); c.fill(); }
    for (let i = 0; i < 3; i++) { const y1 = -h * (0.22 + 0.22 * i + 0.12 * R(seed, 140 + i)), sl = (R(seed, 144 + i) - 0.5) * 0.18 * h, xa = -w * (0.46 - 0.2 * R(seed, 148 + i)), xb = xa + w * (0.45 + 0.35 * R(seed, 152 + i));
      c.strokeStyle = css([6, 10, 24], 0.24); c.lineWidth = Math.max(0.35, 0.8 / s); c.beginPath(); c.moveTo(xa, y1 - sl); c.bezierCurveTo(xa + (xb - xa) * 0.3, y1 + sl * 0.5 + h * 0.03, xa + (xb - xa) * 0.7, y1 - sl * 0.6, xb, y1 + sl); c.stroke();
      c.strokeStyle = css([220, 232, 242], 0.1); c.beginPath(); c.moveTo(xa, y1 - sl + 0.8); c.bezierCurveTo(xa + (xb - xa) * 0.3, y1 + sl * 0.5 + h * 0.03 + 0.8, xa + (xb - xa) * 0.7, y1 - sl * 0.6 + 0.8, xb, y1 + sl + 0.8); c.stroke(); }
    if (R(seed, 128) < 0.3) { c.strokeStyle = css([8, 10, 28], 0.3); c.lineWidth = Math.max(0.3, 0.8 / s); const cx1 = (R(seed, 4) - 0.5) * w * 0.5; c.beginPath(); c.moveTo(cx1 - w * 0.12, -h * 0.62); c.lineTo(cx1 - w * 0.02, -h * 0.5); c.lineTo(cx1 + w * 0.1, -h * 0.42); c.lineTo(cx1 + w * 0.17, -h * 0.28); c.stroke(); }   // hairline crack, slanting
    if (R(seed, 131) < 0.55) for (let i = 0; i < 7; i++) { const a = (R(seed, 140 + i) - 0.5) * w * 0.7, b = -h * (0.4 + 0.5 * R(seed, 150 + i)); c.fillStyle = css(R(seed, 160 + i) < 0.5 ? [150, 176, 120] : [188, 196, 168], 0.16); c.beginPath(); c.ellipse(a, b, 1.2 + 2.6 * R(seed, 170 + i), 0.8 + 1.4 * R(seed, 180 + i), 0, 0, TAU); c.fill(); }   // lichen
    if (o.wet) { c.fillStyle = css([2, 6, 16], 0.16); for (let i = 0; i < 2; i++) { const sx = (R(seed, 190 + i) - 0.5) * w * 0.6; c.beginPath(); c.ellipse(sx, -h * (0.12 + 0.1 * R(seed, 195 + i)), w * 0.14, h * 0.07, 0, 0, TAU); c.fill(); } }   // damp patches near the foot
  }
  if (qs > 0.01) { c.globalAlpha = 0.42 * qs; c.fillStyle = C(0.66, -h * 0.45); c.fillRect(-w, -h - 2, 2 * w, h + 4); c.globalAlpha = 1; }   // (calmed: a flat wash of its own darker mid tone)
  c.restore();
  // moonlit rim on the upper right, then the trapped amber light catching the crest from behind
  const rimPath = k => smoothPoly(k, pts);
  moonRim(c, rimPath, Math.max(0.5, 1.0 / s), 0.36 * (1 - 0.6 * qs));
  if (bl > 0.04) { c.save(); c.beginPath(); body(c); c.clip(); c.translate(0, 0.8 + 0.9 / s); const wg = c.createLinearGradient(0, -h, 0, -h * 0.55); wg.addColorStop(0, css([255, 190, 100], clamp(0.8 * bl))); wg.addColorStop(1, css([255, 150, 60], 0));
    c.strokeStyle = wg; c.lineWidth = Math.max(0.9, 1.6 / s); c.setLineDash([w * (0.22 + 0.2 * R(seed, 200)), w * (0.1 + 0.1 * R(seed, 201)), w * (0.08 + 0.1 * R(seed, 202)), w * (0.16 + 0.1 * R(seed, 203))]); c.lineDashOffset = R(seed, 204) * w; c.beginPath(); body(c); c.stroke(); c.setLineDash([]); c.restore(); }
  if (o.moss && px > 8 && !o.matte) mossCap(c, s, (R(seed, 110) - 0.5) * w * 0.45, -h * 0.86, w * 0.28, seed, x, z);
  c.restore();
}

// ---- the rolled tip ----
// scrollEnd: a rolled leaf seen end on. One thin dry leaf sheet wound in a single continuous spiral (under two turns) round a dark hollow
// core, with wide dark gaps between the turns so it reads as a scroll, never as rings or a sawn log. The sheet is the leaf's own brown,
// lighter where it faces the moon (up and right), with a thin pale papery edge on each turn, vein ticks across it and one ragged insect
// hole in the outer turn. The free outer edge wraps round and lifts off as a short ragged flap; with o.lip = [x, y] (same coordinates as
// x, y) it runs on as a flat strip of the same leaf straight to that point, the unrolled sheet in somebody's hands.
// (x, y) centre, R outer radius, rot the angle the outer turn ends at, sx a horizontal squash for an end seen at a slant, L(col, e) a lit colour.
function scrollEnd(c, s, x, y, R, rot, L, sx = 1, o = {}) {
  if (R * s < 1.2) return;
  const turns = o.turns ?? 1.75, r0 = 0.22 * R, pitch = (R - r0) / turns, N = Math.max(36, Math.min(160, Math.round(R * s * 3.2)));
  const bandAt = f => pitch * (0.26 + 0.2 * f);                                   // the sheet: thin at the core, a little thicker outside; the gap stays wider
  const P2 = (f, dr = 0) => { const th = rot - (1 - f) * turns * TAU, r = r0 + (R - r0) * f + dr; return [x + Math.cos(th) * r * sx, y + Math.sin(th) * r]; };
  const spiral = (f0, f1, dr = 0) => { c.beginPath(); const n = Math.max(4, Math.round(N * (f1 - f0))); for (let i = 0; i <= n; i++) { const p = P2(lerp(f0, f1, i / n), dr); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } };
  const ribbon = (f0, f1, k) => { const n = Math.max(4, Math.round(N * (f1 - f0))), a = [], b = [];   // the sheet as a filled band (its width follows bandAt)
    for (let i = 0; i <= n; i++) { const f = lerp(f0, f1, i / n), w = bandAt(f) * k / 2; a.push(P2(f, w)); b.push(P2(f, -w)); }
    c.beginPath(); a.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); for (let i = b.length - 1; i >= 0; i--) c.lineTo(b[i][0], b[i][1]); c.closePath(); };
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  // the hollow: the inside of the roll is in deep shadow, so the gaps between the turns read dark
  // (only inside the outermost turn: outside the sheet there is nothing, so the end never reads as a dark disc)
  const hg = c.createRadialGradient(x, y, 0, x, y, R); hg.addColorStop(0, L([4, 3, 2], 0)); hg.addColorStop(0.6, L([18, 11, 7], 0)); hg.addColorStop(1, L([40, 26, 16], 0.01));
  c.fillStyle = hg; spiral(Math.max(0, 1 - 1 / turns), 1, 0); c.closePath(); c.fill();
  // the sheet: a soft shadow under each turn, then the paper, lit from the upper right
  c.fillStyle = L([10, 5, 3], 0); c.globalAlpha = 0.7; ribbon(0.03, 1, 1.5); c.fill(); c.globalAlpha = 1;
  const lg = c.createLinearGradient(x + R * 0.8 * sx, y - R * 0.8, x - R * 0.8 * sx, y + R * 0.8);
  lg.addColorStop(0, L([214, 166, 104], 0.08)); lg.addColorStop(0.45, L([156, 110, 64], 0.05)); lg.addColorStop(1, L([88, 58, 34], 0.02));
  c.fillStyle = lg; ribbon(0.03, 1, 1); c.fill();
  // the pale papery cut edge along the outside of each turn, brightest where it faces the moon; the inner face of each turn darker
  c.strokeStyle = L([246, 216, 160], 0.12); c.lineWidth = Math.max(0.3, Math.min(pitch * 0.12, 1.2 / s + pitch * 0.05));
  for (let q = 0; q < 8; q++) { const f0 = 0.08 + q * 0.115, p = P2(f0 + 0.05); const up = clamp(0.5 + ((p[0] - x) / Math.max(R * sx, 1e-3)) * 0.35 - ((p[1] - y) / R) * 0.45); c.globalAlpha = 0.25 + 0.65 * up; spiral(f0, Math.min(1, f0 + 0.12), bandAt(f0) * 0.5); c.stroke(); }
  c.globalAlpha = 0.5; c.strokeStyle = L([34, 18, 8], 0); c.lineWidth = Math.max(0.3, pitch * 0.08); spiral(0.05, 1, -bandAt(0.5) * 0.5); c.stroke(); c.globalAlpha = 1;
  // vein ticks across the sheet, and a ragged insect hole through the outer turn
  if (R * s > 8) { c.strokeStyle = L([62, 34, 14], 0.01); c.globalAlpha = 0.6; c.lineWidth = Math.max(0.3, 0.7 / s);
    for (let i = 0; i < 7; i++) { const f = 0.25 + 0.72 * (i + 0.4 * hash(i, 1081)) / 7, a = P2(f, -bandAt(f) * 0.45), b = P2(f + 0.015, bandAt(f) * 0.45); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); } c.globalAlpha = 1;
    const hp = P2(0.8), hr = bandAt(0.8) * 0.42; c.fillStyle = L([6, 4, 3], 0); c.beginPath(); for (let q = 0; q < 9; q++) { const a = TAU * q / 9, j = 0.7 + 0.5 * hash(q, 1083); c.lineTo(hp[0] + Math.cos(a) * hr * j * sx * 1.3, hp[1] + Math.sin(a) * hr * j); } c.closePath(); c.fill(); }
  // the free outer edge: the end of the sheet lifts off the roll; with o.lip it runs on, flat, to the hands
  { const a = P2(1), th = rot, tx = -Math.sin(th) * sx, ty = Math.cos(th), nx = Math.cos(th) * sx, ny = Math.sin(th), bw = bandAt(1);
    if (o.lip) {   // the unrolled blade: a flat strip of the same dry leaf from the outer turn to the hands, its ragged margin on top, its veins
      // running across it, darker in the crease where it leaves the roll and curling over a little at the held end (the paler underside)
      const lx = o.lip[0], ly = o.lip[1], dx = lx - a[0], dy = ly - a[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, px = -uy, py = ux, w = Math.max(bw * 0.9, o.lipW ?? bw * 1.4);
      const up = py < 0 ? 1 : -1, NS = Math.max(8, Math.min(40, Math.round(dl * s / 6)));   // up: the side of the strip that faces up on screen (its margin)
      const ctr = f => { const sag = 0.08 * dl * Math.sin(Math.PI * f); return [a[0] + dx * f + px * sag * up * -1, a[1] + dy * f + py * sag * up * -1]; };
      const wid = f => w * (0.55 + 0.45 * ss(0, 0.35, f)) * (1 + 0.04 * Math.sin(f * 17));
      const tooth = (f, i) => (i % 2 ? 0.55 : 0.12) * w * 0.12 * (0.5 + hash(i, 1141)) * ss(0.05, 0.2, f);
      const topE = [], botE = [];
      for (let i = 0; i <= NS; i++) { const f = i / NS, q = ctr(f), hw = wid(f) / 2; topE.push([q[0] + px * up * (hw + tooth(f, i)), q[1] + py * up * (hw + tooth(f, i))]); botE.push([q[0] - px * up * hw, q[1] - py * up * hw]); }
      const strip = k => { k.beginPath(); k.moveTo(a[0] + nx * bw * 0.5, a[1] + ny * bw * 0.5); topE.forEach(q => k.lineTo(q[0], q[1])); for (let i = NS; i >= 0; i--) k.lineTo(botE[i][0], botE[i][1]); k.lineTo(a[0] - nx * bw * 0.5, a[1] - ny * bw * 0.5); k.closePath(); };
      const sg = c.createLinearGradient(a[0], a[1], lx, ly); sg.addColorStop(0, L([92, 60, 34], 0.03)); sg.addColorStop(0.25, L([132, 94, 56], 0.05)); sg.addColorStop(1, L([168, 124, 76], 0.08));
      P.card(c, strip, sg, { lift: 0.8, tex: 0.6, shadow: 0.45, edge: 0.15 });
      c.save(); strip(c); c.clip();
      // the midrib side of the paper (a faint vein along it) and side veins running across it, slanting back toward the roll
      const vw = Math.max(0.35, 0.8 / s);
      c.globalAlpha = 0.55; c.strokeStyle = L([52, 30, 14], 0.02); c.lineWidth = vw * 1.4; c.beginPath(); for (let i = 0; i <= NS; i++) { const q = ctr(i / NS), o2 = -0.28 * wid(i / NS) * up; i ? c.lineTo(q[0] + px * o2, q[1] + py * o2) : c.moveTo(q[0] + px * o2, q[1] + py * o2); } c.stroke();
      for (let j = 0; j < 7; j++) { const f = 0.12 + 0.82 * (j + 0.5 * hash(j, 1142)) / 7; if (f * dl * s < 6) continue; const q = ctr(f), hw = wid(f) / 2, b0 = [q[0] - px * up * hw * 0.3, q[1] - py * up * hw * 0.3], b1 = [q[0] + px * up * hw * 0.95 - ux * hw * 0.7, q[1] + py * up * hw * 0.95 - uy * hw * 0.7];
        for (const [col, al, d] of [[[46, 24, 10], 0.32, 0.5], [[214, 172, 112], 0.3, 0]]) { c.strokeStyle = L(col, col[0] > 100 ? 0.1 : 0.02); c.globalAlpha = al; c.lineWidth = vw * 0.8; c.beginPath(); c.moveTo(b0[0] + d, b0[1] + d); c.quadraticCurveTo((b0[0] + b1[0]) / 2 + 0.6, (b0[1] + b1[1]) / 2, b1[0] + d, b1[1] + d); c.stroke(); } }
      c.globalAlpha = 1;
      for (let q = 0; q < 5; q++) { const f = 0.15 + 0.8 * hash(q, 1143), cq = ctr(f), r2 = wid(f) * (0.2 + 0.25 * hash(q, 1144)), bg = c.createRadialGradient(cq[0], cq[1], 0, cq[0], cq[1], r2);   // mottling, as on the blade
        bg.addColorStop(0, q % 2 ? 'rgba(70,34,14,0.3)' : 'rgba(236,200,140,0.18)'); bg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = bg; c.fillRect(cq[0] - r2, cq[1] - r2, 2 * r2, 2 * r2); }
      { const cg = c.createLinearGradient(a[0], a[1], a[0] + ux * w * 1.6, a[1] + uy * w * 1.6); cg.addColorStop(0, 'rgba(20,10,4,0.6)'); cg.addColorStop(1, 'rgba(20,10,4,0)'); c.fillStyle = cg; c.fillRect(Math.min(a[0], lx) - w * 2, Math.min(a[1], ly) - w * 2, Math.abs(dx) + w * 4, Math.abs(dy) + w * 4); }   // the crease off the roll
      c.restore();
      // the margin: a dry dark rim with a moonlit top edge; the held end curls over, showing a band of the paler underside
      c.lineJoin = 'round'; c.strokeStyle = L([50, 28, 12], 0); c.globalAlpha = 0.7; c.lineWidth = Math.max(0.35, 0.9 / s); c.beginPath(); topE.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.stroke();
      c.strokeStyle = 'rgba(232,236,250,0.3)'; c.lineWidth = Math.max(0.3, 0.7 / s); c.beginPath(); topE.forEach((q, i) => i ? c.lineTo(q[0], q[1] - 0.3) : c.moveTo(q[0], q[1] - 0.3)); c.stroke(); c.globalAlpha = 1;
      { const e0 = topE[NS], e1 = botE[NS], cx2 = lx - ux * w * 0.35, cy2 = ly - uy * w * 0.35; c.fillStyle = L([214, 178, 124], 0.1); c.globalAlpha = 0.8; c.beginPath(); c.moveTo(e0[0], e0[1]); c.quadraticCurveTo(cx2 + px * up * w * 0.2, cy2 + py * up * w * 0.2, e1[0] - ux * w * 0.25, e1[1] - uy * w * 0.25); c.lineTo(e1[0], e1[1]); c.closePath(); c.fill(); c.globalAlpha = 1; } }
    else { const Lf = R * 0.5;
      const fl = k => { k.moveTo(a[0] - nx * bw * 0.5, a[1] - ny * bw * 0.5); k.quadraticCurveTo(a[0] + tx * Lf * 0.6 + nx * bw * 0.3, a[1] + ty * Lf * 0.6 + ny * bw * 0.3, a[0] + tx * Lf + nx * bw * 1.6, a[1] + ty * Lf + ny * bw * 1.6);
        k.lineTo(a[0] + tx * Lf * 0.75 + nx * bw * 1.9, a[1] + ty * Lf * 0.75 + ny * bw * 1.9); k.lineTo(a[0] + tx * Lf * 0.5 + nx * bw * 1.4, a[1] + ty * Lf * 0.5 + ny * bw * 1.4); k.quadraticCurveTo(a[0] + nx * bw, a[1] + ny * bw, a[0] + nx * bw * 0.5, a[1] + ny * bw * 0.5); k.closePath(); };
      c.fillStyle = L([218, 180, 122], 0.1); c.beginPath(); fl(c); c.fill(); c.strokeStyle = L([40, 22, 10], 0); c.globalAlpha = 0.6; c.lineWidth = Math.max(0.3, 0.7 / s); c.beginPath(); fl(c); c.stroke(); c.globalAlpha = 1; } }
  c.restore();
}
WD.scrollEnd = scrollEnd;
const SCROLL_SX = 0.85;   // the scroll's open end is seen at a slant: drawn this much narrower than tall (pressItems wraps water round the same ellipse)
WD.SCROLL_SX = SCROLL_SX;
WD.leafLit = (disp, x, y, z, e = 0.04) => Lc(disp, x, y, z, e);   // the dry leaf's colouring, for a shot that draws a piece of the same leaf
// lf.tip (how far Luma has raised the tip) draws the crumpled plug in the notch part way out of the gap (plugPull).
const plugPull = lf => 0.6 * clamp(((lf && lf.tip) || 0) / 24);
// The jaws of the gap: two stones of the sluice mouth just in front of the leaf's rolled tip, so the scroll end sits wedged between rocks
// (their edges overlap it) from every spout camera; the leaf's own roll is the only rolled end there is (no separate piece in the slot).
// They are ground stones: they stay put when the tip is lifted out from between them and after the leaf springs away.
const jambAt = lf => { const sh = leafShape(Object.assign({}, lf, { lift: 0, free: 0, peel: null })), ps = leafPose(Object.assign({}, lf, { lift: 0, free: 0 }), sh), xx = sh.tx.length ? sh.tx[0] : sh.x[0], r = sh.tx.length ? sh.tr[0] : sh.rr[0], yy = 0.6 * r;
  return { x: ps.baseX + xx * ps.ca - yy * ps.sa, y: ps.baseY + xx * ps.sa + yy * ps.ca, r: Math.max(r, 3) }; };
let JAMB = null;
// where the seep trickle lands (its puddle, on the floor of the mouth at the jamb stone's foot), for a shot that must keep it in view
WD.seepFoot = () => JAMB ? [JAMB.X - JAMB.w * 0.36 + 2.5, 2.6, JAMB.z - 1.2] : null;
const ROLL_JAM_W = 1.6;   // the jammed scroll's rollK (shots.js ROLL_JAM): the seat is where that roll lies
function jambItems(lf) {
  // fixed: where the tip lies when jammed (the seat every spout shot uses), whatever the leaf does later
  const lx = P.SH && P.SH.LEAF_X !== undefined ? P.SH.LEAF_X : WD.chan(0)[0] + 5, lz = WD.chan(0)[2] - 12;
  if (!JAMB || JAMB.lx !== lx) { const e = jambAt({ curl: 1, x: lx, y: -10, z: lz, rot: 0.25, free: 0, lift: 0, rollK: ROLL_JAM_W }), r = e.r * 1.04;
    // a low, matte stone just right of the scroll's foot: its left edge tucks under the roll's right side (the end sits wedged on rock), its top
    // stays below the roll's centre, so the roll's base, the seal's foot and the dark outlet under it all show from every spout camera
    const X = e.x + r * SCROLL_SX + 8.5, w = 19, h = Math.max(6, -e.y * 0.8);
    JAMB = { x: e.x, y: e.y, r, z: lz, lx, X, w, h, top: 1 - h }; }
  const z = JAMB.z - 0.7, { X, w, h } = JAMB;
  // when the leaf springs out the burst knocks the jamb over: it tips and tumbles out to the right of the mouth (no stone ever vanishes)
  const kk = ss(0.003, 0.25, clamp(lf.free ?? 0));   // about 0.15-0.45 s after the release: a knock and a roll, not a one-frame flip
  // v6: the outlet itself, a cut-stone arch framing the whole slot: from just left of where the roll jams to the right side of the cleft
  // the burst pours from. It is drawn behind the cleft, the roll and the pond's heap, so the plug reads as a leaf stuffed into a hole in
  // the dam, and the same arch stays (empty, pouring) when the leaf springs out.
  const hw = SP.mw + 3, xl = Math.min(JAMB.x - JAMB.r * SCROLL_SX * 1.25, SP.cx - hw) - 1, xr = SP.cx + hw + 2, ox = (xl + xr) / 2, orx = (xr - xl) / 2;
  const ory = Math.max(-(JAMB.y - JAMB.r * 1.25), -(SP.top - 2)) , oyc = -ory + orx * 0.9, zo = Math.max(JAMB.z, 2692) + 1.2;
  const arch = (k, ix, top) => { k.moveTo(ox - ix, 1); k.lineTo(ox - ix, top + ix * 0.9); k.ellipse(ox, top + ix * 0.9, ix, ix * 0.9, 0, Math.PI, TAU); k.lineTo(ox + ix, 1); k.closePath(); };
  const outlet = { z: zo, draw(c, s) {
    const T5 = 6, top = -ory, g = c.createLinearGradient(0, top - T5, 0, 1); g.addColorStop(0, lit([214, 212, 224], ox, top, zo, 0.2)); g.addColorStop(1, lit([120, 118, 134], ox, 0, zo, 0.04));
    P.card(c, k => arch(k, orx + T5, top - T5), g, { lift: 0.8, tex: 0.25, shadow: 0.45, edge: 0.35 });
    c.save(); c.strokeStyle = css([40, 40, 56], 0.55); c.lineWidth = 0.5;   // the joints between the arch stones
    for (const a of [-0.8, -0.4, 0, 0.4, 0.8]) { const an = -Math.PI / 2 + a, cyy = top + orx * 0.9; c.beginPath(); c.moveTo(ox + Math.cos(an) * orx, cyy + Math.sin(an) * orx * 0.9); c.lineTo(ox + Math.cos(an) * (orx + T5), cyy + Math.sin(an) * (orx + T5) * 0.9); c.stroke(); }
    c.restore();
    const m = c.createLinearGradient(0, top, 0, 1); m.addColorStop(0, css([6, 10, 20], 1)); m.addColorStop(1, css([12, 18, 28], 1));
    c.fillStyle = m; c.beginPath(); arch(c, orx, top); c.fill(); } };
  return [outlet, { z, draw(c, s) {
    if (kk <= 0) return damStone(c, s, X, 1, z, w, h, 887, { wet: true, matte: true });
    c.save(); c.translate(X + 20 * kk, -5 * Math.sin(Math.PI * kk)); c.rotate(1.35 * kk); damStone(c, s, -(w * 0.5) * kk, 1, z, w, h, 887, { wet: true, matte: true }); c.restore(); } }];
}
// The pond at the seal. Four items, all on the roll as it is drawn now (WD.leafScrollEnd, the same squashed ellipse scrollEnd draws):
// back  (just behind the leaf): the pond's own water heaped into the slot against the scroll's upstream (top) side: the pond's colours, a lighter
//       convex face where the swell catches the sky (it rises and eases with st.pond), a dark seam where it meets the rock, and a bright meniscus
//       that lies exactly on the roll's outline. No glow of its own: it is the pond, not a lamp.
// gap   (just behind the leaf): once Luma has the tip up, the dark wedge the roll leaves under itself: its curved top is the roll's underside,
//       its sides the slot's rock closing in to the seat. Feathered, never a box.
// spill (in front of the jamb stone): once the tip is up, water spills out of the gap under the roll as a ragged, broken sheet: separate tongues
//       with rock showing between them, foamy white at the lip (which follows the roll's underside: no flat sluice edge), opaque blue-green
//       below with white aeration, breaking into drops low down, splashing white where they hit the jamb stone and the ground. It widens in
//       steps: a tongue is added at each turn Pip winds off the scroll (lf.curl) and lf.gush (a shot's heave pulse) throws a surge through it.
//       It falls from the roll's underside to the right of its lower-left, where Pip holds the strip, so it never comes out of his mitts.
// front (in front of the jamb stone): while the seal holds, beads squeezing out at the seal's foot and a dark wet streak with broken highlights
//       that tapers and soaks into the stone, ending in a damp stain before the dry outlet.
let SPILL_LAYER = null;   // a scratch layer the spill under the lifted roll is drawn on (cleared every use: no state between frames)
const SEAL_DARK = [9, 28, 48], SEAL_MID = [20, 62, 84], SEAL_TOP = [36, 92, 112];   // act 2's pond colours (pondDraw), top to depth
// The pond's push on the plug, 0..1: a swell every SWP seconds that rises and falls over SWR seconds (smooth at both ends), then rests.
const SWP = 2.3, SWR = 1.3;
const SEEP_HI = [150, 198, 212];   // (polish) the seep's brightest highlight colour: luma about 185, so at a swell's peak the trickle stays below the faces
const swellAt = t => { const ph = ((t % SWP) + SWP) % SWP; return ph < SWR ? Math.pow(Math.sin(Math.PI * ph / SWR), 2) : 0; };
WD.swellAt = swellAt;
function pressItems(st, lf) {
  // (after the release the band round the roll and the slot go within three frames; the last of the spill falls clear over about eight more as the burst takes over)
  const free = clamp(lf.free ?? 0), fast = 1 - ss(0, 0.012, free), seal = 1 - ss(0.004, 0.08, free), drop = ss(0, 0.07, free), pr = clamp(st.pond ?? 0) * seal; if (pr < 0.04 || !JAMB) return [];
  const ex = JAMB.x, ey = JAMB.y, r0 = JAMB.r, tt = st.t || 0, zb = JAMB.z + 0.6, zg = JAMB.z + 0.3, zf = JAMB.z - 1.2, SXr = SCROLL_SX;
  const E = WD.leafScrollEnd(free > 0 ? Object.assign({}, lf, { free: 0, x: P.SH && P.SH.LEAF_X !== undefined ? P.SH.LEAF_X : lf.x, y: -10 }) : lf), rise = Math.max(0, ey - E.y);   // the roll as drawn now, and how far it has come up off its seat
  const lifted = ss(1.2, 6, rise), turns = clamp((1 - (lf.curl ?? 1)) / 0.59), open = clamp(0.28 * ss(1, 16, lf.tip || 0) + 0.6 * turns + 0.2 * ss(18.5, 21, lf.tip || 0)), gush = clamp(lf.gush || 0);
  const tipOn = ss(0.5, 3, lf.tip || 0);   // water only pours once Luma has the tip up: Pip's solo heaves (no tip) only loosen the roll, and it keeps seeping
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  // the pond's push: a slow swell every SWP seconds (it rises and falls over 1.3 s, then rests), the same clock for the heap in the slot, the
  // contact line on the roll and the trickle squeezed out under it (which carries each swell down the stone a moment later)
  const kS = swellAt(tt);
  const ring = (a, d = 0) => [E.x + Math.cos(a) * (E.r + d) * SXr, E.y + Math.sin(a) * (E.r + d)];   // the roll's outline (y down: a = PI/2 is its bottom)
  const outl = (a, d = 0) => WD.scrollOutline(E, a - (E.ang || 0), d);   // the same at screen angle a, but on the spiral's real outline (the upstream side is smaller)
  const line = (c, pts) => { c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); };
  const out = [];
  out.push({ z: zb, draw(c, s) {
    if (fast < 0.01) return; c.save(); c.globalAlpha = fast; c.lineCap = 'round'; c.lineJoin = 'round';
    // v5: a small bounded pocket of the pond pressed into the slot behind the plug: a lens of water heaped on the roll's upstream side, its top a
    // rounded swell that rises on each swell of the pond (the push), its ends tucking in at the roll's two shoulders. A dark rim of shadow round
    // it bounds it against the pond band behind (act 2 quiets that band near the gap), so it is the brightest water there, and its edge against
    // the roll (the contact line, next item) is unmistakable.
    const R = E.r, cx = E.x, cy = E.y, sw = 1 + 0.3 * kS + 0.03 * Math.sin(tt * 1.7), H = Math.min((3.8 + 3.4 * pr) * sw * (1 - 0.35 * lifted), 50 / s), ka = pr * (1 - 0.45 * lifted);
    // its outline: a level waterline (bulging a little in the middle on each swell) with rounded shoulders, sides that drop steeply to the roll's
    // flanks, and the roll's own upstream outline as its floor
    const rx = R * SXr * 1.28 + Math.min(1.6, 12 / s), yTop = cy - R - H, cr = Math.min(0.45 * H + 0.2 * R, rx * 0.45), bul = Math.min(0.08 * H, 0.8) * (0.5 + 0.8 * kS), NT = 40;   // (v5.1: a level waterline, barely lifting on a swell)
    const lens = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.5 + 0.5 * i / 8); lens.push([cx - rx + cr + Math.cos(a) * cr, yTop + cr - Math.sin(a) * cr + (1 - Math.sin(a)) * 0]); }   // left shoulder (from its side up to the level)
    lens.reverse(); lens.unshift([cx - rx * 0.99, cy - R * 0.2]);
    for (let i = 1; i < NT; i++) { const f = i / NT, x = lerp(cx - rx + cr, cx + rx - cr, f); lens.push([x, yTop - bul * Math.sin(Math.PI * f) + 0.15 * Math.sin(f * 9 + tt * 1.4) * Math.min(1, 6 / s)]); }
    for (let i = 0; i <= 8; i++) { const a = Math.PI * 0.5 * i / 8; lens.push([cx + rx - cr + Math.sin(a) * cr, yTop + cr - Math.cos(a) * cr]); }   // right shoulder (from the level down its side)
    lens.push([cx + rx * 0.99, cy - R * 0.2]);
    const arc = []; for (let i = 0; i <= 18; i++) arc.push(outl(Math.PI * (1.02 + 0.96 * i / 18), -0.35));
    const body = k => { k.moveTo(lens[0][0], lens[0][1]); for (const q of lens) k.lineTo(q[0], q[1]); k.lineTo(arc[18][0], arc[18][1]); for (let i = 17; i >= 0; i--) k.lineTo(arc[i][0], arc[i][1]); k.closePath(); };
    // the dark rim of shadow round the swell
    c.filter = `blur(${Math.max(0.8, 0.45 * s).toFixed(1)}px)`; c.strokeStyle = rgba([3, 8, 18], 0.8 * ka); c.lineWidth = Math.max(1.2, 7 / s); line(c, lens); c.stroke(); c.filter = 'none';
    // the join: a thin tongue of the same water up through the slot to the pond behind, so the pocket reads as the pond pressing in, not a
    // cushion set in the notch (v5.1)
    { const jw = rx * 0.34, jh = Math.min(R * 1.6 + 3, 40 / s), jg = c.createLinearGradient(0, yTop - jh, 0, yTop + 0.5);
      jg.addColorStop(0, rgba(SEAL_MID, 0)); jg.addColorStop(0.6, rgba(SEAL_MID, 0.45 * ka)); jg.addColorStop(1, rgba([52, 112, 130], 0.7 * ka));
      c.fillStyle = jg; c.beginPath(); c.moveTo(cx - jw * 0.6, yTop - jh); c.quadraticCurveTo(cx - jw * 0.9, yTop - jh * 0.3, cx - jw, yTop + 0.4); c.lineTo(cx + jw, yTop + 0.4); c.quadraticCurveTo(cx + jw * 0.9, yTop - jh * 0.3, cx + jw * 0.6, yTop - jh); c.closePath(); c.fill(); }
    // the water: the pond's own teal at its surface, a little see-through, getting lighter where it is squeezed against the roll (v5.1: less
    // saturated, no longer an opaque pale block)
    const g = c.createLinearGradient(0, yTop, 0, cy);
    g.addColorStop(0, rgba([40, 92, 110], 0.82 * ka)); g.addColorStop(0.4, rgba([32, 82, 102], 0.84 * ka)); g.addColorStop(0.7, rgba([46, 102, 120], 0.86 * ka)); g.addColorStop(1, rgba([78, 134, 150], 0.88 * ka));
    c.filter = `blur(${Math.max(0.4, 0.08 * s).toFixed(1)}px)`; c.fillStyle = g; c.beginPath(); body(c); c.fill(); c.filter = 'none';
    c.save(); c.beginPath(); body(c); c.clip();
    // its two ends sink into the shadow of the slot's rock (the dark notch shows through), so it has no hard edge at either side
    { const eg = c.createLinearGradient(cx - rx, 0, cx + rx, 0); eg.addColorStop(0, rgba([4, 10, 20], 0.7 * ka)); eg.addColorStop(0.22, rgba([4, 10, 20], 0)); eg.addColorStop(0.8, rgba([4, 10, 20], 0)); eg.addColorStop(1, rgba([4, 10, 20], 0.55 * ka));
      c.fillStyle = eg; c.fillRect(cx - rx - 2, yTop - 4, 2 * rx + 4, cy - yTop + 4); }
    // the swell leaning on the roll's upstream shoulder: a lighter lobe that climbs on each swell
    { const bx = cx - R * SXr * 0.35, by = cy - R - 0.35 * H * (1 + kS), br = R * (0.9 + 0.25 * kS), hg = c.createRadialGradient(bx, by, 0, bx, by, br);
      hg.addColorStop(0, rgba([120, 186, 200], (0.18 + 0.22 * kS) * ka)); hg.addColorStop(1, rgba([90, 160, 180], 0));
      c.save(); c.translate(bx, by); c.scale(1.4, 0.55); c.translate(-bx, -by); c.fillStyle = hg; c.fillRect(bx - br, by - br, 2 * br, 2 * br); c.restore(); }
    // a ripple ring on its surface on each swell
    { const rp = ((tt - 0.15) % SWP + SWP) % SWP / 1.6; if (rp < 1) { const rr = 0.2 + 0.8 * rp; c.strokeStyle = rgba([196, 236, 244], 0.4 * ka * (1 - rp) * Math.min(1, rp * 6)); c.lineWidth = Math.max(0.3, 1.2 / s);
      c.beginPath(); c.ellipse(cx - R * SXr * 0.15, yTop + Math.max(1.2, 0.3 * H), rx * 0.6 * rr, Math.max(0.4, 1.6 / s) * rr + 0.1, 0, 0, TAU); c.stroke(); } }
    c.restore();
    // its surface catching the sky: a bright meniscus along the waterline (not down the sides), brightest at a swell's peak
    { const q = lens.slice(6, lens.length - 6).map(p => [p[0], p[1] + Math.max(0.2, 0.6 / s)]);
      c.strokeStyle = rgba([150, 214, 228], 0.45 * ka); c.lineWidth = Math.max(0.6, 4 / s); line(c, q); c.stroke();
      c.strokeStyle = rgba([222, 246, 252], (0.65 + 0.3 * kS) * ka); c.lineWidth = Math.max(0.35, 1.8 / s); line(c, q); c.stroke();
      // two slow glints drifting along the waterline (v5.1)
      c.lineCap = 'round'; for (let j = 0; j < 2; j++) { const ph = ((tt * 0.13 + 0.5 * j + 0.2) % 1 + 1) % 1, i0 = Math.floor(ph * (q.length - 4)), a = Math.sin(Math.PI * ph);
        c.strokeStyle = rgba([250, 254, 255], 0.85 * a * ka); c.lineWidth = Math.max(0.5, 2.6 / s); line(c, q.slice(i0, i0 + 4).map(p => [p[0], p[1] - Math.max(0.15, 0.5 / s)])); c.stroke(); } }
    c.restore(); } });
  // the contact line: where the heaped water meets the roll, a bright wet band lying on the roll's upstream outline (in front of the leaf, so
  // the roll does not cover it). It is part of the water body: thickest on the upstream shoulder where the heap leans hardest, tapering and
  // fading out at both ends (no free end, no bead on a wire). About 3-4 px on screen, a little thicker and brighter on each swell, with the
  // light flickering along it as the pressure moves.
  out.push({ z: (lf.z ?? JAMB.z) - 0.1, draw(c, s) {
    if (fast < 0.01) return; const a0 = Math.PI * 1.04, a1 = Math.PI * 1.86, N = 28, ka = clamp(0.4 + 0.75 * pr) * fast * (1 - 0.55 * lifted);
    const Wd = Math.max((6.5 + 2 * kS) / s, 0.4), prof = a => ss(a0, a0 + 0.42 * Math.PI, a) * (1 - ss(a1 - 0.4 * Math.PI, a1, a));
    const inner = [], outer = []; for (let i = 0; i <= N; i++) { const a = lerp(a0, a1, i / N), w = Wd * prof(a) * (1 + 0.18 * Math.sin(a * 11 - tt * 1.6)); inner.push(outl(a, -0.35 * w)); outer.push(outl(a, 0.65 * w)); }
    const band = () => { line(c, inner); for (let i = N; i >= 0; i--) c.lineTo(outer[i][0], outer[i][1]); c.closePath(); };
    c.save(); c.filter = `blur(${Math.max(0.4, 0.12 * s).toFixed(1)}px)`; c.fillStyle = rgba([150, 214, 230], 0.55 * ka); band(); c.fill(); c.filter = 'none';
    const g = c.createLinearGradient(E.x - E.r, 0, E.x + E.r, 0); g.addColorStop(0, rgba([232, 250, 255], (0.9 + 0.1 * kS) * ka)); g.addColorStop(0.6, rgba([214, 242, 250], (0.75 + 0.2 * kS) * ka)); g.addColorStop(1, rgba([196, 234, 246], 0.45 * ka));
    c.fillStyle = g; band(); c.fill();
    // glints sliding along it (the pressure moving): short, brighter, never a bead at an end
    c.lineCap = 'round'; for (let j = 0; j < 2; j++) { const ph = ((tt * 0.22 + 0.5 * j) % 1 + 1) % 1, am = lerp(a0 + 0.3, a1 - 0.35, ph), q = []; for (let i = 0; i <= 4; i++) q.push(outl(am + 0.16 * (i / 4 - 0.5), 0.15 * Wd));
      c.strokeStyle = rgba([246, 253, 255], 0.75 * ka * prof(am) * Math.sin(Math.PI * ph)); c.lineWidth = Wd * 0.45; line(c, q); c.stroke(); }
    c.restore(); } });
  // the gap under the lifted roll: a dark wedge, the roll's underside its curved top, the slot's rock faces closing in to the seat below
  if (lifted * fast > 0.01) out.push({ z: zg, draw(c, s) {
    const R = E.r, a = lifted * fast, yS = ey + r0 * 0.9, hwS = r0 * SXr * 0.45, lo = []; for (let i = 0; i <= 16; i++) lo.push(ring(Math.PI * (1 - i / 16), -0.4));
    if (yS < E.y + R * 0.6) return;
    const path = k => { k.moveTo(lo[0][0], lo[0][1]); lo.forEach(q => k.lineTo(q[0], q[1])); k.quadraticCurveTo(lo[16][0] + R * 0.1, (lo[16][1] + yS) / 2 + R * 0.3, ex + hwS, yS); k.quadraticCurveTo(ex, yS + 0.6, ex - hwS, yS); k.quadraticCurveTo(lo[0][0] - R * 0.05, (lo[0][1] + yS) / 2 + R * 0.3, lo[0][0], lo[0][1]); k.closePath(); };
    c.save(); const g = c.createLinearGradient(0, E.y + R * 0.5, 0, yS); g.addColorStop(0, rgba([12, 30, 44], 0.95 * a)); g.addColorStop(0.3, rgba([4, 7, 16], 0.96 * a)); g.addColorStop(1, rgba([2, 3, 9], 0.9 * a));
    c.fillStyle = g; c.filter = `blur(${Math.max(0.6, 0.3 * s).toFixed(1)}px)`; c.beginPath(); path(c); c.fill(); c.filter = 'none'; c.restore(); } });
  // the spill: ribbons of water out of the gap under the roll. Its strength at the lip is a pure function of the leaf (flowOf); the water at
  // fraction f of the way down left the lip FALL * sqrt(f) seconds ago, so when a shot passes lf.past (dt -> the leaf dt seconds earlier) the
  // column grows down from the lip when the flow starts and, when it stops, is cut off at the lip and its tail falls to the ground.
  const flowOf = L => { const E2 = WD.leafScrollEnd(L), rs = Math.max(0, ey - E2.y), lf2 = ss(1.2, 6, rs), tu = clamp((1 - (L.curl ?? 1)) / 0.59), op = clamp(0.28 * ss(1, 16, L.tip || 0) + 0.6 * tu + 0.2 * ss(18.5, 21, L.tip || 0));
    return { k: ss(0, 0.35, lf2) * ss(0, 0.05, op) * ss(0.5, 3, L.tip || 0), open: op }; };
  const FALL = 0.2, FS = [0, 0.06, 0.16, 0.3, 0.5, 0.75, 1];
  const hist = FS.map(f => f === 0 || !lf.past ? { k: (free > 0 && lf.past ? 0 : 1) * ss(0, 0.35, lifted) * ss(0, 0.05, open) * tipOn, open } : flowOf(lf.past(FALL * Math.sqrt(f))));   // (once the leaf is free nothing leaves the lip)
  const kMax = Math.max(...hist.map(h => h.k)) * seal;
  if (kMax > 0.01) out.push({ z: JAMB.z - 1.0, draw(c, s) {
    const R = E.r, H = P.hash, bl = Math.max(0.6, 0.28 * s);
    // the stretch of the column that holds water: from the first sample down from the lip that has flow to the last one (feathered ends)
    let iA = FS.findIndex((f, i) => hist[i].k > 0.04); if (iA < 0) return; let iB = iA; while (iB + 1 < FS.length && hist[iB + 1].k > 0.04) iB++;
    const fA = iA === 0 ? 0 : (FS[iA - 1] + FS[iA]) / 2, fB = iB === FS.length - 1 ? 1 : (FS[iB] + FS[iB + 1]) / 2;
    const sp0 = seal * hist.slice(iA, iB + 1).reduce((m, h) => Math.max(m, h.k), 0), sp = Math.min(1, 3 * sp0), spW = 0.35 + 0.65 * ss(0, 0.6, sp0), opn = hist[iA].open;
    // it widens in steps (one more ribbon, and a wider sheet, for each turn Pip winds off) and surges on each heave: the width is the gap's,
    // not the roll's, so it keeps growing as the roll shrinks
    const n = 1 + Math.min(3, Math.floor(0.5 + opn * 3.4)), Wsp = r0 * SXr * (0.7 + 1.6 * opn) * (1 + 0.25 * gush) * spW, xL = E.x - R * SXr * 0.3;
    const under = x => { const d = (x - E.x) / (R * SXr); return Math.abs(d) < 0.98 ? E.y + R * Math.sqrt(1 - d * d) - 0.6 : E.y + R * 0.9 + 0.08 * (x - E.x - R * SXr); };   // the roll's underside, then the blade's lower edge
    const yJ = JAMB.top + 0.5, xJ0 = JAMB.X - JAMB.w * 0.45, xJ1 = JAMB.X + JAMB.w * 0.45;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    // One ragged sheet, never a row of columns: it leaves the roll's underside along a torn, uneven lip (broken foam, not a rounded cap),
    // spreads a little and flings out as it falls, and its lower edge breaks up at uneven heights into drops. Gaps open and close in it
    // between heaves (strands of water left between them) and shut on each heave (gush). It is drawn on its own layer so the gaps are cut
    // out of the water only. It widens in steps with each turn Pip winds off (Wsp, and one more gap for each step).
    const fling = 2.5 + 9 * opn + 4 * gush, xa = xL, yLip = x => lerp(under(x), -1, drop);
    const X = (q, f) => xa + Wsp * q * (1 + 0.22 * f) + fling * (0.45 + 0.5 * q) * Math.pow(f, 0.55) + 0.5 * Math.sin(f * 7 + tt * 6 + q * 5) * f;
    const Y = (q, f) => lerp(yLip(xa + Wsp * q), 0, f);
    const brkAt = q => clamp(0.6 + 0.07 * opn + 0.13 * H(Math.floor(q * 9 + 0.5), 1260) + 0.07 * Math.sin(q * 11 + tt * 2.3) + 0.05 * Math.sin(q * 29 - tt * 3.1), 0.45, 0.94);
    const tear = q => 0.012 + 0.05 * Math.pow(0.5 + 0.5 * Math.sin(q * 31 + tt * 3.3 + 1.7 * H(Math.floor(q * 13), 1261)), 2) + 0.03 * H(Math.floor(q * 13), 1262);
    const qL = f => -0.03 + 0.04 * Math.sin(f * 11 + tt * 5), qR = f => 1 + 0.05 * Math.sin(f * 13 - tt * 6 + 1);
    const yTop = fA > 0 ? Y(0.5, fA) : -1e3, yBot = fB >= 1 ? 2 : Y(0.5, fB);
    if (yBot > yTop + 0.3) {
      const OC = SPILL_LAYER || (SPILL_LAYER = P.off()), o = OC.getContext('2d');
      o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1; o.filter = 'none'; o.clearRect(0, 0, OC.width, OC.height);
      o.save(); o.setTransform(c.getTransform()); o.lineCap = 'round'; o.lineJoin = 'round';
      // (polish: once the flow is cut off at the lip, the falling tail's top is a torn, feathered edge, the lip's own tear profile scaled up,
      // never a ruler-straight cut: the clip opens above it and a soft erase follows the ragged line)
      const tornTop = fA > 0, QT = tornTop ? Array.from({ length: 41 }, (_, i) => lerp(-0.6, 1.6, i / 40)) : [], fTop = q => Math.max(0, fA - 0.05 + 2.4 * tear(q));
      const xR = xa + Wsp * 1.4 + fling + 40, yClip = tornTop ? Math.min(yTop, ...QT.map(q => Y(q, fTop(q)))) - 2 : yTop;
      o.beginPath(); o.rect(xa - 40, yClip, xR - (xa - 40), yBot - yClip + 3); o.clip();   // only the stretch of the fall that holds water
      const NQ = 26, NF = 14, sheet = k => { k.beginPath();
        for (let i = 0; i <= NQ; i++) { const q = i / NQ, f = tear(q); i ? k.lineTo(X(q, f), Y(q, f)) : k.moveTo(X(q, f), Y(q, f)); }
        for (let i = 0; i <= NF; i++) { const f = lerp(tear(1), brkAt(1), i / NF); k.lineTo(X(qR(f), f), Y(qR(f), f)); }
        for (let i = NQ; i >= 0; i--) { const q = i / NQ, f = brkAt(q) + (i % 2 ? 0.035 : -0.02) * (0.5 + H(i, 1263)); k.lineTo(X(q, f), Y(q, f)); }
        for (let i = NF; i >= 0; i--) { const f = lerp(tear(0), brkAt(0), i / NF); k.lineTo(X(qL(f), f), Y(qL(f), f)); }
        k.closePath(); };
      // a soft veil, then the body: see-through blue-green, lighter near the lip
      o.filter = `blur(${(bl * 1.4).toFixed(1)}px)`; o.fillStyle = rgba([120, 186, 206], 0.22 * sp); sheet(o); o.fill();
      o.filter = `blur(${(bl * 0.6).toFixed(1)}px)`;
      { const y0 = Y(0.5, 0), y1 = Y(0.5, 0.85), g = o.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, rgba([196, 232, 244], 0.72 * sp)); g.addColorStop(0.18, rgba([138, 200, 218], 0.6 * sp)); g.addColorStop(0.5, rgba([80, 150, 174], 0.5 * sp)); g.addColorStop(1, rgba([58, 124, 150], 0.42 * sp));
        o.fillStyle = g; sheet(o); o.fill(); }
      o.filter = 'none';
      // light running down it: thin broken bright threads along the flow, at uneven spacing
      o.save(); sheet(o); o.clip(); o.lineWidth = Math.max(0.3, 0.25 + 0.3 / s);
      for (let q2 = 0; q2 < 5 + 2 * n; q2++) { const qq = H(q2, 1240), f0 = ((tt * (1.1 + 0.6 * H(q2, 1241)) + H(q2, 1242)) % 1) * 0.55, len = 0.18 + 0.22 * H(q2, 1243), pts = [];
        for (let i = 0; i <= 6; i++) { const f = Math.min(brkAt(qq), f0 + len * i / 6); pts.push([X(qq, f), Y(qq, f)]); }
        o.strokeStyle = rgba([236, 250, 255], 0.5 * sp * (1 - f0 / 0.7)); line(o, pts); o.stroke(); }
      // aeration: white flecks, thick near the lip, thinning down the fall
      for (let q2 = 0; q2 < 16 + 8 * n; q2++) { const ph = (tt * (1.6 + 0.8 * H(q2, 1203)) + H(q2, 1204)) % 1, qq = H(q2, 1205), f = brkAt(qq) * ph * ph * ph, l = 0.5 + 1.6 * ph, wd = 0.12 + 0.1 * H(q2, 1206);
        o.fillStyle = rgba([246, 252, 255], (0.75 - 0.7 * ph) * sp); o.beginPath(); o.ellipse(X(qq, f), Y(qq, f), wd, l, 0, 0, TAU); o.fill(); }
      o.restore();
      // the gaps: dark slits that open between heaves and close on each heave, at uneven places, each tapering shut toward the lip so the
      // sheet stays one piece where it leaves the roll; strands of water are left between them
      { const K = Math.min(4, Math.max(1, n - 1 + (opn > 0.15 ? 1 : 0))); o.globalCompositeOperation = 'destination-out';
        for (let j = 0; j < K; j++) { const qc = (j + 0.5 + 0.55 * (H(j, 1270) - 0.5)) / K, op2 = Math.pow(Math.max(0, Math.sin(tt * (1.7 + 0.9 * H(j, 1271)) + TAU * H(j, 1272))), 1.5) * (1 - 0.85 * gush);
          if (op2 < 0.03) continue; const gw = Wsp * (0.03 + 0.04 * H(j, 1273)) * op2, f0 = 0.1 + 0.25 * H(j, 1274), f1 = brkAt(qc) + 0.05, M2 = 10, Lp = [], Rp = [];
          for (let i = 0; i <= M2; i++) { const f = lerp(f0, f1, i / M2), w = gw * ss(f0, f0 + 0.25, f) * (0.7 + 0.3 * Math.sin(f * 17 + tt * 4 + j)), xq = X(qc, f) + 0.4 * Math.sin(f * 9 + j * 2 + tt * 2.5); Lp.push([xq - w, Y(qc, f)]); Rp.push([xq + w, Y(qc, f)]); }
          o.fillStyle = 'rgba(0,0,0,0.85)'; o.beginPath(); Lp.forEach((p2, i) => i ? o.lineTo(p2[0], p2[1]) : o.moveTo(p2[0], p2[1])); for (let i = M2; i >= 0; i--) o.lineTo(Rp[i][0], Rp[i][1]); o.closePath(); o.fill(); }
        o.globalCompositeOperation = 'source-over'; }
      // the lip: broken foam along where it tears off the roll (clumps of different sizes with gaps between, flickering), never a smooth cap
      if (fA === 0) { const Mf = 14 + 6 * n;
        for (let i = 0; i < Mf; i++) { if (H(i, 1281) < 0.2) continue; const q = (i + 0.8 * H(i, 1280)) / Mf, f = tear(q) + 0.02 * H(i, 1284), r = Math.min(1.4, 0.3 + Wsp * 0.03) * (0.35 + 0.75 * H(i, 1282)) * (0.75 + 0.25 * Math.sin(tt * 7 + i * 1.9));
          o.fillStyle = rgba([244, 252, 255], (0.55 + 0.35 * H(i, 1283)) * sp); o.beginPath(); o.ellipse(X(q, f), Y(q, f) + 0.1, r, r * 0.7, 0, 0, TAU); o.fill(); }
        // a few foam strings trailing a short way down from the lip
        o.lineWidth = Math.max(0.25, 0.2 + 0.35 / s); for (let i = 0; i < 3 + n; i++) { const q = H(i, 1290), f1 = 0.1 + 0.18 * H(i, 1291) * (0.6 + 0.4 * Math.sin(tt * 3 + i)), pts = []; for (let k = 0; k <= 4; k++) { const f = lerp(tear(q), f1, k / 4); pts.push([X(q, f), Y(q, f)]); }
          o.strokeStyle = rgba([240, 250, 255], 0.55 * sp); line(o, pts); o.stroke(); } }
      // the drops it breaks into below its ragged lower edge, falling to the ground
      for (let q2 = 0; q2 < 8 + 3 * n; q2++) { const qq = H(q2, 1207) * 1.05 - 0.02, b0 = brkAt(qq), ph = (tt * (2.2 + H(q2, 1208)) + H(q2, 1209)) % 1, f = lerp(b0, 1, ph), r = (0.28 + 0.3 * H(q2, 1210)) * Math.min(1.3, 0.5 + Wsp * 0.05);
        o.fillStyle = rgba([200, 232, 244], 0.7 * sp); o.beginPath(); o.ellipse(X(qq, f), Y(qq, f), r, r * 1.35, 0, 0, TAU); o.fill(); }
      if (tornTop) { o.save(); o.globalCompositeOperation = 'destination-out'; o.filter = `blur(${(bl * 1.2).toFixed(1)}px)`; o.fillStyle = 'rgba(0,0,0,1)'; o.beginPath();
        const tp = QT.map(q => { const f = fTop(q); return [X(q, f), Y(q, f)]; }), yHi = yClip - 20;
        o.moveTo(xa - 60, tp[0][1]); tp.forEach(q => o.lineTo(q[0], q[1])); o.lineTo(xR + 20, tp[tp.length - 1][1]); o.lineTo(xR + 20, yHi); o.lineTo(xa - 60, yHi); o.closePath(); o.fill(); o.restore(); }
      o.restore(); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.filter = 'none'; c.drawImage(OC, 0, 0); c.restore();
      // where it lands: a soft churn of white (on the jamb stone's top where it falls over it, and on the ground), droplets on arcs
      for (const [qh, k] of [[0.3, 0.8], [0.75, 0.7]]) { const xG = X(qh, 1), xH = X(qh, clamp((yJ - Y(qh, 0)) / Math.max(-Y(qh, 0), 0.1))), hitJ = xH > xJ0 && xH < xJ1 && yJ > Y(qh, 0) + 1;
        for (const [hx, hy, kk] of [[hitJ ? xH : null, yJ, 0.35 * k], [xG, -0.2, k]]) { if (hx === null || (hy === yJ ? fB < 0.5 : fB < 0.99)) continue; const ww = Wsp * 0.22;
          c.filter = `blur(${(bl * 0.9).toFixed(1)}px)`; c.fillStyle = rgba([232, 246, 252], 0.5 * kk * sp); c.beginPath(); c.ellipse(hx, hy - 0.4, ww + 0.4, Math.min(1.3, 0.45 + ww * 0.25), 0, 0, TAU); c.fill(); c.filter = 'none';
          for (let q = 0; q < 5; q++) { const j2 = Math.round(qh * 10), ph = (tt * (1.8 + H(q + 5 * j2, 1214)) + H(q + 5 * j2, 1215)) % 1, dx = (H(q + 5 * j2, 1216) - 0.35) * (3 + 3 * opn), x = hx + dx * ph, y = hy - (1.5 + 2.5 * opn) * Math.sin(Math.PI * ph) * (0.5 + H(q + 5 * j2, 1217));
            c.fillStyle = rgba([220, 240, 250], 0.75 * kk * sp * (1 - ph)); c.beginPath(); c.arc(x, y, 0.28 + 0.2 * H(q, 1218), 0, TAU); c.fill(); } } }
    }
    // the wet sheen spreading from the foot toward the channel
    { const fx0 = E.x - R * 0.2, fx1 = E.x + R * SXr * (1.2 + 1.6 * open) + 6 + 8 * open, fgr = c.createLinearGradient(fx0, 0, fx1, 0); fgr.addColorStop(0, rgba([190, 226, 238], 0.5 * sp * ss(0.75, 1, fB))); fgr.addColorStop(0.6, rgba([110, 176, 198], 0.3 * sp * ss(0.75, 1, fB))); fgr.addColorStop(1, rgba([110, 176, 198], 0));
      c.fillStyle = fgr; c.beginPath(); c.ellipse((fx0 + fx1) / 2, -0.3, (fx1 - fx0) / 2 + 2, 0.9 + 0.6 * open, 0, 0, TAU); c.fill(); }
    c.restore(); } });
  // the trickle while sealed: on each swell water squeezes out from under the roll where it sits on the jamb stone and runs down the stone's
  // front as a small bright trickle (cyan-white, uneven in width, broken highlights and beads riding down it), the swell travelling down it a
  // moment later. It ends in a small glistening puddle on the floor of the dry channel mouth at the stone's foot, which takes a ripple as each
  // swell arrives. Between swells it thins to a wet film. Darker than the faces, nothing like the burst. It goes as soon as Luma has the tip
  // up (the spill takes over).
  const seep = pr * (1 - ss(0.02, 0.18, (open + 0.5 * lifted) * tipOn)) * (1 - ss(0.5, 3, lf.tip || 0));
  if (seep > 0.02) { const xs = JAMB.X - JAMB.w * 0.36, ys = JAMB.top + 0.9, xa = xs + 1.3, ya = ys + 2.2, yb = 0.9, xb = xa + 1.4;   // (xs, ys: the stone's top left corner, where the roll sits on it)
    // the path: f 0..0.1 over the stone's top edge, then down its face to the floor
    const FT = 0.1, pathAt = f => f < FT ? [lerp(xs, xa, Math.sqrt(f / FT)), lerp(ys, ya, f / FT)] : (k => [lerp(xa, xb, Math.pow(k, 0.9)) + 0.5 * Math.sin(k * 5.5 + 0.8) * k - 0.9 * ss(0.85, 1, k), lerp(ya, yb + 1.3, k)])((f - FT) / (1 - FT));
    const lag = f => 0.55 * f, kAt = f => swellAt(tt - lag(f));   // the swell reaches f a moment after it squeezes out
    const xP = xb - 0.2, yP = yb + 1.7;   // the puddle on the floor of the mouth just in front of the stone's foot, where the trickle lands
    out.push({ z: zf, draw(c, s) {
      if (ya > yb - 1.5) return;
      const H = P.hash, Wt = Math.max((16 + 3 * kS) / s, 1.6 + 0.4 * kS) * 0.5;   // half width: about 8 px on screen in the wide (polish: never thinner than about 8 px across between swells); in a close-up its true size (1.6-2 units)
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      const NB = 30, hwAt = f => { const k = kAt(f); return Wt * (0.82 + 0.35 * k) * (0.86 + 0.1 * Math.sin(f * 19 - tt * 4.2) + 0.07 * Math.sin(f * 43 - tt * 7.3 + 1.1) + 0.05 * Math.sin(f * 71 + 2)) * (0.72 + 0.28 * ss(0, 0.1, f)) * (1 + 1.5 * ss(0.86, 1, f)); };   // (its foot spreads out into the puddle)
      const band = (kw, sk = 0) => { const Lp = [], Rp = []; for (let i = 0; i <= NB; i++) { const f = i / NB, q = pathAt(f), w = hwAt(f) * kw; Lp.push([q[0] - w * (1 + 0.16 * Math.sin(f * 37 - tt * 5.1 + 0.4)) + sk, q[1]]); Rp.push([q[0] + w * 0.92 * (1 + 0.16 * Math.sin(f * 31 + tt * 4.3 + 2.2)) + sk, q[1]]); }   // (each edge wavers on its own: an uneven film, not a wire)
        c.beginPath(); Lp.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); for (let i = NB; i >= 0; i--) c.lineTo(Rp[i][0], Rp[i][1]); c.closePath(); };
      // the wet stone round it: darker, soft-edged, a little wider than the water
      c.filter = `blur(${Math.max(0.6, 0.35 * s).toFixed(1)}px)`; c.fillStyle = rgba([4, 10, 18], 0.55 * seep); band(1.9); c.fill();
      // the damp floor round the puddle
      { const sg = c.createRadialGradient(xP, yP, 0, xP, yP, 5.5); sg.addColorStop(0, rgba([3, 8, 16], 0.6 * seep)); sg.addColorStop(1, rgba([3, 8, 16], 0));
        c.fillStyle = sg; c.save(); c.translate(xP, yP); c.scale(1.6, 0.4); c.translate(-xP, -yP); c.fillRect(xP - 6, yP - 6, 12, 12); c.restore(); }
      c.filter = 'none';
      // the puddle: a small flat pool on the floor, dark water with a broken bright rim on its far edge and a glint; it grows a hair and
      // takes a ripple ring each time a swell runs down into it
      { const kp = swellAt(tt - lag(1) - 0.1), rx = Math.max(4.2 + 0.7 * kp, 17 / s), ry = Math.max(1.05, 4.6 / s) * (1 + 0.15 * kp);
        const lobes = [[-0.2, -0.25, 0.75, 0.8], [0.25, 0.1, 0.8, 0.9], [-0.55, 0.25, 0.45, 0.6], [0.75, 0.3, 0.35, 0.55]], pool = (k2, dy = 0) => { c.beginPath(); for (const [dx, dy2, sx, sy] of lobes) { c.moveTo(xP + dx * rx + sx * rx * k2, yP + dy2 * ry + dy); c.ellipse(xP + dx * rx, yP + dy2 * ry + dy, sx * rx * k2, sy * ry * k2, 0, 0, TAU); } };
        c.fillStyle = rgba([22, 58, 76], 0.92 * seep); pool(1); c.fill();
        const pg = c.createLinearGradient(0, yP - ry, 0, yP + ry); pg.addColorStop(0, rgba([120, 190, 210], 0.7 * seep)); pg.addColorStop(0.5, rgba([60, 130, 156], 0.28 * seep)); pg.addColorStop(1, rgba([30, 80, 100], 0));
        c.fillStyle = pg; pool(0.88, -0.05 * ry); c.fill();
        c.strokeStyle = rgba(SEEP_HI, 0.8 * seep); c.lineWidth = Math.max(0.25, 1.6 / s);
        for (const [b0, b1] of [[3.35, 3.9], [4.1, 4.75], [5.0, 5.7], [5.85, 6.1]]) { c.beginPath(); c.ellipse(xP, yP, rx * 0.97, ry * 0.95, 0, b0, b1); c.stroke(); }   // the far rim catches the sky in pieces
        const rp = ((tt - lag(1) - 0.1) % SWP + SWP) % SWP / 1.2; if (rp < 1) { c.strokeStyle = rgba(SEEP_HI, 0.5 * seep * (1 - rp)); c.lineWidth = Math.max(0.2, 1.2 / s); c.beginPath(); c.ellipse(xP - 0.9, yP, 0.4 + rx * 0.8 * rp, 0.15 + ry * 0.75 * rp, 0, 0, TAU); c.stroke(); }
        c.fillStyle = rgba(SEEP_HI, 0.85 * seep); c.beginPath(); c.ellipse(xP + rx * 0.35, yP - ry * 0.35, Math.max(0.3, 2.2 / s), Math.max(0.14, 1.1 / s), 0, 0, TAU); c.fill(); }
      c.filter = `blur(${Math.max(0.3, 0.1 * s).toFixed(1)}px)`;
      // the water: a translucent blue-green film on the stone, lit cyan-white where the swell is passing down it (so the pulse visibly runs
      // down), then a lighter sheet on its lit left half, never a shaded tube
      { const g = c.createLinearGradient(0, ys, 0, yb + 1.3); for (let i = 0; i <= 8; i++) { const f = i / 8, k = kAt(f); g.addColorStop(f, rgba(mixc([52, 118, 142], [100, 170, 190], 0.15 + 0.7 * k), (0.74 + 0.18 * k) * seep)); }
        c.fillStyle = g; band(1); c.fill();
        const g2 = c.createLinearGradient(0, ys, 0, yb + 1.3); for (let i = 0; i <= 8; i++) { const f = i / 8, k = kAt(f); g2.addColorStop(f, rgba(SEEP_HI, (0.1 + 0.4 * k) * seep)); }
        c.fillStyle = g2; band(0.55, -0.4 * Wt); c.fill(); }
      c.filter = 'none';
      // broken highlights riding down it (short bright dashes on its lit left side, sliding with the flow)
      c.lineWidth = Math.max(0.18, 0.3 * Wt);
      for (let j = 0; j < 6; j++) { const sp = 0.55 + 0.25 * H(j, 1301), f0 = ((tt * sp + H(j, 1302)) % 1), len = 0.05 + 0.07 * H(j, 1303), q = []; for (let i = 0; i <= 4; i++) { const f = Math.min(1, f0 + len * i / 4), p = pathAt(f); q.push([p[0] - 0.42 * hwAt(f), p[1]]); }
        c.strokeStyle = rgba(SEEP_HI, 0.85 * seep * (0.45 + 0.55 * kAt(f0)) * Math.sin(Math.PI * f0)); line(c, q); c.stroke(); }
      // beads: drops squeezing out at the seal's foot on each swell, then riding down the trickle into the puddle
      for (let i = 0; i < 4; i++) { const per = 0.9 + 0.35 * i, ph = ((tt + H(i, 1132) * per) / per) % 1, f = Math.pow(ph, 1.4), p = pathAt(f), rb = Wt * (0.72 + 0.25 * H(i, 1133)) * (0.85 + 0.35 * kAt(f)), a = seep * Math.sin(Math.PI * Math.min(1, ph * 1.15));   // (polish: full-size beads between swells too)
        c.fillStyle = rgba([48, 112, 136], 0.92 * a); c.beginPath(); c.ellipse(p[0] + 0.15 * Wt, p[1], rb, rb * 1.2, 0, 0, TAU); c.fill();
        c.fillStyle = rgba(SEEP_HI, 0.9 * a); c.beginPath(); c.arc(p[0] - rb * 0.25, p[1] - rb * 0.4, rb * 0.38, 0, TAU); c.fill(); }
      // the squeeze: at the seal's foot a little bulge of water swells out from under the roll on each swell
      // (water pressed out along the stone's top edge under the roll: a soft wet tongue that spreads a little on each swell and runs into the trickle)
      { const q = pathAt(0), bw = Wt * (1.0 + 0.9 * kS), bh = Wt * (0.5 + 0.2 * kS); c.filter = `blur(${Math.max(0.3, 0.12 * s).toFixed(1)}px)`; c.fillStyle = rgba([66, 140, 164], (0.6 + 0.25 * kS) * seep); c.beginPath(); c.ellipse(q[0] + 0.3 * bw, q[1] + 0.35 * bh, bw, bh, 0.35, 0, TAU); c.fill(); c.filter = 'none';
        c.fillStyle = rgba(SEEP_HI, (0.3 + 0.45 * kS) * seep); c.beginPath(); c.ellipse(q[0] + 0.1 * bw, q[1] + 0.1 * bh, bw * 0.35, bh * 0.3, 0.35, 0, TAU); c.fill(); }
      c.restore(); } }); }
  return out;
}
WD.spout = st => { CUR.spout = st;
  if (!WD._spCore) {
    const cx = SP.cx, items = [], top = SP.top, ZP = 2840;
    // the pond: a raised, mossy plateau holding a small round pool; the surface bulges only against the dam
    items.push({ z: ZP, draw(c, s, t) {
      const sp = CUR.spout, pond = clamp(sp.pond ?? 0, 0, 1.3), wg = clamp(sp.waterGlow ?? 0, 0, 1.2), rise = 3 + 8 * pond, rx = 330, rz = 150, zc = 2850, yS = top - 2;
      const bulge = (x, zz) => rise * Math.exp(-(((zz - 2702) / 46) ** 2)) * Math.exp(-(((x - cx) / 70) ** 2));
      const probe = pondSurface(c, ZP, cx, yS, zc, rx * 1.14, rz * 1.14, bulge); const xs = probe.map(p => p[0]), ys = probe.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); if (!vis(c, s, x0 - 10, x1 + 10, y0 - 30, y1 + 30, 40)) return;
      // bank: dark soil and moss rim around the pool, standing a little above the plateau
      const bank = pondSurface(c, ZP, cx, yS + 3, zc, rx, rz, () => 0, 1.14);
      const bg = c.createLinearGradient(0, y0, 0, y1); bg.addColorStop(0, D([30, 52, 60], cx, -40, ZP, 0.5, 0.03)); bg.addColorStop(1, D([20, 30, 40], cx, -40, ZP, 0.5, 0.02));
      c.fillStyle = bg; c.beginPath(); smoothPoly(c, bank); c.fill();
      // the water
      const surf = pondSurface(c, ZP, cx, yS, zc, rx, rz, bulge), sy0 = Math.min(...surf.map(p => p[1])), sy1 = Math.max(...surf.map(p => p[1]));
      // luminous when the pond is full of trapped light: the water near the dam turns amber-teal while the far side stays moon blue
      const pk = Math.min(pond, 1) * Math.min(wg, 1), warm = (col, a) => rg(mixc(col, [236, 150, 64], a * pk));
      const wgd = c.createLinearGradient(0, sy0, 0, sy1); wgd.addColorStop(0, warm(Da([60, 82, 150], cx, -40, ZP, 0.5, 0.05), 0.0)); wgd.addColorStop(0.5, warm(Da([26, 44, 104], cx, -40, ZP, 0.5, 0.03), 0.1)); wgd.addColorStop(1, warm(Da([12, 22, 66], cx, -40, ZP, 0.5, 0.02), 0.28));
      c.fillStyle = wgd; c.beginPath(); smoothPoly(c, surf); c.fill();
      c.save(); c.beginPath(); smoothPoly(c, surf); c.clip();
      // trapped warm glow, concentrated at the dam and the cleft
      if (wg > 0.02) { const gq = gp(ZP, cx, yS - 6, 2706), kf = (ZP - GC.z) / (2706 - GC.z), gr = c.createRadialGradient(gq[0], gq[1], 0, gq[0], gq[1], 85 * kf);
        gr.addColorStop(0, `rgba(255,214,120,${0.5 * Math.min(wg, 1)})`); gr.addColorStop(0.3, `rgba(244,160,64,${0.28 * Math.min(wg, 1)})`); gr.addColorStop(1, 'rgba(220,110,40,0)');
        c.save(); c.translate(gq[0], gq[1]); c.scale(1, 0.42); c.translate(-gq[0], -gq[1]); c.fillStyle = gr; c.beginPath(); c.arc(gq[0], gq[1], 85 * kf, 0, TAU); c.fill(); c.restore(); }
      // moon-reflection streak: broken dashes along the line toward the moon
      const mxs = P.project(GC, XREF + 0.14 * (40000 - ZREF), 0, 40000)[0];
      for (let i = 0; i < 16; i++) { const zz = 2722 + i * 16 + (R(i, 710) - 0.5) * 8, wd = (14 + i * 2.2) * (0.5 + R(i, 711)), xx = GC.x + (mxs - W / 2) * (zz - GC.z) / GC.f + (R(i, 712) - 0.5) * 14;
        const a = gp(ZP, xx - wd / 2, yS, zz), b2 = gp(ZP, xx + wd / 2, yS, zz); if (R(i, 713) < 0.25) continue;
        c.strokeStyle = css([218, 228, 255], 0.16 + 0.2 * (1 - i / 16)); c.lineWidth = Math.max(0.5, 1.3 / s); c.lineCap = 'round'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke(); }
      // broken concentric ripples
      const tm = (t || 0);
      for (const [rcx, rcz, ph] of [[cx + 110, 2880, 0], [cx - 120, 2790, 0.5]]) for (let i = 0; i < 4; i++) { const rr = ((tm * 5 + i * 34 + ph * 60) % 136) + 14, al = 0.28 * (1 - rr / 150);
        for (let j = 0; j < 3; j++) { const a0 = R(i * 7 + j, 720 + (rcx | 0)) * TAU, len = 0.7 + 0.9 * R(i * 7 + j, 721), q = []; for (let m2 = 0; m2 <= 8; m2++) { const th = a0 + len * m2 / 8; q.push(gp(ZP, rcx + Math.cos(th) * rr * 1.7, yS, rcz + Math.sin(th) * rr * 0.62)); }
          c.strokeStyle = css([214, 226, 255], Math.max(al, 0)); c.lineWidth = Math.max(0.4, 1 / s); c.beginPath(); q.forEach((p, m2) => m2 ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); } }
      c.restore();
      // bright meniscus line where the water meets the bank
      c.strokeStyle = css([210, 225, 255], 0.35); c.lineWidth = Math.max(0.5, 1.2 / s); c.beginPath(); smoothPoly(c, surf); c.stroke();
    } });
    // the pond standing above the crest: the water behind the dam is held higher than the wall, so a low camera sees a dark, glowing swell
    // over the stones (blue-black water, amber where the trapped light is strongest, a moon glint and a bright meniscus). It swells as the pond fills.
    items.push({ z: 2775, draw(c, s, t) {
      const sp = CUR.spout, pond = clamp(sp.pond ?? 0, 0, 1.3), wg = clamp(sp.waterGlow ?? 0, 0, 1.2), pk = Math.min(pond, 1) * Math.min(wg, 1), rise = 7 + 19 * Math.min(pond, 1.1), x0 = cx - 340, x1 = cx + 340;
      if (!vis(c, s, x0, x1, top - rise - 14, top + 6, 40)) return;
      const edge = x => { const q = (x - cx) / 150; return top + 1 - rise * (Math.exp(-q * q) * 0.8 + 0.2 * Math.exp(-(((x - cx) / 330) ** 2))) + 0.5 * noise(x * 0.07, 771) * Math.min(1, rise / 10); }, N = 60;
      const body = k => { k.moveTo(x0, top + 6); for (let i = 0; i <= N; i++) { const x = lerp(x0, x1, i / N); k.lineTo(x, edge(x)); } k.lineTo(x1, top + 6); k.closePath(); };
      const g = c.createLinearGradient(0, top - rise, 0, top + 4), wc = (col, yy, a) => rg(mixc(shD(col, cx, yy, 2775, 0.03, 0.04), [200, 110, 50], a * pk));
      g.addColorStop(0, wc([34, 50, 104], top - rise, 0.0)); g.addColorStop(0.5, wc([16, 28, 72], top - rise * 0.5, 0.06)); g.addColorStop(1, wc([8, 12, 38], top, 0.16));
      c.fillStyle = g; c.beginPath(); body(c); c.fill();
      c.save(); c.beginPath(); body(c); c.clip();
      if (pk > 0.02) { const gr = c.createRadialGradient(cx, top - 2, 0, cx, top - 2, 150); gr.addColorStop(0, `rgba(255,190,100,${0.62 * pk})`); gr.addColorStop(0.3, `rgba(238,138,54,${0.26 * pk})`); gr.addColorStop(1, 'rgba(200,90,40,0)');   // trapped light, strongest at the cleft
        c.save(); c.translate(cx, top - 2); c.scale(1, rise / 60); c.translate(-cx, -(top - 2)); c.fillStyle = gr; c.beginPath(); c.arc(cx, top - 2, 150, 0, TAU); c.fill(); c.restore(); }
      for (let i = 0; i < 14; i++) { const x = cx + 30 + (R(i, 772) - 0.3) * 330, y = top - rise * (0.25 + 0.5 * R(i, 773)) * Math.exp(-(((x - cx) / 260) ** 2)), l = 8 + 22 * R(i, 774);   // moon glints and slow ripples
        c.strokeStyle = css([214, 228, 255], 0.1 + 0.2 * R(i, 775) * (1 - Math.abs(x - cx) / 400)); c.lineWidth = Math.max(0.4, 1.1 / s); c.lineCap = 'round'; c.beginPath(); c.moveTo(x - l / 2, y + 0.4 * Math.sin((t || 0) * 1.1 + i)); c.lineTo(x + l / 2, y + 0.4 * Math.sin((t || 0) * 1.1 + i + 1)); c.stroke(); }
      // the surface seen at a grazing angle: many short ripple glints, packed tighter and shorter toward the far (upper) edge, drifting
      // slowly, and the moon's glitter path as a column of bright broken dashes, so the swell reads as open water, not a painted band
      const tt = t || 0, sky = mixc([150, 176, 236], [255, 196, 120], 0.2 * pk);
      c.lineCap = 'round';
      for (let i = 0; i < 46; i++) { const f = Math.pow(R(i, 780), 1.7), xr = x0 + (x1 - x0) * ((R(i, 781) + tt * 0.004 * (1 + R(i, 782))) % 1), yb = edge(xr), y = lerp(yb + 1.4, top + 0.5, f);
        if (y < yb + 0.8) continue; const l = (3 + 14 * f) * (0.5 + R(i, 783)), tw = 0.55 + 0.45 * Math.sin(tt * (0.8 + R(i, 784)) + i * 2.1);
        c.strokeStyle = css(sky, (0.08 + 0.16 * (1 - f)) * tw); c.lineWidth = Math.max(0.35, (0.5 + 0.7 * f) / s); c.beginPath(); c.moveTo(xr - l / 2, y); c.quadraticCurveTo(xr, y - 0.3, xr + l / 2, y); c.stroke(); }
      c.setLineDash([]);
      { const mxs = P.project(GC, XREF + 0.14 * (40000 - ZREF), 0, 40000)[0], mx = GC.x + (mxs - W / 2) * (2775 - GC.z) / GC.f;
        if (mx > x0 && mx < x1) for (let j = 0; j < 12; j++) { const f = (j + 0.5) / 12, y = lerp(edge(mx) + 1.2, top + 1, Math.pow(f, 0.8)), w2 = (3 + 12 * f) * (0.6 + 0.6 * R(j, 778)), xo = mx + (R(j, 779) - 0.5) * 6 + 1.6 * Math.sin(tt * 1.4 + j * 1.7);
          c.strokeStyle = css([230, 240, 255], (0.62 - 0.32 * f) * (0.6 + 0.4 * Math.sin(tt * 2.1 + j * 2.3))); c.lineWidth = Math.max(0.6, (1.0 + 0.8 * f) / s); c.lineCap = 'round'; c.beginPath(); c.moveTo(xo - w2 / 2, y); c.lineTo(xo + w2 / 2, y); c.stroke(); } }
      c.restore();
      c.strokeStyle = css([226, 236, 255], 0.4); c.lineWidth = Math.max(0.5, 1.3 / s); c.beginPath(); for (let i = 0; i <= N; i++) { const x = lerp(x0, x1, i / N); i ? c.lineTo(x, edge(x)) : c.moveTo(x, edge(x)); } c.stroke();   // meniscus
    } });
    // the cleft: a V-notch between the two flank rocks, dark inside with a depth gradient, the pond seen through its top. While the leaf
    // seals it, the dry blade near the tip is crumpled into it (PLUG), the two jamb stones pinch it, and the rolled tip's scroll end sits
    // wedged at the narrowest point (drawn by the tongue, WD.spout); the pond presses over the plug's top edge as soft glossy water.
    items.push({ z: 2692, draw(c, s, t) { if (!vis(c, s, cx - 40, cx + 40, top - 20, 6, 30)) return;
      const wg = clamp(CUR.spout.waterGlow ?? 0, 0, 1.2), pond = clamp(CUR.spout.pond ?? 0, 0, 1.3), hw = SP.mw + 3, topY = top - 3 - 5 * pond;
      const jl = i => (R(i, 735) - 0.5) * 6, notch = k => { k.moveTo(cx - hw, topY); for (let i = 1; i <= 5; i++) { const f = i / 5; k.lineTo(cx - hw + (hw - 5) * Math.pow(f, 1.6) + jl(i), topY * (1 - f) + 3 * f); }
        for (let i = 5; i >= 0; i--) { const f = i / 5; k.lineTo(cx + hw - (hw - 6) * Math.pow(f, 1.6) + jl(i + 9), topY * (1 - f) + 3 * f); } k.closePath(); };
      const gk = Math.min(wg, 1) * Math.min(pond, 1), tt = t || 0;
      // the gap: dark inside, open at the top, where the pond standing behind the crest shows through
      const g = c.createLinearGradient(0, topY, 0, 3); g.addColorStop(0, rg(Da([10, 22, 46], cx, topY, 2692, 0, 0.02), 0)); g.addColorStop(Math.min(0.4, (top + 4 - topY) / (3 - topY)), rg(Da([10, 22, 46], cx, top, 2692, 0, 0.02), 0));
      g.addColorStop(0.55, rg(Da([10, 18, 40], cx, -16, 2692, 0, 0.02))); g.addColorStop(1, rg(sh([4, 6, 18], cx, 0, 2692, 0)));
      c.fillStyle = g; c.beginPath(); notch(c); c.fill();
      c.save(); c.beginPath(); notch(c); c.clip(); const vg = c.createLinearGradient(cx - hw, 0, cx + hw, 0); vg.addColorStop(0, 'rgba(3,5,16,0.72)'); vg.addColorStop(0.28, 'rgba(3,5,16,0)'); vg.addColorStop(0.72, 'rgba(3,5,16,0)'); vg.addColorStop(1, 'rgba(3,5,16,0.72)'); c.fillStyle = vg; c.fillRect(cx - hw - 2, top + 3, 2 * hw + 4, 5 - top);
      c.restore();
      const lfs = CUR.spout.leaf || {}, free = clamp(lfs.free ?? 0, 0, 1), pk = 1 - ss(0, 0.04, free), po = plugPull(lfs);
      if (pk < 0.02) return;
      // PLUG: the blade near the tip, crumpled into the gap from the bottom of the slot to a ragged dry edge just under the crest (the edge sinks a
      // little as Luma draws the tip out, and the water follows it down)
      const yP = -26.5 + 6 * po, x0 = cx - hw - 3, x1 = cx + hw + 3, NX = 30;
      const edgeY = x => yP + 1.3 * Math.sin((x - cx) * 0.5 + 1.3) + 0.9 * Math.sin((x - cx) * 1.37) + 1.1 * (R(Math.round((x - cx) * 1.3) + 60, 762) - 0.5) * (Math.round(x * 1.3) % 2 ? 1 : 0.4);
      const smooth = x => yP + 0.4 * Math.sin((x - cx) * 0.5 + 1.3);
      const plug = k => { k.moveTo(x0, 8); for (let i = 0; i <= NX; i++) { const x = lerp(x0, x1, i / NX); k.lineTo(x, edgeY(x)); } k.lineTo(x1, 8); k.closePath(); };
      c.save(); c.beginPath(); notch(c); c.clip();
      { const pg = c.createLinearGradient(0, yP - 1, 0, 4); pg.addColorStop(0, Lc([120, 86, 52], cx, yP, 2692, 0.04)); pg.addColorStop(0.2, Lc([84, 58, 36], cx, yP + 6, 2692, 0.03)); pg.addColorStop(0.6, Lc([54, 36, 22], cx, -12, 2692, 0.01)); pg.addColorStop(1, Lc([22, 14, 10], cx, 0, 2692, 0));
        c.fillStyle = pg; c.beginPath(); plug(c); c.fill(); }
      c.save(); c.beginPath(); plug(c); c.clip(); c.lineCap = 'round';
      // crumpled: the paper is creased into small flat facets, some turned to the moon, some in shadow (soft, low contrast: the scroll end is
      // what the eye should find), with a few short crease lines
      { const FX = 5, FY = 5, X0 = cx - hw - 3, Wd = 2 * hw + 6, Y0 = yP - 2, Hh = 8 - yP;
        const vx = (i, j) => X0 + Wd * i / FX + (i % FX ? (R(i * 13 + j, 841) - 0.5) * 5 : 0), vy = (i, j) => Y0 + Hh * j / FY + (j % FY ? (R(i * 13 + j, 842) - 0.5) * 5 : 0);
        for (let i = 0; i < FX; i++) for (let j = 0; j < FY; j++) for (const tri of [[[i, j], [i + 1, j], [i + 1, j + 1]], [[i, j], [i + 1, j + 1], [i, j + 1]]]) {
          const h = R(i * 31 + j * 7 + (tri[2][0] === i ? 1 : 0), 843), lt = h > 0.6, dk = h < 0.32; if (!lt && !dk) continue;
          c.fillStyle = lt ? Lc([176, 132, 84], cx, vy(i, j), 2692, 0.04) : css([10, 6, 3], 0.3); c.globalAlpha = lt ? 0.22 * (1 - 0.6 * j / FY) : 1;
          c.beginPath(); tri.forEach(([a2, b2], q) => q ? c.lineTo(vx(a2, b2), vy(a2, b2)) : c.moveTo(vx(a2, b2), vy(a2, b2))); c.closePath(); c.fill(); c.globalAlpha = 1; }
        for (let i = 0; i < 5; i++) { const xa = cx - hw + 2 * hw * R(i, 832), ya = yP + 4 + (-yP - 8) * R(i, 833), a2 = (R(i, 834) - 0.5) * 2.4, l = 4 + 5 * R(i, 835), xb = xa + Math.cos(a2) * l, yb = ya + Math.sin(a2) * l * 0.6;
          c.strokeStyle = css([14, 8, 4], 0.45); c.lineWidth = Math.max(0.4, 0.9 / s); c.beginPath(); c.moveTo(xa, ya); c.quadraticCurveTo((xa + xb) / 2 + 1, (ya + yb) / 2 - 1, xb, yb); c.stroke(); } }
      // side veins of the blade carried on into the plug (pale ridge, dark shadow), and one ragged insect hole
      for (let i = 0; i < 4; i++) { const sd = i % 2 ? 1 : -1, xa = cx + sd * (3 + 3 * i), ya = yP + 12 + 3 * i, xb = xa + sd * (6 + 3 * R(i, 765)), yb = yP + 3 + 2 * R(i, 766);
        c.strokeStyle = css([36, 18, 8], 0.5); c.lineWidth = Math.max(0.35, 0.9 / s); c.beginPath(); c.moveTo(xa + 0.5, ya + 0.5); c.quadraticCurveTo(lerp(xa, xb, 0.3) + 0.5, lerp(ya, yb, 0.6) + 0.5, xb + 0.5, yb + 0.5); c.stroke();
        c.strokeStyle = Lc([222, 186, 130], cx, ya, 2692, 0.1); c.globalAlpha = 0.5; c.beginPath(); c.moveTo(xa, ya); c.quadraticCurveTo(lerp(xa, xb, 0.3), lerp(ya, yb, 0.6), xb, yb); c.stroke(); c.globalAlpha = 1; }
      { const hx = cx - 11, hy = yP + 6, hp = []; for (let q = 0; q < 11; q++) { const a = TAU * q / 11, j = 0.75 + 0.45 * R(q, 767); hp.push([hx + Math.cos(a) * 1.7 * j, hy + Math.sin(a) * 1.1 * j]); }
        c.fillStyle = css([40, 20, 8], 0.8); c.beginPath(); hp.forEach((p, i) => { const q = [hx + (p[0] - hx) * 1.5, hy + (p[1] - hy) * 1.5]; i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); c.fill();
        c.fillStyle = css([4, 5, 12], 0.95); c.beginPath(); hp.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); }
      // shadow low in the slot, and the dark seam where the plug meets the stones at its sides
      { const dg = c.createLinearGradient(cx - hw, 0, cx + hw, 0); dg.addColorStop(0, css([4, 4, 10], 0.6)); dg.addColorStop(0.3, css([4, 4, 10], 0)); dg.addColorStop(0.7, css([4, 4, 10], 0)); dg.addColorStop(1, css([4, 4, 10], 0.6)); c.fillStyle = dg; c.fillRect(cx - hw - 3, yP - 4, 2 * hw + 6, 14 - yP); }
      c.restore();
      // the dry papery edge catching the moon along the top (thin, broken: a torn margin, not a rim)
      c.strokeStyle = Lc([236, 204, 150], cx, yP, 2692, 0.12); c.globalAlpha = 0.5; c.lineWidth = Math.max(0.35, 0.75 / s); c.beginPath(); for (let i = 0; i <= NX; i++) { const x = lerp(x0, x1, i / NX); i % 4 === 3 ? c.moveTo(x, edgeY(x) + 0.2) : i ? c.lineTo(x, edgeY(x) + 0.2) : c.moveTo(x, edgeY(x) + 0.2); } c.stroke(); c.globalAlpha = 1;
      // the pond in the gap: above the collar the V is full of the pond's water, pressing down and out on the leaf. It reads as water, not a lid:
      // its top melts into the pond behind the crest (no edge), its front bulges toward the lens (a lighter middle, a soft moon highlight like
      // a drop's), slow faint ripples, the trapped light as a few small golden sparks sinking onto the leaf, and a soft wet shine at the waterline
      const pr = clamp(pond) * pk;
      if (pr > 0.03) { const yW = topY - 4, Hw = yP - yW, wb = k => { k.moveTo(x0, yW); k.lineTo(x1, yW); for (let i = NX; i >= 0; i--) { const x = lerp(x0, x1, i / NX); k.lineTo(x, edgeY(x) + 0.6); } k.closePath(); };
        const bg = c.createLinearGradient(0, yW, 0, yP + 1), wc = (col, a) => rg(col, a);   // the pond's own water colours (act 2's pond, at the crest)
        bg.addColorStop(0, wc([44, 84, 98], 0)); bg.addColorStop(clamp((top - 4 - yW) / Hw), wc([44, 84, 98], 0)); bg.addColorStop(clamp((top + 3 - yW) / Hw), wc([40, 82, 98], 0.6 * pr)); bg.addColorStop(clamp((top + 9 - yW) / Hw), wc([22, 62, 82], 0.92 * pr)); bg.addColorStop(1, wc([12, 40, 56], 0.97 * pr));
        c.fillStyle = bg; c.beginPath(); wb(c); c.fill();
        if (gk > 0.02) { const gx = cx + 1, gy = yP - 1, gr = c.createRadialGradient(gx, gy, 0, gx, gy, hw * 1.1); gr.addColorStop(0, `rgba(214,130,58,${0.4 * gk * pr})`); gr.addColorStop(0.5, `rgba(150,90,50,${0.18 * gk * pr})`); gr.addColorStop(1, 'rgba(120,70,40,0)');   // the trapped light, pressed against the leaf
          c.save(); c.beginPath(); wb(c); c.clip(); c.save(); c.translate(gx, gy); c.scale(1, 0.6); c.translate(-gx, -gy); c.fillStyle = gr; c.fillRect(gx - hw * 1.2, gy - hw * 1.2, hw * 2.4, hw * 2.4); c.restore(); c.restore(); }
        c.save(); c.beginPath(); wb(c); c.clip(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        { const bx = cx + 1, by = yP - 0.42 * Hw, br = Math.max(hw, Hw) * 0.75, hg = c.createRadialGradient(bx, by, 0, bx, by, br);   // the bulge
          hg.addColorStop(0, css([40, 100, 120], 0.16 * pr)); hg.addColorStop(1, css([40, 100, 120], 0)); c.save(); c.translate(bx, by); c.scale(1, 0.7); c.translate(-bx, -by); c.fillStyle = hg; c.fillRect(bx - br, by - br, 2 * br, 2 * br); c.restore(); }
        for (const [w, a] of [[3.0, 0.07], [1.1, 0.2]]) { c.strokeStyle = css([210, 236, 255], a * pr); c.lineWidth = w; c.beginPath(); c.ellipse(cx + 1, yP + 2, hw * 0.55, (yP - top) * 0.75, 0, Math.PI * 1.22, Math.PI * 1.62); c.stroke(); }   // moon on the bulge
        for (let r = 0; r < 3; r++) { const ph = (tt * 0.22 + r / 3) % 1, y = lerp(top + 2, yP - 2, ph), a = 0.12 * pr * Math.sin(Math.PI * ph);   // slow ripples sinking onto the leaf
          c.strokeStyle = css([170, 214, 230], a); c.lineWidth = Math.max(0.35, 0.8 / s); c.beginPath(); c.moveTo(cx - hw * 0.6, y + 0.6); c.quadraticCurveTo(cx + 1, y - 0.8, cx + hw * 0.6, y + 0.6); c.stroke(); }
        if (gk > 0.02) for (let i = 0; i < 6; i++) { const ph = (tt * (0.2 + 0.1 * R(i, 773)) + R(i, 774)) % 1, x = cx + (R(i, 775) - 0.5) * hw * 1.3 * (1 - 0.5 * ph), y = lerp(top - 1, yP - 1.2, ph), r = 0.35 + 0.3 * R(i, 776), a = gk * pr * Math.sin(Math.PI * ph);
          const gg = c.createRadialGradient(x, y, 0, x, y, r * 3); gg.addColorStop(0, `rgba(255,214,140,${0.6 * a})`); gg.addColorStop(1, 'rgba(255,170,70,0)'); c.fillStyle = gg; c.fillRect(x - r * 3, y - r * 3, r * 6, r * 6); }
        c.restore();
        // the waterline on the leaf: a soft wet shine just under it (blurred light, never a hard line)
        c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
        for (const [w, a] of [[2.4, 0.07], [0.9, 0.14]]) { c.strokeStyle = css([170, 220, 236], a * pr); c.lineWidth = w; c.beginPath(); for (let i = 1; i < NX; i++) { const x = lerp(x0, x1, i / NX), y = edgeY(x) + 1.2; i > 1 ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
        c.restore(); }
      c.restore();
      // drops squeezing out at the foot of the seal (where the slot narrows to the sluice), swelling, falling a short way onto the wet stone
      const dk = pr * (1 - ss(0.5, 3, lfs.tip || 0));   // (they stop once the tip is up: the spill under it takes over)
      if (dk > 0.03) { c.save(); c.lineCap = 'round';
        for (let i = 0; i < 4; i++) { const per = 0.9 + 0.5 * R(i, 777), ph = (tt / per + R(i, 778)) % 1, x = cx - 2 + 4.5 * R(i, 779), grow = ss(0, 0.45, ph), fall = ss(0.45, 1, ph), y = -0.5 + 6 * fall * fall, r = (0.45 + 0.35 * R(i, 780)) * (0.5 + 0.5 * grow), a = dk * grow * (1 - ss(0.8, 1, ph));
          if (fall > 0.05) { c.strokeStyle = css([120, 190, 210], 0.3 * a); c.lineWidth = r * 0.8; c.beginPath(); c.moveTo(x, -0.5); c.lineTo(x, y - r); c.stroke(); }
          c.fillStyle = css([120, 196, 216], 0.85 * a); c.beginPath(); c.ellipse(x, y, r, r * (1.2 + 0.4 * fall), 0, 0, TAU); c.fill();
          c.fillStyle = css([240, 250, 255], 0.85 * a); c.beginPath(); c.arc(x - r * 0.3, y - r * 0.4, r * 0.35, 0, TAU); c.fill(); }
        c.restore(); }
    } });
    // the jambs: two smaller stones wedged into the mouth of the cleft from either side, so the gap the leaf's rolled tip is jammed in is narrow
    // (their inner edges overlap the scroll end); after the release the water pours out between them
    for (const [sd, w, h, y0, seed] of [[-1, 19, 33, 3, 871], [1, 18, 29, 2, 874]]) { const X = cx + 1 + sd * (5.2 + w / 2), Z = 2689.7; items.push({ z: Z, draw(c, s) { damStone(c, s, X, y0, Z, w, h, seed, { wet: true, moss: sd > 0, matte: true }); } }); }
    // light leaking over the crest: the pond is lit from within, so a warm haze stands above the dam and the stones are backlit
    items.push({ z: 2900, draw(c, s) { const bl = 0; const g0 = clamp(CUR.spout.pond ?? 0, 0, 1.2) * clamp(CUR.spout.waterGlow ?? 0, 0, 1); if (g0 < 0.03) return;
      if (!vis(c, s, cx - 520, cx + 520, top - 200, top + 10, 60)) return; void bl;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const [rx, ry, a, yy, col] of [[420, 80, 0.07, top - 8, '255,150,56'], [230, 50, 0.1, top - 10, '255,170,80'], [90, 26, 0.12, top - 10, '255,196,110']]) {
        const gr = c.createRadialGradient(cx, yy, 0, cx, yy, 1); gr.addColorStop(0, `rgba(${col},${a * Math.min(g0, 1)})`); gr.addColorStop(0.45, `rgba(${col},${a * 0.38 * Math.min(g0, 1)})`); gr.addColorStop(1, `rgba(${col},0)`);
        c.save(); c.translate(cx, yy); c.scale(rx, ry); c.translate(-cx, -yy); c.fillStyle = gr; c.beginPath(); c.arc(cx, yy, 1, 0, TAU); c.fill(); c.restore(); }
      c.restore(); } });
    // the wall behind the stones: dark slate, so the gaps between stones read as shadow, never as sky or grass
    items.push({ z: 2693.5, draw(c, s) { if (!vis(c, s, cx - 700, cx + 700, top - 12, 8, 40)) return;
      const yT = i => top + 2 + 3 * noise(i * 0.31, 77), x0 = cx - 700, x1 = cx + 700, N = 70;
      const g = c.createLinearGradient(0, top, 0, 4); g.addColorStop(0, D([34, 40, 70], cx, -30, 2693, 0.3, 0.02)); g.addColorStop(1, D([10, 12, 26], cx, -4, 2693, 0.3, 0.01));
      c.fillStyle = g; c.beginPath(); c.moveTo(x0, 6); for (let i = 0; i <= N; i++) c.lineTo(lerp(x0, x1, i / N), yT(i)); c.lineTo(x1, 6); c.closePath(); c.fill();
      c.strokeStyle = css([8, 10, 26], 0.5); c.lineWidth = Math.max(0.4, 1 / s); for (let r = 1; r < 3; r++) { c.beginPath(); c.moveTo(x0, top * (1 - r / 3) + 3); for (let i = 1; i <= 24; i++) c.lineTo(lerp(x0, x1, i / 24), top * (1 - r / 3) + 3 + 2 * noise(i * 0.7 + r * 9, 78)); c.stroke(); } } });
    // masonry: four terraces of river stones, tallest at the back, small cobbles in front; the cleft stays open
    let n = 0;
    // (the pin stone's resting place: the two low front terraces leave a bay open there, so the stone Bram rolls back lies on open ground in front
    // of the back rows, with lit ground between it and the freed stem; P.SH.PIN_REST = [right, back] of its roll)
    const bayX = P.SH && P.SH.LEAF_X !== undefined ? P.SH.LEAF_X + 132 + ((P.SH.PIN_REST || [0])[0]) : null;
    for (const [row, zz, hMin, hVar, wMin, wVar] of [[0, 2687, 40, 11, 46, 38], [1, 2665, 30, 10, 36, 30], [2, 2643, 20, 9, 30, 26], [3, 2621, 11, 8, 24, 20]]) { let x = cx - 640 + R(row, 500) * 30;
      while (x < cx + 640) { const idx = n++, w = wMin + R(row * 100 + idx, 501) * wVar, h = hMin + R(row * 100 + idx, 502) * hVar, mid = x + w / 2;
        if (Math.abs(mid - cx) > SP.mw + w * 0.55 + (row === 3 ? 14 : 0) && !(row >= 2 && bayX !== null && Math.abs(mid - bayX) < w / 2 + 17)) { const seed = 700 + row * 60 + idx, Z = zz + R(seed, 3) * 6, mossy = idx % 3 === 0;
          items.push({ z: Z, draw(c, s) { damStone(c, s, mid, 0, Z, w, h, seed, { moss: mossy, crest: row === 0, wet: row < 2 && Math.abs(mid - cx) < 160, matte: row === 3 }); } }); }   // (the low front terrace is matte rock like the jambs: close up, the speckled finish read as smoky glass)
        x += w * 0.8; } }
    for (const sd of [-1, 1]) { const X = cx + sd * (SP.mw + 27), seed = 850 + sd + 2, Z = 2689; items.push({ z: Z, draw(c, s) { damStone(c, s, X, 1, Z, 46, 50, seed, { moss: sd < 0, crest: true, wet: true }); } }); }
    // (none where the pin stone comes to rest after Bram rolls it off the stem: it lies on open ground in front of the dam, never behind a cobble)
    const pinRest = P.SH && P.SH.LEAF_X !== undefined ? P.SH.LEAF_X + 132 + ((P.SH.PIN_REST || [0])[0]) : null;
    for (let i = 0; i < 16; i++) { const X = cx - 210 + i * 28 + (R(i, 520) - 0.5) * 14, Z = 2608 + R(i, 521) * 22, w2 = 9 + R(i, 522) * 16, seed = 900 + i;
      if (Math.abs(X - cx) < 30 || (pinRest !== null && Math.abs(X - pinRest) < 22 + w2 / 2)) continue; items.push({ z: Z, draw(c, s) { damStone(c, s, X, 0, Z, w2, w2 * 0.55, seed, { moss: i % 4 === 0 }); } }); }
    for (let i = 0; i < 12; i++) { const X = cx - 240 + i * 42 + (R(i, 540) - 0.5) * 20, Z = 2598 + R(i, 541) * 40; if (Math.abs(X - cx) < 36) continue; items.push(scatter(X, Z, 12 + 8 * R(i, 542), i % 3 === 0 ? 2 : 0, 60 + i)); }
    WD._spCore = items;
  }
  const lf = Object.assign({ curl: 1, x: -900, y: -10, z: 2588, rot: 0.2, free: 0, lift: 0 }, st.leaf || {});
  const pin = Object.assign({ x: -870, z: 2582, rot: 0.2 }, st.pinStone || {}), pk = pinOf(lf, st.pinStone);
  return [...WD._spCore, ...jambItems(lf), ...pressItems(st, lf), { z: lf.z, draw(c, s) { if (!vis(c, s, lf.x - 30, lf.x + 190, -140, 60, 40)) return; leaf(c, s, lf); } },
    leafStem(lf, pk, st.cam),
    !pk.hide && { z: pin.z, draw(c, s) { c.save(); c.translate(pin.x, pin.y || 0); c.rotate(pin.rot * 0.3);
      c.fillStyle = css([3, 5, 14], 0.5); c.beginPath(); c.ellipse(1.5, 0.8, 13, 2.6, 0, 0, TAU); c.fill();     // contact shadow on the stem
      rock(c, s, 0, 0, pin.z, 23, 13, 990, [182, 184, 204], { moss: true }); c.restore(); } }]; };

// ---------- props: flat stone, resting log, dipper ----------
// WD.dipper(ctx, s, d): the same resting cup the world draws (d = { x, y, z, fall, water }), for a shot that draws its own copy.
WD.dipper = (c, s, d) => dipper(c, s, d);
WD.props = st => { CUR.props = st;
  if (!WD._props) WD._props = [
    { z: 395, draw(c, s) { rock(c, s, -55, 0, 395, 66, 9.5, 1200, [176, 170, 184], { moss: true, topEmit: 0.3 }); } },
    { z: 500, draw(c, s) {
      const x = -250, z = 500, Lg = 150, r = 13; if (!vis(c, s, x - Lg / 2 - 10, x + Lg / 2 + 10, -2 * r - 6, 6, 40)) return;
      c.save(); c.translate(x, 0); c.rotate(-0.05); c.fillStyle = css([3, 5, 16], 0.45); c.beginPath(); c.ellipse(4, 1, Lg * 0.52, 4, 0, 0, TAU); c.fill();
      const g = c.createLinearGradient(0, -2 * r, 0, 0); g.addColorStop(0, lit([156, 110, 76], x, -2 * r, z, 0.25)); g.addColorStop(0.5, lit([112, 78, 54], x, -r, z, 0.08)); g.addColorStop(1, lit([60, 40, 32], x, -2, z, 0));
      P.card(c, k => k.roundRect(-Lg / 2, -2 * r, Lg, 2 * r, [r * 0.5, r * 0.9, r * 0.3, r * 0.3]), g, { lift: 1.4, tex: 0.4, shadow: 0.4, edge: 0.25 });
      c.strokeStyle = css([26, 16, 14], 0.4); c.lineWidth = 0.7; for (let i = 0; i < 26; i++) { const bx = -Lg / 2 + 6 + R(i, 601) * (Lg - 14); c.beginPath(); c.moveTo(bx, -2 * r * (0.1 + 0.7 * R(i, 602))); c.lineTo(bx + (R(i, 603) - 0.5) * 3, -2 * r * (0.1 + 0.7 * R(i, 602)) + 5 + 7 * R(i, 604)); c.stroke(); }
      const eg = c.createRadialGradient(Lg / 2 - 4, -r, 0, Lg / 2 - 4, -r, r); eg.addColorStop(0, lit([226, 184, 130], x + Lg / 2, -r, z, 0.4)); eg.addColorStop(1, lit([170, 128, 86], x + Lg / 2, -r, z, 0.2));
      c.fillStyle = eg; c.beginPath(); c.ellipse(Lg / 2 - 4, -r, r * 0.34, r * 0.95, 0, 0, TAU); c.fill();
      c.strokeStyle = css([110, 70, 40], 0.5); c.lineWidth = 0.5; for (let i = 1; i < 4; i++) { c.beginPath(); c.ellipse(Lg / 2 - 4, -r, r * 0.34 * i / 4, r * 0.95 * i / 4, 0, 0, TAU); c.stroke(); }
      for (let i = 0; i < 9; i++) { const mx = -Lg / 2 + 14 + R(i, 610) * (Lg * 0.6), rr = 2.2 + R(i, 611) * 3; c.fillStyle = lit(i % 2 ? [112, 162, 72] : [80, 130, 60], x + mx, -2 * r, z, 0.16); c.beginPath(); c.arc(mx, -2 * r + 0.5 - R(i, 612) * 2, rr, 0, TAU); c.fill(); }
      c.restore(); } }];
  const d = Object.assign({ x: -98, y: 0, z: 384, water: 0, fall: 1, held: false }, st.dipper || {});
  return d.held ? WD._props : [...WD._props, { z: d.z, draw(c, s) { dipper(c, s, d); } }]; };


// Every garden item is scenery for the renderer's near plane (core.js): it is culled and faded when the lens passes through it.
for (const k of ['flowers', 'hero', 'spout', 'props', 'channel', 'ground']) { const f = WD[k]; WD[k] = (...a) => { const out = f(...a); for (const it of out) if (it && !it.flat && !it.fg) it.cull = true; return out; }; }

// ---------- foreground: giant clover and tall blades, tied to the camera so a close shot always has a frame ----------
// Foreground items are capped in blur so their silhouettes survive depth of field (they read as dark framing shapes with a cool rim).
const fgBlur = (cam, z, cap, floor = 0) => Math.max(floor, Math.min(cap, (cam.ap ?? 0) * Math.abs(1 / Math.max(cam.focus - cam.z, 1e-3) - 1 / Math.max(z - cam.z, 1e-3)) * cam.f * 0.01));
// Framing layers are silhouettes: a dark cool body with the faintest vein texture, and a soft moon rim only on the edge that
// faces the moon (upper right). The rim is the shape's own outline shifted down-left and clipped to the shape, so it never
// outlines the whole leaf. Everything here is drawn heavily defocused (see the blur floors in WD.foreground).
function moonRim(c, path, w, a, dx = 1) {
  // The crescent of the shape that is not covered by the same shape shifted down-left: a thin lit edge on the moon side only. Where the
  // shape is narrower than the shift (a thin tip or stalk) nothing is left of the body, so narrow parts stay dark.
  const d = w * 0.9; c.save(); c.beginPath(); path(c); c.clip();
  c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); c.translate(-d * dx, d * 0.8); path(c); c.setTransform(c.getTransform().translate(d * dx, -d * 0.8)); c.clip('evenodd');
  c.fillStyle = css([170, 204, 240], a * 0.8); c.fillRect(-1e5, -1e5, 2e5, 2e5); c.restore();
}
function fgBlade(c, s, o) {
  const { Hh, w, lean, x, z, ang } = o; c.save(); c.translate(o.x, 0); c.rotate(ang || 0);
  const g = c.createLinearGradient(0, 0, lean, -Hh); g.addColorStop(0, D([6, 18, 26], x, -Hh * 0.2, z, 0, 0)); g.addColorStop(0.55, D([14, 38, 42], x, -Hh * 0.6, z, 0, 0.01)); g.addColorStop(1, D([30, 66, 62], x, -Hh, z, 0, 0.03));
  const path = k => { k.moveTo(-w / 2, 0); k.bezierCurveTo(-w * 0.55, -Hh * 0.35, lean * 0.3 - w * 0.3, -Hh * 0.75, lean, -Hh); k.bezierCurveTo(lean * 0.3 + w * 0.3, -Hh * 0.7, w * 0.6, -Hh * 0.3, w / 2, 0); k.closePath(); };
  P.card(c, path, g, { lift: 0, tex: 0.15, shadow: 0 });
  c.strokeStyle = D([4, 12, 18], x, -Hh * 0.5, z, 0, 0); c.globalAlpha = 0.55; c.lineWidth = 2.2 / s; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(lean * 0.2, -Hh * 0.5, lean * 0.95, -Hh * 0.97); c.stroke(); c.globalAlpha = 1;   // midrib
  moonRim(c, path, 3.5 / s, 0.4, lean < 0 ? -1 : 1);
  c.restore();
}
function fgClover(c, s, o) {
  const { x, z, cx, cy, r, stalk, sw } = o; c.save();
  c.lineCap = 'round';
  const sg = c.createLinearGradient(0, 0, 0, cy); sg.addColorStop(0, D([6, 18, 26], x, 0, z, 0, 0)); sg.addColorStop(1, D([20, 48, 50], x, cy, z, 0, 0.03));
  c.strokeStyle = sg; c.lineWidth = stalk; c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + sw, cy * 0.55, cx, cy); c.stroke();
  c.strokeStyle = css([150, 190, 230], 0.09); c.lineWidth = Math.max(1 / s, stalk * 0.1); c.beginPath(); c.moveTo(x + stalk * 0.32, 0); c.quadraticCurveTo(x + sw + stalk * 0.32, cy * 0.55, cx + stalk * 0.32, cy); c.stroke();
  const ang = -0.1 + 0.5 * o.tilt;
  for (let i = 0; i < 3; i++) { c.save(); c.translate(cx, cy); c.rotate(ang + i * TAU / 3 + (i === 0 ? 0 : 0.05 * (i - 1))); const rr = r * (0.92 + 0.14 * R(o.seed || 1, i));
    const g = c.createLinearGradient(0, 0, 0, -rr); g.addColorStop(0, D([8, 22, 30], x, cy, z, 0, 0)); g.addColorStop(0.7, D([20, 50, 54], x, cy, z, 0, 0.01)); g.addColorStop(1, D([36, 78, 76], x, cy - rr, z, 0, 0.03));
    P.card(c, heartP(rr), g, { lift: 0, tex: 0, shadow: 0 });
    c.strokeStyle = css([120, 160, 200], 0.1); c.lineWidth = Math.max(0.3, rr * 0.05); c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -rr * 0.05); c.lineTo(0, -rr * 0.78); c.stroke();   // one faint centre vein
    moonRim(c, heartP(rr), rr * 0.06, 0.6);
    c.restore(); }
  c.restore();
}
WD.foreground = (st, cam) => {
  Object.assign(GC, { x: cam.x, y: cam.y, z: cam.z, f: cam.f });
  const out = [], f = cam.f, h = Math.max(-cam.y, 3), sp = 12, i0 = Math.floor((cam.x - 120) / sp), i1 = Math.ceil((cam.x + 120) / sp);
  // A framing layer only makes sense for a low lens: from a raised camera (crane, high wide) the stalks would cross the sky and the
  // ground in thin pale stripes, so it thins out with height and is gone above ~170 units. In a subject shot (lens focused close on a
  // character) it keeps to the outer fifth of the frame so it never touches a face.
  const raise = 1 - ss(70, 170, h), subject = cam.focus > cam.z && cam.focus - cam.z < 780;
  // Everything is placed by its screen position so it stays in the outer ~12% of the frame (a clover head may reach a little further in, the
  // stalk and blades stay in the margin): nothing ever crosses the middle where faces and the burst are.
  if (raise > 0.02) for (let i = i0; i <= i1; i++) {
    const d = 45 + R(i, 71) * 115, z = cam.z + d, s = f / d, X = (i + R(i, 72)) * sp, sx = W / 2 + (X - cam.x) * s;
    if (sx < -280 || sx > W + 280) continue;
    const edge = Math.abs(sx - W / 2) / (W / 2), p = (0.14 + 0.8 * ss(0.3, 1.0, edge)) * raise;
    if (R(i, 73) > p) continue;
    if (edge < (subject ? 0.8 : 0.76)) continue;
    const rowB = H / 2 + h * s, clover = R(i, 74) < 0.16, dir = sx < W / 2 ? -1 : 1;
    if (clover) { const cyPx = H * (0.5 + 0.3 * R(i, 76)), rPx = 100 + 70 * R(i, 77), lenPx = rowB - cyPx, cxPx = dir < 0 ? W * (0.01 + 0.06 * R(i, 84)) : W * (0.93 + 0.06 * R(i, 84)); if (lenPx < 60) continue;
      out.push({ z, fg: true, blur: fgBlur(cam, z, 14, 11), draw(c, s2) { const hx = X + (cxPx - sx) / s2; fgClover(c, s2, { x: X, z, cx: hx, cy: -lenPx / s2, r: rPx / s2, stalk: 20 / s2, sw: (hx - X) * 0.4, tilt: R(i, 78) - 0.5, seed: i }); } }); }
    else { const nb = 1 + Math.floor(R(i, 79) * 3);
      for (let b = 0; b < nb; b++) { const tipY = H * (0.3 + 0.52 * R(i * 5 + b, 75)) + (1 - edge) * H * 0.12, hPx = rowB - tipY; if (hPx < 120) continue;
        const wPx = 44 + 70 * R(i * 5 + b, 80), leanPx = dir * (30 + 100 * R(i * 5 + b, 81)) * (R(i * 5 + b, 85) < 0.7 ? -1 : 1) + (R(i * 5 + b, 82) - 0.5) * 60, ang = (R(i * 5 + b, 83) - 0.5) * 0.12, bx = X + (b - 1) * 14 / s;
        out.push({ z: z + b * 0.4, fg: true, blur: fgBlur(cam, z, 12, 7), draw(c, s2) { fgBlade(c, s2, { x: bx, z, Hh: hPx / s2, w: wPx / s2, lean: leanPx / s2, ang }); } }); } }
  }
  // In a wide shot there is always one giant dark, defocused clover framing the left edge (as in the look target), even from a raised lens.
  if (!subject || cam.focus - cam.z > 280) { const d = 70, z = cam.z + d, s = f / d, rowB = H / 2 + h * s, cyPx = H * 0.5, rPx = 170, lenPx = Math.max(rowB - cyPx, 140), sxC = W * 0.05, X = cam.x + (sxC - W / 2) / s;
    out.push({ z, fg: true, blur: fgBlur(cam, z, 14, 11), draw(c, s2) { fgClover(c, s2, { x: X + 90 / s2, z, cx: X, cy: -lenPx / s2, r: rPx / s2, stalk: 24 / s2, sw: -30 / s2, tilt: 0.3, seed: 11 }); } }); }
  return out; };
})();
