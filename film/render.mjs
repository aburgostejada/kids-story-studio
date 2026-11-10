#!/usr/bin/env node
// Renders the film (comp.html) frame by frame in headless Chromium and pipes PNGs to FFmpeg.
// usage: node film/render.mjs --out out/picture.mp4 [--from S] [--to S] [--fps 30]
//        node film/render.mjs --stills 1,9.5,20 --still-dir DIR [--page lab.html --lab NAME]
//        node film/render.mjs --stills 0:135:0.5 --still-dir DIR --sheet 6x5      (every 0.5 s, plus contact sheets)
//        node film/render.mjs --page trailer.html --out out/trailer-picture.mp4 --cues out/trailer-cues.json   (the trailer;
//        add ?lang=es to the page for the Spanish cut; --cues writes the trailer's sound cues for film/sound/trailer.py)
// --no-mblur draws the page with its motion blur off (comp.html and lab.html read ?mblur=0); by default a scene's grade.mblur is drawn.
// --stills takes times in seconds, comma-separated, or FROM:TO:STEP (TO excluded). --sheet COLSxROWS also tiles the
// stills, labelled with their times, into DIR/sheet-01.png, sheet-02.png... (--sheet-width W sets one tile, default 320).
// Needs Node 20+ and the `playwright` package; the video also needs FFmpeg with libx264 on PATH. CHROME_PATH optionally
// points at an installed Chrome. Everything is drawn by code; the only files written are the requested outputs.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]), a), []));
const fps = Number(args.fps || 30);
const { chromium } = createRequire(import.meta.url)(args.playwright || process.env.PLAYWRIGHT_MODULE || 'playwright');
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.CHROME_PATH || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const file = path.resolve(HERE, u.slice(1));
  if (!file.startsWith(HERE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

// The 2D canvas runs in software: Chromium's GPU canvas can round blurs a level differently from run to run, and every frame
// must come out identical however often it is rendered.
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb', '--disable-accelerated-2d-canvas'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  // --no-mblur turns the page's motion blur off (the page reads ?mblur=0), for before-and-after comparisons.
  const pageUrl = `${args.page || 'comp.html'}${args['no-mblur'] ? (String(args.page || '').includes('?') ? '&' : '?') + 'mblur=0' : ''}`;
  await page.goto(`${origin}/${pageUrl}`, { waitUntil: 'load' });
  const info = await page.evaluate(n => window.boot(n), args.lab || null);
  if (errors.length) throw new Error(errors.join('\n'));
  if (typeof args.cues === 'string') {
    if (!info.cues) throw new Error('--cues: this page has no sound cues');
    fs.mkdirSync(path.dirname(path.resolve(args.cues)), { recursive: true });
    fs.writeFileSync(args.cues, JSON.stringify({ duration: info.duration, cues: info.cues }, null, 1));
  }
  const grab = t => page.evaluate(t => { window.renderAt(t); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, t);

  if (args.stills) {
    const dir = typeof args['still-dir'] === 'string' ? args['still-dir'] : 'out/stills'; fs.mkdirSync(dir, { recursive: true });
    const spec = String(args.stills), range = spec.split(':').map(Number);
    const times = range.length === 3 ? Array.from({ length: Math.max(0, Math.ceil((range[1] - range[0]) / range[2] - 1e-9)) }, (_, i) => +(range[0] + i * range[2]).toFixed(4))
      : spec.split(',').filter(x => x.trim() !== '').map(Number);
    if (!times.length || times.some(x => !Number.isFinite(x))) throw new Error(`--stills: expected times like 1,9.5,20 or 0:135:0.5, got ${spec}`);
    const [cols, rows] = args.sheet ? String(args.sheet).split('x').map(Number) : [0, 0], per = cols * rows, tileW = Number(args['sheet-width'] || 320);
    if (args.sheet && !(per > 0)) throw new Error(`--sheet: expected COLSxROWS like 6x5, got ${args.sheet}`);
    for (const [i, s] of times.entries()) {
      fs.writeFileSync(path.join(dir, `still-${s.toFixed(2)}.png`), Buffer.from(await grab(s), 'base64'));
      if (!per) continue;
      await page.evaluate(([k, s, cols, rows, w]) => {   // paste the frame just drawn into the contact sheet
        const cv = document.getElementById('c'), h = Math.round(w * cv.height / cv.width);
        if (k === 0) { window.sheet = Object.assign(document.createElement('canvas'), { width: cols * w, height: rows * h }); const g = window.sheet.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cols * w, rows * h); }
        const g = window.sheet.getContext('2d'), x = (k % cols) * w, y = Math.floor(k / cols) * h;
        g.drawImage(document.getElementById('c'), x, y, w, h);
        g.font = '600 15px sans-serif'; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y, 64, 22); g.fillStyle = '#fff'; g.fillText(`${s.toFixed(2)} s`, x + 6, y + 16);
      }, [i % per, s, cols, rows, tileW]);
      if (i % per === per - 1 || i === times.length - 1) {
        const file = path.join(dir, `sheet-${String(Math.floor(i / per) + 1).padStart(2, '0')}.png`);
        fs.writeFileSync(file, Buffer.from(await page.evaluate(() => window.sheet.toDataURL('image/png').split(',')[1]), 'base64'));
      }
    }
    console.log('stills', dir, times.length);
  } else {
    if (typeof args.out !== 'string') throw new Error('give --out FILE.mp4 for a video, or --stills TIMES for stills');
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    const from = Number(args.from || 0), to = Number(args.to || info.duration), n = Math.round((to - from) * fps);
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'slow',
      '-crf', '16', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', args.out], { stdio: ['pipe', 'inherit', 'inherit'] });
    let failed = null; const closed = new Promise(ok => ff.on('close', code => { if (code) failed ??= new Error(`ffmpeg exited with code ${code}`); ok(); }));
    ff.on('error', e => { failed = new Error(`could not run ffmpeg (${e.code || e.message}); install FFmpeg with libx264`); });
    ff.stdin.on('error', e => { failed ??= e; });
    const started = Date.now();
    for (let i = 0; i < n && !failed; i++) {
      const buf = Buffer.from(await grab(from + i / fps), 'base64');
      if (!ff.stdin.write(buf)) await Promise.race([new Promise(ok => ff.stdin.once('drain', ok)), closed]);
      if (i % 150 === 0) console.log(`frame ${i}/${n}`);
    }
    ff.stdin.end(); await closed;
    if (failed) throw failed;
    console.log('wrote', args.out, n, 'frames', `(${((Date.now() - started) / 1000 / Math.max(1, n)).toFixed(2)} s a frame)`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); server.close(); }
