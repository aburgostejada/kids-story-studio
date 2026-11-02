// cast module (see CONTRACT.md): Pip, Bram and Luma as rigged paper-cut / felt puppets.
// Everything is a pure function of (pose, film time). Geometry (rig) is separate from painting so other modules can ask
// for anchors (P.cast.anchor) without drawing. Light is read from P.light in draw time only.
(() => {
const P = window.PIP, { TAU, clamp, lerp, ss, hash } = P;
const C = P.cast = P.cast || {};
const PI = Math.PI, HALFPI = PI / 2, sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt, atan2 = Math.atan2, hyp = Math.hypot;
const frac = v => v - Math.floor(v);

// ---------- 2D affine matrices [a,b,c,d,e,f] (canvas convention) ----------
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const inv = m => { const d = m[0] * m[3] - m[1] * m[2]; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
const T = (x, y) => [1, 0, 0, 1, x, y], Rt = a => [cos(a), sin(a), -sin(a), cos(a), 0, 0], Sc = (x, y = x) => [x, 0, 0, y, 0, 0];
const chain = (...ms) => ms.reduce(mul);

// ---------- paper-cut turn ----------
// pose.face may be any value in -1..1: the sign picks the facing, |face| the card's width. Below 1 the whole puppet is squeezed
// horizontally about its body centre like a card turning on its post, and darkens a little as it nears edge-on (TURN_DIM, read by
// mkG while that puppet draws). A shot turns a character by animating face from -1 to 1 over about 0.25 s: the flip of facing
// happens at the narrowest point, where it cannot be seen. face = 1 or -1 draws exactly as before.
let TURN_DIM = 1;
const turnK = f => clamp(Math.abs(f ?? 1), 0, 1);
const cardTurn = (c, k, cx, fn) => { if (k >= 0.999) return fn();
  const kk = Math.max(0.06, k), prev = TURN_DIM; TURN_DIM = 1 - 0.38 * (1 - kk) * (1 - kk);
  c.save(); c.translate(cx, 0); c.scale(kk, 1); c.translate(-cx, 0); try { fn(); } finally { c.restore(); TURN_DIM = prev; } };

// ---------- painting context with lighting helpers ----------
// G wraps a canvas context, tracks the current local->world matrix, and lights fills by world position.
function mkG(c, z, centre) {
  const G = { c, z, cur: [1, 0, 0, 1, 0, 0], stack: [], dim: TURN_DIM };
  G.push = m => { c.save(); c.transform(m[0], m[1], m[2], m[3], m[4], m[5]); G.stack.push(G.cur); G.cur = mul(G.cur, m); };
  G.pop = () => { c.restore(); G.cur = G.stack.pop(); };
  G.w = (x, y) => apply(G.cur, x, y);
  // Light is applied as a tint (hue/chroma of the light) times an intensity. Intensity gets a soft shoulder on luminance
  // and the result is soft-clipped on its brightest channel, so warm light saturates felt toward gold instead of bleaching it to cream.
  const shoulder = (v, knee, top) => v < knee ? v : knee + (top - knee) * (1 - Math.exp(-(v - knee) / (top - knee)));
  G.soft = 0;   // 0..1: pull the light multiplier toward 1 (translucent parts such as wings catch light softly)
  G.s = 6;      // px per world unit (set by the draw function) for level-of-detail decisions
  G.lit = (rgb, x, y, emit = 0, a = 1) => { const w = G.w(x, y), m = P.light(w[0], w[1], z), k = 1 - G.soft, dm = G.dim;
    const r = rgb[0] * (1 + (m[0] - 1) * k + emit) * dm, g = rgb[1] * (1 + (m[1] - 1) * k + emit) * dm, b = rgb[2] * (1 + (m[2] - 1) * k + emit) * dm;
    const Y = 0.3 * r + 0.59 * g + 0.11 * b;
    let f = Y > 1 ? shoulder(Y, 118, 206) / Y : 1;                    // luminance shoulder, RGB scaled together
    let R = r * f, Gc = g * f, B = b * f; const mx = Math.max(R, Gc, B);
    if (mx > 222) { const f2 = (222 + 26 * (1 - Math.exp(-(mx - 222) / 60))) / mx; R *= f2; Gc *= f2; B *= f2; }   // soft clip on the max channel
    const o = v => Math.round(clamp(v, 0, 255));
    return a >= 1 ? `rgb(${o(R)},${o(Gc)},${o(B)})` : `rgba(${o(R)},${o(Gc)},${o(B)},${a})`; };
  // light summary at the character centre: direction toward the strongest warm light (world), strength, colour
  const w = (px, py) => { const m = P.light(px, py, z); return m[0] - 0.55 * m[2]; };
  const [x, y] = centre, e = 16;
  const gx = w(x + e, y) - w(x - e, y), gy = w(x, y + e) - w(x, y - e), m = P.light(x, y, z);
  const warm = clamp((m[0] - 0.55 * m[2] + 0.06) / 0.9), gl = hyp(gx, gy);
  const moon = [-0.45, -0.89], wd = gl > 1e-4 ? [gx / gl, gy / gl] : moon, mw = clamp(warm * 1.8) * clamp(gl * 14);
  let dx = moon[0] * (1 - mw) + wd[0] * mw, dy = moon[1] * (1 - mw) + wd[1] * mw; const dl = hyp(dx, dy) || 1; dx /= dl; dy /= dl;
  G.L = { dx, dy, k: clamp(0.3 + warm * 1.05), warm, col: P.mixc([150, 186, 255], [255, 196, 118], clamp(warm * 1.7)), lum: (m[0] + m[1] + m[2]) / 3, m };
  // light direction in the current local frame (unit), and a world vector in local frame
  G.ld = () => { const i = inv(G.cur), vx = i[0] * G.L.dx + i[2] * G.L.dy, vy = i[1] * G.L.dx + i[3] * G.L.dy, l = hyp(vx, vy) || 1; return [vx / l, vy / l]; };
  G.lv = (wx, wy) => { const i = inv(G.cur); return [i[0] * wx + i[2] * wy, i[1] * wx + i[3] * wy]; };
  return G;
}
const lin = (G, x0, y0, x1, y1, stops) => { const g = G.c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, rgb, em = 0.04] of stops) g.addColorStop(o, G.lit(rgb, lerp(x0, x1, o), lerp(y0, y1, o), em)); return g; };
const rad = (G, x0, y0, r0, x1, y1, r1, stops) => { const g = G.c.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, rgb, em = 0.04, a = 1] of stops) g.addColorStop(o, G.lit(rgb, lerp(x0, x1, o), lerp(y0, y1, o), em, a)); return g; };

// ---------- shapes ----------
// closed Catmull-Rom blob through points; returns { path(c), sample(n) -> [{x,y,nx,ny}] outward normals }
function blob(pts, k = 1) {
  const n = pts.length, segs = [];
  for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    segs.push([p1, [p1[0] + (p2[0] - p0[0]) / 6 * k, p1[1] + (p2[1] - p0[1]) / 6 * k], [p2[0] - (p3[0] - p1[0]) / 6 * k, p2[1] - (p3[1] - p1[1]) / 6 * k], p2]); }
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= n; cy /= n;
  const path = c => { c.moveTo(segs[0][0][0], segs[0][0][1]); for (const s of segs) c.bezierCurveTo(s[1][0], s[1][1], s[2][0], s[2][1], s[3][0], s[3][1]); c.closePath(); };
  const sample = per => { const out = [];
    for (const s of segs) for (let j = 0; j < per; j++) { const u = j / per, v = 1 - u;
      const x = v * v * v * s[0][0] + 3 * v * v * u * s[1][0] + 3 * v * u * u * s[2][0] + u * u * u * s[3][0];
      const y = v * v * v * s[0][1] + 3 * v * v * u * s[1][1] + 3 * v * u * u * s[2][1] + u * u * u * s[3][1];
      const dx = 3 * v * v * (s[1][0] - s[0][0]) + 6 * v * u * (s[2][0] - s[1][0]) + 3 * u * u * (s[3][0] - s[2][0]);
      const dy = 3 * v * v * (s[1][1] - s[0][1]) + 6 * v * u * (s[2][1] - s[1][1]) + 3 * u * u * (s[3][1] - s[2][1]);
      let nx = dy, ny = -dx; const l = hyp(nx, ny) || 1; nx /= l; ny /= l; if (nx * (x - cx) + ny * (y - cy) < 0) { nx = -nx; ny = -ny; }
      out.push({ x, y, nx, ny }); } return out; };
  return { path, sample, cx, cy, pts };
}
const ell = (cx, cy, rx, ry, rot = 0) => c => { c.moveTo(cx + rx * cos(rot), cy + rx * sin(rot)); c.ellipse(cx, cy, rx, ry, rot, 0, TAU); c.closePath(); };
const capsule = (x0, y0, x1, y1, r0, r1 = r0) => c => { const a = atan2(y1 - y0, x1 - x0); c.moveTo(x1 + r1 * cos(a - HALFPI), y1 + r1 * sin(a - HALFPI)); c.arc(x1, y1, r1, a - HALFPI, a + HALFPI); c.arc(x0, y0, r0, a + HALFPI, a + 3 * HALFPI); c.closePath(); };
// Smooth curves through sampled points: quadratic segments that pass through the midpoints of consecutive samples, so the
// outline has no corners at any zoom (a plain polyline shows facets in close-ups).
const smoothOpen = (c, pts, move = true) => { const n = pts.length; if (!n) return;
  move ? c.moveTo(pts[0][0], pts[0][1]) : c.lineTo(pts[0][0], pts[0][1]);
  if (n < 3) { for (let i = 1; i < n; i++) c.lineTo(pts[i][0], pts[i][1]); return; }
  c.lineTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  for (let i = 1; i < n - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  c.lineTo(pts[n - 1][0], pts[n - 1][1]); };
const smoothPoly = (c, pts) => { const n = pts.length; c.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } c.closePath(); };
// Samples needed for a curve `len` world units long so each piece is about `px` screen pixels at the current zoom (G.s px per unit).
const nseg = (G, len, px = 4, lo = 8, hi = 160) => clamp(Math.ceil(len * (G.s || 6) / px), lo, hi);
const quadPts = (p0, p1, p2, n) => { const out = []; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; out.push([v * v * p0[0] + 2 * u * v * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * u * v * p1[1] + u * u * p2[1]]); } return out; };
const cubPts = (p0, p1, p2, p3, n, skipFirst = false) => { const out = []; for (let i = skipFirst ? 1 : 0; i <= n; i++) { const u = i / n, v = 1 - u;
  out.push([v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]]); } return out; };
// Ribbon: the outline of a stroke of varying width along a polyline. wf(u) gives the full width at u (0..1 along the line), so
// brows, lash lines and mouth lines taper to clean points instead of ending in blunt round caps.
function ribbonPath(c, pts, wf) { const n = pts.length, up = [], dn = [];
  for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = hyp(dx, dy) || 1, w = wf(i / (n - 1)) / 2;
    up.push([pts[i][0] - dy / l * w, pts[i][1] + dx / l * w]); dn.push([pts[i][0] + dy / l * w, pts[i][1] - dx / l * w]); }
  smoothOpen(c, up); smoothOpen(c, dn.reverse(), false); c.closePath(); }
const taper = (w0, wm, w1, peak = 0.5) => u => u < peak ? lerp(w0, wm, Math.sin(HALFPI * u / peak)) : lerp(w1, wm, Math.sin(HALFPI * (1 - u) / (1 - peak)));
// smooth tube through three points (shoulder, elbow, hand) with radii; round ends. N sets the sampling (raise it for close-ups).
const tube = (p0, p1, p2, r0, r1, r2, N = 20) => { const ctl = [2 * p1[0] - (p0[0] + p2[0]) / 2, 2 * p1[1] - (p0[1] + p2[1]) / 2], L = [], Rr = [];
  for (let i = 0; i <= N; i++) { const u = i / N, v = 1 - u, x = v * v * p0[0] + 2 * u * v * ctl[0] + u * u * p2[0], y = v * v * p0[1] + 2 * u * v * ctl[1] + u * u * p2[1];
    const dx = 2 * v * (ctl[0] - p0[0]) + 2 * u * (p2[0] - ctl[0]), dy = 2 * v * (ctl[1] - p0[1]) + 2 * u * (p2[1] - ctl[1]), l = hyp(dx, dy) || 1, r = u < 0.5 ? lerp(r0, r1, ss(0, 1, u * 2)) : lerp(r1, r2, ss(0, 1, u * 2 - 1));
    L.push([x - dy / l * r, y + dx / l * r]); Rr.push([x + dy / l * r, y - dx / l * r]); }
  const e = Rr[N], f = L[N], g = Rr[0], h = L[0];
  return c => { smoothOpen(c, L);
    const ae = atan2(f[1] - (f[1] + e[1]) / 2, f[0] - (f[0] + e[0]) / 2); c.arc((f[0] + e[0]) / 2, (f[1] + e[1]) / 2, hyp(f[0] - e[0], f[1] - e[1]) / 2, ae, ae + PI, true);
    smoothOpen(c, Rr.slice().reverse(), false);
    const as = atan2(g[1] - (g[1] + h[1]) / 2, g[0] - (g[0] + h[0]) / 2); c.arc((g[0] + h[0]) / 2, (g[1] + h[1]) / 2, hyp(g[0] - h[0], g[1] - h[1]) / 2, as, as + PI, true); c.closePath(); }; };
// a shape from an ordered list of outline points (closed): path, outward-normal samples for fuzz, bounds and centre (same shape as blob())
function ptsShape(pts) { const n = pts.length; let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= n; cy /= n;
  const sample = () => pts.map((p, i) => { const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n]; let nx = b[1] - a[1], ny = -(b[0] - a[0]); const l = hyp(nx, ny) || 1; nx /= l; ny /= l;
    if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny; } return { x: p[0], y: p[1], nx, ny }; });
  return { path: c => smoothPoly(c, pts), sample, pts, cx, cy }; }
// leaf: root at origin, pointing +x
const leafPath = (len, w, bend = 0) => c => { c.moveTo(0, 0); c.bezierCurveTo(len * 0.2, -w * 0.75 + bend * 0.3, len * 0.62, -w * 0.8 + bend, len, bend * 0.5);
  c.bezierCurveTo(len * 0.62, w * 0.7 + bend, len * 0.2, w * 0.75 + bend * 0.3, 0, 0); c.closePath(); };

// ---------- felt painting ----------
const SHADOW_RGB = '3,5,16';
function crescent(c, path, vx, vy, d, fill) { // paint inside `path` but outside `path` shifted by (vx,vy)*d
  c.save(); c.beginPath(); path(c); c.clip(); c.beginPath(); c.rect(-1e3, -1e3, 2e3, 2e3); c.translate(vx * d, vy * d); path(c);
  c.fillStyle = fill; c.fill('evenodd'); c.restore(); }
function hairs(c, samp, o) { // soft fuzz: short, curved fibres of varied length, leaning outward from an outline
  const { col, a = 0.3, len = 0.9, lw = 0.13, seed = 1, every = 1, lean = 0 } = o;
  c.save(); c.strokeStyle = col; c.globalAlpha = a; c.lineWidth = lw; c.lineCap = 'round'; c.beginPath();
  for (let i = 0; i < samp.length; i += every) { const p = samp[i], h = hash(i, seed), l = len * (0.18 + 0.75 * h * h), tx = -p.ny, ty = p.nx, bend = (hash(i, seed + 7) - 0.5) * 1.5 + lean;
    c.moveTo(p.x - p.nx * 0.25, p.y - p.ny * 0.25);
    c.quadraticCurveTo(p.x + p.nx * l * 0.6 + tx * bend * l * 0.1, p.y + p.ny * l * 0.6 + ty * bend * l * 0.1, p.x + p.nx * l * 0.9 + tx * bend * l * 0.55, p.y + p.ny * l * 0.9 + ty * bend * l * 0.55); }
  c.stroke(); c.restore(); }
function flecks(c, path, box, n, col, a, seed, size = 0.5) { // scattered fibre flecks clipped to a shape
  c.save(); c.beginPath(); path(c); c.clip(); c.strokeStyle = col; c.globalAlpha = a; c.lineWidth = 0.2; c.lineCap = 'round'; c.beginPath();
  for (let i = 0; i < n; i++) { const x = box[0] + hash(i, seed) * box[2], y = box[1] + hash(i, seed + 1) * box[3], ang = hash(i, seed + 2) * TAU, l = size * (0.5 + hash(i, seed + 3));
    c.moveTo(x, y); c.lineTo(x + cos(ang) * l, y + sin(ang) * l); }
  c.stroke(); c.restore(); }
function stitch(c, path, col, a = 0.7, lw = 0.3, dash = [0.9, 0.7]) { c.save(); c.setLineDash(dash); c.lineCap = 'round'; c.beginPath(); path(c); c.strokeStyle = col; c.globalAlpha = a; c.lineWidth = lw; c.stroke(); c.restore(); }

// form: a large core shadow on the side away from the key (cool fill), a warm lift toward it, and a gentle all-round roundness, over
// the box bb = [x0, y0, x1, y1] in the current frame. Paints into the current clip, so other pieces lying on the same form (eyelids
// over the head) can repeat exactly the shading of the piece under them.
function formShade(G, bb, v = 1, cs = 1) {
  const c = G.c, L = G.ld(), [x0, y0, x1, y1] = bb, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2, ext = Math.abs(L[0]) * hw + Math.abs(L[1]) * hh + 0.01;
  // terminator along the light axis: t=0 on the lit extreme, 1 on the far extreme
  const g = c.createLinearGradient(mx + L[0] * ext, my + L[1] * ext, mx - L[0] * ext, my - L[1] * ext);
  g.addColorStop(0, 'rgba(12,18,70,0)'); g.addColorStop(0.34, 'rgba(12,18,70,0)'); g.addColorStop(0.62, `rgba(12,18,70,${0.2 * v * cs})`); g.addColorStop(1, `rgba(8,12,56,${0.42 * v * cs})`);
  c.fillStyle = g; c.fillRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
  const r = Math.max(hw, hh) * 1.25, g1 = c.createRadialGradient(mx + L[0] * r * 0.3, my + L[1] * r * 0.3, r * 0.2, mx, my, r);
  g1.addColorStop(0, 'rgba(0,0,0,0)'); g1.addColorStop(0.65, `rgba(6,10,40,${0.03 * v})`); g1.addColorStop(1, `rgba(6,10,40,${0.2 * v})`); c.fillStyle = g1; c.fillRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
  const wc = G.L.col, g2 = c.createRadialGradient(mx + L[0] * r * 0.5, my + L[1] * r * 0.5, 0, mx + L[0] * r * 0.5, my + L[1] * r * 0.5, r * 0.95);
  g2.addColorStop(0, `rgba(${wc[0] | 0},${wc[1] | 0},${wc[2] | 0},${0.2 * G.L.k * v})`); g2.addColorStop(1, `rgba(${wc[0] | 0},${wc[1] | 0},${wc[2] | 0},0)`); c.fillStyle = g2; c.fillRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
}
// felt(G, path, fill, o): one cut piece: directional lift shadow, fill, fibre, form shadow on the far side, rim light on the lit side.
function felt(G, path, fill, o = {}) {
  // v6.1: the lift gap is capped at 4 screen px. In close-ups (20+ px a unit) an uncapped gap threw a hard dark copy of every piece
  // 20-35 px off it, which read as a doubled, see-through puppet on a phone.
  const c = G.c, L = G.ld(), ms = c.getTransform(), lift = Math.min(o.lift ?? 0.9, 4 / Math.max(Math.hypot(ms.a, ms.b), 1e-6)), sz = o.sz ?? 1.4, rk = (o.rim ?? 1) * G.L.k;
  if (lift > 0 && (o.shadow ?? 0.42) > 0) { c.save(); c.translate(-L[0] * lift * 0.8, -L[1] * lift * 0.5 + lift * 0.5); c.beginPath(); path(c);
    c.fillStyle = `rgba(${SHADOW_RGB},${o.shadow ?? 0.42})`; c.fill(); c.restore(); }
  P.card(c, path, fill, { lift: 0, tex: o.tex ?? 0.4, stroke: o.stroke, lineWidth: o.lw });
  const bb = o.blob ? (() => { const xs = o.blob.pts.map(p => p[0]), ys = o.blob.pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; })() : o.box;
  if (bb && o.vol !== 0) { c.save(); c.beginPath(); path(c); c.clip(); formShade(G, bb, o.vol ?? 1, o.core ?? 1); c.restore(); }
  if (o.shade !== false) {
    const sh = o.shadeA ?? 0.1;
    for (const [d, a] of [[0.5, 1], [1.1, 0.8], [2.0, 0.6], [3.2, 0.4]]) crescent(c, path, L[0], L[1], sz * d, `rgba(8,12,44,${sh * a})`);
    const rc = G.L.col, rgba = a => `rgba(${rc[0] | 0},${rc[1] | 0},${rc[2] | 0},${a})`;
    if (rk > 0.02) { crescent(c, path, -L[0], -L[1], sz * 2.8, rgba(0.07 * rk)); crescent(c, path, -L[0], -L[1], sz * 1.3, rgba(0.16 * rk)); crescent(c, path, -L[0], -L[1], sz * 0.45, rgba(0.62 * rk)); }
  }
  if (o.blob && o.hair !== false) { const samp = o.blob.sample(Math.round((o.hairN ?? 8) * 1.4)), rc = G.L.col;
    hairs(c, samp, { col: G.lit(o.hairCol ?? [255, 244, 210], o.blob.cx, o.blob.cy, 0.1), a: 0.2, len: (o.hairLen ?? 0.6) * 1.1, lw: 0.12, seed: o.seed ?? 3 });
    hairs(c, samp, { col: `rgb(${rc[0] | 0},${rc[1] | 0},${rc[2] | 0})`, a: 0.2 * G.L.k, len: (o.hairLen ?? 0.6) * 0.9, lw: 0.11, seed: (o.seed ?? 3) + 11, every: 2 }); }
}

// ---------- faces ----------
// eyes: glossy near-black beads (a dark-amber iris ring shows only when the camera is close), one big and one small catch-light,
// a pupil/iris that follows `look`, and skin lids. The upper lid edge is one smooth curve that slides from hugging the top of the
// ball (open) to a lash line across it (closed); a relaxed closed lid sags, a happy one (laugh) arches up. A tapered lash line rides
// that edge, thicker toward the outer corner, with E.lashes small flicks. worry droops the outer corner, knit lowers and flattens
// the lid, lower lifts the lower lid (squint).
function eye(G, E) {
  const c = G.c, { cx, cy, rx, ry, sd } = E, L = G.ld(), warm = G.L.warm, ls = E.ls ?? 1;
  // Blink timing: a blink snaps shut and opens, it does not hang half-way. E.blink (0..1) is reshaped so the in-between values pass
  // quickly toward shut (0.62 -> 0.84, 0.78 -> 1) while small values (<= 0.4, used for held half-lids) are unchanged. eyesH is the held
  // openness without the blink; bkw is how much of the closing is the blink (1 = all blink, a held laugh-closed eye stays an arc).
  const bk0 = clamp(E.blink ?? 0), bkS = bk0 + (1 - bk0) * ss(0.4, 0.8, bk0), eyesH = clamp(E.eyes ?? (bk0 < 0.999 ? clamp(E.open) / (1 - bk0) : 1));
  const open = bk0 > 0.001 ? clamp(eyesH * (1 - bkS)) : clamp(E.open), look = E.look || [0, 0], X = u => cx + sd * u * rx;
  const bkw = ss(0.02, 0.3, bkS) * eyesH;
  const irisA = E.irisA ?? ss(5, 16, G.s), wide = ss(0.25, 0.65, open), n = nseg(G, rx * 3, 3, 18, 72);
  const worry = clamp(-(E.brow ?? 0)), knit = E.knit || 0, happy = clamp(E.brow ?? 0), lowerAmt = clamp(E.lower || 0);
  const cover = clamp(Math.max(1 - open, 0.14 * worry + 0.24 * knit)), cv = ss(0, 1, cover);
  const arcK = clamp(happy * 1.3) * ss(0.55, 1, cover) * (1 - bkw);            // closed lids arch up when happy (laughing), sag when relaxed; a blink is always a relaxed close
  const tilt = (worry * 0.42 - knit * 0.5) * ry * (1 - 0.4 * cv);              // + lowers the outer corner (sad), - raises it (cross)
  // A blink (E.blink, the part of the closing that is a blink rather than a held expression) sags the lid edge in the middle on the
  // way down, so a half-shut eye is a crescent of ball under a curved lid, never a flat-topped dark lens (sunglasses).
  // A content half-lid (brow up, nothing knit) sags a little too, so a held sleepy-happy eye is never a flat dark lens either.
  // During a blink the edge bows down further (a lid sliding over a ball), so the visible ball is a thin smile-shaped crescent.
  const bw = clamp(Math.max(bkS * 2.2, 0.6 * happy * (1 - clamp(knit * 2)))), sag = (0.54 + 0.3 * bkw) * ry * bw * Math.sin(PI * cv) * (1 - 0.6 * arcK);
  const edgeY = u => { const uu = clamp(u, -1, 1), dome = Math.sqrt(1 - uu * uu);
    return lerp(cy - ry * 0.985 * dome, cy + ry * 0.2 + ry * lerp(0.24, -0.52, arcK) * (1 - uu * uu), cv) + sag * (1 - uu * uu) + tilt * clamp(u, -1.2, 1.2) * 0.8; };
  const edge = (u0, u1, m = n) => { const out = []; for (let i = 0; i <= m; i++) { const u = lerp(u0, u1, i / m); out.push([X(u), edgeY(u)]); } return out; };
  const lowY = u => { const uu = clamp(u, -1, 1); return cy + ry * 1.08 - lowerAmt * ry * (0.62 + 0.42 * (1 - uu * uu)); };
  // soft socket (fades out as the lid closes so closed eyes are not skin discs with rings)
  // A radial falloff with no hard edge, fading as the eye narrows (a squint must not leave a ring around the eye).
  const sockA = (E.socketA ?? 0.16) * wide * lerp(0.25, 1, ss(0.45, 0.85, open));
  if (sockA > 0.004) { c.save(); c.beginPath(); c.rect(cx - rx * 3, cy - ry * 3, rx * 6, ry * 6); ell(cx, cy, rx, ry)(c); c.clip('evenodd'); c.translate(cx, cy + ry * 0.12); c.scale(rx * 1.24, ry * 1.16); const sg = c.createRadialGradient(0, 0, 0, 0, 0, 1), sr = E.socketRGB || '26,30,8';
    sg.addColorStop(0, `rgba(${sr},${sockA})`); sg.addColorStop(0.72, `rgba(${sr},${sockA * 0.8})`); sg.addColorStop(1, `rgba(${sr},0)`); c.fillStyle = sg; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill(); c.restore(); }
  // ball. A blink is an opaque lid sliding down: the ball is drawn fully opaque but clipped to the open part of the eye, below the
  // upper lid edge and above the lower boundary; whatever lies above the edge is the face itself (already painted), so no frame
  // ever shows the iris or a catch-light through skin. In the last part of the close the lower boundary rises to meet the lash
  // line, so a shut eye is the bare face with a lash line, never a disc or an outline.
  const top = edge(1.45, -1.45), lo = lowerAmt > 0.01 ? range(-1.45, 1.45, 24, u => [X(u), lowY(u)]) : null;
  const shutK = Math.max(ss(0.62, 1, cover), 0.38 * bw * ss(0.25, 0.9, cover)), lowB = u => lerp(lo ? lowY(u) : cy + ry * 1.02 * Math.sqrt(Math.max(0, 1 - u * u)), edgeY(u), shutK);   // the lower rim rises as a curve: an almond slit, never a flat cut
  const lidPath = k => { k.moveTo(X(-1.45), cy - ry * 2.4); k.lineTo(X(1.45), cy - ry * 2.4); smoothOpen(k, top, false); k.closePath(); };
  const shutPath = k => { smoothOpen(k, edge(-1.45, 1.45)); k.lineTo(X(1.45), cy + ry * 2.2); k.lineTo(X(-1.45), cy + ry * 2.2); k.closePath(); };
  const abovePath = k => { k.moveTo(X(-1.45), cy - ry * 2.4); k.lineTo(X(1.45), cy - ry * 2.4); smoothOpen(k, range(1.45, -1.45, 24, u => [X(u), lowB(u)]), false); k.closePath(); };
  if (shutK < 0.995) {
    c.save(); c.beginPath(); ell(cx, cy, rx, ry)(c); c.clip(); c.beginPath(); shutPath(c); c.clip(); c.beginPath(); abovePath(c); c.clip();
    const ix = cx + look[0] * rx * 0.34, iy = cy + look[1] * ry * 0.3, ir = rx * 0.56;
    c.fillStyle = rad(G, cx - L[0] * rx * 0.25, cy - L[1] * ry * 0.25, rx * 0.05, cx, cy, rx * 1.15, [[0, E.bead || [52, 34, 28], 0], [0.55, [20, 12, 12], 0], [1, [5, 3, 5], 0]]);
    c.fillRect(cx - rx * 2, cy - ry * 2, rx * 4, ry * 4);
    if (irisA > 0.01) { // dark-amber iris ring, lit from below where light passes through the lens
      c.globalAlpha = irisA; c.beginPath(); ell(ix, iy, ir, ir * 1.03)(c);
      c.fillStyle = rad(G, ix, iy + ir * 0.3, ir * 0.12, ix, iy, ir, [[0, E.iris1 || [128, 70, 28], 0.1], [0.55, E.iris2 || [78, 40, 18], 0.05], [0.9, [38, 20, 12], 0.04], [1, [8, 5, 6], 0]]); c.fill();
      c.beginPath(); ell(ix, iy, ir * 0.5, ir * 0.52)(c); c.fillStyle = 'rgb(5,3,4)'; c.fill(); c.globalAlpha = 1; }
    // the lid casts a soft shadow onto the ball just under its edge (the lid's thickness)
    { const e = edge(-1.3, 1.3, 24); c.beginPath(); smoothOpen(c, e); for (let i = e.length - 1; i >= 0; i--) c.lineTo(e[i][0], e[i][1] + ry * 0.55); c.closePath();
      const y0 = edgeY(0), sg = c.createLinearGradient(0, y0, 0, y0 + ry * 0.55); sg.addColorStop(0, `rgba(0,0,0,${0.34 * (1 - 0.55 * bkw)})`); sg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = sg; c.fill(); }
    // warm bounce along the lower rim of the bead
    c.beginPath(); ell(cx - L[0] * rx * 0.2, cy + ry * 0.62, rx * 0.68, ry * 0.26)(c); c.fillStyle = `rgba(255,170,90,${0.03 + 0.1 * warm})`; c.globalCompositeOperation = 'lighter'; c.fill(); c.globalCompositeOperation = 'source-over';
    // mid-blink the band of ball left under the lid is lifted toward the iris colour (a glossy lens catching light under the lid, not
    // a black visor); strongest just under the lid edge, where the lid's own shadow used to be darkest
    if (bkw > 0.01) { const ic = E.iris1 || [128, 70, 28], e = edge(-1.3, 1.3, 24), y0 = edgeY(0); c.beginPath(); smoothOpen(c, e); c.lineTo(X(1.3), cy + ry * 1.2); c.lineTo(X(-1.3), cy + ry * 1.2); c.closePath();
      const lg = c.createLinearGradient(0, y0, 0, cy + ry * 1.05); lg.addColorStop(0, `rgba(${ic[0]},${ic[1]},${ic[2]},${0.5 * bkw})`); lg.addColorStop(0.55, `rgba(${ic[0]},${ic[1]},${ic[2]},${0.3 * bkw})`); lg.addColorStop(1, `rgba(${ic[0]},${ic[1]},${ic[2]},${0.12 * bkw})`);
      c.globalCompositeOperation = 'screen'; c.fillStyle = lg; c.fill(); c.globalCompositeOperation = 'source-over'; }
    // catch-lights: one big toward the key, one small opposite. They shrink as the lids close (ck), so a squint keeps a dark pupil
    // with a small spark instead of a glowing slit; the lid edge clips them like everything else on the ball. Mid-blink the big one
    // keeps a usable size and rides down just under the lid edge, so the eye still reads as a living eye through the blink.
    const ck0 = Math.max(lerp(0.42, 1, ss(0.3, 0.92, open)), 0.5 * bkw), hx = lerp(cx + L[0] * rx * lerp(0.46, 0.4, ck0), cx + L[0] * rx * 0.22, bkw) + look[0] * rx * 0.08;
    const uH = clamp((hx - cx) / (sd * rx), -1, 1), band = Math.max(0, lowB(uH) - edgeY(uH)), ck = lerp(ck0, Math.min(ck0, band * 1.05 / ry), bkw);   // mid-blink the spark fits inside the band of ball
    const hy0 = cy + clamp(L[1] * ry * 0.5, -ry * 0.55, ry * 0.15) * lerp(0.4, 1, ck) + look[1] * ry * 0.05, hyB = edgeY(uH) + band * 0.5;
    const hy = lerp(hy0, Math.max(hy0, hyB), bkw);
    const wcol = P.mixc([255, 252, 244], [255, 228, 180], warm), wc = `rgb(${wcol[0] | 0},${wcol[1] | 0},${wcol[2] | 0})`;
    c.fillStyle = wc; c.beginPath(); ell(hx, hy, rx * 0.36 * ck, ry * 0.3 * ck, -0.35)(c); c.fill();
    c.globalAlpha = 0.25 * ck * ck; c.beginPath(); ell(hx, hy, rx * 0.52 * ck, ry * 0.44 * ck, -0.35)(c); c.fill(); c.globalAlpha = 1;
    c.fillStyle = `rgba(255,236,206,${0.85 * lerp(0.5, 1, ck)})`; c.beginPath(); ell(cx - L[0] * rx * 0.42 + look[0] * rx * 0.05, cy + ry * 0.36 + look[1] * ry * 0.04, rx * 0.15 * ck, ry * 0.12 * ck)(c); c.fill();
    c.restore();
  }
  // The upper lid as a felt piece in the face's colour lying over the ball: a dome lit across its top toward the key and rolling
  // darker into the lash line, its cut edge traced around the top of the eye, so a closing eye keeps the eye's whole round
  // silhouette with the lid visibly covering part of it. The outline fades as the eye shuts fully (a shut eye is the face, a soft lid
  // bulge and its lash line).
  const lidA = ss(0.05, 0.3, cv), lidO = lidA * (1 - 0.72 * ss(0.8, 1, cover));
  if (lidA > 0.01) { const rgb = E.socketRGB || '26,30,8', y0 = edgeY(0), top = cy - ry * 1.04, hk = clamp(G.L.k * 1.4);
    c.save(); c.beginPath(); ell(cx, cy, rx * 1.03, ry * 1.04)(c); c.clip(); c.beginPath(); lidPath(c); c.clip();
    let g = c.createLinearGradient(0, top, 0, y0); g.addColorStop(0, `rgba(${rgb},${0.1 * lidA})`); g.addColorStop(0.3, `rgba(255,242,214,${0.16 * lidA * hk})`);
    g.addColorStop(0.62, `rgba(255,242,214,${0.05 * lidA * hk})`); g.addColorStop(1, `rgba(${rgb},${0.34 * lidA})`); c.fillStyle = g; c.fillRect(cx - rx * 1.5, top - ry * 0.1, rx * 3, y0 - top + ry * 0.2);
    const lx = cx + L[0] * rx * 0.35, ly = lerp(top, y0, 0.32) + L[1] * ry * 0.15, rg = c.createRadialGradient(lx, ly, 0, lx, ly, rx * 0.8);
    rg.addColorStop(0, `rgba(255,244,220,${0.16 * lidA * hk})`); rg.addColorStop(1, 'rgba(255,244,220,0)'); c.fillStyle = rg; c.fillRect(cx - rx * 1.5, top - ry * 0.1, rx * 3, y0 - top + ry * 0.2);
    c.restore();
    if (lidO > 0.02) { // the lid's cut edge around the top of the eye (only above the lash line), a hair of light along its upper side
      c.save(); c.beginPath(); lidPath(c); c.clip(); c.lineWidth = Math.max(0.16, 0.085 * rx) * ls; c.lineCap = 'round';
      const og = c.createLinearGradient(0, cy - ry, 0, y0); og.addColorStop(0, `rgba(${rgb},${0.22 * lidO})`); og.addColorStop(1, `rgba(${rgb},${0.62 * lidO})`);
      c.beginPath(); c.ellipse(cx, cy, rx * 1.0, ry * 1.0, 0, PI * 1.02, PI * 1.98); c.strokeStyle = og; c.stroke();
      c.restore(); } }
  c.save(); c.beginPath(); ell(cx, cy, rx * 1.12, ry * 1.1)(c); c.clip();
  if (lo) { c.beginPath(); ribbonPath(c, lo.slice(5, 21), taper(0.02, 0.3 * ls, 0.04)); c.fillStyle = E.crease || 'rgba(34,22,8,0.5)'; c.globalAlpha = 0.45 * ss(0.05, 0.4, lowerAmt) * (1 - ss(0.6, 0.9, cover)); c.fill(); c.globalAlpha = 1; }
  // faint lower rim while open
  if (wide > 0.02 && lowerAmt < 0.6) { const lr = []; for (let i = 0; i <= 16; i++) { const a = lerp(0.18, 0.82, i / 16) * PI; lr.push([cx - Math.cos(a) * rx * 0.98 * sd, cy + Math.sin(a) * ry * 1.0]); }
    c.beginPath(); ribbonPath(c, lr, taper(0.02, 0.22 * ls, 0.02)); c.fillStyle = `rgba(14,10,4,${0.22 * wide})`; c.fill(); }
  c.restore();
  // lash line along the lid edge: tapered, heaviest toward the outer corner; a light rim just above it where the lid catches light
  const lash = edge(-1.0, 1.06), lw = ls * lerp(0.42, 0.58, cv);
  c.save(); c.beginPath(); ribbonPath(c, lash, u => lerp(0.1, 1, ss(0, 0.55, u)) * lw * (1 - 0.45 * ss(0.85, 1, u)) + 0.02); c.fillStyle = E.crease || 'rgba(34,22,8,0.9)'; c.globalAlpha = lerp(0.82, 1, cv); c.fill();
  c.globalAlpha = 0.14 * ss(0.2, 0.7, cv); c.beginPath(); ribbonPath(c, lash.map(([x, y]) => [x, y - lw * 0.9]).slice(4, -3), taper(0.02, 0.26 * ls, 0.02)); c.fillStyle = 'rgb(255,240,206)'; c.fill(); c.globalAlpha = 1;
  // lash flicks at the outer corner: up and out when open, down and out when the lid is shut and relaxed, up when it is a happy arc
  const nl = E.lashes ?? 0;
  for (let k = 0; k < nl; k++) { const u0 = 0.98 - k * 0.22, p0 = [X(u0), edgeY(u0)], dirY = lerp(-1, lerp(0.75, -0.6, arcK), cv), len = ry * (0.42 - 0.08 * k) * ls * (nl > 1 ? 1 : 0.8);
    const p2 = [p0[0] + sd * len * (0.85 - 0.2 * k), p0[1] + dirY * len * (0.55 + 0.15 * k)], p1 = [lerp(p0[0], p2[0], 0.55) + sd * len * 0.05, lerp(p0[1], p2[1], 0.15)];
    c.beginPath(); ribbonPath(c, quadPts(p0, p1, p2, 10), u => lerp(lw * 0.95, 0.02, u)); c.fillStyle = E.crease || 'rgba(34,22,8,0.9)'; c.fill(); }
  // crease above the open lid
  if (wide > 0.05 && cv < 0.6) { const cr = edge(-0.55, 0.95, 16).map(([x, y]) => [x, y - ry * 0.34]); c.beginPath(); ribbonPath(c, cr, taper(0.02, 0.24 * ls, 0.02, 0.6)); c.fillStyle = E.crease || 'rgba(34,22,8,0.9)'; c.globalAlpha = 0.16 * wide * (1 - cv); c.fill(); c.globalAlpha = 1; }
  c.restore();
}
// brow: a tapered felt stroke from the inner end (x0, y0) to the outer end (x1, y1), arched by `arch`: fullest just past the inner
// end, sweeping to a fine point outward; a soft drop shadow under it and a light rim along its top.
function brow(G, B) {
  const c = G.c, { x0, y0, x1, y1, arch, w, col, shadow } = B, mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - arch;
  const pts = quadPts([x0, y0], [mx, my], [x1, y1], nseg(G, Math.abs(x1 - x0) * 1.2, 3, 14, 48));
  const wf = u => w * 1.25 * (u < 0.16 ? 0.5 + 0.5 * Math.sin(HALFPI * u / 0.16) : lerp(1, 0.14, ((u - 0.16) / 0.84) ** 1.3));
  c.save();
  c.beginPath(); ribbonPath(c, pts.map(([x, y]) => [x + 0.18, y + 0.42]), wf); c.fillStyle = shadow || 'rgba(10,14,0,0.3)'; c.fill();
  c.beginPath(); ribbonPath(c, pts, wf); c.fillStyle = col; c.fill();
  c.beginPath(); ribbonPath(c, pts.map(([x, y]) => [x, y - w * 0.26]), u => wf(u) * 0.34); c.fillStyle = 'rgba(255,240,200,0.2)'; c.fill();
  c.restore(); }
const OPEN_DEF = { smile: 0.15, flat: 0, o: 0.6, yawn: 0.85, grit: 0.7, laugh: 0.75, frown: 0 };
// mouth centred at (cx, cy), width w. Shapes: smile flat o yawn grit laugh frown. Closed mouths are tapered lines with small corner
// creases; open ones are clean filled shapes with a dark inner gradient, a tongue, upper teeth where the mouth is wide open, a lip
// outline and a soft lower-lip highlight. A smile opens continuously: the line fades into the open shape as mouthOpen grows.
function mouth(G, kind, open, cx, cy, w, o = {}) {
  const c = G.c, h = w / 2, lw = o.lw || 0.5; open = clamp(open);
  const lipc = o.lip || G.lit([92, 30, 22], cx, cy, 0.12, 0.92), creaseC = o.crease || 'rgba(70,24,16,0.42)', n = nseg(G, w * 1.3, 2.5, 16, 64);
  const tong = G.lit([226, 98, 104], cx, cy + w * 0.2, 0.35), teeth = G.lit([248, 240, 222], cx, cy, 0.22);
  const innerFill = (y0, y1) => lin(G, cx, y0, cx, y1, [[0, [34, 8, 14], 0.08], [0.6, o.dark || [72, 18, 26], 0.2], [1, [110, 34, 40], 0.28]]);
  const strokeLine = (pts, wid, col = lipc) => { c.beginPath(); ribbonPath(c, pts, taper(wid * 0.16, wid, wid * 0.16)); c.fillStyle = col; c.fill(); };
  const tick = (sx, x, y, dx, dy, a = 1) => { c.beginPath(); ribbonPath(c, quadPts([x, y], [x + sx * dx, y + dy * 0.35], [x + sx * dx * 0.55, y + dy], 10), taper(0.02, lw * 0.62, 0.02, 0.4)); c.globalAlpha = a; c.fillStyle = creaseC; c.fill(); c.globalAlpha = 1; };
  const lowerLip = (pts, a = 0.2) => { c.beginPath(); ribbonPath(c, pts.map(([x, y]) => [x, y + lw * 1.25]), taper(0.02, lw * 0.9, 0.02)); c.fillStyle = `rgba(255,236,214,${a})`; c.fill();
    c.beginPath(); ribbonPath(c, pts.map(([x, y]) => [x, y + lw * 2.6]), taper(0.02, lw * 0.8, 0.02)); c.fillStyle = `rgba(40,14,8,${a * 0.6})`; c.fill(); };
  // open mouth from two corner points, the depth of the upper edge and of the lower edge (control heights of two cubic curves)
  const openShape = (Lc, Rc, topC, botC, botSpread = 0.2) => {
    const topE = cubPts(Lc, [lerp(Lc[0], cx, 0.5), topC], [lerp(Rc[0], cx, 0.5), topC], Rc, n), botE = cubPts(Rc, [lerp(Rc[0], cx, botSpread), botC], [lerp(Lc[0], cx, botSpread), botC], Lc, n, true);
    return { topE, botE, path: k => { k.moveTo(topE[0][0], topE[0][1]); for (const p of topE) k.lineTo(p[0], p[1]); for (const p of botE) k.lineTo(p[0], p[1]); k.closePath(); } }; };
  const paintOpen = (S, o2) => { const ys = S.botE.map(p => p[1]), yb = Math.max(...ys), yt = Math.min(...S.topE.map(p => p[1])), dep = yb - yt;
    c.beginPath(); S.path(c); c.fillStyle = innerFill(yt, yb); c.fill();
    c.save(); c.beginPath(); S.path(c); c.clip();
    // throat shadow at the back, the tongue on the floor of the mouth, upper teeth along the top edge
    const tg = c.createRadialGradient(cx, yt + dep * 0.25, 0, cx, yt + dep * 0.25, Math.max(h * 0.6, dep * 0.6)); tg.addColorStop(0, 'rgba(10,0,4,0.55)'); tg.addColorStop(1, 'rgba(10,0,4,0)'); c.fillStyle = tg; c.fillRect(cx - h * 1.2, yt - 1, h * 2.4, dep + 2);
    if (o2.tongue > 0) { const tw = h * o2.tongue, th = Math.max(dep * 0.42, lw); c.beginPath(); ell(cx + h * 0.05, yb - th * 0.35, tw, th)(c); c.fillStyle = tong; c.fill();
      c.beginPath(); c.moveTo(cx + h * 0.05, yb - th * 1.05); c.quadraticCurveTo(cx + h * 0.08, yb - th * 0.6, cx + h * 0.05, yb - th * 0.25); c.strokeStyle = 'rgba(120,30,40,0.45)'; c.lineWidth = lw * 0.35; c.lineCap = 'round'; c.stroke();
      c.beginPath(); ell(cx - tw * 0.3, yb - th * 0.75, tw * 0.3, th * 0.18, -0.2)(c); c.fillStyle = 'rgba(255,220,220,0.25)'; c.fill(); }
    if (o2.teeth > 0) { const tH = Math.min(dep * 0.3, w * 0.085) * o2.teeth, band = S.topE.slice(Math.round(n * 0.12), Math.round(n * 0.88) + 1);
      c.beginPath(); smoothOpen(c, band.map(([x, y]) => [x, y - lw])); smoothOpen(c, band.slice().reverse().map(([x, y]) => [x, y + tH]), false); c.closePath(); c.fillStyle = teeth; c.fill();
      const sg = c.createLinearGradient(0, yt, 0, yt + tH * 1.6); sg.addColorStop(0, 'rgba(60,20,20,0.3)'); sg.addColorStop(1, 'rgba(60,20,20,0)'); c.fillStyle = sg; c.fill(); }
    c.restore();
    c.save(); c.lineJoin = 'round'; c.beginPath(); S.path(c); c.strokeStyle = lipc; c.lineWidth = lw * 0.85; c.stroke(); c.restore();
    lowerLip(S.botE.slice(Math.round(n * 0.25), Math.round(n * 0.75)), 0.16); };
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  if (kind === 'flat') { const p = cubPts([cx - h * 0.8, cy + w * 0.01], [cx - h * 0.3, cy + w * 0.05], [cx + h * 0.3, cy - w * 0.025], [cx + h * 0.8, cy], n);
    strokeLine(p, lw * 1.15); tick(1, cx + h * 0.8, cy - w * 0.01, w * 0.05, w * 0.06, 0.6); lowerLip(p.slice(Math.round(n * 0.3), Math.round(n * 0.7)), 0.12); }
  else if (kind === 'frown') { const f = w * 0.17, p = cubPts([cx - h * 0.82, cy + f * 0.6], [cx - h * 0.36, cy - f * 0.8], [cx + h * 0.36, cy - f * 0.8], [cx + h * 0.82, cy + f * 0.6], n);
    strokeLine(p, lw * 1.25); for (const sx of [-1, 1]) tick(sx, cx + sx * h * 0.82, cy + f * 0.55, w * 0.05, w * 0.07, 0.7);
    const pout = cubPts([cx - h * 0.3, cy + f * 0.75], [cx - h * 0.12, cy + f * 1.25], [cx + h * 0.12, cy + f * 1.25], [cx + h * 0.3, cy + f * 0.75], 16);
    c.beginPath(); ribbonPath(c, pout, taper(0.02, lw * 0.7, 0.02)); c.fillStyle = 'rgba(70,24,16,0.28)'; c.fill(); }
  else if (kind === 'o' || kind === 'yawn') {
    const yawn = kind === 'yawn', rx = w * (yawn ? 0.2 + 0.14 * open : 0.12 + 0.11 * open), ry = w * (yawn ? 0.16 + 0.42 * open : 0.14 + 0.2 * open), my = cy + ry * (yawn ? 0.3 : 0.35);
    const m = Math.max(n, 28), ring = []; for (let i = 0; i < m; i++) { const a = i / m * TAU, s = sin(a); ring.push([cx + rx * cos(a) * (1 + (yawn ? 0.12 : 0.06) * s), my + ry * s * (1 + (yawn ? 0.04 : 0) * s)]); }
    const path = k => smoothPoly(k, ring);
    c.beginPath(); path(c); c.fillStyle = innerFill(my - ry, my + ry); c.fill();
    c.save(); c.beginPath(); path(c); c.clip();
    const tg = c.createRadialGradient(cx, my - ry * 0.35, 0, cx, my - ry * 0.35, ry * 0.9); tg.addColorStop(0, 'rgba(10,0,4,0.5)'); tg.addColorStop(1, 'rgba(10,0,4,0)'); c.fillStyle = tg; c.fillRect(cx - rx * 1.3, my - ry * 1.2, rx * 2.6, ry * 2.4);
    c.beginPath(); ell(cx, my + ry * (yawn ? 0.66 : 0.72), rx * (yawn ? 0.86 : 0.78), ry * (yawn ? 0.5 : 0.5))(c); c.fillStyle = tong; c.fill();
    c.beginPath(); ell(cx - rx * 0.25, my + ry * 0.48, rx * 0.25, ry * 0.08, -0.2)(c); c.fillStyle = 'rgba(255,220,220,0.22)'; c.fill();
    c.restore();
    c.beginPath(); path(c); c.strokeStyle = lipc; c.lineWidth = lw * 1.05; c.stroke();
    const lo = []; for (let i = 0; i <= 16; i++) { const a = lerp(0.22, 0.78, i / 16) * PI; lo.push([cx + rx * cos(a) * 1.04, my + ry * sin(a) * 1.04]); } lowerLip(lo, 0.2);
    const up = []; for (let i = 0; i <= 12; i++) { const a = lerp(1.3, 1.7, i / 12) * PI; up.push([cx + rx * cos(a), my + ry * sin(a) - lw * 1.6]); }
    c.beginPath(); ribbonPath(c, up, taper(0.02, lw * 0.7, 0.02)); c.fillStyle = 'rgba(70,24,16,0.22)'; c.fill(); }
  else if (kind === 'grit') { const gw = w * 0.52, gh = w * (0.13 + 0.12 * open), Lc = [cx - gw, cy + gh * 0.25], Rc = [cx + gw, cy + gh * 0.25];
    const S = openShape(Lc, Rc, cy - gh * 1.15, cy + gh * 1.55, 0.12);
    c.beginPath(); S.path(c); c.fillStyle = teeth; c.fill();
    c.save(); c.beginPath(); S.path(c); c.clip();
    const sg = c.createLinearGradient(0, cy - gh, 0, cy + gh * 1.4); sg.addColorStop(0, 'rgba(70,30,30,0.35)'); sg.addColorStop(0.3, 'rgba(70,30,30,0)'); sg.addColorStop(0.7, 'rgba(70,30,30,0)'); sg.addColorStop(1, 'rgba(70,30,30,0.3)'); c.fillStyle = sg; c.fillRect(cx - gw * 1.2, cy - gh * 1.6, gw * 2.4, gh * 3.4);
    const mid = cubPts(Lc, [cx - gw * 0.4, cy + gh * 0.32], [cx + gw * 0.4, cy + gh * 0.32], Rc, 24);
    c.beginPath(); ribbonPath(c, mid, taper(0.05, gh * (0.12 + 0.3 * open), 0.05)); c.fillStyle = 'rgba(46,12,18,0.85)'; c.fill();
    c.strokeStyle = 'rgba(120,90,70,0.38)'; c.lineWidth = lw * 0.32; c.beginPath();
    for (const k of [-0.62, -0.3, 0, 0.3, 0.62]) { const x = cx + k * gw; c.moveTo(x + k * 0.1, cy - gh * 1.0); c.quadraticCurveTo(x, cy - gh * 0.3, x - k * 0.05, cy + gh * 0.15); c.moveTo(x - k * 0.05, cy + gh * 0.55); c.quadraticCurveTo(x, cy + gh * 1.0, x + k * 0.12, cy + gh * 1.5); }
    c.stroke(); c.restore();
    c.save(); c.beginPath(); S.path(c); c.strokeStyle = lipc; c.lineWidth = lw * 1.05; c.stroke(); c.restore();
    for (const sx of [-1, 1]) tick(sx, cx + sx * (gw + lw * 0.2), cy + gh * 0.1, w * 0.06, w * 0.1, 0.75); }
  else { // smile and laugh share a shape; laugh is wider, curls higher and opens deeper
    const laugh = kind === 'laugh', curl = w * (laugh ? 0.15 : 0.12), hw = h * (laugh ? 1.04 : 1), Lc = [cx - hw, cy - curl], Rc = [cx + hw, cy - curl];
    const lineA = laugh ? 0 : 1 - ss(0.06, 0.22, open), openA = laugh ? 1 : ss(0.04, 0.16, open);
    if (openA > 0.01) { const dep = w * (laugh ? 0.2 + 0.72 * open : 0.08 + 0.62 * open), S = openShape(Lc, Rc, cy - curl + w * 0.11, cy - curl + dep + w * 0.05, 0.22);
      c.save(); c.globalAlpha = openA; paintOpen(S, { tongue: 0.62, teeth: ss(0.3, 0.6, open) }); c.restore(); }
    if (lineA > 0.01) { const p = cubPts(Lc, [cx - hw * 0.45, cy + w * 0.17], [cx + hw * 0.45, cy + w * 0.17], Rc, n); c.save(); c.globalAlpha = lineA; strokeLine(p, lw * 1.2); lowerLip(p.slice(Math.round(n * 0.3), Math.round(n * 0.7)), 0.14); c.restore(); }
    for (const sx of [-1, 1]) tick(sx, cx + sx * (hw + w * 0.035), cy - curl - w * 0.05, w * 0.05, w * 0.12, laugh ? 0.75 : 0.6);
  }
  c.restore();
}


// ---------- shared small helpers ----------
const autoBlink = (t, seed = 0) => { const per = 3.3 + hash(seed, 1) * 0.8, tt = t + hash(seed, 2) * per, n = Math.floor(tt / per), k = (tt - n * per);
  const dbl = hash(n, seed + 5) > 0.72 ? 0.34 : 0; let b = 0; if (k < 0.16) b = sin(PI * k / 0.16); else if (dbl && k > dbl && k < dbl + 0.16) b = sin(PI * (k - dbl) / 0.16); return b; };
// 2-bone IK in the plane. Returns elbow point; bend picks the side (+1/-1)
function ik2(sx, sy, tx, ty, l1, l2, bend, mk = 0.995) {
  const dx = tx - sx, dy = ty - sy, d = hyp(dx, dy), dm = Math.max(0.02, Math.min(d, (l1 + l2) * mk));
  const a = atan2(dy, dx), cA = clamp((l1 * l1 + dm * dm - l2 * l2) / (2 * l1 * dm), -1, 1), A = Math.acos(cA) * bend;
  const ex = sx + cos(a + A) * l1, ey = sy + sin(a + A) * l1, k = dm / (d || 1);
  return { ex, ey, hx: sx + dx * k, hy: sy + dy * k }; }
// soft contact shadow on the ground plane
function groundShadow(c, G, x, gy, rx, ry, a) { const L = G.L; c.save(); c.translate(x - L.dx * (rx * 0.18 * L.k), gy); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(2,4,14,${a})`); g.addColorStop(0.55, `rgba(2,4,14,${a * 0.55})`); g.addColorStop(1, 'rgba(2,4,14,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore(); }
// How flat the ground plane looks from this camera: depth on the ground projects to (camera height / distance) of its size on screen.
// Read from the item transform (screen row of the frame centre gives the camera height in world units at this depth); the distance
// assumes the film's usual lens (2400 px per unit at distance 1). Called at the start of a draw, before any local transform.
function groundPersp(c, s, gy) { const m = c.getTransform(), sc = hyp(m.c, m.d) || s, camY = (P.H / 2 - m.f) / sc;
  return clamp((gy - camY) * s / 2400, 0.05, 0.6); }
// Contact shadow under one foot resting on (or lifted above) the ground at gy: a soft penumbra pad plus a thin dark occlusion core
// right along the contact line. x0..x1 is the part of the sole nearest the ground, hgt how high that part is above gy. The foot is
// drawn over it, so the core shows as a crisp dark seam where sole meets ground and fades as the foot lifts.
function contactShadow(c, G, x0, x1, gy, hgt, pf, a = 1) {
  const h = Math.max(0, hgt), k = Math.exp(-h / 2.4) * a; if (k < 0.02) return;
  const L = G.L, len = Math.abs(x1 - x0) / 2, mx = (x0 + x1) / 2, spread = 1 + h * 0.22;
  const rx = len * 1.2 * spread + 0.9, ry = Math.max(0.45, rx * pf * 0.9);
  c.save(); c.translate(mx - L.dx * 0.35 * L.k * (1 + h * 0.3), gy); c.scale(1, ry / rx);
  let g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(2,4,14,${0.5 * k})`); g.addColorStop(0.55, `rgba(2,4,14,${0.26 * k})`); g.addColorStop(1, 'rgba(2,4,14,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore();
  const kc = k * Math.exp(-h / 0.45); if (kc < 0.02) return;
  const rx2 = len * 1.04 + 0.25, ry2 = Math.max(0.24, rx2 * pf * 0.42);
  c.save(); c.translate(mx, gy + ry2 * 0.1); c.scale(1, ry2 / rx2);
  g = c.createRadialGradient(0, 0, 0, 0, 0, rx2); g.addColorStop(0, `rgba(1,2,8,${0.9 * kc})`); g.addColorStop(0.72, `rgba(1,2,8,${0.62 * kc})`); g.addColorStop(1, 'rgba(1,2,8,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx2, 0, TAU); c.fill(); c.restore(); }
// contact zone of a world-space outline: the x range of points within `band` of its lowest point, and that lowest y
function contactZone(pts, band = 0.3) { let my = -1e9; for (const p of pts) if (p[1] > my) my = p[1];
  let x0 = 1e9, x1 = -1e9; for (const p of pts) if (p[1] > my - band) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; } return { x0, x1, y: my }; }
const range = (a, b, n, f) => { const out = []; for (let k = 0; k <= n; k++) out.push(f(lerp(a, b, k / n))); return out; };
const H = { mul, apply, inv, T, Rt, Sc, chain, mkG, lin, rad, blob, ell, capsule, leafPath, felt, hairs, flecks, stitch, eye, brow, mouth, crescent, ik2, autoBlink, groundShadow, frac, OPEN_DEF,
  smoothOpen, smoothPoly, ribbonPath, taper, quadPts, cubPts, tube, ptsShape, contactShadow, contactZone, groundPersp };
C._h = H;

// =====================================================================================================================
// PIP
// =====================================================================================================================
const PC = { headTop: [92, 156, 52], headMid: [122, 170, 56], headLow: [150, 176, 58], bellyTop: [92, 154, 52], bellyMid: [112, 162, 54], bellyHi: [150, 166, 54], bellyLow: [214, 148, 54],
  patch: [248, 231, 184], patchLow: [236, 206, 150], arm: [112, 158, 56], mitt: [232, 168, 66], leg: [176, 112, 50], boot: [178, 88, 40], cuff: [214, 142, 72], sole: [88, 48, 30],
  leaf: [64, 138, 62], leafHi: [112, 178, 74], vein: [176, 212, 118], sprout: [142, 198, 78], cheek: [242, 112, 90], brow: [78, 66, 22], tin: [172, 184, 196] };
const MOUTHS = ['smile', 'flat', 'o', 'yawn', 'grit', 'laugh', 'frown'];
const PS = 0.93;   // overall Pip scale so feet-to-head stays about 40 units
function normPip(q, t) {
  const p = Object.assign({}, q);
  p.x = q.x ?? 0; p.y = q.y ?? 0; p.z = q.z ?? 400; p.face = (q.face ?? 1) >= 0 ? 1 : -1; p.lean = q.lean ?? 0; p.squash = clamp(q.squash ?? 1, 0.5, 1.6); p.headTilt = q.headTilt ?? 0;
  p.eyes = q.eyes ?? 1; p.look = q.look ?? [0, 0]; p.brow = q.brow ?? 0.25; p.mouth = MOUTHS.includes(q.mouth) ? q.mouth : 'smile';
  p.mouthOpen = q.mouthOpen ?? OPEN_DEF[p.mouth]; p.breath = q.breath ?? t * 0.32;
  p.blink = clamp((q.blink ?? 0) + (q.autoBlink === false ? 0 : autoBlink(t, q.blinkSeed ?? 3)));
  p.stride = q.stride ?? 8; p.sit = q.sit ?? 0; p.onBack = q.onBack ?? 0; p.tiptoe = q.tiptoe ?? 0; p.walk = q.walk ?? null; p.vel = q.vel ?? [0, 0];
  p.run = clamp(q.run ?? 0);
  p.yaw = clamp(q.yaw ?? (p.walk != null ? 0.85 : 0.3));   // 0 frontal .. 1 three-quarter toward `face`
  return p;
}
const BELLY_PTS = [[0, -23.5], [7.0, -21.6], [11.8, -15], [13.8, -7.6], [12.2, -0.6], [8.0, 3.4], [0, 4.6], [-8.0, 3.4], [-12.2, -0.6], [-13.8, -7.6], [-11.8, -15], [-7.0, -21.6]];
const headPts = ax => [[ax, -19.6], [ax + 3.6, -18.8], [ax + 7.0, -15.4], [10.9, -10.2], [13.0, -3.8], [13.2, 1.6], [10.6, 5.4], [5.4, 6.9], [-0.2, 7.1], [-6.2, 6.5], [-11.2, 3.6], [-13.2, -1.6], [-12.8, -7.0], [-10.4, -12.2], [-6.2, -16.6], [ax - 3.4, -18.8]];
const BELLY_SAMP = blob(BELLY_PTS).sample(5).map(q => [q.x, q.y]);
// ---- fall onto the back (onBack 0..1). The body tips back about 60 degrees and comes to rest with the lowest point of its outline
// (back of the belly or of the head) exactly on the ground; the head counter-rotates half the body angle so the face stays readable;
// the legs swing up, kick at about 0.75 and flop a little as he lands, knees bent and boots in the air, soles to the sky; the arms
// fling up and out. From the moment the body lands (0.86) it squashes flat against the ground (impact) and recovers by 1.
const FALL = { th: -1.05, back: -6.5 };
const fallK = ob => ({ rot: ss(0, 0.86, ob), drop: Math.pow(clamp(ob / 0.86), 1.7), legs: ss(0.2, 0.68, ob), arms: ss(0.02, 0.5, ob),
  kick: P.bump(0.74, 0.16, ob), imp: ob > 0.86 && ob < 1 ? sin(PI * (ob - 0.86) / 0.14) : 0 });
const PIP_L1 = 3.7, PIP_L2 = 3.5, PIP_MITT = 2.0, PIP_THIGH = 2.6, PIP_SHIN = 2.6;
const pipSho = (i, yaw) => i === 0 ? [lerp(11.0, 5.8, yaw), -9.2] : [lerp(-11.6, -12.8, yaw), -9.0];
// ---- boot: outline in the ankle frame (+x toward the toe, +y down). The sole is flat on y = SOLE between the heel pivot and the
// ball of the foot (the toe pivot); toe cap and heel curve up from there. Sampled once, 20 points per cubic piece.
const SOLE = 6.4, HEEL = [-2.4, SOLE], TOE = [4.4, SOLE];
const BOOT_PTS = (() => { const segs = [
  [[-3.3, -0.35], [-1.2, -1.0], [1.2, -1.0], [3.3, -0.35]], [[3.3, -0.35], [3.55, -0.28], [3.62, -0.1], [3.62, 0.2]],
  [[3.62, 0.2], [3.7, 1.0], [3.6, 1.9], [4.1, 2.7]], [[4.1, 2.7], [4.7, 3.3], [6.2, 3.25], [6.85, 4.3]],
  [[6.85, 4.3], [7.3, 5.0], [6.9, 5.75], [6.0, 6.15]], [[6.0, 6.15], [5.5, 6.35], [5.0, SOLE], TOE],
  [TOE, [2.1, SOLE], [-0.1, SOLE], HEEL], [HEEL, [-3.1, SOLE], [-3.75, 6.1], [-3.95, 5.3]],
  [[-3.95, 5.3], [-4.15, 4.3], [-3.65, 3.0], [-3.65, 2.0]], [[-3.65, 2.0], [-3.65, 1.0], [-3.62, 0.3], [-3.6, 0.0]],
  [[-3.6, 0.0], [-3.58, -0.2], [-3.5, -0.32], [-3.3, -0.35]]];
  const out = []; for (const s of segs) out.push(...cubPts(s[0], s[1], s[2], s[3], 20, true)); return out; })();
// One boot placed on the leg frame (Pip's root frame R, ground at y = 0). gx is the ground point under the ankle when the foot is
// flat, gy the height of the sole there (0 planted, negative when lifted), a the foot angle (+ toe down / heel up, - toe up),
// q the sole squash. The foot turns about the heel when a < 0 (heel strike) and about the ball of the foot when a > 0 (toe-off,
// tiptoe); the felt bends at the ball, so the toe cap stays flat on the ground while the heel lifts. A planted foot is then moved
// so its lowest point lies exactly on the ground; a lifted foot is only ever pushed up, never into the ground.
function pipBoot(gx, gy, a, q, planted, fix) {
  const piv = a < 0 ? HEEL : TOE, ca = cos(a), sa = sin(a), bend = a > 0 ? a : 0;
  const mp = (x, y) => { let px = x * (1 + 0.3 * q * clamp((SOLE - y) / SOLE)), py = SOLE + (y - SOLE) * (1 - q);
    if (bend > 0) { const w = bend * ss(TOE[0] - 1.1, TOE[0], px); if (w > 0) { const dx = px - TOE[0], dy = py - TOE[1], cw = cos(w), sw = sin(w); px = TOE[0] + cw * dx + sw * dy; py = TOE[1] - sw * dx + cw * dy; } }
    const dx = px - piv[0], dy = py - piv[1]; return [gx + piv[0] + ca * dx - sa * dy, gy - SOLE + piv[1] + sa * dx + ca * dy]; };
  const out = BOOT_PTS.map(([x, y]) => mp(x, y)); let my = -1e9; for (const p of out) if (p[1] > my) my = p[1];
  const dy = !fix ? 0 : planted ? -my : Math.min(0, -my); if (dy) for (const p of out) p[1] += dy;
  return { map: (x, y) => { const r = mp(x, y); r[1] += dy; return r; }, out, a, q, planted, low: my + dy };
}
function pipRig(p, t) {
  const face = p.face, br = sin(p.breath * TAU), sit = p.sit, ob = p.onBack, tip = p.tiptoe, walking = p.walk != null, ph = walking ? p.walk : 0, st = p.stride, yaw = p.yaw;
  const R = chain(T(p.x, p.y), Sc(face, 1), Sc(PS)), fk = ob > 0 ? fallK(ob) : null;
  // ---- gait. ph is the cycle phase (0..1, the right foot strikes at 0, the left at 0.5); the body covers 2 * stride (local units)
  // per cycle, so a foot on the ground moves back at exactly that rate in the body frame and stays put in the world.
  // Walk: each foot is down 58% of the cycle (a short double support). Run (p.run -> 1): down 36%, so there is a flight phase with
  // both feet off the ground, a higher knee-and-heel swing and more lean. Body height follows the classic walk: contact, down
  // (lowest, weight lands), passing, up (highest, push-off); a run is lowest at mid-stance and highest in flight.
  const run = walking ? p.run : 0, beta = lerp(0.58, 0.36, run), sp = frac(2 * ph), kS = clamp(st / 8, 0.3, 1.3);
  const riseN = s2 => lerp(sin(TAU * (s2 - 0.47)), -cos(TAU * (s2 - beta)), run);                   // -1 lowest .. 1 highest
  const riseA = lerp(1.15 * kS, 1.35 * clamp(st / 14, 0.5, 1.2), run), rise = walking ? riseN(sp) * riseA : 0;
  const wsq = walking ? 1 + riseN(sp) * lerp(0.035, 0.075, run) : 1, sq = p.squash * wsq, sx = 1 / sqrt(sq);
  // ---- feet (root frame R; ground at y = 0) ----
  const fix = ob < 0.05, a0 = lerp(-0.26, -0.06, run), aT = lerp(0.62, 0.72, run);
  const feet = [0, 1].map(i => {
    const rest = i === 0 ? 4.0 : -4.0; let gx = rest, gy = 0, a = 0, q = 0.035, planted = true;
    if (walking) { const u = frac(ph + 0.5 * i), xf = rest + st * beta, xb = rest - st * beta;
      if (u < beta) { const s = u / beta; gx = xf - 2 * st * u;                                     // stance: locked to the ground
        a = a0 * (1 - ss(0, 0.24, s)) + aT * ss(lerp(0.58, 0.42, run), 1, s);                       // heel strike, flat, heel lifts (toe-off)
        q = 0.03 + lerp(0.06, 0.1, run) * P.bump(0.1, 0.09, s); }                                   // the sole squashes as weight lands
      else { const s = (u - beta) / (1 - beta); planted = false; q = -0.015;                        // swing: arc forward, toe trails then heel leads
        gx = lerp(xb, xf, lerp(ss(0, 1, s), ss(0.18, 1, s), run));
        gy = -lerp(2.5 * clamp(st / 8, 0.35, 1.3), 4.6 * clamp(st / 14, 0.6, 1.3), run) * sin(PI * Math.pow(s, lerp(0.85, 0.62, run)));
        const aMid = lerp(0.2, 1.0, run); a = s < 0.42 ? lerp(aT, aMid, ss(0, 0.42, s)) : lerp(aMid, a0, ss(0.45, 1, s)); } }
    else a = 0.62 * clamp(tip);                                                                      // tiptoe: up on the balls of the feet
    if (sit > 0) { const as = -1.42, z0 = pipBoot(0, 0, as, 0, true, true).map(0, 0), tx = i === 0 ? 8.8 : 4.4;  // seated: legs out, resting on the heels
      gx = lerp(gx, tx - z0[0], sit); a = lerp(a, as, sit); gy = lerp(gy, 0, sit); if (sit > 0.5) planted = true; }
    const bt = pipBoot(gx, gy, a, q, planted, fix);
    return Object.assign(bt, { gx, gy, ankle: bt.map(0, 0), top: bt.map(0, 0.7), foot: [gx, planted ? 0 : gy], lift: planted ? 0 : clamp(-gy / 2.5) });
  });
  const tipRise = walking ? 0 : -((feet[0].ankle[1] + feet[1].ankle[1]) / 2 + SOLE) * (1 - sit);
  const hipH = lerp(13.2 * (0.55 + 0.45 * sq), 4.6 * sq * (1 + 0.016 * br), ss(0, 1, sit)) + tipRise - 1.4 * run;   // a run crouches a little, knees bent
  const lean = p.lean + (walking ? lerp(0.05 + 0.015 * sin(TAU * sp), 0.2 + 0.03 * riseN(sp - 0.1), run) : 0);
  const surge = walking ? -0.22 * kS * sin(TAU * (sp - 0.1)) : 0;
  const bodyS = Sc(sx * (1 + 0.012 * br), sq * (1 + 0.016 * br));
  // head: lags the body a touch (a small counter-bob) and nods with each step
  const headDY = walking ? 0.3 * riseA * riseN(sp - 0.09) : 0;
  const hlag = walking ? lerp(0.03, 0.05, run) * sin(TAU * (sp - 0.62)) - 0.05 * run : 0.012 * sin(t * 1.3);
  let Bl = chain(T(surge, -hipH - rise), Rt(lean), bodyS), hc = 0;
  if (fk) { // lying back: find the height at which the lowest point of belly and head touches the ground, then drop toward it
    const th = FALL.th * fk.rot, bx = FALL.back * fk.rot; hc = -0.5 * th + 0.12 * fk.imp;
    const B0 = chain(T(bx, 0), Rt(lean + th), bodyS), H0 = chain(B0, T(0, -12 + headDY), Rt(p.headTilt + hlag + hc)), ax0 = 0.9 + 1.5 * yaw;
    let low = -1e9; for (const q of BELLY_SAMP) low = Math.max(low, apply(B0, q[0], q[1])[1]);
    for (const q of headPts(ax0)) low = Math.max(low, apply(H0, q[0], q[1])[1]);
    const by = lerp(-hipH - rise, -low, fk.drop), cx = apply(B0, 0, -6)[0], im = fk.imp;
    Bl = chain(T(cx, 0), Sc(1 + 0.07 * im, 1 - 0.13 * im), T(-cx, 0), T(bx, by), Rt(lean + th), bodyS); }
  const B = mul(R, Bl);
  const Hd = chain(B, T(0, -12 + headDY), Rt(p.headTilt + hlag + hc));
  if (fk) feet.forEach((f, i) => { // legs swing up: boot top above the hip, soles turned to the sky, a kick and a flop on landing
    const hip = apply(Bl, i === 0 ? 3.6 : -3.8, 3.0), kk = fk.kick, lift = fk.legs;
    const tx = hip[0] + (i === 0 ? 4.4 - 0.8 * kk : 3.0 - 0.6 * kk), ty = hip[1] - (i === 0 ? 2.6 : 4.0) - 1.2 * kk;
    const aU = (i === 0 ? -2.05 : -2.35) - 0.35 * kk, a = lerp(f.a, aU, lift), c0 = pipBoot(0, 0, a, 0.02, false, false).map(0, 0.7);
    const gx = lerp(f.gx, tx - c0[0], lift), gy = lerp(f.gy, ty - c0[1], lift);
    const bt = pipBoot(gx, gy, a, 0.02, false, true);
    feet[i] = Object.assign(bt, { gx, gy, ankle: bt.map(0, 0), top: bt.map(0, 0.7), foot: [gx, gy], lift: 1 }); });
  // legs: hip (on the body, swinging forward with its own leg) to the top of the boot, knee bent forward by 2-bone IK
  const legs = feet.map((f, i) => { const hs = walking ? 0.5 * kS * cos(TAU * frac(ph + 0.5 * i)) : 0, hip = apply(Bl, (i === 0 ? 3.6 : -3.8) + hs, lerp(3.0, 0.4, sit));
    const k1 = ik2(hip[0], hip[1], f.top[0], f.top[1], PIP_THIGH, PIP_SHIN, 1), k2 = ik2(hip[0], hip[1], f.top[0], f.top[1], PIP_THIGH, PIP_SHIN, -1), k = fk ? k2 : k1.ex >= k2.ex ? k1 : k2;   // falling: always the same bend side (knee forward standing, up when the legs swing up), so it never flips
    return Object.assign(f, { hip, knee: [k.ex, k.ey] }); });
  // arms (in body frame B): short stubby arms, shoulders tucked under the collar. Walking, each swings opposite its leg a beat late,
  // the forearm drags behind the upper arm and the mitt flops after both (overlapping action).
  const iB = inv(B), swA = walking ? lerp(0.62 * clamp(st / 8, 0.4, 1.2), 0.72, run) : 0;
  const arms = [0, 1].map(i => {
    const key = i === 0 ? 'armR' : 'armL', a = p[key], [shx, shy] = pipSho(i, yaw), L1 = PIP_L1, L2 = PIP_L2, off = i ? PI : 0; let sh, el, ex, ey, hx, hy, drag = 0;
    // a reaching arm never locks straight: it keeps a little elbow bend (the hand stops 4% short of full reach) so it reads as a limb
    if (a && a.reach) { const tl = apply(iB, a.reach[0], a.reach[1]), r1 = ik2(shx, shy, tl[0], tl[1], L1, L2, 1, 0.96), r2 = ik2(shx, shy, tl[0], tl[1], L1, L2, -1, 0.96), r = r1.ey >= r2.ey ? r1 : r2;
      ex = r.ex; ey = r.ey; hx = r.hx; hy = r.hy; sh = atan2(ex - shx, ey - shy); el = atan2(hx - ex, hy - ey) - sh; }
    else { const br2 = sin(p.breath * TAU), hold = i === 0 && p.dipper, cs = walking ? cos(TAU * (ph - 0.04) + off) : 0, dg = walking ? 0.5 - 0.5 * cos(TAU * (ph - 0.15) + off) : 0;
      const d = i === 0 ? { sh: hold ? 0.55 : 0.16 + 0.04 * br2 - swA * cs + 0.05 * run, el: hold ? 1.15 : walking ? lerp(0.26 + 0.5 * dg, 0.95 + 0.3 * dg, run) : 0.45 }
                        : { sh: -0.3 + 0.03 * br2 - swA * cs + 0.3 * run, el: walking ? lerp(0.22 + 0.42 * dg, 0.95 + 0.3 * dg, run) : 0.3 };
      if (fk) { const ka = fk.arms; d.sh = lerp(d.sh, i === 0 ? 0.75 + 0.45 * fk.kick : 2.3 + 0.2 * fk.kick, ka); d.el = lerp(d.el, i === 0 ? 0.7 : 0.35, ka); }
      sh = a?.sh ?? d.sh; el = a?.el ?? d.el; if (walking && !(i === 0 && hold)) drag = lerp(0.32, 0.22, run) * sin(TAU * (ph - 0.24) + off);
      ex = shx + L1 * sin(sh); ey = shy + L1 * cos(sh); hx = ex + L2 * sin(sh + el); hy = ey + L2 * cos(sh + el); }
    const a2 = atan2(hx - ex, hy - ey);
    return { sh: [shx, shy], el: [ex, ey], hand: [hx, hy], a2, drag, mitt: [hx + PIP_MITT * sin(a2), hy + PIP_MITT * cos(a2)] };
  });
  let D = null; if (p.dipper) D = chain(B, T(arms[0].mitt[0], arms[0].mitt[1]), Rt(p.dipper.tilt ?? 0));
  // sprout and leaf collar follow through: they trail the body's rise and fall by a fifth of a step and lean back with speed
  const follow = walking ? riseN(sp - 0.2) : 0;
  const sw = 0.1 * sin(t * 1.9 + 0.6) + (walking ? lerp(0.16, 0.24, run) * follow - 0.1 * run : 0) - 0.5 * p.headTilt - 0.35 * p.lean - 0.02 * p.vel[0] * face + 0.35 * (1 - p.squash * wsq);
  return { R, B, Hd, legs, arms, D, sw, hipH, br, ph, sp, walking, yaw, run, leafLag: walking ? riseN(sp - 0.15) : null };
}


function drawPip(c, s, t, q) {
  const p = normPip(q, t), rig = pipRig(p, t), { R, B, Hd } = rig, yaw = p.yaw;
  const centre = apply(B, 0, -12), G = mkG(c, p.z, centre); G.s = s; const face = p.face, br = rig.br;
  const locLook = [p.look[0] * face, p.look[1]];
  const eyesOpen = p.eyes * (1 - p.blink);
  const knit = p.mouth === 'grit' ? 0.85 : p.mouth === 'frown' ? 0.5 : 0, squint = p.mouth === 'grit' ? 0.55 : p.mouth === 'laugh' ? 0.5 : p.mouth === 'yawn' ? 0.35 : 0;

  // ---- contact shadows first (on the ground under each boot, and under the seat when sitting), so everything sits on them ----
  if (q.shadow !== false) { const gy = q.ground ?? p.y, pf = groundPersp(c, s, gy); plantedShadow(c, s, t, 'pip', q, 'far');
    for (const lg of rig.legs) { const z = contactZone(lg.out.map(([x, y]) => apply(R, x, y)), 0.35); contactShadow(c, G, z.x0, z.x1, gy, gy - z.y, pf); }
    if (p.onBack > 0.3) { const pts = BELLY_SAMP.map(q => apply(B, q[0], q[1])).concat(headPts(0.9 + 1.5 * yaw).map(q => apply(Hd, q[0], q[1]))), z = contactZone(pts, 1.2);
      contactShadow(c, G, z.x0, z.x1, gy, gy - z.y, pf, ss(0.3, 0.9, p.onBack)); }
    if (p.sit > 0.3) { const w0 = apply(B, -11, 3.6), w1 = apply(B, 11, 3.6); contactShadow(c, G, Math.min(w0[0], w1[0]), Math.max(w0[0], w1[0]), gy, gy - Math.max(w0[1], w1[1]) - 1, pf, ss(0.3, 0.9, p.sit)); } }
  // ---- legs and boots (root frame R); when sitting they stretch toward the viewer, so they go over the belly ----
  const drawLegs = () => { G.push(R);
  for (const i of [1, 0]) { const lg = rig.legs[i];
    const leg = tube(lg.hip, lg.knee, lg.top, 2.2, 2.1, 2.0, nseg(G, 7, 4, 12, 36));
    felt(G, leg, lin(G, 0, lg.hip[1], 0, lg.top[1], [[0, [150, 100, 48]], [1, PC.cuff]]), { lift: 0.5, sz: 0.5, shadow: 0.3, tex: 0.3 });
    drawPipBoot(G, lg, i); }
  G.pop(); };
  const legsFront = p.sit >= 0.5 || p.onBack > 0.45;
  if (!legsFront) drawLegs();

  // ---- far arm (behind the body) ----
  G.push(B); drawPipArm(G, rig.arms[1], p, 0); G.pop();

  // ---- belly: an egg, leaf green most of the way down, amber only as the lower-belly gradient ----
  G.push(B);
  const belly = blob(BELLY_PTS);
  const bFill = lin(G, 0, -23, 0, 4.6, [[0, PC.bellyTop], [0.62, PC.bellyMid], [0.88, PC.bellyHi], [1, PC.bellyLow]]);
  felt(G, belly.path, bFill, { lift: 1.2, sz: 1.9, blob: belly, hairLen: 0.6, hairN: 12, seed: 5, shadeA: 0.13 });
  flecks(c, belly.path, [-15, -24, 30, 30], 260, G.lit([255, 238, 170], 0, -6, 0.1), 0.15, 7, 0.45);
  flecks(c, belly.path, [-15, -24, 30, 30], 140, G.lit([60, 80, 20], 0, -6, 0), 0.1, 17, 0.45);
  // cream belly patch with stitched edge (turns toward the travel direction with the face)
  const px = 1.0 + p.look[0] * face * 0.5 + 3.2 * yaw, py = 0.4, patch = blob([[px, -8.6 + py], [px + 5.0, -7.4 + py], [px + 7.2, -3.4 + py], [px + 6.0, 0.4 + py], [px + 2.4, 2.8 + py], [px - 2.6, 2.7 + py], [px - 5.8, 0.2 + py], [px - 6.6, -3.6 + py], [px - 4.6, -7.4 + py]]);
  felt(G, patch.path, lin(G, 0, -8, 0, 3.4, [[0, PC.patch, 0.08], [1, PC.patchLow, 0.04]]), { lift: 0.7, sz: 1.2, blob: patch, hairLen: 0.5, hairN: 8, seed: 9, hairCol: [255, 250, 226], shadow: 0.3 });
  flecks(c, patch.path, [px - 8, -9, 16, 13], 80, G.lit([255, 255, 240], 0, -5, 0.1), 0.25, 31, 0.7);
  stitch(c, k => { const q2 = blob(patch.pts.map(([x, y]) => [px + (x - px) * 0.87, -3 + (y + 3) * 0.87])); q2.path(k); }, G.lit([200, 160, 100], 0, -4, 0), 0.8, 0.3, [0.9, 0.7]);
  // neck: the belly darkens under the chin and collar so head and body join into one egg
  c.save(); c.beginPath(); belly.path(c); c.clip();
  const ng = c.createRadialGradient(0, -8, 1, 0, -6.5, 9.5); ng.addColorStop(0, 'rgba(18,34,10,0.55)'); ng.addColorStop(0.55, 'rgba(18,34,10,0.22)'); ng.addColorStop(1, 'rgba(18,34,10,0)');
  c.fillStyle = ng; c.fillRect(-16, -16, 32, 20); c.restore();
  G.pop();

  // near arm hangs in front of the belly but under the collar leaves, unless it is raised past the neck
  const armHigh = rig.arms[0].mitt[1] < -12;
  if (!armHigh) { G.push(B); drawPipArm(G, rig.arms[0], p, 1, false); G.pop(); }

  // ---- collar leaves ----
  const lagk = rig.walking ? rig.leafLag * (1 + 0.6 * rig.run) : sin(t * 1.4 + 1), lagv = p.vel[1] * 0.04;
  const LEAVES = [ // root, direction (deg), length, width, back? (drawn before head)
    [-6.2, -13.2, 205, 7.4, 4.3, true], [6.4, -13.4, -25, 7.2, 4.2, true],
    [-9.2, -10.4, 168, 8.2, 4.6], [-5.4, -9.0, 128, 8.4, 4.8], [-0.4, -8.2, 92, 8.0, 4.8], [4.6, -8.7, 56, 8.4, 4.8], [9.0, -10.0, 20, 8.2, 4.6]];
  const leaf = (L, i) => { const [rx2, ry2, deg, len, w] = L, a = deg * PI / 180 + (lagk * 0.13 + lagv) * (0.6 + 0.12 * i) + 0.03 * br;
    G.push(chain(T(rx2 + 1.2 * yaw, ry2), Rt(a)));
    const lp = leafPath(len, w, (i % 2 ? 0.7 : -0.7));
    felt(G, lp, lin(G, 0, 0, len, 0, [[0, PC.leaf], [1, PC.leafHi]]), { lift: 0.8, sz: 1.1, shadow: 0.4, tex: 0.45 });
    c.save(); c.beginPath(); lp(c); c.clip(); c.strokeStyle = G.lit(PC.vein, len * 0.5, 0, 0.1); c.globalAlpha = 0.6; c.lineWidth = 0.28; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0.3, 0); c.lineTo(len * 0.92, 0); for (let k = 1; k <= 3; k++) { const x0 = len * 0.16 * k + 0.4; c.moveTo(x0, 0); c.lineTo(x0 + w * 0.5, -w * 0.5); c.moveTo(x0, 0); c.lineTo(x0 + w * 0.5, w * 0.5); }
    c.stroke(); c.restore(); G.pop(); };
  G.push(B); LEAVES.forEach((L, i) => { if (L[5]) leaf(L, i); }); G.pop();
  G.push(B); LEAVES.forEach((L, i) => { if (!L[5]) leaf(L, i); }); G.pop();

  if (legsFront) drawLegs();

  // ---- head: an onion/teardrop that tapers up into the sprout base and is widest at the cheek line ----
  G.push(Hd);
  const ax = 0.9 + 1.5 * yaw;
  const head = blob(headPts(ax));
  const hFill = lin(G, 0, -19.6, 0, 6.8, [[0, PC.headTop], [0.5, PC.headMid], [1, PC.headLow]]);
  felt(G, head.path, hFill, { lift: 1.4, sz: 2.0, blob: head, hairLen: 0.7, hairN: 8, seed: 13, shadeA: 0.12 });
  const headFlecks = () => { flecks(c, head.path, [-13, -20, 26, 27], 260, G.lit([220, 240, 150], 0, -8, 0.1), 0.15, 41, 0.45);
    flecks(c, head.path, [-13, -20, 26, 27], 140, G.lit([40, 80, 20], 0, -8, 0), 0.1, 51, 0.45); };
  headFlecks();
  // darker where the chin meets the collar
  c.save(); c.beginPath(); head.path(c); c.clip(); const cg = c.createLinearGradient(0, 2.5, 0, 7.4); cg.addColorStop(0, 'rgba(24,40,10,0)'); cg.addColorStop(1, 'rgba(24,40,10,0.34)'); c.fillStyle = cg; c.fillRect(-14, 2, 28, 6); c.restore();
  // face (turns toward the travel direction: features shift ~0.2 head-widths and the far eye foreshortens)
  const fx = 0.2 + locLook[0] * 1.0 + 4.0 * yaw, fy = -3.4 + locLook[1] * 0.5 + (p.mouth === 'yawn' ? 0.4 : 0);
  const nearX = fx - 6.0 * (1 - 0.1 * yaw), farX = fx + 6.0 * (1 - 0.55 * yaw), nearRx = 3.4 * (1 + 0.06 * yaw), farRx = 3.4 * (1 - 0.38 * yaw);
  const ch = 0.35 + 0.35 * clamp(p.brow) + (p.mouth === 'laugh' ? 0.25 : 0);
  for (const [cx2, sd] of [[nearX - 2.0, -1], [farX + 1.6 - 0.8 * yaw, 1]]) { const cy2 = fy + 4.6; c.save();
    c.fillStyle = rad(G, cx2, cy2, 0, cx2, cy2, 3.6, [[0, PC.cheek, 0.3, 0.6 * ch], [1, PC.cheek, 0.1, 0]]); c.beginPath(); ell(cx2, cy2, 3.8, 2.7)(c); c.fill(); c.restore(); }
  const hbb = [Math.min(...head.pts.map(q => q[0])), Math.min(...head.pts.map(q => q[1])), Math.max(...head.pts.map(q => q[0])), Math.max(...head.pts.map(q => q[1]))];
  const eyeBase = { surface: () => { formShade(G, hbb, 1, 1); headFlecks(); }, ry: 4.1, open: eyesOpen, eyes: p.eyes, blink: p.blink, look: locLook, brow: p.brow, knit, lower: squint * 0.8, skin: hFill, iris1: [128, 70, 28], iris2: [78, 40, 18], crease: 'rgba(34,24,6,0.95)' };
  eye(G, Object.assign({}, eyeBase, { cx: nearX, cy: fy, rx: nearRx, sd: -1 }));
  eye(G, Object.assign({}, eyeBase, { cx: farX, cy: fy, rx: farRx, sd: 1, ry: 4.1 * (1 - 0.08 * yaw) }));
  // brows
  const bw = 1.05, raise = clamp(p.brow) * 1.4 - knit * 1.0 + (p.mouth === 'yawn' ? 0.5 : 0);
  for (const [ex, erx, sd] of [[nearX, nearRx, -1], [farX, farRx, 1]]) { const worry = clamp(-p.brow), tilt = worry * 1.9 - knit * 1.7, by = fy - 4.1 - 1.5 - raise;
    brow(G, { x0: ex - sd * erx * 0.86, y0: by - tilt * 0.55 - (worry > 0 ? 0.8 * worry : 0), x1: ex + sd * erx * 0.8, y1: by + tilt * 0.55 + 0.4 * clamp(p.brow), arch: 0.9 + 1.1 * clamp(p.brow) - 0.5 * knit, w: bw, col: G.lit(PC.brow, ex, by, 0.05) }); }
  // nose button and mouth sit between the eyes and move with the face
  const nx = (nearX + farX) / 2 + 0.2;
  c.save(); c.fillStyle = rad(G, nx + 0.25, fy + 3.25, 0, nx, fy + 3.5, 1.0, [[0, [255, 226, 150], 0.2], [1, [212, 150, 70], 0.05]]); c.beginPath(); ell(nx, fy + 3.5, 0.95, 0.72)(c); c.fill(); c.restore();
  mouth(G, p.mouth, p.mouthOpen, nx + 0.1, fy + 6.5, 6.4 * (1 - 0.16 * yaw), { lw: 0.5 });
  G.pop();

  // ---- sprout ----
  G.push(chain(Hd, T(ax, -19.0), Rt(rig.sw)));
  const N = nseg(G, 30, 3, 34, 120), pts = [], sk = 0.9 + 0.18 * (1 - p.squash) - 0.04 * br;
  for (let i = 0; i <= N; i++) { const u = i / N; let x, y;
    if (u < 0.34) { const v = u / 0.34; x = 0.9 * v * v; y = -6.4 * v; }
    else { const v = (u - 0.34) / 0.66, r0 = 3.6 * sk, th = PI + v * 2.35 * PI, r = r0 * (1 - 0.66 * v); x = 0.9 + r0 + r * cos(th); y = -6.4 + r * sin(th) * 1.0; }
    pts.push([x, y]); }
  const widths = pts.map((_, i) => 1.55 - 1.05 * (i / N)), upper = [], lower = [];
  for (let i = 0; i <= N; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = hyp(dx, dy) || 1, nx2 = -dy / l, ny2 = dx / l;
    upper.push([pts[i][0] + nx2 * widths[i], pts[i][1] + ny2 * widths[i]]); lower.push([pts[i][0] - nx2 * widths[i], pts[i][1] - ny2 * widths[i]]); }
  const sp = k => { smoothOpen(k, upper); const tipC = [(upper[N][0] + lower[N][0]) / 2, (upper[N][1] + lower[N][1]) / 2], tr = hyp(upper[N][0] - lower[N][0], upper[N][1] - lower[N][1]) / 2;
    const ta = atan2(upper[N][1] - tipC[1], upper[N][0] - tipC[0]); k.arc(tipC[0], tipC[1], tr, ta, ta + PI, false); smoothOpen(k, lower.slice().reverse(), false); k.closePath(); };
  for (const [deg, len, w] of [[-150, 4.4, 2.1], [-32, 4.0, 1.9]]) { G.push(chain(T(0.3, 0.9), Rt(deg * PI / 180))); const lp = leafPath(len, w, 0.3);
    felt(G, lp, lin(G, 0, 0, len, 0, [[0, PC.leaf], [1, PC.leafHi]]), { lift: 0.5, sz: 0.7, shadow: 0.35, tex: 0.4 }); G.pop(); }
  felt(G, sp, lin(G, 0, 0, 3, -12, [[0, [120, 176, 64]], [1, [186, 220, 112]]]), { lift: 0.7, sz: 0.8, shadow: 0.4, tex: 0.45 });
  c.save(); c.beginPath(); sp(c); c.clip(); c.strokeStyle = 'rgba(255,255,210,0.22)'; c.lineWidth = 0.35; c.beginPath(); smoothOpen(c, pts.map(pt => [pt[0] - 0.2, pt[1] - 0.25])); c.stroke(); c.restore();
  G.pop();

  // ---- near arm (when raised past the neck) and dipper in front of everything ----
  if (armHigh) { G.push(B); drawPipArm(G, rig.arms[0], p, 1, true); G.pop(); }
  if (rig.D) drawDipper(G, rig, p);
  G.push(B); drawPipMitt(G, rig.arms[0], 1); G.pop();
}

// boot: felt shell from the sampled outline (already placed, bent and squashed by pipBoot), a dark sole band, a lighter cuff, seams
// and stitches drawn through the same mapping so they bend with the felt. Fuzz only on the upper part, so nothing pokes into the ground.
function drawPipBoot(G, lg, i) {
  const c = G.c, m = lg.map, step = G.s < 5 ? 4 : G.s < 11 ? 2 : 1;
  const shape = ptsShape(step > 1 ? lg.out.filter((_, k) => k % step === 0) : lg.out), all = shape.sample;
  const furry = Object.assign({}, shape, { sample: () => all().filter(q => q.ny < 0.3) });
  felt(G, shape.path, lin(G, ...m(-3, 0), ...m(3, SOLE), [[0, [188, 98, 44]], [1, [140, 66, 32]]]), { lift: 0.8, sz: 1.1, blob: furry, hairLen: 0.4, hairN: 6, seed: 21 + i });
  c.save(); c.beginPath(); shape.path(c); c.clip();
  const band = (y0, y1) => { c.beginPath(); smoothOpen(c, range(-5, 8.5, 18, x => m(x, y0))); smoothOpen(c, range(8.5, -5, 18, x => m(x, y1)), false); c.closePath(); };
  band(5.45, 9.5); c.fillStyle = lin(G, ...m(0, 5.2), ...m(0, SOLE), [[0, PC.sole], [1, [44, 24, 16]]]); c.fill();
  band(-2.5, 1.6); c.fillStyle = lin(G, ...m(0, -0.6), ...m(0, 1.6), [[0, PC.cuff, 0.06], [1, [206, 130, 70], 0.04]]); c.fill();
  c.lineCap = 'round';
  c.beginPath(); smoothOpen(c, range(-5, 5, 10, x => m(x, 1.6))); c.strokeStyle = 'rgba(60,24,10,0.45)'; c.lineWidth = 0.4; c.stroke();
  c.beginPath(); smoothOpen(c, quadPts([3.75, 2.2], [5.4, 3.6], [6.5, 4.8], 12).map(([x, y]) => m(x, y))); c.strokeStyle = 'rgba(70,30,12,0.5)'; c.lineWidth = 0.35; c.stroke();
  { const a = m(0, 3.6), b = m(0, 6.6), og = c.createLinearGradient(a[0], a[1], b[0], b[1]); og.addColorStop(0, 'rgba(10,6,20,0)'); og.addColorStop(1, 'rgba(10,6,20,0.45)');
    band(3.6, 9.5); c.fillStyle = og; c.fill(); }   // occlusion toward the sole
  c.restore();
  stitch(c, k => smoothOpen(k, range(-3.2, 3.2, 8, x => m(x, 2.4))), 'rgb(250,214,150)', 0.8, 0.28, [0.7, 0.55]);
  stitch(c, k => smoothOpen(k, range(-3.3, 6.2, 16, x => m(x, 5.2))), 'rgb(250,214,150)', 0.55, 0.26, [0.7, 0.55]);
}
// arm: stubby tube; the far arm draws its own mitt, the near arm's mitt is drawn last (over the dipper handle). Every arm keeps a limb
// silhouette whatever its angle: a darker cut edge all round, a fuller elbow with a shaded crease on the inside of the bend. When the near
// arm is raised across the face (high) it lifts off the face with a clear drop shadow, tapers into the shoulder and drops the round
// shoulder cap, so a foreshortened forearm never reads as a round green blob (a second nose) on the face.
function drawPipArm(G, a, p, near, high) {
  const c = G.c, [sx, sy] = a.sh, [ex, ey] = a.el, [hx, hy] = a.hand, hi = near && high;
  const colA = near ? [118, 160, 56] : [96, 140, 52], colM = near ? PC.mitt : [206, 148, 60];
  const arm = tube([sx, sy], [ex, ey], [hx, hy], hi ? 2.5 : 3.1, 2.85, 2.35, nseg(G, 9, 4, 14, 40));
  felt(G, arm, lin(G, sx, sy, hx, hy, [[0, colA], [0.6, colA], [1, P.mixc(colA, colM, 0.6)]]), { lift: hi ? 1.6 : 0.9, sz: 0.7, shadow: hi ? 0.55 : near ? 0.4 : 0.3, tex: 0.4, shadeA: hi ? 0.2 : 0.14,
    box: [Math.min(sx, hx) - 3, Math.min(sy, hy) - 3, Math.max(sx, hx) + 3, Math.max(sy, hy) + 3] });
  // the inside of the elbow: a soft dark crease across the bend on the side the forearm folds toward
  { const mx = (sx + hx) / 2 - ex, my = (sy + hy) / 2 - ey, ml = hyp(mx, my), u1x = sx - ex, u1y = sy - ey, u2x = hx - ex, u2y = hy - ey, l1 = hyp(u1x, u1y) || 1, l2 = hyp(u2x, u2y) || 1;
    const bend = 1 + (u1x * u2x + u1y * u2y) / (l1 * l2);   // 0 straight .. 2 folded
    if (ml > 0.05) { const ix = mx / ml, iy = my / ml, k = clamp(0.35 + bend * 0.9), cx0 = ex + ix * 1.5, cy0 = ey + iy * 1.5, tx = -iy, ty = ix;
      c.save(); c.beginPath(); arm(c); c.clip(); const g = c.createRadialGradient(ex + ix * 2.6, ey + iy * 2.6, 0, ex + ix * 2.6, ey + iy * 2.6, 2.4);
      g.addColorStop(0, `rgba(14,30,6,${0.32 * k})`); g.addColorStop(1, 'rgba(14,30,6,0)'); c.fillStyle = g; c.fillRect(ex - 6, ey - 6, 12, 12);
      c.beginPath(); c.moveTo(cx0 - tx * 1.3, cy0 - ty * 1.3); c.quadraticCurveTo(cx0 + ix * 0.5, cy0 + iy * 0.5, cx0 + tx * 1.3, cy0 + ty * 1.3); c.strokeStyle = `rgba(20,36,8,${0.5 * k})`; c.lineWidth = 0.32; c.lineCap = 'round'; c.stroke(); c.restore(); } }
  // the felt's cut edge: a darker line around the whole limb
  c.save(); c.beginPath(); arm(c); c.strokeStyle = G.lit(P.mixc(colA, [10, 24, 6], 0.62), ex, ey, 0); c.globalAlpha = hi ? 0.85 : near ? 0.5 : 0.4; c.lineWidth = hi ? 0.4 : 0.3; c.lineJoin = 'round'; c.stroke(); c.restore();
  if (near && !high) felt(G, ell(sx, sy, 3.3, 3.3), G.lit(colA, sx, sy, 0.06), { lift: 0.4, sz: 0.6, shadow: 0.18, tex: 0.4 });
  else if (!near) drawPipMitt(G, a, 0, colM);
}
function drawPipMitt(G, a, near, colM) {
  const c = G.c; colM = colM || (near ? PC.mitt : [206, 148, 60]);
  const mx = a.mitt[0], my = a.mitt[1], ang = a.a2;
  G.push(chain(T(mx, my), Rt(-ang + (a.drag || 0))));   // local +y points along the forearm direction; drag flops the mitt behind the swing
  const mitt = blob([[0, -2.9], [2.5, -2.1], [3.0, 0.2], [2.3, 2.3], [0, 3.0], [-2.3, 2.3], [-3.0, 0.2], [-2.5, -2.1]]);
  const edge = near ? 'rgba(96,52,14,0.55)' : 'rgba(80,44,12,0.6)';
  felt(G, mitt.path, rad(G, -0.8, -0.8, 0.5, 0, 0, 3.8, [[0, [250, 196, 96]], [1, colM]]), { lift: 0.8, sz: 0.7, blob: mitt, hairLen: 0.35, hairN: 6, seed: 61 + near, stroke: edge, lw: 0.22 });
  // thumb: a small felt lobe tucked against the mitt's front edge (shaded, fuzzed and outlined like the mitt, so it never reads
  // as a separate flat disc), with a seam where it joins
  const thumb = blob([[1.6, -1.0], [2.9, -0.7], [3.55, 0.5], [3.1, 1.8], [2.0, 2.0], [1.5, 0.6]]);
  felt(G, thumb.path, rad(G, 2.2, -0.2, 0.2, 2.5, 0.6, 2.2, [[0, [246, 190, 92]], [1, P.mixc(colM, [150, 90, 30], 0.18)]]), { lift: 0.5, sz: 0.45, shadow: 0.34, tex: 0.3, blob: thumb, hairLen: 0.28, hairN: 4, seed: 71 + near, stroke: edge, lw: 0.2, shadeA: 0.12 });
  c.save(); c.beginPath(); c.moveTo(1.75, -0.6); c.quadraticCurveTo(1.45, 0.6, 2.0, 1.75); c.strokeStyle = 'rgba(110,60,16,0.45)'; c.lineWidth = 0.22; c.stroke(); c.restore();
  c.save(); c.beginPath(); c.moveTo(-2.4, -2.4); c.quadraticCurveTo(0, -3.2, 2.4, -2.4); c.strokeStyle = 'rgba(120,70,20,0.5)'; c.lineWidth = 0.3; c.setLineDash([0.6, 0.5]); c.stroke(); c.restore();
  G.pop();
}

// dipper: a copper/tin cup on a short handle that passes through the right mitt (the mitt is drawn over it). tilt tips the cup forward.
// The water keeps a world-horizontal surface, is clipped to the rim, shrinks as the cup tilts and spills a meniscus at the lip.
const DIP = { ox: 4.6, oy: -12.6, rx: 5.0, ry: 1.9, H: 8.2 };
function drawDipper(G, rig, p) {
  const c = G.c, dp = p.dipper, water = clamp(dp.water ?? 0.5), tilt = dp.tilt ?? 0, { ox, oy, rx, ry, H } = DIP;
  G.push(rig.D);
  // handle: from a stub below the mitt up to the cup's side
  const handle = capsule(0.5, 1.8, 1.5, -9.6, 0.9, 0.9);
  felt(G, handle, lin(G, -1, 0, 2, 0, [[0, [104, 62, 38]], [0.4, [214, 150, 96]], [1, [92, 54, 34]]]), { lift: 0.5, sz: 0.5, shadow: 0.35, tex: 0.1, box: [-1, -8, 3, 5] });
  // the neck: the handle flares into the bowl's flank, so the two read as one cast piece (the bowl is drawn over it)
  const neck = k => { k.moveTo(-0.4, -6.4); k.lineTo(2.4, -5.4); k.quadraticCurveTo(2.8, -6.1, 3.9, -6.3); k.lineTo(0.3, -11.6); k.quadraticCurveTo(-0.4, -9.5, -0.4, -6.4); k.closePath(); };
  felt(G, neck, lin(G, -1, 0, 4, 0, [[0, [104, 62, 38]], [0.4, [214, 150, 96]], [1, [92, 54, 34]]]), { lift: 0.4, sz: 0.5, shadow: 0.25, tex: 0.1, box: [-1, -12, 4, -5] });
  // cup body (a round-bottomed bowl), copper with a darker core shadow and a soft sheen
  const cupPath = k => { k.moveTo(ox - rx, oy); k.bezierCurveTo(ox - rx - 0.2, oy + 4.6, ox - 2.6, oy + H, ox, oy + H); k.bezierCurveTo(ox + 2.6, oy + H, ox + rx + 0.2, oy + 4.6, ox + rx, oy); k.closePath(); };
  felt(G, cupPath, lin(G, ox - rx, 0, ox + rx, 0, [[0, [122, 70, 44]], [0.3, [218, 150, 96]], [0.58, [176, 108, 66]], [1, [92, 52, 36]]]), { lift: 0.8, sz: 0.9, tex: 0.12, shadeA: 0.1, box: [ox - rx, oy, ox + rx, oy + H], rim: 1.2 });
  c.save(); c.beginPath(); cupPath(c); c.clip();
  const L = G.ld(); c.fillStyle = 'rgba(255,226,180,0.2)'; c.beginPath(); ell(ox + L[0] * 2.4 - 0.6, oy + 3.2, 1.2, 2.2, 0.1)(c); c.fill();
  c.strokeStyle = 'rgba(60,30,18,0.4)'; c.lineWidth = 0.3; c.beginPath(); c.moveTo(ox - rx, oy + 3.2); c.quadraticCurveTo(ox, oy + 4.6, ox + rx, oy + 3.2); c.stroke(); c.restore();   // soldered band
  // opening: dark interior wall, then the water
  const rimEll = ell(ox, oy, rx - 0.5, ry - 0.2);
  c.save(); c.beginPath(); rimEll(c); c.fillStyle = G.lit([40, 24, 22], ox, oy, 0.02); c.fill(); c.clip();
  const u = G.lv(0, -1), ul = hyp(u[0], u[1]) || 1, ux = u[0] / ul, uy = u[1] / ul, hang = atan2(ux, -uy);
  const cap = 1 - 0.86 * ss(0.3, 1.5, tilt), lvl = Math.min(water, cap), dep = H * (1 - lvl) * 0.62 + 0.5 * tilt;
  const wx = ox - ux * dep * 0.5 + 0.35 * tilt, wy = oy - uy * dep * 0.5;
  if (lvl > 0.02) { c.beginPath(); ell(wx, wy, rx * 0.97, ry * 0.95, hang)(c);
    c.fillStyle = rad(G, wx, wy - 0.4, 0.2, wx, wy, rx, [[0, [150, 176, 214], 0.02], [0.6, [78, 112, 170], 0.0], [1, [34, 58, 108], 0.0]]); c.fill();
    const wm = G.L.warm; if (wm > 0.05) { c.beginPath(); ell(wx + L[0] * 1.6, wy + L[1] * 0.4 + 0.1, 1.9, 0.5, hang)(c); c.fillStyle = `rgba(255,214,150,${0.15 + 0.5 * wm})`; c.fill(); }
    c.beginPath(); ell(wx - 1.2, wy - 0.3, 1.2, 0.2, hang)(c); c.fillStyle = 'rgba(236,244,255,0.5)'; c.fill(); }
  c.restore();
  // rolled rim: a fat lit lip with a highlight on the side facing the key
  c.save(); c.beginPath(); ell(ox, oy, rx + 0.2, ry + 0.15)(c); c.strokeStyle = G.lit([232, 168, 112], ox, oy, 0.05); c.lineWidth = 0.9; c.stroke();
  c.beginPath(); c.ellipse(ox, oy, rx + 0.2, ry + 0.15, 0, PI * (0.5 + 0.5 * L[0]) - 1.1, PI * (0.5 + 0.5 * L[0]) + 1.1 + (L[1] > 0 ? PI : 0) * 0); c.strokeStyle = 'rgba(255,238,200,0.7)'; c.lineWidth = 0.4; c.stroke();
  c.beginPath(); ell(ox, oy, rx + 0.7, ry + 0.6)(c); c.strokeStyle = 'rgba(40,20,12,0.35)'; c.lineWidth = 0.3; c.stroke(); c.restore();
  // spill: a meniscus swelling over the lip as the cup tips
  const sp = ss(0.7, 1.15, tilt) * ss(0.05, 0.2, water);
  if (sp > 0.02) { const lx = ox + rx - 0.3, ly = oy + 0.2; c.save(); c.globalAlpha = sp; c.beginPath(); ell(lx, ly + 0.3, 1.5, 0.95, hang)(c); c.fillStyle = rad(G, lx, ly, 0.1, lx, ly, 1.6, [[0, [190, 212, 240], 0.02], [1, [74, 110, 168], 0]]); c.fill();
    c.beginPath(); ell(lx - 0.3, ly, 0.6, 0.25, hang)(c); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill(); c.restore(); }
  G.pop();
}

// broad soft shadow under Pip on the ground plane (flattened by the camera's view of the ground). The tight contact shadow under
// each boot is drawn by drawPip itself, so it always sits right under the sole.
function pipShadow(c, s, t, q) {
  const p = normPip(q, t), rig = pipRig(p, t), G = mkG(c, p.z, apply(rig.B, 0, -12)), gy = q.ground ?? (Math.abs(p.y) < 6 ? p.y : 0), pf = groundPersp(c, s, gy);
  const ob = ss(0.2, 0.9, p.onBack), low = Math.max(...rig.legs.map(lg => apply(rig.R, 0, lg.low)[1])), h = clamp((gy - low) / 14) * (1 - ob), rx = (16 + 4 * G.L.k) * (1 + 0.3 * h) * (1 + 0.35 * ob);
  const cx = lerp(p.x + 1.5 * p.face, apply(rig.B, 0, -8)[0], ob);   // lying, the shadow follows the body, not the boots in the air
  groundShadow(c, G, cx, gy, rx, clamp(rx * pf * 1.1, 0.9, rx * 0.3), 0.46 * (1 - 0.55 * h));
}
C.pip = (pose = {}) => castItems('pip', pose, pipShadow, drawPip);
C.walkAdvance = (stride = 8) => 2 * stride * PS;   // world distance covered per walk-phase unit (feet stay planted)
C.anchor = (who, pose, name, t = 0) => { const a = anchor0(who, pose, name, t), tc = turnCentre(who, pose, t);
  return a && tc ? [tc.cx + (a[0] - tc.cx) * tc.k, a[1]] : a; };
const anchor0 = (who, pose, name, t) => {
  if (who === 'pip') { const p = normPip(pose, t), r = pipRig(p, t);
    if (name === 'lip' && r.D) return apply(r.D, DIP.ox + DIP.rx, DIP.oy); if (name === 'dipper' && r.D) return apply(r.D, DIP.ox, DIP.oy + 3);
    if (name === 'mittR') return apply(r.B, ...r.arms[0].mitt); if (name === 'mittL') return apply(r.B, ...r.arms[1].mitt);
    if (name === 'head') return apply(r.Hd, 0, -7); if (name === 'sprout') return apply(r.Hd, 0.9 + 1.5 * r.yaw, -19); if (name === 'footL') return apply(r.R, ...r.legs[1].foot); if (name === 'footR') return apply(r.R, ...r.legs[0].foot);
    if (name === 'eyes') return apply(r.Hd, 1, -3.4);
    if (name === 'back' || name === 'backHead' || name === 'backBelly') {   // lowest point of the body outline (belly or head), e.g. where he lies on the ground
      let lo = null; const take = q => { if (!lo || q[1] > lo[1]) lo = q; };
      if (name !== 'backHead') for (const q of BELLY_SAMP) take(apply(r.B, q[0], q[1]));
      if (name !== 'backBelly') for (const q of headPts(0.9 + 1.5 * r.yaw)) take(apply(r.Hd, q[0], q[1]));
      return lo; }
    return apply(r.B, 0, -10); }
  if (who === 'bram') return C._anchorBram(pose, name, t);
  if (who === 'luma' && C._anchorLuma) return C._anchorLuma(pose, name, t);
  return null;
};
// Feet in world units, for checks and for effects that land on a footfall: per foot its outline (`pts`, same sample order every
// frame, so a sample is a fixed point of the felt), whether it is planted, and its lowest point. who: 'pip' | 'bram' | 'luma'.
C.feet = (who, pose = {}, t = 0) => { const f = feet0(who, pose, t), tc = turnCentre(who, pose, t); if (!tc) return f;
  const nx = q => [tc.cx + (q[0] - tc.cx) * tc.k, q[1]]; return f.map(o => Object.assign({}, o, { pts: o.pts.map(nx), low: nx(o.low) })); };
const feet0 = (who, pose, t) => {
  if (who === 'pip') { const p = normPip(pose, t), r = pipRig(p, t);
    return r.legs.map(lg => { const pts = lg.out.map(([x, y]) => apply(r.R, x, y)), z = contactZone(pts, 0.05); return { pts, planted: lg.planted, low: [(z.x0 + z.x1) / 2, z.y] }; }); }
  if (who === 'bram') return C._feetBram(pose, t);
  if (who === 'luma') return C._feetLuma(pose, t);
  return [];
};



// =====================================================================================================================
// BRAM
// =====================================================================================================================
const BC = { shell: [10, 72, 92], shellHi: [32, 116, 130], shellLo: [4, 38, 54], head: [28, 98, 110], headLo: [14, 66, 80], pro: [20, 90, 106], leg: [10, 40, 52], legHi: [40, 98, 106], belly: [10, 40, 52], joint: [150, 104, 62], brow: [54, 146, 152] };
// elytra top profile: a domed shell, steep at both ends
const EL = { x0: -28.5, x1: 6.5, h: 21.5 };
const elU = x => (x - (EL.x0 + EL.x1) / 2) / ((EL.x1 - EL.x0) / 2);
const elTop = (x, k = 1) => { const u = clamp(elU(x), -1, 1); return -EL.h * k * Math.pow(Math.max(0, 1 - u * u), 0.55); };
const elytraPath = c => { c.moveTo(EL.x1, 0.5); for (let i = 1; i <= 40; i++) { const x = lerp(EL.x1, EL.x0, i / 40); c.lineTo(x, elTop(x) + (i > 36 ? 0.4 * (i - 36) : 0)); }
  c.quadraticCurveTo(EL.x0 - 1.6, -0.6, EL.x0 - 3.0, 1.1);   // slightly flared trailing edge
  c.quadraticCurveTo(-12, 3.6, EL.x1, 0.5); c.closePath(); };
const PRO_PTS = c => { c.moveTo(1.5, 0.7); c.bezierCurveTo(1.6, -6.4, 4.2, -11.6, 8.6, -12.4); c.bezierCurveTo(12.6, -13, 15.6, -9.8, 16.4, -5.2); c.bezierCurveTo(16.8, -2.6, 16.2, -0.4, 14.4, 0.6); c.closePath(); };
function normBram(q, t) {
  const p = Object.assign({}, q);
  p.x = q.x ?? 0; p.y = q.y ?? 0; p.z = q.z ?? 400; p.face = (q.face ?? 1) >= 0 ? 1 : -1; p.lean = q.lean ?? 0; p.squash = clamp(q.squash ?? 1, 0.6, 1.5); p.headTilt = q.headTilt ?? 0;
  p.eyes = q.eyes ?? 1; p.look = q.look ?? [0, 0]; p.brow = q.brow ?? 0.3; p.mouth = MOUTHS.includes(q.mouth) ? q.mouth : 'smile'; p.mouthOpen = q.mouthOpen ?? OPEN_DEF[p.mouth];
  p.breath = q.breath ?? t * 0.27; p.blink = clamp((q.blink ?? 0) + (q.autoBlink === false ? 0 : autoBlink(t, q.blinkSeed ?? 11)));
  p.stride = q.stride ?? 9; p.walk = q.walk ?? null; p.brace = clamp(q.brace ?? 0); p.push = clamp(q.push ?? 0); p.dome = clamp(q.dome ?? 0); p.head = clamp(q.head ?? 0);
  return p;
}
const BR_HIP = [[4.0, 1.0], [-6.5, 1.0], [-17.5, 1.0]];    // front, mid, hind attachment along the underside
const BR_NEUT = [9.0, 2.5, -10.5];                         // neutral foot offset from the hip
const BR_L1 = 8.6, BR_L2 = 11.6;                           // femur, tibia
const BR_CHIN = [[0, 7.8], [3.2, 7.7], [6.4, 7.4], [9.0, 6.0], [10.8, 4.4], [11.6, 0.2], [-5.4, 6.6], [-8.6, 2.0], [9.4, 6.4]];   // head outline points that can reach the ground
const BR_BODY = [[-8, 4.4], [-18, 4.1], [2, 4.1], [8, 3.2], [12, 2.0], [-25, 2.9], [-29, 1.4], [-31.5, 1.1], [14.4, 0.6], [16.4, -5.2], [16.8, -2.6], [15.6, -0.6], [1.5, 0.7], [4.4, 5.6], [-6.1, 5.6], [-17.1, 5.6], [6.8, 5.6], [-3.7, 5.6], [-14.7, 5.6]];   // underbody, shell edge, pronotum and leg sockets: points that can reach the ground
const BR_PAD = 1.35;                                       // height of the tarsal pad; its flat underside is the foot's contact
function bramRig(p, t) {
  const face = p.face, walking = p.walk != null, ph = walking ? p.walk : 0, brace = p.brace, push = p.push, dome = p.dome, br = sin(p.breath * TAU);
  const R = chain(T(p.x, p.y), Sc(face, 1)), sq = p.squash, syk = sq * (1 - 0.12 * dome);
  // Tripod gait (two groups of three legs alternate; a group is down half the cycle and moves back at the advance rate, so it stays
  // planted). Weight: the shell settles just after each tripod lands, rides up through mid-stance, surges forward and rocks a little
  // nose-down / tail-down as the weight passes from one tripod to the other. Resting (dome) lowers the belly onto the ground.
  const sp = frac(2 * ph), kS = clamp(p.stride / 9, 0.3, 1.4);
  const bob = walking ? 0.85 * kS * (0.5 + 0.5 * cos(TAU * (sp - 0.14))) : 0;            // + is lower (y points down)
  const surge = walking ? 0.5 * kS * sin(TAU * (sp - 0.3)) : 0, rock = walking ? 0.03 * kS * sin(TAU * (sp - 0.22)) : 0;
  const shx = push * 0.35 * sin(t * 43), shy = push * 0.22 * sin(t * 57 + 1);
  const lean = p.lean + 0.1 * brace + 0.07 * push + rock;
  const body = h2 => chain(T(shx + surge, -h2 + bob + shy - 0.35 * br * (1 - dome)), Rt(lean), Sc(1 / sqrt(sq), syk * (1 + 0.012 * br)));
  const lowAt = h2 => { const m = body(h2); let y = -1e9; for (const [x, yy] of BR_BODY) { const w = apply(m, x, yy); if (w[1] > y) y = w[1]; } return y; };
  // body height: standing, lowered when bracing; it is raised if a pitched-down brace would push the shell into the ground; a
  // resting dome sets the belly exactly on the ground
  let hh = lerp(9.4, 5.2, brace); { const l0 = lowAt(hh); if (l0 > -0.3) hh += l0 + 0.3; }
  if (dome > 0) hh = lerp(hh, hh + lowAt(hh), dome);
  let S = mul(R, body(hh));
  // head: lowered by `head`, pushed down by `push`. It never dips into the ground: if the chin would go below it, the nod is eased
  // back just enough (only in those poses), and the little mandibles fold up under the snout as it nears the ground.
  const headAt = rot => chain(S, T(19.8, -5.0 + 2.8 * p.head), Rt(rot), Sc(1.08)), iRb = inv(R);
  const chinY = m => { const mm = mul(iRb, m); let y = -1e9; for (const [x, yy] of BR_CHIN) { const w = apply(mm, x, yy); if (w[1] > y) y = w[1]; } return y; };
  let hrot = p.headTilt + 0.5 * p.head + 0.22 * push + (walking ? 0.05 * kS * sin(TAU * (sp - 0.42)) : 0), Hh = headAt(hrot);
  if (chinY(Hh) > -0.6) { let lo = Math.min(hrot, lean - 0.6), hi = hrot; for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (chinY(headAt(mid)) > -0.6) hi = mid; else lo = mid; } hrot = lo; Hh = headAt(hrot); }
  { const ex = chinY(Hh) + 0.6; if (ex > 0) { hh += ex; S = mul(R, body(hh)); Hh = headAt(hrot); } }   // a pitched-down brace: the whole body rides up
  const mandK = (() => { const mm = mul(iRb, Hh); for (let k = 10; k >= 0; k--) { const mk = k / 10, d = 1.6 * mk;
    const y = Math.max(apply(mm, lerp(11.8, 13.4, mk), lerp(5.6, 8.6, mk) + d)[1], apply(mm, 9.0, lerp(6.2, 7.6, mk) + d)[1]); if (y <= -0.3) return mk; } return 0; })();
  // legs: index 0..2 near (front, mid, hind), 3..5 far
  const legs = [], ls = 1 - 0.45 * dome, l1 = BR_L1 * ls, l2 = BR_L2 * ls;
  for (let i = 0; i < 6; i++) { const far = i >= 3, k = i % 3, grpA = (k === 1) === far;
    const hip = apply(mul(inv(R), S), BR_HIP[k][0] + (far ? 2.4 : 0), 1.2); const hx0 = BR_HIP[k][0] + (far ? 2.4 : 0); let fx = hx0 + BR_NEUT[k] * ls + (far ? 1.4 : 0), fy = 0, q = 0.04, planted = true;   // feet are placed from the unshaken rest position
    // brace: the hind legs stretch long and diagonal behind him, the middle pair follows, the front pair digs in
    fx -= brace * (k === 0 ? 3.5 : k === 1 ? 9 : 17) * ls;
    if (walking) { const u = frac(ph + (grpA ? 0 : 0.5)), st = p.stride;
      if (u < 0.5) { fx += st * (0.5 - u * 2); q = 0.04 + 0.12 * P.bump(0.06, 0.07, u * 2); }
      else { const s = (u - 0.5) * 2; fx += st * (-0.5 + ss(0.05, 0.95, s)); fy = -3.6 * Math.pow(sin(PI * s), 1.25) * (st / 9); planted = false; q = 0; } }
    fx = lerp(fx, hx0 + (k === 2 ? -2.5 : k === 0 ? 2.5 : 0), dome); fy = lerp(fy, 0, dome); if (dome > 0.5) planted = true;
    // IK to the top of the foot pad: the knee rises above the belly line, out and up; the tibia drops to the pad
    const ph2 = BR_PAD * ls * (1 - q); let ax = fx, ay = fy - ph2 * 1.05;
    // The leg never stretches past femur + tibia (kept a touch short of straight so the knee still reads). A foot placed beyond that
    // slides along the ground back toward the hip until it is in reach; if the hip is so high that even straight down cannot reach
    // the ground, the foot hangs at full reach under it (lifted, not planted).
    // Measured from the hip without the strain tremor, so a clamped foot stays put while the body shakes (the margin to full length
    // absorbs the tremor).
    { const reach = (l1 + l2) * 0.95, h0 = [hip[0] - shx, hip[1] - shy], dx = ax - h0[0], dy = ay - h0[1], d = hyp(dx, dy);
      if (d > reach) { if (Math.abs(dy) < reach) ax = h0[0] + Math.sign(dx || 1) * Math.sqrt(reach * reach - dy * dy);
        else { ax = h0[0] + dx / d * reach; ay = h0[1] + dy / d * reach; fy = ay + ph2 * 1.05; planted = false; }
        fx = ax; } }
    const r1 = ik2(hip[0], hip[1], ax, ay, l1, l2, 1), r2 = ik2(hip[0], hip[1], ax, ay, l1, l2, -1), r = r1.ey <= r2.ey ? r1 : r2;
    legs.push({ far, hip, knee: [r.ex, r.ey], ankle: [ax, ay], foot: [fx, fy], k, ls, q, padH: ph2, planted, lift: clamp(-fy / 3.6) }); }
  return { R, S, Hh, legs, hh, br, walking, ph, mandK };
}
// foot outline (pad underside + claw) of one leg in the root frame: used for drawing, contact shadows and C.feet
function bramFootPts(lg) { const th = lg.ls, [fx, fy] = lg.foot, rx = 3.0 * th * (1 + 0.3 * lg.q), ry = lg.padH, cx = fx + 0.8 * th, out = [];
  for (let i = 0; i <= 24; i++) { const a = PI * i / 24; out.push([cx + rx * cos(a), fy - ry + ry * sin(a)]); } out.push([fx + 4.4 * th, fy]); return out; }
function drawBramLeg(G, lg, p) {
  const c = G.c, far = lg.far, ls = lg.ls, col = far ? [7, 30, 40] : BC.leg, hi = far ? [22, 62, 70] : BC.legHi, th = ls;
  const [hx, hy] = lg.hip, [kx, ky] = lg.knee, [fx, fy] = lg.foot, [ax, ay] = lg.ankle, ph = lg.padH;
  const box = (a, b, r) => [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r];
  // coxa: a thick socket where the leg leaves the shell, angled outward
  const cx = hx + 0.4, cy = hy + 1.6 * th;
  felt(G, ell(cx, cy, 3.2 * th, 2.8 * th, 0.3), lin(G, 0, cy - 3, 0, cy + 3, [[0, hi], [1, col]]), { lift: 0.5, sz: 0.5, shadow: 0.35, tex: 0.12, shade: false, box: [cx - 3.5, cy - 3, cx + 3.5, cy + 3] });
  // femur up and out to the knee, tibia down to the top of the foot pad
  const fem = capsule(cx, cy, kx, ky, 3.0 * th, 2.3 * th), tib = capsule(kx, ky, ax, ay, 2.0 * th, 1.2 * th);
  felt(G, tib, lin(G, kx, ky, ax, ay, [[0, hi], [0.5, col], [1, col]]), { lift: 0.5, sz: 0.5, shadow: 0.34, tex: 0.12, box: box([kx, ky], [ax, ay], 2.4), shadeA: 0.1 });
  felt(G, fem, lin(G, cx, cy, kx, ky, [[0, col], [0.5, hi], [1, col]]), { lift: 0.5, sz: 0.5, shadow: 0.34, tex: 0.12, box: box([cx, cy], [kx, ky], 3), shadeA: 0.1 });
  // knee: a small warm joint cap
  c.save(); c.fillStyle = G.lit(far ? [80, 58, 40] : BC.joint, kx, ky, 0.06); c.beginPath(); ell(kx, ky, 1.9 * th, 1.8 * th)(c); c.fill();
  c.fillStyle = 'rgba(255,230,180,0.28)'; c.beginPath(); ell(kx - 0.5, ky - 0.6, 0.9 * th, 0.7 * th)(c); c.fill();
  c.restore();
  // tarsal pad resting flat on the ground (its underside is the contact; it squashes a little as weight lands), and a hooked claw
  // whose tip touches the ground just ahead of it
  const rx = 3.0 * th * (1 + 0.3 * lg.q), pcx = fx + 0.8 * th, pad = ell(pcx, fy - ph, rx, ph);
  felt(G, pad, lin(G, 0, fy - 2 * ph, 0, fy, [[0, hi], [1, col]]), { lift: 0.3, sz: 0.3, shadow: 0.4, tex: 0.1, shade: false, box: [pcx - rx, fy - 2 * ph, pcx + rx, fy] });
  c.save(); c.fillStyle = G.lit([8, 20, 28], fx, fy, 0); c.beginPath(); c.moveTo(fx + 2.0 * th, fy - ph * 1.55); c.quadraticCurveTo(fx + 3.9 * th, fy - ph * 1.25, fx + 4.4 * th, fy - 0.02);
  c.quadraticCurveTo(fx + 3.3 * th, fy - ph * 0.35, fx + 2.0 * th, fy - ph * 0.3); c.closePath(); c.fill(); c.restore();
}
function drawBram(c, s, t, q) {
  const p = normBram(q, t), rig = bramRig(p, t), { R, S, Hh } = rig, face = p.face;
  const G = mkG(c, p.z, apply(S, -6, -12)); G.s = s;
  const locLook = [p.look[0] * face, p.look[1]], knit = p.mouth === 'grit' ? 0.6 + 0.3 * p.push : p.mouth === 'frown' ? 0.5 : p.push * 0.5;
  const eyesOpen = p.eyes * (1 - p.blink), squint = p.mouth === 'grit' ? 0.4 : p.mouth === 'laugh' ? 0.5 : 0;
  // contact shadows under every foot (and under the belly when he rests on it), drawn first so the feet sit on them
  if (q.shadow !== false) { const gy = q.ground ?? p.y, pf = groundPersp(c, s, gy); plantedShadow(c, s, t, 'bram', q, 'far');
    for (const lg of rig.legs) { const z = contactZone(bramFootPts(lg).map(([x, y]) => apply(R, x, y)), 0.3); contactShadow(c, G, z.x0, z.x1, gy, gy - z.y, pf, lg.far ? 0.75 : 1); }
    if (p.dome > 0.3) { const w0 = apply(S, -26, 4.4), w1 = apply(S, 10, 4.4); contactShadow(c, G, Math.min(w0[0], w1[0]), Math.max(w0[0], w1[0]), gy, gy - Math.max(w0[1], w1[1]), pf, ss(0.3, 0.9, p.dome)); } }
  // far legs
  G.push(R); for (let i = 3; i < 6; i++) drawBramLeg(G, rig.legs[i], p); G.pop();
  // underbody
  G.push(S);
  felt(G, ell(-8, 1.0, 21, 3.4), lin(G, 0, -2, 0, 4, [[0, [14, 52, 64]], [1, BC.belly]]), { lift: 0.6, sz: 0.8, shadow: 0.4, tex: 0.2 });
  G.pop();
  // ---- elytra: one large domed shell split by a centre seam, with a slightly flared trailing edge ----
  G.push(S);
  const eBox = [EL.x0 - 3, -EL.h, EL.x1, 3.6], L = G.ld(), wc = G.L.col;
  felt(G, elytraPath, lin(G, 0, -EL.h, 0, 2, [[0, BC.shellHi], [0.35, BC.shell], [1, BC.shellLo]]), { lift: 1.5, sz: 1.6, shadow: 0.5, tex: 0.22, shadeA: 0.16, rim: 0.9, box: eBox, core: 1.35 });
  c.save(); c.beginPath(); elytraPath(c); c.clip();
  // far elytron: the sliver above the seam recedes a little darker
  c.beginPath(); c.moveTo(EL.x1 + 1, -3); for (let i = 0; i <= 36; i++) { const x = lerp(EL.x1, EL.x0, i / 36); c.lineTo(x, elTop(x, 0.8)); } for (let i = 36; i >= 0; i--) { const x = lerp(EL.x1, EL.x0, i / 36); c.lineTo(x, elTop(x, 1.1)); } c.closePath();
  c.fillStyle = 'rgba(4,28,44,0.3)'; c.fill();
  // broad soft felt value change: a wide soft light across the crown on the key side, a cool dark low on the far side
  const hx = clamp(-4 + L[0] * 11, -22, 4), hg = c.createRadialGradient(hx, -15.5 + L[1] * 3, 1, hx, -14, 15);
  hg.addColorStop(0, `rgba(${lerp(150, wc[0], 0.6) | 0},${lerp(230, wc[1], 0.6) | 0},${lerp(230, wc[2], 0.5) | 0},0.3)`); hg.addColorStop(1, 'rgba(120,200,210,0)'); c.fillStyle = hg; c.fillRect(EL.x0 - 4, -EL.h - 2, 44, EL.h + 6);
  const bl = c.createLinearGradient(0, -5, 0, 1.6); bl.addColorStop(0, `rgba(${wc[0] | 0},${wc[1] | 0},${wc[2] | 0},0)`); bl.addColorStop(1, `rgba(${wc[0] | 0},${wc[1] | 0},${wc[2] | 0},${0.06 + 0.16 * G.L.warm})`); c.fillStyle = bl; c.fillRect(EL.x0 - 4, -5, 44, 7);
  // striae: faint grooves parallel to the seam
  c.lineCap = 'round'; for (const [k, a] of [[0.62, 0.22], [0.44, 0.18], [0.26, 0.14]]) { c.beginPath(); for (let i = 0; i <= 30; i++) { const x = lerp(EL.x1 - 1, EL.x0 + 2, i / 30), y = elTop(x, k); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.strokeStyle = `rgba(2,26,38,${a})`; c.lineWidth = 0.5; c.stroke(); }
  // the seam: a dark groove with a soft lit lip on its lower side
  const seam = (dy, col, lw) => { c.beginPath(); for (let i = 0; i <= 36; i++) { const x = lerp(EL.x1 - 0.5, EL.x0 + 1.5, i / 36), y = elTop(x, 0.86) + dy; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.strokeStyle = col; c.lineWidth = lw; c.stroke(); };
  seam(0, 'rgba(2,22,34,0.75)', 0.7); seam(0.7, `rgba(${lerp(150, wc[0], 0.5) | 0},${lerp(220, wc[1], 0.5) | 0},${lerp(220, wc[2], 0.5) | 0},0.22)`, 0.7);
  c.restore();
  flecks(c, elytraPath, [EL.x0, -EL.h, 36, EL.h + 3], 220, G.lit([140, 220, 220], -10, -10, 0.1), 0.1, 71, 0.8);
  // a soft rolled lip along the bottom edge
  c.save(); c.beginPath(); c.moveTo(EL.x1, 0.7); c.quadraticCurveTo(-12, 3.6, EL.x0 - 3.0, 1.1); c.strokeStyle = 'rgba(2,20,30,0.5)'; c.lineWidth = 0.8; c.stroke(); c.restore();
  G.pop();
  // ---- head: tucked under the pronotum's front lip; the brow is part of the head capsule ----
  G.push(Hh);
  const head = blob([[-8.2, -3.0], [-4.0, -7.2], [1.8, -8.4], [6.6, -8.0], [10.0, -4.8], [11.6, 0.2], [10.8, 4.4], [6.4, 7.4], [0, 7.8], [-5.4, 6.6], [-8.6, 2.0]]);
  const hFill = lin(G, 0, -8, 0, 7.8, [[0, [52, 140, 148]], [0.5, BC.head], [1, BC.headLo]]);
  const bn = [[2.6, -7.2], [6.2, -7.0]];
  bn.forEach(([bx, by], i) => { const sw = 0.9 * sin(t * 3.1 + i * 1.7) + (rig.walking ? 1.1 * sin(2 * TAU * (rig.ph - 0.1) + i) : 0) + (1 - p.squash) * 3, tx = bx + 5.6 + sw, ty = by - 8.8 + 0.4 * sw;
    const path = k => { k.moveTo(bx, by); k.quadraticCurveTo(bx + 1.0 + sw * 0.2, by - 5.6, tx, ty); };
    c.save(); c.lineCap = 'round'; c.beginPath(); path(c); c.strokeStyle = 'rgba(3,6,16,0.35)'; c.lineWidth = 1.3; c.translate(0.4, 0.6); c.stroke(); c.restore();
    c.save(); c.lineCap = 'round'; c.beginPath(); path(c); c.strokeStyle = G.lit(i ? [22, 80, 94] : [34, 104, 116], bx, by, 0.05); c.lineWidth = 1.1; c.stroke(); c.restore();
    felt(G, ell(tx, ty, 1.6, 1.25, -0.7), G.lit(BC.joint, tx, ty, 0.12), { lift: 0.4, sz: 0.4, shadow: 0.3, tex: 0.2 }); });
  // little mandibles under the snout
  { const mk = rig.mandK; if (mk > 0.05) for (const [dy, a] of [[0, 1], [1.6, 0.7]]) { const d = dy * mk, ty = lerp(5.6, 8.6, mk) + d; c.save(); c.fillStyle = G.lit([20, 40, 46], 11, 4, 0); c.globalAlpha = a; c.beginPath(); c.moveTo(9.4, 5.4 + d); c.quadraticCurveTo(12.8, 5.4 + d, lerp(11.8, 13.4, mk), ty); c.quadraticCurveTo(11.2, lerp(6.0, 7.6, mk) + d, 9.0, lerp(6.2, 7.6, mk) + d); c.closePath(); c.fill(); c.restore(); } }
  felt(G, head.path, hFill, { lift: 1.2, sz: 1.5, blob: head, hair: false, shadeA: 0.12, tex: 0.22, core: 1.2 });
  // fibre flecks, and a soft brow ridge: a broad lighter value band above the eyes, no separate visor (repainted inside the lids)
  const headDetail = () => { flecks(c, head.path, [-9, -9, 21, 18], 140, G.lit([140, 220, 220], 0, 0, 0.1), 0.12, 61, 0.6);
    c.save(); c.beginPath(); head.path(c); c.clip(); const rg = c.createLinearGradient(0, -8.6, 0, -0.6); rg.addColorStop(0, 'rgba(120,210,214,0.28)'); rg.addColorStop(0.42, 'rgba(120,210,214,0.1)'); rg.addColorStop(0.72, 'rgba(2,24,34,0.16)'); rg.addColorStop(1, 'rgba(2,24,34,0)'); c.fillStyle = rg; c.fillRect(-10, -9, 24, 8.6); c.restore(); };   // fades out below the brow: no hard edge across the face
  headDetail();
  const fx = 0.6 + locLook[0] * 0.7, fy = -0.9 + locLook[1] * 0.4;
  const eb = { surface: () => { formShade(G, [-8.6, -8.4, 11.6, 7.8], 1, 1.2); headDetail(); }, tex: 0.22, open: eyesOpen, eyes: p.eyes, blink: p.blink, look: locLook, brow: p.brow, knit, lower: squint, skin: hFill, iris1: [150, 110, 50], iris2: [92, 62, 28], socketRGB: '2,28,38', socketA: 0.22, crease: 'rgba(2,30,40,0.9)' };
  eye(G, Object.assign({}, eb, { cx: fx + 6.5, cy: fy - 0.1, rx: 2.4, ry: 3.7, sd: 1 }));       // far eye, foreshortened
  eye(G, Object.assign({}, eb, { cx: fx + 0.7, cy: fy, rx: 3.4, ry: 4.2, sd: -1 }));           // near eye
  // brows: felt strips in the head's own colour, expressive
  { const wr = clamp(-p.brow), hp = clamp(p.brow);
    for (const [ex, erx, sd, ey] of [[fx + 0.7, 3.4, -1, fy], [fx + 6.5, 2.4, 1, fy]]) { const by = ey - 4.7 - 1.0 - hp * 0.9 + knit * 1.0 + wr * 0.4, tilt = wr * 1.9 - knit * 1.7;
      brow(G, { x0: ex - sd * erx * 0.5, y0: by - tilt * 0.55 - (wr > 0 ? 0.8 * wr : 0), x1: ex + sd * erx * 0.85, y1: by + tilt * 0.55 + 0.4 * hp, arch: 0.9 + 1.0 * hp - 0.5 * knit, w: 1.2, col: G.lit([40, 120, 128], ex, by, 0.05), shadow: 'rgba(2,24,34,0.4)' }); } }
  c.save(); c.fillStyle = 'rgba(2,28,38,0.6)'; c.beginPath(); ell(10.0, 2.0, 0.35, 0.5)(c); c.fill(); c.restore();
  mouth(G, p.mouth, p.mouthOpen, 5.6 + locLook[0] * 0.4, 4.9, 5.4, { lw: 0.42, lip: 'rgba(2,28,38,0.9)' });
  G.pop();
  // ---- pronotum: a small shield over the head's back, its front lip overhanging ----
  G.push(S);
  felt(G, PRO_PTS, lin(G, 0, -13, 0, 1, [[0, [52, 148, 158]], [0.4, BC.pro], [1, [8, 56, 72]]]), { lift: 1.4, sz: 1.3, shadow: 0.55, tex: 0.22, shadeA: 0.16, rim: 0.9, box: [1.5, -13.4, 16.8, 1], core: 1.2 });
  c.save(); c.beginPath(); PRO_PTS(c); c.clip(); const pg = c.createRadialGradient(8 + L[0] * 3, -8.5 + L[1] * 2, 0.5, 8, -8, 9); pg.addColorStop(0, 'rgba(150,230,230,0.26)'); pg.addColorStop(1, 'rgba(150,230,230,0)'); c.fillStyle = pg; c.fillRect(0, -14, 18, 15);
  c.strokeStyle = 'rgba(2,24,34,0.35)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(9.4, -12.6); c.quadraticCurveTo(10.2, -6, 9.4, 0.6); c.stroke(); c.restore();   // midline groove
  flecks(c, PRO_PTS, [1, -14, 17, 15], 70, G.lit([140, 220, 220], 8, -8, 0.1), 0.1, 77, 0.7);
  G.pop();
  // near legs in front of the shell, so the bent knees read
  G.push(R); for (let i = 0; i < 3; i++) drawBramLeg(G, rig.legs[i], p); G.pop();
}
// broad soft shadow under the shell on the ground plane; the tight per-foot contact shadows are drawn by drawBram
function bramShadow(c, s, t, q) {
  const p = normBram(q, t), rig = bramRig(p, t), G = mkG(c, p.z, apply(rig.S, -6, -12)), gy = q.ground ?? (Math.abs(p.y) < 6 ? p.y : 0), pf = groundPersp(c, s, gy), rx = 33 + 5 * G.L.k;
  groundShadow(c, G, p.x - 6 * p.face, gy, rx, clamp(rx * pf * 1.1, 1.1, rx * 0.25), 0.5 + 0.12 * p.dome);
}
C.bram = (pose = {}) => castItems('bram', pose, bramShadow, drawBram);
C._anchorBram = (pose, name, t = 0) => { const p = normBram(pose, t), r = bramRig(p, t);
  if (name === 'head') return apply(r.Hh, 0, 0); if (name === 'front') return apply(r.Hh, 11, 2); if (name === 'back') return apply(r.S, -13, -21); if (name === 'eyes') return apply(r.Hh, 3, -1);
  return apply(r.S, -8, -10); };
C._feetBram = (pose, t = 0) => { const p = normBram(pose, t), r = bramRig(p, t);
  return r.legs.map(lg => { const pts = bramFootPts(lg).map(([x, y]) => apply(r.R, x, y)), z = contactZone(pts, 0.05); return { pts, planted: lg.planted, far: lg.far, low: [(z.x0 + z.x1) / 2, z.y] }; }); };


// =====================================================================================================================
// LUMA
// =====================================================================================================================
const LC = { cream: [250, 238, 212], creamLo: [224, 206, 178], lilac: [178, 152, 224], lilacDeep: [118, 90, 176], pale: [226, 212, 244], thorax: [222, 200, 232], leg: [236, 222, 196] };
const FORE = [[0, 4], [6, 6.4], [14, 8.2], [22, 8.8], [27.4, 6.4], [29.2, 1.2], [27, -4.8], [21.5, -10.2], [14, -12.4], [7, -10.4], [2.5, -7], [0, -2.6]];
const HIND = [[0, -1.4], [5, -1.6], [12, -2.6], [18.4, -5.2], [21.8, -9.8], [20, -14.4], [14.6, -16.4], [8, -14.6], [3.2, -9.6]];
function normLuma(q, t) {
  const p = Object.assign({}, q);
  p.x = q.x ?? 0; p.y = q.y ?? 0; p.z = q.z ?? 400; p.face = (q.face ?? 1) >= 0 ? 1 : -1; p.lean = q.lean ?? 0; p.squash = clamp(q.squash ?? 1, 0.6, 1.5); p.headTilt = q.headTilt ?? 0;
  p.eyes = q.eyes ?? 1; p.look = q.look ?? [0, 0]; p.brow = q.brow ?? 0.3; p.mouth = MOUTHS.includes(q.mouth) ? q.mouth : 'smile'; p.mouthOpen = q.mouthOpen ?? OPEN_DEF[p.mouth];
  p.breath = q.breath ?? t * 0.6; p.blink = clamp((q.blink ?? 0) + (q.autoBlink === false ? 0 : autoBlink(t, q.blinkSeed ?? 23)));
  p.wings = clamp(q.wings ?? 1); p.fold = clamp(q.fold ?? 0); p.hover = q.hover === true ? 1 : q.hover === false || q.hover == null ? 0 : clamp(q.hover);
  p.flap = q.flap ?? (p.hover ? t * TAU * 4 : 0.2 * sin(t * 1.3)); p.antL = q.antL ?? 0; p.antR = q.antR ?? 0;
  // flapHz: wing beats per second. Above about 6 a single sharp wing per frame strobes at 30 fps, so the wings are drawn as a soft
  // motion fan over the stroke instead (smear 0..1). The default hover flutter is 4 Hz (v6).
  p.flapHz = q.flapHz ?? (q.flap == null && p.hover ? 4 : 0); p.smear = ss(5, 7.5, p.flapHz);   // v6: a 4 Hz hover draws one solid pair of wings, not a fan of copies
  // hold: { x, y, k } world point gripped with both front feet; k (default 1) blends the feet (and the pull of the body) onto it
  p.hold = q.hold ? { x: q.hold.x, y: q.hold.y, k: clamp(q.hold.k ?? 1) } : null;
  return p;
}
const FAN_N = 17;
const LUMA_HIP = [[3.0, 3.6], [0.2, 4.2], [-3.0, 3.8]], LUMA_L1 = 4.4, LUMA_L2 = 5.8;
function lumaRig(p, t) {
  const face = p.face, br = sin(p.breath * TAU), hover = p.hover, fa = Math.max(1 - p.wings, p.fold), openK = 1 - ss(0, 0.6, fa), flapK = p.wings * (1 - fa);
  let R = chain(T(p.x, p.y), Sc(face, 1)); const sf = sin(p.flap), sm = 1 - p.smear;   // a smeared (fast) beat no longer bobs the body each frame
  const bob = (0.9 * sf * flapK * (hover ? 1 : 0.5)) * sm + 0.12 * br, pitch = 0.07 * cos(p.flap) * flapK * sm + 0.14 * hover;
  const sq = p.squash, Bl = chain(T(0, -9.0 + bob), Rt(p.lean + pitch), Sc(1 / sqrt(sq), sq * (1 + 0.012 * br)));
  // gripping: if the hold point lies beyond a comfortable reach of the front legs, the grip pulls the whole body toward it, so the
  // front feet always land on the point (the shots place her body roughly; the feet are exact)
  if (p.hold) { const hip = apply(mul(R, Bl), LUMA_HIP[0][0], LUMA_HIP[0][1]), dx = p.hold.x - hip[0], dy = p.hold.y - hip[1], d = hyp(dx, dy), reach = (LUMA_L1 + LUMA_L2) * 0.84;
    if (d > reach) { const k = (1 - reach / d) * p.hold.k; R = mul(T(dx * k, dy * k), R); } }
  const B = mul(R, Bl);
  const Hd = chain(B, T(6.8, -0.8), Rt(p.headTilt - 0.14 * hover + 0.04 * sin(t * 1.7)));
  const iR = inv(R);
  // legs: near 0..2, far 3..5 (front, mid, hind). The knee of a held front leg bends downward so the leg passes under the chin.
  const legs = [];
  for (let i = 0; i < 6; i++) { const far = i >= 3, k = i % 3, hip = apply(chain(inv(R), B), LUMA_HIP[k][0] + (far ? 0.9 : 0), LUMA_HIP[k][1]);
    let fx = hip[0] + (k === 0 ? 4.6 : k === 1 ? 0.8 : -4.4) + (far ? 1.4 : 0), fy = 0;
    const held = k === 0 && !!p.hold, hk = held ? p.hold.k : 0;
    const tuck = hover; const tx = k === 0 ? hip[0] + 3.4 : k === 1 ? hip[0] - 0.8 : hip[0] - 3.6, ty = hip[1] + (k === 0 ? 1.8 : 4.4);
    fx = lerp(fx, tx, tuck); fy = lerp(fy, ty, tuck);
    if (held) { const th = apply(iR, p.hold.x, p.hold.y); fx = lerp(fx, th[0] + (far ? 0.9 : 0), hk); fy = lerp(fy, th[1] + (far ? 0.4 : 0), hk); }
    // a standing foot ends in a small pad whose underside rests on the ground; the leg reaches to the top of that pad
    const padH = held ? 0 : 0.95 * (1 - tuck), ax = fx, ay = fy - padH * 0.9;
    const L1 = k === 0 ? LUMA_L1 : 3.8, L2 = k === 0 ? LUMA_L2 : 4.8, r1 = ik2(hip[0], hip[1], ax, ay, L1, L2, 1), r2 = ik2(hip[0], hip[1], ax, ay, L1, L2, -1), r = (k === 0 ? r1.ey >= r2.ey : r1.ey <= r2.ey) ? r1 : r2;
    const ankle = held ? [r.hx, r.hy] : [ax, ay];
    legs.push({ far, hip, knee: [r.ex, held ? r.ey : Math.min(r.ey, -1.1)], ankle, foot: held ? [r.hx, r.hy] : [fx, fy], k, held, padH, planted: !held && tuck < 0.05 }); }   // the front knee folds down under the chin but never touches the ground
  // wings: 3D basis per wing (a forward, l toward camera, v up) projected with yaw/pitch
  const cY = 0.74, sY = 0.67, cP = 0.97, sP = 0.24;
  const proj = (a, l, v) => [a * cY - l * sY, -v * cP + l * sP];
  const nv = [sY * cP, cY * cP, cY * sP], nvl = hyp(nv[0], nv[1], nv[2]);   // view direction in wing space
  // sv, cv (optional) replace sin and cos of the beat phase: the motion fan samples the whole stroke this way
  const mkWing = (side, hind, sv, cv) => {
    const far = side < 0, e = hind ? 0.38 : 0, fl = p.flap - e, sinF = sv ?? sin(fl), cosF = cv ?? cos(fl), ampK = (1 - fa * 1.3 > 0 ? 1 - fa * 1.3 : 0), amp = 48 * PI / 180 * p.wings * ampK * (far ? 0.72 : 1);
    // fold in two stages: raise (stage 1), then lower toward ~15 degrees while sweeping back so the wings tent low over the body (stage 2)
    const fold1 = ss(0, 0.5, fa), fold2 = ss(0.5, 1, fa);
    let phi = lerp(30, 88, fold1) * PI / 180 + amp * sinF + (hind ? 0.1 : 0);
    phi = lerp(phi, 15 * PI / 180 + (hind ? 0.06 : 0), fold2);
    if (far) phi = Math.max(phi, lerp(0.2, 0.05, fa));
    let psi = (1.12 * ss(0.45, 1, fa)) + (hind ? 0.06 * openK : 0);
    const cf = cos(phi), sf2 = sin(phi);
    if (far) psi = Math.max(psi, 0.58 * cf * cf * p.wings * (1 - fa));   // far wings stay swept back behind the head
    const cp = cos(psi), sp = sin(psi), tau = 0.5 * ss(0.6, 1, fa);
    const S3 = [-sp, cp * side * cf, cp * sf2], C0 = [cp, sp * side * cf, sp * sf2];
    const N0 = [S3[1] * C0[2] - S3[2] * C0[1], S3[2] * C0[0] - S3[0] * C0[2], S3[0] * C0[1] - S3[1] * C0[0]];
    const C3 = [C0[0] * cos(tau) + side * N0[0] * sin(tau), C0[1] * cos(tau) + side * N0[1] * sin(tau), C0[2] * cos(tau) + side * N0[2] * sin(tau)];   // tent roll when folded
    const N3 = [S3[1] * C3[2] - S3[2] * C3[1], S3[2] * C3[0] - S3[0] * C3[2], S3[0] * C3[1] - S3[1] * C3[0]], nl = hyp(N3[0], N3[1], N3[2]) || 1;
    const dotN = Math.abs(N3[0] * nv[0] + N3[1] * nv[1] + N3[2] * nv[2]) / (nl * nvl);
    const vis = lerp(ss(0.04, 0.17, dotN), 1, ss(0.3, 0.7, fa));   // an edge-on wing fades out instead of showing as a needle
    const flex = -3.4 * cosF * (amp / (48 * PI / 180 || 1)) * (amp > 0 ? 1 : 0) * 0.9, hinge = [hind ? -0.2 : 1.6, 0, 3.0];
    const map = (u, w) => { const f = flex * (u / 28) ** 2;
      return proj(hinge[0] + u * S3[0] + w * C3[0] + f * N3[0], hinge[1] + u * S3[1] + w * C3[1] + f * N3[1], hinge[2] + u * S3[2] + w * C3[2] + f * N3[2]); };
    return { map, side, hind, phi, psi, vis };
  };
  const wingsRig = { farHind: mkWing(-1, true), farFore: mkWing(-1, false), nearHind: mkWing(1, true), nearFore: mkWing(1, false) };
  // motion fan for a fast beat: the wing at FAN_N phases spread evenly in time over one stroke (so denser at the two turning points,
  // where a real wing lingers); it depends on the amplitude only, not on the phase, so it reads the same on every frame
  const fan = p.smear > 0.01 ? Object.fromEntries(Object.entries({ farHind: [-1, true], farFore: [-1, false], nearHind: [1, true], nearFore: [1, false] })
    .map(([k, [sd, hd]]) => [k, Array.from({ length: FAN_N }, (_, j) => { const a = -HALFPI + PI * j / (FAN_N - 1); return mkWing(sd, hd, sin(a), 0); })])) : null;
  return { R, B, Hd, legs, wings: wingsRig, fan, br, hover, fa, flapK };
}
function fuzz(c, x0, y0, x1, y1, r, n, col, seed) { // soft hairs poking out of a limb's silhouette
  const dx = x1 - x0, dy = y1 - y0, dl = hyp(dx, dy) || 1, tx = dx / dl, ty = dy / dl, nx = -ty, ny = tx;
  c.save(); c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 0.18; c.lineCap = 'round'; c.beginPath();
  for (let i = 0; i < n; i++) { const u = hash(i, seed), sd = hash(i, seed + 1) < 0.5 ? -1 : 1, l = 0.35 + hash(i, seed + 2) * 0.55, sw = (hash(i, seed + 3) - 0.5) * 0.9, rr = r * (1 - 0.25 * u),
      px = x0 + dx * u + nx * sd * rr * 0.9, py = y0 + dy * u + ny * sd * rr * 0.9; c.moveTo(px, py); c.quadraticCurveTo(px + nx * sd * l * 0.6 + tx * sw * 0.3, py + ny * sd * l * 0.6 + ty * sw * 0.3, px + nx * sd * l + tx * sw, py + ny * sd * l + ty * sw); }
  c.stroke(); c.restore(); }
function drawLumaLeg(G, lg) {
  const c = G.c, col = lg.far ? [188, 170, 156] : LC.leg;
  const [hx, hy] = lg.hip, [kx, ky] = lg.knee, [fx, fy] = lg.foot, [ax, ay] = lg.ankle, bx = [Math.min(hx, kx, fx) - 1.6, Math.min(hy, ky, fy) - 1.6, Math.max(hx, kx, fx) + 1.6, Math.max(hy, ky, fy) + 1.6];
  const fr = lg.k === 0 ? 1.22 : 1;   // the front legs do the gripping and lifting: a little sturdier than the others
  const fem = capsule(hx, hy, kx, ky, 1.25 * fr, 1.0 * fr), tib = capsule(kx, ky, ax, ay, 1.0 * fr, 0.72 * fr * (lg.k === 0 ? 1.12 : 1));
  felt(G, tib, G.lit(col, fx, fy, 0.1), { lift: 0.4, sz: 0.35, shadow: 0.3, tex: 0.25, box: bx, shadeA: 0.1 });
  felt(G, fem, G.lit(col, kx, ky, 0.1), { lift: 0.4, sz: 0.35, shadow: 0.3, tex: 0.25, box: bx, shadeA: 0.1 });
  c.save(); c.fillStyle = G.lit(col, kx, ky, 0.1); c.beginPath(); ell(kx, ky, 1.0 * fr, 1.0 * fr)(c); c.fill(); c.restore();   // soft round knee, no hard joint
  fuzz(c, hx, hy, kx, ky, 1.2, 40, G.lit([255, 248, 228], kx, ky, 0.1), 5); fuzz(c, kx, ky, ax, ay, 0.9, 34, G.lit([255, 248, 228], fx, fy, 0.1), 15);
  const ph = lg.padH > 0 ? lg.padH : 0.95, pcy = lg.padH > 0 ? fy - lg.padH : fy - 0.1;
  if (lg.held) { // gripping foot: the pad presses onto the point and two small hooked claws curl over and under it
    const cc = G.lit(lg.far ? [120, 96, 92] : [150, 120, 104], fx, fy, 0.03);
    c.save(); c.lineCap = 'round'; c.strokeStyle = cc; c.lineWidth = 0.42;
    for (const dx of [-0.5, 0.7]) { c.beginPath(); c.moveTo(fx + dx, fy - 0.2); c.quadraticCurveTo(fx + dx + 0.9, fy + 0.5, fx + dx + 0.3, fy + 1.25); c.stroke(); }
    c.restore();
    felt(G, ell(fx + 0.1, fy - 0.55, 1.6, 0.9), G.lit(lg.far ? [170, 150, 140] : [214, 196, 170], fx, fy, 0.05), { lift: 0.3, sz: 0.3, shadow: 0.35, tex: 0.25, shade: false, box: [fx - 1.5, fy - 1.5, fx + 1.7, fy + 0.4] });
    return; }
  felt(G, ell(fx + 0.35, pcy, 1.5, ph), G.lit(lg.far ? [170, 150, 140] : [214, 196, 170], fx, fy, 0.05), { lift: 0.3, sz: 0.3, shadow: 0.3, tex: 0.25, shade: false, box: [fx - 1.2, fy - 1, fx + 2, fy + 1] });
}
function drawWing(G, W, o) {
  if (W.vis < 0.02) return;
  G.soft = 0.42;
  const c = G.c, A0 = c.globalAlpha, { map, hind, side, vis } = W, pts = hind ? HIND : FORE, N = G.s > 14 ? 7 : G.s > 7 ? 5 : 3;   // denser outline in close-ups
  const bw = blob(pts, 1), samp = bw.sample(N).map(s => map(s.x, s.y)), path = k => smoothPoly(k, samp);
  const root = map(0, hind ? -4 : 0), tip = map(hind ? 18 : 24, hind ? -9 : 2);
  const dark = side < 0;
  const base0 = hind ? [226, 208, 206] : [224, 208, 238], base1 = hind ? [198, 176, 220] : [182, 158, 222], base2 = hind ? [138, 110, 188] : [126, 98, 186];
  const fill = lin(G, root[0], root[1], tip[0], tip[1], [[0, base0, 0.02], [0.5, base1, 0.02], [1, base2, 0.02]]);
  const xs = samp.map(p => p[0]), ys = samp.map(p => p[1]);
  c.save(); c.globalAlpha = A0 * (vis);
  felt(G, path, fill, { lift: dark ? 0.9 : 1.2, sz: 0.9, shadow: dark ? 0.3 : 0.4, tex: 0.3, shadeA: 0.1, rim: 0.45, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], core: 0.7 });
  c.save(); c.beginPath(); path(c); c.clip();
  const aff = (u, w) => { const o0 = map(u, w), ux = map(u + 1, w), wx = map(u, w + 1); return [ux[0] - o0[0], ux[1] - o0[1], wx[0] - o0[0], wx[1] - o0[1], o0[0], o0[1]]; };
  c.lineJoin = 'round'; c.beginPath(); path(c); c.strokeStyle = G.lit(hind ? [250, 238, 214] : [246, 232, 232], root[0], root[1], 0.1, 0.55 * vis); c.lineWidth = 1.5; c.stroke();
  c.beginPath(); path(c); c.strokeStyle = G.lit(LC.lilacDeep, tip[0], tip[1], 0.05, 0.9 * vis); c.lineWidth = 0.5; c.stroke();
  // veins
  c.lineCap = 'round'; c.strokeStyle = G.lit([240, 228, 250], root[0], root[1], 0.15, 0.7 * vis); c.lineWidth = 0.22; c.beginPath();
  const V = hind ? 6 : 8;
  for (let i = 0; i < V; i++) { const k = i / (V - 1), ex = hind ? lerp(17, 9, k) : lerp(26, 8, k), ey = hind ? lerp(-3, -14.5, k) : lerp(8.2, -10.5, k); let first = true;
    for (let j = 0; j <= 8; j++) { const u = j / 8, uu = lerp(0.6, ex, u), ww = lerp(hind ? -2 : 1.6, ey, u * u * 0.9 + u * 0.1) + (hind ? 0 : -0.8 * sin(u * PI) * (k - 0.5)), pp = map(uu, ww); first ? c.moveTo(pp[0], pp[1]) : c.lineTo(pp[0], pp[1]); first = false; } }
  c.stroke();
  c.beginPath(); for (const [ua, ub] of (hind ? [[9, 12], [14, 17]] : [[10, 14], [17, 21]])) { let first = true; for (let j = 0; j <= 8; j++) { const w = lerp(hind ? -2.5 : 7, hind ? -14 : -9.5, j / 8), pp = map(lerp(ua, ub, 0.5 + 0.5 * sin(j / 8 * PI - PI / 2) * 0.2), w + 0); first ? c.moveTo(pp[0], pp[1]) : c.lineTo(pp[0], pp[1]); first = false; } }
  c.globalAlpha = A0 * (0.45 * vis); c.stroke(); c.globalAlpha = A0 * (vis);
  // eyespot: a soft blurred spot, not a target
  const [sx, sy] = hind ? [14, -9] : [20, 1.6], A = aff(sx, sy);
  c.save(); c.transform(A[0], A[1], A[2], A[3], A[4], A[5]);
  const eg = c.createRadialGradient(0, 0, 0, 0, 0, 3.6); eg.addColorStop(0, G.lit([252, 244, 228], A[4], A[5], 0.2, 0.55)); eg.addColorStop(0.45, G.lit([200, 176, 226], A[4], A[5], 0.05, 0.32)); eg.addColorStop(1, G.lit([150, 120, 200], A[4], A[5], 0.05, 0));
  c.fillStyle = eg; c.beginPath(); ell(0, 0, 3.6, 3.1)(c); c.fill(); c.restore();
  // soft scales: a sparse scatter of tiny fibres along the span
  c.lineWidth = 0.18; for (const [col, a, seed] of [[LC.pale, 0.16, 3], [LC.lilacDeep, 0.12, 9]]) { c.strokeStyle = G.lit(col, tip[0], tip[1], 0.1); c.globalAlpha = A0 * (a * vis); c.beginPath();
    for (let i = 0; i < 70; i++) { const u = hash(i, seed) * (hind ? 22 : 29), w = (hind ? -17 : -12.5) + hash(i, seed + 1) * (hind ? 17 : 22), p0 = map(u, w), p1 = map(u + 0.9 + hash(i, seed + 2) * 0.8, w + (hash(i, seed + 3) - 0.5) * 0.5); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); } c.stroke(); }
  c.restore();
  c.save(); c.globalAlpha = A0 * (0.35 * G.L.k * vis); c.beginPath(); path(c); c.strokeStyle = `rgb(${G.L.col[0] | 0},${G.L.col[1] | 0},${G.L.col[2] | 0})`; c.lineWidth = 0.25; c.stroke(); c.restore();
  c.restore();
  G.soft = 0;
}
// A fast beat drawn as one soft translucent fan: each sampled wing pose is a faint lilac film, the overlaps build up toward the
// hinge, and the two turning points carry a light edge, so the beat reads as a blur of wing with the moth sharp in the middle.
function drawWingFan(G, poses, k) {
  const c = G.c, hind = poses[0].hind, pts = hind ? HIND : FORE, N = G.s > 14 ? 5 : 3, bw = blob(pts, 1), samp0 = bw.sample(N);
  G.soft = 0.5; c.save();
  const n = poses.length, root = poses[n >> 1].map(0, 0), tip = poses[n >> 1].map(hind ? 18 : 24, hind ? -9 : 2);
  const fill = lin(G, root[0], root[1], tip[0], tip[1], [[0, hind ? [226, 208, 214] : [228, 214, 240], 0.03], [1, hind ? [160, 132, 204] : [150, 124, 206], 0.03]]);
  poses.forEach((W, j) => { if (W.vis < 0.02) return; const edge = j === 0 || j === n - 1, path = q => smoothPoly(q, samp0.map(s => W.map(s.x, s.y)));
    c.globalAlpha = k * W.vis * (edge ? 0.07 : 0.06); c.beginPath(); path(c); c.fillStyle = fill; c.fill(); });   // v6: one soft blur, no outlined end copies (they read as a second moth)
  c.restore(); G.soft = 0;
}
function drawAntenna(G, base, ang, len, near, t, i) {
  const c = G.c, a = ang, ax = cos(a), ay = sin(a), nx = -ay, ny = ax, bend = 0.9;
  const pt = u => { const cu = u * u * bend; return [base[0] + ax * len * u + nx * cu * (len * 0.3), base[1] + ay * len * u + ny * cu * (len * 0.3)]; };
  const col = near ? [240, 226, 202] : [184, 168, 170];
  c.save(); c.lineCap = 'round';
  c.beginPath(); for (let j = 0; j <= 12; j++) { const p0 = pt(j / 12); j ? c.lineTo(p0[0], p0[1]) : c.moveTo(p0[0], p0[1]); } c.strokeStyle = 'rgba(3,6,16,0.3)'; c.lineWidth = 0.7; c.translate(0.3, 0.4); c.stroke(); c.restore();
  c.save(); c.lineCap = 'round'; c.beginPath(); for (let j = 0; j <= 12; j++) { const p0 = pt(j / 12); j ? c.lineTo(p0[0], p0[1]) : c.moveTo(p0[0], p0[1]); } c.strokeStyle = G.lit(col, base[0], base[1], 0.1); c.lineWidth = 0.6; c.stroke();
  c.beginPath(); for (let j = 1; j <= 15; j++) { const u = j / 16, p0 = pt(u), p1 = pt(Math.min(1, u + 0.04)), tx = p1[0] - p0[0], ty = p1[1] - p0[1], tl = hyp(tx, ty) || 1, bl = 4.4 * (1 - u * 0.8) * (near ? 1 : 0.9);
    for (const sg of [-1, 1]) { const dx = (tx / tl) * 0.55 - sg * (ty / tl) * 0.83, dy = (ty / tl) * 0.55 + sg * (tx / tl) * 0.83; c.moveTo(p0[0], p0[1]); c.lineTo(p0[0] + dx * bl, p0[1] + dy * bl + 0.25 * bl * u); } }
  c.strokeStyle = G.lit(col, base[0], base[1], 0.1); c.lineWidth = 0.2; c.globalAlpha = 0.9; c.stroke(); c.restore();
}
function drawLuma(c, s, t, q) {
  const p = normLuma(q, t), rig = lumaRig(p, t), { R, B, Hd } = rig, face = p.face, G = mkG(c, p.z, apply(B, 0, 0)); G.s = s;
  const locLook = [p.look[0] * face, p.look[1]], eyesOpen = p.eyes * (1 - p.blink);
  const ant = (i, near) => { const bob = 0.14 * sin(t * 5.3 + i * 2) + 0.1 * cos(p.flap) * rig.flapK * (1 - p.smear), base = [(near ? 1.8 : 0.0), -4.4];
    return { base, ang: -1.15 + (near ? -0.18 : 0.12) + (i ? p.antR : p.antL) + bob + 0.12 * p.headTilt }; };
  const heldLeg = rig.legs[0].held;
  // contact shadows under the standing feet (they fade out as she lifts off)
  if (q.shadow !== false) { const gy = q.ground ?? 0, pf = groundPersp(c, s, gy); plantedShadow(c, s, t, 'luma', q, 'far');
    for (const lg of rig.legs) if (!lg.held) { const z = contactZone(lumaFootPts(lg).map(([x, y]) => apply(R, x, y)), 0.25); contactShadow(c, G, z.x0, z.x1, gy, gy - z.y, pf, lg.far ? 0.7 : 1); } }
  // far side: legs and wings
  G.push(R); for (let i = 3; i < 6; i++) drawLumaLeg(G, rig.legs[i]); G.pop();
  const wing = key => { if (p.smear < 0.99) { const a0 = c.globalAlpha; c.globalAlpha = a0 * (1 - p.smear); drawWing(G, rig.wings[key], p); c.globalAlpha = a0; }
    if (rig.fan) drawWingFan(G, rig.fan[key], p.smear); };
  G.push(B); wing('farHind'); wing('farFore'); G.pop();
  // body: a short abdomen mostly tucked under the wings, a round thorax and a big cream fur ruff
  G.push(B);
  const abd = blob([[-1.6, -2.8], [-4.2, -2.8], [-6.8, -1.6], [-7.8, 0.6], [-6.4, 2.8], [-3.4, 3.4], [-0.6, 2.8]]);
  felt(G, abd.path, lin(G, 0, -3, 0, 3.6, [[0, [250, 240, 218]], [1, [214, 194, 170]]]), { lift: 0.5, sz: 1.0, blob: abd, hairLen: 1.5, hairN: 16, seed: 81, shadeA: 0.12, hairCol: [255, 248, 230], shadow: 0.25 });
  const thor = blob([[0.6, -5.0], [3.8, -4.2], [5.4, -0.2], [4.2, 3.8], [0, 4.9], [-3.4, 3.6], [-4.6, -0.4], [-3.0, -4.0]]);
  felt(G, thor.path, lin(G, 0, -5, 0, 4.9, [[0, LC.thorax], [0.35, [238, 224, 232]], [1, LC.cream]]), { lift: 0.6, sz: 1.1, blob: thor, hairLen: 1.5, hairN: 16, seed: 91, shadeA: 0.12, hairCol: [255, 250, 236], shadow: 0.25 });
  flecks(c, thor.path, [-5, -5.5, 11, 11], 110, G.lit([255, 255, 245], 0, 0, 0.1), 0.3, 83, 0.9);
  const ruff = blob([[2.0, -5.6], [5.6, -4.8], [8.0, -0.8], [7.2, 3.8], [4.0, 6.2], [0.6, 5.4], [-0.6, 1.0], [-0.4, -3.6]]);
  felt(G, ruff.path, lin(G, 0, -5, 0, 6, [[0, [252, 244, 224]], [1, [236, 220, 196]]]), { lift: 0.6, sz: 1.2, blob: ruff, hairLen: 2.6, hairN: 26, seed: 111, shadeA: 0.1, hairCol: [255, 252, 240], tex: 0.5, shadow: 0.25 });
  flecks(c, ruff.path, [-1, -6, 10, 12], 130, G.lit([255, 255, 248], 4, 0, 0.1), 0.35, 87, 1.2);
  G.pop();
  // near legs (mid and hind)
  G.push(R); for (let i = 1; i < 3; i++) drawLumaLeg(G, rig.legs[i]); G.pop();
  // far antenna, near wings
  G.push(Hd); { const a = ant(1, false); drawAntenna(G, a.base, a.ang, 13, false, t, 1); } G.pop();
  G.push(B); wing('nearHind'); wing('nearFore'); G.pop();
  if (heldLeg) { G.push(R); drawLumaLeg(G, rig.legs[0]); G.pop(); }   // gripping: the front leg passes beneath the chin
  // head: at least as wide as the thorax, big glossy eyes set wide apart
  G.push(Hd);
  const head = blob([[0.0, -5.4], [2.8, -4.7], [4.8, -2.7], [5.7, 0.0], [5.0, 2.7], [2.9, 4.7], [0.0, 5.4], [-2.9, 4.7], [-5.0, 2.7], [-5.7, 0.0], [-4.8, -2.7], [-2.8, -4.7]]);
  const hFill = lin(G, 0, -5.2, 0, 5.4, [[0, [252, 244, 224]], [1, [228, 210, 186]]]);
  felt(G, head.path, hFill, { lift: 0.9, sz: 0.9, blob: head, hairLen: 1.4, hairN: 14, seed: 101, shadeA: 0.1, hairCol: [255, 250, 238] });
  const fx = 0.7 + locLook[0] * 0.5, fy = -0.3 + locLook[1] * 0.25, ch = 0.45 + 0.3 * clamp(p.brow);
  for (const sd of [-1, 1]) { const cx2 = fx + sd * 3.2 + 0.4, cy2 = fy + 3.0; c.save(); c.fillStyle = rad(G, cx2, cy2, 0, cx2, cy2, 1.8, [[0, [236, 140, 150], 0.3, 0.5 * ch], [1, [236, 140, 150], 0.1, 0]]); c.beginPath(); ell(cx2, cy2, 1.9, 1.2)(c); c.fill(); c.restore(); }
  const knit = p.mouth === 'grit' ? 0.7 : p.mouth === 'frown' ? 0.4 : 0;
  const eb = { surface: () => formShade(G, [-5.7, -5.4, 5.7, 5.4], 1, 1), open: eyesOpen, eyes: p.eyes, blink: p.blink, look: locLook, brow: p.brow, knit, lower: p.mouth === 'laugh' ? 0.5 : 0, skin: hFill, iris1: [120, 90, 150], iris2: [60, 40, 84], socketRGB: '90,60,90', socketA: 0.18, crease: 'rgba(54,30,60,0.9)', ls: 0.7, lashes: 2 };
  eye(G, Object.assign({}, eb, { cx: fx + 3.5, cy: fy, rx: 1.95, ry: 2.8, sd: 1 }));
  eye(G, Object.assign({}, eb, { cx: fx - 1.5, cy: fy, rx: 2.55, ry: 3.2, sd: -1 }));
  mouth(G, p.mouth, p.mouthOpen, fx + 1.3, fy + 3.7, 2.4, { lw: 0.2 });
  { const a = ant(0, true); drawAntenna(G, a.base, a.ang, 14, true, t, 0); }
  G.pop();
  if (!heldLeg) { G.push(R); drawLumaLeg(G, rig.legs[0]); G.pop(); }
}
// broad soft shadow under Luma (grows and fades with height); the tight contact under each standing foot is drawn by drawLuma
function lumaShadow(c, s, t, q) {
  const p = normLuma(q, t), rig = lumaRig(p, t), G = mkG(c, p.z, apply(rig.B, 0, 0)), gy = q.ground ?? 0, h = clamp(-(p.y - gy) / 70), pf = groundPersp(c, s, gy), rx = 9 + 9 * h;
  groundShadow(c, G, p.x, gy, rx, clamp(rx * pf * 1.2, 0.7, rx * 0.3), 0.5 * (1 - 0.8 * h));
}
function lumaFootPts(lg) { const [fx, fy] = lg.foot, ph = lg.padH > 0 ? lg.padH : 0.95, cy = lg.padH > 0 ? fy - lg.padH : fy - 0.1, out = [];
  for (let i = 0; i <= 16; i++) { const a = PI * i / 16; out.push([fx + 0.35 + 1.5 * cos(a), cy + ph * sin(a)]); } return out; }
C.luma = (pose = {}) => castItems('luma', pose, lumaShadow, drawLuma);
C._anchorLuma = (pose, name, t = 0) => { const p = normLuma(pose, t), r = lumaRig(p, t);
  if (name === 'head') return apply(r.Hd, 0, 0); if (name === 'body') return apply(r.B, 0, 0); if (name === 'footFront') return apply(r.R, ...r.legs[0].foot);
  if (name === 'wingtip') return apply(r.B, ...r.wings.nearFore.map(24, 2)); return apply(r.B, 0, 0); };
C._feetLuma = (pose, t = 0) => { const p = normLuma(pose, t), r = lumaRig(p, t);
  return r.legs.map(lg => { const pts = lumaFootPts(lg).map(([x, y]) => apply(r.R, x, y)), z = contactZone(pts, 0.05); return { pts, planted: lg.planted, far: lg.far, low: [(z.x0 + z.x1) / 2, z.y] }; }); };

// =====================================================================================================================
// shared: card turns and planted contact shadows
// =====================================================================================================================
// body centre (world x) about which a turning puppet narrows, and its width k; null when it is not turning (|face| = 1)
function turnCentre(who, pose, t) { const k = turnK(pose.face); if (k >= 0.999) return null;
  if (who === 'pip') { const r = pipRig(normPip(pose, t), t); return { k: Math.max(0.06, k), cx: apply(r.B, 0, -10)[0] }; }
  if (who === 'bram') { const r = bramRig(normBram(pose, t), t); return { k: Math.max(0.06, k), cx: (apply(r.Hh, 11, 2)[0] + apply(r.S, -13, -21)[0]) / 2 }; }
  const r = lumaRig(normLuma(pose, t), t); return { k: Math.max(0.06, k), cx: apply(r.B, 0, 0)[0] }; }
// Planted shadow: a soft, dark, flattened pool on the ground under each foot (and a broader, fainter one under the body), shrinking and
// fading as the foot lifts. Its item sits just in front of the puppet (z - rd) so the turf rows nearer than the feet, which would cover
// the near half of a shadow drawn at the puppet's own depth, are already down; the puppet's own feet are cut out of it, so it never
// darkens a boot or a pad. rd is its depth on the ground. pose.shadow = false removes it (and the other ground shadows).
// A low camera sees the ground almost edge-on, so a true footprint would be a hairline; the pool keeps a readable minimum height (up to
// what its item's lead `off` in depth can carry without the nearer turf covering it). The half behind the ground line is drawn inside the
// puppet's own item, under the puppet (part 'far'); the half in front, in the planted item (part 'near').
const PLANT = { pip: { pad: 1.6, w: 1.15, pool: 5, a: 0.8, off: 18 }, bram: { pad: 1.3, w: 1.1, pool: 6, a: 0.68, off: 20 }, luma: { pad: 0.8, w: 1.25, pool: 2.5, a: 0.6, off: 10 } };
function plantedShadow(c, s, t, who, q, part) {
  const cfg = PLANT[who], feet = part === 'far' ? feet0(who, q, t) : C.feet(who, q, t), gy = q.ground ?? (who === 'luma' ? 0 : q.y ?? 0), pf = groundPersp(c, s, gy);
  let poolK = 1; if (who === 'pip') { const p = normPip(q, t); poolK = (1 - ss(0.2, 0.7, p.sit)) * (1 - ss(0.1, 0.5, p.onBack)); }
  if (who === 'luma' && q.hold) poolK = 0.4;
  const pads = feet.map(f => { const z = contactZone(f.pts, 0.4), h = Math.max(0, gy - z.y); return { x0: z.x0, x1: z.x1, h, k: Math.exp(-h / 5) * (f.far ? 0.7 : 1) }; }).filter(f => f.k > 0.02);
  if (!pads.length) return;
  c.save(); c.beginPath(); if (part === 'far') c.rect(-1e5, gy - 1e4, 2e5, 1e4); else c.rect(-1e5, gy, 2e5, 1e4); c.clip();
  c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); for (const f of feet) { const n = f.pts.length; c.moveTo(f.pts[0][0], f.pts[0][1]); for (let i = 1; i < n; i++) c.lineTo(f.pts[i][0], f.pts[i][1]); c.closePath(); }
  c.clip('evenodd');
  const blot = (x, rx, rd, a) => { const ry = Math.max(0.3, rd * pf, Math.min(rx * 0.32, cfg.off * pf * 0.8)); c.save(); c.translate(x, gy + ry * 0.22); c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(2,4,12,${a})`); g.addColorStop(0.45, `rgba(2,4,12,${a * 0.62})`); g.addColorStop(1, 'rgba(2,4,12,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore(); };
  // the body pool: under the span of the feet that are down, fainter as they all lift (the flight phase of a run)
  if (poolK > 0.02) { let x0 = 1e9, x1 = -1e9, kk = 0; for (const f of pads) { x0 = Math.min(x0, f.x0); x1 = Math.max(x1, f.x1); kk = Math.max(kk, f.k); }
    blot((x0 + x1) / 2, (x1 - x0) / 2 + cfg.pool * 0.9, cfg.pool, 0.42 * kk * poolK); }
  for (const f of pads) { const shrink = 1 - 0.5 * clamp(f.h / 10), rx = ((f.x1 - f.x0) / 2 * cfg.w + cfg.pad) * shrink; blot((f.x0 + f.x1) / 2, rx, Math.min(cfg.pool, rx * 0.6), cfg.a * f.k); }
  c.restore(); }
// The items for one puppet: the broad ground shadow behind it, the puppet (narrowed while it turns) and the planted shadow in front.
// The planted item is drawn at a nearer depth only for its place in the draw order; it draws in the puppet's own projection (the canvas
// transform the puppet item had a moment earlier in the same frame, handed over in `ref` and cleared as it is used, so nothing carries
// from one frame to the next; without it, nothing is drawn).
function castItems(who, pose, broad, draw) {
  const z = pose.z ?? 400, on = pose.shadow !== false, out = [], ref = { m: null, s: 0 };
  if (on) out.push({ z: z + 0.8, draw: (c, s, t) => broad(c, s, t, pose) });
  out.push({ z, draw: (c, s, t) => { ref.m = c.getTransform(); ref.s = s; const tc = turnCentre(who, pose, t); if (!tc) return draw(c, s, t, pose); cardTurn(c, tc.k, tc.cx, () => draw(c, s, t, pose)); } });
  if (on) out.push({ z: z - PLANT[who].off - 0.3, draw: (c, s, t) => { const m = ref.m, sp = ref.s; ref.m = null; if (!m) return;
    c.save(); c.setTransform(m); plantedShadow(c, sp, t, who, pose, 'near'); c.restore(); } });
  return out; }

})();
