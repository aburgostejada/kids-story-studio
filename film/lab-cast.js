// lab scenes for cast.js: a plain dusk stage (sky, hills, mossy ground strips, pebbles, one warm light) so only core.js + cast.js are exercised.
(() => {
const P = PIP, C = P.cast, { TAU, clamp, lerp, ss, hash } = P;
const blobPath = (pts) => C._h.blob(pts).path;

function stage(o, t) {
  const z0 = o.z ?? 400, camx = o.camx ?? 0, camy = o.camy ?? -24, f = o.f ?? 2400, camz = o.camz ?? 0;
  const cam = { x: camx, y: camy, z: camz, f, focus: o.focus ?? z0, ap: o.ap ?? 26 };
  const L = o.lights ?? [{ x: 40, y: -28, z: z0 - 20, col: [1, 0.66, 0.3], i: 2.4, rad: 55, halo: 90 }];
  const ambient = o.ambient ?? [0.3, 0.38, 0.65];
  const items = [];
  items.push({ z: 1e6, screen: true, draw: c => { const g = c.createLinearGradient(0, 0, 0, P.H); g.addColorStop(0, '#0a1440'); g.addColorStop(0.55, '#1f3066'); g.addColorStop(1, '#3a4a86'); c.fillStyle = g; c.fillRect(0, 0, P.W, P.H);
    c.save(); c.fillStyle = 'rgba(236,240,255,0.95)'; c.beginPath(); c.arc(1500, 190, 70, 0, TAU); c.fill(); c.restore(); } });
  const hills = [[9000, [8, 30, 78], 900, 600], [5500, [14, 38, 84], 700, 380], [3200, [20, 48, 80], 420, 220]];
  hills.forEach(([z, col, w, h], k) => items.push({ z, draw: c => { c.fillStyle = P.lit(col, 0, -50, z); c.beginPath(); c.moveTo(-4000, 400);
    for (let i = 0; i <= 40; i++) { const x = -4000 + i * 200; c.lineTo(x, -h * (0.5 + 0.5 * Math.sin(i * 0.5 + k * 2) * 0.6 + 0.3 * Math.sin(i * 1.3 + k))); } c.lineTo(4000, 400); c.closePath(); c.fill(); } }));
  // ground strips (nearer strips cover the farther ones). o.noNear leaves out the strips in front of the subject, so a foot that sank
  // below the ground plane would show instead of being hidden by the turf in front of it.
  let zz = 3000, k = 0;
  while (zz > 90) { const z = zz; if (o.noNear && z < z0 + 1) break;
    items.push({ z, draw: c => { const g = c.createLinearGradient(-500, 0, 500, 0); for (let i = 0; i <= 14; i++) { const x = -500 + i * (1000 / 14); g.addColorStop(i / 14, P.lit([54, 80, 50], x, 0, z, 0.01)); }
      c.fillStyle = g; c.fillRect(-4000, 0, 8000, 500); c.fillStyle = g; c.fillRect(-4000, 0, 8000, 500); } });
    zz *= 0.985; k++; }
  // pebbles and tufts for planted-foot reference
  for (let i = 0; i < 70; i++) { const x = (hash(i, 8) - 0.5) * 560, z = z0 + 14 + hash(i, 9) * 200 + (Math.abs(x) > 90 ? -(30 + hash(i, 14) * 40) : 0), r = 1.2 + hash(i, 10) * 3.2;
    items.push({ z, draw: c => { const col = [92 + hash(i, 11) * 40, 98 + hash(i, 12) * 34, 106 + hash(i, 13) * 34];
      const pts = Array.from({ length: 8 }, (_, j) => { const a = j / 8 * TAU, rr = r * (0.8 + 0.3 * hash(i * 9 + j, 2)); return [x + Math.cos(a) * rr * 1.5, -r * 0.55 + Math.sin(a) * rr * 0.62]; });
      P.card(c, blobPath(pts), P.lit(col, x, -r * 0.5, z), { lift: 0.6, edge: 0.25 }); } }); }
  for (let i = 0; i < 40; i++) { const x = (hash(i, 20) - 0.5) * 600, z = z0 + 60 + hash(i, 21) * 500, hh = 6 + hash(i, 22) * 14;
    items.push({ z, draw: c => { c.fillStyle = P.lit([40, 84, 52], x, -hh / 2, z); for (let b = -1; b <= 1; b++) { c.beginPath(); c.moveTo(x + b * 2 - 1, 0); c.quadraticCurveTo(x + b * 3, -hh * 0.6, x + b * 4 + hash(i, b + 5) * 3, -hh); c.quadraticCurveTo(x + b * 2 + 1, -hh * 0.5, x + b * 2 + 1.2, 0); c.fill(); } } }); }
  // glowing bulb standing in for the hero flower
  if (o.bulb !== false) for (const l of L) items.push({ z: l.z + 10, draw: c => { c.fillStyle = 'rgb(255,200,110)'; c.beginPath(); c.ellipse(l.x, l.y, 5, 7, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,240,200,0.9)'; c.beginPath(); c.ellipse(l.x - 1, l.y - 1.5, 2.2, 3, 0, 0, TAU); c.fill(); } });
  // reference ground line: a thin bright line whose top edge is exactly y = 0 at the subject's depth, just behind the subject
  if (o.groundLine) { const gz = z0 + 0.95; items.push({ z: gz, draw: c => { c.fillStyle = 'rgba(120,255,236,0.9)'; c.fillRect(-4000, 0, 8000, 0.14);
    c.fillStyle = 'rgba(120,255,236,0.25)'; for (let x = -400; x <= 400; x += 10) c.fillRect(x - 0.05, -1.5, 0.1, 1.5); } }); }
  return { cam, ambient, lights: L, items, grade: o.grade };
}
const add = (sc, items) => { sc.items.push(...items); return sc; };
const LABS = P.LABS;

LABS['cast-lineup'] = t => { const sc = stage({ camx: 0, camy: -26, lights: [{ x: 14, y: -30, z: 380, col: [1, 0.66, 0.3], i: 2.2, rad: 60, halo: 100 }] }, t);
  return add(sc, [...C.pip({ x: -58, z: 400, face: 1, look: [0.5, 0.05], brow: 0.35, mouth: 'smile', mouthOpen: 0.25 }), ...C.bram({ x: 2, z: 404, face: 1, look: [-0.1, 0], mouth: 'smile' }),
    ...C.luma({ x: 60, z: 398, face: -1, wings: 1, flap: t * 14, y: 0 })]); };
LABS['cast-lineup-mirror'] = t => { const sc = stage({ camx: 0, camy: -26, lights: [{ x: -14, y: -30, z: 380, col: [1, 0.66, 0.3], i: 2.0, rad: 60, halo: 100 }] }, t);
  return add(sc, [...C.pip({ x: 60, z: 400, face: -1, look: [-0.5, 0.05], dipper: { tilt: 0.2, water: 0.7 }, mouth: 'smile' }), ...C.bram({ x: 2, z: 404, face: -1, look: [0.1, 0], mouth: 'laugh', mouthOpen: 0.6, eyes: 0.3, brow: 0.8 }),
    ...C.luma({ x: -58, y: -26, z: 398, face: 1, wings: 1, flap: t * 40, hover: true })]); };
LABS['cast-lineup-dark'] = t => { const sc = stage({ camx: 0, camy: -26, ambient: [0.2, 0.26, 0.5], lights: [{ x: 14, y: -30, z: 380, col: [1, 0.66, 0.3], i: 1.2, rad: 40, halo: 70 }] }, t);
  return add(sc, [...C.pip({ x: -58, z: 400, face: 1, look: [0.5, 0.05], brow: 0.35, mouth: 'smile', mouthOpen: 0.25 }), ...C.bram({ x: 2, z: 404, face: 1, look: [-0.1, 0], mouth: 'smile' }),
    ...C.luma({ x: 60, z: 398, face: -1, wings: 1, flap: t * 14, y: 0 })]); };

// acting cycle (0..6): smile, yawn, worried, frown, grit pulling, laugh
const ACT = [
  { mouth: 'smile', mouthOpen: 0.3, brow: 0.7, eyes: 1, look: [0.2, -0.05], lean: 0.02, headTilt: 0.05, squash: 1 },
  { mouth: 'yawn', mouthOpen: 1, brow: 0.1, eyes: 0.35, look: [0, 0], lean: -0.1, headTilt: -0.12, squash: 1.04, arms: 'up' },
  { mouth: 'flat', mouthOpen: 0, brow: -1, eyes: 1, look: [0.5, 0.3], lean: -0.04, headTilt: 0.12, squash: 0.97 },
  { mouth: 'frown', mouthOpen: 0, brow: -0.2, eyes: 0.75, look: [0.4, 0.1], lean: 0.05, headTilt: -0.06, squash: 0.98 },
  { mouth: 'grit', mouthOpen: 0.9, brow: -0.4, eyes: 0.8, look: [0.45, 0], lean: 0.28, headTilt: 0.04, squash: 0.9, arms: 'pull' },
  { mouth: 'laugh', mouthOpen: 1, brow: 1, eyes: 0.1, look: [0, -0.15], lean: -0.12, headTilt: -0.15, squash: 1.0, arms: 'laugh' } ];
function actPose(t, base) { const tt = ((t % 6) + 6) % 6, s = Math.floor(tt), u = tt - s, a = ACT[s], b = ACT[(s + 5) % 6], k = ss(0, 0.28, u), L = (x, y) => lerp(x, y, k);
  const pose = Object.assign({ x: 0, z: 400, face: 1 }, base, { mouth: a.mouth, mouthOpen: a.mouthOpen * (k < 1 ? 1 : 1), brow: L(b.brow, a.brow), eyes: L(b.eyes, a.eyes), look: [L(b.look[0], a.look[0]), L(b.look[1], a.look[1])],
    lean: L(b.lean, a.lean), headTilt: L(b.headTilt, a.headTilt), squash: L(b.squash, a.squash) });
  if (a.mouth === 'yawn') pose.mouthOpen = Math.sin(Math.PI * clamp(u * 1.05)) ** 0.7;
  if (a.mouth === 'laugh') { pose.mouthOpen = 0.6 + 0.4 * Math.sin(t * 20); pose.squash = 1 + 0.06 * Math.sin(t * 20); pose.y = -1.2 * Math.abs(Math.sin(t * 10)); pose.headTilt = -0.15 + 0.05 * Math.sin(t * 20); }
  if (a.mouth === 'grit') { pose.squash = 0.9 + 0.02 * Math.sin(t * 34); }
  const px = pose.x, f = pose.face;
  if (a.arms === 'up') { const e = Math.sin(Math.PI * clamp(u * 1.1)); pose.armR = { reach: [px + f * (8 + 3 * e), -50 - 2 * e] }; pose.armL = { reach: [px - f * 6, -48 - 3 * e] }; }
  if (a.arms === 'pull') { pose.armR = { reach: [px + f * 26, -17] }; pose.armL = { reach: [px + f * 25, -13] }; }
  if (a.arms === 'laugh') { pose.armR = { reach: [px + f * 8, -13] }; pose.armL = { sh: -0.5, el: 0.2 }; }
  return pose; }
LABS['cast-pip-acting'] = t => { const sc = stage({ camx: 0, camy: -22, f: 4200, z: 400, lights: [{ x: 26, y: -34, z: 380, col: [1, 0.66, 0.3], i: 2.0, rad: 55, halo: 80 }] }, t);
  return add(sc, C.pip(actPose(t, { x: 0, z: 400 }))); };

LABS['cast-pip-walk'] = t => { const ph = t * 0.9, stride = 8, x = -20 + C.walkAdvance(stride) * ph; const sc = stage({ camx: x + 14, camy: -22, f: 3600, lights: [{ x: x + 40, y: -30, z: 380, col: [1, 0.66, 0.3], i: 2.0, rad: 55, halo: 80 }] }, t);
  return add(sc, C.pip({ x, z: 400, walk: ph, stride, face: 1, look: [0.3, 0], brow: 0.5, mouth: 'smile', mouthOpen: 0.2 })); };
LABS['cast-bram-walk'] = t => { const ph = t * 0.7, stride = 9, x = -20 + C.walkAdvance(stride) * ph; const sc = stage({ camx: x + 10, camy: -18, f: 3600, lights: [{ x: x + 45, y: -30, z: 380, col: [1, 0.66, 0.3], i: 2.0, rad: 55, halo: 80 }] }, t);
  return add(sc, C.bram({ x, z: 400, walk: ph, stride, face: 1, look: [0.3, 0], brow: 0.3, mouth: 'smile' })); };
LABS['cast-bram-push'] = t => { const k = ss(0, 1, clamp(t / 1.2)), x = 0; const sc = stage({ camx: 22, camy: -18, f: 3600, lights: [{ x: 70, y: -30, z: 380, col: [1, 0.66, 0.3], i: 2.0, rad: 55, halo: 80 }] }, t);
  const rock = c => { const pts = [[50, 0], [48, -8], [54, -16], [64, -19], [74, -14], [77, -5], [72, 0]]; P.card(c, blobPath(pts.map(([a, b]) => [a + 0, b])), P.lit([70, 66, 76], 62, -10, 400), { lift: 1.4, edge: 0.3 }); };
  return add(sc, [{ z: 399, draw: rock }, ...C.bram({ x, z: 400, brace: k, push: k * (0.7 + 0.3 * Math.sin(t * 13)), face: 1, look: [0.5, 0.1], brow: -0.4, mouth: 'grit', mouthOpen: 0.6, eyes: 0.8, head: 0.3 })]); };
LABS['cast-bram-close'] = t => { const sc = stage({ camx: 14, camy: -18, camz: 250, f: 2400, z: 400, focus: 400, ap: 8, bulb: false, lights: [{ x: 44, y: -26, z: 380, col: [1, 0.66, 0.3], i: 1.6, rad: 45, halo: 70 }] }, t);
  return add(sc, C.bram({ x: 0, z: 400, face: 1, look: [0.3, 0.1], brow: 0.3, mouth: 'smile' })); };
LABS['cast-bram-rest'] = t => { const sc = stage({ camx: 0, camy: -18, f: 3600 }, t); return add(sc, C.bram({ x: 0, z: 400, dome: 1, eyes: 0.25, brow: 0.3, mouth: 'smile', head: 0.6 })); };
LABS['cast-luma-flap'] = t => { const sc = stage({ camx: 0, camy: -36, f: 5200, lights: [{ x: 24, y: -40, z: 380, col: [1, 0.66, 0.3], i: 2.0, rad: 55, halo: 80 }] }, t);
  return add(sc, C.luma({ x: 0, y: -34, z: 400, face: 1, wings: 1, flap: t * TAU * 6, hover: true, antL: 0.0, antR: 0.0 })); };
LABS['cast-luma-land'] = t => { const k = ss(0, 1, clamp((t - 0.2) / 1.2)), fold = ss(0, 1, clamp((t - 1.5) / 1.3)); const sc = stage({ camx: 6, camy: -22, f: 4200, lights: [{ x: 30, y: -34, z: 380, col: [1, 0.66, 0.3], i: 2.0, rad: 55, halo: 80 }] }, t);
  const flying = t < 1.5;
  return add(sc, C.luma({ x: lerp(-30, 0, k), y: lerp(-40, 0, k * k), z: 400, face: 1, wings: flying ? 1 : 1 - fold * 0.2, flap: flying ? t * TAU * 5 : TAU * 0.25, fold, hover: k < 0.9, hold: t > 2.8 ? { x: 13, y: -4.5 } : undefined })); };
LABS['cast-closeup'] = t => { const sc = stage({ camx: 0, camy: -30, camz: 289, f: 2400, z: 400, focus: 400, ap: 8, bulb: false, lights: [{ x: 30, y: -30, z: 372, col: [1, 0.66, 0.3], i: 1.7, rad: 45, halo: 70 }] }, t);
  return add(sc, C.pip({ x: 0, z: 400, face: 1, look: [0.2, 0.05], brow: 0.5, mouth: 'smile', mouthOpen: 0.25, headTilt: 0.04 })); };
LABS['cast-luma-close'] = t => { const sc = stage({ camx: 4, camy: -14, camz: 342, f: 2400, z: 400, focus: 400, ap: 8, bulb: false, lights: [{ x: 26, y: -22, z: 380, col: [1, 0.66, 0.3], i: 1.7, rad: 45, halo: 70 }] }, t);
  return add(sc, C.luma({ x: 0, y: -4, z: 400, face: 1, wings: 1, flap: 0.5, hover: false, look: [0.3, 0.1], brow: 0.5, mouth: 'smile' })); };
LABS['cast-bram-close-dark'] = t => { const sc = stage({ camx: 14, camy: -18, camz: 250, f: 2400, z: 400, focus: 400, ap: 8, bulb: false, ambient: [0.18, 0.24, 0.48], lights: [{ x: -30, y: -26, z: 380, col: [1, 0.66, 0.3], i: 1.3, rad: 40, halo: 70 }] }, t);
  return add(sc, C.bram({ x: 0, z: 400, face: 1, look: [-0.3, 0.1], brow: -0.4, mouth: 'flat' })); };
LABS['cast-closeup-dark'] = t => { const sc = stage({ camx: 0, camy: -30, camz: 289, f: 2400, z: 400, focus: 400, ap: 8, bulb: false, ambient: [0.16, 0.22, 0.45], lights: [{ x: -34, y: -26, z: 372, col: [1, 0.66, 0.3], i: 1.3, rad: 38, halo: 70 }] }, t);
  return add(sc, C.pip({ x: 0, z: 400, face: 1, look: [-0.3, 0.1], brow: -0.5, mouth: 'flat', headTilt: -0.05 })); };
LABS['cast-pip-misc'] = t => { const sc = stage({ camx: 0, camy: -22, f: 3400 }, t), pip = (o) => C.pip(Object.assign({ z: 400 }, o));
  const k = Math.sin(t * 2) * 0.5 + 0.5; return add(sc, [...pip({ x: -44, sit: 1, mouth: 'smile' }), ...pip({ x: 0, dipper: { tilt: 0.0, water: 0.6 }, mouth: 'smile', brow: 0.5, look: [0.8, 0.2] }),
    ...pip({ x: 44, dipper: { tilt: 1.1, water: 0.8 }, armR: { reach: [66, -26] }, lean: 0.2, mouth: 'o', mouthOpen: 0.5 }), ...pip({ x: 88, onBack: 0.6, mouth: 'o', eyes: 0.9, brow: -0.6 })]); };

// anchors: markers at the world points other modules can ask for
LABS['cast-anchors'] = t => { const sc = stage({ camx: 0, camy: -26, f: 3000, bulb: false }, t);
  const pp = { x: -46, z: 400, face: 1, dipper: { tilt: 0.9, water: 0.6 }, armR: { reach: [-22, -18] }, mouth: 'smile' }, bp = { x: 8, z: 400, face: 1, brace: 0.5 }, lp = { x: 56, y: -20, z: 400, face: -1, hover: true, flap: t * 30 };
  const mk = (pts) => ({ z: 399, draw: c => { for (const [p, col] of pts) { if (!p) continue; c.fillStyle = col; c.beginPath(); c.arc(p[0], p[1], 0.9, 0, TAU); c.fill(); } } });
  return add(sc, [...C.pip(pp), ...C.bram(bp), ...C.luma(lp), mk([[C.anchor('pip', pp, 'lip'), '#ff3030'], [C.anchor('pip', pp, 'mittR'), '#30ff30'], [C.anchor('pip', pp, 'head'), '#3030ff'], [C.anchor('pip', pp, 'sprout'), '#ffff30'],
    [C.anchor('pip', pp, 'footL'), '#30ffff'], [C.anchor('pip', pp, 'footR'), '#ff30ff'], [C.anchor('bram', bp, 'head'), '#ff3030'], [C.anchor('bram', bp, 'front'), '#30ff30'], [C.anchor('bram', bp, 'back'), '#ffff30'], [C.anchor('luma', lp, 'body'), '#ff3030'], [C.anchor('luma', lp, 'head'), '#30ff30'], [C.anchor('luma', lp, 'wingtip'), '#ffff30']])]); };

// ---- contact sheets: several poses side by side in one frame ----
function sheet(name, n, spacing, f, poseFn, ex = {}) {
  LABS[name] = t => { const sc = stage({ camx: 0, camy: ex.camy ?? -22, f, lights: [{ x: 0, y: -34, z: 372, col: [1, 0.66, 0.3], i: 1.4, rad: 55, halo: 80 }], bulb: false, ap: 10 }, t);
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * spacing; sc.items.push(...poseFn(i, x, t)); }
    return sc; }; }
sheet('cast-pip-sheet', 6, 38, 2900, (i, x, t) => C.pip(actPose(i + 0.75 + (t > 1 ? 0.2 : 0), { x, z: 400 })));
sheet('cast-pip-dipper', 4, 44, 3200, (i, x, t) => C.pip({ x, z: 400, dipper: { tilt: [0, 0.5, 1.0, 1.4][i], water: [0.95, 0.6, 0.45, 0.25][i] }, armR: { reach: [x + 15, -12 - i * 2] }, lean: 0.05 * i, mouth: 'smile', look: [0.7, 0.3] }));
// dipper tilt sweep with the 'lip' anchor marked (red): the pour point must sit on the cup's low lip
LABS['cast-pip-dipper-lip'] = t => { const sc = stage({ camx: 0, camy: -22, f: 3200, lights: [{ x: 0, y: -34, z: 372, col: [1, 0.66, 0.3], i: 1.4, rad: 55, halo: 80 }], bulb: false, ap: 10 }, t), pts = [];
  for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 44, pose = { x, z: 400, dipper: { tilt: [0, 0.5, 1.0, 1.4][i], water: [0.95, 0.6, 0.45, 0.25][i] }, armR: { reach: [x + 15, -12 - i * 2] }, lean: 0.05 * i, mouth: 'smile', look: [0.7, 0.3] };
    sc.items.push(...C.pip(pose)); pts.push([C.anchor('pip', pose, 'lip'), '#ff2020']); }
  sc.items.push({ z: 399, draw: c => { for (const [p, col] of pts) { c.fillStyle = col; c.beginPath(); c.arc(p[0], p[1], 0.7, 0, TAU); c.fill(); } } }); return sc; };
sheet('cast-pip-sit', 3, 46, 3200, (i, x, t) => C.pip({ x, z: 400, sit: [1, 0.5, 0][i], mouth: 'smile', look: [0.5, 0.1] }));
sheet('cast-pip-walk-sheet', 6, 34, 3000, (i, x, t) => C.pip({ x, z: 400, walk: i / 6, stride: 8, face: 1, mouth: 'smile', brow: 0.5, look: [0.4, 0] }));
sheet('cast-pip-walk-sheet-L', 6, 34, 3000, (i, x, t) => C.pip({ x, z: 400, walk: i / 6, stride: 8, face: -1, mouth: 'smile', brow: 0.5, look: [-0.4, 0] }));
sheet('cast-bram-walk-sheet', 6, 64, 1900, (i, x, t) => C.bram({ x, z: 400, walk: i / 6, stride: 9, face: 1, mouth: 'smile', brow: 0.3, look: [0.4, 0] }), { camy: -16 });
sheet('cast-luma-flap-sheet', 8, 31, 2900, (i, x, t) => C.luma({ x, y: -34, z: 400, face: 1, wings: 1, flap: i / 8 * TAU, hover: true }), { camy: -34 });

// =====================================================================================================================
// v2 checks: ground contact against a visible ground line, gait phase sheets, and face close-ups lit warm and lit cold.
// =====================================================================================================================
const WARM = (x, y, z) => [{ x, y, z, col: [1, 0.66, 0.3], i: 1.9, rad: 50, halo: 70 }];
const COLD = { ambient: [0.17, 0.23, 0.46], lights: [{ x: -60, y: -90, z: 330, col: [0.55, 0.68, 1], i: 0.55, rad: 90, halo: 0 }] };
// one row of figures with the ground line; n figures spaced `sp`, posed by fn(i, x)
function lineup(name, n, sp, f, camy, fn, ex = {}) {
  LABS[name] = t => { const sc = stage(Object.assign({ camx: ex.camx ?? 0, camy, f, z: 400, ap: 6, bulb: false, noNear: true, groundLine: true, lights: WARM(0, -40, 360) }, ex.cold ? COLD : {}), t);
    for (let i = 0; i < n; i++) sc.items.push(...fn(i, (i - (n - 1) / 2) * sp, t)); return sc; }; }
// Pip in every ground pose: stand, tiptoe, crouch (squash + lean), sit, heel strike, toe-off, run contact
lineup('cast-contact-pip', 7, 30, 3400, -16, (i, x) => C.pip(Object.assign({ x, z: 400, face: 1, mouth: 'smile', look: [0.3, 0.1] },
  [{}, { tiptoe: 1, armR: { sh: -0.9, el: 0.3 } }, { squash: 0.82, lean: 0.25, mouth: 'grit', brow: -0.3 }, { sit: 1 }, { walk: 0.0 }, { walk: 0.3 }, { walk: 0.12, run: 1, stride: 16 }][i])));
lineup('cast-contact-pip-L', 7, 30, 3400, -16, (i, x) => C.pip(Object.assign({ x, z: 400, face: -1, mouth: 'smile', look: [-0.3, 0.1] },
  [{}, { tiptoe: 1 }, { squash: 0.82, lean: 0.25 }, { sit: 1 }, { walk: 0.0 }, { walk: 0.3 }, { walk: 0.12, run: 1, stride: 16 }][i])));
// feet only, big: the boots at heel strike, flat, toe-off and tiptoe against the ground line
lineup('cast-contact-boots', 4, 26, 9000, -6, (i, x) => C.pip(Object.assign({ x, z: 400, face: 1 }, [{ walk: 0.0 }, { walk: 0.2 }, { walk: 0.52 }, { tiptoe: 1 }][i])));
lineup('cast-contact-bram', 4, 72, 1900, -14, (i, x) => C.bram(Object.assign({ x, z: 400, face: 1, mouth: 'smile', look: [0.3, 0] },
  [{}, { brace: 1, push: 1, mouth: 'grit', brow: -0.4 }, { dome: 1, eyes: 0.3 }, { walk: 0.08, stride: 11 }][i])));
lineup('cast-contact-luma', 4, 30, 4200, -12, (i, x) => C.luma(Object.assign({ x, z: 400, face: 1, mouth: 'smile', look: [0.2, 0] },
  [{ wings: 1, flap: 0.3 }, { wings: 0.8, fold: 0.6 }, { fold: 1 }, { y: -6, hover: 0.5, flap: 1.2 }][i])));
// gait phase sheets: t = 0, 1, 2 show phases 0..0.30, 0.35..0.65, 0.70..1.00 in steps of 0.05; each figure stands still in its slot
const phaseSheet = (name, who, extra, f, camy, sp) => lineup(name, 7, sp, f, camy, (i, x, t) => { const ph = (Math.floor(clamp(t, 0, 2.99)) * 7 + i) * 0.05;
  return C[who](Object.assign({ x, z: 400, face: 1, walk: ph, mouth: 'smile', brow: 0.4, look: [0.4, 0] }, extra)); });
phaseSheet('cast-pip-walk-phases', 'pip', { stride: 8 }, 3600, -18, 28);
phaseSheet('cast-pip-run-phases', 'pip', { stride: 16, run: 1, mouth: 'o', mouthOpen: 0.4 }, 3600, -18, 28);
phaseSheet('cast-bram-walk-phases', 'bram', { stride: 9 }, 1550, -20, 64);
// walking and running in motion, camera locked to the ground so planted feet must not slide against the ground line and pebbles
LABS['cast-pip-run'] = t => { const st = 16, ph = t * 1.6, x = -30 + C.walkAdvance(st) * ph; const sc = stage({ camx: x + 10, camy: -20, f: 3200, noNear: true, groundLine: true, lights: WARM(x + 40, -30, 380) }, t);
  return add(sc, C.pip({ x, z: 400, walk: ph, stride: st, run: 1, face: 1, look: [0.6, 0], brow: -0.1, mouth: 'o', mouthOpen: 0.4 })); };
LABS['cast-pip-walk-ground'] = t => { const st = 8, ph = t * 0.9, x = -30 + C.walkAdvance(st) * ph; const sc = stage({ camx: 0, camy: -16, f: 3000, noNear: true, groundLine: true, lights: WARM(20, -30, 380) }, t);
  return add(sc, C.pip({ x, z: 400, walk: ph, stride: st, face: 1, look: [0.4, 0], brow: 0.5, mouth: 'smile', mouthOpen: 0.2 })); };
// walk-to-run blend for the chase: run eases 0 -> 1 over 2 s while the stride grows
LABS['cast-pip-walk-to-run'] = t => { const k = ss(0, 2, t), st = lerp(9, 16, k); let ph = 0, x = -40;
  for (let i = 0; i < 60; i++) { const tt = t * i / 60, kk = ss(0, 2, tt), s2 = lerp(9, 16, kk), v = lerp(1.0, 1.6, kk) * t / 60; ph += v; x += C.walkAdvance(s2) * v; }
  const sc = stage({ camx: x + 10, camy: -20, f: 3200, noNear: true, groundLine: true, lights: WARM(x + 40, -30, 380) }, t);
  return add(sc, C.pip({ x, z: 400, walk: ph, stride: st, run: k, face: 1, look: [0.6, 0], brow: 0.2, mouth: 'smile', mouthOpen: 0.3 })); };
// face close-ups: the face fills about half the frame height. t selects the expression (0..6): smile, flat, o, yawn, grit, laugh, frown.
const FACES = [
  { mouth: 'smile', mouthOpen: 0.3, brow: 0.6, eyes: 1, look: [0.15, -0.05] }, { mouth: 'flat', mouthOpen: 0, brow: -0.2, eyes: 0.85, look: [-0.3, 0.1] },
  { mouth: 'o', mouthOpen: 0.6, brow: 0.9, eyes: 1, look: [0.2, -0.2] }, { mouth: 'yawn', mouthOpen: 0.9, brow: 0.1, eyes: 0.05, look: [0, 0] },
  { mouth: 'grit', mouthOpen: 0.8, brow: -0.5, eyes: 0.75, look: [0.4, 0] }, { mouth: 'laugh', mouthOpen: 0.9, brow: 1, eyes: 0.05, look: [0, -0.1] },
  { mouth: 'frown', mouthOpen: 0, brow: -0.8, eyes: 0.9, look: [-0.2, 0.25] }];
const face = t => FACES[((Math.floor(t) % 7) + 7) % 7];
const faceLab = (name, cold, build) => { LABS[name] = t => { const o = build(t), sc = stage(Object.assign({ camx: o.camx, camy: o.camy, camz: o.camz, f: 2400, z: 400, focus: 400, ap: 6, bulb: false },
  cold ? COLD : { lights: [{ x: o.camx + 34, y: o.camy - 6, z: 372, col: [1, 0.66, 0.3], i: 1.7, rad: 45, halo: 60 }] }), t); return add(sc, o.items); }; };
for (const cold of [false, true]) {
  const sfx = cold ? '-cold' : '';
  faceLab('cast-face-pip' + sfx, cold, t => ({ camx: 1.5, camy: -29, camz: 312, items: C.pip(Object.assign({ x: 0, z: 400, face: 1, headTilt: 0.03, autoBlink: false, breath: 0.25 }, face(t))) }));
  faceLab('cast-face-pip-front' + sfx, cold, t => ({ camx: 0, camy: -29, camz: 312, items: C.pip(Object.assign({ x: 0, z: 400, face: 1, yaw: 0, autoBlink: false, breath: 0.25 }, face(t))) }));
  faceLab('cast-face-bram' + sfx, cold, t => ({ camx: 22, camy: -12, camz: 330, items: C.bram(Object.assign({ x: 0, z: 400, face: 1, autoBlink: false, breath: 0.25 }, face(t))) }));
  faceLab('cast-face-luma' + sfx, cold, t => ({ camx: 7, camy: -12.5, camz: 342, items: C.luma(Object.assign({ x: 0, y: -2, z: 400, face: 1, wings: 1, flap: 0.5, autoBlink: false, breath: 0.25 }, face(t))) }));
}
// =====================================================================================================================
// v3 checks
// =====================================================================================================================
// squint: t = 0..5 steps the lids from open to a hard squint (grit, as in s17's strain close-up). The pupils must stay dark with a
// small spark, the catch-lights shrink with the lids, and no pale ring may show around the eye on the lit or the shaded side.
const SQUINT = [1, 0.85, 0.7, 0.55, 0.42, 0.3];
const sq = t => SQUINT[clamp(Math.floor(t), 0, 5)];
for (const cold of [false, true]) {
  faceLab('cast-face-squint' + (cold ? '-cold' : ''), cold, t => ({ camx: 1.5, camy: -29, camz: 312, items: C.pip({ x: 0, z: 400, face: 1, headTilt: 0.03, autoBlink: false, breath: 0.25,
    mouth: 'grit', mouthOpen: 0.8, brow: -0.6, eyes: sq(t), look: [0.4, 0.05] }) }));
  faceLab('cast-face-squint-luma' + (cold ? '-cold' : ''), cold, t => ({ camx: 7, camy: -12.5, camz: 342, items: C.luma({ x: 0, y: -2, z: 400, face: 1, wings: 1, flap: 0.5, autoBlink: false, breath: 0.25,
    mouth: 'grit', mouthOpen: 0.5, brow: -0.7, eyes: sq(t), look: [0.3, 0.2] }) }));
}
// the s17 strain at medium distance: six Pips heaving with both mitts forward, eyes from open to squint. Far mitt must read as a mitt.
lineup('cast-pip-squint-sheet', 6, 32, 3400, -16, (i, x) => C.pip({ x, z: 400, face: 1, mouth: 'grit', mouthOpen: 0.8, brow: -0.6, eyes: SQUINT[i], look: [0.4, 0.05], lean: -0.25, squash: 0.92,
  autoBlink: false, armR: { reach: [x + 15, -13] }, armL: { reach: [x + 14, -9] } }));
// s17 heave, framed like its pipF close-up: leaning into the leaf, both mitts low in front of the boots (far mitt at x+7, near at
// x+13). Both mitts must read as felt mitts with a thumb, none as a loose flat disc. t < 1 near view, t >= 1 a little wider.
faceLab('cast-pip-mitts', false, t => { const w = Math.sin(t * 17); return { camx: 8, camy: -22, camz: t < 1 ? 290 : 270, items: C.pip({ x: 0, z: 400, face: 1, mouth: 'grit', mouthOpen: 0.25,
  brow: -0.5, eyes: 0.55, look: [0.7, -0.2], lean: 0.36 + 0.04 * w, squash: 0.84, autoBlink: false, breath: t * 0.5, armR: { reach: [13, 3 + 1.2 * w] }, armL: { reach: [7, 3.5 - 1.2 * w] } }) }; });

// fall onto the back: onBack from 0 to 1 at a ground line, as in s14 (eased over 0.85 s). Stills at t: the lowest point of body or head
// must touch the line at 1, never cross it; legs kick up and flop, head counter-rotated, face readable, impact squash near the end.
const fallPose = (ob, x, f = 1) => ({ x, z: 400, face: f, onBack: ob, mouth: ob > 0.1 ? 'o' : 'grit', mouthOpen: 0.5, eyes: lerp(1, 0.9, ob), brow: -0.6, look: [0.2 * f, -0.6 * ob], autoBlink: false, breath: 0.2 });
lineup('cast-pip-fall-sheet', 6, 44, 3000, -14, (i, x) => C.pip(fallPose([0, 0.3, 0.55, 0.75, 0.9, 1][i], x)));
lineup('cast-pip-fall-sheet-L', 6, 44, 3000, -14, (i, x) => C.pip(fallPose([0, 0.3, 0.55, 0.75, 0.9, 1][i], x, -1)));
// the fall in time, as act2's s14 drives it: onBack = ss(0, 0.85, t - 0.3); render 1/30 s apart to check the motion
LABS['cast-pip-fall'] = t => { const ob = ss(0, 0.85, t - 0.3), sc = stage({ camx: -2, camy: -14, f: 10000, z: 400, ap: 6, bulb: false, noNear: true, groundLine: true, lights: WARM(20, -40, 360) }, t);
  return add(sc, C.pip(Object.assign(fallPose(ob, 4), { breath: t * 0.5 }))); };
// Luma's grip: a leaf-edge card with the hold point marked (red). Her body is placed the way s17 places it (11 beside, 9 above the
// point), which is beyond her front legs' reach; the grip must pull her in so both front feet press on the point. t 0..1 blends
// hold.k from 0 to 1 (the swoop onto the edge), then she beats hard and strains (flapHz 10, smeared).
const edgeCard = (x0, x1, y, z) => ({ z, draw: c => { const pts = [[x0, y], [x1, y + 2], [x1 + 4, y + 9], [x0 - 6, y + 12]];
  P.card(c, blobPath(pts), P.lit([120, 82, 44], (x0 + x1) / 2, y + 5, z), { lift: 0.8, edge: 0.3 }); } });
const mark = (pts, z) => ({ z, draw: c => { for (const [q, col] of pts) { c.fillStyle = col; c.beginPath(); c.arc(q[0], q[1], 0.45, 0, TAU); c.fill(); } } });
LABS['cast-luma-grip'] = t => { const k = ss(0, 1, t), hold = [0, -12], sc = stage({ camx: 6, camy: -18, f: 7000, z: 400, ap: 6, bulb: false, lights: WARM(20, -40, 360) }, t);
  const pose = { x: hold[0] + 11 + 18 * (1 - k), y: hold[1] - 9 - 16 * (1 - k), z: 400, face: -1, wings: 1, hover: lerp(1, 0.2, k), flap: t * TAU * (t > 1 ? 10 : 6), flapHz: t > 1 ? 10 : 6,
    hold: { x: hold[0], y: hold[1], k }, eyes: 0.6, mouth: 'grit', mouthOpen: 0.3, brow: -0.6, look: [-0.5, 0.3], autoBlink: false };
  return add(sc, [edgeCard(-30, 4, hold[1], 401), ...C.luma(pose), mark([[hold, '#ff2a2a'], [C.anchor('luma', pose, 'footFront'), '#2aff6a']], 399)]); };
// grip from several body placements: far above, far beside, below, close; feet (green) must land on the point (red) every time
lineup('cast-luma-grip-sheet', 4, 40, 3800, -22, (i, x) => { const hold = [x, -12], off = [[11, -9], [20, -18], [14, 6], [7, -6]][i];
  const pose = { x: x + off[0], y: hold[1] + off[1], z: 400, face: -1, wings: 1, hover: 0.2, flap: 1.0, hold: { x: hold[0], y: hold[1] }, mouth: 'grit', eyes: 0.6, brow: -0.6, autoBlink: false };
  return [edgeCard(x - 26, x + 4, hold[1], 401), ...C.luma(pose), mark([[hold, '#ff2a2a'], [C.anchor('luma', pose, 'footFront'), '#2aff6a']], 399)]; });
// fast flutter: render frames 1/30 s apart (e.g. 1:1.3:0.0333). flapHz 10: the wings must read as a steady soft fan, no strobing.
LABS['cast-luma-flutter'] = t => { const hz = t < 2 ? 10 : 3, sc = stage({ camx: 0, camy: -36, f: 5200, lights: [{ x: 24, y: -40, z: 380, col: [1, 0.66, 0.3], i: 2.0, rad: 55, halo: 80 }] }, t);
  return add(sc, C.luma({ x: 0, y: -34, z: 400, face: 1, wings: 1, flap: t * TAU * hz, flapHz: hz, hover: true })); };
lineup('cast-luma-flutter-sheet', 5, 34, 3600, -30, (i, x, t) => { const hz = [2, 5, 6.2, 8, 13][i]; return C.luma({ x, y: -26, z: 400, face: 1, wings: 1, flap: t * TAU * hz, flapHz: hz, hover: true }); });
// blink: t = 0..6 steps blink through 0, 0.3, 0.5, 0.7, 0.85, 0.95, 1. The lid is an opaque cover sliding down: no frame may show the
// iris, a catch-light or the eye's outline through the lid, and at 1 the eye is the bare face with its lash line.
const BLINK = [0, 0.3, 0.5, 0.7, 0.85, 0.95, 1];
const bk = t => BLINK[clamp(Math.floor(t), 0, 6)];
for (const cold of [false, true]) {
  const sfx = cold ? '-cold' : '';
  faceLab('cast-face-blink-pip' + sfx, cold, t => ({ camx: 1.5, camy: -29, camz: 312, items: C.pip({ x: 0, z: 400, face: 1, headTilt: 0.03, autoBlink: false, breath: 0.25, blink: bk(t), look: [0.2, 0], brow: 0.2 }) }));
  faceLab('cast-face-blink-bram' + sfx, cold, t => ({ camx: 22, camy: -12, camz: 330, items: C.bram({ x: 0, z: 400, face: 1, autoBlink: false, breath: 0.25, blink: bk(t), look: [0.2, 0] }) }));
  faceLab('cast-face-blink-luma' + sfx, cold, t => ({ camx: 7, camy: -12.5, camz: 342, items: C.luma({ x: 0, y: -2, z: 400, face: 1, wings: 1, flap: 0.5, autoBlink: false, breath: 0.25, blink: bk(t), look: [0.2, 0] }) }));
}
// Bram's brace at full strain, as s17 poses it (brace 1, push, head lowered, a shaking lean): the hind legs reach long and diagonal
// behind him but never stretch past femur + tibia; the feet stay on the ground line. t steps the strain and lean.
lineup('cast-bram-brace-sheet', 4, 88, 2100, -14, (i, x, t) => C.bram({ x, z: 400, face: 1, brace: [0.5, 1, 1, 1][i], push: [0.2, 0.6, 1, 1][i], head: [0, 0.3, 0.3, 0.6][i],
  lean: [0, 0.03, -0.03, 0.06][i], squash: [1, 0.97, 0.95, 0.95][i], mouth: 'grit', brow: -0.8, eyes: 0.55, look: [1, 0.25], autoBlink: false, breath: 0.2 }));

// =====================================================================================================================
// v4 checks
// =====================================================================================================================
// blink at film distances: the three side by side, t = 0..6 steps blink through 0, 0.3, 0.5, 0.7, 0.85, 0.95, 1 (as the close-up blink
// labs). A closing eye must read as a lid coming down over the ball (a crescent of ball under a face-coloured lid), never a dark bar
// or a pair of sunglasses, at medium (f 3200) and wide (f 1500) sizes and on a phone.
const trioBlink = (t, x0) => { const b = bk(t);
  return [...C.pip({ x: x0 - 52, z: 400, face: 1, autoBlink: false, blink: b, look: [0.3, 0], brow: 0.3, breath: 0.2 }), ...C.bram({ x: x0 + 6, z: 400, face: 1, autoBlink: false, blink: b, look: [0.2, 0], breath: 0.2 }),
    ...C.luma({ x: x0 + 58, z: 400, face: -1, wings: 1, flap: 0.5, autoBlink: false, blink: b, look: [-0.2, 0], breath: 0.2 })]; };
for (const [name, f, cold] of [['cast-blink-medium', 3200, false], ['cast-blink-wide', 1500, false], ['cast-blink-medium-cold', 3200, true]])
  LABS[name] = t => add(stage(Object.assign({ camx: 4, camy: -20, f, z: 400, ap: 6, bulb: false, lights: WARM(0, -40, 360) }, cold ? COLD : {}), t), trioBlink(t, 0));
// Luma's blink in the s19 run (brow 0.8, smile, looking a little down; 108.93-109.0): raw blink values as the film samples them at
// 30 fps (0, 0.3, 0.5, 0.62, 0.78, 0.9, 1). A mid-blink eye must read as a curved lid over a lit crescent of ball with a spark, never
// sunglasses or a bored half-lid; a blink closes relaxed (a soft downward lash curve), not as a happy arc. t >= 1: the cold chase key.
lineup('cast-blink-luma-run', 7, 30, 4200, -60, (i, x, t) => C.luma({ x, y: -60, z: 400, face: -1, wings: 1, flap: 0.6, hover: true, eyes: 1, look: [0.2, 0.3], brow: 0.8, mouth: 'smile', mouthOpen: 0.25,
  autoBlink: false, blink: [0, 0.3, 0.5, 0.62, 0.78, 0.9, 1][i], breath: 0.2 }), {});
LABS['cast-blink-luma-run-cold'] = t => { const sc = stage(Object.assign({ camx: 0, camy: -60, f: 4200, z: 400, ap: 6, bulb: false, noNear: true, groundLine: true }, COLD), t);
  [0, 0.3, 0.5, 0.62, 0.78, 0.9, 1].forEach((b, i) => sc.items.push(...C.luma({ x: (i - 3) * 30, y: -60, z: 400, face: -1, wings: 1, flap: 0.6, hover: true, eyes: 1, look: [0.2, 0.3], brow: 0.8, mouth: 'smile',
    mouthOpen: 0.25, autoBlink: false, blink: b, breath: 0.2 }))); return sc; };
// paper-cut turn: face swept from -1 to 1 between t = 0.5 and 0.75 (render 1/30 s apart, e.g. 0.4:0.9:0.0333). The puppet must narrow
// like a card about its body centre, darken a little at the narrowest, and come back facing the other way with no pop; face = +-1 must
// draw exactly as before.
const turnFace = t => clamp(-1 + 2 * (t - 0.5) / 0.25, -1, 1);
LABS['cast-turn'] = t => { const f = turnFace(t), sc = stage({ camx: 4, camy: -20, f: 3000, z: 400, ap: 6, bulb: false, noNear: true, groundLine: true, lights: WARM(0, -40, 360) }, t);
  return add(sc, [...C.pip({ x: -56, z: 400, face: f, look: [0.3 * Math.sign(f || 1), 0], brow: 0.4 }), ...C.bram({ x: 8, z: 400, face: f, look: [0.2 * Math.sign(f || 1), 0] }),
    ...C.luma({ x: 62, z: 400, face: f, wings: 1, flap: 0.5, look: [0.2 * Math.sign(f || 1), 0] })]); };
// the turn as a sheet: face = -1, -0.6, -0.25, 0, 0.25, 0.6, 1; t 0 Pip, 1 Bram, 2 Luma (each with a walk/stand pose)
const TURNS = [-1, -0.6, -0.25, 0, 0.25, 0.6, 1];
LABS['cast-turn-sheet'] = t => { const who = clamp(Math.floor(t), 0, 2), sp = [30, 70, 34][who], f = [3200, 1700, 3600][who];
  const sc = stage({ camx: 0, camy: who === 1 ? -14 : -18, f, z: 400, ap: 6, bulb: false, noNear: true, groundLine: true, lights: WARM(0, -40, 360) }, t);
  TURNS.forEach((fc, i) => { const x = (i - 3) * sp, o = { x, z: 400, face: fc, mouth: 'smile', look: [0.3 * Math.sign(fc || 1), 0], autoBlink: false, breath: 0.2 };
    sc.items.push(...C[['pip', 'bram', 'luma'][who]](who === 2 ? Object.assign(o, { wings: 1, flap: 0.5 }) : o)); });
  return sc; };
// planted contact shadows, with the turf in front of the feet present (as in the film, where the turf rows nearer than the puppet would hide
// the near half of a shadow drawn at the puppet's own depth). t < 1: Pip lifted 0, 1, 3, 6, 12 units and Luma landing; the pool must
// shrink and fade with height. t >= 1: Pip's run and Bram's walk in motion, a camera at the film's chase height (render 1/30 s apart).
LABS['cast-shadow-sheet'] = t => { const sc = stage({ camx: 0, camy: -24, f: 2600, z: 400, ap: 6, bulb: false, lights: WARM(0, -40, 360) }, t);
  [0, 1, 3, 6, 12].forEach((h, i) => sc.items.push(...C.pip({ x: -90 + i * 34, y: -h, ground: 0, z: 400, face: 1, mouth: 'smile', look: [0.3, 0] })));
  sc.items.push(...C.luma({ x: 86, y: -3, z: 400, face: -1, wings: 1, hover: 0.5, flap: 1.2, ground: 0 }));
  return sc; };
LABS['cast-shadow-run'] = t => { const st = 14, ph = t * 1.5, x = -40 + C.walkAdvance(st) * ph, bph = x / C.walkAdvance(12);
  const sc = stage({ camx: x + 16, camy: -34, f: 2600, z: 400, ap: 6, lights: WARM(x + 40, -30, 380) }, t);
  return add(sc, [...C.pip({ x, z: 396, walk: ph, stride: st, run: 1, face: 1, ground: 0, look: [0.6, 0], brow: -0.1, mouth: 'o', mouthOpen: 0.4 }),
    ...C.bram({ x: x + 36, z: 412, walk: bph, stride: 12, face: 1, ground: 0, look: [0.3, 0], mouth: 'smile' })]); };
LABS['cast-shadow-off'] = t => add(stage({ camx: 0, camy: -24, f: 2600, z: 400, ap: 6, bulb: false, lights: WARM(0, -40, 360) }, t),
  [...C.pip({ x: -30, z: 400, face: 1, shadow: false }), ...C.pip({ x: 30, z: 400, face: 1 })]);
// Pip's near arm raised across his face holding the cup, three-quarter (as s07 35.2-36.8): the forearm must read as a limb (elbow bend,
// darker edge, a drop shadow on the face), never as a round green blob on the face. t steps the mitt height and side.
faceLab('cast-pip-arm-cup', false, t => { const i = clamp(Math.floor(t), 0, 4), tx = [-14, -12, -9, -6, -15][i], ty = [-24, -28, -22, -19, -17][i];
  return { camx: -4, camy: -24, camz: 300, items: C.pip({ x: 0, z: 400, face: -1, yaw: 0.8, armR: { reach: [tx, ty] }, dipper: { tilt: [0.2, 0.1, 3.1, 0.15, 0.6][i], water: 0 }, mouth: 'flat', brow: -0.2, look: [-0.6, 0.4], autoBlink: false, breath: 0.2 }) }; });
})();
