// Pip and the Missing Glow. Act 1, the garden goes dark (shots s01-s07, 0-39 s): the glow and the hook, the rule, the dark arriving,
// the stem dying, the failed fixes, the dry cup. Each shot is B[name] = (u, T) => scene; u = time inside the shot, T = film time.
// Helpers come from shots.js (P.SH). Every frame is a pure function of T.
(() => {
const P = window.PIP, { K, KL, ss, clamp, lerp, bump, noise, hash, TAU, W, H } = P;
const { B, START, HERO, cam, breathe, scene, pip, blink } = P.SH;
const S2 = START['s02-pour'], S4 = START['s04-dark-comes'], S5 = START['s05-stem-dies'], S6 = START['s06-fixes'], S7 = START['s07-dry-dipper'];
const fpart = v => v - Math.floor(v);

// Lens shift: slides the picture up (negative px) or down (positive px) without pitching the camera, so verticals stay vertical and
// flat paper layers keep their look. Only world items slide: the sky is screen-locked, so it can never leave a seam at the top. The
// ground is only built a little way below the frame, so for an upward shift a soft dark floor covers the bottom edge. Halo lights
// are moved to match their world position.
const lensShift = (sc, px, floor = true, hx = 0) => {
  if (!px && !hx) return sc;
  const cm = sc.cam, wrap = it => it.screen ? it : { ...it, draw: (c, s, t) => { c.save(); c.translate(hx / s, px / s); it.draw(c, s, t); c.restore(); } };
  const lights = [];
  for (const L of sc.lights) {
    if (!(L.halo > 0)) { lights.push(L); continue; }
    lights.push({ ...L, halo: 0 });
    const k = Math.max(L.z - cm.z, 1e-3) / cm.f;
    lights.push({ x: L.x + hx * k, y: L.y + px * k, z: L.z, col: L.col, i: L.i, rad: 0.01, halo: L.halo });
  }
  const items = sc.items.map(wrap);
  if (px < -20 && floor) {
    const y0 = H + 90 + px - 70;
    items.push({ z: cm.z + 12, screen: true, draw: c => { const g = c.createLinearGradient(0, y0, 0, y0 + 90); g.addColorStop(0, 'rgba(8,20,28,0)'); g.addColorStop(0.6, 'rgba(8,20,28,0.92)'); g.addColorStop(1, 'rgba(6,14,22,1)');
      c.fillStyle = g; c.fillRect(0, y0, W, H - y0); } });
  }
  return { ...sc, items, lights };
};

// Walking along eased keyframes [[t, x], ...]: position, gait phase from the distance covered (planted feet never skate), `mov`
// (0..1 speed, scales the stride and body turn) and the direction of travel.
const ADV = P.cast.walkAdvance(8);
const walkPath = (u, ks) => {
  let d = 0;
  for (let i = 1; i < ks.length; i++) { const seg = Math.abs(ks[i][1] - ks[i - 1][1]); if (u >= ks[i][0]) d += seg; else if (u > ks[i - 1][0]) d += seg * ss(ks[i - 1][0], ks[i][0], u); }
  const x = K(u, ks), v = (K(u + 0.04, ks) - K(u - 0.04, ks)) / 0.08, mov = clamp(Math.abs(v) / 14);
  return { x, phase: d / ADV, mov, moving: mov > 0.03, dir: v < 0 ? -1 : 1 };
};
// Turn on the spot: at t0 he squashes slightly (anticipation), swings through facing front and comes round to the new side over
// `dur` s. turns = [[t0, newFace], ...]. Returns the facing, a yaw multiplier (0 = facing the camera) and a squash.
const turning = (u, start, turns, dur = 0.28) => {
  let face = start, yawK = 1, sq = 1;
  for (const [t0, f] of turns) {
    if (u >= t0 + dur / 2) face = f;
    yawK = Math.min(yawK, clamp(Math.abs(u - (t0 + dur / 2)) / (dur / 2)));
    sq -= 0.06 * Math.max(0, 1 - Math.abs(u - (t0 - 0.06)) / 0.14) + 0.03 * Math.max(0, 1 - Math.abs(u - (t0 + dur)) / 0.12);
  }
  return { face, yawK, sq };
};

// Items re-sorted dz units nearer the camera but drawn exactly where they were (same screen position, size and blur): puts a character in
// front of the grass between him and the lens, so his boots stay visible, without moving him.
const blurAtZ = (c, z) => (c.ap ?? 0) * Math.abs(1 / Math.max(c.focus - c.z, 1e-3) - 1 / Math.max(z - c.z, 1e-3)) * c.f * 0.01;
const forward = (items, c, dz) => [items].flat(Infinity).filter(it => it && it.draw).map(it => { const z0 = it.z, z1 = z0 - dz;
  return { z: z1, blur: it.blur ?? blurAtZ(c, z0), draw(ctx, s1, t) { const s0 = P.scaleAt(c, z0), k = s0 / s1; ctx.save(); ctx.translate(c.x * (1 - k), c.y * (1 - k)); ctx.scale(k, k); it.draw(ctx, s0, t); ctx.restore(); } }; });

// A soft dark pool between a pale backdrop and the actor, so his silhouette separates from it.
const shade = (x, y, z, rx, ry, a = 0.4) => ({ z, draw(c) {
  c.save(); c.translate(x, y); c.scale(1, ry / rx); const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(8,16,40,${a})`); g.addColorStop(0.55, `rgba(8,16,40,${a * 0.7})`); g.addColorStop(1, 'rgba(8,16,40,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore(); } });
// The same pool laid along a slanted shape (ang: radians), for the shadow the bowed bloom drops along one of its big leaves.
const shadeAlong = (x, y, z, rx, ry, ang, a = 0.4) => ({ z, draw(c) { c.save(); c.translate(x, y); c.rotate(ang); shade(0, 0, z, rx, ry, a).draw(c); c.restore(); } });

// The water in a wide (o.dip = { u, w, k } darkens it for a moment around u). The real bed is only a few pixels wide in a wide shot, so a
// ribbon is laid on the channel over the stretch that holds water (between st.waterTail and st.water): a deep blue-green body with a cool
// sheen and small golden particles riding downstream inside it (water carries light), a faint warm spill, and a pale foam bead at a
// moving front. It is cut into short pieces at their own depths so flowers and grass overlap it. o.cool draws a pale moonlit line instead.
const CHAN_PTS = (() => { const a = []; for (let i = 0; i <= 160; i++) { const p = P.world.chan(i / 160); a.push([p[0], p[2]]); } return a; })();
const CHAN_ARC = (() => { const a = [0]; for (let i = 1; i < CHAN_PTS.length; i++) a.push(a[i - 1] + Math.hypot(CHAN_PTS[i][0] - CHAN_PTS[i - 1][0], CHAN_PTS[i][1] - CHAN_PTS[i - 1][1])); return a; })();
// colours from the shared water palette (P.fx.WATER), a little lifted so the thin line holds its hue at this size
const WC = (() => { const W0 = P.fx.WATER, f = (c, k = 1) => c.map(v => Math.min(255, Math.round(v * k))).join(',');
  return { deep: f(W0.deep, 1.3), body: f(W0.body, 1.25), mid: f(W0.mid, 1.15), sheen: f(W0.glintHi, 0.95) }; })();
const lightStream = (st, cam, o = {}) => {
  const lo = clamp(st.waterTail ?? 0, 0, 1), hi = clamp(st.water ?? 1, 0, 1), items = [], gain = o.gain ?? 1, dip = o.dip, px = o.px ?? 9, cool = !!o.cool, N = CHAN_PTS.length - 1;
  if (hi - lo < 0.004) return items;
  const proj = (x, zz, zi) => { const k = (zi - cam.z) / (zz - cam.z); return [cam.x + (x - cam.x) * k, cam.y + (0 - cam.y) * k]; };
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N; if (u1 < lo || u0 > hi) continue;
    const a = CHAN_PTS[i], b = CHAN_PTS[i + 1]; if (a[1] - cam.z < 30 || b[1] - cam.z < 30) continue;
    const zi = (a[1] + b[1]) / 2, mid = (u0 + u1) / 2;
    const edge = ss(lo - 0.01, lo + 0.03, mid) * (1 - ss(hi - 0.03, hi + 0.005, mid)), arc = CHAN_ARC[i], hasFront = hi < 0.995 && u0 <= hi && u1 >= hi;
    items.push({ z: zi - 0.4, draw(c, s, t) {
      const f = clamp(edge * gain * (dip ? 1 - dip.k * Math.exp(-(((mid - dip.u) / dip.w) ** 2)) : 1), 0, 1.6), w = px / s;
      const p = proj(a[0], a[1], zi), q = proj(b[0], b[1], zi), yo = -0.8 * w;
      c.save(); c.lineCap = 'butt';
      const lay = (wd, col, al, add) => { c.globalCompositeOperation = add ? 'lighter' : 'source-over'; c.strokeStyle = `rgba(${col},${clamp(al * f)})`; c.lineWidth = wd * w;
        c.beginPath(); c.moveTo(p[0], p[1] + yo); c.lineTo(q[0], q[1] + yo); c.stroke(); };
      if (cool) { lay(3.2, '90,120,210', 0.12, true); lay(1.6, '130,160,230', 0.2, true); lay(0.7, '190,208,246', 0.3, true); }
      else {
        lay(3.6, '255,150,56', 0.07, true);                       // the light it carries, spilling on the banks
        lay(1.5, WC.deep, 0.62); lay(1.05, WC.body, 0.75); lay(0.55, WC.mid, 0.7);   // the body: the stream's deep blue-green, lighter mid-stream
        lay(0.16, WC.sheen, 0.55);                               // a cool sheen line
        c.globalCompositeOperation = 'lighter';
        for (let j = 0; j < 2; j++) {                            // golden particles riding downstream inside the water (the stream's own sparks)
          const k = fpart(hash(i, j + 31) + t * (0.7 + 0.5 * hash(i, j + 41))), ox = (hash(i, j + 51) - 0.5) * 0.6 * w;
          P.fx.goldSpark(c, lerp(p[0], q[0], k), lerp(p[1], q[1], k) + yo + ox, 0.28 * w, 0.9 * Math.min(f, 1) * (0.6 + 0.4 * Math.sin(t * 6 + i)));
        }
      }
      if (hasFront && !cool) { const k = clamp((hi - u0) / (u1 - u0)), fx = lerp(p[0], q[0], k), fy = lerp(p[1], q[1], k) + yo;   // the leading edge: pale foam
        c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(fx, fy, 0, fx, fy, 1.6 * w); g.addColorStop(0, `rgba(226,252,244,${0.8 * gain})`); g.addColorStop(1, 'rgba(120,200,200,0)');
        c.fillStyle = g; c.beginPath(); c.arc(fx, fy, 1.6 * w, 0, TAU); c.fill(); }
      void arc;
      c.restore(); } });
  }
  return items;
};
P.SH.lightStream = lightStream; P.SH.lensShift = lensShift;   // (P.SH.rootRunnel is set below, with the runnel)
// The world builds ground strips only down to a little below the unshifted frame. A big upward lens shift (a high wide looking down the
// garden) would bare the near ground, so this builds the missing near strips with a shorter virtual lens (the strips are drawn by the real
// camera; only their depths and extents come from the virtual one). Call it inside the items list, before scene() builds the real ground.
// The warm ground pools under the hero and the lit flowers do not depend on the lens, so the real ground builds the same ones: they are left
// out here (by their depths), or they would be drawn twice and the frame would brighten in one step the moment the fill starts.
const POOL_Z = new Set([398 - 90, ...P.world.FLOWERS.map(f => f.z - 6 - (46 + 0.4 * f.h) * 0.75)].map(z => Math.round(z * 1000)));
const groundFill = (st, c, px) => { if (px > -20) return [];
  const h = Math.max(-c.y, 3), zLim = c.z + h * c.f / 630;
  return P.world.ground(st, { ...c, f: c.f * 630 / (630 - px + 60) }).filter(it => it.z < zLim + 4 && !POOL_Z.has(Math.round(it.z * 1000))); };


const moonLight = (x, y, z, i = 0.4, rad = 90) => ({ x, y, z, col: [0.42, 0.6, 1.0], i, rad, halo: 0 });
// The moon light on Pip himself: a more neutral cool, so his felt stays a leaf green under it (the deep blue of moonLight turned it mint).
const pipMoon = (x, y, z, i, rad) => Object.assign(moonLight(x, y, z, i, rad), { col: [0.56, 0.74, 1] });
// Night ambient for shots 4 to 7: eases from dusk to a deep moonlit blue while the dark crosses the garden, then holds.
const AMB = P.SH.AMB, NIGHT = [0.10, 0.14, 0.34];
const nightAt = T => P.mixc(AMB, NIGHT, ss(S4 + 0.5, S5 + 1.5, T));
// Where a lens shift puts world height yc at the middle of the frame, for things at depth zr.
const lookAt = (c, yc, zr) => (c.y - yc) * P.scaleAt(c, zr);

// Pip's place at home: standing just left of his flower, in front of the flat stone (z 395).
const PX = -34, PZ = 393;
// The dipper on the ground as the world draws it (same function as the world's props), lying at the rest spot.
const REST = { x: -98, z: 414 };

// ---------- the rule flower and the hook flowers ----------
// Flower 30 is the rule flower: a tulip on the near bank of the channel. It is the one flower still dark when the film starts. Its root is
// exposed: it runs from the foot of the stem across the soil, over the rim stones and down into the sunken bed, where its tip lies on the
// bed floor. The rule shot (s02) shows the whole chain on it: the water comes down the empty trench (P.SH.ruleShot's own front), its
// leading edge reaches the root tip and swirls round it (6.85 s), the light runs up the root from the water to the stem foot (6.9 to 7.4 s),
// then climbs the stem (7.4 to 9.3 s) and the petals open and light (8.6 to 9.7 s). In s04 the same frame runs it backwards as the water
// leaves; act 3 runs it forwards again when the water comes back (o.relight).
// The hook (s01, the story state in shots.js flowerAt agrees): flower 34, the bell just right of Pip's flower, sputters from 2.74 s and is
// dark at 3.12 s; flower 32, further upstream, sputters from 3.5 s; flower 5, the tall star by the spout, stutters from 4.65 s.
const RULE_I = 30, NEAR_I = 34, UNEASE_I = 5, RF = P.world.FLOWERS[RULE_I];
// The exposed root: world points [x, y, z] from the stem foot (y > 0 is below the ground, the bed floor is at about +3) to the tip in the bed.
const ROOT = [[RF.x + 0.8, -0.6, RF.z - 0.5], [RF.x + 9, -0.2, RF.z - 7], [RF.x + 20, -0.4, RF.z - 15], [RF.x + 31, -0.6, RF.z - 23], [RF.x + 40, 0.6, RF.z - 30],
  [RF.x + 46, 2.2, RF.z - 34], [RF.x + 51, 3.0, RF.z - 37]];
const TIP = ROOT[ROOT.length - 1];
// The u of the channel point level with the root tip (the water touches the root when its front passes U_TIP, and leaves it when its tail does).
const U_TIP = (() => { let a = 0.82, b = 0.9; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (P.world.chan(m)[2] > TIP[2]) a = m; else b = m; } return (a + b) / 2; })();
// When the shared water's tail (s04) or front (act 3) passes the root tip; found once by bisection.
const passTime = (key, a, b) => { for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (P.state(m)[key] < U_TIP) a = m; else b = m; } return b; };
let TP_ = null, TF_ = null;
const tailPass = () => TP_ ?? (TP_ = passTime('waterTail', S4, S5));
const frontPass = () => TF_ ?? (TF_ = passTime('water', START['s18-burst'], START['s21-together']));
// s02's own water: the front comes down the empty trench from out of frame upstream and reaches the root tip at 6.85 s.
const RULE_HIT = 6.85;
const ruleFront = T => KL(T, [[S2 - 0.3, U_TIP - 0.075], [RULE_HIT, U_TIP], [S2 + 2.0, 0.95], [S2 + 3.2, 1.0], [S2 + 3.6, 1.14]]);
// The rule flower's chain, on the clock k = seconds since the water touched (fwd, relight) or left (rev) the root tip. rootK is how much of
// the root carries light, from the tip up (1 = all of it).
const ruleChain = (mode, k) => {
  if (mode === 'rev') return { rootK: 1 - ss(1.5, 2.2, k), climb: 1 - ss(0.75, 1.9, k), petal: 0.85 * (1 - ss(0.25, 0.95, k)), flicker: 1, open: 0.4 + 0.6 * (1 - ss(0.4, 1.7, k)) };
  if (mode === 'relight') return { rootK: ss(0.05, 0.45, k), climb: ss(0.45, 1.35, k), petal: 0.85 * ss(1.1, 1.8, k), flicker: 1, open: 0.4 + 0.6 * ss(1.0, 1.8, k) };
  return { rootK: ss(0.05, 0.55, k), climb: ss(0.55, 2.45, k), petal: 0.85 * ss(1.85, 2.85, k), flicker: 1, open: 0.4 + 0.6 * ss(1.75, 2.85, k) };
};
const ruleK = (mode, T) => mode === 'rev' ? T - tailPass() : mode === 'relight' ? T - frontPass() : T - RULE_HIT;

// The root and what the water does to it, drawn on one card just in front of the buds by the stem (ZR), from the true points projected onto
// it, so it lands exactly on the ground and the bed. A tapered paper root (pale tan, a darker underside, two hair rootlets near the tip);
// the light it carries runs along it from the tip; at the tip, while the water covers it, a film of water over it, rings and a small wake.
const ZR = 760;
const cardPt = (c0, p) => { const kk = (ZR - c0.z) / (p[2] - c0.z); return [c0.x + (p[0] - c0.x) * kk, c0.y + (p[1] - c0.y) * kk]; };
const rootPath = c0 => { const pts = ROOT.map(p => cardPt(c0, p)), D = [];
  const cr = (a, b, c, d, u) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < 6; j++) { const A = pts[Math.max(i - 1, 0)], Bp = pts[i], C = pts[i + 1], Dd = pts[Math.min(i + 2, pts.length - 1)], u = j / 6; D.push([cr(A[0], Bp[0], C[0], Dd[0], u), cr(A[1], Bp[1], C[1], Dd[1], u)]); }
  D.push(pts[pts.length - 1]); return D; };
const rootItem = (c0, rootK, wet, hitK, T) => {
  const D = rootPath(c0), n = D.length - 1, kz = (ZR - c0.z) / (RF.z - c0.z), W0 = 2.6 * kz, W1 = 0.7 * kz;
  const nrm = i => { const a = D[Math.max(i - 1, 0)], b = D[Math.min(i + 1, n)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  const wAt = i => lerp(W0, W1, Math.pow(i / n, 0.8));
  return { z: ZR, draw(c, s, t) {
    const L = (col, i, e = 0.1) => P.lit(col, RF.x + 25, 0, RF.z + 4, e);
    const outline = k => { k.moveTo(D[0][0], D[0][1]); for (let i = 0; i <= n; i++) { const q = nrm(i), w = wAt(i); k.lineTo(D[i][0] + q[0] * w, D[i][1] + q[1] * w); }
      for (let i = n; i >= 0; i--) { const q = nrm(i), w = wAt(i); k.lineTo(D[i][0] - q[0] * w * 0.9, D[i][1] - q[1] * w * 0.9); } k.closePath(); };
    const g = c.createLinearGradient(0, D[0][1] - W0, 0, D[0][1] + W0); g.addColorStop(0, L([226, 206, 168], 0, 0.18)); g.addColorStop(0.5, L([184, 156, 120], 0, 0.08)); g.addColorStop(1, L([104, 82, 64], 0));
    P.card(c, outline, g, { lift: 0.35 * kz, tex: 0.25, shadow: 0.4, edge: 0.3 });
    c.save(); c.lineCap = 'round'; c.strokeStyle = L([120, 92, 66], 0); c.lineWidth = 0.18 * kz;        // two hair rootlets near the tip
    for (const [i0, dx, dy] of [[Math.round(n * 0.72), 2.4, 1.8], [Math.round(n * 0.86), 1.6, -1.4]]) { const p = D[i0]; c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(p[0] + dx * 0.6 * kz, p[1] + dy * 0.2 * kz, p[0] + dx * kz, p[1] + dy * kz); c.stroke(); }
    // the light it carries: a warm hot line from the tip up toward the stem, with a bright head while it travels
    if (rootK > 0.01) {
      const i0 = Math.floor(n * (1 - rootK)), head = D[i0];
      c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round';
      for (const [w, col, al] of [[1.5, '255,140,40', 0.16], [0.8, '255,190,90', 0.32], [0.38, '255,232,160', 0.55], [0.16, '255,252,236', 0.7]]) {
        c.strokeStyle = `rgba(${col},${al})`; c.lineWidth = w * kz; c.beginPath(); c.moveTo(D[n][0], D[n][1]); for (let i = n - 1; i >= i0; i--) c.lineTo(D[i][0], D[i][1]); c.stroke(); }
      const ha = 1 - ss(0.95, 1, rootK), gr = c.createRadialGradient(head[0], head[1], 0, head[0], head[1], 4.5 * kz);
      gr.addColorStop(0, `rgba(255,236,170,${0.8 * ha})`); gr.addColorStop(1, 'rgba(255,170,60,0)'); c.fillStyle = gr; c.beginPath(); c.arc(head[0], head[1], 4.5 * kz, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
    }
    // the water at the tip: a film of water over its last stretch, rings spreading from it and a small wake downstream (toward the lens)
    if (wet > 0.01) {
      const tp = D[n], j0 = Math.round(n * 0.78), W = P.fx.waterColors(TIP[0], 0, TIP[2]), rgb = a => `${a[0]},${a[1]},${a[2]}`;
      c.fillStyle = `rgba(${rgb(W.body)},${0.55 * wet})`; c.beginPath(); for (let i = j0; i <= n; i++) { const q = nrm(i), w = wAt(i) * 1.8; i === j0 ? c.moveTo(D[i][0] + q[0] * w, D[i][1] + q[1] * w) : c.lineTo(D[i][0] + q[0] * w, D[i][1] + q[1] * w); }
      for (let i = n; i >= j0; i--) { const q = nrm(i), w = wAt(i) * 1.8; c.lineTo(D[i][0] - q[0] * w, D[i][1] - q[1] * w); } c.closePath(); c.fill();
      c.globalCompositeOperation = 'lighter';
      for (let r = 0; r < 3; r++) { const ph = fpart(t * 0.9 + r / 3), rr = (1.2 + 5 * ph) * kz;
        c.strokeStyle = `rgba(${rgb(W.glintHi)},${0.5 * wet * (1 - ph)})`; c.lineWidth = 0.22 * kz; c.beginPath(); c.ellipse(tp[0], tp[1], rr, rr * 0.32, 0, 0, TAU); c.stroke(); }
      c.strokeStyle = `rgba(${rgb(W.glintHi)},${0.45 * wet})`; c.lineWidth = 0.2 * kz; c.beginPath();   // the wake: two short lines opening downstream
      for (const sg of [-1, 1]) { c.moveTo(tp[0] - 0.6 * kz, tp[1]); c.quadraticCurveTo(tp[0] - 1.6 * kz, tp[1] + (1.2 + 0.5 * sg) * kz, tp[0] - 2.4 * kz + sg * 1.5 * kz, tp[1] + 2.8 * kz); } c.stroke();
      if (hitK > 0 && hitK < 1) {        // the moment of touch: a bright ring and a burst of light round the tip
        const rr = (1 + 9 * hitK) * kz, a = 1 - hitK;
        c.strokeStyle = `rgba(226,252,244,${0.85 * a})`; c.lineWidth = 0.4 * kz; c.beginPath(); c.ellipse(tp[0], tp[1], rr, rr * 0.34, 0, 0, TAU); c.stroke();
        const gr = c.createRadialGradient(tp[0], tp[1], 0, tp[0], tp[1], 6 * kz); gr.addColorStop(0, `rgba(255,236,170,${0.9 * a})`); gr.addColorStop(1, 'rgba(255,170,60,0)'); c.fillStyle = gr; c.beginPath(); c.arc(tp[0], tp[1], 6 * kz, 0, TAU); c.fill();
      }
      P.fx.goldSpark(c, tp[0] + 0.4 * kz, tp[1] - 0.2 * kz, 0.5 * kz, 0.8 * wet * (0.7 + 0.3 * Math.sin(t * 7)));
    }
    c.restore(); } };
};
const ruleFx = (T, c0, mode) => {
  const k = ruleK(mode, T), fl = ruleChain(mode, k), items = [];
  const { x, z, h } = RF, dir = RF.lean >= 0 ? 1 : -1, lean = RF.lean;
  const wet = mode === 'rev' ? 1 - ss(-0.1, 0.25, k) : ss(-0.05, 0.05, k), hitK = mode === 'rev' ? 0 : clamp(k / 0.6);
  items.push(rootItem(c0, fl.rootK, wet, hitK, T));
  // the soil at the stem foot warms as the light comes up the root into it
  const foot = mode === 'rev' ? 1 - ss(1.9, 2.4, k) : ss(0.4, 0.7, k);
  if (foot > 0.01) items.push({ z: ZR - 0.1, draw(c) { const p = cardPt(c0, ROOT[0]), kz = (ZR - c0.z) / (z - c0.z);
    c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], 7 * kz); g.addColorStop(0, `rgba(255,196,104,${0.5 * foot})`); g.addColorStop(1, 'rgba(255,140,40,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(p[0], p[1], 7 * kz, 3 * kz, 0, 0, TAU); c.fill(); c.restore(); } });
  // the head blooms as the petals light: a warm glow behind the petal edges, kept soft so the petals keep their paper
  if (fl.petal > 0.01) items.push({ z: z - 0.4, draw(c, s, t) {
    const sway = Math.sin(t * 0.9 + RF.phase) * 0.016 * (0.6 + h / 100), HL = h * 0.25, kk = fl.petal;
    c.save(); c.translate(x, 0); c.rotate(sway); c.translate(lean, -h - HL * 0.5); c.globalCompositeOperation = 'lighter';
    let g = c.createRadialGradient(0, 0, 0, 0, 0, HL * 2.4); g.addColorStop(0, `rgba(255,200,110,${0.2 * kk})`); g.addColorStop(0.45, `rgba(255,160,60,${0.08 * kk})`); g.addColorStop(1, 'rgba(255,140,40,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, HL * 2.4, 0, TAU); c.fill();
    g = c.createRadialGradient(0, 0, 0, 0, 0, HL * 0.9); g.addColorStop(0, `rgba(255,226,160,${0.16 * kk})`); g.addColorStop(1, 'rgba(255,170,70,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, HL * 0.9, HL * 1.2, 0, 0, TAU); c.fill(); c.restore(); } });
  // the light climbing the stem: a warm hot line along the stem's own curve with a bright head
  if (fl.climb > 0.01) items.push({ z: z - 0.3, draw(c, s, t) {
    const sway = Math.sin(t * 0.9 + RF.phase) * 0.016 * (0.6 + h / 100), c1x = -lean * 0.9 - 3 * dir, c1y = -h * 0.32, c2x = lean * 1.7 + 3 * dir, c2y = -h * 0.7;
    const pt = u => [bez(0, c1x, c2x, lean, u), bez(0, c1y, c2y, -h, u)], end = fl.climb * 0.98;
    c.save(); c.translate(x, 0); c.rotate(sway); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [w, col, al] of [[0.17, '255,140,40', 0.12], [0.09, '255,190,90', 0.26], [0.045, '255,232,160', 0.45], [0.018, '255,252,236', 0.6]]) {
      c.strokeStyle = `rgba(${col},${al})`; c.lineWidth = w * h * 0.5; c.beginPath(); for (let i = 0; i <= 24; i++) { const p = pt(end * i / 24); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.stroke(); }
    const hp = pt(end), gr = c.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], 9), ha = ss(0.0, 0.1, fl.climb) * (1 - ss(0.97, 1, fl.climb)) + 0.25 * (1 - ss(0.0, 0.1, fl.climb));
    gr.addColorStop(0, `rgba(255,236,170,${0.75 * ha})`); gr.addColorStop(1, 'rgba(255,170,60,0)'); c.fillStyle = gr; c.beginPath(); c.arc(hp[0], hp[1], 9, 0, TAU); c.fill();
    c.restore(); } });
  return items;
};
const bez = (a, b, c, d, t) => { const m = 1 - t; return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d; };
// The rule frame: the same camera for the chain forward (s02), in reverse (s04) and when the water comes back (act 3, s19). g is the slow
// push-in (0..1 over s02, 1..1.4 in s04).
const ruleCam = g => cam(209 - 9 * g, -58 + 4 * g, 471 + 38 * g, 841, 30);
// A flower lit by s02's own front: dark until the front passes it, then the light climbs as in the shared state.
const frontLit = (tf, T) => { const k = T - tf; return { climb: clamp(k / 0.45), petal: 0.85 * clamp((k - 0.35) / 0.4), flicker: 1, open: 0.4 + 0.6 * clamp((k - 0.3) / 0.8) }; };
const ruleScene = (T, g, mode = 'fwd') => {
  const st = P.state(T), c = ruleCam(g), base = st.flower, k = ruleK(mode, T), fl = ruleChain(mode, k);
  if (mode === 'fwd') {          // s02 runs its own water: the trench is empty below the front, and flowers below it wait for it
    st.water = ruleFront(T); st.waterTail = 0;
    const tf = u => { let a = S2 - 1, b = S2 + 4; for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (ruleFront(m) < u) a = m; else b = m; } return b; };
    st.flower = i => i === RULE_I ? fl : P.world.FLOWERS[i].u > U_TIP - 0.075 ? frontLit(tf(P.world.FLOWERS[i].u), T) : base(i);
  } else st.flower = i => i === RULE_I ? fl : base(i);
  const night = mode !== 'fwd', warm = fl.petal * 0.6 + 0.4 * Math.max(fl.rootK, 0) * (mode === 'rev' ? 1 : ss(0, 0.4, k));
  const lights = [{ x: 176, y: -6, z: 838, col: [1, 0.68, 0.34], i: 0.6 * warm, rad: 46, halo: 0 }];
  if (night) lights.push(moonLight(190, -70, 800, 0.5, 170), moonLight(190, -20, 700, 0.4, 150));
  // (rev, s04: the frame opens at the wide's own night exposure, so the cut at 16.4 s never reads as the light coming back)
  const amb = mode === 'rev' ? P.mixc(AMB, NIGHT, Math.max(ss(S4 + 0.5, S5 + 1.5, T), 0.7 + 0.3 * ss(S4, S5, T))) : undefined;
  // and the cut lands at about the wide's brightness: a stronger vignette and a little exposure taken off, given back as the light drains (the
  // frame's own brightness still only falls)
  const grade = mode === 'rev' ? { vignette: 0.6 + 0.25 * (1 - ss(17.2, 18.8, T)), fade: 0.3 * (1 - ss(17.0, 19.3, T)) } : undefined;
  return scene(T, c, ruleFx(T, c, mode), { st, motes: night ? 4 : 10, noFg: true, calm: 0.5, ambient: amb, lights, grade });
};
// For act 3 (s19): the same composition. u = seconds into the caller's shot; o.relight: true shows the light returning with the shared state's
// water (the front reaches the root tip at P.SH.RULE.relightAt()); o.g sets the push (default 1 + 0.06 u). Without o.relight it is s02's chain.
P.SH.ruleShot = (u, T, o = {}) => ruleScene(T, o.g ?? (o.relight ? 1 + 0.06 * u : u / 6), o.relight ? 'relight' : o.drain ? 'rev' : 'fwd');
P.SH.RULE = { i: RULE_I, uTip: U_TIP, relightAt: () => frontPass(), drainAt: () => tailPass(), hitAt: RULE_HIT };

// The bright trickle at the root of Pip's flower. The real runnel (fx.trickle) arrives from behind the soil mound, where a low lens cannot
// see it, so a little water runnel is also laid over the mound (the shared water, P.fx.waterFace): blue-green with golden particles running
// to the stem. k 0..1 is how much water (it drains from its upstream end); to 0..1 is how far its front has got (1 = at the stem).
const RUNNEL_PTS = [[27, -1.5], [21, -5.2], [14, -7.6], [8, -9.2], [3, -10.2]];
const rootRunnel = (T, k = 1, to = 1) => k < 0.01 || to < 0.01 ? [] : [...P.fx.waterFace(RUNNEL_PTS, { z: 398.6, t: T, width: 1.05, taper: [1.3, 0.7], from: 1 - k, to, nose: to < 0.995 ? 1 : 0, flow: 22, elev: 0.3, spark: 1.7, glow: 1, palAt: [14, -6, 398] }),
  { z: 398.5, draw(c) {   // the light it carries gathering at the foot of the stem
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(3, -9, 0, 3, -9, 10); g.addColorStop(0, `rgba(255,196,104,${0.4 * k * ss(0.9, 1, to)})`); g.addColorStop(1, 'rgba(255,150,50,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(3, -9, 10, 6, 0, 0, TAU); c.fill();
    c.restore(); } }];
P.SH.rootRunnel = rootRunnel;   // act 3 runs the same runnel in again when the water comes home (s20); to < 1 = its front on the way
// How much water still runs in the runnel at Pip's root (the drain reaches it last, in s05).
const runnelK = T => { const w = P.state(T).waterTail; return 1 - ss(0.99, 1.1, w); };

// The renderer draws each run of items that share a blur level onto its own layer, so where a run starts changes how the additive glows
// after it combine with what lies below. The front big leaf of Pip's flower carries its own blur (it hangs nearer the lens than the stem);
// during the crane's focus pull that blur drops below the first level at about 3.13 s, the run it started merges, and the whole frame
// brightened by about 7% in one frame. In s01 it keeps at least the first blur level, so the runs never change mid-shot.
const steadyLeafRun = it => (Math.abs(it.z - (HERO[2] - 0.6)) < 1e-6 && Object.getOwnPropertyDescriptor(it, 'blur')?.get) ? { ...it, blur: Math.max(it.blur ?? 0, 0.8) } : it;

// ---------- s01 The glow, and the hook ----------
// v5: one warning, then one real failure upstream. (A) Close on Pip beside his flower, a long lens so the bell just right of his stem
// (flower 34) shares the frame with his face: the light climbs his stem and he looks up at it, smiling. At 2.6 s the bell sputters, goes
// nearly dark and droops (2.98 to 3.35 s), then comes back weak, dimmer and still a little bowed (the story state in shots.js flowerAt).
// His eyes snap to it; on the near-dark he gasps and holds it (2.94 to 3.7 s): stretch, eyes wide, mouth a big "o", brows up, both mitts
// up, the sprout springing; the lens pushes in on it. As the bell comes back his eyes leave it and lead upstream (he turns to look up the
// garden, screen left). (B) Cut on that look to an over-the-shoulder: his head, soft and dark, at the right edge of frame, looking left up
// the garden to the tall star by the spout (flower 5), the brightest thing there; it stutters from 4.66 s and goes out for good at 5.56 s.
// He flinches as it dies. The dark later travels on from there (s04).
const CUT1 = 4.24;
const HOOKF = P.world.FLOWERS[UNEASE_I], NEARF = P.world.FLOWERS[NEAR_I];
// A failing flower's own light, so on and off read even at phone size: a warm bloom round its head and a hot heart, following its state.
const failGlow = (f, fs, gain = 1, at = null) => { const on = clamp(fs.petal / 0.85); if (on < 0.02) return null;
  const HL = f.h * 0.25, bell = f.kind === 'bell', dir = f.lean >= 0 ? 1 : -1, dr = clamp(fs.droop || 0);
  return { z: f.z - 0.5, draw(c, s, t) { const sway = Math.sin(t * 0.9 + f.phase) * 0.016 * (0.6 + f.h / 100);
    c.save(); c.translate(f.x, 0); c.rotate(sway);
    c.translate((bell ? f.lean + dir * f.h * 0.1 : f.lean) + dir * f.h * 0.2 * dr, (bell ? -f.h * 0.97 + HL * 0.6 : -f.h) + f.h * 0.3 * dr); c.globalCompositeOperation = 'lighter';
    let g = c.createRadialGradient(0, 0, 0, 0, 0, HL * 2.6); g.addColorStop(0, `rgba(255,200,110,${0.34 * on * gain})`); g.addColorStop(0.4, `rgba(255,160,60,${0.14 * on * gain})`); g.addColorStop(1, 'rgba(255,140,40,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, HL * 2.6, 0, TAU); c.fill();
    g = c.createRadialGradient(0, 0, 0, 0, 0, HL * 0.55); g.addColorStop(0, `rgba(255,240,190,${0.55 * on * gain})`); g.addColorStop(1, 'rgba(255,190,90,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, HL * 0.55, 0, TAU); c.fill(); c.restore(); } };
};
// The near bell in the close (s01 A): flower 34 drawn by the world, shifted to BELL (nearer the lens and right, under the leaf tip where the
// frame behind it is dark hills); `dark` 0..1 takes it toward a near-black silhouette while its light is gone.
const BELL = { x: 71, z: 570 }, BELL_F = { ...NEARF, x: BELL.x, z: BELL.z };
const nearBell = (orig, dark) => ({ z: BELL.z, draw(c, s, t) { c.save(); c.translate(BELL.x - NEARF.x, 0);
  if (dark > 0.005) c.filter = `brightness(${(1 - 0.74 * dark).toFixed(3)}) saturate(${(1 - 0.75 * dark).toFixed(3)}) drop-shadow(-2px -3px 0px rgba(150,182,255,${(0.6 * dark).toFixed(3)}))`;
  orig.draw(c, s, t); c.restore(); } });   // (dark: a near-black silhouette with a thin cool moon edge on its upper left, so its bowed shape still reads)
const dimmed = (orig, b) => ({ ...orig, z: orig.z, draw(c, s, t) { c.save(); c.filter = `brightness(${b.toFixed(3)})`; orig.draw(c, s, t); c.restore(); } });
// Pip's stem dips a little while the bell is nearly dark and comes back with it.
const HOME_DIP = T => 0.6 * ss(2.62, 2.75, T) * (1 - ss(3.4, 3.6, T));
// The gasp, on the bell's near-dark (2.94 s), held while it hangs dark and bowed, to 3.7 s, easing after.
const GASP0 = 2.94, GASP1 = 3.42;
// v6: the relief, once the bell is whole again (3.5 to 4.0 s): a smile and an exhale, hands down; then his eyes go upstream (3.98 s).
// v6.1: the gasp's push-in and hands-up spread over 6 to 10 frames (were 3 to 5): the whole frame jumped about 13% in five frames,
// which phones showed as a double, see-through Pip at 0:03.
const RELIEF = u => ss(3.5, 3.68, u) * (1 - ss(3.96, 4.1, u)), AWAY0 = 3.98;
const closeCam = u => {
  const [hx, hy] = breathe(u, 0.4), push = ss(0, 3.45, u), jolt = ss(GASP0, GASP0 + 0.34, u);
  const cz = lerp(-60, -40, push), f = 12.6 * (PZ - cz) * lerp(1, 1.04, push) * (1 + 0.06 * jolt + 0.03 * ss(GASP0 + 0.34, CUT1, u));
  return { c: cam(lerp(-2, 2, push) + hx + 1.5 * jolt, lerp(-6, -8, push) + hy, cz, PZ + 30, 10, { f }), jolt };
};
const pipClose = u => {
  const seen = ss(2.6, 2.7, u), g = ss(GASP0, GASP0 + 0.2, u), rel = ss(GASP1, GASP1 + 0.2, u), k = u - GASP0;
  const tn = turning(u, 1, [[4.02, -1]], 0.26), away = ss(AWAY0, AWAY0 + 0.18, u), rf = RELIEF(u);
  // the sprout springs back on the gasp and wobbles to rest (a decaying spring, through the rig's follow-through)
  const spring = k > 0 ? 34 * Math.exp(-k * 4.2) * Math.sin(k * 15) : 0;
  const look = u < 2.62 ? [K(u, [[0, 0.35], [2.0, 0.3]]), K(u, [[0, -0.2], [0.6, -0.3], [2.6, -0.55]])]
    : u < AWAY0 ? [lerp(0.3, 1, seen), lerp(-0.55, -0.45, seen)] : [lerp(1, -1, away), lerp(-0.45, -0.55, away)];
  const up = g * (1 - 0.85 * rel);   // the hands go up on the gasp and come part way down as he turns
  return { x: PX, y: 0, z: PZ, face: tn.face, yaw: lerp(lerp(lerp(0.45, 0.3, seen), 0.15, g), 0.75, ss(4.1, 4.24, u)) * tn.yawK, lean: 0.04 * ss(0.8, 2.2, u) * (1 - seen) + 0.03 * seen * (1 - g) - 0.07 * g,
    eyes: 1.05 + 0.08 * seen + 0.27 * g * (1 - 0.7 * rel) - 0.08 * rf + 0.18 * away,
    squash: tn.sq * (1 - 0.05 * bump(GASP0 - 0.02, 0.05, u) + 0.08 * bump(GASP0 + 0.09, 0.07, u) + 0.035 * g * (1 - rel) - 0.04 * bump(3.6, 0.12, u)),
    headTilt: -0.1 * ss(0.8, 2.4, u) * (1 - seen) - 0.07 * g * (1 - rel),
    vel: [spring, 0], alive: 1, look, brow: u < 2.62 ? K(u, [[0, 0.15], [2.2, 0.2]]) : u < GASP0 ? lerp(0.2, -0.35, ss(2.62, 2.8, u)) : u < AWAY0 ? lerp(-0.9, 0.3, ss(GASP1, 3.65, u)) : lerp(0.3, -0.7, away),
    mouth: u < 0.9 ? 'o' : u < 2.62 ? 'smile' : u < GASP0 ? 'flat' : u < 3.5 ? 'yawn' : u < AWAY0 ? 'smile' : 'o',
    mouthOpen: u < 0.9 ? 0.2 : u < 2.62 ? K(u, [[0.9, 0.2], [2.0, 0.42]]) : u < GASP0 ? 0.08 : u < 3.5 ? 0.62 * g * (1 - 0.45 * rel) + 0.06 : u < AWAY0 ? 0.3 * rf + 0.05 : 0.22 * away,
    armL: { sh: lerp(0.25, -2.35, up), el: lerp(0.5, -0.55, up) }, armR: { sh: lerp(0.2, 1.75, up), el: lerp(0.4, 0.9, up) },
    breath: u * 0.5, blink: u > 2.0 ? 0 : blink(u, 3.4, 1), autoBlink: false };   // his blinks are placed by hand here (never on the failure)
};
// (B) The over-the-shoulder up the garden. The camera stands behind and right of Pip at about his eye height on a long lens, so his head
// (out of focus, kept dark) fills the right edge and the garden runs away to the spout, where the star stands over the dam.
const OTS_AT = [1590, 730];   // v6: more of his head and face in frame, so his reaction to the star reads   // where his head sits on the frame
const hookOTS = (u, T) => {
  const st = P.state(T), v = u - CUT1, e = ss(0, 6 - CUT1, v);
  const c = cam(lerp(49, 46, e), -33, lerp(-20, -6, e), 2000, 38, { f: 9000 });
  const sr = ss(4.66, 4.74, T), fin = ss(5.52, 5.62, T);
  const pose = { x: PX, y: 0, z: PZ, face: -1, yaw: 0.95, lean: 0.05 * sr - 0.04 * fin, eyes: 1.15 + 0.1 * sr, look: [-1, -0.7], brow: -0.85,
    mouth: 'o', mouthOpen: 0.3 + 0.35 * fin, squash: 1 - 0.05 * bump(5.6, 0.08, T), headTilt: 0.06 * fin, breath: u * 0.5, blink: 0, autoBlink: false };
  const pp = P.project(c, PX - 2, -30, PZ), hx = OTS_AT[0] - pp[0], px = OTS_AT[1] - pp[1];
  // the steady ones well down; once the star is out for good the lit cluster round its foot sinks further (by 38%), so the eye stays on the
  // dead star and does not land on a glow in the same place
  const base = st.flower, gone = ss(5.5, 5.85, T), sink = 1 - 0.38 * gone;
  st.flower = i => { const o = base(i); return i === UNEASE_I ? o : { ...o, petal: o.petal * 0.45 * sink, climb: o.climb * 0.6 * sink }; };   // the steady ones well down
  const items = [groundFill(st, c, px), failGlow(HOOKF, st.flower(UNEASE_I), 3.4), pip(pose).map(it => ({ ...dimmed(it, 0.9), blur: 1.4 })), damVignette(0.5)];
  const sc = scene(T, c, items, { st, motes: 6, noFg: true, calm: 1, lights: [moonLight(PX + 14, -50, PZ - 30, 0.45, 50)], grade: { bloom: 0.18, vignette: 0.75 } });
  const failing = L => Math.abs(L.x - HOOKF.x) < 0.01 && Math.abs(L.z - (HOOKF.z - 10)) < 0.01;
  sc.lights = sc.lights.map(L => failing(L) || L.rad > 120 ? L : { ...L, i: L.i * 0.45 * sink, halo: L.halo > 0 ? L.halo * 0.3 * sink : L.halo });
  // when the star is out it goes dark itself, not just unlit (its pale petals would otherwise still read as lit at phone size)
  const star0 = P.world._fl && P.world._fl[UNEASE_I], off5 = 1 - clamp(st.flower(UNEASE_I).petal / 0.5);
  if (off5 > 0.01) sc.items = sc.items.map(it => it === star0 ? dimmed(it, 1 - 0.65 * off5) : it);
  // nothing stands between the lens and his head or right behind him: the near flowers and buds and his own flower's big leaves are left out
  const fl0 = new Set(P.world._fl || []), H0 = P.world._hero || [], drop = new Set([H0[0], H0[4], (P.world._props || [])[1]]);   // (and the resting log, whose cut end reads as a bright egg here)
  sc.items = sc.items.filter(it => !drop.has(it) && !(fl0.has(it) && it.z < 760)).map(it => !fl0.has(it) || it === star0 ? it : it.z < 1900 ? dimmed(it, 0.55) : gone > 0.005 ? dimmed(it, sink) : it);
  return lensShift(sc, px, false, hx);
};
// A soft vignette toward the dam (screen space, centred where the star stands).
const damVignette = a => a < 0.01 ? null : { z: -1e5, screen: true, draw(c) {
  const g = c.createRadialGradient(760, 380, 160, 760, 420, 1250); g.addColorStop(0, 'rgba(4,8,22,0)'); g.addColorStop(0.45, `rgba(4,8,22,${0.4 * a})`); g.addColorStop(1, `rgba(4,8,22,${a})`);
  c.save(); c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore(); } };
B['s01-garden'] = (u, T) => {
  if (u >= CUT1) return hookOTS(u, T);
  const st = P.state(T);
  st.waterGlow = 0.75 + 0.25 * ss(0, 2.4, T);
  const { c } = closeCam(u), pose = pipClose(u);
  const fl = st.flower(NEAR_I), on = clamp(fl.petal / 0.85), dark = T > 2.6 ? 0.92 * (1 - on) : 0;
  const bf = BELL_F, dip = HOME_DIP(T);
  const items = [shade(PX + 3, -30, 403, 56, 46, 0.4), rootRunnel(T), forward(pip(pose), c, 24), failGlow(bf, fl, 2.4),
    P.fx.spill(HERO[0], 0, HERO[2] - 3, { rad: 60, k: 1.5 * ss(0.4, 3.3, T) }),   // the glow pools on the stones and soil as its light climbs (root to petals)
    shade(bf.x + bf.lean - 4, -44, bf.z + 4, 34, 30, 0.5 * dark)];   // while it is dark, a soft dark pool behind it so the silhouette stands clear
  // the warm light of his flower on him (it dips with his stem while the bell fails); the bell's own light round it, a cool moon rim
  const lights = [{ x: -8, y: -14, z: 386, col: [1, 0.72, 0.4], i: 0.5 * (1 - 0.5 * dip), rad: 48, halo: 0 }, { x: bf.x, y: -bf.h * 0.8, z: bf.z - 12, col: [1, 0.7, 0.36], i: 0.8 * on, rad: 60, halo: 0 },
    moonLight(PX - 10, -40, 380, 0.25, 60)];
  const sc = scene(T, c, items, { st, motes: 26, lights, calm: 0.45, grade: { bloom: 0.24, vignette: 0.7 } });
  // the bell is cheated forward and right, out from under the big leaf into the clear dark (the world's own flower 34 is swapped for it in
  // this shot only). His own stem dims a little while it fails, so the bell is the event.
  const W0 = P.world, bell0 = W0._fl && W0._fl[NEAR_I], stem0 = W0._hero && W0._hero[3];
  sc.items = sc.items.map(steadyLeafRun).map(it => it === bell0 ? nearBell(it, dark) : it === stem0 && dip > 0.005 ? dimmed(it, 1 - 0.38 * dip) : it);
  sc.lights = sc.lights.map(L => Math.abs(L.x - NEARF.x) < 0.01 && Math.abs(L.z - (NEARF.z - 10)) < 0.01 ? { ...L, x: bf.x, z: bf.z - 10 } : L);
  return lensShift(sc, lookAt(c, -31, PZ), false);
};

// ---------- s02 The rule, in 6 s ----------
// Close on the rule flower, dark among its lit neighbours. A thread of blue-green water runs from the channel to its root (arrives 6.88 s),
// splashes there and soaks the soil dark, the soil warms, then the light climbs the stem (7.4 to 9.3 s, on "Water carried the light") and
// the petals open and light (to 9.7 s). The camera pushes in slowly the whole time.
B['s02-pour'] = (u, T) => {
  const sc = ruleScene(T, u / 6, 'fwd');
  // the light runs out from the rule flower's root as its petals open: a ring of warm light through the grass (8.6 to 9.7 s), and the glow
  // pooling on the soil under it as its light climbs. Both are added to this shot only (act 3 relights the same flower with ruleShot).
  const kW = (T - 8.6) / 1.1;
  sc.items = sc.items.concat(P.fx.spill(RF.x, 0, RF.z - 3, { rad: 40, k: 1.1 * ss(7.4, 9.7, T) }), P.fx.bloomWave(RF.x, RF.z, kW, { rad: 90, strength: 0.7 }));
  return sc;
};

// ---------- s04 The dark comes ----------
// A high wide behind home, looking up the channel to the far spout: Pip small in the foreground beside his flower, the garden glowing in
// rows along the winding channel. The water drains from the spout end toward home and the flowers go out in that order (the first ones,
// with the hook flower, as "But tonight..." lands at 14.0). Pip turns to watch it come, steps back, and glances up when his own flower
// flickers (15.9). The camera creeps in. At +4.4 the cut to the rule flower's frame: its water leaves, the light drains petals to root.
const CUT4 = 4.4;
// Per-flower ground pools and lights (the same look as the world's, which hands its few to the brightest flowers).
const FPOOL_Z = new Set(P.world.FLOWERS.map(f => Math.round((f.z - 6 - (46 + 0.4 * f.h) * 0.75) * 1000)));
const lkey = (x, z) => `${x.toFixed(2)},${z.toFixed(2)}`, FLIGHT_KEY = new Set(P.world.FLOWERS.map(f => lkey(f.x, f.z - 10)));
const ownPool = (f, fs, c) => {
  const a = 0.3 * clamp((fs.petal - 0.15) / 0.7), r = 46 + 0.4 * f.h, pz = f.z - 6, zn = pz - r * 0.75; if (a < 0.005 || zn - c.z < 25) return null;
  return { z: zn, flat: true, draw(ctx) {
    const gp = (x, zz) => { const k = (zn - c.z) / Math.max(zz - c.z, 1); return [c.x + (x - c.x) * k, c.y + (0 - c.y) * k]; };
    const q = gp(f.x, pz); let rx = 0, ry = 0; for (let i = 0; i < 24; i++) { const th = TAU * i / 24, p = gp(f.x + Math.cos(th) * r, pz + Math.sin(th) * r * 0.9); rx = Math.max(rx, Math.abs(p[0] - q[0])); ry = Math.max(ry, Math.abs(p[1] - q[1])); }
    ry = Math.max(ry, rx * 0.07);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(q[0], q[1]); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(255,160,64,${a})`); g.addColorStop(0.45, `rgba(240,120,44,${a * 0.4})`); g.addColorStop(1, 'rgba(220,100,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore(); } };
};
const ownLight = (f, fs) => {
  const pt = clamp(fs.petal ?? 0), cl = clamp(fs.climb ?? 0), I = (1.6 * pt + 0.7 * ss(0, 0.7, cl) * (1 - 0.35 * pt)) * clamp(fs.flicker ?? 1, 0, 1.7); if (I < 0.04) return null;
  const tint = f.col.map(v => v / 255), col = [1, 0.64, 0.28].map((v, j) => lerp(v, tint[j], 0.18));
  return { x: f.x, y: -f.h * lerp(0.4, 0.82, pt), z: f.z - 10, col, i: I, rad: 34 + 0.45 * f.h, halo: 0.6 * (10 + 0.14 * f.h) * ss(0.2, 0.5, pt), refl: 1 };
};
// When the receding water's tail passes u (cached by u; bisection on the shared state).
const TAILAT = new Map();
const tailAt = u => { if (!TAILAT.has(u)) { let a = S4, b = S5 + 2; for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (P.state(m).waterTail < u) a = m; else b = m; } TAILAT.set(u, b); } return TAILAT.get(u); };
B['s04-dark-comes'] = (u, T) => {
  if (u >= CUT4) return ruleScene(T, 1 + 0.4 * (u - CUT4) / (7 - CUT4), 'rev');
  const st = P.state(T), e = ss(0, CUT4, u);
  const c = cam(lerp(-90, -80, e), lerp(-330, -300, e), lerp(-150, -100, e), 1400, 6, { f: lerp(1600, 1650, e) });
  const flick = bump(3.95, 0.12, u);
  const tn = turning(u, 1, [[0.5, -1]], 0.32);
  const step = ss(2.2, 2.9, u);
  const pose = { x: PX + 3 * step, y: 0, z: PZ, face: tn.face, yaw: 0.55 * tn.yawK, squash: tn.sq * (1 - 0.05 * bump(2.0, 0.12, u)), lean: -0.08 * step, eyes: 1,
    look: [K(u, [[0, 0.3], [0.5, -0.5], [1.0, -0.8], [2.6, -0.6], [3.7, -0.4], [3.9, 0.5], [4.4, 0.4]]), K(u, [[0, -0.6], [1.0, -0.35], [2.6, -0.15], [3.7, -0.1], [3.9, -1.0], [4.4, -0.9]])],
    brow: K(u, [[0, 0.3], [1.2, -0.2], [2.0, -0.7]]), mouth: u < 1.2 ? 'flat' : 'o', mouthOpen: K(u, [[1.2, 0.1], [2.0, 0.3], [3.9, 0.45]]), headTilt: -0.05 * flick,
    breath: u * 0.6, blink: blink(u, 2.7, 0.5) };
  // each flower gives one last bright pulse as the water leaves it, then goes dark: a chain of pops running from the spout toward home
  const pops = P.world.FLOWERS.map((f, i) => { if (i === UNEASE_I) return null; const a = bump(tailAt(f.u) + 0.06, 0.09, T);   // (the star went out in s01)
    return a > 0.02 ? failGlow(f, { petal: 0.85 * a }, 2.4) : null; });
  const shf = lerp(-560, -580, e), items = [groundFill(st, c, shf), lightStream(st, c, { px: lerp(10, 9, e) }), shade(PX + 3, -24, 401, 54, 46, 0.35), forward(pip(pose), c, 18), pops];
  const sc = scene(T, c, items, { st, ambient: P.mixc(AMB, NIGHT, 0.7 + 0.3 * ss(S4, S5, T)), motes: 8, noFg: true, calm: 1, lights: [moonLight(PX - 8, -40, 372, 0.6, 70)], grade: { bloom: 0.16 } });
  // the world gives its 8 ground pools and 8 flower lights to whichever flowers are brightest, so as the far ones go out they would move to
  // flowers nearer home and the garden would brighten while the dark comes. Here every flower keeps its own pool, and a fixed set of flowers
  // along the channel keep their own lights, each fading with that flower's glow: the light in the frame only falls.
  sc.items = sc.items.filter(it => !(it.flat && FPOOL_Z.has(Math.round(it.z * 1000)))).concat(P.world.FLOWERS.map((f, i) => ownPool(f, st.flower(i), c)).filter(Boolean));
  sc.lights = sc.lights.filter(L => !FLIGHT_KEY.has(lkey(L.x, L.z))).map(L => L.halo > 0 ? { ...L, halo: L.halo * 0.6 } : L)
    .concat(P.world.FLOWERS.map((f, i) => i % 4 === 1 ? ownLight(f, st.flower(i)) : null).filter(Boolean));
  return lensShift(sc, shf, false);
};

// ---------- s05 The stem dies ----------
// One move. Close on the head of Pip's flower as its petals go out (19.4 to 21.0 s) and it bows; the light sinks down the stem (20.4 to
// 23.0 s) and the camera tilts down with it, arriving on Pip's upturned face just as the warm light on it drains away and the moon
// takes it: his face goes cold. He shivers (24.4 s); the camera holds, easing in, to the end of the shot.
B['s05-stem-dies'] = (u, T) => {
  const st = P.state(T);
  const tilt = ss(1.3, 4.3, u), d = K(u, [[0, 250], [1.5, 240], [4.3, 205], [7, 180]]);
  const yc = lerp(-150, -34, tilt);                             // frame centre: the flower head first, then down with the light front to Pip's face
  const c = cam(K(u, [[0, -6], [4.3, -22], [7, -24]]) + noise(u * 0.4, 3) * 0.5, yc + noise(u * 0.3, 4) * 0.4, 393 - d, 393, 40);
  const shiver = bump(5.65, 0.16, u) * Math.sin(u * 60), cold = ss(3.2, 4.4, u);
  const pose = { x: PX + 0.35 * shiver, y: 0, z: PZ, face: 1, yaw: 0.45, lean: -0.06 - 0.03 * cold, squash: 1 - 0.05 * bump(5.6, 0.12, u),
    headTilt: K(u, [[0, -0.12], [3.0, -0.1], [4.6, 0.02], [7, 0.06]]), eyes: 1,
    look: [K(u, [[0, 0.45], [4.0, 0.4], [5.0, 0.15], [6.2, -0.1]]), K(u, [[0, -1], [1.6, -1], [4.0, -0.55], [5.0, -0.2], [6.2, 0.1]])],
    brow: K(u, [[0, -0.2], [1.6, -0.6], [4.2, -0.9]]), mouth: u < 4.6 ? 'o' : 'frown', mouthOpen: K(u, [[0, 0.2], [2.0, 0.35], [4.4, 0.15]]), breath: u * 0.32, blink: blink(u, 2.6, 0.9), alive: 1 };
  // (polish) as the light drains, the bowed bloom's shadow settles along the big leaf behind him too, so his cold face is the brightest thing there
  const items = [shade(PX + 3, -26, 405, 50, 42, 0.5 * ss(2.5, 4.5, u)), shadeAlong(-36, -44, 405.5, 50, 16, 0.55, 0.45 * ss(2.5, 4.5, u)), rootRunnel(T, runnelK(T)), forward(pip(pose), c, 18),
    u > 2.6 && u < 4.4 && P.fx.sparkle(HERO[0] - 3, -2, HERO[2], ss(2.6, 4.4, u), { scale: 0.6 })];
  const sc = scene(T, c, items, { st, ambient: nightAt(T), noFg: true, motes: 4, lights: [pipMoon(PX + 10, -40, 370, 0.4 * cold + 0.12, 60), moonLight(-20, -140, 360, 0.3, 90)] });
  // the bell from s01 stands where it stood there (cheated to BELL), out for good now and bowed all the way: the dark reached it first
  const bell0 = P.world._fl && P.world._fl[NEAR_I];
  sc.items = sc.items.map(it => it === bell0 ? nearBell(it, 0.5) : it);
  return lensShift(sc, 0);
};

// ---------- s06 Three quick fixes, then the cup ----------
// The hero stem's centre line (the same curve the world draws, including its droop dr), so a mitt can be put on the real stem.
const stemAt = (y, dr = 0) => { const h = 150 * (1 - 0.16 * dr), t = clamp(-y / h); return 6.2 * Math.sin(t * 5.4) + 4 * t - dr * 40 * Math.pow(t, 2.2); };
// A mitt target blended in from where the arm rests, so a reach never snaps on or off.
const armTo = (pose, which, tgt, k) => {
  if (k <= 0.001) return undefined;
  const rest = P.cast.anchor('pip', { ...pose, armR: undefined, armL: undefined }, which === 'armR' ? 'mittR' : 'mittL');
  return { reach: [lerp(rest[0], tgt[0], k), lerp(rest[1], tgt[1], k)] };
};
// A point on the centre line of the hero's left leaf (t 0 at the stem, 1 at the tip), the same curve the world draws.
const leafPt = t => { const L = 78, bend = -0.32, ang = -1.02, q = (a, b, c) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
  const lx = q(0, L * bend * 0.1, L * bend), ly = q(0, -L * 0.55, -L), ox = stemAt(-21), oy = -21;
  return [ox + Math.cos(ang) * lx - Math.sin(ang) * ly, oy + Math.sin(ang) * lx + Math.cos(ang) * ly]; };
// A polished sheen on the big leaf: a soft pale streak along its centre line that builds while he rubs and dulls again afterwards.
const sheen = k => k < 0.01 ? null : { z: 405.6, draw(c) {
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [w, a] of [[9, 0.06], [5, 0.12], [2.2, 0.22]]) { c.strokeStyle = `rgba(200,236,190,${a * k})`; c.lineWidth = w; c.beginPath();
    for (let i = 0; i <= 10; i++) { const p = leafPt(0.2 + 0.55 * i / 10); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.stroke(); }
  c.restore(); } };
// The puff: his breath travels as a stream of pale wisps from his mouth up along the stem to the bowed bloom (it leaves at v 4.38, the first
// wisps reach the petals at v 4.85, as the head sways and winks), with a few thin flow lines riding it, so the sway has a visible cause.
const breathStream = (v, m, dr) => { if (v < 4.38 || v > 5.4) return null;
  const hb = [stemAt(-126, dr) - 6, -120], P0 = [m[0] - 3, m[1] - 2], P1 = [m[0] - 11, m[1] - 40], P2 = [hb[0] + 6, hb[1] + 34], P3 = hb;
  const at = p => [bez(P0[0], P1[0], P2[0], P3[0], p), bez(P0[1], P1[1], P2[1], P3[1], p)];
  return { z: 391.2, draw(c) { c.save();
    for (let j = 0; j < 9; j++) { const p = clamp((v - 4.38 - j * 0.04) / 0.47); if (p <= 0 || p >= 1) continue;
      const q = at(Math.pow(p, 0.85)), r = 3 + 7 * p + 1.5 * hash(j, 71), a = 0.62 * Math.sin(Math.PI * Math.min(1, p * 1.25 + 0.05)) * (1 - 0.4 * p), sw = (hash(j, 73) - 0.5) * 6 * p;
      const g = c.createRadialGradient(q[0] + sw - r * 0.2, q[1] - r * 0.25, 0, q[0] + sw, q[1], r); g.addColorStop(0, `rgba(232,240,255,${a})`); g.addColorStop(0.6, `rgba(196,212,244,${a * 0.6})`); g.addColorStop(1, 'rgba(180,200,240,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(q[0] + sw, q[1], r * 1.25, r * 0.85, -0.9, 0, TAU); c.fill(); }
    c.lineCap = 'round';
    for (let j = 0; j < 3; j++) { const h0 = clamp((v - 4.4 - j * 0.07) / 0.45), t0 = Math.max(0, h0 - 0.3); if (h0 <= 0 || t0 >= 0.98) continue;
      const off = (j - 1) * 3.2, a = 0.5 * (1 - ss(0.7, 1, t0));
      c.strokeStyle = `rgba(236,244,255,${a})`; c.lineWidth = 0.9; c.beginPath();
      for (let i = 0; i <= 10; i++) { const q = at(lerp(t0, h0, i / 10)); i ? c.lineTo(q[0] + off, q[1]) : c.moveTo(q[0] + off, q[1]); } c.stroke(); }
    // where it arrives: a soft swirl round the petals
    const k = clamp((v - 4.8) / 0.45); if (k > 0 && k < 1) { c.strokeStyle = `rgba(236,244,255,${0.45 * (1 - k)})`; c.lineWidth = 0.8; c.beginPath(); c.ellipse(hb[0], hb[1] - 4, 8 + 10 * k, 4 + 4 * k, -0.4, 0.3, 0.3 + 4.2 * k + 0.6); c.stroke(); }
    c.restore(); } };
};
// The fixes run on a choreography clock v (seconds), mapped from shot time so the three gags fit 5.7 s.
const fixClock = u => KL(u, [[0, 0.5], [0.55, 1.45], [2.0, 3.4], [3.45, 5.4], [5.45, 7.75], [5.7, 8.0]]);
const FIX_END = 5.7, PICK_U = DIP_PICK_U();
function DIP_PICK_U() { return P.state(0).dipper.pick - S6; }
// The cup as the world draws it (world.js dipper(): same shapes and scale), drawn here through an explicit transform so act 1 can sort it
// with Pip and blend it exactly between "in his mitt" and "lying on the ground". cupM is the world's own placement (fall 1 = on its side,
// 0 = standing on its handle); heldM recovers the placement of the cup in Pip's mitt from two of his anchors (the lip and the cup).
const R2D = 180 / Math.PI;
const cupM = (x, y, fall) => new DOMMatrix().translate(x, y).scale(-0.93, 0.93).translate(0, -4.3 + 7.5 * fall).rotate((0.1 + 1.32 * fall) * R2D).translate(0, -1.5 * fall);
const heldM = (pose, T) => {
  const lip = P.cast.anchor('pip', pose, 'lip', T), dp = P.cast.anchor('pip', pose, 'dipper', T), sg = (pose.face ?? 1) < 0 ? -1 : 1;
  const dx = lip[0] - dp[0], dy = lip[1] - dp[1], k = Math.hypot(dx, dy) / Math.hypot(5, 3), ph = Math.atan2(dy, dx) - Math.atan2(-3 * k, 5 * sg * k);
  const lx = sg * k * 4.6, ly = k * -9.6, cs = Math.cos(ph), sn = Math.sin(ph);
  return new DOMMatrix().translate(dp[0] - (cs * lx - sn * ly), dp[1] - (sn * lx + cs * ly)).rotate(ph * R2D).scale(sg * k, k);
};
// The cup exactly as the world now lays it (world.js dipper(): its lowest point rests on y), so a cup act 1 sets down matches the world's
// drawing of it in the next shot.
const CUP_PTS = (() => { const ox = 4.6, oy = -12.6, rx = 5.0, Hc = 8.2, out = [[-0.4, 1.8], [2.4, 1.8], [1.0, 3.1], [2.4, -5.4], [-0.4, -7.6]];
  for (let i = 0; i <= 12; i++) { const u = i / 12, bz = (a, b, c2, d2) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c2 + u ** 3 * d2;
    out.push([bz(ox - rx, ox - rx - 0.2, ox - 2.6, ox), bz(oy, oy + 4.6, oy + Hc, oy + Hc)], [bz(ox + rx, ox + rx + 0.2, ox + 2.6, ox), bz(oy, oy + 4.6, oy + Hc, oy + Hc)]); }
  for (let i = 0; i < 16; i++) { const a = TAU * i / 16; out.push([ox + Math.cos(a) * (rx + 0.2), oy + Math.sin(a) * 1.95]); }
  return out; })();
const worldCupM = (x, y, fall) => { const an = 0.1 + 1.32 * fall, ca = Math.cos(an), sa = Math.sin(an); let lo = -1e9;
  for (const [px, py0] of CUP_PTS) { const py = py0 - 1.5 * fall; lo = Math.max(lo, px * sa + py * ca); }
  return new DOMMatrix().translate(x, y).scale(-0.93, 0.93).translate(0, -lo).rotate(an * R2D).translate(0, -1.5 * fall); };
const lerpM = (A, B, e) => new DOMMatrix([lerp(A.a, B.a, e), lerp(A.b, B.b, e), lerp(A.c, B.c, e), lerp(A.d, B.d, e), lerp(A.e, B.e, e), lerp(A.f, B.f, e)]);
const cupItem = (M, z, shadow) => ({ z, draw(c) {
  const x = M.e, L = (col, yy, e = 0.1) => P.lit(col, x, yy, z, e);
  c.save(); c.transform(M.a, M.b, M.c, M.d, M.e, M.f);
  if (shadow > 0.01) { c.fillStyle = `rgba(4,6,18,${0.42 * shadow})`; c.beginPath(); c.ellipse(1.2, 4.4, 6.5, 1.4, 0, 0, TAU); c.fill(); }
  const hg = c.createLinearGradient(-1, 0, 3, 0); hg.addColorStop(0, L([104, 62, 38], -4)); hg.addColorStop(0.4, L([214, 150, 96], -4, 0.2)); hg.addColorStop(1, L([92, 54, 34], -4));
  P.card(c, k => { k.moveTo(-0.4, 1.8); k.bezierCurveTo(-0.4, 3.5, 2.4, 3.5, 2.4, 1.8); k.lineTo(2.4, -5.4); k.quadraticCurveTo(2.8, -6.1, 3.9, -6.3); k.lineTo(0.3, -11.6); k.quadraticCurveTo(-0.4, -9.5, -0.4, -7.6); k.closePath(); }, hg, { lift: 0.3, tex: 0.1, shadow: 0.3, edge: 0 });
  const ox = 4.6, oy = -12.6, rx = 5.0, Hc = 8.2;
  const cg = c.createLinearGradient(ox - rx, 0, ox + rx, 0); cg.addColorStop(0, L([122, 70, 44], -9)); cg.addColorStop(0.3, L([218, 150, 96], -9, 0.25)); cg.addColorStop(0.58, L([176, 108, 66], -9)); cg.addColorStop(1, L([92, 52, 36], -9));
  P.card(c, k => { k.moveTo(ox - rx, oy); k.bezierCurveTo(ox - rx - 0.2, oy + 4.6, ox - 2.6, oy + Hc, ox, oy + Hc); k.bezierCurveTo(ox + 2.6, oy + Hc, ox + rx + 0.2, oy + 4.6, ox + rx, oy); k.closePath(); }, cg, { lift: 0.5, tex: 0.12, shadow: 0.3, edge: 0.3 });
  c.fillStyle = L([40, 24, 22], oy, 0); c.beginPath(); c.ellipse(ox, oy, rx - 0.5, 1.7, 0, 0, TAU); c.fill();
  c.strokeStyle = L([232, 168, 112], oy, 0.05); c.lineWidth = 0.9; c.beginPath(); c.ellipse(ox, oy, rx + 0.2, 1.95, 0, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(255,238,200,0.6)'; c.lineWidth = 0.4; c.beginPath(); c.ellipse(ox, oy, rx + 0.2, 1.95, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.restore(); } });
// The pick-up insert: Pip at the rest spot, the cup lying on its side by his boots. He looks down at it, bends and reaches to its handle
// (mitt on the handle from 0.6 s), lifts it (0.6 to 1.1 s; until PICK_U the cup is the world's, rising with his mitt), and looks off right
// toward the channel with a new idea, the cup in his hand.
const PICK = { x: -89, z: 409 };
const LIE_X = REST.x - 8;                           // in this insert the cup lies a little further out, so its handle clears his boot
// The cup lies on its side with its handle end propped up a little on a tuft (rotated 0.2 rad about the cup body), so his mitt can close on
// the handle end. GRIP_L is the grip on the handle in the cup's own frame (the rig holds the handle at its origin, GRIP_H).
const GRIP_L = [0.7, 2.6], GRIP_H = [0, 0];
const LIE0 = (() => { const M = cupM(LIE_X, -4.5, 1), c0 = M.transformPoint(new DOMPoint(4.6, -9.6)); return new DOMMatrix().translate(c0.x, c0.y).rotate(-0.2 * R2D).translate(-c0.x, -c0.y).multiply(M); })();
const HANDLE = (() => { const q = LIE0.transformPoint(new DOMPoint(GRIP_L[0], GRIP_L[1])); return [q.x, q.y]; })();   // where he takes the handle
const pickPose = v => {   // v = time since the insert started
  const bend = ss(0.15, 0.55, v) * (1 - ss(0.78, 1.15, v)), idea = ss(1.05, 1.25, v);
  const pose = { x: PICK.x, y: 0, z: PICK.z, face: -1, yaw: 0.55, lean: 0.7 * bend, squash: 1 - 0.18 * bend + 0.03 * bump(1.15, 0.08, v), eyes: 1,
    look: idea > 0.5 ? [lerp(-0.2, 0.85, idea), -0.1] : [-0.6, lerp(0.3, 0.9, ss(0, 0.3, v))], brow: idea > 0.5 ? 0.55 : -0.25, mouth: idea > 0.5 ? 'grit' : 'flat', mouthOpen: idea > 0.5 ? 0.35 : 0.05,
    headTilt: 0.06 * bend - 0.05 * idea, breath: v * 0.5, blink: 0 };
  // the mitt goes down to the handle end, closes on it (0.55 to 0.78 s), and comes back up to his side with the cup
  pose.armR = { reach: [K(v, [[0, PICK.x - 7], [0.55, HANDLE[0]], [0.78, HANDLE[0]], [1.1, PICK.x - 10], [1.4, PICK.x - 11]]), K(v, [[0, -15], [0.55, HANDLE[1]], [0.78, HANDLE[1]], [1.1, -13], [1.4, -14]])] };
  return pose;
};
// The lying cup is placed so its grip lands exactly on his mitt as it closes (the arm's reach is short), so the contact is real.
let LIE_M = null;
const lieM = () => { if (LIE_M) return LIE_M; const m = P.cast.anchor('pip', pickPose(0.7), 'mittR', 0);
  return (LIE_M = new DOMMatrix().translate(m[0] - HANDLE[0], m[1] - HANDLE[1]).multiply(LIE0)); };
// The cup in the lift: it turns about his mitt (the grip never leaves the hand), from the way it lay to the way the rig holds it.
const linOf = M => ({ a: Math.atan2(-M.b, -M.a), s: Math.hypot(M.a, M.b) });
const liftM = (pose, T, e) => {
  const m = P.cast.anchor('pip', pose, 'mittR', T), L = linOf(lieM()), Hm = heldM({ ...pose, dipper: { tilt: 0.05, water: 0 } }, T), Hl = linOf(Hm);
  let da = Hl.a - L.a; da -= TAU * Math.round(da / TAU);
  const k = ss(0, 1, e), al = L.a + da * k, sc = lerp(L.s, Hl.s, k), g = [lerp(GRIP_L[0], GRIP_H[0], k), lerp(GRIP_L[1], GRIP_H[1], k)];
  const a = -sc * Math.cos(al), b = -sc * Math.sin(al), c2 = -sc * Math.sin(al), d = sc * Math.cos(al);
  const M = new DOMMatrix([a, b, c2, d, m[0] - (a * g[0] + c2 * g[1]), m[1] - (b * g[0] + d * g[1])]);
  return lerpM(M, Hm, ss(0.85, 1, e));
};
B['s06-fixes'] = (u, T) => {
  if (u >= FIX_END) {
    const v = u - FIX_END, st = P.state(T), pose = pickPose(v);
    const e = clamp((v - 0.78) / (PICK_U - FIX_END - 0.78));        // the lift: from when his mitt has closed on the handle to PICK_U
    // until PICK_U act 1 draws the cup: lying still until his mitt has closed on the handle end, then turning about his mitt into exactly
    // the placement it has in his hand, so the swap to the rig's cup at PICK_U is invisible
    let cup = [];
    if (u < PICK_U) { st.dipper = { ...st.dipper, held: true };
      cup = cupItem(e <= 0 ? lieM() : liftM(pose, T, e), lerp(REST.z, pose.z - 0.4, ss(0, 0.5, e)), 1 - ss(0, 0.3, e)); }
    if (u >= PICK_U) pose.dipper = { tilt: 0.05, water: 0 };
    const c = cam(K(v, [[0, -88], [1.3, -84]]), -24, PICK.z - K(v, [[0, 175], [1.3, 165]]), PICK.z, 40);
    const items = [shade(PICK.x - 3, -24, 418, 50, 40, 0.5), forward([pip(pose), cup], c, 18)];
    return lensShift(scene(T, c, items, { st, ambient: nightAt(T), noFg: true, motes: 0, lights: [pipMoon(PICK.x - 10, -40, 390, 0.75, 50), moonLight(PICK.x + 30, -60, 370, 0.3, 120)] }), lookAt(c, -22, PICK.z));   // (polish) a softer, more neutral moon on him: brighter only paled his felt toward lime
  }
  // The bowed head of his flower hangs up and to the left of him (droop 1: about (-41, -126)); the frame holds it and Pip together, so every
  // fix is aimed at the bloom. Polish: he rubs the stem like a lamp (a sheen runs up it, a hopeful wink of light in the head, then nothing).
  // Puff: he turns, looks up at the bloom and blows; the breath drifts up to it, the head sways and winks again, then nothing. Prop: he
  // braces both mitts low on the stem (below his face) and pushes it upright on tiptoe; it stands for a beat and flops back.
  const v = fixClock(u), z = 392, st = P.state(T);
  const droop = v < 6.95 ? K(v, [[5.7, 1], [6.5, 0.35]]) - 0.07 * bump(4.8, 0.25, v) : K(v, [[6.95, 0.35], [7.22, 1.15], [7.55, 0.9], [7.85, 1.04], [8, 1.0]]);
  const wink = 0.22 * bump(3.05, 0.12, v) + 0.18 * bump(4.85, 0.1, v);          // the hopeful flickers in the bloom, each gone at once
  st.hero = { ...st.hero, droop, climb: 0.16 * bump(4.55, 0.22, v) + 0.1 * bump(2.9, 0.2, v), petal: (st.hero.petal || 0) + wink };
  const tn = turning(v, 1, [[3.45, -1], [5.45, 1]]);
  const w = walkPath(v, [[0, PX], [0.5, PX], [1.4, -14]]);
  const x = v < 1.5 ? w.x : K(v, [[3.45, -14], [3.7, -13], [5.4, -13], [5.9, -10]]);
  const SY = -12, rub = ss(1.9, 2.2, v) * (1 - ss(3.0, 3.25, v)), ww = v * 14;   // he rubs the stem low, at his belly, so the near forearm stays below his mouth
  const kPol = ss(1.6, 2.0, v) * (1 - ss(3.1, 3.4, v)), kPuff = ss(3.7, 4.0, v) * (1 - ss(5.0, 5.4, v)), kProp = ss(5.5, 5.9, v) * (1 - ss(7.0, 7.4, v));
  const hand = K(v, [[5.6, -17], [6.0, -19], [6.5, -22], [6.95, -22], [7.3, -18]]);
  const blow = bump(4.5, 0.3, v), inhale = ss(3.9, 4.2, v) * (1 - ss(4.2, 4.4, v));
  // his own path, for the follow-through: the sprout and the collar trail the turn and the walk and settle after them
  const xOf = t => t < 1.5 ? K(t, [[0, PX], [0.5, PX], [1.4, -14]]) : K(t, [[3.45, -14], [3.7, -13], [5.4, -13], [5.9, -10]]);
  const pose = { x, y: 0, z, face: tn.face, yaw: 0.55 * tn.yawK, walk: w.moving && v < 1.5 ? w.phase : null, stride: 8 * Math.max(w.mov, 0.35), alive: 1, vel: [P.vel(xOf, v), 0],
    tiptoe: kProp * ss(5.8, 6.3, v) * (1 - ss(6.95, 7.2, v)),
    lean: 0.08 * kPol - 0.1 * kPuff * ss(4.0, 4.4, v) + 0.1 * kProp,
    squash: tn.sq * (1 + 0.05 * inhale - 0.07 * blow - 0.06 * bump(7.3, 0.2, v)),
    eyes: 1 - 0.7 * blow, look: v < 2.85 ? [0.7, 0.05] : v < 3.45 ? [0.1, -1] : v < 5.4 ? [0.55, -1] : v < 7.5 ? [0.3, -1] : [K(v, [[7.5, 0.3], [7.9, -0.6]]), K(v, [[7.5, -1], [7.9, 0.2]])],
    headTilt: -0.06 * kPol + 0.1 * kPuff + 0.05 * kProp,
    brow: v < 2.85 ? 0.15 : v < 3.3 ? 0.7 : v < 3.5 ? -0.5 : v < 4.7 ? 0.2 : v < 5.4 ? -0.4 : v < 7.3 ? 0.2 : -0.9,
    mouth: v < 2.85 ? 'grit' : v < 3.3 ? 'o' : blow > 0.25 ? 'o' : v < 5.4 ? 'flat' : v < 7.3 ? 'grit' : 'frown',
    mouthOpen: v < 2.85 ? 0.1 : v < 3.3 ? 0.3 : blow > 0.25 ? 0.5 * blow : 0.15, breath: v * 0.4, blink: blink(v, 2.9) };
  pose.armR = armTo(pose, 'armR', kProp > 0.01 ? [stemAt(hand, droop) - 1.5, hand] : kPuff > kPol ? [x - 6, -16] : [stemAt(SY) - 1.8 + 1.0 * rub * Math.cos(ww), SY + 2.6 * rub * Math.sin(ww)], Math.max(kPol, kProp, kPuff * 0.4));
  pose.armL = kProp > 0.001 ? armTo(pose, 'armL', [stemAt(hand + 6, droop) - 1, hand + 6], kProp) : kPol > 0.001 ? armTo(pose, 'armL', [stemAt(SY + 4) - 1.8, SY + 4], kPol) : undefined;
  const mouthP = P.cast.anchor('pip', pose, 'mouth', T) || P.cast.anchor('pip', pose, 'eyes', T);
  // the polish: a pale sheen that runs up the stem from his mitts while he rubs, then dulls
  const shk = ss(1.9, 2.7, v) * (1 - ss(3.4, 4.0, v)), climbSheen = ss(2.0, 3.0, v);
  const stemSheen = shk < 0.01 ? null : { z: 399.4, draw(c) { c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const y0 = SY + 6, y1 = lerp(SY - 4, -110, climbSheen);
    for (const [wd, a] of [[5, 0.07], [2.4, 0.16], [0.9, 0.3]]) { c.strokeStyle = `rgba(206,236,196,${a * shk})`; c.lineWidth = wd; c.beginPath();
      for (let i = 0; i <= 12; i++) { const yy = lerp(y0, y1, i / 12); i ? c.lineTo(stemAt(yy, droop) - 1.6, yy) : c.moveTo(stemAt(yy, droop) - 1.6, yy); } c.stroke(); }
    c.restore(); } };
  // camera: holds Pip and the bowed bloom together; eases back and up for the prop so the head stays in frame as it rises
  const [hx, hy] = breathe(v, 0.5), d = K(v, [[0, 360], [1.4, 330], [1.9, 316], [5.4, 316], [5.9, 340], [6.6, 372], [8, 372]]);
  const c = cam(K(v, [[0, -26], [1.9, -24], [5.4, -24], [6.4, -16], [8, -20]]) + hx, -40 + hy, 392 - d, 392, 26);
  // (polish) the bowed bloom's shadow lies along the big leaf behind him, so the pale felt sits under his face instead of competing with it
  const items = [shade(x + 4, -26, 405, 56, 48, 0.62), shadeAlong(-36, -44, 405.5, 50, 16, 0.55, 0.5), forward(pip(pose), c, 18), stemSheen,
    v > 4.05 && v < 5.3 && P.fx.puff(mouthP[0] - 3, mouthP[1] - 2, 391.4, ss(4.05, 5.3, v), { kind: 'breath', scale: 1.0, up: 20, dir: -1 }), breathStream(v, mouthP, droop),
    v > 2.3 && v < 3.4 && P.fx.sparkle(stemAt(SY - 2) - 1, SY - 2, 399.2, ss(2.3, 3.4, v), { scale: 0.7 })];
  const sc = scene(T, c, items, { st, ambient: nightAt(T), motes: 0, noFg: true, lights: [moonLight(x + 8, -22, 384, 0.8, 36), moonLight(-30, -100, 380, 0.2, 160), pipMoon(x + 2, -34, 390, 0.5, 44)] });   // (the last one lights his head only: small radius, so the flowers keep their colour)
  // no moon key here: it lands hardest on the flower tops and pales the translucent bloom and the purple buds (above about 0.8 it bleaches them);
  // his own head light and a softer night curve keep him and the lilac head in colour, and the shot's brightness stays in the night targets
  sc.moon = { key: 0 };
  sc.grade = { bloom: 0.26, night: 1 };
  return lensShift(sc,
    lookAt(c, K(v, [[0, -68], [1.9, -69], [5.4, -69], [6.4, -76], [8, -75]]), 392));
};

// ---------- s07 The dry cup ----------
// Low along the garden at the stone bed a little upstream of home, which crosses the frame dry and pale. Pip stands on the near bank in
// three-quarter profile and dips his cup into the bed: it scrapes on dry stone ("The channel was dry." at 33.8). He lifts it, peers in,
// turns it upside down and knocks it: one pebble drops out and rolls away. He sets the useless cup down on the bank beside him and lets
// go of it (it lies there, on its side, into s08), then turns and looks up the empty channel, and the camera trucks along the bed with his gaze.
const bedXAt = z => { let a = 0, b = 1; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (P.world.chan(m)[2] > z) a = m; else b = m; } return P.world.chan((a + b) / 2)[0]; };
const V7 = { pz: 630, cx: 138, d: 215, y: -40 };
V7.bed = bedXAt(V7.pz); V7.px = V7.bed + 34;   // on the turf, a rim stone's width outside the channel (the rim stones run to about bed + 27)
const SET7 = 4.3, DOWN7 = 4.7;                     // the cup leaves the held rig at SET7 and lies on the bank from DOWN7
B['s07-dry-dipper'] = (u, T) => {
  const st = P.state(T), { px, pz, bed } = V7, cupAt = st.dipper;
  // the held pose gets a slow push-in and a small slide along the bed until the truck (the camera is still for the first 4.6 s otherwise)
  const d = K(u, [[0, V7.d + 7], [4.6, V7.d], [6, V7.d - 20]]);
  const c = cam(K(u, [[0, V7.cx - 4], [4.6, V7.cx], [6, V7.cx + 40]]), V7.y, pz - d, pz, 30);
  const poseAt = uu => {
    // scoop: the mitt drops to the bed and the cup tips forward into it; it comes up, he peers in, tips it upside down and knocks it,
    // rights it, lowers it to the bank and lets go; then he turns to look up the channel
    const tn = turning(uu, -1, [[4.95, 1]], 0.32);
    const dipY = K(uu, [[0.0, -24], [0.3, -26], [1.1, -5], [1.7, -5], [2.3, -9], [2.65, -8], [3.9, -8], [4.3, -10], [4.7, cupAt.y - 2.5], [4.75, cupAt.y - 2.5], [5.1, -13]]);
    const tilt = K(uu, [[0, 0.05], [0.4, 0.1], [1.1, 1.45], [1.7, 1.45], [2.3, 0.2], [2.7, 0.1], [3.1, 3.1], [3.6, 3.1], [3.9, 0.15], [4.3, 0.05]]);
    const tx = K(uu, [[0, bed + 10], [1.7, bed + 10], [2.3, px - 11], [2.65, px - 13], [3.9, px - 13], [4.3, px - 8], [4.7, cupAt.x + 2.5], [4.75, cupAt.x + 2.5], [5.1, px + 11 * tn.face]]) + 1.5 * bump(1.4, 0.25, uu) * Math.sin(uu * 40) + 1.2 * bump(3.25, 0.06, uu);
    return { x: px, y: 0, z: pz, face: tn.face, yaw: 0.8 * tn.yawK, lean: K(uu, [[0, 0], [1.1, 0.6], [1.7, 0.6], [2.2, 0.05], [4.3, 0.05], [4.65, 0.22], [5.0, 0.0]]), armR: { reach: [tx, dipY] },
      dipper: uu < SET7 ? { tilt, water: 0 } : undefined, squash: tn.sq * (1 - 0.1 * bump(1.3, 0.5, uu) - 0.05 * bump(4.6, 0.12, uu)),
      eyes: 1, alive: 1, look: [uu < 4.9 ? K(uu, [[0, 0.6], [2.3, 0.6], [2.7, -0.7], [3.4, -0.7], [3.9, -0.4], [4.6, -0.6]]) : K(uu, [[4.9, 0.2], [5.4, 1.0]]),
        uu < 4.9 ? K(uu, [[0, 0.4], [1.1, 0.55], [1.7, 0.4], [2.3, -0.2], [2.7, 0.35], [3.4, 0.3], [3.9, 0.3], [4.6, 0.55]]) : K(uu, [[4.9, 0.3], [5.4, -0.2]])],
      brow: K(uu, [[0, 0.2], [2.2, -0.3], [4.4, -0.9]]), mouth: uu > 2.2 ? (uu > 4.4 ? 'frown' : 'flat') : 'o', mouthOpen: 0.15, breath: uu * 0.4, blink: blink(uu, 4) };
  };
  const pose = poseAt(u), lip = P.cast.anchor('pip', poseAt(3.25), 'lip', T);
  // the set-down: from SET7 the cup is drawn as the world draws it, standing in his mitt, then laid on its side on the bank
  let cup = [];
  if (u >= SET7) { const e = ss(SET7, DOWN7, u);
    cup = cupItem(lerpM(heldM(poseAt(SET7 - 1e-4), T), worldCupM(cupAt.x, cupAt.y, 1), e), lerp(pz - 0.4, cupAt.z, e), ss(0.5, 1, e)); }
  st.dipper = { ...st.dipper, held: true };                        // act 1 draws the cup in this shot (in his hand, then laid on the bank)
  const items = [forward([pip(pose), cup], c, 70),
    u > 3.3 && forward(P.fx.pebble(lip[0], lip[1], pz, clamp((u - 3.3) / 2.2), { dir: -1, dist: 22, r: 3.0, col: [122, 104, 88] }), c, 60)];
  const sc = scene(T, c, items, { st, ambient: nightAt(T), motes: 0, noFg: true, lights: [moonLight(px + 8, -34, pz - 40, 0.8, 70), moonLight(bed, -10, pz - 30, 0.75, 90)] });
  // a half key: the full moon key bleaches the purple buds and pales Pip (see s06), and the night needs the rest of its light from the garden
  sc.moon = { key: 0.6 };
  return lensShift(sc, lookAt(c, -31, pz));
};
})();
