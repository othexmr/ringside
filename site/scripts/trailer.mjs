#!/usr/bin/env node
// Render the 40-second trailer from site/social/trailer.html into site/social/out/ringside-trailer-1920x1080.mp4.
//   node site/scripts/trailer.mjs            # full render (1200 frames at 30 fps, then soundtrack + mux)
//   node site/scripts/trailer.mjs --silent   # video only, no soundtrack
// Frames are drawn by trailer.html's deterministic renderAt(t); every number on them comes from the snapshot.
// The soundtrack is synthesised by scripts/soundtrack.mjs (no samples, no third-party audio).
// Needs Playwright and an ffmpeg with libx264 + aac (set FFMPEG=/path/to/ffmpeg if it is not on PATH).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(SITE, 'social', 'out');
const FILE = join(OUT, 'ringside-trailer-1920x1080.mp4');
const POSTER = join(OUT, 'ringside-trailer-poster-1920x1080.jpg');
const silent = process.argv.includes('--silent');

let pw;
try { pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }

function findFfmpeg() {
  const candidates = [process.env.FFMPEG, 'ffmpeg',
    '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2'].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    if (r.status === 0 && /libx264/.test(r.stdout) && /\baac\b/.test(r.stdout)) return c;
  }
  throw new Error('No ffmpeg with libx264 and aac found. Set FFMPEG=/path/to/ffmpeg.');
}
const FF = findFfmpeg();

const port = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn(process.execPath, [join(SITE, 'scripts/serve.mjs'), String(port)], { stdio: 'pipe' });
await new Promise((res) => server.stdout.once('data', res));
const browser = await pw.chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
const tmp = mkdtempSync(join(tmpdir(), 'ringside-trailer-'));
mkdirSync(OUT, { recursive: true });

function run(args, input) {
  return new Promise((res, rej) => {
    const p = spawn(FF, args, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}\n${err.slice(-2000)}`))));
    if (input) input(p.stdin);
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/site/social/trailer.html?t=0`);
  await page.waitForFunction(() => window.TRAILER_READY === true, null, { timeout: 20000 });
  const { fps, duration, width, height } = await page.evaluate(() => window.TRAILER);
  const frames = Math.round(fps * duration);

  // 1. frames → H.264 (canvas.toDataURL is several times faster than page screenshots)
  const video = join(tmp, 'video.mp4');
  const t0 = Date.now();
  await run(['-y', '-hide_banner', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-r', String(fps), '-g', String(fps * 2), '-movflags', '+faststart', video], async (stdin) => {
    for (let i = 0; i < frames; i++) {
      const b64 = await page.evaluate((t) => { window.renderAt(t); return document.getElementById('v').toDataURL('image/jpeg', 0.96).split(',')[1]; }, i / fps);
      const buf = Buffer.from(b64, 'base64');
      if (!stdin.write(buf)) await new Promise((r) => stdin.once('drain', r));
      if (i % 150 === 0) process.stdout.write(`  frame ${i}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
    }
    stdin.end();
  });
  console.log(`frames: ${frames} at ${fps} fps, ${width}×${height}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  // poster frame for the post preview (the "8 of 8" beat)
  await page.evaluate(() => window.renderAt(23.4));
  await page.screenshot({ path: POSTER, type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width, height } });
  if (errors.length) throw new Error('page errors: ' + errors.join('; '));

  // 2. soundtrack + mux
  if (silent) {
    await run(['-y', '-hide_banner', '-i', video, '-c', 'copy', '-movflags', '+faststart', FILE]);
  } else {
    const wav = join(tmp, 'soundtrack.wav');
    const r = spawnSync(process.execPath, [join(SITE, 'scripts/soundtrack.mjs'), wav, String(duration)], { stdio: 'inherit' });
    if (r.status !== 0 || !existsSync(wav)) throw new Error('soundtrack.mjs failed');
    await run(['-y', '-hide_banner', '-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', '-movflags', '+faststart', FILE]);
  }
  console.log(`ok ${FILE.split('/site/')[1]} ${(statSync(FILE).size / 1048576).toFixed(1)} MiB`);
  console.log(`ok ${POSTER.split('/site/')[1]} ${(statSync(POSTER).size / 1024).toFixed(0)} KiB`);
} finally {
  await browser.close(); server.kill(); rmSync(tmp, { recursive: true, force: true });
}
