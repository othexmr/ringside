#!/usr/bin/env node
// Render the X/Twitter graphics from site/social/cards.html into site/social/out/*.png.
//   node site/scripts/social.mjs
// Every number on the cards is computed from the snapshot by the site's own code (RS.headline, charts).
import { spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(SITE, 'social', 'out');
let pw;
try { pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
const CARDS = { hero: [1600, 900], race: [1600, 900], scatter: [1600, 900], speed: [1600, 900], square: [1080, 1080], header: [1500, 500] };

const port = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn(process.execPath, [join(SITE, 'scripts/serve.mjs'), String(port)], { stdio: 'pipe' });
await new Promise((res) => server.stdout.once('data', res));
const browser = await pw.chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
mkdirSync(OUT, { recursive: true });
try {
  for (const [name, [w, h]] of Object.entries(CARDS)) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/site/social/cards.html?card=${name}`);
    await page.waitForFunction(() => window.CARD_READY === true, null, { timeout: 20000 });
    const file = join(OUT, `ringside-${name}-${w}x${h}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h } });
    console.log(`${errors.length ? 'ERR ' + errors.join('; ') : 'ok '} ${file.split('/site/')[1]} ${(statSync(file).size / 1024).toFixed(0)} KiB`);
    await page.close();
  }
} finally { await browser.close(); server.kill(); }
