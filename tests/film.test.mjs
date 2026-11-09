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

const FILM = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'film');
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

test('a frame renders identically twice', { skip: !process.env.RENDER_TEST && 'set RENDER_TEST=1 to render' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-'));
  try {
    for (const d of ['a', 'b']) execFileSync('node', [path.join(FILM, 'render.mjs'), '--stills', '64.5', '--still-dir', path.join(dir, d)]);
    assert.ok(fs.readFileSync(path.join(dir, 'a', 'still-64.50.png')).equals(fs.readFileSync(path.join(dir, 'b', 'still-64.50.png'))));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
