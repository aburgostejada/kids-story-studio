// lab scenes for world.js (they call only world.js and core.js; lights are made here, not by fx.js)
PIP.LABS['core-smoke'] = (t) => {
  const P = PIP, cam = { x: 0, y: -30, z: 0, f: 2400, focus: 400, ap: 40 };
  const items = [{ z: 1e6, screen: true, draw: c => { const g = c.createLinearGradient(0, 0, 0, P.H); g.addColorStop(0, '#0b1640'); g.addColorStop(1, '#24356b'); c.fillStyle = g; c.fillRect(0, 0, P.W, P.H); } }];
  for (let i = 0; i < 12; i++) { const z = 250 + i * 120, x = -200 + (i % 4) * 120;
    items.push({ z, draw: c => P.card(c, k => k.ellipse(x, -8, 18, 9, 0, 0, P.TAU), P.lit([150, 150, 160], x, -8, z), { lift: 1.5, edge: 0.3 }) }); }
  return { cam, ambient: [0.3, 0.38, 0.65], lights: [{ x: 0, y: -60, z: 400, col: [1, 0.66, 0.3], i: 2.5, rad: 60, halo: 120 }], items };
};

(() => {
const P = PIP, WD = P.world;
const LIT = { climb: 1, petal: 1, flicker: 1, open: 1 }, DARK = { climb: 0, petal: 0, flicker: 1, open: 0.25 };
const mkSt = (t, o = {}) => Object.assign({ t, water: -1, waterGlow: 0, pond: 0, hero: DARK, flower: () => DARK,
  leaf: { curl: 1, x: -900, y: -10, z: 2588, rot: 0.2, free: 0, lift: 0 }, pinStone: { x: -870, z: 2582, rot: 0.2 },
  dipper: { x: -98, y: 0, z: 384, rot: 0.1, held: false, water: 0 } }, o);
// lab lights mirror fx.lights: three hero lights, the eight strongest garden flowers (small halos), the trapped pond glow
const lights = (st, noHalo) => { const L = [], hs = st.hero, R0 = { x: 0, z: 400 }, ssf = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const s1 = ssf(0, 0.32, hs.climb), s2 = ssf(0.22, 0.7, hs.climb), pet = Math.max(hs.petal, ssf(0.85, 1, hs.climb) * 0.2);
  if (s1 > 0.01) L.push({ x: R0.x, y: -26, z: R0.z - 12, col: [1, 0.6, 0.22], i: s1, rad: 44, halo: 0 });
  if (s2 > 0.01) L.push({ x: R0.x, y: -80, z: R0.z - 14, col: [1, 0.64, 0.26], i: 0.9 * s2, rad: 56, halo: 0 });
  if (pet > 0.01) L.push({ x: R0.x, y: -136 - 8 * hs.open, z: R0.z - 28, col: [1, 0.72, 0.36], i: 1.7 * pet, rad: 92, halo: 38 * pet });
  const cand = []; WD.FLOWERS.forEach((f, i) => { const s = st.flower(i); if (s.petal > 0.05) cand.push({ x: f.x, y: -f.h * (0.4 + 0.42 * s.petal), z: f.z - 10, col: [1, 0.64, 0.28], i: 1.6 * s.petal, rad: 34 + 0.45 * f.h, halo: s.petal > 0.3 ? 10 + 0.14 * f.h : 0 }); });
  cand.sort((a, b) => b.i - a.i); L.push(...cand.slice(0, 8));
  if (st.waterGlow > 0 && st.pond > 0) L.push({ x: -935, y: -62, z: 2800, col: [1, 0.58, 0.22], i: 0.5 * st.pond, rad: 230, halo: 0 });
  if (noHalo) L.forEach(l => l.halo = 0);
  return L; };
const scene = (st, cam, o = {}) => (st.cam = cam, { cam, ambient: o.ambient || [0.30, 0.38, 0.65], lights: lights(st, o.noHalo), grade: o.grade || { bloom: 0.3, vignette: 0.55, grain: 0.1 },
  items: [...WD.sky(st), ...WD.hills(st), ...WD.ground(st, cam), ...WD.channel(st), ...WD.flowers(st), ...WD.hero(st), ...WD.spout(st), ...WD.props(st),
    ...(o.fg ? WD.foreground(st, cam) : [])] });
const litSt = (t, o) => mkSt(t, Object.assign({ hero: LIT, flower: i => ({ climb: 1, petal: 0.75 + 0.25 * Math.sin(i * 2.3 + t), flicker: 1, open: 0.8 }), water: 0.55 }, o));

const WIDE = { x: -100, y: -35, z: -1400, f: 2400, focus: 1200, ap: 40 };
P.LABS['world-wide'] = t => { const st = litSt(t); return scene(st, WIDE, { fg: true }); };
P.LABS['world-wide-high'] = t => scene(litSt(t), { x: -60, y: -190, z: -1000, f: 2400, focus: 1500, ap: 40 }, { fg: true });
P.LABS['world-wide-dark'] = t => scene(mkSt(t), WIDE, { ambient: [0.20, 0.26, 0.50], fg: true });
const HOME = { x: -30, y: -62, z: -190, f: 2400, focus: 410, ap: 40 };
P.LABS['world-home'] = t => scene(litSt(t, { water: -1 }), HOME);
P.LABS['world-home-dark'] = t => scene(mkSt(t), HOME, { ambient: [0.20, 0.26, 0.50] });
P.LABS['world-macro-stem'] = t => scene(mkSt(t, { hero: { climb: 0.5, petal: 0.1, flicker: 1, open: 0.3 } }), { x: 2, y: -62, z: 340, f: 2400, focus: 402, ap: 30 });
P.LABS['world-spout'] = t => scene(mkSt(t, { pond: 1, waterGlow: 1 }), { x: -866, y: -52, z: 2330, f: 2400, focus: 2650, ap: 40 }, { fg: false });
// low beside the bed, looking up it: the bed 270 units ahead is dead centre, so the ribbon sweeps in from the lower left between two rows of cobbles.
// The spot is chosen where no tall garden flower stands in the near field (so nothing but small buds frames the shot).
const zAt = z => { for (let u = 0; u <= 1; u += 0.001) { const q = WD.chan(u); if (q[2] <= z) return q; } return WD.chan(1); };
const camAt = zt => { const p = zAt(zt); return { x: p[0] + 4, y: -19, z: p[2] - 220, f: 1500, focus: p[2] - 20, ap: 14 }; };
// clearance: distance ahead to the nearest garden flower that stands inside the frame (its stem and leaves would fill the shot)
const clearance = c => Math.min(1e9, ...WD.FLOWERS.map(f => { const fw = f.z - c.z; return fw > 5 && Math.abs(f.x - c.x) < fw * 0.62 + 14 ? fw : 1e9; }));
let bestCam = camAt(1500), bestScore = -1;
const uAt = z => { for (let u = 0; u <= 1; u += 0.001) if (WD.chan(u)[2] <= z) return u; return 1; };
for (let zt = 2100; zt > 700; zt -= 20) { const c = camAt(zt), al = Math.min(Math.abs(WD.chanDir(uAt(zt))[1]), Math.abs(WD.chanDir(uAt(zt - 150))[1])); if (al < 0.85) continue; const sc = clearance(c); if (sc > bestScore) { bestScore = sc; bestCam = c; } }
P.LABS['world-channel-low'] = t => scene(litSt(t, { water: -1 }), bestCam, { fg: false, noHalo: true });
})();

// close lab scenes for the spout (dam, dry leaf). t: 0..5 unrolls the leaf (curl 1 -> 0.08); t >= 6 floats it away.
(() => {
const P = PIP, WD = P.world, ss = P.ss;
const M = WD.chan(0), cx = M[0];
const mkSt = (t, o = {}) => Object.assign({ t, water: -1, waterGlow: 1, pond: 1, hero: { climb: 0, petal: 0, flicker: 1, open: 0.25 }, flower: () => ({ climb: 0, petal: 0, flicker: 1, open: 0.25 }),
  leaf: { curl: 1 - ss(0, 5, t) * 0.92, x: cx, y: -10, z: M[2] - 12, rot: 0.25, free: ss(6, 9.5, t), lift: ss(2, 4, t) * 0.6 }, pinStone: { x: cx + 132, z: M[2] - 27.5, rot: 0.2, release: ss(5.5, 6.2, t) }, dipper: { x: -98, y: 0, z: 384, rot: 0.1, held: true, water: 0 } }, o);
const lightsOf = st => [{ x: -935, y: -62, z: 2800, col: [1, 0.58, 0.22], i: 0.5 * st.pond, rad: 230, halo: 0 }];
const scene = (st, cam, ambient) => (st.cam = cam, { cam, ambient: ambient || [0.20, 0.26, 0.50], lights: lightsOf(st), grade: { bloom: 0.3, vignette: 0.55, grain: 0.1 },
  items: [...WD.sky(st), ...WD.hills(st), ...WD.ground(st, cam), ...WD.channel(st), ...WD.flowers(st), ...WD.spout(st)] });
P.LABS['world-leaf'] = t => scene(mkSt(t), { x: cx + 40, y: -34, z: M[2] - 230, f: 2400, focus: M[2] - 12, ap: 12 });
P.LABS['world-leaf-close'] = t => scene(mkSt(t), { x: cx + 40, y: -22, z: M[2] - 120, f: 2400, focus: M[2] - 12, ap: 12 });
P.LABS['world-dam'] = t => scene(mkSt(t, { pond: 1 }), { x: cx, y: -60, z: M[2] - 380, f: 2400, focus: M[2] + 60, ap: 18 });
P.LABS['world-dam-wide'] = t => scene(mkSt(t, { pond: 1 }), { x: cx + 120, y: -170, z: M[2] - 1100, f: 2400, focus: M[2] + 100, ap: 12 });
P.LABS['world-stem'] = t => scene(mkSt(t), { x: cx + 125, y: -16, z: M[2] - 150, f: 2400, focus: M[2] - 24, ap: 10 });
// the leaf's far edge as WD.leafEdge reports it: lime dots every 0.1 along the blade, with short ticks along the outward normal
P.LABS['world-leaf-edge'] = t => { const sc = scene(mkSt(t), { x: cx + 40, y: -34, z: M[2] - 200, f: 2400, focus: M[2] - 12, ap: 6 }), lf = mkSt(t).leaf;
  lf.grip = { sn: 0.62, lift: 4 * ss(1, 2, t) };
  sc.items = sc.items.map(it => it); sc.items.push({ z: lf.z - 1, draw(c, s) { for (let i = 0; i <= 10; i++) { const p = WD.leafEdge(lf, i / 10); c.fillStyle = '#b8ff40'; c.beginPath(); c.arc(p[0], p[1], 1.2, 0, P.TAU); c.fill();
    c.strokeStyle = '#b8ff40'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + p.nx * 5, p[1] + p.ny * 5); c.stroke(); } } });
  return sc; };
// the resting dipper as it tips over (t 0..2: fall 0 -> 1) and lies on its side
P.LABS['world-dipper'] = t => { const st = mkSt(t, { dipper: { x: cx + 60, y: 0, z: M[2] - 40, held: false, water: 0, fall: ss(0, 2, t) } });
  const sc = scene(st, { x: cx + 60, y: -6, z: M[2] - 120, f: 2400, focus: M[2] - 40, ap: 6 }); sc.items.push(...WD.props(st)); return sc; };
})();

// calm (st.calm, 0..1): the left half of the frame at calm 0, the right half at calm 1, from the same lens (a wide garden like s01/s04, and
// a high one like s11). world-calm-ramp animates calm 0 -> 1 over t 0..4 across the whole frame, to check that nothing flickers.
(() => {
const P = PIP, WD = P.world, LIT = { climb: 1, petal: 1, flicker: 1, open: 1 }, DARK = { climb: 0, petal: 0, flicker: 1, open: 0.3 };
const st0 = (t, calm, lit) => ({ t, calm, water: lit ? 0.9 : -1, waterTail: 0, waterGlow: 1, pond: 0.6, hero: lit ? LIT : DARK,
  flower: i => lit ? { climb: 1, petal: 0.75 + 0.25 * Math.sin(i * 2.3 + t), flicker: 1, open: 0.8 } : DARK,
  leaf: { curl: 1, x: -895, y: -10, z: 2588, rot: 0.25, free: 0, lift: 0 }, pinStone: { x: -763, z: 2572.5, rot: 0 }, dipper: { x: -98, y: 0, z: 414, rot: 0.08, held: false, water: 0, fall: 1 } });
const build = (st, cam) => { st.cam = cam; return [...WD.sky(st), ...WD.hills(st), ...WD.ground(st, cam), ...WD.channel(st), ...WD.flowers(st), ...WD.hero(st), ...WD.spout(st), ...WD.props(st), ...WD.foreground(st, cam)]; };
// every item of one half draws only in that half, and first points the world's per-builder state at its own st (the cached items read it)
const half = (items, st, x0, x1) => items.map(it => Object.assign({}, it, { draw(c, ...a) { WD.flowers(st); WD.hills(st); WD.channel(st);
  c.save(); const m = c.getTransform(); c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath(); c.rect(x0, 0, x1 - x0, P.H); c.setTransform(m); c.clip(); it.draw(c, ...a); c.restore(); } }));
const pair = (cam, lit) => t => { const a = st0(t, 0, lit), b = st0(t, 1, lit), A = build(a, cam), B = build(b, cam);
  const items = [...half(A, a, 0, P.W / 2), ...half(B, b, P.W / 2, P.W), { z: 0.5, screen: true, draw(c) { c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(P.W / 2 - 1, 0, 2, P.H); } }];
  return { cam, ambient: lit ? [0.30, 0.38, 0.65] : [0.20, 0.26, 0.50], lights: [], items, grade: { bloom: 0.3, vignette: 0.55, grain: 0.1 } }; };
const WIDE = { x: -60, y: -60, z: -1100, f: 2400, focus: 900, ap: 30 }, HIGH = { x: -200, y: -260, z: -500, f: 2400, focus: 1500, ap: 20 };
P.LABS['world-calm'] = pair(WIDE, true);
P.LABS['world-calm-dark'] = pair(WIDE, false);
P.LABS['world-calm-high'] = pair(HIGH, false);
P.LABS['world-calm-ramp'] = t => { const st = st0(t, P.clamp(t / 4), true); return { cam: WIDE, ambient: [0.30, 0.38, 0.65], lights: [], items: build(st, WIDE), grade: { bloom: 0.3, vignette: 0.55, grain: 0.1 } }; };
})();

// the sealed spout from the s13 three-quarter wide and the s16 camera, world only (no shot overlays): the pond swell, the water pressing
// on the seal (swell, meniscus, beads), the seep dying on the sluice bed. t 0..2: the pond fills (0.4 -> 1); t >= 3: the leaf lets go.
(() => {
const P = PIP, WD = P.world, M = WD.chan(0), ZR = M[2] - 28, ss = P.ss;
const LX = (() => { const cx = -862, zc = ZR - 290, xt = cx + (M[0] + 3 - cx) * (M[2] - 12 - zc) / (2692 - zc); return xt - 7; })();
const st = t => ({ t, calm: 0, water: -1, waterTail: 0, waterGlow: 1, pond: 0.4 + 0.6 * ss(0, 2, t), hero: { climb: 0, petal: 0, flicker: 1, open: 0.3 }, flower: () => ({ climb: 0, petal: 0, flicker: 1, open: 0.3 }),
  leaf: { curl: 1, x: LX + 170 * ss(3, 6.5, t), y: -10 - 4 * ss(3, 6.5, t), z: M[2] - 12 - 30 * ss(3, 6.5, t), rot: 0.25 + 0.5 * ss(3, 6.5, t), free: ss(3, 6.5, t), lift: 0 },
  pinStone: { x: LX + 132, z: M[2] - 27.5, rot: 0 }, dipper: { x: -98, y: 0, z: 414, rot: 0.08, held: false, water: 0, fall: 1 } });
const sc = cam => t => { const s = st(t); s.cam = cam; return { cam, ambient: [0.2, 0.25, 0.48], lights: [{ x: M[0] - 2, y: -30, z: 2672, col: [1, 0.62, 0.28], i: 0.5, rad: 140, halo: 0 }, { x: M[0] + 60, y: -80, z: 2560, col: [0.6, 0.7, 1], i: 0.35, rad: 90, halo: 0 }],
  grade: { bloom: 0.3, vignette: 0.6, grain: 0.1 }, items: [...WD.sky(s), ...WD.hills(s), ...WD.ground(s, cam), ...WD.channel(s), ...WD.flowers(s), ...WD.spout(s), ...WD.props(s)] }; };
P.LABS['world-seal-s13'] = sc({ x: -847, y: -46, z: ZR - 412, f: 2400, focus: ZR + 0.14 * 412, ap: 30 });
P.LABS['world-seal-s16'] = sc({ x: -866, y: -44, z: ZR - 338, f: 2400, focus: ZR + 0.14 * 338, ap: 30 });
P.LABS['world-seal-close'] = sc({ x: M[0] + 4, y: -30, z: ZR - 150, f: 2400, focus: 2650, ap: 10 });
})();

// the peel (lf.peel, WD.leafCurlEdge): the curl's free edge drawn up off the roll to a grip point, from the s17 'pip' camera. t 0..1 the edge
// comes up to the grip (k 0 -> 1); t 1..6 the roll unrolls (curl 1 -> 0.3) while the grip steps back along the blade, as Pip's heaves do.
// Two pale dots mark the grip (where a character's mitts go); lime dots trace WD.leafCurlEdge(lf).outline, cyan ones its lipAt() along the roll.
(() => {
const P = PIP, WD = P.world, M = WD.chan(0), ZR = M[2] - 28, ss = P.ss, lerp = P.lerp;
const LX = (() => { const cx = -862, zc = ZR - 290, xt = cx + (M[0] + 3 - cx) * (M[2] - 12 - zc) / (2692 - zc); return xt - 7; })();
const leafAt = t => { const lf = { curl: 1 - 0.7 * ss(1, 6, t), x: LX, y: -10, z: M[2] - 12, rot: 0.25, free: 0, lift: 0.1 };
  const gxW = LX + 104 - 30 + 10 * ss(1, 6, t), lip = WD.leafCurlEdge(lf).lipAt(gxW);
  lf.peel = { x: gxW + 4, y: lip[1] - 17 - 2 * Math.sin(t * 3) * ss(1, 2, t), k: ss(0, 1, t) }; return lf; };
const st = t => ({ t, calm: 0, water: -1, waterTail: 0, waterGlow: 1, pond: 1, hero: { climb: 0, petal: 0, flicker: 1, open: 0.3 }, flower: () => ({ climb: 0, petal: 0, flicker: 1, open: 0.3 }),
  leaf: leafAt(t), pinStone: { x: LX + 132, z: M[2] - 27.5, rot: 0 }, dipper: { x: -98, y: 0, z: 414, rot: 0.08, held: false, water: 0, fall: 1 } });
const sc = (cam, marks) => t => { const s = st(t); s.cam = cam; const lf = s.leaf, ce = WD.leafCurlEdge(lf);
  const items = [...WD.sky(s), ...WD.hills(s), ...WD.ground(s, cam), ...WD.channel(s), ...WD.flowers(s), ...WD.spout(s)];
  if (marks) items.push({ z: lf.z - 2, draw(c) { const dot = (p, col, r = 0.6) => { c.fillStyle = col; c.beginPath(); c.arc(p[0], p[1], r, 0, P.TAU); c.fill(); };
    for (const p of ce.outline) dot(p, '#b8ff40', 0.35); for (let x = LX - 4; x < LX + 104; x += 6) dot(ce.lipAt(x), '#40e0ff', 0.35);
    if (ce.grip) { dot([ce.grip[0] - 1.5, ce.grip[1]], 'rgba(255,240,220,0.9)', 1.1); dot([ce.grip[0] + 1.5, ce.grip[1]], 'rgba(255,240,220,0.9)', 1.1); } } });
  return { cam, ambient: [0.2, 0.25, 0.48], lights: [{ x: M[0] - 2, y: -30, z: 2672, col: [1, 0.62, 0.28], i: 0.6, rad: 140, halo: 0 }, { x: M[0] + 60, y: -80, z: 2560, col: [0.6, 0.7, 1], i: 0.4, rad: 90, halo: 0 }],
    grade: { bloom: 0.3, vignette: 0.6, grain: 0.1 }, items }; };
const LZ = M[2] - 12;
P.LABS['world-leaf-peel'] = sc({ x: -866, y: -41, z: LZ - 164, f: 2400, focus: LZ, ap: 16 }, false);
P.LABS['world-leaf-peel-marks'] = sc({ x: -866, y: -41, z: LZ - 164, f: 2400, focus: LZ, ap: 4 }, true);
P.LABS['world-leaf-peel-wide'] = sc({ x: -866, y: -44, z: ZR - 340, f: 2400, focus: ZR + 42, ap: 20 }, false);
})();

// v8 air and motion: wind, mist and the living sky.
// world-wind: a medium view across a bank of buds, grass and garden flowers (flower 20 in focus) to watch one wind move them over time;
// world-mist: the dark wide with the default mist (its lens is a wide, so about 1); world-mist-0 / world-mist-1 force st.mist 0 and 1;
// world-mist-calm: the default mist at calm 1 (thinned); world-sky: the moon, its ring and the drifting wisps, close (sky and hills only).
(() => {
const P = PIP, WD = P.world, DARK = { climb: 0, petal: 0, flicker: 1, open: 0.25 };
const st = (t, o = {}) => Object.assign({ t, water: -1, waterTail: 0, waterGlow: 0, pond: 0.6, hero: DARK, flower: () => DARK,
  leaf: { curl: 1, x: -900, y: -10, z: 2588, rot: 0.2, free: 0, lift: 0 }, pinStone: { x: -870, z: 2582, rot: 0.2 }, dipper: { x: -98, y: 0, z: 384, rot: 0.1, held: false, water: 0 } }, o);
const build = (s, cam, fg) => { s.cam = cam; return [...WD.sky(s), ...WD.hills(s), ...WD.ground(s, cam), ...WD.channel(s), ...WD.flowers(s), ...WD.hero(s), ...WD.spout(s), ...WD.props(s), ...(fg ? WD.foreground(s, cam) : [])]; };
const G = { bloom: 0.3, vignette: 0.55, grain: 0.1 }, AMBD = [0.20, 0.26, 0.50];
const F = WD.FLOWERS[20], WINDCAM = { x: F.x - 20, y: -48, z: F.z - 330, f: 2400, focus: F.z, ap: 14 };
P.LABS['world-wind'] = t => { const s = st(t, { flower: i => ({ climb: 1, petal: 0.8, flicker: 1, open: 0.8 }) });
  return { cam: WINDCAM, ambient: [0.30, 0.38, 0.65], lights: [{ x: F.x, y: -F.h * 0.8, z: F.z - 10, col: [1, 0.64, 0.28], i: 1.3, rad: 34 + 0.45 * F.h, halo: 12 }], items: build(s, WINDCAM, true), grade: G }; };
const WIDE = { x: -100, y: -35, z: -1400, f: 2400, focus: 1200, ap: 40 };
const mist = o => t => ({ cam: WIDE, ambient: AMBD, lights: [{ x: -935, y: -62, z: 2800, col: [1, 0.58, 0.22], i: 0.5, rad: 230, halo: 0 }], items: build(st(t, Object.assign({ waterGlow: 1, pond: 1 }, o)), WIDE, true), grade: G });
P.LABS['world-mist'] = mist({});
P.LABS['world-mist-0'] = mist({ mist: 0 });
P.LABS['world-mist-1'] = mist({ mist: 1 });
P.LABS['world-mist-calm'] = mist({ calm: 1 });
const SKY = { x: 3000, y: -4000, z: -1400, f: 5200, focus: 40000, ap: 0 };
P.LABS['world-sky'] = t => { const s = st(t); s.cam = SKY; return { cam: SKY, ambient: AMBD, lights: [], items: [...WD.sky(s), ...WD.hills(s)], grade: G }; };
})();
