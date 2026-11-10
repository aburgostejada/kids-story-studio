#!/usr/bin/env node
// Measures a rendered cut of the film shot by shot against the picture targets in CONTRACT.md ("v8 picture polish", Targets).
// usage: node film/qa.mjs <video.mp4> [--json out.json] [--baseline film/qa-baseline.json] [--cuts film/qa-cuts.json] [--from S] [--to S]
//        node film/qa.mjs <video.mp4> --write-baseline FILE            (measures every shot; writes the numbers the baseline needs)
//        node film/qa.mjs --help
// --from and --to say which film seconds the video covers (default: from 0, to the end of the video). Only the shots that lie
// fully inside that span are judged; the others are printed and marked "partial". Needs Node 20+, ffmpeg and ffprobe on PATH and
// no npm packages. Per frame it reads mean luma (YAVG) and saturation (SATAVG) with signalstats, and from the gray frames at 480 px
// wide, from the limited-range luma plane, it takes the 10th and 90th percentile luma exactly (from the frame's histogram; signalstats'
// YLOW is not a percentile).
// The "step" is the mean absolute difference between consecutive gray frames (0..255). A frame pair is a cut when the step is above
// 30, or the two frames correlate below 0.6 and the step is above 2; cuts are left out of the motion numbers. A jolt is a non-cut step
// above 8 that is also at least 1.8 times the median of the non-cut steps within a quarter second on each side of it (the step
// itself left out). A steady fast move is not a jolt.
// --cuts FILE lists known cuts inside the film, as a JSON array of film seconds (a cut the detector cannot tell from a jolt, such as a
// hard cut between two similar framings). A step whose frame time is within one frame (1/30 s) of a listed time is treated as a cut.
// The night luma rule has one exception, s11 (the dark wide with one trapped glow): its mean luma is at least the last cut's for that
// shot (needs --baseline; without one only the upper bound applies) and at most TARGETS.lumaHi.
// Writes never go next to the video: --json and --write-baseline must be in another folder.
// Exit code: 0 when every judged rule passes, 2 when one fails, 1 for a usage or media error.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SW = 480;                                   // analysis width in px
export const TARGETS = {
  nightFrom: 5, nightTo: 17,                      // night shots s05 to s17
  lumaLo: 54, lumaHi: 68,                         // mean luma of each night shot
  lumaException: 's11-crane',                     // the dark wide with one trapped glow: at least the last cut's luma (see the header), at most lumaHi
  p10Slack: 3,                                    // 10th percentile luma of each night shot: no more than the last cut's for that shot plus this
  spreadRatio: 1.3,                               // 90th minus 10th percentile luma, at least this times the last cut's for that shot
  satMin: 13.5,                                   // mean saturation of each night shot, at least
  finale: 's22', finaleRatio: 1.2,                // s22 at least 20% brighter than the brightest night shot
  stillStep: 0.25, stillMax: 25,                  // frames that barely change, as a share of a shot
  joltStep: 8, joltRatio: 1.8, joltWindow: 0.25,  // a jolt: a non-cut step over 8 and 1.8 x the median within a quarter second
  cutStep: 30, cutCorr: 0.6, cutSmallStep: 2,     // what counts as a cut
};

// The shot list, read the same way tests/film.test.mjs reads it: [name, dur] pairs in SHOTS; starts are the running sum.
export function parseShots(src) {
  const block = src.match(/const SHOTS = \[([\s\S]*?)\];/);
  if (!block) throw new Error('film/shots.js: no SHOTS list found');
  let start = 0;
  return [...block[1].matchAll(/\['([\w-]+)',\s*([\d.]+)\]/g)].map(m => {
    const s = { name: m[1], start, dur: Number(m[2]) }; start += s.dur; return s;
  });
}
export function loadShots(file = path.join(HERE, 'shots.js')) { return parseShots(fs.readFileSync(file, 'utf8')); }
const shotNum = name => Number(name.slice(1, 3));
const isNight = name => shotNum(name) >= TARGETS.nightFrom && shotNum(name) <= TARGETS.nightTo;

function usage(code) {
  const text = 'usage: node film/qa.mjs <video.mp4> [--json out.json] [--baseline film/qa-baseline.json] [--cuts film/qa-cuts.json] [--from S] [--to S] [--write-baseline FILE]\n';
  (code ? process.stderr : process.stdout).write(text);
  process.exit(code);
}

function parseArgs(argv) {
  const o = { video: null, json: null, baseline: null, cuts: null, from: null, to: null, writeBaseline: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage(0);
    else if (['--json', '--baseline', '--cuts', '--from', '--to', '--write-baseline'].includes(a)) {
      const v = argv[++i]; if (v === undefined || v.startsWith('--')) { process.stderr.write(`${a} needs a value\n`); usage(1); }
      if (a === '--from' || a === '--to') { o[a.slice(2)] = Number(v); if (!Number.isFinite(o[a.slice(2)])) { process.stderr.write(`${a}: not a number: ${v}\n`); usage(1); } }
      else if (a === '--write-baseline') o.writeBaseline = v;
      else o[a.slice(2)] = v;
    } else if (a.startsWith('--')) { process.stderr.write(`unknown option ${a}\n`); usage(1); }
    else if (o.video === null) o.video = a;
    else { process.stderr.write(`one video file only, got ${a}\n`); usage(1); }
  }
  if (!o.video) usage(1);
  for (const out of [o.json, o.writeBaseline]) {
    if (out && path.dirname(path.resolve(out)) === path.dirname(path.resolve(o.video))) {
      process.stderr.write(`refusing to write ${out} next to the video; write to another folder\n`); usage(1);
    }
  }
  return o;
}

// The known cuts: a JSON array of film seconds, each a finite number from 0 up. Anything else is a usage error.
export function parseCuts(text) {
  const list = JSON.parse(text);
  if (!Array.isArray(list) || !list.every(c => Number.isFinite(c) && c >= 0)) throw new Error('expected a JSON array of film seconds (numbers from 0 up)');
  return list.slice().sort((a, b) => a - b);
}

const execText = (cmd, args, maxBuffer = 1 << 28) => new Promise((ok, fail) => execFile(cmd, args, { maxBuffer }, (err, stdout, stderr) => {
  if (err) fail(new Error(`${cmd} failed: ${String(stderr || err.message).trim().split('\n').slice(-3).join(' | ')}`)); else ok(stdout);
}));

async function probe(file) {
  let out;
  try { out = await execText('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,duration', '-of', 'json', file]); }
  catch (e) { throw new Error(`cannot read ${file}: ${e.message}`); }
  const s = JSON.parse(out).streams?.[0];
  if (!s) throw new Error(`${file} has no video stream`);
  const [n, d] = String(s.r_frame_rate || '30/1').split('/').map(Number), fps = d ? n / d : n;
  let duration = Number(s.duration);
  if (!Number.isFinite(duration)) { const f = JSON.parse(await execText('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file])); duration = Number(f.format.duration); }
  return { width: s.width, height: s.height, fps, duration };
}

// Per-frame mean luma and saturation from signalstats (the same numbers the contract's ffmpeg commands print).
async function levels(file) {
  const out = await execText('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', `scale=${SW}:-2,signalstats,metadata=print:file=-`, '-f', 'null', '-']);
  const yavg = [], sat = [];
  for (const m of out.matchAll(/lavfi\.signalstats\.(YAVG|SATAVG)=([\d.]+)/g)) (m[1] === 'YAVG' ? yavg : sat).push(Number(m[2]));
  if (!yavg.length || yavg.length !== sat.length) throw new Error(`signalstats gave ${yavg.length} luma and ${sat.length} saturation values`);
  return { yavg, sat };
}

// Frames from ffmpeg at 480 px wide, streamed so a whole film never sits in memory. vf is the filter chain, pix the output
// pixel format, bytes the size of one frame in that format, take how many leading bytes of each frame to keep.
async function* frameStream(file, vf, pix, bytes, take) {
  const child = spawn('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', pix, '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', d => { stderr += d; });
  const exit = new Promise(ok => child.on('close', code => ok(code)));
  let pending = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    let off = 0;
    while (pending.length - off >= bytes) { yield pending.subarray(off, off + take); off += bytes; }
    pending = pending.subarray(off);
  }
  const code = await exit;
  if (code) throw new Error(`ffmpeg could not decode the frames: ${stderr.trim().split('\n').slice(-2).join(' | ')}`);
}
// The gray frames the step is measured on (ffmpeg's gray conversion, the same frames the brief's step command reads).
const grayFrames = (file, size, h) => frameStream(file, `scale=${SW}:${h},format=gray`, 'gray', size, size);
// The luma (Y) plane of each frame in limited range, the same values signalstats reads for the mean and that the percentiles use.
const lumaFrames = (file, size, h) => frameStream(file, `scale=${SW}:${h}`, 'yuv420p', size * 3 / 2, size);

// The luma value at which the cumulative histogram first reaches q of the pixels (q = 0.1 gives the 10th percentile).
function percentile(hist, total, q) {
  const target = q * total; let c = 0;
  for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= target) return v; }
  return 255;
}

// Step, correlation and cut flags of every frame (gray frames), and the 10th and 90th percentile luma of every frame (limited-range
// luma). Frame 0 has no step.
async function motion(file, h, n) {
  const size = SW * h, steps = new Float64Array(n), corr = new Float64Array(n), cut = new Uint8Array(n);
  const p10 = new Float64Array(n), p90 = new Float64Array(n), hist = new Uint32Array(256);
  let prev = null, i = 0;
  for await (const cur of grayFrames(file, size, h)) {
    if (i >= n) break;
    if (prev) {
      let sad = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let p = 0; p < size; p++) {
        const a = prev[p], b = cur[p], d = a > b ? a - b : b - a;
        sad += d; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
      }
      const step = sad / size, va = size * saa - sa * sa, vb = size * sbb - sb * sb;
      const r = va > 0 && vb > 0 ? (size * sab - sa * sb) / Math.sqrt(va * vb) : (sad === 0 ? 1 : 0);
      steps[i] = step; corr[i] = r;
      cut[i] = step > TARGETS.cutStep || (r < TARGETS.cutCorr && step > TARGETS.cutSmallStep) ? 1 : 0;
    } else { steps[i] = NaN; corr[i] = NaN; }
    prev = cur; i++;
  }
  const count = i;
  let k = 0;
  for await (const y of lumaFrames(file, size, h)) {
    if (k >= n) break;
    hist.fill(0);
    for (let p = 0; p < size; p++) hist[y[p]]++;
    p10[k] = percentile(hist, size, 0.1); p90[k] = percentile(hist, size, 0.9);
    k++;
  }
  return { steps, corr, cut, p10, p90, count: Math.min(count, k) };
}

const pct = (sorted, q) => { if (!sorted.length) return NaN; const pos = q * (sorted.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const median = a => pct([...a].sort((x, y) => x - y), 0.5);

// Known cuts (film seconds): a step whose frame time is within one frame of a listed time is treated as a cut, the same as a detected one.
// Returns how many listed cuts fall inside the measured span and how many of them found a frame.
export function applyKnownCuts(mo, fps, from, frames, cuts) {
  const tol = 1 / fps + 1e-6, res = { listed: cuts.length, inSpan: 0, matched: 0, frames: 0 };
  for (const c of cuts) {
    if (c < from - tol || c > from + frames / fps + tol) continue;
    res.inSpan++;
    let hit = false;
    for (let i = 1; i < frames; i++) {
      if (Math.abs(from + i / fps - c) > tol) continue;
      hit = true;
      if (!mo.cut[i]) { mo.cut[i] = 1; res.frames++; }
    }
    if (hit) res.matched++;
  }
  return res;
}

// Measures one video. from/to are film seconds (to defaults to from plus the video's length); cuts are known film cuts (see above).
export async function measure(video, { from = 0, to = null, cuts = [] } = {}) {
  const info = await probe(video);
  const fps = info.fps, end = to ?? from + info.duration;
  const h = 2 * Math.round(SW * info.height / info.width / 2);
  const [lv, mo] = await Promise.all([levels(video), motion(video, h, Math.round(info.duration * fps) + 1)]);
  const frames = Math.min(lv.yavg.length, mo.count);
  const known = applyKnownCuts(mo, fps, from, frames, cuts);
  return { info, fps, from, to: end, frames, lv, mo, h, known };
}

// The median of the non-cut steps within a quarter second either side of frame i (frame i itself left out).
export function contextMedian(m, i) {
  const k = Math.floor(TARGETS.joltWindow * m.fps + 1e-9), vals = [];
  for (let j = Math.max(1, i - k); j <= Math.min(m.frames - 1, i + k); j++) if (j !== i && !m.mo.cut[j] && Number.isFinite(m.mo.steps[j])) vals.push(m.mo.steps[j]);
  return vals.length ? median(vals) : NaN;
}
// The jolt test for frame i: null, or { i, t, step, context, ratio }.
export function joltAt(m, i) {
  if (i < 1 || i >= m.frames || m.mo.cut[i]) return null;
  const step = m.mo.steps[i];
  if (!(step > TARGETS.joltStep)) return null;
  const context = contextMedian(m, i);
  if (!Number.isFinite(context) || step < TARGETS.joltRatio * context) return null;
  return { i, t: m.from + i / m.fps, step, context, ratio: context > 0 ? step / context : Infinity };
}
export function joltFrames(m) {
  const out = []; for (let i = 1; i < m.frames; i++) { const j = joltAt(m, i); if (j) out.push(j); }
  return out;
}
// The n largest non-cut steps of the video, with their context medians (information, not a rule).
export function largestSteps(m, n = 5) {
  const all = []; for (let i = 1; i < m.frames; i++) if (!m.mo.cut[i] && Number.isFinite(m.mo.steps[i])) all.push(i);
  all.sort((a, b) => m.mo.steps[b] - m.mo.steps[a]);
  return all.slice(0, n).map(i => ({ i, t: m.from + i / m.fps, step: m.mo.steps[i], context: contextMedian(m, i) }));
}

function summarise(shots, m, base) {
  const rows = shots.filter(s => s.start < m.to && s.start + s.dur > m.from).map(s => ({ name: s.name, start: s.start, dur: s.dur, frames: 0, cutFrames: 0, yavg: [], sat: [], p10: [], p90: [], steps: [] }));
  for (let i = 0; i < m.frames; i++) {
    const tf = m.from + i / m.fps;
    const row = rows.find(r => tf + 1e-6 >= r.start && tf + 1e-6 < r.start + r.dur);
    if (!row) continue;
    row.frames++; row.yavg.push(m.lv.yavg[i]); row.sat.push(m.lv.sat[i]); row.p10.push(m.mo.p10[i]); row.p90.push(m.mo.p90[i]);
    if (i > 0) { if (m.mo.cut[i]) row.cutFrames++; else row.steps.push({ step: m.mo.steps[i], t: tf, i }); }
  }
  const jolts = joltFrames(m);
  return rows.map(r => {
    const st = r.steps.map(x => x.step), sorted = [...st].sort((a, b) => a - b);
    const top = r.steps.reduce((best, x) => (!best || x.step > best.step ? x : best), null);
    const judged = r.start >= m.from - 1e-3 && r.start + r.dur <= m.to + 1e-3 && r.frames > 0;
    const shotJolts = jolts.filter(j => j.t + 1e-6 >= r.start && j.t + 1e-6 < r.start + r.dur);
    const p10 = mean(r.p10), p90 = mean(r.p90);
    return {
      name: r.name, start: r.start, dur: r.dur, judged, partial: !judged, frames: r.frames, cutFrames: r.cutFrames,
      luma: mean(r.yavg), sat: mean(r.sat), p10, p90, spread: p90 - p10,
      median: pct(sorted, 0.5), stepP90: pct(sorted, 0.9),
      stepMax: top ? top.step : NaN, stepMaxAt: top ? top.t : NaN,
      still: st.length ? 100 * st.filter(x => x < TARGETS.stillStep).length / st.length : NaN,
      jolts: shotJolts.map(j => ({ t: j.t, step: j.step, context: j.context, ratio: j.ratio })),
      baseline: base?.[r.name] ?? null,
    };
  });
}

// The rules a cut is judged by. rows are the shots (summarise), hasBaseline says whether --baseline numbers are there.
export function rules(rows, hasBaseline) {
  const out = [];
  const judged = rows.filter(r => r.judged), night = judged.filter(r => isNight(r.name));
  const rule = (id, text, set, check, detail = () => '') => {
    if (!set.length) { out.push({ id, text, status: 'SKIP', judged: 0, failing: [] }); return; }
    const failing = set.filter(r => !check(r)).map(r => `${r.name} ${detail(r)}`.trim());
    out.push({ id, text, status: failing.length ? 'FAIL' : 'PASS', judged: set.length, failing });
  };
  const f1 = x => x.toFixed(1);
  // s11 is the exception: at least the last cut's mean luma (only with a baseline) and at most lumaHi; every other night shot is lumaLo to lumaHi.
  const lumaOk = r => r.name === TARGETS.lumaException
    ? r.luma <= TARGETS.lumaHi && (!r.baseline || r.luma >= r.baseline.luma)
    : r.luma >= TARGETS.lumaLo && r.luma <= TARGETS.lumaHi;
  const lumaDetail = r => r.name !== TARGETS.lumaException ? f1(r.luma)
    : `${f1(r.luma)}${r.baseline ? ` (at least ${f1(r.baseline.luma)}, at most ${TARGETS.lumaHi})` : ` (at most ${TARGETS.lumaHi}; no baseline for the lower bound)`}`;
  rule('night-luma', `mean luma of night shots ${TARGETS.lumaLo} to ${TARGETS.lumaHi}; ${TARGETS.lumaException} (the dark wide with one trapped glow) at least the last cut's and at most ${TARGETS.lumaHi}`,
    night, lumaOk, lumaDetail);
  if (!hasBaseline) out.push({ id: 'night-p10', text: `10th percentile luma of night shots no more than ${TARGETS.p10Slack} above the last cut's for that shot`, status: 'SKIP', judged: 0, failing: [], note: 'needs --baseline' });
  else {
    const withBase = night.filter(r => r.baseline);
    rule('night-p10', `10th percentile luma of night shots no more than ${TARGETS.p10Slack} above the last cut's for that shot (shadows stay deep blue)`, withBase,
      r => r.p10 <= r.baseline.p10 + TARGETS.p10Slack, r => `${f1(r.p10)} vs ${f1(r.baseline.p10)} (limit ${f1(r.baseline.p10 + TARGETS.p10Slack)})`);
  }
  if (!hasBaseline) out.push({ id: 'night-spread', text: `spread (90th minus 10th percentile) of night shots at least ${TARGETS.spreadRatio} times the last cut's`, status: 'SKIP', judged: 0, failing: [], note: 'needs --baseline' });
  else {
    const withBase = night.filter(r => r.baseline);
    rule('night-spread', `spread (90th minus 10th percentile) of night shots at least ${TARGETS.spreadRatio} times the last cut's`, withBase,
      r => r.spread >= TARGETS.spreadRatio * r.baseline.spread, r => `${f1(r.spread)} vs ${f1(r.baseline.spread)} (x${(r.spread / r.baseline.spread).toFixed(2)})`);
  }
  rule('night-sat', `mean saturation of night shots at least ${TARGETS.satMin}`, night, r => r.sat >= TARGETS.satMin, r => f1(r.sat));
  const fin = judged.find(r => r.name.startsWith(TARGETS.finale + '-'));
  const finText = `${TARGETS.finale} at least ${Math.round((TARGETS.finaleRatio - 1) * 100)}% brighter than the brightest night shot`;
  if (!fin || !night.length) out.push({ id: 'finale', text: finText, status: 'SKIP', judged: 0, failing: [] });
  else {
    const top = Math.max(...night.map(r => r.luma)), ok = fin.luma >= TARGETS.finaleRatio * top;
    out.push({ id: 'finale', text: `${finText} (brightest night ${top.toFixed(1)}, ${TARGETS.finale} ${fin.luma.toFixed(1)})`, status: ok ? 'PASS' : 'FAIL', judged: 1, failing: ok ? [] : [fin.name] });
  }
  rule('still', `frames that barely change (step under ${TARGETS.stillStep}) at most ${TARGETS.stillMax}% of every shot`, judged,
    r => r.still <= TARGETS.stillMax, r => `${f1(r.still)}%`);
  const jolted = judged.filter(r => r.jolts.length);
  out.push({ id: 'jolt', text: `no jolt: a non-cut step over ${TARGETS.joltStep} that is also ${TARGETS.joltRatio} times the steps within a quarter second`,
    status: judged.length ? (jolted.length ? 'FAIL' : 'PASS') : 'SKIP', judged: judged.length,
    failing: jolted.flatMap(r => r.jolts.map(j => `${r.name} at ${j.t.toFixed(2)} s (step ${j.step.toFixed(2)}, context ${j.context.toFixed(2)})`)) });
  return out;
}

const f1 = x => Number.isFinite(x) ? x.toFixed(1) : '-';
const f2 = x => Number.isFinite(x) ? x.toFixed(2) : '-';
const tm = x => Number.isFinite(x) ? `${x.toFixed(1)}s` : '-';

function printTable(rows, hasBase) {
  const head = [['shot', 16], ['start', 6], ['dur', 4], ['luma', 6], ['sat', 6], ['p10', 6], ['p90', 6], ['sprd', 6], ['med', 6], ['p90s', 6], ['max', 6], ['at', 7], ['still%', 7], ['jolt', 5]];
  if (hasBase) head.push(['|', 1], ['b.luma', 7], ['b.sprd', 7], ['b.sat', 6], ['b.still', 8]);
  console.log(head.map(([h, w], i) => i === 0 ? h.padEnd(w) : h.padStart(w)).join(' '));
  for (const r of rows) {
    const b = r.baseline;
    const cells = [r.name.padEnd(16), String(r.start).padStart(6), String(r.dur).padStart(4), f1(r.luma).padStart(6), f1(r.sat).padStart(6),
      f1(r.p10).padStart(6), f1(r.p90).padStart(6), f1(r.spread).padStart(6), f2(r.median).padStart(6), f2(r.stepP90).padStart(6), f2(r.stepMax).padStart(6),
      tm(r.stepMaxAt).padStart(7), f1(r.still).padStart(7), String(r.jolts.length).padStart(5)];
    if (hasBase) cells.push('|', ...(b ? [f1(b.luma), f1(b.spread), f1(b.sat), f1(b.still)] : ['-', '-', '-', '-']).map((x, i) => x.padStart(i === 3 ? 8 : 7)));
    console.log(cells.join(' ') + (r.partial ? '  (partial, not judged)' : ''));
  }
}

function baselineFrom(rows, source) {
  const out = { _source: source, _note: 'Measured by film/qa.mjs --write-baseline on the previous cut. Keys are shot names; luma and sat are mean luma and saturation; p10, p90 and spread are the mean 10th and 90th percentile luma and their difference; step values are per shot; still is the percentage of frames whose step is under 0.25.' };
  for (const r of rows) out[r.name] = { start: r.start, dur: r.dur, luma: r.luma, sat: r.sat, p10: r.p10, p90: r.p90, spread: r.spread, median: r.median, stepP90: r.stepP90, stepMax: r.stepMax, stepMaxAt: r.stepMaxAt, still: r.still };
  return out;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(o.video)) { process.stderr.write(`no such video: ${o.video}\n`); process.exit(1); }
  const shots = loadShots();
  const baseJson = o.baseline ? JSON.parse(fs.readFileSync(o.baseline, 'utf8')) : null;
  let cuts = [];
  if (o.cuts) {
    try { cuts = parseCuts(fs.readFileSync(o.cuts, 'utf8')); }
    catch (e) { process.stderr.write(`--cuts ${o.cuts}: ${e.message}\n`); process.exit(1); }
  }
  const m = await measure(o.video, { from: o.from ?? 0, to: o.to, cuts });
  const rows = summarise(shots, m, baseJson);
  if (o.writeBaseline) {
    const missing = shots.filter(s => !rows.some(r => r.name === s.name && r.judged));
    if (missing.length) { process.stderr.write(`--write-baseline needs every shot fully inside the video; missing ${missing.map(s => s.name).join(', ')}\n`); process.exit(1); }
    fs.mkdirSync(path.dirname(path.resolve(o.writeBaseline)), { recursive: true });
    fs.writeFileSync(o.writeBaseline, JSON.stringify(baselineFrom(rows, `${path.basename(o.video)}, film ${m.from} to ${m.to} s`), null, 1) + '\n');
    console.log(`wrote ${o.writeBaseline} (${rows.length} shots)`);
    return;
  }
  const rs = rules(rows, !!baseJson);
  const largest = largestSteps(m, 5);
  console.log(`${path.basename(o.video)}: ${m.frames} frames at ${m.fps.toFixed(3)} fps, film ${m.from.toFixed(2)} to ${m.to.toFixed(2)} s, analysed at ${SW}x${m.h}`);
  if (cuts.length) console.log(`known cuts from ${path.basename(o.cuts)}: ${m.known.inSpan} of ${m.known.listed} inside this span, ${m.known.matched} found a frame, ${m.known.frames} frames treated as cuts`);
  printTable(rows, !!baseJson);
  console.log('\nlargest non-cut steps (information): ' + largest.map(l => `${l.t.toFixed(2)} s step ${l.step.toFixed(2)} (context ${f2(l.context)})`).join('; '));
  console.log('');
  for (const r of rs) console.log(`${r.status.padEnd(5)} ${r.text}${r.status === 'FAIL' ? ': ' + r.failing.join('; ') : ''}${r.status === 'SKIP' ? (r.note ? ` (${r.note})` : ' (no shot fully inside the video)') : ''}`);
  const count = s => rs.filter(r => r.status === s).length, failed = count('FAIL');
  console.log(`\n${count('PASS')} pass, ${failed} fail, ${count('SKIP')} skipped`);
  if (o.json) {
    fs.mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true });
    fs.writeFileSync(o.json, JSON.stringify({ video: o.video, fps: m.fps, from: m.from, to: m.to, frames: m.frames, targets: TARGETS, shots: rows, rules: rs, largestSteps: largest, baseline: o.baseline, cuts: o.cuts, knownCuts: m.known }, null, 1));
  }
  process.exitCode = failed ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => { process.stderr.write(`qa: ${e.message}\n`); process.exit(1); });
}
