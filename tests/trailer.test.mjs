// Checks for the 15-second trailer (film/trailer.html + trailer.js, sound/trailer.py): its drawing code stays a pure
// function of time, its shot list keeps the shape of the cut, the npm test numbers it shows are the real ones, the
// score is deterministic, and (with RENDER_TEST=1, needs playwright and its Chromium) every shot draws without errors
// in both languages and every sound cue fits inside the trailer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILM = path.join(ROOT, 'film');
const SRC = fs.readFileSync(path.join(FILM, 'trailer.js'), 'utf8');
const DRAWING = SRC.slice(0, SRC.indexOf('// ---- host hooks')).replace(/\/\/.*$/gm, '');

test('the trailer drawing code never reads randomness or the clock', () => {
  assert.ok(DRAWING.length > 1000, 'found the drawing code');
  assert.doesNotMatch(DRAWING, /Math\.random|Date\.now|new Date|performance\.now/);
});

const SHOTS = [...SRC.match(/const KSHOTS = \[([\s\S]*?)\];/)[1].matchAll(/\[([\d.]+),\s*'(\w+)'\]/g)].map(m => [Number(m[1]), m[2]]);

test('the trailer has 13 shots in order, each drawn, with an end card of 3 s or more', () => {
  assert.equal(SHOTS.length, 13);
  assert.equal(SHOTS[0][0], 0);
  for (let i = 1; i < SHOTS.length; i++) assert.ok(SHOTS[i][0] > SHOTS[i - 1][0], `${SHOTS[i][1]} starts after ${SHOTS[i - 1][1]}`);
  const dur = Number(SRC.match(/DUR = (\d+)/)[1]);
  assert.equal(dur, 15);
  assert.equal(SHOTS.at(-1)[1], 'end');
  assert.ok(dur - SHOTS.at(-1)[0] >= 3, 'the end card holds for 3 s or more');
  for (const [, name] of SHOTS) assert.match(SRC, new RegExp(`\\n  ${name}\\(c, lt`), `KSHOT.${name} is drawn`);
});

test('the npm test numbers the trailer shows match the test files', () => {
  const files = fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.test.mjs'));
  const src = files.map(f => fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8').replace(/\/\/.*$/gm, '')).join('\n');
  const tests = (src.match(/^test\(/gm) || []).length, skipped = (src.match(/skip: !process\.env\.RENDER_TEST/g) || []).length;
  const shown = SRC.match(/NPM_TEST = \{ tests: (\d+), pass: (\d+), skipped: (\d+) \}/).slice(1).map(Number);
  assert.deepEqual(shown, [tests, tests - skipped, skipped]);
});

test('the score is the same every time', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-score-'));
  try {
    const cues = path.join(dir, 'cues.json');
    fs.writeFileSync(cues, JSON.stringify({ duration: 1.2, cues: [{ t: 0, k: 'hit' }, { t: 0.1, k: 'whoosh', until: 0.3 }, { t: 0.3, k: 'press' },
      { t: 0.4, k: 'chime', until: 0.6 }, { t: 0.6, k: 'mute', until: 0.7 }, { t: 0.7, k: 'tick' }, { t: 0.8, k: 'end' }] }));
    for (const n of ['a', 'b']) execFileSync('python3', [path.join(FILM, 'sound', 'trailer.py'), cues, path.join(dir, `${n}.wav`)]);
    const a = fs.readFileSync(path.join(dir, 'a.wav')), b = fs.readFileSync(path.join(dir, 'b.wav'));
    assert.ok(a.length > 48000 * 4, 'a stereo 48 kHz WAV');
    assert.ok(a.equals(b));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every trailer shot draws without errors and every cue fits', { skip: !process.env.RENDER_TEST && 'set RENDER_TEST=1 to render' }, async () => {
  const { chromium } = await import('playwright');
  const server = http.createServer((req, res) => {
    const file = path.resolve(FILM, decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1));
    if (!file.startsWith(FILM + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : 'text/javascript' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (fs.existsSync(mac) ? mac : undefined), args: ['--disable-accelerated-2d-canvas'] });
  try {
    for (const lang of ['en', 'es']) {
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${server.address().port}/trailer.html?lang=${lang}`);
      const info = await page.evaluate(() => window.boot());
      const times = SHOTS.map(([t0], i) => (t0 + (SHOTS[i + 1]?.[0] ?? info.duration)) / 2);
      for (const t of times) await page.evaluate(t => window.renderAt(t), t);
      assert.deepEqual(errors, [], `${lang}: no errors`);
      for (const c of info.cues) {
        assert.ok(c.t >= 0 && c.t < info.duration, `${lang}: ${c.k} at ${c.t} starts inside the trailer`);
        if ('until' in c) assert.ok(c.until > c.t && c.until <= info.duration, `${lang}: ${c.k} at ${c.t} ends after it starts, inside the trailer`);
      }
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
});
