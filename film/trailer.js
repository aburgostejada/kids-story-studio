// Pip and the Missing Glow: a 15-second kinetic-type trailer (1080 x 1080, 30 fps), drawn by code.
// A new idea about every second: huge words that stretch, drop and fly at the camera, three colours (night blue, warm
// cream and glow gold) and the film's own garden as the payoff. Every picture of the garden is a real frame of the
// film, drawn by the film's modules (PIP.*) at a film time; this file only adds words, cuts and timing. Every frame is
// a pure function of the trailer time t, like the film: no randomness, no clock, no memory of the previous frame.
(() => {
const W = 1080, H = 1080, TAU = Math.PI * 2, DUR = 15;
const Q = new URLSearchParams(location.search), ES = Q.get('lang') === 'es';

// ---- palette: three colours plus the garden ---------------------------------------------------
const KI = '#0e1433';  // ink: night blue
const KC = '#fbf3df';  // cream
const KH = '#ffb02e';  // hot: glow gold (on ink, or as a full-bleed card with ink text)
const KA = '#a45a00';  // the gold's darker amber, for accents on cream (gold on cream is too faint to read)
const KTR = -0.025;    // the big words' tracking, as a share of their size
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

// ---- small helpers ----------------------------------------------------------------------------
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const inOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const outBack = (k, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
const outExpo = (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
const inExpo = (k) => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10));
function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function setFont(c, weight, size, mono) { c.font = `${weight} ${size}px ${mono ? MONO : SANS}`; }
function T(c, s, x, y, o = {}) {
  setFont(c, o.weight || 400, o.size || 20, o.mono); c.letterSpacing = (o.track || 0) + 'px';
  c.textAlign = o.align || 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = o.col || '#000';
  c.fillText(s, x, y); c.letterSpacing = '0px';
}
function lines(c, s, size, weight, maxW) {
  setFont(c, weight, size); const out = []; let cur = '';
  for (const word of s.split(' ')) { const next = cur ? cur + ' ' + word : word; if (cur && c.measureText(next).width > maxW) { out.push(cur); cur = word; } else cur = next; }
  if (cur) out.push(cur);
  return out;
}
function fade(c, a, fn) { if (a <= 0.001) return; c.save(); c.globalAlpha *= a; fn(); c.restore(); }
function fill(c, col) { c.fillStyle = col; c.fillRect(-W, -H, 3 * W, 3 * H); }
function ksmall(c, s, x, y, size, col, o = {}) { T(c, s, x, y, { size, weight: o.weight || 700, col, align: o.align || 'center', mono: o.mono }); }

// ---- the words ---------------------------------------------------------------------------------
const KW = ES ? {
  hook: 'IMÁGENES', uses: 'este corto usa', none: 'CERO.', every: 'cada píxel es', code: 'CÓDIGO.',
  open: ['Abre', 'la página.'], then: 'y entonces', glows: 'BRILLA.',
  no3d: 'SIN 3D.', noai: 'SIN IMÁGENES IA.', canvas: 'un canvas 2D y JavaScript', pure: ['sin azar, sin reloj,', 'sin memoria del fotograma anterior'],
  night: 'Una noche…', dark: ['SE APAGÓ', 'LA LUZ.'], together: 'JUNTOS.', friends: 'Pip, Bram y Luma la traen de vuelta',
  shots: '21 PLANOS.', frames: ['135 segundos · 4.050 fotogramas', 'cada uno de 1920 × 1080'],
  made: 'hecho dirigiendo', agents: 'AGENTES IA', studio: ['como un estudio', 'dirige sus departamentos'], checked: 'COMPROBADO.', checks: ['el dibujo no usa azar ni reloj,', 'y la tabla de planos cuadra'],
  title: 'Pip and the Missing Glow', tag: 'Un corto animado, dibujado solo con código.', cta: 'Consíguelo en GitHub',
  lic: 'Licencia MIT · Node.js 20+', note: 'Fotogramas del corto, dibujados por su propio código. El texto se añadió para este tráiler.',
  illu: 'Ilustración · fotogramas reales del corto',
} : {
  hook: 'IMAGES', uses: 'this film uses', none: 'ZERO.', every: 'every pixel is', code: 'CODE.',
  open: ['Open', 'the page.'], then: 'and then', glows: 'IT GLOWS.',
  no3d: 'NO 3D.', noai: 'NO AI IMAGES.', canvas: 'a 2D canvas and plain JavaScript', pure: ['no randomness, no clock,', 'no memory of the last frame'],
  night: 'One night…', dark: ['THE GLOW', 'WENT OUT.'], together: 'TOGETHER.', friends: 'Pip, Bram and Luma bring it back',
  shots: '21 SHOTS.', frames: ['135 seconds · 4,050 frames', 'each one 1920 × 1080'],
  made: 'made by directing', agents: 'AI AGENTS', studio: ['the way a studio', 'directs its departments'], checked: 'CHECKED.', checks: ['no randomness or clock in the drawing,', 'and the shot table still adds up'],
  title: 'Pip and the Missing Glow', tag: 'An animated short, drawn entirely by code.', cta: 'Get it on GitHub',
  lic: 'MIT license · Node.js 20+', note: 'Frames from the film, drawn by its own code. The words were added for this trailer.',
  illu: 'Illustration · real frames from the film',
};
const URL_LINE = 'localhost:8000/comp.html?play';
const OWNER = 'github.com/aburgostejada/', NAME = 'kids-story-studio';
// npm test, as it prints today (tests/trailer.test.mjs checks these numbers against the test files)
const NPM_TEST = { tests: 10, pass: 8, skipped: 2 };
const KTERM = [
  ['$ ', 'npm test'],
  ['', `ℹ tests ${NPM_TEST.tests}`], ['', `ℹ pass ${NPM_TEST.pass}`], ['', 'ℹ fail 0'], ['', `ℹ skipped ${NPM_TEST.skipped}`],
];

// [start, shot]. The press lands at KPRESS; from KLIVE the film plays in real time.
const KSHOTS = [[0, 'hook'], [0.9, 'none'], [1.7, 'code'], [2.5, 'press'], [4.3, 'glows'], [5.6, 'no3d'], [6.5, 'pure'],
  [7.4, 'dark'], [8.3, 'together'], [9.1, 'shots'], [9.9, 'agents'], [10.65, 'test'], [11.9, 'end']];
const KPRESS = 3.2, KLIVE = KPRESS + 0.12;
const at = (n) => KSHOTS.find(([, s]) => s === n)[0];

// ---- the film's own frames ---------------------------------------------------------------------
// Film times used (see CONTRACT.md's shot table): s02-pour (water reaches the rule flower and its light climbs),
// s05-stem-dies (Pip's flower dark), s19-chase (the three run ahead of the light), s23-trio (the final hold).
const F_POUR = 7.4, F_DARK = 25.0, F_CHASE = 108.6, F_TRIO = 129.0;
const FW = PIP.W, FH = PIP.H, FILMC = PIP.off(FW, FH), FX = FILMC.getContext('2d');
let filmAt = null;
function filmFrame(ft) {
  if (filmAt === ft) return FILMC;  // the same film time draws the same frame
  const F = PIP.FILM; let k = 0, t0 = 0;
  while (k < F.shots.length - 1 && ft >= t0 + F.shots[k].dur) { t0 += F.shots[k].dur; k++; }
  const scene = F.shots[k].build(ft - t0, ft);
  FX.setTransform(1, 0, 0, 1, 0, 0); FX.filter = 'none'; FX.globalCompositeOperation = 'source-over'; FX.globalAlpha = 1;
  FX.fillStyle = '#000'; FX.fillRect(0, 0, FW, FH);
  PIP.renderScene(FX, scene, ft); PIP.grade(FX, FILMC, ft, scene.grade || {});
  filmAt = ft; return FILMC;
}
// draw film time ft into the box (x, y, w, h), cropped to cover it, centred on film pixel (fx, fy), zoomed by z
function film(c, ft, x, y, w, h, fx, fy, z = 1) {
  const src = filmFrame(ft), sh = FH / z, sw = Math.min(FW, sh * (w / h)), sh2 = sw * (h / w);
  const sx = clamp(fx - sw / 2, 0, FW - sw), sy = clamp(fy - sh2 / 2, 0, FH - sh2);
  c.drawImage(src, sx, sy, sw, sh2, x, y, w, h);
}
const POUR = [740, 540], DARKF = [880, 540], CHASE = [800, 560], TRIO = [960, 560];

// ---- big words ---------------------------------------------------------------------------------
// sized to a target width, stretched (sx), rotated, with outline echoes and a motion smear
function kword(c, s, cx, cy, wT, o = {}) {
  const A = c.globalAlpha, sx = o.sx ?? 1, wt = o.weight || 900, tr = o.track ?? KTR;
  setFont(c, wt, 100); c.letterSpacing = tr * 100 + 'px';
  const size = Math.min((100 * wT) / (c.measureText(s).width * sx), o.max || 1e9);
  setFont(c, wt, size); c.letterSpacing = tr * size + 'px';
  c.save(); c.translate(cx, cy); if (o.rot) c.rotate(o.rot); c.scale(sx * (o.s ?? 1), o.s ?? 1);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const by = size * 0.36;
  if (o.echo) {
    c.lineWidth = Math.max(2, size * 0.014); c.strokeStyle = o.echoCol || o.col;
    for (let i = o.echo; i >= 1; i--) { c.globalAlpha = A * 0.55 / i; c.strokeText(s, i * (o.ex || 0), by + i * (o.ey || 0)); }
  }
  if (o.smear) { c.fillStyle = o.col; for (let i = 5; i >= 1; i--) { c.globalAlpha = A * 0.12; c.fillText(s, (-o.smear * i) / 5 / sx, by); } }
  c.globalAlpha = A; c.fillStyle = o.col;
  if (o.colLast) {
    const head = s.slice(0, -1), w = c.measureText(s).width;
    c.textAlign = 'left'; c.fillText(head, -w / 2, by); c.fillStyle = o.colLast; c.fillText(s.slice(-1), -w / 2 + c.measureText(head).width, by);
  } else c.fillText(s, 0, by);
  c.restore(); c.letterSpacing = '0px';
  return size;
}
// letters that drop in one after another and overshoot
function kdrop(c, s, cx, cy, wT, lt, o = {}) {
  const wt = o.weight || 900, tr = o.track ?? KTR, A = c.globalAlpha;
  setFont(c, wt, 100); c.letterSpacing = tr * 100 + 'px';
  const size = Math.min((100 * wT) / c.measureText(s).width, o.max || 1e9);
  setFont(c, wt, size); c.letterSpacing = tr * size + 'px';
  const w = c.measureText(s).width; let x = cx - w / 2;
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  [...s].forEach((ch, i) => {
    const p = clamp((lt - i * (o.step ?? 0.04)) / 0.3), cw = c.measureText(s.slice(0, i + 1)).width - c.measureText(s.slice(0, i)).width;
    if (p > 0) {
      c.save(); c.globalAlpha = A * clamp(p * 5);
      c.translate(x + cw / 2, cy + size * 0.36 - (1 - outBack(p)) * size * (o.from ?? 1.1));
      c.rotate((1 - outBack(p)) * (i % 2 ? 0.25 : -0.25));
      c.fillStyle = o.colLast && i === [...s].length - 1 ? o.colLast : o.col; c.fillText(ch, -cw / 2, 0); c.restore();
    }
    x += cw;
  });
  c.letterSpacing = '0px';
  return size;
}
// a readable pill: what the demo is (a drawing of the page around real frames, not a recording of a screen)
function ktag(c, s, cx, cy) {
  setFont(c, 700, 40); const w = c.measureText(s).width + 56;
  rrect(c, cx - w / 2, cy - 34, w, 68, 34); c.fillStyle = KC; c.fill();
  T(c, s, cx, cy + 14, { size: 40, weight: 700, col: KI, align: 'center' });
}
function cursor(c, x, y, press, a) {
  if (a <= 0.001) return;
  c.save(); c.globalAlpha = a; c.translate(x, y); c.scale(2.2 * (1 - 0.12 * press), 2.2 * (1 - 0.12 * press));
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 26); c.lineTo(7, 20); c.lineTo(12, 31); c.lineTo(16, 29); c.lineTo(11, 18); c.lineTo(20, 18); c.closePath();
  c.fillStyle = '#111'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); c.restore();
}
function kflash(c, t, t0, len = 0.12) { const k = (t - t0) / len; if (k >= 0 && k < 1) fade(c, 0.7 * (1 - k), () => fill(c, KC)); }

// ---- the shots ---------------------------------------------------------------------------------
const KSHOT = {
  hook(c, lt) {
    fill(c, KI);
    const k = outExpo(clamp(lt / 0.35));
    kword(c, KW.hook, W / 2, H / 2, W * 0.88, { col: KC, sx: lerp(2.3, 1, k), smear: (1 - k) * 160 });
    // struck out with one gold bar
    const b = outExpo(clamp((lt - 0.45) / 0.18));
    if (b > 0) { c.save(); c.translate(W / 2, H / 2); c.rotate(-0.07); c.fillStyle = KH; c.fillRect(-W * 0.48, -26, W * 0.96 * b, 52); c.restore(); }
  },
  none(c, lt) {
    fill(c, KH);
    const k = outExpo(clamp(lt / 0.22));
    ksmall(c, KW.uses, W * 0.08, H * 0.33, 60, KI, { align: 'left' });
    kword(c, KW.none, W / 2, H * 0.53, W * 0.84, { col: KI, s: lerp(1.7, 1, k), rot: lerp(-0.14, -0.04, k), echo: 3, ey: 26 });
  },
  code(c, lt) {
    fill(c, KC);
    fade(c, clamp(lt / 0.1), () => ksmall(c, KW.every, W / 2, H * 0.3, 60, KI));
    kdrop(c, KW.code, W / 2, H * 0.56, W * 0.84, lt, { col: KI, colLast: KA, step: 0.05 });
  },
  press(c, lt, t) {
    fill(c, KI);
    // the still frame flies in, the pointer presses the page's address (comp.html?play), the garden wakes and grows
    // to fill the frame
    const kin = outBack(clamp(lt / 0.4), 1.2), g = inOutCubic(clamp((lt - 1.15) / 0.65)), live = t >= KLIVE;
    const w0 = W * 0.56, y0 = H * 0.19;
    const s = lerp(0.35, 1, kin), rot = lerp(0.2, 0, kin) * (1 - g);
    const w = lerp(w0 * s, W, g), x = lerp(W / 2 - (w0 * s) / 2, 0, g), y = lerp(y0 + (1 - kin) * 260 + (w0 - w0 * s) / 2, 0, g);
    fade(c, clamp(lt / 0.15) * (1 - g), () => {
      setFont(c, 900, 84); c.letterSpacing = '-2px';
      const a = KW.open[0] + ' ', b = KW.open[1], wa = c.measureText(a).width, wb = c.measureText(b).width, xl = W / 2 - (wa + wb) / 2;
      c.letterSpacing = '0px';
      T(c, a, xl, H * 0.13, { size: 84, weight: 900, col: KC, track: -2 });
      T(c, b, xl + wa, H * 0.13, { size: 84, weight: 900, col: t >= KPRESS ? KH : KC + '66', track: -2 });
    });
    c.save(); c.translate(x + w / 2, y + w / 2); c.rotate(rot); c.translate(-(x + w / 2), -(y + w / 2));
    rrect(c, x, y, w, w, 24 * (1 - g)); c.save(); c.clip();
    film(c, live ? F_POUR + (t - KLIVE) : F_POUR, x, y, w, w, POUR[0], POUR[1]);
    c.restore(); c.restore();
    // the page's address, as a bar under the picture; the pointer presses it
    const by = y0 + w0 + 86, press = t >= KPRESS && t < KPRESS + 0.2 ? Math.sin(Math.PI * (t - KPRESS) / 0.2) : 0;
    fade(c, clamp((lt - 0.2) / 0.2) * (1 - clamp(g * 3)), () => {
      setFont(c, 600, 42, true); const bw = c.measureText(URL_LINE).width + 64, bh = 84;
      c.save(); c.translate(W / 2, by); c.scale(1 - 0.05 * press, 1 - 0.05 * press);
      rrect(c, -bw / 2, -bh / 2, bw, bh, bh / 2); c.fillStyle = '#1c2450'; c.fill(); c.lineWidth = 3; c.strokeStyle = t >= KPRESS ? KH : KC + '88'; c.stroke();
      T(c, URL_LINE, 0, 15, { size: 42, weight: 600, mono: true, col: KC, align: 'center' }); c.restore();
    });
    // what this is, readable on a phone for the whole demo
    fade(c, clamp(lt / 0.15) * (1 - clamp((g - 0.6) * 4)), () => ktag(c, KW.illu, W / 2, H - 64));
    const ci = inOutCubic(clamp((lt - 0.25) / 0.4)), co = inOutCubic(clamp((t - KPRESS - 0.2) / 0.4));
    const px = lerp(W * 0.95, W / 2 + 230, ci) + co * 400, py = lerp(H * 1.05, by + 4, ci) - co * 120;
    cursor(c, px, py, t >= KPRESS && t < KPRESS + 0.35 ? (t - KPRESS) / 0.35 : 0, clamp((lt - 0.25) / 0.1) * (1 - g));
    const r = (t - KPRESS) / 0.5;
    if (r > 0 && r < 1) { c.save(); c.globalAlpha = 1 - r; c.lineWidth = 10 * (1 - r) + 2; c.strokeStyle = KH; c.beginPath(); c.arc(W / 2 + 230, by, 30 + outExpo(r) * 520, 0, TAU); c.stroke(); c.restore(); }
  },
  glows(c, lt, t, d) {
    // the garden alive, full frame, as the light climbs the stem; the word flies at the camera, through its first
    // letter's stem, and the frame fills with cream
    const z = 1 + 0.08 * (lt / d);
    c.save(); c.translate(W / 2, H / 2); c.scale(z, z); c.rotate(0.02 * Math.sin(lt * 1.3)); c.translate(-W / 2, -H / 2);
    film(c, F_POUR + (t - KLIVE), 0, 0, W, H, POUR[0], POUR[1]);
    c.restore();
    const fly = inExpo(clamp((lt - 0.85) / 0.45)), FS = 1 + 70 * fly;
    fade(c, clamp((lt - 0.05) / 0.12) * (1 - clamp((lt - 0.7) / 0.15)), () => {
      c.save(); c.shadowColor = 'rgba(0,0,10,0.8)'; c.shadowBlur = 18; ksmall(c, KW.then, W / 2, H * 0.36, 60, KC); c.restore();
    });
    const s = KW.glows, wT = W * 0.86;
    setFont(c, 900, 100); c.letterSpacing = KTR * 100 + 'px';
    const size = (100 * wT) / c.measureText(s).width; setFont(c, 900, size); c.letterSpacing = KTR * size + 'px';
    const fw = c.measureText(s).width; c.letterSpacing = '0px';
    const ix = W / 2 - fw / 2 + c.measureText(s[0]).width / 2, iy = H * 0.55;
    const k = outExpo(clamp((lt - 0.12) / 0.3));
    c.save(); c.translate(ix, iy); c.scale(FS, FS); c.translate(-ix, -iy);
    fade(c, clamp((lt - 0.12) / 0.08), () => { c.save(); c.shadowColor = 'rgba(0,0,10,0.7)'; c.shadowBlur = fly > 0.01 ? 0 : 30; kword(c, s, W / 2, iy, wT, { col: KC, s: lerp(0.6, 1, k), echo: fly > 0.01 ? 0 : 3, ex: 0, ey: -22, echoCol: KH }); c.restore(); });
    c.restore();
    fade(c, smooth(clamp((fly - 0.75) / 0.25)), () => fill(c, KC));
  },
  no3d(c, lt) {
    fill(c, KC);
    kdrop(c, KW.no3d, W / 2, H * 0.3, W * 0.62, lt, { col: KI, step: 0.04 });
    const k = outExpo(clamp((lt - 0.18) / 0.3));
    kword(c, KW.noai, W / 2 + (1 - k) * W, H * 0.55, W * 0.88, { col: KA, smear: (1 - k) * 300 });
    fade(c, clamp((lt - 0.3) / 0.15), () => ksmall(c, KW.canvas, W / 2, H * 0.8, 48, KI, { weight: 600 }));
  },
  pure(c, lt) {
    fill(c, KI);
    ksmall(c, 'renderAt(t)', W / 2, H * 0.18, 56, KH, { mono: true, weight: 600 });
    const k = outExpo(clamp(lt / 0.2));
    kword(c, 'f(t)', W / 2, H * 0.46, W * 0.6, { col: KC, s: lerp(1.5, 1, k), echo: 2, ex: 0, ey: 30, echoCol: KH });
    fade(c, clamp((lt - 0.12) / 0.15), () => KW.pure.forEach((l, i) => ksmall(c, l, W / 2, H * 0.74 + i * 66, 50, KC, { weight: 700 })));
  },
  dark(c, lt) {
    // a still beat: the film's dark garden, no motion and no music
    film(c, F_DARK, 0, 0, W, H, DARKF[0], DARKF[1]);
    // the words sit in the night sky, clear of Pip's face
    const v = c.createLinearGradient(0, 0, 0, H * 0.45); v.addColorStop(0, 'rgba(8,10,30,0.8)'); v.addColorStop(0.75, 'rgba(8,10,30,0.45)'); v.addColorStop(1, 'rgba(8,10,30,0)');
    c.fillStyle = v; c.fillRect(0, 0, W, H * 0.45);
    ksmall(c, KW.night, W / 2, H * 0.1, 54, KH);
    kword(c, KW.dark[0], W / 2, H * 0.2, W * 0.66, { col: KC, max: 124 });
    kword(c, KW.dark[1], W / 2, H * 0.325, W * 0.66, { col: KC, max: 124 });
  },
  together(c, lt, t) {
    fill(c, KH);
    const k = outExpo(clamp(lt / 0.25)), w = W * 0.62, x = (W - w) / 2, y = H * 0.1;
    c.save(); c.translate(W / 2, y + w / 2); c.scale(lerp(1.4, 1, k), lerp(1.4, 1, k)); c.rotate(lerp(-0.12, 0.02, k)); c.translate(-W / 2, -(y + w / 2));
    rrect(c, x, y, w, w, 28); c.save(); c.clip(); film(c, F_CHASE + lt, x, y, w, w, CHASE[0], CHASE[1]); c.restore();
    c.lineWidth = 8; c.strokeStyle = KI; rrect(c, x, y, w, w, 28); c.stroke();
    c.restore();
    const k2 = outExpo(clamp((lt - 0.12) / 0.22));
    if (lt > 0.12) kword(c, KW.together, W / 2, H * 0.8, W * 0.86, { col: KI, s: lerp(1.6, 1, k2), rot: lerp(-0.12, -0.02, k2) });
    fade(c, clamp((lt - 0.3) / 0.15), () => ksmall(c, KW.friends, W / 2, H * 0.94, 44, KI));
  },
  shots(c, lt) {
    fill(c, KC);
    kdrop(c, KW.shots, W / 2, H * 0.36, W * 0.84, lt, { col: KI, colLast: KA, step: 0.035 });
    fade(c, clamp((lt - 0.2) / 0.15), () => KW.frames.forEach((l, i) => ksmall(c, l, W / 2, H * 0.62 + i * 70, 50, KI, { weight: 700 })));
  },
  agents(c, lt) {
    fill(c, KI);
    ksmall(c, KW.made, W / 2, H * 0.27, 56, KH);
    const k = outExpo(clamp(lt / 0.22));
    kword(c, KW.agents, W / 2, H * 0.48, W * 0.86, { col: KC, s: lerp(1.6, 1, k), rot: lerp(-0.1, -0.02, k), echo: 3, ey: 26, echoCol: KH });
    fade(c, clamp((lt - 0.2) / 0.15), () => KW.studio.forEach((l, i) => ksmall(c, l, W / 2, H * 0.72 + i * 66, 50, KC)));
  },
  test(c, lt) {
    fill(c, KC);
    kdrop(c, KW.checked, W / 2, H * 0.17, W * 0.78, lt, { col: KI, colLast: KA, step: 0.03, from: 0.7 });
    const bx = 50, by = H * 0.28, bw = W - 100, bh = H * 0.66;
    rrect(c, bx, by, bw, bh, 22); c.fillStyle = KI; c.fill();
    setFont(c, 500, 44, true); const longest = Math.max(...KTERM.map(([p, s]) => c.measureText(p + s).width));
    const fs = Math.min(60, (44 * (bw - 120)) / longest);
    let y = by + 110;
    KTERM.forEach(([p, s], i) => {
      const t0 = 0.12 + i * 0.1; if (lt < t0) return;
      const n = p ? Math.floor(clamp((lt - t0) * 60, 0, s.length)) : s.length;
      T(c, p + s.slice(0, n), bx + 60, y, { size: fs, weight: 500, mono: true, col: p ? KC : s.includes('fail 0') ? '#8fd18b' : '#c9cfe8' });
      y += fs * 1.55;
    });
    // what the tests check, in words
    fade(c, clamp((lt - 0.6) / 0.15), () => KW.checks.forEach((l, i) => ksmall(c, l, W / 2, by + bh - 110 + i * 56, 42, KH, { weight: 600 })));
  },
  end(c, lt, t) {
    // the payoff: the three friends under the relit flower rush in, then the name, the promise and where to get it
    const k = outExpo(clamp(lt / 0.5)), z = lerp(1.35, 1, k) * (1 + 0.03 * clamp(lt / 3));
    c.save(); c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2);
    film(c, F_TRIO + lt, 0, 0, W, H, TRIO[0], TRIO[1]); c.restore();
    kflash(c, t, at('end'), 0.14);
    fade(c, smooth(clamp((lt - 0.35) / 0.4)), () => {
      const v = c.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(8,10,30,0.6)'); v.addColorStop(0.5, 'rgba(8,10,30,0.74)'); v.addColorStop(1, 'rgba(8,10,30,0.88)');
      c.fillStyle = v; c.fillRect(0, 0, W, H);
    });
    if (lt > 0.45) kdrop(c, KW.title, W / 2, H * 0.22, W * 0.86, lt - 0.45, { col: KC, step: 0.025, from: 0.6 });
    const a2 = smooth(clamp((lt - 0.9) / 0.3)), a3 = smooth(clamp((lt - 1.15) / 0.3));
    fade(c, a2, () => {
      // a tagline too long for one line breaks after its comma
      const one = lines(c, KW.tag, 54, 800, W * 0.86), ls = one.length > 1 && KW.tag.includes(', ') ? KW.tag.replace(', ', ',\n').split('\n') : one;
      ls.forEach((l, i) => ksmall(c, l, W / 2, H * 0.34 + i * 66, 54, KH, { weight: 800 }));
    });
    fade(c, a3, () => {
      ksmall(c, KW.cta, W / 2, H * 0.55, 44, KC + 'dd', { weight: 600 });
      ksmall(c, OWNER, W / 2, H * 0.63, 50, KC, { weight: 600 });
      kword(c, NAME, W / 2, H * 0.71, W * 0.76, { col: KC, weight: 900, max: 96 });
    });
    fade(c, smooth(clamp((lt - 1.4) / 0.3)), () => {
      const nl = lines(c, KW.note, 26, 400, W - 160);
      ksmall(c, KW.lic, W / 2, H - 70 - nl.length * 36 - 10, 26, KC + 'aa', { weight: 400 });
      nl.forEach((l, i) => ksmall(c, l, W / 2, H - 70 - (nl.length - 1 - i) * 36, 26, KC + 'aa', { weight: 400 }));
    });
  },
};
function kinetic(c, t) {
  let i = 0; while (i + 1 < KSHOTS.length && t >= KSHOTS[i + 1][0]) i++;
  const [t0, name] = KSHOTS[i], d = (KSHOTS[i + 1] ? KSHOTS[i + 1][0] : DUR) - t0, lt = t - t0;
  // every cut lands with a small punch and a slow drift, so no frame is quite still (but the dark beat is)
  const still = name === 'dark';
  const punch = still ? 1 : 1 + 0.05 * (1 - outExpo(clamp(lt / 0.25))) + 0.02 * (lt / d);
  const roll = still || name === 'end' || name === 'glows' ? 0 : (i % 2 ? 1 : -1) * 0.006 * (lt / d);
  c.save(); c.translate(W / 2, H / 2); c.scale(punch, punch); c.rotate(roll); c.translate(-W / 2, -H / 2);
  KSHOT[name](c, lt, t, d);
  c.restore();
}
// the soundtrack's cues (sound/trailer.py turns them into sound): a hit on every cut, a click and a drop on the press,
// whooshes into the big moves, a rising chime as the light climbs, ticks while the terminal types, silence for the
// dark beat, and the chord ringing out on the end card
const KCUES = (() => {
  const out = [];
  for (const [t0, n] of KSHOTS) if (!['press', 'glows', 'dark', 'end'].includes(n)) out.push({ t: t0, k: 'hit' });
  out.push({ t: 0.42, k: 'whoosh', until: 0.47, gain: 0.35 }, { t: 0.47, k: 'tick', freq: 900, gain: 0.3 });
  out.push({ t: at('press'), k: 'whoosh', until: at('press') + 0.2, gain: 0.3 }, { t: KPRESS, k: 'press' });
  out.push({ t: KPRESS + 0.3, k: 'whoosh', until: at('glows'), gain: 0.4 }, { t: at('glows'), k: 'hit' });
  out.push({ t: at('glows') + 0.1, k: 'chime', until: at('glows') + 0.85 });
  out.push({ t: at('glows') + 0.85, k: 'whoosh', until: at('no3d'), gain: 0.7 });
  out.push({ t: at('dark'), k: 'mute', until: at('together') });
  out.push({ t: at('together') + 0.12, k: 'hit' });
  KTERM.forEach(([p], i) => out.push({ t: at('test') + 0.12 + i * 0.1, k: 'tick', freq: p ? 1500 : 1100, gain: 0.14 }));
  out.push({ t: at('end') - 0.45, k: 'whoosh', until: at('end'), gain: 0.8 }, { t: at('end'), k: 'end' });
  return out.sort((a, b) => a.t - b.t);
})();

// ---- host hooks (the same as comp.html's, so film/render.mjs renders it) ---------------------------
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  kinetic(ctx, clamp(t, 0, DUR - 1e-6));
}
window.boot = async () => { await document.fonts.ready; return { duration: DUR, shots: KSHOTS.length, cues: KCUES, lang: ES ? 'es' : 'en' }; };
window.renderAt = (t) => { draw(t); return 0; };
window.trailer = { KSHOTS, KCUES, KW, KTERM, NPM_TEST, W, H, DUR, draw };
if (Q.has('t') || Q.has('play')) window.addEventListener('load', async () => {
  await window.boot(); if (Q.has('t')) return draw(Number(Q.get('t')));
  const t0 = performance.now(); const loop = () => { draw(((performance.now() - t0) / 1000) % DUR); requestAnimationFrame(loop); }; loop();
});
})();
