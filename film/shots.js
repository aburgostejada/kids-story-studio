// Pip and the Missing Glow: the film. 21 shots, 135 s. One shared story state (water, light, leaf) as a pure
// function of film time T, and per-shot staging (camera, cast, framing layers). Modules: world.js, cast.js, fx.js.
(() => {
const P = window.PIP, { K, KL, ss, clamp, lerp, bump, noise } = P;
const F = 2400;                         // lens: px per world unit at distance 1

// ---------- shot list (durations in s) ----------
const SHOTS = [
  ['s01-garden', 6], ['s02-pour', 6], ['s04-dark-comes', 7], ['s05-stem-dies', 7],
  ['s06-fixes', 7], ['s07-dry-dipper', 6], ['s08-bram', 6], ['s09-luma', 5],
  ['s11-crane', 6], ['s12-journey', 8], ['s13-spout', 9], ['s14-pull', 5], ['s15-alone', 4],
  ['s16-plan', 7], ['s17-together', 11], ['s18-burst', 4], ['s19-chase', 7], ['s20-relight', 5],
  ['s21-together', 7], ['s22-garden', 6], ['s23-trio', 6],
];
const START = {}; { let t = 0; for (const [n, d] of SHOTS) { START[n] = t; t += d; } }
const DURATION = SHOTS.reduce((a, s) => a + s[1], 0);

// Narration (timed to picture; the sound pass aligns recordings to these windows).
const LINES = [
  [1.0, 'Every evening, the garden began to glow.'],
  [7.2, 'Water carried the light.'],
  [14.0, 'But tonight…'],
  [33.8, 'The channel was dry.'],
  [51.8, 'Where had the water stopped?'],
  [66.2, 'One curled leaf was holding back the stream.'],
  [83.6, 'Three friends. Three different strengths.'],
  [90.2, 'Bram pushed. Luma lifted. Pip unrolled.'],
  [105.2, 'The water ran, and the light followed.'],
  [117.6, 'Some things are easier together.'],
  [124.4, 'And the garden was bright enough for everyone.'],
];

// ---------- the story state: water carries light ----------
const RUNNEL = 1.14;                               // front past 1 = the runnel into the hero root
const RELEASE = START['s18-burst'] + 0.5;           // the leaf lets go
// Before the blockage the channel is full. The tail then runs downstream: the channel drains from the spout toward home,
// flowers go out in that order, and Pip's flower (the end) is last. Times are from the start of shot 4 (S4 = 12 s): the drain leaves the
// spout at S4 + 0.8, the first flowers by the spout (the one that faltered in s01 among them) are out as "But tonight..." lands at
// S4 + 2.0, the stretch past the middle of the garden is dark by S4 + 4.0, the rule flower's bank (u 0.834) empties at S4 + 4.8 (just
// after the cut to its close-up at S4 + 4.4), the channel end is dry at S4 + 6.8 and the runnel into Pip's root at S4 + 8.0 (s05).
const S4 = START['s04-dark-comes'], DRAIN0 = S4 - 4.5;
const tail = T => T < DRAIN0 ? 0 : T < RELEASE ? KL(T, [[DRAIN0, 0], [S4 + 0.8, 0], [S4 + 2.0, 0.17], [S4 + 3.0, 0.45], [S4 + 4.0, 0.72], [S4 + 4.8, 0.834], [S4 + 5.8, 0.95], [S4 + 6.8, 1.0], [S4 + 7.2, 1.0], [S4 + 8.0, RUNNEL + 0.02]]) : 0;
// The release, as one timeline across the cuts: the burst fills the sluice (s18), the light races down the whole winding channel in a wide
// (s19 to u 3.4, round the last bend at 0.86), then slows to a running pace near home so Pip and Bram can stay just ahead of it (0.86 to
// 0.93 by the cut to s20), and in s20 runs the last stretch into the root (1.0 at +1.3 s, the runnel at ROOT_WET). The head never
// reaches the root before s20, so s20 opens with it still upstream, off frame right.
// v4: the race reaches the rule flower's root tip (u 0.855, act 1's P.SH.RULE.uTip) at S19 + 2.5 so s19 can cut to the rule composition and
// show it relight (water at the root, then the light climbs) inside "and the light followed"; from there the head is at a running pace
// (0.875 when the close run starts at S19 + 4.2).
const front = T => T < RELEASE ? RUNNEL : KL(T, [[RELEASE, 0], [RELEASE + 1.4, 0.06], [START['s19-chase'], 0.19], [START['s19-chase'] + 2.0, 0.80], [START['s19-chase'] + 2.5, 0.856], [START['s19-chase'] + 4.2, 0.875], [START['s20-relight'], 0.93], [START['s20-relight'] + 1.3, 1.0], [START['s20-relight'] + 1.6, RUNNEL]]);
const ROOT_WET = START['s20-relight'] + 1.6;        // water reaches Pip's root again
// A flower is lit while water covers its spot; light climbs the stem in ~0.5 s, petals follow.
// Before the release (act 1 stages to these, and every later shot agrees): the garden wakes from the spout toward home over 0.15..2 s
// (the evening glow of s01). The hook of s01 (v5): flower 34, the bell just right of Pip's flower, only warns: it sputters from 2.6 s, is
// nearly dark and bowed 2.98..3.4 s, and comes back whole (full light by 3.56 s, head up by 3.72 s) until the dark reaches it; then it dies for
// good and bows (st.flower(i).droop, drawn by world.js). Flower 5, the tall star by the spout, is the first real failure: it stutters from
// 4.66 s and is out for good from 5.56 s. Flower 30 (the rule flower) is still dark when the film opens and lights in s02 (water at its root 6.85 s,
// the light climbs the stem 7.4..9.3 s, petals 8.6..9.7 s). Then each goes out as the tail passes, as before.
const flowerAt = (u, T) => {
  if (T < RELEASE) {   // lit from the start, goes out as the tail passes (petals first, then stem)
    const FL = P.world.FLOWERS, i = FL.findIndex(f => f.u === u), tp = tailTime(u);
    let o;
    if (T < tp) {
      const wk = ss(0, 0.9, T - 0.15 - 0.9 * u);
      o = { climb: wk, petal: 0.85 * wk, flicker: 1, open: 0.4 + 0.6 * wk };
      if (i === 30) { const k = T - START['s02-pour']; o = { climb: ss(1.4, 3.3, k), petal: 0.85 * ss(2.7, 3.7, k), flicker: 1, open: 0.4 + 0.6 * ss(2.6, 3.7, k) }; }
    } else { const k = T - tp; o = { climb: clamp(1 - (k - 0.25) / 0.6), petal: clamp(0.85 - k / 0.3), flicker: 1, open: clamp(1 - k / 1.2) * 0.6 + 0.4 }; }
    const wobble = (a, b) => 0.08 * Math.sin(T * a) * Math.sin(T * b);
    if (i === 34 && T > 2.6) {           // the bell beside Pip only WARNS: it sputters, goes nearly dark and bows (2.98..3.64 s), then comes
      if (T < tp) {                      // back weak, dimmer and still a little drooped; it dies for good when the dark reaches it (tail)
        const on = KL(T, [[2.6, 1], [2.62, 0.1], [2.71, 0.1], [2.73, 0.95], [2.81, 0.95], [2.83, 0.05], [2.91, 0.05], [2.93, 0.7], [2.96, 0.7], [2.98, 0.03],
          [3.4, 0.03], [3.42, 0.5], [3.46, 0.2], [3.49, 0.85], [3.56, 1]]);   // v6: it comes back whole (full light, head up), so the warning reads as a warning
        const droop = KL(T, [[2.96, 0], [3.2, 1], [3.44, 1], [3.72, 0]]);
        return { ...o, climb: o.climb * (0.25 + 0.75 * on), petal: o.petal * on, droop };
      }
      const d = T - tp;                  // out for good: what was left of its light drains and the head bows all the way
      return { ...o, droop: ss(0, 1.4, d) };
    }
    if (i === 5 && T > 4.66) {           // the far star by the spout: the first real failure. Stutters (each off fully dark), one weak last
      const on = KL(T, [[4.66, 1], [4.68, 0], [4.86, 0], [4.88, 1], [5.04, 1], [5.06, 0], [5.2, 0], [5.22, 0.7], [5.3, 0.7], [5.32, 0.04], [5.4, 0.04],
        [5.42, 0.4], [5.47, 0.4], [5.56, 0]]);   // flare, then out for good from 5.56 s: it stays dark (the dark later travels on from there)
      return { ...o, climb: o.climb * on, petal: o.petal * on, open: lerp(o.open, 0.4, ss(5.56, 6.6, T)) };
    }
    return o;
  }
  const fp = frontTime(u), bell = u === P.world.FLOWERS[34].u;   // the bowed bell lifts its head again as the light comes back
  if (T < fp) return { climb: 0, petal: 0, flicker: 1, open: 0.4, droop: bell ? 1 : 0 };
  const k = T - fp; return { climb: clamp(k / 0.45), petal: clamp((k - 0.35) / 0.4), flicker: 1, open: 0.4 + 0.6 * clamp((k - 0.3) / 0.8), droop: bell ? 1 - ss(0.1, 1.3, k) : 0 };
};
// When does the tail/front pass u? (Monotone, so bisect.)
const bisect = (f, u, a, b) => { if (f(a) >= u) return a; if (f(b) < u) return b; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (f(m) < u) a = m; else b = m; } return b; };
const TT = new Map(), FT = new Map();
const tailTime = u => { const k = Math.round(u * 1e4); if (!TT.has(k)) TT.set(k, bisect(tail, u, DRAIN0, RELEASE - 0.01)); return TT.get(k); };
const frontTime = u => { const k = Math.round(u * 1e4); if (!FT.has(k)) FT.set(k, bisect(front, u, RELEASE, DURATION)); return FT.get(k); };

// Pip's flower: the film opens close on it as the evening glow arrives. At 0 s only its root and the foot of the stem glow (the bright
// trickle feeds the root); the light climbs the stem from about 0.4 s to 2.6 s and the petals open and light from 2.0 s to 3.3 s. It
// stays lit through s02 and s04 (one hard flicker at S4 + 3.9 as the dark nears home), then dies in s05: the petals go out from
// S5 + 0.4 to S5 + 2.0, the light sinks down the stem from S5 + 1.4 to S5 + 4.0 and the head bows (droop 0.9 by S5 + 4.4, 1.0 by
// S5 + 6.1), and it stays bowed through s06. It is relit in s20 brighter than before. Shots may still layer a gag on top (s06 props
// the stem up and lets it flop).
const heroAt = T => {
  const s5 = START['s05-stem-dies'];
  if (T < S4) {
    return { climb: K(T, [[0, 0.14], [0.4, 0.2], [2.6, 1]]), petal: 0.12 + 0.78 * ss(2.0, 3.3, T), flicker: 1, open: 0.55 + 0.45 * ss(2.0, 3.4, T) };
  }
  if (T < s5) {
    const fl = 1 - 0.45 * bump(S4 + 3.9, 0.09, T) - 0.25 * bump(S4 + 4.15, 0.06, T);
    return { climb: 1, petal: 0.9, flicker: fl, open: 1 };
  }
  if (T < ROOT_WET) {
    const d = s5, droop = T < d + 4.6 ? 0.9 * ss(d + 0.5, d + 4.4, T) : 0.9 + 0.1 * ss(d + 4.6, d + 6.1, T);
    const petal = 0.9 * (1 - ss(d + 0.4, d + 2.0, T)) * (1 - 0.3 * bump(d + 1.2, 0.07, T));
    return { climb: 1 - ss(d + 1.4, d + 4.0, T), petal, flicker: 1, open: 1 - 0.45 * ss(d + 1.0, d + 4.5, T), droop };   // stays bowed while the garden is dark
  }
  const k = T - ROOT_WET;
  return { climb: ss(0.1, 1.6, k), petal: 1.0 * ss(1.2, 2.6, k) + 0.15 * bump(2.8, 0.6, k), flicker: 1, open: 0.55 + 0.45 * ss(1.0, 2.6, k) , droop: 1 - ss(0.1, 1.9, k)};
};

// The spout: a curled leaf jams the mouth; Bram drives the pin stone off its stem (with one slip back),
// Luma lifts the leaf tip, Pip unrolls it, it floats free.
const T17 = START['s17-together'];
// The climax as curves of u = seconds into s17 (act3 stages every shot to these, so the story state and the pictures agree). v4: each friend's
// job is finished and its result shown in the shared wide before the next one starts:
// k   Bram's push on the pin stone (0 at rest on the stem, 1 = rolled clear): his head under its right flank, a first shove on "Bram pushed"
//     (u 1.2) that rocks it, a slip back, the second heave that tips it off the stem (free by u 2.15) and rolls it back, a stone-width and
//     more, onto open ground (clear by u 2.4, at rest by u 2.75, still inside Bram's close);
// tip how far Luma has raised the leaf's tip (world units): pulses on "Luma lifted" (u 3.4), a little more in the joint strain, a jump in the surge;
// curl the scroll Pip opens: three heaves on "Pip unrolled" (u 5.8), three more in the joint strain, the last in the surge (piecewise linear and
//     always falling; the leaf springs fully open after the release, in s18).
const C17 = {
  k: u => K(u, [[1.1, 0], [1.45, 0.2], [1.75, 0.09], [1.95, 0.11], [2.15, 0.5], [2.4, 0.9], [2.75, 1.0]]),
  tip: u => K(u, [[3.62, 0], [3.92, 8], [4.15, 7], [4.42, 14.5], [4.75, 13.5], [5.05, 16.5], [8.0, 16.5], [8.5, 17.6], [8.9, 17.2], [9.6, 18.4], [10.15, 18], [10.6, 21], [11.5, 21]]),
  // v6.1: each heave unwinds more (to 0.2 by the release, was 0.41) so Pip's unrolling reads on a phone
  curl: u => 1 - 1.35 * (1 - KL(u, [[6.0, 1], [6.25, 0.87], [6.5, 0.86], [6.75, 0.75], [6.95, 0.745], [7.2, 0.66], [8.05, 0.655], [8.3, 0.6], [8.8, 0.595], [9.05, 0.55], [9.6, 0.545], [9.85, 0.5], [10.35, 0.495], [10.6, 0.42], [11.5, 0.41]])),
};
// The jammed scroll is wound a little fatter than its curl alone gives (rollK), so it reads on a phone as a plug in every spout shot; act 3
// starts its loosening from the same factor (P.state's leaf carries it; shots 17 and 18 replace it with their own rollK).
const ROLL_JAM = 1.6;   // (world.js ROLL_JAM_W and act3's ROLL_JAM match it)
const leafAt = T => {
  const mouth = P.world.chan(0), u = T - T17, LX = P.SH && P.SH.LEAF_X !== undefined ? P.SH.LEAF_X : mouth[0] + 5;
  const pre = T < T17, tip = pre ? 0 : C17.tip(u), lift = P.SH && P.SH.liftFor ? P.SH.liftFor(tip) : tip / 16;
  const free = T < RELEASE ? 0 : ss(0, 3.5, T - RELEASE);   // after the release it tumbles up and away and comes to rest on the bank right of the sluice
  return { curl: pre ? 1 : C17.curl(u) * (1 - 0.5 * free), x: LX + 170 * free, y: -10 - 4 * free, z: mouth[2] - 12 - 30 * free, rot: 0.25 + 0.5 * free, free, lift: lift * (1 - free), tip, rollK: ROLL_JAM };
};
// The pin stone (the lilac boulder act2 and act3 draw; the world's own small stone sits at the same x): Bram gets his head under its right
// flank and heaves; it tips up off the stem and rolls back, away from the camera (k from C17: 85 units back, a hair left), onto open ground where nothing grows or lies in front of it (act 2 and world.js keep that ground clear), so every later picture shows a strip of lit ground between
// it and the stem. drop: it drops the little height of the stem it sat on; hop: the small lift as it tips off. release: the stem springs free
// as the stone leaves it. P.SH.PIN_REST gives act 3 its resting offset (to keep that ground clear of plants).
const PIN_BACK = 85, PIN_RIGHT = -2, PIN_SPIN = -2 * Math.PI + 0.3;   // v5.1: it comes to rest straight back from where it sat, in the open between the
// leaf's base and Bram's head as the tight climax wide sees it (higher in the picture than the freed stem, with turf between), in front of the dam's
// back rows (world.js leaves a bay in its low terraces there); it turns about 6 rad and ends nearly upright
const pinAt = T => {
  const mouth = P.world.chan(0), u = T - T17, LX = P.SH && P.SH.LEAF_X !== undefined ? P.SH.LEAF_X : mouth[0] + 5;
  const k = T < T17 ? 0 : C17.k(u), off = ss(0.22, 1, k), drop = 1.6 * ss(0.3, 0.5, k), hop = 3.2 * Math.sin(Math.PI * ss(0.22, 0.55, k));
  return { x: LX + 132 - 2 * k + PIN_RIGHT * off, z: mouth[2] - 27.5 + PIN_BACK * Math.pow(off, 0.85), rot: -0.12 * k + PIN_SPIN * off, k, drop: drop - hop, release: ss(0.3, 0.55, k) };
};

P.state = T => ({
  t: T, water: front(T), waterTail: tail(T), waterGlow: 1,
  pond: T < DRAIN0 ? 0.3 : T < RELEASE ? lerp(0.3, 1, ss(DRAIN0, START['s14-pull'], T)) : 1 - ss(RELEASE, RELEASE + 8, T) * 0.6,
  hero: heroAt(T), flower: i => flowerAt(P.world.FLOWERS[i].u, T),
  leaf: leafAt(T), pinStone: pinAt(T),
  dipper: dipperAt(T),
});

// ---------- places ----------
const HERO = [0, 0, 400], STONE = [-55, 0, 395];
const PIP_HOME = [-30, 0, 396];
// The dipper (a small copper cup on a short handle). It lies on its side at the rest spot (-98, 0, 414) from the start of the film.
// Pip picks it up at the end of s06 (an insert at the rest spot: his mitt takes the handle at S6 + 6.3, the cup rises with it and is his
// from S6 + 6.8 = DIP_PICK) and carries it to the dry bed in s07. There, after the pebble, he sets it down on the bank beside him and lets
// go (S7 + 4.3 to S7 + 4.7, drawn by act 1): it lies there, on its side, at (147.5, -4.5, 626) (its handle clear of his boot), through s08 and s09 (y -4.5 so it lies on
// the turf, not sunk in it). From the journey on (s12, home is never seen until s19) it is back at the rest spot, where he picks it up in
// s21 at 1.0 s. Shots read st.dipper.pick / .down.
const BANK = [160.5, -3, 626];   // where he lays the cup down in s07 (beside his boots, on the rim stone at his side of the channel)
function dipperAt(T) {
  const DIP_PICK = START['s06-fixes'] + 6.8, DIP_DOWN = START['s07-dry-dipper'] + 4.3, AWAY = START['s12-journey'];
  const held = (T >= DIP_PICK && T < DIP_DOWN) || T >= START['s21-together'] + 1.0, bank = T >= DIP_DOWN && T < AWAY;
  return { x: bank ? BANK[0] : -98, y: bank ? BANK[1] : 0, z: bank ? BANK[2] : 414, rot: 0.08, held, water: 0, fall: 1, pick: DIP_PICK, down: DIP_DOWN };
}

// ---------- scene assembly ----------
const AMB = [0.30, 0.38, 0.65], AMB_DARK = [0.18, 0.23, 0.46];
// Ambient follows the light in the garden: warmer when it glows, colder when it's out.
const ambientAt = T => {
  const out = T < DRAIN0 ? 0 : T < RELEASE ? ss(S4 - 3, START['s05-stem-dies'] + 4, T) : 1 - ss(RELEASE + 2, START['s21-together'], T);
  return P.mixc(AMB, AMB_DARK, out);
};
const cam = (x, y, z, focus, ap = 35, extra = {}) => ({ x, y, z, f: extra.f || F, focus, ap, roll: extra.roll || 0 });
// Hand-held breathing for close shots: tiny, slow, deterministic.
const breathe = (t, a = 1) => [noise(t * 0.35, 11) * 1.2 * a, noise(t * 0.3, 12) * 0.8 * a];

function scene(T, c, items, o = {}) {
  const st = o.st || P.state(T), W = P.world, X = P.fx;
  st.cam = c;                                   // stones read the lens for their true-perspective faces
  st.calm = o.calm || 0;                        // 0..1: explanatory shots thin the small garden detail so the action reads (world.js)
  st.calmSnap = !!o.calmSnap;                   // a held calm: the small flowers either stay whole or go (no half-faded heads)
  const ff = o.fireflies ? X.fireflies(st, c, o.fireflies) : [];   // before lights: fireflies hand their glow to fx.lights
  const all = [
    ...W.sky(st), ...W.hills(st), ...W.ground(st, c), ...W.channel(st), ...X.water(st), ...W.flowers(st), ...W.hero(st),
    ...W.spout(st), ...W.props(st), ...(o.noFg ? [] : W.foreground(st, c)), ...X.motes(st, c, o.motes ?? 24, true), ...ff, ...flat(items),
  ];
  return { cam: c, ambient: o.ambient || ambientAt(T), lights: [...X.lights(st), ...(o.lights || [])], items: all.filter(it => it && it.draw), grade: o.grade || {} };
}
const flat = a => a.flat(Infinity).filter(Boolean);
const pip = p => P.cast.pip(p), bram = p => P.cast.bram(p), luma = p => P.cast.luma(p);
// Walk along a straight move: position plus a gait phase that advances with distance (feet stay planted).
// Gait phase from distance so the planted feet never skate: Pip covers walkAdvance(stride) per phase, Bram 2 * stride.
const pipGait = (d, stride = 8) => Math.abs(d) / P.cast.walkAdvance(stride), bramGait = (d, stride = 9) => Math.abs(d) / (2 * stride);
const walkX = (t, ks, stride = 8) => { const x = K(t, ks); return { x, walk: pipGait(x - ks[0][1], stride), moving: t > ks[0][0] && t < ks[ks.length - 1][0] }; };
const blink = (t, every = 3.1, seed = 0) => { const p = (t + seed) % every; return p < 0.14 ? Math.sin(p / 0.14 * Math.PI) : 0; };

// ---------- shots: act1.js, act2.js, act3.js fill B ----------
const B = {};
// The climax's shared three-quarter wide (v5), used by the end of shot 16, shot 17's wides and shot 18 up to the release: the lens stays where it
// was (so the leaf's tip still lines up with the cleft) but is longer (f), so the three contact points read on a phone; shift is its horizontal
// lens shift (px) and lumaY the height Luma hovers at where shot 16 hands over to shot 17 (her wing tips stay inside the top of this frame).
// v5.1: a little higher (y) looking down over the leaf into the pond, with a vertical lens shift (vshift, px; negative slides the picture up) so the
// horizon and moon leave the top of the frame and the friends fill it; shot 17's later wides are tighter still (act 3 TIGHT).
const WIDE17 = { x: -866, y: -62, f: 2900, shift: -300, vshift: -91, lumaY: -58 };
P.SH = { WIDE17, PIN_REST: [PIN_RIGHT, PIN_BACK], B, START, HERO, STONE, PIP_HOME, AMB, AMB_DARK, F, cam, breathe, scene, flat, pip, bram, luma, walkX, pipGait, bramGait, blink, state: P.state };

P.FILM = {
  duration: DURATION, lines: LINES, start: START,
  shots: SHOTS.map(([name, dur]) => ({ name, dur, build: (u, T) => B[name](u, T) })),
};
})();
