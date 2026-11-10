// Checks that keep the film reproducible: no randomness or clocks in the drawing code, the module contract is in
// place, the shot table and the cue sheet agree with shots.js, and the same frame renders to identical pixels twice
// (that one needs the playwright package and its Chromium: RENDER_TEST=1 npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadShots, parseShots, TARGETS } from '../film/qa.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILM = path.join(ROOT, 'film');
const SOURCES = ['core.js', 'world.js', 'cast.js', 'fx.js', 'shots.js', 'act1.js', 'act2.js', 'act3.js'];

test('drawing code never reads randomness or the clock', () => {
  for (const f of SOURCES) {
    const src = fs.readFileSync(path.join(FILM, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /Math\.random|Date\.now|new Date|performance\.now/, f);
  }
});

test('the host page loads every module in order', () => {
  const html = fs.readFileSync(path.join(FILM, 'comp.html'), 'utf8');
  const order = SOURCES.map(f => html.indexOf(`src="${f}"`));
  assert.ok(order.every(i => i > 0), 'every module is loaded');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'modules load in dependency order');
});

test('the lab page loads the core, the world, the cast and the fx lab scenes', () => {
  const html = fs.readFileSync(path.join(FILM, 'lab.html'), 'utf8');
  for (const f of ['core.js', 'world.js', 'cast.js', 'fx.js', 'lab-core.js', 'lab-world.js', 'lab-cast.js', 'lab-fx.js']) {
    assert.ok(html.includes(`src="${f}"`), `lab.html loads ${f}`);
  }
  assert.match(html, /LABS\['host-mblur'\] = /, 'the motion-blur lab scene is defined in lab.html');
});

// SHOTS and LINES as written in shots.js: [['s01-garden', 6], ...] and [[1.0, 'Every evening...'], ...]
const SHOTS_SRC = fs.readFileSync(path.join(FILM, 'shots.js'), 'utf8');
const SHOTS = [...SHOTS_SRC.match(/const SHOTS = \[([\s\S]*?)\];/)[1].matchAll(/\['([\w-]+)',\s*([\d.]+)\]/g)].map(m => [m[1], Number(m[2])]);
const LINES = [...SHOTS_SRC.match(/const LINES = \[([\s\S]*?)\];/)[1].matchAll(/\[([\d.]+),\s*'((?:[^'\\]|\\.)*)'\]/g)].map(m => [Number(m[1]), m[2]]);
const DURATION = SHOTS.reduce((a, s) => a + s[1], 0);

test('the shot table in CONTRACT.md matches shots.js', () => {
  assert.ok(SHOTS.length > 0, 'SHOTS parsed from shots.js');
  const md = fs.readFileSync(path.join(FILM, 'CONTRACT.md'), 'utf8');
  const rows = [...md.matchAll(/^\| (s\d\d-[\w-]+) \| ([\d.]+) \| ([\d.]+) \|/gm)].map(m => [m[1], Number(m[2]), Number(m[3])]);
  let t = 0;
  const expected = SHOTS.map(([name, dur]) => { const row = [name, t, dur]; t += dur; return row; });
  assert.deepEqual(rows, expected, 'shot names, starts and durations');
  assert.match(md, new RegExp(`\\*\\*Shot table\\*\\*[^\\n]*\\b${DURATION} s\\.`), `the bible states the film length (${DURATION} s)`);
});

test('the cue sheet covers the film and every narration line', () => {
  const cues = JSON.parse(fs.readFileSync(path.join(FILM, 'sound', 'cues.json'), 'utf8'));
  assert.equal(cues.duration, DURATION, 'cues.json duration is the film length');
  assert.ok(LINES.length > 0, 'LINES parsed from shots.js');
  for (const [at, text] of LINES) {
    const cue = cues.lines.find(l => Math.abs(l.at - at) < 1e-6);
    assert.ok(cue && text.startsWith(cue.text), `a recording starts at ${at} s with the start of "${text}"`);
  }
  for (const l of cues.lines) assert.ok(l.at >= 0 && l.at < DURATION, `${l.id} starts inside the film`);
  for (const e of cues.effects) assert.ok(e.start >= 0 && e.end <= DURATION + 1e-6 && e.start < e.end, `${e.id} sits inside the film`);
});

test('a frame renders identically twice, a blurred lab frame too', { skip: !process.env.RENDER_TEST && 'set RENDER_TEST=1 to render' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-'));
  const render = (...args) => execFileSync('node', [path.join(FILM, 'render.mjs'), ...args]);
  try {
    for (const d of ['a', 'b']) render('--stills', '64.5', '--still-dir', path.join(dir, d));
    assert.ok(fs.readFileSync(path.join(dir, 'a', 'still-64.50.png')).equals(fs.readFileSync(path.join(dir, 'b', 'still-64.50.png'))));
    // The blurred lab scene (grade.mblur 0.6): the same frame twice is identical, and the blur really changes the frame.
    // 0.5 s is blurred with 3 sub-frames, 1.5 s with 6 (grade.mblurN): both frames must render identically twice.
    for (const d of ['c', 'd']) render('--page', 'lab.html', '--lab', 'host-mblur', '--stills', '0.5,1.5', '--still-dir', path.join(dir, d));
    const blurred = fs.readFileSync(path.join(dir, 'c', 'still-0.50.png'));
    assert.ok(blurred.equals(fs.readFileSync(path.join(dir, 'd', 'still-0.50.png'))), 'a blurred frame (3 sub-frames) renders identically twice');
    assert.ok(fs.readFileSync(path.join(dir, 'c', 'still-1.50.png')).equals(fs.readFileSync(path.join(dir, 'd', 'still-1.50.png'))), 'a blurred frame (6 sub-frames) renders identically twice');
    render('--page', 'lab.html', '--lab', 'host-mblur', '--no-mblur', '--stills', '0.5', '--still-dir', path.join(dir, 'e'));
    assert.ok(!blurred.equals(fs.readFileSync(path.join(dir, 'e', 'still-0.50.png'))), '--no-mblur draws the scene without its blur');
    render('--page', 'lab.html?mblur=0', '--lab', 'host-mblur', '--stills', '0.5', '--still-dir', path.join(dir, 'f'));
    assert.ok(fs.readFileSync(path.join(dir, 'e', 'still-0.50.png')).equals(fs.readFileSync(path.join(dir, 'f', 'still-0.50.png'))), '--no-mblur is the page with ?mblur=0');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A blur whose sub-frames are all rejected (host-state-flicker names a new cut at every instant, so only the centre sub-frame is ever
// accepted) must draw the same frame as the unblurred page. The lab's composition is built from the world and fx state, so this also
// catches a centre frame drawn after a rejected sub-frame's build has left its state behind.
test('a blurred frame whose other sub-frames are all rejected equals the unblurred frame', { skip: !process.env.RENDER_TEST && 'set RENDER_TEST=1 to render' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-cut-'));
  const render = (...args) => execFileSync('node', [path.join(FILM, 'render.mjs'), ...args]);
  try {
    render('--page', 'lab.html', '--lab', 'host-state-flicker', '--stills', '0.5,1.25', '--still-dir', path.join(dir, 'blur'));
    render('--page', 'lab.html?mblur=0', '--lab', 'host-state-flicker', '--stills', '0.5,1.25', '--still-dir', path.join(dir, 'plain'));
    for (const t of ['0.50', '1.25']) assert.ok(fs.readFileSync(path.join(dir, 'blur', `still-${t}.png`)).equals(fs.readFileSync(path.join(dir, 'plain', `still-${t}.png`))), `t ${t}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A film frame must not depend on the frames drawn before it on the same page: scene state left by an earlier build or draw must
// never reach a later frame. Each target is rendered alone, then as the last of a list that first visits frames from other shots
// (a lit one, a night one, the blurred chase in s19, and the frame just after its 108.2 cut). The two PNGs must be byte-identical.
// The lists are one render.mjs --stills call each; a failure is not weakened by changing a list: bisect the visited frames instead.
const ORDER = [
  { target: 36, visits: '2,109.8,104.0,80,36', what: 'a night frame (s07)' },    // lit s01, chase s19 (after its cut), night s15
  { target: 121, visits: '58,104.0,109.8,8,121', what: 'a lit frame (s21)' },   // night s12, chase s19 (after its cut), lit s02
];
test('a film frame does not depend on the frames drawn before it', { skip: !process.env.RENDER_TEST && 'set RENDER_TEST=1 to render' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-order-'));
  const render = (...args) => execFileSync('node', [path.join(FILM, 'render.mjs'), ...args]);
  try {
    for (const [i, { target, visits, what }] of ORDER.entries()) {
      const name = `still-${target.toFixed(2)}.png`;
      render('--stills', String(target), '--still-dir', path.join(dir, `alone-${i}`));
      render('--stills', visits, '--still-dir', path.join(dir, `after-${i}`));
      const alone = fs.readFileSync(path.join(dir, `alone-${i}`, name));
      const after = fs.readFileSync(path.join(dir, `after-${i}`, name));
      assert.ok(alone.equals(after), `${what} at ${target} s differs when drawn last after ${visits}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// qa.mjs reads the shot list the same way this file does, and the targets it judges are the ones in CONTRACT.md.
test('qa.mjs parses the shot list to 21 shots and 135 s', () => {
  const shots = parseShots(SHOTS_SRC);
  assert.equal(shots.length, 21);
  assert.equal(shots.reduce((a, s) => a + s.dur, 0), 135);
  assert.equal(shots[0].start, 0);
  assert.deepEqual(shots.at(-1).name, 's23-trio');
  assert.equal(shots.at(-1).start, 129);
  assert.deepEqual(loadShots().map(s => [s.name, s.start, s.dur]), shots.map(s => [s.name, s.start, s.dur]));
  assert.equal(execFileSync('node', [path.join(ROOT, 'film', 'qa.mjs'), '--help']).toString().split('\n')[0].startsWith('usage: node film/qa.mjs'), true);
});

test('the picture targets in CONTRACT.md are the ones qa.mjs judges', () => {
  const md = fs.readFileSync(path.join(FILM, 'CONTRACT.md'), 'utf8');
  assert.match(md, /\*\*Targets\*\*/, 'the targets table is in the v8 section');
  const rows = [
    ['mean luma of every night shot \\(s05 to s17\\)', '54 to 68'],
    ['the darkest tenth of a night frame \\(10th percentile luma\\)', 'no more than 3 above the last cut\'s for that shot'],
    ['the spread of a night frame \\(90th minus 10th percentile luma\\)', 'at least 1\\.3 times'],
    ['mean saturation of every night shot', '13\\.5 or more'],
    ['the finale \\(s22\\)', 'at least 20% brighter than the brightest night shot'],
    ['frames that barely change \\(step under 0\\.25\\)', '25% of a shot or less'],
    ['a jolt: a step over 8 that is also 1\\.8 times the steps around it', 'none'],
    ['render cost', 'no more than 40% over the last cut'],
  ];
  for (const [what, target] of rows) assert.match(md, new RegExp(`\\| ${what} \\| ${target}`), what);
  assert.equal(TARGETS.lumaLo, 54); assert.equal(TARGETS.lumaHi, 68); assert.equal(TARGETS.p10Slack, 3);
  assert.equal(TARGETS.spreadRatio, 1.3); assert.equal(TARGETS.satMin, 13.5); assert.equal(TARGETS.finaleRatio, 1.2);
  assert.equal(TARGETS.stillStep, 0.25); assert.equal(TARGETS.stillMax, 25);
  assert.equal(TARGETS.joltStep, 8); assert.equal(TARGETS.joltRatio, 1.8); assert.equal(TARGETS.joltWindow, 0.25);
  assert.equal(TARGETS.nightFrom, 5); assert.equal(TARGETS.nightTo, 17);
  // the one night exception is s11 (the dark wide with one trapped glow): the contract says so, and qa.mjs judges it that way
  assert.match(md, /s11, the dark wide with one trapped glow, is the exception/, 'the contract names the s11 exception');
  assert.equal(TARGETS.lumaException, 's11-crane');
});

test('the qa baseline covers every shot, and the qa script is wired into npm', () => {
  const base = JSON.parse(fs.readFileSync(path.join(FILM, 'qa-baseline.json'), 'utf8'));
  const names = parseShots(SHOTS_SRC).map(s => s.name);
  assert.deepEqual(Object.keys(base).filter(k => !k.startsWith('_')), names, 'one entry per shot, in film order');
  for (const n of names) for (const f of ['luma', 'sat', 'p10', 'p90', 'spread', 'median', 'stepP90', 'stepMax', 'still']) assert.ok(Number.isFinite(base[n][f]), `${n}.${f}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.qa, 'node film/qa.mjs out/picture.mp4 --baseline film/qa-baseline.json --cuts film/qa-cuts.json');
});

// The known cuts are the film's internal cuts (hard cuts the jolt rule must not judge). Shot starts are not listed: the shot list
// already marks them. Every listed time is a film second inside the film, in order.
test('the known cut list holds the film\'s internal cuts and no shot starts', () => {
  const cuts = JSON.parse(fs.readFileSync(path.join(FILM, 'qa-cuts.json'), 'utf8'));
  assert.ok(Array.isArray(cuts) && cuts.length === 17, 'a JSON array of the 17 internal cuts found in the v7 reference');
  assert.ok(cuts.every(c => Number.isFinite(c) && c > 0 && c < DURATION), 'every cut is a film second inside the film');
  assert.deepEqual([...cuts].sort((a, b) => a - b), cuts, 'in order');
  const starts = []; let t = 0; for (const [, d] of SHOTS) { starts.push(t); t += d; }
  for (const c of cuts) assert.ok(starts.every(s => Math.abs(s - c) > 1 / 30 + 1e-6), `${c} is not a shot start`);
});

// grade.mblurN: integer 3 to 8, anything else 3 (values outside clamp). Checked on the page's own function.
test('the sub-frame count clamps to 3 to 8 and defaults to 3', { skip: !process.env.RENDER_TEST && 'set RENDER_TEST=1 to render' }, async () => {
  const { chromium } = await import('playwright');
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (fs.existsSync(mac) ? mac : undefined), args: ['--disable-accelerated-2d-canvas'] });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(FILM, 'lab.html')).href);
    const got = await page.evaluate(() => [undefined, null, 'x', 1, 2, 3, 6, 7.4, 8, 20, -5, Infinity, NaN].map(blurCount));
    assert.deepEqual(got, [3, 3, 3, 3, 3, 3, 6, 7, 8, 8, 3, 8, 3]);
  } finally { await browser.close(); }
});
