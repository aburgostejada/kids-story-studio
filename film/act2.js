// Pip and the Missing Glow. Act 2, the search (shots 8-16): friends arrive, the journey upstream, the leaf, trying alone, the plan.
// Each shot is B[name] = (u, T) => scene; u = time inside the shot, T = film time. Helpers come from shots.js (P.SH).
(() => {
const P = window.PIP, { K, ss, clamp, lerp, bump, noise, hash } = P;
const { B, START, AMB_DARK, cam, scene, pip, bram, luma, pipGait, bramGait } = P.SH;

// ---------- blinks ----------
// Blinks run on film time T with a different period and offset per character, so no two characters blink together and a blink
// never starts on a cut or on the first word of a narration line. Acting blinks (a slow one on a realisation, a double one on
// standing up) are given explicitly per shot.
const CUTS = Object.values(START);
const LINE_T = () => (P.FILM && P.FILM.lines ? P.FILM.lines.map(l => l[0]) : []);
const blinkT = (T, seed, every = 3.4) => {
  const per = every * (0.82 + 0.36 * hash(seed, 5)), off = hash(seed, 6) * per, p = (T + off) % per, d = 0.16;
  if (p >= d) return 0;
  const t0 = T - p;
  for (const c of CUTS) if (t0 > c - 0.35 && t0 < c + 0.35) return 0;                  // not on a cut
  for (const l of LINE_T()) if (t0 > l - 0.2 && t0 < l + 0.6) return 0;                // not on the first word of a line
  return Math.sin(p / d * Math.PI);
};
// An acting blink: [start (s in shot), length] pairs; a slow blink is simply a longer one.
const actBlink = (u, list) => { let b = 0; for (const [t0, d = 0.16] of list) if (u > t0 && u < t0 + d) b = Math.max(b, Math.sin((u - t0) / d * Math.PI)); return b; };
const both = (a, b) => Math.max(a, b);

// ---------- light ----------
// A cool moon key light, placed behind and above the cast (larger z, higher y) so the characters pick up blue light on their
// upper edges while the ground in front of them stays dark.
const moon = (x, y, z, i = 0.8, rad = 90) => ({ x, y, z, col: [0.62, 0.78, 1], i, rad, halo: 0 });
// A soft pool of cool light lying behind a character, so the silhouette separates from the dark meadow like a back-lit mist.
const backGlow = (x, y, z, rx, ry, a = 0.3, col = [110, 150, 235]) => ({ z, draw(c) {
  c.save(); c.globalCompositeOperation = 'lighter'; c.translate(x, y); c.scale(rx, ry);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.55, `rgba(${col},${a * 0.38})`); g.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill(); c.restore(); } });

// The dark garden's ambient light (a little lighter than the story's darkest night so the cast stays readable).
const NIGHT = [0.17, 0.22, 0.45];

// ---------- clearing the buds ----------
// The rows of small buds along the banks stand exactly where a camera at ground level looks, and would hide a face or the
// pin stone. A "clearing" lifts every bud and garden flower inside a ground rectangle out of the frame (the world's own
// positions are rebuilt here from the same hash, then matched to the flower items by depth).
let BUDMAP = null;
const budMap = items => {
  if (BUDMAP) return BUDMAP;
  BUDMAP = new Map();
  P.world.FLOWERS.forEach((f, i) => items[i] && BUDMAP.set(items[i], { x: f.x, z: f.z }));
  const byZ = new Map();
  for (let i = 0; i < items.length; i++) { const z = items[i].z; if (!byZ.has(z)) byZ.set(z, []); byZ.get(z).push(items[i]); }
  for (let i = 0; i < 560; i++) {
    const u = 0.005 + 0.99 * (i + hash(i, 11) * 0.8) / 560, side = i % 2 ? 1 : -1, row = hash(i, 12);
    const off = row < 0.4 ? 32 + hash(i, 13) * 7 : row < 0.72 ? 43 + hash(i, 13) * 9 : 56 + Math.pow(hash(i, 13), 1.3) * 60;
    const p = P.world.chan(u), t = P.world.chanDir(u), x = p[0] - t[1] * side * off, z = p[2] + t[0] * side * off, arr = byZ.get(z);
    if (arr) { const it = arr.find(a => !BUDMAP.has(a)); if (it) BUDMAP.set(it, { x, z, off }); }
  }
  return BUDMAP;
};
// scene(...) with buds and flowers removed inside the given world rectangles [{ x0, x1, z0, z1 }]
const clearing = (res, rects) => {
  const mp = budMap(P.world._fl || P.world.flowers({}));
  res.items = res.items.filter(it => { const q = mp.get(it); return !q || !rects.some(r => q.x > r.x0 && q.x < r.x1 && q.z > r.z0 && q.z < r.z1); });
  return res;
};

// Lifts the two dense rows of buds that hug the channel banks (everything within `off` units of the channel), so the dry stone
// bed reads as a clean line in the wide shots.
const clearBanks = (res, off = 54) => {
  const mp = budMap(P.world._fl || P.world.flowers({}));
  res.items = res.items.filter(it => { const q = mp.get(it); return !(q && q.off !== undefined && q.off < off); });
  return res;
};
// Tilts the frame down by `dy` pixels (a lens shift: the horizon moves up and more ground shows). The camera model has no pitch,
// so every item is drawn shifted; the strip of frame the ground does not reach at the bottom is filled with dark soil.
const pitch = (res, dy, fill = true) => {
  if (!dy) return res;
  res.items = res.items.map(it => it.screen
    ? Object.assign({}, it, { draw: (c, t) => { c.save(); c.translate(0, -dy); it.draw(c, t); c.restore(); } })
    : Object.assign({}, it, { draw: (c, s, t) => { c.save(); c.translate(0, -dy / s); it.draw(c, s, t); c.restore(); } }));
  res.items.push({ z: 1e12, screen: true, draw(c) { c.fillStyle = 'rgb(7,12,20)'; c.fillRect(0, 0, 1920, 1080); } });
  if (fill) res.items.push({ z: 0.6, screen: true, draw(c) { const y0 = 1080 - dy - 120, g = c.createLinearGradient(0, y0, 0, 1080); g.addColorStop(0, 'rgba(7,12,20,0)'); g.addColorStop(0.45, 'rgba(7,12,20,0.8)'); g.addColorStop(1, 'rgba(7,12,20,0.95)'); c.fillStyle = g; c.fillRect(0, y0, 1920, 1080 - y0); } });
  res.lights = res.lights.map(L => L.halo ? Object.assign({}, L, { halo: 0 }) : L);
  return res;
};
// Where a world point lands on screen once the frame is tilted by dy.
const proj = (c, x, y, z, dy = 0) => { const q = P.project(c, x, y, z); return [q[0], q[1] - dy, q[2]]; };
// A soft glow painted on the screen at a world point (the trapped pond light seen from far away).
const screenGlow = (c, x, y, z, dy, rad, a, col = '255,170,80') => ({ z: 1, screen: true, draw(g) {
  const [sx, sy] = proj(c, x, y, z, dy); g.save(); g.globalCompositeOperation = 'lighter';
  const r = g.createRadialGradient(sx, sy, 0, sx, sy, rad); r.addColorStop(0, `rgba(${col},${a})`); r.addColorStop(0.35, `rgba(${col},${a * 0.4})`); r.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = r; g.fillRect(sx - rad, sy - rad, 2 * rad, 2 * rad); g.restore(); } });

// ---------- the damp line (shots 8, 9, 11) ----------
// Upstream of where Pip stands the bed is not quite dry yet: the stones are darker and still wet, and the wet line gets wider and
// glossier the further up the channel it goes, so it points the way the water went. Drawn as screen-space strips laid on the bed
// (projected ground points), one per short stretch so the rim stones sort over them; moon glints twinkle on the wet stones, and a
// travelling run of glints (wave 0..1 = how far it has run) races upstream along it when Bram finds it.
const DAMP0 = 0.884;                                     // where the wet starts (just upstream of Bram's nose in shot 8)
// Each stretch: the wet dark of the stones (covering the bed between the rims), a cool sky sheen down it, broken glossy moon streaks on the
// wet stone faces, a few standing water beads, and the twinkling glints; the travelling run is a bright bead of light with a short tail.
// It lies on the floor of the recessed bed (P.world.bedY), so the rim stones sort over it. o.dark: just the wet dark of the stones (the map
// view). o.sparse: a dark, glossy stripe with only a few slow glints (it must read as damp, not as running water); the run stays small.
const damp = (c, uA, uB, T, wave = -1, a = 1, wk = 0.62, o = {}) => {
  const out = [], N = Math.ceil((uA - uB) * 160), sp = o.sparse ? 1 : 0, bed = u => P.world.bedY(u);
  for (let i = 0; i < N; i++) {
    const ua = lerp(uA, uB, i / N), ub = lerp(uA, uB, (i + 1) / N), pa = P.world.chan(ua), pb = P.world.chan(ub);
    if (Math.min(pa[2], pb[2]) < c.z + 30) continue;
    const da = P.world.chanDir(ua), db = P.world.chanDir(ub), grow = ss(uA, uA - 0.04, ua), growB = ss(uA, uA - 0.04, ub);   // wetter and wider going upstream
    const wa = 11 * wk * (0.5 + 0.5 * grow) * (0.85 + 0.2 * noise(ua * 380, 7)), wb = 11 * wk * (0.5 + 0.5 * growB) * (0.85 + 0.2 * noise(ub * 380, 7));
    const zSort = Math.min(pa[2], pb[2]) - 0.6, far = ss(500, 1100, pa[2] - c.z), ya = bed(ua) - 0.3, yb = bed(ub) - 0.3, key = Math.round(ua * 4000);
    const at = (u, off, y = -0.4) => { const pp = P.world.chan(u), dd = P.world.chanDir(u); return P.project(c, pp[0] - dd[1] * off, bed(u) + y, pp[2] + dd[0] * off); };
    out.push({ z: zSort, screen: true, draw(g) {
      const q = [P.project(c, pa[0] - da[1] * wa, ya, pa[2] + da[0] * wa), P.project(c, pb[0] - db[1] * wb, yb, pb[2] + db[0] * wb),
        P.project(c, pb[0] + db[1] * wb, yb, pb[2] - db[0] * wb), P.project(c, pa[0] + da[1] * wa, ya, pa[2] - da[0] * wa)];
      g.save(); g.lineCap = 'round';
      const poly = () => { g.beginPath(); q.forEach((p, j) => j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
      g.fillStyle = `rgba(4,9,24,${0.8 * a * (0.6 + 0.4 * grow)})`; poly(); g.fill();
      g.fillStyle = `rgba(70,110,170,${0.16 * a * grow})`; poly(); g.fill();        // the wet stones mirror the sky: a cool gloss over the dark
      if (o.dark) { g.restore(); return; }
      // a cool moon sheen down the middle of the wet strip (in the sparse look only a faint gloss)
      const m0 = at(ua, 0, -0.35), m1 = at(ub, 0, -0.35);
      g.strokeStyle = `rgba(165,200,252,${(0.55 + 0.3 * far) * a * grow * (1 - 0.75 * sp)})`; g.lineWidth = Math.max(1.6, wa * 0.42 * m0[2]); g.beginPath(); g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]); g.stroke();
      g.globalCompositeOperation = 'lighter';
      // glossy moon streaks on the wet stone faces (short, broken, slightly off the centre line)
      for (let j = 0; j < 2 - sp; j++) { const h = hash(key + j * 11, 91), off = (h - 0.5) * 1.3 * wa, u0 = lerp(ua, ub, 0.1 + 0.35 * hash(key, 92 + j)), u1 = lerp(u0, ub, 0.5 + 0.4 * h);
        if (sp && h < 0.55) continue;
        const s0 = at(u0, off, -0.6), s1 = at(u1, off * 0.9, -0.6), sh = 0.6 + 0.4 * Math.sin(T * 0.8 + h * 30);
        g.strokeStyle = `rgba(214,232,255,${0.5 * a * grow * sh * (1 - 0.4 * sp)})`; g.lineWidth = Math.max(1.2, 0.5 * s0[2]); g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke(); }
      // standing water beads: a dark drop with a bright moon point on top
      for (let j = 0; j < 2; j++) { const h = hash(key + j * 5, 95); if (h < 0.35 + 0.3 * sp) continue;
        const b0 = at(lerp(ua, ub, hash(key, 96 + j)), (hash(key + j, 98) - 0.5) * 1.6 * wa, -0.9), r = Math.max(1.6, 0.55 * b0[2]);
        g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgba(10,20,40,${0.6 * a * grow})`; g.beginPath(); g.ellipse(b0[0], b0[1], r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(230,244,255,${0.85 * a * grow})`; g.beginPath(); g.arc(b0[0] - r * 0.25, b0[1] - r * 0.3, Math.max(0.9, r * 0.38), 0, Math.PI * 2); g.fill(); }
      // glints on the wet stones: a slow twinkle (sparse: one stretch in four, and fainter), plus the travelling run when it passes
      for (let j = 0; j < 3; j++) { const h = hash(key + j * 7, 77), uu = lerp(ua, ub, hash(key, 78 + j)), off = (h - 0.5) * 1.4 * wa;
        if (sp && (j > 0 || hash(key, 79) < 0.75)) continue;
        const s0 = at(uu, off, -0.5), tw = 0.3 + 0.4 * Math.max(0, Math.sin(T * (1.3 + h) + h * 40));
        const run = wave < 0 ? 0 : bump(uu, lerp(uA, uB, wave), 0.014), al = a * (0.2 + 0.8 * grow) * Math.min(1, tw * (1 - 0.3 * sp) + 1.4 * run);
        if (al < 0.03) continue; const r = Math.max(2.4 + 5 * run * (1 - 0.5 * sp), (0.8 + 1.8 * run) * s0[2]);
        const gg = g.createRadialGradient(s0[0], s0[1], 0, s0[0], s0[1], r * 2.6); gg.addColorStop(0, `rgba(240,248,255,${al})`); gg.addColorStop(0.3, `rgba(180,210,255,${al * 0.5})`); gg.addColorStop(1, 'rgba(150,180,255,0)');
        g.fillStyle = gg; g.fillRect(s0[0] - r * 2.6, s0[1] - r * 2.6, r * 5.2, r * 5.2); }
      // the run itself: a bright point racing upstream with a short tail behind it
      if (wave >= 0) { const uw = lerp(uA, uB, wave); if (uw <= ua && uw > ub) { const h0 = at(uw, 0, -0.8), t0 = at(Math.min(uA, uw + 0.012), 0, -0.8), r = Math.max(3, 1.6 * h0[2]) * (1 - 0.35 * sp), al = a * (1 - 0.6 * wave) * (1 - 0.3 * sp);
        g.strokeStyle = `rgba(200,225,255,${0.55 * al * (1 - 0.5 * sp)})`; g.lineWidth = Math.max(1.5, r * 0.5); g.beginPath(); g.moveTo(t0[0], t0[1]); g.lineTo(h0[0], h0[1]); g.stroke();
        const hg = g.createRadialGradient(h0[0], h0[1], 0, h0[0], h0[1], r * 3); hg.addColorStop(0, `rgba(250,252,255,${al})`); hg.addColorStop(0.3, `rgba(190,215,255,${al * 0.5})`); hg.addColorStop(1, 'rgba(150,180,255,0)'); g.fillStyle = hg; g.fillRect(h0[0] - r * 3, h0[1] - r * 3, r * 6, r * 6); } }
      g.restore(); } });
  }
  return out;
};

// The run of cool glints seen from high above (shot 11): a handful of small sparks, one behind the other, travelling up the dark bed from
// uA to uB as wave goes 0..1. Small and dim on purpose: the bed stays dark between the rims, and the only bright thing in the map is the
// trapped warm glow at the spout.
const sparkRun = (c, uA, uB, wave, a = 1) => {
  if (wave <= 0 || wave >= 1 || a < 0.02) return [];
  const head = lerp(uA, uB, wave), out = [];
  for (let i = 0; i < 6; i++) { const uu = head + (uA > uB ? 1 : -1) * i * 0.016; if ((uA > uB) ? (uu > uA) : (uu < uA)) continue;
    const p = P.world.chan(uu), fade = (1 - i / 6) * ss(0, 0.06, wave) * (1 - ss(0.92, 1, wave)) * a;
    out.push({ z: p[2] - 1, screen: true, draw(g) {
      const q = P.project(c, p[0], P.world.bedY(uu) - 0.8, p[2]), r = 4.2 - 0.35 * i;
      g.save(); g.globalCompositeOperation = 'lighter';
      const gg = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 2.2); gg.addColorStop(0, `rgba(215,232,255,${0.85 * fade})`); gg.addColorStop(0.3, `rgba(160,195,255,${0.32 * fade})`); gg.addColorStop(1, 'rgba(120,160,240,0)');
      g.fillStyle = gg; g.fillRect(q[0] - r * 2.2, q[1] - r * 2.2, r * 4.4, r * 4.4);
      g.fillStyle = `rgba(232,242,255,${0.9 * fade})`; g.beginPath(); g.arc(q[0], q[1], r * 0.5, 0, Math.PI * 2); g.fill(); g.restore(); } }); }
  return out;
};

// The garden where Pip stood at the end of shot 7, a little upstream of his flower, on the right bank of the dry bed. The channel
// runs from his feet away to the right, bends behind the bed, and then runs away to the upper left: upstream.
const P8 = [163, 630], B8 = [222, 724];
// The camera over the bed (shots 8 and 9): a little above head height, the frame tilted down (lens shift) so the far stretch of
// the channel shows above the characters.
const cam8 = (u, extra = {}) => cam(extra.x ?? K(u, [[0, 202], [6, 208]]), extra.y ?? -78, extra.z ?? K(u, [[0, 392], [6, 404]]), 660, 30);
const DY8 = 330, DY9 = 320, DY8B = 302;   // DY8B: shot 8 tilts up along the wet line as the glints race away, and shot 9 opens there
const L9 = [196, -72];                                   // where Luma hovers, high over the others, at the end of shot 9 and the start of 11
// The ground between the lens and the two friends (and round them) is cleared of buds so nothing crosses a face.
const CLEAR8 = [{ x0: 40, x1: 330, z0: 300, z1: 780 }, { x0: 140, x1: 300, z0: 780, z1: 1100 }];   // and the tall flowers behind where Luma hovers
// The night garden of shots 8, 9 and 11: moonlight behind and in front of Pip, buds cleared round the friends and off the banks.
const set8 = (T, c, items, lights, dy, o = {}, zNear = -1e9) => pitch(clearNear(clearBanks(clearing(scene(T, c, items, Object.assign({ motes: 0, noFg: true, ambient: NIGHT,
  lights: [moon(P8[0] + 30, -96, P8[1] + 70, 1.1, 120), moon(P8[0] - 10, -40, P8[1] - 60, 0.35, 90), ...lights] }, o)), CLEAR8), 46), zNear), dy, false);   // clear before the tilt: it matches items by identity
// Lifts every garden flower and bud nearer than zNear (all of them, whatever their x: for a lens that sweeps back over the garden).
const clearNear = (res, zNear) => { const fl = new Set(P.world._fl || P.world.flowers({})); res.items = res.items.filter(it => !(fl.has(it) && it.z < zNear)); return res; };

// The wet patch Bram finds (shot 8): a glossy, near-black pool of water left standing in a dip of the bed right under his snout, filling the
// bed between the rims for about two body lengths of Pip along it, plainly wetter than the dry bed round it: the sky mirrored in it, a long
// moon streak, a few moon glints. touch (0..1 = time since his snout met it, over 0.7 s) sends rings across it and flicks two drops up.
// It lies in open bed between Bram's snout and the lens, a body width and more right of Pip. Drawn in screen space from the projected bed
// outline (along the channel, on P.world.bedY), sorted just behind Bram's snout so the rim stones in front of it and his head sit over it.
const WU8 = 0.886;                                     // where along the channel (u) it lies
const WET8 = (() => { const p = P.world.chan(WU8); return { x: p[0], z: p[2] }; })();
const WET8Y = 1.2;                                      // its surface: water left standing in a dip of the bed, nearly up to the bank
const wetPatch = (c, T, touch, a = 1) => {
  const p0 = P.world.chan(WU8), d = P.world.chanDir(WU8), y = WET8Y, L = 23, Wd = 11;
  const W = (al, ac) => [p0[0] + d[0] * al - d[1] * ac, p0[2] + d[1] * al + d[0] * ac];   // along the bed (+ toward home) and across it
  const pt = (al, ac, yy = y) => { const q = W(al, ac); return P.project(c, q[0], yy, q[1]); };
  return { z: p0[2] + 4, screen: true, draw(g) {   // (pitch() shifts it with the frame, like every other item)
    if (a < 0.02) return;
    const n = 26, out = [];
    for (let i = 0; i < n; i++) { const th = i / n * Math.PI * 2, r = 1 + 0.12 * Math.sin(3 * th + 1.3) + 0.07 * Math.sin(5 * th + 0.4);
      out.push(pt(Math.cos(th) * L * r, Math.sin(th) * Wd * Math.min(1, r))); }
    const ctr = pt(0, 0), s = ctr[2];
    const path = () => { g.beginPath(); out.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
    g.save();
    g.fillStyle = `rgba(2,5,14,${0.93 * a})`; path(); g.fill();                                     // glossy near-black: standing water
    g.save(); path(); g.clip();
    const e0 = pt(-L, 0), e1 = pt(L, 0), sh = g.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
    sh.addColorStop(0, 'rgba(80,120,190,0)'); sh.addColorStop(0.5, `rgba(96,136,206,${0.32 * a})`); sh.addColorStop(1, 'rgba(80,120,190,0)');
    g.fillStyle = sh; path(); g.fill();                                                               // the night sky mirrored in it
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    // the moon's reflection: one long bright streak down the film, broken in two, shimmering a little
    for (const [a0, a1, ac, k] of [[-16, -3, -2.2, 1], [-1, 9, -1.6, 0.75]]) { const sm = 0.8 + 0.2 * Math.sin(T * 2.3 + a0);
      const q0 = pt(a0, ac), q1 = pt(a1, ac * 0.8);
      g.strokeStyle = `rgba(150,190,250,${0.35 * a * k * sm})`; g.lineWidth = Math.max(4, 1.6 * s); g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke();
      g.strokeStyle = `rgba(236,246,255,${0.85 * a * k * sm})`; g.lineWidth = Math.max(1.6, 0.6 * s); g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke(); }
    for (let j = 0; j < 5; j++) { const h = hash(j, 71), al = -18 + 34 * h, ac = (hash(j, 72) - 0.5) * 14, l = 2 + 3 * hash(j, 73), tw = Math.max(0, Math.sin(T * (1.1 + h) + j * 2));
      const q0 = pt(al, ac), q1 = pt(al + l, ac); g.strokeStyle = `rgba(214,232,255,${0.6 * a * tw})`; g.lineWidth = Math.max(1.3, 0.5 * s); g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke(); }
    // the touch: rings running out across the film from under his snout (clipped to the water)
    if (touch > 0 && touch < 1) for (const [dd, w] of [[0, 1], [0.2, 0.65], [0.38, 0.4]]) { const k = clamp((touch - dd) / 0.75); if (k <= 0 || k >= 1) continue;
      const rr = 1.5 + 17 * k, ring = []; for (let i = 0; i <= 24; i++) { const th = i / 24 * Math.PI * 2; ring.push(pt(-6 + Math.cos(th) * rr, Math.sin(th) * rr * 0.9)); }
      g.strokeStyle = `rgba(225,240,255,${0.85 * w * (1 - k) * a})`; g.lineWidth = Math.max(1.8, 0.5 * s); g.beginPath(); ring.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.stroke(); }
    g.restore();
    // the edge of the water: a thin cool meniscus line
    g.strokeStyle = `rgba(150,190,240,${0.4 * a})`; g.lineWidth = Math.max(1, 0.3 * s); path(); g.stroke();
    // two drops flicked up by the touch
    if (touch > 0 && touch < 1) { g.globalCompositeOperation = 'lighter'; const tp = pt(-6, 0);
      for (let j = 0; j < 2; j++) { const k = clamp(touch / 0.55); if (k >= 1) continue; const px = tp[0] + (j ? 5 : -3) * s * k, py = tp[1] - (j ? 7 : 9) * s * 4 * k * (1 - k);
        g.fillStyle = `rgba(230,244,255,${0.9 * (1 - k) * a})`; g.beginPath(); g.arc(px, py, Math.max(1.8, 0.55 * s), 0, Math.PI * 2); g.fill(); } }
    g.restore(); } };
};
// A water bead left on Bram's snout after the touch, catching the moon.
const bead = (x, y, z, a) => ({ z: z - 0.5, draw(c, s) {
  if (a < 0.02) return; c.save();
  c.fillStyle = `rgba(20,40,70,${0.55 * a})`; c.beginPath(); c.ellipse(x, y, 1.1, 1.3, 0, 0, Math.PI * 2); c.fill();
  c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(235,246,255,${0.95 * a})`; c.beginPath(); c.arc(x - 0.3, y - 0.45, Math.max(0.45, 1.2 / s), 0, Math.PI * 2); c.fill();
  c.restore(); } });
// The drip that hangs from his snout as he lifts it (k 0..1 over about half a second): it stretches under the snout for 0.3 s, lets go and
// falls back into the water. (x, y) is the snout; yBed the water surface it falls to.
const drip = (x, y, z, yBed, k) => ({ z: z - 0.6, draw(c, s) {
  if (k <= 0 || k >= 1) return; c.save();
  const hang = k < 0.62, kk = hang ? k / 0.62 : (k - 0.62) / 0.38, len = hang ? 1.6 + 4.6 * ss(0, 1, kk) : 4 * (1 - 0.5 * kk), top = hang ? y : y + 6.2 + (yBed - y - 6.2) * kk * kk, r = 2.1;
  c.fillStyle = 'rgba(150,196,236,0.6)'; c.beginPath(); c.moveTo(x - (hang ? 0.6 : 0.3), top); c.quadraticCurveTo(x - r * 1.1, top + len - r * 0.4, x, top + len + r); c.quadraticCurveTo(x + r * 1.1, top + len - r * 0.4, x + (hang ? 0.6 : 0.3), top); c.closePath(); c.fill();
  c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(236,246,255,0.95)'; c.beginPath(); c.arc(x - 0.6, top + len - 0.2, Math.max(0.7, 2.2 / s), 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(210,232,255,0.8)'; c.lineWidth = Math.max(0.3, 0.8 / s); c.beginPath(); c.moveTo(x + 0.5, top + 0.4); c.quadraticCurveTo(x + r * 0.9, top + len - 0.6, x + 0.2, top + len + r * 0.8); c.stroke();
  c.restore(); } });

// 08 Bram trundles in from the right along the bank and stops at the edge of the bed beside Pip. He lowers his head and his snout touches
// the bed just upstream of Pip: a dark, glossy wet patch, plainly wetter than the dry bed round it (a ring runs out across it and two drops
// flick up). He jerks his head up (a little hop, antennae bouncing, eyes wide), a bead of water glinting on his snout; then he turns his
// head and looks upstream, along the thin wet line that runs on round the bend and away to the upper left, while a run of glints races
// along it that way and the frame tilts up to follow it. Pip watches the touch, then follows Bram's look.
B['s08-bram'] = (u, T) => {
  // the lens rises a little as he lowers his head (we look down into the bed at what he found) and settles back as he looks upstream; the frame
  // shift moves with it so Pip's boots stay put
  const lift8 = K(u, [[0, 0], [1.9, 0], [2.8, 1], [4.0, 1], [5.6, 0]]), c0 = cam8(u), camY = -78 - 26 * lift8, c = cam8(u, { y: camY, z: c0.z + 6 * lift8 });
  const bx = K(u, [[0, 330], [2.4, B8[0]]]), arrived = u > 2.4;
  const TOUCH = 2.95;
  const head = K(u, [[2.45, 0], [2.95, 1], [3.3, 1], [3.5, 0.15], [4.0, 0.1], [4.6, 0.3]]), touch = clamp((u - TOUCH) / 0.7);
  const perk = bump(3.5, 0.13, u);                       // the start: a little hop, a squash that bounces his antennae
  const dy = K(u, [[0, DY8], [3.8, DY8], [5.8, DY8B]]) + P.SH.F * (-camY / (P8[1] - c.z) - 78 / (P8[1] - c0.z)) - 40 * lift8;   // (Pip's boots drop a little, still clear of the edge)
  const bramPose = { x: bx, y: -1.4 * perk, z: B8[1], face: -1, walk: arrived ? null : bramGait(bx - 330), eyes: 1 + 0.22 * ss(3.35, 3.55, u) - 0.1 * ss(4.2, 4.8, u),
    // eyes down on the water, a start, then head and eyes up and away to the left along the wet line, held: that is the way it went
    look: [K(u, [[0, -0.8], [2.4, -0.6], [2.9, -0.3], [3.45, 0.1], [3.8, -1], [6, -1]]), K(u, [[0, 0], [2.5, 0.9], [3.3, 0.9], [3.6, -0.2], [3.85, -0.75], [6, -0.75]])],
    head, headTilt: -0.15 * ss(3.3, 3.7, u), squash: 1 - 0.09 * perk + 0.06 * bump(3.66, 0.1, u),
    brow: K(u, [[0, 0.2], [2.9, -0.2], [3.4, 0.9], [4.2, 0.6], [5.0, 0.5]]), mouth: u > 3.4 && u < 4.6 ? 'o' : u > 4.6 ? 'smile' : 'flat', mouthOpen: u > 3.4 && u < 4.6 ? 0.35 : 0.1,
    breath: u * 0.3, autoBlink: false, blink: both(blinkT(T, 2, 4), actBlink(u, [[4.75, 0.2]])) };
  const nose = P.cast.anchor('bram', bramPose, 'front', T);
  const items = [
    pip({ x: P8[0], y: 0, z: P8[1], face: u > 0.75 ? 1 : -1, eyes: 1 + 0.15 * ss(3.4, 3.6, u), lean: 0.05 * ss(2.6, 3.0, u) * (1 - ss(3.5, 4.0, u)),
      look: [K(u, [[0, -0.5], [0.74, -0.5], [0.75, 0.6], [2.4, 0.8], [2.9, 0.7], [3.4, 0.6], [3.95, 0.6], [4.35, -0.75], [6, -0.75]]), K(u, [[0, -0.2], [0.75, 0], [2.9, 0.55], [3.4, 0.5], [3.95, 0.2], [4.35, -0.55], [6, -0.55]])],   // he follows Bram's look
      headTilt: -0.08 * ss(4.0, 4.5, u), brow: K(u, [[0, -0.5], [1.2, 0.2], [3.0, 0], [3.6, 0.6], [5, 0.7]]), mouth: u > 3.5 ? 'o' : 'flat', mouthOpen: 0.25 * ss(3.5, 3.8, u),
      breath: u * 0.4, autoBlink: false, blink: both(blinkT(T, 1, 3.3), actBlink(u, [[0.68, 0.16], [4.45, 0.16]])) }),
    bram(bramPose),
    !arrived && P.fx.puff(bx + 24, -2, B8[1], (u * 1.7) % 1, { kind: 'dust', scale: 0.6 }),
    P.fx.puff(nose[0] - 3, -3, B8[1] - 2, clamp((u - 2.75) / 0.45), { kind: 'breath', scale: 0.26, dir: -1, n: 5 }),
    wetPatch(c, T, touch, ss(2.0, 2.6, u)),
    bead(nose[0] - 0.4, nose[1] + 1.6, B8[1], ss(3.75, 3.9, u) * (1 - ss(5.2, 5.8, u))),
    drip(nose[0] - 0.4, nose[1] + 1.2, B8[1], WET8Y, clamp((u - 3.3) / 0.5)),   // a drop hangs from his snout as he lifts it, then falls back
    damp(c, DAMP0, 0.5, T, u < 3.9 ? -1 : clamp((u - 3.9) / 2.0), 1, 0.62, { sparse: true }),
    backGlow(P8[0], -22, P8[1] + 8, 36, 46, 0.3), backGlow(bx - 6, -14, B8[1] + 10, 62, 30, 0.24),
  ];
  return set8(T, c, items, [moon(bx, -80, B8[1] + 70, 0.8, 110), moon(WET8.x + 10, -30, WET8.z - 40, 0.45 * ss(2.0, 2.6, u), 46)], dy);
};

// 09 Luma flutters down out of the moonlight and lands on Bram's shell (wings half-folded, then folded). She looks where Bram is
// looking, her antennae flick toward the far end of the wet line, and she opens her wings and flies straight up to see from
// above; Pip and Bram tip their heads back to follow her out of the top of the frame.
B['s09-luma'] = (u, T) => {
  const c = cam8(6 + u * 0.2, { y: -78 });   // the camera keeps its height: Luma leaves out of the top, Pip and Bram stay whole in the frame
  const bp = { x: B8[0], y: 0, z: B8[1], face: -1 }, back = P.cast.anchor('bram', bp, 'back', T);
  const land = [back[0] + 7.6, back[1] + 0.6], a = clamp(u / 2.0), fig = 1 - ss(0, 1, a);
  const up = ss(3.45, 5.0, u);
  const lx = u < 3.45 ? lerp(land[0] + 70, land[0], ss(0, 1, a)) + Math.sin(a * Math.PI * 2) * 22 * fig : lerp(land[0], L9[0], up);
  const ly = u < 3.45 ? lerp(-150, land[1], ss(0, 2.0, u)) + Math.sin(a * Math.PI * 4) * 6 * fig : lerp(land[1], L9[1], up) + 2.5 * Math.sin(u * 3) * up;
  const sat = u > 2.0 && u < 3.45, follow = ss(3.5, 4.4, u);   // how far up the others are looking
  const items = [
    pip({ x: P8[0], y: 0, z: P8[1], face: 1, eyes: 1, look: [K(u, [[0, 0.6], [2.0, 0.7], [2.6, 0.4], [3.4, 0.7]]), K(u, [[0, -0.6], [2.0, -0.3], [3.4, -0.3], [4.2, -1]])], headTilt: -0.12 * follow, brow: 0.3 + 0.3 * follow,
      mouth: u > 2.1 && u < 3.4 ? 'smile' : 'o', mouthOpen: 0.15 + 0.15 * follow, breath: u * 0.4, autoBlink: false, blink: blinkT(T, 1, 3.3) }),
    bram({ ...bp, eyes: 1, look: [K(u, [[0, -0.4], [1.0, 0.2], [2.6, -0.8], [3.4, -0.8], [4.2, 0.2]]), K(u, [[0, -0.5], [1.4, -0.8], [2.6, -0.4], [3.4, -0.4], [4.2, -1]])], head: 0.25 * (1 - ss(0, 0.8, u)), brow: 0.2 + 0.3 * follow, mouth: 'smile', mouthOpen: 0.1,
      breath: u * 0.3, autoBlink: false, blink: blinkT(T, 2, 4) }),
    luma({ x: lx, y: ly, z: B8[1] - 2, face: -1, wings: sat ? 1 - ss(2.0, 2.3, u) * 0.5 - ss(2.45, 2.75, u) * 0.5 + ss(3.2, 3.45, u) : 1, fold: sat ? ss(2.0, 2.75, u) * (1 - ss(3.15, 3.45, u)) : 0,
      flap: u < 2.0 ? u * 7.5 : u > 3.45 ? u * 11 : 0, hover: !sat, antL: -0.3 + 0.6 * bump(2.85, 0.15, u), antR: 0.3 + 0.6 * bump(2.95, 0.15, u),
      eyes: 1, look: u < 2.0 ? [-0.3, 0.5] : [-0.9, K(u, [[2.0, 0.3], [2.8, -0.3]])], brow: 0.3, mouth: u > 2.2 && u < 3.4 ? 'smile' : 'o', mouthOpen: 0.15, autoBlink: false, blink: blinkT(T, 3, 2.9) }),
    damp(c, DAMP0, 0.5, T, -1, 1, 0.62, { sparse: true }), wetPatch(c, T, 0, 1),
    backGlow(P8[0], -22, P8[1] + 8, 36, 46, 0.3), backGlow(B8[0] - 6, -14, B8[1] + 10, 62, 30, 0.24), backGlow(lx, ly - 4, B8[1] + 8, 40, 34, 0.26, [150, 170, 245]),
  ];
  return set8(T, c, items, [moon(B8[0], -80, B8[1] + 70, 0.8, 110), moon(lx, ly - 30, B8[1] + 40, 0.5, 70)], K(u, [[0, DY8B], [2.0, DY9], [5, DY9]]));   // tilts down a touch with her landing
};

// 11 Luma's view. She hovers high over Pip and Bram (the three still readable in the first beat), then rises up and out of the top of the
// frame, and the lens goes up after her: it climbs and pulls back over the dark garden until the whole garden lies below like a map, dark,
// thinned to one idea (o.calm): the dry channel a long line snaking from Pip and Bram, small at the lower right, up across the garden to the
// dam, and there at the upper left one warm glow trapped at the spout, the only warm thing left. A run of cool glints races up the channel
// toward it as the narrator asks where the water stopped, and the last second pushes in on it. Nothing stands between the lens and the line.
const C11 = { x: -80, y: -1100, z: -520, f: 1130, dy: 640 };   // (v5.1: 12% tighter on the channel and the glow)   // (v5: a little closer and further left, so the map is the channel and the glow, not empty ground)
B['s11-crane'] = (u, T) => {
  const hold = 0.7, ky = ss(hold, 3.8, u), kz = ss(1.1, 4.6, u), kf = ss(hold, 4.6, u), glow = ss(1.0, 3.6, u), push = ss(4.4, 6.0, u);
  const c0 = cam8(7, { y: -78 });
  const f = Math.exp(lerp(Math.log(c0.f), Math.log(C11.f), kf)) * (1 + 0.07 * push);
  const c = cam(lerp(c0.x, C11.x, kz) - 40 * push, lerp(c0.y, C11.y, ky), lerp(c0.z, C11.z, kz) + 60 * push, lerp(660, 2200, kf), lerp(30, 14, kf), { f });
  const dy = lerp(DY9, C11.dy, ky) + 10 * push;
  // Luma rises out of the top of the frame (her view takes over)
  const lk = ss(0.25, 1.35, u), lp = [lerp(L9[0], L9[0] - 40, lk), lerp(L9[1], L9[1] - 900, lk * lk) + 2.5 * Math.sin(u * 3 + 15), B8[1] - 2];
  const items = [
    pip({ x: P8[0], y: 0, z: P8[1], face: 1, eyes: 1, look: [K(u, [[0, 0.7], [1.4, 0.4]]), K(u, [[0, -1], [1.4, -1]])], headTilt: -0.14, brow: 0.2, mouth: 'o', mouthOpen: 0.2, breath: u * 0.4, autoBlink: false, blink: blinkT(T, 1, 3.3) }),
    bram({ x: B8[0], y: 0, z: B8[1], face: -1, eyes: 1, look: [K(u, [[0, 0.2], [1.4, 0.4]]), K(u, [[0, -1], [1.4, -1]])], head: 0, headTilt: -0.1, brow: 0.3, mouth: 'smile', mouthOpen: 0.1, breath: u * 0.3, autoBlink: false, blink: blinkT(T, 2, 4) }),
    u < 1.35 && luma({ x: lp[0], y: lp[1], z: lp[2], face: -1, wings: 1, flap: 55 + u * 11, hover: true, eyes: 1, look: [-0.6, -0.6], antL: -0.5, antR: 0.2, brow: 0.1, mouth: 'flat', autoBlink: false, blink: blinkT(T, 3, 3) }),
    // the close wet line fades out as the lens climbs; from high up only the wet dark of the bed stays, and a few small cool sparks run up it
    damp(c, DAMP0, 0.5, T, -1, 1 - ss(0.5, 1.6, u), 0.62, { sparse: true }), damp(c, DAMP0, 0.04, T, -1, 0.8, 0.62, { dark: true }), sparkRun(c, DAMP0, 0.04, clamp((u - 1.6) / 2.8), 1),
    wetPatch(c, T, 0, 1 - kf),
    backGlow(P8[0], -22, P8[1] + 8, 36, 46, 0.3 * (1 - kf * 0.6)), backGlow(B8[0] - 6, -14, B8[1] + 10, 62, 30, 0.24 * (1 - kf * 0.6)),
    backGlow(lp[0], lp[1] - 4, B8[1] + 8, 40, 34, 0.26 * (1 - ss(0, 0.5, u)), [150, 170, 245]),   // (v5.1: shot 9's glow behind Luma, easing out with its keys)
  ];
  // nothing tall stands in front of the climbing lens; the garden is thinned to the line and the glow
  // (v5.1: shot 9's two moon keys carry over and ease out over the first half second, so the cut at 50.0 has no step in brightness)
  const e9 = ss(0, 0.5, u);
  const res = set8(T, c, items, [moon(B8[0], -80, B8[1] + 70, 0.8 * (1 - e9), 110), moon(lp[0], lp[1] - 30, lp[2] + 40, lerp(0.5, 0.6, e9) * (1 - lk), 70), { x: -935, y: -62, z: 2800, col: [1, 0.58, 0.22], i: 0.9 * glow, rad: 260, halo: 0 }], dy,
    { calm: 0, grade: { vignette: lerp(0.6, 0.62, ss(0, 0.5, u)) } }, 544);   // the same flowers all shot long, so none pops
  res.lights = res.lights.map(L => L.col && L.col[0] === 0.62 && L.col[2] === 1 ? Object.assign({}, L, { i: L.i * (1 - 0.85 * kf) }) : L);   // the close moon keys fade: no spotlight on the map
  // v5: the map is Luma's view, so she anchors it: once the lens has climbed after her she glides in from the right into the lower right corner,
  // just in front of the lens, a dark silhouette in profile (head, feathery antennae, the edge of a beating wing) looking up the channel toward
  // the trapped glow, and hovers there while the narrator asks where the water stopped. She is placed through the lens (a fixed screen spot and
  // size, whatever the crane does), soft with the depth of field, and kept dark (no moon key, no lift), so the warm glow stays the brightest thing.
  // v5.1: she comes in earlier (from about 51.6 s, so the dark beat before the glow has her), seen from behind and below: only the back of her head,
  // the feathery antennae pointing up the channel and a wing edge show (no eyes: a head seen from behind, so she looks at the glow, not at us);
  // a thin cool moon rim on her upper left edge and a faint lilac in the wings make her Luma at phone size, still far below the glow
  const sil = ss(1.3, 2.2, u);
  if (sil > 0) {
    // (sx, sy: where her head sits on the screen; SZ: px per unit, so her body is about 180 px long; the rest of her runs off the corner)
    const SZ = 11.5, d = c.f / SZ, sx = lerp(2200, 1600, sil) - 10 * ss(4.4, 6.0, u) + 5 * Math.sin(u * 1.3), sy = lerp(1130, 1030, sil) + 6 * Math.sin(u * 2.2 + 0.6);
    const lp0 = { x: 0, y: 0, z: 0, face: -1, wings: 0.85, flap: 2 + u * 8, hover: true, eyes: 0, look: [-0.9, -0.9], lean: 0.18, antL: -0.6, antR: -0.1, brow: 0.2, mouth: 'flat', shadow: false, autoBlink: false, blink: 0 };
    const hd = P.cast.anchor('luma', lp0, 'head', T), pz = c.z + d, px = c.x + (sx - 960) / SZ - hd[0], py = c.y + (sy + dy - 540) / SZ - hd[1];
    const parts = P.cast.luma(Object.assign({}, lp0, { x: px, y: py, z: pz })), rimA = 0.6 * sil;
    const silItems = [...parts.map(it => ({ z: it.z + 0.5, draw(g, s, t) { g.save(); g.globalAlpha *= rimA; g.translate(-2.6 / s, -2.2 / s);   // the rim: a pale cool copy, offset up-left, behind
        g.filter = 'brightness(0) invert(0.78) sepia(1) hue-rotate(190deg) saturate(2.2)'; it.draw(g, s, t); g.restore(); } })),
      ...parts.map(it => ({ z: it.z, draw(g, s, t) { g.save(); g.filter = 'brightness(0.36) saturate(1.2)'; it.draw(g, s, t); g.restore(); } }))];
    res.items.push(...pitch({ items: silItems, lights: [] }, dy, false).items.filter(it => it.z < 1e11));
  }
  const gp = 1 + 0.08 * Math.sin(T * 2.4);   // the trapped light breathes
  res.items.push(screenGlow(c, -900, -30, 2700, dy, (60 + 120 * glow) * gp, 0.5 * glow), screenGlow(c, -900, -30, 2700, dy, 18 + 26 * glow, 0.7 * glow, '255,206,128'));
  // the map of the garden at night reads at phone size: as the lens climbs, the blacks lift toward a deep moonlit blue (screened, so the
  // darkest parts gain most and the warm spout glow stays the brightest thing in frame)
  const lift = 0.27 * ss(0.2, 1.8, u);   // up before the climb's darkest beat (51.5-52.5), not after it
  if (lift > 0.002) res.items.push({ z: 0.5, screen: true, draw(g) { g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(34,52,104,${lift})`; g.fillRect(0, 0, P.W, P.H); g.restore(); } });
  return res;
};
// Distance along the channel from home (the channel end) toward the spout. The channel parameter u is proportional to arc
// length, so a walker's phase can be driven by the distance covered and the feet stay planted.
const CH_LEN = 2949;
// The side normal is chosen once per leg (the side that faces the camera at the start of the leg) and kept for the whole leg: a
// normal re-picked per sample flips where the channel turns and throws the pack to the other bank in mid-shot.
const sideAt = s => { const d = P.world.chanDir(clamp(1 - s / CH_LEN)); return d[0] > 0 ? 1 : -1; };   // sign so the normal (d.z, -d.x) * sign has nz < 0
const routeAt = (s, sg) => {
  const u = clamp(1 - s / CH_LEN), g = P.world.chan(u), d = P.world.chanDir(u);
  return { x: g[0], z: g[2], ux: -d[0], uz: -d[1], nx: d[1] * sg, nz: -d[0] * sg };
};
// Place something on the route: s = distance upstream from home, off = sideways distance (toward the camera side of the leg's start).
const onRoute = (s, off, sg) => { const r = routeAt(s, sg); return [r.x + r.nx * off, r.z + r.nz * off]; };

// 12 The journey upstream, three moving cuts along the dry channel. Pip leads, Bram trundles a body length behind, Luma flies
// ahead and looks back; everyone faces upstream (screen left) and the gait phase is driven by the distance walked, so the
// planted feet never skate.
//   1. a wide side track over the home stretch: the trio crosses the frame on the far bank, the dry bed in the foreground;
//   2. a low follow from behind and to one side, the amber glow of the dam far ahead in the upper left;
//   3. the approach: the dam wall and the glowing leaf ahead and to the left, the pack on the right walking toward it (shot 13 opens
//      with them walking in from the right, so the screen direction carries through the cut).
// The camera tracks at the pack's speed, so the ground slides under their boots. The side of the channel the pack walks on is fixed
// per leg (sideAt), so nothing jumps where the channel turns.
const V12 = 52;
const LEGS = [
  // a, b: shot-local time span; u0: where on the channel the leg starts; off: sideways offset of the pack from the channel
  // (+ toward the camera side); cx, cd, cy: camera x offset from Pip, distance back from him, and height; dy: tilt of the frame;
  // slip: how fast the pack drifts toward the left of the frame relative to the camera (units/s); push: how much the lens grows
  // over the leg; bram, luma: their [x, z] offsets from Pip. Bram is always on Pip's right, about a body length behind him (the
  // pack walks to screen left), and Luma flies ahead of him on the left.
  { a: 0, b: 2.7, u0: 0.78, off: -58, cx: 4, cd: 250, cy: -60, dy: 330, f: 2400, slip: 8, push: 0, bram: [60, 8], luma: [-30, 24] },
  { a: 2.7, b: 5.3, u0: 0.335, off: 70, cx: 10, cd: 190, cy: -52, dy: 70, f: 1500, slip: 5, push: 260, bram: [64, -4], luma: [-50, 90] },
  { a: 5.3, b: 8, u0: 0.165, off: 100, cx: -26, cd: 226, cy: -56, dy: 70, f: 1380, slip: -10, push: 180, bram: [48, -4], luma: [-40, 20] },   // close enough that no tall plant stands between the lens and the pack
];
B['s12-journey'] = (u, T) => {
  const L = LEGS.find(l => u < l.b) || LEGS[2], t = u - L.a;
  const s0 = (1 - L.u0) * CH_LEN, d = V12 * t, s = s0 + d, sg = sideAt(s0 + 34);
  const pp = onRoute(s + 34, L.off, sg), bp = [pp[0] + L.bram[0], pp[1] + L.bram[1]], lp = [pp[0] + L.luma[0], pp[1] + L.luma[1]];
  const c = cam(pp[0] + L.cx + L.slip * t, L.cy, pp[1] - L.cd, pp[1], 30, { f: L.f + L.push * t / (L.b - L.a) });
  const items = [
    pip({ x: pp[0], y: 0, z: pp[1], face: -1, walk: pipGait(d, 10), stride: 10, lean: 0.06, eyes: 1, look: [-1, -0.1 + 0.05 * Math.sin(t * 2)], brow: -0.1, mouth: 'flat', breath: t, autoBlink: false, blink: blinkT(T, 1, 3.4) }),
    bram({ x: bp[0], y: 0, z: bp[1], face: -1, walk: bramGait(d, 11), stride: 11, eyes: 1, look: [-1, 0], head: 0.1, brow: -0.2, mouth: 'flat', breath: t, autoBlink: false, blink: blinkT(T, 2, 4) }),
    luma({ x: lp[0], y: -42 + 5 * Math.sin(u * 3), z: lp[1], face: -1, wings: 1, flap: u * 8, hover: true, eyes: 1, look: [-0.4, 0.2], brow: -0.1, mouth: 'flat', autoBlink: false, blink: blinkT(T, 3, 3) }),
    backGlow(pp[0], -22, pp[1] + 8, 34, 44, 0.3), backGlow(bp[0], -14, bp[1] + 8, 58, 28, 0.24),
    L === LEGS[2] && pondGlow(0.55, T),   // the last leg sees the dam: the swollen pond behind it, as shot 13 opens on it
  ];
  // The ground rectangle the pack crosses in this leg (plus the lens side of it) is kept free of buds and tall flowers.
  const e0 = onRoute(s0 + 34, L.off, sg), e1 = onRoute(s0 + V12 * (L.b - L.a) + 90, L.off, sg), cx0 = Math.min(e0[0], e1[0]) - 260, cx1 = Math.max(e0[0], e1[0]) + 260;
  const cz0 = Math.min(e0[1], e1[1]) - L.cd - 20, cz1 = Math.max(e0[1], e1[1]) + 150;
  const res = scene(T, c, items, { motes: 0, noFg: true, ambient: NIGHT, grade: { vignette: 0.66 },
    lights: [moon(pp[0] + 10, -100, pp[1] + 150, 0.7, 120), { x: -935, y: -62, z: 2800, col: [1, 0.58, 0.22], i: 0.2, rad: 260, halo: 0 }] });
  const out = pitch(clearing(res, [{ x0: cx0, x1: cx1, z0: cz0, z1: cz1 }]), L.dy);
  if (L === LEGS[1]) out.items.push(screenGlow(c, -900, -30, 2700, L.dy, 220, 0.45));
  return out;
};

// ---------- the spout (shots 13-16) ----------
// The three friends stand on the bare ground left of the channel mouth, at the same depth the last act uses. The leaf lies
// on the ground with its rolled tip in the cleft and its stem to the right, where the pin stone presses on it.
const SPM = () => P.world.chan(0);
const F2 = 2400;                                        // the lens (px per unit at distance 1) used by the spout shots
const spoutScene = (T, c, items, o) => { const M = SPM()[0]; return clearSpoutScatter(clearing(scene(T, c, items, o), [{ x0: M - 230, x1: M + 200, z0: 2300, z1: 2720 }])); };
// The ground scatter (world.js marks each piece with .scat) kept out of the machine's way in every spout shot (13-18), so no cut shows a change:
// nothing grows or lies on the stem's line, on the ground the pin stone rolls back over and where it comes to rest (so a strip of bare ground
// shows between it and the freed stem), and no little flower stands by the seal where Pip's mitts work.
function clearSpoutScatter(res) {
  const M = SPM(), ROW = M[2] - 28, px = PIN_X(), [pr, pb] = P.SH.PIN_REST || [18, 64];
  res.items = res.items.filter(it => { const q = it.scat; if (!q) return true;
    if (q.x > px - 34 && q.x < px + pr + 34 && q.z > ROW - 16 && q.z < ROW + pb + 36) return false;
    if (q.type === 5 && q.x > M[0] - 110 && q.x < M[0] + 40 && q.z > ROW - 30 && q.z < 2700) return false;
    return true; });
  return res;
}
const SPZ = () => SPM()[2] - 28;                        // depth of the friends at the spout
const SPOUT_AMB = [0.14, 0.185, 0.39];                  // the cold garden at night: the same base in every spout shot
const PIP15 = { x: -938, z: 2566 };                     // where Pip lands and sits (end of shot 14, all of 15, start of 16)
// The pin stone is a boulder about as tall as Bram's head, drawn here as an item (pinSpot tells the world to hide its own small stone
// and to lay the leaf's stem flat under this one and out past its far side). Shot 17 draws the very same boulder at the same spot, so the cut from shot 16 to 17 shows one object. Its x is where the
// leaf's stem lies: the leaf base is placed so its tip meets the cleft for the wide camera (x -862, 290 away) used in the climax.
const PIN_X = () => { const M = SPM(), ROW = M[2] - 28, cx = -862, zc = ROW - 290; return cx + (M[0] + 3 - cx) * (M[2] - 12 - zc) / (2692 - zc) - 7 + 132; };
const pinSpot = () => ({ x: PIN_X(), z: SPZ() + 0.5, rot: 0, hide: true, hw: 14 });   // the world draws the stem pinned here, and no stone of its own
// The pin stone (v5): an ordinary stone doing a mechanical job. A muted grey-mauve river stone (a touch warmer than the grey dam stones, so it is
// still the one stone on the stem), soft volume, a plain moonlit top edge and a few soft marks; no vein, no sparkle. A strong contact shadow
// where it bears down on the ground and the stem: darkest right under it and reaching a little past its feet, so the stem visibly goes in
// under its near side and comes out at its far side. Its drawn size stays 14 x 11 so Bram's contact point in shot 17 is unchanged. Act 3 uses
// this same function (P.SH.boulder), so the stone is one object in every shot. rot turns its marks as it rolls; hot is warm light from the pond.
// pale (0..1, v5.1): once Bram has rolled it clear it sits in the open in moonlight, a little paler than the dam stones behind it, on its own soft
// ground shadow, so the climax wide shows which stone moved.
function boulder(x, y, z, rot, hot = 0, pale = 0) {
  const TAU = Math.PI * 2;
  return { z, draw(c, s) {
    const A = 14, Bh = 11, n = 20, pts = [], cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i < n; i++) { const a = i / n * TAU, r = 1 + 0.1 * Math.sin(3 * a + 1.1) + 0.07 * Math.sin(5 * a + 2.3) + 0.04 * Math.sin(8 * a), px = Math.cos(a) * A * r, py = Math.sin(a) * Bh * r; pts.push([px * cr - py * sr, px * sr + py * cr]); }
    const path = k => { const m = pts.length; k.moveTo((pts[m - 1][0] + pts[0][0]) / 2, (pts[m - 1][1] + pts[0][1]) / 2); for (let i = 0; i < m; i++) { const p = pts[i], q = pts[(i + 1) % m]; k.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); } k.closePath(); };
    const mixc = (a, b2, k) => `rgb(${Math.round(lerp(a[0], b2[0], k))},${Math.round(lerp(a[1], b2[1], k))},${Math.round(lerp(a[2], b2[2], k))})`;
    c.save(); c.translate(x, y);
    { const gy = -y - 0.3, rx = A * 1.5, sg = c.createRadialGradient(1.5, gy, 0, 1.5, gy, rx);   // the contact shadow on the ground and the stem
      sg.addColorStop(0, 'rgba(2,3,10,0.96)'); sg.addColorStop(0.7, 'rgba(2,3,10,0.9)'); sg.addColorStop(0.86, 'rgba(2,3,10,0.6)'); sg.addColorStop(1, 'rgba(2,3,10,0)');
      c.save(); c.translate(1.5, gy); c.scale(1, 4.6 / rx); c.translate(-1.5, -gy); c.fillStyle = sg; c.beginPath(); c.arc(1.5, gy, rx, 0, TAU); c.fill(); c.restore(); }
    if (pale > 0.01) { const gy = -y - 0.2, sg2 = c.createRadialGradient(4, gy, 0, 4, gy, A * 2.1);   // the ground shadow it throws back toward the dam (moon in front)
      sg2.addColorStop(0, `rgba(2,3,10,${(0.7 * pale).toFixed(3)})`); sg2.addColorStop(0.6, `rgba(2,3,10,${(0.45 * pale).toFixed(3)})`); sg2.addColorStop(1, 'rgba(2,3,10,0)');
      c.save(); c.translate(4, gy - 2.5); c.scale(1, 0.32); c.translate(-4, -gy); c.fillStyle = sg2; c.beginPath(); c.arc(4, gy, A * 2.1, 0, TAU); c.fill(); c.restore(); }
    const pl = (a, k) => a.map((v, i) => v + ([170, 166, 180][i] - v) * 0.32 * pale * k);
    const g = c.createLinearGradient(0, -Bh, 0, Bh); g.addColorStop(0, mixc(pl([124, 116, 128], 1), [200, 156, 122], hot)); g.addColorStop(0.55, mixc(pl([88, 82, 96], 0.8), [150, 108, 98], hot)); g.addColorStop(1, mixc(pl([40, 38, 52], 0.3), [80, 58, 64], hot));
    P.card(c, path, g, { lift: 1.6, tex: 0.4, shadow: 0.55, edge: 0 });
    c.save(); c.beginPath(); path(c); c.clip();
    const sg = c.createLinearGradient(0, -Bh, 0, 0); sg.addColorStop(0, 'rgba(226,228,244,0.26)'); sg.addColorStop(1, 'rgba(226,228,244,0)'); c.fillStyle = sg; c.beginPath(); c.ellipse(-1, -Bh * 0.45, A * 0.8, Bh * 0.5, 0, 0, TAU); c.fill();
    const og = c.createLinearGradient(0, Bh * 0.2, 0, Bh); og.addColorStop(0, 'rgba(4,6,14,0)'); og.addColorStop(1, 'rgba(4,6,14,0.45)'); c.fillStyle = og; c.fillRect(-A * 1.3, Bh * 0.2, A * 2.6, Bh);   // its dark foot
    c.rotate(rot);
    for (let i = 0; i < 3; i++) { const a = hash(i, 51) * TAU, r = 0.25 + 0.5 * hash(i, 52); c.fillStyle = 'rgba(52,46,62,0.32)'; c.beginPath(); c.ellipse(Math.cos(a) * A * r, Math.sin(a) * Bh * r, 1.2 + 1.0 * hash(i, 53), 0.8 + 0.6 * hash(i, 54), a, 0, TAU); c.fill(); }   // a few soft pits
    for (let i = 0; i < 2; i++) { const a = hash(i, 31) * TAU, r = 0.45 + 0.4 * hash(i, 32); c.fillStyle = 'rgba(78,96,64,0.4)'; c.beginPath(); c.ellipse(Math.cos(a) * A * r, Math.sin(a) * Bh * r, 1.2 + 1.0 * hash(i, 33), 0.8 + 0.6 * hash(i, 34), a, 0, TAU); c.fill(); }   // a little moss
    c.restore();
    // a plain moonlit top edge, clipped to the stone
    c.save(); c.beginPath(); path(c); c.clip();
    const hg = c.createLinearGradient(A * 0.7, -Bh, -A * 0.5, -Bh * 0.2); hg.addColorStop(0, `rgba(214,224,248,${(0.42 + 0.3 * pale).toFixed(3)})`); hg.addColorStop(1, 'rgba(214,224,248,0)');
    c.strokeStyle = hg; c.lineWidth = 0.9 + 0.6 * pale; c.beginPath(); c.moveTo(-A * 0.75, -Bh * 0.5); c.quadraticCurveTo(0, -Bh * 1.18, A * 0.8, -Bh * 0.45); c.stroke();
    c.restore(); c.restore(); } };
}
const pinBoulder = (dx = 0, rot = 0) => boulder(PIN_X() + dx, -11, SPZ() + 0.5, rot, 0.06);
// Where the dry leaf's rolled end is, so a mitt can hold it: the blade tip, with the top and the lower edge of the roll beside it.
const leafEnd = lf => {
  if (P.world.leafScrollEnd) { const e = P.world.leafScrollEnd(lf); return { x: e.x, y: e.y, r: Math.max(e.r, 3), top: e.y - e.r, low: e.y + e.r }; }   // the scroll's open end
  const g = P.world.leafGeo(lf), x = g.tip[0] + 3, top = g.standAt(x), low = g.edgeAt(x);
  return { x: g.tip[0], y: (top + low) / 2, r: Math.max((low - top) / 2, 3), top, low };
};
// Cool light for the three friends: a soft key from behind and above (larger z, high y) plus a back-lit pool of mist.
const rimLight = (x, z, i = 0.7) => moon(x, -92, z + 130, i, 110);
// ---------- the mechanism, made visible ----------
// The leaf's x where the whole film seats it (the tip meets the cleft for the wide camera) and the point on the screen-space plane
// of a character standing in front of the leaf that lines up with a point on the leaf (so a mitt lands exactly on it).
const LEAF_X = () => PIN_X() - 132;
const onPlane = (c, pt, z) => { const k = (z - c.z) / (2588 - c.z); return [c.x + (pt[0] - c.x) * k, c.y + (pt[1] - c.y) * k]; };
// The leaf in the spout shots before the climax: always seated the same way, whatever the story state says.
const seated = (st, o = {}) => Object.assign({}, st.leaf, { x: LEAF_X(), rot: 0.25 }, o);
// The pond behind the dam, made to read as water: a blue-green body standing higher than the dam wall and heaped against the cleft,
// a lighter surface band along its top where it catches the sky, slow ripple rings on the swell, moon glints that twinkle on and off,
// and the trapped warm light carried inside it as small golden particles drifting toward the cleft, where they crowd against the
// plug. press 0..1 is how hard it pushes (taller swell, more and brighter particles). pondDraw draws it in world units at depth PONDZ.
const PONDZ = 2768;
// quiet 0..1 (v5): the band is darker and holds less light near the gap, so the small pocket of water pressed against the plug (world.js
// pressItems) is the brightest water there: no peak heaped over the cleft, a dark veil over the band within about 150 units of it, and fewer,
// dimmer glints and golden particles there.
function pondDraw(c, s, press, T, quiet = 0) {
  const cx = SPM()[0], top = -40, TAU = Math.PI * 2, R = 14 + 24 * press, x0 = cx - 380, x1 = cx + 380, N = 90;
  const nearQ = x => quiet * (1 - ss(120, 260, Math.abs(x - cx)));
  const prof = x => 0.8 * Math.exp(-(((x - cx) / 150) ** 2)) + 0.2 * Math.exp(-(((x - cx) / 360) ** 2)) + 0.12 * (1 - quiet) * Math.exp(-(((x - cx) / 26) ** 2));
  const heave = x => Math.sin((x - cx) * 0.03 + T * 0.9) * 0.6 + Math.sin((x - cx) * 0.071 - T * 1.3) * 0.35;   // a slow swell rolling along the top
  const edge = x => top + 1 - R * prof(x) - heave(x) * Math.min(1, R / 14) * (0.35 + 0.65 * Math.min(1, prof(x) * 1.4));
  const line = k => { for (let i = 0; i <= N; i++) { const x = lerp(x0, x1, i / N); i ? k.lineTo(x, edge(x)) : k.moveTo(x, edge(x)); } };
  const body = k => { k.moveTo(x0, top + 6); for (let i = 0; i <= N; i++) { const x = lerp(x0, x1, i / N); k.lineTo(x, edge(x)); } k.lineTo(x1, top + 6); k.closePath(); };
  c.save();
  const g = c.createLinearGradient(0, top - R - 2, 0, top + 5);
  g.addColorStop(0, 'rgb(36,92,112)'); g.addColorStop(0.45, 'rgb(20,62,84)'); g.addColorStop(1, 'rgb(9,28,48)');
  c.fillStyle = g; c.beginPath(); body(c); c.fill();
  c.save(); c.beginPath(); body(c); c.clip();
  // the trapped light deep in the water by the cleft: a warm cloud under the surface, not a lamp
  for (const [rad, a0, mode] of [[130, 0.34, 'source-over'], [46, 0.3, 'lighter']]) {
    c.globalCompositeOperation = mode; const rg = c.createRadialGradient(cx, top - 3, 0, cx, top - 3, rad);
    rg.addColorStop(0, `rgba(255,190,104,${a0 * press * (1 - 0.6 * quiet)})`); rg.addColorStop(0.45, `rgba(214,128,58,${a0 * 0.45 * press * (1 - 0.6 * quiet)})`); rg.addColorStop(1, 'rgba(180,96,40,0)');
    c.save(); c.translate(cx, top - 3); c.scale(1, Math.max(R, 14) / 44); c.translate(-cx, -(top - 3)); c.fillStyle = rg; c.beginPath(); c.arc(cx, top - 3, rad, 0, TAU); c.fill(); c.restore(); }
  c.globalCompositeOperation = 'source-over';
  // the surface band: the top of the swell catches the sky, a lighter teal sheet that thins toward the dam
  c.lineJoin = 'round'; c.lineCap = 'round';
  for (const [w, col] of [[9, 'rgba(92,154,172,0.28)'], [4.5, 'rgba(132,190,204,0.32)'], [1.8, 'rgba(176,222,232,0.38)']]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); line(c); c.stroke(); }
  if (quiet > 0.01) { const vg = c.createLinearGradient(cx - 280, 0, cx + 280, 0), vc = a => `rgba(5,13,26,${(a * quiet).toFixed(3)})`;   // the dark veil near the gap
    vg.addColorStop(0, vc(0)); vg.addColorStop(0.27, vc(0.5)); vg.addColorStop(0.5, vc(0.62)); vg.addColorStop(0.73, vc(0.5)); vg.addColorStop(1, vc(0)); c.fillStyle = vg; c.fillRect(cx - 280, top - R - 10, 560, R + 20); }
  c.globalCompositeOperation = 'lighter';
  // slow ripple rings on the swell (flattened: the surface is seen at a grazing angle)
  for (const [rx, rk, ph] of [[cx - 150, 0.45, 0], [cx + 170, 0.4, 0.37], [cx - 30, 0.62, 0.71], [cx + 300, 0.3, 0.2]]) {
    const yc = top - R * prof(rx) * rk;
    for (let i = 0; i < 3; i++) { const r = ((T * 4.5 + i * 13 + ph * 39) % 39) + 4, al = 0.34 * (1 - r / 43) * Math.min(1, r / 8) * (1 - 0.8 * nearQ(rx));
      c.strokeStyle = `rgba(170,220,232,${al})`; c.lineWidth = 1.2 / s; c.beginPath(); c.ellipse(rx, yc, r * 1.7, r * 0.3, 0, Math.PI * 1.06, Math.PI * 1.94); c.stroke();
      c.strokeStyle = `rgba(140,196,214,${al * 0.45})`; c.beginPath(); c.ellipse(rx, yc, r * 1.7, r * 0.3, 0, Math.PI * 0.12, Math.PI * 0.88); c.stroke(); } }
  // moon glints: small, sparse, twinkling on and off along the lit surface (strongest toward the moon, right of the cleft)
  for (let i = 0; i < 26; i++) { const h = hash(i, 801), x = cx - 300 + 640 * Math.pow(hash(i, 802), 0.8), y = edge(x) + 1.2 + hash(i, 803) * Math.max(3, R * prof(x) * 0.45);
    const tw = Math.pow(Math.max(0, Math.sin(T * (1.4 + 1.6 * h) + h * 50)), 3) * (0.45 + 0.55 * ss(cx - 200, cx + 200, x)) * (1 - 0.9 * nearQ(x)); if (tw < 0.04) continue;
    const l = 1.4 + 2.6 * hash(i, 804); c.strokeStyle = `rgba(226,242,255,${0.85 * tw})`; c.lineWidth = 1.1 / s; c.beginPath(); c.moveTo(x - l, y); c.lineTo(x + l, y); c.stroke();
    const dg = c.createRadialGradient(x, y, 0, x, y, 2.4); dg.addColorStop(0, `rgba(230,244,255,${0.5 * tw})`); dg.addColorStop(1, 'rgba(200,226,255,0)'); c.fillStyle = dg; c.fillRect(x - 2.4, y - 2.4, 4.8, 4.8); }
  // the light carried in the water: golden particles drifting in from the whole pond toward the cleft, crowding against the plug
  const n = Math.round(30 + 24 * press);
  for (let i = 0; i < n; i++) {
    const per = 5 + 4 * hash(i, 811), ph = (T / per + hash(i, 812)) % 1, e = 1 - Math.pow(1 - ph, 1.7);
    const sx = cx + (hash(i, 813) - 0.5) * 560 * (0.45 + 0.55 * hash(i, 814)), sy = top - R * prof(sx) * (0.15 + 0.65 * hash(i, 815));
    const tx = cx + (hash(i, 816) - 0.5) * 14, ty = top + 1 - 3 * hash(i, 817);   // into the gap, where they sink out of sight behind the crest
    const px = lerp(sx, tx, e), py = lerp(sy, ty, e) + 1.2 * Math.sin(T * 1.3 + i * 1.7) * (1 - e);
    if (py < edge(px) + 0.8) continue;
    const al = Math.pow(Math.sin(Math.PI * ph), 0.7) * (0.5 + 0.5 * press) * (0.6 + 0.4 * hash(i, 818)) * (1 - 0.92 * nearQ(px)), r = (0.55 + 0.7 * hash(i, 819)) * 2.4;
    const pg = c.createRadialGradient(px, py, 0, px, py, r); pg.addColorStop(0, `rgba(255,240,190,${al})`); pg.addColorStop(0.3, `rgba(255,196,96,${al * 0.6})`); pg.addColorStop(1, 'rgba(255,160,60,0)');
    c.fillStyle = pg; c.fillRect(px - r, py - r, 2 * r, 2 * r); }
  c.restore();
  // the meniscus: a bright wet line where the swell meets the night
  { const mg = c.createLinearGradient(x0, 0, x1, 0), ma = x => `rgba(200,232,242,${(0.55 * (1 - 0.6 * nearQ(x))).toFixed(3)})`; for (let i = 0; i <= 8; i++) { const x = lerp(x0, x1, i / 8); mg.addColorStop(i / 8, ma(x)); }
    c.strokeStyle = mg; c.lineWidth = 1.3 / s; c.beginPath(); line(c); c.stroke(); }
  c.restore();
}
function pondGlow(press, T, quiet = 0) { return { z: PONDZ, draw(c, s) { pondDraw(c, s, press, T, quiet); } }; }
// v5: every spout shot (13-18) quiets the pond band near the gap the same way and calms the big blade and the dam stones behind the machine
// (world.js st.spoutCalm), so the plug, the water pressed against it and the hands on the machine are what the eye finds, and no cut shows a change
const POND_QUIET = 0.85, SPOUT_CALM = 0.85, SPOUT_HUSH = 0.5;   // (v5.1 hush: the blade away from the roll a shade darker in every spout shot, so the roll
// in the gap is the place to look and the blade reads less as a canopy over the outlet; shot 17's tight wide goes to 1)
P.SH.POND_QUIET = POND_QUIET; P.SH.SPOUT_CALM = SPOUT_CALM; P.SH.SPOUT_HUSH = SPOUT_HUSH;

// A twinkle on one part of the machine: a soft four-point star that pulses, to say "this is the part". k 0..1.
const glint = (x, y, z, k, T, r = 6.5, star = 1) => ({ z, draw(c, s) {   // star 0..1: the four-point twinkle over the soft glow (v5.1: shot 16 fades it out by its end)
  if (k < 0.01) return; const p = 0.75 + 0.25 * Math.sin(T * 6);
  c.save(); c.globalCompositeOperation = 'lighter'; c.translate(x, y);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(255,240,200,${0.8 * k * p})`); g.addColorStop(0.4, `rgba(255,196,110,${0.35 * k * p})`); g.addColorStop(1, 'rgba(255,170,80,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  if (star < 0.01) { c.restore(); return; }
  const L = r * 1.15 * k * (0.4 + 0.6 * star), w = r * 0.16 * k; c.fillStyle = `rgba(255,248,224,${0.95 * k * p * star})`;
  c.beginPath(); c.moveTo(0, -L); c.quadraticCurveTo(w, -w, L, 0); c.quadraticCurveTo(w, w, 0, L); c.quadraticCurveTo(-w, w, -L, 0); c.quadraticCurveTo(-w, -w, 0, -L); c.closePath(); c.fill();
  c.restore(); } });
P.SH.boulder = boulder; P.SH.backGlow = backGlow; P.SH.pondGlow = pondGlow; P.SH.glint = glint; P.SH.clearSpoutScatter = clearSpoutScatter;

// 13 The mechanism, then the one thing that holds it. (A, u 0-4.4) The three-quarter view from where shot 17 will end: the pond
// glowing and swollen behind the dam, the rolled leaf stuffed in the cleft, the one lilac stone at the right on the leaf's stem, the
// dry channel below. The friends walk in from the right (the way they were heading in shot 12), stop left of the cleft and turn to
// the leaf; Luma flies on ahead and hovers over the cleft. The narrator says what holds back the stream while the pond's light
// streams toward the cleft and bunches against the leaf. (B, u 4.4-6.7) A cut to a tight, still insert: the stem running under the
// lilac stone and out the other side; the pond pushes, the leaf shivers, the stem tugs and the stone does not move. (C, u 6.7-9)
// A cut to Pip and Bram: Pip looks from the stone to the leaf and sets his jaw.
B['s13-spout'] = (u, T) => {
  const m = SPM(), M = m[0], ZR = SPZ(), PX = M - 68, PZ = ZR - 14;
  const seg = u < 4.4 ? 'A' : u < 6.7 ? 'B' : 'C';
  const press = 0.55 + 0.35 * ss(1.5, 4.5, u), pulse = 0.5 * bump(2.9, 0.2, u) + 0.45 * bump(3.8, 0.2, u) + 0.6 * bump(5.3, 0.18, u) + 0.5 * bump(6.0, 0.18, u);
  const st = P.state(T); st.pinStone = pinSpot(); st.leaf = seated(st, { rot: 0.25 + (0.004 * Math.sin(T * 23) + 0.012 * pulse) * press }); st.spoutCalm = SPOUT_CALM; st.spoutHush = SPOUT_HUSH;
  let c;
  // a three-quarter view wide enough to hold, left to right: Pip, the plugged cleft, the leaf, the lilac stone, and Bram beyond the stone
  // (A) the walk-in wide; as the line names the leaf (66.2) the lens eases closer onto the seal (and a touch higher, to see into the bed) (the swell against the leaf, the seep
  // under it dying in the dry bed, the stone on the stem) and holds there a second with the stem twinkle before the insert
  // (v4.4: the push-in is slow, starts as Pip stops and is still moving at the cut. It rises as it closes in and shifts the lens down (pitch)
  // so the roll stays at the same height in frame: from higher up the lens sees over the near cobbles into the start of the dry channel,
  // where the trickle squeezed out under the roll pools; Pip drifts out at the left, the stone on the stem stays at the right.)
  let dyA = 0;
  if (seg === 'A') { const kA = ss(0, 2.2, u), kP = PUSH13.k(u), dA = lerp(lerp(420, 410, kA), PUSH13.d, kP), cy = lerp(-46, PUSH13.y, kP);
    c = cam(lerp(lerp(-851, -847, kA), PUSH13.x, kP), cy, ZR - dA, ZR + 0.14 * dA, 30);
    const yAt = (cyy, d) => (PUSH13.ry - cyy) * F2 / (2588 - ZR + d), y0 = yAt(-46, 410);   // the roll's height on screen (from the centre), unshifted at the start
    dyA = yAt(cy, dA) - lerp(y0, PUSH13.ty, kP); }
  else if (seg === 'B') { const kB = ss(4.4, 6.7, u), d = lerp(136, 128, kB); c = cam(PIN_X() - 20, -15, ZR - d, ZR + 4, 16); }
  else { const kC = ss(6.7, 9, u); c = cam(PX + 15 - 2 * kC, -29, PZ - lerp(104, 96, kC), PZ, 16); }   // (v4.4: a deeper focus, so the curled leaf tip behind his shoulder reads as a leaf, not a soft brown stump)
  // the walk in: Pip comes from the right, stops left of the cleft and turns to the leaf (a blink hides the turn); Bram trundles in from the
  // right edge behind the stone and stops just past it (where he watches from in shot 14), so nothing stands in front of the plug
  const wP = ss(0, 1.15, u), wB = ss(0, 1.5, u), pipTurn = u > 1.3;
  const stepIn = seg === 'A' ? 30 * ss(2.1, 3.3, u) : 0, stepping = seg === 'A' && u > 2.1 && u < 3.3;   // (v5.1: on the line he steps in toward the seal to look)
  const pipX = lerp(PX + 16, PX, wP) + stepIn, B13 = BRAM14.x + 12, bramX = lerp(B13 + 72, B13, wB);   // (Pip starts left of the seal, clear of the water in the slot)
  const see = ss(1.6, 2.0, u), real = ss(2.8, 3.8, u), resolve = ss(7.6, 8.3, u);
  // (Luma stays out of the picture while the seal, the swell and the pinned stem register: she drops in from the top left once the line has named
  // the leaf, and hovers over the cleft for the stem twinkle)
  const lumaX = K(u, [[0, M - 70], [2.3, M - 58], [3.4, M + 4], [9, M + 10]]), lumaY = K(u, [[0, -104], [1.2, -100], [2.2, -84], [3.4, -56], [4.1, -50], [9, -50]]) + 2.5 * Math.sin(u * 3.2) * ss(3.0, 3.6, u);
  const items = [
    pip({ x: pipX, y: 0, z: PZ, face: pipTurn ? 1 : -1, walk: u < 1.15 ? pipGait(pipX - (PX + 16), 4) : stepping ? pipGait(stepIn, 7.5) : null, stride: u < 1.15 ? 4 : 7.5, eyes: 1 + 0.12 * see,
      look: pipTurn ? [K(u, [[1.3, 0.6], [2.0, 1], [6.7, 1], [7.2, 0.2], [7.7, 1]]), K(u, [[1.3, 0], [2.0, -0.1], [4, 0.2], [6.7, 0.35], [7.7, 0]])] : [-1, 0],
      brow: K(u, [[0, -0.1], [2.0, 0.6], [3.0, 0.5], [3.8, -0.5], [6.7, -0.7], [7.6, -0.6], [8.3, -0.9]]), mouth: u < 3.4 ? 'o' : u < 7.6 ? 'frown' : 'grit', mouthOpen: K(u, [[0, 0.05], [2.0, 0.4], [3.4, 0.1], [7.6, 0.05], [8.3, 0.15]]),
      headTilt: 0.1 * real * (1 - resolve) - 0.05 * resolve, squash: 1 - 0.05 * bump(8.0, 0.12, u), lean: 0.06 * resolve,
      breath: u * 0.5, autoBlink: false, blink: both(blinkT(T, 1, 3.7), actBlink(u, [[1.22, 0.16], [3.7, 0.45], [7.5, 0.2]])) }),
    bram({ x: bramX, y: 0, z: BRAM14.z, face: -1, walk: u < 1.5 ? bramGait(bramX - (B13 + 72), 11) : null, stride: 11, eyes: 1,
      look: [K(u, [[0, -1], [1.5, -0.9], [2.4, -1], [4.3, -0.7], [5.4, -0.5]]), K(u, [[0, 0], [2.4, 0.1], [4.3, 0.45], [5.4, 0.6]])], head: 0.2 * ss(2, 3.5, u) + 0.15 * ss(4.4, 5.0, u),
      brow: K(u, [[0, 0.1], [3, -0.3], [5.2, -0.5], [8, 0.1]]), mouth: 'flat', breath: u * 0.3, autoBlink: false, blink: both(blinkT(T, 2, 4.3), actBlink(u, [[1.62, 0.16]])) }),
    luma({ x: lumaX, y: lumaY, z: ZR - 8, face: 1, wings: 1, flap: u * 8, hover: true, eyes: 1, look: [u < 3.2 ? 0.4 : -0.3, K(u, [[0, 0.1], [2.8, 0.9]])], antL: -0.5, antR: 0.5,
      brow: 0.1 - 0.5 * ss(2.8, 3.6, u), mouth: 'o', mouthOpen: 0.15, autoBlink: false, blink: both(blinkT(T, 3, 3), actBlink(u, [[2.55, 0.16]])) }),
    backGlow(pipX, -22, PZ + 8, 34, 44, 0.3), backGlow(bramX, -14, BRAM14.z + 8, 50, 26, 0.22), pinBoulder(),
    pondGlow(press, T, POND_QUIET),
    // (v5: no twinkle at the pinch: the stone is an ordinary stone doing a mechanical job; its contact shadow and the stem going in under it
    // and out past it carry the read)
  ].flat();
  const res13 = pitch(lowCobble(seg === 'A', spoutScene(T, c, items, { st, noFg: true, motes: seg === 'B' ? 2 : 5, ambient: SPOUT_AMB, grade: { vignette: 0.68, bloom: 0.3 },
    lights: [rimLight(PX + 20, PZ, 0.75), rimLight(BRAM14.x, BRAM14.z, 0.55), moon(M + 60, -80, 2560, 0.35, 90), { x: M - 2, y: -30, z: 2672, col: [1, 0.62, 0.28], i: 0.5 * press, rad: 140, halo: 0 },
      seg === 'B' ? moon(PIN_X() - 20, -40, ZR - 30, 0.5, 40) : null].filter(Boolean) })), dyA, false);
  return seg === 'A' ? P.SH.lensShift(res13, 0, false, PUSH13.hx * PUSH13.k(u)) : res13;
};
// (polish) In shot 13's opening wide the lens sits low, and the near rim cobble at the channel mouth stands right in front of where the seep
// trickle lands, hiding its foot and puddle (so the dry mouth it runs into did not read). For that camera the cobble is drawn low, a flatter
// stone squashed down onto its base, for the whole segment (no change inside the shot), so the trickle's foot and its puddle show from 64.0.
const lowCobble = (on, res) => { if (!on) return res; const f = P.world.seepFoot && P.world.seepFoot(); if (!f) return res;
  res.items = res.items.map(it => { const q = it.stone; if (!q || q.side !== -1 || Math.abs(q.x - f[0]) > 12 || !(q.z < f[2] - 20 && q.z > f[2] - 70)) return it;
    return Object.assign(Object.create(it), { draw: (c, s, t) => { c.save(); c.scale(1, 0.32); it.draw(c, s, t); c.restore(); } }); });
  return res; };
// Shot 13's push-in (segment A): the ease (slow in from u 1.4, still moving at the cut at 4.4) and where it heads: lens distance d, x and
// height y; ry is the roll's height (world y) and ty the screen offset from the centre the roll ends at.
const PUSH13 = { k: u => ss(1.4, 5.3, u), d: 262, x: -851, y: -72, ry: -10, ty: 60, hx: 40 };   // (v5.1: a gentler push, a little further left, with a small lens shift
// (hx, px) so Pip, who steps in toward the seal on the line, stays whole on the left and the stone on its stem stays whole on the right)

// 14 Pip tries alone. A medium-wide that holds the whole machine: Pip on the left at the rolled end of the leaf, the leaf running
// right to the lilac stone on its stem, and Bram (Luma perched on his shell) a step back in front of the leaf, watching. Pip takes
// the rolled end in both mitts, braces his feet and heaves: the leaf slides a hair toward him and the curl gives a little, the stem
// pulls straight and tight under the stone, the stone does not move. His grip fails and he is thrown onto his back, a puff of dust;
// he lies a beat, then rolls up to sit hugging his knees (the pose shot 15 opens on).
const PIP14 = { z0: 2586, z1: 2566 };   // he stands at the leaf's plane to hold it; the fall throws him back toward the lens
// The heaves: how hard Pip pulls (0..1.25). Three heaves, each a little harder, with a half let-off between them (the stem's spring pulls
// the leaf back each time); the third is the big one, and at its peak (SLIP14) his grip fails.
const SLIP14 = 2.9;
const heave14 = u => u >= SLIP14 ? 0 : K(u, [[1.0, 0], [1.3, 0.85], [1.45, 0.8], [1.62, 0.3], [1.9, 1.0], [2.05, 0.95], [2.2, 0.35], [2.5, 1.1], [2.62, 1.05], [2.7, 0.75], [2.86, 1.25], [SLIP14, 1.25]]);
// Grit at a stone's foot: a few grains hop out and settle each time the stem tugs (k 0..1 = time through one hop).
const grit = (x, z, k, seed, n = 7) => ({ z: z - 0.3, draw(c, s) {
  if (k <= 0 || k >= 1) return;
  c.save();
  for (let i = 0; i < n; i++) { const h = hash(i + seed * 13, 61), dx = (h - 0.5) * 16 + (h > 0.5 ? 3 : -3), vy = 3 + 4 * hash(i + seed * 13, 62), kk = clamp(k * (0.85 + 0.3 * hash(i, 63)));
    const gx = x + dx * kk, gy = -vy * 4 * kk * (1 - kk) - 0.4, r = Math.max(0.35 + 0.35 * hash(i, 64), 1.1 / s);
    c.fillStyle = `rgba(${h > 0.4 ? '120,104,92' : '70,60,58'},${0.9 * (1 - ss(0.7, 1, k))})`; c.beginPath(); c.arc(gx, gy, r, 0, Math.PI * 2); c.fill(); }
  c.restore(); } });
B['s14-pull'] = (u, T) => {
  const m = SPM(), M = m[0], ZR = SPZ();
  const force = heave14(u), fN = clamp(force), shake = Math.sin(u * 21) * fN;
  // the release: from SLIP14 his grip fails and he goes over backwards with no pause; the face changes over five frames
  // (one held frame of anticipation after the slip, then the face changes over five frames; the fall starts slow and catches up, landing unchanged)
  const rel = ss(SLIP14 + 0.034, SLIP14 + 0.2, u), d0 = clamp((u - SLIP14) / 1.05), fall = d0 - 0.05 * Math.sin(Math.PI * clamp(d0 / 0.2)), up = ss(4.25, 4.95, u);   // onBack: lands at 0.86 (u 3.8), then he rolls up to sit
  const rot = ss(0, 0.86, fall);
  // the leaf: each heave drags it toward him (up to ~15 units) and loosens the roll; the pinned stem springs it back between heaves. When his
  // grip fails the stem whips it back over four frames, a little past its seat, and it settles.
  const US = SLIP14 - 1 / 30;                                            // the last frame he holds it
  const slideAt = uu => 12 * heave14(uu) * (0.94 + 0.06 * Math.sin(uu * 17));
  const back14 = 1 - ss(SLIP14, SLIP14 + 0.13, u);                       // 1 at the slip, 0 once the stem has pulled it home
  const slide = u < SLIP14 ? slideAt(u) : slideAt(US) * back14 - 2.2 * bump(SLIP14 + 0.17, 0.05, u) + 0.8 * bump(SLIP14 + 0.27, 0.05, u);
  const fL = u < SLIP14 ? fN : clamp(heave14(US)) * (1 - ss(SLIP14 + 0.03, SLIP14 + 0.26, u));   // how far the roll is loosened and lifted (it winds tight again over seven frames)
  const st = P.state(T); st.pinStone = Object.assign(pinSpot(), { taut: ss(0.55, 0.85, fN) * (u < SLIP14 ? 1 : 1 - ss(SLIP14, SLIP14 + 0.12, u)) });   // the stem snaps straight on each heave
  st.spoutCalm = SPOUT_CALM; st.spoutHush = SPOUT_HUSH;
  const E0 = leafEnd(seated(st));                                        // the rolled end at rest: the camera and the walk are set from it
  st.leaf = seated(st, { x: LEAF_X() - slide, curl: 1 - 0.13 * fL, lift: 0.3 * fL, rot: 0.25 + 0.02 * shake });
  // both mitts on the rolled end: the far one (armL) over its top edge, the near one (armR) wrapped round the near face of the roll
  const E = leafEnd(st.leaf), gL = [E.x + 3, E.top + 1.8], gR = [E.x + 2, E.low + 1.2];
  const grab = ss(0.65, 1.15, u), holding = u < SLIP14;
  const x0 = E0.x - 40, xWalkAt = uu => lerp(x0, E0.x - 16, clamp(uu / 0.9)), xWalk = xWalkAt(u), walking = u < 0.9;
  const pz = lerp(PIP14.z0, PIP14.z1, ss(SLIP14, 3.8, u));
  const leanHoldAt = uu => { const n = clamp(heave14(uu)); return -0.3 * n + 0.04 * Math.sin(uu * 21) * n + 0.1 * (1 - ss(0, 0.5, uu)); };
  const leanHold = leanHoldAt(u), leanFall = -(0.375 + 0.2 * ss(SLIP14, SLIP14 + 0.14, u)) * (1 - rot);
  const fF = holding ? fN : 1, eyesHold = lerp(1, 0.22, fF), browHold = lerp(-0.1, -0.8, fF);   // the strained face as it was when the grip failed, crossfading out
  const pose = { x: xWalk, y: 0, z: pz, face: 1, lean: holding ? leanHold : leanFall, headTilt: -0.16 * fF * (1 - rel), squash: 1 - 0.1 * fF * (1 - rel),
    walk: walking ? pipGait(xWalk - x0, 8) : u < 3.6 ? 0.18 : null, stride: walking ? 8 : 8 * (1 - ss(SLIP14 + 0.05, 3.55, u)) + 0.4, onBack: fall * (1 - up), sit: up,
    eyes: lerp(eyesHold, K(u, [[SLIP14, 1.2], [3.8, 0.9], [4.6, 0.8]]), rel), brow: lerp(browHold, K(u, [[SLIP14, -0.2], [3.6, -0.3], [4.4, -0.9]]), rel),
    mouth: rel < 0.45 ? (fF > 0.3 ? 'grit' : 'flat') : u < 4.2 ? 'o' : 'frown', mouthOpen: rel < 0.45 ? 0.2 : K(u, [[SLIP14 + 0.07, 0.25], [3.1, 0.6], [4.2, 0.1]]),
    look: [K(u, [[0, 0.8], [2.9, 0.9], [3.6, 0.2], [4.6, 0.4]]), K(u, [[0, 0.1], [2.9, 0.15], [3.8, -0.8], [4.6, 0.6]])], autoBlink: false,
    blink: u > 4.0 ? both(blinkT(T, 1, 3.3), actBlink(u, [[4.1, 0.4]])) : 0, breath: u * 0.5 };
  let braceX = xWalk;
  const solveX = (pp, target) => { const bp = Object.assign({}, pp); for (let i = 0; i < 5; i++) { const a = P.cast.anchor('pip', bp, 'mittR', T); bp.x += target[0] - a[0]; } return bp.x; };
  // The brace at shot time uu: the body x that puts the near mitt exactly on the rolled end where that heave has dragged it (IK), and the two
  // grip points. The holding frames use it, and the release starts from its value on the last held frame, so the body never jumps.
  const braceAt = uu => {
    const n = clamp(heave14(uu)), lf = seated(st, { x: LEAF_X() - slideAt(uu), curl: 1 - 0.13 * n, lift: 0.3 * n, rot: 0.25 + 0.02 * Math.sin(uu * 21) * n }), e = leafEnd(lf);
    const r = [e.x + 2, e.low + 1.2], l = [e.x + 3, e.top + 1.8], xw = xWalkAt(uu);
    const bp = { x: xw, y: 0, z: PIP14.z0, face: 1, lean: Math.min(leanHoldAt(uu), -0.08), squash: 0.9, walk: 0.18, stride: 8, armR: { reach: r }, armL: { reach: l } };
    return { x: lerp(xw, solveX(bp, r), ss(0.7, 1.1, uu)), lean: leanHoldAt(uu), gR: r, gL: l };
  };
  // Arm angles { sh, el } that put the mitt on a world point for this pose (Newton on the cast's own anchor, elbow below the line, as the
  // reach IK chooses): lets an arm that was reaching hand over smoothly to a swung arm.
  const fitArm = (pp, key, tgt, g0) => {
    const nm = key === 'armR' ? 'mittR' : 'mittL', at = q => P.cast.anchor('pip', Object.assign({}, pp, { [key]: q }), nm, T), a = { sh: g0[0], el: g0[1] }, e = 1e-3;
    for (let i = 0; i < 8; i++) { const m0 = at(a), ms = at({ sh: a.sh + e, el: a.el }), me = at({ sh: a.sh, el: a.el + e });
      const j00 = (ms[0] - m0[0]) / e, j01 = (me[0] - m0[0]) / e, j10 = (ms[1] - m0[1]) / e, j11 = (me[1] - m0[1]) / e, det = j00 * j11 - j01 * j10, rx = tgt[0] - m0[0], ry = tgt[1] - m0[1];
      if (Math.abs(det) < 1e-6 || Math.hypot(rx, ry) < 0.02) break;
      a.sh += clamp((j11 * rx - j01 * ry) / det, -0.4, 0.4); a.el += clamp((-j10 * rx + j00 * ry) / det, -0.4, 0.4); }
    return a;
  };
  if (holding) {
    const rest = [pose.x + 9, -14], H = braceAt(u);
    pose.armR = { reach: [lerp(rest[0], gR[0], grab), lerp(rest[1], gR[1], grab)] };
    pose.armL = { reach: [lerp(rest[0] - 3, gL[0], grab), lerp(rest[1] + 3, gL[1], grab)] };
    pose.x = braceX = H.x;
  } else {
    // the body goes on from the brace it had on the last held frame: the same x, drifting back, and the lean easing from the strain into the fall
    const H = braceAt(US);
    pose.x = braceX = lerp(H.x, PIP15.x, ss(SLIP14, 3.85, u));
    pose.lean = lerp(H.lean, leanFall, ss(SLIP14 + 0.01, SLIP14 + 0.2, u));
    // the fists stay where the roll was as it whips away (they slip off it: the near one down, the far one back), then swing: the near arm
    // down and forward, below his chest and clear of his face; the far arm up and back with the fall
    const tr = ss(SLIP14, SLIP14 + 0.1, u), tR = [H.gR[0] + 2 * tr, H.gR[1] + 5 * tr], tL = [H.gL[0] - 1.5 * tr, H.gL[1] - 1.5 * tr];
    const sw = ss(SLIP14 + 0.05, SLIP14 + 0.42, u), kick = bump(0.74, 0.16, fall * (1 - up));
    if (up < 0.995) {
      const aR = sw < 0.999 ? fitArm(pose, 'armR', tR, [1.2, 0.5]) : { sh: 0, el: 0 }, aL = sw < 0.999 ? fitArm(pose, 'armL', tL, [1.8, 0.3]) : { sh: 0, el: 0 };
      // (the near mitt goes down and back to catch the fall, open and empty, well clear of the boots as his legs kick up and clear of his face:
      // nothing beside the boots reads as something held)
      const swL = { sh: 2.3 + 0.2 * kick, el: 0.35 }, catchAt = [pose.x - 13 - 3 * kick, -3 - 2 * kick];   // the ground behind him
      pose.armR = { reach: [lerp(tR[0], catchAt[0], sw), lerp(tR[1], catchAt[1], sw)] }; pose.armL = { sh: lerp(aL.sh, swL.sh, sw), el: lerp(aL.el, swL.el, sw) };
      if (up > 0) {   // rolling up to sit: the arms ease into the sitting pose's own (the mitts settle on his knees), so nothing snaps
        const kU = ss(0, 1, up), dR = P.cast.anchor('pip', Object.assign({}, pose, { armR: { sh: 0.16, el: 0.45 } }), 'mittR', T);
        pose.armR = { reach: [lerp(catchAt[0], dR[0], kU), lerp(catchAt[1], dR[1], kU)] }; pose.armL = { sh: lerp(swL.sh, -0.3, kU), el: lerp(swL.el, 0.3, kU) };
      }
    }
  }
  const px = pose.x, xLand = PIP15.x - 6;                                // the dust stays where he hit the ground
  // Bram a step back in front of the leaf, facing Pip; Luma perched on his shell. They lean in on the heave and flinch at the fall.
  const flinch = bump(3.5, 0.25, u), bramPose = { x: BRAM14.x, y: 0, z: BRAM14.z, face: -1, eyes: 1 + 0.15 * flinch, look: [K(u, [[0, -0.8], [3.0, -0.9], [3.6, -1]]), K(u, [[0, 0.1], [3.0, 0.1], [3.8, 0.5]])],
    head: 0.15 * fN, lean: -0.05 * fN + 0.06 * flinch, brow: K(u, [[0, 0.1], [1.5, -0.2], [3.1, 0.5], [4.2, -0.4]]), mouth: u > 3.1 && u < 4.2 ? 'o' : 'flat', mouthOpen: 0.25 * flinch,
    breath: u * 0.3, autoBlink: false, blink: blinkT(T, 2, 4.1) };
  const back = P.cast.anchor('bram', bramPose, 'back', T);
  // the stone takes each tug: a hair's shiver while the stem is at full stretch, grit spitting from its foot at each heave
  const tug = ss(0.75, 1, fN), shiver = 0.13 * tug * Math.sin(u * 61);
  const items = [
    pip(pose),
    bram(bramPose),
    luma({ x: back[0] + 7.6, y: back[1] + 0.6 - 3 * flinch, z: BRAM14.z - 1, face: -1, wings: 0.25 + 0.6 * flinch, fold: 1 - 0.7 * flinch, hover: false, flap: u * 6 * flinch,
      antL: -0.3 + 0.4 * fN, antR: 0.3 + 0.4 * fN, eyes: 1, look: [-0.9, 0.2], brow: K(u, [[0, 0.2], [2, -0.3], [3.3, 0.6], [4.3, -0.4]]), mouth: u > 3.2 && u < 4.2 ? 'o' : 'flat', mouthOpen: 0.15, autoBlink: false, blink: blinkT(T, 3, 3.2) }),
    P.fx.puff(xLand - 3, 0, PIP14.z1 + 3, clamp((u - 3.78) / 0.75), { kind: 'dust', scale: 0.8, up: 4, life: 0.5 }),   // behind him: his body covers its root
    grit(PIN_X() - 14, ZR + 0.5, clamp((u - 1.2) / 0.45), 1), grit(PIN_X() - 14, ZR + 0.5, clamp((u - 1.8) / 0.45), 2), grit(PIN_X() - 14, ZR + 0.5, clamp((u - 2.4) / 0.45), 3),
    P.fx.puff(PIN_X() - 15, -1, ZR - 1, clamp((u - 1.85) / 0.7), { kind: 'dust', scale: 0.4, n: 6 }), P.fx.puff(PIN_X() - 15, -1, ZR - 1, clamp((u - 2.42) / 0.7), { kind: 'dust', scale: 0.42, n: 6, seed: 4 }),
    P.fx.puff(PIN_X() - 14, -1, ZR - 1, clamp((u - 1.3) / 0.7), { kind: 'dust', scale: 0.32, n: 5, seed: 7 }),   // dust at the pinch where the stem goes under the stone
    // the stone rocks on each tug (its near side lifts a hair and drops back) but stays on the stem
    backGlow(px, -22, pz + 6, 34, 44, 0.3), backGlow(BRAM14.x, -14, BRAM14.z + 8, 58, 28, 0.22), boulder(PIN_X() + shiver, -11 - 0.7 * tug * Math.abs(Math.sin(u * 15)), SPZ() + 0.5, 0.008 * shake - 0.045 * tug * Math.abs(Math.sin(u * 15)), 0.06),
    pondGlow(0.6 + 0.1 * fN, T, POND_QUIET),
  ].flat();
  // Pip's medium (the rolled end at the centre) for the first heave, a cut to the stone for the next two (the stem pulls tight, grit spits
  // from the stone's foot, the stone shivers and holds; Bram and Luma behind it wince), and back to Pip for the last, biggest heave and the
  // slip; the camera eases left to keep him as he is thrown back.
  const ins = u > 1.72 && u < 2.55;
  const c = ins ? cam(-752 + 0.3 * shake, -17, ZR - lerp(196, 188, ss(1.72, 2.55, u)), ZR + 12, 18)
    : cam(K(u, [[0, E0.x - 6], [SLIP14, E0.x - 7], [4.1, PIP15.x + 22]]), K(u, [[0, -18], [SLIP14, -18], [4.1, -16]]), ZR - K(u, [[0, 150], [SLIP14, 146], [4.1, 158]]), pz, 40);
  // the turf's small plants right under the lens (a pink flower among them) would show as bokeh blobs in the low foreground as the
  // camera eases left with the fall: the ones nearer than a fixed depth are left out of Pip's medium (fixed, so none pops as the lens moves)
  const g0 = P.world.ground; let gr = [];
  P.world.ground = (a2, b2) => (gr = g0(a2, b2));
  let res; try { res = spoutScene(T, c, items, { st, noFg: true, motes: 3, ambient: SPOUT_AMB, grade: { vignette: 0.7, bloom: 0.3 },
    lights: [rimLight(px + 10, pz, 0.75), rimLight(BRAM14.x, BRAM14.z, 0.55), { x: E0.x - 6, y: -24, z: pz - 4, col: [1, 0.62, 0.28], i: 0.35, rad: 26, halo: 0 }] }); } finally { P.world.ground = g0; }
  if (!ins) { const near = new Set(gr.filter(it => !it.flat && it.z < ZR - 40)); res.items = res.items.filter(it => !near.has(it)); }
  return res;
};
const BRAM14 = { x: -712, z: 2640 };   // right of the stone and behind it, clear of the stem's far end

// 15 The low point. A new, wider frame from a little higher (so the cut from shot 14's close reads as time passing): Pip small on the
// left, sitting where he landed, hugging his knees; the leaf and the trapped glow fill the right of the frame, out of reach. A small
// warm patch touches his near cheek while he looks at it, then he looks down at the ground, blinks slowly and a small pale breath
// leaves him once. The pond glows at the same level shot 16 opens on. Very slow push in. Hold.
B['s15-alone'] = (u, T) => {
  const m = SPM(), M = m[0], px = PIP15.x, pz = PIP15.z, k = ss(0, 4, u);
  const c = cam(lerp(px + 81, px + 77, k), lerp(-42, -38, k), pz - lerp(300, 276, k), pz + 8, 34);   // wide enough to hold the stone on the stem at the right
  const st = P.state(T); st.pinStone = pinSpot(); st.leaf = seated(st); st.spoutCalm = SPOUT_CALM; st.spoutHush = SPOUT_HUSH;
  const gaze = 1 - ss(1.3, 2.1, u);
  const items = [
    pip({ x: px, y: 0, z: pz, face: 1, sit: 1, lean: 0.04 + 0.08 * ss(0.3, 3.5, u), headTilt: 0.06 + 0.12 * ss(1.4, 3, u), eyes: K(u, [[0, 0.8], [1.3, 0.8], [2.2, 0.55], [2.5, 0.05], [2.9, 0.5], [4, 0.5]]), look: [0.4 + 0.5 * gaze, 0.6 - 0.9 * gaze], brow: K(u, [[0, -0.8], [2, -1]]),
      mouth: 'frown', mouthOpen: 0.05, breath: u * 0.26, autoBlink: false }),
    P.fx.puff(px + 15, -12, pz - 1, clamp((u - 3.0) / 0.75), { scale: 0.4, col: [190, 214, 255], n: 5, up: 3 }),
    backGlow(px - 4, -18, pz + 8, 30, 36, 0.3, [90, 130, 225]), pinBoulder(),
    pondGlow(0.62, T, POND_QUIET),
  ].flat();
  return spoutScene(T, c, items, { st, noFg: true, motes: 0, ambient: [0.12, 0.16, 0.34], grade: { vignette: 0.78 },
    lights: [{ x: px + 22, y: -20, z: pz - 6, col: [1, 0.62, 0.28], i: 0.6 * (0.6 + 0.4 * gaze), rad: 17, halo: 0 }, rimLight(px - 10, pz, 0.7), { x: M + 6, y: -26, z: 2600, col: [1, 0.62, 0.28], i: 0.4, rad: 30, halo: 0 }] });
};

// 16 The plan, shown as a plan: while the narrator says "Three friends. Three different strengths." each friend goes to their own
// part of the machine and touches it. Luma lifts off Bram's shell and hovers by Pip while he gets up; Bram trundles from behind the
// stone round to its near side, turns, and puts his shoulder to it (it rocks); Luma flies to the leaf's far edge, grips it with her
// feet and lifts it in two little pulls (the edge folds up under her); Pip walks to the rolled end and turns his mitt the way you
// unroll a scroll, and the roll loosens a hair. A twinkle lands on each part as it is touched, and in the last second all three are
// at their places with the three parts glowing: stone, edge, curl. The camera starts on Pip as shot 15 left him, pulls back to a
// medium that holds all three parts, and ends exactly on the wide frame shot 17 starts from.
B['s16-plan'] = (u, T) => {
  const m = SPM(), M = m[0], ZR = SPZ(), PZ = ZR - 14, C = P.cast;
  const sit = 1 - ss(1.9, 2.6, u), gt = ss(1.0, 3.0, u);
  // camera: on Pip, then a medium that holds the stone, the leaf and the cleft together, then the wide shot 17 opens on
  const ew = ss(0.3, 1.6, u), wd = ss(6.0, 7.0, u), km = ss(2.4, 6, u);
  const c0 = { x: lerp(PIP15.x + 77, PIP15.x + 79, gt) + 2 * Math.sin(u * 0.4), y: K(u, [[0, -38], [3.2, -38]]), z: PIP15.z - lerp(276, 286, gt), fo: PIP15.z + 8, ap: 34 };   // shot 15's last frame
  const c1 = { x: lerp(-856, -850, km), y: -40, z: ZR - lerp(372, 356, km), fo: ZR + 28, ap: 34 };   // wide enough to hold Pip at the scroll, Luma over it and Bram at the stone
  const W17 = P.SH.WIDE17, c2 = { x: W17.x, y: W17.y, z: ZR - 338, fo: ZR + 0.14 * 338, ap: 30 };
  const mix = (a2, b2, k) => ({ x: lerp(a2.x, b2.x, k), y: lerp(a2.y, b2.y, k), z: lerp(a2.z, b2.z, k), fo: lerp(a2.fo, b2.fo, k), ap: lerp(a2.ap, b2.ap, k) });
  // (v5: the last second eases onto the tighter shared wide: the lens grows from 2400 to W17.f with the pull back, so the cut to shot 17 is seamless)
  const cc = mix(mix(c0, c1, ew), c2, wd), c = cam(cc.x, cc.y, cc.z, cc.fo, cc.ap, { f: Math.exp(lerp(Math.log(2400), Math.log(W17.f), wd)) });
  // the stone, the leaf and the three contact points
  // (v4: Bram works the stone from its right side, facing the leaf, as in the climax: his push rocks it back and left, off the stem's line)
  const bxEnd = PIN_X() + 14.5 - C.anchor('bram', { x: 0, y: 0, z: 0, face: -1, brace: 0.5, push: 0.17, squash: 0.99 }, 'front', T)[0];
  const nudge = -2.6 * bump(3.75, 0.3, u), stoneRot = nudge / 13 - 0.05 * Math.sin(u * 14) * bump(3.7, 0.3, u);
  const lumaPull = K(u, [[3.6, 0], [3.9, 7], [4.15, 3], [4.45, 8], [5.0, 8], [5.3, 0]]), gripped = u > 3.55 && u < 5.3;
  const st = P.state(T); st.pinStone = Object.assign(pinSpot(), { x: PIN_X() + nudge }); st.spoutCalm = SPOUT_CALM; st.spoutHush = SPOUT_HUSH;
  const grabK = ss(3.95, 4.3, u) * (1 - ss(5.5, 5.8, u)), wRoll = (u - 4.2) * 7.5, SN = 0.2;   // the far edge over the scroll: the same spot she lifts in the climax
  st.leaf = seated(st, { curl: 1 - 0.06 * grabK * (0.5 + 0.5 * Math.sin(wRoll)), lift: P.SH.liftFor(lumaPull * 0.5), grip: { sn: SN, lift: gripped ? lumaPull * 0.6 : 0 } });
  const E = leafEnd(st.leaf), hold = P.world.leafEdge ? P.world.leafEdge(st.leaf, SN) : P.SH.leafGeo(st.leaf).topAt(SN);
  // Pip: sits where shot 15 left him, gets up, walks to the rolled end, works it, then steps back to where shot 17 starts him
  const walkIn = ss(2.7, 3.9, u), walkOut = ss(5.7, 6.9, u), XT = E.x - 18, RUN0 = P.SH.pipWait ? P.SH.pipWait() : XT - 4;   // he stays by the scroll: where shot 17 has him wait
  const pipX = lerp(lerp(PIP15.x, XT, walkIn), RUN0, walkOut), moving = (u > 2.7 && u < 3.9) || (u > 5.7 && u < 6.9), pz = lerp(lerp(PIP15.z, PZ, ss(1.9, 3.2, u)), ZR - 6, walkOut);   // he ends at the depth shot 17 has him (PZ17)
  const pip0 = { x: pipX, y: 0, z: pz, face: 1, sit, lean: 0.12 * sit - 0.06 * bump(2.2, 0.2, u), headTilt: 0.18 * (1 - ss(0.4, 1.4, u)), squash: 1 - 0.08 * bump(2.0, 0.12, u) + 0.05 * bump(2.45, 0.1, u),
    walk: moving ? pipGait((u < 5 ? pipX - PIP15.x : pipX - XT), 8) : null,
    eyes: K(u, [[0, 0.5], [1.0, 1], [4.6, 1.1]]), look: [K(u, [[0, 0.4], [0.9, 0.5], [1.3, 0.6], [2.4, 0.5], [3.4, 0.9], [4.0, 0.9], [5.6, 0.9], [6.2, 0.5], [7, 0.9]]), K(u, [[0, 0.5], [1.0, -0.4], [1.5, -0.5], [2.4, 0], [3.9, -0.2], [4.6, 0.25], [5.5, 0.25], [6.2, -0.2], [7, 0]])],
    brow: K(u, [[0, -1], [1.2, -0.3], [3, 0.2], [4.8, 0.7], [7, 0.7]]), mouth: u > 1.3 ? 'smile' : 'frown', mouthOpen: 0.15, breath: u * 0.35, autoBlink: false,
    blink: both(blinkT(T, 1, 3.1), actBlink(u, [[2.75, 0.12], [2.93, 0.12]])) };   // a double blink as he gets up
  if (grabK > 0.01) {   // the right mitt on the rolled end, circling it the way a scroll is unrolled
    const r = Math.max(E.r, 4) + 3, tg = onPlane(c, [E.x - 2 + r * Math.cos(wRoll) * 0.8, E.y + r * Math.sin(wRoll)], pz);
    pip0.armR = { reach: [lerp(pipX + 9, tg[0], grabK), lerp(-14, tg[1], grabK)] }; pip0.lean = (pip0.lean || 0) + 0.1 * grabK;
  }
  // Bram: from behind the stone (a little right of where he watched Pip, just outside shot 15's frame) round to its near side, a turn, and his
  // shoulder to it; he stays there
  const B0 = [BRAM14.x + 32, BRAM14.z], B1 = [bxEnd + 8, ZR - 3], walkB = ss(0, 1.15, u), flip = true, stepB = ss(1.3, 1.55, u);
  const bxW = lerp(B0[0], B1[0], walkB), bzW = lerp(B0[1], B1[1], ss(0, 1.15, u) ** 1.6);
  const bPush = K(u, [[3.1, 0.17], [3.4, 0.6], [3.9, 0.55], [4.3, 0.17], [7, 0.17]]), bBrace = K(u, [[1.4, 0], [1.75, 0.5], [2.85, 0.5], [3.1, 1], [4.0, 1], [4.6, 0.5], [7, 0.5]]);
  // his turn is a paper turn: face runs -1 to 1 over a quarter second, so the card narrows and widens again (no one-frame flip)
  const bramPose = { x: flip ? lerp(B1[0], bxEnd, stepB) + nudge : bxW, y: 0, z: flip ? B1[1] : bzW, face: -1, brace: u < 1.4 ? 0 : bBrace, push: u < 1.6 ? 0 : u < 3.1 ? 0.17 * ss(1.6, 1.9, u) : bPush, squash: 1 - 0.1 * bump(1.25, 0.15, u) - 0.01 * (u > 4.3 ? 1 : 0),
    walk: u < 1.15 ? bramGait(Math.hypot(bxW - B0[0], bzW - B0[1]), 11) : u > 1.3 && u < 1.55 ? bramGait(8 * stepB, 11) : null, stride: 11, eyes: 1,
    look: flip ? [K(u, [[1.3, 0.8], [2.4, 0.7], [2.7, 1], [4.4, 0.9], [5.2, 0.2], [6.2, 0.9]]), K(u, [[1.3, 0.1], [2.7, 0.2], [4.4, 0.1], [5.2, -0.5], [6.2, 0.2]])] : [-0.9, K(u, [[0, 0.3], [0.8, 0]])],
    head: 0.5 * K(u, [[1.4, 0], [1.75, 0.4], [2.85, 0.4], [3.1, 1], [4.0, 1], [4.6, 0]]), brow: flip ? 0.1 - 0.4 * K(u, [[3.0, 0], [3.4, 1], [4.0, 1], [4.4, 0]]) : K(u, [[0, -0.3], [1.0, 0.3]]), mouth: u > 4.4 || (u > 0.4 && u < 1.25) ? 'smile' : 'flat', mouthOpen: 0.1, breath: u * 0.3, autoBlink: false,
    blink: both(blinkT(T, 2, 3.6), actBlink(u, [[1.17, 0.16]])) };   // a blink on the turn hides the flip
  const bf = C.anchor('bram', bramPose, 'front', T), bBack = C.anchor('bram', { x: B0[0], y: 0, z: B0[1], face: -1 }, 'back', T);
  // Luma: on Bram's shell; lifts off and hovers by Pip as he gets up; grips the leaf's far edge with her feet and pulls twice; lets go
  // and hovers where shot 17 starts her. Her feet are put exactly on the edge point (solved from her foot anchor).
  const onBram = u < 0.12, perch = [bBack[0] + 7.6, bBack[1] + 0.6];
  const lpose = { x: 0, y: 0, z: ZR - 8, face: -1, wings: 1, flap: u * 9, hover: !gripped, hold: null };
  const holdP = onPlane(c, hold, ZR - 8), foot = C.anchor('luma', lpose, 'footFront', T), gx = holdP[0] - foot[0], gy = holdP[1] - foot[1];   // the edge point seen from this lens, on her plane
  const nearPip = [PIP15.x + 30, -50];
  const lx = onBram ? perch[0] : K(u, [[0.12, perch[0]], [1.0, nearPip[0]], [2.9, nearPip[0] + 8], [3.55, gx], [5.3, gx], [6.3, M + 30], [7, M + 30]]);
  const ly0 = (onBram ? perch[1] : K(u, [[0.12, perch[1]], [0.5, -66], [1.0, nearPip[1]], [2.9, nearPip[1] - 4], [3.55, gy], [5.3, gy], [6.4, -72], [7, P.SH.WIDE17.lumaY]]))
    + (!onBram && !gripped ? 2.2 * Math.sin(u * 5) : 0);
  const lz = onBram ? B0[1] - 1 : lerp(B0[1] - 1, ZR - 8, ss(0.12, 1.0, u));
  // her wing tips stay at least 30 px inside the top of the frame while she hovers (the lens is close on Pip at first): WING_UP is how far
  // the raised wing tips reach above her y; the limit eases in (a soft max) so the hover bob never flattens with a kink
  const WING_UP = 44, lyTop = c.y + (30 - 540 - (W17.vshift || 0) * wd) / P.scaleAt(c, lz) + WING_UP, free = !onBram && !gripped;   // (v5.1: less the vertical lens shift)
  // (in the last quarter second the camera has reached the wide shot 17 opens on, where her hover height clears the frame, so the limit lets go
  // and she ends exactly where shot 17 starts her)
  const ly = free ? lerp(lyTop + 3 * Math.log(Math.exp((ly0 - lyTop) / 3) + 1), ly0, ss(6.7, 7.0, u)) : ly0;
  const edgeGl = ss(3.7, 4.0, u) * (1 - ss(5.0, 5.4, u)), curlGl = ss(4.1, 4.4, u) * (1 - ss(5.5, 5.9, u)), planGl = 0.4 * ss(6.2, 6.7, u);   // (v5: softer, so they do not sparkle on the blade)
  const items = [
    pip(pip0),
    bram(bramPose),
    luma({ ...lpose, hold: gripped ? { x: holdP[0], y: holdP[1] } : null, x: lx, y: ly, z: lz, wings: onBram ? 0.25 : 1, fold: onBram ? 1 : 0, hover: onBram ? false : !gripped, flap: u * 9 * (onBram ? 0 : 1),
      antL: -0.2, antR: 0.2, eyes: 1, look: [onBram ? -0.9 : u < 2.9 ? -0.7 : -0.5, onBram ? 0.4 : gripped ? 0.6 : 0.3], brow: gripped ? -0.2 : 0.5, mouth: gripped ? 'grit' : 'smile', mouthOpen: 0.1, autoBlink: false, blink: blinkT(T, 3, 2.9) }),
    P.fx.puff(bf[0] + 50, -2, ZR + 1, clamp((u - 3.25) / 1.0), { kind: 'dust', scale: 0.45, dir: 1 }),
    glint(holdP[0] - 5, holdP[1] + 7, ZR - 9, Math.max(edgeGl, planGl), T, 5, 1 - ss(5.9, 6.6, u)), glint(E.x - 3, E.y - E.r - 2, ZR - 9, Math.max(curlGl, planGl), T, 6.5, 1 - ss(5.9, 6.6, u)),   // (v5.1: by the last frame only soft glows, no twinkles)
    backGlow(pipX, -22, pz + 8, 36, 46, 0.3), backGlow(bramPose.x, -14, bramPose.z + 8, 58, 28, 0.25), pinBoulder(nudge, stoneRot),
    pondGlow(0.62, T, POND_QUIET),
  ].flat();
  return P.SH.lensShift(spoutScene(T, c, items, { st, noFg: true, motes: 4, ambient: [0.12, 0.16, 0.34], grade: { vignette: lerp(0.78, 0.72, ss(0, 2, u)), bloom: 0.3 },
    lights: [rimLight(M - 10, PZ, 0.75), rimLight(BRAM14.x, BRAM14.z, 0.5 * (1 - walkB)), { x: M + 6, y: -26, z: 2600, col: [1, 0.62, 0.28], i: 0.4, rad: 30, halo: 0 }] }), (W17.vshift || 0) * wd, false, lerp(-300 * ss(1.6, 3.0, u), W17.shift, wd));
};
// Where shot 16 leaves its two plan glints on its last frame (u 7, the wide shot 17 opens on): Luma's grip on the far edge and the rolled
// end (v5: the pin stone carries no glint). Shot 17 fades the same three out from the same spots, so nothing jumps at the cut. Each entry is [x, y, z, r].
P.SH.planGlints = T => {
  const ZR = SPZ(), W17 = P.SH.WIDE17, c = cam(W17.x, W17.y, ZR - 338, ZR + 0.14 * 338, 30, { f: W17.f });
  const lf = seated(P.state(T), { curl: 1, lift: P.SH.liftFor(0), grip: { sn: 0.2, lift: 0 } }), E = leafEnd(lf);
  const hold = P.world.leafEdge ? P.world.leafEdge(lf, 0.2) : P.SH.leafGeo(lf).topAt(0.2), holdP = onPlane(c, hold, ZR - 8);
  return [[holdP[0] - 5, holdP[1] + 7, ZR - 9, 5], [E.x - 3, E.y - E.r - 2, ZR - 9, 6.5]];
};
})();
