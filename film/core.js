// Pip and the Missing Glow, procedural renderer core (no images, no randomness, no wall clock).
// A paper-cut multiplane: every drawable is a flat card at one depth z. The camera projects cards with a
// pinhole lens, sorts them far to near, blurs runs of cards by distance from the focus plane (depth of field),
// and lights them with an ambient dusk colour plus warm point lights (the glow). Frame = f(film time).
(() => {
const W = 1920, H = 1080, TAU = Math.PI * 2;
const P = window.PIP = { W, H, TAU };
const clamp = P.clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = P.lerp = (a, b, k) => a + (b - a) * k;
const ss = P.ss = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const hash = P.hash = (i, j = 0) => { let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
P.noise = (x, s = 0) => { const i = Math.floor(x), f = x - i; return lerp(hash(i, s), hash(i + 1, s), f * f * (3 - 2 * f)) * 2 - 1; };
P.bump = (c, w, x) => Math.exp(-(((x - c) / w) ** 2));
// Eased keyframes [[t, v], ...]; v is a number or an array. KL is linear.
const mixv = (a, b, k) => Array.isArray(a) ? a.map((x, i) => lerp(x, b[i], k)) : lerp(a, b, k);
P.K = (t, ks, ease = ss) => { if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) return mixv(ks[i - 1][1], ks[i][1], ease(ks[i - 1][0], ks[i][0], t));
  return ks[ks.length - 1][1]; };
P.KL = (t, ks) => P.K(t, ks, (a, b, x) => clamp((x - a) / (b - a)));
const off = P.off = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ---------- colour and light ----------
// Colours are [r, g, b] in 0..255. A scene has ambient (multiplier, 0..1 per channel) and lights.
// light = { x, y, z, col: [r,g,b] 0..1, i: intensity, rad: falloff radius in world units }.
let SCENE = { ambient: [0.3, 0.38, 0.62], lights: [] };
// Falloff 1 / (1 + (d/rad)^2), faded out far beyond rad (to half at 5 rad, ~6% at 10 rad): without that window the long tails of a lit
// garden's 30-odd lights summed into a warm flood that reached everything, so a face near one glowing flower went flat yellow.
P.light = (x, y, z) => {   // per-channel multiplier at a world point
  const a = SCENE.ambient, out = [a[0], a[1], a[2]];
  for (const L of SCENE.lights) {
    const d = Math.hypot(x - L.x, y - L.y, (z - L.z) * 0.6), q = d / L.rad, w = 1 / (1 + (q / 5) ** 4), f = w * L.i / (1 + q * q);
    out[0] += L.col[0] * f; out[1] += L.col[1] * f; out[2] += L.col[2] * f;
  }
  return out;
};
// lit(base, x, y, z, emit) -> css colour. emit (0..1) adds self-glow that ignores darkness.
// Strong light would push each channel into the 255 ceiling at a different moment and bleach colours to cream. Instead the
// result is soft-clipped as a whole: luminance gets a gentle shoulder (RGB scaled together, so hue and chroma survive), then the
// brightest channel eases toward 255. Colours in the normal range (luminance under 158, no channel above 218) pass untouched; a lit
// face or felt surface rolls off early so it keeps its texture, and only additive glows (water sparks, stem cores, petal rims) reach the top.
const shoulder = (v, knee, top) => v < knee ? v : knee + (top - knee) * (1 - Math.exp(-(v - knee) / (top - knee)));
P.softClip = (r, g, b) => {
  const Y = 0.3 * r + 0.59 * g + 0.11 * b;
  if (Y > 158) { const f = shoulder(Y, 158, 232) / Y; r *= f; g *= f; b *= f; }
  const mx = Math.max(r, g, b);
  if (mx > 218) { const f = (218 + 37 * (1 - Math.exp(-(mx - 218) / 80))) / mx; r *= f; g *= f; b *= f; }
  return [r < 0 ? 0 : r, g < 0 ? 0 : g, b < 0 ? 0 : b];
};
P.lit = (c, x, y, z, emit = 0, alpha = 1) => {
  const m = P.light(x, y, z), q = P.softClip(c[0] * (m[0] + emit), c[1] * (m[1] + emit), c[2] * (m[2] + emit));
  const R = Math.round(q[0]), G = Math.round(q[1]), B = Math.round(q[2]);
  return alpha >= 1 ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${alpha})`;
};
P.rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
P.mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// ---------- paper ----------
// A small tileable fibre texture, multiplied lightly over cards so every surface reads as cut paper or felt.
const FIBRE = (() => { const c = off(256, 256), x = c.getContext('2d'); x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const a = hash(i, 3) * TAU, l = 4 + hash(i, 4) * 18, px = hash(i, 5) * 256, py = hash(i, 6) * 256;
    x.strokeStyle = `rgba(${hash(i, 7) > 0.5 ? 255 : 0},${hash(i, 7) > 0.5 ? 255 : 0},${hash(i, 7) > 0.5 ? 255 : 0},${0.05 + 0.08 * hash(i, 8)})`;
    x.lineWidth = 0.6 + hash(i, 9); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  return c; })();
let FIBRE_PAT = null;
// card(ctx, path, fill, o): one paper piece. path(ctx) builds the outline in world units (current transform).
// o.lift: drop-shadow offset in world units (paper thickness gap to the layer behind), o.shadow: alpha,
// o.edge: light top-edge highlight alpha, o.tex: fibre strength, o.stroke: optional outline colour.
P.card = (c, path, fill, o = {}) => {
  // v6.1: the gap is capped at 3.5 screen px. Uncapped, a close-up (10+ px a unit) threw each piece's shadow 12+ px, so every arm,
  // mitt, patch and boot carried an offset dark copy of its outline that read as a doubled, see-through puppet.
  const ms = c.getTransform(), lift = Math.min(o.lift ?? 1.2, 3.5 / Math.max(Math.hypot(ms.a, ms.b), 1e-6));
  if (lift > 0 && (o.shadow ?? 0.45) > 0) {
    c.save(); c.translate(lift * 0.6, lift); c.beginPath(); path(c); c.fillStyle = `rgba(4,6,16,${o.shadow ?? 0.45})`; c.fill(); c.restore();
  }
  c.beginPath(); path(c); c.fillStyle = fill; c.fill();
  if ((o.tex ?? 0.35) > 0) {
    if (!FIBRE_PAT) FIBRE_PAT = c.createPattern(FIBRE, 'repeat');
    c.save(); c.clip(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = o.tex ?? 0.35;
    const m = c.getTransform(), s = Math.hypot(m.a, m.b);
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = FIBRE_PAT; c.fillRect(0, 0, W, H); c.setTransform(m); c.restore();
    void s;
  }
  if (o.edge) { c.save(); c.clip(); c.translate(-lift * 0.3, -lift * 0.5); c.beginPath(); path(c);
    c.strokeStyle = `rgba(255,240,220,${o.edge})`; c.lineWidth = lift * 0.9; c.stroke(); c.restore(); }
  if (o.stroke) { c.beginPath(); path(c); c.strokeStyle = o.stroke; c.lineWidth = o.lineWidth ?? 0.6; c.stroke(); }
};

// ---------- camera and multiplane ----------
// cam = { x, y, z, f (focal length in px at distance 1 unit... i.e. screen px per world unit at depth 1),
//         focus (z of the sharp plane), ap (aperture: blur px per unit of 1/z mismatch), roll }
P.scaleAt = (cam, z) => cam.f / Math.max(z - cam.z, 1e-3);
P.project = (cam, x, y, z) => { const s = P.scaleAt(cam, z); return [W / 2 + (x - cam.x) * s, H / 2 + (y - cam.y) * s, s]; };
const blurAt = (cam, z) => { const d = Math.max(z - cam.z, 1e-3), fd = Math.max(cam.focus - cam.z, 1e-3);
  return (cam.ap ?? 0) * Math.abs(1 / fd - 1 / d) * cam.f * 0.01; };
const LEVELS = [0, 1.5, 3, 5, 8, 12, 18, 26];
const quant = b => { let k = 0; while (k < LEVELS.length - 1 && b > (LEVELS[k] + LEVELS[k + 1]) / 2) k++; return LEVELS[k]; };
const RUN = off(), RUNX = RUN.getContext('2d');
// A blurred run must not fade out at the frame edge (the blur would sample transparent pixels there and reveal the sharper layers beneath as a
// pale strip). So the run is copied into a padded canvas whose margin repeats the run's edge pixels, and that is what gets blurred.
const PADM = 84, PAD = off(W + 2 * PADM, H + 2 * PADM), PADX = PAD.getContext('2d');
const padRun = m => { PADX.setTransform(1, 0, 0, 1, 0, 0); PADX.clearRect(0, 0, W + 2 * m, H + 2 * m); PADX.drawImage(RUN, m, m);
  PADX.drawImage(RUN, 0, 0, 1, H, 0, m, m, H); PADX.drawImage(RUN, W - 1, 0, 1, H, W + m, m, m, H); PADX.drawImage(RUN, 0, 0, W, 1, m, 0, W, m); PADX.drawImage(RUN, 0, H - 1, W, 1, m, H + m, W, m);
  PADX.drawImage(RUN, 0, 0, 1, 1, 0, 0, m, m); PADX.drawImage(RUN, W - 1, 0, 1, 1, W + m, 0, m, m); PADX.drawImage(RUN, 0, H - 1, 1, 1, 0, H + m, m, m); PADX.drawImage(RUN, W - 1, H - 1, 1, 1, W + m, H + m, m, m); };

// Item: { z, draw(ctx, s) , blur? (override), sharp? }. draw works in world units at depth z: (x, y) world.
// Screen-space items: { z, screen: true, draw(ctx) } drawn without the world transform (for skies and washes).
// Near plane: scenery marked cull (every garden item world.js builds: flowers, buds, stones, props, the spout) closer than NEAR0 in front
// of the lens is not drawn, and between NEAR0 and NEAR1 it fades in, so nothing the camera passes is ever drawn huge for a frame (a
// flower 2 units from the lens would fill the screen). Items without the mark (the cast, a shot's own props) are only dropped closer than
// 0.5 units, as before: a character may come close to the lens on purpose. Never faded: screen items, fg items (camera-relative framing
// layers, world.foreground) and flat items (ground-plane pieces: turf strips, bed slices, water), which lie below the frame when they
// are that close and must not open holes at the bottom edge of a low shot.
const NEAR0 = 30, NEAR1 = 56;
P.NEAR = [NEAR0, NEAR1];
P.nearFade = (cam, it) => (it.screen || it.fg || it.flat || !it.cull) ? 1 : ss(NEAR0, NEAR1, it.z - cam.z);
const NEARC = off(), NEARX = NEARC.getContext('2d');
P.renderScene = (ctx, scene, t) => {
  SCENE = scene; const cam = scene.cam;
  const items = scene.items.filter(it => it && (it.screen || it.z > cam.z + 0.5) && P.nearFade(cam, it) > 0.003).sort((a, b) => b.z - a.z);
  let runBlur = -1, open = false;
  const flush = () => { if (!open) return; ctx.save(); if (runBlur > 0) { const m = Math.min(PADM, Math.ceil(runBlur * 3) + 2); padRun(m); ctx.filter = `blur(${runBlur}px)`; ctx.drawImage(PAD, 0, 0, W + 2 * m, H + 2 * m, -m, -m, W + 2 * m, H + 2 * m); } else ctx.drawImage(RUN, 0, 0); ctx.restore(); open = false; };
  for (const it of items) {
    const b = it.screen ? (it.blur ?? 0) : quant(it.blur ?? blurAt(cam, it.z));
    if (!open || b !== runBlur) { flush(); RUNX.setTransform(1, 0, 0, 1, 0, 0); RUNX.clearRect(0, 0, W, H); runBlur = b; open = true; }
    // an item in the near fade band is drawn on its own layer and laid over the run at its fade, so its own globalAlpha calls cannot undo it
    const fade = P.nearFade(cam, it), X = fade < 0.997 ? NEARX : RUNX;
    if (X === NEARX) { NEARX.setTransform(1, 0, 0, 1, 0, 0); NEARX.globalAlpha = 1; NEARX.globalCompositeOperation = 'source-over'; NEARX.filter = 'none'; NEARX.clearRect(0, 0, W, H); }
    X.save();
    if (cam.roll) { X.translate(W / 2, H / 2); X.rotate(cam.roll); X.translate(-W / 2, -H / 2); }
    if (it.screen) it.draw(X, t);
    else { const s = P.scaleAt(cam, it.z); X.translate(W / 2 - cam.x * s, H / 2 - cam.y * s); X.scale(s, s); it.draw(X, s, t); }
    X.restore();
    if (X === NEARX) { RUNX.save(); RUNX.setTransform(1, 0, 0, 1, 0, 0); RUNX.globalAlpha = fade; RUNX.drawImage(NEARC, 0, 0); RUNX.restore(); }
  }
  flush();
  // Light pools: each light warms the frame around its projection (soft, after depth of field).
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const L of scene.lights) {
    if (!L.halo) continue; const [x, y, s] = P.project(cam, L.x, L.y, L.z); const R = L.halo * s;
    if (R < 2 || x < -R || x > W + R || y < -R || y > H + R) continue;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R), c = L.col.map(v => Math.round(v * 255)).join(',');
    g.addColorStop(0, `rgba(${c},${0.32 * L.i})`); g.addColorStop(0.3, `rgba(${c},${0.12 * L.i})`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  }
  ctx.restore();
};

// ---------- grade ----------
const SMALL = off(480, 270), SMALL2 = off(480, 270);
// Film grain: a few 512 x 512 tiles of fine, slightly softened noise drawn 1:1 at output resolution (no upscaling, so no
// blocky texture inside glows). Each frame picks a tile and a pseudo-random offset from the film time.
const GRAIN = Array.from({ length: 6 }, (_, k) => { const raw = off(512, 512), x = raw.getContext('2d'), d = x.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) { const n = 128 + (hash(i, k + 99) + hash(i, k + 199) - 1) * 62; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = n; d.data[i * 4 + 3] = 255; }
  x.putImageData(d, 0, 0);
  const g = off(512, 512), y = g.getContext('2d'); y.filter = 'blur(0.55px)'; y.drawImage(raw, 0, 0); y.filter = 'none'; return g; });
let GRAIN_PAT = null;
P.grade = (ctx, canvas, t, o = {}) => {
  // Bloom from the highlights only: the frame is shrunk, pushed through a soft threshold (brightness then contrast, per channel: values
  // below about 0.7 drop to black, so mid-tones such as faces, felt and grass add nothing) and blurred; that is screened back over the frame. Only
  // the brightest light (water sparks, stem cores, petal edges) spreads a halo. A small share of the plain blurred frame keeps the soft
  // dusk atmosphere. o.bloom keeps its old meaning as the overall amount.
  const amt = o.bloom ?? 0.28, s = SMALL.getContext('2d'), s2 = SMALL2.getContext('2d');
  s.filter = 'none'; s.clearRect(0, 0, 480, 270); s.drawImage(canvas, 0, 0, 480, 270);
  s2.filter = 'brightness(0.55) contrast(5) blur(6px)'; s2.clearRect(0, 0, 480, 270); s2.drawImage(SMALL, 0, 0); s2.filter = 'none';
  s.filter = 'blur(9px)'; s.globalCompositeOperation = 'copy'; s.drawImage(SMALL, 0, 0); s.filter = 'none'; s.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = Math.min(0.75, amt * 2); ctx.drawImage(SMALL2, 0, 0, W, H);
  ctx.globalAlpha = Math.min(0.12, amt * 0.28); ctx.drawImage(SMALL, 0, 0, W, H); ctx.restore();
  const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,12,0)'); g.addColorStop(1, `rgba(0,0,12,${o.vignette ?? 0.6})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!GRAIN_PAT) GRAIN_PAT = GRAIN.map(g => ctx.createPattern(g, 'repeat'));
  { const f = Math.floor(t * 12), pat = GRAIN_PAT[f % 6]; pat.setTransform(new DOMMatrix().translate(Math.floor(hash(f, 7) * 512), Math.floor(hash(f, 8) * 512)));
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = o.grain ?? 0.12; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  if (o.fade) { ctx.fillStyle = `rgba(0,0,0,${o.fade})`; ctx.fillRect(0, 0, W, H); }
};
})();
