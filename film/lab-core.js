// Lab scenes for core.js (light, moon, grade, wind): lab.html?lab=core-<name>&t=<s>.
//   core-night  the dark garden from a wide lens, world builders only, with test cards at three depths: each card is cut in four bands lit at
//               their own height, so the moon key's modelling (tops brighter than bases) and the night grade's colour can be read on plain
//               greys and on red, green, blue and yellow. One warm glow stands among the near cards (its pool, skirt and halation).
//   core-grade  the same frame with grade.night set by time: t 0 -> 0, t 1 -> 0.5, t 2 -> 1 (t 3 also takes the moon key off, to see the
//               grade alone). Render stills at 0,1,2,3.
//   core-wind   rows of plain blades leaning by P.wind, and along the top a strip of P.gust across the garden at one depth: the field's
//               shape, the gust fronts travelling +x and toward the lens, and the frame-to-frame step. Render a 3 s clip.
(() => {
const P = window.PIP, WD = P.world;
const DARK = { climb: 0, petal: 0, flicker: 1, open: 0.25 };
const mkSt = t => ({ t, calm: 0, water: -1, waterTail: 0, waterGlow: 0, pond: 0.6, hero: DARK, flower: () => DARK,
  leaf: { curl: 1, x: -900, y: -10, z: 2588, rot: 0.2, free: 0, lift: 0 }, pinStone: { x: -870, z: 2582, rot: 0.2 },
  dipper: { x: -98, y: 0, z: 414, rot: 0.08, held: false, water: 0, fall: 1 } });
const WIDE = { x: -60, y: -48, z: -900, f: 2400, focus: 300, ap: 22 };
const garden = (st, cam) => { st.cam = cam; return [...WD.sky(st), ...WD.hills(st), ...WD.ground(st, cam), ...WD.channel(st), ...WD.flowers(st), ...WD.hero(st), ...WD.spout(st), ...WD.props(st)]; };
// test cards: plain greys and colours at three depths; each card is four bands, each lit at its own height
const CARDS = [[60, 60, 60], [128, 128, 128], [205, 205, 205], [190, 62, 52], [62, 150, 72], [60, 92, 196], [214, 182, 62]];
const cards = () => { const out = [];
  [[-250, 34], [150, 52], [700, 80]].forEach(([z, h], row) => CARDS.forEach((col, i) => { const w = h * 0.55, x = WIDE.x + (i - 3) * w * 1.55 + (row - 1) * w * 0.4;
    out.push({ z, draw(c) { for (let b = 0; b < 4; b++) { const y0 = -h * b / 4, y1 = -h * (b + 1) / 4;
      P.card(c, k => k.rect(x - w / 2, y1, w, y0 - y1 + 0.2), P.lit(col, x, (y0 + y1) / 2, z), { lift: 0.8, tex: 0.25, shadow: b ? 0 : 0.45 }); }
      P.moonRim(c, k => k.rect(x - w / 2, -h, w, h), Math.max(0.6, h * 0.02), 0.6); } }); }));
  return out; };
const GLOW = { x: WIDE.x - 40, y: -22, z: -170, col: [1, 0.62, 0.26], i: 1.6, rad: 46, halo: 34 };
const MOONL = { x: WIDE.x + 160, y: -120, z: -300, col: [0.42, 0.6, 1.0], i: 0.25, rad: 160, halo: 0 };
const glowCore = { z: GLOW.z, draw(c) { const g = c.createRadialGradient(GLOW.x, GLOW.y, 0, GLOW.x, GLOW.y, 6); g.addColorStop(0, 'rgba(255,236,190,1)'); g.addColorStop(0.45, 'rgba(255,170,70,0.9)'); g.addColorStop(1, 'rgba(255,140,40,0)');
  c.fillStyle = g; c.beginPath(); c.arc(GLOW.x, GLOW.y, 6, 0, P.TAU); c.fill(); } };
const night = (t, grade = {}, moon) => { const st = mkSt(t);
  return { cam: WIDE, ambient: [0.18, 0.23, 0.46], moon, lights: [GLOW, MOONL], items: [...garden(st, WIDE), ...cards(), glowCore], grade: Object.assign({ bloom: 0.3, vignette: 0.66, grain: 0.1 }, grade) }; };
P.LABS['core-night'] = t => night(t);
P.LABS['core-grade'] = t => night(t, { night: P.clamp(t / 2) }, t >= 2.5 ? { key: 0 } : undefined);

// wind: blades rooted on a ground plane, bent by P.wind (more at the tip), shaded by P.gust so the travelling fronts can be seen
const WCAM = { x: 0, y: -62, z: -150, f: 1500, focus: 800, ap: 0 };
P.LABS['core-wind'] = t => { const items = [{ z: 1e6, screen: true, draw(c) { const g = c.createLinearGradient(0, 0, 0, P.H); g.addColorStop(0, '#0b1640'); g.addColorStop(0.45, '#16285a'); g.addColorStop(1, '#0d2a2c'); c.fillStyle = g; c.fillRect(0, 0, P.W, P.H); } }];
  for (let r = 0; r < 18; r++) { const z = 40 + r * r * 12 + r * 40, n = 90;
    items.push({ z, draw(c) { for (let i = 0; i < n; i++) { const x = (i - n / 2 + 0.5 + 0.6 * (P.hash(i, r) - 0.5)) * (6 + z * 0.032), h = 26 + 22 * P.hash(i, r + 50), w = P.wind(x, z, t), g = P.gust(x, z, t), lean = w * 0.55 * h;
      c.fillStyle = `rgb(${Math.round(40 + 120 * g)},${Math.round(120 + 90 * g)},${Math.round(80 + 40 * g)})`; c.beginPath(); c.moveTo(x - 1.6, 0);
      c.quadraticCurveTo(x - 1 + lean * 0.35, -h * 0.55, x + lean, -h * Math.sqrt(1 - Math.min(0.5, (lean / h) ** 2))); c.quadraticCurveTo(x + 1 + lean * 0.35, -h * 0.55, x + 1.6, 0); c.fill(); } } }); }
  // the gust strip: P.gust along x at z = 800 (amber bars), and P.wind there (blue dots, the middle line is 0), one per 20 units, on screen
  items.push({ z: 0.6, screen: true, draw(c) { for (let i = 0; i < 192; i++) { const x = -1900 + i * 20, g = P.gust(x, 800, t), w = P.wind(x, 800, t);
    c.fillStyle = `rgba(255,${Math.round(150 + 100 * g)},90,0.9)`; c.fillRect(i * 10, 90 - 70 * g, 9, 70 * g);
    c.fillStyle = 'rgba(140,200,255,0.5)'; c.fillRect(i * 10, 129, 9, 1); c.fillStyle = 'rgba(140,200,255,0.95)'; c.fillRect(i * 10 + 3, 128 - 30 * w, 3, 3); } } });
  return { cam: WCAM, ambient: [0.5, 0.55, 0.7], lights: [], items, grade: { bloom: 0, vignette: 0.3, grain: 0, night: 0, halation: 0 } }; };
})();
