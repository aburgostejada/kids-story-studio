// Pip and the Missing Glow. Act 3, together (shots 17-23): the three-way unjam, the burst, the light chasing home, the relight, the garden, the last hold.
// Each shot is B[name] = (u, T) => scene; u = time inside the shot, T = film time. Helpers come from shots.js (P.SH).
(() => {
const P = window.PIP, { K, KL, ss, clamp, lerp, bump, noise } = P;
const { B, START, HERO, STONE, PIP_HOME, AMB, AMB_DARK, cam, breathe, scene, pip, bram, luma, walkX, pipGait, bramGait, blink } = P.SH;
const C = P.cast, TAU = Math.PI * 2;

// ---------- the spout: shared geometry for shots 17 and 18 ----------
const M = P.world.chan(0), ROW = M[2] - 28;            // channel mouth, and the depth the three friends stand at
const T17 = START['s17-together'], T18 = START['s18-burst'];
const NOTCH_Z = 2692;                                  // depth of the cleft in the dam
// The leaf lies at z = ROW + 16, the cleft is 100 units farther back, so the leaf's tip only looks tucked into the cleft when the camera is
// roughly in line with both. This x puts the tip in front of the cleft for the wide camera used in shots 17 and 18 (x about -862, 290 away).
const LEAF_X = (() => { const cx = -862, zc = ROW - 290, xt = cx + (M[0] + 3 - cx) * (M[2] - 12 - zc) / (NOTCH_Z - zc); return xt - 7; })();
const PIN_X = LEAF_X + 132;                            // the pin stone presses the leaf's stem, right of the leaf base

// A light at (x, y, z) that tints the garden around it; used for cool moon rims and warm leaks from the pond.
const lamp = (x, y, z, col, i, rad, halo = 0) => ({ x, y, z, col, i, rad, halo });

// ---------- the dry leaf: geometry that mirrors how the world draws it ----------
// The leaf lies with its tip in the cleft (left) and its stem to the right. Its near half is rolled up like a scroll along the
// midrib (curl = 1) and opens flat as curl falls. Characters stand on the roll and hold the blade's edge, so everything they touch
// is computed here from the same formulas the world uses. All results are world units.
const LG = { Lb: 104, Lp: 40, Wh: 31, fv: 0.8 };
const hhF = sn => LG.Wh * LG.fv * Math.pow(Math.sin(Math.PI * Math.pow(clamp(sn), 0.8)), 0.78) * (1 + 0.06 * Math.sin(sn * 14 + 0.8) + 0.035 * Math.sin(sn * 37 + 1.3) + 0.025 * Math.sin(sn * 71));
function leafGeo(lf) {
  const k = clamp(lf.curl, 0, 1), f = Math.pow(k, 0.9), S0 = 0.05 * (1 - clamp((lf.free || 0) * 2)), N = 40, { Lb, Lp } = LG;
  const rr = sn => f > 0.02 ? Math.pow(f, 0.8) * (2.8 + 0.23 * hhF(sn)) * (1 + 0.14 * Math.sin(sn * 19 + 0.6) + 0.1 * Math.sin(sn * 47 + 2.0)) : 0;
  const yN = sn => hhF(sn) * (1 - 0.78 * f), lx = sn => -Lb * (1 - sn);
  const ang = 0.05 + 0.4 * lf.rot + (lf.lift || 0) * 0.12 + (lf.free || 0) * 0.15, ca = Math.cos(ang), sa = Math.sin(ang);
  let low = -1e9; for (let i = 0; i <= 30; i++) { const sn = S0 + (1 - S0) * i / 30, yy = Math.max(yN(sn) + (f > 0.02 ? rr(sn) * 1.6 : 0), 0.5); low = Math.max(low, lx(sn) * sa + yy * ca); }
  low = Math.max(low, Lp * sa + 2 * ca);
  const bx = lf.x + 2 + Lb, by = 2 - low + (lf.y + 10);
  const W = (x, y) => [bx + x * ca - y * sa, by + x * sa + y * ca];
  // where a character's feet rest: the top of the roll, easing to the middle of the near half once it is flat
  const stand = [], bottom = [];
  for (let i = 0; i <= N; i++) { const sn = lerp(S0, 1, i / N), top = yN(sn) - 0.4 * rr(sn); stand.push(W(lx(sn), top - 0.45 * yN(sn) * (1 - f))); bottom.push(W(lx(sn), yN(sn) + 1.6 * rr(sn))); }
  const at = (arr, x) => { for (let i = 1; i <= N; i++) if (arr[i][0] >= x) { const p = arr[i - 1], q = arr[i], t = (x - p[0]) / Math.max(q[0] - p[0], 1e-6); return lerp(p[1], q[1], clamp(t)); }
    return arr[N][1]; };
  return { tip: W(lx(S0), 0), base: W(0, 0), standAt: x => at(stand, x), edgeAt: x => at(bottom, x), topAt: sn => W(lx(sn), -hhF(sn) * 0.94), midAt: sn => W(lx(sn), 0), x0: stand[0][0], x1: stand[N][0], ang };
}
// How far the leaf tip is raised (world units) -> the story state's `lift` parameter (the world turns lift into an angle about the base).
const ANG0 = 0.05 + 0.4 * 0.25;
const liftFor = h => (Math.asin(clamp(Math.sin(ANG0) + h / 98, -0.99, 0.99)) - ANG0) / 0.12;
const seatLeaf = (curl, h, extra = {}) => Object.assign({ curl, x: LEAF_X, y: -10, z: M[2] - 12, rot: 0.25, free: 0, lift: liftFor(h) }, extra);


// Pip's arms for joy and effort. sh is the shoulder angle from hanging down (radians), el the elbow bend. Raised arms go up and
// OUT beside the head (right arm sh near 2.2, left near -2.6) so the mitts clear his face; k blends from his resting arms.
const armsUp = (k, wob = 0) => k > 0.01 ? { armR: { sh: lerp(0.16, 2.2 + 0.28 * wob, k), el: lerp(0.45, -0.1, k) }, armL: { sh: lerp(-0.3, -2.6 - 0.28 * wob, k), el: lerp(0.3, 0.3, k) } } : {};

// ---------- the pin stone ----------
// One object in every shot: act 2 draws it (P.SH.boulder, a pale lilac stone with a cream vein), act 3 uses the very same function.
const boulder = (x, y, z, rot, hot = 0) => P.SH.boulder(x, y, z, rot, hot);

// ---------- the plugged cleft: the leaf's tip stoppers the spout and the pond leaks round it ----------
// press 0..1 is the water pressure behind the plug: small drops fall from its flanks onto the stones below; near full pressure droplets spit
// out of the corners. (The water the camera reads, the pond in the slot and the spill under the lifted tip, is the world's: pressItems.) pulse (0..1) is an extra surge when the leaf is yanked.
function plugFx(press, pulse, T) {
  const cx = M[0], z = NOTCH_Z - 0.6, items = [];
  items.push({ z, draw(c, s, t) {
    const bulge = 5 * press + 3 * pulse, top = -27 - bulge, wob = 0.5 * Math.sin(T * 13) * press;
    c.save();
    const pw = 17.5;
    const a = 0.3 + 0.7 * press + 0.3 * pulse;
    // drips falling from the flanks and a bright wet shine on the stones below the cleft
    for (let i = 0; i < 6; i++) { const sd = i % 2 ? 1 : -1, ph = ((T * (0.9 + 0.5 * P.hash(i, 61)) + P.hash(i, 62)) % 1), x0 = cx + sd * (pw + 1.5 + 1.4 * P.hash(i, 63)), y0 = -4 + 9 * ph * ph;
      c.fillStyle = `rgba(120,186,206,${0.6 * a * (1 - ph) * (0.4 + 0.6 * press)})`; c.beginPath(); c.ellipse(x0, y0, 0.6, 0.9 + 0.5 * ph, 0, 0, TAU); c.fill(); }   // small cool drops
    // spits of water out of the corners as the pressure peaks
    const sp = ss(0.55, 1, press) + 0.6 * pulse;
    if (sp > 0.02) for (let i = 0; i < 10; i++) { const sd = i % 2 ? 1 : -1, per = 0.55 + 0.25 * P.hash(i, 71), ph = ((T / per + P.hash(i, 72)) % 1), x0 = cx + sd * (pw - 1), y0 = top + 9, vx = sd * (14 + 14 * P.hash(i, 73)), vy = -16 - 14 * P.hash(i, 74);
      const px = x0 + vx * ph * 0.55, py = y0 + vy * ph * 0.55 + 52 * ph * ph * 0.3, qx = x0 + vx * (ph - 0.07) * 0.55, qy = y0 + vy * (ph - 0.07) * 0.55 + 52 * (ph - 0.07) * (ph - 0.07) * 0.3;
      if (ph < 0.07) continue; void qx; void qy; c.fillStyle = `rgba(190,230,242,${0.7 * sp * (1 - ph)})`; c.beginPath(); c.arc(px, py, 0.55, 0, TAU); c.fill(); }   // round droplets on arcs
    c.restore(); } });
  return items;
}

P.SH.leafGeo = leafGeo; P.SH.liftFor = liftFor; P.SH.LEAF_X = LEAF_X;

// ---------- act 3 helpers ----------
const PIN_R = 14;                                       // half width of the drawn pin stone
const LZ = M[2] - 12, PZL = LZ - 0.6, LUZ = LZ - 1.2;   // the leaf card's depth; Pip and Luma on the leaf are drawn just in front of it, at its own depth, so their
                                                        // feet register on it under every camera (a character 30 units nearer would look sunk into it)
const LUMA_SN = 0.08;                                   // where Luma grips the far edge: right beside the rolled tip, the part she raises
// The world's leaf outline (world.js leafHH), so a foot or a mitt lands on the blade as it is drawn. P.world.leafEdge is used when the world has it.
const leafHHw = sn => { const q = Math.pow(clamp(sn), 0.78), tp = ss(0, 0.17, sn); return 31 * 0.8 * Math.pow(Math.max(Math.sin(Math.PI * q), 0), 0.95) * Math.pow(tp, 0.55) * (1 + 0.05 * Math.sin(sn * 14 + 0.8) + 0.03 * Math.sin(sn * 37 + 1.3)); };
const leafEdge = (lf, sn) => {
  if (P.world.leafEdge) { const e = P.world.leafEdge(lf, sn); if (e) return Array.isArray(e) ? e : [e.x, e.y]; }
  const g = P.world.leafGeo(lf), ca = Math.cos(g.ang), sa = Math.sin(g.ang), xx = -104 * (1 - sn), yy = -leafHHw(sn);
  return [g.base[0] + xx * ca - yy * sa, g.base[1] + xx * sa + yy * ca];
};
// Nothing may sit right in front of the lens: world cards closer than d to the camera are dropped (a bud passed by a moving camera would fill the
// frame for one frame).
const nearCull = (sc, d = 36) => { const cz = sc.cam.z; sc.items = sc.items.filter(it => it.screen || it.flat || it.z > cz + d); return sc; };   // flat ground pieces lie below the frame when near, and must not open holes
// Every plant the world draws (garden flowers, meadow flowers, channel buds, meadow buds), rebuilt from the same hashes so a shot can lift plants out
// of a runner's lane. Map from the world's item to { x, z, off (buds: distance from the channel) }.
let PLANTS = null;
const plantMap = () => {
  if (PLANTS) return PLANTS;
  const H = P.hash, list = [], inLane = (x, z) => Math.abs(x + 45) < (z > 250 ? 190 : 140);
  P.world.FLOWERS.forEach(f => list.push({ x: f.x, z: f.z }));
  for (let i = 0; i < 70; i++) { const z = -1250 + 1670 * Math.pow(H(i, 811), 0.8), x = -1100 + 2000 * H(i, 812); if (!inLane(x, z)) list.push({ x, z }); }
  for (let i = 0; i < 560; i++) { const u = 0.005 + 0.99 * (i + H(i, 11) * 0.8) / 560, side = i % 2 ? 1 : -1, row = H(i, 12), off = row < 0.4 ? 32 + H(i, 13) * 7 : row < 0.72 ? 43 + H(i, 13) * 9 : 56 + Math.pow(H(i, 13), 1.3) * 60;
    const p = P.world.chan(u), t = P.world.chanDir(u); list.push({ x: p[0] - t[1] * side * off, z: p[2] + t[0] * side * off, off }); }
  for (let i = 0; i < 560; i++) { const z = -1250 + 1670 * Math.pow(H(i, 801), 0.78), x = -1100 + 2000 * H(i, 802); if (!inLane(x, z)) list.push({ x, z }); }
  // the world's own flower items (built by scene() before any shot clears plants); calling P.world.flowers() here would reset the state the
  // frame's flowers draw with, so the first frame that built this map drew its flowers unlit and uncalmed (a one-frame pop)
  const items = P.world._fl || P.world.flowers({}); PLANTS = new Map();
  if (items.length === list.length) items.forEach((it, i) => { if (Math.abs(it.z - list[i].z) < 0.01) PLANTS.set(it, list[i]); });
  return PLANTS;
};
const clearPlants = (sc, gone) => { const mp = plantMap(); sc.items = sc.items.filter(it => { const q = mp.get(it); return !q || !gone(q); }); return sc; };
const inRect = r => q => q.x > r.x0 && q.x < r.x1 && q.z > r.z0 && q.z < r.z1;
// The spout shots share act 2's look (same cold ambient, vignette and cleared buds), so the cut from shot 16 to 17 shows the same frame.
const SPOUT_AMB = [0.12, 0.16, 0.34];
const spoutScene = (T, c, items, o) => P.SH.clearSpoutScatter(clearPlants(scene(T, c, items, Object.assign({ noFg: true, ambient: SPOUT_AMB }, o)), inRect({ x0: M[0] - 230, x1: M[0] + 200, z0: 2300, z1: 2720 })));
const rim = (x, z, i = 0.7) => lamp(x - 10, -92, z + 130, [0.56, 0.68, 1.0], i, 110);
// Luma's wing phase as a running integral of her beat rate (beats per second), so the rate can change without a jump. Rates stay at 4-5 beats
// per second: 6+ frames per beat at 30 fps, so the wings never strobe.
const wingPhase = (u, segs) => { let ph = 0, t0 = 0, r0 = segs[0][1]; for (const [t, r] of segs) { if (u <= t) return TAU * (ph + r0 * (u - t0) + 0.5 * (r - r0) * (u - t0) * (u - t0) / Math.max(t - t0, 1e-6)); ph += 0.5 * (r0 + r) * (t - t0); t0 = t; r0 = r; }
  return TAU * (ph + r0 * (u - t0)); };

// ---------- shared drawing for the chase and the homecoming ----------
// ---------- shared helpers for the chase and the homecoming ----------
// The water head racing home, in the stream's own look (P.fx.waterRibbon): a blue-green body with ripples, cool streaks and golden particles
// of carried light, and a leading edge (a bulging tongue with a foam rim, a dark wet line soaking into the dry bed ahead, droplets). pts are
// world points along the bed, upstream first; s0..s1 is the stretch (0..1 along pts) that holds water, s1 the front. A surge runs higher than
// the settled stream, so o.lift raises its surface (world units) enough to clear the rim stones from a low lens; o.width is its half width;
// o.alpha fades the whole thing (used where the settled stream takes over).
function waterHead(pts, s0, s1, T, o = {}) {
  if (s1 <= 0.001) return [];
  const al = o.alpha ?? 1; if (al < 0.01) return [];
  const it = P.fx.waterRibbon(pts, { t: T, from: s0, to: s1, nose: o.nose ?? 1, width: o.width ?? 10, taper: o.taper, lift: o.lift ?? 3, glow: o.glow ?? 1.1, zBias: o.zBias ?? 0, seg: o.seg });
  return al > 0.99 ? it : it.map(q => q.draw ? Object.assign(Object.create(q), { draw(c, s, t) { c.save(); c.globalAlpha *= al; q.draw(c, s, t); c.restore(); } }) : q);
}

// The leading wave of the released water as it runs down the channel: a raised blue-green head of water across the bed (inside the trench,
// below the rim tops) whose front edge curls over in a low lip of foam, foam flecks sliding back off it, ripple lines trailing behind it,
// a few golden particles in it and a little spray off the lip. w: the front (channel u); k fades it; sz scales it; cam: the shot's camera
// (the head is drawn in true perspective on one card).
function waveCrest(w, T, k = 1, sz = 1, cam = null) {
  if (w < 0.004 || k < 0.02 || !cam) return null;
  const p = P.world.chan(w), d = P.world.chanDir(w), n = [-d[1], d[0]], z0 = p[2] - 1, HW = 10.5, Y = -3.2 * sz;
  const pt = (al, ac, y) => [p[0] + d[0] * al + n[0] * ac, y, p[2] + d[1] * al + n[1] * ac];
  const proj = q => { const kk = (z0 - cam.z) / Math.max(q[2] - cam.z, 1); return [cam.x + (q[0] - cam.x) * kk, cam.y + (q[1] - cam.y) * kk, kk]; };
  return { z: z0, draw(c, s) {
    const pal = P.fx.waterColors(p[0], -3, p[2], true), H = P.hash, rgba = (q, a) => `rgba(${q[0] | 0},${q[1] | 0},${q[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`, M = 14;
    const hump = f => (1.2 + 1.6 * sz) * (1 - 0.45 * f * f) * (1 + 0.12 * Math.sin(f * 5 + T * 7));   // the head stands highest mid-bed
    const front = [], back = [], lip = [];
    for (let i = 0; i <= M; i++) { const f = i / M * 2 - 1, wob = 0.8 * Math.sin(f * 4 + T * 6) + 0.5 * Math.sin(f * 9 - T * 9), ac = f * HW;
      front.push(proj(pt(wob * 0.4, ac, Y - hump(f)))); lip.push(proj(pt(1.4 + 0.5 * wob, ac, Y - hump(f) * 0.55))); back.push(proj(pt(-16 * sz, ac, Y))); }
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    // the body of the head: deep blue-green, lighter toward the crest
    const g = c.createLinearGradient(back[M >> 1][0], back[M >> 1][1], front[M >> 1][0], front[M >> 1][1]);
    g.addColorStop(0, rgba(pal.body, 0)); g.addColorStop(0.3, rgba(pal.body, 0.9 * k)); g.addColorStop(0.85, rgba(pal.mid, 0.95 * k)); g.addColorStop(1, rgba(pal.glint, 0.95 * k));
    c.fillStyle = g; c.beginPath(); back.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); for (let i = M; i >= 0; i--) c.lineTo(front[i][0], front[i][1]); c.closePath(); c.fill();
    // the face of the wave: from the crest down and forward to the lip, a darker curl underneath
    c.fillStyle = rgba(pal.deep, 0.8 * k); c.beginPath(); front.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); for (let i = M; i >= 0; i--) c.lineTo(lip[i][0], lip[i][1]); c.closePath(); c.fill();
    // ripple lines trailing behind it, sliding back as it runs
    for (let r = 0; r < 3; r++) { const al = -((r + (T * 1.6) % 1) / 3) * 15 * sz, fade = 1 - (r + (T * 1.6) % 1) / 3;
      c.strokeStyle = rgba(pal.glintHi, 0.45 * k * fade); c.lineWidth = Math.max(0.5, 0.9 / s * 2);
      c.beginPath(); for (let i = 0; i <= M; i++) { const f = i / M * 2 - 1, q = proj(pt(al + 1.2 * Math.sin(f * 3 + r), f * HW * 0.9, Y - 0.6 * hump(f) * (1 + al / 16))); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); } c.stroke(); }
    // the curling foam lip along the front edge: a broken white band of small blobs
    for (let i = 0; i <= M * 2; i++) { if (H(i, 843) < 0.35) continue; const t = i / (M * 2), j = Math.min(M - 1, Math.floor(t * M)), u = t * M - j, a = front[j], b = front[j + 1], la = lip[j], lb = lip[j + 1];
      const x = lerp(lerp(a[0], b[0], u), lerp(la[0], lb[0], u), 0.35), y = lerp(lerp(a[1], b[1], u), lerp(la[1], lb[1], u), 0.35), r = (0.3 + 0.45 * H(i, 841)) * a[2] * sz * (0.8 + 0.3 * Math.sin(T * 11 + i));
      c.fillStyle = rgba(pal.foam, (0.5 + 0.3 * H(i, 842)) * k); c.beginPath(); c.ellipse(x, y, r * 1.6, r, 0, 0, TAU); c.fill(); }
    c.strokeStyle = rgba(pal.foam, 0.7 * k); c.lineWidth = Math.max(0.6, 0.7 * front[0][2] * sz); c.beginPath(); front.forEach((q, i) => i ? c.lineTo(q[0], q[1] - 0.2) : c.moveTo(q[0], q[1] - 0.2)); c.stroke();
    // foam flecks sliding back off the crest
    for (let i = 0; i < 14; i++) { const ph = (T * (1.1 + 0.6 * H(i, 851)) + H(i, 852)) % 1, f = H(i, 853) * 2 - 1, q = proj(pt(-ph * 12 * sz, f * HW * 0.85, Y - hump(f) * (1 - 0.7 * ph))), r = (0.35 + 0.5 * H(i, 854)) * q[2] * sz;
      c.fillStyle = rgba(pal.foam, 0.75 * k * (1 - ph)); c.beginPath(); c.ellipse(q[0], q[1], r * 1.6, r, 0, 0, TAU); c.fill(); }
    // the light it carries, as a few golden particles in the head
    for (let i = 0; i < 5; i++) { const f = H(i, 861) * 1.6 - 0.8, q = proj(pt(-3 - 8 * H(i, 862), f * HW, Y - 0.5 * hump(f))); P.fx.goldSpark(c, q[0], q[1], Math.max(0.5 * q[2], 0.6), 0.8 * k * (0.5 + 0.5 * Math.sin(T * 8 + i))); }
    // a little spray off the lip
    for (let i = 0; i < 8; i++) { const ph = (T * (1.5 + H(i, 871)) + H(i, 872)) % 1, f = H(i, 873) * 2 - 1, q = proj(pt(1.5 + 4 * ph, f * HW * 0.9, Y - hump(f) - 5 * sz * ph + 7 * sz * ph * ph)), r = 0.45 * q[2] * sz;
      c.fillStyle = rgba(pal.glintHi, 0.7 * k * (1 - ph)); c.beginPath(); c.ellipse(q[0], q[1], r, r * 1.4, 0, 0, TAU); c.fill(); }
    c.restore(); } };
}
// The burst: the whole pond comes out of the cleft. A thick surge heaves over the lip at the release and curls out and down (a wide, short-lived
// sheet over the main one), then the sheet keeps pouring and spreads wider over the next two seconds, its soft edges rippling; at its foot a
// churning splash that keeps running. rel: seconds since the release.
function burstWater(c, rel) {
  if (rel <= 0) return [];
  const spread = lerp(1.6, 3.0, ss(0.1, 2.4, rel)), surge = Math.exp(-Math.pow((rel - 0.35) / 0.28, 2));
  // (a heavy sheet that bows up and out over the lip before it falls, feathered at its edges, a white crest boiling across its lip)
  const main = P.fx.gush(c, rel, NOTCH_Z - 52, { width: spread * (1 + 0.08 * Math.sin(rel * 5.3)), soft: 0.75, power: 1.35, glow: 0.8, hold: true, lip: 3.2 + 1.6 * surge, spread: 13, to: [48, 22, -112], arc: 22 + 10 * surge, foam: 0.9, streaks: 0.35 });
  const lipS = surge > 0.03 && P.fx.gush(c, Math.max(rel, 0.05), NOTCH_Z - 53, { width: 1.6 + 0.8 * surge, soft: 0.8, power: 1.1 * surge, glow: 0.6, hold: true, lip: 5 * surge + 2, spread: 14, to: [34 + 20 * surge, 22, -60 - 30 * surge], arc: 34, foam: surge, drops: 40, fling: 36, streaks: 0.35 });
  const out = [main, lipS];
  if (main) { const f = main.foot, sk = ss(0.25, 0.6, rel);
    if (sk > 0) out.push(P.fx.splash(f[0], -0.5, f[2] - 1, rel, sk, { scale: 2.8, drops: 34, height: 1.6, glow: 0.6, crown: 0.8, rate: 1.3, pearl: 0.25 }),
      P.fx.splash(f[0] - 10, -0.4, f[2] + 4, rel + 0.37, 0.6 * sk, { scale: 1.6, drops: 16, height: 1.1, glow: 0.4, crown: 0.5, rate: 1.1, pearl: 0.25 })); }   // spray where it lands, a second churn just behind it
  return out;
}
// ---------- shot 17: the climax ----------
// One story state drives it all (shots.js C17, read through P.state): Bram's push k on the stone, the tip height Luma has raised, the curl Pip has
// opened. The characters are posed from those curves, so whatever a cut shows, the parts and the hands agree. These pose functions also carry
// shot 18 up to the release (u up to 11.5). The one shared view, left to right: Pip on the turf left of the leaf's rolled tip, holding the
// scroll's free edge; Luma above, on the far edge over the scroll; the blade; the freed stem lying on the ground; Bram at the stem's end, the stone
// rolled back off it, beside the pale dent where it sat.
const W17 = P.SH.WIDE17;
const WIDE_CAM = () => cam(W17.x, TIGHT.y, ROW - 340, ROW + 42, 26, { f: W17.f });   // the shared wide's position (its lens and shifts: TIGHT, below)
// v5.1: the shared wide every result is shown in after the first close (u 2.6 on, and shot 18 up to the release) is TIGHT: the same lens position
// (so the tip still lines up with the cleft) with a 20% longer lens, a lens shift that frames Pip's back, the outlet, the roll, Luma's grip and Bram's
// jaws on the short freed stem, and a vertical shift that lifts the picture so the sky and hills go and the three contacts sit in the middle of the
// frame. The opening wide (u 0-1.1) is still shot 16's last frame (W17), where Bram's head is on the stone.
// (push: the joint strain (u 7.1 on) carries a small lens shift to the right, so Pip, stepping back with every heave, keeps his back clear of
// the left edge; shot 18 runs the same shift up to the release, then eases to -300)
const TIGHT = { y: -62, f: 3300, shift: -250, vshift: -197, push: 10 };   // (y: a little higher than W17's, looking over the leaf into the pond)
const tightShift = u => TIGHT.shift + TIGHT.push * ss(7.1, 11.0, u);
// the moon card (world.js hills, z 40000) faded by a (0..1): the tight wide has no moon, shot 18 brings it back as the lens pulls back
const moonFade = (sc, a) => { if (a >= 0.999) return sc; sc.items = sc.items.filter(it => it.z !== 40000 || a > 0.001).map(it => it.z === 40000 && !it.screen ? Object.assign(Object.create(it), { draw: (c, s, t) => { c.save(); c.globalAlpha *= a; it.draw(c, s, t); c.restore(); } }) : it); return sc; };
// the channel's rim stones nearer the lens than the friends (world.js channel items carry .stone): the tight wide sinks them into the dark so the
// bottom of the frame is quiet (a 0); shot 18 brings them back up (a) as the lens pulls back
const nearStones = (sc, a) => { if (a >= 0.999) return sc; const f = `brightness(${(0.42 + 0.58 * a).toFixed(3)})`;
  sc.items = sc.items.map(it => it.stone && it.z < ROW - 4 ? Object.assign(Object.create(it), { draw: (c, s, t) => { c.save(); c.filter = f; it.draw(c, s, t); c.restore(); } }) : it); return sc; };
// a lens shift in both directions: the picture slides without moving the camera (parallax unchanged); light halos move with it
const hvShift = (sc, px, py = 0) => {
  if (!px && !py) return sc;
  const cm = sc.cam;
  sc.items = sc.items.map(it => it.screen ? it : Object.assign(Object.create(it), { draw: (c, s, t) => { c.save(); c.translate(px / s, py / s); it.draw(c, s, t); c.restore(); } }));
  sc.lights = sc.lights.map(L => L.halo > 0 ? Object.assign({}, L, { halo: 0 }) : L).concat(sc.lights.filter(L => L.halo > 0).map(L => { const k = Math.max(L.z - cm.z, 1e-3) / cm.f; return { x: L.x + px * k, y: L.y + py * k, z: L.z, col: L.col, i: L.i, rad: 0.01, halo: L.halo }; }));
  return sc;
};
const PZ17 = ROW - 6;                                   // Pip's depth: on the turf just in front of the leaf's tip and the rocks of the gap
// Bram: head on the stone's right side (facing left, toward the leaf). On "Bram pushed" he shoves (it rocks), slips back, shoves again and the
// stone rolls back and left off the stem, which springs free. He steps back to the stem's snapped end (so the freed stem lies in the open), and
// while the camera is on Luma takes the end in his jaws. In the joint strain he pulls on it, backing off a step at each heave.
const BRAM_BACK = [2.15, 2.7], BRAM_BITE = [3.7, 4.05];
const STEM_FREE_X = () => { const b = LEAF_X + 2 + 104; return b + (P.world.STEM_FREE || 40) * Math.cos(ANG0) + 1; };   // (v5.1: a short freed stem, so Bram stands close to the leaf)   // where the freed stem's snapped end lies (world.js leafStem)
const BRAM_HEAVES = [8.1, 8.85, 9.65, 10.5];
function bram17(u, T, ps) {
  const k = ps.k, push = u < 2.35;
  const strain = K(u, [[0, 0.17], [1.0, 0.25], [1.15, 1], [1.6, 0.95], [1.72, 0.2], [1.95, 0.3], [2.05, 1], [2.25, 1], [2.4, 0.3], [3.7, 0.3], [4.05, 0.6], [8.0, 0.6], [8.3, 1], [10.1, 0.9], [10.25, 0.8], [10.45, 1], [10.8, 1], [11.3, 0.3]]);
  const slipped = u > 1.6 && u < 1.95, done = u > 2.3 && u < 3.0;
  const pulling = u > BRAM_BITE[0], heave = BRAM_HEAVES.reduce((a, t0, i) => Math.max(a, (i === 3 ? 1.2 : 1) * bump(t0, 0.14, u)), 0);
  const bp = { x: 0, y: 0, z: ROW - 3, face: -1, brace: pulling ? 1 : K(u, [[0, 0.5], [1.1, 1], [2.25, 1], [2.45, 0.3], [3.5, 0.3], [3.75, 1]]), push: pulling ? 0.35 + 0.4 * heave : push ? clamp(strain * (0.85 + 0.15 * Math.sin(u * 17))) : 0.1,
    lean: pulling ? -0.12 - 0.12 * heave - 0.05 * ss(8.0, 8.3, u) : 0.03 * Math.sin(u * 19) * strain * (push ? 1 : 0),
    eyes: slipped ? 1 : strain > 0.7 ? 0.55 : 1, look: pulling ? [-0.6, 0.3] : done ? [-0.9, 0.5] : [-1, 0.25], head: (u < 3.0 ? 0.3 * ss(1.0, 1.3, u) * (1 - ss(2.25, 2.5, u)) : 0.35 * ss(3.4, 3.7, u)) + 0.3 * ss(BRAM_BITE[0], BRAM_BITE[1], u),
    brow: slipped ? 0.8 : done ? 0.7 : strain > 0.5 ? -0.8 : u < 0.6 ? 0.1 : -0.2,
    mouth: slipped ? 'o' : done ? 'smile' : strain > 0.5 ? 'grit' : u < 0.6 ? 'smile' : 'flat', mouthOpen: slipped ? 0.45 : done ? 0.3 : 0.15, squash: 1 - 0.05 * strain, breath: 0.1 + u * 0.4,
    autoBlink: false, blink: strain > 0.7 ? 0 : blink(T, 4.3, 2) };
  const off = C.anchor('bram', bp, 'front', T)[0];                                   // front anchor x relative to the pose x
  // the push: his head stays on the stone's right side as it rocks and starts to roll; after it is clear he steps back to the stem's end
  // (after the push he backs off to just past the freed stem's end, his mouth clear of it, and only reaches down for it on the bite)
  const fPush = Math.min(ps.x, PIN_X - 6) + PIN_R + 0.4, fEnd = STEM_FREE_X() + 4 - 3 * ss(BRAM_BITE[0], BRAM_BITE[1], u), back = ss(BRAM_BACK[0], BRAM_BACK[1], u);
  const pullBack = BRAM_HEAVES.reduce((a, t0, i) => a + (i < 3 ? 0.45 : 0.7) * ss(t0 - 0.05, t0 + 0.2, u), 0);   // (v5.1: small steps: he stays inside the tight wide)
  // (he opens where shot 16 leaves him, head just touching the stone's right side, and leans his head onto it over the first second, in the wide)
  const settle = (PIN_X + 14.5 - fPush) * (1 - ss(0.15, 0.95, u));
  const lunge = 2.5 * ss(1.95, 2.3, u);                                              // his head follows through as the stone tips off
  const front = lerp(fPush + lunge, fEnd, back) + pullBack + settle + (push ? 0.9 * Math.sin(u * 23) * strain : 0.4 * Math.sin(u * 21) * heave);
  const settling = u > 0.15 && u < 0.95, SETTLE = (PIN_X + 14.5 - fPush) / 2;   // the settle onto the stone is one short gait cycle, so his feet stay planted
  const pose = Object.assign(bp, { x: front - off, walk: settling ? ss(0.15, 0.95, u) : u > BRAM_BACK[0] && u < BRAM_BACK[1] ? bramGait(back * (fEnd - fPush), 7) : null, stride: settling ? SETTLE : 7 });
  return { pose, front: C.anchor('bram', pose, 'front', T), pulling };
}
// Luma: hovers by the tip while the camera is on Bram, and on "Luma lifted" comes down over the far edge right beside the rolled tip and grips it
// with her front legs while she keeps flying: her body stays a hand's breadth above the leaf (never sitting on it), the other legs tucked, wings
// beating, and as she beats the tip rises up out of the cleft (C17.tip). Her feet are solved onto the drawn edge every frame, so as the tip rises
// she rises with it. She faces right from the cut to Bram's close (u 1.1, off screen), so her body hangs over the cleft, clear of the blade.
const LUMA_FLAP = [[0, 4.0], [3.3, 4.2], [3.7, 4.8], [12, 4.8]];
const LUMA_HANG = [-5, -5.0];   // (v4.3: her body a hand's breadth clear of the blade, legs angled down to the edge)                                  // her body (pose x, y) from the gripped point: up and behind it, over the cleft, legs stretched
function luma17(u, T, lf) {
  const e = leafEdge(lf, LUMA_SN), foot = [e[0], e[1] + 0.6], grip = ss(3.42, 3.68, u), face = u < 1.1 ? -1 : 1, flap = wingPhase(u, LUMA_FLAP);
  const hx = K(u, [[0, M[0] + 30], [1.1, M[0] + 26], [2.6, foot[0] - 7], [3.3, foot[0] - 6]]), hy = K(u, [[0, W17.lumaY], [1.1, W17.lumaY + 2], [2.6, foot[1] - 19], [3.3, foot[1] - 14]]) + 2.2 * Math.sin(u * 5 + 35) * (1 - grip);   // (the bob in phase with shot 16's last frame)
  const z = lerp(ROW - 8, LUZ, ss(1.2, 2.6, u)), effort = ss(3.6, 3.9, u), beat = Math.sin(flap);
  const gx = foot[0] + LUMA_HANG[0], gy = foot[1] + LUMA_HANG[1] - 0.6 * beat * effort - 1.4 * heaveAt(u) - 1.0 * bump(10.5, 0.16, u);   // each downstroke tugs her body (and the edge) up a little; she bobs up on every heave
  return { x: lerp(hx, gx, grip), y: lerp(hy, gy, grip), z, face, wings: 1, flap, flapHz: 6.4 * effort, hover: 1, hold: grip > 0.02 ? { x: foot[0], y: foot[1], k: grip } : null,
    antL: -0.4 + 0.2 * (1 - ss(0, 0.5, u)) - 0.3 * effort, antR: 0.4 - 0.2 * (1 - ss(0, 0.5, u)) + 0.3 * effort, eyes: effort > 0.5 ? 0.6 : 1, look: effort > 0.5 ? [0.2, 0.6] : [-0.4, 0.3],
    brow: lerp(0.2 + 0.3 * (1 - ss(0, 0.5, u)), -0.7, effort),   // (antennae and brow open from shot 16's last frame)
    mouth: effort > 0.5 ? 'grit' : 'smile', mouthOpen: 0.2, lean: 0.1 * effort, autoBlink: false, blink: effort > 0.5 ? 0 : blink(T, 2.9, 3) };
}
// Pip: from where shot 16 left him he trots to the turf left of the rolled tip and waits there, watching the others. On "Pip unrolled" he takes the
// scroll's free edge in both mitts and heaves, leaning back with his boots braced: each heave unwinds the scroll a turn (C17.curl), so it gets
// smaller and the opened blade runs out of it, continuous with the leaf, into his mitts; he gives a short step back each time. Three more heaves
// in the joint strain, the last in the surge. His mitts' point is fixed in the world (pipGrip), so the paper meets them from every camera.
const PIP_HEAVES = [6.1, 6.6, 7.05, 8.3, 9.05, 9.85, 10.45];
const heaveAt = u => PIP_HEAVES.reduce((a, t0, i) => Math.max(a, (i === 6 ? 1.25 : 1) * bump(t0, 0.13, u)), 0);
// how far he has drawn the strip of opened leaf off the scroll: one planted step back on each heave (world units)
const PULL_STEP = 1.0;   // (v5.1: short steps, so he stays well inside the tight wide)
const pullAt = u => PIP_HEAVES.reduce((a, t0) => a + PULL_STEP * ss(t0 - 0.03, t0 + 0.24, u), 0);
// the close on "Pip unrolled": Pip, his mitts on the strip, the scroll, and Luma over it all in frame (she is never cut by the top edge)
const PIP_CAM = u => cam(-898 + 0.4 * Math.sin(u * 2), -43, PZ17 - lerp(212, 204, ss(5.8, 7.1, u)), PZ17 + 8, 16);
// (his mitts are placed through the camera that is looking: on the leaf's 2.5D card the scroll and his mitts line up only from that camera, so the
// close cheats his spot a little; the cuts at 5.8 and 7.1 hide the cheat and the contact reads the same from both)
const gripCam = u => u >= 5.8 && u < 7.1 ? PIP_CAM(u) : WIDE_CAM();
// where his mitts hold the free edge (world point at his depth): out of the scroll end's lower left, further out with every step back (pull)
function gripPoint(lf, RC = WIDE_CAM(), pull = 0) {
  const E = P.world.leafScrollEnd(seatLeaf(lf.curl, lf.tip || 0, { rollK: lf.rollK })), open = clamp((1 - lf.curl) / 0.59);
  const G = [E.x - E.r * 0.62 - 3.2 - pull, Math.max(E.y + E.r + 4.5 + 2.5 * open, -24)], k = (PZ17 - RC.z) / (LZ - RC.z);   // below and left of it: his mitts at chest height (never above it: the strip slopes down to them as the tip rises)
  return [RC.x + (G[0] - RC.x) * k, RC.y + (G[1] - RC.y) * k, PZ17];
}
const PIP_WAIT = () => gripPoint(seatLeaf(1, 0))[0] - 16, PIP_BACKOFF = 4;
P.SH.pipWait = PIP_WAIT;
function pip17(u, T, lf) {
  const RUN0 = PIP_WAIT(), pull = pullAt(u), gp = gripPoint(lf, gripCam(u), pull), heave = heaveAt(u), wind = ss(10.0, 10.25, u) * (1 - ss(10.3, 10.4, u));
  const reachK = ss(5.78, 6.02, u), grab = ss(5.84, 6.1, u);
  // (he backs off a few steps while Bram pushes, so Luma has the tip to herself; a backward shuffle, his feet planted)
  const runK = ss(0.4, 1.3, u), xWait = PIP_WAIT() - PIP_BACKOFF, backing = u > 0.4 && u < 1.3;
  // (v5.1: while the camera is on Bram he steps back up beside the scroll, so the tight wide (2.6 on) has him well inside its left edge)
  const xStep = gripPoint(seatLeaf(1, 0))[0] - 11, xNear = xStep - 2.5, nearK = ss(1.5, 2.3, u), nearing = u > 1.5 && u < 2.3;
  const xr = lerp(lerp(RUN0, xWait, runK), xNear, nearK);
  const xPull = gp[0] - 11 - 1.2 * heave;                                              // stands back from his mitts as far as his arms reach; rocks back on each heave
  // in the wide before "Pip unrolled" he walks back up to the scroll (two gait cycles, so his feet stay planted and end at rest)
  const stepK = ss(4.85, 5.65, u), stepping = u > 4.85 && u < 5.65, STEP = (xStep - xNear) / (2 * C.walkAdvance(1));
  const x = lerp(lerp(xr, xStep, stepK), xPull, ss(5.75, 6.05, u));
  // (each step back on a heave is half a gait cycle of a short stride, so one boot lifts and is planted again behind him)
  const PULL_STRIDE = 2 * PULL_STEP / C.walkAdvance(1), pulling = u > PIP_HEAVES[0] - 0.05 && pull < PULL_STEP * PIP_HEAVES.length - 0.01;
  const pose = { x, y: 0, z: PZ17, face: 1, ground: 0, walk: stepping ? 2 * stepK : backing ? (xr - RUN0) / C.walkAdvance(4) : nearing ? (xWait - RUN0) / C.walkAdvance(4) + 2 * nearK : pulling ? -pull / C.walkAdvance(PULL_STRIDE) : null, stride: stepping ? STEP : backing ? 4 : nearing ? (xNear - xWait) / (2 * C.walkAdvance(1)) : pulling ? PULL_STRIDE : 9, run: 0.4 * (1 - ss(0.3, 0.6, u)),
    yaw: lerp(0.3 * ss(0, 0.6, u), 0.7, grab), lean: u < 1.5 ? 0 : 0.18 * reachK * (1 - grab) + grab * (-0.55 - 0.16 * heave - 0.05 * wind),
    squash: 1 - grab * (0.04 - 0.05 * heave + 0.06 * wind), tiptoe: 0,
    // (the effort face comes in after the grab lands: the eyes narrow and the brow knits over about five frames, the mouth closes to a line
    // for two, then grits)
    eyes: lerp(lerp(1.1, 1, ss(0, 0.6, u)), 0.78 + 0.1 * heave, ss(0.45, 1, grab)), look: grab > 0.3 ? [0.8, 0.1] : u < 2.6 ? [0.9, 0.1] : u < 3.4 ? [0.7, 0.2] : u < 4.6 ? [0.5, -0.6] : [0.7, -0.2],
    brow: lerp(u < 0.5 ? 0.6 : u > 2.3 && u < 3.3 ? 0.6 : -0.2, -0.7, ss(0.3, 1, grab)),
    mouth: grab > 0.85 ? 'grit' : grab > 0.55 ? 'flat' : u < 0.5 || (u > 2.3 && u < 3.3) ? 'smile' : 'o', mouthOpen: grab > 0.85 ? lerp(0.1, 0.25 + 0.2 * heave, ss(0.85, 1, grab)) : grab > 0.55 ? 0.05 : u < 0.5 ? 0.15 : 0.2, breath: 0.45 + u * 0.5, autoBlink: false, blink: grab > 0.5 ? 0 : blink(T, 3.4, 1) };
  pose._reach = reachK; pose._grab = grab; pose._gp = gp;
  return pose;
}
// His mitts on the free edge, both of them, one over the other, and the leaf told where they are: lf.peel is his near mitt as the rig places it,
// seen on the leaf's plane through this camera, so the strip of opened leaf runs from the scroll into the mitt wherever his arm reaches (never a
// gap). The reach swings low, under his eye line. The far mitt closes on the strip just ahead of the near one (pipFar draws it).
function pipGrip(pose, lf, cam, T) {
  const k = Math.max(pose._reach || 0, pose._grab || 0); if (!(k > 0.01)) { lf.peel = null; pose._far = null; return pose; }
  const g = pose._gp, rest = [pose.x + 6, -13], over = 1.6, dip = 4.5 * Math.sin(Math.PI * clamp(pose._reach || 0)) * (1 - clamp(pose._grab || 0));   // (the strip runs on a little past his mitt, so it closes over it, thumb in front)
  pose.armR = { reach: [lerp(rest[0], g[0] - 0.4, k), lerp(rest[1], g[1] + 1.2, k) + dip] };
  pose.armL = { reach: [lerp(rest[0] - 2, g[0] + 2.2, k), lerp(rest[1] - 2, g[1] + 3.6, k)] };
  const m = C.anchor('pip', pose, 'mittR', T) || g, kk = (LZ - cam.z) / Math.max(PZ17 - cam.z, 1);
  lf.peel = { x: cam.x + (m[0] - over - cam.x) * kk, y: cam.y + (m[1] + 0.4 - cam.y) * kk, k: pose._grab || 0, w: 7.5 };
  pose.gripAt = [m[0], m[1]];
  // (the second mitt closes on the strip a mitt's width above the first, a little nearer his shoulder so his arm reaches it: both mitts read, one
  // above the other on the strip's broad end, thumb in front)
  pose._far = [lerp(rest[0] - 1, m[0] - 0.5, k), lerp(rest[1] + 1, m[1] - 3.0, k) + 0.6 * dip];
  return pose;
}
// Pip with both mitts on the strip. The rig draws his far arm behind his body (it cannot reach across his chest), so for the two-handed hold the
// second mitt is borrowed from a copy of him: polish: only that copy's arm and mitt are drawn (it is clipped to a capsule round the arm, from his
// collar to the mitt, a shade darker, behind him), then Pip himself over it, whole and opaque, with his near arm closing on the strip just above.
// The copy's body is never drawn, so nothing of a second puppet can show through or beside him. When he lets go the two arms come together and
// the copy goes on the frame they meet (no fade: nothing he wears is ever drawn see-through).
const pipDuo = (pose, a = 1) => { if (!pose || !pose._far || a < 0.01) return pip(pose);
  const back = Object.assign({}, pose, { shadow: false, z: pose.z + 0.04 }), top = Object.assign({}, pose, { armR: { reach: pose._far } }), f = pose.face >= 0 ? 1 : -1;
  const clipArm = (c, t) => { const m = C.anchor('pip', back, 'mittR', t), hd = C.anchor('pip', back, 'head', t), sho = [hd[0] + 3.5 * f, hd[1] + 9.5];   // (sho: about where his near shoulder tucks under the collar)
    const dx = m[0] - sho[0], dy = m[1] - sho[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, R = 5.4, mid = [(sho[0] + m[0]) / 2, (sho[1] + m[1]) / 2];
    const pts = [[sho[0] + nx * 4.5, sho[1] + ny * 4.5], [mid[0] + nx * 6, mid[1] + ny * 6], [m[0] + nx * R, m[1] + ny * R], [m[0] + (0.7 * nx + 0.7 * ux) * R, m[1] + (0.7 * ny + 0.7 * uy) * R], [m[0] + ux * R, m[1] + uy * R],
      [m[0] + (0.7 * ux - 0.7 * nx) * R, m[1] + (0.7 * uy - 0.7 * ny) * R], [m[0] - nx * R, m[1] - ny * R], [mid[0] - nx * 6, mid[1] - ny * 6], [sho[0] - nx * 4.5, sho[1] - ny * 4.5]];
    c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.clip(); };
  const arm = C.pip(back).map(it => ({ z: it.z, draw(c, s, t) { c.save(); clipArm(c, t); c.filter = `brightness(${(1 - 0.16 * a).toFixed(3)})`; it.draw(c, s, t); c.restore(); } }));
  return [...arm, ...pip(top)]; };
// The scroll's size (its outer radius, world units): as Luma lifts the tip out of the gap's squeeze it loosens and swells a little (u 3.6-5.05),
// then every heave of Pip's winds a turn off it, so by the release it is half that. rollKAt is the factor on the radius the curl alone gives.
const R0 = new Map(), rollR0 = c => { const k = Math.round(c * 1000); if (!R0.has(k)) R0.set(k, P.world.leafScrollEnd(seatLeaf(k / 1000, 0)).r); return R0.get(k); };
// (it starts from the jammed scroll's own fatness, ROLL_JAM in shots.js, so the cut from shot 16 shows the same roll; at half that it is still about 60 px
// across in the shared wide at the release, half its size when Pip takes hold)
// v4.3: it holds its size while Luma lifts it (she raises it, she does not loosen it), so every change in its size is Pip's: by the release it is
// half the jammed size (still about 3% of the frame's width in the shared wide).
const ROLL_JAM = 1.6, ROLL_HALF = 0.62;   // (v5: it ends a little fatter, so it still reads on a phone at the release)
// v5.1: the drawn radius steps down on each of Pip's heaves (ROLL_STEP, as a fraction of the jammed radius): a little in his close, then bigger
// steps in the shared wide, three clear ones and a last one in the surge, so by the release it is about two thirds of its size when the wide
// comes back at u 7.1 (and still a plain roll on a phone). ROLL_HALF is kept for reference only.
// v6.1: the steps are 1.6 times bigger (the roll ends at about 40% of its jammed size), so each heave visibly winds a turn off it.
const ROLL_STEP = [0.04, 0.035, 0.035, 0.085, 0.075, 0.065, 0.04].map(v => 1.6 * v), ROLL_SURGE = 0.03;
const rollF = u => 1 - PIP_HEAVES.reduce((a, t0, i) => a + ROLL_STEP[i] * ss(t0 - 0.03, t0 + 0.24, u), 0) - ROLL_SURGE * ss(10.55, 10.8, u);
const rollKAt = (u, curl) => { void ROLL_HALF; const r1 = rollR0(1) * ROLL_JAM, r = r1 * rollF(u); return r / rollR0(curl); };
// Everything the climax shows at shot-17 time u (shot 18 uses u 11 to 11.5 for its run-up).
function climax(u) {
  const T = T17 + u, st = P.state(T), lf = st.leaf, ps = st.pinStone;
  const b = bram17(u, T, ps), wind = ss(10.0, 10.25, u) * (1 - ss(10.3, 10.4, u)), surge = bump(10.5, 0.16, u);
  const tremble = u > 3.7 ? 0.5 * Math.sin(u * 29) * ss(3.7, 4.0, u) : 0;   // the tip shivers against the pond while Luma holds it
  lf.lift = liftFor(lf.tip + tremble);
  lf.rollK = rollKAt(u, lf.curl);
  lf.past = dt => { const L = P.state(T - dt).leaf; L.rollK = rollKAt(u - dt, L.curl); return L; };   // the leaf a moment ago: the spill under the roll falls with its own history (world.js pressItems)
  lf.gush = heaveAt(u);                                 // each heave throws a surge through the water spilling under the roll (world.js pressItems)
  const press = clamp(0.2 + 0.8 * ss(0.5, 10.6, u) + 0.12 * (lf.tip / 25) + 0.08 * surge, 0, 1);
  const pulse = clamp(0.5 * Math.abs(Math.sin(u * 3.1)) * ss(3.7, 4.2, u) * (lf.tip / 20) + 0.9 * surge);
  return { T, st, lf, k: ps.k, stone: ps, bram: b.pose, front: b.front, pulling: b.pulling, bite: ss(BRAM_BITE[0], BRAM_BITE[1], u), luma: luma17(u, T, lf), pip: pip17(u, T, lf), press, pulse, wind, surge };
}
// the stem as the world should draw it: pinned under the stone until it rolls off, then free; once Bram has it, its end in his jaws
// (the freed stem flicks up as the stone tips off it: up over two frames, back down over the next few with a small bounce, then lies on the
// ground along its own line: STEM_FLICK)
// (uncover: the pressed stretch shows as soon as the stone starts to tip up off it, so the stem is one piece from the blade to its end all
// through the roll; the stone's body still covers it wherever it is in front)
const STEM_FLICK = 2.15;
const stemFlick = u => { const d = u - STEM_FLICK; return d <= 0 ? 0 : d < 0.067 ? 0.85 * ss(0, 0.067, d) : 0.85 * Math.exp(-(d - 0.067) * 13) * Math.cos((d - 0.067) * 17); };
const STEM_SETTLE = 20;                                  // the freed stem comes to lie this much nearer the lens than where it was pinned
const stemState = (u, X) => ({ x: -6000, z: ROW, rot: 0, settle: STEM_SETTLE * X.stone.release, release: X.stone.release, uncover: ss(0.2, 0.3, X.stone.k), flick: stemFlick(u), hold: X.pulling ? [X.front[0] + BITE_DX, Math.min(X.front[1] + BITE_DY, -2), ROW - 2, X.bite] : null });
// (the snapped end sits in the front of his mouth, just inside its near corner: the world draws the held stem in front of him, so it visibly
// touches; it rises to it from the ground below his chin and never crosses his face)
const BITE_DX = 5.2, BITE_DY = 2.2;
function climaxItems(u, X, o = {}) {
  const rock = bump(1.62, 0.12, u) * 0.2, sx = X.stone.x, sz = X.stone.z;
  return [
    P.SH.boulder(sx, -11 + (X.stone.drop || 0), sz, X.stone.rot + rock, 0.3 * X.press, ss(0.5, 1, X.stone.k)),   // (v5.1: once rolled clear it catches the moon: a little paler than the wall behind, with its own ground shadow)
    dent(PIN_X, ROW + 0.5, ss(0.55, 0.85, X.stone.k)),
    plugFx(X.press, X.pulse, X.T),
    bram(X.bram), luma(X.luma), o.noPip ? null : pipDuo(X.pip),
    // dust kicked up behind Bram's feet when he digs in, and where the stone drops off the stem; the stem's spring as it comes free
    u > 1.1 && u < 2.4 && P.fx.puff(X.front[0] + 50, -2, ROW + 1, ((u - 1.1) * 0.9) % 1, { kind: 'dust', scale: 0.5, dir: 1, col: [140, 128, 112] }),
    u > 1.95 && u < 2.95 && P.fx.puff(PIN_X - 2, -1.5, ROW + 2, (u - 1.95) / 1.0, { kind: 'dust', scale: 1.25, n: 14, col: [158, 146, 124] }),   // where it tips off the stem
    u > 2.25 && u < 3.3 && P.fx.puff(sx - 4, -1.5, sz - 2, (u - 2.25) / 1.05, { kind: 'dust', scale: 1.1, n: 12, seed: 3, col: [158, 146, 124] }),   // where it rolls to rest
    u > 8.1 && u < 11 && P.fx.puff(X.front[0] + 52, -2, ROW + 1, ((u - 8.1) * 0.7) % 1, { kind: 'dust', scale: 0.4, dir: 1, col: [140, 128, 112] }),
    // a puff of dry leaf dust off the scroll at each heave
    // (at the roll's upper lip, where the turn comes off it: well away from his mitts, so nothing seems to come out of his hands)
    X.pip.gripAt ? (() => { const E = P.world.leafScrollEnd(X.lf); return PIP_HEAVES.map(t0 => u > t0 - 0.05 && u < t0 + 0.6 && P.fx.puff(E.x + E.r * 0.35, E.y - E.r * 0.85, LZ - 1, (u - t0 + 0.05) / 0.65, { scale: 0.2, col: [170, 150, 120] })); })() : null,
  ];
}
// The pale dent the stone leaves in the soil where it sat on the stem: flattened earth, a darker rim. k fades it in as the stone leaves.
const dent = (x, z, k) => k < 0.01 ? null : { z: z + 0.3, flat: true, draw(c, s) {
  c.save(); c.globalAlpha = k; const g = c.createRadialGradient(x, 0.2, 0, x, 0.2, 13); g.addColorStop(0, 'rgba(150,140,128,0.42)'); g.addColorStop(0.7, 'rgba(120,112,104,0.3)'); g.addColorStop(1, 'rgba(20,18,26,0)');
  c.translate(x, 0.3); c.scale(1, 0.22); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill(); c.strokeStyle = 'rgba(14,12,20,0.4)'; c.lineWidth = 1.2 / s; c.beginPath(); c.arc(0, 0, 11.5, 0.1, Math.PI - 0.1); c.stroke(); c.restore(); } };
// The cameras. The shared wide (WIDE_CAM, the same frame every time) shows each result: the stone off the stem (2.6-3.35), the tip raised with the
// first water through the gap (4.6-5.8), then the scroll in Pip's mitts, the stream through the opened gap and all three straining (7.1 on).
// Each contact close is short and sits on its line.
const SEGS17 = [[0, 'wide0'], [1.1, 'bram'], [2.6, 'wide'], [3.35, 'luma'], [4.6, 'wide'], [5.8, 'pip'], [7.1, 'wide']];
function cam17(u, X) {
  let seg = SEGS17[0][1]; for (const [t0, n] of SEGS17) if (u >= t0) seg = n;
  if (seg === 'wide0') return { seg: 'wide0', c: cam(W17.x, W17.y, ROW - lerp(338, 332, u / 1.1), ROW + 47, 30, { f: W17.f }), shift: W17.shift, vshift: W17.vshift || 0 };   // shot 16's last frame (its lens shifts too)
  // (a touch higher and further back than eye level, so the stone rolling back reads as climbing away up the frame, with ground opening under it)
  if (seg === 'bram') { const kB = ss(1.1, 2.6, u); return { seg, c: cam(PIN_X - 6 + 0.6 * noise(u * 9, 3) * X.bram.push, -22.5, ROW - lerp(140, 132, kB), ROW + 10, 14), shift: 0, vshift: 0 }; }
  // Luma's close: the roll at the left third, Luma over it, the gap and the water under it, the leaf running off right; Pip (backed off) stays out
  if (seg === 'luma') { const kL = ss(3.35, 4.6, u), E = P.world.leafScrollEnd(seatLeaf(1, 0)); return { seg, c: cam(E.x + 50 + 4 * kL, E.y - 18 - 1.5 * kL, LUZ - lerp(188, 202, kL), LUZ, 14), shift: 0, vshift: 0 }; }   // (polish: as she lifts, the lens eases back and up a little with her, so her wings and antennae stay inside the frame while the roll and the gap opening under it stay in the shot; the rise still reads against the dam's stones)
  if (seg === 'pip') return { seg, c: PIP_CAM(u), shift: 0, vshift: 0 };
  const shake = 0.9 * noise(u * 20, 8) * ss(9.2, 10.6, u) + 1.6 * noise(u * 31, 9) * bump(10.55, 0.12, u), push = ss(7.1, 11.5, u);
  const W = WIDE_CAM(); return { seg: 'wide', c: cam(W.x + shake, W.y + 0.6 * shake, W.z + 3.5 * push, W.focus, 26, { f: TIGHT.f }), shift: tightShift(u), vshift: TIGHT.vshift };
}
// (the notch light comes up over the first second of shot 17 from shot 16's small one, so the cut between them shows no warm flash)
const lights17 = (X, c, wk = 1, e = ss(0.2, 1.1, X.T - T17)) => [lamp(M[0] - 2, -18, NOTCH_Z - 8, [1, 0.6, 0.24], lerp(0.3 + 1.4 * X.press, 0.3 + 0.55 * X.press, e) * wk * (0.45 + 0.55 * e), 120, (40 + 35 * X.press) * wk * e), lamp(M[0] + 20, -100, ROW + 40, [0.42, 0.58, 1.0], 0.6, 170),
  lamp(c.x - 40, -46, ROW - 100, [0.56, 0.66, 1.0], 0.5, 170), lamp(M[0] + 40, -22, ROW - 40, [1, 0.62, 0.3], 0.3 * X.press * wk, 70), rim(X.pip.x, PZ17, 0.55), rim(X.front[0] + 20, ROW, 0.45)];

// 17 The climax. Lines: 90.2 "Bram pushed." (u 1.2), 92.4 "Luma lifted." (u 3.4), 94.8 "Pip unrolled." (u 5.8). Each line gets a short contact
// close and its result is then shown in the same wide: the wide shot 16 ends on (u 0-1.1); Bram's head on the stone as it rolls off the stem
// (1.1-2.6); the wide, the stone off and the stem lying free (2.6-3.35); Luma's feet on the far edge raising the tip (3.35-4.6); the wide, tip up
// and the first water through the gap (4.6-5.8); Pip taking the scroll's edge and unrolling it (5.8-7.1); the wide to the end, the scroll small in
// Pip's mitts, the blade open, the stream through the gap growing, all three straining, the wind-up and the surge (shot 18 releases at u 11.5).
B['s17-together'] = (u, T) => {
  const X = climax(u), { c, seg, shift, vshift } = cam17(u, X);
  pipGrip(X.pip, X.lf, c, T);
  const carry = u < 1.1 ? 0.4 * (1 - ss(0.5, 1.0, u)) : 0;   // the three glowing parts from the end of shot 16 fade out over the first second
  const lf = X.lf;
  X.st.leaf = lf; X.st.pinStone = stemState(u, X);     // the world's own small stone is hidden; act 2's boulder is the pin stone
  X.st.spoutCalm = seg === 'wide' ? 1 : P.SH.SPOUT_CALM;   // (v5: the blade and the dam stones behind the contacts are calmed, as in every spout shot;
  X.st.spoutHush = seg === 'wide' ? 1 : P.SH.SPOUT_HUSH;                  // v5.1: fully in the tight wide, where the blade is also hushed: darker and duller, its marks flat)
  const items = [
    ...climaxItems(u, X, { cam: c, noPip: seg === 'luma' }),   // (v5.1: Luma's close leaves Pip out: he stands just off its left edge)
    ...(carry > 0 ? P.SH.planGlints(T).map(g => P.SH.glint(g[0], g[1], g[2], carry, T, g[3], 0)) : []),   // shot 16's two glows, in place, fading (soft, no twinkle)
    P.SH.pondGlow(Math.max(0.62, X.press), T, P.SH.POND_QUIET),                                                          // act 2's swollen pond behind the dam
    // shot 16's soft cool pools behind Pip and Bram, fading with its lights over the first second
    u < 1.0 && P.SH.backGlow && [P.SH.backGlow(X.pip.x, -22, PZ17 + 8, 36, 46, 0.3 * (1 - ss(0, 1.0, u))), P.SH.backGlow(X.bram.x, -14, X.bram.z + 8, 58, 28, 0.25 * (1 - ss(0, 1.0, u)))],
  ];
  const wk = seg === 'luma' || seg === 'pip' ? 0.5 : 1;
  // shot 16's lights (the moon rim on Pip, the small warm lamp at the plug) hand over to this shot's over the first second of the wide, so the
  // cut between them shows no step in brightness
  const x16 = 1 - ss(0, 1.0, u);
  let lights = lights17(X, c, wk);
  if (x16 > 0) lights = lights.map(L => Object.assign({}, L, { i: L.i * (1 - x16) })).concat([lamp(M[0] - 10, -92, ROW - 14 + 130, [0.62, 0.78, 1], 0.75 * x16, 110), lamp(M[0] + 6, -26, 2600, [1, 0.62, 0.28], 0.4 * x16, 30)]);
  return hvShift(nearStones(moonFade(spoutScene(T, c, items, { st: X.st, motes: u < 1.1 ? 4 : 6, lights, grade: { vignette: 0.72, bloom: 0.28 + 0.2 * X.press } }), seg === 'wide' ? 0 : 1), seg === 'wide' ? 0 : 1), shift, vshift);
};

// 18 The release, on the same wide the climax ends on. Until RELEASE (u 0.5) it is shot 17 still running (the same pose functions at u 11 to 11.5):
// the leaf shudders, the plug swells and spits, the three hold on, and the channel stays dry. Then the leaf springs out of the cleft and tumbles up
// and away to the right, the water that was held back falls out of the notch as a translucent sheet with the trapped light inside it, and the
// water body runs down the sluice. Every pose eases out of its run-up pose (nothing snaps on the release frame): Pip lets go of the roll and jumps
// down in front of the leaf, landing on his feet laughing with his arms up; Bram, whose last shove tipped the stone off, hops for joy and turns to
// the water; Luma lets go, is spun once by the gust and loops up laughing.
B['s18-burst'] = (u, T) => {
  const rel = u - 0.5, pre = rel < 0, e = ss(0, 1.5, rel);
  const X = climax(Math.min(11 + u, 11.5));           // the run-up, frozen at its last frame after the release
  // camera: the climax wide, easing back after the pop so the stream, the tumbling leaf and all three stay in frame
  // (s17's wide camera continues unbroken through the run-up: same push, same shake, so there is no cut at 100.0; the pull-back starts at the pop)
  const k2 = ss(0.5, 2.6, u), u17 = 11 + u, W = WIDE_CAM(), push = ss(7.1, 11.5, u17);
  const shake17 = 0.9 * noise(u17 * 20, 8) * ss(9.2, 10.6, u17) + 1.6 * noise(u17 * 31, 9) * bump(10.55, 0.12, u17);
  const shake = shake17 * (1 - ss(0.5, 0.7, u)) + 2.0 * noise(u * 17, 5) * bump(0.6, 0.35, u) * ss(0.5, 0.56, u);
  const c = cam(W.x + shake, lerp(W.y, -50, k2) + 0.6 * shake, lerp(W.z + 3.5 * push, ROW - 385, k2), W.focus, 26, { f: Math.exp(lerp(Math.log(TIGHT.f), Math.log(2400), k2)) });
  pipGrip(X.pip, X.lf, c, T);                         // his mitts on the scroll's edge as this camera sees it (they let go from there)
  const st = P.state(T);                              // the water: dry before the release, the real front after it (one timeline with s19)
  // the leaf: at the release frame it is exactly the run-up leaf, then it springs out of the cleft and tumbles up and right
  const L0 = X.lf, rise = 22 * ss(0, 0.22, rel) + 44 * ss(0.12, 1.3, rel) + 90 * ss(1.5, 3.2, rel);   // (polish: the second lift comes a little sooner, so the trailing stem swings past well above Bram's hop)
  const lf = pre ? Object.assign({}, L0, { lift: liftFor(L0.tip + 1.2 * Math.sin(u * 31)) }) : Object.assign({}, L0, { curl: lerp(L0.curl, 0.04, ss(0, 0.4, rel)), x: L0.x + 16 * ss(0, 0.3, rel) + 40 * ss(0.35, 2.0, rel) + 90 * ss(1.5, 3.2, rel),
    y: L0.y - rise, z: L0.z - 10 * e, rot: L0.rot + 0.35 * ss(0, 0.3, rel) + 0.6 * ss(0.2, 1.8, rel) + 0.6 * ss(1.5, 3.2, rel), free: e, lift: liftFor(L0.tip) + 0.8 * e,
    peel: L0.peel ? Object.assign({}, L0.peel, { k: L0.peel.k * (1 - ss(0, 0.22, rel)) }) : null,   // the edge leaves his mitts and winds back as the scroll springs open
    // the spill's history runs on real time: up to the release it is the run-up leaf's, after it nothing leaves the lip (the roll is gone), so the
    // column under the old seat is cut off at the top and its tail falls clear instead of hanging there as a sheet with no roll above it
    past: dt => dt < rel ? Object.assign({}, L0, { tip: 0 }) : L0.past(dt - rel) });
  st.spoutCalm = lerp(1, P.SH.SPOUT_CALM, k2); st.spoutHush = lerp(1, P.SH.SPOUT_HUSH, k2);   // (the tight wide's calm and hush, easing off as the lens pulls back)
  st.leaf = lf; st.pinStone = pre ? stemState(11 + u, X) : { x: -6000, z: ROW, rot: 0, release: 1, settle: STEM_SETTLE, hold: stemState(11.5, X).hold };   // the stem goes with the leaf: it leaves Bram's jaws (world.js trails it from the blade's root)
  const flash = pre ? 0 : Math.exp(-rel * 2.6) * ss(-0.03, 0.05, rel), happy = rel > 0.8, joy = ss(0.08, 0.45, rel), wob = Math.sin(rel * 13);

  // Pip: from his last heave pose, he lets go, jumps down off the roll and lands on the bank right of the sluice (clear of the falling sheet and
  // of the water running down the channel), facing the water, laughing with his arms up and out beside his head
  // (v4.4: as the strip whips out of his mitts he stumbles back a step (his weight was on it), rocks further back for two frames and catches
  // himself, crouches, and only then hops up with his arms going up: nothing changes in one frame)
  const p0 = X.pip, xLand = p0.x + 4, zLand = p0.z, sb = ss(0, 0.1, rel), jk = ss(0.2, 0.92, rel), air = rel > 0.2 && rel < 0.95 ? Math.sin(Math.PI * (rel - 0.2) / 0.75) : 0;
  const fk = ss(0.03, 0.2, rel), hk = ss(0.75, 0.92, rel);   // the face eases out of the strain over five frames; the laugh comes in over five more
  const pipPose = pre ? Object.assign({}, p0) : Object.assign({}, p0, {
    x: lerp(p0.x - 3.5 * sb, xLand, jk), z: lerp(p0.z, zLand, ss(0.1, 0.6, rel)), y: lerp(p0.y, 0, ss(0.1, 0.9, rel)) - 22 * air - 7 * bump(1.7, 0.12, rel) - 5 * bump(2.4, 0.12, rel),
    ground: lerp(p0.ground, 0, ss(0.1, 0.9, rel)), lean: K(rel, [[0, p0.lean], [0.05, p0.lean - 0.1], [0.12, -0.3], [0.19, 0.1], [0.3, 0]]) + 0.04 * wob * ss(0.9, 1.2, rel),
    squash: lerp(p0.squash, 1, ss(0.04, 0.14, rel)) - 0.05 * bump(0.06, 0.03, rel) - 0.12 * bump(0.17, 0.04, rel) - 0.14 * bump(0.97, 0.06, rel) - 0.08 * bump(1.75, 0.08, rel) + 0.06 * air,
    eyes: lerp(lerp(p0.eyes ?? 1, 1, fk), 0.65, hk), look: [lerp(p0.look ? p0.look[0] : 0.6, 0.6, fk), lerp(p0.look ? p0.look[1] : -0.2, -0.2, fk)], brow: lerp(p0.brow ?? -0.6, 1, ss(0.03, 0.3, rel)), mouth: rel < 0.1 ? p0.mouth : happy ? 'laugh' : 'o', mouthOpen: rel < 0.1 ? lerp(p0.mouthOpen ?? 0.25, 0.1, ss(0.03, 0.1, rel)) : happy ? lerp(0.45, 0.5 + 0.2 * Math.sin(rel * 14), hk) : lerp(0.1, 0.45, ss(0.1, 0.22, rel)),
    yaw: lerp(p0.yaw ?? 0.3, 0.25, ss(0.03, 0.3, rel)), blink: happy ? blink(T, 3.6, 1) : 0, peel: 0 });
  if (!pre) {   // the mitts leave the lip and swing up: IK targets that travel from the lip to beside the head, then a joyful wobble
    // (first the empty mitts fly back with the stumble, low and out in front of his chest, then as he hops they go up beside his head)
    const fly = ss(0, 0.1, rel) * (1 - ss(0.14, 0.32, rel)), up = ss(0.16, 0.45, rel), hx = pipPose.x, hy = pipPose.y, f = pipPose.face;
    const lipR = p0.armR && p0.armR.reach, lipL = p0.armL && p0.armL.reach, l0R = lipR || [hx, hy - 14], l0L = lipL || [hx, hy - 14];
    const backR = [hx + 13 * f, hy - 13], backL = [hx + 9 * f, hy - 12];   // (polish: chest height, so neither mitt nor its copy passes in front of his eyes)
    const fromR = [lerp(l0R[0] - 3.5 * sb, backR[0], fly), lerp(l0R[1], backR[1], fly)], fromL = [lerp(l0L[0] - 3.5 * sb, backL[0], fly), lerp(l0L[1], backL[1], fly)];
    // each arm goes up on its own side (the near arm toward his facing, the far arm behind), so the mitts open out beside his head, never over his face
    pipPose.armR = { reach: [lerp(fromR[0], hx + 21 * f + 1.5 * wob, up), lerp(fromR[1], hy - 36 - 2 * wob, up)] };
    pipPose.armL = { reach: [lerp(fromL[0], hx - 22 * f - 1.5 * wob, up), lerp(fromL[1], hy - 36 + 2 * wob, up)] };
  }
  // Bram: from the lunge, a happy hop on the ground; he turns at the top of the hop to look back at the water
  // (v4.4: he comes up out of the lunge over about five frames, settling back as the stem goes slack, before the hop starts)
  const b0 = X.bram, ub = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t)), kU = ub(rel / 0.17), hopB = rel > 0.2 && rel < 0.95 ? Math.sin(Math.PI * (rel - 0.2) / 0.75) * 16 : 6 * bump(1.9, 0.1, rel);
  const bramPose = pre ? Object.assign({}, b0, { x: b0.x + 0.9 * Math.sin(u * 23) }) : Object.assign({}, b0, { push: lerp(b0.push, 0, kU), brace: lerp(b0.brace, 0, ub(rel / 0.22)), head: lerp(b0.head, 0, ub(rel / 0.2)),
    lean: lerp(b0.lean, 0, kU) - 0.25 * bump(0.38, 0.2, rel), squash: 1 - 0.1 * bump(0.98, 0.07, rel) + 0.06 * bump(0.5, 0.08, rel), y: -hopB, face: -1, x: b0.x + 3 * ub(rel / 0.2),
    eyes: lerp(b0.eyes ?? 1, 0.7, ss(0.75, 0.92, rel)), look: [lerp(b0.look ? b0.look[0] : 0.5, 0.5, ss(0.04, 0.25, rel)), lerp(b0.look ? b0.look[1] : -0.3, -0.3, ss(0.04, 0.25, rel))], brow: lerp(b0.brow ?? 0, 1, ss(0.03, 0.22, rel)),
    mouth: rel < 0.1 ? b0.mouth : happy ? 'laugh' : 'o', mouthOpen: rel < 0.1 ? b0.mouthOpen : lerp(0.1, 0.4, ss(0.1, 0.22, rel)) + 0.2 * Math.sin(rel * 13) * ss(0.75, 0.92, rel), blink: happy ? blink(T, 4.1, 2) : 0 });
  // Luma: lets go as the leaf leaves, spun once by the gust, loops up laughing; her wing beat keeps its phase (no jump)
  const l0 = X.luma, lk = ss(0, 1.5, rel), spin = pre ? 0 : -TAU * ss(0.05, 1.3, rel);
  const lumaPose = pre ? Object.assign({}, l0) : Object.assign({}, l0, { hold: l0.hold && rel < 0.2 ? Object.assign({}, l0.hold, { k: (l0.hold.k ?? 1) * (1 - ss(0.02, 0.18, rel)) }) : null, hover: l0.hover ?? ss(0, 0.2, rel),   // (her feet let go of the edge over four frames)
    x: lerp(l0.x, -880, lk), y: lerp(l0.y, -66, ss(0, 1.1, rel)) + 3 * Math.sin(u * 3) * lk - 12 * bump(0.25, 0.2, rel),
    lean: spin, flap: wingPhase(11 + u, LUMA_FLAP), eyes: lerp(lerp(l0.eyes ?? 1, 1, ss(0.03, 0.2, rel)), 0.7, ss(0.75, 0.92, rel)), look: [lerp(l0.look ? l0.look[0] : 0.3, 0.3, ss(0.03, 0.2, rel)), lerp(l0.look ? l0.look[1] : 0.3, 0.3, ss(0.03, 0.2, rel))], brow: lerp(l0.brow ?? 0, 1, ss(0.03, 0.22, rel)),
    mouth: rel < 0.1 ? l0.mouth : happy ? 'laugh' : 'o', mouthOpen: rel < 0.1 ? l0.mouthOpen : lerp(0.1, 0.4, ss(0.1, 0.22, rel)), antL: lerp(l0.antL ?? -0.4, -0.4, ss(0.03, 0.2, rel)), antR: lerp(l0.antR ?? 0.4, 0.4, ss(0.03, 0.2, rel)), blink: happy ? blink(T, 3.2, 3) : 0 });

  const press = pre ? X.press : X.press - 0.7 * ss(0, 3.0, rel);   // (s17's own pressure, so the grade and the pond glow carry across 100.0)
  // until the release the picture is shot 17's (same items, same lights), so the cut between them is seamless
  const water = burstWater(c, rel), burst = water.find(q => q && q.foot && rel > 0);   // (until the release the spill under the lifted tip is the world's)
  const items = pre ? [...climaxItems(11 + u, Object.assign({}, X, { pip: pipPose, bram: bramPose, luma: lumaPose, T, press: X.press, pulse: 0.5 + 0.5 * Math.abs(Math.sin(u * 40)) }), { cam: c }), ...water] : [

    P.SH.boulder(X.stone.x, -11 + (X.stone.drop || 0), X.stone.z, X.stone.rot, 0.3 * press, 1), dent(PIN_X, ROW + 0.5, 1),
    // (his far mitt lets go with the near one: it closes onto the near arm over six frames and goes on the frame they meet; never faded)
    rel < 0.2 && pipPose.armR && pipPose.armR.reach && p0._far && p0.armR && p0.armR.reach ? (() => { const A = pipPose.armR.reach, A0 = p0.armR.reach, kF = 1 - ss(0, 0.2, rel);   // (from where it held the strip, so the release frame does not jump)
      return pipDuo(Object.assign({}, pipPose, { _far: [A[0] + (p0._far[0] - A0[0]) * kF, A[1] + (p0._far[1] - A0[1]) * kF] })); })() : pip(pipPose),
    bram(bramPose), luma(lumaPose),
    ...water,
  ];
  {   // act 2's pond behind the dam: swollen until the release, then it empties through the cleft (its swell sinks and it fades into the world's own)
    const pg = P.SH.pondGlow(pre ? Math.max(0.62, X.press) : Math.max(0.62, X.press) * (1 - ss(0, 1.6, rel)), T, P.SH.POND_QUIET), pa = pre ? 1 : 1 - ss(0.2, 2.2, rel);
    if (pa > 0.01) items.push(pa > 0.99 ? pg : { z: pg.z, draw(c, s, t) { c.save(); c.globalAlpha = pa; pg.draw(c, s, t); c.restore(); } });
  }
  if (!pre && burst) {   // where the burst lands: a splash that keeps churning; and the leading wave running down the channel toward the camera
    const ft = burst.foot, w = st.water;
    if (w > 0.004) { const pts = [[ft[0], 0, ft[2]], ...chanPts(0, w, Math.max(4, Math.round(w * 160)))];
      items.push(waterHead(pts, 0, 1, T, { width: 13, taper: [1.5, 1.05], lift: 3.2, glow: 1.3, nose: 0.6 }), waveCrest(w, T, ss(0.5, 0.9, rel), 1, c)); }
  }
  if (!pre) items.push(
    rel > 0.75 && rel < 1.6 && P.fx.puff(bramPose.x + 10, -2, ROW + 1, (rel - 0.75) / 0.85, { kind: 'dust', scale: 0.55, dir: -1, col: [140, 128, 112] }),
    rel > 0.85 && rel < 1.7 && P.fx.puff(xLand - 8, -2, zLand + 2, (rel - 0.85) / 0.85, { kind: 'dust', scale: 0.5, dir: -1, col: [140, 128, 112] }),
  );
  const lights = pre ? lights17(X, c) : [lamp(M[0] - 2, -20, NOTCH_Z - 10, [1, 0.62, 0.26], 0.84 + 0.6 * flash + 0.36 * ss(0, 0.6, rel), 170, 74 + 50 * flash + 16 * ss(0, 0.6, rel)), lamp(M[0] + 20, -100, ROW + 40, [0.42, 0.58, 1.0], 0.6, 170),
    lamp(c.x - 40, -46, ROW - 100, [0.56, 0.66, 1.0], 0.5, 170), lamp(M[0] + 16, -6, NOTCH_Z - 80, [1, 0.7, 0.4], 0.9 * ss(0.2, 0.9, rel), 90, 60 * ss(0.2, 0.9, rel)),
    lamp(M[0] - 10, -30, ROW - 50, [1, 0.7, 0.4], 0.5 * ss(0.2, 1.0, rel) * (1 - 0.7 * ss(0.4, 1.0, rel)), 90), rim(xLand, zLand, 0.5 + 0.25 * ss(0.4, 1.0, rel)),
    lamp(xLand + 6, -32, zLand - 30, [1, 0.8, 0.5], -0.35 * ss(0.5, 1.1, rel), 40)];   // a little less sluice light on Pip's face once he has landed, so his felt keeps its green
  return hvShift(nearStones(moonFade(spoutScene(T, c, items, { st, motes: pre ? 6 : 14, lights, grade: { vignette: 0.72, bloom: 0.28 + 0.2 * press + 0.08 * flash } }), k2), k2), lerp(tightShift(Math.min(u17, 11.5)), -300, k2), lerp(TIGHT.vshift, 0, k2));
};


// ---------- the chase home ----------
// Channel arc length (world units per unit of u), for gait phases from distance run.
const CHAN_LEN = (() => { let d = 0, p = P.world.chan(0); for (let i = 1; i <= 400; i++) { const q = P.world.chan(i / 400); d += Math.hypot(q[0] - p[0], q[2] - p[2]); p = q; } return d; })();
// A point on the bank: u along the channel, off units to the side the camera of the home stretch sees (+ = right bank, toward +x near home).
const bank = (u, off) => { const p = P.world.chan(clamp(u)), d = P.world.chanDir(clamp(u)); return [p[0] - d[1] * off, 0, p[2] + d[0] * off]; };
const chanPts = (u0, u1, n = 40) => { const out = []; for (let i = 0; i <= n; i++) out.push(P.world.chan(lerp(u0, u1, i / n))); return out; };
const headU = T => clamp(P.state(T).water, 0, 1);

// 19 The chase. "The water ran, and the light followed." (105.2, u 1.2). One water timeline (shots.js front()), three beats:
// (a) u 0-2.2, the race: a wide from the home end of the garden looking up it, calmed (o.calm) so the lit channel is the one place to look.
//     The water head comes down the winding bed from the far spout toward us, flowers lighting as it passes, and in the lower right the three
//     friends run home along the far bank just ahead of it (Pip glancing back at it, Bram beside him, Luma above).
// (b) u 2.2-4.2, the rule: act 1's rule-flower composition (P.SH.ruleShot), the light returning: the water reaches the exposed root, the
//     light runs up the root and climbs the stem to the petals ("and the light followed"). The same frame the film taught the rule with.
// (c) u 4.2-7, the run: on the home stretch, the camera on the near side of the channel trucking along with the runners. Pip runs on the
//     far bank just ahead of the water head, Bram a step ahead of him and further out (his face clear of Pip), Luma flying half a body above
//     Pip's sprout; the sunken channel lies between the lens and the runners, so the water and its leading edge show right behind Pip.
const S19 = START['s19-chase'], RULE19 = 2.2, RUNB = 4.2;
const PIP_LEAD = 0.024, BRAM_LEAD = 0.024, LUMA_LEAD = 0.028;
const PIP_OFF = -27, BRAM_OFF = -60, PIP_OFF_W = -46, BRAM_OFF_W = -76;   // (_W: the race wide, where Pip runs on the turf clear of the rim stones)                    // the far bank (left of the channel as it runs home); Bram further out, so he runs a little
                                                        // behind Pip in depth and to his left: his head (leading) is clear of Pip, Pip overlaps only his tail
// the plants standing just in front of the race's focus plane near the middle of the frame (under the opening or the closing lens): the
// stage clearing fades these by part, which drew them as see-through double heads; the race drops them all shot long instead
const STAGE19 = q => { if (!(q.z < 899 && q.z > 700)) return false;
  return [0, 1].some(k => { const c = cam(150 - 8 * k, -112 + 4 * k, 548 - 52 * k, 900, 6, { f: 1650 }), sx = 960 + (q.x - c.x) * P.scaleAt(c, q.z); return sx > 0.05 * 1920 && sx < 0.95 * 1920; }); };
const runU19 = u => 0.858 + 0.022 * u / RULE19;          // where Pip is along the channel in the wide (ahead of the head)
B['s19-chase'] = (u, T) => {
  const st = P.state(T), w = headU(T), head = P.world.chan(w);
  if (u >= RULE19 && u < RUNB && P.SH.ruleShot) { const sc = P.SH.ruleShot(u - RULE19, T, { relight: true }); if (sc) return sc; }
  if (u < RUNB) {
    // (a) the race, from the home end looking up the garden; a slow push toward the runners
    const k = ss(0, RULE19, u), c = cam(150 - 8 * k, -112 + 4 * k, 548 - 52 * k, 900, 6, { f: 1650 });   // backing away as they run at it, so they hold their size
    const uP = runU19(u), pp = bank(uP, PIP_OFF_W), bp = bank(uP, BRAM_OFF_W), lp = bank(uP + 0.004, PIP_OFF_W - 6);
    const dist = (uP - runU19(0)) * CHAN_LEN;
    const pipPose = { x: pp[0], y: 0, z: pp[2], face: -1, walk: pipGait(dist, 11), stride: 11, run: 1, ground: 0, lean: 0.14, eyes: 1, look: [lerp(0.6, -0.9, bump(1.0, 0.35, u)), 0], brow: 0.4, mouth: 'o', mouthOpen: 0.35,
      breath: u * 1.2, autoBlink: false, blink: blink(T, 3.0, 1) };
    const bramPose = { x: bp[0], y: 0, z: bp[2], face: -1, walk: bramGait(dist, 10), stride: 10, lean: 0.05, eyes: 1, look: [0.8, 0.1], brow: 0.5, mouth: 'smile', mouthOpen: 0.25, breath: u * 0.8, autoBlink: false, blink: blink(T, 4.0, 3.3) };
    const lumaPose = { x: lp[0], y: -72 + 3 * Math.sin(u * 5), z: lp[2], face: -1, wings: 1, flap: wingPhase(u, [[0, 4.4]]), hover: true, eyes: 1, look: [0.2, 0.3], brow: 0.8, mouth: 'smile', mouthOpen: 0.25, autoBlink: false, blink: blink(T, 3.3, 0) };
    // the filled channel as the readable line the other wides use (P.SH.lightStream), and the head drawn larger than the bed so the racing front
    // reads as water from this far: a blue-green tongue with a foam rim and golden particles, and a foam crest at its nose
    const items = [P.SH.lightStream({ waterTail: 0, water: w }, c, { px: 12, gain: 1.1 }), waterHead(chanPts(Math.max(w - 0.045, 0), w, 14), 0, 1, T, { width: 21, taper: [0.5, 1], lift: 2 }),
      waveCrest(w, T, 1, 2.2, c), pip(pipPose), bram(bramPose), luma(lumaPose)];
    // the head's glow is held down as it closes on the runners (and the lens), so the frame brightens by no more than ~15 in mean luma over the race
    // and the faces keep their own colours (Pip green, Luma lilac); a cool moon key on the runners
    const near = 1 - 0.92 * ss(0.9, 2.0, u);
    const lights = [lamp(head[0], -16, head[2] - 10, [1, 0.7, 0.36], 1.5 * near, 190 * (0.75 + 0.25 * near), 80 * near), lamp(pp[0] + 40, -90, pp[2] - 80, [0.58, 0.7, 1.0], 0.7, 160)];
    for (let i = 0; i < 12; i++) { const uu = w - 0.05 - 0.07 * i; if (uu < 0.02) break; const q = P.world.chan(uu); lights.push(lamp(q[0], -18, q[2] - 16, [1, 0.72, 0.38], 0.32 * (1 - 0.55 * ss(0.9, 2.0, u)), 170, 34)); }
    const sc = nearCull(scene(T, c, items, { st, calm: 1, calmSnap: true, motes: 10, fireflies: 0, noFg: true, lights, ambient: [0.31, 0.37, 0.64], grade: { bloom: 0.3, vignette: 0.45 } }));
    // nothing tall between the lens and the runners, nor right under the lens
    clearPlants(sc, q => (q.z < pp[2] + 30 && q.z > c.z && Math.abs(q.x - pp[0] + 20) < 120) || (q.z < c.z + 160 && Math.abs(q.x - c.x) < 260)
      || (Math.abs(q.x - (pp[0] + bp[0]) / 2) < 75 && Math.abs(q.z - (pp[2] + bp[2]) / 2) < 70)   // and a clear patch of turf round the runners
      || STAGE19(q));   // and whatever the stage clearing (world.js stageAlpha) would only half fade: gone for the whole shot, never a ghost head
    return P.SH.lensShift(sc, -285, false);
  }
  // (c) the run. The camera trucks with Pip on the near side of the channel, lagging a little so the runners move across the frame.
  const v = u - RUNB;
  const pp = bank(w + PIP_LEAD, PIP_OFF), bp = bank(w + BRAM_LEAD, BRAM_OFF), lp = bank(w + LUMA_LEAD, PIP_OFF - 4);
  const lag = lerp(14, -14, ss(0, 2.8, v));
  const c = cam(pp[0] - 4 + lag + 0.6 * noise(u * 3, 4), -74, pp[2] - 240, pp[2], 24), shift = -300;
  const T0 = S19 + RUNB, run0 = (headU(T0)) * CHAN_LEN, dist = w * CHAN_LEN - run0;      // distance run since the beat started
  const pipPose = { x: pp[0], y: 0, z: pp[2], face: -1, walk: pipGait(dist, 13), stride: 13, run: 1, ground: 0, lean: 0.16, eyes: 1, look: [0.6, 0], brow: 0.4, mouth: 'o', mouthOpen: 0.35, breath: u * 1.2,
    autoBlink: false, blink: blink(T, 3.0, 1) };
  // he glances back at the light over his shoulder once (look is in his facing direction: +1 ahead, -1 behind)
  pipPose.look = [lerp(0.6, -0.9, bump(1.2, 0.35, v)), lerp(0, -0.2, bump(1.2, 0.35, v))];
  const bramPose = { x: bp[0], y: 0, z: bp[2], face: -1, walk: bramGait(dist, 12), stride: 12, lean: 0.05, eyes: 1, look: [0.8, 0.1], brow: 0.5, mouth: 'smile', mouthOpen: 0.3, breath: u * 0.8,
    autoBlink: false, blink: blink(T, 4.0, 3.3) };
  const lumaPose = { x: lp[0], y: -52 + 3 * Math.sin(u * 5), z: lp[2], face: -1, wings: 1, flap: wingPhase(u, [[0, 4.4]]), hover: true, eyes: 1, look: [0.2, 0.3], brow: 0.8, mouth: 'smile', mouthOpen: 0.25, autoBlink: false, blink: blink(T, 3.3, 0) };
  const trail = chanPts(Math.max(w - 0.09, 0.78), w, 30);
  const items = [pip(pipPose), bram(bramPose), luma(lumaPose), waterHead(trail, 0, 1, T, { width: 11, taper: [0.9, 1.1], lift: 3.5 }), waveCrest(w, T, 1, 1, c)];
  const lights = [lamp(head[0], -12, head[2] - 14, [1, 0.66, 0.3], 0.8, 90, 0),
    lamp(c.x - 20, -70, pp[2] - 60, [0.62, 0.72, 1.0], 0.6, 140),                 // a cool moon key from the lens side, so the runners read against the dark
    lamp(pp[0] - 30, -60, pp[2] + 40, [0.6, 0.7, 1.0], 0.45, 110), lamp(pp[0], -20, pp[2] - 12, [1, 0.8, 0.4], -0.25, 50)];
  const sc = scene(T, c, items, { st, motes: 26, noFg: true, lights, ambient: P.mixc([0.16, 0.2, 0.42], [0.22, 0.28, 0.52], 0.5), grade: { bloom: 0.3, vignette: 0.6 } });
  // lift the buds and flowers out of the runners' lane and from between the lens and the runners (the far bank behind them keeps its plants,
  // which light as the water passes)
  const lane = q => { if (q.z < c.z || q.z > c.z + 700 || Math.abs(q.x - c.x) > 420) return false; let best = 1e9, sd = 0;
    for (let i = 0; i <= 30; i++) { const uu = lerp(0.75, 1, i / 30), p = P.world.chan(uu), d = P.world.chanDir(uu), dx = q.x - p[0], dz = q.z - p[2], dd = Math.hypot(dx, dz); if (dd < best) { best = dd; sd = -dx * d[1] + dz * d[0]; } }
    return sd > -130; };
  // near home the lens passes Pip's flower: its big leaves (and anything else standing within 130 of the lens) would sweep across the frame
  const mine = new Set(P.SH.flat(items));
  sc.items = sc.items.filter(it => it.screen || it.flat || mine.has(it) || it.z > c.z + 130);
  return P.SH.lensShift(nearCull(clearPlants(sc, lane)), shift, false);
};

// 20 The relight. Home, the setup of shot 2 seen from the front: the camera looks into the garden at Pip's flower, the last stretch of the channel
// comes in from the right to the root. Pip runs in from the right, a few steps ahead of the water head (it follows him in from the right edge: the
// same direction as the run in shot 19), stops left of the stem and turns to watch; the head runs into the root (1.6 s, ROOT_WET) and the light
// climbs root to petals, brighter than before. The camera pulls back and up as it climbs so the whole flower AND Pip's whole body stay in frame while
// he reacts (a hop with both arms up). Bram trundles in from the right behind the water and settles right of the stem, where shot 21 finds him.
const BXR = 64, BZ21 = 397, PZ21 = 392;          // Bram right of the stem (behind Pip's depth so a cup held out to him is in front of his face)
const RUNNEL_GROUND = chanPts(0.85, 1.0, 12), RG_K = 12 / 14;   // the head: the channel's last stretch (runnelS 0..RG_K), then the runnel over the mound (RG_K..1)
const runnelS = w => w <= 1 ? clamp((w - 0.85) / 0.15) * 12 / 14 : 12 / 14 + clamp((w - 1) / 0.14) * 2 / 14;
const bram20 = (u, T) => {
  const k = ss(2.3, 4.7, u), x = lerp(176, BXR, k);
  return { x, y: 0, z: BZ21, face: -1, walk: u > 2.3 && u < 4.7 ? bramGait(176 - x, 10) : null, stride: 10, lean: 0.04 * (k > 0 && k < 1 ? 1 : 0), eyes: 1,
    look: [K(u, [[2.3, 0.8], [4.4, 0.6], [4.9, 0.1]]), K(u, [[2.3, 0], [4.6, -0.5], [5, -0.7]])], brow: 0.7, mouth: 'smile', mouthOpen: 0.15, breath: u * 0.3, autoBlink: false, blink: blink(T, 4.2, 2) };
};
const pip20 = (u, T) => {
  const xK = [[0, 96], [1.15, -32]], x = K(u, xK, (a, b, t) => { const q = clamp((t - a) / (b - a)); return 1 - (1 - q) * (1 - q) * 0.6 - 0.4 * (1 - q); }), moving = u < 1.15;
  const turned = u > 1.32, hop = u > 3.7 && u < 4.2 ? Math.sin(Math.PI * (u - 3.7) / 0.5) * 7 : 0, joy = ss(3.4, 3.75, u) * (1 - ss(4.5, 4.9, u)), wob = Math.sin(u * 14);
  const pose = Object.assign({ x, y: -hop, z: PZ21, face: turned ? 1 : -1, walk: moving ? pipGait(96 - x, 12) : null, stride: 12, run: moving ? 1 - ss(0.7, 1.15, u) : 0, ground: 0,
    lean: moving ? 0.14 : -0.06 * bump(1.4, 0.15, u), squash: 1 - 0.14 * bump(1.22, 0.1, u) - 0.1 * bump(3.65, 0.12, u) + 0.06 * (hop > 0 ? 1 : 0),
    eyes: K(u, [[0, 1], [1.5, 1.1], [3.0, 1.2]]),
    // running, he glances back over his shoulder at the water behind him (look is in facing terms: -1 = behind); turned, he watches it reach the
    // root, then follows the light up the stem
    look: turned ? [K(u, [[1.32, 0.5], [1.9, 0.3], [2.5, 0.1], [3.3, 0.05]]), K(u, [[1.32, 0.3], [2.0, 0.2], [2.6, -0.6], [3.4, -0.95]])] : [lerp(0.7, -0.8, bump(0.6, 0.22, u)), 0],
    brow: K(u, [[0, -0.2], [1.5, 0.2], [3.0, 1]]), mouth: u < 2.9 ? 'o' : 'laugh', mouthOpen: u < 1.5 ? 0.35 : u < 2.9 ? 0.4 : 0.35 + 0.25 * joy, breath: u * 0.9,
    autoBlink: false, blink: u > 1.28 && u < 1.36 ? 0.9 : blink(T, 4.1, 1.3) }, armsUp(joy, wob));
  return pose;
};
B['s20-relight'] = (u, T) => {
  const [hx, hy] = breathe(u, 0.5), st = P.state(T), w = st.water;
  const pull = ss(1.3, 2.9, u);   // the whole bloom is in frame by 2.9 s, before its petals light; Pip's face stays large while he reacts
  const c = cam(lerp(-12, -8, pull) + hx, lerp(-40, -68, pull) + 16 * ss(3.5, 5, u) + hy, lerp(172, -52, pull) + 38 * ss(3.5, 5, u), lerp(400, 402, pull), lerp(55, 40, pull));   // then a slow push in on his reaction
  const head = runnelS(Math.min(w, 1.14));
  const items = [
    pip(pip20(u, T)), bram(bram20(u, T)),
    // the head comes down the last stretch of the channel (raised as a surge so it clears the rim stones from this low lens), then runs over
    // the front of the soil mound to the stem: the same runnel the film opened on (act 1's, P.SH.rootRunnel). Once it has arrived the surge
    // settles into the stream the world draws, and the runnel keeps feeding the root.
    waterHead(RUNNEL_GROUND, 0, clamp(head / RG_K), T, { width: 10, taper: [1, 0.8], lift: lerp(3.5, 1.5, ss(1.0, 1.7, u)), nose: 1 - ss(1.25, 1.45, u), alpha: 1 - ss(2.0, 3.0, u) }),
    P.SH.rootRunnel(T, 1, clamp((head - RG_K) / (1 - RG_K))),
    u > 1.5 && u < 3.0 && P.fx.splash(3, -9.6, 398.2, ss(1.5, 2.8, u), { scale: 0.6 }),   // where the runnel meets the stem, on top of the mound
    u > 1.5 && u < 4.4 && P.fx.sparkle(HERO[0], -2, HERO[2], ss(1.5, 4.4, u)),
    u > 1.12 && u < 2.6 && P.fx.puff(-28, -2, PZ21 + 2, (u - 1.12) / 1.5, { scale: 0.5, kind: 'dust', dir: 1 }),
  ];
  const climb = st.hero.climb;
  const lights = [lamp(HERO[0] - 4, -10, 392, [1, 0.7, 0.34], 1.2 * ss(1.4, 2.6, u), 60, 40 * ss(1.4, 2.6, u)), lamp(-110, -40, 384, [0.5, 0.62, 1.0], 0.4, 120),
    lamp(HERO[0], -120, 392, [1, 0.74, 0.4], 1.1 * ss(2.4, 3.8, u) * climb, 160, 130 * ss(2.4, 3.8, u) * climb), lamp(26, -4, 404, [1, 0.7, 0.34], 1.0 * bump(1.55, 0.3, u), 50, 30 * bump(1.55, 0.3, u)),
    lamp(-40, -40, 360, [1, 0.85, 0.6], -0.25 * ss(2.6, 3.6, u), 30)];   // a little less light on Pip's face than on the petals, so the glow never flattens it
  // the frame tilts down (lens shift) as it pulls back, never so far that Pip's boots leave the bottom of the frame
  return P.SH.lensShift(nearCull(scene(T, c, items, { st, motes: 22, lights, grade: { bloom: 0.25 + 0.2 * ss(2.2, 3.6, u) } })), 165 * pull - 40 * ss(3.5, 5, u));
};

// ---------- home: faces clear of foliage, and light that keeps everyone's own colours ----------
// Any garden card (grass, bud, flower) drawn between the lens and a face, and over it, is lifted out of the shot: each candidate is drawn once into a
// small test canvas over the face's box and dropped if it covers any of it. A second kind of box sits just above Bram's shell and drops plants
// behind him that would seem to grow out of his back. The cast and the hero flower are never touched.
const TESTC = document.createElement('canvas'); TESTC.width = 300; TESTC.height = 300; const TESTX = TESTC.getContext('2d', { willReadFrequently: true });
function clearBoxes(sc, mine, boxes, T) {
  const cam = sc.cam, W = P.W, H = P.H;
  const hit = (it, b) => {
    const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(W, b.x1), y1 = Math.min(H, b.y1); if (x1 - x0 < 2 || y1 - y0 < 2) return false;
    const k = Math.min(1, 290 / Math.max(x1 - x0, y1 - y0)), bw = Math.ceil((x1 - x0) * k), bh = Math.ceil((y1 - y0) * k), s = P.scaleAt(cam, it.z);   // fine enough that a thin blade tip counts
    TESTX.setTransform(1, 0, 0, 1, 0, 0); TESTX.globalAlpha = 1; TESTX.globalCompositeOperation = 'source-over'; TESTX.filter = 'none'; TESTX.clearRect(0, 0, 300, 300);
    TESTX.setTransform(s * k, 0, 0, s * k, (W / 2 - cam.x * s - x0) * k, (H / 2 - cam.y * s - y0) * k);
    TESTX.save(); it.draw(TESTX, s, T); TESTX.restore();
    const d = TESTX.getImageData(0, 0, bw, bh).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 50 && ++n > 2) return true;
    return false; };
  sc.items = sc.items.filter(it => it.screen || it.flat || it.fg || !it.cull || mine.has(it) || !boxes.some(b => it.z > b.z0 && it.z < b.z1 && hit(it, b)));
  return sc;
}
// Boxes (screen px) around a face: an anchor point and a half size in world units, for cards nearer than the face (z0..z1).
const faceBox = (cam, p, half, z0, z1) => { const q = P.project(cam, p[0], p[1], p[2]), h = half * q[2]; return { x0: q[0] - h, x1: q[0] + h, y0: q[1] - h, y1: q[1] + h, z0, z1 }; };
function trioBoxes(cam, X, T, lumaPose) {
  const pz = X.pipPose.z, bz = X.bp.z, ph = C.anchor('pip', X.pipPose, 'head', T), be = C.anchor('bram', X.bp, 'eyes', T), bf = C.anchor('bram', X.bp, 'front', T), bb = C.anchor('bram', X.bp, 'back', T);
  const boxes = [faceBox(cam, [ph[0], ph[1] + 1, pz], 17, cam.z, pz - 0.2), faceBox(cam, [(be[0] + bf[0]) / 2, (be[1] + bf[1]) / 2 + 1, bz], 15, cam.z, bz - 0.2)];
  if (lumaPose) boxes.push(faceBox(cam, [lumaPose.x, lumaPose.y - 4, lumaPose.z], 14, cam.z, lumaPose.z - 0.2));
  if (X.pipPose.armR) { const m = C.anchor('pip', X.pipPose, 'mittR', T); boxes.push(faceBox(cam, [m[0], m[1], pz], 9, cam.z, pz - 0.2)); }   // his mitt and the cup in it (the pick-up, the dip, the offer)
  // just above the shell, behind Bram: nothing may poke up out of his back (the hero flower, at z 398-406, is never a candidate)
  const sx0 = Math.min(bf[0], bb[0] + 26), sx1 = Math.max(bf[0], bb[0] + 26), top = bb[1];
  const a = P.project(cam, sx0, top - 18, bz), b = P.project(cam, sx1, top + 12, bz);
  boxes.push({ x0: a[0], x1: b[0], y0: a[1], y1: b[1], z0: bz + 10, z1: bz + 600 });
  return boxes;
}
// The relit flower's own lights (fx, at full petal) are warm and strong at the root, where the three sit: they would turn Pip's green felt yellow and
// Luma's lilac tan. Here they are softened by k and a cool moon key from upper left keeps every face its own colour; the warm light stays on the stem,
// the petals and the turf around the root.
const isHeroLight = L => Math.abs(L.x) < 0.5 && L.z > 360 && L.z < 395 && L.col[0] >= 1 && L.col[2] < 0.5;
function homeLight(sc, k = 1) {
  sc.lights = sc.lights.map(L => isHeroLight(L) ? Object.assign({}, L, { i: L.i * (1 - 0.55 * k), rad: L.rad * (1 - 0.2 * k), halo: (L.halo || 0) * (1 - 0.5 * k) }) : L);
  return sc;
}
const moonKey = (k = 1) => [lamp(-150, -170, 230, [0.56, 0.68, 1.0], 0.5 * k, 260), lamp(-40, -110, 520, [0.5, 0.62, 1.0], 0.3 * k, 160)];

// 21 Together. A medium three-shot by the flower. Bram has settled right of the stem facing Pip; Luma floats down from above right and lands on his
// shell, wings folding; Pip fetches his cup from where he left it (left, by the flat stone), carries it back past the front of the stem (he is always
// in front of the stone, the root and Bram, so no one passes through anyone), dips it in the runnel, and holds it out to Bram low, at his mouth: Bram
// lifts his head and takes one sip (the rim meets his mouth, below his eyes). Pip lowers the cup, steps back, and they smile at each other.
// "Some things are easier together." (117.6, u 1.6) plays as the three draw together. Pip ends turning to the lens.
const CUP_REST = [-98, 414];
let POOL_X_ = null;                                // where the cup dips (found once from the pose, see poolX)
const DX21 = -76;                                 // where Pip stops to take the cup: right of it, so the cup lying at the rest spot stays in view
// distance walked along eased keyframes (for gait phases), signed by direction so a step back plays the gait backwards
const pathAt = (u, ks) => { let d = 0; for (let i = 1; i < ks.length; i++) { const seg = ks[i][1] - ks[i - 1][1]; if (u >= ks[i][0]) d += Math.abs(seg) * (ks[i][2] ?? 1); else if (u > ks[i - 1][0]) d += Math.abs(seg) * (ks[i][2] ?? 1) * ss(ks[i - 1][0], ks[i][0], u); } return d; };
const poolX = () => POOL_X_ ?? (POOL_X_ = C.anchor('pip', trio21(3.35, START['s21-together'] + 3.35).pipPose, 'dipper', START['s21-together'] + 3.35)[0] + 1);
function trio21(u, T) {
  const sip = bump(4.9, 0.42, u);
  const offerB = ss(3.95, 4.5, u) * (1 - ss(5.5, 6.3, u)), after = ss(5.5, 6.3, u);   // Bram lifts his head to the cup, then keeps it half up, smiling at Pip
  const bp = { x: BXR, y: 0, z: BZ21, face: -1, lean: -0.22 * offerB - 0.09 * after, dome: 0.45 * ss(0.3, 1.8, u) * (1 - offerB) * (1 - 0.6 * after), eyes: 1,
    look: [K(u, [[0, 0.3], [1.0, 0.8], [3.0, 0.6], [4.0, 0.9], [5.6, 0.8], [6.4, 0.7]]), K(u, [[0, -0.3], [4.4, 0.3], [5.6, 0.0], [6.4, -0.15]])],
    head: 0.25 * sip, brow: 0.9, mouth: 'smile', mouthOpen: 0.1 + 0.35 * sip + 0.12 * ss(5.6, 6.2, u), breath: u * 0.25, autoBlink: false, blink: sip > 0.3 ? 0.4 * sip : blink(T, 4.2, 3.0) };
  const back = C.anchor('bram', bp, 'back', T), front = C.anchor('bram', bp, 'front', T), eyes = C.anchor('bram', bp, 'eyes', T);
  // Luma: floats down from above right (never over Pip), lands on Bram's shell by 2.6 s, wings folding in two stages
  const lk = ss(0.2, 2.5, u), landed = ss(2.3, 2.7, u);
  const lumaPose = { x: lerp(BXR + 22, back[0], lk), y: lerp(-150, back[1], lk) - 10 * Math.sin(Math.PI * lk) + 1.6 * Math.sin(u * 4) * (1 - landed), z: BZ21 + 1, face: -1, hover: 1 - landed,
    wings: u < 2.4 ? 1 : 1 - 0.85 * ss(2.4, 3.6, u), flap: wingPhase(u, [[0, 3.6], [2.4, 4.0]]), fold: ss(2.7, 3.7, u), antL: -0.1, antR: 0.1, eyes: 0.95,
    look: [K(u, [[0, 0.4], [3.0, 0.6], [4.6, 0.7], [5.6, 0.2]]), K(u, [[0, 0.4], [2.6, 0.2], [4.6, 0.1]])], brow: 0.8, mouth: 'smile', mouthOpen: 0.12, autoBlink: false, blink: blink(T, 3.9, 3.0) };
  // Pip: from where shot 20 left him, steps left to the cup (picks it up at 1.0 s), carries it back to the runnel in front of the stem, dips it,
  // steps up to Bram and offers it, lowers it after the sip and takes a step back (the gait runs backwards), then turns to the lens
  const FX = front[0] - 30, OX = front[0] - 15, BACK = 8;
  const ks = [[0, -32], [0.85, DX21], [1.3, DX21], [3.0, FX], [3.55, FX], [3.95, OX], [5.55, OX], [6.15, OX - BACK, -1], [7, OX - BACK, -1]];
  const wk = K(u, ks.map(q => [q[0], q[1]]));
  const walking = (u > 0.05 && u < 0.85) || (u > 1.3 && u < 3.0) || (u > 3.55 && u < 3.95) || (u > 5.55 && u < 6.15);
  const dir = u < 0.1 || u > 1.3 ? 1 : -1;
  const stoop = ss(0.45, 0.72, u) * (1 - ss(0.95, 1.4, u));
  const dip = ss(3.0, 3.22, u) * (1 - ss(3.47, 3.7, u)), fillw = ss(3.24, 3.46, u),   // the cup goes down into the runnel, stays in it a quarter second while it fills, comes up full
    offer = ss(3.95, 4.45, u) * (1 - ss(5.35, 5.85, u)), turned = ss(5.9, 6.5, u);
  const signed = pathAt(u, ks.map((q, i) => [q[0], q[1], i && q[2] === -1 ? -1 : 1]));
  const pipPose = { x: wk, y: 0, z: PZ21, face: dir, yaw: turned > 0.05 ? lerp(0.3, 0, turned) : undefined, walk: walking ? pipGait(signed, 9) : null, stride: 9, ground: 0,
    lean: 0.26 * dip + 0.24 * offer + 0.3 * stoop - 0.04 * ss(5.55, 5.8, u) * (1 - ss(5.9, 6.15, u)), squash: 1 - 0.16 * dip - 0.1 * offer - 0.09 * stoop,
    eyes: 1, look: [dir > 0 ? K(u, [[1.3, 0.5], [3.0, 0.8], [5.6, 0.75]]) - 0.9 * turned : 0.6, K(u, [[0, 0.3], [0.9, 0.5], [1.3, 0], [4.4, 0.1], [5.8, 0.0]])], brow: 0.9, mouth: 'smile',
    mouthOpen: 0.25 + 0.15 * ss(5.7, 6.2, u), breath: u * 0.3, autoBlink: false, blink: blink(T, 3.8, 1) };
  let arm = null;
  // he bends, his mitt closes on the cup's handle where it lies (0.75), and he lifts it up to his tummy as he straightens
  if (u > 0.45 && u < 1.6) { const up = ss(0.95, 1.5, u); arm = { reach: [lerp(lerp(DX21 - 4, CUP_REST[0] + 4, ss(0.45, 0.75, u)), DX21 + 9, up), lerp(lerp(-12, -3.5, ss(0.45, 0.75, u)), -15, up)] }; }
  if (u >= 1.0) pipPose.dipper = { tilt: 0.1 + 0.9 * dip - 0.2 * offer + 0.3 * sip, water: fillw * (1 - 0.55 * ss(4.6, 5.2, u)) };
  if (u > 3.0) {
    // the cup dips into the runnel, comes back up and settles low at his tummy, on his own side; from there the mitt goes where the cup's rim lands
    // at Bram's mouth (the rim sits about 12 right of and 7 above the mitt), never above his eyes, and back down after the sip
    const r = ss(3.55, 3.95, u), rest = [wk + lerp(lerp(12, 9, dip), 7, r), lerp(-16, -8, r) + 16.5 * dip];   // at the bottom of the dip the cup sits in the pool
    const mouth = [front[0] + 2.5, front[1] + 4.5], tgt = [mouth[0] - 13, Math.min(mouth[1] + 7, -4)];
    arm = { reach: [lerp(rest[0], tgt[0], offer), lerp(rest[1], tgt[1], offer)] };
  }
  pipPose.armR = arm;
  return { bp, pipPose, lumaPose, back, front, eyes, sip };
}
// A soft dark pool of night on whatever sits behind Pip's head, so his lit yellow-green head keeps a clear value step against the pale hero leaf.
function headShade(pose, T, k = 1) {
  const h = C.anchor('pip', pose, 'head', T);
  return { z: pose.z + 0.5, draw(ctx) {
    const g = ctx.createRadialGradient(h[0], h[1] - 2, 4, h[0], h[1] - 2, 36);
    g.addColorStop(0, `rgba(10,26,44,${0.5 * k})`); g.addColorStop(0.55, `rgba(10,26,44,${0.3 * k})`); g.addColorStop(1, 'rgba(10,26,44,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h[0], h[1] - 2, 36, 0, TAU); ctx.fill(); } };
}
// the world's cup follows Pip's mitt from where it lay until his hand closes on it (1.0 s), then the cup in his hand takes over at the same spot
// (it lies still until his mitt is on its handle at 0.75, then rises and rights itself in his hand)
const cupHandoff = (st, u, pipPose, T) => {
  if (u >= 1.0) { st.dipper = Object.assign({}, st.dipper, { held: true }); return; }
  const e = ss(0.75, 1.0, u), m = C.anchor('pip', pipPose, 'mittR', T), d0 = st.dipper;
  st.dipper = { ...d0, x: lerp(d0.x, m[0] - 0.4, e), y: lerp(0, m[1] + 3.8, e), z: lerp(d0.z, pipPose.z - 0.4, e), fall: 1 - e, held: false };
};
// The runnel spills into a small pool at the foot of the mound in front of the stem, where Pip dips his cup: the stream's own blue-green with
// glints and a few golden particles, and rings that spread when the cup goes in (ring: 0..1 progress of the dip).
function dipPool(x, z, T, ring = 0) {
  return { z, draw(c, s) {
    const pal = P.fx.waterColors(x, -1, z), rgba = (q, a) => `rgba(${q[0] | 0},${q[1] | 0},${q[2] | 0},${a})`, rx = 10, ry = 1.7;
    c.save();
    c.fillStyle = rgba(pal.bed, 0.6); c.beginPath(); c.ellipse(x, 0.2, rx + 1.5, ry + 0.5, 0, 0, TAU); c.fill();   // the wet soil round it
    const g = c.createLinearGradient(0, -ry, 0, ry); g.addColorStop(0, rgba(pal.mid, 0.95)); g.addColorStop(1, rgba(pal.deep, 0.95));
    c.fillStyle = g; c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.fill();
    c.strokeStyle = rgba(pal.glintHi, 0.7); c.lineWidth = Math.max(0.3, 0.7 / s); c.beginPath(); c.ellipse(x, -0.2, rx * 0.95, ry * 0.8, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    for (let i = 0; i < 4; i++) { const ph = (T * 0.6 + i / 4) % 1; c.strokeStyle = rgba(pal.glint, 0.5 * Math.sin(Math.PI * ph)); c.beginPath(); c.moveTo(x - 6 + 12 * ph + (i % 2) * 2, -0.4 + 0.5 * i - 0.6); c.lineTo(x - 4 + 12 * ph + (i % 2) * 2, -0.4 + 0.5 * i - 0.6); c.stroke(); }
    for (let i = 0; i < 3; i++) P.fx.goldSpark(c, x - 5 + 5 * i + Math.sin(T * 1.3 + i) * 1.5, -0.2 + 0.4 * Math.sin(T + i * 2), 0.3, 0.6 + 0.3 * Math.sin(T * 5 + i));
    if (ring > 0 && ring < 1) for (const k of [0, 0.35]) { const q = clamp((ring - k) / 0.65); if (q <= 0 || q >= 1) continue;
      c.strokeStyle = rgba(pal.glintHi, 0.8 * (1 - q)); c.beginPath(); c.ellipse(x + 2, -0.1, 2 + 7 * q, 0.5 + 1.2 * q, 0, 0, TAU); c.stroke(); }
    c.restore(); } };
}
// The trio's own light: a little warmth from the flower on Bram's side, cool fill from the left and a cool rim on Pip, and a small negative warm
// light on Pip's face so the glow never flattens it. Then the moon key.
const trioLights = (X, k = 1) => [lamp(BXR - 6, -34, 384, [1, 0.76, 0.46], 0.14 * k, 80), lamp(-84, -40, 380, [0.5, 0.62, 1.0], 0.35, 120), lamp(X.front[0] - 14, -26, 382, [1, 0.8, 0.5], 0.1 * k, 60),
  lamp(X.pipPose.x - 2, -44, 404, [1, 0.9, 0.6], -0.3, 56), lamp(X.pipPose.x - 10, -52, 380, [0.55, 0.7, 1.0], 0.35, 60), ...moonKey()];
// One frame of the three at home: shot 21, and the first frame of 22 (which must be exactly 21's last).
function trioScene(T, c, X, items, o = {}) {
  const mine = new Set(P.SH.flat(items));
  const sc = scene(T, c, items, Object.assign({ motes: 26, noFg: true, lights: trioLights(X), grade: { bloom: 0.16 } }, o));
  homeLight(sc, o.heroK ?? 1);
  return clearBoxes(nearCull(sc), mine, trioBoxes(c, X, T, o.luma), T);
}
B['s21-together'] = (u, T) => {
  const X = trio21(u, T), st = P.state(T);
  cupHandoff(st, u, X.pipPose, T);
  const c = cam(K(u, [[0, -18], [1.0, -22], [1.8, -8], [3.6, 14], [7, 16]]), K(u, [[0, -40], [3.6, -42]]), BZ21 - K(u, [[0, 300], [1.3, 290], [3.6, 228], [7, 214]]), PZ21 + 4, 36);   // Pip well inside the frame as he fetches the cup
  const cupAt = u > 3.0 && u < 3.75 ? C.anchor('pip', X.pipPose, 'dipper', T) : null;   // the dip: water rings and a little splash where the cup goes into the runnel
  const items = [headShade(X.pipPose, T), bram(X.bp), luma(X.lumaPose), pip(X.pipPose), u > 4.4 && u < 5.6 && P.fx.sparkle(X.front[0] - 2, X.front[1] - 6, BZ21 - 2, ss(4.4, 5.6, u)),
    dipPool(poolX(), PZ21 + 3, T, ss(3.15, 3.9, u)), cupAt && P.fx.splash(cupAt[0], -0.6, PZ21 + 2.5, ss(3.12, 3.6, u), { scale: 0.45, power: 0.5, glow: 0.8 })];
  return trioScene(T, c, X, items, { st, luma: X.lumaPose });
};

// 22 "And the garden was bright enough for everyone." (124.4, u 1.4). It opens on exactly shot 21's last frame (same poses, camera, light and
// clearing), then pulls back, up and away over the relit garden: the channel glowing all the way back to the far spout, every bed lit, the tall
// flower beside the friends. The pull-back stops while the three are still a readable group (Pip about 14 percent of the frame height) on the lower
// third, clear of the bottom edge, then holds on a slow drift. Shot 21's lights hand over to the garden's as the camera rises.
const WIDE22 = { x: -20, y: -112, z: -40, focus: 700, ap: 10, f: 2100, shift: -70 };
B['s22-garden'] = (u, T) => {
  const k = ss(0.3, 3.8, u), drift = ss(3.8, 6, u);
  const X = trio21(7 + u, T), st = P.state(T); st.dipper = Object.assign({}, st.dipper, { held: true });
  const fold = bump(4.6, 0.7, u), lumaPose = Object.assign({}, X.lumaPose, { wings: X.lumaPose.wings + 0.3 * fold, fold: X.lumaPose.fold * (1 - 0.7 * fold) });
  const items = [headShade(X.pipPose, T, 1 - 0.8 * k), pip(X.pipPose), bram(X.bp), luma(lumaPose)];
  const c = cam(lerp(16, WIDE22.x, k) + 3 * drift, lerp(-42, WIDE22.y, k) - 2 * drift, lerp(BZ21 - 214, WIDE22.z, k) - 6 * drift, lerp(PZ21 + 4, WIDE22.focus, k), lerp(36, WIDE22.ap, k), { f: lerp(P.SH.F, WIDE22.f, k) });
  const lamps = []; for (let i = 0; i < 16; i++) { const q = P.world.chan(0.08 + 0.06 * i); lamps.push(lamp(q[0], -16, q[2] - 20, [1, 0.74, 0.4], 0.28 * k, 150 + 120 * k * (1 - i / 16), (30 + 36 * k + 14 * Math.sin(T * 1.7 + i)) * k)); }
  const lights = [...trioLights(X), lamp(-30, -100, 392, [1, 0.74, 0.4], 0.35 * k, 200, 50 * k), ...lamps];
  if (k > 0) items.push(P.SH.lightStream({ waterTail: 0, water: 1 }, c, { px: lerp(14, 10, k), gain: 1.1 * k }));
  const sc = trioScene(T, c, X, items, { st, lights, luma: lumaPose, ambient: P.mixc(AMB, [0.32, 0.4, 0.67], k), grade: { bloom: lerp(0.16, 0.22, k) } });
  return P.SH.lensShift(sc, lerp(0, WIDE22.shift, k) - 2 * drift);
};

// 23 The last hold: back close on the three under the glowing flower. Pip sets the cup down in front of his boots, steps back in and leans his
// mitt on Bram's head; Bram lowers his shell to rest; Luma, settled on Bram's back, folds her wings and tucks her antennae. Slow breaths, blinks
// that never coincide, the flower's warmth above and the moon on their faces; all three faces stay clear to the end. A slow push in. The film
// ends here (the mix fades it).
B['s23-trio'] = (u, T) => {
  const X = trio21(7, T - u), st = P.state(T);
  const bp = Object.assign({}, X.bp, { dome: lerp(X.bp.dome, 0.5, ss(0.5, 3, u)), lean: lerp(X.bp.lean, 0, ss(0.5, 2, u)), head: 0.05 * ss(1, 2.5, u), look: [K(u, [[0, 0.7], [2.4, 0.9], [4.5, 0.4]]), K(u, [[0, -0.15], [2.4, -0.5], [4.5, -0.2]])], mouthOpen: 0.15,
    eyes: K(u, [[0, 1], [3.6, 1], [4.4, 0.75]]), blink: blink(T, 4.4, 1.2), breath: (T - START['s21-together']) * 0.25 });   // blink clocks offset so no two of them blink together
  const front = C.anchor('bram', bp, 'front', T), headB = C.anchor('bram', bp, 'head', T);
  // The shot opens with the cup still in his mitt, as shot 22 ends: he lowers it (0-0.5), lets go (0.5) and it settles on the grass
  // in front of his boots, tipping onto its side (0.5-0.9); then the step and the lean.
  const step = ss(0.8, 1.4, u), lean = ss(1.2, 2.5, u), x0 = X.pipPose.x, px = x0 + 7 * step;   // a step back in beside Bram
  const put = ss(0, 0.5, u), held = u < 0.5, CUP = [x0 + 30, PZ21 - 13], low = [x0 + 13, -9];   // it goes down in front of his boots and clear of them, below Bram's chin
  const r0 = X.pipPose.armR.reach, d0 = X.pipPose.dipper;
  const arm = u < 0.8 ? [lerp(r0[0], low[0], put), lerp(r0[1], low[1], put)] : [lerp(low[0], lerp(px + 10, headB[0] - 4, lean), ss(0.8, 1.2, u)), lerp(low[1], lerp(-14, headB[1] - 9, lean), ss(0.8, 1.2, u))];   // the mitt rests on top of his head, the arm passing above his eyes
  const pipPose = Object.assign({}, X.pipPose, { x: px, face: 1, walk: u > 0.8 && u < 1.4 ? pipGait(7 * step, 7) : null, stride: 7, yaw: lerp(0, 0.3, ss(3.0, 4.2, u)),
    dipper: held ? { tilt: lerp(d0.tilt, 0.1, put), water: d0.water } : undefined, lean: 0.06 * lean + 0.2 * bump(0.45, 0.3, u), squash: 1 - 0.1 * bump(0.45, 0.3, u),
    look: [K(u, [[0, -0.1], [0.3, 0.3], [0.8, 0.3], [1.6, 0.6], [3.0, 0.7], [4.4, 0.1]]), K(u, [[0, 0.05], [0.3, 0.5], [0.8, 0.4], [1.6, -0.3], [4.4, 0]])],
    mouth: 'smile', mouthOpen: 0.3, eyes: K(u, [[0, 1], [4.4, 0.85]]), blink: blink(T, 3.8, 1), breath: u * 0.28 + 1.9,
    armR: { reach: arm } });
  st.dipper = Object.assign({}, st.dipper, { held: true });   // the world never draws it here: the shot draws the set-down cup itself (below), so
  let cup = null;                                            // the face clearing (which drops world cards in front of a face) cannot lift it out
  if (!held) {   // the cup leaves the mitt where he let go and settles onto its side on the ground (the reverse of shot 21's pick-up)
    // the pose he lets go in (u 0.5), and the foot of the ground cup's handle placed so its cup sits exactly where the held cup was; the ground cup
    // is drawn mirrored (the world draws it for a left-facing hand), so it matches the cup in his right mitt as he faces right
    const rel = Object.assign({}, pipPose, { x: x0, walk: null, lean: 0.2 * bump(0.45, 0.3, 0.5), squash: 1 - 0.1 * bump(0.45, 0.3, 0.5), armR: { reach: low }, dipper: { tilt: 0.1, water: d0.water } });
    const A = C.anchor('pip', rel, 'dipper', T), e = ss(0.5, 0.9, u), lay = ss(0.52, 0.88, u);   // a 0.4 s set-down: it lowers to the grass, then tips gently onto its side
    const d = { x: lerp(A[0] - 5.15, CUP[0], e), y: lerp(A[1] + 12.64, 0, e), z: lerp(pipPose.z - 0.4, CUP[1], e), water: d0.water * (1 - lay), fall: lay };
    cup = { z: d.z, draw(c, s) { c.save(); c.translate(d.x, 0); c.scale(-1, 1); c.translate(-d.x, 0); P.world.dipper(c, s, d); c.restore(); } };
  }
  const back = C.anchor('bram', bp, 'back', T);
  const lumaPose = Object.assign({}, X.lumaPose, { x: back[0], y: back[1], wings: 0.15, fold: 1, antL: -0.1 + 0.25 * ss(1.5, 3, u), antR: 0.1 - 0.25 * ss(1.5, 3, u),
    look: [K(u, [[0, 0.3], [2.6, 0.5], [4.4, 0.2]]), K(u, [[0, 0.1], [2.6, 0.3]])], eyes: K(u, [[0, 0.95], [4.4, 0.8]]), blink: blink(T, 3.5, 3.3), breath: u * 0.35 });
  const X2 = { front, pipPose, bp, back };
  const c = cam(lerp(30, 34, ss(0, 6, u)), lerp(-26, -28, ss(0, 6, u)), BZ21 - lerp(204, 186, ss(0, 6, u)), PZ21 + 3, 40);   // high enough that the boots and the cup sit well above the bottom edge
  const items = [headShade(pipPose, T, 0.8), bram(bp), luma(lumaPose), pip(pipPose), cup];
  const lights = [...trioLights(X2, 1.1), lamp(0, -150, 392, [1, 0.74, 0.4], 0.18, 110, 24)];
  return trioScene(T, c, X2, items, { st, lights, luma: lumaPose, motes: 30, fireflies: 6, grade: { bloom: 0.18, vignette: 0.66 } });
};
// (pure functions only, for measuring the climax from outside: no state)
P.SH.climax17 = { climax, cam17, gripPoint, rollKAt, seatLeaf, WIDE_CAM, LZ, PZ17 };
})();
