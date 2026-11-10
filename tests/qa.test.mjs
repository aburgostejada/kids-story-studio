// Checks for film/qa.mjs on short synthetic clips made with ffmpeg: a flat clip has no motion and no cut, a hard join is exactly one
// cut, which the motion numbers leave out, and the jolt rule tells a sudden jump inside a still picture from a steady fast move. Needs ffmpeg and ffprobe on PATH (the film's own render needs them too).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { measure, joltFrames, largestSteps, applyKnownCuts, parseCuts, rules, TARGETS } from '../film/qa.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-qa-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const make = (name, inputs) => {
  const out = path.join(dir, name);
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]);
  return out;
};
const flat = make('flat.mp4', ['-f', 'lavfi', '-i', 'color=c=0x3a5a9a:s=320x180:r=30:d=2']);
const join = make('join.mp4', ['-f', 'lavfi', '-i', 'color=c=0x202060:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=0xd0a050:s=320x180:r=30:d=1',
  '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0']);

test('a flat clip has no motion, no cut and a steady luma', async () => {
  const m = await measure(flat);
  assert.equal(m.frames, 60);
  for (let i = 1; i < m.frames; i++) {
    assert.equal(m.mo.cut[i], 0, `frame ${i} is not a cut`);
    assert.equal(m.mo.steps[i], 0, `frame ${i} does not move`);
  }
  assert.ok(m.lv.yavg.every(v => Math.abs(v - m.lv.yavg[0]) < 0.5), 'luma is steady');
  assert.ok(m.lv.yavg[0] > 60 && m.lv.yavg[0] < 110, `a mid-dark blue (luma ${m.lv.yavg[0]})`);
});

test('a hard join is one cut, and the cut is left out of the motion numbers', async () => {
  const m = await measure(join);
  assert.equal(m.frames, 60);
  const cuts = [...m.mo.cut].map((c, i) => (c && i > 0 ? i : 0)).filter(Boolean);
  assert.deepEqual(cuts, [30], 'the join at 1.0 s is the only cut');
  assert.ok(m.mo.steps[30] > 30, `the cut step is large (${m.mo.steps[30].toFixed(1)})`);
  for (let i = 1; i < m.frames; i++) if (i !== 30) assert.equal(m.mo.steps[i], 0, `frame ${i} is still`);
  assert.ok(m.lv.yavg[59] > m.lv.yavg[0] + 20, 'the second colour is brighter');
});

// Synthetic luma clips written as raw yuv420p and encoded losslessly, so the decoded gray frames are exactly what was drawn.
const W = 480, H = 270, FRAME = W * H * 3 / 2;
function clipFrom(name, n, luma) {
  const raw = Buffer.alloc(n * FRAME, 128), file = path.join(dir, `${name}.yuv`), out = path.join(dir, `${name}.mp4`);
  for (let i = 0; i < n; i++) {
    const y = luma(i);
    for (let p = 0; p < W * H; p++) raw[i * FRAME + p] = y[p];
  }
  fs.writeFileSync(file, raw);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${W}x${H}`, '-r', '30', '-i', file,
    '-c:v', 'libx264', '-qp', '0', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]);
  return out;
}
// A still textured picture, mid-tone, the same every frame.
const still = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) still[y * W + x] = 40 + ((x * 7 + y * 13 + ((x * y) % 23) * 5) % 150);
const plus = k => i => (i >= 30 ? Uint8Array.from(still, v => v + k) : still);

test('a sudden jump inside a still picture is a jolt, and only that frame is', async () => {
  const m = await measure(clipFrom('jump12', 60, plus(12)));
  assert.equal(m.mo.cut[30], 0, 'the jump is not a cut');
  // the step is measured on gray frames (full range): a luma jump of 12 in limited range is 12 x 255 / 219 there
  assert.ok(Math.abs(m.mo.steps[30] - 12 * 255 / 219) < 0.01, `the jump is a gray step of 13.97 (${m.mo.steps[30]})`);
  const jolts = joltFrames(m);
  assert.deepEqual(jolts.map(j => j.i), [30], 'the jump is the one jolt');
  assert.equal(jolts[0].context, 0, 'the picture around it is still');
  assert.ok(Math.abs(jolts[0].t - 1) < 1e-9, 'the jolt is at 1.0 s');
});

test('a jump below the jolt step is not a jolt, though it is a step', async () => {
  const m = await measure(clipFrom('jump5', 60, plus(5)));
  assert.ok(Math.abs(m.mo.steps[30] - 5 * 255 / 219) < 0.01, 'a 5 jump is a gray step of 5.82');
  assert.deepEqual(joltFrames(m), [], 'no jolt under 8');
});

test('a steady fast move at the same step is not a jolt', async () => {
  // a sine picture sliding 3 px a frame: every frame pair differs by the same step, about 12.4 in limited range, 14.5 gray
  const slide = i => { const y = new Uint8Array(W * H); for (let yy = 0; yy < H; yy++) for (let x = 0; x < W; x++) y[yy * W + x] = Math.round(128 + 100 * Math.sin(2 * Math.PI * (x - 3 * i) / 96)); return y; };
  const m = await measure(clipFrom('slide', 60, slide));
  for (let i = 1; i < 60; i++) assert.ok(m.mo.steps[i] > 13.5 && m.mo.steps[i] < 15.5, `frame ${i} steps ${m.mo.steps[i]}`);
  assert.deepEqual(joltFrames(m), [], 'a steady move has no jolt');
  const top = largestSteps(m, 5);
  assert.equal(top.length, 5, 'the five largest steps are listed');
  assert.ok(top.every(t => t.context > 13.5 && t.context < 15.5), 'each one sits in a steady context');
});

// Known cuts: a step whose frame time is within one frame (1/30 s) of a listed time is a cut, so a jump that is a real cut stops being a jolt.
test('a listed cut within one frame of a jump turns it into a cut; one more than a frame away does not', async () => {
  const file = clipFrom('jump12-known', 60, plus(12));
  assert.deepEqual(joltFrames(await measure(file)).map(j => j.i), [30], 'the jump is a jolt without a list');
  const near = await measure(file, { cuts: [1.02] });   // frame 30 (1.000 s) is 0.02 s away, inside one frame
  assert.equal(near.mo.cut[30], 1, 'the jump is a cut');
  assert.deepEqual(joltFrames(near), [], 'so it is no jolt');
  assert.deepEqual([near.known.listed, near.known.inSpan, near.known.matched], [1, 1, 1]);
  const far = await measure(file, { cuts: [1.04] });    // 0.04 s from frame 30: outside, but frame 31 (1.033 s) is inside
  assert.equal(far.mo.cut[30], 0, 'frame 30 is more than a frame from the listed time');
  assert.deepEqual(joltFrames(far).map(j => j.i), [30], 'so the jump stays a jolt');
  const outside = await measure(file, { cuts: [5] });   // not inside this clip at all
  assert.deepEqual([outside.known.inSpan, outside.known.matched], [0, 0]);
});

test('applyKnownCuts marks each frame within one frame of a listed time and counts the listed times inside the span', () => {
  const mo = { cut: new Uint8Array(100) };
  const res = applyKnownCuts(mo, 30, 10, 60, [9, 10.5, 11.99, 12.5, 40, 200]);   // the span is 10 s to 12 s
  assert.deepEqual([res.listed, res.inSpan, res.matched], [6, 2, 2]);
  assert.deepEqual([...mo.cut].flatMap((v, i) => (v ? [i] : [])), [14, 15, 16, 59], 'the frames within a frame of 10.5 s and of 11.99 s');
});

test('parseCuts takes a JSON array of film seconds, sorted; anything else is refused', () => {
  assert.deepEqual(parseCuts('[9, 4.5, 61.333]'), [4.5, 9, 61.333]);
  for (const bad of ['{"a":1}', '[-1]', '["4"]', '[null]', '[1e999]', 'nope']) assert.throws(() => parseCuts(bad), bad);
});

// The night luma rule: every night shot 54 to 68, except s11 (the dark wide with one trapped glow), which is at least the last cut's
// mean luma (with a baseline; without one, only the upper bound applies) and at most 68.
test('s11 is the one night shot allowed below the night luma range', () => {
  const row = (name, o = {}) => ({ name, judged: true, luma: 60, sat: 15, p10: 20, p90: 90, spread: 70, still: 0, jolts: [], baseline: null, ...o });
  const lumaRule = (rs, hasBaseline) => rules(rs, hasBaseline).find(r => r.id === 'night-luma');
  const others = [row('s05-stem-dies'), row('s07-dry-dipper')];
  assert.equal(TARGETS.lumaException, 's11-crane');
  assert.equal(lumaRule([...others, row('s11-crane', { luma: 40 })], false).status, 'PASS', 'without a baseline s11 has no lower bound');
  assert.equal(lumaRule([...others, row('s11-crane', { luma: 69 })], false).status, 'FAIL', 's11 stays at most 68');
  const base = { luma: 44, p10: 20, spread: 70, sat: 15, still: 0 };   // a full baseline row, as --write-baseline writes it
  assert.equal(lumaRule([...others, row('s11-crane', { luma: 44, baseline: base })], true).status, 'PASS');
  const low = lumaRule([...others, row('s11-crane', { luma: 40, baseline: base })], true);
  assert.equal(low.status, 'FAIL', 's11 below the last cut\'s luma fails');
  assert.deepEqual(low.failing.map(f => f.split(' ')[0]), ['s11-crane']);
  assert.equal(lumaRule([...others, row('s11-crane', { luma: 69, baseline: base })], true).status, 'FAIL');
  const dark = lumaRule([row('s07-dry-dipper', { luma: 50 }), row('s11-crane', { luma: 60 })], false);
  assert.equal(dark.status, 'FAIL', 'every other night shot keeps 54 to 68');
  assert.deepEqual(dark.failing.map(f => f.split(' ')[0]), ['s07-dry-dipper']);
});
