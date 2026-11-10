// lab scenes for fx.js: a plain dusk stage (gradient sky, ground gradient, flecks, rim stones along the fx channel path)
// so the water, light and particles can be judged on their own. Only core.js and P.fx are used here.
(() => {
const P = PIP, fx = P.fx, { clamp, lerp, ss, hash, TAU, W, H } = P;
const DUSK = [0.26, 0.33, 0.6];

const skyItems = () => [
  { z: 1e6, screen: true, draw: c => { const g = c.createLinearGradient(0, 0, 0, H / 2); g.addColorStop(0, '#07123a'); g.addColorStop(0.7, '#16296a'); g.addColorStop(1, '#2b3f84'); c.fillStyle = g; c.fillRect(0, 0, W, H / 2 + 2);
    c.fillStyle = '#e9efff'; c.beginPath(); c.arc(1380, 170, 62, 0, TAU); c.fill();
    const m = c.createRadialGradient(1380, 170, 60, 1380, 170, 260); m.addColorStop(0, 'rgba(190,210,255,0.35)'); m.addColorStop(1, 'rgba(190,210,255,0)'); c.fillStyle = m; c.fillRect(1100, 0, 560, 480); } },
  { z: 9.5e5, screen: true, draw: c => { for (let l = 0; l < 3; l++) { c.fillStyle = ['#18255a', '#121c48', '#0d1536'][l]; c.beginPath(); c.moveTo(0, H / 2);
      for (let x = 0; x <= W; x += 40) c.lineTo(x, H / 2 - 70 + l * 22 - 36 * Math.sin(x * 0.0021 + l * 1.7) - 18 * Math.sin(x * 0.0051 + l)); c.lineTo(W, H / 2); c.closePath(); c.fill(); } } },
  { z: 9e5, screen: true, draw: c => { const g = c.createLinearGradient(0, H / 2, 0, H); g.addColorStop(0, '#0e1a3a'); g.addColorStop(0.2, '#0b1730'); g.addColorStop(1, '#070e22'); c.fillStyle = g; c.fillRect(0, H / 2 - 1, W, H / 2 + 1); } },
];

// dark ground flecks (tiny tufts and pebbles) and rim stones along the channel, all lit by the scene lights
function groundItems(cam, o = {}) {
  const items = [], T = fx, L = T.pathLength(), zmin = cam.z + (o.zmin ?? 120), zmax = o.zmax || 2800;
  const near = (x, z) => { let best = 1e9; for (let a = 0; a <= L; a += 22) { const p = T.pathAt(a); if (Math.abs(p.z - z) < 40) best = Math.min(best, Math.hypot(p.x - x, p.z - z)); } return best; };
  for (let i = 0; i < (o.flecks === false ? 0 : 520); i++) {
    const z = lerp(zmin, zmax, Math.pow(hash(i, 1), 1.7)), d = z - cam.z, x = cam.x + (hash(i, 2) * 2 - 1) * d / cam.f * W * 0.62;
    if (near(x, z) < 20) continue;
    const kind = hash(i, 3), sz = 3 + 10 * hash(i, 4);
    items.push({ z, draw: c => {
      if (kind < 0.55) { const col = P.lit([36 + 30 * hash(i, 5), 70 + 40 * hash(i, 6), 52 + 20 * hash(i, 7)], x, -sz * 0.5, z, 0.02);
        c.fillStyle = col; for (let b = 0; b < 3; b++) { const bx = x + (b - 1) * sz * 0.35, lean = (hash(i, 8 + b) - 0.5) * sz * 0.5; c.beginPath(); c.moveTo(bx - sz * 0.12, 0); c.quadraticCurveTo(bx + lean * 0.4, -sz * 0.6, bx + lean, -sz * (0.8 + 0.4 * hash(i, 11 + b))); c.quadraticCurveTo(bx + sz * 0.12, -sz * 0.4, bx + sz * 0.12, 0); c.fill(); } }
      else { c.fillStyle = P.lit([86, 90, 112], x, -sz * 0.2, z, 0.02); c.beginPath(); c.ellipse(x, -sz * 0.18, sz * 0.5, sz * 0.26, 0, 0, TAU); c.fill(); }
    } });
  }
  const SC = [[150, 150, 170], [162, 152, 144], [140, 150, 174], [160, 154, 132], [146, 148, 164]];   // world.js stone palette
  for (const sd of [-1, 1]) for (let a = 6, k = 0; a < (o.gap ? L - 34 : L - 14); k++) {
    const kk = k * 2 + (sd > 0 ? 1 : 0), Ls = 11 + 15 * hash(kk, 1), Wd = 9 + 8 * hash(kk, 2), ht = 6.5 + 6.5 * hash(kk, 3), tf = 2 + 1.8 * hash(kk, 4);
    const am = a + Ls / 2, p = T.pathAt(am), off = 11 + Wd / 2 - 1.3, x = p.x + p.nx * sd * off, z = p.z + p.nz * sd * off;
    const e = Math.max(Ls * Math.abs(p.dx) + Wd * Math.abs(p.dz), 7) / 2, col = SC[Math.floor(hash(kk, 10) * 5)];
    a += Ls + 0.4 + 1.4 * hash(kk, 7);
    if (z < zmin || z > zmax || o.stones === false) continue;
    items.push({ z, draw: (c, s) => { const th = ht + tf, px = e * 2 * s;
      c.save(); c.translate(x, 0);
      const g = c.createLinearGradient(0, -ht, 0, 0); g.addColorStop(0, P.lit(col, x, -ht, z, 0.05)); g.addColorStop(1, P.lit(col.map(v => v * 0.5), x, -1, z, 0));
      P.card(c, k2 => k2.roundRect(-e, -ht, 2 * e, ht, [1.5, 2, 0.5, 0.5]), g, { lift: Math.max(1.1, ht * 0.12), tex: px > 12 ? 0.3 : 0, shadow: 0.5 });
      const tg = c.createLinearGradient(0, -th, 0, -ht); tg.addColorStop(0, P.lit(col.map(v => v * 1.22), x, -th, z, 0.14)); tg.addColorStop(1, P.lit(col.map(v => v * 1.08), x, -ht, z, 0.08));
      c.fillStyle = tg; c.beginPath(); c.roundRect(-e + 1, -th, 2 * e - 2, tf + 0.4, [2, 2, 0.2, 0.2]); c.fill();
      if (px > 8) { c.strokeStyle = P.lit([255, 245, 235], x, -ht, z, 0.3, 0.4); c.lineWidth = Math.max(0.3, 0.9 / s); c.beginPath(); c.moveTo(-e + 1.5, -ht + 0.15); c.lineTo(e - 1.5, -ht + 0.15); c.stroke(); }
      if (px > 26) for (let i = 0; i < 9; i++) { c.fillStyle = hash(kk, 70 + i) < 0.5 ? 'rgba(20,24,50,0.25)' : 'rgba(255,255,255,0.16)'; c.beginPath(); c.arc((hash(kk, 80 + i) - 0.5) * 2 * e * 0.9, -ht * (0.1 + 0.8 * hash(kk, 90 + i)), 0.18 + 0.45 * hash(kk, 100 + i), 0, TAU); c.fill(); }
      c.restore(); } });
  }
  return items;
}
const rootStem = (st, hh = 150) => ({ z: 400, draw: c => {   // simple stand-in for Pip's flower stem, just to see light and water meet it
  const h = st.hero || {}, glow = clamp(h.climb ?? 0);
  c.fillStyle = P.lit([56, 92, 70], 0, -40, 400, 0.02 * glow); c.beginPath(); c.moveTo(-3.4, 0); c.quadraticCurveTo(-2.4, -hh / 2, -1.6, -hh); c.lineTo(1.6, -hh); c.quadraticCurveTo(2.4, -hh / 2, 3.4, 0); c.closePath(); c.fill();
  c.fillStyle = P.lit([88, 66, 44], 0, -2, 400, 0.05); c.beginPath(); c.ellipse(0, -1, 11, 3.4, 0, 0, TAU); c.fill();
  c.fillStyle = P.lit([255, 190, 80], 0, -150, 400, 0.5 * (h.petal ?? 0)); if (hh >= 150) { c.beginPath(); c.ellipse(0, -150, 23, 26, 0, 0, TAU); c.fill(); } } });
const flowersStub = [{ u: 0.3, x: 60, z: 760, h: 90, col: [255, 170, 90] }, { u: 0.4, x: -140, z: 940, h: 70 }];
const flowerStubItems = st => (typeof st.flower === 'function' ? flowersStub.map((f, i) => ({ z: f.z, draw: c => { const s = st.flower(i), pt = clamp(s.petal);
  c.fillStyle = P.lit([60, 120, 70], f.x, -f.h * 0.5, f.z); c.fillRect(f.x - 2, -f.h, 4, f.h);
  c.fillStyle = P.lit([220, 120, 160], f.x, -f.h, f.z, 0.9 * pt); c.beginPath(); c.ellipse(f.x, -f.h, 14, 18, 0, 0, TAU); c.fill(); } })) : []);

function stage(cam, st, o = {}) {
  const items = skyItems().concat(groundItems(cam, o), o.items || []);
  const lights = fx.lights(st, flowersStub).concat(o.lights || []);
  return { cam, ambient: o.ambient || DUSK, lights, items: items.concat(o.fx || []), grade: o.grade || { bloom: 0.3, vignette: 0.5, grain: 0.1 } };
}
const baseSt = (t, over = {}) => Object.assign({ t, water: -1, waterGlow: 0, pond: 0, hero: { climb: 0, petal: 0, flicker: 1, open: 0 }, flower: i => ({ climb: 0, petal: 0, flicker: 1, open: 0 }), leaf: {}, dipper: {} }, over);

// -- water advancing along the winding channel: t 0..6 moves the front from the spout to the hero root
const CAM_WIDE = { x: -40, y: -150, z: -520, f: 1750, focus: 1000, ap: 9 };
PIP.LABS['fx-water-advance'] = t => {
  const w = clamp(t / 6) * 1.02, st = baseSt(t, { water: w, waterGlow: ss(0, 1.5, t), pond: ss(0, 1, t) * 0.8, hero: { climb: ss(4, 6, t), petal: ss(5, 6, t), flicker: 1, open: ss(5, 6, t) } });
  return stage(CAM_WIDE, st, { items: [rootStem(st), ...flowerStubItems(st)], fx: fx.water(st), zmax: 2800 });
};
PIP.LABS['fx-water-full'] = t => {
  const st = baseSt(t, { water: 1.2, waterGlow: 1, pond: 0.9, hero: { climb: 1, petal: 1, flicker: 0.96 + 0.04 * Math.sin(t * 9), open: 1 }, flower: i => ({ climb: 1, petal: i ? 0.2 : 1, flicker: 1 }) });
  return stage(CAM_WIDE, st, { items: [rootStem(st), ...flowerStubItems(st)], fx: fx.water(st) });
};
// close: low camera near the end of the channel, the bug's-eye view
PIP.LABS['fx-water-close'] = t => {
  const cam = { x: 0, y: -110, z: 60, f: 2000, focus: 470, ap: 10 };
  const w = lerp(0.82, 1.02, clamp(t / 6)), st = baseSt(t, { water: w, waterGlow: 1, hero: { climb: 1, petal: 1, flicker: 1, open: 1 } });
  return stage(cam, st, { items: [], fx: fx.water(st).concat(fx.motes(st, cam, 22, 1)), zmax: 1500 });
};
PIP.LABS['fx-water-mid'] = t => {
  const cam = { x: -30, y: -70, z: -150, f: 1800, focus: 650, ap: 12 }, st = baseSt(t, { water: 1.1, waterGlow: 1, hero: { climb: 1, petal: 1, flicker: 1, open: 1 } });
  return stage(cam, st, { items: [rootStem(st)], fx: fx.water(st).concat(fx.motes(st, cam, 18, 1)), zmax: 1800, zmin: 150 });
};
PIP.LABS['fx-water-macro'] = t => {   // bug's-eye along the last stretch of the channel, the detail view
  const cam = { x: 20, y: -30, z: 235, f: 2000, focus: 520, ap: 10 }, st = baseSt(t, { water: 1.1, waterGlow: 1, hero: { climb: 1, petal: 1, flicker: 1, open: 1 } });
  return stage(cam, st, { items: [rootStem(st, 60)], fx: fx.water(st), zmax: 1100, zmin: 80, flecks: false, stones: false });
};
PIP.LABS['fx-water-dark'] = t => {   // glow 0: dark water carrying only moonlight, to check the dry/cool state
  const st = baseSt(t, { water: 1.1, waterGlow: 0 });
  return stage(CAM_WIDE, st, { items: [rootStem(st)], fx: fx.water(st) });
};

// -- the dipper pour: stub dipper (acorn cup) tipped over the ground, close camera
PIP.LABS['fx-pour'] = t => {
  const cam = { x: 6, y: -34, z: 140, f: 2600, focus: 330, ap: 12 }, k = ss(0, 1.3, t), tilt = lerp(0.1, 0.9, ss(0, 0.9, t));
  const lip = { x: 14, y: -34, z: 330 }, gnd = { x: 24, y: 0, z: 332 }, st = baseSt(t, { waterGlow: 0.9 });
  const dip = { z: 330.4, draw: c => { c.save(); c.translate(lip.x - 7, lip.y - 3); c.rotate(tilt);
    P.card(c, k2 => { k2.moveTo(-22, -10); k2.quadraticCurveTo(-26, 12, -6, 15); k2.quadraticCurveTo(8, 16, 12, 2); k2.lineTo(14, -6); k2.quadraticCurveTo(0, -10, -22, -10); k2.closePath(); }, P.lit([164, 112, 64], lip.x, lip.y, 330, 0.1), { lift: 1.5, edge: 0.4 });
    c.fillStyle = P.lit([90, 60, 38], lip.x, lip.y, 330, 0.05); c.beginPath(); c.ellipse(-8, -8, 14, 3, 0, 0, TAU); c.fill(); c.restore(); } };
  return stage(cam, st, { zmax: 900, zmin: 345, items: [dip], fx: fx.pour(lip, gnd, k, st), lights: [{ x: 18, y: -20, z: 316, col: [1, 0.66, 0.3], i: 0.9 * k, rad: 40, halo: 0 }] });
};
PIP.LABS['fx-pour-far'] = t => {   // the same pour from farther, wider, with a little depth blur
  const cam = { x: 0, y: -60, z: -60, f: 2200, focus: 380, ap: 22 }, k = ss(0, 1.3, t);
  const lip = { x: 14, y: -34, z: 380 }, gnd = { x: 24, y: 0, z: 382 }, st = baseSt(t, { waterGlow: 0.9 });
  return stage(cam, st, { zmax: 1400, fx: fx.pour(lip, gnd, k, st).concat(fx.motes(st, cam, 16, 1)), lights: [{ x: 18, y: -20, z: 366, col: [1, 0.66, 0.3], i: 0.9 * k, rad: 40, halo: 0 }] });
};
// -- the trickle: channel end into the hero root. t 0..4 water front reaching the end, trickle creeping to the root
PIP.LABS['fx-trickle'] = t => {
  const cam = { x: 14, y: -58, z: 150, f: 1500, focus: 410, ap: 8 };
  const w = lerp(0.9, 1.14, clamp(t / 4)), st = baseSt(t, { water: w, waterGlow: 1, hero: { climb: ss(1, 4, t), petal: ss(2.5, 4, t), flicker: 1, open: ss(2.5, 4, t) } });
  const spark = fx.sparkle(0, -6, 396, clamp((t - 2.4) / 2.2));
  return stage(cam, st, { zmax: 900, zmin: 40, flecks: false, gap: true, items: [rootStem(st, 46)], fx: fx.water(st).concat(spark) });
};
// -- motes, fireflies, moth, in the dark
PIP.LABS['fx-motes'] = t => {
  const cam = { x: 0, y: -50, z: 0, f: 2200, focus: 700, ap: 20 }, st = baseSt(t, { hero: { climb: 1, petal: 1, flicker: 1, open: 1 } });
  return stage(cam, st, { ambient: [0.2, 0.26, 0.5], zmax: 2000, items: [rootStem(st)],
    fx: [...fx.motes(st, cam, 44, 0.8), ...fx.fireflies(st, cam, 9), ...fx.moth(-150 + 40 * Math.sin(t * 0.7), -190 + 20 * Math.sin(t * 1.3), 900, t)] });
};
// -- puff, splash, sparkle, pebble on a row (each loops over 2 s with its own offset)
PIP.LABS['fx-puff-splash'] = t => {
  const cam = { x: 0, y: -30, z: 20, f: 2600, focus: 300, ap: 6 }, st = baseSt(t, { hero: { climb: 0.4, petal: 0, flicker: 1 } });
  const ph = o => ((t / 2 + o) % 1 + 1) % 1, fxi = [];
  fxi.push(...fx.puff(-70, -2, 300, ph(0.0), { scale: 1.1 }), ...fx.puff(-52, -40, 300, ph(0.5), { scale: 1.0, seed: 3, kind: 'breath' }));
  fxi.push(...fx.splash(-22, 0, 300, ph(0.1), { scale: 1.2 }));
  fxi.push(...fx.sparkle(16, -16, 300, ph(0.2), { scale: 0.6 }));
  fxi.push(...fx.pebble(50 + t * 6 % 20, 0, 300, t * 3, 4.2, {}), ...fx.pebble(30, 0, 300, 1, 3, { seed: 4 }), ...fx.pebble(74, 0, 300, 2.2, 2.4, { seed: 9 }));
  return stage(cam, st, { ambient: [0.3, 0.38, 0.65], zmax: 800, flecks: false, stones: false, lights: [{ x: 0, y: -50, z: 280, col: [1, 0.66, 0.3], i: 1.2, rad: 80, halo: 0 }], fx: fxi });
};

// -- the channel draining: the tail runs downstream, the water thins out behind it
PIP.LABS['fx-water-drain'] = t => {
  const st = baseSt(t, { water: 1.14, waterTail: lerp(0.15, 0.95, clamp(t / 6)), waterGlow: 1, pond: 0.5, hero: { climb: 1, petal: 0.7, flicker: 1, open: 1 } });
  return stage(CAM_WIDE, st, { items: [rootStem(st)], fx: fx.water(st) });
};
// -- a pebble let go at dipper height: falls, bounces, rolls to a stop (k = t / 2.2); a few resting pebbles for comparison
PIP.LABS['fx-pebble'] = t => {
  const cam = { x: 14, y: -9, z: 200, f: 2600, focus: 330, ap: 8 }, st = baseSt(t, { hero: { climb: 0.5, petal: 0.2, flicker: 1 } });
  return stage(cam, st, { zmax: 700, zmin: 215, flecks: false, stones: false, lights: [{ x: 0, y: -50, z: 300, col: [1, 0.66, 0.3], i: 1.0, rad: 90, halo: 0 }],
    fx: [...fx.pebble(-30, -26, 300, clamp(t / 2.2), { r: 4 }), ...fx.pebble(60, 0, 300, 0.5, 3.2, { seed: 5 }), ...fx.pebble(80, 0, 301, 2, 2.2, { seed: 9 })] });
};
// -- light arriving at the root: ground pulse, twinkles, motes climbing the stem
PIP.LABS['fx-sparkle'] = t => {
  const cam = { x: 0, y: -50, z: 120, f: 2300, focus: 400, ap: 8 }, st = baseSt(t, { hero: { climb: ss(0, 3, t), petal: ss(1.5, 3, t), flicker: 1, open: ss(1.5, 3, t) } });
  return stage(cam, st, { zmax: 900, zmin: 160, flecks: false, stones: false, items: [rootStem(st, 110)], fx: fx.sparkle(0, -6, 396, clamp(t / 3)) });
};
// -- raised camera over the last stretch of the channel: the ribbon, banks, pebbles and rim stones seen from above
PIP.LABS['fx-water-detail'] = t => {
  const cam = { x: 120, y: -46, z: 170, f: 2400, focus: 560, ap: 5 }, st = baseSt(t, { water: 1.1, waterGlow: 1, hero: { climb: 1, petal: 1, flicker: 1, open: 1 } });
  return stage(cam, st, { items: [], fx: fx.water(st), zmax: 900, zmin: 180 });
};

// -- the real garden (world.js) with the water in it, to judge the stream from low and far cameras (needs world.js, loaded by lab.html)
(() => {
  const WD = P.world, M = WD.chan(0), cx = M[0];
  const realStage = (cam, st, o = {}) => { st.cam = cam;
    const items = [...WD.sky(st), ...WD.hills(st), ...WD.ground(st, cam), ...WD.channel(st), ...fx.water(st), ...WD.flowers(st), ...WD.hero(st), ...WD.spout(st), ...WD.props(st), ...(o.fg ? WD.foreground(st, cam) : [])];
    return { cam, ambient: o.ambient || [0.22, 0.28, 0.54], lights: fx.lights(st), items, grade: { bloom: 0.3, vignette: 0.55, grain: 0.1 } }; };
  const realSt = (t, over = {}) => baseSt(t, Object.assign({ waterGlow: 1, pond: 1, hero: { climb: 0, petal: 0, flicker: 1, open: 0.4 }, flower: () => ({ climb: 0, petal: 0, flicker: 1, open: 0.4 }),
    leaf: { curl: 0.08, x: cx + 160, y: -14, z: M[2] - 390, rot: -0.9, free: 1, lift: 0.6 }, pinStone: { x: cx + 64, z: M[2] - 18, rot: 0.3 } }, over));
  // the burst at the cleft seen from the s18 camera: t 0..3 moves the front out along the channel
  PIP.LABS['fx-burst-low'] = t => realStage({ x: cx + 2, y: -8, z: M[2] - 120, f: 2400, focus: M[2] - 40, ap: 40 }, realSt(t, { water: 0.02 + 0.05 * clamp(t / 3) }));
  // the gush at the cleft from the s18 camera: t is seconds since release
  PIP.LABS['fx-gush'] = t => { const cam = { x: cx + 2, y: -8, z: M[2] - 230, f: 2400, focus: M[2] - 40, ap: 40 }, sc = realStage(cam, realSt(t, { water: 0.02 + 0.05 * clamp(t / 3) }));
    const g = fx.gush(cam, t, M[2] - 52); if (g) sc.items.push(g); return sc; };
  // the same, as a wide soft-edged sheet with a spray + foam ring where it lands (fx.splash's (x, y, z, t, k, o) form)
  const gushWide = soft => t => { const cam = { x: cx + 2, y: -8, z: M[2] - 230, f: 2400, focus: M[2] - 40, ap: 40 }, sc = realStage(cam, realSt(t, { water: 0.02 + 0.05 * clamp(t / 3) }));
    const g = fx.gush(cam, t, M[2] - 52, { width: 3, soft, hold: true }); if (g) { sc.items.push(g); sc.items.push(...fx.splash(g.foot[0], -0.5, g.foot[2], t, ss(0.3, 0.8, t), { scale: 1.6, lean: -6, crown: 0.5 })); } return sc; };
  PIP.LABS['fx-gush-wide'] = gushWide(1); PIP.LABS['fx-gush-wide-crisp'] = gushWide(0);
  // the burst's white water (s18): an aerated sheet (o.foam: white streaks through the body, thickest at the lip, a feathered top edge, round
  // drops), a landing that boils white with plain-water spray (splash pearl < 1 with crown), and a channel ribbon running white for its first
  // stretch (waterRibbon o.churn) with a broken foamy front. t: seconds since release.
  PIP.LABS['fx-burst-foam'] = t => { const cam = { x: cx + 2, y: -8, z: M[2] - 230, f: 2400, focus: M[2] - 40, ap: 40 }, sc = realStage(cam, realSt(t, { water: -1 }));
    const g = fx.gush(cam, t, M[2] - 52, { width: 2.4, soft: 0.75, power: 1.35, glow: 0.8, hold: true, lip: 3.6, spread: 13, to: [48, 22, -112], arc: 24, foam: 0.9, streaks: 0.35 }); if (!g) return sc;
    const f = g.foot, w = clamp(0.02 + 0.03 * t, 0, 0.12), pts = [[f[0], 0, f[2]]]; for (let i = 0; i <= 12; i++) pts.push(WD.chan(w * i / 12));
    sc.items.push(g, ...fx.splash(f[0], -0.5, f[2] - 1, t, ss(0.25, 0.6, t), { scale: 2.8, drops: 34, height: 1.6, glow: 0.6, crown: 0.8, rate: 1.3, pearl: 0.25 }),
      ...fx.waterRibbon(pts, { t, width: 13, taper: [1.5, 1.05], lift: 3.2, glow: 1.3, nose: 0.6, churn: 1 })); return sc; };
  // the landing splash alone on the dry trench bed and on the turf, strength ramping 0 -> 1 over t 0..2
  PIP.LABS['fx-splash-landing'] = t => { const p = WD.chan(0.35), cam = { x: p[0] + 6, y: -80, z: p[2] - 120, f: 2000, focus: p[2], ap: 10 }, sc = realStage(cam, realSt(t, { water: 0.2 }));
    sc.items.push(...fx.splash(p[0], WD.bedY(0.35), p[2], t, ss(0, 2, t), { scale: 1.2 }), ...fx.splash(p[0] + 30, -0.5, p[2] + 14, t, 1, { scale: 0.7, glow: 0, seed: 3 })); return sc; };
  // a low camera on the bank of the channel looking up it (the same spot as world-channel-low), water running
  const zAt = z => { for (let u = 0; u <= 1; u += 0.001) { const q = WD.chan(u); if (q[2] <= z) return q; } return WD.chan(1); };
  const camLow = (zt, y = -16) => { const p = zAt(zt); return { x: p[0] + 4, y, z: p[2] - 220, f: 1500, focus: p[2] - 20, ap: 10 }; };
  PIP.LABS['fx-water-low-bank'] = t => realStage(camLow(1500), realSt(t, { water: 1.1 }));
  PIP.LABS['fx-water-low-bank2'] = t => realStage(camLow(1000, -12), realSt(t, { water: 1.1 }));
  // a stretch of lit channel from the bank (the banks and rim stones shimmer where the water runs past them; the stream stays clear of the glints)
  PIP.LABS['fx-shimmer'] = t => realStage(camLow(760, -20), realSt(t, { water: 1.1, waterTail: 0.3 + 0.1 * clamp(t / 4) }));
  // the sunken trench in a three-quarter view from above (dry, then with the water running and its front just upstream of the frame
  // centre: t 0..4 moves the front through it), and from low on the bank. The frame is tilted down by a lens shift (every item moves up).
  const tilt = (sc, dy) => { sc.items = sc.items.map(it => it.screen ? it : Object.assign({}, it, { draw: (c, s, t) => { c.save(); c.translate(0, -dy / s); it.draw(c, s, t); c.restore(); } }));
    sc.items.push({ z: 1e12, screen: true, draw(c) { c.fillStyle = 'rgb(7,12,20)'; c.fillRect(0, 0, 1920, 1080); } }); return sc; };
  const q3 = (u, dx, dy, dist) => { const p = WD.chan(u); return { x: p[0] + dx, y: dy, z: p[2] - dist, f: 2400, focus: p[2], ap: 8 }; };
  const view = (u, dx, dy, dist) => { const c = q3(u, dx, dy, dist); return { c, shift: -dy * c.f / dist - 40 }; };
  const trench = (u, dx, dy, dist, w) => t => { const v = view(u, dx, dy, dist); return tilt(realStage(v.c, realSt(t, { water: w === undefined ? -1 : w + 0.03 * t })), v.shift); };
  PIP.LABS['fx-trench-dry'] = trench(0.83, 60, -110, 380);
  PIP.LABS['fx-trench-dry-low'] = trench(0.83, 40, -30, 300);
  PIP.LABS['fx-trench-wet'] = trench(0.83, 60, -110, 380, 0.78);
  PIP.LABS['fx-trench-wet-low'] = trench(0.83, 40, -30, 300, 0.78);
  PIP.LABS['fx-trench-bend'] = trench(0.6, -60, -90, 420);
  PIP.LABS['fx-trench-bend-wet'] = trench(0.6, -60, -90, 420, 0.58);
  // the landing splash (fx.splash's (x, y, z, t, k, o) form) on the dry trench bed, strength ramping 0 -> 1 over t 0..2, and a small
  // cool one at full strength on the turf beside it; three-quarter view from above
  PIP.LABS['fx-splash-landing'] = t => { const u = 0.83, p = WD.chan(u), v = view(u, 40, -80, 260), sc = realStage(v.c, realSt(t, { water: -1 }));
    sc.items.push(...fx.splash(p[0], WD.bedY(u), p[2], t, ss(0, 2, t), { scale: 1.2 }), ...fx.splash(p[0] + 34, -0.3, p[2] - 10, t, 1, { scale: 0.7, glow: 0, seed: 3 })); return tilt(sc, v.shift); };
  // -- the bloom wave on the real garden at home: the garden dark, then Pip's flower relights (t 0 to 0.6) and the wave runs out through the grass
  //    over 1.5 s (k = (t - 0.35) / 1.5), each garden flower relighting as the front reaches its root. fx-bloomwave is the close home lens (s20's
  //    pulled-back frame), fx-bloomwave-wide the raised wide over the home end of the garden (s22's); -none drops the wave (for the cost check).
  const BW = { x: 0, z: 400, rad: 300, radW: 560 }, bwK = t => clamp((t - 0.35) / 1.5), bwR = (k, rad) => rad * (1 - Math.pow(1 - k, 1.7));
  const bwD = WD.FLOWERS.map(f => Math.hypot(f.x - BW.x, f.z - BW.z));
  const bwSt = (t, rad) => { const R = bwR(bwK(t), rad); return realSt(t, { water: 1.1, waterGlow: ss(0.1, 0.6, t), pond: 0.4, hero: { climb: ss(0, 0.45, t), petal: ss(0.25, 0.6, t), flicker: 1, open: lerp(0.3, 1, ss(0.2, 0.7, t)) },
    flower: i => { const on = ss(bwD[i] - 10, bwD[i] + 130, R); return { climb: on, petal: on, flicker: 1, open: lerp(0.35, 0.9, on) }; } }); };
  const bwStage = (cam, on, rad = BW.rad) => t => { const sc = realStage(cam, bwSt(t, rad), { ambient: [0.18, 0.23, 0.46], fg: true }); if (on) sc.items.push(...fx.bloomWave(BW.x, BW.z, bwK(t), { rad: rad, t })); return sc; };
  const BW_CLOSE = { x: -8, y: -64, z: -40, f: 2400, focus: 402, ap: 40 }, BW_WIDE = { x: -20, y: -112, z: -40, f: 2100, focus: 700, ap: 10 };
  PIP.LABS['fx-bloomwave'] = bwStage(BW_CLOSE, true); PIP.LABS['fx-bloomwave-none'] = bwStage(BW_CLOSE, false);
  PIP.LABS['fx-bloomwave-wide'] = bwStage(BW_WIDE, true, BW.radW); PIP.LABS['fx-bloomwave-wide-none'] = bwStage(BW_WIDE, false, BW.radW);
  // -- the spray at the spout, from the s18 camera after its pull-back: at t = 0.2 the gap opens, the sheet of water pours out of the cleft
  //    (fx.gush, as the burst draws it) and the spray bursts from the front of the gap (in front of the jamb stones, where the sheet leaves
  //    them) toward the lens and right, over 1.6 s (k = (t - 0.2) / 1.6).
  //    fx-spray-close is a lower, nearer lens at the same spot; -none drops the spray (for the cost check).
  const SPR = { x: M[0] + 8, y: -14, z: 2634 }, sprK = t => clamp((t - 0.2) / 1.6);
  const sprStage = (cam, on) => t => { const rel = t - 0.2, sc = realStage(cam, realSt(t, { water: rel > 0 ? 0.02 + 0.03 * clamp(rel / 2) : -1, pond: 1 }));
    sc.lights.push({ x: M[0] - 2, y: -20, z: 2682, col: [1, 0.62, 0.26], i: 0.84 + 0.6 * Math.exp(-Math.max(rel, 0) * 2.6) * (rel > 0 ? 1 : 0), rad: 170, halo: 74 });
    const g = rel > 0 && fx.gush(cam, rel, 2640, { width: lerp(1.6, 3.0, ss(0.1, 2.4, rel)), soft: 0.75, power: 1.35, glow: 0.8, hold: true, lip: 3.2, spread: 13, to: [48, 22, -112], arc: 22, foam: 0.9, streaks: 0.35 });
    if (g) sc.items.push(g);
    if (on) sc.items.push(...fx.spray(SPR.x, SPR.y, SPR.z, sprK(t), { dir: [0.8, -1], spread: 0.75, h: 24, reach: 110, t }));
    return sc; };
  const SPR_CAM = { x: M[0] + 60, y: -50, z: M[2] - 28 - 385, f: 2400, focus: M[2] - 28 + 42, ap: 26 }, SPR_CLOSE = { x: M[0] + 34, y: -20, z: M[2] - 230, f: 2400, focus: 2640, ap: 30 };
  PIP.LABS['fx-spray'] = sprStage(SPR_CAM, true); PIP.LABS['fx-spray-none'] = sprStage(SPR_CAM, false); PIP.LABS['fx-spray-close'] = sprStage(SPR_CLOSE, true);
  // -- shafts and spill on the real dark garden: moon shafts over the s11-like high wide with warm shafts up from the trapped glow at the spout,
  //    and a warm pool spilled by Pip's flower on the home ground from the close home lens
  PIP.LABS['fx-shafts-real'] = t => { const cam = { x: -200, y: -260, z: -500, f: 2400, focus: 1500, ap: 20 }, st = realSt(t, { water: -1, pond: 1 }), sc = realStage(cam, st, { ambient: [0.18, 0.23, 0.46] });
    sc.items.push(...fx.shafts(st, cam, { from: 'moon', k: 0.6 }), ...fx.shafts(st, cam, { from: [M[0] - 30, -60, 2790], k: 0.8, n: 5, h: 260 })); return sc; };
  PIP.LABS['fx-spill-real'] = t => { const cam = { x: -8, y: -64, z: -40, f: 2400, focus: 402, ap: 40 }, st = realSt(t, { water: -1, hero: { climb: 1, petal: 1, flicker: 1, open: 1 } }), sc = realStage(cam, st, { ambient: [0.18, 0.23, 0.46], fg: true });
    sc.items.push(...fx.spill(0, -140, 400, { rad: 150, k: 0.7 })); return sc; };
  // wide and high-ish, the stream half way home (the shape of the s19 crane)
  PIP.LABS['fx-water-wide-real'] = t => realStage({ x: -170, y: -230, z: -640, f: 2400, focus: 1000, ap: 20 }, realSt(t, { water: 0.55 + 0.1 * clamp(t / 6) }), { fg: true });
})();
// -- motes drifting past one warm light in a dark scene: the ones that pass it warm and brighten, the rest stay faint cool specks (over time)
PIP.LABS['fx-motes-lit'] = t => {
  const cam = { x: 0, y: -60, z: 0, f: 2200, focus: 380, ap: 14 }, st = baseSt(t);
  const lamp = { x: 0, y: -40, z: 380, col: [1, 0.6, 0.22], i: 1.4, rad: 90, halo: 0 };
  const bulb = { z: 380, draw: c => { c.fillStyle = P.lit([255, 190, 90], 0, -40, 380, 1.0); c.beginPath(); c.arc(0, -40, 9, 0, TAU); c.fill(); } };   // the glow itself, so the light has a source
  return stage(cam, st, { ambient: [0.2, 0.26, 0.5], zmax: 1800, flecks: false, stones: false, lights: [lamp], items: [bulb], fx: fx.motes(st, cam, 110, 0.5) });
};
// -- the v8 light builders on a dark stage: a glow (a bud on a stub) with its spill on the ground; moon shafts and a glow's shafts in a dark wide
const glowBud = (x, y, z, petal = 1) => ({ z, draw: c => { c.fillStyle = P.lit([120, 96, 62], x, 0, z, 0.02); c.fillRect(x - 2, y, 4, -y);
  c.fillStyle = P.lit([255, 186, 92], x, y, z, 0.9 * petal); c.beginPath(); c.ellipse(x, y, 11, 13, 0, 0, TAU); c.fill(); } });
PIP.LABS['fx-spill'] = t => {
  const cam = { x: 0, y: -110, z: 0, f: 2200, focus: 520, ap: 10 }, st = baseSt(t, { hero: { climb: 1, petal: 1, flicker: 1, open: 1 } });
  const gx = 0, gy = -70, gz = 520, k = ss(0.2, 1.2, t), lamp = { x: gx, y: gy, z: gz, col: [1, 0.6, 0.22], i: 1.5 * k, rad: 150, halo: 0 };
  return stage(cam, st, { ambient: [0.2, 0.26, 0.5], zmax: 1300, flecks: false, stones: false, lights: [lamp], items: [glowBud(gx, gy, gz)],
    fx: fx.spill(gx, gy, gz, { rad: 150, k }) });
};
PIP.LABS['fx-shafts'] = t => {   // moon shafts over the dark garden, and a glow's shafts fanning up from a bud in front of the wide
  const cam = { x: 0, y: -60, z: -120, f: 2200, focus: 500, ap: 14 }, st = baseSt(t);
  const gz = 420, gy = -20;
  return stage(cam, st, { ambient: [0.2, 0.26, 0.5], zmax: 1500, flecks: false, stones: false, items: [glowBud(0, gy, gz)],
    fx: [...fx.shafts(st, cam, { from: 'moon', k: 0.6 }), ...fx.shafts(st, cam, { from: [0, gy, gz], k: 0.8, n: 5, h: 260 })] });
};
// -- the leading edge close up (t moves the front), and a hand-placed waterRibbon (the helper other modules use) on the plain stage
PIP.LABS['fx-water-front'] = t => {
  const w = 0.6 + 0.02 * t, F = fx.chanU(w), cam = { x: F.x + 10, y: -22, z: F.z - 200, f: 2400, focus: F.z, ap: 6 }, st = baseSt(t, { water: w, waterGlow: 1 });
  return stage(cam, st, { fx: fx.water(st), zmax: F.z + 900, zmin: F.z - 120 });
};
PIP.LABS['fx-ribbon'] = t => {
  const cam = { x: -20, y: -24, z: 120, f: 2400, focus: 330, ap: 6 }, st = baseSt(t, { waterGlow: 1 });
  const pts = [[-90, 420], [-40, 360], [10, 340], [40, 300], [70, 280]];
  return stage(cam, st, { flecks: false, stones: false, zmax: 900, zmin: 150, fx: fx.waterRibbon(pts, { t, width: 5, to: 0.55 + 0.4 * clamp(t / 4) }).concat(fx.waterRibbon([[-120, 330], [-60, 300], [-20, 250]], { t, width: 3, cool: true })) });
};
})();
